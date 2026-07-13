import React, { useMemo } from "react";
import { translate, useLang } from "./LanguageProvider.jsx";

// =====================================================================
// CrtezKese — realističan (HD) tehnički prikaz kese za naloge/templejte.
// Render: providna zapreminska folija + sjaj + odraz, prave KOTE,
// i dva prikaza dna (bočni presek + pogled odozdo). Pokriva ceo asortiman.
//
// Upotreba:
//   import CrtezKese, { presetTip, TIPOVI } from "./CrtezKese.jsx";
//   <CrtezKese config={{ ...presetTip("bodenfalten"), sirina:95, duzina:175, klMm:30 }} />
//
// Props: config, width, showKote, showBottomViews, showInfo, style
// config polja: tip, vrh("otvor"|"klapna"|"header"), klTip("rect"|"schrag"),
//   dno("ravno"|"faltna"|"naht"|"kreuz"), adh, euroloch, luft, stampa,
//   perf("none"|"easy"|"abreiss"|"heiss"), komore(1|2|3),
//   sirina, duzina, klMm, extraMm  (mm)
// =====================================================================

export const TIPOVI = {
  flach:       { n: "Flachbeutel",        vrh: "otvor",  klTip: "rect",   dno: "ravno",  adh: 0, euroloch: 0, perf: "none",    komore: 1 },
  klappen:     { n: "Klappenbeutel",      vrh: "klapna", klTip: "rect",   dno: "ravno",  adh: 1, euroloch: 0, perf: "none",    komore: 1 },
  bodenfalten: { n: "Bodenfaltenbeutel",  vrh: "klapna", klTip: "rect",   dno: "faltna", adh: 1, euroloch: 0, perf: "none",    komore: 1 },
  bodennaht:   { n: "Bodennahtbeutel",    vrh: "otvor",  klTip: "rect",   dno: "naht",   adh: 0, euroloch: 1, perf: "none",    komore: 1 },
  header:      { n: "Headerbeutel",       vrh: "header", klTip: "rect",   dno: "naht",   adh: 1, euroloch: 1, perf: "none",    komore: 1 },
  banderole:   { n: "Banderole",          vrh: "otvor",  klTip: "rect",   dno: "ravno",  adh: 1, euroloch: 0, perf: "none",    komore: 1 },
  rolle:       { n: "Beutel auf Rolle",   vrh: "otvor",  klTip: "rect",   dno: "ravno",  adh: 0, euroloch: 0, perf: "abreiss", komore: 1 },
  brief:       { n: "Briefhülle",         vrh: "klapna", klTip: "schrag", dno: "ravno",  adh: 1, euroloch: 0, perf: "none",    komore: 1 },
  doppel:      { n: "Doppeltasche",       vrh: "otvor",  klTip: "rect",   dno: "ravno",  adh: 0, euroloch: 0, perf: "none",    komore: 2 },
  easy:        { n: "Easy-Opening Beutel",vrh: "klapna", klTip: "rect",   dno: "naht",   adh: 1, euroloch: 0, perf: "easy",    komore: 1 },
  flaschen:    { n: "Flaschenbeutel",     vrh: "klapna", klTip: "rect",   dno: "ravno",  adh: 1, euroloch: 0, perf: "none",    komore: 1 },
  heiss:       { n: "Heißgenadelte Beutel",vrh: "otvor", klTip: "rect",   dno: "ravno",  adh: 0, euroloch: 0, perf: "heiss",   komore: 1 },
  kreuz:       { n: "Kreuzbodenbeutel",   vrh: "otvor",  klTip: "rect",   dno: "kreuz",  adh: 0, euroloch: 0, perf: "none",    komore: 1 },
  mehr:        { n: "Mehrkammerbeutel",   vrh: "klapna", klTip: "rect",   dno: "naht",   adh: 1, euroloch: 0, perf: "none",    komore: 3 },
  zweifarbig:  { n: "Zweifarbige Beutel", vrh: "otvor",  klTip: "rect",   dno: "naht",   adh: 0, euroloch: 0, perf: "none",    komore: 1 },
  zweikammer:  { n: "Zweikammerbeutel",   vrh: "klapna", klTip: "rect",   dno: "naht",   adh: 1, euroloch: 0, perf: "none",    komore: 2 },
};

export function presetTip(tip) {
  const t = TIPOVI[tip] || TIPOVI.flach;
  return { tip, vrh: t.vrh, klTip: t.klTip, dno: t.dno, adh: !!t.adh, euroloch: !!t.euroloch, perf: t.perf, komore: t.komore };
}

// Adapter: kesa objekat iz templejta/naloga -> config za CrtezKese.
// Tip kese (maropack ključ) postavlja osnovni oblik; čekirane opcije ga dorade.
export function kesaToConfig(kesa = {}) {
  const o = kesa.options || {};
  const base = presetTip(kesa.tipKese);
  const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
  const klapnaMm = num(kesa.klapna);
  const faltaMm = num(kesa.falta);
  const vrh = base.vrh;
  const dno = o.falta_dno ? "faltna" : (o.var_dno ? "naht" : base.dno);
  return {
    tip: kesa.tipKese || "",
    vrh,
    klTip: o.kosa_klapna ? "schrag" : base.klTip,
    dno,
    adh: o.adh_traka ? true : !!base.adh,
    euroloch: o.eurozumba ? true : !!base.euroloch,
    luft: !!(o.okrugla_zumba || o.busene_rupe),
    stampa: o.stampa !== undefined ? !!o.stampa : true,
    perf: o.mikroperforacija ? "heiss" : (o.poprecna_perf ? "easy" : base.perf),
    komore: base.komore || 1,
    duplofan: !!o.duplofan,
    anleger: !!o.anleger,
    falznut: !!o.utor,
    bocniVar: !!o.bocni_var,
    poprecniVar: !!(o.poprecni_var || o.kontinualni_var || o.toplotni_var),
    otvorDno: !!o.otvor_dno,
    ojacanje: !!o.ojacanje,
    pakovanjeTrn: !!o.pakovanje_trn,
    positions: kesa.positions || {},
    sirina: num(kesa.sirina) || 95,
    duzina: num(kesa.duzina) || 175,
    klMm: klapnaMm || 30,
    extraMm: dno === "faltna" ? (faltaMm || 30) : 30,
    stampaText: kesa.stampaText || "",
    legend: kesa.legend || [],
  };
}

const DEFAULTS = {
  tip: "", vrh: "otvor", klTip: "rect", dno: "ravno",
  adh: false, euroloch: false, luft: false, stampa: true,
  duplofan: false, anleger: false, falznut: false, bocniVar: false,
  poprecniVar: false, otvorDno: false, ojacanje: false, pakovanjeTrn: false,
  positions: {},
  stampaText: "",
  perf: "none", komore: 1, sirina: 95, duzina: 175, klMm: 30, extraMm: 30,
};

const pillow = (x, y, w, h, b) => { const x2 = x + w, y2 = y + h, mx = x + w / 2, my = y + h / 2; return `M${x} ${y} Q${mx} ${y - b} ${x2} ${y} Q${x2 + b} ${my} ${x2} ${y2} Q${mx} ${y2 + b} ${x} ${y2} Q${x - b} ${my} ${x} ${y} Z`; };
const rr = (x, y, w, h, r) => `M${x + r} ${y} h${w - 2 * r} a${r} ${r} 0 0 1 ${r} ${r} v${h - 2 * r} a${r} ${r} 0 0 1 -${r} ${r} h-${w - 2 * r} a${r} ${r} 0 0 1 -${r} -${r} v-${h - 2 * r} a${r} ${r} 0 0 1 ${r} -${r} Z`;
const arw = (x, y, d) => { const a = 5; if (d === 'l') return `<path d="M${x} ${y} l${a} -3 l0 6 Z" fill="#94a3b8"/>`; if (d === 'r') return `<path d="M${x} ${y} l-${a} -3 l0 6 Z" fill="#94a3b8"/>`; if (d === 'u') return `<path d="M${x} ${y} l-3 ${a} l6 0 Z" fill="#94a3b8"/>`; return `<path d="M${x} ${y} l-3 -${a} l6 0 Z" fill="#94a3b8"/>`; };
const kotaH = (y, x1, x2, oy, t) => { let q = `<line x1="${x1}" y1="${oy}" x2="${x1}" y2="${y + 4}" stroke="#cbd5e1" stroke-width="0.8"/><line x1="${x2}" y1="${oy}" x2="${x2}" y2="${y + 4}" stroke="#cbd5e1" stroke-width="0.8"/><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#94a3b8" stroke-width="0.9"/>` + arw(x1, y, 'l') + arw(x2, y, 'r'); const mx = (x1 + x2) / 2; q += `<rect x="${mx - 25}" y="${y - 8}" width="50" height="14" fill="#eef2f6" opacity="0.9"/><text x="${mx}" y="${y + 3}" font-size="10.5" fill="#334155" text-anchor="middle" font-weight="600">${t}</text>`; return q; };
const kotaV = (x, y1, y2, ox, t) => { let q = `<line x1="${ox}" y1="${y1}" x2="${x - 4}" y2="${y1}" stroke="#cbd5e1" stroke-width="0.8"/><line x1="${ox}" y1="${y2}" x2="${x - 4}" y2="${y2}" stroke="#cbd5e1" stroke-width="0.8"/><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#94a3b8" stroke-width="0.9"/>` + arw(x, y1, 'u') + arw(x, y2, 'd'); const my = (y1 + y2) / 2; q += `<g transform="rotate(-90 ${x} ${my})"><rect x="${x - 26}" y="${my - 8}" width="52" height="14" fill="#eef2f6" opacity="0.9"/><text x="${x}" y="${my + 3}" font-size="10.5" fill="#334155" text-anchor="middle" font-weight="600">${t}</text></g>`; return q; };

