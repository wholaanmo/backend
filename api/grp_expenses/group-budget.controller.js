const groupBudgetService = require('../grp_expenses/group-budget.service');

module.exports = {
  addBudget: async (req, res) => {
    try {
      const { budget_amount, budget_name } = req.body;
      const groupId = parseInt(req.params.groupId);
      const userId = req.user.userId;
      
      if (isNaN(groupId)) {
        return res.status(400).json({
          success: 0,
          message: "Invalid group ID"
        });
      }
  
      const amount = parseFloat(budget_amount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({
          success: 0,
          message: "Budget amount must be positive"
        });
      }
  
      const result = await groupBudgetService.addBudget({
        groupId,
        userId,
        budgetAmount: parseFloat(budget_amount),
        budgetName: budget_name || 'Group Budget'
      });

      return res.json({
        success: 1,
        message: "Budget added successfully",
        data: result
      });
    } catch (err) {
      console.error("Error adding budget:", err);
      return res.status(500).json({
        success: 0,
        message: err.message || "Database error"
      });
    }
  },

  updateBudget: async (req, res) => {
    try {
      const groupId = parseInt(req.params.groupId, 10);
      const { budget_amount, budget_name } = req.body;
  
      if (isNaN(groupId)) {
        return res.status(400).json({
          success: 0,
          message: "Invalid group ID"
        });
      }
  
      const amount = parseFloat(budget_amount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({
          success: 0,
          message: "Budget amount must be positive"
        });
      }
  
      const result = await groupBudgetService.updateBudget({
        groupId,
        budgetAmount: amount,
        budgetName: budget_name || 'Group Budget'
      });
  
      return res.json({
        success: 1,
        message: "Budget updated successfully",
        data: result
      });
    } catch (err) {
      console.error("Error updating budget:", err);
      return res.status(500).json({
        success: 0,
        message: "Failed to update budget"
      });
    }
  },

getBudget: async (req, res) => {
  try {
    const budget = await groupBudgetService.getBudgetByGroupId(req.params.groupId);
    
    if (!budget) {
      return res.status(200).json({ 
        success: 1,
        data: null,
        message: "No budget found for this group"
      });
    }
    
    return res.json({
      success: 1,
      data: budget
    });
  } catch (err) {
    console.error("Error getting budget:", err);
    return res.status(500).json({
      success: 0,
      message: "Failed to get budget"
    });
  }
},

  getAllBudgets: async (req, res) => {
    try {
      const budgets = await groupBudgetService.getAllBudgets();
      return res.json({
        success: 1,
        data: budgets
      });
    } catch (err) {
      console.error("Error fetching all budgets:", err);
      return res.status(500).json({
        success: 0,
        message: "Database error"
      });
    }
  },

getBudgetsByGroup: async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    
    if (isNaN(groupId)) {
      return res.status(400).json({
        success: 0,
        message: "Invalid group ID"
      });
    }

    const budgets = await groupBudgetService.getBudgetsByGroup(groupId);

    return res.json({
      success: 1,
      data: budgets
    });
  } catch (err) {
    console.error("Error fetching group budgets:", err);
    return res.status(500).json({
      success: 0,
      message: "Database error"
    });
  }
}
};