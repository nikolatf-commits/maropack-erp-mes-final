import React, { useMemo } from "react";
import { getVrsteMaterijala, getPodVrsteZaVrstu, getOznakeZaVrstu, getDebljineZaMaterijal, getKoeficijent, calculateGm2, buildMaterialName, normalizeMaterialLayer, cleanOznakaMaterijala } from "../data/materialMaster.js";

const tableWrap = { width: "100%", overflowX: "auto", border: "1px solid #dbe3ef", borderRadius: 14, background: "#fff" };
const table = { width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1280, fontSize: 13 };
const th = { textAlign: "left", padding: "10px 12px", background: "#f8fafc", color: "#64748b", fontSize: 11, fontWeight: 900, textTransform: "uppercase", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" };
const td = { padding: "9px 10px", borderBottom: "1px solid #edf2f7", verticalAlign: "middle" };
const input = { width: "100%", boxSizing: "border-box", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#0f172a", fontWeight: 700 };
const select = { ...input, cursor: "pointer" };
const smallBtn = { height: 36, minWidth: 36, borderRadius: 9, border: "1px solid #fecaca", background: "#fff1f2", color: "#dc2626", fontWeight: 900, cursor: "pointer" };
const checkbox = { width: 17, height: 17, cursor: "pointer", accentColor: "#059669" };

function patchLayer(base, patch, index=0) {
  const next = normalizeMaterialLayer({ ...(base || {}), ...patch }, index, patch?.idealna_sirina || patch?.sirina || base?.idealna_sirina || base?.sirina || "");
  const nazivMaterijala = buildMaterialName(next.vrsta, next.pod_vrsta, next.oznaka_materijala, next.debljina);
  return { ...next, nazivMaterijala, materijal: nazivMaterijala, tipMaterijala: nazivMaterijala };
}

export default function MaterialLayersTablePRO({ layers = [], onChange, onAdd, onRemove, maxLayers, title = "Materijali", showPrice = true, showWidth = true, showFlags = true, templateMode = false }) {
  const rows = layers.length ? layers.map((l,i)=>patchLayer(l,{},i)) : [patchLayer({}, {}, 0)];
  const totals = useMemo(() => {
    const totalDeb = rows.reduce((s, x) => s + Number(x.debljina || 0), 0);
    const totalGm2 = rows.reduce((s, x) => s + Number(x.gm2 || x.tezina || calculateGm2(x.vrsta, x.debljina) || 0), 0);
    const avgKoef = rows.length ? rows.reduce((s, x) => s + Number(x.koeficijent || getKoeficijent(x.vrsta) || 0), 0) / rows.length : 0;
    const totalPrice = rows.reduce((s, x) => s + Number(x.cena || 0), 0);
    return { totalDeb, totalGm2, avgKoef, totalPrice };
  }, [rows]);
  const updateRow = (index, patch) => onChange?.(rows.map((r, i) => i === index ? patchLayer(r, patch, i) : r));
  const addRow = () => {
    if (maxLayers && rows.length >= maxLayers) return;
    const newRow = patchLayer({ vrsta: "BOPP", pod_vrsta: "transparent", oznaka_materijala: "FXCB", debljina: 20, idealna_sirina: rows[0]?.idealna_sirina || rows[0]?.sirina || "", cena: "", stampa: false, lakira: false }, {}, rows.length);
    if (onAdd) onAdd(newRow); else onChange?.([...rows, newRow]);
  };
  const removeRow = (index) => { if (rows.length <= 1) return; if (onRemove) onRemove(index); else onChange?.(rows.filter((_, i) => i !== index)); };
  return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 14 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
      <div><h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>{title}</h3><div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>{templateMode ? "Template bez cena — tehnička definicija slojeva." : "Sloj bira rolne po: vrsta + pod vrsta + oznaka + debljina + idealna širina + FIFO."}</div></div>
      <button type="button" onClick={addRow} disabled={maxLayers && rows.length >= maxLayers} style={{ padding: "9px 14px", background: "#059669", color: "#fff", border: 0, borderRadius: 10, fontWeight: 900, cursor: "pointer", opacity: maxLayers && rows.length >= maxLayers ? .45 : 1 }}>+ Dodaj sloj</button>
    </div>
    <div style={tableWrap}><table style={table}><thead><tr>
      <th style={{ ...th, width: 44 }}>#</th><th style={{ ...th, width: 130 }}>Vrsta</th><th style={{ ...th, width: 135 }}>Pod vrsta</th><th style={{ ...th, width: 145 }}>Oznaka</th><th style={{ ...th, width: 110 }}>Debljina</th><th style={{ ...th, width: 110 }}>Koef</th><th style={{ ...th, width: 120 }}>g/m²</th>{showWidth && <th style={{ ...th, width: 130 }}>Idealna širina</th>}{showPrice && <th style={{ ...th, width: 110 }}>Cena €/kg</th>}{showFlags && <><th style={th}>Š</th><th style={th}>L</th></>}<th style={{ ...th, width: 76 }}>Akcije</th>
    </tr></thead><tbody>{rows.map((r, i) => {
      const vrste = getVrsteMaterijala(); const podVrste=getPodVrsteZaVrstu(r.vrsta); const oznake=getOznakeZaVrstu(r.vrsta); const debljine=getDebljineZaMaterijal(r.vrsta, r.oznaka_materijala || r.oznaka); const koef=r.koeficijent||getKoeficijent(r.vrsta); const gm2=r.gm2||r.tezina||calculateGm2(r.vrsta,r.debljina);
      return <tr key={i}><td style={{...td,fontWeight:900}}>{i+1}</td>
        <td style={td}><select style={select} value={r.vrsta} onChange={e=>{const v=e.target.value; const firstO=getOznakeZaVrstu(v)[0]||"STANDARD"; const firstP=getPodVrsteZaVrstu(v)[0]||"transparent"; updateRow(i,{vrsta:v,pod_vrsta:firstP,oznaka_materijala:firstO,oznaka:firstO,debljina:getDebljineZaMaterijal(v,firstO)[0]||""})}}>{vrste.map(v=><option key={v} value={v}>{v}</option>)}</select></td>
        <td style={td}><select style={select} value={r.pod_vrsta||""} onChange={e=>updateRow(i,{pod_vrsta:e.target.value})}>{podVrste.map(p=><option key={p} value={p}>{p}</option>)}</select></td>
        <td style={td}><select style={select} value={r.oznaka_materijala||r.oznaka||""} onChange={e=>updateRow(i,{oznaka_materijala:cleanOznakaMaterijala(e.target.value,r.vrsta),oznaka:cleanOznakaMaterijala(e.target.value,r.vrsta),debljina:getDebljineZaMaterijal(r.vrsta,e.target.value)[0]||r.debljina})}>{oznake.map(o=><option key={o} value={o}>{o}</option>)}</select></td>
        <td style={td}><select style={select} value={r.debljina} onChange={e=>updateRow(i,{debljina:e.target.value})}>{debljine.map(d=><option key={d} value={d}>{d}{r.vrsta==='PAPIR'?' g/m²':'µ'}</option>)}</select></td>
        <td style={td}><input style={{...input,background:'#f8fafc'}} value={koef||''} readOnly /></td><td style={td}><input style={{...input,background:'#fef3c7',color:'#92400e'}} value={gm2||0} readOnly /></td>
        {showWidth && <td style={td}><input style={input} value={r.idealna_sirina||r.sirina||''} onChange={e=>updateRow(i,{idealna_sirina:e.target.value,sirina:e.target.value,sirinaMm:e.target.value,sirina_mm:e.target.value})} /></td>}
        {showPrice && <td style={td}><input style={input} type="number" value={r.cena||''} onChange={e=>updateRow(i,{cena:e.target.value})} /></td>}
        {showFlags && <><td style={td}><input style={checkbox} type="checkbox" checked={!!r.stampa} onChange={e=>updateRow(i,{stampa:e.target.checked})}/></td><td style={td}><input style={checkbox} type="checkbox" checked={!!r.lakira} onChange={e=>updateRow(i,{lakira:e.target.checked})}/></td></>}
        <td style={td}><button type="button" onClick={()=>removeRow(i)} disabled={rows.length<=1} style={{...smallBtn,opacity:rows.length<=1?.4:1}}>×</button></td>
      </tr>})}</tbody><tfoot><tr style={{background:'#f8fafc'}}><td style={td}></td><td style={{...td,fontWeight:900}} colSpan="3">UKUPNO / PROSEK</td><td style={{...td,color:'#059669',fontWeight:900}}>{totals.totalDeb.toFixed(0)} µ</td><td style={{...td,color:'#059669',fontWeight:900}}>{totals.avgKoef.toFixed(2)}</td><td style={{...td,color:'#059669',fontWeight:900}}>{totals.totalGm2.toFixed(1)} g/m²</td>{showWidth&&<td style={td}></td>}{showPrice&&<td style={{...td,color:'#059669',fontWeight:900}}>{totals.totalPrice.toFixed(2)} €/kg</td>}{showFlags&&<td style={td} colSpan="2"></td>}<td style={td}></td></tr></tfoot></table></div>
    {showFlags && <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 10, color: "#334155", fontSize: 12 }}><span><b>Š</b> = Štampa se</span><span><b>L</b> = Lakira se</span></div>}
  </div>;
}
