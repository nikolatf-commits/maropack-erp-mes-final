import React, { useMemo, useState } from "react";

const BLUE = "#2563eb";
const GREEN = "#059669";
const ORANGE = "#f59e0b";
const RED = "#dc2626";
const PURPLE = "#7c3aed";
const SLATE = "#334155";

const initialRolls = [
  { id: "ROL-2026-00124", qr: "QR-ROL-2026-00124", materijal: "BOPP", oznaka: "FXC", debljina: "20µ", sirina: 840, metara: 18200, kg: 281, lot: "LOT-2511", sarza: "S-44/26", lokacija: "A-01-03", status: "dostupna", parent: "—", rezervisano: 0 },
  { id: "ROL-2026-00125", qr: "QR-ROL-2026-00125", materijal: "ALU", oznaka: "ALU7", debljina: "7µ", sirina: 840, metara: 16400, kg: 260, lot: "LOT-2509", sarza: "S-38/26", lokacija: "A-02-01", status: "rezervisana", parent: "—", rezervisano: 7200 },
  { id: "ROL-2026-00126", qr: "QR-ROL-2026-00126", materijal: "CPP", oznaka: "CPP35", debljina: "35µ", sirina: 840, metara: 22100, kg: 705, lot: "LOT-2515", sarza: "S-51/26", lokacija: "B-01-02", status: "dostupna", parent: "—", rezervisano: 0 },
  { id: "ROL-2026-00124-01", qr: "QR-ROL-2026-00124-01", materijal: "BOPP", oznaka: "FXC", debljina: "20µ", sirina: 420, metara: 9100, kg: 141, lot: "LOT-2511", sarza: "S-44/26", lokacija: "FORMAT-01", status: "formatirana", parent: "ROL-2026-00124", rezervisano: 0 },
];

const activeOrders = [
  { id: "RN-2026-0081", tip: "folija", kupac: "MWI", proizvod: "DUPLEX PA15 PE40 CRNI", kolicina: "72.000 m", status: "priprema", masina: "UTECO", operacija: "štampa" },
  { id: "RN-2026-0082", tip: "kesa", kupac: "Medomix", proizvod: "Magnezijum 3g", kolicina: "10.000 kom", status: "u radu", masina: "Kesa 2", operacija: "sečenje" },
  { id: "RN-2026-0083", tip: "špulna", kupac: "Smurfit", proizvod: "Špulna 8mm", kolicina: "17500 m", status: "pauza", masina: "Spulna 1", operacija: "namotavanje" },
];

const materialNeeds = [
  { sloj: "A", materijal: "BOPP FXC", potrebno: "72.000 m", sirina: "840 mm", kg: "1.180 kg", status: "poklopljeno", rola: "ROL-2026-00124" },
  { sloj: "B", materijal: "ALU 7", potrebno: "72.000 m", sirina: "840 mm", kg: "1.366 kg", status: "rezerviši", rola: "ROL-2026-00125" },
  { sloj: "C", materijal: "CPP 35", potrebno: "72.000 m", sirina: "840 mm", kg: "2.294 kg", status: "poklopljeno", rola: "ROL-2026-00126" },
];

const events = [
  { t: "08:12", type: "scan", text: "Operater skenirao RN-2026-0081" },
  { t: "08:15", type: "roll", text: "ROL-2026-00124 rezervisana za nalog" },
  { t: "08:44", type: "prod", text: "UTECO pokrenuta — operacija štampa" },
  { t: "09:20", type: "waste", text: "Prijavljen škart 28 kg" },
];

function Card({ children, style }) {
  return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, boxShadow: "0 10px 30px rgba(15,23,42,.06)", ...style }}>{children}</div>;
}

