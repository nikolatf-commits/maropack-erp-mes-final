import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Lista proizvoda po kupcima  [v2]
//  Čita proizvode iz Supabase (tabela "proizvodi"), grupiše po kupcu.
//  Slojevi se čitaju iz SAČUVANOG templejta: folija/kesa/spulna .layers,
//  sa PRAVIM poljima (vrsta, pod_vrsta, oznaka_materijala, proizvodjac,
//  debljina, sirina, gm2). Izbačene su prazne kolone "spoj materijala" i
//  "broj spojeva" — tih polja nema u templejtu.
//  Tabele KLIZE unutar svog okvira (overflow-x) umesto da prelaze ivicu.
// ─────────────────────────────────────────────────────────────────────────────

const TIP_BOJA = { folija: "#2563eb", spulna: "#9333ea", spulne: "#9333ea", kesa: "#16a34a", kese: "#16a34a" };
const num = (x) => { const n = parseFloat(String(x ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

// izvuci slojeve iz proizvoda ma kako templejt bio spakovan
function izvuciSlojeve(p) {
    const t = p?.template || p?.templejt || p || {};
    const sekcija = t.folija || t.kesa || t.spulna || t.spulne || {};
    const layers = sekcija.layers || t.layers || p.materijali_struktura || p.mats || [];
    return Array.isArray(layers) ? layers : [];
}
function idealna(p) {
    const t = p?.template || p || {};
    return t.idealnaSirinaMaterijala || (t.folija && t.folija.idealnaSirinaMaterijala) || p.idealnaSirinaMaterijala || "";
}
function tipProizvoda(p) {
    const t = (p?.tip || p?.template?.type || p?.type || "").toLowerCase();
    if (t) return t;
    const tt = p?.template || p || {};
    if (tt.spulna || tt.spulne) return "spulna";
    if (tt.kesa || tt.kese) return "kesa";
    return "folija";
}
// jedan sloj → normalizovana polja
function normSloj(l) {
    return {
        vrsta: l.vrsta || l.material || "—",
        pod_vrsta: l.pod_vrsta || l.podVrsta || "—",
        oznaka: l.oznaka_materijala || l.oznaka || "—",
        proizvodjac: l.proizvodjac || l.proizvođač || l.dobavljac || "—",
        debljina: l.debljina ? l.debljina + "µ" : "—",
        sirina: l.sirina ? l.sirina + " mm" : "—",
        gm2: l.gm2 || (num(l.debljina) && num(l.koeficijent) ? (num(l.debljina) * num(l.koeficijent)).toFixed(1) : "") || "—",
    };
}
// kratke oznake materijala za "pill" u gornjoj tabeli
function materijalPills(layers) {
    return layers.map((l) => {
        const v = l.vrsta || l.material || "";
        const o = l.oznaka_materijala || l.oznaka || "";
        const d = l.debljina ? l.debljina + "µ" : "";
        return [v, o, d].filter(Boolean).join(" ");
    }).filter((x) => x.length);
}

const KOLONE = ["SLOJ", "VRSTA", "POD VRSTA", "OZNAKA", "PROIZVOĐAČ", "DEBLJINA", "ŠIRINA", "g/m²"];

function SlojeviTabela({ layers }) {
    const rows = (layers && layers.length ? layers : []).map(normSloj);
    if (!rows.length) return <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, padding: "8px 2px" }}>Nema unetih slojeva u templejtu.</div>;
    return (
        <div style={{ overflowX: "auto", border: "1px solid #e6ebf2", borderRadius: 10, background: "#fff", WebkitOverflowScrolling: "touch" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560, fontSize: 11.5 }}>
                <thead>
                    <tr>{KOLONE.map((c, i) => (
                        <th key={c} style={{ background: "#f8fafc", color: "#64748b", fontSize: 9.5, textTransform: "uppercase", letterSpacing: .4, fontWeight: 900, textAlign: i === 0 ? "center" : "left", padding: "7px 10px", borderBottom: "1px solid #e6ebf2", whiteSpace: "nowrap" }}>{c}</th>
                    ))}</tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i}>
                            <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "center", fontWeight: 900, color: "#3730a3" }}>{i + 1}</td>
                            <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 900, whiteSpace: "nowrap" }}>{r.vrsta}</td>
                            <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 600, whiteSpace: "nowrap" }}>{r.pod_vrsta}</td>
                            <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, whiteSpace: "nowrap" }}>{r.oznaka}</td>
                            <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 600, whiteSpace: "nowrap" }}>{r.proizvodjac}</td>
                            <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 900, whiteSpace: "nowrap" }}>{r.debljina}</td>
                            <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, whiteSpace: "nowrap" }}>{r.sirina}</td>
                            <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, whiteSpace: "nowrap" }}>{r.gm2}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function KupacKartica({ kupac, proizvodi }) {
    return (
        <div style={{ background: "#fff", border: "1px solid #e6ebf2", borderRadius: 14, overflow: "hidden", boxShadow: "0 8px 22px rgba(15,23,42,.05)" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #eef2f7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 950, fontSize: 15 }}>🏢 {kupac}</div>
                <span style={{ background: "#ecfdf5", color: "#15803d", fontSize: 10, fontWeight: 900, padding: "3px 10px", borderRadius: 999 }}>{proizvodi.length} {proizvodi.length === 1 ? "proizvod" : "proizvoda"}</span>
            </div>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
                {proizvodi.map((p, idx) => {
                    const layers = izvuciSlojeve(p);
                    const tip = tipProizvoda(p);
                    const pills = materijalPills(layers);
                    return (
                        <div key={idx}>
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                                <div>
                                    <div style={{ fontWeight: 900, fontSize: 13.5 }}>{p.naziv || "—"}</div>
                                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 2 }}>
                                        Šifra: {p.sifra || "—"} · Idealna širina: {idealna(p) ? idealna(p) + " mm" : "—"} · Slojeva: {layers.length}
                                    </div>
                                </div>
                                <span style={{ background: (TIP_BOJA[tip] || "#64748b") + "22", color: TIP_BOJA[tip] || "#64748b", fontSize: 9.5, fontWeight: 900, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", textTransform: "uppercase" }}>{tip}</span>
                            </div>
                            {pills.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                                    {pills.map((m, i) => <span key={i} style={{ background: "#f1f5f9", borderRadius: 7, padding: "3px 9px", fontSize: 10.5, fontWeight: 800 }}>{m}</span>)}
                                </div>
                            )}
                            <SlojeviTabela layers={layers} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function ListaProizvodaKupci({ msg }) {
    const [proizvodi, setProizvodi] = useState(null);
    const [greska, setGreska] = useState("");
    const [query, setQuery] = useState("");
    const [prikaz, setPrikaz] = useState("tabela"); // tabela | kartice

    useEffect(() => {
        let ziv = true;
        (async () => {
            try {
                const { data, error } = await supabase.from("proizvodi").select("*").order("id", { ascending: false });
                if (error) throw error;
                if (ziv) setProizvodi(Array.isArray(data) ? data : []);
            } catch (e) {
                if (ziv) { setGreska(e.message || "Greška pri učitavanju"); setProizvodi([]); }
            }
        })();
        return () => { ziv = false; };
    }, []);

    const lista = proizvodi || [];
    const filtrirani = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return lista;
        return lista.filter((p) => {
            const layers = izvuciSlojeve(p);
            const tekst = [p.naziv, p.kupac, p.sifra, tipProizvoda(p), ...materijalPills(layers)].join(" ").toLowerCase();
            return tekst.includes(q);
        });
    }, [lista, query]);

    const poKupcima = useMemo(() => {
        const m = {};
        filtrirani.forEach((p) => { const k = p.kupac || "Bez kupca"; (m[k] = m[k] || []).push(p); });
        return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], "sr"));
    }, [filtrirani]);

    const brKupaca = poKupcima.length;
    const brSlojeva = filtrirani.reduce((a, p) => a + izvuciSlojeve(p).length, 0);
    const brMaterijala = new Set(filtrirani.flatMap((p) => izvuciSlojeve(p).map((l) => (l.vrsta || l.material || "").toUpperCase()).filter(Boolean))).size;

    const wrap = { maxWidth: 1400, margin: "0 auto" };
    const kartica = { background: "#fff", border: "1px solid #e6ebf2", borderRadius: 14, boxShadow: "0 8px 22px rgba(15,23,42,.05)" };

    if (proizvodi === null) return <div style={{ padding: 40, textAlign: "center", color: "#64748b", fontWeight: 700 }}>Učitavam proizvode…</div>;

    return (
        <div style={wrap}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase" }}>Baza / Katalog</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", margin: "2px 0 4px" }}>
                <div style={{ fontSize: 24, fontWeight: 950 }}>📋 Lista proizvoda po kupcima</div>
                <div style={{ display: "flex", gap: 6 }}>
                    {[["tabela", "Tabela"], ["kartice", "Kartice"]].map(([k, l]) =>
                        <button key={k} onClick={() => setPrikaz(k)} style={{ border: "1px solid #cbd5e1", background: prikaz === k ? "#16a34a" : "#fff", color: prikaz === k ? "#fff" : "#334155", borderRadius: 9, padding: "7px 14px", fontWeight: 900, fontSize: 12.5, cursor: "pointer" }}>{l}</button>)}
                </div>
            </div>
            <div style={{ color: "#64748b", fontSize: 12.5, marginBottom: 14 }}>Za svaki proizvod: kupac, vrsta materijala, pod vrsta, oznaka, proizvođač, idealna širina i slojevi laminata.</div>

            {greska && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontWeight: 700 }}>⚠ {greska}</div>}

            {/* KPI */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
                {[["🏷️", "Proizvoda", filtrirani.length, "aktivnih"], ["👥", "Kupaca", brKupaca, "aktivnih"], ["🔗", "Slojeva", brSlojeva, "ukupno"], ["📦", "Materijala", brMaterijala, "ukupno"]].map(([ik, l, v, sub]) =>
                    <div key={l} style={{ ...kartica, padding: "14px 16px" }}>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 900, textTransform: "uppercase" }}>{ik} {l}</div>
                        <div style={{ fontSize: 26, fontWeight: 950, margin: "2px 0" }}>{v}</div>
                        <div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 700 }}>{sub}</div>
                    </div>)}
            </div>

            {/* pretraga */}
            <div style={{ ...kartica, padding: 12, marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 Pretraga: kupac, naziv, šifra, materijal, oznaka, proizvođač…"
                    style={{ flex: 1, minWidth: 240, border: "1px solid #e2e8f0", borderRadius: 10, padding: "11px 14px", fontSize: 14, outline: "none" }} />
                {query && <button onClick={() => setQuery("")} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 10, padding: "10px 16px", fontWeight: 900, cursor: "pointer" }}>Reset</button>}
            </div>

            {/* GORNJA TABELA */}
            {prikaz === "tabela" && (
                <div style={{ ...kartica, overflow: "hidden", marginBottom: 22 }}>
                    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900, fontSize: 12.5 }}>
                            <thead>
                                <tr>{["NAZIV PROIZVODA", "KUPAC", "ŠIFRA", "TIP", "SLOJEVI", "IDEALNA ŠIRINA", "MATERIJALI (SASTAV)"].map((c) =>
                                    <th key={c} style={{ background: "#f8fafc", color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: .4, fontWeight: 900, textAlign: "left", padding: "11px 12px", borderBottom: "1px solid #e6ebf2", whiteSpace: "nowrap" }}>{c}</th>)}</tr>
                            </thead>
                            <tbody>
                                {filtrirani.map((p, i) => {
                                    const layers = izvuciSlojeve(p); const tip = tipProizvoda(p); const pills = materijalPills(layers);
                                    return (
                                        <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                            <td style={{ padding: "11px 12px", fontWeight: 900, whiteSpace: "nowrap" }}>{p.naziv || "—"}<div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>ID: {p.id}</div></td>
                                            <td style={{ padding: "11px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{p.kupac || "—"}</td>
                                            <td style={{ padding: "11px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{p.sifra || "—"}</td>
                                            <td style={{ padding: "11px 12px" }}><span style={{ background: (TIP_BOJA[tip] || "#64748b") + "22", color: TIP_BOJA[tip] || "#64748b", fontSize: 10, fontWeight: 900, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", textTransform: "uppercase" }}>{tip}</span></td>
                                            <td style={{ padding: "11px 12px", fontWeight: 900, textAlign: "center" }}>{layers.length}</td>
                                            <td style={{ padding: "11px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{idealna(p) ? idealna(p) + " mm" : "—"}</td>
                                            <td style={{ padding: "11px 12px" }}>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                                    {pills.length ? pills.map((m, k) => <span key={k} style={{ background: "#f1f5f9", borderRadius: 7, padding: "3px 9px", fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap" }}>{m}</span>) : <span style={{ color: "#cbd5e1" }}>—</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filtrirani.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontWeight: 700 }}>Nema proizvoda za ovu pretragu.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ padding: "10px 14px", color: "#64748b", fontSize: 12, fontWeight: 700, borderTop: "1px solid #f1f5f9" }}>Ukupno: {filtrirani.length} proizvoda</div>
                </div>
            )}

            {/* PREGLED PO KUPCIMA */}
            <div style={{ fontSize: 16, fontWeight: 950, margin: "6px 0 12px", display: "flex", alignItems: "center", gap: 8 }}>📇 Pregled po kupcima</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: 16 }}>
                {poKupcima.map(([kupac, prods]) => <KupacKartica key={kupac} kupac={kupac} proizvodi={prods} />)}
            </div>
            {poKupcima.length === 0 && <div style={{ color: "#94a3b8", fontWeight: 700, padding: 20 }}>Nema proizvoda.</div>}
        </div>
    );
}
