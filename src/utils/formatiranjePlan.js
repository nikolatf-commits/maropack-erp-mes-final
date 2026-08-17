// MAROPACK — plan reza za formatiranje (čista logika, bez baze/UI).
// Ulaz: širina matične, dužina matične, izlazne širine (niz), dužina komada (opciono).
// Izlaz: lista nastalih rolni sa LOT/n, bočni otpad, broj traka po širini.

function toNum(v) { return Number(String(v ?? "").replace(",", ".")) || 0; }

// Parsiraj "655, 655" ili "440,440,440" u niz brojeva.
export function parsirajSirine(txt) {
    return String(txt || "").split(",").map((x) => toNum(x)).filter((x) => x > 0);
}

// Automatski predlog širina: matična / ciljna = koliko traka te širine staje.
export function autoSirine(sirinaMat, ciljna) {
    const n = ciljna > 0 ? Math.floor(toNum(sirinaMat) / toNum(ciljna)) : 0;
    return Array.from({ length: Math.max(0, n) }, () => toNum(ciljna));
}

// Glavni proračun.
// matica: { sirina, duzina, lot, br_rolne, vrsta, oznaka, debljina, dobavljac, gsm }
// sirine: niz izlaznih širina (mm)
// duzinaKomada: na koliko metara se seče po dužini (0/prazno = cela dužina = 1 komad)
export function planReza(matica, sirine, duzinaKomada) {
    const sirMat = toNum(matica.sirina);
    const duzMat = toNum(matica.duzina);
    const trake = (sirine || []).filter((x) => x > 0);
    const zbirSirina = trake.reduce((a, b) => a + b, 0);
    const bocniOtpad = Math.max(0, sirMat - zbirSirina);

    // podela po dužini na komade
    const dk = toNum(duzinaKomada);
    let duzine = [];
    if (dk > 0 && dk < duzMat) {
        let ostalo = duzMat;
        while (ostalo > 0.5) { const kom = Math.min(dk, ostalo); duzine.push(Math.round(kom)); ostalo -= kom; }
    } else {
        duzine = [Math.round(duzMat)];
    }

    // nastale rolne: za svaku traku (širinu) × svaki komad (dužinu)
    const lotBaza = String(matica.lot || matica.br_rolne || "LOT").trim();
    const rolne = [];
    let n = 0;
    trake.forEach((sir) => {
        duzine.forEach((duz) => {
            n += 1;
            const gsm = toNum(matica.gsm);
            const kg = gsm ? (duz * sir * gsm) / 1000000 : 0;
            rolne.push({
                redni: n,
                lot: lotBaza + "/" + n,
                sirina: sir,
                duzina: duz,
                kg: Math.round(kg * 100) / 100,
                vrsta: matica.vrsta || "",
                oznaka: matica.oznaka || "",
                debljina: matica.debljina || "",
                dobavljac: matica.dobavljac || "",
                parent_br: matica.br_rolne || "",
                parent_lot: matica.lot || "",
            });
        });
    });

    return {
        ok: trake.length > 0 && zbirSirina <= sirMat,
        greska: trake.length === 0 ? "Unesi bar jednu izlaznu širinu." :
            zbirSirina > sirMat ? `Zbir širina (${zbirSirina} mm) veći od matične (${sirMat} mm).` : "",
        sirinaMat: sirMat,
        duzinaMat: duzMat,
        brojTrakaPoSirini: trake.length,
        sirineTraka: trake,
        bocniOtpad,
        komadaPoDuzini: duzine.length,
        duzineKomada: duzine,
        ukupnoRolni: rolne.length,
        rolne,
    };
}
