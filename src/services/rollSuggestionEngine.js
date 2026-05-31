import { normalizeMaterial, findMatchingRolls, fifoAgeDays, fifoPriority } from "../data/materialMaster.js";

function freeMeters(roll){ return Number(roll.slobodno_m ?? roll.metraza_ost ?? roll.duzina ?? roll.metara ?? 0) - Number(roll.rezervisano || 0); }
function rollWidth(roll){ return Number(roll.sirina || roll.sirinaMm || roll.sirina_mm || 0); }
function reqWidth(req){ return Number(req.idealna_sirina || req.sirina || req.sirinaMm || req.sirina_mm || 0); }

export function suggestRollsForMaterial(rolls, materialRequest) {
  const req = normalizeMaterial(materialRequest);
  const widthNeeded = reqWidth(materialRequest);
  const matches = findMatchingRolls(rolls, { ...req, idealna_sirina: widthNeeded, metraza: materialRequest.metraza || materialRequest.potrebnoM || materialRequest.potrebniM });
  return matches.map((roll, idx) => {
    const width = rollWidth(roll);
    const wasteWidth = width && widthNeeded ? width - widthNeeded : 0;
    const age = fifoAgeDays(roll.datum_proizvodnje || roll.datum || roll.created_at);
    return {
      ...roll,
      fifo_rank: idx + 1,
      fifo_starost_dana: age,
      fifo_prioritet: fifoPriority(roll.datum_proizvodnje || roll.datum || roll.created_at),
      slobodno_m: freeMeters(roll),
      matchKey: `${req.vrsta}|${req.pod_vrsta}|${req.oznaka_materijala}|${req.debljina}|${widthNeeded}`,
      wasteWidth,
      otpad_mm: wasteWidth,
      reason: wasteWidth === 0 ? "FIFO + idealna širina" : "FIFO + najmanji otpad"
    };
  });
}

export function suggestRollsForLayers(rolls, layers = []) {
  return layers.map((layer, index) => ({
    sloj: layer.sloj || index + 1,
    layer: normalizeMaterial(layer),
    suggestions: suggestRollsForMaterial(rolls, layer).slice(0, 10)
  }));
}
