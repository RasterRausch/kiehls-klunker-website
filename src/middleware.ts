import { defineMiddleware } from 'astro:middleware';

// Spiegelt `/en/...` auf die deutschen Routen — eine Page-Datei, zwei Sprachen.
// Die eigentliche Sprache wird über `Astro.locals.lang` oder das Cookie `kk_lang` verfügbar.
export const onRequest = defineMiddleware(async (context, next) => {
  const { url, request } = context;
  const path = url.pathname;

  // 1. Sprache: URL-Präfix > Cookie > Default DE.
  let lang: 'de' | 'en' = 'de';
  if (path === '/en' || path.startsWith('/en/')) {
    lang = 'en';
  } else {
    const cookie = request.headers.get('cookie') || '';
    const m = cookie.match(/(?:^|;\s*)kk_lang=(de|en)/);
    if (m) lang = m[1] as 'de' | 'en';
  }
  context.locals.lang = lang;

  // 2. /en/... intern auf die deutschen Page-Dateien rewriten.
  // Wichtig: `next(pfad)` statt `context.rewrite()`, damit die Middleware
  // *nicht* erneut für den rewriteten Pfad ausgeführt wird — sonst würde
  // `locals.lang` auf DE-Default zurückgesetzt, weil der gestrippte Pfad
  // den `/en/`-Check nicht mehr matcht.
  if (path === '/en' || path === '/en/') {
    return next('/');
  }
  if (path.startsWith('/en/')) {
    const stripped = path.slice(3);
    return next(stripped + url.search);
  }

  return next();
});
