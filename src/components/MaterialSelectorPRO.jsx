import React, { useEffect, useMemo, useState } from "react";
import { getVrsteMaterijala, getOznakeZaVrstu, getDebljineZaMaterijal, getKoeficijent, calculateGm2, buildMaterialName } from "../data/materialMaster.js";

const POD_VRSTE = ["Transparent", "Beli", "Sedef", "Metallized", "Mat", "Papir", "Koekstruzija", "Standard"];
const norm = (v) => String(v ?? "").trim();

export function buildLayerPayload(value = {}) {
  const vrsta = value.vrsta || value.tip || "BOPP";
  const pod_vrsta = value.pod_vrsta || value.podvrsta || "Transparent";
  const oznaka_materijala = value.oznaka_materijala || value.oznaka || value.grade || "FXCB";
  const debljina = Number(value.debljina || value.deb || value.thickness || 20);
  const idealna_sirina = value.idealna_sirina || value.idealnaSirina || value.sirina || value.sirinaMm || "";
  const gm2 = calculateGm2(vrsta, debljina);
  const koeficijent = getKoeficijent(vrsta);
  const nazivMaterijala = buildMaterialName(vrsta, oznaka_materijala, debljina);
  return {
    ...value,
    vrsta,
    tip: vrsta,
    pod_vrsta,
    oznaka_materijala,
    oznaka: oznaka_materijala,
    grade: oznaka_materijala,
    debljina,
    deb: debljina,
    debljina_um: debljina,
    idealna_sirina,
    idealnaSirina: idealna_sirina,
    sirina: idealna_sirina || value.sirina || "",
    sirinaMm: idealna_sirina || value.sirinaMm || "",
    koeficijent,
    gm2,
    tezina: gm2,
    tezinaGm2: gm2,
    nazivMaterijala,
    materijal: nazivMaterijala,
    tipMaterijala: nazivMaterijala,
  };
}

export default function MaterialSelectorPRO({ value = {}, onChange, compact = false, title = "Materijal", showSummary = true, showIdealWidth = true }) {
  const vrste = getVrsteMaterijala();
  const init = buildLayerPayload(value);
  const [vrsta, setVrsta] = useState(init.vrsta);
  const [podVrsta, setPodVrsta] = useState(init.pod_vrsta);
  const oznake = useMemo(() => getOznakeZaVrstu(vrsta), [vrsta]);
  const [oznaka, setOznaka] = useState(init.oznaka_materijala || (oznake.includes("FXCB") ? "FXCB" : (oznake[0] || "STANDARD")));
  const debljine = useMemo(() => getDebljineZaMaterijal(vrsta, oznaka), [vrsta, oznaka]);
  const [debljina, setDebljina] = useState(Number(init.debljina || (debljine.includes(20) ? 20 : (debljine[0] || 20))));
  const [idealnaSirina, setIdealnaSirina] = useState(init.idealna_sirina || "");

  useEffect(() => {
    const available = getOznakeZaVrstu(vrsta);
    if (!available.includes(oznaka)) setOznaka(available.includes("FXCB") ? "FXCB" : (available[0] || "STANDARD"));
  }, [vrsta]);

  useEffect(() => {
    const available = getDebljineZaMaterijal(vrsta, oznaka);
    if (available.length && !available.includes(Number(debljina))) setDebljina(available.includes(20) ? 20 : available[0]);
  }, [vrsta, oznaka]);

  useEffect(() => {
    onChange?.(buildLayerPayload({ ...(value || {}), vrsta, pod_vrsta: podVrsta, oznaka_materijala: oznaka, debljina, idealna_sirina: idealnaSirina }));
  }, [vrsta, podVrsta, oznaka, debljina, idealnaSirina]);

  const gm2 = calculateGm2(vrsta, debljina);
  const koef = getKoeficijent(vrsta);
  const naziv = buildMaterialName(vrsta, oznaka, debljina);
  const input = { width: "100%", minWidth: 0, boxSizing: "border-box", padding: compact ? "6px 8px" : "10px", border: "1px solid #cbd5e1", borderRadius: compact ? 8 : 10, background: "#fff", fontWeight: 800, fontSize: compact ? 11 : 13, height: compact ? 34 : 40 };
  const label = { fontSize: compact ? 9 : 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: 4, letterSpacing: .2, whiteSpace: "nowrap" };
  const cols = showIdealWidth ? "repeat(5, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))";

  return <div className="material-selector-pro" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: compact ? 10 : 14, padding: compact ? 8 : 12, background: "#f8fafc", overflow: "hidden" }}>
    {!compact && <div style={{ fontWeight: 900, marginBottom: 8, color: "#0f172a" }}>{title}</div>}
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: compact ? 6 : 8, alignItems: "end" }}>
      <div><div style={label}>Vrsta</div><select style={input} value={vrsta} onChange={e => setVrsta(e.target.value)}>{vrste.map(v => <option key={v} value={v}>{v}</option>)}</select></div>
      <div><div style={label}>Pod vrsta</div><input list="pod-vrste-materijala" style={input} value={podVrsta} onChange={e => setPodVrsta(e.target.value)} /></div>
      <div><div style={label}>Oznaka</div><select style={input} value={oznaka} onChange={e => setOznaka(e.target.value)}>{oznake.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
      <div><div style={label}>Debljina</div><select style={input} value={debljina} onChange={e => setDebljina(Number(e.target.value))}>{debljine.map(d => <option key={d} value={d}>{d}{vrsta === "PAPIR" ? " g/m²" : "µ"}</option>)}</select></div>
      {showIdealWidth && <div><div style={label}>Idealna širina</div><input style={input} value={idealnaSirina} onChange={e => setIdealnaSirina(e.target.value)} placeholder="mm" /></div>}
    </div>
    <datalist id="pod-vrste-materijala">{POD_VRSTE.map(x => <option key={x} value={x} />)}</datalist>
    {showSummary && <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr auto auto" : "1.4fr .7fr .7fr", gap: compact ? 10 : 8, marginTop: compact ? 6 : 8, fontSize: compact ? 10 : 12, alignItems: "center", minWidth: 0 }}>
      <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b>{naziv}</b> <span style={{ color: "#64748b" }}>{podVrsta ? `/ ${podVrsta}` : ""}</span></div>
      <div style={{ whiteSpace: "nowrap" }}>koef: <b>{koef || "—"}</b></div>
      <div style={{ whiteSpace: "nowrap" }}>g/m²: <b>{gm2}</b></div>
    </div>}
  </div>;
}

export function MaterialText({ material }) {
  const m = buildLayerPayload(material || {});
  const naziv = m.nazivMaterijala || buildMaterialName(m.vrsta, m.oznaka_materijala, m.debljina);
  return <span><b>{naziv}</b><small style={{ marginLeft: 6, color: "#64748b" }}>({m.vrsta} / {m.pod_vrsta || "—"} / {m.oznaka_materijala || "—"} / {m.debljina}µ / ideal {m.idealna_sirina || "—"} mm)</small></span>;
}
