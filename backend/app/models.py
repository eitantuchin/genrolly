"""Pydantic request/response models shared across routers."""
from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field


class Lead(BaseModel):
    id: str
    source: str = Field(..., description="linkedin | youtube | reddit | twitter")
    name: str
    headline: Optional[str] = ""
    location: Optional[str] = ""
    url: Optional[str] = ""
    snippet: Optional[str] = ""
    email: Optional[EmailStr] = None


class GenerateEmailsRequest(BaseModel):
    niche: str = Field(..., description="Course niche, e.g. 'beginner Python for analysts'")
    leads: List[Lead]
    tone: str = "friendly, concise"
    course_name: Optional[str] = None
    cta_url: Optional[str] = None


class GeneratedEmail(BaseModel):
    leadId: str
    subject: str
    body: str
    status: str = "draft"


class GenerateEmailsResponse(BaseModel):
    emails: List[GeneratedEmail]


class SendEmailsRequest(BaseModel):
    emails: List[GeneratedEmail]
    leads: List[Lead]
    from_email: Optional[EmailStr] = None
    from_name: Optional[str] = None


class SendEmailsResponse(BaseModel):
    sent: int
    failed: int
    details: List[dict] = []


class YouTubeFetchRequest(BaseModel):
    video_id: str
    max_results: int = 100


class HealthResponse(BaseModel):
    status: str = "ok"
    services: dict
