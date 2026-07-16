

async function test() {
  const url = encodeURIComponent('https://lankabd.com/api/company/StockStatisticsV2?cid=126'); // SQURPHARMA
  const proxyUrl = `http://api.scraperapi.com?api_key=c08cbb946d0f77356b5a2560c073fc27&url=${url}&keep_headers=true`;
  console.log("Fetching from: " + proxyUrl);
  
  const res = await fetch(proxyUrl, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  console.log("Status: " + res.status);
  const text = await res.text();
  console.log(text.substring(0, 500));
}

test();
