-- Add Amarstock scraped fields
ALTER TABLE stocks ADD COLUMN auth_cap REAL DEFAULT 0;
ALTER TABLE stocks ADD COLUMN listed_year INTEGER;
ALTER TABLE stocks ADD COLUMN category TEXT;
ALTER TABLE stocks ADD COLUMN dividend_yield REAL DEFAULT 0;
