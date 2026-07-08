create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agency_id uuid references public.agencies(id) on delete set null,
  full_name text,
  phone text,
  company_name text,
  wechat_id text,
  service_code text,
  avatar_url text,
  brand_name text,
  brand_logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agency_id uuid references public.agencies(id) on delete set null,
  name text not null,
  phone text,
  wechat_id text,
  gender text,
  birth_date date,
  city text,
  family_role text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  bucket text not null,
  object_path text not null,
  original_filename text not null,
  mime_type text,
  file_size bigint,
  parse_status text not null default 'pending' check (parse_status in ('pending', 'processing', 'completed', 'failed')),
  parse_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, object_path)
);

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

create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  action text not null check (action in ('upload_policy_pdf', 'generate_h5_report', 'parse_policy_pdf', 'publish_h5_report')),
  quantity integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_customers_user_id on public.customers(user_id);
create index if not exists idx_report_files_user_id on public.report_files(user_id);
create index if not exists idx_policies_user_id on public.policies(user_id);
create index if not exists idx_policies_customer_id on public.policies(customer_id);
create unique index if not exists policies_user_dedupe_key
on public.policies (
  user_id,
  coalesce(insured_name, ''),
  coalesce(product_name, ''),
  coalesce(effective_date, date '1900-01-01')
);
create index if not exists idx_beneficiaries_user_id on public.beneficiaries(user_id);
create index if not exists idx_policy_benefits_user_id on public.policy_benefits(user_id);
create index if not exists idx_h5_reports_user_id on public.h5_reports(user_id);
create index if not exists idx_h5_reports_slug on public.h5_reports(slug);
create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_usage_logs_user_id on public.usage_logs(user_id);

create trigger set_agencies_updated_at before update on public.agencies for each row execute function public.set_updated_at();
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger set_report_files_updated_at before update on public.report_files for each row execute function public.set_updated_at();
create trigger set_policies_updated_at before update on public.policies for each row execute function public.set_updated_at();
create trigger set_beneficiaries_updated_at before update on public.beneficiaries for each row execute function public.set_updated_at();
create trigger set_policy_benefits_updated_at before update on public.policy_benefits for each row execute function public.set_updated_at();
create trigger set_h5_reports_updated_at before update on public.h5_reports for each row execute function public.set_updated_at();
create trigger set_subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, brand_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'brand_name'
  )
  on conflict (user_id) do nothing;

  insert into public.subscriptions (user_id, plan_code, monthly_report_limit, monthly_upload_limit)
  values (new.id, 'free', 3, 20)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.agencies enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.report_files enable row level security;
alter table public.policies enable row level security;
alter table public.beneficiaries enable row level security;
alter table public.policy_benefits enable row level security;
alter table public.h5_reports enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_logs enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid() = user_id);

create policy "agencies_select_own" on public.agencies for select using (auth.uid() = user_id);
create policy "agencies_insert_own" on public.agencies for insert with check (auth.uid() = user_id);
create policy "agencies_update_own" on public.agencies for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "agencies_delete_own" on public.agencies for delete using (auth.uid() = user_id);

create policy "customers_select_own" on public.customers for select using (auth.uid() = user_id);
create policy "customers_insert_own" on public.customers for insert with check (auth.uid() = user_id);
create policy "customers_update_own" on public.customers for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "customers_delete_own" on public.customers for delete using (auth.uid() = user_id);

create policy "report_files_select_own" on public.report_files for select using (auth.uid() = user_id);
create policy "report_files_insert_own" on public.report_files for insert with check (auth.uid() = user_id);
create policy "report_files_update_own" on public.report_files for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "report_files_delete_own" on public.report_files for delete using (auth.uid() = user_id);

create policy "policies_select_own" on public.policies for select using (auth.uid() = user_id);
create policy "policies_insert_own" on public.policies for insert with check (auth.uid() = user_id);
create policy "policies_update_own" on public.policies for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "policies_delete_own" on public.policies for delete using (auth.uid() = user_id);

create policy "beneficiaries_select_own" on public.beneficiaries for select using (auth.uid() = user_id);
create policy "beneficiaries_insert_own" on public.beneficiaries for insert with check (auth.uid() = user_id);
create policy "beneficiaries_update_own" on public.beneficiaries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "beneficiaries_delete_own" on public.beneficiaries for delete using (auth.uid() = user_id);

create policy "policy_benefits_select_own" on public.policy_benefits for select using (auth.uid() = user_id);
create policy "policy_benefits_insert_own" on public.policy_benefits for insert with check (auth.uid() = user_id);
create policy "policy_benefits_update_own" on public.policy_benefits for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "policy_benefits_delete_own" on public.policy_benefits for delete using (auth.uid() = user_id);

create policy "h5_reports_select_own" on public.h5_reports for select using (auth.uid() = user_id);
create policy "h5_reports_public_select_published" on public.h5_reports for select using (status = 'published');
create policy "h5_reports_insert_own" on public.h5_reports for insert with check (auth.uid() = user_id);
create policy "h5_reports_update_own" on public.h5_reports for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "h5_reports_delete_own" on public.h5_reports for delete using (auth.uid() = user_id);

create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);
create policy "subscriptions_insert_own" on public.subscriptions for insert with check (auth.uid() = user_id);
create policy "subscriptions_update_own" on public.subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "subscriptions_delete_own" on public.subscriptions for delete using (auth.uid() = user_id);

create policy "usage_logs_select_own" on public.usage_logs for select using (auth.uid() = user_id);
create policy "usage_logs_insert_own" on public.usage_logs for insert with check (auth.uid() = user_id);
create policy "usage_logs_update_own" on public.usage_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "usage_logs_delete_own" on public.usage_logs for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('policy-pdfs', 'policy-pdfs', false, 52428800, array['application/pdf']),
  ('report-assets', 'report-assets', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "policy_pdfs_select_own_folder" on storage.objects
for select using (
  bucket_id = 'policy-pdfs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "policy_pdfs_insert_own_folder" on storage.objects
for insert with check (
  bucket_id = 'policy-pdfs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "policy_pdfs_update_own_folder" on storage.objects
for update using (
  bucket_id = 'policy-pdfs'
  and auth.uid()::text = (storage.foldername(name))[1]
) with check (
  bucket_id = 'policy-pdfs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "policy_pdfs_delete_own_folder" on storage.objects
for delete using (
  bucket_id = 'policy-pdfs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "report_assets_select_public_or_own" on storage.objects
for select using (
  bucket_id = 'report-assets'
  and (auth.uid()::text = (storage.foldername(name))[1] or true)
);

create policy "report_assets_insert_own_folder" on storage.objects
for insert with check (
  bucket_id = 'report-assets'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "report_assets_update_own_folder" on storage.objects
for update using (
  bucket_id = 'report-assets'
  and auth.uid()::text = (storage.foldername(name))[1]
) with check (
  bucket_id = 'report-assets'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "report_assets_delete_own_folder" on storage.objects
for delete using (
  bucket_id = 'report-assets'
  and auth.uid()::text = (storage.foldername(name))[1]
);
