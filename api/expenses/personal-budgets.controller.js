const budgetService = require('../expenses/personal-budgets.service');

module.exports = {
  addBudget: async (req, res) => {
    try {
      const { month_year, budget_amount } = req.body;
      const userId = req.user.userId;

      if (!month_year || !budget_amount) {
        return res.status(400).json({
          success: 0,
          message: "Month and budget amount are required"
        });
      }

      // Check if budget already exists
      const exists = await budgetService.checkBudgetExists(userId, month_year);
      
      if (exists) {
        return res.status(409).json({
          success: 0,
          message: "You can only add one budget per month. Try updating it instead."
        });
      }

      const results = await budgetService.addBudget({ userId, month_year, budget_amount });
      
      return res.json({
        success: 1,
        message: "Budget set successfully",
        data: results
      });
    } catch (err) {
      return res.status(500).json({
        success: 0,
        message: err.message || "Database error"
      });
    }
  },

  updateBudget: async (req, res) => {
    try {
      const { id } = req.params; // Gets ID from URL
      const { month_year, budget_amount } = req.body;
      const userId = req.user.userId;
      console.log(`Updating budget ID: ${id}`); 
  
      // First get the current budget to check if month is being changed
      const currentBudget = await budgetService.getBudgetById(id);
      
      if (month_year !== currentBudget.month_year) {
        const exists = await budgetService.checkBudgetExists(userId, month_year);
        if (exists) {
          return res.status(409).json({
            success: 0,
            message: "The selected month already has a budget"
          });
        }
      }
  
      const results = await budgetService.updateBudget({
        id,
        userId,
        month_year,
        budget_amount
      });
  
      if (results.affectedRows === 0) {
        return res.status(404).json({
          success: 0,
          message: `Budget not found`
        });
      }
  
      return res.json({
        success: 1,
        message: "Budget updated successfully",
        data: results
      });
    } catch (err) {
      return res.status(500).json({
        success: 0,
        message: err.message || "Database error occurred"
      });
    }
  },

  getBudgets: async (req, res) => {
    try {
      const userId = req.user.userId;
      const { year } = req.query;
  
      const results = await budgetService.getBudgetsByUser(userId, year);
  
      return res.json({
        success: 1,
        data: results
      });
    } catch (err) {
      console.error("Get budgets error:", err);
      return res.status(500).json({
        success: 0,
        message: err.message || "Database error"
      });
    }
  },

  getBudgetByMonth: async (req, res) => {
    try {
      console.log('Received request for month:', req.params.month_year);
      console.log('Authenticated user ID:', req.user.userId);

      const { month_year } = req.params;
      const userId = req.user.userId;

      console.log(`Fetching budget for user ${userId}, month ${month_year}`);
      
      const budget = await budgetService.getBudgetByMonth(userId, month_year);
      
      return res.json({
        success: 1,
        data: budget || {
          month_year: month_year,
          budget_amount: 0
        }
      });

    } catch (err) {
      console.error('Error in getBudgetByMonth:', err);
      return res.status(500).json({
        success: 0,
        message: err.message || "Database error"
      });
    }
  }
};