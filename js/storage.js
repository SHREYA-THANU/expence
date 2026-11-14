/**
 * storage.js
 * Centralized Data Persistence Layer connected to Express + SQLite REST API.
 * LocalStorage data is safely migrated on first run and kept as backup.
 */

const API_BASE = '/api';

const LOCAL_STORAGE_KEYS = {
  TRANSACTIONS_BACKUP: 'ledgerflow_transactions_v1',
  BUDGET_BACKUP: 'ledgerflow_budget_v1',
  SEEDED: 'ledgerflow_seeded_v1',
  MIGRATED_FLAG: 'ledgerflow_migrated_to_db'
};

/**
 * Normalizes a transaction object received from API or input.
 * @param {Object} raw
 * @returns {Object}
 */
function normalizeTransaction(raw) {
  return {
    id: raw.id,
    title: String(raw.title || '').trim(),
    amount: Number(Number(raw.amount || 0).toFixed(2)),
    category: String(raw.category || 'Other').trim(),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || ''),
    description: String(raw.description || '').trim(),
    created_at: raw.created_at || null
  };
}

/**
 * Retrieves all transactions from the REST API (newest first).
 * @returns {Promise<Array<Object>>}
 */
export async function getTransactions() {
  const res = await fetch(`${API_BASE}/transactions`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch transactions (${res.status})`);
  }
  const json = await res.json();
  const list = Array.isArray(json.data) ? json.data : [];
  return list.map(normalizeTransaction);
}

/**
 * Adds a new transaction via POST /api/transactions.
 * @param {Object} txInput
 * @returns {Promise<Object>} Created transaction
 */
export async function addTransaction(txInput) {
  const res = await fetch(`${API_BASE}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: txInput.title,
      amount: Number(txInput.amount),
      category: txInput.category,
      type: txInput.type,
      date: txInput.date,
      description: txInput.description || ''
    })
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Failed to create transaction (${res.status})`);
  }
  return normalizeTransaction(json.data);
}

/**
 * Updates an existing transaction via PUT /api/transactions/:id.
 * @param {number|string} id
 * @param {Object} updates
 * @returns {Promise<Object>} Updated transaction
 */
export async function updateTransaction(id, updates) {
  const res = await fetch(`${API_BASE}/transactions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: updates.title,
      amount: Number(updates.amount),
      category: updates.category,
      type: updates.type,
      date: updates.date,
      description: updates.description || ''
    })
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Failed to update transaction (${res.status})`);
  }
  return normalizeTransaction(json.data);
}

/**
 * Deletes a transaction by ID via DELETE /api/transactions/:id.
 * @param {number|string} id
 * @returns {Promise<boolean>}
 */
export async function deleteTransaction(id) {
  const res = await fetch(`${API_BASE}/transactions/${id}`, {
    method: 'DELETE'
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Failed to delete transaction (${res.status})`);
  }
  return true;
}

/**
 * Retrieves budget configuration from the REST API.
 * Converts monthly budget records into the format expected by views:
 * { monthlyLimit, byMonth: { [YYYY-MM]: amount }, updatedAt }
 * @returns {Promise<Object>}
 */
