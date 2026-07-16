// =====================================================================
//  KORAK 5 — izvršenje formatiranja (čist builder payload-a, bez I/O)
//  Od motorovog plana (plan_reza) sklapa: nove role, update matične i
//  redove za magacin_istorija — po ISTOM šablonu kao FormatiranjeRolniPRO,
//  ali generalizovano: više segmenata (svaki svoja dužina), odredište +
//  rezervacija, veza na nalog, puniji trag.
//
//  Supabase pozivi ostaju u komponenti (isti pattern kao formatiraj()).
// =====================================================================

function number(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function round2(v) { return Math.round(number(v) * 100) / 100; }

// kg nove role = kg matične × (šir/šir.mat) × (dužina/dost.dužina)  — ista formula kao u komponenti
function kgProp(kgMat, w, sMat, duz, dDost) {
    if (!kgMat || !sMat || !dDost) return 0;
    return round2(kgMat * (number(w) / sMat) * (number(duz) / dDost));
}

/**
 * pripremiIzvrsenje(matica, plan, ctx)
 * @param matica  red iz magacina (učitana matična): {id, br_rolne, sirina, metraza_ost, kg_neto, lot, vrsta,...}
 * @param plan    izlaz motora za OVU matičnu: { sirina_mm?, plan_reza:[{duzina_m, otpad_mm, trake:[{sirina_mm, odrediste, napomena}]}] }
 * @param ctx     { lotStart=0, danas, nowIso, makeBrRolne, nalog:{broj,id,izvor_ponbr}|null, user_id }
 * @returns { noveRole, maticaUpdate, istorijaMatice, istorijaZaNoveRole(fn), utrosak, novoOstatak, greske }
 */
function pripremiIzvrsenje(matica, plan, ctx = {}) {
    const greske = [];
    const sMat = number(matica.sirina);
    const dDost = number(matica.metraza_ost ?? matica.metraza);
    const kgMat = number(matica.kg_neto ?? matica.kg_bruto);
    const lotBaza = String(matica.lot || matica.br_rolne || "LOT").trim();
    const lotStart = number(ctx.lotStart) || 0;
    const danas = ctx.danas || new Date().toISOString().slice(0, 10);
    const nowIso = ctx.nowIso || new Date().toISOString();
    const makeBr = ctx.makeBrRolne || (() => "ROLNA-" + Math.random().toString(36).slice(2, 9).toUpperCase());
    const nalog = ctx.nalog || null;
    const segmenti = Array.isArray(plan?.plan_reza) ? plan.plan_reza : [];

    // validacije (prizna kad ne valja, ne piše ništa)
    let utrosak = 0;
    segmenti.forEach((s, i) => {
        const duz = number(s.duzina_m);
        utrosak += duz;
        const sumTraka = (s.trake || []).reduce((a, t) => a + number(t.sirina_mm), 0);
        if (sumTraka + number(s.otpad_mm) > sMat + 0.01) greske.push(`Segment ${i + 1}: širine (${sumTraka}+${number(s.otpad_mm)} otpad) prelaze matičnu ${sMat} mm.`);
    });
    utrosak = round2(utrosak);
    if (!segmenti.length) greske.push("Nema plana reza.");
    if (utrosak > dDost + 0.01) greske.push(`Rez ${utrosak} m prelazi dostupno ${dDost} m na matičnoj.`);
    if (greske.length) return { noveRole: [], maticaUpdate: null, istorijaMatice: null, istorijaZaNoveRole: () => [], utrosak, novoOstatak: dDost, greske };

    // 1) nove role — po traci u svakom segmentu (svaka svoju dužinu = dužina segmenta)
    let idx = 0;
    const sveSirine = [];
    const noveRole = [];
    segmenti.forEach((s) => {
        const duz = number(s.duzina_m);
        (s.trake || []).forEach((t) => {
            const w = number(t.sirina_mm);
            sveSirine.push(w);
            const naNalog = String(t.odrediste || "").indexOf("nalog:") === 0;
            const destPon = naNalog ? String(t.odrediste).slice(6) : null;
            const kg = kgProp(kgMat, w, sMat, duz, dDost);
            const br = makeBr();
            const napomena = [
                `Formatirano iz ${matica.br_rolne} (${sMat}mm)`,
                nalog?.broj ? `nalog ${nalog.broj}` : null,
                naNalog ? `→ ${destPon}` : "→ stanje",
                t.napomena || null,
            ].filter(Boolean).join(" · ");

            noveRole.push({
                br_rolne: br, qr_code: br,
                tip: matica.tip || null, vrsta: matica.vrsta || null, pod_vrsta: matica.pod_vrsta || null,
                oznaka_materijala: matica.oznaka_materijala || null, deb: number(matica.deb) || null,
                sirina: w, metraza: duz, metraza_ost: duz,
                rezervisano: naNalog ? duz : 0,                 // rola za nalog = rezervisana
                kg_neto: kg, kg_bruto: kg,
                cena_kg: number(matica.cena_kg) || null,
                vrednost: number(matica.cena_kg) ? round2(kg * number(matica.cena_kg)) : null,
                lot: `${lotBaza}-${lotStart + (++idx)}`,          // brojač se NASTAVLJA (ctx.lotStart iz baze)
                dobavljac: matica.dobavljac || null,
                datum: danas, datum_prijema: matica.datum_prijema || danas, datum_proizvodnje: matica.datum_proizvodnje || null,
                status: naNalog ? "Rezervisano" : "Na stanju",
                lokacija: matica.lokacija || "Magacin / formatirano",
                // --- veze (proveri da kolone postoje; vidi zaglavlje patcha) ---
                rezervisano_za_nalog: destPon,                    // odredišni nalog (kome ide)
                formatiranje_nalog: nalog?.broj || null,          // operativni nalog formatiranja
                operativni_nalog_id: nalog?.id || null,
                napomena,
                _naNalog: naNalog, _destPon: destPon,             // interno (ukloni pre insert-a)
            });
        });
    });

    // 2) update matične
    const novoOstatak = round2(Math.max(0, dDost - utrosak));
    const maticaUpdate = {
        metraza_ost: novoOstatak,
        status: novoOstatak > 0 ? (matica.status || "Na stanju") : "Iskorišćeno",
        updated_at: nowIso,
        napomena: [matica.napomena, `Formatirano: -${utrosak} m u ${noveRole.length} rolni${nalog?.broj ? " (" + nalog.broj + ")" : ""}`].filter(Boolean).join(" · "),
    };
    if (kgMat && dDost) maticaUpdate.kg_neto = round2(kgMat * (novoOstatak / dDost));

    // 3) trag u istoriju — matična (jedan red)
    const istorijaMatice = {
        rolna_id: matica.id ?? null,
        br_rolne: matica.br_rolne,
        akcija: "FORMATIRANJE",
        tip_promene: "FORMATIRANJE",
        stara_vrednost: String(dDost),
        nova_vrednost: String(novoOstatak),
        metraza_pre: dDost,
        metraza_posle: novoOstatak,
        promena_m: round2(novoOstatak - dDost),           // negativan (skinuto)
        nalog_id: nalog?.id ?? null,
        nalog_ponbr: nalog?.broj ?? null,
        user_id: ctx.user_id ?? null,
        napomena: `${sMat}mm → ${sveSirine.join("+")}mm · ${segmenti.length} segm · ${noveRole.length} nove role · utrošak ${utrosak}m · ostatak ${novoOstatak}m`,
    };

    // 3b) trag — nove role (posle inserta kad znamo id-eve)
    const istorijaZaNoveRole = (inserted) => (inserted || []).map((r) => ({
        rolna_id: r.id ?? null,
        br_rolne: r.br_rolne,
        akcija: "KREIRANA_FORMATIRANJEM",
        tip_promene: "FORMATIRANJE",
        metraza_pre: 0,
        metraza_posle: number(r.metraza_ost ?? r.metraza),
        promena_m: number(r.metraza_ost ?? r.metraza),
        nalog_id: nalog?.id ?? null,
        nalog_ponbr: nalog?.broj ?? null,
        user_id: ctx.user_id ?? null,
        napomena: `Iz ${matica.br_rolne} · ${number(r.sirina)}mm × ${number(r.metraza)}m` + (r.rezervisano_za_nalog ? ` · rezervisano za ${r.rezervisano_za_nalog}` : " · na stanje"),
    }));

    return { noveRole, maticaUpdate, istorijaMatice, istorijaZaNoveRole, utrosak, novoOstatak, greske: [] };
}

export { pripremiIzvrsenje, kgProp, number, round2 };
