import { supabase } from "./supabase.js";

export function safeNumber(value) {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

export function formatNumber(value, suffix = "") {
    return `${Math.round(safeNumber(value)).toLocaleString("sr-RS")}${suffix}`;
}

export function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .replaceAll("š", "s")
        .replaceAll("č", "c")
        .replaceAll("ć", "c")
        .replaceAll("ž", "z")
        .replaceAll("đ", "dj")
        .trim();
}

export function normalizeStatus(status) {
    return normalizeText(status);
}

// ─── Statusi ROLNI — identično kao u "Magacin rolni i materijala" ───────────
export function normalizeRollStatus(status) {
    const s = String(status || "").trim();
    const lower = s.toLowerCase();
    if (!s) return "dostupna";
    if (["na stanju", "dostupna", "available", "slobodna"].includes(lower)) return "dostupna";
    if (["rezervisano", "rezervisana", "reserved"].includes(lower)) return "rezervisana";
    if (["delimično rezervisano", "delimicno rezervisano", "delimično rezervisana", "delimicno rezervisana", "partially reserved"].includes(lower)) return "delimicno";
    if (["iskorišćeno", "iskorisceno", "potrošena", "potrosena", "potroseno", "potrošeno", "used"].includes(lower)) return "potrosena";
    if (["u proizvodnji", "u_proizvodnji", "proizvodnja", "wip"].includes(lower)) return "proizvodnja";
    if (["formatirana", "formatirano"].includes(lower)) return "formatirana";
    if (["blokirana", "blokirano"].includes(lower)) return "blokirana";
    return lower;
}
export function rolnaMetri(r) { return safeNumber(r?.metraza_ost ?? r?.duzina ?? r?.metraza); }
export function isRollOnStock(r) {
    return ["dostupna", "rezervisana", "delimicno", "formatirana"].includes(normalizeRollStatus(r?.status)) && rolnaMetri(r) > 0;
}
export function slobodnoNaRolni(r) { return Math.max(0, rolnaMetri(r) - safeNumber(r?.rezervisano)); }
export function rolnaVrednost(r) {
    return safeNumber(r?.vrednost) || (safeNumber(r?.kg_neto ?? r?.kg) * safeNumber(r?.cena_kg ?? r?.cenaKg));
}

export function getDateValue(row) {
    return row?.created_at || row?.datum_kreiranja || row?.datum || row?.date || null;
}

export function isFinishedStatus(status) {
    const s = normalizeStatus(status);
    // "stiglo iz štamparije" = štampa je gotova (materijal se vratio) → tretira se kao ZAVRŠENO
    // (isto kao u App.jsx i MachineSchedulerPRO). Bez ovoga nalog sa štampom se vodi kao aktivan.
    if (s.indexOf("stiglo") >= 0) return true;
    return ["zavrseno", "zavrsen", "gotovo", "uradjeno", "zavrsena", "zatvoreno", "zatvoren"].includes(s);
}

export function isCancelledStatus(status) {
    const s = normalizeStatus(status);
    return ["otkazano", "stornirano", "storno"].includes(s);
}

export function isPausedStatus(status) {
    const s = normalizeStatus(status);
    return ["pauza", "stop", "stopirano", "ceka", "ceka materijal", "cekamaterijal"].includes(s);
}

export function isActiveStatus(status) {
    return !isFinishedStatus(status) && !isCancelledStatus(status);
}

