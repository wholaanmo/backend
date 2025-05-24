const groupService = require('../grp_expenses/group.service');
const pool = require('../../config/database');
const crypto = require('crypto');
const { sendInvitationEmail } = require('../grp_expenses/emailService');

module.exports = {
  inviteMember: async (req, res) => {
    let connection;
    
    try {
        const { groupId } = req.params;
        const { email } = req.body;
        const inviterId = req.user.userId;
        
        connection = await pool.getConnection();
        
        // 1. Verify group exists and get group name
        const [groups] = await connection.query(
          'SELECT id, group_name, group_code, created_by FROM groups WHERE id = ?',
          [groupId]
      );
        
        if (groups.length === 0) {
            return res.status(404).json({ success: 0, message: 'Group not found' });
        }
        
        const group = groups[0];

                // 2. Check if inviter is group admin or member (if you want to allow members to invite)
                const [members] = await connection.query(
                  'SELECT user_id, role FROM group_members WHERE group_id = ? AND user_id = ?',
                  [groupId, inviterId]
                );
              
              if (members.length === 0) {
                  return res.status(403).json({ 
                      success: 0, 
                      message: 'You must be a group member to invite others' 
                  });
              }
              
              // 3. Check if user exists
              const [users] = await connection.query(
                  'SELECT id, username, email FROM users WHERE email = ?',
                  [email]
              );
      
              const userExists = users.length > 0;
              
              // 4. Check if already a member (only if user exists)
              if (userExists) {
                  const [existing] = await connection.query(
                      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
                      [groupId, users[0].id]
                  );
                  
                  if (existing.length > 0) {
                      return res.status(400).json({ 
                          success: 0, 
                          message: 'User is already a member of this group' 
                      });
                  }
              }
              
              // 5. Create invitation
              const token = crypto.randomBytes(32).toString('hex');
              const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
              await connection.query(
                  'INSERT INTO pending_invites (group_id, email, token, expires_at) VALUES (?, ?, ?, ?)',
                  [groupId, email, token, expiresAt]
              );
              
              const [inviter] = await connection.query(
                  'SELECT username FROM users WHERE id = ?',
                  [inviterId]
              );
              
              const inviterName = inviter[0].username;
              
              // Send invitation email with group code
              await sendInvitationEmail({
                  email,
                  token,
                  groupName: group.group_name,
                  groupCode: group.group_code, // Include group code
                  groupId: group.id,
                  inviterName
              });
              
              return res.json({ 
                  success: 1, 
                  message: 'Invitation sent to email',
                  data: { 
                      groupId,
                      groupCode: group.group_code,
                      userExists, 
                      userId: userExists ? users[0].id : null 
                  }
              });
          } catch (err) {
              console.error('Invite member error:', err);
              return res.status(500).json({ 
                  success: 0, 
                  message: err.message || 'Failed to process invitation',
                  error: err
              });
          } finally {
              if (connection) connection.release();
          }
      },

  createPendingInvite: async (connection, groupId, email, groupName, inviterId, res) => {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await connection.query(
        'INSERT INTO pending_invites (group_id, email, token, expires_at) VALUES (?, ?, ?, ?)',
        [groupId, email, token, expiresAt]
      );
      
      const [inviter] = await connection.query(
        'SELECT username FROM users WHERE id = ?',
        [inviterId]
      );
      const inviterName = inviter[0].username;
      
      console.log('Sending invitation with:', {
        email,
        token,
        groupName: group.group_name,
        groupId: group.id,
        inviterName
    });
      // Send invitation email
      await sendInvitationEmail({
        email,
        token,
        groupName,
        inviterName,
        groupId: group.id,
      });
      
      return res.json({ 
        success: 1, 
        message: 'Invitation sent to email' 
      });
    } catch (err) {
      throw err;
    }
  },

