import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Lista proizvoda po kupcima  [v3]
//  Čitanje podataka usklađeno sa "Baza proizvoda PRO": proizvod u bazi drži
//  slojeve u `materijali_struktura` (ili `mats`), a idealnu širinu u koloni
//  `sir`/`sirina`. Ako postoji ugnježden `data`/`template` JSON, čita i njega.
//  Prikaz: JEDAN KUPAC = jedan red pune širine; njegovi proizvodi se nižu
//  numerisano unutar kartice. Tabele slojeva klize (ne prelaze ivicu).
// ─────────────────────────────────────────────────────────────────────────────

const TIP_BOJA = { folija: "#2563eb", spulna: "#9333ea", kesa: "#16a34a" };
const num = (x) => { const n = parseFloat(String(x ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

function normalizeTip(tip) {
    const t = String(tip || "").toLowerCase();
    if (t.includes("kes")) return "kesa";
    if (t.includes("spul") || t.includes("špul")) return "spulna";
    return "folija";
}

// Izvuci slojeve — pokriva sve načine na koje su mogli biti sačuvani
function izvuciSlojeve(p) {
    const nested = p?.data || p?.template || (p?.standardi && p.standardi.record && p.standardi.record.data) || null;
    if (nested && typeof nested === "object") {
        const tip = normalizeTip(nested.type || p.tip);
        const sek = nested[tip] || nested.folija || nested.kesa || nested.spulna || {};
        const l = sek.layers || nested.layers;
        if (Array.isArray(l) && l.length) return l;
    }
    if (Array.isArray(p?.materijali_struktura) && p.materijali_struktura.length) return p.materijali_struktura;
    if (Array.isArray(p?.mats) && p.mats.length) return p.mats;
    if (Array.isArray(p?.materijali) && p.materijali.length) return p.materijali;
    return [];
}
function idealnaSirina(p) {
    const nested = p?.data || p?.template || null;
    if (nested && typeof nested === "object") {
        const v = nested.idealnaSirinaMaterijala || (nested.folija && nested.folija.idealnaSirinaMaterijala);
        if (v) return v;
    }
    return p?.sir || p?.sirina || p?.idealnaSirinaMaterijala || "";
}
function tipProizvoda(p) {
    const nested = p?.data || p?.template || null;
    return normalizeTip(p?.tip || (nested && nested.type) || "");
}
function sifraP(p) { return p?.sku || p?.sifra || (p?.data && p.data.sifra) || ""; }

// jedan sloj → normalizovana polja (pokriva sve varijante imena)
function normSloj(l, p) {
    const deb = l.debljina || l.deb || "";
    const gm2 = l.gm2 || l.gsm || l.tezina || (num(deb) && num(l.koeficijent) ? (num(deb) * num(l.koeficijent)).toFixed(1) : "");
    // ŠIRINA u tabeli sloja = IDEALNA ŠIRINA MATERIJALA proizvoda (npr. 480),
    // ne širina samog sloja/trake (360). Zato prvo idealna, pa fallback na sloj.
    const sir = (p && idealnaSirina(p)) || l.idealna_sirina || l.sirina || "";
    return {
        vrsta: l.vrsta || l.tip || l.material || l.materijal || "—",
        pod_vrsta: l.pod_vrsta || l.podVrsta || l.podvrsta || l.subtype || "—",
        oznaka: l.oznaka || l.oznaka_materijala || l.sifra || "—",
        proizvodjac: l.proizvodjac || l.proizvođač || l.dobavljac || "—",
        debljina: deb ? deb + "µ" : "—",
        sirina: sir ? sir + " mm" : "—",
        gm2: gm2 || "—",
    };
}
function materijalPills(layers) {
    return layers.map((l) => {
        const v = l.vrsta || l.tip || l.material || l.materijal || "";
        const o = l.oznaka_materijala || l.oznaka || "";
        const d = l.debljina || l.deb;
        return [v, o, d ? d + "µ" : ""].filter(Boolean).join(" ");
    }).filter((x) => x.length);
}

const KOLONE = ["SLOJ", "VRSTA", "POD VRSTA", "OZNAKA", "PROIZVOĐAČ", "DEBLJINA", "ŠIRINA", "g/m²"];

function SlojeviTabela({ layers, p }) {
    const rows = (layers && layers.length ? layers : []).map((l) => normSloj(l, p));
    if (!rows.length) return <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, padding: "6px 2px" }}>Nema unetih slojeva u templejtu.</div>;
    return (
        <div style={{ overflowX: "auto", border: "1px solid #ede9fe", borderRadius: 11, background: "#fff", WebkitOverflowScrolling: "touch", marginLeft: 30 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620, fontSize: 11.5 }}>
                <thead>
                    <tr>{KOLONE.map((c, i) => (
                        <th key={c} style={{ background: "#faf8ff", color: "#7c3aed", fontSize: 9, textTransform: "uppercase", letterSpacing: .5, fontWeight: 900, textAlign: i === 0 ? "center" : "left", padding: "8px 11px", borderBottom: "2px solid #ede9fe", whiteSpace: "nowrap" }}>{c}</th>
                    ))}</tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i}>
                            <td style={{ padding: "8px 11px", borderBottom: "1px solid #f5f7fa", textAlign: "center" }}>
                                <span style={{ display: "inline-flex", width: 20, height: 20, borderRadius: 6, background: "linear-gradient(135deg,#ede9fe,#ddd6fe)", color: "#6d28d9", fontWeight: 900, fontSize: 10.5, alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                            </td>
                            <td style={{ padding: "8px 11px", borderBottom: "1px solid #f5f7fa", fontWeight: 900, whiteSpace: "nowrap" }}>{r.vrsta}</td>
                            <td style={{ padding: "8px 11px", borderBottom: "1px solid #f5f7fa", fontWeight: 600, whiteSpace: "nowrap" }}>{r.pod_vrsta}</td>
                            <td style={{ padding: "8px 11px", borderBottom: "1px solid #f5f7fa", fontWeight: 700, whiteSpace: "nowrap" }}>{r.oznaka}</td>
                            <td style={{ padding: "8px 11px", borderBottom: "1px solid #f5f7fa", fontWeight: 600, whiteSpace: "nowrap" }}>{r.proizvodjac}</td>
                            <td style={{ padding: "8px 11px", borderBottom: "1px solid #f5f7fa", fontWeight: 900, whiteSpace: "nowrap" }}>{r.debljina}</td>
                            <td style={{ padding: "8px 11px", borderBottom: "1px solid #f5f7fa", fontWeight: 700, whiteSpace: "nowrap" }}>{r.sirina}</td>
                            <td style={{ padding: "8px 11px", borderBottom: "1px solid #f5f7fa", fontWeight: 700, whiteSpace: "nowrap" }}>{r.gm2}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Čita perforaciju iz proizvoda. Vraća {ima, opis} — opis je "tip · odnos · pozicija".
function perforacija(p) {
    const nested = p?.data || p?.template || (p?.standardi && p.standardi.record && p.standardi.record.data) || {};
    const tip = normalizeTip(nested.type || p.tip);
    const sek = nested[tip] || nested.folija || nested.kesa || nested.spulna || nested.spulne || {};
    const k = sek.kpdf || nested.kpdf || p.kpdf || {};
    // varijante: kpdf.enabled, ili product.perforacija.tip != "Nema", ili operacije
    const perfTip = (p.perforacija && p.perforacija.tip) || k.tip;
    const ima = !!(k.enabled) || (perfTip && perfTip !== "Nema") || sek.poprecna_perf || p.poprecna_perf || sek.mikroperforacija || p.mikroperforacija;
    if (!ima) return { ima: false, opis: "" };
    const delovi = [
        (perfTip && perfTip !== "Nema") ? perfTip : "perforacija",
        k.odnos || (p.perforacija && p.perforacija.odnos) || "",
        (k.pozicija || (p.perforacija && p.perforacija.pozicija)) ? ("poz. " + (k.pozicija || p.perforacija.pozicija)) : "",
    ].filter(Boolean);
    return { ima: true, opis: delovi.join(" · ") };
}

function KupacKartica({ kupac, proizvodi }) {
    return (
        <div style={{ background: "#fff", border: "1px solid #e6ebf2", borderRadius: 14, overflow: "hidden", boxShadow: "0 8px 22px rgba(15,23,42,.05)", marginBottom: 16 }}>
            <div style={{ padding: "15px 20px", background: "linear-gradient(120deg,#0f1b33,#1a2a49)", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#7c3aed,#c026d3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, boxShadow: "0 4px 12px rgba(124,58,237,.4)" }}>🏢</div>
                    <div style={{ fontWeight: 950, fontSize: 16 }}>{kupac}</div>
                </div>
                <span style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 999, padding: "5px 14px", fontSize: 11, fontWeight: 900 }}>{proizvodi.length} {proizvodi.length === 1 ? "proizvod" : "proizvoda"}</span>
            </div>
            <div>
                {proizvodi.map((p, idx) => {
                    const layers = izvuciSlojeve(p);
                    const tip = tipProizvoda(p);
                    const pills = materijalPills(layers);
                    const isir = idealnaSirina(p);
                    const perf = perforacija(p);
                    return (
                        <div key={idx} style={{ padding: "13px 18px", borderBottom: idx < proizvodi.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                                <div>
                                    <div style={{ fontWeight: 900, fontSize: 13.5, display: "flex", alignItems: "center" }}>
                                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 9, background: "linear-gradient(135deg,#ede9fe,#ddd6fe)", color: "#6d28d9", fontWeight: 950, fontSize: 13, marginRight: 10, flexShrink: 0 }}>{idx + 1}</span>
                                        {p.naziv || "—"}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 2, marginLeft: 30 }}>
                                        Šifra: {sifraP(p) || "—"} · Idealna širina: {isir ? isir + " mm" : "—"} · Slojeva: {layers.length}
                                    </div>
                                </div>
                                <span style={{ background: (TIP_BOJA[tip] || "#64748b") + "22", color: TIP_BOJA[tip] || "#64748b", fontSize: 9.5, fontWeight: 900, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap", textTransform: "uppercase" }}>{tip}</span>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8, marginLeft: 30 }}>
                                {pills.map((m, i) => <span key={i} style={{ background: "#f1f5f9", borderRadius: 7, padding: "3px 9px", fontSize: 10.5, fontWeight: 800 }}>{m}</span>)}
                                {perf.ima
                                    ? <span style={{ background: "linear-gradient(135deg,#fff7ed,#ffedd5)", color: "#9a3412", border: "1px solid #fed7aa", borderRadius: 8, padding: "3px 10px", fontSize: 10.5, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 4 }}>✂️ Perforacija: DA{perf.opis ? " · " + perf.opis : ""}</span>
                                    : <span style={{ background: "#f8fafc", color: "#b6c0ce", border: "1px solid #e8edf3", borderRadius: 8, padding: "3px 10px", fontSize: 10.5, fontWeight: 800 }}>— bez perforacije</span>}
                            </div>
                            <SlojeviTabela layers={layers} p={p} />
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
            const tekst = [p.naziv, p.kupac, sifraP(p), tipProizvoda(p), ...materijalPills(layers)].join(" ").toLowerCase();
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
    const brMaterijala = new Set(filtrirani.flatMap((p) => izvuciSlojeve(p).map((l) => (l.vrsta || l.tip || l.material || "").toUpperCase()).filter(Boolean))).size;

    const wrap = { maxWidth: 1200, margin: "0 auto" };
    const kartica = { background: "#fff", border: "1px solid #e6ebf2", borderRadius: 14, boxShadow: "0 8px 22px rgba(15,23,42,.05)" };

    if (proizvodi === null) return <div style={{ padding: 40, textAlign: "center", color: "#64748b", fontWeight: 700 }}>Učitavam proizvode…</div>;

    return (
        <div style={wrap}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase" }}>Baza / Katalog</div>
            <div style={{ fontSize: 24, fontWeight: 950, margin: "2px 0 4px" }}>📋 Lista proizvoda po kupcima</div>
            <div style={{ color: "#64748b", fontSize: 12.5, marginBottom: 14 }}>Za svakog kupca: njegovi proizvodi sa vrstom materijala, pod vrstom, oznakom, proizvođačem, idealnom širinom i slojevima laminata.</div>

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
            <div style={{ ...kartica, padding: 12, marginBottom: 18, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 Pretraga: kupac, naziv, šifra, materijal, oznaka…"
                    style={{ flex: 1, minWidth: 240, border: "1px solid #e2e8f0", borderRadius: 10, padding: "11px 14px", fontSize: 14, outline: "none" }} />
                {query && <button onClick={() => setQuery("")} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 10, padding: "10px 16px", fontWeight: 900, cursor: "pointer" }}>Reset</button>}
            </div>

            {/* JEDAN KUPAC = JEDAN RED (pune širine), proizvodi numerisani unutra */}
            {poKupcima.map(([kupac, prods]) => <KupacKartica key={kupac} kupac={kupac} proizvodi={prods} />)}
            {poKupcima.length === 0 && <div style={{ color: "#94a3b8", fontWeight: 700, padding: 20, textAlign: "center" }}>Nema proizvoda za ovu pretragu.</div>}
        </div>
    );
}
