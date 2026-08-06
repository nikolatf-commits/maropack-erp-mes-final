import React from 'react';
import { MaterialText } from './components/MaterialSelectorPRO.jsx';
import CrtezKese, { kesaToConfig } from './CrtezKese.jsx';

const DNO_LABEL = { ravno: 'Ravno', faltna: 'Faltna dno', naht: 'Var na dnu', kreuz: 'Ukršteno dno' };

export default function NalogCrtez_Kesa({ nalog }) {
  const { 
    ponBr = 'MP-2026-XXXX', 
    kupac = '', 
    prod = '', 
    kol = 0, 
    ko = 'System', 
    datum = new Date().toLocaleDateString('sr-RS') 
  } = nalog || {};

  // Podaci kese mogu doći kao nalog.kesa ili direktno na nalogu
  const kesa = (nalog && nalog.kesa) || nalog || {};
  const cfg = kesaToConfig(kesa);
  const aktivneOpcije = [];
  if (cfg.vrh === 'klapna') aktivneOpcije.push(cfg.klTip === 'schrag' ? 'kosa klapna' : 'klapna');
  if (cfg.vrh === 'header') aktivneOpcije.push('header');
  if (cfg.dno !== 'ravno') aktivneOpcije.push(DNO_LABEL[cfg.dno]);
  if (cfg.adh) aktivneOpcije.push('ADH traka');
  if (cfg.euroloch) aktivneOpcije.push('eurozumba');
  if (cfg.luft) aktivneOpcije.push('bušene rupe');
  if (cfg.perf !== 'none') aktivneOpcije.push(cfg.perf === 'heiss' ? 'mikroperforacija' : 'poprečna perf.');
  if (cfg.stampa) aktivneOpcije.push('štampa');
  
  // Boja na osnovu tipa
  const headerColor = 'NalogCrtez_Kesa' === 'NalogCrtez_Kesa' || 'NalogCrtez_Kesa' === 'NalogKesa_Kesa' || 'NalogCrtez_Kesa' === 'NalogPotrebaMaterijala_Kesa'
    ? 'linear-gradient(135deg, #059669, #10b981)'
    : 'linear-gradient(135deg, #b91c1c, #ef4444)';
    
  const naziv = 'NalogCrtez_Kesa'.replace(/_/g, ' - ');
  
  return (
    <div style={{ 
      width: '210mm', 
      minHeight: '297mm', 
      background: 'white', 
      padding: '15mm', 
      margin: '0 auto', 
      fontFamily: 'Segoe UI, sans-serif', 
      fontSize: '11px', 
      position: 'relative',
      pageBreakAfter: 'always' 
    }}>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr auto 1fr', 
        alignItems: 'center', 
        padding: '12px 16px', 
        marginBottom: '20px', 
        borderRadius: '8px', 
        background: headerColor, 
        color: 'white' 
      }}>
        <div style={{ fontSize: '14px', fontWeight: 900 }}>MAROPACK DOO</div>
        <div style={{ textAlign: 'center', fontSize: '18px', fontWeight: 900, textTransform: 'uppercase' }}>
          {naziv}
        </div>
        <div style={{ textAlign: 'right', fontSize: '11px' }}>
          Br. naloga:<br />
          <strong style={{ fontSize: '13px' }}>{ponBr}</strong>
        </div>
      </div>
      
      <div style={{ marginBottom: '16px' }}>
        <div style={{ 
          fontSize: '12px', 
          fontWeight: 900, 
          textTransform: 'uppercase', 
          padding: '8px 12px', 
          borderRadius: '6px', 
          marginBottom: '10px', 
          background: headerColor.includes('059669') ? '#d1fae5' : '#fee2e2',
          color: headerColor.includes('059669') ? '#065f46' : '#991b1b',
          borderLeft: `4px solid ${headerColor.includes('059669') ? '#059669' : '#b91c1c'}`
        }}>
          📋 OSNOVNI PODACI
        </div>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '8px' 
        }}>
          <div style={{ 
            border: '1px solid #e2e8f0', 
            padding: '8px', 
            borderRadius: '6px', 
            background: '#f8fafc' 
          }}>
            <div style={{ 
              fontSize: '9px', 
              fontWeight: 800, 
              color: '#64748b', 
              textTransform: 'uppercase',
              marginBottom: '4px' 
            }}>
              Proizvod
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>
              {prod || 'N/A'}
            </div>
          </div>
          <div style={{ 
            border: '1px solid #e2e8f0', 
            padding: '8px', 
            borderRadius: '6px', 
            background: '#f8fafc' 
          }}>
            <div style={{ 
              fontSize: '9px', 
              fontWeight: 800, 
              color: '#64748b', 
              textTransform: 'uppercase',
              marginBottom: '4px' 
            }}>
              Kupac
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>
              {kupac || 'N/A'}
            </div>
          </div>
          <div style={{ 
            border: '1px solid #e2e8f0', 
            padding: '8px', 
            borderRadius: '6px', 
            background: '#f8fafc' 
          }}>
            <div style={{ 
              fontSize: '9px', 
              fontWeight: 800, 
              color: '#64748b', 
              textTransform: 'uppercase',
              marginBottom: '4px' 
            }}>
              Količina
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>
              {kol.toLocaleString()} kom
            </div>
          </div>
        </div>
      </div>
      
      {/* ===== TEHNIČKI CRTEŽ KESE ===== */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          fontSize: '12px', fontWeight: 900, textTransform: 'uppercase',
          padding: '8px 12px', borderRadius: '6px', marginBottom: '10px',
          background: headerColor.includes('059669') ? '#d1fae5' : '#fee2e2',
          color: headerColor.includes('059669') ? '#065f46' : '#991b1b',
          borderLeft: `4px solid ${headerColor.includes('059669') ? '#059669' : '#b91c1c'}`
        }}>
          📐 TEHNIČKI CRTEŽ
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 210px', gap: '12px', alignItems: 'start' }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px', background: '#fff' }}>
            <CrtezKese config={cfg} width="100%" showInfo={false} />
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', background: '#f8fafc' }}>
            <div style={{ fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Specifikacija</div>
            {[
              ['Tip', kesa.naziv || kesa.tipKese || '—'],
              ['Širina', `${cfg.sirina} mm`],
              ['Dužina', `${cfg.duzina} mm`],
              ['Klapna', cfg.vrh === 'klapna' ? `${cfg.klMm} mm${cfg.klTip === 'schrag' ? ' (kosa)' : ''}` : '—'],
              ['Dno', `${DNO_LABEL[cfg.dno]}${cfg.dno === 'faltna' && cfg.extraMm ? ` (${cfg.extraMm} mm)` : ''}`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0', borderBottom: '1px solid #eef2f6' }}>
                <span style={{ color: '#64748b' }}>{k}</span>
                <strong style={{ color: '#1e293b' }}>{v}</strong>
              </div>
            ))}
            <div style={{ fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', margin: '8px 0 4px' }}>Opcije</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {aktivneOpcije.length ? aktivneOpcije.map((o, i) => (
                <span key={i} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '8px', background: '#ccfbf1', color: '#0f766e', fontWeight: 600 }}>{o}</span>
              )) : <span style={{ fontSize: '10px', color: '#94a3b8' }}>—</span>}
            </div>
          </div>
        </div>
      </div>

      <div style={{ 
        position: 'absolute', 
        bottom: '15mm', 
        left: '15mm', 
        right: '15mm', 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr 1fr', 
        gap: '20px', 
        paddingTop: '15px', 
        borderTop: '2px solid #e2e8f0' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            borderTop: '2px solid #1e293b', 
            marginTop: '30px', 
            paddingTop: '6px', 
            fontSize: '9px', 
            color: '#64748b', 
            fontWeight: 700,
            textTransform: 'uppercase'
          }}>
            Kreirao
          </div>
          <div style={{ fontSize: '11px', fontWeight: 900, marginTop: '4px', color: '#1e293b' }}>
            {ko}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            borderTop: '2px solid #1e293b', 
            marginTop: '30px', 
            paddingTop: '6px', 
            fontSize: '9px', 
            color: '#64748b', 
            fontWeight: 700,
            textTransform: 'uppercase'
          }}>
            Datum
          </div>
          <div style={{ fontSize: '11px', fontWeight: 900, marginTop: '4px', color: '#1e293b' }}>
            {datum}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            borderTop: '2px solid #1e293b', 
            marginTop: '30px', 
            paddingTop: '6px', 
            fontSize: '9px', 
            color: '#64748b', 
            fontWeight: 700,
            textTransform: 'uppercase'
          }}>
            Odobrio
          </div>
          <div style={{ fontSize: '11px', fontWeight: 900, marginTop: '4px', color: '#1e293b' }}>
            _______________
          </div>
        </div>
      </div>
      
      <style>{`@media print { @page { size: A4; margin: 0; } }`}</style>
    </div>
  );
}


// V47_NALOG_FULL_MATERIAL_NAME: nalozi treba da prikazuju pun naziv materijala: VRSTA + OZNAKA + DEBLJINA, npr. BOPP FXCB 20µ.
