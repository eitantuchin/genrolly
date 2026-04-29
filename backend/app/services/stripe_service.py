"""Stripe service — handle webhooks and subscription management."""
from __future__ import annotations

import json
import logging
from typing import Dict, Optional

import stripe
from fastapi import HTTPException

from ..config import get_settings

log = logging.getLogger(__name__)

settings = get_settings()


def init_stripe():
    """Initialize Stripe with API key."""
    if settings.STRIPE_SECRET_KEY:
        stripe.api_key = settings.STRIPE_SECRET_KEY


def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> Dict:
    """
    Verify Stripe webhook signature and return the event data.

    Args:
        payload: Raw request body
        signature: Stripe-Signature header
        secret: Webhook endpoint secret

    Returns:
        Parsed event data

    Raises:
        HTTPException: If signature verification fails
    """
    try:
        event = stripe.Webhook.construct_event(payload, signature, secret)
        return event
    except ValueError as e:
        log.error(f"Invalid webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        log.error(f"Webhook signature verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_subscription_event(event: Dict) -> None:
    """
    Handle subscription-related webhook events.

    Updates the subscriptions table in Supabase based on Stripe events.
    """
    event_type = event.get("type")
    data = event.get("data", {}).get("object", {})

    log.info(f"Processing Stripe event: {event_type}")

    if event_type == "customer.subscription.created":
        _handle_subscription_created(data)
    elif event_type == "customer.subscription.updated":
        _handle_subscription_updated(data)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(data)
    elif event_type == "invoice.payment_succeeded":
        _handle_payment_succeeded(data)
    elif event_type == "invoice.payment_failed":
        _handle_payment_failed(data)
    else:
        log.info(f"Ignored event type: {event_type}")


def _handle_subscription_created(subscription: Dict) -> None:
    """Handle new subscription creation."""
    customer_id = subscription.get("customer")
    subscription_id = subscription.get("id")
    status = subscription.get("status")
    current_period_end = subscription.get("current_period_end")

    # Update or insert subscription record
    _update_subscription_record(
        customer_id=customer_id,
        subscription_id=subscription_id,
        status=status,
        current_period_end=current_period_end,
    )

    log.info(f"Created subscription {subscription_id} for customer {customer_id}")


def _handle_subscription_updated(subscription: Dict) -> None:
    """Handle subscription updates (plan changes, etc.)."""
    customer_id = subscription.get("customer")
    subscription_id = subscription.get("id")
    status = subscription.get("status")
    current_period_end = subscription.get("current_period_end")

    _update_subscription_record(
        customer_id=customer_id,
        subscription_id=subscription_id,
        status=status,
        current_period_end=current_period_end,
    )

    log.info(f"Updated subscription {subscription_id} for customer {customer_id}")


def _handle_subscription_deleted(subscription: Dict) -> None:
    """Handle subscription cancellation/deletion."""
    customer_id = subscription.get("customer")
    subscription_id = subscription.get("id")

    _update_subscription_record(
        customer_id=customer_id,
        subscription_id=subscription_id,
        status="canceled",
        current_period_end=None,
    )

    log.info(f"Deleted subscription {subscription_id} for customer {customer_id}")


def _handle_payment_succeeded(invoice: Dict) -> None:
    """Handle successful payment."""
    customer_id = invoice.get("customer")
    subscription_id = invoice.get("subscription")

    if subscription_id:
        # Update subscription status to active if payment succeeded
        _update_subscription_record(
            customer_id=customer_id,
            subscription_id=subscription_id,
            status="active",
        )

    log.info(f"Payment succeeded for customer {customer_id}")


def _handle_payment_failed(invoice: Dict) -> None:
    """Handle failed payment."""
    customer_id = invoice.get("customer")
    subscription_id = invoice.get("subscription")

    if subscription_id:
        # Could update subscription status or send warning emails
        log.warning(f"Payment failed for customer {customer_id}, subscription {subscription_id}")

    # TODO: Send payment failure notification email


def _update_subscription_record(
    customer_id: str,
    subscription_id: str,
    status: str,
    current_period_end: Optional[int] = None,
) -> None:
    """Update subscription record in Supabase."""
    from . import supabase_service

    sb = supabase_service._client()
    if sb is None:
        log.error("Supabase not configured, cannot update subscription")
        return

    # Convert timestamp to datetime if provided
    period_end = None
    if current_period_end:
        from datetime import datetime
        period_end = datetime.fromtimestamp(current_period_end)

    # Upsert subscription record
    data = {
        "user_id": customer_id,  # Using customer_id as user_id for now
        "stripe_customer_id": customer_id,
        "stripe_sub_id": subscription_id,
        "status": status,
        "current_period_end": period_end.isoformat() if period_end else None,
    }

    try:
        sb.table("subscriptions").upsert(data).execute()
        log.info(f"Updated subscription record for customer {customer_id}")
    except Exception as e:
        log.error(f"Failed to update subscription record: {e}")


def create_checkout_session(price_id: str, user_id: str, success_url: str, cancel_url: str) -> Dict:
    """
    Create a Stripe checkout session for subscription.

    Args:
        price_id: Stripe price ID
        user_id: User identifier
        success_url: URL to redirect on success
        cancel_url: URL to redirect on cancel

    Returns:
        Checkout session data
    """
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=user_id,
            metadata={"user_id": user_id},
        )
        return {"session_id": session.id, "url": session.url}
    except Exception as e:
        log.error(f"Failed to create checkout session: {e}")
        raise HTTPException(status_code=400, detail="Failed to create checkout session")


def get_customer_subscriptions(customer_id: str) -> Dict:
    """Get subscription details for a customer."""
    try:
        subscriptions = stripe.Subscription.list(customer=customer_id, limit=1)
        if subscriptions.data:
            sub = subscriptions.data[0]
            return {
                "id": sub.id,
                "status": sub.status,
                "current_period_end": sub.current_period_end,
                "plan": sub.items.data[0].price.nickname if sub.items.data else None,
            }
        return {}
    except Exception as e:
        log.error(f"Failed to get customer subscriptions: {e}")
        return {}