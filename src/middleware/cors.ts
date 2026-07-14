import { Context, Next } from 'hono';

export const corsMiddleware = async (c: Context, next: Next) => {
  const origin = c.env?.CORS_ORIGIN || '*';
  
  c.res.headers.set('Access-Control-Allow-Origin', origin);
  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  c.res.headers.set('Access-Control-Max-Age', '86400');

  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }

  await next();
};
