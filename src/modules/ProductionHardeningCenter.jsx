import React, { useMemo, useState } from 'react';

const CARD = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 18, boxShadow: '0 10px 24px rgba(15,23,42,.06)' };
const BTN = { border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' };

const coreChecks = [
  { area: 'Baza', check: 'Sve ključne tabele imaju primary key, created_at, updated_at', status: 'ready', risk: 'Nizak' },
  { area: 'Baza', check: 'Foreign key veze za naloge, rolne, planove, radnike i mašine', status: 'action', risk: 'Srednji' },
  { area: 'RLS', check: 'Role: admin, planer, operater, magacioner, qc, menadzer', status: 'ready', risk: 'Nizak' },
  { area: 'RLS', check: 'Operater vidi samo proizvodnju i svoje sesije', status: 'action', risk: 'Srednji' },
  { area: 'Workflow', check: 'Statusi naloga imaju dozvoljene prelaze', status: 'ready', risk: 'Nizak' },
  { area: 'Magacin', check: 'Skidanje metraže u transakciji + log promene', status: 'ready', risk: 'Nizak' },
  { area: 'QR', check: 'Ostatak rolne dobija novi QR i parent_roll_id', status: 'ready', risk: 'Nizak' },
  { area: 'AI', check: 'AI predlozi se ne izvršavaju bez potvrde korisnika', status: 'ready', risk: 'Nizak' },
  { area: 'Performance', check: 'Veliki moduli treba lazy loading / code splitting', status: 'action', risk: 'Srednji' },
  { area: 'Backup', check: 'Dnevni export + restore procedura', status: 'action', risk: 'Visok' }
];

const migrations = [
  '001_core_tables.sql',
  '002_workflow_statuses.sql',
  '003_machines_scheduler.sql',
  '004_mes_tracking_qc.sql',
  '005_ai_agent.sql',
  '006_permissions_audit_backup.sql',
  '007_indexes_constraints_rls.sql',
  '008_storage_buckets.sql'
];

const modules = [
  { name: 'Baza proizvoda', tables: ['proizvodi', 'product_templates', 'materijali'], status: 92 },
  { name: 'Kalkulacije', tables: ['kalkulacije_folije', 'kalkulacije_kese', 'kalkulacije_spulne'], status: 88 },
  { name: 'Nalozi', tables: ['nalozi', 'master_nalozi', 'nalog_status_log'], status: 90 },
  { name: 'Magacin', tables: ['rolne', 'magacin_promene', 'rezervacije_rolni'], status: 91 },
  { name: 'Plan rezanja', tables: ['planovi_rezanja', 'plan_rezanja_stavke'], status: 89 },
  { name: 'MES', tables: ['radnici', 'mes_dogadjaji', 'production_sessions'], status: 84 },
  { name: 'QC', tables: ['qc_kontrole', 'qc_checklist', 'reklamacije'], status: 82 },
  { name: 'AI', tables: ['ai_interakcije', 'ai_akcije', 'ai_agent_memorija'], status: 86 },
  { name: 'Audit/Backup', tables: ['audit_log', 'backup_snapshots'], status: 78 }
];

const statusColor = (s) => s === 'ready' ? '#16a34a' : s === 'action' ? '#f59e0b' : '#64748b';

function Badge({ children, color }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 900, color, background: `${color}18`, border: `1px solid ${color}33` }}>{children}</span>;
}

function Progress({ value }) {
  const color = value >= 90 ? '#16a34a' : value >= 80 ? '#2563eb' : '#f59e0b';
  return <div style={{ height: 10, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 999 }} /></div>;
}

