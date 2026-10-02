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
    flach: { n: "Flachbeutel", vrh: "otvor", klTip: "rect", dno: "ravno", adh: 0, euroloch: 0, perf: "none", komore: 1 },
    klappen: { n: "Klappenbeutel", vrh: "klapna", klTip: "rect", dno: "ravno", adh: 1, euroloch: 0, perf: "none", komore: 1 },
    bodenfalten: { n: "Bodenfaltenbeutel", vrh: "klapna", klTip: "rect", dno: "faltna", adh: 1, euroloch: 0, perf: "none", komore: 1 },
    bodennaht: { n: "Bodennahtbeutel", vrh: "otvor", klTip: "rect", dno: "naht", adh: 0, euroloch: 1, perf: "none", komore: 1 },
    header: { n: "Headerbeutel", vrh: "header", klTip: "rect", dno: "naht", adh: 1, euroloch: 1, perf: "none", komore: 1 },
    banderole: { n: "Banderole", vrh: "otvor", klTip: "rect", dno: "ravno", adh: 1, euroloch: 0, perf: "none", komore: 1 },
    rolle: { n: "Beutel auf Rolle", vrh: "otvor", klTip: "rect", dno: "ravno", adh: 0, euroloch: 0, perf: "abreiss", komore: 1 },
    brief: { n: "Briefhülle", vrh: "klapna", klTip: "schrag", dno: "ravno", adh: 1, euroloch: 0, perf: "none", komore: 1 },
    doppel: { n: "Doppeltasche", vrh: "otvor", klTip: "rect", dno: "ravno", adh: 0, euroloch: 0, perf: "none", komore: 2 },
    easy: { n: "Easy-Opening Beutel", vrh: "klapna", klTip: "rect", dno: "naht", adh: 1, euroloch: 0, perf: "easy", komore: 1 },
    flaschen: { n: "Flaschenbeutel", vrh: "klapna", klTip: "rect", dno: "ravno", adh: 1, euroloch: 0, perf: "none", komore: 1 },
    heiss: { n: "Heißgenadelte Beutel", vrh: "otvor", klTip: "rect", dno: "ravno", adh: 0, euroloch: 0, perf: "heiss", komore: 1 },
    kreuz: { n: "Kreuzbodenbeutel", vrh: "otvor", klTip: "rect", dno: "kreuz", adh: 0, euroloch: 0, perf: "none", komore: 1 },
    mehr: { n: "Mehrkammerbeutel", vrh: "klapna", klTip: "rect", dno: "naht", adh: 1, euroloch: 0, perf: "none", komore: 3 },
    zweifarbig: { n: "Zweifarbige Beutel", vrh: "otvor", klTip: "rect", dno: "naht", adh: 0, euroloch: 0, perf: "none", komore: 1 },
    zweikammer: { n: "Zweikammerbeutel", vrh: "klapna", klTip: "rect", dno: "naht", adh: 1, euroloch: 0, perf: "none", komore: 2 },
};

export function presetTip(tip) {
    const t = TIPOVI[tip] || TIPOVI.flach;
    return { tip, vrh: t.vrh, klTip: t.klTip, dno: t.dno, adh: !!t.adh, euroloch: !!t.euroloch, perf: t.perf, komore: t.komore };
}

