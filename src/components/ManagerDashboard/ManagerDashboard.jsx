import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase.js";
import {
    buildWorkersFromRad,
    buildSkartPoNalogu,
    buildSkartPoFazi,
    calcManagerKPIs,
    formatNumber,
    loadDashboardData,
    prepareNaloziPoDanima,
    prepareTopProizvodi,
    safeNumber
} from "../../dashboardShared.js";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts";

const RANGE_MAP = { danas: "1", nedelja: "7", mesec: "30", sve: "3650" };
const SKART_PRAG = 3; // % iznad kojeg radnik/nalog postaje crven (lako promeniti)

// Prikaz škarta: kg + (ako ima) metri koji nisu preračunati
function skartTxt(kg, m) {
    const parts = [];
    if (kg > 0) parts.push(formatNumber(kg, " kg"));
    if (m > 0) parts.push(formatNumber(m, " m"));
    return parts.length ? parts.join(" + ") : "—";
}

export default function ManagerDashboard() {
    const [range, setRange] = useState("mesec");
    const [activeTab, setActiveTab] = useState("radnici");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ nalozi: [], rolne: [], aktivnosti: [], proizvodi: [] });

    const days = RANGE_MAP[range] || "30";

    async function refresh() {
        setLoading(true);
        try {
            const loaded = await loadDashboardData(days);
            setData(loaded);
        } catch (e) {
            console.error("Manager dashboard greška:", e);
            alert("Greška pri učitavanju Manager Dashboarda: " + e.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
        // Debounce: realtime promene okidaju najviše 1 osvežavanje na ~4s (da se dashboard
        // ne preučitava na svaki upis kad ih bude puno).
        let t = null;
        const debounced = () => { if (t) clearTimeout(t); t = setTimeout(() => { refresh(); }, 4000); };
        const sub = supabase
            .channel("manager-dashboard-live")
            .on("postgres_changes", { event: "*", schema: "public", table: "operativni_nalozi" }, debounced)
            .on("postgres_changes", { event: "*", schema: "public", table: "magacin" }, debounced)
            .on("postgres_changes", { event: "*", schema: "public", table: "nalog_zastoji" }, debounced)
            .subscribe();

        return () => { if (t) clearTimeout(t); supabase.removeChannel(sub); };
    }, [days]);

    const kpi = useMemo(() => calcManagerKPIs(data), [data]);
    const workers = useMemo(() => buildWorkersFromRad(data), [data]);
    const filteredWorkers = useMemo(() => workers.filter(w => w.ime.toLowerCase().includes(search.toLowerCase()) || String(w.pozicija).toLowerCase().includes(search.toLowerCase())), [workers, search]);
    const chartData = useMemo(() => prepareNaloziPoDanima(data.nalozi, days), [data.nalozi, days]);
    const topProducts = useMemo(() => prepareTopProizvodi(data.nalozi), [data.nalozi]);
    const zastoji = useMemo(() => data.zastojiProd || [], [data.zastojiProd]);
    const skartNalozi = useMemo(() => buildSkartPoNalogu(data), [data]);
    const skartFaze = useMemo(() => buildSkartPoFazi(data), [data]);

    return (
        <div style={styles.page}>
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>📊 Manager Dashboard</h1>
                    <p style={styles.subtitle}>Kompletna statistika i analitika proizvodnje — isti izvor kao Dashboard PRO</p>
                </div>
                <div style={styles.rangeButtons}>
                    <button onClick={() => setRange("danas")} style={range === "danas" ? { ...styles.rangeBtn, ...styles.activeRange } : styles.rangeBtn}>▣ Danas</button>
                    <button onClick={() => setRange("nedelja")} style={range === "nedelja" ? { ...styles.rangeBtn, ...styles.activeRange } : styles.rangeBtn}>▦ Nedelja</button>
                    <button onClick={() => setRange("mesec")} style={range === "mesec" ? { ...styles.rangeBtn, ...styles.activeRange } : styles.rangeBtn}>▥ Mesec</button>
                    <button onClick={() => setRange("sve")} style={range === "sve" ? { ...styles.rangeBtn, ...styles.activeRange } : styles.rangeBtn}>∞ Sve</button>
                </div>
            </div>

            <div style={styles.syncInfo}>Izvor: <b>operativni_nalozi</b> (završene operacije) + <b>nalog_zastoji</b> · Period: <b>{days} dana</b> · broji se samo stvarni rad radnika (QR START/ZAVRŠI)</div>

            <div style={styles.bigGrid}>
                <BigCard color="#0f766e" label="Ukupno radnika" value={kpi.ukupnoRadnika} sub={`Aktivnih u periodu: ${kpi.aktivniRadnici}`} />
                <BigCard color="#7c3aed" label="Završenih faza" value={kpi.zavrseneFaze} sub="U periodu" />
                <BigCard color="#ea8500" label="Ukupno zastoja" value={kpi.ukupnoZastoja} sub="Zahteva pažnju" />
                <BigCard color="#0ea56a" label="Efikasnost" value={kpi.efikasnost === "—" ? "—" : `${kpi.efikasnost}%`} sub="Rad / (rad + zastoji)" />
            </div>

            <div style={styles.tabs}>
                {[
                    ["radnici", "👥 Radnici"],
                    ["skart", "🗑️ Škart"],
                    ["zastoji", "⏸️ Zastoji"],
                    ["top", "🏆 Top performeri"],
                    ["grafici", "📊 Grafici"]
                ].map(([id, label]) => <button key={id} onClick={() => setActiveTab(id)} style={activeTab === id ? { ...styles.tab, ...styles.tabActive } : styles.tab}>{label}</button>)}
            </div>

            <div style={styles.panel}>
                {loading ? <div style={styles.empty}>Učitavam...</div> : null}

                {activeTab === "radnici" && !loading && (
                    <>
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Pretraži radnike..." style={styles.search} />
                        {filteredWorkers.length === 0 ? <Empty text="Nema završenih operacija u izabranom periodu. Radnici se pojave čim završe operaciju preko QR-a (START → ZAVRŠI) — probaj širi period." /> : <div style={styles.workerGrid}>{filteredWorkers.map(w => <WorkerCard key={w.ime} worker={w} />)}</div>}
                    </>
                )}

                {activeTab === "skart" && !loading && (
                    <SkartView workers={workers} skartNalozi={skartNalozi} skartFaze={skartFaze} kpi={kpi} />
                )}

                {activeTab === "zastoji" && !loading && (
                    <div>
                        <h3 style={styles.sectionTitle}>⏸️ Zastoji u periodu</h3>
                        {zastoji.length === 0 ? <Empty text="Nema evidentiranih zastoja u ovom periodu." /> : zastoji.map((z, i) => <div key={z.id || i} style={styles.rowCard}><b>{z.masina || z.masina_naziv || "Mašina"}</b><span>{z.razlog || z.kategorija || "Zastoj"}{z.radnik ? " · " + z.radnik : ""}</span><em>{formatNumber(z.trajanje_min || 0, " min")}</em></div>)}
                    </div>
                )}

                {activeTab === "top" && !loading && (
                    <div>
                        <h3 style={styles.sectionTitle}>🏆 Top performeri</h3>
                        {workers.slice(0, 10).map((w, i) => <div key={w.ime} style={styles.rowCard}><b>#{i + 1} {w.ime}</b><span>{w.zavrseno} faza · {formatNumber(w.kolicina, " m")}</span><em>{w.efikasnost == null ? "—" : w.efikasnost + "%"}</em></div>)}
                        {workers.length === 0 && <Empty text="Nema podataka o radnicima." />}
                    </div>
                )}

                {activeTab === "grafici" && !loading && (
                    <div style={styles.chartsGrid}>
                        <ChartCard title="📈 Nalozi po danima">
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="datum" />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip />
                                    <Area dataKey="nalozi" type="monotone" stroke="#2563eb" fill="#93c5fd" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </ChartCard>
                        <ChartCard title="🏆 Top proizvodi">
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={topProducts} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis type="number" allowDecimals={false} />
                                    <YAxis dataKey="name" type="category" width={140} />
                                    <Tooltip />
                                    <Bar dataKey="count" fill="#667eea" radius={[0, 8, 8, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                )}
            </div>
        </div>
    );
}

function BigCard({ color, label, value, sub }) {
    return <div style={{ ...styles.bigCard, background: color }}><div style={styles.bigLabel}>{label}</div><div style={styles.bigValue}>{value}</div><div style={styles.bigSub}>{sub}</div></div>;
}

function WorkerCard({ worker }) {
    const crven = worker.skartPct != null && worker.skartPct > SKART_PRAG;
    return (
        <div style={{ ...styles.workerCard, ...(crven ? { border: "1px solid #fecaca", background: "#fef2f2" } : {}) }}>
            <div style={styles.workerTop}><div><div style={{ ...styles.workerName, ...(crven ? { color: "#b91c1c" } : {}) }}>{crven ? "⚠ " : "👤 "}{worker.ime}</div><div style={styles.workerPos}>{worker.pozicija}</div></div><span style={styles.online}>●</span></div>
            <div style={styles.workerStats}>
                <div><span>Završeno:</span><b>{worker.zavrseno}</b></div>
                <div><span>Zastoji:</span><b style={{ color: "#ea8500" }}>{worker.zastoji}</b></div>
                <div><span>Urađeno:</span><b>{formatNumber(worker.kolicinaM, " m")}</b></div>
            </div>
            <div style={styles.workerMeta}>⚖️ Urađeno (kg): <b>{worker.kolicinaKg > 0 ? formatNumber(worker.kolicinaKg, " kg") : "—"}</b></div>
            <div style={styles.workerMeta}>🗑️ Škart: <b style={{ color: "#b45309" }}>{skartTxt(worker.skartUkupnoKg, worker.skartM)}</b></div>
            <div style={{ ...styles.effRow, marginBottom: 6 }}><span>% škarta (na kg):</span><b style={{ background: worker.skartPct == null ? "#f1f5f9" : crven ? "#fee2e2" : "#dcfce7", color: worker.skartPct == null ? "#64748b" : crven ? "#b91c1c" : "#166534", borderRadius: 8, padding: "2px 8px" }}>{worker.skartPct == null ? "—" : worker.skartPct + " %"}</b></div>
            <div style={styles.workerMeta}>🏭 Mašina: <b>{worker.masina}</b></div>
            <div style={styles.effRow}><span>Efikasnost:</span><b>{worker.efikasnost == null ? "—" : worker.efikasnost + "%"}</b></div>
            <div style={styles.progressOuter}><div style={{ ...styles.progressInner, width: `${worker.efikasnost || 0}%` }} /></div>
        </div>
    );
}

// ---------- ŠKART: po radniku (crveno >3%), po nalogu (faze+radnici), po fazi ----------
function SkartView({ workers, skartNalozi, skartFaze, kpi }) {
    const uradjenoKg = workers.reduce((s, w) => s + safeNumber(w.kolicinaKg), 0);
    const ukupanSkartKg = safeNumber(kpi.skartKg);
    const ukupanSkartM = safeNumber(kpi.skartM);
    const prosekPct = uradjenoKg > 0 ? Math.round((ukupanSkartKg / uradjenoKg) * 1000) / 10 : null;
    const preko = workers.filter(w => w.skartPct != null && w.skartPct > SKART_PRAG).length;

    const th = { textAlign: "left", padding: "9px 10px", fontSize: 10, textTransform: "uppercase", color: "#475569", fontWeight: 800, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" };
    const td = { padding: "10px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 600, fontSize: 13, verticalAlign: "top" };
    const chip = { display: "inline-block", background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", borderRadius: 999, padding: "3px 9px", fontSize: 11.5, fontWeight: 800, margin: "2px 4px 2px 0" };
    const wchip = { display: "inline-block", background: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3", borderRadius: 999, padding: "3px 9px", fontSize: 11.5, fontWeight: 800, margin: "2px 4px 2px 0" };
    const big = { fontWeight: 950, color: "#b45309", fontSize: 15 };
    const pctBadge = (p) => ({ fontWeight: 950, borderRadius: 8, padding: "2px 8px", fontSize: 13, background: p == null ? "#f1f5f9" : p > SKART_PRAG ? "#fee2e2" : "#dcfce7", color: p == null ? "#64748b" : p > SKART_PRAG ? "#b91c1c" : "#166534" });

    return (
        <div>
            {/* KPI */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 11, marginBottom: 16 }}>
                <MiniKPI label="Ukupan škart" value={formatNumber(ukupanSkartKg, " kg")} color="#b45309" bg="#fffbeb" />
                <MiniKPI label="Urađeno ukupno" value={uradjenoKg > 0 ? formatNumber(uradjenoKg, " kg") : "—"} color="#0f172a" bg="#fff" />
                <MiniKPI label="Prosečan % škarta" value={prosekPct == null ? "—" : prosekPct + " %"} color={prosekPct != null && prosekPct > SKART_PRAG ? "#b91c1c" : "#166534"} bg="#fff" />
                <MiniKPI label={"Radnika preko " + SKART_PRAG + "%"} value={preko} color={preko ? "#b91c1c" : "#166534"} bg={preko ? "#fef2f2" : "#f0fdf4"} />
                {ukupanSkartM > 0 && <MiniKPI label="U metrima (neprerač.)" value={formatNumber(ukupanSkartM, " m")} color="#fff" bg="#0f172a" />}
            </div>

            {/* PO RADNIKU */}
            <div style={{ fontSize: 15, fontWeight: 900, margin: "4px 0 10px" }}>👷 Po radniku <span style={{ fontSize: 12, fontWeight: 700, color: "#b91c1c" }}>— preko {SKART_PRAG}% je crveno</span></div>
            <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 22 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{["Radnik", "Mašina", "Urađeno (m)", "Urađeno (kg)", "Škart", "Škart % (kg ÷ kg)"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                        {workers.length === 0 ? <tr><td style={td} colSpan={6}>Nema podataka o škartu u periodu.</td></tr> :
                            workers.map((w, i) => {
                                const crven = w.skartPct != null && w.skartPct > SKART_PRAG;
                                return (
                                    <tr key={i} style={crven ? { background: "#fef2f2" } : null}>
                                        <td style={{ ...td, fontWeight: 900, color: crven ? "#b91c1c" : "#0f172a", whiteSpace: "nowrap" }}>{crven ? "⚠ " : ""}{w.ime}</td>
                                        <td style={td}>{w.masina || "—"}</td>
                                        <td style={td}>{formatNumber(w.kolicinaM, " m")}</td>
                                        <td style={td}>{w.kolicinaKg > 0 ? formatNumber(w.kolicinaKg, " kg") : "—"}</td>
                                        <td style={{ ...td, ...big }}>{skartTxt(w.skartUkupnoKg, w.skartM)}</td>
                                        <td style={td}><span style={pctBadge(w.skartPct)}>{w.skartPct == null ? "—" : w.skartPct + " %"}</span></td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>

            {/* PO NALOGU */}
            <div style={{ fontSize: 15, fontWeight: 900, margin: "4px 0 10px" }}>📋 Po nalogu — razbijeno po fazama i radnicima</div>
            <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 22 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{["Nalog", "Ukupno škart", "Po fazama", "Po radniku"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                        {skartNalozi.length === 0 ? <tr><td style={td} colSpan={4}>Nema škarta po nalozima u periodu.</td></tr> :
                            skartNalozi.map((n, i) => (
                                <tr key={i}>
                                    <td style={{ ...td, whiteSpace: "nowrap" }}><div style={{ fontWeight: 900, fontSize: 14 }}>{n.nalog}</div>{n.proizvod ? <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{n.proizvod}</div> : null}</td>
                                    <td style={{ ...td, ...big }}>{skartTxt(n.kg, n.m)}</td>
                                    <td style={td}>{n.faze.map((f, j) => <span key={j} style={f.m > 0 && f.kg === 0 ? wchip : chip}>{f.naziv} {skartTxt(f.kg, f.m)}</span>)}</td>
                                    <td style={td}>{n.radnici.map((r, j) => <span key={j} style={wchip}>{r.ime} {skartTxt(r.kg, r.m)}</span>)}</td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            {/* PO FAZI */}
            <div style={{ fontSize: 15, fontWeight: 900, margin: "4px 0 10px" }}>🏭 Zbirno po fazi (svi nalozi)</div>
            <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{["Faza", "Škart (kg)", "Škart (m)", "Operacija"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                        {skartFaze.length === 0 ? <tr><td style={td} colSpan={4}>Nema škarta po fazama u periodu.</td></tr> :
                            skartFaze.map((f, i) => (
                                <tr key={i}>
                                    <td style={{ ...td, fontWeight: 900 }}>{f.faza}</td>
                                    <td style={{ ...td, ...big }}>{f.kg > 0 ? formatNumber(f.kg, " kg") : "—"}</td>
                                    <td style={{ ...td, fontWeight: 900, color: f.m > 0 ? "#4338ca" : "#94a3b8" }}>{f.m > 0 ? formatNumber(f.m, " m") : "—"}</td>
                                    <td style={td}>{f.broj}</td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function MiniKPI({ label, value, color, bg }) {
    return <div style={{ background: bg || "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 14 }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#64748b" }}>{label}</div><div style={{ fontSize: 22, fontWeight: 950, color: color || "#0f172a", marginTop: 4 }}>{value}</div></div>;
}

function ChartCard({ title, children }) { return <div style={styles.chartCard}><h3 style={styles.sectionTitle}>{title}</h3>{children}</div>; }
function Empty({ text }) { return <div style={styles.empty}>{text}</div>; }

const styles = {
    page: { background: "#1e40af", minHeight: "100vh", padding: 10 },
    header: { background: "white", borderRadius: 12, padding: 26, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    title: { margin: 0, fontSize: 28, fontWeight: 900 }, subtitle: { color: "#475569", fontSize: 13 }, rangeButtons: { display: "flex", gap: 10 }, rangeBtn: { padding: "10px 22px", borderRadius: 8, border: "1px solid #cbd5e1", background: "white", color: "#1e3a8a", fontWeight: 800, cursor: "pointer" }, activeRange: { background: "#1d4ed8", color: "white" },
    syncInfo: { background: "rgba(255,255,255,.9)", borderRadius: 8, padding: 12, marginBottom: 10, fontWeight: 800, color: "#0f172a" },
    bigGrid: { display: "grid", gridTemplateColumns: "repeat(4,minmax(170px,1fr))", gap: 12, marginBottom: 12 }, bigCard: { color: "white", borderRadius: 12, padding: 22, boxShadow: "0 8px 20px rgba(0,0,0,.14)" }, bigLabel: { fontWeight: 900, fontSize: 13 }, bigValue: { fontSize: 34, fontWeight: 900, marginTop: 12 }, bigSub: { fontSize: 12, opacity: .9, marginTop: 8 },
    tabs: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 12 }, tab: { padding: 14, border: 0, borderRadius: 10, background: "#3155b5", color: "white", fontWeight: 900, cursor: "pointer" }, tabActive: { background: "white", color: "#1e3a8a" },
    panel: { background: "white", borderRadius: 14, padding: 20, boxShadow: "0 8px 24px rgba(15,23,42,.12)" }, search: { width: "100%", boxSizing: "border-box", padding: 14, border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 18 }, workerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }, workerCard: { border: "1px solid #cbd5e1", borderRadius: 12, padding: 18, background: "white" }, workerTop: { display: "flex", justifyContent: "space-between" }, workerName: { fontWeight: 900, fontSize: 16 }, workerPos: { fontSize: 12, color: "#64748b", marginTop: 8 }, online: { background: "#dcfce7", color: "#16a34a", borderRadius: 8, padding: "2px 10px", height: 20 }, workerStats: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, background: "#f8fafc", borderRadius: 8, padding: 12, margin: "18px 0", fontSize: 12 }, workerMeta: { fontSize: 12, color: "#334155", marginBottom: 8 }, effRow: { display: "flex", justifyContent: "space-between", fontSize: 12 }, progressOuter: { height: 7, background: "#e2e8f0", borderRadius: 99, overflow: "hidden", marginTop: 6 }, progressInner: { height: "100%", background: "#2563eb" },
    sectionTitle: { margin: "0 0 14px", fontSize: 18, fontWeight: 900 }, rowCard: { display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: 12, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, marginBottom: 10 }, chartsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))", gap: 16 }, chartCard: { border: "1px solid #e2e8f0", borderRadius: 12, padding: 18 }, empty: { padding: 30, textAlign: "center", color: "#64748b", fontWeight: 800 }
};
