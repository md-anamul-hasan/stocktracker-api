-- ============================================
-- StockTracker API - Database Schema
-- Cloudflare D1 (SQLite)
-- ============================================

-- Stocks: the core portfolio holdings
CREATE TABLE IF NOT EXISTS stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  sector TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0,
  target_pe REAL NOT NULL,
  eps REAL NOT NULL,
  estimated_yield REAL DEFAULT 0,
  investment_thesis TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  status_reason TEXT,
  shariah_compliant INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Live price data fetched from DSE/CSE
CREATE TABLE IF NOT EXISTS price_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  current_price REAL NOT NULL,
  change_amount REAL DEFAULT 0,
  change_percent REAL DEFAULT 0,
  volume INTEGER DEFAULT 0,
  high REAL DEFAULT 0,
  low REAL DEFAULT 0,
  fetched_at TEXT DEFAULT (datetime('now')),
  source TEXT DEFAULT 'DSE',
  FOREIGN KEY (ticker) REFERENCES stocks(ticker)
);

-- Admin users for CMS authentication
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Site settings/configuration
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stocks_ticker ON stocks(ticker);
CREATE INDEX IF NOT EXISTS idx_stocks_status ON stocks(status);
CREATE INDEX IF NOT EXISTS idx_price_data_ticker ON price_data(ticker);
CREATE INDEX IF NOT EXISTS idx_price_data_fetched_at ON price_data(fetched_at);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
