/**
 * transactions.js
 * Pure calculation logic (independent of storage) + Transaction History UI +
 * Add/Edit Transaction Form Management & Validation.
 */

import { addTransaction, updateTransaction, deleteTransaction } from './storage.js';

export const CATEGORIES = {
  expense: [
    'Food',
    'Housing',
    'Transport',
    'Utilities',
    'Healthcare',
    'Entertainment',
    'Shopping',
    'Education',
    'Other'
  ],
  income: [
    'Salary',
    'Freelance',
    'Investments',
    'Bonus',
    'Refund',
    'Other'
  ]
};

export const ALL_CATEGORIES = Array.from(
  new Set([...CATEGORIES.expense, ...CATEGORIES.income])
);

/**
 * Formats a numeric value as USD currency.
 * @param {number} value
 * @returns {string}
 */
export function formatCurrency(value) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

/**
 * Formats YYYY-MM-DD into readable date (e.g. Nov 13, 2026).
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dateObj = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(dateObj);
}

/**
 * Formats YYYY-MM into readable month label (e.g. November 2026).
 * @param {string} monthKey
 * @returns {string}
 */
export function formatMonthLabel(monthKey) {
  if (!monthKey || monthKey === 'all') return 'All Time';
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric'
  }).format(new Date(y, m - 1, 1));
}

/**
 * Returns today's date in local YYYY-MM-DD format.
 * @returns {string}
 */
export function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns YYYY-MM string for a date or current date.
 * @param {string} [dateStr]
 * @returns {string}
 */
export function getMonthKey(dateStr) {
  if (dateStr && /^\d{4}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 7);
  }
  return getTodayISO().slice(0, 7);
}

/**
 * Escapes HTML special characters to prevent XSS in template rendering.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Pure calculation function: computes financial totals dynamically.
 * Total Balance = Total Income - Total Expenses.
 * @param {Array<Object>} transactions
 * @param {string} targetMonth YYYY-MM
 * @returns {Object}
 */
export function calculateSummary(transactions, targetMonth) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let monthlyIncome = 0;
  let monthlySpending = 0;

  for (const tx of transactions) {
    const amount = Number(tx.amount) || 0;
    const txMonth = getMonthKey(tx.date);

    if (tx.type === 'income') {
      totalIncome += amount;
      if (txMonth === targetMonth) {
        monthlyIncome += amount;
      }
    } else {
      totalExpenses += amount;
      if (txMonth === targetMonth) {
        monthlySpending += amount;
      }
    }
  }

  return {
    totalIncome: Number(totalIncome.toFixed(2)),
    totalExpenses: Number(totalExpenses.toFixed(2)),
    totalBalance: Number((totalIncome - totalExpenses).toFixed(2)),
    monthlyIncome: Number(monthlyIncome.toFixed(2)),
    monthlySpending: Number(monthlySpending.toFixed(2)),
    netMonthlySavings: Number((monthlyIncome - monthlySpending).toFixed(2)),
    transactionCount: transactions.length
  };
}

/**
 * Pure filter & sort function for transaction history.
 * @param {Array<Object>} transactions
 * @param {Object} criteria
 * @returns {Array<Object>}
 */
