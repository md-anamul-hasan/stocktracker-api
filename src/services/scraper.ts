import { Env } from '../types';

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

        // Additionally scrape the EPS, P/E, and 52W range
        try {
          const compResponse = await fetch(`https://www.dsebd.org/displayCompany.php?name=${stock.ticker}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          if (compResponse.ok) {
            const compHtml = await compResponse.text();
            
            let annualEps = 0;
            const epsRegex = /Earnings Per Share \(EPS\) - continuing operations.*?<tr>\s*<td>Basic<\/td>(.*?)<\/tr>/is;
            const epsMatch = epsRegex.exec(compHtml);
            if (epsMatch && epsMatch[1]) {
                const tds = epsMatch[1].match(/<td[^>]*>\s*(-?\d[\d\.,]*)\s*<\/td>/gi);
                if (tds && tds.length > 0) {
                    const lastTd = tds[tds.length - 1];
                    const numMatch = lastTd.match(/(-?\d[\d\.,]*)/);
                    if (numMatch) {
                        annualEps = parseFloat(numMatch[1].replace(/,/g, ''));
                    }
                }
            }

            let peRatio = 0;
            const peRegex = /P\/E Ratio using Basic EPS.*?<\/td>\s*<td[^>]*>([\d\.\-,]+)<\/td>/is;
            const peMatch = peRegex.exec(compHtml);
            if (peMatch && peMatch[1]) peRatio = parseFloat(peMatch[1].replace(/,/g, ''));

            let low52 = 0;
            let high52 = 0;
            const rangeRegex = /52\s*Weeks.*?<\/th>\s*<td[^>]*>([\d\.\-,]+)\s*-\s*([\d\.\-,]+)<\/td>/is;
            const rangeMatch = rangeRegex.exec(compHtml);
            if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
              low52 = parseFloat(rangeMatch[1].replace(/,/g, ''));
              high52 = parseFloat(rangeMatch[2].replace(/,/g, ''));
            }

            // Only update if at least one value is parsed correctly to avoid wiping DB
            if (!isNaN(annualEps) && !isNaN(peRatio)) {
              stmts.push(
                db.prepare('UPDATE stocks SET eps = ?, pe_ratio = ?, fifty_two_week_low = ?, fifty_two_week_high = ?, updated_at = datetime("now") WHERE ticker = ?')
                  .bind(annualEps, peRatio, low52, high52, stock.ticker)
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
