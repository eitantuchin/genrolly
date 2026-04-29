"""/api/apollo — search Apollo.io for leads and expose filter options."""
from __future__ import annotations

import logging
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_api_key
from ..config import get_settings
from ..services import apollo_service, supabase_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/apollo", tags=["apollo"])


class ApolloSearchRequest(BaseModel):
    titles: Optional[List[str]] = None
    locations: Optional[List[str]] = None
    seniorities: Optional[List[str]] = None
    industries: Optional[List[str]] = None
    employee_ranges: Optional[List[str]] = None
    keywords: Optional[str] = None
    # Client-supplied IDs/emails to exclude (already contacted)
    exclude_lead_ids: Optional[List[str]] = None
    exclude_emails: Optional[List[str]] = None
    page: int = 1
    per_page: int = 25


@router.get("/filter-options")
def filter_options(_key: str = Depends(require_api_key)):
    """Return all available filter options for the Apollo lead search."""
    return apollo_service.get_filter_options()


@router.post("/search")
async def search_leads(req: ApolloSearchRequest, user_id: str = Depends(require_api_key)):
    """
    Search Apollo for people matching the given filters.
    Automatically relaxes the least-important filters when no results are found.
    Excludes leads that have already been contacted.
    """
    settings = get_settings()
    if not settings.APOLLO_API_KEY:
        raise HTTPException(status_code=503, detail="Apollo API key not configured on the server.")

    # Merge client-supplied exclusions with server-side contacted history
    client_excluded_ids = set(req.exclude_lead_ids or [])
    server_excluded_ids = set(supabase_service.get_contacted_lead_ids(user_id))
    all_excluded_ids = list(client_excluded_ids | server_excluded_ids)

    try:
        result, relaxed_filters = await apollo_service.search_with_relaxation(
            api_key=settings.APOLLO_API_KEY,
            titles=req.titles,
            locations=req.locations,
            seniorities=req.seniorities,
            industries=req.industries,
            employee_ranges=req.employee_ranges,
            keywords=req.keywords,
            page=req.page,
            per_page=req.per_page,
            exclude_lead_ids=all_excluded_ids,
            exclude_emails=req.exclude_emails,
        )

        people = result.get("people", [])
        leads = []
        for p in people:
            org = p.get("organization") or {}
            name = (
                f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
                or p.get("name", "")
            )
            leads.append({
                "id": p.get("id", ""),
                "source": "apollo",
                "name": name,
                "headline": p.get("title", ""),
                "location": p.get("city") or p.get("state") or p.get("country") or "",
                "url": p.get("linkedin_url", ""),
                "snippet": org.get("name", ""),
                "email": p.get("email"),
            })

        pagination = result.get("pagination", {})
        return {
            "leads": leads,
            "total": pagination.get("total_entries", 0),
            "page": req.page,
            "total_pages": pagination.get("total_pages", 1),
            "relaxed_filters": relaxed_filters,
        }

    except httpx.HTTPStatusError as e:
        log.error("Apollo API HTTP error: %s", e)
        raise HTTPException(status_code=e.response.status_code, detail=f"Apollo API error: {e.response.text}")
    except Exception as e:
        log.exception("Apollo search failed")
        raise HTTPException(status_code=500, detail=str(e))