getPendingInvites: async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: 0,
        message: 'Email is required'
      });
    }
    
    const [invites] = await pool.query(`
      SELECT pi.*, g.group_name, u.username as inviter_name
      FROM pending_invites pi
      JOIN groups g ON pi.group_id = g.id
      JOIN users u ON g.created_by = u.id
      WHERE pi.email = ? AND pi.expires_at > NOW()
    `, [email]);
    
    res.json({
      success: 1,
      data: invites
    });
  } catch (err) {
    console.error('Get pending invites error:', err);
    res.status(500).json({
      success: 0,
      message: 'Failed to fetch pending invites'
    });
  }
},

acceptInvite: async (req, res) => {
  const { token } = req.query;
  const userId = req.user?.userId;
  
  console.log(`Processing invite for token: ${token}, user: ${userId}`);

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    // 1. Verify token and get invite + group info
    const [invites] = await connection.query(
      `SELECT pi.*, g.group_name, g.id as group_id
       FROM pending_invites pi
       JOIN groups g ON pi.group_id = g.id
       WHERE pi.token = ? AND pi.expires_at > NOW()`,
      [token]
    );
    
    if (invites.length === 0) {
      return res.status(400).json({ 
        success: 0, 
        message: 'Invalid or expired invitation' 
      });
    }
    
    const invite = invites[0];
    console.log('Found invite:', invite);
    
    // 2. Check if user is logged in
    if (!userId) {
      return res.json({
        success: 1,
        requiresAuth: true,
        message: 'Please login to accept invitation',
        data: {
          inviteToken: token,
          groupId: invite.group_id,
          groupName: invite.group_name
        }
      });
    }
    
    // 3. Verify email matches logged-in user
    const [user] = await connection.query(
      'SELECT email FROM users WHERE id = ?',
      [userId]
    );
    
    if (user.length === 0 || user[0].email !== invite.email) {
      console.log('Email mismatch:', user[0]?.email, '!=', invite.email);
      return res.status(403).json({
        success: 0,
        message: 'Invitation was sent to a different email'
      });
    }
    
    // 4. Add user to group if not already a member
    const [existing] = await connection.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
      [invite.group_id, userId]
    );
    
    if (existing.length === 0) {
      console.log('Adding user to group as member'); // Debug log
      await connection.query(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, "member")',
          [invite.group_id, userId]
      );
      console.log(`Added user ${userId} to group ${invite.group_id}`);
  } else {
      console.log('User already in group:', existing); // Debug log
  }
    
    // 5. Mark invite as accepted
    await connection.query(
      'DELETE FROM pending_invites WHERE token = ?',
      [token]
    );
    
    await connection.commit();
    
    // 6. Return success with redirect URL
    console.log('Invite processed successfully'); 
    return res.json({
      success: 1,
      message: `Joined ${invite.group_name} successfully!`,
      data: {
        groupId: invite.group_id,
        groupName: invite.group_name,
        redirectUrl: `/group/${invite.group_id}`
      }
    });
    
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Accept invite error:', err);
    return res.status(500).json({
      success: 0,
      message: 'Failed to process invitation'
    });
  } finally {
    if (connection) connection.release();
  }
},

  getUserGroups: async (req, res) => {
    let connection;
    try {
      connection = await pool.getConnection();
      const userId = req.user.userId;
      
      const [groups] = await pool.query(`
        SELECT g.*, 
          (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = ?
        ORDER BY g.created_at DESC
      `, [userId]);
  
      return res.json({
        success: 1,
        data: groups
      });
    } catch (err) {
      console.error("Get user groups error:", err);
      return res.status(500).json({
        success: 0,
        message: "Failed to fetch user groups"
      });
    } finally {
      if (connection) connection.release();
    }
  },

  createGroup: async (req, res) => {
    try {
      console.log('Create group request received:', {
        body: req.body,
        user: req.user,
        headers: req.headers
      });
      
      console.log('Authenticated user:', req.user); // Debug log
      
      if (!req.user || !req.user.userId) {
        console.error('No user in request');
        return res.status(401).json({
          success: 0,
          message: "Unauthorized"
        });
      }

      const userId = req.user.userId;
      const { name } = req.body;

      if (!name || name.length < 3) {
        return res.status(400).json({
          success: 0,
          message: "Group name must be at least 3 characters"
        });
      }

      console.log('Calling group service...');
      const { groupCode, groupId } = await groupService.createGroup(userId, name);

      console.log('Group created:', { groupCode, groupId });
      return res.json({
        success: 1,
        message: "Group created successfully",
        data: {
          groupId,
          groupCode
        }
      });
    } catch (err) {
      console.error("Create group error:", err);
      return res.status(500).json({
        success: 0,
        message: err.message || "Failed to create group"
      });
    }
  },
  
