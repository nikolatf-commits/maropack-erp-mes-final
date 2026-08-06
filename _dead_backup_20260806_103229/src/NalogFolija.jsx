import React, { useState, useEffect } from "react";
import { MaterialText } from './components/MaterialSelectorPRO.jsx';
import { supabase } from "./supabase.js";

var QR_URL = function(val) {
  return "https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=" + encodeURIComponent(val);
};
function QRCode({ text, size }) {
  var sz = size || 90;
  return (
    <div style={{ background: "#fff", borderRadius: 5, padding: 3, display: "inline-block" }}>
      <img src={QR_URL(text)} width={sz} height={sz} alt="QR" style={{ display: "block" }} />
    </div>
  );
}

var f = function(n) { return (+n||0).toLocaleString("sr-RS"); };
var dnow = function() { return new Date().toLocaleDateString("sr-RS"); };

var MAT_GUSTOCA = {
  "BOPP":0.905,"BOPP SEDEF":0.65,"OPP":0.905,"CPP":0.905,
  "PET":1.38,"PA":1.14,"LDPE":0.92,"ALU":2.71,"FXC":0.92,"FXPU":0.92,"FXCB":0.92
};

var KASIRANJE_VALJCI = [490,610,640,670,740,860,890,980,1190,1285,1570];
function num(v){ return Number(String(v||"").replace(",",".")) || 0; }
function predloziValjakKasiranja(idealna){
  var ideal = num(idealna);
  if(!ideal) return 0;
  return KASIRANJE_VALJCI.filter(function(w){ return w <= ideal; }).sort(function(a,b){ return b-a; })[0] || 0;
}
function safeMaterialName(m){
  if(!m) return "";
  var deb = m.debljina || m.deb;
  return [m.vrsta || m.tip || m.material, m.oznaka, deb ? (deb+"µ") : ""].filter(Boolean).join(" ");
}
function parseTrakeFromNalog(n, extra, idealna){
  if(extra && Array.isArray(extra.rezFormati) && extra.rezFormati.length){
    return extra.rezFormati.map(function(x){ return num(x.sirina); }).filter(Boolean);
  }
  var raw = n.sirineTraka || n.rezSirine || n.trake || n.sirinaTrake || "";
  if(raw){
    var arr = String(raw).split(/[,+;\s]+/).map(num).filter(Boolean);
    if(arr.length) return arr;
  }
  var br = num(n.rezBrTraka || n.brojTraka);
  var tr = num(n.sirinaTrake || n.sir || n.sirina);
  if(br && tr) return Array.from({length:br}, function(){ return tr; });
  if(idealna) return [num(idealna)];
  return [];
}

function Hdr({ naslov, brN, suffix, boja, kupac, datum, datumIsp }) {
  var url = window.location.origin + "?ponbr=" + encodeURIComponent(brN + suffix);
  return (
    <div style={{ background: boja, color: "#fff", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 8, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Maropack d.o.o. — Radni nalog</div>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 2 }}>{naslov}</div>
        <div style={{ fontSize: 10, color: "#cbd5e1" }}>
          <b style={{ color: "#fbbf24" }}>{brN}{suffix}</b>
          &nbsp;·&nbsp; {kupac} &nbsp;·&nbsp; {datum}
          {datumIsp && <>&nbsp;·&nbsp; Isporuka: <b style={{ color: "#fde68a" }}>{datumIsp}</b></>}
        </div>
      </div>
      <div style={{ textAlign: "center", flexShrink: 0 }}>
        <QRCode text={url} size={80} />
        <div style={{ fontSize: 8, color: "#94a3b8", marginTop: 2 }}>Skeniraj</div>
      </div>
    </div>
  );
}

function Sec({ title, children, boja, noBorder }) {
  return (
    <div style={{ padding: "8px 14px", borderBottom: noBorder ? "none" : "1px solid #e8edf3" }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: boja || "#94a3b8", marginBottom: 7 }}>{title}</div>
      {children}
    </div>
  );
}

function G({ n, children, gap, mb }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat("+(n||4)+",1fr)", gap: gap||8, marginBottom: mb||0 }}>{children}</div>;
}

function P({ label, val, boja, big }) {
  var bg="#f8fafc",cl="#1e293b",bc="#e2e8f0";
  if(boja==="plava"){bg="#eff6ff";cl="#1e40af";bc="#bfdbfe";}
  if(boja==="zelena"){bg="#f0fdf4";cl="#166534";bc="#bbf7d0";}
  if(boja==="zuta"){bg="#fefce8";cl="#854d0e";bc="#fde68a";}
  if(boja==="crvena"){bg="#fef2f2";cl="#991b1b";bc="#fecaca";}
  if(boja==="ljubicasta"){bg="#f5f3ff";cl="#5b21b6";bc="#ddd6fe";}
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
      <div style={{ fontSize:9,color:"#94a3b8" }}>{label}</div>
      <div style={{ fontSize:big?14:12,fontWeight:600,padding:"4px 7px",background:bg,color:cl,borderRadius:5,border:"1px solid "+bc,minHeight:26 }}>{val||"—"}</div>
    </div>
  );
}

