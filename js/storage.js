/**
 * storage.js
 * Centralized Data Persistence Layer (LocalStorage).
 *
 * Designed with clean repository-style functions so LocalStorage calls can
 * later be swapped with REST API fetch() calls to a Node/Express/SQL backend
 * without modifying UI or calculation modules.
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'ledgerflow_transactions_v1',
  BUDGET: 'ledgerflow_budget_v1',
  SEEDED: 'ledgerflow_seeded_v1'
};

/**
 * Generates a unique identifier for new transactions.
 * @returns {string}
 */
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tx_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Normalizes a transaction object to ensure strict schema consistency.
 * @param {Object} raw
 * @returns {Object}
 */
function normalizeTransaction(raw) {
  return {
    id: String(raw.id || generateId()),
    title: String(raw.title || '').trim(),
    amount: Number(Number(raw.amount || 0).toFixed(2)),
    category: String(raw.category || 'Other').trim(),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || ''),
    description: String(raw.description || '').trim()
  };
}

/**
 * Retrieves all transactions from LocalStorage.
 * @returns {Array<Object>}
 */
export function getTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTransaction);
  } catch (err) {
    console.error('Failed to read transactions from LocalStorage:', err);
    return [];
  }
}

/**
 * Persists the complete transactions array to LocalStorage.
 * @param {Array<Object>} transactions
 * @returns {boolean}
 */
export function saveTransactions(transactions) {
  try {
    const normalized = Array.isArray(transactions)
      ? transactions.map(normalizeTransaction)
      : [];
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(normalized));
    return true;
  } catch (err) {
    console.error('Failed to save transactions to LocalStorage:', err);
    return false;
  }
}

/**
 * Adds a new transaction and persists it.
 * @param {Object} txInput
 * @returns {Object} Created transaction object
 */
export function addTransaction(txInput) {
  const transactions = getTransactions();
  const created = normalizeTransaction({
    ...txInput,
    id: generateId()
  });
  transactions.unshift(created);
  saveTransactions(transactions);
  return created;
}

/**
 * Updates an existing transaction by ID.
 * @param {string} id
 * @param {Object} updates
 * @returns {Object|null} Updated transaction or null if not found
 */
export function updateTransaction(id, updates) {
  const transactions = getTransactions();
  const index = transactions.findIndex((tx) => tx.id === id);
  if (index === -1) return null;

  const updated = normalizeTransaction({
    ...transactions[index],
    ...updates,
    id
  });
  transactions[index] = updated;
  saveTransactions(transactions);
  return updated;
}

/**
 * Deletes a transaction by ID.
 * @param {string} id
 * @returns {boolean} True if removed
 */
export function deleteTransaction(id) {
  const transactions = getTransactions();
  const next = transactions.filter((tx) => tx.id !== id);
  if (next.length === transactions.length) return false;
  saveTransactions(next);
  return true;
}

/**
 * Retrieves budget configuration from LocalStorage.
 * Supports per-month overrides with a default monthlyLimit fallback.
 * @returns {Object} { monthlyLimit: number, byMonth: Record<string, number>, updatedAt: string }
 */
export function getBudget() {
  const fallback = {
    monthlyLimit: 3200,
    byMonth: {},
    updatedAt: new Date().toISOString()
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BUDGET);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      monthlyLimit: Number(parsed.monthlyLimit) >= 0 ? Number(parsed.monthlyLimit) : 0,
      byMonth: parsed.byMonth && typeof parsed.byMonth === 'object' ? parsed.byMonth : {},
      updatedAt: parsed.updatedAt || new Date().toISOString()
    };
  } catch (err) {
    console.error('Failed to read budget from LocalStorage:', err);
    return fallback;
  }
}

/**
 * Saves budget limit for a specific month (YYYY-MM) and updates default limit.
 * @param {number} monthlyLimit
 * @param {string} [monthKey]
 * @returns {Object} Saved budget object
 */
export function saveBudget(monthlyLimit, monthKey) {
  const current = getBudget();
  const cleanLimit = Math.max(0, Number(Number(monthlyLimit || 0).toFixed(2)));
  const nextByMonth = { ...current.byMonth };
  if (monthKey) {
    nextByMonth[monthKey] = cleanLimit;
  }

  const next = {
    monthlyLimit: cleanLimit,
    byMonth: nextByMonth,
    updatedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(next));
  } catch (err) {
    console.error('Failed to save budget to LocalStorage:', err);
  }
  return next;
}

/**
 * Returns realistic sample transactions anchored to the current date (YYYY-MM).
 * @returns {Array<Object>}
 */
