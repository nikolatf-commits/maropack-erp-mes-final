-- =====================================================================
-- 023_magacin_istorija_traceability.sql
-- MAROPACK — jedinstvena istorija rolni za desktop + telefon
--
-- Ova tabela je izvor istine za trag svake akcije nad rolnom:
-- ulaz, uvoz, skeniranje, rezervacija, skidanje metraže, povrat,
-- promena lokacije, popis, brisanje/status.
-- =====================================================================

create table if not exists public.magacin_istorija (
  id uuid primary key default gen_random_uuid(),
  rolna_id bigint null,
  qr_code text not null,
  dogadjaj text not null,
  opis text,
  operater text,
  operater_email text,
  user_id uuid null,
  stanje text,
  nalog_id text,
  lokacija_pre text,
  lokacija_posle text,
  metara numeric,
  kg numeric,
  source text default 'app',
  device_info text,
  meta jsonb not null default '{}'::jsonb,
  vreme timestamptz not null default now()
);

alter table public.magacin_istorija add column if not exists rolna_id bigint null;
alter table public.magacin_istorija add column if not exists qr_code text;
alter table public.magacin_istorija add column if not exists dogadjaj text;
alter table public.magacin_istorija add column if not exists opis text;
alter table public.magacin_istorija add column if not exists operater text;
alter table public.magacin_istorija add column if not exists operater_email text;
alter table public.magacin_istorija add column if not exists user_id uuid null;
alter table public.magacin_istorija add column if not exists stanje text;
alter table public.magacin_istorija add column if not exists nalog_id text;
alter table public.magacin_istorija add column if not exists lokacija_pre text;
alter table public.magacin_istorija add column if not exists lokacija_posle text;
alter table public.magacin_istorija add column if not exists metara numeric;
alter table public.magacin_istorija add column if not exists kg numeric;
alter table public.magacin_istorija add column if not exists source text default 'app';
alter table public.magacin_istorija add column if not exists device_info text;
alter table public.magacin_istorija add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.magacin_istorija add column if not exists vreme timestamptz not null default now();

create index if not exists idx_magacin_istorija_qr_vreme on public.magacin_istorija(qr_code, vreme desc);
create index if not exists idx_magacin_istorija_rolna_vreme on public.magacin_istorija(rolna_id, vreme desc);
create index if not exists idx_magacin_istorija_dogadjaj on public.magacin_istorija(dogadjaj);
create index if not exists idx_magacin_istorija_operater on public.magacin_istorija(operater_email);
create index if not exists idx_magacin_istorija_nalog on public.magacin_istorija(nalog_id);

-- FK se dodaje samo ako tabela magacin postoji i ako ga baza dozvoli.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='magacin') then
    begin
      alter table public.magacin_istorija
        add constraint magacin_istorija_rolna_id_fkey
        foreign key (rolna_id) references public.magacin(id) on delete set null;
    exception when duplicate_object then null;
    exception when others then null;
    end;
  end if;
end $$;

alter table public.magacin_istorija enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='magacin_istorija' and policyname='magacin_istorija_select_authenticated'
  ) then
    create policy magacin_istorija_select_authenticated
      on public.magacin_istorija for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='magacin_istorija' and policyname='magacin_istorija_insert_authenticated'
  ) then
    create policy magacin_istorija_insert_authenticated
      on public.magacin_istorija for insert
      to authenticated
      with check (true);
  end if;
end $$;

grant select, insert on public.magacin_istorija to authenticated;
grant select, insert on public.magacin_istorija to anon;
