import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = false;

// Custom-Sitemap, weil @astrojs/sitemap bei SSR-Setups dynamische Routen
// (`/shop/[slug]`) nicht automatisch enumeriert. Wir listen alle Produkte
// + statische Pages mit hreflang-Alternates für DE/EN.

type SitemapEntry = {
  loc: string;       // DE-URL (Default)
  lastmod?: string;  // ISO-Datum
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
};

const STATIC_PAGES: SitemapEntry[] = [
  { loc: '/', changefreq: 'weekly', priority: 1.0 },
  { loc: '/shop', changefreq: 'daily', priority: 0.9 },
  { loc: '/einzelstuecke', changefreq: 'weekly', priority: 0.7 },
  { loc: '/ueber-mich', changefreq: 'monthly', priority: 0.6 },
  { loc: '/kontakt', changefreq: 'yearly', priority: 0.5 },
  { loc: '/agb', changefreq: 'yearly', priority: 0.3 },
  { loc: '/datenschutz', changefreq: 'yearly', priority: 0.3 },
  { loc: '/impressum', changefreq: 'yearly', priority: 0.3 },
  { loc: '/widerruf', changefreq: 'yearly', priority: 0.3 },
];

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}

export const GET: APIRoute = async ({ site }) => {
  const base = site?.toString().replace(/\/$/, '') || 'https://kiehls-klunker.de';

  const products = await getCollection('products');
  const productEntries: SitemapEntry[] = products
    .filter((p) => p.data.available)
    .map((p) => ({
      loc: `/shop/${p.id}`,
      changefreq: 'weekly' as const,
      priority: 0.8,
    }));

  const allEntries = [...STATIC_PAGES, ...productEntries];

  const urls = allEntries
    .map((entry) => {
      const deUrl = `${base}${entry.loc}`;
      const enUrl = `${base}${entry.loc === '/' ? '/en' : `/en${entry.loc}`}`;
      const meta = [
        entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : null,
        entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : null,
        entry.priority != null ? `    <priority>${entry.priority.toFixed(1)}</priority>` : null,
      ].filter(Boolean).join('\n');

      return `  <url>
    <loc>${escapeXml(deUrl)}</loc>
    <xhtml:link rel="alternate" hreflang="de" href="${escapeXml(deUrl)}" />
    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(enUrl)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(deUrl)}" />
${meta}
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
