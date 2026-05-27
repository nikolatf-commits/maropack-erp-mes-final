import React, { useMemo, useState } from 'react';

const STATUS = {
  ok: { label: 'PROŠLO', color: '#16a34a', bg: '#dcfce7' },
  warning: { label: 'DORADA', color: '#f59e0b', bg: '#fef3c7' },
  fail: { label: 'NEUSAGLAŠENO', color: '#dc2626', bg: '#fee2e2' },
};

const defaultChecks = [
  { id: 'ulaz_materijal', faza: 'Ulaz materijala', parametar: 'Materijal odgovara specifikaciji', status: 'ok', napomena: '' },
  { id: 'sirina', faza: 'Dimenzije', parametar: 'Širina / tolerancija', status: 'ok', napomena: '' },
  { id: 'stampa', faza: 'Štampa', parametar: 'Boje, paser, smer odmotavanja', status: 'ok', napomena: '' },
  { id: 'kasiranje', faza: 'Kaširanje', parametar: 'Adhezija, mehurići, nabori', status: 'ok', napomena: '' },
  { id: 'rezanje', faza: 'Rezanje', parametar: 'Čistoća reza, širina trake, namotaj', status: 'ok', napomena: '' },
  { id: 'pakovanje', faza: 'Pakovanje', parametar: 'Etiketa, QR, količina, paleta', status: 'ok', napomena: '' },
];

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

