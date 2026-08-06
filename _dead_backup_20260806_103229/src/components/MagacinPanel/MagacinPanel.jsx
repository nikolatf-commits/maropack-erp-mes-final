import { kgFromMeters, calculateGm2, buildMaterialName } from '../../data/materialMaster.js';
import React, { useState } from 'react';
import MagacinListaCeka from './MagacinListaCeka';
import MagacinPregled from './MagacinPregled';
import MagacinPromenaLokacije from './MagacinPromenaLokacije';

/**
 * 📦 MAGACIN PANEL - GLAVNI WRAPPER
 * 
 * 3 ekrana:
 * 1. Lista čeka preuzimanje (real-time)
 * 2. Pregled svih proizvoda
 * 3. Promena lokacije
 */
export default function MagacinPanel() {
    const [page, setPage] = useState('lista_ceka'); // lista_ceka | pregled | promena_lokacije
    const [odabraniProizvod, setOdabraniProizvod] = useState(null);

    // Magacioner podaci (u realnosti bi se ulogovali)
    const magacioner = {
        ime: 'Petar',
        prezime: 'Petrović'
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
            padding: '20px'
        }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
                {/* HEADER */}
                <div style={{
                    background: 'white',
                    borderRadius: 12,
                    padding: 20,
                    marginBottom: 20,
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                }}>
                    <h1 style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: '#1e293b',
                        marginBottom: 4
                    }}>
                        📦 Magacin Panel
                    </h1>
                    <p style={{ color: '#64748b', fontSize: 14 }}>
                        {magacioner.ime} {magacioner.prezime}
                    </p>
                </div>

                {/* NAVIGACIJA */}
                <div style={{
                    display: 'flex',
                    gap: 12,
                    marginBottom: 20
                }}>
                    <button
                        onClick={() => setPage('lista_ceka')}
                        style={{
                            flex: 1,
                            padding: 14,
                            background: page === 'lista_ceka' ? '#7c3aed' : 'white',
                            color: page === 'lista_ceka' ? 'white' : '#64748b',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 15,
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: page === 'lista_ceka' ? '0 4px 15px rgba(124, 58, 237, 0.3)' : 'none'
                        }}
                    >
                        ⏳ Čeka preuzimanje
                    </button>

                    <button
                        onClick={() => setPage('pregled')}
                        style={{
                            flex: 1,
                            padding: 14,
                            background: page === 'pregled' ? '#7c3aed' : 'white',
                            color: page === 'pregled' ? 'white' : '#64748b',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 15,
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: page === 'pregled' ? '0 4px 15px rgba(124, 58, 237, 0.3)' : 'none'
                        }}
                    >
                        📋 Pregled magacina
                    </button>

                    <button
                        onClick={() => setPage('promena_lokacije')}
                        style={{
                            flex: 1,
                            padding: 14,
                            background: page === 'promena_lokacije' ? '#7c3aed' : 'white',
                            color: page === 'promena_lokacije' ? 'white' : '#64748b',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 15,
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: page === 'promena_lokacije' ? '0 4px 15px rgba(124, 58, 237, 0.3)' : 'none'
                        }}
                    >
                        🔄 Promena lokacije
                    </button>
                </div>

                {/* CONTENT */}
                {page === 'lista_ceka' && (
                    <MagacinListaCeka magacioner={magacioner} />
                )}

                {page === 'pregled' && (
                    <MagacinPregled onPromeniLokaciju={(proizvod) => {
                        setOdabraniProizvod(proizvod);
                        setPage('promena_lokacije');
                    }} />
                )}

                {page === 'promena_lokacije' && (
                    <MagacinPromenaLokacije
                        proizvod={odabraniProizvod}
                        onBack={() => {
                            setOdabraniProizvod(null);
                            setPage('pregled');
                        }}
                    />
                )}
            </div>
        </div>
    );
}
