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

/** Normalizuje red iz magacin_istorija za prikaz (vreme/operater/qr/akcija/opis). */
export function mapIstorijaRow(h = {}) {
  const nv = (h.nova_vrednost && typeof h.nova_vrednost === "object") ? h.nova_vrednost : {};
  const opisDelovi = [];
  if (h.napomena) opisDelovi.push(h.napomena);
  if (h.promena_m != null) opisDelovi.push(`Δ ${h.promena_m} m`);
  if (h.metraza_pre != null && h.metraza_posle != null) opisDelovi.push(`${h.metraza_pre} → ${h.metraza_posle} m`);
  if (h.nalog_ponbr) opisDelovi.push(`nalog ${h.nalog_ponbr}`);
  return {
    vreme: h.created_at ? new Date(h.created_at).toLocaleString("sr-RS") : "",
    operater: nv.operater || h.operater || "—",
    qr: h.br_rolne || h.qr_code || "",
    event: h.akcija || h.tip_promene || h.dogadjaj || "AKCIJA",
    opis: opisDelovi.join(" · "),
    stanje: nv.stanje || h.stanje || "",
    nalog_ponbr: h.nalog_ponbr || "",
    rolna_id: h.rolna_id ?? null,
  };
}
