/**
 * app.js
 * Application Entry & Orchestrator.
 * Connects storage, views, navigation, global month selector,
 * modal confirmations, CSV export, and reactive re-rendering.
 */

import {
  seedSampleDataIfNeeded,
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
import { initBudgetController } from './budget.js';

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transaction History',
  'add-entry': 'Add Income or Expense',
  analytics: 'Expense Analytics',
  budget: 'Budget Management'
};

document.addEventListener('DOMContentLoaded', () => {
  // Seed initial sample data on first visit only
  seedSampleDataIfNeeded();

  const state = {
    activeView: 'dashboard',
    activeMonth: getTodayISO().slice(0, 7),
    transactions: getTransactions(),
    budget: getBudget()
  };

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

  function renderActiveViews() {
    dashboardCtrl.render();
    transactionsCtrl.render();
    analyticsCtrl.render();
    budgetCtrl.render();
  }

  function reloadAndRender() {
    state.transactions = getTransactions();
    state.budget = getBudget();
    populateMonthSelector();
    renderActiveViews();
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
    const txs = getTransactions();
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
      onConfirm: () => {
        resetToSampleData();
        state.activeMonth = getTodayISO().slice(0, 7);
        reloadAndRender();
        showToast('Sample data restored');
      }
    });
  });

  // Initial Render
  populateMonthSelector();
  renderActiveViews();
  refreshIcons();
});
