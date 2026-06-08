// utils/magacinIstorija.js
// Jedinstveno mesto za upis u magacin_istorija — sva mesta gde se rolna dodirne
// (ulaz, rezervacija za nalog, potrošnja, povrat, popis, promena lokacije, brisanje)
// zovu OVU funkciju, pa istorija uvek završi na jednom mestu i u pravim kolonama.
import { supabase } from "../supabase.js";

let _userIdCache = undefined; // razlikujemo "nije traženo" (undefined) od "nema" (null)

async function resolveUserId(explicit) {
    if (explicit) return explicit;
    if (_userIdCache !== undefined) return _userIdCache;
    try {
        const { data } = await supabase.auth.getUser();
        _userIdCache = data?.user?.id || null;
    } catch {
        _userIdCache = null;
    }
    return _userIdCache;
}

/**
 * Upis jednog događaja u magacin_istorija (prave kolone tabele).
 * Sva polja su opciona; popuni ono što imaš.
 */
export async function logMagacinIstorija({
    rolna_id = null,
    br_rolne = null,
    akcija = "AKCIJA",
    tip_promene = null,
    nalog_id = null,
    nalog_ponbr = null,
    metraza_pre = null,
    metraza_posle = null,
    promena_m = null,
    stara_vrednost = null,
    nova_vrednost = null,
    napomena = null,
    operater = null,   // ime osobe (radi prikaza) — čuva se u nova_vrednost.operater
    user_id = null,    // uuid prijavljenog korisnika (ako se ne prosledi, vuče se iz auth)
} = {}) {
    try {
        const uid = await resolveUserId(user_id);
        const num = (v) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
        const nv = (nova_vrednost && typeof nova_vrednost === "object") ? nova_vrednost : (nova_vrednost != null ? { vrednost: nova_vrednost } : {});
        const payload = {
            rolna_id: num(rolna_id),
            br_rolne: br_rolne ? String(br_rolne) : null,
            akcija: akcija || null,
            tip_promene: tip_promene || akcija || null,
            nalog_id: num(nalog_id),
            nalog_ponbr: nalog_ponbr ? String(nalog_ponbr) : null,
            user_id: uid,
            metraza_pre: num(metraza_pre),
            metraza_posle: num(metraza_posle),
            promena_m: num(promena_m),
            stara_vrednost: stara_vrednost ?? null,
            nova_vrednost: { ...(operater ? { operater } : {}), ...nv },
            napomena: napomena || null,
            // created_at: ostavljamo bazi (default now())
        };
        const { error } = await supabase.from("magacin_istorija").insert(payload);
        if (error) throw error;
        return { ok: true };
    } catch (e) {
        console.warn("magacin_istorija upis nije uspeo:", e?.message || e);
        return { ok: false, error: e?.message || String(e) };
    }
}

/** Lepše labele za akcije (i trigger i app pišu u istu tabelu). */
const AKCIJA_LABELE = {
    kreirana: "Uneta na stanje",
    ulaz: "Uneta na stanje",
    "ulaz u magacin": "Uneta na stanje",
    "ulaz u magacin (spoj)": "Uneta (spoj)",
    uvoz: "Uvoz",
    "uvoz packing liste": "Uvoz (packing lista)",
    status_promenjen: "Status promenjen",
    "promena statusa": "Status promenjen",
    azurirana: "Izmenjena",
    rezervacija: "Rezervisana",
    potrosnja: "Potrošnja",
    "potrošnja": "Potrošnja",
    povrat: "Vraćena u magacin",
    "qr sken / povrat": "Vraćena (QR)",
    popis: "Popisana",
    obrisana: "Obrisana",
    "brisanje rolne": "Obrisana",
    promena_lokacije: "Promena lokacije",
};

/** Normalizuje red iz magacin_istorija za prikaz — radi i sa trigger redovima (old/new jsonb) i sa app redovima. */
export function mapIstorijaRow(h = {}) {
    const nv = (h.nova_vrednost && typeof h.nova_vrednost === "object") ? h.nova_vrednost : {};
    const sv = (h.stara_vrednost && typeof h.stara_vrednost === "object") ? h.stara_vrednost : {};

    const br = h.br_rolne || nv.br_rolne || sv.br_rolne || nv.qr_code || sv.qr_code || h.qr_code
        || (h.rolna_id != null ? "#" + h.rolna_id : "");

    const akcijaRaw = String(h.akcija || h.tip_promene || h.dogadjaj || "");
    const event = AKCIJA_LABELE[akcijaRaw.toLowerCase()] || akcijaRaw || "Akcija";

    const delovi = [];
    if (h.napomena) delovi.push(h.napomena);

    const stStat = sv.status, nvStat = nv.status;
    if (nvStat && stStat && nvStat !== stStat) delovi.push(`${stStat} → ${nvStat}`);
    else if (nvStat && akcijaRaw.toLowerCase().includes("status")) delovi.push(`→ ${nvStat}`);

    const mPre = h.metraza_pre ?? sv.metraza_ost ?? sv.duzina;
    const mPosle = h.metraza_posle ?? nv.metraza_ost ?? nv.duzina;
    if (h.promena_m != null) delovi.push(`Δ ${h.promena_m} m`);
    else if (mPre != null && mPosle != null && Number(mPre) !== Number(mPosle)) delovi.push(`${mPre} → ${mPosle} m`);

    const nalog = h.nalog_ponbr || nv.dodeljeno_nalogu || nv.za_nalog || sv.dodeljeno_nalogu;
    if (nalog) delovi.push(`nalog ${nalog}`);

    const lokPre = sv.lokacija, lokPosle = nv.lokacija;
    if (lokPosle && lokPre && lokPosle !== lokPre) delovi.push(`lok ${lokPre} → ${lokPosle}`);

    if (!delovi.length) {
        const mat = [nv.vrsta || sv.vrsta, nv.oznaka_materijala || nv.oznaka || sv.oznaka_materijala,
        (nv.debljina || sv.debljina) ? (nv.debljina || sv.debljina) + "µ" : ""].filter(Boolean).join(" ");
        if (mat) delovi.push(mat);
    }

    return {
        vreme: h.created_at ? new Date(h.created_at).toLocaleString("sr-RS") : "",
        operater: nv.operater || sv.operater || h.operater || "—",
        qr: br,
        event,
        opis: delovi.join(" · "),
        stanje: nvStat || h.stanje || "",
        nalog_ponbr: nalog || "",
        rolna_id: h.rolna_id ?? null,
    };
}
