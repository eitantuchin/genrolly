"""/api/leads routes — persist leads collected by the extension and pull from server-side sources."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import require_api_key
from ..models import Lead, YouTubeFetchRequest
from ..services import supabase_service, youtube_service

router = APIRouter(prefix="/api/leads", tags=["leads"])


class IngestRequest(BaseModel):
    leads: List[Lead]


class IngestResponse(BaseModel):
    count: int


@router.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest, key: str = Depends(require_api_key)):
    count = supabase_service.upsert_leads(user_id=key, leads=req.leads) if supabase_service.is_configured() else len(req.leads)
    return IngestResponse(count=count)


@router.post("/youtube", response_model=List[Lead])
def fetch_youtube(req: YouTubeFetchRequest, _key: str = Depends(require_api_key)):
    return youtube_service.fetch_video_comments(req.video_id, req.max_results)
