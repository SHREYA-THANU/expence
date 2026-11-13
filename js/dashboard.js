/**
 * dashboard.js
 * Dashboard View Controller:
 * - Total Balance, Total Income, Total Expenses, Monthly Spending KPIs
 * - Monthly Spending Overview chart (Chart.js)
 * - Expense Category Breakdown chart (Chart.js)
 * - Recent Transactions list
 * - Monthly Budget quick status & alerts
 */

import {
  calculateSummary,
  filterAndSortTransactions,
  renderTransactionsTableHTML,
  formatCurrency,
  formatMonthLabel,
  getMonthKey,
  getTodayISO,
  escapeHtml
} from './transactions.js';
import { calculateBudgetStatus, renderBudgetAlertHTML } from './budget.js';

const CHART_PALETTE = [
  '#2563eb',
  '#0f172a',
  '#0d9488',
  '#d97706',
  '#475569',
  '#6366f1',
  '#16a34a',
  '#dc2626',
  '#94a3b8'
];

/**
 * Computes monthly income vs expenses series for the last N months up to anchorMonth.
 * @param {Array<Object>} transactions
 * @param {string} anchorMonth YYYY-MM
 * @param {number} count
 * @returns {Array<Object>}
 */
export function buildMonthlySeries(transactions, anchorMonth, count = 6) {
  const [y, m] = anchorMonth.split('-').map(Number);
  const months = [];

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const shortLabel = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: '2-digit'
    }).format(d);

    months.push({ key, label: shortLabel, income: 0, expenses: 0 });
  }

  const map = new Map(months.map((item) => [item.key, item]));
  for (const tx of transactions) {
    const key = getMonthKey(tx.date);
    const bucket = map.get(key);
    if (!bucket) continue;
    if (tx.type === 'income') {
      bucket.income += Number(tx.amount) || 0;
    } else {
      bucket.expenses += Number(tx.amount) || 0;
    }
  }

  return months.map((item) => ({
    ...item,
    income: Number(item.income.toFixed(2)),
    expenses: Number(item.expenses.toFixed(2))
  }));
}

/**
 * Computes category-wise expense totals for a specific month or 'all'.
 * @param {Array<Object>} transactions
 * @param {string} monthFilter YYYY-MM or 'all'
 * @returns {Array<Object>}
 */
