import React, { useState, useEffect, useRef } from 'react';
import MaterialSelectorPRO, { MaterialText } from './components/MaterialSelectorPRO.jsx';
import MaterialLayersTablePRO from './components/MaterialLayersTablePRO.jsx';
import { supabase } from './supabase.js';
import { useAuth } from './auth/AuthProvider';


// ===================== V26 TEMPLATE PREFILL HELPERS =====================
function readPendingTemplateCalculation(expectedTip) {
    try {
        const raw = localStorage.getItem('maropack_pending_template_calculation');
        if (!raw) return null;
        const kal = JSON.parse(raw);
        if ((kal.tip || kal.template?.type) !== expectedTip) return null;
        // VAŽNO: ne brišemo ovde zbog React StrictMode u dev režimu.
        // StrictMode pokrene useEffect dva puta; ako obrišemo localStorage na prvom mount-u,
        // drugi mount se vrati na default materijale. Brišemo/menjamo samo kada se novi template pošalje.
        return kal.template || kal.data || kal.kalkulator_prefill || null;
    } catch (e) {
        return null;
    }
}
function parseTemplateMaterialName(raw) {
    const value = String(raw || '').trim();
    const debMatch = value.match(/(\d+(?:[.,]\d+)?)\s*(?:µ|um|mik|mic)?\s*$/i);
    const debljina = debMatch ? String(debMatch[1]).replace(',', '.') : '';
    const tip = value.replace(/\s*\d+(?:[.,]\d+)?\s*(?:µ|um|mik|mic)?\s*$/i, '').trim() || value;
    return { tip, debljina };
}
function mapTemplateLayerToKesaMaterial(layer) {
    const parsed = parseTemplateMaterialName(layer.material || layer.tip || layer.naziv);
    return {
        tip: layer.tip || parsed.tip || 'OPP',
        debljina: String(layer.debljina || layer.deb || parsed.debljina || '30'),
        tezina: Number(layer.tezina || layer.t || layer.gsm || 0),
        cena: Number(layer.cena || 0)
    };
}

