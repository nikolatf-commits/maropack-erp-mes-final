import React, { useState } from "react";

// Geometrija trake (web) — ista kao u potvrđenom prototipu
const WEBX0 = 145, WEBX1 = 540, WEBY0 = 258, WEBY1 = 718;

function svgWrap(inner, maxW) {
    return `<svg viewBox="0 0 600 760" width="100%" style="max-width:${maxW || 430}px;display:block;margin:0 auto;background:#fff">` + inner + `</svg>`;
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

function dimH(x1, x2, y, txt) {
    if (Math.abs(x2 - x1) < 2) return '';
    const mx = (x1 + x2) / 2;
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#1d4ed8" stroke-width="1"/>` +
        `<line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}" stroke="#1d4ed8" stroke-width="1"/>` +
        `<line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}" stroke="#1d4ed8" stroke-width="1"/>` +
        `<rect x="${mx - 19}" y="${y - 15}" width="38" height="13" fill="#fff"/>` +
        `<text x="${mx}" y="${y - 5}" text-anchor="middle" font-size="10" font-weight="800" fill="#1d4ed8">${txt}</text>`;
}
function dimV(x, y1, y2, txt) {
    if (Math.abs(y2 - y1) < 2) return '';
    const my = (y1 + y2) / 2;
    return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#1d4ed8" stroke-width="1"/>` +
        `<line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}" stroke="#1d4ed8" stroke-width="1"/>` +
        `<line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}" stroke="#1d4ed8" stroke-width="1"/>` +
        `<rect x="${x + 3}" y="${my - 7}" width="44" height="13" fill="#fff"/>` +
        `<text x="${x + 6}" y="${my + 3}" font-size="10" font-weight="800" fill="#1d4ed8">${txt}</text>`;
}

const num = (v, d) => { const n = Number(String(v ?? '').toString().replace(',', '.')); return isNaN(n) ? (d ?? 0) : n; };

// Prikaz finalne rolne sa dizajnom (slika/URL). PDF zahteva pdf.js (kasnije).
export function RolnaDizajn({ dizajnUrl, rotacija = 0, zrcalo = 1, w, h, sirinaPct = 100, visinaPct = 100, maxWidth = 430 }) {
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
    return <div dangerouslySetInnerHTML={{ __html: svgWrap(rollParts() + o, maxWidth) }} />;
}

// Kotirani prikaz perforacije (kolone) na istoj rolni
export function PerforacijaCrtez({ tip = "linija", kolone = 4, odVrha = 50, odDna = 50, odLeve = 20, odDesne = 20, sirina = 270, visina = 600, razmakRupa = 5, maxWidth = 430 }) {
    const N = Math.max(1, Math.round(num(kolone, 1)) || 1);
    const odV = num(odVrha), odD = num(odDna), odL = num(odLeve), odR = num(odDesne);
    const Wmm = num(sirina, 270) || 270, Hmm = num(visina, 600) || 600, gap = num(razmakRupa, 5) || 5;
    const sx = (WEBX1 - WEBX0) / Wmm, sy = (WEBY1 - WEBY0) / Hmm;
    const xFirst = WEBX0 + odL * sx, xLast = WEBX1 - odR * sx;
    const yTop = WEBY0 + odV * sy, yBot = WEBY1 - odD * sy;
    const stepX = N > 1 ? (xLast - xFirst) / (N - 1) : 0;
    let o = ``;
    for (let i = 0; i < N; i++) {
        const x = xFirst + stepX * i;
        if (tip === 'rupe') { for (let y = yTop; y <= yBot; y += gap * sy) o += `<circle cx="${x}" cy="${y}" r="1.8" fill="#8b5cf6"/>`; }
        else { o += `<line x1="${x}" y1="${yTop}" x2="${x}" y2="${yBot}" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="7 4"/>`; }
        o += `<text x="${x}" y="${yTop - 5}" text-anchor="middle" font-size="9" font-weight="800" fill="#8b5cf6">K${i + 1}</text>`;
    }
    const hy = WEBY0 + 18;
    o += dimH(WEBX0, xFirst, hy, odL + ' mm');
    if (N > 1) o += dimH(xFirst, xFirst + stepX, hy, Math.round(stepX / sx) + ' mm');
    o += dimH(xLast, WEBX1, hy, odR + ' mm');
    const vx = WEBX0 + 18;
    o += dimV(vx, WEBY0, yTop, odV + ' mm');
    o += dimV(vx, yBot, WEBY1, odD + ' mm');
    if (tip === 'rupe' && (yBot - yTop) > gap * sy) o += dimV(xFirst + 8, yTop, yTop + gap * sy, gap + ' mm');
    return <div dangerouslySetInnerHTML={{ __html: svgWrap(rollParts() + o, maxWidth) }} />;
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
export function RolnaDizajnEditor({ value = {}, onChange }) {
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
            <RolnaDizajn dizajnUrl={v.url} w={v.w} h={v.h} rotacija={v.rotacija || 0} zrcalo={v.zrcalo ?? 1} sirinaPct={v.sirinaPct ?? 100} visinaPct={v.visinaPct ?? 100} maxWidth={320} />
        </div>
    );
}

// Editor za templejt: parametri perforacije + živi kotirani crtež
export function PerforacijaEditor({ value = {}, onChange, dizajn }) {
    const v = { tip: "linija", kolone: 4, odVrha: 50, odDna: 50, odLeve: 20, odDesne: 20, sirina: 270, visina: 600, razmakRupa: 5, ...(value || {}) };
    const set = (k, val) => onChange && onChange({ ...v, [k]: val });
    const F = (label, key, type) => (
        <div><label style={_lab}>{label}</label>
            {type === "select"
                ? <select style={_inp} value={v.tip} onChange={(e) => set("tip", e.target.value)}><option value="linija">Mikroperforacija (linija)</option><option value="rupe">Pojedinačne rupe</option></select>
                : <input style={_inp} type="number" value={v[key]} onChange={(e) => set(key, e.target.value)} />}
        </div>
    );
    return (
        <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 12 }}>
                {F("Tip", "tip", "select")}
                {F("Broj kolona", "kolone")}
                {F("Od vrha (mm)", "odVrha")}
                {F("Od dna (mm)", "odDna")}
                {F("Od leve ivice (mm)", "odLeve")}
                {F("Od desne ivice (mm)", "odDesne")}
                {F("Širina trake (mm)", "sirina")}
                {F("Visina prikaza (mm)", "visina")}
                {F("Razmak rupa (mm)", "razmakRupa")}
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 280px", minWidth: 260 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#8b5cf6", marginBottom: 4 }}>PERFORACIJA (kotirano)</div>
                    <PerforacijaCrtez {...v} maxWidth={320} />
                </div>
                <div style={{ flex: "1 1 280px", minWidth: 260 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: "#1d4ed8" }}>DIZAJN NA FINALNOJ ROLNI</span>
                        <button type="button" style={{ ..._ebtn, padding: "3px 8px" }} onClick={() => set("dizajnRotacija", (((v.dizajnRotacija ?? (dizajn && dizajn.rotacija) ?? 0) + 270) % 360))}>↺</button>
                        <button type="button" style={{ ..._ebtn, padding: "3px 8px" }} onClick={() => set("dizajnRotacija", (((v.dizajnRotacija ?? (dizajn && dizajn.rotacija) ?? 0) + 90) % 360))}>↻</button>
                    </div>
                    <RolnaDizajn dizajnUrl={dizajn && dizajn.url} w={dizajn && dizajn.w} h={dizajn && dizajn.h}
                        rotacija={v.dizajnRotacija ?? (dizajn && dizajn.rotacija) ?? 0} zrcalo={(dizajn && dizajn.zrcalo) ?? 1}
                        sirinaPct={(dizajn && dizajn.sirinaPct) ?? 100} visinaPct={(dizajn && dizajn.visinaPct) ?? 100} maxWidth={320} />
                    {!(dizajn && dizajn.url) && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Dizajn se učitava u sekciji Štampa.</div>}
                </div>
            </div>
        </div>
    );
}
