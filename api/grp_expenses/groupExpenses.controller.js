const groupExpenseService = require('../grp_expenses/groupExpenses.service');
const groupService = require('../grp_expenses/group.service');
const pool = require('../../config/database');


exports.getExpensesByMember = async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const memberId = req.params.memberId;
    
    const expenses = await groupExpenseService.getExpensesByMember(groupId, memberId);
    
    return res.json({
      success: 1,
      data: expenses
    });
  } catch (err) {
    console.error('Error fetching member expenses:', err);
    return res.status(500).json({
      success: 0,
      message: 'Failed to fetch member expenses'
    });
  }
};

  exports.addGroupExpense = async (req, res) => {
    try {
      const { item_price, expense_type, item_name, note } = req.body;
      const userId = req.user.userId;
      const groupId = req.params.groupId;
  
      // Validate required fields
      if (!item_price || !expense_type || !item_name) {
        return res.status(400).json({
          success: 0,
          message: "Missing required fields (item_price, expense_type, item_name)"
        });
      }
  
      // Verify user is a member of the group
      const isMember = await groupService.isGroupMember(userId, groupId);
      if (!isMember) {
        return res.status(403).json({
          success: 0,
          message: "You are not a member of this group"
        });
      }
  
      // Add the expense
      const expense = await groupExpenseService.addGroupExpense({
        userId,
        group_id: groupId,
        item_price,
        expense_type,
        item_name,
        note
      });
  
      return res.status(200).json({
        success: 1,
        message: "Group expense added successfully",
        data: expense
      });
    } catch (err) {
      console.error("Add group expense error:", err);
      return res.status(500).json({
        success: 0,
        message: err.message || "Failed to add expense"
      });
    }
  };

  // Edit an existing group expense
  exports.editGroupExpense = async (req, res) => {
    try {
      const { item_price, expense_type, item_name, note } = req.body;
      const { groupId, expenseId } = req.params;
      const userId = req.user.userId;
      const expense = await groupExpenseService.getGroupExpenseById(expenseId);
      if (!expense || expense.user_id !== userId) {
        return res.status(403).json({
          success: 0,
          message: "You don't have permission to edit this expense"
        });
      }

        const updatedExpense = await groupExpenseService.editGroupExpense({
            id: expenseId,
            group_id: groupId,
            item_price,
            expense_type,
            item_name,
            note: note
        });

        return res.json({
            success: 1,
            message: "Expense updated successfully",
            data: updatedExpense
        });
    } catch (err) {
        console.error("Edit group expense error:", err);
        return res.status(500).json({
            success: 0,
            message: err.message || "Failed to update expense"
        });
    }
};

exports.deleteGroupExpense = async (req, res) => {
  try {
    const { expenseId, groupId } = req.params;
    const userId = req.user.userId;

    const expense = await groupExpenseService.getGroupExpenseById(expenseId);
    if (!expense || expense.user_id !== userId) {
      return res.status(403).json({
        success: 0,
        message: "You don't have permission to delete this expense"
      });
    }

    const result = await groupExpenseService.deleteGroupExpense(expenseId);
    
    if (!result) {
      return res.status(404).json({
        success: 0,
        message: "Expense not found"
      });
    }
    
    return res.json({
      success: 1,
      message: "Expense deleted successfully"
    });
  } catch (err) {
    console.error("Delete error:", err);
    return res.status(500).json({
      success: 0,
      message: err.message || "Deletion failed"
    });
  }
};

  // Get expenses for a specific group
  exports.getGroupExpenses = async (req, res) => {
    try {
      const groupId = req.params.groupId;
      if (!groupId) {
        return res.status(400).json({ success: 0, message: "Group ID is required" });
      }
      const monthYear = req.query.monthYear || 
        `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      
      const [year, month] = monthYear.split('-');
      const startDate = `${year}-${month}-01`;
  
      const [expenses] = await pool.query(
        `SELECT 
          ge.id,
          ge.item_name,
          ge.item_price,
          ge.expense_type,
          ge.expense_date,  
          ge.note,
          ge.user_id,
          ge.group_id,
          u.username
        FROM group_expenses ge
        JOIN users u ON ge.user_id = u.id
        WHERE ge.group_id = ?
        AND DATE(ge.expense_date) BETWEEN ? AND LAST_DAY(?)
        ORDER BY ge.expense_date DESC`,
        [groupId, startDate, startDate]
      );
  
      return res.json({
        success: 1,
        data: expenses || []
      });
    } catch (err) {
      console.error("Get expenses error:", err);
      return res.status(500).json({
        success: 0,
        message: "Failed to get expenses"
      });
    }
  };

exports.removeMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user.userId;

    const [membership] = await pool.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );
    
    if (membership.length === 0 || (membership[0].role !== 'admin')) {
      return res.status(403).json({
        success: 0,
        message: "Admin access required"
      });
    }

    // Prevent removing yourself
    if (parseInt(memberId) === parseInt(userId)) {
      return res.status(400).json({
        success: 0,
        message: "You cannot remove yourself"
      });
    }

    // Remove the member directly since we already verified admin status
    await pool.query(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, memberId]
    );
    
    return res.json({
      success: 1,
      message: "Member removed successfully"
    });
  } catch (err) {
    console.error("Remove member error:", err);
    return res.status(500).json({
      success: 0,
      message: err.message || "Failed to remove member"
    });
  }
};

exports.updateGroupName = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name } = req.body;
    const userId = req.user.userId;

    // Check if user is an admin
    const isAdmin = await groupService.isGroupAdmin(userId, groupId);
    if (!isAdmin) {
      return res.status(403).json({ 
        success: 0, 
        message: "Only admins can update the group name" 
      });
    }

    // Update in database
    const [result] = await pool.query(
      'UPDATE groups SET group_name = ? WHERE id = ?',
      [name, groupId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: 0, message: "Group not found" });
    }

    res.json({ success: 1, message: "Group name updated" });
  } catch (err) {
    res.status(500).json({ success: 0, message: err.message });
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.userId;

    // Check if user is an admin
    const isAdmin = await groupService.isGroupAdmin(userId, groupId);
    if (!isAdmin) {
      return res.status(403).json({ 
        success: 0, 
        message: "Only admins can delete the group" 
      });
    }

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // First delete all expenses for this group
      await connection.query(
        'DELETE FROM group_expenses WHERE group_id = ?',
        [groupId]
      );

      // Then delete all members
      await connection.query(
        'DELETE FROM group_members WHERE group_id = ?',
        [groupId]
      );

      // Finally delete the group itself
      const [result] = await connection.query(
        'DELETE FROM groups WHERE id = ?',
        [groupId]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ success: 0, message: "Group not found" });
      }

      await connection.commit();
      res.json({ success: 1, message: "Group deleted successfully" });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ success: 0, message: err.message });
  }
};

exports.verifyExpenseOwnership = async (req, res, next) => {
  try {
    const expenseId = req.params.expenseId || req.params.id;
    const userId = req.user.userId;
    
    const expense = await groupExpenseService.getGroupExpenseById(expenseId);
    
    if (!expense) {
      return res.status(404).json({
        success: 0,
        message: "Expense not found"
      });
    }
    
    // Check permissions
    const isCreator = expense.user_id == userId;  
    const isAdmin = await groupService.isGroupAdmin(userId, expense.group_id);
    
    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: 0,
        message: "Unauthorized to modify this expense"
      });
    }
    
    req.expense = expense;
    next();
  } catch (err) {
    console.error("Ownership verification error:", err);
    return res.status(500).json({
      success: 0,
      message: "Internal server error"
    });
  }
};