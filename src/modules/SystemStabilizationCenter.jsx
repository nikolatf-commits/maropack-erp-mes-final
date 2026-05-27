import React, { useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';

const REQUIRED_TABLES = [
  'proizvodi', 'materijali', 'ponude', 'nalozi', 'master_nalozi',
  'rolne', 'magacin_promene', 'planovi_rezanja', 'potrosnja_materijala',
  'masine', 'raspored_proizvodnje', 'radnici', 'mes_dogadjaji',
  'qc_kontrole', 'ai_interakcije', 'ai_akcije', 'audit_log'
];

const WORKFLOW_STEPS = [
  { key: 'product', title: 'Baza proizvoda', desc: 'Kupac, šifra, struktura, materijali, template i tehnički podaci.', modules: ['Lista proizvoda', 'Baza proizvoda PRO', 'Template Engine'], risk: 'Dupliranje proizvoda ili nepotpuna struktura materijala.' },
  { key: 'calc', title: 'Kalkulacija', desc: 'Folije, kese i špulne koriste materijale i pravila iz baze.', modules: ['Kalk. folije', 'Kalk. kese', 'Kalk. špulne'], risk: 'Kalkulacija ne sme imati odvojenu logiku od baze materijala.' },
  { key: 'offer', title: 'Ponuda', desc: 'Iz kalkulacije nastaje ponuda sa cenom, marginom i istorijom.', modules: ['Ponude PRO'], risk: 'Potrebno vezati svaku ponudu za kalkulaciju i verziju proizvoda.' },
  { key: 'order', title: 'Nalog', desc: 'Prihvaćena ponuda otvara glavni nalog i operacije.', modules: ['Glavni nalozi', 'Nalozi PRO/MES'], risk: 'Statusi i faze moraju imati jedinstven timeline.' },
  { key: 'warehouse', title: 'Magacin', desc: 'Rezervacija rolni, FIFO, QR, lokacije, ulaz/izlaz.', modules: ['Magacin rolni', 'QR workflow'], risk: 'Plan ne sme skidati metražu bez audit zapisa.' },
  { key: 'cutting', title: 'Plan rezanja', desc: 'Plan koristi stvarne rolne, otpad, ostatak i novu QR etiketu.', modules: ['Planer rezanja', 'Kalkulator matičnih'], risk: 'Ostatak rolne mora uvek dobiti novi identitet/QR.' },
  { key: 'production', title: 'Proizvodnja', desc: 'Mašine, drag/drop raspored, radnici, zastoji, škart.', modules: ['Plan proizvodnje', 'MES tracking'], risk: 'Nalog ne sme preći u završeno bez potrošnje i QC.' },
  { key: 'quality', title: 'Kontrola kvaliteta', desc: 'QC checklist, slike, reklamacije, approval workflow.', modules: ['QC PRO'], risk: 'Bez QC approval-a nema finalnog zaključenja.' },
  { key: 'analysis', title: 'Analiza', desc: 'Potrošnja, profit, otpad, učinak, kupci, mašine.', modules: ['BI/KPI', 'Analiza potrošnje', 'AI Agent'], risk: 'Analitika mora čitati iste tabele kao operativni sistem.' }
];

const STATUS_FLOW = [
  'Kreiran', 'U pripremi', 'Materijal rezervisan', 'Spreman za štampu',
  'Štampa', 'Kaširanje', 'Rezanje', 'Sečenje', 'Kontrola kvaliteta',
  'Završen', 'Isporučen'
];

const css = {
  page: { display: 'grid', gap: 18 },
  header: { background: 'linear-gradient(135deg,#0f172a,#1e3a8a)', color: 'white', borderRadius: 18, padding: 22, boxShadow: '0 18px 45px rgba(15,23,42,.18)' },
  card: { background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, boxShadow: '0 8px 25px rgba(15,23,42,.06)' },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 },
  btn: { border: 'none', borderRadius: 12, padding: '10px 14px', background: '#0f172a', color: 'white', fontWeight: 800, cursor: 'pointer' },
  ghostBtn: { border: '1px solid #cbd5e1', borderRadius: 12, padding: '10px 14px', background: 'white', color: '#0f172a', fontWeight: 800, cursor: 'pointer' },
  badge: { display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '4px 9px', fontSize: 11, fontWeight: 900, border: '1px solid #e2e8f0' },
  label: { fontSize: 11, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: .6 }
};

function safeLen(v) { return Array.isArray(v) ? v.length : 0; }
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

