-- Chunk 01 of 07
-- Execute this whole file in Supabase SQL Editor.

-- Source: supabase/migrations/202607050001_initial_saas_schema.sql

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agency_id uuid references public.agencies(id) on delete set null,
  full_name text,
  phone text,
  company_name text,
  wechat_id text,
  service_code text,
  avatar_url text,
  brand_name text,
  brand_logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agency_id uuid references public.agencies(id) on delete set null,
  name text not null,
  phone text,
  wechat_id text,
  gender text,
  birth_date date,
  city text,
  family_role text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  bucket text not null,
  object_path text not null,
  original_filename text not null,
  mime_type text,
  file_size bigint,
  parse_status text not null default 'pending' check (parse_status in ('pending', 'processing', 'completed', 'failed')),
  parse_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, object_path)
);
