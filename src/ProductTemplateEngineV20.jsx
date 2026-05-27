import React, { useEffect, useMemo, useState } from "react";
import { getVrsteMaterijala, getOznakeZaVrstu, getDebljineZaMaterijal, getKoeficijent, calculateGm2, buildMaterialName } from "./data/materialMaster.js";
import { supabase } from "./supabase.js";
import { autoIzborSvihSlojeva, labelaRolne, num as numR } from "./rolnaAlgoritam.js";
import spulnaTechnicalDrawing from "./assets/spulna_technical_drawing.png";
import { TemplateMptpPanel } from "./MPTPRollOrientation.jsx";

const BLUE = "#2446b8";
const GREEN = "#059669";
const ORANGE = "#f59e0b";
const RED = "#dc2626";
const SMART_ENGINE_MASTER_BLOCK = true;
const SMART_ENGINE_AUTO_REZANJE = true;



const KASIRANJE_VALJCI_MM = [490, 610, 640, 670, 740, 860, 890, 980, 1190, 1285, 1570];

function nnum(v) {
    return Number(String(v ?? "").replace("mm", "").replace("µ", "").replace(",", ".").trim()) || 0;
}

function predloziValjakKasiranja(idealnaSirina) {
    const ideal = nnum(idealnaSirina);
    if (!ideal) return null;
    const kandidati = KASIRANJE_VALJCI_MM.filter(v => v <= ideal).sort((a, b) => b - a);
    return kandidati[0] || null;
}

function izracunajRezanjeTemplate(rezanje = {}, idealnaSirinaMaterijala = "") {
    const stvarnaSirina = nnum(rezanje.sirinaMaterijala) || nnum(idealnaSirinaMaterijala);
    const sirinaTrake = nnum(rezanje.sirinaTrake);
    const brojTraka = Math.max(0, Math.floor(nnum(rezanje.brojTraka)));
    const rucneTrake = String(rezanje.sirineTraka || "")
        .split(",")
        .map(x => nnum(x))
        .filter(Boolean);
    const trake = rucneTrake.length ? rucneTrake : Array.from({ length: brojTraka }, () => sirinaTrake).filter(Boolean);
    const ukupnoTrake = trake.reduce((a, b) => a + b, 0);
    const ukupniOtpad = Math.max(0, stvarnaSirina - ukupnoTrake);
    const otpadLevo = ukupniOtpad / 2;
    const otpadDesno = ukupniOtpad / 2;
    const prekoSirine = ukupnoTrake > stvarnaSirina;
    const iskoriscenje = stvarnaSirina ? Math.min(100, (ukupnoTrake / stvarnaSirina) * 100) : 0;
    const predlogValjka = predloziValjakKasiranja(nnum(idealnaSirinaMaterijala) || stvarnaSirina);
    return { stvarnaSirina, sirinaTrake, brojTraka, trake, ukupnoTrake, ukupniOtpad, otpadLevo, otpadDesno, prekoSirine, iskoriscenje, predlogValjka };
}

const emptyLayer = { material: "", debljina: "", sirina: "", kg: "", metara: "", cena: "" };

const kesaOptions = [
    { key: "duplofan", label: "Duplofan traka", price: "0.5€" },
    { key: "eurozumba", label: "Eurozumba", price: "1.5€" },
    { key: "okrugla_zumba", label: "Okrugla zumba", price: "0.8€" },
    { key: "kosa_klapna", label: "Kosa klapna", price: "0.5€" },
    { key: "anleger", label: "Anleger", price: "2€" },
    { key: "utor", label: "Utor", price: "" },
    { key: "stampa", label: "Štampa", price: "1.2€" },
    { key: "poprecna_perf", label: "Poprečna perf.", price: "" },
    { key: "bocni_var", label: "Bočni var", price: "1€" },
    { key: "kontinualni_var", label: "Kontinualni var", price: "1€" },
    { key: "poprecni_var", label: "Poprečni var", price: "1€" },
    { key: "falta_dno", label: "Falta na dnu", price: "1.5€" },
    { key: "var_dno", label: "Var na dnu", price: "1€" },
    { key: "otvor_dno", label: "Otvor na dnu", price: "2€" },
    { key: "pakovanje_trn", label: "Pakovanje na trnu", price: "" },
    { key: "busene_rupe", label: "Bušene rupe", price: "5€" },
    { key: "adh_traka", label: "ADH traka", price: "1€" },
    { key: "ojacanje", label: "Ojačanje", price: "" },
    { key: "toplotni_var", label: "Termo/toplotni var", price: "" },
    { key: "mikroperforacija", label: "Mikroperforacija", price: "" }
];

const defaultForm = {
    type: "folija",
    naziv: "",
    kupac: "",
    sifra: "",
    napomena: "",
    porucenaKolicina: "",
    dimenzijaSirina: "",
    dimenzijaDuzina: "",
    idealnaSirinaMaterijala: "",
    folija: {
        datumProizvodnje: "",
        rokIsporuke: "",
        status: "u_pripremi",
        dimenzija: "85 × 110 mm",
        layers: [
            { material: "BOPP 20µ", debljina: "20", sirina: "840", kg: "", metara: "" },
            { material: "ALU 7µ", debljina: "7", sirina: "840", kg: "", metara: "" },
            { material: "CPP 35µ", debljina: "35", sirina: "840", kg: "", metara: "" }
        ],
        stampa: {
            masina: "UTECO ONYX",
            strana: "Spolja",
            obimValjka: "330 mm",
            brojBoja: "4+lak",
            klise: "DFR 1,14 mm",
            precnikHilzne: "152 mm",
            smerOdmotavanja: "Na glavu",
            stamparija: ""
        },
        kasiranje: {
            tipLepka: "SF724A 324CA",
            odnosLepka: "100:40",
            nanosLepka: "1.6 g/m²",
            brojKasiranja: "1",
            materijalABC: "BOPP / ALU / CPP",
            napomena: ""
        },
        rezanje: {
            sirinaMaterijala: "840",
            sirinaTrake: "85",
            brojTraka: "8",
            precnikRolne: "400",
            duzinaRolne: "15000",
            dorada: "",
            smerGP: "",
            sirineTraka: "85,85,85,85,85,85,85,85"
        },
        kpdf: {
            enabled: false,
            tip: "KPDF",
            odnos: "30/60",
            razmak: "",
            sirina: "",
            pozicija: "",
            smer: "poprečno",
            napomena: "",
            mptpPdfUrl: "",
            mptpPdfName: "",
            mptpRotation: 0,
            rotationRezanje: 0,
            rollDirection: "outside",
            unwindDirection: "Na glavu",
            repeatLength: "",
            upCount: "2",
            printDirection: "up"
        },
        finalRoll: {
            enabled: true,
            prikaz: "finalna_rolna",
            smerOdmotavanja: "Na glavu",
            stampaStrana: "Spolja",
            hilzna: "152 mm",
            precnik: "400 mm",
            duzina: "15000 m",
            oznaka: "Crvena traka"
        }
    },
    kesa: {
        naziv: "",
        kolicina: "10000",
        skart: "10",
        datum: "",
        marza: "30",
        sirina: "200",
        duzina: "400",
        klapna: "50",
        falta: "50",
        takt: "50",
        ban: "1",
        tolerancija: "±10%",
        grafika: "Novi posao",
        layers: [{ material: "OPP", debljina: "15", tezina: "27.3", cena: "2.9" }],
        tipKese: "ravna",
        viewMode: "front",
        zoomLevel: "100",
        options: {},
        positions: {},
        transportKg: "0.35",
        pakovanje: "U bunt ide 200 kom"
    },
    spulna: {
        naziv: "",
        materijal: "Papir silikonizirani 60gr",
        layers: [{ vrsta: "PAPIR", oznaka: "SILIKON", debljina: "60", koeficijent: "1.00", gm2: "60", sirina: "360", cena: "" }],
        W: "25",
        Da: "158",
        Di: "152",
        C: "0",
        G: "0",
        T: "180",
        D: "380",
        sirinaMaterijala: "360",
        maxMetara: "8000",
        smer: "Gap winding"
    }
};

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function fieldStyle() { return { width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, background: "#fff" }; }
function labelStyle() { return { display: "block", fontSize: 10, color: "#475569", fontWeight: 800, textTransform: "uppercase", marginBottom: 5, letterSpacing: 0.4 }; }
function cardStyle() { return { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(15,23,42,.04)" }; }

function Section({ title, children, color = BLUE }) {
    return <div style={{ ...cardStyle(), marginBottom: 14 }}>
        <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 8, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, color, fontSize: 15, fontWeight: 900 }}>{title}</h3>
        </div>
        {children}
    </div>;
}

function Select({ label, value, onChange, options }) {
    return <div><label style={labelStyle()}>{label}</label><select value={value || ""} onChange={(e) => onChange(e.target.value)} style={fieldStyle()}>{options.map(o => <option key={o} value={o}>{o}</option>)}</select></div>;
}

function ToggleButton({ active, children, onClick }) {
    return <button onClick={onClick} style={{ border: active ? `2px solid ${BLUE}` : "1px solid #e2e8f0", background: active ? "#eef2ff" : "#fff", color: active ? BLUE : "#334155", borderRadius: 10, padding: "10px 14px", fontWeight: 800, cursor: "pointer" }}>{children}</button>;
}


