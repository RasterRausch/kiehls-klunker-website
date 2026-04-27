// Versand-Tier-Logik: Lieferziel → Tier → Versandkosten.
// - DE: kostenlos
// - US/Übersee: artikelabhängiger Aufpreis (priceUS - priceDE) × Menge
// - WORLD/Rest: pauschal 4,90 € pro Bestellung
//
// Hinweis: Spiegelt sich in src/components/CartDrawer.astro für die Live-Anzeige.
// Wer hier was ändert, muss auch dort nachziehen.

export type ShippingTier = 'DE' | 'US' | 'WORLD';

// Pauschale für „Übrige Länder" (alles außer DACH-DE und USA-Tier)
export const WORLD_FLAT_RATE_EUR = 4.90;

type ProductPriceFields = {
  priceDE?: number;
  priceUS?: number;
  priceWorld?: number;
  price: number;
};

type CartItemForShipping = {
  data: ProductPriceFields;
  quantity: number;
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

// Aufpreis pro Stück (nur für US-Tier).
// DE = 0, WORLD-Tier wird über Pauschale am Order-Level berechnet (siehe shippingTotalEur).
export function shippingSurchargePerItem(
  data: ProductPriceFields,
  tier: ShippingTier,
): number {
  if (tier !== 'US') return 0;
  const base = data.priceDE ?? data.price;
  const us = data.priceUS ?? base;
  return Math.max(0, us - base);
}

// Gesamt-Versandkosten für den Warenkorb basierend auf dem Tier.
export function shippingTotalEur(
  items: readonly CartItemForShipping[],
  tier: ShippingTier,
): number {
  if (tier === 'DE') return 0;
  if (tier === 'WORLD') return items.length > 0 ? WORLD_FLAT_RATE_EUR : 0;
  // US: per-Item-Aufpreis × Menge
  return items.reduce(
    (sum, { data, quantity }) => sum + shippingSurchargePerItem(data, 'US') * quantity,
    0,
  );
}
