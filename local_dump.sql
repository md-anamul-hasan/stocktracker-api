PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  sector TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0,
  target_pe REAL NOT NULL,
  pe_ratio REAL DEFAULT 0,
  eps REAL NOT NULL,
  bvps REAL DEFAULT 0,
  nocfps REAL DEFAULT 0,
  dps REAL DEFAULT 0,
  roe REAL DEFAULT 0,
  payout_ratio REAL DEFAULT 0,
  req_rate_of_return REAL DEFAULT 0.12,
  risk_free_rate REAL DEFAULT 0.10,
  growth_rate REAL DEFAULT 0,
  fifty_two_week_low REAL DEFAULT 0,
  fifty_two_week_high REAL DEFAULT 0,
  estimated_yield REAL DEFAULT 0,
  investment_thesis TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  status_reason TEXT,
  shariah_compliant INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, auth_cap REAL DEFAULT 0, listed_year INTEGER, category TEXT, dividend_yield REAL DEFAULT 0, total_liabilities REAL DEFAULT 0, total_equity REAL DEFAULT 0, current_assets REAL DEFAULT 0, current_liabilities REAL DEFAULT 0, net_income REAL DEFAULT 0, free_cash_flow REAL DEFAULT 0, lankabd_company_id INTEGER, paid_up_cap REAL DEFAULT 0, market_cap REAL DEFAULT 0, credit_rating TEXT, rsi REAL DEFAULT 0, macd REAL DEFAULT 0, nav REAL DEFAULT 0, current_ratio REAL DEFAULT 0, quick_ratio REAL DEFAULT 0, debt_to_equity REAL DEFAULT 0, roa REAL DEFAULT 0, asset_turnover REAL DEFAULT 0, inventory_turnover REAL DEFAULT 0, cash_conversion_cycle REAL DEFAULT 0);
