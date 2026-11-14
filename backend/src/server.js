const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Ensure database connection and tables are initialized on startup
require('./config/database');

const healthRoutes = require('./routes/healthRoutes');
const transactionsRoutes = require('./routes/transactionsRoutes');
const budgetsRoutes = require('./routes/budgetsRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for external access / development flexibility
app.use(cors());

// Parse incoming JSON request bodies
app.use(express.json());

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/budgets', budgetsRoutes);

// Catch-all 404 handler specifically for unhandled /api/* endpoints
app.use(notFoundHandler);

// Serve the existing frontend folder directly from Express
const frontendPath = path.resolve(__dirname, '../../');
app.use(express.static(frontendPath));

// Fallback to frontend index.html for client-side navigation
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.originalUrl.startsWith('/api')) {
    return res.sendFile(path.join(frontendPath, 'index.html'));
  }
  next();
});

// Central Error Handler
app.use(errorHandler);

// Only listen when run directly (not when required in tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    console.log(`Serving frontend from: ${frontendPath}`);
  });
}

module.exports = app;
