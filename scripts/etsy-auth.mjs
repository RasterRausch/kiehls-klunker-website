#!/usr/bin/env node
/**
 * Etsy OAuth 2.0 Authorization Flow (PKCE) — zweistufig
 *
 *   npm run auth:etsy             → Link generieren, State in .etsy-auth-pending speichern
 *   npm run auth:etsy <url>       → URL der Kundin einlösen, Tokens in .env schreiben
 *
 * Voraussetzung:
 *   - ETSY_KEYSTRING in .env
 *   - Redirect-URI "http://localhost:3000/callback" ist im Etsy Developer Portal registriert
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const pendingPath = path.join(rootDir, '.etsy-auth-pending');

// ── Konfiguration ────────────────────────────────────────────────
const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPES = ['transactions_r', 'listings_r'].join(' ');
const AUTH_URL = 'https://www.etsy.com/oauth/connect';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

// ── Helpers ──────────────────────────────────────────────────────
const bar = '━'.repeat(66);
const readEnv = () => {
  if (!fs.existsSync(envPath)) throw new Error('.env fehlt');
  const content = fs.readFileSync(envPath, 'utf-8');
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
};
const writeEnvKey = (content, key, value) => {
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(content) ? content.replace(re, `${key}=${value}`) : `${content}\n${key}=${value}`;
};

// ── Schritt 2: URL der Kundin einlösen ──────────────────────────
const pastedUrl = process.argv[2];
if (pastedUrl) {
  if (!fs.existsSync(pendingPath)) {
    console.error('\n✗ Keine laufende Auth-Session. Erst `npm run auth:etsy` (ohne URL) ausführen.\n');
    process.exit(1);
  }
  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));

  let code, returnedState;
  try {
    const u = new URL(pastedUrl);
    code = u.searchParams.get('code');
    returnedState = u.searchParams.get('state');
  } catch {
    console.error('\n✗ Das sieht nicht nach einer URL aus.\n');
    process.exit(1);
  }

  if (!code) {
    console.error('\n✗ Kein "code" in der URL. Hat die Kundin die komplette URL kopiert?\n');
    process.exit(1);
  }
  if (returnedState !== pending.state) {
    console.error('\n✗ State stimmt nicht — Sicherheitsabbruch. Bitte neu starten.\n');
    process.exit(1);
  }

  const { map } = readEnv();
  const CLIENT_ID = map.ETSY_KEYSTRING;

  console.log('\n⏳ Tausche Code gegen Tokens bei Etsy…');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: pending.codeVerifier,
    }),
  });
  if (!res.ok) {
    console.error(`\n✗ Token-Austausch fehlgeschlagen (HTTP ${res.status}):`);
    console.error(await res.text(), '\n');
    process.exit(1);
  }
  const tokens = await res.json();

  let content = fs.readFileSync(envPath, 'utf-8');
  content = writeEnvKey(content, 'ETSY_ACCESS_TOKEN', tokens.access_token);
  content = writeEnvKey(content, 'ETSY_REFRESH_TOKEN', tokens.refresh_token);
  fs.writeFileSync(envPath, content);
  fs.unlinkSync(pendingPath);

  console.log(`\n${bar}`);
  console.log('  ✓ ERFOLG — Tokens sind in .env gespeichert');
  console.log(bar);
  console.log(`
  Access-Token:   gültig ~${Math.round(tokens.expires_in / 3600)}h
  Refresh-Token:  langfristig, erneuert sich automatisch
`);
  process.exit(0);
}

// ── Schritt 1: Link generieren ───────────────────────────────────
const { map } = readEnv();
const CLIENT_ID = map.ETSY_KEYSTRING;
if (!CLIENT_ID) {
  console.error('✗ ETSY_KEYSTRING fehlt in .env\n');
  process.exit(1);
}

const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
const state = crypto.randomBytes(16).toString('hex');

fs.writeFileSync(pendingPath, JSON.stringify({ codeVerifier, state }, null, 2));

const authUrl = new URL(AUTH_URL);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('state', state);
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');

console.log(`\n${bar}`);
console.log('  SCHRITT 1 — Diesen Link an die Kundin schicken:');
console.log(`${bar}\n`);
console.log(authUrl.toString());
console.log(`\n${bar}`);
console.log('  Anweisung für die Kundin:');
console.log(bar);
console.log(`
  1. Link im Browser öffnen
  2. Bei Etsy anmelden (falls nötig)
  3. Auf "Allow Access" klicken
  4. Die nun folgende Fehlerseite ("localhost konnte nicht erreicht werden") ist normal
  5. KOMPLETTE URL aus der Adresszeile kopieren und zurückschicken
     (beginnt mit http://localhost:3000/callback?code=…)
`);
console.log(`${bar}`);
console.log('\n  SCHRITT 2 — URL einlösen, wenn sie von der Kundin da ist:');
console.log(`  npm run auth:etsy -- "<URL-der-Kundin>"\n`);
