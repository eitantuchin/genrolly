"""/auth/gmail OAuth routes — handle Google OAuth flow for Gmail API."""
from __future__ import annotations

import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from ..auth import require_api_key
from ..config import get_settings
from ..services import gmail_oauth_service

router = APIRouter(prefix="/auth/gmail", tags=["oauth"])

# In-memory state store for OAuth flow (use Redis in production)
_oauth_states: dict[str, str] = {}


@router.get("/authorize")
def authorize(user_id: str = Depends(require_api_key)):
    """
    Step 1: Generate OAuth authorization URL and redirect user to Google.
    Extension calls this endpoint, user gets redirected to Google consent screen.
    """
    settings = get_settings()
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    # Generate random state to prevent CSRF
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = user_id

    # Build Google OAuth URL
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
        "access_type": "offline",  # Get refresh token
        "prompt": "consent",  # Force consent to always get refresh token
        "state": state,
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"

    return {"auth_url": auth_url}


@router.get("/callback")
async def callback(
    code: str = Query(...),
    state: str = Query(...),
):
    """
    Step 2: Google redirects back here with authorization code.
    Exchange code for tokens and store in database.
    """
    # Verify state to prevent CSRF
    user_id = _oauth_states.pop(state, None)
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")

    try:
        # Exchange code for tokens
        email = await gmail_oauth_service.exchange_code_for_tokens(
            code=code,
            user_id=user_id,
        )

        # Redirect to success page (extension will handle this)
        return RedirectResponse(
            url=f"http://localhost:8000/oauth-success.html?email={email}",
            status_code=302,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OAuth callback failed: {str(e)}")


@router.get("/status")
def status(user_id: str = Depends(require_api_key)):
    """Check if user has connected Gmail."""
    token_info = gmail_oauth_service.get_token_info(user_id)
    if not token_info:
        return {"connected": False}

    return {
        "connected": True,
        "email": token_info.get("email"),
    }


@router.post("/disconnect")
def disconnect(user_id: str = Depends(require_api_key)):
    """Revoke Gmail access and delete stored tokens."""
    success = gmail_oauth_service.revoke_tokens(user_id)
    return {"success": success}
