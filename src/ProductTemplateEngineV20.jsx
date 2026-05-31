import React, { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import MaterialLayersTablePRO from "./components/MaterialLayersTablePRO.jsx";
import { suggestRollsForAllLayers } from "./services/rollSuggestionEngine.js";

const GREEN = "#059669";
const BLUE = "#1d4ed8";
const NAVY = "#0b1b3f";
const ORANGE = "#f59e0b";
const RED = "#dc2626";

const emptyTemplate = {
  id: null,
  naziv: "",
  kupac: "",
  tip_proizvoda: "folija",
  sifra: "",
  rok_isporuke: "",
  kolicina: "",
  napomena: "",
  materijali_struktura: [
    { sloj: 1, vrsta: "BOPP", pod_vrsta: "Transparent", oznaka_materijala: "FXCB", debljina: 20, idealna_sirina: 480, dobavljac: "", napomena: "Spoljašnji sloj" },
    { sloj: 2, vrsta: "CPP", pod_vrsta: "Transparent", oznaka_materijala: "CPPC", debljina: 35, idealna_sirina: 480, dobavljac: "", napomena: "Sloj za zavarivanje" },
  ],
  stampa: { masina: "", broj_boja: "", smer: "", napomena: "" },
  kasiranje: { lepak: "", nanos: "", napomena: "" },
  rezanje: { sirina_trake: "", broj_traka: "", duzina_rolne: "", napomena: "" },
  kalkulacija: { cena: "", marza: "", valuta: "EUR" },
};

const field = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 12px", fontWeight: 750, background: "#fff" };
const label = { display: "block", fontSize: 11, color: "#64748b", fontWeight: 900, textTransform: "uppercase", marginBottom: 5 };
const card = { background: "#fff", border: "1px solid #dbe3ef", borderRadius: 16, padding: 16, boxShadow: "0 10px 28px rgba(15,23,42,0.05)" };

function uid(prefix = "TPL") { return `${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`; }
function num(v) { return Number(String(v ?? "").replace(",", ".")) || 0; }
function layersOf(t) { return Array.isArray(t?.materijali_struktura) ? t.materijali_struktura : []; }
function today() { return new Date().toISOString().slice(0, 10); }
function readRolls(db) { return db?.rolne || db?.magacin || db?.warehouseRolls || []; }

function ProductTemplateEngineV20({ db = {}, setDb, msg, setPage }) {
  const [activeTab, setActiveTab] = useState("materijali");
  const [template, setTemplate] = useState(() => ({ ...emptyTemplate, id: uid("TPL") }));
  const rolls = readRolls(db);
  const layers = layersOf(template);

  const suggestions = useMemo(() => suggestRollsForAllLayers(rolls, layers, { metraza: num(template.kolicina) || 0 }), [rolls, layers, template.kolicina]);
  const totalDeb = layers.reduce((s, x) => s + num(x.debljina), 0);
  const recommendedWidth = Math.max(0, ...layers.map(x => num(x.idealna_sirina)));
  const allFound = suggestions.every(x => x.best);

  const update = (patch) => setTemplate((p) => ({ ...p, ...patch }));
  const updateSection = (section, patch) => setTemplate((p) => ({ ...p, [section]: { ...(p[section] || {}), ...patch } }));

  const saveTemplate = () => {
    const saved = { ...template, id: template.id || uid("TPL"), updated_at: new Date().toISOString() };
    const list = Array.isArray(db?.proizvodi_template) ? db.proizvodi_template : [];
    const next = list.some(x => x.id === saved.id) ? list.map(x => x.id === saved.id ? saved : x) : [saved, ...list];
    setDb?.({ ...(db || {}), proizvodi_template: next });
    msg?.success?.("Template sačuvan sa materijali_struktura.");
  };

  const createNalog = () => {
    const broj = uid("RN");
    const nalog = {
      id: uid("NALOG"),
      broj_naloga: broj,
      ponBr: broj,
      master_broj: broj,
      tip: template.tip_proizvoda,
      tip_proizvoda: template.tip_proizvoda,
      tip_naloga: "materijal",
      status: "Ceka",
      kupac: template.kupac,
      prod: template.naziv,
      proizvod: template.naziv,
      naziv_proizvoda: template.naziv,
      datum: today(),
      rok_isporuke: template.rok_isporuke,
      kolicina: num(template.kolicina),
      materijali_struktura: layers,
      ai_predlog_rolni: suggestions.map(s => ({ sloj: s.layer.sloj, trazeno: s.layer, predlozena_rolna: s.best })),
      template_id: template.id,
      qr_code: broj,
    };
    setDb?.({ ...(db || {}), nalozi: [nalog, ...(db?.nalozi || [])] });
    msg?.success?.("Kreiran radni nalog iz template-a sa AI/FIFO predlogom rolni.");
    setPage?.("master_nalog");
  };

  return <div style={{ padding: 18, background: "#f3f6fb", minHeight: "100vh", color: "#0f172a" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 950 }}>📘 Product Template Engine PRO V26 <span style={{ fontSize: 12, background: "#dcfce7", color: "#047857", padding: "4px 8px", borderRadius: 999 }}>MASTER</span></h1>
        <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Template je izvor istine: materijali_struktura → nalog → AI/FIFO rolne → plan rezanja.</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setPage?.("lista_proizvoda")} style={btn("#fff", "#0f172a", "#cbd5e1")}>← Nazad na listu</button>
        <button onClick={() => setTemplate({ ...emptyTemplate, id: uid("TPL") })} style={btn("#fff", "#0f172a", "#cbd5e1")}>Novi template</button>
        <button onClick={saveTemplate} style={btn(GREEN, "#fff")}>Sačuvaj</button>
        <button onClick={createNalog} style={btn(BLUE, "#fff")}>Sačuvaj i kreiraj nalog</button>
      </div>
    </div>

    <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto" }}>
      {[
        ["osnovno", "Osnovni podaci"], ["materijali", "Materijali"], ["stampa", "Štampa"], ["kasiranje", "Kaširanje"], ["rezanje", "Rezanje"], ["tehnicki", "Tehnički crtež"], ["ai", "AI analiza"], ["kalkulacija", "Kalkulacija"],
      ].map(([id, name]) => <button key={id} onClick={() => setActiveTab(id)} style={{ ...btn(activeTab === id ? BLUE : "#fff", activeTab === id ? "#fff" : "#334155", "#cbd5e1"), whiteSpace: "nowrap" }}>{name}</button>)}
    </div>

    {activeTab === "osnovno" && <section style={card}>
      <h2 style={h2Style}>Osnovni podaci proizvoda</h2>
      <div style={grid(4)}>
        <Input label="Naziv proizvoda" value={template.naziv} onChange={v => update({ naziv: v })} />
        <Input label="Kupac" value={template.kupac} onChange={v => update({ kupac: v })} />
        <Input label="Šifra / kod" value={template.sifra} onChange={v => update({ sifra: v })} />
        <div><span style={label}>Tip proizvoda</span><select style={field} value={template.tip_proizvoda} onChange={e => update({ tip_proizvoda: e.target.value })}><option value="folija">Folija</option><option value="kesa">Kesa</option><option value="spulna">Špulna</option></select></div>
        <Input label="Količina / metraža" value={template.kolicina} onChange={v => update({ kolicina: v })} />
        <Input label="Rok isporuke" type="date" value={template.rok_isporuke} onChange={v => update({ rok_isporuke: v })} />
        <Input label="Napomena" value={template.napomena} onChange={v => update({ napomena: v })} span={2} />
      </div>
    </section>}

    {activeTab === "materijali" && <div style={{ display: "grid", gap: 14 }}>
      <MaterialLayersTablePRO title="Struktura materijala (slojevi)" layers={layers} onChange={(materijali_struktura) => update({ materijali_struktura })} templateMode />
      <div style={grid(5)}>
        <Metric label="Ukupna debljina" value={`${totalDeb} µ`} />
        <Metric label="Ukupno slojeva" value={layers.length} />
        <Metric label="Preporučena širina" value={recommendedWidth ? `${recommendedWidth} mm` : "—"} />
        <Metric label="FIFO pravilo" value="Datum proizvodnje" />
        <Metric label="AI rolne" value={allFound ? "Spremno" : "Treba proveriti"} tone={allFound ? GREEN : ORANGE} />
      </div>
      <JsonBox data={{ materijali_struktura: layers }} />
    </div>}

    {activeTab === "ai" && <section style={card}>
      <h2 style={h2Style}>AI analiza i FIFO predlog rolni</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {suggestions.map((s, i) => <div key={i} style={{ border: `1px solid ${s.best ? "#bbf7d0" : "#fecaca"}`, background: s.best ? "#f0fdf4" : "#fff1f2", borderRadius: 14, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div><b>Sloj {s.layer.sloj}</b> — {s.layer.vrsta} / {s.layer.pod_vrsta || "—"} / {s.layer.oznaka_materijala} / {s.layer.debljina}µ / ideal {s.layer.idealna_sirina || "—"} mm</div>
            <span style={{ color: s.best ? GREEN : RED, fontWeight: 900 }}>{s.best ? "PRONAĐENO" : "NEMA ROLNI"}</span>
          </div>
          {s.best ? <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1.2fr repeat(5, .8fr)", gap: 8, fontSize: 12 }}>
            <Cell label="Predložena rolna" value={s.best.br_rolne} />
            <Cell label="Širina" value={`${s.best.sirina} mm`} />
            <Cell label="Slobodno" value={`${s.best.slobodno_m} m`} />
            <Cell label="Otpad" value={`${s.best.otpad_mm} mm`} />
            <Cell label="FIFO" value={`#${s.best.fifo_rank}`} />
            <Cell label="Starost" value={s.best.starost_dana == null ? "—" : `${s.best.starost_dana} dana`} />
          </div> : <div style={{ marginTop: 8, color: RED, fontWeight: 800 }}>Dodaj rolnu u magacin ili proveri vrstu/pod vrstu/oznaku/debljinu/idealnu širinu.</div>}
        </div>)}
      </div>
    </section>}

    {activeTab === "stampa" && <SimpleSection title="Parametri štampe" data={template.stampa} onChange={p => updateSection("stampa", p)} fields={["masina", "broj_boja", "smer", "napomena"]} />}
    {activeTab === "kasiranje" && <SimpleSection title="Parametri kaširanja" data={template.kasiranje} onChange={p => updateSection("kasiranje", p)} fields={["lepak", "nanos", "napomena"]} />}
    {activeTab === "rezanje" && <SimpleSection title="Rezanje i finalna rolna" data={template.rezanje} onChange={p => updateSection("rezanje", p)} fields={["sirina_trake", "broj_traka", "duzina_rolne", "napomena"]} />}
    {activeTab === "kalkulacija" && <SimpleSection title="Kalkulacija" data={template.kalkulacija} onChange={p => updateSection("kalkulacija", p)} fields={["cena", "marza", "valuta"]} />}
    {activeTab === "tehnicki" && <section style={card}><h2 style={h2Style}>Tehnički crtež</h2><div style={{ border: "1px dashed #cbd5e1", borderRadius: 16, padding: 40, textAlign: "center", color: "#64748b" }}>Ovde ide tehnički crtež proizvoda, smer odmotavanja, perforacije i dimenzije.</div></section>}

    <section style={{ ...card, marginTop: 14, border: "1px dashed #8b5cf6" }}>
      <h2 style={h2Style}>Automatski tok podataka</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
        {[
          ["📦", "Product Template", "Definiše slojeve"], ["📄", "Kreiraj nalog", "Povlači materijale"], ["🏭", "Proveri magacin", "FIFO + najmanji otpad"], ["✂️", "Plan rezanja", "Rezervacija rolni"], ["🏁", "Proizvodnja", "MES operacije"], ["✅", "Završetak", "Kontrola + izveštaj"],
        ].map(([icon, a, b]) => <div key={a} style={{ textAlign: "center", background: "#f8fafc", borderRadius: 14, padding: 12 }}><div style={{ fontSize: 26 }}>{icon}</div><b>{a}</b><div style={{ fontSize: 12, color: "#64748b" }}>{b}</div></div>)}
      </div>
    </section>
  </div>;
}

function btn(bg, color, border = "transparent") { return { border: `1px solid ${border}`, background: bg, color, borderRadius: 10, padding: "10px 13px", fontWeight: 900, cursor: "pointer" }; }
const h2Style = { margin: "0 0 14px", fontSize: 18, fontWeight: 950, color: NAVY };
function Input({ label: l, value, onChange, type = "text", span = 1 }) { return <div style={{ gridColumn: `span ${span}` }}><span style={label}>{l}</span><input type={type} style={field} value={value || ""} onChange={e => onChange(e.target.value)} /></div>; }
function Metric({ label, value, tone = BLUE }) { return <div style={{ ...card, padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{label}</div><div style={{ fontSize: 18, color: tone, fontWeight: 950, marginTop: 5 }}>{value}</div></div>; }
function Cell({ label, value }) { return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 8 }}><div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{label}</div><b>{value}</b></div>; }
function JsonBox({ data }) { return <pre style={{ ...card, margin: 0, background: "#f8fafc", color: "#334155", overflowX: "auto", fontSize: 12 }}>{JSON.stringify(data, null, 2)}</pre>; }
function grid(n) { return { display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 12 }; }
function SimpleSection({ title, data, onChange, fields }) { return <section style={card}><h2 style={h2Style}>{title}</h2><div style={grid(4)}>{fields.map(f => <Input key={f} label={f.replaceAll("_", " ")} value={data?.[f]} onChange={v => onChange({ [f]: v })} />)}</div></section>; }

Object.defineProperty(ProductTemplateEngineV20, "name", { value: "ProductTemplateEngineV20" });

export default ProductTemplateEngineV20;
