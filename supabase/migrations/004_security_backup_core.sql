-- MAROPACK V18 - Security / Backup helpers
-- Pokrenuti posle osnovnih V13/V15 migracija.

create table if not exists public.system_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  title text not null,
  description text,
  payload jsonb default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz default now()
);

alter table public.system_events enable row level security;

create policy if not exists "system_events_select_authenticated"
  on public.system_events for select
  to authenticated
  using (true);

create policy if not exists "system_events_insert_authenticated"
  on public.system_events for insert
  to authenticated
  with check (true);

create table if not exists public.backup_log (
  id uuid primary key default gen_random_uuid(),
  backup_type text not null default 'manual',
  status text not null default 'created',
  file_name text,
  created_by uuid,
  created_at timestamptz default now(),
  note text
);

alter table public.backup_log enable row level security;

create policy if not exists "backup_log_select_authenticated"
  on public.backup_log for select
  to authenticated
  using (true);

create policy if not exists "backup_log_insert_authenticated"
  on public.backup_log for insert
  to authenticated
  with check (true);

-- Helper za brzu proveru baze iz aplikacije
create or replace function public.maropack_healthcheck()
returns jsonb
language sql
security definer
as $$
  select jsonb_build_object(
    'ok', true,
    'checked_at', now(),
    'tables', jsonb_build_object(
      'master_nalozi', to_regclass('public.master_nalozi') is not null,
      'nalozi', to_regclass('public.nalozi') is not null,
      'rolne', to_regclass('public.rolne') is not null,
      'production_sessions', to_regclass('public.production_sessions') is not null
    )
  );
$$;
