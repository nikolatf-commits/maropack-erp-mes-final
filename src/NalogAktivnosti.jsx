import React, { useState, useEffect } from "react";
import { MaterialText } from './components/MaterialSelectorPRO.jsx';
import { supabase } from "./supabase.js";

export default function NalogAktivnosti({ nalog, onClose }) {
  const [aktivnosti, setAktivnosti] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAktivnosti(); }, [nalog?.id]);

  async function loadAktivnosti() {
    if (!nalog?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('nalog_aktivnosti').select('*').eq('nalog_id', nalog.id).order('created_at', { ascending: false });
      if (error) throw error;
      setAktivnosti(data || []);
    } catch (e) { console.error('Greška:', e); }
    setLoading(false);
  }

  if (!nalog) return null;

  const ukupnoUradjeno = nalog.uradjeno || 0;
  const progres = Math.min(100, Math.round((ukupnoUradjeno / nalog.kol) * 100));
  const brRadnika = new Set(aktivnosti.map(a => a.radnik_ime)).size;

  const AKCIJA_EMOJI = { 'start': '▶️', 'pauza': '⏸️', 'nastavi': '▶️', 'zavrsi': '⏹️' };
  const AKCIJA_LABEL = { 'start': 'Počeo rad', 'pauza': 'Pauza', 'nastavi': 'Nastavio rad', 'zavrsi': 'Završio smenu' };

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, maxWidth: 800, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background: '#1d4ed8', color: '#fff', padding: 24, borderRadius: '16px 16px 0 0', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 4 }}>📊 Istorija aktivnosti</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{nalog.ponbr}</div>
              <div style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>{nalog.prod}</div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: 18, fontSize: 20, cursor: 'pointer' }}>✕</button>
          </div>
        </div>
        <div style={{ padding: 24, borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Naručeno: {nalog.kol.toLocaleString()}m</div>
          <div style={{ background: '#e2e8f0', borderRadius: 8, height: 32, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ background: progres >= 100 ? '#059669' : '#1d4ed8', height: '100%', width: progres + '%', transition: 'width 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 }}>{progres}%</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ color: '#059669', fontWeight: 700 }}>✅ Urađeno: {ukupnoUradjeno.toLocaleString()}m</span>
            <span style={{ color: '#64748b' }}>Ostalo: {(nalog.kol - ukupnoUradjeno).toLocaleString()}m</span>
          </div>
        </div>
        <div style={{ padding: 24, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 12 }}>💡 STATISTIKA:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Broj aktivnosti</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#1d4ed8' }}>{aktivnosti.length}</div>
            </div>
            <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Broj radnika</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>{brRadnika}</div>
            </div>
            <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Status</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: progres >= 100 ? '#059669' : '#1d4ed8' }}>{progres >= 100 ? '✅ Završeno' : '🔄 U radu'}</div>
            </div>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>📜 ISTORIJA AKTIVNOSTI:</div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}><div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div><div>Učitavam...</div></div>
          ) : aktivnosti.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}><div style={{ fontSize: 32, marginBottom: 8 }}>📭</div><div>Nema aktivnosti</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {aktivnosti.map((a, idx) => (
                <div key={a.id || idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 24 }}>{AKCIJA_EMOJI[a.akcija] || '📌'}</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{a.radnik_ime}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{formatDate(a.created_at)}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '4px 12px', borderRadius: 12 }}>{AKCIJA_LABEL[a.akcija] || a.akcija}</div>
                  </div>
                  {a.kolicina > 0 && <div style={{ fontSize: 13, color: '#059669', fontWeight: 700, marginTop: 8 }}>✓ Urađeno: {a.kolicina.toLocaleString()}m</div>}
                  {a.razlog_pauze && <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 8, background: '#fef3c7', padding: 8, borderRadius: 6 }}>⚠️ Razlog pauze: {a.razlog_pauze}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: 24, borderTop: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: '0 0 16px 16px' }}>
          <button onClick={onClose} style={{ width: '100%', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Zatvori</button>
        </div>
      </div>
    </div>
  );
}

// V47_NALOG_FULL_MATERIAL_NAME: nalozi treba da prikazuju pun naziv materijala: VRSTA + OZNAKA + DEBLJINA, npr. BOPP FXCB 20µ.
