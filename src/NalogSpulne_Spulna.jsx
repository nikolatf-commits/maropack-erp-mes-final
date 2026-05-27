import React from 'react';
import { MaterialText } from './components/MaterialSelectorPRO.jsx';

export default function NalogSpulne_Spulna({ nalog }) {
  const { 
    ponBr = 'MP-2026-XXXX', 
    kupac = '', 
    prod = '', 
    kol = 0, 
    ko = 'System', 
    datum = new Date().toLocaleDateString('sr-RS') 
  } = nalog || {};
  
  return (
    <div style={{ 
      width: '210mm', 
      minHeight: '297mm', 
      background: 'white', 
      padding: '15mm', 
      margin: '0 auto', 
      fontFamily: 'Segoe UI, sans-serif', 
      fontSize: '11px', 
      pageBreakAfter: 'always' 
    }}>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr auto 1fr', 
        alignItems: 'center', 
        padding: '12px 16px', 
        marginBottom: '20px', 
        borderRadius: '8px', 
        background: 'linear-gradient(135deg, #b91c1c, #ef4444)', 
        color: 'white' 
      }}>
        <div style={{ fontSize: '14px', fontWeight: 900 }}>MAROPACK DOO</div>
        <div style={{ textAlign: 'center', fontSize: '18px', fontWeight: 900 }}>
          Nalog za Špulne
        </div>
        <div style={{ textAlign: 'right' }}>
          Br. naloga:<br />
          <strong>{ponBr}</strong>
        </div>
      </div>
      
      <div style={{ 
        padding: '20px', 
        background: '#f8fafc', 
        borderRadius: '8px', 
        marginBottom: '20px' 
      }}>
        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '10px' }}>
          📋 Proizvod: {prod || 'N/A'}
        </div>
        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '10px' }}>
          👤 Kupac: {kupac || 'N/A'}
        </div>
        <div style={{ fontSize: '12px', fontWeight: 700 }}>
          📦 Količina: {kol.toLocaleString()} kom
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
            fontWeight: 700 
          }}>
            Kreirao
          </div>
          <div style={{ fontSize: '11px', fontWeight: 900, marginTop: '4px' }}>
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
            fontWeight: 700 
          }}>
            Datum
          </div>
          <div style={{ fontSize: '11px', fontWeight: 900, marginTop: '4px' }}>
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
            fontWeight: 700 
          }}>
            Odobrio
          </div>
          <div style={{ fontSize: '11px', fontWeight: 900, marginTop: '4px' }}>
            _______________
          </div>
        </div>
      </div>
      
      <style>{`@media print { @page { size: A4; margin: 0; } }`}</style>
    </div>
  );
}


// V47_NALOG_FULL_MATERIAL_NAME: nalozi treba da prikazuju pun naziv materijala: VRSTA + OZNAKA + DEBLJINA, npr. BOPP FXCB 20µ.
