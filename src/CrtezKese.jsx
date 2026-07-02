import React, { useMemo } from "react";

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
    };
}

const DEFAULTS = {
    tip: "", vrh: "otvor", klTip: "rect", dno: "ravno",
    adh: false, euroloch: false, luft: false, stampa: true,
    duplofan: false, anleger: false, falznut: false, bocniVar: false,
    poprecniVar: false, otvorDno: false, ojacanje: false, pakovanjeTrn: false,
    positions: {},
    perf: "none", komore: 1, sirina: 95, duzina: 175, klMm: 30, extraMm: 30,
};

const pillow = (x, y, w, h, b) => { const x2 = x + w, y2 = y + h, mx = x + w / 2, my = y + h / 2; return `M${x} ${y} Q${mx} ${y - b} ${x2} ${y} Q${x2 + b} ${my} ${x2} ${y2} Q${mx} ${y2 + b} ${x} ${y2} Q${x - b} ${my} ${x} ${y} Z`; };
const rr = (x, y, w, h, r) => `M${x + r} ${y} h${w - 2 * r} a${r} ${r} 0 0 1 ${r} ${r} v${h - 2 * r} a${r} ${r} 0 0 1 -${r} ${r} h-${w - 2 * r} a${r} ${r} 0 0 1 -${r} -${r} v-${h - 2 * r} a${r} ${r} 0 0 1 ${r} -${r} Z`;
const arw = (x, y, d) => { const a = 5; if (d === 'l') return `<path d="M${x} ${y} l${a} -3 l0 6 Z" fill="#94a3b8"/>`; if (d === 'r') return `<path d="M${x} ${y} l-${a} -3 l0 6 Z" fill="#94a3b8"/>`; if (d === 'u') return `<path d="M${x} ${y} l-3 ${a} l6 0 Z" fill="#94a3b8"/>`; return `<path d="M${x} ${y} l-3 -${a} l6 0 Z" fill="#94a3b8"/>`; };
const kotaH = (y, x1, x2, oy, t) => { let q = `<line x1="${x1}" y1="${oy}" x2="${x1}" y2="${y + 4}" stroke="#cbd5e1" stroke-width="0.8"/><line x1="${x2}" y1="${oy}" x2="${x2}" y2="${y + 4}" stroke="#cbd5e1" stroke-width="0.8"/><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#94a3b8" stroke-width="0.9"/>` + arw(x1, y, 'l') + arw(x2, y, 'r'); const mx = (x1 + x2) / 2; q += `<rect x="${mx - 25}" y="${y - 8}" width="50" height="14" fill="#eef2f6" opacity="0.9"/><text x="${mx}" y="${y + 3}" font-size="10.5" fill="#334155" text-anchor="middle" font-weight="600">${t}</text>`; return q; };
const kotaV = (x, y1, y2, ox, t) => { let q = `<line x1="${ox}" y1="${y1}" x2="${x - 4}" y2="${y1}" stroke="#cbd5e1" stroke-width="0.8"/><line x1="${ox}" y1="${y2}" x2="${x - 4}" y2="${y2}" stroke="#cbd5e1" stroke-width="0.8"/><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#94a3b8" stroke-width="0.9"/>` + arw(x, y1, 'u') + arw(x, y2, 'd'); const my = (y1 + y2) / 2; q += `<g transform="rotate(-90 ${x} ${my})"><rect x="${x - 26}" y="${my - 8}" width="52" height="14" fill="#eef2f6" opacity="0.9"/><text x="${x}" y="${my + 3}" font-size="10.5" fill="#334155" text-anchor="middle" font-weight="600">${t}</text></g>`; return q; };

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
            s += `<text x="${sx + sw / 2}" y="${sy + sh / 2 + 3}" font-size="9" fill="#0d9488" text-anchor="middle" opacity="0.7">štampa</text>`;
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
        if (anyPos(pe)) {
            const dia = has(pe, "sirina") ? mm(pe.sirina) : 13, r = dia / 2;
            const ey = yOpen + (has(pe, "odVrha") ? mm(pe.odVrha) : 22);
            const ex = has(pe, "levo") ? x0 + mm(pe.levo) : cx;
            s += `<circle cx="${ex}" cy="${ey}" r="${r}" fill="#e9eef2" stroke="#7c8a93" stroke-width="1"/><circle cx="${ex - r * 0.2}" cy="${ey - r * 0.2}" r="${r * 0.5}" fill="#fff" opacity="0.6"/>`;
            const slW = Math.max(r * 3, 16);
            s += `<rect x="${ex - slW / 2}" y="${ey + r + 1}" width="${slW}" height="4" rx="2" fill="#e9eef2" stroke="#7c8a93" stroke-width="0.8"/>`;
            if (has(pe, "sirina")) s += `<text x="${ex + r + 4}" y="${ey + 3}" font-size="9" fill="#475569">Ø${pe.sirina}</text>`;
            if (has(pe, "odVrha")) s += kotaV(ex - r - 12, yOpen, ey, ex, `${pe.odVrha} mm`);
            if (has(pe, "levo")) s += kotaH(ey + r + 16, x0, ex, ey, `${pe.levo} mm`);
        } else {
            const ey = vrh === "header" ? topY + headH * 0.55 : yOpen + 22, slotW = Math.min(bodyW * 0.42, 48);
            s += `<rect x="${cx - slotW / 2}" y="${ey}" width="${slotW}" height="6" rx="3" fill="#e9eef2" stroke="#7c8a93" stroke-width="1"/>`;
            s += `<rect x="${cx - slotW / 2 + 1}" y="${ey + 1}" width="${slotW - 2}" height="2" rx="1" fill="#ffffff" opacity="0.7"/>`;
            s += `<circle cx="${cx}" cy="${ey - 3}" r="7" fill="#e9eef2" stroke="#7c8a93" stroke-width="1"/><circle cx="${cx}" cy="${ey - 4}" r="4.5" fill="#ffffff" opacity="0.6"/>`;
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

export default function CrtezKese({ config = {}, width = "100%", showKote = true, showBottomViews = true, showInfo = true, style }) {
    const u = useMemo(() => "k" + Math.random().toString(36).slice(2, 8), []);
    const c = { ...DEFAULTS, ...config };
    const { inner, vbW } = buildSvg(c, u, { kote: showKote, bottomViews: showBottomViews, info: showInfo });
    return (
        <svg
            viewBox={`0 0 ${vbW} 660`}
            width={width}
            xmlns="http://www.w3.org/2000/svg"
            style={{ maxWidth: "100%", height: "auto", ...style }}
            dangerouslySetInnerHTML={{ __html: inner }}
        />
    );
}
