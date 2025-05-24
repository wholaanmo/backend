const express = require('express');
const router = express.Router();
const { checkToken } = require('../../auth/token_validation');
const groupAuth = require('../../auth/groupAuth');

const {
  addGroupExpense,
  editGroupExpense,
  deleteGroupExpense,
  getGroupExpenses,
  verifyExpenseOwnership,
  removeMember,
  updateGroupName,
  deleteGroup,
  getExpensesByMember
} = require('./groupExpenses.controller');

router.use(checkToken);

router.put('/update-group/:groupId', groupAuth('admin'), updateGroupName);
router.delete('/:groupId/members/:memberId', groupAuth('admin'), removeMember);

router.post('/:groupId/expenses', groupAuth('member'), addGroupExpense);
router.get('/:groupId/expenses', groupAuth('member'), getGroupExpenses);
router.get('/:groupId/expenses/member/:memberId', groupAuth('member'), getExpensesByMember);

router.put('/:groupId/expenses/:expenseId', groupAuth('member'), verifyExpenseOwnership, editGroupExpense);

router.delete('/:groupId/expenses/:expenseId', groupAuth('member'), verifyExpenseOwnership, deleteGroupExpense);
router.delete('/delete-group/:groupId', groupAuth('admin'), deleteGroup);

module.exports = router;