import * as cheerio from 'cheerio';
import fs from 'fs';

async function runScraper() {
  try {
    console.log('Fetching live data from DSE...');
    const response = await fetch('https://www.dsebd.org/latest_share_price_scroll_l.php', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await response.text();
    
    const regex = /name=([A-Z0-9]+)[^>]*>\s*\1(?:&nbsp;|\s)+([\d\.]+)/g;
    let match;
    const scrapedPrices = new Map();

    while ((match = regex.exec(html)) !== null) {
      const ticker = match[1];
      const price = parseFloat(match[2]);
      if (!isNaN(price) && price > 0) {
        scrapedPrices.set(ticker, price);
      }
    }
    
    // Tickers in the DB right now
    const tickers = [
      'SQURPHARMA', 'MARICO', 'LHB', 'BERGERPBL', 'RENATA',
      'ACMELAB', 'OLYMPIC', 'GP', 'MJLBD', 'WALTONHIL',
      'BEXIMCO PHARMA', 'ISLAMI BANK', 'BATASHOE'
    ];

    let sqlCommands = '';

    for (const ticker of tickers) {
      if (scrapedPrices.has(ticker)) {
        const livePrice = scrapedPrices.get(ticker);
        console.log(`Processing ${ticker}...`);

        try {
          const compResponse = await fetch(`https://www.dsebd.org/displayCompany.php?name=${ticker.replace(' ', '%20')}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          const compHtml = await compResponse.text();
          const $ = cheerio.load(compHtml);

          let annualEps = 0;
          let peRatio = 0;
          let nav = 0;
          let nocfps = 0;
          let dividendPercent = 0;
          let low52 = 0;
          let high52 = 0;
          let faceValue = 10; 

          const fvRegex = /Face Value.*?<\/th>\s*<td[^>]*>([\d\.\-,]+)<\/td>/is;
          const fvMatch = fvRegex.exec(compHtml);
          if (fvMatch && fvMatch[1]) faceValue = parseFloat(fvMatch[1].replace(/,/g, ''));

          const rangeRegex = /52\s*Weeks.*?<\/th>\s*<td[^>]*>([\d\.\-,]+)\s*-\s*([\d\.\-,]+)<\/td>/is;
          const rangeMatch = rangeRegex.exec(compHtml);
          if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
            low52 = parseFloat(rangeMatch[1].replace(/,/g, ''));
            high52 = parseFloat(rangeMatch[2].replace(/,/g, ''));
          }

          $('table#company').each((i, table) => {
              const tableHtml = $(table).html() || '';
              if (tableHtml.includes('NAV Per Share') && tableHtml.includes('Earnings per share(EPS)')) {
                  const rows = $(table).find('tr:not(.header)');
                  const lastRow = rows.last();
                  const tds = lastRow.find('td');
                  
                  const epsText = tds.eq(4).text().trim();
                  const navText = tds.eq(7).text().trim();
                  const nocfpsText = tds.eq(10).text().trim();
                  
                  if (epsText && epsText !== '-') annualEps = parseFloat(epsText.replace(/,/g, ''));
                  if (navText && navText !== '-') nav = parseFloat(navText.replace(/,/g, ''));
                  if (nocfpsText && nocfpsText !== '-') nocfps = parseFloat(nocfpsText.replace(/,/g, ''));
              }
              if (tableHtml.includes('Dividend Yield in %') && tableHtml.includes('Year end Price Earnings')) {
                  const rows = $(table).find('tr:not(.header)');
                  const lastRow = rows.last();
                  const tds = lastRow.find('td');
                  const peText = tds.eq(4).text().trim();
                  const divText = tds.eq(7).text().trim();
                  if (peText && peText !== '-') peRatio = parseFloat(peText.replace(/,/g, ''));
                  if (divText && divText !== '-') dividendPercent = parseFloat(divText.replace(/,/g, ''));
              }
          });

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

          if (peRatio === 0) {
            const peRegex = /P\/E Ratio using Basic EPS.*?<\/td>\s*<td[^>]*>([\d\.\-,]+)<\/td>/is;
            const peMatch = peRegex.exec(compHtml);
            if (peMatch && peMatch[1]) peRatio = parseFloat(peMatch[1].replace(/,/g, ''));
          }

          let dps = 0;
          if (dividendPercent > 0) dps = faceValue * (dividendPercent / 100);

          let roe = 0;
          if (nav > 0 && annualEps > 0) roe = (annualEps / nav);

          let payoutRatio = 0;
          if (annualEps > 0 && dps > 0) payoutRatio = (dps / annualEps);

          if (!isNaN(annualEps)) {
             sqlCommands += `UPDATE stocks SET eps = ${annualEps}, pe_ratio = ${peRatio}, bvps = ${nav}, nocfps = ${nocfps}, dps = ${dps}, roe = ${roe}, payout_ratio = ${payoutRatio}, fifty_two_week_low = ${low52}, fifty_two_week_high = ${high52}, updated_at = datetime("now") WHERE ticker = '${ticker}';\n`;
          }
        } catch (e) {
          console.error(`Failed ${ticker}`, e.message);
        }
      }
    }

    fs.writeFileSync('remote-updates.sql', sqlCommands);
    console.log('Saved to remote-updates.sql');
    
  } catch (err) {
    console.error(err);
  }
}

runScraper();
