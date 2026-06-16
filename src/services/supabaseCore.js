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
    const parametri = n.parametri || n.podaci || {};
    const opParams = n.parametri_operacije || {};
    const podaci = { ...parametri, ...opParams };
    const master = n.master_nalog || podaci.master_nalog || null;
    return {
        ...podaci,
        ...n,
        broj_naloga: n.broj_naloga || n.broj || podaci.broj_naloga || podaci.ponBr,
        ponBr: n.broj_naloga || n.pon_br || podaci.ponBr || n.broj,
        pon_br: n.pon_br || podaci.ponBr || n.broj_naloga,
        glavni_nalog_id: n.glavni_nalog_id || podaci.glavni_nalog_id,
        master_nalog_id: n.glavni_nalog_id || n.master_nalog_id || podaci.master_nalog_id,
        master_broj: master?.broj || podaci.master_broj || podaci.ponBr || n.broj_naloga || n.broj,
        naziv: n.naziv || podaci.naziv || podaci.operacija,
        operacija: podaci.operacija || n.tip_naloga || n.naziv,
        tip: normalizeTip(n.tip_proizvoda || n.tip || podaci.tip || podaci.tip_proizvoda),
        tip_proizvoda: normalizeTip(n.tip_proizvoda || n.tip || podaci.tip || podaci.tip_proizvoda),
        tip_naloga: n.tip_naloga || podaci.tip_naloga || podaci.vrsta || podaci.operacija,
        vrsta: n.tip_naloga || podaci.vrsta || podaci.operacija,
        status: n.status || podaci.status || "ceka",
        redosled: n.redosled ?? podaci.redosled,
        kol: n.kolicina ?? podaci.kol ?? podaci.kolicina,
        kolicina: n.kolicina ?? podaci.kolicina ?? podaci.kol,
        prod: n.proizvod || podaci.prod || podaci.proizvod || podaci.naziv || n.naziv || "",
        proizvod: n.proizvod || podaci.proizvod || podaci.prod || podaci.naziv || n.naziv || "",
        kupac: n.kupac || podaci.kupac || podaci.klijent || "",
        mats: podaci.mats || n.materijali_struktura || podaci.struktura || podaci.specifikacija || [],
        struktura: podaci.struktura || podaci.mats || n.materijali_struktura || [],
        res: podaci.res || podaci.rezultat || n.rezultati || null,
        qr_kod: n.qr_code || n.qr_kod || podaci.qr_kod || podaci.qr_code,
        product_master_id: n.product_master_id || podaci.product_master_id,
        template_id: n.template_id || podaci.template_id,
        template_version: n.template_version || podaci.template_version,
        kalkulacija_id: n.kalkulacija_id || podaci.kalkulacija_id,
        ponuda_id: n.ponuda_id || podaci.ponuda_id,
        master_nalog: master,
    };
}

export function mapDbMaster(m, nalozi = []) {
    if (!m) return m;
    const podaci = m.parametri || m.podaci || {};
    const mappedNalozi = nalozi.filter((n) => String(n.glavni_nalog_id || n.master_nalog_id) === String(m.id));
    return {
        ...podaci,
        ...m,
        id: m.id,
        broj: m.broj || m.broj_naloga || podaci.broj || podaci.ponBr,
        broj_naloga: m.broj_naloga || m.broj || podaci.broj_naloga || podaci.ponBr,
        ponBr: m.broj_naloga || m.broj || podaci.ponBr,
        master_nalog_id: m.id,
        master_broj: m.broj_naloga || m.broj || podaci.master_broj,
        naziv: m.naziv || podaci.naziv || podaci.prod || podaci.proizvod,
        prod: m.proizvod || podaci.prod || podaci.proizvod || m.naziv,
        proizvod: m.proizvod || podaci.proizvod || podaci.prod || m.naziv,
        tip: normalizeTip(m.tip_proizvoda || m.tip || podaci.tip || podaci.tip_proizvoda),
        tip_proizvoda: normalizeTip(m.tip_proizvoda || m.tip || podaci.tip || podaci.tip_proizvoda),
        kol: m.kolicina ?? podaci.kol ?? podaci.kolicina,
        kolicina: m.kolicina ?? podaci.kolicina ?? podaci.kol,
        kupac: m.kupac || podaci.kupac || podaci.klijent || "",
        mats: podaci.mats || m.materijali_struktura || podaci.struktura || [],
        struktura: podaci.struktura || podaci.mats || m.materijali_struktura || [],
        res: m.rezultati || podaci.res || podaci.rezultat || null,
        product_master_id: m.product_master_id || podaci.product_master_id,
        template_id: m.template_id || podaci.template_id,
        template_version: m.template_version || podaci.template_version,
        ponuda_id: m.ponuda_id || podaci.ponuda_id,
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
        safeSelect("radni_nalozi"),
        safeSelect("operativni_nalozi"),
        safeSelect("magacin"),
        safeSelect("masine"),
        safeSelect("radnici"),
        safeSelect("mes_sesije"),
        safeSelect("qc_kontrole"),
    ]);

    // Novi izvor istine: radni_nalozi + operativni_nalozi.
    // Primarni izvor naloga je operativni_nalozi; stara tabela nalozi je samo kompatibilnost za migraciju.
    // Mapa: ponuda_id -> templejt (iz ponude.res.template). Tako nalog dobije folija podatke
    // i kad RPC ne kopira ceo templejt u sam nalog.
    const parseJ = (v, f) => { try { return typeof v === "string" ? JSON.parse(v) : (v || f); } catch { return f; } };
    const ponudaTpl = {};
    (ponude || []).forEach((p) => {
        if (p == null || p.id == null) return;
        const res = parseJ(p.res, {}) || {};
        const tpl = res.template || res.templejt || p.template || null;
        if (tpl) ponudaTpl[String(p.id)] = tpl;
    });
    const attachTpl = (n) => {
        if (!n) return n;
        const pid = String(n.ponuda_id ?? "");
        const tpl = pid && ponudaTpl[pid];
        if (!tpl) return n;
        const tdata = tpl.data || tpl;
        const folija = n.folija || (n.res && n.res.folija) || (tdata && tdata.folija) || tpl.folija || null;
        return {
            ...n,
            product_template: n.product_template || tpl,
            template: n.template || tpl,
            templateData: n.templateData || tdata,
            folija: folija || n.folija,
        };
    };

    const mappedOperativni = operativniRaw.map(mapDbNalog).map(attachTpl);
    const mappedNaloziStari = naloziRaw.map(mapDbNalog).map(attachTpl);
    const sviNalozi = mappedOperativni.length ? mappedOperativni : mappedNaloziStari;
    const mappedMasters = glavniRaw.map((m) => attachTpl(mapDbMaster(m, mappedOperativni)));

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
    if (!ponuda?.id) {
        return { usedRpc: false, data: null, error: new Error("Ponuda nema id.") };
    }

    // Novi MAROPACK tok: ponude(bigint) -> radni_nalozi -> operativni_nalozi
    const { data, error } = await supabase.rpc("kreiraj_naloge_iz_ponude", { p_ponuda_id: ponuda.id });
    if (!error) return { usedRpc: true, data, error: null };

    // Kompatibilnost sa starom UUID RPC funkcijom ako postoji u nekoj bazi.
    if (isUuid(ponuda.id)) {
        const legacy = await supabase.rpc("generate_master_nalog_from_ponuda", { p_ponuda_id: ponuda.id });
        if (legacy.error) return { usedRpc: true, data: null, error: legacy.error };
        return { usedRpc: true, data: legacy.data, error: null };
    }

    return { usedRpc: true, data: null, error };
}