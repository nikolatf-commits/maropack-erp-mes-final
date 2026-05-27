-- MAROPACK ERP/MES RLS POLICIES V13
-- Run after 001_maropack_core_schema.sql

alter table public.profiles enable row level security;
alter table public.kupci enable row level security;
alter table public.proizvodi enable row level security;
alter table public.masine enable row level security;
alter table public.radnici enable row level security;
alter table public.kalkulacije enable row level security;
alter table public.ponude enable row level security;
alter table public.master_nalozi enable row level security;
alter table public.nalozi enable row level security;
alter table public.rolne enable row level security;
alter table public.rolne_istorija enable row level security;
alter table public.rezervacije_rolni enable row level security;
alter table public.production_sessions enable row level security;
alter table public.planovi_proizvodnje enable row level security;
alter table public.qc_zapisnici enable row level security;
alter table public.tehnicki_listovi enable row level security;
alter table public.finansije_naloga enable row level security;
alter table public.audit_log enable row level security;

-- Drop existing generated policies to avoid duplicate errors during rerun
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public' and policyname like 'maropack_%'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Profiles
create policy maropack_profiles_select_own_or_admin on public.profiles
for select using (id = auth.uid() or public.is_admin());
create policy maropack_profiles_admin_all on public.profiles
for all using (public.is_admin()) with check (public.is_admin());

-- Read access: all authenticated users can read operational tables
create policy maropack_kupci_read on public.kupci for select to authenticated using (true);
create policy maropack_proizvodi_read on public.proizvodi for select to authenticated using (true);
create policy maropack_masine_read on public.masine for select to authenticated using (true);
create policy maropack_radnici_read on public.radnici for select to authenticated using (true);
create policy maropack_kalkulacije_read on public.kalkulacije for select to authenticated using (true);
create policy maropack_ponude_read on public.ponude for select to authenticated using (true);
create policy maropack_master_nalozi_read on public.master_nalozi for select to authenticated using (true);
create policy maropack_nalozi_read on public.nalozi for select to authenticated using (true);
create policy maropack_rolne_read on public.rolne for select to authenticated using (true);
create policy maropack_rolne_istorija_read on public.rolne_istorija for select to authenticated using (true);
create policy maropack_rezervacije_rolni_read on public.rezervacije_rolni for select to authenticated using (true);
create policy maropack_production_sessions_read on public.production_sessions for select to authenticated using (true);
create policy maropack_planovi_proizvodnje_read on public.planovi_proizvodnje for select to authenticated using (true);
create policy maropack_qc_zapisnici_read on public.qc_zapisnici for select to authenticated using (true);
create policy maropack_tehnicki_listovi_read on public.tehnicki_listovi for select to authenticated using (true);
create policy maropack_finansije_naloga_read on public.finansije_naloga for select to authenticated using (public.current_user_role() in ('admin','manager','planer'));
create policy maropack_audit_log_read on public.audit_log for select to authenticated using (public.current_user_role() in ('admin','manager'));

-- Master data write: admin/manager/planer
create policy maropack_kupci_write on public.kupci for all to authenticated using (public.can_plan()) with check (public.can_plan());
create policy maropack_proizvodi_write on public.proizvodi for all to authenticated using (public.can_plan()) with check (public.can_plan());
create policy maropack_masine_write on public.masine for all to authenticated using (public.can_manage()) with check (public.can_manage());
create policy maropack_radnici_write on public.radnici for all to authenticated using (public.can_manage()) with check (public.can_manage());

-- Calculation / offer / planning write: admin/manager/planer
create policy maropack_kalkulacije_write on public.kalkulacije for all to authenticated using (public.can_plan()) with check (public.can_plan());
create policy maropack_ponude_write on public.ponude for all to authenticated using (public.can_plan()) with check (public.can_plan());
create policy maropack_master_nalozi_write on public.master_nalozi for all to authenticated using (public.can_plan()) with check (public.can_plan());
create policy maropack_nalozi_write on public.nalozi for all to authenticated using (public.can_plan()) with check (public.can_plan());
create policy maropack_planovi_proizvodnje_write on public.planovi_proizvodnje for all to authenticated using (public.can_plan()) with check (public.can_plan());

-- Warehouse write: admin/manager/planer/magacin
create policy maropack_rolne_write on public.rolne for all to authenticated
using (public.current_user_role() in ('admin','manager','planer','magacin'))
with check (public.current_user_role() in ('admin','manager','planer','magacin'));
create policy maropack_rolne_istorija_write on public.rolne_istorija for all to authenticated
using (public.current_user_role() in ('admin','manager','planer','magacin'))
with check (public.current_user_role() in ('admin','manager','planer','magacin'));
create policy maropack_rezervacije_rolni_write on public.rezervacije_rolni for all to authenticated
using (public.current_user_role() in ('admin','manager','planer','magacin'))
with check (public.current_user_role() in ('admin','manager','planer','magacin'));

-- Production write: workers and above
create policy maropack_production_sessions_write on public.production_sessions for all to authenticated
using (public.current_user_role() in ('admin','manager','planer','radnik'))
with check (public.current_user_role() in ('admin','manager','planer','radnik'));

-- QC write: QC and above
create policy maropack_qc_zapisnici_write on public.qc_zapisnici for all to authenticated
using (public.current_user_role() in ('admin','manager','planer','qc'))
with check (public.current_user_role() in ('admin','manager','planer','qc'));
create policy maropack_tehnicki_listovi_write on public.tehnicki_listovi for all to authenticated
using (public.current_user_role() in ('admin','manager','planer','qc'))
with check (public.current_user_role() in ('admin','manager','planer','qc'));

-- Finance write: admin/manager
create policy maropack_finansije_naloga_write on public.finansije_naloga for all to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

-- Audit log write: authenticated insert only, read restricted above
create policy maropack_audit_log_insert on public.audit_log for insert to authenticated with check (user_id = auth.uid() or user_id is null);
