# Baza proizvoda PRO — povezivanje sa kalkulacijama

U ovoj fazi dodat je prvi realan workflow:

## Baza proizvoda → Kalkulacija

Na detalju proizvoda dugme **Kreiraj kalkulaciju** sada:

1. pravi draft kalkulacije iz izabranog proizvoda,
2. prenosi naziv, kupca, tip proizvoda i materijale,
3. upisuje privremeni draft u `localStorage`,
4. otvara odgovarajući kalkulator:
   - folija → Kalkulacija folije,
   - kesa → Kalkulacija kese,
   - špulna → Kalkulacija špulne.

## Važno

Ovo je prva faza povezivanja. Još nije trajni Supabase upis.
Trajno čuvanje kalkulacija i istorija proizvoda rade se u sledećoj fazi.

## Šta nije dirano

- postojeći template-i nisu obrisani,
- postojeće kalkulacione formule nisu menjane,
- Material PRO tabela ostaje sa kolonama Š i L,
- ne vraća se checkbox Žuta.
