import type { APIRoute } from 'astro';
import geoip from 'geoip-lite';

export const prerender = false;

// TEMP: Debug-Endpoint für GeoIP-Erkennung. Vor Go-Live wieder löschen.
export const GET: APIRoute = async ({ request, locals, cookies }) => {
  const xff = request.headers.get('x-forwarded-for');
  const xri = request.headers.get('x-real-ip');
  const cfip = request.headers.get('cf-connecting-ip');
  const candidates = [xff, xri, cfip].filter(Boolean);
  const ipFromXff = xff ? xff.split(',')[0]?.trim() : null;
  const lookup = ipFromXff ? geoip.lookup(ipFromXff) : null;

  return new Response(
    JSON.stringify(
      {
        headers: {
          'x-forwarded-for': xff,
          'x-real-ip': xri,
          'cf-connecting-ip': cfip,
        },
        ipFromXff,
        geoipLookup: lookup,
        locals: {
          lang: (locals as any).lang,
          country: (locals as any).country,
        },
        cookies: {
          kk_country: cookies.get('kk_country')?.value,
          kk_lang: cookies.get('kk_lang')?.value,
        },
        candidates,
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