export function rangeToDays(range) {
    if (range === "today" || range === "danas") return 1;
    if (range === "week" || range === "nedelja") return 7;
    if (range === "month" || range === "mesec") return 30;
    const parsed = parseInt(range, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

export function dateDaysAgo(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (rangeToDays(days) - 1));
    return d;
}

// Magacin se učitava PAGINIRANO — Supabase inače vrati najviše 1000 redova,
// pa bi statistika bila odsečena (i razlikovala se od ekrana Magacin).
async function ucitajSveRolne() {
    const PAGE = 1000;
    let od = 0, sve = [];
    for (let i = 0; i < 50; i++) {
        const { data, error } = await supabase.from("magacin").select("id, tip, status, metraza, metraza_ost, kg_neto, kg_bruto, rezervisano, cena_kg, vrednost").range(od, od + PAGE - 1);
        if (error) throw error;
        const deo = data || [];
        sve = sve.concat(deo);
        if (deo.length < PAGE) break;
        od += PAGE;
    }
    return sve;
}

// Glavni nalozi se učitavaju SVI (paginirano) — „Ukupno naloga" i „Završeno" su UKUPNI
// brojači, ne smeju da zavise od 30-dnevnog prozora. Period se primenjuje samo na grafik
// (prepareNaloziPoDanima sam prozorira dane) i na aktivnosti/rad/zastoje.
async function ucitajSveNaloge() {
    const PAGE = 1000;
    let od = 0, sve = [];
    for (let i = 0; i < 50; i++) {
        const { data, error } = await supabase.from("radni_nalozi").select("*").order("created_at", { ascending: false }).range(od, od + PAGE - 1);
        if (error) throw error;
        const deo = data || [];
        sve = sve.concat(deo);
        if (deo.length < PAGE) break;
        od += PAGE;
    }
    return sve;
}

async function ucitajOperacije(masterIds) {
    if (!masterIds.length) return [];
    const CH = 200;
    let sve = [];
    for (let i = 0; i < masterIds.length; i += CH) {
        const { data, error } = await supabase
            .from("operativni_nalozi").select("*").in("glavni_nalog_id", masterIds.slice(i, i + CH));
        if (error) throw error;
        sve = sve.concat(data || []);
    }
    return sve;
}

export async function loadDashboardData(timeRange = 30) {
    const days = rangeToDays(timeRange);
    const cutoffDate = dateDaysAgo(days);

    // GLAVNI nalozi = radni_nalozi (tabela "nalozi" ne postoji u ovom sistemu).
    // Učitavaju se SVI (ne filtrirani po datumu) da bi „Ukupno naloga"/„Završeno" bili tačni.
    const [sviMasteriRaw, magZbirRes, rolne, aktivnostiRes] = await Promise.all([
        ucitajSveNaloge(),
        supabase.from("v_magacin_zbir").select("*").maybeSingle(),   // agregat magacina — 1 red (brzo)
        ucitajSveRolne(),                                            // slim kolone, za per-tip prikaz
        supabase.from("nalog_aktivnosti").select("*").gte("created_at", cutoffDate.toISOString()).order("created_at", { ascending: false })
    ]);

    if (aktivnostiRes.error) throw aktivnostiRes.error;

    const sviMasteri = sviMasteriRaw || [];
    const operacije = await ucitajOperacije(sviMasteri.map((n) => n.id).filter(Boolean));

    // Nalog je STVARAN samo ako ima svoje operacije. Glavni nalog bez ijedne operacije
    // je ostatak nepotpunog brisanja (RLS obriše operacije, a master ostane) — takav
    // nalog se ne vidi ni na ekranu "Glavni nalozi", pa ga ni dashboard ne broji.
    const saOperacijama = new Set(operacije.map((o) => o.glavni_nalog_id));
    const nalozi = sviMasteri.filter((n) => saOperacijama.has(n.id));
    const siroci = sviMasteri.length - nalozi.length;
    if (siroci > 0) console.warn(`Dashboard: ${siroci} glavnih naloga bez operacija (ostatak brisanja) — ne broje se.`);

    // PRAVI izvor rada: radnički ekran (RadnikOperacija) piše u operativni_nalozi i
    // nalog_zastoji — NE u pracenje_rada/proizvodnja_zastoji (te su prazne). Zato dashboard
    // čita: završene operacije (operativni_nalozi.status=zavrseno) + zastoje (nalog_zastoji).
    let rad = [], zastojiProd = [];
    try {
        const [radRes, zastRes] = await Promise.all([
            supabase.from("operativni_nalozi")
                .select("*")  // "*" da povučemo i skart_jed/tip_naloga bez pada ako kolona fali
                .eq("status", "zavrseno")
                .or(`stop_ts.gte.${cutoffDate.toISOString()},and(stop_ts.is.null,created_at.gte.${cutoffDate.toISOString()})`)
                .order("created_at", { ascending: false }),
            supabase.from("nalog_zastoji").select("*").gte("start_ts", cutoffDate.toISOString())
                .order("start_ts", { ascending: false }),
        ]);
        if (!radRes.error) rad = radRes.data || [];
        if (!zastRes.error) zastojiProd = zastRes.data || [];
    } catch (e) { console.warn("Dashboard: praćenje rada nije učitano -", e.message); }

    return {
        nalozi,
        siroci,
        operacije,
        rolne: rolne || [],
        magacinZbir: (magZbirRes && magZbirRes.data) || null,
        aktivnosti: aktivnostiRes.data || [],
        rad,
        zastojiProd,
        proizvodi: []
    };
}

// Status glavnog naloga se izvodi iz njegovih OPERACIJA:
//  • završen  = ima operacije i sve su završene
//  • aktivan  = nije završen i nije otkazan
export function statusNaloga(nalog, operacijeNaloga) {
    const ops = operacijeNaloga || [];
    if (isCancelledStatus(nalog?.status)) return "otkazan";
    if (ops.length && ops.every((o) => isFinishedStatus(o.status))) return "zavrsen";
    if (isFinishedStatus(nalog?.status)) return "zavrsen";
    return "aktivan";
}

export function grupisiOperacije(operacije = []) {
    const map = new Map();
    operacije.forEach((o) => {
        const k = o.glavni_nalog_id;
        if (!k) return;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(o);
    });
    return map;
}

export function getWorkerName(a) {
    return a?.radnik_ime || a?.radnik || a?.operator || a?.worker || a?.user_name || "Nepoznato";
}

export function getOrderNumber(n) {
    return n?.ponbr || n?.ponBr || n?.broj_naloga || n?.broj || n?.id || "N/A";
}

export function getProductName(n) {
    return n?.prod || n?.proizvod || n?.naziv || n?.naziv_proizvoda || "Ostalo";
}

// Poručena količina naloga — pravi izvor je parametri.porucena_kolicina (direktna polja su rezerva).
export function kolicinaNaloga(n) {
    return safeNumber(n?.kol ?? n?.kolicina ?? n?.metraza ?? n?.parametri?.porucena_kolicina ?? n?.parametri?.kolicina_za_rad);
}

// „Proizvedeno" za nalog = izlaz POSLEDNJE operacije (po redosledu), NE zbir svih operacija —
// inače se ista količina broji više puta (nalog sa 4 operacije bi dao 300–400%).
export function finalnoUradjeno(ops = []) {
    if (!ops.length) return 0;
    const s = [...ops].sort((a, b) => safeNumber(a.redosled) - safeNumber(b.redosled));
    for (let i = s.length - 1; i >= 0; i--) {
        const u = safeNumber(s[i].uradjeno);
        if (u > 0) return u;
    }
    return 0;
}

export function calculateDashboardKPIs(data = {}) {
    const nalozi = data.nalozi || [];
    const rolne = data.rolne || [];
    const aktivnosti = data.aktivnosti || [];

    const opMap = grupisiOperacije(data.operacije || []);
    const stanjeNaloga = new Map(nalozi.map(n => [n.id, statusNaloga(n, opMap.get(n.id))]));

    const ukupnoNaloga = nalozi.length;
    const zavrseniNalozi = nalozi.filter(n => stanjeNaloga.get(n.id) === "zavrsen").length;
    const aktivniNalozi = nalozi.filter(n => stanjeNaloga.get(n.id) === "aktivan").length;
    const kasniNalozi = nalozi.filter(n => {
        if (stanjeNaloga.get(n.id) !== "aktivan") return false;
        const d = getDateValue(n);
        if (!d) return false;
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) return false;
        return (Date.now() - dt.getTime()) / 86400000 > 7;
    }).length;

    const kolNaloga = (n) => kolicinaNaloga(n);
    const ukupnaKolicina = nalozi.reduce((s, n) => s + kolNaloga(n), 0);
    // Proizvedeno = izlaz POSLEDNJE operacije po nalogu (ne zbir svih operacija — inače >100%).
    const proizvedenoIzNaloga = nalozi.reduce((s, n) => {
        const ops = opMap.get(n.id) || [];
        return s + (ops.length ? finalnoUradjeno(ops) : safeNumber(n.uradjeno || n.proizvedeno));
    }, 0);
    const proizvedenoIzAktivnosti = aktivnosti.reduce((s, a) => s + safeNumber(a.kolicina || a.uradjeno || a.proizvedeno), 0);
    const proizvedeno = proizvedenoIzNaloga || proizvedenoIzAktivnosti;

    const vrednostNaloga = nalozi.reduce((s, n) => {
        const cena = safeNumber(n.cena || n.cena_ukupno || n.ukupno || n.vrednost);
        const kol = kolNaloga(n);
        if (safeNumber(n.ukupno) > 0) return s + safeNumber(n.ukupno);
        return s + cena * kol;
    }, 0);

    // Magacin: PRVO iz agregatnog pogleda v_magacin_zbir (1 red, brzo, skalira na 2000+);
    // ako pogleda nema (npr. nije kreiran), fallback na sabiranje po učitanim rolnama.
    const mz = data.magacinZbir || null;
    let ukupnoRolni, rolneNaStanju, ukupnoMetara, slobodnoMetara, ukupnoKg, vrednostMagacina;
    if (mz) {
        ukupnoRolni = rolneNaStanju = safeNumber(mz.rolni_na_stanju);
        ukupnoMetara = safeNumber(mz.ukupno_metara);
        slobodnoMetara = safeNumber(mz.slobodno_metara);
        ukupnoKg = safeNumber(mz.ukupno_kg);
        vrednostMagacina = safeNumber(mz.vrednost);
    } else {
        const naStanjuRolne = rolne.filter(isRollOnStock);
        ukupnoRolni = rolneNaStanju = naStanjuRolne.length;
        ukupnoMetara = naStanjuRolne.reduce((s, r) => s + rolnaMetri(r), 0);
        slobodnoMetara = naStanjuRolne.reduce((s, r) => s + slobodnoNaRolni(r), 0);
        ukupnoKg = naStanjuRolne.reduce((s, r) => s + safeNumber(r.kg_neto ?? r.kg ?? r.tezina), 0);
        vrednostMagacina = naStanjuRolne.reduce((s, r) => s + rolnaVrednost(r), 0);
    }
    const ukupnaVrednost = vrednostMagacina;

    const ukupnoAktivnosti = aktivnosti.length;
    const aktivniRadnici = new Set(aktivnosti.map(getWorkerName).filter(n => n && n !== "Nepoznato")).size;

    const ukupnoZastoja = aktivnosti.filter(a => {
        const s = normalizeStatus(a.status || a.tip || a.vrsta);
        return s.includes("zastoj") || s.includes("kvar") || s.includes("pauza");
    }).length;

    const stopaIzvrsenja = ukupnaKolicina > 0 ? Math.min(100, (proizvedeno / ukupnaKolicina) * 100).toFixed(1) : 0;
    const iskoriscenjeMagacina = ukupnoRolni > 0 ? ((rolneNaStanju / ukupnoRolni) * 100).toFixed(1) : 0;
    const prosecnaVrednost = ukupnoNaloga > 0 ? (vrednostNaloga / ukupnoNaloga).toFixed(0) : 0;

    return {
        ukupnoNaloga,
        aktivniNalozi,
        zavrseniNalozi,
        kasniNalozi,
        ukupnaKolicina,
        proizvedeno,
        ukupnaVrednost,
        ukupnoRolni,
        rolneNaStanju,
        ukupnoMetara,
        slobodnoMetara,
        vrednostMagacina,
        vrednostNaloga,
        ukupnoKg,
        ukupnoAktivnosti,
        aktivniRadnici,
        ukupnoZastoja,
        stopaIzvrsenja,
        stopaPogresne: stopaIzvrsenja,
        iskoriscenjeMagacina,
        prosecnaVrednost
    };
}

