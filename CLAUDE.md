# Kiehls Klunker Website — Notes for Claude

## Context

- **Shop:** Handgefertigter Titan-/Messingschmuck (Haarforken, Haarstäbe, Ohrringe). Macherin: **Kathrin Kiehl** (Inhaberin, Kleinunternehmerin nach §19 UStG).
- **Hosting/Dev:** **Alex / raster-rausch.de** betreibt Agentur-Server (Mittwald mStudio), hostet für Kathrin im Unterauftrag. Trennung: Kathrin = Verantwortlicher/Data Controller, Alex = Auftragsverarbeiter (AVV).
- **Prod-Domain:** `kiehls-klunker.de` (noch nicht umgelegt)
- **Staging:** `https://p-bn7b5m.project.space/` — hier läuft gerade alles

## Stack & Quirks

- **Astro 6 SSR** mit `@astrojs/node` (`output: 'server'`, standalone).
- **Alle Seiten sind SSR**, keine `export const prerender = true`. Grund: Die i18n-Middleware muss überall laufen. Wenn du eine neue Seite anlegst, setze *nicht* prerender.
- **Svelte** für interaktive Komponenten (Cart, Filter).
- **Tailwind v4** via `@tailwindcss/vite`, Tokens in `src/styles/global.css` (`@theme` block). Fonts: Serif = Instrument Serif/Cormorant (Headlines), Sans = DM Sans (Body).
- **Content Collections** unter `src/content/products/*.md` mit Zod-Schema in `src/content.config.ts`.
- **Env-Loading in `astro.config.mjs`** via Vite `loadEnv` — Astro lädt `.env` *nicht* automatisch in die Config, deshalb explizit.
- **Hinter Reverse-Proxy** (Mittwald): `url.origin` zeigt `localhost:3000`. Für Public-URLs (Stripe Redirects, Bild-URLs) immer `PUBLIC_SITE_URL` aus env nehmen. Siehe `src/pages/api/checkout.ts`.

## Deploy Flow (Staging)

Der in `/etc/mittnite.d/node.hcl` konfigurierte Job `node` wird per `mittnitectl` neu gestartet — das ist Mittwalds offizielle Empfehlung (bestätigt vom Support). `mittnitectl job restart node` macht den ganzen Zyklus (`npm start` = `astro build && node dist/server/entry.mjs`) und respawnt den Prozess sauber.

**Was nicht funktioniert und warum:** Direkt den `node dist/server/entry.mjs`-Prozess killen — dann wartet der noch lebende `npm start`-Elterprozess auf sein Child, mittnite sieht den Job noch als „laufend" und startet nichts neu. Tot ist tot, aber keiner merkt's.

```bash
# Lokal
git add . && git commit -m "…" && git push origin main

# Server — ein SSH-Command, der den gesamten Deploy erledigt:
ssh "info@raster-rausch.de@a-c8cb6q@ssh.altgemeinde.project.host" '
  cd ~/html/kiehls-klunker && \
  git pull --ff-only && \
  mittnitectl job restart node
'
```

Erwartete Ausgabe: `🥳 job node restarted`. Dann `curl -sI https://p-bn7b5m.project.space/` zum Smoke-Test — HTTP 200. Gesamter Deploy ≈ 5–8 Sekunden Downtime während der Build läuft.

**Falls `git pull` wegen lokaler `package-lock.json`-Änderungen scheitert:** `git checkout -- package-lock.json` vorwegschicken. Kommt vor, wenn ein `npm install` frühere Lockfile-Änderungen gemacht hat, die nicht in Git sind.

**Bei neuen npm-Deps:** `mittnitectl job restart node` läuft `npm start`, was vor dem Start `astro build` triggert, aber kein `npm install`. Vor dem Restart also separat `npm install --no-audit --no-fund` ausführen wenn `package.json` geändert wurde.

**Deploy-Limits:** Keine praktisch relevanten. GitHub, Mittwald, Stripe — niemand zählt pro Tag. Wir können so oft iterieren wie wir wollen.

**Deploy-Rhythmus (User-Preference):** *Nicht nach jeder kleinen Änderung* deployen — Änderungen sammeln, zwischendurch lokal zeigen/diskutieren, erst auf Aufforderung („jetzt deploy"/„gib raus") Commit+Push+Server-Build anstoßen.

## Spacing-System (Design-Tokens)

Für vertikalen Rhythmus gibt es **zwei Section-Tiers** (kein dritter):

| Tier | Token | Mobile → Tablet → Desktop | Verwendung |
|---|---|---|---|
| **S** (Compact) | `py-8 md:py-12 lg:py-16` | 32 → 48 → 64 px | Supportive/ruhige Blöcke: Brand-Philosophy, USP, Footer-Grid |
| **M** (Standard) | `py-12 md:py-20 lg:py-28` | 48 → 80 → 112 px | Alles andere — Kollektion, Reviews, Making-Of, Newsletter, ueber-mich, Kontakt, Shop, PDP, Legal, Checkout |

**Ratio:** Innerhalb Tier ~1.5× pro Breakpoint, zwischen Tiers ~1.5× — konsistente 1.5er-Progression.

