import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

function fmt(v) {
    return Number(v || 0).toLocaleString('sr-RS', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

export default function ListaKalkulacija({ setPage, onOtvoriKalkulaciju, onKreirajPonudu }) {
    const [kalkulacije, setKalkulacije] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [tipFilter, setTipFilter] = useState('sve'); // 'sve', 'folija', 'kesa', 'spulna'
    const [sortBy, setSortBy] = useState('datum_desc'); // 'datum_desc', 'datum_asc', 'naziv', 'klijent', 'cena'

    useEffect(() => {
        loadKalkulacije();
    }, []);

    async function loadKalkulacije() {
        setLoading(true);
        try {
            // Učitaj iz sve 3 tabele
            const [folije, kese, spulne] = await Promise.all([
                supabase.from('kalkulacije_folije').select('*').order('created_at', { ascending: false }),
                supabase.from('kalkulacije_kese').select('*').order('created_at', { ascending: false }),
                supabase.from('kalkulacije_spulne').select('*').order('created_at', { ascending: false })
            ]);

            // Dodaj tip i spoji sve + lokalne kalkulacije iz Product Template Engine-a
            let lokalneTemplateKalkulacije = [];
            try {
                lokalneTemplateKalkulacije = JSON.parse(localStorage.getItem('maropack_template_kalkulacije') || '[]');
            } catch (e) {
                lokalneTemplateKalkulacije = [];
            }

            const sveKalkulacije = [
                ...lokalneTemplateKalkulacije.map(k => ({ ...k, iz_template: true })),
                ...(folije.data || []).map(k => ({ ...k, tip: 'folija' })),
                ...(kese.data || []).map(k => ({ ...k, tip: 'kesa' })),
                ...(spulne.data || []).map(k => ({ ...k, tip: 'spulna' }))
            ];

            setKalkulacije(sveKalkulacije);
        } catch (err) {
            console.error('Greška pri učitavanju:', err);
            alert('Greška pri učitavanju kalkulacija!');
        }
        setLoading(false);
    }

    async function obrisiKalkulaciju(kal) {
        if (!window.confirm('Da li ste sigurni da želite da obrišete ovu kalkulaciju?')) return;

        try {
            // Odaberi pravu tabelu
            const tabela = kal.tip === 'folija' ? 'kalkulacije_folije' :
                kal.tip === 'kesa' ? 'kalkulacije_kese' :
                    'kalkulacije_spulne';

            const { error } = await supabase
                .from(tabela)
                .delete()
                .eq('id', kal.id);

            if (error) throw error;

            setKalkulacije(kalkulacije.filter(k => !(k.id === kal.id && k.tip === kal.tip)));
            alert('Kalkulacija obrisana!');
        } catch (err) {
            console.error('Greška:', err);
            alert('Greška pri brisanju!');
        }
    }

    async function duplirajKalkulaciju(kal) {
        try {
            // Odaberi pravu tabelu
            const tabela = kal.tip === 'folija' ? 'kalkulacije_folije' :
                kal.tip === 'kesa' ? 'kalkulacije_kese' :
                    'kalkulacije_spulne';

            // Kopiraj sve podatke sem id i created_at
            const { id, created_at, updated_at, ...ostalo } = kal;
            const nova = {
                ...ostalo,
                naziv: (kal.naziv || 'Kalkulacija') + ' (kopija)'
            };

            const { data, error } = await supabase
                .from(tabela)
                .insert([nova])
                .select()
                .single();

            if (error) throw error;

            setKalkulacije([{ ...data, tip: kal.tip }, ...kalkulacije]);
            alert('Kalkulacija duplicirana!');
        } catch (err) {
            console.error('Greška:', err);
            alert('Greška pri dupliciranju!');
        }
    }

    // Filtriranje
    let filtrirane = kalkulacije;

    // Filter po tipu
    if (tipFilter !== 'sve') {
        filtrirane = filtrirane.filter(k => k.tip === tipFilter);
    }

    // Filter po tekstu
    if (filter) {
        filtrirane = filtrirane.filter(k =>
            [k.naziv, k.klijent, k.tip].join(' ').toLowerCase().includes(filter.toLowerCase())
        );
    }

    // Sortiranje
    filtrirane = [...filtrirane].sort((a, b) => {
        switch (sortBy) {
            case 'datum_desc':
                return new Date(b.created_at) - new Date(a.created_at);
            case 'datum_asc':
                return new Date(a.created_at) - new Date(b.created_at);
            case 'naziv':
                return (a.naziv || '').localeCompare(b.naziv || '');
            case 'klijent':
                return (a.klijent || '').localeCompare(b.klijent || '');
            case 'cena':
                return (b.konacna_cena || 0) - (a.konacna_cena || 0);
            default:
                return 0;
        }
    });

    return (
        <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
            {/* HEADER */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 24
            }}>
                <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>
                    📋 Lista Kalkulacija
                </h1>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        onClick={() => setPage('kalk_folija')}
                        style={btnPrimary}
                    >
                        ➕ Nova Folija
                    </button>
                    <button
                        onClick={() => setPage('kalk_kesa')}
                        style={btnPrimary}
                    >
                        ➕ Nova Kesa
                    </button>
                    <button
                        onClick={() => setPage('kalk_spulna')}
                        style={btnPrimary}
                    >
                        ➕ Nova Špulna
                    </button>
                </div>
            </div>

            {/* STATISTIKA */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
                marginBottom: 24
            }}>
                <div style={statCard('#3b82f6')}>
                    <div style={statLabel}>Ukupno</div>
                    <div style={statValue}>{kalkulacije.length}</div>
                </div>
                <div style={statCard('#10b981')}>
                    <div style={statLabel}>Folija</div>
                    <div style={statValue}>{kalkulacije.filter(k => k.tip === 'folija').length}</div>
                </div>
                <div style={statCard('#f59e0b')}>
                    <div style={statLabel}>Kesa</div>
                    <div style={statValue}>{kalkulacije.filter(k => k.tip === 'kesa').length}</div>
                </div>
                <div style={statCard('#8b5cf6')}>
                    <div style={statLabel}>Špulna</div>
                    <div style={statValue}>{kalkulacije.filter(k => k.tip === 'spulna').length}</div>
                </div>
            </div>

            {/* FILTERI */}
            <div style={{
                background: 'white',
                padding: 20,
                borderRadius: 12,
                marginBottom: 20,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                    {/* Pretraga */}
                    <input
                        type="text"
                        placeholder="🔍 Pretraži po nazivu, klijentu..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        style={{
                            padding: 12,
                            borderRadius: 8,
                            border: '2px solid #e2e8f0',
                            fontSize: 14,
                            outline: 'none'
                        }}
                    />

                    {/* Filter po tipu */}
                    <select
                        value={tipFilter}
                        onChange={(e) => setTipFilter(e.target.value)}
                        style={{
                            padding: 12,
                            borderRadius: 8,
                            border: '2px solid #e2e8f0',
                            fontSize: 14,
                            outline: 'none'
                        }}
                    >
                        <option value="sve">Svi tipovi</option>
                        <option value="folija">🧮 Folija</option>
                        <option value="kesa">🛍️ Kesa</option>
                        <option value="spulna">🎞️ Špulna</option>
                    </select>

                    {/* Sortiranje */}
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        style={{
                            padding: 12,
                            borderRadius: 8,
                            border: '2px solid #e2e8f0',
                            fontSize: 14,
                            outline: 'none'
                        }}
                    >
                        <option value="datum_desc">📅 Najnovije prvo</option>
                        <option value="datum_asc">📅 Najstarije prvo</option>
                        <option value="naziv">🔤 Po nazivu</option>
                        <option value="klijent">👤 Po klijentu</option>
                        <option value="cena">💰 Po ceni</option>
                    </select>
                </div>
            </div>

            {/* LOADING */}
            {loading && (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                    ⏳ Učitavam kalkulacije...
                </div>
            )}

            {/* PRAZNO */}
            {!loading && filtrirane.length === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: 60,
                    background: 'white',
                    borderRadius: 12,
                    border: '2px dashed #e2e8f0'
                }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
                        Nema kalkulacija
                    </div>
                    <div style={{ fontSize: 14, color: '#94a3b8' }}>
                        Kreirajte novu kalkulaciju pomoću dugmadi iznad
                    </div>
                </div>
            )}

            {/* LISTA */}
            {!loading && filtrirane.length > 0 && (
                <div style={{ display: 'grid', gap: 12 }}>
                    {filtrirane.map(kal => (
                        <div
                            key={kal.id}
                            style={{
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: 12,
                                padding: 20,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                                {/* LEVO */}
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                        <span style={{ fontSize: 24 }}>
                                            {kal.tip === 'folija' ? '🧮' : kal.tip === 'kesa' ? '🛍️' : '🎞️'}
                                        </span>
                                        <div>
                                            <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>
                                                {kal.naziv || 'Bez naziva'}
                                            </div>
                                            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                                                {kal.kupac || kal.klijent ? `Klijent: ${kal.kupac || kal.klijent}` : 'Bez klijenta'}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                                        <div style={infoBox}>
                                            <span style={infoLabel}>Tip:</span>
                                            <span style={infoBadge(getTipColor(kal.tip))}>
                                                {kal.tip.toUpperCase()}
                                            </span>
                                        </div>
                                        <div style={infoBox}>
                                            <span style={infoLabel}>Količina:</span>
                                            <span style={infoValue}>
                                                {kal.kolicina?.toLocaleString() ||
                                                    kal.rezultati?.kolicina?.toLocaleString() ||
                                                    0} kom
                                            </span>
                                        </div>
                                        <div style={infoBox}>
                                            <span style={infoLabel}>Datum:</span>
                                            <span style={infoValue}>
                                                {new Date(kal.created_at).toLocaleDateString('sr-RS')}
                                            </span>
                                        </div>
                                        {kal.verzija > 1 && (
                                            <div style={infoBox}>
                                                <span style={infoLabel}>Verzija:</span>
                                                <span style={infoValue}>v{kal.verzija}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* DESNO */}
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                                        Konačna cena
                                    </div>
                                    <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981' }}>
                                        {fmt(kal.konacna_cena || kal.rezultati?.konacnaCena || 0)} €
                                    </div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                                        Osnovna: {fmt(kal.osnovna_cena || kal.rezultati?.osnovnaCena || 0)} €
                                    </div>
                                </div>
                            </div>

                            {/* AKCIJE */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => onOtvoriKalkulaciju && onOtvoriKalkulaciju(kal)}
                                    style={actionBtn('#3b82f6')}
                                >
                                    📝 Otvori
                                </button>
                                <button
                                    onClick={() => onKreirajPonudu && onKreirajPonudu(kal)}
                                    style={actionBtn('#10b981')}
                                >
                                    📄 Kreiraj Ponudu
                                </button>
                                <button
                                    onClick={() => duplirajKalkulaciju(kal)}
                                    style={actionBtn('#8b5cf6')}
                                >
                                    📋 Dupliraj
                                </button>
                                <button
                                    onClick={() => obrisiKalkulaciju(kal)}
                                    style={actionBtn('#ef4444')}
                                >
                                    🗑️ Obriši
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ========== HELPERS ==========

function getTipColor(tip) {
    switch (tip) {
        case 'folija': return '#10b981';
        case 'kesa': return '#f59e0b';
        case 'spulna': return '#8b5cf6';
        default: return '#64748b';
    }
}

// ========== STYLES ==========

const btnPrimary = {
    padding: '12px 20px',
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    color: 'white',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
    transition: 'all 0.2s'
};

const statCard = (color) => ({
    background: `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`,
    border: `2px solid ${color}30`,
    borderRadius: 12,
    padding: 20,
    textAlign: 'center'
});

const statLabel = {
    fontSize: 12,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 8
};

const statValue = {
    fontSize: 32,
    fontWeight: 900,
    color: '#1e293b'
};

const infoBox = {
    display: 'flex',
    alignItems: 'center',
    gap: 6
};

const infoLabel = {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: 600
};

const infoValue = {
    fontSize: 13,
    color: '#475569',
    fontWeight: 700
};

const infoBadge = (color) => ({
    fontSize: 11,
    fontWeight: 800,
    color: color,
    background: `${color}15`,
    padding: '3px 8px',
    borderRadius: 6,
    letterSpacing: '0.5px'
});

const actionBtn = (color) => ({
    padding: '8px 14px',
    background: color,
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s'
});
