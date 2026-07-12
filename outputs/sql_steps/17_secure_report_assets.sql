-- 将含客户 PDF 附件的 report-assets 改为私有桶。
update storage.buckets
set public = false
where id = 'report-assets';

drop policy if exists "report_assets_select_public_or_own" on storage.objects;
drop policy if exists "report_assets_select_own_folder" on storage.objects;

create policy "report_assets_select_own_folder" on storage.objects
for select to authenticated
using (
  bucket_id = 'report-assets'
  and auth.uid()::text = (storage.foldername(name))[1]
);