export function buildWorkersFromActivities(aktivnosti = []) {
    const map = new Map();

    aktivnosti.forEach(a => {
        const ime = getWorkerName(a);
        if (!ime || ime === "Nepoznato") return;

        if (!map.has(ime)) {
            map.set(ime, {
                ime,
                pozicija: a.operacija || a.pozicija || a.masina || "Operater",
                masina: a.masina || "—",
                zavrseno: 0,
                zastoji: 0,
                aktivnosti: 0,
                kolicina: 0,
                radMin: 0,
                poslednjaAktivnost: getDateValue(a),
                status: "Aktivan"
            });
        }

        const w = map.get(ime);
        w.aktivnosti += 1;
        w.kolicina += safeNumber(a.kolicina || a.uradjeno || a.proizvedeno);
        w.radMin += safeNumber(a.trajanje_min || a.trajanje || a.minuta || a.vreme_min);

        const s = normalizeStatus(a.status || a.tip || a.vrsta);
        if (isFinishedStatus(a.status) || s.includes("zavrs")) w.zavrseno += 1;
        if (s.includes("zastoj") || s.includes("kvar") || s.includes("pauza")) w.zastoji += 1;

        const d = getDateValue(a);
        if (d && (!w.poslednjaAktivnost || new Date(d) > new Date(w.poslednjaAktivnost))) {
            w.poslednjaAktivnost = d;
            w.pozicija = a.operacija || a.pozicija || w.pozicija;
            w.masina = a.masina || w.masina;
        }
    });

    return Array.from(map.values()).map(w => ({
        ...w,
        efikasnost: w.aktivnosti > 0 ? Math.min(100, Math.round((w.zavrseno / w.aktivnosti) * 100)) : 0
    })).sort((a, b) => b.aktivnosti - a.aktivnosti || b.kolicina - a.kolicina);
}

