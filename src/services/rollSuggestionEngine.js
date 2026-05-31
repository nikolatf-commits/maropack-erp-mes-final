import { normalizeMaterial } from "../data/materialMaster.js";

const norm = (v) => String(v ?? "").trim().toLowerCase();
const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const dateValue = (v) => {
  const t = v ? new Date(v).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

export function normalizeMaterialLayer(layer = {}) {
  const normalized = normalizeMaterial(layer);
  return {
    ...normalized,
    sloj: layer.sloj ?? layer.layer ?? 1,
    vrsta: layer.vrsta || layer.tip || normalized.vrsta || "",
    pod_vrsta: layer.pod_vrsta || layer.podvrsta || layer.subtype || "",
    oznaka_materijala: layer.oznaka_materijala || layer.oznaka || layer.grade || normalized.oznaka || "",
    oznaka: layer.oznaka || layer.oznaka_materijala || layer.grade || normalized.oznaka || "",
    debljina: layer.debljina || layer.deb || layer.thickness || normalized.debljina || "",
    idealna_sirina: layer.idealna_sirina || layer.idealnaSirina || layer.sirina || layer.sirinaMm || "",
    metraza: layer.metraza || layer.potrebno_m || layer.potrebnoM || layer.metara || "",
  };
}

export function normalizeRollForSuggestion(roll = {}) {
  const normalized = normalizeMaterial(roll);
  const vrsta = roll.vrsta || roll.tip || roll.materijal || normalized.vrsta || "";
  return {
    ...roll,
    magacin_id: roll.magacin_id || roll.id,
    br_rolne: roll.br_rolne || roll.broj_rolne || roll.qr_code || roll.qr || String(roll.id || ""),
    qr_code: roll.qr_code || roll.qr || roll.br_rolne || roll.broj_rolne || "",
    vrsta,
    pod_vrsta: roll.pod_vrsta || roll.podvrsta || "",
    oznaka_materijala: roll.oznaka_materijala || roll.oznaka || roll.grade || roll.komercijalnaOznaka || "",
    oznaka: roll.oznaka || roll.oznaka_materijala || roll.grade || roll.komercijalnaOznaka || "",
    debljina: roll.debljina ?? roll.deb ?? roll.thickness ?? normalized.debljina,
    sirina: num(roll.sirina || roll.sirinaMm || roll.width),
    metraza_ost: num(roll.metraza_ost || roll.duzina || roll.metraza || roll.metara),
    rezervisano: num(roll.rezervisano),
    datum_proizvodnje: roll.datum_proizvodnje || roll.production_date || roll.datum || roll.created_at || "",
    status: roll.status || "Na stanju",
    lot: roll.lot || "",
    kg_neto: num(roll.kg_neto || roll.kg || roll.kg_bruto),
  };
}

export function suggestRollsForLayer(rolls = [], layer = {}, options = {}) {
  const req = normalizeMaterialLayer(layer);
  const reqWidth = num(req.idealna_sirina);
  const reqMeters = num(req.metraza || options.metraza || 0);
  const candidates = rolls
    .map(normalizeRollForSuggestion)
    .filter((r) => {
      const status = norm(r.status);
      const available = !status || status.includes("stanju") || status.includes("dost") || status.includes("rezervis");
      const free = r.metraza_ost - r.rezervisano;
      return available
        && (!req.vrsta || norm(r.vrsta) === norm(req.vrsta))
        && (!req.pod_vrsta || !r.pod_vrsta || norm(r.pod_vrsta) === norm(req.pod_vrsta))
        && (!req.oznaka_materijala || norm(r.oznaka_materijala || r.oznaka) === norm(req.oznaka_materijala))
        && (!req.debljina || num(r.debljina) === num(req.debljina))
        && (!reqWidth || r.sirina >= reqWidth)
        && (!reqMeters || free >= reqMeters);
    })
    .map((r) => {
      const free = r.metraza_ost - r.rezervisano;
      const otpad_mm = reqWidth ? Math.max(0, r.sirina - reqWidth) : 0;
      const ageDays = r.datum_proizvodnje && Number.isFinite(dateValue(r.datum_proizvodnje))
        ? Math.floor((Date.now() - dateValue(r.datum_proizvodnje)) / 86400000)
        : null;
      return {
        ...r,
        slobodno_m: free,
        otpad_mm,
        starost_dana: ageDays,
        fifo_prioritet: ageDays == null ? "NEPOZNATO" : ageDays > 180 ? "HITNO" : ageDays > 90 ? "SREDNJE" : "NORMALNO",
        reason: otpad_mm === 0 ? "Idealna širina / FIFO" : `FIFO + otpad ${otpad_mm} mm`,
      };
    })
    .sort((a, b) => dateValue(a.datum_proizvodnje) - dateValue(b.datum_proizvodnje)
      || a.otpad_mm - b.otpad_mm
      || b.slobodno_m - a.slobodno_m);

  return candidates.map((x, index) => ({ ...x, fifo_rank: index + 1 }));
}

export function suggestRollsForAllLayers(rolls = [], layers = [], options = {}) {
  return (layers || []).map((layer, index) => {
    const normalized = normalizeMaterialLayer({ ...layer, sloj: layer.sloj || index + 1 });
    const candidates = suggestRollsForLayer(rolls, normalized, options);
    return {
      layer: normalized,
      candidates,
      best: candidates[0] || null,
      status: candidates.length ? "pronadjeno" : "nema_rolni",
    };
  });
}

export function suggestRollsForMaterial(rolls, materialRequest) {
  return suggestRollsForLayer(rolls, materialRequest);
}
