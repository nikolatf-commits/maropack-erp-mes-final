import React, { useState } from "react";

// Geometrija trake (web) — ista kao u potvrđenom prototipu
const WEBX0 = 145, WEBX1 = 540, WEBY0 = 258, WEBY1 = 718;

function svgWrap(inner, maxW, vb) {
    return `<svg viewBox="${vb || '0 0 600 760'}" width="100%" style="max-width:${maxW || 560}px;display:block;margin:0 auto;background:#fff">` + inner + `</svg>`;
}

// Rolna (zaobljen desni kraj) + traka pune širine + čeona elipsa + strelica odmotavanja
function rollParts() {
    const fillc = "#e7f0fb", line = "#9db6dd";
    let s = ``;
    s += `<path d="M 85 42 L 462 42 A 78 108 0 0 1 540 150 L 540 718 L 145 718 L 145 258 L 85 258 Z" fill="${fillc}"/>`;
    s += `<path d="M 85 42 L 462 42 A 78 108 0 0 1 540 150 L 540 718 L 145 718 L 145 258" fill="none" stroke="${line}" stroke-width="1.4"/>`;
    s += `<ellipse cx="85" cy="150" rx="60" ry="108" fill="#f2f7fd" stroke="#2b4a80" stroke-width="2"/>`;
    s += `<ellipse cx="85" cy="150" rx="23" ry="40" fill="#fbfdff" stroke="#9db6dd" stroke-width="1.4"/>`;
    s += `<path d="M 145 150 L 188 214 L 145 258 Z" fill="#eef4fc"/>`;
    s += `<line x1="145" y1="118" x2="145" y2="714" stroke="#2b4a80" stroke-width="2"/>`;
    s += `<line x1="92" y1="278" x2="92" y2="548" stroke="#475569" stroke-width="3"/><path d="M 92 562 l -8 -18 l 16 0 z" fill="#475569"/>`;
    return s;
}

// Kote sa BELIM OREOLOM (casing) iza linija i uokvirenim belim okvirom iza broja —
// da ostanu jasno čitljive i kad je preko rolne ubačena šarena slika dizajna.
const DIMC = "#1e3a8a";          // tamnoplava = jači kontrast
const HALO = "#ffffff";
function dimH(x1, x2, y, txt, color) {
    if (Math.abs(x2 - x1) < 2) return '';
    const C = color || DIMC;
    const mx = (x1 + x2) / 2, w = Math.max(30, String(txt).length * 7 + 12);
    const seg = (a, b, cc, dd) => `<line x1="${a}" y1="${b}" x2="${cc}" y2="${dd}" stroke="${HALO}" stroke-width="3.6" stroke-linecap="round" opacity="0.92"/><line x1="${a}" y1="${b}" x2="${cc}" y2="${dd}" stroke="${C}" stroke-width="1.5"/>`;
    return seg(x1, y, x2, y) + seg(x1, y - 5, x1, y + 5) + seg(x2, y - 5, x2, y + 5) +
        `<rect x="${mx - w / 2}" y="${y - 18}" width="${w}" height="15" rx="3.5" fill="#fff" stroke="${C}" stroke-width="0.9" opacity="0.98"/>` +
        `<text x="${mx}" y="${y - 7}" text-anchor="middle" font-size="10.5" font-weight="900" fill="${C}">${txt}</text>`;
}
function dimV(x, y1, y2, txt) {
    if (Math.abs(y2 - y1) < 2) return '';
    const my = (y1 + y2) / 2, w = Math.max(30, String(txt).length * 7 + 12);
    const seg = (a, b, cc, dd) => `<line x1="${a}" y1="${b}" x2="${cc}" y2="${dd}" stroke="${HALO}" stroke-width="3.6" stroke-linecap="round" opacity="0.92"/><line x1="${a}" y1="${b}" x2="${cc}" y2="${dd}" stroke="${DIMC}" stroke-width="1.5"/>`;
    return seg(x, y1, x, y2) + seg(x - 5, y1, x + 5, y1) + seg(x - 5, y2, x + 5, y2) +
        `<rect x="${x + 3}" y="${my - 8}" width="${w}" height="15" rx="3.5" fill="#fff" stroke="${DIMC}" stroke-width="0.9" opacity="0.98"/>` +
        `<text x="${x + 3 + w / 2}" y="${my + 3}" text-anchor="middle" font-size="10.5" font-weight="900" fill="${DIMC}">${txt}</text>`;
}

const num = (v, d) => { const n = Number(String(v ?? '').toString().replace(',', '.')); return isNaN(n) ? (d ?? 0) : n; };
let _PID = 0; // jedinstven id za SVG pattern (mikro perforacija)

