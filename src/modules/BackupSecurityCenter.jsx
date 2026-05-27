import React, { useMemo, useState } from "react";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, boxShadow: "0 6px 20px rgba(15,23,42,.05)" };

function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BackupSecurityCenter({ db }) {
  const [lastExport, setLastExport] = useState(null);
  const snapshot = useMemo(() => ({
    exported_at: new Date().toISOString(),
    app: "MAROPACK ERP/MES",
    version: "V18",
    data: db || {},
  }), [db]);

  function exportAll() {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadJson(`maropack-backup-${stamp}.json`, snapshot);
    setLastExport(new Date().toLocaleString("sr-RS"));
  }

  const checklist = [
    ["RLS uključen", "Sve glavne tabele treba da imaju Row Level Security."],
    ["Uloge korisnika", "admin, manager, planer, magacin, radnik, qc."],
    ["Backup", "Dnevni Supabase backup + lokalni JSON export pre velikih izmena."],
    ["Audit log", "Svaka kritična izmena treba da ide u audit log."],
    ["Env tajne", "Nikad ne slati .env fajl u GitHub."],
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>🛡️ Backup & Security</h2>
        <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Kontrola pre deploy-a: export podataka, RLS pravila, korisničke uloge i sigurnosni checklist.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Lokalni JSON backup</h3>
          <p style={{ color: "#64748b", fontSize: 13 }}>Izvoz trenutnog lokalnog stanja aplikacije. Za produkciju koristi i Supabase backup.</p>
          <button onClick={exportAll} style={{ border: "none", background: "#16a34a", color: "white", borderRadius: 10, padding: "10px 14px", fontWeight: 800, cursor: "pointer" }}>Preuzmi backup</button>
          {lastExport && <div style={{ marginTop: 10, fontSize: 12, color: "#475569" }}>Poslednji export: <b>{lastExport}</b></div>}
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Deploy pravila</h3>
          <ul style={{ color: "#475569", lineHeight: 1.8, paddingLeft: 18 }}>
            <li>Production deploy samo iz stabilne verzije.</li>
            <li>Pre deploy-a pokrenuti <b>npm run build</b>.</li>
            <li>Ne commitovati <b>.env</b>.</li>
            <li>Napraviti backup pre SQL migracija.</li>
          </ul>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Security checklist</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {checklist.map(([a, b]) => (
            <div key={a} style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 10, padding: 10, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <b>{a}</b><span style={{ color: "#64748b" }}>{b}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
