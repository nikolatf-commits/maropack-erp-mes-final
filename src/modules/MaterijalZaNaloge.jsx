import React, { useState, useEffect } from "react";
import { supabase } from "../supabase.js";
import QRScannerModal from "../QRScannerModal.jsx";

/* Magacioner: vidi naloge koji čekaju materijal i ROLNE KOJE SU VEĆ DODELJENE nalogu.
   NE bira materijal. Čekira svaku rolnu SKENIRANJEM QR koda.
   Vide samo: Đorđe, Boško, Dejan. */

function num(v) { return Number(String(v ?? 0).toString().replace(/\s/g, "").replace(",", ".")) || 0; }
function vrstaColor(v) { const x = String(v || "").toUpperCase(); if (x.includes("PET")) return "#3b82f6"; if (x.includes("ALU")) return "#9aa3af"; if (x.includes("OPA") || x.includes("CPP")) return "#14b8a6"; if (x.includes("BOPP") || x.includes("PE") || x.includes("LDPE")) return "#f59e0b"; if (x.includes("PAPIR")) return "#d4a574"; return "#64748b"; }
function qrCode(raw) { const s = String(raw || "").trim(); if (s.includes("|")) { const p = s.split("|"); return p[p.length - 1].trim(); } return s; }

export default function MaterijalZaNaloge({ operater, onBack, msg }) {
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState([]);
    const [open, setOpen] = useState(null);     // {op, master}
    const [rolls, setRolls] = useState([]);       // dodeljene rolne
    const [scanned, setScanned] = useState({});   // rollId -> true
    const [scanOpen, setScanOpen] = useState(false);
    const [manual, setManual] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    async function load() {
        setLoading(true);
        try {
            const { data: ops } = await supabase.from("operativni_nalozi").select("*").eq("tip_naloga", "materijal").in("status", ["ceka", "ceka_magacin", "Ceka", "čeka", "spremanje"]).order("redosled", { ascending: true }).limit(60);
            const list = ops || [];
            const masterIds = [...new Set(list.map((o) => o.glavni_nalog_id).filter(Boolean))];
            let masters = [];
            if (masterIds.length) { const { data: ms } = await supabase.from("radni_nalozi").select("*").in("id", masterIds); masters = ms || []; }
            const byId = {}; masters.forEach((m) => { byId[m.id] = m; });
            setItems(list.map((o) => ({ op: o, master: byId[o.glavni_nalog_id] || {} })));
        } catch (e) { msg && msg("Greška pri učitavanju: " + (e.message || e), "err"); }
        finally { setLoading(false); }
    }

    async function openNalog(it) {
        setOpen(it); setScanned({}); setRolls([]); setManual("");
        const broj = it.master.broj_naloga || it.op.broj_naloga || "";
        // ROLNE KOJE SU VEĆ DODELJENE OVOM NALOGU (dodeljuje kancelarija pri kreiranju)
        let rows = [];
        try {
            const { data } = await supabase.from("magacin").select("*").ilike("dodeljeno_nalogu", "%" + broj + "%").limit(60);
            rows = data || [];
        } catch (e) { }
        setRolls(rows);
    }

    function tryCheck(text) {
        const code = qrCode(text).toUpperCase();
        const r = rolls.find((x) => String(x.qr_code || "").toUpperCase() === code || String(x.br_rolne || "").toUpperCase() === code);
        if (!r) { msg && msg("Rolna nije na listi ovog naloga (" + qrCode(text) + ")", "err"); return false; }
        if (scanned[r.id]) { msg && msg("Rolna je već čekirana.", "err"); return true; }
        setScanned((p) => ({ ...p, [r.id]: true }));
        msg && msg("✓ " + (r.br_rolne || r.qr_code) + " spremljeno", "ok");
        return true;
    }

    async function potvrdi() {
        if (!open) return;
        setSaving(true);
        try {
            await supabase.from("operativni_nalozi").update({ status: "spremljeno" }).eq("id", open.op.id);
            const ids = rolls.filter((r) => scanned[r.id]).map((r) => r.id);
            if (ids.length) { try { await supabase.from("magacin").update({ pripremljeno: true }).in("id", ids); } catch (e) { } }
            msg && msg("Nalog spremljen.", "ok");
            setOpen(null); load();
        } catch (e) { msg && msg("Greška: " + (e.message || e), "err"); }
        finally { setSaving(false); }
    }

    const wrap = { minHeight: "100vh", background: "#f1f5f9", padding: 12, color: "#0f172a", fontFamily: "Inter,system-ui,Arial,sans-serif" };
    const card = { background: "#fff", borderRadius: 14, padding: 14, marginBottom: 11, boxShadow: "0 2px 8px rgba(0,0,0,.07)" };
    const btn = { width: "100%", border: "none", borderRadius: 13, padding: 15, fontSize: 16, fontWeight: 900, cursor: "pointer" };
    const pill = (bg, c) => ({ fontSize: 11, fontWeight: 800, borderRadius: 7, padding: "3px 9px", background: bg, color: c });
    const fmt = (n) => Number(n || 0).toLocaleString("sr-RS");

    function Header({ title, sub }) {
        return (
            <div style={{ background: "#0f766e", color: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={open ? () => setOpen(null) : onBack} style={{ background: "rgba(255,255,255,.18)", border: "none", color: "#fff", borderRadius: 9, padding: "6px 10px", fontWeight: 900, cursor: "pointer" }}>‹</button>
                    <div><div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div><div style={{ fontSize: 12, opacity: .85 }}>{sub}</div></div>
                </div>
            </div>
        );
    }

    if (open) {
        const total = rolls.length;
        const done = rolls.filter((r) => scanned[r.id]).length;
        const allDone = total > 0 && done === total;
        return (
            <div style={wrap}>
                {scanOpen && <QRScannerModal onResult={(t) => { setScanOpen(false); tryCheck(t); }} onClose={() => setScanOpen(false)} />}
                <Header title={open.master.broj_naloga || open.op.broj_naloga || "Nalog"} sub={(open.master.kupac || "—") + " · " + (open.master.proizvod || open.master.naziv || "")} />

                <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 28 }}>📦</div>
                    <div><div style={{ fontWeight: 900, fontSize: 15 }}>Spremi rolne za ovaj nalog</div><div style={{ fontSize: 12, color: "#64748b" }}>Skeniraj QR svake rolne da je čekiraš.</div></div>
                    <div style={{ marginLeft: "auto", fontWeight: 950, fontSize: 18, color: allDone ? "#16a34a" : "#0f766e" }}>{done}/{total}</div>
                </div>

                {total === 0 && <div style={card}>Ovom nalogu još nisu dodeljene rolne. (Rolne dodeljuje kancelarija pri kreiranju naloga.)</div>}

                {rolls.map((r) => {
                    const on = !!scanned[r.id];
                    return (
                        <div key={r.id} style={{ ...card, marginBottom: 9, borderLeft: "5px solid " + (on ? "#16a34a" : "#f59e0b"), display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ width: 13, height: 13, borderRadius: "50%", background: vrstaColor(r.vrsta) }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 900, fontSize: 14 }}>{r.br_rolne || r.qr_code}</div>
                                <div style={{ fontSize: 12, color: "#64748b" }}>{(r.vrsta || "") + (r.oznaka_materijala ? " · " + r.oznaka_materijala : "") + (r.deb ? " · " + r.deb + "µ" : "")}</div>
                                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>📍 {r.lokacija || "—"} · š {r.sirina || "—"} mm · {fmt(r.kg_neto || r.kg)} kg</div>
                            </div>
                            <span style={pill(on ? "#dcfce7" : "#fef3c7", on ? "#15803d" : "#a16207")}>{on ? "✓ spremljeno" : "⏳ skeniraj"}</span>
                        </div>
                    );
                })}

                {total > 0 && (
                    <div style={{ position: "sticky", bottom: 0, paddingTop: 8 }}>
                        <button onClick={() => setScanOpen(true)} style={{ ...btn, background: "#0f172a", color: "#fff", marginBottom: 9 }}>📷 Skeniraj QR rolne</button>
                        <div style={{ display: "flex", gap: 8, marginBottom: 9 }}>
                            <input value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) { tryCheck(manual.trim()); setManual(""); } }} placeholder="ili unesi QR / broj rolne" style={{ flex: 1, border: "1px solid #cbd5e1", borderRadius: 11, padding: 13, fontSize: 14, fontWeight: 700 }} />
                            <button onClick={() => { if (manual.trim()) { tryCheck(manual.trim()); setManual(""); } }} style={{ ...btn, width: "auto", padding: "13px 16px", background: "#e2e8f0", color: "#334155" }}>OK</button>
                        </div>
                        <button disabled={!allDone || saving} onClick={potvrdi} style={{ ...btn, background: allDone && !saving ? "#16a34a" : "#cbd5e1", color: "#fff" }}>{saving ? "Čuvam..." : (allDone ? "✅ Potvrdi spremljeno" : "Skeniraj sve rolne (" + done + "/" + total + ")")}</button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={wrap}>
            <Header title="📋 Materijal za naloge" sub={"Magacioner: " + (operater?.ime || operater || "—")} />
            {loading && <div style={card}>Učitavam…</div>}
            {!loading && items.length === 0 && <div style={card}>Nema naloga koji čekaju materijal. 🎉</div>}
            {!loading && items.map((it, idx) => {
                const m = it.master;
                return (
                    <div key={idx} onClick={() => openNalog(it)} style={{ ...card, borderLeft: "5px solid #f59e0b", cursor: "pointer" }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "#0f766e" }}>{m.broj_naloga || it.op.broj_naloga || "—"}</div>
                        <div style={{ fontSize: 16, fontWeight: 900, marginTop: 2 }}>{m.kupac || "—"}</div>
                        <div style={{ fontSize: 13, color: "#475569" }}>{m.proizvod || m.naziv || ""}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                            <span style={pill("#fef3c7", "#a16207")}>⏳ Spremi materijal ›</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
