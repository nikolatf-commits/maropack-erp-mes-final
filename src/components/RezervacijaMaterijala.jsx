import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function RezervacijaMaterijala({ nalogId, materijali, onRezervisano }) {
  const [rolne, setRolne] = useState([]);
  const [loading, setLoading] = useState(false);

  async function rezervisi(rolnaId, kolicina) {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('rezervisi_materijal', {
        p_rolna_id: rolnaId,
        p_kolicina_m: kolicina,
        p_nalog_id: nalogId
      });

      if (error) throw error;

      if (data && data.success) {
        alert('Materijal rezervisan!');
        if (onRezervisano) onRezervisano();
        loadRolne();
      } else {
        alert(data.error || 'Greška pri rezervaciji');
      }
    } catch (err) {
      alert('Greška: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRolne() {
    try {
      const { data, error } = await supabase
        .from('magacin')
        .select('*')
        .neq('status', 'Iskorišćeno')
        .order('tip', { ascending: true });

      if (error) throw error;
      setRolne(data || []);
    } catch (err) {
      console.error('Error loading rolne:', err);
    }
  }

  useEffect(() => {
    loadRolne();
  }, []);

  if (!materijali || materijali.length === 0) return null;

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', marginTop: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>📦 Rezervacija materijala</h3>
      
      <div style={{ display: 'grid', gap: 12 }}>
        {materijali.map((mat, i) => {
          const dostupneRolne = rolne.filter(r => 
            r.tip === mat.tip && 
            r.debljina === mat.deb && 
            (r.metraza_ost - (r.rezervisano || 0)) > 0
          );

          return (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                {mat.tip} {mat.deb}µ
              </div>
              
              {dostupneRolne.length === 0 ? (
                <div style={{ color: '#ef4444', fontSize: 13 }}>⚠️ Nema dostupnih rolni</div>
              ) : (
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  {dostupneRolne.length} dostupnih rolni
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