INSERT INTO "stocks" VALUES(1,'SQURPHARMA','Square Pharmaceuticals PLC.','Pharma',0.2,8.5,7.18,27.04,157.88,0.7,12,0.17126931846972385,0.4437869822485207,0.12,0.1,0.08,198,236,5.5,'The safest anchor in BD. Debt-free balance sheet with massive cash reserves. Best dividend coverage (~41% payout).','active',NULL,1,'2026-07-15 08:03:37','2026-07-15 16:56:52',1000,1995,'A',5.74,0,0,0,0,0,0,NULL,0,0,NULL,0,0,0,0,0,0,0,0,0,0);
INSERT INTO "stocks" VALUES(2,'MARICO','Marico Bangladesh Limited','FMCG',0.15,13.5,13.3,187.49,239.13,0.09,384,0.7840505164554845,2.0481092324923993,0.12,0.1,0.05,2,3,12.9,'Exceptional ROE and the highest cash yield in the portfolio. Provides extreme defensive stability against inflation.','active',NULL,1,'2026-07-15 08:03:37','2026-07-15 16:56:52',40,2009,'A',15.76,0,0,0,0,0,0,NULL,0,0,NULL,0,0,0,0,0,0,0,0,0,0);
INSERT INTO "stocks" VALUES(3,'LHBL','LafargeHolcim Bangladesh Limited','Cement',0.15,12,0,4.38,25,0,4,0.18,0.91,0.12,0.1,0.04,0,0,7.6,'Strongest earnings momentum (+33.7% YoY). Only fully integrated plant in BD provides a massive cost moat against peers.','active',NULL,1,'2026-07-15 08:03:37','2026-07-15 08:03:37',0,NULL,NULL,0,0,0,0,0,0,0,NULL,0,0,NULL,0,0,0,0,0,0,0,0,0,0);
INSERT INTO "stocks" VALUES(4,'BERGERPBL','Berger Paints Bangladesh Ltd.','Materials',0.15,20,18.33,72.66,333.42,0.24,52.5,0.21792333993161775,0.7225433526011561,0.12,0.1,0.1,1,1,3.8,'Near-monopoly category leader with immense pricing power. Premium valuation is consistently justified by brand strength.','active',NULL,1,'2026-07-15 08:03:37','2026-07-15 16:56:52',100,2006,'A',2.92,0,0,0,0,0,0,NULL,0,0,NULL,0,0,0,0,0,0,0,0,0,0);
INSERT INTO "stocks" VALUES(5,'RENATA','Renata PLC','Pharma',0.15,10,17.25,19.36,305.49,0.65,5.5,0.06337359651707093,0.2840909090909091,0.12,0.1,0.1,372,548,1.1,'Aggressive reinvestment machine. Low payout ratio (~28%) drives long-term compounding and capital appreciation over yield.','active',NULL,1,'2026-07-15 08:03:37','2026-07-15 16:56:52',285,1979,'A',1.13,0,0,0,0,0,0,NULL,0,0,NULL,0,0,0,0,0,0,0,0,0,0);
INSERT INTO "stocks" VALUES(6,'ACMELAB','The ACME Laboratories Limited','Pharma',0.1,7.5,6.93,11.48,126.37,1.46,3.5,0.09084434596818865,0.3048780487804878,0.12,0.1,0.06,68.6,88.7,4.6,'Deep value play. Cheaper multiple than Square with steady revenue growth (+12.5%) and a highly secure dividend yield.','active',NULL,1,'2026-07-15 08:03:37','2026-07-15 16:56:52',500,2016,'A',4.85,0,0,0,0,0,0,NULL,0,0,NULL,0,0,0,0,0,0,0,0,0,0);
INSERT INTO "stocks" VALUES(7,'OLYMPIC','Olympic Industries PLC.','FMCG',0.1,16,16.29,10.06,62.35,0.39,3,0.16134723336006415,0.2982107355864811,0.12,0.1,0.05,128,176.9,2.1,'Highly defensive staple. Predictable, stable demand ensures consistent low-double-digit earnings growth regardless of macro shocks.','active',NULL,1,'2026-07-15 08:03:37','2026-07-15 16:56:52',200,1989,'A',1.95,0,0,0,0,0,0,NULL,0,0,NULL,0,0,0,0,0,0,0,0,0,0);
INSERT INTO "stocks" VALUES(8,'GP','Grameenphone Ltd.','Telecom',0,0,0,0,0,0,0,0,0,0.12,0.1,0,0,0,0,NULL,'liquidated','Excluded from CSE Shariah Index due to financial ratio breaches',0,'2026-07-15 08:03:37','2026-07-15 08:03:37',0,NULL,NULL,0,0,0,0,0,0,0,NULL,0,0,NULL,0,0,0,0,0,0,0,0,0,0);
INSERT INTO "stocks" VALUES(9,'MJLBD','MJL Bangladesh Limited','Conglomerate',0,0,0,0,0,0,0,0,0,0.12,0.1,0,0,0,0,NULL,'liquidated','Excluded from CSE Shariah Index due to financial ratio breaches',0,'2026-07-15 08:03:37','2026-07-15 08:03:37',0,NULL,NULL,0,0,0,0,0,0,0,NULL,0,0,NULL,0,0,0,0,0,0,0,0,0,0);
INSERT INTO "stocks" VALUES(10,'WALTONHIL','Walton Hi-Tech Industries PLC','Consumer Electronics',0,0,0,0,0,0,0,0,0,0.12,0.1,0,0,0,0,NULL,'watchlist','Recent -24% earnings contraction',1,'2026-07-15 08:03:37','2026-07-15 08:03:37',0,NULL,NULL,0,0,0,0,0,0,0,NULL,0,0,NULL,0,0,0,0,0,0,0,0,0,0);
INSERT INTO "stocks" VALUES(11,'BEXIMCO PHARMA','Beximco Pharmaceuticals Ltd.','Pharma',0,0,0,0,0,0,0,0,0,0.12,0.1,0,0,0,0,NULL,'avoided','Regulatory overhang and parent company crisis',1,'2026-07-15 08:03:37','2026-07-15 08:03:37',0,NULL,NULL,0,0,0,0,0,0,0,NULL,0,0,NULL,0,0,0,0,0,0,0,0,0,0);
INSERT INTO "stocks" VALUES(12,'ISLAMI BANK','Islami Bank Bangladesh PLC','Banking',0,0,0,0,0,0,0,0,0,0.12,0.1,0,0,0,0,NULL,'avoided','EPS growth collapse and zero dividend',1,'2026-07-15 08:03:37','2026-07-15 08:03:37',0,NULL,NULL,0,0,0,0,0,0,0,NULL,0,0,NULL,0,0,0,0,0,0,0,0,0,0);
CREATE TABLE price_data (
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
INSERT INTO "price_data" VALUES(1,'SQURPHARMA',211.82,0,0,0,0,0,'2026-07-15 08:03:37','SEED');
INSERT INTO "price_data" VALUES(2,'MARICO',2663.13,0,0,0,0,0,'2026-07-15 08:03:37','SEED');
INSERT INTO "price_data" VALUES(3,'LHBL',53.41,0,0,0,0,0,'2026-07-15 08:03:37','SEED');
INSERT INTO "price_data" VALUES(4,'BERGERPBL',1427.74,0,0,0,0,0,'2026-07-15 08:03:37','SEED');
INSERT INTO "price_data" VALUES(5,'RENATA',447.67,0,0,0,0,0,'2026-07-15 08:03:37','SEED');
INSERT INTO "price_data" VALUES(6,'ACMELAB',77.62,0,0,0,0,0,'2026-07-15 08:03:37','SEED');
INSERT INTO "price_data" VALUES(7,'OLYMPIC',146,0,0,0,0,0,'2026-07-15 08:03:37','SEED');
INSERT INTO "price_data" VALUES(8,'RENATA',472.8,0,0,0,0,0,'2026-07-15 16:56:52','AMARSTOCK');
INSERT INTO "price_data" VALUES(9,'MARICO',2734.2,0,0,0,0,0,'2026-07-15 16:56:52','AMARSTOCK');
INSERT INTO "price_data" VALUES(10,'BERGERPBL',1408.5,0,0,0,0,0,'2026-07-15 16:56:52','AMARSTOCK');
INSERT INTO "price_data" VALUES(11,'OLYMPIC',161,0,0,0,0,0,'2026-07-15 16:56:52','AMARSTOCK');
INSERT INTO "price_data" VALUES(12,'ACMELAB',86.4,0,0,0,0,0,'2026-07-15 16:56:52','AMARSTOCK');
INSERT INTO "price_data" VALUES(13,'SQURPHARMA',224.9,0,0,0,0,0,'2026-07-15 16:56:52','AMARSTOCK');
CREATE TABLE admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO "admin_users" VALUES(1,'admin@stocktracker.bd','240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9','System Admin','2026-07-15 08:03:37');
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holiday_date TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" VALUES(1,'007_add_advanced_metrics.sql','2026-07-16 12:17:22');
CREATE TABLE shareholding_patterns (
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
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" VALUES('stocks',12);
INSERT INTO "sqlite_sequence" VALUES('price_data',13);
INSERT INTO "sqlite_sequence" VALUES('admin_users',1);
INSERT INTO "sqlite_sequence" VALUES('d1_migrations',1);
CREATE INDEX idx_stocks_ticker ON stocks(ticker);
CREATE INDEX idx_stocks_status ON stocks(status);
CREATE INDEX idx_price_data_ticker ON price_data(ticker);
CREATE INDEX idx_price_data_fetched_at ON price_data(fetched_at);
CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_shareholding_ticker ON shareholding_patterns(ticker);