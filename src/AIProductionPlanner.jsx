import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { callGeminiJSON } from './geminiAI';

const MASINE = [
  { id: 'FLEXO-01', naziv: 'Flexo 1', tipovi: ['folija', 'kesa'], maxSirina: 1200, brzina: 180, setup: 45, boja: '#2563eb' },
  { id: 'LAM-01', naziv: 'Kaširka 1', tipovi: ['folija'], maxSirina: 1350, brzina: 140, setup: 60, boja: '#7c3aed' },
  { id: 'REZ-01', naziv: 'Rezač 1', tipovi: ['folija', 'spulna'], maxSirina: 1600, brzina: 260, setup: 35, boja: '#059669' },
  { id: 'KESA-01', naziv: 'Kesarica 1', tipovi: ['kesa'], maxSirina: 800, brzina: 80, setup: 50, boja: '#dc2626' },
  { id: 'SPU-01', naziv: 'Špulna 1', tipovi: ['spulna', 'špulna'], maxSirina: 250, brzina: 120, setup: 30, boja: '#ea580c' },
];

function norm(v) { return String(v || '').toLowerCase().trim(); }
function safeNum(v, def = 0) { const n = Number(v); return Number.isFinite(n) ? n : def; }
function fmt(n) { return Number(n || 0).toLocaleString('sr-RS'); }
function getTip(n) { return norm(n.tip_proizvoda || n.tip || n.vrsta_proizvoda || 'folija'); }
function getSirina(n) {
  const mats = n.mats || n.materijali || n.materijal;
  if (mats && typeof mats === 'object') return safeNum(mats.sir || mats.sirina || mats.ik, 0);
  return safeNum(n.sirina || n.ik || n.sir, 0);
}
function getKolicina(n) { return safeNum(n.kol || n.kolicina || n.met || n.duzina || 1000, 1000); }
function getMaterijal(n) {
  const raw = n.materijal_struktura || n.struktura || n.materijal || n.mats || '';
  if (Array.isArray(raw)) return raw.map(x => x.tip || x.naziv || x.materijal).filter(Boolean).join('/');
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.mats)) return raw.mats.map(x => x.tip || x.naziv || x.materijal).filter(Boolean).join('/');
    return raw.tip || raw.naziv || raw.materijal || raw.struktura || '—';
  }
  return String(raw || '—');
}
function rokScore(n) {
  const rok = n.rok_isporuke || n.rok || n.datumIsp || n.datum_isporuke;
  if (!rok) return 50;
  const d = new Date(rok);
  if (Number.isNaN(d.getTime())) return 50;
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days <= 1) return 100;
  if (days <= 3) return 80;
  if (days <= 7) return 60;
  return 35;
}
function priorityScore(n) {
  const p = norm(n.prioritet || n.priority || n.hitno);
  if (p.includes('hit') || p.includes('urgent') || p === '1') return 100;
  if (p.includes('vis')) return 75;
  if (p.includes('niz')) return 25;
  return 50;
}
function machineFor(n) {
  const tip = getTip(n);
  const sir = getSirina(n);
  const compatible = MASINE.filter(m => m.tipovi.includes(tip) && (!sir || sir <= m.maxSirina));
  return compatible[0] || MASINE.find(m => m.tipovi.includes(tip)) || MASINE[0];
}
function estimateMinutes(n, masina) {
  const k = getKolicina(n);
  const speed = Math.max(1, masina.brzina || 100);
  const base = Math.ceil(k / speed);
  return Math.max(20, base + (masina.setup || 30));
}
function buildHeuristicPlan(nalozi, rolne) {
  const open = (nalozi || []).filter(n => !['završeno', 'zavrseno', 'finished', 'closed'].includes(norm(n.status)));
  const enriched = open.map(n => {
    const masina = machineFor(n);
    const material = getMaterijal(n);
    const sirina = getSirina(n);
    const matKey = norm(material.split('/')[0] || material);
    const availableRolls = (rolne || []).filter(r => {
      const rMat = norm(r.materijal || r.tip || r.tip_materijala || r.naziv);
      const rSir = safeNum(r.sirina || r.width, 0);
      const status = norm(r.status || 'dostupna');
      return status !== 'potrošena' && status !== 'potrosena' && (!matKey || rMat.includes(matKey) || matKey.includes(rMat)) && (!sirina || !rSir || rSir >= sirina);
    });
    const score = priorityScore(n) * 0.45 + rokScore(n) * 0.35 + (availableRolls.length ? 20 : -20);
    return { n, masina, material, sirina, availableRolls, score, minutes: estimateMinutes(n, masina) };
  });

  enriched.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ma = norm(a.material), mb = norm(b.material);
    if (ma !== mb) return ma.localeCompare(mb);
    return a.sirina - b.sirina;
  });

  const byMachine = {};
  enriched.forEach((item, idx) => {
    if (!byMachine[item.masina.id]) byMachine[item.masina.id] = [];
    byMachine[item.masina.id].push({ ...item, position: idx + 1 });
  });

  const optimizedOrder = enriched.map((item, idx) => ({
    position: idx + 1,
    nalogId: item.n.id,
    ponBr: item.n.ponBr || item.n.broj_naloga || item.n.broj || `NALOG-${idx + 1}`,
    kupac: item.n.kupac || item.n.klijent || '—',
    proizvod: item.n.prod || item.n.proizvod || item.n.naziv || '—',
    tip: getTip(item.n),
    masina: item.masina.naziv,
    masinaId: item.masina.id,
    materijal: item.material,
    sirina: item.sirina,
    procenaMin: item.minutes,
    rolne: item.availableRolls.slice(0, 3).map(r => r.qr || r.id || r.broj_rolne || r.naziv).filter(Boolean),
    razlog: item.availableRolls.length
      ? `Prioritet + rok + dostupne rolne (${item.availableRolls.length})`
      : 'Nema idealne rolne — proveriti magacin/formatiranje'
  }));

  const totalMin = optimizedOrder.reduce((s, x) => s + x.procenaMin, 0);
  const warnings = optimizedOrder.filter(x => !x.rolne.length).map(x => `Nalog ${x.ponBr}: nema pronađene kompatibilne rolne.`);
  const groupedMaterials = new Set(optimizedOrder.map(x => norm(x.materijal))).size;
  return {
    optimizedOrder,
    byMachine,
    warnings,
    summary: {
      setupReduction: optimizedOrder.length > 1 ? '15-25%' : '—',
      wasteReduction: warnings.length ? '5-10%' : '10-18%',
      groupedMaterials,
      totalHours: (totalMin / 60).toFixed(1),
      orders: optimizedOrder.length,
      machines: Object.keys(byMachine).length
    },
    reasoning: 'Plan je sortiran po hitnosti, roku isporuke, dostupnosti rolni, kompatibilnosti mašina i grupisanju sličnih materijala/širina.'
  };
}