// Prikaz finalne rolne sa dizajnom (slika/URL). PDF zahteva pdf.js (kasnije).
export function RolnaDizajn({ dizajnUrl, rotacija = 0, zrcalo = 1, w, h, sirinaPct = 100, visinaPct = 100, perfXmm = [], perfLinije = null, perfSirinaMm = 0, perfTip = "linija", perfOdVrha = 0, perfOdDna = 0, perfRazmak = 5, perfVisina = 0, perfRaspored = "poravnato", maxWidth = 430 }) {
    const webW = WEBX1 - WEBX0, webH = WEBY1 - WEBY0, cx = (WEBX0 + WEBX1) / 2;
    const uid = "wc" + Math.random().toString(36).slice(2, 8);
    let o = ``;
    if (dizajnUrl) {
        const aspect = (num(w) > 0 && num(h) > 0) ? num(w) / num(h) : 1.4;
        const r = ((Math.round(num(rotacija)) % 360) + 360) % 360;
        const sW = (num(sirinaPct, 100) || 100) / 100, sH = (num(visinaPct, 100) || 100) / 100;
        let IW, IH;
        if (r === 90 || r === 270) { IH = webW * sW; IW = (webW / aspect) * sH; }  // ekran-širina = IH
        else { IW = webW * sW; IH = (webW / aspect) * sH; }                        // ekran-širina = IW
        const onH = (r === 90 || r === 270) ? IW : IH;                 // visina jedne pločice na ekranu
        const slot = Math.max(20, onH);
        const n = Math.max(1, Math.round(webH / slot));
        let tiles = ``;
        for (let i = 0; i < n; i++) {
            const cyT = WEBY0 + slot * (i + 0.5);
            tiles += `<g transform="translate(${cx},${cyT}) rotate(${r}) scale(${num(zrcalo, 1) || 1},1)"><image href="${dizajnUrl}" x="${-IW / 2}" y="${-IH / 2}" width="${IW}" height="${IH}" preserveAspectRatio="none"/></g>`;
        }
        o += `<clipPath id="${uid}"><rect x="${WEBX0}" y="${WEBY0}" width="${webW}" height="${webH}"/></clipPath>`;
        o += `<g clip-path="url(#${uid})">${tiles}</g>`;
    } else {
        o += `<text x="${cx}" y="${(WEBY0 + WEBY1) / 2}" text-anchor="middle" fill="#94a3b8" font-size="14" font-weight="800">nema dizajna</text>`;
    }
    // Perforacija preko dizajna — crta se ISTO kao na levoj skici (PERFORACIJA kotirano):
    // „rupe" = tačke po koloni (razmak PO LINIJI, pada na globalni), „linija" = isprekidana linija.
    // Vertikalni opseg poštuje OD VRHA / OD DNA i VISINU PRIKAZA.
    // Linije dolaze kao perfLinije=[{mm,razmak}], ili fallback na stari perfXmm (jedan razmak).
    const linijeDraw = (Array.isArray(perfLinije) && perfLinije.length)
        ? perfLinije
        : (Array.isArray(perfXmm) ? perfXmm.map((mm) => ({ mm, razmak: perfRazmak })) : []);
    if (linijeDraw.length && num(perfSirinaMm) > 0) {
        const sxp = (WEBX1 - WEBX0) / num(perfSirinaMm);
        const BOJE = ["#8b5cf6", "#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed"];
        const Hmm = num(perfVisina);
        const syp = Hmm > 0 ? (WEBY1 - WEBY0) / Hmm : 0;
        const yTop = Hmm > 0 ? WEBY0 + num(perfOdVrha) * syp : WEBY0;
        const yBot = Hmm > 0 ? WEBY1 - num(perfOdDna) * syp : WEBY1;
        const rupe = String(perfTip) === 'rupe';
        // Raspored rupa: smaknute_kolone = svaka druga linija pomerena naniže za pola razmaka;
        // cik_cak = svaki drugi red pomeren ustranu za pola razmaka između linija.
        const smakKol = perfRaspored === 'smaknute_kolone' && rupe;
        const cikCak = perfRaspored === 'cik_cak' && rupe;
        const xsD = linijeDraw.map((L) => WEBX0 + num(L.mm) * sxp).filter((x) => x >= WEBX0 && x <= WEBX1).sort((a, b) => a - b);
        const colStepD = xsD.length > 1 ? (xsD[xsD.length - 1] - xsD[0]) / (xsD.length - 1) : 0;
        const hxD = cikCak ? colStepD / 2 : 0;
        linijeDraw.forEach((L, i) => {
            const x = WEBX0 + num(L.mm) * sxp;
            if (x < WEBX0 || x > WEBX1) return;
            const c = BOJE[i % BOJE.length];
            const gapPx = Hmm > 0 ? Math.max(4, (num(L.razmak) || num(perfRazmak, 5)) * syp) : 10;
            if (rupe) {
                const yoff = (smakKol && (i % 2 === 1)) ? gapPx / 2 : 0;
                let k = 0;
                for (let y = yTop + yoff; y <= yBot + 0.5; y += gapPx) { const cxh = x + ((cikCak && (k % 2 === 1)) ? hxD : 0); o += `<circle cx="${cxh}" cy="${y}" r="2" fill="${c}"/>`; k++; }
                o += `<circle cx="${x}" cy="${yTop + yoff}" r="3" fill="${c}"/>`;
            } else {
                o += `<line x1="${x}" y1="${yTop}" x2="${x}" y2="${yBot}" stroke="${c}" stroke-width="2.5" stroke-dasharray="8 5" opacity="0.95"/>`;
            }
        });
    }
    return <div dangerouslySetInnerHTML={{ __html: svgWrap(rollParts() + o, maxWidth) }} />;
}

