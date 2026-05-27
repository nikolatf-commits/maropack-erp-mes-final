-- MAROPACK FAZA 11: indexes, constraints, RLS hardening

create table if not exists public.nalog_status_log (
  id uuid primary key default gen_random_uuid(),
  nalog_id uuid,
  old_status text,
  new_status text not null,
  changed_by uuid,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.system_health_checks (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  check_name text not null,
  status text not null default 'pending',
  risk_level text default 'medium',
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_type text not null default 'manual',
  created_by uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_rolne_status on public.rolne(status);
create index if not exists idx_rolne_materijal_sirina on public.rolne(materijal, sirina);
create index if not exists idx_nalozi_status on public.nalozi(status);
create index if not exists idx_nalozi_kupac on public.nalozi(kupac);
create index if not exists idx_planovi_rezanja_nalog on public.planovi_rezanja(nalog_id);
create index if not exists idx_mes_dogadjaji_nalog on public.mes_dogadjaji(nalog_id);
create index if not exists idx_qc_kontrole_nalog on public.qc_kontrole(nalog_id);

alter table public.nalog_status_log enable row level security;
alter table public.system_health_checks enable row level security;
alter table public.backup_snapshots enable row level security;

do $$ begin
  create policy "read nalog status log" on public.nalog_status_log for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "insert nalog status log" on public.nalog_status_log for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "read system health checks" on public.system_health_checks for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin manage backup snapshots" on public.backup_snapshots for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
