create policy "customers_public_select_published_report" on public.customers
for select using (
  exists (
    select 1
    from public.h5_reports
    where h5_reports.customer_id = customers.id
      and h5_reports.user_id = customers.user_id
      and h5_reports.status = 'published'
  )
);

create policy "profiles_public_select_published_report_advisor" on public.profiles
for select using (
  exists (
    select 1
    from public.h5_reports
    where h5_reports.user_id = profiles.user_id
      and h5_reports.status = 'published'
  )
);

create policy "policies_public_select_published_report" on public.policies
for select using (
  exists (
    select 1
    from public.h5_reports
    where h5_reports.customer_id = policies.customer_id
      and h5_reports.user_id = policies.user_id
      and h5_reports.status = 'published'
  )
);

create policy "beneficiaries_public_select_published_report" on public.beneficiaries
for select using (
  exists (
    select 1
    from public.policies
    join public.h5_reports
      on h5_reports.customer_id = policies.customer_id
     and h5_reports.user_id = policies.user_id
     and h5_reports.status = 'published'
    where policies.id = beneficiaries.policy_id
      and policies.user_id = beneficiaries.user_id
  )
);

create policy "policy_benefits_public_select_published_report" on public.policy_benefits
for select using (
  exists (
    select 1
    from public.policies
    join public.h5_reports
      on h5_reports.customer_id = policies.customer_id
     and h5_reports.user_id = policies.user_id
     and h5_reports.status = 'published'
    where policies.id = policy_benefits.policy_id
      and policies.user_id = policy_benefits.user_id
  )
);