function buildSvgPro(c, u, lang = "sr") {
  const T = (k, f) => translate(lang, k, f, lang);
  const q = (n) => Math.round(n * 10) / 10;
  const INK = "#0f172a", SUB = "#475569", LINE = "#9aa7b8", ACC = "#b91c1c", TEAL = "#0d9488", BLUE = "#2563eb", AMB = "#d97706";
  const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
  const sirina = num(c.sirina) || 95, duzina = num(c.duzina) || 175, klMm = num(c.klMm) || 0, extraMm = num(c.extraMm) || 30;
  const vrh = c.vrh, klTip = c.klTip, dno = c.dno, P = c.positions || {};
  const legend = (c.legend || []).filter((l) => l && l.n);
  const W = 1000, H = 720;
  const s = Math.min(150 / sirina, 300 / duzina);
  const bw = sirina * s, bh = duzina * s;
  const kl = vrh === "klapna" ? Math.min(klMm * s, 64) : (vrh === "header" ? Math.min(extraMm * s, 52) : 0);
  const cx = 250, y0 = 150 + kl, x0 = cx - bw / 2, x1 = cx + bw / 2, y1 = y0 + bh, bulge = Math.min(7, bw * 0.05);
  const kx0 = x0 + 3.5, kx1 = x1 - 3.5, ky = y0 - kl;
  const arr = (x, y, d) => { const a = 4; return d === 'l' ? `M ${q(x)} ${q(y)} l ${a} ${-a / 2} v ${a} z` : d === 'r' ? `M ${q(x)} ${q(y)} l ${-a} ${-a / 2} v ${a} z` : d === 'u' ? `M ${q(x)} ${q(y)} l ${-a / 2} ${a} h ${a} z` : `M ${q(x)} ${q(y)} l ${-a / 2} ${-a} h ${a} z`; };
  const dH = (xa, xb, y, t) => `<line x1="${q(xa)}" y1="${q(y)}" x2="${q(xb)}" y2="${q(y)}" stroke="${INK}" stroke-width=".8"/><path d="${arr(xa, y, 'l')}" fill="${INK}"/><path d="${arr(xb, y, 'r')}" fill="${INK}"/><rect x="${q((xa + xb) / 2 - 17)}" y="${q(y - 8)}" width="34" height="12" fill="#fff"/><text x="${q((xa + xb) / 2)}" y="${q(y + 1.5)}" font-size="10" fill="${INK}" text-anchor="middle" font-family="ui-monospace,Menlo" font-weight="700">${t}</text>`;
  const dV = (ya, yb, x, t) => `<line x1="${q(x)}" y1="${q(ya)}" x2="${q(x)}" y2="${q(yb)}" stroke="${INK}" stroke-width=".8"/><path d="${arr(x, ya, 'u')}" fill="${INK}"/><path d="${arr(x, yb, 'd')}" fill="${INK}"/><rect x="${q(x - 8)}" y="${q((ya + yb) / 2 - 14)}" width="16" height="28" fill="#fff"/><text x="${q(x)}" y="${q((ya + yb) / 2)}" font-size="10" fill="${INK}" text-anchor="middle" font-family="ui-monospace,Menlo" font-weight="700" transform="rotate(-90 ${q(x)} ${q((ya + yb) / 2)})">${t}</text>`;
  const ext = (a, b, cc, dd) => `<line x1="${q(a)}" y1="${q(b)}" x2="${q(cc)}" y2="${q(dd)}" stroke="${INK}" stroke-width=".4" opacity=".55"/>`;
  const euroPath = (ecx, ecy, WW) => { const HH = Math.max(WW * 0.34, 5), Rb = Math.max(WW * 0.16, 3), r = Math.min(HH / 2, 4), left = ecx - WW / 2, right = ecx + WW / 2, top = ecy - HH / 2, bot = ecy + HH / 2; return `<path d="M ${q(left)} ${q(top + r)} Q ${q(left)} ${q(top)} ${q(left + r)} ${q(top)} L ${q(ecx - Rb)} ${q(top)} A ${q(Rb)} ${q(Rb)} 0 0 1 ${q(ecx + Rb)} ${q(top)} L ${q(right - r)} ${q(top)} Q ${q(right)} ${q(top)} ${q(right)} ${q(top + r)} L ${q(right)} ${q(bot - r)} Q ${q(right)} ${q(bot)} ${q(right - r)} ${q(bot)} L ${q(left + r)} ${q(bot)} Q ${q(left)} ${q(bot)} ${q(left)} ${q(bot - r)} Z" fill="#fff" stroke="${INK}" stroke-width="1.6"/>`; };

  let d = `<linearGradient id="pf${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e9eff6"/></linearGradient><linearGradient id="sd${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cbd6e3"/><stop offset=".5" stop-color="#eef3f8"/><stop offset="1" stop-color="#cbd6e3"/></linearGradient><pattern id="grid${u}" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#f1f4f8" stroke-width="1"/></pattern><pattern id="seal${u}" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="5" stroke="${SUB}" stroke-width=".9"/></pattern>`;
  let g = `<rect width="${W}" height="${H}" fill="#fff"/><rect width="640" height="${H}" fill="url(#grid${u})"/><line x1="640" y1="0" x2="640" y2="${H}" stroke="#111827" stroke-width="1"/>`;
  g += `<text x="${cx}" y="80" font-size="12" fill="${SUB}" text-anchor="middle" font-weight="800" letter-spacing="1.5" font-family="Inter">${T("crtez.prednji")}</text>`;
  g += `<ellipse cx="${cx}" cy="${q(y1 + 11)}" rx="${q(bw * 0.5)}" ry="7" fill="${INK}" opacity=".1"/>`;
  const body = `M ${q(x0)} ${q(y0)} C ${q(x0 - bulge)} ${q(y0 + bh * .3)} ${q(x0 - bulge)} ${q(y0 + bh * .7)} ${q(x0)} ${q(y1)} L ${q(x1)} ${q(y1)} C ${q(x1 + bulge)} ${q(y0 + bh * .7)} ${q(x1 + bulge)} ${q(y0 + bh * .3)} ${q(x1)} ${q(y0)} Z`;
  g += `<path d="${body}" fill="url(#pf${u})" stroke="${INK}" stroke-width="1.8"/>`;
  g += `<line x1="${q(cx)}" y1="${q(y0 - 4)}" x2="${q(cx)}" y2="${q(y1 + 6)}" stroke="${LINE}" stroke-width=".5" stroke-dasharray="9 3 2 3"/>`;
  g += `<line x1="${q(x0 + 3.5)}" y1="${q(y0)}" x2="${q(x0 + 3.5)}" y2="${q(y1)}" stroke="${SUB}" stroke-width="1"/><line x1="${q(x1 - 3.5)}" y1="${q(y0)}" x2="${q(x1 - 3.5)}" y2="${q(y1)}" stroke="${SUB}" stroke-width="1"/>`;
  const kom = +c.komore || 1;
  for (let k = 1; k < kom; k++) { const kxx = x0 + bw * k / kom; g += `<line x1="${q(kxx)}" y1="${q(y0)}" x2="${q(kxx)}" y2="${q(y1)}" stroke="${SUB}" stroke-width="1" stroke-dasharray="6 3"/>`; }
  if (dno === "naht" || dno === "faltna" || dno === "kreuz") g += `<line x1="${q(x0 + 2)}" y1="${q(y1 - 3)}" x2="${q(x1 - 2)}" y2="${q(y1 - 3)}" stroke="${INK}" stroke-width="1.3"/>`;
  const f = Math.min(extraMm * s, bh * .13);
  if (dno === "faltna") g += `<path d="M ${q(x0 + 5)} ${q(y1 - 3)} L ${q(cx)} ${q(y1 - 3 - f)} L ${q(x1 - 5)} ${q(y1 - 3)}" stroke="${AMB}" stroke-width="1" stroke-dasharray="5 3" fill="none"/>`;
  // klapna / header
  if (vrh === "klapna") {
    const kp = klTip === "schrag" ? `M ${q(kx0)} ${q(y0)} L ${q(kx0)} ${q(ky + kl * .5)} L ${q(kx1)} ${q(ky)} L ${q(kx1)} ${q(y0)}` : `M ${q(kx0)} ${q(y0)} L ${q(kx0)} ${q(ky)} L ${q(kx1)} ${q(ky)} L ${q(kx1)} ${q(y0)}`;
    g += `<path d="${kp}" fill="#f4f7fb" stroke="${INK}" stroke-width="1.5"/><line x1="${q(kx0)}" y1="${q(y0)}" x2="${q(kx1)}" y2="${q(y0)}" stroke="${SUB}" stroke-width="1" stroke-dasharray="4 2"/>`;
  } else if (vrh === "header") {
    g += `<rect x="${q(kx0)}" y="${q(ky)}" width="${q(kx1 - kx0)}" height="${q(kl)}" fill="#f4f7fb" stroke="${INK}" stroke-width="1.5"/><line x1="${q(kx0)}" y1="${q(y0)}" x2="${q(kx1)}" y2="${q(y0)}" stroke="${SUB}" stroke-width="1" stroke-dasharray="4 2"/>`;
  }
  if (c.adh && (vrh === "klapna" || vrh === "header")) { const ay = ky + Math.max(kl * .5, 6); g += `<rect x="${q(kx0 + 7)}" y="${q(ay)}" width="${q(kx1 - kx0 - 14)}" height="4" rx="1.5" fill="#fde2e2" stroke="${ACC}" stroke-width=".9"/>`; }
  // eurozumba (sombrero) — na unetoj poziciji (od vrha + levo od centra)
  const mm = (v) => num(v) * s;
  const has = (o, ff) => o && o[ff] !== "" && o[ff] != null && !isNaN(num(o[ff]));
  const eV = (P.eurozumba || {}); const eW = (num(eV.sirina) || 32) * s;
  const eTop = (vrh === "klapna" || vrh === "header") ? ky : y0;
  const ex = has(eV, "levo") ? cx + mm(eV.levo) : cx;
  const ey = has(eV, "odVrha") ? eTop + mm(eV.odVrha) : ((vrh === "klapna" || vrh === "header") ? ky + kl * .5 : y0 + 12);
  if (c.euroloch) g += euroPath(ex, ey, eW);
  // stampa — na unetoj poziciji/veličini
  const psx = (P.stampa || {});
  const pw = has(psx, "sirina") ? mm(psx.sirina) : bw * .56;
  const ph = has(psx, "visina") ? mm(psx.visina) : bh * .19;
  const px = has(psx, "levo") ? x0 + mm(psx.levo) : cx - pw / 2;
  const py = has(psx, "odVrha") ? y0 + mm(psx.odVrha) : y0 + bh * .3;
  if (c.stampa) {
    g += `<rect x="${q(px)}" y="${q(py)}" width="${q(pw)}" height="${q(ph)}" rx="2" fill="#0d948810" stroke="${TEAL}" stroke-width="1" stroke-dasharray="4 3"/>`;
    const lines = String(c.stampaText || "ŠTAMPA").split(/\n/); const fs = Math.min(11, ph / (lines.length + 1)); let ty = py + ph / 2 - (lines.length - 1) * fs * .6 + fs * .3;
    for (const l of lines) { g += `<text x="${q(px + pw / 2)}" y="${q(ty)}" font-size="${q(fs)}" fill="${TEAL}" text-anchor="middle" font-weight="700" font-family="Inter">${String(l).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`; ty += fs * 1.25; }
  }
  const pvY = y0 + bh * .62;
  if (c.poprecniVar) g += `<line x1="${q(x0 + 3)}" y1="${q(pvY)}" x2="${q(x1 - 3)}" y2="${q(pvY)}" stroke="${SUB}" stroke-width="1.1" stroke-dasharray="7 3"/>`;
  if (c.anleger) g += `<rect x="${q(x0 + 8)}" y="${q(y0 + 5)}" width="${q(bw - 16)}" height="5" rx="2" fill="#dbeafe" stroke="${BLUE}" stroke-width=".9"/>`;
  if (c.luft) g += `<circle cx="${q(cx)}" cy="${q(y0 + 16)}" r="4.5" fill="#fff" stroke="${INK}" stroke-width="1.6"/>`;
  // KOTE — levo + dole
  g += ext(x0, y1, x0, y1 + 36) + ext(x1, y1, x1, y1 + 36) + dH(x0, x1, y1 + 30, `${sirina}`);
  g += ext(x0, y0, x0 - 42, y0) + ext(x0, y1, x0 - 42, y1) + dV(y0, y1, x0 - 36, `${duzina}`);
  if (kl > 0) g += ext(kx0, ky, x0 - 42, ky) + ext(x0, y0, x0 - 42, y0) + dV(ky, y0, x0 - 64, `${klMm}`);
  // BALONI + LEGENDA (iz legend, samo uključene opcije)
  const anchor = (key) => {
    switch (key) {
      case "euroloch": case "eurozumba": return [ex + eW / 2, ey];
      case "adh": case "adh_traka": return [kx1 - 9, ky + Math.max(kl * .5, 6)];
      case "stampa": return [px + pw, py + ph * .4];
      case "poprecniVar": case "poprecni_var": return [x1 - 3.5, pvY];
      case "bocniVar": case "bocni_var": return [x1 - 3.5, y0 + bh * .82];
      case "faltna": case "falta_dno": return [cx + 30, y1 - 3 - f];
      case "anleger": return [x1 - 12, y0 + 7];
      case "duplofan": return [kx0 + 12, ky + 4];
      case "falznut": case "utor": return [x1 - 3.5, y0 + bh * .38];
      case "luft": case "okrugla_zumba": return [cx, y0 + 16];
      case "kosa_klapna": case "klapna": return [kx1 - 12, ky + 4];
      default: return [x1 - 4, y0 + bh * .5];
    }
  };
  const BX = 440; let by = 100;
  legend.forEach((it, i) => {
    const [ax, ay] = anchor(it.key);
    const col = it.key === "stampa" ? TEAL : (it.key === "faltna" || it.key === "falta_dno" ? AMB : (it.key === "anleger" ? BLUE : (["adh", "adh_traka", "euroloch", "eurozumba"].includes(it.key) ? ACC : SUB)));
    g += `<line x1="${q(ax)}" y1="${q(ay)}" x2="${q(BX - 11)}" y2="${q(by)}" stroke="${col}" stroke-width=".8"/><circle cx="${q(ax)}" cy="${q(ay)}" r="2" fill="${col}"/><circle cx="${q(BX)}" cy="${q(by)}" r="11" fill="#fff" stroke="${col}" stroke-width="1.6"/><text x="${q(BX)}" y="${q(by + 3.8)}" font-size="11.5" fill="${col}" text-anchor="middle" font-weight="900" font-family="Inter">${i + 1}</text>`;
    by += 34;
  });
  // ===== BOČNI PRESEK =====
  const sx = 90, syT = 560, sD = (dno === "faltna" || dno === "kreuz") ? 52 : 26, sH = 150, sby = syT + sH, topW = 10;
  g += `<text x="${sx + sD / 2}" y="${syT - 16}" font-size="11" fill="${SUB}" text-anchor="middle" font-weight="800" letter-spacing="1" font-family="Inter">${T("crtez.presek")}</text>`;
  if (dno === "faltna" || dno === "kreuz") {
    g += `<path d="M ${sx} ${sby} L ${sx} ${sby - 14} C ${sx} ${sby - sH * .5} ${sx + sD / 2 - topW / 2} ${syT + 18} ${sx + sD / 2 - topW / 2} ${syT + 10} L ${sx + sD / 2 + topW / 2} ${syT + 10} C ${sx + sD / 2 + topW / 2} ${syT + 18} ${sx + sD} ${sby - sH * .5} ${sx + sD} ${sby - 14} L ${sx + sD} ${sby} Z" fill="url(#sd${u})" stroke="${INK}" stroke-width="1.7"/>`;
    g += `<path d="M ${sx + sD / 2 - topW / 2} ${syT + 10} L ${sx + sD / 2 - topW / 2} ${syT} L ${sx + sD / 2 + topW / 2} ${syT} L ${sx + sD / 2 + topW / 2} ${syT + 10}" fill="#f4f7fb" stroke="${INK}" stroke-width="1.2"/>`;
    g += `<line x1="${sx}" y1="${sby}" x2="${sx + sD}" y2="${sby}" stroke="${INK}" stroke-width="1.6"/><path d="M ${sx + 3} ${sby} L ${sx + sD / 2} ${sby - 16} L ${sx + sD - 3} ${sby}" stroke="${AMB}" stroke-width="1.1" stroke-dasharray="4 3" fill="none"/>`;
    g += ext(sx, sby, sx, sby + 28) + ext(sx + sD, sby, sx + sD, sby + 28) + dH(sx, sx + sD, sby + 22, `${dno === "faltna" ? extraMm : ""}`);
  } else {
    g += `<rect x="${sx}" y="${syT + 8}" width="${sD}" height="${sH - 8}" fill="url(#sd${u})" stroke="${INK}" stroke-width="1.7"/>`;
    if (dno === "naht") { g += `<rect x="${sx}" y="${sby - 8}" width="${sD}" height="8" fill="url(#seal${u})"/><line x1="${sx}" y1="${sby - 8}" x2="${sx + sD}" y2="${sby - 8}" stroke="${INK}" stroke-width="1.2"/>`; }
    else g += `<line x1="${sx}" y1="${sby}" x2="${sx + sD}" y2="${sby}" stroke="${INK}" stroke-width="1.6"/>`;
  }
  // ===== POGLED ODOZDO =====
  const bx = 320, bY = 575, bW = 170, bDp = (dno === "faltna" || dno === "kreuz") ? 92 : 26;
  g += `<text x="${bx + bW / 2}" y="${bY - 16}" font-size="11" fill="${SUB}" text-anchor="middle" font-weight="800" letter-spacing="1" font-family="Inter">${T("crtez.odozdo")}</text>`;
  g += `<rect x="${bx}" y="${bY}" width="${bW}" height="${bDp}" fill="url(#pf${u})" stroke="${INK}" stroke-width="1.6"/>`;
  if (dno === "faltna") {
    g += `<rect x="${bx}" y="${bY + bDp / 2 - 5}" width="${bW}" height="10" fill="url(#seal${u})"/><line x1="${bx}" y1="${bY + bDp / 2}" x2="${bx + bW}" y2="${bY + bDp / 2}" stroke="${INK}" stroke-width="1.1"/>`;
    g += `<path d="M ${bx} ${bY} L ${bx + bDp / 2} ${bY + bDp / 2} L ${bx} ${bY + bDp}" fill="none" stroke="${AMB}" stroke-width="1" stroke-dasharray="4 3"/><path d="M ${bx + bW} ${bY} L ${bx + bW - bDp / 2} ${bY + bDp / 2} L ${bx + bW} ${bY + bDp}" fill="none" stroke="${AMB}" stroke-width="1" stroke-dasharray="4 3"/>`;
  } else if (dno === "kreuz") {
    g += `<line x1="${bx}" y1="${bY}" x2="${bx + bW}" y2="${bY + bDp}" stroke="${AMB}" stroke-width="1" stroke-dasharray="4 3"/><line x1="${bx + bW}" y1="${bY}" x2="${bx}" y2="${bY + bDp}" stroke="${AMB}" stroke-width="1" stroke-dasharray="4 3"/><rect x="${bx}" y="${bY + bDp / 2 - 4}" width="${bW}" height="8" fill="url(#seal${u})"/>`;
  } else if (dno === "naht") {
    g += `<rect x="${bx}" y="${bY}" width="${bW}" height="${bDp}" fill="url(#seal${u})" opacity=".5"/>`;
  }
  g += ext(bx, bY + bDp, bx, bY + bDp + 28) + ext(bx + bW, bY + bDp, bx + bW, bY + bDp + 28) + dH(bx, bx + bW, bY + bDp + 22, `${sirina}`);
  if (bDp > 30) g += ext(bx + bW, bY, bx + bW + 26, bY) + ext(bx + bW, bY + bDp, bx + bW + 26, bY + bDp) + dV(bY, bY + bDp, bx + bW + 20, `${extraMm}`);
  // ===== LEGENDA DESNO =====
  const LX = 670;
  g += `<text x="${LX}" y="70" font-size="10" fill="${SUB}" font-weight="800" letter-spacing="2" font-family="Inter">MAROPACK D.O.O.</text><text x="${LX}" y="92" font-size="16" fill="${INK}" font-weight="900" font-family="Inter">${T("crtez.naslov")}</text>`;
  const tn = (TIPOVI[c.tip] && TIPOVI[c.tip].n) || "Kesa";
  const meta = [["Tip", tn], ["Dimenzije", sirina + " × " + duzina + " mm"], [vrh === "klapna" ? "Klapna" : "Vrh", vrh === "klapna" ? (klMm + " mm" + (klTip === "schrag" ? " (kosa)" : "")) : vrh], ["Dno", dno === "faltna" ? ("Faltna " + extraMm + " mm") : (dno === "naht" ? "Var na dnu" : (dno === "kreuz" ? "Ukršteno" : "Ravno"))]];
  let my = 116; meta.forEach((m) => { g += `<text x="${LX}" y="${my}" font-size="11" fill="${SUB}" font-family="Inter">${m[0]}</text><text x="${W - 30}" y="${my}" font-size="11" fill="${INK}" text-anchor="end" font-weight="700" font-family="ui-monospace,Menlo">${m[1]}</text><line x1="${LX}" y1="${my + 6}" x2="${W - 30}" y2="${my + 6}" stroke="#eef2f7" stroke-width="1"/>`; my += 23; });
  g += `<text x="${LX}" y="${my + 18}" font-size="11" fill="${SUB}" font-weight="800" letter-spacing="1" font-family="Inter">${T("crtez.pozicije")}</text>`;
  let ly = my + 42;
  if (!legend.length) g += `<text x="${LX}" y="${ly}" font-size="11" fill="${LINE}" font-family="Inter">— nema dodatnih opcija —</text>`;
  legend.forEach((it, i) => {
    const col = it.key === "stampa" ? TEAL : (it.key === "faltna" || it.key === "falta_dno" ? AMB : (it.key === "anleger" ? BLUE : (["adh", "adh_traka", "euroloch", "eurozumba"].includes(it.key) ? ACC : SUB)));
    g += `<circle cx="${LX + 9}" cy="${ly - 4}" r="9" fill="#fff" stroke="${col}" stroke-width="1.5"/><text x="${LX + 9}" y="${ly - 0.3}" font-size="10.5" fill="${col}" text-anchor="middle" font-weight="900" font-family="Inter">${i + 1}</text><text x="${LX + 26}" y="${ly - 6}" font-size="12" fill="${INK}" font-weight="800" font-family="Inter">${String(it.n).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text><text x="${LX + 26}" y="${ly + 8}" font-size="10.5" fill="${SUB}" font-family="Inter">${String(it.v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text><line x1="${LX}" y1="${ly + 16}" x2="${W - 30}" y2="${ly + 16}" stroke="#eef2f7" stroke-width="1"/>`;
    ly += 33;
  });
  return { inner: d + g, vbW: W, vbH: H };
}

