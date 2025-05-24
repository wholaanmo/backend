const pool = require('../../config/database');  

module.exports = {
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
      console.error('Check admin error:', err);
      throw err;
    } finally {
      if (connection) connection.release();
    }
  },

  addBudget: async (data) => {
    try {

      const existing = await pool.query(
        'SELECT id FROM group_budgets WHERE group_id = ?',
        [data.groupId]
      );
      
      if (existing[0].length > 0) {
        throw new Error('This group already has a budget');
      }
  
      const [result] = await pool.query(
        `INSERT INTO group_budgets 
         (group_id, user_id, budget_amount, budget_name, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          data.groupId, 
          data.userId, 
          data.budgetAmount, 
          data.budgetName || 'Group Budget'
        ]
      );
      
      return result[0];
    } catch (err) {
      throw err;
    }
  },

  updateBudget: async (data) => {
    let connection;
    try {
      connection = await pool.getConnection();
      
      await connection.query(
        `UPDATE group_budgets 
         SET budget_amount = ?, budget_name = ?, updated_at = NOW()
         WHERE group_id = ?`,
        [data.budgetAmount, data.budgetName || 'Group Budget', data.groupId]
      );
      
      const [updated] = await connection.query(
        `SELECT * FROM group_budgets WHERE group_id = ?`,
        [data.groupId]
      );
      return updated[0];
    } catch (err) {
      throw err;
    } finally {
      if (connection) connection.release();
    }
  },
  
  getBudgetByGroupId: async (groupId) => {
    try {
      const [result] = await pool.query(
        'SELECT * FROM group_budgets WHERE group_id = ?',
        [groupId]
      );
      return result[0] || null;
    } catch (err) {
      console.error('Error fetching group budget:', err);
      throw err;
    }
  },

  deleteBudget: async (groupId) => {
    try {
      const [results] = await pool.query(
        `DELETE FROM group_budgets WHERE group_id = ?`,
        [groupId]
      );
      return results;
    } catch (err) {
      throw err;
    }
  },

  checkBudgetExists: async (groupId) => {
    try {
      const [results] = await pool.query(
        `SELECT id FROM group_budgets WHERE group_id = ?`,
        [groupId]
      );
      return results.length > 0;
    } catch (err) {
      throw err;
    }
  },

  getBudgetsByGroup: async (groupId) => {
    try {
      const [results] = await pool.query(
        `SELECT id, group_id, budget_amount, budget_name, created_at 
         FROM group_budgets 
         WHERE group_id = ?`,
        [groupId]
      );
      return results;
    } catch (err) {
      throw err;
    }
  },

  getAllBudgets: async () => {
    try {
      const [results] = await pool.query(
        `SELECT id, group_id, budget_amount, budget_name, created_at FROM group_budgets`
      );
      return results;
    } catch (err) {
      throw err;
    }
  }
};