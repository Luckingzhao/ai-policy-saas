-- Chunk 02 of 07
-- Execute this whole file in Supabase SQL Editor.

create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  report_file_id uuid references public.report_files(id) on delete set null,
  policy_number text,
  insurer_name text,
  product_name text,
  insurance_type text,
  product_info text,
  policy_holder_name text,
  insured_name text,
  premium_amount numeric(14, 2),
  premium_period text,
  coverage_amount numeric(14, 2),
  effective_date date,
  expiry_date date,
  paid_years integer,
  remaining_years integer,
  remaining_premium numeric(14, 2),
  policy_service text,
  payment_account text,
  payment_status text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null references public.policies(id) on delete cascade,
  name text not null,
  relationship text,
  benefit_ratio numeric(5, 2),
  beneficiary_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.policy_benefits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null references public.policies(id) on delete cascade,
  benefit_name text not null,
  benefit_type text,
  coverage_amount numeric(14, 2),
  description text,
  waiting_period text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.h5_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  slug text not null unique,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  summary jsonb not null default '{}'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null default 'free',
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  monthly_report_limit integer not null default 3,
  monthly_upload_limit integer not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
