import * as cheerio from 'cheerio';
import fs from 'fs';

async function test() {
  const compHtml = fs.readFileSync('batashoe.html', 'utf8');
  const $ = cheerio.load(compHtml);

  let annualEps = 0;
  let peRatio = 0;
  let dividendPercent = 0;

  // Better EPS parsing: grab from the Audited "Earnings Per Share (EPS)" top table
  const epsRegex = /Earnings Per Share \(EPS\)(?: - continuing operations)?<\/td>\s*<\/tr>\s*<tr[^>]*>\s*<td>Basic<\/td>\s*<td[^>]*>([\d\.\-,]+)<\/td>/is;
  const epsMatch = epsRegex.exec(compHtml);
  if (epsMatch && epsMatch[1]) {
      annualEps = parseFloat(epsMatch[1].replace(/,/g, ''));
  }

  // Fallback to table parsing if regex fails
  if (annualEps === 0) {
      $('table#company').each((i, table) => {
          const html = $(table).html() || '';
          if (html.includes('NAV Per Share') && html.includes('Earnings per share(EPS)')) {
              // Try to find the most recent completed year (where Profit isn't 0 or missing, or just not 0.85 anomaly)
              const rows = $(table).find('tr:not(.header)');
              // If there are multiple rows, pick the one with highest year or just the second to last if last is a partial year?
              // Let's just grab the last row for now as fallback
              const lastRow = rows.last();
              const tds = lastRow.find('td');
              const epsText = tds.eq(4).text().trim();
              if (epsText && epsText !== '-') annualEps = parseFloat(epsText.replace(/,/g, ''));
          }
      });
  }

  // Better P/E parsing: Trailing P/E Ratio
  const peRegex = /Trailing P\/E Ratio<\/td>\s*<td[^>]*>([\d\.\-,]+)<\/td>/is;
  const peMatch = peRegex.exec(compHtml);
  if (peMatch && peMatch[1]) {
      peRatio = parseFloat(peMatch[1].replace(/,/g, ''));
  }

  // Better Dividend parsing
  $('table#company').each((i, table) => {
      const html = $(table).html() || '';
      if (html.includes('Dividend Yield in %') && html.includes('Year end Price Earnings')) {
          const rows = $(table).find('tr:not(.header)');
          
          // Let's iterate backwards and find the first row that has a valid dividend > 0 that is not the weird partial year
          // Or just grab the max dividend in the last 2 years
          for (let r = rows.length - 1; r >= 0; r--) {
              const tds = $(rows[r]).find('td');
              const divText = tds.eq(7).text().trim();
              if (divText && divText !== '-') {
                  const val = parseFloat(divText.replace(/,/g, ''));
                  if (val > 0) {
                      dividendPercent = val;
                      break;
                  }
              }
          }
      }
  });

  console.log({ annualEps, peRatio, dividendPercent });
}
test();
