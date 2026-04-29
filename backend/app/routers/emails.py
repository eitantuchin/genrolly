"""/api/emails routes — generate drafts and send via Gmail API."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import require_api_key
from ..models import (
    GenerateEmailsRequest,
    GenerateEmailsResponse,
    SendEmailsRequest,
    SendEmailsResponse,
)
from ..services import gmail_service, openai_service, supabase_service

router = APIRouter(prefix="/api/emails", tags=["emails"])


@router.post("/generate", response_model=GenerateEmailsResponse)
def generate(req: GenerateEmailsRequest, _key: str = Depends(require_api_key)):
    drafts = openai_service.generate_emails(
        leads=req.leads,
        niche=req.niche,
        tone=req.tone,
        course_name=req.course_name,
        cta_url=req.cta_url,
    )
    if supabase_service.is_configured():
        supabase_service.insert_emails(user_id=_key, emails=drafts)
    return GenerateEmailsResponse(emails=drafts)


@router.post("/send", response_model=SendEmailsResponse)
async def send(req: SendEmailsRequest, user_id: str = Depends(require_api_key)):
    """Send emails via Gmail API and mark successfully sent leads so they are
    excluded from future Apollo searches for this user."""
    sent_count, failed_count, details = await gmail_service.send_many(
        emails=req.emails,
        leads=req.leads,
        user_id=user_id,
    )

    # Mark the successfully sent leads in Supabase so they're never emailed again
    if supabase_service.is_configured() and sent_count > 0:
        sent_lead_ids = [d["leadId"] for d in details if d.get("ok")]
        supabase_service.mark_emails_sent(user_id=user_id, lead_external_ids=sent_lead_ids)

    return SendEmailsResponse(sent=sent_count, failed=failed_count, details=details)
