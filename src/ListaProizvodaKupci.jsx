import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';

const initialProducts = [];

function safeJson(v) {
  if (!v) return {};
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
  return typeof v === 'object' ? v : {};
}

function firstValue(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '-';
}

function normalizeArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

function layersFromProduct(p) {
  const t = safeJson(p.template ?? p.template_json ?? p.data ?? p.sastav ?? p.standardi);
  const nestedRecord = safeJson(t.record);
  const tip = p.tip || t.tip || nestedRecord.tip || nestedRecord.data?.type || 'folija';
  const arrays = [
    p.materijali_struktura,
    p.mats,
    t.materijali_struktura,
    t.mats,
    t.layers,
    t.materijali,
    t.folija?.layers,
    t.folija?.materijali,
    t.kesa?.layers,
    t.spulna?.layers,
    nestedRecord.data?.[tip]?.layers,
    p.layers,
    p.materijali,
    p.slojevi,
  ];
  const arr = arrays.map(normalizeArray).find(a => a.length) || [];

  return arr.map((l, i) => {
    const idealnaSirina = firstValue(
      l.idealna_sirina,
      l.idealnaSirina,
      l.sirina,
      l.width,
      p.sir,
      p.sirina,
      p.idealna_sirina
    );
    return {
      sloj: firstValue(l.sloj, l.layer, i + 1),
      vrsta: firstValue(l.vrsta, l.tip, l.materijal, l.material),
      pod_vrsta: firstValue(l.pod_vrsta, l.podVrsta, l.podvrsta, l.subtype, l.sub_type),
      oznaka: firstValue(l.oznaka_materijala, l.oznaka, l.code, l.komercijalnaOznaka),
      proizvodjac: firstValue(l.proizvodjac, l.proizvođač, l.proizvodac, l.proizvodjač, l.dobavljac),
      debljina: firstValue(l.debljina, l.deb, l.mic, l.thickness),
      sirina: idealnaSirina,
      spoj_materijala: firstValue(l.spoj_materijala, l.spojMaterijala, l.spoj, l.kasiranje, l.kas),
      broj_spojeva: firstValue(l.broj_spojeva, l.brojSpojeva, l.spojevi, l.kas, l.broj_spoja),
      gm2: firstValue(l.gm2, l.gramatura, l.g_m2),
    };
  });
}

function materialLabel(l) {
  const parts = [
    l.vrsta,
    l.oznaka !== '-' ? l.oznaka : '',
    l.debljina !== '-' ? `${l.debljina}µ` : '',
  ].filter(Boolean);
  return parts.join(' ') || '-';
}

function productMainWidth(p, layers) {
  const width = firstValue(p.sir, p.idealna_sirina, p.sirina, layers[0]?.sirina);
  return width === '-' ? '-' : `${width} mm`;
}

