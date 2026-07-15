import * as cheerio from 'cheerio';
async function test() {
  const compResponse = await fetch(`https://www.dsebd.org/displayCompany.php?name=SQURPHARMA`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const compHtml = await compResponse.text();
  const $ = cheerio.load(compHtml);
  
  const matches = [];
  $('*').each((i, el) => {
     const text = $(el).text();
     if (text.includes('NOCF') || text.includes('Operating')) {
         if ($(el).is('th') || $(el).is('td') || $(el).is('div') || $(el).is('tr')) {
             if (text.length < 200) {
                 matches.push(text.trim().replace(/\s+/g, ' '));
             }
         }
     }
  });
  console.log(Array.from(new Set(matches)));
}
test();
