import { supabase } from "./supabase.js";

export function safeNumber(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatNumber(value, suffix = "") {
  return `${Math.round(safeNumber(value)).toLocaleString("sr-RS")}${suffix}`;
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("š", "s")
    .replaceAll("č", "c")
    .replaceAll("ć", "c")
    .replaceAll("ž", "z")
    .replaceAll("đ", "dj")
    .trim();
}

export function normalizeStatus(status) {
  return normalizeText(status);
}

export function getDateValue(row) {
  return row?.created_at || row?.datum_kreiranja || row?.datum || row?.date || null;
}

export function isFinishedStatus(status) {
  const s = normalizeStatus(status);
  return ["zavrseno", "zavrsen", "gotovo", "uradjeno", "zavrsena"].includes(s);
}

export function isCancelledStatus(status) {
  const s = normalizeStatus(status);
  return ["otkazano", "stornirano", "storno"].includes(s);
}

export function isPausedStatus(status) {
  const s = normalizeStatus(status);
  return ["pauza", "stop", "stopirano", "ceka", "ceka materijal", "cekamaterijal"].includes(s);
}

export function isActiveStatus(status) {
  return !isFinishedStatus(status) && !isCancelledStatus(status);
}

export function rangeToDays(range) {
  if (range === "today" || range === "danas") return 1;
  if (range === "week" || range === "nedelja") return 7;
  if (range === "month" || range === "mesec") return 30;
  const parsed = parseInt(range, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

export function dateDaysAgo(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (rangeToDays(days) - 1));
  return d;
}

export async function loadDashboardData(timeRange = 30) {
  const days = rangeToDays(timeRange);
  const cutoffDate = dateDaysAgo(days);

  const [naloziRes, rolneRes, aktivnostiRes] = await Promise.all([
    supabase
      .from("nalozi")
      .select("*")
      .gte("created_at", cutoffDate.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("magacin")
      .select("*"),
    supabase
      .from("nalog_aktivnosti")
      .select("*")
      .gte("created_at", cutoffDate.toISOString())
      .order("created_at", { ascending: false })
  ]);

  if (naloziRes.error) throw naloziRes.error;
  if (rolneRes.error) throw rolneRes.error;
  if (aktivnostiRes.error) throw aktivnostiRes.error;

  return {
    nalozi: naloziRes.data || [],
    rolne: rolneRes.data || [],
    aktivnosti: aktivnostiRes.data || [],
    proizvodi: []
  };
}

export function getWorkerName(a) {
  return a?.radnik_ime || a?.radnik || a?.operator || a?.worker || a?.user_name || "Nepoznato";
}

export function getOrderNumber(n) {
  return n?.ponbr || n?.ponBr || n?.broj_naloga || n?.broj || n?.id || "N/A";
}

export function getProductName(n) {
  return n?.prod || n?.proizvod || n?.naziv || n?.naziv_proizvoda || "Ostalo";
}

export function calculateDashboardKPIs(data = {}) {
  const nalozi = data.nalozi || [];
  const rolne = data.rolne || [];
  const aktivnosti = data.aktivnosti || [];

  const ukupnoNaloga = nalozi.length;
  const zavrseniNalozi = nalozi.filter(n => isFinishedStatus(n.status)).length;
  const aktivniNalozi = nalozi.filter(n => isActiveStatus(n.status)).length;
  const kasniNalozi = nalozi.filter(n => {
    if (!isActiveStatus(n.status)) return false;
    const d = getDateValue(n);
    if (!d) return false;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return false;
    return (Date.now() - dt.getTime()) / 86400000 > 7;
  }).length;

  const ukupnaKolicina = nalozi.reduce((s, n) => s + safeNumber(n.kol || n.kolicina), 0);
  const proizvedenoIzNaloga = nalozi.reduce((s, n) => s + safeNumber(n.uradjeno || n.proizvedeno), 0);
  const proizvedenoIzAktivnosti = aktivnosti.reduce((s, a) => s + safeNumber(a.kolicina || a.uradjeno || a.proizvedeno), 0);
  const proizvedeno = proizvedenoIzNaloga || proizvedenoIzAktivnosti;

  const ukupnaVrednost = nalozi.reduce((s, n) => {
    const cena = safeNumber(n.cena || n.cena_ukupno || n.ukupno || n.vrednost);
    const kol = safeNumber(n.kol || n.kolicina);
    if (safeNumber(n.ukupno) > 0) return s + safeNumber(n.ukupno);
    return s + cena * kol;
  }, 0);

  const ukupnoRolni = rolne.length;
  const rolneNaStanju = rolne.filter(r => {
    const s = normalizeStatus(r.status);
    return s === "na stanju" || s === "stanje" || s === "aktivno" || s === "available" || !s;
  }).length;
  const ukupnoMetara = rolne.reduce((s, r) => s + safeNumber(r.metraza_ost || r.metraza || r.duzina), 0);
  const ukupnoKg = rolne.reduce((s, r) => s + safeNumber(r.kg_neto || r.kg || r.tezina), 0);

  const ukupnoAktivnosti = aktivnosti.length;
  const aktivniRadnici = new Set(aktivnosti.map(getWorkerName).filter(n => n && n !== "Nepoznato")).size;

  const ukupnoZastoja = aktivnosti.filter(a => {
    const s = normalizeStatus(a.status || a.tip || a.vrsta);
    return s.includes("zastoj") || s.includes("kvar") || s.includes("pauza");
  }).length;

  const stopaIzvrsenja = ukupnaKolicina > 0 ? ((proizvedeno / ukupnaKolicina) * 100).toFixed(1) : 0;
  const iskoriscenjeMagacina = ukupnoRolni > 0 ? ((rolneNaStanju / ukupnoRolni) * 100).toFixed(1) : 0;
  const prosecnaVrednost = ukupnoNaloga > 0 ? (ukupnaVrednost / ukupnoNaloga).toFixed(0) : 0;

  return {
    ukupnoNaloga,
    aktivniNalozi,
    zavrseniNalozi,
    kasniNalozi,
    ukupnaKolicina,
    proizvedeno,
    ukupnaVrednost,
    ukupnoRolni,
    rolneNaStanju,
    ukupnoMetara,
    ukupnoKg,
    ukupnoAktivnosti,
    aktivniRadnici,
    ukupnoZastoja,
    stopaIzvrsenja,
    stopaPogresne: stopaIzvrsenja,
    iskoriscenjeMagacina,
    prosecnaVrednost
  };
}

export function buildWorkersFromActivities(aktivnosti = []) {
  const map = new Map();

  aktivnosti.forEach(a => {
    const ime = getWorkerName(a);
    if (!ime || ime === "Nepoznato") return;

    if (!map.has(ime)) {
      map.set(ime, {
        ime,
        pozicija: a.operacija || a.pozicija || a.masina || "Operater",
        masina: a.masina || "—",
        zavrseno: 0,
        zastoji: 0,
        aktivnosti: 0,
        kolicina: 0,
        radMin: 0,
        poslednjaAktivnost: getDateValue(a),
        status: "Aktivan"
      });
    }

    const w = map.get(ime);
    w.aktivnosti += 1;
    w.kolicina += safeNumber(a.kolicina || a.uradjeno || a.proizvedeno);
    w.radMin += safeNumber(a.trajanje_min || a.trajanje || a.minuta || a.vreme_min);

    const s = normalizeStatus(a.status || a.tip || a.vrsta);
    if (isFinishedStatus(a.status) || s.includes("zavrs")) w.zavrseno += 1;
    if (s.includes("zastoj") || s.includes("kvar") || s.includes("pauza")) w.zastoji += 1;

    const d = getDateValue(a);
    if (d && (!w.poslednjaAktivnost || new Date(d) > new Date(w.poslednjaAktivnost))) {
      w.poslednjaAktivnost = d;
      w.pozicija = a.operacija || a.pozicija || w.pozicija;
      w.masina = a.masina || w.masina;
    }
  });

  return Array.from(map.values()).map(w => ({
    ...w,
    efikasnost: w.aktivnosti > 0 ? Math.min(100, Math.round((w.zavrseno / w.aktivnosti) * 100)) : 0
  })).sort((a, b) => b.aktivnosti - a.aktivnosti || b.kolicina - a.kolicina);
}

export function prepareNaloziPoDanima(nalozi = [], days = 30) {
  const result = [];
  const dCount = rangeToDays(days);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = dCount - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("sr-RS", { day: "numeric", month: "short" });
    const count = nalozi.filter(n => {
      const val = getDateValue(n);
      if (!val) return false;
      const nd = new Date(val);
      return !Number.isNaN(nd.getTime()) && nd.toDateString() === d.toDateString();
    }).length;
    result.push({ datum: label, nalozi: count });
  }
  return result;
}

export function prepareProizvodnjaPoDanima(aktivnosti = []) {
  const map = new Map();
  aktivnosti.forEach(a => {
    const val = getDateValue(a);
    if (!val) return;
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return;
    const label = d.toLocaleDateString("sr-RS", { day: "numeric", month: "short" });
    map.set(label, (map.get(label) || 0) + safeNumber(a.kolicina || a.uradjeno || a.proizvedeno));
  });
  return Array.from(map.entries()).map(([datum, proizvedeno]) => ({ datum, proizvedeno: Math.round(proizvedeno) }));
}

export function prepareTopProizvodi(nalozi = []) {
  const map = new Map();
  nalozi.forEach(n => {
    const name = getProductName(n);
    map.set(name, (map.get(name) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([name, count]) => ({ name: String(name).slice(0, 35), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export function prepareMagacinPoTipu(rolne = []) {
  const map = new Map();
  rolne.forEach(r => {
    const tip = r.tip || r.materijal || "Ostalo";
    if (!map.has(tip)) map.set(tip, { tip, kg: 0, metara: 0 });
    const item = map.get(tip);
    item.kg += safeNumber(r.kg_neto || r.kg || r.tezina);
    item.metara += safeNumber(r.metraza_ost || r.metraza || r.duzina);
  });
  return Array.from(map.values()).map(x => ({ ...x, kg: Math.round(x.kg), metara: Math.round(x.metara) })).sort((a,b)=>b.kg-a.kg).slice(0,8);
}
