"""/api/leads routes — persist leads and expose contacted-ID list for deduplication."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import require_api_key
from ..models import Lead
from ..services import supabase_service

router = APIRouter(prefix="/api/leads", tags=["leads"])


class IngestRequest(BaseModel):
    leads: List[Lead]


class IngestResponse(BaseModel):
    count: int


class ContactedIdsResponse(BaseModel):
    ids: List[str]


@router.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest, key: str = Depends(require_api_key)):
    count = (
        supabase_service.upsert_leads(user_id=key, leads=req.leads)
        if supabase_service.is_configured()
        else len(req.leads)
    )
    return IngestResponse(count=count)


@router.get("/contacted-ids", response_model=ContactedIdsResponse)
def contacted_ids(user_id: str = Depends(require_api_key)):
    """Return all lead external IDs that have already been emailed for this user.
    The extension uses this on startup to seed its local deduplication set."""
    ids = supabase_service.get_contacted_lead_ids(user_id) if supabase_service.is_configured() else []
    return ContactedIdsResponse(ids=ids)
