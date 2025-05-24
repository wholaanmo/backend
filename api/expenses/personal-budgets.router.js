const express = require('express');
const router = express.Router();
const personal_budgetController = require('./personal-budgets.controller');
const { checkToken } = require('../../auth/token_validation');


router.post('/', checkToken, personal_budgetController.addBudget)
router.get('/', checkToken, personal_budgetController.getBudgets);
router.put('/:id', checkToken, personal_budgetController.updateBudget);
router.get('/month/:month_year', checkToken, personal_budgetController.getBudgetByMonth);

module.exports = router;