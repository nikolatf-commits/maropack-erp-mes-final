# MATERIALI JEDAN RED - FIX

U ovoj verziji je dodat novi zajednicki UI za materijale:

- `src/components/MaterialLayersTablePRO.jsx`

Primena:

- `KalkulacijaFolije.jsx`
- `KalkulacijaKese.jsx`
- `KalkulacijaSpulne.jsx`
- `ProductTemplatePRO.jsx`

Sta je sredjeno:

- Vrsta materijala, oznaka, debljina, koeficijent, tezina, sirina, cena i opcije su u jednom redu.
- Template moze da radi bez cene materijala.
- Kalkulacije mogu da prikazu cenu, jer cena pripada kalkulaciji/ponudi, ne tehnickom template-u.
- Uklonjen je stari prikaz gde je MaterialSelector bio u jednom bloku, a tezina/cena/sirina ispod njega.

Napomena:

- Poslovna logika kalkulacija nije menjana.
- Menjan je UI prikaz materijala i nacin unosa u tabeli.