export function prepareNaloziPoDanima(nalozi = [], days = 30) {
    const result = [];
    const dCount = rangeToDays(days);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = dCount - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const label = d.toLocaleDateString("sr-RS", { day: "numeric", month: "short" });
        const count = nalozi.filter(n => {
            const val = getDateValue(n);
            if (!val) return false;
            const nd = new Date(val);
            return !Number.isNaN(nd.getTime()) && nd.toDateString() === d.toDateString();
        }).length;
        result.push({ datum: label, nalozi: count });
    }
    return result;
}

export function prepareProizvodnjaPoDanima(aktivnosti = []) {
    const map = new Map();
    aktivnosti.forEach(a => {
        const val = getDateValue(a);
        if (!val) return;
        const d = new Date(val);
        if (Number.isNaN(d.getTime())) return;
        const label = d.toLocaleDateString("sr-RS", { day: "numeric", month: "short" });
        map.set(label, (map.get(label) || 0) + safeNumber(a.kolicina || a.uradjeno || a.proizvedeno));
    });
    return Array.from(map.entries()).map(([datum, proizvedeno]) => ({ datum, proizvedeno: Math.round(proizvedeno) }));
}

export function prepareTopProizvodi(nalozi = []) {
    const map = new Map();
    nalozi.forEach(n => {
        const name = getProductName(n);
        map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries())
        .map(([name, count]) => ({ name: String(name).slice(0, 35), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
}

export function prepareMagacinPoTipu(rolne = []) {
    const map = new Map();
    rolne.filter(isRollOnStock).forEach(r => {
        const tip = r.tip || r.materijal || "Ostalo";
        if (!map.has(tip)) map.set(tip, { tip, kg: 0, metara: 0 });
        const item = map.get(tip);
        item.kg += safeNumber(r.kg_neto ?? r.kg ?? r.tezina);
        item.metara += rolnaMetri(r);
    });
    return Array.from(map.values()).map(x => ({ ...x, kg: Math.round(x.kg), metara: Math.round(x.metara) })).sort((a, b) => b.kg - a.kg).slice(0, 8);
}

// --- Radnici iz ZAVRŠENIH operacija (operativni_nalozi) + zastoji (nalog_zastoji) ---
// Vreme rada = stop_ts - start_ts; iskorišćenost = (rad - zastoji) / rad.
function minIzmedju(a, b) {
    if (!a || !b) return 0;
    const m = (new Date(b) - new Date(a)) / 60000;
    return Number.isFinite(m) && m > 0 ? m : 0;
}
// --- ŠKART: jedinica (kg podrazumevano, ili m) i naziv faze po operaciji ---
// Radnik pri QR završetku bira kg ili m; čuva se u operativni_nalozi.skart + skart_jed.
// Default je METRI: istorijski se škart uvek unosio u metrima; samo eksplicitno "kg" je kg.
export function skartJed(r) { return String(r && r.skart_jed || "").toLowerCase() === "kg" ? "kg" : "m"; }
// Goli (master) broj naloga bez sufiksa faze: "MP-2026-0016-PERFORACIJA_REZANJE" -> "MP-2026-0016".
export function masterBroj(b) { return String(b || "").trim().replace(/-[A-Za-zČĆŽŠĐČćžšđ_]+$/, ""); }
// Čitljiv naziv faze iz tipa operacije ili sufiksa broja naloga.
export function fazaNaloga(r) {
    let s = String((r && (r.tip_naloga || r.vrsta_naloga || r.vrsta || r.operacija)) || "").toLowerCase();
    if (!s) { const m = String(r && r.broj_naloga || "").match(/-([A-Za-zČĆŽŠĐČćžšđ_]+)$/); if (m) s = m[1].toLowerCase(); }
    s = s.replace(/\s+/g, "_");
    if (/stamp|štamp/.test(s)) return "Štampa";
    if (/kaš|kas/.test(s)) return "Kaširanje";
    if (/perf|rez/.test(s)) return "Perforacija / Rezanje";
    if (/format/.test(s)) return "Formatiranje";
    if (/mater|lans/.test(s)) return "Materijal / Lansiranje";
    if (/lak/.test(s)) return "Lakiranje";
    return s ? (s.charAt(0).toUpperCase() + s.slice(1)) : "Operacija";
}

// --- Preračun metri -> kilogrami, po nalogu (iz širine i gramaže u templejtu) ---
function _pj(v) { if (v == null) return {}; if (typeof v === "object") return v; try { return JSON.parse(v) || {}; } catch (e) { return {}; } }
// kg po dužnom metru za nalog = širina(mm) × gramaža(g/m²) / 1.000.000. 0 ako nema podataka.
export function kgPoMetruNaloga(n) {
    if (!n || typeof n !== "object") return 0;
    const od = _pj(n.order_data), par = _pj(n.parametri), rez = _pj(n.rezultati), res = _pj(n.res), parRes = _pj(par.res);
    const embTpl = rez.template || res.template || parRes.template || par.template || null;
    const tpl = _pj(n.product_template || n.template || od.template || embTpl);
    const tData = _pj(n.templateData || tpl.data || od.templateData);
    const t = (tData && Object.keys(tData).length) ? tData : tpl;
    const folija = n.folija || od.folija || t.folija || (t.data && t.data.folija) || {};
    const rzn = folija.rezanje || {};
    const sirina = safeNumber(rzn.sirinaMaterijala) || safeNumber(t.idealnaSirinaMaterijala) || safeNumber(od.idealnaSirinaMaterijala) || 0;
    let layers = (Array.isArray(od.materijali) && od.materijali.length) ? od.materijali : (Array.isArray(folija.layers) ? folija.layers : []);
    let gsm = layers.reduce((s, l) => s + (safeNumber(l.gm2) || safeNumber(l.gsm) || safeNumber(l.tezina)), 0);
    if (!gsm) gsm = safeNumber(t.gm2) || safeNumber(folija.gm2) || 0;
    if (!sirina || !gsm) return 0;
    return (sirina * gsm) / 1000000;
}
export function konvMapKg(nalozi = []) {
    const m = {};
    (Array.isArray(nalozi) ? nalozi : []).forEach((n) => { const b = masterBroj(n && (n.broj_naloga || n.broj || n.master_broj)); if (b && m[b] == null) { const k = kgPoMetruNaloga(n); if (k > 0) m[b] = k; } });
    return m;
}
const _r1 = (x) => Math.round(x * 10) / 10;

export function buildWorkersFromRad(data = {}) {
    const rad = data.rad || [];
    const zastoji = data.zastojiProd || [];
    const konv = konvMapKg(data.nalozi || []);   // nalog -> kg po metru
    const key = (v) => normalizeText(v);
    const zastBy = new Map();
    zastoji.forEach((z) => { const k = key(z.radnik || z.radnik_ime); if (!k) return; const g = zastBy.get(k) || { broj: 0, min: 0 }; g.broj += 1; g.min += safeNumber(z.trajanje_min); zastBy.set(k, g); });
    const map = new Map();
    rad.forEach((r) => {
        const ime = String(r.radnik || "").trim() || "Ručno / bez radnika";
        const k = key(ime);
        if (!map.has(k)) map.set(k, { ime, pozicija: "Operater", masina: r.masina || "—", zavrseno: 0, aktivnosti: 0, zastoji: 0, zastojMin: 0, kolicina: 0, kolicinaM: 0, kolicinaKg: 0, skartKg: 0, skartM: 0, skartMuKg: 0, grossMin: 0, radMin: 0, poslednjaAktivnost: null, status: "Aktivan" });
        const w = map.get(k);
        const kpm = konv[masterBroj(r.broj_naloga)] || 0;
        const um = safeNumber(r.uradjeno);
        w.zavrseno += 1; w.aktivnosti += 1;
        w.grossMin += minIzmedju(r.start_ts, r.stop_ts);
        w.kolicina += um; w.kolicinaM += um;
        if (kpm > 0) w.kolicinaKg += um * kpm;
        const sv = safeNumber(r.skart);
        // Unos u kg -> direktno. Unos u m -> preračun u kg ako nalog ima širinu+gramažu, inače ostaje u m.
        if (skartJed(r) === "kg") w.skartKg += sv;
        else if (kpm > 0) w.skartMuKg += sv * kpm; else w.skartM += sv;
        if (r.masina) w.masina = r.masina;
        const d = r.stop_ts || r.start_ts;
        if (d && (!w.poslednjaAktivnost || new Date(d) > new Date(w.poslednjaAktivnost))) w.poslednjaAktivnost = d;
    });
    map.forEach((w, k) => {
        const z = zastBy.get(k); if (z) { w.zastoji = z.broj; w.zastojMin = z.min; }
        w.radMin = Math.max(0, Math.round(w.grossMin - w.zastojMin));
        const gross = w.radMin + w.zastojMin;
        // Efikasnost ima smisla samo ako je bilo evidentiranog vremena (QR). Ručne bez
        // vremena → "—" (null), da ne obaraju prosek na 0%.
        w.efikasnost = gross > 0 ? Math.min(100, Math.round((w.radMin / gross) * 100)) : null;
        // Škart u kg = uneto u kg + (uneto u m preračunato u kg). Procenat = škart kg / urađeno kg.
        w.skartUkupnoKg = _r1(w.skartKg + w.skartMuKg);
        w.skartPct = w.kolicinaKg > 0 ? _r1((w.skartUkupnoKg / w.kolicinaKg) * 100) : null;
        w.kolicinaM = _r1(w.kolicinaM);
        w.kolicinaKg = _r1(w.kolicinaKg);
        w.skartKg = _r1(w.skartKg);
        w.skartM = _r1(w.skartM);
    });
    return Array.from(map.values()).sort((a, b) => b.zavrseno - a.zavrseno || b.radMin - a.radMin);
}

export function calcManagerKPIs(data = {}) {
    const rad = data.rad || [];
    const zastoji = data.zastojiProd || [];
    const aktivniSet = new Set(rad.map((r) => normalizeText(r.radnik)).filter(Boolean));
    const zavrseneFaze = rad.length;
    const ukupnoZastoja = zastoji.length;
    const grossMin = rad.reduce((s, r) => s + minIzmedju(r.start_ts, r.stop_ts), 0);
    const zastMin = zastoji.reduce((s, z) => s + safeNumber(z.trajanje_min), 0);
    const radMin = Math.max(0, grossMin - zastMin);
    // Efikasnost samo ako je bilo evidentiranog vremena (QR); inače "—" (ručno bez vremena).
    const efikasnost = grossMin > 0 ? ((radMin / grossMin) * 100).toFixed(1) : "—";
    // "Radnici" = svi koji su završili neku operaciju (QR imenom, ručne pod "Ručno / bez radnika").
    const imena = new Set(rad.map((r) => normalizeText(r.radnik) || "rucno").filter(Boolean));
    // Ukupan škart: kg direktno; m -> kg ako ima preračun (širina+gramaža), inače ostaje u m.
    const konvK = konvMapKg(data.nalozi || []);
    let skartKg = 0, skartM = 0;
    rad.forEach((r) => {
        const v = safeNumber(r.skart); if (v <= 0) return;
        const kpm = konvK[masterBroj(r.broj_naloga)] || 0;
        if (skartJed(r) === "kg") skartKg += v; else if (kpm > 0) skartKg += v * kpm; else skartM += v;
    });
    return { ukupnoRadnika: imena.size, aktivniRadnici: aktivniSet.size, zavrseneFaze, ukupnoZastoja, efikasnost, radMin: Math.round(radMin), zastMin: Math.round(zastMin), skartKg: Math.round(skartKg * 10) / 10, skartM: Math.round(skartM * 10) / 10 };
}

// --- ŠKART po NALOGU, razbijen po FAZAMA i po RADNICIMA ---
// Vraća listu: [{ nalog, proizvod, kg, m, faze:[{naziv,kg,m}], radnici:[{ime,kg,m}], rolni }]
// kg i m se drže ODVOJENO (radnik bira jedinicu). Primer: nalog 20 kg = Štampa 10 + Lansiranje 5 + Rezanje 5.
export function buildSkartPoNalogu(data = {}) {
    const rad = data.rad || [];
    const nalozi = data.nalozi || [];
    const konv = konvMapKg(nalozi);   // nalog -> kg po metru
    // mapa master broj -> naziv proizvoda (ako je dostupno u nalozima)
    const nazivBy = {};
    (Array.isArray(nalozi) ? nalozi : []).forEach((n) => {
        const b = masterBroj(n && (n.broj_naloga || n.broj || n.master_broj));
        if (b && !nazivBy[b]) nazivBy[b] = (n && (n.naziv_proizvoda || n.proizvod || n.naziv)) || "";
    });
    const m = {};
    rad.forEach((r) => {
        const v = safeNumber(r.skart);
        if (v <= 0) return;
        const nalog = masterBroj(r.broj_naloga) || "—";
        const kpm = konv[nalog] || 0;
        // kg/m po unosu: kg -> kg; m -> kg ako ima preračun, inače ostaje m
        let dkg = 0, dm = 0;
        if (skartJed(r) === "kg") dkg = v; else if (kpm > 0) dkg = v * kpm; else dm = v;
        const faza = fazaNaloga(r);
        const ime = String(r.radnik || "").trim() || "Ručno / bez radnika";
        if (!m[nalog]) m[nalog] = { nalog, proizvod: nazivBy[nalog] || "", kg: 0, m: 0, faze: {}, radnici: {}, rolni: 0 };
        const g = m[nalog];
        g.kg += dkg; g.m += dm;
        if (!g.faze[faza]) g.faze[faza] = { kg: 0, m: 0 };
        g.faze[faza].kg += dkg; g.faze[faza].m += dm;
        if (!g.radnici[ime]) g.radnici[ime] = { kg: 0, m: 0 };
        g.radnici[ime].kg += dkg; g.radnici[ime].m += dm;
        g.rolni += 1;
    });
    const r1 = (x) => Math.round(x * 10) / 10;
    return Object.values(m).map((x) => ({
        nalog: x.nalog, proizvod: x.proizvod, kg: r1(x.kg), m: r1(x.m), rolni: x.rolni,
        faze: Object.keys(x.faze).map((naziv) => ({ naziv, kg: r1(x.faze[naziv].kg), m: r1(x.faze[naziv].m) })).sort((a, b) => (b.kg + b.m) - (a.kg + a.m)),
        radnici: Object.keys(x.radnici).map((ime) => ({ ime, kg: r1(x.radnici[ime].kg), m: r1(x.radnici[ime].m) })).sort((a, b) => (b.kg + b.m) - (a.kg + a.m)),
    })).sort((a, b) => (b.kg - a.kg) || (b.m - a.m));
}

// --- Ko je NAPRAVIO koliko NALOGA (po kreatoru) ---
// Kreator se čuva kao kreirao_ime / kreirao / napravio / kreirao_korisnik — na nalogu ili u parametri/order_data.
export function kreatorNaloga(n) {
    const pick = (o) => (o && (o.kreirao_ime || o.kreirao || o.napravio || o.kreirao_korisnik)) || "";
    let v = pick(n);
    if (!v) v = pick(_pj(n && n.parametri));
    if (!v) v = pick(_pj(n && n.order_data));
    return String(v || "").trim();
}
export function buildNaloziPoKreatoru(data = {}) {
    const nalozi = data.nalozi || [];
    const opMap = grupisiOperacije(data.operacije || []);
    const m = {};
    (Array.isArray(nalozi) ? nalozi : []).forEach((n) => {
        const ime = kreatorNaloga(n) || "— Nepoznato";
        const ops = opMap.get(n.id) || [];
        // ZAVRŠEN = sve operacije naloga su gotove (isto pravilo kao „GOTOVO" u aplikaciji);
        // ako nema operacija, padni na status master naloga.
        const zavrsen = ops.length > 0 ? ops.every((o) => isFinishedStatus(o.status)) : isFinishedStatus(n.status);
        // Količina: poručena količina naloga (parametri parsiran), pa izlaz poslednje operacije kao rezerva.
        const par = _pj(n.parametri);
        const qty = safeNumber(n.kol ?? n.kolicina ?? n.metraza ?? par.porucena_kolicina ?? par.kolicina_za_rad) || finalnoUradjeno(ops);
        if (!m[ime]) m[ime] = { ime, broj: 0, zavrseno: 0, kolicinaM: 0, poslednji: null };
        const g = m[ime];
        g.broj += 1;
        if (zavrsen) g.zavrseno += 1;
        g.kolicinaM += qty;
        const d = n.created_at || n.datum || n.datum_kreiranja;
        if (d && (!g.poslednji || new Date(d) > new Date(g.poslednji))) g.poslednji = d;
    });
    return Object.values(m).map((x) => ({ ...x, kolicinaM: Math.round(x.kolicinaM), udeoZavrseno: x.broj > 0 ? Math.round((x.zavrseno / x.broj) * 100) : 0 })).sort((a, b) => b.broj - a.broj);
}

// --- ŠKART zbirno po FAZI (preko svih naloga) ---
export function buildSkartPoFazi(data = {}) {
    const rad = data.rad || [];
    const konv = konvMapKg(data.nalozi || []);
    const m = {};
    rad.forEach((r) => {
        const v = safeNumber(r.skart); if (v <= 0) return;
        const faza = fazaNaloga(r);
        const kpm = konv[masterBroj(r.broj_naloga)] || 0;
        let dkg = 0, dm = 0;
        if (skartJed(r) === "kg") dkg = v; else if (kpm > 0) dkg = v * kpm; else dm = v;
        if (!m[faza]) m[faza] = { faza, kg: 0, m: 0, broj: 0 };
        m[faza].kg += dkg; m[faza].m += dm;
        m[faza].broj += 1;
    });
    const r1 = (x) => Math.round(x * 10) / 10;
    return Object.values(m).map((x) => ({ faza: x.faza, kg: r1(x.kg), m: r1(x.m), broj: x.broj })).sort((a, b) => (b.kg + b.m) - (a.kg + a.m));
}