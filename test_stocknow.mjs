import { writeFileSync } from 'fs';

async function downloadJs() {
    console.log("Fetching JS file...");
    const jsRes = await fetch('https://stocknow.com.bd/js/app.5213610e.js', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
    });
    
    const js = await jsRes.text();
    writeFileSync('app.js', js);
    console.log("JS file fetched and saved to app.js, length:", js.length);

    const jsRes2 = await fetch('https://stocknow.com.bd/js/chunk-vendors.0eac66fc.js', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
    });
    
    const js2 = await jsRes2.text();
    writeFileSync('chunk-vendors.js', js2);
    console.log("JS file fetched and saved to chunk-vendors.js, length:", js2.length);
}

downloadJs().catch(console.error);
