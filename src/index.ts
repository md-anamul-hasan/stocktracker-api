import { Hono } from 'hono';
import { Env } from './types';
import { corsMiddleware } from './middleware/cors';
import authRoutes from './routes/auth';
import stocksRoutes from './routes/stocks';
import adminRoutes from './routes/admin';
import { scrapeDSE } from './services/scraper';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', corsMiddleware);

// Routes
app.get('/', (c) => c.text('StockTracker API is running!'));
app.route('/api/auth', authRoutes);
app.route('/api/stocks', stocksRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/screener', stocksRoutes); // alias for backwards compatibility if needed


// Cron trigger for fetching prices
export default {
  fetch: app.fetch,
  async scheduled(event: any, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(scrapeDSE(env));
  }
};
