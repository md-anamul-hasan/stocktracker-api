import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { Env } from '../types';

export const authMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.split(' ')[1];
  let payload;
  console.log('JWT_SECRET IS:', c.env.JWT_SECRET);
  try {
    payload = await verify(token, c.env.JWT_SECRET, 'HS256');
  } catch (error) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
  
  c.set('jwtPayload', payload);
  await next();
};
