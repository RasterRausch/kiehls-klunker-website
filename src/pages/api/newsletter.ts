import type { APIRoute } from 'astro';

export const prerender = false;

// Rate-Limit pro IP: 5 Anmeldungen pro Stunde, in-memory
const hits = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const prev = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (prev.length >= RATE_LIMIT_MAX) return false;
  prev.push(now);
  hits.set(ip, prev);
  return true;
}

function env(key: string): string {
  return (import.meta.env as any)[key] || process.env[key] || '';
}

function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    const lang = body?.lang === 'en' ? 'en' : 'de';
    const email = String(body?.email ?? '').trim().toLowerCase();

    // Honeypot — versteckt im Frontend, sollte leer sein
    if (typeof body?.website === 'string' && body.website.trim() !== '') {
      return json({ ok: true }, 200); // Bot bekommt erfolg-Antwort
    }

    if (!email || !EMAIL_RE.test(email) || email.length > 254) {
      return json({ error: lang === 'en' ? 'Please enter a valid email address.' : 'Bitte eine gültige E-Mail-Adresse eingeben.' }, 400);
    }

    const ip = clientIp(request);
    if (!checkRateLimit(ip)) {
      return json({ error: lang === 'en' ? 'Too many attempts. Please try again later.' : 'Zu viele Versuche. Bitte später nochmal.' }, 429);
    }

    const apiKey = env('RESEND_API_KEY');
    const to = env('EMAIL_OVERRIDE_TO') || env('CONTACT_TO') || 'info@kiehls-klunker.de';
    const fromName = env('CONTACT_FROM_NAME') || 'Kiehls Klunker';
    const fromAddress = env('CONTACT_FROM_NOTIFICATION') || 'formular@kiehls-klunker.de';
    if (!apiKey) {
      console.error('[newsletter] RESEND_API_KEY missing');
      return json({ error: lang === 'en' ? 'Server not configured.' : 'Server nicht konfiguriert.' }, 500);
    }

    const submittedAt = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
    const subject = 'Newsletter-Anmeldung';
    const text = `Newsletter-Anmeldung

E-Mail: ${email}
Sprache: ${lang === 'en' ? 'Englisch' : 'Deutsch'}
Eingegangen: ${submittedAt}

— Bis das Brevo-DOI-Template fertig ist, landen Anmeldungen direkt hier.
Du kannst die Adresse manuell in deine Brevo-Liste übernehmen, sobald
der Newsletter wirklich startet (dann gibt's automatisch DOI).`;

    const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1d17;line-height:1.55;font-size:15px;">
<p style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#1a1d17;">Newsletter-Anmeldung</p>
<p style="margin:0 0 8px;"><strong>E-Mail:</strong> <a href="mailto:${escapeHtml(email)}" style="color:#a05530;">${escapeHtml(email)}</a></p>
<p style="margin:0 0 8px;"><strong>Sprache:</strong> ${lang === 'en' ? 'Englisch' : 'Deutsch'}</p>
<p style="margin:0 0 24px;"><strong>Eingegangen:</strong> ${submittedAt}</p>
<p style="margin:0;color:#4f5247;font-size:13px;">Bis das Brevo-DOI-Template fertig ist, landen Anmeldungen direkt hier. Du kannst die Adresse manuell in deine Brevo-Liste übernehmen, sobald der Newsletter wirklich startet — dann gibt's automatisch DOI.</p>
</div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to,
        reply_to: email,
        subject,
        text,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[newsletter] Resend error:', res.status, detail);
      return json({ error: lang === 'en' ? 'Could not send. Please try again.' : 'Konnte nicht gesendet werden. Bitte später nochmal.' }, 502);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    console.error('[newsletter] error:', err);
    return json({ error: 'Unexpected error' }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}