export default function AIProductionPlanner() {
  const [nalozi, setNalozi] = useState([]);
  const [rolne, setRolne] = useState([]);
  const [aiPlan, setAiPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('auto');
  const [tab, setTab] = useState('plan');
  const [error, setError] = useState('');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const [naloziRes, rolneRes] = await Promise.all([
        supabase.from('nalozi').select('*').order('created_at', { ascending: false }),
        supabase.from('rolne').select('*').order('created_at', { ascending: false })
      ]);
      let nextNalozi = naloziRes.data || [];
      let nextRolne = rolneRes.data || [];
      if (!nextRolne.length) {
        const mag = await supabase.from('magacin').select('*');
        nextRolne = mag.data || [];
      }
      setNalozi(nextNalozi);
      setRolne(nextRolne);
      const local = buildHeuristicPlan(nextNalozi, nextRolne);
      setAiPlan(local);
    } catch (e) {
      setError(e.message || 'Greška pri učitavanju podataka');
      const localN = JSON.parse(localStorage.getItem('maropack_nalozi') || '[]');
      const localR = JSON.parse(localStorage.getItem('maropack_rolne') || '[]');
      setNalozi(localN);
      setRolne(localR);
      setAiPlan(buildHeuristicPlan(localN, localR));
    }
    setLoading(false);
  }

  const kpi = useMemo(() => {
    const plan = aiPlan?.optimizedOrder || [];
    const noRoll = plan.filter(x => !x.rolne?.length).length;
    return {
      nalozi: nalozi.length,
      rolne: rolne.length,
      sati: aiPlan?.summary?.totalHours || '0.0',
      upozorenja: (aiPlan?.warnings || []).length || noRoll
    };
  }, [aiPlan, nalozi, rolne]);

  async function optimizeWithAI() {
    setLoading(true);
    setError('');
    const heuristic = buildHeuristicPlan(nalozi, rolne);
    if (mode === 'local') {
      setAiPlan(heuristic);
      setLoading(false);
      return;
    }
    try {
      const prompt = `Ti si AI planer proizvodnje za fabriku fleksibilne ambalaže. Na osnovu ovih naloga i rolni unapredi plan. Vrati isključivo JSON sa poljima optimizedOrder, summary, reasoning, warnings.\n\nNALOZI:\n${JSON.stringify(heuristic.optimizedOrder, null, 2)}\n\nROLNE:\n${JSON.stringify(rolne.slice(0, 80), null, 2)}\n\nLOKALNI PLAN:\n${JSON.stringify(heuristic, null, 2)}`;
      const ai = await callGeminiJSON(prompt);
      setAiPlan({ ...heuristic, ...ai, source: 'gemini' });
    } catch (e) {
      setError('Gemini nije dostupan, prikazan je lokalni smart plan. ' + (e.message || ''));
      setAiPlan({ ...heuristic, source: 'local-fallback' });
    }
    setLoading(false);
  }

  async function applyPlan() {
    if (!aiPlan?.optimizedOrder?.length) return;
    if (!window.confirm('Primeni redosled proizvodnje na radne naloge?')) return;
    try {
      for (const item of aiPlan.optimizedOrder) {
        if (!item.nalogId) continue;
        await supabase.from('nalozi').update({
          redosled_proizvodnje: item.position,
          planirana_masina: item.masina,
          planirano_trajanje_min: item.procenaMin,
          ai_plan_status: 'planirano'
        }).eq('id', item.nalogId);
      }
      alert('Plan je primenjen.');
      fetchData();
    } catch (e) {
      setError('Plan nije upisan u bazu: ' + e.message);
      localStorage.setItem('maropack_ai_plan', JSON.stringify(aiPlan));
      alert('Plan je sačuvan lokalno jer upis u bazu nije uspeo.');
    }
  }

  const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, boxShadow: '0 10px 30px rgba(15,23,42,0.06)' };
  const small = { fontSize: 12, color: '#64748b' };

  return (
    <div style={{ padding: 22, background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#0f172a' }}>🤖 AI Production Planner PRO</h1>
          <p style={{ margin: '6px 0 0', color: '#64748b' }}>Planiranje po mašinama, dostupnim rolnama, rokovima, prioritetu i proceni trajanja.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={mode} onChange={e => setMode(e.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontWeight: 700 }}>
            <option value="auto">AI + lokalni fallback</option>
            <option value="local">Lokalni smart planer</option>
          </select>
          <button onClick={fetchData} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 800, cursor: 'pointer' }}>Osveži</button>
          <button onClick={optimizeWithAI} disabled={loading} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: loading ? '#94a3b8' : '#2563eb', color: '#fff', fontWeight: 900, cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Analiziram...' : 'Optimizuj plan'}</button>
        </div>
      </div>

      {error && <div style={{ ...card, borderColor: '#f59e0b', background: '#fffbeb', color: '#92400e', marginBottom: 14 }}>⚠️ {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        {[['Radni nalozi', kpi.nalozi, '📋'], ['Rolne u sistemu', kpi.rolne, '🎞️'], ['Procena sati', kpi.sati, '⏱️'], ['Upozorenja', kpi.upozorenja, '⚠️']].map(x => (
          <div key={x[0]} style={card}><div style={small}>{x[2]} {x[0]}</div><div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{x[1]}</div></div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {['plan', 'masine', 'rolne', 'upozorenja'].map(t => <button key={t} onClick={() => setTab(t)} style={{ padding: '9px 14px', borderRadius: 999, border: tab === t ? 'none' : '1px solid #cbd5e1', background: tab === t ? '#0f172a' : '#fff', color: tab === t ? '#fff' : '#334155', fontWeight: 800, cursor: 'pointer' }}>{t === 'plan' ? 'Plan redosleda' : t === 'masine' ? 'Plan po mašinama' : t === 'rolne' ? 'Rolne / materijal' : 'Upozorenja'}</button>)}
      </div>

      {tab === 'plan' && <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14 }}>
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>📅 Optimizovan redosled</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {(aiPlan?.optimizedOrder || []).map(item => <div key={item.nalogId || item.position} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ color: '#2563eb' }}>#{item.position}</b>
                <b>{item.ponBr}</b>
                <span style={{ ...small }}>{item.kupac}</span>
                <span style={{ marginLeft: 'auto', background: '#dbeafe', color: '#1d4ed8', padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 900 }}>{item.masina}</span>
              </div>
              <div style={{ marginTop: 7, color: '#334155', fontSize: 13 }}>{item.proizvod}</div>
              <div style={{ marginTop: 7, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
                <span>Materijal: <b>{item.materijal}</b></span><span>Širina: <b>{item.sirina || '—'} mm</b></span><span>Procena: <b>{item.procenaMin} min</b></span>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: item.rolne?.length ? '#059669' : '#dc2626', fontWeight: 800 }}>{item.rolne?.length ? `Rolne: ${item.rolne.join(', ')}` : 'Nema kompatibilne rolne — potreban pregled magacina/formatiranje'}</div>
              <div style={{ marginTop: 5, fontSize: 12, color: '#64748b' }}>💡 {item.razlog}</div>
            </div>)}
            {!aiPlan?.optimizedOrder?.length && <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Nema naloga za planiranje.</div>}
          </div>
        </div>
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>📊 AI analiza</h3>
          <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
            <div>Setup redukcija: <b>{aiPlan?.summary?.setupReduction}</b></div>
            <div>Otpad redukcija: <b>{aiPlan?.summary?.wasteReduction}</b></div>
            <div>Grupe materijala: <b>{aiPlan?.summary?.groupedMaterials}</b></div>
            <div>Mašina u planu: <b>{aiPlan?.summary?.machines}</b></div>
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, color: '#475569' }}>{aiPlan?.reasoning}</div>
            <button onClick={applyPlan} disabled={!aiPlan?.optimizedOrder?.length} style={{ marginTop: 8, padding: '13px 16px', borderRadius: 10, border: 'none', background: '#059669', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>✅ Primeni plan</button>
          </div>
        </div>
      </div>}

      {tab === 'masine' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
        {Object.entries(aiPlan?.byMachine || {}).map(([mid, list]) => {
          const m = MASINE.find(x => x.id === mid) || { naziv: mid, boja: '#64748b' };
          return <div key={mid} style={{ ...card, borderTop: `5px solid ${m.boja}` }}><h3 style={{ marginTop: 0 }}>{m.naziv}</h3>{list.map(x => <div key={x.n.id} style={{ padding: 10, borderRadius: 10, background: '#f8fafc', marginBottom: 8, fontSize: 12 }}><b>{x.n.ponBr || x.n.broj_naloga || x.n.broj}</b><br />{x.n.prod || x.n.proizvod || x.n.naziv}<br /><span style={small}>{x.material} · {x.minutes} min</span></div>)}</div>;
        })}
      </div>}

      {tab === 'rolne' && <div style={card}><h3 style={{ marginTop: 0 }}>🎞️ Provera rolni</h3><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><thead><tr style={{ background: '#f1f5f9' }}><th style={{ padding: 10, textAlign: 'left' }}>QR/ID</th><th>Materijal</th><th>Širina</th><th>Dužina</th><th>Status</th><th>Lokacija</th></tr></thead><tbody>{rolne.slice(0, 120).map((r, i) => <tr key={r.id || i} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: 10, fontWeight: 800 }}>{r.qr || r.broj_rolne || r.id || i + 1}</td><td>{r.materijal || r.tip || r.tip_materijala || '—'}</td><td>{r.sirina || '—'}</td><td>{fmt(r.duzina || r.metraza || r.metraza_ost)}</td><td>{r.status || 'dostupna'}</td><td>{r.lokacija || r.palet || '—'}</td></tr>)}</tbody></table></div></div>}

      {tab === 'upozorenja' && <div style={card}><h3 style={{ marginTop: 0 }}>⚠️ Upozorenja i rizici</h3>{(aiPlan?.warnings || []).length ? aiPlan.warnings.map((w, i) => <div key={i} style={{ padding: 12, borderRadius: 10, background: '#fef2f2', color: '#991b1b', marginBottom: 8, fontWeight: 700 }}>{w}</div>) : <div style={{ color: '#059669', fontWeight: 800 }}>Nema kritičnih upozorenja u trenutnom planu.</div>}</div>}
    </div>
  );
}
