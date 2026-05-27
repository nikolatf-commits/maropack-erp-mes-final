import React, { useEffect, useState } from 'react';
import { MaterialText } from '../MaterialSelectorPRO.jsx';
import QRCode from 'qrcode';

/**
 * 📱 QR KOD GENERATOR ZA RADNE NALOGE
 * 
 * Generiše QR kod za brzi pristup nalogu
 * Format: NALOG-{id}-{tip}
 * 
 * @param {string} nalogId - ID naloga iz baze
 * @param {string} tip - tip naloga (folija/kesa/spulna)
 * @param {number} size - veličina QR koda u px (default: 150)
 */
export default function NalogQRCode({ nalogId, tip, size = 150 }) {
    const [qrUrl, setQrUrl] = useState('');
    const [error, setError] = useState(false);

    useEffect(() => {
        generateQR();
    }, [nalogId, tip]);

    const generateQR = async () => {
        try {
            // Format: NALOG-12345-FOLIJA
            const data = `NALOG-${nalogId}-${tip.toUpperCase()}`;
            
            const url = await QRCode.toDataURL(data, {
                width: size * 2, // Higher resolution for print
                margin: 1,
                color: {
                    dark: '#1e293b',
                    light: '#ffffff'
                },
                errorCorrectionLevel: 'M'
            });
            
            setQrUrl(url);
            setError(false);
        } catch (err) {
            console.error('QR generisanje greška:', err);
            setError(true);
        }
    };

    if (error) {
        return (
            <div style={{
                width: size,
                height: size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fee2e2',
                borderRadius: 8,
                fontSize: 12,
                color: '#991b1b',
                textAlign: 'center',
                padding: 8
            }}>
                ❌ QR greška
            </div>
        );
    }

    if (!qrUrl) {
        return (
            <div style={{
                width: size,
                height: size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f1f5f9',
                borderRadius: 8
            }}>
                <div className="animate-spin" style={{
                    width: 24,
                    height: 24,
                    border: '3px solid #cbd5e1',
                    borderTopColor: '#3b82f6',
                    borderRadius: '50%'
                }} />
            </div>
        );
    }

    return (
        <div style={{
            display: 'inline-block',
            padding: 8,
            background: 'white',
            borderRadius: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
            <img 
                src={qrUrl} 
                alt={`QR Kod - Nalog ${nalogId}`}
                style={{ 
                    width: size, 
                    height: size,
                    display: 'block'
                }} 
            />
            <div style={{
                fontSize: 10,
                color: '#64748b',
                textAlign: 'center',
                marginTop: 4,
                fontWeight: 600
            }}>
                #{nalogId}
            </div>
        </div>
    );
}

/**
 * 📄 QR KOD HEADER ZA ŠTAMPANE NALOGE
 * Prikazuje QR kod u gornjem desnom uglu
 */
export function NalogQRHeader({ nalogId, tip, naslov, brojNaloga }) {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 20,
            paddingBottom: 16,
            borderBottom: '2px solid #e2e8f0'
        }}>
            <div style={{ flex: 1 }}>
                <h1 style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: '#1e293b',
                    marginBottom: 8
                }}>
                    {naslov || 'RADNI NALOG'}
                </h1>
                <div style={{ fontSize: 14, color: '#64748b' }}>
                    <strong>Broj naloga:</strong> {brojNaloga || nalogId}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Tip: {tip.toUpperCase()} • Datum: {new Date().toLocaleDateString('sr-RS')}
                </div>
            </div>
            
            <div style={{ textAlign: 'center' }}>
                <NalogQRCode nalogId={nalogId} tip={tip} size={120} />
                <div style={{
                    fontSize: 11,
                    color: '#64748b',
                    marginTop: 8,
                    fontWeight: 600
                }}>
                    📱 Skeniraj za brzi pristup
                </div>
            </div>
        </div>
    );
}


// V47_NALOG_FULL_MATERIAL_NAME: nalozi treba da prikazuju pun naziv materijala: VRSTA + OZNAKA + DEBLJINA, npr. BOPP FXCB 20µ.
