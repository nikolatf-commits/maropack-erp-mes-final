import React, { useState } from 'react';
import { getRadnikByQR, getRadnikByIme } from '../../utils/supabaseRadnik';

/**
 * 🔐 RADNIK LOGIN
 * Metode: QR skeniranje ili ručni unos imena
 */
export default function RadnikLogin({ onLogin }) {
    const [ime, setIme] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // QR Skeniranje
    const handleQRScan = async () => {
        try {
            setLoading(true);
            setError('');
            
            // Simulacija QR skeniranja - u produkciji koristiti pravi QR scanner
            const qrKod = prompt('Skeniraj QR kod radnika (npr. R-001):');
            if (!qrKod) {
                setLoading(false);
                return;
            }

            const radnik = await getRadnikByQR(qrKod);
            
            if (radnik) {
                onLogin(radnik);
            } else {
                setError('Radnik sa ovim QR kodom nije pronađen!');
            }
        } catch (err) {
            console.error('QR greška:', err);
            setError('Greška pri skeniranju QR koda.');
        } finally {
            setLoading(false);
        }
    };

    // Ručni unos imena
    const handleManualLogin = async (e) => {
        e.preventDefault();
        
        if (!ime.trim()) {
            setError('Molim te unesi ime!');
            return;
        }

        try {
            setLoading(true);
            setError('');

            const radnik = await getRadnikByIme(ime.trim());
            
            if (radnik) {
                onLogin(radnik);
            } else {
                setError('Radnik sa ovim imenom nije pronađen!');
            }
        } catch (err) {
            console.error('Login greška:', err);
            setError('Greška pri prijavi.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            maxWidth: 400,
            margin: '0 auto',
            paddingTop: 60
        }}>
            {/* HEADER */}
            <div style={{
                background: 'white',
                borderRadius: 12,
                padding: 30,
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                textAlign: 'center'
            }}>
                <div style={{
                    width: 80,
                    height: 80,
                    background: '#0f766e',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 20px',
                    fontSize: 40
                }}>
                    👤
                </div>
                
                <h2 style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: '#1e293b',
                    marginBottom: 8
                }}>
                    Radnik Panel
                </h2>
                
                <p style={{
                    color: '#64748b',
                    fontSize: 14,
                    marginBottom: 30
                }}>
                    Prijavi se da bi započeo rad
                </p>

                {/* QR SKENIRANJE */}
                <button
                    onClick={handleQRScan}
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: 16,
                        background: '#0f766e',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 16,
                        fontWeight: 600,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        marginBottom: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        opacity: loading ? 0.6 : 1
                    }}
                >
                    📷 Skeniraj QR kod
                </button>

                {/* SEPARATOR */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    margin: '20px 0',
                    color: '#94a3b8',
                    fontSize: 14
                }}>
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                    ili
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                </div>

                {/* RUČNI UNOS */}
                <form onSubmit={handleManualLogin}>
                    <input
                        type="text"
                        value={ime}
                        onChange={(e) => setIme(e.target.value)}
                        placeholder="Unesi svoje ime i prezime"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: 14,
                            border: '2px solid #e2e8f0',
                            borderRadius: 8,
                            fontSize: 15,
                            marginBottom: 12,
                            outline: 'none',
                            transition: 'border 0.2s'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#0f766e'}
                        onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                    />
                    
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: 14,
                            background: loading ? '#94a3b8' : '#1e293b',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 15,
                            fontWeight: 600,
                            cursor: loading ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {loading ? '⏳ Učitavam...' : '✓ Potvrdi i nastavi'}
                    </button>
                </form>

                {/* ERROR MESSAGE */}
                {error && (
                    <div style={{
                        marginTop: 16,
                        padding: 12,
                        background: '#fee2e2',
                        color: '#991b1b',
                        borderRadius: 8,
                        fontSize: 14
                    }}>
                        ⚠️ {error}
                    </div>
                )}
            </div>
        </div>
    );
}
