-- Chunk 05 of 07
-- Execute this whole file in Supabase SQL Editor.

create policy "policy_benefits_delete_own" on public.policy_benefits for delete using (auth.uid() = user_id);

create policy "h5_reports_select_own" on public.h5_reports for select using (auth.uid() = user_id);

create policy "h5_reports_public_select_published" on public.h5_reports for select using (status = 'published');

create policy "h5_reports_insert_own" on public.h5_reports for insert with check (auth.uid() = user_id);

create policy "h5_reports_update_own" on public.h5_reports for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "h5_reports_delete_own" on public.h5_reports for delete using (auth.uid() = user_id);

create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);

create policy "subscriptions_insert_own" on public.subscriptions for insert with check (auth.uid() = user_id);

create policy "subscriptions_update_own" on public.subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "subscriptions_delete_own" on public.subscriptions for delete using (auth.uid() = user_id);

create policy "usage_logs_select_own" on public.usage_logs for select using (auth.uid() = user_id);

create policy "usage_logs_insert_own" on public.usage_logs for insert with check (auth.uid() = user_id);

create policy "usage_logs_update_own" on public.usage_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "usage_logs_delete_own" on public.usage_logs for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('policy-pdfs', 'policy-pdfs', false, 52428800, array['application/pdf']),
  ('report-assets', 'report-assets', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "policy_pdfs_select_own_folder" on storage.objects
for select using (
  bucket_id = 'policy-pdfs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "policy_pdfs_insert_own_folder" on storage.objects
for insert with check (
  bucket_id = 'policy-pdfs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "policy_pdfs_update_own_folder" on storage.objects
for update using (
  bucket_id = 'policy-pdfs'
  and auth.uid()::text = (storage.foldername(name))[1]
) with check (
  bucket_id = 'policy-pdfs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "policy_pdfs_delete_own_folder" on storage.objects
for delete using (
  bucket_id = 'policy-pdfs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "report_assets_select_public_or_own" on storage.objects
for select using (
  bucket_id = 'report-assets'
  and (auth.uid()::text = (storage.foldername(name))[1] or true)
);

create policy "report_assets_insert_own_folder" on storage.objects
for insert with check (
  bucket_id = 'report-assets'
  and auth.uid()::text = (storage.foldername(name))[1]
);
