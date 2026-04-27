import { defineMiddleware } from 'astro:middleware';
import geoip from 'geoip-lite';
import type { Country } from './lib/price';

// Mapping: Echtes Country (ISO-2) → Preisregion.
// DE/AT/CH (deutschsprachig) bekommen DE-Preise, USA US-Preise, alles andere
// fällt auf WORLD (Etsy-Original-Preise) zurück.
function priceRegion(country: string | undefined): Country {
  if (country === 'DE' || country === 'AT' || country === 'CH') return 'DE';
  if (country === 'US') return 'US';
  return 'WORLD';
}

function isGermanSpeaking(country: string | undefined): boolean {
  return country === 'DE' || country === 'AT' || country === 'CH';
}

// Holt die Client-IP hinter dem Mittwald-Reverse-Proxy.
// Bevorzugte Reihenfolge: X-Forwarded-For (erste Adresse) → X-Real-IP → undefined.
function clientIp(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return null;
}

// `/en/...` und `/api/...` werden NICHT auto-redirected; alle anderen GET-Pages schon.
function shouldAutoRedirect(path: string): boolean {
  if (path === '/en' || path.startsWith('/en/')) return false;
  if (path.startsWith('/api/')) return false;
  return true;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, request, cookies } = context;
  const path = url.pathname;

  // 1. Country auflösen — Cookie hat Vorrang, sonst GeoIP-Lookup auf Client-IP.
  let countryRaw = cookies.get('kk_country')?.value;
  if (!countryRaw) {
    const ip = clientIp(request);
    if (ip) {
      const lookup = geoip.lookup(ip);
      countryRaw = lookup?.country || 'XX';
    } else {
      countryRaw = 'XX';
    }
    cookies.set('kk_country', countryRaw, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 Tage
      sameSite: 'lax',
      secure: true,
    });
  }
  const priceCountry = priceRegion(countryRaw);

  // 2. Sprache bestimmen — URL-Präfix > Cookie > Auto-Detect via Country.
  let lang: 'de' | 'en' = 'de';
  const langCookie = cookies.get('kk_lang')?.value;
  const isEnRoute = path === '/en' || path.startsWith('/en/');

  if (isEnRoute) {
    lang = 'en';
  } else if (langCookie === 'en' || langCookie === 'de') {
    lang = langCookie;
  } else if (!isGermanSpeaking(countryRaw) && shouldAutoRedirect(path)) {
    // Kein expliziter Language-Choice & nicht aus DACH → einmaliger Redirect auf /en/
    const targetPath = path === '/' ? '/en' : `/en${path}`;
    return context.redirect(targetPath + url.search, 302);
  }

  context.locals.lang = lang;
  context.locals.country = priceCountry;

  // 3. /en/... intern auf die deutschen Page-Dateien rewriten
  if (path === '/en' || path === '/en/') {
    return context.rewrite(new URL('/', url));
  }
  if (path.startsWith('/en/')) {
    const stripped = path.slice(3);
    return context.rewrite(new URL(stripped + url.search, url));
  }

  return next();
});
