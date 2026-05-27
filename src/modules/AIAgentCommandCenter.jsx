import React, { useEffect, useMemo, useState } from 'react';
import { runAIAgent, executeAIAgentAction } from '../services/aiAgentCore.js';

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 18, boxShadow: '0 10px 30px rgba(15,23,42,.06)' };
const btn = { border: 0, borderRadius: 12, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' };
const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 800, border: '1px solid #e2e8f0', background: '#f8fafc' };

function Stat({ label, value, tone = '#0f172a' }) {
  return <div style={card}>
    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontSize: 28, color: tone, fontWeight: 950, marginTop: 8 }}>{value}</div>
  </div>;
}

function ActionCard({ action, onExecute }) {
  const payload = action.payload;
  const isCut = action.type === 'PLAN_REZANJA';
  const isSchedule = action.type === 'PLAN_PROIZVODNJE';
  return <div style={{ ...card, borderColor: '#bfdbfe', background: '#eff6ff' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
      <div>
        <div style={{ ...chip, background: '#dbeafe', color: '#1d4ed8', borderColor: '#93c5fd' }}>{action.type}</div>
        <h3 style={{ margin: '10px 0 4px', fontSize: 18 }}>{action.title}</h3>
        <div style={{ color: '#475569', fontSize: 13 }}>AI predlog — ne menja stanje dok ga ne potvrdiš.</div>
      </div>
      <button onClick={() => onExecute(action)} style={{ ...btn, background: '#1d4ed8', color: '#fff' }}>Sačuvaj predlog</button>
    </div>

    {isCut && <div style={{ marginTop: 14, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ color: '#64748b', textAlign: 'left' }}><th>Rolna</th><th>Materijal</th><th>Širina</th><th>Koristi m</th><th>Otpad mm</th><th>Ostatak</th></tr></thead>
        <tbody>
          {(payload.selected || []).map((x, i) => <tr key={i} style={{ borderTop: '1px solid #bfdbfe' }}>
            <td style={{ padding: 8, fontWeight: 900 }}>{x.roll.id}</td>
            <td>{x.roll.materijal}</td>
            <td>{x.roll.sirina} mm</td>
            <td>{Math.round(x.koristi_m).toLocaleString('sr-RS')}</td>
            <td>{x.otpad_mm}</td>
            <td>{Math.round(x.ostatak_m).toLocaleString('sr-RS')} m {x.nova_rolna_ostatak ? '→ QR ostatak' : ''}</td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {isSchedule && <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
      {(payload || []).slice(0, 8).map((x, i) => <div key={i} style={{ border: '1px solid #bfdbfe', borderRadius: 14, padding: 12, background: '#fff' }}>
        <div style={{ fontWeight: 950 }}>{x.order?.naziv || x.order?.broj_naloga || x.order?.id || 'Nalog'}</div>
        <div style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>Mašina: <b>{x.machine?.naziv || x.machine?.name || 'Nije dodeljena'}</b></div>
        <div style={{ color: '#475569', fontSize: 13 }}>Procena: {x.procenjeno_h}h</div>
      </div>)}
    </div>}

    {Array.isArray(action.next) && <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 900, marginBottom: 6 }}>Sledeći koraci</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{action.next.map((n, i) => <span key={i} style={chip}>✓ {n}</span>)}</div>
    </div>}
  </div>;
}

export default function AIAgentCommandCenter() {
  const [question, setQuestion] = useState('Napravi plan rezanja iz magacina za širinu 840 mm i 20000 m, pa predloži proizvodnju po mašinama.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');

  async function ask(q = question) {
    setLoading(true); setMsg('');
    try {
      const r = await runAIAgent(q, { save: true });
      setResult(r);
    } catch (e) {
      setMsg('Greška AI agenta: ' + (e.message || String(e)));
    } finally { setLoading(false); }
  }

  useEffect(() => { ask(question); /* eslint-disable-next-line */ }, []);

  const status = result?.tableStatus || [];
  const connected = status.filter(t => !t.error && t.count > 0).length;
  const errors = status.filter(t => t.error).length;
  const summary = result?.summary || {};
  const quick = useMemo(() => [
    'Napravi nalog za postojeći proizvod i predloži materijal iz magacina.',
    'Analiziraj najveći otpad po širinama i predloži idealne širine.',
    'Koje materijale treba naručiti na osnovu niskog stanja?',
    'Predloži plan proizvodnje za aktivne naloge po mašinama.',
    'Pronađi najbolju rolnu za rezanje 840 mm i 20000 m.'
  ], []);

  return <div style={{ padding: 24, background: '#f1f5f9', minHeight: '100vh' }}>
    <div style={{ maxWidth: 1500, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div style={{ ...card, background: 'linear-gradient(135deg,#020617,#1d4ed8)', color: '#fff', border: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#bfdbfe', letterSpacing: 1 }}>MAROPACK FAZA 3</div>
            <h1 style={{ fontSize: 34, margin: '6px 0 6px' }}>AI Agent Command Center</h1>
            <p style={{ margin: 0, color: '#dbeafe', maxWidth: 880 }}>Centralni AI agent čita tabele, prepoznaje nameru, predlaže nalog, plan rezanja, rezervaciju materijala, raspored po mašinama, nabavku i analizu otpada.</p>
          </div>
          <button onClick={() => ask()} disabled={loading} style={{ ...btn, background: '#fff', color: '#0f172a', minWidth: 160 }}>{loading ? 'Analiziram...' : 'Pokreni AI'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
        <Stat label="Povezane tabele" value={connected} tone="#16a34a" />
        <Stat label="Greške tabela" value={errors} tone={errors ? '#dc2626' : '#16a34a'} />
        <Stat label="Proizvodi" value={summary.broj_proizvoda ?? 0} />
        <Stat label="Aktivni nalozi" value={summary.aktivni_nalozi ?? 0} />
        <Stat label="Rolni u magacinu" value={summary.rolni_u_magacinu ?? 0} />
      </div>

      <div style={{ ...card }}>
        <label style={{ fontSize: 12, color: '#64748b', fontWeight: 900, textTransform: 'uppercase' }}>Pitaj AI agenta ili mu zadaj posao</label>
        <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={4} style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, border: '1px solid #cbd5e1', borderRadius: 14, padding: 14, fontSize: 15, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {quick.map((q, i) => <button key={i} onClick={() => { setQuestion(q); ask(q); }} style={{ ...btn, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155' }}>{q}</button>)}
        </div>
      </div>

      {msg && <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', fontWeight: 800 }}>{msg}</div>}

      {result && <div style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 18 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <h2 style={{ margin: 0 }}>Odgovor AI agenta</h2>
              <span style={{ ...chip, background: '#ecfeff', color: '#0e7490', borderColor: '#a5f3fc' }}>{result.intent?.label}</span>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.6, color: '#334155', marginTop: 12 }}>{result.answer}</pre>
          </div>

          {result.warnings?.length > 0 && <div style={{ ...card, borderColor: '#fde68a', background: '#fffbeb' }}>
            <h3 style={{ marginTop: 0, color: '#92400e' }}>Upozorenja</h3>
            {result.warnings.map((w, i) => <div key={i} style={{ marginBottom: 6 }}>⚠️ {w}</div>)}
          </div>}

          {result.actions?.map((a, i) => <ActionCard key={i} action={a} onExecute={async (action) => {
            const r = await executeAIAgentAction(action);
            setMsg(r.message);
          }} />)}
        </div>

        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Uvidi iz sistema</h3>
            {result.insights?.length ? result.insights.map((x, i) => <div key={i} style={{ marginBottom: 8 }}>✅ {x}</div>) : <div style={{ color: '#64748b' }}>Nema dovoljno podataka za uvid.</div>}
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Magacin po materijalu</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {(result.warehouse || []).slice(0, 10).map((g, i) => <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, background: '#f8fafc' }}>
                <div style={{ fontWeight: 950 }}>{g.materijal} {g.sirina ? g.sirina + ' mm' : ''}</div>
                <div style={{ color: '#64748b', fontSize: 13 }}>{g.rolni} rolni · {Math.round(g.metara).toLocaleString('sr-RS')} m · {Math.round(g.kg).toLocaleString('sr-RS')} kg</div>
              </div>)}
            </div>
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Status tabela</h3>
            <div style={{ maxHeight: 360, overflow: 'auto', display: 'grid', gap: 6 }}>
              {status.map((t) => <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                <span style={{ fontWeight: 800 }}>{t.label}</span>
                <span style={{ color: t.error ? '#dc2626' : '#16a34a', fontWeight: 900 }}>{t.error ? 'ERR' : t.count}</span>
              </div>)}
            </div>
          </div>
        </div>
      </div>}
    </div>
  </div>;
}