export async function getBudget() {
  const fallback = {
    monthlyLimit: 3200,
    byMonth: {},
    updatedAt: new Date().toISOString()
  };

  try {
    const res = await fetch(`${API_BASE}/budgets`);
    if (!res.ok) {
      return fallback;
    }
    const json = await res.json();
    const budgets = Array.isArray(json.data) ? json.data : [];

    const byMonth = {};
    let latestLimit = 0;

    for (const b of budgets) {
      const monthKey = `${b.year}-${String(b.month).padStart(2, '0')}`;
      byMonth[monthKey] = Number(b.amount);
      if (!latestLimit) latestLimit = Number(b.amount);
    }

    return {
      monthlyLimit: latestLimit > 0 ? latestLimit : fallback.monthlyLimit,
      byMonth,
      updatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('Error fetching budgets from API:', err);
    return fallback;
  }
}

/**
 * Saves budget limit for a specific month (YYYY-MM).
 * Calls POST if new, or PUT if budget for that month exists.
 * @param {number} monthlyLimit
 * @param {string} monthKey YYYY-MM
 * @returns {Promise<Object>}
 */
export async function saveBudget(monthlyLimit, monthKey) {
  const cleanLimit = Math.max(0, Number(Number(monthlyLimit || 0).toFixed(2)));
  const [yearStr, monthStr] = (monthKey || '').split('-');
  const now = new Date();
  const year = yearStr ? parseInt(yearStr, 10) : now.getFullYear();
  const month = monthStr ? parseInt(monthStr, 10) : now.getMonth() + 1;

  // Check if budget exists for this month
  const checkRes = await fetch(`${API_BASE}/budgets/${year}/${month}`);
  if (checkRes.ok) {
    const checkJson = await checkRes.json();
    const existingId = checkJson.data?.id;
    if (existingId) {
      const updateRes = await fetch(`${API_BASE}/budgets/${existingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: cleanLimit })
      });
      if (!updateRes.ok) {
        const errJson = await updateRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to update budget');
      }
    }
  } else {
    // Create new budget entry
    const createRes = await fetch(`${API_BASE}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, amount: cleanLimit })
    });
    if (!createRes.ok) {
      const errJson = await createRes.json().catch(() => ({}));
      throw new Error(errJson.error || 'Failed to create budget');
    }
  }

  return getBudget();
}

/**
 * Builds realistic sample transactions anchored to the current month.
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
    { title: 'Monthly Salary Deposit', amount: 5400, category: 'Salary', type: 'income', date: `${curr}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: `${curr}-02`, description: 'Monthly lease payment' },
    { title: 'Grocery Shopping', amount: 285.4, category: 'Food', type: 'expense', date: `${curr}-04`, description: 'Weekly groceries and fresh produce' },
    { title: 'Electric & Fiber Internet', amount: 164.5, category: 'Utilities', type: 'expense', date: `${curr}-06`, description: 'Monthly utility billing cycle' },
    { title: 'Product Advisory Retainer', amount: 850, category: 'Freelance', type: 'income', date: `${curr}-08`, description: 'UI architecture consultation invoice #104' },
    { title: 'Metro Pass & Fuel', amount: 142.0, category: 'Transport', type: 'expense', date: `${curr}-09`, description: 'Monthly transit pass and refueling' },
    { title: 'Whole Foods Market', amount: 218.75, category: 'Food', type: 'expense', date: `${curr}-11`, description: 'Pantry restock and household staples' },
    { title: 'Dental Checkup', amount: 195.0, category: 'Healthcare', type: 'expense', date: `${curr}-12`, description: 'Routine cleaning and X-ray copay' },
    { title: 'Hardware & Desk Lamp', amount: 168.9, category: 'Shopping', type: 'expense', date: `${curr}-13`, description: 'Home office task lighting' },
    { title: 'Monthly Salary Deposit', amount: 5400, category: 'Salary', type: 'income', date: `${prev1}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: `${prev1}-02`, description: 'Monthly lease payment' },
    { title: 'Groceries & Dining', amount: 520.3, category: 'Food', type: 'expense', date: `${prev1}-14`, description: 'Supermarket trips and team lunch' },
    { title: 'Utilities Bundle', amount: 158.0, category: 'Utilities', type: 'expense', date: `${prev1}-18`, description: 'Water, electric, and internet' },
    { title: 'Quarterly Dividend', amount: 320, category: 'Investments', type: 'income', date: `${prev1}-22`, description: 'Index fund quarterly distribution' },
    { title: 'Streaming & Books', amount: 94.5, category: 'Entertainment', type: 'expense', date: `${prev1}-25`, description: 'Subscriptions and technical books' },
    { title: 'Monthly Salary Deposit', amount: 5200, category: 'Salary', type: 'income', date: `${prev2}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: `${prev2}-02`, description: 'Monthly lease payment' },
    { title: 'Grocery & Market', amount: 465.0, category: 'Food', type: 'expense', date: `${prev2}-12`, description: 'Monthly grocery runs' },
    { title: 'Flight & Commute', amount: 390.0, category: 'Transport', type: 'expense', date: `${prev2}-19`, description: 'Regional conference rail & cab' },
    { title: 'Monthly Salary Deposit', amount: 5200, category: 'Salary', type: 'income', date: `${prev3}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: `${prev3}-02`, description: 'Monthly lease payment' },
    { title: 'Food & Household', amount: 410.25, category: 'Food', type: 'expense', date: `${prev3}-16`, description: 'Supermarket purchases' }
  ];
}

/**
 * Migrates existing LocalStorage transactions & budget to the database through the API.
 * Sets a flag in LocalStorage so it never runs twice.
 * Never deletes original LocalStorage data.
 * @returns {Promise<{migrated: boolean, txCount: number, budgetCount: number}>}
 */
