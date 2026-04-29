"""Configuration loaded from environment via pydantic-settings."""
from __future__ import annotations

import os
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


def get_env_file() -> str:
    """
    Determine which .env file to load based on ENV variable.
    Priority:
    1. ENV environment variable
    2. .env.development (if exists)
    3. .env (fallback)
    """
    env = os.getenv("ENV", "development")
    env_file = f".env.{env}"

    # Check if environment-specific file exists
    if os.path.exists(env_file):
        return env_file

    # Fallback to .env
    return ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=get_env_file(),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Environment
    ENV: str = "development"

    # Auth
    GENROLLY_API_KEYS: str = "dev-key"

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Apollo.io (for lead generation)
    APOLLO_API_KEY: str = ""

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # Google OAuth (Gmail API)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/auth/gmail/callback"

    # CORS
    CORS_ORIGINS: str = "*"

    @property
    def api_keys(self) -> List[str]:
        return [k.strip() for k in self.GENROLLY_API_KEYS.split(",") if k.strip()]

    @property
    def cors_origins(self) -> List[str]:
        if self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.ENV == "development"

    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return self.ENV == "production"

    def validate_config(self) -> List[str]:
        """Validate critical configuration and return list of errors."""
        errors = []

        if not self.OPENAI_API_KEY:
            errors.append("OPENAI_API_KEY is required")

        if not self.GOOGLE_CLIENT_ID or not self.GOOGLE_CLIENT_SECRET:
            errors.append("Google OAuth credentials are required")

        if not self.SUPABASE_URL or not self.SUPABASE_SERVICE_ROLE_KEY:
            errors.append("Supabase configuration is required")

        if self.is_production:
            if self.CORS_ORIGINS == "*":
                errors.append("CORS_ORIGINS should be restricted in production")

            if "dev-key" in self.GENROLLY_API_KEYS.lower():
                errors.append("Production should not use dev API keys")

        return errors


@lru_cache
def get_settings() -> Settings:
    return Settings()
