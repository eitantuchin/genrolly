"""Genrolly FastAPI app — entrypoint for local dev and Railway deploys."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .models import HealthResponse
from .routers import emails as emails_router
from .routers import leads as leads_router
from .services import supabase_service

logging.basicConfig(level=logging.INFO)

settings = get_settings()
app = FastAPI(title="Genrolly API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(emails_router.router)
app.include_router(leads_router.router)


@app.get("/", tags=["meta"])
def root():
    return {"name": "Genrolly API", "version": "0.1.0", "docs": "/docs"}


@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health():
    return HealthResponse(
        status="ok",
        services={
            "openai": bool(settings.OPENAI_API_KEY),
            "resend": bool(settings.RESEND_API_KEY),
            "supabase": supabase_service.is_configured(),
            "youtube": bool(settings.YOUTUBE_API_KEY),
            "stripe": bool(settings.STRIPE_SECRET_KEY),
        },
    )
