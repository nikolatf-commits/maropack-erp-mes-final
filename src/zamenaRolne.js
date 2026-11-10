// =====================================================================
// zamenaRolne.js — ZAMENA OŠTEĆENE REZERVISANE ROLNE
// Jedan zajednički modul koji zovu i magacioner (telefon) i admin (Pregled naloga).
//
// Radi 1:1 kao rezervacija (ProductTemplateEngineV20) da NE dođe do mešanja:
//   • magacin — stara: −rezervisano, skloni nalog iz dodeljeno_nalogu, status „blokirana" (+napomena)
//   • magacin — nova:  +rezervisano (isti metri), dodaj nalog u dodeljeno_nalogu
//   • operativni_nalozi.parametri_operacije.izabrane_rolne  (GLAVNI izvor za magacionera)
//   • materijali_nalozi.parametri.izabrane_rolne (+ rezervisane_rolne)
//   • materijal_stavke: staroj rolni status „zamenjeno", nova rolna → nov red „rezervisano"
// =====================================================================
import { supabase } from "./supabase";

const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const normMat = (v) => String(v || "").toUpperCase().replace(/\s+/g, "").replace(/[-_].*$/, "");
function pj(v) { if (!v) return null; if (typeof v === "object") return v; try { return JSON.parse(v); } catch (e) { return null; } }

function rolnaMetraza(r) { return num(r.metraza_ost ?? r.metraza); }
function slobodnoM(r) { return Math.max(0, rolnaMetraza(r) - num(r.rezervisano)); }
function rolnaDatum(r) { const t = Date.parse(r.datum_proizvodnje || r.datum || ""); return isNaN(t) ? Infinity : t; }
function formatTrake(w, ideal) { w = num(w); ideal = num(ideal); if (!ideal || w < ideal) return 1; return Math.max(1, Math.floor(w / ideal)); }

// Ista vrsta materijala kao stara stavka. Toleriše razlike u opisu („BOPP" vs „BOPP Transparent")
// i radi samo kad su OBA podatka poznata (da ne iskljuci legitimnu rolnu zbog praznog polja).
function istiMaterijal(r, stara) {
    const rv = normMat(r.vrsta || r.tip), sv = normMat(stara.snap_vrsta || stara.materijal);
    if (rv && sv && rv !== sv && !rv.startsWith(sv) && !sv.startsWith(rv)) return false;
    const rd = num(r.deb || r.debljina), sd = num(stara.snap_debljina || stara.debljina);
    if (rd && sd && Math.abs(rd - sd) > 5) return false;   // tolerancija debljine 5µ
    return true;
}

// ── Kandidati za zamenu (rangirano: najbliža idealnoj širina → FIFO → više slobodnih m) ──
// sveRolne = rolne iz magacina (sa poljima: id, vrsta, deb/debljina, sirina, status,
//            metraza/metraza_ost, rezervisano, datum…). stara = izbor-stavka koja se menja.
export function nadjiZamenske(sveRolne, stara, opts = {}) {
    // VAŽNO: idealna širina NE pada na širinu STARE rolne (ona ume biti šira od idealne,
    // npr. 600 za idealnih 440) — to bi pogrešno izbacilo sve uže-ali-dovoljne rolne.
    const ideal = num(opts.ideal) || num(stara.format_ciljna) || 0;
    const trebaM = num(opts.trebaM) || num(stara.alocirano_m) || 0;
    const blok = ["blokiran", "iskorišć", "iskorisc", "u štampar", "u stampar"];
    const list = (sveRolne || []).filter((r) => {
        if (!r || r.id == null) return false;
        if (String(r.id) === String(stara.rolna_id)) return false;          // ne sama stara
        const st = String(r.status || "").toLowerCase();
        if (blok.some((b) => st.includes(b))) return false;                 // ne blokirana/iskorišćena
        // SAMO SLOBODNE ROLNE NA STANJU — ne nudi rolne rezervisane za druge naloge.
        if (num(r.rezervisano) > 0) return false;                           // ima rezervisanih metara → preskoči
        if (String(r.dodeljeno_nalogu || "").trim() !== "") return false;   // dodeljena nekom nalogu → preskoči
        if (st.includes("rezervis") || st.includes("delimičn") || st.includes("delimicn")) return false; // status rezervacije → preskoči
        if (slobodnoM(r) <= 1) return false;                                // mora imati metara
        if (ideal && num(r.sirina) + 1 < ideal) return false;               // dovoljno široka (samo ako znamo idealnu)
        if (!istiMaterijal(r, stara)) return false;                         // isti materijal
        return true;
    });
    const refW = ideal || num(stara.sirina) || 0;
    return list.sort((a, b) => {
        // 1) prvo rolne sa DOVOLJNO metara, 2) najbliža (idealnoj/staroj) širina, 3) FIFO, 4) više slobodnih
        const am = (!trebaM || slobodnoM(a) >= trebaM - 1) ? 0 : 1;
        const bm = (!trebaM || slobodnoM(b) >= trebaM - 1) ? 0 : 1;
        if (am !== bm) return am - bm;
        if (refW) { const wa = Math.abs(num(a.sirina) - refW), wb = Math.abs(num(b.sirina) - refW); if (wa !== wb) return wa - wb; }
        const da = rolnaDatum(a), db = rolnaDatum(b);
        if (da !== db) return da - db;
        return slobodnoM(b) - slobodnoM(a);
    });
}

