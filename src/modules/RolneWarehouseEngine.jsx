import React, { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";
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
const WAREHOUSE_OPTIONS = ["Magacin A", "Magacin B", "Magacin C", "Magacin D", "Magacin E", "Magacin F", "Magacin G", "Magacin H"];
const WAREHOUSE_CODES = ["A", "B", "C", "D", "E", "F", "G", "H"];
const ROW_CODES = ["01", "02", "03", "04", "05"];
const SHELF_CODES = ["A", "B", "C", "D"];
const POSITION_CODES = ["01", "02", "03", "04"];
function warehouseToCode(value = "") {
  const v = String(value || "").trim().toUpperCase();
  const m = v.match(/(?:MAGACIN\s*)?([A-H])$/i) || v.match(/^([A-H])(?:-|$)/i);
  return m ? m[1].toUpperCase() : "";
}
function locationMatchesWarehouse(lokacija = "", warehouse = "") {
  const code = warehouseToCode(warehouse);
  const loc = String(lokacija || "").trim().toUpperCase();
  if (!code) return false;
  return loc === code || loc === `MAGACIN ${code}` || loc.startsWith(`${code}-`);
}
function normalizeLocationPart(kind, value) {
  const v = String(value || "").trim().toUpperCase();
  if (kind === "MAGACIN") return WAREHOUSE_CODES.includes(v) ? v : "";
  if (kind === "RED") return ROW_CODES.includes(v.padStart(2, "0")) ? v.padStart(2, "0") : "";
  if (kind === "POLICA") return SHELF_CODES.includes(v) ? v : "";
  if (kind === "POZICIJA") return POSITION_CODES.includes(v.padStart(2, "0")) ? v.padStart(2, "0") : "";
  return "";
}
function buildLocationCode(parts = {}) {
  const magacin = normalizeLocationPart("MAGACIN", parts.magacin);
  const red = normalizeLocationPart("RED", parts.red);
  const polica = normalizeLocationPart("POLICA", parts.polica);
  const pozicija = normalizeLocationPart("POZICIJA", parts.pozicija);
  return magacin && red && polica && pozicija ? `${magacin}-${red}-${polica}-${pozicija}` : "";
}

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
function pick(obj = {}, keys = [], fallback = "") {
  const source = obj || {};
  const lowerMap = Object.keys(source).reduce((acc, k) => { acc[String(k).toLowerCase().trim()] = source[k]; return acc; }, {});
  for (const key of keys) {
    const direct = source[key];
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") return direct;
    const lowered = lowerMap[String(key).toLowerCase().trim()];
    if (lowered !== undefined && lowered !== null && String(lowered).trim() !== "") return lowered;
  }
  return fallback;
}
function parseMaropackQr(value) {
  const raw = String(value || "").trim();
  if (!raw) return { kind: "", value: "", raw };
  const parts = raw.split("|").map((x) => x.trim());
  if (parts[0] === "MAROPACK" && parts.length >= 3) {
    const kind = String(parts[1] || "").toUpperCase();
    const value = parts.slice(2).join("|").trim();
    return { kind, value, raw };
  }
  try {
    const parsed = JSON.parse(raw);
    const code = parsed.qr || parsed.qr_code || parsed.br_rolne || parsed.rola || parsed.roll;
    if (code) return { kind: "ROLNA", value: String(code).trim(), raw };
  } catch {}
  return { kind: "ROLNA", value: extractQrFromScan(raw), raw };
}
function rollQrPayload(r) {
  // QR etiketa nosi stabilan MAROPACK format.
  // U QR-u je samo ključ rolne, a podaci se posle skeniranja čitaju iz Supabase magacin tabele.
  const code = String(r?.qr || r?.qr_code || r?.br_rolne || r?.broj_rolne || r?.id || "").trim();
  return code ? `MAROPACK|ROLNA|${code}` : "";
}
function normalizePackingRow(row = {}) {
  return {
    br_rolne: String(pick(row, ["br_rolne", "broj rolne", "roll no", "roll_no", "reel", "reel code", "qr"])),
    qr: String(pick(row, ["qr", "br_rolne", "broj rolne", "roll no", "roll_no", "reel code"])),
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
    kg: number(pick(row, ["kg", "kilograma", "net weight", "net", "weight", "tezina", "težina"])),
    kg_bruto: number(pick(row, ["kg_bruto", "gross weight", "gross", "bruto"])),
    palet: String(pick(row, ["palet", "pallet", "pallet no", "plt.no"])),
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

function parseNumSmart(value) {
  let v = String(value ?? "").trim().replace(/\s+/g, "");
  if (!v) return 0;
  // 1.020 u italijanskim/rossella dokumentima je 1020, dok 904,0 znači 904.0
  if (v.includes(",")) return Number(v.replace(/\./g, "").replace(",", ".")) || 0;
  if (/^\d{1,3}\.\d{3}$/.test(v)) return Number(v.replace(".", "")) || 0;
  return Number(v) || 0;
}
function detectVrstaFromText(text, fallback = "") {
  const t = String(text || fallback || "").toUpperCase();
  if (t.includes("BOPA")) return "BOPA";
  if (t.includes("BOPP")) return "BOPP";
  if (t.includes("PET")) return "PET";
  if (t.includes("CPP")) return "CPP";
  if (t.includes("CLAY COATED") || t.includes("PAPIR") || t.includes("PAPER")) return "PAPIR";
  if (t.includes("LDPE") || t.includes("PE")) return "LDPE";
  return fallback || "Nedefinisano";
}
function coeffByVrsta(vrsta) {
  const v = String(vrsta || "").toUpperCase();
  if (v.includes("BOPA") || v.includes("OPA") || v.includes("PA")) return 1.14;
  if (v.includes("PET")) return 1.4;
  if (v.includes("ALU")) return 2.71;
  if (v.includes("PE") || v.includes("LDPE")) return 0.925;
  return 0.91;
}
function calcMetersFromKgFallback({ kg, sirina, debljina, vrsta, gsm }) {
  const g = number(gsm) || number(debljina) * coeffByVrsta(vrsta);
  return metersFromKg({ sirinaMm: sirina, kg, gsm: g });
}
function parsePlastchimPacking(text = "") {
  const rows = [];
  const date = (text.match(/Packing list Date:\s*([0-9.]+)/i) || [])[1] || "";
  const product = (text.match(/PRODUCT:\s*([^\n]+)/i) || [])[1] || "BOPP film";
  const vrsta = detectVrstaFromText(product, "BOPP");
  let pallet = "";
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim().replace(/\s+/g, " ");
    const pm = line.match(/^Pallet:\s*([^\s]+)/i);
    if (pm) pallet = pm[1];
    const m = line.match(/^(\d{6,})\s+([0-9.]+)\s+([A-Z0-9]+)\s+(\d+(?:[.,]\d+)?)\s+(\d{1,2}\s?\d{3}|\d{3,4})\s+(\d+)\s+(\d+)\s+(\d{1,3}\s?\d{3}|\d{3,6})\s+([\d.,]+)\s+([\d.,]+)/);
    if (!m) continue;
    const rollNo = m[1];
    const orderNo = m[2];
    const oznaka = m[3];
    const debljina = parseNumSmart(m[4]);
    const sirina = parseNumSmart(m[5]);
    const inner = parseNumSmart(m[6]);
    const outer = parseNumSmart(m[7]);
    const duzina = parseNumSmart(m[8]);
    const kg = parseNumSmart(m[9]);
    const kgBruto = parseNumSmart(m[10]);
    rows.push({ br_rolne: rollNo, qr: rollNo, vrsta, pod_vrsta: "", oznaka_materijala: oznaka, komercijalnaOznaka: oznaka, proizvodjac: "Plastchim-T", debljina, sirina, duzina, kg, kg_bruto: kgBruto, lot: orderNo, palet: pallet, hilzna_mm: inner, spoljasnji_precnik_mm: outer, datum: date });
  }
  return rows;
}
function parseTaghleefPacking(text = "") {
  const rows = [];
  const date = (text.match(/Date:\s*([0-9.]+)/i) || [])[1] || "";
  const flat = String(text).replace(/\s+/g, " ");
  const re = /(\d{9})\s+(\d{12,})\s+([A-Z0-9\s]+?)\s+(\d+(?:,\d+)?)\s+(\d{4,6})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d{2}\.\d{2}\.\d{4})/g;
  let m;
  while ((m = re.exec(flat))) {
    const palletNo = m[1];
    const reelCode = m[2];
    const item = m[3].trim();
    const kg = parseNumSmart(m[4]);
    const duzina = parseNumSmart(m[5]);
    const inner = parseNumSmart(m[6]);
    const outer = parseNumSmart(m[7]);
    const prodDate = m[9];
    const tokens = item.split(/\s+/);
    let sirina = 0, debljina = 0;
    for (let i = tokens.length - 1; i >= 1; i--) {
      if (/^\d{3,4}$/.test(tokens[i])) { sirina = parseNumSmart(tokens[i]); debljina = parseNumSmart(tokens[i - 1]); break; }
    }
    const oznaka = tokens.filter(t => !/^\d+$/.test(t) && t !== "TO").join(" ") || "Taghleef";
    rows.push({ br_rolne: palletNo, qr: palletNo, vrsta: detectVrstaFromText(item, "BOPP"), pod_vrsta: tokens[1] || "", oznaka_materijala: oznaka, komercijalnaOznaka: oznaka, proizvodjac: "Taghleef", debljina, sirina, duzina, kg, lot: reelCode, palet: palletNo, hilzna_mm: inner, spoljasnji_precnik_mm: outer, datum, datum_proizvodnje: prodDate });
  }
  return rows;
}
function parseInterGradexPacking(text = "") {
  const rows = [];
  const date = (text.match(/Datum:\s*([0-9.]+)/i) || [])[1] || "";
  let current = null;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim().replace(/\s+/g, " ");
    const header = line.match(/^\d{4}\s+(.+?)\s+[\d.,]+\s*Kg$/i);
    if (header) {
      const desc = header[1];
      const dim = desc.match(/(\d{3,4})\s*[Xx]\s*(\d+(?:[.,]\d+)?)/);
      const vrsta = detectVrstaFromText(desc, "");
      const oznaka = (desc.match(/FILM\s+([A-Z0-9\s-]+?)\s*-?\s*\d{3,4}\s*[Xx]/i) || [])[1]?.trim() || vrsta;
      current = { vrsta, oznaka_materijala: cleanOznaka(oznaka, vrsta), sirina: dim ? parseNumSmart(dim[1]) : 0, debljina: dim ? parseNumSmart(dim[2]) : 0 };
      continue;
    }
    const r = line.match(/^0*(\d{6,})\s+([\d.,]+)\s*Kg\s+(\S+)\s+(.+)$/i);
    if (r && current) {
      const kg = parseNumSmart(r[2]);
      const duzina = current.sirina && current.debljina ? calcMetersFromKgFallback({ kg, sirina: current.sirina, debljina: current.debljina, vrsta: current.vrsta }) : 0;
      rows.push({ br_rolne: r[1], qr: r[1], ...current, komercijalnaOznaka: current.oznaka_materijala, proizvodjac: "Inter Gradex", kg, duzina, lot: r[3], datum });
    }
  }
  return rows;
}
function parseRossellaPacking(text = "") {
  const rows = [];
  const date = (text.match(/1\/\s*704\s*([0-9/]+)/i) || text.match(/(\d{2}\/\d{2}\/\d{4})/) || [])[1] || "";
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let gross = 0, net = 0, pallet = "", sch = "";
  for (const line of lines) {
    const g = line.match(/Gross wt\. Kg:\s*([\d.]+)\s+Net wt\. Kg:\s*([\d.]+)/i);
    if (g) { gross = parseNumSmart(g[1]); net = parseNumSmart(g[2]); continue; }
    const p = line.match(/Pallet\s*:\s*(\d+).*?Sch\.:\s*([^\s]+)/i);
    if (p) { pallet = p[1]; sch = p[2]; continue; }
    if (/CLAY COATED/i.test(line)) {
      const mm = line.match(/(\d{2,3})g\s*-\s*(\d{3,4})mm/i);
      const len = line.match(/U\d+\/\d+\s+1\s+([\d.]+)/i) || line.match(/\s1\s+([\d.]+)\s+[\d.,]+\s+[\d.,]+\s+[\d.]+$/);
      const debljina = mm ? parseNumSmart(mm[1]) : 0;
      const sirina = mm ? parseNumSmart(mm[2]) : 0;
      const duzina = len ? parseNumSmart(len[1]) : 0;
      if (pallet && sirina && (duzina || net)) {
        rows.push({ br_rolne: String(pallet), qr: String(pallet), vrsta: "PAPIR", pod_vrsta: "Clay coated white", oznaka_materijala: `CC White ${debljina}g`, komercijalnaOznaka: `CC White ${debljina}g`, proizvodjac: "Rossella", debljina: 0, gsm: debljina, sirina, duzina, kg: net, kg_bruto: gross, lot: sch, palet: pallet, datum });
      }
    }
  }
  return rows;
}
function ParserPlastchim(text = "") { return parsePlastchimPacking(text); }
function ParserTaghleef(text = "") { return parseTaghleefPacking(text); }
function ParserInterGradex(text = "") { return parseInterGradexPacking(text); }
function ParserRossella(text = "") { return parseRossellaPacking(text); }

