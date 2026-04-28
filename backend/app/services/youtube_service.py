"""YouTube Data API wrapper — pull comments server-side using the official API."""
from __future__ import annotations

import logging
from typing import List

from googleapiclient.discovery import build

from ..config import get_settings
from ..models import Lead

log = logging.getLogger(__name__)


def fetch_video_comments(video_id: str, max_results: int = 100) -> List[Lead]:
    s = get_settings()
    if not s.YOUTUBE_API_KEY:
        log.warning("YOUTUBE_API_KEY not configured — returning empty list.")
        return []

    yt = build("youtube", "v3", developerKey=s.YOUTUBE_API_KEY, cache_discovery=False)
    leads: List[Lead] = []
    next_token: str | None = None
    fetched = 0

    while fetched < max_results:
        req = yt.commentThreads().list(
            part="snippet",
            videoId=video_id,
            maxResults=min(100, max_results - fetched),
            pageToken=next_token,
            textFormat="plainText",
            order="relevance",
        )
        res = req.execute()
        for item in res.get("items", []):
            top = item["snippet"]["topLevelComment"]["snippet"]
            author = top.get("authorDisplayName", "")
            text = top.get("textDisplay", "")
            channel_url = top.get("authorChannelUrl", "")
            if not author or not text:
                continue
            leads.append(
                Lead(
                    id=item["id"],
                    source="youtube",
                    name=author,
                    headline="YouTube commenter",
                    url=channel_url,
                    snippet=text[:600],
                )
            )
            fetched += 1
            if fetched >= max_results:
                break
        next_token = res.get("nextPageToken")
        if not next_token:
            break

    return leads