// ── dodeljeno_nalogu: string „MP-2026-0008 · NAZIV, MP-2026-0009 · NAZIV2" ──
function ukloniNalog(dodStr, nalogRef) {
    return String(dodStr || "").split(",").map((s) => s.trim()).filter(Boolean)
        .filter((p) => !p.startsWith(nalogRef)).join(", ");
}
function dodajNalog(dodStr, nalogRef, oznaka) {
    const parts = String(dodStr || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.some((p) => p.startsWith(nalogRef))) return parts.join(", ");
    parts.push(oznaka);
    return parts.join(", ");
}

// Zameni stavku u nizu izabrane_rolne (po rolna_id + sloj). Ako je nema → dodaj novu.
function zameniUIzboru(arr, stara, nova) {
    const sloj = num(stara.sloj);
    let done = false;
    const out = (Array.isArray(arr) ? arr : []).map((x) => {
        if (!done && String(x.rolna_id) === String(stara.rolna_id) && num(x.sloj) === sloj) {
            done = true; return nova;
        }
        return x;
    });
    if (!done) out.push(nova);
    return out;
}

// ── GLAVNA FUNKCIJA ────────────────────────────────────────────────────
// cfg = {
//   nalogRef,            // broj naloga, npr. "MP-2026-0008" (= materijal_stavke.nalog_ref)
//   opId,               // operativni_nalozi.id (operacija materijala) — GLAVNI izvor
//   materijaliNalogId,  // materijali_nalozi.id (nalog magacionera)
//   proizvodNaziv,      // za dodeljeno_nalogu „broj · naziv"
//   ideal,              // idealna širina materijala (mm)
//   staraStavka,        // izbor-stavka koja se menja (iz izabrane_rolne)
//   nova,               // izabrana zamenska rolna iz magacina (ceo red)
//   blokiraj,           // true → stara ide „blokirana" + napomena; false → vrati „Na stanju"
// }
export async function zameniRolnu(cfg) {
    const {
        nalogRef, opId = null, materijaliNalogId = null, proizvodNaziv = "",
        staraStavka, nova, blokiraj = true,
    } = cfg || {};
    if (!staraStavka || staraStavka.rolna_id == null) throw new Error("Nedostaje stara rolna (rolna_id).");
    if (!nova || nova.id == null) throw new Error("Nedostaje zamenska rolna.");
    if (!nalogRef) throw new Error("Nedostaje broj naloga (nalogRef).");

    const alocM = Math.round(num(staraStavka.alocirano_m));
    const sloj = num(staraStavka.sloj) || 1;
    const idealW = num(cfg.ideal) || num(staraStavka.format_ciljna) || num(staraStavka.sirina);
    const oznaka = nalogRef + (proizvodNaziv ? " · " + proizvodNaziv : "");

    // 1) Nova izbor-stavka — ista struktura kao izborData (rezervacija)
    const ukupnoNova = rolnaMetraza(nova);
    const kgPoM = ukupnoNova > 0 ? (num(nova.kg_neto || nova.kg)) / ukupnoNova : 0;
    const novaStavka = {
        sloj,
        materijal: staraStavka.materijal || "",
        oznaka: staraStavka.oznaka || "",
        proizvodjac: staraStavka.proizvodjac || "",
        debljina: staraStavka.debljina || "",
        rucni: false,
        redni_rolne: staraStavka.redni_rolne || 1,
        br_rolne: nova.br_rolne || null,
        rolna_id: nova.id || null,
        sirina: num(nova.sirina) || null,
        snap_sirina: num(nova.sirina) || null,
        metraza: ukupnoNova,
        slobodno_m: slobodnoM(nova),
        rez_pre: num(nova.rezervisano),
        alocirano_m: alocM,
        format_trake: formatTrake(nova.sirina, idealW),
        format_ciljna: idealW || null,
        lokacija: nova.lokacija || nova.palet || null,
        palet: nova.palet || null,
        lot: nova.lot || null,
        snap_vrsta: nova.vrsta || nova.tip || staraStavka.snap_vrsta || "",
        snap_pod_vrsta: nova.pod_vrsta || staraStavka.snap_pod_vrsta || "",
        snap_oznaka: nova.oznaka_materijala || nova.oznaka || staraStavka.snap_oznaka || "",
        snap_debljina: num(nova.deb || nova.debljina) || staraStavka.snap_debljina || null,
        snap_dobavljac: nova.dobavljac || "",
        kg_po_m: kgPoM,
        zamenjena_rolna: staraStavka.br_rolne || staraStavka.rolna_id || null, // trag
    };

    // 2) MAGACIN — stara (oštećena)
    {
        const { data: oldRow } = await supabase.from("magacin")
            .select("rezervisano, dodeljeno_nalogu, napomena").eq("id", staraStavka.rolna_id).single();
        const oldRez = Math.max(0, Math.round(num(oldRow && oldRow.rezervisano) - alocM));
        const oldDod = ukloniNalog(oldRow && oldRow.dodeljeno_nalogu, nalogRef);
        const napBase = (oldRow && oldRow.napomena) ? String(oldRow.napomena).trim() : "";
        const napNova = "Oštećena — zamenjena na nalogu " + nalogRef;
        const upd = blokiraj
            ? { status: "blokirana", rezervisano: oldRez || null, dodeljeno_nalogu: oldDod || null, napomena: (napBase ? napBase + " · " : "") + napNova }
            : { status: oldRez > 0 ? "Rezervisano" : "Na stanju", rezervisano: oldRez || null, dodeljeno_nalogu: oldDod || null };
        const { error } = await supabase.from("magacin").update(upd).eq("id", staraStavka.rolna_id);
        if (error) throw new Error("magacin (stara): " + error.message);
    }

    // 3) MAGACIN — nova (zamenska), isti metri
    {
        const { data: newRow } = await supabase.from("magacin")
            .select("metraza, metraza_ost, rezervisano, dodeljeno_nalogu").eq("id", nova.id).single();
        const ukupnoN = num(newRow && (newRow.metraza_ost ?? newRow.metraza)) || ukupnoNova;
        const newRez = Math.min(ukupnoN || Infinity, Math.round(num(newRow && newRow.rezervisano) + alocM));
        const punoRez = ukupnoN > 0 && newRez >= ukupnoN - 1;
        const newDod = dodajNalog(newRow && newRow.dodeljeno_nalogu, nalogRef, oznaka);
        const { error } = await supabase.from("magacin")
            .update({ status: punoRez ? "Rezervisano" : "Na stanju", rezervisano: newRez || null, dodeljeno_nalogu: newDod })
            .eq("id", nova.id);
        if (error) throw new Error("magacin (nova): " + error.message);
    }

    // 4) OPERATIVNI_NALOZI — izabrane_rolne (GLAVNI izvor za magacionera)
    if (opId) {
        const { data: opRow } = await supabase.from("operativni_nalozi")
            .select("parametri_operacije").eq("id", opId).single();
        const po = pj(opRow && opRow.parametri_operacije) || {};
        const arr = po.izabrane_rolne || po.rezervisane_rolne || [];
        const novi = zameniUIzboru(arr, staraStavka, novaStavka);
        const { error } = await supabase.from("operativni_nalozi")
            .update({ parametri_operacije: { ...po, izabrane_rolne: novi } }).eq("id", opId);
        if (error) throw new Error("operativni_nalozi: " + error.message);
    }

    // 5) MATERIJALI_NALOZI — izabrane_rolne (+ rezervisane_rolne)
    if (materijaliNalogId) {
        const { data: mn } = await supabase.from("materijali_nalozi")
            .select("parametri").eq("id", materijaliNalogId).single();
        const mp = pj(mn && mn.parametri) || {};
        const arr = mp.izabrane_rolne || mp.rezervisane_rolne || [];
        const novi = zameniUIzboru(arr, staraStavka, novaStavka);
        const { error } = await supabase.from("materijali_nalozi")
            .update({ parametri: { ...mp, izabrane_rolne: novi, rezervisane_rolne: novi } }).eq("id", materijaliNalogId);
        if (error) throw new Error("materijali_nalozi: " + error.message);
    }

    // 6) MATERIJAL_STAVKE — stara „zamenjeno", nova nov red „rezervisano"
    try {
        await supabase.from("materijal_stavke").update({ status: "zamenjeno" })
            .eq("nalog_ref", nalogRef).eq("rolna_id", staraStavka.rolna_id).eq("sloj", sloj);
        await supabase.from("materijal_stavke").insert([{
            nalog_ref: nalogRef,
            materijali_nalog_id: materijaliNalogId || null,
            rolna_id: nova.id || null,
            br_rolne: nova.br_rolne || null,
            sloj,
            vrsta: novaStavka.snap_vrsta || null,
            pod_vrsta: novaStavka.snap_pod_vrsta || null,
            oznaka: novaStavka.snap_oznaka || null,
            debljina: novaStavka.snap_debljina,
            dobavljac: novaStavka.snap_dobavljac || null,
            sirina: num(nova.sirina) || null,
            idealna_sirina: idealW || null,
            alocirano_m: alocM,
            kg_po_m: novaStavka.kg_po_m || 0,
            kg_alocirano: Math.round((novaStavka.kg_po_m || 0) * alocM * 100) / 100,
            status: "rezervisano",
        }]);
    } catch (e) {
        // Knjiga je za analize — ako padne, zamena je već upisana na glavnim mestima.
        if (typeof console !== "undefined") console.warn("materijal_stavke (zamena):", e && e.message);
    }

    // Obavesti ostale ekrane da osveže
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("maropack:nalozi-changed", { detail: { nalogRef } }));
    }
    return { ok: true, novaStavka };
}
