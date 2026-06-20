// E-Mail-Templates für den gesetzlichen Widerruf (Art. 11a VRRL / RL 2023/2673).
// Inline-Styles, weil E-Mail-Clients kein <style> / keine Fonts zuverlässig rendern.
// WICHTIG (rechtlich): Die Kundenmail bestätigt NUR den EINGANG des Widerrufs,
// nicht dessen Wirksamkeit. Daher überall neutrale Formulierung
// „Wir haben Ihren Widerruf erhalten." — nie „Wir bestätigen Ihren Widerruf".

export type WiderrufLang = 'de' | 'en';

export type WiderrufData = {
  name: string;        // bereits HTML-escaped
  orderNumber: string; // bereits HTML-escaped
  email: string;       // bereits HTML-escaped
  reason: string;      // bereits HTML-escaped (kann leer sein)
  receivedAt: string;  // lesbarer Zeitstempel, z. B. "20.06.2026, 14:32 Uhr (Europe/Berlin)"
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

function layout(bodyHtml: string, preheader: string, lang: WiderrufLang): string {
  const eyebrow = lang === 'en' ? 'Handmade hair jewelry' : 'Handgefertigter Haarschmuck';
  return `<!doctype html>
<html lang="${lang}">
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
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:${COLORS.paper};border:1px solid ${COLORS.hairline};">
        <tr>
          <td style="padding:28px 36px 20px;border-bottom:1px solid ${COLORS.hairline};text-align:center;">
            <div style="font-family:${FONT_SERIF};font-size:22px;color:${COLORS.ink};letter-spacing:-0.01em;">Kiehls Klunker</div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.22em;color:${COLORS.copper};margin-top:6px;">${eyebrow}</div>
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

// Datenzeile in einer Tabelle (Label / Wert)
function row(label: string, value: string): string {
  return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${COLORS.hairline};width:170px;font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.inkMute};vertical-align:top;">${label}</td>
        <td style="padding:10px 0;border-bottom:1px solid ${COLORS.hairline};font-size:14px;color:${COLORS.ink};">${value}</td>
      </tr>`;
}

// ——— Eingangsbestätigung an den Kunden (NEUTRAL) ————————————————
export function widerrufConfirmationEmail(data: WiderrufData, lang: WiderrufLang) {
  const tr = lang === 'en'
    ? {
        eyebrow: 'Withdrawal received',
        heading: 'We have received your withdrawal.',
        intro: 'Thank you. Your declaration of withdrawal reached us on',
        introTail: 'and has been logged. This message confirms the <strong>receipt</strong> of your declaration — we will inform you separately about its validity and the reversal of the contract.',
        nothing: 'There is nothing further you need to do for now.',
        yourDetails: 'Your details',
        labelName: 'Name',
        labelOrder: 'Order / contract no.',
        labelReceived: 'Received',
        labelReason: 'Reason',
        noReason: '— none given —',
        regards: 'Kind regards,',
      }
    : {
        eyebrow: 'Widerruf eingegangen',
        heading: 'Wir haben deinen Widerruf erhalten.',
        intro: 'Vielen Dank. Deine Widerrufserklärung ist am',
        introTail: 'bei uns eingegangen und wurde protokolliert. Diese E-Mail bestätigt den <strong>Eingang</strong> deiner Erklärung — über deren Wirksamkeit und die Rückabwicklung informieren wir dich gesondert.',
        nothing: 'Du musst vorerst nichts weiter tun.',
        yourDetails: 'Deine Angaben',
        labelName: 'Name',
        labelOrder: 'Bestell-/Vertragsnr.',
        labelReceived: 'Eingegangen',
        labelReason: 'Grund',
        noReason: '— kein Grund angegeben —',
        regards: 'Herzlich,',
      };

  const body = `
    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.22em;color:${COLORS.copper};margin:0 0 12px;">${tr.eyebrow}</p>
    <h1 style="font-family:${FONT_SERIF};font-weight:400;font-size:30px;line-height:1.2;color:${COLORS.ink};margin:0 0 20px;">${tr.heading}</h1>

    <p style="font-size:15px;line-height:1.7;color:${COLORS.inkSoft};margin:0 0 20px;">
      ${tr.intro} ${data.receivedAt} ${tr.introTail}
    </p>
    <p style="font-size:15px;line-height:1.7;color:${COLORS.inkSoft};margin:0 0 28px;">${tr.nothing}</p>

    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.inkMute};margin:0 0 10px;">${tr.yourDetails}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
      ${row(tr.labelName, data.name)}
      ${row(tr.labelOrder, data.orderNumber)}
      ${row(tr.labelReceived, data.receivedAt)}
      ${row(tr.labelReason, data.reason || tr.noReason)}
    </table>

    <p style="font-size:14px;line-height:1.7;color:${COLORS.inkSoft};margin:0;">
      ${tr.regards}<br>
      <span style="font-family:${FONT_SERIF};font-size:18px;color:${COLORS.ink};">Kathrin Kiehl</span>
    </p>
  `;

  const text = [
    tr.heading,
    '',
    `${tr.intro} ${data.receivedAt} ${stripTags(tr.introTail)}`,
    tr.nothing,
    '',
    `${tr.yourDetails}:`,
    `${tr.labelName}: ${data.name}`,
    `${tr.labelOrder}: ${data.orderNumber}`,
    `${tr.labelReceived}: ${data.receivedAt}`,
    `${tr.labelReason}: ${data.reason || tr.noReason}`,
    '',
    tr.regards,
    'Kathrin Kiehl',
  ].join('\n');

  return {
    html: layout(body, tr.heading, lang),
    text,
  };
}

// ——— Interne Benachrichtigung an Kathrin ————————————————————————
// Immer Deutsch (interner Posteingang).
export function widerrufNotificationEmail(data: WiderrufData, customerLang: WiderrufLang) {
  const body = `
    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.22em;color:${COLORS.copper};margin:0 0 12px;">Neuer Widerruf</p>
    <h1 style="font-family:${FONT_SERIF};font-weight:400;font-size:28px;line-height:1.2;color:${COLORS.ink};margin:0 0 8px;">Widerruf eingegangen</h1>
    <p style="font-size:13px;line-height:1.6;color:${COLORS.inkMute};margin:0 0 24px;">Bitte bearbeiten — gesetzlicher Widerruf nach §§ 355 ff. BGB / VRRL.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
      ${row('Eingegangen', data.receivedAt)}
      ${row('Name', data.name)}
      ${row('Bestell-/Vertragsnr.', data.orderNumber)}
      ${row('E-Mail', `<a href="mailto:${data.email}" style="color:${COLORS.ink};text-decoration:none;border-bottom:1px solid ${COLORS.hairline};">${data.email}</a>`)}
      ${row('Sprache', customerLang === 'en' ? 'Englisch' : 'Deutsch')}
    </table>

    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.inkMute};margin:0 0 10px;">Widerrufsgrund (optional)</p>
    <div style="background:${COLORS.bone};border-left:2px solid ${COLORS.copper};padding:18px 20px;font-size:15px;line-height:1.7;color:${COLORS.inkSoft};white-space:pre-wrap;word-break:break-word;">${data.reason || '— kein Grund angegeben —'}</div>

    <p style="margin:28px 0 0;font-size:12px;color:${COLORS.inkMute};line-height:1.6;">Für die Rückmeldung an die Kundin/den Kunden einfach direkt auf diese Mail antworten (Reply-to ist gesetzt). Der Eingang ist serverseitig protokolliert (data/widerrufe.jsonl).</p>
  `;

  const text = [
    'NEUER WIDERRUF',
    'Gesetzlicher Widerruf — bitte bearbeiten.',
    '',
    `Eingegangen:          ${data.receivedAt}`,
    `Name:                 ${data.name}`,
    `Bestell-/Vertragsnr.: ${data.orderNumber}`,
    `E-Mail:               ${data.email}`,
    `Sprache:              ${customerLang === 'en' ? 'Englisch' : 'Deutsch'}`,
    '',
    'Widerrufsgrund (optional):',
    data.reason || '— kein Grund angegeben —',
    '',
    '—',
    'Reply-to ist auf die Kundin/den Kunden gesetzt.',
  ].join('\n');

  return {
    html: layout(body, `Neuer Widerruf von ${data.name}`, 'de'),
    text,
  };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}
