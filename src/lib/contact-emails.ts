// E-Mail-Templates für das Kontaktformular.
// Inline-Styles, weil E-Mail-Clients kein <style> / keine Fonts zuverlässig rendern.
// Warme Palette, editorial — Markenstil auch in der Inbox.

type Safe = { name: string; email: string; subject: string; message: string };

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

function layout(bodyHtml: string, preheader: string): string {
  return `<!doctype html>
<html lang="de">
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

// Benachrichtigung an Kathrin — Struktur fokussiert auf schnelle Übersicht
export function notificationEmail(safe: Safe, rawMessage: string) {
  const body = `
    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.22em;color:${COLORS.copper};margin:0 0 12px;">Neue Nachricht</p>
    <h1 style="font-family:${FONT_SERIF};font-weight:400;font-size:28px;line-height:1.2;color:${COLORS.ink};margin:0 0 24px;">${safe.subject}</h1>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${COLORS.hairline};width:90px;font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.inkMute};vertical-align:top;">Von</td>
        <td style="padding:10px 0;border-bottom:1px solid ${COLORS.hairline};font-size:14px;color:${COLORS.ink};">${safe.name}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${COLORS.hairline};font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.inkMute};vertical-align:top;">E-Mail</td>
        <td style="padding:10px 0;border-bottom:1px solid ${COLORS.hairline};font-size:14px;color:${COLORS.ink};"><a href="mailto:${safe.email}" style="color:${COLORS.ink};text-decoration:none;border-bottom:1px solid ${COLORS.hairline};">${safe.email}</a></td>
      </tr>
    </table>

    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.inkMute};margin:0 0 10px;">Nachricht</p>
    <div style="background:${COLORS.bone};border-left:2px solid ${COLORS.copper};padding:18px 20px;font-size:15px;line-height:1.7;color:${COLORS.inkSoft};white-space:pre-wrap;word-break:break-word;">${safe.message}</div>

    <p style="margin:28px 0 0;font-size:12px;color:${COLORS.inkMute};line-height:1.6;">Antworte einfach direkt auf diese Mail — der Absender ist als Reply-to gesetzt.</p>
  `;

  const text = [
    'NEUE NACHRICHT',
    '',
    `Betreff: ${safe.subject}`,
    `Von:     ${safe.name}`,
    `E-Mail:  ${safe.email}`,
    '',
    'Nachricht:',
    rawMessage,
    '',
    '—',
    'Antworte direkt auf diese Mail.',
  ].join('\n');

  return {
    html: layout(body, `Neue Nachricht von ${safe.name}`),
    text,
  };
}

// Bestätigung an Kunde — warm, persönlich, kurz
export function confirmationEmail(safe: Safe, rawMessage: string) {
  const body = `
    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.22em;color:${COLORS.copper};margin:0 0 12px;">Eingegangen</p>
    <h1 style="font-family:${FONT_SERIF};font-weight:400;font-size:32px;line-height:1.2;color:${COLORS.ink};margin:0 0 20px;">Danke, ${safe.name}.</h1>

    <p style="font-size:15px;line-height:1.7;color:${COLORS.inkSoft};margin:0 0 20px;">
      Deine Nachricht ist angekommen. Ich melde mich in der Regel innerhalb von
      ein bis zwei Werktagen persönlich bei dir zurück.
    </p>

    <p style="font-size:14px;line-height:1.7;color:${COLORS.inkSoft};margin:0 0 28px;">
      Herzlich,<br>
      <span style="font-family:${FONT_SERIF};font-size:18px;color:${COLORS.ink};">Kathrin Kiehl</span>
    </p>

    <hr style="border:0;border-top:1px solid ${COLORS.hairline};margin:28px 0;">

    <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:${COLORS.inkMute};margin:0 0 10px;">Deine Nachricht</p>
    <div style="background:${COLORS.bone};padding:16px 18px;font-size:14px;line-height:1.7;color:${COLORS.inkSoft};white-space:pre-wrap;word-break:break-word;">${safe.message}</div>

    ${safe.subject ? `<p style="margin:18px 0 0;font-size:12px;color:${COLORS.inkMute};">Betreff: ${safe.subject}</p>` : ''}
  `;

  const text = [
    `Danke, ${safe.name}.`,
    '',
    'Deine Nachricht ist angekommen. Ich melde mich in der Regel innerhalb',
    'von ein bis zwei Werktagen persönlich bei dir zurück.',
    '',
    'Herzlich,',
    'Kathrin Kiehl',
    '',
    '—',
    'Deine Nachricht:',
    rawMessage,
    safe.subject ? `\nBetreff: ${safe.subject}` : '',
  ].join('\n');

  return {
    html: layout(body, 'Deine Nachricht an Kiehls Klunker ist angekommen.'),
    text,
  };
}
