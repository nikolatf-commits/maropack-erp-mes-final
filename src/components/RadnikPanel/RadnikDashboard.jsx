import React, { useState, useEffect } from 'react';
import { getNalogByQR } from '../../utils/supabaseRadnik';
import NalogDetalji from './NalogDetalji';
import { supabase } from '../../supabase';

/**
 * 📋 RADNIK DASHBOARD
 * Prikazuje listu aktivnih naloga + QR skeniranje
 */
export default function RadnikDashboard({ radnik, onLogout }) {
    const [nalozi, setNalozi] = useState([]);
    const [odabraniNalog, setOdabraniNalog] = useState(null);
    const [loading, setLoading] = useState(true);

    // Učitaj naloge
    useEffect(() => {
        loadNalozi();
    }, []);

    const loadNalozi = async () => {
        try {
            const { data, error } = await supabase
                .from('nalozi')
                .select('*')
                .in('status', ['U_PRIPREMI', 'U_PROIZVODNJI', 'ZAVRSENO_CEKA_MAGACIN'])
                .order('id', { ascending: false });

            if (error) throw error;
            setNalozi(data || []);
        } catch (err) {
            console.error('Greška pri učitavanju naloga:', err);
        } finally {
            setLoading(false);
        }
    };

    // QR Skeniranje naloga
    const handleQRScan = async () => {
        const qrKod = prompt('Skeniraj QR kod naloga (npr. MP-2026-001):');
        if (!qrKod) return;

        try {
            const nalog = await getNalogByQR(qrKod);
            if (nalog) {
                setOdabraniNalog(nalog);
            } else {
                alert('❌ Nalog sa ovim QR kodom nije pronađen!');
            }
        } catch (err) {
            console.error('QR greška:', err);
            alert('❌ Greška pri skeniranju QR koda.');
        }
    };

    // Ako je nalog odabran, prikaži detalje
    if (odabraniNalog) {
        return (
            <NalogDetalji
                nalog={odabraniNalog}
                radnik={radnik}
                onBack={() => {
                    setOdabraniNalog(null);
                    loadNalozi();
                }}
            />
        );
    }

    return (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
            {/* HEADER */}
            <div style={{
                background: 'white',
                borderRadius: 12,
                padding: 20,
                marginBottom: 20,
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div>
                    <h2 style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: '#1e293b',
                        marginBottom: 4
                    }}>
                        👤 {radnik.ime} {radnik.prezime}
                    </h2>
                    <p style={{ color: '#64748b', fontSize: 14 }}>
                        Pozicija: {radnik.pozicija || 'Radnik'}
                    </p>
                </div>

                <button
                    onClick={onLogout}
                    style={{
                        padding: '10px 20px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    🚪 Odjavi se
                </button>
            </div>

            {/* QR SCANNER */}
            <button
                onClick={handleQRScan}
                style={{
                    width: '100%',
                    padding: 20,
                    background: '#0f766e',
                    color: 'white',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginBottom: 20,
                    boxShadow: '0 4px 15px rgba(15, 118, 110, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12
                }}
            >
                📷 Skeniraj QR kod naloga
            </button>

            {/* LISTA NALOGA */}
            <div style={{
                background: 'white',
                borderRadius: 12,
                padding: 20,
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
            }}>
                <h3 style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#1e293b',
                    marginBottom: 16
                }}>
                    📋 Aktivni nalozi
                </h3>

                {loading ? (
                    <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>
                        ⏳ Učitavam naloge...
                    </p>
                ) : nalozi.length === 0 ? (
                    <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>
                        Trenutno nema aktivnih naloga.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {nalozi.map((nalog) => (
                            <div
                                key={nalog.id}
                                onClick={() => setOdabraniNalog(nalog)}
                                style={{
                                    padding: 16,
                                    border: '2px solid #e2e8f0',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    background: 'white'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = '#0f766e';
                                    e.currentTarget.style.background = '#f0fdfa';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                    e.currentTarget.style.background = 'white';
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 8
                                }}>
                                    <span style={{
                                        fontSize: 16,
                                        fontWeight: 700,
                                        color: '#1e293b'
                                    }}>
                                        {nalog.pon_br}
                                    </span>

                                    <span style={{
                                        padding: '4px 12px',
                                        borderRadius: 6,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        background:
                                            nalog.status === 'U_PROIZVODNJI' ? '#dcfce7' :
                                                nalog.status === 'U_PRIPREMI' ? '#fef3c7' :
                                                    '#e0e7ff',
                                        color:
                                            nalog.status === 'U_PROIZVODNJI' ? '#166534' :
                                                nalog.status === 'U_PRIPREMI' ? '#854d0e' :
                                                    '#3730a3'
                                    }}>
                                        {nalog.status === 'U_PROIZVODNJI' ? '🟢 U proizvodnji' :
                                            nalog.status === 'U_PRIPREMI' ? '🟡 U pripremi' :
                                                '🔵 Čeka magacin'}
                                    </span>
                                </div>

                                <p style={{
                                    fontSize: 14,
                                    color: '#64748b',
                                    marginBottom: 4
                                }}>
                                    {nalog.tip_proizvoda} - {nalog.kolicina || '?'} kom
                                </p>

                                <p style={{
                                    fontSize: 13,
                                    color: '#94a3b8'
                                }}>
                                    Datum: {nalog.datum || 'N/A'}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
