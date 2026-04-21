import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import Stripe from 'stripe';

export const prerender = false;

type CartItem = {
  id: string;
  quantity: number;
  variants?: Record<string, string>;
};

const ALLOWED_COUNTRIES = [
  'DE', 'AT', 'CH', 'NL', 'BE', 'LU', 'FR', 'IT', 'ES',
  'DK', 'SE', 'FI', 'IE', 'PT', 'PL', 'CZ', 'SK', 'SI', 'HU',
] as const;

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const body = await request.json();
    const items: CartItem[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return json({ error: 'Warenkorb ist leer.' }, 400);
    }

    const stripeKey =
      import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return json({ error: 'Stripe ist noch nicht konfiguriert.' }, 500);
    }
    const stripe = new Stripe(stripeKey);

    const products = await getCollection('products');
    const productMap = new Map(products.map((p) => [p.id, p]));

    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    for (const raw of items) {
      const id = String(raw?.id ?? '').trim();
      const qty = Math.max(1, Math.floor(Number(raw?.quantity ?? 1)));
      const product = productMap.get(id);
      if (!product) {
        return json({ error: `Unbekanntes Produkt: ${id}` }, 400);
      }
      if (!product.data.available) {
        return json({ error: `${product.data.name} ist nicht mehr verfügbar.` }, 400);
      }
      if (product.data.stock !== undefined && product.data.stock < qty) {
        return json(
          { error: `${product.data.name}: nur noch ${product.data.stock} auf Lager.` },
          400,
        );
      }

      const imgSrc = product.data.images?.[0]?.src;
      const imageUrl = imgSrc && !isLocalhost
        ? new URL(imgSrc, url.origin).toString()
        : undefined;

      // Varianten validieren & als String aufbereiten
      const rawVariants = (raw?.variants && typeof raw.variants === 'object') ? raw.variants : {};
      const validatedVariants: Record<string, string> = {};
      if (product.data.variants && product.data.variants.length > 0) {
        for (const group of product.data.variants) {
          const chosen = String(rawVariants[group.name] ?? '').trim();
          if (!chosen) {
            return json({ error: `${product.data.name}: Bitte ${group.name} wählen.` }, 400);
          }
          if (!group.values.includes(chosen)) {
            return json({ error: `${product.data.name}: Ungültige Auswahl bei ${group.name}.` }, 400);
          }
          validatedVariants[group.name] = chosen;
        }
      }

      const variantLabel = Object.keys(validatedVariants)
        .map((k) => `${k}: ${validatedVariants[k]}`)
        .join(' · ');
      const productName = variantLabel
        ? `${product.data.name} — ${variantLabel}`
        : product.data.name;

      const variantMetadata: Record<string, string> = {
        product_id: product.id,
        ...Object.fromEntries(
          Object.entries(validatedVariants).map(([k, v]) => [`var_${k}`.slice(0, 40), String(v).slice(0, 500)]),
        ),
      };

      lineItems.push({
        price_data: {
          currency: (product.data.currency || 'EUR').toLowerCase(),
          unit_amount: Math.round(product.data.price * 100),
          product_data: {
            name: productName,
            ...(imageUrl ? { images: [imageUrl] } : {}),
            metadata: variantMetadata,
          },
        },
        quantity: qty,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      locale: 'de',
      success_url: `${url.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${url.origin}/checkout/cancel`,
      shipping_address_collection: { allowed_countries: [...ALLOWED_COUNTRIES] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 490, currency: 'eur' },
            display_name: 'Versand DHL',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 7 },
              maximum: { unit: 'business_day', value: 9 },
            },
          },
        },
      ],
      invoice_creation: { enabled: true },
      automatic_tax: { enabled: false },
      allow_promotion_codes: true,
    });

    return json({ url: session.url }, 200);
  } catch (err) {
    console.error('[checkout] error:', err);
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return json({ error: msg }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
