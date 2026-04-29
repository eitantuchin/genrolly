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
    # Best-effort persistence; ignored if Supabase isn't configured yet.
    if supabase_service.is_configured():
        supabase_service.insert_emails(user_id=_key, emails=drafts)
    return GenerateEmailsResponse(emails=drafts)


@router.post("/send", response_model=SendEmailsResponse)
async def send(req: SendEmailsRequest, user_id: str = Depends(require_api_key)):
    """
    Send emails via Gmail API.
    User must have connected their Gmail account via OAuth first.
    """
    sent, failed, details = await gmail_service.send_many(
        emails=req.emails,
        leads=req.leads,
        user_id=user_id,
    )
    return SendEmailsResponse(sent=sent, failed=failed, details=details)
