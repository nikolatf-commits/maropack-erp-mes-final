import React, { useMemo, useState } from 'react';

const C = {
  page:{padding:22,background:'#f8fafc',minHeight:'100%',color:'#0f172a'},
  card:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:18,padding:16,boxShadow:'0 10px 28px rgba(15,23,42,.06)'},
  btn:{border:0,borderRadius:12,padding:'10px 14px',fontWeight:900,cursor:'pointer'},
  input:{width:'100%',border:'1px solid #cbd5e1',borderRadius:12,padding:12,fontWeight:800,boxSizing:'border-box',outline:'none'},
  th:{textAlign:'left',padding:10,fontSize:12,color:'#475569',background:'#f1f5f9'},
  td:{padding:10,borderBottom:'1px solid #e2e8f0',fontSize:13}
};
const colors=['#dbeafe','#dcfce7','#fef3c7','#ede9fe','#cffafe','#ffe4e6','#e0e7ff','#f0fdf4'];

function n(v,d=0){ const x=Number(String(v??'').replace(',','.')); return Number.isFinite(x)?x:d; }
function splitLines(text){ return String(text||'').split(/[\n;]+/).map(x=>x.trim()).filter(Boolean); }
function parseParentWidths(text){
  return splitLines(text).flatMap(line=>String(line).split(',')).map(x=>n(x)).filter(x=>x>0).sort((a,b)=>a-b);
}
function parseNeeds(text){
  return splitLines(text).map((line,i)=>{
    const nums=(line.match(/\d+(?:[.,]\d+)?/g)||[]).map(x=>n(x));
    const name=line.replace(/\d+(?:[.,]\d+)?/g,'').replace(/[x×*]/g,'').trim() || `Pozicija ${i+1}`;
    if(!nums[0]) return null;
    return { id:`P${i+1}`, name, width:nums[0], qty:Math.max(1,Math.round(nums[1]||1)), meters:nums[2]||0, raw:line };
  }).filter(Boolean);
}
function itemPool(needs){
  const out=[];
  needs.forEach(row=>{ for(let i=0;i<row.qty;i++) out.push({ ...row, uid:`${row.id}-${i+1}` }); });
  return out.sort((a,b)=>b.width-a.width);
}
// Grupiše iste širine (može BILO KOLIKO istih traka) u red čekanja — pakuje se po BROJU komada,
// pa je brzo i za velike količine (npr. 210 × 300) i nalazi bolja pakovanja.
function groupWidths(pool){
  const m=new Map();
  pool.forEach(it=>{ if(!m.has(it.width)) m.set(it.width,{width:it.width,queue:[]}); m.get(it.width).queue.push(it); });
  return [...m.values()].sort((a,b)=>b.width-a.width);
}
// Maksimalni šabloni za JEDNU matičnu širinu P: koliko kojih širina staje.
// Kerf (nož/zazor) se broji IZMEĐU traka → (n-1)×kerf ukupno.
function maxPatterns(P, kerf, groups, avail, cap=3000){
  const res=[]; const k=groups.length;
  const walk=(idx, counts, used, cnt)=>{
    if(res.length>cap) return;
    if(idx===k){
      let canAdd=false;
      for(let i=0;i<k;i++){ if(counts[i]<avail[i] && used+groups[i].width+(cnt>0?kerf:0)<=P){ canAdd=true; break; } }
      if(!canAdd && cnt>0) res.push({counts:counts.slice(), used, waste:P-used, util:used/P*100, parent:P, strips:cnt});
      return;
    }
    const w=groups[idx].width;
    let mx=0;
    while(mx+1<=avail[idx]){ const nn=mx+1; const u=used+nn*w+(cnt>0?nn:nn-1)*kerf; if(u<=P) mx=nn; else break; }
    for(let c=mx;c>=0;c--){ const u=c*w+(cnt>0?c:Math.max(0,c-1))*kerf; walk(idx+1,[...counts,c],used+u,cnt+c); }
  };
  walk(0,[],0,0);
  return res;
}
// Skoreri — više strategija; najbolji ukupan rezultat pobeđuje (ne lokalno po roli).
const SCORERS={
  minWaste:c=>(c.waste===0?1e12:0)-c.waste*1000+c.strips*30+c.util,
  maxItems:c=>(c.waste===0?1e12:0)+c.strips*10000-c.waste+c.util,
  maxFill :c=>(c.waste===0?1e12:0)+c.util*1000+c.strips
};
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
// Napravi kompletan plan (samo brojevi po širini) jednom strategijom. rng => randomizovani izbor iz top-6.
function buildCounts(groups, demand, parents, kerf, scorer, rng, zeroSink){
  const av=demand.slice(); const plans=[]; let guard=0;
  const total=av.reduce((a,b)=>a+b,0); let placed=0;
  while(placed<total && guard++<100000){
    const cands=[];
    for(const P of parents){ const pats=maxPatterns(P,kerf,groups,av,3000); for(const pat of pats){ cands.push(pat); if(zeroSink && pat.waste===0) zeroSink.push(pat); } }
    if(!cands.length) break;
    let pick;
    if(rng){ cands.forEach(c=>c._s=scorer(c)); cands.sort((a,b)=>b._s-a._s); const K=Math.min(cands.length,6); pick=cands[Math.floor(rng()*rng()*K)]; }
    else { let best=null; for(const c of cands){ const sc=scorer(c); if(!best||sc>best._s){ best=c; best._s=sc; } } pick=best; }
    // Uvek dodeli NAJMANJU matičnu širinu koja i dalje prima traku (minimizuje otpad/ukupnu širinu).
    const need=pick.used; const fitP=parents.filter(p=>p>=need).sort((a,b)=>a-b)[0]||pick.parent;
    plans.push({counts:pick.counts.slice(), parent:fitP, used:pick.used, waste:fitP-pick.used, util:pick.used/fitP*100, strips:pick.strips});
    pick.counts.forEach((c,i)=>av[i]-=c); placed+=pick.strips;
  }
  return {plans, leftover:av.reduce((a,b)=>a+Math.max(0,b),0)};
}
// Pošto se svaka tražena traka seče tačno jednom, ukupna iskorišćena širina je KONSTANTNA,
// pa je cilj: minimalna ukupna širina otvorenih matičnih rolni = maksimalna iskorišćenost.
// Više strategija + randomizovani multi-start; bira se najbolji UKUPAN rezultat.
function optimize(parentWidths, needs, settings){
  const parents=[...new Set(parentWidths.filter(x=>x>0))].sort((a,b)=>a-b);
  const kerf=n(settings.kerf);
  const pool=itemPool(needs);
  const groups=groupWidths(pool);
  const demand=groups.map(g=>g.queue.length);
  if(!parents.length || !groups.length)
    return {plans:[],remaining:pool,summary:{usedMm:0,totalMm:0,wasteMm:0,util:0,zeroCount:0,byParent:{},idealWidths:[]}};

  const zeroSink=[]; let best=null;
  const consider=(res)=>{
    const key=[res.leftover, res.plans.reduce((s,p)=>s+p.parent,0), res.plans.length];
    if(!best || key[0]<best.key[0] || (key[0]===best.key[0] && (key[1]<best.key[1] || (key[1]===best.key[1] && key[2]<best.key[2]))))
      best={...res,key};
  };
  // 1) determinističke strategije (skupljaju i idealne kombinacije)
  for(const sc of Object.values(SCORERS)) consider(buildCounts(groups,demand,parents,kerf,sc,null,zeroSink));
  // 2) randomizovani multi-start (seed fiksiran → stabilan rezultat, bez treperenja)
  const rng=mulberry32(987654321);
  const restarts=settings.exactMode?140:60;
  const scArr=Object.values(SCORERS);
  for(let r=0;r<restarts;r++) consider(buildCounts(groups,demand,parents,kerf,scArr[r%scArr.length],rng,null));

  // Materijalizuj izabrani plan → vrati stvarne pozicije (naziv/metar) iz reda čekanja.
  const queues=groups.map(g=>g.queue.slice());
  const plans=best.plans.map((p,idx)=>{
    const chosen=[];
    p.counts.forEach((c,i)=>{ for(let j=0;j<c;j++){ if(queues[i].length) chosen.push(queues[i].shift()); } });
    return {parent:p.parent, chosen, used:p.used, waste:p.waste, util:p.util, rollNo:idx+1};
  });
  const remaining=[].concat(...queues);
  const usedMm=plans.reduce((s,p)=>s+p.used,0);
  const totalMm=plans.reduce((s,p)=>s+p.parent,0);
  const wasteMm=totalMm-usedMm;
  const zeroCount=plans.filter(p=>p.waste===0).length;
  const byParent={}; plans.forEach(p=>{ byParent[p.parent]=(byParent[p.parent]||0)+1; });
  const seen=new Set(); const idealWidths=[];
  zeroSink.forEach(c=>{ const label=`${c.parent} = ${c.counts.map((x,i)=>x?`${x>1?x+'× ':''}${groups[i].width}`:'').filter(Boolean).join(' + ')}`; if(!seen.has(label)){ seen.add(label); idealWidths.push(label); } });
  return {plans,remaining,summary:{usedMm,totalMm,wasteMm,util:totalMm?usedMm/totalMm*100:0,zeroCount,byParent,idealWidths:idealWidths.slice(0,20)}};
}
// Grupiše iste širine u jednu ćeliju: [840,210,210,210,210] → [{840×1},{210×4}]
function segmenti(chosen){
  const segs=[];
  chosen.forEach(x=>{ const last=segs[segs.length-1]; if(last && last.width===x.width){ last.count++; } else segs.push({width:x.width,count:1,name:x.name}); });
  return segs;
}
function exportCsv(name, rows){
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function Stat({label,value,sub,tone}){return <div style={C.card}><div style={{fontSize:12,color:'#64748b',fontWeight:900,textTransform:'uppercase'}}>{label}</div><div style={{fontSize:25,fontWeight:950,color:tone||'#0f172a',marginTop:4}}>{value}</div>{sub&&<div style={{fontSize:12,color:'#94a3b8',marginTop:3}}>{sub}</div>}</div>}
function Chip({children,tone='slate'}){const map={green:['#dcfce7','#166534'],red:['#fee2e2','#991b1b'],amber:['#fef3c7','#92400e'],blue:['#dbeafe','#1e40af'],slate:['#f1f5f9','#334155']}; const [bg,fg]=map[tone]||map.slate; return <span style={{display:'inline-block',background:bg,color:fg,borderRadius:999,padding:'4px 8px',fontSize:12,fontWeight:900}}>{children}</span>}

export default function KalkulatorMaticnihRolni({ msg }){
  const [parents,setParents]=useState('980\n1190\n1285\n1570\n2050');
  const [needs,setNeeds]=useState('840 x 2 x 12000\n420 x 3 x 8000\n210 x 4 x 4000\n85 x 8 x 22000');
  const [kerf,setKerf]=useState(0);
  const [minUtil,setMinUtil]=useState(85);
  const [exactMode,setExactMode]=useState(true);
  const [showTable,setShowTable]=useState(false);
  const parentRows=useMemo(()=>parseParentWidths(parents),[parents]);
  const needRows=useMemo(()=>parseNeeds(needs),[needs]);
  const result=useMemo(()=>optimize(parentRows,needRows,{kerf:n(kerf),minUtil:n(minUtil),exactMode}),[parentRows,needRows,kerf,minUtil,exactMode]);
  const underUtil=result.plans.filter(p=>p.util<n(minUtil));
  const copy=()=>{navigator.clipboard?.writeText(result.plans.map(p=>`Rola ${p.rollNo}: ${p.parent} mm = ${segmenti(p.chosen).map(s=>`${s.count>1?s.count+'× ':''}${s.width}mm`).join(' + ')} | otpad ${p.waste.toFixed(1)} mm | ${p.util.toFixed(1)}%`).join('\n')); msg?.('Plan kopiran');};
  const csv=()=>exportCsv('kalkulator_maticnih_plan.csv', [['Rola','Maticna mm','Kombinacija','Broj traka','Iskoriscenost %','Otpad mm','Metraza pozicija'],...result.plans.map(p=>[p.rollNo,p.parent,segmenti(p.chosen).map(s=>`${s.count>1?s.count+'x ':''}${s.width}mm ${s.name}`).join(' + '),p.chosen.length,p.util.toFixed(1),p.waste.toFixed(1),p.chosen.map(x=>x.meters||'').join(' / ')])]);
  return <div style={C.page}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:18,flexWrap:'wrap'}}>
      <div><h1 style={{margin:0,fontSize:28,fontWeight:950}}>📊 Kalkulator matičnih rolni PRO</h1><p style={{margin:'6px 0 0',color:'#64748b'}}>Optimizacija širina za poručivanje/matične rolne: maksimalna iskorišćenost, nulti otpad, kombinacije, idealne širine i CSV izvoz.</p></div>
      <div style={{display:'flex',gap:8}}><button onClick={copy} style={{...C.btn,background:'#0f172a',color:'#fff'}}>Kopiraj plan</button><button onClick={csv} style={{...C.btn,background:'#2563eb',color:'#fff'}}>CSV izvoz</button></div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'360px 1fr',gap:16}}>
      <div style={{display:'grid',gap:16,alignContent:'start'}}>
        <div style={C.card}><h3 style={{margin:'0 0 10px'}}>1. Dostupne matične širine</h3><textarea value={parents} onChange={e=>setParents(e.target.value)} style={{...C.input,minHeight:120,fontFamily:'ui-monospace,Consolas'}}/><div style={{marginTop:8,color:'#64748b',fontSize:12}}>Unos: jedna širina po redu ili odvojeno zarezom.</div></div>
        <div style={C.card}><h3 style={{margin:'0 0 10px'}}>2. Potrebne pozicije</h3><textarea value={needs} onChange={e=>setNeeds(e.target.value)} style={{...C.input,minHeight:165,fontFamily:'ui-monospace,Consolas'}}/><div style={{marginTop:8,color:'#64748b',fontSize:12}}>Format: <b>širina x količina x metara</b>. Primer: 840 x 2 x 12000.</div></div>
        <div style={C.card}><h3 style={{margin:'0 0 10px'}}>3. Parametri algoritma</h3><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><label><small>Nož/zazor mm</small><input type="number" value={kerf} onChange={e=>setKerf(e.target.value)} style={C.input}/></label><label><small>Min. iskorišćenost %</small><input type="number" value={minUtil} onChange={e=>setMinUtil(e.target.value)} style={C.input}/></label></div><label style={{display:'flex',alignItems:'center',gap:8,marginTop:12,fontWeight:900}}><input type="checkbox" checked={exactMode} onChange={e=>setExactMode(e.target.checked)}/> Prioritet nulti otpad / detaljna pretraga</label></div>
        <div style={C.card}><h3 style={{margin:'0 0 10px'}}>Kontrola unosa</h3><div style={{display:'grid',gap:8}}>{needRows.map(r=><div key={r.id} style={{display:'flex',justifyContent:'space-between',border:'1px solid #e2e8f0',borderRadius:12,padding:9}}><b>{r.width} mm × {r.qty}</b><span style={{color:'#64748b'}}>{r.meters?`${r.meters.toLocaleString('sr-RS')} m`:''}</span></div>)}</div></div>
      </div>
      <div style={{display:'grid',gap:16}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12}}><Stat label="Planova" value={result.plans.length}/><Stat label="Iskorišćenost" value={`${result.summary.util.toFixed(1)}%`} tone={result.summary.util>=n(minUtil)?'#059669':'#d97706'}/><Stat label="Ukupan otpad" value={`${result.summary.wasteMm.toFixed(0)} mm`} tone={result.summary.wasteMm===0?'#059669':'#dc2626'}/><Stat label="Nulti otpad" value={`${result.summary.zeroCount}/${result.plans.length||0}`}/><Stat label="Neraspoređeno" value={result.remaining.length} tone={result.remaining.length?'#dc2626':'#059669'}/></div>
        {(underUtil.length>0 || result.remaining.length>0) && <div style={{...C.card,borderColor:'#f59e0b',background:'#fffbeb'}}><b>⚠ Kontrola plana:</b> {underUtil.length>0&&` ${underUtil.length} planova je ispod ${minUtil}% iskorišćenosti.`} {result.remaining.length>0&&` ${result.remaining.length} pozicija nije moguće rasporediti na zadate matične širine.`}</div>}
        <div style={C.card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><h3 style={{margin:0}}>Grafički plan po matičnoj roli</h3><button onClick={()=>setShowTable(!showTable)} style={{...C.btn,background:'#e2e8f0'}}>Prikaži {showTable?'grafiku':'tabelu'}</button></div>
          {!showTable ? result.plans.map(p=>{
            const segs=segmenti(p.chosen);
            const wastePct=Math.max(0, p.waste/p.parent*100);
            return <div key={p.rollNo} style={{marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap',alignItems:'baseline',marginBottom:6}}>
                <span style={{fontWeight:950,fontSize:15}}>Rola {p.rollNo} <span style={{color:'#64748b',fontWeight:800}}>· {p.parent} mm · {p.chosen.length} traka</span></span>
                <span style={{fontWeight:900}}><span style={{color:p.util>=n(minUtil)?'#059669':'#d97706'}}>{p.util.toFixed(1)}%</span> · <b style={{color:p.waste===0?'#059669':'#dc2626'}}>otpad {p.waste.toFixed(1)} mm</b></span>
              </div>
              <div style={{height:56,border:'1px solid #cbd5e1',borderRadius:14,overflow:'hidden',display:'flex',background:'#fff'}}>
                {segs.map((s,j)=>{
                  const bg=colors[j%colors.length];
                  const pct=(s.width*s.count)/p.parent*100;
                  return <div key={j} title={s.name} style={{width:`${pct}%`,background:bg,borderRight:'1px solid #fff',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                    backgroundImage:s.count>1?`repeating-linear-gradient(90deg,rgba(15,23,42,.10) 0 1px,transparent 1px ${100/s.count}%)`:'none'}}>
                    <span style={{fontWeight:950,fontSize:13}}>{s.count>1?`${s.count}× `:''}{s.width} mm</span>
                    <small style={{color:'#334155',maxWidth:'92%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</small>
                  </div>;
                })}
                {p.waste>0 && <div style={{width:`${wastePct}%`,minWidth:56,flex:'0 0 auto',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontWeight:950,color:'#991b1b',fontSize:11,lineHeight:1.15,
                  backgroundImage:'repeating-linear-gradient(45deg,#fee2e2 0 8px,#fecaca 8px 16px)'}}><span>OTPAD</span><span>{p.waste.toFixed(0)} mm</span></div>}
              </div>
            </div>;
          }) : <table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['#','Matična','Kombinacija','Traka','Iskorišćenost','Otpad'].map(h=><th key={h} style={C.th}>{h}</th>)}</tr></thead><tbody>{result.plans.map(p=><tr key={p.rollNo}><td style={C.td}><b>{p.rollNo}</b></td><td style={C.td}>{p.parent} mm</td><td style={C.td}>{segmenti(p.chosen).map(s=>`${s.count>1?s.count+'× ':''}${s.width}mm`).join(' + ')}</td><td style={C.td}>{p.chosen.length}</td><td style={C.td}>{p.util.toFixed(1)}%</td><td style={{...C.td,fontWeight:950,color:p.waste===0?'#059669':'#dc2626'}}>{p.waste.toFixed(1)} mm</td></tr>)}</tbody></table>}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}><div style={C.card}><h3 style={{marginTop:0}}>Idealne kombinacije bez otpada</h3>{result.summary.idealWidths.length?result.summary.idealWidths.map((x,i)=><div key={i} style={{marginBottom:8}}><Chip tone="green">{x}</Chip></div>):<p style={{color:'#64748b'}}>Nema nulte kombinacije za trenutni unos.</p>}</div><div style={C.card}><h3 style={{marginTop:0}}>Potreba matičnih rolni</h3>{Object.entries(result.summary.byParent).map(([w,c])=><div key={w} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #e2e8f0'}}><b>{w} mm</b><span>{c} kom</span></div>)}</div></div>
      </div>
    </div>
  </div>;
}
