"""
Scheduler service — manage rate-limited Apollo API search jobs.
Runs 6x/day for Pro users, 12x/day for Premium users, spread throughout the day.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..config import get_settings
from ..models import Lead
from . import apollo_service, supabase_service

log = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def _get_rate_limit_status(user_id: str) -> dict[str, int]:
    """Get today's API call count and limit for user."""
    supabase = supabase_service.get_client()
    if not supabase:
        return {"used": 0, "limit": 0}

    result = (
        supabase.table("apollo_rate_limits")
        .select("*")
        .eq("user_id", user_id)
        .eq("date", datetime.utcnow().date().isoformat())
        .maybe_single()
        .execute()
    )

    if result.data:
        return {
            "used": result.data.get("api_calls_used", 0),
            "limit": result.data.get("daily_limit", 0),
        }
    return {"used": 0, "limit": 0}


def _record_api_call(user_id: str, limit: int) -> None:
    """Record an API call for today."""
    supabase = supabase_service.get_client()
    if not supabase:
        return

    today = datetime.utcnow().date().isoformat()
    result = (
        supabase.table("apollo_rate_limits")
        .select("*")
        .eq("user_id", user_id)
        .eq("date", today)
        .maybe_single()
        .execute()
    )

    if result.data:
        # Update existing record
        supabase.table("apollo_rate_limits").update({
            "api_calls_used": result.data["api_calls_used"] + 1,
        }).eq("user_id", user_id).eq("date", today).execute()
    else:
        # Create new record
        supabase.table("apollo_rate_limits").insert({
            "user_id": user_id,
            "date": today,
            "daily_limit": limit,
            "api_calls_used": 1,
        }).execute()


async def _run_apollo_search_job(user_id: str, search_config: dict) -> None:
    """
    Run a single Apollo search job for a user.
    Stores results in apollo_search_history table.
    """
    settings = get_settings()
    if not settings.APOLLO_API_KEY:
        log.warning("Apollo API key not configured")
        return

    # Get user's subscription tier to determine rate limit
    supabase = supabase_service.get_client()
    if not supabase:
        return

    sub_result = (
        supabase.table("subscriptions")
        .select("plan")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )

    plan = sub_result.data.get("plan") if sub_result.data else "free"
    daily_limit = 12 if plan == "premium" else (6 if plan == "pro" else 0)

    if daily_limit == 0:
        log.info("User %s has no API quota", user_id)
        return

    # Check rate limit
    status = _get_rate_limit_status(user_id)
    if status["used"] >= daily_limit:
        log.info("User %s has exhausted daily quota (%d/%d)", user_id, status["used"], daily_limit)
        return

    try:
        # Run the search + enrich
        leads = await apollo_service.search_and_enrich_leads(
            api_key=settings.APOLLO_API_KEY,
            titles=search_config.get("titles"),
            locations=search_config.get("locations"),
            seniorities=search_config.get("seniorities"),
            industries=search_config.get("industries"),
            employee_ranges=search_config.get("employee_ranges"),
            keywords=search_config.get("keywords"),
            per_page=search_config.get("per_page", 10),
        )

        if leads:
            # Store results in database
            for lead_data in leads:
                lead = Lead(**lead_data)
                supabase.table("leads").upsert({
                    "user_id": user_id,
                    "external_id": lead.id,
                    "source": "apollo",
                    "name": lead.name,
                    "headline": lead.headline,
                    "location": lead.location,
                    "url": lead.url,
                    "email": lead.email,
                    "snippet": lead.snippet,
                }).execute()

            log.info("Apollo search found %d leads for user %s", len(leads), user_id)

        # Record the API call
        _record_api_call(user_id, daily_limit)

    except Exception as e:
        log.error("Apollo search job failed for user %s: %s", user_id, e)


def register_apollo_job(user_id: str, search_config: dict, tier: str = "pro") -> None:
    """
    Register a recurring Apollo search job for a user.
    tier: "pro" (6x/day) or "premium" (12x/day)
    """
    if not scheduler.running:
        scheduler.start()

    # Calculate cron expressions for spreading calls throughout day
    if tier == "premium":
        # 12 calls throughout the day: every 2 hours starting at midnight
        hours = "0,2,4,6,8,10,12,14,16,18,20,22"
        cron_expr = f"0 {hours} * * *"  # Midnight, 2am, 4am, ...
    else:
        # 6 calls throughout the day: every 4 hours starting at midnight
        hours = "0,4,8,12,16,20"
        cron_expr = f"0 {hours} * * *"  # Midnight, 4am, 8am, ...

    job_id = f"apollo_search_{user_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    scheduler.add_job(
        _run_apollo_search_job,
        CronTrigger.from_crontab(cron_expr),
        args=[user_id, search_config],
        id=job_id,
        name=f"Apollo search for {user_id}",
        replace_existing=True,
    )

    log.info("Registered Apollo search job for user %s (tier=%s)", user_id, tier)


def start_scheduler() -> None:
    """Start the background scheduler."""
    if not scheduler.running:
        scheduler.start()
        log.info("Scheduler started")


def stop_scheduler() -> None:
    """Stop the background scheduler."""
    if scheduler.running:
        scheduler.shutdown()
        log.info("Scheduler stopped")