export default function KalkulacijaKese({ setPage }) {
    // ===================== STATE =====================
    const [currentTab, setCurrentTab] = useState('kalk');
    const [mod, setMod] = useState('normal');
    const [opts, setOpts] = useState({});

    // Osnovni podaci
    const [naziv, setNaziv] = useState('Kesa sa klapnom 200x400+50');
    const [kupac, setKupac] = useState('Medomix doo');
    const [kolicina, setKolicina] = useState(10000);
    const [skart, setSkart] = useState(10);
    const [marza, setMarza] = useState(30);
    const [datumIsp, setDatumIsp] = useState('');
    const [zeljCena, setZeljCena] = useState(120);

    // AUTH
    const { user } = useAuth();

    // Dimenzije
    const [sirina, setSirina] = useState(200);
    const [duzina, setDuzina] = useState(400);
    const [klapna, setKlapna] = useState(50);
    const [falta, setFalta] = useState(50);
    const [takta, setTakta] = useState(50);
    const [ban, setBan] = useState(1);
    const [tolerancija, setTolerancija] = useState('±10%');
    const [grafika, setGrafika] = useState('Novi posao');

    // Materijali
    const [materijali, setMaterijali] = useState([
        { tip: 'OPP', debljina: '30', tezina: 27.3, cena: 2.9 }
    ]);

    // Opcije parametri i cene
    const [dupTip, setDupTip] = useState('Obična');
    const [dupPoz, setDupPoz] = useState('Na klapni');
    const [dupCena, setDupCena] = useState(0.5);

    const [ezVel, setEzVel] = useState('MALA (30×10×5)');
    const [ezDist, setEzDist] = useState(9);
    const [ezCena, setEzCena] = useState(1.5);

    const [ozD, setOzD] = useState(6);
    const [ozPoz, setOzPoz] = useState('Na sredini/centrirano');
    const [ozCena, setOzCena] = useState(0.8);

    const [anTip, setAnTip] = useState('135µm/30mm/BELI');
    const [anCena, setAnCena] = useState(2.0);

    const [stTip, setStTip] = useState('Štampa vrućim pečatom crna boja');
    const [stPov, setStPov] = useState('');
    const [stMotiv, setStMotiv] = useState('');
    const [stPoz, setStPoz] = useState('Pozadi-centrirano');
    const [stCena, setStCena] = useState(1.2);

    const [buCena, setBuCena] = useState(5);
    const [adhOds, setAdhOds] = useState(0.2);
    const [adhCena, setAdhCena] = useState(1);
    const [ojSir, setOjSir] = useState(20);
    const [ojDeb, setOjDeb] = useState(150);
    const [ojCena, setOjCena] = useState(4);
    const [klBr, setKlBr] = useState(5);
    const [klCena, setKlCena] = useState(150);
    const [kvCena, setKvCena] = useState(1);
    const [pvCena, setPvCena] = useState(1.5);
    const [kkCena, setKkCena] = useState(0.5);
    const [ppvCena, setPpvCena] = useState(1.0);
    const [odCena, setOdCena] = useState(2.0);
    const [fdCena, setFdCena] = useState(1.5);
    const [vdCena, setVdCena] = useState(1.0);

    const [trCena, setTrCena] = useState(0.35);
    const [pakovanje, setPakovanje] = useState('U bunt ide 200 kom');
    const [napomena, setNapomena] = useState('');

    // ✅ V26: Template → Kalkulacija realno mapiranje za kese.
    // Više ne otvara default OPP ako template ima druge slojeve/opcije.
    useEffect(() => {
        const tpl = readPendingTemplateCalculation('kesa');
        if (!tpl) return;
        const k = tpl.kesa || {};
        setNaziv(tpl.naziv || k.naziv || '');
        setKupac(tpl.kupac || '');
        setKolicina(Number(k.kolicina || 0));
        setSkart(Number(k.skart || 10));
        setMarza(Number(k.marza || 30));
        setDatumIsp(k.datum || '');
        setSirina(Number(k.sirina || 0));
        setDuzina(Number(k.duzina || 0));
        setKlapna(Number(k.klapna || 0));
        setFalta(Number(k.falta || 0));
        setTakta(Number(k.takt || 0));
        setBan(Number(k.ban || 1));
        setTolerancija(k.tolerancija || '±10%');
        setGrafika(k.grafika || 'Novi posao');
        setMaterijali((k.layers || []).map(mapTemplateLayerToKesaMaterial).filter(m => m.tip));
        setOpts(k.options || {});
        setTrCena(Number(k.transportKg || 0));
        setPakovanje(k.pakovanje || '');
        setNapomena(tpl.napomena || 'Kalkulacija kreirana iz Product Template-a');
    }, []);

    // Rezultati
    const [rez, setRez] = useState({
        materijal: 0, stampa: 0, adh: 0, ostaleOpcije: 0, transport: 0, klise: 0,
        osnovna: 0, saSkartom: 0, konacna: 0, vrednostOsn: 0, vrednostKon: 0,
        tezJedne: 0, ukKg: 0, perKom: 0, idealnaS: 0, izrMarza: 0
    });

    // ===================== BAZA MATERIJALA =====================
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
        'CELULOZA': { '10': 14.5, '20': 29, '30': 43.5, '40': 58, '50': 72.5 }
    };

    const DEB_OPTIONS = {
        'OPP': ['15', '18', '20', '25', '28', '30', '35', '40', '45', '50', '60', '70'],
        'BOPP': ['5', '10', '15', '18', '20', '25', '28', '30', '35', '40', '45', '50', '55', '60', '65', '70'],
        'BOPP SEDEF': ['5', '10', '15', '20', '25', '30', '35', '38', '40', '45'],
        'BOPP BELI': ['5', '10', '15', '20', '25', '30', '35', '40', '45', '50'],
        'LDPE': ['10', '15', '20', '25', '30', '35', '40', '45', '50', '55', '60'],
        'CPP': ['5', '10', '15', '18', '20', '25', '28', '30', '35', '40', '45', '50'],
        'PET': ['12', '15', '19', '20', '36', '50'],
        'OPA': ['12', '15', '20', '25', '30', '40'],
        'PA': ['10', '15', '20', '30', '40'],
        'PA/PE koestruzija': ['10', '15', '20', '30', '40', '50'],
        'ALU': ['7', '9', '12', '15', '20', '30'],
        'CELULOZA': ['10', '20', '30', '40', '50']
    };

    // ===================== FUNKCIJE =====================
    const toggle = (k) => setOpts(prev => ({ ...prev, [k]: !prev[k] }));

    const matChange = (idx, tip) => {
        const debs = DEB_OPTIONS[tip] || ['30'];
        const deb = debs[0];
        const tez = (MAT_TEZ[tip] && MAT_TEZ[tip][deb]) || 27.3;
        const newMat = [...materijali];
        newMat[idx] = { ...newMat[idx], tip, debljina: deb, tezina: tez };
        setMaterijali(newMat);
    };

    const debChange = (idx, deb) => {
        const tip = materijali[idx].tip;
        const tez = (MAT_TEZ[tip] && MAT_TEZ[tip][deb]) || 27.3;
        const newMat = [...materijali];
        newMat[idx] = { ...newMat[idx], debljina: deb, tezina: tez };
        setMaterijali(newMat);
    };

    const dodajMat = () => {
        if (materijali.length >= 4) { alert('Maksimalno 4 materijala!'); return; }
        setMaterijali([...materijali, { tip: 'OPP', debljina: '30', tezina: 27.3, cena: 2.9 }]);
    };

    const ukloniMat = (idx) => {
        setMaterijali(materijali.filter((_, i) => i !== idx));
    };

    // KALKULACIJA - TAČNE EXCEL FORMULE
    useEffect(() => {
        let ukTezGm2 = 0, ukCenaKg = 0, matBr = 0;
        materijali.forEach(m => {
            if (m.tezina > 0) {
                ukTezGm2 += m.tezina;
                ukCenaKg += m.cena;
                matBr++;
            }
        });
        const avgCenaKg = matBr > 0 ? ukCenaKg / matBr : 2.9;

        const tezKg1000 = (sirina + klapna) / 1000 * (duzina + falta) / 1000 * ukTezGm2;
        const tezJedneG = tezKg1000;

        const kgSaSkartom = tezKg1000 * (1 + skart / 100);
        const cenaMatKom = kgSaSkartom * avgCenaKg;

        const ik = sirina * 2 + klapna;

        const stmTr = opts.stampa ? (tezKg1000 * stCena) : 0;
        const adhTr = opts.adhTraka ? (adhOds * adhCena) : 0;
        const ojTr = opts.ojacanje ? (sirina / 1000 * ojSir / 1000 * (ojDeb * 0.91) * ojCena * 1000) : 0;

        const klUk = klBr * klCena;
        const kliseTr = opts.klise ? (klUk / (kolicina / 1000)) : 0;

        const ostaleOpcije =
            (opts.duplofan ? dupCena : 0) +
            (opts.eurozumba ? ezCena : 0) +
            (opts.okruglaZumba ? ozCena : 0) +
            (opts.anleger ? anCena : 0) +
            (opts.busenje ? buCena : 0) +
            (opts.kontVar ? kvCena : 0) +
            (opts.perfVrucim ? pvCena : 0) +
            (opts.kosaKlapna ? kkCena : 0) +
            (opts.poprecniVar ? ppvCena : 0) +
            (opts.otvorDno ? odCena : 0) +
            (opts.faltaDno ? fdCena : 0) +
            (opts.varDno ? vdCena : 0);

        const trTr = trCena * tezKg1000;

        const osnovna = cenaMatKom + stmTr + adhTr + ostaleOpcije + kliseTr + trTr + ojTr;
        const konacna = osnovna * (1 + marza / 100);

        const valFak = kolicina / 1000;
        const vrednostKon = konacna * valFak;
        const vrednostOsn = osnovna * valFak;
        const ukKg = tezKg1000 * (1 + skart / 100) * valFak;
        const perKom = konacna / 1000;

        const izrMarza = zeljCena > 0 && osnovna > 0 ? (zeljCena / osnovna - 1) * 100 : 0;

        setRez({
            materijal: cenaMatKom,
            stampa: stmTr,
            adh: adhTr,
            ostaleOpcije,
            transport: trTr,
            klise: kliseTr,
            osnovna,
            saSkartom: cenaMatKom * (1 + skart / 100) + stmTr + adhTr + ostaleOpcije + kliseTr + trTr + ojTr,
            konacna,
            vrednostOsn,
            vrednostKon,
            tezJedne: tezJedneG,
            ukKg,
            perKom,
            idealnaS: ik,
            izrMarza
        });
    }, [sirina, duzina, klapna, falta, kolicina, skart, marza, materijali, opts,
        dupCena, ezCena, ozCena, anCena, stCena, buCena, adhOds, adhCena,
        ojSir, ojDeb, ojCena, klBr, klCena, kvCena, pvCena, kkCena, ppvCena,
        odCena, fdCena, vdCena, trCena, zeljCena]);

    const NAMES = {
        duplofan: 'Duplofan', eurozumba: 'Eurozumba', okruglaZumba: 'Ok.zumba',
        kosaKlapna: 'Kosa klapna', anleger: 'Anleger', utor: 'Utor',
        stampa: 'Štampa', perfOtk: 'Perf.otk.', poprecnaPerf: 'Pop.perf.',
        kontVar: 'Kont.var', poprecniVar: 'Pop.var', otvorDno: 'Otvor dno',
        faltaDno: 'Falta dno', varDno: 'Var dno', pakHrana: 'Pak.hrana',
        busenje: 'Bušenje', adhTraka: 'ADH traka', ojacanje: 'Ojačanje',
        klise: 'Kliše', perfVrucim: 'Perf.vrućim'
    };

    const aktivneOpcije = Object.keys(opts).filter(k => opts[k]).map(k => NAMES[k] || k).join(', ') || 'Nema';

    const f2 = (v) => (v || 0).toFixed(2) + ' €';
    const today = new Date().toLocaleDateString('sr-RS');

    // ===================== STILOVI =====================
    const s = {
        wrap: { padding: '16px', background: '#f1f5f9', minHeight: '100vh' },
        hdr: { background: 'linear-gradient(135deg,#059669,#047857)', padding: '22px 26px', borderRadius: '12px', color: 'white', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        sec: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '12px' },
        secT: { fontSize: '10px', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px' },
        input: { width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px' },
        label: { fontSize: '10px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px', textTransform: 'uppercase' },
        btn: { padding: '8px 14px', background: 'rgba(255,255,255,.2)', color: 'white', border: '1px solid rgba(255,255,255,.4)', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '11px' },
        grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
        grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' },
        grid4: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }
    };

    // ===================== KOMPONENTE =====================
    const Field = ({ label, value, onChange, type = 'text', readOnly = false, auto = false }) => (
        <div>
            <label style={s.label}>
                {label} {auto && <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px', marginLeft: '3px' }}>AUTO</span>}
            </label>
            <input
                style={{
                    ...s.input,
                    ...(auto ? { background: '#fef3c7', color: '#92400e', fontWeight: 700, borderColor: '#fbbf24' } : {})
                }}
                type={type}
                value={value}
                onChange={(e) => !readOnly && onChange(type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)}
                readOnly={readOnly}
            />
        </div>
    );

    const Sel = ({ label, value, onChange, children, auto = false }) => (
        <div>
            <label style={s.label}>
                {label} {auto && <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px', marginLeft: '3px' }}>AUTO</span>}
            </label>
            <select style={s.input} value={value} onChange={(e) => onChange(e.target.value)}>
                {children}
            </select>
        </div>
    );

    const Opt = ({ k, label, cena, badge }) => (
        <div
            style={{
                display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 10px',
                background: opts[k] ? '#f0fdf4' : '#f8fafc',
                border: `1px solid ${opts[k] ? '#10b981' : '#e5e7eb'}`,
                borderRadius: '7px', cursor: 'pointer', marginBottom: '5px'
            }}
            onClick={() => toggle(k)}
        >
            <input type="checkbox" checked={!!opts[k]} readOnly style={{ accentColor: '#059669', width: '14px', height: '14px' }} />
            <span style={{ fontSize: '11px', color: opts[k] ? '#047857' : '#475569', fontWeight: opts[k] ? 700 : 500, flex: 1 }}>{label}</span>
            {badge && <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '8px', background: '#e0e7ff', color: '#4338ca' }}>{badge}</span>}
            {cena && <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '8px', background: '#dcfce7', color: '#166534', fontWeight: 700 }}>{cena}€</span>}
        </div>
    );

    // ===================== RENDER =====================

    // ===================== SAČUVAJ KALKULACIJU =====================
    async function sacuvajKalkulaciju() {
        try {
            // Izvuci prosečne vrednosti iz materijala
            const avgTezina = materijali.length > 0
                ? materijali.reduce((sum, m) => sum + (Number(m.tezina) || 0), 0) / materijali.length
                : 0;

            const avgCena = materijali.length > 0
                ? materijali.reduce((sum, m) => sum + (Number(m.cena) || 0), 0) / materijali.length
                : 0;

            localStorage.setItem('maropack_pending_nalog', JSON.stringify({
                tip: 'kesa',
                type: 'kesa',
                naziv,
                kupac,
                kesa: {
                    naziv,
                    kolicina,
                    skart,
                    marza,
                    sirina,
                    duzina,
                    klapna,
                    falta,
                    layers: materijali,
                    options: opts,
                    pakovanje: napomena || ''
                },
                materijali,
                rezultati: rez,
                created_at: new Date().toISOString()
            }));
            const { error } = await supabase.from('kalkulacije_kese').insert([{
                // Osnovni podaci
                naziv,
                kupac,
                kolicina: Number(kolicina),
                skart: Number(skart),
                marza: Number(marza),

                // Dimenzije
                sirina: Number(sirina),
                duzina: Number(duzina),
                klapna: Number(klapna),
                falta: Number(falta),

                // Materijal (spojeni tipovi)
                materijal: materijali.map(m => m.tip).join(' + '),
                debljina: materijali[0] ? Number(materijali[0].debljina) : 0,
                tezina_gm2: avgTezina,
                cena_kg: avgCena,

                // Cene i troškovi
                cena_stampa: opts.stampa ? Number(stCena) : 0,
                transport: Number(trCena),

                // Rezultati
                rezultati: rez,
                osnovna_cena: rez.osnovna || 0,
                konacna_cena: rez.konacna || 0,

                // Opcije
                materijali: materijali,
                materijali_struktura: materijali,
                eurozumba: opts.eurozumba || false,
                duplofan: opts.duplofan || false,
                anleger: opts.anleger || false,
                perforacija: opts.perforacija || false,
                utor: opts.utor || false,
                stampanje: opts.stampa ? stTip : 'Bez štampe',

                // Meta
                napomena,
                created_by: user?.id
            }]);

            if (error) throw error;

            alert('✅ Kalkulacija sačuvana!');
        } catch (err) {
            console.error('Greška:', err);
            alert('❌ Greška pri čuvanju: ' + err.message);
        }
    }

    return (
        <div style={s.wrap}>
{/* HEADER */}
            <div style={{ background: 'linear-gradient(135deg, #0d9488 0%, #115e59 100%)', padding: 40, borderRadius: 16, color: 'white', marginBottom: 20, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 40, right: 40, display: 'flex', gap: 8, background: 'rgba(255,255,255,0.2)', padding: 6, borderRadius: 50 }}>
                    <button onClick={() => setMod('normal')} style={{ background: mod === 'normal' ? 'white' : 'transparent', color: mod === 'normal' ? '#0d9488' : 'white', border: 'none', padding: '12px 24px', borderRadius: 50, fontWeight: 700, cursor: 'pointer' }}>
                        📊 Normalni
                    </button>
                    <button onClick={() => setMod('reverse')} style={{ background: mod === 'reverse' ? 'white' : 'transparent', color: mod === 'reverse' ? '#0d9488' : 'white', border: 'none', padding: '12px 24px', borderRadius: 50, fontWeight: 700, cursor: 'pointer' }}>
                        🔄 Obrnuti
                    </button>
                </div>
                <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>🛍️ Kalkulacija Kese</h1>
                <p style={{ marginTop: 18, marginBottom: 0 }}>Smart Auto Kalkulacija • Live Rezultati</p>
            </div>

            {/* TAB: KALKULACIJA */}
            {currentTab === 'kalk' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 440px', gap: '0', minHeight: '80vh' }}>

                    {/* LEVO */}
                    <div style={{ padding: '0 16px 16px 0', overflowY: 'auto' }}>

                        {/* OSNOVNI PODACI */}
                        <div style={s.sec}>
                            <div style={s.secT}>📋 Osnovni podaci</div>
                            <div style={s.grid3}>
                                <Field label="Naziv kese" value={naziv} onChange={setNaziv} />
                                <Field label="Kupac" value={kupac} onChange={setKupac} />
                                <Field label="Količina (kom)" value={kolicina} onChange={setKolicina} type="number" />
                                <Field label="Škart (%)" value={skart} onChange={setSkart} type="number" />
                                <Field label="Datum isporuke" value={datumIsp} onChange={setDatumIsp} type="date" />
                                {mod === 'normal' && <Field label="Marža (%)" value={marza} onChange={setMarza} type="number" />}
                            </div>
                            {mod === 'reverse' && (
                                <div style={{ ...s.grid2, marginTop: '9px' }}>
                                    <Field label="Željena cena (€/1000 kom)" value={zeljCena} onChange={setZeljCena} type="number" />
                                    <Field label="Izračunata marža (%)" value={rez.izrMarza} onChange={() => { }} type="number" readOnly auto />
                                </div>
                            )}
                        </div>

                        {/* DIMENZIJE */}
                        <div style={s.sec}>
                            <div style={s.secT}>📐 Dimenzije kese</div>
                            <div style={s.grid4}>
                                <Field label="Širina (mm)" value={sirina} onChange={setSirina} type="number" />
                                <Field label="Dužina (mm)" value={duzina} onChange={setDuzina} type="number" />
                                <Field label="Klapna (mm)" value={klapna} onChange={setKlapna} type="number" />
                                <Field label="Falta (mm)" value={falta} onChange={setFalta} type="number" />
                            </div>
                            <div style={{ ...s.grid4, marginTop: '9px' }}>
                                <Field label="Takta/min" value={takta} onChange={setTakta} type="number" />
                                <Field label="Ban" value={ban} onChange={setBan} type="number" />
                                <Sel label="Tolerancija" value={tolerancija} onChange={setTolerancija}>
                                    <option>±10%</option>
                                    <option>Mora tačna količina</option>
                                    <option>Bez tolerancije</option>
                                </Sel>
                                <Sel label="Grafičko rešenje" value={grafika} onChange={setGrafika}>
                                    <option>Novi posao</option>
                                    <option>Postojeća</option>
                                    <option>Modifikacija</option>
                                </Sel>
                            </div>
                        </div>

                        {/* MATERIJALI */}
                        <MaterialLayersTablePRO
                            title="Materijali (do 4 sloja)"
                            layers={materijali}
                            maxLayers={4}
                            showPrice={true}
                            showWidth={true}
                            showFlags={true}
                            onChange={(next) => setMaterijali(next)}
                            onAdd={(row) => dodajMat ? setMaterijali([...materijali, row]) : setMaterijali([...materijali, row])}
                            onRemove={(idx) => ukloniMat(idx)}
                        />

                        {/* OPCIJE */}
                        <div style={s.sec}>
                            <div style={s.secT}>⚙️ Tehničke opcije kese</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px' }}>
                                <Opt k="duplofan" label="Duplofan traka" cena={dupCena} />
                                <Opt k="eurozumba" label="Eurozumba" cena={ezCena} />
                                <Opt k="okruglaZumba" label="Okrugla zumba" cena={ozCena} />
                                <Opt k="kosaKlapna" label="Ukošena klapna" cena={kkCena} />
                                <Opt k="anleger" label="Anleger" cena={anCena} />
                                <Opt k="utor" label="Utor" />
                                <Opt k="stampa" label="Štampa" cena={stCena} />
                                <Opt k="perfOtk" label="Perf. otkidanje" />
                                <Opt k="poprecnaPerf" label="Poprečna perf." />
                                <Opt k="kontVar" label="Kontinentalni var" cena={kvCena} />
                                <Opt k="poprecniVar" label="Poprečni var" cena={ppvCena} />
                                <Opt k="faltaDno" label="Falta na dnu" cena={fdCena} />
                                <Opt k="varDno" label="Var na dnu" cena={vdCena} />
                                <Opt k="otvorDno" label="Otvor na dnu" cena={odCena} />
                                <Opt k="pakHrana" label="Pakovanje za hranu" />
                                <Opt k="busenje" label="Bušenje rupe" cena={buCena} />
                                <Opt k="adhTraka" label="ADH traka" cena={adhCena} />
                                <Opt k="ojacanje" label="Ojačanje" />
                                <Opt k="klise" label="Trošak klišea" />
                                <Opt k="perfVrucim" label="Perf. vrućim iglama" cena={pvCena} />
                            </div>

                            {/* PANELI ZA OPCIJE - prikazuju se kad je opcija aktivna */}
                            {opts.duplofan && (
                                <div style={{ marginTop: '12px', padding: '12px', background: '#f5f3ff', border: '1px solid #a78bfa', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#5b21b6', marginBottom: '9px' }}>▐ Duplofan traka</div>
                                    <div style={s.grid3}>
                                        <Sel label="Tip trake" value={dupTip} onChange={setDupTip}>
                                            <option>Obična</option>
                                            <option>Permanentna</option>
                                            <option>Permanentna bezbedna za hranu</option>
                                            <option>Široka</option>
                                        </Sel>
                                        <Sel label="Pozicija" value={dupPoz} onChange={setDupPoz}>
                                            <option>Na klapni</option>
                                            <option>Na telu kese</option>
                                        </Sel>
                                        <Field label="Cena €/1000kom" value={dupCena} onChange={setDupCena} type="number" />
                                    </div>
                                </div>
                            )}

                            {opts.eurozumba && (
                                <div style={{ marginTop: '12px', padding: '12px', background: '#f0f9ff', border: '1px solid #7dd3fc', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1', marginBottom: '9px' }}>○ Eurozumba</div>
                                    <div style={s.grid3}>
                                        <Sel label="Veličina" value={ezVel} onChange={setEzVel}>
                                            <option>MALA (30×10×5)</option>
                                            <option>SREDNJA (32×10×5)</option>
                                            <option>VELIKA (35×12×5)</option>
                                        </Sel>
                                        <Field label="Odstojanje od dna (mm)" value={ezDist} onChange={setEzDist} type="number" />
                                        <Field label="Cena €/1000kom" value={ezCena} onChange={setEzCena} type="number" />
                                    </div>
                                </div>
                            )}

                            {opts.stampa && (
                                <div style={{ marginTop: '12px', padding: '12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', marginBottom: '9px' }}>🖨️ Štampa</div>
                                    <div style={s.grid3}>
                                        <Sel label="Tip štampe" value={stTip} onChange={setStTip}>
                                            <option>Štampa vrućim pečatom crna boja</option>
                                            <option>Štampa vrućim pečatom zlatna boja</option>
                                            <option>Flexo štampa</option>
                                            <option>Termotransfer</option>
                                        </Sel>
                                        <Field label="Površina štampe" value={stPov} onChange={setStPov} />
                                        <Field label="Motiv/tekst štampe" value={stMotiv} onChange={setStMotiv} />
                                    </div>
                                    <div style={{ ...s.grid3, marginTop: '8px' }}>
                                        <Sel label="Pozicija" value={stPoz} onChange={setStPoz}>
                                            <option>Pozadi-centrirano</option>
                                            <option>Spreda-centrirano</option>
                                            <option>mm od desne ivice</option>
                                            <option>Na sredini između vara i perforacije</option>
                                        </Sel>
                                        <Field label="kg materijala" value={rez.tezJedne} onChange={() => { }} type="number" readOnly auto />
                                        <Field label="Cena štampe €/kg" value={stCena} onChange={setStCena} type="number" />
                                    </div>
                                </div>
                            )}

                            {opts.adhTraka && (
                                <div style={{ marginTop: '12px', padding: '12px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', marginBottom: '9px' }}>📎 ADH Traka</div>
                                    <div style={s.grid3}>
                                        <Field label="Odsečak (m)" value={adhOds} onChange={setAdhOds} type="number" />
                                        <Field label="Cena €/1000kom" value={adhCena} onChange={setAdhCena} type="number" />
                                        <Field label="Ukupno €/1000kom" value={adhOds * adhCena} onChange={() => { }} type="number" readOnly auto />
                                    </div>
                                </div>
                            )}

                            {opts.ojacanje && (
                                <div style={{ marginTop: '12px', padding: '12px', background: '#faf5ff', border: '1px solid #c4b5fd', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#5b21b6', marginBottom: '9px' }}>🔲 Ojačanje</div>
                                    <div style={s.grid4}>
                                        <Field label="Dim. kese" value={sirina} onChange={() => { }} type="number" readOnly auto />
                                        <Field label="Širina ojačanja (mm)" value={ojSir} onChange={setOjSir} type="number" />
                                        <Field label="Debljina (µ)" value={ojDeb} onChange={setOjDeb} type="number" />
                                        <Field label="Cena €/kg" value={ojCena} onChange={setOjCena} type="number" />
                                    </div>
                                </div>
                            )}

                            {opts.klise && (
                                <div style={{ marginTop: '12px', padding: '12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#991b1b', marginBottom: '9px' }}>🎨 Trošak klišea</div>
                                    <div style={s.grid3}>
                                        <Field label="Broj klišea" value={klBr} onChange={setKlBr} type="number" />
                                        <Field label="Cena jednog (€)" value={klCena} onChange={setKlCena} type="number" />
                                        <Field label="Ukupno (€)" value={klBr * klCena} onChange={() => { }} type="number" readOnly auto />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* TRANSPORT */}
                        <div style={s.sec}>
                            <div style={s.secT}>🚚 Transport i pakovanje</div>
                            <div style={s.grid3}>
                                <Field label="Cena transporta €/kg" value={trCena} onChange={setTrCena} type="number" />
                                <Field label="Kg/1000kom" value={rez.tezJedne} onChange={() => { }} type="number" readOnly auto />
                                <Field label="Ukupno €/1000kom" value={rez.transport} onChange={() => { }} type="number" readOnly auto />
                            </div>
                            <div style={{ marginTop: '9px' }}>
                                <Sel label="Pakovanje" value={pakovanje} onChange={setPakovanje}>
                                    <option>U bunt ide 200 kom</option>
                                    <option>U bunt ide 100 kom</option>
                                    <option>U keseice po 100 kom</option>
                                    <option>U kutiju ide 500 kom</option>
                                    <option>U kutiju ide 1000 kom</option>
                                    <option>Gore i dole karton sa banderolom</option>
                                    <option>Banderola</option>
                                </Sel>
                            </div>
                        </div>

                        {/* NAPOMENA */}
                        <div style={s.sec}>
                            <div style={s.secT}>📝 Napomena</div>
                            <textarea
                                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px', minHeight: '55px', resize: 'vertical' }}
                                placeholder="Napomena za radnike..."
                                value={napomena}
                                onChange={(e) => setNapomena(e.target.value)}
                            />
                        </div>

                    </div>

                    {/* DESNO - REZULTATI */}
                    <div style={{ background: 'white', borderLeft: '2px solid #e2e8f0', padding: '16px', overflowY: 'auto' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#059669', marginBottom: '8px' }}>💰 Rezultati kalkulacije</div>

                        <div style={{ background: 'white', borderRadius: '9px', padding: '12px', marginBottom: '8px', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>Cena materijala / 1000kom</span>
                                <span style={{ fontSize: '13px', fontWeight: 800 }}>{f2(rez.materijal)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>Štampa / 1000kom</span>
                                <span style={{ fontSize: '13px', fontWeight: 800 }}>{f2(rez.stampa)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>ADH traka</span>
                                <span style={{ fontSize: '13px', fontWeight: 800 }}>{f2(rez.adh)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>Ostale opcije</span>
                                <span style={{ fontSize: '13px', fontWeight: 800 }}>{f2(rez.ostaleOpcije)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>Transport</span>
                                <span style={{ fontSize: '13px', fontWeight: 800 }}>{f2(rez.transport)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>Kliše (raspoređen)</span>
                                <span style={{ fontSize: '13px', fontWeight: 800 }}>{f2(rez.klise)}</span>
                            </div>
                        </div>

                        <div style={{ background: 'linear-gradient(135deg,#d1fae5,#a7f3d0)', border: '2px solid #10b981', borderRadius: '9px', padding: '12px', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#065f46' }}>Osnovna cena / 1000kom</div>
                                <div style={{ fontSize: '20px', fontWeight: 800, color: '#065f46' }}>{f2(rez.osnovna)}</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,.5)' }}>
                                <div><div style={{ fontSize: '8px', color: '#065f46' }}>Sa škartom</div><div style={{ fontSize: '14px', fontWeight: 800, color: '#047857' }}>{f2(rez.saSkartom)}</div></div>
                                <div style={{ textAlign: 'right' }}><div style={{ fontSize: '8px', color: '#065f46' }}>Vrednost naloga</div><div style={{ fontSize: '14px', fontWeight: 800, color: '#047857' }}>{f2(rez.vrednostOsn)}</div></div>
                            </div>
                        </div>

                        <div style={{ background: 'linear-gradient(135deg,#fef3c7,#fde68a)', border: '3px solid #fbbf24', borderRadius: '12px', padding: '18px', marginBottom: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>KONAČNA CENA</div>
                            <div style={{ fontSize: '32px', fontWeight: 800, color: '#92400e' }}>{f2(rez.konacna)}</div>
                            <div style={{ fontSize: '11px', color: '#92400e', marginTop: '3px' }}>/ 1000 kom · Marža {marza}%</div>
                            <div style={{ background: 'rgba(255,255,255,.6)', padding: '10px', borderRadius: '8px', marginTop: '12px' }}>
                                <div style={{ fontSize: '9px', color: '#92400e', marginBottom: '3px' }}>VREDNOST NALOGA ({kolicina.toLocaleString()} kom)</div>
                                <div style={{ fontSize: '22px', fontWeight: 800, color: '#92400e' }}>{f2(rez.vrednostKon)}</div>
                                <div style={{ fontSize: '8px', color: '#92400e', marginTop: '2px' }}>Cena po kom: {(rez.perKom || 0).toFixed(4)} €</div>
                            </div>
                        </div>

                        <div style={{ background: 'linear-gradient(135deg,#fed7aa,#fdba74)', border: '2px solid #f97316', borderRadius: '9px', padding: '11px', marginBottom: '8px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', marginBottom: '6px' }}>📦 Materijal za nalog</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px' }}>
                                <div><div style={{ fontSize: '7px', color: '#9a3412' }}>Težina kese</div><div style={{ fontSize: '12px', fontWeight: 800, color: '#9a3412' }}>{(rez.tezJedne || 0).toFixed(3)} g</div></div>
                                <div><div style={{ fontSize: '7px', color: '#9a3412' }}>Ukupno kg</div><div style={{ fontSize: '12px', fontWeight: 800, color: '#9a3412' }}>{(rez.ukKg || 0).toFixed(2)} kg</div></div>
                                <div><div style={{ fontSize: '7px', color: '#9a3412' }}>Idealna širina</div><div style={{ fontSize: '12px', fontWeight: 800, color: '#9a3412' }}>{rez.idealnaS || 0} mm</div></div>
                            </div>
                        </div>

                        <button
                            onClick={sacuvajKalkulaciju}
                            style={{
                                width: '100%',
                                padding: '11px',
                                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '9px',
                                fontWeight: 800,
                                fontSize: '12px',
                                cursor: 'pointer',
                                marginTop: '4px',
                                marginBottom: '6px',
                                boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)'
                            }}
                        >
                            💾 Sačuvaj kalkulaciju
                        </button>

                        <button onClick={() => setCurrentTab('nalog')} style={{ width: '100%', padding: '11px', background: '#059669', color: 'white', border: 'none', borderRadius: '9px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', marginTop: '4px' }}>📋 Kreiraj nalog →</button>
                    </div>

                </div>
            )}


            {/* TAB: A4 CRTEŽ */}
            {currentTab === 'crtez' && (
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px' }}>
                    <div style={{ borderBottom: '3px solid #059669', paddingBottom: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#059669' }}>MAROPACK DOO</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', textAlign: 'center' }}>TEHNIČKI CRTEŽ KESE</div>
                        <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'right' }}>
                            <div>Datum: <span>{today}</span></div>
                            <div style={{ marginTop: '2px' }}>Crtež br.: <span>TC-2026-____</span></div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', marginBottom: '24px' }}>
                        {/* SVG CRTEŽ */}
                        <div style={{ flex: '0 0 auto' }}>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', textAlign: 'center', marginBottom: '12px' }}>PREDNJI POGLED — U RAZMERI</div>
                            <svg width="260" height="420" viewBox="0 0 260 420" style={{ border: '2px solid #e5e7eb', borderRadius: '8px', background: '#fafafa' }}>
                                <defs>
                                    <pattern id="hp2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                        <line x1="0" y1="0" x2="0" y2="6" stroke="#a5b4fc" strokeWidth="2" />
                                    </pattern>
                                    <marker id="b1" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                                        <path d="M0,0 L0,6 L6,3 Z" fill="#3b82f6" />
                                    </marker>
                                    <marker id="b2" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
                                        <path d="M0,0 L0,6 L6,3 Z" fill="#3b82f6" />
                                    </marker>
                                </defs>

                                {/* ANLEGER */}
                                {opts.anleger && <rect x="30" y="5" width="160" height="13" fill="#fef9c3" stroke="#eab308" strokeWidth="2" />}
                                {opts.anleger && <text x="110" y="14" textAnchor="middle" fontSize="8" fill="#854d0e" fontWeight="800">▬ ANLEGER ▬</text>}

                                {/* KLAPNA */}
                                <rect x="30" y="18" width="160" height="55" fill="#ede9fe" stroke="#7c3aed" strokeWidth="2.5" rx="3" />
                                <text x="110" y="42" textAnchor="middle" fontSize="11" fill="#5b21b6" fontWeight="800">KLAPNA</text>
                                <text x="110" y="58" textAnchor="middle" fontSize="10" fill="#7c3aed">{klapna} mm</text>

                                {/* DUPLOFAN */}
                                {opts.duplofan && <rect x="30" y="64" width="160" height="12" fill="url(#hp2)" stroke="#6366f1" strokeWidth="2" />}
                                {opts.duplofan && <text x="110" y="73" textAnchor="middle" fontSize="7" fill="#3730a3" fontWeight="900">▐ DUPLOFAN ▌</text>}

                                {/* TELO */}
                                <rect x="30" y="73" width="160" height="280" fill="#f0f9ff" stroke="#0284c7" strokeWidth="2.5" />

                                {/* EUROZUMBA */}
                                {opts.eurozumba && (
                                    <g>
                                        <ellipse cx="110" cy="110" rx="22" ry="13" fill="white" stroke="#0284c7" strokeWidth="2.5" />
                                        <ellipse cx="110" cy="110" rx="17" ry="9" fill="none" stroke="#bae6fd" strokeWidth="1.2" strokeDasharray="3,2" />
                                        <text x="110" y="113.5" textAnchor="middle" fontSize="8" fill="#0369a1" fontWeight="800">EURO ○</text>
                                    </g>
                                )}

                                {/* ŠTAMPA */}
                                {opts.stampa && (
                                    <g>
                                        <rect x="50" y="170" width="120" height="80" fill="#f0fdf4" opacity=".9" rx="4" />
                                        <rect x="50" y="170" width="120" height="80" fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="6,4" rx="4" />
                                        <text x="110" y="202" textAnchor="middle" fontSize="10" fill="#059669" fontWeight="800">POVRŠINA ŠTAMPE</text>
                                        <text x="110" y="218" textAnchor="middle" fontSize="9" fill="#16a34a" fontWeight="700">{stMotiv || 'Motiv'}</text>
                                    </g>
                                )}

                                {/* PERFORACIJA OTKIDANJE */}
                                {opts.perfOtk && (
                                    <g>
                                        <line x1="30" y1="155" x2="190" y2="155" stroke="#f97316" strokeWidth="2" strokeDasharray="6,4" />
                                        <text x="110" y="149" textAnchor="middle" fontSize="8" fill="#ea580c" fontWeight="800">✂ PERFORACIJA OTKIDANJE ✂</text>
                                    </g>
                                )}

                                {/* POPREČNI VAR */}
                                {opts.poprecniVar && (
                                    <g>
                                        <rect x="30" y="323" width="160" height="9" fill="#fecaca" stroke="#ef4444" strokeWidth="2" rx="2" />
                                        <text x="110" y="330" textAnchor="middle" fontSize="7.5" fill="#b91c1c" fontWeight="800">⊟ POPREČNI VAR ⊟</text>
                                    </g>
                                )}

                                {/* DNO */}
                                <rect x="30" y="353" width="160" height="24" fill="#bae6fd" stroke="#0284c7" strokeWidth="2.5" />
                                <text x="110" y="369" textAnchor="middle" fontSize="11" fill="#075985" fontWeight="900">D N O</text>

                                {/* FALTA DNO */}
                                {opts.faltaDno && (
                                    <g>
                                        <rect x="30" y="333" width="160" height="30" fill="#fef9c3" stroke="#ca8a04" strokeWidth="2" />
                                        <text x="110" y="344" textAnchor="middle" fontSize="8.5" fill="#78350f" fontWeight="800">FALTA DNO</text>
                                    </g>
                                )}

                                {/* KOTE ŠIRINA */}
                                <line x1="30" y1="400" x2="190" y2="400" stroke="#3b82f6" strokeWidth="1.2" markerStart="url(#b2)" markerEnd="url(#b1)" />
                                <text x="110" y="413" textAnchor="middle" fontSize="11" fill="#1d4ed8" fontWeight="900">{sirina} mm</text>

                                {/* KOTE DUŽINA */}
                                <line x1="222" y1="73" x2="222" y2="353" stroke="#3b82f6" strokeWidth="1.2" markerStart="url(#b2)" markerEnd="url(#b1)" />
                                <text x="235" y="225" textAnchor="middle" fontSize="11" fill="#1d4ed8" fontWeight="900" transform="rotate(90,235,225)">{duzina} mm</text>
                            </svg>
                        </div>

                        {/* INFO PANEL */}
                        <div style={{ flex: '0 0 200px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}>Dimenzije</div>
                            <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse', marginBottom: '16px' }}>
                                <tbody>
                                    <tr><td style={{ color: '#64748b', padding: '3px 0' }}>Širina:</td><td style={{ fontWeight: 800, textAlign: 'right' }}>{sirina} mm</td></tr>
                                    <tr><td style={{ color: '#64748b', padding: '3px 0' }}>Dužina:</td><td style={{ fontWeight: 800, textAlign: 'right' }}>{duzina} mm</td></tr>
                                    <tr><td style={{ color: '#64748b', padding: '3px 0' }}>Klapna:</td><td style={{ fontWeight: 800, textAlign: 'right' }}>{klapna} mm</td></tr>
                                    <tr><td style={{ color: '#64748b', padding: '3px 0' }}>Falta:</td><td style={{ fontWeight: 800, textAlign: 'right' }}>{falta > 0 ? falta + ' mm' : 'NE'}</td></tr>
                                    <tr style={{ borderTop: '1px solid #e5e7eb' }}><td style={{ color: '#64748b', padding: '3px 0' }}>Težina kese:</td><td style={{ fontWeight: 800, color: '#059669', textAlign: 'right' }}>{(rez.tezJedne || 0).toFixed(3)} g</td></tr>
                                    <tr><td style={{ color: '#64748b', padding: '3px 0' }}>Idealna širina:</td><td style={{ fontWeight: 800, color: '#1d4ed8', textAlign: 'right' }}>{rez.idealnaS} mm</td></tr>
                                </tbody>
                            </table>

                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '6px', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}>Aktivne opcije</div>
                            <div style={{ fontSize: '9px', color: '#047857', fontWeight: 600, lineHeight: 1.6 }}>{aktivneOpcije}</div>

                            <div style={{ marginTop: '16px', fontSize: '9px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '6px', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}>Materijal</div>
                            <div style={{ fontSize: '9px', color: '#64748b', lineHeight: 1.5 }}>
                                {materijali.map((m, i) => (
                                    <div key={i}>{m.nazivMaterijala || `${m.tip} ${m.oznaka || ''} ${m.debljina}µ`} ({m.tezina}g/m²)</div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                        <div style={{ border: '1.5px solid #e5e7eb', borderRadius: '6px', padding: '12px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#059669', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #e5e7eb', paddingBottom: '5px' }}>Identifikacija</div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}><span style={{ color: '#64748b' }}>Naziv:</span> <strong>{naziv}</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}><span style={{ color: '#64748b' }}>Kupac:</span> <strong>{kupac}</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}><span style={{ color: '#64748b' }}>Količina:</span> <strong>{kolicina.toLocaleString()} kom</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}><span style={{ color: '#64748b' }}>Pakovanje:</span> <strong>{pakovanje}</strong></div>
                        </div>
                        <div style={{ border: '1.5px solid #e5e7eb', borderRadius: '6px', padding: '12px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#059669', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #e5e7eb', paddingBottom: '5px' }}>Tehničke karakteristike</div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}><span style={{ color: '#64748b' }}>Takta/min:</span> <strong>{takta}</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}><span style={{ color: '#64748b' }}>Ban:</span> <strong>{ban}</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}><span style={{ color: '#64748b' }}>Tolerancija:</span> <strong>{tolerancija}</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}><span style={{ color: '#64748b' }}>Grafičko rešenje:</span> <strong>{grafika}</strong></div>
                        </div>
                    </div>

                    <div style={{ borderTop: '2px solid #e5e7eb', marginTop: '20px', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            {napomena && (
                                <div style={{ fontSize: '10px', color: '#64748b' }}>
                                    <strong>Napomena:</strong> {napomena}
                                </div>
                            )}
                        </div>
                        <button onClick={() => window.print()} style={{ padding: '10px 20px', background: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 800, fontSize: '12px' }}>
                            🖨️ Štampaj A4 crtež
                        </button>
                    </div>
                </div>
            )}

            {/* TAB: RADNI NALOG */}
            {currentTab === 'nalog' && (
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px' }}>
                    <div style={{ borderBottom: '3px solid #059669', paddingBottom: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#059669' }}>MAROPACK DOO</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', textAlign: 'center' }}>NALOG ZA PROIZVODNJU</div>
                        <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'right' }}>
                            <div>RB naloga: <strong>2026-_____</strong></div>
                            <div style={{ marginTop: '2px' }}>Datum: <span>{today}</span></div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ border: '1.5px solid #e5e7eb', borderRadius: '6px', padding: '12px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#059669', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #e5e7eb', paddingBottom: '5px' }}>Opšti podaci</div>
                            <div style={{ fontSize: '11px', marginBottom: '6px' }}><span style={{ color: '#64748b' }}>Naziv proizvoda:</span> <strong>{naziv}</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '6px' }}><span style={{ color: '#64748b' }}>Kupac:</span> <strong>{kupac}</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '6px' }}><span style={{ color: '#64748b' }}>Datum isporuke:</span> <strong>{datumIsp || '—'}</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '6px' }}><span style={{ color: '#64748b' }}>Graf. rešenje:</span> <strong>{grafika}</strong></div>
                        </div>
                        <div style={{ border: '1.5px solid #e5e7eb', borderRadius: '6px', padding: '12px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#059669', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #e5e7eb', paddingBottom: '5px' }}>Količine i materijal</div>
                            <div style={{ fontSize: '11px', marginBottom: '6px' }}><span style={{ color: '#64748b' }}>Poručena količina:</span> <strong style={{ color: '#059669' }}>{kolicina.toLocaleString()} kom</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '6px' }}><span style={{ color: '#64748b' }}>Materijal:</span> <strong>{materijali.map(m => m.nazivMaterijala || `${m.tip} ${m.oznaka || ''} ${m.debljina}µ`).join(' + ')}</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '6px' }}><span style={{ color: '#64748b' }}>Idealna širina:</span> <strong style={{ color: '#1d4ed8' }}>{rez.idealnaS} mm</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '6px' }}><span style={{ color: '#64748b' }}>Potrebno mat.:</span> <strong style={{ color: '#ea580c' }}>{(rez.ukKg || 0).toFixed(2)} kg</strong></div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ border: '1.5px solid #e5e7eb', borderRadius: '6px', padding: '12px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#059669', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #e5e7eb', paddingBottom: '5px' }}>Tehničke specifikacije</div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}><span style={{ color: '#64748b' }}>Širina:</span> <strong>{sirina} mm</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}><span style={{ color: '#64748b' }}>Dužina:</span> <strong>{duzina} mm</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}><span style={{ color: '#64748b' }}>Klapna:</span> <strong>{klapna} mm</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}><span style={{ color: '#64748b' }}>Falta dno:</span> <strong>{falta > 0 ? falta + ' mm' : 'NE'}</strong></div>
                            <div style={{ fontSize: '11px', marginBottom: '4px' }}><span style={{ color: '#64748b' }}>Pakovanje:</span> <strong>{pakovanje}</strong></div>
                        </div>
                        <div style={{ border: '1.5px solid #e5e7eb', borderRadius: '6px', padding: '12px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#059669', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #e5e7eb', paddingBottom: '5px' }}>Aktivne opcije</div>
                            <div style={{ fontSize: '10px', color: '#047857', lineHeight: 1.6 }}>{aktivneOpcije}</div>
                        </div>
                    </div>

                    {napomena && (
                        <div style={{ border: '1.5px solid #fbbf24', background: '#fffbeb', borderRadius: '6px', padding: '10px', marginBottom: '16px' }}>
                            <strong style={{ fontSize: '11px', color: '#92400e' }}>Napomena:</strong> <span style={{ fontSize: '11px', color: '#92400e' }}>{napomena}</span>
                        </div>
                    )}

                    <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: '6px', padding: '10px', marginBottom: '16px', fontSize: '10px', color: '#991b1b' }}>
                        <strong>Obaveze radnika:</strong> Dužnost svih radnika koji učestvuju u izradi radnog naloga jeste da linija bude oslobođena nečistoća i stranih tela, da se redovno proveravaju dimenzije, vrši proba na kidanje, kontroliše vizuelni izgled proizvoda, položaj štampe i kvalitet perforacije.
                    </div>

                    <div style={{ border: '1.5px solid #e5e7eb', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '10px' }}>Praćenje izrade</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '10px' }}>
                            <div>Datum podešavanja: _____________ od: _____ do: _____ h</div>
                            <div>Početak izrade: _____________ u _____ h</div>
                            <div>Završetak izrade: _____________ u _____ h</div>
                            <div>Ukupno radnih sati: _____________ Podesio: _____________</div>
                        </div>
                        <div style={{ marginTop: '10px', fontSize: '10px' }}>PROIZVEDENA KOLIČINA: _____________________ Škart: _____________________</div>
                    </div>

                    <div style={{ borderTop: '2px solid #e5e7eb', marginTop: '16px', paddingTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                        <div><div style={{ borderTop: '1px solid #1e293b', marginTop: '40px', paddingTop: '6px', fontSize: '10px', color: '#64748b', textAlign: 'center' }}>Nalog izradio</div></div>
                        <div><div style={{ borderTop: '1px solid #1e293b', marginTop: '40px', paddingTop: '6px', fontSize: '10px', color: '#64748b', textAlign: 'center' }}>Nalog odobrio</div></div>
                        <div><div style={{ borderTop: '1px solid #1e293b', marginTop: '40px', paddingTop: '6px', fontSize: '10px', color: '#64748b', textAlign: 'center' }}>Operater</div></div>
                    </div>
                </div>
            )}

        </div>
    );
}


// V46_MATERIAL_MASTER_EVERYWHERE: ovaj fajl je pripremljen za MaterialSelectorPRO / MaterialText.


// V47_MATERIAL_SELECTOR_REPLACEMENT: stari unos materijala treba fizički zameniti MaterialSelectorPRO / MaterialLayerRowPRO.
