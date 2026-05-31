/**
 * MAROPACK — Profesionalni algoritam za izbor rolni iz magacina
 *
 * Prioriteti (redom):
 *   1. Tip materijala mora odgovarati (BOPP, CPP, PET, ALU...)
 *   2. Debljina ±3µ tolerancija
 *   3. Rolna mora biti dostupna (status OK)
 *   4. Metraža mora biti dovoljna za narudžbu (+5%)
 *   5. Širina mora biti >= idealna (od šire možeš srezati, od uže ne)
 *   6. Unutar prikladnih: score sistem — efikasnost, otpad, starost
 *   7. Zaštita od duplikata — ista rolna ne može biti za 2 sloja
 */

const STATUS_OK = [
  "Na stanju", "Dostupna", "dostupna",
  "aktivna", "Aktivna", "na stanju"
];

const MAT_GUSTOCA = {
  BOPP: 0.905, OPP: 0.905, CPP: 0.905,
  PET: 1.38, PA: 1.14, LDPE: 0.92,
  ALU: 2.71, FXC: 0.92, FXPU: 0.92, FXCB: 0.92,
};

function num(v) {
  return Number(String(v || "").replace(",", ".").replace(/\s/g, "")) || 0;
}

function getBase(tip) {
  return String(tip || "").split(" ")[0].toUpperCase().trim();
}
function normText(v) { return String(v || "").trim().toLowerCase(); }
function cleanCode(v, vrsta = "") {
  let x = String(v || "").trim();
  const t = String(vrsta || "").trim();
  if (t && x.toLowerCase().startsWith(t.toLowerCase() + " ")) x = x.slice(t.length).trim();
  return x;
}
function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const raw = String(v).trim();
  const sr = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (sr) return new Date(Number(sr[3]), Number(sr[2]) - 1, Number(sr[1]));
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
function starostDana(v) {
  const d = parseDate(v);
  if (!d) return -1;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}
function getRollVrsta(r) { return r.vrsta || r.tip || r.materijal || ""; }
function getRollPodVrsta(r) { return r.pod_vrsta || r.podvrsta || ""; }
function getRollOznaka(r) { return cleanCode(r.oznaka_materijala || r.oznaka || r.komercijalnaOznaka || r.materijal || "", getRollVrsta(r)); }
function getLayerVrsta(l) { return l.vrsta || l.tip || l.material || l.materijal || ""; }
function getLayerPodVrsta(l) { return l.pod_vrsta || l.podvrsta || ""; }
function getLayerOznaka(l) { return cleanCode(l.oznaka_materijala || l.oznaka || l.grade || l.komercijalnaOznaka || "", getLayerVrsta(l)); }

function getGustoca(tip) {
  const base = getBase(tip);
  return MAT_GUSTOCA[base] || 0.91;
}

/**
 * Izračunaj kg za rolnu na osnovu dimenzija
 */
function kalkulisiKg(deb, sirina, metraza) {
  const d = num(deb), s = num(sirina) / 1000, m = num(metraza);
  if (!d || !s || !m) return 0;
  return +(d * s * m / 1000).toFixed(2);
}

/**
 * Izračunaj otpad od širine
 * Ako je rolna 860mm a idealna 840mm → otpad 20mm (10mm levo + 10mm desno)
 * Ako je rolna 820mm a idealna 840mm → rolna premala, koristiti samo ako nema boljeg
 */
function analizaSirine(stvarna, idealna) {
  const s = num(stvarna), i = num(idealna);
  if (!s || !i) return { dovoljna: false, visak: 0, otpad: 0, efikasnost: 0 };
  const visak = s - i;
  const dovoljna = s >= i;
  const otpadL = dovoljna ? Math.floor(visak / 2) : 0;
  const otpadD = dovoljna ? visak - otpadL : 0;
  const efikasnost = dovoljna ? Math.min(100, (i / s) * 100) : (s / i) * 100;
  return { dovoljna, visak, otpad: visak, otpadL, otpadD, efikasnost: +efikasnost.toFixed(1) };
}

