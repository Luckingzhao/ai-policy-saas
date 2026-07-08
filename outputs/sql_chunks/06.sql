-- Chunk 06 of 07
-- Execute this whole file in Supabase SQL Editor.

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

-- Source: supabase/migrations/202607050002_customer_upload_fields.sql

alter table public.customers
  add column if not exists wechat_id text,
  add column if not exists city text;

-- Source: supabase/migrations/202607050003_ai_policy_parse_fields.sql

alter table public.policies
  add column if not exists insurance_type text,
  add column if not exists product_info text,
  add column if not exists paid_years integer,
  add column if not exists remaining_years integer,
  add column if not exists remaining_premium numeric(14, 2),
  add column if not exists policy_service text,
  add column if not exists payment_account text;

create unique index if not exists policies_user_dedupe_key
on public.policies (
  user_id,
  coalesce(insured_name, ''),
  coalesce(product_name, ''),
  coalesce(effective_date, date '1900-01-01')
);

-- Source: supabase/migrations/202607050004_public_h5_report_read_policies.sql

create policy "customers_public_select_published_report" on public.customers
for select using (
  exists (
    select 1
    from public.h5_reports
    where h5_reports.customer_id = customers.id
      and h5_reports.user_id = customers.user_id
      and h5_reports.status = 'published'
  )
);

create policy "profiles_public_select_published_report_advisor" on public.profiles
for select using (
  exists (
    select 1
    from public.h5_reports
    where h5_reports.user_id = profiles.user_id
      and h5_reports.status = 'published'
  )
);

create policy "policies_public_select_published_report" on public.policies
for select using (
  exists (
    select 1
    from public.h5_reports
    where h5_reports.customer_id = policies.customer_id
      and h5_reports.user_id = policies.user_id
      and h5_reports.status = 'published'
  )
);