const shell = { padding: 22, background: '#f8fafc', minHeight: '100vh', color: '#0f172a' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 8px 22px rgba(15,23,42,.06)' };
const btn = { border: 0, borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' };
const th = { textAlign: 'left', fontSize: 11, color: '#334155', padding: '11px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '.04em' };
const td = { padding: '12px', borderBottom: '1px solid #f1f5f9', fontSize: 13, verticalAlign: 'middle' };
const chip = { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 900, marginRight: 6, marginBottom: 4 };

function LayersTable({ layers }) {
  const rows = layers.length ? layers : [{ sloj: 1, vrsta: '-', pod_vrsta: '-', oznaka: '-', proizvodjac: '-', sirina: '-', spoj_materijala: '-', broj_spojeva: '-' }];
  return <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={th}>Sloj</th>
          <th style={th}>Vrsta materijala</th>
          <th style={th}>Pod vrsta</th>
          <th style={th}>Oznaka</th>
          <th style={th}>Proizvođač</th>
          <th style={th}>Idealna širina</th>
          <th style={th}>Spoj materijala</th>
          <th style={th}>Broj spojeva</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((l, i) => <tr key={i}>
          <td style={td}>{l.sloj}</td>
          <td style={td}><b>{l.vrsta}</b></td>
          <td style={td}>{l.pod_vrsta}</td>
          <td style={td}>{l.oznaka}</td>
          <td style={td}>{l.proizvodjac}</td>
          <td style={td}>{l.sirina !== '-' ? `${l.sirina} mm` : '-'}</td>
          <td style={td}>{l.spoj_materijala}</td>
          <td style={td}>{l.broj_spojeva}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

export default function ListaProizvodaKupci({ msg }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [groupBy, setGroupBy] = useState('kupac');
  const [view, setView] = useState('tabela');
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

  const toggle = (id) => setOpen(o => ({ ...o, [id]: !o[id] }));

  return <div style={shell}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 950, color: '#15803d', letterSpacing: 1 }}>BAZA / KATALOG</div>
        <h1 style={{ margin: '6px 0 4px', fontSize: 30 }}>🗂️ Lista proizvoda po kupcima</h1>
        <div style={{ color: '#475569', fontWeight: 650 }}>Za svaki proizvod: kupac, vrsta materijala, pod vrsta, oznaka, proizvođač, idealna širina, spoj materijala i broj spojeva.</div>
      </div>
      <div style={{ ...card, padding: 6, display: 'flex', gap: 4 }}>
        <button onClick={() => setView('kartice')} style={{ ...btn, background: view === 'kartice' ? '#22c55e' : '#fff', color: view === 'kartice' ? '#fff' : '#0f172a' }}>Kartice</button>
        <button onClick={() => setView('tabela')} style={{ ...btn, background: view === 'tabela' ? '#22c55e' : '#fff', color: view === 'tabela' ? '#fff' : '#0f172a' }}>Tabela</button>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14, marginBottom: 16 }}>
      {[
        ['🏷️', 'Proizvoda', filtered.length, 'aktivnih'],
        ['👥', 'Kupaca', new Set(filtered.map(p=>p.kupac || p.klijent || '-')).size, 'aktivnih'],
        ['🔗', 'Slojeva', allLayers.length, 'ukupno'],
        ['📦', 'Materijala', new Set(allLayers.map(l=>l.vrsta).filter(Boolean)).size, 'ukupno'],
      ].map(([icon,l,v,s]) => <div key={l} style={{ ...card, padding: 18, display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 46, height: 46, borderRadius: 14, background: '#ecfdf5', display: 'grid', placeItems: 'center', fontSize: 22 }}>{icon}</div>
        <div><div style={{ color: '#475569', fontWeight: 800 }}>{l}</div><div style={{ fontSize: 24, fontWeight: 950 }}>{v}</div><div style={{ color: '#64748b', fontSize: 12 }}>{s}</div></div>
      </div>)}
    </div>

    <div style={{ ...card, padding: 14, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="🔍 Pretraga po kupcu, nazivu proizvoda, šifri, materijalu, oznaci, proizvođaču..." style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 14, padding: 13, fontWeight: 700 }} />
      <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 14, padding: 13, fontWeight: 900, background: '#fff' }}><option value="kupac">Grupiši po kupcu</option><option value="tip">Grupiši po tipu</option><option value="materijal">Grupiši po materijalu</option></select>
      <button onClick={() => setQ('')} style={{ ...btn, background: '#f1f5f9' }}>Reset</button>
    </div>

    {loading ? <div style={{ ...card, padding: 30 }}>Učitavanje...</div> : view === 'tabela' ? <div style={{ ...card, overflow: 'hidden', marginBottom: 28 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}></th><th style={th}>Naziv proizvoda</th><th style={th}>Kupac</th><th style={th}>Šifra (SKU)</th><th style={th}>Tip</th><th style={th}>Slojevi</th><th style={th}>Idealna širina</th><th style={th}>Materijali (sastav)</th><th style={th}>Akcije</th></tr></thead>
        <tbody>
          {filtered.map(p => {
            const ls = layersFromProduct(p);
            const isOpen = !!open[p.id];
            return <React.Fragment key={p.id}>
              <tr style={{ background: isOpen ? '#f8fffb' : '#fff', borderLeft: isOpen ? '3px solid #22c55e' : '3px solid transparent' }}>
                <td style={{ ...td, width: 36 }}><button onClick={() => toggle(p.id)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 18 }}>{isOpen ? '⌄' : '›'}</button></td>
                <td style={td}><b style={{ fontSize: 15 }}>{p.naziv || p.proizvod || '-'}</b><div style={{ color: '#64748b', fontSize: 12 }}>ID: {p.id}</div></td>
                <td style={td}>{p.kupac || p.klijent || '-'}</td>
                <td style={td}>{p.sku || p.sifra || '-'}</td>
                <td style={td}><span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 900 }}>{p.tip || p.tip_proizvoda || '-'}</span></td>
                <td style={td}><b>{ls.length}</b></td>
                <td style={td}>{productMainWidth(p, ls)}</td>
                <td style={td}>{ls.map((l,i)=><span key={i} style={chip}>{materialLabel(l)}</span>)}</td>
                <td style={td}><button onClick={() => toggle(p.id)} title="Detalji" style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 10, padding: '8px 10px', cursor: 'pointer' }}>👁</button></td>
              </tr>
              {isOpen && <tr>
                <td style={{ borderBottom: '1px solid #e2e8f0' }}></td>
                <td colSpan={8} style={{ padding: '12px 18px 18px', borderBottom: '1px solid #e2e8f0', background: '#f8fffb' }}>
                  <LayersTable layers={ls} />
                </td>
              </tr>}
            </React.Fragment>;
          })}
        </tbody>
      </table>
      <div style={{ padding: 16, color: '#475569', fontWeight: 800 }}>Ukupno: {filtered.length} proizvoda</div>
    </div> : null}

    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 14px' }}>
      <h2 style={{ margin: 0, fontSize: 20 }}>🧾 Pregled po kupcima</h2>
      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(480px,1fr))', gap: 16 }}>
      {groups.map(([group, arr]) => <div key={group} style={{ ...card, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>🏢 {group}</h2>
          <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 999, padding: '6px 10px', fontWeight: 900, fontSize: 12 }}>{arr.length} proizvod{arr.length === 1 ? '' : 'a'}</span>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {arr.map(p => { const ls = layersFromProduct(p); return <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div><b style={{ fontSize: 16 }}>{p.naziv || p.proizvod || '-'}</b><div style={{ color: '#64748b', fontSize: 13, marginTop: 3 }}>Šifra: {p.sku || p.sifra || '-'} · Idealna širina: {productMainWidth(p, ls)} · Slojeva: {ls.length}</div></div>
              <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 900, height: 22 }}>{p.tip || p.tip_proizvoda || '-'}</span>
            </div>
            <div style={{ margin: '8px 0 12px' }}>{ls.map((l,i)=><span key={i} style={chip}>{materialLabel(l)}</span>)}</div>
            <LayersTable layers={ls} />
          </div>; })}
        </div>
      </div>)}
    </div>
  </div>;
}
