import React, { useMemo, useState } from 'react';
import { DEFAULT_WORKERS, STOP_REASONS, QC_CHECKS, createMesEvent, calculateWorkerKpi, calculateMachineKpi } from '../services/mesTrackingCore.js';

const demoMachines = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `REZ-${String(i + 1).padStart(2, '0')}`, naziv: `Rezač ${i + 1}`, tip: 'Rezanje', status: i < 6 ? 'Radi' : 'Slobodna' })),
  ...Array.from({ length: 15 }, (_, i) => ({ id: `KES-${String(i + 1).padStart(2, '0')}`, naziv: `Mašina za kese ${i + 1}`, tip: 'Kese', status: i < 9 ? 'Radi' : 'Slobodna' })),
  ...Array.from({ length: 2 }, (_, i) => ({ id: `SPU-${String(i + 1).padStart(2, '0')}`, naziv: `Mašina za špulne ${i + 1}`, tip: 'Špulne', status: 'Slobodna' })),
  { id: 'KAS-01', naziv: 'Kaširka 1', tip: 'Kaširanje', status: 'Radi' }
];

const demoOrders = [
  { id: 'RN-2401', kupac: 'Kupac A', proizvod: 'Doypack 100g', status: 'U rezanju', plan_m: 18000 },
  { id: 'RN-2402', kupac: 'Kupac B', proizvod: 'Folija Triplex', status: 'U kaširanju', plan_m: 24000 },
  { id: 'RN-2403', kupac: 'Kupac C', proizvod: 'Špulne 20mm', status: 'U proizvodnji', plan_m: 12000 }
];

const seedEvents = [
  createMesEvent({ type: 'start', nalogId: 'RN-2401', machineId: 'REZ-01', workerId: 'RAD-001', payload: { metara: 0 } }),
  createMesEvent({ type: 'production', nalogId: 'RN-2401', machineId: 'REZ-01', workerId: 'RAD-001', payload: { metara: 4200, skart: 80 } }),
  createMesEvent({ type: 'stop', nalogId: 'RN-2401', machineId: 'REZ-01', workerId: 'RAD-001', payload: { zastoj_min: 18, razlog: 'Promena noževa' } }),
  createMesEvent({ type: 'production', nalogId: 'RN-2402', machineId: 'KAS-01', workerId: 'RAD-003', payload: { metara: 6100, skart: 140 } }),
  createMesEvent({ type: 'qc_pass', nalogId: 'RN-2402', machineId: 'KAS-01', workerId: 'RAD-005', payload: { kontrola: 'spoj', rezultat: 'OK' } })
];

function Card({ children, style = {} }) {
  return <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 16, boxShadow: '0 8px 24px rgba(15,23,42,.06)', ...style }}>{children}</div>;
}
function Badge({ children, color = '#334155' }) {
  return <span style={{ display:'inline-flex', alignItems:'center', borderRadius:999, padding:'4px 9px', background:`${color}15`, color, fontWeight:800, fontSize:12 }}>{children}</span>;
}
function Button({ children, onClick, variant='dark' }) {
  const bg = variant === 'green' ? '#059669' : variant === 'red' ? '#dc2626' : variant === 'amber' ? '#d97706' : variant === 'blue' ? '#2563eb' : '#0f172a';
  return <button onClick={onClick} style={{ border:0, borderRadius:12, padding:'10px 13px', background:bg, color:'#fff', fontWeight:900, cursor:'pointer' }}>{children}</button>;
}

