
import { normalizeMaterial, findMatchingRolls } from "../data/materialMaster.js";

export function suggestRollsForMaterial(rolls, materialRequest) {
  const req = normalizeMaterial(materialRequest);
  return findMatchingRolls(rolls, req).map(roll => {
    const width = Number(roll.sirina || roll.sirinaMm || 0);
    const reqWidth = Number(materialRequest.sirina || materialRequest.sirinaMm || 0);
    return {
      ...roll,
      matchKey: `${req.vrsta}|${req.oznaka}|${req.debljina}|${reqWidth}`,
      wasteWidth: width && reqWidth ? width - reqWidth : 0,
      reason: width === reqWidth ? "Ista širina" : "Može za formatiranje"
    };
  });
}
