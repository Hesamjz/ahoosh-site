# Deploy Kickoff — 2026-06-14
## Track A: Fix Cloudflare workers limit | Track B: Assess Hub MVP

---

## Prerequisites — do these ONCE before running commands

### 1. Google PageSpeed API key (free)
1. Go to https://console.cloud.google.com/
2. Create a project (or use existing)
3. APIs & Services → Enable APIs → search "PageSpeed Insights API" → Enable
4. APIs & Services → Credentials → Create Credentials → API Key
5. Copy the key → go to Cloudflare Dashboard → Pages → ahoosh-site → Settings → Environment Variables
6. Add: `PAGESPEED_API_KEY` = your key (Production + Preview)

### 2. Anthropic API key
1. Go to https://console.anthropic.com/
2. API Keys → Create Key
3. Cloudflare Dashboard → Pages → ahoosh-site → Settings → Environment Variables
4. Add: `ANTHROPIC_API_KEY` = sk-ant-... (Production + Preview, mark as Secret)

### 3. Backend secret (shared between Cloudflare Worker and Hetzner)
- Pick any random string, e.g.: `openssl rand -hex 32`
- Cloudflare → Pages → ahoosh-site → Env Vars: `BACKEND_SECRET` = your string
- Hetzner `.env`: `BACKEND_SECRET` = same string
- Cloudflare → Pages → ahoosh-site → Env Vars: `BACKEND_URL` = https://YOUR_HETZNER_DOMAIN_OR_IP:3001

### 4. Hetzner DB — run schema (SSH into Hetzner first)
```bash
# On Hetzner server (via SSH):
cd /path/to/backend
psql "$DATABASE_URL" -f assess_schema.sql
```
If still on SQLite (pre-1k MAU), skip for now — the save will log "no_db" and fail silently without blocking anything.

---

## Track A — Fix Cloudflare workers limit
### What this does: removes the 50-fetch Pages Function, wires the existing cron Worker

```bash
cd ~/Documents/Hesam_Workspace/ahoosh-site

# 1. Deploy the news-aggregator Worker to production (this activates the route ahoosh.ai/api/news*)
cd workers/news-aggregator
npx wrangler deploy

# 2. Back to repo root — delete the old Pages Function (it caused the limit emails)
cd ../..
rm functions/api/news.js

# 3. Commit and push — Cloudflare Pages will redeploy automatically
git add -A
git commit -m "fix(news): replace 50-fetch Pages Function with cron Worker + D1 (fixes workers limit)"
git push
```

**Verify after deploy (wait ~2 min):**
```bash
curl https://ahoosh.ai/api/news | head -c 200
# Should return: {"updated":"...","total":...,"sources":...,"articles":[...
```

---

## Track B — Assess Hub MVP
### What this does: deploys /api/report Worker, /api/pagespeed proxy, and /assess/website + /assess/report pages

```bash
cd ~/Documents/Hesam_Workspace/ahoosh-site

# Commit everything — Pages builds automatically on push
git add -A
git commit -m "feat(assess): website audit module + /api/report Worker + /api/pagespeed proxy"
git push
```

**After deploy (~3 min), test the pipeline:**
```bash
# 1. Test PageSpeed proxy
curl "https://ahoosh.ai/api/pagespeed?url=https://ahoosh.ai" | python3 -m json.tool | head -30

# 2. Test report endpoint (needs ANTHROPIC_API_KEY set in Cloudflare first)
curl -X POST https://ahoosh.ai/api/report \
  -H "Content-Type: application/json" \
  -d '{"assessments":{"website":{"url":"https://ahoosh.ai","scores":{"performance":72,"accessibility":88,"seo":91,"best_practices":83}}}}' \
  | python3 -m json.tool
```

**Visit the pages:**
- https://ahoosh.ai/assess/website — website audit form
- https://ahoosh.ai/assess/report — AI report (complete audit first)

---

## Track C — Hetzner ws_server update (if using Postgres for storage)
```bash
# On Hetzner via SSH:
cd /path/to/backend/ws_server

# Install pg driver if not already installed
npm install pg

# Restart the server
pm2 restart ws-server   # or however you manage the process

# Set env vars in .env:
# BACKEND_SECRET=<same string as Cloudflare>
# ASSESS_DB_URL=postgresql://user:pass@localhost:5432/yourmaindb
```

---

## Summary of what was built

| File | What it does |
|---|---|
| `workers/news-aggregator/wrangler.toml` | Route added: `ahoosh.ai/api/news*` → cron Worker |
| `workers/news-aggregator/src/index.ts` | Added `/api/news` compat route (old articles format) |
| ~~`functions/api/news.js`~~ | DELETED — this was the subrequest flood |
| `functions/api/report.js` | New: POST → Claude Haiku → JSON report → Hetzner persist |
| `functions/api/pagespeed.js` | New: GET proxy for Google PageSpeed API (hides key) |
| `src/pages/assess/website.astro` | New: website audit form + score cards + localStorage save |
| `src/pages/assess/report.astro` | New: reads localStorage → POST /api/report → renders report + Calendly CTA |
| `backend/assess_schema.sql` | New: Hetzner Postgres schema for assess_sessions |
| `backend/ws_server/server.js` | New: POST /api/assess/save endpoint |

---

## Decisions locked

| # | Decision | What's set |
|---|---|---|
| 1 | Cloudflare fix | news-aggregator Worker replaces news.js |
| 2 | MVP scope | Website module first |
| 3 | SEOScoreAPI | Skipped — add when payment possible |
| 4 | Report gate | Free (no gate for now) |
| 5 | Storage | Hetzner Postgres via ws_server |
| 6 | Language | EN only |
| 7 | CTA | Calendly (update URL in report.astro line 91 if needed) |
