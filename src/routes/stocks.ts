import { Hono } from 'hono';
import { Env, Stock } from '../types';

const stocks = new Hono<{ Bindings: Env }>();

stocks.get('/', async (c) => {
  const db = c.env.DB;
  
  // Join stocks with latest price data
  const result = await db.prepare(`
    SELECT s.*, 
           COALESCE(p.current_price, s.eps * s.target_pe) as current_price
    FROM stocks s
    LEFT JOIN (
      SELECT ticker, current_price
      FROM price_data
      WHERE id IN (
        SELECT MAX(id) FROM price_data GROUP BY ticker
      )
    ) p ON s.ticker = p.ticker
    WHERE s.status = 'active'
  `).all<Stock>();

  return c.json(result.results);
});

stocks.get('/screener', async (c) => {
  const db = c.env.DB;
  
  const result = await db.prepare(`
      SELECT s.ticker, s.company_name, s.sector, s.eps, s.target_pe, s.weight, s.estimated_yield, s.investment_thesis, s.status,
             s.pe_ratio, s.fifty_two_week_low, s.fifty_two_week_high,
             s.bvps, s.dps, s.roe, s.payout_ratio, s.req_rate_of_return, s.growth_rate,
             COALESCE(p.current_price, s.eps * s.target_pe) as current_price
      FROM stocks s
      LEFT JOIN price_data p ON s.ticker = p.ticker
      ORDER BY p.fetched_at DESC
    `).all<any>();

    // The query might return multiple rows per ticker due to join, let's group by ticker and take the latest
    const uniqueStocks = new Map();
    for (const row of result.results) {
      if (!uniqueStocks.has(row.ticker)) {
        // Compute Target Prices
        const r = row.req_rate_of_return || 0.12;
        const g = row.growth_rate || 0;
        
        // 1. Justified P/E
        const target_price_pe = row.eps * row.target_pe;
        
        // 2. DDM (Dividend Discount Model)
        // Price = D1 / (r - g)
        const ddm_denom = r - g;
        const target_price_ddm = ddm_denom > 0 ? (row.dps / ddm_denom) : null;
        
        // 3. P/B Model
        // Target Price = BVPS * (ROE / r)
        const target_price_pb = r > 0 ? (row.bvps * (row.roe / r)) : null;
        
        // 4. Graham Number
        // SQRT(22.5 * EPS * BVPS)
        let target_price_graham = null;
        const graham_base = 22.5 * row.eps * row.bvps;
        if (graham_base > 0) {
          target_price_graham = Math.sqrt(graham_base);
        }

        const enhancedRow = {
          ...row,
          target_price: target_price_pe, // fallback backward compatibility
          target_price_pe,
          target_price_ddm,
          target_price_pb,
          target_price_graham
        };

        uniqueStocks.set(row.ticker, enhancedRow);
      }
    }

    return c.json(Array.from(uniqueStocks.values()));
});

export default stocks;
