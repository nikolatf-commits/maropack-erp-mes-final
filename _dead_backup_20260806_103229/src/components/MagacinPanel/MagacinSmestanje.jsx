import { kgFromMeters, calculateGm2, buildMaterialName } from '../../data/materialMaster.js';
import React, { useState } from 'react';
import { smestiProizvod } from '../../utils/supabaseRadnik';

/**
 * 📍 MAGACIN SMEŠTANJE
 * Geolociranje: Sektor → Red → Polica
 */
export default function MagacinSmestanje({ proizvod, magacioner, onBack }) {
    const [sektor, setSektor] = useState('');
    const [red, setRed] = useState('');
    const [polica, setPolica] = useState('');
    const [loading, setLoading] = useState(false);

    const sektori = ['A', 'B', 'C', 'D'];
    const redovi = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const police = ['1', '2', '3', '4', '5'];

    const handleSmesti = async () => {
        if (!sektor || !red || !polica) {
            alert('❌ Molim te odaberi sektor, red i policu!');
            return;
        }

        const finalnaLokacija = `${sektor}${red}-${polica}`;

        if (!window.confirm(`Smestiti proizvod na lokaciju: ${finalnaLokacija}?`)) {
            return;
        }

        try {
            setLoading(true);
            await smestiProizvod(proizvod.id, sektor, parseInt(red), parseInt(polica), magacioner?.id || null, `${magacioner?.ime || ''} ${magacioner?.prezime || ''}`.trim() || 'Magacioner');
            alert(`✅ Proizvod smešten na: ${finalnaLokacija}`);
            onBack();
        } catch (err) {
            console.error('Greška:', err);
            alert('❌ Greška pri smeštanju proizvoda!');
        } finally {
            setLoading(false);
        }
    };

    const nalog = proizvod.nalog || {};

    return (
        <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
            {/* HEADER */}
            <button
                onClick={onBack}
                disabled={loading}
                style={{
                    padding: '8px 16px',
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    marginBottom: 20,
                    color: '#475569'
                }}
            >
                ← Nazad
            </button>

            <h2 style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#1e293b',
                marginBottom: 20
            }}>
                📍 Odaberi lokaciju
            </h2>

            {/* INFO BOX */}
            <div style={{
                background: '#faf5ff',
                border: '2px solid #7c3aed',
                borderRadius: 8,
                padding: 16,
                marginBottom: 24
            }}>
                <p style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#1e293b',
                    marginBottom: 4
                }}>
                    {nalog.pon_br || `Proizvod #${proizvod.id}`}
                </p>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 2 }}>
                    {nalog.tip_proizvoda || 'N/A'}
                </p>
                <p style={{ fontSize: 13, color: '#64748b' }}>
                    Količina: {proizvod.kolicina} kom
                </p>
            </div>

            {/* GEOLOCIRANJE - 3 KORAKA */}
            
            {/* 1. SEKTOR */}
            <div style={{ marginBottom: 24 }}>
                <label style={{
                    display: 'block',
                    fontSize: 15,
                    fontWeight: 600,
                    color: '#1e293b',
                    marginBottom: 12
                }}>
                    1️⃣ Odaberi sektor:
                </label>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 10
                }}>
                    {sektori.map((s) => (
                        <button
                            key={s}
                            onClick={() => setSektor(s)}
                            style={{
                                padding: 16,
                                background: sektor === s ? '#7c3aed' : 'white',
                                color: sektor === s ? 'white' : '#64748b',
                                border: `2px solid ${sektor === s ? '#7c3aed' : '#e2e8f0'}`,
                                borderRadius: 8,
                                fontSize: 18,
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* 2. RED */}
            {sektor && (
                <div style={{ marginBottom: 24 }}>
                    <label style={{
                        display: 'block',
                        fontSize: 15,
                        fontWeight: 600,
                        color: '#1e293b',
                        marginBottom: 12
                    }}>
                        2️⃣ Odaberi red:
                    </label>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: 10
                    }}>
                        {redovi.map((r) => (
                            <button
                                key={r}
                                onClick={() => setRed(r)}
                                style={{
                                    padding: 14,
                                    background: red === r ? '#7c3aed' : 'white',
                                    color: red === r ? 'white' : '#64748b',
                                    border: `2px solid ${red === r ? '#7c3aed' : '#e2e8f0'}`,
                                    borderRadius: 8,
                                    fontSize: 16,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 3. POLICA */}
            {red && (
                <div style={{ marginBottom: 32 }}>
                    <label style={{
                        display: 'block',
                        fontSize: 15,
                        fontWeight: 600,
                        color: '#1e293b',
                        marginBottom: 12
                    }}>
                        3️⃣ Odaberi policu:
                    </label>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: 10
                    }}>
                        {police.map((p) => (
                            <button
                                key={p}
                                onClick={() => setPolica(p)}
                                style={{
                                    padding: 14,
                                    background: polica === p ? '#7c3aed' : 'white',
                                    color: polica === p ? 'white' : '#64748b',
                                    border: `2px solid ${polica === p ? '#7c3aed' : '#e2e8f0'}`,
                                    borderRadius: 8,
                                    fontSize: 16,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* FINALNA LOKACIJA */}
            {sektor && red && polica && (
                <div style={{
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    color: 'white',
                    borderRadius: 12,
                    padding: 24,
                    marginBottom: 24,
                    textAlign: 'center',
                    boxShadow: '0 4px 20px rgba(124, 58, 237, 0.3)'
                }}>
                    <p style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 8,
                        opacity: 0.9
                    }}>
                        FINALNA LOKACIJA:
                    </p>
                    <p style={{
                        fontSize: 36,
                        fontWeight: 700,
                        fontFamily: 'monospace'
                    }}>
                        {sektor}{red}-{polica}
                    </p>
                </div>
            )}

            {/* POTVRDI BUTTON */}
            <button
                onClick={handleSmesti}
                disabled={loading || !sektor || !red || !polica}
                style={{
                    width: '100%',
                    padding: 16,
                    background: loading || !sektor || !red || !polica ? '#94a3b8' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 17,
                    fontWeight: 700,
                    cursor: loading || !sektor || !red || !polica ? 'not-allowed' : 'pointer',
                    boxShadow: loading || !sektor || !red || !polica ? 'none' : '0 4px 15px rgba(16, 185, 129, 0.3)'
                }}
            >
                {loading ? '⏳ Smeštam...' : '✓ Potvrdi i smesti'}
            </button>
        </div>
    );
}
