import React, { useEffect, useMemo, useRef, useState } from 'react';
import { callGeminiAI } from './geminiAI';
import { fetchAIContext, buildAIPrompt, saveAIInteraction, AI_TABLES } from './services/aiDataHub';

function StatCard({ label, value, sub, color = '#2563eb' }) {
    return (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color, marginTop: 4 }}>{value}</div>
            {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

function TableStatus({ status }) {
    const ok = status.filter(t => !t.error && t.count > 0).length;
    return (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 900, color: '#0f172a' }}>Povezane tabele</div>
                <span style={{ fontSize: 12, fontWeight: 900, padding: '4px 8px', borderRadius: 999, background: '#dcfce7', color: '#166534' }}>{ok}/{AI_TABLES.length}</span>
            </div>
            <div style={{ maxHeight: 240, overflow: 'auto', display: 'grid', gap: 6 }}>
                {status.map(t => (
                    <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: t.error ? '#fff7ed' : t.count ? '#f0fdf4' : '#f8fafc', border: '1px solid ' + (t.error ? '#fed7aa' : t.count ? '#bbf7d0' : '#e2e8f0') }}>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{t.label}</div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>{t.table}</div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 900, color: t.error ? '#ea580c' : '#166534' }}>{t.error ? '!' : t.count}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function AIChatAssistant() {
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: 'Zdravo! Ja sam centralni AI asistent za Maropack. Sada čitam sve ključne tabele: proizvode, materijale, kalkulacije, ponude, naloge, magacin/rolne, planove rezanja, potrošnju, mašine, radnike i proizvodne sesije.'
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [aiData, setAiData] = useState(null);
    const [dataLoading, setDataLoading] = useState(true);
    const [dataError, setDataError] = useState('');
    const messagesEndRef = useRef(null);

    async function loadAIData() {
        setDataLoading(true);
        setDataError('');
        try {
            const data = await fetchAIContext();
            setAiData(data);
        } catch (err) {
            console.error('AI data load error:', err);
            setDataError(err.message || String(err));
        } finally {
            setDataLoading(false);
        }
    }

    useEffect(() => { loadAIData(); }, []);
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const summary = aiData?.summary || {};
    const suggestions = useMemo(() => [
        'Daj mi pregled stanja magacina po materijalu i širini.',
        'Koji nalozi imaju rizik da nemamo dovoljno materijala?',
        'Koji proizvodi prave najveći otpad po širini?',
        'Predloži plan rezanja za aktivne naloge iz magacina.',
        'Koji kupci najviše koriste BOPP FXCB 20µ?',
        'Daj mi šta treba poručiti za sledeće naloge.',
        'Proveri da li postoje problematične rolne ili rezervacije.',
        'Napravi menadžerski izveštaj proizvodnje i magacina.'
    ], []);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            let data = aiData;
            if (!data) {
                data = await fetchAIContext();
                setAiData(data);
            }

            const prompt = buildAIPrompt(userMessage, data);
            const aiResponse = await callGeminiAI(prompt, { temperature: 0.25, maxOutputTokens: 6000 });
            setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
            saveAIInteraction({ question: userMessage, answer: aiResponse, summary: data.summary });
        } catch (error) {
            console.error('AI error:', error);
            const fallback = error.message?.includes('Gemini API key')
                ? 'AI je povezan sa tabelama, ali Gemini ključ nije podešen. Dodaj VITE_GEMINI_API_KEY u .env pa restartuj aplikaciju. Podatke iz tabela već mogu da učitam u panelu desno.'
                : 'Greška AI asistenta: ' + (error.message || String(error));
            setMessages(prev => [...prev, { role: 'assistant', content: '❌ ' + fallback }]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{ padding: 20, background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
                <div>
                    <h1 style={{ fontSize: 30, fontWeight: 900, color: '#0f172a', margin: 0 }}>🤖 Centralni AI asistent</h1>
                    <p style={{ color: '#64748b', marginTop: 8, maxWidth: 820 }}>
                        AI je povezan sa celim ERP/MES sistemom: baza proizvoda, materijali, kalkulacije, ponude, nalozi, magacin, planovi rezanja, potrošnja, mašine, radnici i proizvodnja.
                    </p>
                </div>
                <button onClick={loadAIData} disabled={dataLoading} style={{ padding: '12px 18px', borderRadius: 12, border: 'none', background: dataLoading ? '#94a3b8' : '#0f172a', color: 'white', fontWeight: 900, cursor: dataLoading ? 'not-allowed' : 'pointer' }}>
                    {dataLoading ? 'Učitavam...' : '🔄 Osveži podatke'}
                </button>
            </div>

            {dataError && <div style={{ padding: 14, borderRadius: 12, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', marginBottom: 16 }}>Greška učitavanja podataka: {dataError}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 16 }}>
                <StatCard label="Proizvodi" value={summary.broj_proizvoda ?? '—'} sub="baza proizvoda" />
                <StatCard label="Nalozi" value={summary.broj_naloga ?? '—'} sub={(summary.aktivni_nalozi ?? 0) + ' aktivnih'} color="#7c3aed" />
                <StatCard label="Ponude" value={summary.broj_ponuda ?? '—'} sub="u sistemu" color="#0891b2" />
                <StatCard label="Rolne" value={summary.rolni_u_magacinu ?? '—'} sub="magacin" color="#059669" />
                <StatCard label="Metara" value={(summary.ukupno_metara_magacin || 0).toLocaleString('sr-RS')} sub="u magacinu" color="#ea580c" />
                <StatCard label="Potrošnja" value={summary.zapisa_potrosnje ?? '—'} sub="zapisa analize" color="#dc2626" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
                <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', minHeight: 620, border: '1px solid #e2e8f0' }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {messages.map((msg, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                <div style={{ maxWidth: '78%', padding: 16, borderRadius: 14, background: msg.role === 'user' ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : '#f8fafc', color: msg.role === 'user' ? 'white' : '#0f172a', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 8, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        {msg.role === 'user' ? '👤 Ti' : '🤖 Maropack AI'}
                                    </div>
                                    <div style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                                </div>
                            </div>
                        ))}
                        {loading && <div style={{ padding: 16, borderRadius: 12, background: '#f8fafc', color: '#64748b', width: 'fit-content', border: '1px solid #e2e8f0' }}>AI čita tabele i analizira podatke...</div>}
                        <div ref={messagesEndRef} />
                    </div>

                    {messages.length === 1 && (
                        <div style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', marginBottom: 10 }}>💡 BRZA PITANJA</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {suggestions.map((s, idx) => (
                                    <button key={idx} onClick={() => setInput(s)} style={{ padding: '8px 12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#334155', cursor: 'pointer' }}>{s}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ padding: 18, borderTop: '2px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Pitaj AI: npr. šta treba poručiti, koji nalog ima rizik, koji materijal pravi otpad..." disabled={loading} style={{ flex: 1, padding: '14px 18px', border: '2px solid #e2e8f0', borderRadius: 12, fontSize: 15, outline: 'none' }} />
                            <button type="submit" disabled={loading || !input.trim()} style={{ padding: '14px 28px', background: loading || !input.trim() ? '#94a3b8' : '#2563eb', color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 900, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer' }}>Pošalji</button>
                        </div>
                    </form>
                </div>

                <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
                    <TableStatus status={aiData?.tableStatus || []} />
                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14 }}>
                        <div style={{ fontWeight: 900, color: '#0f172a', marginBottom: 10 }}>Magacin po materijalu</div>
                        <div style={{ display: 'grid', gap: 7, maxHeight: 260, overflow: 'auto' }}>
                            {Object.entries(summary.magacin_po_materijalu || {}).slice(0, 12).map(([mat, v]) => (
                                <div key={mat} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, background: '#f8fafc' }}>
                                    <div style={{ fontSize: 12, fontWeight: 900 }}>{mat}</div>
                                    <div style={{ fontSize: 12, color: '#64748b' }}>{v.rolni} rolni · {Math.round(v.metara).toLocaleString('sr-RS')} m</div>
                                </div>
                            ))}
                            {!Object.keys(summary.magacin_po_materijalu || {}).length && <div style={{ fontSize: 13, color: '#94a3b8' }}>Nema učitanih podataka iz magacina.</div>}
                        </div>
                    </div>
                    <div style={{ background: '#0f172a', color: 'white', borderRadius: 14, padding: 16 }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>Šta AI sada zna?</div>
                        <div style={{ fontSize: 13, lineHeight: 1.6, color: '#cbd5e1' }}>
                            Može da odgovara na pitanja o stanju magacina, potrebama materijala, nalozima, ponudama, proizvodima, potrošnji, otpadu, planu rezanja i rizicima proizvodnje. Ne menja podatke sam; daje predlog i sledeći korak.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
