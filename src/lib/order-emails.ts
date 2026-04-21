// E-Mail-Templates für Bestellungen. Wiederverwendet die Farb/Typo-Palette aus
// contact-emails, damit die Inbox-Ansicht konsistent bleibt.

export type OrderLineItem = {
  productName: string;         // inkl. Varianten-Suffix, wie im Stripe Line Item
  quantity: number;
  unitAmountCents: number;     // in ct (EUR)
  personalization?: string;    // Wunschtext, falls vorhanden
  productId?: string;
};

export type OrderPayload = {
  orderId: string;                 // stripe session id
  customerName: string;
  customerEmail: string;
  shippingAddress?: {
    line1?: string;
    line2?: string;
    postalCode?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  items: OrderLineItem[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;                // 'eur'
  lang: 'de' | 'en';
  createdAt: Date;
};

const COLORS = {
  paper: '#fcfbf8',
  bone: '#f1eee5',
  boneDeep: '#e3ddd0',
  hairline: '#c8c2b1',
  ink: '#1a1d17',
  inkSoft: '#4f5247',
  inkMute: '#8f9181',
  copper: '#a05530',
  surfaceDark: '#0d1e2c',
};

const FONT_SERIF = "'Cormorant Garamond', 'Times New Roman', serif";
const FONT_SANS = "-apple-system, 'Segoe UI', 'Inter', Helvetica, Arial, sans-serif";

function fmtMoney(cents: number, currency: string, lang: 'de' | 'en'): string {
  const amount = (cents / 100).toFixed(2);
  if (lang === 'en') return '€' + amount;
  return amount.replace('.', ',') + ' €';
}

function layout(bodyHtml: string, preheader: string, htmlLang: string): string {
  return `<!doctype html>
<html lang="${htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kiehls Klunker</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bone};font-family:${FONT_SANS};color:${COLORS.ink};">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${preheader}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLORS.bone};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="max-width:620px;width:100%;background:${COLORS.paper};border:1px solid ${COLORS.hairline};">
        <tr>
          <td style="padding:28px 36px 20px;border-bottom:1px solid ${COLORS.hairline};text-align:center;">
            <div style="font-family:${FONT_SERIF};font-size:22px;color:${COLORS.ink};letter-spacing:-0.01em;">Kiehls Klunker</div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.22em;color:${COLORS.copper};margin-top:6px;">Handgefertigter Haarschmuck</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px 36px;">${bodyHtml}</td>
        </tr>
        <tr>
          <td style="padding:18px 36px;background:${COLORS.surfaceDark};text-align:center;color:${COLORS.paper};font-size:11px;letter-spacing:0.08em;">
            Kiehls Klunker · Kathrin Kiehl · Verwaltungsring 12, 04571 Rötha OT Espenhain
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAddress(a: OrderPayload['shippingAddress']): string {
  if (!a) return '';
  const parts = [a.line1, a.line2, [a.postalCode, a.city].filter(Boolean).join(' '), a.state, a.country].filter(Boolean);
  return parts.map(escapeHtml).join('<br>');
}

function formatAddressText(a: OrderPayload['shippingAddress']): string {
  if (!a) return '';
  return [a.line1, a.line2, [a.postalCode, a.city].filter(Boolean).join(' '), a.state, a.country].filter(Boolean).join('\n');
}

// ——— Bestell-Mail an Kathrin (DE, unabhängig von Kundensprache) ———
export function sellerOrderEmail(order: OrderPayload) {
  const lang = 'de';
  const itemsRows = order.items.map((item) => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid ${COLORS.hairline};vertical-align:top;">
        <div style="font-size:14px;color:${COLORS.ink};font-weight:500;line-height:1.4;">${escapeHtml(item.productName)}</div>
        ${item.personalization ? `<div style="margin-top:6px;padding:8px 10px;background:${COLORS.bone};border-left:2px solid ${COLORS.copper};font-size:12px;font-style:italic;color:${COLORS.inkSoft};white-space:pre-wrap;">${escapeHtml(item.personalization)}</div>` : ''}
      </td>
      <td style="padding:14px 8px 14px 16px;border-bottom:1px solid ${COLORS.hairline};font-size:13px;color:${COLORS.inkSoft};white-space:nowrap;text-align:right;vertical-align:top;">
        ${item.quantity} ×
      </td>
      <td style="padding:14px 0 14px 16px;border-bottom:1px solid ${COLORS.hairline};font-size:13px;color:${COLORS.ink};white-space:nowrap;text-align:right;vertical-align:top;">
        ${fmtMoney(item.unitAmountCents, order.currency, lang)}
      </td>
    </tr>
  `).join('');

  const body = `
    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.22em;color:${COLORS.copper};margin:0 0 12px;">Neue Bestellung</p>
    <h1 style="font-family:${FONT_SERIF};font-weight:400;font-size:28px;line-height:1.2;color:${COLORS.ink};margin:0 0 8px;">${escapeHtml(order.customerName || order.customerEmail)}</h1>
    <p style="font-size:12px;color:${COLORS.inkMute};margin:0 0 28px;">Bestell-Nr. ${escapeHtml(order.orderId)} · ${order.createdAt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
      ${itemsRows}
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
      <tr>
        <td style="padding:4px 0;font-size:12px;color:${COLORS.inkMute};">Zwischensumme</td>
        <td style="padding:4px 0;font-size:12px;color:${COLORS.inkMute};text-align:right;">${fmtMoney(order.subtotalCents, order.currency, lang)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:12px;color:${COLORS.inkMute};">Versand (DHL)</td>
        <td style="padding:4px 0;font-size:12px;color:${COLORS.inkMute};text-align:right;">${fmtMoney(order.shippingCents, order.currency, lang)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0 4px;border-top:1px solid ${COLORS.hairline};font-size:14px;color:${COLORS.ink};font-weight:500;">Gesamt</td>
        <td style="padding:10px 0 4px;border-top:1px solid ${COLORS.hairline};font-size:14px;color:${COLORS.ink};font-weight:500;text-align:right;">${fmtMoney(order.totalCents, order.currency, lang)}</td>
      </tr>
    </table>

    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.inkMute};margin:0 0 8px;">Lieferanschrift</p>
    <div style="background:${COLORS.bone};padding:14px 18px;font-size:14px;line-height:1.6;color:${COLORS.ink};margin:0 0 24px;">
      ${escapeHtml(order.customerName || '')}<br>
      ${formatAddress(order.shippingAddress) || '<em style="color:' + COLORS.inkMute + ';">Keine Lieferadresse hinterlegt</em>'}
    </div>

    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.inkMute};margin:0 0 8px;">Kunde</p>
    <p style="font-size:14px;line-height:1.6;color:${COLORS.ink};margin:0 0 28px;">
      <a href="mailto:${escapeHtml(order.customerEmail)}" style="color:${COLORS.ink};border-bottom:1px solid ${COLORS.hairline};text-decoration:none;">${escapeHtml(order.customerEmail)}</a>
    </p>

    <p style="margin:0;font-size:12px;color:${COLORS.inkMute};line-height:1.6;">Kein Ausweis der Umsatzsteuer gemäß §19 UStG.</p>
  `;

  const itemsText = order.items.map((item) => {
    const p = item.personalization ? `\n    Wunsch: ${item.personalization}` : '';
    return `  • ${item.productName}${p}\n    ${item.quantity} × ${fmtMoney(item.unitAmountCents, order.currency, lang)}`;
  }).join('\n');

  const text = [
    'NEUE BESTELLUNG',
    '',
    `Bestell-Nr.: ${order.orderId}`,
    `Datum:       ${order.createdAt.toLocaleDateString('de-DE')}`,
    `Kunde:       ${order.customerName || '—'} <${order.customerEmail}>`,
    '',
    'Artikel:',
    itemsText,
    '',
    `Zwischensumme: ${fmtMoney(order.subtotalCents, order.currency, lang)}`,
    `Versand:       ${fmtMoney(order.shippingCents, order.currency, lang)}`,
    `Gesamt:        ${fmtMoney(order.totalCents, order.currency, lang)}`,
    '',
    'Lieferanschrift:',
    order.customerName || '',
    formatAddressText(order.shippingAddress) || '—',
    '',
    '—',
    'Kein Ausweis der Umsatzsteuer gemäß §19 UStG.',
  ].join('\n');

  return {
    html: layout(body, `Neue Bestellung von ${order.customerName || order.customerEmail}`, 'de'),
    text,
  };
}

// ——— Bestätigung an Kunde (DE oder EN) ———
export function buyerOrderEmail(order: OrderPayload) {
  const en = order.lang === 'en';

  const copy = en ? {
    eyebrow: 'Order received',
    greeting: `Thank you, ${order.customerName || ''}.`,
    body1: 'Your order has arrived. Kathrin will prepare it carefully in her studio — you\'ll receive a shipping confirmation as soon as it\'s on its way.',
    body2: 'Shipping by DHL, typically 2–9 business days.',
    signature: 'Warmly,\nKathrin Kiehl',
    itemsLabel: 'Your order',
    orderNumber: 'Order no.',
    subtotal: 'Subtotal',
    shipping: 'Shipping (DHL)',
    total: 'Total',
    shippingToLabel: 'Shipping to',
    wishPrefix: 'Request:',
    vatNote: 'Small-business exemption under §19 UStG — no VAT is charged.',
    preheader: `Your order ${order.orderId} — thank you!`,
  } : {
    eyebrow: 'Bestellung eingegangen',
    greeting: `Danke, ${order.customerName || ''}.`,
    body1: 'Deine Bestellung ist angekommen. Kathrin bereitet sie sorgfältig in ihrer Werkstatt vor — du bekommst eine Versandbestätigung, sobald dein Klunker unterwegs ist.',
    body2: 'Versand per DHL, in der Regel 2–9 Werktage.',
    signature: 'Herzlich,\nKathrin Kiehl',
    itemsLabel: 'Deine Bestellung',
    orderNumber: 'Bestell-Nr.',
    subtotal: 'Zwischensumme',
    shipping: 'Versand (DHL)',
    total: 'Gesamt',
    shippingToLabel: 'Lieferadresse',
    wishPrefix: 'Wunsch:',
    vatNote: 'Kein Ausweis der Umsatzsteuer gemäß §19 UStG.',
    preheader: `Deine Bestellung ${order.orderId} — danke!`,
  };

  const itemsRows = order.items.map((item) => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid ${COLORS.hairline};vertical-align:top;">
        <div style="font-size:14px;color:${COLORS.ink};font-weight:500;line-height:1.4;">${escapeHtml(item.productName)}</div>
        ${item.personalization ? `<div style="margin-top:4px;font-size:12px;font-style:italic;color:${COLORS.inkSoft};">${copy.wishPrefix} ${escapeHtml(item.personalization)}</div>` : ''}
      </td>
      <td style="padding:14px 8px 14px 16px;border-bottom:1px solid ${COLORS.hairline};font-size:13px;color:${COLORS.inkSoft};white-space:nowrap;text-align:right;vertical-align:top;">
        ${item.quantity} ×
      </td>
      <td style="padding:14px 0 14px 16px;border-bottom:1px solid ${COLORS.hairline};font-size:13px;color:${COLORS.ink};white-space:nowrap;text-align:right;vertical-align:top;">
        ${fmtMoney(item.unitAmountCents, order.currency, order.lang)}
      </td>
    </tr>
  `).join('');

  const body = `
    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.22em;color:${COLORS.copper};margin:0 0 12px;">${copy.eyebrow}</p>
    <h1 style="font-family:${FONT_SERIF};font-weight:400;font-size:32px;line-height:1.2;color:${COLORS.ink};margin:0 0 20px;">${escapeHtml(copy.greeting)}</h1>

    <p style="font-size:15px;line-height:1.7;color:${COLORS.inkSoft};margin:0 0 12px;">${copy.body1}</p>
    <p style="font-size:14px;line-height:1.7;color:${COLORS.inkSoft};margin:0 0 28px;">${copy.body2}</p>

    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.inkMute};margin:0 0 4px;">${copy.itemsLabel}</p>
    <p style="font-size:11px;color:${COLORS.inkMute};margin:0 0 12px;">${copy.orderNumber} ${escapeHtml(order.orderId)}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
      ${itemsRows}
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
      <tr>
        <td style="padding:4px 0;font-size:12px;color:${COLORS.inkMute};">${copy.subtotal}</td>
        <td style="padding:4px 0;font-size:12px;color:${COLORS.inkMute};text-align:right;">${fmtMoney(order.subtotalCents, order.currency, order.lang)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:12px;color:${COLORS.inkMute};">${copy.shipping}</td>
        <td style="padding:4px 0;font-size:12px;color:${COLORS.inkMute};text-align:right;">${fmtMoney(order.shippingCents, order.currency, order.lang)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0 4px;border-top:1px solid ${COLORS.hairline};font-size:14px;color:${COLORS.ink};font-weight:500;">${copy.total}</td>
        <td style="padding:10px 0 4px;border-top:1px solid ${COLORS.hairline};font-size:14px;color:${COLORS.ink};font-weight:500;text-align:right;">${fmtMoney(order.totalCents, order.currency, order.lang)}</td>
      </tr>
    </table>

    ${order.shippingAddress ? `
    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.inkMute};margin:0 0 8px;">${copy.shippingToLabel}</p>
    <div style="background:${COLORS.bone};padding:14px 18px;font-size:14px;line-height:1.6;color:${COLORS.ink};margin:0 0 28px;">
      ${escapeHtml(order.customerName || '')}<br>
      ${formatAddress(order.shippingAddress)}
    </div>
    ` : ''}

    <p style="font-size:14px;line-height:1.7;color:${COLORS.inkSoft};margin:0 0 8px;white-space:pre-line;">${escapeHtml(copy.signature.split('\n')[0])}</p>
    <p style="font-family:${FONT_SERIF};font-size:18px;color:${COLORS.ink};margin:0 0 28px;">${escapeHtml(copy.signature.split('\n')[1])}</p>

    <p style="margin:0;font-size:11px;color:${COLORS.inkMute};line-height:1.6;">${copy.vatNote}</p>
  `;

  const itemsText = order.items.map((item) => {
    const p = item.personalization ? `\n    ${copy.wishPrefix} ${item.personalization}` : '';
    return `  • ${item.productName}${p}\n    ${item.quantity} × ${fmtMoney(item.unitAmountCents, order.currency, order.lang)}`;
  }).join('\n');

  const text = [
    copy.greeting,
    '',
    copy.body1,
    copy.body2,
    '',
    `${copy.orderNumber}: ${order.orderId}`,
    '',
    `${copy.itemsLabel}:`,
    itemsText,
    '',
    `${copy.subtotal}: ${fmtMoney(order.subtotalCents, order.currency, order.lang)}`,
    `${copy.shipping}: ${fmtMoney(order.shippingCents, order.currency, order.lang)}`,
    `${copy.total}: ${fmtMoney(order.totalCents, order.currency, order.lang)}`,
    '',
    copy.signature,
    '',
    '—',
    copy.vatNote,
  ].join('\n');

  return {
    html: layout(body, copy.preheader, en ? 'en' : 'de'),
    text,
  };
}