export default function MESTrackingQualityPRO({ db, msg }) {
  const [tab, setTab] = useState('live');
  const [events, setEvents] = useState(seedEvents);
  const [workerId, setWorkerId] = useState('RAD-001');
  const [machineId, setMachineId] = useState('REZ-01');
  const [orderId, setOrderId] = useState('RN-2401');
  const [metara, setMetara] = useState('1000');
  const [skart, setSkart] = useState('20');
  const [stopReason, setStopReason] = useState(STOP_REASONS[0]);

  const machines = db?.masine?.length ? db.masine : demoMachines;
  const orders = db?.nalozi?.length ? db.nalozi.map(n => ({ id:n.id || n.broj || n.rb || 'RN', kupac:n.kupac, proizvod:n.naziv || n.proizvod, status:n.status, plan_m:n.metara || n.plan_m || 0 })) : demoOrders;
  const workerKpi = useMemo(() => calculateWorkerKpi(events), [events]);
  const machineKpi = useMemo(() => calculateMachineKpi(events), [events]);
  const totalM = events.reduce((s,e)=>s+Number(e.payload?.metara||0),0);
  const totalSkart = events.reduce((s,e)=>s+Number(e.payload?.skart||0),0);
  const totalStop = events.reduce((s,e)=>s+Number(e.payload?.zastoj_min||0),0);

  function addEvent(type) {
    const payload = type === 'production'
      ? { metara: Number(metara || 0), skart: Number(skart || 0) }
      : type === 'stop'
        ? { zastoj_min: 15, razlog: stopReason }
        : type === 'qc_fail'
          ? { kontrola: 'sirina', rezultat: 'NOK', napomena: 'Potrebna korekcija' }
          : { kontrola: 'opšta', rezultat: 'OK' };
    const ev = createMesEvent({ type, nalogId: orderId, machineId, workerId, payload });
    setEvents(prev => [ev, ...prev]);
    msg?.(`MES događaj dodat: ${type}`);
  }

  const tabs = [
    ['live','Live MES'], ['workers','Radnici / učinak'], ['qc','Kontrola kvaliteta'], ['trace','Traceability'], ['warehouse','Magacin PRO']
  ];

  return <div style={{ padding: 20, background:'#f1f5f9', minHeight:'100vh', color:'#0f172a' }}>
    <div style={{ maxWidth: 1380, margin:'0 auto' }}>
      <div style={{ background:'linear-gradient(135deg,#0f172a,#1e3a8a)', color:'#fff', borderRadius:24, padding:24, marginBottom:16 }}>
        <div style={{ fontSize:13, opacity:.8, fontWeight:900, letterSpacing:1 }}>MAROPACK FAZA 2</div>
        <h1 style={{ margin:'6px 0 6px', fontSize:32 }}>MES tracking, radnici, QC i profesionalni magacin</h1>
        <p style={{ margin:0, opacity:.85 }}>Radnik skenira sebe, mašinu, nalog i rolnu. Sistem meri učinak, škart, zastoje, QC i traceability.</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
        <Card><div style={{color:'#64748b', fontWeight:800}}>Proizvedeno danas</div><div style={{fontSize:28,fontWeight:950}}>{totalM.toLocaleString('sr-RS')} m</div></Card>
        <Card><div style={{color:'#64748b', fontWeight:800}}>Škart</div><div style={{fontSize:28,fontWeight:950}}>{totalSkart.toLocaleString('sr-RS')} m</div></Card>
        <Card><div style={{color:'#64748b', fontWeight:800}}>Zastoji</div><div style={{fontSize:28,fontWeight:950}}>{totalStop} min</div></Card>
        <Card><div style={{color:'#64748b', fontWeight:800}}>Aktivne mašine</div><div style={{fontSize:28,fontWeight:950}}>{machines.filter(m=>m.status==='Radi').length}/{machines.length}</div></Card>
      </div>

      <Card style={{ marginBottom:16, padding:8, display:'flex', gap:8 }}>
        {tabs.map(([k,l]) => <button key={k} onClick={()=>setTab(k)} style={{ border:0, borderRadius:12, padding:'11px 14px', background:tab===k?'#0f172a':'#f1f5f9', color:tab===k?'#fff':'#334155', fontWeight:900, cursor:'pointer' }}>{l}</button>)}
      </Card>

      {tab === 'live' && <div style={{ display:'grid', gridTemplateColumns:'360px 1fr', gap:16 }}>
        <Card>
          <h2 style={{marginTop:0}}>QR unos proizvodnje</h2>
          <label style={{fontWeight:900}}>Radnik</label>
          <select value={workerId} onChange={e=>setWorkerId(e.target.value)} style={inputStyle}>{DEFAULT_WORKERS.map(w=><option key={w.id} value={w.id}>{w.id} — {w.ime}</option>)}</select>
          <label style={{fontWeight:900}}>Mašina</label>
          <select value={machineId} onChange={e=>setMachineId(e.target.value)} style={inputStyle}>{machines.map(m=><option key={m.id} value={m.id}>{m.id} — {m.naziv}</option>)}</select>
          <label style={{fontWeight:900}}>Nalog</label>
          <select value={orderId} onChange={e=>setOrderId(e.target.value)} style={inputStyle}>{orders.map(o=><option key={o.id} value={o.id}>{o.id} — {o.kupac} — {o.proizvod}</option>)}</select>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <div><label style={{fontWeight:900}}>Metara</label><input value={metara} onChange={e=>setMetara(e.target.value)} style={inputStyle}/></div>
            <div><label style={{fontWeight:900}}>Škart</label><input value={skart} onChange={e=>setSkart(e.target.value)} style={inputStyle}/></div>
          </div>
          <label style={{fontWeight:900}}>Razlog zastoja</label>
          <select value={stopReason} onChange={e=>setStopReason(e.target.value)} style={inputStyle}>{STOP_REASONS.map(r=><option key={r}>{r}</option>)}</select>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:12}}>
            <Button onClick={()=>addEvent('start')} variant="blue">Start</Button>
            <Button onClick={()=>addEvent('production')} variant="green">Upiši učinak</Button>
            <Button onClick={()=>addEvent('stop')} variant="amber">Zastoj</Button>
            <Button onClick={()=>addEvent('qc_fail')} variant="red">QC problem</Button>
          </div>
        </Card>
        <Card>
          <h2 style={{marginTop:0}}>Live događaji</h2>
          <div style={{display:'grid', gap:8}}>
            {events.map(ev => <div key={ev.id} style={{display:'grid', gridTemplateColumns:'120px 110px 110px 1fr 160px', gap:8, alignItems:'center', padding:12, border:'1px solid #e5e7eb', borderRadius:14, background:'#f8fafc'}}>
              <Badge color={ev.type.includes('qc') ? '#7c3aed' : ev.type==='stop' ? '#d97706' : ev.type==='production' ? '#059669' : '#2563eb'}>{ev.type}</Badge>
              <b>{ev.nalog_id}</b><span>{ev.machine_id}</span>
              <span style={{color:'#475569'}}>{ev.worker_id} · {ev.payload?.metara ? `${ev.payload.metara}m` : ''} {ev.payload?.skart ? `· škart ${ev.payload.skart}m` : ''} {ev.payload?.zastoj_min ? `· ${ev.payload.razlog} ${ev.payload.zastoj_min}min` : ''}</span>
              <span style={{fontSize:12,color:'#64748b'}}>{new Date(ev.created_at).toLocaleString('sr-RS')}</span>
            </div>)}
          </div>
        </Card>
      </div>}

      {tab === 'workers' && <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16}}>
        {DEFAULT_WORKERS.map(w => {
          const k = workerKpi.find(x=>x.worker_id===w.id) || {metara:0, skart:0, zastojiMin:0, naloga:0, dogadjaja:0};
          return <Card key={w.id}><div style={{display:'flex',justifyContent:'space-between'}}><h3 style={{marginTop:0}}>{w.ime}</h3><Badge>{w.uloga}</Badge></div><div style={metricGrid}><Metric l="Metara" v={k.metara}/><Metric l="Škart" v={k.skart}/><Metric l="Zastoji" v={`${k.zastojiMin} min`}/><Metric l="Naloga" v={k.naloga}/></div><div style={{marginTop:12, padding:10, background:'#f8fafc', borderRadius:12, fontWeight:900}}>QR: {w.qr}</div></Card>
        })}
      </div>}

      {tab === 'qc' && <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
        <Card><h2 style={{marginTop:0}}>QC checklist</h2>{QC_CHECKS.map(c => <div key={c.key} style={{display:'grid', gridTemplateColumns:'1fr 120px 100px', gap:8, padding:12, borderBottom:'1px solid #e5e7eb'}}><b>{c.label}</b><span>{c.tolerance}</span><Badge color="#059669">OK</Badge></div>)}</Card>
        <Card><h2 style={{marginTop:0}}>QC problemi po mašini</h2>{machineKpi.map(m => <div key={m.machine_id} style={{display:'grid', gridTemplateColumns:'120px 1fr 90px', gap:8, padding:12, borderBottom:'1px solid #e5e7eb'}}><b>{m.machine_id}</b><span>Škart {m.skart}m · zastoj {m.zastojiMin}min</span><Badge color={m.qcFail?'#dc2626':'#059669'}>{m.qcFail ? `${m.qcFail} NOK` : 'OK'}</Badge></div>)}</Card>
      </div>}

      {tab === 'trace' && <Card><h2 style={{marginTop:0}}>Traceability naloga</h2><div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12}}>{orders.map(o => <div key={o.id} style={{padding:14,border:'1px solid #e5e7eb',borderRadius:16,background:'#f8fafc'}}><h3 style={{marginTop:0}}>{o.id}</h3><p><b>{o.kupac}</b><br/>{o.proizvod}</p><div style={metricGrid}><Metric l="Događaja" v={events.filter(e=>e.nalog_id===o.id).length}/><Metric l="Metara" v={events.filter(e=>e.nalog_id===o.id).reduce((s,e)=>s+Number(e.payload?.metara||0),0)}/><Metric l="Škart" v={events.filter(e=>e.nalog_id===o.id).reduce((s,e)=>s+Number(e.payload?.skart||0),0)}/><Metric l="Status" v={o.status}/></div></div>)}</div></Card>}

      {tab === 'warehouse' && <Card><h2 style={{marginTop:0}}>Profesionalni magacin — pravila</h2><div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>{['FIFO prioritet','LOT traceability','Rezervacije po nalogu','Minimalne zalihe','Inventura','Reklamacije dobavljača','Lokacije A/B/C/D','Istorija ulaz/izlaz'].map((x,i)=><div key={x} style={{padding:16,borderRadius:16,background:i%2?'#eff6ff':'#ecfdf5',fontWeight:950}}>{x}<div style={{fontSize:12,fontWeight:700,color:'#64748b',marginTop:6}}>Aktivno pravilo za sledeću fazu magacina.</div></div>)}</div></Card>}
    </div>
  </div>;
}

const inputStyle = { width:'100%', boxSizing:'border-box', border:'1px solid #cbd5e1', borderRadius:12, padding:'11px 12px', margin:'6px 0 12px', fontWeight:800, background:'#fff' };
const metricGrid = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 };
function Metric({ l, v }) { return <div style={{background:'#f8fafc', borderRadius:12, padding:10}}><div style={{fontSize:12,color:'#64748b',fontWeight:800}}>{l}</div><div style={{fontSize:18,fontWeight:950}}>{v}</div></div>; }
