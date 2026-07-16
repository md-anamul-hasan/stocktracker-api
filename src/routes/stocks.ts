import { Hono } from 'hono';
import { Env, Stock } from '../types';

const stocks = new Hono<{ Bindings: Env }>();

stocks.get('/', async (c) => {
  try {
    const db = c.env.DB;
    
    // Join stocks with latest price data using Window Function
    const result = await db.prepare(`
      SELECT s.*, 
             COALESCE(p.current_price, s.eps * s.target_pe) as current_price
      FROM stocks s
      LEFT JOIN (
        SELECT ticker, current_price
        FROM (
          SELECT ticker, current_price, ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY fetched_at DESC, id DESC) as rn
          FROM price_data
        ) WHERE rn = 1
      ) p ON s.ticker = p.ticker
      WHERE s.status = 'active'
    `).all<Stock>();

    return c.json(result.results);
  } catch (error: any) {
    console.error('Error fetching stocks:', error);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

stocks.get('/screener', async (c) => {
  try {
    const db = c.env.DB;
    
    const result = await db.prepare(`
        SELECT s.ticker, s.company_name, s.sector, s.eps, s.target_pe, s.justified_pe, s.beta, s.weight, s.investment_thesis, s.status,
                s.pe_ratio, s.fifty_two_week_low, s.fifty_two_week_high,
                s.auth_cap, s.listed_year, s.category, s.dividend_yield,
                COALESCE(p.current_price, s.eps * s.target_pe) as current_price
        FROM stocks s
        LEFT JOIN (
          SELECT ticker, current_price
          FROM (
            SELECT ticker, current_price, ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY fetched_at DESC, id DESC) as rn
            FROM price_data
          ) WHERE rn = 1
        ) p ON s.ticker = p.ticker
      `).all<any>();

      const enhancedStocks = result.results.map(row => {
          const target_price_pe = row.eps * row.target_pe;

          return {
            ...row,
            target_price: target_price_pe,
            target_price_pe
          };
      });

      return c.json(enhancedStocks);
  } catch (error: any) {
    console.error('Error fetching screener data:', error);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

stocks.get('/valuation/:ticker', async (c) => {
  try {
    const ticker = c.req.param('ticker').toUpperCase();
    
    // Fetch directly from Amarstock for live widget data
    const response = await fetch(`https://www.amarstock.com/data/11bfa580-3cc4a8b9e57d/${ticker}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return c.json({ detail: 'Failed to fetch data from Amarstock' }, 502);
    }

    const json = await response.json() as any;
    if (!json || !json.ac) {
      return c.json({ detail: 'Invalid ticker or no data found' }, 404);
    }

    const currentPrice = json.ac || 0;
    const eps = json.cb || 0;
    const dividendYield = json.cm || 0;
    const bvps = json.ci || 0;
    const dps = (dividendYield / 100) * currentPrice;
    const roe = bvps > 0 ? (eps / bvps) : 0;
    const payoutRatio = eps > 0 ? (dps / eps) : 0;
    
    const beta = json.cj || 1.0; 
    const r = 0.105 + (beta * 0.06); // 10.5% risk free, 6% ERP
    const g = roe * (1 - payoutRatio);
    
    let justifiedPe = 0;
    if (r > g && eps > 0 && payoutRatio >= 0 && payoutRatio <= 1) {
      justifiedPe = payoutRatio / (r - g);
    } else if (payoutRatio > 1 && r > g) {
      // Sometimes companies pay out more than earnings, cap it at 1 for Gordon Growth
      justifiedPe = 1.0 / (r - g);
    }

    const targetPrice = justifiedPe * eps;
    const marketPe = eps > 0 ? currentPrice / eps : 0;
    
    let upsidePct = 0;
    if (currentPrice > 0) {
      upsidePct = ((targetPrice / currentPrice) - 1) * 100;
    }

    let verdict = "Roughly in line with fundamental (justified) value";
    if (justifiedPe === 0) {
        verdict = "Gordon Growth model invalid (r <= g, negative EPS, or no payout)";
        upsidePct = 0;
    } else if (upsidePct > 15) {
        verdict = "Trading below fundamental (justified) value";
    } else if (upsidePct < -15) {
        verdict = "Trading above fundamental (justified) value";
    }

    return c.json({
        ticker: json.ab || ticker,
        payout_ratio: payoutRatio,
        retention_ratio: 1 - payoutRatio,
        sustainable_growth_g: g,
        required_return_r: r,
        justified_pe: justifiedPe,
        target_price: targetPrice,
        market_price: currentPrice,
        market_pe: marketPe,
        upside_pct: upsidePct,
        verdict: verdict,
        as_of: new Date().toISOString().split('T')[0],
        assumptions_used: {
          risk_free_rate: 0.105,
          equity_risk_premium: 0.06,
          beta: beta
        }
    });

  } catch (error: any) {
    console.error('Error fetching valuation:', error);
    return c.json({ detail: 'Internal Server Error' }, 500);
  }
});

export default stocks;
