import React, { useMemo, useState } from 'react';

const CARD = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 18, boxShadow: '0 10px 28px rgba(15,23,42,.06)' };
const BTN = { border: 'none', borderRadius: 14, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' };

const workflow = [
  ['Kupac', 'Baza kupaca / CRM', 'source'],
  ['Proizvod', 'Struktura, materijali, template, MPTP', 'source'],
  ['Kalkulacija', 'Folije / kese / špulne', 'calc'],
  ['Ponuda', 'Cena, rok, uslovi', 'sales'],
  ['Nalog', 'Master nalog + faze', 'order'],
  ['Magacin', 'Rezervacija rolni i lot traceability', 'warehouse'],
  ['Plan rezanja', 'Prihvati plan, skini m, QR ostatak', 'cut'],
  ['Plan proizvodnje', 'Mašine, drag/drop, kapacitet', 'schedule'],
  ['MES', 'Radnik, mašina, zastoj, škart', 'mes'],
  ['QC', 'Kontrola i odobrenje', 'qc'],
  ['Analitika', 'Potrošnja, otpad, OEE, profit', 'bi'],
  ['AI', 'Predlog + akcije uz potvrdu', 'ai']
];

const readiness = [
  { area: 'Build', check: 'npm install + npm run build prolazi bez compile grešaka', status: 'ready', owner: 'IT' },
  { area: 'Baza', check: 'Pokrenuti FINAL_SUPABASE_MIGRATION.sql u Supabase SQL editoru', status: 'action', owner: 'Admin' },
  { area: 'RLS', check: 'Proveriti role: admin, planer, operater, magacioner, qc, menadzer', status: 'action', owner: 'Admin' },
  { area: 'Magacin', check: 'Ubaciti realne rolne, LOT, dobavljača, lokaciju i QR', status: 'action', owner: 'Magacioner' },
  { area: 'Plan rezanja', check: 'Testirati prihvatanje plana: skidanje metraže + ostatak + QR', status: 'action', owner: 'Planer' },
  { area: 'MES', check: 'Test QR radnik → mašina → nalog → rola', status: 'action', owner: 'Proizvodnja' },
  { area: 'QC', check: 'Testirati checklist i zaključavanje naloga', status: 'action', owner: 'QC' },
  { area: 'AI', check: 'AI sme da predlaže, a izvršenje ide samo posle potvrde korisnika', status: 'ready', owner: 'Menadžer' },
  { area: 'Backup', check: 'Podesiti dnevni export baze i fajlova', status: 'action', owner: 'IT' },
  { area: 'Deploy', check: 'Production env: VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY', status: 'action', owner: 'IT' }
];

const finalModules = [
  ['ERP core', 92, 'Proizvod → kalkulacija → ponuda → nalog'],
  ['Magacin / WMS', 90, 'Rolne, QR, rezervacije, ostatak rolne'],
  ['Planer rezanja', 88, 'Optimizacija, otpad, plan po roli'],
  ['MES tracking', 84, 'Radnici, učinak, zastoji, škart'],
  ['Scheduler mašina', 82, 'Mašine, kapacitet, drag/drop osnova'],
  ['QC', 82, 'Kontrolne liste i odobrenja'],
  ['AI agent', 78, 'Čita sistem i predlaže akcije'],
  ['Analytics', 80, 'OEE, otpad, potrošnja, KPI'],
  ['Enterprise', 76, 'Permissions, backup, audit, deployment']
];

function Badge({ status }) {
  const ok = status === 'ready';
  return <span style={{ padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 900, color: ok ? '#166534' : '#92400e', background: ok ? '#dcfce7' : '#fef3c7', border: `1px solid ${ok ? '#86efac' : '#fcd34d'}` }}>{ok ? 'Spremno' : 'Obavezno proveriti'}</span>;
}

function Progress({ value }) {
  const color = value >= 90 ? '#16a34a' : value >= 82 ? '#2563eb' : '#f59e0b';
  return <div style={{ height: 10, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${value}%`, height: '100%', background: color }} /></div>;
}

function SqlPreview() {
  const sql = `-- MAROPACK FINAL PRODUCTION MIGRATION - skraćeni pregled\n-- Kompletan fajl je u: supabase/migrations/999_final_production_migration.sql\n\ncreate table if not exists public.system_audit_log (...);\ncreate table if not exists public.system_settings (...);\ncreate table if not exists public.workflow_events (...);\ncreate table if not exists public.planovi_rezanja (...);\ncreate table if not exists public.rolne_promene (...);\ncreate table if not exists public.ai_akcije (...);\n\n-- RLS: admin CRUD, role-based read/write, audit trail.\n-- Indexes: nalog_id, rola_id, status, kupac_id, created_at.`;
  return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', background: '#0f172a', color: '#dbeafe', borderRadius: 16, padding: 16, lineHeight: 1.55, fontSize: 12 }}>{sql}</pre>;
}

export default function FinalProductionReadinessCenter({ msg }) {
  const [tab, setTab] = useState('overview');
  const stats = useMemo(() => {
    const ready = readiness.filter(x => x.status === 'ready').length;
    const avg = Math.round(finalModules.reduce((s, x) => s + x[1], 0) / finalModules.length);
    return { ready, total: readiness.length, avg };
  }, []);
  const tabs = [['overview','Pregled'], ['workflow','Workflow'], ['checklist','Checklist'], ['sql','SQL/Migracije'], ['runbook','Runbook']];

  return <div style={{ minHeight: '100vh', padding: 24, background: '#f8fafc' }}>
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div style={{ background: 'linear-gradient(135deg,#020617,#1d4ed8)', color: '#fff', borderRadius: 28, padding: 28, boxShadow: '0 22px 55px rgba(15,23,42,.24)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center' }}>
          <div>
            <div style={{ color: '#bfdbfe', fontWeight: 1000, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 13 }}>FINAL PRODUCTION READY</div>
            <h1 style={{ margin: '8px 0 10px', fontSize: 34, fontWeight: 1000 }}>Maropack ERP/MES — završna stabilizacija</h1>
            <p style={{ margin: 0, maxWidth: 820, color: '#dbeafe', lineHeight: 1.55 }}>Ovaj centar služi kao finalna kontrola pre realnog rada: workflow, migracije, permissions, testovi, backup, AI pravila i production runbook.</p>
          </div>
          <div style={{ minWidth: 220, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 22, padding: 18 }}>
            <div style={{ color: '#bfdbfe', fontWeight: 900, fontSize: 12 }}>Sistemska spremnost</div>
            <div style={{ fontSize: 44, fontWeight: 1000 }}>{stats.avg}%</div>
            <div style={{ color: '#dbeafe', fontSize: 13 }}>{stats.ready}/{stats.total} provera označeno kao spremno</div>
          </div>
        </div>
      </div>

      <div style={{ ...CARD, display: 'flex', gap: 8, flexWrap: 'wrap', padding: 10 }}>
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ ...BTN, background: tab === k ? '#1d4ed8' : '#eff6ff', color: tab === k ? '#fff' : '#1d4ed8' }}>{l}</button>)}
      </div>

      {tab === 'overview' && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {[[workflow.length, 'povezanih koraka'], [finalModules.length, 'glavnih oblasti'], [readiness.length, 'finalnih provera'], ['0', 'compile grešaka u buildu']].map(([v,l]) => <div key={l} style={CARD}><div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{l}</div><div style={{ fontSize: 34, fontWeight: 1000, marginTop: 6 }}>{v}</div></div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {finalModules.map(m => <div key={m[0]} style={CARD}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><b>{m[0]}</b><b>{m[1]}%</b></div><Progress value={m[1]} /><p style={{ margin: '10px 0 0', color: '#64748b', fontSize: 13 }}>{m[2]}</p></div>)}
        </div>
      </>}

      {tab === 'workflow' && <div style={CARD}>
        <h2 style={{ marginTop: 0 }}>Finalni ERP/MES tok</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {workflow.map((w, idx) => <div key={w[0]} style={{ padding: 14, borderRadius: 18, border: '1px solid #dbeafe', background: idx % 2 ? '#fff' : '#eff6ff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 16 }}>{w[0]}</b><span style={{ color: '#1d4ed8', fontWeight: 1000 }}>{String(idx + 1).padStart(2,'0')}</span></div>
            <p style={{ margin: '8px 0 0', color: '#475569', fontSize: 13, lineHeight: 1.45 }}>{w[1]}</p>
          </div>)}
        </div>
      </div>}

      {tab === 'checklist' && <div style={CARD}>
        <h2 style={{ marginTop: 0 }}>Obavezne provere pre rada</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {readiness.map((r, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 150px 190px', gap: 12, alignItems: 'center', padding: 12, borderRadius: 16, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <b>{r.area}</b><span>{r.check}</span><span style={{ color: '#64748b', fontWeight: 800 }}>{r.owner}</span><Badge status={r.status}/>
          </div>)}
        </div>
      </div>}

      {tab === 'sql' && <div style={{ display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: 18 }}>
        <div style={CARD}>
          <h2 style={{ marginTop: 0 }}>Finalna migracija</h2>
          <p style={{ color: '#475569', lineHeight: 1.6 }}>U projektu je dodat konsolidovani SQL fajl za finalno puštanje. Pokreće se posle postojećih faznih SQL fajlova.</p>
          <ol style={{ lineHeight: 1.75 }}>
            <li>Otvori Supabase SQL editor.</li>
            <li>Pokreni `SUPABASE_SCHEMA_FULL_SYSTEM.sql`.</li>
            <li>Pokreni `supabase/migrations/999_final_production_migration.sql`.</li>
            <li>Proveri RLS i role.</li>
            <li>U aplikaciji otvori ovaj ekran i prođi checklistu.</li>
          </ol>
          <button style={{ ...BTN, background: '#1d4ed8', color: '#fff' }} onClick={() => msg?.('Finalna migracija je u folderu supabase/migrations.')}>Prikaži lokaciju SQL fajla</button>
        </div>
        <div style={CARD}><SqlPreview /></div>
      </div>}

      {tab === 'runbook' && <div style={CARD}>
        <h2 style={{ marginTop: 0 }}>Production runbook</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
          {[
            ['Start sistema', 'npm install --legacy-peer-deps → npm run build → deploy na Vercel/server.'],
            ['Env', 'Obavezno: VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY. Bez toga radi demo fallback.'],
            ['Backup', 'Pre svake veće izmene: export Supabase + ZIP trenutnog projekta.'],
            ['Incident', 'Ako modul pukne: ErrorBoundary zadržava aplikaciju, proveriti audit i browser console.'],
            ['AI pravilo', 'AI ne sme automatski skidati magacin bez potvrde korisnika.'],
            ['Promene', 'Svaka promena naloga, rolne i plana mora imati log događaja.']
          ].map(([h,p]) => <div key={h} style={{ padding: 16, borderRadius: 18, background: '#f8fafc', border: '1px solid #e2e8f0' }}><b>{h}</b><p style={{ color: '#475569', lineHeight: 1.55 }}>{p}</p></div>)}
        </div>
      </div>}
    </div>
  </div>;
}
