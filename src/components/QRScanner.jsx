import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * 📷 QR SCANNER KOMPONENTA
 * Koristi HTML5 QR Code Scanner
 * 
 * Props:
 * - onScan: callback funkcija koja prima skenirani QR kod
 * - onClose: callback funkcija za zatvaranje scannera
 */
export default function QRScanner({ onScan, onClose }) {
    const scannerRef = useRef(null);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let html5QrCode = null;

        const startScanner = async () => {
            try {
                html5QrCode = new Html5Qrcode("qr-reader");
                
                await html5QrCode.start(
                    { facingMode: "environment" }, // Zadnja kamera
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 }
                    },
                    (decodedText) => {
                        // Uspešno skeniran QR kod
                        console.log('QR Skeniran:', decodedText);
                        onScan(decodedText);
                        
                        // Zaustavi scanner nakon skeniranja
                        if (html5QrCode) {
                            html5QrCode.stop().then(() => {
                                html5QrCode.clear();
                            }).catch(err => console.error('Stop error:', err));
                        }
                    },
                    (errorMessage) => {
                        // Greška pri skeniranju (normalno se dešava dok traži QR)
                        // console.log('Scanning...', errorMessage);
                    }
                );
                
                setScanning(true);
            } catch (err) {
                console.error('Scanner start error:', err);
                setError('Greška pri pokretanju kamere. Dozvoli pristup kameri u browseru.');
            }
        };

        startScanner();

        // Cleanup
        return () => {
            if (html5QrCode) {
                html5QrCode.stop().then(() => {
                    html5QrCode.clear();
                }).catch(err => console.error('Cleanup error:', err));
            }
        };
    }, [onScan]);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.9)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
        }}>
            {/* HEADER */}
            <div style={{
                background: 'white',
                borderRadius: '12px 12px 0 0',
                padding: 20,
                width: '100%',
                maxWidth: 500,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h3 style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#1e293b',
                    margin: 0
                }}>
                    📷 Skeniraj QR kod
                </h3>
                
                <button
                    onClick={onClose}
                    style={{
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px 16px',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    ✕ Zatvori
                </button>
            </div>

            {/* SCANNER */}
            <div style={{
                background: 'white',
                width: '100%',
                maxWidth: 500,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                borderRadius: '0 0 12px 12px'
            }}>
                {error ? (
                    <div style={{
                        padding: 20,
                        background: '#fee2e2',
                        color: '#991b1b',
                        borderRadius: 8,
                        fontSize: 14,
                        textAlign: 'center'
                    }}>
                        ⚠️ {error}
                    </div>
                ) : (
                    <>
                        <div id="qr-reader" style={{ width: '100%' }}></div>
                        
                        {scanning && (
                            <p style={{
                                marginTop: 16,
                                fontSize: 14,
                                color: '#64748b',
                                textAlign: 'center'
                            }}>
                                🎯 Usmeri kameru na QR kod...
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
