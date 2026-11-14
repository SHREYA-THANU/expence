/**
 * budget.js
 * Monthly Budget Management calculations and UI controller.
 * - Set monthly budget
 * - Track monthly expenses
 * - Show remaining budget & utilization percentage
 * - Warning at >= 80% spending
 * - Alert when budget is exceeded (> 100%)
 */

import { saveBudget } from './storage.js';
import {
  formatCurrency,
  formatMonthLabel,
  getMonthKey,
  getTodayISO,
  escapeHtml
} from './transactions.js';

/**
 * Pure calculation function for monthly budget utilization.
 * @param {Array<Object>} transactions
 * @param {Object} budgetConfig
 * @param {string} targetMonth YYYY-MM
 * @returns {Object}
 */
export function calculateBudgetStatus(transactions, budgetConfig, targetMonth) {
  const effectiveMonth = targetMonth === 'all' ? getTodayISO().slice(0, 7) : targetMonth;
  const monthOverride = budgetConfig?.byMonth?.[effectiveMonth];
  const monthlyLimit = Number(
    monthOverride !== undefined ? monthOverride : budgetConfig?.monthlyLimit ?? 0
  );

  let monthlyExpenses = 0;
  const categoryTotals = {};

  for (const tx of transactions) {
    if (tx.type === 'expense' && getMonthKey(tx.date) === effectiveMonth) {
      const amount = Number(tx.amount) || 0;
      monthlyExpenses += amount;
      categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + amount;
    }
  }

  monthlyExpenses = Number(monthlyExpenses.toFixed(2));
  const remaining = Number((monthlyLimit - monthlyExpenses).toFixed(2));
  const utilizationPct = monthlyLimit > 0 ? Number(((monthlyExpenses / monthlyLimit) * 100).toFixed(1)) : 0;

  let status = 'healthy';
  if (monthlyLimit <= 0) {
    status = 'unset';
  } else if (utilizationPct > 100) {
    status = 'exceeded';
  } else if (utilizationPct >= 80) {
    status = 'warning';
  }

  const categoryBreakdown = Object.entries(categoryTotals)
    .map(([category, amount]) => ({
      category,
      amount: Number(amount.toFixed(2)),
      shareOfBudget: monthlyLimit > 0 ? Number(((amount / monthlyLimit) * 100).toFixed(1)) : 0,
      shareOfSpend: monthlyExpenses > 0 ? Number(((amount / monthlyExpenses) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    month: effectiveMonth,
    monthlyLimit,
    monthlyExpenses,
    remaining,
    utilizationPct,
    status,
    categoryBreakdown
  };
}

/**
 * Renders an alert banner HTML string for warning (>=80%) or exceeded (>100%) states.
 * Always pairs status colors with an icon and explicit text.
 */
export function renderBudgetAlertHTML(budgetStatus) {
  if (budgetStatus.status === 'exceeded') {
    const overBy = Math.abs(budgetStatus.remaining);
    return {
      className: 'is-danger',
      html: `
        <div class="alert-banner-content">
          <i data-lucide="alert-octagon"></i>
          <div>
            <strong>Budget Exceeded (${budgetStatus.utilizationPct}% used):</strong>
            You have exceeded your ${escapeHtml(formatMonthLabel(budgetStatus.month))} budget of ${escapeHtml(formatCurrency(budgetStatus.monthlyLimit))} by ${escapeHtml(formatCurrency(overBy))}.
          </div>
        </div>
      `
    };
  }

  if (budgetStatus.status === 'warning') {
    return {
      className: 'is-warning',
      html: `
        <div class="alert-banner-content">
          <i data-lucide="alert-triangle"></i>
          <div>
            <strong>Budget Warning (${budgetStatus.utilizationPct}% used):</strong>
            You have reached ${budgetStatus.utilizationPct}% of your ${escapeHtml(formatMonthLabel(budgetStatus.month))} budget. ${escapeHtml(formatCurrency(budgetStatus.remaining))} remaining.
          </div>
        </div>
      `
    };
  }

  return null;
}

/**
 * Controller for the Budget Management view.
 */
export function initBudgetController({ getState, onDataChange, showToast, refreshIcons }) {
  const form = document.getElementById('budget-form');
  const limitInput = document.getElementById('budget-limit-input');
  const limitError = document.getElementById('budget-error-limit');
  const monthLabel = document.getElementById('budget-month-label');
  const statusBanner = document.getElementById('budget-status-banner');
  const progressBlock = document.getElementById('budget-progress-block');
  const breakdownContainer = document.getElementById('budget-category-breakdown');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (limitError) limitError.textContent = '';
    limitInput?.classList.remove('is-invalid');

    const rawVal = Number(limitInput?.value);
    if (Number.isNaN(rawVal) || rawVal <= 0) {
      if (limitError) limitError.textContent = 'Enter a monthly budget greater than $0.';
      limitInput?.classList.add('is-invalid');
      return;
    }

    const { activeMonth } = getState();
    const targetMonth = activeMonth === 'all' ? getTodayISO().slice(0, 7) : activeMonth;
    try {
      await saveBudget(rawVal, targetMonth);
      showToast(`Monthly budget updated for ${formatMonthLabel(targetMonth)}`);
      if (onDataChange) await onDataChange();
    } catch (err) {
      showToast(err.message || 'Failed to save budget');
    }
  });

  function render() {
    const { transactions, budget, activeMonth } = getState();
    const status = calculateBudgetStatus(transactions, budget, activeMonth);

    if (monthLabel) {
      monthLabel.textContent = `Spending target for ${formatMonthLabel(status.month)}`;
    }
    if (limitInput && document.activeElement !== limitInput) {
      limitInput.value = status.monthlyLimit > 0 ? String(status.monthlyLimit) : '';
    }

    // Banner
    if (statusBanner) {
      const alertInfo = renderBudgetAlertHTML(status);
      if (alertInfo) {
        statusBanner.className = `alert-banner ${alertInfo.className}`;
        statusBanner.innerHTML = alertInfo.html;
      } else if (status.status === 'healthy') {
        statusBanner.className = 'alert-banner is-healthy';
        statusBanner.innerHTML = `
          <div class="alert-banner-content">
            <i data-lucide="check-circle-2"></i>
            <div>
              <strong>On Track (${status.utilizationPct}% used):</strong>
              ${escapeHtml(formatCurrency(status.remaining))} remaining in your ${escapeHtml(formatMonthLabel(status.month))} budget.
            </div>
          </div>
        `;
      } else {
        statusBanner.className = 'alert-banner hidden';
        statusBanner.innerHTML = '';
      }
    }

    // Progress block
    if (progressBlock) {
      const barWidth = Math.min(100, Math.max(0, status.utilizationPct));
      const fillClass =
        status.status === 'exceeded'
          ? 'is-danger'
          : status.status === 'warning'
            ? 'is-warning'
            : '';

      const remainingLabel = status.remaining >= 0 ? 'Remaining Budget' : 'Over Budget By';
      const remainingColor =
        status.remaining < 0
          ? 'text-expense'
          : status.status === 'warning'
            ? 'text-warning'
            : 'text-income';

      progressBlock.innerHTML = `
        <div class="budget-numbers-grid">
          <div class="budget-stat">
            <span class="budget-stat-label">Monthly Budget</span>
            <span class="budget-stat-value tabular-nums">${escapeHtml(formatCurrency(status.monthlyLimit))}</span>
          </div>
          <div class="budget-stat">
            <span class="budget-stat-label">Monthly Expenses</span>
            <span class="budget-stat-value tabular-nums">${escapeHtml(formatCurrency(status.monthlyExpenses))}</span>
          </div>
          <div class="budget-stat">
            <span class="budget-stat-label">${remainingLabel}</span>
            <span class="budget-stat-value tabular-nums ${remainingColor}">
              ${escapeHtml(formatCurrency(Math.abs(status.remaining)))}
            </span>
          </div>
        </div>

        <div class="progress-track" role="progressbar" aria-valuenow="${Math.min(100, Math.round(status.utilizationPct))}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-fill ${fillClass}" style="width: ${barWidth}%;"></div>
        </div>

        <div class="progress-footer">
          <span>Budget utilization</span>
          <strong class="tabular-nums">${status.utilizationPct}%</strong>
        </div>
      `;
    }

    // Category Breakdown Table
    if (breakdownContainer) {
      if (!status.categoryBreakdown.length) {
        breakdownContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon"><i data-lucide="wallet"></i></div>
            <div class="empty-state-title">No expenses recorded in ${escapeHtml(formatMonthLabel(status.month))}</div>
            <p class="empty-state-desc">Expenses logged in this month will appear here with their share of your budget.</p>
          </div>
        `;
      } else {
        const rows = status.categoryBreakdown
          .map(
            (row) => `
              <tr>
                <td><strong>${escapeHtml(row.category)}</strong></td>
                <td class="align-right tabular-nums">${escapeHtml(formatCurrency(row.amount))}</td>
                <td>
                  <div class="inline-bar-cell">
                    <div class="inline-bar-track">
                      <div class="inline-bar-fill" style="width: ${Math.min(100, row.shareOfBudget)}%;"></div>
                    </div>
                    <span class="tabular-nums text-muted" style="min-width: 44px; text-align: right;">${row.shareOfBudget}%</span>
                  </div>
                </td>
              </tr>
            `
          )
          .join('');

        breakdownContainer.innerHTML = `
          <table class="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th class="align-right">Spent</th>
                <th>Share of Budget</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        `;
      }
    }

    refreshIcons();
  }

  return { render };
}