function parseUniversalPackingText(text = "") {
  const t = String(text || "");
  let rows = [];
  if (/PLASTCHIM|Packing list Date|Film Type Thikness/i.test(t)) rows = parsePlastchimPacking(t);
  else if (/Taghleef|CSOMAGLISTA|NATIVIA/i.test(t)) rows = parseTaghleefPacking(t);
  else if (/Inter Gradex|LISTA PAKOV/i.test(t)) rows = parseInterGradexPacking(t);
  else if (/Rossella|Shipping Packing List|CLAY COATED/i.test(t)) rows = parseRossellaPacking(t);
  if (!rows.length) rows = parsePackingText(t);
  return rows.map(normalizePackingRow).map((r, i) => ({ ...r, br_rolne: r.br_rolne || r.qr || r.roll_no || makeId("ROLNA"), qr: r.qr || r.br_rolne || r.roll_no || makeId("ROLNA") }));
}
function loadPdfJsGlobal() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      if (!window.pdfjsLib) return reject(new Error("PDF.js nije učitan"));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Ne mogu da učitam PDF parser. Proveri internet konekciju."));
    document.head.appendChild(script);
  });
}
async function extractPdfTextFromFile(file) {
  const pdfjsLib = await loadPdfJsGlobal();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((x) => x.str || "").join(" ") + "\n";
  }
  return text;
}
function extractQrFromScan(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("MAROPACK|ROLNA|")) return raw.split("|").slice(2).join("|").trim();
  if (/^MAROPACK\|(MAGACIN|RED|POLICA|POZICIJA)\|/i.test(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return String(parsed.qr || parsed.qr_code || parsed.br_rolne || parsed.rola || parsed.roll || raw).trim();
  } catch {
    const match = raw.match(/ROLNA[-_A-Z0-9]+|R-[0-9A-Za-z_.;:-]+/i);
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
          <QRCodeSVG value={rollQrPayload(roll)} size={150} level="M" includeMargin={true} />
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

export default function RolneWarehouseEngine({ db = {}, msg, forceMobile = false }) {
  const auth = useAuth?.();
  const isAdminUser = auth?.isAdmin || auth?.userProfile?.uloga === "admin";
  const [activeTab, setActiveTab] = useState("rolne");
  const [inputMode, setInputMode] = useState("rucno");
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
  const [popisMagacin, setPopisMagacin] = useState("Magacin A");
  const [popisSessionId, setPopisSessionId] = useState(() => `POPIS-${new Date().toISOString().slice(0,10)}-${Date.now().toString().slice(-6)}`);
  const [popisScanned, setPopisScanned] = useState({});
  const [povratQr, setPovratQr] = useState("");
  const [povratRoll, setPovratRoll] = useState(null);
  const [povratForm, setPovratForm] = useState({ hilzna: "FI76", spoljasnjiPrecnik: "", lokacija: "Magacin", napomena: "Povrat u magacin" });
  const [scannerMode, setScannerMode] = useState(null); // "popis" | "povrat" | "lokacija"
  const [locationDraft, setLocationDraft] = useState({ magacin: "", red: "", polica: "", pozicija: "" });

  async function reload() {
    const mats = ensureMaterials().map(normalizeMaterial);
    safeWrite(LS_MATERIJALI, mats);
    setMaterijali(mats);

    let sourceRolls = [];
    let loadedFromSupabase = false;
    try {
      if (!supabase?.__localDemo) {
        const { data, error } = await supabase
          .from("magacin")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        sourceRolls = (data || []).map(mapDbRollToEngine);
        loadedFromSupabase = true;
      }
    } catch (e) {
      console.error("Učitavanje rolni iz Supabase magacin nije uspelo:", e);
      msg?.("Ne mogu da učitam stanje rolni iz Supabase: " + (e?.message || e), "err");
    }

    // VAŽNO: kada Supabase radi, desktop i telefon moraju da pokazuju isto stanje.
    // Ne mešamo više stare localStorage rolne sa public.magacin, jer to pravi razliku 29 vs 18 rolni.
    if (!loadedFromSupabase) {
      const localRolls = safeRead(LS_ROLNE, []).map(mapDbRollToEngine);
      const dbRolls = Array.isArray(db?.rolne) ? db.rolne.map(mapDbRollToEngine) : [];
      sourceRolls = [...dbRolls, ...localRolls]
        .filter((x, i, arr) => x && i === arr.findIndex(y => String(y.qr || y.id) === String(x.qr || x.id)));
    }

    setRolne(sourceRolls);
    if (!loadedFromSupabase) safeWrite(LS_ROLNE, sourceRolls);
    setHistory(safeRead(LS_HISTORY, []));
    if (!selectedMatId && mats[0]) setSelectedMatId(mats[0].id);
  }
  useEffect(() => { reload(); }, []);
  useEffect(() => { reload(); }, [db?.rolne?.length]);
  useEffect(() => {
    if (!isAdminUser) return;
    const key = "maropack_last_auto_magacin_backup";
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(key) === today) return;
    localStorage.setItem(key, today);
    setTimeout(() => createWarehouseBackup("auto-daily"), 1500);
  }, [isAdminUser, rolne.length]);
  useEffect(() => {
    setPopisForm((f) => ({ ...f, lokacija: f.lokacija || popisMagacin }));
  }, [popisMagacin]);

  function findRollLocalByQr(qrValue) {
    const qr = extractQrFromScan(qrValue);
    return rolne.find((r) => {
      const keys = [r.qr, r.qr_code, r.br_rolne, r.broj_rolne, rollQrPayload(r)];
      return keys.some((k) => String(extractQrFromScan(k) || "").trim() === String(qr || "").trim());
    }) || null;
  }

  async function fetchRollFromSupabaseByQr(qrValue) {
    const qr = extractQrFromScan(qrValue);
    if (!qr || supabase?.__localDemo) return null;
    try {
      let { data, error } = await supabase
        .from("magacin")
        .select("*")
        .eq("br_rolne", qr)
        .limit(1);
      if (error) throw error;
      if (!data?.[0]) {
        const res = await supabase
          .from("magacin")
          .select("*")
          .eq("qr_code", qr)
          .limit(1);
        if (res.error) throw res.error;
        data = res.data;
      }
      return data?.[0] ? mapDbRollToEngine(data[0]) : null;
    } catch (e) {
      console.error("QR lookup iz Supabase magacin nije uspeo:", e);
      msg?.("Ne mogu da proverim QR u Supabase: " + (e?.message || e), "err");
      return null;
    }
  }

  async function resolveRollByQr(qrValue) {
    const local = findRollLocalByQr(qrValue);
    if (local) return local;
    const fresh = await fetchRollFromSupabaseByQr(qrValue);
    if (fresh) {
      setRolne((prev) => {
        const next = [fresh, ...prev.filter((r) => String(r.qr) !== String(fresh.qr))];
        safeWrite(LS_ROLNE, next);
        return next;
      });
      return fresh;
    }
    return null;
  }

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

  const popisExpectedRolls = useMemo(() => {
    return rolne.filter((r) => isRollVisibleOnStock(r) && locationMatchesWarehouse(r.lokacija, popisMagacin));
  }, [rolne, popisMagacin]);

  const popisCountedRows = useMemo(() => {
    return Object.values(popisScanned || {}).filter(Boolean);
  }, [popisScanned]);

  const popisMissingRolls = useMemo(() => {
    const counted = new Set(popisCountedRows.map((x) => String(x.qr || "")));
    return popisExpectedRolls.filter((r) => !counted.has(String(r.qr || "")));
  }, [popisExpectedRolls, popisCountedRows]);

  const popisExtraRows = useMemo(() => {
    return popisCountedRows.filter((x) => !locationMatchesWarehouse(x.ocekivana_lokacija, popisMagacin));
  }, [popisCountedRows, popisMagacin]);

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

  async function saveRollLocation(roll, novaLokacija, reason = "PROMENA LOKACIJE") {
    if (!roll || !novaLokacija) { msg?.("Prvo skeniraj rolnu i lokaciju", "err"); return null; }
    const oldLocation = roll.lokacija || "";
    const updated = { ...roll, lokacija: novaLokacija, datum_poslednje_promene: now() };
    try {
      if (!supabase?.__localDemo && roll.id) {
        const { data, error } = await supabase
          .from("magacin")
          .update({ lokacija: novaLokacija, updated_at: new Date().toISOString() })
          .eq("id", roll.id)
          .select("*")
          .single();
        if (error) throw error;
        if (data) Object.assign(updated, mapDbRollToEngine(data));
        await supabase.from("istorija_lokacija_rolni").insert({
          rolna_id: roll.id,
          br_rolne: roll.br_rolne || roll.qr,
          stara_lokacija: oldLocation,
          nova_lokacija: novaLokacija,
          korisnik: "magacioner",
          napomena: reason,
        });
      }
    } catch (e) {
      console.error(e);
      msg?.("Promena lokacije nije upisana u Supabase: " + (e?.message || e), "err");
    }
    setRolne((prev) => prev.map((x) => String(x.qr) === String(roll.qr) ? updated : x));
    setHistory((prev) => [{ vreme: now(), qr: updated.qr, event: reason, opis: `${oldLocation || "—"} → ${novaLokacija}`, stanje: updated.status }, ...prev]);
    msg?.(`Lokacija ažurirana: ${updated.qr} → ${novaLokacija}`);
    return updated;
  }

  function coreEffectiveDiameter(hilzna) {
    return hilzna === "FI152" ? 180 : 100;
  }

  function estimateMetersFromDiameter(roll, outerDiameterMm, hilzna) {
    const D = number(outerDiameterMm);
    const d = coreEffectiveDiameter(hilzna);
    const thicknessMm = Math.max(number(roll?.debljina || roll?.deb || 0) / 1000, 0.001);
    if (!D || D <= d) return 0;
    return Math.max(0, Math.round((Math.PI * (D * D - d * d)) / (4 * thicknessMm) / 1000));
  }

  function estimateKgForMeters(roll, meters) {
    const sirina = number(roll?.sirina || 0);
    const gsm = number(roll?.gsm || (number(roll?.debljina || roll?.deb || 0) * 0.91));
    if (!sirina || !meters || !gsm) return number(roll?.kg || roll?.kg_neto || 0);
    return Math.round((sirina * meters * gsm / 1000000) * 100) / 100;
  }

  async function findPovratRoll() {
    const q = String(povratQr || "").trim();
    if (!q) { msg?.("Skeniraj ili unesi QR broj rolne", "err"); return; }
    const found = await resolveRollByQr(q);
    if (!found) { msg?.("Rolna nije pronađena u magacinu", "err"); return; }
    setPovratRoll(found);
    setPovratForm((f) => ({ ...f, lokacija: found.lokacija || "Magacin" }));
  }

  async function confirmReturnToWarehouse(overrides = {}) {
    if (!povratRoll) { msg?.("Prvo pronađi rolnu", "err"); return; }
    const diameterValue = overrides.spoljasnjiPrecnik ?? povratForm.spoljasnjiPrecnik;
    const hilznaValue = overrides.hilzna ?? povratForm.hilzna;
    const lokacijaValue = overrides.lokacija ?? povratForm.lokacija;
    const napomenaValue = overrides.napomena ?? povratForm.napomena;
    const meters = estimateMetersFromDiameter(povratRoll, diameterValue, hilznaValue);
    if (!meters || meters <= 0) { msg?.("Unesi ispravan spoljašnji prečnik veći od hilzne", "err"); return; }
    const kg = estimateKgForMeters(povratRoll, meters);
    const updated = { ...povratRoll, duzina: meters, metraza_ost: meters, kg, kg_neto: kg, status: "Na stanju", lokacija: lokacijaValue || povratRoll.lokacija || "Magacin", datum_poslednje_promene: now(), napomena: napomenaValue || "Povrat u magacin" };
    try {
      if (!supabase?.__localDemo && povratRoll.id) {
        const { data, error } = await supabase.from("magacin")
          .update({ metraza: meters, metraza_ost: meters, kg_neto: kg, status: "Na stanju", lokacija: updated.lokacija, napomena: updated.napomena, updated_at: new Date().toISOString() })
          .eq("id", povratRoll.id)
          .select("*")
          .single();
        if (error) throw error;
        if (data) Object.assign(updated, mapDbRollToEngine(data));
      }
    } catch (e) {
      console.error(e);
      msg?.("Supabase update povrata nije uspeo: " + (e?.message || e), "err");
    }
    const next = rolne.map((x) => (x.qr === povratRoll.qr ? updated : x));
    const hist = [{ vreme: now(), qr: updated.qr, event: "POVRAT U MAGACIN", opis: `Hilzna ${hilznaValue} (${coreEffectiveDiameter(hilznaValue)} mm), spoljašnji prečnik ${diameterValue} mm, obračunato ${fmt(meters,0)} m`, stanje: "Na stanju" }, ...history];
    safeWrite(LS_ROLNE, next); safeWrite(LS_HISTORY, hist); setRolne(next); setHistory(hist); setLabelRoll(updated);
    msg?.(`Povrat evidentiran: ${updated.qr} · ${fmt(meters, 0)} m · ${fmt(kg, 2)} kg`);
    setPovratRoll(updated);
  }


  async function downloadWarehouseBackupFile(prefix = "magacin-backup") {
    const payload = {
      created_at: new Date().toISOString(),
      total_rolni: rolne.length,
      rolne,
      materijali,
      history,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return payload;
  }

  async function createWarehouseBackup(type = "manual") {
    const payload = await downloadWarehouseBackupFile(`maropack-${type}-magacin`);
    try {
      if (!supabase?.__localDemo) {
        await supabase.from("magacin_backup_snapshots").insert({
          snapshot_type: type,
          data: payload,
          created_by: auth?.userProfile?.email || auth?.user?.email || "admin",
        });
      }
      msg?.("Backup magacina je napravljen.");
    } catch (e) {
      console.warn("Backup tabela nije dostupna ili RLS blokira upis:", e);
      msg?.("Backup JSON je skinut na računar. Za upis u bazu proveri SQL tabelu magacin_backup_snapshots.", "err");
    }
  }

  async function deleteWarehouseRoll(r) {
    if (!isAdminUser) { msg?.("Samo admin može da briše rolne", "err"); return; }
    const code = r?.br_rolne || r?.qr || r?.qr_code;
    if (!code) return;
    if (!confirm(`Obrisati rolnu ${code}? Pre brisanja će biti napravljen backup.`)) return;
    await createWarehouseBackup("pre-delete-roll");
    try {
      if (!supabase?.__localDemo && r.id) {
        const { error } = await supabase.from("magacin").delete().eq("id", r.id);
        if (error) throw error;
      }
      setRolne((prev) => prev.filter((x) => String(x.id) !== String(r.id) && String(x.qr) !== String(r.qr)));
      msg?.(`Rolna ${code} je obrisana.`);
    } catch (e) {
      console.error(e);
      msg?.("Brisanje rolne nije uspelo: " + (e?.message || e), "err");
    }
  }

  async function resetWarehouseData() {
    if (!isAdminUser) { msg?.("Samo admin može da resetuje magacin", "err"); return; }
    const phrase = prompt("Ovo briše sve rolne iz public.magacin. Unesi tačno: RESET MAGACIN");
    if (phrase !== "RESET MAGACIN") { msg?.("Reset otkazan."); return; }
    await createWarehouseBackup("pre-reset-magacin");
    try {
      if (!supabase?.__localDemo) {
        await supabase.from("istorija_lokacija_rolni").delete().not("id", "is", null);
        const { error } = await supabase.from("magacin").delete().not("id", "is", null);
        if (error) throw error;
      }
      safeWrite(LS_ROLNE, []);
      setRolne([]);
      msg?.("Magacin je resetovan. Backup je napravljen pre brisanja.");
    } catch (e) {
      console.error(e);
      msg?.("Reset magacina nije uspeo: " + (e?.message || e), "err");
    }
  }

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
        const rows = parseUniversalPackingText(text);
        setPackingRows(rows);
        msg?.(`Učitano ${rows.length} redova iz tekstualne packing liste.`);
      } else if (name.endsWith(".pdf")) {
        const text = await extractPdfTextFromFile(file);
        setPackingText(text);
        const rows = parseUniversalPackingText(text);
        setPackingRows(rows);
        msg?.(`PDF packing lista pročitana: ${rows.length} rolni prepoznato.`);
      } else {
        msg?.("Podržano: Excel .xlsx/.xls, CSV/TXT. Za PDF nalepi tekst ili koristi OCR workflow.", "err");
      }
    } catch (err) {
      msg?.(`Greška kod uvoza packing liste: ${err.message}`, "err");
    }
    e.target.value = "";
  }
  function parseTextPackingList() {
    const rows = parseUniversalPackingText(packingText);
    setPackingRows(rows);
    msg?.(`Prepoznato ${rows.length} redova iz teksta.`);
  }
  async function importPackingRows() {
    if (!packingRows.length) { msg?.("Nema redova za uvoz", "err"); return; }
    let mats = [...materijali];
    let count = 0;
    const importedLocal = [];

    for (const row of packingRows) {
      const baseGsm = row.gsm || (row.debljina && row.koeficijent ? row.debljina * row.koeficijent : 0);
      let mat = mats.find((m) =>
        String(m.vrsta).toLowerCase() === String(row.vrsta).toLowerCase()
        && String(m.komercijalnaOznaka || m.oznaka || m.oznaka_materijala).toLowerCase() === String(row.komercijalnaOznaka || row.oznaka_materijala).toLowerCase()
        && (!row.debljina || number(m.debljina) === number(row.debljina))
      );
      if (!mat) {
        mat = normalizeMaterial({
          vrsta: row.vrsta || "Nedefinisano",
          oznaka: cleanOznaka(row.oznaka_materijala || row.komercijalnaOznaka || row.vrsta || "", row.vrsta),
          oznaka_materijala: cleanOznaka(row.oznaka_materijala || row.komercijalnaOznaka || row.vrsta || "", row.vrsta),
          komercijalnaOznaka: cleanOznaka(row.oznaka_materijala || row.komercijalnaOznaka || row.vrsta || "Materijal iz packing liste", row.vrsta),
          proizvodjac: row.proizvodjac || "",
          debljina: row.debljina,
          koeficijent: row.koeficijent || coeffByVrsta(row.vrsta),
          gsm: baseGsm,
          jedinica: baseGsm && !row.debljina ? "g/m²" : "µ",
        });
        mats = [mat, ...mats];
      }
      const gsm = calcGsm(mat) || row.gsm || baseGsm;
      const duzina = row.duzina || (row.kg && row.sirina && gsm ? metersFromKg({ sirinaMm: row.sirina, kg: row.kg, gsm }) : 0);
      const kg = row.kg || (row.duzina && row.sirina && gsm ? kgFromMeters({ sirinaMm: row.sirina, duzinaM: row.duzina, gsm }) : 0);
      if (!row.sirina || (!duzina && !kg)) continue;

      const brRolne = String(row.br_rolne || row.qr || makeId("ROLNA")).trim();
      const cleanCode = cleanOznaka(row.oznaka_materijala || mat.oznaka || mat.komercijalnaOznaka, mat.vrsta);
      let item = null;
      try {
        if (!supabase?.__localDemo) {
          const { data, error } = await supabase.from("magacin").insert({
            br_rolne: brRolne,
            tip: mat.vrsta,
            vrsta: mat.vrsta,
            pod_vrsta: row.pod_vrsta || null,
            oznaka_materijala: cleanCode,
            deb: mat.debljina || row.debljina || 0,
            sirina: number(row.sirina),
            metraza: duzina,
            metraza_ost: duzina,
            kg_bruto: row.kg_bruto || kg,
            kg_neto: kg,
            lot: row.lot || null,
            dobavljac: mat.proizvodjac || row.proizvodjac || null,
            datum: new Date().toISOString().slice(0, 10),
            datum_prijema: new Date().toISOString().slice(0, 10),
            datum_proizvodnje: row.datum_proizvodnje || null,
            status: "Na stanju",
            qr_code: brRolne,
            lokacija: row.lokacija || "Magacin",
            palet: row.palet || null,
            napomena: `Uvoz packing liste${row.datum ? " · dokument: " + row.datum : ""}`,
          }).select("*").single();
          if (error) throw error;
          item = mapDbRollToEngine(data);
        }
      } catch (e) {
        console.error(e);
        msg?.(`Supabase uvoz rolne ${brRolne} nije uspeo: ${e?.message || e}`, "err");
      }
      if (!item) {
        item = addWarehouseRoll({
          qr: brRolne, materijal_id: mat.id, vrsta: mat.vrsta, pod_vrsta: row.pod_vrsta || "",
          oznaka_materijala: cleanCode,
          materijal: mat.vrsta, komercijalnaOznaka: cleanCode,
          proizvodjac: mat.proizvodjac || row.proizvodjac,
          debljina: mat.debljina || row.debljina,
          koeficijent: mat.koeficijent || row.koeficijent,
          gsm, sirina: row.sirina, duzina, kg, lot: row.lot, lokacija: row.lokacija || "Magacin", datum: row.datum || new Date().toLocaleDateString("sr-RS"), datum_proizvodnje: row.datum_proizvodnje || "", status: "Na stanju",
          napomena: "Uvoz iz packing liste"
        }, "UVOZ PACKING LISTE");
      }
      importedLocal.push(item);
      count += 1;
    }

    safeWrite(LS_MATERIJALI, mats);
    setMaterijali(mats);
    await reload();
    msg?.(`Uvezeno ${count} rolni iz packing liste.`);
  }
  async function handleMobileScan(decodedText) {
    const parsed = parseMaropackQr(decodedText);
    const kind = String(parsed.kind || "").toUpperCase();

    if (["MAGACIN", "RED", "POLICA", "POZICIJA"].includes(kind)) {
      const part = normalizeLocationPart(kind, parsed.value);
      if (!part) { msg?.(`QR lokacije nije validan: ${decodedText}`, "err"); setScannerMode(null); return; }
      const keyMap = { MAGACIN: "magacin", RED: "red", POLICA: "polica", POZICIJA: "pozicija" };
      setLocationDraft((prev) => {
        const next = { ...prev, [keyMap[kind]]: part };
        const lok = buildLocationCode(next);
        if (lok) {
          setPopisForm((f) => ({ ...f, lokacija: lok }));
          setPovratForm((f) => ({ ...f, lokacija: lok }));
          msg?.(`Skenirana lokacija: ${lok}`);
        } else {
          msg?.(`Skenirano ${kind}: ${part}. Nastavi sa ostalim QR oznakama lokacije.`);
        }
        return next;
      });
      setScannerMode(null);
      return;
    }

    const qr = extractQrFromScan(decodedText);
    if (!qr) {
      msg?.("QR kod nije prepoznat", "err");
      setScannerMode(null);
      return;
    }

    const found = await resolveRollByQr(qr);

    if (scannerMode === "povrat") {
      setPovratQr(qr);
      if (found) {
        setPovratRoll(found);
        setPovratForm((f) => ({ ...f, lokacija: f.lokacija || found.lokacija || "Magacin" }));
        msg?.(`Skenirana rolna za povrat: ${qr}`);
      } else {
        msg?.(`Rolna nije pronađena u magacinu: ${qr}`, "err");
      }
    } else {
      setPopisQr(qr);
      if (found) {
        setPopisRoll(found);
        setPopisForm({ duzina: found.duzina, kg: found.kg, lokacija: found.lokacija || popisMagacin || "" });
        msg?.(`Skenirana rolna za popis: ${qr}`);
      } else {
        msg?.(`Rolna nije pronađena u magacinu: ${qr}`, "err");
      }
    }
    setScannerMode(null);
  }

  function openMobileScanner(mode) {
    setScannerMode(mode);
    if (mode === "povrat") setActiveTab("povrat");
    else if (mode === "popis") setActiveTab("popis");
  }

  async function findPopisRoll() {
    const qr = extractQrFromScan(popisQr);
    const found = await resolveRollByQr(qr);
    if (!found) { setPopisRoll(null); msg?.(`Rolna nije pronađena u magacinu: ${qr}`, "err"); return; }
    setPopisRoll(found);
    setPopisForm({ duzina: found.duzina, kg: found.kg, lokacija: popisMagacin || found.lokacija || "" });
  }
  async function confirmInventoryCount() {
    if (!popisRoll) { msg?.("Prvo skeniraj/pronađi rolnu", "err"); return; }
    const gsm = number(popisRoll.gsm);
    const m = number(popisForm.duzina);
    const kg = number(popisForm.kg) || kgFromMeters({ sirinaMm: popisRoll.sirina, duzinaM: m, gsm });
    const qr = String(popisRoll.qr || "");
    const countedRow = {
      qr,
      br_rolne: popisRoll.br_rolne || qr,
      vrsta: popisRoll.vrsta,
      oznaka_materijala: rollOznaka(popisRoll),
      sirina: popisRoll.sirina,
      duzina: m,
      kg,
      popisana_lokacija: popisForm.lokacija || popisMagacin,
      ocekivana_lokacija: popisRoll.lokacija || "",
      vreme: now(),
      session_id: popisSessionId,
    };
    const updatedLokacija = popisForm.lokacija || popisMagacin || popisRoll.lokacija;
    const next = rolne.map((r) => r.qr === popisRoll.qr ? {
      ...r,
      duzina: m,
      metraza_ost: m,
      kg,
      kg_neto: kg,
      lokacija: updatedLokacija,
      datum_popisa: now(),
      datum_poslednje_promene: now(),
      popisano: true,
      popis_session_id: popisSessionId,
    } : r);
    try {
      if (!supabase?.__localDemo && popisRoll.id) {
        await supabase.from("magacin").update({
          metraza_ost: m,
          kg_neto: kg,
          lokacija: updatedLokacija,
          updated_at: new Date().toISOString(),
          napomena: `Popis ${popisSessionId} · ${popisMagacin}`,
        }).eq("id", popisRoll.id);
      }
    } catch (e) {
      console.error(e);
      msg?.("Supabase update popisa nije uspeo: " + (e?.message || e), "err");
    }
    const hist = [{
      vreme: now(),
      qr: popisRoll.qr,
      event: "POPIS QR",
      opis: `Popis ${popisMagacin}: ${fmt(m,0)} m / ${fmt(kg,2)} kg · lokacija ${updatedLokacija}`,
      stanje: popisRoll.status
    }, ...history];
    safeWrite(LS_ROLNE, next); safeWrite(LS_HISTORY, hist); setRolne(next); setHistory(hist);
    setPopisScanned((prev) => ({ ...prev, [qr]: countedRow }));
    setPopisQr(""); setPopisRoll(null); setPopisForm({ duzina: "", kg: "", lokacija: popisMagacin });
    msg?.("Popis rolne potvrđen i stanje ažurirano.");
  }

  function resetPopisSession() {
    if (!confirm("Započeti novi popis? Trenutna lista skeniranih rolni za ovu sesiju će se obrisati.")) return;
    setPopisSessionId(`POPIS-${new Date().toISOString().slice(0,10)}-${Date.now().toString().slice(-6)}`);
    setPopisScanned({});
    setPopisQr("");
    setPopisRoll(null);
    setPopisForm({ duzina: "", kg: "", lokacija: popisMagacin });
  }


  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.05)" };
  const input = { width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: 13 };
  const smallInput = { ...input, padding: "7px 8px", borderRadius: 8, fontSize: 12 };
  const btn = { border: "none", borderRadius: 10, padding: "9px 12px", fontWeight: 900, cursor: "pointer" };
  const lbl = { display: "block", fontSize: 11, fontWeight: 900, color: "#475569", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3 };
  const tabBtn = (key) => ({ ...btn, background: activeTab === key ? "#0f172a" : "#f8fafc", color: activeTab === key ? "#fff" : "#334155", border: "1px solid #e2e8f0" });


  const mobileActionBtn = (key, icon, title, subtitle) => ({
    key,
    icon,
    title,
    subtitle,
    active: activeTab === key,
  });

  const MobileShell = () => {
    const mobileActions = [
      mobileActionBtn("popis", "📷", "Skeniraj / popiši", "QR popis rolne"),
      mobileActionBtn("povrat", "↩️", "Povrat u magacin", "Prečnik + hilzna"),
      mobileActionBtn("lokacija", "📍", "Skeniraj lokaciju", "MAGACIN + RED + POLICA + POZICIJA"),
      mobileActionBtn("unos", "➕", "Unos rolne", "Ručni unos"),
      mobileActionBtn("rolne", "🎞️", "Stanje", "Lista rolni"),
    ];

    return (
      <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: 12, color: "#0f172a" }}>
        {LabelModal}{BulkModal}
        {scannerMode && <MobileCameraScanner mode={scannerMode} onClose={() => setScannerMode(null)} onScan={handleMobileScan} />}
        <div style={{ ...card, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 950 }}>🏪 Magacin</div>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Mobilni režim za magacionera</div>
          <button onClick={reload} style={{ ...btn, background: "#0f172a", color: "#fff", marginTop: 12, width: "100%" }}>Osveži stanje</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {mobileActions.map((a) => (
            <button key={a.key} onClick={() => { if (a.key === "popis" || a.key === "povrat" || a.key === "lokacija") openMobileScanner(a.key); else { setActiveTab(a.key); if (a.key === "unos") setInputMode("rucno"); } }} style={{
              border: a.active ? "2px solid #0f172a" : "1px solid #e2e8f0",
              background: a.active ? "#0f172a" : "#fff",
              color: a.active ? "#fff" : "#0f172a",
              borderRadius: 16,
              padding: 14,
              textAlign: "left",
              minHeight: 92,
              boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
            }}>
              <div style={{ fontSize: 26 }}>{a.icon}</div>
              <div style={{ fontWeight: 950, marginTop: 5 }}>{a.title}</div>
              <div style={{ fontSize: 12, opacity: 0.78, marginTop: 3 }}>{a.subtitle}</div>
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div style={{ ...card, padding: 12 }}><div style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>Rolni</div><div style={{ fontSize: 22, fontWeight: 950 }}>{stats.total}</div></div>
          <div style={{ ...card, padding: 12 }}><div style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>Na stanju</div><div style={{ fontSize: 22, fontWeight: 950 }}>{stats.dostupna}</div></div>
        </div>

        {activeTab === "popis" && <PopisTab {...{ card, input, btn, lbl, popisQr, setPopisQr, findPopisRoll, popisRoll, popisForm, setPopisForm, confirmInventoryCount, onOpenScanner: () => openMobileScanner("popis"), popisMagacin, setPopisMagacin, popisSessionId, resetPopisSession, popisExpectedRolls, popisCountedRows, popisMissingRolls, popisExtraRows, locationDraft, setLocationDraft, buildLocationCode, onOpenLocationScanner: () => openMobileScanner("lokacija"), saveRollLocation }} />}
        {activeTab === "povrat" && <PovratTab {...{ card, input, btn, lbl, povratQr, setPovratQr, findPovratRoll, povratRoll, povratForm, setPovratForm, estimateMetersFromDiameter, estimateKgForMeters, confirmReturnToWarehouse, onOpenScanner: () => openMobileScanner("povrat"), locationDraft, setLocationDraft, buildLocationCode, onOpenLocationScanner: () => openMobileScanner("lokacija"), saveRollLocation }} />}
        {activeTab === "unos" && (
          <div style={card}>
            <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 10 }}>➕ Ručni unos rolne</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label><span style={lbl}>Vrsta</span><select style={input} value={materialPick.vrsta} onChange={(e) => setMaterialPick({ ...materialPick, vrsta: e.target.value })}>{masterVrste.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
              <label><span style={lbl}>Oznaka</span><select style={input} value={materialPick.oznaka} onChange={(e) => setMaterialPick({ ...materialPick, oznaka: e.target.value })}>{masterOznake.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
              <label><span style={lbl}>{materialPick.vrsta === "PAPIR" ? "Gramatura" : "Debljina"}</span><select style={input} value={materialPick.debljina} onChange={(e) => setMaterialPick({ ...materialPick, debljina: Number(e.target.value) })}>{masterDebljine.map((d) => <option key={d} value={d}>{d}{materialPick.vrsta === "PAPIR" ? " g/m²" : "µ"}</option>)}</select></label>
              <label><span style={lbl}>Pod vrsta</span><input style={input} value={form.pod_vrsta} onChange={(e) => setForm({ ...form, pod_vrsta: e.target.value })} placeholder="transparent / sedef / beli" /></label>
              <label><span style={lbl}>Širina mm</span><input style={input} type="number" value={form.sirina} onChange={(e) => syncFormByMode({ sirina: e.target.value })} /></label>
              <label><span style={lbl}>Obračun</span><select style={input} value={calcMode} onChange={(e) => setCalcMode(e.target.value)}><option value="m_to_kg">Unos m → kg</option><option value="kg_to_m">Unos kg → m</option></select></label>
              <label><span style={lbl}>Metara</span><input style={input} type="number" value={form.duzina} onChange={(e) => syncFormByMode({ duzina: e.target.value })} /></label>
              <label><span style={lbl}>Kilograma</span><input style={input} type="number" value={form.kg} onChange={(e) => syncFormByMode({ kg: e.target.value })} /></label>
              <label><span style={lbl}>LOT</span><input style={input} value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} /></label>
              <label><span style={lbl}>Datum proizvodnje</span><input style={input} type="date" value={form.datum_proizvodnje} onChange={(e) => setForm({ ...form, datum_proizvodnje: e.target.value })} /></label>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
                <b>Live obračun:</b> {fmt(calcMode === "m_to_kg" ? calculatedKg : number(form.kg), 2)} kg · {fmt(calcMode === "kg_to_m" ? calculatedM : number(form.duzina), 0)} m
              </div>
              <button onClick={addRoll} style={{ ...btn, background: "#059669", color: "#fff", padding: 14, fontSize: 15 }}>Dodaj rolnu i QR</button>
            </div>
          </div>
        )}
        {activeTab === "rolne" && (
          <div style={card}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>🎞️ Stanje rolni</div>
            <div style={{ display: "grid", gap: 8 }}>
              {filteredRolls.slice(0, 60).map((r) => (
                <div key={r.qr || r.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}>
                  <div style={{ fontWeight: 950 }}>{r.qr}</div>
                  <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{r.vrsta} · {rollOznaka(r) || "—"} · {r.sirina} mm</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13 }}><span>{fmt(r.duzina,0)} m</span><span>{fmt(r.kg,2)} kg</span><span>{r.status}</span></div>
                  <button onClick={() => setLabelRoll(r)} style={{ ...btn, background: "#dbeafe", color: "#1d4ed8", width: "100%", marginTop: 10 }}>QR / Etiketa</button>
                </div>
              ))}
              {filteredRolls.length === 0 && <div style={{ color: "#64748b", padding: 20, textAlign: "center" }}>Nema rolni za prikaz.</div>}
            </div>
          </div>
        )}
      </div>
    );
  };

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

  if (forceMobile) return <MobileShell />;

  return (
    <div style={{ padding: 22, background: "#f1f5f9", minHeight: "100vh", color: "#0f172a" }}>
      {LabelModal}{BulkModal}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div><h1 style={{ margin: 0, fontSize: 28, fontWeight: 950 }}>🏭 Magacin Materijala i Rolni PRO</h1><div style={{ color: "#64748b", marginTop: 4 }}>Baza materijala + unos rolni + automatski obračun kg ⇄ m + predlog rolni za nalog + QR etikete 100×140 mm.</div></div>
        <button onClick={reload} style={{ ...btn, background: "#0f172a", color: "#fff" }}>Osveži</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={() => setActiveTab("rolne")} style={tabBtn("rolne")}>🎞️ Stanje rolni</button>
        <button onClick={() => setActiveTab("unos")} style={tabBtn("unos")}>➕ Unos rolni</button>
        <button onClick={() => setActiveTab("materijali")} style={tabBtn("materijali")}>🧱 Baza materijala</button>
        <button onClick={() => setActiveTab("predlog")} style={tabBtn("predlog")}>🎯 Predlog rolni za nalog</button>
        <button onClick={() => setActiveTab("istorija")} style={tabBtn("istorija")}>🕘 Istorija</button>
        {isAdminUser && <button onClick={() => setActiveTab("admin")} style={tabBtn("admin")}>🛡️ Admin magacin</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 16 }}>
        {[["Materijala", materijali.length], ["Ukupno rolni", stats.total], ["Ukupno m", fmt(stats.totalM,0)], ["Ukupno kg", fmt(stats.totalKg,2)], ["Dostupne", stats.dostupna], ["Rezervisane", stats.rezervisana]].map(([a,b]) => <div key={a} style={card}><div style={{ color: "#64748b", fontSize: 12, fontWeight: 900 }}>{a}</div><div style={{ fontSize: 24, fontWeight: 950, marginTop: 4 }}>{b}</div></div>)}
      </div>

      {activeTab === "materijali" && <MaterialsTab {...{ card, input, btn, lbl, matForm, setMatForm, saveMaterial, resetDefaultMaterials, matFilter, setMatFilter, filteredMaterials, editMaterial, deleteMaterial }} />}

      {activeTab === "unos" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ ...card, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 950, fontSize: 18 }}>Unos rolni</div>
              <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>Jedna kartica za ručni unos, packing listu PDF i packing listu Excel.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setInputMode("rucno")} style={{...btn, background: inputMode === "rucno" ? "#0f172a" : "#f8fafc", color: inputMode === "rucno" ? "#fff" : "#334155"}}>Ručni unos</button>
              <button onClick={() => setInputMode("pdf")} style={{...btn, background: inputMode === "pdf" ? "#0f172a" : "#f8fafc", color: inputMode === "pdf" ? "#fff" : "#334155"}}>Packing lista PDF</button>
              <button onClick={() => setInputMode("excel")} style={{...btn, background: inputMode === "excel" ? "#0f172a" : "#f8fafc", color: inputMode === "excel" ? "#fff" : "#334155"}}>Packing lista Excel</button>
            </div>
          </div>
          {inputMode === "rucno" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
          <div style={card}>
            <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 6 }}>Ručni unos rolne</div><div style={{ color: "#64748b", fontSize: 12, marginBottom: 12 }}>Unos je poređan logikom: vrsta → pod vrsta → oznaka → debljina → dimenzije → m/kg obračun.</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: 12 }}>
                <div style={{ fontWeight: 950, marginBottom: 10 }}>🧠 Material Master izbor</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 10 }}>
                  <label><span style={lbl}>Vrsta</span><select style={input} value={materialPick.vrsta} onChange={(e) => setMaterialPick({ ...materialPick, vrsta: e.target.value })}>{masterVrste.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
                  <label><span style={lbl}>Pod vrsta</span><input style={input} value={form.pod_vrsta} onChange={(e) => setForm({ ...form, pod_vrsta: e.target.value })} placeholder="transparent / sedef / beli" /></label>
                  <label><span style={lbl}>Oznaka</span><select style={input} value={materialPick.oznaka} onChange={(e) => setMaterialPick({ ...materialPick, oznaka: e.target.value })}>{masterOznake.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
                  <label><span style={lbl}>{materialPick.vrsta === "PAPIR" ? "Gramatura" : "Debljina"}</span><select style={input} value={materialPick.debljina} onChange={(e) => setMaterialPick({ ...materialPick, debljina: Number(e.target.value) })}>{masterDebljine.map((d) => <option key={d} value={d}>{d}{materialPick.vrsta === "PAPIR" ? " g/m²" : "µ"}</option>)}</select></label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 10, marginTop: 10 }}>
                  <label><span style={lbl}>Proizvođač</span><input style={input} value={materialPick.proizvodjac} onChange={(e) => setMaterialPick({ ...materialPick, proizvodjac: e.target.value })} placeholder="npr. Taghleef / Jindal / Rossella" /></label>
                  <label><span style={lbl}>Cena €/kg</span><input style={input} type="number" value={materialPick.cenaKg} onChange={(e) => setMaterialPick({ ...materialPick, cenaKg: e.target.value })} /></label>
                </div>
              </div>
              <div style={{ background: "#ecfeff", border: "1px solid #67e8f9", borderRadius: 12, padding: 12, fontSize: 13 }}>
                <b>{selectedMat.komercijalnaOznaka}</b><br />
                Vrsta: {selectedMat.vrsta} · Oznaka: {materialPick.oznaka} · Koef: {selectedMat.koeficijent || "—"} · g/m²: {fmt(liveGsm, 2)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 10 }}>
                <label><span style={lbl}>Širina rolne mm</span><input style={input} type="number" value={form.sirina} onChange={(e) => syncFormByMode({ sirina: e.target.value })} /></label>
                <label><span style={lbl}>Smer obračuna</span><select style={input} value={calcMode} onChange={(e) => setCalcMode(e.target.value)}><option value="m_to_kg">Unos m → računaj kg</option><option value="kg_to_m">Unos kg → računaj m</option></select></label>
                <label><span style={lbl}>Metara</span><input style={input} type="number" value={form.duzina} onChange={(e) => syncFormByMode({ duzina: e.target.value })} /></label>
                <label><span style={lbl}>Kilograma</span><input style={input} type="number" value={form.kg} onChange={(e) => syncFormByMode({ kg: e.target.value })} /></label>
                <label><span style={lbl}>Lot / šarža</span><input style={input} value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} /></label>
                <label><span style={lbl}>Lokacija</span><input style={input} value={form.lokacija} onChange={(e) => setForm({ ...form, lokacija: e.target.value })} /></label>
                <label><span style={lbl}>Datum proizvodnje rolne</span><input style={input} type="date" value={form.datum_proizvodnje} onChange={(e) => setForm({ ...form, datum_proizvodnje: e.target.value })} /></label>
                <label style={{ gridColumn: "1 / -1" }}><span style={lbl}>Napomena</span><input style={input} value={form.napomena} onChange={(e) => setForm({ ...form, napomena: e.target.value })} /></label>
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ fontWeight: 900 }}>Live obračun</div><div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>kg = širina(m) × dužina(m) × g/m² / 1000</div><div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><div><b>{fmt(calcMode === "m_to_kg" ? calculatedKg : number(form.kg), 2)} kg</b></div><div><b>{fmt(calcMode === "kg_to_m" ? calculatedM : number(form.duzina), 0)} m</b></div></div></div>
              <button onClick={addRoll} style={{ ...btn, background: "#059669", color: "#fff", padding: "13px" }}>+ Dodaj rolnu i generiši QR</button>
            </div>
          </div>
          <div style={card}><div style={{ fontWeight: 900, marginBottom: 12 }}>Šta se upisuje na rolnu</div><div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(140px, 1fr))", gap: 10 }}>{[["Vrsta", selectedMat?.vrsta], ["Oznaka materijala", cleanOznaka(selectedMat?.oznaka || materialPick.oznaka || selectedMat?.komercijalnaOznaka, selectedMat?.vrsta)], ["Pod vrsta", form.pod_vrsta || "—"], ["Proizvođač", selectedMat?.proizvodjac || "—"], ["Debljina", selectedMat?.debljina ? `${selectedMat.debljina} µ` : "—"], ["Širina", `${form.sirina || 0} mm`], ["g/m²", fmt(liveGsm, 2)], ["Metara", fmt(calcMode === "kg_to_m" ? calculatedM : form.duzina, 0)], ["Kilograma", fmt(calcMode === "m_to_kg" ? calculatedKg : form.kg, 2)], ["Datum proizvodnje", form.datum_proizvodnje || "—"]].map(([a,b]) => <div key={a} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>{a}</div><div style={{ fontWeight: 900, marginTop: 3 }}>{b}</div></div>)}</div></div>
        </div>

          ) : (
            <ImportPackingTab {...{ card, input, btn, lbl, packingText, setPackingText, packingRows, setPackingRows, handlePackingFile, parseTextPackingList, importPackingRows, inputMode } } />
          )}
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
                <td style={cell}><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button onClick={() => setLabelRoll(r)} style={{ ...btn, background: "#dbeafe", color: "#1d4ed8" }}>QR / Etiketa</button><button onClick={() => reserveForMaster(r)} style={{ ...btn, background: "#fef3c7", color: "#92400e" }}>Rezerviši</button><button onClick={() => consumeRoll(r)} style={{ ...btn, background: "#fee2e2", color: "#991b1b" }}>Skini m</button><button onClick={() => changeStatus(r, "Na stanju")} style={{ ...btn, background: "#dcfce7", color: "#166534" }}>Na stanju</button>{isAdminUser && <button onClick={() => deleteWarehouseRoll(r)} style={{ ...btn, background: "#991b1b", color: "#fff" }}>Obriši</button>}</div></td>
              </tr>)}</tbody>
            </table>
            {filteredRolls.length === 0 && <div style={{ textAlign: "center", padding: 24, color: "#64748b" }}>Nema rolni za prikaz.</div>}
          </div>
        </div>
      )}


      {activeTab === "predlog" && <PredlogTab {...{ card, input, btn, lbl, req, setReq, createReservationRequest, suggestedRolls, reserveForMaster }} />}
      {activeTab === "istorija" && <div style={card}><div style={{ fontWeight: 900, marginBottom: 10 }}>Istorija rolni</div>{history.length === 0 ? <div style={{ color: "#64748b" }}>Još nema istorije.</div> : history.slice(0, 80).map((h, i) => <div key={i} style={{ borderTop: "1px solid #e2e8f0", padding: "9px 0", fontSize: 13 }}><b>{h.vreme}</b> · <b>{h.qr}</b> · {h.event} · {h.opis}</div>)}</div>}
      {activeTab === "admin" && isAdminUser && <AdminWarehouseTab {...{ card, btn, rolne, createWarehouseBackup, resetWarehouseData }} />}
    </div>
  );
}
const cell = { padding: 9, borderBottom: "1px solid #f1f5f9" };
const filterTh = { padding: 6, borderBottom: "1px solid #e2e8f0" };


