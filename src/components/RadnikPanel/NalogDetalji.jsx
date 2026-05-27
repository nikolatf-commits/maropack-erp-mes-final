import React, { useState, useEffect } from 'react';
import { MaterialText } from '../MaterialSelectorPRO.jsx';
import { getFazeByNalog, pokreniFazu, zavrsiFazu } from '../../utils/supabaseRadnik';
import RazloziZaustavljanja from './RazloziZaustavljanja';
import ZavrsenaPosljednjaFaza from './ZavrsenaPosljednjaFaza';

/**
 * 📝 NALOG DETALJI
 * Prikazuje faze, timer, progress bar
 */
export default function NalogDetalji({ nalog, radnik, onBack }) {
    const [faze, setFaze] = useState([]);
    const [aktivnaFaza, setAktivnaFaza] = useState(null);
    const [timer, setTimer] = useState(0);
    const [showZastojiModal, setShowZastojiModal] = useState(false);
    const [showZavrsenModal, setShowZavrsenModal] = useState(false);
    const [loading, setLoading] = useState(true);

    // Učitaj faze
    useEffect(() => {
        loadFaze();
    }, [nalog.id]);

    // Timer interval
    useEffect(() => {
        if (aktivnaFaza) {
            const interval = setInterval(() => {
                setTimer((prev) => prev + 1);
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [aktivnaFaza]);

    const loadFaze = async () => {
        try {
            const data = await getFazeByNalog(nalog.id);
            setFaze(data || []);
            
            // Pronađi aktivnu fazu
            const aktivna = data?.find(f => f.status === 'U_TOKU');
            if (aktivna) {
                setAktivnaFaza(aktivna);
                // Izračunaj vreme
                const start = new Date(aktivna.pocetak);
                const now = new Date();
                setTimer(Math.floor((now - start) / 1000));
            }
        } catch (err) {
            console.error('Greška pri učitavanju faza:', err);
        } finally {
            setLoading(false);
        }
    };

    // Pokreni fazu
    const handlePokreni = async (faza) => {
        if (!window.confirm(`Pokreni fazu: ${faza.naziv}?`)) return;

        try {
            await pokreniFazu(faza.id, radnik.id);
            await loadFaze();
        } catch (err) {
            console.error('Greška:', err);
            alert('❌ Greška pri pokretanju faze!');
        }
    };

    // Završi fazu
    const handleZavrsi = async () => {
        if (!aktivnaFaza) return;

        const skart = prompt('Unesi škart (kg) - opcionalno:', '0');
        const napomena = prompt('Napomena - opcionalno:', '');

        try {
            await zavrsiFazu(aktivnaFaza.id, parseFloat(skart) || 0, napomena);
            
            // Proveri da li je ovo poslednja faza
            const zavrseneFaze = faze.filter(f => f.status === 'ZAVRSENO').length + 1;
            const ukupnoFaza = faze.length;

            if (zavrseneFaze === ukupnoFaza) {
                setShowZavrsenModal(true);
            } else {
                await loadFaze();
                setAktivnaFaza(null);
                setTimer(0);
            }
        } catch (err) {
            console.error('Greška:', err);
            alert('❌ Greška pri završavanju faze!');
        }
    };

    // Format timer
    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Progress
    const zavrseneFaze = faze.filter(f => f.status === 'ZAVRSENO').length;
    const progress = faze.length > 0 ? (zavrseneFaze / faze.length) * 100 : 0;

    if (showZavrsenModal) {
        return (
            <ZavrsenaPosljednjaFaza
                nalog={nalog}
                onBack={onBack}
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
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
            }}>
                <button
                    onClick={onBack}
                    style={{
                        padding: '8px 16px',
                        background: '#f1f5f9',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginBottom: 16,
                        color: '#475569'
                    }}
                >
                    ← Nazad
                </button>

                <h2 style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: '#1e293b',
                    marginBottom: 8
                }}>
                    {nalog.pon_br}
                </h2>

                <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
                    {nalog.tip_proizvoda} - {nalog.kolicina || '?'} kom
                </p>

                {/* PROGRESS BAR */}
                <div style={{ marginBottom: 8 }}>
                    <div style={{
                        height: 8,
                        background: '#e2e8f0',
                        borderRadius: 4,
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${progress}%`,
                            background: '#0f766e',
                            transition: 'width 0.3s'
                        }} />
                    </div>
                </div>

                <p style={{ fontSize: 13, color: '#64748b', textAlign: 'right' }}>
                    {zavrseneFaze} / {faze.length} faza završeno
                </p>
            </div>

            {/* TIMER (ako ima aktivna faza) */}
            {aktivnaFaza && (
                <div style={{
                    background: 'linear-gradient(135deg, #0f766e 0%, #134e4a 100%)',
                    color: 'white',
                    borderRadius: 12,
                    padding: 24,
                    marginBottom: 20,
                    textAlign: 'center',
                    boxShadow: '0 4px 20px rgba(15, 118, 110, 0.3)'
                }}>
                    <p style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 8,
                        opacity: 0.9
                    }}>
                        AKTIVNA FAZA: {aktivnaFaza.naziv}
                    </p>

                    <div style={{
                        fontSize: 48,
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        marginBottom: 16
                    }}>
                        {formatTime(timer)}
                    </div>

                    <div style={{
                        display: 'flex',
                        gap: 12,
                        justifyContent: 'center'
                    }}>
                        <button
                            onClick={() => setShowZastojiModal(true)}
                            style={{
                                padding: '12px 24px',
                                background: '#fbbf24',
                                color: '#1e293b',
                                border: 'none',
                                borderRadius: 8,
                                fontSize: 15,
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            ⏸ Zaustavi
                        </button>

                        <button
                            onClick={handleZavrsi}
                            style={{
                                padding: '12px 24px',
                                background: 'white',
                                color: '#0f766e',
                                border: 'none',
                                borderRadius: 8,
                                fontSize: 15,
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            ✓ Završi fazu
                        </button>
                    </div>
                </div>
            )}

            {/* LISTA FAZA */}
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
                    Faze proizvodnje
                </h3>

                {loading ? (
                    <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>
                        ⏳ Učitavam faze...
                    </p>
                ) : faze.length === 0 ? (
                    <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>
                        Nema definisanih faza.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {faze.map((faza) => {
                            const jeZavrsena = faza.status === 'ZAVRSENO';
                            const jeAktivna = faza.status === 'U_TOKU';
                            const jeCeka = faza.status === 'CEKA';

                            return (
                                <div
                                    key={faza.id}
                                    style={{
                                        padding: 16,
                                        border: `2px solid ${jeAktivna ? '#0f766e' : '#e2e8f0'}`,
                                        borderRadius: 8,
                                        background: jeZavrsena ? '#f0fdf4' : jeAktivna ? '#f0fdfa' : 'white'
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
                                            {jeZavrsena ? '✅' : jeAktivna ? '🎯' : '⏳'} {faza.naziv}
                                        </span>

                                        {jeCeka && !aktivnaFaza && (
                                            <button
                                                onClick={() => handlePokreni(faza)}
                                                style={{
                                                    padding: '6px 16px',
                                                    background: '#0f766e',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: 6,
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ▶ Pokreni
                                            </button>
                                        )}
                                    </div>

                                    <p style={{ fontSize: 14, color: '#64748b' }}>
                                        Redosled: {faza.redosled} | Status: {faza.status}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* MODAL ZA ZASTOJE */}
            {showZastojiModal && (
                <RazloziZaustavljanja
                    fazaId={aktivnaFaza?.id}
                    onClose={() => setShowZastojiModal(false)}
                    onResumed={() => {
                        setShowZastojiModal(false);
                        loadFaze();
                    }}
                />
            )}
        </div>
    );
}


// V47_NALOG_FULL_MATERIAL_NAME: nalozi treba da prikazuju pun naziv materijala: VRSTA + OZNAKA + DEBLJINA, npr. BOPP FXCB 20µ.
