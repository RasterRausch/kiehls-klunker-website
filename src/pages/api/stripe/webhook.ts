import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { sellerOrderEmail, buyerOrderEmail, type OrderPayload, type OrderLineItem } from '../../../lib/order-emails';

export const prerender = false;

// Stripe-Webhook-Handler.
//
// Einrichtung:
//   1. Stripe-Dashboard → Developers → Webhooks → "Add endpoint"
//   2. URL: https://kiehls-klunker.de/api/stripe/webhook
//   3. Events: checkout.session.completed (reicht für uns)
//   4. Signing-Secret kopieren → .env: STRIPE_WEBHOOK_SECRET=whsec_...
//
// Lokales Testen:
//   stripe login
//   stripe listen --forward-to localhost:4321/api/stripe/webhook
//   stripe trigger checkout.session.completed

function env(key: string): string {
  return (import.meta.env as any)[key] || process.env[key] || '';
}

// In-memory Dedupe: Stripe liefert Events bei Netzwerkproblemen mehrfach.
// Bei Neustart des Prozesses vergessen wir die IDs — das ist okay, weil
// Stripe auch nach Success-Response in seltenen Fällen retryen kann; ein
// einmaliger Doppel-Versand bei Server-Restart ist tragbar.
//
// claimEvent ist atomar (kein await zwischen has und add), verhindert also
// Race-Condition bei zwei parallelen Requests für dasselbe Event.
const processedEvents = new Set<string>();
const MAX_REMEMBERED = 500;
function claimEvent(eventId: string): boolean {
  if (processedEvents.has(eventId)) return false;
  processedEvents.add(eventId);
  if (processedEvents.size > MAX_REMEMBERED) {
    const first = processedEvents.values().next().value;
    if (first && first !== eventId) processedEvents.delete(first);
  }
  return true;
}
function releaseEvent(eventId: string) {
  processedEvents.delete(eventId);
}

