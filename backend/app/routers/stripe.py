"""/api/stripe routes — handle Stripe webhooks and checkout."""
from __future__ import annotations

import logging
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, Request

from ..auth import require_api_key
from ..config import get_settings
from ..models import CreateCheckoutSessionRequest, CheckoutSessionResponse, SubscriptionStatusResponse
from ..services import stripe_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stripe", tags=["stripe"])

settings = get_settings()


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Handle Stripe webhook events.

    This endpoint receives events from Stripe and processes them to update
    subscription status, handle payments, etc.
    """
    if not settings.STRIPE_WEBHOOK_SECRET:
        log.error("Stripe webhook secret not configured")
        raise HTTPException(status_code=500, detail="Webhook not configured")

    # Get raw body and signature
    body = await request.body()
    signature = request.headers.get("stripe-signature")

    if not signature:
        log.error("Missing Stripe signature header")
        raise HTTPException(status_code=400, detail="Missing signature")

    # Verify webhook signature
    try:
        event = stripe_service.verify_webhook_signature(
            payload=body,
            signature=signature,
            secret=settings.STRIPE_WEBHOOK_SECRET
        )
    except HTTPException:
        raise

    # Process the event
    try:
        stripe_service.handle_subscription_event(event)
        return {"status": "ok"}
    except Exception as e:
        log.error(f"Failed to process webhook event: {e}")
        raise HTTPException(status_code=500, detail="Failed to process event")


@router.post("/create-checkout-session", response_model=CheckoutSessionResponse)
def create_checkout_session(
    request: CreateCheckoutSessionRequest,
    _user_id: str = Depends(require_api_key)
):
    """
    Create a Stripe checkout session for subscription.

    Expected request body:
    {
        "price_id": "price_xxx",
        "success_url": "https://yourapp.com/success",
        "cancel_url": "https://yourapp.com/cancel"
    }
    """
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    price_id = request.get("price_id")
    success_url = request.get("success_url")
    cancel_url = request.get("cancel_url")

    if not all([price_id, success_url, cancel_url]):
        raise HTTPException(status_code=400, detail="Missing required fields")

    try:
        session = stripe_service.create_checkout_session(
            price_id=price_id,
            user_id=_user_id,
            success_url=success_url,
            cancel_url=cancel_url
        )
        return session
    except Exception as e:
        log.error(f"Failed to create checkout session: {e}")
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


@router.get("/subscription-status", response_model=SubscriptionStatusResponse)
def get_subscription_status(_user_id: str = Depends(require_api_key)):
    """
    Get current subscription status for the user.

    Returns subscription details if active, empty dict if none.
    """
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    # For now, we'll need to store and retrieve customer_id from user data
    # This assumes you have a way to map user_id to stripe_customer_id
    # You might want to add this to your user management system

    # TODO: Implement customer ID lookup from user_id
    # For now, return empty - you'll need to implement this based on your user system
    return SubscriptionStatusResponse(
        has_subscription=False,
        status=None,
        message="Subscription status lookup not yet implemented - need to map user_id to stripe_customer_id"
    )