function Potpis() {
  return (
    <div style={{ padding:"7px 14px",background:"#f8fafc",borderTop:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",fontSize:10,color:"#94a3b8" }}>
      <span>Nalog izradio: _________________________ &nbsp; Datum: ___________</span>
      <span>Nalog odobrio: _________________________</span>
    </div>
  );
}

function LinkPolje({ label, val, setVal }) {
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ fontSize:9,color:"#94a3b8",marginBottom:3 }}>{label}</div>
      <div style={{ display:"flex",gap:6,alignItems:"center" }}>
        <input style={{ flex:1,padding:"4px 8px",borderRadius:5,border:"1px solid #e2e8f0",fontSize:12 }}
          value={val} placeholder="https://..." onChange={function(e){setVal(e.target.value);}} />
        {val && <a href={val} target="_blank" rel="noopener noreferrer"
          style={{ padding:"4px 10px",borderRadius:5,background:"#1d4ed8",color:"#fff",fontSize:11,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap" }}>Otvori →</a>}
      </div>
    </div>
  );
}

function RolnaBox({ label, boja, tip, deb, sirina, rolna, loading, zaRadM }) {
  var url = rolna ? window.location.origin + "?rolna=" + encodeURIComponent(rolna.br_rolne) : "";
  var kg = 0;
  if(rolna && tip && deb && zaRadM) {
    var g = MAT_GUSTOCA[tip.split(" ")[0]] || 0.91;
    kg = Math.round(+deb * g * +sirina/1000 * +zaRadM/1000);
  }
  return (
    <div style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",
      background:rolna?"#f0fdf4":"#fef2f2",borderRadius:7,
      border:"1px solid "+(rolna?"#bbf7d0":"#fecaca"),marginBottom:6 }}>
      {loading ? (
        <div style={{ fontSize:11,color:"#94a3b8" }}>⏳ Tražim...</div>
      ) : rolna ? (
        <>
          <div style={{ flexShrink:0,textAlign:"center" }}>
            <QRCode text={url} size={62} />
            <div style={{ fontSize:8,color:"#64748b",marginTop:2 }}>Rolna QR</div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10,fontWeight:700,color:boja||"#64748b",marginBottom:2 }}>{label}</div>
            <div style={{ fontSize:13,fontWeight:800,color:"#166534" }}>{tip} {deb>0?deb+"µ":""} — {sirina}mm</div>
            <div style={{ fontSize:12,fontWeight:700,color:"#1d4ed8",marginTop:1 }}>{rolna.br_rolne}</div>
            <div style={{ fontSize:11,color:"#64748b",marginTop:1 }}>
              Ostalo: <b>{f(rolna.metraza_ost||rolna.metraza)}m</b>
              {rolna.kg_neto>0&&<> · <b>{rolna.kg_neto}kg</b></>}
              {rolna.palet&&<> · <b style={{color:"#f59e0b"}}>{rolna.palet}</b></>}
              {rolna.lot&&<> · LOT: <b>{rolna.lot}</b></>}
            </div>
            {kg>0&&<div style={{ fontSize:11,color:"#7c3aed",marginTop:1 }}>Potrebno za nalog: <b>~{f(kg)}kg</b></div>}
          </div>
          <div style={{ flexShrink:0 }}>
            <div style={{ fontFamily:"monospace",fontSize:7,background:"#fff",padding:"3px 6px",borderRadius:3,border:"1px solid #e2e8f0",letterSpacing:2,color:"#1e293b",maxWidth:120,overflow:"hidden" }}>
              ||| {rolna.br_rolne} |||
            </div>
            <div style={{ fontSize:8,color:"#64748b",textAlign:"center",marginTop:2 }}>Bar kod</div>
          </div>
        </>
      ) : (
        <>
          <div style={{ width:62,height:62,background:"#fecaca",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0 }}>⚠️</div>
          <div>
            <div style={{ fontSize:10,fontWeight:700,color:"#991b1b",marginBottom:2 }}>{label}</div>
            <div style={{ fontSize:13,fontWeight:700,color:"#991b1b" }}>{tip} {deb>0?deb+"µ":""} — {sirina}mm</div>
            <div style={{ fontSize:12,color:"#991b1b",marginTop:2 }}>Nema rolne {sirina}–{+sirina+25}mm u magacinu!</div>
          </div>
        </>
      )}
    </div>
  );
}

