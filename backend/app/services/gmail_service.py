"""Gmail API service — send emails via Gmail API."""
from __future__ import annotations

import base64
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Tuple

import httpx

from ..models import GeneratedEmail, Lead
from . import gmail_oauth_service

log = logging.getLogger(__name__)

GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


async def send_one(
    *,
    to_email: str,
    to_name: str,
    subject: str,
    body: str,
    user_id: str,
) -> Tuple[bool, dict]:
    """Send a single email via Gmail API."""
    try:
        # Get valid access token
        access_token = await gmail_oauth_service.get_valid_access_token(user_id)
        if not access_token:
            return False, {"error": "Gmail not connected"}

        # Get sender email from token info
        token_info = gmail_oauth_service.get_token_info(user_id)
        from_email = token_info["email"]

        # Create MIME message
        message = MIMEMultipart()
        message["To"] = f"{to_name} <{to_email}>" if to_name else to_email
        message["From"] = from_email
        message["Subject"] = subject
        message.attach(MIMEText(body, "plain"))

        # Encode message
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

        # Send via Gmail API
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GMAIL_SEND_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={"raw": raw_message},
            )
            response.raise_for_status()
            result = response.json()

        return True, {"message_id": result.get("id"), "thread_id": result.get("threadId")}

    except Exception as e:
        log.exception("Gmail send failed")
        return False, {"error": str(e)}


async def send_many(
    emails: List[GeneratedEmail],
    leads: List[Lead],
    user_id: str,
) -> Tuple[int, int, List[dict]]:
    """Send multiple emails via Gmail API."""
    # Check if user has connected Gmail
    access_token = await gmail_oauth_service.get_valid_access_token(user_id)
    if not access_token:
        return 0, len(emails), [{"error": "Gmail not connected. Please connect your Gmail account."}]

    by_id = {l.id: l for l in leads}
    sent = failed = 0
    details: List[dict] = []

    for draft in emails:
        lead = by_id.get(draft.leadId)
        if not lead or not lead.email:
            failed += 1
            details.append({"leadId": draft.leadId, "ok": False, "reason": "no email on lead"})
            continue

        ok, info = await send_one(
            to_email=lead.email,
            to_name=lead.name,
            subject=draft.subject,
            body=draft.body,
            user_id=user_id,
        )

        if ok:
            sent += 1
        else:
            failed += 1
        details.append({"leadId": draft.leadId, "ok": ok, **info})

    return sent, failed, details
