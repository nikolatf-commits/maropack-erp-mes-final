// MAROPACK full workflow helpers
// Centralizuje normalizaciju rolni, plan rezanja, prihvatanje plana i analitiku.

export function num(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeRoll(raw, index = 0) {
  const id = String(raw?.id || raw?.br_rolne || raw?.broj_rolne || raw?.brojRolne || raw?.oznaka || raw?.code || `R-${index + 1}`);
  const sirina = num(raw?.sirina ?? raw?.sirina_mm ?? raw?.width_mm ?? raw?.width);
  const metara = num(raw?.metara ?? raw?.duzina ?? raw?.stanje_m ?? raw?.ostalo_m ?? raw?.available_m ?? raw?.m);
  const rezervisano = num(raw?.rezervisano ?? raw?.reserved_m ?? raw?.rezervisano_m);
  return {
    ...raw,
    id,
    br_rolne: raw?.br_rolne || raw?.broj_rolne || id,
    materijal: String(raw?.materijal || raw?.naziv_materijala || raw?.naziv || raw?.tip || raw?.vrsta || 'Materijal'),
    tip: String(raw?.tip || raw?.vrsta || raw?.materijal || 'Materijal'),
    oznaka: String(raw?.oznaka_materijala || raw?.oznaka || raw?.materijal || raw?.tip || '—'),
    debljina: num(raw?.debljina ?? raw?.mikroni ?? raw?.mic ?? raw?.um),
    sirina,
    sirina_mm: sirina,
    metara,
    stanje_m: metara,
    kg: num(raw?.kg ?? raw?.neto ?? raw?.tezina),
    lot: String(raw?.lot || raw?.LOT || raw?.batch || '—'),
    lokacija: String(raw?.lokacija || raw?.location || '—'),
    status: String(raw?.status || 'na stanju').toLowerCase(),
    rezervisano,
    available_m: Math.max(0, metara - rezervisano),
    parent_id: raw?.parent_id || null,
    istorija: Array.isArray(raw?.istorija) ? raw.istorija : []
  };
}

export function normalizeRolls(db) {
  const keys = ['rolne', 'magacin_rolni', 'magacinRolni', 'magacin', 'materijali', 'stock', 'warehouse'];
  let source = [];
  if (Array.isArray(db)) source = db;
  else {
    for (const key of keys) {
      if (Array.isArray(db?.[key]) && db[key].length) {
        source = db[key];
        break;
      }
    }
  }
  return source.map(normalizeRoll).filter((r) => r.sirina > 0);
}

export function parseCutNeeds(text) {
  return String(text || '')
    .split(/[\n;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((line, i) => {
      const nums = (line.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => num(x));
      const material = (line.match(/^[A-Za-zČĆŽŠĐčćžšđ0-9/ +._-]+?(?=\s*\d)/) || [''])[0].trim();
      if (!nums[0]) return null;
      return {
        id: `Z${i + 1}`,
        uid: `Z${i + 1}`,
        materijal: material,
        sirina: nums[0],
        metara: nums[1] || 0,
        qty: Math.max(1, Math.round(nums[2] || 1)),
        raw: line
      };
    })
    .filter(Boolean);
}

export function expandNeeds(needs) {
  const out = [];
  needs.forEach((need) => {
    for (let i = 0; i < Math.max(1, need.qty || 1); i += 1) {
      out.push({ ...need, uid: `${need.id}-${i + 1}` });
    }
  });
  return out;
}

export function scoreRollForNeed(roll, need, opts = {}) {
  const strictMaterial = opts.strictMaterial !== false;
  const materialNeed = String(need.materijal || '').trim().toLowerCase();
  const materialMatch = !materialNeed || `${roll.materijal} ${roll.tip} ${roll.oznaka}`.toLowerCase().includes(materialNeed);
  if (strictMaterial && !materialMatch) return -Infinity;
  if (roll.sirina < need.sirina) return -Infinity;
  if (need.metara && roll.available_m < need.metara) return -Infinity;
  if (roll.status.includes('blok') || roll.status.includes('otpis')) return -Infinity;

  const waste = roll.sirina - need.sirina;
  const util = need.sirina / roll.sirina;
  const exactBonus = waste === 0 ? 100000 : 0;
  const materialBonus = materialMatch ? 4000 : -1000;
  const lengthFitBonus = need.metara ? Math.min(roll.available_m / need.metara, 4) * 180 : 0;
  const reservedPenalty = roll.status.includes('rez') ? 2500 : 0;
  return exactBonus + materialBonus + util * 10000 - waste * 18 + lengthFitBonus - reservedPenalty;
}

export function makeCutPlan(rollsInput, needsInput, opts = {}) {
  const minUsefulWaste = num(opts.minUsefulWaste, 80);
  const rolls = rollsInput.map((r, i) => normalizeRoll(r, i));
  const expanded = expandNeeds(needsInput).sort((a, b) => b.sirina - a.sirina || b.metara - a.metara);
  const working = rolls.map((r) => ({ ...r }));
  const plans = [];
  const warnings = [];

  expanded.forEach((need) => {
    let best = null;
    working.forEach((roll) => {
      const score = scoreRollForNeed(roll, need, opts);
      if (score === -Infinity) return;
      if (!best || score > best.score) best = { roll, score };
    });

    if (!best) {
      plans.push({ need, roll: null, status: 'missing', warning: `Nema rolne za ${need.raw || `${need.sirina}mm`}` });
      warnings.push(`Nema odgovarajuće rolne za: ${need.raw || `${need.sirina} mm`}`);
      return;
    }

    const roll = best.roll;
    const consume = need.metara || 0;
    if (consume) roll.available_m = Math.max(0, roll.available_m - consume);
    const waste = roll.sirina - need.sirina;
    const util = (need.sirina / roll.sirina) * 100;
    const leftoverMeters = consume ? roll.available_m : roll.metara;
    const createLeftoverQr = waste >= minUsefulWaste && leftoverMeters > 0;
    plans.push({
      need,
      roll: { ...roll },
      consume,
      waste,
      util,
      leftoverWidth: waste,
      leftoverMeters,
      createLeftoverQr,
      status: 'ok'
    });
  });

  const okPlans = plans.filter((p) => p.roll);
  const usedMm = okPlans.reduce((s, p) => s + p.need.sirina, 0);
  const totalMm = okPlans.reduce((s, p) => s + p.roll.sirina, 0);
  const wasteMm = okPlans.reduce((s, p) => s + p.waste, 0);
  const meters = okPlans.reduce((s, p) => s + num(p.consume || p.need.metara), 0);
  const byRoll = okPlans.reduce((acc, p) => {
    const key = p.roll.id;
    acc[key] = acc[key] || { roll: p.roll, plans: [], totalConsume: 0, totalWaste: 0 };
    acc[key].plans.push(p);
    acc[key].totalConsume += num(p.consume || p.need.metara);
    acc[key].totalWaste += p.waste;
    return acc;
  }, {});

  return {
    plans,
    warnings,
    byRoll,
    summary: {
      count: plans.length,
      ok: okPlans.length,
      missing: plans.length - okPlans.length,
      util: totalMm ? (usedMm / totalMm) * 100 : 0,
      usedMm,
      totalMm,
      wasteMm,
      meters,
      leftoverQr: okPlans.filter((p) => p.createLeftoverQr).length
    }
  };
}

export function applyCutPlanToDb(db, cutPlan, meta = {}) {
  const rolne = normalizeRolls(db);
  const plans = cutPlan?.plans || [];
  const timestamp = nowIso();
  const planId = meta.planId || `PLAN-${Date.now()}`;

  const consumptionByRoll = plans.filter((p) => p.roll).reduce((acc, p) => {
    const id = p.roll.id;
    acc[id] = acc[id] || { consume: 0, plans: [] };
    acc[id].consume += num(p.consume || p.need?.metara);
    acc[id].plans.push(p);
    return acc;
  }, {});

  const newRolls = rolne.map((r) => {
    const hit = consumptionByRoll[r.id];
    if (!hit) return r;
    const consumed = hit.consume;
    const novoStanje = Math.max(0, r.metara - consumed);
    return {
      ...r,
      metara: novoStanje,
      stanje_m: novoStanje,
      available_m: Math.max(0, novoStanje - num(r.rezervisano)),
      status: novoStanje <= 0 ? 'potrošeno' : 'delimično',
      istorija: [
        ...(r.istorija || []),
        { tip: 'rezanje', planId, datum: timestamp, metara: consumed, napomena: meta.napomena || 'Prihvaćen plan rezanja' }
      ]
    };
  });

  const leftoverRolls = plans
    .filter((p) => p.roll && (p.createLeftoverQr || p.newQr))
    .map((p, i) => ({
      id: `${p.roll.id}-OST-${Date.now()}-${i + 1}`,
      br_rolne: `${p.roll.id}-OST-${i + 1}`,
      parent_id: p.roll.id,
      materijal: p.roll.materijal,
      tip: p.roll.tip,
      oznaka: p.roll.oznaka,
      debljina: p.roll.debljina,
      sirina: p.leftoverWidth,
      sirina_mm: p.leftoverWidth,
      metara: p.leftoverMeters,
      stanje_m: p.leftoverMeters,
      kg: 0,
      lot: p.roll.lot,
      lokacija: p.roll.lokacija,
      status: 'ostatak posle rezanja',
      created_at: timestamp,
      planId,
      istorija: [{ tip: 'nastanak_ostatka', planId, datum: timestamp, parent_id: p.roll.id }]
    }));

  const zapis = {
    id: planId,
    datum: timestamp,
    status: 'prihvaćen',
    naziv: meta.naziv || 'Plan rezanja iz magacina',
    nalog_id: meta.nalog_id || null,
    summary: cutPlan.summary,
    plans
  };

  return {
    ...db,
    rolne: [...newRolls, ...leftoverRolls],
    planovi_rezanja: [zapis, ...(db?.planovi_rezanja || [])],
    analiza_potrosnje: [
      {
        id: `POT-${Date.now()}`,
        datum: timestamp,
        planId,
        ukupno_metara: cutPlan.summary?.meters || 0,
        otpad_mm: cutPlan.summary?.wasteMm || 0,
        iskoriscenost: cutPlan.summary?.util || 0,
        stavke: plans.filter((p) => p.roll)
      },
      ...(db?.analiza_potrosnje || [])
    ]
  };
}

export function saveLocalDb(db) {
  try {
    window.localStorage.setItem('maropack_db', JSON.stringify(db || {}));
  } catch (e) {
    console.warn('Ne mogu da sačuvam lokalni DB:', e);
  }
}