export function filterAndSortTransactions(transactions, criteria = {}) {
  const {
    search = '',
    category = 'all',
    type = 'all',
    sortBy = 'date-desc',
    month = 'all'
  } = criteria;

  const query = search.trim().toLowerCase();

  const filtered = transactions.filter((tx) => {
    if (month !== 'all' && getMonthKey(tx.date) !== month) return false;
    if (type !== 'all' && tx.type !== type) return false;
    if (category !== 'all' && tx.category !== category) return false;
    if (query) {
      const hay = `${tx.title} ${tx.description} ${tx.category}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    switch (sortBy) {
      case 'date-asc':
        return a.date.localeCompare(b.date);
      case 'amount-desc':
        return b.amount - a.amount;
      case 'amount-asc':
        return a.amount - b.amount;
      case 'date-desc':
      default:
        return b.date.localeCompare(a.date);
    }
  });
}

/**
 * Validates transaction form input.
 * @param {Object} data
 * @returns {Object} { valid: boolean, errors: Object }
 */
export function validateTransactionInput(data) {
  const errors = {};
  const title = String(data.title || '').trim();
  const amount = Number(data.amount);
  const category = String(data.category || '').trim();
  const type = data.type;
  const date = String(data.date || '').trim();

  if (!title) {
    errors.title = 'Please enter a transaction title.';
  } else if (title.length < 2) {
    errors.title = 'Title must be at least 2 characters.';
  }

  if (Number.isNaN(amount) || amount <= 0) {
    errors.amount = 'Enter a valid amount greater than 0.';
  } else if (amount > 100000000) {
    errors.amount = 'Amount exceeds maximum allowed limit.';
  }

  if (type !== 'income' && type !== 'expense') {
    errors.type = 'Select income or expense.';
  }

  if (!category) {
    errors.category = 'Please choose a category.';
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Select a valid transaction date.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Populates a <select> element with categories appropriate for income or expense.
 * @param {HTMLSelectElement} selectEl
 * @param {'income'|'expense'} type
 * @param {string} [selectedValue]
 */
export function populateCategorySelect(selectEl, type, selectedValue = '') {
  if (!selectEl) return;
  const list = CATEGORIES[type] || CATEGORIES.expense;
  selectEl.innerHTML = list
    .map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`)
    .join('');

  if (selectedValue && list.includes(selectedValue)) {
    selectEl.value = selectedValue;
  } else if (list.length > 0) {
    selectEl.value = list[0];
  }
}

/**
 * Renders the filter category dropdown on the Transaction History view.
 */
export function populateFilterCategories() {
  const filterSelect = document.getElementById('tx-category-filter');
  if (!filterSelect) return;
  const prev = filterSelect.value || 'all';
  filterSelect.innerHTML =
    '<option value="all">All Categories</option>' +
    ALL_CATEGORIES.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
  filterSelect.value = ALL_CATEGORIES.includes(prev) ? prev : 'all';
}

/**
 * Builds an HTML table string for a list of transactions.
 * Used by both Transaction History (with actions) and Dashboard Recent Transactions.
 */
export function renderTransactionsTableHTML(transactions, options = {}) {
  const { showActions = true, emptyTitle = 'No transactions found', emptyAction = true } = options;

  if (!transactions.length) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="receipt"></i></div>
        <div class="empty-state-title">${escapeHtml(emptyTitle)}</div>
        <p class="empty-state-desc">Adjust your filters or add a new income or expense transaction to get started.</p>
        ${emptyAction ? '<button type="button" class="btn btn-primary" data-open-add="true">Add Transaction</button>' : ''}
      </div>
    `;
  }

  const rows = transactions
    .map((tx) => {
      const isIncome = tx.type === 'income';
      const amountSign = isIncome ? '+' : '-';
      const amountClass = isIncome ? 'text-income' : 'text-expense';
      const typeIcon = isIncome ? 'arrow-down-left' : 'arrow-up-right';
      const typeLabel = isIncome ? 'Income' : 'Expense';

      return `
        <tr data-tx-id="${escapeHtml(tx.id)}">
          <td>
            <div class="tx-title-cell">
              <span class="tx-title-main">${escapeHtml(tx.title)}</span>
              ${tx.description ? `<span class="tx-title-desc" title="${escapeHtml(tx.description)}">${escapeHtml(tx.description)}</span>` : ''}
            </div>
          </td>
          <td class="tx-meta-inline">${escapeHtml(tx.category)}</td>
          <td>
            <span class="tx-type-label ${amountClass}">
              <i data-lucide="${typeIcon}"></i>
              <span>${typeLabel}</span>
            </span>
          </td>
          <td class="tx-meta-inline tabular-nums">${escapeHtml(formatDate(tx.date))}</td>
          <td class="align-right tabular-nums ${amountClass}" style="font-weight: 600;">
            ${amountSign}${escapeHtml(formatCurrency(tx.amount))}
          </td>
          ${
            showActions
              ? `<td class="align-right">
                  <div class="tx-actions">
                    <button type="button" class="icon-btn" data-edit-tx="${escapeHtml(tx.id)}" aria-label="Edit ${escapeHtml(tx.title)}" title="Edit">
                      <i data-lucide="pencil"></i>
                    </button>
                    <button type="button" class="icon-btn icon-btn-danger" data-delete-tx="${escapeHtml(tx.id)}" aria-label="Delete ${escapeHtml(tx.title)}" title="Delete">
                      <i data-lucide="trash-2"></i>
                    </button>
                  </div>
                </td>`
              : ''
          }
        </tr>
      `;
    })
    .join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Transaction</th>
          <th>Category</th>
          <th>Type</th>
          <th>Date</th>
          <th class="align-right">Amount</th>
          ${showActions ? '<th class="align-right">Actions</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Controller for Transaction History view, Add Entry view, and Transaction Modal.
 */
export function initTransactionsController({
  getState,
  onDataChange,
  openConfirmDialog,
  showToast,
  refreshIcons
}) {
  const searchInput = document.getElementById('tx-search-input');
  const typeFilter = document.getElementById('tx-type-filter');
  const categoryFilter = document.getElementById('tx-category-filter');
  const sortSelect = document.getElementById('tx-sort-select');
  const clearFiltersBtn = document.getElementById('tx-clear-filters-btn');
  const tableContainer = document.getElementById('transactions-table-container');
  const countLabel = document.getElementById('transactions-count-label');

  // Inline Add Entry form elements
  const inlineForm = document.getElementById('inline-tx-form');
  const inlineTypeInput = document.getElementById('inline-tx-type');
  const inlineCategorySelect = document.getElementById('inline-tx-category');
  const inlineDateInput = document.getElementById('inline-tx-date');
  const inlineTypeBtns = document.querySelectorAll('[data-form-type]');

  // Modal Add/Edit form elements
  const modalOverlay = document.getElementById('tx-modal');
  const modalTitleEl = document.getElementById('tx-modal-title');
  const modalForm = document.getElementById('modal-tx-form');
  const modalIdInput = document.getElementById('modal-tx-id');
  const modalTypeInput = document.getElementById('modal-tx-type');
  const modalDateInput = document.getElementById('modal-tx-date');
  const modalTitleInput = document.getElementById('modal-tx-title');
  const modalAmountInput = document.getElementById('modal-tx-amount');
  const modalCategorySelect = document.getElementById('modal-tx-category');
  const modalDescInput = document.getElementById('modal-tx-description');
  const modalSubmitBtn = document.getElementById('tx-modal-submit');
  const modalTypeBtns = document.querySelectorAll('[data-modal-type]');

  // Initialize defaults
  populateFilterCategories();
  populateCategorySelect(inlineCategorySelect, 'expense');
  if (inlineDateInput) inlineDateInput.value = getTodayISO();

  function clearErrors(prefix) {
    ['title', 'amount', 'category', 'date', 'description'].forEach((field) => {
      const errEl = document.getElementById(`${prefix}-error-${field}`);
      if (errEl) errEl.textContent = '';
      const inputEl = document.getElementById(`${prefix}-tx-${field}`);
      if (inputEl) inputEl.classList.remove('is-invalid');
    });
  }

  function applyErrors(prefix, errors) {
    Object.entries(errors).forEach(([field, message]) => {
      const errEl = document.getElementById(`${prefix}-error-${field}`);
      if (errEl) errEl.textContent = message;
      const inputEl = document.getElementById(`${prefix}-tx-${field}`);
      if (inputEl) inputEl.classList.add('is-invalid');
    });
  }

  function setInlineType(type) {
    inlineTypeInput.value = type;
    inlineTypeBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.formType === type);
    });
    populateCategorySelect(inlineCategorySelect, type);
    updateFormBudgetAlert('inline');
  }

  function setModalType(type, preferredCategory = '') {
    modalTypeInput.value = type;
    modalTypeBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.modalType === type);
    });
    populateCategorySelect(modalCategorySelect, type, preferredCategory);
    updateFormBudgetAlert('modal');
  }

  function checkBudgetImpact(newAmount, txDate, existingTxId = null) {
    const { transactions, budget } = getState();
    const txMonth = getMonthKey(txDate);
    const monthOverride = budget?.byMonth?.[txMonth];
    const monthlyLimit = Number(
      monthOverride !== undefined ? monthOverride : budget?.monthlyLimit ?? 0
    );

    if (monthlyLimit <= 0) return null;

    let currentMonthExpenses = 0;
    for (const tx of transactions) {
      if (tx.type === 'expense' && getMonthKey(tx.date) === txMonth) {
        if (existingTxId && String(tx.id) === String(existingTxId)) {
          continue;
        }
        currentMonthExpenses += Number(tx.amount) || 0;
      }
    }

    const numAmount = Number(newAmount);
    if (Number.isNaN(numAmount) || numAmount <= 0) return null;

    const projectedExpenses = Number((currentMonthExpenses + numAmount).toFixed(2));
    const utilizationPct = Number(((projectedExpenses / monthlyLimit) * 100).toFixed(1));
    const remaining = Number((monthlyLimit - projectedExpenses).toFixed(2));

    if (projectedExpenses > monthlyLimit) {
      return {
        type: 'exceeded',
        month: txMonth,
        monthlyLimit,
        projectedExpenses,
        utilizationPct,
        overBy: Math.abs(remaining)
      };
    }

    if (utilizationPct >= 80) {
      return {
        type: 'warning',
        month: txMonth,
        monthlyLimit,
        projectedExpenses,
        utilizationPct,
        remaining
      };
    }

    return null;
  }

  function updateFormBudgetAlert(prefix) {
    const bannerEl = document.getElementById(`${prefix}-budget-alert`);
    if (!bannerEl) return;

    const typeInput = document.getElementById(`${prefix}-tx-type`);
    const dateInput = document.getElementById(`${prefix}-tx-date`);
    const amountInput = document.getElementById(`${prefix}-tx-amount`);
    const idInput = prefix === 'modal' ? document.getElementById('modal-tx-id') : null;
    const existingId = idInput?.value?.trim() || null;

    if (!typeInput || typeInput.value !== 'expense' || !amountInput || !amountInput.value) {
      bannerEl.className = 'alert-banner hidden';
      bannerEl.innerHTML = '';
      return;
    }

    const impact = checkBudgetImpact(amountInput.value, dateInput?.value || getTodayISO(), existingId);

    if (!impact) {
      bannerEl.className = 'alert-banner hidden';
      bannerEl.innerHTML = '';
      return;
    }

    if (impact.type === 'exceeded') {
      bannerEl.className = 'alert-banner is-danger';
      bannerEl.innerHTML = `
        <div class="alert-banner-content">
          <i data-lucide="alert-octagon"></i>
          <div>
            <strong>Budget Exceeded Alert:</strong> This expense pushes ${formatMonthLabel(impact.month)} spending to ${impact.utilizationPct}%, exceeding your budget by ${formatCurrency(impact.overBy)}.
          </div>
        </div>
      `;
    } else if (impact.type === 'warning') {
      bannerEl.className = 'alert-banner is-warning';
      bannerEl.innerHTML = `
        <div class="alert-banner-content">
          <i data-lucide="alert-triangle"></i>
          <div>
            <strong>Budget Warning:</strong> This expense will use ${impact.utilizationPct}% of your ${formatMonthLabel(impact.month)} budget (${formatCurrency(impact.remaining)} remaining).
          </div>
        </div>
      `;
    }
    refreshIcons();
  }

  function openModalForCreate(defaultType = 'expense') {
    clearErrors('modal');
    modalForm.reset();
    modalIdInput.value = '';
    modalTitleEl.textContent = 'Add Transaction';
    modalSubmitBtn.textContent = 'Save Transaction';
    modalDateInput.value = getTodayISO();
    setModalType(defaultType);
    updateFormBudgetAlert('modal');
    modalOverlay.classList.remove('hidden');
    refreshIcons();
    setTimeout(() => modalTitleInput.focus(), 40);
  }

  function openModalForEdit(txId) {
    const { transactions } = getState();
    const tx = transactions.find((item) => String(item.id) === String(txId));
    if (!tx) return;

    clearErrors('modal');
    modalIdInput.value = tx.id;
    modalTitleEl.textContent = 'Edit Transaction';
    modalSubmitBtn.textContent = 'Update Transaction';
    modalTitleInput.value = tx.title;
    modalAmountInput.value = String(tx.amount);
    modalDateInput.value = tx.date;
    modalDescInput.value = tx.description || '';
    setModalType(tx.type, tx.category);
    updateFormBudgetAlert('modal');
    modalOverlay.classList.remove('hidden');
    refreshIcons();
    setTimeout(() => modalTitleInput.focus(), 40);
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
  }

  function requestDeleteTransaction(txId) {
    const { transactions } = getState();
    const tx = transactions.find((item) => String(item.id) === String(txId));
    if (!tx) return;

    openConfirmDialog({
      title: 'Delete Transaction',
      message: `Are you sure you want to delete "${tx.title}" (${formatCurrency(tx.amount)})? This action cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await deleteTransaction(txId);
          showToast('Transaction deleted');
          if (onDataChange) await onDataChange();
        } catch (err) {
          showToast(err.message || 'Error deleting transaction');
        }
      }
    });
  }

  // Inline type toggle
  inlineTypeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      setInlineType(btn.dataset.formType);
    });
  });

  // Modal type toggle
  modalTypeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      setModalType(btn.dataset.modalType);
    });
  });

  // Live budget alert updates when editing amount or date
  const inlineAmountInput = document.getElementById('inline-tx-amount');
  inlineAmountInput?.addEventListener('input', () => updateFormBudgetAlert('inline'));
  inlineDateInput?.addEventListener('change', () => updateFormBudgetAlert('inline'));

  modalAmountInput?.addEventListener('input', () => updateFormBudgetAlert('modal'));
  modalDateInput?.addEventListener('change', () => updateFormBudgetAlert('modal'));

  // Inline form submit
  if (inlineForm) {
    inlineForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors('inline');

      const payload = {
        type: inlineTypeInput.value,
        date: document.getElementById('inline-tx-date').value,
        title: document.getElementById('inline-tx-title').value,
        amount: document.getElementById('inline-tx-amount').value,
        category: inlineCategorySelect.value,
        description: document.getElementById('inline-tx-description').value
      };

      const validation = validateTransactionInput(payload);
      if (!validation.valid) {
        applyErrors('inline', validation.errors);
        return;
      }

      const impact = payload.type === 'expense' ? checkBudgetImpact(payload.amount, payload.date) : null;

      const executeSave = async () => {
        try {
          await addTransaction(payload);
          inlineForm.reset();
          inlineDateInput.value = getTodayISO();
          setInlineType(payload.type);
          updateFormBudgetAlert('inline');
          if (impact?.type === 'exceeded') {
            showToast(`⚠️ Expense saved. Budget exceeded by ${formatCurrency(impact.overBy)}!`);
          } else if (impact?.type === 'warning') {
            showToast(`⚠️ Expense saved. Budget at ${impact.utilizationPct}% (${formatCurrency(impact.remaining)} left)`);
          } else {
            showToast(`${payload.type === 'income' ? 'Income' : 'Expense'} added to ledger`);
          }
          if (onDataChange) await onDataChange();
        } catch (err) {
          showToast(err.message || 'Failed to add transaction');
        }
      };

      if (impact && impact.type === 'exceeded') {
        openConfirmDialog({
          title: 'Budget Exceeded Warning',
          message: `This expense of ${formatCurrency(payload.amount)} will push your ${formatMonthLabel(impact.month)} spending to ${impact.utilizationPct}% of your limit, exceeding your ${formatCurrency(impact.monthlyLimit)} budget by ${formatCurrency(impact.overBy)}. Do you want to proceed?`,
          confirmLabel: 'Proceed Anyway',
          onConfirm: executeSave
        });
        return;
      }

      await executeSave();
    });

    inlineForm.addEventListener('reset', () => {
      clearErrors('inline');
      setTimeout(() => {
        inlineDateInput.value = getTodayISO();
        setInlineType('expense');
        updateFormBudgetAlert('inline');
      }, 0);
    });
  }

  // Modal form submit
  if (modalForm) {
    modalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors('modal');

      const id = modalIdInput.value.trim();
      const payload = {
        type: modalTypeInput.value,
        date: modalDateInput.value,
        title: modalTitleInput.value,
        amount: modalAmountInput.value,
        category: modalCategorySelect.value,
        description: modalDescInput.value
      };

      const validation = validateTransactionInput(payload);
      if (!validation.valid) {
        applyErrors('modal', validation.errors);
        return;
      }

      const impact = payload.type === 'expense' ? checkBudgetImpact(payload.amount, payload.date, id) : null;

      const executeSave = async () => {
        try {
          if (id) {
            await updateTransaction(id, payload);
            if (impact?.type === 'exceeded') {
              showToast(`⚠️ Transaction updated. Budget exceeded by ${formatCurrency(impact.overBy)}!`);
            } else if (impact?.type === 'warning') {
              showToast(`⚠️ Transaction updated. Budget at ${impact.utilizationPct}% (${formatCurrency(impact.remaining)} left)`);
            } else {
              showToast('Transaction updated');
            }
          } else {
            await addTransaction(payload);
            if (impact?.type === 'exceeded') {
              showToast(`⚠️ Expense saved. Budget exceeded by ${formatCurrency(impact.overBy)}!`);
            } else if (impact?.type === 'warning') {
              showToast(`⚠️ Expense saved. Budget at ${impact.utilizationPct}% (${formatCurrency(impact.remaining)} left)`);
            } else {
              showToast(`${payload.type === 'income' ? 'Income' : 'Expense'} added to ledger`);
            }
          }
          closeModal();
          if (onDataChange) await onDataChange();
        } catch (err) {
          showToast(err.message || 'Failed to save transaction');
        }
      };

      if (impact && impact.type === 'exceeded') {
        openConfirmDialog({
          title: 'Budget Exceeded Warning',
          message: `This expense of ${formatCurrency(payload.amount)} will push your ${formatMonthLabel(impact.month)} spending to ${impact.utilizationPct}% of your limit, exceeding your ${formatCurrency(impact.monthlyLimit)} budget by ${formatCurrency(impact.overBy)}. Do you want to proceed?`,
          confirmLabel: 'Proceed Anyway',
          onConfirm: executeSave
        });
        return;
      }

      await executeSave();
    });
  }

  // Modal close triggers
  document.getElementById('tx-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('tx-modal-cancel')?.addEventListener('click', closeModal);
  modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Search, filter, sort listeners
  function renderHistory() {
    const { transactions, activeMonth } = getState();
    const filtered = filterAndSortTransactions(transactions, {
      search: searchInput?.value || '',
      type: typeFilter?.value || 'all',
      category: categoryFilter?.value || 'all',
      sortBy: sortSelect?.value || 'date-desc',
      month: activeMonth === 'all' ? 'all' : activeMonth
    });

    if (countLabel) {
      const scope = activeMonth === 'all' ? 'all months' : formatMonthLabel(activeMonth);
      countLabel.textContent = `Showing ${filtered.length} of ${transactions.length} transactions · ${scope}`;
    }

    if (tableContainer) {
      tableContainer.innerHTML = renderTransactionsTableHTML(filtered, {
        showActions: true,
        emptyTitle: 'No matching transactions'
      });
      refreshIcons();
    }
  }

  function renderEntryImpact() {
    const container = document.getElementById('entry-impact-summary');
    if (!container) return;
    const { transactions, activeMonth } = getState();
    const effectiveMonth = activeMonth === 'all' ? getTodayISO().slice(0, 7) : activeMonth;
    const summary = calculateSummary(transactions, effectiveMonth);

    container.innerHTML = `
      <div class="impact-row">
        <span class="impact-row-label">Current Total Balance</span>
        <span class="impact-row-val tabular-nums">${escapeHtml(formatCurrency(summary.totalBalance))}</span>
      </div>
      <div class="impact-row">
        <span class="impact-row-label">All-Time Income</span>
        <span class="impact-row-val tabular-nums text-income">${escapeHtml(formatCurrency(summary.totalIncome))}</span>
      </div>
      <div class="impact-row">
        <span class="impact-row-label">All-Time Expenses</span>
        <span class="impact-row-val tabular-nums text-expense">${escapeHtml(formatCurrency(summary.totalExpenses))}</span>
      </div>
      <div class="impact-row">
        <span class="impact-row-label">${escapeHtml(formatMonthLabel(effectiveMonth))} Income</span>
        <span class="impact-row-val tabular-nums text-income">${escapeHtml(formatCurrency(summary.monthlyIncome))}</span>
      </div>
      <div class="impact-row">
        <span class="impact-row-label">${escapeHtml(formatMonthLabel(effectiveMonth))} Spending</span>
        <span class="impact-row-val tabular-nums text-expense">${escapeHtml(formatCurrency(summary.monthlySpending))}</span>
      </div>
      <div class="impact-row">
        <span class="impact-row-label">Total Ledger Entries</span>
        <span class="impact-row-val tabular-nums">${summary.transactionCount}</span>
      </div>
    `;
  }

  searchInput?.addEventListener('input', renderHistory);
  typeFilter?.addEventListener('change', renderHistory);
  categoryFilter?.addEventListener('change', renderHistory);
  sortSelect?.addEventListener('change', renderHistory);
  clearFiltersBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (typeFilter) typeFilter.value = 'all';
    if (categoryFilter) categoryFilter.value = 'all';
    if (sortSelect) sortSelect.value = 'date-desc';
    renderHistory();
  });

  // Delegated edit/delete/add clicks across the document
  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-tx]');
    if (editBtn) {
      openModalForEdit(editBtn.dataset.editTx);
      return;
    }

    const deleteBtn = e.target.closest('[data-delete-tx]');
    if (deleteBtn) {
      requestDeleteTransaction(deleteBtn.dataset.deleteTx);
      return;
    }

    const addTrigger = e.target.closest('[data-open-add]');
    if (addTrigger) {
      openModalForCreate();
    }
  });

  return {
    render: () => {
      renderHistory();
      renderEntryImpact();
    },
    openModalForCreate,
    openModalForEdit,
    closeModal
  };
}
