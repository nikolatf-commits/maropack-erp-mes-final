// ─────────────────────────────────────────────────────────────────────────────
//  MAROPACK — GanttPlanPRO  [v1]
//  Kalendar mašina: pretvara plan (red čekanja po mašini) u DATUME.
//
//  Režim rada: 2 smene = 960 min/dan (06–22h), pon–pet, vikend se preskače.
//  Vreme naloga: ručno trajanje → setup + metri ÷ brzina → fallback.
//  ZAVISNOSTI: operacija ne počinje pre završetka prethodne operacije ISTOG
//  naloga (ma na kojoj mašini bila) — a nalozi bez čekanja "uskaču u rupu".
//  Datumi se NIGDE ne čuvaju: uvek se izračunaju iz plana → svako prevlačenje,
//  promena redosleda ili brzine mašine odmah pomera sve trake (live).
//
//  Renderuje ga MachineSchedulerPRO kao tab "Kalendar" (isti podaci i drag/drop).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import { procenaMinNaMasini, REDOSLED_OPERACIJA, jeGotov, canonRef, OP_LABELE } from "../utils/nalogMetrika.js";

// ── radni kalendar ───────────────────────────────────────────────────────────
const DAN_MIN = 960;            // 2 smene × 480
const DAN_OD = 6 * 60;          // radni dan 06:00–22:00
const jeRadni = (d) => { const x = d.getDay(); return x >= 1 && x <= 5; };

function pocetakRadnog(d) { const x = new Date(d); x.setHours(6, 0, 0, 0); return x; }
function sledeciRadni(d) { const x = new Date(d); do { x.setDate(x.getDate() + 1); } while (!jeRadni(x)); return pocetakRadnog(x); }

// "sada" ugurano u radno vreme (pre 06 → 06 danas; posle 22 ili vikend → sledeći radni 06)
function radnoSada() {
    const n = new Date();
    if (!jeRadni(n)) return sledeciRadni(n);
    const min = n.getHours() * 60 + n.getMinutes();
    if (min < DAN_OD) return pocetakRadnog(n);
    if (min >= DAN_OD + DAN_MIN) return sledeciRadni(n);
    return n;
}

// radni-minuti (wm) od sidra → Date
function wmToDate(sidro, wm) {
    let d = new Date(sidro);
    let ost = Math.max(0, Math.round(wm));
    for (; ;) {
        if (!jeRadni(d)) { d = sledeciRadni(d); continue; }
        const min = d.getHours() * 60 + d.getMinutes();
        const doKraja = DAN_OD + DAN_MIN - min;
        if (ost < doKraja) return new Date(d.getTime() + ost * 60000);
        ost -= doKraja; d = sledeciRadni(d);
    }
}
// Date → radni-minuti od sidra (datum pre sidra → 0)
function dateToWm(sidro, dat) {
    if (!(dat instanceof Date) || Number.isNaN(dat.getTime()) || dat <= sidro) return 0;
    let d = new Date(sidro), wm = 0;
    for (let i = 0; i < 400; i++) {
        if (!jeRadni(d)) { d = sledeciRadni(d); continue; }
        const kraj = new Date(d); kraj.setHours(22, 0, 0, 0);
        if (dat <= kraj) { return wm + Math.max(0, (dat - d) / 60000); }
        wm += (kraj - d) / 60000; d = sledeciRadni(d);
    }
    return wm;
}

const OP2KEY = { rezanje: "perforacija_rezanje", kese: "kesa", spulne: "spulna" };
const KEY2SUF = { materijal: "MATERIJAL", stampa: "STAMPA", lakiranje: "LAKIRANJE", kasiranje: "KASIRANJE", perforacija_rezanje: "PERFORACIJA_REZANJE", formatiranje: "FORMATIRANJE", kesa: "KESA", spulna: "SPULNA" };
const OP_BOJA = { stampa: "#2563eb", lakiranje: "#7c3aed", kasiranje: "#0891b2", rezanje: "#dc2626", formatiranje: "#ea580c", kese: "#16a34a", spulne: "#9333ea", ostalo: "#64748b" };
const POVRATAK_IZ_STAMPARIJE_DANA = 2; // pretpostavka kad nema ručnog datuma

