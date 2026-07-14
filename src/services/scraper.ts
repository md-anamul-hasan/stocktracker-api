import { Env } from '../types';

export async function scrapeDSE(env: Env) {
  const db = env.DB;
  
  try {
    console.log('Fetching live data from DSE...');
    // DSE's scrolling ticker page contains all the latest prices
    const response = await fetch('https://www.dsebd.org/latest_share_price_scroll_l.php', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch DSE data: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    
    // Parse the HTML using a highly efficient Regex
    // The HTML looks like this: <a href="displayCompany.php?name=1JANATAMF" class='abhead' target='_top'>1JANATAMF&nbsp;3.40&nbsp;...
    const regex = /name=([A-Z0-9]+)[^>]*>\s*\1&nbsp;([\d\.]+)/g;
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

    // Fetch only the active stocks we are tracking in our portfolio
    const activeStocks = await db.prepare("SELECT ticker FROM stocks WHERE status = 'active'").all<{ticker: string}>();
    
    const stmts = [];
    
    for (const stock of activeStocks.results) {
      if (scrapedPrices.has(stock.ticker)) {
        const livePrice = scrapedPrices.get(stock.ticker)!;
        
        stmts.push(
          db.prepare('INSERT INTO price_data (ticker, current_price, source) VALUES (?, ?, ?)')
            .bind(stock.ticker, livePrice, 'DSE_SCRAPER')
        );
      }
    }

    if (stmts.length > 0) {
      await db.batch(stmts);
      console.log(`Scraper successfully updated ${stmts.length} portfolio stocks.`);
    } else {
      console.log('No active portfolio stocks found in the scraped data.');
    }
    
  } catch (error) {
    console.error('Scraper failed:', error);
  }
}
