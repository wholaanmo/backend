const pool = require('../../config/database');

module.exports = {
  createGroup: async (userId, groupName) => {
    let connection;
    try {
      console.log(`Creating group for user ${userId} with name ${groupName}`);
      connection = await pool.getConnection();
      console.log('Database connection established');
    
      await connection.beginTransaction();
      console.log('Transaction started');
      
      const groupCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      console.log('Generated group code:', groupCode);

      const [groupResult] = await connection.query(
        'INSERT INTO groups (group_name, group_code, created_by) VALUES (?, ?, ?)',
        [groupName, groupCode, userId]
        );
        console.log('Group inserted, ID:', groupResult.insertId);

        const groupId = groupResult.insertId;
      
        await connection.query(
          'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
          [groupId, userId, 'admin']
        );
        console.log('Admin membership created');
      
      await connection.commit();
      console.log('Transaction committed');

      return { 
        groupCode, 
        groupId 
      };
    } catch (err) {
      console.error('Create group error - rolling back:', {
        error: err,
        message: err.message,
        stack: err.stack
      });
      if (connection) await connection.rollback();
      throw new Error(err.message || 'Failed to create group');
    } finally {
      if (connection) {
        console.log('Releasing connection');
        connection.release();
      }
      console.log('Connection released');
    }
  },

  joinGroup: async (userId, groupCode) => {
    let connection; 
    try {
      connection = await pool.getConnection();
      console.log(`Checking group code: ${groupCode}`);

      const [groups] = await connection.query(
        'SELECT id FROM groups WHERE group_code = ?',
        [groupCode]
      );
      
      if (groups.length === 0) {
        throw new Error('Invalid group code');
      }
      
      const groupId = groups[0].id;
      console.log(`Found group ${groupId} for code ${groupCode}`);
      
      // Check if already a member
      const [existing] = await connection.query(
        'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );
    
      if (existing.length > 0) {
        throw new Error('You are already a member of this group');
      }
      
      await connection.query(
        'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
        [groupId, userId, 'member']
      );

      console.log(`Added user ${userId} to group ${groupId}`);
      return groupId;
    } catch (err) {
      console.error('Error in joinGroup service:', err);
      throw err;
    } finally {
      if (connection) connection.release();
    }
  },

  groupExists: async (groupId) => {
    const [rows] = await pool.query(
      'SELECT 1 FROM groups WHERE id = ? LIMIT 1',
      [groupId]
    );
    return rows.length > 0;
  },


  isGroupMember: async (userId, groupId) => {
    let connection;
    try {
      connection = await pool.getConnection();
      
      const [rows] = await connection.query(
        'SELECT id FROM group_members WHERE user_id = ? AND group_id = ?',
        [userId, groupId]
      );
      
      return rows.length > 0;
    } catch (err) {
      console.error('Error checking group membership:', err);
      throw err;
    } finally {
      if (connection) connection.release();
    }
  },
  
  // Also add this function to check for admin status
  isGroupAdmin: async (userId, groupId) => {
    let connection;
    try {
      connection = await pool.getConnection();
      
      const [rows] = await connection.query(
        'SELECT role FROM group_members WHERE user_id = ? AND group_id = ?',
        [userId, groupId]
      );
      
      return rows.length > 0 && rows[0].role === 'admin';
    } catch (err) {
      console.error('Error checking admin status:', err);
      throw err;
    } finally {
      if (connection) connection.release();
    }
  },  

  getUserGroups: async (userId) => {
    const connection = await pool.getConnection();
    try {
      const [groups] = await connection.query(`
      SELECT g.id, g.group_name, g.group_code, g.created_at 
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id 
      WHERE gm.user_id = ?
      ORDER BY g.created_at DESC
    `, [userId]);
    return groups;
  } finally {
    connection.release();
  }
}
};