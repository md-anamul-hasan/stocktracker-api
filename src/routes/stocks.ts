import { Hono } from 'hono';
import { Env, Stock } from '../types';

const stocks = new Hono<{ Bindings: Env }>();

stocks.get('/', async (c) => {
  try {
    const db = c.env.DB;
    
    // Join stocks with latest price data using Window Function
    const result = await db.prepare(`
      SELECT s.*, 
             COALESCE(p.current_price, s.eps * s.target_pe) as current_price
      FROM stocks s
      LEFT JOIN (
        SELECT ticker, current_price
        FROM (
          SELECT ticker, current_price, ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY fetched_at DESC, id DESC) as rn
          FROM price_data
        ) WHERE rn = 1
      ) p ON s.ticker = p.ticker
      WHERE s.status = 'active'
    `).all<Stock>();

    return c.json(result.results);
  } catch (error: any) {
    console.error('Error fetching stocks:', error);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

stocks.get('/screener', async (c) => {
  try {
    const db = c.env.DB;
    
    const result = await db.prepare(`
        SELECT s.ticker, s.company_name, s.sector, s.eps, s.target_pe, s.weight, s.estimated_yield, s.investment_thesis, s.status,
                s.pe_ratio, s.fifty_two_week_low, s.fifty_two_week_high,
                s.bvps, s.nocfps, s.dps, s.roe, s.payout_ratio, s.req_rate_of_return, s.risk_free_rate, s.growth_rate,
                s.auth_cap, s.listed_year, s.category, s.dividend_yield,
                COALESCE(p.current_price, s.eps * s.target_pe) as current_price
        FROM stocks s
        LEFT JOIN (
          SELECT ticker, current_price
          FROM (
            SELECT ticker, current_price, ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY fetched_at DESC, id DESC) as rn
            FROM price_data
          ) WHERE rn = 1
        ) p ON s.ticker = p.ticker
      `).all<any>();

      const enhancedStocks = result.results.map(row => {
          // Compute Target Prices
          const r = row.req_rate_of_return || 0.12;
          const g = row.growth_rate || 0;
          
          // 1. Intrinsic Base (FCFE Proxy using NOCFPS)
          // Value = FCFE * (1 + g) / (r - g)
          const ddm_denom = r - g;
          let target_price_fcfe = null;
          if (ddm_denom > 0 && row.nocfps > 0) {
              target_price_fcfe = (row.nocfps * (1 + g)) / ddm_denom;
              if (target_price_fcfe < 0) target_price_fcfe = 0;
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
          // Weighting logic dynamically adjusts if a model is invalid (null)
          let target_price_hybrid = null;
          let value_band_low = null;
          let value_band_high = null;
          
          let total_weight = 0;
          let weighted_sum = 0;

          if (target_price_fcfe !== null) {
              weighted_sum += target_price_fcfe * 0.5;
              total_weight += 0.5;
          }
          if (target_price_justified_pe !== null) {
              weighted_sum += target_price_justified_pe * 0.3;
              total_weight += 0.3;
          }
          if (target_price_graham !== null) {
              weighted_sum += target_price_graham * 0.2;
              total_weight += 0.2;
          }

          if (total_weight > 0) {
               target_price_hybrid = weighted_sum / total_weight;
               value_band_low = target_price_hybrid * 0.9;
               value_band_high = target_price_hybrid * 1.1;
               
               // Apply Graham ceiling as hard limit if available
               if (target_price_graham !== null) {
                   value_band_high = Math.min(value_band_high, target_price_graham);
               }
          }

          return {
            ...row,
            target_price: target_price_pe, // fallback
            target_price_pe,
            target_price_fcfe,
            target_price_justified_pe,
            target_price_graham,
            target_price_hybrid,
            value_band_low,
            value_band_high
          };
      });

      return c.json(enhancedStocks);
  } catch (error: any) {
    console.error('Error fetching screener data:', error);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default stocks;
