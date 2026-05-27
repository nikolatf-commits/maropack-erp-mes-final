import { kgFromMeters, calculateGm2, buildMaterialName } from '../../data/materialMaster.js';
import React, { useState } from 'react';
import { promeniLokaciju } from '../../utils/supabaseRadnik';

/**
 * 🔄 MAGACIN PROMENA LOKACIJE
 * Nova lokacija + razlog + istorija
 */
export default function MagacinPromenaLokacije({ proizvod, onBack }) {
    const [noviSektor, setNoviSektor] = useState('');
    const [noviRed, setNoviRed] = useState('');
    const [novaPolica, setNovaPolica] = useState('');
    const [razlog, setRazlog] = useState('');
    const [loading, setLoading] = useState(false);

    const sektori = ['A', 'B', 'C', 'D'];
    const redovi = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const police = ['1', '2', '3', '4', '5'];

    const handlePromeni = async () => {
        if (!noviSektor || !noviRed || !novaPolica) {
            alert('❌ Molim te odaberi sektor, red i policu!');
            return;
        }

        if (!razlog.trim()) {
            alert('❌ Molim te unesi razlog promene!');
            return;
        }

        const novaLokacija = `${noviSektor}${noviRed}-${novaPolica}`;

        if (novaLokacija === proizvod.lokacija) {
            alert('❌ Nova lokacija je ista kao trenutna!');
            return;
        }

        if (!window.confirm(`Promeniti lokaciju na: ${novaLokacija}?`)) {
            return;
        }

        try {
            setLoading(true);
            await promeniLokaciju(proizvod.id, noviSektor, parseInt(noviRed), parseInt(novaPolica), razlog);
            alert(`✅ Lokacija promenjena na: ${novaLokacija}`);
            onBack();
        } catch (err) {
            console.error('Greška:', err);
            alert('❌ Greška pri promeni lokacije!');
        } finally {
            setLoading(false);
        }
    };

    const nalog = proizvod?.nalog || {};
    const istorija = proizvod?.istorija_lokacija || [];

    if (!proizvod) {
        return (
            <div style={{
                background: 'white',
                borderRadius: 12,
                padding: 40,
                textAlign: 'center'
            }}>
                <p style={{ color: '#64748b' }}>
                    Molim te odaberi proizvod iz pregleda magacina.
                </p>
                <button
                    onClick={onBack}
                    style={{
                        padding: '10px 20px',
                        background: '#7c3aed',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginTop: 16
                    }}
                >
                    ← Nazad na pregled
                </button>
            </div>
        );
    }

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
                🔄 Promena lokacije
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
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                    {nalog.tip_proizvoda || 'N/A'}
                </p>
                <p style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#7c3aed',
                    marginTop: 8
                }}>
                    📍 Trenutna lokacija: {proizvod.lokacija || 'N/A'}
                </p>
            </div>

            {/* NOVA LOKACIJA */}
            <div style={{ marginBottom: 24 }}>
                <label style={{
                    display: 'block',
                    fontSize: 15,
                    fontWeight: 600,
                    color: '#1e293b',
                    marginBottom: 12
                }}>
                    Sektor:
                </label>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 10
                }}>
                    {sektori.map((s) => (
                        <button
                            key={s}
                            onClick={() => setNoviSektor(s)}
                            style={{
                                padding: 14,
                                background: noviSektor === s ? '#7c3aed' : 'white',
                                color: noviSektor === s ? 'white' : '#64748b',
                                border: `2px solid ${noviSektor === s ? '#7c3aed' : '#e2e8f0'}`,
                                borderRadius: 8,
                                fontSize: 16,
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {noviSektor && (
                <div style={{ marginBottom: 24 }}>
                    <label style={{
                        display: 'block',
                        fontSize: 15,
                        fontWeight: 600,
                        color: '#1e293b',
                        marginBottom: 12
                    }}>
                        Red:
                    </label>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: 10
                    }}>
                        {redovi.map((r) => (
                            <button
                                key={r}
                                onClick={() => setNoviRed(r)}
                                style={{
                                    padding: 12,
                                    background: noviRed === r ? '#7c3aed' : 'white',
                                    color: noviRed === r ? 'white' : '#64748b',
                                    border: `2px solid ${noviRed === r ? '#7c3aed' : '#e2e8f0'}`,
                                    borderRadius: 8,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {noviRed && (
                <div style={{ marginBottom: 24 }}>
                    <label style={{
                        display: 'block',
                        fontSize: 15,
                        fontWeight: 600,
                        color: '#1e293b',
                        marginBottom: 12
                    }}>
                        Polica:
                    </label>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: 10
                    }}>
                        {police.map((p) => (
                            <button
                                key={p}
                                onClick={() => setNovaPolica(p)}
                                style={{
                                    padding: 12,
                                    background: novaPolica === p ? '#7c3aed' : 'white',
                                    color: novaPolica === p ? 'white' : '#64748b',
                                    border: `2px solid ${novaPolica === p ? '#7c3aed' : '#e2e8f0'}`,
                                    borderRadius: 8,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* RAZLOG */}
            <div style={{ marginBottom: 24 }}>
                <label style={{
                    display: 'block',
                    fontSize: 15,
                    fontWeight: 600,
                    color: '#1e293b',
                    marginBottom: 12
                }}>
                    Razlog promene:
                </label>
                <textarea
                    value={razlog}
                    onChange={(e) => setRazlog(e.target.value)}
                    placeholder="Npr. premeštanje zbog organizacije, oštećenje police..."
                    style={{
                        width: '100%',
                        padding: 14,
                        border: '2px solid #e2e8f0',
                        borderRadius: 8,
                        fontSize: 14,
                        outline: 'none',
                        resize: 'vertical',
                        minHeight: 80,
                        fontFamily: 'inherit'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#7c3aed'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                />
            </div>

            {/* NOVA LOKACIJA PRIKAZ */}
            {noviSektor && noviRed && novaPolica && (
                <div style={{
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    color: 'white',
                    borderRadius: 12,
                    padding: 20,
                    marginBottom: 24,
                    textAlign: 'center'
                }}>
                    <p style={{ fontSize: 13, marginBottom: 6, opacity: 0.9 }}>
                        NOVA LOKACIJA:
                    </p>
                    <p style={{
                        fontSize: 32,
                        fontWeight: 700,
                        fontFamily: 'monospace'
                    }}>
                        {noviSektor}{noviRed}-{novaPolica}
                    </p>
                </div>
            )}

            {/* POTVRDI */}
            <button
                onClick={handlePromeni}
                disabled={loading || !noviSektor || !noviRed || !novaPolica || !razlog.trim()}
                style={{
                    width: '100%',
                    padding: 16,
                    background: loading || !noviSektor || !noviRed || !novaPolica || !razlog.trim() 
                        ? '#94a3b8' 
                        : '#7c3aed',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 17,
                    fontWeight: 700,
                    cursor: loading || !noviSektor || !noviRed || !novaPolica || !razlog.trim() 
                        ? 'not-allowed' 
                        : 'pointer',
                    marginBottom: 24
                }}
            >
                {loading ? '⏳ Menjam...' : '✓ Potvrdi promenu'}
            </button>

            {/* ISTORIJA */}
            {istorija.length > 0 && (
                <div>
                    <h3 style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: '#1e293b',
                        marginBottom: 12
                    }}>
                        📜 Istorija promena
                    </h3>
                    
                    <div style={{
                        border: '2px solid #e2e8f0',
                        borderRadius: 8,
                        overflow: 'hidden'
                    }}>
                        {istorija.map((item, index) => (
                            <div
                                key={index}
                                style={{
                                    padding: 14,
                                    borderBottom: index < istorija.length - 1 ? '1px solid #e2e8f0' : 'none',
                                    background: index % 2 === 0 ? '#f8fafc' : 'white'
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginBottom: 6
                                }}>
                                    <span style={{
                                        fontSize: 14,
                                        fontWeight: 600,
                                        color: '#1e293b'
                                    }}>
                                        {item.stara_lokacija} → {item.nova_lokacija}
                                    </span>
                                    <span style={{
                                        fontSize: 12,
                                        color: '#94a3b8'
                                    }}>
                                        {new Date(item.timestamp).toLocaleDateString('sr-RS')}
                                    </span>
                                </div>
                                <p style={{
                                    fontSize: 13,
                                    color: '#64748b'
                                }}>
                                    Razlog: {item.razlog}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
