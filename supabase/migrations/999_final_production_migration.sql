-- MAROPACK FINAL PRODUCTION MIGRATION
-- Pokrenuti nakon SUPABASE_SCHEMA_FULL_SYSTEM.sql i faznih SQL dodataka.

create extension if not exists pgcrypto;

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.system_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text not null,
  entity_type text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_events (
  id uuid primary key default gen_random_uuid(),
  workflow_type text not null,
  entity_id text not null,
  from_status text,
  to_status text not null,
  note text,
  user_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.production_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  check_name text not null,
  status text not null default 'pending',
  owner_role text,
  evidence text,
  checked_at timestamptz,
  checked_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_system_audit_log_created_at on public.system_audit_log(created_at desc);
create index if not exists idx_system_audit_log_entity on public.system_audit_log(entity_type, entity_id);
create index if not exists idx_workflow_events_entity on public.workflow_events(workflow_type, entity_id, created_at desc);
create index if not exists idx_integration_events_status on public.integration_events(status, created_at desc);

alter table public.system_settings enable row level security;
alter table public.system_audit_log enable row level security;
alter table public.workflow_events enable row level security;
alter table public.production_readiness_checks enable row level security;
alter table public.integration_events enable row level security;

do $$ begin
  create policy "authenticated read system settings" on public.system_settings for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authenticated read audit" on public.system_audit_log for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authenticated insert audit" on public.system_audit_log for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authenticated read workflow" on public.workflow_events for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authenticated insert workflow" on public.workflow_events for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authenticated readiness crud" on public.production_readiness_checks for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authenticated integration read" on public.integration_events for select to authenticated using (true);
exception when duplicate_object then null; end $$;

insert into public.system_settings(key, value)
values
('maropack_version', '{"version":"2.1.0-final-production-ready","phase":"final"}'::jsonb),
('ai_execution_policy', '{"mode":"approve_before_execute","allow_inventory_change_without_confirmation":false}'::jsonb),
('backup_policy', '{"frequency":"daily","retention_days":30,"manual_export_before_release":true}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();
