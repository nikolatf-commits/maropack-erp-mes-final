import React, { useMemo, useState } from "react";

function readRolne() {
  try { return JSON.parse(localStorage.getItem("maropack_rolne_magacin") || "[]"); } catch (e) { return []; }
}
function writeRolne(rolne) {
  try { localStorage.setItem("maropack_rolne_magacin", JSON.stringify(rolne)); } catch (e) {}
}
function addHistory(item) {
  try {
    const h = JSON.parse(localStorage.getItem("maropack_rolne_istorija") || "[]");
    localStorage.setItem("maropack_rolne_istorija", JSON.stringify([item, ...h]));
  } catch (e) {}
}

function getBroj(n) { return n?.ponBr || n?.broj_naloga || n?.broj || ""; }
function getTip(n) { return String(n?.tip || n?.tip_proizvoda || "").toLowerCase(); }

export default function QRWorkflow({ db = { nalozi: [] }, msg }) {
  const [radnik, setRadnik] = useState("");
  const [masina, setMasina] = useState("");
  const [nalog, setNalog] = useState("");
  const [rolna, setRolna] = useState("");
  const [log, setLog] = useState([]);

  const found = useMemo(() => (db.nalozi || []).find((n) => getBroj(n) === nalog || String(n.id || "") === nalog), [db, nalog]);
  const foundRoll = useMemo(() => readRolne().find((r) => r.qr === rolna || String(r.id || "") === rolna), [rolna]);
  const rollOk = foundRoll && foundRoll.status !== "potrosena";
  const ready = radnik && masina && nalog && rolna && found && rollOk;
  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.05)" };
  const input = { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #cbd5e1", boxSizing: "border-box" };

  function start() {
    if (!ready) { msg?.("Skeniraj radnika, mašinu, nalog i rolnu. Nalog mora postojati.", "err"); return; }
    const item = { vreme: new Date().toLocaleString("sr-RS"), radnik, masina, nalog, rolna, tip: getTip(found), operacija: found.operacija || found.naziv };
    const allRolne = readRolne();
    writeRolne(allRolne.map((r) => r.qr === foundRoll.qr ? { ...r, status: "rezervisana", master_nalog_id: found.master_nalog_id || found.ponBr || found.broj_naloga || nalog } : r));
    addHistory({ vreme: item.vreme, qr: foundRoll.qr, event: "START PROIZVODNJE", opis: `${radnik} · ${masina} · ${nalog}`, stanje: "rezervisana" });
    const next = [item, ...log];
    setLog(next);
    try { localStorage.setItem("maropack_qr_session_log", JSON.stringify(next)); } catch (e) {}
    msg?.("Start proizvodnje je evidentiran");
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>🔳 QR workflow proizvodnje</h2>
        <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Osnova za skeniranje: radnik → mašina → nalog → rolna → start.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Skenirani podaci</div>
          <div style={{ display: "grid", gap: 10 }}>
            <label><b>QR radnika</b><input style={input} value={radnik} onChange={(e) => setRadnik(e.target.value)} placeholder="RADNIK-001" /></label>
            <label><b>QR mašine</b><input style={input} value={masina} onChange={(e) => setMasina(e.target.value)} placeholder="MASINA-FLEXO-01" /></label>
            <label><b>QR naloga / broj naloga</b><input style={input} value={nalog} onChange={(e) => setNalog(e.target.value)} placeholder="MP-2026-0001" /></label>
            <label><b>QR rolne</b><input style={input} value={rolna} onChange={(e) => setRolna(e.target.value)} placeholder="ROLNA-0001" /></label>
            <button onClick={start} style={{ border: "none", background: ready ? "#059669" : "#94a3b8", color: "#fff", borderRadius: 12, padding: "12px 16px", fontWeight: 900, cursor: "pointer" }}>START proizvodnje</button>
          </div>
        </div>
        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Provera kompatibilnosti</div>
          {!nalog ? <div style={{ color: "#64748b" }}>Unesi ili skeniraj nalog.</div> : !found ? <div style={{ color: "#ef4444", fontWeight: 800 }}>Nalog nije pronađen u trenutnoj bazi.</div> : (
            <div style={{ display: "grid", gap: 8 }}>
              <div><b>Broj:</b> {getBroj(found)}</div>
              <div><b>Kupac:</b> {found.kupac || "—"}</div>
              <div><b>Proizvod:</b> {found.prod || found.proizvod || "—"}</div>
              <div><b>Operacija:</b> {found.operacija || found.naziv || "—"}</div>
              <div><b>Status:</b> {found.status || "Ceka"}</div>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#047857", borderRadius: 12, padding: 10, fontWeight: 800 }}>Nalog pronađen — spremno za proveru rolne.</div>
              {!rolna ? <div style={{ color: "#64748b" }}>Skeniraj rolnu za proveru magacina.</div> : !foundRoll ? <div style={{ color: "#ef4444", fontWeight: 800 }}>Rolna nije pronađena u magacinu.</div> : <div style={{ background: rollOk ? "#eff6ff" : "#fee2e2", border: "1px solid " + (rollOk ? "#bfdbfe" : "#fecaca"), color: rollOk ? "#1d4ed8" : "#991b1b", borderRadius: 12, padding: 10, fontWeight: 800 }}>Rolna: {foundRoll.materijal} · {foundRoll.sirina} mm · {foundRoll.duzina} m · {foundRoll.status}</div>}
            </div>
          )}
        </div>
      </div>
      <div style={card}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Session log</div>
        {log.length === 0 ? <div style={{ color: "#64748b" }}>Još nema startovanih sesija.</div> : log.map((x, i) => <div key={i} style={{ borderTop: "1px solid #e2e8f0", padding: "10px 0", fontSize: 13 }}><b>{x.vreme}</b> · {x.radnik} · {x.masina} · {x.nalog} · {x.rolna} · {x.operacija}</div>)}
      </div>
    </div>
  );
}
