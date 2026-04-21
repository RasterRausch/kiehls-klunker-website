import type { APIRoute } from 'astro';

export const prerender = false;

// ——— Rate-Limit (in-memory) ———————————————————————————————————
// Pro Prozess: Map IP → Timestamps der letzten Requests
const hits = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 Stunde
const RATE_LIMIT_MAX = 3;

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

// ——— Content-Filter — blockt typische Spam-Patterns ——————————
function looksLikeSpam(name: string, email: string, subject: string, message: string): string | null {
  const text = `${name}\n${subject}\n${message}`;
  // 1) URLs / Links (häufigster Spam-Vector)
  if (/(https?:\/\/|www\.)[^\s]{3,}/i.test(text)) return 'URLs im Text';
  // 2) BBCode / HTML-Markup-Versuche
  if (/\[url=|<a\s+href=|\[link=/i.test(text)) return 'Markup im Text';
  // 3) Cyrillische / CJK Zeichen (98 % unserer Kunden schreiben lateinisch)
  if (/[\u0400-\u04FF\u4E00-\u9FFF]/.test(text)) return 'Nicht-lateinische Zeichen';
  // 4) Keyword-Blacklist (bekannte SEO/Crypto/Pharma-Spams)
  const blacklist = [
    'seo', 'backlink', 'rank #1', 'crypto', 'bitcoin', 'nft', 'viagra', 'cialis',
    'casino', 'escort', 'onlyfans', 'investment opportunity', 'loan offer',
    'weight loss', 'cbd oil', 'adult content',
  ];
  const lower = text.toLowerCase();
  for (const kw of blacklist) {
    if (lower.includes(kw)) return `Blacklist-Wort: ${kw}`;
  }
  // 5) Massives Emoji- / Sonderzeichen-Aufkommen
  const specials = (text.match(/[^\w\säöüÄÖÜß.,!?\-–—:;/()'"@&%+]/g) || []).length;
  if (specials > 20) return 'Zu viele Sonderzeichen';
  // 6) Name enthält Zahlen (oft "John123" oder Spam-IDs)
  if (/^[a-z]+\d{3,}/i.test(name.trim())) return 'Verdächtiger Name';
  return null;
}

// ——— Turnstile Server-Verify ————————————————————————————————
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = env('TURNSTILE_SECRET_KEY');
  if (!secret) return true; // Turnstile nicht konfiguriert → durchlassen (Dev-Modus)
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body },
    );
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

// ——— Templates ——————————————————————————————————————————————
import { notificationEmail, confirmationEmail } from '../../lib/contact-emails';

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

// ——— Endpoint ———————————————————————————————————————————————
export const POST: APIRoute = async ({ request, url }) => {
  try {
    // 0) Origin-Check (nur unsere Domain darf posten)
    const origin = request.headers.get('origin') || '';
    if (origin && !origin.includes(url.hostname) && !origin.includes('localhost')) {
      return json({ error: 'Ungültige Herkunft.' }, 403);
    }

    const ip = getClientIp(request);

    // 1) Rate-Limit
    if (!checkRateLimit(ip)) {
      return json({ error: 'Zu viele Anfragen. Bitte versuche es in einer Stunde erneut.' }, 429);
    }

    const body = await request.json().catch(() => ({}));
    const {
      name = '',
      email = '',
      subject = '',
      message = '',
      website = '',     // Honeypot
      ts = 0,           // Timestamp-Check
      turnstile = '',
    } = body as Record<string, string | number>;

    // 2) Honeypot: Feld darf nicht ausgefüllt sein
    if (String(website).trim() !== '') {
      // Bot erkannt — vortäuschen es hätte geklappt, nicht verraten
      return json({ ok: true }, 200);
    }

    // 3) Zeit-Check: Formular muss ≥ 3 Sek. offen gewesen sein
    const openDurationMs = Date.now() - Number(ts || 0);
    if (!ts || openDurationMs < 3000) {
      return json({ ok: true }, 200); // silent reject
    }

    // 4) Pflichtfeld-Validierung
    const n = String(name).trim();
    const e = String(email).trim();
    const s = String(subject).trim();
    const m = String(message).trim();
    if (!n || !e || !m) {
      return json({ error: 'Bitte fülle Name, E-Mail und Nachricht aus.' }, 400);
    }
    if (n.length > 100 || s.length > 200 || m.length > 5000) {
      return json({ error: 'Eingabe ist zu lang.' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) {
      return json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, 400);
    }

    // 5) Content-Filter
    const spamReason = looksLikeSpam(n, e, s, m);
    if (spamReason) {
      console.log(`[contact] blocked (${spamReason}) from ${ip}`);
      return json({ ok: true }, 200); // silent reject
    }

    // 6) Turnstile (falls konfiguriert)
    const captchaOk = await verifyTurnstile(String(turnstile), ip);
    if (!captchaOk) {
      return json({ error: 'Bot-Schutz fehlgeschlagen. Bitte Seite neu laden und erneut senden.' }, 400);
    }

    // 7) E-Mails verschicken
    const fromName = env('CONTACT_FROM_NAME') || 'Kiehls Klunker';
    const fromNotif = env('CONTACT_FROM_NOTIFICATION');
    const fromConfirm = env('CONTACT_FROM_CONFIRMATION');
    const to = env('CONTACT_TO');
    // Staging-Sicherheitsnetz: wenn gesetzt, gehen alle Mails an diese Adresse.
    const overrideTo = env('EMAIL_OVERRIDE_TO');
    if (!fromNotif || !fromConfirm || !to) {
      throw new Error('CONTACT_FROM_* / CONTACT_TO unvollständig');
    }

    const safe = {
      name: escapeHtml(n),
      email: escapeHtml(e),
      subject: escapeHtml(s || 'Nachricht über das Kontaktformular'),
      message: escapeHtml(m),
    };

    // Notification an Kathrin
    const notif = notificationEmail(safe, m);
    await sendMail({
      from: `${fromName} Formular <${fromNotif}>`,
      to: overrideTo || to,
      subject: `Neue Nachricht: ${safe.subject}`,
      html: notif.html,
      text: notif.text,
      replyTo: e,
    });

    // Bestätigung an Kunde
    const confirm = confirmationEmail(safe, m);
    await sendMail({
      from: `${fromName} <${fromConfirm}>`,
      to: overrideTo || e,
      subject: 'Deine Nachricht ist angekommen — Kiehls Klunker',
      html: confirm.html,
      text: confirm.text,
    });

    return json({ ok: true }, 200);
  } catch (err) {
    console.error('[contact] error:', err);
    return json({ error: 'Uns ist ein Fehler unterlaufen. Bitte versuche es gleich noch einmal.' }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
