-- ============================================
-- StockTracker API - Database Seed Data
-- ============================================

-- Elite 7 Portfolio
INSERT INTO stocks (ticker, company_name, sector, weight, target_pe, eps, estimated_yield, investment_thesis, status, shariah_compliant)
VALUES 
('SQURPHARMA', 'Square Pharmaceuticals Ltd.', 'Pharma', 0.20, 8.5, 31.05, 5.5, 'The safest anchor in BD. Debt-free balance sheet with massive cash reserves. Best dividend coverage (~41% payout).', 'active', 1),
('MARICO', 'Marico Bangladesh Limited', 'FMCG', 0.15, 13.5, 206.69, 12.9, 'Exceptional ROE and the highest cash yield in the portfolio. Provides extreme defensive stability against inflation.', 'active', 1),
('LHBL', 'LafargeHolcim Bangladesh Limited', 'Cement', 0.15, 12.0, 4.38, 7.6, 'Strongest earnings momentum (+33.7% YoY). Only fully integrated plant in BD provides a massive cost moat against peers.', 'active', 1),
('BERGERPBL', 'Berger Paints Bangladesh Ltd.', 'Materials', 0.15, 20.0, 70.50, 3.8, 'Near-monopoly category leader with immense pricing power. Premium valuation is consistently justified by brand strength.', 'active', 1),
('RENATA', 'Renata Limited', 'Pharma', 0.15, 10.0, 45.20, 1.1, 'Aggressive reinvestment machine. Low payout ratio (~28%) drives long-term compounding and capital appreciation over yield.', 'active', 1),
('ACMELAB', 'The ACME Laboratories Limited', 'Pharma', 0.10, 7.5, 11.34, 4.6, 'Deep value play. Cheaper multiple than Square with steady revenue growth (+12.5%) and a highly secure dividend yield.', 'active', 1),
('OLYMPIC', 'Olympic Industries Ltd.', 'FMCG', 0.10, 16.0, 9.40, 2.1, 'Highly defensive staple. Predictable, stable demand ensures consistent low-double-digit earnings growth regardless of macro shocks.', 'active', 1);

-- Liquidated, Watched, and Avoided
INSERT INTO stocks (ticker, company_name, sector, weight, target_pe, eps, estimated_yield, status, status_reason, shariah_compliant)
VALUES 
('GP', 'Grameenphone Ltd.', 'Telecom', 0, 0, 0, 0, 'liquidated', 'Excluded from CSE Shariah Index due to financial ratio breaches', 0),
('MJLBD', 'MJL Bangladesh Limited', 'Conglomerate', 0, 0, 0, 0, 'liquidated', 'Excluded from CSE Shariah Index due to financial ratio breaches', 0),
('WALTONHIL', 'Walton Hi-Tech Industries PLC', 'Consumer Electronics', 0, 0, 0, 0, 'watchlist', 'Recent -24% earnings contraction', 1),
('BEXIMCO PHARMA', 'Beximco Pharmaceuticals Ltd.', 'Pharma', 0, 0, 0, 0, 'avoided', 'Regulatory overhang and parent company crisis', 1),
('ISLAMI BANK', 'Islami Bank Bangladesh PLC', 'Banking', 0, 0, 0, 0, 'avoided', 'EPS growth collapse and zero dividend', 1);

-- Initial Price Data (Matching HTML reference)
INSERT INTO price_data (ticker, current_price, source) VALUES 
('SQURPHARMA', 211.82, 'SEED'),
('MARICO', 2663.13, 'SEED'),
('LHBL', 53.41, 'SEED'),
('BERGERPBL', 1427.74, 'SEED'),
('RENATA', 447.67, 'SEED'),
('ACMELAB', 77.62, 'SEED'),
('OLYMPIC', 146.00, 'SEED');

-- Admin User
-- Password is 'admin123' (we'll assume a basic SHA-256 hash or similar for now, but a real app would use bcrypt/scrypt.
-- For demo purposes with Web Crypto, this is the SHA-256 of 'admin123')
INSERT INTO admin_users (email, name, password_hash)
VALUES ('admin@stocktracker.bd', 'System Admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9');
