# Genrolly Infrastructure Setup

Complete guide for setting up development and production environments.

## Overview

Genrolly uses a **dual-environment architecture**:
- **Development**: Local testing with dev GCP project, dev Supabase, localhost
- **Production**: Deployed service with prod GCP project, prod Supabase, public URL

---

## Environment Structure

```
Development (Local)                Production (Deployed)
├── GCP Project: genrolly-dev     ├── GCP Project: genrolly-prod
├── Supabase: dev-project         ├── Supabase: prod-project
├── Backend: localhost:8000       ├── Backend: your-domain.com
├── Extension: Load unpacked      ├── Extension: Chrome Web Store
└── Config: .env (local copy)     └── Config: Railway env vars
```

---

## 🔧 Step 1: Google Cloud Platform Setup

### A. Create TWO GCP Projects

1. Go to: https://console.cloud.google.com
2. Create **Development Project**:
   - Name: `genrolly-dev`
   - Enable Gmail API
   - Configure OAuth consent screen (External, Testing mode)
   - Add test users (your email + beta testers)
3. Create **Production Project**:
   - Name: `genrolly-prod`
   - Enable Gmail API
   - Configure OAuth consent screen (External)
   - Submit for verification (for public launch)

### B. OAuth Credentials (Both Projects)

**For genrolly-dev:**
1. Create OAuth 2.0 Client ID (Web application)
2. **Authorized redirect URIs**:
   - `http://localhost:8000/auth/gmail/callback`
3. Save Client ID and Client Secret

**For genrolly-prod:**
1. Create OAuth 2.0 Client ID (Web application)
2. **Authorized redirect URIs**:
   - `https://your-production-domain.com/auth/gmail/callback`
   - Add Railway/Heroku URL once deployed
3. Save Client ID and Client Secret

### C. Required OAuth Scopes (Both Projects)
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/userinfo.email`

---

## 🗄️ Step 2: Supabase Setup

### A. Create TWO Supabase Projects

1. Go to: https://supabase.com/dashboard
2. Create **Development Project**:
   - Name: `genrolly-dev`
   - Region: Choose closest to you
   - Database password: Save securely
3. Create **Production Project**:
   - Name: `genrolly-prod`
   - Region: Choose for production users
   - Database password: Save securely (different from dev!)

### B. Run Migrations (Both Projects)

For each project:
1. Go to SQL Editor in Supabase Dashboard
2. Run the schema from `supabase/schema.sql`
3. Verify tables created: `leads`, `generated_emails`, `campaigns`, etc.
4. Check migrations applied successfully

**Or use CLI:**
```bash
# Dev project
supabase link --project-ref your-dev-project-ref
supabase db push

# Prod project (switch connection)
supabase link --project-ref your-prod-project-ref
supabase db push
```

### C. Get Credentials (Both Projects)

For each project, save:
- **Project URL**: `https://xxx.supabase.co`
- **Service Role Key**: Settings → API → service_role (secret!)
- **Anon Key**: For frontend if needed

---

## 💻 Step 3: Development Environment Setup

### A. Copy Template and Fill Secrets

```bash
cd backend

# Copy the development template
cp .env.development .env

# Edit .env with your actual DEV secrets
nano .env
```

### B. Fill in `.env` with Development Credentials

```bash
ENV=development

# Use dev API key
GENROLLY_API_KEYS=your-dev-api-key-here

# OpenAI (same for dev/prod or separate keys)
OPENAI_API_KEY=sk-...

# Google OAuth - DEV PROJECT
GOOGLE_CLIENT_ID=your-dev-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-dev-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/gmail/callback

# Supabase - DEV PROJECT
SUPABASE_URL=https://your-dev-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...your-dev-key

# Stripe - USE TEST MODE KEYS
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...

# CORS - Allow all for dev
CORS_ORIGINS=*
```

### C. Install Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### D. Start Development Server

```bash
# Option 1: Use startup script
./start-dev.sh

# Option 2: Manual uvicorn
ENV=development uvicorn app.main:app --reload
```

You should see:
```
🚀 Starting Genrolly API in DEVELOPMENT mode
📄 Loaded config from: .env
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### E. Test Development Setup

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "ok",
  "environment": "development",
  "services": {
    "openai": true,
    "gmail_oauth": true,
    "supabase": true,
    ...
  }
}
```

---

## 🚀 Step 4: Production Environment Setup

### A. Deploy to Railway (or Heroku)

#### Railway Deployment

1. **Create Railway Account**: https://railway.app
2. **Create New Project**: "New Project" → "Deploy from GitHub"
3. **Connect Repository**: Select your Genrolly repo
4. **Configure Service**:
   - Root directory: `/backend`
   - Build command: `pip install -r requirements.txt`
   - Start command: (already in Procfile)

#### Set Environment Variables in Railway

Go to your Railway project → Variables → Add all:

```bash
ENV=production

GENROLLY_API_KEYS=your-prod-api-key-here

OPENAI_API_KEY=sk-prod-...

# Google OAuth - PROD PROJECT
GOOGLE_CLIENT_ID=your-prod-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-prod-secret
GOOGLE_REDIRECT_URI=https://your-railway-domain.up.railway.app/auth/gmail/callback

# Supabase - PROD PROJECT
SUPABASE_URL=https://your-prod-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...your-prod-key

# Stripe - USE LIVE MODE KEYS
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_live_...

# CORS - Restrict to your extension ID
CORS_ORIGINS=chrome-extension://your-published-extension-id
```

### B. Update Google OAuth Redirect URI