joinGroup: async (req, res) => {
  try {
    const userId = req.user.userId;
    const { groupCode } = req.body;

    // Find group by code
    const [groups] = await pool.query(
      'SELECT id FROM groups WHERE group_code = ?',
      [groupCode]
    );
    
    if (groups.length === 0) {
      return res.status(404).json({
        success: 0,
        message: "Group not found with this code"
      });
    }
    
    const groupId = groups[0].id;
    
const [isBlocked] = await pool.query(
  'SELECT 1 FROM blocked_members WHERE group_id = ? AND user_id = ?',
  [groupId, userId]
);

if (isBlocked.length > 0) {
  return res.status(403).json({
    success: 0,
    message: "You have been blocked from this group"
  });
}

    // Check if user is already a member
    const [existingMembers] = await pool.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );
    
    if (existingMembers.length > 0) {
      return res.json({
        success: 1,
        message: "You're already a member of this group",
        data: { groupId }
      });
    }
    
    // Add user as regular member
    await pool.query(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
      [groupId, userId, 'member']
    );
    
    return res.json({
      success: 1,
      message: "Successfully joined group",
      data: { groupId }
    });
  } catch (err) {
    console.error("Join group error:", err);
    return res.status(500).json({
      success: 0,
      message: "Failed to join group"
    });
  }
},

  getGroupInfo: async (req, res) => {
    let connection; 
    try {
      const { groupId } = req.params;
      connection = await pool.getConnection();
      
      const [group] = await connection.query(
        'SELECT id, group_name, group_code, created_by, created_at FROM groups WHERE id = ?',
        [groupId]
      );
      
      if (group.length === 0) {
        return res.status(404).json({ success: 0, message: 'Group not found' });
      }
      
      res.json({ success: 1, data: group[0] });
    } catch (err) {
      res.status(500).json({ success: 0, message: err.message });
    } finally {
      if (connection) connection.release();
    }
  },

  getMembers: async (req, res) => {
    let connection;  
    try {
      const { groupId } = req.params;
      connection = await pool.getConnection();
      
      const [members] = await connection.query(
        `SELECT u.id, u.username, u.email, gm.role 
         FROM group_members gm
         JOIN users u ON gm.user_id = u.id
         WHERE gm.group_id = ?`,
        [groupId]
      );
      
      res.json({ success: 1, data: members });
    } catch (err) {
      res.status(500).json({ success: 0, message: err.message });
    } finally {
      if (connection) connection.release();
    }
  },

  deleteGroup: async (req, res) => {
    let connection;     //NEWWWWWWWWWWWWWW
try {
      const { groupId } = req.params;
      connection = await pool.getConnection();
      
      await connection.beginTransaction();
      
      // Delete members first (foreign key constraint)
      await connection.query(
        'DELETE FROM group_members WHERE group_id = ?',
        [groupId]
      );
      
      // Then delete the group
      await connection.query(
        'DELETE FROM groups WHERE id = ?',
        [groupId]
      );
      
      await connection.commit();
      res.json({ success: 1, message: 'Group deleted successfully' });
    } catch (err) {
      if (connection) await connection.rollback();
      res.status(500).json({ success: 0, message: err.message });
    } finally {
      if (connection) connection.release();
    }
  },
};