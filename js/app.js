/**
 * app.js
 * Application Entry & Orchestrator.
 * Connects storage, views, navigation, global month selector,
 * modal confirmations, CSV export, and reactive re-rendering.
 */

import {
  seedSampleDataIfNeeded,
  migrateLocalStorageIfNeeded,
  getTransactions,
  getBudget,
  resetToSampleData
} from './storage.js';
import {
  initTransactionsController,
  formatMonthLabel,
  getMonthKey,
  getTodayISO
} from './transactions.js';
import { initDashboardController } from './dashboard.js';
import { initAnalyticsController } from './analytics.js';
import { initBudgetController, calculateBudgetStatus } from './budget.js';

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transaction History',
  'add-entry': 'Add Income or Expense',
  analytics: 'Expense Analytics',
  budget: 'Budget Management'
};

document.addEventListener('DOMContentLoaded', async () => {
  const state = {
    activeView: 'dashboard',
    activeMonth: getTodayISO().slice(0, 7),
    transactions: [],
    budget: { monthlyLimit: 3200, byMonth: {}, updatedAt: '' }
  };

  const statusBanner = document.getElementById('backend-status-banner');
  const statusMessage = document.getElementById('backend-status-message');
  const loadingIndicator = document.getElementById('app-loading-state');

  function showBackendError(msg) {
    if (statusBanner) {
      if (statusMessage) statusMessage.textContent = msg;
      statusBanner.classList.remove('hidden');
    }
  }

  function hideBackendError() {
    if (statusBanner) {
      statusBanner.classList.add('hidden');
    }
  }

  function setLoading(isLoading) {
    if (loadingIndicator) {
      loadingIndicator.classList.toggle('hidden', !isLoading);
    }
  }

  function getState() {
    return state;
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // Toast Notification Helper
  function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i data-lucide="check-circle-2"></i><span></span>`;
    toast.querySelector('span').textContent = message;
    container.appendChild(toast);
    refreshIcons();

    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 220);
    }, 2800);
  }

  // Confirmation Dialog Helper (replaces window.confirm cleanly)
  const confirmModal = document.getElementById('confirm-modal');
  const confirmTitle = document.getElementById('confirm-modal-title');
  const confirmMessage = document.getElementById('confirm-modal-message');
  const confirmOkBtn = document.getElementById('confirm-modal-ok');
  let pendingConfirmCallback = null;

  function openConfirmDialog({ title, message, confirmLabel = 'Confirm', onConfirm }) {
    if (!confirmModal) return;
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = confirmLabel;
    pendingConfirmCallback = onConfirm;
    confirmModal.classList.remove('hidden');
  }

  function closeConfirmDialog() {
    confirmModal?.classList.add('hidden');
    pendingConfirmCallback = null;
  }

  confirmOkBtn?.addEventListener('click', () => {
    const cb = pendingConfirmCallback;
    closeConfirmDialog();
    if (typeof cb === 'function') cb();
  });

  document.getElementById('confirm-modal-cancel')?.addEventListener('click', closeConfirmDialog);
  document.getElementById('confirm-modal-close')?.addEventListener('click', closeConfirmDialog);
  confirmModal?.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeConfirmDialog();
  });

  // Global Month Selector
  const monthSelect = document.getElementById('global-month-select');

  function populateMonthSelector() {
    if (!monthSelect) return;
    const currentMonth = getTodayISO().slice(0, 7);
    const months = new Set([currentMonth]);

    state.transactions.forEach((tx) => {
      const m = getMonthKey(tx.date);
      if (m) months.add(m);
    });

    const sorted = Array.from(months).sort((a, b) => b.localeCompare(a));
    if (!sorted.includes(state.activeMonth) && state.activeMonth !== 'all') {
      state.activeMonth = currentMonth;
    }

    monthSelect.innerHTML =
      sorted
        .map((m) => `<option value="${m}">${formatMonthLabel(m)}</option>`)
        .join('') + '<option value="all">All Time</option>';

    monthSelect.value = state.activeMonth;
  }

  monthSelect?.addEventListener('change', () => {
    state.activeMonth = monthSelect.value;
    renderActiveViews();
  });

  // Initialize Feature Controllers
  const transactionsCtrl = initTransactionsController({
    getState,
    onDataChange: reloadAndRender,
    openConfirmDialog,
    showToast,
    refreshIcons
  });

  const dashboardCtrl = initDashboardController({
    getState,
    refreshIcons
  });

  const analyticsCtrl = initAnalyticsController({
    getState,
    refreshIcons
  });

  const budgetCtrl = initBudgetController({
    getState,
    onDataChange: reloadAndRender,
    showToast,
    refreshIcons
  });

  function updateTopbarBudgetPill() {
    const pill = document.getElementById('topbar-budget-pill');
    if (!pill) return;
    const { transactions, budget, activeMonth } = state;
    const effectiveMonth = activeMonth === 'all' ? getTodayISO().slice(0, 7) : activeMonth;
    const status = calculateBudgetStatus(transactions, budget, effectiveMonth);

    if (status.status === 'exceeded') {
      pill.className = 'tx-type-label text-expense';
      pill.style.background = 'var(--color-danger-subtle, #fef2f2)';
      pill.style.border = '1px solid var(--color-danger-border, #fecaca)';
      pill.innerHTML = `<i data-lucide="alert-octagon"></i><span>Budget Exceeded (${status.utilizationPct}%)</span>`;
      pill.classList.remove('hidden');
    } else if (status.status === 'warning') {
      pill.className = 'tx-type-label text-warning';
      pill.style.background = 'var(--color-warning-subtle, #fffbeb)';
      pill.style.border = '1px solid var(--color-warning-border, #fde68a)';
      pill.innerHTML = `<i data-lucide="alert-triangle"></i><span>Budget Alert (${status.utilizationPct}%)</span>`;
      pill.classList.remove('hidden');
    } else {
      pill.classList.add('hidden');
    }
  }

  function renderActiveViews() {
    dashboardCtrl.render();
    transactionsCtrl.render();
    analyticsCtrl.render();
    budgetCtrl.render();
    updateTopbarBudgetPill();
  }

  async function reloadAndRender() {
    try {
      state.transactions = await getTransactions();
      state.budget = await getBudget();
      hideBackendError();
      populateMonthSelector();
      renderActiveViews();
    } catch (err) {
      console.error('Failed to reload data from backend:', err);
      showBackendError('Unable to connect to backend server. Make sure the Node server is running.');
    }
  }

  // Navigation & Mobile Drawer
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const navLinks = document.querySelectorAll('.nav-link[data-view]');
  const viewPanels = document.querySelectorAll('.view-panel');
  const topbarTitle = document.getElementById('topbar-title');

  function openMobileSidebar() {
    sidebar?.classList.add('is-open');
    backdrop?.classList.add('is-open');
  }

  function closeMobileSidebar() {
    sidebar?.classList.remove('is-open');
    backdrop?.classList.remove('is-open');
  }

  function navigateTo(viewId) {
    if (!VIEW_TITLES[viewId]) return;
    state.activeView = viewId;

    navLinks.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.view === viewId);
    });

    viewPanels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.id === `view-${viewId}`);
    });

    if (topbarTitle) {
      topbarTitle.textContent = VIEW_TITLES[viewId];
    }

    closeMobileSidebar();
    renderActiveViews();
  }

  navLinks.forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  document.addEventListener('click', (e) => {
    const gotoEl = e.target.closest('[data-goto]');
    if (gotoEl) {
      navigateTo(gotoEl.dataset.goto);
      return;
    }

    const navEl = e.target.closest('[data-nav]');
    if (navEl) {
      e.preventDefault();
      navigateTo(navEl.dataset.nav);
    }
  });

  document.getElementById('sidebar-open-btn')?.addEventListener('click', openMobileSidebar);
  document.getElementById('sidebar-close-btn')?.addEventListener('click', closeMobileSidebar);
  backdrop?.addEventListener('click', closeMobileSidebar);

  // Topbar "+ Add Transaction" CTA
  document.getElementById('open-entry-modal-btn')?.addEventListener('click', () => {
    transactionsCtrl.openModalForCreate('expense');
  });

  // Escape key closes open modals/drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      transactionsCtrl.closeModal();
      closeConfirmDialog();
      closeMobileSidebar();
    }
  });

  // CSV Export Utility
  document.getElementById('export-csv-btn')?.addEventListener('click', () => {
    const txs = state.transactions || [];
    if (!txs.length) {
      showToast('No transactions to export');
      return;
    }

    const headers = ['id', 'title', 'amount', 'category', 'type', 'date', 'description'];
    const csvRows = [
      headers.join(','),
      ...txs.map((tx) =>
        headers
          .map((key) => `"${String(tx[key] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ledgerflow-transactions-${getTodayISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Transactions exported to CSV');
  });

  // Reset Demo Data Utility
  document.getElementById('reset-demo-btn')?.addEventListener('click', () => {
    openConfirmDialog({
      title: 'Reset Sample Data',
      message:
        'Restore default sample transactions and monthly budget? Any custom entries you added will be replaced.',
      confirmLabel: 'Reset Data',
      onConfirm: async () => {
        try {
          await resetToSampleData();
          state.activeMonth = getTodayISO().slice(0, 7);
          await reloadAndRender();
          showToast('Sample data restored');
        } catch (err) {
          showToast(err.message || 'Error restoring sample data');
        }
      }
    });
  });

  // Initial Bootup Sequence: Migration, Seeding, and Initial Render
  setLoading(true);
  try {
    const migrationResult = await migrateLocalStorageIfNeeded();
    if (migrationResult.migrated && (migrationResult.txCount > 0 || migrationResult.budgetCount > 0)) {
      showToast(`Migrated ${migrationResult.txCount} transactions and ${migrationResult.budgetCount} budgets.`);
    }

    await seedSampleDataIfNeeded();
    await reloadAndRender();
  } catch (err) {
    console.error('Initialization error:', err);
    showBackendError('Failed to initialize app. Ensure Express is running on http://localhost:3000.');
  } finally {
    setLoading(false);
  }

  refreshIcons();
});
