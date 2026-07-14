import { Env } from '../types';

export async function scrapeDSE(env: Env) {
  const db = env.DB;
  
  try {
    // In a real scenario, this would fetch from DSE or an API.
    // For demonstration and to avoid Cloudflare blocking direct scrapes to DSE easily, 
    // we simulate realistic price movements based on the last known prices.
    
    // 1. Get all active stocks and their last prices
    const stocks = await db.prepare(`
      SELECT s.ticker, COALESCE(p.current_price, s.eps * s.target_pe) as current_price
      FROM stocks s
      LEFT JOIN (
        SELECT ticker, current_price
        FROM price_data
        WHERE id IN (SELECT MAX(id) FROM price_data GROUP BY ticker)
      ) p ON s.ticker = p.ticker
      WHERE s.status = 'active'
    `).all<{ticker: string, current_price: number}>();

    // 2. Generate new prices (random walk between -0.5% and +0.5%)
    const stmts = [];
    for (const stock of stocks.results) {
      const volatility = (Math.random() * 0.01) - 0.005;
      const newPrice = Math.max(10, stock.current_price * (1 + volatility));
      
      stmts.push(
        db.prepare('INSERT INTO price_data (ticker, current_price, source) VALUES (?, ?, ?)')
          .bind(stock.ticker, newPrice, 'SCRAPER_SIM')
      );
    }

    if (stmts.length > 0) {
      await db.batch(stmts);
    }
    
    console.log('Scraper executed successfully for', stmts.length, 'stocks');
  } catch (error) {
    console.error('Scraper failed:', error);
  }
}
