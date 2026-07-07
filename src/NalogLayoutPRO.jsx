import React from "react";
import QRCode from "qrcode";
import { enrichNalogForPrint, normalizeLayers, safeJson } from "./utils/nalogDataLink";
import { pantoneHex } from "./data/pantone.js";
import { kesaToConfig, kesaSvgString } from "./CrtezKese.jsx";
import { KESA_OPCIJE, FOOD_TEXT, toCrtezKesa, KESA_GRUPE } from "./kesaOpcije.js";

/* ---------- helpers ---------- */
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

function getData(nalog) {
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
    const pdf = linked.pdf || od.pdf || t.pdf || {};
    return { linked, od, t, folija, pdf };
}

function buildLayers(nalog) {
    const { od, folija } = getData(nalog);
    const normalized = normalizeLayers(nalog, nalog.tip_proizvoda || nalog.tip) || [];
    const arr = (Array.isArray(od.materijali) && od.materijali.length ? od.materijali : (Array.isArray(folija.layers) && folija.layers.length ? folija.layers : normalized)) || [];
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
    const { od, t, folija } = getData(nalog);
    const LAY = buildLayers(nalog);
    const TOTu = LAY.reduce((s, l) => s + l.u, 0);
    const kolicina = num(nalog.metraza || nalog.kol || nalog.kolicina || t.porucenaKolicina || od.kolicina) || 0;
    const rz = folija.rezanje || {};
    const fr = folija.finalRoll || {};
    const st = folija.stampa || {};
    const sirinaMat = num(rz.sirinaMaterijala) || num(t.idealnaSirinaMaterijala) || num(LAY[0] && LAY[0].sirina) || num(nalog.sirina) || 840;
    const kgF = (kolicina / 1000) * (sirinaMat / 1000);
    // boje
    const boje = (Array.isArray(st.boje) ? st.boje : []).map((b, i) => ({
        sw: bojaHex(b), lab: (i + 1) + "·" + (b.oznaka || b.tip || "boja") + (b.klise ? "·" + b.klise : ""),
    }));
    // rezanje
    let lanes = Array.isArray(rz.sirineTraka) && rz.sirineTraka.length ? rz.sirineTraka.map(num).filter(Boolean) : [];
    if (!lanes.length && Array.isArray(rz.trake) && rz.trake.length) lanes = rz.trake.map((x) => num(x.sirina || x.width)).filter(Boolean);
    if (!lanes.length && num(rz.brojTraka) && num(rz.sirinaTrake)) lanes = Array.from({ length: num(rz.brojTraka) }, () => num(rz.sirinaTrake));
    const usedW = lanes.reduce((s, x) => s + x, 0);
    const otpad = num(rz.otpad) || Math.max(0, sirinaMat - usedW);
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
            precnik: num(fr.precnik) || num(rz.precnikRolne) || 400, duzina: num(fr.duzina) || num(rz.duzinaRolne) || kolicina,
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
function statRow(D) { return '<div class="stats">' + stat('Količina', fmtN(D.kolicina), 'm', COLm) + stat('Ukupna debljina', D.TOTu, 'µm', '#0ea5e9') + stat('Slojeva', D.LAY.length, D.LAY.length === 4 ? 'kvadripleks' : (D.LAY.length === 3 ? 'tripleks' : (D.LAY.length === 2 ? 'dupleks' : 'sloj')), '#14b8a6') + stat('Traka', D.rez.brojTraka || '—', '×' + (D.rez.sirinaTrake || '—') + 'mm', COLp) + '</div>'; }
function infoBlock(D) { return '<div class="info">' + infoC('Kupac', D.kupac) + infoC('Proizvod', D.proizvod) + infoC('Šifra', D.sifra) + infoC('Tip', D.tipLabel) + infoC('Dimenzije', D.dimenzije) + infoC('Kom', D.kom) + infoC('Idealna širina', D.sirinaMat + ' mm') + infoC('Rok', D.rok) + '</div>'; }
function secH(no, c, tt, src) { return '<div class="sec-h"><span class="no" style="background:' + c + '">' + no + '</span><span class="tt">' + esc(tt) + '</span><span class="rule"></span>' + (src ? '<span class="src">' + esc(src) + '</span>' : '') + '</div>'; }
function th(arr, c) { return '<thead><tr>' + arr.map(function (h) { const cls = h.n ? ' class="n"' : ''; return '<th' + cls + ' style="background:' + c + '12;color:' + c + '">' + esc(h.t || h) + '</th>'; }).join('') + '</tr></thead>'; }
function foot(a, b, cc) { return '<div class="foot"><div class="sign"><div class="line">' + esc(a) + '</div></div><div class="sign"><div class="line">' + esc(b) + '</div></div><div class="sign"><div class="line">' + esc(cc) + '</div></div></div>'; }
function hd(D, ic, naslov, c, no) { return '<div class="hd" style="background:linear-gradient(135deg,#111827,' + c + ' 150%)"><div class="hd-top"><div class="brand"><div class="mono">MP</div><div><div class="co">MAROPACK D.O.O.</div><div class="nm">PROIZVODNJA AMBALAŽE</div></div></div><div class="docmeta"><div><span class="k">Nalog</span><b>' + esc(D.broj) + '</b></div><div><span class="k">Datum</span>' + esc(D.datum) + '</div><div><span class="k">Rok</span>' + esc(D.rok) + '</div></div></div><div class="title"><span class="ic">' + ic + '</span><span class="big">' + esc(naslov) + '</span><span class="badge">' + no + '</span>' + (D.qr ? '<img class="hdqr" src="' + D.qr + '" alt="QR"/>' : '') + '</div></div>'; }
function pageWrap(D, inner, pp) { return '<div class="a4">' + inner + '<div class="pp2">' + esc(D.broj) + '</div><div class="pp">' + esc(pp) + '</div></div>'; }
function kg(D, l) { return (l.gm2 * D.kgF).toFixed(1); }
function matRows(D, extra) { return D.LAY.map(function (l, i) { return '<tr><td><span class="dot-c" style="background:' + l.c + '"></span>' + (i + 1) + '</td><td>' + esc(l.n) + '</td><td>' + esc(l.pv || '—') + '</td><td>' + esc(l.oz || '—') + '</td><td>' + esc(l.pr || '—') + '</td><td class="n">' + l.u + ' µm</td><td class="n">' + (l.gm2 ? l.gm2.toFixed(1) : '—') + '</td><td class="n">' + (l.koef ? l.koef.toFixed(3) : '—') + '</td><td class="n">' + D.sirinaMat + '</td><td class="n">' + fmtN(D.kolicina) + '</td><td class="n">' + kg(D, l) + '</td>' + (extra ? '<td>' + (l.st ? 'DA' : '—') + '</td>' : '') + '</tr>'; }).join(''); }
function totalKg(D) { return D.LAY.reduce(function (s, l) { return s + l.gm2 * D.kgF; }, 0).toFixed(1); }

function pMat(D) {
    const c = COLm; return pageWrap(D, hd(D, '📦', 'NALOG ZA MATERIJAL', c, 'materijal') + '<div class="body">' + statRow(D) + infoBlock(D) +
        '<div class="sec">' + secH(1, c, 'Struktura materijala po sloju', 'iz templejta / kalkulacije') + '<table>' + th(['Sloj', 'Vrsta', 'Pod-vrsta', 'Oznaka', 'Proizvođač', { t: 'Debljina (µm)', n: 1 }, { t: 'g/m²', n: 1 }, { t: 'Koef.', n: 1 }, { t: 'Širina', n: 1 }, { t: 'Potrebno', n: 1 }, { t: 'Kg', n: 1 }, 'Št.'], c) + '<tbody>' + matRows(D, true) + '<tr class="tot"><td colspan="10" style="text-align:right">UKUPNO (' + D.TOTu + ' µm)</td><td class="n">' + totalKg(D) + '</td><td></td></tr></tbody></table></div>' +
        '<div class="sec">' + secH(2, c, 'Rezervisane role iz magacina', 'po broju naloga') + '<table>' + th(['QR rolne', 'Vrsta', 'Oznaka', { t: 'Debljina (µm)', n: 1 }, 'LOT', 'Lokacija', { t: 'Alocirano', n: 1 }, { t: 'Kg', n: 1 }], c) + '<tbody>' + (Array.isArray(D.rolne) && D.rolne.length ? D.rolne : D.LAY.map(function (l) { return { qr: '—', n: l.n, oz: l.oz, u: l.u, lot: '—', lok: '—' }; })).map(function (r) { return '<tr><td>' + esc(r.qr || '—') + '</td><td>' + esc(r.n || '') + '</td><td>' + esc(r.oz || '') + '</td><td class="n">' + (r.u || '—') + ' µm</td><td>' + esc(r.lot || '—') + '</td><td>📍 ' + esc(r.lok || '—') + '</td><td class="n">' + fmtN(D.kolicina) + '</td><td class="n">—</td></tr>'; }).join('') + '</tbody></table></div>' +
        foot('Pripremio (magacioner)', 'Datum / vreme', 'Preuzeo (proizvodnja)') + '</div>', 'Strana · materijal');
}

function pStampa(D) {
    const c = COLs; const L0 = D.LAY.find(function (l) { return l.st; }) || D.LAY[0] || { n: '', pv: '', oz: '', pr: '', u: 0, gm2: 0, c: '#3b82f6' }; const chips = (D.boje.length ? D.boje : [{ sw: '#22d3ee', lab: '1·Cyan' }, { sw: '#ec4899', lab: '2·Magenta' }, { sw: '#facc15', lab: '3·Yellow' }, { sw: '#1f2937', lab: '4·Black' }]).map(function (b) { return '<div class="chip"><span class="sw" style="background:' + b.sw + '"></span>' + esc(b.lab) + '</div>'; }).join(''); return pageWrap(D, hd(D, '🖨️', 'NALOG ZA ŠTAMPU', c, 'štampa') + '<div class="body">' + statRow(D) + infoBlock(D) +
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
    return pageWrap(D, hd(D, '🔗', 'NALOG ZA KAŠIRANJE', c, 'kaširanje') + '<div class="body">' + statRow(D) +
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
        (lanes.length ? '<div class="sec">' + secH(3, c, 'Trake', '') + '<table>' + th(['Traka', { t: 'Širina', n: 1 }, { t: 'Metara', n: 1 }, 'Perforacija'], c) + '<tbody>' + lanes.map(function (lw, i) { return '<tr><td><span class="dot-c" style="background:#c7d2fe"></span>' + (i + 1) + '</td><td class="n">' + lw + ' mm</td><td class="n">' + fmtN(D.rez.duzina) + '</td><td>' + esc(D.perf.tip) + ' · ' + D.perf.N + ' kol.</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
        '<div class="ulaz" style="margin-top:16px">🖼 <b>Izgled na finalnoj rolni</b> i <b>perforacija (kotirano)</b> su na posebnim stranama.</div>' +
        foot('Operater rezanja', 'Kontrola kvaliteta', 'U magacin gotovih') + '</div>', 'Strana · perforacija/rezanje');
}

function pPerfBig(D) { return pageWrap(D, '<div class="body" style="padding:24px 28px"><div class="cap2">Prilog · uz nalog ' + esc(D.broj) + '</div><div class="bigttl">PERFORACIJA — KOTIRANO</div><div class="bigsub">' + esc(D.perf.tip) + ' · ' + D.perf.N + ' kolona · sve mere u mm</div><div class="framed">' + perf(D, 500, 860) + '</div><div class="meta-strip"><div class="m"><b>Tip</b>' + esc(D.perf.tip) + '</div><div class="m"><b>Kolona</b>' + D.perf.N + '</div><div class="m"><b>Od vrha</b>' + D.perf.oV + ' mm</div><div class="m"><b>Od dna</b>' + D.perf.oD + ' mm</div><div class="m"><b>Od ivica</b>' + D.perf.oL + ' mm</div></div></div>', 'Strana · perforacija (prilog)'); }

function buildPagesHTML(nalog, vrsta, qr) {
    const D = buildD(nalog);
    D.qr = qr || "";
    D.kesaObj = nalog.kesa || nalog;
    D.kesaCfg = kesaToConfig(toCrtezKesa(D.kesaObj));
    D.rolne = (nalog.rezervisane_rolne || nalog.rezervisaneRolne || nalog.rolne || []).slice(0, 6).map(function (r) { return { qr: r.qr || r.qr_kod || r.id, n: r.vrsta, oz: r.oznaka || r.oznaka_materijala, u: r.debljina || r.deb, lot: r.lot || r.LOT, lok: r.lokacija || r.location }; });
    if (vrsta === "stampa") return pStampa(D) + pRollBig(D, "IZGLED NA ROLNI (ŠTAMPA)", D.proizvod + " · finalna rolna " + (D.rez.sirinaTrake || "—") + " mm", "Prilog · izgled na rolni");
    if (vrsta === "kasiranje") return pKas(D);
    if (vrsta === "perforacija_rezanje" || vrsta === "rezanje") return pRez(D) + pRollBig(D, "IZGLED NA FINALNOJ ROLNI", D.proizvod + " · rolna " + (D.rez.sirinaTrake || "—") + " mm · " + fmtN(D.rez.duzina) + " m", "Prilog · finalna rolna") + pPerfBig(D);
    if (vrsta === "kesa") return pKesa(D);
    return pMat(D);
}

function pKesa(D) {
    const c = '#b91c1c';
    const cfg = D.kesaCfg || {};
    const k = D.kesaObj || {};
    const TIPN = { flach: "Flachbeutel", klappen: "Klappenbeutel", bodenfalten: "Bodenfaltenbeutel", bodennaht: "Bodennahtbeutel", header: "Headerbeutel", banderole: "Banderole", rolle: "Beutel auf Rolle", brief: "Briefhülle", doppel: "Doppeltasche", easy: "Easy-Opening Beutel", flaschen: "Flaschenbeutel", heiss: "Heißgenadelte Beutel", kreuz: "Kreuzbodenbeutel", mehr: "Mehrkammerbeutel", zweifarbig: "Zweifarbige Beutel", zweikammer: "Zweikammerbeutel" };
    const DNO = { ravno: "Ravno", faltna: "Faltna dno", naht: "Var na dnu", kreuz: "Ukršteno dno" };
    const tipN = TIPN[cfg.tip] || k.tipKese || "Kesa";
    const svg = kesaSvgString(cfg, { kote: true, bottomViews: true, info: false });
    const opt = k.options || {}, sel = k.optSel || {}, pos = k.positions || {}, txt = k.optText || {};
    const valOf = function (o) {
        if (opt[o.k]) {
            let v = o.tip === "danet" ? "DA" : (o.tip === "broj" ? ((sel[o.k] || "") + (o.jed ? " " + o.jed : "")).trim() : (sel[o.k] || "DA"));
            const p = pos[o.k] || {}, t = txt[o.k] || {}, extra = [];
            if (p.odstojanje) extra.push(esc(p.odstojanje));
            if (p.odVrha) extra.push(esc(p.odVrha) + " mm od vrha");
            if (p.odDna) extra.push(esc(p.odDna) + " mm od dna");
            if (p.levo) extra.push(esc(p.levo) + " mm levo");
            if (p.sirina && p.visina) extra.push(esc(p.sirina) + "×" + esc(p.visina) + " mm");
            Object.keys(t).forEach(function (kk) { if (t[kk]) extra.push(esc(t[kk])); });
            return esc(v) + (extra.length ? " · " + extra.join(" · ") : "");
        }
        return o.tip === "danet" ? "NE" : (o.k === "stampa" ? "Bez štampe" : "0");
    };
    const tpRow = function (label, value, on) {
        return '<div style="display:flex;justify-content:space-between;gap:10px;font-size:10.5px;padding:3px 0;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">' + esc(label) + '</span><span style="font-weight:700;text-align:right;max-width:60%;color:' + (on ? '#0f172a' : '#94a3b8') + '">' + value + '</span></div>';
    };
    const foodOn = !!opt["hrana"];
    const optByKey = {};
    KESA_OPCIJE.forEach(function (o) { optByKey[o.k] = o; });
    const grpCard = function (g) {
        let rows = '';
        if (g.id === 'konstrukcija') rows += tpRow('Širina', esc(cfg.sirina) + ' mm', true) + tpRow('Dužina', esc(cfg.duzina) + ' mm', true);
        g.keys.forEach(function (key) {
            const o = optByKey[key];
            if (!o || o.food) return;
            rows += tpRow(o.l, valOf(o), !!opt[o.k]);
        });
        return '<div style="border:1px solid #e8ebf1;border-radius:10px;overflow:hidden">' +
            '<div style="background:' + g.c + ';color:#fff;font-weight:800;font-size:10.5px;letter-spacing:.4px;padding:5px 10px">' + esc(g.l) + '</div>' +
            '<div style="padding:3px 10px">' + rows + '</div></div>';
    };
    const tpkHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start">' + KESA_GRUPE.map(grpCard).join('') + '</div>' +
        (foodOn ? '<div style="margin-top:8px;font-size:10.5px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 8px">📋 ' + esc(FOOD_TEXT) + '</div>' : '');
    const izabrane = KESA_OPCIJE.filter(function (o) { return opt[o.k] && !o.food; }).map(function (o) { return esc(o.l) + (sel[o.k] ? ' ' + esc(sel[o.k]) : ''); });
    const legend = '<div style="margin-top:10px;text-align:center;font-size:11px;color:#475569;border:1px dashed #cbd5e1;border-radius:8px;padding:7px">' +
        '<b>' + esc(tipN) + ' ' + esc(cfg.sirina) + ' × ' + esc(cfg.duzina) + (cfg.vrh === 'klapna' ? ' + ' + esc(cfg.klMm) : '') + ' mm</b>' +
        (izabrane.length ? ' · ' + izabrane.slice(0, 8).join(' · ') : '') + ' — kote u mm</div>';
    const materijal = k.materijal || (k.layers && k.layers[0] && (k.layers[0].oznaka || k.layers[0].vrsta)) || '—';
    const idealSir = k.idealnaSirinaMaterijala || k.ideal || (D.kesaObj && D.kesaObj.idealnaSirinaMaterijala) || '—';
    const stats = '<div class="stats">' + stat('Dimenzije', cfg.sirina + '×' + cfg.duzina, 'mm', c) + stat('Količina', fmtN(D.kolicina), 'kom', COLm) + stat('Tip kese', tipN, '', '#7c3aed') + stat('Dno', DNO[cfg.dno] || 'Ravno', (cfg.dno === 'faltna' && cfg.extraMm ? '(' + cfg.extraMm + 'mm)' : ''), '#0ea5e9') + '</div>';
    const info = '<div class="info">' +
        infoC('Broj naloga', D.broj) + infoC('Br. porudžbine', k.porudzbina || D.porudzbina) + infoC('Datum porudžbine', k.datum_por || D.datum) + infoC('Datum isporuke', D.rok) +
        infoC('Kupac', D.kupac) + infoC('Proizvod', D.proizvod) + infoC('Šifra', D.sifra) + infoC('Materijal', materijal) +
        infoC('Idealna širina', idealSir !== '—' ? idealSir + ' mm' : '—') + infoC('Debljina', k.debljina ? k.debljina + ' µ' : '—') + infoC('Tip kese', tipN) + infoC('Klapna', cfg.vrh === 'klapna' ? (cfg.klMm + ' mm') : '—') +
        '</div>';
    const page1 = pageWrap(D, hd(D, '🛍️', 'NALOG ZA KESU', c, 'kesa') + '<div class="body">' + stats + info +
        '<div class="sec">' + secH(1, c, 'Tehnički podaci za kesu', '') + '<div style="padding:4px 2px">' + tpkHtml + '</div></div>' +
        foot('Nalog izradio', 'Datum naloga', 'Nalog odobrio') + '</div>', 'Strana 1 · kesa — podaci');
    const page2 = pageWrap(D, hd(D, '📐', 'TEHNIČKI CRTEŽ KESE', c, 'kesa') + '<div class="body">' +
        '<div class="sec">' + secH(1, c, 'Tehnički crtež sa kotama', tipN) + '<div class="framed">' + svg + '</div>' + legend + '</div>' +
        foot('Nalog izradio', 'Datum naloga', 'Nalog odobrio') + '</div>', 'Strana 2 · kesa — crtež');
    return page1 + page2;
}

/* ---------- CSS (v6) ---------- */
const V6_CSS = `
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
.nv6 .hdqr{width:54px;height:54px;background:#fff;border-radius:8px;padding:4px;margin-left:10px}
@media print{
  .nv6 .a4{box-shadow:none;margin:0;width:210mm;min-height:297mm;page-break-after:always}
  body *{visibility:hidden!important}
  .nv6,.nv6 *{visibility:visible!important}
  .nv6{position:absolute;left:0;top:0}
}
`;

export default function NalogLayoutPRO({ nalog = {}, activeTab }) {
    let vrsta = String(activeTab || nalog.tip_naloga || nalog.vrsta_naloga || "").toLowerCase();
    if (vrsta.includes("mater")) vrsta = "materijal";
    else if (vrsta.includes("štamp") || vrsta.includes("stamp")) vrsta = "stampa";
    else if (vrsta.includes("kaš") || vrsta.includes("kas")) vrsta = "kasiranje";
    else if (vrsta.includes("perf") || vrsta.includes("rez")) vrsta = "perforacija_rezanje";
    else if (vrsta.includes("kesa") || vrsta.includes("beutel")) vrsta = "kesa";
    else vrsta = "materijal";
    const broj = nalog.master_broj || nalog.broj_naloga || nalog.broj || (nalog.master_nalog && nalog.master_nalog.broj_naloga) || "";
    const [qr, setQr] = React.useState("");
    React.useEffect(() => {
        let on = true;
        const url = (typeof window !== "undefined" ? window.location.origin : "") + "/?nalog=" + encodeURIComponent(broj || "");
        QRCode.toDataURL(url, { margin: 0, width: 160 }).then((d) => { if (on) setQr(d); }).catch(() => { });
        return () => { on = false; };
    }, [broj]);
    const htmlStr = buildPagesHTML(nalog, vrsta, qr);
    return (
        <div className="nv6" style={{ background: "#94a0b0", padding: 24 }}>
            <style>{V6_CSS}</style>
            <div dangerouslySetInnerHTML={{ __html: htmlStr }} />
        </div>
    );
}
