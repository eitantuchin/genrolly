# Genrolly — Setup & First Deploy Guide

This walks you through every account you need, in the order you should set them
up, plus how to load the extension locally and how to ship it to the Chrome Web
Store.

The whole thing is doable in an afternoon if you go top-to-bottom.

---

## 0. Prereqs on your machine

- Node 18+ and npm (only needed if you later add a build step; the current
  extension is plain JS and needs nothing).
- Python 3.11+.
- Git, plus a GitHub account (Railway pulls from GitHub).
- Chrome (or any Chromium browser).

```bash
python3 --version    # 3.11+
git --version
```

---

## 1. Supabase (database)

Why first: Supabase gives you the URL + service-role key that several other
services need to know about, and the schema only takes 30 seconds to apply.

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub.
2. **New project** → name it `genrolly` → pick a strong DB password (save it in
   1Password / your password manager) → choose the region closest to you.
3. Wait ~2 minutes for the project to provision.
4. In the left sidebar: **SQL Editor → New query**. Paste the contents of
   `supabase/schema.sql` from this repo and click **Run**.
5. **Project Settings → API**:
   - Copy `Project URL` → this is `SUPABASE_URL`.
   - Copy the `service_role` key (under "Project API keys") → this is
     `SUPABASE_SERVICE_ROLE_KEY`. **Treat this like a password — never put it in
     the extension or commit it.** It belongs only on the backend.

---

## 2. OpenAI API

1. Go to <https://platform.openai.com> → sign up / log in.
2. **Billing → Add payment method** (the API needs a card; you pay per token).
   Set a low monthly hard limit while testing — $10–20 is plenty.
3. **API keys → Create new secret key** → name it `genrolly-backend` → copy.
   This is `OPENAI_API_KEY`.
4. The default model in the backend is `gpt-4o-mini` — cheap, plenty good for
   cold-email drafting. Override via `OPENAI_MODEL` env var if you want.

---

## 3. Resend (email sending)

