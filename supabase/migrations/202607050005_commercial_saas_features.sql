alter table public.profiles
  add column if not exists company_name text,
  add column if not exists wechat_id text,
  add column if not exists service_code text;

alter table public.subscriptions
  alter column monthly_report_limit set default 3,
  alter column plan_code set default 'free';

update public.subscriptions
set monthly_report_limit = case plan_code
  when 'professional' then 100
  when 'team' then 1000
  else 3
end;

alter table public.usage_logs
  drop constraint if exists usage_logs_action_check;

alter table public.usage_logs
  add constraint usage_logs_action_check
  check (action in ('upload_policy_pdf', 'generate_h5_report', 'parse_policy_pdf', 'publish_h5_report'));

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
