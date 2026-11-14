const express = require('express');
const router = express.Router();
const {
  getAllBudgets,
  getBudgetByMonth,
  getBudgetAlertStatus,
  createBudget,
  updateBudget
} = require('../controllers/budgetsController');

router.get('/', getAllBudgets);
router.get('/alerts/:year/:month', getBudgetAlertStatus);
router.get('/:year/:month', getBudgetByMonth);
router.post('/', createBudget);
router.put('/:id', updateBudget);

module.exports = router;
