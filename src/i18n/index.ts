import { de } from './de';
import { en } from './en';

export type Lang = 'de' | 'en';

const dictionaries = { de, en } as const;

// In SSR-Pages: `getLang(Astro)` liest die von der Middleware gesetzte Sprache.
// Prerendered Seiten laufen ohne Middleware — dort wird immer DE geliefert.
export function getLang(astro: { locals?: { lang?: Lang } }): Lang {
  return astro.locals?.lang ?? 'de';
}

export function t(lang: Lang) {
  return dictionaries[lang];
}

// Baut eine Route für die aktuell gerenderte Seite in der Zielsprache.
// Beispiel: localizedPath('/shop/haarforke', 'en') → '/en/shop/haarforke'
export function localizedPath(path: string, lang: Lang): string {
  const clean = path.replace(/^\/(en|de)(?=\/|$)/, '') || '/';
  if (lang === 'de') return clean;
  return clean === '/' ? '/en' : `/en${clean}`;
}

// Einfache Template-Interpolation für Strings mit {placeholder}.
// interpolate('Noch {count} verfügbar', { count: 3 }) → 'Noch 3 verfügbar'
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    values[key] != null ? String(values[key]) : `{${key}}`,
  );
}

// Übersetzt gängige Varianten-Namen (Farbe, Länge, Größe, ...) von DE nach EN.
// Bei unbekannten Namen wird das Original zurückgegeben — sollte beim nächsten
// Etsy-Sync idealerweise auch EN-Varianten kommen, wenn Katrin sie pflegt.
const VARIANT_NAME_MAP: Record<string, string> = {
  'Farbe': 'Color',
  'Primäre Farbe': 'Primary color',
  'Sekundäre Farbe': 'Secondary color',
  'Länge': 'Length',
  'Größe': 'Size',
  'Material': 'Material',
  'Haartyp': 'Hair type',
};

export function translateVariantName(name: string, lang: Lang): string {
  if (lang === 'de') return name;
  return VARIANT_NAME_MAP[name] ?? name;
}

// Übersetzt Farbwerte (DE-Quelle aus Etsy). Lückenhaft - ergänzen bei Bedarf.
const COLOR_VALUE_MAP: Record<string, string> = {
  'bunt': 'multicolor',
  'karamell': 'caramel',
  'flieder': 'lilac',
  'violett': 'purple',
  'blau': 'blue',
  'hellblau': 'light blue',
  'grün': 'green',
  'mint': 'mint',
  'gelb': 'yellow',
  'rosé': 'rose',
  'rosa': 'pink',
  'rot': 'red',
  'schwarz': 'black',
  'weiß': 'white',
  'grau': 'gray',
  'silber': 'silver',
  'gold': 'gold',
  'ohne (titangrau)': 'plain (titanium grey)',
};

export function translateVariantValue(value: string, lang: Lang): string {
  if (lang === 'de') return value;
  // Leading "N Farbname" — Zahl behalten, Farbname übersetzen
  const match = value.match(/^(\d+\s+)(.+)$/);
  if (match) {
    const colorKey = match[2].toLowerCase();
    const translated = COLOR_VALUE_MAP[colorKey];
    return translated ? `${match[1]}${translated}` : value;
  }
  return COLOR_VALUE_MAP[value.toLowerCase()] ?? value;
}

export { de, en };
