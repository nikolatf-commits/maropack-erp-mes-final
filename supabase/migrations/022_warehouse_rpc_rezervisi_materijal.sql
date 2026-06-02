-- =====================================================================
-- 022_warehouse_rpc_rezervisi_materijal.sql
-- MAROPACK — RPC funkcija za rezervaciju materijala (rolne)
--
-- ZASTO:
--   Frontend (src/components/RezervacijaMaterijala.jsx) zove
--     supabase.rpc('rezervisi_materijal', {
--       p_rolna_id, p_kolicina_m, p_nalog_id
--     })
--   ali ta funkcija NIJE postojala u bazi -> rezervacija je pucala.
--
--   Druge dve magacinske RPC funkcije vec postoje u zivoj bazi:
--     * skini_metre_rolne(p_rolna_id, p_skinuto)
--     * povrat_rolne_u_magacin(p_rolna_id, p_nova_metraza, p_nova_lokacija)
--   Ova funkcija prati isti stil (bigint p_rolna_id, jsonb povratna vrednost).
--
-- PREDUSLOV:
--   Pokrenuti POSLE 021_warehouse_consolidation.sql
--   (tada rezervacije_rolni.rolna_id pokazuje na magacin.id = bigint).
--
-- LOGIKA:
--   1. Zakljucaj red rolne (FOR UPDATE) da ne dodje do duple rezervacije.
--   2. Izracunaj slobodno = metraza_ost - rezervisano.
--   3. Ako trazena kolicina > slobodno -> vrati { success:false, error:... }.
--   4. Inace povecaj magacin.rezervisano, upisi red u rezervacije_rolni,
--      i vrati { success:true, ... }.
-- =====================================================================

create or replace function public.rezervisi_materijal(
  p_rolna_id   bigint,
  p_kolicina_m numeric,
  p_nalog_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rolna       public.magacin%rowtype;
  v_slobodno    numeric;
  v_rezervisano numeric;
begin
  if p_kolicina_m is null or p_kolicina_m <= 0 then
    return jsonb_build_object('success', false, 'error', 'Kolicina mora biti veca od 0');
  end if;

  -- Zakljucaj rolnu da spreci paralelnu rezervaciju
  select * into v_rolna
  from public.magacin
  where id = p_rolna_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Rolna nije pronadjena');
  end if;

  v_rezervisano := coalesce(v_rolna.rezervisano, 0);
  v_slobodno    := coalesce(v_rolna.metraza_ost, 0) - v_rezervisano;

  if p_kolicina_m > v_slobodno then
    return jsonb_build_object(
      'success', false,
      'error', format('Nedovoljno materijala: trazeno %s m, slobodno %s m', p_kolicina_m, v_slobodno)
    );
  end if;

  -- 1) Povecaj rezervisano na rolni
  update public.magacin
  set rezervisano = v_rezervisano + p_kolicina_m,
      dodeljeno_nalogu = coalesce(p_nalog_id::text, dodeljeno_nalogu),
      status = case
                 when (v_rezervisano + p_kolicina_m) >= coalesce(metraza_ost, 0)
                 then 'Rezervisano'
                 else status
               end,
      updated_at = now()
  where id = p_rolna_id;

  -- 2) Evidentiraj rezervaciju (rolna_id je sada bigint posle migracije 021)
  insert into public.rezervacije_rolni (rolna_id, nalog_id, rezervisano_m, status, created_at)
  values (p_rolna_id, p_nalog_id, p_kolicina_m, 'aktivno', now());

  -- 3) Trag u istoriji rolne (ako tabela/kolone postoje)
  begin
    insert into public.magacin_promene (rolna_id, tip_promene, metara, napomena, created_at)
    values (p_rolna_id, 'REZERVACIJA', p_kolicina_m,
            format('Rezervisano za nalog %s', coalesce(p_nalog_id::text, '—')), now());
  exception when others then
    -- ako magacin_promene jos nije uskladjena, ne rusi rezervaciju
    null;
  end;

  return jsonb_build_object(
    'success', true,
    'rolna_id', p_rolna_id,
    'rezervisano_m', p_kolicina_m,
    'novo_rezervisano_ukupno', v_rezervisano + p_kolicina_m,
    'preostalo_slobodno', v_slobodno - p_kolicina_m
  );
end;
$$;

-- Dozvole (Supabase: anon/authenticated zovu RPC)
grant execute on function public.rezervisi_materijal(bigint, numeric, uuid) to anon, authenticated;

-- =====================================================================
-- KRAJ. Posle ove migracije rezervacija materijala radi.
-- =====================================================================
