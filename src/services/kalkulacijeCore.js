// ─────────────────────────────────────────────────────────────────────────────
//  MAROPACK — KALKULACIJE ZA AI AGENTA
//
//  Formule su preslikane 1:1 iz tvojih modula:
//    KalkulacijaFolije.jsx  (izracunaj)
//    KalkulacijaKese.jsx    (useMemo → setRez)
//    KalkulacijaSpulne.jsx  (useMemo)
//
//  Svaka funkcija vraća i `koraci` — razrađen račun red po red, da agent može
//  da objasni kako je došao do cene (a ne samo da izbaci broj).
// ─────────────────────────────────────────────────────────────────────────────

const N = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const R2 = (v) => Math.round(N(v) * 100) / 100;
const R4 = (v) => Math.round(N(v) * 10000) / 10000;
const eur = (v) => R2(v).toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

// ═════════════════════════════ FOLIJA ════════════════════════════════════════
/**
 * Ulaz:
 *  sirina (mm), metraza (m, podrazumevano 1000), nalog (broj ponavljanja, npr. ukupna metraža/1000)
 *  materijali: [{ naziv, tezina (g/m²), cena (€/kg), stampa (bool), lakira (bool), skartSirina (mm) }]
 *  lepak: [{ utrosak (kg/1000m), prolazi, cena }]  — kao u Excel-u
 *  lak: { potrosnja, utrosak, prolazi, cena }
 *  kasiranje: { cena }   (€ po m² prolazu — Excel: cena×širina×metraža×prolazi/1000)
 *  stampaCena (€/kg), lakiranjeCena (€/kg)
 *  transport (€/kg), pakovanje (€ fiksno), dorada (€/kg)
 *  skart (%), marza (%)
 */
