const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const backendRoot = path.resolve(__dirname, '../../');
const isVercel = Boolean(process.env.VERCEL);

// In Vercel serverless environments, the filesystem is read-only except /tmp
const dbFullPath = isVercel
  ? path.join(os.tmpdir(), 'expense-tracker.db')
  : path.resolve(backendRoot, process.env.DB_PATH || 'database/expense-tracker.db');

// Ensure directory for database file exists
const dbDir = path.dirname(dbFullPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// If running in Vercel and initial db exists, seed /tmp with it once
if (isVercel && !fs.existsSync(dbFullPath)) {
  const bundledDbPath = path.resolve(backendRoot, 'database/expense-tracker.db');
  if (fs.existsSync(bundledDbPath)) {
    try {
      fs.copyFileSync(bundledDbPath, dbFullPath);
    } catch (e) {
      console.warn('Could not copy bundled db to /tmp:', e);
    }
  }
}

// Initialize SQLite database connection
const db = new Database(dbFullPath);
if (!isVercel) {
  db.pragma('journal_mode = WAL');
} else {
  db.pragma('journal_mode = DELETE');
}
db.pragma('foreign_keys = ON');

// Automatically initialize schema if tables do not exist
const schemaPath = path.resolve(backendRoot, 'database/schema.sql');
if (fs.existsSync(schemaPath)) {
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schemaSql);
}

module.exports = db;
