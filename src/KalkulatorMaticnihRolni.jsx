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
function itemPool(needs, kerf){
  const out=[];
  needs.forEach(row=>{ for(let i=0;i<row.qty;i++) out.push({...row, uid:`${row.id}-${i+1}`, effectiveWidth:row.width+n(kerf)}); });
  return out.sort((a,b)=>b.effectiveWidth-a.effectiveWidth);
}
function combinations(items, parent, limit=9000){
  const res=[];
  const walk=(start, chosen, sum)=>{
    if(res.length>limit) return;
    if(chosen.length) res.push({chosen:[...chosen], used:sum, waste:parent-sum, util:sum/parent*100});
    for(let i=start;i<items.length;i++){
      const w=items[i].effectiveWidth;
      if(sum+w<=parent) walk(i+1,[...chosen,items[i]],sum+w);
    }
  };
  walk(0,[],0);
  return res.sort((a,b)=>a.waste-b.waste || b.chosen.length-a.chosen.length || b.used-a.used);
}
function optimize(parentWidths, needs, settings){
  const parents=parentWidths.filter(x=>x>0).sort((a,b)=>a-b);
  let remaining=itemPool(needs, settings.kerf);
  const plans=[]; const allCombos=[];
  let guard=0;
  while(remaining.length && guard++<500){
    let best=null;
    for(const p of parents){
      const combos=combinations(remaining,p,settings.exactMode?12000:3500);
      if(combos[0]) allCombos.push({parent:p,...combos[0]});
      for(const c of combos.slice(0,settings.exactMode?200:60)){
        const zeroBonus=c.waste===0?100000:0;
        const multiBonus=c.chosen.length*8;
        const utilPenalty=(100-c.util)*3;
        const wastePenalty=c.waste*1.2;
        const score=zeroBonus + c.used + multiBonus - utilPenalty - wastePenalty;
        if(!best || score>best.score) best={parent:p,...c,score};
      }
    }
    if(!best) break;
    plans.push({...best, rollNo:plans.length+1});
    const used=new Set(best.chosen.map(x=>x.uid));
    remaining=remaining.filter(x=>!used.has(x.uid));
  }
  const usedMm=plans.reduce((s,p)=>s+p.used,0);
  const totalMm=plans.reduce((s,p)=>s+p.parent,0);
  const wasteMm=totalMm-usedMm;
  const zeroCount=plans.filter(p=>p.waste===0).length;
  const byParent={};
  plans.forEach(p=>{ byParent[p.parent]=(byParent[p.parent]||0)+1; });
  const idealWidths=[...new Set(allCombos.filter(c=>c.waste===0).map(c=>`${c.parent} = ${c.chosen.map(x=>x.width).join(' + ')}`))].slice(0,20);
  return {plans,remaining,summary:{usedMm,totalMm,wasteMm,util:totalMm?usedMm/totalMm*100:0,zeroCount,byParent,idealWidths}};
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
  const copy=()=>{navigator.clipboard?.writeText(result.plans.map(p=>`Rola ${p.rollNo}: ${p.parent} mm = ${p.chosen.map(x=>`${x.width}mm`).join(' + ')} | otpad ${p.waste.toFixed(1)} mm | ${p.util.toFixed(1)}%`).join('\n')); msg?.('Plan kopiran');};
  const csv=()=>exportCsv('kalkulator_maticnih_plan.csv', [['Rola','Maticna mm','Kombinacija','Iskoriscenost %','Otpad mm','Metraza pozicija'],...result.plans.map(p=>[p.rollNo,p.parent,p.chosen.map(x=>`${x.width}mm ${x.name}`).join(' + '),p.util.toFixed(1),p.waste.toFixed(1),p.chosen.map(x=>x.meters||'').join(' / ')])]);
  return <div style={C.page}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:18,flexWrap:'wrap'}}>
      <div><h1 style={{margin:0,fontSize:28,fontWeight:950}}>📊 Kalkulator matičnih rolni PRO</h1><p style={{margin:'6px 0 0',color:'#64748b'}}>Optimizacija širina za poručivanje/matične rolne: nulti otpad, kombinacije, iskorišćenost, idealne širine i CSV izvoz.</p></div>
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
        <div style={C.card}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><h3 style={{margin:0}}>Grafički plan po matičnoj roli</h3><button onClick={()=>setShowTable(!showTable)} style={{...C.btn,background:'#e2e8f0'}}>Prikaži {showTable?'grafiku':'tabelu'}</button></div>{!showTable?result.plans.map(p=><div key={p.rollNo} style={{marginBottom:18}}><div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap',fontWeight:950,marginBottom:7}}><span>Rola {p.rollNo}: {p.parent} mm</span><span>{p.util.toFixed(1)}% · <b style={{color:p.waste===0?'#059669':'#dc2626'}}>otpad {p.waste.toFixed(1)} mm</b></span></div><div style={{height:54,border:'1px solid #cbd5e1',borderRadius:14,overflow:'hidden',display:'flex',background:'#fee2e2'}}>{p.chosen.map((x,j)=><div title={x.name} key={x.uid} style={{width:`${x.effectiveWidth/p.parent*100}%`,background:colors[j%colors.length],borderRight:'1px solid #fff',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontWeight:950,fontSize:12}}><span>{x.width} mm</span><small>{x.name}</small></div>)}{p.waste>0&&<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:950,color:'#991b1b',fontSize:12}}>OTPAD {p.waste.toFixed(1)}</div>}</div></div>):<table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['#','Matična','Kombinacija','Iskorišćenost','Otpad'].map(h=><th key={h} style={C.th}>{h}</th>)}</tr></thead><tbody>{result.plans.map(p=><tr key={p.rollNo}><td style={C.td}><b>{p.rollNo}</b></td><td style={C.td}>{p.parent} mm</td><td style={C.td}>{p.chosen.map(x=>`${x.width}mm`).join(' + ')}</td><td style={C.td}>{p.util.toFixed(1)}%</td><td style={{...C.td,fontWeight:950,color:p.waste===0?'#059669':'#dc2626'}}>{p.waste.toFixed(1)} mm</td></tr>)}</tbody></table>}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}><div style={C.card}><h3 style={{marginTop:0}}>Idealne kombinacije bez otpada</h3>{result.summary.idealWidths.length?result.summary.idealWidths.map((x,i)=><div key={i} style={{marginBottom:8}}><Chip tone="green">{x}</Chip></div>):<p style={{color:'#64748b'}}>Nema nulte kombinacije za trenutni unos.</p>}</div><div style={C.card}><h3 style={{marginTop:0}}>Potreba matičnih rolni</h3>{Object.entries(result.summary.byParent).map(([w,c])=><div key={w} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #e2e8f0'}}><b>{w} mm</b><span>{c} kom</span></div>)}</div></div>
      </div>
    </div>
  </div>;
}
