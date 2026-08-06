import React, { useMemo, useState } from "react";
import { MaterialText } from '../components/MaterialSelectorPRO.jsx';
import QRCode from "qrcode.react";
import { readProductionSessions } from "./LiveProductionMES.jsx";

const statusColor = {
  "Ceka": "#f59e0b",
  "U toku": "#3b82f6",
  "Završeno": "#10b981",
  "Stopirano": "#ef4444",
};

function broj(n) { return n?.ponBr || n?.broj_naloga || n?.broj || n?.master_broj || "—"; }
function op(n) { return n?.operacija || n?.naziv || n?.tip_naloga || "Operacija"; }
function tip(n) { return String(n?.tip || n?.tip_proizvoda || "folija").toLowerCase(); }

export default function MasterNalogView({ master, onBack, onOpenNalog, msg }) {
  const [tab, setTab] = useState("pregled");
  const nalozi = master?.nalozi || [];
  const first = nalozi[0] || master || {};
  const masterBroj = master?.broj || broj(first);
  const productionSessions = useMemo(() => readProductionSessions().filter((s) => String(s.master_nalog_id) === String(masterBroj)), [masterBroj]);

  const progress = useMemo(() => {
    const total = nalozi.length || 1;
    const done = nalozi.filter((n) => n.status === "Završeno").length;
    return Math.round((done / total) * 100);
  }, [nalozi]);

  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, boxShadow: "0 10px 30px rgba(15,23,42,0.06)" };
  const small = { color: "#64748b", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 };
  const tabs = [
    ["pregled", "Pregled"], ["materijali", "Materijali"], ["operacije", "Operacije"], ["qr", "QR"], ["istorija", "Istorija"]
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <button onClick={onBack} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 10, padding: "8px 12px", fontWeight: 900, cursor: "pointer", marginBottom: 10 }}>← Nazad</button>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950, color: "#0f172a" }}>🏭 Master nalog {masterBroj}</h2>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>{first.kupac || "—"} · {first.prod || first.proizvod || "—"}</div>
        </div>
        <button onClick={() => window.print()} style={{ border: "none", background: "#1d4ed8", color: "#fff", borderRadius: 12, padding: "11px 18px", fontWeight: 900, cursor: "pointer" }}>🖨️ Štampaj master</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ border: tab === k ? "none" : "1px solid #cbd5e1", background: tab === k ? "#1d4ed8" : "#fff", color: tab === k ? "#fff" : "#334155", borderRadius: 999, padding: "9px 14px", fontWeight: 900, cursor: "pointer" }}>{l}</button>)}
      </div>

      {tab === "pregled" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 16 }}>
          <div style={card}>
            <div style={small}>Osnovni podaci</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginTop: 12 }}>
              <div><b>Broj:</b><br />{masterBroj}</div>
              <div><b>Tip:</b><br />{tip(first).toUpperCase()}</div>
              <div><b>Kupac:</b><br />{first.kupac || "—"}</div>
              <div><b>Proizvod:</b><br />{first.prod || first.proizvod || "—"}</div>
              <div><b>Količina:</b><br />{first.kol || first.kolicina || "—"}</div>
              <div><b>Datum:</b><br />{first.datum || "—"}</div>
            </div>
          </div>
          <div style={card}>
            <div style={small}>Napredak</div>
            <div style={{ fontSize: 42, fontWeight: 950, color: "#059669", marginTop: 10 }}>{progress}%</div>
            <div style={{ height: 14, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}><div style={{ width: `${progress}%`, height: "100%", background: "#10b981" }} /></div>
            <div style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>{nalozi.filter(n => n.status === "Završeno").length}/{nalozi.length} operacija završeno</div>
          </div>
        </div>
      )}

      {tab === "materijali" && (
        <div style={card}>
          <div style={small}>Materijali / struktura</div>
          {(Array.isArray(first.mats) ? first.mats : []).length === 0 ? <div style={{ color: "#64748b", marginTop: 12 }}>Nema definisanih materijala.</div> :
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10, marginTop: 12 }}>
              {first.mats.map((m, i) => <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#f8fafc" }}><b>Sloj {i + 1}</b><div>{m.tip || m.materijal || "Materijal"} {m.deb || m.debljina || ""} µ</div><div style={{ color: "#64748b", fontSize: 12 }}>Kas: {m.kas || 0} · Lak: {m.lak || 0} · Štampa: {m.stamp ? "DA" : "NE"}</div></div>)}
            </div>}
        </div>
      )}

      {tab === "operacije" && (
        <div style={{ display: "grid", gap: 10 }}>
          {nalozi.map((n, i) => <div key={n.id || i} style={card}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 150px", gap: 12, alignItems: "center" }}>
              <div><div style={{ fontWeight: 950, color: "#1d4ed8" }}>{op(n)}</div><div style={{ color: "#64748b", fontSize: 13 }}>{n.tip_naloga || n.vrsta || "—"}</div></div>
              <div style={{ color: statusColor[n.status] || "#64748b", fontWeight: 950 }}>{n.status || "Ceka"}</div>
              <button onClick={() => onOpenNalog?.(n)} style={{ border: "none", background: "#0f172a", color: "#fff", borderRadius: 12, padding: "10px 12px", fontWeight: 900, cursor: "pointer" }}>Otvori nalog</button>
            </div>
          </div>)}
        </div>
      )}

      {tab === "qr" && (
        <div style={{ ...card, display: "grid", gridTemplateColumns: "220px 1fr", gap: 18, alignItems: "center" }}>
          <div style={{ background: "#fff", padding: 16, border: "1px solid #e2e8f0", borderRadius: 16, display: "inline-block" }}><QRCode value={`${window.location.origin}${window.location.pathname}?nalog=${encodeURIComponent(masterBroj)}`} size={180} /></div>
          <div><div style={small}>QR link master naloga</div><div style={{ fontWeight: 900, margin: "8px 0" }}>{`${window.location.origin}${window.location.pathname}?nalog=${masterBroj}`}</div><button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}?nalog=${masterBroj}`); msg?.("QR link kopiran"); }} style={{ border: "none", background: "#059669", color: "#fff", borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer" }}>Kopiraj link</button></div>
        </div>
      )}

      {tab === "istorija" && (
        <div style={card}>
          <div style={small}>Istorija proizvodnje / MES</div>
          {productionSessions.length === 0 ? (
            <div style={{ marginTop: 12, color: "#64748b" }}>Još nema startovanih production session zapisa za ovaj master nalog.</div>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {productionSessions.map((s) => (
                <div key={s.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#f8fafc" }}>
                  <b>{s.masina}</b> · {s.operacija} · <span style={{ color: "#1d4ed8", fontWeight: 900 }}>{s.status}</span>
                  <div style={{ color: "#64748b", fontSize: 13 }}>Radnik: {s.radnik} · Start: {s.start} · Stop: {s.stop || "u toku"}</div>
                  <div style={{ color: "#334155", fontSize: 13 }}>Količina: {s.kolicina || 0} · Škart: {s.skart || 0}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// V47_NALOG_FULL_MATERIAL_NAME: nalozi treba da prikazuju pun naziv materijala: VRSTA + OZNAKA + DEBLJINA, npr. BOPP FXCB 20µ.
