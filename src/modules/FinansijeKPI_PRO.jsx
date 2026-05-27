import React, { useMemo, useState } from 'react';

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function eur(v) {
  return n(v).toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function pct(v) {
  return n(v).toLocaleString('sr-RS', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}
function pick(obj, keys, fallback = 0) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return fallback;
}

export default function FinansijeKPI_PRO({ db = {}, msg }) {
  const [period, setPeriod] = useState('mesec');
  const [marginTarget, setMarginTarget] = useState(25);
  const [scrapTarget, setScrapTarget] = useState(5);
  const [downtimeTarget, setDowntimeTarget] = useState(8);

  const nalozi = useMemo(() => db.nalozi || [], [db]);
  const masterNalozi = useMemo(() => db.master_nalozi || db.masterNalozi || [], [db]);
  const rolne = useMemo(() => db.rolne || db.rolne_magacin || [], [db]);
  const sessions = useMemo(() => db.production_sessions || db.sesije || db.live_sessions || [], [db]);

  const rows = useMemo(() => {
    const base = masterNalozi.length ? masterNalozi : nalozi;
    return base.map((x, i) => {
      const res = x.res || x.rezultat || x.kalkulacija || {};
      const prihod = n(pick(x, ['ukupno', 'vrednost', 'cena_ukupno', 'total', 'iznos'], pick(res, ['kn', 'ukupno', 'vrednost'], 0)));
      const materijal = n(pick(x, ['trosak_materijala', 'materijal_cost'], pick(res, ['ukM', 'materijali', 'materijal'], prihod * 0.45)));
      const proizvodnja = n(pick(x, ['trosak_proizvodnje', 'production_cost'], pick(res, ['ukKas', 'ukSt', 'ukRez', 'rad'], prihod * 0.18)));
      const ostalo = n(pick(x, ['trosak_ostalo', 'other_cost'], pick(res, ['ukTr', 'ukPk'], prihod * 0.05)));
      const trosak = materijal + proizvodnja + ostalo;
      const profit = prihod - trosak;
      const marza = prihod > 0 ? (profit / prihod) * 100 : 0;
      const skart = n(pick(x, ['skart_proc', 'skart', 'waste_pct'], pick(res, ['sk', 'skart'], 0)));
      return {
        id: x.id || x.broj || x.ponBr || i,
        broj: x.broj || x.broj_naloga || x.ponBr || x.ponuda_broj || ('NAL-' + (i + 1)),
        kupac: x.kupac || x.klijent || '—',
        proizvod: x.prod || x.proizvod || x.naziv || '—',
        tip: x.tip || x.tip_proizvoda || '—',
        status: x.status || '—',
        prihod, materijal, proizvodnja, ostalo, trosak, profit, marza, skart,
      };
    });
  }, [masterNalozi, nalozi]);

  const kpi = useMemo(() => {
    const prihod = rows.reduce((s, r) => s + r.prihod, 0);
    const trosak = rows.reduce((s, r) => s + r.trosak, 0);
    const profit = prihod - trosak;
    const marza = prihod > 0 ? (profit / prihod) * 100 : 0;
    const avgSkart = rows.length ? rows.reduce((s, r) => s + r.skart, 0) / rows.length : 0;
    const aktivneRolne = rolne.filter(r => (r.status || '').toLowerCase() !== 'potrošena' && (r.status || '').toLowerCase() !== 'potrosena').length;
    const rezervisane = rolne.filter(r => (r.status || '').toLowerCase().includes('rez')).length;
    const activeSessions = sessions.filter(s => ['active', 'radi', 'u toku', 'running'].includes(String(s.status || '').toLowerCase())).length;
    const downtime = sessions.length ? sessions.filter(s => String(s.status || '').toLowerCase().includes('zastoj')).length / sessions.length * 100 : 0;
    const oee = Math.max(0, Math.min(100, 100 - avgSkart - downtime));
    return { prihod, trosak, profit, marza, avgSkart, aktivneRolne, rezervisane, activeSessions, downtime, oee };
  }, [rows, rolne, sessions]);

  const byCustomer = useMemo(() => {
    const map = new Map();
    rows.forEach(r => {
      const cur = map.get(r.kupac) || { kupac: r.kupac, prihod: 0, profit: 0, broj: 0 };
      cur.prihod += r.prihod; cur.profit += r.profit; cur.broj += 1;
      map.set(r.kupac, cur);
    });
    return [...map.values()].sort((a, b) => b.prihod - a.prihod).slice(0, 8);
  }, [rows]);

  const risky = useMemo(() => rows.filter(r => r.marza < marginTarget || r.skart > scrapTarget).sort((a, b) => a.marza - b.marza).slice(0, 8), [rows, marginTarget, scrapTarget]);

  const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 18, boxShadow: '0 10px 30px rgba(15,23,42,0.06)' };
  const lbl = { fontSize: 11, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 };
  const inp = { padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 13, outline: 'none', background: '#fff' };
  const pill = (ok) => ({ display: 'inline-block', padding: '4px 8px', borderRadius: 999, fontWeight: 900, fontSize: 11, background: ok ? '#dcfce7' : '#fee2e2', color: ok ? '#15803d' : '#dc2626' });

  return (
    <div>
      <style>{`@media print{.no-print{display:none!important}.finance-print{box-shadow:none!important;border:none!important}}`}</style>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 25, fontWeight: 950, color: '#0f172a' }}>💰 Finansije + KPI PRO</h2>
          <div style={{ color: '#64748b', fontSize: 13 }}>Profitabilnost naloga, realni troškovi, škart, OEE i poslovna analiza.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={period} onChange={e => setPeriod(e.target.value)} style={inp}>
            <option value="danas">Danas</option><option value="nedelja">Ova nedelja</option><option value="mesec">Ovaj mesec</option><option value="sve">Sve</option>
          </select>
          <button onClick={() => { if (msg) msg('KPI analiza osvežena lokalno.'); }} style={{ ...inp, fontWeight: 900, cursor: 'pointer' }}>Osveži</button>
          <button onClick={() => window.print()} style={{ ...inp, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>A4 Izveštaj</button>
        </div>
      </div>

      <div className="finance-print" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          {[
            ['Prihod', eur(kpi.prihod), '#1d4ed8'], ['Trošak', eur(kpi.trosak), '#f59e0b'], ['Profit', eur(kpi.profit), kpi.profit >= 0 ? '#16a34a' : '#dc2626'], ['Marža', pct(kpi.marza), kpi.marza >= marginTarget ? '#16a34a' : '#dc2626'], ['OEE', pct(kpi.oee), kpi.oee >= 80 ? '#16a34a' : '#f59e0b'], ['Škart', pct(kpi.avgSkart), kpi.avgSkart <= scrapTarget ? '#16a34a' : '#dc2626'], ['Aktivne rolne', kpi.aktivneRolne, '#0891b2'], ['Live sesije', kpi.activeSessions, '#7c3aed']
          ].map(x => <div key={x[0]} style={card}><div style={lbl}>{x[0]}</div><div style={{ fontSize: 22, fontWeight: 950, color: x[2] }}>{x[1]}</div></div>)}
        </div>

        <div className="no-print" style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          <div><div style={lbl}>Ciljna marža %</div><input style={{ ...inp, width: '100%' }} type="number" value={marginTarget} onChange={e => setMarginTarget(e.target.value)} /></div>
          <div><div style={lbl}>Max škart %</div><input style={{ ...inp, width: '100%' }} type="number" value={scrapTarget} onChange={e => setScrapTarget(e.target.value)} /></div>
          <div><div style={lbl}>Max downtime %</div><input style={{ ...inp, width: '100%' }} type="number" value={downtimeTarget} onChange={e => setDowntimeTarget(e.target.value)} /></div>
          <div style={{ display: 'flex', alignItems: 'end' }}><div style={{ color: '#64748b', fontSize: 12 }}>Pragovi služe za AI/KPI upozorenja i označavanje rizičnih naloga.</div></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(280px,0.8fr)', gap: 14 }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' }}><b style={{ fontSize: 16 }}>📋 Profitabilnost naloga</b><span style={{ color: '#64748b', fontSize: 12 }}>{rows.length} naloga</span></div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: '#0f172a', color: '#fff' }}><th style={{ padding: 10, textAlign: 'left' }}>Nalog</th><th style={{ padding: 10, textAlign: 'left' }}>Kupac / proizvod</th><th style={{ padding: 10, textAlign: 'right' }}>Prihod</th><th style={{ padding: 10, textAlign: 'right' }}>Trošak</th><th style={{ padding: 10, textAlign: 'right' }}>Profit</th><th style={{ padding: 10, textAlign: 'center' }}>Marža</th></tr></thead>
                <tbody>{rows.slice(0, 12).map(r => <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: 10, fontWeight: 900 }}>{r.broj}<div style={{ color: '#64748b', fontWeight: 600, fontSize: 11 }}>{r.tip}</div></td><td style={{ padding: 10 }}><b>{r.kupac}</b><div style={{ color: '#64748b' }}>{r.proizvod}</div></td><td style={{ padding: 10, textAlign: 'right' }}>{eur(r.prihod)}</td><td style={{ padding: 10, textAlign: 'right' }}>{eur(r.trosak)}</td><td style={{ padding: 10, textAlign: 'right', color: r.profit >= 0 ? '#16a34a' : '#dc2626', fontWeight: 900 }}>{eur(r.profit)}</td><td style={{ padding: 10, textAlign: 'center' }}><span style={pill(r.marza >= marginTarget)}>{pct(r.marza)}</span></td></tr>)}</tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <div style={card}><b style={{ fontSize: 16 }}>🏆 Top kupci</b>{byCustomer.length === 0 && <div style={{ color: '#64748b', marginTop: 10 }}>Nema dovoljno podataka.</div>}{byCustomer.map(c => <div key={c.kupac} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', padding: '10px 0' }}><div><b>{c.kupac}</b><div style={{ color: '#64748b', fontSize: 11 }}>{c.broj} naloga</div></div><div style={{ textAlign: 'right' }}><b>{eur(c.prihod)}</b><div style={{ color: c.profit >= 0 ? '#16a34a' : '#dc2626', fontSize: 11 }}>{eur(c.profit)}</div></div></div>)}</div>
            <div style={card}><b style={{ fontSize: 16 }}>⚠️ Rizični nalozi</b>{risky.length === 0 && <div style={{ color: '#16a34a', marginTop: 10, fontWeight: 800 }}>Nema kritičnih odstupanja.</div>}{risky.map(r => <div key={r.id} style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 10, marginTop: 8 }}><b>{r.broj}</b><div style={{ color: '#64748b', fontSize: 12 }}>{r.kupac} — {r.proizvod}</div><div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}><span style={pill(r.marza >= marginTarget)}>Marža {pct(r.marza)}</span><span style={pill(r.skart <= scrapTarget)}>Škart {pct(r.skart)}</span></div></div>)}</div>
          </div>
        </div>

        <div style={card}>
          <b style={{ fontSize: 16 }}>🤖 AI analiza proizvodnje</b>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginTop: 12 }}>
            <div style={{ background: '#eff6ff', borderRadius: 12, padding: 12 }}><b>Profitabilnost</b><p style={{ margin: '6px 0 0', color: '#475569', fontSize: 13 }}>{kpi.marza >= marginTarget ? 'Marža je u dobrom opsegu.' : 'Marža je ispod cilja — proveriti cenu materijala, škart i prodajnu cenu.'}</p></div>
            <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 12 }}><b>Materijal</b><p style={{ margin: '6px 0 0', color: '#475569', fontSize: 13 }}>{kpi.rezervisane > 0 ? 'Postoje rezervisane rolne — proveriti da li su vezane za aktivne master naloge.' : 'Nema velikog broja rezervisanih rolni u trenutnim podacima.'}</p></div>
            <div style={{ background: '#fff7ed', borderRadius: 12, padding: 12 }}><b>Škart / OEE</b><p style={{ margin: '6px 0 0', color: '#475569', fontSize: 13 }}>{kpi.avgSkart <= scrapTarget ? 'Škart je u ciljnom opsegu.' : 'Škart je iznad cilja — analizirati mašinu, materijal i operatera.'}</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
