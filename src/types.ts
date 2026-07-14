export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
}

export interface Stock {
  id: number;
  ticker: string;
  company_name: string;
  sector: string;
  weight: number;
  target_pe: number;
  eps: number;
  estimated_yield: number;
  investment_thesis: string;
  status: string;
  status_reason: string;
  shariah_compliant: number;
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
