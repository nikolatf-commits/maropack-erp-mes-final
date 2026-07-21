// =====================================================================
//  MOTOR PREDLOGA — "formatiranje po potrebi" (Maropack ERP)
//  Čista funkcija: bez UI, bez baze. Ulaz = potrebe + magacin, izlaz = plan.
//
//  ODLUKE (zaključane): kerf = 0 | uzdužni segmenti dozvoljeni (svaka traka
//  svoju dužinu) | bočni ostatak >= najmanje tražene širine -> nova rola na stanje.
// =====================================================================

// ---------------------------------------------------------------------
// === iz ProductTemplateEngineV20.jsx (VERBATIM) ===
// U produkciji NE duplirati — importovati iz ProductTemplateEngineV20.
// Ovde su kopije samo da bi motor bio testabilan izolovano (node).
// ---------------------------------------------------------------------
function txtEq(a, b) { return String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase(); }
function rolnaPodVrsta(r) { return r.pod_vrsta ?? r.podvrsta ?? r.pod_vrsta_materijala ?? ""; }
function rolnaOznaka(r) { return r.oznaka_materijala ?? r.oznaka ?? r.grade ?? ""; }

function parseDatum(d) {
    if (!d) return NaN;
    const s = String(d).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
    if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
    const t = Date.parse(s);
    return Number.isNaN(t) ? NaN : t;
}
function rolnaDatum(r) {
    const d = r.datum_proizvodnje ?? r.datum_prijema ?? r.datum_ulaza ?? r.datum_ulaza_rolne ?? r.created_at ?? r.datum ?? null;
    const t = parseDatum(d);
    if (!Number.isNaN(t)) return t;
    const n = parseInt(String(r.lot ?? r.br_rolne ?? "").replace(/\D/g, ""), 10);
    return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}
function rolnaMetraza(r) { return Number(r.metraza_ost ?? r.metraza ?? 0) || 0; }
function slobodnoM(r) { return Math.max(0, rolnaMetraza(r) - (Number(r.rezervisano) || 0)); }

function rangirajRolne(rolne, layer, opts = {}) {
    const { ideal = 0, samoDostupne = false, potrebnoM = 0, sirinaTolerancija = 1, ignoreWidth = false } = opts;
    const ZAUZETO = /utros|utroš|iskoris|iskorišć|prodat|isporu|otpis|storn|obrisan|arhiv|zavrsen|završen|proizvodnj|u proizv/i;
    const base = String(layer.vrsta || layer.material || layer.materijal || layer.tip || "").split(" ")[0].toUpperCase();
    const deb = Number(String(layer.debljina || layer.deb || "").replace(",", ".")) || 0;
    const podv = String(layer.pod_vrsta || "").trim();
    const ozn = String(layer.oznaka_materijala || layer.oznaka || "").trim();
    const proizv = String(layer.proizvodjac || "").trim();
    return (rolne || [])
        .filter(r => {
            const okT = String(r.vrsta || r.tip || "").toUpperCase().startsWith(base);
            const okD = !deb || !r.deb || Math.abs(Number(r.deb) - deb) <= 3;
            const okS = !samoDostupne || !ZAUZETO.test(String(r.status || ""));
            const okRez = !samoDostupne || slobodnoM(r) > 0;
            const rp = rolnaPodVrsta(r), ro = rolnaOznaka(r);
            const okPV = !podv || !String(rp).trim() || txtEq(rp, podv);
            const okOZ = !ozn || !String(ro).trim() || txtEq(ro, ozn);
            const okSir = ignoreWidth || !ideal || (Number(r.sirina) || 0) >= (ideal - sirinaTolerancija);
            const okProiz = !proizv || txtEq(r.dobavljac, proizv) || txtEq(r.proizvodjac, proizv);
            return okT && okD && okS && okRez && okPV && okOZ && okSir && okProiz;
        })
        .sort((a, b) => {
            if (ignoreWidth && ideal) {
                const wa = (Number(a.sirina) || 0) >= (ideal - sirinaTolerancija) ? 0 : 1;
                const wb = (Number(b.sirina) || 0) >= (ideal - sirinaTolerancija) ? 0 : 1;
                if (wa !== wb) return wa - wb;
            }
            if (ideal) {
                const BAND = 25;
                const ba = Math.floor(Math.max(0, (Number(a.sirina) || 0) - ideal) / BAND);
                const bb = Math.floor(Math.max(0, (Number(b.sirina) || 0) - ideal) / BAND);
                if (ba !== bb) return ba - bb;
            }
            const da = rolnaDatum(a), db = rolnaDatum(b);
            if (da !== db) return da - db;
            if (ideal) {
                const sa = Math.abs(Number(a.sirina) - ideal), sb = Math.abs(Number(b.sirina) - ideal);
                if (sa !== sb) return sa - sb;
            }
            if (potrebnoM) {
                const ea = slobodnoM(a) >= potrebnoM ? 0 : 1;
                const eb = slobodnoM(b) >= potrebnoM ? 0 : 1;
                if (ea !== eb) return ea - eb;
            }
            if (proizv) {
                const ma = txtEq(a.dobavljac, proizv) ? 0 : 1, mb = txtEq(b.dobavljac, proizv) ? 0 : 1;
                if (ma !== mb) return ma - mb;
            }
            return 0;
        });
}
// ---------------------------------------------------------------------
// === KRAJ verbatim bloka ===
// ---------------------------------------------------------------------

