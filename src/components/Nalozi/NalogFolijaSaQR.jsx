import React from 'react';
import { MaterialText } from '../MaterialSelectorPRO.jsx';
import { NalogQRHeader } from './NalogQRCode';

/**
 * 📄 RADNI NALOG ZA FOLIJU - SA QR KODOM
 * 
 * Upotreba:
 * <NalogFolija 
 *   nalogId={12345}
 *   brojNaloga="N-2026-001"
 *   kupac="ABC DOO"
 *   proizvod="Folija 500mm"
 *   kolicina={5000}
 *   materijali={[...]}
 * />
 */
export default function NalogFolijaSaQR({ 
    nalogId,
    brojNaloga,
    kupac,
    proizvod,
    kolicina,
    materijali = [],
    napomena = '',
    rokIsporuke = ''
}) {
    return (
        <div style={{
            maxWidth: 800,
            margin: '0 auto',
            background: 'white',
            padding: 40,
            fontFamily: 'Arial, sans-serif'
        }}>
            {/* HEADER SA QR KODOM */}
            <NalogQRHeader 
                nalogId={nalogId}
                tip="folija"
                naslov="RADNI NALOG - FOLIJA"
                brojNaloga={brojNaloga}
            />

            {/* OSNOVNI PODACI */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 20,
                marginBottom: 24
            }}>
                <div style={{
                    padding: 16,
                    background: '#f8fafc',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0'
                }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                        KUPAC:
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                        {kupac}
                    </div>
                </div>

                <div style={{
                    padding: 16,
                    background: '#f8fafc',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0'
                }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                        KOLIČINA:
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                        {kolicina?.toLocaleString()} kom
                    </div>
                </div>
            </div>

            {/* PROIZVOD */}
            <div style={{
                padding: 20,
                background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                borderRadius: 8,
                marginBottom: 24,
                border: '2px solid #3b82f6'
            }}>
                <div style={{ fontSize: 12, color: '#1e40af', marginBottom: 4, fontWeight: 600 }}>
                    📦 PROIZVOD:
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1e40af' }}>
                    {proizvod}
                </div>
            </div>

            {/* MATERIJALI */}
            {materijali.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <h3 style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#1e293b',
                        marginBottom: 12,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        📋 MATERIJALI:
                    </h3>
                    <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: 13
                    }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                <th style={{ padding: 10, textAlign: 'left', border: '1px solid #e2e8f0' }}>
                                    Materijal
                                </th>
                                <th style={{ padding: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                    Debljina
                                </th>
                                <th style={{ padding: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                    Širina
                                </th>
                                <th style={{ padding: 10, textAlign: 'right', border: '1px solid #e2e8f0' }}>
                                    Količina
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {materijali.map((mat, idx) => (
                                <tr key={idx}>
                                    <td style={{ padding: 10, border: '1px solid #e2e8f0' }}>
                                        {mat.naziv || mat.tip}
                                    </td>
                                    <td style={{ padding: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                        {mat.debljina}μm
                                    </td>
                                    <td style={{ padding: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                        {mat.sirina}mm
                                    </td>
                                    <td style={{ padding: 10, textAlign: 'right', border: '1px solid #e2e8f0', fontWeight: 600 }}>
                                        {mat.kolicina} kg
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* PRAĆENJE PROIZVODNJE */}
            <div style={{ marginBottom: 24 }}>
                <h3 style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#1e293b',
                    marginBottom: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                }}>
                    🔧 PRAĆENJE PROIZVODNJE:
                </h3>
                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 12
                }}>
                    <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                            <th style={{ padding: 10, textAlign: 'left', border: '1px solid #e2e8f0' }}>Faza</th>
                            <th style={{ padding: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>Radnik</th>
                            <th style={{ padding: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>Početak</th>
                            <th style={{ padding: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>Kraj</th>
                            <th style={{ padding: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>Potpis</th>
                        </tr>
                    </thead>
                    <tbody>
                        {['Priprema materijala', 'Ekstruzija', 'Sečenje', 'Pakovanje'].map((faza, idx) => (
                            <tr key={idx}>
                                <td style={{ padding: 10, border: '1px solid #e2e8f0' }}>{faza}</td>
                                <td style={{ padding: 10, border: '1px solid #e2e8f0' }}>_____________</td>
                                <td style={{ padding: 10, border: '1px solid #e2e8f0' }}>_____________</td>
                                <td style={{ padding: 10, border: '1px solid #e2e8f0' }}>_____________</td>
                                <td style={{ padding: 10, border: '1px solid #e2e8f0' }}>_____________</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* NAPOMENA */}
            {napomena && (
                <div style={{
                    padding: 16,
                    background: '#fef3c7',
                    borderRadius: 8,
                    border: '2px dashed #f59e0b',
                    marginBottom: 24
                }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
                        📝 NAPOMENA:
                    </div>
                    <div style={{ fontSize: 13, color: '#78350f' }}>
                        {napomena}
                    </div>
                </div>
            )}

            {/* FOOTER */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 16,
                paddingTop: 24,
                borderTop: '2px solid #e2e8f0',
                marginTop: 24
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        height: 60,
                        borderBottom: '2px solid #94a3b8',
                        marginBottom: 8
                    }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                        Naručilac
                    </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        height: 60,
                        borderBottom: '2px solid #94a3b8',
                        marginBottom: 8
                    }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                        Kontrola kvaliteta
                    </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        height: 60,
                        borderBottom: '2px solid #94a3b8',
                        marginBottom: 8
                    }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                        Rukovodilac proizvodnje
                    </div>
                </div>
            </div>

            {/* PRINT INFO */}
            <div style={{
                marginTop: 24,
                padding: 12,
                background: '#f1f5f9',
                borderRadius: 8,
                textAlign: 'center',
                fontSize: 11,
                color: '#64748b'
            }}>
                ℹ️ Za pristup digitalno, skenirajte QR kod pomoću Radnik Panel aplikacije
            </div>
        </div>
    );
}


// V47_NALOG_FULL_MATERIAL_NAME: nalozi treba da prikazuju pun naziv materijala: VRSTA + OZNAKA + DEBLJINA, npr. BOPP FXCB 20µ.
