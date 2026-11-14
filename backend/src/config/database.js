const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const backendRoot = path.resolve(__dirname, '../../');
const dbRelativePath = process.env.DB_PATH || 'database/expense-tracker.db';
const dbFullPath = path.resolve(backendRoot, dbRelativePath);

// Ensure directory for database file exists
const dbDir = path.dirname(dbFullPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize SQLite database connection
const db = new Database(dbFullPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Automatically initialize schema if tables do not exist
const schemaPath = path.resolve(backendRoot, 'database/schema.sql');
if (fs.existsSync(schemaPath)) {
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schemaSql);
}

module.exports = db;