export function buildCategoryBreakdown(transactions, monthFilter) {
  const totals = {};
  let totalSpent = 0;

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    if (monthFilter !== 'all' && getMonthKey(tx.date) !== monthFilter) continue;
    const amount = Number(tx.amount) || 0;
    totals[tx.category] = (totals[tx.category] || 0) + amount;
    totalSpent += amount;
  }

  return Object.entries(totals)
    .map(([category, amount]) => ({
      category,
      amount: Number(amount.toFixed(2)),
      pct: totalSpent > 0 ? Number(((amount / totalSpent) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Initializes and returns the Dashboard controller.
 */
export function initDashboardController({ getState, refreshIcons }) {
  let monthlyChart = null;
  let categoryChart = null;

  function renderKPIs(transactions, effectiveMonth, activeMonth) {
    const summary = calculateSummary(transactions, effectiveMonth);

    const balanceEl = document.getElementById('kpi-total-balance');
    const incomeEl = document.getElementById('kpi-total-income');
    const expensesEl = document.getElementById('kpi-total-expenses');
    const monthlyEl = document.getElementById('kpi-monthly-spending');
    const monthlyMetaEl = document.getElementById('kpi-monthly-meta');
    const balanceMetaEl = document.getElementById('kpi-balance-meta');

    if (balanceEl) {
      balanceEl.textContent = formatCurrency(summary.totalBalance);
      balanceEl.classList.toggle('text-expense', summary.totalBalance < 0);
    }
    if (incomeEl) incomeEl.textContent = formatCurrency(summary.totalIncome);
    if (expensesEl) expensesEl.textContent = formatCurrency(summary.totalExpenses);
    if (monthlyEl) monthlyEl.textContent = formatCurrency(summary.monthlySpending);

    if (monthlyMetaEl) {
      monthlyMetaEl.textContent = `${formatMonthLabel(effectiveMonth)} outflows`;
    }
    if (balanceMetaEl) {
      const monthNet = summary.netMonthlySavings;
      const sign = monthNet >= 0 ? '+' : '';
      balanceMetaEl.textContent =
        activeMonth === 'all'
          ? `Net across ${summary.transactionCount} entries`
          : `${formatMonthLabel(effectiveMonth)} net: ${sign}${formatCurrency(monthNet)}`;
    }
  }

  function renderMonthlyChart(transactions, effectiveMonth) {
    const canvas = document.getElementById('dashboard-monthly-chart');
    const emptyEl = document.getElementById('dashboard-monthly-empty');
    if (!canvas) return;

    const series = buildMonthlySeries(transactions, effectiveMonth, 6);
    const hasData = series.some((pt) => pt.income > 0 || pt.expenses > 0);

    if (!hasData || typeof window.Chart === 'undefined') {
      if (monthlyChart) {
        monthlyChart.destroy();
        monthlyChart = null;
      }
      canvas.classList.add('hidden');
      emptyEl?.classList.remove('hidden');
      return;
    }

    canvas.classList.remove('hidden');
    emptyEl?.classList.add('hidden');

    if (monthlyChart) {
      monthlyChart.destroy();
    }

    monthlyChart = new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: series.map((s) => s.label),
        datasets: [
          {
            label: 'Income',
            data: series.map((s) => s.income),
            backgroundColor: '#16a34a',
            borderRadius: 4,
            barPercentage: 0.65,
            categoryPercentage: 0.68
          },
          {
            label: 'Expenses',
            data: series.map((s) => s.expenses),
            backgroundColor: '#0f172a',
            borderRadius: 4,
            barPercentage: 0.65,
            categoryPercentage: 0.68
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              pointStyle: 'rectRounded',
              color: '#475569',
              font: { family: "'DM Sans', sans-serif", size: 12 }
            }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { size: 12 } }
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: '#f1f5f9' },
            ticks: {
              color: '#64748b',
              font: { family: "'JetBrains Mono', monospace", size: 11 },
              callback: (val) => `$${Number(val).toLocaleString()}`
            }
          }
        }
      }
    });
  }

  function renderCategoryChart(transactions, activeMonth) {
    const canvas = document.getElementById('dashboard-category-chart');
    const emptyEl = document.getElementById('dashboard-category-empty');
    const legendEl = document.getElementById('dashboard-category-legend');
    const subtitleEl = document.getElementById('dashboard-category-subtitle');

    if (subtitleEl) {
      subtitleEl.textContent = `${formatMonthLabel(activeMonth)} distribution`;
    }

    const breakdown = buildCategoryBreakdown(transactions, activeMonth);

    if (!breakdown.length || typeof window.Chart === 'undefined') {
      if (categoryChart) {
        categoryChart.destroy();
        categoryChart = null;
      }
      canvas?.classList.add('hidden');
      emptyEl?.classList.remove('hidden');
      if (legendEl) legendEl.innerHTML = '';
      return;
    }

    canvas?.classList.remove('hidden');
    emptyEl?.classList.add('hidden');

    if (categoryChart) {
      categoryChart.destroy();
    }

    const colors = breakdown.map((_, idx) => CHART_PALETTE[idx % CHART_PALETTE.length]);

    categoryChart = new window.Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: breakdown.map((b) => b.category),
        datasets: [
          {
            data: breakdown.map((b) => b.amount),
            backgroundColor: colors,
            borderColor: '#ffffff',
            borderWidth: 2,
            hoverOffset: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            callbacks: {
              label: (ctx) => {
                const item = breakdown[ctx.dataIndex];
                return `${item.category}: ${formatCurrency(item.amount)} (${item.pct}%)`;
              }
            }
          }
        }
      }
    });

    if (legendEl) {
      legendEl.innerHTML = breakdown
        .slice(0, 5)
        .map(
          (item, idx) => `
            <li class="compact-legend-item">
              <span class="compact-legend-left">
                <span class="legend-swatch" style="background-color: ${colors[idx]};"></span>
                <span>${escapeHtml(item.category)}</span>
              </span>
              <span class="compact-legend-right tabular-nums">
                <span>${escapeHtml(formatCurrency(item.amount))}</span>
                <span class="text-muted">${item.pct}%</span>
              </span>
            </li>
          `
        )
        .join('');
    }
  }

  function renderRecentTransactions(transactions, activeMonth) {
    const container = document.getElementById('dashboard-recent-list');
    if (!container) return;

    const recent = filterAndSortTransactions(transactions, {
      month: activeMonth,
      sortBy: 'date-desc'
    }).slice(0, 6);

    container.innerHTML = renderTransactionsTableHTML(recent, {
      showActions: true,
      emptyTitle: `No transactions in ${formatMonthLabel(activeMonth)}`
    });
  }

  function renderBudgetSummary(transactions, budget, effectiveMonth) {
    const alertBanner = document.getElementById('dashboard-budget-alert');
    const summaryEl = document.getElementById('dashboard-budget-summary');
    const subtitleEl = document.getElementById('dashboard-budget-subtitle');

    const status = calculateBudgetStatus(transactions, budget, effectiveMonth);

    if (subtitleEl) {
      subtitleEl.textContent = `${formatMonthLabel(status.month)} tracking`;
    }

    if (alertBanner) {
      const alertInfo = renderBudgetAlertHTML(status);
      if (alertInfo) {
        alertBanner.className = `alert-banner ${alertInfo.className}`;
        alertBanner.innerHTML = `${alertInfo.html}
          <button type="button" class="link-btn" data-goto="budget">Review budget</button>`;
      } else {
        alertBanner.className = 'alert-banner hidden';
        alertBanner.innerHTML = '';
      }
    }

    if (!summaryEl) return;

    if (status.status === 'unset') {
      summaryEl.innerHTML = `
        <div class="empty-state" style="padding: 20px 10px;">
          <div class="empty-state-title">No monthly budget set</div>
          <p class="empty-state-desc">Set a monthly spending limit to track utilization and receive alerts.</p>
          <button type="button" class="btn btn-secondary" data-goto="budget">Set Monthly Budget</button>
        </div>
      `;
      return;
    }

    const barWidth = Math.min(100, Math.max(0, status.utilizationPct));
    const fillClass =
      status.status === 'exceeded'
        ? 'is-danger'
        : status.status === 'warning'
          ? 'is-warning'
          : '';
    const remainingText =
      status.remaining >= 0
        ? `${formatCurrency(status.remaining)} remaining`
        : `${formatCurrency(Math.abs(status.remaining))} over limit`;

    summaryEl.innerHTML = `
      <div class="budget-numbers-grid" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
        <div class="budget-stat">
          <span class="budget-stat-label">Monthly Limit</span>
          <span class="budget-stat-value tabular-nums">${escapeHtml(formatCurrency(status.monthlyLimit))}</span>
        </div>
        <div class="budget-stat">
          <span class="budget-stat-label">Spent So Far</span>
          <span class="budget-stat-value tabular-nums">${escapeHtml(formatCurrency(status.monthlyExpenses))}</span>
        </div>
      </div>

      <div class="progress-track" role="progressbar" aria-valuenow="${Math.min(100, Math.round(status.utilizationPct))}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-fill ${fillClass}" style="width: ${barWidth}%;"></div>
      </div>

      <div class="progress-footer">
        <span class="${status.remaining < 0 ? 'text-expense' : ''}">${escapeHtml(remainingText)}</span>
        <strong class="tabular-nums">${status.utilizationPct}% used</strong>
      </div>
    `;
  }

  function render() {
    const { transactions, budget, activeMonth } = getState();
    const effectiveMonth = activeMonth === 'all' ? getTodayISO().slice(0, 7) : activeMonth;

    renderKPIs(transactions, effectiveMonth, activeMonth);
    renderMonthlyChart(transactions, effectiveMonth);
    renderCategoryChart(transactions, activeMonth);
    renderRecentTransactions(transactions, activeMonth);
    renderBudgetSummary(transactions, budget, effectiveMonth);
    refreshIcons();
  }

  return { render };
}
