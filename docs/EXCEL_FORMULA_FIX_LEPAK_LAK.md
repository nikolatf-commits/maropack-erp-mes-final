# Excel formula fix — Lepak i lak

Urađeno:
- Lepak i lak sada imaju posebno polje `Utrošak kg/1000m`, kao u Excel kalkulaciji.
- Formula za lepak/lak sada prati Excel logiku:
  - trošak = utrošak kg/1000m × broj prolaza × cena €/kg
- Ako se `Utrošak kg/1000m` ne unese, aplikacija ga računa automatski iz potrošnje kg/m².
- Default vrednosti su podešene prema poslatom Excel fajlu:
  - lepak 1: potrošnja 0.002, utrošak 0.36, prolazi 1, cena 6
  - lepak 2: potrošnja 0.002, utrošak 0.36, prolazi 0, cena 6
  - lepak 3: potrošnja 0.002, utrošak 0, prolazi 0, cena 6
  - lak: potrošnja 0.0035, utrošak 1.47, prolazi 0, cena 7.05

Cilj:
- Osnovna cena u aplikaciji treba da se poklapa sa Excel logikom za primer DUPLEX PA15/PE40 CRNI 420 mm / 72000 m.
