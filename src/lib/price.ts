// Anzeigepreis = priceDE; international wird über destination-basierte
// Versandkosten (siehe lib/shipping.ts) abgebildet.

type ProductPriceFields = {
  price: number;
  priceDE?: number;
  priceUS?: number;
  priceWorld?: number;
};

export function displayPrice(data: ProductPriceFields): number {
  if (data.priceDE != null) return data.priceDE;
  return data.price;
}

export function formatPrice(value: number): string {
  return value.toFixed(2).replace('.', ',') + ' €';
}