function MaterialInlineSelector({ layer, onPatch }) {
    const vrste = getVrsteMaterijala();
    const vrsta = layer?.vrsta || layer?.tip || "BOPP";
    const oznake = useMemo(() => getOznakeZaVrstu(vrsta), [vrsta]);
    const oznaka = layer?.oznaka || layer?.grade || (oznake.includes("FXCB") ? "FXCB" : (oznake[0] || "STANDARD"));
    const debljine = useMemo(() => getDebljineZaMaterijal(vrsta, oznaka), [vrsta, oznaka]);
    const debljina = Number(String(layer?.debljina || layer?.deb || layer?.thickness || (debljine.includes(20) ? 20 : (debljine[0] || 20))).replace("µ", "")) || 20;

    const koeficijent = getKoeficijent(vrsta) || layer?.koeficijent || "1.00";
    const gm2 = calculateGm2(vrsta, debljina);
    const nazivMaterijala = buildMaterialName(vrsta, oznaka, debljina);

    useEffect(() => {
        onPatch({
            vrsta,
            oznaka,
            debljina,
            koeficijent,
            gm2,
            tezina: gm2,
            tezinaGm2: gm2,
            material: nazivMaterijala,
            nazivMaterijala,
            materijal: nazivMaterijala,
            tipMaterijala: nazivMaterijala
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vrsta, oznaka, debljina]);

    const input = { width: "100%", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", fontWeight: 850, fontSize: 12, boxSizing: "border-box" };
    return <>
        <select style={input} value={vrsta} onChange={e => onPatch({ vrsta: e.target.value, oznaka: "", debljina: "" })}>
            {vrste.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select style={input} value={oznaka} onChange={e => onPatch({ oznaka: e.target.value, debljina: "" })}>
            {oznake.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select style={input} value={debljina} onChange={e => onPatch({ debljina: Number(e.target.value) })}>
            {debljine.map(d => <option key={d} value={d}>{d}{vrsta === "PAPIR" ? " g/m²" : "µ"}</option>)}
        </select>
    </>;
}

function MaterialLayersOneRowTable({ title = "MATERIJALI", layers = [], onAdd, onRemove, onPatch, showKg = false, showMetara = false, showCena = true, idealnaSirina = "", porucenaKolicina = "" }) {
    const safeLayers = layers.length ? layers : [clone(emptyLayer)];
    const tableWrap = { border: "1px solid #dbe3ef", borderRadius: 14, overflow: "hidden", background: "#fff" };
    const th = { background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#334155", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: .25, padding: "10px 8px", textAlign: "left", whiteSpace: "nowrap" };
    const td = { borderBottom: "1px solid #eef2f7", padding: "8px", verticalAlign: "middle" };
    const input = { width: "100%", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", fontWeight: 850, fontSize: 12, boxSizing: "border-box" };
    const check = { width: 18, height: 18, accentColor: GREEN };

    const num = (v) => Number(String(v || "").replace("µ", "").replace("mm", "").replace(",", ".")) || 0;
    const totalDeb = safeLayers.reduce((a, l) => a + num(l.debljina), 0);
    const totalGm2 = safeLayers.reduce((a, l) => a + num(l.gm2 || l.tezina || l.tezinaGm2), 0);
    const avgKoef = safeLayers.length ? safeLayers.reduce((a, l) => a + num(l.koeficijent), 0) / safeLayers.length : 0;
    const totalCena = safeLayers.reduce((a, l) => a + num(l.cena), 0);

    return <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div>
                <h3 style={{ margin: 0, color: "#0f172a", fontSize: 18, fontWeight: 950 }}>{title}</h3>
                <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>Vrsta, oznaka, debljina, koeficijent, težina i širina su u jednom redu.</div>
            </div>
            <button onClick={onAdd} style={{ background: GREEN, color: "#fff", border: "none", borderRadius: 999, padding: "9px 14px", fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" }}>+ Dodaj sloj</button>
        </div>
        <div style={tableWrap}>
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: showKg || showMetara ? 1220 : 1060, borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <thead>
                        <tr>
                            <th style={{ ...th, width: 38 }}>#</th>
                            <th style={{ ...th, width: 150 }}>Vrsta materijala</th>
                            <th style={{ ...th, width: 160 }}>Oznaka materijala</th>
                            <th style={{ ...th, width: 105 }}>Debljina</th>
                            <th style={{ ...th, width: 95 }}>Koeficijent</th>
                            <th style={{ ...th, width: 105 }}>Težina g/m²</th>
                            <th style={{ ...th, width: 100 }}>Širina mm</th>
                            {showKg && <th style={{ ...th, width: 90 }}>Kg</th>}
                            {showMetara && <th style={{ ...th, width: 110 }}>Potrebno m</th>}
                            {showCena && <th style={{ ...th, width: 100 }}>Cena €/kg</th>}
                            <th style={{ ...th, width: 55, textAlign: "center" }}>Š</th>
                            <th style={{ ...th, width: 55, textAlign: "center" }}>L</th>
                            <th style={{ ...th, width: 70, textAlign: "center" }}>Akcije</th>
                        </tr>
                    </thead>
                    <tbody>
                        {safeLayers.map((l, i) => (
                            <tr key={i}>
                                <td style={{ ...td, fontWeight: 950 }}>{i + 1}</td>
                                <td style={td} colSpan={3}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr .7fr", gap: 8 }}>
                                        <MaterialInlineSelector layer={l} onPatch={(patch) => onPatch(i, patch)} />
                                    </div>
                                </td>
                                <td style={td}><input style={input} value={l.koeficijent || ""} onChange={e => onPatch(i, { koeficijent: e.target.value })} /></td>
                                <td style={td}><input style={input} value={l.gm2 || l.tezina || ""} onChange={e => onPatch(i, { gm2: e.target.value, tezina: e.target.value })} /></td>
                                <td style={td}><input style={{ ...input, background: (!l.sirina && idealnaSirina) ? "#eff6ff" : "#fff", color: (!l.sirina && idealnaSirina) ? "#2446b8" : "#0f172a" }} value={l.sirina || idealnaSirina || ""} onChange={e => onPatch(i, { sirina: e.target.value })} /></td>
                                {showKg && (() => {
                                    const gm2 = Number(l.gm2 || l.tezina || l.tezinaGm2 || 0);
                                    const sir = Number(l.sirina || idealnaSirina || 0) / 1000;
                                    const kol = Math.ceil(Number(porucenaKolicina || 0) * 1.05);
                                    const autoKg = (gm2 && sir && kol) ? (gm2 * sir * kol / 1000).toFixed(1) : "";
                                    return <td style={td}><input readOnly={!!autoKg} style={{ ...input, background: autoKg ? "#f0fdf4" : "#fff", color: autoKg ? "#059669" : "#0f172a", fontWeight: autoKg ? 900 : 700 }} value={autoKg || l.kg || ""} onChange={e => !autoKg && onPatch(i, { kg: e.target.value })} /></td>;
                                })()}
                                {showMetara && (() => {
                                    const kol = Math.ceil(Number(porucenaKolicina || 0) * 1.05);
                                    const autoM = kol ? String(kol) : "";
                                    return <td style={td}><input readOnly={!!autoM} style={{ ...input, background: autoM ? "#f0fdf4" : "#fff", color: autoM ? "#059669" : "#0f172a", fontWeight: autoM ? 900 : 700 }} value={autoM || l.metara || ""} onChange={e => !autoM && onPatch(i, { metara: e.target.value })} /></td>;
                                })()}
                                {showCena && <td style={td}><input style={input} value={l.cena || ""} onChange={e => onPatch(i, { cena: e.target.value })} /></td>}
                                <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={!!l.stampa} onChange={e => onPatch(i, { stampa: e.target.checked })} style={check} /></td>
                                <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={!!l.lak} onChange={e => onPatch(i, { lak: e.target.checked })} style={check} /></td>
                                <td style={{ ...td, textAlign: "center" }}><button onClick={() => onRemove(i)} disabled={safeLayers.length <= 1} style={{ width: 36, height: 36, border: "1px solid #fecaca", color: RED, background: safeLayers.length <= 1 ? "#f1f5f9" : "#fff", borderRadius: 10, fontWeight: 950, cursor: safeLayers.length <= 1 ? "not-allowed" : "pointer", opacity: safeLayers.length <= 1 ? .45 : 1 }}>×</button></td>
                            </tr>
                        ))}

                    </tbody>
                </table>
            </div>
            <div style={{ padding: "14px 16px", background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 10 }}>
                    <div style={{ background: "#fff", border: "1px solid #dbeafe", borderLeft: "4px solid #2446b8", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Ukupna debljina</div>
                        <div style={{ fontSize: 17, fontWeight: 950, color: "#2446b8" }}>{totalDeb ? `${totalDeb} µ` : "—"}</div>
                    </div>
                    <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderLeft: "4px solid #059669", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Ukupno g/m²</div>
                        <div style={{ fontSize: 17, fontWeight: 950, color: "#059669" }}>{totalGm2.toFixed(1)} g/m²</div>
                    </div>
                    <div style={{ background: "#fff", border: "1px solid #dbeafe", borderLeft: "4px solid #2446b8", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Prosečan koef.</div>
                        <div style={{ fontSize: 17, fontWeight: 950, color: "#2446b8" }}>{avgKoef.toFixed(2)}</div>
                    </div>
                    {showCena && totalCena > 0 && <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderLeft: "4px solid #059669", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Ukupna cena</div>
                        <div style={{ fontSize: 17, fontWeight: 950, color: "#059669" }}>{totalCena.toFixed(2)} €/kg</div>
                    </div>}
                    {showKg && porucenaKolicina && (() => {
                        const sir = Number(idealnaSirina || 0) / 1000;
                        const kol = Math.ceil(Number(porucenaKolicina) * 1.05);
                        const kgUk = (sir && kol) ? (totalGm2 * sir * kol / 1000).toFixed(1) : null;
                        return kgUk ? <div style={{ background: "#fff", border: "1px solid #86efac", borderLeft: "5px solid #059669", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ fontSize: 10, color: "#064e3b", fontWeight: 900, textTransform: "uppercase" }}>Ukupno kg (+5%)</div>
                            <div style={{ fontSize: 17, fontWeight: 950, color: "#059669" }}>{kgUk} kg</div>
                        </div> : null;
                    })()}
                </div>
                <div style={{ fontSize: 12, color: "#475569", fontWeight: 800 }}>✅ Š = Štampa se &nbsp;|&nbsp; ☑ L = Lakira se</div>
            </div>
        </div>
    </div>;
}

function RollPreview({ folija }) {
    const trake = (folija.rezanje.sirineTraka || "").split(",").map(x => x.trim()).filter(Boolean);
    return <div style={{ border: `2px solid ${BLUE}`, borderRadius: 10, overflow: "hidden", background: "#eef4ff" }}>
        <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 900, color: BLUE }}>
            <span>Zamišljeni prikaz finalne rolne</span><span>Materijal: {folija.rezanje.sirinaMaterijala || "—"} mm</span>
        </div>
        <div style={{ display: "flex", minHeight: 72, borderTop: `1px solid ${BLUE}` }}>
            {(trake.length ? trake : [folija.rezanje.sirinaTrake || "85"]).map((t, i) => <div key={i} style={{ flex: 1, borderRight: i === trake.length - 1 ? "none" : `1px solid ${BLUE}`, display: "flex", alignItems: "center", justifyContent: "center", color: BLUE, fontSize: 12, fontWeight: 900 }}>{t} mm</div>)}
        </div>
        {folija.kpdf.enabled && <div style={{ padding: "8px 12px", background: "#fff7ed", color: "#9a3412", fontWeight: 800, fontSize: 12 }}>KPDF / perforacija: {folija.kpdf.tip} · {folija.kpdf.odnos} · {folija.kpdf.smer} · pozicija {folija.kpdf.pozicija || "—"}</div>}
    </div>;
}


function FolijaCadEngine({ folija }) {
    const rez = folija.rezanje || {};
    const kpdf = folija.kpdf || {};
    const finalRoll = folija.finalRoll || {};
    const layers = folija.layers || [];
    const sirinaMaterijala = Number(String(rez.sirinaMaterijala || "840").replace(",", ".")) || 840;
    const sirineTraka = (rez.sirineTraka || "")
        .split(",")
        .map(x => Number(String(x).trim().replace(",", ".")))
        .filter(Boolean);
    const brojTraka = Number(rez.brojTraka) || sirineTraka.length || 1;
    const trake = sirineTraka.length ? sirineTraka : Array.from({ length: brojTraka }, () => Number(rez.sirinaTrake) || Math.round(sirinaMaterijala / brojTraka));
    const sumaTraka = trake.reduce((a, b) => a + b, 0);
    const otpad = Math.max(0, sirinaMaterijala - sumaTraka);
    const isOver = sumaTraka > sirinaMaterijala;
    const rollW = 680;
    const rollX = 50;
    const rollY = 165;
    const rollH = 126;
    const scale = rollW / Math.max(sirinaMaterijala, sumaTraka, 1);
    const coreX = 570;
    const coreY = 378;
    const warnings = [];
    if (isOver) warnings.push(`Širine traka prelaze matičnu rolnu za ${(sumaTraka - sirinaMaterijala).toFixed(1)} mm.`);
    if (otpad > 0) warnings.push(`Ostaje otpad ${otpad.toFixed(1)} mm — proveriti optimizaciju.`);
    if (kpdf.enabled && !kpdf.odnos) warnings.push("KPDF/perforacija je uključena, ali odnos nije definisan.");
    if (!rez.sirineTraka) warnings.push("Unesi sirineTraka kao npr. 85,85,85 da CAD prikaz bude potpuno tačan.");

    let cursor = rollX;
    const colors = ["#dbeafe", "#dcfce7", "#fef3c7", "#ede9fe", "#fee2e2", "#cffafe"];

    function DimLine({ x1, y1, x2, y2, text, tx, ty }) {
        return <>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#475569" strokeWidth="1.4" markerStart="url(#folijaArrow)" markerEnd="url(#folijaArrow)" />
            <text x={tx} y={ty} fontSize="11" fontWeight="950" fill="#334155" textAnchor="middle">{text}</text>
        </>;
    }

    function Callout({ x1, y1, x2, y2, text, color = BLUE }) {
        return <>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.5" strokeDasharray="6 5" />
            <circle cx={x1} cy={y1} r="4" fill={color} />
            <text x={x2 + 8} y={y2 + 4} fontSize="11" fontWeight="950" fill={color}>{text}</text>
        </>;
    }

    return <div style={{ ...cardStyle(), background: "#f8fafc", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12 }}>
            <div>
                <div style={{ fontWeight: 950, color: BLUE, fontSize: 16 }}>Folija CAD / Slitting & Roll Engine PRO</div>
                <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>Live prikaz matične rolne, slitovanja, finalnih rolni, KPDF/perforacije, odmotavanja i otpada.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 999, padding: "7px 11px", fontWeight: 900, color: "#334155" }}>Matična: {sirinaMaterijala} mm</span>
                <span style={{ border: `1px solid ${isOver ? RED : GREEN}`, background: isOver ? "#fef2f2" : "#ecfdf5", borderRadius: 999, padding: "7px 11px", fontWeight: 900, color: isOver ? RED : GREEN }}>Iskorišćenje: {Math.min(100, (sumaTraka / Math.max(sirinaMaterijala, 1)) * 100).toFixed(1)}%</span>
            </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) 330px", gap: 14, alignItems: "start" }}>
            <svg viewBox="0 0 820 610" width="100%" height="560" style={{ background: "white", border: "1px solid #dbe3ef", borderRadius: 14, boxShadow: "0 1px 3px rgba(15,23,42,.06)" }}>
                <defs>
                    <marker id="folijaArrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8 z" fill="#475569" /></marker>
                    <pattern id="folijaGrid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M18 0H0V18" fill="none" stroke="#eef2f7" strokeWidth="1" /></pattern>
                    <linearGradient id="filmGloss" x1="0" x2="1"><stop offset="0" stopColor="#f8fafc" /><stop offset=".5" stopColor="#ffffff" /><stop offset="1" stopColor="#e0ecff" /></linearGradient>
                    <filter id="rollShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.14" /></filter>
                </defs>
                <rect x="18" y="18" width="784" height="574" rx="16" fill="#fbfdff" stroke="#e2e8f0" />
                <rect x="34" y="88" width="742" height="438" rx="14" fill="url(#folijaGrid)" stroke="#e2e8f0" />
                <text x="410" y="54" textAnchor="middle" fontSize="18" fontWeight="950" fill="#0f172a">TEHNIČKI PRIKAZ FOLIJE — SLITTING / FINAL ROLL</text>
                <text x="410" y="76" textAnchor="middle" fontSize="12" fill="#64748b">Slojevi: {layers.map(l => l.material).filter(Boolean).join(" / ") || "—"}</text>

                <g filter="url(#rollShadow)">
                    <rect x={rollX} y={rollY} width={rollW} height={rollH} rx="18" fill="url(#filmGloss)" stroke="#0f172a" strokeWidth="2.4" />
                    <ellipse cx={rollX + 18} cy={rollY + rollH / 2} rx="18" ry={rollH / 2} fill="#e2e8f0" stroke="#0f172a" strokeWidth="2" />
                    <ellipse cx={rollX + rollW - 4} cy={rollY + rollH / 2} rx="20" ry={rollH / 2} fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
                </g>

                {trake.map((t, i) => {
                    const w = Math.max(18, t * scale);
                    const x = cursor;
                    cursor += w;
                    return <g key={i}>
                        <rect x={x} y={rollY} width={w} height={rollH} fill={colors[i % colors.length]} stroke="#1e3a8a" strokeWidth="1.2" opacity=".92" />
                        <line x1={x} y1={rollY} x2={x} y2={rollY + rollH} stroke="#1d4ed8" strokeWidth="2" />
                        <text x={x + w / 2} y={rollY + 58} textAnchor="middle" fontSize="12" fontWeight="950" fill="#1e3a8a">{t}</text>
                        <text x={x + w / 2} y={rollY + 76} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1e3a8a">mm</text>
                        <DimLine x1={x + 4} y1={rollY - 18 - (i % 2) * 16} x2={x + w - 4} y2={rollY - 18 - (i % 2) * 16} text={`${t} mm`} tx={x + w / 2} ty={rollY - 25 - (i % 2) * 16} />
                    </g>;
                })}

                {otpad > 0 && !isOver && <g>
                    <rect x={rollX + sumaTraka * scale} y={rollY} width={Math.max(16, otpad * scale)} height={rollH} fill="#fee2e2" stroke="#dc2626" strokeWidth="1.7" />
                    <text x={rollX + sumaTraka * scale + Math.max(16, otpad * scale) / 2} y={rollY + 66} textAnchor="middle" fontSize="11" fontWeight="950" fill="#dc2626">OTPAD</text>
                    <text x={rollX + sumaTraka * scale + Math.max(16, otpad * scale) / 2} y={rollY + 84} textAnchor="middle" fontSize="10" fontWeight="850" fill="#dc2626">{otpad.toFixed(1)} mm</text>
                </g>}

                {kpdf.enabled && <g>
                    <line x1={rollX - 12} y1={rollY + rollH * .58} x2={rollX + rollW + 18} y2={rollY + rollH * .58} stroke="#f97316" strokeWidth="4" strokeDasharray="8 8" />
                    <Callout x1={rollX + rollW * .62} y1={rollY + rollH * .58} x2="610" y2="132" text={`KPDF ${kpdf.odnos || ""} · ${kpdf.smer || ""}`} color="#ea580c" />
                </g>}

                <DimLine x1={rollX} y1={rollY + rollH + 34} x2={rollX + rollW} y2={rollY + rollH + 34} text={`Matična širina ${sirinaMaterijala} mm`} tx={rollX + rollW / 2} ty={rollY + rollH + 58} />
                <Callout x1={rollX + 60} y1={rollY + 24} x2="92" y2="118" text={`Štampa: ${folija.stampa?.strana || "—"}`} color="#2563eb" />
                <Callout x1={rollX + rollW - 45} y1={rollY + rollH - 22} x2="620" y2="338" text={`Odmotavanje: ${finalRoll.smerOdmotavanja || folija.stampa?.smerOdmotavanja || "—"}`} color="#7c3aed" />

                <g transform="translate(92 392)">
                    <text x="0" y="0" fontSize="13" fontWeight="950" fill="#0f172a">Slojevi / struktura</text>
                    {layers.slice(0, 5).map((l, i) => <g key={i} transform={`translate(0 ${22 + i * 22})`}>
                        <rect x="0" y="-12" width="190" height="16" rx="4" fill={colors[i % colors.length]} stroke="#cbd5e1" />
                        <text x="205" y="1" fontSize="11" fontWeight="850" fill="#334155">{l.material || `Sloj ${i + 1}`} · {l.debljina || "—"}µ · {l.sirina || "—"}mm</text>
                    </g>)}
                </g>

                <g transform={`translate(${coreX} ${coreY})`}>
                    <text x="0" y="-22" fontSize="13" fontWeight="950" fill="#0f172a">Finalna rolna</text>
                    <ellipse cx="58" cy="54" rx="58" ry="52" fill="#dbeafe" stroke="#0f172a" strokeWidth="2" />
                    <ellipse cx="58" cy="54" rx="24" ry="22" fill="#fff" stroke="#64748b" strokeWidth="2" />
                    <path d="M58 2 C88 10 116 28 116 54 C116 80 88 99 58 106" fill="none" stroke="#1d4ed8" strokeWidth="6" opacity=".75" />
                    <text x="58" y="132" textAnchor="middle" fontSize="11" fontWeight="950" fill="#1d4ed8">Ø {rez.precnikRolne || finalRoll.precnik || "—"}</text>
                    <text x="58" y="150" textAnchor="middle" fontSize="10" fontWeight="850" fill="#475569">Hilzna {finalRoll.hilzna || folija.stampa?.precnikHilzne || "—"}</text>
                </g>
            </svg>

            <div style={{ display: "grid", gap: 10 }}>
                <div style={{ ...cardStyle(), borderLeft: `5px solid ${BLUE}` }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: BLUE, marginBottom: 8 }}>Parametri rezanja</div>
                    <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.8 }}>
                        <b>Matična rola:</b> {sirinaMaterijala} mm<br />
                        <b>Broj traka:</b> {trake.length}<br />
                        <b>Ukupno trake:</b> {sumaTraka.toFixed(1)} mm<br />
                        <b>Otpad:</b> {isOver ? "PREKO ŠIRINE" : `${otpad.toFixed(1)} mm`}<br />
                        <b>Dužina rolne:</b> {rez.duzinaRolne || "—"} m<br />
                        <b>Prečnik:</b> {rez.precnikRolne || "—"} mm
                    </div>
                </div>
                <div style={{ ...cardStyle(), borderLeft: `5px solid ${ORANGE}` }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: ORANGE, marginBottom: 8 }}>KPDF / perforacija</div>
                    <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.8 }}>
                        <b>Status:</b> {kpdf.enabled ? "Uključeno" : "Nema"}<br />
                        <b>Tip:</b> {kpdf.tip || "—"}<br />
                        <b>Odnos:</b> {kpdf.odnos || "—"}<br />
                        <b>Smer:</b> {kpdf.smer || "—"}<br />
                        <b>Pozicija:</b> {kpdf.pozicija || "—"}
                    </div>
                </div>
                <div style={{ ...cardStyle(), borderLeft: `5px solid ${warnings.length ? RED : GREEN}` }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: warnings.length ? RED : GREEN, marginBottom: 8 }}>AI validacija širina</div>
                    {warnings.length ? <ul style={{ margin: 0, paddingLeft: 18, color: RED, fontSize: 12, lineHeight: 1.7 }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : <div style={{ color: GREEN, fontSize: 12, fontWeight: 850 }}>Plan širina je logičan i spreman za tehnički list.</div>}
                </div>
                <div style={{ ...cardStyle(), background: "#f8fafc" }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: "#0f172a", marginBottom: 8 }}>Legenda</div>
                    {["Trake = finalne širine", "Crveno = otpad", "Narandžasto = KPDF/perforacija", "Plavo = smer/štampa/finalna rolna"].map((x, i) => <div key={i} style={{ fontSize: 11, color: "#475569", marginBottom: 5 }}>• {x}</div>)}
                </div>
            </div>
        </div>
    </div>;
}

function BagDrawing({ kesa }) {
    const [side, setSide] = useState("front");
    const o = kesa.options || {};
    const mm = (v, fallback) => Number(String(v ?? "").replace(",", ".")) || fallback;
    const W_mm = mm(kesa.sirina, 200);
    const H_mm = mm(kesa.duzina, 300);
    const flap_mm = mm(kesa.klapna, 20);
    const gus_mm = mm(kesa.falta, 50);
    const tipKese = kesa.tipKese || "doypack";

    const DBLU = "#1a56db";
    const DBLK = "#0f172a";
    const DGRAY = "#94a3b8";
    const DLGRAY = "#e2e8f0";
    const DDASH = "9 6";
    const DDOT = "4 7";
    const DPERF = "3 6";
    const AR = "url(#bagAr)";

    const VBW = 870, VBH = 620;
    const BX = 215, BY = 52;
    const BW = 248, BH = 375;
    const BCX = BX + BW / 2;
    const BBOT = BY + BH;
    const flapPx = Math.max(18, Math.min(60, (flap_mm / H_mm) * BH));
    const gussetPx = Math.max(26, Math.min(80, (gus_mm / H_mm) * BH));
    const perfY = BY + flapPx + 30;
    const anleY = BBOT - gussetPx - 14;
    const SX = 700, SY = 95, SW = 52, SH = BH * 0.84;

    function DimH({ x1, x2, y, label, above = true }) {
        const mid = (x1 + x2) / 2;
        const ty = above ? y - 9 : y + 16;
        return <g>
            <line x1={x1} y1={y-5} x2={x1} y2={y+5} stroke={DBLU} strokeWidth="1.1" />
            <line x1={x2} y1={y-5} x2={x2} y2={y+5} stroke={DBLU} strokeWidth="1.1" />
            <line x1={x1} y1={y} x2={x2} y2={y} stroke={DBLU} strokeWidth="1.1" markerStart={AR} markerEnd={AR} />
            <text x={mid} y={ty} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={DBLU}>{label}</text>
        </g>;
    }

    function DimV({ x, y1, y2, label, right = false }) {
        const mid = (y1 + y2) / 2;
        const tx = right ? x + 10 : x - 9;
        const anchor = right ? "start" : "end";
        return <g>
            <line x1={x-5} y1={y1} x2={x+5} y2={y1} stroke={DBLU} strokeWidth="1.1" />
            <line x1={x-5} y1={y2} x2={x+5} y2={y2} stroke={DBLU} strokeWidth="1.1" />
            <line x1={x} y1={y1} x2={x} y2={y2} stroke={DBLU} strokeWidth="1.1" markerStart={AR} markerEnd={AR} />
            <text x={tx} y={mid+4} textAnchor={anchor} fontSize="10.5" fontWeight="700" fill={DBLU}>{label}</text>
        </g>;
    }

    function Note({ bx, by, ex, ey, lines: noteLines }) {
        return <g>
            <circle cx={bx} cy={by} r="2.8" fill={DBLU} />
            <line x1={bx} y1={by} x2={ex} y2={ey} stroke={DBLU} strokeWidth="0.9" strokeDasharray="5 3" />
            {noteLines.map((t, i) => <text key={i} x={ex + (ex < bx ? -5 : 5)} y={ey + i*13 - (noteLines.length-1)*6}
                textAnchor={ex < bx ? "end" : "start"} fontSize="10" fontWeight={i===0?"700":"500"}
                fill={i===0?DBLU:"#475569"}>{t}</text>)}
        </g>;
    }

    function OutlineRavna() {
        return <g>
            <rect x={BX} y={BY} width={BW} height={BH} rx="3" fill="white" stroke={DBLK} strokeWidth="2.2" />
            <line x1={BX} y1={BY+flapPx} x2={BX+BW} y2={BY+flapPx} stroke={DBLK} strokeWidth="1.6" />
            {gussetPx > 0 && <line x1={BX} y1={BBOT-gussetPx} x2={BX+BW} y2={BBOT-gussetPx} stroke={DBLK} strokeWidth="1.4" strokeDasharray={DDASH} />}
        </g>;
    }

    function OutlineDoypack() {
        const gp = gussetPx || 50;
        return <g>
            <path d={`M${BX+7} ${BY} H${BX+BW-7} Q${BX+BW} ${BY} ${BX+BW} ${BY+10} V${BBOT-gp-22} Q${BX+BW} ${BBOT-gp+6} ${BX+BW*0.85} ${BBOT-gp+18} Q${BCX+BW*0.2} ${BBOT+10} ${BCX} ${BBOT+10} Q${BCX-BW*0.2} ${BBOT+10} ${BX+BW*0.15} ${BBOT-gp+18} Q${BX} ${BBOT-gp+6} ${BX} ${BBOT-gp-22} V${BY+10} Q${BX} ${BY} ${BX+7} ${BY} Z`}
                fill="white" stroke={DBLK} strokeWidth="2.2" />
            <line x1={BX} y1={BY+flapPx} x2={BX+BW} y2={BY+flapPx} stroke={DBLK} strokeWidth="1.6" />
            <line x1={BX+BW*0.16} y1={BBOT-gp+18} x2={BX+BW*0.84} y2={BBOT-gp+18} stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
            <line x1={BX+20} y1={BBOT-gp+7} x2={BX+BW-20} y2={BBOT-gp+7} stroke={DGRAY} strokeWidth="0.9" strokeDasharray={DDOT} />
        </g>;
    }

    function OutlineSideGusset() {
        const gp = gussetPx || 40;
        return <g>
            <rect x={BX} y={BY} width={BW} height={BH} rx="3" fill="white" stroke={DBLK} strokeWidth="2.2" />
            <line x1={BX} y1={BY+flapPx} x2={BX+BW} y2={BY+flapPx} stroke={DBLK} strokeWidth="1.6" />
            <line x1={BX+gp} y1={BY+flapPx+4} x2={BX+gp} y2={BY+BH-4} stroke={DBLK} strokeWidth="1.4" strokeDasharray={DDASH} />
            <line x1={BX+BW-gp} y1={BY+flapPx+4} x2={BX+BW-gp} y2={BY+BH-4} stroke={DBLK} strokeWidth="1.4" strokeDasharray={DDASH} />
            <line x1={BX} y1={BBOT-10} x2={BX+BW} y2={BBOT-10} stroke={DBLK} strokeWidth="2" />
        </g>;
    }

    function OutlineStabilo() {
        const gp = gussetPx || 45;
        return <g>
            <path d={`M${BX+7} ${BY} H${BX+BW-7} Q${BX+BW} ${BY} ${BX+BW} ${BY+10} V${BBOT-gp} L${BX+BW*0.88} ${BBOT} H${BX+BW*0.12} L${BX} ${BBOT-gp} V${BY+10} Q${BX} ${BY} ${BX+7} ${BY} Z`}
                fill="white" stroke={DBLK} strokeWidth="2.2" />
            <line x1={BX} y1={BY+flapPx} x2={BX+BW} y2={BY+flapPx} stroke={DBLK} strokeWidth="1.6" />
            <line x1={BX} y1={BBOT-gp} x2={BX+BW*0.12} y2={BBOT} stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
            <line x1={BX+BW} y1={BBOT-gp} x2={BX+BW*0.88} y2={BBOT} stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
            <line x1={BX+BW*0.12} y1={BBOT} x2={BX+BW*0.88} y2={BBOT} stroke={DBLK} strokeWidth="2" />
        </g>;
    }

    function OutlineCourier() {
        return <g>
            <rect x={BX} y={BY} width={BW} height={BH} rx="3" fill="white" stroke={DBLK} strokeWidth="2.2" />
            <path d={`M${BX} ${BY+flapPx} H${BX+BW*0.3} Q${BX+BW*0.5} ${BY+flapPx+24} ${BX+BW*0.7} ${BY+flapPx} H${BX+BW}`}
                fill="#f0fdf4" stroke={DBLK} strokeWidth="1.8" />
            <rect x={BX+BW*0.1} y={BY+flapPx+26} width={BW*0.8} height={10} fill="#fef3c7" stroke="#d97706" strokeWidth="1.2" />
            <text x={BCX} y={BY+flapPx+34} textAnchor="middle" fontSize="8" fill="#92400e" fontWeight="700">ADH TRAKA</text>
            <line x1={BX} y1={BBOT-8} x2={BX+BW} y2={BBOT-8} stroke={DBLK} strokeWidth="2" />
        </g>;
    }

    function OutlineVakuum() {
        return <g>
            <rect x={BX} y={BY} width={BW} height={BH} rx="6" fill="white" stroke={DBLK} strokeWidth="2.2" />
            <ellipse cx={BCX} cy={BY+flapPx/2} rx={14} ry={9} fill="white" stroke={DBLK} strokeWidth="1.8" />
            <ellipse cx={BCX} cy={BY+flapPx/2} rx={6} ry={4} fill={DLGRAY} stroke={DBLK} strokeWidth="1.2" />
            <line x1={BX} y1={BY+flapPx} x2={BX+BW} y2={BY+flapPx} stroke={DBLK} strokeWidth="1.6" />
            <path d={`M${BX} ${BY+BH*0.4} Q${BX-10} ${BY+BH*0.6} ${BX} ${BY+BH*0.8}`} fill="none" stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
            <path d={`M${BX+BW} ${BY+BH*0.4} Q${BX+BW+10} ${BY+BH*0.6} ${BX+BW} ${BY+BH*0.8}`} fill="none" stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
            <line x1={BX} y1={BBOT-8} x2={BX+BW} y2={BBOT-8} stroke={DBLK} strokeWidth="2" />
        </g>;
    }

    const OutlineMap = { ravna: OutlineRavna, doypack: OutlineDoypack, side_gusset: OutlineSideGusset, stabilo: OutlineStabilo, courier: OutlineCourier, vakuum: OutlineVakuum };
    const Outline = OutlineMap[tipKese] || OutlineRavna;

    const bagTypeLabels = { ravna: "Ravna", doypack: "Doypack", side_gusset: "Side Gusset", stabilo: "Stabilo", courier: "Courier", vakuum: "Vakuum" };

    const validation = [];
    if (o.eurozumba && flap_mm < 15) validation.push("Eurozumba zahteva klapnu ≥ 15 mm.");
    if (o.anleger && W_mm < 80) validation.push("Anleger rizičan na kesi < 80 mm.");
    if (o.falta_dno && gus_mm <= 0) validation.push("Falta čekirana ali dubina nije uneta.");

    return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 18px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <div style={{ fontWeight: 900, fontSize: 12, color: DBLK, letterSpacing: 1.5, textTransform: "uppercase" }}>
                Tehnički crtež — {bagTypeLabels[tipKese] || tipKese}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: DGRAY, fontWeight: 700 }}>{W_mm} × {H_mm} mm</span>
                {[["front","Prednja"],["back","Zadnja"]].map(([v,l]) =>
                    <button key={v} onClick={() => setSide(v)} style={{ border: side===v?`2px solid ${DBLU}`:"1px solid #cbd5e1", background: side===v?"#eff6ff":"#fff", color: side===v?DBLU:"#64748b", borderRadius: 8, padding: "5px 13px", fontWeight: 800, fontSize: 11, cursor: "pointer" }}>{l}</button>
                )}
            </div>
        </div>

        <svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" style={{ display: "block", background: "white" }}>
            <defs>
                <marker id="bagAr" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                    <path d="M0,0 L7,3.5 L0,7 Z" fill={DBLU} />
                </marker>
                <pattern id="bagHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#bfdbfe" strokeWidth="2" />
                </pattern>
            </defs>
            <rect width={VBW} height={VBH} fill="white" />

            <Outline />

            {/* Osa simetrije */}
            <line x1={BCX} y1={BY+flapPx+5} x2={BCX} y2={BBOT-gussetPx-8} stroke={DGRAY} strokeWidth="0.9" strokeDasharray={DDOT} />
            <text x={BCX+5} y={BY+flapPx+19} fontSize="9" fill={DGRAY}>sredina</text>

            {/* Eurozumba */}
            {o.eurozumba && side==="front" && <g>
                <path d={`M${BCX-38} ${BY+flapPx/2-12} h76 q14 0 14 13 q0 13 -14 13 h-76 q-14 0 -14 -13 q0 -13 14 -13`} fill="white" stroke={DBLK} strokeWidth="1.7" />
                <circle cx={BCX} cy={BY+flapPx/2+1} r={8} fill="white" stroke={DBLK} strokeWidth="1.7" />
            </g>}

            {/* Okrugla zumba */}
            {o.okrugla_zumba && !o.eurozumba && side==="front" &&
                <circle cx={BCX} cy={BY+flapPx/2+1} r={16} fill="white" stroke={DBLK} strokeWidth="1.7" />}

            {/* Perforacija */}
            {(o.poprecna_perf || o.mikroperforacija) &&
                <line x1={BX-10} y1={perfY} x2={BX+BW+10} y2={perfY} stroke={DBLK} strokeWidth="1.4" strokeDasharray={DPERF} />}

            {/* Anleger */}
            {o.anleger && side==="front" && <g>
                <path d={`M${BCX-48} ${anleY+16} Q${BCX-28} ${anleY-2} ${BCX-12} ${anleY+10} Q${BCX} ${anleY-6} ${BCX+12} ${anleY+10} Q${BCX+28} ${anleY-2} ${BCX+48} ${anleY+16}`}
                    fill="none" stroke={DBLK} strokeWidth="1.7" strokeDasharray={DDASH} />
                <line x1={BX} y1={anleY+16} x2={BX+BW} y2={anleY+16} stroke={DGRAY} strokeWidth="0.9" strokeDasharray={DDOT} />
            </g>}

            {/* Bočni var */}
            {o.bocni_var && <g>
                <rect x={BX} y={BY+flapPx} width={8} height={BH-flapPx-gussetPx} fill="#bfdbfe" stroke={DBLU} strokeWidth="1" opacity="0.9" />
                <rect x={BX+BW-8} y={BY+flapPx} width={8} height={BH-flapPx-gussetPx} fill="#bfdbfe" stroke={DBLU} strokeWidth="1" opacity="0.9" />
            </g>}

            {/* Štampa */}
            {o.stampa && <g>
                <rect x={BX+16} y={BY+flapPx+16} width={BW-32} height={BH-flapPx-gussetPx-32} fill="url(#bagHatch)" stroke="#93c5fd" strokeWidth="1.4" strokeDasharray="9 4" rx="4" />
                <text x={BCX} y={BY+flapPx+(BH-flapPx-gussetPx)*0.45} textAnchor="middle" fontSize="10" fill="#1d4ed8" fontWeight="800">PRINT ZONA</text>
            </g>}

            {/* ADH traka */}
            {o.adh_traka && <rect x={BX+BW-11} y={BY+flapPx+16} width={11} height={BH-flapPx-gussetPx-28} fill="#fca5a5" stroke="#b91c1c" strokeWidth="1.3" />}

            {/* ── KOTE LEVO ── */}
            <DimV x={BX-54} y1={BY} y2={BBOT} label={`${H_mm} mm`} />
            {flapPx > 0 && <DimV x={BX-27} y1={BY} y2={BY+flapPx} label={`${flap_mm} mm`} />}
            {gussetPx > 0 && tipKese !== "side_gusset" && <DimV x={BX-27} y1={BBOT-gussetPx} y2={BBOT} label={`${gus_mm} mm`} />}

            {(o.poprecna_perf || o.mikroperforacija) && <g>
                <line x1={BX-13} y1={BY+flapPx} x2={BX-13} y2={perfY} stroke={DBLU} strokeWidth="1" markerStart={AR} markerEnd={AR} />
                <line x1={BX-18} y1={BY+flapPx} x2={BX-8} y2={BY+flapPx} stroke={DBLU} strokeWidth="1" />
                <line x1={BX-18} y1={perfY} x2={BX-8} y2={perfY} stroke={DBLU} strokeWidth="1" />
                <text x={BX-15} y={(BY+flapPx+perfY)/2+4} textAnchor="end" fontSize="9.5" fill={DBLU}>30 mm</text>
            </g>}

            {o.anleger && <g>
                <line x1={BX-13} y1={anleY+16} x2={BX-13} y2={BBOT} stroke={DBLU} strokeWidth="1" markerStart={AR} markerEnd={AR} />
                <line x1={BX-18} y1={anleY+16} x2={BX-8} y2={anleY+16} stroke={DBLU} strokeWidth="1" />
                <line x1={BX-18} y1={BBOT} x2={BX-8} y2={BBOT} stroke={DBLU} strokeWidth="1" />
                <text x={BX-15} y={(anleY+16+BBOT)/2+4} textAnchor="end" fontSize="9.5" fill={DBLU}>15 mm</text>
            </g>}

            {/* ── CALLOUT OZNAKE LEVO ── */}
            {o.eurozumba && side==="front" && <Note bx={BCX} by={BY+flapPx/2+1} ex={BX-145} ey={BY+16} lines={["Eurozumba","na sredini"]} />}
            {o.okrugla_zumba && !o.eurozumba && side==="front" && <Note bx={BCX} by={BY+flapPx/2+1} ex={BX-145} ey={BY+16} lines={["Okrugla zumba","Ø 28 mm"]} />}
            {(o.poprecna_perf || o.mikroperforacija) && <Note bx={BX+55} by={perfY} ex={BX-145} ey={perfY-4} lines={["Perforacija","30 mm od vrha"]} />}
            {o.anleger && side==="front" && <Note bx={BCX-28} by={anleY+8} ex={BX-145} ey={anleY+4} lines={["Anleger (jezičak)","15 mm od dna"]} />}
            {o.adh_traka && <Note bx={BX+BW-5} by={BY+flapPx+(BH-flapPx-gussetPx)*0.5} ex={BX+BW+60} ey={BY+flapPx+(BH-flapPx-gussetPx)*0.38} lines={["ADH traka"]} />}
            {tipKese==="side_gusset" && <Note bx={BX+gussetPx} by={BY+flapPx+BH*0.3} ex={BX-145} ey={BY+flapPx+BH*0.28} lines={["Bočna falta",`${gus_mm} mm`]} />}

            {/* ── KOTE DESNO ── */}
            <DimV x={BX+BW+48} y1={BY} y2={BBOT} label={`${H_mm} mm`} right />
            <DimH x1={BX} x2={BX+BW} y={BBOT+40} label={`${W_mm} mm`} above={false} />
            {gussetPx > 0 && tipKese !== "side_gusset" &&
                <DimH x1={BCX-BW*0.28} x2={BCX+BW*0.28} y={BBOT+18} label={`${gus_mm} mm`} />}

            {/* ── BOČNI PRIKAZ ── */}
            <text x={SX+SW/2} y={SY-18} textAnchor="middle" fontSize="9.5" fontWeight="900" fill={DBLK} letterSpacing="0.8">BOČNI PRIKAZ</text>
            {(tipKese==="doypack"||tipKese==="stabilo") && <>
                <path d={`M${SX+SW/2} ${SY} L${SX+SW} ${SY+SH*0.72} L${SX+SW/2} ${SY+SH} L${SX} ${SY+SH*0.72} Z`} fill="white" stroke={DBLK} strokeWidth="1.8" />
                <line x1={SX+SW/2} y1={SY} x2={SX+SW/2} y2={SY+SH} stroke={DGRAY} strokeWidth="0.9" strokeDasharray={DDOT} />
                <line x1={SX} y1={SY+SH} x2={SX+SW} y2={SY+SH} stroke={DBLK} strokeWidth="2" />
            </>}
            {tipKese==="side_gusset" && <>
                <rect x={SX} y={SY} width={SW} height={SH} fill="white" stroke={DBLK} strokeWidth="1.8" />
                <line x1={SX+SW*0.3} y1={SY} x2={SX+SW*0.3} y2={SY+SH} stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
                <line x1={SX+SW*0.7} y1={SY} x2={SX+SW*0.7} y2={SY+SH} stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
            </>}
            {(tipKese==="ravna"||tipKese==="courier"||tipKese==="vakuum") &&
                <rect x={SX+SW*0.2} y={SY} width={SW*0.6} height={SH} fill="white" stroke={DBLK} strokeWidth="1.8" />}
            <DimH x1={SX} x2={SX+SW} y={SY+SH+26} label={`${gus_mm} mm`} above={false} />

            {/* ── LEGENDA ── */}
            <g transform={`translate(16 ${VBH-56})`}>
                <rect width={VBW-32} height={46} rx="5" fill="#f8fafc" stroke={DLGRAY} />
                <text x="11" y="16" fontSize="8.5" fontWeight="900" fill={DBLK} letterSpacing="1">LEGENDA</text>
                <line x1="11" y1="32" x2="48" y2="32" stroke={DBLK} strokeWidth="2" />
                <text x="54" y="36" fontSize="9" fill="#334155">Linija reza</text>
                <line x1="138" y1="32" x2="175" y2="32" stroke={DBLK} strokeWidth="1.4" strokeDasharray={DDASH} />
                <text x="181" y="36" fontSize="9" fill="#334155">Linija savijanja</text>
                <line x1="305" y1="32" x2="342" y2="32" stroke={DBLK} strokeWidth="1.4" strokeDasharray={DPERF} />
                <text x="348" y="36" fontSize="9" fill="#334155">Perforacija</text>
                <rect x="452" y="24" width="30" height="14" fill="#bfdbfe" stroke={DBLU} strokeWidth="1" rx="2" />
                <text x="488" y="36" fontSize="9" fill="#334155">Zavar / var</text>
                <rect x="568" y="24" width="30" height="14" fill="url(#bagHatch)" stroke="#93c5fd" strokeWidth="1" rx="2" />
                <text x="604" y="36" fontSize="9" fill="#334155">Print zona</text>
                <rect x="686" y="24" width="14" height="14" fill="#fca5a5" stroke="#b91c1c" strokeWidth="1" rx="2" />
                <text x="706" y="36" fontSize="9" fill="#334155">ADH traka</text>
            </g>

            {/* Validacija */}
            {validation.length > 0 && <text x="700" y={VBH-62} fontSize="9" fill="#dc2626" fontWeight="800">⚠ {validation[0]}</text>}
        </svg>

        <div style={{ padding: "11px 18px", borderTop: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 8, background: "#f8fafc" }}>
            {[["Tip", bagTypeLabels[tipKese]||tipKese], ["Širina", `${W_mm} mm`], ["Visina", `${H_mm} mm`], ["Klapna", `${flap_mm} mm`], ["Falta", `${gus_mm} mm`], ["Tolerancija", kesa.tolerancija||"±5%"]].map(([l,v],i) =>
                <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 9px" }}>
                    <div style={{ fontSize: 8.5, color: "#94a3b8", fontWeight: 800, textTransform: "uppercase", marginBottom: 2 }}>{l}</div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>{v}</div>
                </div>
            )}
        </div>
    </div>;
}


