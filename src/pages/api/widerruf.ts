import type { APIRoute } from 'astro';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { widerrufNotificationEmail, widerrufConfirmationEmail, type WiderrufLang } from '../../lib/widerruf-emails';

export const prerender = false;

// ——— Rate-Limit (in-memory) ———————————————————————————————————
const hits = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 Stunde
const RATE_LIMIT_MAX = 5; // etwas großzügiger als Kontakt — Widerruf darf nicht blockieren

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const prev = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (prev.length >= RATE_LIMIT_MAX) return false;
  prev.push(now);
  hits.set(ip, prev);
  return true;
}

// ——— Env-Zugriff (auch zur Laufzeit via process.env) ———————————
function env(key: string): string {
  return (import.meta.env as any)[key] || process.env[key] || '';
}

// ——— Turnstile Server-Verify ————————————————————————————————
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = env('TURNSTILE_SECRET_KEY');
  if (!secret) return true; // nicht konfiguriert → durchlassen (Dev-Modus)
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

// ——— Resend-Versand —————————————————————————————————————————
type MailPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};
async function sendMail(payload: MailPayload): Promise<void> {
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

// ——— Nachweis-Log (append-only JSONL) ——————————————————————————
// Gesetzlich gefordert: Eingang mit Datum/Uhrzeit + übermittelten Daten
// protokollieren. Es gibt keine DB → wir schreiben eine Zeile JSON pro Widerruf.
// Datei NICHT in Git (siehe .gitignore: data/) — enthält personenbezogene Daten.
async function logWiderruf(entry: Record<string, unknown>): Promise<void> {
  const dir = join(process.cwd(), 'data');
  const file = join(dir, 'widerrufe.jsonl');
  await mkdir(dir, { recursive: true });
  await appendFile(file, JSON.stringify(entry) + '\n', 'utf8');
}

// ——— Utils ——————————————————————————————————————————————————
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getClientIp(request: Request): string {
  const h = request.headers;
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip') || h.get('cf-connecting-ip') || 'unknown';
}

function formatBerlin(d: Date): string {
  const fmt = new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  });
  return `${fmt.format(d)} Uhr (Europe/Berlin)`;
}

