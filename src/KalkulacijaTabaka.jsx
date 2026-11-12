import React, { useState, useEffect } from 'react';
import { supabase } from './supabase.js';
import { useAuth } from './auth/AuthProvider';
import MaterialLayersTablePRO from './components/MaterialLayersTablePRO.jsx';

// =====================================================================
// KalkulacijaTabaka — kalkulacija cene za TABAK (ravan list).
// Kao kesa, ali BEZ klapne/falte i duplo-platna; faltanje = PRESAVIJANJE (čekboks + cena).
// Jedinica €/1000 kom (+ info €/kg). Opcije: Perforacija, Rupe/zumbe, Pakovanje za hranu, Presavijanje.
// Dimenzije: širina × dužina + širina materijala. ban = širina_mat ÷ širina, korak = dužina.
// Čuva se u tabelu `kalkulacije_kese` sa oznakom tip='tabak'.
// =====================================================================

const n = (v) => Number(String(v ?? '').replace(',', '.')) || 0;
const eur = (v) => (n(v)).toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (v, d = 1) => (n(v)).toLocaleString('sr-RS', { maximumFractionDigits: d });

// ===================== BAZA MATERIJALA (isto kao Kalkulacija Kese) =====================
const MAT_TEZ = {
    'OPP': { '15': 13.65, '18': 16.38, '20': 18.2, '25': 22.75, '28': 25.48, '30': 27.3, '35': 31.85, '40': 36.4, '45': 40.95, '50': 45.5, '60': 54.6, '70': 63.7 },
    'BOPP': { '5': 4.55, '10': 9.1, '15': 13.65, '18': 16.38, '20': 18.2, '25': 22.75, '28': 25.48, '30': 27.3, '35': 31.85, '40': 36.4, '45': 40.95, '50': 45.5, '55': 50.05, '60': 54.6, '65': 59.15, '70': 63.7 },
    'BOPP SEDEF': { '5': 3.25, '10': 6.5, '15': 9.75, '20': 13, '25': 16.25, '30': 19.5, '35': 22.75, '38': 24.7, '40': 26, '45': 29.25 },
    'BOPP BELI': { '5': 4.55, '10': 9.1, '15': 13.65, '20': 18.2, '25': 22.75, '30': 27.3, '35': 31.85, '40': 36.4, '45': 40.95, '50': 45.5 },
    'LDPE': { '10': 9.25, '15': 13.875, '20': 18.5, '25': 23.125, '30': 27.75, '35': 32.375, '40': 37, '45': 41.625, '50': 46.25, '55': 50.875, '60': 55.5 },
    'CPP': { '5': 4.55, '10': 9.1, '15': 13.65, '18': 16.38, '20': 18.2, '25': 22.75, '28': 25.48, '30': 27.3, '35': 31.85, '40': 36.4, '45': 40.95, '50': 45.5 },
    'PET': { '12': 16.8, '15': 21, '19': 26.6, '20': 28, '36': 50.4, '50': 70 },
    'OPA': { '12': 13.2, '15': 16.5, '20': 22, '25': 27.5, '30': 33, '40': 44 },
    'PA': { '10': 11.4, '15': 17.1, '20': 22.8, '30': 34.2, '40': 45.6 },
    'PA/PE koestruzija': { '10': 10, '15': 15, '20': 20, '30': 30, '40': 40, '50': 50 },
    'ALU': { '7': 18.97, '9': 24.39, '12': 32.52, '15': 40.65, '20': 54.2, '30': 81.3 },
    'CELULOZA': { '10': 14.5, '20': 29, '30': 43.5, '40': 58, '50': 72.5 },
    'PAPIR': { '40': 40, '50': 50, '60': 60, '70': 70, '80': 80, '90': 90, '100': 100 },
};
const MAT_TIPOVI = Object.keys(MAT_TEZ);
const debOpcije = (tip) => Object.keys(MAT_TEZ[tip] || { '30': 1 });
const tezinaZa = (tip, deb) => (MAT_TEZ[tip] && MAT_TEZ[tip][String(deb)]) || 0;

