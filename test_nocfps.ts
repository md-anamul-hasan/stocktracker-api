import * as cheerio from 'cheerio';

async function testNOCFPS(ticker: string) {
    const res = await fetch(`https://www.dsebd.org/displayCompany.php?name=${ticker}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    let nocfps = 0;

    $('table#company').each((i, table) => {
        const text = $(table).html() || '';
        
        // Net Operating Cash Flow Per Share (NOCFPS)
        if (text.includes('Net Asset Value(NAV) Per Share') || text.includes('Net Operating Cash Flow(NOCFPS)')) {
            const rows = $(table).find('tr:not(.header)');
            rows.each((j, tr) => {
                const tds = $(tr).find('td');
                if (tds.length >= 6) {
                    const rowHtml = $(tr).html() || '';
                    if (rowHtml.includes('Net Operating Cash Flow')) {
                        // It usually looks like this:
                        // <td width="30%">Net Operating Cash Flow(NOCFPS)</td>
                        // <td width="20%">5.43</td>
                        const nocfpsText = tds.eq(1).text().trim() || tds.eq(5).text().trim();
                        if (nocfpsText && nocfpsText !== '-' && !isNaN(parseFloat(nocfpsText))) {
                            nocfps = parseFloat(nocfpsText.replace(/,/g, ''));
                        }
                    }
                }
            });
            
            // Or if it's in the same row as NAV
            const lastRow = rows.last();
            const tds = lastRow.find('td');
            if (tds.length > 10) {
                 const potentialNocfps = tds.eq(10).text().trim(); // usually 10 is NOCFPS
                 if (potentialNocfps && potentialNocfps !== '-' && !isNaN(parseFloat(potentialNocfps))) {
                     nocfps = parseFloat(potentialNocfps.replace(/,/g, ''));
                 }
            }
        }
    });

    console.log(`NOCFPS for ${ticker}: ${nocfps}`);
}

testNOCFPS('GP');
testNOCFPS('SQUAREPHAR');