1. Sign up at <https://resend.com>.
2. **Domains → Add Domain**. Use a domain you control, e.g. `mail.yourdomain.com`.
   (Pro tip: never send cold email from your primary domain — use a dedicated
   send domain so deliverability problems don't poison your main inbox.)
3. Resend will show DNS records (SPF, DKIM, DMARC). Add them in your registrar
   (Cloudflare, Namecheap, etc.). Wait until Resend says **Verified**.
4. **API Keys → Create API Key** with `Sending access` → copy. This is
   `RESEND_API_KEY`.
5. Decide on `RESEND_FROM_EMAIL` (e.g. `jane@mail.yourdomain.com`). Resend will
   only let you send from a verified domain.
6. **Warmup matters.** For the first 2 weeks, send small batches (10–30 a day),
   reply to bounces, ask early recipients to reply with anything. Tools like
   [Smartlead](https://smartlead.ai) or [Instantly](https://instantly.ai) can
   automate warmup if you scale up. Resend has a [deliverability guide](https://resend.com/docs/dashboard/emails/deliverability) — read it.

---

## 4. YouTube Data API

1. Go to the Google Cloud Console: <https://console.cloud.google.com>.
2. Create a project named `genrolly`.
3. **APIs & Services → Library → "YouTube Data API v3" → Enable**.
4. **APIs & Services → Credentials → Create credentials → API key**. Copy → this
   is `YOUTUBE_API_KEY`.
5. Click **Restrict key**:
   - **API restrictions** → Restrict key → select only "YouTube Data API v3".
   - **Application restrictions** → "IP addresses" and add Railway's egress IP
     (you'll get this after Railway deploys; for now leave it open and tighten
     later).
6. Quota: the free tier is 10,000 units/day. `commentThreads.list` costs
   1 unit/request and returns up to 100 comments — plenty for an MVP.

---

## 5. LinkedIn (read this carefully)

There is no public LinkedIn API for scraping leads. The extension's LinkedIn
content script reads what you, as a logged-in user, are already looking at —
which is the most defensible position, but **it's still against LinkedIn's
User Agreement** if you go beyond reasonable manual browsing speed. Practical
guidance:

- Don't auto-paginate. Make the user click "Next page" manually.
- Cap scrapes at small batches (e.g. 25 cards per click).
- Never store LinkedIn data on a server you operate without the user's clear
  consent — Genrolly's design only sends to your backend after the user clicks
  "Generate emails".
- For scale, switch to a compliant data provider: **PhantomBuster**, **Apify**,
  **Apollo.io**, or LinkedIn Sales Navigator + a verified-CRM integration. They
  shoulder the legal risk.

You don't need a LinkedIn account beyond the one you already have. There's
nothing to "set up" — just be aware of the risk profile.

---

## 6. Stripe (payments — optional for v0)

Skip this if you're not charging users yet. When you're ready:

1. Create an account at <https://stripe.com>.
2. **Developers → API keys**. Copy the **Secret key** (test mode for now) →
   `STRIPE_SECRET_KEY`.
3. Create a Product (e.g. `Genrolly Pro`) and a Price (e.g. $29/month).
4. Add a webhook endpoint pointing at `https://<your-railway-url>/api/stripe/webhook`
   (you'll wire this up once you add the Stripe router). Copy the signing
   secret → `STRIPE_WEBHOOK_SECRET`.
5. For checkout, the cheapest path is Stripe-hosted Checkout Sessions or
   Payment Links — no PCI work, no custom UI.

---

## 7. Railway (backend hosting)

1. Sign up at <https://railway.app> with GitHub.
2. Push this repo to GitHub:
   ```bash
   cd /Users/eitantuchin/genrolly
   git init
   git add .
   git commit -m "Initial Genrolly scaffold"
   git branch -M main
   git remote add origin git@github.com:<you>/genrolly.git
   git push -u origin main
   ```
3. In Railway: **New Project → Deploy from GitHub repo → genrolly**.
4. **Settings → Root Directory** → set to `backend`. (Otherwise Railway tries to
   build the extension folder.)
5. **Variables** → paste in everything from `backend/.env.example`, filling in
   real values. Importantly, generate a fresh `GENROLLY_API_KEYS`:
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
   You'll paste this same value into the extension's **Settings → API key**.
6. Railway auto-detects the FastAPI app via Nixpacks (or the included
   Dockerfile). It will give you a URL like
   `https://genrolly-backend-production.up.railway.app`.
7. Visit `<URL>/health` — you should see a JSON object listing which services
   are configured.
8. In the extension's `manifest.json`, the `host_permissions` already includes
   `https://*.up.railway.app/*`. If you use a custom domain, add it there.

---

## 8. Local backend dev (alternative to Railway during development)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env with real keys

uvicorn app.main:app --reload
# open http://localhost:8000/docs
```

The extension defaults to `http://localhost:8000` — perfect for dev.

---

## 9. Load the extension in Chrome (your first deploy, basically)

1. Open Chrome → `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. **Load unpacked** → select `/Users/eitantuchin/genrolly/extension`.
4. Pin Genrolly to your toolbar.
5. Click the icon → **Settings** → set **Backend URL** (`http://localhost:8000`
   for dev or your Railway URL for prod) and **API key** (same value as
   `GENROLLY_API_KEYS`). Save.
6. Visit a LinkedIn `/search/results/people/` page or a YouTube video. Open the
   popup → enter your course niche → **Scrape leads** → switch to the Leads tab
   → **Generate emails**.

You're now using the extension end-to-end against your real backend.

---

## 10. Ship to the Chrome Web Store

1. Make a 128×128 icon you actually like (replace `extension/icons/icon128.png`).
   Also recommended: at least one 1280×800 promotional screenshot of the popup.
2. Bump `version` in `extension/manifest.json` for every store submission.
3. Zip the extension folder (the contents, not the folder itself):
   ```bash
   cd /Users/eitantuchin/genrolly/extension
   zip -r ../genrolly-0.1.0.zip . -x "*.DS_Store"
   ```
4. Go to <https://chrome.google.com/webstore/devconsole>. Pay the **one-time
   $5** developer registration fee.
5. **Add new item** → upload the zip.
6. Fill the listing:
   - **Description** — what Genrolly does in plain English.
   - **Category** → "Productivity" or "Developer Tools".
   - **Screenshots** → at least one 1280×800.
   - **Privacy practices** — be honest about data collection. The store will
     reject extensions that don't match what they actually do. List that the
     extension reads page content on linkedin.com/youtube.com, sends scraped
     content to your backend, and stores user-provided settings in
     `chrome.storage.sync`.
   - **Single purpose** → "Capture leads for course creators".
   - **Justifications for permissions**: `storage` (saves settings/leads),
     `activeTab` (read the page the user is currently on), `scripting` /
     `tabs` (run the scraper in the active tab), host permissions for
     LinkedIn/YouTube (sources of leads), Railway URL (backend).
7. **Visibility** → start with **Unlisted** while you test. Switch to **Public**
   when you're confident.
8. Submit for review. Approval typically takes a few days for a first
   submission. After approval, install link looks like
   `https://chromewebstore.google.com/detail/<id>`.

### After it's live

- The extension's `id` becomes stable. If you build any backend allowlists
  keyed on extension origin (`chrome-extension://<id>`), tighten `CORS_ORIGINS`
  on the backend to that ID.
- For updates: bump `version`, rezip, upload a new package in the dev console.
  Chrome auto-updates installed extensions within ~24 hours.

---

## Quick troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Popup says "Backend: unreachable" | Backend not running, or `Backend URL` setting wrong, or CORS too restrictive. |
| Backend returns 401 | `x-api-key` in extension settings doesn't match `GENROLLY_API_KEYS` env on the backend. |
| LinkedIn scrape returns 0 leads | LinkedIn changed class names again (it happens every few months). Update selectors in `extension/content/linkedin.js`. |
| Resend says "domain not verified" | DNS not propagated yet. Re-check your registrar; DKIM/SPF can take up to 24h. |
| OpenAI 429 | Hit your monthly limit, or you forgot to add billing. |
| YouTube `quotaExceeded` | The 10,000 unit/day cap. Either request a quota increase or fall back to the DOM scraper. |
