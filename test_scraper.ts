import * as fs from 'fs';
import * as cheerio from 'cheerio';

const htmlPath = 'C:\\Users\\10806-Anamul-Hasan\\.gemini\\antigravity\\brain\\9cb48f89-737e-40b1-a781-c2c137e598a2\\.system_generated\\steps\\219\\content.md';
const content = fs.readFileSync(htmlPath, 'utf8');

const $ = cheerio.load(content);

$('table').each((i, table) => {
    const html = $(table).html() || '';
    if (html.includes('NAV Per Share') && html.includes('Earnings per share(EPS)')) {
        const rows = $(table).find('tr:not(.header)');
        const lastRow = rows.last();
        const tds = lastRow.find('td');
        tds.each((j, td) => {
            console.log(`Table 1 Row TD ${j}:`, $(td).text().trim());
        });
    }

    if (html.includes('Dividend Yield in %') && html.includes('Year end Price Earnings')) {
        const rows = $(table).find('tr:not(.header)');
        const lastRow = rows.last();
        const tds = lastRow.find('td');
        tds.each((j, td) => {
            console.log(`Table 2 Row TD ${j}:`, $(td).text().trim());
        });
    }
});