export default function QualityControlPRO({ db = {}, msg }) {
  const [checks, setChecks] = useState(defaultChecks);
  const [selectedMaster, setSelectedMaster] = useState('');
  const [inspektor, setInspektor] = useState('');
  const [serija, setSerija] = useState('');
  const [saved, setSaved] = useState([]);

  const masters = useMemo(() => db.master_nalozi || db.masterNalozi || [], [db]);
  const nalozi = useMemo(() => db.nalozi || [], [db]);
  const selected = useMemo(() => {
    if (!selectedMaster) return null;
    return masters.find(m => String(m.id || m.broj || m.broj_naloga) === selectedMaster) || nalozi.find(n => String(n.master_nalog_id || n.ponBr || n.broj_naloga || n.broj) === selectedMaster) || null;
  }, [selectedMaster, masters, nalozi]);

  const summary = useMemo(() => {
    const total = checks.length;
    const fail = checks.filter(c => c.status === 'fail').length;
    const warning = checks.filter(c => c.status === 'warning').length;
    const ok = checks.filter(c => c.status === 'ok').length;
    const final = fail > 0 ? 'fail' : warning > 0 ? 'warning' : 'ok';
    return { total, fail, warning, ok, final };
  }, [checks]);

  function updateCheck(id, patch) {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function addCheck() {
    setChecks(prev => prev.concat([{ id: uid('qc'), faza: 'Dodatna kontrola', parametar: 'Novi parametar', status: 'ok', napomena: '' }]));
  }

  function saveReport() {
    const report = {
      id: uid('QC'),
      datum: new Date().toLocaleString('sr-RS'),
      master_nalog_id: selectedMaster || 'ručno',
      inspektor: inspektor || '—',
      serija: serija || '—',
      status: summary.final,
      checks,
    };
    setSaved(prev => [report].concat(prev));
    if (msg) msg('QC zapisnik sačuvan lokalno.');
  }

  function printReport() {
    window.print();
  }

  const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, boxShadow: '0 10px 30px rgba(15,23,42,0.06)' };
  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 10, outline: 'none', fontSize: 13, boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 };
  const badge = STATUS[summary.final];

  return (
    <div>
      <style>{`@media print{.no-print{display:none!important}.qc-print{box-shadow:none!important;border:none!important}.app-sidebar,.sidebar{display:none!important}}`}</style>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#0f172a' }}>✅ Quality Control PRO</h2>
          <div style={{ color: '#64748b', fontSize: 13 }}>Kontrola kvaliteta po master nalogu, operaciji i seriji.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={addCheck} style={{ padding: '10px 14px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>+ Parametar</button>
          <button onClick={saveReport} style={{ padding: '10px 14px', border: 'none', background: '#16a34a', color: '#fff', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>Sačuvaj QC</button>
          <button onClick={printReport} style={{ padding: '10px 14px', border: 'none', background: '#1d4ed8', color: '#fff', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>A4 Štampa</button>
        </div>
      </div>

      <div className="qc-print" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #1d4ed8', paddingBottom: 14, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8' }}>ZAPISNIK KONTROLE KVALITETA</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Datum: {new Date().toLocaleDateString('sr-RS')}</div>
          </div>
          <div style={{ background: badge.bg, color: badge.color, padding: '9px 13px', borderRadius: 10, fontWeight: 900, fontSize: 13 }}>{badge.label}</div>
        </div>

        <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 16 }}>
          <div><label style={lbl}>Master nalog</label><select style={inp} value={selectedMaster} onChange={e => setSelectedMaster(e.target.value)}><option value="">Ručno / bez master naloga</option>{masters.map(m => <option key={m.id || m.broj} value={String(m.id || m.broj || m.broj_naloga)}>{m.broj || m.broj_naloga || m.id} — {m.kupac || m.klijent || ''}</option>)}</select></div>
          <div><label style={lbl}>Inspektor</label><input style={inp} value={inspektor} onChange={e => setInspektor(e.target.value)} placeholder="Ime kontrolora" /></div>
          <div><label style={lbl}>Serija / LOT</label><input style={inp} value={serija} onChange={e => setSerija(e.target.value)} placeholder="Serija, LOT, paleta" /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}><div style={lbl}>Ukupno</div><b>{summary.total}</b></div>
          <div style={{ background: '#dcfce7', borderRadius: 12, padding: 12 }}><div style={lbl}>Prošlo</div><b>{summary.ok}</b></div>
          <div style={{ background: '#fef3c7', borderRadius: 12, padding: 12 }}><div style={lbl}>Dorada</div><b>{summary.warning}</b></div>
          <div style={{ background: '#fee2e2', borderRadius: 12, padding: 12 }}><div style={lbl}>Neusaglašeno</div><b>{summary.fail}</b></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}><div style={lbl}>Kupac</div><b>{selected?.kupac || selected?.klijent || '—'}</b></div>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}><div style={lbl}>Proizvod</div><b>{selected?.prod || selected?.proizvod || selected?.naziv || '—'}</b></div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: '#0f172a', color: '#fff' }}><th style={{ padding: 10, textAlign: 'left' }}>Faza</th><th style={{ padding: 10, textAlign: 'left' }}>Parametar</th><th style={{ padding: 10, textAlign: 'left' }}>Status</th><th style={{ padding: 10, textAlign: 'left' }}>Napomena</th></tr></thead>
            <tbody>{checks.map(c => {
              const s = STATUS[c.status];
              return <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: 10 }}><input className="no-print" style={{ ...inp, padding: '7px 9px' }} value={c.faza} onChange={e => updateCheck(c.id, { faza: e.target.value })} /><span className="print-only">{c.faza}</span></td>
                <td style={{ padding: 10 }}><input className="no-print" style={{ ...inp, padding: '7px 9px' }} value={c.parametar} onChange={e => updateCheck(c.id, { parametar: e.target.value })} /><span className="print-only">{c.parametar}</span></td>
                <td style={{ padding: 10 }}><select className="no-print" style={{ ...inp, padding: '7px 9px' }} value={c.status} onChange={e => updateCheck(c.id, { status: e.target.value })}><option value="ok">PROŠLO</option><option value="warning">DORADA</option><option value="fail">NEUSAGLAŠENO</option></select><span style={{ background: s.bg, color: s.color, borderRadius: 999, padding: '4px 8px', fontWeight: 900 }}>{s.label}</span></td>
                <td style={{ padding: 10 }}><input className="no-print" style={{ ...inp, padding: '7px 9px' }} value={c.napomena} onChange={e => updateCheck(c.id, { napomena: e.target.value })} placeholder="Napomena" /><span>{c.napomena || '—'}</span></td>
              </tr>;
            })}</tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginTop: 28, color: '#475569', fontSize: 12 }}>
          <div>Kontrolisao: _________________________</div>
          <div>Odobrio: _________________________</div>
          <div>Datum: {new Date().toLocaleDateString('sr-RS')}</div>
        </div>
      </div>

      {saved.length > 0 && <div className="no-print" style={{ ...card, marginTop: 16 }}><h3 style={{ marginTop: 0 }}>Istorija QC zapisnika</h3>{saved.map(r => <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', padding: '8px 0', fontSize: 13 }}><b>{r.id}</b><span>{r.datum}</span><span>{STATUS[r.status].label}</span></div>)}</div>}
    </div>
  );
}
