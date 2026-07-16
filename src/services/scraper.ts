import { Env } from '../types';
import pLimit from 'p-limit';

export async function scrapeDSE(env: Env, specificTicker?: string) {
  const db = env.DB;
  
  try {
    if (!specificTicker) {
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

    console.log(specificTicker ? `Fetching live data for ${specificTicker}...` : 'Fetching live data from Amarstock API...');

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
    const limit = pLimit(5); // Process up to 5 stocks concurrently
    
    const scrapeTasks = allStocks.results.map((stock: any) => limit(async () => {
      try {
        const response = await fetch(`https://www.amarstock.com/data/11bfa580-3cc4a8b9e57d/${stock.ticker}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (response.ok) {
          const json = await response.json() as any;
          const currentPrice = json.ac || 0;
          
          if (currentPrice > 0) {
            stmts.push(
              db.prepare('INSERT INTO price_data (ticker, current_price, source) VALUES (?, ?, ?)')
                .bind(stock.ticker, currentPrice, 'AMARSTOCK')
            );
            
            // Extract 52W Low/High
            let low52 = 0;
            let high52 = 0;
            if (json.ah && typeof json.ah === 'string' && json.ah.includes('-')) {
              const parts = json.ah.split('-');
              low52 = parseFloat(parts[0].replace(/,/g, '').trim());
              high52 = parseFloat(parts[1].replace(/,/g, '').trim());
            }

            const eps = json.cb || 0;
            const peRatio = json.cd || (eps > 0 ? currentPrice / eps : 0);
            // Convert auth_cap from millions to crores
            const rawAuthCap = json.ap || 0;
            const authCapCr = rawAuthCap / 10; 
            
            const listedYear = json.au || null;
            const category = json.av || null;
            const dividendYield = json.cm || 0;
            const bvps = json.ci || 0;
            const dps = (dividendYield / 100) * currentPrice;
            const roe = bvps > 0 ? (eps / bvps) : 0;
            const payoutRatio = eps > 0 ? (dps / eps) : 0;
            
            const beta = stock.beta && stock.beta !== 1.0 ? stock.beta : (json.cj || 1.0); 
            // Fetch risk_free_rate from DB (manual input), default to 0.105 if null
            const riskFreeRate = stock.risk_free_rate !== null && stock.risk_free_rate !== undefined ? stock.risk_free_rate : 0.105;
            const r = riskFreeRate + (beta * 0.06); // Rf + ERP (6%)
            const g = roe * (1 - payoutRatio);
            
            let justifiedPe = 0;
            if (r > g && eps > 0 && payoutRatio >= 0 && payoutRatio <= 1) {
              justifiedPe = payoutRatio / (r - g);
            } else if (payoutRatio > 1 && r > g) {
              justifiedPe = 1.0 / (r - g);
            }
            
            // Calculate Total Equity and Net Income based on total shares
            const totalShares = json.ar || 0;
            let totalEquity = 0;
            let netIncome = 0;
            if (totalShares > 0) {
              totalEquity = bvps * totalShares;
              netIncome = eps * totalShares;
            }

            stmts.push(
              db.prepare(`
                UPDATE stocks SET 
                  company_name = ?,
                  sector = ?,
                  eps = ?, 
                  pe_ratio = ?, 
                  fifty_two_week_low = ?, 
                  fifty_two_week_high = ?, 
                  auth_cap = ?,
                  listed_year = ?,
                  category = ?,
                  dividend_yield = ?,
                  bvps = ?,
                  dps = ?,
                  roe = ?,
                  payout_ratio = ?,
                  beta = ?,
                  justified_pe = ?,
                  req_rate_of_return = ?,
                  growth_rate = ?,
                  total_equity = CASE WHEN ? > 0 THEN ? ELSE total_equity END,
                  net_income = CASE WHEN ? > 0 THEN ? ELSE net_income END,
                  updated_at = datetime("now") 
                WHERE ticker = ?
              `)
                .bind(
                  json.ab || stock.ticker,
                  json.dp || stock.sector || 'Unknown',
                  eps, peRatio, low52, high52, 
                  authCapCr, listedYear, category, dividendYield, 
                  bvps, dps, roe, payoutRatio, beta, justifiedPe, r, g,
                  totalEquity, totalEquity, netIncome, netIncome,
                  stock.ticker
                )
            );
          }
        }
      } catch (e) {
        console.error(`Failed to fetch data for ${stock.ticker}`, e);
      }
    }));

    await Promise.all(scrapeTasks);

    if (stmts.length > 0) {
      await db.batch(stmts);
      console.log(`Scraper successfully updated ${stmts.length / 2} portfolio records from Amarstock.`);
    } else {
      console.log('No active portfolio stocks found in the scraped data.');
    }
    
  } catch (error) {
    console.error('Scraper failed:', error);
  }
}
