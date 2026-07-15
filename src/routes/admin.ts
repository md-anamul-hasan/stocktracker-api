import { Hono } from 'hono';
import { Env, Stock } from '../types';
import { authMiddleware } from '../middleware/auth';

const admin = new Hono<{ Bindings: Env }>();

admin.use('*', authMiddleware);

admin.get('/stocks', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM stocks ORDER BY weight DESC').all<Stock>();
  return c.json(result.results);
});

admin.post('/stocks', async (c) => {
  const body = await c.req.json();
  const db = c.env.DB;
  
  const stmt = db.prepare(`
    INSERT INTO stocks (
      ticker, company_name, sector, weight, target_pe, pe_ratio, eps,
      bvps, dps, roe, payout_ratio, req_rate_of_return, growth_rate, 
      fifty_two_week_low, fifty_two_week_high, estimated_yield, investment_thesis, 
      status, status_reason, shariah_compliant
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.ticker, body.company_name, body.sector, body.weight, body.target_pe, 
    body.pe_ratio || 0, body.eps, 
    body.bvps || 0, body.dps || 0, body.roe || 0, body.payout_ratio || 0, body.req_rate_of_return ?? 0.12, body.growth_rate || 0,
    body.fifty_two_week_low || 0, body.fifty_two_week_high || 0, 
    body.estimated_yield, body.investment_thesis, body.status, 
    body.status_reason || null, body.shariah_compliant ? 1 : 0
  );

  await stmt.run();
  return c.json({ success: true }, 201);
});

admin.put('/stocks/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const db = c.env.DB;
  
  const stmt = db.prepare(`
    UPDATE stocks SET 
      ticker = ?, company_name = ?, sector = ?, weight = ?, target_pe = ?, 
      pe_ratio = ?, eps = ?, bvps = ?, dps = ?, roe = ?, payout_ratio = ?, 
      req_rate_of_return = ?, growth_rate = ?, fifty_two_week_low = ?, fifty_two_week_high = ?,
      estimated_yield = ?, investment_thesis = ?, status = ?, 
      status_reason = ?, shariah_compliant = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.ticker, body.company_name, body.sector, body.weight, body.target_pe, 
    body.pe_ratio || 0, body.eps, body.bvps || 0, body.dps || 0, body.roe || 0, body.payout_ratio || 0, body.req_rate_of_return ?? 0.12, body.growth_rate || 0,
    body.fifty_two_week_low || 0, body.fifty_two_week_high || 0,
    body.estimated_yield, body.investment_thesis, body.status, 
    body.status_reason || null, body.shariah_compliant ? 1 : 0, id
  );

  await stmt.run();
  return c.json({ success: true });
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

export default admin;