function SpoolDrawing({ spulna, update }) {
    const legendRows = [
        ["W", "Širina trake (mm)"],
        ["T", "Širina hilzne / jezgra (mm)"],
        ["D", "Maksimalni prečnik špulne (mm)"],
        ["Da", "Spoljašnji prečnik hilzne (mm)"],
        ["Di", "Unutrašnji prečnik hilzne (mm)"],
        ["G", "Gap - razmak između kraja namotaja i ivice špulne (mm)"],
        ["C", "Zazor - bočni zazor između materijala i ivice (mm)"],
        ["Gap winding", "Namotavanje sa razmakom (gap)"],
        ["Overlapped winding", "Namotavanje sa preklapanjem"]
    ];
    const paramRows = [
        ["W", `${spulna.W || "—"} mm`],
        ["T", `${spulna.T || "—"} mm`],
        ["D", `${spulna.D || "—"} mm`],
        ["Da", `${spulna.Da || "—"} mm`],
        ["Di", `${spulna.Di || "—"} mm`],
        ["G", `${spulna.G || "—"} mm`],
        ["C", `${spulna.C || "—"} mm`],
        ["Max metara", `${spulna.maxMetara || "—"} m`],
        ["Tip", spulna.smer || "—"]
    ];

    return <>
        <Section title="Dimenzije špulne - tehnički prikaz" color="#7c3aed">
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.3fr) minmax(320px, .9fr)", gap: 18, alignItems: "center" }}>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, minHeight: 330, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, overflow: "hidden" }}>
                    <img
                        src={spulnaTechnicalDrawing}
                        alt="Tehnički crtež špulne - gap / overlapped winding"
                        style={{ width: "100%", maxWidth: 980, height: "auto", objectFit: "contain", display: "block" }}
                    />
                </div>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: "#334155", marginBottom: 10 }}>LEGENDA</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <tbody>
                            {legendRows.map((r, i) => <tr key={i}>
                                <td style={{ width: 72, padding: "7px 6px", borderBottom: "1px solid #eef2f7", fontWeight: 950, color: "#0f172a" }}>{r[0]}</td>
                                <td style={{ padding: "7px 6px", borderBottom: "1px solid #eef2f7", color: "#475569", fontWeight: 700 }}>{r[1]}</td>
                            </tr>)}
                        </tbody>
                    </table>
                </div>
            </div>
        </Section>
        <Section title="Dimenzije špulne" color="#7c3aed">
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.2fr) minmax(340px, .8fr)", gap: 16, alignItems: "start" }}>
                <Grid cols={4}>{Object.keys(spulna).filter(k => !["naziv", "materijal"].includes(k)).map(k => <Input key={k} label={k} value={spulna[k]} onChange={v => update(`spulna.${k}`, v)} />)}</Grid>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: "#334155", marginBottom: 10 }}>PREGLED PARAMETARA</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                        {paramRows.map((r, i) => <React.Fragment key={i}>
                            <div style={{ padding: "8px 10px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 11, fontWeight: 950, color: "#334155" }}>{r[0]}</div>
                            <div style={{ gridColumn: "span 2", padding: "8px 10px", borderBottom: "1px solid #e2e8f0", fontSize: 11, fontWeight: 800, color: "#0f172a" }}>{r[1]}</div>
                        </React.Fragment>)}
                    </div>
                </div>
            </div>
        </Section>
        <Section title="Dodatne informacije" color={GREEN}>
            <Grid cols={4}>
                <Select label="Tip namotavanja" value={spulna.smer || "Gap winding"} onChange={v => update("spulna.smer", v)} options={["Gap winding", "Overlapped winding"]} />
                <Select label="Smer namotavanja" value={spulna.smerNamotavanja || "Levo"} onChange={v => update("spulna.smerNamotavanja", v)} options={["Levo", "Desno"]} />
                <Input label="Težina bruto (kg)" value={spulna.tezinaBruto || "25.50"} onChange={v => update("spulna.tezinaBruto", v)} />
                <Input label="Napomena" value={spulna.napomena || "Standardna špulna za OPP foliju."} onChange={v => update("spulna.napomena", v)} />
            </Grid>
        </Section>
    </>;
}


function SmartFolijaTemplateEngine({ form, update }) {
    const rez = form.folija?.rezanje || {};
    const ideal = form.idealnaSirinaMaterijala || rez.sirinaMaterijala || "";
    const smart = izracunajRezanjeTemplate(rez, ideal);
    const valjak = smart.predlogValjka;
    const valjakDiff = valjak ? nnum(ideal) - valjak : 0;
    const chip = (label, value, color = BLUE) => <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderLeft: `5px solid ${color}`, borderRadius: 12, padding: "10px 12px" }}>
        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 950, textTransform: "uppercase", letterSpacing: .35 }}>{label}</div>
        <div style={{ fontSize: 17, color, fontWeight: 950, marginTop: 3 }}>{value}</div>
    </div>;
    const segs = [];
    if (smart.ukupniOtpad > 0 && !smart.prekoSirine) segs.push({ label: `OTPAD ${smart.otpadLevo.toFixed(1)}`, w: smart.otpadLevo, waste: true });
    smart.trake.forEach((t, i) => segs.push({ label: `${t} mm`, w: t, idx: i }));
    if (smart.ukupniOtpad > 0 && !smart.prekoSirine) segs.push({ label: `OTPAD ${smart.otpadDesno.toFixed(1)}`, w: smart.otpadDesno, waste: true });
    const total = Math.max(smart.stvarnaSirina, smart.ukupnoTrake, 1);
    return <Section title="SMART TEMPLATE ENGINE — auto rezanje / valjak / analiza" color={GREEN}>
        <div style={{ display: "grid", gridTemplateColumns: "1.25fr .75fr", gap: 14, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
                    <div>
                        <label style={labelStyle()}>Idealna širina mat. (mm)</label>
                        <input readOnly style={{ ...fieldStyle(), background: "#eff6ff", color: "#2446b8", fontWeight: 900 }}
                            value={form.idealnaSirinaMaterijala || ideal || ""} placeholder="unesi gore ↑" />
                    </div>
                    <div>
                        <label style={labelStyle()}>Širina materijala / rola</label>
                        <input style={{ ...fieldStyle(), background: "#eff6ff", color: "#2446b8" }}
                            value={rez.sirinaMaterijala || form.idealnaSirinaMaterijala || ""}
                            onChange={e => update("folija.rezanje.sirinaMaterijala", e.target.value)} />
                    </div>
                    <div>
                        <label style={labelStyle()}>Širina trake</label>
                        <input style={{ ...fieldStyle(), background: (rez.sirinaTrake || form.dimenzijaSirina) ? "#eff6ff" : "#fff", color: "#2446b8" }}
                            value={rez.sirinaTrake || form.dimenzijaSirina || ""}
                            onChange={e => update("folija.rezanje.sirinaTrake", e.target.value)} />
                    </div>
                    <div>
                        <label style={labelStyle()}>Broj traka</label>
                        <input style={fieldStyle()} value={rez.brojTraka || ""}
                            onChange={e => update("folija.rezanje.brojTraka", e.target.value)} placeholder="npr. 4" />
                    </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
                    {chip("Ukupno trake", `${smart.ukupnoTrake.toFixed(1)} mm`, BLUE)}
                    {chip("Otpad ukupno", smart.prekoSirine ? `PREKO ${(smart.ukupnoTrake-smart.stvarnaSirina).toFixed(1)} mm` : `${smart.ukupniOtpad.toFixed(1)} mm`, smart.prekoSirine ? RED : ORANGE)}
                    {chip("Iskorišćenje", `${smart.iskoriscenje.toFixed(1)}%`, smart.prekoSirine ? RED : GREEN)}
                    {chip("Predlog valjka", valjak ? `${valjak} mm` : "nema", valjak ? GREEN : RED)}
                </div>
                <div style={{ border: "1px solid #dbe3ef", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
                    <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontWeight: 950, color: "#334155", fontSize: 12 }}>
                        <span>Auto grafički prikaz rezanja</span>
                        <span>Materijal {smart.stvarnaSirina || "—"} mm</span>
                    </div>
                    <div style={{ display: "flex", minHeight: 76, alignItems: "stretch" }}>
                        {segs.length ? segs.map((seg, i) => <div key={i} style={{ flex: `${Math.max(seg.w, 8)} 1 0`, minWidth: seg.w < 18 ? 34 : 54, display: "flex", alignItems: "center", justifyContent: "center", borderRight: i === segs.length-1 ? "none" : "1px solid #cbd5e1", background: seg.waste ? "#fee2e2" : "#dbeafe", color: seg.waste ? RED : BLUE, fontSize: 11, fontWeight: 950, textAlign: "center", padding: 4 }}>{seg.label}</div>) : <div style={{ padding: 18, color: "#64748b", fontWeight: 800 }}>Unesi širinu materijala, širinu trake i broj traka.</div>}
                    </div>
                    <div style={{ padding: "8px 12px", background: smart.prekoSirine ? "#fef2f2" : "#f8fafc", color: smart.prekoSirine ? RED : "#475569", fontSize: 12, fontWeight: 850 }}>
                        {smart.prekoSirine ? "UPOZORENJE: ukupna širina traka je veća od širine materijala." : `Otpad levo ${smart.otpadLevo.toFixed(1)} mm + trake ${smart.ukupnoTrake.toFixed(1)} mm + otpad desno ${smart.otpadDesno.toFixed(1)} mm`}
                    </div>
                </div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
                <div style={{ ...cardStyle(), borderLeft: `5px solid ${GREEN}` }}>
                    <div style={{ fontWeight: 950, color: GREEN, marginBottom: 8 }}>Predlog valjka za kaširanje</div>
                    <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.8 }}>
                        <b>Pravilo:</b> najveći valjak ≤ idealnoj širini<br />
                        <b>Dostupni valjci:</b> {KASIRANJE_VALJCI_MM.join(", ")} mm<br />
                        <b>Idealna širina:</b> {ideal || "—"} mm<br />
                        <b>Predlog:</b> {valjak ? `${valjak} mm` : "nema odgovarajućeg"}<br />
                        <b>Razlika:</b> {valjak ? `${valjakDiff.toFixed(1)} mm` : "—"}
                    </div>
                </div>
                <div style={{ ...cardStyle(), borderLeft: `5px solid ${BLUE}` }}>
                    <div style={{ fontWeight: 950, color: BLUE, marginBottom: 8 }}>Auto popunjavanje</div>
                    <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.8 }}>
                        • Idealna širina se prenosi u nalog i potrebu materijala.<br />
                        • Broj traka × širina trake popunjava rezanje.<br />
                        • Otpad i iskorišćenje se računaju odmah.<br />
                        • Ovi podaci ulaze u analizu idealnih širina za nabavku.
                    </div>
                </div>
            </div>
        </div>
    </Section>;
}

