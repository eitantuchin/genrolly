"""Gmail OAuth service — handles token exchange, refresh, and storage."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

import httpx

from ..config import get_settings
from .supabase_service import get_client

log = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"


async def exchange_code_for_tokens(code: str, user_id: str) -> str:
    """
    Exchange authorization code for access & refresh tokens.
    Store tokens in database and return user's email.
    """
    settings = get_settings()

    async with httpx.AsyncClient() as client:
        # Exchange code for tokens
        token_response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        token_response.raise_for_status()
        token_data = token_response.json()

        access_token = token_data["access_token"]
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 3600)
        scopes = token_data.get("scope", "").split()

        if not refresh_token:
            raise ValueError("No refresh token received. User may need to revoke access and re-authorize.")

        # Get user's email
        userinfo_response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        userinfo_response.raise_for_status()
        email = userinfo_response.json()["email"]

        # Store tokens in database
        supabase = get_client()
        if supabase:
            expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            supabase.table("gmail_oauth_tokens").upsert(
                {
                    "user_id": user_id,
                    "email": email,
                    "access_token": access_token,
                    "refresh_token": refresh_token,
                    "token_expires_at": expires_at.isoformat(),
                    "scopes": scopes,
                }
            ).execute()

        return email


def get_token_info(user_id: str) -> dict[str, Any] | None:
    """Get stored token info for user, or None if not connected."""
    supabase = get_client()
    if not supabase:
        return None

    result = (
        supabase.table("gmail_oauth_tokens")
        .select("*")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )

    return result.data if result.data else None


async def get_valid_access_token(user_id: str) -> str | None:
    """
    Get a valid access token for user.
    Refreshes token if expired.
    Returns None if user hasn't connected Gmail.
    """
    token_info = get_token_info(user_id)
    if not token_info:
        return None

    # Check if token is expired (with 5 min buffer)
    expires_at = datetime.fromisoformat(token_info["token_expires_at"].replace("Z", "+00:00"))
    if datetime.utcnow() + timedelta(minutes=5) < expires_at:
        # Token is still valid
        return token_info["access_token"]

    # Token expired, refresh it
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        refresh_response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "refresh_token": token_info["refresh_token"],
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "grant_type": "refresh_token",
            },
        )
        refresh_response.raise_for_status()
        new_token_data = refresh_response.json()

        new_access_token = new_token_data["access_token"]
        expires_in = new_token_data.get("expires_in", 3600)
        new_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

        # Update token in database
        supabase = get_client()
        if supabase:
            supabase.table("gmail_oauth_tokens").update(
                {
                    "access_token": new_access_token,
                    "token_expires_at": new_expires_at.isoformat(),
                }
            ).eq("user_id", user_id).execute()

        return new_access_token


def revoke_tokens(user_id: str) -> bool:
    """Revoke user's Gmail OAuth tokens and delete from database."""
    token_info = get_token_info(user_id)
    if not token_info:
        return False

    try:
        # Revoke token at Google
        import requests
        requests.post(
            GOOGLE_REVOKE_URL,
            params={"token": token_info["refresh_token"]},
        )
    except Exception as e:
        log.warning(f"Failed to revoke token at Google: {e}")

    # Delete from database
    supabase = get_client()
    if supabase:
        supabase.table("gmail_oauth_tokens").delete().eq("user_id", user_id).execute()

    return True
