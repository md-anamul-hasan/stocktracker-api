export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  PROXY_API_KEY: string;
}

export interface Stock {
  id: number;
  ticker: string;
  company_name: string;
  sector: string;
  weight: number;
  target_pe: number;
  justified_pe: number;
  beta: number;
  pe_ratio: number;
  eps: number;
  bvps: number;
  dps: number;
  roe: number;
  payout_ratio: number;
  fifty_two_week_low: number;
  fifty_two_week_high: number;
  auth_cap: number;
  paid_up_cap: number;
  market_cap: number;
  credit_rating: string;
  rsi: number;
  macd: number;
  nav: number;
  current_ratio: number;
  quick_ratio: number;
  debt_to_equity: number;
  roa: number;
  asset_turnover: number;
  inventory_turnover: number;
  cash_conversion_cycle: number;
  listed_year: number;
  total_liabilities: number;
  total_equity: number;
  current_assets: number;
  current_liabilities: number;
  net_income: number;
  free_cash_flow: number;
  category: string;
  dividend_yield: number;
  investment_thesis: string;
  status: string;
  shariah_compliant: number;
  lankabd_company_id: number | null;
  created_at: string;
  updated_at: string;
  // joined fields
  current_price?: number;
}

export interface PriceData {
  id: number;
  ticker: string;
  current_price: number;
  change_amount: number;
  change_percent: number;
  volume: number;
  high: number;
  low: number;
  fetched_at: string;
  source: string;
}

export interface AdminUser {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  created_at: string;
}