/**
 * Score rolne — viši score = bolji izbor
 *
 * Faktori:
 *  +1000  rolna ima dovoljno metraže
 *  +500   rolna je dovoljno široka (>=idealna)
 *  +0..200 efikasnost širine (manje otpada = bolji)
 *  +0..100 "svežina" rolne — ne preporučujemo da uzimamo delimičnu rolnu
 *           ako postoji puna (delimična ima manji score)
 *  -otpad * 2  penalizacija za svaki mm otpada
 *  +0..50  bonus za rolnu koja je najbliža idealnoj (ne prevelika)
 */
function scoreRolne(rolna, idealnaSirina, kolPlus) {
  const sir = analizaSirine(rolna.sirina, idealnaSirina);
  const metraza = num(rolna.metraza_ost || rolna.metraza);
  const imaMetraze = metraza >= kolPlus;
  const isDelimicna = rolna.status === "Delimično";
  const isPuna = !isDelimicna;

  let score = 0;

  // 1. Metraža — najbitniji faktor
  if (imaMetraze) {
    score += 1000;
    // Bonus ako ima znatno više (sigurnosna margina)
    const visak = metraza - kolPlus;
    if (visak > kolPlus * 0.2) score += 30; // 20% više nego dovoljno
  } else {
    // Nema dovoljno metraže — kazniti ali ne eliminisati (možda jedino što ima)
    const pokrivenost = metraza / kolPlus;
    score += Math.round(pokrivenost * 200); // max 200 ako pokriva 100%
  }

  // 2. Širina — druga po važnosti
  if (sir.dovoljna) {
    score += 500;
    // Bonus za minimalnu razliku (manje otpada je bolje)
    score += Math.max(0, 200 - sir.otpad); // 0 otpada = +200, 200mm otpada = 0
    // Penalizuj pretešku rolnu (previše otpada)
    score -= sir.otpad * 2;
  } else {
    // Rolna uža od idealnog — ozbiljna penalizacija
    const nedostaje = idealnaSirina - rolna.sirina;
    score -= nedostaje * 5;
  }

  // 3. Preferira punu rolnu nad delimičnom
  if (isPuna) score += 100;

  // 4. FIFO — datum proizvodnje je primarni signal. Starija rolna dobija značajan bonus.
  const age = starostDana(rolna.datum_proizvodnje || rolna.datum || rolna.datum_prijema);
  if (age >= 0) score += Math.min(500, age * 2);

  return score;
}

/**
 * GLAVNI ALGORITAM — izaberi najbolju rolnu za jedan sloj
 *
 * @param {Object} layer - sloj iz template-a { material, debljina, gm2 }
 * @param {Array}  rolne - sve rolne iz magacina
 * @param {number} idealnaSirina - mm
 * @param {number} kolPlus - metraža za rad (poručena * 1.05)
 * @param {Set}    zauzete - Set(id) rolni već izabranih za druge slojeve
 * @returns {{ predlog, kandidati, analiza }}
 */
