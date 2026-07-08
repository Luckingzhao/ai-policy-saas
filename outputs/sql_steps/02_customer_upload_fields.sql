alter table public.customers
  add column if not exists wechat_id text,
  add column if not exists city text;