const NN = (v) => Number(String(v ?? "").replace(",", ".")) || 0;

// Ključ materijala — isto polje po kome rangirajRolne uparuje.
function matKljuc(m) {
    return [
        String(m.vrsta || "").trim().toUpperCase(),
        String(m.pod_vrsta || "").trim().toUpperCase(),
        String(m.oznaka || m.oznaka_materijala || "").trim().toUpperCase(),
        String(m.proizvodjac || "").trim().toUpperCase(),
        NN(m.debljina),
    ].join("|");
}

// FFD: iz liste jedinica (svaka = jedna traka širine) upakuj što više u širinu W.
// Vraća { izabrane:[jedinice], suma }. Ne dira originalnu listu.
function upakujSirine(jedinice, W) {
    const sort = [...jedinice].sort((a, b) => b.sirina - a.sirina);
    const izabrane = [];
    let suma = 0;
    for (const j of sort) {
        if (suma + j.sirina <= W) { izabrane.push(j); suma += j.sirina; }
    }
    return { izabrane, suma };
}

/**
 * predloziFormatiranje — motor predloga za formatiranje po potrebi.
 *
 * @param {Array} potrebe  [{ id, materijal:{vrsta,pod_vrsta,oznaka,proizvodjac,debljina},
 *                            sirina_mm, rolni_kom, duzina_m, napomena, odrediste }]
 * @param {Array} magacin  sirove rolne (motor sam matchuje + FIFO rangira)
 * @param {Object} opcije  { kerf_mm=0, zaokruziNavise=false, bocniOstatakNaStanje=true }
 * @param {Object} deps    { rangirajRolne } — injektabilno (default = verbatim kopija)
 * @returns {Object} { nalozi, na_stanje, fali, zbirno }
 */
