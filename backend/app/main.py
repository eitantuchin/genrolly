"""Genrolly FastAPI app — entrypoint for local dev and Railway deploys."""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .config import get_settings
from .models import HealthResponse
from .routers import apollo as apollo_router
from .routers import emails as emails_router
from .routers import leads as leads_router
from .routers import oauth as oauth_router
from .routers import stripe as stripe_router
from .services import stripe_service, supabase_service

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

settings = get_settings()

# Log environment and validate config on startup
log.info(f"🚀 Starting Genrolly API in {settings.ENV.upper()} mode")
log.info(f"📄 Loaded config from: {settings.model_config.get('env_file', '.env')}")

config_errors = settings.validate_config()
if config_errors:
    log.warning("⚠️  Configuration warnings:")
    for error in config_errors:
        log.warning(f"  - {error}")

# Initialize external services
stripe_service.init_stripe()

app = FastAPI(
    title="Genrolly API",
    version="0.1.0",
    debug=settings.is_development
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(apollo_router.router)
app.include_router(emails_router.router)
app.include_router(leads_router.router)
app.include_router(oauth_router.router)
app.include_router(stripe_router.router)


@app.get("/", tags=["meta"])
def root():
    return {"name": "Genrolly API", "version": "0.1.0", "docs": "/docs"}


@app.get("/oauth-success.html", tags=["meta"])
def oauth_success():
    """Serve OAuth success page."""
    html_path = Path(__file__).parent.parent / "oauth-success.html"
    return FileResponse(html_path)


@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health():
    return HealthResponse(
        status="ok",
        environment=settings.ENV,
        services={
            "openai": bool(settings.OPENAI_API_KEY),
            "apollo": bool(settings.APOLLO_API_KEY),
            "gmail_oauth": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET),
            "supabase": supabase_service.is_configured(),
            "stripe": bool(settings.STRIPE_SECRET_KEY),
        },
    )
