# MAROPACK V52 — FAZA 12: Final QA / Deployment

Ova faza ne dodaje novi proizvodni ekran, već uvodi završni kontrolni centar za proveru sistema pre realnog puštanja u rad.

## Šta je dodato

- Modul: `Sistem → Final QA / Deployment`
- Interaktivni QA checklist
- Smoke test lista
- Deploy koraci
- Provera spremnosti baze, workflow-a, MES-a, AI-a i QR procesa
- Upozorenje za kontrolisano puštanje u proizvodnju

## Pre pokretanja

```bash
npm install --legacy-peer-deps
npm run dev
```

## Pre deploy-a

```bash
npm run build
```

## Supabase

Pre realnog korišćenja proveriti:

1. Da su sve SQL migracije pokrenute.
2. Da postoje RLS pravila.
3. Da su korisničke role podešene.
4. Da je backup testiran.
5. Da se aplikacija testira prvo na demo nalogu.

## Preporučen realni test

1. Ubaci 3–5 stvarnih rolni.
2. Napravi jedan realan proizvod.
3. Napravi kalkulaciju i ponudu.
4. Kreiraj nalog.
5. Rezerviši rolnu.
6. Napravi plan rezanja.
7. Prihvati plan.
8. Proveri skidanje metraže i QR ostatka.
9. Upisi MES učinak.
10. Završi QC kontrolu.
