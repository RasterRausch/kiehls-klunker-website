#!/usr/bin/env bash
# Etsy → GitHub Auto-Sync für Kiehls Klunker.
# Wird vom Mittwald-Cron aufgerufen (z.B. täglich 03:00 Uhr).
# Pullt Etsy-Daten, committet+pusht, restarted Node nur bei tatsächlichen Änderungen.
#
# Voraussetzungen auf dem Server:
#   - SSH-Deploy-Key am GitHub-Repo mit Schreibrechten eingerichtet
#   - Repo-Remote auf SSH umgestellt (git@github.com:...)
#   - mittnitectl im PATH (Mittwald-Default)
#   - npm/node verfügbar (Mittwald-Default)

set -euo pipefail

REPO="${REPO:-$HOME/html/kiehls-klunker}"
LOG_DIR="${LOG_DIR:-$HOME/html/kiehls-klunker-logs}"
LOG="$LOG_DIR/etsy-sync-$(date +%Y%m%d).log"

mkdir -p "$LOG_DIR"
# stdout+stderr in Logfile umleiten — Cron schickt sonst Mail bei jeder Ausgabe
exec >>"$LOG" 2>&1

echo "─── $(date -Iseconds) ─── Auto-Sync Start ───"

cd "$REPO"

# 1. Repo aktuell halten. Drift in package-lock.json (entsteht durch lokale
#    npm-Calls beim Build) wegwerfen, damit git pull nicht scheitert.
git checkout -- package-lock.json 2>/dev/null || true
git pull --ff-only

# 2. Etsy-Daten ziehen. Schreibt Tokens in .env zurück (Refresh-Rotation),
#    aktualisiert MDs in src/content/products/, lädt neue Bilder, schreibt
#    neue Reviews.
npm run sync:etsy

# 3. Wenn nichts neu ist: kein Commit, kein Restart.
if git diff --quiet && git diff --cached --quiet; then
  echo "Keine Änderungen, kein Commit, kein Restart."
  echo "─── $(date -Iseconds) ─── Auto-Sync Ende (no-op) ───"
  exit 0
fi

# 4. Committen + pushen. .env wird ausgeklammert (gitignored), nur
#    Content-Updates landen im Repo.
git add src/content/ public/
if git diff --cached --quiet; then
  echo "Nur .env-Drift (Token-Rotation), kein Content-Update — kein Restart nötig."
  echo "─── $(date -Iseconds) ─── Auto-Sync Ende (only token rotation) ───"
  exit 0
fi

git commit -m "chore(content): etsy auto-sync $(date -I)

Lernstabil"
git push origin main

# 5. Build + Restart anstoßen. mittnitectl job restart node startet
#    npm start neu, was astro build && node dist/server/entry.mjs ausführt.
echo "→ Restart node nach gepushten Änderungen…"
mittnitectl job restart node

echo "─── $(date -Iseconds) ─── Auto-Sync Ende (deployed) ───"
