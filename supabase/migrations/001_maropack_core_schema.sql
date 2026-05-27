-- MAROPACK ERP/MES CORE DATABASE SCHEMA V13
-- Run in Supabase SQL Editor.

create extension if not exists "pgcrypto";

-- =========================
-- ENUM TYPES
-- =========================
do $$ begin
  create type public.user_role as enum ('admin','manager','planer','magacin','radnik','qc','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.doc_status as enum ('draft','aktivno','odobreno','u_radu','pauza','zavrseno','otkazano','arhiva');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.product_type as enum ('folija','kesa','spulna','ostalo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.roll_status as enum ('dostupna','rezervisana','u_proizvodnji','formatirana','potrosena','blokirana','otpad');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.operation_type as enum ('materijal','stampa','kasiranje','rezanje','perforacija','formatiranje','kesa','spulna','qc','pakovanje','ostalo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.qc_status as enum ('proslo','dorada','neusaglaseno','ceka');
exception when duplicate_object then null; end $$;

-- =========================
-- UPDATED_AT TRIGGER
-- =========================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =========================
-- USER PROFILES / ROLES
-- =========================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role public.user_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid() and active = true), 'viewer'::public.user_role)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin'::public.user_role
$$;

create or replace function public.can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('admin','manager')
$$;

create or replace function public.can_plan()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('admin','manager','planer')
$$;

