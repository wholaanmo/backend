const expenseService = require('../expenses/expenses.service');
const pool = require('../../config/database');

module.exports = {
  addExpense: async (req, res) => {
    try {
      const { item_price, expense_type, item_name, personal_budget_id } = req.body;
      const userId = req.user.userId;

      const budget = await pool.query(
        'SELECT * FROM personal_budgets WHERE id = ? AND user_id = ?',
        [personal_budget_id, userId]
      );
      
      if (!budget.length) {
        return res.status(400).json({
          success: 0,
          message: "Invalid budget specified"
        });
      }

      if (!item_price || !expense_type || !item_name) {
        return res.status(400).json({
          success: 0,
          message: "Missing required fields"
        });
      }

      const [result] = await pool.query(
        'INSERT INTO expenses (userId, personal_budget_id, expense_type, item_name, item_price, expense_date) VALUES (?, ?, ?, ?, ?, NOW())',
        [userId, personal_budget_id, expense_type, item_name, item_price]
      );

      const [newExpense] = await pool.query(
        'SELECT * FROM expenses WHERE id = ?',
        [result.insertId]
      );
      
      return res.status(200).json({
        success: 1,
        message: "Expense added successfully",
        data: {
          id: result.insertId,
          userId,
          personal_budget_id,
          expense_type,
          item_name,
          item_price,
          expense_date: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error("Add expense error:", err);
      return res.status(500).json({
        success: 0,
        message: err.message || "Database error"
      });
    }
  },

  editExpense: async (req, res) => {
    try {
      const { item_price, expense_type, item_name } = req.body;
      const userId = req.user.userId;
      const id = req.params.id;

      if (!item_price || !expense_type || !item_name) {
        return res.status(400).json({
          success: 0,
          message: "Missing required fields"
        });
      }

      await expenseService.editExpense({
        id, 
        userId, 
        item_price, 
        expense_type, 
        item_name
      });

      return res.json({
        success: 1,
        message: "Expense updated successfully"
      });
    } catch (err) {
      let message = "Database error";
      if (err.message === "Expense not found or unauthorized") {
        message = err.message;
      }
      console.error("Edit expense error:", err);
      return res.status(500).json({
        success: 0,
        message: message
      });
    }
  },

  deleteExpense: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      await expenseService.deleteExpense(id, userId);

      return res.json({
        success: 1,
        message: "Expense deleted successfully"
      });
    } catch (err) {
      console.error("Delete expense error:", err);
      return res.status(500).json({
        success: 0,
        message: err.message || "Database error"
      });
    }
  },

  getExpenses: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { monthYear } = req.query;
  
      let query = `
        SELECT e.*, pb.month_year 
        FROM expenses e
        LEFT JOIN personal_budgets pb ON e.personal_budget_id = pb.id
        WHERE e.userId = ?
      `;
      
      const params = [userId];
      
      if (monthYear) {
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
          return res.status(400).json({
            success: 0,
            message: "Invalid monthYear format. Use YYYY-MM"
          });
        }
  
        const [year, month] = monthYear.split('-');
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      
      query += ` AND (pb.month_year = ? OR (e.expense_date >= ? AND e.expense_date <= ?))`;
      params.push(monthYear, startDate, endDate);
    }

    query += ` ORDER BY e.expense_date DESC`;

    const [expenses] = await pool.query(query, params);

    return res.json({
      success: 1,
      data: expenses
    });
  } catch (err) {
    console.error("Get expenses error:", err);
    return res.status(500).json({
      success: 0,
      message: "Failed to get expenses",
      error: err.message
    });
  }
}
};