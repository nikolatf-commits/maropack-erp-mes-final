# MAROPACK MASTER CLEAN — arhitektura sređivanja

## 1. Template proizvoda nije kalkulacija
Template čuva tehničku definiciju proizvoda i ne sme da bude mesto gde se unose cene materijala.
Cena ide u kalkulaciju i ponudu, a template služi da sistem zna šta proizvod jeste.

## 2. Materijal u template-u ide u jednoj liniji
Format sloja:

`VRSTA | OZNAKA | DEBLJINA | ŠIRINA | KOEFICIJENT | NAPOMENA`

Primer:

`BOPP | Transparent | 20µ | 840 mm | 1.00 | spoljašnja štampa`

## 3. Izbor konkretne rolne nije u template-u
Template definiše potreban materijal, ali ne bira konkretnu rolnu iz magacina.
Konkretna rola se bira u fazi **Potreba materijala / Rezervacija materijala**.

## 4. Nalog za potrebu materijala mora da prikazuje
- QR kod rolne
- broj rolne
- lokaciju
- LOT / šaržu
- širinu
- metražu
- kg
- status
- rezervisano za nalog
- parent rolnu ako je rola nastala formatiranjem

## 5. Baza proizvoda je centralna kartica proizvoda
Svaki proizvod treba da ima karticu sa tabovima:
- Osnovni podaci
- Materijali
- Štampa
- Perforacija
- Finalna rolna
- KPDF / dokumenti
- Istorija naloga
- Potreba materijala

## 6. Dokumentacija proizvoda
U kartici proizvoda dodaju se reference za:
- KPDF / tehnički PDF
- izgled perforacije
- izgled finalne rolne
- lokaciju dokumentacije

## 7. Dalji redosled rada
1. Stabilizacija i čišćenje strukture fajlova
2. Baza proizvoda MASTER CLEAN
3. Potreba materijala / rezervacija rolni
4. Profesionalni nalozi po tipu proizvoda
5. QR sledljivost rolni
6. Kalkulacije i ponude
7. AI pomoćnik