// Kotirani prikaz perforacije — iz LISTE LINIJA (svaka: pozicija + strana + opcioni razmak).
// linije = [{ mm (od leve ivice), poz (uneta vrednost), strana ("leva"|"desna"), razmak }]
export function PerforacijaCrtez({ tip = "linija", odVrha = 50, odDna = 50, sirina = 270, visina = 600, razmakRupa = 5, linije = [], odLeveIvice = 0, odDesneIvice = 0, gustina = "gusca", raspored = "poravnato", maxWidth = 430 }) {
    const odV = num(odVrha), odD = num(odDna);
    const Wmm = num(sirina, 270) || 270, Hmm = num(visina, 600) || 600, gGlob = num(razmakRupa, 5) || 5;
    const sx = (WEBX1 - WEBX0) / Wmm, sy = (WEBY1 - WEBY0) / Hmm;
    const yTop = WEBY0 + odV * sy, yBot = WEBY1 - odD * sy;

    // ── MIKRO PERFORACIJA (ZONA): popuni traku između leve i desne ivice
    //    tačkicama u SMAKNUTIM redovima (drugi red pomeren za pola koraka).
    //    Gustina „gušća" = sitnije/gušće, „ređa" = krupnije/ređe.
    if (tip === 'mikro_zona') {
        const oL = num(odLeveIvice), oR = num(odDesneIvice);
        const xL = WEBX0 + oL * sx, xR = WEBX1 - oR * sx;
        const yT = WEBY0, yB = WEBY1;
        const c = "#8b5cf6";
        const redja = String(gustina) === 'redja';
        const step = redja ? 13 : 7;      // korak rešetke (px u crtežu)
        const r = redja ? 1.8 : 1.4;      // poluprečnik tačkice
        const pid = 'mpz' + (_PID++);
        let s = rollParts();
        if (xR > xL + 2) {
            // 1) podloga zone + isprekidana ivica
            s += `<rect x="${xL}" y="${yT}" width="${xR - xL}" height="${yB - yT}" fill="${c}10" stroke="${c}" stroke-width="1.6" stroke-dasharray="7 4"/>`;
            // 2) rešetka tačkica — smaknut drugi red (pattern visine 2×korak)
            s += `<defs><pattern id="${pid}" width="${step}" height="${step * 2}" patternUnits="userSpaceOnUse">`
                + `<circle cx="${step / 2}" cy="${step / 2}" r="${r}" fill="${c}"/>`
                + `<circle cx="0" cy="${step * 1.5}" r="${r}" fill="${c}"/>`
                + `<circle cx="${step}" cy="${step * 1.5}" r="${r}" fill="${c}"/>`
                + `</pattern></defs>`;
            s += `<rect x="${xL}" y="${yT}" width="${xR - xL}" height="${yB - yT}" fill="url(#${pid})"/>`;
        } else {
            s += `<text x="${(WEBX0 + WEBX1) / 2}" y="${(yT + yB) / 2}" text-anchor="middle" font-size="12.5" font-weight="800" fill="#b91c1c" stroke="#fff" stroke-width="3" paint-order="stroke">Ivice se preklapaju — smanji odstojanja</text>`;
        }
        // naslov: tip gustine
        s += `<text x="${(WEBX0 + WEBX1) / 2}" y="${yT - 24}" text-anchor="middle" font-size="12" font-weight="900" fill="${c}" stroke="#fff" stroke-width="3" paint-order="stroke">MIKRO PERFORACIJA · ${redja ? 'REĐA' : 'GUŠĆA'}</text>`;
        // kote: od leve / od desne ivice
        if (oL > 0) s += dimH(WEBX0, xL, WEBY0 - 8, oL + ' mm', c);
        if (oR > 0) s += dimH(xR, WEBX1, WEBY0 - 8, oR + ' mm', c);
        // širina zone (mm)
        if (xR > xL + 2) { const zonaMm = Math.max(0, Math.round(Wmm - oL - oR)); s += dimH(xL, xR, WEBY1 + 20, 'zona ' + zonaMm + ' mm', c); }
        return <div dangerouslySetInnerHTML={{ __html: svgWrap(s, maxWidth, '0 0 600 760') }} />;
    }
    const BOJE = ["#8b5cf6", "#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed"];
    const lin = (Array.isArray(linije) ? linije : []).filter((L) => L && !isNaN(parseFloat(L.mm)));
    let o = ``, brL = 0, brD = 0;
    // 1) Pripremi sve linije (x, strana, boja, pozicija, ID) — ID po redosledu unosa (L1,L2,… / D1,D2,…)
    const items = lin.map((L, i) => {
        const x = WEBX0 + num(L.mm) * sx;
        const gore = L.strana !== "desna";
        const poz = (L.poz != null && L.poz !== "") ? L.poz : Math.round(gore ? num(L.mm) : (Wmm - num(L.mm)));
        return { x, gore, c: BOJE[i % BOJE.length], poz, razmak: num(L.razmak), id: (gore ? 'L' + (++brL) : 'D' + (++brD)) };
    }).filter((it) => it.x >= WEBX0 && it.x <= WEBX1);

    // Raspored rupa: „smaknute_kolone" = svaka druga linija pomerena naniže za pola razmaka;
    // „cik_cak" = svaki drugi red pomeren ustranu za pola razmaka između linija.
    const smakKol = raspored === 'smaknute_kolone' && tip === 'rupe';
    const cikCak = raspored === 'cik_cak' && tip === 'rupe';
    const xsAll = items.map((it) => it.x).sort((a, b) => a - b);
    const colStep = xsAll.length > 1 ? (xsAll[xsAll.length - 1] - xsAll[0]) / (xsAll.length - 1) : 0;
    const hx = cikCak ? colStep / 2 : 0;
    const yoffOf = (idx, gap) => (smakKol && (idx % 2 === 1)) ? (gap * sy / 2) : 0;

    // 2) Perforacija (tačke za „rupe", isprekidana linija za mikroperforaciju) + tačka na kraju
    items.forEach((it, idx) => {
        const gap = it.razmak || gGlob;
        const yoff = yoffOf(idx, gap);
        if (tip === 'rupe') { let k = 0; for (let y = yTop + yoff; y <= yBot + 0.5; y += gap * sy) { const cx = it.x + ((cikCak && (k % 2 === 1)) ? hx : 0); o += `<circle cx="${cx}" cy="${y}" r="2" fill="${it.c}"/>`; k++; } }
        else { o += `<line x1="${it.x}" y1="${yTop}" x2="${it.x}" y2="${yBot}" stroke="${it.c}" stroke-width="2.5" stroke-dasharray="8 5"/>`; }
        o += `<circle cx="${it.x}" cy="${it.gore ? (yTop + yoff) : yBot}" r="3.2" fill="${it.c}"/>`;
    });

    // 2b) RAZMAK IZMEĐU RUPA — kotiran: mala vertikalna kota između prve dve rupe svake linije.
    if (tip === 'rupe') {
        const xs = items.map((it) => it.x).sort((a, b) => a - b);
        const nearRight = (x) => xs.some((o2) => o2 > x + 0.5 && o2 - x < 44);
        items.forEach((it, idx) => {
            const gap = it.razmak || gGlob;
            const yoff = yoffOf(idx, gap);
            const yA = yTop + yoff, yB = yTop + yoff + gap * sy;
            const side = nearRight(it.x) ? -1 : 1, lx = it.x + 12 * side;
            o += `<line x1="${it.x}" y1="${yA}" x2="${lx}" y2="${yA}" stroke="${it.c}" stroke-width="0.9"/>`;
            o += `<line x1="${it.x}" y1="${yB}" x2="${lx}" y2="${yB}" stroke="${it.c}" stroke-width="0.9"/>`;
            o += `<line x1="${lx}" y1="${yA}" x2="${lx}" y2="${yB}" stroke="${it.c}" stroke-width="1.2"/>`;
            const tx = lx + 4 * side, anc = side > 0 ? 'start' : 'end';
            o += `<text x="${tx}" y="${(yA + yB) / 2 + 3}" text-anchor="${anc}" font-size="9" font-weight="800" fill="${it.c}" stroke="#fff" stroke-width="2.4" paint-order="stroke">${gap} mm</text>`;
        });
    }

    // 3) Oznake L1/L2… uz tačku — RAZMAKNUTE po visini kad su rupe blizu (bez horizontalnog preklapanja)
    const MINX = 30, TSTEP = 12;
    const tops = items.filter((it) => it.gore).sort((a, b) => a.x - b.x);
    const bots = items.filter((it) => !it.gore).sort((a, b) => a.x - b.x);
    const stag = (arr) => { let lastX = -1e9, lvl = 0; arr.forEach((it) => { lvl = (it.x - lastX < MINX) ? lvl + 1 : 0; it.lvl = lvl; lastX = it.x; }); };
    stag(tops); stag(bots);
    tops.forEach((it) => { o += `<text x="${it.x}" y="${yTop - 7 - it.lvl * TSTEP}" text-anchor="middle" font-size="10.5" font-weight="900" fill="${it.c}" stroke="#fff" stroke-width="2.6" paint-order="stroke">${it.id}</text>`; });
    bots.forEach((it) => { o += `<text x="${it.x}" y="${yBot + 16 + it.lvl * TSTEP}" text-anchor="middle" font-size="10.5" font-weight="900" fill="${it.c}" stroke="#fff" stroke-width="2.6" paint-order="stroke">${it.id}</text>`; });

    // 4) Kote pozicija — svaka na SVOJOJ „lestvici": gornje iznad trake, donje ispod. Nema preklapanja.
    const LANE = 17;
    const laneTopY = (k) => WEBY0 - 16 - k * LANE;
    const laneBotY = (k) => WEBY1 + 16 + k * LANE;
    const conn = (x, ya, yb, c) => `<line x1="${x}" y1="${ya}" x2="${x}" y2="${yb}" stroke="${HALO}" stroke-width="3" opacity="0.9"/><line x1="${x}" y1="${ya}" x2="${x}" y2="${yb}" stroke="${c}" stroke-width="0.9" stroke-dasharray="3 3"/>`;
    tops.forEach((it, k) => {
        const ly = laneTopY(k);
        o += conn(it.x, ly, yTop, it.c);
        o += dimH(WEBX0, it.x, ly, it.poz + ' mm', it.c);
    });
    bots.forEach((it, k) => {
        const ly = laneBotY(k);
        o += conn(it.x, yBot, ly, it.c);
        o += dimH(it.x, WEBX1, ly, it.poz + ' mm', it.c);
    });

    o += dimV(WEBX0 + 14, WEBY0, yTop, odV + ' mm');
    o += dimV(WEBX0 + 14, yBot, WEBY1, odD + ' mm');

    // 5) Dinamički viewBox — da se lestvice kota uvek vide (crtež se proširi gore/dole po potrebi)
    const minY = tops.length ? (laneTopY(tops.length - 1) - 20) : 0;
    const maxY = bots.length ? (laneBotY(bots.length - 1) + 12) : 760;
    const vbY = Math.min(0, minY), vbH = Math.max(760, maxY) - vbY;
    return <div dangerouslySetInnerHTML={{ __html: svgWrap(rollParts() + o, maxWidth, `0 ${vbY} 600 ${vbH}`) }} />;
}

