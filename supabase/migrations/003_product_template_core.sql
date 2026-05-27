-- MAROPACK V15 - PRODUCT TEMPLATE CORE
-- Run after V13/V14 migrations.

alter table public.proizvodi
  add column if not exists podaci jsonb not null default '{}'::jsonb;

create index if not exists idx_proizvodi_podaci on public.proizvodi using gin (podaci);
create index if not exists idx_proizvodi_struktura_materijala on public.proizvodi using gin (struktura_materijala);

create or replace function public.create_kalkulacija_from_product(p_proizvod_id uuid, p_kolicina numeric default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.proizvodi%rowtype;
  v_id uuid;
begin
  select * into v_product from public.proizvodi where id = p_proizvod_id and active = true;
  if not found then
    raise exception 'Proizvod nije pronađen';
  end if;

  insert into public.kalkulacije (
    proizvod_id, kupac_id, naziv, tip, kolicina, jedinica,
    ulazni_parametri, rezultat, status, created_by
  ) values (
    v_product.id,
    v_product.kupac_id,
    v_product.naziv,
    v_product.tip,
    coalesce(p_kolicina, nullif((v_product.dimenzije->>'kolicina_standard')::numeric, null)),
    coalesce(v_product.dimenzije->>'jedinica', 'm'),
    jsonb_build_object(
      'dimenzije', v_product.dimenzije,
      'struktura_materijala', v_product.struktura_materijala,
      'tehnicki_parametri', v_product.tehnicki_parametri,
      'cena_parametri', v_product.cena_parametri,
      'standardne_operacije', v_product.standardne_operacije,
      'crtez', v_product.crtez
    ),
    '{}'::jsonb,
    'draft',
    auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;
