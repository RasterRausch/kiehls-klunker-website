import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import Stripe from 'stripe';
import { displayPrice } from '../../lib/price';
import {
  type ShippingTier,
  countriesForTier,
  shippingTotalEur,
} from '../../lib/shipping';
import { t, interpolate, type Lang } from '../../i18n';

export const prerender = false;

type CartItem = {
  id: string;
  quantity: number;
  variants?: Record<string, string>;
  personalization?: string;
};

function isShippingTier(v: unknown): v is ShippingTier {
  return v === 'DE' || v === 'EU' || v === 'US';
}

export const POST: APIRoute = async ({ request, url, locals }) => {
  try {
    const body = await request.json();
    const requestedLang = typeof body?.lang === 'string' && body.lang === 'en' ? 'en' : null;
    const lang: Lang = requestedLang ?? ((locals as { lang?: Lang })?.lang ?? 'de');
    const tier: ShippingTier = isShippingTier(body?.shippingTier) ? body.shippingTier : 'DE';
    const s = t(lang).checkout;

    // Globaler Schalter: Shop läuft im Testbetrieb → keine echten Bestellungen.
    const testMode = import.meta.env.PUBLIC_TEST_MODE === 'true' || process.env.PUBLIC_TEST_MODE === 'true';
    if (testMode) {
      return json({ error: s.errorTestMode }, 503);
    }

    const items: CartItem[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return json({ error: s.errorCartEmpty }, 400);
    }

    const stripeKey =
      import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return json({ error: s.errorNotConfigured }, 500);
    }
    const stripe = new Stripe(stripeKey);

    const products = await getCollection('products');
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Hinter einem Reverse-Proxy (Mittwald) sieht Node nur die interne URL
    // (localhost:3000). Für Stripe-Redirects & Bild-URLs brauchen wir die
    // öffentliche Domain — aus PUBLIC_SITE_URL, mit url.origin als Fallback.
    const publicSiteUrl = (process.env.PUBLIC_SITE_URL || (import.meta.env as any).PUBLIC_SITE_URL || '').replace(/\/$/, '');
    const origin = publicSiteUrl || url.origin;
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(origin);

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const raw of items) {
      const id = String(raw?.id ?? '').trim();
      const qty = Math.max(1, Math.floor(Number(raw?.quantity ?? 1)));
      const product = productMap.get(id);
      if (!product) {
        return json({ error: interpolate(s.errorUnknownProduct, { id }) }, 400);
      }
      const displayName = (lang === 'en' && product.data.nameEn) ? product.data.nameEn : product.data.name;
      if (!product.data.available) {
        return json({ error: interpolate(s.errorUnavailable, { name: displayName }) }, 400);
      }
      if (product.data.stock !== undefined && product.data.stock < qty) {
        return json(
          { error: interpolate(s.errorStock, { name: displayName, stock: product.data.stock }) },
          400,
        );
      }

      const imgSrc = product.data.images?.[0]?.src;
      const imageUrl = imgSrc && !isLocalhost
        ? new URL(imgSrc, origin).toString()
        : undefined;

      const rawVariants = (raw?.variants && typeof raw.variants === 'object') ? raw.variants : {};
      const validatedVariants: Record<string, string> = {};
      if (product.data.variants && product.data.variants.length > 0) {
        for (const group of product.data.variants) {
          const chosen = String(rawVariants[group.name] ?? '').trim();
          if (!chosen) {
            return json({ error: interpolate(s.errorVariantMissing, { name: displayName, group: group.name }) }, 400);
          }
          if (!group.values.includes(chosen)) {
            return json({ error: interpolate(s.errorVariantInvalid, { name: displayName, group: group.name }) }, 400);
          }
          validatedVariants[group.name] = chosen;
        }
      }

      const variantLabel = Object.keys(validatedVariants)
        .map((k) => `${k}: ${validatedVariants[k]}`)
        .join(' · ');
      const productName = variantLabel
        ? `${displayName} — ${variantLabel}`
        : displayName;

      const rawPersonalization =
        product.data.personalizable && typeof raw?.personalization === 'string'
          ? raw.personalization.trim().slice(0, 256)
          : '';

      const variantMetadata: Record<string, string> = {
        product_id: product.id,
        ...Object.fromEntries(
          Object.entries(validatedVariants).map(([k, v]) => [`var_${k}`.slice(0, 40), String(v).slice(0, 500)]),
        ),
        ...(rawPersonalization ? { personalization: rawPersonalization.slice(0, 500) } : {}),
      };

      lineItems.push({
        price_data: {
          currency: (product.data.currency || 'EUR').toLowerCase(),
          unit_amount: Math.round(displayPrice(product.data) * 100),
          product_data: {
            name: productName,
            ...(imageUrl ? { images: [imageUrl] } : {}),
            metadata: variantMetadata,
          },
        },
        quantity: qty,
      });

    }

    const shippingTotalCents = Math.round(shippingTotalEur(tier) * 100);

    const allowedCountries = countriesForTier(tier);
    const shippingDisplayNames: Record<ShippingTier, string> = {
      DE: s.shippingNameDE,
      EU: s.shippingNameEU,
      US: s.shippingNameUS,
    };
    const shippingDisplayName = shippingDisplayNames[tier];

    const langPrefix = lang === 'en' ? '/en' : '';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // payment_method_types weglassen → Stripe nimmt alle im Dashboard
      // aktivierten Methoden. Kathrin schaltet PayPal/Klarna/Apple Pay etc.
      // selbst frei, ohne dass wir den Code anfassen müssen.
      line_items: lineItems,
      locale: lang === 'en' ? 'en' : 'de',
      success_url: `${origin}${langPrefix}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${langPrefix}/checkout/cancel`,
      shipping_address_collection: { allowed_countries: [...allowedCountries] as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: shippingTotalCents, currency: 'eur' },
            display_name: shippingDisplayName,
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 2 },
              maximum: { unit: 'business_day', value: 9 },
            },
          },
        },
      ],
      invoice_creation: {
        enabled: true,
        invoice_data: {
          footer: lang === 'en'
            ? 'Small-business exemption under §19 UStG — no VAT is charged.'
            : 'Kein Ausweis der Umsatzsteuer gemäß §19 UStG.',
        },
      },
      automatic_tax: { enabled: false },
      allow_promotion_codes: true,
    });

    return json({ url: session.url }, 200);
  } catch (err) {
    console.error('[checkout] error:', err);
    const fallbackLang: Lang = 'de';
    const msg = err instanceof Error ? err.message : t(fallbackLang).checkout.errorGeneric;
    return json({ error: msg }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
