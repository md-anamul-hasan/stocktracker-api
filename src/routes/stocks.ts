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
                s.auth_cap, s.paid_up_cap, s.market_cap, s.credit_rating,
                s.rsi, s.macd, s.nav, s.current_ratio, s.quick_ratio, s.debt_to_equity, s.roa,
                s.asset_turnover, s.inventory_turnover, s.cash_conversion_cycle,
                s.listed_year, s.category, s.dividend_yield,
                s.growth_rate, s.total_liabilities, s.total_equity, s.current_assets, s.current_liabilities, s.net_income, s.free_cash_flow,
                s.roe, s.payout_ratio,
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
          
          const debt_to_equity = row.total_equity > 0 ? (row.total_liabilities / row.total_equity) : 0;
          const current_ratio = row.current_liabilities > 0 ? (row.current_assets / row.current_liabilities) : 0;
          
          const peg_ratio = (row.growth_rate > 0 && row.pe_ratio > 0) ? (row.pe_ratio / (row.growth_rate * 100)) : 0;
          const pegy_ratio = ((row.growth_rate + row.dividend_yield/100) > 0 && row.pe_ratio > 0) ? (row.pe_ratio / ((row.growth_rate + row.dividend_yield/100) * 100)) : 0;
          
          const manual_roe = row.total_equity > 0 ? (row.net_income / row.total_equity) : row.roe;

          return {
            ...row,
            target_price: target_price_pe,
            target_price_pe,
            debt_to_equity,
            current_ratio,
            peg_ratio,
            pegy_ratio,
            computed_roe: manual_roe
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
    


    const db = c.env.DB;
    // Check for DB overrides and get company ID
    const dbStock = await db.prepare("SELECT beta, risk_free_rate, lankabd_company_id FROM stocks WHERE ticker = ?").bind(ticker).first<any>();

    // We need the company ID to query LankaBangla. If not found in DB, return error.
    if (!dbStock || !dbStock.lankabd_company_id) {
       return c.json({ detail: 'Company ID not found in database. Add stock first.' }, 404);
    }

    const cid = dbStock.lankabd_company_id;

    // Fetch CSRF Token
    const homeRes = await fetch('https://lankabd.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const homeHtml = await homeRes.text();
    const tokenMatch = homeHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
    if (!tokenMatch) {
        return c.json({ detail: 'Failed to extract CSRF token from LankaBangla' }, 502);
    }
    const token = tokenMatch[1];
    const cookies = homeRes.headers.get('set-cookie') || '';
    
    const apiHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'RequestVerificationToken': token,
        'Cookie': cookies,
        'Accept': 'application/json'
    };

    const [
      mkDataRes, 
      interimFinRes,
      divHistRes,
      finRatiosRes,
      techIndRes
    ] = await Promise.all([
      fetch(`https://lankabd.com/api/Company/LatestMkDataSymbol?cid=${cid}`, { headers: apiHeaders }),
      fetch(`https://lankabd.com/api/company/StatsInterimFinReport?cid=${cid}`, { headers: apiHeaders }),
      fetch(`https://lankabd.com/api/company/StatsDividendHistory?cid=${cid}`, { headers: apiHeaders }),
      fetch(`https://lankabd.com/api/company/FinancialRatiosV2?cid=${cid}`, { headers: apiHeaders }),
      fetch(`https://lankabd.com/api/company/TechnicalIndicators?cid=${cid}`, { headers: apiHeaders })
    ]);

    if (!mkDataRes.ok) {
      return c.json({ detail: 'Failed to fetch market data from LankaBangla' }, 502);
    }

    const mkData = await mkDataRes.json() as any;
    const currentPrice = mkData.lastTradedPrice || mkData.mkistaT_OPEN_PRICE || 0;
    
    if (currentPrice === 0) {
      return c.json({ detail: 'Invalid ticker or no price data found' }, 404);
    }

    const interimFin = await interimFinRes.json().catch(() => []) as any[];
    const divHist = await divHistRes.json().catch(() => []) as any[];
    const finRatios = await finRatiosRes.json().catch(() => []) as any[];
    const techInd = await techIndRes.json().catch(() => ({})) as any;

    let eps = 0;
    let nav = 0;
    if (interimFin && interimFin.length > 0) {
        if (divHist && divHist.length > 0) {
            eps = divHist[0].eps || 0;
            nav = divHist[0].nav || 0;
        }
    } else if (divHist && divHist.length > 0) {
        eps = divHist[0].eps || 0;
        nav = divHist[0].nav || 0;
    }

    const divYieldRatio = Array.isArray(finRatios) ? finRatios.find((r: any) => r.ratioList?.some((l: any) => l.Name === "Dividend Yield "))?.ratioList.find((l:any) => l.Name === "Dividend Yield ") : null;
    const dividendYield = divYieldRatio ? divYieldRatio.Result * 100 : (divHist && divHist.length > 0 ? (divHist[0].cashDividend || 0) : 0);
    const dps = (dividendYield / 100) * currentPrice;
    
    const roe = eps > 0 && nav > 0 ? (eps/nav) : 0;
    const payoutRatio = eps > 0 ? (dps / eps) : 0;
    
    const beta = dbStock?.beta && dbStock.beta !== 1.0 ? dbStock.beta : (techInd.beta_Daily || 1.0); 
    const riskFreeRate = dbStock?.risk_free_rate !== null && dbStock?.risk_free_rate !== undefined ? dbStock.risk_free_rate : 0.105;
    const r = riskFreeRate + (beta * 0.06); // Rf + ERP (6%)
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
        ticker: ticker,
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
          risk_free_rate: riskFreeRate,
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
