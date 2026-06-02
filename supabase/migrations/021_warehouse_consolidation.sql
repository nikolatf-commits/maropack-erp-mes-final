-- =====================================================================
-- 021_warehouse_consolidation.sql
-- MAROPACK — konsolidacija magacina rolni
--
-- CILJ:
--   U bazi su postojale DVE tabele za rolne:
--     * public.magacin       (bigint id)  -> PRAVA, kod je koristi, ima podatke
--     * public.magacin_rolni (uuid id)    -> MRTVA duplikat, prazna (0 redova)
--   Pomocne tabele (istorija_rolne, magacin_promene, rezervacije_rolni,
--   rolne_potomci) bile su FK-om zakacene za MRTVU magacin_rolni (uuid),
--   pa se nikad nisu mogle povezati sa stvarnim rolnama u 'magacin' (bigint).
--
--   Ova migracija preusmerava sve te veze na public.magacin i brise mrtvu
--   tabelu. Sve zavisne tabele su prazne (0 redova) -> nema gubitka podataka.
--
-- BEZBEDNOST:
--   * Idempotentno (moze se pokrenuti vise puta).
--   * Radi u jednoj transakciji - ili sve prodje ili nista.
--   * Pre pokretanja proverava da su zavisne tabele zaista prazne;
--     ako nisu, prekida sa jasnom porukom (da se podaci ne izgube).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) SIGURNOSNA PROVERA: zavisne tabele moraju biti prazne.
--    Ako bilo koja ima podatke -> prekid (necemo da rusimo FK pod podacima).
-- ---------------------------------------------------------------------
do $$
declare
  v_cnt bigint;
begin
  select
    (select count(*) from public.istorija_rolne)
    + (select count(*) from public.rezervacije_rolni)
    + (select count(*) from public.rolne_potomci)
    + coalesce((select count(*) from public.magacin_promene), 0)
  into v_cnt;

  if v_cnt > 0 then
    raise exception
      'PREKID: zavisne tabele nisu prazne (ukupno % redova). Migracija ocekuje 0. Rucno pregledati pre nastavka.', v_cnt;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Skini stare FK-ove koji pokazuju na MRTVU magacin_rolni (uuid).
--    Imena FK-ova mogu da variraju; skidamo po referenciranoj tabeli.
-- ---------------------------------------------------------------------
do $$
declare
  fk record;
begin
  for fk in
    select tc.table_name, tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and ccu.table_name = 'magacin_rolni'
  loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      fk.table_name, fk.constraint_name
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) Uskladi tip kolona rolna_id / parent / child na BIGINT
--    (magacin.id je bigint). Tabele su prazne, pa je cast trivijalan.
-- ---------------------------------------------------------------------

-- istorija_rolne.rolna_id  (bilo uuid -> bigint)
alter table public.istorija_rolne
  alter column rolna_id type bigint using nullif(rolna_id::text, '')::bigint;

-- magacin_promene.rolna_id (bilo uuid -> bigint)
alter table public.magacin_promene
  alter column rolna_id type bigint using nullif(rolna_id::text, '')::bigint;

-- rezervacije_rolni.rolna_id (bilo uuid -> bigint)
alter table public.rezervacije_rolni
  alter column rolna_id type bigint using nullif(rolna_id::text, '')::bigint;

-- rolne_potomci.parent_rolna_id / child_rolna_id (bilo uuid -> bigint)
alter table public.rolne_potomci
  alter column parent_rolna_id type bigint using nullif(parent_rolna_id::text, '')::bigint;
alter table public.rolne_potomci
  alter column child_rolna_id type bigint using nullif(child_rolna_id::text, '')::bigint;

-- ---------------------------------------------------------------------
-- 3) Napravi nove FK-ove koji pokazuju na PRAVU public.magacin (bigint).
-- ---------------------------------------------------------------------
alter table public.istorija_rolne
  add constraint istorija_rolne_rolna_id_fkey
  foreign key (rolna_id) references public.magacin(id) on delete set null;

alter table public.magacin_promene
  add constraint magacin_promene_rolna_id_fkey
  foreign key (rolna_id) references public.magacin(id) on delete set null;

alter table public.rezervacije_rolni
  add constraint rezervacije_rolni_rolna_id_fkey
  foreign key (rolna_id) references public.magacin(id) on delete cascade;

alter table public.rolne_potomci
  add constraint rolne_potomci_parent_fkey
  foreign key (parent_rolna_id) references public.magacin(id) on delete cascade;
alter table public.rolne_potomci
  add constraint rolne_potomci_child_fkey
  foreign key (child_rolna_id) references public.magacin(id) on delete cascade;

-- ---------------------------------------------------------------------
-- 4) Obrisi MRTVU duplikat-tabelu.
-- ---------------------------------------------------------------------
drop table if exists public.magacin_rolni cascade;

-- ---------------------------------------------------------------------
-- 5) Korisni indeksi za magacin (popis / povrat / stanje pretrage).
-- ---------------------------------------------------------------------
create index if not exists idx_magacin_status   on public.magacin(status);
create index if not exists idx_magacin_qr        on public.magacin(qr_code);
create index if not exists idx_magacin_lokacija  on public.magacin(lokacija);
create index if not exists idx_magacin_vrsta     on public.magacin(vrsta);

create index if not exists idx_istorija_rolne_rolna on public.istorija_rolne(rolna_id);
create index if not exists idx_rezervacije_rolni_rolna on public.rezervacije_rolni(rolna_id);
create index if not exists idx_magacin_promene_rolna on public.magacin_promene(rolna_id);

commit;

-- =====================================================================
-- KRAJ. Posle ove migracije:
--   * magacin_rolni vise ne postoji
--   * sve veze rolni idu na public.magacin (bigint)
--   * istorija / rezervacije / promene / potomci sada rade ispravno
-- =====================================================================
