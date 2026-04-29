# Gmail API OAuth Setup Guide

## What Was Built

I've implemented a complete Gmail API OAuth integration that allows users to send emails from their own Gmail accounts. Here's what was added:

### Backend Changes:
1. **Database schema** - New `gmail_oauth_tokens` table to store encrypted OAuth tokens
2. **OAuth router** (`backend/app/routers/oauth.py`) - Handles OAuth flow endpoints
3. **Gmail OAuth service** (`backend/app/services/gmail_oauth_service.py`) - Token management and refresh
4. **Gmail sending service** (`backend/app/services/gmail_service.py`) - Sends emails via Gmail API
5. **Updated email router** - Now uses Gmail API
6. **OAuth success page** - Beautiful confirmation page after authorization
7. **Updated config** - Added Google OAuth credentials to settings

### Extension Changes:
1. **Gmail connection UI** - Added status indicator and "Connect Gmail" button in popup
2. **OAuth flow handler** - Opens OAuth window and polls for completion
3. **Connection status check** - Shows connected email or disconnection option

---

## What You Need to Do

### 1. Google Cloud Console Setup

1. **Go to Google Cloud Console**: https://console.cloud.google.com

2. **Create or Select a Project**:
   - Click on project dropdown at top
   - Create new project or select existing one
   - Name it something like "Genrolly" or "Course Email Tool"

3. **Enable Gmail API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click on it and press "Enable"

4. **Configure OAuth Consent Screen**:
   - Go to "APIs & Services" > "OAuth consent screen"
   - Choose "External" (unless you have Google Workspace)
   - Fill in required fields:
     - App name: `Genrolly` (or your app name)
     - User support email: your email
     - Developer contact: your email
   - **Add Scopes** (click "Add or Remove Scopes"):
     - `https://www.googleapis.com/auth/gmail.send` - Send emails
     - `https://www.googleapis.com/auth/userinfo.email` - Get user email
   - Add test users if in Testing mode (add your own email)

5. **Create OAuth Credentials**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: **Web application**
   - Name: `Genrolly Web Client`
   - **Authorized redirect URIs**: Add these:
     - `http://localhost:8000/auth/gmail/callback` (for local dev)
     - `https://your-production-domain.com/auth/gmail/callback` (for production, if deployed)
   - Click "Create"
   - **Copy the Client ID and Client Secret** (you'll need these next)

### 2. Update Your .env File

Add these lines to `backend/.env`:

```bash
# Google OAuth (Gmail API)
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/gmail/callback
```

Replace:
- `your-client-id-here` with your actual Client ID from step 5
- `your-client-secret-here` with your actual Client Secret from step 5

**Note**: Keep the redirect URI as `http://localhost:8000/auth/gmail/callback` for local development. When you deploy to production, update it to your production URL.

### 3. Update Other .env Variables

Make sure these are also set in your `.env`:

```bash
# Your extension API key (already generated)
GENROLLY_API_KEYS=G0dTF4lg0zdWmci7keQtK0_Ta7D0exobyVRy5SbfjUg

# OpenAI (for generating emails)
OPENAI_API_KEY=sk-your-actual-openai-key

# Supabase (already configured)
SUPABASE_URL=https://aumgaxgtfbxxtfwvnfhw.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Test the Integration

1. **Start your backend**:
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

2. **Load the extension**:
   - Open Chrome
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder

3. **Connect Gmail**:
   - Click the extension icon
   - You should see the "Gmail Connection" section
   - Click "Connect Gmail"
   - A popup window will open asking you to authorize
   - Sign in with your Google account
   - Grant permissions for sending emails
   - The popup will close and status should show "Connected: youremail@gmail.com"

4. **Test sending an email**:
   - Import some leads from Apollo or add them manually
   - Generate emails
   - Click "Send all"
   - Emails will be sent from your Gmail account!

---

## Important Notes

### Security
- **Never commit your `.env` file** - It's already in `.gitignore`
- OAuth tokens are stored encrypted in Supabase
- Each user connects their own Gmail account

### Gmail API Limits
- **Free tier**: 100 emails/day per user
- **Google Workspace**: 2000 emails/day per user
- These are Google's limits, not yours

### Production Deployment
When you deploy to production (Railway, Heroku, etc.):

1. **Update redirect URI**:
   - Add your production URL to Google Cloud Console authorized redirect URIs
   - Update `GOOGLE_REDIRECT_URI` in your production environment variables

2. **OAuth consent screen**:
   - Submit for verification if you want to remove the "unverified app" warning
   - Or keep it in testing mode and manually add test users

3. **Environment variables**:
   - Set all environment variables in your hosting platform
   - Use the same Google OAuth credentials

### Troubleshooting

**"Invalid OAuth state" error**:
- The OAuth state expires. Try connecting again.
- In production, use Redis instead of in-memory storage.

**"No refresh token received" error**:
- User needs to revoke access at https://myaccount.google.com/permissions
- Then reconnect - make sure to grant permissions again

**"Gmail not connected" when sending**:
- Click "Connect Gmail" first
- Check that the green dot shows "Connected" status

**Backend unreachable**:
- Make sure backend is running on `http://localhost:8000`
- Check the extension options/settings for correct backend URL

---

## File Changes Summary

### New Files Created:
- `backend/app/routers/oauth.py` - OAuth flow endpoints
- `backend/app/services/gmail_oauth_service.py` - Token management
- `backend/app/services/gmail_service.py` - Gmail API email sending
- `backend/oauth-success.html` - OAuth success page

### Modified Files:
- `backend/app/config.py` - Added Google OAuth settings
- `backend/app/main.py` - Registered OAuth router, added success page endpoint
- `backend/app/routers/emails.py` - Now uses Gmail API
- `extension/popup/popup.html` - Added Gmail connection UI
- `extension/popup/popup.js` - Added OAuth flow handlers
- `extension/popup/popup.css` - Added secondary button style
- Supabase database - Added `gmail_oauth_tokens` table

### No Changes Needed:
- Extension manifest
- Background service worker
- Content scripts
- Options page

---

## Next Steps After Setup

Once you've completed the setup:

1. **Test thoroughly** with your own Gmail account
2. **Add error handling** for failed sends
3. **Consider rate limiting** to respect Gmail quotas
4. **Add email templates** for different use cases
5. **Track email metrics** (opens, replies) if needed

You're all set! The integration is complete and ready to use. Let me know if you run into any issues.
