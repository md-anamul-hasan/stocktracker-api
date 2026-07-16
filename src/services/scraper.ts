import { Env } from '../types';
import pLimit from 'p-limit';

export async function scrapeDSE(env: Env, specificTicker?: string) {
  const db = env.DB;
  
  try {
    if (!specificTicker) {
      // --- Timezone & Holiday Validation ---
      const now = new Date();
      const bstFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });
      const bstParts = bstFormatter.formatToParts(now);
      const bstMap = {} as Record<string, string>;
      for (const part of bstParts) { bstMap[part.type] = part.value; }
      
      if (bstMap.weekday === 'Friday' || bstMap.weekday === 'Saturday') {
        console.log(`Skipping scraper: Today is ${bstMap.weekday} (Weekend in BD)`);
        return;
      }

      const todayDate = `${bstMap.year}-${bstMap.month}-${bstMap.day}`;
      const holidayCheck = await db.prepare('SELECT description FROM holidays WHERE holiday_date = ?').bind(todayDate).first<{description: string}>();
      
      if (holidayCheck) {
        console.log(`Skipping scraper: Today is a holiday - ${holidayCheck.description}`);
        return;
      }
    }

    console.log(specificTicker ? `Fetching live data for ${specificTicker} from LankaBangla...` : 'Fetching live data from LankaBangla API...');

    // 1. Fetch CSRF Token
    const homeRes = await fetch('https://lankabd.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const homeHtml = await homeRes.text();
    const tokenMatch = homeHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
    if (!tokenMatch) {
        throw new Error('Failed to extract CSRF token from LankaBangla');
    }
    const token = tokenMatch[1];
    
    // Extract cookies to maintain session
    const cookies = homeRes.headers.get('set-cookie') || '';
    
    const apiHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'RequestVerificationToken': token,
        'Cookie': cookies,
        'Accept': 'application/json'
    };

    let allStocks;
    if (specificTicker) {
      allStocks = await db.prepare("SELECT ticker, sector, status, risk_free_rate, beta, lankabd_company_id FROM stocks WHERE ticker = ?").bind(specificTicker).all<any>();
      if (allStocks.results.length === 0) {
        allStocks = { results: [{ ticker: specificTicker, sector: 'Unknown', status: 'active', risk_free_rate: null }] };
      }
    } else {
      allStocks = await db.prepare("SELECT ticker, sector, status, risk_free_rate, beta, lankabd_company_id FROM stocks WHERE status = 'active'").all<any>();
    }
    
    // Create mapping of Ticker -> CompanyID by iterating all sectors if needed
    const missingIds = allStocks.results.filter(s => !s.lankabd_company_id);
    let tickerToCompanyId: Record<string, number> = {};
    
    if (missingIds.length > 0) {
        console.log(`Need to resolve LankaBangla Company IDs for ${missingIds.length} stocks...`);
        const limitMap = pLimit(5);
        // Sectors are usually 1 to 25
        const sectorTasks = Array.from({length: 30}, (_, i) => i + 1).map(cid => limitMap(async () => {
            try {
                const res = await fetch(`https://lankabd.com/api/APIDropDown/GetAllSymbolBySector?cid=${cid}`, { headers: apiHeaders });
                if (res.ok) {
                    const data = await res.json() as any[];
                    for (const item of data) {
                        if (item.symbol && item.companyID) {
                            tickerToCompanyId[item.symbol] = item.companyID;
                        }
                    }
                }
            } catch (e) {
                // ignore
            }
        }));
        await Promise.all(sectorTasks);
    }
    
    const stmts: any[] = [];
    const limit = pLimit(3); // 3 concurrent to avoid rate limits
    
    const scrapeTasks = allStocks.results.map((stock: any) => limit(async () => {
      try {
        let cid = stock.lankabd_company_id;
        if (!cid) {
            cid = tickerToCompanyId[stock.ticker];
            if (!cid) {
                console.error(`Could not resolve LankaBangla Company ID for ${stock.ticker}`);
                return;
            }
        }
        
        // Fetch all endpoints concurrently for this stock
        const [
            stockStatsRes, 
            interimFinRes,
            divHistRes,
            mkDataRes,
            techIndRes,
            finRatiosRes,
            shareholdingRes
        ] = await Promise.all([
            fetch(`https://lankabd.com/api/company/StockStatisticsV2?cid=${cid}`, { headers: apiHeaders }),
            fetch(`https://lankabd.com/api/company/StatsInterimFinReport?cid=${cid}`, { headers: apiHeaders }),
            fetch(`https://lankabd.com/api/company/StatsDividendHistory?cid=${cid}`, { headers: apiHeaders }),
            fetch(`https://lankabd.com/api/Company/LatestMkDataSymbol?cid=${cid}`, { headers: apiHeaders }),
            fetch(`https://lankabd.com/api/company/TechnicalIndicators?cid=${cid}`, { headers: apiHeaders }),
            fetch(`https://lankabd.com/api/company/FinancialRatiosV2?cid=${cid}`, { headers: apiHeaders }),
            fetch(`https://lankabd.com/api/company/ShareholdingPattern?cid=${cid}`, { headers: apiHeaders })
        ]);
        
        const [
            stockStats, interimFin, divHist, mkData, techInd, finRatios, shareholding
        ] = await Promise.all([
            stockStatsRes.ok ? stockStatsRes.json() : [],
            interimFinRes.ok ? interimFinRes.json() : [],
            divHistRes.ok ? divHistRes.json() : [],
            mkDataRes.ok ? mkDataRes.json() : {},
            techIndRes.ok ? techIndRes.json() : {},
            finRatiosRes.ok ? finRatiosRes.json() : [],
            shareholdingRes.ok ? shareholdingRes.json() : []
        ]) as any;

        const currentPrice = mkData.lastTradedPrice || mkData.mkistaT_OPEN_PRICE || 0;
        
        if (currentPrice > 0) {
            stmts.push(
                db.prepare('INSERT INTO price_data (ticker, current_price, source, fetched_at) VALUES (?, ?, ?, datetime("now"))')
                  .bind(stock.ticker, currentPrice, 'LANKABANGLA')
            );
            
            // Extract EPS and NAV (prefer interim if available for current year)
            let eps = 0;
            let nav = 0;
            if (interimFin && interimFin.length > 0) {
                // Sum EPS for the year if multiple quarters, or take latest annualized? 
                // LankaBangla provides EPS per quarter. Let's look at divHist for Annual EPS.
                if (divHist && divHist.length > 0) {
                    eps = divHist[0].eps || 0;
                    nav = divHist[0].nav || 0;
                }
            } else if (divHist && divHist.length > 0) {
                eps = divHist[0].eps || 0;
                nav = divHist[0].nav || 0;
            }

            // Fallback for EPS
            let peRatioStr = stockStats && stockStats.length > 0 ? (stockStats[0]["P/E (Audited) as on " + (mkData.publishDate || "").split(' ')[0]] || stockStats[0]["P/E (Interim) as on " + (mkData.publishDate || "").split(' ')[0]]) : "0";
            if (!peRatioStr) {
                // Try finding any P/E key
                const peKey = stockStats && stockStats.length > 0 ? Object.keys(stockStats[0]).find(k => k.startsWith('P/E')) : null;
                if (peKey) peRatioStr = stockStats[0][peKey];
            }
            const peRatio = parseFloat(peRatioStr || "0");
            
            if (eps === 0 && peRatio > 0) eps = currentPrice / peRatio;

            // Extract Capital and Category
            const paidUp = stockStats && stockStats.length > 0 ? parseFloat(stockStats[0]["Paid Up Capital -BDT(mn)"] || 0) : 0;
            const marketCap = stockStats && stockStats.length > 0 ? parseFloat(stockStats[0]["Market Capitalization -BDT(mn)"] || 0) : 0;
            const category = stockStats && stockStats.length > 0 ? stockStats[0]["Market Category"] : stock.category;
            const creditRating = stockStats && stockStats.length > 0 ? stockStats[0]["Credit Rating"] : null;
            
            // Dividend Yield
            const divYieldRatio = Array.isArray(finRatios) ? finRatios.find((r: any) => r.ratioList?.some((l: any) => l.Name === "Dividend Yield "))?.ratioList.find((l:any) => l.Name === "Dividend Yield ") : null;
            const dividendYield = divYieldRatio ? divYieldRatio.Result * 100 : (divHist && divHist.length > 0 ? (divHist[0].cashDividend || 0) : 0);
            const dps = (dividendYield / 100) * currentPrice;
            const payoutRatio = eps > 0 ? (dps / eps) : 0;
            
            // Financial Ratios
            let currentRatio = 0, quickRatio = 0, debtToEquity = 0, roa = 0, roe = eps > 0 && nav > 0 ? (eps/nav) : 0;
            let assetTurnover = 0, inventoryTurnover = 0, cashConversion = 0;
            
            // Extract Net Income (Annualized from latest cumulative quarter)
            let netIncome = 0;
            if (interimFin && interimFin.length > 0) {
                const latest = interimFin[interimFin.length - 1];
                if (latest.netProfit && latest.quarterId) {
                    // netProfit is usually cumulative for the year-to-date quarter
                    netIncome = (parseFloat(latest.netProfit) / latest.quarterId) * 4;
                    // LB netProfit is typically in millions, we'll store it as is (millions) or raw? 
                    // Let's assume the user enters absolute values in CMS, so we'll store it directly, but usually it's in Millions BDT.
                    // For now, we'll just store the parsed value. If the user expects raw, we might need * 1000000.
                    // Let's multiply by 1,000,000 to be safe since user inputs like 2580000000 (2.5B) in CMS.
                    netIncome = netIncome * 1000000;
                }
            }
            
            if (Array.isArray(finRatios)) {
                for (const group of finRatios) {
                    for (const ratio of (group.ratioList || [])) {
                        if (ratio.Name === "Current Ratio") currentRatio = ratio.Result;
                        if (ratio.Name === "Quick Ratio") quickRatio = ratio.Result;
                        if (ratio.Name === "Debt to Equity") debtToEquity = ratio.Result;
                        if (ratio.Name === "Return on Asset (ROA) ") roa = ratio.Result;
                        if (ratio.Name === "Return on Equity (ROE)") roe = ratio.Result;
                        if (ratio.Name === "Total Asset Turnover") assetTurnover = ratio.Result;
                        if (ratio.Name === "Inventory Turnover") inventoryTurnover = ratio.Result;
                        if (ratio.Name === "Cash Conversion Cycle") cashConversion = ratio.Result;
                    }
                }
            }

            // Technicals
            const rsi = techInd.rsi || 0;
            const macd = techInd.macd || 0;
            const beta = stock.beta && stock.beta !== 1.0 ? stock.beta : (techInd.beta_Daily || 1.0); 

            // Calculate valuation variables
            const riskFreeRate = stock.risk_free_rate !== null && stock.risk_free_rate !== undefined ? stock.risk_free_rate : 0.105;
            const r = riskFreeRate + (beta * 0.06); 
            const g = roe * (1 - payoutRatio);
            
            let justifiedPe = 0;
            if (r > g && eps > 0 && payoutRatio >= 0 && payoutRatio <= 1) {
              justifiedPe = payoutRatio / (r - g);
            } else if (payoutRatio > 1 && r > g) {
              justifiedPe = 1.0 / (r - g);
            }
            
            // High/Low
            const low52 = mkData.mkistaT_LOW_PRICE || 0;
            const high52 = mkData.mkistaT_HIGH_PRICE || 0;

            stmts.push(
              db.prepare(`
                UPDATE stocks SET 
                  lankabd_company_id = ?,
                  eps = ?, 
                  pe_ratio = ?, 
                  fifty_two_week_low = ?, 
                  fifty_two_week_high = ?, 
                  paid_up_cap = ?,
                  market_cap = ?,
                  credit_rating = ?,
                  category = COALESCE(?, category),
                  dividend_yield = ?,
                  nav = ?,
                  dps = ?,
                  roe = ?,
                  payout_ratio = ?,
                  beta = ?,
                  justified_pe = ?,
                  req_rate_of_return = ?,
                  growth_rate = ?,
                  rsi = ?,
                  macd = ?,
                  current_ratio = ?,
                  quick_ratio = ?,
                  debt_to_equity = ?,
                  roa = ?,
                  asset_turnover = ?,
                  inventory_turnover = ?,
                  cash_conversion_cycle = ?,
                  net_income = COALESCE(NULLIF(?, 0), net_income),
                  updated_at = datetime("now") 
                WHERE ticker = ?
              `)
                .bind(
                  cid,
                  eps, peRatio, low52, high52, 
                  paidUp, marketCap, creditRating, category, dividendYield, 
                  nav, dps, roe, payoutRatio, beta, justifiedPe, r, g,
                  rsi, macd, currentRatio, quickRatio, debtToEquity, roa, assetTurnover, inventoryTurnover, cashConversion, netIncome,
                  stock.ticker
                )
            );
            
            // Shareholding Pattern
            if (shareholding && shareholding.length > 0) {
                const latestShare = shareholding[shareholding.length - 1]; 
                if (latestShare.date) {
                    stmts.push(
                        db.prepare(`
                            INSERT INTO shareholding_patterns (ticker, month_year, sponsor_director, govt, foreign_stake, institute, public_stake, fetched_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"))
                            ON CONFLICT(ticker, month_year) DO UPDATE SET
                                sponsor_director = excluded.sponsor_director,
                                govt = excluded.govt,
                                foreign_stake = excluded.foreign_stake,
                                institute = excluded.institute,
                                public_stake = excluded.public_stake,
                                fetched_at = excluded.fetched_at
                        `).bind(
                            stock.ticker, latestShare.date,
                            latestShare.sponsorDirector || 0,
                            latestShare.govt || 0,
                            latestShare.foreign || 0,
                            latestShare.ins || 0,
                            latestShare.public || 0
                        )
                    );
                }
            }
        }
      } catch (e) {
        console.error(`Failed to fetch data for ${stock.ticker}`, e);
      }
    }));

    await Promise.all(scrapeTasks);

    if (stmts.length > 0) {
      // D1 has a batch size limit (100 is safe)
      const chunkSize = 100;
      for (let i = 0; i < stmts.length; i += chunkSize) {
          const chunk = stmts.slice(i, i + chunkSize);
          await db.batch(chunk);
      }
      console.log(`Scraper successfully executed ${stmts.length} statements for LankaBangla update.`);
    } else {
      console.log('No active portfolio stocks found in the scraped data.');
    }
    
  } catch (error) {
    console.error('Scraper failed:', error);
  }
}
