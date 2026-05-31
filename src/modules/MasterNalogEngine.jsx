import React, { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { MaterialText } from "../components/MaterialSelectorPRO.jsx";
import { suggestRollsForAllLayers } from "../services/rollSuggestionEngine.js";

const NAVY = "#0b1b3f";
const BLUE = "#1d4ed8";
const GREEN = "#059669";
const ORANGE = "#f59e0b";
const RED = "#dc2626";
const card = { background: "#fff", border: "1px solid #dbe3ef", borderRadius: 16, padding: 16, boxShadow: "0 10px 26px rgba(15,23,42,.05)" };

function getBroj(n) { return n?.broj_naloga || n?.ponBr || n?.broj || n?.master_broj || "Bez broja"; }
function getLayers(n) { return Array.isArray(n?.materijali_struktura) ? n.materijali_struktura : []; }
function normTip(t) { const s = String(t || "folija").toLowerCase(); if (s.includes("kes")) return "kesa"; if (s.includes("spul") || s.includes("špul")) return "spulna"; return "folija"; }
function num(v) { return Number(String(v ?? "").replace(",", ".")) || 0; }
function readRolls(db) { return db?.rolne || db?.magacin || db?.warehouseRolls || []; }

export default function MasterNalogEngine({ db = { nalozi: [] }, setPage, setPregNalog, msg }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("svi");
  const [selected, setSelected] = useState(null);
  const rolls = readRolls(db);

  const masters = useMemo(() => {
    const source = Array.isArray(db.nalozi) ? db.nalozi : [];
    return source.map((n) => {
      const layers = getLayers(n);
      const suggestions = n.ai_predlog_rolni || suggestRollsForAllLayers(rolls, layers, { metraza: num(n.kolicina) || 0 });
      const totalOps = Array.isArray(n.operacije) ? n.operacije.length : 6;
      const doneOps = Array.isArray(n.operacije) ? n.operacije.filter(o => String(o.status).toLowerCase().includes("zav")).length : (String(n.status).toLowerCase().includes("zav") ? totalOps : 0);
      return {
        ...n,
        broj: getBroj(n),
        tipNorm: normTip(n.tip || n.tip_proizvoda),
        layers,
        suggestions,
        doneOps,
        totalOps,
        progress: Math.round((doneOps / Math.max(1, totalOps)) * 100),
      };
    }).sort((a,b) => String(b.datum || b.created_at || "").localeCompare(String(a.datum || a.created_at || "")));
  }, [db, rolls]);

  const filtered = masters.filter((m) => {
    const q = query.trim().toLowerCase();
    const text = [m.broj, m.kupac, m.proizvod, m.prod, m.naziv_proizvoda, m.tipNorm].join(" ").toLowerCase();
    return (!q || text.includes(q)) && (filter === "svi" || m.tipNorm === filter);
  });

  if (selected) return <NalogDetail nalog={selected} rolls={rolls} onBack={() => setSelected(null)} onOpen={() => { setPregNalog?.(selected); setPage?.("nalozi"); }} msg={msg} />;

  return <div style={{ display: "grid", gap: 16, padding: 18, background: "#f3f6fb", minHeight: "100vh" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div><h2 style={{ margin: 0, fontSize: 24, fontWeight: 950, color: NAVY }}>🏭 Master Nalog Engine PRO</h2><div style={{ color: "#64748b", marginTop: 4 }}>Nalozi povezani sa materijali_struktura, AI/FIFO predlogom rolni i proizvodnim statusom.</div></div>
      <div style={{ display: "flex", gap: 8 }}>{["svi", "folija", "kesa", "spulna"].map(x => <button key={x} onClick={() => setFilter(x)} style={btn(filter === x ? BLUE : "#fff", filter === x ? "#fff" : "#334155", "#cbd5e1")}>{x === "svi" ? "Svi" : x}</button>)}</div>
    </div>
    <div style={{ ...card, display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Pretraga po nalogu, kupcu, proizvodu..." style={input} /><button onClick={() => setPage?.("template_engine")} style={btn(GREEN, "#fff")}>+ Iz template-a</button></div>
    {filtered.length === 0 ? <div style={{ ...card, textAlign: "center", padding: 46, color: "#64748b" }}>Nema naloga za prikaz.</div> : filtered.map(n => <NalogCard key={n.id || n.broj} nalog={n} onClick={() => setSelected(n)} />)}
  </div>;
}

function NalogCard({ nalog, onClick }) {
  const layers = getLayers(nalog);
  const found = (nalog.suggestions || []).filter(x => x.best || x.predlozena_rolna).length;
  return <div style={card} onClick={onClick}>
    <div style={{ display: "grid", gridTemplateColumns: "1.3fr .9fr .8fr 160px", gap: 14, alignItems: "center" }}>
      <div><div style={{ display: "flex", alignItems: "center", gap: 9 }}><b style={{ fontSize: 18, color: BLUE }}>{nalog.broj}</b><span style={pill(GREEN)}>{(nalog.status || "Ceka").toUpperCase()}</span><span style={pill(BLUE)}>{nalog.tipNorm.toUpperCase()}</span></div><div style={{ marginTop: 7, fontWeight: 850 }}>{nalog.proizvod || nalog.prod || nalog.naziv_proizvoda || "—"}</div><div style={{ color: "#64748b", fontSize: 13 }}>Kupac: <b>{nalog.kupac || "—"}</b></div></div>
      <div><small style={cap}>Materijali</small><div style={{ marginTop: 6, fontWeight: 900 }}>{layers.length} slojeva</div><div style={{ fontSize: 12, color: found === layers.length ? GREEN : ORANGE }}>AI rolne: {found}/{layers.length}</div></div>
      <div><small style={cap}>Napredak</small><div style={{ height: 12, background: "#e2e8f0", borderRadius: 999, marginTop: 8, overflow: "hidden" }}><div style={{ width: `${nalog.progress || 0}%`, height: "100%", background: GREEN }} /></div><div style={{ fontSize: 12, color: "#64748b", marginTop: 5 }}>{nalog.progress || 0}%</div></div>
      <button style={btn(NAVY, "#fff")}>Otvori nalog →</button>
    </div>
  </div>;
}

function NalogDetail({ nalog, rolls, onBack, onOpen }) {
  const layers = getLayers(nalog);
  const suggestions = nalog.ai_predlog_rolni || suggestRollsForAllLayers(rolls, layers, { metraza: num(nalog.kolicina) || 0 });
  const found = suggestions.filter(x => x.best || x.predlozena_rolna).length;
  return <div style={{ padding: 18, background: "#f3f6fb", minHeight: "100vh", display: "grid", gap: 14 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><button onClick={onBack} style={btn("#fff", "#0f172a", "#cbd5e1")}>← Nazad</button><div style={{ display: "flex", gap: 8 }}><button onClick={onOpen} style={btn("#fff", "#0f172a", "#cbd5e1")}>Otvori stari pregled</button><button style={btn(BLUE, "#fff")}>✓ Završi nalog</button></div></div>
    <div style={{ background: NAVY, color: "#fff", borderRadius: 18, padding: 18, display: "grid", gridTemplateColumns: "1fr auto", gap: 18, alignItems: "center" }}>
      <div><h1 style={{ margin: 0 }}>{nalog.broj}</h1><div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, marginTop: 14 }}><Head label="Proizvod" value={nalog.proizvod || nalog.prod || nalog.naziv_proizvoda} /><Head label="Kupac" value={nalog.kupac} /><Head label="Tip" value={nalog.tipNorm || nalog.tip_proizvoda} /><Head label="Datum" value={nalog.datum || "—"} /><Head label="Količina" value={nalog.kolicina || "—"} /></div></div>
      <div style={{ background: "#fff", padding: 8, borderRadius: 12 }}><QRCodeSVG value={nalog.qr_code || nalog.broj} size={92} /></div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}><Metric label="Ukupno slojeva" value={layers.length} /><Metric label="AI pronađene rolne" value={`${found}/${layers.length}`} tone={found === layers.length ? GREEN : ORANGE} /><Metric label="Progress" value={`${nalog.progress || 0}%`} /></div>
    <section style={card}><h3 style={title}>Struktura materijala iz template-a</h3><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr>{["Sloj", "Vrsta", "Pod vrsta", "Oznaka", "Debljina", "Idealna širina", "Predložena rolna", "FIFO"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{layers.map((l, i) => { const s = suggestions[i] || {}; const best = s.best || s.predlozena_rolna; return <tr key={i}><td style={td}>{i+1}</td><td style={td}>{l.vrsta}</td><td style={td}>{l.pod_vrsta || "—"}</td><td style={td}>{l.oznaka_materijala || l.oznaka}</td><td style={td}>{l.debljina} µ</td><td style={td}>{l.idealna_sirina || "—"} mm</td><td style={td}>{best?.br_rolne || best?.br_rolne || "Nema"}</td><td style={td}>{best ? <span style={pill(best.fifo_prioritet === "HITNO" ? RED : GREEN)}>#{best.fifo_rank || 1} {best.fifo_prioritet || "FIFO"}</span> : <span style={pill(RED)}>NEMA</span>}</td></tr>; })}</tbody></table></section>
    <section style={{ ...card, border: "1px solid #bbf7d0" }}><h3 style={title}>Rezervacija rolni — AI predlog (FIFO + najmanji otpad)</h3>{suggestions.map((s, i) => <Reservation key={i} suggestion={s} layer={layers[i]} />)}</section>
  </div>;
}

function Reservation({ suggestion, layer }) { const candidates = suggestion.candidates || []; const best = suggestion.best || suggestion.predlozena_rolna; return <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, marginBottom: 10, overflow: "hidden" }}><div style={{ background: "#f8fafc", padding: 10, display: "flex", justifyContent: "space-between" }}><b>Sloj {layer?.sloj || ""}: {layer?.vrsta} / {layer?.pod_vrsta || "—"} / {layer?.oznaka_materijala || layer?.oznaka} / {layer?.debljina}µ</b><span style={{ color: best ? GREEN : RED, fontWeight: 900 }}>{best ? "AI PREPORUKA SPREMNA" : "NEMA ODGOVARAJUĆE ROLNE"}</span></div>{best && <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr) auto", gap: 8, padding: 10, alignItems: "center", fontSize: 12 }}><Cell label="Rolna" value={best.br_rolne} /><Cell label="Širina" value={`${best.sirina} mm`} /><Cell label="Slobodno" value={`${best.slobodno_m} m`} /><Cell label="kg" value={best.kg_neto || "—"} /><Cell label="LOT" value={best.lot || "—"} /><Cell label="Otpad" value={`${best.otpad_mm || 0} mm`} /><Cell label="FIFO" value={`#${best.fifo_rank || 1}`} /><button style={btn(GREEN, "#fff")}>Rezerviši</button></div>}</div>; }
function Head({ label, value }) { return <div style={{ background: "rgba(255,255,255,.1)", borderRadius: 10, padding: 10 }}><div style={{ fontSize: 10, opacity: .75, textTransform: "uppercase", fontWeight: 900 }}>{label}</div><b>{value || "—"}</b></div>; }
function Metric({ label, value, tone = BLUE }) { return <div style={card}><small style={cap}>{label}</small><div style={{ fontSize: 22, fontWeight: 950, color: tone, marginTop: 6 }}>{value}</div></div>; }
function Cell({ label, value }) { return <div><small style={cap}>{label}</small><div style={{ fontWeight: 900 }}>{value}</div></div>; }
function btn(bg, color, border = "transparent") { return { border: `1px solid ${border}`, background: bg, color, borderRadius: 10, padding: "10px 13px", fontWeight: 900, cursor: "pointer" }; }
function pill(color) { return { display: "inline-flex", alignItems: "center", borderRadius: 999, background: `${color}16`, color, padding: "4px 8px", fontSize: 11, fontWeight: 900 }; }
const input = { padding: "12px 14px", borderRadius: 12, border: "1px solid #cbd5e1", fontSize: 14 };
const cap = { display: "block", fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" };
const title = { margin: "0 0 12px", color: NAVY, fontSize: 17, fontWeight: 950 };
const th = { textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 11, textTransform: "uppercase" };
const td = { padding: 10, borderBottom: "1px solid #f1f5f9" };
