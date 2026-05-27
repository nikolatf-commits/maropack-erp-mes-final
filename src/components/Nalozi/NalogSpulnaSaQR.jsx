import React from 'react';
import { MaterialText } from '../MaterialSelectorPRO.jsx';
import { NalogQRHeader } from './NalogQRCode';

/**
 * 🎞️ RADNI NALOG ZA ŠPULNU - SA QR KODOM
 */
export default function NalogSpulnaSaQR({ 
    nalogId,
    brojNaloga,
    kupac,
    proizvod,
    kolicina,
    dimenzije = {},
    materijal = {},
    tehnickeSpec = {},
    napomena = ''
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
                tip="spulna"
                naslov="RADNI NALOG - ŠPULNA"
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
                background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
                borderRadius: 8,
                marginBottom: 24,
                border: '2px solid #8b5cf6'
            }}>
                <div style={{ fontSize: 12, color: '#5b21b6', marginBottom: 4, fontWeight: 600 }}>
                    🎞️ PROIZVOD:
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#5b21b6' }}>
                    {proizvod}
                </div>
            </div>

            {/* DIMENZIJE ŠPULNE */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
                marginBottom: 24
            }}>
                <div style={{
                    padding: 16,
                    background: '#dbeafe',
                    borderRadius: 8,
                    border: '1px solid #3b82f6'
                }}>
                    <div style={{ fontSize: 11, color: '#1e40af', marginBottom: 4, fontWeight: 600 }}>
                        ŠIRINA:
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#1e40af' }}>
                        {dimenzije.sirina || '-'} mm
                    </div>
                </div>

                <div style={{
                    padding: 16,
                    background: '#dbeafe',
                    borderRadius: 8,
                    border: '1px solid #3b82f6'
                }}>
                    <div style={{ fontSize: 11, color: '#1e40af', marginBottom: 4, fontWeight: 600 }}>
                        PREČNIK ŠPULNE:
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#1e40af' }}>
                        {dimenzije.precnik || '-'} mm
                    </div>
                </div>

                <div style={{
                    padding: 16,
                    background: '#dbeafe',
                    borderRadius: 8,
                    border: '1px solid #3b82f6'
                }}>
                    <div style={{ fontSize: 11, color: '#1e40af', marginBottom: 4, fontWeight: 600 }}>
                        SPULNA Ø:
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#1e40af' }}>
                        {dimenzije.precnikSpulne || '-'} mm
                    </div>
                </div>
            </div>

            {/* MATERIJAL I TEHNIČKE SPEC */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 20,
                marginBottom: 24
            }}>
                {/* MATERIJAL */}
                <div style={{
                    padding: 16,
                    background: '#e0e7ff',
                    borderRadius: 8,
                    border: '1px solid #6366f1'
                }}>
                    <h4 style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#3730a3',
                        marginBottom: 12
                    }}>
                        📦 MATERIJAL:
                    </h4>
                    <div style={{ fontSize: 12, color: '#312e81' }}>
                        <div style={{ marginBottom: 6 }}>
                            <strong>Tip:</strong> {materijal.tip || '-'}
                        </div>
                        <div style={{ marginBottom: 6 }}>
                            <strong>Debljina:</strong> {materijal.debljina || '-'} μm
                        </div>
                        <div style={{ marginBottom: 6 }}>
                            <strong>Boja:</strong> {materijal.boja || '-'}
                        </div>
                        <div>
                            <strong>Težina:</strong> {materijal.tezina || '-'} g/m²
                        </div>
                    </div>
                </div>

                {/* TEHNIČKE SPEC */}
                <div style={{
                    padding: 16,
                    background: '#fef3c7',
                    borderRadius: 8,
                    border: '1px solid #f59e0b'
                }}>
                    <h4 style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#92400e',
                        marginBottom: 12
                    }}>
                        ⚙️ TEHNIČKE SPEC:
                    </h4>
                    <div style={{ fontSize: 12, color: '#78350f' }}>
                        <div style={{ marginBottom: 6 }}>
                            <strong>Perforacija:</strong> {tehnickeSpec.perforacija || 'Ne'}
                        </div>
                        <div style={{ marginBottom: 6 }}>
                            <strong>Štampa:</strong> {tehnickeSpec.stampa || 'Ne'}
                        </div>
                        <div style={{ marginBottom: 6 }}>
                            <strong>Laminacija:</strong> {tehnickeSpec.laminacija || 'Ne'}
                        </div>
                        <div>
                            <strong>Pakovanje:</strong> {tehnickeSpec.pakovanje || 'Standardno'}
                        </div>
                    </div>
                </div>
            </div>

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
                        {['Ekstruzija', 'Namotavanje', 'Kontrola kvaliteta', 'Sečenje', 'Pakovanje'].map((faza, idx) => (
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

            {/* KONTROLA KVALITETA */}
            <div style={{
                padding: 16,
                background: '#dcfce7',
                borderRadius: 8,
                border: '1px solid #10b981',
                marginBottom: 24
            }}>
                <h4 style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#065f46',
                    marginBottom: 12
                }}>
                    ✅ KONTROLA KVALITETA:
                </h4>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 12,
                    fontSize: 11,
                    color: '#064e3b'
                }}>
                    <div>
                        <div style={{ marginBottom: 4 }}>Debljina folije:</div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>☐ OK</div>
                    </div>
                    <div>
                        <div style={{ marginBottom: 4 }}>Širina:</div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>☐ OK</div>
                    </div>
                    <div>
                        <div style={{ marginBottom: 4 }}>Prečnik špulne:</div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>☐ OK</div>
                    </div>
                    <div>
                        <div style={{ marginBottom: 4 }}>Kvalitet površine:</div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>☐ OK</div>
                    </div>
                    <div>
                        <div style={{ marginBottom: 4 }}>Perforacija:</div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>☐ OK</div>
                    </div>
                    <div>
                        <div style={{ marginBottom: 4 }}>Namotavanje:</div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>☐ OK</div>
                    </div>
                </div>
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
