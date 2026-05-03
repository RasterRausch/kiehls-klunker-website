// Versand-Tier-Logik: zwei Tarife.
// - STD: Deutschland + EU + Rest-Europa → kostenfrei
// - US:  nur USA → 39 € pauschal pro Bestellung
//
// Hinweis: Spiegelt sich in src/components/CartDrawer.astro für die Live-Anzeige.
// Wer hier was ändert, muss auch dort nachziehen.

export type ShippingTier = 'STD' | 'US';

export const STD_RATE_EUR = 0;
export const US_RATE_EUR = 39.00;

// USA als eigener Tarif wegen langer Distanz / Zoll-Aufwand.
export const COUNTRIES_US: readonly string[] = ['US'];

// Standard-Tarif: Deutschland + EU + Rest-Europa.
export const COUNTRIES_STD: readonly string[] = [
  'DE',
  'AT', 'CH', 'NL', 'BE', 'LU', 'FR', 'IT', 'ES',
  'DK', 'SE', 'FI', 'IE', 'PT', 'PL', 'CZ', 'SK', 'SI', 'HU',
  'BG', 'RO', 'HR', 'EE', 'LV', 'LT', 'GR', 'CY', 'MT',
  'NO', 'IS', 'LI', 'GB',
];

export function tierFor(country: string): ShippingTier {
  return COUNTRIES_US.includes(country) ? 'US' : 'STD';
}

export function countriesForTier(tier: ShippingTier): readonly string[] {
  return tier === 'US' ? COUNTRIES_US : COUNTRIES_STD;
}

// Pauschale pro Bestellung — unabhängig von Anzahl/Preis der Artikel.
// Aufrufer stellen sicher, dass der Cart nicht leer ist (siehe api/checkout.ts).
export function shippingTotalEur(tier: ShippingTier): number {
  return tier === 'US' ? US_RATE_EUR : STD_RATE_EUR;
}