export default function NalogFolija({ nalog, onClose, msg }) {
  var [tab, setTab] = useState("mat");
  var [rolne, setRolne] = useState([]);
  var [loadingRolne, setLoadingRolne] = useState(true);
  var [datumIsp, setDatumIsp] = useState("");
  var [brKomInput, setBrKomInput] = useState("");
  var [notes, setNotes] = useState({});
  var [links, setLinks] = useState({ stm:"", kas:"", prf:"", final:"" });
  var [selectedRolls, setSelectedRolls] = useState({});

  // Izvuci podatke
  var extra = (nalog.mats && typeof nalog.mats==="object" && !Array.isArray(nalog.mats)) ? nalog.mats : {};
  var n = Object.assign({}, extra, nalog);
  var brN = n.ponBr || n.br || "MP-0000";
  var kupac = n.kupac || "—";
  var naziv = n.prod || n.naziv || "—";
  var datum = n.datum || dnow();
  var datIsp = datumIsp || extra.datumIsp || n.datumIsp || "";
  var mats = (extra.mats || []).filter(function(m){return m&&m.tip;});
  var sir = +(extra.sir||n.sir||0);
  var ik  = +(extra.idealnaSirinaMaterijala || n.idealnaSirinaMaterijala || extra.ik || n.ik || sir);
  var sk  = +(extra.sk||n.sk||10);
  var nalKom = +(extra.nal||n.nal||0);
  var brKom = +brKomInput || nalKom;
  var kolM = n.kol || nalKom*1000 || 0;
  var zaRadM = brKom>0 ? Math.round(brKom*(1+sk/100)) : Math.round(kolM*(1+sk/100));

  var brKas = mats.reduce(function(s,m){return s+(+m.kas||0);},0);
  var hasSt = mats.some(function(m){return m.stamp;});
  var hasPerf = !!(extra.tipPerf||n.tipPerf);

  var TABS = [
    {k:"mat",l:"📦 Materijal",boja:"#1e3a5f",suffix:"-7"},
    hasSt&&{k:"stm",l:"🖨️ Štampa",boja:"#1a3a1a",suffix:"-2"},
    brKas>0&&{k:"kas",l:"🔗 Kaširanje",boja:"#3a1a1a",suffix:"-3"},
    hasPerf&&{k:"prf",l:"🔵 Perforacija",boja:"#1a1a3a",suffix:"-5"},
    {k:"rez",l:"✂️ Rezanje",boja:"#1a2e1a",suffix:"-4"},
    {k:"ana",l:"📊 Analiza širina",boja:"#334155",suffix:"-A"},
  ].filter(Boolean);

  useEffect(function(){
    setLoadingRolne(true);
    supabase.from("magacin").select("*")
      .neq("status","Iskorišćeno")
      .order("sirina")
      .then(function(r){setRolne(r.data||[]);setLoadingRolne(false);});
  },[]);

  function kandidatiRolni(tip, deb, idealWidth) {
    if(!tip) return [];
    var base = String(tip).split(" ")[0].toUpperCase();
    var ideal = num(idealWidth || ik);
    return (rolne || []).filter(function(r){
      var okTip = r.tip && String(r.tip).toUpperCase().startsWith(base);
      var okDeb = !deb || !r.deb || Math.abs(num(r.deb)-num(deb)) <= 3;
      return okTip && okDeb;
    }).sort(function(a,b){
      var aw=num(a.sirina), bw=num(b.sirina);
      var aOver = aw >= ideal ? 0 : 1;
      var bOver = bw >= ideal ? 0 : 1;
      if(aOver !== bOver) return aOver-bOver;
      return Math.abs(aw-ideal)-Math.abs(bw-ideal);
    });
  }

  function nadjiRolnu(tip,deb,idealWidth) {
    return kandidatiRolni(tip, deb, idealWidth)[0] || null;
  }

  function chosenRolna(m, idx) {
    if(selectedRolls[idx]) {
      return rolne.find(function(r){ return String(r.id || r.br_rolne) === String(selectedRolls[idx]); }) || null;
    }
    return nadjiRolnu(m.tip || m.vrsta || m.material, m.deb || m.debljina, ik);
  }

  function widthAnalysis(rolna, idealWidth) {
    var ideal = num(idealWidth || ik);
    var actual = num(rolna && rolna.sirina);
    var diff = actual && ideal ? actual - ideal : 0;
    var otpadL = diff > 0 ? Math.floor(diff/2) : 0;
    var otpadD = diff > 0 ? diff - otpadL : 0;
    var util = actual > 0 ? Math.min(100, ideal / actual * 100) : 0;
    return { ideal: ideal, actual: actual, diff: diff, otpadL: otpadL, otpadD: otpadD, util: util };
  }

  function kgMat(m) {
    var g = MAT_GUSTOCA[m.tip] || MAT_GUSTOCA[m.tip.split(" ")[0]] || 0.91;
    return Math.round(+m.deb * g * ik/1000 * zaRadM/1000);
  }

  function setLink(k,v){ setLinks(function(l){return Object.assign({},l,{[k]:v});}); }
  function setNote(k,v){ setNotes(function(m){return Object.assign({},m,{[k]:v});}); }

  var aktTab = TABS.find(function(t){return t.k===tab;})||TABS[0];

  var Card = function({children}){
    return <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,overflow:"hidden",marginBottom:20,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>{children}</div>;
  };


  function WasteStrip({ trake, stvarnaSirina, idealnaSirina }) {
    var ana = widthAnalysis({sirina: stvarnaSirina}, idealnaSirina);
    var segs = [];
    if(ana.otpadL>0) segs.push({label:"OTPAD", w:ana.otpadL, waste:true});
    (trake || []).forEach(function(t,i){ if(t) segs.push({label:String(t)+" mm", w:t, waste:false, i:i}); });
    if(ana.otpadD>0) segs.push({label:"OTPAD", w:ana.otpadD, waste:true});
    if(!segs.length) segs.push({label:"IDEALNA ŠIRINA", w:ana.ideal || 1, waste:false});
    var total = Math.max(ana.actual || ana.ideal || 1, segs.reduce(function(sum,x){return sum+num(x.w);},0));
    return <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:9,padding:10}}>
      <div style={{display:"flex",height:58,borderRadius:7,overflow:"hidden",border:"1px solid #cbd5e1"}}>
        {segs.map(function(x,i){
          var flex = Math.max(24, x.w) / total;
          return <div key={i} style={{flex:flex, minWidth:x.waste?48:58, display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",fontSize:11,fontWeight:900,
            background:x.waste?"#fee2e2":"#dbeafe", color:x.waste?"#991b1b":"#1e40af", borderRight:i===segs.length-1?"none":"1px solid #fff"}}>
            <div>{x.label}<div style={{fontSize:9,fontWeight:700}}>{x.w}mm</div></div>
          </div>;
        })}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:7,marginTop:9}}>
        <P label="Idealna širina" val={ana.ideal+"mm"} boja="plava" />
        <P label="Korišćena širina" val={(ana.actual||0)+"mm"} />
        <P label="Otpad levo" val={ana.otpadL+"mm"} boja="crvena" />
        <P label="Otpad desno" val={ana.otpadD+"mm"} boja="crvena" />
        <P label="Iskorišćenje" val={(ana.util||0).toFixed(1)+"%"} boja="zelena" />
      </div>
    </div>;
  }

  function MaterijalProRow({ m, idx }) {
    var ideal = ik;
    var candidates = kandidatiRolni(m.tip || m.vrsta || m.material, m.deb || m.debljina, ideal);
    var r = chosenRolna(m, idx);
    var ana = widthAnalysis(r, ideal);
    var label = safeMaterialName({vrsta:m.tip || m.vrsta || m.material, oznaka:m.oznaka, debljina:m.deb || m.debljina});
    return <tr style={{borderBottom:"1px solid #eef2f7",background:r?"#ffffff":"#fff7ed"}}>
      <td style={{padding:"8px",fontWeight:900,color:"#334155"}}>{idx+1}</td>
      <td style={{padding:"8px",fontWeight:850}}>{label || "—"}</td>
      <td style={{padding:"8px",color:"#1d4ed8",fontWeight:800}}>{ideal ? ideal+" mm" : "—"}</td>
      <td style={{padding:"8px"}}>
        <select value={selectedRolls[idx] || (r ? (r.id || r.br_rolne) : "")} onChange={function(e){ var v=e.target.value; setSelectedRolls(function(x){ var n=Object.assign({},x); if(v) n[idx]=v; else delete n[idx]; return n; }); }}
          style={{width:"100%",padding:"7px",border:"1px solid #cbd5e1",borderRadius:7,fontSize:12,background:"#fff"}}>
          <option value="">{r ? "Predlog: "+r.br_rolne+" / "+r.sirina+"mm" : "Nema predloga — izaberi ručno"}</option>
          {candidates.map(function(c){ return <option key={c.id || c.br_rolne} value={c.id || c.br_rolne}>{c.br_rolne} · {c.sirina}mm · LOT {c.lot || "—"} · {c.lokacija || c.palet || "—"}</option>; })}
        </select>
      </td>
      <td style={{padding:"8px",fontWeight:800,color:r?"#166534":"#991b1b"}}>{r ? r.sirina+" mm" : "—"}</td>
      <td style={{padding:"8px",fontWeight:800,color:ana.diff>0?"#b45309":ana.diff<0?"#991b1b":"#166534"}}>{r ? (ana.diff>=0?"+":"")+ana.diff+" mm" : "—"}</td>
      <td style={{padding:"8px"}}>{r ? (r.lot || "—") : "—"}</td>
      <td style={{padding:"8px"}}>{r ? (r.sarza || r.serija || "—") : "—"}</td>
      <td style={{padding:"8px"}}>{r ? (r.lokacija || r.palet || "—") : "—"}</td>
      <td style={{padding:"8px"}}>{r ? <span style={{padding:"4px 8px",borderRadius:999,background:"#ecfdf5",color:"#166534",fontWeight:900,fontSize:11}}>Predložena</span> : <span style={{padding:"4px 8px",borderRadius:999,background:"#fef2f2",color:"#991b1b",fontWeight:900,fontSize:11}}>Nema</span>}</td>
    </tr>;
  }

  function AnalizaSirinaBox({ trake, actualWidth }) {
    var ideal = ik;
    var valjak = predloziValjakKasiranja(ideal);
    return <div style={{display:"grid",gridTemplateColumns:"1.6fr 1fr",gap:12}}>
      <WasteStrip trake={trake} stvarnaSirina={actualWidth || ideal} idealnaSirina={ideal}/>
      <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:9,padding:10}}>
        <div style={{fontSize:12,fontWeight:950,color:"#0f172a",marginBottom:8}}>Analiza širine / preporuka nabavke</div>
        <G n={2} gap={7} mb={8}>
          <P label="Idealna širina" val={ideal+"mm"} boja="plava" />
          <P label="Predlog valjka" val={valjak ? valjak+"mm" : "nema"} boja="zelena" />
          <P label="Razlika valjka" val={valjak ? (ideal-valjak)+"mm" : "—"} boja="zuta" />
          <P label="Korišćena rola" val={(actualWidth||ideal)+"mm"} />
        </G>
        <div style={{fontSize:11,color:"#64748b",lineHeight:1.5}}>Pravilo kaširanja: bira se najveći valjak koji je manji ili jednak idealnoj širini. Ova analiza se kasnije koristi za preporuku idealnih širina za nabavku i smanjenje otpada.</div>
      </div>
    </div>;
  }

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.7)",zIndex:9999,display:"flex",flexDirection:"column"}}>

      {/* TOP BAR */}
      <div style={{background:"#0f172a",padding:"10px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap"}}>
        <button onClick={onClose} style={{padding:"7px 14px",borderRadius:7,border:"none",background:"#334155",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>← Nazad</button>
        <div style={{color:"#fff",fontWeight:700,fontSize:13,flex:1}}>{naziv} — {kupac} &nbsp;<span style={{color:"#fbbf24"}}>{brN}</span></div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <span style={{color:"#94a3b8",fontSize:11}}>Isporuka:</span>
            <input style={{padding:"5px 8px",borderRadius:6,border:"1px solid #475569",background:"#1e293b",color:"#fff",fontSize:12,width:105}}
              value={datumIsp} placeholder="dd.mm.gggg."
              onChange={function(e){setDatumIsp(e.target.value);}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <span style={{color:"#94a3b8",fontSize:11}}>Kom:</span>
            <input type="number" style={{padding:"5px 8px",borderRadius:6,border:"1px solid #475569",background:"#1e293b",color:"#fff",fontSize:12,width:75}}
              value={brKomInput} placeholder={nalKom||""}
              onChange={function(e){setBrKomInput(e.target.value);}}/>
            {zaRadM>0&&<span style={{color:"#fbbf24",fontSize:11}}>→ {f(zaRadM)}m</span>}
          </div>
          <button onClick={function(){window.print();}} style={{padding:"7px 14px",borderRadius:7,border:"none",background:"#1d4ed8",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>🖨️ Štampaj A4</button>
        </div>
      </div>

      {/* TABS */}
      <div style={{background:"#1e293b",padding:"8px 16px 0",display:"flex",gap:4,flexShrink:0,flexWrap:"wrap"}}>
        {TABS.map(function(t){
          return <button key={t.k} onClick={function(){setTab(t.k);}}
            style={{padding:"8px 16px",borderRadius:"8px 8px 0 0",border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
              background:tab===t.k?"#f1f5f9":"transparent",color:tab===t.k?"#0f172a":"#94a3b8"}}>{t.l}</button>;
        })}
      </div>

      {/* NALOG CONTENT */}
      <div style={{flex:1,overflow:"auto",background:"#f1f5f9",padding:20}}>

        {/* 1. MATERIJAL */}
        {tab==="mat"&&(
          <Card>
            <Hdr naslov="Nalog za potrebu materijala" brN={brN} suffix="-7" boja="#1e3a5f" kupac={kupac} datum={datum} datumIsp={datIsp}/>
            <Sec title="Identifikacija">
              <G n={4} mb={8}><P label="Radni nalog br." val={brN} boja="plava"/><P label="Datum" val={datum}/><P label="Datum isporuke" val={datIsp} boja="zuta"/><P label="Kupac" val={kupac}/></G>
              <P label="Naziv proizvoda" val={naziv}/>
            </Sec>
            <Sec title="Potreba materijala PRO — predlog i potvrda rolni" boja="#1e3a5f">
              {mats.length===0&&<div style={{fontSize:12,color:"#94a3b8",padding:8}}>Nema definisanih materijala.</div>}
              {mats.length>0&&<div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden"}}>
                  <thead><tr style={{background:"#f8fafc",borderBottom:"1px solid #e2e8f0"}}>
                    {["#","Materijal","Idealna širina","Predlog / ručni izbor rolne","Stvarna širina","Razlika","LOT","Šarža","Lokacija","Status"].map(function(h){return <th key={h} style={{padding:"8px",textAlign:"left",color:"#475569",fontWeight:900,whiteSpace:"nowrap"}}>{h}</th>;})}
                  </tr></thead>
                  <tbody>{mats.map(function(m,i){ return <MaterijalProRow key={i} m={m} idx={i}/>; })}</tbody>
                </table>
              </div>}
              <div style={{marginTop:10,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                <P label="Idealna širina iz template-a" val={ik+"mm"} boja="plava"/>
                <P label="Valjak za kaširanje" val={(predloziValjakKasiranja(ik)||"—")+"mm"} boja="zelena"/>
                <P label="Pravilo izbora valjka" val="najveći <= idealna"/>
                <P label="Za rad" val={f(zaRadM)+"m"} boja="zuta"/>
              </div>
            </Sec>
            <Sec title="Količine">
              <G n={4}><P label="Naručeno (m)" val={f(kolM)}/><P label="Za rad (m)" val={f(zaRadM)} boja="zuta"/><P label="Škart %" val={sk+"%"}/><P label="Idealna širina" val={ik+"mm"} boja="plava"/></G>
            </Sec>
            <Sec title="Napomena" noBorder>
              <textarea style={{width:"100%",minHeight:36,padding:7,background:"#f8fafc",borderRadius:5,border:"1px solid #e2e8f0",fontSize:12,color:"#64748b",resize:"vertical",boxSizing:"border-box"}}
                value={notes.mat||n.nap||""} onChange={function(e){setNote("mat",e.target.value);}} placeholder="Napomena..."/>
            </Sec>
            <Potpis/>
          </Card>
        )}

        {/* 2. STAMPA */}
        {tab==="stm"&&(
          <Card>
            <Hdr naslov="Nalog za štampu" brN={brN} suffix="-2" boja="#1a3a1a" kupac={kupac} datum={datum} datumIsp={datIsp}/>
            <Sec title="Identifikacija">
              <G n={4} mb={8}><P label="Br. naloga" val={brN} boja="plava"/><P label="Datum" val={datum}/><P label="Rok" val="5 dana od mat." boja="zuta"/><P label="Status" val={n.grafika||"Nov posao"}/></G>
              <G n={2}><P label="Kupac" val={kupac}/><P label="Naziv" val={naziv}/></G>
            </Sec>
            <Sec title="Specifikacija štampe" boja="#1a3a1a">
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead><tr style={{background:"#f8fafc",borderBottom:"1px solid #e2e8f0"}}>
                    {["RB","Naziv","Dim.","Mat.","Kol.(m)","Kol.(kg)","Štampa","Boja","Smer"].map(function(h){
                      return <th key={h} style={{padding:"5px 7px",textAlign:"left",color:"#64748b",fontWeight:600}}>{h}</th>;
                    })}
                  </tr></thead>
                  <tbody>
                    {mats.filter(function(m){return m.stamp;}).map(function(m,i){
                      return <tr key={i} style={{borderBottom:"1px solid #f1f5f9"}}>
                        <td style={{padding:"5px 7px",fontWeight:700}}>{i+1}</td>
                        <td style={{padding:"5px 7px"}}>{naziv}</td>
                        <td style={{padding:"5px 7px",fontFamily:"monospace"}}>{ik}×{f(zaRadM)}</td>
                        <td style={{padding:"5px 7px"}}>{m.tip} {m.deb}µ {ik}mm</td>
                        <td style={{padding:"5px 7px",color:"#059669",fontWeight:700}}>{f(zaRadM)}</td>
                        <td style={{padding:"5px 7px"}}>{f(kgMat(m))}kg</td>
                        <td style={{padding:"5px 7px",color:"#7c3aed",fontWeight:700}}>{n.stm||"Flexo"}</td>
                        <td style={{padding:"5px 7px"}}>{n.brBoja||"4"}</td>
                        <td style={{padding:"5px 7px"}}>{n.smer||"Desno"}</td>
                      </tr>;
                    })}
                    {mats.filter(function(m){return m.stamp;}).length===0&&(
                      <tr><td colSpan={9} style={{padding:"8px 7px",color:"#94a3b8",fontStyle:"italic"}}>Nema štampane folije</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Sec>
            <Sec title="Tehnički parametri">
              <G n={4} mb={8}><P label="Mašina" val={n.stmMasina||"Flexo 8-boja"}/><P label="Obim valjka" val={n.obimValjka||"—"}/><P label="Strana štampe" val={n.stranaStm||"Spolja"}/><P label="Hilzna" val={(n.hilzna||"76")+"mm"}/></G>
              <G n={4}><P label="Kliše" val={n.klise||"—"}/><P label="Print proof" val={n.proof||"—"}/><P label="Linijatura" val={n.linijatura||"—"}/><P label="Cena usluge" val="0,50 €/kg"/></G>
            </Sec>
            <Sec title="Prateći dokumenti">
              <LinkPolje label="Link tehničkog crteža / rasklopa" val={links.stm} setVal={function(v){setLink("stm",v);}}/>
            </Sec>
            <Sec title="Napomene" noBorder>
              <textarea style={{width:"100%",minHeight:44,padding:7,background:"#f8fafc",borderRadius:5,border:"1px solid #e2e8f0",fontSize:12,color:"#64748b",resize:"vertical",boxSizing:"border-box"}}
                value={notes.stm||""} onChange={function(e){setNote("stm",e.target.value);}}
                placeholder="Obratiti pažnju na kvalitet štampe. Bez ogrebotina, raspasivanja. Rolne ravno namotane."/>
            </Sec>
            <Potpis/>
          </Card>
        )}

        {/* 3. KASIRANJE */}
        {tab==="kas"&&(
          <Card>
            <Hdr naslov="Nalog za kaširanje" brN={brN} suffix="-3" boja="#3a1a1a" kupac={kupac} datum={datum} datumIsp={datIsp}/>
            <Sec title="Identifikacija">
              <G n={4} mb={8}><P label="Radni nalog" val={brN} boja="plava"/><P label="Datum" val={datum}/><P label="Kupac" val={kupac}/><P label="Tiraz" val={f(zaRadM)+"m"}/></G>
              <G n={2}><P label="Naziv" val={naziv}/><P label="Sastav GP" val={mats.map(function(m){return m.tip+" "+m.deb+"µ";}).join(" + ")||"—"}/></G>
            </Sec>
            {Array.from({length:Math.max(brKas,1)}).map(function(_,i){
              var matA=mats[i*2]; var matB=mats[i*2+1];
              var aktivan=i===0||(matA&&matB);
              return (
                <Sec key={i} title={(i+1)+". kaširanje"+(aktivan?"":" — nije potrebno")} boja="#3a1a1a">
                  <div style={{opacity:aktivan?1:0.4}}>
                    <G n={4} mb={8}>
                      <P label="Širina nanosa (mm)" val={aktivan?sir:"—"}/>
                      <P label="Širina valjka za kaširanje" val={aktivan?((predloziValjakKasiranja(ik)||"—")+"mm"):"—"} boja="zelena"/>
                      <P label="Odnos lepka" val={aktivan?(n.lepakOdnos||"3:1"):"—"}/>
                      <P label="Nanos (g/m²)" val={aktivan?(n.lepakNanos||"3,5"):"—"} boja={aktivan?"zuta":""}/>
                    </G>
                    {matA&&<RolnaBox label="Odmotač A" tip={matA.tip} deb={matA.deb} sirina={ik} rolna={nadjiRolnu(matA.tip,matA.deb)} loading={loadingRolne} zaRadM={zaRadM}/>}
                    {matB&&<RolnaBox label="Odmotač B" tip={matB.tip} deb={matB.deb} sirina={ik} rolna={nadjiRolnu(matB.tip,matB.deb)} loading={loadingRolne} zaRadM={zaRadM}/>}
                  </div>
                </Sec>
              );
            })}
            <Sec title="Parametri">
              <G n={4}><P label="Tip lepka" val={n.tipLepka||"PU solventni"}/><P label="Max prečnik" val="do 800mm"/><P label="Ulaz" val="Magacin"/><P label="Izlaz" val="Rezanje"/></G>
            </Sec>
            <Sec title="Prateći dokumenti">
              <LinkPolje label="Link PDF parametara kaširanja" val={links.kas} setVal={function(v){setLink("kas",v);}}/>
            </Sec>
            <Sec title="Napomene" noBorder>
              <textarea style={{width:"100%",minHeight:36,padding:7,background:"#f8fafc",borderRadius:5,border:"1px solid #e2e8f0",fontSize:12,color:"#64748b",resize:"vertical",boxSizing:"border-box"}}
                value={notes.kas||""} onChange={function(e){setNote("kas",e.target.value);}}
                placeholder="Proveriti adheziju na nastavku svake rolne. Meriti nanos svakih 2.000m."/>
            </Sec>
            <Potpis/>
          </Card>
        )}

        {/* 4. PERFORACIJA */}
        {tab==="prf"&&(
          <Card>
            <Hdr naslov="Nalog za perforaciju" brN={brN} suffix="-5" boja="#1a1a3a" kupac={kupac} datum={datum} datumIsp={datIsp}/>
            <Sec title="Identifikacija">
              <G n={4}><P label="Radni nalog" val={brN} boja="plava"/><P label="Datum" val={datum}/><P label="Kupac" val={kupac}/><P label="Naziv" val={naziv}/></G>
            </Sec>
            <Sec title="Parametri perforacije" boja="#1a1a3a">
              <G n={4} mb={8}>
                <P label="Tip perforacije" val={n.tipPerf||"—"} boja={n.tipPerf?"plava":""}/>
                <P label="Oblik" val={n.oblikPerf||"—"}/>
                <P label="Orijentacija" val={n.orjentPerf||"Poprečna"}/>
                <P label="Razmak (mm)" val={n.razmakPerf||"—"}/>
              </G>
              <G n={4}>
                <P label="Širina materijala" val={sir+"mm"}/>
                <P label="Količina (m)" val={f(zaRadM)}/>
                <P label="Brzina (m/min)" val={n.brzinaPerf||"120"}/>
                <P label="Vreme izrade" val={n.brzinaPerf?Math.round(zaRadM/+n.brzinaPerf/60*10)/10+"h":"—"} boja="zelena"/>
              </G>
            </Sec>
            <Sec title="Kontrola">
              <G n={3}>
                <P label="Sila kidanja (N)" val="Izmeriti i upisati"/>
                <P label="Tačnost razmaka" val={n.razmakPerf?n.razmakPerf+" ± 0,5mm":"—"}/>
                <P label="Vizuelna kontrola" val="Svakih 5.000m"/>
              </G>
            </Sec>
            <Sec title="Prateći dokumenti — printaju se uz nalog">
              <LinkPolje label="🔗 PDF specifikacija perforacije" val={links.prf} setVal={function(v){setLink("prf",v);}}/>
              <LinkPolje label="🖼️ Izgled finalne rolne / tehnički crtež" val={links.final} setVal={function(v){setLink("final",v);}}/>
              {(links.prf||links.final)&&(
                <div style={{display:"flex",gap:8,marginTop:6}}>
                  {links.prf&&<a href={links.prf} target="_blank" rel="noopener noreferrer"
                    style={{padding:"6px 12px",borderRadius:6,background:"#1a1a3a",color:"#fff",fontSize:11,fontWeight:700,textDecoration:"none"}}>📄 Spec. perforacije</a>}
                  {links.final&&<a href={links.final} target="_blank" rel="noopener noreferrer"
                    style={{padding:"6px 12px",borderRadius:6,background:"#059669",color:"#fff",fontSize:11,fontWeight:700,textDecoration:"none"}}>🖼️ Finalni izgled</a>}
                </div>
              )}
            </Sec>
            <Sec title="Napomena operatera (upisati po završetku)" noBorder>
              <textarea style={{width:"100%",minHeight:48,padding:7,background:"#fffbeb",borderRadius:5,border:"1px dashed #fde68a",fontSize:12,color:"#92400e",resize:"vertical",boxSizing:"border-box"}}
                value={notes.prf||""} onChange={function(e){setNote("prf",e.target.value);}} placeholder="Operater upisuje zapažanja..."/>
            </Sec>
            <Potpis/>
          </Card>
        )}

        {/* 5. REZANJE */}
        {tab==="rez"&&(
          <Card>
            <Hdr naslov="Nalog za rezanje" brN={brN} suffix="-4" boja="#1a2e1a" kupac={kupac} datum={datum} datumIsp={datIsp}/>
            <Sec title="Identifikacija">
              <G n={4} mb={8}><P label="Radni nalog" val={brN} boja="plava"/><P label="Datum" val={datum}/><P label="Kupac" val={kupac}/><P label="Kol. za rasecanje" val={f(zaRadM)+"m"}/></G>
              <G n={2}><P label="Naziv" val={naziv}/><P label="Sastav" val={mats.map(function(m){return m.tip+" "+m.deb+"µ";}).join(" + ")||"—"}/></G>
            </Sec>
            <Sec title="Parametri rezanja" boja="#1a2e1a">
              <G n={4} mb={8}>
                <P label="Vrsta sečiva" val={n.secivo||"Žilet"}/>
                <P label="Šir. matične rolne" val={ik+"mm"} boja="plava"/>
                <P label="Br. traka" val={n.rezBrTraka||"—"}/>
                <P label="Strana namotavanja" val={n.stranaRez||"Štampa spolja"}/>
              </G>
              <G n={4}>
                <P label="Prečnik fin. rolne" val={n.precnikRolne||"do 600mm"}/>
                <P label="Dužina fin. rolne" val={(n.duzinaRolne||"5000")+"m"}/>
                <P label="Korona tretman" val={n.korona||"Ne"}/>
                <P label="Plan. br. rolni" val={n.rezBrTraka&&n.duzinaRolne?Math.ceil(zaRadM/+n.duzinaRolne)+" rolni":"—"} boja="zelena"/>
              </G>
            </Sec>

            <Sec title="Grafički prikaz rezanja — otpad levo/desno" boja="#1a2e1a">
              {(() => {
                var trake = parseTrakeFromNalog(n, extra, ik);
                var firstRolna = mats[0] ? chosenRolna(mats[0],0) : null;
                var actualWidth = firstRolna ? num(firstRolna.sirina) : ik;
                return <AnalizaSirinaBox trake={trake} actualWidth={actualWidth}/>;
              })()}
            </Sec>

            {/* Šema rezanja */}
            {extra.rezFormati&&extra.rezFormati.length>0&&(
              <Sec title="Šema rezanja" boja="#1a2e1a">
                <div style={{display:"flex",gap:3,alignItems:"stretch",marginBottom:10,padding:8,background:"#f8fafc",borderRadius:6}}>
                  <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:3,padding:"4px 6px",color:"#991b1b",fontSize:9,display:"flex",alignItems:"center"}}>otpad</div>
                  {extra.rezFormati.map(function(fmt,i){
                    var boje=[["#dbeafe","#93c5fd","#1e40af"],["#dcfce7","#86efac","#166534"],["#f3e8ff","#c4b5fd","#5b21b6"],["#fef3c7","#fcd34d","#92400e"]];
                    var b=boje[i%boje.length];
                    return <div key={i} style={{background:b[0],border:"1px solid "+b[1],borderRadius:3,padding:"5px 10px",color:b[2],fontWeight:700,fontSize:11,textAlign:"center",flex:+(fmt.sirina)||1}}>
                      {"I II III IV V VI".split(" ")[i]} — {fmt.sirina}mm
                      <div style={{fontSize:9,fontWeight:400,marginTop:2}}>{fmt.metraza?f(fmt.metraza)+"m":""} {fmt.napomena||""}</div>
                    </div>;
                  })}
                  <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:3,padding:"4px 6px",color:"#991b1b",fontSize:9,display:"flex",alignItems:"center"}}>otpad</div>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead><tr style={{background:"#f8fafc",borderBottom:"1px solid #e2e8f0"}}>
                    {["Format","Širina","Br. naloga","Kupac / Naziv","Metraža","Br. rolni","Hilzna","Izlaz"].map(function(h){
                      return <th key={h} style={{padding:"5px 7px",textAlign:"left",color:"#64748b",fontWeight:600}}>{h}</th>;
                    })}
                  </tr></thead>
                  <tbody>
                    {extra.rezFormati.map(function(fmt,i){
                      return <tr key={i} style={{borderBottom:"1px solid #f1f5f9"}}>
                        <td style={{padding:"5px 7px",fontWeight:700}}>{"I II III IV V VI".split(" ")[i]}</td>
                        <td style={{padding:"5px 7px"}}>{fmt.sirina}mm</td>
                        <td style={{padding:"5px 7px",color:"#1d4ed8",fontWeight:600}}>{brN}-{"ABCDE"[i]}</td>
                        <td style={{padding:"5px 7px"}}>{kupac} · {fmt.naziv||naziv}</td>
                        <td style={{padding:"5px 7px",color:"#059669",fontWeight:600}}>{fmt.metraza?f(fmt.metraza):"—"}</td>
                        <td style={{padding:"5px 7px",color:"#059669",fontWeight:600}}>{fmt.brRolni||"—"}</td>
                        <td style={{padding:"5px 7px"}}>{(n.hilzna||"76")}mm</td>
                        <td style={{padding:"5px 7px"}}>{fmt.izlaz||"Magacin GP"}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </Sec>
            )}

            <Sec title="Pakovanje i označavanje">
              <G n={4} mb={8}>
                <P label="Rolne za isporuku" val={n.rolneIsporuka||"Sa nastavkom"}/>
                <P label="Obeležavanje nast." val={n.obelezavanje||"Crvena traka"} boja="zuta"/>
                <P label="Pakovanje" val={n.pakovanjeRolni||"Svaka pojedinačno"}/>
                <P label="Paleta" val={n.paleta||"Euro paleta"}/>
              </G>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {["1. Etiketa u hilznu","2. Etiketa na rolnu","3. Etiketa na omot","Upisati kilažu na etiketu"].map(function(x){
                  return <span key={x} style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:"#eff6ff",color:"#1e40af",border:"1px solid #bfdbfe"}}>{x}</span>;
                })}
              </div>
            </Sec>

            <Sec title="Prateći dokumenti">
              <LinkPolje label="🖼️ Izgled finalne rolne" val={links.final} setVal={function(v){setLink("final",v);}}/>
            </Sec>

            <Sec title="Napomena / Napomena operatera" noBorder>
              <G n={2}>
                <textarea style={{padding:7,background:"#f8fafc",borderRadius:5,border:"1px solid #e2e8f0",fontSize:12,color:"#64748b",resize:"vertical",minHeight:44,boxSizing:"border-box"}}
                  value={notes.rez||n.nap||""} onChange={function(e){setNote("rez",e.target.value);}} placeholder="Napomena..."/>
                <textarea style={{padding:7,background:"#fffbeb",borderRadius:5,border:"1px dashed #fde68a",fontSize:12,color:"#92400e",resize:"vertical",minHeight:44,boxSizing:"border-box"}}
                  placeholder="Operater upisuje zapažanja..."/>
              </G>
            </Sec>
            <Potpis/>
          </Card>
        )}


        {/* 6. ANALIZA ŠIRINA */}
        {tab==="ana"&&(
          <Card>
            <Hdr naslov="Analiza idealnih širina za nabavku" brN={brN} suffix="-A" boja="#334155" kupac={kupac} datum={datum} datumIsp={datIsp}/>
            <Sec title="Analiza proizvoda / kupca">
              <G n={4} mb={8}><P label="Kupac" val={kupac}/><P label="Proizvod" val={naziv}/><P label="Idealna širina" val={ik+"mm"} boja="plava"/><P label="Predlog valjka" val={(predloziValjakKasiranja(ik)||"—")+"mm"} boja="zelena"/></G>
              <div style={{fontSize:12,color:"#475569"}}>Ovaj prikaz skuplja podatke iz naloga: idealna širina, stvarno korišćena širina rolne, razlika, otpad i količina. Kasnije se iz ovoga dobija preporuka koje širine materijala treba poručivati.</div>
            </Sec>
            <Sec title="Pregled slojeva i korišćenih širina" boja="#334155">
              <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{background:"#f8fafc",borderBottom:"1px solid #e2e8f0"}}>{["Sloj","Materijal","Idealna","Korišćena rola","Razlika","Otpad L","Otpad D","LOT","Lokacija"].map(function(h){return <th key={h} style={{padding:"7px",textAlign:"left",fontWeight:900,color:"#475569"}}>{h}</th>;})}</tr></thead>
                <tbody>{mats.map(function(m,i){ var r=chosenRolna(m,i); var a=widthAnalysis(r,ik); return <tr key={i} style={{borderBottom:"1px solid #eef2f7"}}>
                  <td style={{padding:"7px",fontWeight:900}}>{i+1}</td><td style={{padding:"7px"}}>{safeMaterialName({vrsta:m.tip, oznaka:m.oznaka, debljina:m.deb})}</td><td style={{padding:"7px"}}>{ik}mm</td><td style={{padding:"7px"}}>{r? r.sirina+"mm / "+r.br_rolne:"—"}</td><td style={{padding:"7px",fontWeight:800}}>{r?(a.diff>=0?"+":"")+a.diff+"mm":"—"}</td><td style={{padding:"7px"}}>{a.otpadL}mm</td><td style={{padding:"7px"}}>{a.otpadD}mm</td><td style={{padding:"7px"}}>{r?.lot||"—"}</td><td style={{padding:"7px"}}>{r?.lokacija||r?.palet||"—"}</td>
                </tr>; })}</tbody>
              </table></div>
            </Sec>
            <Sec title="Preporuka za nabavku" noBorder>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:9,padding:12}}><b>Najvažnija širina</b><div style={{fontSize:22,fontWeight:950,color:"#1d4ed8"}}>{ik} mm</div><div style={{fontSize:11,color:"#475569"}}>Standardna idealna širina ovog proizvoda.</div></div>
                <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:9,padding:12}}><b>Valjak za kaširanje</b><div style={{fontSize:22,fontWeight:950,color:"#166534"}}>{predloziValjakKasiranja(ik)||"—"} mm</div><div style={{fontSize:11,color:"#475569"}}>Najveći postojeći valjak koji nije širi od materijala.</div></div>
                <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:9,padding:12}}><b>Kontrola otpada</b><div style={{fontSize:22,fontWeight:950,color:"#c2410c"}}>L/D</div><div style={{fontSize:11,color:"#475569"}}>Prati se otpad levo i desno po svakoj korišćenoj roli.</div></div>
              </div>
            </Sec>
            <Potpis/>
          </Card>
        )}
      </div>
    </div>
  );
}


// V47_NALOG_FULL_MATERIAL_NAME: nalozi treba da prikazuju pun naziv materijala: VRSTA + OZNAKA + DEBLJINA, npr. BOPP FXCB 20µ.
