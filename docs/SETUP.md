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

## 3. Gmail API (email sending)

1. Go to the Google Cloud Console: <https://console.cloud.google.com>.
2. Create or select a project named `genrolly`.
3. **APIs & Services → Library → Gmail API → Enable**.
4. **APIs & Services → OAuth consent screen**:
   - Choose **External** (unless you are using a Google Workspace account).
   - Fill in app information and developer contact email.
   - Add these scopes:
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/userinfo.email`
   - Add your email as a test user if the app is in testing mode.
5. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**
   - Name: `Genrolly Web Client`
   - Authorized redirect URIs:
     - `http://localhost:8000/auth/gmail/callback`
     - `https://your-production-domain.com/auth/gmail/callback`
   - Copy the client ID and secret.
6. Add these values to `backend/.env`:

```bash
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/gmail/callback
```

---

## 4. Apollo lead source

Apollo is the primary lead source for this version of the app. Use Apollo.io to
find and export leads, then import them into the backend or connect your lead
flows there. This avoids brittle page scraping and keeps the extension focused
on email generation and sending.

---

## 5. Stripe (payments — optional for v0)

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
6. Use Apollo or another lead source to collect leads, then open the popup →
   enter your course niche → **Generate emails** → **Send all**.

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
     extension sends lead data to your backend and stores user-provided settings
     in `chrome.storage.sync`.
   - **Single purpose** → "Capture leads for course creators".
   - **Justifications for permissions**: `storage` (saves settings/leads),
     `activeTab` (access the current tab for lead import actions), `scripting` /
     `tabs` (run the extension logic in the active tab), Railway URL (backend).
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
| Lead import not working | The lead source is not configured correctly. Check your Apollo import workflow or backend settings. |
| Gmail says "not connected" | Connect your Gmail account via the popup's OAuth flow. |
| OpenAI 429 | Hit your monthly limit, or you forgot to add billing. |
