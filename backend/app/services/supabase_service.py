"""Supabase wrapper — persist leads, emails, and campaigns."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Iterable, List, Optional

from supabase import Client, create_client

from ..config import get_settings
from ..models import GeneratedEmail, Lead

log = logging.getLogger(__name__)


def _client() -> Optional[Client]:
    s = get_settings()
    if not s.SUPABASE_URL or not s.SUPABASE_SERVICE_ROLE_KEY:
        return None
    return create_client(s.SUPABASE_URL, s.SUPABASE_SERVICE_ROLE_KEY)


# Public alias used by gmail_oauth_service
get_client = _client


def upsert_leads(user_id: str, leads: Iterable[Lead]) -> int:
    sb = _client()
    if sb is None:
        return 0
    rows = [
        {
            "user_id": user_id,
            "external_id": l.id,
            "source": l.source,
            "name": l.name,
            "headline": l.headline,
            "location": l.location,
            "url": l.url,
            "snippet": l.snippet,
            "email": l.email,
        }
        for l in leads
    ]
    if not rows:
        return 0
    res = sb.table("leads").upsert(rows, on_conflict="user_id,external_id").execute()
    return len(res.data or [])


def insert_emails(user_id: str, emails: List[GeneratedEmail]) -> int:
    sb = _client()
    if sb is None:
        return 0
    rows = [
        {
            "user_id": user_id,
            "lead_external_id": e.leadId,
            "subject": e.subject,
            "body": e.body,
            "status": e.status,
        }
        for e in emails
    ]
    if not rows:
        return 0
    res = sb.table("generated_emails").insert(rows).execute()
    return len(res.data or [])


def get_contacted_lead_ids(user_id: str) -> List[str]:
    """Return all Apollo lead external IDs that have been sent emails for this user."""
    sb = _client()
    if sb is None:
        return []
    try:
        res = (
            sb.table("generated_emails")
            .select("lead_external_id")
            .eq("user_id", user_id)
            .in_("status", ["sent", "queued"])
            .execute()
        )
        return list({row["lead_external_id"] for row in (res.data or [])})
    except Exception:
        log.exception("get_contacted_lead_ids failed")
        return []


def mark_emails_sent(user_id: str, lead_external_ids: List[str]) -> None:
    """Mark generated_emails rows as sent for the given lead IDs."""
    sb = _client()
    if sb is None or not lead_external_ids:
        return
    try:
        now = datetime.now(timezone.utc).isoformat()
        (
            sb.table("generated_emails")
            .update({"status": "sent", "sent_at": now})
            .eq("user_id", user_id)
            .in_("lead_external_id", lead_external_ids)
            .in_("status", ["draft", "queued"])
            .execute()
        )
    except Exception:
        log.exception("mark_emails_sent failed")


def is_configured() -> bool:
    return _client() is not None
