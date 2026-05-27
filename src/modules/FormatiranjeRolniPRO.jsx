import React, { useEffect, useMemo, useState } from "react";
import { addWarehouseRoll } from "./RolneWarehouseEngine.jsx";

export default function FormatiranjeRolniPRO({ msg }) {
  const [sirina, setSirina] = useState(1440);
  const [duzina, setDuzina] = useState(12000);
  const [trake, setTrake] = useState("480,480,480");
  const [rolne, setRolne] = useState([]);
  const [materijal, setMaterijal] = useState("BOPP");
  const [parentQr, setParentQr] = useState("");

  useEffect(() => {
    try { setRolne(JSON.parse(localStorage.getItem("maropack_formatirane_rolne") || "[]")); } catch (e) {}
  }, []);
  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.05)" };
  const input = { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #cbd5e1", boxSizing: "border-box" };

  const plan = useMemo(() => {
    const widths = trake.split(/[,;\s]+/).map((x) => Number(x)).filter(Boolean);
    const used = widths.reduce((a, b) => a + b, 0);
    return { widths, used, waste: Math.max(0, Number(sirina) - used), ok: used <= Number(sirina) };
  }, [sirina, trake]);

  function prihvatiPlan() {
    if (!plan.ok || plan.widths.length === 0) { msg?.("Plan nije ispravan — širine prelaze matičnu rolnu.", "err"); return; }
    const stamp = Date.now();
    const nove = plan.widths.map((w, i) => ({ id: `FR-${stamp}-${i+1}`, materijal, parent_qr: parentQr, sirina: w, duzina: Number(duzina), qr: `ROLNA-${stamp}-${i+1}`, status: "formatirana", lokacija: "Magacin / formatirano", napomena: `Nastala formatiranjem iz ${parentQr || "matične rolne"}` }));
    nove.forEach((r) => addWarehouseRoll(r, "FORMATIRANJE"));
    const next = nove.concat(rolne);
    setRolne(next);
    try { localStorage.setItem("maropack_formatirane_rolne", JSON.stringify(next)); } catch (e) {}
    msg?.(`Kreirano ${nove.length} novih rolni sa QR kodovima i upisano u magacin`);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>🎞️ Formatiranje rolni PRO</h2>
        <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Plan formatiranja matične rolne u nove rolne sa QR kodovima.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Ulazni podaci</div>
          <div style={{ display: "grid", gap: 10 }}>
            <label><b>Materijal</b><input style={input} value={materijal} onChange={(e) => setMaterijal(e.target.value)} placeholder="BOPP / CPP / PET..." /></label>
            <label><b>QR matične rolne</b><input style={input} value={parentQr} onChange={(e) => setParentQr(e.target.value)} placeholder="ROLNA-2026-..." /></label>
            <label><b>Širina matične rolne mm</b><input style={input} type="number" value={sirina} onChange={(e) => setSirina(e.target.value)} /></label>
            <label><b>Dužina matične rolne m</b><input style={input} type="number" value={duzina} onChange={(e) => setDuzina(e.target.value)} /></label>
            <label><b>Izlazne širine mm</b><input style={input} value={trake} onChange={(e) => setTrake(e.target.value)} placeholder="480,480,480" /></label>
            <button onClick={prihvatiPlan} style={{ border: "none", background: plan.ok ? "#059669" : "#ef4444", color: "#fff", borderRadius: 12, padding: "12px 16px", fontWeight: 900, cursor: "pointer" }}>Prihvati plan i napravi QR rolne</button>
          </div>
        </div>
        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Grafički plan</div>
          <div style={{ display: "flex", height: 90, border: "1px solid #cbd5e1", borderRadius: 12, overflow: "hidden", background: "#f8fafc" }}>
            {plan.widths.map((w, i) => <div key={i} style={{ width: `${(w / Number(sirina)) * 100}%`, background: i % 2 ? "#dbeafe" : "#bfdbfe", borderRight: "1px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#1e3a8a" }}>{w} mm</div>)}
            {plan.waste > 0 && <div style={{ width: `${(plan.waste / Number(sirina)) * 100}%`, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#b91c1c" }}>otpad {plan.waste} mm</div>}
          </div>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            <div><b>Iskorišćeno:</b> {plan.used} mm</div><div><b>Otpad:</b> {plan.waste} mm</div><div><b>Status:</b> {plan.ok ? "OK" : "Prelazi širinu"}</div>
          </div>
        </div>
      </div>
      <div style={card}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Nove rolne nastale formatiranjem</div>
        {rolne.length === 0 ? <div style={{ color: "#64748b" }}>Nema kreiranih rolni.</div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>{rolne.map((r) => <div key={r.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><b>{r.qr}</b><div>{r.materijal || "—"} · {r.sirina} mm × {r.duzina} m</div><div style={{ color: "#059669", fontWeight: 800 }}>{r.status}</div><div style={{ color: "#64748b", fontSize: 12 }}>Parent: {r.parent_qr || "—"}</div></div>)}</div>}
      </div>
    </div>
  );
}
