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
      'publish_h5_report'
    )
  );
