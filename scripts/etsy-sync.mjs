#!/usr/bin/env node
/**
 * Etsy → Astro Content Sync
 *
 *   npm run sync:etsy               → holt Listings + Reviews, schreibt .md-Dateien
 *   DRY_RUN=1 npm run sync:etsy     → zeigt nur was passieren würde, schreibt nichts
 *
 * Was das Script tut:
 *   1. Access-Token mit Refresh-Token erneuern, neue Tokens in .env speichern
 *   2. Alle aktiven Listings laden (inkl. Bilder + Inventory)
 *   3. Bilder nach src/content/products/images/<slug>/ herunterladen
 *   4. Produkt-.md in src/content/products/<slug>.md schreiben
 *   5. Reviews laden, neue als .md in src/content/reviews/ anlegen (bestehende bleiben)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ENV = path.join(ROOT, '.env');
const PRODUCTS_DIR = path.join(ROOT, 'src/content/products');
const REVIEWS_DIR = path.join(ROOT, 'src/content/reviews');
const IMAGES_DIR = path.join(PRODUCTS_DIR, 'images');

const API = 'https://openapi.etsy.com/v3/application';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const DRY = process.env.DRY_RUN === '1';

const bar = '─'.repeat(66);

// ── .env Helpers ────────────────────────────────────────────────
function readEnv() {
  const content = fs.readFileSync(ENV, 'utf-8');
  const map = Object.fromEntries(
    content
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
  return { content, map };
}
function writeEnvKey(src, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(src) ? src.replace(re, `${key}=${value}`) : `${src}\n${key}=${value}`;
}

// ── Auth + Config ───────────────────────────────────────────────
let CLIENT_ID, SHARED_SECRET, SHOP_ID, ACCESS, REFRESH;

async function refreshAccessToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: REFRESH,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token-Refresh fehlgeschlagen (${res.status}): ${await res.text()}`);
  }
  const t = await res.json();
  ACCESS = t.access_token;
  REFRESH = t.refresh_token;

  let env = fs.readFileSync(ENV, 'utf-8');
  env = writeEnvKey(env, 'ETSY_ACCESS_TOKEN', t.access_token);
  env = writeEnvKey(env, 'ETSY_REFRESH_TOKEN', t.refresh_token);
  fs.writeFileSync(ENV, env);
}

async function etsy(endpoint, { noAuth = false } = {}) {
  // Etsy Personal-Access erwartet: x-api-key = "<keystring>:<shared_secret>"
  const headers = { 'x-api-key': `${CLIENT_ID}:${SHARED_SECRET}` };
  if (!noAuth) headers['Authorization'] = `Bearer ${ACCESS}`;
  const res = await fetch(`${API}${endpoint}`, { headers });
  if (!res.ok) {
    throw new Error(`Etsy ${endpoint} → ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

// ── Utilities ───────────────────────────────────────────────────
function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[äöüß]/g, (m) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[m]))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function detectCategory(title) {
  const t = title.toLowerCase();
  if (t.includes('forke')) return 'haarforken';
  if (t.includes('nudel') || t.includes('stab') || t.includes('komma')) return 'haarstaebe';
  if (t.includes('spange')) return 'haarspangen';
  if (t.includes('zopf')) return 'zopfhalter';
  if (t.includes('ohr') || t.includes('ring')) return 'ohrschmuck';
  return 'haarforken';
}

function detectMaterial(title, description = '') {
  // Titel hat Vorrang — Beschreibungen erwähnen häufig andere Materialien
  // als Vergleich (z.B. "anders als Titan ist Messing…") und würden sonst
  // falsch matchen.
  const scan = (text) => {
    const t = text.toLowerCase();
    if (/\btitan(ium)?\b/.test(t)) return 'Titan';
    if (/\bmessing\b|\bbrass\b/.test(t)) return 'Messing';
    if (/\bsilber\b|\bsterling\b/.test(t)) return 'Silber';
    if (/\bgold\b/.test(t)) return 'Gold';
    return '';
  };
  return scan(title) || scan(description);
}

function yamlString(s) {
  if (!s) return '""';
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// —— Varianten-Normalisierung —————————————————————————————————————
// Property-Namen → deutsche, konsistente Bezeichnung
const VARIANT_NAME_MAP = {
  'primary color': 'Farbe',
  'secondary color': 'Farbe',
  'color': 'Farbe',
  'colour': 'Farbe',
  'farbe': 'Farbe',
  'length': 'Länge',
  'länge': 'Länge',
  'size': 'Größe',
  'größe': 'Größe',
  'material': 'Material',
  'hair type': 'Haartyp',
  'style': 'Stil',
};
function normalizeVariantName(raw) {
  const key = raw.trim().toLowerCase();
  return VARIANT_NAME_MAP[key] ?? raw.trim();
}

// Werte säubern: führende Sortier-Nummer entfernen ("0 ohne" → "ohne"),
// aber NICHT bei Maß-Gruppen (da sind Zahlen echte Maße: "10 cm").
// Leerzeichen/Smileys trimmen, leere Fragezeichen-Placeholder zu "Wunschmaß"
function cleanVariantValue(raw, groupName = '') {
  let v = String(raw).trim();
  const isMeasure = /länge|größe|length|size/i.test(groupName);
  if (!isMeasure) {
    // Sortier-Präfix wegputzen: "0 ", "11 ", "1. ", "01 - "
    v = v.replace(/^\s*\d+[.)\s-]+/, '').trim();
  }
  // Emoji + Smileys am Ende entfernen
  v = v.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
  v = v.replace(/\s*:-?\)\s*$/, '').trim();
  // Typische "Wunsch"-Platzhalter einheitlich
  if (/^\?+\s*(cm)?$/i.test(v) || /^\?\s*-\s*länge/i.test(v)) return 'Wunschmaß';
  return v;
}

// —— Beschreibungs-Normalisierung ————————————————————————————————
// Konservativ: Nur klar erkennbare Struktur (Maße/Material/Herstellungsart)
// in Markdown-Sektionen umschreiben. Alles andere bleibt wie es ist.
function normalizeDescription(raw) {
  let desc = (raw || '').trim();
  if (!desc) return desc;

  // Trailing-Anker ergänzen, damit Sektionen am Dokumenten-Ende auch matchen
  desc += '\n\n';

  // 1) "!!! ... !!!"-Hinweise → kursive Betonung
  desc = desc.replace(/!!!\s*([^!]+?)\s*!!!/g, '*$1*');

  // 2) Typografie: "11cm x 2cm" → "11cm × 2cm"
  desc = desc.replace(
    /(\d[\d,]*\s*(?:cm|mm)?)\s*[xX]\s*(\d[\d,]*\s*(?:cm|mm))/gi,
    '$1 × $2',
  );

  // 3) Strukturierte Sektionen: Header: + Content bis zum nächsten Header/Leerzeile
  //    (kein /m Flag → $ ≠ Zeilenende; Sektionsende nur via \n\n oder nächstem Header)
  const headers = ['Maße', 'Material', 'Herstellungsart'];
  for (const header of headers) {
    const stopPattern = headers.map((h) => `${h}:`).join('|');
    const re = new RegExp(
      `(^|\\n)${header}:\\s*\\n([\\s\\S]+?)(?=\\n\\s*(?:${stopPattern})|\\n{2,})`,
    );
    desc = desc.replace(re, (_m, prefix, content) => {
      const lines = content
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);
      // Single-Liner ohne ":" → als Absatz
      if (lines.length === 1 && !/:/.test(lines[0])) {
        return `${prefix}### ${header}\n\n${lines[0]}`;
      }
      // Mehrzeilig / Key-Value → Liste
      const items = lines.map((line) => {
        const m = line.match(/^([^:]+):\s*(.+)$/);
        if (m) return `- **${m[1].trim()}** — ${m[2].trim()}`;
        return `- ${line}`;
      });
      return `${prefix}### ${header}\n\n${items.join('\n')}`;
    });
  }

  return desc.trim();
}

// Werte sortieren: Längen numerisch aufsteigend, Farben alphabetisch,
// "Wunsch..."-Einträge ans Ende
function sortVariantValue(groupName, a, b) {
  const isWishA = /^wunsch/i.test(a);
  const isWishB = /^wunsch/i.test(b);
  if (isWishA && !isWishB) return 1;
  if (!isWishA && isWishB) return -1;
  if (/länge|größe/i.test(groupName)) {
    const na = parseFloat(String(a).replace(',', '.'));
    const nb = parseFloat(String(b).replace(',', '.'));
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
  }
  return a.localeCompare(b, 'de');
}

// Globaler Cache: listing_id → { title, slug } damit Reviews den Namen kennen
const LISTING_CACHE = new Map();
// Globaler Cache: transaction_id → "Vorname I." (aus Receipts)
const BUYER_CACHE = new Map();

// ── Receipts holen, Käufer-Namen mappen ─────────────────────────
async function loadBuyerNames() {
  let offset = 0;
  const LIMIT = 100;
  let total = 0;
  while (true) {
    const data = await etsy(
      `/shops/${SHOP_ID}/receipts?limit=${LIMIT}&offset=${offset}&was_paid=true`
    );
    const results = data.results || [];
    for (const r of results) {
      // Namen auf "Vorname I." kürzen (Datenschutz + Etsy-Standard)
      const full = (r.name || '').trim();
      if (!full) continue;
      const parts = full.split(/\s+/);
      const first = parts[0];
      const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] + '.' : '';
      const display = lastInitial ? `${first} ${lastInitial}` : first;
      // Receipt enthält mehrere transactions — alle mit diesem Namen mappen
      for (const tx of r.transactions || []) {
        BUYER_CACHE.set(tx.transaction_id, display);
      }
    }
    total += results.length;
    if (results.length < LIMIT) break;
    offset += LIMIT;
  }
  console.log(`  ${total} Receipts geladen, ${BUYER_CACHE.size} Transaktionen mit Namen gemappt`);
}

// ── Listings → Produkte ─────────────────────────────────────────
async function syncProducts() {
  let offset = 0;
  const LIMIT = 100;
  const all = [];
  while (true) {
    const data = await etsy(
      `/shops/${SHOP_ID}/listings/active?limit=${LIMIT}&offset=${offset}`
    );
    const results = data.results || [];
    all.push(...results);
    if (results.length < LIMIT) break;
    offset += LIMIT;
  }
  console.log(`  ${all.length} aktive Listings bei Etsy`);

  if (!DRY) fs.mkdirSync(IMAGES_DIR, { recursive: true });

  let created = 0;
  let updated = 0;
  let imagesTotal = 0;

  for (const [i, listing] of all.entries()) {
    const slug = slugify(listing.title);
    LISTING_CACHE.set(listing.listing_id, { title: listing.title, slug });
    const imgDir = path.join(IMAGES_DIR, slug);
    if (!DRY) fs.mkdirSync(imgDir, { recursive: true });

    // Bilder separat holen (includes=Images ist unreliable)
    let images = [];
    try {
      const imgData = await etsy(`/listings/${listing.listing_id}/images`);
      images = imgData.results || [];
    } catch (e) {
      console.log(`  ⚠ Bilder-Fehler für ${slug}: ${e.message}`);
    }

    // Varianten aus Inventory (Größe / Farbe / Haartyp / …)
    const variants = [];
    try {
      const inv = await etsy(`/listings/${listing.listing_id}/inventory`);
      const byName = new Map(); // normalisierter Name → Set<value>
      for (const prod of inv.products || []) {
        for (const pv of prod.property_values || []) {
          const rawName = (pv.property_name || '').trim();
          if (!rawName) continue;
          const name = normalizeVariantName(rawName);
          const values = Array.isArray(pv.values) ? pv.values : [];
          if (!byName.has(name)) byName.set(name, new Set());
          for (const v of values) {
            const vt = cleanVariantValue(String(v), name);
            if (vt) byName.get(name).add(vt);
          }
        }
      }
      // Nur Gruppen mit mindestens 2 echten Optionen; Values sortiert
      for (const [name, set] of byName) {
        const vals = [...set].sort((a, b) => sortVariantValue(name, a, b));
        if (vals.length >= 2) variants.push({ name, values: vals });
      }
    } catch (e) {
      if (!/404/.test(e.message)) {
        console.log(`  ⚠ Inventory-Fehler für ${slug}: ${e.message}`);
      }
    }
    const imageRefs = [];
    for (const img of images) {
      const filename = `${img.listing_image_id}.jpg`;
      const dest = path.join(imgDir, filename);
      if (!fs.existsSync(dest) && !DRY) {
        await download(img.url_fullxfull || img.url_570xN, dest);
        imagesTotal++;
      }
      imageRefs.push(`./images/${slug}/${filename}`);
    }

    // Preis aus Etsy
    const price =
      listing.price && listing.price.amount
        ? Math.round((listing.price.amount / listing.price.divisor) * 100) / 100
        : 0;
    const stock = listing.quantity ?? 0;
    const mdPath = path.join(PRODUCTS_DIR, `${slug}.md`);
    const existed = fs.existsSync(mdPath);

    // Bestehende order behalten (falls vorhanden), sonst Etsy-Reihenfolge nehmen
    let preservedOrder = i + 1;
    let preservedFeatured = false;
    let preservedTagline = '';
    // Manuelle Länder-Preise (nicht von Etsy lieferbar) werden beim Sync erhalten
    let preservedPriceDE;
    let preservedPriceUS;
    let preservedPriceWorld;
    let previousEtsyPrice;
    let preservedMaterial;
    let preservedPersonalizationPrompt;
    if (existed) {
      try {
        const old = fs.readFileSync(mdPath, 'utf-8');
        const orderMatch = old.match(/^order:\s*(\d+)/m);
        if (orderMatch) preservedOrder = parseInt(orderMatch[1], 10);
        const featMatch = old.match(/^featured:\s*(true|false)/m);
        if (featMatch) preservedFeatured = featMatch[1] === 'true';
        const tagMatch = old.match(/^tagline:\s*"([^"]*)"/m);
        if (tagMatch) preservedTagline = tagMatch[1];
        const priceDEMatch = old.match(/^priceDE:\s*([\d.]+)/m);
        if (priceDEMatch) preservedPriceDE = parseFloat(priceDEMatch[1]);
        const priceUSMatch = old.match(/^priceUS:\s*([\d.]+)/m);
        if (priceUSMatch) preservedPriceUS = parseFloat(priceUSMatch[1]);
        const priceWorldMatch = old.match(/^priceWorld:\s*([\d.]+)/m);
        if (priceWorldMatch) preservedPriceWorld = parseFloat(priceWorldMatch[1]);
        const oldPriceMatch = old.match(/^price:\s*([\d.]+)/m);
        if (oldPriceMatch) previousEtsyPrice = parseFloat(oldPriceMatch[1]);
        const materialMatch = old.match(/^material:\s*"([^"]*)"/m);
        if (materialMatch) preservedMaterial = materialMatch[1];
        const promptMatch = old.match(/^personalizationPrompt:\s*"([^"]*)"/m);
        if (promptMatch) preservedPersonalizationPrompt = promptMatch[1];
      } catch {}
    }

    // Warnen, wenn Etsy-Basispreis sich bewegt hat — dann sollten die Länder-Preise ggf. nachgezogen werden
    if (previousEtsyPrice != null && previousEtsyPrice !== price && (preservedPriceDE != null || preservedPriceUS != null || preservedPriceWorld != null)) {
      console.log(`  ⚠  ${slug}: Etsy-Preis ${previousEtsyPrice} → ${price} € — Länder-Preise prüfen (DE=${preservedPriceDE ?? '—'}, US=${preservedPriceUS ?? '—'}, World=${preservedPriceWorld ?? '—'})`);
    }

    const lines = [
      '---',
      `name: ${yamlString(listing.title)}`,
      ...(preservedTagline ? [`tagline: ${yamlString(preservedTagline)}`] : []),
      `category: ${yamlString(detectCategory(listing.title))}`,
      ...((preservedMaterial || detectMaterial(listing.title, listing.description || ''))
        ? [`material: ${yamlString(preservedMaterial || detectMaterial(listing.title, listing.description || ''))}`]
        : []),
      `price: ${price}`,
      ...(preservedPriceDE != null ? [`priceDE: ${preservedPriceDE}`] : []),
      ...(preservedPriceUS != null ? [`priceUS: ${preservedPriceUS}`] : []),
      ...(preservedPriceWorld != null ? [`priceWorld: ${preservedPriceWorld}`] : []),
      `currency: ${yamlString(listing.price?.currency_code || 'EUR')}`,
      `stock: ${stock}`,
      `available: ${stock > 0}`,
      `numFavorers: ${listing.num_favorers ?? 0}`,
      `etsyListingId: ${listing.listing_id}`,
      `etsyUrl: ${yamlString(listing.url || '')}`,
      'images:',
      ...imageRefs.map((r) => `  - ${r}`),
      'sizes: []',
      'colors: []',
      ...(variants.length > 0
        ? [
            'variants:',
            ...variants.flatMap((v) => [
              `  - name: ${yamlString(v.name)}`,
              `    values:`,
              ...v.values.map((val) => `      - ${yamlString(val)}`),
            ]),
          ]
        : ['variants: []']),
      `featured: ${preservedFeatured}`,
      `order: ${preservedOrder}`,
      `personalizable: ${!!listing.is_personalizable}`,
      ...(preservedPersonalizationPrompt ? [`personalizationPrompt: ${yamlString(preservedPersonalizationPrompt)}`] : []),
      '---',
      '',
      normalizeDescription(listing.description || ''),
      '',
    ];

    if (!DRY) fs.writeFileSync(mdPath, lines.join('\n'));

    if (existed) updated++;
    else created++;

    console.log(
      `  ${existed ? '↻' : '+'} ${slug.padEnd(42)} ${images.length} Bilder · Stock ${stock}`
    );
  }

  console.log(`\n  → ${created} neu, ${updated} aktualisiert, ${imagesTotal} Bilder heruntergeladen`);
}

// ── Reviews ─────────────────────────────────────────────────────
async function syncReviews() {
  let offset = 0;
  const LIMIT = 100;
  const all = [];
  while (true) {
    const data = await etsy(`/shops/${SHOP_ID}/reviews?limit=${LIMIT}&offset=${offset}`);
    const results = data.results || [];
    all.push(...results);
    if (results.length < LIMIT) break;
    offset += LIMIT;
  }
  console.log(`  ${all.length} Reviews bei Etsy`);

  if (!DRY) fs.mkdirSync(REVIEWS_DIR, { recursive: true });

  let created = 0;
  let skipped = 0;

  for (const r of all) {
    if (!r.review || !r.review.trim()) {
      skipped++;
      continue;
    }
    const ts = r.created_timestamp || r.create_timestamp;
    if (!ts) {
      skipped++;
      continue;
    }
    const date = new Date(ts * 1000);
    const dateStr = date.toISOString().slice(0, 10);
    const filename = `${dateStr}-etsy-${r.transaction_id}.md`;
    const mdPath = path.join(REVIEWS_DIR, filename);

    if (fs.existsSync(mdPath)) {
      skipped++;
      continue;
    }

    // Produktname aus bereits geladenem Listing-Cache — kein extra API-Call
    const cached = r.listing_id ? LISTING_CACHE.get(r.listing_id) : null;
    const productName = cached ? cached.title : '';
    // Käufer-Name aus Receipts-Cache
    const buyerName = BUYER_CACHE.get(r.transaction_id) || 'Etsy-Kundin';

    const lines = [
      '---',
      `author: ${yamlString(buyerName)}`,
      `rating: ${r.rating}`,
      `date: ${dateStr}`,
      ...(productName ? [`productName: ${yamlString(productName)}`] : []),
      'source: "etsy"',
      'verified: true',
      'featured: true',
      '---',
      '',
      r.review.trim(),
      '',
    ];

    if (!DRY) fs.writeFileSync(mdPath, lines.join('\n'));
    created++;
    console.log(`  + ${filename}`);
  }

  console.log(`\n  → ${created} neu, ${skipped} übersprungen`);
}

// ── Main ────────────────────────────────────────────────────────
(async () => {
  console.log(DRY ? '\n⚠️  DRY RUN — es wird nichts geschrieben\n' : '');

  const { map } = readEnv();
  CLIENT_ID = map.ETSY_KEYSTRING;
  SHARED_SECRET = map.ETSY_SHARED_SECRET;
  SHOP_ID = map.ETSY_SHOP_ID;
  ACCESS = map.ETSY_ACCESS_TOKEN;
  REFRESH = map.ETSY_REFRESH_TOKEN;

  if (!CLIENT_ID || !SHARED_SECRET || !SHOP_ID || !REFRESH) {
    console.error('✗ ETSY_KEYSTRING / ETSY_SHARED_SECRET / ETSY_SHOP_ID / ETSY_REFRESH_TOKEN fehlen in .env');
    process.exit(1);
  }

  console.log('⏳ Access-Token erneuern…');
  await refreshAccessToken();
  console.log('✓ Token frisch\n');

  console.log(bar);
  console.log('  PRODUKTE');
  console.log(bar);
  await syncProducts();

  console.log('\n' + bar);
  console.log('  RECEIPTS (für Käufer-Namen)');
  console.log(bar);
  await loadBuyerNames();

  console.log('\n' + bar);
  console.log('  REVIEWS');
  console.log(bar);
  await syncReviews();

  console.log('\n✓ Sync fertig.\n');
})().catch((e) => {
  console.error('\n✗ Fehler:', e.message || e);
  process.exit(1);
});
