// =====================================================================
//  SPOJ ROLNE — prepoznavanje kaširanih (spojenih) rolni na stanju koje
//  pokrivaju CELU kombinaciju slojeva naloga. Čista funkcija (bez I/O).
//
//  Kako se spoj čuva u magacinu (RolneWarehouseEngine.addCompositeRoll):
//    tip: "SPOJ"
//    vrsta: "PET // LDPE"                       (vrste slojeva)
//    oznaka_materijala: "PET PET 12µ // LDPE LDPE 48µ"
//    napomena: "... 1) Vrsta: PET | Pod vrsta: — | Oznaka: — | 12µ = ... ;
//                    2) Vrsta: LDPE | Pod vrsta: — | Oznaka: — | 48µ = ..."
//  Slojevi se čitaju iz napomene (pouzdano), uz fallback na vrsta/oznaka string.
// =====================================================================

const NN = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const UP = (v) => String(v ?? "").trim().toUpperCase();
const ZAUZETO_RE = /utros|utroš|iskoris|iskorišć|prodat|isporu|otpis|storn|obrisan|arhiv|zavrsen|završen|rezervis/i;
const slobodnoM = (r) => Math.max(0, NN(r.metraza_ost ?? r.metraza) - NN(r.rezervisano));

// Iz jedne SPOJ rolne izvuci slojeve [{vrsta, pod_vrsta, oznaka, debljina}]
export function parsirajSlojeve(rolna) {
    const nap = String(rolna.napomena || "");
    const re = /(\d+)\)\s*Vrsta:\s*([^|]+?)\s*\|\s*Pod vrsta:\s*([^|]+?)\s*\|\s*Oznaka:\s*([^|]+?)\s*\|\s*([\d.,]+)\s*[µg]/g;
    const out = [];
    let m;
    while ((m = re.exec(nap))) {
        out.push({
            vrsta: m[2].trim(),
            pod_vrsta: m[3].trim() === "—" ? "" : m[3].trim(),
            oznaka: m[4].trim() === "—" ? "" : m[4].trim(),
            debljina: NN(m[5]),
        });
    }
    if (out.length) return out;

    // fallback: vrsta "PET // LDPE" + oznaka_materijala "PET PET 12µ // LDPE LDPE 48µ"
    const vrste = String(rolna.vrsta || "").split("//").map((s) => s.trim()).filter(Boolean);
    const opisi = String(rolna.oznaka_materijala || "").split("//").map((s) => s.trim());
    return vrste.map((v, i) => {
        const o = opisi[i] || "";
        const debM = o.match(/([\d.,]+)\s*[µg]/);
        return { vrsta: v, pod_vrsta: "", oznaka: "", debljina: debM ? NN(debM[1]) : 0 };
    });
}

// Da li jedan traženi sloj proizvoda odgovara jednom sloju spoja
function slojUpareni(trazen, spoj) {
    if (UP(trazen.vrsta) !== UP(spoj.vrsta)) return false;
    // pod_vrsta / oznaka se porede samo ako su prisutni na obe strane
    if (String(trazen.pod_vrsta || "").trim() && String(spoj.pod_vrsta || "").trim() && UP(trazen.pod_vrsta) !== UP(spoj.pod_vrsta)) return false;
    if (String(trazen.oznaka || "").trim() && String(spoj.oznaka || "").trim() && UP(trazen.oznaka) !== UP(spoj.oznaka)) return false;
    if (NN(trazen.debljina) && NN(spoj.debljina) && Math.abs(NN(trazen.debljina) - NN(spoj.debljina)) > 1) return false;
    return true;
}

// Da li spoj (niz slojeva) pokriva tražene slojeve — u redosledu ili obrnuto
export function spojOdgovara(spojLayers, trazeni) {
    if (!spojLayers.length || spojLayers.length !== trazeni.length) return false;
    const napred = trazeni.every((t, i) => slojUpareni(t, spojLayers[i]));
    const nazad = trazeni.every((t, i) => slojUpareni(t, spojLayers[spojLayers.length - 1 - i]));
    return napred || nazad;
}

/**
 * nadjiSpojRolne — SPOJ rolne na stanju koje pokrivaju sve slojeve naloga.
 * @param magacin          sve rolne
 * @param trazeniSlojevi   slojevi proizvoda [{vrsta, pod_vrsta, oznaka|oznaka_materijala, debljina|deb}]
 * @param opts             { minSirina=0 }  — npr. idealna širina naloga
 * @returns matching rolne (svaka + _slojevi + _slobodno)
 */
export function nadjiSpojRolne(magacin, trazeniSlojevi, opts = {}) {
    const trazeni = (trazeniSlojevi || []).map((l) => ({
        vrsta: l.vrsta, pod_vrsta: l.pod_vrsta,
        oznaka: l.oznaka || l.oznaka_materijala || "", debljina: NN(l.debljina || l.deb),
    })).filter((l) => String(l.vrsta || "").trim());
    if (trazeni.length < 2) return [];   // spoj ima smisla tek za 2+ sloja
    const minSir = NN(opts.minSirina);

    return (magacin || [])
        .filter((r) => {
            if (UP(r.tip) !== "SPOJ") return false;
            if (ZAUZETO_RE.test(String(r.status || ""))) return false;
            if (slobodnoM(r) <= 0) return false;
            if (minSir && NN(r.sirina) < minSir) return false;
            return spojOdgovara(parsirajSlojeve(r), trazeni);
        })
        .map((r) => ({ ...r, _slojevi: parsirajSlojeve(r), _slobodno: slobodnoM(r) }));
}
