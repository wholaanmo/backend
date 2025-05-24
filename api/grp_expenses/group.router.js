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

  router.post('/test-invite', (req, res) => {
    console.log('Test invite route hit');
    res.json({ success: true });
  });

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

    if (!groupId || !userId) {
      return res.status(400).json({
        success: 0,
        message: 'Missing groupId or userId'
      });
    }

    // Check direct membership
    const [membership] = await pool.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );

    // Check pending invites only if not already a member
    if (membership.length === 0) {
      const [user] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
      const userEmail = user[0]?.email;
      
      if (userEmail) {
        const [invites] = await pool.query(
          'SELECT id FROM pending_invites WHERE group_id = ? AND email = ? AND expires_at > NOW()',
          [groupId, userEmail]
        );
        
        return res.json({
          success: 1,
          isMember: invites.length > 0
        });
      }
    }

    return res.json({
      success: 1,
      isMember: membership.length > 0
    });
  } catch (err) {
    console.error('Verify membership error:', err);
    return res.status(500).json({
      success: 0,
      message: 'Failed to verify membership',
      error: err.message
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
      'INSERT INTO blocked_members (group_id, user_id, blocked_by, blocked_at) VALUES (?, ?, ?, NOW())',
      [groupId, memberId, adminId]
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
module.exports = router;