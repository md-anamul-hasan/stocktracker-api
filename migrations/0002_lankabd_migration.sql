-- Add new columns to stocks table
ALTER TABLE stocks ADD COLUMN lankabd_company_id INTEGER;
ALTER TABLE stocks ADD COLUMN paid_up_cap REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN market_cap REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN credit_rating TEXT;
ALTER TABLE stocks ADD COLUMN rsi REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN macd REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN nav REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN current_ratio REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN quick_ratio REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN debt_to_equity REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN roa REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN asset_turnover REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN inventory_turnover REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN cash_conversion_cycle REAL DEFAULT 0;

-- Create shareholding_patterns table
CREATE TABLE IF NOT EXISTS shareholding_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  month_year TEXT NOT NULL,
  sponsor_director REAL DEFAULT 0,
  govt REAL DEFAULT 0,
  foreign_stake REAL DEFAULT 0,
  institute REAL DEFAULT 0,
  public_stake REAL DEFAULT 0,
  fetched_at TEXT DEFAULT (datetime('now')),
  UNIQUE(ticker, month_year),
  FOREIGN KEY (ticker) REFERENCES stocks(ticker) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shareholding_ticker ON shareholding_patterns(ticker);
