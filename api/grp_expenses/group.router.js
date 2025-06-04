const express = require('express');
const router = express.Router();
const groupController = require('./group.controller');
const { checkToken } = require('../../auth/token_validation');
const groupAuth = require('../../auth/groupAuth');
const pool = require('../../config/database');

router.use((req, res, next) => {
    console.log(`Incoming ${req.method} request to: ${req.originalUrl}`);
    next();
  });

  router.get('/user-notifications', checkToken, async (req, res) => {
    let connection;
    try {
      const userId = req.user.userId;

      if (!userId) {
        return res.status(401).json({ 
          success: 0, 
          message: 'Unauthorized' 
        });
      }
      
      connection = await pool.getConnection();

    const [blocked] = await connection.query(
      `SELECT 
        b.id,
        g.id as group_id,
        g.group_name as groupName,
        'blocked' as type,
        b.blocked_at as timestamp,
        b.reason,
        u.username as admin_name,
        a.username as blocked_by_name
       FROM blocked_members b
       JOIN \`groups\` g ON b.group_id = g.id
       JOIN users u ON b.user_id = u.id
       JOIN users a ON b.blocked_by = a.id
       WHERE b.user_id = ? AND b.notification_read = 0
       ORDER BY b.blocked_at DESC`,
      [userId]
    );

    const [removed] = await connection.query(
      `SELECT 
        r.id,
        g.id as group_id,
        g.group_name as groupName,
        'removed' as type,
        r.removed_at as timestamp,
        r.reason,
        u.username as admin_name,
        a.username as removed_by_name
       FROM member_removals r
       JOIN \`groups\` g ON r.group_id = g.id
       JOIN users u ON r.user_id = u.id
       JOIN users a ON r.removed_by = a.id
       WHERE r.user_id = ? AND r.notification_read = 0
       ORDER BY r.removed_at DESC`,
      [userId]
    );

    return res.json({
      success: 1,
      notifications: [...blocked, ...removed]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    return res.status(500).json({
      success: 0,
      message: "Failed to get notifications",
      error: err.message
    });
  } finally {
    if (connection) connection.release();
  }
});

  router.post('/test-invite', (req, res) => {
    console.log('Test invite route hit');
    res.json({ success: true });
  });

  router.get('/:groupId/requests', checkToken, groupAuth('admin'), groupController.getPendingRequests);
router.put('/:groupId/requests/:requestId/approve', checkToken, groupAuth('admin'), groupController.approveRequest);
router.put('/:groupId/requests/:requestId/reject', checkToken, groupAuth('admin'), groupController.rejectRequest);
router.post('/create', checkToken, groupController.createGroup);
router.post('/join', checkToken, groupController.joinGroup);
router.get('/my-groups', checkToken, groupController.getUserGroups);

// Group-specific routes (require membership)
router.get('/:groupId', checkToken, groupAuth('member'), groupController.getGroupInfo);
router.get('/:groupId/members', checkToken, groupAuth('member'), groupController.getMembers);

// Admin-only routes
router.delete('/:groupId', checkToken, groupAuth('admin'), groupController.deleteGroup);

router.post('/:groupId/members/invite', checkToken, (req, res, next) => {
    console.log('Invite route hit - params:', req.params);
    console.log('Invite route hit - body:', req.body);
    next();
  }, groupController.inviteMember);

router.get('/invite/accept', groupController.acceptInvite);
router.get('/pending-invites', checkToken, groupController.getPendingInvites);

// group.router.js
router.get('/:groupId/verify-membership', checkToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.userId;

    // Check member status
    const [membership] = await pool.query(
      'SELECT role, status FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );

    // Check pending requests if not a member
    const [pendingRequest] = await pool.query(
      'SELECT id FROM group_join_requests WHERE group_id = ? AND user_id = ? AND status = "pending"',
      [groupId, userId]
    );

    return res.json({
      success: 1,
      isMember: membership.length > 0,
      role: membership[0]?.role || null,
      status: membership[0]?.status || null,
      hasPendingRequest: pendingRequest.length > 0
    });
  } catch (err) {
    console.error('Verify membership error:', err);
    return res.status(500).json({
      success: 0,
      message: 'Failed to verify membership'
    });
  }
});

router.post('/groups/:groupId/members/:memberId/block', 
checkToken,
groupAuth('admin'),
async (req, res) => {
  let connection;
  try {
    const { groupId, memberId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.userId;

    connection = await pool.getConnection();
    await connection.query('START TRANSACTION');

    // Verify admin isn't trying to block themselves
    if (memberId == adminId) {
      await connection.query('ROLLBACK');
      return res.status(400).json({
        success: 0,
        message: "You cannot block yourself"
      });
    }

    // Verify member exists in group
    const [member] = await connection.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, memberId]
    );

    if (!member.length) {
      await connection.query('ROLLBACK');
      return res.status(404).json({
        success: 0,
        message: "Member not found in this group"
      });
    }

    // Prevent blocking other admins
    if (member[0].role === 'admin') {
      await connection.query('ROLLBACK');
      return res.status(400).json({
        success: 0,
        message: "Cannot block other admins"
      });
    }

    // Remove member from group
    await connection.query(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, memberId]
    );

    // Add to blocked members table
    await connection.query(
      'INSERT INTO blocked_members (group_id, user_id, blocked_by, blocked_at, reason) VALUES (?, ?, ?, NOW(), ?)',
      [groupId, memberId, adminId, reason || null]
    );

    await connection.query('COMMIT');

    return res.json({
      success: 1,
      message: "Member blocked successfully"
    });
  } catch (err) {
    if (connection) await connection.query('ROLLBACK');
    console.error('Block member error:', err);
    return res.status(500).json({
      success: 0,
      message: "Failed to block member"
    });
  } finally {
    if (connection) connection.release();
  }
}
);

