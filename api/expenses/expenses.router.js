const express = require('express');
const router = express.Router();
const expenseController = require('./expenses.controller');
const { checkToken } = require('../../auth/token_validation');

router.post('/', checkToken, expenseController.addExpense);
router.put('/:id', checkToken, expenseController.editExpense);
router.delete('/:id', checkToken, expenseController.deleteExpense);
router.get('/', checkToken, expenseController.getExpenses);



module.exports = router;