export default { RolnaDizajn, PerforacijaCrtez };

// ---- Upload dizajna: JPEG / PNG / PDF -> slika (data URL) ----
function ensurePdfJs() {
    if (typeof window !== "undefined" && window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        s.onload = () => {
            try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; } catch (e) { }
            resolve(window.pdfjsLib);
        };
        s.onerror = () => reject(new Error("pdf.js nije mogao da se učita"));
        document.head.appendChild(s);
    });
}

// Pretvori uploadovani fajl u sliku (data URL). PDF -> prva strana; slika -> downscale JPEG.
export async function fileToDizajnDataURL(file) {
    const isPdf = (file.type && file.type.includes("pdf")) || /\.pdf$/i.test(file.name || "");
    if (isPdf) {
        const pdfjs = await ensurePdfJs();
        const buf = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 1400 / base.width);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
        return { url: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height };
    }
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = dataUrl; });
    const maxW = 1400, sc = Math.min(1, maxW / (img.width || maxW));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((img.width || maxW) * sc); canvas.height = Math.round((img.height || maxW) * sc);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return { url: canvas.toDataURL("image/jpeg", 0.85), w: canvas.width, h: canvas.height };
}

const _ebtn = { border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, padding: "6px 10px", fontWeight: 800, cursor: "pointer", fontSize: 13 };
const _lab = { display: "block", fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: ".4px", margin: "0 0 4px" };
const _inp = { width: "100%", padding: 7, border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14, fontWeight: 700 };

