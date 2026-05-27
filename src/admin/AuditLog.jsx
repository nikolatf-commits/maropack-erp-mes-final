import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTable, setFilterTable] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    try {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filterTable) query = query.eq('table_name', filterTable);
      if (filterUser) query = query.eq('user_email', filterUser);
      if (filterAction) query = query.eq('action', filterAction);

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error loading audit log:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, [filterTable, filterUser, filterAction]);

  const tables = [...new Set(logs.map(l => l.table_name))];
  const users = [...new Set(logs.map(l => l.user_email).filter(Boolean))];

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#64748b' }}>Učitavanje audit log-a...</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>📜 Audit Log</h2>
        <div style={{ fontSize: 13, color: '#64748b' }}>{logs.length} izmena</div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={filterTable}
            onChange={(e) => setFilterTable(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
          >
            <option value=''>Sve tabele</option>
            {tables.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
          >
            <option value=''>Svi korisnici</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>

          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
          >
            <option value=''>Sve akcije</option>
            <option value='INSERT'>INSERT</option>
            <option value='UPDATE'>UPDATE</option>
            <option value='DELETE'>DELETE</option>
          </select>

          {(filterTable || filterUser || filterAction) && (
            <button
              onClick={() => { setFilterTable(''); setFilterUser(''); setFilterAction(''); }}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}
            >
              ✕ Reset
            </button>
          )}
        </div>
      </div>

      {logs.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94a3b8', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📜</div>
          <div>Nema log unosa</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Vreme</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Tabela</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Akcija</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Korisnik</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Izmene</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>
                    {new Date(log.created_at).toLocaleString('sr-RS')}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{log.table_name}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: log.action === 'INSERT' ? '#dcfce7' : log.action === 'DELETE' ? '#fee2e2' : '#dbeafe',
                      color: log.action === 'INSERT' ? '#166534' : log.action === 'DELETE' ? '#991b1b' : '#1e40af',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontWeight: 700,
                      fontSize: 11
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>
                    {log.user_email || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>
                    {log.action === 'INSERT' && '➕ Novi unos'}
                    {log.action === 'DELETE' && '🗑️ Obrisano'}
                    {log.action === 'UPDATE' && '✏️ Izmenjeno'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
