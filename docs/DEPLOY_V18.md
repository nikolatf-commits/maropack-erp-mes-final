# MAROPACK V18 - Deploy Guide

## 1. Lokalna provera
```powershell
npm install --legacy-peer-deps
npm run build
npm run dev
```

## 2. Supabase
1. Otvori Supabase project.
2. Idi na SQL Editor.
3. Pokreni migracije iz `supabase/migrations` redom.
4. Proveri Authentication > Users i dodeli role u tabeli `profiles`.

## 3. Vercel
1. Importuj GitHub repo u Vercel.
2. Framework: Vite.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Dodaj Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - opciono `VITE_GEMINI_API_KEY`

## 4. Pre produkcije
- Napravi backup baze.
- Testiraj workflow: kalkulacija → ponuda → master nalog → operacije → rolne → proizvodnja → QC → KPI.
- Proveri RLS za svaku ulogu.

## 5. Backup strategija
- Supabase dnevni backup.
- JSON export iz menija `Sistem → Backup & Security` pre većih izmena.
- SQL migracije čuvati u GitHub-u.