function SqlBlock() {
  const sql = `-- MAROPACK FAZA 11: production hardening / RLS / indexes\n\ncreate table if not exists public.nalog_status_log (\n  id uuid primary key default gen_random_uuid(),\n  nalog_id uuid,\n  old_status text,\n  new_status text not null,\n  changed_by uuid,\n  note text,\n  created_at timestamptz not null default now()\n);\n\ncreate table if not exists public.system_health_checks (\n  id uuid primary key default gen_random_uuid(),\n  area text not null,\n  check_name text not null,\n  status text not null default 'pending',\n  risk_level text default 'medium',\n  details jsonb default '{}'::jsonb,\n  created_at timestamptz not null default now()\n);\n\ncreate index if not exists idx_rolne_status on public.rolne(status);\ncreate index if not exists idx_rolne_materijal_sirina on public.rolne(materijal, sirina);\ncreate index if not exists idx_nalozi_status on public.nalozi(status);\ncreate index if not exists idx_planovi_rezanja_nalog on public.planovi_rezanja(nalog_id);\ncreate index if not exists idx_mes_dogadjaji_nalog on public.mes_dogadjaji(nalog_id);\n\nalter table public.nalog_status_log enable row level security;\nalter table public.system_health_checks enable row level security;\n\ndo $$ begin\n  create policy "read status log authenticated" on public.nalog_status_log for select to authenticated using (true);\nexception when duplicate_object then null; end $$;\n\ndo $$ begin\n  create policy "insert status log authenticated" on public.nalog_status_log for insert to authenticated with check (true);\nexception when duplicate_object then null; end $$;`;
  return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', background: '#0f172a', color: '#dbeafe', borderRadius: 16, padding: 16, fontSize: 12, lineHeight: 1.5, maxHeight: 380, overflow: 'auto' }}>{sql}</pre>;
}

