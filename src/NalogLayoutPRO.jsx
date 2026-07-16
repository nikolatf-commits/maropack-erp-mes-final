import React from "react";
import QRCode from "qrcode";
import { enrichNalogForPrint, normalizeLayers, safeJson } from "./utils/nalogDataLink";
import { pantoneHex } from "./data/pantone.js";
import { translate, useLang } from "./LanguageProvider.jsx";
import CrtezKese, { kesaToConfig, TIPOVI } from "./CrtezKese.jsx";
import spulnaTechnicalDrawing from "./assets/spulna_technical_drawing.png";
import { kutijaPoKljucu, KUTIJA_LBL } from "./kutije.js";
import { toCrtezKesa, KESA_OPCIJE, KESA_GRUPE, KESA_TIP_PRESET, FOOD_TEXT, opcijaNaloga } from "./kesaOpcije.js";

/* ---------- helpers ---------- */
let LANG = "sr";
function T(k, f) { return translate(LANG, k, f); }
function num(v) { return Number(String(v ?? 0).toString().replace(/\s/g, "").replace(",", ".")) || 0; }
function val(v, f = "—") { return v === undefined || v === null || v === "" ? f : v; }
function pick(o, ks, f = "") { for (const k of ks) if (o && o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k]; return f; }
function fmtN(n) { const x = Number(n || 0); return Number.isFinite(x) ? x.toLocaleString("sr-RS", { maximumFractionDigits: 1 }) : "—"; }

function vrstaColor(v) {
    const x = String(v || "").toUpperCase();
    if (x.includes("PET")) return "#3b82f6";
    if (x.includes("ALU")) return "#9aa3af";
    if (x.includes("OPA") || x.includes("OPP") === false && x.includes("PA")) return "#14b8a6";
    if (x.includes("CPP") || x.includes("OPA")) return "#14b8a6";
    if (x.includes("BOPP") || x.includes("PE") || x.includes("LDPE") || x.includes("LLDPE")) return "#f59e0b";
    if (x.includes("PAPIR") || x.includes("PAPER")) return "#d4a574";
    return "#64748b";
}
function bojaHex(b) {
    if (!b) return "#e2e8f0";
    if (b.tip === "Bela") return "#ffffff";
    if (b.tip === "Lak") return "#e2e8f0";
    return pantoneHex(b.oznaka || b.boja || b.naziv) || b.hex || "#94a3b8";
}

const _gdCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
function getData(nalog) {
    // Keš: getData se zove iz buildD, buildLayers, citajRolne, kesaD, spulnaD...
    // Bez keša se isti JSON iz baze parsira 5+ puta po nalogu — to je bilo glavno usporenje.
    if (_gdCache && nalog && typeof nalog === "object") {
        const hit = _gdCache.get(nalog);
        if (hit) return hit;
    }
    const out = _getData(nalog);
    if (_gdCache && nalog && typeof nalog === "object") _gdCache.set(nalog, out);
    return out;
}
function _getData(nalog) {
    const linked = enrichNalogForPrint(nalog || {});
    const od = safeJson(linked.order_data, {}) || {};
    const resObj = safeJson(linked.res, {}) || {};
    const rezObj = safeJson(linked.rezultati, {}) || {};
    const parObj = safeJson(linked.parametri, {}) || {};
    const parRes = safeJson(parObj.res, {}) || {};
    const embTpl = resObj.template || rezObj.template || parRes.template || parObj.template || null;
    const tpl = safeJson(linked.product_template || linked.template || od.template || embTpl, {}) || {};
    const templateData = safeJson(linked.templateData || tpl.data || od.templateData, {}) || {};
    const t = templateData && Object.keys(templateData).length ? templateData : tpl;
    const folija = linked.folija || od.folija || t.folija || (t.data && t.data.folija) || {};
    const kesa = linked.kesa || od.kesa || t.kesa || (t.data && t.data.kesa) || {};
    const spulna = linked.spulna || od.spulna || t.spulna || (t.data && t.data.spulna) || {};
    const pdf = linked.pdf || od.pdf || t.pdf || {};
    return { linked, od, t, folija, kesa, spulna, pdf };
}

function buildLayers(nalog) {
    const { od, folija, kesa, spulna } = getData(nalog);
    const tip_ = String(nalog.tip_proizvoda || nalog.tip || "").toLowerCase();
    const jeKesa = tip_.includes("kes");
    const jeSpulna = tip_.includes("spul") || tip_.includes("špul");
    const src = jeSpulna ? spulna : (jeKesa ? kesa : folija);
    const normalized = normalizeLayers(nalog, nalog.tip_proizvoda || nalog.tip) || [];
    const arr = (Array.isArray(od.materijali) && od.materijali.length ? od.materijali : (Array.isArray(src.layers) && src.layers.length ? src.layers : normalized)) || [];
    return arr.slice(0, 6).map((m, i) => ({
        n: m.vrsta || m.materijal || m.naziv || ("Sloj " + (i + 1)),
        pv: m.pod_vrsta || m.podvrsta || m.podVrsta || "",
        oz: m.oznaka || m.oznaka_materijala || "",
        pr: m.proizvodjac || m.proizvođač || "",
        u: num(m.debljina ?? m.deb),
        gm2: num(m.gm2 ?? m.gsm ?? m.tezina),
        koef: num(m.koef ?? m.koeficijent),
        c: vrstaColor(m.vrsta),
        uloga: m.uloga || ((m.stampa || m.stamp || m["Š"]) ? "štampan" : ""),
        st: (m.stampa || m.stamp || m["Š"]) ? 1 : 0,
        sirina: num(m.sirina || m.sirina_mm),
    }));
}

/* ---------- D (podaci za v6) ---------- */
function buildD(nalog) {
    const { od, t, folija, kesa } = getData(nalog);
    const jeKesa = String(nalog.tip_proizvoda || nalog.tip || "").toLowerCase().includes("kes");
    const jeSpulna = /spul|špul/.test(String(nalog.tip_proizvoda || nalog.tip || "").toLowerCase());
    const LAY = buildLayers(nalog);
    const TOTu = LAY.reduce((s, l) => s + l.u, 0);
    const kolicina = num(nalog.metraza || nalog.kol || nalog.kolicina || t.porucenaKolicina || od.kolicina) || 0;
    const rz = folija.rezanje || {};
    const fr = folija.finalRoll || {};
    const st = folija.stampa || {};
    const sirinaMat = num(rz.sirinaMaterijala) || num(t.idealnaSirinaMaterijala) || num(LAY[0] && LAY[0].sirina) || num(nalog.sirina) || 840;

    // rezanje - MORA pre kgF, jer broj traka ulazi u obracun kilaze
    let lanes = Array.isArray(rz.sirineTraka) && rz.sirineTraka.length ? rz.sirineTraka.map(num).filter(Boolean) : [];
    if (typeof rz.sirineTraka === "string" && !lanes.length) lanes = String(rz.sirineTraka).split(",").map(num).filter(Boolean);
    if (!lanes.length && Array.isArray(rz.trake) && rz.trake.length) lanes = rz.trake.map((x) => num(x.sirina || x.width)).filter(Boolean);
    if (!lanes.length && num(rz.brojTraka) && num(rz.sirinaTrake)) lanes = Array.from({ length: num(rz.brojTraka) }, () => num(rz.sirinaTrake));
    const usedW = lanes.reduce((s, x) => s + x, 0);
    const otpad = num(rz.otpad) || Math.max(0, sirinaMat - usedW);

    // ---- OBRACUN (ispravljeno) ----
    // `kolicina` = metri GOTOVE TRAKE. Rezanje NE skracuje duzinu - multiplicira je po traci.
    // Zato je maticna rolna N puta KRACA, i po njoj se racuna kilaza.
    const N = lanes.length || num(rz.brojTraka) || 1;
    const korak = num(t.dimenzijaDuzina) || 0;
    const metriMat = N > 0 ? kolicina / N : kolicina;
    const komPoTraci = korak > 0 ? Math.round(metriMat * 1000 / korak) : 0;
    const komUkupno = komPoTraci * N;
    const kgF = (metriMat / 1000) * (sirinaMat / 1000);   // bilo: kolicina umesto metriMat

    // boje
    const boje = (Array.isArray(st.boje) ? st.boje : []).map((b, i) => ({
        sw: bojaHex(b), lab: (i + 1) + "\u00b7" + (b.oznaka || b.tip || "boja") + (b.klise ? "\u00b7" + b.klise : ""),
    }));
    // perforacija
    const pf = (folija.perforacija && typeof folija.perforacija === "object") ? folija.perforacija : {};
    return {
        broj: nalog.master_broj || nalog.broj_naloga || nalog.broj || "—",
        datum: nalog.datum || new Date().toLocaleDateString("sr-RS"),
        rok: nalog.rok || od.rok || t.rok || "—",
        kupac: nalog.kupac || od.kupac || t.kupac || "—",
        proizvod: nalog.proizvod || nalog.naziv || (od.proizvod && od.proizvod.naziv) || t.naziv || "—",
        sifra: nalog.sifra || od.sifra || t.sifra || "—",
        tipLabel: "Folija" + (LAY.length ? " · " + LAY.length + " sloja" : ""),
        dimenzije: (num(t.dimenzijaSirina) || "?") + " × " + (num(t.dimenzijaDuzina) || "?") + " mm",
        kom: od.kom || t.porucenaKolicinaKom || nalog.kom || "—",
        kolicina, sirinaMat, kgF, LAY, TOTu, boje,
        metriMat, N, korak, komPoTraci, komUkupno, jeKesa, jeSpulna,
        dizajn: (st.dizajn && typeof st.dizajn === "object") ? st.dizajn : {},
        stampa: {
            masina: st.masina, strana: st.strana, brojBoja: st.brojBoja, smer: st.smerOdmotavanja,
            klise: st.klise, obimValjka: st.obimValjka, hilzna: st.precnikHilzne, stamparija: st.stamparija,
        },
        kas: {
            tipLepka: pick(folija.kasiranje || {}, ["tipLepka", "lepak"]), odnos: (folija.kasiranje || {}).odnosLepka,
            nanos: (folija.kasiranje || {}).nanosLepka, broj: (folija.kasiranje || {}).brojKasiranja || Math.max(0, LAY.length - 1),
        },
        rez: {
            sirinaMat, lanes, otpad, brojTraka: lanes.length || num(rz.brojTraka),
            sirinaTrake: num(rz.sirinaTrake) || lanes[0] || 0,
            precnik: num(fr.precnik) || num(rz.precnikRolne) || 400,
            duzina: metriMat,   // svaka traka je duga koliko i maticna rolna (bilo: zaostalih 15.000)
            hilzna: num(fr.hilzna) || num(st.precnikHilzne) || 152, smer: fr.smerOdmotavanja || st.smerOdmotavanja || "Na glavu",
        },
        perf: {
            N: num(pf.kolone || pf.brojKolona) || (lanes.length || 8), oV: num(pf.odVrha) || 50, oD: num(pf.odDna) || 50,
            oL: num(pf.odLeve) || 15, oR: num(pf.odDesne) || 15, Wm: sirinaMat, Hm: num(pf.visina) || 600,
            tip: pf.tip || "linija", razmak: num(pf.razmakRupa) || 5,
        },
    };
}

