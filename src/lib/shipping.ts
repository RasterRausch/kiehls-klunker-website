// Versand-Tier-Logik: Lieferziel → Tier → Versandkosten pro Artikel.
// Der Aufpreis pro Artikel = priceUS-priceDE (für USA/Übersee) bzw.
// priceWorld-priceDE (für Rest). Innerhalb DE = kostenlos.

export type ShippingTier = 'DE' | 'US' | 'WORLD';

type ProductPriceFields = {
  priceDE?: number;
  priceUS?: number;
  priceWorld?: number;
  price: number;
};

// Welche Länder fallen unter welches Tier?
export const COUNTRIES_DE: readonly string[] = ['DE'];

// USA + vergleichbare Übersee-Märkte (lange Versanddistanz, höhere Kosten/Zoll)
export const COUNTRIES_US: readonly string[] = ['US', 'CA', 'AU', 'NZ', 'JP'];

// Alles andere aus ALLOWED_COUNTRIES (siehe api/checkout.ts)
export const COUNTRIES_WORLD: readonly string[] = [
  // EU + DACH non-DE
  'AT', 'CH', 'NL', 'BE', 'LU', 'FR', 'IT', 'ES',
  'DK', 'SE', 'FI', 'IE', 'PT', 'PL', 'CZ', 'SK', 'SI', 'HU',
  'BG', 'RO', 'HR', 'EE', 'LV', 'LT', 'GR', 'CY', 'MT',
  // Europäische Nicht-EU
  'NO', 'IS', 'LI', 'GB',
];

export function tierFor(country: string): ShippingTier {
  if (COUNTRIES_DE.includes(country)) return 'DE';
  if (COUNTRIES_US.includes(country)) return 'US';
  return 'WORLD';
}

export function countriesForTier(tier: ShippingTier): readonly string[] {
  if (tier === 'DE') return COUNTRIES_DE;
  if (tier === 'US') return COUNTRIES_US;
  return COUNTRIES_WORLD;
}

// Aufpreis pro Stück basierend auf der vorgegebenen Preisstaffel.
// Wenn priceUS/priceWorld nicht gepflegt sind, fällt der Aufpreis auf 0.
export function shippingSurchargePerItem(
  data: ProductPriceFields,
  tier: ShippingTier,
): number {
  const base = data.priceDE ?? data.price;
  if (tier === 'DE') return 0;
  if (tier === 'US') {
    const us = data.priceUS ?? base;
    return Math.max(0, us - base);
  }
  // WORLD
  const world = data.priceWorld ?? base;
  return Math.max(0, world - base);
}