// ——— Endpoint ———————————————————————————————————————————————
export const POST: APIRoute = async ({ request, url }) => {
  try {
    // 0) Origin-Check (CSRF). Hinter Mittwald-Proxy zeigt url.hostname auf localhost,
    // deshalb primär gegen PUBLIC_SITE_URL prüfen.
    const origin = request.headers.get('origin') || '';
    if (origin) {
      const publicSiteUrl = (process.env.PUBLIC_SITE_URL || (import.meta.env as any).PUBLIC_SITE_URL || '').replace(/\/$/, '');
      const publicHost = publicSiteUrl ? new URL(publicSiteUrl).hostname : '';
      const isAllowed = origin.includes('localhost')
        || origin.includes('127.0.0.1')
        || (publicHost && origin.includes(publicHost))
        || origin.includes(url.hostname);
      if (!isAllowed) {
        return json({ error: 'Ungültige Herkunft.' }, 403);
      }
    }

    const ip = getClientIp(request);

    // 1) Rate-Limit
    if (!checkRateLimit(ip)) {
      return json({ error: 'Zu viele Anfragen. Bitte versuchen Sie es in einer Stunde erneut.' }, 429);
    }

    const body = await request.json().catch(() => ({}));
    const {
      name = '',
      orderNumber = '',
      email = '',
      reason = '',
      website = '',   // Honeypot
      ts = 0,         // Zeit-Check
      turnstile = '',
      lang = 'de',
    } = body as Record<string, string | number>;

    // 2) Honeypot: Feld darf nicht ausgefüllt sein
    if (String(website).trim() !== '') {
      return json({ ok: true }, 200); // Bot — vortäuschen es hätte geklappt
    }

    // 3) Zeit-Check: Formular muss ≥ 3 Sek. offen gewesen sein
    const openDurationMs = Date.now() - Number(ts || 0);
    if (!ts || openDurationMs < 3000) {
      return json({ ok: true }, 200); // silent reject
    }

    // 4) Pflichtfeld-Validierung (Name, Bestellnr., E-Mail Pflicht; Grund optional)
    const n = String(name).trim();
    const o = String(orderNumber).trim();
    const e = String(email).trim();
    const r = String(reason).trim();
    if (!n || !o || !e) {
      return json({ error: 'Bitte füllen Sie Name, Bestell-/Vertragsnummer und E-Mail aus.' }, 400);
    }
    if (n.length > 100 || o.length > 100 || e.length > 150 || r.length > 2000) {
      return json({ error: 'Eingabe ist zu lang.' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) {
      return json({ error: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' }, 400);
    }
    // KEIN Content-/Spam-Filter auf den Freitext „Grund" — ein gesetzlicher
    // Widerruf darf nicht an URLs oder Sonderzeichen scheitern.

    // 5) Turnstile (falls konfiguriert)
    const captchaOk = await verifyTurnstile(String(turnstile), ip);
    if (!captchaOk) {
      return json({ error: 'Bot-Schutz fehlgeschlagen. Bitte Seite neu laden und erneut senden.' }, 400);
    }

    const customerLang: WiderrufLang = lang === 'en' ? 'en' : 'de';
    const now = new Date();
    const receivedAtIso = now.toISOString();
    const receivedAtHuman = formatBerlin(now);

    // 6) Nachweis protokollieren — VOR dem Mailversand, damit der Eingang auch
    // dann belegt ist, wenn der Mailversand scheitert. Schreibfehler bricht den
    // Vorgang NICHT ab (die interne Mail dient als zweiter Nachweis).
    try {
      await logWiderruf({
        receivedAt: receivedAtIso,
        receivedAtHuman,
        name: n,
        orderNumber: o,
        email: e,
        reason: r,
        lang: customerLang,
        ip,
      });
    } catch (logErr) {
      console.error('[widerruf] log write failed:', logErr);
    }

    // 7) E-Mails verschicken
    const fromName = env('CONTACT_FROM_NAME') || 'Kiehls Klunker';
    const fromNotif = env('CONTACT_FROM_NOTIFICATION');
    const fromConfirm = env('CONTACT_FROM_CONFIRMATION');
    const to = env('WIDERRUF_TO') || env('CONTACT_TO'); // eigenes Routing möglich, sonst Kontakt-Postfach
    const overrideTo = env('EMAIL_OVERRIDE_TO'); // Staging-Sicherheitsnetz
    if (!fromNotif || !fromConfirm || !to) {
      throw new Error('CONTACT_FROM_* / CONTACT_TO unvollständig');
    }

    const safe = {
      name: escapeHtml(n),
      orderNumber: escapeHtml(o),
      email: escapeHtml(e),
      reason: escapeHtml(r),
      receivedAt: receivedAtHuman,
    };

    // Interne Benachrichtigung an Kathrin (Reply-to = Kunde)
    const notif = widerrufNotificationEmail(safe, customerLang);
    await sendMail({
      from: `${fromName} Widerruf <${fromNotif}>`,
      to: overrideTo || to,
      subject: `Neuer Widerruf — ${safe.orderNumber} (${safe.name})`,
      html: notif.html,
      text: notif.text,
      replyTo: e,
    });

    // Neutrale Eingangsbestätigung an den Kunden
    const confirm = widerrufConfirmationEmail(safe, customerLang);
    await sendMail({
      from: `${fromName} <${fromConfirm}>`,
      to: overrideTo || e,
      subject: customerLang === 'en'
        ? 'We have received your withdrawal — Kiehls Klunker'
        : 'Wir haben deinen Widerruf erhalten — Kiehls Klunker',
      html: confirm.html,
      text: confirm.text,
    });

    return json({ ok: true }, 200);
  } catch (err) {
    console.error('[widerruf] error:', err);
    return json({ error: 'Uns ist ein Fehler unterlaufen. Bitte versuchen Sie es gleich noch einmal.' }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
