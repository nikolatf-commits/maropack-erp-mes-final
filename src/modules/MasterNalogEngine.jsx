import React, { useMemo, useState } from "react";
import { MaterialText } from '../components/MaterialSelectorPRO.jsx';
import MasterNalogView from "./MasterNalogView.jsx";

const statusColor = {
  "Ceka": "#f59e0b",
  "U toku": "#3b82f6",
  "Završeno": "#10b981",
  "Stopirano": "#ef4444",
};

function getBroj(n) {
  return n?.ponBr || n?.broj_naloga || n?.broj || n?.master_broj || "Bez broja";
}

function normTip(t) {
  const s = String(t || "folija").toLowerCase();
  if (s.includes("kes")) return "kesa";
  if (s.includes("spul") || s.includes("špul")) return "spulna";
  return "folija";
}

function operationLabel(n) {
  return n?.operacija || n?.naziv || n?.tip_naloga || n?.vrsta || "Operacija";
}

export default function MasterNalogEngine({ db = { nalozi: [] }, setPage, setPregNalog, msg }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("svi");
  const [selectedMaster, setSelectedMaster] = useState(null);

  const masters = useMemo(() => {
    const source = Array.isArray(db.nalozi) ? db.nalozi : [];
    const grouped = {};
    source.forEach((n) => {
      const key = getBroj(n);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(n);
    });
    return Object.entries(grouped).map(([broj, nalozi]) => {
      const first = nalozi[0] || {};
      const done = nalozi.filter((n) => n.status === "Završeno").length;
      const active = nalozi.filter((n) => n.status === "U toku").length;
      const tip = normTip(first.tip || first.tip_proizvoda);
      const total = nalozi.length || 1;
      const progress = Math.round((done / total) * 100);
      return {
        broj,
        tip,
        kupac: first.kupac || first.klijent || "—",
        proizvod: first.prod || first.proizvod || first.naziv || "—",
        datum: first.datum || first.created_at || "—",
        nalozi,
        done,
        active,
        total,
        progress,
      };
    }).sort((a, b) => String(b.datum).localeCompare(String(a.datum)) || String(b.broj).localeCompare(String(a.broj)));
  }, [db]);

  const filtered = masters.filter((m) => {
    const q = query.trim().toLowerCase();
    const okQ = !q || [m.broj, m.kupac, m.proizvod, m.tip].join(" ").toLowerCase().includes(q);
    const okF = filter === "svi" || m.tip === filter;
    return okQ && okF;
  });

  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.05)" };

  if (selectedMaster) {
    return <MasterNalogView master={selectedMaster} msg={msg} onBack={() => setSelectedMaster(null)} onOpenNalog={(n) => { setPregNalog?.(n); setPage?.("nalozi"); }} />;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>🏭 Master nalog engine</h2>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Jedan master nalog grupiše sve operacije: materijal, štampa, kaširanje, rezanje, kesa, špulna i formatiranje.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["svi", "folija", "kesa", "spulna"].map((x) => (
            <button key={x} onClick={() => setFilter(x)} style={{ border: filter === x ? "none" : "1px solid #cbd5e1", background: filter === x ? "#1d4ed8" : "#fff", color: filter === x ? "#fff" : "#334155", borderRadius: 10, padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>{x === "svi" ? "Svi" : x}</button>
          ))}
        </div>
      </div>

      <div style={{ ...card, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pretraga po broju naloga, kupcu ili proizvodu..." style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid #cbd5e1", fontSize: 14 }} />
        <button onClick={() => { if (setPage) setPage("ponude"); }} style={{ border: "none", background: "#059669", color: "#fff", borderRadius: 12, padding: "12px 16px", fontWeight: 900, cursor: "pointer" }}>+ Iz ponude</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: "#64748b", padding: 48 }}>Nema master naloga za prikaz. Kreiraj naloge iz ponude.</div>
      ) : filtered.map((m) => (
        <div key={m.broj} style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 180px", gap: 14, alignItems: "start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#1d4ed8" }}>{m.broj}</div>
                <span style={{ background: m.tip === "kesa" ? "#dcfce7" : m.tip === "spulna" ? "#f3e8ff" : "#dbeafe", color: m.tip === "kesa" ? "#047857" : m.tip === "spulna" ? "#6d28d9" : "#1d4ed8", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 900 }}>{m.tip.toUpperCase()}</span>
              </div>
              <div style={{ marginTop: 8, fontWeight: 800 }}>{m.proizvod}</div>
              <div style={{ color: "#64748b", fontSize: 13 }}>Kupac: <b>{m.kupac}</b></div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800, marginBottom: 6 }}>Napredak proizvodnje</div>
              <div style={{ height: 12, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}><div style={{ width: `${m.progress}%`, height: "100%", background: "#10b981" }} /></div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>{m.done}/{m.total} operacija završeno · {m.active} u toku</div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <button onClick={() => setSelectedMaster(m)} style={{ border: "none", background: "#1d4ed8", color: "#fff", borderRadius: 12, padding: "10px 12px", fontWeight: 900, cursor: "pointer" }}>Otvori MASTER</button>
              <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}?nalog=${encodeURIComponent(m.broj)}`); msg?.("Link naloga kopiran"); }} style={{ border: "1px solid #cbd5e1", background: "#fff", color: "#334155", borderRadius: 12, padding: "10px 12px", fontWeight: 800, cursor: "pointer" }}>Kopiraj QR link</button>
            </div>
          </div>
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }}>
            {m.nalozi.map((n, idx) => (
              <div key={n.id || idx} onClick={() => { setPregNalog?.(n); setPage?.("nalozi"); }} style={{ border: `1px solid ${(statusColor[n.status] || "#94a3b8")}55`, background: `${statusColor[n.status] || "#94a3b8"}10`, borderRadius: 12, padding: 10, cursor: "pointer" }}>
                <div style={{ fontWeight: 900, fontSize: 12 }}>{operationLabel(n)}</div>
                <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b" }}><span>{n.tip_naloga || n.vrsta || "—"}</span><b style={{ color: statusColor[n.status] || "#64748b" }}>{n.status || "Ceka"}</b></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


// V47_NALOG_FULL_MATERIAL_NAME: nalozi treba da prikazuju pun naziv materijala: VRSTA + OZNAKA + DEBLJINA, npr. BOPP FXCB 20µ.
