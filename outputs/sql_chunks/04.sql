-- Chunk 04 of 07
-- Execute this whole file in Supabase SQL Editor.

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
