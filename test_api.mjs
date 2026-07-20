import { writeFileSync } from 'fs';

async function testApi() {
    console.log("Fetching /instruments...");
    const instrRes = await fetch('https://stocknow.com.bd/api/v1/instruments', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
    });
    
    if (instrRes.ok) {
        const instruments = await instrRes.json();
        writeFileSync('instruments.json', JSON.stringify(instruments, null, 2));
        console.log("Instruments fetched, keys count:", Object.keys(instruments).length);
    } else {
        console.log("Instruments failed:", instrRes.status, await instrRes.text());
    }

    console.log("Fetching /fundamentals-hash...");
    const hashRes = await fetch('https://stocknow.com.bd/api/v1/fundamentals-hash', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
    });

    if (hashRes.ok) {
        const hash = await hashRes.text();
        console.log("Fundamentals hash:", hash);
        
        console.log("Fetching /fundamentals?h=" + hash);
        const fundRes = await fetch('https://stocknow.com.bd/api/v1/fundamentals?h=' + hash, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
        });
        
        if (fundRes.ok) {
            const fundamentals = await fundRes.json();
            writeFileSync('fundamentals.json', JSON.stringify(fundamentals, null, 2));
            console.log("Fundamentals fetched, keys count:", Object.keys(fundamentals).length);
        } else {
            console.log("Fundamentals failed:", fundRes.status, await fundRes.text());
        }
    } else {
         console.log("Fundamentals hash failed:", hashRes.status, await hashRes.text());
    }
}

testApi().catch(console.error);
