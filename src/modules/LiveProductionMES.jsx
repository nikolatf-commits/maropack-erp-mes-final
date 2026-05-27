import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode.react";

const LS_SESSIONS = "maropack_production_sessions";
const LS_EVENTS = "maropack_production_events";
const LS_ROLNE = "maropack_rolne_magacin";

function readLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (e) { return fallback; }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
function uid(prefix) { return `${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`; }
function now() { return new Date().toLocaleString("sr-RS"); }
function minutesBetween(a, b) {
  if (!a) return 0;
  const d1 = new Date(a);
  const d2 = b ? new Date(b) : new Date();
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 0;
  return Math.max(0, Math.round((d2 - d1) / 60000));
}
function statusColor(status) {
  if (status === "radi") return "#059669";
  if (status === "zastoj") return "#dc2626";
  if (status === "setup") return "#f59e0b";
  if (status === "zavrseno") return "#2563eb";
  return "#64748b";
}

export function readProductionSessions() {
  return readLS(LS_SESSIONS, []);
}

export function addProductionEvent(event) {
  const events = readLS(LS_EVENTS, []);
  const item = { id: uid("EVT"), vreme: new Date().toISOString(), vreme_label: now(), ...event };
  writeLS(LS_EVENTS, [item, ...events]);
  return item;
}