export function kalkulacijaFolije(u = {}) {
    const sirina = N(u.sirina);
    const metraza = N(u.metraza) || 1000;
    const nalog = N(u.nalog) || 1;
    const skart = N(u.skart);
    const marza = N(u.marza);
    const stampaCena = N(u.stampaCena);
    const lakiranjeCena = N(u.lakiranjeCena);
    const transport = N(u.transport);
    const pakovanje = N(u.pakovanje);
    const dorada = N(u.dorada);
    const materijali = Array.isArray(u.materijali) ? u.materijali : [];
    const lepakRows = Array.isArray(u.lepak) ? u.lepak : [];
    const lak = u.lak || {};
    const kasiranje = u.kasiranje || {};

    const koraci = [];
    if (!sirina) koraci.push("UPOZORENJE: širina nije zadata — kg materijala će biti 0.");

    // 1) kg po sloju:  (širina × metraža × g/m²) / 1.000.000
    let ukupnoKg = 0, ukupnoMatTrosak = 0, skartNestandardnih = 0;
    const slojevi = materijali.map((m) => {
        const tez = N(m.tezina ?? m.gm2 ?? m.gsm);
        const cena = N(m.cena ?? m.cena_kg);
        const kg = tez ? (sirina * metraza * tez) / 1000000 : 0;
        const trosak = kg * cena;
        ukupnoKg += kg; ukupnoMatTrosak += trosak;

        const skartW = N(m.skartSirina ?? m.skart_sirina);
        const skartEur = skartW > 0 ? (skartW * metraza * tez * cena) / 1000000 : 0;
        skartNestandardnih += skartEur;

        if (tez) {
            koraci.push(`Sloj ${m.naziv || m.tip || "?"}: ${sirina} mm × ${metraza} m × ${tez} g/m² ÷ 1.000.000 = ${R4(kg)} kg → × ${cena} €/kg = ${eur(trosak)}`);
            if (skartEur) koraci.push(`   + škart nestandardne širine ${skartW} mm = ${eur(skartEur)}`);
        }
        return { naziv: m.naziv || m.tip || "", tezina: tez, cena, kg: R4(kg), trosak: R2(trosak), stampa: !!m.stampa, lakira: !!m.lakira };
    });

    // 2) štampa i lakiranje — po kg slojeva koji su čekirani
    const stampaKg = slojevi.reduce((s, x, i) => s + (materijali[i]?.stampa ? x.kg : 0), 0);
    const lakiranjeKg = slojevi.reduce((s, x, i) => s + (materijali[i]?.lakira ? x.kg : 0), 0);
    const stampaTrosak = stampaKg * stampaCena;
    const lakiranjeTrosak = lakiranjeKg * lakiranjeCena;
    if (stampaTrosak) koraci.push(`Štampa: ${R4(stampaKg)} kg × ${stampaCena} €/kg = ${eur(stampaTrosak)}`);
    if (lakiranjeTrosak) koraci.push(`Lakiranje: ${R4(lakiranjeKg)} kg × ${lakiranjeCena} €/kg = ${eur(lakiranjeTrosak)}`);

    // 3) lepak: utrošak × prolazi × cena  (Excel 1:1)
    let lepakKg = 0, lepakTrosak = 0;
    lepakRows.forEach((l, i) => {
        const ut = N(l.utrosak), pr = N(l.prolazi), ce = N(l.cena);
        if (ut && pr) {
            lepakKg += ut * pr; lepakTrosak += ce * ut * pr;
            koraci.push(`Lepak ${i + 1}: ${ut} kg × ${pr} prolaz(a) × ${ce} €/kg = ${eur(ce * ut * pr)}`);
        }
    });

    // 4) lak
    const lakAuto = (sirina * metraza * N(lak.potrosnja)) / 1000;
    const lakUt = N(lak.utrosak) || lakAuto;
    const lakPr = N(lak.prolazi);
    const lakKg = lakUt * lakPr;
    const lakTrosak = N(lak.cena) * lakUt * lakPr;
    lepakKg += lakKg; lepakTrosak += lakTrosak;
    if (lakTrosak) koraci.push(`Lak: ${R4(lakUt)} kg × ${lakPr} prolaz(a) × ${N(lak.cena)} €/kg = ${eur(lakTrosak)}`);

    // 5) kaširanje: broj prolaza = broj aktivnih slojeva − 1
    const aktivnih = slojevi.filter((x) => x.tezina > 0).length;
    const kasProlazi = Math.max(0, aktivnih - 1);
    const kasTrosak = (N(kasiranje.cena) * sirina * metraza * kasProlazi) / 1000;
    if (kasTrosak) koraci.push(`Kaširanje: ${N(kasiranje.cena)} × ${sirina} mm × ${metraza} m × ${kasProlazi} prolaz(a) ÷ 1000 = ${eur(kasTrosak)}`);

    // 6) transport / pakovanje / dorada — ULAZE u osnovu (pa dobijaju škart i maržu)
    const transportTrosak = transport * ukupnoKg;
    const doradaTrosak = dorada * ukupnoKg;
    if (transportTrosak) koraci.push(`Transport: ${transport} €/kg × ${R4(ukupnoKg)} kg = ${eur(transportTrosak)}`);
    if (pakovanje) koraci.push(`Pakovanje: ${eur(pakovanje)}`);
    if (doradaTrosak) koraci.push(`Dorada: ${dorada} €/kg × ${R4(ukupnoKg)} kg = ${eur(doradaTrosak)}`);

    // 7) sabiranje
    const osnovnaCena = ukupnoMatTrosak + lepakTrosak + kasTrosak + stampaTrosak + lakiranjeTrosak + transportTrosak + pakovanje + doradaTrosak;
    const cenaSaSkartom = osnovnaCena * (1 + skart / 100);
    const cenaSaDodatkom = cenaSaSkartom + skartNestandardnih;
    const konacnaCena = cenaSaDodatkom * (1 + marza / 100);

    koraci.push(`OSNOVNA (na ${metraza} m) = ${eur(osnovnaCena)}`);
    koraci.push(`+ škart ${skart}% → ${eur(cenaSaSkartom)}`);
    if (skartNestandardnih) koraci.push(`+ škart nestandardnih = ${eur(cenaSaDodatkom)}`);
    koraci.push(`+ marža ${marza}% → KONAČNA ${eur(konacnaCena)} na ${metraza} m`);

    return {
        tip: "folija", jedinica: `€ / ${metraza} m`,
        ukupno_kg: R4(ukupnoKg),
        slojevi,
        troskovi: {
            materijal: R2(ukupnoMatTrosak), lepak_i_lak: R2(lepakTrosak), kasiranje: R2(kasTrosak),
            stampa: R2(stampaTrosak), lakiranje: R2(lakiranjeTrosak),
            transport: R2(transportTrosak), pakovanje: R2(pakovanje), dorada: R2(doradaTrosak),
        },
        osnovna_cena: R2(osnovnaCena),
        cena_sa_skartom: R2(cenaSaSkartom),
        skart_nestandardnih: R2(skartNestandardnih),
        cena_sa_dodatkom: R2(cenaSaDodatkom),
        konacna_cena: R2(konacnaCena),
        cena_po_kg: R4(ukupnoKg > 0 ? cenaSaDodatkom / ukupnoKg : 0),
        cena_po_kg_sa_marzom: R4(ukupnoKg > 0 ? konacnaCena / ukupnoKg : 0),
        za_ceo_nalog: {
            ponavljanja: nalog,
            ukupna_duzina_m: metraza * nalog,
            ukupno_kg: R4(ukupnoKg * nalog),
            osnovna: R2(osnovnaCena * nalog),
            konacna: R2(konacnaCena * nalog),
        },
        // Koliko materijala TREBA NABAVITI / REZERVISATI po sloju — sa uračunatim škartom.
        potrebno_materijala: slojevi.filter((x) => x.tezina > 0).map((x) => ({
            sloj: x.naziv || "sloj",
            sirina_mm: sirina,
            duzina_m: metraza * nalog,
            duzina_sa_skartom_m: Math.ceil(metraza * nalog * (1 + skart / 100)),
            kg: R2(x.kg * nalog),
            kg_sa_skartom: R2(x.kg * nalog * (1 + skart / 100)),
        })),
        kasiranje_prolazi: kasProlazi,
        koraci,
    };
}

