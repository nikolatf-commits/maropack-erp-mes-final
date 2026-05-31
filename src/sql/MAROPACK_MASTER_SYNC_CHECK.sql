-- Provera da aplikacija i baza imaju potrebne kolone
select 'magacin.vrsta' as check_name, exists(select 1 from information_schema.columns where table_schema='public' and table_name='magacin' and column_name='vrsta') as ok
union all select 'magacin.pod_vrsta', exists(select 1 from information_schema.columns where table_schema='public' and table_name='magacin' and column_name='pod_vrsta')
union all select 'magacin.oznaka_materijala', exists(select 1 from information_schema.columns where table_schema='public' and table_name='magacin' and column_name='oznaka_materijala')
union all select 'magacin.datum_proizvodnje', exists(select 1 from information_schema.columns where table_schema='public' and table_name='magacin' and column_name='datum_proizvodnje')
union all select 'kalkulacije_folije.materijali_struktura', exists(select 1 from information_schema.columns where table_schema='public' and table_name='kalkulacije_folije' and column_name='materijali_struktura')
union all select 'kalkulacije_kese.materijali_struktura', exists(select 1 from information_schema.columns where table_schema='public' and table_name='kalkulacije_kese' and column_name='materijali_struktura')
union all select 'kalkulacije_spulne.materijali_struktura', exists(select 1 from information_schema.columns where table_schema='public' and table_name='kalkulacije_spulne' and column_name='materijali_struktura')
union all select 'nalozi.materijali_struktura', exists(select 1 from information_schema.columns where table_schema='public' and table_name='nalozi' and column_name='materijali_struktura');
