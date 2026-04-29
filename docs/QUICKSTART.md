# Genrolly Quick Start

## What Was Built

✅ **Complete dual-environment infrastructure** with separate dev and prod configurations
✅ **Environment-aware configuration system** that automatically loads the right settings
✅ **Gmail OAuth integration** for sending emails from user accounts
✅ **Deployment-ready setup** for Railway/Heroku with production configs

---

## File Structure

```
genrolly/
├── backend/
│   ├── .env.development          # DEV config template (placeholder values)
│   ├── .env.production           # PROD config template (placeholder values)
│   ├── .env                      # YOUR actual secrets (git-ignored)
│   ├── start-dev.sh              # Start dev server
│   ├── start-prod.sh             # Start prod server
│   ├── Procfile                  # Railway/Heroku deployment
│   ├── railway.json              # Railway-specific config
│   └── app/
│       ├── config.py             # Environment-aware config
│       └── main.py               # Logs environment on startup
├── INFRASTRUCTURE.md             # Complete setup guide
├── GMAIL_SETUP.md                # Gmail OAuth guide
└── QUICKSTART.md                 # This file
```

---

## What You Need to Do

### 1. Set Up Google Cloud (15 minutes)

Create TWO GCP projects:

**Dev Project (`genrolly-dev`):**
- Enable Gmail API
- Create OAuth client (Web application)
- Redirect URI: `http://localhost:8000/auth/gmail/callback`
- Save Client ID and Secret

**Prod Project (`genrolly-prod`):**
- Enable Gmail API
- Create OAuth client (Web application)
- Redirect URI: `https://your-domain.com/auth/gmail/callback`
- Save Client ID and Secret

👉 **See GMAIL_SETUP.md for detailed instructions**

### 2. Set Up Supabase (10 minutes)

Create TWO Supabase projects:

**Dev Project (`genrolly-dev`):**
- Create project
- Run `supabase/schema.sql` in SQL Editor
- Save Project URL and Service Role Key

**Prod Project (`genrolly-prod`):**
- Create project
- Run `supabase/schema.sql` in SQL Editor
- Save Project URL and Service Role Key

### 3. Configure Development (5 minutes)

```bash
cd backend

# Copy the template
cp .env.development .env

# Edit with your DEV credentials
nano .env
```

Fill in:
```bash
ENV=development
GENROLLY_API_KEYS=dev-key-xyz
OPENAI_API_KEY=sk-...
GOOGLE_CLIENT_ID=xxx-dev.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-dev...
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/gmail/callback
SUPABASE_URL=https://xxx-dev.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...dev
```

### 4. Start Development (1 minute)

```bash
cd backend

# Install dependencies (first time only)
pip install -r requirements.txt

# Start dev server
./start-dev.sh
```

You should see:
```
🚀 Starting Genrolly API in DEVELOPMENT mode
📄 Loaded config from: .env
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### 5. Test It Works

```bash
# Test health endpoint
curl http://localhost:8000/health

# Expected response:
{
  "status": "ok",
  "environment": "development",
  "services": {
    "openai": true,
    "gmail_oauth": true,
    "supabase": true
  }
}
```

### 6. Load Extension

1. Open Chrome: `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `extension` folder
5. Click extension icon
6. Connect Gmail (dev account)
7. Test scraping and sending!

---

## Deploy to Production (Later)

When ready for production:

### 1. Deploy Backend to Railway

```bash
# Push to GitHub (if not already)
git add .
git commit -m "Production-ready setup"
git push origin main

# In Railway dashboard:
# - Create new project
# - Connect to GitHub repo
# - Set root directory: backend/
# - Add all environment variables from .env.production
# - Deploy!
```

### 2. Configure Production Environment

In Railway, set these environment variables:
```
ENV=production
GENROLLY_API_KEYS=prod-key-xyz
GOOGLE_CLIENT_ID=xxx-prod.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-prod...
GOOGLE_REDIRECT_URI=https://your-railway-url.up.railway.app/auth/gmail/callback
SUPABASE_URL=https://xxx-prod.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...prod
CORS_ORIGINS=chrome-extension://your-extension-id
```

### 3. Update Google OAuth

- Go to GCP **prod project**
- Add Railway URL to authorized redirect URIs
- Submit OAuth consent screen for verification (for public users)

### 4. Publish Extension

- Update manifest with production backend URL
- Create ZIP of extension folder
- Submit to Chrome Web Store
- Get published extension ID
- Update `CORS_ORIGINS` in Railway

---

## Key Concepts

### Environment Detection

The backend automatically detects which environment to use:

```bash
# Development (default)
./start-dev.sh              # Loads .env.development if exists, else .env

# Production
ENV=production python ...   # Loads .env.production

# Custom
ENV=staging python ...      # Loads .env.staging
```

### Configuration Validation

On startup, the backend validates your config:

```bash
🚀 Starting Genrolly API in DEVELOPMENT mode
📄 Loaded config from: .env
⚠️  Configuration warnings:
  - OPENAI_API_KEY is required
```

Fix any warnings before proceeding.

### Separate Resources

| Resource | Development | Production |
|----------|-------------|------------|
| GCP Project | genrolly-dev | genrolly-prod |
| Supabase | dev project | prod project |
| OAuth Redirect | localhost:8000 | your-domain.com |
| API Keys | dev keys | prod keys |
| Stripe | Test mode | Live mode |
| CORS | `*` (open) | Extension ID only |

---

## Common Commands

```bash
# Development
cd backend
./start-dev.sh                    # Start dev server
curl http://localhost:8000/health # Test health

# Production (local testing)
cd backend
ENV=production ./start-prod.sh    # Start with prod config (uses gunicorn)

# Check which environment is loaded
python -c "from app.config import get_settings; print(get_settings().ENV)"

# Validate configuration
python -c "from app.config import get_settings; print(get_settings().validate_config())"
```

---

## Troubleshooting

**Backend won't start:**
```bash
# Check environment
ENV=development python -c "from app.config import get_settings; print(get_settings().ENV)"

# Validate config
ENV=development python -c "from app.config import get_settings; print(get_settings().validate_config())"
```

**OAuth not working:**
- Verify redirect URI matches exactly (including http/https)
- Check client ID/secret from correct GCP project (dev vs prod)
- Add test users in GCP dev project

**Extension can't connect:**
- Check backend URL in extension settings
- Verify API key matches
- Check CORS (should be `*` in dev)

---

## Next Steps

1. ✅ Complete Google Cloud setup (both projects)
2. ✅ Complete Supabase setup (both projects)
3. ✅ Fill in `backend/.env` with dev credentials
4. ✅ Start dev server: `./start-dev.sh`
5. ✅ Load extension and test
6. ✅ When ready, deploy to Railway
7. ✅ Publish extension to Chrome Web Store

---

## Documentation

- **INFRASTRUCTURE.md** - Complete setup guide with all details
- **GMAIL_SETUP.md** - Detailed Gmail OAuth configuration
- **SETUP.md** - Original project setup instructions

## Need Help?

Check the logs:
```bash
# Backend logs (development)
./start-dev.sh
# Watch the terminal output

# Backend logs (production on Railway)
# Railway Dashboard → Deployments → View logs

# Extension logs
# Chrome → DevTools → Console
```

---

You're all set! Start with development first, test everything works, then move to production deployment. 🚀
