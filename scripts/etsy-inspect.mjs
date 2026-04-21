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
async function hit(url, label, full = false) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  console.log(`\n━━ ${label} ━━`);
  console.log(`${res.status}  ${url}`);
  console.log(full ? text : text.slice(0, 4000));
}

const LISTING = '611155804';

await hit(
  `https://openapi.etsy.com/v3/application/listings/${LISTING}?includes=BuyerPrice,Inventory`,
  'Listing mit BuyerPrice + Inventory',
  true
);

await hit(
  `https://openapi.etsy.com/v3/application/shops/18017798/listings/${LISTING}/translations/en`,
  'Listing Translation EN',
  true
);

await hit(
  `https://openapi.etsy.com/v3/application/shops/18017798/listings/${LISTING}/translations/de`,
  'Listing Translation DE',
  true
);
