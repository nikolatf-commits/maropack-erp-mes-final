import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase.js";
import { calculateGm2 } from "./data/materialMaster.js";

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmt = (v, d = 0) => num(v).toLocaleString("sr-RS", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function AnalizaMaterijalStavke({ msg }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("nalog"); // "nalog" | "materijal"
    const [period, setPeriod] = useState("sve"); // "sve" | "30" | "90"
    const [q, setQ] = useState("");

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [period]);

    async function load() {
        setLoading(true);
        try {
            // Da se POKLAPA sa magacinom "Iskorišćeno": čitamo SVE rolne iz tabele `magacin`
            // (Supabase seče na 1000 redova, pa moramo paginacijom), filtriramo iskorišćene
            // i uzimamo NJIHOV PUN kg. Grupisano po nalogu i materijalu.
            const num0 = (v) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : 0);
            const jeIskoriscena = (st) => {
                const s = String(st || "").toLowerCase();
                return ["iskorišćeno", "iskorisceno", "potrošena", "potrosena", "potroseno", "potrošeno", "used"].includes(s) || s.includes("iskor") || s.includes("potro");
            };
            // paginacija: učitavaj po 1000 dok ima
            let sve = [];
            const PAGE = 1000;
            for (let od = 0; od < 50000; od += PAGE) {
                const { data, error } = await supabase.from("magacin").select("*").neq("status", "obrisano").range(od, od + PAGE - 1);
                if (error) throw error;
                if (!data || !data.length) break;
                sve = sve.concat(data);
                if (data.length < PAGE) break;
            }

            const transf = sve.filter((r) => jeIskoriscena(r.status)).map(function (r) {
                const deb = num0(r.debljina ?? r.deb);
                const sir = num0(r.sirina ?? r.sirina_mm);
                const m = num0(r.metraza ?? r.metraza_ost ?? r.duzina);
                let kg = num0(r.kg_neto) || num0(r.kg_bruto) || num0(r.kg);
                if (!kg) {
                    const gsm = num0(r.gsm) || num0(calculateGm2(r.vrsta, deb));
                    if (gsm && sir && m) kg = (m * sir * gsm) / 1000000;
                }
                return {
                    nalog_ref: r.nalog_ponbr || r.dodeljeno_nalogu || r.za_nalog || (r.nalog_id != null ? String(r.nalog_id) : null),
                    vrsta: r.vrsta || null,
                    pod_vrsta: r.pod_vrsta || null,
                    oznaka: r.oznaka_materijala || r.oznaka || null,
                    debljina: deb || null,
                    dobavljac: r.dobavljac || r.proizvodjac || null,
                    idealna_sirina: sir || null,
                    potroseno: m,
                    vraceno: 0,
                    kg: kg,
                };
            });
            setRows(transf);
        } catch (e) {
            msg && msg("Greška pri učitavanju analize: " + (e.message || e), "err");
            setRows([]);
        } finally { setLoading(false); }
    }

    const poNalogu = useMemo(() => {
        const m = {};
        rows.forEach((r) => {
            const k = r.nalog_ref || "— bez naloga";
            if (!m[k]) m[k] = { nalog: k, izdato: 0, vraceno: 0, kg: 0, rolni: 0, idealna: r.idealna_sirina || 0 };
            m[k].izdato += num(r.potroseno);
            m[k].vraceno += num(r.vraceno);
            m[k].kg += num(r.kg);           // pun kg rolne (kao magacin)
            m[k].rolni += 1;
            if (!m[k].idealna && r.idealna_sirina) m[k].idealna = r.idealna_sirina;
        });
        return Object.values(m).map((x) => ({
            ...x,
            plan: x.izdato,
            utroseno: Math.max(0, x.izdato - x.vraceno),
            otpad: 0,
            iskoriscenje: x.izdato > 0 ? Math.max(0, Math.min(100, ((x.izdato - x.vraceno) / x.izdato) * 100)) : 0,
        })).sort((a, b) => b.utroseno - a.utroseno);
    }, [rows]);

    const poMaterijalu = useMemo(() => {
        const m = {};
        rows.forEach((r) => {
            const sir = r.idealna_sirina || "";
            const k = [r.vrsta, r.pod_vrsta, r.oznaka, r.debljina, sir, r.dobavljac].map((x) => x || "").join("|");
            if (!m[k]) m[k] = { vrsta: r.vrsta || "—", pod_vrsta: r.pod_vrsta || "", oznaka: r.oznaka || "", debljina: r.debljina || "", sirina: sir, dobavljac: r.dobavljac || "—", potroseno: 0, kg: 0, otpad: 0, rolni: 0 };
            m[k].potroseno += Math.max(0, num(r.potroseno) - num(r.vraceno));
            m[k].kg += num(r.kg);           // pun kg rolne
            m[k].rolni += 1;
        });
        return Object.values(m).filter((x) => x.potroseno > 0 || x.kg > 0).sort((a, b) => b.potroseno - a.potroseno);
    }, [rows]);

    const kpi = useMemo(() => {
        const izdato = rows.reduce((s, r) => s + num(r.potroseno), 0);
        const vraceno = rows.reduce((s, r) => s + num(r.vraceno), 0);
        const kgUk = rows.reduce((s, r) => s + num(r.kg), 0);
        return {
            plan: izdato,
            izdato: Math.max(0, izdato - vraceno),
            otpad: 0,
            kg: kgUk,                        // ukupno kg = zbir punih kg (kao magacin Iskorišćeno)
            nalozi: new Set(rows.map((r) => r.nalog_ref || "—")).size,
        };
    }, [rows]);

    const filtNalog = useMemo(() => !q.trim() ? poNalogu : poNalogu.filter((x) => String(x.nalog).toLowerCase().includes(q.toLowerCase())), [poNalogu, q]);
    const filtMat = useMemo(() => !q.trim() ? poMaterijalu : poMaterijalu.filter((x) => [x.vrsta, x.pod_vrsta, x.oznaka, x.dobavljac].some((k) => String(k || "").toLowerCase().includes(q.toLowerCase()))), [poMaterijalu, q]);

    const maxPlan = Math.max(1, ...poNalogu.map((x) => x.plan));
    const maxMat = Math.max(1, ...poMaterijalu.map((x) => x.potroseno));

    const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.05)" };
    const th = { textAlign: "left", padding: "9px 10px", fontSize: 10, textTransform: "uppercase", color: "#475569", fontWeight: 800, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" };
    const td = { padding: "9px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 600, fontSize: 13 };
    const tabBtn = (k) => ({ border: "none", borderRadius: 10, padding: "9px 15px", fontWeight: 900, cursor: "pointer", fontSize: 13.5, background: tab === k ? "#0f172a" : "#f1f5f9", color: tab === k ? "#fff" : "#334155" });
    const perBtn = (k) => ({ border: "1px solid #e2e8f0", borderRadius: 9, padding: "7px 12px", fontWeight: 800, cursor: "pointer", fontSize: 12.5, background: period === k ? "#0ea5e9" : "#fff", color: period === k ? "#fff" : "#475569" });

    return (
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "8px 4px 40px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                <div style={{ fontSize: 22, fontWeight: 950 }}>📊 Analiza potrošnje materijala</div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <button onClick={() => setPeriod("sve")} style={perBtn("sve")}>Sve</button>
                    <button onClick={() => setPeriod("30")} style={perBtn("30")}>30 dana</button>
                    <button onClick={() => setPeriod("90")} style={perBtn("90")}>90 dana</button>
                    <button onClick={load} style={{ ...perBtn(""), background: "#f1f5f9" }}>↻</button>
                </div>
            </div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 14 }}>Izvor: knjiga stavki materijala (rezervacije, izdavanja i povrati po nalogu i rolni).</div>

            {/* KPI */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11, marginBottom: 16 }}>
                <div style={{ ...card, padding: 14 }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#64748b" }}>Naloga</div><div style={{ fontSize: 24, fontWeight: 950 }}>{fmt(kpi.nalozi)}</div></div>
                <div style={{ ...card, padding: 14, background: "#eff6ff" }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#1d4ed8" }}>Skinuto (bruto)</div><div style={{ fontSize: 24, fontWeight: 950, color: "#1d4ed8" }}>{fmt(kpi.plan)} m</div></div>
                <div style={{ ...card, padding: 14, background: "#f0fdf4" }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#15803d" }}>Stvarna potrošnja</div><div style={{ fontSize: 24, fontWeight: 950, color: "#15803d" }}>{fmt(kpi.izdato)} m</div></div>
                <div style={{ ...card, padding: 14, background: "#fef2f2" }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#dc2626" }}>Vraćeno</div><div style={{ fontSize: 24, fontWeight: 950, color: "#dc2626" }}>{fmt(Math.max(0, kpi.plan - kpi.izdato))} m</div></div>
                <div style={{ ...card, padding: 14, background: "#0f172a" }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#94a3b8" }}>Ukupno kg</div><div style={{ fontSize: 24, fontWeight: 950, color: "#fff" }}>{fmt(kpi.kg, 1)}</div></div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={() => setTab("nalog")} style={tabBtn("nalog")}>📋 Po nalogu</button>
                <button onClick={() => setTab("materijal")} style={tabBtn("materijal")}>🧱 Po materijalu / dobavljaču</button>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 pretraga..." style={{ marginLeft: "auto", border: "1px solid #cbd5e1", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 600, minWidth: 180 }} />
            </div>

            {loading ? <div style={{ ...card, color: "#64748b", fontWeight: 700 }}>Učitavam…</div> : (
                rows.length === 0 ? (
                    <div style={{ ...card, color: "#475569" }}>
                        <div style={{ fontWeight: 900, marginBottom: 4 }}>Nema podataka u „materijal_stavke".</div>
                        <div style={{ fontSize: 13, color: "#64748b" }}>Stavke se kreiraju pri rezervaciji/izdavanju materijala. Napravi nalog kroz „Generiši nalog materijala", rezerviši ručno, ili izdaj materijal — pa se analiza popuni.</div>
                    </div>
                ) : tab === "nalog" ? (
                    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr>{["Nalog", "Idealna š.", "Skinuto", "Vraćeno", "Potrošeno", "kg", "Iskorišćenje"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {filtNalog.map((x, i) => (
                                        <tr key={i}>
                                            <td style={{ ...td, fontWeight: 900 }}>{x.nalog}<div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 600 }}>{x.rolni} rolni</div></td>
                                            <td style={td}>{x.idealna ? fmt(x.idealna) + " mm" : "—"}</td>
                                            <td style={td}>
                                                <div style={{ fontWeight: 800 }}>{fmt(x.izdato)} m</div>
                                                <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, marginTop: 3, overflow: "hidden" }}><div style={{ height: "100%", width: (x.izdato / maxPlan * 100) + "%", background: "#1d4ed8" }} /></div>
                                            </td>
                                            <td style={{ ...td, color: "#dc2626", fontWeight: 800 }}>{fmt(x.vraceno)} m</td>
                                            <td style={{ ...td, color: "#15803d", fontWeight: 900 }}>{fmt(x.utroseno)} m</td>
                                            <td style={td}>{fmt(x.kg, 1)}</td>
                                            <td style={td}>
                                                <div style={{ fontWeight: 900, color: x.iskoriscenje >= 95 ? "#15803d" : x.iskoriscenje >= 85 ? "#a16207" : "#dc2626" }}>{x.izdato > 0 ? fmt(x.iskoriscenje, 1) + "%" : "—"}</div>
                                                {x.izdato > 0 && <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, marginTop: 3, overflow: "hidden" }}><div style={{ height: "100%", width: x.iskoriscenje + "%", background: x.iskoriscenje >= 95 ? "#16a34a" : x.iskoriscenje >= 85 ? "#f59e0b" : "#dc2626" }} /></div>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr>{["Vrsta", "Pod-vrsta", "Oznaka", "Deb.", "Širina", "Dobavljač", "Potrošeno", "kg", "Događaja"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {filtMat.map((x, i) => (
                                        <tr key={i}>
                                            <td style={{ ...td, fontWeight: 900 }}>{x.vrsta}</td>
                                            <td style={td}>{x.pod_vrsta || "—"}</td>
                                            <td style={td}>{x.oznaka || "—"}</td>
                                            <td style={td}>{x.debljina ? x.debljina + "µ" : "—"}</td>
                                            <td style={td}>{x.sirina ? fmt(x.sirina, 0) + " mm" : "—"}</td>
                                            <td style={td}>{x.dobavljac || "—"}</td>
                                            <td style={td}>
                                                <div style={{ fontWeight: 800 }}>{fmt(x.potroseno)} m</div>
                                                <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, marginTop: 3, overflow: "hidden" }}><div style={{ height: "100%", width: (x.potroseno / maxMat * 100) + "%", background: "#0d9488" }} /></div>
                                            </td>
                                            <td style={{ ...td, fontWeight: 800 }}>{fmt(x.kg, 1)}</td>
                                            <td style={{ ...td, color: "#94a3b8", fontWeight: 800 }}>{x.rolni}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            )}
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10 }}>Stvarna potrošnja = skinuto sa stanja − vraćeno u magacin (iz istorije rolni). Iskorišćenje = potrošeno / skinuto.</div>
        </div>
    );
}
