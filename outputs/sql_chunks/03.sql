-- Chunk 03 of 07
-- Execute this whole file in Supabase SQL Editor.

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