// Editor za templejt: upload dizajna + rotacija/zrcalo + živi prikaz rolne
export function RolnaDizajnEditor({ value = {}, onChange, hidePreview = false }) {
    const [busy, setBusy] = useState(false);
    const v = value || {};
    const set = (patch) => onChange && onChange({ ...v, ...patch });
    const onFile = async (e) => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        setBusy(true);
        try { const d = await fileToDizajnDataURL(f); set({ url: d.url, naziv: f.name, w: d.w, h: d.h }); }
        catch (err) { alert("Greška pri učitavanju dizajna: " + (err && err.message || err)); }
        setBusy(false);
    };
    return (
        <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={onFile} />
                <button type="button" style={_ebtn} onClick={() => set({ rotacija: (((v.rotacija || 0) + 270) % 360) })}>↺ −90°</button>
                <button type="button" style={_ebtn} onClick={() => set({ rotacija: (((v.rotacija || 0) + 90) % 360) })}>↻ +90°</button>
                <button type="button" style={_ebtn} onClick={() => set({ zrcalo: (v.zrcalo === -1 ? 1 : -1) })}>⇆ Zrcalo</button>
                {v.url && <button type="button" style={{ ..._ebtn, color: "#b91c1c" }} onClick={() => set({ url: "", naziv: "" })}>Ukloni</button>}
                {busy && <span style={{ fontSize: 12, color: "#64748b" }}>Učitavam…</span>}
                {v.naziv && !busy && <span style={{ fontSize: 12, color: "#64748b" }}>{v.naziv}</span>}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ minWidth: 110 }}><label style={_lab}>Širina (%)</label><input style={_inp} type="number" value={v.sirinaPct ?? 100} onChange={(e) => set({ sirinaPct: e.target.value })} /></div>
                <div style={{ minWidth: 110 }}><label style={_lab}>Visina (%)</label><input style={_inp} type="number" value={v.visinaPct ?? 100} onChange={(e) => set({ visinaPct: e.target.value })} /></div>
                <div style={{ alignSelf: "end" }}><button type="button" style={_ebtn} onClick={() => set({ sirinaPct: 100, visinaPct: 100 })}>Puna širina</button></div>
            </div>
            {!hidePreview && <RolnaDizajn dizajnUrl={v.url} w={v.w} h={v.h} rotacija={v.rotacija || 0} zrcalo={v.zrcalo ?? 1} sirinaPct={v.sirinaPct ?? 100} visinaPct={v.visinaPct ?? 100} maxWidth={320} />}
            {!hidePreview && v.url && (
                <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#1d4ed8", letterSpacing: ".3px", marginBottom: 4 }}>ORIGINALNA SLIKA — PUNA VELIČINA (kote sa slike)</div>
                    <img src={v.url} alt="originalni dizajn" style={{ display: "block", width: "100%", maxHeight: 560, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }} />
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Ovo je tvoja slika u originalnoj razmeri — sve crvene kote/oznake sa nje se vide jasno. Ide i kao poseban prilog na nalogu.</div>
                </div>
            )}
        </div>
    );
}

