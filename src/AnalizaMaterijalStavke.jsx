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
            // STVARNA POTROŠNJA čita se iz magacin_istorija (svaka promena rolne:
            // potrošnja, povrat, rezervacija...), jer se materijal skida ručno kroz
            // promene stanja rolni, a ne uvek kroz naloge/materijal_stavke.
            let query = supabase.from("magacin_istorija").select("*").order("created_at", { ascending: false });
            if (period !== "sve") {
                const d = new Date(); d.setDate(d.getDate() - Number(period));
                query = query.gte("created_at", d.toISOString());
            }
            const { data, error } = await query.limit(10000);
            if (error) throw error;

            // Pretvori svaki događaj istorije u "red" pogodan za grupisanje.
            // Uzimamo spec rolne iz nova_vrednost/stara_vrednost (jsonb).
            const num0 = (v) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : 0);
            const transf = (data || []).map(function (h) {
                const nv = (h.nova_vrednost && typeof h.nova_vrednost === "object") ? h.nova_vrednost : {};
                const sv = (h.stara_vrednost && typeof h.stara_vrednost === "object") ? h.stara_vrednost : {};
                const izvor = Object.keys(nv).length ? nv : sv;
                const akcija = String(h.akcija || h.tip_promene || "").toLowerCase();

                // promena metara: promena_m (može biti negativna = skinuto, pozitivna = vraćeno)
                let dM = h.promena_m != null ? Number(h.promena_m) : null;
                if (dM == null && h.metraza_pre != null && h.metraza_posle != null) {
                    dM = Number(h.metraza_posle) - Number(h.metraza_pre);
                }
                dM = Number.isFinite(dM) ? dM : 0;

                // potrošeno = koliko je skinuto sa stanja (negativna promena, ili akcija potrošnja/rezervacija)
                // vraćeno = koliko je vraćeno (pozitivna promena, ili akcija povrat)
                let potroseno = 0, vraceno = 0;
                const jePotrosnja = akcija.includes("potro") || akcija.includes("rezerv") || akcija.includes("izdat") || akcija.includes("iskor");
                const jePovrat = akcija.includes("povrat") || akcija.includes("vra");
                if (jePovrat || dM > 0) vraceno = Math.abs(dM);
                else if (jePotrosnja || dM < 0) potroseno = Math.abs(dM);

                // kg po metru ove rolne — primarno iz istorije (kg / metraža),
                // a ako toga nema, iz širine × g/m² sa TAČNIM koeficijentom materijala
                // (BOPP 0.91, PET 1.40, ALU 2.71, PAPIR gramatura...) iz baze materijala.
                const specKg = num0(izvor.kg_neto ?? izvor.kg ?? izvor.kg_bruto);
                const specM = num0(izvor.metraza_ost ?? izvor.metraza);
                const sir = num0(izvor.sirina);
                const deb = num0(izvor.deb ?? izvor.debljina);
                const gsm = num0(calculateGm2(izvor.vrsta, deb));  // pravi g/m² po vrsti materijala
                let kgPoM = (specKg > 0 && specM > 0) ? (specKg / specM) : 0;
                if (!kgPoM && sir > 0 && gsm > 0) kgPoM = (sir * gsm) / 1000000;  // kg/m = širina(mm) × g/m² / 1e6

                return {
                    nalog_ref: h.nalog_ponbr || nv.dodeljeno_nalogu || nv.za_nalog || sv.dodeljeno_nalogu || (h.nalog_id != null ? String(h.nalog_id) : null),
                    vrsta: izvor.vrsta || null,
                    pod_vrsta: izvor.pod_vrsta || null,
                    oznaka: izvor.oznaka_materijala || izvor.oznaka || null,
                    debljina: izvor.deb ?? izvor.debljina ?? null,
                    dobavljac: izvor.dobavljac || izvor.proizvodjac || null,
                    idealna_sirina: izvor.sirina ?? null,
                    kgPoM,
                    lot: izvor.lot || null,
                    potroseno, vraceno,
                    akcija,
                };
            }).filter(function (r) {
                // zadrži samo redove koji nose potrošnju ili povrat (stварnu promenu materijala)
                return (r.potroseno > 0 || r.vraceno > 0);
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
            m[k].izdato += num(r.potroseno);   // skinuto sa stanja
            m[k].vraceno += num(r.vraceno);    // vraćeno u magacin
            // kg = STVARNO potrošeni metri (skinuto − vraćeno po ovom događaju) × kg/m
            const netoM = Math.max(0, num(r.potroseno) - num(r.vraceno));
            m[k].kg += netoM * num(r.kgPoM);
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
            const netoM = Math.max(0, num(r.potroseno) - num(r.vraceno));
            m[k].potroseno += netoM;
            m[k].kg += netoM * num(r.kgPoM);   // kg iz stварно potrošenih metara
            m[k].rolni += 1;
        });
        return Object.values(m).filter((x) => x.potroseno > 0).sort((a, b) => b.potroseno - a.potroseno);
    }, [rows]);

    const kpi = useMemo(() => {
        const izdato = rows.reduce((s, r) => s + num(r.potroseno), 0);
        const vraceno = rows.reduce((s, r) => s + num(r.vraceno), 0);
        const kgNeto = rows.reduce((s, r) => {
            const netoM = Math.max(0, num(r.potroseno) - num(r.vraceno));
            return s + netoM * num(r.kgPoM);
        }, 0);
        return {
            plan: izdato,
            izdato: Math.max(0, izdato - vraceno),  // STVARNA potrošnja (neto metri)
            otpad: 0,
            kg: kgNeto,                             // STVARNO potrošeni kg
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
