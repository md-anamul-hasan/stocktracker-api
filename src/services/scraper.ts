import { Env } from '../types';

export async function scrapeDSE(env: Env, specificTicker?: string, forceSync: boolean = false) {
  const db = env.DB;
  
  try {
    if (!specificTicker && !forceSync) {
      // --- Timezone & Holiday Validation ---
      const now = new Date();
      const bstFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });
      const bstParts = bstFormatter.formatToParts(now);
      const bstMap = {} as Record<string, string>;
      for (const part of bstParts) { bstMap[part.type] = part.value; }
      
      if (bstMap.weekday === 'Friday' || bstMap.weekday === 'Saturday') {
        console.log(`Skipping scraper: Today is ${bstMap.weekday} (Weekend in BD)`);
        return;
      }

      const todayDate = `${bstMap.year}-${bstMap.month}-${bstMap.day}`;
      const holidayCheck = await db.prepare('SELECT description FROM holidays WHERE holiday_date = ?').bind(todayDate).first<{description: string}>();
      
      if (holidayCheck) {
        console.log(`Skipping scraper: Today is a holiday - ${holidayCheck.description}`);
        return;
      }
    }

    console.log(specificTicker ? `Fetching live data for ${specificTicker} from StockNow...` : 'Fetching live data from StockNow API...');

    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

    // Fetch Instruments
    const instrRes = await fetch('https://stocknow.com.bd/api/v1/instruments', { headers });
    if (!instrRes.ok) throw new Error(`StockNow instruments failed: ${instrRes.status}`);
    const instruments = await instrRes.json() as any;

    // Fetch Fundamentals
    const hashRes = await fetch('https://stocknow.com.bd/api/v1/fundamentals-hash', { headers });
    if (!hashRes.ok) throw new Error(`StockNow hash failed: ${hashRes.status}`);
    const hash = await hashRes.text();
    
    const fundRes = await fetch(`https://stocknow.com.bd/api/v1/fundamentals?h=${hash}`, { headers });
    if (!fundRes.ok) throw new Error(`StockNow fundamentals failed: ${fundRes.status}`);
    const fundamentals = await fundRes.json() as any;

    // Build fundamentals map by ticker
    const fundMap: Record<string, any> = {};
    for (const key of Object.keys(fundamentals)) {
      if (Array.isArray(fundamentals[key])) {
        for (const item of fundamentals[key]) {
          if (!fundMap[item.code]) fundMap[item.code] = {};
          fundMap[item.code][key] = item.meta_value;
          fundMap[item.code][key + '_date'] = item.meta_date;
        }
      }
    }

    let allStocks;
    if (specificTicker) {
      allStocks = await db.prepare("SELECT ticker, sector, status, risk_free_rate, beta FROM stocks WHERE ticker = ?").bind(specificTicker).all<any>();
      if (allStocks.results.length === 0) {
        allStocks = { results: [{ ticker: specificTicker, sector: 'Unknown', status: 'active', risk_free_rate: null }] };
      }
    } else {
      allStocks = await db.prepare("SELECT ticker, sector, status, risk_free_rate, beta FROM stocks WHERE status = 'active'").all<any>();
    }
    
    const stmts: any[] = [];
    
    for (const stock of allStocks.results) {
      try {
        const inst = instruments[stock.ticker];
        const fund = fundMap[stock.ticker] || {};

        if (!inst) {
          console.log(`No instrument data found for ${stock.ticker}`);
          continue;
        }

        const currentPrice = inst.close || 0;
          
        if (currentPrice > 0) {
          const changeAmount = currentPrice - (inst.ycp || currentPrice);
          const changePercent = inst.ycp > 0 ? (changeAmount / inst.ycp) * 100 : 0;
          
          stmts.push(
            db.prepare('INSERT INTO price_data (ticker, current_price, change_amount, change_percent, volume, high, low, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))')
              .bind(stock.ticker, currentPrice, changeAmount, changePercent, inst.volume || 0, inst.high || 0, inst.low || 0, 'STOCKNOW')
          );
          
          const low52 = inst.yearly_low || 0;
          const high52 = inst.yearly_high || 0;

          const getFundVal = (key: string) => fund[key] ? parseFloat(fund[key]) : 0;
          const getFundStr = (key: string) => fund[key] ? fund[key] : null;

          const eps = getFundVal('earning_per_share');
          const peRatio = eps > 0 ? currentPrice / eps : 0;
          const nav = getFundVal('net_asset_val_per_share');
          const nocfps = getFundVal('nocf_per_share');
          
          const authCapCr = getFundVal('authorized_capital');
          const paidUp = getFundVal('paid_up_capital');
          
          const totalShares = getFundVal('total_no_securities');
          const marketCap = (currentPrice * totalShares) / 10000000;

          const listedYear = getFundStr('listing_year');
          const category = inst.category || null;
          const floorPrice = inst.floor || getFundVal('floor') || 0;
          
          const pubStake = getFundVal('share_percentage_public');
          const instStake = getFundVal('share_percentage_institute');
          const foreignStake = getFundVal('share_percentage_foreign');
          const sponsorStake = getFundVal('share_percentage_director');
          const govtStake = getFundVal('share_percentage_govt');
          
          const freeFloat = pubStake + instStake + foreignStake;
          
          const faceValue = 10;
          let cashDiv = getFundVal('cash_dividend');
          let dps = 0;
          if (cashDiv > 0) dps = faceValue * (cashDiv / 100);
          
          const dividendYield = currentPrice > 0 ? (dps / currentPrice) * 100 : 0;
          
          let roe = 0;
          if (nav !== 0 && eps !== 0) roe = (eps / nav);

          let payoutRatio = 0;
          if (eps > 0 && dps > 0) payoutRatio = (dps / eps);

          const beta = stock.beta || 1.0; 
          const riskFreeRate = stock.risk_free_rate !== null && stock.risk_free_rate !== undefined ? stock.risk_free_rate : 0.105;
          const r = riskFreeRate + (beta * 0.06); 
          const g = roe * (1 - payoutRatio);
          
          let justifiedPe = 0;
          if (r > g && eps > 0 && payoutRatio >= 0 && payoutRatio <= 1) {
            justifiedPe = payoutRatio / (r - g);
          } else if (payoutRatio > 1 && r > g) {
            justifiedPe = 1.0 / (r - g);
          }
          
          stmts.push(
            db.prepare(`
              UPDATE stocks SET 
                company_name = ?, eps = ?, pe_ratio = ?, 
                fifty_two_week_low = ?, fifty_two_week_high = ?, 
                paid_up_cap = ?, market_cap = ?, auth_cap = ?,
                listed_year = ?, category = COALESCE(?, category),
                dividend_yield = ?, nav = ?, dps = ?,
                roe = ?, payout_ratio = ?, beta = ?,
                justified_pe = ?, req_rate_of_return = ?, growth_rate = ?,
                nocfps = ?, floor_price = ?, free_float = ?,
                rsi = 0, macd = 0, updated_at = datetime("now") 
              WHERE ticker = ?
            `)
              .bind(
                inst.name || stock.ticker, eps, peRatio, low52, high52, 
                paidUp, marketCap, authCapCr, listedYear, category, dividendYield, 
                nav, dps, roe, payoutRatio, beta, justifiedPe, r, g,
                nocfps, floorPrice, freeFloat,
                stock.ticker
              )
          );
          
          // Shareholding Patterns
          const shDate = fund['share_percentage_director_date'] || fund['share_percentage_public_date'];
          if (shDate) {
              const monthYear = shDate.substring(0, 7); // YYYY-MM
              stmts.push(
                db.prepare(`
                  INSERT OR IGNORE INTO shareholding_patterns 
                  (ticker, month_year, sponsor_director, govt, foreign_stake, institute, public_stake)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `).bind(stock.ticker, monthYear, sponsorStake, govtStake, foreignStake, instStake, pubStake)
              );
          }
        }
      } catch (e) {
        console.error(`Failed to process data for ${stock.ticker}`, e);
      }
    }

    if (stmts.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < stmts.length; i += chunkSize) {
          const chunk = stmts.slice(i, i + chunkSize);
          await db.batch(chunk);
      }
      console.log(`Scraper successfully executed ${stmts.length} statements for StockNow update.`);
      
      // Secondary pass for technicals
      const tickersToUpdate = allStocks.results.map((s: any) => s.ticker);
      await computeTechnicals(db, tickersToUpdate);
      console.log(`Successfully computed technical indicators for ${tickersToUpdate.length} stocks.`);
    } else {
      console.log('No active portfolio stocks found in the scraped data.');
    }
    
  } catch (error) {
    console.error('Scraper failed:', error);
  }
}

