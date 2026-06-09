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

let _imeMapCache = null;
/** Učitava mapu uuid/email -> ime iz tabela users (pa radnici kao rezerva). Kešira se. */
export async function loadOperateriMap(force = false) {
    if (_imeMapCache && !force) return _imeMapCache;
    const map = {};
    try {
        const { data } = await supabase.from("users").select("id, ime, email");
        (data || []).forEach((u) => {
            const ime = u.ime || u.email;
            if (u.id) map[u.id] = ime;
            if (u.email) map[String(u.email).toLowerCase()] = ime;
        });
    } catch { /* tabela možda ne postoji */ }
    try {
        const { data } = await supabase.from("radnici").select("id, ime, prezime");
        (data || []).forEach((r) => {
            if (r.id && !map[r.id]) map[r.id] = [r.ime, r.prezime].filter(Boolean).join(" ");
        });
    } catch { /* ignore */ }
    _imeMapCache = map;
    return map;
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

function _num(v, dec = 0) {
    const n = Number(v);
    if (!isFinite(n)) return null;
    return n.toLocaleString("sr-RS", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Pun opis rolne iz reda (jsonb): vrsta · pod vrsta · oznaka · proizvođač · deb · širina · metraža · kg · LOT */
function _specRolne(o) {
    if (!o || typeof o !== "object") return "";
    const deb = o.deb ?? o.debljina;
    const jed = String(o.vrsta || "").toUpperCase() === "PAPIR" ? "g/m²" : "µ";
    const m = o.metraza_ost ?? o.metraza;
    const kg = o.kg_neto ?? o.kg ?? o.kg_bruto;
    return [
        o.vrsta,
        o.pod_vrsta,
        o.oznaka_materijala || o.oznaka,
        o.dobavljac || o.proizvodjac,
        deb != null ? `${deb}${jed}` : null,
        o.sirina != null ? `${_num(o.sirina)} mm` : null,
        m != null ? `${_num(m)} m` : null,
        kg != null ? `${_num(kg, 2)} kg` : null,
        o.lot ? `LOT ${o.lot}` : null,
    ].filter(Boolean).join(" · ");
}

/** Normalizuje red iz magacin_istorija za prikaz — radi i sa trigger redovima (old/new jsonb) i sa app redovima. */
export function mapIstorijaRow(h = {}, imeMap = {}) {
    const nv = (h.nova_vrednost && typeof h.nova_vrednost === "object") ? h.nova_vrednost : {};
    const sv = (h.stara_vrednost && typeof h.stara_vrednost === "object") ? h.stara_vrednost : {};
    const izvor = Object.keys(nv).length ? nv : sv;

    const br = h.br_rolne || nv.br_rolne || sv.br_rolne || nv.qr_code || sv.qr_code || h.qr_code
        || (h.rolna_id != null ? "#" + h.rolna_id : "");

    const akcijaRaw = String(h.akcija || h.tip_promene || h.dogadjaj || "");
    const event = AKCIJA_LABELE[akcijaRaw.toLowerCase()] || akcijaRaw || "Akcija";

    // detalj akcije (status promena / metraža / nalog / lokacija / napomena)
    const detalj = [];
    if (h.napomena) detalj.push(h.napomena);
    if (nv.status && sv.status && nv.status !== sv.status) detalj.push(`${sv.status} → ${nv.status}`);
    else if (nv.status && akcijaRaw.toLowerCase().includes("status")) detalj.push(`→ ${nv.status}`);
    const mPre = h.metraza_pre ?? sv.metraza_ost, mPosle = h.metraza_posle ?? nv.metraza_ost;
    if (h.promena_m != null) detalj.push(`Δ ${h.promena_m} m`);
    else if (mPre != null && mPosle != null && Number(mPre) !== Number(mPosle)) detalj.push(`${_num(mPre)} → ${_num(mPosle)} m`);
    const nalog = h.nalog_ponbr || nv.dodeljeno_nalogu || nv.za_nalog || sv.dodeljeno_nalogu;
    if (nalog) detalj.push(`nalog ${nalog}`);
    if (nv.lokacija && sv.lokacija && nv.lokacija !== sv.lokacija) detalj.push(`lok ${sv.lokacija} → ${nv.lokacija}`);

    const spec = _specRolne(izvor);
    const opis = [detalj.join(" · "), spec].filter(Boolean).join("  ·  ");

    const operater = imeMap[h.user_id] || imeMap[nv.kreirao_user_id] || imeMap[sv.kreirao_user_id]
        || imeMap[String(nv.email || sv.email || "").toLowerCase()]
        || nv.operater || sv.operater || h.operater || "—";

    return {
        vreme: h.created_at ? new Date(h.created_at).toLocaleString("sr-RS") : "",
        operater,
        qr: br,
        event,
        opis,
        stanje: nv.status || h.stanje || "",
        nalog_ponbr: nalog || "",
        rolna_id: h.rolna_id ?? null,
    };
}
