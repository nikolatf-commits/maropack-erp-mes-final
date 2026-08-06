import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';

const initialRows = [];

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeJson(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  if (typeof v === 'object') return Array.isArray(v.rolne) ? v.rolne : Array.isArray(v.layers) ? v.layers : [];
  return [];
}

function normalizeRoll(r, nalog) {
  const sirinaRolne = safeNumber(r.sirina ?? r.sirina_rolne ?? r.width ?? r.roll_width);
  const idealna = safeNumber(nalog.idealna_sirina ?? nalog.idealnaSirina ?? nalog.sirina ?? r.idealna_sirina ?? r.ideal_width, sirinaRolne);
  const diff = sirinaRolne - idealna;
  return {
    sloj: r.sloj ?? r.layer ?? '-',
    materijal: r.materijal ?? r.material ?? r.vrsta ?? '-',
    oznaka: r.oznaka ?? r.oznaka_materijala ?? r.code ?? '-',
    debljina: safeNumber(r.debljina ?? r.mic ?? r.thickness),
    sirinaRolne,
    idealna,
    diff,
    metraza: safeNumber(r.metraza ?? r.metara ?? r.length_m ?? r.duzina),
    brRolne: r.br_rolne ?? r.brRolne ?? r.roll_no ?? r.oznaka_rolne ?? '-',
    lot: r.lot ?? r.LOT ?? '-',
    kupac: nalog.kupac ?? nalog.klijent ?? '-',
    naziv: nalog.naziv ?? nalog.proizvod ?? nalog.prod ?? '-',
    sifra: nalog.sifra ?? nalog.sifra_proizvoda ?? '-',
    tip: nalog.tip_proizvoda ?? nalog.tip ?? '-'
  };
}

