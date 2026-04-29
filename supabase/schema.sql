-- Genrolly Supabase schema.
-- Apply via: Supabase Dashboard → SQL Editor → "New query" → paste & run.

-- Note on identity: in this MVP the FastAPI backend authenticates extensions
-- with an api-key (the api_key value becomes the user_id below). When you add
-- proper auth (Supabase Auth or Clerk), swap user_id over to a uuid + RLS.

create extension if not exists "uuid-ossp";

-- ─────────────── leads ───────────────
create table if not exists public.leads (
    id            uuid primary key default uuid_generate_v4(),
    user_id       text not null,
    external_id   text not null,           -- id from extension/scraper
    source        text not null check (source in ('apollo','reddit','twitter','manual')),
    name          text not null,
    headline      text,
    location      text,
    url           text,
    snippet       text,
    email         text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (user_id, external_id)
);

create index if not exists leads_user_idx on public.leads (user_id, created_at desc);
create index if not exists leads_source_idx on public.leads (source);

-- ─────────────── generated_emails ───────────────
create table if not exists public.generated_emails (
    id                uuid primary key default uuid_generate_v4(),
    user_id           text not null,
    lead_external_id  text not null,
    subject           text not null,
    body              text not null,
    status            text not null default 'draft'
                        check (status in ('draft','queued','sent','failed','bounced','replied')),
    gmail_message_id  text,
    error             text,
    created_at        timestamptz not null default now(),
    sent_at           timestamptz
);

create index if not exists emails_user_idx on public.generated_emails (user_id, created_at desc);
create index if not exists emails_lead_idx on public.generated_emails (user_id, lead_external_id);

-- ─────────────── campaigns ───────────────
create table if not exists public.campaigns (
    id              uuid primary key default uuid_generate_v4(),
    user_id         text not null,
    name            text not null,
    niche           text,
    course_name     text,
    cta_url         text,
    created_at      timestamptz not null default now()
);

create table if not exists public.campaign_emails (
    campaign_id   uuid references public.campaigns(id) on delete cascade,
    email_id      uuid references public.generated_emails(id) on delete cascade,
    primary key (campaign_id, email_id)
);

-- ─────────────── billing (stripe) ───────────────
create table if not exists public.subscriptions (
    user_id              text primary key,
    stripe_customer_id   text,
    stripe_sub_id        text,
    plan                 text,
    status               text,
    current_period_end   timestamptz,
    updated_at           timestamptz not null default now()
);

-- ─────────────── updated_at trigger for leads ───────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

-- ─────────────── user_settings ───────────────
-- Stores Apollo filters and email template server-side so the scheduler can use them.
create table if not exists public.user_settings (
    user_id        text primary key,
    apollo_filters jsonb not null default '{}',
    email_template jsonb not null default '{}',
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

-- ─────────────── user_apollo_state ───────────────
-- Persists each user's search cursor so each cron run continues from where it left off.
create table if not exists public.user_apollo_state (
    user_id         text primary key,
    tried_lead_ids  text[] not null default '{}',
    current_page    int not null default 1,
    relaxed_filters text[] not null default '{}',
    last_run_at     timestamptz,
    total_matched   int not null default 0,
    updated_at      timestamptz not null default now()
);

-- ─────────────── apollo_job_log ───────────────
create table if not exists public.apollo_job_log (
    id        uuid primary key default uuid_generate_v4(),
    user_id   text not null,
    plan      text not null,
    outcome   text not null check (outcome in ('matched','no_lead','error','skipped')),
    lead_id   text,
    error     text,
    ran_at    timestamptz not null default now()
);

create index if not exists job_log_user_idx on public.apollo_job_log (user_id, ran_at desc);

-- ─────────────── apollo_rate_limits ───────────────
create table if not exists public.apollo_rate_limits (
    id               uuid primary key default uuid_generate_v4(),
    user_id          text not null,
    date             date not null,
    daily_limit      int not null,
    api_calls_used   int not null default 0,
    created_at       timestamptz not null default now(),
    unique (user_id, date)
);

create index if not exists rate_limit_user_idx on public.apollo_rate_limits (user_id, date);

-- ─────────────── RLS scaffolding (commented out until you add Supabase Auth) ───────────────
-- alter table public.leads enable row level security;
-- alter table public.generated_emails enable row level security;
-- alter table public.campaigns enable row level security;
-- alter table public.subscriptions enable row level security;
--
-- create policy "users see own leads" on public.leads
--   for select using (auth.uid()::text = user_id);
-- create policy "users insert own leads" on public.leads
--   for insert with check (auth.uid()::text = user_id);
-- ... repeat for the other tables.
