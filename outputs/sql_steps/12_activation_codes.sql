create table if not exists public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  plan_code text not null check (plan_code in ('zhihui', 'zhiyou', 'professional', 'team')),
  monthly_report_limit integer not null check (monthly_report_limit > 0),
  status text not null default 'unused' check (status in ('unused', 'used', 'expired')),
  used_by_user_id uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_activation_codes_updated_at on public.activation_codes;
create trigger set_activation_codes_updated_at
before update on public.activation_codes
for each row execute function public.set_updated_at();

alter table public.activation_codes enable row level security;

drop policy if exists "activation_codes_select_used_own" on public.activation_codes;
create policy "activation_codes_select_used_own"
on public.activation_codes
for select
using (auth.uid() = used_by_user_id);

alter table public.usage_logs
  drop constraint if exists usage_logs_action_check;

alter table public.usage_logs
  add constraint usage_logs_action_check
  check (
    action in (
      'upload_policy_pdf',
      'upload_policy_excel',
      'generate_h5_report',
      'parse_policy_pdf',
      'parse_policy_excel',
      'publish_h5_report',
      'activate_subscription_code'
    )
  );

with ranked_subscriptions as (
  select
    id,
    row_number() over (
      partition by user_id
      order by updated_at desc, created_at desc, id desc
    ) as row_number
  from public.subscriptions
)
delete from public.subscriptions
where id in (
  select id
  from ranked_subscriptions
  where row_number > 1
);

create unique index if not exists idx_subscriptions_user_id_unique
on public.subscriptions(user_id);

create or replace function public.activate_subscription_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.activation_codes%rowtype;
  v_plan_code text;
  v_plan_label text;
  v_limit integer;
  v_subscription_id uuid;
begin
  if auth.uid() is null then
    raise exception '请先登录后再激活套餐。';
  end if;

  if nullif(trim(p_code), '') is null then
    raise exception '请输入注册码。';
  end if;

  select *
  into v_code
  from public.activation_codes
  where upper(code) = upper(trim(p_code))
  for update;

  if not found then
    raise exception '注册码不存在。';
  end if;

  if v_code.status = 'used' then
    raise exception '注册码已被使用。';
  end if;

  if v_code.status = 'expired' or (v_code.expires_at is not null and v_code.expires_at < now()) then
    update public.activation_codes
    set status = 'expired'
    where id = v_code.id;
    raise exception '注册码已过期。';
  end if;

  v_plan_code := case
    when v_code.plan_code in ('professional', 'zhihui') then 'zhihui'
    when v_code.plan_code in ('team', 'zhiyou') then 'zhiyou'
    else v_code.plan_code
  end;

  v_limit := case
    when v_plan_code = 'zhihui' then 150
    when v_plan_code = 'zhiyou' then 600
    else v_code.monthly_report_limit
  end;

  v_plan_label := case
    when v_plan_code = 'zhihui' then '智惠版'
    when v_plan_code = 'zhiyou' then '智优版'
    else '体验版'
  end;

  insert into public.subscriptions (
    user_id,
    plan_code,
    status,
    current_period_start,
    monthly_report_limit,
    monthly_upload_limit
  )
  values (
    auth.uid(),
    v_plan_code,
    'active',
    now(),
    v_limit,
    20
  )
  on conflict (user_id) do update
  set
    plan_code = excluded.plan_code,
    status = 'active',
    current_period_start = now(),
    monthly_report_limit = excluded.monthly_report_limit,
    updated_at = now()
  returning id into v_subscription_id;

  update public.activation_codes
  set
    status = 'used',
    used_by_user_id = auth.uid(),
    used_at = now()
  where id = v_code.id;

  insert into public.usage_logs (
    user_id,
    subscription_id,
    action,
    quantity,
    metadata
  )
  values (
    auth.uid(),
    v_subscription_id,
    'activate_subscription_code',
    1,
    jsonb_build_object(
      'activation_code_id', v_code.id,
      'plan_code', v_plan_code,
      'plan_label', v_plan_label,
      'monthly_report_limit', v_limit
    )
  );

  return jsonb_build_object(
    'plan_code', v_plan_code,
    'plan_label', v_plan_label,
    'monthly_report_limit', v_limit
  );
end;
$$;

revoke all on function public.activate_subscription_code(text) from public;
grant execute on function public.activate_subscription_code(text) to authenticated;

-- 后台手动发码示例：
-- insert into public.activation_codes (code, plan_code, monthly_report_limit, expires_at)
-- values ('ZH-2026-0001', 'zhihui', 150, now() + interval '1 year');
--
-- insert into public.activation_codes (code, plan_code, monthly_report_limit, expires_at)
-- values ('ZY-2026-0001', 'zhiyou', 600, now() + interval '1 year');
