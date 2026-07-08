with generated_codes as (
  insert into public.activation_codes (
    code,
    plan_code,
    monthly_report_limit,
    expires_at
  )
  select
    'ZH-' ||
    to_char(now(), 'YYYYMMDD') ||
    '-' ||
    lpad(series_number::text, 3, '0') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)) as code,
    'zhihui' as plan_code,
    150 as monthly_report_limit,
    now() + interval '1 year' as expires_at
  from generate_series(1, 150) as series_number
  returning
    code,
    plan_code,
    monthly_report_limit,
    status,
    expires_at,
    created_at
)
select
  code as 注册码,
  '智惠版' as 套餐,
  monthly_report_limit as 每月报告额度,
  status as 状态,
  expires_at as 有效期至,
  created_at as 创建时间
from generated_codes
order by 创建时间, 注册码;
