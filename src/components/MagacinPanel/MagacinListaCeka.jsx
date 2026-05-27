import { kgFromMeters, calculateGm2, buildMaterialName } from '../../data/materialMaster.js';
import React, { useState, useEffect } from 'react';
import { getMagacinCekaLista, subscribeMagacinCeka } from '../../utils/supabaseRadnik';
import MagacinSmestanje from './MagacinSmestanje';

/**
 * ⏳ MAGACIN - LISTA PROIZVODA KOJI ČEKAJU PREUZIMANJE
 * Real-time updates
 */
export default function MagacinListaCeka({ magacioner }) {
    const [proizvodi, setProizvodi] = useState([]);
    const [odabraniProizvod, setOdabraniProizvod] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadProizvodi();

        // Real-time subscription
        const subscription = subscribeMagacinCeka((payload) => {
            console.log('Real-time update:', payload);
            loadProizvodi();
        });

        return () => {
            subscription?.unsubscribe();
        };
    }, []);

    const loadProizvodi = async () => {
        try {
            const data = await getMagacinCekaLista();
            setProizvodi(data || []);
        } catch (err) {
            console.error('Greška:', err);
        } finally {
            setLoading(false);
        }
    };

    // Ako je proizvod odabran, prikaži smeštanje
    if (odabraniProizvod) {
        return (
            <MagacinSmestanje
                proizvod={odabraniProizvod}
                magacioner={magacioner}
                onBack={() => {
                    setOdabraniProizvod(null);
                    loadProizvodi();
                }}
            />
        );
    }

    return (
        <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
            <h2 style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#1e293b',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8
            }}>
                ⏳ Čeka preuzimanje
                {proizvodi.length > 0 && (
                    <span style={{
                        background: '#7c3aed',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: 20,
                        fontSize: 14
                    }}>
                        {proizvodi.length}
                    </span>
                )}
            </h2>

            {loading ? (
                <p style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>
                    ⏳ Učitavam proizvode...
                </p>
            ) : proizvodi.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    padding: 60,
                    color: '#94a3b8'
                }}>
                    <div style={{ fontSize: 60, marginBottom: 16 }}>📦</div>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                        Nema proizvoda za preuzimanje
                    </p>
                    <p style={{ fontSize: 14 }}>
                        Proizvodi će se automatski pojaviti ovde kada budu završeni u proizvodnji.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {proizvodi.map((proizvod) => {
                        // Učitaj podatke o nalogu iz nalog objekta
                        const nalog = proizvod.nalog || {};

                        return (
                            <div
                                key={proizvod.id}
                                style={{
                                    padding: 20,
                                    border: '2px solid #e2e8f0',
                                    borderRadius: 8,
                                    background: 'white',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = '#7c3aed';
                                    e.currentTarget.style.background = '#faf5ff';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                    e.currentTarget.style.background = 'white';
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    marginBottom: 12
                                }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{
                                            fontSize: 18,
                                            fontWeight: 700,
                                            color: '#1e293b',
                                            marginBottom: 6
                                        }}>
                                            {nalog.pon_br || `Proizvod #${proizvod.id}`}
                                        </h3>

                                        <p style={{
                                            fontSize: 14,
                                            color: '#64748b',
                                            marginBottom: 4
                                        }}>
                                            {nalog.tip_proizvoda || 'N/A'}
                                        </p>

                                        <p style={{
                                            fontSize: 14,
                                            color: '#64748b',
                                            marginBottom: 4
                                        }}>
                                            📊 Količina: <strong>{proizvod.kolicina}</strong> kom
                                        </p>

                                        <p style={{
                                            fontSize: 13,
                                            color: '#94a3b8'
                                        }}>
                                            🕐 Završeno: {new Date(proizvod.kreirano).toLocaleString('sr-RS')}
                                        </p>
                                    </div>

                                    <div style={{
                                        padding: '8px 16px',
                                        background: '#fbbf24',
                                        color: '#78350f',
                                        borderRadius: 6,
                                        fontSize: 13,
                                        fontWeight: 600
                                    }}>
                                        ⏳ ČEKA
                                    </div>
                                </div>

                                <button
                                    onClick={() => setOdabraniProizvod(proizvod)}
                                    style={{
                                        width: '100%',
                                        padding: 12,
                                        background: '#7c3aed',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 8,
                                        fontSize: 15,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        marginTop: 12
                                    }}
                                >
                                    📦 Preuzmi i smesti
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
