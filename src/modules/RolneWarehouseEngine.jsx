import React, { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../supabase.js";
import {
  getVrsteMaterijala,
  getOznakeZaVrstu,
  getDebljineZaMaterijal,
  getKoeficijent as mmKoeficijent,
  calculateGm2 as mmCalculateGm2,
  buildMaterialName as mmBuildMaterialName
} from "../data/materialMaster.js";

const LS_MATERIJALI = "maropack_baza_materijala_v30";
const LS_ROLNE = "maropack_rolne_magacin";
const LS_HISTORY = "maropack_rolne_istorija";
const LS_PENDING_RESERVATION = "maropack_pending_roll_reservation";

const DEFAULT_MATERIALS = [
  { id: "MAT-BOPP-20", vrsta: "BOPP", komercijalnaOznaka: "BOPP transparent 20µ", proizvodjac: "Generički", debljina: 20, koeficijent: 0.91, gsm: 18.2, jedinica: "µ", cenaKg: 3.1, napomena: "Standardni BOPP film" },
  { id: "MAT-BOPP-MAT-20", vrsta: "BOPP", komercijalnaOznaka: "BOPP MAT 20µ", proizvodjac: "Generički", debljina: 20, koeficijent: 0.91, gsm: 18.2, jedinica: "µ", cenaKg: 3.25, napomena: "Mat BOPP" },
  { id: "MAT-CPP-35", vrsta: "CPP", komercijalnaOznaka: "CPP transparent 35µ", proizvodjac: "Generički", debljina: 35, koeficijent: 0.91, gsm: 31.85, jedinica: "µ", cenaKg: 2.2, napomena: "CPP za kaširanje" },
  { id: "MAT-PET-12", vrsta: "PET", komercijalnaOznaka: "PET 12µ", proizvodjac: "Generički", debljina: 12, koeficijent: 1.4, gsm: 16.8, jedinica: "µ", cenaKg: 3.5, napomena: "PET film" },
  { id: "MAT-ALU-7", vrsta: "ALU", komercijalnaOznaka: "Aluminijum 7µ", proizvodjac: "Generički", debljina: 7, koeficijent: 2.71, gsm: 18.97, jedinica: "µ", cenaKg: 7.5, napomena: "Alu folija" },
  { id: "MAT-PE-50", vrsta: "LDPE", komercijalnaOznaka: "LDPE 50µ", proizvodjac: "Generički", debljina: 50, koeficijent: 0.925, gsm: 46.25, jedinica: "µ", cenaKg: 1.8, napomena: "PE film" },
  { id: "MAT-PAPIR-60", vrsta: "PAPIR", komercijalnaOznaka: "Papir 60 g/m²", proizvodjac: "Rossella", debljina: 0, koeficijent: 0, gsm: 60, jedinica: "g/m²", cenaKg: 1.4, napomena: "Papir, ručni unos gsm" },
  { id: "MAT-PAPIR-55", vrsta: "PAPIR", komercijalnaOznaka: "Papir 55 g/m²", proizvodjac: "Rossella", debljina: 0, koeficijent: 0, gsm: 55, jedinica: "g/m²", cenaKg: 1.4, napomena: "Papir, ručni unos gsm" },
];

function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed;
  } catch {
    return fallback;
  }
}
function safeWrite(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function now() { return new Date().toLocaleString("sr-RS"); }
function makeId(prefix = "ID") { return `${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`; }
function number(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function round2(v) { return Math.round(number(v) * 100) / 100; }
function fmt(v, dec = 2) { return number(v).toLocaleString("sr-RS", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function formatDateLabel(v) { if (!v) return ""; const d = new Date(v); if (Number.isNaN(d.getTime())) return String(v); return d.toLocaleDateString("sr-RS"); }
function calcGsm(m) {
  const gsm = number(m?.gsm);
  if (gsm > 0) return round2(gsm);
  return round2(number(m?.debljina) * number(m?.koeficijent));
}
function kgFromMeters({ sirinaMm, duzinaM, gsm }) {
  const sirinaM = number(sirinaMm) / 1000;
  return round2((sirinaM * number(duzinaM) * number(gsm)) / 1000);
}
function metersFromKg({ sirinaMm, kg, gsm }) {
  const sirinaM = number(sirinaMm) / 1000;
  const g = number(gsm);
  if (!sirinaM || !g) return 0;
  return round2((number(kg) * 1000) / (sirinaM * g));
}
function normalizeStatus(status) {
  const s = String(status || "").trim();
  const lower = s.toLowerCase();
  if (!s) return "dostupna";
  if (["na stanju", "dostupna", "available", "slobodna"].includes(lower)) return "dostupna";
  if (["rezervisano", "rezervisana", "reserved"].includes(lower)) return "rezervisana";
  if (["iskorišćeno", "iskorisceno", "potrošena", "potrosena", "potroseno", "potrošeno", "used"].includes(lower)) return "potrosena";
  if (["formatirana", "formatirano"].includes(lower)) return "formatirana";
  if (["blokirana", "blokirano"].includes(lower)) return "blokirana";
  return lower;
}
function displayStatus(status) {
  const st = normalizeStatus(status);
  if (st === "dostupna") return "Na stanju";
  if (st === "rezervisana") return "Rezervisano";
  if (st === "potrosena") return "Iskorišćeno";
  if (st === "formatirana") return "Formatirana";
  if (st === "blokirana") return "Blokirana";
  return status || "Na stanju";
}
function isRollVisibleOnStock(r) {
  const st = normalizeStatus(r?.status);
  return ["dostupna", "rezervisana", "formatirana"].includes(st) && number(r?.duzina ?? r?.metraza_ost ?? r?.metraza) > 0;
}
function statusColor(s) {
  const st = normalizeStatus(s);
  if (st === "rezervisana") return "#f59e0b";
  if (st === "potrosena") return "#ef4444";
  if (st === "formatirana") return "#2563eb";
  if (st === "blokirana") return "#7c3aed";
  return "#059669";
}
function ensureMaterials() {
  const current = safeRead(LS_MATERIJALI, null);
  if (!Array.isArray(current) || current.length === 0) {
    safeWrite(LS_MATERIJALI, DEFAULT_MATERIALS);
    return DEFAULT_MATERIALS;
  }
  return current;
}
function normalizeMaterial(m) {
  const gsm = calcGsm(m);
  return {
    id: m.id || makeId("MAT"),
    vrsta: m.vrsta || "BOPP",
    komercijalnaOznaka: m.komercijalnaOznaka || m.naziv || "Novi materijal",
    proizvodjac: m.proizvodjac || "",
    debljina: number(m.debljina),
    koeficijent: number(m.koeficijent),
    gsm,
    jedinica: m.jedinica || (number(m.gsm) > 0 && !number(m.debljina) ? "g/m²" : "µ"),
    cenaKg: number(m.cenaKg),
    napomena: m.napomena || "",
  };
}
function materialLabel(m) {
  if (!m) return "—";
  const dim = m.jedinica === "g/m²" || !number(m.debljina) ? `${fmt(m.gsm, 1)} g/m²` : `${m.debljina}µ / ${fmt(calcGsm(m), 1)} g/m²`;
  const oznaka = m.oznaka || m.oznaka_materijala || m.komercijalnaOznaka || "—";
  return `${m.vrsta} · ${oznaka} · ${m.proizvodjac || "—"} · ${dim}`;
}
function cleanOznaka(value, vrsta = "") {
  let v = String(value || "").trim();
  const t = String(vrsta || "").trim();
  if (t && v.toLowerCase().startsWith(t.toLowerCase() + " ")) v = v.slice(t.length).trim();
  return v;
}
function rollOznaka(r) {
  return cleanOznaka(r?.oznaka_materijala || r?.oznaka || r?.komercijalnaOznaka || r?.materijal || "", r?.vrsta);
}
function mapDbRollToEngine(r = {}) {
  const vrsta = r.vrsta || r.tip || r.materijal || "Nedefinisano";
  const oznaka = cleanOznaka(r.oznaka_materijala || r.oznaka || r.komercijalnaOznaka || "", vrsta);
  return {
    ...r,
    qr: r.qr || r.qr_code || r.br_rolne || r.broj_rolne || String(r.id || ""),
    vrsta,
    pod_vrsta: r.pod_vrsta || r.podvrsta || "",
    oznaka_materijala: oznaka,
    materijal: vrsta,
    komercijalnaOznaka: oznaka,
    proizvodjac: r.proizvodjac || r.dobavljac || "",
    debljina: r.debljina ?? r.deb ?? 0,
    sirina: r.sirina ?? 0,
    duzina: r.duzina ?? r.metraza_ost ?? r.metraza ?? 0,
    kg: r.kg ?? r.kg_neto ?? r.kg_bruto ?? 0,
    datum: r.datum_prijema || r.datum || r.created_at || "",
    datum_ulaza: r.datum_prijema || r.datum || r.created_at || "",
    datum_proizvodnje: r.datum_proizvodnje || "",
    status: r.status || "Na stanju",
    lokacija: r.lokacija || "Magacin",
  };
}
function rollQrPayload(r) {
  return JSON.stringify({
    type: "maropack_roll",
    qr: r.qr,
    vrsta: r.vrsta,
    pod_vrsta: r.pod_vrsta || "",
    oznaka_materijala: rollOznaka(r),
    oznaka: rollOznaka(r),
    proizvodjac: r.proizvodjac || "",
    debljina: r.debljina,
    sirina: r.sirina,
    duzina_m: r.duzina,
    kg: r.kg,
    lot: r.lot || "",
    lokacija: r.lokacija || "",
    status: displayStatus(r.status),
    parent_qr: r.parent_qr || "",
    datum_ulaza: r.datum_ulaza || r.datum || "",
    datum_proizvodnje: r.datum_proizvodnje || "",
    datum_popisa: r.datum_popisa || "",
  });
}


function normalizeKey(k) {
  return String(k || "").toLowerCase().trim().replace(/[š]/g, "s").replace(/[đ]/g, "dj").replace(/[čć]/g, "c").replace(/[ž]/g, "z").replace(/[^a-z0-9]+/g, "_");
}
function pick(row, names) {
  const map = {};
  Object.keys(row || {}).forEach((k) => { map[normalizeKey(k)] = row[k]; });
  for (const n of names) {
    const v = map[normalizeKey(n)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}
function normalizePackingRow(row = {}) {
  return {
    vrsta: pick(row, ["vrsta", "type", "material", "materijal"]),
    pod_vrsta: pick(row, ["pod vrsta", "pod_vrsta", "podvrsta", "subtype", "podtip"]),
    oznaka_materijala: pick(row, ["oznaka materijala", "oznaka", "material code", "code"]),
    komercijalnaOznaka: pick(row, ["oznaka materijala", "komercijalna oznaka", "oznaka", "commercial name", "naziv", "materijal"]),
    proizvodjac: pick(row, ["proizvodjac", "proizvođač", "manufacturer", "supplier", "dobavljac"]),
    debljina: number(pick(row, ["debljina", "deb", "thickness", "mic", "µ"])),
    koeficijent: number(pick(row, ["koeficijent", "gustina", "density"])),
    gsm: number(pick(row, ["gsm", "g/m2", "g/m²", "gramatura"])),
    sirina: number(pick(row, ["sirina", "širina", "width", "sirina mm", "width mm"])),
    duzina: number(pick(row, ["m", "metara", "duzina", "dužina", "length", "meter", "meters"])),
    kg: number(pick(row, ["kg", "kilograma", "weight", "tezina", "težina"])),
    lot: String(pick(row, ["lot", "batch", "sarza", "šarža", "serija"])),
    lokacija: String(pick(row, ["lokacija", "location", "skladiste", "magacin"])),
    datum: String(pick(row, ["datum", "date", "datum ulaza"])),
    datum_proizvodnje: String(pick(row, ["datum proizvodnje", "datum_proizvodnje", "production date", "date of production"])),
  };
}
function parsePackingText(text = "") {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const parts = line.split(sep).map((x) => x.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = parts[i] || ""; });
    return normalizePackingRow(obj);
  }).filter((r) => r.vrsta || r.komercijalnaOznaka || r.sirina || r.duzina || r.kg);
}
function extractQrFromScan(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return parsed.qr || parsed.rola || parsed.roll || raw;
  } catch {
    const match = raw.match(/ROLNA[-_A-Z0-9]+/i);
    return match ? match[0] : raw;
  }
}

export function getWarehouseMaterials() { return ensureMaterials(); }
export function findMatchingRolls(requirement = {}) {
  const rolls = safeRead(LS_ROLNE, []);
  const wantedVrsta = String(requirement.vrsta || requirement.materijal || "").toLowerCase();
  const wantedDeb = number(requirement.debljina);
  const wantedSirina = number(requirement.sirina || requirement.sirinaMm);
  const tolerance = number(requirement.tolerancijaSirine || 2);
  return rolls
    .filter((r) => isRollVisibleOnStock(r))
    .filter((r) => !wantedVrsta || String(r.vrsta || r.materijal || "").toLowerCase().includes(wantedVrsta))
    .filter((r) => !wantedDeb || Math.abs(number(r.debljina) - wantedDeb) < 0.01)
    .filter((r) => !wantedSirina || number(r.sirina) >= wantedSirina - tolerance)
    .sort((a, b) => number(a.sirina) - number(b.sirina));
}
export function addWarehouseRoll(roll, event = "ULAZ") {
  const rolne = safeRead(LS_ROLNE, []);
  const history = safeRead(LS_HISTORY, []);
  const item = {
    id: roll.id || makeId("R"),
    qr: roll.qr || makeId("ROLNA"),
    materijal_id: roll.materijal_id || "",
    vrsta: roll.vrsta || roll.materijal || "Nedefinisano",
    pod_vrsta: roll.pod_vrsta || "",
    oznaka_materijala: cleanOznaka(roll.oznaka_materijala || roll.oznaka || roll.komercijalnaOznaka || "", roll.vrsta || roll.materijal),
    materijal: roll.materijal || roll.vrsta || "Nedefinisano",
    komercijalnaOznaka: cleanOznaka(roll.oznaka_materijala || roll.oznaka || roll.komercijalnaOznaka || roll.materijal || "", roll.vrsta || roll.materijal),
    proizvodjac: roll.proizvodjac || "",
    debljina: number(roll.debljina),
    koeficijent: number(roll.koeficijent),
    gsm: number(roll.gsm),
    sirina: number(roll.sirina),
    duzina: number(roll.duzina),
    kg: number(roll.kg),
    lot: roll.lot || "",
    lokacija: roll.lokacija || "Magacin",
    status: roll.status || "Na stanju",
    master_nalog_id: roll.master_nalog_id || "",
    parent_qr: roll.parent_qr || "",
    datum: roll.datum || new Date().toLocaleDateString("sr-RS"),
    datum_ulaza: roll.datum_ulaza || roll.datum || new Date().toLocaleDateString("sr-RS"),
    datum_proizvodnje: roll.datum_proizvodnje || "",
    datum_poslednje_promene: roll.datum_poslednje_promene || now(),
    datum_popisa: roll.datum_popisa || "",
    popisano: !!roll.popisano,
    napomena: roll.napomena || "",
  };
  const next = [item, ...rolne.filter((r) => r.qr !== item.qr)];
  const hist = [{ vreme: now(), qr: item.qr, event, opis: roll.napomena || event, stanje: item.status }, ...history];
  safeWrite(LS_ROLNE, next);
  safeWrite(LS_HISTORY, hist);
  return item;
}

function RollLabel({ roll, className = "roll-label-print" }) {
  const oznaka = rollOznaka(roll);
  return (
    <div className={className} style={{ width: "100mm", height: "140mm", background: "#fff", border: "1px solid #111827", borderRadius: 0, padding: "5mm", boxSizing: "border-box", fontFamily: "Arial, sans-serif", color: "#111827", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #111827", paddingBottom: 4 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: .4 }}>MAROPACK</div>
          <div style={{ fontSize: 9, fontWeight: 800 }}>ETIKETA ROLNE / QR TRACEABILITY</div>
        </div>
        <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" }}>100 × 140 mm</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "34mm 1fr", gap: 5, marginTop: 5 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <QRCodeSVG value={rollQrPayload(roll)} size={118} level="M" includeMargin={false} />
        </div>
        <div style={{ fontSize: 10, lineHeight: 1.35 }}>
          <div style={{ fontSize: 12, fontWeight: 900, wordBreak: "break-all" }}>{roll.qr}</div>
          <div><b>Vrsta:</b> {roll.vrsta || "—"}</div>
          <div><b>Pod vrsta:</b> {roll.pod_vrsta || "—"}</div>
          <div><b>Oznaka:</b> {oznaka || "—"}</div>
          <div><b>Dobavljač:</b> {roll.proizvodjac || "—"}</div>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 5, fontSize: 10 }}>
        <tbody>
          <tr><td style={tdh}>DEB.</td><td style={td}>{roll.debljina || "—"} µ</td><td style={tdh}>ŠIRINA</td><td style={td}>{roll.sirina} mm</td></tr>
          <tr><td style={tdh}>METRAŽA</td><td style={td}>{fmt(roll.duzina, 0)} m</td><td style={tdh}>KG</td><td style={td}>{fmt(roll.kg, 2)}</td></tr>
          <tr><td style={tdh}>LOT</td><td style={td}>{roll.lot || "—"}</td><td style={tdh}>DAT. PROIZ.</td><td style={td}>{formatDateLabel(roll.datum_proizvodnje) || "—"}</td></tr>
        </tbody>
      </table>
      {roll.parent_qr && <div style={{ marginTop: 4, fontSize: 9 }}><b>Parent rolna:</b> {roll.parent_qr}</div>}
      <div style={{ marginTop: 5, borderTop: "1px solid #111", paddingTop: 4, fontSize: 8 }}>
        Skeniranjem QR koda otvara se istorija i status rolne.
      </div>
      <div style={{ marginTop: 7, borderTop: "2px solid #111", paddingTop: 6, fontSize: 13, fontWeight: 900 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}><span style={boxStyle}></span><span>Prvi ulaz</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={boxStyle}></span><span>Povrat u magacin</span></div>
      </div>
    </div>
  );
}
const boxStyle = { display: "inline-block", width: "7mm", height: "7mm", border: "2px solid #111" };
const td = { border: "1px solid #111", padding: 3 };
const tdh = { ...td, fontWeight: 900 };

export default function RolneWarehouseEngine({ db = {}, msg }) {
  const [activeTab, setActiveTab] = useState("rolne");
  const [materijali, setMaterijali] = useState([]);
  const [rolne, setRolne] = useState([]);
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState({ datum: "", datum_proizvodnje: "", vrsta: "", pod_vrsta: "", oznaka: "", proizvodjac: "", debljina: "", sirina: "", duzina: "", kg: "", lot: "", lokacija: "", status: "" });
  const [matFilter, setMatFilter] = useState("");
  const [selectedMatId, setSelectedMatId] = useState("");
  const [calcMode, setCalcMode] = useState("m_to_kg");
  const [form, setForm] = useState({ sirina: 840, duzina: 10000, kg: "", lot: "", lokacija: "A-01", pod_vrsta: "", datum_proizvodnje: "", napomena: "" });
  const [matForm, setMatForm] = useState({ vrsta: "BOPP", komercijalnaOznaka: "BOPP transparent 20µ", proizvodjac: "", debljina: 20, koeficijent: 0.91, gsm: 18.2, jedinica: "µ", cenaKg: 3.1, napomena: "" });
  // V45: Jedini aktivni unos materijala ide preko Material Master logike.
  // Nema duplog ručnog kucanja: VRSTA -> OZNAKA -> DEBLJINA -> auto koef/gm2/naziv.
  const [materialPick, setMaterialPick] = useState({ vrsta: "BOPP", oznaka: "FXCB", debljina: 20, proizvodjac: "", cenaKg: "", napomena: "" });
  const [req, setReq] = useState({ vrsta: "BOPP", debljina: 20, sirina: 840, potrebniM: 5000 });
  const [labelRoll, setLabelRoll] = useState(null);
  const [bulkLabels, setBulkLabels] = useState([]);
  const [selectedRolls, setSelectedRolls] = useState([]);
  const [packingText, setPackingText] = useState("Vrsta;Oznaka;Proizvođač;Debljina;Širina;m;kg;Lot;Lokacija;Datum\nBOPP;BOPP transparent 20µ;Dobavljač;20;840;10000;;LOT-1;A-01;");
  const [packingRows, setPackingRows] = useState([]);
  const [popisQr, setPopisQr] = useState("");
  const [popisRoll, setPopisRoll] = useState(null);
  const [popisForm, setPopisForm] = useState({ duzina: "", kg: "", lokacija: "" });

  async function reload() {
    const mats = ensureMaterials().map(normalizeMaterial);
    safeWrite(LS_MATERIJALI, mats);
    setMaterijali(mats);

    let supabaseRolls = [];
    try {
      if (!supabase?.__localDemo) {
        const { data, error } = await supabase
          .from("magacin")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        supabaseRolls = (data || []).map(mapDbRollToEngine);
      }
    } catch (e) {
      console.error("Učitavanje rolni iz Supabase magacin nije uspelo:", e);
      msg?.("Ne mogu da učitam stanje rolni iz Supabase: " + (e?.message || e), "err");
    }

    const localRolls = safeRead(LS_ROLNE, []).map(mapDbRollToEngine);
    const dbRolls = Array.isArray(db?.rolne) ? db.rolne.map(mapDbRollToEngine) : [];

    const mergedRolls = [...supabaseRolls, ...dbRolls, ...localRolls]
      .filter((x, i, arr) => x && i === arr.findIndex(y => String(y.qr || y.id) === String(x.qr || x.id)));

    setRolne(mergedRolls);
    safeWrite(LS_ROLNE, mergedRolls);
    setHistory(safeRead(LS_HISTORY, []));
    if (!selectedMatId && mats[0]) setSelectedMatId(mats[0].id);
  }
  useEffect(() => { reload(); }, []);
  useEffect(() => { reload(); }, [db?.rolne?.length]);

  const masterVrste = useMemo(() => getVrsteMaterijala(), []);
  const masterOznake = useMemo(() => getOznakeZaVrstu(materialPick.vrsta), [materialPick.vrsta]);
  const masterDebljine = useMemo(() => getDebljineZaMaterijal(materialPick.vrsta, materialPick.oznaka), [materialPick.vrsta, materialPick.oznaka]);

  useEffect(() => {
    const nextOznake = getOznakeZaVrstu(materialPick.vrsta);
    const preferred = nextOznake.includes(materialPick.oznaka) ? materialPick.oznaka : (nextOznake.includes("FXCB") ? "FXCB" : (nextOznake[0] || "STANDARD"));
    if (preferred !== materialPick.oznaka) setMaterialPick((p) => ({ ...p, oznaka: preferred }));
  }, [materialPick.vrsta]);

  useEffect(() => {
    const nextDebljine = getDebljineZaMaterijal(materialPick.vrsta, materialPick.oznaka);
    const preferred = nextDebljine.includes(Number(materialPick.debljina)) ? Number(materialPick.debljina) : (nextDebljine.includes(20) ? 20 : (nextDebljine[0] || 20));
    if (preferred !== Number(materialPick.debljina)) setMaterialPick((p) => ({ ...p, debljina: preferred }));
  }, [materialPick.vrsta, materialPick.oznaka]);

  const selectedMat = useMemo(() => {
    const koef = mmKoeficijent(materialPick.vrsta);
    const gsm = mmCalculateGm2(materialPick.vrsta, materialPick.debljina);
    const naziv = mmBuildMaterialName(materialPick.vrsta, materialPick.oznaka, materialPick.debljina);
    return normalizeMaterial({
      id: `MAT-${materialPick.vrsta}-${materialPick.oznaka}-${materialPick.debljina}`.replace(/[^A-Za-z0-9_-]/g, "_"),
      vrsta: materialPick.vrsta,
      oznaka: materialPick.oznaka,
      komercijalnaOznaka: naziv,
      proizvodjac: materialPick.proizvodjac || "",
      debljina: materialPick.debljina,
      koeficijent: koef || 0,
      gsm,
      jedinica: materialPick.vrsta === "PAPIR" ? "g/m²" : "µ",
      cenaKg: materialPick.cenaKg || "",
      napomena: materialPick.napomena || ""
    });
  }, [materialPick]);

  const liveGsm = selectedMat ? calcGsm(selectedMat) : 0;
  const calculatedKg = useMemo(() => kgFromMeters({ sirinaMm: form.sirina, duzinaM: form.duzina, gsm: liveGsm }), [form.sirina, form.duzina, liveGsm]);
  const calculatedM = useMemo(() => metersFromKg({ sirinaMm: form.sirina, kg: form.kg, gsm: liveGsm }), [form.sirina, form.kg, liveGsm]);

  function syncFormByMode(next) {
    const merged = { ...form, ...next };
    if (calcMode === "m_to_kg") merged.kg = kgFromMeters({ sirinaMm: merged.sirina, duzinaM: merged.duzina, gsm: liveGsm });
    else merged.duzina = metersFromKg({ sirinaMm: merged.sirina, kg: merged.kg, gsm: liveGsm });
    setForm(merged);
  }

  const filteredMaterials = useMemo(() => {
    const q = matFilter.toLowerCase().trim();
    if (!q) return materijali;
    return materijali.filter((m) => [m.vrsta, m.komercijalnaOznaka, m.proizvodjac, m.debljina, m.gsm, m.napomena].join(" ").toLowerCase().includes(q));
  }, [materijali, matFilter]);

  const filteredRolls = useMemo(() => {
    const q = filter.toLowerCase().trim();
    const matchesText = (val, needle) => String(val ?? "").toLowerCase().includes(String(needle ?? "").toLowerCase().trim());
    return rolne.filter((r) => {
      if (q && ![r.qr, r.datum_ulaza, r.datum, r.datum_proizvodnje, r.datum_popisa, r.vrsta, r.pod_vrsta, r.oznaka_materijala, r.materijal, r.komercijalnaOznaka, r.proizvodjac, r.debljina, r.sirina, r.duzina, r.kg, r.lot, r.lokacija, r.status, r.master_nalog_id].join(" ").toLowerCase().includes(q)) return false;
      if (columnFilters.datum && !matchesText(r.datum_ulaza || r.datum, columnFilters.datum)) return false;
      if (columnFilters.vrsta && !matchesText(r.vrsta, columnFilters.vrsta)) return false;
      if (columnFilters.pod_vrsta && !matchesText(r.pod_vrsta, columnFilters.pod_vrsta)) return false;
      if (columnFilters.datum_proizvodnje && !matchesText(r.datum_proizvodnje, columnFilters.datum_proizvodnje)) return false;
      if (columnFilters.oznaka && !matchesText(rollOznaka(r), columnFilters.oznaka)) return false;
      if (columnFilters.proizvodjac && !matchesText(r.proizvodjac, columnFilters.proizvodjac)) return false;
      if (columnFilters.debljina && !matchesText(r.debljina, columnFilters.debljina)) return false;
      if (columnFilters.sirina && !matchesText(r.sirina, columnFilters.sirina)) return false;
      if (columnFilters.duzina && !matchesText(r.duzina, columnFilters.duzina)) return false;
      if (columnFilters.kg && !matchesText(r.kg, columnFilters.kg)) return false;
      if (columnFilters.lot && !matchesText(r.lot, columnFilters.lot)) return false;
      if (columnFilters.lokacija && !matchesText(r.lokacija, columnFilters.lokacija)) return false;
      if (columnFilters.status && normalizeStatus(r.status) !== normalizeStatus(columnFilters.status)) return false;
      return true;
    });
  }, [rolne, filter, columnFilters]);

  const stats = useMemo(() => {
    const totalM = rolne.reduce((s, r) => s + number(r.duzina), 0);
    const totalKg = rolne.reduce((s, r) => s + number(r.kg), 0);
    const byStatus = rolne.reduce((a, r) => {
      const st = normalizeStatus(r.status);
      a[st] = (a[st] || 0) + 1;
      return a;
    }, {});
    return { total: rolne.length, totalM, totalKg, dostupna: byStatus.dostupna || 0, rezervisana: byStatus.rezervisana || 0, formatirana: byStatus.formatirana || 0, potrosena: byStatus.potrosena || 0 };
  }, [rolne]);

  const suggestedRolls = useMemo(() => {
    const matches = findMatchingRolls(req);
    const needM = number(req.potrebniM);
    return matches.map((r) => ({ ...r, pokriva: needM ? number(r.duzina) >= needM : true, ostatak: needM ? number(r.duzina) - needM : 0 }));
  }, [req, rolne]);

  function saveMaterial() {
    const material = normalizeMaterial(matForm);
    const next = [material, ...materijali.filter((m) => m.id !== material.id)];
    safeWrite(LS_MATERIJALI, next);
    setMaterijali(next);
    setSelectedMatId(material.id);
    msg?.(`Materijal dodat: ${material.komercijalnaOznaka}`);
  }
  function editMaterial(m) { setMatForm({ ...m }); setActiveTab("materijali"); }
  function deleteMaterial(m) {
    if (!confirm(`Obrisati materijal ${m.komercijalnaOznaka}?`)) return;
    const next = materijali.filter((x) => x.id !== m.id);
    safeWrite(LS_MATERIJALI, next);
    setMaterijali(next);
    if (selectedMatId === m.id) setSelectedMatId(next[0]?.id || "");
  }
  function resetDefaultMaterials() {
    if (!confirm("Vratiti početnu bazu materijala? Postojeći materijali ostaju, duplikati se neće dodati.")) return;
    const merged = [...materijali];
    DEFAULT_MATERIALS.map(normalizeMaterial).forEach((m) => {
      if (!merged.some((x) => x.id === m.id || (x.vrsta === m.vrsta && x.komercijalnaOznaka === m.komercijalnaOznaka))) merged.push(m);
    });
    safeWrite(LS_MATERIJALI, merged); setMaterijali(merged);
  }
  async function addRoll() {
    if (!selectedMat) { msg?.("Prvo izaberi materijal preko Material Master-a", "err"); return; }
    if (!number(form.sirina)) { msg?.("Unesi širinu rolne", "err"); return; }
    const existsMat = materijali.some((m) => m.id === selectedMat.id || (m.vrsta === selectedMat.vrsta && m.komercijalnaOznaka === selectedMat.komercijalnaOznaka && Number(m.debljina) === Number(selectedMat.debljina)));
    if (!existsMat) {
      safeWrite(LS_MATERIJALI, [selectedMat, ...materijali]);
      setMaterijali([selectedMat, ...materijali]);
    }
    const finalKg = calcMode === "m_to_kg" ? calculatedKg : number(form.kg);
    const finalM = calcMode === "kg_to_m" ? calculatedM : number(form.duzina);
    if (!finalKg || !finalM) { msg?.("Unesi metre ili kg da sistem izračuna drugo polje", "err"); return; }
    const brRolne = makeId("ROLNA");
    const cleanCode = cleanOznaka(selectedMat.oznaka || materialPick.oznaka || selectedMat.komercijalnaOznaka, selectedMat.vrsta);
    let item = null;
    try {
      if (!supabase.__localDemo) {
        const { data, error } = await supabase.from("magacin").insert({
          br_rolne: brRolne,
          tip: selectedMat.vrsta,
          vrsta: selectedMat.vrsta,
          pod_vrsta: form.pod_vrsta || null,
          oznaka_materijala: cleanCode,
          deb: selectedMat.debljina,
          sirina: number(form.sirina),
          metraza: finalM,
          metraza_ost: finalM,
          kg_bruto: finalKg,
          kg_neto: finalKg,
          lot: form.lot || null,
          dobavljac: selectedMat.proizvodjac || null,
          datum: new Date().toISOString().slice(0, 10),
          datum_prijema: new Date().toISOString().slice(0, 10),
          datum_proizvodnje: form.datum_proizvodnje || null,
          status: "Na stanju",
          qr_code: brRolne,
          lokacija: form.lokacija || null,
          napomena: form.napomena || null,
        }).select("*").single();
        if (error) throw error;
        item = mapDbRollToEngine(data);
      }
    } catch (e) {
      msg?.("Supabase upis rolne nije uspeo, čuvam lokalno: " + e.message, "err");
    }
    if (!item) {
      item = addWarehouseRoll({
        qr: brRolne, materijal_id: selectedMat.id, vrsta: selectedMat.vrsta, pod_vrsta: form.pod_vrsta,
        oznaka_materijala: cleanCode, materijal: selectedMat.vrsta,
        komercijalnaOznaka: cleanCode, proizvodjac: selectedMat.proizvodjac, debljina: selectedMat.debljina,
        koeficijent: selectedMat.koeficijent, gsm: calcGsm(selectedMat), sirina: form.sirina, duzina: finalM, kg: finalKg,
        lot: form.lot, lokacija: form.lokacija, datum_proizvodnje: form.datum_proizvodnje, napomena: form.napomena, status: "Na stanju",
      }, "ULAZ U MAGACIN");
    }
    reload(); setLabelRoll(item); msg?.(`Rolna ${item.qr} dodata · ${fmt(finalM, 0)} m · ${fmt(finalKg, 2)} kg`);
  }
  function changeStatus(r, status) {
    const next = rolne.map((x) => x.qr === r.qr ? { ...x, status, datum_poslednje_promene: now() } : x);
    const hist = [{ vreme: now(), qr: r.qr, event: "PROMENA STATUSA", opis: `${r.status} → ${status}`, stanje: status }, ...history];
    safeWrite(LS_ROLNE, next); safeWrite(LS_HISTORY, hist); setRolne(next); setHistory(hist);
    msg?.(`Status rolne ${r.qr}: ${status}`);
  }
  function reserveForMaster(r) {
    const masterId = prompt("Unesi master_nalog_id / broj naloga za rezervaciju:", r.master_nalog_id || "");
    if (masterId === null) return;
    const next = rolne.map((x) => x.qr === r.qr ? { ...x, status: "Rezervisano", master_nalog_id: masterId, datum_poslednje_promene: now() } : x);
    const hist = [{ vreme: now(), qr: r.qr, event: "REZERVACIJA", opis: `Rezervisano za ${masterId}`, stanje: "Rezervisano" }, ...history];
    safeWrite(LS_ROLNE, next); safeWrite(LS_HISTORY, hist); setRolne(next); setHistory(hist);
    msg?.(`Rolna ${r.qr} rezervisana za ${masterId}`);
  }
  function consumeRoll(r) {
    const used = prompt("Koliko metara se troši? Prazno = cela rolna", String(r.duzina || ""));
    if (used === null) return;
    const usedM = used === "" ? number(r.duzina) : number(used);
    const remainM = Math.max(0, number(r.duzina) - usedM);
    const remainKg = kgFromMeters({ sirinaMm: r.sirina, duzinaM: remainM, gsm: r.gsm });
    const status = remainM > 0 ? r.status : "Iskorišćeno";
    const next = rolne.map((x) => x.qr === r.qr ? { ...x, duzina: remainM, kg: remainKg, status, datum_poslednje_promene: now() } : x);
    const hist = [{ vreme: now(), qr: r.qr, event: "POTROŠNJA", opis: `Skinuto ${fmt(usedM, 0)} m, ostalo ${fmt(remainM, 0)} m`, stanje: status }, ...history];
    safeWrite(LS_ROLNE, next); safeWrite(LS_HISTORY, hist); setRolne(next); setHistory(hist);
  }
  function createReservationRequest() { safeWrite(LS_PENDING_RESERVATION, req); msg?.("Zahtev za izbor rolni je sačuvan. Kasnije ga povezujemo direktno sa master nalogom."); }
  function toggleSelected(qr) { setSelectedRolls((prev) => prev.includes(qr) ? prev.filter((x) => x !== qr) : [...prev, qr]); }
  function selectAllFiltered() { setSelectedRolls((prev) => Array.from(new Set([...prev, ...filteredRolls.map((r) => r.qr)]))); }
  function clearSelection() { setSelectedRolls([]); }
  function openBulkLabels() {
    const selected = rolne.filter((r) => selectedRolls.includes(r.qr));
    if (selected.length === 0) { msg?.("Izaberi bar jednu rolnu za štampu etiketa", "err"); return; }
    setBulkLabels(selected);
  }
  function printLabels() {
    const root = document.querySelector(".roll-label-print-root");
    const labels = root ? Array.from(root.querySelectorAll(".roll-label-print")).map((el) => el.outerHTML).join("\n") : "";
    if (!labels) { window.print(); return; }
    const printWindow = window.open("", "_blank", "width=520,height=720");
    if (!printWindow) { window.print(); return; }
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>QR etikete rolni</title>
  <style>
    @page { size: 100mm 140mm; margin: 0; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100mm !important;
      background: #fff !important;
      font-family: Arial, sans-serif;
    }
    * { box-sizing: border-box !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .roll-label-print {
      width: 100mm !important;
      height: 140mm !important;
      margin: 0 !important;
      padding: 5mm !important;
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      overflow: hidden !important;
      page-break-after: always !important;
      break-after: page !important;
      background: #fff !important;
    }
    .roll-label-print:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    @media screen {
      body { padding: 10px !important; background: #e5e7eb !important; }
      .roll-label-print { outline: 1px solid #111827; margin-bottom: 12px !important; }
    }
  </style>
</head>
<body>${labels}</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      setTimeout(() => printWindow.close(), 400);
    }, 400);
  }
  function setColFilter(key, value) { setColumnFilters((p) => ({ ...p, [key]: value })); }


  async function handlePackingFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const rows = json.map(normalizePackingRow).filter((r) => r.vrsta || r.komercijalnaOznaka || r.sirina || r.duzina || r.kg);
        setPackingRows(rows);
        msg?.(`Učitano ${rows.length} redova iz Excel packing liste.`);
      } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
        const text = await file.text();
        setPackingText(text);
        const rows = parsePackingText(text);
        setPackingRows(rows);
        msg?.(`Učitano ${rows.length} redova iz tekstualne packing liste.`);
      } else if (name.endsWith(".pdf")) {
        msg?.("PDF upload je pripremljen: za sada nalepi tekst iz packing liste u polje ispod ili koristi Excel/CSV. Skenirani PDF zahteva OCR API.", "err");
      } else {
        msg?.("Podržano: Excel .xlsx/.xls, CSV/TXT. Za PDF nalepi tekst ili koristi OCR workflow.", "err");
      }
    } catch (err) {
      msg?.(`Greška kod uvoza packing liste: ${err.message}`, "err");
    }
    e.target.value = "";
  }
  function parseTextPackingList() {
    const rows = parsePackingText(packingText);
    setPackingRows(rows);
    msg?.(`Prepoznato ${rows.length} redova iz teksta.`);
  }
  function importPackingRows() {
    if (!packingRows.length) { msg?.("Nema redova za uvoz", "err"); return; }
    let mats = [...materijali];
    let count = 0;
    packingRows.forEach((row) => {
      const baseGsm = row.gsm || (row.debljina && row.koeficijent ? row.debljina * row.koeficijent : 0);
      let mat = mats.find((m) => String(m.vrsta).toLowerCase() === String(row.vrsta).toLowerCase() && String(m.komercijalnaOznaka).toLowerCase() === String(row.komercijalnaOznaka).toLowerCase() && number(m.debljina) === number(row.debljina));
      if (!mat) {
        mat = normalizeMaterial({
          vrsta: row.vrsta || "Nedefinisano",
          oznaka: cleanOznaka(row.oznaka_materijala || row.komercijalnaOznaka || row.vrsta || "", row.vrsta),
          oznaka_materijala: cleanOznaka(row.oznaka_materijala || row.komercijalnaOznaka || row.vrsta || "", row.vrsta),
          komercijalnaOznaka: cleanOznaka(row.oznaka_materijala || row.komercijalnaOznaka || row.vrsta || "Materijal iz packing liste", row.vrsta),
          proizvodjac: row.proizvodjac || "",
          debljina: row.debljina,
          koeficijent: row.koeficijent || 0,
          gsm: baseGsm,
          jedinica: baseGsm && !row.debljina ? "g/m²" : "µ",
        });
        mats = [mat, ...mats];
      }
      const gsm = calcGsm(mat) || row.gsm || baseGsm;
      const duzina = row.duzina || (row.kg && row.sirina && gsm ? metersFromKg({ sirinaMm: row.sirina, kg: row.kg, gsm }) : 0);
      const kg = row.kg || (row.duzina && row.sirina && gsm ? kgFromMeters({ sirinaMm: row.sirina, duzinaM: row.duzina, gsm }) : 0);
      if (!row.sirina || (!duzina && !kg)) return;
      addWarehouseRoll({
        materijal_id: mat.id, vrsta: mat.vrsta, pod_vrsta: row.pod_vrsta || "",
        oznaka_materijala: cleanOznaka(row.oznaka_materijala || mat.oznaka || mat.komercijalnaOznaka, mat.vrsta),
        materijal: mat.vrsta, komercijalnaOznaka: cleanOznaka(row.oznaka_materijala || mat.oznaka || mat.komercijalnaOznaka, mat.vrsta),
        proizvodjac: mat.proizvodjac || row.proizvodjac, debljina: mat.debljina || row.debljina, koeficijent: mat.koeficijent || row.koeficijent,
        gsm, sirina: row.sirina, duzina, kg, lot: row.lot, lokacija: row.lokacija || "Magacin", datum: row.datum || new Date().toLocaleDateString("sr-RS"), datum_proizvodnje: row.datum_proizvodnje || "", status: "Na stanju",
        napomena: "Uvoz iz packing liste"
      }, "UVOZ PACKING LISTE");
      count += 1;
    });
    safeWrite(LS_MATERIJALI, mats);
    setMaterijali(mats);
    reload();
    msg?.(`Uvezeno ${count} rolni iz packing liste.`);
  }
  function findPopisRoll() {
    const qr = extractQrFromScan(popisQr);
    const found = rolne.find((r) => r.qr === qr || rollQrPayload(r) === popisQr);
    if (!found) { setPopisRoll(null); msg?.(`Rolna nije pronađena: ${qr}`, "err"); return; }
    setPopisRoll(found);
    setPopisForm({ duzina: found.duzina, kg: found.kg, lokacija: found.lokacija || "" });
  }
  function confirmInventoryCount() {
    if (!popisRoll) { msg?.("Prvo skeniraj/pronađi rolnu", "err"); return; }
    const gsm = number(popisRoll.gsm);
    const m = number(popisForm.duzina);
    const kg = number(popisForm.kg) || kgFromMeters({ sirinaMm: popisRoll.sirina, duzinaM: m, gsm });
    const next = rolne.map((r) => r.qr === popisRoll.qr ? { ...r, duzina: m, kg, lokacija: popisForm.lokacija || r.lokacija, datum_popisa: now(), datum_poslednje_promene: now(), popisano: true } : r);
    const hist = [{ vreme: now(), qr: popisRoll.qr, event: "POPIS QR", opis: `Popisano stanje: ${fmt(m,0)} m / ${fmt(kg,2)} kg · lokacija ${popisForm.lokacija || popisRoll.lokacija}`, stanje: popisRoll.status }, ...history];
    safeWrite(LS_ROLNE, next); safeWrite(LS_HISTORY, hist); setRolne(next); setHistory(hist);
    setPopisQr(""); setPopisRoll(null); setPopisForm({ duzina: "", kg: "", lokacija: "" });
    msg?.("Popis rolne potvrđen i stanje ažurirano.");
  }

  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.05)" };
  const input = { width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: 13 };
  const smallInput = { ...input, padding: "7px 8px", borderRadius: 8, fontSize: 12 };
  const btn = { border: "none", borderRadius: 10, padding: "9px 12px", fontWeight: 900, cursor: "pointer" };
  const lbl = { display: "block", fontSize: 11, fontWeight: 900, color: "#475569", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3 };
  const tabBtn = (key) => ({ ...btn, background: activeTab === key ? "#0f172a" : "#f8fafc", color: activeTab === key ? "#fff" : "#334155", border: "1px solid #e2e8f0" });

  const PrintCSS = () => (
    <style>{`
      @media print {
        @page { size: 100mm 140mm; margin: 0; }
        html, body { width: 100mm !important; min-width: 100mm !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: #fff !important; }
        body * { visibility: hidden !important; }
        .roll-label-print-root, .roll-label-print-root * { visibility: visible !important; }
        .roll-label-print-root { position: absolute !important; left: 0 !important; top: 0 !important; width: 100mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; display: block !important; }
        .roll-label-print { width: 100mm !important; height: 140mm !important; margin: 0 !important; padding: 5mm !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; overflow: hidden !important; page-break-after: always !important; break-after: page !important; box-sizing: border-box !important; }
        .roll-label-print:last-child { page-break-after: auto !important; break-after: auto !important; }
        .no-print { display: none !important; }
      }
    `}</style>
  );

  const LabelModal = labelRoll ? (
    <div className="no-print" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,23,42,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <PrintCSS />
      <div style={{ background: "#fff", borderRadius: 18, padding: 18, width: "min(860px,96vw)", boxShadow: "0 20px 80px rgba(0,0,0,.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div><div style={{ fontSize: 18, fontWeight: 900 }}>QR etiketa rolne · 100×140 mm</div><div style={{ fontSize: 12, color: "#64748b" }}>Optimizovano za Rongta RP400H thermal label printer.</div></div>
          <div style={{ display: "flex", gap: 8 }}><button onClick={printLabels} style={{ ...btn, background: "#059669", color: "#fff" }}>🖨️ Štampaj etiketu</button><button onClick={() => setLabelRoll(null)} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Zatvori</button></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "110mm 1fr", gap: 18, alignItems: "start" }}>
          <div className="roll-label-print-root"><RollLabel roll={labelRoll} /></div>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 900 }}>Preview podaci za proveru pre štampe</div>
            {[`QR: ${labelRoll.qr}`, `Materijal: ${labelRoll.vrsta} · ${labelRoll.komercijalnaOznaka || labelRoll.materijal}`, `Dimenzije: ${labelRoll.sirina} mm · ${fmt(labelRoll.duzina,0)} m · ${fmt(labelRoll.kg,2)} kg`, `LOT: ${labelRoll.lot || "—"}`].map((x) => <div key={x} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>{x}</div>)}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const BulkModal = bulkLabels.length ? (
    <div className="no-print" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,23,42,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <PrintCSS />
      <div style={{ background: "#fff", borderRadius: 18, padding: 18, width: "min(980px,96vw)", maxHeight: "92vh", overflow: "auto", boxShadow: "0 20px 80px rgba(0,0,0,.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div><div style={{ fontSize: 18, fontWeight: 900 }}>Bulk QR etikete · {bulkLabels.length} rolni</div><div style={{ fontSize: 12, color: "#64748b" }}>Svaka rolna ide na posebnu etiketu 100×140 mm.</div></div>
          <div style={{ display: "flex", gap: 8 }}><button onClick={printLabels} style={{ ...btn, background: "#059669", color: "#fff" }}>🖨️ Štampaj sve etikete</button><button onClick={() => setBulkLabels([])} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Zatvori</button></div>
        </div>
        <div className="roll-label-print-root" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100mm, 1fr))", gap: 12 }}>
          {bulkLabels.map((r) => <RollLabel key={r.qr} roll={r} />)}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div style={{ padding: 22, background: "#f1f5f9", minHeight: "100vh", color: "#0f172a" }}>
      {LabelModal}{BulkModal}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div><h1 style={{ margin: 0, fontSize: 28, fontWeight: 950 }}>🏭 Magacin Materijala i Rolni PRO</h1><div style={{ color: "#64748b", marginTop: 4 }}>Baza materijala + unos rolni + automatski obračun kg ⇄ m + predlog rolni za nalog + QR etikete 100×140 mm.</div></div>
        <button onClick={reload} style={{ ...btn, background: "#0f172a", color: "#fff" }}>Osveži</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={() => setActiveTab("rolne")} style={tabBtn("rolne")}>🎞️ Stanje rolni</button>
        <button onClick={() => setActiveTab("ulaz")} style={tabBtn("ulaz")}>➕ Ručni ulaz rolne</button>
        <button onClick={() => setActiveTab("uvoz")} style={tabBtn("uvoz")}>📥 Packing lista</button>
        <button onClick={() => setActiveTab("popis")} style={tabBtn("popis")}>📲 QR popis</button>
        <button onClick={() => setActiveTab("materijali")} style={tabBtn("materijali")}>🧱 Baza materijala</button>
        <button onClick={() => setActiveTab("predlog")} style={tabBtn("predlog")}>🎯 Predlog rolni za nalog</button>
        <button onClick={() => setActiveTab("istorija")} style={tabBtn("istorija")}>🕘 Istorija</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 16 }}>
        {[["Materijala", materijali.length], ["Ukupno rolni", stats.total], ["Ukupno m", fmt(stats.totalM,0)], ["Ukupno kg", fmt(stats.totalKg,2)], ["Dostupne", stats.dostupna], ["Rezervisane", stats.rezervisana]].map(([a,b]) => <div key={a} style={card}><div style={{ color: "#64748b", fontSize: 12, fontWeight: 900 }}>{a}</div><div style={{ fontSize: 24, fontWeight: 950, marginTop: 4 }}>{b}</div></div>)}
      </div>

      {activeTab === "materijali" && <MaterialsTab {...{ card, input, btn, lbl, matForm, setMatForm, saveMaterial, resetDefaultMaterials, matFilter, setMatFilter, filteredMaterials, editMaterial, deleteMaterial }} />}

      {activeTab === "ulaz" && (
        <div style={{ display: "grid", gridTemplateColumns: "480px 1fr", gap: 16 }}>
          <div style={card}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Ulaz nove rolne</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: 12 }}>
                <div style={{ fontWeight: 950, marginBottom: 10 }}>🧠 Material Master izbor</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <label><span style={lbl}>Vrsta</span><select style={input} value={materialPick.vrsta} onChange={(e) => setMaterialPick({ ...materialPick, vrsta: e.target.value })}>{masterVrste.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
                  <label><span style={lbl}>Oznaka</span><select style={input} value={materialPick.oznaka} onChange={(e) => setMaterialPick({ ...materialPick, oznaka: e.target.value })}>{masterOznake.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
                  <label><span style={lbl}>{materialPick.vrsta === "PAPIR" ? "Gramatura" : "Debljina"}</span><select style={input} value={materialPick.debljina} onChange={(e) => setMaterialPick({ ...materialPick, debljina: Number(e.target.value) })}>{masterDebljine.map((d) => <option key={d} value={d}>{d}{materialPick.vrsta === "PAPIR" ? " g/m²" : "µ"}</option>)}</select></label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <label><span style={lbl}>Proizvođač</span><input style={input} value={materialPick.proizvodjac} onChange={(e) => setMaterialPick({ ...materialPick, proizvodjac: e.target.value })} placeholder="npr. Taghleef / Jindal / Rossella" /></label>
                  <label><span style={lbl}>Cena €/kg</span><input style={input} type="number" value={materialPick.cenaKg} onChange={(e) => setMaterialPick({ ...materialPick, cenaKg: e.target.value })} /></label>
                </div>
              </div>
              <div style={{ background: "#ecfeff", border: "1px solid #67e8f9", borderRadius: 12, padding: 12, fontSize: 13 }}>
                <b>{selectedMat.komercijalnaOznaka}</b><br />
                Vrsta: {selectedMat.vrsta} · Oznaka: {materialPick.oznaka} · Koef: {selectedMat.koeficijent || "—"} · g/m²: {fmt(liveGsm, 2)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label><span style={lbl}>Širina rolne mm</span><input style={input} type="number" value={form.sirina} onChange={(e) => syncFormByMode({ sirina: e.target.value })} /></label>
                <label><span style={lbl}>Smer obračuna</span><select style={input} value={calcMode} onChange={(e) => setCalcMode(e.target.value)}><option value="m_to_kg">Unos m → računaj kg</option><option value="kg_to_m">Unos kg → računaj m</option></select></label>
                <label><span style={lbl}>Metara</span><input style={input} type="number" value={form.duzina} onChange={(e) => syncFormByMode({ duzina: e.target.value })} /></label>
                <label><span style={lbl}>Kilograma</span><input style={input} type="number" value={form.kg} onChange={(e) => syncFormByMode({ kg: e.target.value })} /></label>
                <label><span style={lbl}>Lot / šarža</span><input style={input} value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} /></label>
                <label><span style={lbl}>Lokacija</span><input style={input} value={form.lokacija} onChange={(e) => setForm({ ...form, lokacija: e.target.value })} /></label>
                <label><span style={lbl}>Pod vrsta</span><input style={input} value={form.pod_vrsta} onChange={(e) => setForm({ ...form, pod_vrsta: e.target.value })} placeholder="npr. transparent / beli / metalizovani" /></label>
                <label><span style={lbl}>Datum proizvodnje rolne</span><input style={input} type="date" value={form.datum_proizvodnje} onChange={(e) => setForm({ ...form, datum_proizvodnje: e.target.value })} /></label>
                <label style={{ gridColumn: "1/3" }}><span style={lbl}>Napomena</span><input style={input} value={form.napomena} onChange={(e) => setForm({ ...form, napomena: e.target.value })} /></label>
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ fontWeight: 900 }}>Live obračun</div><div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>kg = širina(m) × dužina(m) × g/m² / 1000</div><div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><div><b>{fmt(calcMode === "m_to_kg" ? calculatedKg : number(form.kg), 2)} kg</b></div><div><b>{fmt(calcMode === "kg_to_m" ? calculatedM : number(form.duzina), 0)} m</b></div></div></div>
              <button onClick={addRoll} style={{ ...btn, background: "#059669", color: "#fff", padding: "13px" }}>+ Dodaj rolnu i generiši QR</button>
            </div>
          </div>
          <div style={card}><div style={{ fontWeight: 900, marginBottom: 12 }}>Šta se upisuje na rolnu</div><div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>{[["Vrsta", selectedMat?.vrsta], ["Oznaka materijala", cleanOznaka(selectedMat?.oznaka || materialPick.oznaka || selectedMat?.komercijalnaOznaka, selectedMat?.vrsta)], ["Pod vrsta", form.pod_vrsta || "—"], ["Proizvođač", selectedMat?.proizvodjac || "—"], ["Debljina", selectedMat?.debljina ? `${selectedMat.debljina} µ` : "—"], ["Širina", `${form.sirina || 0} mm`], ["g/m²", fmt(liveGsm, 2)], ["Metara", fmt(calcMode === "kg_to_m" ? calculatedM : form.duzina, 0)], ["Kilograma", fmt(calcMode === "m_to_kg" ? calculatedKg : form.kg, 2)], ["Datum proizvodnje", form.datum_proizvodnje || "—"]].map(([a,b]) => <div key={a} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>{a}</div><div style={{ fontWeight: 900, marginTop: 3 }}>{b}</div></div>)}</div></div>
        </div>
      )}

      {activeTab === "rolne" && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <div><div style={{ fontWeight: 900 }}>Stanje rolni</div><div style={{ fontSize: 12, color: "#64748b" }}>Izabrano: <b>{selectedRolls.length}</b> rolni</div></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={selectAllFiltered} style={{ ...btn, background: "#e0f2fe", color: "#0369a1" }}>Izaberi filtrirane</button>
              <button onClick={clearSelection} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Poništi izbor</button>
              <button onClick={openBulkLabels} style={{ ...btn, background: "#059669", color: "#fff" }}>🖨️ Štampaj izabrane QR etikete</button>
              <input style={{ ...input, maxWidth: 390 }} placeholder="Globalna pretraga..." value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>{["", "QR", "Datum ulaza", "Datum proiz.", "Vrsta", "Pod vrsta", "Oznaka", "Proizvođač", "Deb.", "Širina", "m", "kg", "Lot", "Lokacija", "Status", "Akcije"].map(h => <th key={h} style={{ padding: 9, textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr>
                <tr style={{ background: "#fff" }}>
                  <th style={filterTh}></th><th style={filterTh}></th>
                  <th style={filterTh}><input style={smallInput} value={columnFilters.datum} onChange={(e) => setColFilter("datum", e.target.value)} placeholder="Datum" /></th>
                  <th style={filterTh}><input style={smallInput} value={columnFilters.datum_proizvodnje} onChange={(e) => setColFilter("datum_proizvodnje", e.target.value)} placeholder="Dat. proiz." /></th>
                  <th style={filterTh}><input style={smallInput} value={columnFilters.vrsta} onChange={(e) => setColFilter("vrsta", e.target.value)} placeholder="Vrsta" /></th>
                  <th style={filterTh}><input style={smallInput} value={columnFilters.pod_vrsta} onChange={(e) => setColFilter("pod_vrsta", e.target.value)} placeholder="Pod vrsta" /></th>
                  <th style={filterTh}><input style={smallInput} value={columnFilters.oznaka} onChange={(e) => setColFilter("oznaka", e.target.value)} placeholder="Oznaka" /></th>
                  <th style={filterTh}><input style={smallInput} value={columnFilters.proizvodjac} onChange={(e) => setColFilter("proizvodjac", e.target.value)} placeholder="Proizvođač" /></th>
                  <th style={filterTh}><input style={smallInput} value={columnFilters.debljina} onChange={(e) => setColFilter("debljina", e.target.value)} placeholder="Deb." /></th>
                  <th style={filterTh}><input style={smallInput} value={columnFilters.sirina} onChange={(e) => setColFilter("sirina", e.target.value)} placeholder="Širina" /></th>
                  <th style={filterTh}><input style={smallInput} value={columnFilters.duzina} onChange={(e) => setColFilter("duzina", e.target.value)} placeholder="m" /></th>
                  <th style={filterTh}><input style={smallInput} value={columnFilters.kg} onChange={(e) => setColFilter("kg", e.target.value)} placeholder="kg" /></th>
                  <th style={filterTh}><input style={smallInput} value={columnFilters.lot} onChange={(e) => setColFilter("lot", e.target.value)} placeholder="Lot" /></th>
                  <th style={filterTh}><input style={smallInput} value={columnFilters.lokacija} onChange={(e) => setColFilter("lokacija", e.target.value)} placeholder="Lokacija" /></th>
                  <th style={filterTh}><select style={smallInput} value={columnFilters.status} onChange={(e) => setColFilter("status", e.target.value)}><option value="">Svi</option><option value="Na stanju">Na stanju</option><option value="Rezervisano">Rezervisano</option><option value="Iskorišćeno">Iskorišćeno</option><option value="formatirana">formatirana</option><option value="blokirana">blokirana</option></select></th>
                  <th style={filterTh}><button onClick={() => { setFilter(""); setColumnFilters({ datum: "", datum_proizvodnje: "", vrsta: "", pod_vrsta: "", oznaka: "", proizvodjac: "", debljina: "", sirina: "", duzina: "", kg: "", lot: "", lokacija: "", status: "" }); }} style={{ ...btn, padding: "7px 9px", background: "#f1f5f9" }}>Reset</button></th>
                </tr>
              </thead>
              <tbody>{filteredRolls.map((r) => <tr key={r.qr}>
                <td style={cell}><input type="checkbox" checked={selectedRolls.includes(r.qr)} onChange={() => toggleSelected(r.qr)} /></td>
                <td style={{ ...cell, fontWeight: 900 }}>{r.qr}</td><td style={cell}>{r.datum_ulaza || r.datum || "—"}</td><td style={cell}>{formatDateLabel(r.datum_proizvodnje) || "—"}</td><td style={cell}>{r.vrsta}</td><td style={cell}>{r.pod_vrsta || "—"}</td><td style={cell}>{rollOznaka(r) || "—"}</td><td style={cell}>{r.proizvodjac || "—"}</td><td style={cell}>{r.debljina || "—"}</td><td style={cell}>{r.sirina} mm</td><td style={cell}>{fmt(r.duzina, 0)}</td><td style={cell}>{fmt(r.kg, 2)}</td><td style={cell}>{r.lot || "—"}</td><td style={cell}>{r.lokacija}</td><td style={cell}><span style={{ background: statusColor(r.status) + "18", color: statusColor(r.status), borderRadius: 999, padding: "4px 8px", fontWeight: 900 }}>{displayStatus(r.status)}</span></td>
                <td style={cell}><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button onClick={() => setLabelRoll(r)} style={{ ...btn, background: "#dbeafe", color: "#1d4ed8" }}>QR / Etiketa</button><button onClick={() => reserveForMaster(r)} style={{ ...btn, background: "#fef3c7", color: "#92400e" }}>Rezerviši</button><button onClick={() => consumeRoll(r)} style={{ ...btn, background: "#fee2e2", color: "#991b1b" }}>Skini m</button><button onClick={() => changeStatus(r, "Na stanju")} style={{ ...btn, background: "#dcfce7", color: "#166534" }}>Na stanju</button></div></td>
              </tr>)}</tbody>
            </table>
            {filteredRolls.length === 0 && <div style={{ textAlign: "center", padding: 24, color: "#64748b" }}>Nema rolni za prikaz.</div>}
          </div>
        </div>
      )}


      {activeTab === "uvoz" && <ImportPackingTab {...{ card, input, btn, lbl, packingText, setPackingText, packingRows, setPackingRows, handlePackingFile, parseTextPackingList, importPackingRows }} />}
      {activeTab === "popis" && <PopisTab {...{ card, input, btn, lbl, popisQr, setPopisQr, findPopisRoll, popisRoll, popisForm, setPopisForm, confirmInventoryCount }} />}
      {activeTab === "predlog" && <PredlogTab {...{ card, input, btn, lbl, req, setReq, createReservationRequest, suggestedRolls, reserveForMaster }} />}
      {activeTab === "istorija" && <div style={card}><div style={{ fontWeight: 900, marginBottom: 10 }}>Istorija rolni</div>{history.length === 0 ? <div style={{ color: "#64748b" }}>Još nema istorije.</div> : history.slice(0, 80).map((h, i) => <div key={i} style={{ borderTop: "1px solid #e2e8f0", padding: "9px 0", fontSize: 13 }}><b>{h.vreme}</b> · <b>{h.qr}</b> · {h.event} · {h.opis}</div>)}</div>}
    </div>
  );
}
const cell = { padding: 9, borderBottom: "1px solid #f1f5f9" };
const filterTh = { padding: 6, borderBottom: "1px solid #e2e8f0" };


function ImportPackingTab({ card, input, btn, lbl, packingText, setPackingText, packingRows, handlePackingFile, parseTextPackingList, importPackingRows }) {
  return <div style={{ display: "grid", gridTemplateColumns: "430px 1fr", gap: 16 }}>
    <div style={card}>
      <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 6 }}>📥 Uvoz packing liste</div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>Podržano: Excel .xlsx/.xls, CSV/TXT. Za PDF možeš nalepiti tekst iz packing liste; skenirani PDF zahteva OCR API.</div>
      <label><span style={lbl}>Excel / CSV / TXT fajl</span><input style={input} type="file" accept=".xlsx,.xls,.csv,.txt,.pdf" onChange={handlePackingFile} /></label>
      <div style={{ marginTop: 12 }}><span style={lbl}>Tekst iz PDF/packing liste</span><textarea style={{ ...input, minHeight: 190, fontFamily: "monospace" }} value={packingText} onChange={(e) => setPackingText(e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={parseTextPackingList} style={{ ...btn, background: "#dbeafe", color: "#1d4ed8" }}>Prepoznaj redove</button>
        <button onClick={importPackingRows} style={{ ...btn, background: "#059669", color: "#fff" }}>Uvezi rolne u magacin</button>
      </div>
    </div>
    <div style={card}>
      <div style={{ fontWeight: 950, marginBottom: 10 }}>Prepoznati redovi · {packingRows.length}</div>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr style={{ background: "#f8fafc" }}>{["Vrsta", "Pod vrsta", "Oznaka", "Proizvođač", "Deb.", "Širina", "m", "kg", "Lot", "Lokacija", "Datum", "Datum proiz."].map(h => <th key={h} style={{ padding: 9, textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
        <tbody>{packingRows.map((r, i) => <tr key={i}><td style={cell}>{r.vrsta || "—"}</td><td style={cell}>{r.pod_vrsta || "—"}</td><td style={cell}>{r.oznaka_materijala || r.komercijalnaOznaka || "—"}</td><td style={cell}>{r.proizvodjac || "—"}</td><td style={cell}>{r.debljina || "—"}</td><td style={cell}>{r.sirina || "—"}</td><td style={cell}>{r.duzina || "—"}</td><td style={cell}>{r.kg || "—"}</td><td style={cell}>{r.lot || "—"}</td><td style={cell}>{r.lokacija || "—"}</td><td style={cell}>{r.datum || "—"}</td><td style={cell}>{formatDateLabel(r.datum_proizvodnje) || "—"}</td></tr>)}</tbody>
      </table></div>
      {packingRows.length === 0 && <div style={{ padding: 20, color: "#64748b", textAlign: "center" }}>Učitaj Excel/CSV ili nalepi tekst packing liste.</div>}
    </div>
  </div>;
}
function PopisTab({ card, input, btn, lbl, popisQr, setPopisQr, findPopisRoll, popisRoll, popisForm, setPopisForm, confirmInventoryCount }) {
  return <div style={{ display: "grid", gridTemplateColumns: "430px 1fr", gap: 16 }}>
    <div style={card}>
      <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 6 }}>📲 QR popis rolni</div>
      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 14 }}>Skeniraj QR čitačem ili nalepi QR sadržaj. Scanner obično radi kao tastatura i pošalje Enter.</div>
      <label><span style={lbl}>QR / Broj rolne</span><input autoFocus style={{ ...input, fontSize: 16, fontWeight: 800 }} value={popisQr} onChange={(e) => setPopisQr(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") findPopisRoll(); }} placeholder="Skeniraj ROLNA-..." /></label>
      <button onClick={findPopisRoll} style={{ ...btn, background: "#2563eb", color: "#fff", marginTop: 10 }}>Pronađi rolnu</button>
    </div>
    <div style={card}>
      {!popisRoll ? <div style={{ color: "#64748b" }}>Nema izabrane rolne za popis.</div> : <>
        <div style={{ fontWeight: 950, marginBottom: 10 }}>{popisRoll.qr}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>{[["Materijal", `${popisRoll.vrsta} · ${popisRoll.komercijalnaOznaka}`], ["Širina", `${popisRoll.sirina} mm`], ["Knjig. m", fmt(popisRoll.duzina, 0)], ["Knjig. kg", fmt(popisRoll.kg, 2)]].map(([a,b]) => <div key={a} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 900 }}>{a}</div><div style={{ fontWeight: 950 }}>{b}</div></div>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <label><span style={lbl}>Stvarno metara</span><input style={input} type="number" value={popisForm.duzina} onChange={(e) => setPopisForm({ ...popisForm, duzina: e.target.value })} /></label>
          <label><span style={lbl}>Stvarno kg</span><input style={input} type="number" value={popisForm.kg} onChange={(e) => setPopisForm({ ...popisForm, kg: e.target.value })} /></label>
          <label><span style={lbl}>Lokacija</span><input style={input} value={popisForm.lokacija} onChange={(e) => setPopisForm({ ...popisForm, lokacija: e.target.value })} /></label>
        </div>
        <button onClick={confirmInventoryCount} style={{ ...btn, background: "#059669", color: "#fff", marginTop: 12 }}>Potvrdi popis i ažuriraj stanje</button>
      </>}
    </div>
  </div>;
}


function MaterialsTab({ card, input, btn, lbl, matForm, setMatForm, saveMaterial, resetDefaultMaterials, matFilter, setMatFilter, filteredMaterials, editMaterial, deleteMaterial }) {
  const [p, setP] = React.useState({ vrsta: "BOPP", oznaka: "FXCB", debljina: 20, proizvodjac: "", cenaKg: "", napomena: "" });
  const vrste = React.useMemo(() => getVrsteMaterijala(), []);
  const oznake = React.useMemo(() => getOznakeZaVrstu(p.vrsta), [p.vrsta]);
  const debljine = React.useMemo(() => getDebljineZaMaterijal(p.vrsta, p.oznaka), [p.vrsta, p.oznaka]);

  React.useEffect(() => {
    const next = getOznakeZaVrstu(p.vrsta);
    const preferred = next.includes(p.oznaka) ? p.oznaka : (next.includes("FXCB") ? "FXCB" : (next[0] || "STANDARD"));
    if (preferred !== p.oznaka) setP((x) => ({ ...x, oznaka: preferred }));
  }, [p.vrsta]);

  React.useEffect(() => {
    const next = getDebljineZaMaterijal(p.vrsta, p.oznaka);
    const preferred = next.includes(Number(p.debljina)) ? Number(p.debljina) : (next.includes(20) ? 20 : (next[0] || 20));
    if (preferred !== Number(p.debljina)) setP((x) => ({ ...x, debljina: preferred }));
  }, [p.vrsta, p.oznaka]);

  const koef = mmKoeficijent(p.vrsta);
  const gsm = mmCalculateGm2(p.vrsta, p.debljina);
  const naziv = mmBuildMaterialName(p.vrsta, p.oznaka, p.debljina);

  function saveFromMaster() {
    const material = normalizeMaterial({
      id: `MAT-${p.vrsta}-${p.oznaka}-${p.debljina}`.replace(/[^A-Za-z0-9_-]/g, "_"),
      vrsta: p.vrsta,
      oznaka: p.oznaka,
      komercijalnaOznaka: naziv,
      proizvodjac: p.proizvodjac,
      debljina: p.debljina,
      koeficijent: koef || 0,
      gsm,
      jedinica: p.vrsta === "PAPIR" ? "g/m²" : "µ",
      cenaKg: p.cenaKg,
      napomena: p.napomena
    });
    setMatForm(material);
    setTimeout(() => saveMaterial(), 0);
  }

  return <div style={{ display: "grid", gridTemplateColumns: "480px 1fr", gap: 16 }}>
    <div style={card}>
      <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 4 }}>🧠 Material Master PRO</div>
      <div style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>Jedini unos materijala: Vrsta → Oznaka → Debljina. Sistem sam računa koeficijent i g/m².</div>
      <div style={{ display: "grid", gap: 10 }}>
        <label><span style={lbl}>Vrsta</span><select style={input} value={p.vrsta} onChange={(e) => setP({ ...p, vrsta: e.target.value })}>{vrste.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        <label><span style={lbl}>Oznaka / komercijalni tip</span><select style={input} value={p.oznaka} onChange={(e) => setP({ ...p, oznaka: e.target.value })}>{oznake.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
        <label><span style={lbl}>{p.vrsta === "PAPIR" ? "Gramatura" : "Debljina"}</span><select style={input} value={p.debljina} onChange={(e) => setP({ ...p, debljina: Number(e.target.value) })}>{debljine.map((d) => <option key={d} value={d}>{d}{p.vrsta === "PAPIR" ? " g/m²" : "µ"}</option>)}</select></label>
        <label><span style={lbl}>Proizvođač</span><input style={input} value={p.proizvodjac} onChange={(e) => setP({ ...p, proizvodjac: e.target.value })} /></label>
        <label><span style={lbl}>Cena €/kg</span><input style={input} type="number" value={p.cenaKg} onChange={(e) => setP({ ...p, cenaKg: e.target.value })} /></label>
        <label><span style={lbl}>Napomena</span><input style={input} value={p.napomena} onChange={(e) => setP({ ...p, napomena: e.target.value })} /></label>

        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 950 }}>{naziv}</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>Koeficijent: <b>{koef || "—"}</b> · g/m²: <b>{fmt(gsm, 2)}</b></div>
        </div>

        <button onClick={saveFromMaster} style={{ ...btn, background: "#059669", color: "#fff", padding: "13px" }}>Sačuvaj materijal</button>
      </div>
    </div>

    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 10, alignItems: "center" }}>
        <div><div style={{ fontWeight: 950 }}>Sačuvani materijali</div><div style={{ color: "#64748b", fontSize: 12 }}>Ovo koriste magacin, kalkulacije, template-i i nalozi.</div></div>
        <input style={{ ...input, maxWidth: 300 }} placeholder="Pretraga materijala" value={matFilter} onChange={(e) => setMatFilter(e.target.value)} />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#f8fafc" }}>{["Vrsta", "Oznaka", "Proizvođač", "Deb.", "Koef.", "g/m²", "€/kg", "Akcije"].map(h => <th key={h} style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
          <tbody>{filteredMaterials.map((m) => <tr key={m.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
            <td style={cell}><b>{m.vrsta}</b></td>
            <td style={cell}>{cleanOznaka(m.oznaka || m.oznaka_materijala || m.komercijalnaOznaka, m.vrsta)}</td>
            <td style={cell}>{m.proizvodjac || "—"}</td>
            <td style={cell}>{m.debljina || "—"}</td>
            <td style={cell}>{m.koeficijent || "—"}</td>
            <td style={cell}><b>{fmt(m.gsm, 2)}</b></td>
            <td style={cell}>{fmt(m.cenaKg, 2)}</td>
            <td style={cell}><button onClick={() => editMaterial(m)} style={{ ...btn, background: "#dbeafe", color: "#1d4ed8" }}>Izmeni</button> <button onClick={() => deleteMaterial(m)} style={{ ...btn, background: "#fee2e2", color: "#991b1b" }}>Obriši</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </div>;
}

function PredlogTab({ card, input, btn, lbl, req, setReq, createReservationRequest, suggestedRolls, reserveForMaster }) {
  return <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}><div style={card}><div style={{ fontWeight: 900, marginBottom: 12 }}>Zahtev materijala za nalog</div><div style={{ display: "grid", gap: 10 }}><label><span style={lbl}>Vrsta materijala</span><input style={input} value={req.vrsta} onChange={(e) => setReq({ ...req, vrsta: e.target.value })} /></label><label><span style={lbl}>Debljina µ</span><input style={input} type="number" value={req.debljina} onChange={(e) => setReq({ ...req, debljina: e.target.value })} /></label><label><span style={lbl}>Potrebna širina mm</span><input style={input} type="number" value={req.sirina} onChange={(e) => setReq({ ...req, sirina: e.target.value })} /></label><label><span style={lbl}>Potrebno metara</span><input style={input} type="number" value={req.potrebniM} onChange={(e) => setReq({ ...req, potrebniM: e.target.value })} /></label><button onClick={createReservationRequest} style={{ ...btn, background: "#2563eb", color: "#fff" }}>Sačuvaj zahtev za nalog</button></div></div><div style={card}><div style={{ fontWeight: 900, marginBottom: 12 }}>Predložene rolne iz magacina</div><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr style={{ background: "#f8fafc" }}>{["QR", "Materijal", "Širina", "m", "kg", "Lokacija", "Ocena", "Akcija"].map(h => <th key={h} style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead><tbody>{suggestedRolls.map((r) => <tr key={r.qr}><td style={cell}><b>{r.qr}</b></td><td style={cell}>{r.vrsta} · {r.komercijalnaOznaka}</td><td style={cell}>{r.sirina} mm</td><td style={cell}>{fmt(r.duzina, 0)}</td><td style={cell}>{fmt(r.kg, 2)}</td><td style={cell}>{r.lokacija}</td><td style={cell}>{r.pokriva ? "✅ Pokriva" : `⚠️ Fali ${fmt(Math.abs(r.ostatak), 0)} m`}</td><td style={cell}><button onClick={() => reserveForMaster(r)} style={{ ...btn, background: "#fef3c7", color: "#92400e" }}>Rezerviši</button></td></tr>)}</tbody></table>{suggestedRolls.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Nema dostupnih rolni koje odgovaraju zahtevu. Dodaj rolnu ili promeni kriterijum.</div>}</div></div></div>;
}
