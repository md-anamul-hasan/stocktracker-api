const https = require('https');
const urls = ['https://staticv2.amarstock.com/bundles/js/common?v=9QfJBZ6x9o1g7VbAWX-EnpPzZlUQvplN9W3JOyyoHIY1', 'https://staticv2.amarstock.com/bundles/js/chart?v=OKzsC8PnzVsI60Nc-C9gVb-pAEmjV0kFVzHb9b2guYA1', 'https://staticv2.amarstock.com/bundles/jquery-plugin?v=elPwLU1XMMGS9z4jEbQNz7kENIuUxOZQvg8kdz_wlh81', 'https://staticv2.amarstock.com/bundles/foundation?v=vcjqC82le8xXYFzIz8KXssKQpXJBr1BzC1o_kvLl7b41', 'https://staticv2.amarstock.com/bundles/js/CommonMarketStatus?v=z5ymZ1yNJ1VatFKFShM8vh-otReHIZ8IY9f7Z-MY0Uc1'];

Promise.all(urls.map(u => fetch(u).then(r=>r.text()))).then(texts => {
  texts.forEach((t, i) => {
    if(t.includes('11bfa580-3cc4a8b9e57d')) {
      console.log('File ' + i + ' has the UUID');
    }
    const m = t.match(/\/data\/[^\"'\`]+/ig);
    if(m) console.log('File ' + i + ' data paths:', [...new Set(m)]);
    
    const m2 = t.match(/\/api\/[^\"'\`]+/ig);
    if(m2) console.log('File ' + i + ' api paths:', [...new Set(m2)]);
  });
});