export function izaberiRolnu(layer, rolne, idealnaSirina, kolPlus, zauzete = new Set()) {
  const layerVrsta = getLayerVrsta(layer);
  const layerPodVrsta = getLayerPodVrsta(layer);
  const layerOznaka = getLayerOznaka(layer);
  const base = getBase(layerVrsta);
  const deb = num(layer.debljina || layer.deb || layer.debljina_um || 0);

  if (!base) return { predlog: null, kandidati: [], analiza: null };

  // ── KORAK 1: Filtriranje — samo prikladne rolne ──────────
  const prikladne = rolne.filter(r => {
    // Vrsta mora odgovarati (BOPP, CPP, PET...)
    const rollVrsta = getRollVrsta(r);
    const okTip = rollVrsta && getBase(rollVrsta) === base;
    if (!okTip) return false;

    // Pod vrsta, ako je upisana, mora odgovarati
    if (layerPodVrsta && normText(getRollPodVrsta(r)) !== normText(layerPodVrsta)) return false;

    // Oznaka materijala, ako je upisana, mora odgovarati tačno
    if (layerOznaka && normText(getRollOznaka(r)) !== normText(layerOznaka)) return false;

    // Debljina ±1µ (ako je zadana)
    const rollDeb = num(r.deb ?? r.debljina);
    if (deb > 0 && rollDeb > 0) {
      if (Math.abs(rollDeb - deb) > 1) return false;
    }

    // Status mora biti OK
    if (!STATUS_OK.includes(r.status)) return false;

    // Nije već rezervisana za drugi sloj u ovom nalogu
    if (zauzete.has(r.id || r.br_rolne)) return false;

    return true;
  });

  // ── KORAK 2: Scoring i sortiranje ───────────────────────
  const scoreovane = prikladne.map(r => ({
    rolna: r,
    score: scoreRolne(r, idealnaSirina, kolPlus),
    analiza: analizaSirine(r.sirina, idealnaSirina),
    metraza: num(r.metraza_ost || r.metraza),
    imaMetraze: num(r.metraza_ost || r.metraza) >= kolPlus,
  })).sort((a, b) => {
    const ageB = starostDana(b.rolna.datum_proizvodnje || b.rolna.datum || b.rolna.datum_prijema);
    const ageA = starostDana(a.rolna.datum_proizvodnje || a.rolna.datum || a.rolna.datum_prijema);
    if (ageB !== ageA) return ageB - ageA;
    if (a.analiza.otpad !== b.analiza.otpad) return a.analiza.otpad - b.analiza.otpad;
    return b.score - a.score;
  });

  const predlog = scoreovane[0] || null;

  // ── KORAK 3: Grupisanje za UI prikaz ───────────────────
  // Idealne: dovoljno široke I dovoljno metraže
  const idealne = scoreovane.filter(x => x.analiza.dovoljna && x.imaMetraze);
  // Alternativne: dovoljno metraže ali uska
  const uzke = scoreovane.filter(x => !x.analiza.dovoljna && x.imaMetraze);
  // Kritične: ima širinu ali nema metraže
    const nemaMetraze = scoreovane.filter(x => x.analiza.dovoljna && !x.imaMetraze);
  // Nedostajuće: ni širine ni metraže
  const neodgovarajuce = scoreovane.filter(x => !x.analiza.dovoljna && !x.imaMetraze);

  return {
    predlog: predlog?.rolna || null,
    predlogScore: predlog?.score || 0,
    predlogAnaliza: predlog?.analiza || null,
    predlogImaMetraze: predlog?.imaMetraze || false,
    kandidati: scoreovane,      // svi sortirani — za dropdown
    idealne,                    // za UI highlight
    uzke,                       // upozorenje — uska rolna
    nemaMetraze,                // upozorenje — nema dost metraže
    neodgovarajuce,             // najgore — ništa ne odgovara
    ukupnoPrikladnih: prikladne.length,
    imaDovoljnih: idealne.length > 0,
  };
}

/**
 * AUTO-IZBOR ZA SVE SLOJEVE — sa zaštitom od duplikata
 *
 * Pamti koje rolne su već izabrane i ne dozvoljava istu rolnu za 2 sloja.
 * Sortira slojeve po težini (najteže za nađi = prvo) da bi se resursi
 * optimalno rasporedili.
 *
 * @param {Array}  layers - svi slojevi iz template-a
 * @param {Array}  rolne - sve rolne iz magacina
 * @param {number} idealnaSirina - mm
 * @param {number} kolPlus - metraža za rad
 * @returns {Object} { izbori: { [layerIdx]: rolna }, analize, upozorenja }
 */