const GREEN = '#059669', GREEN_D = '#047857';

const S = {
    wrap: { maxWidth: 1240, margin: '0 auto', padding: '0 0 70px', background: '#f1f5f9', minHeight: '100vh' },
    hdr: { background: `linear-gradient(135deg,${GREEN},${GREEN_D})`, padding: '20px 24px', borderRadius: 14, color: '#fff', margin: '10px 10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 8px 24px rgba(5,150,105,.25)' },
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

// Opcija: čekboks + naziv + ćelija za cenu (€/1000 kom)
function Opt({ label, active, onToggle, cena, setCena, cenaVidljiva = true }) {
    return (
        <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1.5px solid ' + (active ? GREEN : '#e2e8f0'), background: active ? '#f0fdf4' : '#fff', borderRadius: 10, padding: '9px 11px', cursor: 'pointer' }}>
            <input type="checkbox" checked={active} readOnly style={{ pointerEvents: 'none' }} />
            <span style={{ flex: 1, fontWeight: 800, fontSize: 13, color: '#334155' }}>{label}</span>
            {active && cenaVidljiva && (
                <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="number" step="0.1" value={cena} onChange={(e) => setCena(e.target.value)} style={{ width: 62, border: '1px solid #cbd5e1', borderRadius: 7, padding: '5px 6px', fontSize: 12, fontWeight: 800, textAlign: 'right' }} />
                    <span style={{ fontSize: 8, color: '#64748b', fontWeight: 700, lineHeight: 1.05 }}>€/1000<br />kom</span>
                </div>
            )}
        </div>
    );
}

export default function KalkulacijaTabaka({ setPage }) {
    const { user } = useAuth();

    // Osnovni podaci
    const [naziv, setNaziv] = useState('');
    const [kupac, setKupac] = useState('');
    const [oznakaUpita, setOznakaUpita] = useState('');
    const [kolicina, setKolicina] = useState(0);
    const [skart, setSkart] = useState(10);
    const [marza, setMarza] = useState(30);
    const [setupMasina, setSetupMasina] = useState(0);   // € ukupno, jednokratno (ne ulazi u maржu)
    const [datumIsp, setDatumIsp] = useState('');
    const [zeljCena, setZeljCena] = useState(0);         // željena cena €/1000 → izračuna izvedenu maржu
    const [napomena, setNapomena] = useState('');

    // Dimenzije (bez klapne/falte)
    const [sirina, setSirina] = useState(0);             // mm
    const [duzina, setDuzina] = useState(0);             // mm
    const [sirinaMaterijala, setSirinaMaterijala] = useState(0); // mm (širina ulazne rolne)

    // Materijali (slojevi)
    const [materijali, setMaterijali] = useState([{ tip: 'OPP', debljina: '30', tezina: 27.3, cena: 2.9 }]);
    const [kasCena, setKasCena] = useState(0);           // kaширanje €/m² (za višeslojni)
    const [trCena, setTrCena] = useState(0);             // transport €/kg

    // Opcije + cene (€/1000 kom)
    const [opts, setOpts] = useState({ perforacija: false, zumbe: false, pakHrana: false, presavijanje: false });
    const [perfCena, setPerfCena] = useState(1.5);
    const [zumbeCena, setZumbeCena] = useState(0.8);
    const [presCena, setPresCena] = useState(1.0);       // presavijanje €/1000 kom

    const [editId, setEditId] = useState(null);
    const [rez, setRez] = useState({});

    const toggle = (k) => setOpts((p) => ({ ...p, [k]: !p[k] }));
    const setMat = (i, patch) => setMaterijali((arr) => arr.map((m, idx) => idx === i ? { ...m, ...patch } : m));
    const addMat = () => setMaterijali((arr) => [...arr, { tip: 'OPP', debljina: '30', tezina: tezinaZa('OPP', '30'), cena: 0 }]);
    const delMat = (i) => setMaterijali((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr);

    // Promena VRSTE → postavi prvu debljinu i auto-težinu
    const matVrsta = (i, tip) => {
        const debs = debOpcije(tip);
        const deb = debs[0];
        setMat(i, { tip, debljina: deb, tezina: tezinaZa(tip, deb) });
    };
    // Promena DEBLJINE → auto-težina
    const matDeb = (i, deb) => {
        const tip = materijali[i]?.tip || 'OPP';
        setMat(i, { debljina: deb, tezina: tezinaZa(tip, deb) });
    };

    // ── Učitavanje za IZMENU (iz liste) — localStorage 'maropack_edit_kalk_tabak' ──
    useEffect(() => {
        try {
            const raw = localStorage.getItem('maropack_edit_kalk_tabak');
            if (!raw) return;
            localStorage.removeItem('maropack_edit_kalk_tabak');
            const k = JSON.parse(raw);
            const p = (k.rezultati && k.rezultati._ulaz && k.rezultati._ulaz.polja) || {};
            if (k.id) setEditId(k.id);
            setNaziv(k.naziv || p.naziv || '');
            setKupac(k.kupac || p.kupac || '');
            setOznakaUpita(k.oznaka_upita || p.oznakaUpita || '');
            setKolicina(n(k.kolicina ?? p.kolicina));
            setSkart(n(k.skart ?? p.skart) || 10);
            setMarza(n(k.marza ?? p.marza) || 30);
            setSetupMasina(n(p.setupMasina));
            setSirina(n(k.sirina ?? p.sirina));
            setDuzina(n(k.duzina ?? p.duzina));
            setSirinaMaterijala(n(p.sirinaMaterijala ?? k.sirina_materijala));
            if (Array.isArray(k.materijali) && k.materijali.length) setMaterijali(k.materijali.map((m) => ({ ...m, vrsta: m.vrsta || m.tip || 'OPP', tip: m.tip || m.vrsta || 'OPP', debljina: String(m.debljina ?? ''), tezina: n(m.tezina ?? m.gm2 ?? m.tezinaGm2 ?? m.gsm), cena: n(m.cena ?? m.cena_kg) })));
            const u = (k.rezultati && k.rezultati._ulaz) || {};
            if (u.opts) setOpts({ perforacija: false, zumbe: false, pakHrana: false, presavijanje: false, ...u.opts });
            if (u.cene) {
                if (u.cene.perfCena != null) setPerfCena(u.cene.perfCena);
                if (u.cene.zumbeCena != null) setZumbeCena(u.cene.zumbeCena);
                if (u.cene.presCena != null) setPresCena(u.cene.presCena);
                if (u.cene.kasCena != null) setKasCena(u.cene.kasCena);
                if (u.cene.trCena != null) setTrCena(u.cene.trCena);
            }
            if (p.napomena != null) setNapomena(p.napomena);
            if (p.zeljCena != null) setZeljCena(p.zeljCena);
        } catch (e) { /* ignore */ }
    }, []);

    // ── OBRAČUN ──
    useEffect(() => {
        const W = n(sirina), L = n(duzina), WM = n(sirinaMaterijala), kol = n(kolicina);
        let sumTez = 0, sumCena = 0, br = 0;
        materijali.forEach((m) => { const t = n(m.tezina ?? m.gm2 ?? m.tezinaGm2 ?? m.gsm ?? m.gramatura); if (t > 0) { sumTez += t; sumCena += n(m.cena ?? m.cena_kg); br++; } });
        const avgCena = br > 0 ? sumCena / br : 0;

        // TABAK = ravan list (jednoslojno platno): površina = širina × dužina.
        const korak = L;                               // mm (metraža po listu)
        const poprecno = W;                            // mm (jedan ban)
        const povrsinaM2 = (W * L) / 1000000;          // m² po listu
        const tezKg1000 = povrsinaM2 * sumTez;         // g po listu = kg na 1000 kom
        const kgSaSkartom = tezKg1000 * (1 + n(skart) / 100);
        const cenaMatKom = kgSaSkartom * avgCena;      // €/1000 kom (materijal)

        const ban = (WM > 0 && W > 0) ? Math.max(1, Math.floor(WM / W)) : 1;
        const otpadMm = (WM > 0 && W > 0) ? Math.max(0, WM - ban * W) : 0;

        // Kaширanje (višeslojni) — €/m² × m²/1000kom × (slojevi−1)
        const m2Po1000 = povrsinaM2 * 1000;
        const kasProlazi = Math.max(0, br - 1);
        const kasTr = n(kasCena) * m2Po1000 * kasProlazi;
        const trTr = n(trCena) * tezKg1000;

        const opcijeTr =
            (opts.perforacija ? n(perfCena) : 0) +
            (opts.zumbe ? n(zumbeCena) : 0) +
            (opts.presavijanje ? n(presCena) : 0);
        // „Pakovanje za hranu" je tehnički zahtev (bez cene).

        const setupUkupno = n(setupMasina);
        const setupPer1000 = kol > 0 ? (setupUkupno * 1000 / kol) : 0;

        const osnovna = cenaMatKom + opcijeTr + kasTr + trTr;
        const konacna = osnovna * (1 + n(marza) / 100) + setupPer1000;

        const valFak = kol / 1000;
        const vrednostKon = konacna * valFak;
        const vrednostOsn = osnovna * valFak;
        const ukKg = kgSaSkartom * valFak;
        const perKom = konacna / 1000;
        const izrMarza = n(zeljCena) > 0 && osnovna > 0 ? (n(zeljCena) / osnovna - 1) * 100 : 0;

        setRez({
            materijal: cenaMatKom, opcije: opcijeTr, kasiranje: kasTr, transport: trTr,
            setup1000: setupPer1000, setupUkupno,
            osnovna, konacna, vrednostOsn, vrednostKon,
            tezJedne: tezKg1000, ukKg, perKom, ban, otpadMm, korak, poprecno, idealnaS: WM,
            cenaPoKgSaMarza: tezKg1000 > 0 ? konacna / tezKg1000 : 0,
            cenaPoKgOsnovna: tezKg1000 > 0 ? osnovna / tezKg1000 : 0,
            izrMarza,
        });
    }, [sirina, duzina, sirinaMaterijala, kolicina, skart, marza, setupMasina, materijali, opts, perfCena, zumbeCena, presCena, kasCena, trCena, zeljCena]);

    // ── ČUVANJE (kalkulacije_kese, tip='tabak') ──
    async function sacuvaj() {
        try {
            if (!naziv.trim()) { alert('Unesi naziv.'); return; }
            const tezM = (m) => n(m.tezina ?? m.gm2 ?? m.tezinaGm2 ?? m.gsm ?? m.gramatura);
            const materijali_struktura = (materijali || []).map((m) => ({
                vrsta: m.vrsta || m.tip || '', pod_vrsta: m.pod_vrsta || m.podVrsta || '', oznaka: m.oznaka || m.oznaka_materijala || '',
                proizvodjac: m.proizvodjac || m.proizvođač || '',
                debljina: n(m.debljina), gm2: tezM(m), cena: n(m.cena ?? m.cena_kg),
            }));
            const avgTez = materijali.length ? materijali.reduce((a, m) => a + tezM(m), 0) / materijali.length : 0;
            const avgCena = materijali.length ? materijali.reduce((a, m) => a + n(m.cena ?? m.cena_kg), 0) / materijali.length : 0;

            // za kasniji templejt/nalog
            localStorage.setItem('maropack_pending_nalog', JSON.stringify({
                tip: 'tabak', type: 'tabak', naziv, kupac, oznaka_upita: oznakaUpita,
                tabak: { naziv, kolicina: n(kolicina), skart: n(skart), marza: n(marza), setup_masina: n(setupMasina), sirina: n(sirina), duzina: n(duzina), sirina_materijala: n(sirinaMaterijala), layers: materijali, options: opts, pakovanje: napomena || '' },
                materijali, materijali_struktura, rezultati: rez, created_at: new Date().toISOString(),
            }));

            const zapis = {
                tip: 'tabak',
                naziv, kupac, oznaka_upita: oznakaUpita,
                kolicina: n(kolicina), skart: n(skart), marza: n(marza),
                sirina: n(sirina), duzina: n(duzina), sirina_materijala: n(sirinaMaterijala),
                materijali_struktura,
                materijal: materijali.map((m) => m.vrsta || m.tip).filter(Boolean).join(' + '),
                debljina: materijali[0] ? n(materijali[0].debljina) : 0,
                tezina_gm2: avgTez, cena_kg: avgCena,
                transport: n(trCena),
                rezultati: {
                    ...rez,
                    _tip: 'tabak',
                    kolicina: n(kolicina),
                    konacnaCena: rez.konacna || 0,
                    osnovnaCena: rez.osnovna || 0,
                    ukupnoNalog: rez.vrednostKon || 0,
                    ukupnoOsnovno: rez.vrednostOsn || 0,
                    cenaPoKgSaMarza: rez.cenaPoKgSaMarza || 0,
                    cenaPoKgOsnovna: rez.cenaPoKgOsnovna || 0,
                    _ulaz: {
                        opts,
                        cene: { perfCena, zumbeCena, presCena, kasCena, trCena },
                        polja: { naziv, kupac, oznakaUpita, kolicina, skart, marza, setupMasina, datumIsp, zeljCena, sirina, duzina, sirinaMaterijala, napomena },
                        materijali,
                    },
                },
                osnovna_cena: rez.osnovna || 0,
                konacna_cena: rez.konacna || 0,
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
            alert(editId ? '✅ Izmene sačuvane!' : '✅ Kalkulacija tabaka sačuvana!');
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

    const matHdrCol = { fontSize: 9.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' };
    const matCols = '1.4fr 0.9fr 0.9fr 0.9fr 34px';

    return (
        <div style={S.wrap}>
            <div style={S.hdr}>
                <div>
                    <div style={{ fontSize: 19, fontWeight: 950, display: 'flex', alignItems: 'center', gap: 8 }}>📄 Kalkulacija tabaka</div>
                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>Ravan list — cena €/1000 kom &amp; €/kg</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Konačna cena</div>
                    <div style={{ fontSize: 24, fontWeight: 950 }}>{eur(rez.konacna)} €<span style={{ fontSize: 12, opacity: 0.85 }}> /1000</span></div>
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
                            <F label="Količina (kom)" value={kolicina} onChange={setKolicina} type="number" />
                            <F label="Škart (%)" value={skart} onChange={setSkart} type="number" />
                            <F label="Marža (%)" value={marza} onChange={setMarza} type="number" />
                            <F label="Podešavanje mašine (€ ukupno)" value={setupMasina} onChange={setSetupMasina} type="number" />
                            <F label="Datum isporuke" value={datumIsp} onChange={setDatumIsp} type="date" />
                        </div>
                    </div>

                    <div style={S.card}>
                        <div style={S.h}>Dimenzije</div>
                        <div style={S.grid(150)}>
                            <F label="Širina lista (mm)" value={sirina} onChange={setSirina} type="number" />
                            <F label="Dužina lista (mm)" value={duzina} onChange={setDuzina} type="number" />
                            <F label="Širina materijala (mm)" value={sirinaMaterijala} onChange={setSirinaMaterijala} type="number" />
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#475569', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, padding: '7px 10px' }}>
                            📐 Ban (traka po širini): <b style={{ color: GREEN_D }}>{rez.ban || 1}</b> &nbsp;·&nbsp; Korak na traci: <b>{fmt(rez.korak)}</b> mm
                            {n(rez.otpadMm) > 0 ? <span style={{ color: '#b91c1c' }}> &nbsp;·&nbsp; ivični otpad <b>{fmt(rez.otpadMm)}</b> mm</span> : null}
                        </div>
                    </div>

                    <div style={S.card}>
                        <div style={S.h}>Materijal (slojevi)</div>
                        {/* Isti selektor kao kod kese/folije: Vrsta · Pod vrsta · Oznaka · Proizvođač · Debljina → težina iz master liste */}
                        <MaterialLayersTablePRO
                            title=""
                            layers={materijali}
                            maxLayers={4}
                            showPrice={true}
                            showWidth={false}
                            showFlags={false}
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
                        <div style={S.h}>Opcije i dorada</div>
                        <div style={S.grid(230)}>
                            <Opt label="Perforacija" active={opts.perforacija} onToggle={() => toggle('perforacija')} cena={perfCena} setCena={setPerfCena} />
                            <Opt label="Rupe / zumbe" active={opts.zumbe} onToggle={() => toggle('zumbe')} cena={zumbeCena} setCena={setZumbeCena} />
                            <Opt label="Presavijanje (faltanje lista)" active={opts.presavijanje} onToggle={() => toggle('presavijanje')} cena={presCena} setCena={setPresCena} />
                            <Opt label="Pakovanje za hranu" active={opts.pakHrana} onToggle={() => toggle('pakHrana')} cenaVidljiva={false} />
                        </div>
                        {opts.pakHrana ? <div style={{ marginTop: 10, fontSize: 11.5, color: '#065f46', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '7px 10px' }}>⚠ Pakovanje za hranu — upotreba rukavica, mrežica za kosu, bez dlaka; čist pogon.</div> : null}
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
                            <Box label="€ / 1000 kom" value={eur(rez.konacna)} bg="#f0fdf4" bd="#86efac" col="#15803d" />
                            <Box label="€ / kom" value={eur(rez.perKom)} bg="#fffbeb" bd="#fcd34d" col="#92400e" />
                            <Box label="Ukupno nalog €" value={eur(rez.vrednostKon)} bg="#eff6ff" bd="#bfdbfe" col="#1d4ed8" />
                            <Box label="Ukupno kg" value={fmt(rez.ukKg)} bg="#fff7ed" bd="#fed7aa" col="#c2410c" />
                        </div>
                        <Rb k="Materijal (€/1000)" v={eur(rez.materijal)} />
                        <Rb k="Opcije (€/1000)" v={eur(rez.opcije)} />
                        {n(rez.kasiranje) > 0 ? <Rb k="Kaширanje (€/1000)" v={eur(rez.kasiranje)} /> : null}
                        {n(rez.transport) > 0 ? <Rb k="Transport (€/1000)" v={eur(rez.transport)} /> : null}
                        <Rb k="Osnovna (€/1000)" v={eur(rez.osnovna)} />
                        {n(rez.setup1000) > 0 ? <Rb k="Podešavanje (€/1000)" v={eur(rez.setup1000)} /> : null}
                        <Rb k="€ / kg (sa maржom)" v={eur(rez.cenaPoKgSaMarza)} />
                    </div>

                    <div style={S.card}>
                        <div style={S.h}>Provera cene</div>
                        <F label="Željena cena (€/1000)" value={zeljCena} onChange={setZeljCena} type="number" />
                        <div style={{ marginTop: 10, fontSize: 13, color: '#475569' }}>Izvedena marža: <b style={{ color: n(rez.izrMarza) >= n(marza) ? '#15803d' : '#b45309' }}>{fmt(rez.izrMarza)}%</b></div>
                        <button onClick={sacuvaj} style={{ marginTop: 16, width: '100%', background: `linear-gradient(135deg,${GREEN},${GREEN_D})`, color: '#fff', border: 'none', borderRadius: 11, padding: '13px', fontWeight: 900, fontSize: 15, cursor: 'pointer', boxShadow: '0 6px 16px rgba(5,150,105,.3)' }}>💾 {editId ? 'Sačuvaj izmene' : 'Sačuvaj kalkulaciju'}</button>
                        {typeof setPage === 'function' ? <button onClick={() => setPage('kalkulacije_lista')} style={{ marginTop: 8, width: '100%', background: '#fff', color: '#475569', border: '1.5px solid #cbd5e1', borderRadius: 11, padding: '10px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>← Lista kalkulacija</button> : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
