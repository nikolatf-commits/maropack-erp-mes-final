import React, { useMemo, useState } from 'react';
import { applyCutPlanToDb, saveLocalDb } from './services/warehouseWorkflow.js';

const C={
  page:{padding:22,background:'#f8fafc',minHeight:'100%',color:'#0f172a'},
  card:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:18,padding:16,boxShadow:'0 10px 28px rgba(15,23,42,.06)'},
  btn:{border:0,borderRadius:12,padding:'10px 14px',fontWeight:900,cursor:'pointer'},
  input:{width:'100%',border:'1px solid #cbd5e1',borderRadius:12,padding:12,fontWeight:800,boxSizing:'border-box',outline:'none'},
  th:{textAlign:'left',padding:10,fontSize:12,color:'#475569',background:'#f1f5f9'},
  td:{padding:10,borderBottom:'1px solid #e2e8f0',fontSize:13}
};
const demoRolls=[
  { id:'R-001', materijal:'BOPP FXCB', tip:'BOPP', debljina:20, sirina:1000, metara:32000, kg:420, lot:'A12', lokacija:'A-01', status:'na stanju' },
  { id:'R-002', materijal:'CPP PLC', tip:'CPP', debljina:25, sirina:840, metara:18000, kg:390, lot:'B3', lokacija:'B-02', status:'na stanju' },
  { id:'R-003', materijal:'PET', tip:'PET', debljina:12, sirina:1285, metara:22000, kg:510, lot:'P7', lokacija:'C-01', status:'na stanju' },
  { id:'R-004', materijal:'PE', tip:'PE', debljina:30, sirina:1570, metara:14000, kg:650, lot:'PE2', lokacija:'A-03', status:'rezervisano' },
  { id:'R-005', materijal:'BOPP FXCB', tip:'BOPP', debljina:20, sirina:1190, metara:26000, kg:455, lot:'A15', lokacija:'A-04', status:'na stanju' }
];
function num(v,d=0){ const x=Number(String(v??'').replace(',','.')); return Number.isFinite(x)?x:d; }
function pickDbArray(db){
  if(Array.isArray(db)) return db;
  const keys=['magacin_rolni','magacinRolni','rolne','magacin','materijali','stock','warehouse'];
  for(const k of keys) if(Array.isArray(db?.[k]) && db[k].length) return db[k];
  return [];
}
function normalizeRolls(db){
  const src=pickDbArray(db); const list=(src.length?src:demoRolls).map((r,i)=>({
    id:String(r.br_rolne||r.broj_rolne||r.brojRolne||r.oznaka||r.code||r.id||`R-${i+1}`),
    materijal:String(r.materijal||r.naziv_materijala||r.naziv||r.tip||r.vrsta||'Materijal'),
    tip:String(r.tip||r.vrsta||r.materijal||'Materijal'),
    debljina:num(r.debljina||r.mikroni||r.mic||r.um||0),
    sirina:num(r.sirina||r.sirina_mm||r.width||0),
    metara:num(r.metara||r.duzina||r.ostalo_m||r.stanje_m||r.m||0),
    kg:num(r.kg||r.neto||r.tezina||0),
    lot:String(r.lot||r.LOT||r.batch||'—'),
    lokacija:String(r.lokacija||r.location||'—'),
    status:String(r.status||'na stanju').toLowerCase(),
    rezervisano:num(r.rezervisano||r.reserved_m||0)
  })).filter(r=>r.sirina>0);
  return list;
}
function parseNeeds(text){
  return String(text||'').split(/[\n;]+/).map(x=>x.trim()).filter(Boolean).map((line,i)=>{
    const nums=(line.match(/\d+(?:[.,]\d+)?/g)||[]).map(num);
    const mat=(line.match(/^[A-Za-zČĆŽŠĐčćžšđ0-9/ +.-]+?(?=\s*\d)/)||[''])[0].trim();
    if(!nums[0]) return null;
    return { id:`Z${i+1}`, materijal:mat && !/^x$/i.test(mat)?mat:'', sirina:nums[0], metara:nums[1]||0, qty:Math.max(1,Math.round(nums[2]||1)), raw:line };
  }).filter(Boolean);
}
function scoreRoll(roll, need, strictMaterial){
  const materialMatch=!need.materijal || roll.materijal.toLowerCase().includes(need.materijal.toLowerCase()) || roll.tip.toLowerCase().includes(need.materijal.toLowerCase());
  if(strictMaterial && !materialMatch) return -Infinity;
  if(roll.sirina<need.sirina) return -Infinity;
  if(need.metara && (roll.metara-roll.rezervisano)<need.metara) return -Infinity;
  const waste=roll.sirina-need.sirina;
  const available=Math.max(0,roll.metara-roll.rezervisano);
  const util=need.sirina/roll.sirina*100;
  const exactBonus=waste===0?100000:0;
  const materialBonus=materialMatch?2500:-800;
  const lengthBonus=need.metara?Math.min(available/need.metara,3)*120:0;
  const statusPenalty=roll.status.includes('rez')?900:0;
  return exactBonus+materialBonus+util*50-waste*3+lengthBonus-statusPenalty;
}
function planWarehouse(rolls, needs, opts){
  const available=rolls.map(r=>({...r, available:Math.max(0,r.metara-r.rezervisano)}));
  const expanded=[]; needs.forEach(n=>{ for(let i=0;i<n.qty;i++) expanded.push({...n, uid:`${n.id}-${i+1}`}); });
  const plans=[]; const warnings=[];
  expanded.sort((a,b)=>b.sirina-a.sirina).forEach(need=>{
    let best=null;
    for(const r of available){
      const sc=scoreRoll(r,need,opts.strictMaterial);
      if(sc===-Infinity) continue;
      if(!best || sc>best.score) best={roll:r,score:sc};
    }
    if(!best){ plans.push({need,roll:null,waste:null,util:0,status:'missing'}); warnings.push(`Nema odgovarajuće rolne za ${need.raw}`); return; }
    const roll=best.roll;
    const consume=need.metara||0;
    if(consume) roll.available=Math.max(0,roll.available-consume);
    const waste=roll.sirina-need.sirina;
    const util=need.sirina/roll.sirina*100;
    const leftoverWidth=waste;
    const leftoverMeters=consume?roll.available:roll.metara;
    const newQr=leftoverWidth>opts.minUsefulWaste && leftoverMeters>0;
    plans.push({need,roll:{...roll},consume,waste,util,leftoverWidth,leftoverMeters,newQr,status:'ok'});
  });
  const used=plans.filter(p=>p.roll).reduce((s,p)=>s+p.need.sirina,0);
  const total=plans.filter(p=>p.roll).reduce((s,p)=>s+p.roll.sirina,0);
  const waste=plans.filter(p=>p.roll).reduce((s,p)=>s+p.waste,0);
  const byRoll=plans.filter(p=>p.roll).reduce((acc,p)=>{ (acc[p.roll.id]=acc[p.roll.id]||[]).push(p); return acc; },{});
  return {plans,warnings,summary:{count:plans.length,ok:plans.filter(p=>p.roll).length,missing:plans.filter(p=>!p.roll).length,util:total?used/total*100:0,waste,byRoll}};
}
function Badge({children,tone='slate'}){const m={green:['#dcfce7','#166534'],red:['#fee2e2','#991b1b'],amber:['#fef3c7','#92400e'],blue:['#dbeafe','#1e40af'],slate:['#f1f5f9','#334155']}; const [bg,fg]=m[tone]||m.slate; return <span style={{background:bg,color:fg,borderRadius:999,padding:'4px 8px',fontSize:12,fontWeight:900}}>{children}</span>}
function Stat({label,value,tone}){return <div style={C.card}><div style={{fontSize:12,color:'#64748b',fontWeight:950,textTransform:'uppercase'}}>{label}</div><div style={{fontSize:25,fontWeight:950,color:tone||'#0f172a',marginTop:4}}>{value}</div></div>}
function exportCsv(rows){
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='plan_rezanja_iz_magacina.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function QrBox({text}){return <div style={{width:54,height:54,border:'2px solid #0f172a',borderRadius:8,display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:2,padding:3,background:'#fff'}}>{Array.from({length:25}).map((_,i)=><div key={i} style={{background:(i%2===0||text.length%(i+2)===0)?'#0f172a':'#fff',borderRadius:1}} />)}</div>}

export default function PlanerRezanjaIzMagacina({ db, setDb, msg }){
  const rolls=useMemo(()=>normalizeRolls(db),[db]);
  const [filter,setFilter]=useState('');
  const [needs,setNeeds]=useState('BOPP 840 x 12000 x 1\nCPP 420 x 8000 x 2\nPET 210 x 4000 x 2');
  const [strictMaterial,setStrictMaterial]=useState(true);
  const [minUsefulWaste,setMinUsefulWaste]=useState(80);
  const [selectedRoll,setSelectedRoll]=useState('');
  const filtered=useMemo(()=>rolls.filter(r=>!filter || `${r.id} ${r.materijal} ${r.tip} ${r.lot} ${r.lokacija}`.toLowerCase().includes(filter.toLowerCase())),[rolls,filter]);
  const needsRows=useMemo(()=>parseNeeds(needs),[needs]);
  const result=useMemo(()=>planWarehouse(filtered,needsRows,{strictMaterial,minUsefulWaste:num(minUsefulWaste)}),[filtered,needsRows,strictMaterial,minUsefulWaste]);
  const planForRoll=selectedRoll ? result.plans.filter(p=>p.roll?.id===selectedRoll) : result.plans;
  const acceptPlan=()=>{
    const ok=result.plans.filter(p=>p.roll);
    if(!ok.length){ msg?.('Nema validnog plana za prihvatanje','err'); return; }
    const updated=applyCutPlanToDb(db||{}, result, { naziv:'Plan rezanja iz magacina PRO', napomena:'Prihvaćeno iz Planera rezanja' });
    saveLocalDb(updated);
    if(typeof setDb==='function') setDb(updated);
    const text=ok.map(p=>`${p.roll.id}: ${p.need.sirina}mm x ${p.need.metara||0}m | otpad ${p.waste}mm | ${(p.createLeftoverQr||p.newQr)?'nova QR etiketa za ostatak':''}`).join('\n');
    navigator.clipboard?.writeText(text);
    msg?.('Plan prihvaćen: metraža skinuta, ostatak rolne upisan i QR etikete pripremljene.');
  };
  const csv=()=>exportCsv([['Zahtev','Materijal zahteva','Rola','Materijal rolne','Sirina rolne','Metara uzeti','Otpad mm','Iskoriscenost %','Lokacija','LOT','Nova QR etiketa'],...result.plans.map(p=>[p.need.sirina,p.need.materijal,p.roll?.id||'',p.roll?.materijal||'',p.roll?.sirina||'',p.consume||p.need.metara||'',p.waste??'',p.util?.toFixed?.(1)||'',p.roll?.lokacija||'',p.roll?.lot||'',(p.createLeftoverQr||p.newQr)?'DA':'NE'])]);
  return <div style={C.page}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:18,flexWrap:'wrap'}}>
      <div><h1 style={{margin:0,fontSize:28,fontWeight:950}}>✂️ Planer rezanja iz magacina PRO</h1><p style={{margin:'6px 0 0',color:'#64748b'}}>Profesionalni plan iz stvarnih rolni: izbor rolne, metraža, otpad, rezervacija, ostatak rolne i QR etiketa.</p></div>
      <div style={{display:'flex',gap:8}}><button onClick={acceptPlan} style={{...C.btn,background:'#0f172a',color:'#fff'}}>Prihvati / kopiraj plan</button><button onClick={csv} style={{...C.btn,background:'#2563eb',color:'#fff'}}>CSV izvoz</button></div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'370px 1fr',gap:16}}>
      <div style={{display:'grid',gap:16,alignContent:'start'}}>
        <div style={C.card}><h3 style={{margin:'0 0 10px'}}>1. Filter magacina</h3><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Materijal, LOT, lokacija, broj rolne..." style={C.input}/><div style={{marginTop:10,display:'flex',gap:8,flexWrap:'wrap'}}><Badge tone="blue">{filtered.length} rolni</Badge><Badge tone="green">{filtered.reduce((s,r)=>s+r.metara,0).toLocaleString('sr-RS')} m</Badge></div></div>
        <div style={C.card}><h3 style={{margin:'0 0 10px'}}>2. Zahtevi za rezanje</h3><textarea value={needs} onChange={e=>setNeeds(e.target.value)} style={{...C.input,minHeight:170,fontFamily:'ui-monospace,Consolas'}}/><div style={{marginTop:8,color:'#64748b',fontSize:12}}>Format: <b>materijal širina x metara x kom</b>. Primer: BOPP 840 x 12000 x 1.</div></div>
        <div style={C.card}><h3 style={{margin:'0 0 10px'}}>3. Pravila planiranja</h3><label style={{display:'flex',alignItems:'center',gap:8,fontWeight:900}}><input type="checkbox" checked={strictMaterial} onChange={e=>setStrictMaterial(e.target.checked)}/> Strogo isti materijal</label><label style={{display:'block',marginTop:12}}><small>Min. korisni ostatak za novu QR etiketu mm</small><input type="number" value={minUsefulWaste} onChange={e=>setMinUsefulWaste(e.target.value)} style={C.input}/></label></div>
        <div style={C.card}><h3 style={{margin:'0 0 10px'}}>Dostupne rolne</h3><div style={{display:'grid',gap:8,maxHeight:390,overflow:'auto'}}>{filtered.map(r=><button key={r.id} onClick={()=>setSelectedRoll(selectedRoll===r.id?'':r.id)} style={{textAlign:'left',border:selectedRoll===r.id?'2px solid #2563eb':'1px solid #e2e8f0',borderRadius:14,padding:10,background:'#fff',cursor:'pointer'}}><div style={{display:'flex',justifyContent:'space-between',fontWeight:950}}><span>{r.id}</span><span>{r.sirina} mm</span></div><div style={{fontSize:12,color:'#64748b',marginTop:2}}>{r.materijal} {r.debljina?`${r.debljina}µ`:''} · {(r.metara-r.rezervisano).toLocaleString('sr-RS')} m slobodno</div><div style={{fontSize:12,color:'#64748b'}}>LOT {r.lot} · {r.lokacija} · {r.status}</div></button>)}</div></div>
      </div>
      <div style={{display:'grid',gap:16}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12}}><Stat label="Zahteva" value={result.summary.count}/><Stat label="Planirano" value={result.summary.ok} tone="#059669"/><Stat label="Nedostaje" value={result.summary.missing} tone={result.summary.missing?'#dc2626':'#059669'}/><Stat label="Iskorišćenost" value={`${result.summary.util.toFixed(1)}%`}/><Stat label="Otpad" value={`${result.summary.waste.toFixed(0)} mm`} tone={result.summary.waste?'#dc2626':'#059669'}/></div>
        {result.warnings.length>0&&<div style={{...C.card,borderColor:'#f59e0b',background:'#fffbeb'}}><b>⚠ Upozorenja:</b><ul style={{margin:'8px 0 0'}}>{result.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
        <div style={C.card}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:12}}><h3 style={{margin:0}}>Plan po rolnama {selectedRoll&&<Badge tone="blue">filter: {selectedRoll}</Badge>}</h3>{selectedRoll&&<button onClick={()=>setSelectedRoll('')} style={{...C.btn,background:'#e2e8f0'}}>Prikaži sve</button>}</div>{planForRoll.map((p,i)=><div key={`${p.need.uid}-${i}`} style={{border:'1px solid #e2e8f0',borderRadius:16,padding:14,marginBottom:12,background:p.roll?'#fff':'#fef2f2'}}><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:8}}><div><b>Zahtev:</b> {p.need.materijal&&`${p.need.materijal} · `}{p.need.sirina} mm {p.need.metara?`× ${p.need.metara.toLocaleString('sr-RS')} m`:''}</div>{p.roll?<div><b>{p.roll.id}</b> · <span style={{color:p.waste===0?'#059669':'#dc2626',fontWeight:950}}>otpad {p.waste} mm</span></div>:<Badge tone="red">Nema rolne</Badge>}</div>{p.roll&&<><div style={{height:56,border:'1px solid #cbd5e1',borderRadius:14,display:'flex',overflow:'hidden',background:'#fee2e2'}}><div style={{width:`${p.need.sirina/p.roll.sirina*100}%`,background:'#dbeafe',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:950}}>PROIZVOD {p.need.sirina} mm</div>{p.waste>0&&<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:950,color:'#991b1b'}}>OSTATAK {p.waste} mm</div>}</div><div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8,marginTop:10,fontSize:12}}><div><b>Materijal</b><br/>{p.roll.materijal}</div><div><b>Rolna</b><br/>{p.roll.sirina} mm</div><div><b>Uzeti</b><br/>{(p.consume||p.need.metara||0).toLocaleString('sr-RS')} m</div><div><b>Slobodno</b><br/>{p.roll.available?.toLocaleString?.('sr-RS')||p.roll.metara.toLocaleString('sr-RS')} m</div><div><b>Lokacija</b><br/>{p.roll.lokacija}</div><div><b>LOT</b><br/>{p.roll.lot}</div></div>{(p.createLeftoverQr||p.newQr)&&<div style={{marginTop:10,display:'flex',alignItems:'center',gap:10,background:'#ecfdf5',border:'1px solid #bbf7d0',borderRadius:14,padding:10}}><QrBox text={`${p.roll.id}-${p.waste}`}/><div><b style={{color:'#166534'}}>Nova QR etiketa za ostatak</b><div style={{fontSize:12,color:'#166534'}}>Ostatak {p.leftoverWidth} mm treba vratiti u magacin kao nova/ostatak rolna sa novom etiketom.</div></div></div>}</>}</div>)}</div>
        <div style={C.card}><h3 style={{marginTop:0}}>Tabela za nalog rezanja</h3><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['Zahtev','Rola','Materijal','Širina rolne','Uzeti m','Otpad','QR ostatak','Lokacija'].map(h=><th key={h} style={C.th}>{h}</th>)}</tr></thead><tbody>{result.plans.map((p,i)=><tr key={i}><td style={C.td}><b>{p.need.sirina} mm</b></td><td style={C.td}>{p.roll?.id||'—'}</td><td style={C.td}>{p.roll?.materijal||'—'}</td><td style={C.td}>{p.roll?`${p.roll.sirina} mm`:'—'}</td><td style={C.td}>{(p.consume||p.need.metara||0).toLocaleString('sr-RS')}</td><td style={{...C.td,color:p.waste===0?'#059669':'#dc2626',fontWeight:950}}>{p.waste==null?'—':`${p.waste} mm`}</td><td style={C.td}>{(p.createLeftoverQr||p.newQr)?<Badge tone="green">DA</Badge>:<Badge>NE</Badge>}</td><td style={C.td}>{p.roll?.lokacija||'—'}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  </div>;
}