export function autoIzborSvihSlojeva(layers, rolne, idealnaSirina, kolPlus) {
  const zauzete = new Set();
  const izbori = {};
  const analize = {};
  const upozorenja = [];

  // Sortiraj slojeve — najpre oni čiji materijal ima manje kandidata (teže za nađi)
  // To osigurava da rijetki materijali dobiju prioritet pri izboru
  const prioriteti = layers.map((layer, i) => {
    const base = getBase(getLayerVrsta(layer));
    const pod = getLayerPodVrsta(layer);
    const ozn = getLayerOznaka(layer);
    const deb = num(layer.debljina || layer.deb || 0);
    const brKandidata = rolne.filter(r => {
      const okT = getRollVrsta(r) && getBase(getRollVrsta(r)) === base;
      const okP = !pod || normText(getRollPodVrsta(r)) === normText(pod);
      const okO = !ozn || normText(getRollOznaka(r)) === normText(ozn);
      const rDeb = num(r.deb ?? r.debljina);
      const okD = !deb || !rDeb || Math.abs(rDeb - deb) <= 1;
      return okT && okP && okO && okD && STATUS_OK.includes(r.status);
    }).length;
    return { idx: i, layer, brKandidata };
  }).sort((a, b) => a.brKandidata - b.brKandidata); // manje kandidata = viši prioritet

  // Izaberi rolnu za svaki sloj redom (od najtežeg)
  for (const { idx, layer } of prioriteti) {
    const rezultat = izaberiRolnu(layer, rolne, idealnaSirina, kolPlus, zauzete);
    izbori[idx] = rezultat.predlog;
    analize[idx] = rezultat;

    // Dodaj izabranu u zauzete
    if (rezultat.predlog) {
      zauzete.add(rezultat.predlog.id || rezultat.predlog.br_rolne);
    }

    // Generiši upozorenja
    if (!rezultat.predlog) {
      upozorenja.push({
        sloj: idx + 1,
        tip: "nema_rolne",
        poruka: `Sloj ${idx+1} (${getBase(getLayerVrsta(layer))}) — nema nijedne prikladne rolne u magacinu!`,
        ozbiljnost: "kritično",
      });
    } else if (!rezultat.predlogImaMetraze) {
      const ima = num(rezultat.predlog.metraza_ost || rezultat.predlog.metraza);
      upozorenja.push({
        sloj: idx + 1,
        tip: "nema_metraze",
        poruka: `Sloj ${idx+1} — rolna ${rezultat.predlog.br_rolne} ima ${ima.toLocaleString("sr-RS")}m, potrebno ${kolPlus.toLocaleString("sr-RS")}m!`,
        ozbiljnost: "upozorenje",
      });
    } else if (!rezultat.predlogAnaliza?.dovoljna) {
      upozorenja.push({
        sloj: idx + 1,
        tip: "uska_rolna",
        poruka: `Sloj ${idx+1} — rolna ${rezultat.predlog.br_rolne} je ${rezultat.predlog.sirina}mm, idealna širina je ${idealnaSirina}mm!`,
        ozbiljnost: "upozorenje",
      });
    }
  }

  // Statistika
  const ukupno = layers.length;
  const idealni = Object.values(izbori).filter(Boolean).filter((r, i) =>
    analize[Object.keys(izbori)[i]]?.predlogImaMetraze &&
    analize[Object.keys(izbori)[i]]?.predlogAnaliza?.dovoljna
  ).length;

  return {
    izbori,           // { layerIdx: rolna_obj ili null }
    analize,          // { layerIdx: pun rezultat iz izaberiRolnu }
    upozorenja,       // lista svih upozorenja
    statistika: {
      ukupnoSlojeva: ukupno,
      potpunoPokriveno: Object.values(izbori).filter(Boolean).length,
      idealniIzbori: idealni,
      imaKritičnih: upozorenja.some(u => u.ozbiljnost === "kritično"),
    },
  };
}

/**
 * LABELA ZA ROLNU — kratak opis za dropdown
 */
export function labelaRolne(rolna, idealnaSirina, kolPlus) {
  if (!rolna) return "—";
  const ana = analizaSirine(rolna.sirina, idealnaSirina);
  const ima = num(rolna.metraza_ost || rolna.metraza);
  const doMetraze = ima >= (kolPlus || 0);

  const parts = [
    rolna.br_rolne,
    `${rolna.sirina}mm`,
    `${ima.toLocaleString("sr-RS")}m`,
    rolna.kg_neto ? `${Math.round(rolna.kg_neto)}kg` : null,
    rolna.dobavljac || null,
    rolna.lot ? `LOT:${rolna.lot}` : null,
    (rolna.datum_proizvodnje || rolna.datum) ? `FIFO:${starostDana(rolna.datum_proizvodnje || rolna.datum)}d` : null,
    !doMetraze ? "⚠️ NEMA METRAŽE" : null,
    !ana.dovoljna ? `⚠️ USKA(${rolna.sirina}mm<${idealnaSirina}mm)` : null,
    ana.dovoljna && ana.otpad > 0 ? `otpad:${ana.otpad}mm` : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

export { analizaSirine, scoreRolne, getBase, num };
