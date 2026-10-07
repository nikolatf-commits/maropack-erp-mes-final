import React, { useState } from "react";

// Geometrija trake (web) — ista kao u potvrđenom prototipu
const WEBX0 = 145, WEBX1 = 540, WEBY0 = 258, WEBY1 = 718;

function svgWrap(inner, maxW) {
    return `<svg viewBox="0 0 600 760" width="100%" style="max-width:${maxW || 560}px;display:block;margin:0 auto;background:#fff">` + inner + `</svg>`;
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
function dimH(x1, x2, y, txt) {
    if (Math.abs(x2 - x1) < 2) return '';
    const mx = (x1 + x2) / 2, w = Math.max(30, String(txt).length * 7 + 12);
    const seg = (a, b, cc, dd) => `<line x1="${a}" y1="${b}" x2="${cc}" y2="${dd}" stroke="${HALO}" stroke-width="3.6" stroke-linecap="round" opacity="0.92"/><line x1="${a}" y1="${b}" x2="${cc}" y2="${dd}" stroke="${DIMC}" stroke-width="1.5"/>`;
    return seg(x1, y, x2, y) + seg(x1, y - 5, x1, y + 5) + seg(x2, y - 5, x2, y + 5) +
        `<rect x="${mx - w / 2}" y="${y - 18}" width="${w}" height="15" rx="3.5" fill="#fff" stroke="${DIMC}" stroke-width="0.9" opacity="0.98"/>` +
        `<text x="${mx}" y="${y - 7}" text-anchor="middle" font-size="10.5" font-weight="900" fill="${DIMC}">${txt}</text>`;
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

// Prikaz finalne rolne sa dizajnom (slika/URL). PDF zahteva pdf.js (kasnije).
export function RolnaDizajn({ dizajnUrl, rotacija = 0, zrcalo = 1, w, h, sirinaPct = 100, visinaPct = 100, perfXmm = [], perfLinije = null, perfSirinaMm = 0, perfTip = "linija", perfOdVrha = 0, perfOdDna = 0, perfRazmak = 5, perfVisina = 0, maxWidth = 430 }) {
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
        linijeDraw.forEach((L, i) => {
            const x = WEBX0 + num(L.mm) * sxp;
            if (x < WEBX0 || x > WEBX1) return;
            const c = BOJE[i % BOJE.length];
            const gapPx = Hmm > 0 ? Math.max(4, (num(L.razmak) || num(perfRazmak, 5)) * syp) : 10;
            if (rupe) {
                for (let y = yTop; y <= yBot; y += gapPx) o += `<circle cx="${x}" cy="${y}" r="2" fill="${c}"/>`;
                o += `<circle cx="${x}" cy="${yTop}" r="3" fill="${c}"/>`;
            } else {
                o += `<line x1="${x}" y1="${yTop}" x2="${x}" y2="${yBot}" stroke="${c}" stroke-width="2.5" stroke-dasharray="8 5" opacity="0.95"/>`;
            }
        });
    }
    return <div dangerouslySetInnerHTML={{ __html: svgWrap(rollParts() + o, maxWidth) }} />;
}

// Kotirani prikaz perforacije — iz LISTE LINIJA (svaka: pozicija + strana + opcioni razmak).
// linije = [{ mm (od leve ivice), poz (uneta vrednost), strana ("leva"|"desna"), razmak }]
export function PerforacijaCrtez({ tip = "linija", odVrha = 50, odDna = 50, sirina = 270, visina = 600, razmakRupa = 5, linije = [], maxWidth = 430 }) {
    const odV = num(odVrha), odD = num(odDna);
    const Wmm = num(sirina, 270) || 270, Hmm = num(visina, 600) || 600, gGlob = num(razmakRupa, 5) || 5;
    const sx = (WEBX1 - WEBX0) / Wmm, sy = (WEBY1 - WEBY0) / Hmm;
    const yTop = WEBY0 + odV * sy, yBot = WEBY1 - odD * sy;
    const BOJE = ["#8b5cf6", "#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed"];
    const lin = (Array.isArray(linije) ? linije : []).filter((L) => L && !isNaN(parseFloat(L.mm)));
    let o = ``, brL = 0, brD = 0;
    lin.forEach((L, i) => {
        const x = WEBX0 + num(L.mm) * sx;
        if (x < WEBX0 || x > WEBX1) return;
        const c = BOJE[i % BOJE.length];
        const gap = num(L.razmak) || gGlob;
        const gore = L.strana !== "desna";
        if (tip === 'rupe') { for (let y = yTop; y <= yBot; y += gap * sy) o += `<circle cx="${x}" cy="${y}" r="2" fill="${c}"/>`; }
        else { o += `<line x1="${x}" y1="${yTop}" x2="${x}" y2="${yBot}" stroke="${c}" stroke-width="2.5" stroke-dasharray="8 5"/>`; }
        o += `<circle cx="${x}" cy="${gore ? yTop : yBot}" r="3" fill="${c}"/>`;
        const poz = (L.poz != null && L.poz !== "") ? L.poz : Math.round(gore ? num(L.mm) : (Wmm - num(L.mm)));
        const tag = (gore ? 'L' + (++brL) : 'D' + (++brD)) + ' · ' + poz + (num(L.razmak) ? (' / ' + num(L.razmak) + 'mm') : '');
        o += `<text x="${x}" y="${(gore ? yTop - 6 : yBot + 15)}" text-anchor="middle" font-size="10" font-weight="900" fill="${c}">${tag}</text>`;
        if (gore) o += dimH(WEBX0, x, WEBY0 + 16 + i * 15, poz + ' mm');
        else o += dimH(x, WEBX1, WEBY1 - 16 - i * 15, poz + ' mm');
    });
    o += dimV(WEBX0 + 18, WEBY0, yTop, odV + ' mm');
    o += dimV(WEBX0 + 18, yBot, WEBY1, odD + ' mm');
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
    const v = { tip: "linija", odVrha: 50, odDna: 50, sirina: 270, visina: 600, razmakRupa: 5, linije: null, pozLeve: "", pozDesne: "", ...(value || {}) };
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
                ? <select style={_inp} value={v.tip} onChange={(e) => set("tip", e.target.value)}><option value="linija">Mikroperforacija (linija)</option><option value="rupe">Pojedinačne rupe</option></select>
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
                {F("Od vrha (mm)", "odVrha")}
                {F("Od dna (mm)", "odDna")}
                {F("Širina trake (mm)", "sirina")}
                {F("Visina prikaza (mm)", "visina")}
                {F("Razmak rupa — podrazumevano (mm)", "razmakRupa")}
            </div>

            {/* LINIJE PERFORACIJE — svaka linija: pozicija + strana + (opcioni) razmak */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, marginBottom: 12, background: "#faf5ff" }}>
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
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 280px", minWidth: 260 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#8b5cf6", marginBottom: 4 }}>PERFORACIJA (kotirano){imaPoz ? " — " + perfLinije.length + " linija" : " — unesi bar jednu liniju"}</div>
                    <PerforacijaCrtez tip={v.tip} odVrha={v.odVrha} odDna={v.odDna} sirina={v.sirina} visina={v.visina} razmakRupa={v.razmakRupa} linije={perfLinije} maxWidth={320} />
                </div>
                {dizajnBlok}
            </div>
        </div>
    );
}