// Editor za templejt: parametri perforacije + živi kotirani crtež
// nema=true -> perforacije nema: sakriva se crtež perforacije i njegova polja,
// ostaje SAMO prikaz "Dizajn na finalnoj rolni".
export function PerforacijaEditor({ value = {}, onChange, dizajn, nema = false }) {
    const v = { tip: "linija", odVrha: 50, odDna: 50, sirina: 270, visina: 600, razmakRupa: 5, linije: null, pozLeve: "", pozDesne: "", odLeveIvice: 20, odDesneIvice: 20, gustina: "gusca", raspored: "poravnato", ...(value || {}) };
    const jeZona = v.tip === "mikro_zona";
    const sirinaN = Number(v.sirina) || 0;

    // LINIJE perforacije — nov model. Ako nema `linije`, konvertuj stari format (pozLeve/pozDesne).
    let linije = Array.isArray(v.linije) ? v.linije : null;
    if (!linije) {
        const pL = String(v.pozLeve || "").split(/[,;\s]+/).map((x) => parseFloat(x)).filter((x) => !isNaN(x));
        const pR = String(v.pozDesne || "").split(/[,;\s]+/).map((x) => parseFloat(x)).filter((x) => !isNaN(x));
        linije = [...pL.map((p) => ({ poz: p, strana: "leva", razmak: "" })), ...pR.map((p) => ({ poz: p, strana: "desna", razmak: "" }))];
        if (!linije.length) linije = [{ poz: "", strana: "leva", razmak: "" }];
    }

    const set = (k, val) => onChange && onChange({ ...v, [k]: val });
    // Upis linija + izvedeni stari formati (pozLeve/pozDesne/kolone) radi kompatibilnosti (nalog i sl.)
    const commit = (next) => {
        const pL = next.filter((l) => l.strana !== "desna" && String(l.poz) !== "").map((l) => l.poz);
        const pR = next.filter((l) => l.strana === "desna" && String(l.poz) !== "").map((l) => l.poz);
        onChange && onChange({ ...v, linije: next, pozLeve: pL.join(","), pozDesne: pR.join(","), kolone: next.length });
    };
    const setLinija = (i, patch) => commit(linije.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    const addLinija = () => commit([...linije, { poz: "", strana: "leva", razmak: "" }]);
    const delLinija = (i) => commit(linije.length > 1 ? linije.filter((_, idx) => idx !== i) : [{ poz: "", strana: "leva", razmak: "" }]);

    // perfLinije za crtanje: {mm (od leve ivice), poz, strana, razmak(efektivni)}
    const perfLinije = linije
        .filter((l) => String(l.poz) !== "" && !isNaN(parseFloat(l.poz)))
        .map((l) => {
            const poz = parseFloat(l.poz);
            const mm = l.strana === "desna" ? (sirinaN - poz) : poz;
            const razmak = (String(l.razmak) === "" || l.razmak == null) ? "" : Number(l.razmak);
            return { mm, poz, strana: l.strana, razmak };
        });
    const imaPoz = perfLinije.length > 0;

    const F = (label, key, type) => (
        <div><label style={_lab}>{label}</label>
            {type === "select"
                ? <select style={_inp} value={v.tip} onChange={(e) => set("tip", e.target.value)}><option value="linija">Mikroperforacija (linija)</option><option value="rupe">Pojedinačne rupe</option><option value="mikro_zona">Mikro perforacija (zona)</option></select>
                : <input style={_inp} type="number" value={v[key]} onChange={(e) => set(key, e.target.value)} />}
        </div>
    );

    // Prikaz "Dizajn na finalnoj rolni" — deljen (bez perforacije kada je nema=true)
    const dizajnBlok = (
        <div style={{ flex: nema ? "1 1 100%" : "1 1 280px", minWidth: 260 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: "#1d4ed8" }}>DIZAJN NA FINALNOJ ROLNI</span>
                <button type="button" style={{ ..._ebtn, padding: "3px 8px" }} onClick={() => set("dizajnRotacija", (((v.dizajnRotacija ?? (dizajn && dizajn.rotacija) ?? 0) + 270) % 360))}>↺</button>
                <button type="button" style={{ ..._ebtn, padding: "3px 8px" }} onClick={() => set("dizajnRotacija", (((v.dizajnRotacija ?? (dizajn && dizajn.rotacija) ?? 0) + 90) % 360))}>↻</button>
            </div>
            <RolnaDizajn dizajnUrl={dizajn && dizajn.url} w={dizajn && dizajn.w} h={dizajn && dizajn.h}
                rotacija={v.dizajnRotacija ?? (dizajn && dizajn.rotacija) ?? 0} zrcalo={(dizajn && dizajn.zrcalo) ?? 1}
                sirinaPct={(dizajn && dizajn.sirinaPct) ?? 100} visinaPct={(dizajn && dizajn.visinaPct) ?? 100}
                perfSirinaMm={(!nema && imaPoz) ? sirinaN : 0}
                perfLinije={(!nema && imaPoz) ? perfLinije : []}
                perfTip={v.tip} perfOdVrha={v.odVrha} perfOdDna={v.odDna} perfRazmak={v.razmakRupa} perfVisina={v.visina}
                perfRaspored={v.raspored}
                maxWidth={nema ? 360 : 320} />
            {!(dizajn && dizajn.url) && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Dizajn se učitava u sekciji Štampa.</div>}
        </div>
    );

    // Nema perforacije -> prikaži samo dizajn na finalnoj rolni
    if (nema) {
        return (
            <div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                    {dizajnBlok}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 12 }}>
                {F("Tip", "tip", "select")}
                {jeZona ? <>
                    {F("Od leve ivice (mm)", "odLeveIvice")}
                    {F("Od desne ivice (mm)", "odDesneIvice")}
                    <div><label style={_lab}>Gustina</label>
                        <select style={_inp} value={v.gustina} onChange={(e) => set("gustina", e.target.value)}>
                            <option value="gusca">Gušća</option>
                            <option value="redja">Ređa</option>
                        </select>
                    </div>
                    {F("Širina trake (mm)", "sirina")}
                    {F("Visina prikaza (mm)", "visina")}
                </> : <>
                    {F("Od vrha (mm)", "odVrha")}
                    {F("Od dna (mm)", "odDna")}
                    {F("Širina trake (mm)", "sirina")}
                    {F("Visina prikaza (mm)", "visina")}
                    {F("Razmak rupa — podrazumevano (mm)", "razmakRupa")}
                    {v.tip === "rupe" && <div><label style={_lab}>Raspored rupa</label>
                        <select style={_inp} value={v.raspored || "poravnato"} onChange={(e) => set("raspored", e.target.value)}>
                            <option value="poravnato">Poravnato</option>
                            <option value="smaknute_kolone">Smaknute kolone</option>
                            <option value="cik_cak">Cik-cak redovi</option>
                        </select>
                    </div>}
                </>}
            </div>

            {/* LINIJE PERFORACIJE — svaka linija: pozicija + strana + (opcioni) razmak.
                Ne prikazuje se za zonsku mikro perforaciju (ona popunjava celu zonu). */}
            {!jeZona && <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, marginBottom: 12, background: "#faf5ff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: "#8b5cf6", letterSpacing: ".3px" }}>LINIJE PERFORACIJE ({linije.length})</span>
                    <button type="button" style={{ ..._ebtn, background: "#8b5cf6", color: "#fff", borderColor: "#8b5cf6" }} onClick={addLinija}>+ Dodaj liniju</button>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>Razmak ostavi prazan = koristi podrazumevani ({num(v.razmakRupa, 5)} mm)</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "28px 1.2fr 1fr 1fr 34px", gap: 6, alignItems: "center", fontSize: 9.5, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>
                    <div>#</div><div>Pozicija (mm)</div><div>Od ivice</div><div>Razmak rupa (mm)</div><div></div>
                </div>
                {linije.map((l, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1.2fr 1fr 1fr 34px", gap: 6, alignItems: "center", marginBottom: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "#8b5cf6", textAlign: "center" }}>{i + 1}</div>
                        <input style={_inp} type="number" value={l.poz} placeholder="npr. 50" onChange={(e) => setLinija(i, { poz: e.target.value })} />
                        <select style={_inp} value={l.strana || "leva"} onChange={(e) => setLinija(i, { strana: e.target.value })}>
                            <option value="leva">od leve</option>
                            <option value="desna">od desne</option>
                        </select>
                        <input style={_inp} type="number" value={l.razmak} placeholder={"podr. " + num(v.razmakRupa, 5)} onChange={(e) => setLinija(i, { razmak: e.target.value })} />
                        <button type="button" title="Obriši liniju" style={{ ..._ebtn, color: "#b91c1c", borderColor: "#fecaca", padding: "7px 0" }} onClick={() => delLinija(i)}>✕</button>
                    </div>
                ))}
            </div>}

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 280px", minWidth: 260 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#8b5cf6", marginBottom: 4 }}>{jeZona ? "MIKRO PERFORACIJA (zona)" : "PERFORACIJA (kotirano)" + (imaPoz ? " — " + perfLinije.length + " linija" : " — unesi bar jednu liniju")}</div>
                    <PerforacijaCrtez tip={v.tip} odVrha={v.odVrha} odDna={v.odDna} sirina={v.sirina} visina={v.visina} razmakRupa={v.razmakRupa} linije={perfLinije} odLeveIvice={v.odLeveIvice} odDesneIvice={v.odDesneIvice} gustina={v.gustina} raspored={v.raspored} maxWidth={320} />
                </div>
                {dizajnBlok}
            </div>
        </div>
    );
}

