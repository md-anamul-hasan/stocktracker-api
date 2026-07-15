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
        SELECT s.ticker, s.company_name, s.sector, s.eps, s.target_pe, s.weight, s.investment_thesis, s.status,
                s.pe_ratio, s.fifty_two_week_low, s.fifty_two_week_high,
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
          const target_price_pe = row.eps * row.target_pe;

          return {
            ...row,
            target_price: target_price_pe,
            target_price_pe
          };
      });

      return c.json(enhancedStocks);
  } catch (error: any) {
    console.error('Error fetching screener data:', error);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default stocks;