// ═════════════════════════════ KESA ══════════════════════════════════════════
/**
 * Ulaz: sirina (mm), duzina (mm), klapna (mm), falta (mm), kolicina (kom),
 *  materijali [{tezina g/m², cena €/kg}], skart %, marza %,
 *  stampa (bool) + stampaCena (€/kg), transportCena (€/kg),
 *  klise: { broj, cena }, ojacanje: { sirina, debljina, cena },
 *  adh: { odsecak, cena }, ostaleOpcijeEur (€ / 1000 kom)
 */
export function kalkulacijaKese(u = {}) {
    const sirina = N(u.sirina), duzina = N(u.duzina), klapna = N(u.klapna), falta = N(u.falta);
    const kolicina = N(u.kolicina) || 1000;
    const skart = N(u.skart), marza = N(u.marza);
    const materijali = Array.isArray(u.materijali) ? u.materijali : [];
    const koraci = [];

    let ukTezGm2 = 0, ukCenaKg = 0, br = 0;
    materijali.forEach((m) => { const t = N(m.tezina ?? m.gm2); if (t > 0) { ukTezGm2 += t; ukCenaKg += N(m.cena); br++; } });
    const avgCenaKg = br > 0 ? ukCenaKg / br : 2.9;
    koraci.push(`Ukupna gramaža slojeva: ${R2(ukTezGm2)} g/m² · prosečna cena ${R2(avgCenaKg)} €/kg`);

    // kg na 1000 komada
    const tezKg1000 = ((sirina + klapna) / 1000) * ((duzina + falta) / 1000) * ukTezGm2;
    koraci.push(`Težina 1000 kom: (${sirina}+${klapna})/1000 × (${duzina}+${falta})/1000 × ${R2(ukTezGm2)} = ${R4(tezKg1000)} kg`);

    const kgSaSkartom = tezKg1000 * (1 + skart / 100);
    const cenaMatKom = kgSaSkartom * avgCenaKg;
    koraci.push(`Materijal: ${R4(kgSaSkartom)} kg (sa škartom ${skart}%) × ${R2(avgCenaKg)} €/kg = ${eur(cenaMatKom)} /1000 kom`);

    const stmTr = u.stampa ? tezKg1000 * N(u.stampaCena) : 0;
    if (stmTr) koraci.push(`Štampa: ${R4(tezKg1000)} kg × ${N(u.stampaCena)} €/kg = ${eur(stmTr)}`);

    const adh = u.adh || {};
    const adhTr = u.adhTraka ? N(adh.odsecak) * N(adh.cena) : 0;
    if (adhTr) koraci.push(`ADH traka: ${eur(adhTr)}`);

    const oj = u.ojacanje || {};
    const ojTr = u.ojacanjeOn ? (sirina / 1000) * (N(oj.sirina) / 1000) * (N(oj.debljina) * 0.91) * N(oj.cena) * 1000 : 0;
    if (ojTr) koraci.push(`Ojačanje: ${eur(ojTr)}`);

    const klise = u.klise || {};
    const kliseTr = u.kliseOn ? (N(klise.broj) * N(klise.cena)) / (kolicina / 1000) : 0;
    if (kliseTr) koraci.push(`Kliše: ${N(klise.broj)} × ${N(klise.cena)} € ÷ (${kolicina}/1000) = ${eur(kliseTr)}`);

    const ostale = N(u.ostaleOpcijeEur);
    if (ostale) koraci.push(`Ostale opcije (zumba, var, perforacija…): ${eur(ostale)}`);

    const trTr = N(u.transportCena) * tezKg1000;
    if (trTr) koraci.push(`Transport: ${N(u.transportCena)} €/kg × ${R4(tezKg1000)} kg = ${eur(trTr)}`);

    const osnovna = cenaMatKom + stmTr + adhTr + ostale + kliseTr + trTr + ojTr;
    const konacna = osnovna * (1 + marza / 100);
    const valFak = kolicina / 1000;

    koraci.push(`OSNOVNA /1000 kom = ${eur(osnovna)}`);
    koraci.push(`+ marža ${marza}% → KONAČNA ${eur(konacna)} /1000 kom = ${R4(konacna / 1000)} € po komadu`);

    return {
        tip: "kesa", jedinica: "€ / 1000 kom",
        idealna_sirina_materijala: sirina * 2 + klapna,
        kg_na_1000_kom: R4(tezKg1000),
        troskovi: { materijal: R2(cenaMatKom), stampa: R2(stmTr), adh: R2(adhTr), ojacanje: R2(ojTr), klise: R2(kliseTr), ostale_opcije: R2(ostale), transport: R2(trTr) },
        osnovna_cena: R2(osnovna),
        konacna_cena: R2(konacna),
        cena_po_komadu: R4(konacna / 1000),
        za_ceo_nalog: { kolicina_kom: kolicina, ukupno_kg: R4(tezKg1000 * (1 + skart / 100) * valFak), vrednost: R2(konacna * valFak) },
        // Materijal za ceo nalog: rolna širine (2×širina + klapna), dužina = kom × (dužina + falta)
        potrebno_materijala: [{
            sloj: "materijal kese",
            sirina_mm: sirina * 2 + klapna,
            duzina_m: Math.round((kolicina * (duzina + falta)) / 1000),
            duzina_sa_skartom_m: Math.ceil((kolicina * (duzina + falta)) / 1000 * (1 + skart / 100)),
            kg: R2(tezKg1000 * valFak),
            kg_sa_skartom: R2(tezKg1000 * (1 + skart / 100) * valFak),
        }],
        koraci,
    };
}

