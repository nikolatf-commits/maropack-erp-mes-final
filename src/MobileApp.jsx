import React, { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { logMagacinIstorija } from "./utils/magacinIstorija.js";

// ========================================
// MOBILE APP - PWA
// ========================================
// Moderna mobilna aplikacija
// Optimizovana za touch i male ekrane
// Offline-ready sa service workers
// ========================================

export default function MobileApp({ setPage }) {
    const [view, setView] = useState('home'); // home | scan | nalozi | magacin | profil
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState({
        nalozi: [],
        rolne: [],
        stats: {}
    });

    useEffect(() => {
        loadMobileData();
    }, []);

    async function loadMobileData() {
        setLoading(true);
        try {
            // Učitaj osnovne podatke
            const { data: naloziData } = await supabase
                .from('nalozi')
                .select('*')
                .neq('status', 'Završeno')
                .order('created_at', { ascending: false })
                .limit(20);

            const { data: rolneData } = await supabase
                .from('magacin')
                .select('*')
                .in('status', ['Na stanju', 'Rezervisano', 'Delimično rezervisano', 'U štampariji', 'Vraćeno iz štamparije'])
                .limit(80);

            setData({
                nalozi: naloziData || [],
                rolne: rolneData || [],
                stats: {
                    aktivniNalozi: naloziData?.length || 0,
                    rolneNaStanju: rolneData?.length || 0
                }
            });
        } catch (e) {
            console.error('Greška:', e);
        }
        setLoading(false);
    }

    // PWA Install prompt
    const [installPrompt, setInstallPrompt] = useState(null);

    useEffect(() => {
        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setInstallPrompt(e);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === 'accepted') {
            setInstallPrompt(null);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: '#f8fafc',
            paddingBottom: 80,
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>

            {/* STATUS BAR SPACER (iOS) */}
            <div style={{ height: 'env(safe-area-inset-top)', background: '#0f766e' }} />

            {/* HEADER */}
            <div style={{
                background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
                color: 'white',
                padding: '20px 16px',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>
                        Maropack
                    </h1>
                    <button
                        onClick={() => loadMobileData()}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            borderRadius: 8,
                            color: 'white',
                            padding: '8px 12px',
                            fontSize: 20,
                            cursor: 'pointer'
                        }}
                    >
                        🔄
                    </button>
                </div>

                {/* Stats Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{
                        background: 'rgba(255,255,255,0.15)',
                        borderRadius: 12,
                        padding: 12,
                        backdropFilter: 'blur(10px)'
                    }}>
                        <div style={{ fontSize: 11, opacity: 0.9, marginBottom: 4 }}>
                            Aktivni nalozi
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 900 }}>
                            {data.stats.aktivniNalozi}
                        </div>
                    </div>
                    <div style={{
                        background: 'rgba(255,255,255,0.15)',
                        borderRadius: 12,
                        padding: 12,
                        backdropFilter: 'blur(10px)'
                    }}>
                        <div style={{ fontSize: 11, opacity: 0.9, marginBottom: 4 }}>
                            Rolne na stanju
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 900 }}>
                            {data.stats.rolneNaStanju}
                        </div>
                    </div>
                </div>
            </div>

            {/* INSTALL BANNER */}
            {installPrompt && (
                <div style={{
                    background: 'linear-gradient(135deg, #667eea, #764ba2)',
                    color: 'white',
                    padding: 16,
                    margin: 16,
                    borderRadius: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                }}>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                            📱 Instaliraj aplikaciju
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>
                            Brži pristup i offline rad
                        </div>
                    </div>
                    <button
                        onClick={handleInstallClick}
                        style={{
                            background: 'white',
                            color: '#667eea',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 16px',
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: 'pointer'
                        }}
                    >
                        Instaliraj
                    </button>
                </div>
            )}

            {/* CONTENT AREA */}
            <div style={{ padding: 16 }}>

                {/* HOME VIEW */}
                {view === 'home' && (
                    <div>

                        {/* Quick Actions */}
                        <div style={{ marginBottom: 24 }}>
                            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>
                                Brze akcije
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <ActionCard
                                    icon="📋"
                                    label="Novi nalog"
                                    color="#3b82f6"
                                    onClick={() => alert('Novi nalog')}
                                />
                                <ActionCard
                                    icon="📦"
                                    label="Nova rolna"
                                    color="#10b981"
                                    onClick={() => alert('Nova rolna')}
                                />
                                <ActionCard
                                    icon="📷"
                                    label="Skeniraj QR"
                                    color="#f59e0b"
                                    onClick={() => setView('scan')}
                                />
                                <ActionCard
                                    icon="📊"
                                    label="Statistika"
                                    color="#8b5cf6"
                                    onClick={() => alert('Statistika')}
                                />
                            </div>
                        </div>

                        {/* Recent Nalozi */}
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                                    Aktivni nalozi
                                </h2>
                                <button
                                    onClick={() => setView('nalozi')}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#0f766e',
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Svi →
                                </button>
                            </div>

                            {data.nalozi.slice(0, 5).map(nalog => (
                                <NalogCard key={nalog.id} nalog={nalog} />
                            ))}
                        </div>

                    </div>
                )}

                {/* SCAN VIEW */}
                {view === 'scan' && (
                    <div>
                        <button
                            onClick={() => setView('home')}
                            style={{
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                padding: '8px 16px',
                                marginBottom: 20,
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: 14
                            }}
                        >
                            ← Nazad
                        </button>

                        <div style={{
                            background: 'white',
                            borderRadius: 12,
                            padding: 24,
                            textAlign: 'center',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}>
                            <div style={{ fontSize: 64, marginBottom: 16 }}>📷</div>
                            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>
                                QR Skener
                            </h3>
                            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
                                Skeniraj QR kod na rolni ili nalogu
                            </p>

                            <button
                                onClick={() => {
                                    // Ovde bi bio QR scanner
                                    alert('QR Scanner - Integracija sa kamerom');
                                }}
                                style={{
                                    width: '100%',
                                    padding: '14px 24px',
                                    background: 'linear-gradient(135deg, #0f766e, #115e59)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 12,
                                    fontWeight: 700,
                                    fontSize: 16,
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(15, 118, 110, 0.3)'
                                }}
                            >
                                Pokreni kameru
                            </button>

                            <div style={{
                                marginTop: 24,
                                padding: 16,
                                background: '#fef3c7',
                                borderRadius: 8,
                                fontSize: 12,
                                color: '#92400e',
                                textAlign: 'left'
                            }}>
                                <strong>💡 Napomena:</strong> Za iOS potrebna je kamera dozvola.
                                Za najbolje rezultate, skeniraj u dobro osvetljenom prostoru.
                            </div>
                        </div>
                    </div>
                )}

                {/* NALOZI VIEW */}
                {view === 'nalozi' && (
                    <div>
                        <button
                            onClick={() => setView('home')}
                            style={{
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                padding: '8px 16px',
                                marginBottom: 20,
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: 14
                            }}
                        >
                            ← Nazad
                        </button>

                        <div style={{ marginBottom: 16 }}>
                            <input
                                type="search"
                                placeholder="Pretraži naloge..."
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 12,
                                    fontSize: 14,
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        {data.nalozi.map(nalog => (
                            <NalogCard key={nalog.id} nalog={nalog} expanded />
                        ))}
                    </div>
                )}

                {/* MAGACIN VIEW */}
                {view === 'magacin' && (
                    <div>
                        <button
                            onClick={() => setView('home')}
                            style={{
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                padding: '8px 16px',
                                marginBottom: 20,
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: 14
                            }}
                        >
                            ← Nazad
                        </button>

                        <div style={{ marginBottom: 16 }}>
                            <input
                                type="search"
                                placeholder="Pretraži rolne..."
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 12,
                                    fontSize: 14,
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        {data.rolne.map(rolna => (
                            <RolnaCard key={rolna.id} rolna={rolna} onChanged={loadMobileData} />
                        ))}
                    </div>
                )}

            </div>

            {/* BOTTOM NAVIGATION */}
            <div style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'white',
                borderTop: '1px solid #e2e8f0',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                paddingBottom: 'env(safe-area-inset-bottom)',
                boxShadow: '0 -2px 8px rgba(0,0,0,0.05)'
            }}>
                <NavButton
                    icon="🏠"
                    label="Početna"
                    active={view === 'home'}
                    onClick={() => setView('home')}
                />
                <NavButton
                    icon="📋"
                    label="Nalozi"
                    active={view === 'nalozi'}
                    onClick={() => setView('nalozi')}
                />
                <NavButton
                    icon="📦"
                    label="Magacin"
                    active={view === 'magacin'}
                    onClick={() => setView('magacin')}
                />
                <NavButton
                    icon="👤"
                    label="Profil"
                    active={view === 'profil'}
                    onClick={() => setView('profil')}
                />
            </div>

        </div>
    );
}

// ========================================
// KOMPONENTE
// ========================================

function ActionCard({ icon, label, color, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                background: 'white',
                border: 'none',
                borderRadius: 12,
                padding: 20,
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8
            }}
            onTouchStart={(e) => {
                e.currentTarget.style.transform = 'scale(0.95)';
            }}
            onTouchEnd={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
            }}
        >
            <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: color + '15',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24
            }}>
                {icon}
            </div>
            <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#1e293b',
                textAlign: 'center'
            }}>
                {label}
            </div>
        </button>
    );
}

