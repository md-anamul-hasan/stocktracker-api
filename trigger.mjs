import jwt from 'jsonwebtoken';

const token = jwt.sign({ id: 1, email: 'admin@stocktracker.com', role: 'admin' }, 'stocktracker-jwt-secret-change-in-production', { expiresIn: '1h' });

async function trigger() {
  const res = await fetch('https://stocktracker-api.anam-me2k12.workers.dev/api/admin/trigger-scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  console.log(res.status, await res.text());
}
trigger();
