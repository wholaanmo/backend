const pool = require('../../config/database');

module.exports = {
  verifyConnection: async () => {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch (err) {
      console.error('Database connection failed:', err);
      return false;
    }
  },

  // Add this to your expense.service.js
async getUserPatterns(userId) {
  try {
    const [patterns] = await pool.execute(
      `SELECT item_name, expense_type 
       FROM expense_learning_data 
       WHERE userId = ? 
       ORDER BY correction_count DESC, last_updated DESC 
       LIMIT 100`,
      [userId]
    );
    
    // Convert to a dictionary for easy lookup
    return patterns.reduce((acc, {item_name, expense_type}) => {
      acc[item_name.toLowerCase()] = expense_type;
      return acc;
    }, {});
    
  } catch (error) {
    console.error('Error loading user patterns:', error);
    return null; // Return null to indicate failure
  }
},

  learnFromCorrection: async (itemName, expenseType, userId, itemPrice = null, personalBudgetId = null) => {
    try {
      console.log('Received learning data:', { 
        itemName, 
        expenseType, 
        userId, 
        itemPrice, 
        personalBudgetId 
      });

      if (!itemName || typeof itemName !== 'string') {
        throw new Error('Invalid itemName');
      }
      if (!expenseType || typeof expenseType !== 'string') {
        throw new Error('Invalid expenseType');
      }
  
      const truncatedItemName = itemName.substring(0, 100);
      const numericPrice = itemPrice ? Number(itemPrice) : null;
  
      const [dbResult] = await pool.execute(
        `INSERT INTO expense_learning_data 
         (userId, personal_budget_id, expense_type, item_name, item_price, expense_date)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          userId, 
          personalBudgetId || null, 
          expenseType,
          truncatedItemName, 
          numericPrice
        ]
      );
      
      console.log('Database insert successful:', dbResult);

      // Train classifier - wrap in try-catch as this might be failing
       let classifierResult;
        try {
            // 1. Train the classifier with this correction
            classifierResult = await ExpenseClassifier.learn(truncatedItemName, expenseType);
            
            // 2. NEW: Persist significant corrections (non-Other categories)
            if (expenseType !== 'Other') {
                await pool.execute(
                    `INSERT INTO expense_learning_data
                     (userId, item_name, expense_type)
                     VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                     expense_type = VALUES(expense_type)`,
                    [userId, truncatedItemName, expenseType]
                );
            }
            
            console.log('Classifier training successful:', classifierResult);
        } catch (classifierError) {
            console.error('Classifier training failed (non-critical):', {
                error: classifierError.message,
                stack: classifierError.stack
            });
        }

        return {
            success: true,
            insertedId: dbResult.insertId,
            classifierSuccess: !!classifierResult,
            correctionPersisted: expenseType !== 'Other' // NEW: Feedback about persistence
        };

    } catch (error) {
        console.error('Full service error:', {
            message: error.message,
            stack: error.stack,
            inputData: {
                itemName,
                expenseType,
                userId,
                itemPrice,
                personalBudgetId
            }
        });
        throw error;
    }
},
  // Add Expense
  addExpense: async (data) => {
    try {
      const [results] = await pool.execute(
        "INSERT INTO expenses (userId, item_price, expense_type, item_name, personal_budget_id) VALUES (?, ?, ?, ?, ?)",
        [data.userId, data.item_price, data.expense_type, data.item_name, data.personal_budget_id]
      );
      
      return results;
    } catch (err) {
      if (err.errno === 1452) { // Foreign key constraint
        throw new Error("The specified personal budget does not exist");
      }
      throw err;
    }
  },

  // Edit Expense
  editExpense: async (data) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
  
      // 1. First get the existing expense to access personal_budget_id
      const [existingExpense] = await connection.execute(
        "SELECT personal_budget_id FROM expenses WHERE id = ? AND userId = ?",
        [data.id, data.userId]
      );
  
      if (existingExpense.length === 0) {
        throw new Error("Expense not found or unauthorized");
      }
  
      const personal_budget_id = existingExpense[0].personal_budget_id;
  
      // 2. Update the expenses table
      const [expenseResults] = await connection.execute(
        "UPDATE expenses SET item_price = ?, expense_type = ?, item_name = ? WHERE id = ? AND userId = ?",
        [data.item_price, data.expense_type, data.item_name, data.id, data.userId]
      );
      
      if (expenseResults.affectedRows === 0) {
        throw new Error("Expense not found or unauthorized");
      }
  
      // 3. Update or insert into expense_learning_data table
      await connection.execute(
        `INSERT INTO expense_learning_data 
         (userId, item_name, expense_type, item_price, personal_budget_id) 
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         expense_type = VALUES(expense_type),
         item_price = VALUES(item_price),
         personal_budget_id = VALUES(personal_budget_id)`,
        [data.userId, data.item_name, data.expense_type, data.item_price, personal_budget_id]
      );
  
      await connection.commit();
      return expenseResults;
    } catch (err) {
      await connection.rollback();
      console.error('Error in editExpense:', {
        message: err.message,
        stack: err.stack,
        inputData: data
      });
      throw new Error(err.message || 'Database error');
    } finally {
      connection.release();
    }
  },

  // Delete Expense
  deleteExpense: async (id, userId) => {
    try {
      const [results] = await pool.execute(
        "DELETE FROM expenses WHERE id = ? AND userId = ?",
        [id, userId]
      );
      
      if (results.affectedRows === 0) {
        throw new Error("Expense not found or unauthorized");
      }
      return results;
    } catch (err) {
      throw err;
    }
  },
  
  getExpensesByUser: async (userId) => {
    try {
      const [results] = await pool.execute(
        "SELECT id, item_price, expense_type, item_name, expense_date FROM expenses WHERE userId = ?",
        [userId]
      );
      return results;
    } catch (err) {
      throw err;
    }
  },
  
  getExpensesByUserAndMonth: async (userId, monthYear) => {
    try {
      // Parse the monthYear (format: "YYYY-MM")
      const [year, month] = monthYear.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1); // First day of next month
      
      const [results] = await pool.execute(
        `SELECT id, item_price, expense_type, item_name, expense_date 
         FROM expenses 
         WHERE userId = ? 
         AND expense_date >= ? 
         AND expense_date < ?`,
        [userId, startDate, endDate]
      );
      
      return results;
    } catch (err) {
      throw err;
    }
  }
};