/* ---------- v6 SVG + HTML builderi (parametrizovani sa D) ---------- */
const WEBX0 = 145, WEBX1 = 540, WEBY0 = 258, WEBY1 = 718;
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function labelDataUri(D) {
    const t1 = esc((D.proizvod || "PROIZVOD").toUpperCase().slice(0, 14));
    const t2 = esc((D.kupac || "").slice(0, 16));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="170" height="220">' +
        '<rect width="170" height="220" rx="14" fill="#0e7a52"/><rect x="10" y="10" width="150" height="200" rx="10" fill="#fff"/>' +
        '<text x="85" y="70" text-anchor="middle" font-family="Arial" font-size="14" font-weight="900" fill="#0e7a52">' + t1 + '</text>' +
        '<circle cx="85" cy="125" r="30" fill="#dcfce7" stroke="#16a34a" stroke-width="3"/>' +
        '<text x="85" y="132" text-anchor="middle" font-family="Arial" font-size="13" font-weight="900" fill="#16a34a">MP</text>' +
        '<rect x="24" y="180" width="122" height="22" fill="#0e7a52"/><text x="85" y="195" text-anchor="middle" font-family="Arial" font-size="10" font-weight="800" fill="#fff">' + t2 + '</text></svg>';
    return "data:image/svg+xml," + encodeURIComponent(svg);
}
function sW(i, m, mh) { return '<svg viewBox="0 0 600 760" style="width:auto;max-width:' + (m || 190) + 'px;max-height:' + (mh || 760) + 'px;background:#fff">' + i + '</svg>'; }
function rp(big) { const sw = big ? 2.6 : 1.5; let s = ""; s += '<path d="M 85 42 L 462 42 A 78 108 0 0 1 540 150 L 540 718 L 145 718 L 145 258 L 85 258 Z" fill="#eef3fb"/>'; s += '<path d="M 85 42 L 462 42 A 78 108 0 0 1 540 150 L 540 718 L 145 718 L 145 258" fill="none" stroke="#334a72" stroke-width="' + sw + '"/>'; s += '<ellipse cx="85" cy="150" rx="60" ry="108" fill="#f4f7fd" stroke="#334a72" stroke-width="' + (big ? 2.6 : 2) + '"/>'; s += '<ellipse cx="85" cy="150" rx="23" ry="40" fill="#fff" stroke="#9db6dd" stroke-width="1.6"/>'; s += '<path d="M 145 150 L 188 214 L 145 258 Z" fill="#eef4fc"/>'; s += '<line x1="145" y1="150" x2="145" y2="258" stroke="#334a72" stroke-width="' + (big ? 2.6 : 1.8) + '"/>'; s += '<line x1="92" y1="278" x2="92" y2="560" stroke="#475569" stroke-width="' + (big ? 4.5 : 3) + '"/><path d="M 92 576 l -10 -22 l 20 0 z" fill="#475569"/>'; return s; }
function ah(x, y, dir) { var d; if (dir == 'r') d = 'M' + x + ' ' + y + ' l 9 -3.2 l 0 6.4 z'; else if (dir == 'l') d = 'M' + x + ' ' + y + ' l -9 -3.2 l 0 6.4 z'; else if (dir == 'd') d = 'M' + x + ' ' + y + ' l -3.2 9 l 6.4 0 z'; else d = 'M' + x + ' ' + y + ' l -3.2 -9 l 6.4 0 z'; return '<path d="' + d + '" fill="#1e40af"/>'; }
function dimH(x1, x2, y, t, fy) { var o = ''; if (fy != null) { o += '<line x1="' + x1 + '" y1="' + fy + '" x2="' + x1 + '" y2="' + (y + 8) + '" stroke="#bcd3f7" stroke-width="0.9"/><line x1="' + x2 + '" y1="' + fy + '" x2="' + x2 + '" y2="' + (y + 8) + '" stroke="#bcd3f7" stroke-width="0.9"/>'; } o += '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="#1e40af" stroke-width="1.1"/>' + ah(x1, y, 'r') + ah(x2, y, 'l'); var mx = (x1 + x2) / 2; o += '<rect x="' + (mx - 22) + '" y="' + (y - 9) + '" width="44" height="15" rx="2" fill="#fff" stroke="#dbeafe" stroke-width="0.6"/><text x="' + mx + '" y="' + (y + 1.5) + '" text-anchor="middle" font-size="11.5" font-weight="800" fill="#1e40af">' + t + '</text>'; return o; }
function dimV(x, y1, y2, t, fx) { var o = ''; if (fx != null) { o += '<line x1="' + fx + '" y1="' + y1 + '" x2="' + (x - 8) + '" y2="' + y1 + '" stroke="#bcd3f7" stroke-width="0.9"/><line x1="' + fx + '" y1="' + y2 + '" x2="' + (x - 8) + '" y2="' + y2 + '" stroke="#bcd3f7" stroke-width="0.9"/>'; } o += '<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '" stroke="#1e40af" stroke-width="1.1"/>' + ah(x, y1, 'd') + ah(x, y2, 'u'); var my = (y1 + y2) / 2; o += '<rect x="' + (x - 8) + '" y="' + (my - 23) + '" width="16" height="46" rx="2" fill="#fff" stroke="#dbeafe" stroke-width="0.6"/><text x="' + x + '" y="' + my + '" text-anchor="middle" font-size="11.5" font-weight="800" fill="#1e40af" transform="rotate(-90 ' + x + ' ' + my + ')">' + t + '</text>'; return o; }
function dimSmall(x1, x2, y, t, fy) { var o = ''; if (fy != null) { o += '<line x1="' + x1 + '" y1="' + fy + '" x2="' + x1 + '" y2="' + (y + 4) + '" stroke="#bcd3f7" stroke-width="0.9"/><line x1="' + x2 + '" y1="' + fy + '" x2="' + x2 + '" y2="' + (y + 4) + '" stroke="#bcd3f7" stroke-width="0.9"/>'; } o += '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="#1e40af" stroke-width="1.1"/><line x1="' + x1 + '" y1="' + (y - 3) + '" x2="' + x1 + '" y2="' + (y + 3) + '" stroke="#1e40af"/><line x1="' + x2 + '" y1="' + (y - 3) + '" x2="' + x2 + '" y2="' + (y + 3) + '" stroke="#1e40af"/>'; var mx = (x1 + x2) / 2; o += '<rect x="' + (mx - 13) + '" y="' + (y - 23) + '" width="26" height="14" rx="2" fill="#fff" stroke="#dbeafe" stroke-width="0.6"/><text x="' + mx + '" y="' + (y - 13) + '" text-anchor="middle" font-size="10.5" font-weight="800" fill="#1e40af">' + t + '</text>'; return o; }
function roll(D, mw, mh) {
    const wW = WEBX1 - WEBX0, wH = WEBY1 - WEBY0, cx = (WEBX0 + WEBX1) / 2;
    const dz = D.dizajn || {};
    const url = dz.url || dz.slika || "";
    const Dimg = url || labelDataUri(D);
    const rot = ((Math.round(Number(dz.rotacija) || 0) % 360) + 360) % 360;
    const mir = Number(dz.zrcalo) === -1 ? -1 : 1;
    const sW2 = (Number(dz.sirinaPct) || 100) / 100, sH2 = (Number(dz.visinaPct) || 100) / 100;
    const baseAR = (dz.w && dz.h) ? (dz.w / dz.h) : (85 / 110);
    const IW = wW * sW2, IH = (wW / baseAR) * sH2, slot = Math.max(20, IH), n = Math.max(1, Math.round(wH / slot));
    let t = "";
    for (let i = 0; i < n; i++) {
        const cy = WEBY0 + slot * (i + 0.5);
        t += '<g transform="translate(' + cx + ',' + cy + ') rotate(' + rot + ') scale(' + mir + ',1)"><image href="' + Dimg + '" x="' + (-IW / 2) + '" y="' + (-IH / 2) + '" width="' + IW + '" height="' + IH + '" preserveAspectRatio="none"/></g>';
    }
    return sW(rp(mw > 320) + '<clipPath id="c1"><rect x="' + WEBX0 + '" y="' + WEBY0 + '" width="' + wW + '" height="' + wH + '"/></clipPath><g clip-path="url(#c1)">' + t + '</g>', mw, mh);
}
function perf(D, mw, mh) { const N = Math.max(2, D.perf.N), oV = D.perf.oV, oD = D.perf.oD, oL = D.perf.oL, oR = D.perf.oR, Wm = D.perf.Wm || 840, Hm = D.perf.Hm || 600; const sx = (WEBX1 - WEBX0) / Wm, sy = (WEBY1 - WEBY0) / Hm, xF = WEBX0 + oL * sx, xL = WEBX1 - oR * sx, yT = WEBY0 + oV * sy, yB = WEBY1 - oD * sy, st = (xL - xF) / (N - 1); let o = ""; for (let i = 0; i < N; i++) { const x = xF + st * i; o += '<line x1="' + x + '" y1="' + yT + '" x2="' + x + '" y2="' + yB + '" stroke="#8b5cf6" stroke-width="2.2" stroke-dasharray="9 5"/><text x="' + x + '" y="' + (yT - 7) + '" text-anchor="middle" font-size="9" font-weight="800" fill="#7c3aed">K' + (i + 1) + '</text>'; } const hy = WEBY0 - 17; o += dimSmall(WEBX0, xF, hy, oL, WEBY0); o += dimH(xF, xL, hy, (N - 1) + ' × ' + Math.round(st / sx), WEBY0); o += dimSmall(xL, WEBX1, hy, oR, WEBY0); const vx = WEBX0 - 20; o += dimV(vx, WEBY0, yT, oV, WEBX0) + dimV(vx, yB, WEBY1, oD, WEBX0); return sW(rp(mw > 320) + o, mw, mh); }
function rezSvg(D) { const total = D.rez.sirinaMat || 840; const lanes = D.rez.lanes.length ? D.rez.lanes : Array.from({ length: D.rez.brojTraka || 8 }, () => D.rez.sirinaTrake || 85); const used = lanes.reduce((s, x) => s + x, 0); const we = Math.max(0, (total - used) / 2); const X0 = 50, X1 = 660, scale = (X1 - X0) / total, topY = 46, h = 56; let o = ''; o += '<rect x="' + X0 + '" y="' + topY + '" width="' + (X1 - X0) + '" height="' + h + '" fill="#eef4fc" stroke="#1e3a8a" stroke-width="1.3"/>'; let x = X0; const wePx = we * scale; o += '<rect x="' + x + '" y="' + topY + '" width="' + wePx + '" height="' + h + '" fill="#fee2e2"/>'; x += wePx; lanes.forEach(function (lw, i) { const sPx = lw * scale; o += '<rect x="' + x + '" y="' + topY + '" width="' + sPx + '" height="' + h + '" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1"/><text x="' + (x + sPx / 2) + '" y="' + (topY + h / 2 + 4) + '" text-anchor="middle" font-size="11" font-weight="900" fill="#1d4ed8">' + (i + 1) + '</text><text x="' + (x + sPx / 2) + '" y="' + (topY + h + 13) + '" text-anchor="middle" font-size="9" font-weight="800" fill="#334155">' + lw + '</text>'; x += sPx; }); o += '<rect x="' + x + '" y="' + topY + '" width="' + wePx + '" height="' + h + '" fill="#fee2e2"/>'; o += dimH(X0, X1, topY - 16, total + ' mm'); return '<svg viewBox="0 0 710 120" width="100%" style="max-width:640px;background:#fff">' + o + '</svg>'; }

const COLm = '#d97706', COLs = '#2563eb', COLk = '#4338ca', COLp = '#7c3aed';
function infoC(l, v) { return '<div class="c"><div class="l">' + esc(l) + '</div><div class="v">' + esc(v || '—') + '</div></div>'; }
function stat(l, v, u, c) { return '<div class="stat"><div class="bar" style="background:' + c + '"></div><div class="l">' + esc(l) + '</div><div class="v">' + esc(v) + ' <span class="u">' + esc(u) + '</span></div></div>'; }
function statRow(D) { return '<div class="stats">' + stat(T("nalog.kolicina"), fmtN(D.kolicina), 'm', COLm) + stat('Ukupna debljina', D.TOTu, 'µm', '#0ea5e9') + stat('Slojeva', D.LAY.length, D.LAY.length === 4 ? 'kvadripleks' : (D.LAY.length === 3 ? 'tripleks' : (D.LAY.length === 2 ? 'dupleks' : 'sloj')), '#14b8a6') + stat('Traka', D.rez.brojTraka || '—', '×' + (D.rez.sirinaTrake || '—') + 'mm', COLp) + '</div>'; }
function infoBlock(D) { return '<div class="info">' + infoC(T("nalog.kupac", "Kupac"), D.kupac) + infoC(T("nalog.proizvod"), D.proizvod) + infoC('Šifra', D.sifra) + infoC('Tip', D.tipLabel) + infoC('Dimenzije', D.dimenzije) + infoC('Kom', D.kom) + infoC('Idealna širina', D.sirinaMat + ' mm') + infoC('Rok', D.rok) + '</div>'; }
function secH(no, c, tt, src) { return '<div class="sec-h"><span class="no" style="background:' + c + '">' + no + '</span><span class="tt">' + esc(tt) + '</span><span class="rule"></span>' + (src ? '<span class="src">' + esc(src) + '</span>' : '') + '</div>'; }
function th(arr, c) { return '<thead><tr>' + arr.map(function (h) { const cls = h.n ? ' class="n"' : ''; return '<th' + cls + ' style="background:' + c + '12;color:' + c + '">' + esc(h.t || h) + '</th>'; }).join('') + '</tr></thead>'; }
function foot(a, b, cc) { return '<div class="foot"><div class="sign"><div class="line">' + esc(a) + '</div></div><div class="sign"><div class="line">' + esc(b) + '</div></div><div class="sign"><div class="line">' + esc(cc) + '</div></div></div>'; }
function hd(D, ic, naslov, c, no) { return '<div class="hd" style="background:linear-gradient(135deg,#111827,' + c + ' 150%)"><div class="hd-top"><div class="brand"><div class="mono">MP</div><div><div class="co">MAROPACK D.O.O.</div><div class="nm">PROIZVODNJA AMBALAŽE</div></div></div><div class="docmeta"><div><span class="k">Nalog</span><b>' + esc(D.broj) + '</b></div><div><span class="k">Datum</span>' + esc(D.datum) + '</div><div><span class="k">Rok</span>' + esc(D.rok) + '</div></div></div><div class="title"><span class="ic">' + ic + '</span><span class="big">' + esc(naslov) + '</span><span class="badge">' + no + '</span>' + (D.qr ? '<div class="qrbox"><img class="hdqr" src="' + D.qr + '" alt="QR"/><div class="cap">SKENIRAJ<br>START · PAUZA · KRAJ</div></div>' : '') + '</div></div>'; }
function pageWrap(D, inner, pp) { return '<div class="a4">' + inner + '<div class="pp2">' + esc(D.broj) + '</div><div class="pp">' + esc(pp) + '</div></div>'; }
function kg(D, l) { return (l.gm2 * D.kgF).toFixed(1); }
function matRows(D, extra) { return D.LAY.map(function (l, i) { return '<tr><td><span class="dot-c" style="background:' + l.c + '"></span>' + (i + 1) + '</td><td>' + esc(l.n) + '</td><td>' + esc(l.pv || '—') + '</td><td>' + esc(l.oz || '—') + '</td><td>' + esc(l.pr || '—') + '</td><td class="n">' + l.u + ' µm</td><td class="n">' + (l.gm2 ? l.gm2.toFixed(1) : '—') + '</td><td class="n">' + (l.koef ? l.koef.toFixed(3) : '—') + '</td><td class="n">' + D.sirinaMat + '</td><td class="n">' + fmtN(D.metriMat) + '</td><td class="n">' + kg(D, l) + '</td>' + (extra ? '<td>' + (l.st ? 'DA' : '—') + '</td>' : '') + '</tr>'; }).join(''); }
function totalKg(D) { return D.LAY.reduce(function (s, l) { return s + l.gm2 * D.kgF; }, 0).toFixed(1); }

function pMat(D) {
    const c = COLm; return pageWrap(D, hd(D, '📦', T("nalog.nalog_materijal"), c, 'materijal') + '<div class="body">' + statRow(D) + infoBlock(D) +
        '<div class="ulaz"><b>Obračun:</b> ' + fmtN(D.komUkupno) + ' kom × ' + D.korak + ' mm = ' + fmtN(D.kolicina) + ' m trake &divide; ' + D.N + ' traka = <b>' + fmtN(D.metriMat) + ' m matične rolne</b> (širina ' + D.sirinaMat + ' mm)</div>' +
        '<div class="sec">' + secH(1, c, 'Struktura materijala po sloju', 'iz templejta / kalkulacije') + '<table>' + th(['Sloj', 'Vrsta', 'Pod-vrsta', 'Oznaka', 'Proizvođač', { t: 'Debljina (µm)', n: 1 }, { t: 'g/m²', n: 1 }, { t: 'Koef.', n: 1 }, { t: 'Širina', n: 1 }, { t: 'Potrebno', n: 1 }, { t: 'Kg', n: 1 }, 'Št.'], c) + '<tbody>' + matRows(D, true) + '<tr class="tot"><td colspan="10" style="text-align:right">UKUPNO (' + D.TOTu + ' µm)</td><td class="n">' + totalKg(D) + '</td><td></td></tr></tbody></table></div>' +
        '<div class="sec">' + secH(2, c, 'Rezervisane role iz magacina', 'po broju naloga') + '<table>' + th(['QR rolne', 'Vrsta', 'Oznaka', { t: 'Debljina (µm)', n: 1 }, 'LOT', 'Lokacija', { t: 'Alocirano', n: 1 }, { t: 'Kg', n: 1 }], c) + '<tbody>' + (Array.isArray(D.rolne) && D.rolne.length ? D.rolne : D.LAY.map(function (l) { return { qr: '—', n: l.n, oz: l.oz, u: l.u, lot: '—', lok: '—' }; })).map(function (r, ri) { return '<tr><td>' + esc(r.qr || '—') + '</td><td>' + esc(r.n || '') + '</td><td>' + esc(r.oz || '') + '</td><td class="n">' + (r.u || '—') + ' µm</td><td>' + esc(r.lot || '—') + '</td><td>📍 ' + esc(r.lok || '—') + '</td><td class="n">' + fmtN(r.alok || D.metriMat) + '</td><td class="n">' + (r.kg != null ? fmtN(r.kg) : ((D.LAY[ri] && D.LAY[ri].gm2) ? (D.LAY[ri].gm2 * D.kgF).toFixed(1) : '—')) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        foot('Pripremio (magacioner)', 'Datum / vreme', 'Preuzeo (proizvodnja)') + '</div>', 'Strana · materijal');
}

function pStampa(D) {
    const c = COLs; const L0 = D.LAY.find(function (l) { return l.st; }) || D.LAY[0] || { n: '', pv: '', oz: '', pr: '', u: 0, gm2: 0, c: '#3b82f6' }; const chips = (D.boje.length ? D.boje : [{ sw: '#22d3ee', lab: '1·Cyan' }, { sw: '#ec4899', lab: '2·Magenta' }, { sw: '#facc15', lab: '3·Yellow' }, { sw: '#1f2937', lab: '4·Black' }]).map(function (b) { return '<div class="chip"><span class="sw" style="background:' + b.sw + '"></span>' + esc(b.lab) + '</div>'; }).join(''); return pageWrap(D, hd(D, '🖨️', T("nalog.nalog_stampa"), c, 'štampa') + '<div class="body">' + statRow(D) + infoBlock(D) +
        '<div class="sec">' + secH(1, c, 'Materijal koji se štampa', 'iz templejta') + '<table>' + th(['Sloj', 'Vrsta', 'Pod-vrsta', 'Oznaka', 'Proizvođač', { t: 'Debljina (µm)', n: 1 }, { t: 'Širina', n: 1 }, { t: 'Kg', n: 1 }], c) + '<tbody><tr><td><span class="dot-c" style="background:' + L0.c + '"></span>1</td><td>' + esc(L0.n) + '</td><td>' + esc(L0.pv || '—') + '</td><td>' + esc(L0.oz || '—') + '</td><td>' + esc(L0.pr || '—') + '</td><td class="n">' + L0.u + ' µm</td><td class="n">' + D.sirinaMat + '</td><td class="n">' + kg(D, L0) + '</td></tr></tbody></table></div>' +
        '<div class="sec">' + secH(2, c, 'Parametri štampe', 'iz templejta') + '<div class="info">' + infoC('Mašina', D.stampa.masina) + infoC('Strana', D.stampa.strana) + infoC('Broj boja', D.stampa.brojBoja) + infoC('Smer', D.stampa.smer) + infoC('Kliše', D.stampa.klise) + infoC('Obim valjka', D.stampa.obimValjka) + infoC('Hilzna', D.stampa.hilzna) + infoC('Štamparija', D.stampa.stamparija) + '</div></div>' +
        '<div class="sec">' + secH(3, c, 'Redosled boja', '') + '<div class="chips">' + chips + '</div></div>' +
        '<div class="ulaz" style="margin-top:18px">🖼 <b>Izgled na rolni</b> je na sledećoj strani (veliki prikaz).</div>' +
        foot('Operater štampe', 'Kontrola kvaliteta', 'Predao u kaširanje') + '</div>', 'Strana · štampa');
}

function pRollBig(D, label, sub, pp) { return pageWrap(D, '<div class="body" style="padding:24px 28px"><div class="cap2">Prilog · uz nalog ' + esc(D.broj) + '</div><div class="bigttl">' + esc(label) + '</div><div class="bigsub">' + esc(sub) + '</div><div class="framed">' + roll(D, 500, 860) + '</div><div class="meta-strip"><div class="m"><b>Širina trake</b>' + (D.rez.sirinaTrake || '—') + ' mm</div><div class="m"><b>Hilzna</b>' + D.rez.hilzna + ' mm</div><div class="m"><b>Prečnik</b>' + D.rez.precnik + ' mm</div><div class="m"><b>Smer</b>' + esc(D.rez.smer) + '</div></div></div>', pp); }

function passRow(lab, l) { return '<tr><td>' + lab + '</td><td><span class="dot-c" style="background:' + l.c + '"></span>' + esc(l.n) + '</td><td>' + esc(l.pv || '—') + '</td><td>' + esc(l.oz || '—') + '</td><td>' + esc(l.pr || '—') + '</td><td class="n">' + l.u + ' µm</td></tr>'; }
function passLam(lab, name, u) { return '<tr style="background:#f8fafc"><td>' + lab + '</td><td colspan="4"><i>' + esc(name) + '</i></td><td class="n">' + u + ' µm</td></tr>'; }
function passCard(title, spoj, rowsHtml, c) { return '<div style="border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:10px"><div style="background:' + c + '14;color:' + c + ';font-size:11px;font-weight:900;letter-spacing:.4px;text-transform:uppercase;padding:8px 12px;display:flex;justify-content:space-between"><span>' + esc(title) + '</span><span style="font-weight:800">spoj: ' + esc(spoj) + '</span></div><table style="margin:0">' + th(['Komponenta', 'Vrsta', 'Pod-vrsta', 'Oznaka', 'Proizvođač', { t: 'Debljina (µm)', n: 1 }], c) + '<tbody>' + rowsHtml + '</tbody></table></div>'; }
function ord(i) { return ['Prvo', 'Drugo', 'Treće', 'Četvrto', 'Peto'][i] || ((i + 1) + '.'); }
function pKas(D) {
    const c = COLk; const L = D.LAY; let cards = ''; for (let i = 1; i < L.length; i++) { const prevNames = L.slice(0, i).map(function (x) { return x.n; }).join('/'); const allNames = L.slice(0, i + 1).map(function (x) { return x.n; }).join('/'); let rows; if (i === 1) rows = passRow('Sloj 1', L[0]) + passRow('Sloj 2', L[1]); else rows = passLam('Međuproizvod', 'Laminat ' + prevNames, L.slice(0, i).reduce(function (s, x) { return s + x.u; }, 0)) + passRow('Sloj ' + (i + 1), L[i]); cards += passCard(ord(i - 1) + ' kaširanje', prevNames + ' + ' + L[i].n + ' → ' + allNames, rows, c); } if (!cards) cards = '<div class="ulaz">Jednoslojni materijal — nema kaširanja.</div>';
    return pageWrap(D, hd(D, '🔗', T("nalog.nalog_kasiranje"), c, 'kaširanje') + '<div class="body">' + statRow(D) +
        '<div class="ulaz"><b>Ulaz:</b> ' + esc(L.map(function (x) { return x.n; }).join(' + ')) + ' — laminat se kašira u ' + Math.max(0, L.length - 1) + ' prolaza.</div>' +
        '<div class="sec">' + secH(1, c, 'Tok kaširanja po prolazima', (Math.max(0, L.length - 1)) + ' kaširanja') + cards + '</div>' +
        '<div class="sec">' + secH(2, c, 'Parametri kaširanja', 'iz templejta') + '<div class="info">' + infoC('Tip lepka', D.kas.tipLepka) + infoC('Odnos', D.kas.odnos) + infoC('Nanos', D.kas.nanos) + infoC('Broj kaširanja', D.kas.broj) + infoC('Redosled', L.map(function (x) { return x.n; }).join('/')) + infoC('Ukupna debljina', D.TOTu + ' µm') + infoC('', '') + infoC('', '') + '</div></div>' +
        foot('Operater kaširanja', 'Kontrola kvaliteta', 'Predao u rezanje') + '</div>', 'Strana · kaširanje');
}

function pRez(D) {
    const c = COLp; const lanes = D.rez.lanes.length ? D.rez.lanes : Array.from({ length: D.rez.brojTraka || 0 }, function () { return D.rez.sirinaTrake; }); return pageWrap(D, hd(D, '✂️', 'NALOG ZA PERFORACIJU I REZANJE', c, 'rezanje') + '<div class="body">' + statRow(D) +
        '<div class="ulaz"><b>Ulaz:</b> kaširana rolna, ulazna širina ' + D.sirinaMat + ' mm → ' + (D.rez.brojTraka || '—') + ' traka po ' + (D.rez.sirinaTrake || '—') + ' mm.</div>' +
        '<div class="sec">' + secH(1, c, 'Prikaz rezanja (po širini)', 'iz templejta') + '<div class="fig"><div class="cap">Raspored traka po širini</div>' + rezSvg(D) + '</div></div>' +
        '<div class="sec">' + secH(2, c, 'Plan rezanja', 'iz templejta') + '<div class="info">' + infoC('Širina materijala', D.sirinaMat + ' mm') + infoC('Broj traka', D.rez.brojTraka || '—') + infoC('Širina trake', (D.rez.sirinaTrake || '—') + ' mm') + infoC('Otpad', (D.rez.otpad || 0) + ' mm') + infoC('Prečnik rolne', D.rez.precnik + ' mm') + infoC('Dužina', fmtN(D.rez.duzina) + ' m') + infoC('Hilzna', D.rez.hilzna + ' mm') + infoC('Smer', D.rez.smer) + '</div></div>' +
        (lanes.length ? '<div class="sec">' + secH(3, c, 'Trake', '') + '<table>' + th(['Traka', { t: 'Širina', n: 1 }, { t: 'Metara', n: 1 }, { t: 'Kom', n: 1 }, 'Perforacija'], c) + '<tbody>' + lanes.map(function (lw, i) { return '<tr><td><span class="dot-c" style="background:#c7d2fe"></span>' + (i + 1) + '</td><td class="n">' + lw + ' mm</td><td class="n">' + fmtN(D.rez.duzina) + '</td><td class="n">' + fmtN(D.komPoTraci) + '</td><td>' + esc(D.perf.tip) + ' · ' + D.perf.N + ' kol.</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
        '<div class="ulaz" style="margin-top:16px">🖼 <b>Izgled na finalnoj rolni</b> i <b>perforacija (kotirano)</b> su na posebnim stranama.</div>' +
        foot('Operater rezanja', 'Kontrola kvaliteta', 'U magacin gotovih') + '</div>', 'Strana · perforacija/rezanje');
}

function pPerfBig(D) { return pageWrap(D, '<div class="body" style="padding:24px 28px"><div class="cap2">Prilog · uz nalog ' + esc(D.broj) + '</div><div class="bigttl">PERFORACIJA — KOTIRANO</div><div class="bigsub">' + esc(D.perf.tip) + ' · ' + D.perf.N + ' kolona · sve mere u mm</div><div class="framed">' + perf(D, 500, 860) + '</div><div class="meta-strip"><div class="m"><b>Tip</b>' + esc(D.perf.tip) + '</div><div class="m"><b>Kolona</b>' + D.perf.N + '</div><div class="m"><b>Od vrha</b>' + D.perf.oV + ' mm</div><div class="m"><b>Od dna</b>' + D.perf.oD + ' mm</div><div class="m"><b>Od ivica</b>' + D.perf.oL + ' mm</div></div></div>', 'Strana · perforacija (prilog)'); }


/* ============================ KESA ============================ */
// Naziv tipa kese — iz TIPOVI (CrtezKese.jsx). Polje je `n`. Ima ih 16, ne 6.
function kesaTipLabel(tip) {
    const t = (TIPOVI || {})[tip];
    return (t && t.n) || tip || "—";
}
const OPT_BY_KEY = {};
KESA_OPCIJE.forEach(function (o) { OPT_BY_KEY[o.k] = o; });

function kesaD(nalog) {
    const { od, t, kesa } = getData(nalog);
    const k = kesa || {};
    const W = num(k.sirina), H = num(k.duzina), KL = num(k.klapna), FA = num(k.falta);
    const ban = Math.max(1, num(k.ban) || 1);
    const skart = num(k.skart) || 5;
    const korakK = H + KL + FA;
    const kom = num(k.kolicina) || num(nalog.kom) || num(od.kom) || 0;
    const mTrake = kom * korakK / 1000;
    const mMat = ban > 0 ? mTrake / ban : mTrake;
    const mMatPlus = mMat * (1 + skart / 100);
    const sirMat = num(k.sirinaMaterijala) || num(t.idealnaSirinaMaterijala) || (ban * W);
    const kgF = (mMatPlus / 1000) * (sirMat / 1000);
    const opts = (k.options && typeof k.options === "object") ? Object.keys(k.options).filter(function (x) { return k.options[x]; }) : [];
    const gr = [];
    if (ban * W > sirMat) gr.push(ban + " × " + W + " mm = " + (ban * W) + " mm ne staje u ulaznu širinu " + sirMat + " mm.");
    if (!korakK) gr.push("Nema koraka (dužina + klapna + falta).");
    return {
        raw: k, W: W, H: H, KL: KL, FA: FA, ban: ban, skart: skart, korakK: korakK, kom: kom,
        mTrake: Math.ceil(mTrake), mMat: Math.ceil(mMat), mMatPlus: Math.ceil(mMatPlus),
        sirMat: sirMat, kgF: kgF, otpad: Math.max(0, sirMat - ban * W),
        tip: k.tipKese || "ravna", takt: num(k.takt), tolerancija: k.tolerancija || "±5%",
        pakovanje: k.pakovanje || "—", grafika: k.grafika || "—", transportKg: k.transportKg || "—",
        opts: opts, greske: gr,
    };
}

function kesaStat(D, K) {
    return '<div class="stats">' + stat('Komada', fmtN(K.kom), 'kom', COLm) + stat('Ban', K.ban, K.ban > 1 ? 'trake' : 'traka', '#0ea5e9') +
        stat('Matična rolna', fmtN(K.mMatPlus), 'm (+' + K.skart + '%)', '#14b8a6') +
        stat('Slojeva', D.LAY.length, D.LAY.length === 1 ? 'mono' : (D.LAY.length === 2 ? 'dupleks' : 'tripleks'), COLp) + '</div>';
}
function kesaInfo(D, K) {
    return '<div class="info">' + infoC('Kupac', D.kupac) + infoC('Proizvod', D.proizvod) + infoC('Šifra', D.sifra) +
        infoC('Tip kese', kesaTipLabel(K.tip)) + infoC('Širina × visina', K.W + ' × ' + K.H + ' mm') +
        infoC('Klapna', K.KL + ' mm') + infoC('Falta', K.FA + ' mm') + infoC('Rok', D.rok) + '</div>';
}
function kesaObracun(K) {
    return (K.greske.length ? '<div class="ulaz" style="border-left-color:#dc2626;background:#fef2f2;color:#b91c1c">⚠ ' + K.greske.map(esc).join('<br>⚠ ') + '</div>' : '') +
        '<div class="ulaz"><b>Obračun (BAN = ' + K.ban + '):</b> korak = ' + K.H + ' + ' + K.KL + ' + ' + K.FA + ' = <b>' + K.korakK + ' mm</b> &nbsp;·&nbsp; ' +
        fmtN(K.kom) + ' kom × ' + (K.korakK / 1000).toFixed(3) + ' m = ' + fmtN(K.mTrake) + ' m trake &divide; ' + K.ban + ' = ' + fmtN(K.mMat) + ' m &nbsp;·&nbsp; +' + K.skart + '% škart = <b>' + fmtN(K.mMatPlus) + ' m matične rolne</b> (širina ' + K.sirMat + ' mm)</div>';
}
function kesaTotalKg(D, K) { return D.LAY.reduce(function (a, l) { return a + l.gm2 * K.kgF; }, 0).toFixed(1); }

/* 1/4 materijal */
function pKesaMat(D, K) {
    const c = COLm;
    const rolne = (Array.isArray(D.rolne) && D.rolne.length) ? D.rolne : D.LAY.map(function (l) { return { qr: '—', n: l.n, oz: l.oz, u: l.u, lot: '—', lok: '—' }; });
    return pageWrap(D, hd(D, '📦', 'NALOG ZA MATERIJAL', c, '1/4') + '<div class="body">' + kesaStat(D, K) + kesaInfo(D, K) + kesaObracun(K) +
        '<div class="sec">' + secH(1, c, 'Struktura materijala po sloju', 'iz templejta / kalkulacije') + '<table>' +
        th(['Sloj', 'Vrsta', 'Pod-vrsta', 'Oznaka', 'Proizvođač', { t: 'Debljina (µm)', n: 1 }, { t: 'g/m²', n: 1 }, { t: 'Širina', n: 1 }, { t: 'Potrebno (m)', n: 1 }, { t: 'Kg', n: 1 }], c) + '<tbody>' +
        D.LAY.map(function (l, i) {
            return '<tr><td><span class="dot-c" style="background:' + l.c + '"></span>' + (i + 1) + '</td><td>' + esc(l.n) + '</td><td>' + esc(l.pv || '—') + '</td><td>' + esc(l.oz || '—') + '</td><td>' + esc(l.pr || '—') + '</td><td class="n">' + l.u + ' µm</td><td class="n">' + (l.gm2 ? l.gm2.toFixed(1) : '—') + '</td><td class="n">' + K.sirMat + '</td><td class="n">' + fmtN(K.mMatPlus) + '</td><td class="n">' + (l.gm2 * K.kgF).toFixed(1) + '</td></tr>';
        }).join('') +
        '<tr class="tot"><td colspan="9" style="text-align:right">UKUPNO (' + D.TOTu + ' µm)</td><td class="n">' + kesaTotalKg(D, K) + '</td></tr></tbody></table></div>' +

        '<div class="sec">' + secH(2, c, 'Raspored po širini (ban)', '') + '<table>' +
        th(['Ban', { t: 'Širina kese', n: 1 }, { t: 'Metara', n: 1 }, { t: 'Komada', n: 1 }], c) + '<tbody>' +
        Array.from({ length: K.ban }, function (_, i) { return '<tr><td><span class="dot-c" style="background:#c7d2fe"></span>' + (i + 1) + '</td><td class="n">' + K.W + ' mm</td><td class="n">' + fmtN(K.mMatPlus) + '</td><td class="n">' + fmtN(Math.round(K.kom / K.ban)) + '</td></tr>'; }).join('') +
        '<tr class="tot"><td>Ulazna širina ' + K.sirMat + ' mm</td><td class="n">otpad ' + K.otpad + ' mm</td><td class="n">—</td><td class="n">' + fmtN(K.kom) + '</td></tr></tbody></table></div>' +

        '<div class="sec">' + secH(3, c, 'Rezervisane role iz magacina', 'po broju naloga') + '<table>' +
        th(['QR rolne', 'Vrsta', 'Oznaka', { t: 'Debljina (µm)', n: 1 }, 'LOT', 'Lokacija', { t: 'Alocirano (m)', n: 1 }, { t: 'Kg', n: 1 }], c) + '<tbody>' +
        rolne.map(function (r, i) {
            const l = D.LAY[i] || {};
            return '<tr><td>' + esc(r.qr || '—') + '</td><td>' + esc(r.n || '') + '</td><td>' + esc(r.oz || '') + '</td><td class="n">' + (r.u || '—') + ' µm</td><td>' + esc(r.lot || '—') + '</td><td>📍 ' + esc(r.lok || '—') + '</td><td class="n">' + fmtN(r.alok || K.mMatPlus) + '</td><td class="n">' + (r.kg != null ? fmtN(r.kg) : (l.gm2 ? (l.gm2 * K.kgF).toFixed(1) : '—')) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        foot('Pripremio (magacioner)', 'Datum / vreme', 'Preuzeo (proizvodnja)') + '</div>', 'Strana 1 · materijal');
}

/* 2/4 kasiranje */
function pKesaKas(D, K) {
    const c = COLk, L = D.LAY;
    const prolazi = L.length > 1 ? L.slice(1).map(function (l, i) {
        const pre = L.slice(0, i + 1);
        const naziv = pre.map(function (x) { return x.n; }).join('/');
        const deb = pre.reduce(function (a, x) { return a + x.u; }, 0);
        const RB = ['PRVO', 'DRUGO', 'TREĆE', 'ČETVRTO'][i] || (i + 1) + '.';
        return '<div class="subsec"><div class="subh" style="color:' + c + '">' + (i + 1) + '. ' + RB + ' KAŠIRANJE <span style="float:right">SPOJ: ' + esc(naziv) + ' + ' + esc(l.n) + ' → ' + esc(naziv + '/' + l.n) + '</span></div>' +
            '<table>' + th(['Komponenta', 'Vrsta', 'Oznaka', 'Proizvođač', { t: 'Debljina (µm)', n: 1 }], c) + '<tbody>' +
            '<tr><td>' + (i === 0 ? 'Sloj 1' : 'Međuproizvod') + '</td><td>' + esc(i === 0 ? L[0].n : 'Laminat ' + naziv) + '</td><td>' + esc(i === 0 ? (L[0].oz || '—') : '—') + '</td><td>' + esc(i === 0 ? (L[0].pr || '—') : '—') + '</td><td class="n">' + deb + ' µm</td></tr>' +
            '<tr><td>Sloj ' + (i + 2) + '</td><td>' + esc(l.n) + '</td><td>' + esc(l.oz || '—') + '</td><td>' + esc(l.pr || '—') + '</td><td class="n">' + l.u + ' µm</td></tr>' +
            '</tbody></table></div>';
    }).join('') : '<div class="ulaz">Mono materijal — kaširanje se ne radi.</div>';
    return pageWrap(D, hd(D, '🔗', 'NALOG ZA KAŠIRANJE', c, '2/4') + '<div class="body">' + kesaStat(D, K) + kesaInfo(D, K) +
        '<div class="ulaz"><b>Ulaz:</b> ' + L.map(function (l) { return esc(l.n); }).join(' + ') + ' — kašira se u ' + Math.max(0, L.length - 1) + ' prolaza. Matična rolna ' + fmtN(K.mMatPlus) + ' m × ' + K.sirMat + ' mm.</div>' +
        '<div class="sec">' + secH(1, c, 'Tok kaširanja po prolazima', Math.max(0, L.length - 1) + ' kaširanja') + prolazi + '</div>' +
        '<div class="sec">' + secH(2, c, 'Parametri kaširanja', 'iz templejta') + '<div class="info">' +
        infoC('Tip lepka', D.kas.tipLepka) + infoC('Odnos', D.kas.odnos) + infoC('Nanos', D.kas.nanos) + infoC('Broj kaširanja', Math.max(0, L.length - 1)) +
        infoC('Redosled', L.map(function (l) { return l.n; }).join('/')) + infoC('Ukupna debljina', D.TOTu + ' µm') +
        infoC('Metara', fmtN(K.mMatPlus) + ' m') + infoC('Ukupno kg', kesaTotalKg(D, K) + ' kg') + '</div></div>' +
        foot('Operater kaširanja', 'Kontrola kvaliteta', 'Predao na kesarku') + '</div>', 'Strana 2 · kaširanje');
}

/* 3/4 tehnicke karakteristike */
function pKesa(D, K) {
    const c = '#b91c1c';
    const k = K.raw || {};
    const opt = k.options || {}, sel = k.optSel || {}, pos = k.positions || {}, txt = k.optText || {};
    const preset = KESA_TIP_PRESET[K.tip] || [];

    // grupisano po KESA_GRUPE, sa oznakom da li je opcija standardna za tip ili posebno tražena
    const grupe = KESA_GRUPE.map(function (g) {
        const red = g.keys.filter(function (key) { return opt[key]; }).map(function (key) {
            const op = OPT_BY_KEY[key];
            if (!op) return '';
            const tekst = opcijaNaloga(op, sel[key], pos[key]);
            const dodatno = Object.keys(txt[key] || {}).map(function (tk) { return txt[key][tk]; }).filter(Boolean).join(' · ');
            const std = preset.indexOf(key) >= 0;
            return '<tr>' +
                '<td style="width:30%"><span class="dot-c" style="background:' + g.c + '"></span><b>' + esc(op.l) + '</b></td>' +
                '<td style="width:50%;font-weight:700">' + esc(tekst.replace(op.l, '').replace(/^\s*·?\s*/, '') || 'DA') + (dodatno ? '<br><span style="font-weight:600;color:#64748b">' + esc(dodatno) + '</span>' : '') + '</td>' +
                '<td style="width:20%">' + (std
                    ? '<span style="font-size:9px;font-weight:900;color:#64748b;background:#f1f5f9;padding:3px 8px;border-radius:99px">standardno za tip</span>'
                    : '<span style="font-size:9px;font-weight:900;color:#b45309;background:#fef3c7;padding:3px 8px;border-radius:99px">POSEBNO TRAŽENO</span>') + '</td></tr>';
        }).filter(Boolean).join('');
        if (!red) return '';
        return '<div class="subsec"><div class="subh" style="color:' + g.c + '">' + esc(g.l.toUpperCase()) + '</div><table><tbody>' + red + '</tbody></table></div>';
    }).filter(Boolean).join('');

    const brOpcija = Object.keys(opt).filter(function (x) { return opt[x]; }).length;
    const foodBox = opt.hrana
        ? '<div class="ulaz" style="border-left-color:#059669;background:#ecfdf5;color:#065f46;margin-top:12px"><b>⚠ ' + esc(FOOD_TEXT) + '</b></div>'
        : '';

    return pageWrap(D, hd(D, '🛍', 'NALOG ZA KESU — TEHNIČKE KARAKTERISTIKE', c, '3/4') + '<div class="body">' + kesaStat(D, K) + kesaInfo(D, K) +
        '<div class="sec">' + secH(1, c, 'Dimenzije kese', 'iz templejta') + '<div class="info">' +
        infoC('Tip kese', kesaTipLabel(K.tip)) + infoC('Širina (W)', K.W + ' mm') + infoC('Visina (H)', K.H + ' mm') + infoC('Klapna', K.KL + ' mm') +
        infoC('Falta (dno)', K.FA + ' mm') + infoC('Korak na traci', K.korakK + ' mm') +
        infoC('Tolerancija količine', sel.tolerancija_kol || K.tolerancija) + infoC('Pakovati', sel.pakovati || '—') + '</div></div>' +

        '<div class="sec">' + secH(2, c, 'Parametri mašine', 'iz templejta') + '<div class="info">' +
        infoC('Ban', K.ban + (K.ban > 1 ? ' trake' : ' traka')) + infoC('Takt', K.takt ? K.takt + ' /min' : '—') +
        infoC('Ulazna širina', K.sirMat + ' mm') + infoC('Otpad', K.otpad + ' mm') +
        infoC('Materijal', D.LAY.map(function (l) { return l.n; }).join('/')) + infoC('Debljina', D.TOTu + ' µm') +
        infoC('Metara', fmtN(K.mMatPlus) + ' m') + infoC('Ukupno kg', kesaTotalKg(D, K) + ' kg') + '</div></div>' +

        '<div class="sec">' + secH(3, c, 'Opcije i dorada', brOpcija + ' čekirano') +
        (grupe || '<div class="ulaz">Bez dodatnih opcija.</div>') + foodBox + '</div>' +

        '<div class="ulaz" style="margin-top:14px">📐 <b>Tehnički crtež kese (kotirano)</b> je na posebnoj strani — vidi sledeću stranu.</div>' +
        foot('Operater kesarke', 'Kontrola kvaliteta', 'U magacin gotovih') + '</div>', 'Strana 3 · kesa');
}
/* ========================== KRAJ KESA ========================== */


/* =========================== ŠPULNA =========================== */
const SPULNA_SKICA = spulnaTechnicalDrawing;
/*  Obračun po Excel nalogu (Radni_nalog 0150/2026):
 *    ukupno m   = broj špulni × metara po špulni      156 × 20.000 = 3.120.000 m
 *    m²         = ukupno m × W/1000                   × 0,020      =    62.400 m²
 *    kg         = m² × Σ g/m²                          × 60 g/m²   =     3.744 kg
 *    broj traka = širina materijala ÷ W               480 ÷ 20     =        24
 *    matična    = ukupno m ÷ broj traka               ÷ 24         =   130.000 m
 *  (kilaža je ista računata preko m² ili preko matične rolne — provereno)
 */
function spulnaD(nalog) {
    const { od, t, spulna } = getData(nalog);
    const p = spulna || {};
    const W = num(p.W) || 20;                                   // širina trake / špulne
    const sirMat = num(p.sirinaMaterijala) || num(t.idealnaSirinaMaterijala) || 480;
    const maxM = num(p.maxMetara) || 20000;                     // max metara na jednoj špulni
    const gm2 = (buildLayers(nalog) || []).reduce(function (a, l) { return a + (l.gm2 || 0); }, 0);
    const skart = num(p.skart) || 0;
    const jed = p.jedinicaUnosa || "m2";                        // m2 | kom | kg | m
    const v = num(p.kolicina) || num(nalog.kom) || num(od.kom) || 0;

    let m2 = 0;
    if (jed === "kom") m2 = v * maxM * (W / 1000);
    else if (jed === "kg") m2 = gm2 > 0 ? (v * 1000) / gm2 : 0;
    else if (jed === "m") m2 = v * (W / 1000);
    else m2 = v;                                                 // m²

    const m2Rad = m2 * (1 + skart / 100);
    const ukupnoM = W > 0 ? m2Rad / (W / 1000) : 0;              // metri gotove trake
    const spulni = maxM > 0 ? Math.ceil(ukupnoM / maxM) : 0;
    const N = W > 0 ? Math.max(1, Math.floor(sirMat / W)) : 1;   // traka po širini
    const metriMat = N > 0 ? ukupnoM / N : ukupnoM;              // matična rolna
    const kg = m2Rad * gm2 / 1000;
    const kgF = m2Rad / 1000;                                    // množilac za kg po sloju

    const poPaleti = num(p.rolniPoPaleti) || 18;
    const palete = poPaleti > 0 ? spulni / poPaleti : 0;

    const gr = [];
    if (!W) gr.push("Nema širine trake (W).");
    if (!gm2) gr.push("Slojevi nemaju g/m² — kilaža se ne može izračunati.");
    if (N * W > sirMat) gr.push(N + " × " + W + " mm ne staje u " + sirMat + " mm.");

    return {
        raw: p, W: W, sirMat: sirMat, maxM: maxM, gm2: gm2, skart: skart, jed: jed, unos: v,
        Da: num(p.Da) || num(p.da) || 158, Di: num(p.Di) || num(p.di) || 152,
        C: num(p.C) || 0, G: num(p.G) || 0, Tw: num(p.T) || 280, D: num(p.D) || 385,
        sirHilzne: num(p.sirinaHilzne) || num(p.T) || 300,
        smer: p.smer || "Gap winding",
        smerNamotavanja: p.smerNamotavanja || "—",
        tezinaBruto: p.tezinaBruto || "",
        sideA: p.sideA || "Silikon", sideB: p.sideB || "Papir",
        materijal: p.materijal || "—",
        kutija: (function () { const b = kutijaPoKljucu(p.kutija); return b ? KUTIJA_LBL(b) : (p.kutija || "—"); })(), poPaleti: poPaleti,
        napomena: p.napomena || "",
        m2: Math.round(m2), m2Rad: Math.round(m2Rad),
        ukupnoM: Math.round(ukupnoM), spulni: spulni, hilzne: spulni, kutije: spulni,
        palete: palete, N: N, metriMat: Math.round(metriMat),
        otpad: Math.max(0, sirMat - N * W),
        kg: kg, kgF: kgF, greske: gr,
    };
}

function spStat(D, S) {
    return '<div class="stats">' +
        stat('Špulni', fmtN(S.spulni), 'kom', COLm) +
        stat('Po špulni', fmtN(S.maxM), 'm', '#0ea5e9') +
        stat('Matična rolna', fmtN(S.metriMat), 'm', '#14b8a6') +
        stat('Traka', S.N, '×' + S.W + 'mm', COLp) + '</div>';
}
function spInfo(D, S) {
    return '<div class="info">' + infoC('Kupac', D.kupac) + infoC('Proizvod', D.proizvod) + infoC('Šifra', D.sifra) +
        infoC('Materijal', S.materijal) + infoC('Širina materijala', S.sirMat + ' mm') +
        infoC('Side A / Side B', S.sideA + ' / ' + S.sideB) + infoC('Ukupno m²', fmtN(S.m2Rad) + ' m²') + infoC('Rok', D.rok) + '</div>';
}
function spObracun(S) {
    return (S.greske.length ? '<div class="ulaz" style="border-left-color:#dc2626;background:#fef2f2;color:#b91c1c">⚠ ' + S.greske.map(esc).join('<br>⚠ ') + '</div>' : '') +
        '<div class="ulaz"><b>Obračun:</b> ' + fmtN(S.spulni) + ' špulni × ' + fmtN(S.maxM) + ' m = <b>' + fmtN(S.ukupnoM) + ' m</b> trake ' +
        '&nbsp;·&nbsp; × ' + (S.W / 1000).toFixed(3) + ' m (W) = <b>' + fmtN(S.m2Rad) + ' m²</b> ' +
        '&nbsp;·&nbsp; × ' + fmtN(S.gm2) + ' g/m² = <b>' + fmtN(S.kg) + ' kg</b><br>' +
        'Rezanje: ' + S.sirMat + ' mm ÷ ' + S.W + ' mm = <b>' + S.N + ' traka</b> → matična rolna <b>' + fmtN(S.metriMat) + ' m</b> (otpad ' + S.otpad + ' mm)</div>';
}

/* 1/3 — materijal */
function pSpMat(D, S) {
    const c = COLm;
    const rolne = (Array.isArray(D.rolne) && D.rolne.length) ? D.rolne : D.LAY.map(function (l) { return { qr: '—', n: l.n, oz: l.oz, u: l.u, lot: '—', lok: '—' }; });
    return pageWrap(D, hd(D, '📦', 'NALOG ZA MATERIJAL', c, '1/2') + '<div class="body">' + spStat(D, S) + spInfo(D, S) + spObracun(S) +
        '<div class="sec">' + secH(1, c, 'Struktura materijala po sloju', 'iz templejta / kalkulacije') + '<table>' +
        th(['Sloj', 'Vrsta', 'Oznaka', 'Proizvođač', { t: 'Debljina (µm)', n: 1 }, { t: 'g/m²', n: 1 }, { t: 'Širina', n: 1 }, { t: 'Potrebno (m)', n: 1 }, { t: 'Kg', n: 1 }], c) + '<tbody>' +
        D.LAY.map(function (l, i) {
            return '<tr><td><span class="dot-c" style="background:' + l.c + '"></span>' + (i + 1) + '</td><td>' + esc(l.n) + '</td><td>' + esc(l.oz || '—') + '</td><td>' + esc(l.pr || '—') + '</td><td class="n">' + l.u + ' µm</td><td class="n">' + (l.gm2 ? l.gm2.toFixed(1) : '—') + '</td><td class="n">' + S.sirMat + '</td><td class="n">' + fmtN(S.metriMat) + '</td><td class="n">' + fmtN(l.gm2 * S.kgF) + '</td></tr>';
        }).join('') +
        '<tr class="tot"><td colspan="8" style="text-align:right">UKUPNO (' + fmtN(S.m2Rad) + ' m²)</td><td class="n">' + fmtN(S.kg) + '</td></tr></tbody></table></div>' +

        '<div class="sec">' + secH(2, c, 'Rezervisane role iz magacina', 'po broju naloga') + '<table>' +
        th(['QR rolne', 'Vrsta', 'Oznaka', { t: 'Debljina (µm)', n: 1 }, 'LOT', 'Lokacija', { t: 'Alocirano (m)', n: 1 }, { t: 'Kg', n: 1 }], c) + '<tbody>' +
        rolne.map(function (r, i) {
            const l = D.LAY[i] || {};
            return '<tr><td>' + esc(r.qr || '—') + '</td><td>' + esc(r.n || '') + '</td><td>' + esc(r.oz || '') + '</td><td class="n">' + (r.u || '—') + ' µm</td><td>' + esc(r.lot || '—') + '</td><td>📍 ' + esc(r.lok || '—') + '</td><td class="n">' + fmtN(r.alok || S.metriMat) + '</td><td class="n">' + (r.kg != null ? fmtN(r.kg) : (l.gm2 ? fmtN(l.gm2 * S.kgF) : '—')) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        foot('Pripremio (magacioner)', 'Datum / vreme', 'Preuzeo (proizvodnja)') + '</div>', 'Strana 1 · materijal');
}

/* 2/2 — tehničke karakteristike + skica iz templejta */
const SP_LEGENDA = [
    ["W", "Širina trake (mm)"],
    ["T", "Širina hilzne / jezgra (mm)"],
    ["D", "Maksimalni prečnik špulne (mm)"],
    ["Da", "Spoljašnji prečnik hilzne (mm)"],
    ["Di", "Unutrašnji prečnik hilzne (mm)"],
    ["G", "Gap — razmak između kraja namotaja i ivice špulne (mm)"],
    ["C", "Zazor — bočni zazor između materijala i ivice (mm)"],
    ["Gap winding", "Namotavanje sa razmakom (gap)"],
    ["Overlapped winding", "Namotavanje sa preklapanjem"],
];

function pSpulna(D, S) {
    const c = '#7c3aed';
    return pageWrap(D, hd(D, '🧵', 'NALOG ZA ŠPULNU — TEHNIČKE KARAKTERISTIKE', c, '2/2') + '<div class="body">' + spStat(D, S) + spInfo(D, S) +

        '<div class="sec">' + secH(1, c, 'Dimenzije špulne', 'iz templejta') + '<div class="info">' +
        infoC('W — širina trake', S.W + ' mm') + infoC('da — spoljni Ø hilzne', S.Da + ' mm') + infoC('di — unutrašnji Ø hilzne', S.Di + ' mm') + infoC('C — zazor', S.C + ' mm') +
        infoC('G — gap', S.G + ' mm') + infoC('T — širina hilzne', S.Tw + ' mm') + infoC('D — max Ø špulne', S.D + ' mm') + infoC('Max metara / špulni', fmtN(S.maxM) + ' m') + '</div></div>' +

        '<div class="sec">' + secH(2, c, 'Tehnički prikaz (skica)', 'iz templejta') +
        '<div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(230px,1fr);gap:14;align-items:center">' +
        '<div class="framed" style="padding:10px"><img src="' + SPULNA_SKICA + '" alt="Tehnički crtež špulne" style="width:100%;height:auto;display:block"/></div>' +
        '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px">' +
        '<div style="font-size:11px;font-weight:950;color:#334155;margin-bottom:7px">LEGENDA</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:10px;border:0"><tbody>' +
        SP_LEGENDA.map(function (r) {
            return '<tr><td style="width:58px;padding:5px 4px;border-bottom:1px solid #eef2f7;font-weight:950;color:#0f172a">' + esc(r[0]) + '</td>' +
                '<td style="padding:5px 4px;border-bottom:1px solid #eef2f7;color:#475569;font-weight:700">' + esc(r[1]) + '</td></tr>';
        }).join('') + '</tbody></table></div></div></div>' +

        '<div class="sec">' + secH(3, c, 'Količine', '') + '<table>' +
        th(['Stavka', { t: 'Poručeno', n: 1 }, { t: 'Za rad', n: 1 }, 'Jed.'], c) + '<tbody>' +
        '<tr><td><b>m²</b></td><td class="n">' + fmtN(S.m2) + '</td><td class="n">' + fmtN(S.m2Rad) + '</td><td>m²</td></tr>' +
        '<tr><td><b>Metara trake</b></td><td class="n">' + fmtN(S.ukupnoM) + '</td><td class="n">' + fmtN(S.ukupnoM) + '</td><td>m</td></tr>' +
        '<tr><td><b>Špulni</b></td><td class="n">' + fmtN(S.spulni) + '</td><td class="n">' + fmtN(S.spulni) + '</td><td>kom</td></tr>' +
        '<tr><td><b>Hilzni</b></td><td class="n">' + fmtN(S.hilzne) + '</td><td class="n">' + fmtN(S.hilzne) + '</td><td>kom</td></tr>' +
        '<tr><td><b>Kutija</b></td><td class="n">' + fmtN(S.kutije) + '</td><td class="n">' + fmtN(S.kutije) + '</td><td>kom</td></tr>' +
        '<tr class="tot"><td><b>Kilaža materijala</b></td><td class="n">' + fmtN(S.kg) + '</td><td class="n">' + fmtN(S.kg) + '</td><td>kg</td></tr>' +
        '</tbody></table></div>' +

        '<div class="sec">' + secH(4, c, 'Pakovanje proizvoda', '') + '<div class="info">' +
        infoC('Pakovanje u kutije', S.kutija) + infoC('Rolni po paleti', S.poPaleti) + infoC('Broj paleta', S.palete.toFixed(1)) +
        infoC('Tip namotavanja', S.smer) + infoC('Smer namotavanja', S.smerNamotavanja) + infoC('Težina bruto', S.tezinaBruto ? S.tezinaBruto + ' kg' : '—') +
        infoC('Side A', S.sideA) + infoC('Side B', S.sideB) + '</div>' +
        (S.napomena ? '<div class="ulaz" style="border-left-color:#dc2626;background:#fef2f2;color:#b91c1c;margin-top:10px"><b>Napomena:</b> ' + esc(S.napomena) + '</div>' : '') + '</div>' +

        foot('Operater namotavanja', 'Kontrola kvaliteta', 'U magacin gotovih') + '</div>', 'Strana 2 · špulna');
}

/* ========================= KRAJ ŠPULNA ========================= */

/* Rolne za nalog.
 * potvrdiNalogMaterijal() ih upisuje kao `parametri.izabrane_rolne` (izborData),
 * a ranije se ovde tražilo samo `rezervisane_rolne` — pa se nikad nisu prikazivale.
 * Sada se čitaju iz svih mesta gde mogu da stoje.
 */
function citajRolne(nalog) {
    const par = safeJson(nalog.parametri, {}) || {};
    const res = safeJson(nalog.res, {}) || {};
    const od = safeJson(nalog.order_data, {}) || {};
    const src =
        (Array.isArray(nalog.rezervisane_rolne) && nalog.rezervisane_rolne) ||
        (Array.isArray(nalog.rezervisaneRolne) && nalog.rezervisaneRolne) ||
        (Array.isArray(nalog.rolne) && nalog.rolne) ||
        (Array.isArray(par.izabrane_rolne) && par.izabrane_rolne) ||
        (Array.isArray(res.izabrane_rolne) && res.izabrane_rolne) ||
        (Array.isArray(od.izabrane_rolne) && od.izabrane_rolne) ||
        (Array.isArray(nalog.izabrane_rolne) && nalog.izabrane_rolne) ||
        [];

    return src
        .filter(function (r) { return r && (r.br_rolne || r.qr || r.qr_kod || r.rolna_id || r.id); })
        .slice(0, 12)
        .map(function (r) {
            const alok = num(r.alocirano_m || r.alocirano || r.metraza);
            const kgpm = num(r.kg_po_m);
            return {
                qr: r.br_rolne || r.qr || r.qr_kod || r.rolna_id || r.id,
                n: r.snap_vrsta || r.vrsta || r.materijal || r.tip || "",
                oz: r.snap_oznaka || r.oznaka || r.oznaka_materijala || "",
                u: r.snap_debljina || r.debljina || r.deb || "",
                lot: r.lot || r.LOT || "—",
                lok: r.lokacija || r.palet || r.location || "—",
                alok: alok,
                kg: kgpm > 0 && alok > 0 ? +(kgpm * alok).toFixed(1) : null,
                sloj: num(r.sloj) || 0,
            };
        });
}

function formatiranjeD(nalog) {
    const par = (typeof safeJson === "function" ? safeJson(nalog.parametri, {}) : (nalog.parametri || {})) || {};
    const res = (typeof safeJson === "function" ? safeJson(nalog.res, {}) : (nalog.res || {})) || {};
    const f = nalog.formatiranje || par.formatiranje || res.formatiranje || {};

    const matSir = num(f.sirina_mm) || num(f.matSir) || 0;
    const plan = (Array.isArray(f.plan_reza) ? f.plan_reza : []).map(function (s) {
        return {
            duzina: num(s.duzina_m),
            otpad: num(s.otpad_mm),
            trake: (Array.isArray(s.trake) ? s.trake : []).map(function (t) {
                return { sir: num(t.sirina_mm), odr: t.odrediste || "stanje", nap: t.napomena || "" };
            }),
        };
    });

    // izvedene role za tabelu (LOT nasleđuje bazu; brojač se nastavlja na izvršenju)
    const lotBaza = f.lot_baza || f.lot || "LOT";
    let seq = 0;
    const role = [];
    plan.forEach(function (s) {
        s.trake.forEach(function (t) {
            role.push({
                lot: lotBaza + "-" + (++seq),
                sir: t.sir, duz: s.duzina, odr: t.odr,
                nap: t.nap || (String(t.odr) === "stanje" ? "bočni ostatak" : ""),
            });
        });
    });

    // statistika
    let korisno = 0, cut = 0, otpadM2 = 0, utrosak = 0;
    plan.forEach(function (s) {
        s.trake.forEach(function (t) { korisno += t.sir * s.duzina; });
        cut += matSir * s.duzina;
        otpadM2 += s.otpad * s.duzina;
        utrosak += s.duzina;
    });
    const isk = cut ? Math.round((korisno / cut) * 1000) / 10 : 0;

    const gr = [];
    if (!matSir) gr.push("Nema širine matične rolne.");
    if (!plan.length) gr.push("Nema plana reza — pokreni predlog (korak 1).");

    return {
        matBr: f.br_rolne || f.matBr || "—",
        matSir: matSir,
        materijal: f.materijal || "—",
        proizvodjac: f.proizvodjac || f.dobavljac || "—",
        izvor_ponbr: f.izvor_ponbr || null,
        preventivno: !!f.preventivno || !f.izvor_ponbr,
        lotBaza: lotBaza,
        utrosak: num(f.utrosak_m) || utrosak,
        plan: plan, role: role,
        novih: role.length, otpadM2: Math.round(otpadM2), isk: isk,
        greske: gr,
    };
}

/* Plan reza — SVG fig blok (isti vizuelni jezik kao rezSvg) */
function fmtSvg(F) {
    const X0 = 118, X1 = 706, barW = X1 - X0, rowH = 78, barH = 46, W = F.matSir || 1;
    const scale = barW / W;
    const BOJ = function (odr) {
        if (String(odr) === "stanje" || !odr) return { f: "#e5e7eb", s: "#64748b", t: "#475569", lab: "stanje" };
        if (String(odr).indexOf("nalog") === 0) return { f: "#dbeafe", s: "#1d4ed8", t: "#1d4ed8", lab: "nalog" };
        return { f: "#dcfce7", s: "#059669", t: "#047857", lab: "nalog" };
    };
    const H = F.plan.length * rowH + 16;
    let o = "";
    o += '<defs><pattern id="fmtHatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#fef2f2"/><line x1="0" y1="0" x2="0" y2="7" stroke="#fca5a5" stroke-width="2"/></pattern></defs>';
    F.plan.forEach(function (s, i) {
        const y = i * rowH + 6, by = y + 14;
        // labela segmenta u levom žlebu
        o += '<text x="6" y="' + (by + 18) + '" font-size="10.5" font-weight="900" fill="#334155">SEGMENT ' + (i + 1) + '</text>';
        o += '<text x="6" y="' + (by + 33) + '" font-size="10" font-weight="800" fill="#64748b">' + fmtN(s.duzina) + ' m</text>';
        // matična kao okvir
        o += '<rect x="' + X0 + '" y="' + by + '" width="' + barW + '" height="' + barH + '" fill="#eef4fc" stroke="#1e3a8a" stroke-width="1.2"/>';
        let x = X0;
        s.trake.forEach(function (t) {
            const w = t.sir * scale, col = BOJ(t.odr), usko = w < 46;
            o += '<rect x="' + x + '" y="' + by + '" width="' + w + '" height="' + barH + '" fill="' + col.f + '" stroke="' + col.s + '" stroke-width="1"/>';
            o += '<text x="' + (x + w / 2) + '" y="' + (by + (usko ? barH / 2 + 3 : barH / 2 - 2)) + '" text-anchor="middle" font-size="11" font-weight="900" fill="' + col.t + '">' + t.sir + '</text>';
            if (!usko) o += '<text x="' + (x + w / 2) + '" y="' + (by + barH / 2 + 12) + '" text-anchor="middle" font-size="8.5" font-weight="700" fill="' + col.t + '" opacity="0.85">' + col.lab + '</text>';
            x += w;
        });
        // otpad
        const ow = s.otpad * scale;
        if (ow > 1) {
            o += '<rect x="' + x + '" y="' + by + '" width="' + ow + '" height="' + barH + '" fill="url(#fmtHatch)" stroke="#fca5a5" stroke-width="1"/>';
            if (ow > 34) o += '<text x="' + (x + ow / 2) + '" y="' + (by + barH / 2 + 3) + '" text-anchor="middle" font-size="9.5" font-weight="800" fill="#dc2626">' + s.otpad + '</text>';
        }
    });
    return '<svg viewBox="0 0 720 ' + H + '" width="100%" style="max-width:660px;background:#fff">' + o + '</svg>';
}

function pFormatiranje(D, F) {
    const c = COLp; // #7c3aed — familija rezanja
    const odrPill = function (odr) {
        const st = String(odr) === "stanje" || !odr;
        const col = st ? "#64748b" : (String(odr).indexOf("nalog") === 0 ? "#1d4ed8" : "#059669");
        const txt = st ? "na stanje" : String(odr).replace("nalog:", "nalog ");
        return '<span style="background:' + col + '14;color:' + col + ';border:1px solid ' + col + '33;border-radius:7px;padding:2px 8px;font-size:11px;font-weight:800">' + esc(txt) + '</span>';
    };

    const statRow =
        '<div class="stats">' +
        stat('Utrošak matične', fmtN(F.utrosak), 'm', COLm) +
        stat('Novih rolni', F.novih, 'kom', '#14b8a6') +
        stat('Iskorišćenje', fmtN(F.isk), '%', c) +
        stat('Otpad', fmtN(F.otpadM2), 'mm·m', '#ef4444') +
        '</div>';

    const info =
        '<div class="info">' +
        infoC('Matična rolna', F.matBr + ' · ' + F.matSir + ' mm') +
        infoC('Materijal', F.materijal) +
        infoC('Proizvođač', F.proizvodjac) +
        infoC('Poreklo', F.preventivno ? 'Preventivno' : ('iz naloga ' + (F.izvor_ponbr || '—'))) +
        infoC('LOT baza', F.lotBaza) +
        infoC('Mašina', '— (skenira radnik)') +
        infoC('Radnik', '— (skenira radnik)') +
        infoC('Utrošak', fmtN(F.utrosak) + ' m') +
        '</div>';

    const greske = F.greske && F.greske.length
        ? '<div class="ulaz" style="border-left-color:#dc2626;background:#fef2f2;color:#b91c1c">⚠ ' + F.greske.map(esc).join('<br>⚠ ') + '</div>'
        : '';

    const planSek =
        '<div class="sec">' + secH(1, c, 'Plan reza', 'po matičnoj') +
        '<div class="ulaz"><b>Rez:</b> matična ' + esc(F.matBr) + ' · ' + F.matSir + ' mm → ' + F.plan.length +
        ' segment' + (F.plan.length === 1 ? '' : 'a') + ' · utrošak <b>' + fmtN(F.utrosak) + ' m</b> · iskorišćenje <b>' + fmtN(F.isk) + '%</b> · otpad ' + fmtN(F.otpadM2) + ' mm·m</div>' +
        '<div class="framed" style="padding:12px 10px">' + fmtSvg(F) + '</div>' +
        '<div style="display:flex;gap:16px;font-size:10.5px;font-weight:700;color:#64748b;margin-top:8px">' +
        '<span><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:#dbeafe;border:1.5px solid #1d4ed8;vertical-align:-1px"></span> za nalog</span>' +
        '<span><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:#e5e7eb;border:1.5px solid #64748b;vertical-align:-1px"></span> na stanje</span>' +
        '<span><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:#fef2f2;border:1.5px solid #fca5a5;vertical-align:-1px"></span> otpad</span>' +
        '</div></div>';

    const roleSek =
        '<div class="sec">' + secH(2, c, 'Nove role (' + F.novih + ')', 'QR nalepnice se štampaju uz nalog') +
        '<table>' + th(['LOT', { t: 'Širina', n: 1 }, { t: 'Dužina (m)', n: 1 }, 'Kome ide', 'Napomena'], c) + '<tbody>' +
        F.role.map(function (r) {
            return '<tr><td style="font-family:ui-monospace,monospace;font-weight:800">' + esc(r.lot) + '</td>' +
                '<td class="n">' + r.sir + ' mm</td>' +
                '<td class="n">' + fmtN(r.duz) + '</td>' +
                '<td>' + odrPill(r.odr) + '</td>' +
                '<td>' + (r.nap ? esc(r.nap) : '—') + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';

    return pageWrap(
        D,
        hd(D, '✂️', 'NALOG ZA FORMATIRANJE', c, 'formatiranje') +
        '<div class="body">' + statRow + info + greske + planSek + roleSek +
        foot('Operater (mašina)', 'Datum / vreme', 'U magacin / na nalog') + '</div>',
        'Strana · formatiranje'
    );
}

function buildPagesHTML(nalog, vrsta, qr, lang = 'sr') {
    LANG = lang || 'sr';
    const D = buildD(nalog);
    D.qr = qr || "";
    D.rolne = citajRolne(nalog);
    if (vrsta === "formatiranje") return pFormatiranje(D, formatiranjeD(nalog));
    if (D.jeSpulna) {
        const S = spulnaD(nalog);
        // Samo 2 naloga: materijal + tehničke karakteristike (sa skicom iz templejta).
        if (vrsta === "spulna") return pSpulna(D, S);
        return pSpMat(D, S);
    }
    if (D.jeKesa) {
        const K = kesaD(nalog);
        if (vrsta === "kasiranje") return pKesaKas(D, K);
        if (vrsta === "kesa") return pKesa(D, K);
        return pKesaMat(D, K);
    }
    if (vrsta === "stampa") return pStampa(D) + pRollBig(D, "IZGLED NA ROLNI (ŠTAMPA)", D.proizvod + " · finalna rolna " + (D.rez.sirinaTrake || "—") + " mm", "Prilog · izgled na rolni");
    if (vrsta === "kasiranje") return pKas(D);
    if (vrsta === "perforacija_rezanje" || vrsta === "rezanje") return pRez(D) + pRollBig(D, "IZGLED NA FINALNOJ ROLNI", D.proizvod + " · rolna " + (D.rez.sirinaTrake || "—") + " mm · " + fmtN(D.rez.duzina) + " m", "Prilog · finalna rolna") + pPerfBig(D);
    return pMat(D);
}

/* ---------- CSS (v6) ---------- */
const V6_CSS = `
.nv6 .subsec{border:1px solid var(--line);border-radius:9px;overflow:hidden;margin-bottom:9px}
.nv6 .subh{background:#f6f8fc;padding:8px 12px;font-size:11px;font-weight:900;letter-spacing:.4px;border-bottom:1px solid var(--line)}
.nv6 .subsec table{border:0;border-radius:0}
.nv6{--ink:#0f172a;--mut:#6b7280;--line:#e8ebf1;font-family:Inter,Arial,sans-serif;color:var(--ink)}
.nv6 *{box-sizing:border-box}
.nv6 .a4{width:794px;min-height:1123px;background:#fff;margin:0 auto 26px;box-shadow:0 14px 40px rgba(0,0,0,.18);position:relative;display:flex;flex-direction:column;overflow:hidden}
.nv6 .pp{position:absolute;bottom:12px;right:20px;font-size:10px;color:#94a3b8;font-weight:700}
.nv6 .pp2{position:absolute;bottom:12px;left:20px;font-size:10px;color:#94a3b8;font-weight:700}
.nv6 .hd{position:relative;padding:20px 26px;color:#fff;overflow:hidden}
.nv6 .hd-top{display:flex;justify-content:space-between;align-items:flex-start}
.nv6 .brand{display:flex;align-items:center;gap:12px}
.nv6 .mono{width:44px;height:44px;border-radius:10px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-weight:950;font-size:18px}
.nv6 .co{font-size:10px;letter-spacing:2px;font-weight:800;opacity:.72}
.nv6 .nm{font-size:14px;font-weight:900}
.nv6 .docmeta{text-align:right;font-size:11px;line-height:1.7}
.nv6 .docmeta b{font-size:13px}
.nv6 .docmeta .k{opacity:.6;margin-right:5px}
.nv6 .title{margin-top:14px;display:flex;align-items:center;gap:11px}
.nv6 .title .ic{font-size:24px}
.nv6 .title .big{font-size:21px;font-weight:950}
.nv6 .badge{margin-left:auto;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:4px 12px;font-size:11px;font-weight:800}
.nv6 .body{padding:20px 26px;flex:1;display:flex;flex-direction:column}
.nv6 .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:16px}
.nv6 .stat{border:1px solid var(--line);border-radius:10px;padding:11px 13px;position:relative;overflow:hidden}
.nv6 .stat .bar{position:absolute;left:0;top:0;bottom:0;width:4px}
.nv6 .stat .l{font-size:9px;color:var(--mut);font-weight:800;text-transform:uppercase;letter-spacing:.4px}
.nv6 .stat .v{font-size:19px;font-weight:950;margin-top:3px}
.nv6 .stat .u{font-size:10px;color:var(--mut)}
.nv6 .info{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-radius:9px;overflow:hidden}
.nv6 .info .c{padding:8px 12px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.nv6 .info .c .l{font-size:9px;color:var(--mut);font-weight:800;text-transform:uppercase;letter-spacing:.4px}
.nv6 .info .c .v{font-size:12.5px;font-weight:800;margin-top:3px}
.nv6 .sec{margin-top:18px}
.nv6 .sec-h{display:flex;align-items:center;gap:10px;margin-bottom:9px}
.nv6 .sec-h .no{width:20px;height:20px;border-radius:5px;color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900}
.nv6 .sec-h .tt{font-size:12px;font-weight:900;letter-spacing:.5px;text-transform:uppercase}
.nv6 .sec-h .rule{flex:1;height:1px;background:var(--line)}
.nv6 .sec-h .src{font-size:9px;font-weight:800;color:#16a34a;background:#dcfce7;border-radius:5px;padding:2px 7px}
.nv6 table{width:100%;border-collapse:collapse;font-size:11px}
.nv6 th{text-align:left;padding:7px 9px;font-size:9px;text-transform:uppercase;letter-spacing:.3px;font-weight:800}
.nv6 td{padding:7px 9px;border-top:1px solid #eef1f5;font-weight:600}
.nv6 td.n,.nv6 th.n{text-align:right;font-variant-numeric:tabular-nums}
.nv6 tbody tr:nth-child(even){background:#fbfcfe}
.nv6 tr.tot td{border-top:2px solid #d6dbe3;font-weight:900;background:#f5f8fc}
.nv6 .dot-c{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle}
.nv6 .fig{border:1px solid var(--line);border-radius:10px;padding:14px;background:linear-gradient(180deg,#fcfdff,#f5f8fc);text-align:center}
.nv6 .fig .cap{font-size:10px;font-weight:800;color:var(--mut);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.nv6 .chips{display:flex;gap:9px;flex-wrap:wrap}
.nv6 .chip{display:flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:8px;padding:7px 11px;font-size:11.5px;font-weight:800}
.nv6 .chip .sw{width:16px;height:16px;border-radius:4px;border:1px solid rgba(0,0,0,.1)}
.nv6 .ulaz{font-size:11.5px;color:#0c4a6e;background:#eff8ff;border-left:3px solid #38bdf8;border-radius:0 7px 7px 0;padding:9px 12px;margin-bottom:14px}
.nv6 .foot{display:flex;gap:16px;margin-top:auto;padding-top:14px}
.nv6 .sign{flex:1;font-size:10px;color:var(--mut);text-align:center}
.nv6 .sign .line{border-top:1px solid #94a3b8;padding-top:5px;margin-top:26px;font-weight:700;color:#475569}
.nv6 .cap2{font-size:11px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:var(--mut);text-align:center;margin-bottom:4px}
.nv6 .bigttl{text-align:center;font-size:21px;font-weight:950;margin:4px 0 2px}
.nv6 .bigsub{text-align:center;font-size:12px;color:var(--mut);margin-bottom:12px}
.nv6 .framed{flex:1;border:1px solid var(--line);border-radius:12px;display:flex;align-items:center;justify-content:center;padding:16px;background:linear-gradient(180deg,#fcfdff,#f3f7fc)}
.nv6 .meta-strip{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
.nv6 .meta-strip .m{flex:1;min-width:90px;border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-size:11px;font-weight:800;text-align:center}
.nv6 .meta-strip .m b{display:block;font-size:8.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;font-weight:800}
.nv6 .badge{margin-left:auto;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:4px 12px;font-size:11px;font-weight:800}
.nv6 .hdqr{width:74px;height:74px;background:#fff;border-radius:8px;padding:5px;display:block}
.nv6 .qrbox{display:flex;flex-direction:column;align-items:center;margin-left:12px}
.nv6 .qrbox .cap{font-size:8px;font-weight:900;color:#fff;opacity:.9;letter-spacing:.3px;margin-top:3px;text-align:center;line-height:1.25}
@media print{
  .nv6 .a4{box-shadow:none;margin:0;width:210mm;min-height:297mm;page-break-after:always}
  body *{visibility:hidden!important}
  .nv6,.nv6 *{visibility:visible!important}
  .nv6{position:absolute;left:0;top:0}
}
`;

export default function NalogLayoutPRO({ nalog = {}, activeTab }) {
    const { lang } = useLang();
    let vrsta = String(activeTab || nalog.tip_naloga || nalog.vrsta_naloga || "").toLowerCase();
    if (vrsta.includes("mater")) vrsta = "materijal";
    else if (vrsta.includes("štamp") || vrsta.includes("stamp")) vrsta = "stampa";
    else if (vrsta.includes("kes")) vrsta = "kesa";
    else if (vrsta.includes("format")) vrsta = "formatiranje";
    else if (vrsta.includes("spul") || vrsta.includes("špul")) vrsta = "spulna";
    else if (vrsta.includes("kaš") || vrsta.includes("kas")) vrsta = "kasiranje";
    else if (vrsta.includes("perf") || vrsta.includes("rez")) vrsta = "perforacija_rezanje";
    else vrsta = "materijal";
    const broj = nalog.master_broj || nalog.broj_naloga || nalog.broj || (nalog.master_nalog && nalog.master_nalog.broj_naloga) || "";
    const [qr, setQr] = React.useState("");
    // QR na nalogu.
    //
    // RANIJE: ?nalog=MP-2026-0015 → otvarao samo PREGLED naloga (bez dugmadi).
    // SADA:   ?opid=<id operacije> → App.jsx otvara RadnikOperacija sa
    //         START / PAUZA / ZAVRŠI za BAŠ TU operaciju sa papira.
    //         (Radnik uzme nalog za štampu, skenira → dobije dugmad za štampu.)
    // Ako operacija nema id (npr. preview iz templejta), pada nazad na ?nalog=.
    const opid = nalog.id || nalog.op_id || nalog.operativni_nalog_id || "";
    React.useEffect(() => {
        let on = true;
        const origin = (typeof window !== "undefined" ? window.location.origin : "");
        const url = opid
            ? origin + "/?opid=" + encodeURIComponent(opid)
            : origin + "/?nalog=" + encodeURIComponent(broj || "");
        QRCode.toDataURL(url, { margin: 1, width: 320 }).then((d) => { if (on) setQr(d); }).catch(() => { });
        return () => { on = false; };
    }, [broj, opid]);
    // Bez memo-a se ceo nalog gradio ponovo na SVAKI render (a QR stiže async → +1 render).
    const htmlStr = React.useMemo(
        () => buildPagesHTML(nalog, vrsta, qr, lang),
        [nalog, vrsta, qr, lang]
    );

    // Crtež kese je REACT komponenta — isti KesaCrtez koji koristi i templejt.
    const kesaRaw = React.useMemo(() => {
        const D = buildD(nalog);
        return (D.jeKesa && vrsta === "kesa") ? getData(nalog).kesa : null;
    }, [nalog, vrsta]);
    const proizvod = React.useMemo(() => buildD(nalog).proizvod, [nalog]);

    return (
        <div className="nv6" style={{ background: "#94a0b0", padding: 24 }}>
            <style>{V6_CSS}</style>
            <div dangerouslySetInnerHTML={{ __html: htmlStr }} />
            {kesaRaw && (
                <div className="a4">
                    <div className="body" style={{ padding: "24px 28px" }}>
                        <div className="cap2">Prilog · uz nalog {broj}</div>
                        <div className="bigttl">TEHNIČKI CRTEŽ KESE — KOTIRANO</div>
                        <div className="bigsub">{proizvod} · sve mere u mm</div>
                        <div style={{ marginTop: 14 }}>
                            <CrtezKese config={kesaToConfig(toCrtezKesa(kesaRaw))} width="100%" />
                        </div>
                    </div>
                    <div className="pp2">{broj}</div>
                    <div className="pp">Strana 4 · crtež kese (prilog)</div>
                </div>
            )}
        </div>
    );
}
