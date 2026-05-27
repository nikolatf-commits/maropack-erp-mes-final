# MAROPACK V13 — Supabase Database Core

## Redosled ubacivanja u Supabase

Otvori Supabase → SQL Editor i pokreni redom:

1. `supabase/migrations/001_maropack_core_schema.sql`
2. `supabase/migrations/002_maropack_rls_policies.sql`
3. opciono: `supabase/seed/001_seed_demo_core.sql`

## Tabele koje V13 priprema

- `profiles`
- `kupci`
- `proizvodi`
- `kalkulacije`
- `ponude`
- `master_nalozi`
- `nalozi`
- `rolne`
- `rolne_istorija`
- `rezervacije_rolni`
- `masine`
- `radnici`
- `production_sessions`
- `planovi_proizvodnje`
- `qc_zapisnici`
- `tehnicki_listovi`
- `finansije_naloga`
- `audit_log`

## Uloge

- `admin`
- `manager`
- `planer`
- `magacin`
- `radnik`
- `qc`
- `viewer`

## Važno

Posle kreiranja korisnika u Supabase Auth, ubaci ga u `profiles` i dodeli mu rolu.
Primer:

```sql
insert into public.profiles (id, email, full_name, role)
values ('AUTH_USER_UUID', 'email@example.com', 'Nikola', 'admin');
```

Bez `profiles` zapisa korisnik dobija `viewer` prava.

## Funkcija za kreiranje master naloga iz ponude

V13 dodaje funkciju:

```sql
select public.generate_master_nalog_from_ponuda('PONUDA_UUID');
```

Ona pravi:
- jedan `master_nalog`
- operativne `nalozi` zapise po tipu proizvoda
- menja status ponude u `odobreno`

## Sledeći korak posle V13

V14 treba da poveže React dugmad direktno sa ovom SQL funkcijom i da ukloni lokalni fallback tamo gde više nije potreban.
