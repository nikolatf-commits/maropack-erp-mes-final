import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase.js";
import {
  buildWorkersFromActivities,
  calculateDashboardKPIs,
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

const RANGE_MAP = { danas: "1", nedelja: "7", mesec: "30" };

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
    const sub = supabase
      .channel("manager-dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "nalozi" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "magacin" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "nalog_aktivnosti" }, refresh)
      .subscribe();

    return () => supabase.removeChannel(sub);
  }, [days]);

  const kpi = useMemo(() => calculateDashboardKPIs(data), [data]);
  const workers = useMemo(() => buildWorkersFromActivities(data.aktivnosti), [data.aktivnosti]);
  const filteredWorkers = useMemo(() => workers.filter(w => w.ime.toLowerCase().includes(search.toLowerCase()) || String(w.pozicija).toLowerCase().includes(search.toLowerCase())), [workers, search]);
  const chartData = useMemo(() => prepareNaloziPoDanima(data.nalozi, days), [data.nalozi, days]);
  const topProducts = useMemo(() => prepareTopProizvodi(data.nalozi), [data.nalozi]);
  const zastoji = useMemo(() => data.aktivnosti.filter(a => String(a.status || a.tip || a.vrsta || "").toLowerCase().includes("zastoj") || String(a.status || "").toLowerCase().includes("pauza")), [data.aktivnosti]);

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
        </div>
      </div>

      <div style={styles.syncInfo}>Isti izvor kao PRO: <b>nalozi, magacin, nalog_aktivnosti</b> · Period: <b>{days} dana</b> · Test/demo radnici nisu prikazani</div>

      <div style={styles.bigGrid}>
        <BigCard color="#0f766e" label="Ukupno radnika" value={kpi.aktivniRadnici} sub={`Aktivnih: ${kpi.aktivniRadnici}`} />
        <BigCard color="#7c3aed" label="Završenih faza" value={workers.reduce((s, w) => s + safeNumber(w.zavrseno), 0)} sub="U periodu" />
        <BigCard color="#ea8500" label="Ukupno zastoja" value={kpi.ukupnoZastoja} sub="Zahteva pažnju" />
        <BigCard color="#0ea56a" label="Efikasnost" value={`${kpi.stopaIzvrsenja}%`} sub="Prosečna vrednost" />
      </div>

      <div style={styles.tabs}>
        {[
          ["radnici", "👥 Radnici"],
          ["zastoji", "⏸️ Zastoji"],
          ["top", "🏆 Top performeri"],
          ["grafici", "📊 Grafici"]
        ].map(([id, label]) => <button key={id} onClick={() => setActiveTab(id)} style={activeTab === id ? { ...styles.tab, ...styles.tabActive } : styles.tab}>{label}</button>)}
      </div>

      <div style={styles.panel}>
        {loading ? <div style={styles.empty}>Učitavam...</div> : null}

        {activeTab === "radnici" && !loading && (
          <>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Pretraži stvarne radnike iz nalog_aktivnosti..." style={styles.search} />
            {filteredWorkers.length === 0 ? <Empty text="Nema radnika u izabranom periodu. Proveri da li nalog_aktivnosti ima radnik_ime/radnik." /> : <div style={styles.workerGrid}>{filteredWorkers.map(w => <WorkerCard key={w.ime} worker={w} />)}</div>}
          </>
        )}

        {activeTab === "zastoji" && !loading && (
          <div>
            <h3 style={styles.sectionTitle}>⏸️ Zastoji u periodu</h3>
            {zastoji.length === 0 ? <Empty text="Nema evidentiranih zastoja u ovom periodu." /> : zastoji.map((z, i) => <div key={i} style={styles.rowCard}><b>{z.masina || "Mašina"}</b><span>{z.razlog || z.status || z.tip || "Zastoj"}</span><em>{formatNumber(z.trajanje_min || z.trajanje || 0, " min")}</em></div>)}
          </div>
        )}

        {activeTab === "top" && !loading && (
          <div>
            <h3 style={styles.sectionTitle}>🏆 Top performeri</h3>
            {workers.slice(0, 10).map((w, i) => <div key={w.ime} style={styles.rowCard}><b>#{i + 1} {w.ime}</b><span>{formatNumber(w.kolicina)} količina · {w.aktivnosti} aktivnosti</span><em>{w.efikasnost}%</em></div>)}
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
  return (
    <div style={styles.workerCard}>
      <div style={styles.workerTop}><div><div style={styles.workerName}>👤 {worker.ime}</div><div style={styles.workerPos}>{worker.pozicija}</div></div><span style={styles.online}>●</span></div>
      <div style={styles.workerStats}>
        <div><span>Završeno:</span><b>{worker.zavrseno}</b></div>
        <div><span>Zastoji:</span><b style={{ color: "#ea8500" }}>{worker.zastoji}</b></div>
        <div><span>Količina:</span><b>{formatNumber(worker.kolicina)}</b></div>
      </div>
      <div style={styles.workerMeta}>⏱ Rad: <b>{formatNumber(worker.radMin, "min")}</b></div>
      <div style={styles.workerMeta}>🏭 Mašina: <b>{worker.masina}</b></div>
      <div style={styles.effRow}><span>Efikasnost:</span><b>{worker.efikasnost}%</b></div>
      <div style={styles.progressOuter}><div style={{ ...styles.progressInner, width: `${worker.efikasnost}%` }} /></div>
    </div>
  );
}

function ChartCard({ title, children }) { return <div style={styles.chartCard}><h3 style={styles.sectionTitle}>{title}</h3>{children}</div>; }
function Empty({ text }) { return <div style={styles.empty}>{text}</div>; }

const styles = {
  page: { background: "#1e40af", minHeight: "100vh", padding: 10 },
  header: { background: "white", borderRadius: 12, padding: 26, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { margin: 0, fontSize: 28, fontWeight: 900 }, subtitle: { color: "#475569", fontSize: 13 }, rangeButtons: { display: "flex", gap: 10 }, rangeBtn: { padding: "10px 22px", borderRadius: 8, border: "1px solid #cbd5e1", background: "white", color: "#1e3a8a", fontWeight: 800, cursor: "pointer" }, activeRange: { background: "#1d4ed8", color: "white" },
  syncInfo: { background: "rgba(255,255,255,.9)", borderRadius: 8, padding: 12, marginBottom: 10, fontWeight: 800, color: "#0f172a" },
  bigGrid: { display: "grid", gridTemplateColumns: "repeat(4,minmax(170px,1fr))", gap: 12, marginBottom: 12 }, bigCard: { color: "white", borderRadius: 12, padding: 22, boxShadow: "0 8px 20px rgba(0,0,0,.14)" }, bigLabel: { fontWeight: 900, fontSize: 13 }, bigValue: { fontSize: 34, fontWeight: 900, marginTop: 12 }, bigSub: { fontSize: 12, opacity: .9, marginTop: 8 },
  tabs: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 12 }, tab: { padding: 14, border: 0, borderRadius: 10, background: "#3155b5", color: "white", fontWeight: 900, cursor: "pointer" }, tabActive: { background: "white", color: "#1e3a8a" },
  panel: { background: "white", borderRadius: 14, padding: 20, boxShadow: "0 8px 24px rgba(15,23,42,.12)" }, search: { width: "100%", boxSizing: "border-box", padding: 14, border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 18 }, workerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }, workerCard: { border: "1px solid #cbd5e1", borderRadius: 12, padding: 18, background: "white" }, workerTop: { display: "flex", justifyContent: "space-between" }, workerName: { fontWeight: 900, fontSize: 16 }, workerPos: { fontSize: 12, color: "#64748b", marginTop: 8 }, online: { background: "#dcfce7", color: "#16a34a", borderRadius: 8, padding: "2px 10px", height: 20 }, workerStats: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, background: "#f8fafc", borderRadius: 8, padding: 12, margin: "18px 0", fontSize: 12 }, workerMeta: { fontSize: 12, color: "#334155", marginBottom: 8 }, effRow: { display: "flex", justifyContent: "space-between", fontSize: 12 }, progressOuter: { height: 7, background: "#e2e8f0", borderRadius: 99, overflow: "hidden", marginTop: 6 }, progressInner: { height: "100%", background: "#2563eb" },
  sectionTitle: { margin: "0 0 14px", fontSize: 18, fontWeight: 900 }, rowCard: { display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: 12, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, marginBottom: 10 }, chartsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))", gap: 16 }, chartCard: { border: "1px solid #e2e8f0", borderRadius: 12, padding: 18 }, empty: { padding: 30, textAlign: "center", color: "#64748b", fontWeight: 800 }
};
