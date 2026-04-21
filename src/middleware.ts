import { defineMiddleware } from 'astro:middleware';

// Spiegelt `/en/...` auf die deutschen Routen — eine Page-Datei, zwei Sprachen.
// Die eigentliche Sprache wird über `Astro.locals.lang` oder das Cookie `kk_lang` verfügbar.
export const onRequest = defineMiddleware(async (context, next) => {
  const { url, request } = context;
  const path = url.pathname;

  // 1. Explizite URL-Präfixe haben Vorrang
  let lang: 'de' | 'en' = 'de';
  if (path === '/en' || path.startsWith('/en/')) {
    lang = 'en';
  } else {
    const cookie = request.headers.get('cookie') || '';
    const m = cookie.match(/(?:^|;\s*)kk_lang=(de|en)/);
    if (m) lang = m[1] as 'de' | 'en';
  }
  (context.locals as { lang: 'de' | 'en' }).lang = lang;

  // 2. Bei `/en/...` intern auf die deutschsprachige Page-Datei umschreiben,
  //    damit wir nicht jede Page doppelt pflegen müssen.
  if (path === '/en' || path === '/en/') {
    return context.rewrite(new URL('/', url));
  }
  if (path.startsWith('/en/')) {
    const stripped = path.slice(3); // "/en/shop" → "/shop"
    return context.rewrite(new URL(stripped + url.search, url));
  }

  return next();
});
