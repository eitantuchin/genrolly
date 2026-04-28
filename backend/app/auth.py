"""Simple x-api-key auth dependency."""
from fastapi import Header, HTTPException, status

from .config import get_settings


def require_api_key(x_api_key: str | None = Header(default=None)) -> str:
    settings = get_settings()
    keys = settings.api_keys
    if not keys:
        # Misconfigured server: refuse rather than allow-all.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server has no GENROLLY_API_KEYS configured.",
        )
    if not x_api_key or x_api_key not in keys:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing x-api-key header.",
        )
    return x_api_key
