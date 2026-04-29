"""Pydantic request/response models shared across routers."""
from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field


class Lead(BaseModel):
    id: str
    source: str = Field(..., description="apollo | reddit | twitter | manual")
    name: str
    headline: Optional[str] = ""
    location: Optional[str] = ""
    url: Optional[str] = ""
    snippet: Optional[str] = ""
    email: Optional[EmailStr] = None


class EmailTemplate(BaseModel):
    custom_subject: Optional[str] = None
    custom_message: Optional[str] = None
    image_urls: Optional[List[str]] = []


class GenerateEmailsRequest(BaseModel):
    niche: str = Field(..., description="Course niche, e.g. 'beginner Python for analysts'")
    leads: List[Lead]
    tone: str = "friendly, concise"
    course_name: Optional[str] = None
    cta_url: Optional[str] = None
    template: Optional[EmailTemplate] = None


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


class HealthResponse(BaseModel):
    status: str = "ok"
    environment: Optional[str] = None
    services: dict = {}


class CreateCheckoutSessionRequest(BaseModel):
    price_id: str
    success_url: str
    cancel_url: str


class CheckoutSessionResponse(BaseModel):
    session_id: str
    url: str


class SubscriptionStatusResponse(BaseModel):
    has_subscription: bool
    status: Optional[str] = None
    current_period_end: Optional[int] = None
    plan: Optional[str] = None
    message: Optional[str] = None
