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
        SELECT s.*,
                COALESCE(p.current_price, s.eps * s.target_pe) as current_price,
                sh.sponsor_director as sh_sponsor, sh.govt as sh_govt, sh.foreign_stake as sh_foreign, sh.institute as sh_institute, sh.public_stake as sh_public
        FROM stocks s
        LEFT JOIN (
          SELECT ticker, current_price
          FROM (
            SELECT ticker, current_price, ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY fetched_at DESC, id DESC) as rn
            FROM price_data
          ) WHERE rn = 1
        ) p ON s.ticker = p.ticker
        LEFT JOIN (
          SELECT ticker, sponsor_director, govt, foreign_stake, institute, public_stake
          FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY month_year DESC, id DESC) as rn
            FROM shareholding_patterns
          ) WHERE rn = 1
        ) sh ON s.ticker = sh.ticker
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
    
    // Fetch stock data and latest price from DB
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
      WHERE s.ticker = ?
    `).bind(ticker).first<any>();

    let currentPrice = 0, eps = 0, payoutRatio = 0, g = 0, r = 0, justifiedPe = 0, beta = 1.0, riskFreeRate = 0.105;

    if (result) {
        currentPrice = result.current_price || 0;
        eps = result.eps || 0;
        payoutRatio = result.payout_ratio || 0;
        g = result.growth_rate || 0;
        r = result.req_rate_of_return || 0;
        justifiedPe = result.justified_pe || 0;
        beta = result.beta || 1;
        riskFreeRate = result.risk_free_rate || 0.105;
    } else {
        // Fallback: Fetch from StockNow on the fly for stocks not in DB
        const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
        
        const instrRes = await fetch('https://stocknow.com.bd/api/v1/instruments', { headers });
        if (!instrRes.ok) return c.json({ detail: 'Failed to fetch instruments from StockNow.' }, 500);
        const instruments = await instrRes.json() as any;
        const inst = instruments[ticker];
        
        if (!inst) {
             return c.json({ detail: 'Stock not found in database and could not be found on StockNow.' }, 404);
        }

        const hashRes = await fetch('https://stocknow.com.bd/api/v1/fundamentals-hash', { headers });
        if (!hashRes.ok) return c.json({ detail: 'Failed to fetch fundamentals hash from StockNow.' }, 500);
        const hash = await hashRes.text();
        
        const fundRes = await fetch(`https://stocknow.com.bd/api/v1/fundamentals?h=${hash}`, { headers });
        if (!fundRes.ok) return c.json({ detail: 'Failed to fetch fundamentals from StockNow.' }, 500);
        const fundamentals = await fundRes.json() as any;
        
        const fund: Record<string, string> = {};
        for (const key of Object.keys(fundamentals)) {
          if (Array.isArray(fundamentals[key])) {
            const item = fundamentals[key].find((x: any) => x.code === ticker);
            if (item) fund[key] = item.meta_value;
          }
        }

        const getFundVal = (key: string) => fund[key] ? parseFloat(fund[key]) : 0;

        currentPrice = inst.close || 0;
        eps = getFundVal('earning_per_share');
        let nav = getFundVal('net_asset_val_per_share');
        
        let cashDiv = getFundVal('cash_dividend');
        let dps = 0;
        if (cashDiv > 0) dps = 10 * (cashDiv / 100); // Face value 10
        
        const roe = eps > 0 && nav > 0 ? (eps/nav) : 0;
        payoutRatio = eps > 0 && dps > 0 ? (dps / eps) : 0;
        
        beta = 1.0; 
        riskFreeRate = 0.105;
        r = riskFreeRate + (beta * 0.06); 
        g = roe * (1 - payoutRatio);
    }

    // Recalculate if fields are missing but derivable
    if (!justifiedPe && r > g && eps > 0 && payoutRatio >= 0 && payoutRatio <= 1) {
        justifiedPe = payoutRatio / (r - g);
    } else if (!justifiedPe && payoutRatio > 1 && r > g) {
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

// Helper functions for circuit breaker
function circuitLimitPct(prevClose: number) {
  if (!prevClose || prevClose <= 0) return null;
  if (prevClose <= 200) return 10;
  if (prevClose <= 500) return 8.75;
  if (prevClose <= 1000) return 7.5;
  if (prevClose <= 2000) return 6.25;
  if (prevClose <= 5000) return 5;
  return 3.75;
}

const CHAR_WEIGHTS: any = {
  income:   { graham: 1,   pe: 1,   pb: 1,   ddm: 2,   hist: 1 },
  growth:   { graham: 1.5, pe: 1.5, pb: 1,   ddm: 0.5, hist: 1 },
  cyclical: { graham: 1,   pe: 1,   pb: 2,   ddm: 1,   hist: 1 },
  balanced: { graham: 1,   pe: 1,   pb: 1,   ddm: 1,   hist: 1 },
};

stocks.get('/price-range/:ticker', async (c) => {
  try {
    const ticker = c.req.param('ticker').toUpperCase();
    const db = c.env.DB;
    
    const stock: any = await db.prepare(`
      SELECT s.*, 
             COALESCE(p.current_price, s.eps * s.target_pe) as current_price,
             (SELECT current_price FROM price_data WHERE ticker = s.ticker ORDER BY fetched_at DESC, id DESC LIMIT 1 OFFSET 1) as prev_close
      FROM stocks s
      LEFT JOIN (
        SELECT ticker, current_price
        FROM (
          SELECT ticker, current_price, ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY fetched_at DESC, id DESC) as rn
          FROM price_data
        ) WHERE rn = 1
      ) p ON s.ticker = p.ticker
      WHERE s.ticker = ?
    `).bind(ticker).first();

    if (!stock) return c.json({ error: 'Stock not found' }, 404);

    // Get sector percentile data
    const sectorStats = await db.prepare(`
        SELECT 
           s.ticker, s.pe_ratio, s.nav
        FROM stocks s
        WHERE s.sector = ? AND s.status = 'active'
    `).bind(stock.sector).all<any>();

    const pes = sectorStats.results.map((s: any) => s.pe_ratio).filter((p: number) => p > 0).sort((a: number, b: number) => a - b);
    const pbs = sectorStats.results.map((s: any) => s.nav > 0 && stock.current_price ? (stock.current_price / s.nav) : 0).filter((p: number) => p > 0).sort((a: number, b: number) => a - b);
    
    // Percentile function
    const p = (arr: number[], pct: number) => {
       if (arr.length === 0) return 0;
       const index = (arr.length - 1) * pct;
       const lower = Math.floor(index);
       const upper = lower + 1;
       const weight = index % 1;
       if (upper >= arr.length) return arr[lower];
       return arr[lower] * (1 - weight) + arr[upper] * weight;
    };

    const sectorPE25 = p(pes, 0.25);
    const sectorPE75 = p(pes, 0.75);
    const sectorPB25 = p(pbs, 0.25);
    const sectorPB75 = p(pbs, 0.75);
    
    let liqThreshold = 5000000;
    try {
      const setting = await db.prepare("SELECT value FROM settings WHERE key = 'liquidity_threshold'").first<any>();
      if (setting && setting.value) liqThreshold = parseFloat(setting.value);
    } catch(e) {}

    // Default inputs for range computation
    const inputs = {
      ticker: stock.ticker,
      character: stock.stock_character || 'balanced',
      marginOfSafety: 10,
      eps: stock.eps || 0,
      bvps: stock.nav || 0,
      sectorPE25: sectorPE25,
      sectorPE75: sectorPE75,
      sectorPB25: sectorPB25,
      sectorPB75: sectorPB75,
      hasDividend: (stock.dividend_yield > 0),
      dps: stock.dps || 0,
      roe: stock.roe ? stock.roe * 100 : 0,
      payout: stock.payout_ratio ? stock.payout_ratio * 100 : 0,
      requiredReturn: stock.req_rate_of_return ? stock.req_rate_of_return * 100 : 12,
      ownMedianPE: stock.own_median_pe || 0,
      ownStdPE: stock.own_std_pe || 0,
      currentPrice: stock.current_price || 0,
      ma20: stock.ma_20 || 0,
      ma50: stock.ma_50 || 0,
      ma200: stock.ma_200 || 0,
      atr14: stock.atr_14 || 0,
      swingLow60: stock.swing_low_60 || 0,
      swingHigh60: stock.swing_high_60 || 0,
      rsi14: stock.rsi || 0,
      prevClose: stock.prev_close || stock.current_price || 0,
      category: stock.category || 'A',
      freeFloat: stock.free_float || 30, // sensible default
      avgDailyTurnover: stock.avg_daily_turnover || 0,
      liquidityThreshold: liqThreshold,
      floorPrice: stock.floor_price || 0
    };

    // --- Core algorithm extracted from React code ---
    const num = (v: any) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
    const eps = num(inputs.eps), bvps = num(inputs.bvps);
    const methods: any[] = [];
    if (eps > 0 && bvps > 0) {
      const gn = Math.sqrt(22.5 * eps * bvps);
      methods.push({ key: 'graham', name: 'Graham Number', low: gn, high: gn });
    }
    if (eps > 0 && num(inputs.sectorPE25) > 0 && num(inputs.sectorPE75) > 0) {
      methods.push({ key: 'pe', name: 'Sector P/E band', low: eps * num(inputs.sectorPE25), high: eps * num(inputs.sectorPE75) });
    }
    if (bvps > 0 && num(inputs.sectorPB25) > 0 && num(inputs.sectorPB75) > 0) {
      methods.push({ key: 'pb', name: 'Sector P/B band', low: bvps * num(inputs.sectorPB25), high: bvps * num(inputs.sectorPB75) });
    }
    if (inputs.hasDividend && num(inputs.dps) > 0 && num(inputs.roe) > 0) {
      const g = Math.min((num(inputs.roe) / 100) * (1 - num(inputs.payout) / 100), 0.10);
      const r = num(inputs.requiredReturn) / 100;
      if (r > g) {
        const fvVal = (num(inputs.dps) * (1 + g)) / (r - g);
        methods.push({ key: 'ddm', name: 'Dividend Discount (Gordon)', low: fvVal, high: fvVal });
      }
    }
    if (eps > 0 && num(inputs.ownMedianPE) > 0) {
      const lowPE = Math.max(num(inputs.ownMedianPE) - num(inputs.ownStdPE), 0);
      methods.push({ key: 'hist', name: 'Own 5yr P/E history', low: eps * lowPE, high: eps * (num(inputs.ownMedianPE) + num(inputs.ownStdPE)) });
    }

    const weights = CHAR_WEIGHTS[inputs.character] || CHAR_WEIGHTS.balanced;
    let fv = null;
    const flags: string[] = [];
    if (methods.length >= 2) {
      let sumW = 0, sumLow = 0, sumHigh = 0;
      methods.forEach(m => { const w = weights[m.key] || 1; sumW += w; sumLow += m.low * w; sumHigh += m.high * w; });
      const mos = num(inputs.marginOfSafety) / 100;
      fv = { low: (sumLow / sumW) * (1 - mos), high: sumHigh / sumW };
    } else {
      flags.push('insufficient_data');
    }

    // technical
    const ma20 = num(inputs.ma20), atr = num(inputs.atr14);
    const tLowRaw = Math.max(num(inputs.swingLow60), ma20 - 1.5 * atr);
    const tHighRaw = Math.min(num(inputs.swingHigh60), ma20 + 1.5 * atr);
    const trend = ma20 > num(inputs.ma50) && num(inputs.ma50) > num(inputs.ma200) ? 'up'
      : ma20 < num(inputs.ma50) && num(inputs.ma50) < num(inputs.ma200) ? 'down' : 'sideways';
    const rsi = num(inputs.rsi14);
    if (rsi > 70) flags.push('overbought_wait_pullback');
    if (rsi > 0 && rsi < 30) flags.push('oversold_check_catalyst');

    // market structure
    const prevClose = num(inputs.prevClose);
    const limitPct = circuitLimitPct(prevClose);
    const todayLow = limitPct != null ? prevClose * (1 - limitPct / 100) : null;
    const todayHigh = limitPct != null ? prevClose * (1 + limitPct / 100) : null;
    const illiquid = num(inputs.avgDailyTurnover) < num(inputs.liquidityThreshold);
    const categoryRisky = inputs.category === 'Z' || num(inputs.freeFloat) < 10;
    if (illiquid) flags.push('illiquid');
    if (categoryRisky) flags.push('category_risk');

    const widen = illiquid ? 0.05 : 0;
    const tLow = tLowRaw * (1 - widen);
    const tHigh = tHighRaw * (1 + widen);
    let fvHighAdj = fv ? (categoryRisky ? fv.high * 0.95 : fv.high) : null;
    const fvLow = fv ? fv.low : null;

    const floorPrice = inputs.floorPrice === 0 ? null : num(inputs.floorPrice);
    if (floorPrice != null && ((fvLow != null && fvLow < floorPrice) || tLow < floorPrice)) {
      flags.push('below_regulatory_floor');
    }

    let entryLow = null, entryHigh = null, overlap = false;
    if (fvLow != null && fvHighAdj != null) {
      entryLow = Math.max(fvLow, tLow);
      entryHigh = Math.min(fvHighAdj, tHigh);
      overlap = entryLow <= entryHigh;
      if (!overlap) {
        if (fvHighAdj < tLow) flags.push('technically_extended');
        else if (tHigh < fvLow) flags.push('value_opportunity_verify');
      }
    }

    // confidence
    const methodScore = Math.min(methods.length, 5) / 5 * 40;
    const liquidityScore = illiquid ? 5 : 20;
    const completenessScore = [inputs.ma20, inputs.ma50, inputs.ma200, inputs.atr14, inputs.swingLow60, inputs.swingHigh60].every((v: any) => num(v) > 0) ? 20 : 8;
    const categoryScore = inputs.category === 'A' && num(inputs.freeFloat) >= 10 ? 20 : (inputs.category === 'Z' ? 5 : 12);
    const confidence = Math.round(methodScore + liquidityScore + completenessScore + categoryScore);

    const targetNear = tHigh;
    const targetFar = fvHighAdj;
    const stopLoss = (overlap && entryLow != null) ? Math.min(entryLow - 1.5 * atr, num(inputs.ma200)) : null;

    return c.json({
      methods, fv: fv ? { low: fvLow, high: fvHighAdj } : null,
      technical: { low: tLow, high: tHigh, trend },
      market: { limitPct, todayLow, todayHigh, illiquid, categoryRisky },
      entry: { low: entryLow, high: entryHigh, overlap },
      target: { near: targetNear, far: targetFar },
      stopLoss,
      confidence, confidenceBreakdown: { methodScore, liquidityScore, completenessScore, categoryScore },
      flags: Array.from(new Set(flags)),
      rawInputs: inputs
    });

  } catch (error: any) {
    console.error('Error fetching price range:', error);
    return c.json({ detail: 'Internal Server Error' }, 500);
  }
});

export default stocks;