-- =========================
-- CORE MASTER DATA
-- =========================
create table if not exists public.kupci (
  id uuid primary key default gen_random_uuid(),
  naziv text not null,
  pib text,
  adresa text,
  kontakt text,
  email text,
  telefon text,
  napomena text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_kupci_naziv on public.kupci using gin (to_tsvector('simple', coalesce(naziv,'')));
drop trigger if exists kupci_updated_at on public.kupci;
create trigger kupci_updated_at before update on public.kupci for each row execute function public.set_updated_at();

create table if not exists public.proizvodi (
  id uuid primary key default gen_random_uuid(),
  kupac_id uuid references public.kupci(id) on delete set null,
  naziv text not null,
  tip public.product_type not null default 'folija',
  sifra text,
  opis text,
  dimenzije jsonb not null default '{}'::jsonb,
  struktura_materijala jsonb not null default '[]'::jsonb,
  tehnicki_parametri jsonb not null default '{}'::jsonb,
  crtez jsonb not null default '{}'::jsonb,
  standardne_operacije jsonb not null default '[]'::jsonb,
  cena_parametri jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_proizvodi_tip on public.proizvodi(tip);
create index if not exists idx_proizvodi_naziv on public.proizvodi using gin (to_tsvector('simple', coalesce(naziv,'')));
drop trigger if exists proizvodi_updated_at on public.proizvodi;
create trigger proizvodi_updated_at before update on public.proizvodi for each row execute function public.set_updated_at();

create table if not exists public.masine (
  id uuid primary key default gen_random_uuid(),
  naziv text not null,
  tip_operacije public.operation_type not null default 'ostalo',
  sifra text unique,
  max_sirina_mm numeric,
  min_sirina_mm numeric,
  max_brzina numeric,
  standard_brzina numeric,
  setup_min integer not null default 0,
  kompatibilnost jsonb not null default '{}'::jsonb,
  status text not null default 'aktivna',
  lokacija text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists masine_updated_at on public.masine;
create trigger masine_updated_at before update on public.masine for each row execute function public.set_updated_at();

create table if not exists public.radnici (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  ime text not null,
  prezime text,
  qr_code text unique,
  uloga public.user_role not null default 'radnik',
  aktivan boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists radnici_updated_at on public.radnici;
create trigger radnici_updated_at before update on public.radnici for each row execute function public.set_updated_at();

-- =========================
-- CALCULATION / OFFER / ORDERS
-- =========================
create table if not exists public.kalkulacije (
  id uuid primary key default gen_random_uuid(),
  proizvod_id uuid references public.proizvodi(id) on delete set null,
  kupac_id uuid references public.kupci(id) on delete set null,
  naziv text not null,
  tip public.product_type not null default 'folija',
  kolicina numeric,
  jedinica text default 'm',
  ulazni_parametri jsonb not null default '{}'::jsonb,
  rezultat jsonb not null default '{}'::jsonb,
  cena_ukupno numeric,
  cena_jedinicna numeric,
  status public.doc_status not null default 'draft',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_kalkulacije_tip on public.kalkulacije(tip);
create index if not exists idx_kalkulacije_status on public.kalkulacije(status);
drop trigger if exists kalkulacije_updated_at on public.kalkulacije;
create trigger kalkulacije_updated_at before update on public.kalkulacije for each row execute function public.set_updated_at();

create table if not exists public.ponude (
  id uuid primary key default gen_random_uuid(),
  broj text unique not null,
  kalkulacija_id uuid references public.kalkulacije(id) on delete set null,
  kupac_id uuid references public.kupci(id) on delete set null,
  proizvod_id uuid references public.proizvodi(id) on delete set null,
  naziv text not null,
  tip public.product_type not null default 'folija',
  kolicina numeric,
  cena_ukupno numeric,
  valuta text not null default 'EUR',
  status public.doc_status not null default 'draft',
  podaci jsonb not null default '{}'::jsonb,
  napomena text,
  vazi_do date,
  created_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ponude_status on public.ponude(status);
create index if not exists idx_ponude_broj on public.ponude(broj);
drop trigger if exists ponude_updated_at on public.ponude;
create trigger ponude_updated_at before update on public.ponude for each row execute function public.set_updated_at();

create table if not exists public.master_nalozi (
  id uuid primary key default gen_random_uuid(),
  broj text unique not null,
  ponuda_id uuid references public.ponude(id) on delete set null,
  kalkulacija_id uuid references public.kalkulacije(id) on delete set null,
  proizvod_id uuid references public.proizvodi(id) on delete set null,
  kupac_id uuid references public.kupci(id) on delete set null,
  naziv text not null,
  tip public.product_type not null default 'folija',
  kolicina numeric,
  jedinica text default 'm',
  rok_isporuke date,
  prioritet integer not null default 3,
  status public.doc_status not null default 'aktivno',
  qr_code text unique,
  podaci jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_master_nalozi_status on public.master_nalozi(status);
create index if not exists idx_master_nalozi_broj on public.master_nalozi(broj);
drop trigger if exists master_nalozi_updated_at on public.master_nalozi;
create trigger master_nalozi_updated_at before update on public.master_nalozi for each row execute function public.set_updated_at();

create table if not exists public.nalozi (
  id uuid primary key default gen_random_uuid(),
  master_nalog_id uuid references public.master_nalozi(id) on delete cascade,
  broj text,
  pon_br text,
  naziv text not null,
  tip public.product_type not null default 'folija',
  tip_naloga public.operation_type not null default 'ostalo',
  redosled integer not null default 0,
  status public.doc_status not null default 'aktivno',
  masina_id uuid references public.masine(id) on delete set null,
  plan_start timestamptz,
  plan_end timestamptz,
  real_start timestamptz,
  real_end timestamptz,
  kolicina numeric,
  skart numeric default 0,
  qr_code text unique,
  podaci jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_nalozi_master on public.nalozi(master_nalog_id);
create index if not exists idx_nalozi_status on public.nalozi(status);
create index if not exists idx_nalozi_tip_naloga on public.nalozi(tip_naloga);
drop trigger if exists nalozi_updated_at on public.nalozi;
create trigger nalozi_updated_at before update on public.nalozi for each row execute function public.set_updated_at();

-- =========================
-- WAREHOUSE / ROLLS
-- =========================
create table if not exists public.rolne (
  id uuid primary key default gen_random_uuid(),
  qr_code text unique not null,
  broj_rolne text,
  materijal text not null,
  struktura text,
  sirina_mm numeric not null,
  duzina_m numeric not null default 0,
  pocetna_duzina_m numeric,
  tezina_kg numeric,
  dobavljac text,
  lot text,
  lokacija text,
  status public.roll_status not null default 'dostupna',
  rezervisana_za_master uuid references public.master_nalozi(id) on delete set null,
  parent_rolna_id uuid references public.rolne(id) on delete set null,
  podaci jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_rolne_qr on public.rolne(qr_code);
create index if not exists idx_rolne_status on public.rolne(status);
create index if not exists idx_rolne_materijal_sirina on public.rolne(materijal, sirina_mm);
drop trigger if exists rolne_updated_at on public.rolne;
create trigger rolne_updated_at before update on public.rolne for each row execute function public.set_updated_at();

create table if not exists public.rolne_istorija (
  id uuid primary key default gen_random_uuid(),
  rolna_id uuid references public.rolne(id) on delete cascade,
  master_nalog_id uuid references public.master_nalozi(id) on delete set null,
  nalog_id uuid references public.nalozi(id) on delete set null,
  akcija text not null,
  prethodno_stanje jsonb default '{}'::jsonb,
  novo_stanje jsonb default '{}'::jsonb,
  napomena text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_rolne_istorija_rolna on public.rolne_istorija(rolna_id);

create table if not exists public.rezervacije_rolni (
  id uuid primary key default gen_random_uuid(),
  rolna_id uuid references public.rolne(id) on delete cascade,
  master_nalog_id uuid references public.master_nalozi(id) on delete cascade,
  nalog_id uuid references public.nalozi(id) on delete set null,
  rezervisano_m numeric not null default 0,
  status public.doc_status not null default 'aktivno',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rolna_id, master_nalog_id, nalog_id)
);
drop trigger if exists rezervacije_rolni_updated_at on public.rezervacije_rolni;
create trigger rezervacije_rolni_updated_at before update on public.rezervacije_rolni for each row execute function public.set_updated_at();

-- =========================
-- PRODUCTION / MES
-- =========================
create table if not exists public.production_sessions (
  id uuid primary key default gen_random_uuid(),
  master_nalog_id uuid references public.master_nalozi(id) on delete set null,
  nalog_id uuid references public.nalozi(id) on delete set null,
  masina_id uuid references public.masine(id) on delete set null,
  radnik_id uuid references public.radnici(id) on delete set null,
  rolna_id uuid references public.rolne(id) on delete set null,
  status public.doc_status not null default 'u_radu',
  start_at timestamptz not null default now(),
  stop_at timestamptz,
  proizvedeno numeric default 0,
  skart numeric default 0,
  zastoji jsonb not null default '[]'::jsonb,
  napomena text,
  podaci jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_production_sessions_status on public.production_sessions(status);
create index if not exists idx_production_sessions_master on public.production_sessions(master_nalog_id);
drop trigger if exists production_sessions_updated_at on public.production_sessions;
create trigger production_sessions_updated_at before update on public.production_sessions for each row execute function public.set_updated_at();

create table if not exists public.planovi_proizvodnje (
  id uuid primary key default gen_random_uuid(),
  naziv text not null,
  status public.doc_status not null default 'draft',
  plan_od date,
  plan_do date,
  stavke jsonb not null default '[]'::jsonb,
  ai_predlog jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists planovi_proizvodnje_updated_at on public.planovi_proizvodnje;
create trigger planovi_proizvodnje_updated_at before update on public.planovi_proizvodnje for each row execute function public.set_updated_at();

-- =========================
-- QC / TECHNICAL DOCS / FINANCE
-- =========================
create table if not exists public.qc_zapisnici (
  id uuid primary key default gen_random_uuid(),
  master_nalog_id uuid references public.master_nalozi(id) on delete set null,
  nalog_id uuid references public.nalozi(id) on delete set null,
  tip_kontrole text not null default 'finalna',
  status public.qc_status not null default 'ceka',
  kontrolor_id uuid references public.radnici(id) on delete set null,
  merenja jsonb not null default '{}'::jsonb,
  neusaglasenosti jsonb not null default '[]'::jsonb,
  napomena text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qc_master on public.qc_zapisnici(master_nalog_id);
drop trigger if exists qc_zapisnici_updated_at on public.qc_zapisnici;
create trigger qc_zapisnici_updated_at before update on public.qc_zapisnici for each row execute function public.set_updated_at();

create table if not exists public.tehnicki_listovi (
  id uuid primary key default gen_random_uuid(),
  proizvod_id uuid references public.proizvodi(id) on delete cascade,
  verzija integer not null default 1,
  naziv text not null,
  podaci jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists tehnicki_listovi_updated_at on public.tehnicki_listovi;
create trigger tehnicki_listovi_updated_at before update on public.tehnicki_listovi for each row execute function public.set_updated_at();

create table if not exists public.finansije_naloga (
  id uuid primary key default gen_random_uuid(),
  master_nalog_id uuid references public.master_nalozi(id) on delete cascade unique,
  prihod numeric default 0,
  trosak_materijal numeric default 0,
  trosak_rad numeric default 0,
  trosak_masine numeric default 0,
  trosak_ostalo numeric default 0,
  profit numeric generated always as (coalesce(prihod,0) - coalesce(trosak_materijal,0) - coalesce(trosak_rad,0) - coalesce(trosak_masine,0) - coalesce(trosak_ostalo,0)) stored,
  podaci jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists finansije_naloga_updated_at on public.finansije_naloga;
create trigger finansije_naloga_updated_at before update on public.finansije_naloga for each row execute function public.set_updated_at();

-- =========================
-- AUDIT LOG
-- =========================
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  row_id uuid,
  akcija text not null,
  old_data jsonb,
  new_data jsonb,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_log_tabela on public.audit_log(tabela);
create index if not exists idx_audit_log_user on public.audit_log(user_id);

-- =========================
-- HELPER FUNCTIONS
-- =========================
create or replace function public.generate_master_nalog_from_ponuda(p_ponuda_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  master_id uuid;
  master_broj text;
begin
  select * into p from public.ponude where id = p_ponuda_id;
  if not found then
    raise exception 'Ponuda nije pronadjena: %', p_ponuda_id;
  end if;

  master_broj := 'MN-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random()*900000)+100000)::text, 6, '0');

  insert into public.master_nalozi (
    broj, ponuda_id, kalkulacija_id, proizvod_id, kupac_id, naziv, tip, kolicina, status, qr_code, podaci, created_by
  ) values (
    master_broj, p.id, p.kalkulacija_id, p.proizvod_id, p.kupac_id, p.naziv, p.tip, p.kolicina,
    'aktivno', master_broj, p.podaci, auth.uid()
  ) returning id into master_id;

  insert into public.nalozi (master_nalog_id, broj, pon_br, naziv, tip, tip_naloga, redosled, status, qr_code, podaci, created_by)
  select master_id, master_broj || '-' || x.redosled, p.broj, x.naziv, p.tip, x.tip_naloga::public.operation_type, x.redosled,
         'aktivno', master_broj || '-' || x.redosled, p.podaci, auth.uid()
  from (
    select 1 redosled, 'Nalog za potrebu materijala' naziv, 'materijal' tip_naloga
    union all select 2, 'Nalog za štampu', 'stampa' where p.tip in ('folija','kesa')
    union all select 3, 'Nalog za kaširanje', 'kasiranje' where p.tip = 'folija'
    union all select 4, 'Nalog za rezanje', 'rezanje' where p.tip = 'folija'
    union all select 5, 'Nalog za perforaciju', 'perforacija' where p.tip = 'folija'
    union all select 6, 'Nalog za kesu', 'kesa' where p.tip = 'kesa'
    union all select 7, 'Nalog za formatiranje', 'formatiranje' where p.tip = 'spulna'
    union all select 8, 'Nalog za špulne', 'spulna' where p.tip = 'spulna'
    union all select 9, 'Quality Control', 'qc'
  ) x;

  update public.ponude set status = 'odobreno', approved_at = now() where id = p.id;
  return master_id;
end;
$$;