// Adapter: kesa objekat iz templejta/naloga -> config za CrtezKese.
// Tip kese (maropack ključ) postavlja OBLIK (vrh, dno-osnova, broj komora);
// sve DEKORACIJE/OPCIJE (štampa, ADH, eurozumba, perforacija…) se crtaju SAMO
// ako su ČEKIRANE opcije. Kad korisnik odčekira opciju — nestaje sa skice.
export function kesaToConfig(kesa = {}) {
    const o = kesa.options || {};
    const base = presetTip(kesa.tipKese);
    const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
    const klapnaMm = num(kesa.klapna);
    const faltaMm = num(kesa.falta);
    const vrh = base.vrh;                                   // oblik vrha = tip kese
    const dno = o.falta_dno ? "faltna" : (o.var_dno ? "naht" : base.dno);  // dno: tip + opcije
    return {
        tip: kesa.tipKese || "",
        vrh,
        klTip: o.kosa_klapna ? "schrag" : base.klTip,
        dno,
        // ── OPCIJE: crtaju se SAMO ako su čekirane (više se ne forsiraju iz tipa) ──
        adh: !!o.adh_traka,          // ADH lepljiva traka — samo ako je čekirana opcija
        euroloch: !!o.eurozumba,     // eurozumba — samo ako je čekirana
        luft: !!(o.okrugla_zumba || o.busene_rupe),
        stampa: !!o.stampa,          // ŠTAMPA — samo ako je čekirana (ranije: podrazumevano DA → curilo na skicu)
        perf: o.mikroperforacija ? "heiss" : (o.poprecna_perf ? "easy" : (o.abreiss ? "abreiss" : "none")),
        komore: base.komore || 1,    // broj komora = tip kese
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
    adh: false, euroloch: false, luft: false, stampa: false,
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
    const W = 520, H = 1040;
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
    let g = `<rect width="${W}" height="${H}" fill="#fff"/><rect width="${W}" height="740" fill="url(#grid${u})"/>`;
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
    if (vrh === "klapna") {
        const kp = klTip === "schrag" ? `M ${q(kx0)} ${q(y0)} L ${q(kx0)} ${q(ky + kl * .5)} L ${q(kx1)} ${q(ky)} L ${q(kx1)} ${q(y0)}` : `M ${q(kx0)} ${q(y0)} L ${q(kx0)} ${q(ky)} L ${q(kx1)} ${q(ky)} L ${q(kx1)} ${q(y0)}`;
        g += `<path d="${kp}" fill="#f4f7fb" stroke="${INK}" stroke-width="1.5"/><line x1="${q(kx0)}" y1="${q(y0)}" x2="${q(kx1)}" y2="${q(y0)}" stroke="${SUB}" stroke-width="1" stroke-dasharray="4 2"/>`;
    } else if (vrh === "header") {
        g += `<rect x="${q(kx0)}" y="${q(ky)}" width="${q(kx1 - kx0)}" height="${q(kl)}" fill="#f4f7fb" stroke="${INK}" stroke-width="1.5"/><line x1="${q(kx0)}" y1="${q(y0)}" x2="${q(kx1)}" y2="${q(y0)}" stroke="${SUB}" stroke-width="1" stroke-dasharray="4 2"/>`;
    }
    if (c.adh && (vrh === "klapna" || vrh === "header")) { const ay = ky + Math.max(kl * .5, 6); g += `<rect x="${q(kx0 + 7)}" y="${q(ay)}" width="${q(kx1 - kx0 - 14)}" height="4" rx="1.5" fill="#fde2e2" stroke="${ACC}" stroke-width=".9"/>`; }
    const mm = (v) => num(v) * s;
    const has = (o, ff) => o && o[ff] !== "" && o[ff] != null && !isNaN(num(o[ff]));
    const eV = (P.eurozumba || {}); const eW = (num(eV.sirina) || 32) * s;
    const eTop = (vrh === "klapna" || vrh === "header") ? ky : y0;
    const ex = has(eV, "levo") ? cx + mm(eV.levo) : cx;
    const ey = has(eV, "odVrha") ? eTop + mm(eV.odVrha) : ((vrh === "klapna" || vrh === "header") ? ky + kl * .5 : y0 + 12);
    if (c.euroloch) g += euroPath(ex, ey, eW);
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
    g += ext(x0, y1, x0, y1 + 36) + ext(x1, y1, x1, y1 + 36) + dH(x0, x1, y1 + 30, `${sirina}`);
    g += ext(x0, y0, x0 - 42, y0) + ext(x0, y1, x0 - 42, y1) + dV(y0, y1, x0 - 36, `${duzina}`);
    if (kl > 0) g += ext(kx0, ky, x0 - 42, ky) + ext(x0, y0, x0 - 42, y0) + dV(ky, y0, x0 - 64, `${klMm}`);
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
            case "kosa_klapna": case "ukosena_klapna": case "klapna": return [kx1 - 12, ky + 4];
            case "perf_otkinuti": case "perf_igle": case "poprecna_perf": case "mikroperforacija": return [cx, ky + kl + 6];
            case "otvor_dno": return [cx, y1 - 4];
            case "var_dno": case "toplotni_var": case "kontinualni_var": return [cx + 20, y1 - 6];
            case "ojacanje": return [x0 + 6, y0 + bh * .5];
            case "busene_rupe": return [cx, y0 + 20];
            case "utor": case "falznut": return [x1 - 3.5, y0 + bh * .38];
            default: return [x1 - 4, y0 + bh * .5];
        }
    };
    const BX = 440;
    const anchored = legend.map((it, i) => { const a = anchor(it.key); return { it, i, ax: a[0], ay: a[1] }; });
    const sortByY = [...anchored].sort((p, r) => p.ay - r.ay);
    let by = 100;
    sortByY.forEach((entry) => {
        const { it, i, ax, ay } = entry;
        const col = it.key === "stampa" ? TEAL : (it.key === "faltna" || it.key === "falta_dno" ? AMB : (it.key === "anleger" ? BLUE : (["adh", "adh_traka", "euroloch", "eurozumba"].includes(it.key) ? ACC : SUB)));
        g += `<line x1="${q(ax)}" y1="${q(ay)}" x2="${q(BX - 11)}" y2="${q(by)}" stroke="${col}" stroke-width=".8"/><circle cx="${q(ax)}" cy="${q(ay)}" r="2" fill="${col}"/><circle cx="${q(BX)}" cy="${q(by)}" r="11" fill="#fff" stroke="${col}" stroke-width="1.6"/><text x="${q(BX)}" y="${q(by + 3.8)}" font-size="11.5" fill="${col}" text-anchor="middle" font-weight="900" font-family="Inter">${i + 1}</text>`;
        by += 34;
    });
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
    const PADX = 30, RXX = W - 30, BTY = 758;
    g += `<line x1="${PADX}" y1="${BTY}" x2="${RXX}" y2="${BTY}" stroke="#111827" stroke-width="1"/>`;
    g += `<text x="${PADX}" y="${BTY + 22}" font-size="10" fill="${SUB}" font-weight="800" letter-spacing="2" font-family="Inter">MAROPACK D.O.O.</text>`;
    g += `<text x="${PADX}" y="${BTY + 44}" font-size="16" fill="${INK}" font-weight="900" font-family="Inter">${T("crtez.naslov")}</text>`;
    const tn = (TIPOVI[c.tip] && TIPOVI[c.tip].n) || "Kesa";
    const meta = [["Tip", tn], ["Dimenzije", sirina + " × " + duzina + " mm"], [vrh === "klapna" ? "Klapna" : "Vrh", vrh === "klapna" ? (klMm + " mm" + (klTip === "schrag" ? " (kosa)" : "")) : vrh], ["Dno", dno === "faltna" ? ("Faltna " + extraMm + " mm") : (dno === "naht" ? "Var na dnu" : (dno === "kreuz" ? "Ukršteno" : "Ravno"))]];
    const colW = (RXX - PADX) / meta.length, mY = BTY + 76;
    meta.forEach((m, i) => {
        const mx = PADX + colW * i;
        g += `<text x="${q(mx)}" y="${q(mY)}" font-size="10" fill="${SUB}" font-family="Inter">${m[0]}</text><text x="${q(mx)}" y="${q(mY + 18)}" font-size="13" fill="${INK}" font-weight="800" font-family="ui-monospace,Menlo">${m[1]}</text>`;
    });
    g += `<line x1="${PADX}" y1="${q(mY + 32)}" x2="${RXX}" y2="${q(mY + 32)}" stroke="#eef2f7" stroke-width="1"/>`;
    g += `<text x="${PADX}" y="${q(mY + 56)}" font-size="11" fill="${SUB}" font-weight="800" letter-spacing="1" font-family="Inter">${T("crtez.pozicije")}</text>`;
    if (!legend.length) {
        g += `<text x="${PADX}" y="${q(mY + 80)}" font-size="11" fill="${LINE}" font-family="Inter">— nema dodatnih opcija —</text>`;
    } else {
        const half = Math.ceil(legend.length / 2);
        const colX = [PADX, PADX + (RXX - PADX) / 2 + 8];
        legend.forEach((it, i) => {
            const col = it.key === "stampa" ? TEAL : (it.key === "faltna" || it.key === "falta_dno" ? AMB : (it.key === "anleger" ? BLUE : (["adh", "adh_traka", "euroloch", "eurozumba"].includes(it.key) ? ACC : SUB)));
            const isR = i >= half, row = isR ? i - half : i;
            const lx = colX[isR ? 1 : 0], ly = mY + 84 + row * 32;
            g += `<circle cx="${q(lx + 9)}" cy="${q(ly - 4)}" r="9" fill="#fff" stroke="${col}" stroke-width="1.5"/><text x="${q(lx + 9)}" y="${q(ly - 0.3)}" font-size="10.5" fill="${col}" text-anchor="middle" font-weight="900" font-family="Inter">${i + 1}</text><text x="${q(lx + 26)}" y="${q(ly - 6)}" font-size="12" fill="${INK}" font-weight="800" font-family="Inter">${String(it.n).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text><text x="${q(lx + 26)}" y="${q(ly + 8)}" font-size="10.5" fill="${SUB}" font-family="Inter">${String(it.v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;
        });
    }
    return { inner: d + g, vbW: W, vbH: H };
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
