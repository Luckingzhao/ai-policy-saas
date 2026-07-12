-- Subscription upgrades must only happen through trusted SECURITY DEFINER RPCs
-- such as activate_subscription_code. Clients may read, but not mutate plans.
drop policy if exists "subscriptions_insert_own" on public.subscriptions;
drop policy if exists "subscriptions_update_own" on public.subscriptions;
drop policy if exists "subscriptions_delete_own" on public.subscriptions;

-- Usage events are append-only. Prevent users from reducing their recorded usage.
drop policy if exists "usage_logs_update_own" on public.usage_logs;
drop policy if exists "usage_logs_delete_own" on public.usage_logs;

-- Reject malformed quantities even when the event belongs to the current user.
alter table public.usage_logs
  drop constraint if exists usage_logs_quantity_positive;

alter table public.usage_logs
  add constraint usage_logs_quantity_positive check (quantity > 0);
