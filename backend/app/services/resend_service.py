"""Resend wrapper — actually sends the cold emails."""
from __future__ import annotations

import logging
from typing import List, Tuple

import resend

from ..config import get_settings
from ..models import GeneratedEmail, Lead

log = logging.getLogger(__name__)


def _configure() -> bool:
    s = get_settings()
    if not s.RESEND_API_KEY:
        return False
    resend.api_key = s.RESEND_API_KEY
    return True


def send_one(
    *,
    to_email: str,
    to_name: str,
    subject: str,
    body: str,
    from_email: str,
    from_name: str,
) -> Tuple[bool, dict]:
    if not _configure():
        return False, {"error": "RESEND_API_KEY not configured"}
    try:
        params: resend.Emails.SendParams = {
            "from": f"{from_name} <{from_email}>",
            "to": [f"{to_name} <{to_email}>" if to_name else to_email],
            "subject": subject,
            "text": body,
        }
        result = resend.Emails.send(params)
        return True, {"id": result.get("id")}
    except Exception as e:
        log.exception("Resend send failed")
        return False, {"error": str(e)}


def send_many(
    emails: List[GeneratedEmail],
    leads: List[Lead],
    from_email: str | None = None,
    from_name: str | None = None,
) -> Tuple[int, int, List[dict]]:
    s = get_settings()
    fe = from_email or s.RESEND_FROM_EMAIL
    fn = from_name or s.RESEND_FROM_NAME
    if not fe:
        return 0, len(emails), [{"error": "No from_email configured."}]

    by_id = {l.id: l for l in leads}
    sent = failed = 0
    details: List[dict] = []

    for draft in emails:
        lead = by_id.get(draft.leadId)
        if not lead or not lead.email:
            failed += 1
            details.append({"leadId": draft.leadId, "ok": False, "reason": "no email on lead"})
            continue
        ok, info = send_one(
            to_email=lead.email,
            to_name=lead.name,
            subject=draft.subject,
            body=draft.body,
            from_email=fe,
            from_name=fn,
        )
        if ok:
            sent += 1
        else:
            failed += 1
        details.append({"leadId": draft.leadId, "ok": ok, **info})

    return sent, failed, details
