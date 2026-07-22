import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import {
    buildWorkersFromActivities,
    calculateDashboardKPIs,
    formatNumber,
    getOrderNumber,
    getProductName,
    loadDashboardData,
    prepareMagacinPoTipu,
    prepareNaloziPoDanima,
    prepareProizvodnjaPoDanima,
    prepareTopProizvodi,
    safeNumber
} from "./dashboardShared.js";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts";

const COLORS = {
    primary: "#667eea",
    purple: "#764ba2",
    blue: "#3b82f6",
    green: "#10b981",
    orange: "#f59e0b",
    red: "#ef4444",
    pink: "#ec4899",
    cyan: "#14b8a6",
    slate: "#64748b"
};

export default function DashboardPRO({ setPage }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ nalozi: [], rolne: [], aktivnosti: [], proizvodi: [] });
    const [timeRange, setTimeRange] = useState("30");
    const [selectedView, setSelectedView] = useState("overview");

    async function loadAllData() {
        setLoading(true);
        try {
            const loaded = await loadDashboardData(timeRange);
            setData(loaded);
        } catch (e) {
            console.error("Dashboard greška:", e);
            alert("Greška pri učitavanju dashboarda: " + e.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAllData();
        const sub = supabase
            .channel("dashboard-pro-live")
            .on("postgres_changes", { event: "*", schema: "public", table: "radni_nalozi" }, loadAllData)
            .on("postgres_changes", { event: "*", schema: "public", table: "operativni_nalozi" }, loadAllData)
            .on("postgres_changes", { event: "*", schema: "public", table: "magacin" }, loadAllData)
            .on("postgres_changes", { event: "*", schema: "public", table: "nalog_aktivnosti" }, loadAllData)
            .subscribe();

        const onChange = () => loadAllData();
        window.addEventListener("maropack:nalozi-changed", onChange);
        return () => {
            supabase.removeChannel(sub);
            window.removeEventListener("maropack:nalozi-changed", onChange);
        };
    }, [timeRange]);

    const kpi = useMemo(() => calculateDashboardKPIs(data), [data]);
    const naloziPoDanima = useMemo(() => prepareNaloziPoDanima(data.nalozi, timeRange), [data.nalozi, timeRange]);
    const proizvodnjaPoDanima = useMemo(() => prepareProizvodnjaPoDanima(data.aktivnosti), [data.aktivnosti]);
    const topProizvodi = useMemo(() => prepareTopProizvodi(data.nalozi), [data.nalozi]);
    const magacinPoTipu = useMemo(() => prepareMagacinPoTipu(data.rolne), [data.rolne]);
    const workers = useMemo(() => buildWorkersFromActivities(data.aktivnosti), [data.aktivnosti]);

    const statusDistribucija = [
        { name: "Aktivni", value: kpi.aktivniNalozi, color: COLORS.blue },
        { name: "Završeno", value: kpi.zavrseniNalozi, color: COLORS.green },
        { name: "Kasne", value: kpi.kasniNalozi, color: COLORS.red }
    ].filter(x => x.value > 0);

    if (loading) return <LoadingScreen />;

    return (
        <div style={styles.page}>
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>📊 Dashboard PRO</h1>
                    <p style={styles.subtitle}>Advanced Analytics & Real-time Monitoring — isti izvor kao Manager Dashboard</p>
                    <div style={styles.live}>● Real-time praćenje aktivno</div>
                </div>
                <div style={styles.headerActions}>
                    <select value={timeRange} onChange={e => setTimeRange(e.target.value)} style={styles.select}>
                        <option value="7">Poslednjih 7 dana</option>
                        <option value="30">Poslednjih 30 dana</option>
                        <option value="90">Poslednjih 90 dana</option>
                        <option value="365">Cela godina</option>
                    </select>
                    <button onClick={loadAllData} style={styles.headerBtn}>🔄 Osveži</button>
                    <button onClick={() => setPage && setPage("dashboard")} style={styles.headerBtn}>← Nazad</button>
                </div>
            </div>

            <div style={styles.syncInfo}>Izvor: <b>radni_nalozi + operativni_nalozi, magacin, nalog_aktivnosti</b> · Period: <b>{timeRange} dana</b></div>

            <div style={styles.kpiGrid}>
                <KPICard icon="📋" label="Ukupno naloga" value={kpi.ukupnoNaloga} color={COLORS.blue} />
                <KPICard icon="⚡" label="Aktivni nalozi" value={kpi.aktivniNalozi} subtitle={`${kpi.kasniNalozi} kasni`} color={COLORS.orange} />
                <KPICard icon="✅" label="Završeno" value={kpi.zavrseniNalozi} color={COLORS.green} />
                <KPICard icon="📦" label="Rolne na stanju" value={kpi.ukupnoRolni} subtitle="isto kao u Magacinu" color="#8b5cf6" />
                <KPICard icon="📏" label="Ukupno metara" value={formatNumber(kpi.ukupnoMetara, "m")} subtitle={`${formatNumber(kpi.slobodnoMetara, "m")} slobodno`} color={COLORS.pink} />
                <KPICard icon="💰" label="Vrednost magacina" value={formatNumber(kpi.vrednostMagacina, "€")} color="#0ea5e9" />
                <KPICard icon="⚖️" label="Ukupno kg" value={formatNumber(kpi.ukupnoKg, "kg")} color="#f97316" />
                <KPICard icon="👥" label="Aktivni radnici" value={kpi.aktivniRadnici} subtitle={`${kpi.ukupnoAktivnosti} aktivnosti`} color={COLORS.cyan} />
            </div>

            <div style={styles.tabs}>
                {[
                    ["overview", "📊 Pregled"],
                    ["nalozi", "📋 Analiza naloga"],
                    ["magacin", "📦 Magacin"],
                    ["analytics", "📈 Napredna analitika"]
                ].map(([id, label]) => (
                    <button key={id} onClick={() => setSelectedView(id)} style={selectedView === id ? { ...styles.tab, ...styles.tabActive } : styles.tab}>{label}</button>
                ))}
            </div>

            {selectedView === "overview" && (
                <div style={styles.gridGap}>
                    <ChartCard title="📈 Nalozi po danima" subtitle={`Poslednjih ${timeRange} dana`}>
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={naloziPoDanima}>
                                <defs>
                                    <linearGradient id="colorNalozi" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.75} />
                                        <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0.05} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="datum" style={{ fontSize: 12 }} />
                                <YAxis allowDecimals={false} style={{ fontSize: 12 }} />
                                <Tooltip />
                                <Area type="monotone" dataKey="nalozi" stroke={COLORS.primary} strokeWidth={3} fill="url(#colorNalozi)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <div style={styles.twoCols}>
                        <ChartCard title="📊 Status naloga" subtitle="Trenutna distribucija">
                            <ResponsiveContainer width="100%" height={280}>
                                <PieChart>
                                    <Pie data={statusDistribucija.length ? statusDistribucija : [{ name: "Nema podataka", value: 1, color: "#cbd5e1" }]} cx="50%" cy="50%" outerRadius={95} label dataKey="value">
                                        {(statusDistribucija.length ? statusDistribucija : [{ color: "#cbd5e1" }]).map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartCard>
                        <ChartCard title="🏆 Top proizvodi" subtitle="Po broju naloga">
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={topProizvodi} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis type="number" allowDecimals={false} />
                                    <YAxis dataKey="name" type="category" width={160} style={{ fontSize: 11 }} />
                                    <Tooltip />
                                    <Bar dataKey="count" fill={COLORS.primary} radius={[0, 8, 8, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                </div>
            )}

            {selectedView === "nalozi" && (
                <div style={styles.gridGap}>
                    <ChartCard title="🏭 Proizvodnja po danima" subtitle="Količina iz aktivnosti">
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={proizvodnjaPoDanima}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="datum" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="proizvedeno" stroke={COLORS.green} strokeWidth={3} />
                            </LineChart>
                        </ResponsiveContainer>
                    </ChartCard>
                    <ChartCard title="📋 Najnoviji nalozi" subtitle="Iz tabele nalozi">
                        <div style={{ overflowX: "auto" }}>
                            <table style={styles.table}>
                                <thead><tr><th>Broj</th><th>Proizvod</th><th>Količina</th><th>Urađeno</th><th>Status</th></tr></thead>
                                <tbody>{data.nalozi.slice(0, 12).map(n => <tr key={n.id}><td><b>{getOrderNumber(n)}</b></td><td>{getProductName(n)}</td><td>{formatNumber(n.kol || n.kolicina, "m")}</td><td>{formatNumber(n.uradjeno || n.proizvedeno, "m")}</td><td><StatusBadge status={n.status} /></td></tr>)}</tbody>
                            </table>
                        </div>
                    </ChartCard>
                </div>
            )}

            {selectedView === "magacin" && (
                <ChartCard title="📦 Magacin po tipu materijala" subtitle="Kg i metraža">
                    <ResponsiveContainer width="100%" height={340}>
                        <BarChart data={magacinPoTipu}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="tip" />
                            <YAxis yAxisId="left" />
                            <YAxis yAxisId="right" orientation="right" />
                            <Tooltip />
                            <Legend />
                            <Bar yAxisId="left" dataKey="kg" fill="#8b5cf6" name="Kg" />
                            <Bar yAxisId="right" dataKey="metara" fill={COLORS.pink} name="Metara" />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            )}

            {selectedView === "analytics" && (
                <div style={styles.twoCols}>
                    <ChartCard title="👥 Radnici" subtitle="Iz nalog_aktivnosti">
                        <div style={styles.workerMiniList}>{workers.map(w => <div key={w.ime} style={styles.workerMini}><b>{w.ime}</b><span>{w.aktivnosti} aktivnosti · {formatNumber(w.kolicina)}</span></div>)}</div>
                    </ChartCard>
                    <ChartCard title="🎯 KPI" subtitle="Isti KPI engine kao Manager">
                        <Metric label="Stopa izvršenja" value={`${kpi.stopaIzvrsenja}%`} />
                        <Metric label="Prosečna vrednost" value={formatNumber(kpi.prosecnaVrednost, "€")} />
                        <Metric label="Zastoji" value={kpi.ukupnoZastoja} />
                    </ChartCard>
                </div>
            )}
        </div>
    );
}

function LoadingScreen() { return <div style={styles.loading}><div style={styles.spinner} /><b>Učitavam dashboard...</b></div>; }
function KPICard({ icon, label, value, subtitle, color }) { return <div style={{ ...styles.kpiCard, borderLeft: `5px solid ${color}` }}><div style={styles.kpiIcon}>{icon}</div><div style={styles.kpiLabel}>{label}</div><div style={styles.kpiValue}>{value}</div>{subtitle && <div style={styles.kpiSub}>{subtitle}</div>}</div>; }
function ChartCard({ title, subtitle, children }) { return <div style={styles.chartCard}><h3 style={styles.chartTitle}>{title}</h3>{subtitle && <p style={styles.chartSub}>{subtitle}</p>}{children}</div>; }
function Metric({ label, value }) { return <div style={styles.metric}><span>{label}</span><b>{value}</b></div>; }
function StatusBadge({ status }) { return <span style={styles.badge}>{status || "Novi"}</span>; }

const styles = {
    page: { padding: 20, background: "#f8fafc", minHeight: "100vh" },
    header: { background: "linear-gradient(135deg,#667eea 0%,#764ba2 100%)", borderRadius: 16, padding: 32, marginBottom: 18, color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 10px 40px rgba(102,126,234,.3)" },
    title: { fontSize: 32, fontWeight: 900, margin: 0 }, subtitle: { fontSize: 14, fontWeight: 700, opacity: .95 }, live: { fontSize: 12, color: "#bbf7d0", fontWeight: 800 }, headerActions: { display: "flex", gap: 10 }, select: { padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.5)", background: "rgba(255,255,255,.15)", color: "white", fontWeight: 800 }, headerBtn: { padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.5)", background: "rgba(255,255,255,.15)", color: "white", fontWeight: 800, cursor: "pointer" },
    syncInfo: { background: "white", borderRadius: 10, padding: 12, marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,.08)", fontSize: 13 },
    kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16, marginBottom: 18 }, kpiCard: { background: "white", borderRadius: 13, padding: 20, boxShadow: "0 2px 10px rgba(15,23,42,.08)" }, kpiIcon: { fontSize: 30, marginBottom: 10 }, kpiLabel: { fontSize: 11, fontWeight: 900, color: "#475569", textTransform: "uppercase" }, kpiValue: { fontSize: 30, fontWeight: 900, marginTop: 8 }, kpiSub: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
    tabs: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18 }, tab: { padding: 14, border: "1px solid #e2e8f0", borderRadius: 10, background: "white", fontWeight: 900, cursor: "pointer" }, tabActive: { background: "linear-gradient(135deg,#667eea,#764ba2)", color: "white" },
    gridGap: { display: "grid", gap: 18 }, twoCols: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))", gap: 18 }, chartCard: { background: "white", borderRadius: 14, padding: 24, boxShadow: "0 2px 10px rgba(15,23,42,.08)" }, chartTitle: { margin: 0, fontSize: 18, fontWeight: 900 }, chartSub: { marginTop: 6, color: "#64748b", fontSize: 13 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 }, badge: { background: "#dbeafe", color: "#1e40af", padding: "5px 10px", borderRadius: 7, fontWeight: 800, fontSize: 12 }, metric: { display: "flex", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid #e2e8f0" }, workerMiniList: { display: "grid", gap: 10 }, workerMini: { display: "flex", justifyContent: "space-between", border: "1px solid #e2e8f0", padding: 12, borderRadius: 10 }, loading: { minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc" }, spinner: { width: 60, height: 60, border: "6px solid #e2e8f0", borderTopColor: COLORS.primary, borderRadius: "50%", animation: "spin 1s linear infinite" }
};
