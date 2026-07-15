import * as fs from 'fs';
import * as cheerio from 'cheerio';

const htmlPath = 'C:\\Users\\10806-Anamul-Hasan\\.gemini\\antigravity\\brain\\9cb48f89-737e-40b1-a781-c2c137e598a2\\.system_generated\\steps\\219\\content.md';
const content = fs.readFileSync(htmlPath, 'utf8');

const $ = cheerio.load(content);

console.log("=== All Company Tables ===");
$('#company').each((i, table) => {
    const html = $(table).html() || '';
    if (html.includes('NAV') || html.includes('Dividend')) {
        console.log(`\n--- Table ${i} ---`);
        $(table).find('tr').each((j, tr) => {
            console.log(j, $(tr).text().replace(/\s+/g, ' ').trim());
        });
    }
});
