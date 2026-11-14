const db = require('../config/database');

// GET /api/budgets (helper for frontend to fetch all configured budgets)
function getAllBudgets(req, res, next) {
  try {
    const budgets = db.prepare('SELECT * FROM monthly_budgets ORDER BY year DESC, month DESC').all();
    res.status(200).json({
      success: true,
      data: budgets
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/budgets/alerts/:year/:month
function getBudgetAlertStatus(req, res, next) {
  try {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);

    if (Number.isNaN(year) || year < 1900 || year > 2200) {
      return res.status(400).json({
        success: false,
        error: 'Year must be a valid 4-digit integer.'
      });
    }

    if (Number.isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        error: 'Month must be an integer between 1 and 12.'
      });
    }

    const monthPattern = `${year}-${String(month).padStart(2, '0')}%`;
    const spendRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total_spent
      FROM transactions
      WHERE type = 'expense' AND date LIKE ?
    `).get(monthPattern);

    const totalSpent = Number(Number(spendRow.total_spent || 0).toFixed(2));
    const budget = db.prepare('SELECT * FROM monthly_budgets WHERE year = ? AND month = ?').get(year, month);
    const monthlyLimit = budget ? Number(budget.amount) : 0;

    let status = 'healthy';
    let utilizationPct = 0;
    let remaining = 0;

    if (monthlyLimit <= 0) {
      status = 'unset';
    } else {
      utilizationPct = Number(((totalSpent / monthlyLimit) * 100).toFixed(1));
      remaining = Number((monthlyLimit - totalSpent).toFixed(2));
      if (totalSpent > monthlyLimit) {
        status = 'exceeded';
      } else if (utilizationPct >= 80) {
        status = 'warning';
      }
    }

    res.status(200).json({
      success: true,
      data: {
        year,
        month,
        monthlyLimit,
        totalSpent,
        remaining,
        utilizationPct,
        status
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/budgets/:year/:month
function getBudgetByMonth(req, res, next) {
  try {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);

    if (Number.isNaN(year) || year < 1900 || year > 2200) {
      return res.status(400).json({
        success: false,
        error: 'Year must be a valid 4-digit integer.'
      });
    }

    if (Number.isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        error: 'Month must be an integer between 1 and 12.'
      });
    }

    const budget = db.prepare('SELECT * FROM monthly_budgets WHERE year = ? AND month = ?').get(year, month);

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: `Budget not found for year ${year} and month ${month}.`
      });
    }

    res.status(200).json({
      success: true,
      data: budget
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/budgets
function createBudget(req, res, next) {
  try {
    const { year, month, amount } = req.body;

    const numYear = parseInt(year, 10);
    const numMonth = parseInt(month, 10);
    const numAmount = Number(amount);

    if (Number.isNaN(numYear) || numYear < 1900 || numYear > 2200) {
      return res.status(400).json({
        success: false,
        error: 'Year must be a valid 4-digit integer.'
      });
    }

    if (Number.isNaN(numMonth) || numMonth < 1 || numMonth > 12) {
      return res.status(400).json({
        success: false,
        error: 'Month must be an integer between 1 and 12.'
      });
    }

    if (amount === undefined || amount === null || Number.isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Budget amount must be a valid number greater than 0.'
      });
    }

    // Check for existing budget for that year and month
    const existing = db.prepare('SELECT id FROM monthly_budgets WHERE year = ? AND month = ?').get(numYear, numMonth);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A budget for ${numYear}-${String(numMonth).padStart(2, '0')} already exists. Use PUT /api/budgets/:id to update it.`
      });
    }

    const cleanAmount = Number(numAmount.toFixed(2));
    const stmt = db.prepare('INSERT INTO monthly_budgets (year, month, amount) VALUES (?, ?, ?)');
    const result = stmt.run(numYear, numMonth, cleanAmount);

    const inserted = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: inserted
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/budgets/:id
function updateBudget(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid budget ID. Must be a positive integer.'
      });
    }

    const existing = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Budget with ID ${id} not found.`
      });
    }

    const { amount, year, month } = req.body;
    const numAmount = Number(amount);

    if (amount === undefined || amount === null || Number.isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Budget amount must be a valid number greater than 0.'
      });
    }

    const targetYear = year !== undefined ? parseInt(year, 10) : existing.year;
    const targetMonth = month !== undefined ? parseInt(month, 10) : existing.month;

    if (Number.isNaN(targetYear) || targetYear < 1900 || targetYear > 2200) {
      return res.status(400).json({
        success: false,
        error: 'Year must be a valid 4-digit integer.'
      });
    }

    if (Number.isNaN(targetMonth) || targetMonth < 1 || targetMonth > 12) {
      return res.status(400).json({
        success: false,
        error: 'Month must be an integer between 1 and 12.'
      });
    }

    // If changing year/month, check uniqueness
    if (targetYear !== existing.year || targetMonth !== existing.month) {
      const conflict = db.prepare('SELECT id FROM monthly_budgets WHERE year = ? AND month = ? AND id != ?').get(targetYear, targetMonth, id);
      if (conflict) {
        return res.status(409).json({
          success: false,
          error: `A budget for ${targetYear}-${String(targetMonth).padStart(2, '0')} already exists.`
        });
      }
    }

    const cleanAmount = Number(numAmount.toFixed(2));
    db.prepare('UPDATE monthly_budgets SET amount = ?, year = ?, month = ? WHERE id = ?').run(cleanAmount, targetYear, targetMonth, id);

    const updated = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?').get(id);

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllBudgets,
  getBudgetByMonth,
  getBudgetAlertStatus,
  createBudget,
  updateBudget
};
