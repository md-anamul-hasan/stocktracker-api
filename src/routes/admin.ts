import { Hono } from 'hono';
import { Env, Stock } from '../types';
import { authMiddleware } from '../middleware/auth';
import { scrapeDSE } from '../services/scraper';

const admin = new Hono<{ Bindings: Env }>();

admin.use('*', authMiddleware);

admin.get('/stocks', async (c) => {
  try {
    const db = c.env.DB;
    const result = await db.prepare(`
      SELECT s.*, 
             sh.sponsor_director as sh_sponsor, sh.govt as sh_govt, sh.foreign_stake as sh_foreign, sh.institute as sh_institute, sh.public_stake as sh_public
      FROM stocks s
      LEFT JOIN (
        SELECT ticker, sponsor_director, govt, foreign_stake, institute, public_stake
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY month_year DESC, id DESC) as rn
          FROM shareholding_patterns
        ) WHERE rn = 1
      ) sh ON s.ticker = sh.ticker
      ORDER BY s.weight DESC
    `).all<any>();
    return c.json(result.results);
  } catch (error) {
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

admin.post('/stocks', async (c) => {
  try {
    const body = await c.req.json();
    const db = c.env.DB;
    
    if (!body.ticker || body.weight === undefined || body.target_pe === undefined) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const stmt = db.prepare(`
      INSERT INTO stocks (
        ticker, company_name, sector, weight, target_pe, pe_ratio, eps,
        fifty_two_week_low, fifty_two_week_high, investment_thesis, 
        status, shariah_compliant, beta, justified_pe, risk_free_rate,
        total_liabilities, total_equity, current_assets, current_liabilities, net_income, free_cash_flow
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.ticker, body.company_name || 'Pending Data', body.sector || 'Pending', body.weight, body.target_pe, 
      body.pe_ratio || 0, body.eps || 0, 
      body.fifty_two_week_low || 0, body.fifty_two_week_high || 0, 
      body.investment_thesis, body.status, 
      body.shariah_compliant ? 1 : 0,
      body.beta !== undefined ? body.beta : 1.0,
      body.justified_pe || 0,
      body.risk_free_rate !== undefined ? body.risk_free_rate : null,
      body.total_liabilities || 0,
      body.total_equity || 0,
      body.current_assets || 0,
      body.current_liabilities || 0,
      body.net_income || 0,
      body.free_cash_flow || 0
    );

    await stmt.run();
    
    // Trigger background scraper for this specific stock
    c.executionCtx.waitUntil(scrapeDSE(c.env, body.ticker));

    return c.json({ success: true }, 201);
  } catch (error) {
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

admin.put('/stocks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const db = c.env.DB;
    
    if (!body.ticker || body.weight === undefined || body.target_pe === undefined) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const stmt = db.prepare(`
      UPDATE stocks SET 
        ticker = ?, company_name = ?, sector = ?, weight = ?, target_pe = ?, 
        pe_ratio = ?, eps = ?, fifty_two_week_low = ?, fifty_two_week_high = ?,
        investment_thesis = ?, status = ?, 
        shariah_compliant = ?, beta = COALESCE(?, beta), risk_free_rate = COALESCE(?, risk_free_rate), justified_pe = COALESCE(?, justified_pe),
        total_liabilities = COALESCE(?, total_liabilities), total_equity = COALESCE(?, total_equity), 
        current_assets = COALESCE(?, current_assets), current_liabilities = COALESCE(?, current_liabilities),
        net_income = COALESCE(?, net_income), free_cash_flow = COALESCE(?, free_cash_flow),
        stock_character = COALESCE(?, stock_character), free_float = COALESCE(?, free_float),
        floor_price = COALESCE(?, floor_price), own_median_pe = COALESCE(?, own_median_pe), own_std_pe = COALESCE(?, own_std_pe),
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      body.ticker, body.company_name || 'Pending Data', body.sector || 'Pending', body.weight, body.target_pe, 
      body.pe_ratio || 0, body.eps || 0, 
      body.fifty_two_week_low || 0, body.fifty_two_week_high || 0,
      body.investment_thesis, body.status, 
      body.shariah_compliant ? 1 : 0, 
      body.beta !== undefined ? body.beta : null,
      body.risk_free_rate !== undefined ? body.risk_free_rate : null,
      body.justified_pe !== undefined ? body.justified_pe : null,
      body.total_liabilities !== undefined ? body.total_liabilities : null,
      body.total_equity !== undefined ? body.total_equity : null,
      body.current_assets !== undefined ? body.current_assets : null,
      body.current_liabilities !== undefined ? body.current_liabilities : null,
      body.net_income !== undefined ? body.net_income : null,
      body.free_cash_flow !== undefined ? body.free_cash_flow : null,
      body.stock_character !== undefined ? body.stock_character : null,
      body.free_float !== undefined ? body.free_float : null,
      body.floor_price !== undefined ? body.floor_price : null,
      body.own_median_pe !== undefined ? body.own_median_pe : null,
      body.own_std_pe !== undefined ? body.own_std_pe : null,
      id
    );

    await stmt.run();
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

admin.delete('/stocks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const db = c.env.DB;
    
    // First find the stock to get its ticker
    const stock: any = await db.prepare('SELECT ticker FROM stocks WHERE id = ?').bind(id).first();
    
    if (stock) {
      // Delete associated price data first to prevent foreign key constraint errors
      await db.prepare('DELETE FROM price_data WHERE ticker = ?').bind(stock.ticker).run();
      // Then delete the stock
      await db.prepare('DELETE FROM stocks WHERE id = ?').bind(id).run();
    }
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Failed to delete stock:', error);
    return c.json({ error: 'Failed to delete stock', details: error.message }, 500);
  }
});

// Holidays CRUD
admin.get('/holidays', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM holidays ORDER BY holiday_date ASC').all();
  return c.json(result.results);
});

admin.post('/holidays', async (c) => {
  const body = await c.req.json();
  const db = c.env.DB;
  
  await db.prepare('INSERT INTO holidays (holiday_date, description) VALUES (?, ?)')
    .bind(body.holiday_date, body.description).run();
  return c.json({ success: true }, 201);
});

admin.delete('/holidays/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  
  await db.prepare('DELETE FROM holidays WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// Settings CRUD
admin.get('/settings', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM settings').all();
  return c.json(result.results);
});

admin.post('/settings', async (c) => {
  const body = await c.req.json();
  const db = c.env.DB;
  
  const stmts = Object.keys(body).map(key => 
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime("now")')
      .bind(key, String(body[key]))
  );
  
  if (stmts.length > 0) {
    await db.batch(stmts);
  }
  
  return c.json({ success: true });
});

// Sync Endpoints for Python Worker
admin.post('/sync/prices', async (c) => {
  const body = await c.req.json();
  const prices = body.prices;
  if (!Array.isArray(prices)) {
    return c.json({ error: 'prices must be an array' }, 400);
  }
  
  const db = c.env.DB;
  
  // Insert price if the ticker exists in the stocks table
  const stmts = prices.map(p => 
    db.prepare(`
      INSERT INTO price_data (ticker, current_price, volume, high, low, change_amount, change_percent, fetched_at, source)
      SELECT ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'DSE'
      WHERE EXISTS (SELECT 1 FROM stocks WHERE ticker = ?)
    `).bind(
      p.ticker, 
      p.current_price, 
      p.volume || 0, 
      p.high || 0, 
      p.low || 0, 
      p.change_amount || 0, 
      p.change_percent || 0,
      p.ticker
    )
  );

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return c.json({ success: true, count: stmts.length });
});

admin.post('/sync/fundamentals', async (c) => {
  const body = await c.req.json();
  const fundamentals = body.fundamentals;
  if (!Array.isArray(fundamentals)) {
    return c.json({ error: 'fundamentals must be an array' }, 400);
  }

  const db = c.env.DB;
  
  const stmts = fundamentals.map(f => {
    // Only update fields that are explicitly provided
    return db.prepare(`
      UPDATE stocks 
      SET pe_ratio = COALESCE(?, pe_ratio), 
          eps = COALESCE(?, eps),
          updated_at = datetime('now')
      WHERE ticker = ?
    `).bind(
      f.pe_ratio !== undefined ? f.pe_ratio : null, 
      f.eps !== undefined ? f.eps : null, 
      f.ticker
    );
  });

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return c.json({ success: true, count: stmts.length });
});

admin.post('/trigger-scrape', async (c) => {
  try {
    // Run the scraper asynchronously in the background
    c.executionCtx.waitUntil(scrapeDSE(c.env, undefined, true));
    return c.json({ success: true, message: 'Scraper triggered successfully in the background' });
  } catch (error: any) {
    console.error('Manual scrape trigger failed:', error);
    return c.json({ error: error.message }, 500);
  }
});

admin.get('/test-lb', async (c) => {
  const homeRes = await fetch('https://lankabd.com/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const homeHtml = await homeRes.text();
  const tokenMatch = homeHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  const token = tokenMatch ? tokenMatch[1] : '';
  const cookies = homeRes.headers.get('set-cookie') || '';
  const apiHeaders = { 'User-Agent': 'Mozilla/5.0', 'RequestVerificationToken': token, 'Cookie': cookies, 'Accept': 'application/json' };
  
  let results: any = {};
  
  const res1 = await fetch(`https://lankabd.com/api/Company/GetCompanySearch?searchString=SQURPHARMA`, { headers: apiHeaders });
  results.search = await res1.text();

  const res2 = await fetch(`https://lankabd.com/api/APIDropDown/GetAllSymbol`, { headers: apiHeaders });
  results.allSymbols = await res2.text();

  return c.json(results);
});

export default admin;