Wenn eine Section Kopf + Grid mit extra Header hat (z. B. Shop-Liste), darf `pb` oder `pt` am Rand gegen das angrenzende Element kürzer sein (`pb-8 md:pb-12`), solange die Section als Ganzes im Rahmen bleibt.

**Innere Rhythmen** — erlaubter Tailwind-Subset:
- **Grid-Gaps:** `gap-6` · `gap-8 md:gap-12` · `gap-10 md:gap-16` · `gap-12 md:gap-20`
- **Content-mb:** `mb-3` (Eyebrow→H), `mb-6` (H→Body), `mb-8` (Body→CTA), `mb-10` (Block-Trenner), `mb-12 md:mb-16` (Header-Block→Grid)
- **Horizontal-Padding (Container):** immer `px-6 md:px-10` (24→40px)

**Was nicht nutzen:** `py-10`, `py-14`, `py-24`, `py-32` auf Sections (außer dokumentierte Ausnahme); `gap-5`, `gap-7`, `gap-9`; ungerade `mb-5`/`mb-7`/`mb-9`. Diese Werte fallen aus dem Raster.

Wenn du eine neue Section anlegst, pick S oder M. Wenn unklar → M.

## i18n

- Default: DE. EN via `/en/`-Prefix.
- `src/middleware.ts` rewritet `/en/foo` → `/foo` und setzt `locals.lang`.
- UI-Strings in `src/i18n/{de,en}.ts`, Zugriff via `t(lang).section.key`.
- **Sprach-Cookie** wird vom `LangSwitcher` gesetzt.
- Etsy-Daten sind nur auf Deutsch — EN-Shop zeigt aktuell DE-Produkttexte (Kathrin muss EN als Shop-Sprache in Etsy aktivieren).

## Preise & Versand

- 3 Preisregionen pro Produkt im Markdown: `priceDE`, `priceUS` (DE + 30 €), `priceWorld` (Original-Etsy).
- `src/lib/price.ts` → `displayPrice(data, country)` wählt passend.
- Versand: drei Tarife, **2–9 Werktage**. **DE** kostenfrei · **übriges Europa** (EU + CH/NO/IS/LI/GB) Pauschale 4,90 € · **USA** Pauschale 39 €. Logik in `src/lib/shipping.ts`, gespiegelt im CartDrawer.
- **§19 UStG Kleinunternehmer** → keine USt auf Rechnungen. Footer-Hinweis in `invoice_data.footer` der Stripe-Session.

## E-Mails

- **Resend** für alle Transactional-Mails (Kontaktformular + Order-Confirmations).
- Absender-Domain muss in Resend verifiziert sein (`kiehls-klunker.de`).
- **`EMAIL_OVERRIDE_TO`** in `.env` leitet *alle* Mails auf eine Adresse um — während Tests immer gesetzt, damit Kathrin/Kunden nicht gespammt werden. Vor Prod-Umzug leeren.
- Templates: `src/lib/contact-emails.ts` (Kontaktformular), `src/lib/order-emails.ts` (Bestellungen, DE+EN).

## Stripe

- **Keys:** Aktuell **LIVE-Keys** in der `.env` (sowohl lokal als auch Staging). Test-Keys liegen auskommentiert daneben.
- **Webhook:** Endpoint ist `/api/stripe/webhook`. Secret fehlt noch — Kathrin muss im Dashboard Endpoint anlegen auf `https://p-bn7b5m.project.space/api/stripe/webhook`, Events `checkout.session.completed` + `checkout.session.async_payment_succeeded`, dann `STRIPE_WEBHOOK_SECRET` eintragen und Node restart.
- Ohne Webhook funktioniert der Kaufvorgang (Stripe zieht Geld), aber die Bestell-Mails gehen *nicht* raus.

## Sicherheitsrails

- `.env` enthält Live-Secrets (Stripe sk_live, Resend-Key, Etsy-Tokens) — **niemals committen**, niemals in Logs, niemals an Dritte.
- Public-Keys (Stripe pk_live, Turnstile site key) sind okay im Frontend.
- Bei zweifelhaften Aktionen auf Shared Infrastructure (force-push, DB-Wipes, Prozess-Kill auf prod) vor dem Ausführen rückfragen.

## Offene Baustellen

- [ ] Stripe Webhook-Secret von Kathrin bekommen + eintragen
- [ ] End-to-End-Test mit Testkarte (inkl. Mail-Zustellung nach Webhook-Setup)
- [ ] Cloudflare Turnstile konfigurieren (Site-Key + Secret in `.env`, derzeit leer)
- [ ] AGB-Texte final reviewen (Rechtsberatung oder Service)
- [ ] Etsy EN-Sprache aktivieren (Kathrin)
- [ ] **Resend-Domain verifizieren** (`kiehls-klunker.de` bei resend.com/domains hinzufügen, DKIM/SPF/MX-Records ins DNS der Domain eintragen). Muss *vor* Go-Live passieren — sonst gehen alle Kontaktformular- und Bestell-Mails ins Leere (403 "domain not verified"). Braucht DNS-Zugriff + ~30 Min Propagation.
- [ ] Domain-Umzug von Staging → `kiehls-klunker.de`
- [ ] Später: Geo-Detection für Auto-Sprachwahl
