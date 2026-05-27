# MAROPACK ERP/MES — Final Production Runbook

## 1. Instalacija

```bash
npm install --legacy-peer-deps
npm run build
npm run dev
```

## 2. Obavezni `.env`

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
```

Bez `.env` aplikacija koristi demo fallback i nije spremna za realan rad.

## 3. Redosled SQL-a

1. `SUPABASE_SCHEMA_FULL_SYSTEM.sql`
2. Svi fazni SQL dodaci ako nisu već pokrenuti
3. `supabase/migrations/999_final_production_migration.sql`

## 4. Smoke test pre rada

- Login admin korisnika
- Unos 5 realnih rolni
- QR štampa jedne i više rolni
- Kreiranje proizvoda i template-a
- Kalkulacija → ponuda → nalog
- Plan rezanja → Prihvati plan
- Skidanje metraže i QR ostatka
- MES start/stop radnika
- QC kontrola
- Analiza potrošnje
- AI pitanje i predlog bez automatskog izvršenja

## 5. Pravilo za AI

AI može da predlaže akcije, ali ne sme automatski menjati magacin, naloge ili plan proizvodnje bez potvrde korisnika.

## 6. Backup

Pre svake produkcione izmene:

- Supabase SQL export
- Storage export ako ima fajlova
- ZIP aktuelne verzije aplikacije
- Zabeležiti verziju u audit log

## 7. Incident procedura

1. Ne brisati podatke.
2. Skinuti screenshot greške.
3. Proveriti browser console.
4. Proveriti Supabase logs/RLS.
5. Proveriti `system_audit_log` i `workflow_events`.
6. Vratiti poslednju stabilnu verziju ako je potrebno.
