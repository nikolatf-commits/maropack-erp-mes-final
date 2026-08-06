import { kgFromMeters, calculateGm2, buildMaterialName } from '../../data/materialMaster.js';
import React, { useState, useEffect } from 'react';
import { getMagacinSviProizvodi } from '../../utils/supabaseRadnik';

/**
 * 📋 MAGACIN PREGLED
 * Lista svih proizvoda u magacinu sa search-om
 */
export default function MagacinPregled({ onPromeniLokaciju }) {
    const [proizvodi, setProizvodi] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        loadProizvodi();
    }, []);

    const loadProizvodi = async () => {
        try {
            const data = await getMagacinSviProizvodi();
            setProizvodi(data || []);
        } catch (err) {
            console.error('Greška:', err);
        } finally {
            setLoading(false);
        }
    };

    // Filter
    const filtrirani = proizvodi.filter((p) => {
        const nalog = p.nalog || {};
        const searchLower = search.toLowerCase();
        
        return (
            nalog.pon_br?.toLowerCase().includes(searchLower) ||
            nalog.tip_proizvoda?.toLowerCase().includes(searchLower) ||
            p.lokacija?.toLowerCase().includes(searchLower)
        );
    });

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
                marginBottom: 16
            }}>
                📋 Pregled magacina
            </h2>

            {/* SEARCH */}
            <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Pretraži po nalogu, proizvodu ili lokaciji..."
                style={{
                    width: '100%',
                    padding: 14,
                    border: '2px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 15,
                    marginBottom: 20,
                    outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#7c3aed'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />

            {loading ? (
                <p style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>
                    ⏳ Učitavam proizvode...
                </p>
            ) : filtrirani.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    padding: 60,
                    color: '#94a3b8'
                }}>
                    <div style={{ fontSize: 60, marginBottom: 16 }}>📦</div>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                        {search ? 'Nema rezultata pretrage' : 'Magacin je prazan'}
                    </p>
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            style={{
                                padding: '8px 16px',
                                background: '#7c3aed',
                                color: 'white',
                                border: 'none',
                                borderRadius: 6,
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                marginTop: 12
                            }}
                        >
                            Obriši pretragu
                        </button>
                    )}
                </div>
            ) : (
                <>
                    <p style={{
                        fontSize: 14,
                        color: '#64748b',
                        marginBottom: 16
                    }}>
                        Ukupno: <strong>{filtrirani.length}</strong> proizvoda
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {filtrirani.map((proizvod) => {
                            const nalog = proizvod.nalog || {};

                            return (
                                <div
                                    key={proizvod.id}
                                    style={{
                                        padding: 16,
                                        border: '2px solid #e2e8f0',
                                        borderRadius: 8,
                                        background: 'white',
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
                                                fontSize: 16,
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
                                                fontSize: 13,
                                                color: '#64748b',
                                                marginBottom: 4
                                            }}>
                                                📊 Količina: {proizvod.kolicina} kom
                                            </p>

                                            <p style={{
                                                fontSize: 14,
                                                fontWeight: 600,
                                                color: '#7c3aed',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6
                                            }}>
                                                📍 {proizvod.lokacija || 'N/A'}
                                            </p>
                                        </div>

                                        <div style={{
                                            padding: '6px 12px',
                                            background: '#dcfce7',
                                            color: '#166534',
                                            borderRadius: 6,
                                            fontSize: 12,
                                            fontWeight: 600
                                        }}>
                                            ✓ U MAGACINU
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => onPromeniLokaciju(proizvod)}
                                        style={{
                                            width: '100%',
                                            padding: 10,
                                            background: '#f1f5f9',
                                            color: '#475569',
                                            border: 'none',
                                            borderRadius: 6,
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            marginTop: 8
                                        }}
                                    >
                                        🔄 Promeni lokaciju
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
