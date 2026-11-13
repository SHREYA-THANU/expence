/**
 * analytics.js
 * Expense Analytics View Controller:
 * - Category-wise expense breakdown
 * - Monthly income versus expenses
 * - Spending distribution
 * - Highest spending category
 * - Total savings & savings rate
 * - Dynamic Chart.js visualizations
 */

import {
  formatCurrency,
  getMonthKey,
  getTodayISO,
  escapeHtml
} from './transactions.js';
import { buildMonthlySeries } from './dashboard.js';

const ANALYTICS_COLORS = [
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
 * Filters transactions for the selected analytics timeframe.
 * @param {Array<Object>} transactions
 * @param {'month'|'3m'|'6m'|'all'} period
 * @param {string} activeMonth YYYY-MM or 'all'
 * @returns {Array<Object>}
 */
export function filterByAnalyticsPeriod(transactions, period, activeMonth) {
  if (period === 'all') return transactions;

  const anchor = activeMonth === 'all' ? getTodayISO().slice(0, 7) : activeMonth;
  const [y, m] = anchor.split('-').map(Number);

  const monthsCount = period === 'month' ? 1 : period === '3m' ? 3 : 6;
  const allowedMonths = new Set();

  for (let i = 0; i < monthsCount; i++) {
    const d = new Date(y, m - 1 - i, 1);
    allowedMonths.add(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    );
  }

  return transactions.filter((tx) => allowedMonths.has(getMonthKey(tx.date)));
}

/**
 * Pure analytics computation function.
 * @param {Array<Object>} transactions
 * @param {'month'|'3m'|'6m'|'all'} period
 * @param {string} activeMonth
 * @returns {Object}
 */
export function computeAnalytics(transactions, period, activeMonth) {
  const scoped = filterByAnalyticsPeriod(transactions, period, activeMonth);

  let periodIncome = 0;
  let periodExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  const categoryStats = {};

  for (const tx of scoped) {
    const amount = Number(tx.amount) || 0;
    if (tx.type === 'income') {
      periodIncome += amount;
      incomeCount += 1;
    } else {
      periodExpenses += amount;
      expenseCount += 1;
      if (!categoryStats[tx.category]) {
        categoryStats[tx.category] = { category: tx.category, amount: 0, count: 0 };
      }
      categoryStats[tx.category].amount += amount;
      categoryStats[tx.category].count += 1;
    }
  }

  periodIncome = Number(periodIncome.toFixed(2));
  periodExpenses = Number(periodExpenses.toFixed(2));
  const totalSavings = Number((periodIncome - periodExpenses).toFixed(2));
  const savingsRate =
    periodIncome > 0 ? Number(((totalSavings / periodIncome) * 100).toFixed(1)) : 0;

  const categories = Object.values(categoryStats)
    .map((item) => ({
      ...item,
      amount: Number(item.amount.toFixed(2)),
      pct:
        periodExpenses > 0
          ? Number(((item.amount / periodExpenses) * 100).toFixed(1))
          : 0
    }))
    .sort((a, b) => b.amount - a.amount);

  const highestCategory = categories.length > 0 ? categories[0] : null;

  return {
    periodIncome,
    periodExpenses,
    incomeCount,
    expenseCount,
    totalSavings,
    savingsRate,
    highestCategory,
    categories
  };
}

/**
 * Initializes the Expense Analytics view controller.
 */
export function initAnalyticsController({ getState, refreshIcons }) {
  let period = 'month';
  let incomeExpenseChart = null;
  let distributionChart = null;

  const periodButtons = document.querySelectorAll('#analytics-period-control [data-period]');
  periodButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      period = btn.dataset.period;
      periodButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
      render();
    });
  });

  function renderMetrics(stats) {
    const savingsEl = document.getElementById('analytics-total-savings');
    const rateEl = document.getElementById('analytics-savings-rate');
    const topCatEl = document.getElementById('analytics-top-category');
    const topCatMetaEl = document.getElementById('analytics-top-category-meta');
    const incomeEl = document.getElementById('analytics-period-income');
    const incomeCountEl = document.getElementById('analytics-income-count');
    const expensesEl = document.getElementById('analytics-period-expenses');
    const expenseCountEl = document.getElementById('analytics-expense-count');

    if (savingsEl) {
      savingsEl.textContent = formatCurrency(stats.totalSavings);
      savingsEl.classList.toggle('text-income', stats.totalSavings >= 0);
      savingsEl.classList.toggle('text-expense', stats.totalSavings < 0);
    }
    if (rateEl) {
      rateEl.textContent =
        stats.periodIncome > 0
          ? `${stats.savingsRate}% of period income saved`
          : 'No income recorded in period';
    }
    if (topCatEl) {
      topCatEl.textContent = stats.highestCategory ? stats.highestCategory.category : '—';
    }
    if (topCatMetaEl) {
      topCatMetaEl.textContent = stats.highestCategory
        ? `${formatCurrency(stats.highestCategory.amount)} (${stats.highestCategory.pct}% of spending)`
        : 'No expenses in selected period';
    }
    if (incomeEl) incomeEl.textContent = formatCurrency(stats.periodIncome);
    if (incomeCountEl) {
      incomeCountEl.textContent = `${stats.incomeCount} income ${stats.incomeCount === 1 ? 'entry' : 'entries'}`;
    }
    if (expensesEl) expensesEl.textContent = formatCurrency(stats.periodExpenses);
    if (expenseCountEl) {
      expenseCountEl.textContent = `${stats.expenseCount} expense ${stats.expenseCount === 1 ? 'entry' : 'entries'}`;
    }
  }

  function renderIncomeVsExpenseChart(transactions, activeMonth) {
    const canvas = document.getElementById('analytics-income-expense-chart');
    const emptyEl = document.getElementById('analytics-ie-empty');
    if (!canvas) return;

    const anchor = activeMonth === 'all' ? getTodayISO().slice(0, 7) : activeMonth;
    const monthsToShow = period === '3m' ? 3 : 6;
    const series = buildMonthlySeries(transactions, anchor, monthsToShow);
    const hasData = series.some((item) => item.income > 0 || item.expenses > 0);

    if (!hasData || typeof window.Chart === 'undefined') {
      if (incomeExpenseChart) {
        incomeExpenseChart.destroy();
        incomeExpenseChart = null;
      }
      canvas.classList.add('hidden');
      emptyEl?.classList.remove('hidden');
      return;
    }

    canvas.classList.remove('hidden');
    emptyEl?.classList.add('hidden');

    if (incomeExpenseChart) incomeExpenseChart.destroy();

    incomeExpenseChart = new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: series.map((s) => s.label),
        datasets: [
          {
            label: 'Income',
            data: series.map((s) => s.income),
            backgroundColor: '#16a34a',
            borderRadius: 4
          },
          {
            label: 'Expenses',
            data: series.map((s) => s.expenses),
            backgroundColor: '#dc2626',
            borderRadius: 4
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
              color: '#475569'
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
            ticks: { color: '#64748b' }
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

  function renderDistributionChart(stats) {
    const canvas = document.getElementById('analytics-distribution-chart');
    const emptyEl = document.getElementById('analytics-dist-empty');
    if (!canvas) return;

    if (!stats.categories.length || typeof window.Chart === 'undefined') {
      if (distributionChart) {
        distributionChart.destroy();
        distributionChart = null;
      }
      canvas.classList.add('hidden');
      emptyEl?.classList.remove('hidden');
      return;
    }

    canvas.classList.remove('hidden');
    emptyEl?.classList.add('hidden');

    if (distributionChart) distributionChart.destroy();

    const colors = stats.categories.map(
      (_, idx) => ANALYTICS_COLORS[idx % ANALYTICS_COLORS.length]
    );

    distributionChart = new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: stats.categories.map((c) => c.category),
        datasets: [
          {
            label: 'Spending',
            data: stats.categories.map((c) => c.amount),
            backgroundColor: colors,
            borderRadius: 4
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            callbacks: {
              label: (ctx) => {
                const item = stats.categories[ctx.dataIndex];
                return `${formatCurrency(item.amount)} (${item.pct}%)`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: '#f1f5f9' },
            ticks: {
              color: '#64748b',
              font: { family: "'JetBrains Mono', monospace", size: 11 },
              callback: (val) => `$${Number(val).toLocaleString()}`
            }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#0f172a', font: { size: 12, weight: 500 } }
          }
        }
      }
    });
  }

  function renderCategoryTable(stats) {
    const container = document.getElementById('analytics-category-table');
    if (!container) return;

    if (!stats.categories.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i data-lucide="pie-chart"></i></div>
          <div class="empty-state-title">No expense data in this timeframe</div>
          <p class="empty-state-desc">Add expense entries or switch timeframes to analyze category spending.</p>
        </div>
      `;
      return;
    }

    const rows = stats.categories
      .map(
        (row, idx) => `
          <tr>
            <td>
              <span style="display: inline-flex; align-items: center; gap: 8px;">
                <span class="legend-swatch" style="background-color: ${ANALYTICS_COLORS[idx % ANALYTICS_COLORS.length]};"></span>
                <strong>${escapeHtml(row.category)}</strong>
              </span>
            </td>
            <td class="align-right tabular-nums">${row.count}</td>
            <td class="align-right tabular-nums" style="font-weight: 600;">${escapeHtml(formatCurrency(row.amount))}</td>
            <td>
              <div class="inline-bar-cell">
                <div class="inline-bar-track">
                  <div class="inline-bar-fill" style="width: ${row.pct}%; background-color: ${ANALYTICS_COLORS[idx % ANALYTICS_COLORS.length]};"></div>
                </div>
                <span class="tabular-nums text-muted" style="min-width: 44px; text-align: right;">${row.pct}%</span>
              </div>
            </td>
          </tr>
        `
      )
      .join('');

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Category</th>
            <th class="align-right">Transactions</th>
            <th class="align-right">Total Spent</th>
            <th>Share of Spending</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function render() {
    const { transactions, activeMonth } = getState();
    const stats = computeAnalytics(transactions, period, activeMonth);

    renderMetrics(stats);
    renderIncomeVsExpenseChart(transactions, activeMonth);
    renderDistributionChart(stats);
    renderCategoryTable(stats);
    refreshIcons();
  }

  return { render };
}
