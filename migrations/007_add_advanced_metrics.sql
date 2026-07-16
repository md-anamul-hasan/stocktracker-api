-- Migration number: 007_add_advanced_metrics

ALTER TABLE stocks ADD COLUMN total_liabilities REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN total_equity REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN current_assets REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN current_liabilities REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN net_income REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN free_cash_flow REAL DEFAULT 0;
