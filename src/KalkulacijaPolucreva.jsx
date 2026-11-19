import React, { useState, useEffect } from 'react';
import { supabase } from './supabase.js';
import { useAuth } from './auth/AuthProvider';
import MaterialLayersTablePRO from './components/MaterialLayersTablePRO.jsx';

// =====================================================================
// KalkulacijaPolucreva — kalkulacija cene za POLUCREVO (folija presavijena po dužini).
// Ravna folija (matična traka) = 2 × širina polucreva (+ falta). Presavijanje ne menja dužinu.
// Jedinica cene: €/m (+ info €/1000 m i €/kg). Dorada: Perforacija, Uzdužni var, Pravljenje creva.
// Čuva se u tabelu `kalkulacije_kese` sa oznakom tip='polucrevo'.
// =====================================================================

const n = (v) => Number(String(v ?? '').replace(',', '.')) || 0;
const eur = (v) => (n(v)).toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (v, d = 1) => (n(v)).toLocaleString('sr-RS', { maximumFractionDigits: d });

const GREEN = '#2446b8', GREEN_D = '#1e3a8a';

const S = {
    wrap: { maxWidth: 1240, margin: '0 auto', padding: '0 0 70px', background: '#f1f5f9', minHeight: '100vh' },
    hdr: { background: `linear-gradient(135deg,${GREEN},${GREEN_D})`, padding: '20px 24px', borderRadius: 14, color: '#fff', margin: '10px 10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 8px 24px rgba(36,70,184,.25)' },
    body: { padding: '0 10px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 14, alignItems: 'start' },
    card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
    h: { fontSize: 11, fontWeight: 900, color: GREEN, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
    label: { fontSize: 10, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' },
    inp: { width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '8px 10px', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: '#fff' },
    sel: { width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '8px 10px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: '#fff', cursor: 'pointer' },
    grid: (c) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${c}px,1fr))`, gap: 10 }),
};

function F({ label, value, onChange, type = 'text', suffix }) {
    return (
        <div>
            <label style={S.label}>{label}</label>
            <div style={{ position: 'relative' }}>
                <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={S.inp} />
                {suffix ? <span style={{ position: 'absolute', right: 9, top: 9, fontSize: 10, color: '#94a3b8', fontWeight: 800 }}>{suffix}</span> : null}
            </div>
        </div>
    );
}

// Opcija: čekboks + naziv + ćelija za cenu (€/1000 m)
function Opt({ label, active, onToggle, cena, setCena, cenaVidljiva = true }) {
    return (
        <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1.5px solid ' + (active ? GREEN : '#e2e8f0'), background: active ? '#eff6ff' : '#fff', borderRadius: 10, padding: '9px 11px', cursor: 'pointer' }}>
            <input type="checkbox" checked={active} readOnly style={{ pointerEvents: 'none' }} />
            <span style={{ flex: 1, fontWeight: 800, fontSize: 13, color: '#334155' }}>{label}</span>
            {active && cenaVidljiva && (
                <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="number" step="0.1" value={cena} onChange={(e) => setCena(e.target.value)} style={{ width: 62, border: '1px solid #cbd5e1', borderRadius: 7, padding: '5px 6px', fontSize: 12, fontWeight: 800, textAlign: 'right' }} />
                    <span style={{ fontSize: 8, color: '#64748b', fontWeight: 700, lineHeight: 1.05 }}>€/1000<br />m</span>
                </div>
            )}
        </div>
    );
}

export default function KalkulacijaPolucreva({ setPage }) {
    const { user } = useAuth();

    // Osnovni podaci
    const [naziv, setNaziv] = useState('');
    const [kupac, setKupac] = useState('');
    const [oznakaUpita, setOznakaUpita] = useState('');
    const [kolicina, setKolicina] = useState(0);
    const [jedinica, setJedinica] = useState('m');     // m | kg
    const [skart, setSkart] = useState(5);
    const [marza, setMarza] = useState(30);
    const [setupMasina, setSetupMasina] = useState(0); // € ukupno, jednokratno
    const [datumIsp, setDatumIsp] = useState('');
    const [zeljCena, setZeljCena] = useState(0);       // željena €/m → izvedena marža
    const [napomena, setNapomena] = useState('');

    // Dimenzije
    const [sirina, setSirina] = useState(0);           // mm — širina polucreva
    const [sirinaMaterijala, setSirinaMaterijala] = useState(0); // mm — matična
    const [imaVar, setImaVar] = useState(false);
    const [imaFalta, setImaFalta] = useState(false);
    const [falta, setFalta] = useState(0);             // mm

    // Materijali (slojevi)
    const [materijali, setMaterijali] = useState([{ tip: 'OPP', debljina: '40', tezina: 36.4, cena: 2.9 }]);
    const [kasCena, setKasCena] = useState(0);         // kaширanje €/m²
    const [trCena, setTrCena] = useState(0);           // transport €/kg

    // Dorada (€/1000 m)
    const [opts, setOpts] = useState({ perforacija: false, var: false, pakHrana: false });
    const [perfCena, setPerfCena] = useState(5);
    const [varCena, setVarCena] = useState(4);
    const [crevoCena, setCrevoCena] = useState(6);     // pravljenje creva (presavijanje) — uvek

    const [editId, setEditId] = useState(null);
    const [rez, setRez] = useState({});

    const toggle = (k) => setOpts((p) => ({ ...p, [k]: !p[k] }));
    const delMat = (i) => setMaterijali((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr);

    // ── Učitavanje za IZMENU — localStorage 'maropack_edit_kalk_polucrevo' ──
    useEffect(() => {
        try {
            const raw = localStorage.getItem('maropack_edit_kalk_polucrevo');
            if (!raw) return;
            localStorage.removeItem('maropack_edit_kalk_polucrevo');
            const k = JSON.parse(raw);
            const p = (k.rezultati && k.rezultati._ulaz && k.rezultati._ulaz.polja) || {};
            if (k.id) setEditId(k.id);
            setNaziv(k.naziv || p.naziv || '');
            setKupac(k.kupac || p.kupac || '');
            setOznakaUpita(k.oznaka_upita || p.oznakaUpita || '');
            setKolicina(n(k.kolicina ?? p.kolicina));
            setJedinica(p.jedinica || 'm');
            setSkart(n(k.skart ?? p.skart) || 5);
            setMarza(n(k.marza ?? p.marza) || 30);
            setSetupMasina(n(p.setupMasina));
            setSirina(n(k.sirina ?? p.sirina));
            setSirinaMaterijala(n(p.sirinaMaterijala ?? k.sirina_materijala));
            setImaVar(!!p.imaVar); setImaFalta(!!p.imaFalta); setFalta(n(p.falta));
            if (Array.isArray(k.materijali) && k.materijali.length) setMaterijali(k.materijali.map((m) => ({ ...m, vrsta: m.vrsta || m.tip || 'OPP', tip: m.tip || m.vrsta || 'OPP', debljina: String(m.debljina ?? ''), tezina: n(m.tezina ?? m.gm2 ?? m.tezinaGm2 ?? m.gsm), cena: n(m.cena ?? m.cena_kg) })));
            const u = (k.rezultati && k.rezultati._ulaz) || {};
            if (u.opts) setOpts({ perforacija: false, var: false, pakHrana: false, ...u.opts });
            if (u.cene) {
                if (u.cene.perfCena != null) setPerfCena(u.cene.perfCena);
                if (u.cene.varCena != null) setVarCena(u.cene.varCena);
                if (u.cene.crevoCena != null) setCrevoCena(u.cene.crevoCena);
                if (u.cene.kasCena != null) setKasCena(u.cene.kasCena);
                if (u.cene.trCena != null) setTrCena(u.cene.trCena);
            }
            if (p.napomena != null) setNapomena(p.napomena);
            if (p.zeljCena != null) setZeljCena(p.zeljCena);
        } catch (e) { /* ignore */ }
    }, []);

    // ── PREFILL IZ TEMPLEJTA (templejt → kalkulacija) — „maropack_pending_template_calculation" ──
    useEffect(() => {
        try {
            if (localStorage.getItem('maropack_edit_kalk_polucrevo') || localStorage.getItem('editKalkulacija')) return;
            const raw = localStorage.getItem('maropack_pending_template_calculation');
            if (!raw) return;
            const kal = JSON.parse(raw);
            if ((kal.tip || kal.template?.type) !== 'polucrevo') return;
            const tpl = kal.template || kal.data || kal.kalkulator_prefill || {};
            const pc = tpl.polucrevo || {};
            setNaziv(tpl.naziv || pc.naziv || '');
            setKupac(tpl.kupac || '');
            setKolicina(n(pc.kolicina));
            setJedinica(pc.jedinicaUnosa || 'm');
            if (n(pc.skart)) setSkart(n(pc.skart));
            setSirina(n(pc.sirina));
            setSirinaMaterijala(n(pc.sirinaMaterijala) || n(tpl.idealnaSirinaMaterijala));
            setImaVar(!!pc.imaVar); setImaFalta(!!pc.imaFalta); setFalta(n(pc.falta));
            const layers = (Array.isArray(pc.layers) && pc.layers.length) ? pc.layers : (Array.isArray(kal.materijali) && kal.materijali.length ? kal.materijali : []);
            if (layers.length) setMaterijali(layers.map((l) => ({
                tip: l.vrsta || l.material || l.tip || 'OPP',
                vrsta: l.vrsta || l.material || l.tip || 'OPP',
                pod_vrsta: l.pod_vrsta || l.podVrsta || '',
                oznaka: l.oznaka_materijala || l.oznaka || '',
                proizvodjac: l.proizvodjac || l.proizvođač || '',
                debljina: String(l.debljina ?? l.deb ?? ''),
                tezina: n(l.gm2 ?? l.tezina ?? l.tezinaGm2 ?? l.gsm),
                gm2: n(l.gm2 ?? l.tezina ?? l.tezinaGm2 ?? l.gsm),
                cena: n(l.cena ?? l.cena_kg),
                stampa: !!(l.stampa || l.st || l['Š']),
                lak: !!(l.lak || l.lakira),
            })));
            setOpts((prev) => ({ perforacija: !!pc.perforacija, var: !!pc.imaVar, pakHrana: false }));
            if (pc.pakovanje != null) setNapomena(pc.pakovanje || '');
        } catch (e) { /* ignore */ }
    }, []);

    // ── OBRAČUN ──
    useEffect(() => {
        const W = n(sirina), WM = n(sirinaMaterijala);
        const faltaMm = imaFalta ? n(falta) : 0;
        const flat = W > 0 ? (2 * W + faltaMm) : 0;        // mm — ravna folija (jedna traka)

        let sumTez = 0, sumCena = 0, br = 0;
        materijali.forEach((m) => { const t = n(m.tezina ?? m.gm2 ?? m.tezinaGm2 ?? m.gsm ?? m.gramatura); if (t > 0) { sumTez += t; sumCena += n(m.cena ?? m.cena_kg); br++; } });
        const avgCena = br > 0 ? sumCena / br : 0;

        // Po 1 m gotovog polucreva troši se flat (mm) širine ravne folije.
        const m2PoM = flat / 1000;                          // m² po metru polucreva
        const kgPoM = m2PoM * sumTez / 1000;                // kg po metru (gm2 g/m²)
        const kgPoMSkart = kgPoM * (1 + n(skart) / 100);
        const materijalPoM = kgPoMSkart * avgCena;          // €/m

        // Količina u metrima (ako je uneto u kg → preračun preko kgPoMSkart)
        const kolM = jedinica === 'kg' ? (kgPoMSkart > 0 ? n(kolicina) / kgPoMSkart : 0) : n(kolicina);

        const N = (WM > 0 && flat > 0) ? Math.max(1, Math.floor(WM / flat)) : 1;
        const otpadMm = (WM > 0 && flat > 0) ? Math.max(0, WM - N * flat) : 0;

        const kasProlazi = Math.max(0, br - 1);
        const kasPoM = n(kasCena) * m2PoM * kasProlazi;
        const transportPoM = n(trCena) * kgPoM;

        const dorada1000 =
            (opts.perforacija ? n(perfCena) : 0) +
            (opts.var ? n(varCena) : 0) +
            n(crevoCena);                                   // pravljenje creva (presavijanje) uvek
        const doradaPoM = dorada1000 / 1000;

        const setupPoM = kolM > 0 ? n(setupMasina) / kolM : 0;

        const osnovnaPoM = materijalPoM + kasPoM + doradaPoM + transportPoM;
        const konacnaPoM = osnovnaPoM * (1 + n(marza) / 100) + setupPoM;

        const vrednostKon = konacnaPoM * kolM;
        const vrednostOsn = osnovnaPoM * kolM;
        const ukKg = kgPoMSkart * kolM;
        const izrMarza = n(zeljCena) > 0 && osnovnaPoM > 0 ? (n(zeljCena) / osnovnaPoM - 1) * 100 : 0;

        setRez({
            flat, N, otpadMm, kolM,
            materijal: materijalPoM, kasiranje: kasPoM, dorada: doradaPoM, transport: transportPoM,
            setupPoM, osnovnaPoM, konacnaPoM,
            konacna1000: konacnaPoM * 1000, osnovna1000: osnovnaPoM * 1000,
            vrednostKon, vrednostOsn, ukKg, kgPoM: kgPoMSkart,
            cenaPoKg: kgPoMSkart > 0 ? konacnaPoM / kgPoMSkart : 0,
            izrMarza,
        });
    }, [sirina, sirinaMaterijala, imaVar, imaFalta, falta, kolicina, jedinica, skart, marza, setupMasina, materijali, opts, perfCena, varCena, crevoCena, kasCena, trCena, zeljCena]);

    // ── ČUVANJE (kalkulacije_kese, tip='polucrevo') ──
    async function sacuvaj() {
        try {
            if (!naziv.trim()) { alert('Unesi naziv.'); return; }
            const tezM = (m) => n(m.tezina ?? m.gm2 ?? m.tezinaGm2 ?? m.gsm ?? m.gramatura);
            const materijali_struktura = (materijali || []).map((m) => ({
                vrsta: m.vrsta || m.tip || '', pod_vrsta: m.pod_vrsta || m.podVrsta || '', oznaka: m.oznaka || m.oznaka_materijala || '',
                proizvodjac: m.proizvodjac || m.proizvođač || '',
                debljina: n(m.debljina), gm2: tezM(m), cena: n(m.cena ?? m.cena_kg),
                stampa: !!(m.stampa || m.st), lak: !!(m.lak || m.lakira),
            }));
            const avgTez = materijali.length ? materijali.reduce((a, m) => a + tezM(m), 0) / materijali.length : 0;
            const avgCena = materijali.length ? materijali.reduce((a, m) => a + n(m.cena ?? m.cena_kg), 0) / materijali.length : 0;

            // Za kasniji templejt/nalog (ista struktura kao polucrevo u ProductTemplateEngine)
            localStorage.setItem('maropack_pending_nalog', JSON.stringify({
                tip: 'polucrevo', type: 'polucrevo', naziv, kupac, oznaka_upita: oznakaUpita,
                polucrevo: {
                    naziv, kolicina: n(kolicina), jedinicaUnosa: jedinica, skart: n(skart), marza: n(marza),
                    setup_masina: n(setupMasina), sirina: n(sirina), sirinaMaterijala: n(sirinaMaterijala),
                    imaVar, imaFalta, falta: n(falta), layers: materijali, options: opts, pakovanje: napomena || '',
                },
                idealnaSirinaMaterijala: n(sirinaMaterijala),
                materijali, materijali_struktura, rezultati: rez, created_at: new Date().toISOString(),
            }));

            const zapis = {
                tip: 'polucrevo',
                naziv, kupac, oznaka_upita: oznakaUpita,
                kolicina: n(kolicina), skart: n(skart), marza: n(marza),
                sirina: n(sirina), sirina_materijala: n(sirinaMaterijala),
                materijali_struktura,
                materijal: materijali.map((m) => m.vrsta || m.tip).filter(Boolean).join(' + '),
                debljina: materijali[0] ? n(materijali[0].debljina) : 0,
                tezina_gm2: avgTez, cena_kg: avgCena,
                transport: n(trCena),
                rezultati: {
                    ...rez,
                    _tip: 'polucrevo',
                    kolicina: n(kolicina),
                    konacnaCena: rez.konacnaPoM || 0,
                    osnovnaCena: rez.osnovnaPoM || 0,
                    ukupnoNalog: rez.vrednostKon || 0,
                    ukupnoOsnovno: rez.vrednostOsn || 0,
                    cenaPoKgSaMarza: rez.cenaPoKg || 0,
                    _ulaz: {
                        opts,
                        cene: { perfCena, varCena, crevoCena, kasCena, trCena },
                        polja: { naziv, kupac, oznakaUpita, kolicina, jedinica, skart, marza, setupMasina, datumIsp, zeljCena, sirina, sirinaMaterijala, imaVar, imaFalta, falta, napomena },
                        materijali,
                    },
                },
                osnovna_cena: rez.osnovnaPoM || 0,
                konacna_cena: rez.konacnaPoM || 0,
                materijali,
                perforacija: !!opts.perforacija,
                napomena,
                created_by: user?.id,
            };

            async function upisi(payload) {
                if (editId) { const r = await supabase.from('kalkulacije_kese').update(payload).eq('id', editId); return { error: r.error, id: editId }; }
                const r = await supabase.from('kalkulacije_kese').insert([payload]).select('id').single();
                return { error: r.error, id: r.data?.id || null };
            }
            let error, savedId = editId, payload = { ...zapis };
            for (let i = 0; i < 12; i++) {
                const r = await upisi(payload); error = r.error; savedId = r.id;
                if (!error) break;
                const mm = String(error.message || '').match(/Could not find the '([^']+)' column/i);
                if (mm && mm[1] && Object.prototype.hasOwnProperty.call(payload, mm[1])) { delete payload[mm[1]]; continue; }
                break;
            }
            if (error) throw error;
            if (savedId) setEditId(savedId);
            alert(editId ? '✅ Izmene sačuvane!' : '✅ Kalkulacija polucreva sačuvana!');
        } catch (err) {
            console.error('Greška:', err);
            alert('❌ Greška pri čuvanju: ' + (err.message || err));
        }
    }

    const Rb = ({ k, v, c }) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
            <span style={{ color: '#64748b' }}>{k}</span><span style={{ fontWeight: 800, color: c || '#0f172a' }}>{v}</span>
        </div>
    );
    const Box = ({ label, value, bg, bd, col }) => (
        <div style={{ background: bg, border: '1px solid ' + bd, borderRadius: 11, padding: '11px 13px', textAlign: 'center' }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: col, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 950, color: col, lineHeight: 1 }}>{value}</div>
        </div>
    );

    return (
        <div style={S.wrap}>
            <div style={S.hdr}>
                <div>
                    <div style={{ fontSize: 19, fontWeight: 950, display: 'flex', alignItems: 'center', gap: 8 }}>➰ Kalkulacija polucreva</div>
                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>Folija presavijena po dužini — ravna folija 2× širina · cena €/m &amp; €/kg</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Konačna cena</div>
                    <div style={{ fontSize: 24, fontWeight: 950 }}>{eur(rez.konacnaPoM)} €<span style={{ fontSize: 12, opacity: 0.85 }}> /m</span></div>
                </div>
            </div>

            <div style={S.body}>
                {/* ── LEVO: FORMA ── */}
                <div style={{ minWidth: 0 }}>
                    <div style={S.card}>
                        <div style={S.h}>Osnovni podaci</div>
                        <div style={S.grid(170)}>
                            <F label="Naziv proizvoda" value={naziv} onChange={setNaziv} />
                            <F label="Kupac" value={kupac} onChange={setKupac} />
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 800, color: '#b45309', display: 'block', marginBottom: 4 }}>🔖 Broj / oznaka upita</label>
                                <input type="text" value={oznakaUpita} onChange={(e) => setOznakaUpita(e.target.value)} placeholder="npr. UP-2026-014" style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #f59e0b', borderRadius: 6, fontSize: 13, fontWeight: 700, background: '#fffbeb', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={S.label}>Količina</label>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <input type="number" value={kolicina} onChange={(e) => setKolicina(e.target.value)} style={{ ...S.inp, flex: 1 }} />
                                    <select value={jedinica} onChange={(e) => setJedinica(e.target.value)} style={{ ...S.sel, width: 68 }}>
                                        <option value="m">m</option>
                                        <option value="kg">kg</option>
                                    </select>
                                </div>
                            </div>
                            <F label="Škart (%)" value={skart} onChange={setSkart} type="number" />
                            <F label="Marža (%)" value={marza} onChange={setMarza} type="number" />
                            <F label="Podešavanje mašine (€ ukupno)" value={setupMasina} onChange={setSetupMasina} type="number" />
                            <F label="Datum isporuke" value={datumIsp} onChange={setDatumIsp} type="date" />
                        </div>
                    </div>

                    <div style={S.card}>
                        <div style={S.h}>Dimenzije i zatvaranje</div>
                        <div style={S.grid(150)}>
                            <F label="Širina polucreva (mm)" value={sirina} onChange={setSirina} type="number" />
                            <F label="Širina materijala — matična (mm)" value={sirinaMaterijala} onChange={setSirinaMaterijala} type="number" />
                            {imaFalta ? <F label="Falta / dno (mm)" value={falta} onChange={setFalta} type="number" /> : null}
                        </div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                                <input type="checkbox" checked={imaVar} onChange={(e) => { setImaVar(e.target.checked); setOpts((p) => ({ ...p, var: e.target.checked })); }} /> Uzdužni var (poluzatvoreno)
                            </label>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                                <input type="checkbox" checked={imaFalta} onChange={(e) => setImaFalta(e.target.checked)} /> Falta / dno
                            </label>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#475569', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, padding: '7px 10px' }}>
                            📐 Ravna folija (traka): <b style={{ color: GREEN_D }}>{fmt(rez.flat)}</b> mm (2× širina{imaFalta ? ' + falta' : ''}) &nbsp;·&nbsp; Traka iz matične: <b>{rez.N || 1}</b>
                            {n(rez.otpadMm) > 0 ? <span style={{ color: '#b91c1c' }}> &nbsp;·&nbsp; bočni otpad <b>{fmt(rez.otpadMm)}</b> mm</span> : null}
                        </div>
                    </div>

                    <div style={S.card}>
                        <div style={S.h}>Materijal (slojevi)</div>
                        <MaterialLayersTablePRO
                            title=""
                            layers={materijali}
                            maxLayers={4}
                            showPrice={true}
                            showWidth={false}
                            showFlags={true}
                            onChange={(next) => setMaterijali(next)}
                            onAdd={(row) => setMaterijali([...materijali, row])}
                            onRemove={(idx) => delMat(idx)}
                        />
                        <div style={{ ...S.grid(170), marginTop: 12 }}>
                            <F label="Kaширanje (€/m²) — za višeslojni" value={kasCena} onChange={setKasCena} type="number" />
                            <F label="Transport (€/kg)" value={trCena} onChange={setTrCena} type="number" />
                        </div>
                    </div>

                    <div style={S.card}>
                        <div style={S.h}>Dorada i pravljenje creva</div>
                        <div style={{ marginBottom: 10 }}>
                            <label style={S.label}>Pravljenje creva — presavijanje (€/1000 m)</label>
                            <input type="number" step="0.1" value={crevoCena} onChange={(e) => setCrevoCena(e.target.value)} style={{ ...S.inp, maxWidth: 200 }} />
                        </div>
                        <div style={S.grid(230)}>
                            <Opt label="Perforacija" active={opts.perforacija} onToggle={() => toggle('perforacija')} cena={perfCena} setCena={setPerfCena} />
                            <Opt label="Uzdužni var" active={opts.var} onToggle={() => toggle('var')} cena={varCena} setCena={setVarCena} />
                            <Opt label="Pakovanje za hranu" active={opts.pakHrana} onToggle={() => toggle('pakHrana')} cenaVidljiva={false} />
                        </div>
                        {opts.pakHrana ? <div style={{ marginTop: 10, fontSize: 11.5, color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '7px 10px' }}>⚠ Pakovanje za hranu — čist pogon, rukavice, mrežice; bez dlaka.</div> : null}
                        <div style={{ marginTop: 12 }}>
                            <label style={S.label}>Napomena</label>
                            <input value={napomena} onChange={(e) => setNapomena(e.target.value)} style={S.inp} placeholder="npr. pakovanje, posebni zahtevi…" />
                        </div>
                    </div>
                </div>

                {/* ── DESNO: REZULTAT (sticky) ── */}
                <div style={{ position: 'sticky', top: 10 }}>
                    <div style={S.card}>
                        <div style={S.h}>Rezultat</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                            <Box label="€ / m" value={eur(rez.konacnaPoM)} bg="#eff6ff" bd="#bfdbfe" col="#1d4ed8" />
                            <Box label="€ / 1000 m" value={eur(rez.konacna1000)} bg="#f0fdf4" bd="#86efac" col="#15803d" />
                            <Box label="Ukupno nalog €" value={eur(rez.vrednostKon)} bg="#fffbeb" bd="#fcd34d" col="#92400e" />
                            <Box label="Ukupno kg" value={fmt(rez.ukKg)} bg="#fff7ed" bd="#fed7aa" col="#c2410c" />
                        </div>
                        <Rb k="Metri (iz unosa)" v={fmt(rez.kolM) + ' m'} />
                        <Rb k="Materijal (€/m)" v={eur(rez.materijal)} />
                        {n(rez.kasiranje) > 0 ? <Rb k="Kaширanje (€/m)" v={eur(rez.kasiranje)} /> : null}
                        <Rb k="Dorada + crevo (€/m)" v={eur(rez.dorada)} />
                        {n(rez.transport) > 0 ? <Rb k="Transport (€/m)" v={eur(rez.transport)} /> : null}
                        <Rb k="Osnovna (€/m)" v={eur(rez.osnovnaPoM)} />
                        {n(rez.setupPoM) > 0 ? <Rb k="Podešavanje (€/m)" v={eur(rez.setupPoM)} /> : null}
                        <Rb k="€ / kg (sa maржom)" v={eur(rez.cenaPoKg)} />
                    </div>

                    <div style={S.card}>
                        <div style={S.h}>Provera cene</div>
                        <F label="Željena cena (€/m)" value={zeljCena} onChange={setZeljCena} type="number" />
                        <div style={{ marginTop: 10, fontSize: 13, color: '#475569' }}>Izvedena marža: <b style={{ color: n(rez.izrMarza) >= n(marza) ? '#15803d' : '#b45309' }}>{fmt(rez.izrMarza)}%</b></div>
                        <button onClick={sacuvaj} style={{ marginTop: 16, width: '100%', background: `linear-gradient(135deg,${GREEN},${GREEN_D})`, color: '#fff', border: 'none', borderRadius: 11, padding: '13px', fontWeight: 900, fontSize: 15, cursor: 'pointer', boxShadow: '0 6px 16px rgba(36,70,184,.3)' }}>💾 {editId ? 'Sačuvaj izmene' : 'Sačuvaj kalkulaciju'}</button>
                        {typeof setPage === 'function' ? <button onClick={() => setPage('kalkulacije_lista')} style={{ marginTop: 8, width: '100%', background: '#fff', color: '#475569', border: '1.5px solid #cbd5e1', borderRadius: 11, padding: '10px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>← Lista kalkulacija</button> : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
