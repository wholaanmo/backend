const pool = require('../../config/database');

const GroupExpenseService = {
  getExpensesByMember: async (groupId, memberId) => {
    try {
      const [results] = await pool.query(
        `SELECT 
          ge.id,
          ge.item_name,
          ge.item_price,
          ge.expense_type,
          ge.expense_date,
          ge.user_id,
          ge.group_id,
          u.username
        FROM group_expenses ge
        JOIN users u ON ge.user_id = u.id
        WHERE ge.group_id = ? AND ge.user_id = ?
        ORDER BY ge.expense_date DESC`,
        [groupId, memberId]
      );
      return results;
    } catch (err) {
      console.error('Error in getExpensesByMember:', err);
      throw err;
    }
  },
  
  getGroupExpenseById: async (expenseId) => {
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(
        'SELECT ge.*, u.username as user_name FROM group_expenses ge JOIN users u ON ge.user_id = u.id WHERE ge.id = ?',
        [expenseId]
      );
      return rows[0] || null;
    } catch (err) {
      console.error('Error fetching expense by ID:', err);
      throw new Error('Failed to fetch expense');
    } finally {
      if (connection) connection.release();
    }
  },

// Add new expense
addGroupExpense: async (expenseData) => {
  let connection;
  try {
    connection = await pool.getConnection();
    
    // Start transaction
    await connection.beginTransaction();

    // Insert expense
    const [result] = await connection.query(
      `INSERT INTO group_expenses 
      (user_id, group_id, item_name, item_price, expense_type, expense_date)
      VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        expenseData.userId,
        expenseData.group_id,
        expenseData.item_name,
        expenseData.item_price,
        expenseData.expense_type
      ]
    );

    // Get full expense details with user name
    const [expense] = await connection.query(
      `SELECT ge.*, u.username as user_name 
      FROM group_expenses ge
      JOIN users u ON ge.user_id = u.id
      WHERE ge.id = ?`,
      [result.insertId]
    );

    await connection.commit();
    return expense[0];
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Add expense error:', err);
    throw new Error('Failed to add expense');
  } finally {
    if (connection) connection.release();
  }
},

  editGroupExpense: async (expenseData) => {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.query(
        `UPDATE group_expenses SET
        item_name = ?,
        item_price = ?,
        expense_type = ?
        WHERE id = ?`,
        [
          expenseData.item_name,
          expenseData.item_price,
          expenseData.expense_type,
          expenseData.id
        ]
      );
      return await GroupExpenseService.getGroupExpenseById(expenseData.id);
    } catch (err) {
      console.error('Update expense error:', err);
      throw new Error('Failed to update expense');
    } finally {
      if (connection) connection.release();
    }
  },

  deleteGroupExpense: async (expenseId) => {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      
      const [result] = await connection.query(
        'DELETE FROM group_expenses WHERE id = ?',
        [expenseId]
      );
      
      await connection.commit();
      return result.affectedRows > 0;
    } catch (err) {
      if (connection) await connection.rollback();
      console.error('Delete expense error:', err);
      throw new Error('Failed to delete expense');
    } finally {
      if (connection) connection.release();
    }
  },

 // Get expenses for group and month
 getGroupExpenses: async (groupId, monthYear) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [year, month] = monthYear.split('-');
    const startDate = `${year}-${month}-01`;

    const [expenses] = await connection.query(
      `SELECT ge.*, u.username as user_name 
      FROM group_expenses ge
      JOIN users u ON ge.user_id = u.id
      WHERE ge.group_id = ?
      AND DATE(ge.expense_date) BETWEEN ? AND LAST_DAY(?)
      ORDER BY ge.expense_date DESC`,
      [groupId, startDate, startDate]
    );

    return expenses;
  } catch (err) {
    console.error('Get expenses error:', err);
    throw new Error('Failed to get expenses');
  } finally {
    if (connection) connection.release();
  }
},

removeMember: async (groupId, memberId) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, memberId]
    );
    return true;
  } catch (err) {
    console.error('Remove member error:', err);
    throw new Error('Failed to remove member');
  } finally {
    if (connection) connection.release();
  }
},

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

  canUserEditExpense: async (userId, expenseId) => {
    let connection;
    try {
      connection = await pool.getConnection();
      
      // Get the expense first
      const [expense] = await connection.query(
        'SELECT user_id FROM group_expenses WHERE id = ?',
        [expenseId]
      );
  
      return expense.length > 0 && expense[0].user_id === userId;
    } catch (err) {
      console.error('Check edit permission error:', err);
      throw err;
    } finally {
      if (connection) connection.release();
    }
  },

  deleteGroup: async (groupId) => {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
  
      // Delete expenses first
      await connection.query(
        'DELETE FROM group_expenses WHERE group_id = ?',
        [groupId]
      );
  
      // Then delete members
      await connection.query(
        'DELETE FROM group_members WHERE group_id = ?',
        [groupId]
      );
  
      // Finally delete the group
      const [result] = await connection.query(
        'DELETE FROM groups WHERE id = ?',
        [groupId]
      );
  
      await connection.commit();
      return result.affectedRows > 0;
    } catch (err) {
      if (connection) await connection.rollback();
      console.error('Delete group error:', err);
      throw err;
    } finally {
      if (connection) connection.release();
    }
  }
};

module.exports = GroupExpenseService;