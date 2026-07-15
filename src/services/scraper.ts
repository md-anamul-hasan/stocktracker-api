import { Env } from '../types';
import * as cheerio from 'cheerio';

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

    console.log('Fetching live data from DSE...');
    const response = await fetch('https://www.dsebd.org/latest_share_price_scroll_l.php', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch DSE data: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    
    // Highly efficient Regex for prices. Supports arbitrary spaces to fix LHB bug.
    const regex = /name=([A-Z0-9]+)[^>]*>\s*\1(?:&nbsp;|\s)+([\d\.]+)/g;
    let match;
    const scrapedPrices = new Map<string, number>();

    while ((match = regex.exec(html)) !== null) {
      const ticker = match[1];
      const price = parseFloat(match[2]);
      if (!isNaN(price) && price > 0) {
        scrapedPrices.set(ticker, price);
      }
    }

    console.log(`Successfully parsed ${scrapedPrices.size} stock prices from DSE.`);

    const allStocks = await db.prepare("SELECT ticker, status FROM stocks").all<{ticker: string, status: string}>();
    
    const stmts = [];
    
    for (const stock of allStocks.results) {
      if (scrapedPrices.has(stock.ticker)) {
        const livePrice = scrapedPrices.get(stock.ticker)!;
        
        stmts.push(
          db.prepare('INSERT INTO price_data (ticker, current_price, source) VALUES (?, ?, ?)')
            .bind(stock.ticker, livePrice, 'DSE_SCRAPER')
        );

        // Additionally scrape the EPS, P/E, and 52W range along with NAV and Dividend
        try {
          const compResponse = await fetch(`https://www.dsebd.org/displayCompany.php?name=${stock.ticker}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          if (compResponse.ok) {
            const compHtml = await compResponse.text();
            
            // We load cheerio to safely query DOM instead of regex
            // Note: Since this is a worker, we must ensure cheerio is imported at the top of the file
            // Let's assume we've imported it.
            const $ = cheerio.load(compHtml);

            let annualEps = 0;
            let peRatio = 0;
            let nav = 0;
            let dividendPercent = 0;
            let low52 = 0;
            let high52 = 0;
            let faceValue = 10; // Default DSE face value

            // 1. Scrape Face Value (Needed for DPS calculation)
            const fvRegex = /Face Value.*?<\/th>\s*<td[^>]*>([\d\.\-,]+)<\/td>/is;
            const fvMatch = fvRegex.exec(compHtml);
            if (fvMatch && fvMatch[1]) {
                faceValue = parseFloat(fvMatch[1].replace(/,/g, ''));
            }

            // 2. Scrape 52-week range
            const rangeRegex = /52\s*Weeks.*?<\/th>\s*<td[^>]*>([\d\.\-,]+)\s*-\s*([\d\.\-,]+)<\/td>/is;
            const rangeMatch = rangeRegex.exec(compHtml);
            if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
              low52 = parseFloat(rangeMatch[1].replace(/,/g, ''));
              high52 = parseFloat(rangeMatch[2].replace(/,/g, ''));
            }

            // 3. Scrape Fundamentals from Data Tables
            $('table#company').each((i, table) => {
                const html = $(table).html() || '';
                
                // Financial Performance (EPS & NAV)
                if (html.includes('NAV Per Share') && html.includes('Earnings per share(EPS)')) {
                    const rows = $(table).find('tr:not(.header)');
                    const lastRow = rows.last();
                    const tds = lastRow.find('td');
                    
                    const epsText = tds.eq(4).text().trim();
                    const navText = tds.eq(7).text().trim();
                    
                    if (epsText && epsText !== '-') annualEps = parseFloat(epsText.replace(/,/g, ''));
                    if (navText && navText !== '-') nav = parseFloat(navText.replace(/,/g, ''));
                }

                // Financial Performance Continued (P/E & Dividend)
                if (html.includes('Dividend Yield in %') && html.includes('Year end Price Earnings')) {
                    const rows = $(table).find('tr:not(.header)');
                    const lastRow = rows.last();
                    const tds = lastRow.find('td');
                    
                    const peText = tds.eq(4).text().trim();
                    const divText = tds.eq(7).text().trim();
                    
                    if (peText && peText !== '-') peRatio = parseFloat(peText.replace(/,/g, ''));
                    if (divText && divText !== '-') dividendPercent = parseFloat(divText.replace(/,/g, ''));
                }
            });

            // Fallback for EPS if the table parser missed it (rare, but good for safety)
            if (annualEps === 0) {
              const epsRegex = /Earnings Per Share \(EPS\) - continuing operations.*?<tr>\s*<td>Basic<\/td>(.*?)<\/tr>/is;
              const epsMatch = epsRegex.exec(compHtml);
              if (epsMatch && epsMatch[1]) {
                  const tds = epsMatch[1].match(/<td[^>]*>\s*(-?\d[\d\.,]*)\s*<\/td>/gi);
                  if (tds && tds.length > 0) {
                      const lastTd = tds[tds.length - 1];
                      const numMatch = lastTd.match(/(-?\d[\d\.,]*)/);
                      if (numMatch) annualEps = parseFloat(numMatch[1].replace(/,/g, ''));
                  }
              }
            }

            // Fallback for P/E
            if (peRatio === 0) {
              const peRegex = /P\/E Ratio using Basic EPS.*?<\/td>\s*<td[^>]*>([\d\.\-,]+)<\/td>/is;
              const peMatch = peRegex.exec(compHtml);
              if (peMatch && peMatch[1]) peRatio = parseFloat(peMatch[1].replace(/,/g, ''));
            }

            // Calculate Derived Metrics
            let dps = 0;
            if (dividendPercent > 0) dps = faceValue * (dividendPercent / 100);

            let roe = 0;
            if (nav > 0 && annualEps > 0) roe = (annualEps / nav); // Kept as decimal

            let payoutRatio = 0;
            if (annualEps > 0 && dps > 0) payoutRatio = (dps / annualEps);

            // Only update if at least one core value is parsed correctly to avoid wiping DB
            if (!isNaN(annualEps) && !isNaN(peRatio)) {
              stmts.push(
                db.prepare(`
                  UPDATE stocks SET 
                    eps = ?, 
                    pe_ratio = ?, 
                    bvps = ?, 
                    dps = ?, 
                    roe = ?, 
                    payout_ratio = ?, 
                    fifty_two_week_low = ?, 
                    fifty_two_week_high = ?, 
                    updated_at = datetime("now") 
                  WHERE ticker = ?
                `)
                  .bind(annualEps, peRatio, nav, dps, roe, payoutRatio, low52, high52, stock.ticker)
              );
            }
          }
        } catch (e) {
          console.error(`Failed to fetch fundamental data for ${stock.ticker}`, e);
        }
      }
    }

    if (stmts.length > 0) {
      await db.batch(stmts);
      console.log(`Scraper successfully updated ${stmts.length} portfolio records (Prices, P/E, 52W).`);
    } else {
      console.log('No active portfolio stocks found in the scraped data.');
    }
    
  } catch (error) {
    console.error('Scraper failed:', error);
  }
}