1. Go to GCP Console → **genrolly-prod** project
2. Credentials → Your OAuth 2.0 Client
3. Add Authorized redirect URI:
   - `https://your-railway-domain.up.railway.app/auth/gmail/callback`
4. Save

### C. Deploy

```bash
# Railway auto-deploys on git push
git push origin main
```

Watch deployment logs in Railway dashboard.

### D. Test Production Deployment

```bash
curl https://your-railway-domain.up.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "environment": "production",
  "services": { ... }
}
```

---

## 📦 Step 5: Extension Configuration

### Development Extension

1. **Load unpacked extension**:
   - Go to `chrome://extensions`
   - Enable Developer mode
   - Load unpacked → select `extension` folder

2. **Configure backend URL**:
   - Click extension → Settings
   - Backend URL: `http://localhost:8000`
   - API Key: Your dev API key

### Production Extension

1. **Update manifest**:
   ```json
   {
     "host_permissions": [
       "https://your-railway-domain.up.railway.app/*"
     ]
   }
   ```

2. **Build and publish**:
   - Create ZIP of extension folder
   - Submit to Chrome Web Store
   - Get published extension ID

3. **Update CORS in production**:
   - Update Railway env var `CORS_ORIGINS`
   - Set to your extension ID

---

## 🔐 Security Checklist

### Development
- [ ] .env file is in .gitignore
- [ ] Dev API keys are different from prod
- [ ] Stripe test mode keys only
- [ ] CORS set to `*` (acceptable for local dev)

### Production
- [ ] All secrets in Railway env vars (not in code)
- [ ] Prod API keys are strong and unique
- [ ] Stripe live mode keys
- [ ] CORS restricted to extension ID
- [ ] Google OAuth verified (or test users only)
- [ ] Supabase RLS enabled (when ready)

---

## 🧪 Testing Your Setup

### 1. Test Development Flow

```bash
# Terminal 1: Start backend
cd backend
./start-dev.sh

# Terminal 2: Test endpoints
curl http://localhost:8000/health
curl -H "x-api-key: your-dev-key" http://localhost:8000/auth/gmail/status

# Browser: Test extension
# - Load extension
# - Connect Gmail (dev account)
# - Scrape leads
# - Generate emails
# - Send test email
```

### 2. Test Production Flow

```bash
# Test production health
curl https://your-railway-domain.up.railway.app/health

# Install production extension from Chrome Web Store
# Connect Gmail with real user account
# Test full workflow
```

---

## 🛠️ Troubleshooting

### Backend won't start
```bash
# Check environment is loading
ENV=development python -c "from app.config import get_settings; print(get_settings().ENV)"

# Check for missing secrets
ENV=development python -c "from app.config import get_settings; print(get_settings().validate_config())"
```

### OAuth not working
- Check redirect URI matches exactly (trailing slashes matter!)
- Verify OAuth client is for correct GCP project
- Check test users are added (dev) or app is verified (prod)

### Database connection failed
- Verify Supabase URL and key are correct
- Check migrations have been applied
- Test connection: `curl https://your-project.supabase.co/rest/v1/`

### Extension can't connect
- Check backend URL in extension settings
- Verify API key matches backend
- Check CORS origins (dev should be `*`, prod should be extension ID)
- Open DevTools console for error messages

---

## 📊 Monitoring

### Development
- Check backend logs in terminal
- Use `/health` endpoint
- Chrome DevTools for extension debugging

### Production
- Railway logs: Dashboard → Deployments → View logs
- Supabase logs: Dashboard → Logs
- Google Cloud logs: Console → Logging

---

## 🚦 Environment Variables Reference

| Variable | Dev Value Example | Prod Value Example | Required |
|----------|-------------------|-------------------|----------|
| ENV | `development` | `production` | Yes |
| GENROLLY_API_KEYS | `dev-key-123` | `prod-key-xyz` | Yes |
| OPENAI_API_KEY | `sk-...` | `sk-...` | Yes |
| GOOGLE_CLIENT_ID | `xxx-dev.apps...` | `xxx-prod.apps...` | Yes |
| GOOGLE_CLIENT_SECRET | `GOCSPX-dev...` | `GOCSPX-prod...` | Yes |
| GOOGLE_REDIRECT_URI | `http://localhost:8000/...` | `https://domain.com/...` | Yes |
| SUPABASE_URL | `https://dev.supabase.co` | `https://prod.supabase.co` | Yes |
| SUPABASE_SERVICE_ROLE_KEY | `eyJ...dev` | `eyJ...prod` | Yes |
| STRIPE_SECRET_KEY | `sk_test_...` | `sk_live_...` | No |
| CORS_ORIGINS | `*` | `chrome-extension://id` | Yes |

---

## 🎯 Quick Start Cheatsheet

```bash
# First time setup
1. Create 2 GCP projects (dev + prod)
2. Create 2 Supabase projects (dev + prod)
3. Copy backend/.env.development to backend/.env
4. Fill in all DEV credentials
5. Run: ./backend/start-dev.sh
6. Load extension in Chrome
7. Test full flow

# Daily development
cd backend && ./start-dev.sh
# Load extension and code!

# Deploy to production
git push origin main
# Railway auto-deploys
# Update extension with new backend URL
```

---

## 📚 Additional Resources

- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Supabase Documentation](https://supabase.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Gmail API Documentation](https://developers.google.com/gmail/api)

---

## Need Help?

- Backend issues: Check logs with `./start-dev.sh`
- Extension issues: Open Chrome DevTools
- API issues: Test with `curl` commands
- Database issues: Check Supabase dashboard logs
