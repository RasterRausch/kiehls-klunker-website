// Zentrale Preis-Auflösung. Aktuell liefert sie immer den DE-Preis (mit
// Fallback auf den Etsy-Basispreis). Sobald `priceUS`/`priceWorld` gepflegt
// und Geo-Erkennung live ist, wird hier das Country-Argument ausgewertet.

type ProductPriceFields = {
  price: number;
  priceDE?: number;
  priceUS?: number;
  priceWorld?: number;
};

export type Country = 'DE' | 'US' | 'WORLD';

export function displayPrice(data: ProductPriceFields, country: Country = 'DE'): number {
  if (country === 'US' && data.priceUS != null) return data.priceUS;
  if (country === 'WORLD' && data.priceWorld != null) return data.priceWorld;
  if (data.priceDE != null) return data.priceDE;
  return data.price;
}

export function formatPrice(value: number): string {
  return value.toFixed(2).replace('.', ',') + ' €';
}
