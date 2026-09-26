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

function num(v,d=0){ const x=Number(String(v??'').replace(',','.')); return Number.isFinite(x)?x:d; }
function pickDbArray(db){
  if(Array.isArray(db)) return db;
  const keys=['magacin_rolni','magacinRolni','rolne','magacin','materijali','stock','warehouse'];
  for(const k of keys) if(Array.isArray(db?.[k]) && db[k].length) return db[k];
  return [];
}
function normalizeRolls(db){
  const src=pickDbArray(db); const list=src.map((r,i)=>({
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
// Slobodna dužina rolne (ostatak posle rezervacije/prethodnih rezova u ovom planu).
function slobodnoM(roll){ return Math.max(0, roll.availLen!=null?roll.availLen:(roll.metara-roll.rezervisano)); }
// Koliko TRAKA date širine stane po širini rolne (pravo slitovanje).
function trakePoSirini(rollWidth, needWidth){ return needWidth>0 ? Math.max(1, Math.floor(rollWidth/needWidth)) : 1; }

function scoreRoll(roll, need, strictMaterial){
  const materialMatch=!need.materijal || roll.materijal.toLowerCase().includes(need.materijal.toLowerCase()) || roll.tip.toLowerCase().includes(need.materijal.toLowerCase());
  if(strictMaterial && !materialMatch) return -Infinity;
  if(roll.sirina<need.sirina) return -Infinity;
  const available=slobodnoM(roll);
  if(need.metara && available<need.metara) return -Infinity;   // ni jedan pun prolaz
  const trake=trakePoSirini(roll.sirina, need.sirina);
  const sideWaste=roll.sirina - trake*need.sirina;             // bočni otpad posle slitovanja
  const util=trake*need.sirina/roll.sirina*100;                // popunjenost širine
  const exactBonus=sideWaste===0?100000:0;
  const materialBonus=materialMatch?2500:-800;
  const lengthBonus=need.metara?Math.min(available/need.metara,3)*80:0;
  const statusPenalty=roll.status.includes('rez')?900:0;
  // Nagradi visoku popunjenost širine i mali bočni otpad (bira 440 za 210 → 2 trake, 95%).
  return exactBonus+materialBonus+util*60-sideWaste*4+lengthBonus-statusPenalty;
}
function planWarehouse(rolls, needs, opts){
  // radna kopija sa slobodnom dužinom; ista rolna se troši i po metraži i po širini (traka)
  const available=rolls.map(r=>({...r, availLen:Math.max(0,r.metara-r.rezervisano)}));
  const plans=[]; const warnings=[];
  const ordered=[...needs].sort((a,b)=>b.sirina-a.sirina);
  ordered.forEach(need=>{
    let ostalo=need.qty;               // koliko komada (traka-rolni) još treba
    let guard=0;
    while(ostalo>0 && guard++<300){
      // izaberi najbolju matičnu rolnu
      let best=null;
      for(const r of available){
        const sc=scoreRoll(r,need,opts.strictMaterial);
        if(sc===-Infinity) continue;
        if(!best || sc>best.score) best={roll:r,score:sc};
      }
      if(!best){
        plans.push({need:{...need}, roll:null, qtyLeft:ostalo, waste:null, util:0, status:'missing'});
        warnings.push(`Nema odgovarajuće rolne za ${need.raw}${ostalo<need.qty?` — fali ${ostalo} kom`:''}`);
        break;
      }
      const roll=best.roll;
      const w=need.sirina, m=need.metara||0;
      const trake=trakePoSirini(roll.sirina, w);                 // traka po širini
      const sideWaste=roll.sirina - trake*w;                     // bočni otpad (mm)
      const maxProlazaPoDuzini = m>0 ? Math.floor(slobodnoM(roll)/m) : Infinity;
      if(m>0 && maxProlazaPoDuzini<1){ roll.availLen=0; continue; } // nema dužine ni za 1 prolaz
      const kapacitet = trake * (m>0 ? maxProlazaPoDuzini : 1);   // koliko komada ova rolna može
      const komada = Math.min(ostalo, kapacitet);
      const prolaza = Math.max(1, Math.ceil(komada/trake));       // koliko puta se provlači po dužini
      const utrosakM = m>0 ? prolaza*m : 0;                       // metraža skinuta sa matične
      if(m>0) roll.availLen=Math.max(0, roll.availLen - utrosakM);
      const util=trake*w/roll.sirina*100;
      const newQr=sideWaste>opts.minUsefulWaste && utrosakM>0;    // bočni ostatak nazad u magacin
      // MODEL B: pun set traka se uvek iseče. Višak traka iz poslednjeg prolaza (kada količina
      // nije deljiva brojem traka) su GOTOVE PUNE ROLNE širine w × m — vraćaju se na stanje (nova QR).
      // Ne troše dodatnu metražu: nastaju u istom prolazu.
      const surplusKom = Math.max(0, trake*prolaza - komada);
      const newRolls=[];
      if(newQr) newRolls.push({ sirina:sideWaste, metara:utrosakM, kom:1, kind:'ostatak', materijal:roll.materijal, tip:roll.tip, debljina:roll.debljina });
      if(surplusKom>0 && m>0) newRolls.push({ sirina:w, metara:m, kom:surplusKom, kind:'puna', materijal:roll.materijal, tip:roll.tip, debljina:roll.debljina });
      plans.push({
        need, roll:{...roll}, trake, komada, prolaza,
        consume:utrosakM, waste:sideWaste, util,
        leftoverWidth:sideWaste, leftoverMeters:utrosakM,
        surplusKom, surplusWidth:w, surplusMeters:m, newRolls,
        newQr, createLeftoverQr:newQr, status:'ok'
      });
      ostalo-=komada;
    }
  });
  const okPlans=plans.filter(p=>p.roll);
  const usedW=okPlans.reduce((s,p)=>s+p.trake*p.need.sirina,0);
  const totalW=okPlans.reduce((s,p)=>s+p.roll.sirina,0);
  const waste=okPlans.reduce((s,p)=>s+p.waste,0);
  const komadaPlan=okPlans.reduce((s,p)=>s+p.komada,0);
  const komadaTreba=needs.reduce((s,x)=>s+x.qty,0);
  const byRoll=okPlans.reduce((acc,p)=>{ (acc[p.roll.id]=acc[p.roll.id]||[]).push(p); return acc; },{});
  const nazadNaStanje=okPlans.reduce((s,p)=>s+(p.newRolls?p.newRolls.reduce((a,b)=>a+b.kom,0):0),0);
  const punihNazad=okPlans.reduce((s,p)=>s+(p.surplusKom||0),0);
  return {plans,warnings,summary:{count:needs.length,ok:okPlans.length,missing:plans.filter(p=>!p.roll).length,util:totalW?usedW/totalW*100:0,waste,byRoll,komadaPlan,komadaTreba,nazadNaStanje,punihNazad}};
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
    const text=ok.map(p=>{
      const extra=(p.newRolls||[]).map(nr=>nr.kind==='puna'?`${nr.kom}× puna rolna ${nr.sirina}mm×${nr.metara}m`:`ostatak ${nr.sirina}mm×${nr.metara}m`).join(', ');
      return `${p.roll.id}: ${p.trake}× ${p.need.sirina}mm (${p.komada} kom) × ${p.consume||0}m | bočni otpad ${p.waste}mm${extra?` | nazad na stanje: ${extra}`:''}`;
    }).join('\n');
    navigator.clipboard?.writeText(text);
    msg?.('Plan prihvaćen: metraža skinuta, bočni ostatak upisan i QR etikete pripremljene.');
  };
  const csv=()=>exportCsv([['Zahtev','Materijal zahteva','Rola','Materijal rolne','Sirina rolne','Traka','Komada','Metara utroseno','Bocni otpad mm','Iskoriscenost %','Lokacija','LOT','Pune rolne nazad','Bocni ostatak'],...result.plans.map(p=>[p.need.sirina,p.need.materijal,p.roll?.id||'',p.roll?.materijal||'',p.roll?.sirina||'',p.trake||'',p.komada||p.qtyLeft||'',p.consume||'',p.waste??'',p.util?.toFixed?.(1)||'',p.roll?.lokacija||'',p.roll?.lot||'',p.surplusKom?`${p.surplusKom}× ${p.surplusWidth}mm×${p.surplusMeters}m`:'',p.newQr?`${p.leftoverWidth}mm×${p.leftoverMeters}m`:''])]);
  return <div style={C.page}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:18,flexWrap:'wrap'}}>
      <div><h1 style={{margin:0,fontSize:28,fontWeight:950}}>✂️ Planer rezanja iz magacina PRO</h1><p style={{margin:'6px 0 0',color:'#64748b'}}>Pravo slitovanje: više traka po širini rolne, tačna metraža, bočni ostatak, rezervacija i QR etiketa.</p></div>
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
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12}}><Stat label="Zahteva" value={result.summary.count}/><Stat label="Komada plan/treba" value={`${result.summary.komadaPlan}/${result.summary.komadaTreba}`} tone={result.summary.komadaPlan>=result.summary.komadaTreba?'#059669':'#d97706'}/><Stat label="Nedostaje" value={result.summary.missing} tone={result.summary.missing?'#dc2626':'#059669'}/><Stat label="Iskorišćenost" value={`${result.summary.util.toFixed(1)}%`}/><Stat label="Pune rolne nazad" value={result.summary.punihNazad||0} tone={result.summary.punihNazad?'#166534':'#0f172a'}/><Stat label="Bočni otpad" value={`${result.summary.waste.toFixed(0)} mm`} tone={result.summary.waste?'#dc2626':'#059669'}/></div>
        {result.warnings.length>0&&<div style={{...C.card,borderColor:'#f59e0b',background:'#fffbeb'}}><b>⚠ Upozorenja:</b><ul style={{margin:'8px 0 0'}}>{result.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
        <div style={C.card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:12}}><h3 style={{margin:0}}>Plan po rolnama {selectedRoll&&<Badge tone="blue">filter: {selectedRoll}</Badge>}</h3>{selectedRoll&&<button onClick={()=>setSelectedRoll('')} style={{...C.btn,background:'#e2e8f0'}}>Prikaži sve</button>}</div>
          {planForRoll.map((p,i)=>{
            const wastePct=p.roll?Math.max(0,p.waste/p.roll.sirina*100):0;
            return <div key={`${p.need.id}-${i}`} style={{border:'1px solid #e2e8f0',borderRadius:16,padding:14,marginBottom:12,background:p.roll?'#fff':'#fef2f2'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:8}}>
                <div><b>Zahtev:</b> {p.need.materijal&&`${p.need.materijal} · `}{p.need.sirina} mm {p.need.metara?`× ${p.need.metara.toLocaleString('sr-RS')} m`:''} {p.roll&&<Badge tone="blue">{p.trake}× traka · {p.komada} kom</Badge>}</div>
                {p.roll?<div><b>{p.roll.id}</b> · <span style={{color:p.waste===0?'#059669':(p.newQr?'#166534':'#dc2626'),fontWeight:950}}>{p.newQr?'ostatak':'otpad'} {p.waste} mm</span></div>:<Badge tone="red">Nema rolne{p.qtyLeft?` (fali ${p.qtyLeft})`:''}</Badge>}
              </div>
              {p.roll&&<>
                <div style={{height:56,border:'1px solid #cbd5e1',borderRadius:14,display:'flex',overflow:'hidden',background:'#fff'}}>
                  {Array.from({length:p.trake}).map((_,li)=><div key={li} style={{width:`${p.need.sirina/p.roll.sirina*100}%`,background:'#dbeafe',borderRight:'1px solid #fff',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontWeight:950,fontSize:12,color:'#1e40af'}}><span>{p.need.sirina} mm</span><small style={{color:'#475569'}}>traka {li+1}</small></div>)}
                  {p.waste>0&&<div style={{width:`${wastePct}%`,minWidth:70,flex:'0 0 auto',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontWeight:950,fontSize:11,lineHeight:1.15,
                    color:p.newQr?'#166534':'#991b1b',
                    backgroundImage:p.newQr?'repeating-linear-gradient(45deg,#dcfce7 0 8px,#bbf7d0 8px 16px)':'repeating-linear-gradient(45deg,#fee2e2 0 8px,#fecaca 8px 16px)'}}><span>{p.newQr?'OSTATAK':'OTPAD'}</span><span>{p.waste} mm</span></div>}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8,marginTop:10,fontSize:12}}><div><b>Materijal</b><br/>{p.roll.materijal}</div><div><b>Rolna</b><br/>{p.roll.sirina} mm</div><div><b>Traka × prolaza</b><br/>{p.trake} × {p.prolaza}</div><div><b>Utrošeno</b><br/>{(p.consume||0).toLocaleString('sr-RS')} m</div><div><b>Lokacija</b><br/>{p.roll.lokacija}</div><div><b>LOT</b><br/>{p.roll.lot}</div></div>
                {p.newRolls&&p.newRolls.length>0&&<div style={{marginTop:10,display:'grid',gap:8}}>
                  {p.newRolls.map((nr,ni)=><div key={ni} style={{display:'flex',alignItems:'center',gap:10,background:nr.kind==='puna'?'#eff6ff':'#ecfdf5',border:`1px solid ${nr.kind==='puna'?'#bfdbfe':'#bbf7d0'}`,borderRadius:14,padding:10}}>
                    <QrBox text={`${p.roll.id}-${nr.kind}-${nr.sirina}`}/>
                    <div><b style={{color:nr.kind==='puna'?'#1e40af':'#166534'}}>{nr.kind==='puna'?`Nova QR — ${nr.kom}× puna rolna ${nr.sirina} mm`:`Nova QR — bočni ostatak ${nr.sirina} mm`}</b>
                      <div style={{fontSize:12,color:nr.kind==='puna'?'#1e40af':'#166534'}}>{nr.kind==='puna'?`Višak traka iz poslednjeg prolaza: ${nr.kom} × (${nr.sirina} mm × ${(nr.metara||0).toLocaleString('sr-RS')} m) — gotove pune rolne nazad na stanje.`:`Bočni ostatak ${nr.sirina} mm × ${(nr.metara||0).toLocaleString('sr-RS')} m — nazad u magacin kao ostatak-rolna.`}</div></div>
                  </div>)}
                </div>}
              </>}
            </div>;
          })}
        </div>
        <div style={C.card}><h3 style={{marginTop:0}}>Tabela za nalog rezanja</h3><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['Zahtev','Rola','Materijal','Širina rolne','Traka','Komada','Utrošeno m','Otpad','QR ostatak','Lokacija'].map(h=><th key={h} style={C.th}>{h}</th>)}</tr></thead><tbody>{result.plans.map((p,i)=><tr key={i}><td style={C.td}><b>{p.need.sirina} mm</b></td><td style={C.td}>{p.roll?.id||'—'}</td><td style={C.td}>{p.roll?.materijal||'—'}</td><td style={C.td}>{p.roll?`${p.roll.sirina} mm`:'—'}</td><td style={C.td}>{p.trake||'—'}</td><td style={C.td}>{p.komada||(p.qtyLeft?`fali ${p.qtyLeft}`:'—')}</td><td style={C.td}>{(p.consume||0).toLocaleString('sr-RS')}</td><td style={{...C.td,color:p.waste===0?'#059669':(p.newQr?'#166534':'#dc2626'),fontWeight:950}}>{p.waste==null?'—':`${p.waste} mm`}</td><td style={C.td}>{(p.createLeftoverQr||p.newQr)?<Badge tone="green">DA</Badge>:<Badge>NE</Badge>}</td><td style={C.td}>{p.roll?.lokacija||'—'}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  </div>;
}