export default function LiveProductionMES({ db = {}, msg }) {
  const [tab, setTab] = useState("tablet");
  const [sessions, setSessions] = useState([]);
  const [events, setEvents] = useState([]);
  const [rolne, setRolne] = useState([]);
  const [form, setForm] = useState({
    radnik: "Operator 1",
    masina: "Štampa 1",
    master_nalog_id: "",
    nalog_id: "",
    rolna_qr: "",
    operacija: "štampa",
  });
  const [finish, setFinish] = useState({ kolicina: 0, skart: 0, napomena: "" });

  function reload() {
    setSessions(readLS(LS_SESSIONS, []));
    setEvents(readLS(LS_EVENTS, []));
    setRolne(readLS(LS_ROLNE, []));
  }
  useEffect(reload, []);

  const active = useMemo(() => sessions.find((s) => s.status === "radi" || s.status === "zastoj" || s.status === "setup"), [sessions]);
  const stats = useMemo(() => {
    const aktivne = sessions.filter((s) => ["radi", "zastoj", "setup"].includes(s.status)).length;
    const finished = sessions.filter((s) => s.status === "zavrseno");
    const totalQty = finished.reduce((a, s) => a + Number(s.kolicina || 0), 0);
    const totalWaste = finished.reduce((a, s) => a + Number(s.skart || 0), 0);
    const downtime = events.filter((e) => e.tip === "ZASTOJ").reduce((a, e) => a + Number(e.trajanje_min || 0), 0);
    return { aktivne, zavrsene: finished.length, totalQty, totalWaste, downtime };
  }, [sessions, events]);

  const machines = useMemo(() => {
    const base = ["Štampa 1", "Štampa 2", "Kaširanje", "Rezanje", "Kese", "Špulne", "Formatiranje"];
    const map = {};
    base.forEach((m) => { map[m] = { masina: m, status: "čeka", session: null }; });
    sessions.forEach((s) => {
      if (["radi", "zastoj", "setup"].includes(s.status)) map[s.masina] = { masina: s.masina, status: s.status, session: s };
    });
    return Object.values(map);
  }, [sessions]);

  function updateForm(field, value) { setForm((p) => ({ ...p, [field]: value })); }

  function startSession() {
    if (!form.radnik || !form.masina || !form.master_nalog_id) { msg?.("Unesi radnika, mašinu i master nalog", "err"); return; }
    if (form.rolna_qr) {
      const exists = rolne.some((r) => String(r.qr).toLowerCase() === String(form.rolna_qr).toLowerCase());
      if (!exists) { msg?.("Skenirana rolna ne postoji u magacinu", "err"); return; }
    }
    const item = {
      id: uid("SES"),
      ...form,
      status: "radi",
      start_iso: new Date().toISOString(),
      start: now(),
      stop_iso: "",
      stop: "",
      kolicina: 0,
      skart: 0,
      napomena: "",
    };
    const next = [item, ...sessions];
    writeLS(LS_SESSIONS, next);
    addProductionEvent({ tip: "START", session_id: item.id, master_nalog_id: item.master_nalog_id, masina: item.masina, radnik: item.radnik, opis: `Start ${item.operacija}` });
    reload();
    msg?.("Proizvodnja je startovana");
  }

  function setSessionStatus(session, status, reason = "") {
    const next = sessions.map((s) => s.id === session.id ? { ...s, status, zadnji_zastoj: reason || s.zadnji_zastoj || "" } : s);
    writeLS(LS_SESSIONS, next);
    addProductionEvent({ tip: status === "zastoj" ? "ZASTOJ" : status === "setup" ? "SETUP" : "STATUS", session_id: session.id, master_nalog_id: session.master_nalog_id, masina: session.masina, radnik: session.radnik, razlog: reason, opis: reason || `Status: ${status}` });
    reload();
    msg?.(`Status: ${status}`);
  }

  function finishSession(session) {
    const next = sessions.map((s) => s.id === session.id ? { ...s, status: "zavrseno", stop_iso: new Date().toISOString(), stop: now(), kolicina: Number(finish.kolicina || 0), skart: Number(finish.skart || 0), napomena: finish.napomena || "" } : s);
    writeLS(LS_SESSIONS, next);
    addProductionEvent({ tip: "STOP", session_id: session.id, master_nalog_id: session.master_nalog_id, masina: session.masina, radnik: session.radnik, kolicina: Number(finish.kolicina || 0), skart: Number(finish.skart || 0), opis: "Operacija završena" });
    setFinish({ kolicina: 0, skart: 0, napomena: "" });
    reload();
    msg?.("Operacija je završena");
  }

  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, boxShadow: "0 10px 30px rgba(15,23,42,0.06)" };
  const input = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 12, padding: "11px 12px", fontWeight: 700, boxSizing: "border-box" };
  const label = { display: "block", fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: 5 };
  const btn = { border: "none", borderRadius: 14, padding: "13px 18px", fontWeight: 950, cursor: "pointer" };
  const tabs = [["tablet", "Tablet režim"], ["live", "Live dashboard"], ["sessions", "Sesije"], ["zastoji", "Zastoji"], ["history", "Istorija"]];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950, color: "#0f172a" }}>🔴 Live Production MES</h2>
          <div style={{ color: "#64748b", fontSize: 13 }}>Start/stop proizvodnje, mašine, zastoji, škart i učinak radnika.</div>
        </div>
        <button onClick={reload} style={{ ...btn, background: "#0f172a", color: "#fff" }}>Osveži</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
        {[
          ["Aktivne", stats.aktivne, "#059669"], ["Završene", stats.zavrsene, "#2563eb"], ["Količina", stats.totalQty, "#7c3aed"], ["Škart", stats.totalWaste, "#dc2626"], ["Zastoj min", stats.downtime, "#f59e0b"]
        ].map(([l, v, c]) => <div key={l} style={card}><div style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>{l}</div><div style={{ fontSize: 26, fontWeight: 950, color: c }}>{v}</div></div>)}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ border: tab === k ? "none" : "1px solid #cbd5e1", background: tab === k ? "#1d4ed8" : "#fff", color: tab === k ? "#fff" : "#334155", borderRadius: 999, padding: "9px 14px", fontWeight: 900, cursor: "pointer" }}>{l}</button>)}
      </div>

      {tab === "tablet" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>▶️ Start operacije</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={label}>Radnik</label><input style={input} value={form.radnik} onChange={(e) => updateForm("radnik", e.target.value)} /></div>
              <div><label style={label}>Mašina</label><select style={input} value={form.masina} onChange={(e) => updateForm("masina", e.target.value)}>{machines.map((m) => <option key={m.masina}>{m.masina}</option>)}</select></div>
              <div><label style={label}>Master nalog / QR</label><input style={input} value={form.master_nalog_id} onChange={(e) => updateForm("master_nalog_id", e.target.value)} placeholder="npr. MP-2026-1234" /></div>
              <div><label style={label}>Operativni nalog</label><input style={input} value={form.nalog_id} onChange={(e) => updateForm("nalog_id", e.target.value)} /></div>
              <div><label style={label}>Rolna QR</label><input style={input} value={form.rolna_qr} onChange={(e) => updateForm("rolna_qr", e.target.value)} placeholder="skeniraj rolnu" /></div>
              <div><label style={label}>Operacija</label><select style={input} value={form.operacija} onChange={(e) => updateForm("operacija", e.target.value)}>{["materijal", "štampa", "kaširanje", "rezanje", "formatiranje", "kesa", "špulna", "QC"].map((x) => <option key={x}>{x}</option>)}</select></div>
            </div>
            <button onClick={startSession} style={{ ...btn, background: "#059669", color: "#fff", width: "100%", marginTop: 14, fontSize: 18 }}>START PROIZVODNJE</button>
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0 }}>⏱️ Aktivna operacija</h3>
            {!active ? <div style={{ color: "#64748b" }}>Nema aktivne sesije.</div> : (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ border: `2px solid ${statusColor(active.status)}`, borderRadius: 16, padding: 14, background: `${statusColor(active.status)}10` }}>
                  <div style={{ fontSize: 20, fontWeight: 950, color: statusColor(active.status) }}>{active.status.toUpperCase()}</div>
                  <div><b>{active.masina}</b> · {active.operacija}</div>
                  <div style={{ color: "#64748b", fontSize: 13 }}>Radnik: {active.radnik} · Start: {active.start}</div>
                  <div style={{ fontSize: 34, fontWeight: 950, marginTop: 8 }}>{minutesBetween(active.start_iso)} min</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <button onClick={() => setSessionStatus(active, "radi")} style={{ ...btn, background: "#059669", color: "#fff" }}>RAD</button>
                  <button onClick={() => setSessionStatus(active, "setup", "Setup / priprema")} style={{ ...btn, background: "#f59e0b", color: "#111827" }}>SETUP</button>
                  <button onClick={() => setSessionStatus(active, "zastoj", prompt("Razlog zastoja:", "Kvar / čekanje") || "Zastoj")} style={{ ...btn, background: "#dc2626", color: "#fff" }}>ZASTOJ</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><label style={label}>Dobijena količina</label><input type="number" style={input} value={finish.kolicina} onChange={(e) => setFinish((p) => ({ ...p, kolicina: e.target.value }))} /></div>
                  <div><label style={label}>Škart</label><input type="number" style={input} value={finish.skart} onChange={(e) => setFinish((p) => ({ ...p, skart: e.target.value }))} /></div>
                </div>
                <div><label style={label}>Napomena</label><input style={input} value={finish.napomena} onChange={(e) => setFinish((p) => ({ ...p, napomena: e.target.value }))} /></div>
                <button onClick={() => finishSession(active)} style={{ ...btn, background: "#1d4ed8", color: "#fff", width: "100%", fontSize: 18 }}>ZAVRŠI OPERACIJU</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "live" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
          {machines.map((m) => <div key={m.masina} style={{ ...card, borderTop: `5px solid ${statusColor(m.status)}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b>{m.masina}</b><span style={{ color: statusColor(m.status), fontWeight: 950 }}>{m.status}</span></div>
            {m.session ? <div style={{ marginTop: 10, color: "#475569", fontSize: 13 }}><div>Nalog: <b>{m.session.master_nalog_id}</b></div><div>Radnik: {m.session.radnik}</div><div>Vreme: {minutesBetween(m.session.start_iso)} min</div></div> : <div style={{ marginTop: 10, color: "#94a3b8" }}>Čeka nalog</div>}
          </div>)}
        </div>
      )}

      {tab === "sessions" && (
        <div style={{ display: "grid", gap: 10 }}>
          {sessions.map((s) => <div key={s.id} style={card}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 120px", gap: 12, alignItems: "center" }}>
              <div><b>{s.masina}</b> · {s.operacija}<div style={{ color: "#64748b", fontSize: 13 }}>{s.master_nalog_id} · {s.radnik} · {s.start}</div></div>
              <div style={{ color: statusColor(s.status), fontWeight: 950 }}>{s.status}</div>
              <div style={{ textAlign: "right", fontWeight: 900 }}>{minutesBetween(s.start_iso, s.stop_iso)} min</div>
            </div>
          </div>)}
        </div>
      )}

      {tab === "zastoji" && (
        <div style={{ display: "grid", gap: 10 }}>
          {events.filter((e) => e.tip === "ZASTOJ" || e.tip === "SETUP").map((e) => <div key={e.id} style={card}><b>{e.tip}</b> · {e.masina}<div style={{ color: "#64748b", fontSize: 13 }}>{e.vreme_label} · {e.radnik} · {e.opis || e.razlog}</div></div>)}
        </div>
      )}

      {tab === "history" && (
        <div style={{ display: "grid", gap: 8 }}>
          {events.map((e) => <div key={e.id} style={{ ...card, padding: 12 }}><b>{e.tip}</b> · {e.opis}<div style={{ color: "#64748b", fontSize: 12 }}>{e.vreme_label} · {e.master_nalog_id} · {e.masina} · {e.radnik}</div></div>)}
        </div>
      )}
    </div>
  );
}
