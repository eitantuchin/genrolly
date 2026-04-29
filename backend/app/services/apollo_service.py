"""Apollo.io people search integration for lead generation."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import httpx

log = logging.getLogger(__name__)

APOLLO_BASE = "https://api.apollo.io/v1"

# Most important → least important. Relaxation removes from the END first.
FILTER_PRIORITY = [
    "titles",           # 1 – who we're targeting (most important)
    "industries",       # 2 – what sector
    "seniorities",      # 3 – career level
    "locations",        # 4 – geography
    "employee_ranges",  # 5 – company size (least important)
]
RELAXATION_ORDER = list(reversed(FILTER_PRIORITY))  # least → most important

SENIORITY_OPTIONS = [
    {"value": "owner", "label": "Owner"},
    {"value": "founder", "label": "Founder"},
    {"value": "c_suite", "label": "C-Suite"},
    {"value": "partner", "label": "Partner"},
    {"value": "vp", "label": "VP"},
    {"value": "head", "label": "Head"},
    {"value": "director", "label": "Director"},
    {"value": "manager", "label": "Manager"},
    {"value": "senior", "label": "Senior"},
    {"value": "entry", "label": "Entry Level"},
]

EMPLOYEE_RANGE_OPTIONS = [
    {"value": "1,10", "label": "1–10"},
    {"value": "11,50", "label": "11–50"},
    {"value": "51,200", "label": "51–200"},
    {"value": "201,500", "label": "201–500"},
    {"value": "501,1000", "label": "501–1,000"},
    {"value": "1001,2000", "label": "1,001–2,000"},
    {"value": "2001,5000", "label": "2,001–5,000"},
    {"value": "5001,10000", "label": "5,001–10,000"},
    {"value": "10001,99999999", "label": "10,000+"},
]

INDUSTRY_OPTIONS = [
    "Marketing & Advertising",
    "E-Learning",
    "Education Management",
    "Professional Training & Coaching",
    "Information Technology and Services",
    "Computer Software",
    "Internet",
    "Online Media",
    "Financial Services",
    "Management Consulting",
    "Health, Wellness and Fitness",
    "Real Estate",
    "Human Resources",
    "Media Production",
    "Retail",
    "Consumer Goods",
    "Hospitality",
    "Non-profit Organization Management",
    "Publishing",
    "Design",
    "Arts and Crafts",
    "Photography",
    "Accounting",
    "Legal Services",
    "Architecture & Planning",
    "Staffing and Recruiting",
    "Business Supplies and Equipment",
    "Construction",
    "Entertainment",
    "Sports",
    "Automotive",
    "Food & Beverages",
    "Cosmetics",
    "Fashion",
    "Music",
]

POPULAR_JOB_TITLES = [
    "Marketing Manager",
    "Content Creator",
    "Entrepreneur",
    "Founder",
    "CEO",
    "Business Coach",
    "Consultant",
    "Course Creator",
    "Business Owner",
    "Digital Marketer",
    "Social Media Manager",
    "Product Manager",
    "Sales Manager",
    "Account Executive",
    "Director of Marketing",
    "Head of Growth",
    "E-Commerce Manager",
    "Freelancer",
    "Creative Director",
    "HR Manager",
]


def get_filter_options() -> Dict[str, Any]:
    return {
        "seniorities": SENIORITY_OPTIONS,
        "employee_ranges": EMPLOYEE_RANGE_OPTIONS,
        "industries": INDUSTRY_OPTIONS,
        "popular_titles": POPULAR_JOB_TITLES,
        "filter_priority": FILTER_PRIORITY,
    }


async def _call_apollo(
    api_key: str,
    titles: Optional[List[str]],
    locations: Optional[List[str]],
    seniorities: Optional[List[str]],
    industries: Optional[List[str]],
    employee_ranges: Optional[List[str]],
    keywords: Optional[str],
    page: int,
    per_page: int,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "page": page,
        "per_page": min(per_page, 100),
        "contact_email_status": ["verified", "likely to engage"],
    }
    if titles:
        payload["person_titles"] = titles
    if locations:
        payload["person_locations"] = locations
    if seniorities:
        payload["person_seniorities"] = seniorities
    if industries:
        payload["q_organization_industry_tag_values"] = industries
    if employee_ranges:
        payload["organization_num_employees_ranges"] = employee_ranges
    if keywords:
        payload["q_keywords"] = keywords

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{APOLLO_BASE}/mixed_people/search",
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-Api-Key": api_key,
                "Cache-Control": "no-cache",
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()


async def search_with_relaxation(
    api_key: str,
    titles: Optional[List[str]] = None,
    locations: Optional[List[str]] = None,
    seniorities: Optional[List[str]] = None,
    industries: Optional[List[str]] = None,
    employee_ranges: Optional[List[str]] = None,
    keywords: Optional[str] = None,
    page: int = 1,
    per_page: int = 25,
    exclude_lead_ids: Optional[List[str]] = None,
    exclude_emails: Optional[List[str]] = None,
) -> Tuple[Dict[str, Any], List[str]]:
    """
    Search Apollo, automatically relaxing filters (least important first) when
    no results are returned. Returns (result_dict, list_of_relaxed_filter_names).
    """
    exclude_ids_set = set(exclude_lead_ids or [])
    exclude_emails_set = {e.lower() for e in (exclude_emails or [])}

    # Request extra rows to compensate for excluded leads
    fetch_size = min(per_page + len(exclude_ids_set), 100)

    active = {
        "titles": titles,
        "locations": locations,
        "seniorities": seniorities,
        "industries": industries,
        "employee_ranges": employee_ranges,
    }
    relaxed: List[str] = []

    result = await _call_apollo(api_key, keywords=keywords, page=page, per_page=fetch_size, **active)

    if _total(result) == 0:
        for filter_name in RELAXATION_ORDER:
            if active[filter_name]:
                relaxed.append(filter_name)
                active[filter_name] = None
                log.info("Apollo: zero results — relaxing filter '%s'", filter_name)
                result = await _call_apollo(api_key, keywords=keywords, page=page, per_page=fetch_size, **active)
                if _total(result) > 0:
                    break

    # Remove already-contacted leads from the result set
    people = [
        p for p in result.get("people", [])
        if p.get("id") not in exclude_ids_set
        and (not p.get("email") or p["email"].lower() not in exclude_emails_set)
    ]
    result["people"] = people[:per_page]

    return result, relaxed


def _total(result: Dict[str, Any]) -> int:
    return result.get("pagination", {}).get("total_entries", 0)


async def get_email_for_person(
    api_key: str,
    person_id: str,
    name: Optional[str] = None,
    title: Optional[str] = None,
    organization_name: Optional[str] = None,
    domain: Optional[str] = None,
) -> Optional[str]:
    """
    Use the match/enrich endpoint to get email for a specific person.
    Returns email if found, None if not.
    """
    payload: Dict[str, Any] = {}
    if name:
        payload["first_name"] = name.split()[0] if name else None
        payload["last_name"] = " ".join(name.split()[1:]) if len(name.split()) > 1 else None
    if title:
        payload["title"] = title
    if organization_name:
        payload["organization_name"] = organization_name
    if domain:
        payload["domain"] = domain

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{APOLLO_BASE}/people/match",
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Api-Key": api_key,
                    "Cache-Control": "no-cache",
                },
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("person", {}).get("email")
        except Exception as e:
            log.error(f"Failed to get email via match endpoint: {e}")
            return None


async def search_and_enrich_leads(
    api_key: str,
    titles: Optional[List[str]] = None,
    locations: Optional[List[str]] = None,
    seniorities: Optional[List[str]] = None,
    industries: Optional[List[str]] = None,
    employee_ranges: Optional[List[str]] = None,
    keywords: Optional[str] = None,
    page: int = 1,
    per_page: int = 10,
    exclude_lead_ids: Optional[List[str]] = None,
    exclude_emails: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Search for leads, then try to enrich each with an email using the match endpoint.
    If a match fails, try the next person in the result set.
    Returns list of enriched leads with emails.
    """
    result, relaxed = await search_with_relaxation(
        api_key=api_key,
        titles=titles,
        locations=locations,
        seniorities=seniorities,
        industries=industries,
        employee_ranges=employee_ranges,
        keywords=keywords,
        page=page,
        per_page=per_page,
        exclude_lead_ids=exclude_lead_ids,
        exclude_emails=exclude_emails,
    )

    people = result.get("people", [])
    enriched = []

    for person in people:
        email = person.get("email")  # May already have email from search
        if not email:
            # Try to get email via match endpoint
            email = await get_email_for_person(
                api_key=api_key,
                person_id=person.get("id"),
                name=person.get("name"),
                title=person.get("title"),
                organization_name=person.get("organization_name"),
                domain=person.get("organization_domain"),
            )

        if email:
            enriched.append({
                "id": person.get("id"),
                "name": person.get("name"),
                "headline": person.get("title"),
                "location": person.get("city"),
                "url": person.get("linkedin_url"),
                "email": email,
                "source": "apollo",
                "snippet": f"{person.get('title')} at {person.get('organization_name')}",
            })

    return enriched