/* ============================================================================
   MONTAŽA — više dizajna na jednoj rolni (folija)
   trake (s leva na desno) = [{ sirina, dizajnIdx }], dizajni = [{ url, naziv, w, h }]
   Fotomarker i QR su DEO slike dizajna — ne crtaju se posebno.
   ========================================================================== */
let _MID = 0;
function escM(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function svgWrapM(inner, maxW, vw, vh) {
    return `<svg viewBox="0 0 ${vw} ${vh}" width="100%" style="max-width:${maxW || 760}px;display:block;margin:0 auto;background:#fff">` + inner + `</svg>`;
}
export function montazaSvgStr(dizajni, trake, maxWidth) {
    dizajni = Array.isArray(dizajni) ? dizajni : [];
    const lanes = (Array.isArray(trake) ? trake : []).filter((t) => t && num(t.sirina) > 0);
    const VW = 840, VH = 300, X0 = 40, X1 = 740, topY = 54, botY = 232, H = 232 - 54;
    if (!lanes.length) {
        return svgWrapM(`<rect x="${X0}" y="${topY}" width="${X1 - X0}" height="${H}" fill="#f8fafc" stroke="#cbd5e1" stroke-dasharray="6 4"/><text x="${(X0 + X1) / 2}" y="${(topY + botY) / 2}" text-anchor="middle" font-size="14" font-weight="800" fill="#94a3b8">Dodaj trake (širina + dizajn)</text>`, maxWidth, VW, VH);
    }
    const totalMm = lanes.reduce((s, t) => s + num(t.sirina), 0) || 1;
    const scale = (X1 - X0) / totalMm;
    let o = `<rect x="${X0}" y="${topY}" width="${X1 - X0}" height="${H}" fill="#f8fafc" stroke="#1e3a8a" stroke-width="1.3"/>`;
    let x = X0;
    lanes.forEach((ln, i) => {
        const wPx = num(ln.sirina) * scale;
        const d = dizajni[num(ln.dizajnIdx)] || dizajni[0] || null;
        const uid = "mz" + (_MID++);
        o += `<rect x="${x}" y="${topY}" width="${wPx}" height="${H}" fill="#ffffff"/>`;
        if (d && d.url) {
            const aspect = (num(d.w) > 0 && num(d.h) > 0) ? (num(d.w) / num(d.h)) : 1.6;
            const tileH = Math.max(16, wPx / aspect);
            o += `<clipPath id="${uid}"><rect x="${x}" y="${topY}" width="${wPx}" height="${H}"/></clipPath>`;
            o += `<g clip-path="url(#${uid})">`;
            for (let ty = topY; ty < botY - 1; ty += tileH) o += `<image href="${d.url}" x="${x}" y="${ty}" width="${wPx}" height="${tileH}" preserveAspectRatio="xMidYMid meet"/>`;
            o += `</g>`;
        } else {
            o += `<text x="${x + wPx / 2}" y="${(topY + botY) / 2}" text-anchor="middle" font-size="10" font-weight="800" fill="#94a3b8">(bez slike)</text>`;
        }
        const naz = (d && d.naziv) ? d.naziv : ("Traka " + (i + 1));
        o += `<text x="${x + wPx / 2}" y="${topY + 14}" text-anchor="middle" font-size="10.5" font-weight="900" fill="#0f172a" stroke="#fff" stroke-width="2.8" paint-order="stroke">${escM(naz)}</text>`;
        if (i < lanes.length - 1) o += `<line x1="${x + wPx}" y1="${topY - 6}" x2="${x + wPx}" y2="${botY + 6}" stroke="#dc2626" stroke-width="1.4" stroke-dasharray="5 4"/>`;
        o += `<line x1="${x}" y1="${botY + 16}" x2="${x + wPx}" y2="${botY + 16}" stroke="#334155"/><line x1="${x}" y1="${botY + 12}" x2="${x}" y2="${botY + 20}" stroke="#334155"/><line x1="${x + wPx}" y1="${botY + 12}" x2="${x + wPx}" y2="${botY + 20}" stroke="#334155"/>`;
        o += `<text x="${x + wPx / 2}" y="${botY + 30}" text-anchor="middle" font-size="10" font-weight="800" fill="#334155">${num(ln.sirina)} mm</text>`;
        x += wPx;
    });
    o += `<line x1="${X0}" y1="${topY - 18}" x2="${X1}" y2="${topY - 18}" stroke="#1d4ed8"/><line x1="${X0}" y1="${topY - 22}" x2="${X0}" y2="${topY - 14}" stroke="#1d4ed8"/><line x1="${X1}" y1="${topY - 22}" x2="${X1}" y2="${topY - 14}" stroke="#1d4ed8"/>`;
    o += `<rect x="${(X0 + X1) / 2 - 92}" y="${topY - 28}" width="184" height="16" rx="4" fill="#fff" stroke="#1d4ed8"/><text x="${(X0 + X1) / 2}" y="${topY - 16}" text-anchor="middle" font-size="10.5" font-weight="900" fill="#1d4ed8">Širina materijala ${Math.round(totalMm)} mm</text>`;
    o += `<line x1="${X1 + 18}" y1="${topY}" x2="${X1 + 18}" y2="${botY - 10}" stroke="#7c3aed" stroke-width="2"/><path d="M${X1 + 18} ${botY} l-6 -12 h12 Z" fill="#7c3aed"/>`;
    o += `<text x="${X1 + 32}" y="${(topY + botY) / 2}" font-size="9" font-weight="800" fill="#7c3aed" transform="rotate(90 ${X1 + 32} ${(topY + botY) / 2})" text-anchor="middle">SMER ODMOTAVANJA</text>`;
    return svgWrapM(o, maxWidth, VW, VH);
}

export function MontazaCrtez({ dizajni = [], trake = [], maxWidth = 760 }) {
    return <div dangerouslySetInnerHTML={{ __html: montazaSvgStr(dizajni, trake, maxWidth) }} />;
}

export function ViseDizajnaEditor({ value = {}, onChange }) {
    const v = { enabled: false, dizajni: [], trake: [], ...(value || {}) };
    const [busy, setBusy] = useState(-1);
    const set = (patch) => onChange && onChange({ ...v, ...patch });
    const dizajni = Array.isArray(v.dizajni) ? v.dizajni : [];
    const trake = Array.isArray(v.trake) ? v.trake : [];

    const setDizajn = (i, patch) => set({ dizajni: dizajni.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) });
    const addDizajn = () => { if (dizajni.length >= 4) return; set({ dizajni: [...dizajni, { url: "", naziv: "" }] }); };
    const delDizajn = (i) => {
        const nd = dizajni.filter((_, idx) => idx !== i);
        const nt = trake.map((t) => { let di = num(t.dizajnIdx); if (di === i) di = 0; else if (di > i) di = di - 1; return { ...t, dizajnIdx: di }; });
        set({ dizajni: nd, trake: nt });
    };
    const onFileDiz = async (i, e) => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        setBusy(i);
        try { const d = await fileToDizajnDataURL(f); setDizajn(i, { url: d.url, w: d.w, h: d.h, naziv: (dizajni[i] && dizajni[i].naziv) || f.name }); }
        catch (err) { alert("Greška pri učitavanju dizajna: " + (err && err.message || err)); }
        setBusy(-1);
    };

    const setTraka = (i, patch) => set({ trake: trake.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) });
    const addTraka = () => set({ trake: [...trake, { sirina: "", dizajnIdx: 0 }] });
    const delTraka = (i) => set({ trake: trake.filter((_, idx) => idx !== i) });
    const ukupno = trake.reduce((s, t) => s + num(t.sirina), 0);

    return (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, background: "#f8fafc", marginTop: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900, fontSize: 13, color: "#1d4ed8", cursor: "pointer", marginBottom: v.enabled ? 12 : 0 }}>
                <input type="checkbox" checked={!!v.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                Više dizajna na rolni (montaža)
            </label>
            {v.enabled && <>
                <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: "#1d4ed8" }}>DIZAJNI ({dizajni.length}/4)</span>
                        <button type="button" style={{ ..._ebtn, background: "#1d4ed8", color: "#fff", borderColor: "#1d4ed8", opacity: dizajni.length >= 4 ? 0.5 : 1 }} disabled={dizajni.length >= 4} onClick={addDizajn}>+ Dodaj dizajn</button>
                    </div>
                    {dizajni.map((d, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 6 }}>
                            <span style={{ fontWeight: 900, color: "#1d4ed8", minWidth: 18, textAlign: "center" }}>{i + 1}</span>
                            <input style={{ ..._inp, maxWidth: 160 }} placeholder="naziv (npr. Santis)" value={d.naziv || ""} onChange={(e) => setDizajn(i, { naziv: e.target.value })} />
                            <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => onFileDiz(i, e)} />
                            {busy === i && <span style={{ fontSize: 12, color: "#64748b" }}>Učitavam…</span>}
                            {d.url && <img src={d.url} alt="" style={{ height: 30, border: "1px solid #e2e8f0", borderRadius: 4 }} />}
                            <button type="button" title="Obriši dizajn" style={{ ..._ebtn, color: "#b91c1c", marginLeft: "auto" }} onClick={() => delDizajn(i)}>✕</button>
                        </div>
                    ))}
                    {!dizajni.length && <div style={{ fontSize: 12, color: "#94a3b8" }}>Dodaj bar jedan dizajn (slika već sadrži fotomarker i QR).</div>}
                </div>

                <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: "#7c3aed" }}>RASPORED TRAKA ({trake.length}) — s leva na desno</span>
                        <button type="button" style={{ ..._ebtn, background: "#7c3aed", color: "#fff", borderColor: "#7c3aed" }} onClick={addTraka}>+ Dodaj traku</button>
                    </div>
                    {trake.map((t, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr 1.5fr 34px", gap: 6, alignItems: "center", marginBottom: 6 }}>
                            <div style={{ fontWeight: 900, color: "#7c3aed", textAlign: "center" }}>{i + 1}</div>
                            <input style={_inp} type="number" placeholder="širina mm" value={t.sirina} onChange={(e) => setTraka(i, { sirina: e.target.value })} />
                            <select style={_inp} value={num(t.dizajnIdx)} onChange={(e) => setTraka(i, { dizajnIdx: Number(e.target.value) })}>
                                {dizajni.length ? dizajni.map((d, di) => <option key={di} value={di}>{d.naziv || ("Dizajn " + (di + 1))}</option>) : <option value={0}>(prvo dodaj dizajn)</option>}
                            </select>
                            <button type="button" title="Obriši traku" style={{ ..._ebtn, color: "#b91c1c", padding: "7px 0" }} onClick={() => delTraka(i)}>✕</button>
                        </div>
                    ))}
                    {!trake.length && <div style={{ fontSize: 12, color: "#94a3b8" }}>Dodaj trake s leva na desno (širina + koji dizajn).</div>}
                    <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4, color: ukupno ? "#0f766e" : "#94a3b8" }}>Ukupna širina traka: {ukupno || 0} mm</div>
                </div>

                <div style={{ fontSize: 11, fontWeight: 900, color: "#1d4ed8", marginBottom: 4 }}>MONTAŽA (pregled)</div>
                <MontazaCrtez dizajni={dizajni} trake={trake} maxWidth={760} />
            </>}
        </div>
    );
}
