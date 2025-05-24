const pool = require('../../config/database');

module.exports = {
  addBudget: async (data) => {
    try {
      const [results] = await pool.query(
        `INSERT INTO personal_budgets 
         (user_id, month_year, budget_amount, created_at) 
         VALUES (?, ?, ?, NOW())`,
        [data.userId, data.month_year, data.budget_amount]
      );
      return results;
    } catch (err) {
      throw err;
    }
  },

  updateBudget: async (data) => {
    try {
      const [results] = await pool.query(
        `UPDATE personal_budgets 
         SET 
           month_year = ?,
           budget_amount = ?,
           updated_at = NOW()
         WHERE 
           id = ? 
           AND user_id = ?`,
        [data.month_year, data.budget_amount, data.id, data.userId]
      );
      return results;
    } catch (err) {
      throw err;
    }
  },
  
  getBudgetById: async (id) => {
    try {
      const [results] = await pool.query(
        `SELECT * FROM personal_budgets WHERE id = ?`,
        [id]
      );
      return results[0];
    } catch (err) {
      throw err;
    }
  },

  deleteBudget: async (userId, month_year) => {
    try {
      const [results] = await pool.query(
        `DELETE FROM personal_budgets 
         WHERE user_id = ? AND month_year = ?`,
        [userId, month_year]
      );
      return results;
    } catch (err) {
      throw err;
    }
  },

  checkBudgetExists: async (userId, month_year) => {
    try {
      const [results] = await pool.query(
        `SELECT id FROM personal_budgets 
         WHERE user_id = ? AND month_year = ?`,
        [userId, month_year]
      );
      return results.length > 0;
    } catch (err) {
      throw err;
    }
  },

  getBudgetsByUser: async (userId) => {
    try {
      const [results] = await pool.query(
        `SELECT id, month_year, budget_amount 
         FROM personal_budgets 
         WHERE user_id = ? 
         ORDER BY month_year DESC`,
        [userId]
      );
      return results;
    } catch (err) {
      throw err;
    }
  },
  getBudgetByMonth: async (userId, month_year) => {
    try {
      const [results] = await pool.query(
        `SELECT * FROM personal_budgets 
         WHERE user_id = ? AND month_year = ?`,
        [userId, month_year]
      );
      return results[0] || null;
    } catch (err) {
      console.error('Error in getBudgetByMonth service:', err);
      throw err;
    }
  }
};