import React, { useState } from 'react';
import { dodajZastoj, zavrsiZastoj } from '../../utils/supabaseRadnik';

/**
 * ⏸ RAZLOZI ZAUSTAVLJANJA - MODAL
 * 5 kategorija: Tehnički, Materijal, Radnik, Kvalitet, Ostalo
 */
export default function RazloziZaustavljanja({ fazaId, onClose, onResumed }) {
    const [aktivanZastoj, setAktivanZastoj] = useState(null);
    const [loading, setLoading] = useState(false);

    const kategorije = [
        {
            naziv: 'Tehnički',
            ikona: '⚙️',
            boja: '#ef4444',
            razlozi: [
                'Kvar na mašini',
                'Problem sa alatom',
                'Greška u postavkama',
                'Drugo - tehnički'
            ]
        },
        {
            naziv: 'Materijal',
            ikona: '📦',
            boja: '#f59e0b',
            razlozi: [
                'Nedostaje materijal',
                'Loš kvalitet materijala',
                'Čeka se isporuka',
                'Drugo - materijal'
            ]
        },
        {
            naziv: 'Radnik',
            ikona: '👤',
            boja: '#3b82f6',
            razlozi: [
                'Pauza',
                'Ručak',
                'Sastanak',
                'Drugo - radnik'
            ]
        },
        {
            naziv: 'Kvalitet',
            ikona: '🔍',
            boja: '#8b5cf6',
            razlozi: [
                'Kontrola kvaliteta',
                'Popravka greške',
                'Čeka se odobrenje',
                'Drugo - kvalitet'
            ]
        },
        {
            naziv: 'Ostalo',
            ikona: '📝',
            boja: '#64748b',
            razlozi: [
                'Priprema dokumentacije',
                'Čišćenje radnog mesta',
                'Obuka',
                'Nepoznat razlog'
            ]
        }
    ];

    // Dodaj zastoj
    const handleDodajZastoj = async (kategorija, razlog) => {
        try {
            setLoading(true);
            const zastoj = await dodajZastoj(fazaId, kategorija, razlog);
            setAktivanZastoj(zastoj);
        } catch (err) {
            console.error('Greška:', err);
            alert('❌ Greška pri dodavanju zastoja!');
        } finally {
            setLoading(false);
        }
    };

    // Završi zastoj i nastavi rad
    const handleNastaviRad = async () => {
        if (!aktivanZastoj) return;

        try {
            setLoading(true);
            await zavrsiZastoj(aktivanZastoj.id);
            onResumed();
        } catch (err) {
            console.error('Greška:', err);
            alert('❌ Greška pri završavanju zastoja!');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20
        }}>
            <div style={{
                background: 'white',
                borderRadius: 12,
                maxWidth: 600,
                width: '100%',
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
            }}>
                {/* HEADER */}
                <div style={{
                    padding: 24,
                    borderBottom: '2px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h3 style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: '#1e293b'
                    }}>
                        ⏸ Razlog zaustavljanja
                    </h3>

                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            fontSize: 24,
                            cursor: 'pointer',
                            color: '#64748b',
                            padding: 0,
                            width: 32,
                            height: 32
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* BODY */}
                <div style={{ padding: 24 }}>
                    {!aktivanZastoj ? (
                        <>
                            <p style={{
                                fontSize: 14,
                                color: '#64748b',
                                marginBottom: 20
                            }}>
                                Odaberi kategoriju i razlog zaustavljanja:
                            </p>

                            {kategorije.map((kat) => (
                                <div key={kat.naziv} style={{ marginBottom: 20 }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        marginBottom: 12,
                                        fontSize: 16,
                                        fontWeight: 700,
                                        color: '#1e293b'
                                    }}>
                                        <span style={{ fontSize: 20 }}>{kat.ikona}</span>
                                        {kat.naziv}
                                    </div>

                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                                        gap: 8
                                    }}>
                                        {kat.razlozi.map((razlog) => (
                                            <button
                                                key={razlog}
                                                onClick={() => handleDodajZastoj(kat.naziv, razlog)}
                                                disabled={loading}
                                                style={{
                                                    padding: '10px 14px',
                                                    background: loading ? '#f1f5f9' : 'white',
                                                    border: `2px solid ${kat.boja}`,
                                                    borderRadius: 8,
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    color: kat.boja,
                                                    cursor: loading ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!loading) {
                                                        e.currentTarget.style.background = kat.boja;
                                                        e.currentTarget.style.color = 'white';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!loading) {
                                                        e.currentTarget.style.background = 'white';
                                                        e.currentTarget.style.color = kat.boja;
                                                    }
                                                }}
                                            >
                                                {razlog}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: 20 }}>
                            <div style={{
                                width: 80,
                                height: 80,
                                background: '#fbbf24',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 40,
                                margin: '0 auto 20px'
                            }}>
                                ⏸
                            </div>

                            <h4 style={{
                                fontSize: 18,
                                fontWeight: 700,
                                color: '#1e293b',
                                marginBottom: 8
                            }}>
                                Rad zaustavljen
                            </h4>

                            <p style={{
                                fontSize: 14,
                                color: '#64748b',
                                marginBottom: 24
                            }}>
                                Razlog: <strong>{aktivanZastoj.razlog}</strong>
                            </p>

                            <button
                                onClick={handleNastaviRad}
                                disabled={loading}
                                style={{
                                    padding: '14px 32px',
                                    background: loading ? '#94a3b8' : '#0f766e',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 8,
                                    fontSize: 16,
                                    fontWeight: 700,
                                    cursor: loading ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {loading ? '⏳ Nastavljam...' : '▶ Nastavi rad'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