export default function ProductionHardeningCenter({ msg }) {
  const [tab, setTab] = useState('overview');
  const summary = useMemo(() => {
    const ready = coreChecks.filter(x => x.status === 'ready').length;
    return { ready, total: coreChecks.length, percent: Math.round((ready / coreChecks.length) * 100) };
  }, []);

  const tabs = [
    ['overview', 'Pregled'],
    ['migrations', 'Migracije / SQL'],
    ['rls', 'RLS + prava'],
    ['performance', 'Performance'],
    ['testing', 'Test plan']
  ];

  return <div style={{ padding: 24, background: '#f8fafc', minHeight: '100vh' }}>
    <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a8a)', color: '#fff', borderRadius: 24, padding: 26, boxShadow: '0 18px 45px rgba(15,23,42,.24)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 900, color: '#bfdbfe' }}>FAZA 11</div>
            <h1 style={{ margin: '6px 0 8px', fontSize: 32, fontWeight: 1000 }}>Production Hardening Center</h1>
            <p style={{ margin: 0, color: '#dbeafe', maxWidth: 760 }}>Kontrolni centar za finalnu stabilizaciju: migracije, RLS, indeksi, workflow pravila, performance i test plan pre realne proizvodnje.</p>
          </div>
          <div style={{ minWidth: 210, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 20, padding: 18 }}>
            <div style={{ fontSize: 12, color: '#bfdbfe', fontWeight: 900 }}>Production readiness</div>
            <div style={{ fontSize: 42, fontWeight: 1000 }}>{summary.percent}%</div>
            <div style={{ color: '#dbeafe', fontSize: 13 }}>{summary.ready}/{summary.total} ključnih provera spremno</div>
          </div>
        </div>
      </div>

      <div style={{ ...CARD, display: 'flex', gap: 8, flexWrap: 'wrap', padding: 10 }}>
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ ...BTN, background: tab === k ? '#1d4ed8' : '#eff6ff', color: tab === k ? '#fff' : '#1d4ed8' }}>{l}</button>)}
      </div>

      {tab === 'overview' && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {[['Moduli', modules.length], ['Migracije', migrations.length], ['RLS pravila', '6+'], ['Rizici za proveru', coreChecks.filter(x => x.status === 'action').length]].map(([a,b]) => <div key={a} style={CARD}><div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{a}</div><div style={{ fontSize: 30, fontWeight: 1000, marginTop: 6 }}>{b}</div></div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 18 }}>
          <div style={CARD}>
            <h2 style={{ marginTop: 0 }}>Ključne production provere</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {coreChecks.map((c, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px 90px', gap: 12, alignItems: 'center', padding: 12, background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                <b>{c.area}</b><span>{c.check}</span><Badge color={statusColor(c.status)}>{c.status === 'ready' ? 'Spremno' : 'Proveriti'}</Badge><span style={{ fontSize: 12, fontWeight: 900, color: c.risk === 'Visok' ? '#dc2626' : c.risk === 'Srednji' ? '#f59e0b' : '#16a34a' }}>{c.risk}</span>
              </div>)}
            </div>
          </div>
          <div style={CARD}>
            <h2 style={{ marginTop: 0 }}>Status modula</h2>
            <div style={{ display: 'grid', gap: 14 }}>
              {modules.map(m => <div key={m.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><b>{m.name}</b><span style={{ fontWeight: 900 }}>{m.status}%</span></div>
                <Progress value={m.status} />
                <div style={{ marginTop: 6, color: '#64748b', fontSize: 12 }}>{m.tables.join(' · ')}</div>
              </div>)}
            </div>
          </div>
        </div>
      </>}

      {tab === 'migrations' && <div style={{ display: 'grid', gridTemplateColumns: '.8fr 1.2fr', gap: 18 }}>
        <div style={CARD}>
          <h2 style={{ marginTop: 0 }}>Redosled migracija</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {migrations.map((m, i) => <div key={m} style={{ padding: 12, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', gap: 10 }}><b>{String(i+1).padStart(2,'0')}</b><span>{m}</span></div>)}
          </div>
          <button style={{ ...BTN, marginTop: 14 }} onClick={() => msg?.('SQL kopiraj u Supabase SQL editor i pokreni po redosledu.')}>Kako pokrenuti SQL</button>
        </div>
        <div style={CARD}><h2 style={{ marginTop: 0 }}>SQL hardening dodatak</h2><SqlBlock /></div>
      </div>}

      {tab === 'rls' && <div style={CARD}>
        <h2 style={{ marginTop: 0 }}>RLS matrica prava</h2>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}><thead><tr style={{ background: '#f1f5f9' }}>{['Rola','Proizvodi','Nalozi','Magacin','MES','QC','AI','Sistem'].map(h => <th key={h} style={{ textAlign: 'left', padding: 12 }}>{h}</th>)}</tr></thead><tbody>{[
          ['Admin','CRUD','CRUD','CRUD','CRUD','CRUD','CRUD','CRUD'],
          ['Planer','R','CRUD','R/U','R/U','R','R/U','R'],
          ['Magacioner','R','R','CRUD','R','R','R','-'],
          ['Operater','R','R','R','CRUD sopstveno','R/U','R','-'],
          ['QC','R','R','R','R','CRUD','R/U','R'],
          ['Menadžer','R','R','R','R','R','R','R']
        ].map(row => <tr key={row[0]} style={{ borderTop: '1px solid #e2e8f0' }}>{row.map((c, i) => <td key={i} style={{ padding: 12, fontWeight: i === 0 ? 900 : 600 }}>{c}</td>)}</tr>)}</tbody></table></div>
      </div>}

      {tab === 'performance' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
        {[
          ['Lazy loading', 'Velike module učitavati tek kad korisnik klikne meni. Smanjuje početni bundle.'],
          ['Virtual tables', 'Magacin, nalozi i istorija sa 1000+ redova moraju imati virtualizaciju.'],
          ['Realtime filter', 'Realtime slušati samo aktivne naloge i relevantne tabele.'],
          ['Cache', 'Materijali, mašine i šifre proizvoda mogu biti lokalno keširani.'],
          ['Memoization', 'Kalkulacije i plan rezanja ne računati ponovo bez promene inputa.'],
          ['Error boundary', 'Greška jednog modula ne sme da sruši celu aplikaciju.']
        ].map(([h,p]) => <div key={h} style={CARD}><h3 style={{ marginTop: 0 }}>{h}</h3><p style={{ color: '#475569', lineHeight: 1.5 }}>{p}</p></div>)}
      </div>}

      {tab === 'testing' && <div style={CARD}>
        <h2 style={{ marginTop: 0 }}>Test plan pre puštanja u proizvodnju</h2>
        <ol style={{ display: 'grid', gap: 10, lineHeight: 1.6 }}>
          <li>Ubaci 20 stvarnih rolni u magacin sa QR kodovima.</li>
          <li>Napravi 5 proizvoda za 3 kupca sa realnim materijalima.</li>
          <li>Napravi kalkulaciju → ponudu → nalog.</li>
          <li>Rezerviši materijal i napravi plan rezanja.</li>
          <li>Prihvati plan i proveri skidanje metraže + QR ostatka.</li>
          <li>Pokreni MES sesiju radnika na mašini.</li>
          <li>Upiši zastoj, škart i završenu količinu.</li>
          <li>Uradi QC kontrolu i zaključi nalog.</li>
          <li>Proveri analizu potrošnje i otpad po širini.</li>
          <li>Proveri audit log i backup export.</li>
        </ol>
      </div>}
    </div>
  </div>;
}
