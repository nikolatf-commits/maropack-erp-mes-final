-- MAROPACK FULL SYSTEM - preporucena Supabase sema
-- Pokrenuti u Supabase SQL editoru kada se sistem prebacuje u online rezim.

create table if not exists public.rolne (
  id uuid primary key default gen_random_uuid(),
  br_rolne text unique,
  parent_id uuid null,
  materijal text,
  tip text,
  oznaka text,
  debljina numeric,
  sirina numeric,
  sirina_mm numeric,
  metara numeric default 0,
  stanje_m numeric default 0,
  rezervisano numeric default 0,
  kg numeric default 0,
  lot text,
  lokacija text,
  status text default 'na stanju',
  istorija jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.planovi_rezanja (
  id uuid primary key default gen_random_uuid(),
  broj text unique,
  nalog_id uuid null,
  naziv text,
  status text default 'draft',
  summary jsonb default '{}'::jsonb,
  plans jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  accepted_at timestamptz null,
  accepted_by uuid null
);

create table if not exists public.analiza_potrosnje (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid null,
  nalog_id uuid null,
  ukupno_metara numeric default 0,
  otpad_mm numeric default 0,
  iskoriscenost numeric default 0,
  stavke jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table public.rolne enable row level security;
alter table public.planovi_rezanja enable row level security;
alter table public.analiza_potrosnje enable row level security;

-- Demo politike. U produkciji ih zameniti ulogama admin/manager/magacioner.
do $$ begin
  create policy "rolne_read" on public.rolne for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "rolne_write" on public.rolne for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "planovi_rezanja_all" on public.planovi_rezanja for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "analiza_potrosnje_all" on public.analiza_potrosnje for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- AI interakcije - čuvanje pitanja/odgovora centralnog AI asistenta
create table if not exists public.ai_interakcije (
  id uuid primary key default gen_random_uuid(),
  pitanje text not null,
  odgovor text,
  summary jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  created_by uuid null
);

alter table public.ai_interakcije enable row level security;

do $$ begin
  create policy "ai_interakcije_all" on public.ai_interakcije for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- =========================================================
-- FAZA 1 CORE ERP/MES — MAŠINE, PLAN, STATUSI, TRACEABILITY
-- =========================================================
create table if not exists masine (
  id text primary key,
  code text,
  name text not null,
  type text not null,
  group_name text,
  status text default 'aktivna',
  max_width numeric,
  min_width numeric,
  max_diameter numeric,
  core text,
  speed numeric,
  setup_min numeric,
  capabilities jsonb default '[]'::jsonb,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists proizvodni_plan (
  id uuid primary key default gen_random_uuid(),
  machine_id text references masine(id) on delete set null,
  nalog_id text,
  title text,
  customer text,
  operation_type text,
  planned_start timestamptz,
  planned_end timestamptz,
  duration_min numeric,
  sort_order integer default 0,
  status text default 'planirano',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists nalog_status_history (
  id uuid primary key default gen_random_uuid(),
  nalog_id text not null,
  old_status text,
  new_status text not null,
  changed_by text,
  note text,
  created_at timestamptz default now()
);

create table if not exists traceability_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  payload jsonb default '{}'::jsonb,
  created_by text,
  created_at timestamptz default now()
);

create table if not exists qr_entities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  qr_payload jsonb not null,
  status text default 'active',
  created_at timestamptz default now()
);

-- =========================================================
-- FAZA 2 — MES tracking, QC, radnici, traceability
-- =========================================================
create table if not exists public.radnici (
  id text primary key,
  ime text not null,
  uloga text,
  qr text unique,
  aktivan boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.mes_dogadjaji (
  id text primary key,
  type text not null,
  nalog_id text,
  machine_id text,
  worker_id text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.qc_kontrole (
  id uuid primary key default gen_random_uuid(),
  nalog_id text,
  machine_id text,
  worker_id text,
  kontrola text,
  rezultat text check (rezultat in ('OK','NOK','USLOVNO')) default 'OK',
  vrednost text,
  tolerancija text,
  napomena text,
  slike jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.magacin_promene (
  id uuid primary key default gen_random_uuid(),
  rolna_id text,
  nalog_id text,
  tip_promene text,
  metara numeric default 0,
  kg numeric default 0,
  lokacija_pre text,
  lokacija_posle text,
  worker_id text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_mes_dogadjaji_nalog on public.mes_dogadjaji(nalog_id);
create index if not exists idx_mes_dogadjaji_machine on public.mes_dogadjaji(machine_id);
create index if not exists idx_mes_dogadjaji_worker on public.mes_dogadjaji(worker_id);
create index if not exists idx_qc_kontrole_nalog on public.qc_kontrole(nalog_id);
create index if not exists idx_magacin_promene_rolna on public.magacin_promene(rolna_id);

-- =========================================================
-- FAZA 3 — AI AGENT COMMAND CENTER
-- Centralni AI agent: predlozi akcija, istorija pitanja, izvršni predlozi
-- =========================================================

create table if not exists public.ai_akcije (
  id uuid primary key default gen_random_uuid(),
  tip text not null,
  naziv text,
  payload jsonb default '{}'::jsonb,
  status text default 'predlog_ai',
  korisnik text,
  created_at timestamptz default now(),
  confirmed_at timestamptz,
  executed_at timestamptz,
  napomena text
);

create table if not exists public.ai_agent_memorija (
  id uuid primary key default gen_random_uuid(),
  entitet text,
  entitet_id text,
  tip text,
  sadrzaj jsonb default '{}'::jsonb,
  vaznost int default 1,
  created_at timestamptz default now()
);

create index if not exists idx_ai_akcije_tip on public.ai_akcije(tip);
create index if not exists idx_ai_akcije_status on public.ai_akcije(status);
create index if not exists idx_ai_agent_memorija_entitet on public.ai_agent_memorija(entitet, entitet_id);
