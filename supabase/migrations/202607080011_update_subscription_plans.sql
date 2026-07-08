alter table public.subscriptions
  alter column monthly_report_limit set default 3,
  alter column plan_code set default 'free';

update public.subscriptions
set monthly_report_limit = case plan_code
  when 'professional' then 150
  when 'zhihui' then 150
  when 'team' then 600
  when 'zhiyou' then 600
  else 3
end;
