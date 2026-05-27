-- Optional seed/demo data for local testing.
-- You can run this after migrations.

insert into public.masine (naziv, tip_operacije, sifra, max_sirina_mm, standard_brzina, setup_min, lokacija)
values
  ('Flexo 8 boja', 'stampa', 'M-FLEXO-01', 1300, 180, 45, 'Proizvodnja'),
  ('Kaširka Nordmeccanica', 'kasiranje', 'M-KAS-01', 1400, 220, 60, 'Proizvodnja'),
  ('Rezač Atlas', 'rezanje', 'M-REZ-01', 1500, 350, 30, 'Proizvodnja'),
  ('Mašina za kese', 'kesa', 'M-KESA-01', 600, 120, 40, 'Proizvodnja'),
  ('Formatiranje rolni', 'formatiranje', 'M-FORM-01', 1600, 300, 25, 'Proizvodnja')
on conflict (sifra) do nothing;

insert into public.kupci (naziv, kontakt, email)
values ('DEMO Kupac', 'Demo Kontakt', 'demo@example.com')
on conflict do nothing;

insert into public.rolne (qr_code, broj_rolne, materijal, struktura, sirina_mm, duzina_m, pocetna_duzina_m, lokacija, status)
values
  ('ROLL-DEMO-1440-001', 'R-1440-001', 'BOPP', 'BOPP 20', 1440, 12000, 12000, 'A1', 'dostupna'),
  ('ROLL-DEMO-500-001', 'R-500-001', 'PET/PE', 'PET 12 / PE 50', 500, 8000, 8000, 'A2', 'dostupna')
on conflict (qr_code) do nothing;
