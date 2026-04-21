// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';

// Site-URL ist pro Umgebung unterschiedlich — auf Staging z. B.
// https://p-bn7b5m.project.space/, auf Production https://kiehls-klunker.de.
// Steuerbar über .env → PUBLIC_SITE_URL.
const siteUrl = process.env.PUBLIC_SITE_URL || 'https://kiehls-klunker.de';

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
