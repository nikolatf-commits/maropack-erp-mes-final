
import React from "react";
import MaterialSelectorPRO from "./MaterialSelectorPRO.jsx";
import { kgFromMeters } from "../data/materialMaster.js";

export default function MaterialLayerRowPRO({ layer, onChange, onRemove, showWidth=true, showPrice=true, index=0 }) {
  const l = layer || {};
  const update = (patch) => onChange?.({ ...l, ...patch });
  const kgAuto = kgFromMeters({ sirinaMm: l.sirina || l.sirinaMm, metara: l.metara || l.potrebnoM, gm2: l.gm2 || l.tezina });
  const input={width:"100%",padding:"10px",border:"1px solid #cbd5e1",borderRadius:10};
  const label={fontSize:11,fontWeight:900,color:"#64748b",textTransform:"uppercase",marginBottom:4};
  return <div style={{display:"grid",gridTemplateColumns:showPrice?"2fr .8fr .8fr .8fr 46px":"2fr .9fr .9fr 46px",gap:10,alignItems:"end",padding:10,border:"1px solid #e2e8f0",borderRadius:14,background:"#fff"}}>
    <MaterialSelectorPRO compact title={`Sloj ${index+1}`} value={l} onChange={update}/>
    {showWidth&&<div><div style={label}>Širina mm</div><input style={input} value={l.sirina||""} onChange={e=>update({sirina:e.target.value,sirinaMm:e.target.value})}/></div>}
    <div><div style={label}>m</div><input style={input} value={l.metara||l.potrebnoM||""} onChange={e=>update({metara:e.target.value,potrebnoM:e.target.value, kg:kgFromMeters({sirinaMm:l.sirina||l.sirinaMm,metara:e.target.value,gm2:l.gm2||l.tezina})})}/></div>
    {showPrice&&<div><div style={label}>Cena €/kg</div><input style={input} value={l.cena||""} onChange={e=>update({cena:e.target.value})}/></div>}
    <button type="button" onClick={onRemove} style={{height:40,border:"1px solid #fecaca",background:"#fff1f2",color:"#dc2626",borderRadius:10,fontWeight:900}}>×</button>
    <div style={{gridColumn:"1 / -1",fontSize:12,color:"#475569"}}>Auto kg: <b>{l.kg || kgAuto}</b> • g/m²: <b>{l.gm2||l.tezina||0}</b> • Koef: <b>{l.koeficijent||"—"}</b></div>
  </div>
}
