import { Hono } from 'hono';
import { Env, Stock } from '../types';
import { authMiddleware } from '../middleware/auth';

const admin = new Hono<{ Bindings: Env }>();

admin.use('*', authMiddleware);

admin.get('/stocks', async (c) => {
  try {
    const db = c.env.DB;
    const result = await db.prepare('SELECT * FROM stocks ORDER BY weight DESC').all<Stock>();
    return c.json(result.results);
  } catch (error) {
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

admin.post('/stocks', async (c) => {
  try {
    const body = await c.req.json();
    const db = c.env.DB;
    
    if (!body.ticker || !body.company_name || !body.sector || body.weight === undefined || body.target_pe === undefined || body.eps === undefined) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const stmt = db.prepare(`
      INSERT INTO stocks (
        ticker, company_name, sector, weight, target_pe, pe_ratio, eps,
        bvps, nocfps, dps, roe, payout_ratio, req_rate_of_return, risk_free_rate, growth_rate, 
        fifty_two_week_low, fifty_two_week_high, estimated_yield, investment_thesis, 
        status, status_reason, shariah_compliant
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.ticker, body.company_name, body.sector, body.weight, body.target_pe, 
      body.pe_ratio || 0, body.eps, 
      body.bvps || 0, body.nocfps || 0, body.dps || 0, body.roe || 0, body.payout_ratio || 0, body.req_rate_of_return ?? 0.12, body.risk_free_rate ?? 0.10, body.growth_rate || 0,
      body.fifty_two_week_low || 0, body.fifty_two_week_high || 0, 
      body.estimated_yield, body.investment_thesis, body.status, 
      body.status_reason || null, body.shariah_compliant ? 1 : 0
    );

    await stmt.run();
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
    
    if (!body.ticker || !body.company_name || !body.sector || body.weight === undefined || body.target_pe === undefined || body.eps === undefined) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const stmt = db.prepare(`
      UPDATE stocks SET 
        ticker = ?, company_name = ?, sector = ?, weight = ?, target_pe = ?, 
        pe_ratio = ?, eps = ?, bvps = ?, nocfps = ?, dps = ?, roe = ?, payout_ratio = ?, 
        req_rate_of_return = ?, risk_free_rate = ?, growth_rate = ?, fifty_two_week_low = ?, fifty_two_week_high = ?,
        estimated_yield = ?, investment_thesis = ?, status = ?, 
        status_reason = ?, shariah_compliant = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      body.ticker, body.company_name, body.sector, body.weight, body.target_pe, 
      body.pe_ratio || 0, body.eps, body.bvps || 0, body.nocfps || 0, body.dps || 0, body.roe || 0, body.payout_ratio || 0, body.req_rate_of_return ?? 0.12, body.risk_free_rate ?? 0.10, body.growth_rate || 0,
      body.fifty_two_week_low || 0, body.fifty_two_week_high || 0,
      body.estimated_yield, body.investment_thesis, body.status, 
      body.status_reason || null, body.shariah_compliant ? 1 : 0, id
    );

    await stmt.run();
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

admin.delete('/stocks/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  
  await db.prepare('DELETE FROM stocks WHERE id = ?').bind(id).run();
  return c.json({ success: true });
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

export default admin;
