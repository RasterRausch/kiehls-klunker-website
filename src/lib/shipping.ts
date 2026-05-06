// Versand-Tier-Logik: drei Tarife.
// - DE: nur Deutschland → kostenfrei
// - EU: übriges Europa (EU + CH/NO/IS/LI/GB) → 4,90 € pauschal
// - US: nur USA → 39 € pauschal
//
// Hinweis: Spiegelt sich in src/components/CartDrawer.astro für die Live-Anzeige.
// Wer hier was ändert, muss auch dort nachziehen.

export type ShippingTier = 'DE' | 'EU' | 'US';

export const DE_RATE_EUR = 0;
export const EU_RATE_EUR = 4.90;
export const US_RATE_EUR = 39.00;

export const COUNTRIES_DE: readonly string[] = ['DE'];

export const COUNTRIES_US: readonly string[] = ['US'];

// Übriges Europa: EU-Mitgliedstaaten + Schweiz, Norwegen, Island, Liechtenstein, UK.
export const COUNTRIES_EU: readonly string[] = [
  'AT', 'CH', 'NL', 'BE', 'LU', 'FR', 'IT', 'ES',
  'DK', 'SE', 'FI', 'IE', 'PT', 'PL', 'CZ', 'SK', 'SI', 'HU',
  'BG', 'RO', 'HR', 'EE', 'LV', 'LT', 'GR', 'CY', 'MT',
  'NO', 'IS', 'LI', 'GB',
];

export function tierFor(country: string): ShippingTier {
  if (COUNTRIES_US.includes(country)) return 'US';
  if (COUNTRIES_DE.includes(country)) return 'DE';
  return 'EU';
}

export function countriesForTier(tier: ShippingTier): readonly string[] {
  if (tier === 'US') return COUNTRIES_US;
  if (tier === 'DE') return COUNTRIES_DE;
  return COUNTRIES_EU;
}

// Pauschale pro Bestellung — unabhängig von Anzahl/Preis der Artikel.
// Aufrufer stellen sicher, dass der Cart nicht leer ist (siehe api/checkout.ts).
export function shippingTotalEur(tier: ShippingTier): number {
  if (tier === 'US') return US_RATE_EUR;
  if (tier === 'EU') return EU_RATE_EUR;
  return DE_RATE_EUR;
}
