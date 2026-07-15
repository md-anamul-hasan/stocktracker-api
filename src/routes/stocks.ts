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
              s.bvps, s.nocfps, s.dps, s.roe, s.payout_ratio, s.req_rate_of_return, s.risk_free_rate, s.growth_rate,
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
        
        // 1. Intrinsic Base (FCFE Proxy using NOCFPS)
        // Value = FCFE * (1 + g) / (r - g)
        const ddm_denom = r - g;
        let target_price_fcfe = null;
        if (ddm_denom > 0 && row.nocfps) {
            target_price_fcfe = (row.nocfps * (1 + g)) / ddm_denom;
            if (target_price_fcfe < 0) target_price_fcfe = 0;
        } else if (ddm_denom > 0 && row.dps) {
            // Fallback to DDM if NOCFPS is missing/zero
            target_price_fcfe = row.dps / ddm_denom; 
        }
        
        // 2. Justified P/E
        // Multiple = Payout Ratio / (r - g)
        let target_price_justified_pe = null;
        if (ddm_denom > 0 && row.payout_ratio > 0) {
            const justified_pe = row.payout_ratio / ddm_denom;
            target_price_justified_pe = row.eps * justified_pe;
            if (target_price_justified_pe < 0) target_price_justified_pe = 0;
        }

        // Fallback backward compatibility for PE
        const target_price_pe = row.eps * row.target_pe;
        if (target_price_justified_pe === null) {
            target_price_justified_pe = target_price_pe;
        }

        // 3. Graham Ceiling
        // SQRT(22.5 * EPS * BVPS)
        let target_price_graham = null;
        const graham_base = 22.5 * row.eps * row.bvps;
        if (graham_base > 0) {
          target_price_graham = Math.sqrt(graham_base);
        }

        // 4. Hybrid Value Band
        // Weighting: 50% FCFE (Intrinsic), 30% Justified P/E, 20% Graham
        let target_price_hybrid = null;
        let value_band_low = null;
        let value_band_high = null;

        if (target_price_fcfe !== null && target_price_justified_pe !== null && target_price_graham !== null) {
             target_price_hybrid = (target_price_fcfe * 0.5) + (target_price_justified_pe * 0.3) + (target_price_graham * 0.2);
             value_band_low = target_price_hybrid * 0.9;
             // Hard non-negotiable price limit by Graham Ceiling
             value_band_high = Math.min(target_price_hybrid * 1.1, target_price_graham);
        }

        const enhancedRow = {
          ...row,
          target_price: target_price_pe, // fallback backward compatibility
          target_price_pe,
          target_price_fcfe,
          target_price_justified_pe,
          target_price_graham,
          target_price_hybrid,
          value_band_low,
          value_band_high
        };

        uniqueStocks.set(row.ticker, enhancedRow);
      }
    }

    return c.json(Array.from(uniqueStocks.values()));
});

export default stocks;