function buildSampleTransactions() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  const fmtMonth = (offset) => {
    const d = new Date(y, m - 1 + offset, 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    return `${yr}-${mo}`;
  };

  const curr = fmtMonth(0);
  const prev1 = fmtMonth(-1);
  const prev2 = fmtMonth(-2);
  const prev3 = fmtMonth(-3);

  return [
    {
      id: 'tx_sample_01',
      title: 'Monthly Salary Deposit',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: `${curr}-01`,
      description: 'Primary payroll direct deposit'
    },
    {
      id: 'tx_sample_02',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${curr}-02`,
      description: 'Monthly lease payment'
    },
    {
      id: 'tx_sample_03',
      title: 'Grocery Shopping',
      amount: 285.4,
      category: 'Food',
      type: 'expense',
      date: `${curr}-04`,
      description: 'Weekly groceries and fresh produce'
    },
    {
      id: 'tx_sample_04',
      title: 'Electric & Fiber Internet',
      amount: 164.5,
      category: 'Utilities',
      type: 'expense',
      date: `${curr}-06`,
      description: 'Monthly utility billing cycle'
    },
    {
      id: 'tx_sample_05',
      title: 'Product Advisory Retainer',
      amount: 850,
      category: 'Freelance',
      type: 'income',
      date: `${curr}-08`,
      description: 'UI architecture consultation invoice #104'
    },
    {
      id: 'tx_sample_06',
      title: 'Metro Pass & Fuel',
      amount: 142.0,
      category: 'Transport',
      type: 'expense',
      date: `${curr}-09`,
      description: 'Monthly transit pass and refueling'
    },
    {
      id: 'tx_sample_07',
      title: 'Whole Foods Market',
      amount: 218.75,
      category: 'Food',
      type: 'expense',
      date: `${curr}-11`,
      description: 'Pantry restock and household staples'
    },
    {
      id: 'tx_sample_08',
      title: 'Dental Checkup',
      amount: 195.0,
      category: 'Healthcare',
      type: 'expense',
      date: `${curr}-12`,
      description: 'Routine cleaning and X-ray copay'
    },
    {
      id: 'tx_sample_09',
      title: 'Hardware & Desk Lamp',
      amount: 168.9,
      category: 'Shopping',
      type: 'expense',
      date: `${curr}-13`,
      description: 'Home office task lighting'
    },
    {
      id: 'tx_sample_10',
      title: 'Monthly Salary Deposit',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: `${prev1}-01`,
      description: 'Primary payroll direct deposit'
    },
    {
      id: 'tx_sample_11',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${prev1}-02`,
      description: 'Monthly lease payment'
    },
    {
      id: 'tx_sample_12',
      title: 'Groceries & Dining',
      amount: 520.3,
      category: 'Food',
      type: 'expense',
      date: `${prev1}-14`,
      description: 'Supermarket trips and team lunch'
    },
    {
      id: 'tx_sample_13',
      title: 'Utilities Bundle',
      amount: 158.0,
      category: 'Utilities',
      type: 'expense',
      date: `${prev1}-18`,
      description: 'Water, electric, and internet'
    },
    {
      id: 'tx_sample_14',
      title: 'Quarterly Dividend',
      amount: 320,
      category: 'Investments',
      type: 'income',
      date: `${prev1}-22`,
      description: 'Index fund quarterly distribution'
    },
    {
      id: 'tx_sample_15',
      title: 'Streaming & Books',
      amount: 94.5,
      category: 'Entertainment',
      type: 'expense',
      date: `${prev1}-25`,
      description: 'Subscriptions and technical books'
    },
    {
      id: 'tx_sample_16',
      title: 'Monthly Salary Deposit',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: `${prev2}-01`,
      description: 'Primary payroll direct deposit'
    },
    {
      id: 'tx_sample_17',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${prev2}-02`,
      description: 'Monthly lease payment'
    },
    {
      id: 'tx_sample_18',
      title: 'Grocery & Market',
      amount: 465.0,
      category: 'Food',
      type: 'expense',
      date: `${prev2}-12`,
      description: 'Monthly grocery runs'
    },
    {
      id: 'tx_sample_19',
      title: 'Flight & Commute',
      amount: 390.0,
      category: 'Transport',
      type: 'expense',
      date: `${prev2}-19`,
      description: 'Regional conference rail & cab'
    },
    {
      id: 'tx_sample_20',
      title: 'Monthly Salary Deposit',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: `${prev3}-01`,
      description: 'Primary payroll direct deposit'
    },
    {
      id: 'tx_sample_21',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${prev3}-02`,
      description: 'Monthly lease payment'
    },
    {
      id: 'tx_sample_22',
      title: 'Food & Household',
      amount: 410.25,
      category: 'Food',
      type: 'expense',
      date: `${prev3}-16`,
      description: 'Supermarket purchases'
    }
  ];
}

/**
 * Seeds sample transactions and initial budget once on first visit.
 */
export function seedSampleDataIfNeeded() {
  const alreadySeeded = localStorage.getItem(STORAGE_KEYS.SEEDED);
  if (alreadySeeded) return;

  const existing = getTransactions();
  if (existing.length === 0) {
    saveTransactions(buildSampleTransactions());
    saveBudget(3200);
  }
  localStorage.setItem(STORAGE_KEYS.SEEDED, 'true');
}

/**
 * Resets LocalStorage back to clean sample data.
 */
export function resetToSampleData() {
  const samples = buildSampleTransactions();
  saveTransactions(samples);
  localStorage.removeItem(STORAGE_KEYS.BUDGET);
  saveBudget(3200);
  localStorage.setItem(STORAGE_KEYS.SEEDED, 'true');
}
