import React, { useState } from "react";

// ─── Shared helpers ───────────────────────────────────────
const QR = (text, size=90) =>
  "https://api.qrserver.com/v1/create-qr-code/?size="+size+"x"+size+"&data="+encodeURIComponent(text||"MAROPACK");

function val(v, fb="—") { return (v===undefined||v===null||v==="") ? fb : v; }
function fmt(n, suf="") {
  const x=Number(n||0); if(!Number.isFinite(x)||x===0) return val(n,"—");
  return x.toLocaleString("sr-RS",{maximumFractionDigits:2})+suf;
}

// ─── CSS vars ─────────────────────────────────────────────
const C = {
  blue:"#2446b8", blueLt:"#eff6ff", blueBd:"#bfdbfe",
  green:"#059669", greenLt:"#f0fdf4", greenBd:"#bbf7d0",
  amber:"#d97706", amberLt:"#fffbeb", amberBd:"#fde68a",
  red:"#dc2626", redLt:"#fef2f2", redBd:"#fecaca",
  purple:"#7c3aed", purpleLt:"#faf5ff", purpleBd:"#ddd6fe",
  muted:"#64748b", border:"#e2e8f0", navy:"#0f172a",
};

// ─── NalogHeader ──────────────────────────────────────────
export function NalogHeader({ tip, icon, nalog }) {
  const { ponBr="MP-2026-XXXX", kupac="", prod="", datum="", datumIsp="", radnik="—" } = nalog||{};
  const qrData = JSON.stringify({ nalog:ponBr, tip, kupac, prod });
  return (
    <div style={{ background:"linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%)", borderRadius:"14px 14px 0 0", padding:"20px 22px", color:"#fff" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
        <div>
          <div style={{ fontSize:9, color:"#64748b", fontWeight:700, letterSpacing:"1.5px", textTransform:"uppercase", marginBottom:5 }}>
            MAROPACK D.O.O. — PROFESIONALNI PROIZVODNI RADNI NALOG
          </div>
          <div style={{ fontSize:26, fontWeight:950, letterSpacing:"-.3px", marginBottom:12 }}>{icon} {tip}</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {[["Broj naloga",ponBr],["Kupac",kupac],["Proizvod",prod],["Tip",(nalog?.tip||"FOLIJA").toUpperCase()]].map(([l,v])=>(
              <div key={l} style={{ background:"rgba(255,255,255,.1)", borderRadius:8, padding:"8px 12px", minWidth:100 }}>
                <div style={{ fontSize:9, color:"#64748b", fontWeight:800, textTransform:"uppercase", marginBottom:4 }}>{l}</div>
                <div style={{ fontSize:12, fontWeight:900 }}>{val(v)}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background:"#fff", borderRadius:10, padding:8, textAlign:"center", flexShrink:0, marginLeft:14 }}>
          <img src={QR(qrData,76)} width={76} height={76} alt="QR" style={{ display:"block" }} />
          <div style={{ fontSize:9, color:"#64748b", fontWeight:800, marginTop:4 }}>QR NALOGA</div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:7 }}>
        {[["Datum",datum||new Date().toLocaleDateString("sr-RS")],["Rok isporuke",datumIsp||"—"],["Status","Čeka"],["Izvor","template / kalkulacija"],["Radnik",radnik||"—"]].map(([l,v])=>(
          <div key={l} style={{ background:"rgba(255,255,255,.07)", borderRadius:7, padding:"7px 10px" }}>
            <div style={{ fontSize:9, color:"#64748b", fontWeight:800, textTransform:"uppercase", marginBottom:3 }}>{l}</div>
            <div style={{ fontSize:11, fontWeight:800 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────
export function Section({ title, badge, color, bg, children, last }) {
  return (
    <div style={{ border:`1px solid ${color}44`, borderLeft:`4px solid ${color}`, borderTop:"none", overflow:"hidden", ...(last?{borderRadius:"0 0 14px 14px"}:{}) }}>
      <div style={{ padding:"10px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", background:bg||color+"08", borderBottom:`1px solid ${color}18` }}>
        <span style={{ fontWeight:900, fontSize:12, textTransform:"uppercase", letterSpacing:".7px", color, display:"flex", alignItems:"center", gap:6 }}>{title}</span>
        {badge && <span style={{ fontSize:10, fontWeight:800, padding:"3px 9px", borderRadius:99, color, background:color+"15" }}>{badge}</span>}
      </div>
      <div style={{ padding:"14px 16px" }}>{children}</div>
    </div>
  );
}

// ─── QC Footer ────────────────────────────────────────────
export function QCFooter({ items }) {
  const def = [["Start","QR skeniranje naloga","Operator: ___________"],["Ulazni materijal","QR rolne / magacin","Mašina: ___________"],["Kontrola","dimenzija, štampa, var","QC: ___________"],["Kraj","stvarna kol. + otpad","Potpis: ___________"]];
  const rows = items||def;
  return (
    <div style={{ border:"1px solid rgba(34,197,94,.3)", borderLeft:"4px solid #22c55e", borderTop:"none", borderRadius:"0 0 14px 14px", overflow:"hidden" }}>
      <div style={{ padding:"9px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(34,197,94,.06)", borderBottom:"1px solid rgba(34,197,94,.15)" }}>
        <span style={{ fontWeight:900, fontSize:12, textTransform:"uppercase", letterSpacing:".7px", color:C.green }}>✅ QC / Kontrola i završetak</span>
        <span style={{ fontSize:10, fontWeight:800, padding:"3px 9px", borderRadius:99, color:C.green, background:"rgba(34,197,94,.1)" }}>operator / QC / potpis</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, padding:"12px 16px", background:"#fafcfa" }}>
        {rows.map(([l,v,sign],i)=>(
          <div key={i} style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"9px 11px" }}>
            <div style={{ fontSize:10, color:C.muted, fontWeight:800, textTransform:"uppercase", letterSpacing:".3px", marginBottom:4 }}>{l}</div>
            <div style={{ fontSize:13, fontWeight:900 }}>{v}</div>
            <div style={{ marginTop:10, borderTop:"1px dashed #e2e8f0", paddingTop:7, fontSize:10, color:"#94a3b8" }}>{sign}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── IF (Info Field) ──────────────────────────────────────
export function IF({ label, value, color, small }) {
  return (
    <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", ...(color?{borderLeft:`3px solid ${color}`}:{}), borderRadius:8, padding:"9px 11px" }}>
      <div style={{ fontSize:10, color:C.muted, fontWeight:800, textTransform:"uppercase", letterSpacing:".3px", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:small?11:13, fontWeight:900, color:color||C.navy }}>{val(value)}</div>
    </div>
  );
}

// ─── Highlight Card ───────────────────────────────────────
export function HC({ label, value, sub, color }) {
  return (
    <div style={{ background:color+"0f", border:`1px solid ${color}44`, borderLeft:`4px solid ${color}`, borderRadius:9, padding:"10px 12px" }}>
      <div style={{ fontSize:10, color:C.muted, fontWeight:800, textTransform:"uppercase", letterSpacing:".3px", marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:16, fontWeight:950, color, lineHeight:1.1 }}>{val(value)}</div>
      {sub && <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>{sub}</div>}
    </div>
  );
}

export { C, val, fmt };