function NalogCard({ nalog, expanded }) {
    const progres = nalog.kol > 0 ? ((nalog.uradjeno || 0) / nalog.kol * 100).toFixed(0) : 0;

    return (
        <div
            style={{
                background: 'white',
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'all 0.2s'
            }}
            onTouchStart={(e) => {
                e.currentTarget.style.transform = 'scale(0.98)';
            }}
            onTouchEnd={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                        {nalog.ponbr}
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                        {nalog.prod || 'Proizvod'}
                    </div>
                </div>
                <StatusBadge status={nalog.status} />
            </div>

            <div style={{ marginBottom: 12 }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12,
                    color: '#64748b',
                    marginBottom: 6
                }}>
                    <span>Progres</span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{progres}%</span>
                </div>
                <div style={{
                    height: 8,
                    background: '#e2e8f0',
                    borderRadius: 4,
                    overflow: 'hidden'
                }}>
                    <div style={{
                        width: `${progres}%`,
                        height: '100%',
                        background: progres >= 100 ? '#10b981' :
                            progres >= 50 ? '#3b82f6' : '#f59e0b',
                        transition: 'width 0.3s'
                    }} />
                </div>
            </div>

            {expanded && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 8,
                    paddingTop: 12,
                    borderTop: '1px solid #f1f5f9'
                }}>
                    <InfoItem label="Količina" value={formatNumber(nalog.kol) + 'm'} />
                    <InfoItem label="Urađeno" value={formatNumber(nalog.uradjeno || 0) + 'm'} />
                </div>
            )}

            <div style={{
                marginTop: 12,
                display: 'flex',
                gap: 8
            }}>
                <button
                    style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: '#eff6ff',
                        color: '#1e40af',
                        border: '1px solid #dbeafe',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    📊 Detalji
                </button>
                <button
                    style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: '#f0fdf4',
                        color: '#15803d',
                        border: '1px solid #bbf7d0',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    ✅ Ažuriraj
                </button>
            </div>
        </div>
    );
}