function buildSvg(c, u, opt) {
  const sirina = +c.sirina || 95, duzina = +c.duzina || 175, klMm = +c.klMm || 0, extraMm = +c.extraMm || 30;
  const { vrh, klTip, dno, adh, euroloch, luft, stampa, perf } = c;
  const kom = +c.komore || 1;

  const scale = Math.min(168 / sirina, 300 / duzina);
  const bodyW = sirina * scale, bodyH = duzina * scale;
  const klH = vrh === "klapna" ? Math.max(16, klMm * scale) : 0;
  const headH = vrh === "header" ? Math.max(22, extraMm * scale) : 0;
  const dnoH = (dno === "faltna" || dno === "naht" || dno === "kreuz") ? Math.max(14, Math.min(extraMm * scale, 52)) : 0;
  const cx = 205, x0 = cx - bodyW / 2, x1 = cx + bodyW / 2;
  const topY = 88, yHeadBot = topY + headH, yFlapBot = yHeadBot + klH, yOpen = yFlapBot, yBot = yOpen + bodyH;
  const bulge = Math.min(10, bodyW * 0.07);
  const P = c.positions || {};
  const mm = (v) => (Number(String(v ?? "").replace(",", ".")) || 0) * scale;
  const has = (o, f) => o && o[f] !== "" && o[f] != null && !isNaN(Number(String(o[f]).replace(",", ".")));
  const anyPos = (o) => o && ["odVrha", "odDna", "levo", "desno", "sirina", "visina"].some((f) => has(o, f));
  let s = '';

  s += `<g transform="translate(0 ${2 * yBot}) scale(1 -1)" opacity="0.18"><path d="${pillow(x0, yOpen, bodyW, bodyH, bulge)}" fill="url(#refl_${u})"/></g>`;
  s += `<ellipse cx="${cx + 4}" cy="${yBot + 20}" rx="${bodyW * 0.5}" ry="10" fill="#0f172a" opacity="0.18" filter="url(#soft_${u})"/>`;
  s += `<path d="${pillow(x0 + 5, yOpen - 5, bodyW, bodyH, bulge)}" fill="#d8e8e5" opacity="0.5"/>`;
  s += `<path d="${pillow(x0, yOpen, bodyW, bodyH, bulge)}" fill="url(#film_${u})" stroke="#5b7c86" stroke-width="1.3" stroke-opacity="0.5"/>`;
  s += `<clipPath id="cl_${u}"><path d="${pillow(x0, yOpen, bodyW, bodyH, bulge)}"/></clipPath>`;
  s += `<g clip-path="url(#cl_${u})">`;
  s += `<ellipse cx="${cx - bodyW * 0.12}" cy="${yOpen + bodyH * 0.34}" rx="${bodyW * 0.7}" ry="${bodyH * 0.5}" fill="url(#vol_${u})"/>`;
  s += `<polygon points="${x0},${yOpen + bodyH * 0.2} ${x0 + bodyW * 0.4},${yOpen} ${x0 + bodyW * 0.56},${yOpen} ${x0 + bodyW * 0.12},${yBot} ${x0},${yBot}" fill="#ffffff" opacity="0.32"/>`;
  s += `<polygon points="${x0 + bodyW * 0.7},${yOpen} ${x0 + bodyW * 0.8},${yOpen} ${x0 + bodyW * 0.46},${yBot} ${x0 + bodyW * 0.37},${yBot}" fill="#ffffff" opacity="0.16"/>`;
  s += `<path d="M${x0 + bodyW * 0.18} ${yOpen + 10} Q${x0 + bodyW * 0.4} ${yOpen + bodyH * 0.3} ${x0 + bodyW * 0.3} ${yBot - 12}" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.22" filter="url(#soft_${u})"/>`;
  s += `<path d="M${x0 + bodyW * 0.62} ${yOpen + 14} Q${x0 + bodyW * 0.5} ${yOpen + bodyH * 0.45} ${x0 + bodyW * 0.7} ${yBot - 10}" fill="none" stroke="#5b7c86" stroke-width="1.6" stroke-opacity="0.12" filter="url(#soft_${u})"/>`;
  s += `<path d="M${x0 + bodyW * 0.82} ${yOpen + bodyH * 0.2} Q${x0 + bodyW * 0.7} ${yOpen + bodyH * 0.5} ${x0 + bodyW * 0.85} ${yBot - 16}" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-opacity="0.18" filter="url(#soft_${u})"/>`;
  s += `</g>`;
  s += `<path d="${pillow(x0 + 2, yOpen + 2, bodyW - 4, bodyH - 4, bulge)}" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-opacity="0.55"/>`;

  if (stampa) {
    const ps = P.stampa || {};
    if (anyPos(ps)) {
      const sw = has(ps, "sirina") ? mm(ps.sirina) : bodyW * 0.5;
      const sh = has(ps, "visina") ? mm(ps.visina) : (bodyH - dnoH) * 0.4;
      const sy = yOpen + (has(ps, "odVrha") ? mm(ps.odVrha) : 16);
      const sx = has(ps, "levo") ? x0 + mm(ps.levo) : cx - sw / 2;
      s += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="2" fill="#0d9488" fill-opacity="0.06" stroke="#0d9488" stroke-width="0.9" stroke-opacity="0.55" stroke-dasharray="3 3"/>`;
      if (c.stampaText) {
        const escX = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const fs = Math.max(6, Math.min(11, sh / 6));
        const maxCh = Math.max(3, Math.floor((sw - 6) / (fs * 0.55)));
        const lines = [];
        String(c.stampaText).split(/\r?\n/).forEach((raw) => {
          const words = raw.split(/\s+/).filter(Boolean);
          if (!words.length) { lines.push(""); return; }
          let cur = "";
          words.forEach((w) => {
            const t = (cur ? cur + " " : "") + w;
            if (t.length <= maxCh) cur = t; else { if (cur) lines.push(cur); cur = w; }
          });
          if (cur) lines.push(cur);
        });
        const lh = fs + 2;
        let ty = sy + (sh - lines.length * lh) / 2 + fs;
        const cid = "st" + u;
        s += `<clipPath id="${cid}"><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}"/></clipPath><g clip-path="url(#${cid})">`;
        lines.forEach((ln) => { if (ln) s += `<text x="${sx + sw / 2}" y="${ty}" font-size="${fs.toFixed(1)}" fill="#0f766e" text-anchor="middle" font-weight="600">${escX(ln)}</text>`; ty += lh; });
        s += `</g>`;
      } else {
        s += `<text x="${sx + sw / 2}" y="${sy + sh / 2 + 3}" font-size="9" fill="#0d9488" text-anchor="middle" opacity="0.7">štampa</text>`;
      }
      if (has(ps, "odVrha")) s += kotaV(sx - 10, yOpen, sy, sx, `${ps.odVrha} mm`);
      if (has(ps, "levo")) s += kotaH(sy + sh + 12, x0, sx, sy + sh, `${ps.levo} mm`);
      if (has(ps, "sirina")) s += kotaH(sy - 10, sx, sx + sw, sy, `${ps.sirina} mm`);
      if (has(ps, "visina")) s += kotaV(sx + sw + 12, sy, sy + sh, sx + sw, `${ps.visina} mm`);
    } else {
      s += `<rect x="${x0 + 13}" y="${yOpen + 16}" width="${bodyW - 26}" height="${bodyH - dnoH - 30}" rx="4" fill="none" stroke="#0d9488" stroke-width="0.7" stroke-opacity="0.35" stroke-dasharray="3 3"/>`;
    }
  }

  if (vrh === "header") {
    s += `<path d="${rr(x0, topY, bodyW, headH, 6)}" fill="url(#hdr_${u})" stroke="#5b7c86" stroke-width="1.1" stroke-opacity="0.55"/>`;
    s += `<rect x="${x0}" y="${yHeadBot - 2.5}" width="${bodyW}" height="5" fill="#9fb6bd" opacity="0.85"/>`;
    for (let xx = x0 + 3; xx < x1; xx += 5) s += `<line x1="${xx}" y1="${yHeadBot - 2.5}" x2="${xx - 3}" y2="${yHeadBot + 2.5}" stroke="#ffffff" stroke-width="0.6" stroke-opacity="0.7"/>`;
  }

  if (vrh === "klapna") {
    const ky0 = headH > 0 ? yHeadBot : topY, kh = yFlapBot - ky0, cut = klTip === "schrag" ? Math.min(bodyW * 0.26, kh * 0.85) : 0;
    s += `<rect x="${x0}" y="${yOpen}" width="${bodyW}" height="16" fill="url(#fsh_${u})" clip-path="url(#cl_${u})"/>`;
    if (klTip === "schrag") s += `<path d="M${x0} ${yFlapBot} L${x0} ${ky0 + cut} L${x0 + cut} ${ky0} L${x1 - cut} ${ky0} L${x1} ${ky0 + cut} L${x1} ${yFlapBot} Z" fill="url(#flap_${u})" stroke="#5b7c86" stroke-width="1.1" stroke-opacity="0.55"/>`;
    else s += `<path d="${rr(x0, ky0, bodyW, kh, 5)}" fill="url(#flap_${u})" stroke="#5b7c86" stroke-width="1.1" stroke-opacity="0.55"/>`;
    s += `<line x1="${x0 + 5}" y1="${ky0 + 3}" x2="${x1 - 5}" y2="${ky0 + 3}" stroke="#ffffff" stroke-width="1" stroke-opacity="0.6"/>`;
  } else if (vrh === "otvor") {
    s += `<rect x="${x0 + 2}" y="${yOpen}" width="${bodyW - 4}" height="8" fill="url(#osh_${u})" clip-path="url(#cl_${u})"/>`;
  }

  if (adh) {
    let ay; if (vrh === "klapna") { const ky0 = headH > 0 ? yHeadBot : topY; ay = ky0 + (yFlapBot - ky0) * 0.45; } else ay = yOpen + 11;
    s += `<rect x="${x0 + 13}" y="${ay}" width="${bodyW - 26}" height="9" rx="2" fill="#fde68a" fill-opacity="0.88" stroke="#d99a06" stroke-width="0.8"/>`;
    s += `<rect x="${x0 + 13}" y="${ay + 1}" width="${bodyW - 26}" height="3" rx="1.5" fill="#ffffff" opacity="0.55"/>`;
    s += `<path d="M${x1 - 13} ${ay} q12 -7 17 0 l-5 4 Z" fill="#fffbeb" stroke="#d99a06" stroke-width="0.7"/>`;
  }

  if (euroloch) {
    const pe = P.eurozumba || {};
    const q = (n) => Math.round(n * 10) / 10;
    const euroPath = (ecx, ecy, W) => {
      const H = Math.max(W * 0.34, 5), Rb = Math.max(W * 0.16, 3), r = Math.min(H / 2, 4);
      const left = ecx - W / 2, right = ecx + W / 2, top = ecy - H / 2, bot = ecy + H / 2;
      return `<path d="M ${q(left)} ${q(top + r)} Q ${q(left)} ${q(top)} ${q(left + r)} ${q(top)} L ${q(ecx - Rb)} ${q(top)} A ${q(Rb)} ${q(Rb)} 0 0 1 ${q(ecx + Rb)} ${q(top)} L ${q(right - r)} ${q(top)} Q ${q(right)} ${q(top)} ${q(right)} ${q(top + r)} L ${q(right)} ${q(bot - r)} Q ${q(right)} ${q(bot)} ${q(right - r)} ${q(bot)} L ${q(left + r)} ${q(bot)} Q ${q(left)} ${q(bot)} ${q(left)} ${q(bot - r)} Z" fill="#ffffff" stroke="#0f172a" stroke-width="1.6"/>`;
    };
    if (anyPos(pe)) {
      const W = has(pe, "sirina") ? mm(pe.sirina) : 22;
      const ey = yOpen + (has(pe, "odVrha") ? mm(pe.odVrha) : 22);
      const ex = has(pe, "levo") ? x0 + mm(pe.levo) : cx;
      s += euroPath(ex, ey, W);
      if (has(pe, "sirina")) s += `<text x="${q(ex + W / 2 + 5)}" y="${q(ey + 3)}" font-size="9" fill="#475569">${pe.sirina}</text>`;
      if (has(pe, "odVrha")) s += kotaV(ex - W / 2 - 12, yOpen, ey, ex, `${pe.odVrha} mm`);
      if (has(pe, "levo")) s += kotaH(ey + 16, x0, ex, ey, `${pe.levo} mm`);
    } else {
      const ey = vrh === "header" ? topY + headH * 0.55 : yOpen + 22, W = Math.min(bodyW * 0.42, 40);
      s += euroPath(cx, ey, W);
    }
  }
  if (luft) {
    const pl = (anyPos(P.okrugla_zumba) ? P.okrugla_zumba : (anyPos(P.busene_rupe) ? P.busene_rupe : {}));
    if (anyPos(pl)) {
      const dia = has(pl, "sirina") ? mm(pl.sirina) : 8, r = Math.max(dia / 2, 2);
      const lx = has(pl, "levo") ? x0 + mm(pl.levo) : x1 - 18;
      const ly = yOpen + (has(pl, "odVrha") ? mm(pl.odVrha) : (euroloch ? 46 : 34));
      s += `<circle cx="${lx}" cy="${ly}" r="${r}" fill="#e9eef2" stroke="#7c8a93" stroke-width="1"/><circle cx="${lx - r * 0.3}" cy="${ly - r * 0.3}" r="${r * 0.4}" fill="#fff" opacity="0.8"/>`;
      if (has(pl, "sirina")) s += `<text x="${lx + r + 3}" y="${ly + 3}" font-size="9" fill="#475569">Ø${pl.sirina}</text>`;
      if (has(pl, "odVrha")) s += kotaV(lx - r - 12, yOpen, ly, lx, `${pl.odVrha} mm`);
      if (has(pl, "levo")) s += kotaH(ly + r + 14, x0, lx, ly, `${pl.levo} mm`);
    } else {
      const lx = x1 - 18, ly = yOpen + (euroloch ? 46 : 34);
      s += `<circle cx="${lx}" cy="${ly}" r="4" fill="#e9eef2" stroke="#7c8a93" stroke-width="1"/><circle cx="${lx - 1}" cy="${ly - 1}" r="1.6" fill="#fff" opacity="0.8"/>`;
    }
  }

  // --- dodatne tehničke opcije (sve ostavljaju trag na crtežu) ---
  if (c.ojacanje) { // ojačan rub oko otvora (dupla ivica)
    s += `<line x1="${x0 + 3}" y1="${yOpen + 2}" x2="${x1 - 3}" y2="${yOpen + 2}" stroke="#475569" stroke-width="2.4" stroke-opacity="0.45"/>`;
    s += `<line x1="${x0 + 3}" y1="${yOpen + 5}" x2="${x1 - 3}" y2="${yOpen + 5}" stroke="#475569" stroke-width="1" stroke-opacity="0.35"/>`;
  }
  if (c.duplofan) { // duplofan traka (pojačanje pri vrhu)
    const dy = yOpen + (vrh === "klapna" ? 30 : 13);
    s += `<rect x="${x0 + 8}" y="${dy}" width="${bodyW - 16}" height="7" rx="2" fill="#bfdbfe" fill-opacity="0.7" stroke="#3b82f6" stroke-width="0.7"/>`;
  }
  if (c.anleger) { // anleger / header umetak pri vrhu tela
    s += `<rect x="${x0 + 6}" y="${yOpen + 3}" width="${bodyW - 12}" height="13" rx="2" fill="#e2e8f0" fill-opacity="0.85" stroke="#94a3b8" stroke-width="0.8"/>`;
    for (let xx = x0 + 10; xx < x1 - 8; xx += 5) s += `<line x1="${xx}" y1="${yOpen + 3}" x2="${xx - 3}" y2="${yOpen + 16}" stroke="#94a3b8" stroke-width="0.4"/>`;
  }
  if (c.falznut && vrh !== "klapna") { // utor / žleb (Falznut)
    const fy = yOpen + 8; s += `<line x1="${x0 + 4}" y1="${fy}" x2="${x1 - 4}" y2="${fy}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="2 2"/>`;
  }
  if (c.bocniVar) { // bočni var (šav uz obe ivice)
    for (const ex of [x0, x1 - 4]) {
      s += `<rect x="${ex}" y="${yOpen}" width="4" height="${bodyH - dnoH}" fill="#cbd5e1" opacity="0.6"/>`;
      for (let yy = yOpen + 4; yy < yBot - dnoH; yy += 5) s += `<line x1="${ex}" y1="${yy}" x2="${ex + 4}" y2="${yy - 3}" stroke="#94a3b8" stroke-width="0.4"/>`;
    }
  }
  if (c.poprecniVar) { // poprečni / kontinualni / toplotni var (šav popreko)
    const wy = yOpen + (bodyH - dnoH) * 0.5;
    s += `<rect x="${x0}" y="${wy - 2}" width="${bodyW}" height="5" fill="#cbd5e1" opacity="0.8"/>`;
    for (let xx = x0 + 2; xx < x1; xx += 4) s += `<line x1="${xx}" y1="${wy - 2}" x2="${xx - 3}" y2="${wy + 3}" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.6"/>`;
  }
  if (c.otvorDno) { // otvor na dnu
    s += `<line x1="${x0 + 6}" y1="${yBot - 2}" x2="${x1 - 6}" y2="${yBot - 2}" stroke="#dc2626" stroke-width="1.1" stroke-dasharray="5 3"/>`;
  }

  if (kom > 1) { for (let i = 1; i < kom; i++) { const xx = x0 + bodyW * i / kom; s += `<line x1="${xx}" y1="${yOpen + 6}" x2="${xx}" y2="${yBot - dnoH - 6}" stroke="#9fb6bd" stroke-width="2" stroke-opacity="0.45"/><line x1="${xx}" y1="${yOpen + 6}" x2="${xx}" y2="${yBot - dnoH - 6}" stroke="#ffffff" stroke-width="0.6" stroke-opacity="0.7"/>`; } }

  if (perf === "easy") { const py = yOpen + (vrh === "klapna" ? 22 : 26); s += `<line x1="${x0 + 12}" y1="${py}" x2="${x1 - 12}" y2="${py}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="1.5 3"/>`; }
  if (perf === "abreiss") { s += `<line x1="${x0}" y1="${yOpen}" x2="${x1}" y2="${yOpen}" stroke="#b9c4cc" stroke-width="1" stroke-dasharray="2 2.5"/><line x1="${x0}" y1="${yBot}" x2="${x1}" y2="${yBot}" stroke="#b9c4cc" stroke-width="1" stroke-dasharray="2 2.5"/>`; }
  if (perf === "heiss") { s += `<g clip-path="url(#cl_${u})">`; for (let yy = yOpen + 20; yy < yBot - dnoH - 8; yy += 14) for (let xx = x0 + 16; xx < x1 - 12; xx += 14) s += `<circle cx="${xx}" cy="${yy}" r="0.8" fill="#64748b" opacity="0.55"/>`; s += `</g>`; }

  if (dno === "faltna") { const gy = yBot - dnoH; s += `<path d="M${x0} ${gy} L${cx} ${yBot} L${x1} ${gy} Z" fill="#aecdc8" opacity="0.5"/><path d="M${x0} ${gy} L${cx} ${gy + dnoH * 0.55} L${x1} ${gy}" fill="none" stroke="#5b7c86" stroke-width="0.9" stroke-opacity="0.6"/><line x1="${x0}" y1="${gy}" x2="${x1}" y2="${gy}" stroke="#ffffff" stroke-width="0.8" stroke-opacity="0.5"/>`; }
  else if (dno === "naht") { s += `<rect x="${x0}" y="${yBot - 6}" width="${bodyW}" height="6" rx="2" fill="#aebfc6" opacity="0.9"/>`; for (let xx = x0 + 2; xx < x1; xx += 4) s += `<line x1="${xx}" y1="${yBot - 6}" x2="${xx - 3}" y2="${yBot}" stroke="#fff" stroke-width="0.5" stroke-opacity="0.6"/>`; s += `<line x1="${x0}" y1="${yBot - 6}" x2="${x1}" y2="${yBot - 6}" stroke="#ffffff" stroke-width="0.7" stroke-opacity="0.6"/>`; }
  else if (dno === "kreuz") { const gy = yBot - dnoH; s += `<path d="${rr(x0, gy, bodyW, dnoH, 4)}" fill="#cfe0dd" opacity="0.6" stroke="#5b7c86" stroke-width="0.8" stroke-opacity="0.5"/><line x1="${x0}" y1="${gy}" x2="${x1}" y2="${yBot}" stroke="#5b7c86" stroke-width="0.7" stroke-opacity="0.5"/><line x1="${x1}" y1="${gy}" x2="${x0}" y2="${yBot}" stroke="#5b7c86" stroke-width="0.7" stroke-opacity="0.5"/>`; }

  if (opt.bottomViews) {
    const bx = 452, bw = 212;
    const p1y = 98, p1h = 190, xc = bx + bw / 2, g = 18, xL = xc - g, xR = xc + g, wy0 = p1y + 50, wyB = p1y + p1h - 44;
    s += `<rect x="${bx}" y="${p1y}" width="${bw}" height="${p1h}" rx="12" fill="#ffffff" stroke="#dbe2e8"/>`;
    s += `<text x="${xc}" y="${p1y + 22}" font-size="10.5" font-weight="800" fill="#0f766e" text-anchor="middle" letter-spacing="0.5">DNO — BOČNI PRESEK</text>`;
    s += `<line x1="${xL}" y1="${wy0}" x2="${xL}" y2="${wyB}" stroke="#5b7c86" stroke-width="1.6"/><line x1="${xR}" y1="${wy0}" x2="${xR}" y2="${wyB}" stroke="#5b7c86" stroke-width="1.6"/><text x="${xc}" y="${wy0 - 8}" font-size="9" fill="#94a3b8" text-anchor="middle">prednja / zadnja strana</text>`;
    if (dno === "faltna") { const d = Math.max(24, Math.min(extraMm * scale * 1.6, 80)); s += `<path d="M${xL} ${wyB} L${xc} ${wyB - d} L${xR} ${wyB}" fill="#bcd4d0" fill-opacity="0.5" stroke="#5b7c86" stroke-width="1.4" stroke-linejoin="round"/><line x1="${xL}" y1="${wyB}" x2="${xR}" y2="${wyB}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 2"/><line x1="${xR + 16}" y1="${wyB - d}" x2="${xR + 16}" y2="${wyB}" stroke="#94a3b8" stroke-width="1"/><path d="M${xR + 16} ${wyB - d} l-3 5 l6 0 Z" fill="#94a3b8"/><path d="M${xR + 16} ${wyB} l-3 -5 l6 0 Z" fill="#94a3b8"/><text x="${xR + 22}" y="${wyB - d / 2 + 3}" font-size="10" fill="#475569">${extraMm}mm</text><text x="${xc}" y="${wyB + 24}" font-size="10" fill="#64748b" text-anchor="middle">faltna — uvučeno dno</text>`; }
    else if (dno === "naht") { s += `<rect x="${xL}" y="${wyB - 2}" width="${xR - xL}" height="6" rx="2" fill="#aebfc6"/>`; for (let xx = xL + 2; xx < xR; xx += 4) s += `<line x1="${xx}" y1="${wyB - 2}" x2="${xx - 3}" y2="${wyB + 4}" stroke="#fff" stroke-width="0.6" stroke-opacity="0.7"/>`; s += `<text x="${xc}" y="${wyB + 24}" font-size="10" fill="#64748b" text-anchor="middle">ultrazvučni šav 3 mm</text>`; }
    else if (dno === "kreuz") { s += `<rect x="${xL}" y="${wyB - 10}" width="${xR - xL}" height="12" rx="2" fill="#cfe0dd" stroke="#5b7c86" stroke-width="1"/><line x1="${xL}" y1="${wyB - 10}" x2="${xR}" y2="${wyB + 2}" stroke="#5b7c86" stroke-width="0.7"/><text x="${xc}" y="${wyB + 24}" font-size="10" fill="#64748b" text-anchor="middle">ukršteno (kreuz) dno</text>`; }
    else { s += `<line x1="${xL}" y1="${wyB}" x2="${xR}" y2="${wyB}" stroke="#5b7c86" stroke-width="1.8"/><text x="${xc}" y="${wyB + 24}" font-size="10" fill="#64748b" text-anchor="middle">ravno (zavareno) dno</text>`; }

    const p2y = 300, p2h = 176, cyB = p2y + p2h / 2 + 8;
    s += `<rect x="${bx}" y="${p2y}" width="${bw}" height="${p2h}" rx="12" fill="#ffffff" stroke="#dbe2e8"/>`;
    s += `<text x="${xc}" y="${p2y + 22}" font-size="10.5" font-weight="800" fill="#0f766e" text-anchor="middle" letter-spacing="0.5">DNO — POGLED ODOZDO</text>`;
    const rw = Math.min(bw * 0.56, bodyW * 1.0), rh = (dno === "faltna") ? 64 : (dno === "naht") ? 20 : 50, rx0 = xc - rw / 2, ry0 = cyB - rh / 2;
    if (dno === "naht") {
      s += `<rect x="${rx0}" y="${cyB - 5}" width="${rw}" height="10" rx="2" fill="#eef6f5" stroke="#5b7c86" stroke-width="1.2"/><line x1="${rx0}" y1="${cyB}" x2="${rx0 + rw}" y2="${cyB}" stroke="#5b7c86" stroke-width="1.6"/>`;
      for (let xx = rx0 + 3; xx < rx0 + rw; xx += 5) s += `<line x1="${xx}" y1="${cyB - 2}" x2="${xx - 3}" y2="${cyB + 2}" stroke="#94a3b8" stroke-width="0.6"/>`;
      s += `<text x="${xc}" y="${cyB + 26}" font-size="10" fill="#64748b" text-anchor="middle">ravna linija šava</text>`;
    } else {
      s += `<rect x="${rx0}" y="${ry0}" width="${rw}" height="${rh}" rx="3" fill="#eef6f5" stroke="#5b7c86" stroke-width="1.2"/>`;
      if (dno === "faltna") {
        s += `<line x1="${rx0}" y1="${cyB}" x2="${rx0 + rw}" y2="${cyB}" stroke="#5b7c86" stroke-width="1" stroke-dasharray="4 3"/>`;
        s += `<line x1="${rx0}" y1="${ry0}" x2="${rx0 + 20}" y2="${cyB}" stroke="#5b7c86" stroke-width="0.8"/><line x1="${rx0}" y1="${ry0 + rh}" x2="${rx0 + 20}" y2="${cyB}" stroke="#5b7c86" stroke-width="0.8"/>`;
        s += `<line x1="${rx0 + rw}" y1="${ry0}" x2="${rx0 + rw - 20}" y2="${cyB}" stroke="#5b7c86" stroke-width="0.8"/><line x1="${rx0 + rw}" y1="${ry0 + rh}" x2="${rx0 + rw - 20}" y2="${cyB}" stroke="#5b7c86" stroke-width="0.8"/>`;
        s += `<text x="${xc}" y="${ry0 + rh + 22}" font-size="10" fill="#64748b" text-anchor="middle">faltna razvučena (aufgeklappt)</text>`;
      } else if (dno === "kreuz") {
        s += `<line x1="${rx0}" y1="${ry0}" x2="${rx0 + rw}" y2="${ry0 + rh}" stroke="#5b7c86" stroke-width="0.9"/><line x1="${rx0 + rw}" y1="${ry0}" x2="${rx0}" y2="${ry0 + rh}" stroke="#5b7c86" stroke-width="0.9"/>`;
        s += `<rect x="${xc - rw * 0.16}" y="${cyB - rh * 0.2}" width="${rw * 0.32}" height="${rh * 0.4}" fill="#fff" stroke="#5b7c86" stroke-width="0.9"/>`;
        s += `<text x="${xc}" y="${ry0 + rh + 22}" font-size="10" fill="#64748b" text-anchor="middle">ukršteni (kreuz) preklop</text>`;
      } else {
        s += `<text x="${xc}" y="${ry0 + rh + 22}" font-size="10" fill="#64748b" text-anchor="middle">ravno dno</text>`;
      }
      s += kotaH(ry0 - 14, rx0, rx0 + rw, ry0, `${sirina} mm`);
    }
  }

  if (opt.kote) {
    const objTop = vrh === "otvor" ? yOpen : topY;
    s += kotaH(objTop - 24, x0, x1, objTop, `${sirina} mm`);
    s += kotaV(x0 - 26, yOpen, yBot, x0, `${duzina} mm`);
    if (vrh === "klapna") s += kotaV(x1 + 24, headH > 0 ? yHeadBot : topY, yOpen, x1, `${klMm}`);
    if (vrh === "header") s += kotaV(x1 + 24, topY, yHeadBot, x1, `${extraMm}`);
  }

  if (opt.info) {
    const tname = (TIPOVI[c.tip] && TIPOVI[c.tip].n) || "Kesa";
    const chips = [];
    if (vrh === "klapna") chips.push(klTip === "schrag" ? "kosa klapna" : "klapna");
    if (vrh === "header") chips.push("header");
    if (dno === "faltna") chips.push("faltna dno"); if (dno === "naht") chips.push("ultrazv. šav"); if (dno === "kreuz") chips.push("ukršteno dno");
    if (adh) chips.push("ADH"); if (euroloch) chips.push("euroloch"); if (luft) chips.push("vazduš. otvor");
    if (perf !== "none") chips.push(perf === "easy" ? "easy-open" : perf === "abreiss" ? "rolna" : "heißnadel"); if (kom > 1) chips.push(kom + " komore");
    if (c.duplofan) chips.push("duplofan"); if (c.anleger) chips.push("anleger"); if (c.falznut) chips.push("utor/falznut");
    if (c.bocniVar) chips.push("bočni var"); if (c.poprecniVar) chips.push("poprečni var");
    if (c.otvorDno) chips.push("otvor na dnu"); if (c.ojacanje) chips.push("ojačanje"); if (c.pakovanjeTrn) chips.push("pakov. na trnu");
    s += `<text x="${cx}" y="${yBot + 54}" font-size="15" font-weight="800" fill="#0f172a" text-anchor="middle">${tname}</text>`;
    s += `<text x="${cx}" y="${yBot + 72}" font-size="11" fill="#64748b" text-anchor="middle">${sirina} × ${duzina} mm · BOPP/CPP</text>`;
    let chx = cx - chips.reduce((a, ch) => a + ch.length * 6.2 + 22, 0) / 2, chy = yBot + 88;
    for (const ch of chips) { const w = ch.length * 6.2 + 16; s += `<rect x="${chx}" y="${chy}" width="${w}" height="20" rx="10" fill="#ccfbf1" stroke="#0d9488" stroke-opacity="0.3"/><text x="${chx + w / 2}" y="${chy + 14}" font-size="10.5" fill="#0f766e" text-anchor="middle" font-weight="600">${ch}</text>`; chx += w + 6; }
  }

  const defs = `<defs>
    <linearGradient id="film_${u}" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.96"/><stop offset="0.5" stop-color="#e9f4f3"/><stop offset="1" stop-color="#d6e7e4"/></linearGradient>
    <radialGradient id="vol_${u}" cx="0.4" cy="0.32" r="0.75"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="0.6" stop-color="#ffffff" stop-opacity="0.06"/><stop offset="1" stop-color="#9fc4bf" stop-opacity="0.12"/></radialGradient>
    <linearGradient id="flap_${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3efed"/></linearGradient>
    <linearGradient id="hdr_${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfdfd"/><stop offset="1" stop-color="#eef3f5"/></linearGradient>
    <linearGradient id="fsh_${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#334155" stop-opacity="0.22"/><stop offset="1" stop-color="#334155" stop-opacity="0"/></linearGradient>
    <linearGradient id="osh_${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#334155" stop-opacity="0.16"/><stop offset="1" stop-color="#334155" stop-opacity="0"/></linearGradient>
    <linearGradient id="refl_${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe3e0" stop-opacity="0.8"/><stop offset="1" stop-color="#cfe3e0" stop-opacity="0"/></linearGradient>
    <filter id="soft_${u}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.5"/></filter>
  </defs>`;

  const vbW = opt.bottomViews ? 700 : 430;
  return { inner: defs + s, vbW };
}

// SVG kao string (za HTML-string renderere, npr. NalogLayoutPRO)
export function kesaSvgString(config = {}, opts = {}) {
  const c = { ...DEFAULTS, ...config };
  const u = "k" + Math.random().toString(36).slice(2, 8);
  const { inner, vbW, vbH } = buildSvgPro(c, u, opts.lang || "sr");
  return `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">${inner}</svg>`;
}

// Vrati crtež kao SVG string (za HTML-string kontekste, npr. NalogLayoutPRO).
export default function CrtezKese({ config = {}, width = "100%", showKote = true, showBottomViews = true, showInfo = true, style }) {
  const { lang } = useLang();
  const u = useMemo(() => "k" + Math.random().toString(36).slice(2, 8), []);
  const c = { ...DEFAULTS, ...config };
  const { inner, vbW, vbH } = buildSvgPro(c, u, lang);
  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      width={width}
      xmlns="http://www.w3.org/2000/svg"
      style={{ maxWidth: "100%", height: "auto", ...style }}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
