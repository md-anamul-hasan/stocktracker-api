import { Env } from '../types';
import pLimit from 'p-limit';

export async function scrapeDSE(env: Env) {
  const db = env.DB;
  
  try {
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

    console.log('Fetching live data from Amarstock API...');

    const allStocks = await db.prepare("SELECT ticker, status FROM stocks WHERE status = 'active'").all<{ticker: string, status: string}>();
    
    const stmts: any[] = [];
    const limit = pLimit(5); // Process up to 5 stocks concurrently
    
    const scrapeTasks = allStocks.results.map(stock => limit(async () => {
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
            if (json.ah && json.ah.includes('-')) {
              const parts = json.ah.split('-');
              low52 = parseFloat(parts[0].trim());
              high52 = parseFloat(parts[1].trim());
            }

            const eps = json.cb || 0;
            const peRatio = json.cd || (eps > 0 ? currentPrice / eps : 0);
            const nav = json.ci || 0;
            const nocfps = json.cj || 0;
            
            // Convert auth_cap from millions to crores
            const rawAuthCap = json.ap || 0;
            const authCapCr = rawAuthCap / 10; 
            
            const listedYear = json.au || null;
            const category = json.av || null;
            const dividendYield = json.cm || 0;
            
            // Calculate Derived Metrics
            const faceValue = 10;
            let dividendPercent = 0;
            if (json.dz) {
              const match = json.dz.match(/(\d+(?:\.\d+)?)%/);
              if (match) {
                dividendPercent = parseFloat(match[1]);
              }
            }
            let dps = 0;
            if (dividendPercent > 0) dps = faceValue * (dividendPercent / 100);

            let roe = 0;
            if (nav !== 0 && eps !== 0) roe = (eps / nav);

            let payoutRatio = 0;
            if (eps > 0 && dps > 0) payoutRatio = (dps / eps);

            stmts.push(
              db.prepare(`
                UPDATE stocks SET 
                  company_name = ?,
                  eps = ?, 
                  pe_ratio = ?, 
                  bvps = ?,
                  nocfps = ?, 
                  dps = ?, 
                  roe = ?, 
                  payout_ratio = ?, 
                  fifty_two_week_low = ?, 
                  fifty_two_week_high = ?, 
                  auth_cap = ?,
                  listed_year = ?,
                  category = ?,
                  dividend_yield = ?,
                  updated_at = datetime("now") 
                WHERE ticker = ?
              `)
                .bind(
                  json.ab || stock.ticker,
                  eps, peRatio, nav, nocfps, dps, roe, payoutRatio, low52, high52, 
                  authCapCr, listedYear, category, dividendYield, stock.ticker
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
