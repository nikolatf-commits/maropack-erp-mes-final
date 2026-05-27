# MAROPACK V52 — FAZA 2 MES TRACKING + QC PRO

## Urađeno

Dodati su profesionalni MES elementi koji se nastavljaju na FAZU 1:

- novi modul `src/modules/MESTrackingQualityPRO.jsx`
- novi servis `src/services/mesTrackingCore.js`
- povezano u `App.jsx`
- dodato u meni `src/config/navigation.js`
- SQL dopuna u `SUPABASE_SCHEMA_FULL_SYSTEM.sql`

## Novi meni

Proizvodnja → `MES tracking + QC PRO`

## Funkcionalnosti

### Live MES
- izbor radnika
- izbor mašine
- izbor naloga
- upis proizvedene metraže
- upis škarta
- upis zastoja
- QC problem
- live istorija događaja

### Radnici / učinak
- kartice radnika
- metraža po radniku
- škart po radniku
- zastoji po radniku
- broj naloga po radniku
- QR radnika

### Kontrola kvaliteta
- QC checklist
- širina trake
- debljina
- spoj / delaminacija
- boja / otisak
- perforacija
- namotaj / smer

### Traceability
- pregled naloga
- događaji po nalogu
- metraža
- škart
- status

### Magacin PRO pravila
- FIFO prioritet
- LOT traceability
- rezervacije po nalogu
- minimalne zalihe
- inventura
- reklamacije dobavljača
- lokacije
- istorija ulaz/izlaz

## SQL tabele

Dodato:

- `radnici`
- `mes_dogadjaji`
- `qc_kontrole`
- `magacin_promene`

## Build

`npm run build` prolazi uspešno.

Napomena: Vite javlja samo standardno upozorenje da je glavni bundle veliki. To se rešava kasnije lazy loading/code splitting fazom.
