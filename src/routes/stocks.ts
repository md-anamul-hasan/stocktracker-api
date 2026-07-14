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
    SELECT s.ticker, s.company_name, s.sector, s.eps, s.target_pe,
           (s.eps * s.target_pe) as target_price,
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
  `).all();

  return c.json(result.results);
});

export default stocks;