// Status → boja badža
function statusBoja(s) {
    const l = String(s || '').toLowerCase();
    if (/iskoris|iskoriš|potros|potroš/.test(l)) return { bg: '#fee2e2', text: '#991b1b' };
    if (/u štampar|u stampar/.test(l)) return { bg: '#ede9fe', text: '#6d28d9' };
    if (/vraćeno iz|vraceno iz/.test(l)) return { bg: '#e0f2fe', text: '#0369a1' };
    if (/rezerv/.test(l)) return { bg: '#fef3c7', text: '#92400e' };
    return { bg: '#d1fae5', text: '#065f46' };
}
function normSt(s) {
    const l = String(s || '').toLowerCase();
    if (/u štampar|u stampar/.test(l)) return 'stamparija';
    if (/vraćeno iz|vraceno iz/.test(l)) return 'vraceno';
    if (/rezerv/.test(l)) return 'rezervisano';
    return 'stanju';
}
// Obračun po prečniku + 3µm nanosa štampe (samo pri vraćanju iz štamparije)
function metriPrecnik(rolna, D, hilzna) {
    const d = hilzna === 'FI152' ? 180 : 100;
    const Dm = Number(D) || 0;
    const t = Math.max(((Number(rolna.debljina ?? rolna.deb) || 0) + 3) / 1000, 0.001);
    if (!Dm || Dm <= d) return 0;
    return Math.max(0, Math.round((Math.PI * (Dm * Dm - d * d)) / (4 * t) / 1000));
}
function kgPrecnik(rolna, m) {
    const sir = Number(rolna.sirina) || 0;
    const gsm = Number(rolna.gsm) || (Number(rolna.debljina ?? rolna.deb) || 0) * 0.91;
    if (!sir || !m || !gsm) return Number(rolna.kg_neto) || 0;
    return Math.round((sir * m * gsm / 1000000) * 100) / 100;
}

