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
    const [alocMap, setAlocMap] = useState({});   // rollId -> alocirano_m (iz ledgera)
    const [stavkaMap, setStavkaMap] = useState({}); // rollId -> stavka (ledger red)
    const [izdato, setIzdato] = useState({});     // rollId -> izdato_m (uneto)
    const [mode, setMode] = useState("spremi");   // "spremi" | "izdaj"

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
        setOpen(it); setScanned({}); setRolls([]); setManual(""); setAlocMap({}); setStavkaMap({}); setIzdato({}); setMode("spremi");
        const broj = it.master.broj_naloga || it.op.broj_naloga || "";
        // ROLNE KOJE SU VEĆ DODELJENE OVOM NALOGU (dodeljuje kancelarija pri kreiranju)
        let rows = [];
        try {
            const { data } = await supabase.from("magacin").select("*").ilike("dodeljeno_nalogu", "%" + broj + "%").limit(60);
            rows = data || [];
        } catch (e) { }
        setRolls(rows);
        // Alokacija po rolni iz ledgera (materijal_stavke) — koliko ovaj nalog drži na svakoj rolni
        try {
            const ids = rows.map((r) => r.id).filter((x) => x != null);
            if (ids.length) {
                const { data: st } = await supabase.from("materijal_stavke").select("*").in("rolna_id", ids).in("status", ["rezervisano", "izdato"]).order("created_at", { ascending: true });
                const aMap = {}, sMap = {}, iMap = {};
                (st || []).forEach((s) => {
                    // preferiraj stavku ovog naloga (nalog_ref sadržan u dodeljeno_nalogu rolne)
                    const r = rows.find((x) => x.id === s.rolna_id);
                    const pripada = !broj || !r || String(r.dodeljeno_nalogu || "").includes(s.nalog_ref || "###");
                    if (pripada || aMap[s.rolna_id] == null) {
                        aMap[s.rolna_id] = num(s.alocirano_m);
                        sMap[s.rolna_id] = s;
                        iMap[s.rolna_id] = String(Math.round(Math.max(0, num(s.alocirano_m) - num(s.izdato_m))));
                    }
                });
                setAlocMap(aMap); setStavkaMap(sMap); setIzdato(iMap);
            }
        } catch (e) { }
    }

    function alocRolne(r) {
        if (alocMap[r.id] != null) return alocMap[r.id];
        if (num(r.rezervisano) > 0) return num(r.rezervisano);
        return num(r.metraza_ost ?? r.metraza);
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

    async function izdaj() {
        if (!open) return;
        setSaving(true);
        let izdatoUkupno = 0, brojRolni = 0;
        try {
            for (const r of rolls) {
                if (!scanned[r.id]) continue;
                const izdM = Math.round(Math.max(0, num(izdato[r.id] ?? alocRolne(r))));
                if (izdM <= 0) continue;
                const ukupno = num(r.metraza_ost ?? r.metraza);
                const noviOst = Math.max(0, ukupno - izdM);
                const noviRez = Math.max(0, num(r.rezervisano) - izdM);
                const status = noviOst <= 0 ? "Iskorišćeno" : (noviRez > 0 ? "Delimično rezervisano" : "Na stanju");
                // 1) magacin: skini metre, oslobodi rezervaciju za izdati deo
                await supabase.from("magacin").update({
                    metraza_ost: noviOst,
                    rezervisano: noviRez || null,
                    status,
                    pripremljeno: true,
                }).eq("id", r.id);
                // 2) ledger: upiši izdato_m u stavku ovog naloga
                const st = stavkaMap[r.id];
                if (st && st.id) {
                    const novoIzdato = num(st.izdato_m) + izdM;
                    await supabase.from("materijal_stavke").update({
                        izdato_m: novoIzdato,
                        status: "izdato",
                    }).eq("id", st.id);
                }
                izdatoUkupno += izdM; brojRolni += 1;
            }
            await supabase.from("operativni_nalozi").update({ status: "izdato" }).eq("id", open.op.id);
            msg && msg(`Izdato ${fmt(izdatoUkupno)} m sa ${brojRolni} rolni — skinuto sa stanja.`, "ok");
            setOpen(null); load();
        } catch (e) { msg && msg("Greška pri izdavanju: " + (e.message || e), "err"); }
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
                    const aloc = alocRolne(r);
                    const ostatak = num(r.metraza_ost ?? r.metraza);
                    return (
                        <div key={r.id} style={{ ...card, marginBottom: 9, borderLeft: "5px solid " + (on ? "#16a34a" : "#f59e0b") }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ width: 13, height: 13, borderRadius: "50%", background: vrstaColor(r.vrsta) }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 900, fontSize: 14 }}>{r.br_rolne || r.qr_code}</div>
                                    <div style={{ fontSize: 12, color: "#64748b" }}>{(r.vrsta || "") + (r.oznaka_materijala ? " · " + r.oznaka_materijala : "") + (r.deb ? " · " + r.deb + "µ" : "")}</div>
                                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>📍 {r.lokacija || "—"} · š {r.sirina || "—"} mm · na rolni {fmt(ostatak)} m · <b style={{ color: "#0f766e" }}>planirano {fmt(aloc)} m</b></div>
                                </div>
                                <span style={pill(on ? "#dcfce7" : "#fef3c7", on ? "#15803d" : "#a16207")}>{on ? "✓ skenirano" : "⏳ skeniraj"}</span>
                            </div>
                            {on && (
                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, paddingTop: 10, borderTop: "1px dashed #e2e8f0" }}>
                                    <span style={{ fontSize: 12.5, fontWeight: 800, color: "#475569" }}>📤 Izdaj (m):</span>
                                    <input type="number" value={izdato[r.id] ?? String(Math.round(aloc))} onChange={(e) => setIzdato((p) => ({ ...p, [r.id]: e.target.value }))}
                                        style={{ width: 120, border: "1.5px solid #0f766e", background: "#f0fdfa", borderRadius: 10, padding: "9px 11px", fontSize: 15, fontWeight: 900, color: "#0f766e", textAlign: "right" }} />
                                    <span style={{ fontSize: 11, color: "#94a3b8" }}>od {fmt(ostatak)} m</span>
                                    {num(izdato[r.id] ?? aloc) > ostatak && <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 800 }}>⚠ više nego na rolni</span>}
                                </div>
                            )}
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
                        <button disabled={!allDone || saving} onClick={izdaj} style={{ ...btn, background: allDone && !saving ? "#16a34a" : "#cbd5e1", color: "#fff", marginBottom: 8 }}>{saving ? "Izdajem..." : (allDone ? "📤 Izdaj i skini sa stanja" : "Skeniraj sve rolne (" + done + "/" + total + ")")}</button>
                        <button disabled={saving} onClick={potvrdi} style={{ ...btn, background: "#fff", color: "#475569", border: "1.5px solid #cbd5e1", fontSize: 13, padding: 11 }}>Samo spremljeno (bez skidanja metara)</button>
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
