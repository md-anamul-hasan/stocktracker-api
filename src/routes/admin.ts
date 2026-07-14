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
    INSERT INTO stocks (ticker, company_name, sector, weight, target_pe, eps, estimated_yield, investment_thesis, status, status_reason, shariah_compliant)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.ticker, body.company_name, body.sector, body.weight, body.target_pe, 
    body.eps, body.estimated_yield, body.investment_thesis, body.status, 
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
      eps = ?, estimated_yield = ?, investment_thesis = ?, status = ?, 
      status_reason = ?, shariah_compliant = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.ticker, body.company_name, body.sector, body.weight, body.target_pe, 
    body.eps, body.estimated_yield, body.investment_thesis, body.status, 
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

export default admin;
