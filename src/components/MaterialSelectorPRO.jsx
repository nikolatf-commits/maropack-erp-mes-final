
import React, { useEffect, useMemo, useState } from "react";
import { getVrsteMaterijala, getOznakeZaVrstu, getDebljineZaMaterijal, getKoeficijent, calculateGm2, buildMaterialName } from "../data/materialMaster.js";

export default function MaterialSelectorPRO({ value, onChange, compact=false, title="Materijal", showSummary=true }) {
  const vrste = getVrsteMaterijala();
  const [vrsta,setVrsta]=useState(value?.vrsta||value?.tip||"BOPP");
  const oznake=useMemo(()=>getOznakeZaVrstu(vrsta),[vrsta]);
  const [oznaka,setOznaka]=useState(value?.oznaka||value?.grade||(oznake.includes("FXCB")?"FXCB":(oznake[0]||"STANDARD")));
  const debljine=useMemo(()=>getDebljineZaMaterijal(vrsta,oznaka),[vrsta,oznaka]);
  const [debljina,setDebljina]=useState(Number(value?.debljina||value?.deb||value?.thickness||(debljine.includes(20)?20:(debljine[0]||20))));
  useEffect(()=>{const o=getOznakeZaVrstu(vrsta); if(!o.includes(oznaka)) setOznaka(o.includes("FXCB")?"FXCB":(o[0]||"STANDARD"));},[vrsta]);
  useEffect(()=>{const d=getDebljineZaMaterijal(vrsta,oznaka); if(d.length&&!d.includes(Number(debljina))) setDebljina(d.includes(20)?20:d[0]);},[vrsta,oznaka]);
  useEffect(()=>{const gm2=calculateGm2(vrsta,debljina); const koeficijent=getKoeficijent(vrsta); const nazivMaterijala=buildMaterialName(vrsta,oznaka,debljina); onChange?.({...(value||{}),vrsta,oznaka,debljina,koeficijent,gm2,nazivMaterijala,materijal:nazivMaterijala,tipMaterijala:nazivMaterijala,tezina:gm2,tezinaGm2:gm2});},[vrsta,oznaka,debljina]);
  const gm2=calculateGm2(vrsta,debljina), koef=getKoeficijent(vrsta), naziv=buildMaterialName(vrsta,oznaka,debljina);
  const input={width:"100%",minWidth:0,boxSizing:"border-box",padding:compact?"6px 8px":"10px",border:"1px solid #cbd5e1",borderRadius:compact?8:10,background:"#fff",fontWeight:800,fontSize:compact?11:13,height:compact?34:40};
  const label={fontSize:compact?9:11,fontWeight:900,color:"#64748b",textTransform:"uppercase",marginBottom:4,letterSpacing:.2,whiteSpace:"nowrap"};
  const cell={minWidth:0};
  return <div className="material-selector-pro" style={{width:"100%",minWidth:0,boxSizing:"border-box",border:"1px solid #e2e8f0",borderRadius:compact?10:14,padding:compact?8:12,background:"#f8fafc",overflow:"hidden"}}>
    {!compact&&<div style={{fontWeight:900,marginBottom:8,color:"#0f172a"}}>{title}</div>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(3, minmax(0, 1fr))",gap:compact?6:8,alignItems:"end"}}>
      <div style={cell}><div style={label}>Vrsta</div><select style={input} value={vrsta} onChange={e=>setVrsta(e.target.value)}>{vrste.map(v=><option key={v} value={v}>{v}</option>)}</select></div>
      <div style={cell}><div style={label}>Oznaka</div><select style={input} value={oznaka} onChange={e=>setOznaka(e.target.value)}>{oznake.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
      <div style={cell}><div style={label}>Debljina</div><select style={input} value={debljina} onChange={e=>setDebljina(Number(e.target.value))}>{debljine.map(d=><option key={d} value={d}>{d}{vrsta==="PAPIR"?" g/m²":"µ"}</option>)}</select></div>
    </div>
    {showSummary&&<div style={{display:"grid",gridTemplateColumns:compact?"1fr auto auto":"1.4fr .7fr .7fr",gap:compact?10:8,marginTop:compact?6:8,fontSize:compact?10:12,alignItems:"center",minWidth:0}}>
      <div style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><b>{naziv}</b></div><div style={{whiteSpace:"nowrap"}}>koef: <b>{koef||"—"}</b></div><div style={{whiteSpace:"nowrap"}}>g/m²: <b>{gm2}</b></div>
    </div>}
  </div>
}

export function MaterialText({material}) {
 const vrsta=material?.vrsta||material?.tip||"", oznaka=material?.oznaka||material?.grade||material?.komercijalnaOznaka||"", debljina=material?.debljina||material?.deb||material?.thickness||"";
 const gm2=material?.gm2||material?.tezina||calculateGm2(vrsta,debljina); const naziv=material?.nazivMaterijala||material?.materijal||buildMaterialName(vrsta,oznaka,debljina);
 return <span><b>{naziv}</b>{vrsta&&<small style={{marginLeft:6,color:"#64748b"}}>({vrsta} / {oznaka} / {debljina}µ / {gm2} g/m²)</small>}</span>
}