function ImportPackingTab({ card, input, btn, lbl, packingText, setPackingText, packingRows, handlePackingFile, parseTextPackingList, importPackingRows, inputMode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "430px 1fr", gap: 16 }}>
    <div style={card}>
      <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 6 }}>📥 {inputMode === "pdf" ? "Packing lista PDF" : "Packing lista Excel"}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>{inputMode === "pdf" ? "PDF se čita automatski za Plastchim, Taghleef, Inter Gradex i Rossella formate. Ako format nije prepoznat, nalepi tekst ispod." : "Podržano: Excel .xlsx/.xls, CSV i TXT packing liste."}</div>
      <label><span style={lbl}>{inputMode === "pdf" ? "PDF fajl / tekst packing liste" : "Excel / CSV / TXT fajl"}</span><input style={input} type="file" accept=".xlsx,.xls,.csv,.txt,.pdf" onChange={handlePackingFile} /></label>
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

function MobileCameraScanner({ mode, onClose, onScan }) {
  const scannerId = React.useMemo(() => `maropack-mobile-qr-scanner-${Math.random().toString(36).slice(2)}`, []);
  const [error, setError] = React.useState("");
  const [manualQr, setManualQr] = React.useState("");
  const [started, setStarted] = React.useState(false);
  const onScanRef = React.useRef(onScan);
  const scannedRef = React.useRef(false);

  React.useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  React.useEffect(() => {
    let scanner = null;
    let cancelled = false;

    async function safeStop() {
      try { if (scanner) await scanner.stop(); } catch {}
      try { if (scanner) scanner.clear(); } catch {}
    }

    async function startScanner() {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) throw new Error("Browser ne podržava kameru");
        const mod = await import("html5-qrcode");
        const Html5Qrcode = mod.Html5Qrcode || mod.default?.Html5Qrcode || mod.default;
        if (!Html5Qrcode) throw new Error("html5-qrcode nije pravilno učitan");
        scanner = new Html5Qrcode(scannerId, { verbose: false });
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          async (decodedText) => {
            if (cancelled || scannedRef.current) return;
            scannedRef.current = true;
            await safeStop();
            setTimeout(() => onScanRef.current?.(decodedText), 50);
          },
          () => {}
        );
        if (!cancelled) setStarted(true);
      } catch (e) {
        console.error("QR scanner greška", e);
        setError((e?.message || "Kamera nije dostupna") + ". Možeš koristiti ručni unos ispod.");
      }
    }

    startScanner();
    return () => { cancelled = true; safeStop(); };
  }, [scannerId]);

  const isLocation = mode === "lokacija";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.96)", color: "#fff", padding: 14, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 950 }}>{isLocation ? "📍 Skeniraj QR lokacije" : mode === "povrat" ? "↩️ Skeniraj QR za povrat" : "📷 Skeniraj QR za popis"}</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{isLocation ? "Skeniraj MAGACIN, RED, POLICU i POZICIJU." : "Usmeri kameru ka QR kodu na etiketi rolne."}</div>
        </div>
        <button onClick={onClose} style={{ border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.12)", color: "#fff", borderRadius: 12, padding: "10px 12px", fontWeight: 900 }}>Zatvori</button>
      </div>
      <div style={{ background: "#020617", border: "1px solid rgba(255,255,255,.18)", borderRadius: 18, padding: 10, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <div id={scannerId} style={{ width: "100%", maxWidth: 420, overflow: "hidden", borderRadius: 14 }} />
      </div>
      {!started && !error && <div style={{ marginTop: 12, textAlign: "center", opacity: 0.8 }}>Pokrećem kameru...</div>}
      {error && <div style={{ marginTop: 12, background: "#7f1d1d", border: "1px solid #fecaca", borderRadius: 12, padding: 12, fontWeight: 800 }}>{error}</div>}
      <div style={{ marginTop: 12, background: "rgba(255,255,255,.08)", borderRadius: 14, padding: 12 }}>
        <div style={{ fontSize: 12, marginBottom: 8, opacity: 0.85 }}>Rezervni ručni unos QR-a</div>
        <input value={manualQr} onChange={(e) => setManualQr(e.target.value)} placeholder={isLocation ? "MAROPACK|MAGACIN|A" : "ROLNA-2026-..."} style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: "#fff", color: "#0f172a", boxSizing: "border-box", fontWeight: 800 }} />
        <button onClick={() => manualQr.trim() && onScanRef.current?.(manualQr.trim())} style={{ marginTop: 8, width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#22c55e", color: "#fff", fontWeight: 950 }}>Potvrdi ručni unos</button>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, textAlign: "center" }}>Ako kamera ne radi, dozvoli kameru u browseru ili koristi ručni unos.</div>
    </div>
  );
}

function PopisTab({ card, input, btn, lbl, popisQr, setPopisQr, findPopisRoll, popisRoll, popisForm, setPopisForm, confirmInventoryCount, onOpenScanner, popisMagacin, setPopisMagacin, popisSessionId, resetPopisSession, popisExpectedRolls = [], popisCountedRows = [], popisMissingRolls = [], popisExtraRows = [], locationDraft = {}, setLocationDraft, buildLocationCode, onOpenLocationScanner, saveRollLocation }) {
  return <div style={{ display: "grid", gap: 14 }}>
    <div style={card}>
      <div style={{ fontWeight: 950, fontSize: 20, marginBottom: 6 }}>📲 QR popis rolni</div>
      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 14 }}>Izaberi koji magacin popisuješ, zatim skeniraj QR kodove. Na kraju vidiš šta nedostaje i šta je višak/na pogrešnoj lokaciji.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <label><span style={lbl}>Magacin koji se popisuje</span><select style={input} value={popisMagacin} onChange={(e) => { setPopisMagacin(e.target.value); setPopisForm({ ...popisForm, lokacija: e.target.value }); }}>
          {WAREHOUSE_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
        </select></label>
        <label><span style={lbl}>Popis sesija</span><input style={input} value={popisSessionId} readOnly /></label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
        {[["Očekivano", popisExpectedRolls.length], ["Skenirano", popisCountedRows.length], ["Nedostaje", popisMissingRolls.length], ["Razlika/višak", popisExtraRows.length]].map(([a,b]) => <div key={a} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>{a}</div><div style={{ fontSize: 22, fontWeight: 950 }}>{b}</div></div>)}
      </div>
      {onOpenScanner && <button onClick={onOpenScanner} style={{ ...btn, background: "#0f172a", color: "#fff", width: "100%", marginBottom: 10, padding: 14, fontSize: 15 }}>📷 Otvori kameru i skeniraj QR</button>}
      <label><span style={lbl}>QR / Broj rolne</span><input autoFocus style={{ ...input, fontSize: 16, fontWeight: 800 }} value={popisQr} onChange={(e) => setPopisQr(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") findPopisRoll(); }} placeholder="Skeniraj ROLNA-..." /></label>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={findPopisRoll} style={{ ...btn, background: "#2563eb", color: "#fff" }}>Pronađi rolnu</button>
        <button onClick={resetPopisSession} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Novi popis</button>
      </div>
    </div>

    <div style={card}>
      {!popisRoll ? <div style={{ color: "#64748b" }}>Nema izabrane rolne za popis.</div> : <>
        <div style={{ fontWeight: 950, marginBottom: 10 }}>{popisRoll.qr}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>{[["Materijal", `${popisRoll.vrsta} · ${popisRoll.komercijalnaOznaka || rollOznaka(popisRoll)}`], ["Širina", `${popisRoll.sirina} mm`], ["Knjig. m", fmt(popisRoll.duzina, 0)], ["Knjig. kg", fmt(popisRoll.kg, 2)]].map(([a,b]) => <div key={a} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 900 }}>{a}</div><div style={{ fontWeight: 950 }}>{b}</div></div>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <label><span style={lbl}>Stvarno metara</span><input style={input} type="number" value={popisForm.duzina} onChange={(e) => setPopisForm({ ...popisForm, duzina: e.target.value })} /></label>
          <label><span style={lbl}>Stvarno kg</span><input style={input} type="number" value={popisForm.kg} onChange={(e) => setPopisForm({ ...popisForm, kg: e.target.value })} /></label>
          <label><span style={lbl}>Lokacija / magacin</span><select style={input} value={popisForm.lokacija || popisMagacin} onChange={(e) => setPopisForm({ ...popisForm, lokacija: e.target.value })}>{WAREHOUSE_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}</select></label>
        </div>
        <div style={{ marginTop: 12, padding: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12 }}>
          <div style={{ fontWeight: 950, marginBottom: 8 }}>📍 Promena lokacije QR kodovima</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 8 }}>
            {[['Magacin', locationDraft.magacin], ['Red', locationDraft.red], ['Polica', locationDraft.polica], ['Pozicija', locationDraft.pozicija]].map(([a,b]) => <div key={a} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 8 }}><div style={{ fontSize: 10, color: '#64748b', fontWeight: 900 }}>{a}</div><div style={{ fontWeight: 950 }}>{b || '—'}</div></div>)}
          </div>
          <div style={{ fontWeight: 950, marginBottom: 8 }}>Nova lokacija: {buildLocationCode?.(locationDraft) || '—'}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={onOpenLocationScanner} style={{ ...btn, background: '#0f172a', color: '#fff' }}>Skeniraj QR lokacije</button>
            <button onClick={() => { const loc = buildLocationCode?.(locationDraft); if (loc) setPopisForm({ ...popisForm, lokacija: loc }); }} style={{ ...btn, background: '#dbeafe', color: '#1d4ed8' }}>Upiši u popis</button>
            <button disabled={!popisRoll || !buildLocationCode?.(locationDraft)} onClick={async () => { const loc = buildLocationCode?.(locationDraft); const updated = await saveRollLocation?.(popisRoll, loc, 'PROMENA LOKACIJE POPIS'); if (updated) setPopisRoll(updated); }} style={{ ...btn, background: popisRoll && buildLocationCode?.(locationDraft) ? '#059669' : '#cbd5e1', color: '#fff' }}>Sačuvaj lokaciju rolne</button>
          </div>
        </div>
        <button onClick={confirmInventoryCount} style={{ ...btn, background: "#059669", color: "#fff", marginTop: 12 }}>Potvrdi popis i ažuriraj stanje</button>
      </>}
    </div>

    <div style={card}>
      <div style={{ fontWeight: 950, marginBottom: 10 }}>Razlike u popisu za {popisMagacin}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, color: "#991b1b", marginBottom: 8 }}>Nedostaje u popisu</div>
          {popisMissingRolls.length === 0 ? <div style={{ color: "#64748b" }}>Nema nedostajućih rolni.</div> : popisMissingRolls.slice(0, 30).map((r) => <div key={r.qr} style={{ borderTop: "1px solid #fee2e2", padding: "7px 0", fontSize: 13 }}><b>{r.qr}</b> · {r.vrsta} · {r.sirina} mm · {fmt(r.duzina,0)} m</div>)}
        </div>
        <div>
          <div style={{ fontWeight: 900, color: "#92400e", marginBottom: 8 }}>Višak / pogrešan magacin</div>
          {popisExtraRows.length === 0 ? <div style={{ color: "#64748b" }}>Nema viška ni pogrešnih lokacija.</div> : popisExtraRows.slice(0, 30).map((r) => <div key={r.qr} style={{ borderTop: "1px solid #fef3c7", padding: "7px 0", fontSize: 13 }}><b>{r.qr}</b> · očekivano: {r.ocekivana_lokacija || "—"} · popisano: {r.popisana_lokacija}</div>)}
        </div>
      </div>
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


