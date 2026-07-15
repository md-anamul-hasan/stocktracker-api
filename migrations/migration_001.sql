ALTER TABLE stocks ADD COLUMN pe_ratio REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN fifty_two_week_low REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN fifty_two_week_high REAL DEFAULT 0;

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holiday_date TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

UPDATE stocks SET ticker = 'LHB' WHERE ticker = 'LHBL';