// ═════════════════════════════ ŠPULNA ════════════════════════════════════════
/**
 * Ulaz: sirina (mm), duzina (m), tezinaGM2 (g/m²), cenaM2 (€/m²), troskoviM2 (€/m²),
 *  cenaKutije, cenaHilzne, transport (€ po špulni), skart %, marza %, kolicina (kom)
 */
export function kalkulacijaSpulne(u = {}) {
    const sirina = N(u.sirina), duzina = N(u.duzina), gm2 = N(u.tezinaGM2);
    const cenaM2 = N(u.cenaM2), troskoviM2 = N(u.troskoviM2);
    const kutija = N(u.cenaKutije), hilzna = N(u.cenaHilzne), transport = N(u.transport);
    const skart = N(u.skart), marza = N(u.marza), kolicina = N(u.kolicina) || 1;
    const koraci = [];

    const povrsina = (duzina * sirina) / 1000;
    const tezina = (gm2 * sirina * duzina) / 1000000;
    koraci.push(`Površina: ${duzina} m × ${sirina} mm ÷ 1000 = ${R2(povrsina)} m²`);
    koraci.push(`Težina: ${gm2} g/m² × ${sirina} mm × ${duzina} m ÷ 1.000.000 = ${R4(tezina)} kg`);

    const cenaMat1000 = sirina * cenaM2;
    const cenaMatSpulna = (cenaMat1000 * duzina) / 1000;
    koraci.push(`Materijal: ${R2(povrsina)} m² × ${cenaM2} €/m² = ${eur(cenaMatSpulna)} po špulni`);

    const troskoviSpulna = povrsina * troskoviM2;
    if (troskoviSpulna) koraci.push(`Troškovi obrade: ${R2(povrsina)} m² × ${troskoviM2} €/m² = ${eur(troskoviSpulna)}`);
    if (kutija) koraci.push(`Kutija: ${eur(kutija)}`);
    if (hilzna) koraci.push(`Hilzna: ${eur(hilzna)}`);
    if (transport) koraci.push(`Transport po špulni: ${eur(transport)}`);

    const osnovna = cenaMatSpulna + kutija + hilzna + troskoviSpulna + transport;
    const proizvodna = osnovna * (1 + skart / 100);
    const saMarza = proizvodna * (1 + marza / 100);

    const cena1000 = duzina ? (osnovna / duzina) * 1000 : 0;
    const proizvodna1000 = cena1000 * (1 + skart / 100);
    const final1000 = proizvodna1000 * (1 + marza / 100);

    koraci.push(`OSNOVNA po špulni = ${eur(osnovna)}`);
    koraci.push(`+ škart ${skart}% → ${eur(proizvodna)}`);
    koraci.push(`+ marža ${marza}% → KONAČNA ${eur(saMarza)} po špulni (${eur(final1000)} na 1000 m)`);

    return {
        tip: "spulna", jedinica: "€ po špulni",
        povrsina_m2: R2(povrsina), tezina_kg: R4(tezina),
        troskovi: { materijal: R2(cenaMatSpulna), obrada: R2(troskoviSpulna), kutija: R2(kutija), hilzna: R2(hilzna), transport: R2(transport) },
        osnovna_cena: R2(osnovna),
        proizvodna_cena: R2(proizvodna),
        konacna_cena: R2(saMarza),
        na_1000m: { osnovna: R2(cena1000), proizvodna: R2(proizvodna1000), konacna: R2(final1000) },
        za_ceo_nalog: { kolicina: kolicina, vrednost: R2(saMarza * kolicina) },
        potrebno_materijala: [{
            sloj: "materijal špulne",
            sirina_mm: sirina,
            duzina_m: duzina * kolicina,
            duzina_sa_skartom_m: Math.ceil(duzina * kolicina * (1 + skart / 100)),
            kg: R2(tezina * kolicina),
            kg_sa_skartom: R2(tezina * kolicina * (1 + skart / 100)),
        }],
        koraci,
    };
}