function ProductTemplateEngineV20({ db, setDb, msg, setPage }) {
    const [form, setForm] = useState(() => clone(defaultForm));
    const [activeTab, setActiveTab] = useState("folija");
    const [nalogModal, setNalogModal] = useState(false);
    const [nalogRolne, setNalogRolne] = useState([]);
    const [nalogIzbor, setNalogIzbor] = useState({});
    const [nalogLoading, setNalogLoading] = useState(false);
    const [nalogSaving, setNalogSaving] = useState(false);
    const [nalogSaved, setNalogSaved] = useState(false);
    const [rucniUnos, setRucniUnos] = useState({});
    const [saved, setSaved] = useState(() => {
        try { return JSON.parse(localStorage.getItem("maropack_product_templates_v25") || localStorage.getItem("maropack_product_templates_v23") || "[]"); } catch { return []; }
    });

    function update(path, value) {
        setForm(prev => {
            const next = clone(prev);
            const parts = path.split(".");
            let ref = next;
            for (let i = 0; i < parts.length - 1; i++) ref = ref[parts[i]];
            ref[parts[parts.length - 1]] = value;
            return next;
        });
    }

    function setType(t) { update("type", t); setActiveTab(t); }

    function addLayer(section) {
        setForm(prev => {
            const next = clone(prev);
            next[section].layers = [...(next[section].layers || []), clone(emptyLayer)];
            return next;
        });
    }
    function updateLayer(section, index, key, value) {
        setForm(prev => {
            const next = clone(prev);
            next[section].layers[index][key] = value;
            return next;
        });
    }
    function removeLayer(section, index) {
        setForm(prev => {
            const next = clone(prev);
            next[section].layers = next[section].layers.filter((_, i) => i !== index);
            return next;
        });
    }

    function toggleKesaOption(key) {
        setForm(prev => {
            const next = clone(prev);
            next.kesa.options[key] = !next.kesa.options[key];
            if (!next.kesa.positions[key]) next.kesa.positions[key] = { odVrha: "", odDna: "", levo: "", desno: "", sirina: "", visina: "", napomena: "" };
            return next;
        });
    }

    const activeData = useMemo(() => form[form.type] || {}, [form]);


    useEffect(() => {
        if (form.type !== "folija") return;
        const ideal = form.idealnaSirinaMaterijala;
        const dimSirina = form.dimenzijaSirina;
        const poruceno = form.porucenaKolicina;
        if (!ideal && !dimSirina && !poruceno) return;
        setForm(prev => {
            const next = clone(prev);
            const r = next.folija.rezanje;
            // idealna sirina -> sirina materijala i slojeva
            if (ideal && !r.sirinaMaterijala) r.sirinaMaterijala = ideal;
            if (ideal) next.folija.layers = (next.folija.layers || []).map(l => ({ ...l, sirina: l.sirina || ideal }));
            // dimenzija sirina -> sirina trake
            if (dimSirina && !r.sirinaTrake) r.sirinaTrake = dimSirina;
            // porucena kolicina -> duzina rolne
            if (poruceno && !r.duzinaRolne) r.duzinaRolne = String(poruceno);
            // auto sirineTraka lista
            const broj = Math.max(0, Math.floor(nnum(r.brojTraka)));
            const traka = nnum(r.sirinaTrake);
            if (broj && traka && (!r.sirineTraka || String(r.sirineTraka).split(",").filter(Boolean).length !== broj)) {
                r.sirineTraka = Array.from({ length: broj }, () => String(traka)).join(",");
            }
            // predlog valjka
            const valjak = predloziValjakKasiranja(ideal);
            if (valjak) r.predlogValjkaKasiranja = String(valjak);
            return next;
        });
    }, [form.type, form.idealnaSirinaMaterijala, form.dimenzijaSirina, form.porucenaKolicina, form.folija?.rezanje?.brojTraka, form.folija?.rezanje?.sirinaTrake]);

    function makeTemplateRecord(sourceForm = form) {
        const sourceActiveData = sourceForm[sourceForm.type] || {};
        const naziv = sourceForm.naziv || sourceActiveData.naziv;
        return {
            id: "TPL-" + Date.now(),
            naziv,
            kupac: sourceForm.kupac,
            tip: sourceForm.type,
            template_version: "V25",
            data: clone(sourceForm),
            created_at: new Date().toISOString()
        };
    }

    // ─── GENERIŠI NALOG ZA MATERIJAL ────────────────────────────
    async function generisiNalogeMaterijal() {
        const layers = (form.type === "folija" ? form.folija?.layers : form.type === "kesa" ? form.kesa?.layers : form.spulna?.layers) || [];
        if (!layers.length) { msg && msg("Unesi bar jedan sloj materijala!", "err"); return; }
        if (!form.idealnaSirinaMaterijala) { msg && msg("Unesi idealnu širinu materijala!", "err"); return; }

        setNalogLoading(true);
        setNalogModal(true);
        setNalogSaved(false);
        setNalogIzbor({});
        setRucniUnos({});

        try {
            // Učitaj sve dostupne rolne iz magacina
            const { data: rolne } = await supabase.from("magacin")
                .select("*")
                .not("status", "in", '("Iskorišćeno","iskoriscena","potrosena")')
                .order("sirina");

            setNalogRolne(rolne || []);

            // Profesionalni algoritam auto-izbora (zaštita od duplikata, FIFO, score)
            const kol = Number(form.porucenaKolicina) || 0;
            const kolPlus = Math.ceil(kol * 1.05);
            const ideal = Number(form.idealnaSirinaMaterijala) || 0;
            const rez = autoIzborSvihSlojeva(layers, rolne || [], ideal, kolPlus);
            setNalogIzbor(rez.izbori || {});
        } catch(e) {
            msg && msg("Greška pri učitavanju magacina: " + e.message, "err");
        }
        setNalogLoading(false);
    }

    async function potvrdiNalogMaterijal() {
        setNalogSaving(true);
        const layers = (form.type === "folija" ? form.folija?.layers : form.type === "kesa" ? form.kesa?.layers : form.spulna?.layers) || [];
        const kol = Number(form.porucenaKolicina) || 0;
        const kolPlus = Math.ceil(kol * 1.05);

        try {
            // Kreiraj izbor data
            const izborData = layers.map((l, i) => {
                const r = nalogIzbor[i];
                return {
                    sloj: i + 1,
                    materijal: l.material || l.materijal || l.tip || "",
                    oznaka: l.oznaka || l.komercijalnaOznaka || "",
                    debljina: l.debljina || l.deb || "",
                    br_rolne: r?.br_rolne || null,
                    rolna_id: r?.id || null,
                    sirina: r?.sirina || null,
                    metraza: r?.metraza_ost || r?.metraza || null,
                    lokacija: r?.palet || r?.lokacija || null,
                    lot: r?.lot || null,
                    rucni: rucniUnos[i] || false,
                };
            });

            // Rezerviši rolne u magacinu
            for (const item of izborData) {
                if (item.rolna_id && !item.rucni) {
                    await supabase.from("magacin")
                        .update({ status: "Rezervisano", rezervisano_za: form.sifra || form.naziv || "" })
                        .eq("id", item.rolna_id);
                }
            }

            // Sačuvaj nalog za materijal u Supabase
            const nalogData = {
                tip_naloga: "materijal",
                tip_proizvoda: form.type,
                naziv: form.naziv || "",
                kupac: form.kupac || "",
                sifra: form.sifra || "",
                porucena_kolicina: kol,
                kolicina_za_rad: kolPlus,
                idealna_sirina: form.idealnaSirinaMaterijala || "",
                template: JSON.stringify(form),
                izabrane_rolne: JSON.stringify(izborData),
                status: "ceka_magacin",
                datum: new Date().toLocaleDateString("sr-RS"),
                created_at: new Date().toISOString(),
            };

            await supabase.from("nalozi_materijal").insert([nalogData]);
            setNalogSaved(true);
            msg && msg("✅ Nalog za materijal kreiran i poslat magacioneru!");
        } catch(e) {
            msg && msg("Greška: " + e.message, "err");
        }
        setNalogSaving(false);
    }
    // ────────────────────────────────────────────────────────

    async function saveTemplate() {
        const record = makeTemplateRecord();
        if (!record.naziv) { msg && msg("Unesi naziv proizvoda", "err"); return; }
        const list = [record, ...saved.filter(x => x.id !== record.id)];
        setSaved(list);
        localStorage.setItem("maropack_product_templates_v25", JSON.stringify(list));
        if (setDb) setDb(prev => ({ ...prev, proizvodi: [record, ...(prev?.proizvodi || [])] }));
        try {
            await supabase.from("proizvodi").insert([{ naziv: record.naziv, kupac: record.kupac, tip: record.tip, template: record.data, datum: new Date().toLocaleDateString("sr-RS") }]);
        } catch (e) {
            // lokalni fallback je namerno uključen zbog RLS/dev okruženja
        }
        msg && msg("Product template sačuvan (V26)");
    }

    function templateToCalculation(record) {
        const tpl = record?.data || form;
        const tip = record?.tip || tpl.type;
        const section = tpl[tip] || {};
        const naziv = record?.naziv || tpl.naziv || section.naziv || "Novi proizvod";
        const layers = section.layers || tpl.folija?.layers || [];
        const kolicina = tip === "kesa" ? Number(section.kolicina || 0) : tip === "spulna" ? Number(section.maxMetara || 0) : Number(section?.rezanje?.duzinaRolne || 0);
        return {
            id: "KAL-TPL-" + Date.now(),
            created_at: new Date().toISOString(),
            datum: new Date().toLocaleDateString("sr-RS"),
            tip,
            naziv,
            klijent: tpl.kupac || record?.kupac || "",
            kupac: tpl.kupac || record?.kupac || "",
            kolicina,
            status: "Draft iz template-a",
            verzija: 1,
            source_template_id: record?.id || null,
            materijali: layers,
            mats: layers,
            osnovna_cena: 0,
            konacna_cena: 0,
            data: clone(tpl),
            template: clone(tpl),
            // ✅ V26: podaci za direktno punjenje pravog kalkulatora
            kalkulator_prefill: clone(tpl),
            napomena: "Kalkulacija kreirana iz Product Template Engine V26 — materijali i dimenzije se direktno mapiraju u kalkulator"
        };
    }

    function createCalculationFromTemplate(record = null) {
        const sourceRecord = record || makeTemplateRecord();
        if (!sourceRecord.naziv) { msg && msg("Unesi naziv proizvoda pre kalkulacije", "err"); return; }
        const kal = templateToCalculation(sourceRecord);
        const existing = JSON.parse(localStorage.getItem("maropack_template_kalkulacije") || "[]");
        localStorage.setItem("maropack_template_kalkulacije", JSON.stringify([kal, ...existing]));
        localStorage.setItem("maropack_pending_template_calculation", JSON.stringify(kal));
        if (setDb) setDb(prev => ({ ...prev, kalkulacije: [kal, ...(prev?.kalkulacije || [])] }));
        // ✅ V26: odmah otvori pravi kalkulator i popuni ga template podacima
        const targetPage = kal.tip === "folija" ? "kalk_folija" : kal.tip === "kesa" ? "kalk_kesa" : "kalk_spulna";
        msg && msg("Kalkulacija otvorena iz template-a — podaci su preneti u kalkulator");
        setPage && setPage(targetPage);
    }

    function createOfferDraft(record = null) {
        const sourceForm = record?.data || form;
        const sourceActiveData = sourceForm[sourceForm.type] || {};
        const naziv = record?.naziv || sourceForm.naziv || sourceActiveData.naziv || "Novi proizvod";
        const ponuda = {
            id: "PON-TPL-" + Date.now(), broj: "PON-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 9000 + 1000),
            datum: new Date().toLocaleDateString("sr-RS"), kupac: sourceForm.kupac || record?.kupac || "", naziv, tip: sourceForm.type, status: "Draft iz template-a", template: clone(sourceForm),
            kol: sourceForm.type === "kesa" ? sourceForm.kesa.kolicina : sourceForm.type === "spulna" ? sourceForm.spulna.maxMetara : sourceForm.folija.rezanje.duzinaRolne,
            nap: "Kreirano iz Product Template Engine V25"
        };
        const existing = JSON.parse(localStorage.getItem("maropack_template_ponude") || "[]");
        localStorage.setItem("maropack_template_ponude", JSON.stringify([ponuda, ...existing]));
        msg && msg("Draft ponuda kreirana iz template-a");
        setPage && setPage("ponude");
    }

    function aiPrompt() {
        const naziv = form.naziv || activeData.naziv || "proizvod";
        const prompt = `Napravi kalkulaciju, ponudu i master nalog za ${naziv}. Tip: ${form.type}. Kupac: ${form.kupac || "nije definisan"}. Koristi V21 product template: materijali, KPDF/perforacija, finalna rolna/crtež kese/špulna dimenzije.`;
        localStorage.setItem("maropack_ai_prefill_prompt", prompt);
        msg && msg("AI prompt pripremljen");
        setPage && setPage("ai_workflow");
    }

    return <div style={{ padding: 18, background: "#f1f5f9", minHeight: "100vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
                <h2 style={{ margin: 0, fontSize: 24, color: "#0f172a", fontWeight: 950 }}>📦 Product Template Engine PRO V26</h2>
                <div style={{ color: "#64748b", fontSize: 13 }}>Centralna baza proizvoda za folije, kese i špulne — V26 Real Template Mapping → Kalkulacija → Ponuda → Master nalog — kalkulacija, ponuda, nalozi, QC i AI koriste isti template.</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={generisiNalogeMaterijal} style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 900, cursor: "pointer" }}>⚡ Generiši nalog materijala</button>
                <button onClick={saveTemplate} style={{ background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 900, cursor: "pointer" }}>💾 Sačuvaj template</button>
                <button onClick={createOfferDraft} style={{ background: BLUE, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 900, cursor: "pointer" }}>📄 Ponuda iz template-a</button>
                <button onClick={aiPrompt} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 900, cursor: "pointer" }}>🤖 AI Workflow</button>
            </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <ToggleButton active={form.type === "folija"} onClick={() => setType("folija")}>🎞️ Folija template</ToggleButton>
            <ToggleButton active={form.type === "kesa"} onClick={() => setType("kesa")}>🛍️ Kesa template + crtež</ToggleButton>
            <ToggleButton active={form.type === "spulna"} onClick={() => setType("spulna")}>🧵 Špulna template</ToggleButton>
        </div>

        <Section title="Osnovni podaci narudžbe" color={GREEN}>
            {/* Red 1 — Identifikacija */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
                <Input label="Šifra proizvoda" value={form.sifra} onChange={v => update("sifra", v)} placeholder="interni kod" />
                <Input label="Kupac" value={form.kupac} onChange={v => update("kupac", v)} placeholder="npr. Medomix" />
                <Input label="Naziv proizvoda" value={form.naziv} onChange={v => update("naziv", v)} placeholder="npr. MPML Crux Magnezijum 3g" />
                <Select label="Tip proizvoda" value={form.type} onChange={setType} options={["folija", "kesa", "spulna"]} />
            </div>
            {/* Red 2 — Količina + dimenzije */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
                <div>
                    <label style={labelStyle()}>Poručena količina (m)</label>
                    <input type="number" value={form.porucenaKolicina || ""} placeholder="npr. 50000"
                        onChange={e => update("porucenaKolicina", e.target.value)} style={fieldStyle()} />
                </div>
                <div>
                    <label style={labelStyle()}>+5% uvećana količina (auto)</label>
                    <input readOnly value={form.porucenaKolicina ? Math.ceil(Number(form.porucenaKolicina) * 1.05).toLocaleString("sr-RS") : "—"}
                        style={{ ...fieldStyle(), background: "#f0fdf4", color: "#059669", fontWeight: 900, cursor: "default" }} />
                </div>
                <div>
                    <label style={labelStyle()}>Dimenzija — širina (mm)</label>
                    <input type="number" value={form.dimenzijaSirina || ""} placeholder="npr. 85"
                        onChange={e => update("dimenzijaSirina", e.target.value)} style={fieldStyle()} />
                </div>
                <div>
                    <label style={labelStyle()}>Dimenzija — dužina (mm)</label>
                    <input type="number" value={form.dimenzijaDuzina || ""} placeholder="npr. 110"
                        onChange={e => update("dimenzijaDuzina", e.target.value)} style={fieldStyle()} />
                </div>
            </div>
            {/* Red 3 — Materijal + napomena */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12, marginBottom: 12 }}>
                <Input label="Idealna širina materijala (mm)" value={form.idealnaSirinaMaterijala}
                    onChange={v => update("idealnaSirinaMaterijala", v)} placeholder="npr. 750" />
                <Input label="Napomena" value={form.napomena || ""} onChange={v => update("napomena", v)} placeholder="interna napomena..." />
            </div>
            {/* AUTO KALKULACIJA — pojavljuje se čim ima podataka */}
            {(() => {
                const kol = Math.ceil(Number(form.porucenaKolicina || 0) * 1.05);
                const layers = form.type === "folija" ? (form.folija?.layers || []) : form.type === "kesa" ? (form.kesa?.layers || []) : (form.spulna?.layers || []);
                const validLayers = layers.filter(l => Number(l.gm2 || l.tezina || l.tezinaGm2 || 0) > 0);
                if (!kol || !validLayers.length) return null;
                const totalGm2 = validLayers.reduce((a, l) => a + Number(l.gm2 || l.tezina || l.tezinaGm2 || 0), 0);
                const sirinaM = Number(form.dimenzijaSirina || form.idealnaSirinaMaterijala || form.folija?.rezanje?.sirinaMaterijala || 0) / 1000;
                const kgUkupno = sirinaM > 0 ? (totalGm2 * sirinaM * kol / 1000).toFixed(1) : null;
                return (
                    <div style={{ background: "#f0fdf4", border: "1px solid #059669", borderRadius: 12, padding: "14px 16px", marginTop: 4 }}>
                        <div style={{ fontWeight: 950, color: "#059669", fontSize: 13, marginBottom: 10 }}>📊 Auto kalkulacija — materijal potreban za narudžbu</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 10, marginBottom: validLayers.length > 0 ? 10 : 0 }}>
                            <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Poručeno</div>
                                <div style={{ fontSize: 16, fontWeight: 950, color: "#2446b8" }}>{Number(form.porucenaKolicina||0).toLocaleString("sr-RS")} m</div>
                            </div>
                            <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>+5% za rad</div>
                                <div style={{ fontSize: 16, fontWeight: 950, color: "#059669" }}>{kol.toLocaleString("sr-RS")} m</div>
                            </div>
                            <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Ukupno g/m²</div>
                                <div style={{ fontSize: 16, fontWeight: 950, color: "#2446b8" }}>{totalGm2.toFixed(1)} g/m²</div>
                            </div>
                            {sirinaM > 0 && <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Širina mat.</div>
                                <div style={{ fontSize: 16, fontWeight: 950, color: "#2446b8" }}>{(sirinaM*1000).toFixed(0)} mm</div>
                            </div>}
                            {kgUkupno && <div style={{ background: "#fff", border: "1px solid #86efac", borderLeft: "5px solid #059669", borderRadius: 10, padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, color: "#064e3b", fontWeight: 900, textTransform: "uppercase" }}>UKUPNO KG</div>
                                <div style={{ fontSize: 20, fontWeight: 950, color: "#059669" }}>{Number(kgUkupno).toLocaleString("sr-RS")} kg</div>
                            </div>}
                        </div>
                        {validLayers.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {validLayers.map((l, i) => {
                                const gm2 = Number(l.gm2 || l.tezina || l.tezinaGm2 || 0);
                                const kgSloj = sirinaM > 0 ? (gm2 * sirinaM * kol / 1000).toFixed(1) : null;
                                return <div key={i} style={{ background: "#fff", border: "1px solid #d1fae5", borderRadius: 8, padding: "7px 12px", fontSize: 12 }}>
                                    <span style={{ fontWeight: 950 }}>{l.material || l.materijal || l.nazivMaterijala || `Sloj ${i+1}`}</span>
                                    <span style={{ color: "#64748b", marginLeft: 8 }}>{gm2} g/m²</span>
                                    {kgSloj && <span style={{ color: "#059669", fontWeight: 900, marginLeft: 8 }}>→ {kgSloj} kg</span>}
                                    <span style={{ color: "#2446b8", fontWeight: 900, marginLeft: 8 }}>/ {kol.toLocaleString("sr-RS")} m</span>
                                </div>;
                            })}
                        </div>}
                    </div>
                );
            })()}
        </Section>

        {form.type === "folija" && (
            <>
                <Section title="Folija — slojevi i materijali" color={BLUE}>
                    <MaterialLayersOneRowTable
                        title="MATERIJALI FOLIJE"
                        layers={form.folija.layers || []}
                        showKg
                        showMetara
                        showCena
                        idealnaSirina={form.idealnaSirinaMaterijala || form.folija?.rezanje?.sirinaMaterijala || ""}
                        porucenaKolicina={form.porucenaKolicina || ""}
                        onAdd={() => addLayer("folija")}
                        onRemove={(i) => removeLayer("folija", i)}
                        onPatch={(i, patch) => {
                            Object.entries(patch).forEach(([key, value]) => updateLayer("folija", i, key, value));
                        }}
                    />
                </Section>

                <Section title="Parametri štampanja" color={BLUE}>
                    <Grid cols={4}>
                        {Object.keys(form.folija.stampa).map(k => (
                            <Input key={k} label={k} value={form.folija.stampa[k]} onChange={v => update(`folija.stampa.${k}`, v)} />
                        ))}
                    </Grid>
                </Section>

                <Section title="Parametri kaširanja / laminiranja" color={BLUE}>
                    <Grid cols={3}>
                        {Object.keys(form.folija.kasiranje).map(k => (
                            <Input key={k} label={k} value={form.folija.kasiranje[k]} onChange={v => update(`folija.kasiranje.${k}`, v)} />
                        ))}
                        <Input label="Predlog valjka za kaširanje" value={form.folija.rezanje.predlogValjkaKasiranja || predloziValjakKasiranja(form.idealnaSirinaMaterijala) || ""} onChange={v => update("folija.rezanje.predlogValjkaKasiranja", v)} />
                    </Grid>
                </Section>

                <Section title="Rezanje i finalna rolna" color={BLUE}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 14 }}>
                        <div>
                            <label style={labelStyle()}>Širina materijala (mm)</label>
                            <input style={{ ...fieldStyle(), background: "#eff6ff", color: "#2446b8", fontWeight: 900 }}
                                value={form.folija.rezanje.sirinaMaterijala || form.idealnaSirinaMaterijala || ""}
                                onChange={e => update("folija.rezanje.sirinaMaterijala", e.target.value)} placeholder="auto iz idealne širine" />
                        </div>
                        <div>
                            <label style={labelStyle()}>Širina trake (mm)</label>
                            <input style={{ ...fieldStyle(), background: form.folija.rezanje.sirinaTrake ? "#fff" : "#eff6ff", color: "#2446b8" }}
                                value={form.folija.rezanje.sirinaTrake || form.dimenzijaSirina || ""}
                                onChange={e => update("folija.rezanje.sirinaTrake", e.target.value)} placeholder="auto iz dim. širine" />
                        </div>
                        <div>
                            <label style={labelStyle()}>Broj traka</label>
                            <input style={fieldStyle()} value={form.folija.rezanje.brojTraka || ""}
                                onChange={e => update("folija.rezanje.brojTraka", e.target.value)} placeholder="npr. 8" />
                        </div>
                        <div>
                            <label style={labelStyle()}>Dužina rolne (m)</label>
                            <input style={{ ...fieldStyle(), background: form.folija.rezanje.duzinaRolne ? "#fff" : "#eff6ff", color: "#2446b8" }}
                                value={form.folija.rezanje.duzinaRolne || form.porucenaKolicina || ""}
                                onChange={e => update("folija.rezanje.duzinaRolne", e.target.value)} placeholder="auto iz poručene kol." />
                        </div>
                        <div>
                            <label style={labelStyle()}>Prečnik rolne (mm)</label>
                            <input style={fieldStyle()} value={form.folija.rezanje.precnikRolne || ""}
                                onChange={e => update("folija.rezanje.precnikRolne", e.target.value)} placeholder="npr. 400" />
                        </div>
                        <div>
                            <label style={labelStyle()}>Dorada</label>
                            <input style={fieldStyle()} value={form.folija.rezanje.dorada || ""}
                                onChange={e => update("folija.rezanje.dorada", e.target.value)} />
                        </div>
                        <div>
                            <label style={labelStyle()}>Smer GP</label>
                            <input style={fieldStyle()} value={form.folija.rezanje.smerGP || ""}
                                onChange={e => update("folija.rezanje.smerGP", e.target.value)} />
                        </div>
                        <div>
                            <label style={labelStyle()}>Širine traka — lista (mm)</label>
                            <input style={fieldStyle()} value={form.folija.rezanje.sirineTraka || ""}
                                onChange={e => update("folija.rezanje.sirineTraka", e.target.value)} placeholder="npr. 85,85,85,85" />
                        </div>
                        <div>
                            <label style={labelStyle()}>Predlog valjka kaširanja</label>
                            <input readOnly style={{ ...fieldStyle(), background: "#f0fdf4", color: "#059669", fontWeight: 900 }}
                                value={form.folija.rezanje.predlogValjkaKasiranja || predloziValjakKasiranja(form.idealnaSirinaMaterijala) || "auto"} />
                        </div>
                    </div>
                    <div style={{ marginTop: 4 }}>
                        <RollPreview folija={form.folija} />
                    </div>
                    <TemplateMptpPanel
                        folija={form.folija}
                        onPatch={(patch) => Object.entries(patch).forEach(([key, value]) => update(`folija.kpdf.${key}`, value))}
                    />
                </Section>

                <SmartFolijaTemplateEngine form={form} update={update} />

                <FolijaCadEngine folija={form.folija} />

                <Section title="KPDF / perforacija" color={ORANGE}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 900, marginBottom: 12 }}>
                        <input
                            type="checkbox"
                            checked={!!form.folija.kpdf.enabled}
                            onChange={() => update("folija.kpdf.enabled", !form.folija.kpdf.enabled)}
                        />
                        Ima KPDF / perforaciju
                    </label>
                    <Grid cols={4}>
                        {Object.keys(form.folija.kpdf).filter(k => !["enabled", "mptpFileUrl", "mptpFileName", "mptpFileType", "mptpImageUrl", "mptpImageName", "mptpImageType", "mptpPdfUrl", "mptpPdfName", "kpdfPdfUrl", "pdfUrl", "previewUrl", "mptpUploadedAt", "mptpPdfType"].includes(k)).map(k => (
                            <Input key={k} label={k} value={form.folija.kpdf[k]} onChange={v => update(`folija.kpdf.${k}`, v)} />
                        ))}
                    </Grid>
                </Section>
            </>
        )}

        {form.type === "kesa" && (
            <>
                <Section title="Kesa — osnovni podaci" color={GREEN}>
                    <Grid cols={4}>
                        {["naziv", "kolicina", "skart", "datum", "marza"].map(k => (
                            <Input key={k} label={k} value={form.kesa[k]} onChange={v => update(`kesa.${k}`, v)} />
                        ))}
                    </Grid>
                </Section>

                <Section title="Dimenzije i konstrukcija kese" color={BLUE}>
                    <Grid cols={4}>
                        <Select label="Tip kese" value={form.kesa.tipKese || "ravna"} onChange={v => update("kesa.tipKese", v)} options={["ravna", "doypack", "side_gusset", "stabilo", "courier", "vakuum"]} />
                        {["sirina", "duzina", "klapna", "falta", "takt", "ban", "tolerancija", "grafika"].map(k => (
                            <Input key={k} label={k} value={form.kesa[k]} onChange={v => update(`kesa.${k}`, v)} />
                        ))}
                    </Grid>
                </Section>

                <Section title="Materijali kese" color={GREEN}>
                    <MaterialLayersOneRowTable
                        title="MATERIJALI KESE"
                        layers={form.kesa.layers || []}
                        showCena
                        onAdd={() => addLayer("kesa")}
                        onRemove={(i) => removeLayer("kesa", i)}
                        onPatch={(i, patch) => {
                            Object.entries(patch).forEach(([key, value]) => updateLayer("kesa", i, key, value));
                        }}
                    />
                </Section>

                <Section title="Tehničke opcije kese — operacije se odmah vide na crtežu" color={ORANGE}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                        {kesaOptions.map(opt => (
                            <label
                                key={opt.key}
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "9px 10px",
                                    border: "1px solid #dbe3ef",
                                    borderRadius: 8,
                                    background: form.kesa.options[opt.key] ? "#ecfdf5" : "#fff",
                                    fontWeight: 800,
                                    color: "#334155"
                                }}
                            >
                                <span>
                                    <input type="checkbox" checked={!!form.kesa.options[opt.key]} onChange={() => toggleKesaOption(opt.key)} /> {opt.label}
                                </span>
                                <span style={{ color: GREEN, fontSize: 11 }}>{opt.price}</span>
                            </label>
                        ))}
                    </div>

                    <div style={{ marginTop: 12 }}>
                        <Grid cols={3}>
                            {Object.keys(form.kesa.options || {}).filter(k => form.kesa.options[k]).slice(0, 6).map(k => (
                                <Input
                                    key={k}
                                    label={`${k} pozicija/napomena`}
                                    value={(form.kesa.positions[k] || {}).napomena || ""}
                                    onChange={v => setForm(prev => {
                                        const n = clone(prev);
                                        n.kesa.positions[k] = { ...(n.kesa.positions[k] || {}), napomena: v };
                                        return n;
                                    })}
                                />
                            ))}
                        </Grid>
                    </div>
                </Section>

                <BagDrawing kesa={form.kesa} />

                <Section title="Transport i pakovanje" color={GREEN}>
                    <Grid cols={3}>
                        <Input label="Cena transporta €/kg" value={form.kesa.transportKg} onChange={v => update("kesa.transportKg", v)} />
                        <Input label="Pakovanje" value={form.kesa.pakovanje} onChange={v => update("kesa.pakovanje", v)} />
                        <Input label="Napomena" value={form.napomena} onChange={v => update("napomena", v)} />
                    </Grid>
                </Section>
            </>
        )}

        {form.type === "spulna" && <>
            <Section title="Špulna — osnovni podaci" color="#7c3aed">
                <Grid cols={2}>
                    <Input label="Naziv" value={form.spulna.naziv} onChange={v => update("spulna.naziv", v)} placeholder="npr. Trake 25mm - 8000m" />
                    <Input label="Materijal / opis" value={form.spulna.materijal} onChange={v => update("spulna.materijal", v)} placeholder="npr. Papir silikonizirani 60gr" />
                </Grid>
            </Section>
            <Section title="Materijali špulne" color="#7c3aed">
                <MaterialLayersOneRowTable
                    title="MATERIJALI ŠPULNE"
                    layers={form.spulna.layers || []}
                    showCena
                    onAdd={() => addLayer("spulna")}
                    onRemove={(i) => removeLayer("spulna", i)}
                    onPatch={(i, patch) => {
                        Object.entries(patch).forEach(([key, value]) => updateLayer("spulna", i, key, value));
                    }}
                />
            </Section>
            <SpoolDrawing spulna={form.spulna} update={update} />
        </>}

        <Section title="📚 Biblioteka sačuvanih template-a" color="#0f172a">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
                <div style={{ ...cardStyle(), padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>Ukupno</div><div style={{ fontSize: 24, fontWeight: 950 }}>{saved.length}</div></div>
                <div style={{ ...cardStyle(), padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>Folije</div><div style={{ fontSize: 24, fontWeight: 950, color: BLUE }}>{saved.filter(t => t.tip === "folija").length}</div></div>
                <div style={{ ...cardStyle(), padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>Kese</div><div style={{ fontSize: 24, fontWeight: 950, color: ORANGE }}>{saved.filter(t => t.tip === "kesa").length}</div></div>
                <div style={{ ...cardStyle(), padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>Špulne</div><div style={{ fontSize: 24, fontWeight: 950, color: "#7c3aed" }}>{saved.filter(t => t.tip === "spulna").length}</div></div>
            </div>
            {saved.length === 0 ? <div style={{ color: "#64748b" }}>Još nema sačuvanih V26 template-a. Popuni foliju/kesu/špulnu i klikni „Sačuvaj template”.</div> : <div style={{ display: "grid", gap: 10 }}>
                {saved.map(t => <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "#fff" }}>
                    <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <b style={{ fontSize: 15 }}>{t.naziv}</b>
                            <span style={{ borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 900, background: t.tip === "folija" ? "#eef2ff" : t.tip === "kesa" ? "#fff7ed" : "#f5f3ff", color: t.tip === "folija" ? BLUE : t.tip === "kesa" ? "#c2410c" : "#7c3aed" }}>{t.tip}</span>
                            <span style={{ color: "#64748b", fontSize: 12 }}>{t.kupac || "bez kupca"}</span>
                        </div>
                        <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>ID: {t.id} · verzija: {t.template_version || "V26"} · sačuvano: {t.created_at ? new Date(t.created_at).toLocaleDateString("sr-RS") : "—"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button onClick={() => { setForm(clone(t.data)); setActiveTab(t.tip); msg && msg("Template učitan"); }} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 800, cursor: "pointer" }}>📝 Otvori</button>
                        <button onClick={() => createCalculationFromTemplate(t)} style={{ border: "none", background: GREEN, color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 900, cursor: "pointer" }}>🧮 Kreiraj kalkulaciju</button>
                        <button onClick={() => createOfferDraft(t)} style={{ border: "none", background: BLUE, color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 900, cursor: "pointer" }}>📄 Kreiraj ponudu</button>
                        <button onClick={() => { const next = saved.filter(x => x.id !== t.id); setSaved(next); localStorage.setItem("maropack_product_templates_v25", JSON.stringify(next)); msg && msg("Template obrisan"); }} style={{ border: "none", background: RED, color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 900, cursor: "pointer" }}>🗑️</button>
                    </div>
                </div>)}
            </div>}
        </Section>

        {/* ════ MODAL ZA NALOG MATERIJALA ════ */}
        {nalogModal && (() => {
            const layers = (form.type === "folija" ? form.folija?.layers : form.type === "kesa" ? form.kesa?.layers : form.spulna?.layers) || [];
            const kol = Number(form.porucenaKolicina) || 0;
            const kolPlus = Math.ceil(kol * 1.05);
            const sir = Number(form.idealnaSirinaMaterijala) || 0;
            const sirinaM = sir / 1000;
            const COLORS_M = ["#2446b8","#059669","#d97706","#7c3aed","#dc2626"];
            const ROLES_M = ["Spoljašnji / štampa","Srednji sloj","Unutrašnji / var","Sloj 4","Sloj 5"];

            function num(v){ return Number(String(v||"").replace(",","."))||0; }
            function fmt(n){ return n ? Number(n).toLocaleString("sr-RS") : "—"; }
            function val(v){ return (v===undefined||v===null||v==="") ? "—" : v; }

            function kandidatiZaSloj(layer) {
                const base = String(layer.material||layer.materijal||layer.tip||"").split(" ")[0].toUpperCase();
                const deb = num(layer.debljina||layer.deb);
                return nalogRolne.filter(r => {
                    const okT = r.tip && String(r.tip).toUpperCase().startsWith(base);
                    const okD = !deb || !r.deb || Math.abs(num(r.deb)-deb) <= 3;
                    return okT && okD;
                });
            }

            const sviIzabrani = layers.every((_,i) => rucniUnos[i] || !!nalogIzbor[i]);

            return (
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
                    <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:860, maxHeight:"90vh", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 24px 64px rgba(0,0,0,.25)" }}>

                        {/* Modal header */}
                        <div style={{ background:"linear-gradient(135deg,#0f172a,#1e3a8a)", padding:"18px 22px", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
                            <div>
                                <div style={{ color:"#94a3b8", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, marginBottom:4 }}>Nalog za materijal — izbor rolni</div>
                                <div style={{ color:"#fff", fontSize:20, fontWeight:950 }}>⚡ {form.naziv || "Proizvod"}</div>
                                <div style={{ color:"#64748b", fontSize:11, marginTop:3 }}>
                                    {form.kupac} &nbsp;·&nbsp; Poručeno: <b style={{color:"#4ade80"}}>{fmt(kol)} m</b> &nbsp;·&nbsp; Za rad (+5%): <b style={{color:"#4ade80"}}>{fmt(kolPlus)} m</b> &nbsp;·&nbsp; Idealna širina: <b style={{color:"#60a5fa"}}>{val(sir)} mm</b>
                                </div>
                            </div>
                            <button onClick={()=>setNalogModal(false)} style={{ background:"rgba(255,255,255,.1)", border:"none", color:"#fff", borderRadius:8, width:36, height:36, fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
                        </div>

                        {/* Scrollable body */}
                        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
                            {nalogLoading ? (
                                <div style={{ textAlign:"center", padding:40 }}>
                                    <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
                                    <div style={{ fontWeight:800, color:"#64748b" }}>Učitavam stanje magacina...</div>
                                </div>
                            ) : (
                                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                                    {layers.map((l, i) => {
                                        const rol = nalogIzbor[i];
                                        const opts = kandidatiZaSloj(l);
                                        const g = num(l.gm2||l.tezina||l.tezinaGm2);
                                        const kgTreb = sirinaM > 0 ? (g * sirinaM * kolPlus / 1000).toFixed(1) : "—";
                                        const dovoljna = rol && num(rol.metraza_ost||rol.metraza) >= kolPlus;
                                        const isRucni = rucniUnos[i];
                                        const color = COLORS_M[i] || "#64748b";

                                        return (
                                            <div key={i} style={{ border:`1.5px solid ${isRucni?"#f59e0b":rol?(dovoljna?"#059669":"#f59e0b"):"#dc2626"}`, borderLeft:`4px solid ${color}`, borderRadius:10, overflow:"hidden", background:"#fff" }}>

                                                {/* Sloj header */}
                                                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:color+"08" }}>
                                                    <div style={{ width:30, height:30, borderRadius:"50%", background:color, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:950, fontSize:13, flexShrink:0 }}>{i+1}</div>
                                                    <div style={{ flex:1 }}>
                                                        <div style={{ fontWeight:900, fontSize:13 }}>{val(l.material||l.materijal||l.tip)} {val(l.oznaka||l.komercijalnaOznaka,"")} {val(l.debljina||l.deb)}µ</div>
                                                        <div style={{ fontSize:11, color:"#64748b" }}>{ROLES_M[i]} &nbsp;·&nbsp; Potrebno: <b style={{color:"#dc2626"}}>{kgTreb} kg</b> &nbsp;·&nbsp; {fmt(kolPlus)} m &nbsp;·&nbsp; ~{val(sir)} mm</div>
                                                    </div>
                                                    {/* Toggle ručni unos */}
                                                    <button onClick={()=>setRucniUnos(p=>({...p,[i]:!p[i]}))}
                                                        style={{ border:`1px solid ${isRucni?"#f59e0b":"#e2e8f0"}`, background:isRucni?"#fffbeb":"#fff", color:isRucni?"#d97706":"#64748b", borderRadius:7, padding:"5px 12px", fontWeight:800, fontSize:11, cursor:"pointer" }}>
                                                        {isRucni ? "📝 Ručni unos" : "📝 Ručni unos"}
                                                    </button>
                                                </div>

                                                <div style={{ padding:"12px 14px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                                                    {/* Levo: dropdown ili ručni unos */}
                                                    <div>
                                                        {isRucni ? (
                                                            <div>
                                                                <div style={{ fontSize:10, fontWeight:800, color:"#64748b", textTransform:"uppercase", marginBottom:6 }}>Ručni unos br. rolne</div>
                                                                <input
                                                                    placeholder="Unesi br. rolne ili LOT..."
                                                                    defaultValue={rol?.br_rolne||""}
                                                                    onChange={e => {
                                                                        const val_input = e.target.value;
                                                                        const found = nalogRolne.find(r => String(r.br_rolne||"").toLowerCase() === val_input.toLowerCase());
                                                                        if(found) setNalogIzbor(p=>({...p,[i]:found}));
                                                                        else setNalogIzbor(p=>({...p,[i]:{br_rolne:val_input, sirina:"?", metraza_ost:0, status:"ručno"}}));
                                                                    }}
                                                                    style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #f59e0b", borderRadius:8, fontSize:13, fontFamily:"inherit", outline:"none" }}
                                                                />
                                                                <div style={{ fontSize:10, color:"#92400e", marginTop:5, fontWeight:700 }}>
                                                                    ⚠️ Ručni unos — magacioner će sam pronaći rolnu po broju
                                                                </div>
                                                                {opts.length > 0 && (
                                                                    <button onClick={()=>setRucniUnos(p=>({...p,[i]:false}))} style={{ marginTop:8, background:"none", border:"none", color:"#2446b8", fontWeight:800, fontSize:11, cursor:"pointer", padding:0 }}>
                                                                        ← Ipak izaberi iz liste
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <div style={{ fontSize:10, fontWeight:800, color:"#64748b", textTransform:"uppercase", marginBottom:6 }}>
                                                                    Izaberi rolnu iz magacina ({opts.length} dostupnih)
                                                                </div>
                                                                <select
                                                                    value={rol ? String(rol.id||rol.br_rolne) : ""}
                                                                    onChange={e => {
                                                                        const found = nalogRolne.find(r => String(r.id||r.br_rolne) === e.target.value);
                                                                        setNalogIzbor(p=>({...p,[i]:found||null}));
                                                                    }}
                                                                    style={{ width:"100%", padding:"9px 10px", border:`1.5px solid ${rol?"#d97706":"#dc2626"}`, borderRadius:8, fontSize:12, fontFamily:"inherit", background:"#fff", outline:"none" }}>
                                                                    <option value="">— Izaberi rolnu —</option>
                                                                    {opts.map(r => (
                                                                        <option key={r.id||r.br_rolne} value={String(r.id||r.br_rolne)}>
                                                                            {r.br_rolne} · {r.sirina}mm · {num(r.metraza_ost||r.metraza).toLocaleString("sr-RS")}m · {num(r.kg_neto||r.kg).toFixed(0)}kg · {r.dobavljac||"—"} · LOT:{r.lot||"—"}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                {opts.length === 0 && (
                                                                    <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8 }}>
                                                                        <span style={{ fontSize:11, color:"#dc2626", fontWeight:800 }}>❌ Nema rolni u magacinu</span>
                                                                        <button onClick={()=>setRucniUnos(p=>({...p,[i]:true}))} style={{ background:"none", border:"none", color:"#d97706", fontWeight:800, fontSize:11, cursor:"pointer", textDecoration:"underline" }}>Ručni unos →</button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Desno: info izabrane rolne */}
                                                    {rol && !isRucni ? (
                                                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                                                            {[
                                                                ["Br. rolne", val(rol.br_rolne), "#2446b8"],
                                                                ["Lokacija", val(rol.palet||rol.lokacija), "#d97706"],
                                                                ["Širina", val(rol.sirina)+" mm", "#0f172a"],
                                                                ["Ostalo m", num(rol.metraza_ost||rol.metraza).toLocaleString("sr-RS")+" m", dovoljna?"#059669":"#dc2626"],
                                                                ["Kg neto", num(rol.kg_neto||rol.kg).toFixed(1)+" kg", "#059669"],
                                                                ["LOT", val(rol.lot), "#0f172a"],
                                                            ].map(([l,v,c]) => (
                                                                <div key={l} style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:7, padding:"6px 8px" }}>
                                                                    <div style={{ fontSize:9, color:"#64748b", fontWeight:800, textTransform:"uppercase", marginBottom:2 }}>{l}</div>
                                                                    <div style={{ fontSize:12, fontWeight:900, color:c }}>{v}</div>
                                                                </div>
                                                            ))}
                                                            {!dovoljna && <div style={{ gridColumn:"1/-1", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:7, padding:"5px 8px", fontSize:10, color:"#dc2626", fontWeight:800 }}>
                                                                ⚠️ Nema dovoljno metraže! Ima {num(rol.metraza_ost||rol.metraza).toLocaleString("sr-RS")} m, treba {fmt(kolPlus)} m
                                                            </div>}
                                                        </div>
                                                    ) : isRucni ? (
                                                        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:12, textAlign:"center" }}>
                                                            <div>
                                                                <div style={{ fontSize:18, marginBottom:6 }}>📝</div>
                                                                <div style={{ fontSize:11, fontWeight:800, color:"#92400e" }}>Ručni unos</div>
                                                                <div style={{ fontSize:10, color:"#64748b", marginTop:3 }}>Magacioner pronalazi rolnu po broju</div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:12, textAlign:"center" }}>
                                                            <div>
                                                                <div style={{ fontSize:18, marginBottom:6 }}>❌</div>
                                                                <div style={{ fontSize:11, fontWeight:800, color:"#dc2626" }}>Nije izabrana rolna</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{ borderTop:"1px solid #e2e8f0", padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#f8fafc", flexShrink:0 }}>
                            {nalogSaved ? (
                                <div style={{ display:"flex", alignItems:"center", gap:10, flex:1 }}>
                                    <div style={{ fontSize:22 }}>✅</div>
                                    <div>
                                        <div style={{ fontWeight:900, fontSize:13, color:"#059669" }}>Nalog kreiran i poslat magacioneru!</div>
                                        <div style={{ fontSize:11, color:"#64748b" }}>Rolne su rezervisane u magacinu. Magacioner vidi nalog sa lokacijama i QR kodovima.</div>
                                    </div>
                                    <button onClick={()=>setNalogModal(false)} style={{ marginLeft:"auto", background:"#059669", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", fontWeight:800, fontSize:13, cursor:"pointer" }}>Zatvori</button>
                                </div>
                            ) : (
                                <>
                                    <div style={{ fontSize:12, color:"#64748b" }}>
                                        {sviIzabrani
                                            ? <span style={{color:"#059669",fontWeight:800}}>✓ Svi slojevi pokriveni</span>
                                            : <span style={{color:"#dc2626",fontWeight:800}}>Izaberi rolne za sve slojeve</span>}
                                        &nbsp;·&nbsp; {layers.filter((_,i)=>nalogIzbor[i]||rucniUnos[i]).length} / {layers.length} slojeva
                                    </div>
                                    <div style={{ display:"flex", gap:8 }}>
                                        <button onClick={()=>setNalogModal(false)} style={{ border:"1px solid #e2e8f0", background:"#fff", borderRadius:8, padding:"9px 18px", fontWeight:800, fontSize:13, cursor:"pointer" }}>Otkaži</button>
                                        <button onClick={potvrdiNalogMaterijal} disabled={nalogSaving||!sviIzabrani}
                                            style={{ background:sviIzabrani?"#059669":"#94a3b8", color:"#fff", border:"none", borderRadius:8, padding:"9px 22px", fontWeight:900, fontSize:13, cursor:sviIzabrani?"pointer":"default", opacity:nalogSaving?0.7:1 }}>
                                            {nalogSaving ? "Kreiram nalog..." : "✓ Potvrdi i pošalji magacioneru"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            );
        })()}

    </div>;
}

function Grid({ children, cols = 3 }) {
    return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}>{children}</div>;
}

function Input({ label, value, onChange, type = "text", placeholder = "" }) {
    return <div><label style={labelStyle()}>{label}</label><input type={type} value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={fieldStyle()} /></div>;
}

export default ProductTemplateEngineV20;
