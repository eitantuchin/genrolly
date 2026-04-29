"""OpenAI wrapper — generates personalized cold-email drafts."""
from __future__ import annotations

import json
import logging
from typing import List, Optional

from openai import OpenAI

from ..config import get_settings
from ..models import EmailTemplate, GeneratedEmail, Lead

log = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are an expert cold-email copywriter for online course creators.
You write short (under 90 words), personalized outreach that:
- Opens with a specific reference to something the lead said or does (no generic flattery).
- Names a concrete pain point a beginner in the niche would feel.
- Pitches the course in one sentence with a clear value prop.
- Ends with a soft CTA — a question or a single link, never pushy.

Hard rules:
- Never invent facts about the lead. If you have nothing specific, keep the opener generic and honest.
- No emojis, no exclamation marks, no "I hope this finds you well".
- Output strictly the JSON the caller asks for.
"""


def _client() -> OpenAI | None:
    s = get_settings()
    if not s.OPENAI_API_KEY:
        return None
    return OpenAI(api_key=s.OPENAI_API_KEY)


def _fallback_draft(lead: Lead, niche: str) -> GeneratedEmail:
    """Used when OPENAI_API_KEY isn't set yet — lets you wire the UI without a key."""
    subject = f"Quick thought on {niche}"
    body = (
        f"Hi {lead.name.split()[0] if lead.name else 'there'},\n\n"
        f"Saw your activity around {niche.lower()} and wanted to share a short course "
        f"I built for people at exactly that stage.\n\n"
        f"Worth a look?\n"
    )
    return GeneratedEmail(leadId=lead.id, subject=subject, body=body, status="draft")


def generate_emails(
    leads: List[Lead],
    niche: str,
    tone: str = "friendly, concise",
    course_name: str | None = None,
    cta_url: str | None = None,
    template: Optional[EmailTemplate] = None,
) -> List[GeneratedEmail]:
    client = _client()
    if client is None:
        log.warning("OPENAI_API_KEY missing — returning template fallback drafts.")
        return [_fallback_draft(l, niche) for l in leads]

    s = get_settings()
    out: List[GeneratedEmail] = []

    for lead in leads:
        # Use custom subject if provided
        if template and template.custom_subject:
            subject = template.custom_subject
        else:
            # Generate subject using OpenAI
            user_prompt = json.dumps({
                "lead": lead.dict(),
                "course": {
                    "niche": niche,
                    "name": course_name,
                    "tone": tone,
                },
                "instructions": "Return JSON: {\"subject\": string} - a short email subject line.",
            })
            try:
                resp = client.chat.completions.create(
                    model=s.OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": "You write concise subject lines for cold emails."},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.7,
                )
                payload = json.loads(resp.choices[0].message.content or "{}")
                subject = payload.get("subject", f"Quick thought on {niche}")
            except Exception as e:
                log.exception("Failed to generate subject for lead %s", lead.id)
                subject = f"Quick thought on {niche}"

        # Use custom message if provided
        if template and template.custom_message:
            body = template.custom_message
        else:
            # Generate body using OpenAI
            user_prompt = json.dumps(
                {
                    "lead": {
                        "name": lead.name,
                        "headline": lead.headline,
                        "source": lead.source,
                        "snippet": lead.snippet,
                        "url": lead.url,
                    },
                    "course": {
                        "niche": niche,
                        "name": course_name,
                        "cta_url": cta_url,
                        "tone": tone,
                    },
                    "instructions": "Return JSON: {\"body\": string}. Write a personalized cold email body (max 90 words).",
                }
            )
            try:
                resp = client.chat.completions.create(
                    model=s.OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.7,
                )
                payload = json.loads(resp.choices[0].message.content or "{}")
                body = payload.get("body", "")
            except Exception as e:
                log.exception("OpenAI generate failed for lead %s", lead.id)
                body = _fallback_draft(lead, niche).body

        out.append(
            GeneratedEmail(
                leadId=lead.id,
                subject=subject,
                body=body,
                status="draft",
            )
        )

    return out