function Badge({ children, color = BLUE }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${color}30`, background: `${color}12`, color, borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: .2 }}>{children}</span>;
}

function Kpi({ label, value, sub, color }) {
  return <Card style={{ padding: 18 }}>
    <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: .5 }}>{label}</div>
    <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: color || "#0f172a" }}>{value}</div>
    <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", fontWeight: 700 }}>{sub}</div>
  </Card>;
}

function QRBox({ code, title }) {
  return <div style={{ border: "1px dashed #94a3b8", borderRadius: 14, padding: 14, background: "#f8fafc", textAlign: "center" }}>
    <div style={{ margin: "0 auto 10px", width: 86, height: 86, borderRadius: 10, background: "repeating-linear-gradient(45deg,#0f172a 0 6px,#fff 6px 12px)", border: "6px solid #fff", boxShadow: "0 0 0 1px #cbd5e1" }} />
    <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>{title}</div>
    <div style={{ fontSize: 12, fontWeight: 950, color: "#0f172a", marginTop: 4 }}>{code}</div>
  </div>;
}

function MESWorkflowPRO({ msg }) {
  const [rolls, setRolls] = useState(initialRolls);
  const [selected, setSelected] = useState(initialRolls[0]);
  const [scan, setScan] = useState("");
  const [activeTab, setActiveTab] = useState("potreba");

  const kpi = useMemo(() => ({
    ukupnoRolni: rolls.length,
    dostupno: rolls.filter(r => r.status === "dostupna").length,
    rezervisano: rolls.filter(r => r.status === "rezervisana").length,
    child: rolls.filter(r => r.parent !== "—").length,
  }), [rolls]);

  function reserveSelected() {
    setRolls(prev => prev.map(r => r.id === selected.id ? { ...r, status: "rezervisana", rezervisano: r.rezervisano || Math.min(5000, r.metara) } : r));
    setSelected(prev => ({ ...prev, status: "rezervisana", rezervisano: prev.rezervisano || Math.min(5000, prev.metara) }));
    msg && msg("Rola rezervisana za nalog");
  }

  function createChildRoll() {
    const child = { ...selected, id: selected.id + "-CH" + String(Date.now()).slice(-3), qr: "QR-" + selected.id + "-CH", sirina: Math.round(selected.sirina / 2), metara: Math.round(selected.metara / 2), kg: Math.round(selected.kg / 2), parent: selected.id, status: "formatirana", lokacija: "FORMAT-02", rezervisano: 0 };
    setRolls(prev => [child, ...prev]);
    setSelected(child);
    msg && msg("Kreirana child rola sa novim QR kodom");
  }

  const statusColor = s => s === "dostupna" ? GREEN : s === "rezervisana" ? ORANGE : s === "formatirana" ? PURPLE : s === "u radu" ? BLUE : RED;

  return <div style={{ padding: 24, background: "#f6f8fb", minHeight: "100vh" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 18 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 26, color: "#0f172a", fontWeight: 950 }}>QR + Potreba materijala + Live proizvodnja</h1>
          <Badge color={GREEN}>MES/WMS Control</Badge>
        </div>
        <div style={{ color: "#64748b", fontWeight: 700, marginTop: 5 }}>Jedan ekran za vezu naloga, magacina, QR rolni, rezervacija i proizvodnje.</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => msg && msg("Demo scan workflow spreman za povezivanje sa kamerom/skenerom")} style={{ border: "none", background: BLUE, color: "#fff", borderRadius: 12, padding: "11px 15px", fontWeight: 900, cursor: "pointer" }}>🔳 Pokreni QR scan</button>
        <button onClick={() => msg && msg("Plan rezervacije materijala spreman")} style={{ border: "1px solid #cbd5e1", background: "#fff", color: SLATE, borderRadius: 12, padding: "11px 15px", fontWeight: 900, cursor: "pointer" }}>📦 Rezerviši materijal</button>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 16 }}>
      <Kpi label="Aktivni nalozi" value={activeOrders.length} sub="folije / kese / špulne" color={BLUE} />
      <Kpi label="Rolne u sistemu" value={kpi.ukupnoRolni} sub={`${kpi.dostupno} dostupno · ${kpi.rezervisano} rezervisano`} color={GREEN} />
      <Kpi label="Parent / child" value={kpi.child} sub="formatirane role sa sledljivošću" color={PURPLE} />
      <Kpi label="Otvorene operacije" value="7" sub="štampa, rezanje, namotavanje" color={ORANGE} />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "290px minmax(0, 1fr) 360px", gap: 16, alignItems: "start" }}>
      <div style={{ display: "grid", gap: 14 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 950, color: "#0f172a", marginBottom: 12 }}>Kontrolni panel</div>
          <input value={scan} onChange={e => setScan(e.target.value)} placeholder="Skeniraj QR naloga ili rolne..." style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 12, padding: 12, fontWeight: 800, outline: "none" }} />
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {[
              ["🔳", "Scan naloga", "RN → operacije"],
              ["🏷️", "Scan rolne", "QR → LOT/lokacija"],
              ["✂️", "Formatiraj", "parent → child"],
              ["📦", "Rezerviši", "FIFO predlog"],
              ["⏱️", "Start proizvodnje", "radnik + mašina"],
            ].map((a, i) => <button key={i} style={{ textAlign: "left", border: "1px solid #e2e8f0", background: "#fff", borderRadius: 12, padding: 11, cursor: "pointer" }}>
              <b style={{ color: "#0f172a" }}>{a[0]} {a[1]}</b><br /><span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{a[2]}</span>
            </button>)}
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 950, color: "#0f172a", marginBottom: 12 }}>Aktivni nalozi</div>
          <div style={{ display: "grid", gap: 9 }}>
            {activeOrders.map(o => <div key={o.id} style={{ border: "1px solid #e2e8f0", borderRadius: 13, padding: 11, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{o.id}</b><Badge color={o.status === "u radu" ? GREEN : o.status === "pauza" ? ORANGE : BLUE}>{o.status}</Badge></div>
              <div style={{ fontSize: 12, color: "#475569", fontWeight: 800, marginTop: 7 }}>{o.kupac} · {o.proizvod}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 5 }}>{o.masina} · {o.operacija} · {o.kolicina}</div>
            </div>)}
          </div>
        </Card>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 950, color: "#0f172a" }}>Potreba materijala i stanje rolni</div>
            <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>Klik na rolnu otvara detalj, QR i istoriju desno.</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {["potreba", "rolne", "istorija"].map(t => <button key={t} onClick={() => setActiveTab(t)} style={{ border: activeTab === t ? `2px solid ${BLUE}` : "1px solid #cbd5e1", background: activeTab === t ? "#eff6ff" : "#fff", color: activeTab === t ? BLUE : SLATE, borderRadius: 999, padding: "8px 12px", fontWeight: 900, cursor: "pointer", textTransform: "capitalize" }}>{t}</button>)}
          </div>
        </div>

        {activeTab === "potreba" && <div style={{ padding: 16 }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 9px", fontSize: 13 }}>
            <thead><tr>{["Sloj", "Materijal", "Potrebno", "Širina", "Kg", "Predlog role", "Status"].map(h => <th key={h} style={{ textAlign: "left", color: "#64748b", fontSize: 11, textTransform: "uppercase", padding: "0 10px" }}>{h}</th>)}</tr></thead>
            <tbody>{materialNeeds.map((n, i) => <tr key={i} style={{ background: "#fff" }}>
              <td style={{ padding: 12, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, fontWeight: 950 }}>{n.sloj}</td>
              <td style={{ padding: 12, fontWeight: 850 }}>{n.materijal}</td>
              <td style={{ padding: 12 }}>{n.potrebno}</td>
              <td style={{ padding: 12 }}>{n.sirina}</td>
              <td style={{ padding: 12 }}>{n.kg}</td>
              <td style={{ padding: 12, color: BLUE, fontWeight: 950 }}>{n.rola}</td>
              <td style={{ padding: 12, borderTopRightRadius: 12, borderBottomRightRadius: 12 }}><Badge color={n.status === "poklopljeno" ? GREEN : ORANGE}>{n.status}</Badge></td>
            </tr>)}</tbody>
          </table>
        </div>}

        {activeTab === "rolne" && <div style={{ padding: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ position: "sticky", top: 0, background: "#f8fafc" }}><tr>{["QR", "Materijal", "Dimenzija", "Metara", "Kg", "LOT/Šarža", "Lokacija", "Status"].map(h => <th key={h} style={{ textAlign: "left", padding: "12px 10px", color: "#64748b", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
            <tbody>{rolls.map(r => <tr key={r.id} onClick={() => setSelected(r)} style={{ cursor: "pointer", background: selected.id === r.id ? "#eff6ff" : "#fff" }}>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7", fontWeight: 950, color: BLUE }}>{r.id}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7", fontWeight: 850 }}>{r.materijal} {r.oznaka}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7" }}>{r.debljina} · {r.sirina}mm</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7" }}>{r.metara.toLocaleString("sr-RS")}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7" }}>{r.kg}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7" }}>{r.lot}<br /><span style={{ color: "#64748b", fontSize: 11 }}>{r.sarza}</span></td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7", fontWeight: 850 }}>{r.lokacija}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7" }}><Badge color={statusColor(r.status)}>{r.status}</Badge></td>
            </tr>)}</tbody>
          </table>
        </div>}

        {activeTab === "istorija" && <div style={{ padding: 16, display: "grid", gap: 10 }}>
          {events.map((e, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 12, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 13, padding: 12, background: "#fff" }}>
            <b style={{ color: "#64748b" }}>{e.t}</b><span style={{ fontWeight: 800, color: "#0f172a" }}>{e.text}</span>
          </div>)}
        </div>}
      </Card>

      <div style={{ display: "grid", gap: 14 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 950, color: "#0f172a" }}>Detalj rolne</div>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>QR, sledljivost i akcije.</div>
            </div>
            <Badge color={statusColor(selected.status)}>{selected.status}</Badge>
          </div>
          <div style={{ marginTop: 14 }}><QRBox code={selected.qr} title={selected.id} /></div>
          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            {[
              ["Materijal", `${selected.materijal} ${selected.oznaka} ${selected.debljina}`],
              ["Širina", `${selected.sirina} mm`],
              ["Metraža", `${selected.metara.toLocaleString("sr-RS")} m`],
              ["Kg", `${selected.kg} kg`],
              ["LOT / šarža", `${selected.lot} / ${selected.sarza}`],
              ["Lokacija", selected.lokacija],
              ["Parent rola", selected.parent],
              ["Rezervisano", `${selected.rezervisano || 0} m`],
            ].map((r, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "115px 1fr", borderBottom: "1px solid #eef2f7", padding: "8px 0", fontSize: 12 }}><b style={{ color: "#64748b" }}>{r[0]}</b><span style={{ color: "#0f172a", fontWeight: 850 }}>{r[1]}</span></div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
            <button onClick={reserveSelected} style={{ border: "none", background: GREEN, color: "#fff", borderRadius: 11, padding: 10, fontWeight: 900, cursor: "pointer" }}>Rezerviši</button>
            <button onClick={createChildRoll} style={{ border: "none", background: PURPLE, color: "#fff", borderRadius: 11, padding: 10, fontWeight: 900, cursor: "pointer" }}>Child QR</button>
            <button style={{ border: "1px solid #cbd5e1", background: "#fff", color: SLATE, borderRadius: 11, padding: 10, fontWeight: 900, cursor: "pointer" }}>Skini m</button>
            <button style={{ border: "1px solid #cbd5e1", background: "#fff", color: SLATE, borderRadius: 11, padding: 10, fontWeight: 900, cursor: "pointer" }}>Etiketa</button>
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 950, color: "#0f172a", marginBottom: 10 }}>Live proizvodnja</div>
          <div style={{ display: "grid", gap: 9 }}>
            {["Skeniraj radnika", "Skeniraj mašinu", "Start operacije", "Pauza / problem", "Završi i upiši škart"].map((x, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 10px", fontWeight: 850, fontSize: 12 }}><span>{i + 1}. {x}</span><span style={{ color: GREEN }}>ready</span></div>)}
          </div>
        </Card>
      </div>
    </div>
  </div>;
}

export default MESWorkflowPRO;