export async function migrateLocalStorageIfNeeded() {
  const isMigrated = localStorage.getItem(LOCAL_STORAGE_KEYS.MIGRATED_FLAG) === 'true';
  if (isMigrated) {
    return { migrated: false, txCount: 0, budgetCount: 0 };
  }

  let txCount = 0;
  let budgetCount = 0;

  try {
    // 1. Migrate LocalStorage transactions
    const rawTx = localStorage.getItem(LOCAL_STORAGE_KEYS.TRANSACTIONS_BACKUP);
    if (rawTx) {
      const parsed = JSON.parse(rawTx);
      if (Array.isArray(parsed) && parsed.length > 0) {
        for (const item of parsed) {
          try {
            await addTransaction({
              title: item.title,
              amount: item.amount,
              category: item.category,
              type: item.type,
              date: item.date,
              description: item.description || ''
            });
            txCount++;
          } catch (e) {
            console.warn('Skipped invalid transaction during migration:', item, e);
          }
        }
      }
    }

    // 2. Migrate LocalStorage budget
    const rawBudget = localStorage.getItem(LOCAL_STORAGE_KEYS.BUDGET_BACKUP);
    if (rawBudget) {
      const parsed = JSON.parse(rawBudget);
      if (parsed && typeof parsed === 'object') {
        const byMonth = parsed.byMonth || {};
        for (const [monthKey, amt] of Object.entries(byMonth)) {
          const [yStr, mStr] = monthKey.split('-');
          const y = parseInt(yStr, 10);
          const m = parseInt(mStr, 10);
          const val = Number(amt);
          if (y && m && val > 0) {
            try {
              await fetch(`${API_BASE}/budgets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year: y, month: m, amount: val })
              });
              budgetCount++;
            } catch (e) {
              console.warn('Skipped budget during migration:', monthKey, e);
            }
          }
        }
        if (budgetCount === 0 && Number(parsed.monthlyLimit) > 0) {
          const now = new Date();
          try {
            await fetch(`${API_BASE}/budgets`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                year: now.getFullYear(),
                month: now.getMonth() + 1,
                amount: Number(parsed.monthlyLimit)
              })
            });
            budgetCount++;
          } catch (e) {
            console.warn('Skipped default budget during migration:', e);
          }
        }
      }
    }

    // Set flag in LocalStorage so migration never runs twice
    localStorage.setItem(LOCAL_STORAGE_KEYS.MIGRATED_FLAG, 'true');
    console.log(`[Migration] Successfully imported ${txCount} transactions and ${budgetCount} budgets into database.`);
  } catch (err) {
    console.error('[Migration] Migration encountered an error:', err);
  }

  return { migrated: true, txCount, budgetCount };
}

/**
 * Seeds sample transactions and initial budget if the database has 0 transactions.
 * @returns {Promise<boolean>}
 */
export async function seedSampleDataIfNeeded() {
  try {
    const existing = await getTransactions();
    if (existing.length === 0) {
      const samples = buildSampleTransactions();
      for (const s of samples) {
        await addTransaction(s);
      }
      const now = new Date();
      await saveBudget(3200, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      return true;
    }
  } catch (err) {
    console.warn('Could not seed sample data:', err);
  }
  return false;
}

/**
 * Resets database sample transactions through the API without dropping tables.
 * @returns {Promise<void>}
 */
export async function resetToSampleData() {
  const existing = await getTransactions();
  for (const tx of existing) {
    await deleteTransaction(tx.id);
  }
  const samples = buildSampleTransactions();
  for (const s of samples) {
    await addTransaction(s);
  }
  const now = new Date();
  await saveBudget(3200, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
}