function predloziFormatiranje(potrebe = [], magacin = [], opcije = {}, deps = {}) {
    const kerf = NN(opcije.kerf_mm);                       // ODLUKA[1] = 0
    const bocniNaStanje = opcije.bocniOstatakNaStanje !== false; // ODLUKA[3], default true
    // zaokruziNavise: default false => ne izmišlja višak; manjak ide u `fali`.
    // (rezervisano za buduće "zaokruži naviše" ponašanje; trenutno ne over-produkuje)
    const rangiraj = deps.rangirajRolne || rangirajRolne;

    // --- 1) Grupiši potrebe po materijalu i razvij u jedinice (po rolni) ---
    const grupe = new Map();
    for (const p of potrebe) {
        const m = p.materijal || {};
        const k = matKljuc(m);
        if (!grupe.has(k)) grupe.set(k, { layer: m, potrebe: [], jedinice: [] });
        const g = grupe.get(k);
        g.potrebe.push(p);
        const kom = Math.max(0, Math.floor(NN(p.rolni_kom)));
        for (let i = 0; i < kom; i++) {
            g.jedinice.push({
                potreba_id: p.id,
                sirina: NN(p.sirina_mm),
                duzina: NN(p.duzina_m),
                odrediste: p.odrediste || "stanje",
                napomena: p.napomena || "",
            });
        }
    }

    const naloziMap = new Map();   // maticna_id -> nalog
    const na_stanje = [];
    const fali = [];

    // --- 2) Po materijalnoj grupi: matchuj+FIFO matične, pa pakuj ---
    for (const g of grupe.values()) {
        const pool = rangiraj(magacin, {
            vrsta: g.layer.vrsta,
            pod_vrsta: g.layer.pod_vrsta,
            oznaka_materijala: g.layer.oznaka || g.layer.oznaka_materijala,
            proizvodjac: g.layer.proizvodjac,
            debljina: g.layer.debljina,
        }, { samoDostupne: true, ideal: 0 });   // ideal:0 => čist FIFO, bez filtriranja po širini

        // "usable width" prag = najmanja tražena širina u grupi
        const minTraz = g.jedinice.length ? Math.min(...g.jedinice.map(j => j.sirina)) : 0;
        const maxSirinaPool = pool.length ? Math.max(...pool.map(r => NN(r.sirina))) : 0;
        const maxDuzinaPool = pool.length ? Math.max(...pool.map(r => slobodnoM(r))) : 0;

        let preostale = [...g.jedinice];

        for (const r of pool) {
            if (!preostale.length) break;
            const W = NN(r.sirina);
            let Frem = slobodnoM(r);
            if (W <= 0 || Frem <= 0) continue;

            let radila = true;
            while (radila && preostale.length) {
                radila = false;
                // dužine koje još čekaju i staju u preostalu slobodnu dužinu — duže prve
                const duzine = [...new Set(preostale.map(j => j.duzina))]
                    .filter(L => L > 0 && L <= Frem)
                    .sort((a, b) => b - a);
                for (const L of duzine) {
                    const kandidati = preostale.filter(j => j.duzina === L);
                    // efektivna širina trake = sirina + kerf (kerf=0 sada), rez staje ako Σ(sir+kerf) <= W
                    const { izabrane } = upakujSirine(
                        kandidati.map(j => ({ ...j, sirina: j.sirina + kerf })),
                        W
                    );
                    if (!izabrane.length) continue;

                    // mapiraj nazad na originalne jedinice (bez kerf-a u zapisu)
                    const uzeti = izabrane.map(x => x.potreba_id + "#" + x.sirina);
                    const trakeNeed = [];
                    for (const j of kandidati) {
                        const key = j.potreba_id + "#" + (j.sirina + kerf);
                        const idx = uzeti.indexOf(key);
                        if (idx !== -1) { uzeti.splice(idx, 1); trakeNeed.push(j); }
                    }
                    // ukloni uzete iz preostale
                    for (const j of trakeNeed) {
                        const i = preostale.indexOf(j);
                        if (i !== -1) preostale.splice(i, 1);
                    }

                    const zauzeto = trakeNeed.reduce((a, j) => a + j.sirina + kerf, 0);
                    let residual = W - zauzeto;

                    const trake = trakeNeed.map(j => ({
                        sirina_mm: j.sirina, potreba_id: j.potreba_id, odrediste: j.odrediste,
                    }));

                    let otpad_mm = residual;
                    let stockRoll = null;
                    if (bocniNaStanje && residual >= minTraz && minTraz > 0) {
                        stockRoll = { sirina_mm: residual, duzina_m: L, potreba_id: null, odrediste: "stanje" };
                        trake.push({ sirina_mm: residual, potreba_id: null, odrediste: "stanje" });
                        otpad_mm = 0;
                    }

                    // upiši nalog za ovu matičnu (lazy)
                    let nalog = naloziMap.get(r.id);
                    if (!nalog) {
                        nalog = {
                            maticna_id: r.id, br_rolne: r.br_rolne || r.lot || null,
                            sirina_mm: W, plan_reza: [], utrosak_m: 0, nove_role: [],
                        };
                        naloziMap.set(r.id, nalog);
                    }
                    nalog.plan_reza.push({ duzina_m: L, trake, otpad_mm });
                    nalog.utrosak_m += L;
                    for (const t of trakeNeed) nalog.nove_role.push({ sirina_mm: t.sirina, duzina_m: L, potreba_id: t.potreba_id, odrediste: t.odrediste });
                    if (stockRoll) { nalog.nove_role.push(stockRoll); na_stanje.push({ ...stockRoll, maticna_id: r.id }); }

                    Frem -= L;
                    radila = true;
                    break; // re-loop: probaj još segmenata na istoj matičnoj
                }
            }
        }

        // --- 3) Ono što je ostalo => fali (prizna, ne izmišlja) ---
        // grupiši po (potreba_id, sirina)
        const faliMap = new Map();
        for (const j of preostale) {
            const k = j.potreba_id + "|" + j.sirina + "|" + j.duzina;
            if (!faliMap.has(k)) faliMap.set(k, { potreba_id: j.potreba_id, sirina_mm: j.sirina, duzina_m: j.duzina, rolni_kom: 0 });
            faliMap.get(k).rolni_kom++;
        }
        for (const f of faliMap.values()) {
            let razlog;
            if (!pool.length) razlog = "nema matičnih tog materijala";
            else if (f.sirina_mm > maxSirinaPool) razlog = "nema matične dovoljne širine";
            else if (f.duzina_m > maxDuzinaPool) razlog = "nema matične s dovoljno slobodne dužine";
            else razlog = "nedovoljno slobodnih metara na matičnima";
            fali.push({ ...f, razlog });
        }
    }

    // --- zbirno ---
    const nalozi = [...naloziMap.values()];
    let needArea = 0, stanjeArea = 0, otpadArea = 0, cutArea = 0;
    for (const n of nalozi) {
        for (const s of n.plan_reza) {
            for (const t of s.trake) {
                if (t.odrediste === "stanje") stanjeArea += t.sirina_mm * s.duzina_m;
                else needArea += t.sirina_mm * s.duzina_m;
            }
            otpadArea += s.otpad_mm * s.duzina_m;
            cutArea += n.sirina_mm * s.duzina_m;
        }
    }
    const zbirno = {
        maticnih: nalozi.length,
        otpad_mm_m: Math.round(otpadArea),
        iskoriscenje_pct: cutArea ? Math.round(((needArea + stanjeArea) / cutArea) * 1000) / 10 : 0,
        pokriveno_rolni: nalozi.reduce((a, n) => a + n.nove_role.filter(x => x.potreba_id != null).length, 0),
        fali_rolni: fali.reduce((a, f) => a + f.rolni_kom, 0),
    };

    return { nalozi, na_stanje, fali, zbirno };
}

export { predloziFormatiranje, rangirajRolne, slobodnoM };
