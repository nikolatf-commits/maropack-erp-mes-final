import React, { useState } from 'react';
import { supabase } from '../../supabase';

/**
 * 🎉 ZAVRŠENA POSLEDNJA FAZA
 * Automatski šalje proizvod u magacin (status: ČEKA_PREUZIMANJE)
 */
export default function ZavrsenaPosljednjaFaza({ nalog, onBack }) {
    const [loading, setLoading] = useState(false);

    // Pošalji u magacin
    const handlePosaljiUMagacin = async () => {
        try {
            setLoading(true);

            // 1. Kreiraj zapis u magacin_gotovi_proizvodi
            const { data: proizvod, error: errorProizvod } = await supabase
                .from('magacin_gotovi_proizvodi')
                .insert({
                    nalog_id: nalog.id,
                    kolicina: nalog.kolicina || 1,
                    status: 'CEKA_PREUZIMANJE',
                    sektor: null,
                    red: null,
                    polica: null
                })
                .select()
                .single();

            if (errorProizvod) throw errorProizvod;

            // 2. Označi nalog kao ZAVRŠEN
            const { error: errorNalog } = await supabase
                .from('nalozi')
                .update({ status: 'ZAVRSENO_CEKA_MAGACIN' })
                .eq('id', nalog.id);

            if (errorNalog) throw errorNalog;

            alert('✅ Proizvod je poslat u magacin!');
            onBack();
        } catch (err) {
            console.error('Greška:', err);
            alert('❌ Greška pri slanju u magacin!');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            maxWidth: 500,
            margin: '60px auto',
            background: 'white',
            borderRadius: 12,
            padding: 40,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            textAlign: 'center'
        }}>
            {/* IKONA */}
            <div style={{
                width: 100,
                height: 100,
                background: 'linear-gradient(135deg, #0f766e 0%, #134e4a 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 50,
                margin: '0 auto 24px',
                boxShadow: '0 8px 30px rgba(15, 118, 110, 0.3)'
            }}>
                🎉
            </div>

            {/* NASLOV */}
            <h2 style={{
                fontSize: 24,
                fontWeight: 700,
                color: '#1e293b',
                marginBottom: 12
            }}>
                Sve faze završene!
            </h2>

            <p style={{
                fontSize: 15,
                color: '#64748b',
                marginBottom: 8
            }}>
                Nalog: <strong>{nalog.pon_br}</strong>
            </p>

            <p style={{
                fontSize: 14,
                color: '#64748b',
                marginBottom: 32
            }}>
                {nalog.tip_proizvoda} - {nalog.kolicina} kom
            </p>

            {/* INFO BOX */}
            <div style={{
                background: '#f0fdfa',
                border: '2px solid #0f766e',
                borderRadius: 8,
                padding: 16,
                marginBottom: 32,
                textAlign: 'left'
            }}>
                <p style={{
                    fontSize: 14,
                    color: '#0f766e',
                    fontWeight: 600,
                    marginBottom: 8
                }}>
                    ℹ️ Šta sledi?
                </p>
                <p style={{
                    fontSize: 13,
                    color: '#134e4a',
                    lineHeight: 1.6
                }}>
                    Proizvod će biti automatski poslat u magacin sa statusom
                    <strong> ČEKA PREUZIMANJE</strong>. Magacioner će ga pronaći
                    u listi i smestiti na lokaciju.
                </p>
            </div>

            {/* DUGMAD */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12
            }}>
                <button
                    onClick={handlePosaljiUMagacin}
                    disabled={loading}
                    style={{
                        padding: 16,
                        background: loading ? '#94a3b8' : '#0f766e',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 16,
                        fontWeight: 700,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        boxShadow: loading ? 'none' : '0 4px 15px rgba(15, 118, 110, 0.3)'
                    }}
                >
                    {loading ? '⏳ Šaljem...' : '📦 Pošalji u magacin'}
                </button>

                <button
                    onClick={onBack}
                    disabled={loading}
                    style={{
                        padding: 14,
                        background: 'transparent',
                        color: '#64748b',
                        border: '2px solid #e2e8f0',
                        borderRadius: 8,
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                >
                    ← Nazad na listu
                </button>
            </div>
        </div>
    );
}