const shell = { padding: 22, background: '#f8fafc', minHeight: '100vh', color: '#0f172a' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 8px 22px rgba(15,23,42,.06)' };
const btn = { border: 0, borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' };
const th = { textAlign: 'left', fontSize: 12, color: '#64748b', padding: 10, borderBottom: '1px solid #e2e8f0' };
const td = { padding: 10, borderBottom: '1px solid #f1f5f9', fontSize: 13 };

export default function AnalizaPotrosnjeMaterijala({ msg }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('analiza');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({});

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('nalozi_materijal')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        if (alive) setRows(data || []);
      } catch (e) {
        console.warn('Analiza potrosnje: podaci nisu dostupni', e);
        if (alive) setRows(initialRows);
        if (msg) msg('Analiza potrošnje: tabela nalozi_materijal nije dostupna.');
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [msg]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(n => JSON.stringify(n).toLowerCase().includes(term));
  }, [rows, q]);

  const flat = useMemo(() => filtered.flatMap(n => safeJson(n.izabrane_rolne ?? n.izabraneRolne ?? n.rolne).map(r => normalizeRoll(r, n))), [filtered]);

  const grouped = useMemo(() => {
    const map = new Map();
    flat.forEach(r => {
      const key = `${r.materijal}|${r.oznaka}|${r.debljina}|${r.idealna}`;
      if (!map.has(key)) map.set(key, { ...r, naloga: 0, metraza: 0, diffTotal: 0, maxDiff: 0, zero: 0, kupci: new Set(), rolne: [] });
      const g = map.get(key);
      g.naloga += 1;
      g.metraza += r.metraza;
      g.diffTotal += Math.max(0, r.diff);
      g.maxDiff = Math.max(g.maxDiff, Math.max(0, r.diff));
      if (Math.abs(r.diff) < 0.01) g.zero += 1;
      g.kupci.add(r.kupac);
      g.rolne.push(r);
    });
    return Array.from(map.values()).map(g => ({ ...g, avgDiff: g.naloga ? g.diffTotal / g.naloga : 0, zeroPct: g.naloga ? Math.round((g.zero / g.naloga) * 100) : 0, kupciTxt: Array.from(g.kupci).join(', ') })).sort((a,b) => b.metraza - a.metraza);
  }, [flat]);

  const stats = useMemo(() => ({
    nalozi: filtered.length,
    metara: flat.reduce((s,r)=>s+r.metraza,0),
    avgOtpad: flat.length ? flat.reduce((s,r)=>s+Math.max(0,r.diff),0) / flat.length : 0,
    zeroPct: flat.length ? Math.round((flat.filter(r=>Math.abs(r.diff)<0.01).length / flat.length) * 100) : 0
  }), [filtered, flat]);

  return <div style={shell}>
    <div style={{ ...card, padding: 22, marginBottom: 16, background: 'linear-gradient(135deg,#0f172a,#1e3a8a)', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#bfdbfe', letterSpacing: 1 }}>MAGACIN / ANALITIKA</div>
          <h1 style={{ margin: '6px 0 4px', fontSize: 28 }}>📊 Analiza potrošnje materijala</h1>
          <div style={{ color: '#dbeafe' }}>Iz svih naloga: materijal, rolne, metraža, idealna širina i otpad po širini.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setView('analiza')} style={{ ...btn, background: view === 'analiza' ? '#fff' : 'rgba(255,255,255,.14)', color: view === 'analiza' ? '#0f172a' : '#fff' }}>Analiza</button>
          <button onClick={() => setView('nalozi')} style={{ ...btn, background: view === 'nalozi' ? '#fff' : 'rgba(255,255,255,.14)', color: view === 'nalozi' ? '#0f172a' : '#fff' }}>Lista naloga</button>
        </div>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
      {[['Naloga', stats.nalozi], ['Ukupno metara', stats.metara.toLocaleString('sr-RS')], ['Prosečan otpad', stats.avgOtpad.toFixed(1) + ' mm'], ['Nulti otpad', stats.zeroPct + '%']].map(([l,v]) => <div key={l} style={{ ...card, padding: 16 }}><div style={{ fontSize: 12, color: '#64748b', fontWeight: 800 }}>{l}</div><div style={{ fontSize: 24, fontWeight: 950 }}>{v}</div></div>)}
    </div>

    <div style={{ ...card, padding: 14, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Pretraga po kupcu, proizvodu, materijalu, oznaci, roli..." style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 12, padding: 12, fontWeight: 700 }} />
      <button onClick={() => setQ('')} style={{ ...btn, background: '#f1f5f9' }}>Reset</button>
    </div>

    {loading ? <div style={{ ...card, padding: 30 }}>Učitavanje...</div> : view === 'analiza' ? <div style={{ ...card, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Materijal</th><th style={th}>Oznaka</th><th style={th}>Deb.</th><th style={th}>Idealna šir.</th><th style={th}>Naloga</th><th style={th}>Metraža</th><th style={th}>Pros. otpad</th><th style={th}>Maks.</th><th style={th}>% nulti</th><th style={th}>Kupci</th></tr></thead>
        <tbody>{grouped.map((g,i)=><tr key={i}><td style={td}><b>{g.materijal}</b></td><td style={td}>{g.oznaka}</td><td style={td}>{g.debljina || '-'}µ</td><td style={td}>{g.idealna} mm</td><td style={td}>{g.naloga}</td><td style={td}>{g.metraza.toLocaleString('sr-RS')} m</td><td style={td}>{g.avgDiff < 0.01 ? '✅ 0' : g.avgDiff.toFixed(1)} mm</td><td style={td}>{g.maxDiff} mm</td><td style={td}><b>{g.zeroPct}%</b></td><td style={td}>{g.kupciTxt}</td></tr>)}</tbody>
      </table>
    </div> : <div style={{ display: 'grid', gap: 12 }}>
      {filtered.map(n => {
        const list = safeJson(n.izabrane_rolne ?? n.izabraneRolne ?? n.rolne).map(r => normalizeRoll(r,n));
        const isOpen = !!open[n.id];
        return <div key={n.id} style={{ ...card, padding: 16 }}>
          <div onClick={()=>setOpen(o=>({ ...o, [n.id]: !o[n.id] }))} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div><b style={{ fontSize: 17 }}>{n.naziv || n.proizvod || 'Nalog materijala'}</b><div style={{ color: '#64748b', fontSize: 13 }}>{n.kupac || n.klijent || '-'} · {n.sifra || '-'} · {n.tip_proizvoda || n.tip || '-'} · idealna širina {n.idealna_sirina || '-'} mm</div></div>
            <button style={{ ...btn, background: '#eff6ff', color: '#1d4ed8' }}>{isOpen ? 'Zatvori' : 'Prikaži slojeve'}</button>
          </div>
          {isOpen && <div style={{ marginTop: 12, overflow: 'hidden', border: '1px solid #e2e8f0', borderRadius: 14 }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Sloj</th><th style={th}>Materijal</th><th style={th}>Oznaka</th><th style={th}>Deb.</th><th style={th}>Br. rolne</th><th style={th}>Širina rolne</th><th style={th}>Idealna</th><th style={th}>Razlika</th><th style={th}>Metraža</th><th style={th}>LOT</th></tr></thead><tbody>{list.map((r,i)=><tr key={i}><td style={td}>{r.sloj}</td><td style={td}><b>{r.materijal}</b></td><td style={td}>{r.oznaka}</td><td style={td}>{r.debljina}µ</td><td style={td}>{r.brRolne}</td><td style={td}>{r.sirinaRolne} mm</td><td style={td}>{r.idealna} mm</td><td style={td}>{Math.abs(r.diff)<.01 ? '✅ 0 mm' : (r.diff>0?'+':'') + r.diff + ' mm'}</td><td style={td}>{r.metraza.toLocaleString('sr-RS')} m</td><td style={td}>{r.lot}</td></tr>)}</tbody></table></div>}
        </div>;
      })}
    </div>}
  </div>;
}
