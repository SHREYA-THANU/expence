# LedgerFlow — Personal Expense & Budget Tracker

A clean, modular personal finance dashboard built strictly with **HTML5**, **CSS3**, and **Vanilla JavaScript** (ES modules), using **Chart.js** and **Lucide Icons** via CDN, and **LocalStorage** for client-side persistence.

## Folder Structure

```text
.
├── index.html          # Application shell, sidebar, topbar, 5 feature views, and modals
├── css/
│   └── style.css       # Minimalist light-mode stylesheet, responsive layout, tabular numerals
├── js/
│   ├── app.js          # App bootstrapper, view router, global month selector, CSV export
│   ├── storage.js      # Centralized LocalStorage repository layer (future REST API seam)
│   ├── transactions.js # Pure summary/filter/validation logic & Transaction History/Entry UI
│   ├── dashboard.js    # Dashboard KPIs, Monthly Overview & Category Breakdown charts
│   ├── analytics.js    # Cashflow analytics, savings rate, highest spend category & charts
│   └── budget.js       # Monthly budget target, utilization meter, 80% warning & >100% alert
└── assets/
    └── logo.svg        # Brand mark SVG
```

## Module Overview

- **`js/storage.js`**: Isolates all `localStorage` reads/writes (`getTransactions`, `addTransaction`, `updateTransaction`, `deleteTransaction`, `getBudget`, `saveBudget`) so persistence can later be swapped to Node.js/Express/SQL REST endpoints without altering UI modules.
- **`js/transactions.js`**: Houses pure calculation and validation helpers (`calculateSummary`, `filterAndSortTransactions`, `validateTransactionInput`) alongside the Transaction History table (search, type/category filters, sorting, edit, delete) and Add/Edit forms.
- **`js/dashboard.js`**: Computes and renders dynamic KPI totals (`Total Balance = Total Income - Total Expenses`), Monthly Spending Overview bar chart, Expense Category Breakdown doughnut chart, Recent Transactions table, and Monthly Budget status.
- **`js/analytics.js`**: Computes timeframe-scoped analytics (`computeAnalytics`), savings rate, highest spending category, Monthly Income vs. Expenses bar chart, Spending Distribution horizontal bar chart, and category breakdown table.
- **`js/budget.js`**: Computes monthly budget utilization (`calculateBudgetStatus`), manages monthly limit updates, and displays explicit warning banners at `>= 80%` and exceeded alerts at `> 100%`.
- **`js/app.js`**: Coordinates view navigation, mobile sidebar drawer, global month selector, non-blocking confirmation dialogs, toast notifications, and CSV export.

## Running Locally

Because the application uses native ES modules (`<script type="module">`), serve the folder over a local HTTP server (opening `index.html` via `file://` is blocked by browser CORS policies for ES modules):

```bash
# Option 1: Using Python
python3 -m http.server 3000

# Option 2: Using Node.js (serve)
npx serve -l 3000 .

# Option 3: Using Vite (if dependencies are installed)
npm run dev
```

Then open `http://localhost:3000` in your browser.
