import { supabase } from "../supabase.js";

export function isUuid(value) {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeTip(tip) {
    const t = String(tip || "folija").toLowerCase();
    if (t.includes("spul") || t.includes("špul")) return "spulna";
    if (t.includes("kes")) return "kesa";
    if (t.includes("fol")) return "folija";
    return "folija";
}

export function mapDbPonuda(p) {
    if (!p) return p;
    const podaci = p.podaci || {};
    return {
        ...podaci,
        ...p,
        broj: p.broj || podaci.broj,
        ponBr: p.broj || podaci.ponBr || podaci.broj,
        naziv: p.naziv || podaci.naziv || podaci.prod || podaci.proizvod,
        prod: podaci.prod || podaci.proizvod || p.naziv,
        proizvod: podaci.proizvod || podaci.prod || p.naziv,
        tip: normalizeTip(p.tip || podaci.tip || podaci.tip_proizvoda),
        tip_proizvoda: normalizeTip(p.tip || podaci.tip || podaci.tip_proizvoda),
        kol: p.kolicina ?? podaci.kol ?? podaci.kolicina,
        kolicina: p.kolicina ?? podaci.kolicina ?? podaci.kol,
        uk: p.cena_ukupno ?? podaci.uk,
        kupac: podaci.kupac || podaci.klijent || p.kupac || "",
        mats: podaci.mats || podaci.struktura || podaci.specifikacija || [],
        res: podaci.res || podaci.rezultat || null,
        nap: p.napomena || podaci.nap || podaci.napomena || "",
    };
}

export function mapDbNalog(n) {
    if (!n) return n;
    const podaci = n.podaci || {};
    const master = n.master_nalog || podaci.master_nalog || null;
    return {
        ...podaci,
        ...n,
        broj_naloga: n.broj || podaci.broj_naloga || podaci.ponBr,
        ponBr: n.pon_br || podaci.ponBr || n.broj,
        pon_br: n.pon_br || podaci.ponBr,
        master_nalog_id: n.master_nalog_id || podaci.master_nalog_id,
        master_broj: master?.broj || podaci.master_broj || podaci.ponBr || n.broj,
        naziv: n.naziv || podaci.naziv || podaci.operacija,
        operacija: podaci.operacija || n.naziv,
        tip: normalizeTip(n.tip || podaci.tip || podaci.tip_proizvoda),
        tip_proizvoda: normalizeTip(n.tip || podaci.tip || podaci.tip_proizvoda),
        tip_naloga: n.tip_naloga || podaci.tip_naloga || podaci.vrsta,
        vrsta: n.tip_naloga || podaci.vrsta,
        status: n.status || podaci.status || "aktivno",
        kol: n.kolicina ?? podaci.kol ?? podaci.kolicina,
        kolicina: n.kolicina ?? podaci.kolicina ?? podaci.kol,
        prod: podaci.prod || podaci.proizvod || podaci.naziv || "",
        proizvod: podaci.proizvod || podaci.prod || podaci.naziv || "",
        kupac: podaci.kupac || podaci.klijent || "",
        mats: podaci.mats || podaci.struktura || podaci.specifikacija || [],
        struktura: podaci.struktura || podaci.mats || [],
        res: podaci.res || podaci.rezultat || null,
        qr_kod: n.qr_code || podaci.qr_kod || podaci.qr_code,
        master_nalog: master,
    };
}

export function mapDbMaster(m, nalozi = []) {
    if (!m) return m;
    const podaci = m.podaci || {};
    const mappedNalozi = nalozi.filter((n) => String(n.master_nalog_id) === String(m.id));
    return {
        ...podaci,
        ...m,
        id: m.id,
        broj: m.broj || m.broj_naloga || podaci.broj || podaci.ponBr,
        broj_naloga: m.broj_naloga || m.broj || podaci.broj_naloga || podaci.ponBr,
        ponBr: m.broj || m.broj_naloga || podaci.ponBr,
        master_nalog_id: m.id,
        master_broj: m.broj || podaci.master_broj,
        naziv: m.naziv || podaci.naziv || podaci.prod || podaci.proizvod,
        prod: podaci.prod || podaci.proizvod || m.naziv,
        proizvod: podaci.proizvod || podaci.prod || m.naziv,
        tip: normalizeTip(m.tip || podaci.tip || podaci.tip_proizvoda),
        tip_proizvoda: normalizeTip(m.tip || podaci.tip || podaci.tip_proizvoda),
        kol: m.kolicina ?? podaci.kol ?? podaci.kolicina,
        kolicina: m.kolicina ?? podaci.kolicina ?? podaci.kol,
        kupac: podaci.kupac || podaci.klijent || "",
        mats: podaci.mats || podaci.struktura || [],
        struktura: podaci.struktura || podaci.mats || [],
        res: podaci.res || podaci.rezultat || null,
        nalozi: mappedNalozi,
    };
}

export function mapDbRolna(r) {
    if (!r) return r;
    const vrsta = r.vrsta || r.tip || r.materijal || '';
    const oznaka = r.oznaka_materijala || r.oznaka || '';
    return {
        ...r,
        qr: r.qr_code || r.br_rolne || r.broj_rolne || String(r.id || ''),
        br_rolne: r.br_rolne || r.qr_code || String(r.id || ''),
        vrsta,
        pod_vrsta: r.pod_vrsta || '',
        oznaka_materijala: oznaka,
        komercijalnaOznaka: oznaka,
        materijal: vrsta,
        proizvodjac: r.proizvodjac || r.dobavljac || '',
        debljina: r.deb ?? r.debljina ?? 0,
        duzina: r.metraza_ost ?? r.metraza ?? r.duzina ?? 0,
        kg: r.kg_neto ?? r.kg_bruto ?? r.kg ?? 0,
        datum: r.datum_prijema || r.datum || r.created_at || '',
        datum_ulaza: r.datum_prijema || r.datum || r.created_at || '',
        datum_proizvodnje: r.datum_proizvodnje || '',
    };
}

// Otporno čitanje jedne tabele: ako tabela/kolona fali, vraća [] umesto da sruši sve.
async function safeSelect(table, orderCol = "created_at") {
    try {
        const { data, error } = await supabase.from(table).select("*").order(orderCol, { ascending: false });
        if (!error) return data || [];
        const retry = await supabase.from(table).select("*");
        if (retry.error) { console.warn(`fetchCoreData: tabela "${table}" — ${retry.error.message}`); return []; }
        return retry.data || [];
    } catch (e) {
        console.warn(`fetchCoreData: tabela "${table}" — ${e?.message || e}`);
        return [];
    }
}

export async function fetchCoreData() {
    // Izvor istine = živa baza (RolneWarehouseEngine šema).
    const [proizvodi, ponude, naloziRaw, glavniRaw, operativniRaw, magacinRaw, masine, radnici, sesije, qc] = await Promise.all([
        safeSelect("proizvodi"),
        safeSelect("ponude"),
        safeSelect("nalozi"),
        safeSelect("radni_nalozi_glavni"),
        safeSelect("operativni_nalozi"),
        safeSelect("magacin"),
        safeSelect("masine"),
        safeSelect("radnici"),
        safeSelect("mes_sesije"),
        safeSelect("qc_kontrole"),
    ]);

    // Operativni nalozi se vezuju na glavni preko glavni_nalog_id; spajamo i stare "nalozi".
    const mappedOperativni = operativniRaw.map(mapDbNalog);
    const mappedNaloziStari = naloziRaw.map(mapDbNalog);
    const sviNalozi = [...mappedOperativni, ...mappedNaloziStari];
    const mappedMasters = glavniRaw.map((m) => mapDbMaster(m, mappedOperativni));

    return {
        proizvodi: proizvodi || [],
        ponude: (ponude || []).map(mapDbPonuda),
        nalozi: sviNalozi,
        master_nalozi: mappedMasters,
        rolne: (magacinRaw || []).map(mapDbRolna),
        masine: masine || [],
        radnici: radnici || [],
        production_sessions: sesije || [],
        qc_zapisnici: qc || [],
    };
}

export async function generateMasterFromPonuda(ponuda) {
    if (!ponuda?.id || !isUuid(ponuda.id)) {
        return { usedRpc: false, data: null, error: new Error("Ponuda nema Supabase UUID id, koristi se lokalni fallback.") };
    }
    const { data, error } = await supabase.rpc("generate_master_nalog_from_ponuda", { p_ponuda_id: ponuda.id });
    if (error) return { usedRpc: true, data: null, error };
    return { usedRpc: true, data, error: null };
}