function RolnaCard({ rolna, onChanged }) {
    const [busy, setBusy] = useState(false);
    const [vracanje, setVracanje] = useState(false);
    const [precnik, setPrecnik] = useState('');
    const [hilzna, setHilzna] = useState('FI76');
    const st = normSt(rolna.status);
    const boja = statusBoja(rolna.status);

    async function postavi(status, extra = {}, istorija = {}) {
        setBusy(true);
        const { __promena_m, ...updExtra } = extra;
        try {
            await supabase.from('magacin').update({ status, updated_at: new Date().toISOString(), ...updExtra }).eq('id', rolna.id);
            try {
                let ime = '';
                try { const { data } = await supabase.auth.getUser(); ime = data?.user?.user_metadata?.ime || data?.user?.email || ''; } catch (e) { }
                await logMagacinIstorija({
                    rolna_id: rolna.id, br_rolne: rolna.br_rolne || rolna.qr,
                    akcija: istorija.akcija || status.toUpperCase(),
                    nova_vrednost: { status }, promena_m: __promena_m ?? null,
                    napomena: istorija.napomena || '', operater: ime,
                });
            } catch (e) { /* istorija opciona */ }
            if (onChanged) await onChanged();
        } catch (e) { alert('Greška: ' + (e.message || e)); }
        setBusy(false);
    }
    async function iskoriscena() {
        if (!window.confirm('Označiti rolnu kao ISKORIŠĆENU?')) return;
        const m = Number(rolna.metraza_ost ?? rolna.duzina ?? rolna.metraza) || 0;
        await postavi('Iskorišćeno', { metraza_ost: 0, __promena_m: -m }, { akcija: 'ISKORIŠĆENO', napomena: `Iskorišćena (mob) — skinuto ${formatNumber(m)} m` });
    }
    async function uStampariju() {
        if (!window.confirm('Poslato u štampariju?')) return;
        await postavi('U štampariji', {}, { akcija: 'POSLATO U ŠTAMPARIJU', napomena: 'Poslato u štampariju (mob)' });
    }
    const vm = metriPrecnik(rolna, precnik, hilzna);
    const vkg = kgPrecnik(rolna, vm);
    async function potvrdiVracanje() {
        if (!(vm > 0)) { alert('Unesi prečnik veći od hilzne'); return; }
        const staraM = Number(rolna.metraza_ost ?? rolna.duzina ?? rolna.metraza) || 0;
        await postavi('Vraćeno iz štamparije', { metraza_ost: vm, kg_neto: vkg }, { akcija: 'VRAĆENO IZ ŠTAMPARIJE', napomena: `Ø ${precnik}/${hilzna} (+3µm) → ${formatNumber(vm)} m · ${vkg.toFixed(2)} kg (bilo ${formatNumber(staraM)} m)` });
        setVracanje(false); setPrecnik('');
    }

    const btn = (bg) => ({ flex: 1, minWidth: 'calc(50% - 4px)', border: 'none', borderRadius: 9, padding: '10px', fontWeight: 800, fontSize: 12, color: '#fff', background: bg, cursor: 'pointer' });

    return (
        <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{rolna.br_rolne || rolna.id}</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>{rolna.vrsta || rolna.tip} • {rolna.oznaka_materijala || rolna.oznaka || ''} • {rolna.sirina}mm</div>
                </div>
                <div style={{ background: boja.bg, color: boja.text, padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{rolna.status}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <InfoItem label="Metraža" value={formatNumber(rolna.metraza_ost) + 'm'} />
                <InfoItem label="Kg" value={(rolna.kg_neto || 0).toFixed(1) + 'kg'} />
                <InfoItem label="Lok." value={rolna.lokacija || rolna.palet || '—'} />
            </div>

            {vracanje ? (
                <div style={{ marginTop: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontWeight: 900, marginBottom: 8, color: '#0369a1' }}>↩️ Vraćeno iz štamparije</div>
                    <input autoFocus type="number" inputMode="numeric" value={precnik} onChange={(e) => setPrecnik(e.target.value)} placeholder="Spoljašnji prečnik (mm)" style={{ width: '100%', padding: 12, fontSize: 16, border: '1px solid #cbd5e1', borderRadius: 9, boxSizing: 'border-box', marginBottom: 10 }} />
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        {['FI76', 'FI152'].map(h => (
                            <button key={h} onClick={() => setHilzna(h)} style={{ flex: 1, padding: 10, borderRadius: 9, border: hilzna === h ? '2px solid #0ea5e9' : '1px solid #cbd5e1', background: hilzna === h ? '#e0f2fe' : '#fff', fontWeight: 900, cursor: 'pointer' }}>{h}</button>
                        ))}
                    </div>
                    <div style={{ background: '#fff', borderRadius: 9, padding: 11, fontWeight: 900, textAlign: 'center' }}>= {formatNumber(vm)} m · {vkg.toFixed(2)} kg</div>
                    <div style={{ fontSize: 11, color: '#0369a1', textAlign: 'center', margin: '6px 0 10px' }}>+3µm nanos štampe uračunat</div>
                    <button onClick={potvrdiVracanje} disabled={busy || !(vm > 0)} style={{ width: '100%', border: 'none', borderRadius: 9, padding: 13, fontWeight: 900, color: '#fff', background: vm > 0 ? '#0ea5e9' : '#cbd5e1', cursor: 'pointer', marginBottom: 8 }}>✓ Potvrdi vraćanje</button>
                    <button onClick={() => setVracanje(false)} style={{ width: '100%', border: 'none', borderRadius: 9, padding: 11, fontWeight: 800, color: '#475569', background: '#f1f5f9', cursor: 'pointer' }}>Otkaži</button>
                </div>
            ) : st !== 'potrosena' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <button onClick={iskoriscena} disabled={busy} style={btn('#ef4444')}>✓ Iskorišćena</button>
                    {st !== 'stamparija' && <button onClick={uStampariju} disabled={busy} style={btn('#7c3aed')}>🖨️ U štampariju</button>}
                    {st === 'stamparija' && <button onClick={() => setVracanje(true)} disabled={busy} style={btn('#0ea5e9')}>↩️ Vraćeno</button>}
                </div>
            )}
        </div>
    );
}

function InfoItem({ label, value }) {
    return (
        <div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
                {label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                {value}
            </div>
        </div>
    );
}

function StatusBadge({ status }) {
    const colors = {
        'Novi': { bg: '#dbeafe', text: '#1e40af' },
        'Aktivan': { bg: '#dbeafe', text: '#1e40af' },
        'Pauza': { bg: '#fef3c7', text: '#92400e' },
        'Završeno': { bg: '#d1fae5', text: '#065f46' },
        'Zavrseno': { bg: '#d1fae5', text: '#065f46' }
    };

    const style = colors[status] || colors['Novi'];

    return (
        <div style={{
            background: style.bg,
            color: style.text,
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700
        }}>
            {status || 'Novi'}
        </div>
    );
}

function NavButton({ icon, label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                background: 'none',
                border: 'none',
                padding: '12px 8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                color: active ? '#0f766e' : '#94a3b8',
                transition: 'all 0.2s'
            }}
        >
            <div style={{ fontSize: 24 }}>{icon}</div>
            <div style={{ fontSize: 10, fontWeight: 600 }}>{label}</div>
        </button>
    );
}

function formatNumber(num) {
    return Math.round(num).toLocaleString('sr-RS');
}
