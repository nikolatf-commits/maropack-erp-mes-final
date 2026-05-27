import React, { useMemo, useState } from "react";

const machines = [
  { id: "FLEXO-01", tip: "stampa", name: "Flexo štampa 1", speed: 180 },
  { id: "KAS-01", tip: "kasiranje", name: "Kaširka 1", speed: 220 },
  { id: "REZ-01", tip: "rezanje", name: "Rezač 1", speed: 260 },
  { id: "KESA-01", tip: "kesa", name: "Mašina za kese", speed: 120 },
  { id: "SPU-01", tip: "spulna", name: "Špulne", speed: 160 },
];

function matchMachine(n) {
  const op = String(n.operacija || n.naziv || n.tip_naloga || "").toLowerCase();
  return machines.find((m) => op.includes(m.tip)) || machines[2];
}

export default function ProductionPlannerPRO({ db = { nalozi: [] }, msg }) {
  const [priority, setPriority] = useState("standard");
  const plan = useMemo(() => {
    const open = (db.nalozi || []).filter((n) => n.status !== "Završeno");
    return open.map((n, idx) => {
      const m = matchMachine(n);
      const qty = Number(n.kol || n.kolicina || 10000) || 10000;
      const hours = Math.max(0.25, Math.round((qty / 1000 / m.speed) * 100) / 100);
      return { n, m, hours, order: idx + 1 };
    }).sort((a, b) => priority === "brzo" ? a.hours - b.hours : a.order - b.order);
  }, [db, priority]);
  const byMachine = machines.map((m) => ({ ...m, items: plan.filter((p) => p.m.id === m.id) }));
  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.05)" };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div><h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>📅 Plan proizvodnje PRO</h2><div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Prvi raspored po mašinama na osnovu operacije i količine.</div></div>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #cbd5e1", fontWeight: 800 }}><option value="standard">Standardni redosled</option><option value="brzo">Prvo kraći poslovi</option></select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
        {byMachine.map((m) => <div key={m.id} style={card}><div style={{ fontWeight: 900, color: "#1d4ed8" }}>{m.name}</div><div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>{m.id} · brzina {m.speed}</div>{m.items.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 13 }}>Nema otvorenih poslova.</div> : m.items.map((p, i) => <div key={(p.n.id || i)} style={{ borderTop: "1px solid #e2e8f0", padding: "10px 0" }}><b>{p.n.ponBr || p.n.broj_naloga}</b><div style={{ fontSize: 13 }}>{p.n.operacija || p.n.naziv}</div><div style={{ fontSize: 12, color: "#64748b" }}>{p.n.kupac || "—"} · procena {p.hours}h</div></div>)}</div>)}
      </div>
      <div style={card}><b>Napomena:</b> Ovo je osnovni plan. Sledeći korak je unos realnih brzina mašina, setup vremena, zastoja i AI optimizacije prioriteta.</div>
    </div>
  );
}