function Kpi({ label, value, tone, sub }) {
  const bg = tone === 'ok' ? '#ecfdf5' : tone === 'warn' ? '#fffbeb' : tone === 'bad' ? '#fef2f2' : '#eff6ff';
  const color = tone === 'ok' ? '#047857' : tone === 'warn' ? '#b45309' : tone === 'bad' ? '#dc2626' : '#1d4ed8';
  return <div style={{ ...css.card, padding: 15, background: bg }}>
    <div style={{ ...css.label, color }}>{label}</div>
    <div style={{ fontSize: 25, fontWeight: 950, color, marginTop: 4 }}>{value}</div>
    <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{sub}</div>
  </div>;
}

function StepCard({ step, index }) {
  return <div style={{ ...css.card, padding: 15 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 12, background: '#0f172a', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{index + 1}</div>
      <div>
        <div style={{ fontWeight: 950, color: '#0f172a' }}>{step.title}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{step.modules.join(' · ')}</div>
      </div>
    </div>
    <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{step.desc}</p>
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 12, padding: 10, fontSize: 12, fontWeight: 700 }}>⚠ {step.risk}</div>
  </div>;
}

function StatusFlow() {
  return <div style={{ ...css.card }}>
    <h3 style={{ marginTop: 0 }}>Profesionalni status flow naloga</h3>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {STATUS_FLOW.map((s, i) => <React.Fragment key={s}>
        <span style={{ ...css.badge, background: i < 3 ? '#eff6ff' : i < 8 ? '#fff7ed' : '#ecfdf5', color: i < 3 ? '#1d4ed8' : i < 8 ? '#c2410c' : '#047857' }}>{s}</span>
        {i < STATUS_FLOW.length - 1 && <span style={{ color: '#94a3b8', fontWeight: 900 }}>→</span>}
      </React.Fragment>)}
    </div>
  </div>;
}

