import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { callGeminiJSON } from './geminiAI';

export default function AIQualityInspector() {
    const [nalozi, setNalozi] = useState([]);
    const [analyzing, setAnalyzing] = useState(false);
    const [inspection, setInspection] = useState(null);

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

    async function analyzeQuality() {
        setAnalyzing(true);
        setInspection(null);

        try {
            const naloziData = nalozi.map(n => ({
                ponBr: n.ponBr,
                materijal: n.materijal_struktura || n.mats,
                kvalitet: n.kvalitet_ocena || 'N/A',
                defekti: n.defekti || [],
                reklamacije: n.reklamacije || 0
            }));

            const prompt = `Ti si AI inspektor kvaliteta za fabriku fleksibilne ambalaže.

PODACI O NALOZIMA:
${JSON.stringify(naloziData, null, 2)}

ZADATAK:
Analiziraj kvalitet proizvodnje i identifikuj probleme.

Vrati JSON odgovor:
{
  "overallScore": "ukupan quality score 0-100",
  "criticalIssues": [
    {
      "issue": "opis problema",
      "severity": "high/medium/low",
      "affectedOrders": "broj naloga",
      "recommendation": "preporuka"
    }
  ],
  "topPerformers": [
    {
      "ponBr": "nalog broj",
      "score": "ocena",
      "reason": "razlog dobre ocene"
    }
  ],
  "improvements": [
    {
      "area": "oblast",
      "action": "konkretna akcija",
      "impact": "očekivani uticaj"
    }
  ]
}

VAŽNO: Vrati SAMO JSON.`;

            const aiResponse = await callGeminiJSON(prompt);
            setInspection(aiResponse);

        } catch (error) {
            console.error('AI error:', error);
            alert('Greška pri AI analizi: ' + error.message);
        }

        setAnalyzing(false);
    }

    return (
        <div style={{ padding: 20, background: '#f8fafc', minHeight: '100vh' }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                ✅ AI Quality Inspector
            </h1>
            <p style={{ color: '#64748b', marginBottom: 24 }}>
                Automatska analiza kvaliteta proizvodnje
            </p>

            <button
                onClick={analyzeQuality}
                disabled={analyzing}
                style={{
                    padding: '16px 32px',
                    background: analyzing ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: analyzing ? 'not-allowed' : 'pointer',
                    marginBottom: 24
                }}
            >
                {analyzing ? '⏳ Analiziram...' : '✅ Analiziraj sa AI'}
            </button>

            {inspection && (
                <div>
                    <div style={{
                        background: 'white',
                        borderRadius: 12,
                        padding: 24,
                        marginBottom: 20,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: 48, fontWeight: 800, color: '#10b981' }}>
                            {inspection.overallScore}
                        </div>
                        <div style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>
                            Overall Quality Score
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
                        <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                                🔴 Critical Issues
                            </h3>
                            {inspection.criticalIssues?.map((issue, idx) => (
                                <div key={idx} style={{
                                    padding: 12,
                                    marginBottom: 12,
                                    background: '#fef2f2',
                                    borderRadius: 8,
                                    border: '1px solid #fca5a5'
                                }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{issue.issue}</div>
                                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                                        Severity: {issue.severity} | Affected: {issue.affectedOrders}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#10b981', marginTop: 8 }}>
                                        💡 {issue.recommendation}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                                ⭐ Top Performers
                            </h3>
                            {inspection.topPerformers?.map((perf, idx) => (
                                <div key={idx} style={{
                                    padding: 12,
                                    marginBottom: 8,
                                    background: '#f0fdf4',
                                    borderRadius: 8,
                                    border: '1px solid #86efac'
                                }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{perf.ponBr}</div>
                                    <div style={{ fontSize: 13, color: '#10b981', marginTop: 4 }}>
                                        Score: {perf.score}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                        {perf.reason}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
