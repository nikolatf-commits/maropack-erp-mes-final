import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase.js";

// ──────────────────────────────────────────────────────────────────────────
// Kartica „Vrednost naloga" — ide ISPOD KPI kartica na glavnom Dashboardu.
// Vrednost svakog naloga = prodajna cena iz templejta × poručena količina
// (snimljena na nalog pri kreiranju, u parametri.vrednost_naloga).
// Biraš: godinu, kvartal, mesec i kreatora. Prikaz: KPI (danas/period/godina/
// ukupno), trend (dnevni za mesec ili mesečni za godinu), po kreatoru, po tipu.
// ──────────────────────────────────────────────────────────────────────────

const MESECI = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Avg", "Sep", "Okt", "Nov", "Dec"];
const eur = (v) => "€ " + Math.round(Number(v) || 0).toLocaleString("sr-RS");
const eurK = (v) => { v = Number(v) || 0; return v >= 1000000 ? "€ " + (v / 1000000).toFixed(1) + "M" : v >= 10000 ? "€ " + Math.round(v / 1000) + "k" : eur(v); };
const TIP_BOJA = { folija: "#059669", kesa: "#2563eb", spulna: "#d97706", "—": "#64748b" };
const TIP_LBL = { folija: "Folija", kesa: "Kese", spulna: "Špulne" };
const KRE_BOJE = ["#0d9488", "#2563eb", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#dc2626"];

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
function parseSr(s) { // "1. 11. 2026." → Date
    const m = String(s || "").match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}
function inicijali(ime) {
    const d = String(ime || "").trim().split(/\s+/);
    return ((d[0] || "")[0] || "").toUpperCase() + ((d[1] || "")[0] || "").toUpperCase() || "—";
}

export default function VrednostNalogaKartica() {
    const [naloge, setNaloge] = useState([]);
    const [loading, setLoading] = useState(true);
    const now = new Date();
    const [godina, setGodina] = useState(now.getFullYear());
    const [kvartal, setKvartal] = useState("sve");   // sve | 1..4
    const [mesec, setMesec] = useState("sve");        // sve | 0..11
    const [kreator, setKreator] = useState("svi");    // svi | ime

    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    async function load() {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("radni_nalozi")
                .select("id, created_at, tip_proizvoda, parametri")
                .order("created_at", { ascending: false }).limit(5000);
            if (!error && data) setNaloge(data.map(normalize).filter((n) => n.datum && n.vrednost > 0));
        } catch (e) { }
        setLoading(false);
    }
    function normalize(n) {
        const p = (typeof n.parametri === "string" ? safeJson(n.parametri) : n.parametri) || {};
        const d = n.created_at ? new Date(n.created_at) : parseSr(p.datum);
        return {
            id: n.id, datum: d,
            godina: d ? d.getFullYear() : null,
            mesec: d ? d.getMonth() : null,
            kvartal: d ? Math.floor(d.getMonth() / 3) + 1 : null,
            dan: d ? d.getDate() : null,
            kreator: (p.kreirao_ime || n.kreirao_ime || "—").toString().trim() || "—",
            tip: (n.tip_proizvoda || p.tip_proizvoda || "—"),
            vrednost: Number(p.vrednost_naloga) || 0,
        };
    }

    const godine = useMemo(() => {
        const s = new Set(naloge.map((n) => n.godina).filter(Boolean));
        s.add(now.getFullYear());
        return Array.from(s).sort((a, b) => b - a);
    }, [naloge]);
    const kreatori = useMemo(() => Array.from(new Set(naloge.map((n) => n.kreator))).sort(), [naloge]);

    const uPeriodu = (n) => n.godina === Number(godina)
        && (kvartal === "sve" || n.kvartal === Number(kvartal))
        && (mesec === "sve" || n.mesec === Number(mesec));
    const uKreatoru = (n) => kreator === "svi" || n.kreator === kreator;

    const sum = (arr) => arr.reduce((a, n) => a + n.vrednost, 0);
    const filtrirani = useMemo(() => naloge.filter((n) => uPeriodu(n) && uKreatoru(n)), [naloge, godina, kvartal, mesec, kreator]);

    const danasKey = now.toDateString();
    const kpi = useMemo(() => {
        const kre = (n) => uKreatoru(n);
        return {
            danas: sum(naloge.filter((n) => kre(n) && n.datum && n.datum.toDateString() === danasKey)),
            period: sum(filtrirani),
            godina: sum(naloge.filter((n) => kre(n) && n.godina === Number(godina))),
            ukupno: sum(naloge.filter((n) => kre(n))),
        };
    }, [naloge, filtrirani, godina, kreator]);

    // Po kreatoru — svi kreatori u periodu (ignoriše filter kreatora, da se porede)
    const poKreatoru = useMemo(() => {
        const m = {};
        naloge.filter(uPeriodu).forEach((n) => { (m[n.kreator] = m[n.kreator] || { ime: n.kreator, v: 0, br: 0 }).v += n.vrednost; m[n.kreator].br++; });
        return Object.values(m).sort((a, b) => b.v - a.v);
    }, [naloge, godina, kvartal, mesec]);
    const maxKre = Math.max(1, ...poKreatoru.map((x) => x.v));
    const ukKre = sum(naloge.filter(uPeriodu)) || 1;

    // Po tipu — poštuje i kreatora
    const poTipu = useMemo(() => {
        const m = {};
        filtrirani.forEach((n) => { (m[n.tip] = m[n.tip] || { tip: n.tip, v: 0 }).v += n.vrednost; });
        return Object.values(m).sort((a, b) => b.v - a.v);
    }, [filtrirani]);
    const maxTip = Math.max(1, ...poTipu.map((x) => x.v));

    // Trend — dnevni (ako je izabran mesec) ili mesečni (za godinu), poštuje kreatora
    const trend = useMemo(() => {
        const baza = naloge.filter((n) => n.godina === Number(godina) && uKreatoru(n)
            && (kvartal === "sve" || n.kvartal === Number(kvartal)));
        if (mesec !== "sve") {
            const mm = Number(mesec);
            const dana = new Date(Number(godina), mm + 1, 0).getDate();
            const arr = Array.from({ length: dana }, (_, i) => ({ labela: String(i + 1), v: 0 }));
            baza.filter((n) => n.mesec === mm).forEach((n) => { arr[n.dan - 1].v += n.vrednost; });
            return { naslov: "Dnevna vrednost — " + MESECI[mm] + " " + godina, stubovi: arr };
        }
        const arr = MESECI.map((l) => ({ labela: l, v: 0 }));
        baza.forEach((n) => { arr[n.mesec].v += n.vrednost; });
        return { naslov: "Mesečna vrednost — " + godina, stubovi: arr };
    }, [naloge, godina, kvartal, mesec, kreator]);
    const maxTrend = Math.max(1, ...trend.stubovi.map((x) => x.v));
    const najTrend = trend.stubovi.reduce((a, b) => (b.v > a.v ? b : a), { v: 0, labela: "" });

    // ── stilovi ──
    const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, boxShadow: "0 6px 16px rgba(15,23,42,.05)", padding: "16px 18px", marginBottom: 14 };
    const sct = { fontSize: 12, fontWeight: 900, color: "#0f766e", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 12 };
    const sel = { padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: "#fff", cursor: "pointer" };
    const kpiBox = (hl) => ({ border: "1px solid " + (hl ? "#0f766e" : "#e2e8f0"), borderRadius: 12, padding: "11px 12px", background: hl ? "linear-gradient(135deg,#0d9488,#0f766e)" : "#fbfdff" });

    return (
        <div style={{ marginTop: 4 }}>
            {/* GLAVNA — filteri + KPI */}
            <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 950 }}>💶 Vrednost naloga</h2>
                        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Prodajna cena iz templejta × poručena količina · po datumu kreiranja</div>
                    </div>
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                        <select style={sel} value={godina} onChange={(e) => setGodina(Number(e.target.value))}>
                            {godine.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <select style={sel} value={kvartal} onChange={(e) => setKvartal(e.target.value)}>
                            <option value="sve">Svi kvartali</option>
                            <option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option>
                        </select>
                        <select style={sel} value={mesec} onChange={(e) => setMesec(e.target.value)}>
                            <option value="sve">Svi meseci</option>
                            {MESECI.map((m, i) => <option key={i} value={i}>{m}</option>)}
                        </select>
                        <select style={sel} value={kreator} onChange={(e) => setKreator(e.target.value)}>
                            <option value="svi">Svi kreatori</option>
                            {kreatori.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                    </div>
                </div>

                {loading ? <div style={{ color: "#94a3b8", padding: "18px 0" }}>⏳ Učitavam…</div> : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 14 }}>
                        <div style={kpiBox(false)}><div style={{ fontSize: 10.5, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>Danas</div><div style={{ fontSize: 19, fontWeight: 950, marginTop: 4 }}>{eur(kpi.danas)}</div></div>
                        <div style={kpiBox(true)}><div style={{ fontSize: 10.5, fontWeight: 900, color: "#d1fae5", textTransform: "uppercase" }}>Izabrani period</div><div style={{ fontSize: 19, fontWeight: 950, marginTop: 4, color: "#fff" }}>{eur(kpi.period)}</div></div>
                        <div style={kpiBox(false)}><div style={{ fontSize: 10.5, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>Godina {godina}</div><div style={{ fontSize: 19, fontWeight: 950, marginTop: 4 }}>{eur(kpi.godina)}</div></div>
                        <div style={kpiBox(false)}><div style={{ fontSize: 10.5, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>Ukupno (sve)</div><div style={{ fontSize: 19, fontWeight: 950, marginTop: 4 }}>{eurK(kpi.ukupno)}</div></div>
                    </div>
                )}
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>{filtrirani.length} naloga u izabranom periodu{kreator !== "svi" ? " · " + kreator : ""}</div>
            </div>

            {!loading && (
                <>
                    {/* TREND */}
                    <div style={card}>
                        <div style={sct}>📈 {trend.naslov}</div>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: trend.stubovi.length > 20 ? 2 : 6, height: 150, paddingTop: 6 }}>
                            {trend.stubovi.map((s, i) => (
                                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
                                    <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                                        <div title={eur(s.v)} style={{ width: "100%", height: (s.v / maxTrend * 100) + "%", minHeight: s.v > 0 ? 2 : 0, borderRadius: "5px 5px 0 0", background: "linear-gradient(180deg,#14b8a6,#0d9488)" }} />
                                    </div>
                                    <div style={{ fontSize: trend.stubovi.length > 20 ? 7.5 : 9, color: "#64748b", fontWeight: 700 }}>{s.labela}</div>
                                </div>
                            ))}
                        </div>
                        {najTrend.v > 0 && <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>Najjači: {najTrend.labela} — {eur(najTrend.v)}</div>}
                    </div>

                    {/* PO KREATORU */}
                    <div style={card}>
                        <div style={sct}>👤 Po kreatoru {kvartal !== "sve" ? "· Q" + kvartal : ""} {mesec !== "sve" ? "· " + MESECI[Number(mesec)] : ""} {godina}</div>
                        {poKreatoru.length === 0 ? <div style={{ color: "#94a3b8", fontWeight: 700 }}>Nema naloga u periodu.</div> :
                            poKreatoru.map((k, i) => {
                                const boja = KRE_BOJE[i % KRE_BOJE.length];
                                const izabran = kreator === k.ime;
                                return (
                                    <div key={k.ime} onClick={() => setKreator(izabran ? "svi" : k.ime)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i ? "1px solid #f1f5f9" : "none", cursor: "pointer", opacity: kreator !== "svi" && !izabran ? 0.45 : 1 }}>
                                        <div style={{ width: 30, height: 30, borderRadius: 9, background: boja, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12, flexShrink: 0 }}>{inicijali(k.ime)}</div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                                <span style={{ fontWeight: 900, fontSize: 13.5 }}>{k.ime}{izabran ? " ✓" : ""}</span>
                                                <span style={{ fontWeight: 950, fontSize: 14, whiteSpace: "nowrap" }}>{eur(k.v)}</span>
                                            </div>
                                            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{k.br} {k.br === 1 ? "nalog" : "naloga"} · {Math.round(k.v / ukKre * 100)}%</div>
                                            <div style={{ height: 8, background: "#eef2f6", borderRadius: 999, overflow: "hidden", marginTop: 5 }}><div style={{ height: "100%", width: (k.v / maxKre * 100) + "%", background: boja, borderRadius: 999 }} /></div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>

                    {/* PO TIPU */}
                    {poTipu.length > 0 && (
                        <div style={card}>
                            <div style={sct}>🧩 Po tipu proizvoda</div>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 120, paddingTop: 6 }}>
                                {poTipu.map((t) => (
                                    <div key={t.tip} style={{ flex: 1, maxWidth: 160, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, height: "100%" }}>
                                        <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                                            <div style={{ width: "100%", height: (t.v / maxTip * 100) + "%", minHeight: 2, borderRadius: "6px 6px 0 0", background: TIP_BOJA[t.tip] || "#64748b" }} />
                                        </div>
                                        <div style={{ fontSize: 10.5, color: "#334155", fontWeight: 800 }}>{TIP_LBL[t.tip] || t.tip}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 11.5, fontWeight: 700, color: "#334155" }}>
                                {poTipu.map((t) => <span key={t.tip}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: TIP_BOJA[t.tip] || "#64748b", marginRight: 5 }} />{TIP_LBL[t.tip] || t.tip} {eur(t.v)}</span>)}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