function minutaOd(iso) { const d = new Date(iso); return Number.isNaN(d.getTime()) ? 0 : Math.max(0, Math.round((Date.now() - d.getTime()) / 60000)); }

// ── ENGINE: čista funkcija plan → raspored sa datumima ───────────────────────
export function izracunajRaspored({ machines, plan, orderMap, opStatusi, sidro }) {
    const poId = {}; machines.forEach((m) => { poId[m.id] = m; });
    const trajanje = (m, o) => {
        if (!o) return 0;
        const rucno = Number(o.trajanjeRucno || 0);
        if (rucno > 0) return rucno;
        return procenaMinNaMasini(m, o.metri) || Number(o.durationMin || 60);
    };
    // ključ prethodne NEZAVRŠENE operacije (kroz REDOSLED), ili null
    const prethodna = (o) => {
        const moj = OP2KEY[o.opTip] || o.opTip;
        const i = REDOSLED_OPERACIJA.indexOf(moj);
        if (i <= 0) return null;
        const mape = opStatusi[canonRef(o.id)] || {};
        for (let j = i - 1; j >= 0; j--) {
            const k = REDOSLED_OPERACIJA[j];
            if (mape[k] !== undefined && !jeGotov(mape[k])) return k;
        }
        return null;
    };

    let kraj = {};                       // orderId → wm kraja (procena iz prošlog prolaza)
    let rezultat = [];
    for (let prolaz = 0; prolaz < 12; prolaz++) {
        const noviKraj = {}; rezultat = [];
        machines.forEach((m) => {
            const red = ((plan[m.id] || []).map((id) => orderMap[id]).filter((o) => o && o.status !== "zavrseno"));
            let t = 0;                   // wm slobodna mašina
            const ostalo = red.slice();
            while (ostalo.length) {
                // spremnost svakog kandidata (zavisnost od prethodne operacije)
                const info = ostalo.map((o) => {
                    let ready = 0, ceka = null, vanPlana = false, pretpostavka = false;
                    const p = prethodna(o);
                    if (p) {
                        ceka = p;
                        const predId = canonRef(o.id) + "-" + KEY2SUF[p];
                        if (kraj[predId] !== undefined) ready = kraj[predId];
                        else if (String((opStatusi[canonRef(o.id)] || {})[p] || "").indexOf("poslato") === 0) {
                            ready = POVRATAK_IZ_STAMPARIJE_DANA * DAN_MIN; pretpostavka = true;
                        } else vanPlana = true; // prethodna postoji, nije gotova, a nije u planu
                    }
                    if (String(o.statusRaw || "").indexOf("poslato") === 0) {
                        // sama operacija je u eksternoj štampariji
                        return { o, ready: 0, dur: POVRATAK_IZ_STAMPARIJE_DANA * DAN_MIN, ceka: null, vanPlana: false, pretpostavka: true, eksterno: true };
                    }
                    let dur = trajanje(m, o);
                    if (o.status === "u_radu" && o.start_ts) dur = Math.max(10, dur - minutaOd(o.start_ts));
                    return { o, ready, dur, ceka, vanPlana, pretpostavka, eksterno: false };
                });
                // uskoči u rupu: prvi po redu koji je SPREMAN; ako niko nije — najraniji spreman
                let idx = info.findIndex((x) => x.ready <= t);
                let usko = false;
                if (idx === -1) idx = info.reduce((best, x, i) => (x.ready < info[best].ready ? i : best), 0);
                else if (idx > 0) usko = true; // preskočio nekog ko čeka? ne — findIndex prvi spreman
                // "uskočio" = izabran spreman NIJE prvi u ostatku reda, a prvi u redu čeka
                if (idx === -1) idx = 0;
                const izabran = info[idx];
                if (idx > 0 && info[0].ready > t) usko = true;
                const start = Math.max(t, izabran.ready);
                const cekaOd = izabran.ready > t ? t : null;
                const end = start + izabran.dur;
                rezultat.push({
                    masinaId: m.id, o: izabran.o,
                    startWm: start, endWm: end,
                    cekaOdWm: cekaOd, ceka: izabran.ceka,
                    vanPlana: izabran.vanPlana, pretpostavka: izabran.pretpostavka,
                    eksterno: izabran.eksterno, uskok: usko && !izabran.ceka,
                });
                noviKraj[izabran.o.id] = end;
                t = end;
                ostalo.splice(ostalo.indexOf(izabran.o), 1);
            }
        });
        const isto = Object.keys(noviKraj).length === Object.keys(kraj).length
            && Object.keys(noviKraj).every((k) => kraj[k] === noviKraj[k]);
        kraj = noviKraj;
        if (isto) break;
    }
    // wm → datumi + rok
    return rezultat.map((s) => {
        const start = wmToDate(sidro, s.startWm), end = wmToDate(sidro, s.endWm);
        let rokD = null, probija = false, kasniDana = 0;
        if (s.o.rok) {
            const r = new Date(s.o.rok);
            if (!Number.isNaN(r.getTime())) { r.setHours(22, 0, 0, 0); rokD = r; probija = end > r; if (probija) kasniDana = Math.max(1, Math.ceil((dateToWm(sidro, end) - dateToWm(sidro, r)) / DAN_MIN)); }
        }
        return { ...s, start, end, rokD, probija, kasniDana };
    });
}

