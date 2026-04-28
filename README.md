# Genrolly

Lead gen for course creators. Scrape qualified prospects from LinkedIn search
results and YouTube comment sections, generate personalized cold-email drafts
with OpenAI, and send through Resend.

## What's in here

```
genrolly/
├── extension/        Chrome MV3 extension (popup, content scripts, options)
├── backend/          FastAPI app (OpenAI + Resend + Supabase + YouTube API)
├── supabase/         schema.sql to apply in the Supabase SQL editor
├── SETUP.md          Step-by-step setup for every account + first deploy
└── README.md
```

## 60-second tour

- The **extension** content scripts read what the user is already looking at on
  LinkedIn / YouTube and surface candidate leads in the popup.
- The popup posts those leads to the **backend**, which calls OpenAI to draft
  personalized emails, optionally persists everything to **Supabase**, and
  sends through **Resend** when the user clicks "Send all".
- The backend is deployable to **Railway** in a single click once your repo is
  on GitHub.
- The extension itself ships through the **Chrome Web Store** (one-time $5
  developer fee).

## Get running fast

```bash
# 1. Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # fill in OPENAI_API_KEY etc.
uvicorn app.main:app --reload

# 2. Apply Supabase schema: paste supabase/schema.sql into the SQL editor.

# 3. Extension: chrome://extensions → Developer mode → Load unpacked → select extension/
#    Open Settings, paste your backend URL + API key, save.
```

Read [`SETUP.md`](./SETUP.md) for the long version with every account
walk-through, plus how to publish to the Chrome Web Store.

## API surface (backend)

| Method | Path                  | What it does                                  |
| ------ | --------------------- | --------------------------------------------- |
| GET    | `/health`             | Which downstream services are configured.     |
| POST   | `/api/leads/ingest`   | Persist leads scraped by the extension.       |
| POST   | `/api/leads/youtube`  | Pull comments via the official YouTube API.   |
| POST   | `/api/emails/generate`| Draft personalized cold emails with OpenAI.   |
| POST   | `/api/emails/send`    | Send drafts via Resend.                       |

Auth: every `/api/*` endpoint requires an `x-api-key` header matching one of
the values in `GENROLLY_API_KEYS`.

## Notes on LinkedIn

LinkedIn aggressively rotates its DOM class names and its User Agreement
restricts automated scraping. The content script in `extension/content/linkedin.js`
is intentionally conservative: it only reads the page the user is actively
viewing, never auto-paginates, and runs only when the user clicks a button.
For scale, swap to PhantomBuster, Apify, or Apollo.io — they take on the
compliance burden.

## Roadmap

- Reddit + X scrapers (high-intent leads, less competition).
- Domain warmup automation + multi-inbox rotation.
- Reply tracking via Resend webhooks → Supabase.
- Stripe paywall on `/api/emails/generate` past a free quota.
