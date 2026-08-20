import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase.js";

const fmtDT = (t) => { try { return new Date(t).toLocaleString("sr-RS"); } catch { return String(t || ""); } };

export default function AIKoriscenje() {
    const [redovi, setRedovi] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [period, setPeriod] = useState("sve"); // sve | 7 | 30
    const [koFilter, setKoFilter] = useState("");
    const [q, setQ] = useState("");

    async function load() {
        setLoading(true); setErr("");
        try {
            let query = supabase.from("ai_koriscenje").select("*").order("created_at", { ascending: false }).limit(2000);
            if (period !== "sve") { const d = new Date(); d.setDate(d.getDate() - Number(period)); query = query.gte("created_at", d.toISOString()); }
            const { data, error } = await query;
            if (error) throw error;
            setRedovi(data || []);
        } catch (e) { setErr(e.message || String(e)); }
        setLoading(false);
    }
    useEffect(() => { load(); }, [period]);

    const poKorisniku = useMemo(() => {
        const m = {};
        redovi.forEach((r) => { const k = r.ko_ime || "—"; m[k] = (m[k] || 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
    }, [redovi]);

    const filtrirano = useMemo(() => {
        const s = q.trim().toLowerCase();
        return redovi.filter((r) =>
            (!koFilter || (r.ko_ime || "—") === koFilter) &&
            (!s || [r.pitanje, r.ekran, r.ko_ime].join(" ").toLowerCase().includes(s))
        );
    }, [redovi, koFilter, q]);

    const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, marginBottom: 14 };
    const th = { textAlign: "left", fontSize: 11, textTransform: "uppercase", color: "#64748b", padding: "8px 10px", borderBottom: "1px solid #e2e8f0", fontWeight: 800 };
    const td = { padding: "8px 10px", borderBottom: "1px solid #f1f5f9", fontSize: 13, verticalAlign: "top" };

    return (
        <div style={{ maxWidth: 1050, margin: "0 auto" }}>
            <div style={{ marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>🤖 AI korišćenje</h2>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Ko koristi „Pitaj AI", koliko puta i šta pita.</div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                {[["sve", "Sve"], ["7", "7 dana"], ["30", "30 dana"]].map(([k, l]) => (
                    <button key={k} onClick={() => setPeriod(k)} style={{ padding: "8px 14px", borderRadius: 9, fontWeight: 800, cursor: "pointer", border: period === k ? "2px solid #1d4ed8" : "1px solid #cbd5e1", background: period === k ? "#eff6ff" : "#fff", color: period === k ? "#1d4ed8" : "#475569" }}>{l}</button>
                ))}
                <button onClick={load} style={{ padding: "8px 14px", borderRadius: 9, fontWeight: 800, cursor: "pointer", border: "1px solid #cbd5e1", background: "#fff" }}>↻ Osveži</button>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pretraga (pitanje / ekran / ko)..." style={{ flex: 1, minWidth: 200, padding: 9, border: "1px solid #cbd5e1", borderRadius: 9, fontSize: 14 }} />
            </div>

            {err ? <div style={{ ...card, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontWeight: 700 }}>{err}<div style={{ fontSize: 12, marginTop: 6, fontWeight: 400 }}>Ako tabela ne postoji, pokreni SQL <code>ai_koriscenje.sql</code>.</div></div> : null}

            <div style={card}>
                <div style={{ fontWeight: 900, marginBottom: 10, color: "#0f766e" }}>📊 Po korisniku ({redovi.length} upita ukupno)</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => setKoFilter("")} style={{ padding: "6px 12px", borderRadius: 999, fontWeight: 800, cursor: "pointer", border: !koFilter ? "2px solid #1d4ed8" : "1px solid #cbd5e1", background: !koFilter ? "#eff6ff" : "#fff" }}>Svi</button>
                    {poKorisniku.map(([ime, n]) => (
                        <button key={ime} onClick={() => setKoFilter(ime === koFilter ? "" : ime)} style={{ padding: "6px 12px", borderRadius: 999, fontWeight: 800, cursor: "pointer", border: koFilter === ime ? "2px solid #1d4ed8" : "1px solid #cbd5e1", background: koFilter === ime ? "#eff6ff" : "#f8fafc" }}>
                            👤 {ime} · <b style={{ color: "#1d4ed8" }}>{n}</b>
                        </button>
                    ))}
                    {poKorisniku.length === 0 && !loading && <span style={{ color: "#94a3b8", fontSize: 13 }}>Još nema zabeleženih upita.</span>}
                </div>
            </div>

            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", fontWeight: 900, color: "#0f766e", borderBottom: "1px solid #e2e8f0" }}>📝 Upiti {koFilter ? `— ${koFilter}` : ""} ({filtrirano.length})</div>
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr><th style={th}>Kada</th><th style={th}>Ko</th><th style={th}>Ekran</th><th style={th}>Pitanje</th></tr></thead>
                        <tbody>
                            {filtrirano.map((r) => (
                                <tr key={r.id}>
                                    <td style={{ ...td, whiteSpace: "nowrap", color: "#64748b" }}>{fmtDT(r.created_at)}</td>
                                    <td style={{ ...td, fontWeight: 800, whiteSpace: "nowrap" }}>👤 {r.ko_ime || "—"}</td>
                                    <td style={{ ...td, color: "#7c3aed", fontWeight: 700, whiteSpace: "nowrap" }}>{r.ekran || "—"}</td>
                                    <td style={td}>{r.pitanje || "—"}</td>
                                </tr>
                            ))}
                            {filtrirano.length === 0 && !loading && <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#94a3b8", padding: 24 }}>Nema upita za izabrani filter.</td></tr>}
                        </tbody>
                    </table>
                </div>
                {loading && <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Učitavam…</div>}
            </div>
        </div>
    );
}
