import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';

const initialProducts = [];

function safeJson(v) {
  if (!v) return {};
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
  return typeof v === 'object' ? v : {};
}

function layersFromProduct(p) {
  const t = safeJson(p.template ?? p.template_json ?? p.data ?? p.sastav);
  const arrays = [t.layers, t.materijali, t.folija?.layers, t.folija?.materijali, p.layers, p.materijali, p.slojevi];
  const arr = arrays.find(Array.isArray) || [];
  return arr.map((l, i) => ({
    sloj: l.sloj ?? l.layer ?? i + 1,
    vrsta: l.vrsta ?? l.materijal ?? l.material ?? l.tip ?? '-',
    oznaka: l.oznaka ?? l.oznaka_materijala ?? l.code ?? '-',
    debljina: l.debljina ?? l.mic ?? l.thickness ?? '-',
    sirina: l.sirina ?? l.width ?? p.idealna_sirina ?? '-',
    gm2: l.gm2 ?? l.gramatura ?? l.g_m2 ?? '-'
  }));
}

const shell = { padding: 22, background: '#f8fafc', minHeight: '100vh', color: '#0f172a' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 8px 22px rgba(15,23,42,.06)' };
const btn = { border: 0, borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' };
const th = { textAlign: 'left', fontSize: 12, color: '#64748b', padding: 10, borderBottom: '1px solid #e2e8f0' };
const td = { padding: 10, borderBottom: '1px solid #f1f5f9', fontSize: 13 };

export default function ListaProizvodaKupci({ msg }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [groupBy, setGroupBy] = useState('kupac');
  const [view, setView] = useState('kartice');
  const [open, setOpen] = useState({});

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase.from('proizvodi').select('*').order('kupac', { ascending: true }).limit(1000);
        if (error) throw error;
        if (alive) setProducts(data || []);
      } catch (e) {
        console.warn('Lista proizvoda: podaci nisu dostupni', e);
        if (alive) setProducts(initialProducts);
        if (msg) msg('Lista proizvoda: tabela proizvodi nije dostupna.');
      } finally { if (alive) setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, [msg]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return products;
    return products.filter(p => JSON.stringify(p).toLowerCase().includes(term) || layersFromProduct(p).some(l => JSON.stringify(l).toLowerCase().includes(term)));
  }, [products, q]);

  const groups = useMemo(() => {
    const m = new Map();
    filtered.forEach(p => {
      const layers = layersFromProduct(p);
      let key = p.kupac || p.klijent || 'Bez kupca';
      if (groupBy === 'tip') key = p.tip || p.tip_proizvoda || 'Bez tipa';
      if (groupBy === 'materijal') key = layers[0]?.vrsta || 'Bez materijala';
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(p);
    });
    return Array.from(m.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
  }, [filtered, groupBy]);

  const allLayers = useMemo(() => filtered.flatMap(p => layersFromProduct(p).map(l => ({ ...l, product: p }))), [filtered]);

  return <div style={shell}>
    <div style={{ ...card, padding: 22, marginBottom: 16, background: 'linear-gradient(135deg,#111827,#065f46)', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#bbf7d0', letterSpacing: 1 }}>BAZA / KATALOG</div>
          <h1 style={{ margin: '6px 0 4px', fontSize: 28 }}>🗂️ Lista proizvoda po kupcima</h1>
          <div style={{ color: '#dcfce7' }}>Za svaki proizvod: kupac, vrsta materijala, oznaka materijala, debljina, širina i sastav.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setView('kartice')} style={{ ...btn, background: view === 'kartice' ? '#fff' : 'rgba(255,255,255,.14)', color: view === 'kartice' ? '#0f172a' : '#fff' }}>Kartice</button>
          <button onClick={() => setView('tabela')} style={{ ...btn, background: view === 'tabela' ? '#fff' : 'rgba(255,255,255,.14)', color: view === 'tabela' ? '#0f172a' : '#fff' }}>Tabela</button>
        </div>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
      {[['Proizvoda', filtered.length], ['Kupaca', new Set(filtered.map(p=>p.kupac || p.klijent || '-')).size], ['Slojeva', allLayers.length], ['Materijala', new Set(allLayers.map(l=>l.vrsta)).size]].map(([l,v]) => <div key={l} style={{ ...card, padding: 16 }}><div style={{ fontSize: 12, color: '#64748b', fontWeight: 800 }}>{l}</div><div style={{ fontSize: 24, fontWeight: 950 }}>{v}</div></div>)}
    </div>

    <div style={{ ...card, padding: 14, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Pretraga po kupcu, proizvodu, šifri, materijalu, oznaci..." style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 12, padding: 12, fontWeight: 700 }} />
      <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: 12, fontWeight: 800 }}><option value="kupac">Grupiši po kupcu</option><option value="tip">Grupiši po tipu</option><option value="materijal">Grupiši po materijalu</option></select>
      <button onClick={() => setQ('')} style={{ ...btn, background: '#f1f5f9' }}>Reset</button>
    </div>

    {loading ? <div style={{ ...card, padding: 30 }}>Učitavanje...</div> : view === 'tabela' ? <div style={{ ...card, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Naziv</th><th style={th}>Kupac</th><th style={th}>Šifra</th><th style={th}>Tip</th><th style={th}>Idealna širina</th><th style={th}>Materijali</th><th style={th}>Broj slojeva</th></tr></thead><tbody>{filtered.map(p => { const ls = layersFromProduct(p); return <tr key={p.id}><td style={td}><b>{p.naziv || p.proizvod || '-'}</b></td><td style={td}>{p.kupac || p.klijent || '-'}</td><td style={td}>{p.sifra || '-'}</td><td style={td}>{p.tip || p.tip_proizvoda || '-'}</td><td style={td}>{p.idealna_sirina || p.sirina || '-'} mm</td><td style={td}>{ls.map(l => `${l.vrsta} ${l.oznaka} ${l.debljina}µ`).join(' + ')}</td><td style={td}>{ls.length}</td></tr>; })}</tbody></table>
    </div> : <div style={{ display: 'grid', gap: 18 }}>
      {groups.map(([group, arr]) => <div key={group} style={{ ...card, padding: 18 }}>
        <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>🏢 {group}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(360px,1fr))', gap: 14 }}>
          {arr.map(p => { const ls = layersFromProduct(p); const isOpen = !!open[p.id]; return <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 15, background: '#fff' }}>
            <div onClick={()=>setOpen(o=>({ ...o, [p.id]: !o[p.id] }))} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b style={{ fontSize: 17 }}>{p.naziv || p.proizvod || '-'}</b><span style={{ background: '#ecfdf5', color: '#047857', borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 900 }}>{p.tip || p.tip_proizvoda || '-'}</span></div>
              <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>{p.kupac || p.klijent || '-'} · šifra {p.sifra || '-'} · idealna širina {p.idealna_sirina || p.sirina || '-'} mm</div>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>{ls.map((l,i)=><span key={i} style={{ background: '#f1f5f9', borderRadius: 999, padding: '6px 9px', fontSize: 12, fontWeight: 850 }}>{l.vrsta} {l.oznaka} {l.debljina}µ</span>)}</div>
            </div>
            {isOpen && <div style={{ marginTop: 12, overflow: 'hidden', border: '1px solid #e2e8f0', borderRadius: 12 }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Sloj</th><th style={th}>Vrsta</th><th style={th}>Oznaka</th><th style={th}>Debljina</th><th style={th}>Širina</th><th style={th}>g/m²</th></tr></thead><tbody>{ls.map((l,i)=><tr key={i}><td style={td}>{l.sloj}</td><td style={td}><b>{l.vrsta}</b></td><td style={td}>{l.oznaka}</td><td style={td}>{l.debljina}µ</td><td style={td}>{l.sirina} mm</td><td style={td}>{l.gm2}</td></tr>)}</tbody></table></div>}
          </div>; })}
        </div>
      </div>)}
    </div>}
  </div>;
}
