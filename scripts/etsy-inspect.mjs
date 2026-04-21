import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8')
    .split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const KEY = env.ETSY_KEYSTRING, SECRET = env.ETSY_SHARED_SECRET, TOKEN = env.ETSY_ACCESS_TOKEN, SHOP = env.ETSY_SHOP_ID;
const headers = { 'x-api-key': `${KEY}:${SECRET}`, Authorization: `Bearer ${TOKEN}` };

// includes=BuyerPrice + Inventory, und dazu mal einen anderen Endpoint für "buyer view"
async function hit(url, label) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  console.log(`\n━━ ${label} ━━`);
  console.log(`${res.status}  ${url}`);
  console.log(text.slice(0, 1200));
}

await hit(
  `https://openapi.etsy.com/v3/application/listings/611156384?includes=BuyerPrice,Inventory`,
  'Listing mit BuyerPrice + Inventory'
);

// Alle Listings mit buyerprice
await hit(
  `https://openapi.etsy.com/v3/application/shops/18017798/listings/active?includes=BuyerPrice&limit=3`,
  'Listings-Liste mit BuyerPrice'
);
