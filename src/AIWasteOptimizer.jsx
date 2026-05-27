import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { callGeminiJSON } from './geminiAI';

export default function AIWasteOptimizer() {
    const [nalozi, setNalozi] = useState([]);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState(null);

    useEffect(() => {
        fetchNalozi();
    }, []);

    async function fetchNalozi() {
        const { data } = await supabase
            .from('nalozi')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        setNalozi(data || []);
    }

    async function analyzeWaste() {
        setAnalyzing(true);
        setAnalysis(null);

        try {
            const naloziData = nalozi.map(n => ({
                ponBr: n.ponBr,
                materijal: n.materijal_struktura || n.mats,
                sirina: n.sir,
                duzina: n.duz,
                kolicina: n.kol,
                skart: n.skart_procenat || 0
            }));

            const prompt = `Ti si AI optimizator otpada za fabriku fleksibilne ambalaže.

PODACI O NALOZIMA:
${JSON.stringify(naloziData, null, 2)}

ZADATAK:
Analiziraj škart i otpad i predloži optimizacije.

Vrati JSON odgovor:
{
  "topWasteSources": [
    {
      "source": "naziv izvora škarta",
      "percentage": "procenat ukupnog škarta",
      "cost": "procena troška u RSD"
    }
  ],
  "optimizations": [
    {
      "title": "naziv optimizacije",
      "description": "opis",
      "potentialSavings": "procena uštede u %",
      "implementation": "kako primeniti"
    }
  ],
  "materialEfficiency": {
    "currentUtilization": "procenat iskorišćenosti",
    "optimalUtilization": "optimalan procenat",
    "gap": "razlika"
  }
}

VAŽNO: Vrati SAMO JSON.`;

            const aiResponse = await callGeminiJSON(prompt);
            setAnalysis(aiResponse);

        } catch (error) {
            console.error('AI error:', error);
            alert('Greška pri AI analizi: ' + error.message);
        }

        setAnalyzing(false);
    }

    return (
        <div style={{ padding: 20, background: '#f8fafc', minHeight: '100vh' }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                ♻️ AI Waste Optimizer
            </h1>
            <p style={{ color: '#64748b', marginBottom: 24 }}>
                Analiza škarta i optimizacija iskorišćenosti materijala
            </p>

            <button
                onClick={analyzeWaste}
                disabled={analyzing}
                style={{
                    padding: '16px 32px',
                    background: analyzing ? '#94a3b8' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: analyzing ? 'not-allowed' : 'pointer',
                    marginBottom: 24
                }}
            >
                {analyzing ? '⏳ Analiziram...' : '♻️ Analiziraj sa AI'}
            </button>

            {analysis && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
                    <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                            🔴 Top Izvori Škarta
                        </h3>
                        {analysis.topWasteSources?.map((source, idx) => (
                            <div key={idx} style={{
                                padding: 12,
                                marginBottom: 8,
                                background: '#fef2f2',
                                borderRadius: 8,
                                border: '1px solid #fca5a5'
                            }}>
                                <div style={{ fontWeight: 700, fontSize: 14 }}>{source.source}</div>
                                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                                    {source.percentage} - {source.cost}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                            💡 Optimizacije
                        </h3>
                        {analysis.optimizations?.map((opt, idx) => (
                            <div key={idx} style={{
                                padding: 12,
                                marginBottom: 12,
                                background: '#f0fdf4',
                                borderRadius: 8,
                                border: '1px solid #86efac'
                            }}>
                                <div style={{ fontWeight: 700, fontSize: 14 }}>{opt.title}</div>
                                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                                    {opt.description}
                                </div>
                                <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginTop: 8 }}>
                                    💰 Ušteda: {opt.potentialSavings}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
