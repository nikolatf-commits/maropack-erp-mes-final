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

    // GLAVNI nalozi = radni_nalozi (tabela "nalozi" ne postoji u ovom sistemu)
    const [naloziRes, magZbirRes, rolne, aktivnostiRes] = await Promise.all([
        supabase.from("radni_nalozi").select("*").gte("created_at", cutoffDate.toISOString()).order("created_at", { ascending: false }),
        supabase.from("v_magacin_zbir").select("*").maybeSingle(),   // agregat magacina — 1 red (brzo)
        ucitajSveRolne(),                                            // slim kolone, za per-tip prikaz
        supabase.from("nalog_aktivnosti").select("*").gte("created_at", cutoffDate.toISOString()).order("created_at", { ascending: false })
    ]);

    if (naloziRes.error) throw naloziRes.error;
    if (aktivnostiRes.error) throw aktivnostiRes.error;

    const sviMasteri = naloziRes.data || [];
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
                .select("id, broj_naloga, radnik, masina, status, start_ts, stop_ts, created_at, uradjeno, skart")
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

    const kolNaloga = (n) => safeNumber(n.kol ?? n.kolicina ?? n?.parametri?.porucena_kolicina ?? n?.parametri?.kolicina_za_rad);
    const ukupnaKolicina = nalozi.reduce((s, n) => s + kolNaloga(n), 0);
    const proizvedenoIzNaloga = nalozi.reduce((s, n) => {
        const ops = opMap.get(n.id) || [];
        return s + (ops.length ? ops.reduce((a, o) => a + safeNumber(o.uradjeno), 0) : safeNumber(n.uradjeno || n.proizvedeno));
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

    const stopaIzvrsenja = ukupnaKolicina > 0 ? ((proizvedeno / ukupnaKolicina) * 100).toFixed(1) : 0;
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
export function buildWorkersFromRad(data = {}) {
    const rad = data.rad || [];
    const zastoji = data.zastojiProd || [];
    const key = (v) => normalizeText(v);
    const zastBy = new Map();
    zastoji.forEach((z) => { const k = key(z.radnik || z.radnik_ime); if (!k) return; const g = zastBy.get(k) || { broj: 0, min: 0 }; g.broj += 1; g.min += safeNumber(z.trajanje_min); zastBy.set(k, g); });
    const map = new Map();
    rad.forEach((r) => {
        const ime = String(r.radnik || "").trim() || "Ručno / bez radnika";
        const k = key(ime);
        if (!map.has(k)) map.set(k, { ime, pozicija: "Operater", masina: r.masina || "—", zavrseno: 0, aktivnosti: 0, zastoji: 0, zastojMin: 0, kolicina: 0, skartKg: 0, grossMin: 0, radMin: 0, poslednjaAktivnost: null, status: "Aktivan" });
        const w = map.get(k);
        w.zavrseno += 1; w.aktivnosti += 1;
        w.grossMin += minIzmedju(r.start_ts, r.stop_ts);
        w.kolicina += safeNumber(r.uradjeno);
        w.skartKg += safeNumber(r.skart);
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
    return { ukupnoRadnika: imena.size, aktivniRadnici: aktivniSet.size, zavrseneFaze, ukupnoZastoja, efikasnost, radMin: Math.round(radMin), zastMin: Math.round(zastMin) };
}