async function sendMail(payload: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<void> {
  const key = env('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY fehlt');
  const body: Record<string, unknown> = {
    from: payload.from,
    to: [payload.to],
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  };
  if (payload.replyTo) body.reply_to = payload.replyTo;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${errText}`);
  }
}

export const POST: APIRoute = async ({ request }) => {
  const stripeKey = env('STRIPE_SECRET_KEY');
  const webhookSecret = env('STRIPE_WEBHOOK_SECRET');
  if (!stripeKey || !webhookSecret) {
    console.error('[stripe-webhook] Secrets fehlen');
    return new Response('Server misconfigured', { status: 500 });
  }
  const stripe = new Stripe(stripeKey);

  // Wichtig: Raw-Body für die Signatur-Verifikation. Astro liefert uns den
  // Body über request.text() im Originalzustand.
  const sig = request.headers.get('stripe-signature') || '';
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signatur ungültig:', err instanceof Error ? err.message : err);
    return new Response('Invalid signature', { status: 400 });
  }

  // Atomar reservieren — vor jedem await — damit zwei parallele Requests
  // für dasselbe Event nicht beide handlePaidSession ausführen.
  if (!claimEvent(event.id)) {
    return new Response('OK (duplicate)', { status: 200 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // Nur bei bezahltem Status verschicken (bei bezahlten Checkout-Sessions
        // ist `payment_status === 'paid'`; bei SEPA/Klarna kann es auch
        // 'unpaid' mit async Zahlungsabschluss sein — dann fällt es durch und
        // wir warten auf `checkout.session.async_payment_succeeded`).
        if (session.payment_status === 'paid') {
          await handlePaidSession(stripe, session);
        }
        break;
      }
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handlePaidSession(stripe, session);
        break;
      }
      default:
        // Andere Events ignorieren wir bewusst
        break;
    }
    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('[stripe-webhook] Verarbeitung fehlgeschlagen:', err);
    // Reservierung zurückgeben, damit Stripe-Retry erneut greifen kann
    releaseEvent(event.id);
    // 500 zurückgeben, damit Stripe retryt
    return new Response('Handler error', { status: 500 });
  }
};

async function handlePaidSession(stripe: Stripe, session: Stripe.Checkout.Session) {
  // Line-Items + Produkt-Metadata nachladen
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
    expand: ['data.price.product'],
  });

  const items: OrderLineItem[] = lineItems.data.map((li) => {
    const product = li.price?.product && typeof li.price.product === 'object' && !('deleted' in li.price.product)
      ? (li.price.product as Stripe.Product)
      : null;
    const metadata = product?.metadata ?? {};
    return {
      productName: li.description || product?.name || 'Produkt',
      quantity: li.quantity ?? 1,
      unitAmountCents: li.price?.unit_amount ?? 0,
      personalization: metadata.personalization || undefined,
      productId: metadata.product_id || undefined,
    };
  });

  const subtotalCents = items.reduce((sum, i) => sum + i.unitAmountCents * i.quantity, 0);
  const shippingCents = session.shipping_cost?.amount_total ?? 0;
  const totalCents = session.amount_total ?? subtotalCents + shippingCents;

  const shippingAddr = session.collected_information?.shipping_details?.address
    || session.customer_details?.address
    || null;

  const customerName = session.collected_information?.shipping_details?.name
    || session.customer_details?.name
    || '';

  // Sprache: wir haben im Checkout locale auf 'de'/'en' gesetzt — Stripe legt
  // das in der Session als locale ab, und zusätzlich landen Success/Cancel-URLs
  // mit /en-Prefix. Beides ist ein belastbares Signal.
  const lang: 'de' | 'en' = (() => {
    if (session.locale === 'en') return 'en';
    if (session.success_url?.includes('/en/checkout/')) return 'en';
    return 'de';
  })();

  const order: OrderPayload = {
    orderId: session.id,
    customerName,
    customerEmail: session.customer_details?.email || '',
    shippingAddress: shippingAddr ? {
      line1: shippingAddr.line1 || undefined,
      line2: shippingAddr.line2 || undefined,
      postalCode: shippingAddr.postal_code || undefined,
      city: shippingAddr.city || undefined,
      state: shippingAddr.state || undefined,
      country: shippingAddr.country || undefined,
    } : undefined,
    items,
    subtotalCents,
    shippingCents,
    totalCents,
    currency: (session.currency || 'eur').toLowerCase(),
    lang,
    createdAt: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000),
  };

  const fromName = env('CONTACT_FROM_NAME') || 'Kiehls Klunker';
  const fromNotify = env('CONTACT_FROM_NOTIFICATION');
  const fromConfirm = env('CONTACT_FROM_CONFIRMATION');
  const sellerTo = env('CONTACT_TO');
  // Staging-Sicherheitsnetz: wenn gesetzt, gehen alle Mails an diese Adresse.
  const overrideTo = env('EMAIL_OVERRIDE_TO');

  // 1) Bestell-Mail an Katrin (immer DE)
  if (fromNotify && sellerTo) {
    const { html, text } = sellerOrderEmail(order);
    try {
      await sendMail({
        from: `${fromName} <${fromNotify}>`,
        to: overrideTo || sellerTo,
        subject: `Bestellung: ${order.customerName || order.customerEmail} · ${(totalCents / 100).toFixed(2).replace('.', ',')} €`,
        html,
        text,
        replyTo: order.customerEmail || undefined,
      });
    } catch (err) {
      console.error('[stripe-webhook] Seller-Mail fehlgeschlagen:', err);
      // Wir geben trotzdem 200 zurück, weil Stripe sonst retryen würde und
      // wir auch Kunden-Mail noch probieren wollen. Resend-Fehler loggen wir.
    }
  } else {
    console.warn('[stripe-webhook] Seller-Mail übersprungen (CONTACT_TO/FROM_NOTIFICATION fehlen)');
  }

  // 2) Bestätigung an Kunde (DE oder EN)
  if (fromConfirm && order.customerEmail) {
    const { html, text } = buyerOrderEmail(order);
    const subject = order.lang === 'en'
      ? `Your Kiehls Klunker order · ${order.orderId.slice(-8)}`
      : `Deine Kiehls Klunker Bestellung · ${order.orderId.slice(-8)}`;
    try {
      await sendMail({
        from: `${fromName} <${fromConfirm}>`,
        to: overrideTo || order.customerEmail,
        subject,
        html,
        text,
      });
    } catch (err) {
      console.error('[stripe-webhook] Buyer-Mail fehlgeschlagen:', err);
    }
  } else {
    console.warn('[stripe-webhook] Buyer-Mail übersprungen (FROM_CONFIRMATION oder Email fehlen)');
  }
}
