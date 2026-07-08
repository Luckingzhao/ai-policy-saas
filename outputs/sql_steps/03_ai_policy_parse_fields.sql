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
