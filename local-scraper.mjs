
import { execSync } from 'child_process';
import pLimit from 'p-limit';

const stocks = [
  "SQURPHARMA", "MARICO", "LHB", "BERGERPBL", "RENATA", "ACMELAB", "OLYMPIC", "BATASHOE", 
  "BSRMSTEEL", "BSRMLTD", "BXPHARMA", "ITC", "SHAHJABANK", "BRACBANK", "PRIMEBANK", "LINDEBD", "GP"
];

async function run() {
  const homeRes = await fetch('https://lankabd.com/', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const homeHtml = await homeRes.text();
  const tokenMatch = homeHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  if (!tokenMatch) throw new Error('No CSRF token');
  const token = tokenMatch[1];
  const cookies = homeRes.headers.get('set-cookie') || '';
  
  const apiHeaders = {
    'User-Agent': 'Mozilla/5.0',
    'RequestVerificationToken': token,
    'Cookie': cookies,
    'Accept': 'application/json'
  };

  let tickerToCompanyId = {};
  console.log("Fetching all symbols...");
  const symRes = await fetch(`https://lankabd.com/api/APIDropDown/GetAllSymbol`, { headers: apiHeaders });
  if (symRes.ok) {
    const data = await symRes.json();
    for (const item of data) {
      if (item.symbol && item.companyID) tickerToCompanyId[item.symbol] = item.companyID;
    }
  }

  const limit = pLimit(3);
  const stmts = [];

  const scrapeTasks = stocks.map(ticker => limit(async () => {
    try {
      const cid = tickerToCompanyId[ticker];
      if (!cid) {
        console.log(`Could not find CID for ${ticker}`);
        return;
      }
      
      const [stockStatsRes, interimFinRes, divHistRes, mkDataRes, techIndRes, finRatiosRes] = await Promise.all([
        fetch(`https://lankabd.com/api/company/StockStatisticsV2?cid=${cid}`, { headers: apiHeaders }),
        fetch(`https://lankabd.com/api/company/StatsInterimFinReport?cid=${cid}`, { headers: apiHeaders }),
        fetch(`https://lankabd.com/api/company/StatsDividendHistory?cid=${cid}`, { headers: apiHeaders }),
        fetch(`https://lankabd.com/api/Company/LatestMkDataSymbol?cid=${cid}`, { headers: apiHeaders }),
        fetch(`https://lankabd.com/api/company/TechnicalIndicators?cid=${cid}`, { headers: apiHeaders }),
        fetch(`https://lankabd.com/api/company/FinancialRatiosV2?cid=${cid}`, { headers: apiHeaders })
      ]);
      
      const [stockStats, interimFin, divHist, mkData, techInd, finRatios] = await Promise.all([
        stockStatsRes.ok ? stockStatsRes.json() : [],
        interimFinRes.ok ? interimFinRes.json() : [],
        divHistRes.ok ? divHistRes.json() : [],
        mkDataRes.ok ? mkDataRes.json() : {},
        techIndRes.ok ? techIndRes.json() : {},
        finRatiosRes.ok ? finRatiosRes.json() : []
      ]);

      const paidUp = stockStats && stockStats.length > 0 ? parseFloat(stockStats[0]["Paid Up Capital -BDT(mn)"] || 0) : 0;
      const marketCap = stockStats && stockStats.length > 0 ? parseFloat(stockStats[0]["Market Capitalization -BDT(mn)"] || 0) : 0;
      const rsi = techInd.rsi || 0;
      const macd = techInd.macd || 0;
      
      let eps = 0;
      let nav = 0;
      if (interimFin && interimFin.length > 0 && divHist && divHist.length > 0) {
          eps = divHist[0].eps || 0;
          nav = divHist[0].nav || 0;
      } else if (divHist && divHist.length > 0) {
          eps = divHist[0].eps || 0;
          nav = divHist[0].nav || 0;
      }
      
      let currentRatio = 0, quickRatio = 0, debtToEquity = 0, roa = 0, roe = eps > 0 && nav > 0 ? (eps/nav) : 0;
      if (Array.isArray(finRatios)) {
          for (const group of finRatios) {
              for (const ratio of (group.ratioList || [])) {
                  if (ratio.Name === "Current Ratio") currentRatio = ratio.Result;
                  if (ratio.Name === "Quick Ratio") quickRatio = ratio.Result;
                  if (ratio.Name === "Debt to Equity") debtToEquity = ratio.Result;
                  if (ratio.Name === "Return on Asset (ROA) ") roa = ratio.Result;
                  if (ratio.Name === "Return on Equity (ROE)") roe = ratio.Result;
              }
          }
      }

      console.log(`Scraped ${ticker} - PaidUp: ${paidUp}, MarketCap: ${marketCap}, RSI: ${rsi}, MACD: ${macd}`);
      
      stmts.push(`UPDATE stocks SET lankabd_company_id = ${cid}, paid_up_cap = ${paidUp}, market_cap = ${marketCap}, rsi = ${rsi}, macd = ${macd}, current_ratio = ${currentRatio}, quick_ratio = ${quickRatio}, debt_to_equity = ${debtToEquity}, roa = ${roa}, updated_at = datetime('now') WHERE ticker = '${ticker}';`);
    } catch(e) {
      console.error(e);
    }
  }));

  await Promise.all(scrapeTasks);

  const fs = require('fs');
  fs.writeFileSync('update-db.sql', stmts.join('\n'));
  console.log(`Wrote ${stmts.length} statements to update-db.sql. Executing via wrangler...`);
  
  execSync('npx wrangler d1 execute stocktracker-db --remote --file=update-db.sql', { stdio: 'inherit' });
  console.log("Done!");
}

run();
