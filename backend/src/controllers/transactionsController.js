const db = require('../config/database');

/**
 * Validates transaction fields.
 * Returns error string if invalid, or null if valid.
 */
function validateTransactionPayload(payload) {
  const { title, amount, category, type, date } = payload;

  if (title === undefined || title === null || String(title).trim() === '') {
    return 'Transaction title is required.';
  }

  const numAmount = Number(amount);
  if (amount === undefined || amount === null || Number.isNaN(numAmount) || numAmount <= 0) {
    return 'Amount must be a valid number greater than 0.';
  }

  if (type !== 'income' && type !== 'expense') {
    return "Transaction type must be 'income' or 'expense'.";
  }

  if (category === undefined || category === null || String(category).trim() === '') {
    return 'Category is required.';
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    return 'Date must be a valid string in YYYY-MM-DD format.';
  }

  const [y, m, d] = String(date).split('-').map(Number);
  const parsedDate = new Date(y, m - 1, d);
  if (
    parsedDate.getFullYear() !== y ||
    parsedDate.getMonth() !== m - 1 ||
    parsedDate.getDate() !== d
  ) {
    return 'Date is not a valid calendar day.';
  }

  return null;
}

// GET /api/transactions
function getAllTransactions(req, res, next) {
  try {
    const stmt = db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC');
    const transactions = stmt.all();
    res.status(200).json({
      success: true,
      data: transactions
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/transactions/:id
function getTransactionById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID. Must be a positive integer.'
      });
    }

    const stmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const tx = stmt.get(id);

    if (!tx) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} not found.`
      });
    }

    res.status(200).json({
      success: true,
      data: tx
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/transactions
function createTransaction(req, res, next) {
  try {
    const validationError = validateTransactionPayload(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError
      });
    }

    const { title, amount, category, type, date, description } = req.body;
    const cleanTitle = String(title).trim();
    const cleanAmount = Number(Number(amount).toFixed(2));
    const cleanCategory = String(category).trim();
    const cleanDescription = description ? String(description).trim() : null;

    const stmt = db.prepare(`
      INSERT INTO transactions (title, amount, category, type, date, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      cleanTitle,
      cleanAmount,
      cleanCategory,
      type,
      date,
      cleanDescription
    );

    const inserted = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: inserted
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/transactions/:id
function updateTransaction(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID. Must be a positive integer.'
      });
    }

    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} not found.`
      });
    }

    const validationError = validateTransactionPayload(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError
      });
    }

    const { title, amount, category, type, date, description } = req.body;
    const cleanTitle = String(title).trim();
    const cleanAmount = Number(Number(amount).toFixed(2));
    const cleanCategory = String(category).trim();
    const cleanDescription = description !== undefined ? (description ? String(description).trim() : null) : existing.description;

    const stmt = db.prepare(`
      UPDATE transactions
      SET title = ?, amount = ?, category = ?, type = ?, date = ?, description = ?
      WHERE id = ?
    `);

    stmt.run(
      cleanTitle,
      cleanAmount,
      cleanCategory,
      type,
      date,
      cleanDescription,
      id
    );

    const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/transactions/:id
function deleteTransaction(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID. Must be a positive integer.'
      });
    }

    const existing = db.prepare('SELECT id FROM transactions WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} not found.`
      });
    }

    db.prepare('DELETE FROM transactions WHERE id = ?').run(id);

    res.status(200).json({
      success: true,
      message: `Transaction ${id} deleted successfully.`
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction
};
