import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase.js";

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmt = (v, d = 0) => num(v).toLocaleString("sr-RS", { minimumFractionDigits: d, maximumFractionDigits: d });

// canonRef/jeMP dolaze iz zajedničkog modula — ista pravila kao planer i AI agent.
import { canonRef, jeMP, opKljuc } from "./utils/nalogMetrika.js";

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
            let query = supabase.from("materijal_stavke").select("*").order("created_at", { ascending: false });
            // SAMO materijali rezervisani/izdati kroz naloge — ne prikazuj početno stanje magacina,
            // ručne unose ni stavke bez veze sa nalogom.
            query = query.in("status", ["rezervisano", "izdato", "U proizvodnji", "Iskorišćeno", "Delimično rezervisano"]);
            if (period !== "sve") {
                const d = new Date(); d.setDate(d.getDate() - Number(period));
                query = query.gte("created_at", d.toISOString());
            }
            const { data, error } = await query.limit(5000);
            if (error) throw error;
            // Zadrži samo stavke stварno vezane za nalog (imaju nalog_ref).
            const samoNalozi = (data || []).filter(function (r) { return r.nalog_ref && String(r.nalog_ref).trim() && String(r.nalog_ref).trim() !== "—"; });

            // AUTO-DOPUNA IZDAVANJA: ako je operacija MATERIJAL završena, materijal je fizički
            // izdat — ali stariji nalozi su završeni pre nego što je radnički ekran počeo to da
            // upisuje, pa "Izdato" večno stoji na 0. Ovde se to popuni (idempotentno: dira SAMO
            // stavke gde je izdato_m prazno/0, upisuje izdato_m = alocirano_m i status "izdato").
            try {
                const { data: ops } = await supabase.from("operativni_nalozi")
                    .select("broj_naloga, broj, status, tip_naloga, vrsta, naziv").limit(2000);
                const refovi = new Set();
                (ops || []).forEach((o) => {
                    if (opKljuc(o) !== "materijal" || !/^zavr/i.test(String(o.status || ""))) return;
                    const b = String(o.broj_naloga || o.broj || "").trim();
                    if (b) { refovi.add(b); refovi.add(canonRef(b)); }
                });
                const zaUpis = samoNalozi.filter((r) => refovi.has(String(r.nalog_ref).trim()) && !(num(r.izdato_m) > 0));
                let upisano = 0, greska = null;
                for (const r of zaUpis) {
                    const res = await supabase.from("materijal_stavke")
                        .update({ izdato_m: num(r.alocirano_m), status: "izdato" }).eq("id", r.id);
                    if (res.error) { greska = res.error.message; break; }
                    r.izdato_m = num(r.alocirano_m); r.status = "izdato"; // odmah i u prikazu
                    upisano++;
                }
                if (upisano > 0) msg && msg("Naknadno upisano izdavanje za " + upisano + " stavki (operacija MATERIJAL završena).", "ok");
                if (greska) msg && msg("Izdavanje ne može da se upiše u bazu: " + greska, "err");
            } catch (e) { /* auto-dopuna ne sme da sruši analizu */ }

            setRows(samoNalozi);
        } catch (e) {
            msg && msg("Greška pri učitavanju analize: " + (e.message || e), "err");
            setRows([]);
        } finally { setLoading(false); }
    }

    // DEDUP: ista rolna sa istim alociranim metrima upisana pod DVA imena naloga
    // (MP broj + naziv kupca/proizvoda) = ista rezervacija dva puta → računa se JEDNOM,
    // prednost ima stavka sa MP brojem. Bez ovoga KPI "Planirano" duplira metre.
    const cisti = useMemo(() => {
        const rolnaKljuc = (r) => String(r.qr || r.qr_rolne || r.rolna || r.rolna_id || r.roll_qr || r.rolna_qr || "").trim();
        const potpis = (r) => (rolnaKljuc(r) || [r.vrsta, r.pod_vrsta, r.oznaka, r.debljina].map((x) => x || "").join("|")) + "::" + num(r.alocirano_m);
        const grupe = {};
        rows.forEach((r) => { const k = potpis(r); (grupe[k] = grupe[k] || []).push(r); });
        let out = []; let spojeno = 0;
        Object.values(grupe).forEach((list) => {
            const mp = list.filter((r) => jeMP(r.nalog_ref));
            if (mp.length && mp.length < list.length) { out.push(...mp); spojeno += list.length - mp.length; }
            else out.push(...list);
        });
        // PROLAZ 2 (grupni): duplikat upisan BEZ rolne i BEZ podataka o materijalu ne može
        // da se upari po potpisu — ali ako ne-MP grupa ima ISTE ukupne metre i ISTI broj
        // stavki kao neka MP grupa, to je ista rezervacija pod drugim imenom → izbaci je celu.
        const tot = {};
        out.forEach((r) => {
            const k = canonRef(r.nalog_ref) || "—";
            const t = (tot[k] = tot[k] || { mp: jeMP(r.nalog_ref), plan: 0, cnt: 0 });
            t.plan += num(r.alocirano_m); t.cnt += 1;
        });
        const dupGrupe = new Set();
        Object.entries(tot).forEach(([k, t]) => {
            if (t.mp) return;
            const par = Object.entries(tot).find(([k2, t2]) => t2.mp && t2.cnt === t.cnt && Math.abs(t2.plan - t.plan) <= 1);
            if (par) dupGrupe.add(k);
        });
        if (dupGrupe.size) {
            const pre = out.length;
            out = out.filter((r) => !dupGrupe.has(canonRef(r.nalog_ref) || "—"));
            spojeno += pre - out.length;
        }
        return { rows: out, spojeno };
    }, [rows]);
    const cRows = cisti.rows;

    const poNalogu = useMemo(() => {
        const m = {};
        cRows.forEach((r) => {
            const k = canonRef(r.nalog_ref) || "—";
            if (!m[k]) m[k] = { nalog: k, mp: jeMP(r.nalog_ref), plan: 0, izdato: 0, vraceno: 0, otpad: 0, kg: 0, rolni: 0, idealna: r.idealna_sirina || 0 };
            m[k].plan += num(r.alocirano_m); m[k].izdato += num(r.izdato_m); m[k].vraceno += num(r.vraceno_m);
            m[k].otpad += num(r.otpad_m); m[k].kg += num(r.kg_alocirano); m[k].rolni += 1;
            if (!m[k].idealna && r.idealna_sirina) m[k].idealna = r.idealna_sirina;
        });
        return Object.values(m).map((x) => ({
            ...x,
            utroseno: Math.max(0, x.izdato - x.vraceno),
            iskoriscenje: x.izdato > 0 ? Math.max(0, Math.min(100, ((x.izdato - x.otpad) / x.izdato) * 100)) : 0,
        })).sort((a, b) => b.plan - a.plan);
    }, [cRows]);

    const poMaterijalu = useMemo(() => {
        const m = {};
        cRows.forEach((r) => {
            const sirina = num(r.sirina || r.sirina_mm || r.sirina_rolne || r.rolna_sirina || r.width);
            const k = [r.vrsta, r.pod_vrsta, r.oznaka, r.debljina, sirina, r.dobavljac].map((x) => x || "").join("|");
            if (!m[k]) m[k] = { vrsta: r.vrsta || "—", pod_vrsta: r.pod_vrsta || "", oznaka: r.oznaka || "", debljina: r.debljina || "", sirina, dobavljac: r.dobavljac || "—", potroseno: 0, kg: 0, otpad: 0, rolni: 0 };
            const utroseno = Math.max(0, num(r.izdato_m) - num(r.vraceno_m)) || num(r.alocirano_m);
            m[k].potroseno += utroseno; m[k].kg += num(r.kg_alocirano); m[k].otpad += num(r.otpad_m); m[k].rolni += 1;
        });
        return Object.values(m).sort((a, b) => b.potroseno - a.potroseno);
    }, [cRows]);

    const kpi = useMemo(() => ({
        plan: cRows.reduce((s, r) => s + num(r.alocirano_m), 0),
        izdato: cRows.reduce((s, r) => s + num(r.izdato_m), 0),
        otpad: cRows.reduce((s, r) => s + num(r.otpad_m), 0),
        kg: cRows.reduce((s, r) => s + num(r.kg_alocirano), 0),
        nalozi: new Set(cRows.map((r) => canonRef(r.nalog_ref) || "—")).size,
    }), [cRows]);

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

            {cisti.spojeno > 0 && (
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: 12, padding: "10px 14px", fontSize: 12.5, fontWeight: 700, marginBottom: 14 }}>
                    ⚠️ {cisti.spojeno} {cisti.spojeno === 1 ? "duplirana stavka je spojena" : "dupliranih stavki je spojeno"}: ista rolna i količina bila je upisana pod dva imena naloga (MP broj + naziv). Računa se jednom, prednost ima MP broj.
                </div>
            )}

            {/* KPI */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11, marginBottom: 16 }}>
                <div style={{ ...card, padding: 14 }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#64748b" }}>Naloga</div><div style={{ fontSize: 24, fontWeight: 950 }}>{fmt(kpi.nalozi)}</div></div>
                <div style={{ ...card, padding: 14, background: "#eff6ff" }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#1d4ed8" }}>Planirano</div><div style={{ fontSize: 24, fontWeight: 950, color: "#1d4ed8" }}>{fmt(kpi.plan)} m</div></div>
                <div style={{ ...card, padding: 14, background: "#f0fdf4" }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#15803d" }}>Izdato</div><div style={{ fontSize: 24, fontWeight: 950, color: "#15803d" }}>{fmt(kpi.izdato)} m</div></div>
                <div style={{ ...card, padding: 14, background: "#fef2f2" }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#dc2626" }}>Otpad</div><div style={{ fontSize: 24, fontWeight: 950, color: "#dc2626" }}>{fmt(kpi.otpad)} m</div></div>
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
                                <thead><tr>{["Nalog", "Idealna š.", "Planirano", "Izdato", "Otpad", "kg", "Iskorišćenje"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {filtNalog.map((x, i) => (
                                        <tr key={i}>
                                            <td style={{ ...td, fontWeight: 900 }}>{x.nalog}{!x.mp && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 900, color: "#b45309", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, padding: "2px 6px", verticalAlign: "middle" }}>bez MP broja</span>}<div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 600 }}>{x.rolni} rolni</div></td>
                                            <td style={td}>{x.idealna ? fmt(x.idealna) + " mm" : "—"}</td>
                                            <td style={td}>
                                                <div style={{ fontWeight: 800 }}>{fmt(x.plan)} m</div>
                                                <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, marginTop: 3, overflow: "hidden" }}><div style={{ height: "100%", width: (x.plan / maxPlan * 100) + "%", background: "#1d4ed8" }} /></div>
                                            </td>
                                            <td style={{ ...td, color: "#15803d", fontWeight: 800 }}>{fmt(x.izdato)} m</td>
                                            <td style={{ ...td, color: x.otpad > 0 ? "#dc2626" : "#94a3b8", fontWeight: 800 }}>{fmt(x.otpad)} m</td>
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
                                <thead><tr>{["Vrsta", "Pod-vrsta", "Oznaka", "Deb.", "Širina", "Dobavljač", "Potrošeno", "kg", "Otpad m"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {filtMat.map((x, i) => (
                                        <tr key={i}>
                                            <td style={{ ...td, fontWeight: 900 }}>{x.vrsta}</td>
                                            <td style={td}>{x.pod_vrsta || "—"}</td>
                                            <td style={td}>{x.oznaka || "—"}</td>
                                            <td style={td}>{x.debljina ? x.debljina + "µ" : "—"}</td>
                                            <td style={td}>{x.sirina ? fmt(x.sirina) + " mm" : "—"}</td>
                                            <td style={td}>{x.dobavljac || "—"}</td>
                                            <td style={td}>
                                                <div style={{ fontWeight: 800 }}>{fmt(x.potroseno)} m</div>
                                                <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, marginTop: 3, overflow: "hidden" }}><div style={{ height: "100%", width: (x.potroseno / maxMat * 100) + "%", background: "#0d9488" }} /></div>
                                            </td>
                                            <td style={{ ...td, fontWeight: 800 }}>{fmt(x.kg, 1)}</td>
                                            <td style={{ ...td, color: x.otpad > 0 ? "#dc2626" : "#94a3b8", fontWeight: 800 }}>{fmt(x.otpad)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            )}
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10 }}>Iskorišćenje = (izdato − otpad) / izdato. Otpad = planirano − (izdato − vraćeno po prečniku).</div>
        </div>
    );
}
