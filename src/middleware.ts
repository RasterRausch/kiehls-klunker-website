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
  if (path === '/en' || path === '/en/') {
    return context.rewrite(new URL('/', url));
  }
  if (path.startsWith('/en/')) {
    const stripped = path.slice(3);
    return context.rewrite(new URL(stripped + url.search, url));
  }

  return next();
});