async function computeTechnicals(db: any, tickers: string[]) {
  const stmts: any[] = [];
  for (const ticker of tickers) {
    const history = await db.prepare('SELECT current_price, high, low, volume, fetched_at FROM price_data WHERE ticker = ? ORDER BY fetched_at DESC, id DESC LIMIT 200').bind(ticker).all();
    
    if (!history || history.results.length === 0) continue;
    const data = history.results.reverse(); // Oldest to newest

    const prices = data.map((d: any) => d.current_price);
    const ma20 = prices.length >= 20 ? prices.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20 : 0;
    const ma50 = prices.length >= 50 ? prices.slice(-50).reduce((a: number, b: number) => a + b, 0) / 50 : 0;
    const ma200 = prices.length >= 200 ? prices.slice(-200).reduce((a: number, b: number) => a + b, 0) / 200 : 0;

    let atr14 = 0;
    if (data.length >= 14) {
      let trSum = 0;
      for (let i = data.length - 14; i < data.length; i++) {
        const high = data[i].high || data[i].current_price;
        const low = data[i].low || data[i].current_price;
        const prevClose = i > 0 ? data[i-1].current_price : low;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trSum += tr;
      }
      atr14 = trSum / 14;
    }

    let rsi14 = 0;
    if (data.length >= 15) {
      let gains = 0;
      let losses = 0;
      for (let i = data.length - 14; i < data.length; i++) {
        const change = data[i].current_price - data[i-1].current_price;
        if (change > 0) gains += change;
        else losses -= change;
      }
      const avgGain = gains / 14;
      const avgLoss = losses / 14;
      if (avgLoss === 0) rsi14 = 100;
      else {
        const rs = avgGain / avgLoss;
        rsi14 = 100 - (100 / (1 + rs));
      }
    }

    let swingLow60 = 0;
    let swingHigh60 = 0;
    if (data.length > 0) {
      const recent60 = data.slice(-60);
      swingLow60 = Math.min(...recent60.map((d: any) => d.low || d.current_price));
      swingHigh60 = Math.max(...recent60.map((d: any) => d.high || d.current_price));
    }

    let avgTurnover = 0;
    if (data.length > 0) {
      const recent30 = data.slice(-30);
      const totalTurnover = recent30.reduce((sum: number, d: any) => sum + ((d.volume || 0) * d.current_price), 0);
      avgTurnover = totalTurnover / recent30.length;
    }

    stmts.push(db.prepare(`
      UPDATE stocks SET 
        ma_20 = ?, ma_50 = ?, ma_200 = ?, atr_14 = ?, 
        rsi = ?, swing_low_60 = ?, swing_high_60 = ?, avg_daily_turnover = ?
      WHERE ticker = ?
    `).bind(ma20, ma50, ma200, atr14, rsi14, swingLow60, swingHigh60, avgTurnover, ticker));
  }

  if (stmts.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < stmts.length; i += chunkSize) {
      await db.batch(stmts.slice(i, i + chunkSize));
    }
  }
}
