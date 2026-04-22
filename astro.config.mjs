// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

import tailwindcss from '@tailwindcss/vite';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';

// .env wird beim Build nicht automatisch in die Astro-Config geladen,
// deshalb holen wir PUBLIC_SITE_URL explizit über Vite's loadEnv.
const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
const siteUrl = env.PUBLIC_SITE_URL || 'https://kiehls-klunker.de';

export default defineConfig({
  site: siteUrl,
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  devToolbar: { enabled: false },
  i18n: {
    defaultLocale: 'de',
    locales: ['de', 'en'],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [svelte(), sitemap({ i18n: { defaultLocale: 'de', locales: { de: 'de', en: 'en' } } })],
});
