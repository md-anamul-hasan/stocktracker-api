import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { Env, AdminUser } from '../types';
import { hashPassword } from '../services/crypto';
import { authMiddleware } from '../middleware/auth';

const auth = new Hono<{ Bindings: Env }>();

auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400);
  }

  const db = c.env.DB;
  const password_hash = await hashPassword(password);

  const user = await db.prepare('SELECT id, email, name FROM admin_users WHERE email = ? AND password_hash = ?')
    .bind(email, password_hash)
    .first<AdminUser>();

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const payload = {
    sub: String(user.id),
    email: user.email,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
  };

  const token = await sign(payload, c.env.JWT_SECRET);

  return c.json({ token, user });
});

auth.get('/me', authMiddleware, async (c) => {
  const payload = c.get('jwtPayload');
  return c.json({ user: payload });
});

export default auth;