function PovratTab({ card, input, btn, lbl, povratQr, setPovratQr, findPovratRoll, povratRoll, povratForm, setPovratForm, estimateMetersFromDiameter, estimateKgForMeters, confirmReturnToWarehouse, onOpenScanner, locationDraft = {}, buildLocationCode, onOpenLocationScanner }) {
  const [diameterDraft, setDiameterDraft] = React.useState(povratForm.spoljasnjiPrecnik || "");
  const [hilznaDraft, setHilznaDraft] = React.useState(povratForm.hilzna || "FI76");
  const [lokacijaDraft, setLokacijaDraft] = React.useState(povratForm.lokacija || "Magacin");
  const [napomenaDraft, setNapomenaDraft] = React.useState(povratForm.napomena || "Povrat u magacin");

  React.useEffect(() => {
    setDiameterDraft(povratForm.spoljasnjiPrecnik || "");
    setHilznaDraft(povratForm.hilzna || "FI76");
    setLokacijaDraft(povratForm.lokacija || "Magacin");
    setNapomenaDraft(povratForm.napomena || "Povrat u magacin");
  }, [povratRoll?.id, povratRoll?.qr]);

  const cleanDiameter = (value) => String(value || "").replace(/[^0-9.,]/g, "");
  const meters = povratRoll ? estimateMetersFromDiameter(povratRoll, diameterDraft, hilznaDraft) : 0;
  const kg = povratRoll ? estimateKgForMeters(povratRoll, meters) : 0;
  const applyLocationFromQr = () => {
    const loc = buildLocationCode?.(locationDraft);
    if (loc) {
      setLokacijaDraft(loc);
      setPovratForm((f) => ({ ...f, lokacija: loc }));
    }
  };
  const handleConfirm = () => {
    const next = {
      hilzna: hilznaDraft,
      spoljasnjiPrecnik: diameterDraft,
      lokacija: lokacijaDraft,
      napomena: napomenaDraft,
    };
    setPovratForm((f) => ({ ...f, ...next }));
    confirmReturnToWarehouse(next);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 430px) 1fr", gap: 16 }}>
      <div style={card}>
        <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 6 }}>↩️ Povrat u magacin</div>
        <div style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>Na telefonu prvo skeniraj QR kamerom, zatim izaberi hilznu i unesi spoljašnji prečnik.</div>
        <div style={{ display: "grid", gap: 10 }}>
          {onOpenScanner && <button onClick={onOpenScanner} style={{ ...btn, background: "#0f172a", color: "#fff", padding: 14, fontSize: 15 }}>📷 Otvori kameru i skeniraj QR</button>}
          <label><span style={lbl}>QR / broj rolne</span><input style={input} value={povratQr} onChange={(e) => setPovratQr(e.target.value)} placeholder="Skeniraj QR ili unesi broj rolne" /></label>
          <button onClick={findPovratRoll} style={{ ...btn, background: "#0f172a", color: "#fff" }}>Pronađi rolnu</button>
          <label><span style={lbl}>Hilzna</span><select style={input} value={hilznaDraft} onChange={(e) => { setHilznaDraft(e.target.value); setPovratForm((f) => ({ ...f, hilzna: e.target.value })); }}><option value="FI76">FI 76 — računa se 100 mm</option><option value="FI152">FI 152 — računa se 180 mm</option></select></label>
          <label><span style={lbl}>Spoljašnji prečnik rolne mm</span><input style={input} type="text" inputMode="decimal" autoComplete="off" value={diameterDraft} onChange={(e) => setDiameterDraft(cleanDiameter(e.target.value))} onBlur={() => setPovratForm((f) => ({ ...f, spoljasnjiPrecnik: diameterDraft }))} placeholder="npr. 420" /></label>
          <label><span style={lbl}>Lokacija povrata</span><input style={input} value={lokacijaDraft} onChange={(e) => { setLokacijaDraft(e.target.value); setPovratForm((f) => ({ ...f, lokacija: e.target.value })); }} /></label>
          <div style={{ padding: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12 }}>
            <div style={{ fontWeight: 950, marginBottom: 6 }}>QR lokacija: {buildLocationCode?.(locationDraft) || "—"}</div>
            <button onClick={onOpenLocationScanner} style={{ ...btn, background: "#0f172a", color: "#fff", width: "100%" }}>📍 Skeniraj QR lokacije</button>
            <button onClick={applyLocationFromQr} style={{ ...btn, background: "#dbeafe", color: "#1d4ed8", width: "100%", marginTop: 8 }}>Upiši skeniranu lokaciju</button>
          </div>
          <label><span style={lbl}>Napomena</span><input style={input} value={napomenaDraft} onChange={(e) => { setNapomenaDraft(e.target.value); setPovratForm((f) => ({ ...f, napomena: e.target.value })); }} /></label>
          <button onClick={handleConfirm} disabled={!povratRoll} style={{ ...btn, background: povratRoll ? "#059669" : "#cbd5e1", color: "#fff", padding: 12 }}>Potvrdi povrat i štampaj novu etiketu</button>
        </div>
      </div>
      <div style={card}>
        <div style={{ fontWeight: 950, marginBottom: 12 }}>Obračun povrata</div>
        {!povratRoll ? <div style={{ color: "#64748b" }}>Nema izabrane rolne.</div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(150px,1fr))", gap: 10 }}>
          {[["Rolna", povratRoll.qr], ["Materijal", `${povratRoll.vrsta || "—"} · ${povratRoll.komercijalnaOznaka || ""}`], ["Debljina", `${povratRoll.debljina || "—"} µ`], ["Širina", `${povratRoll.sirina || "—"} mm`], ["Izračunato m", `${fmt(meters,0)} m`], ["Izračunato kg", `${fmt(kg,2)} kg`]].map(([a,b]) => <div key={a} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 900 }}>{a}</div><div style={{ fontWeight: 950, marginTop: 4 }}>{b}</div></div>)}
        </div>}
        <div style={{ marginTop: 14, padding: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, color: "#92400e", fontSize: 13 }}>
          Formula koristi spoljašnji prečnik, efektivni prečnik hilzne i debljinu materijala. FI 76 se računa kao 100 mm, FI 152 kao 180 mm.
        </div>
      </div>
    </div>
  );
}