export default function SystemStabilizationCenter({ db = {}, msg }) {
  const [tableResults, setTableResults] = useState([]);
  const [checking, setChecking] = useState(false);
  const [activeTab, setActiveTab] = useState('workflow');

  const stats = useMemo(() => {
    const products = safeLen(db.proizvodi);
    const orders = safeLen(db.nalozi) + safeLen(db.master_nalozi);
    const offers = safeLen(db.ponude);
    const rolls = safeLen(db.rolne) + safeLen(db.magacin);
    const openOrders = Array.isArray(db.nalozi) ? db.nalozi.filter(n => String(n.status || '').toLowerCase() !== 'završeno').length : 0;
    return { products, orders, offers, rolls, openOrders };
  }, [db]);

  async function checkTables() {
    setChecking(true);
    if (!isSupabaseConfigured || !supabase) {
      setTableResults(REQUIRED_TABLES.map(t => ({ table: t, ok: false, note: 'Demo režim / .env nije podešen' })));
      setChecking(false);
      msg && msg('Supabase nije podešen — prikazujem demo proveru tabela.', 'err');
      return;
    }
    const out = [];
    for (const table of REQUIRED_TABLES) {
      try {
        const { error, count } = await supabase.from(table).select('*', { count: 'exact', head: true });
        out.push({ table, ok: !error, count: count ?? 0, note: error ? error.message : 'OK' });
      } catch (e) {
        out.push({ table, ok: false, count: 0, note: e.message });
      }
    }
    setTableResults(out);
    setChecking(false);
    const missing = out.filter(x => !x.ok).length;
    msg && msg(missing ? `Provera završena: fali/problem ${missing} tabela.` : 'Sve ključne tabele su dostupne.');
  }

  const connectedPct = tableResults.length ? pct(tableResults.filter(t => t.ok).length, tableResults.length) : 0;

  return <div style={css.page}>
    <div style={css.header}>
      <div style={{ ...css.label, color: '#bfdbfe' }}>FAZA 7 — stabilizacija i povezivanje sistema</div>
      <h1 style={{ margin: '6px 0 8px', fontSize: 30 }}>ERP/MES kontrolni centar</h1>
      <div style={{ color: '#dbeafe', maxWidth: 980, lineHeight: 1.55 }}>
        Ovaj modul ne dodaje samo novi ekran — služi da proveri da li su baza proizvoda, kalkulacije, ponude, nalozi, magacin, plan rezanja, MES, QC, AI i analiza povezani kao jedan stabilan tok.
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button style={{ ...css.btn, background: 'white', color: '#0f172a' }} onClick={checkTables}>{checking ? 'Proveravam...' : 'Proveri Supabase tabele'}</button>
        <button style={{ ...css.btn, background: '#2563eb' }} onClick={() => setActiveTab('workflow')}>Workflow mapa</button>
        <button style={{ ...css.btn, background: '#475569' }} onClick={() => setActiveTab('checklist')}>Checklist</button>
      </div>
    </div>

    <div style={css.grid4}>
      <Kpi label="Proizvodi" value={stats.products} sub="baza/template" tone="info" />
      <Kpi label="Nalozi" value={stats.orders} sub={`${stats.openOrders} otvoreno`} tone="warn" />
      <Kpi label="Ponude" value={stats.offers} sub="komercijala" tone="info" />
      <Kpi label="Rolne / magacin" value={stats.rolls} sub="stanje materijala" tone="ok" />
      <Kpi label="Povezanost tabela" value={tableResults.length ? `${connectedPct}%` : '—'} sub="Supabase check" tone={connectedPct > 80 ? 'ok' : connectedPct ? 'warn' : 'info'} />
    </div>

    <div style={{ ...css.card, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {[
        ['workflow', '🔗 Workflow'], ['tables', '🗄️ Tabele'], ['checklist', '✅ Stabilizacija'], ['rules', '🧱 Pravila sistema']
      ].map(([key, label]) => <button key={key} onClick={() => setActiveTab(key)} style={activeTab === key ? css.btn : css.ghostBtn}>{label}</button>)}
    </div>

    {activeTab === 'workflow' && <>
      <StatusFlow />
      <div style={css.grid2}>{WORKFLOW_STEPS.map((s, i) => <StepCard key={s.key} step={s} index={i} />)}</div>
    </>}

    {activeTab === 'tables' && <div style={css.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Supabase tabele — health check</h3>
        <button style={css.btn} onClick={checkTables}>{checking ? 'Proveravam...' : 'Pokreni proveru'}</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f8fafc' }}><th style={{ textAlign: 'left', padding: 10 }}>Tabela</th><th style={{ textAlign: 'left', padding: 10 }}>Status</th><th style={{ textAlign: 'right', padding: 10 }}>Redova</th><th style={{ textAlign: 'left', padding: 10 }}>Napomena</th></tr></thead>
          <tbody>{(tableResults.length ? tableResults : REQUIRED_TABLES.map(t => ({ table: t, ok: null, count: '—', note: 'Nije provereno' }))).map(r => <tr key={r.table} style={{ borderTop: '1px solid #e2e8f0' }}>
            <td style={{ padding: 10, fontWeight: 800 }}>{r.table}</td>
            <td style={{ padding: 10 }}><span style={{ ...css.badge, background: r.ok === true ? '#ecfdf5' : r.ok === false ? '#fef2f2' : '#f8fafc', color: r.ok === true ? '#047857' : r.ok === false ? '#dc2626' : '#64748b' }}>{r.ok === true ? 'OK' : r.ok === false ? 'Problem' : 'Čeka'}</span></td>
            <td style={{ padding: 10, textAlign: 'right', fontWeight: 800 }}>{r.count ?? '—'}</td>
            <td style={{ padding: 10, color: '#64748b' }}>{r.note}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}

    {activeTab === 'checklist' && <div style={css.grid2}>
      {[
        ['Jedan izvor istine', 'Proizvod, materijal, nalog i rolna ne smeju imati paralelne stare strukture.'],
        ['Prihvati plan', 'Svaki plan rezanja mora imati potvrdu, skidanje metraže, ostatak i audit log.'],
        ['Status timeline', 'Svaka promena statusa naloga mora upisati vreme, korisnika i razlog.'],
        ['QR traceability', 'Svaka rolna, ostatak, mašina i radnik moraju biti skenirljivi.'],
        ['QC gate', 'Nalog ne može u završeno bez kontrole kvaliteta ili ovlašćenog override-a.'],
        ['AI kao predlog', 'AI predlaže akciju, a korisnik potvrđuje pre izmene baze.'],
        ['Backup', 'Pre brisanja ili masovne izmene mora postojati export/backup.'],
        ['Performance', 'Teški moduli treba da idu lazy-load, velike tabele virtualizovati.']
      ].map(([a,b]) => <div key={a} style={css.card}><h3 style={{ marginTop: 0 }}>{a}</h3><p style={{ color: '#475569', lineHeight: 1.5 }}>{b}</p></div>)}
    </div>}

    {activeTab === 'rules' && <div style={css.card}>
      <h3 style={{ marginTop: 0 }}>Obavezna pravila profesionalnog sistema</h3>
      <ol style={{ lineHeight: 1.9, color: '#334155', fontWeight: 650 }}>
        <li>Ne postoje dva aktivna magacina — jedan modul je glavni.</li>
        <li>Planer rezanja koristi samo stvarne rolne iz magacina ili jasno označene demo podatke.</li>
        <li>Svaki ostatak rolne dobija novi broj, QR, lokaciju i vezu ka originalnoj rolni.</li>
        <li>Svaka potrošnja materijala vezuje se za nalog, proizvod, kupca, radnika i mašinu.</li>
        <li>AI ne sme sam brisati ili menjati stanje bez potvrde korisnika.</li>
        <li>Svaki modul koji piše u bazu mora imati fallback i poruku ako Supabase tabela ne postoji.</li>
      </ol>
    </div>}
  </div>;
}