// Unblock a member
router.post('/groups/:groupId/members/:memberId/unblock', 
checkToken,
groupAuth('admin'),
async (req, res) => {
  let connection;
  try {
    const { groupId, memberId } = req.params;

    connection = await pool.getConnection();
    await connection.query('START TRANSACTION');

    // Verify member is blocked
    const [blocked] = await connection.query(
      'SELECT 1 FROM blocked_members WHERE group_id = ? AND user_id = ?',
      [groupId, memberId]
    );

    if (!blocked.length) {
      await connection.query('ROLLBACK');
      return res.status(404).json({
        success: 0,
        message: "Member is not blocked"
      });
    }

    // Remove from blocked members table
    await connection.query(
      'DELETE FROM blocked_members WHERE group_id = ? AND user_id = ?',
      [groupId, memberId]
    );

    await connection.query('COMMIT');

    return res.json({
      success: 1,
      message: "Member unblocked successfully"
    });
  } catch (err) {
    if (connection) await connection.query('ROLLBACK');
    console.error('Unblock member error:', err);
    return res.status(500).json({
      success: 0,
      message: "Failed to unblock member"
    });
  } finally {
    if (connection) connection.release();
  }
}
);

// Get blocked members
router.get('/groups/:groupId/blocked-members',
checkToken,
groupAuth('admin'),
async (req, res) => {
  try {
    const { groupId } = req.params;

    const [blockedMembers] = await pool.query(
      `SELECT 
        b.user_id as id,
        u.username,
        u.email,
        b.blocked_at,
        a.username as blocked_by
       FROM blocked_members b
       JOIN users u ON b.user_id = u.id
       JOIN users a ON b.blocked_by = a.id
       WHERE b.group_id = ?
       ORDER BY b.blocked_at DESC`,
      [groupId]
    );

    return res.json({
      success: 1,
      blockedMembers
    });
  } catch (err) {
    console.error('Get blocked members error:', err);
    return res.status(500).json({
      success: 0,
      message: "Failed to get blocked members"
    });
  }
}
);

router.post('/:groupId/members/:memberId/remove', 
checkToken,
groupAuth('admin'),
async (req, res) => {
  let connection;
  try {
    const { groupId, memberId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.userId;

    connection = await pool.getConnection();
    await connection.query('START TRANSACTION');

    // Verify member exists in group
    const [member] = await connection.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, memberId]
    );

    if (!member.length) {
      await connection.query('ROLLBACK');
      return res.status(404).json({
        success: 0,
        message: "Member not found in this group"
      });
    }

    // Prevent removing other admins
    if (member[0].role === 'admin' && memberId != adminId) {
      await connection.query('ROLLBACK');
      return res.status(400).json({
        success: 0,
        message: "Cannot remove other admins"
      });
    }

    // Add to removal log (create this table if it doesn't exist)
    await connection.query(
      'INSERT INTO member_removals (group_id, user_id, removed_by, removed_at, reason) VALUES (?, ?, ?, NOW(), ?)',
      [groupId, memberId, adminId, reason || null]
    );

    // Remove member from group
    await connection.query(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, memberId]
    );

    await connection.query('COMMIT');

    return res.json({
      success: 1,
      message: "Member removed successfully"
    });
  } catch (err) {
    if (connection) await connection.query('ROLLBACK');
    console.error('Remove member error:', err);
    return res.status(500).json({
      success: 0,
      message: "Failed to remove member"
    });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/groups/check-blocked/:groupCode',
checkToken,
async (req, res) => {
  try {
    const { groupCode } = req.params;
    const userId = req.user.userId;

    // First get group ID from code
    const [group] = await pool.query(
      'SELECT id FROM `groups` WHERE group_code = ?',
      [groupCode]
    );

    if (!group.length) {
      return res.status(404).json({
        success: 0,
        message: "Group not found"
      });
    }

    const groupId = group[0].id;

    // Check if user is blocked
    const [blocked] = await pool.query(
      'SELECT reason FROM blocked_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );

    return res.json({
      success: 1,
      isBlocked: blocked.length > 0,
      reason: blocked[0]?.reason || null
    });
  } catch (err) {
    console.error('Check blocked error:', err);
    return res.status(500).json({
      success: 0,
      message: "Failed to check blocked status"
    });
  }
});

// Dismiss notification
router.delete('/notifications/:id', checkToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Try to update in blocked_members first
    const [blockedResult] = await pool.query(
      'UPDATE blocked_members SET notification_read = 1 WHERE id = ?',
      [id]
    );

    // If not found in blocked_members, try member_removals
    if (blockedResult.affectedRows === 0) {
      await pool.query(
        'UPDATE member_removals SET notification_read = 1 WHERE id = ?',
        [id]
      );
    }

    return res.json({
      success: 1,
      message: "Notification dismissed"
    });
  } catch (err) {
    console.error('Dismiss notification error:', err);
    return res.status(500).json({
      success: 0,
      message: "Failed to dismiss notification"
    });
  }
});
module.exports = router;