// ── PRIKAZ ───────────────────────────────────────────────────────────────────
// Zoom: širina jednog dana. "Krupno" je podrazumevano — čitljivo bez naprezanja,
// a kroz nedelje se ide horizontalnim skrolom ili strelicama ‹ ›.
const ZOOM = { s: { dan: 112, vik: 24 }, m: { dan: 160, vik: 30 }, l: { dan: 220, vik: 36 } };
const IME_PX = 210, RED_PX = 72;

export default function GanttPlanPRO({ machines, plan, orderMap, opStatusi, dragStart, dropToMachine }) {
    const [nedelja, setNedelja] = useState(0); // pomeranje pogleda po nedeljama
    const [zoom, setZoom] = useState('m');      // s | m | l — širina dana
    const [prikaziPrazne, setPrikaziPrazne] = useState(false); // prazne mašine samo na zahtev
    const [grupa, setGrupa] = useState('sve');
    const DAN_PX = ZOOM[zoom].dan, VIK_PX = ZOOM[zoom].vik;
    // "sada" se osvežava na minut — bez ovoga bi kalendar ostao usidren u trenutak
    // otvaranja ekrana, pa bi posle sat vremena svi startovi bili u prošlosti.
    const [minut, setMinut] = useState(0);
    useEffect(() => { const t = setInterval(() => setMinut((x) => x + 1), 60000); return () => clearInterval(t); }, []);
    const sidro = useMemo(() => radnoSada(), [minut]);

    const raspored = useMemo(
        () => izracunajRaspored({ machines, plan, orderMap, opStatusi, sidro }),
        [machines, plan, orderMap, opStatusi, sidro]
    );

    // vidljivi opseg: ponedeljak tekuće nedelje + offset, 3 nedelje
    const dani = useMemo(() => {
        const start = new Date(sidro);
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + nedelja * 7);
        start.setHours(6, 0, 0, 0);
        const out = []; let x = IME_PX; const d = new Date(start);
        for (let i = 0; i < 21; i++) {
            if (jeRadni(d)) { out.push({ datum: new Date(d), x, w: DAN_PX, vik: false }); x += DAN_PX; }
            else if (d.getDay() === 6) { out.push({ datum: new Date(d), x, w: VIK_PX, vik: true }); x += VIK_PX; } // sub+ned = jedna uska
            d.setDate(d.getDate() + 1);
        }
        return { lista: out, ukupno: x };
    }, [sidro, nedelja]);

    const xOd = (dat) => {
        for (const c of dani.lista) {
            const od = new Date(c.datum); od.setHours(6, 0, 0, 0);
            const doD = new Date(c.datum); doD.setHours(c.vik ? 23 : 22, 0, 0, 0);
            if (c.vik) { const ned = new Date(doD); ned.setDate(ned.getDate() + 1); if (dat >= od && dat <= ned) return c.x + c.w / 2; continue; }
            if (dat < od) return c.x;
            if (dat <= doD) return c.x + Math.min(1, Math.max(0, (dat - od) / (DAN_MIN * 60000))) * c.w;
        }
        return dani.ukupno;
    };

    const danas = new Date(); danas.setHours(0, 0, 0, 0);
    const fmtD = (d) => d.toLocaleDateString("sr-RS", { weekday: "short", day: "numeric", month: "numeric" });
    const fmtT = (d) => fmtD(d) + " ~" + d.toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" });

    // zauzetost po mašini po danu
    const zauzetost = useMemo(() => {
        const z = {};
        raspored.forEach((s) => {
            if (s.eksterno) return;
            let a = dateToWm(sidro, s.start), b = dateToWm(sidro, s.end);
            for (let d = Math.floor(a / DAN_MIN); d <= Math.floor((b - 1) / DAN_MIN); d++) {
                const min = Math.min(b, (d + 1) * DAN_MIN) - Math.max(a, d * DAN_MIN);
                if (min <= 0) continue;
                const dat = wmToDate(sidro, d * DAN_MIN); dat.setHours(0, 0, 0, 0);
                const k = s.masinaId + "|" + dat.getTime();
                z[k] = (z[k] || 0) + min;
            }
        });
        return z;
    }, [raspored, sidro]);

    const probijaUk = raspored.filter((s) => s.probija).length;
    const zauzeteId = useMemo(() => new Set(raspored.map((s) => s.masinaId)), [raspored]);
    const vidljive = machines.filter((m) =>
        (grupa === 'sve' || m.type === grupa) && (prikaziPrazne || zauzeteId.has(m.id)));
    const kartica = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, boxShadow: "0 10px 30px rgba(15,23,42,.06)" };
    const chip = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 999, padding: "6px 12px", fontWeight: 800, fontSize: 12.5 };

    return (
        <div>
            <div style={{ ...kartica, padding: 12, marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={chip}>U planu: <b style={{ color: "#1d4ed8" }}>{raspored.length}</b></span>
                <span style={{ ...chip, ...(probijaUk ? { borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" } : {}) }}>⚠ Probija rok: <b>{probijaUk}</b></span>
                <span style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>2 smene · 960 min/dan · pon–pet · datumi se preračunavaju uživo</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ ...chip, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked={prikaziPrazne} onChange={(e) => setPrikaziPrazne(e.target.checked)} style={{ accentColor: "#1d4ed8" }} />
                        prikaži i prazne
                    </label>
                    {[['s', 'S'], ['m', 'M'], ['l', 'L']].map(([k, l]) =>
                        <button key={k} onClick={() => setZoom(k)} title={"Zoom " + l} style={{ ...chip, cursor: "pointer", padding: "6px 11px", background: zoom === k ? "#0f172a" : "#fff", color: zoom === k ? "#fff" : "#334155", borderColor: zoom === k ? "#0f172a" : "#e2e8f0" }}>{l}</button>)}
                    <button onClick={() => setNedelja(nedelja - 1)} style={{ ...chip, cursor: "pointer" }}>‹</button>
                    <button onClick={() => setNedelja(0)} style={{ ...chip, cursor: "pointer" }}>Danas</button>
                    <button onClick={() => setNedelja(nedelja + 1)} style={{ ...chip, cursor: "pointer" }}>›</button>
                </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {[['sve', 'Sve'], ['stampa', 'Štamparije'], ['rezanje', 'Rezači'], ['kese', 'Kese'], ['spulne', 'Špulne'], ['kasiranje', 'Kaширanje']].map(([k, l]) =>
                    <button key={k} onClick={() => setGrupa(k)} style={{ border: '1px solid #cbd5e1', background: grupa === k ? '#0f172a' : '#fff', color: grupa === k ? '#fff' : '#334155', borderRadius: 9, padding: '6px 12px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>{l}</button>)}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, fontWeight: 800, color: "#475569", marginBottom: 10 }}>
                {[["stampa", "Štampa"], ["rezanje", "Rezanje"], ["kasiranje", "Kaширanje"], ["kese", "Kese"], ["spulne", "Špulne"]].map(([k, l]) =>
                    <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 10, borderRadius: 3, background: OP_BOJA[k] }} />{l}</span>)}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 10, borderRadius: 3, border: "1.5px dashed #f59e0b", background: "repeating-linear-gradient(45deg,#e2e8f0 0 4px,#f8fafc 4px 8px)" }} />Čeka prethodnu</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 10, borderRadius: 3, background: "#7c3aed" }} />U štampariji</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 3, height: 14, borderRadius: 2, background: "#dc2626" }} />Rok</span>
            </div>

            <div style={{ ...kartica, overflowX: "auto" }}>
                <div style={{ minWidth: dani.ukupno + 8 }}>
                    {/* zaglavlje dana */}
                    <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0", position: "sticky", top: 0, background: "#fff", zIndex: 3 }}>
                        <div style={{ width: IME_PX, flex: "0 0 " + IME_PX + "px", padding: "9px 12px", fontSize: 10, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase" }}>Mašina</div>
                        {dani.lista.map((c, i) => {
                            const jeDanas = c.datum.getTime() === danas.getTime() || (!c.vik && new Date(c.datum).setHours(0, 0, 0, 0) === danas.getTime());
                            return c.vik
                                ? <div key={i} style={{ width: c.w, flex: "0 0 " + c.w + "px", background: "#f8fafc", color: "#cbd5e1", writingMode: "vertical-rl", textAlign: "center", fontSize: 9, fontWeight: 900, padding: "6px 0" }}>VIKEND</div>
                                : <div key={i} style={{ width: c.w, flex: "0 0 " + c.w + "px", padding: "8px 8px 6px", borderLeft: "1px solid #f1f5f9", fontSize: 12.5, fontWeight: 900, color: jeDanas ? "#1d4ed8" : "#334155", background: jeDanas ? "#eff6ff" : undefined }}>
                                    {c.datum.toLocaleDateString("sr-RS", { weekday: "short" }).toUpperCase()}
                                    <div style={{ color: "#94a3b8", fontWeight: 700, fontSize: 11 }}>{c.datum.getDate()}. {c.datum.getMonth() + 1}.{jeDanas ? " · danas" : ""}</div>
                                </div>;
                        })}
                    </div>

                    {vidljive.length === 0 && <div style={{ padding: 26, textAlign: "center", color: "#94a3b8", fontWeight: 800 }}>Nema mašina sa nalozima za izabrani filter — uključi "prikaži i prazne" ili prevuci naloge na tabu Mašine.</div>}
                    {vidljive.map((m) => {
                        const moji = raspored.filter((s) => s.masinaId === m.id).sort((a, b) => a.start - b.start);
                        return (
                            <React.Fragment key={m.id}>
                                <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropToMachine && dropToMachine(m.id, e)}
                                    style={{ display: "flex", borderBottom: "1px solid #f1f5f9" }}>
                                    <div style={{ width: IME_PX, flex: "0 0 " + IME_PX + "px", padding: "10px 12px", borderRight: "1px solid #e2e8f0" }}>
                                        <div style={{ fontSize: 9.5, color: "#94a3b8", fontWeight: 900 }}>{m.code} · {(m.group || m.type || "").toString().toUpperCase()}</div>
                                        <b style={{ fontSize: 14.5 }}>{m.name}</b>
                                        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{m.speed || "—"} m/min · setup {m.setupMin || 0}{m.status !== "aktivna" ? " · 🔧 " + m.status : ""}</div>
                                    </div>
                                    <div style={{ position: "relative", flex: 1, height: RED_PX, minHeight: RED_PX }}>
                                        {dani.lista.map((c, i) => <div key={i} style={{ position: "absolute", left: c.x - IME_PX, width: c.w, top: 0, bottom: 0, borderLeft: "1px solid #f1f5f9", background: c.vik ? "repeating-linear-gradient(45deg,#f8fafc 0 6px,#f1f5f9 6px 12px)" : undefined }} />)}
                                        {moji.map((s, i) => {
                                            const x1 = xOd(s.start) - IME_PX, x2 = xOd(s.end) - IME_PX;
                                            const boja = s.eksterno ? "#7c3aed" : (OP_BOJA[s.o.opTip] || "#64748b");
                                            const cx1 = s.cekaOdWm !== null ? xOd(wmToDate(sidro, s.cekaOdWm)) - IME_PX : null;
                                            return (
                                                <React.Fragment key={s.o.id + i}>
                                                    {cx1 !== null && x1 - cx1 > 8 && (
                                                        <div title={"Čeka " + (OP_LABELE[s.ceka] || s.ceka || "prethodnu")} style={{ position: "absolute", left: cx1, width: x1 - cx1 - 2, top: 13, height: 44, borderRadius: 10, border: "1.5px dashed #f59e0b", background: "repeating-linear-gradient(45deg,#e2e8f0 0 5px,#f8fafc 5px 10px)", color: "#92400e", fontSize: 10.5, fontWeight: 900, padding: "6px 8px", overflow: "hidden", whiteSpace: "nowrap" }}>
                                                            ⏳ čeka {OP_LABELE[s.ceka] || s.ceka || ""}
                                                        </div>)}
                                                    <div draggable={!!dragStart} onDragStart={(e) => dragStart && dragStart(e, s.o.id)}
                                                        title={s.o.id + " · " + s.o.title + "\nstart: " + fmtT(s.start) + "\ngotov: " + fmtT(s.end) + (s.o.rok ? "\nrok: " + new Date(s.o.rok).toLocaleDateString("sr-RS") : "") + (s.pretpostavka ? "\n(pretpostavljen povratak iz štamparije)" : "")}
                                                        style={{ position: "absolute", left: x1, width: Math.max(26, x2 - x1 - 2), top: 13, height: 44, borderRadius: 10, background: boja, color: "#fff", fontSize: 12, fontWeight: 900, padding: "5px 9px", overflow: "hidden", whiteSpace: "nowrap", cursor: "grab", boxShadow: "0 3px 8px rgba(15,23,42,.18)", opacity: s.o.status === "u_radu" ? 1 : .93, outline: s.probija ? "2px solid #dc2626" : "none" }}>
                                                        {s.eksterno ? "📦 " : ""}{s.o.opIkona ? s.o.opIkona + " " : ""}{s.o.id}
                                                        <div style={{ fontWeight: 700, fontSize: 10.5, opacity: .92, marginTop: 1 }}>{s.eksterno ? "u štampariji · povratak " + fmtD(s.end) : "gotov: " + fmtT(s.end)}{s.probija ? " ⚠+" + s.kasniDana + "d" : ""}{s.uskok ? " ↷" : ""}{s.vanPlana ? " · preth. nije u planu!" : ""}</div>
                                                    </div>
                                                    {s.rokD && <div title={"Rok " + s.o.id} style={{ position: "absolute", left: xOd(s.rokD) - IME_PX, top: 6, bottom: 6, width: 3.5, background: "#dc2626", borderRadius: 2, zIndex: 2 }} />}
                                                </React.Fragment>
                                            );
                                        })}
                                        {moji.length === 0 && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#e2e8f0", fontWeight: 800, fontSize: 11 }}>prevuci nalog ovde</div>}
                                    </div>
                                </div>
                                {/* zauzetost po danu */}
                                <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0" }}>
                                    <div style={{ width: IME_PX, flex: "0 0 " + IME_PX + "px", padding: "2px 12px", fontSize: 9, color: "#94a3b8", fontWeight: 800, textTransform: "uppercase", borderRight: "1px solid #e2e8f0" }}>zauzetost</div>
                                    {dani.lista.map((c, i) => {
                                        if (c.vik) return <div key={i} style={{ width: c.w, flex: "0 0 " + c.w + "px", background: "#f8fafc" }} />;
                                        const dat = new Date(c.datum); dat.setHours(0, 0, 0, 0);
                                        const min = zauzetost[m.id + "|" + dat.getTime()] || 0;
                                        const pct = Math.round(min / DAN_MIN * 100);
                                        const st = pct === 0 ? { color: "#cbd5e1" } : pct < 60 ? { background: "#f0fdf4", color: "#15803d" } : pct <= 90 ? { background: "#fffbeb", color: "#b45309" } : { background: "#fef2f2", color: "#dc2626" };
                                        return <div key={i} style={{ width: c.w, flex: "0 0 " + c.w + "px", height: 23, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, borderLeft: "1px solid #f1f5f9", ...st }}>{pct ? pct + "%" : "—"}</div>;
                                    })}
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            <div style={{ color: "#64748b", fontSize: 11.5, marginTop: 10, fontWeight: 700 }}>
                💡 Prevuci traku na drugu mašinu — svi datumi se odmah preračunaju. Redosled unutar mašine menjaš strelicama ▲▼ na tabu "Mašine".
                Isprekidano = čekanje prethodne operacije (mašina tada radi druge naloge). "↷" = uskočio u rupu ispred naloga koji čeka.
            </div>
        </div>
    );
}
