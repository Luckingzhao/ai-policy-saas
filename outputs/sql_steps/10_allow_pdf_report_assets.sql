update storage.buckets
set
  file_size_limit = greatest(coalesce(file_size_limit, 0), 52428800),
  allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'application/pdf'
  ]
where id = 'report-assets';