function AdminWarehouseTab({ card, btn, rolne, createWarehouseBackup, resetWarehouseData }) {
  return <div style={{ display: "grid", gap: 14 }}>
    <div style={card}>
      <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 8 }}>🛡️ Admin magacin</div>
      <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>Ove opcije su samo za admina. Pre brisanja ili reseta sistem pravi backup.</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => createWarehouseBackup("manual")} style={{ ...btn, background: "#0f172a", color: "#fff" }}>Napravi backup sada</button>
        <button onClick={resetWarehouseData} style={{ ...btn, background: "#991b1b", color: "#fff" }}>Reset test podataka magacina</button>
      </div>
    </div>
    <div style={card}>
      <div style={{ fontWeight: 900 }}>Stanje pre reseta</div>
      <div style={{ color: "#64748b", marginTop: 6 }}>Ukupno rolni u prikazu: <b>{rolne.length}</b></div>
    </div>
  </div>;
}

function PredlogTab({ card, input, btn, lbl, req, setReq, createReservationRequest, suggestedRolls, reserveForMaster }) {
  return <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}><div style={card}><div style={{ fontWeight: 900, marginBottom: 12 }}>Zahtev materijala za nalog</div><div style={{ display: "grid", gap: 10 }}><label><span style={lbl}>Vrsta materijala</span><input style={input} value={req.vrsta} onChange={(e) => setReq({ ...req, vrsta: e.target.value })} /></label><label><span style={lbl}>Debljina µ</span><input style={input} type="number" value={req.debljina} onChange={(e) => setReq({ ...req, debljina: e.target.value })} /></label><label><span style={lbl}>Potrebna širina mm</span><input style={input} type="number" value={req.sirina} onChange={(e) => setReq({ ...req, sirina: e.target.value })} /></label><label><span style={lbl}>Potrebno metara</span><input style={input} type="number" value={req.potrebniM} onChange={(e) => setReq({ ...req, potrebniM: e.target.value })} /></label><button onClick={createReservationRequest} style={{ ...btn, background: "#2563eb", color: "#fff" }}>Sačuvaj zahtev za nalog</button></div></div><div style={card}><div style={{ fontWeight: 900, marginBottom: 12 }}>Predložene rolne iz magacina</div><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr style={{ background: "#f8fafc" }}>{["QR", "Materijal", "Širina", "m", "kg", "Lokacija", "Ocena", "Akcija"].map(h => <th key={h} style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead><tbody>{suggestedRolls.map((r) => <tr key={r.qr}><td style={cell}><b>{r.qr}</b></td><td style={cell}>{r.vrsta} · {r.komercijalnaOznaka}</td><td style={cell}>{r.sirina} mm</td><td style={cell}>{fmt(r.duzina, 0)}</td><td style={cell}>{fmt(r.kg, 2)}</td><td style={cell}>{r.lokacija}</td><td style={cell}>{r.pokriva ? "✅ Pokriva" : `⚠️ Fali ${fmt(Math.abs(r.ostatak), 0)} m`}</td><td style={cell}><button onClick={() => reserveForMaster(r)} style={{ ...btn, background: "#fef3c7", color: "#92400e" }}>Rezerviši</button></td></tr>)}</tbody></table>{suggestedRolls.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Nema dostupnih rolni koje odgovaraju zahtevu. Dodaj rolnu ili promeni kriterijum.</div>}</div></div></div>;
}
