import * as cheerio from 'cheerio';

async function findApis() {
  const html = await fetch('https://www.amarstock.com/').then(r=>r.text());
  const $ = cheerio.load(html);
  const scripts = $('script[src]').map((i, el) => $(el).attr('src')).get();
  
  for(let script of scripts) {
    if(!script.startsWith('http')) script = 'https://www.amarstock.com' + script;
    try {
      const js = await fetch(script).then(r=>r.text());
      const apis = js.match(/\/api\/[a-zA-Z0-9_\-\/]+/g);
      if(apis) {
        console.log("Found in " + script + ":");
        console.log([...new Set(apis)]);
      }
    } catch(e) { }
  }
}

findApis();
