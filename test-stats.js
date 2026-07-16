fetch('https://lankabd.com/')
  .then(r => r.text())
  .then(html => {
    const t = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/)[1];
    const c = html.match(/__RequestVerificationToken=[^;]+/)[0];
    const h = { 'RequestVerificationToken': t, 'Cookie': c, 'User-Agent': 'Mozilla/5.0' };
    
    Promise.all([
      fetch('https://lankabd.com/api/company/StockStatisticsV2?cid=198', { headers: h }).then(r=>r.json()),
      fetch('https://lankabd.com/api/company/TechnicalIndicators?cid=198', { headers: h }).then(r=>r.json())
    ]).then(([stats, tech]) => {
      console.log('StockStats:', stats[0]);
      console.log('TechInd:', tech);
    });
  });
