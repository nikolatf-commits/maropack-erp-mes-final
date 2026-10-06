import React, { useState, useEffect, useRef } from 'react';
import AIPomoc from "./modules/AIPomoc.jsx";
import MaterialSelectorPRO, { MaterialText } from './components/MaterialSelectorPRO.jsx';
import MaterialLayersTablePRO from './components/MaterialLayersTablePRO.jsx';
import { buildMaterijaliStruktura } from './data/materialMaster.js';
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
    const parsed = parseTemplateMaterialName(layer.material || layer.materijal || layer.tip || layer.vrsta || layer.naziv || layer.oznaka);
    return {
        tip: layer.tip || layer.vrsta || layer.materijal || parsed.tip || 'OPP',
        debljina: String(layer.debljina || layer.deb || layer.mic || parsed.debljina || '30'),
        tezina: Number(layer.tezina || layer.t || layer.gsm || layer.gm2 || layer.gramatura || 0),
        cena: Number(layer.cena || layer.cena_kg || 0)
    };
}

// ===================== STILOVI (module-scope, statični) =====================
const s = {
    wrap: { padding: '16px', background: '#f1f5f9', minHeight: '100vh' },
    hdr: { background: 'linear-gradient(135deg,#059669,#047857)', padding: '22px 26px', borderRadius: '12px', color: 'white', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    sec: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '12px' },
    secT: { fontSize: '10px', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px' },
    input: { width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' },
    label: { fontSize: '10px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px', textTransform: 'uppercase' },
    btn: { padding: '8px 14px', background: 'rgba(255,255,255,.2)', color: 'white', border: '1px solid rgba(255,255,255,.4)', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '11px' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
    grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' },
    grid4: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }
};

// ===================== KOMPONENTE (module-scope — da input NE gubi fokus) =====================
// VAŽNO: ove komponente su izvučene IZVAN KalkulacijaKese. Kad su bile unutra, React ih je
// pravio iznova na svaki render pa je input gubio fokus posle svakog slova (moralo se klikati).
function Field({ label, value, onChange, type = 'text', readOnly = false, auto = false }) {
    return (
        <div>
            <label style={s.label}>
                {label} {auto && <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px', marginLeft: '3px' }}>AUTO</span>}
            </label>
            <input
                style={{ ...s.input, ...(auto ? { background: '#fef3c7', color: '#92400e', fontWeight: 700, borderColor: '#fbbf24' } : {}) }}
                type={type}
                value={value}
                onChange={(e) => !readOnly && onChange(type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)}
                readOnly={readOnly}
            />
        </div>
    );
}

function Sel({ label, value, onChange, children, auto = false }) {
    return (
        <div>
            <label style={s.label}>
                {label} {auto && <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px', marginLeft: '3px' }}>AUTO</span>}
            </label>
            <select style={s.input} value={value} onChange={(e) => onChange(e.target.value)}>
                {children}
            </select>
        </div>
    );
}

// Tehnička opcija kese: čekboks + naziv + JASNA ĆELIJA za cenu sa labelom „€/1000 kom".
function Opt({ label, active, onToggle, cena, setCena, badge }) {
    return (
        <div
            style={{
                display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 10px',
                background: active ? '#f0fdf4' : '#f8fafc',
                border: `1px solid ${active ? '#10b981' : '#e5e7eb'}`,
                borderRadius: '7px', marginBottom: '5px'
            }}
        >
            <input type="checkbox" checked={!!active} onChange={onToggle}
                style={{ accentColor: '#059669', width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }} />
            <span onClick={onToggle} style={{ fontSize: '11px', color: active ? '#047857' : '#475569', fontWeight: active ? 700 : 500, flex: 1, cursor: 'pointer' }}>{label}</span>
            {badge && <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '8px', background: '#e0e7ff', color: '#4338ca' }}>{badge}</span>}
            {setCena ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    <input type="number" step="0.1" value={cena}
                        onChange={e => setCena(parseFloat(e.target.value) || 0)}
                        title="Cena €/1000 kom — možeš je menjati"
                        style={{ width: '54px', fontSize: '11px', fontWeight: 800, textAlign: 'right', padding: '4px 6px', border: '1px solid #86efac', borderRadius: '6px', background: '#f0fdf4', color: '#166534' }} />
                    <span style={{ fontSize: '8px', color: '#64748b', fontWeight: 700, lineHeight: 1.05, whiteSpace: 'nowrap' }}>Cena<br />€/1000kom</span>
                </span>
            ) : (cena != null && cena !== '' && <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '8px', background: '#dcfce7', color: '#166534', fontWeight: 700 }}>{cena}€</span>)}
        </div>
    );
}

export default function KalkulacijaKese({ setPage }) {
    // ===================== STATE =====================
    const [currentTab, setCurrentTab] = useState('kalk');
    const [mod, setMod] = useState('normal');
    const [opts, setOpts] = useState({});

    // Osnovni podaci
    const [naziv, setNaziv] = useState('');
    const [kupac, setKupac] = useState('');
    const [oznakaUpita, setOznakaUpita] = useState(''); // broj/oznaka upita — za pretragu u listi i AI
    const [kolicina, setKolicina] = useState(0);
    const [skart, setSkart] = useState(10);
    const [marza, setMarza] = useState(30);
    const [setupMasina, setSetupMasina] = useState(0); // trošak podešavanja mašine (€/1000kom, bez marže)
    const [datumIsp, setDatumIsp] = useState('');
    const [zeljCena, setZeljCena] = useState(120);

    // AUTH
    const { user } = useAuth();

    // Dimenzije
    const [sirina, setSirina] = useState(0);
    const [duzina, setDuzina] = useState(0);
    const [klapna, setKlapna] = useState(50);
    const [falta, setFalta] = useState(50);
    const [takta, setTakta] = useState(50);
    const [ban, setBan] = useState(1);
    const [tolerancija, setTolerancija] = useState('±10%');
    const [grafika, setGrafika] = useState('');
    // Orijentacija kese na materijalu — kao u templejtu/nalogu. Utiče na duplo platno.
    const [orijentacija, setOrijentacija] = useState('sirina'); // "sirina" | "duzina"

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
    // Opcije koje ranije nisu imale cenu — sad se i one mogu menjati (default 0).
    const [utorCena, setUtorCena] = useState(0);
    const [potkCena, setPotkCena] = useState(0);     // perf. otkidanje
    const [pperfCena, setPperfCena] = useState(0);   // poprečna perf.
    const [phranaCena, setPhranaCena] = useState(0); // pakovanje za hranu
    // KAŠIRANJE I LAK — kese ume da budu duplex/triplex/kvadriplex (više slojeva se kaшira).
    const [kasCena, setKasCena] = useState(0.03);        // USLUGE kaширanje €/m²
    const [lakKesaCena, setLakKesaCena] = useState(0.02); // (zadržano zbog kompatibilnosti)
    const [lakKesaProlazi, setLakKesaProlazi] = useState(1);
    // LEPAK 1/2/3 + LAK (kg-model — isto kao folija). Utrošak kg/1000kom = površina × potrošnja (auto, može ručno).
    const [lepak, setLepak] = useState([
        { potrosnja: 0.002, utrosak: '', prolazi: 0, cena: 6 },
        { potrosnja: 0.002, utrosak: '', prolazi: 0, cena: 6 },
        { potrosnja: 0.002, utrosak: '', prolazi: 0, cena: 6 },
    ]);
    const [lak, setLak] = useState({ potrosnja: 0.0012, utrosak: '', prolazi: 0, cena: 7.05 });
    const [lakiranjeCena, setLakiranjeCena] = useState(1.1);   // USLUGE lakiranje €/kg

    const [trCena, setTrCena] = useState(0.35);
    const [pakovanje, setPakovanje] = useState('U bunt ide 200 kom');
    const [napomena, setNapomena] = useState('');
    const [sourceLink, setSourceLink] = useState(null);
    const [editId, setEditId] = useState(null); // id učitane kalkulacije (null = nova)
    // Zastavica: kad korisnik otvori sačuvanu kalkulaciju, template prefill NE sme da je pregazi.
    // (edit-efekat obriše editKalkulacija pre template-efekta, pa ne može preko localStorage-a.)
    const editLoaded = useRef(false);

    // Učitaj postojeću kalkulaciju iz liste (App stavi u localStorage['editKalkulacija'])
    useEffect(() => {
        const raw = localStorage.getItem('editKalkulacija');
        if (!raw) return;
        try {
            const kal = JSON.parse(raw);
            if ((kal.tip || '').toLowerCase() !== 'kesa') return; // samo kese ovde
            editLoaded.current = true;
            localStorage.removeItem('maropack_pending_template_calculation'); // ne dozvoli hijack
            // Kolona `id` je INTEGER — pseudo-id iz templejta ("KAL-TPL-...") ne sme u update.
            // Samo ceo broj kal.id → editId; string pseudo-id → NULL, pa prva izmena ide kao NOVA.
            const toIntId = (x) => { const n = Number(x); return Number.isInteger(n) && n > 0 ? n : null; };
            const realId = toIntId(kal?.id);
            if (realId) setEditId(realId);
            if (kal.naziv) setNaziv(kal.naziv);
            if (kal.kupac) setKupac(kal.kupac);
            if (kal.oznaka_upita != null) setOznakaUpita(kal.oznaka_upita);
            if (kal.kolicina !== undefined) setKolicina(Number(kal.kolicina) || 0);
            if (kal.skart !== undefined) setSkart(Number(kal.skart));
            if (kal.marza !== undefined) setMarza(Number(kal.marza));
            if (kal.setup_masina !== undefined) setSetupMasina(Number(kal.setup_masina) || 0);
            if (kal.sirina !== undefined) setSirina(Number(kal.sirina) || 0);
            if (kal.duzina !== undefined) setDuzina(Number(kal.duzina) || 0);
            if (kal.klapna !== undefined) setKlapna(Number(kal.klapna));
            if (kal.falta !== undefined) setFalta(Number(kal.falta));
            if (kal.orijentacija) setOrijentacija(String(kal.orijentacija).toLowerCase().includes('du') ? 'duzina' : 'sirina');
            if (kal.napomena) setNapomena(kal.napomena);
            if (Array.isArray(kal.materijali) && kal.materijali.length) {
                setMaterijali(kal.materijali.map(m => ({
                    ...m,
                    debljina: Number(m.debljina) || m.debljina,
                    gm2: m.gm2 ?? m.tezina ?? m.gsm,
                    cena: Number(m.cena) || m.cena,
                })));
            }
            if (kal.eurozumba || kal.duplofan || kal.anleger || kal.perforacija || kal.utor) {
                setOpts(o => ({ ...o, eurozumba: !!kal.eurozumba, duplofan: !!kal.duplofan, anleger: !!kal.anleger, perforacija: !!kal.perforacija, utor: !!kal.utor }));
            }
            // Vrati SVE opcije i njihove (izmenjene) cene iz snapshot-a ulaza.
            let _rez = kal.rezultati;
            if (typeof _rez === 'string') { try { _rez = JSON.parse(_rez); } catch (e) { _rez = null; } }
            const _ul = _rez && _rez._ulaz;
            if (_ul) {
                if (_ul.opts) setOpts(_ul.opts);
                const c = _ul.cene || {};
                const S = (setter, v) => { if (v !== undefined && v !== null) setter(Number(v)); };
                const T = (setter, v) => { if (v !== undefined && v !== null) setter(v); };
                S(setDupCena, c.dupCena); S(setEzCena, c.ezCena); S(setOzCena, c.ozCena); S(setKkCena, c.kkCena);
                S(setAnCena, c.anCena); S(setStCena, c.stCena); S(setKvCena, c.kvCena); S(setPpvCena, c.ppvCena);
                S(setFdCena, c.fdCena); S(setVdCena, c.vdCena); S(setOdCena, c.odCena); S(setBuCena, c.buCena);
                S(setAdhCena, c.adhCena); S(setAdhOds, c.adhOds); S(setOjCena, c.ojCena); S(setOjSir, c.ojSir); S(setOjDeb, c.ojDeb);
                S(setKlCena, c.klCena); S(setKlBr, c.klBr); S(setPvCena, c.pvCena);
                S(setUtorCena, c.utorCena); S(setPotkCena, c.potkCena); S(setPperfCena, c.pperfCena); S(setPhranaCena, c.phranaCena);
                S(setTrCena, c.trCena);
                S(setKasCena, c.kasCena); S(setLakKesaCena, c.lakKesaCena); S(setLakKesaProlazi, c.lakKesaProlazi);
                S(setLakiranjeCena, c.lakiranjeCena);
                if (Array.isArray(_ul.lepak) && _ul.lepak.length) setLepak(_ul.lepak);
                if (_ul.lak && typeof _ul.lak === 'object') setLak(_ul.lak);
                // AUTORITATIVNO vrati SVA ostala polja — ništa ne sme na default
                const p = _ul.polja || {};
                T(setMod, p.mod); T(setNaziv, p.naziv); T(setKupac, p.kupac); T(setOznakaUpita, p.oznakaUpita);
                S(setKolicina, p.kolicina); S(setSkart, p.skart); S(setMarza, p.marza); S(setSetupMasina, p.setupMasina);
                T(setDatumIsp, p.datumIsp); S(setZeljCena, p.zeljCena);
                S(setSirina, p.sirina); S(setDuzina, p.duzina); S(setKlapna, p.klapna); S(setFalta, p.falta);
                if (p.orijentacija) setOrijentacija(String(p.orijentacija).toLowerCase().includes('du') ? 'duzina' : 'sirina');
                S(setTakta, p.takta); S(setBan, p.ban); T(setTolerancija, p.tolerancija); T(setGrafika, p.grafika);
                T(setPakovanje, p.pakovanje); T(setNapomena, p.napomena);
                const pr = _ul.params || {};
                T(setDupTip, pr.dupTip); T(setDupPoz, pr.dupPoz); T(setEzVel, pr.ezVel); S(setEzDist, pr.ezDist);
                S(setOzD, pr.ozD); T(setOzPoz, pr.ozPoz); T(setAnTip, pr.anTip);
                T(setStTip, pr.stTip); T(setStPov, pr.stPov); T(setStMotiv, pr.stMotiv); T(setStPoz, pr.stPoz);
                if (Array.isArray(_ul.materijali) && _ul.materijali.length) setMaterijali(_ul.materijali);
            }
            localStorage.removeItem('editKalkulacija');
        } catch (e) { /* ignore */ }
    }, []);

    // ✅ V26: Template → Kalkulacija realno mapiranje za kese.
    // Više ne otvara default OPP ako template ima druge slojeve/opcije.
    useEffect(() => {
        if (editLoaded.current) return; // otvorena je sačuvana kalkulacija → ne diraj je template-om
        const tpl = readPendingTemplateCalculation('kesa');
        if (!tpl) return;
        try {
            const rawMeta = JSON.parse(localStorage.getItem('maropack_pending_template_calculation') || '{}');
            setSourceLink({ product_master_id: rawMeta.product_master_id || tpl.product_master_id || null, template_id: rawMeta.template_id || rawMeta.source_template_id || null, product_template_id: rawMeta.product_template_id || rawMeta.source_template_id || null, template_version: rawMeta.template_version || tpl.template_version || 'V25', template_locked: !!rawMeta.template_locked || !!tpl.template_locked, operacije: rawMeta.operacije || [] });
        } catch { }
        const k = tpl.kesa || {};
        setNaziv(tpl.naziv || k.naziv || '');
        setKupac(tpl.kupac || '');
        setKolicina(Number(k.kolicina || 0));
        setSkart(Number(k.skart || 10));
        setMarza(Number(k.marza || 30));
        setSetupMasina(Number(k.setup_masina || k.setupMasina || 0));
        setDatumIsp(k.datum || '');
        setSirina(Number(k.sirina || 0));
        setDuzina(Number(k.duzina || 0));
        setKlapna(Number(k.klapna || 0));
        setFalta(Number(k.falta || 0));
        if (k.orijentacija) setOrijentacija(String(k.orijentacija).toLowerCase().includes('du') ? 'duzina' : 'sirina');
        setTakta(Number(k.takt || 0));
        setBan(Number(k.ban || 1));
        setTolerancija(k.tolerancija || '±10%');
        setGrafika(k.grafika || 'Novi posao');
        setMaterijali(((k.layers || tpl.materijali_struktura || tpl.mats || [])).map(mapTemplateLayerToKesaMaterial).filter(m => m.tip));
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

        // DUPLO PLATNO (prednji + zadnji zid), ISTO kao nalog/metraža:
        //   po širini: uz traku = 2×dužina + klapna + 2×falta ; popreko = širina
        //   po dužini: uz traku = 2×širina                      ; popreko = dužina + klapna + falta
        //   Površina po kesi = (uz traku) × (popreko).  FALTA ×2, KLAPNA ×1.
        const korakK = orijentacija === 'duzina' ? (2 * sirina) : (2 * duzina + klapna + 2 * falta);
        const poprecnoMm = orijentacija === 'duzina' ? (duzina + klapna + falta) : sirina;
        const povrsinaM2PoKesi = (korakK * poprecnoMm) / 1000000; // m² materijala po kesi
        const tezKg1000 = povrsinaM2PoKesi * ukTezGm2;            // g po kesi = kg na 1000 kom
        const tezJedneG = tezKg1000;

        const kgSaSkartom = tezKg1000 * (1 + skart / 100);
        const cenaMatKom = kgSaSkartom * avgCenaKg;

        const ik = poprecnoMm; // idealna širina rolne (popreko kese = jedan ban)

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
            (opts.varDno ? vdCena : 0) +
            (opts.utor ? utorCena : 0) +
            (opts.perfOtk ? potkCena : 0) +
            (opts.poprecnaPerf ? pperfCena : 0) +
            (opts.pakHrana ? phranaCena : 0);

        const trTr = trCena * tezKg1000;

        // KAŠIRANJE (spajanje slojeva) + LAK — kao kod folije. Broj prolaza kaширanja = slojevi − 1
        // (duplex=1, triplex=2, kvadriplex=3). Površina po 1000 kom u m².
        const m2Po1000 = povrsinaM2PoKesi * 1000;
        const kasProlazi = Math.max(0, matBr - 1);
        // Kaширanje (usluga, €/m²) — kao pre: cena × površina/1000kom × prolazi
        const kasTr = kasCena * m2Po1000 * kasProlazi;
        // LEPAK 1/2/3 + LAK (kg-model, isto kao folija) — kg po 1000 kom
        let lepakKg = 0, lepakTrosak = 0;
        lepak.forEach((lep) => {
            const autoUtrosak = m2Po1000 * (Number(lep.potrosnja) || 0);
            const utrosak = (lep.utrosak !== '' && lep.utrosak != null) ? (Number(lep.utrosak) || 0) : autoUtrosak;
            const prolazi = Number(lep.prolazi) || 0;
            const cena = Number(lep.cena) || 0;
            lepakKg += utrosak * prolazi;
            lepakTrosak += utrosak * prolazi * cena;
        });
        const lakAutoUtrosak = m2Po1000 * (Number(lak.potrosnja) || 0);
        const lakUtrosak = (lak.utrosak !== '' && lak.utrosak != null) ? (Number(lak.utrosak) || 0) : lakAutoUtrosak;
        const lakProlaziKg = Number(lak.prolazi) || 0;
        const lakKg = lakUtrosak * lakProlaziKg;
        lepakKg += lakKg;
        lepakTrosak += lakUtrosak * lakProlaziKg * (Number(lak.cena) || 0);
        // Lakiranje (usluga, €/kg) — kg iz lakiranih slojeva
        const lakiranjeKg = materijali.reduce((acc, m) => acc + (m.lakira ? (m2Po1000 * (Number(m.tezina) || 0) / 1000) : 0), 0);
        const lakTr = lakiranjeKg * (Number(lakiranjeCena) || 0);

        // Trošak podešavanja mašine: FIKSNO €/1000 kom. NE ulazi u maржu — dodaje se posle.
        // UKUPAN jednokratni iznos za ceo nalog; deli se na količinu → po 1000 kom.
        const setupUkupno = Number(setupMasina) || 0;
        const setupPer1000 = kolicina > 0 ? (setupUkupno * 1000 / kolicina) : 0;
        const osnovna = cenaMatKom + stmTr + adhTr + ostaleOpcije + kliseTr + trTr + ojTr + kasTr + lepakTrosak + lakTr;
        const konacna = osnovna * (1 + marza / 100) + setupPer1000;

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
            kasiranje: kasTr,
            lakiranje: lakTr,
            lepakKg,
            lepakTrosak,
            lakiranjeKg,
            lakKg,
            kasProlazi,
            setup1000: setupPer1000,
            setupUkupno,
            osnovna,
            saSkartom: cenaMatKom * (1 + skart / 100) + stmTr + adhTr + ostaleOpcije + kliseTr + trTr + ojTr + kasTr + lepakTrosak + lakTr,
            konacna,
            vrednostOsn,
            vrednostKon,
            tezJedne: tezJedneG,
            ukKg,
            perKom,
            idealnaS: ik,
            izrMarza
        });
    }, [sirina, duzina, klapna, falta, orijentacija, kolicina, skart, marza, setupMasina, materijali, opts,
        dupCena, ezCena, ozCena, anCena, stCena, buCena, adhOds, adhCena,
        ojSir, ojDeb, ojCena, klBr, klCena, kvCena, pvCena, kkCena, ppvCena,
        odCena, fdCena, vdCena, utorCena, potkCena, pperfCena, phranaCena, trCena, zeljCena,
        kasCena, lakKesaCena, lakKesaProlazi, lepak, lak, lakiranjeCena]);

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

    // ===================== RENDER =====================

    // ===================== SAČUVAJ KALKULACIJU =====================
    async function sacuvajKalkulaciju(mode = 'new') {
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
                oznaka_upita: oznakaUpita,
                kesa: {
                    naziv,
                    kolicina,
                    skart,
                    marza,
                    setup_masina: Number(setupMasina) || 0,
                    sirina,
                    duzina,
                    klapna,
                    falta,
                    orijentacija,
                    layers: materijali,
                    options: opts,
                    pakovanje: napomena || ''
                },
                materijali,
                materijali_struktura,
                rezultati: rez,
                source_chain: 'template → kalkulacija → ponuda → nalog',
                product_master_id: sourceLink?.product_master_id || null,
                template_id: sourceLink?.template_id || null,
                product_template_id: sourceLink?.product_template_id || null,
                template_version: sourceLink?.template_version || null,
                template_locked: !!sourceLink?.template_locked,
                operacije: sourceLink?.operacije || [],
                created_at: new Date().toISOString()
            }));
            const zapis = {
                // Osnovni podaci
                naziv,
                kupac,
                oznaka_upita: oznakaUpita,
                kolicina: Number(kolicina),
                skart: Number(skart),
                marza: Number(marza),

                // Dimenzije
                sirina: Number(sirina),
                duzina: Number(duzina),
                klapna: Number(klapna),
                falta: Number(falta),
                orijentacija,

                // Materijal (spojeni tipovi)
                materijali_struktura,
                materijal: materijali.map(m => m.vrsta || m.tip).join(' + '),
                debljina: materijali[0] ? Number(materijali[0].debljina) : 0,
                tezina_gm2: avgTezina,
                cena_kg: avgCena,

                // Cene i troškovi
                cena_stampa: opts.stampa ? Number(stCena) : 0,
                transport: Number(trCena),

                // Rezultati + SNAPSHOT ulaza (opcije i sve njihove cene) — da se vrate pri otvaranju
                rezultati: {
                    ...rez,
                    // Polja koja Lista kalkulacija čita za prikaz (ukupan nalog + €/kg) —
                    // bez njih je lista padala na pogrešan rezervni račun (×1000) ili prikazivala 0.
                    kolicina: Number(kolicina) || 0,
                    konacnaCena: rez.konacna || 0,          // €/1000 kom (sa maржom)
                    osnovnaCena: rez.osnovna || 0,          // €/1000 kom (osnovna)
                    ukupnoNalog: rez.vrednostKon || 0,      // ukupno za ceo nalog (sa maржom)
                    ukupnoOsnovno: rez.vrednostOsn || 0,    // ukupno za ceo nalog (osnovna)
                    cenaPoKgSaMarza: (rez.tezJedne > 0 ? (rez.konacna / rez.tezJedne) : 0),
                    cenaPoKgOsnovna: (rez.tezJedne > 0 ? (rez.osnovna / rez.tezJedne) : 0),
                    _ulaz: {
                        opts,
                        cene: {
                            dupCena, ezCena, ozCena, kkCena, anCena, stCena, kvCena, ppvCena,
                            fdCena, vdCena, odCena, buCena, adhCena, adhOds, ojCena, ojSir, ojDeb,
                            klCena, klBr, pvCena, utorCena, potkCena, pperfCena, phranaCena, trCena,
                            kasCena, lakKesaCena, lakKesaProlazi, lakiranjeCena
                        },
                        // SVA ostala polja — da se NIŠTA ne vrati na default pri ponovnom otvaranju
                        polja: {
                            mod, naziv, kupac, oznakaUpita, kolicina, skart, marza, setupMasina,
                            datumIsp, zeljCena, sirina, duzina, klapna, falta, orijentacija, takta, ban,
                            tolerancija, grafika, pakovanje, napomena
                        },
                        params: { dupTip, dupPoz, ezVel, ezDist, ozD, ozPoz, anTip, stTip, stPov, stMotiv, stPoz },
                        materijali, lepak, lak
                    }
                },
                osnovna_cena: rez.osnovna || 0,
                konacna_cena: rez.konacna || 0,

                // Opcije
                materijali: materijali,
                eurozumba: opts.eurozumba || false,
                duplofan: opts.duplofan || false,
                anleger: opts.anleger || false,
                perforacija: opts.perforacija || false,
                utor: opts.utor || false,
                stampanje: opts.stampa ? stTip : 'Bez štampe',

                // Meta
                napomena,
                created_by: user?.id
            };
            let error, savedId = editId;
            if (mode === 'update' && editId) {
                ({ error } = await supabase.from('kalkulacije_kese').update(zapis).eq('id', editId));
            } else {
                const r = await supabase.from('kalkulacije_kese').insert([zapis]).select('id').single();
                error = r.error; savedId = r.data?.id || null;
                if (savedId) setEditId(savedId);
            }

            if (error) throw error;

            alert(mode === 'update' ? '✅ Izmene sačuvane!' : '✅ Nova kalkulacija sačuvana!');
        } catch (err) {
            console.error('Greška:', err);
            alert('❌ Greška pri čuvanju: ' + err.message);
        }
    }

    // ===================== SAČUVAJ KAO TEMPLEJT (kalkulacija → templejt) =====================
    function sacuvajKaoTemplejt() {
        try {
            const form = {
                type: 'kesa',
                naziv, kupac,
                product_master_id: sourceLink?.product_master_id || null,
                template_id: sourceLink?.template_id || sourceLink?.product_template_id || null,
                template_version: sourceLink?.template_version || 'V1',
                kesa: {
                    naziv,
                    kolicina: String(kolicina || ''),
                    skart: String(skart ?? ''),
                    marza: String(marza ?? ''),
                    sirina: String(sirina || ''),
                    duzina: String(duzina || ''),
                    klapna: String(klapna ?? ''),
                    falta: String(falta ?? ''),
                    orijentacija: orijentacija || 'sirina',
                    takt: String(takta ?? ''),
                    ban: String(ban ?? ''),
                    tolerancija: tolerancija || '±10%',
                    grafika: grafika || 'Novi posao',
                    layers: (materijali || []).map(m => ({
                        material: m.tip || m.vrsta || 'OPP',
                        debljina: String(m.debljina ?? ''),
                        tezina: String(m.tezina ?? ''),
                        cena: String(m.cena ?? '')
                    })),
                    options: opts || {},
                    transportKg: String(trCena ?? ''),
                    pakovanje: pakovanje || '',
                    setupMasina: String(setupMasina ?? ''),
                    datum: datumIsp || ''
                }
            };
            localStorage.setItem('maropack_pending_template_edit', JSON.stringify({ template: form, product_id: sourceLink?.product_master_id || null, fromCalc: true }));
            if (typeof setPage === 'function') { setPage('template_engine'); }
            else { alert('✅ Podaci su spremljeni za templejt. Otvori tab „Templejt" — automatski će se učitati.'); }
        } catch (err) {
            console.error('Greška (templejt):', err);
            alert('❌ Greška pri slanju u templejt: ' + err.message);
        }
    }

    return (
        <div style={s.wrap}>
            <AIPomoc ekran="Kalkulacija kese" kontekst={() => ({ naziv, kupac, oznaka_upita: oznakaUpita, sirina, duzina, klapna, falta, orijentacija, kolicina, skart, marza, materijali, rezultat: rez })} />
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
                            <div style={{ marginBottom: 10 }}>
                                <label style={{ fontSize: 11, fontWeight: 800, color: '#b45309', display: 'block', marginBottom: 4 }}>🔖 Broj / oznaka upita</label>
                                <input type="text" value={oznakaUpita} onChange={e => setOznakaUpita(e.target.value)} placeholder="npr. UP-2026-014" style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #f59e0b', borderRadius: 6, fontSize: 13, fontWeight: 700, background: '#fffbeb' }} />
                            </div>
                            <div style={s.grid3}>
                                <Field label="Naziv kese" value={naziv} onChange={setNaziv} />
                                <Field label="Kupac" value={kupac} onChange={setKupac} />
                                <Field label="Količina (kom)" value={kolicina} onChange={setKolicina} type="number" />
                                <Field label="Škart (%)" value={skart} onChange={setSkart} type="number" />
                                <Field label="Datum isporuke" value={datumIsp} onChange={setDatumIsp} type="date" />
                                <div>
                                    <label style={s.label}>Trošak podešavanja mašine (€ ukupno, jednokratno)</label>
                                    <input style={s.input} type="number" value={setupMasina} onChange={(e) => setSetupMasina(parseFloat(e.target.value) || 0)} />
                                    <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, marginTop: '3px' }}>
                                        {kolicina > 0
                                            ? `podeljeno na ${Number(kolicina).toLocaleString('sr-RS')} kom = ${(rez.setup1000 || 0).toFixed(3)} €/1000 kom`
                                            : 'unesi količinu da se podeli po 1000 kom'}
                                    </div>
                                </div>
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
                                <Sel label="Orijentacija na materijalu" value={orijentacija} onChange={setOrijentacija}>
                                    <option value="sirina">Po širini (dužina ×2)</option>
                                    <option value="duzina">Po dužini (širina ×2)</option>
                                </Sel>
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

                        {/* LEPAK I LAK — kg-model, isto kao kod folije (po 1000 kom) */}
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, marginBottom: 12 }}>
                            <h3 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: 0, marginBottom: 4, textTransform: 'uppercase' }}>🧪 LEPAK I LAK</h3>
                            <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
                                Slojeva (auto): <b>{materijali.filter(m => Number(m.tezina) > 0).length}</b> · prolaza kaширanja = slojevi − 1. Auto utrošak = površina/1000 kom ({((sirina + klapna) / 1000 * (duzina + falta) / 1000 * 1000).toFixed(2)} m²) × potrošnja (kg/m²).
                            </div>
                            <div style={{ overflowX: 'auto', border: '1px solid #dbe3ef', borderRadius: 14 }}>
                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 820, fontSize: 13 }}>
                                    <thead>
                                        <tr>
                                            {['Tip', 'Potrošnja kg/m²', 'Utrošak kg/1000kom', 'Prolazi', 'Cena €/kg', 'Ukupno kg/1000kom'].map((h, i) => (
                                                <th key={i} style={{ textAlign: 'left', padding: '10px 12px', background: '#f8fafc', color: '#64748b', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lepak.map((lep, idx) => {
                                            const m2k = (sirina + klapna) / 1000 * (duzina + falta) / 1000 * 1000;
                                            const auto = m2k * (Number(lep.potrosnja) || 0);
                                            const kg = ((lep.utrosak !== '' && lep.utrosak != null) ? (Number(lep.utrosak) || 0) : auto) * (Number(lep.prolazi) || 0);
                                            return (
                                                <tr key={idx}>
                                                    <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf2f7', fontWeight: 900, color: '#1e40af' }}>LEPAK {idx + 1}</td>
                                                    <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf2f7' }}><input type="number" step="0.0001" value={lep.potrosnja} onChange={e => { const n = [...lepak]; n[idx] = { ...n[idx], potrosnja: parseFloat(e.target.value) || 0 }; setLepak(n); }} placeholder="0.002" style={{ width: '100%', height: 38, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                                    <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf2f7' }}><input type="number" step="0.001" value={lep.utrosak ?? ''} onChange={e => { const n = [...lepak]; n[idx] = { ...n[idx], utrosak: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0) }; setLepak(n); }} placeholder={auto.toFixed(3)} style={{ width: '100%', height: 38, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                                    <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf2f7' }}><input type="number" step="1" value={lep.prolazi} onChange={e => { const n = [...lepak]; n[idx] = { ...n[idx], prolazi: parseFloat(e.target.value) || 0 }; setLepak(n); }} placeholder="0" style={{ width: '100%', height: 38, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                                    <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf2f7' }}><input type="number" step="0.01" value={lep.cena} onChange={e => { const n = [...lepak]; n[idx] = { ...n[idx], cena: parseFloat(e.target.value) || 0 }; setLepak(n); }} placeholder="6" style={{ width: '100%', height: 38, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                                    <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf2f7', fontWeight: 900, color: '#059669' }}>{kg.toFixed(3)} kg</td>
                                                </tr>
                                            );
                                        })}
                                        {/* LAK */}
                                        <tr>
                                            <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf2f7', fontWeight: 900, color: '#047857' }}>LAK</td>
                                            <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf2f7' }}><input type="number" step="0.0001" value={lak.potrosnja} onChange={e => setLak({ ...lak, potrosnja: parseFloat(e.target.value) || 0 })} placeholder="0.0012" style={{ width: '100%', height: 38, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                            <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf2f7' }}><input type="number" step="0.001" value={lak.utrosak ?? ''} onChange={e => setLak({ ...lak, utrosak: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0) })} placeholder={(((sirina + klapna) / 1000 * (duzina + falta) / 1000 * 1000) * (Number(lak.potrosnja) || 0)).toFixed(3)} style={{ width: '100%', height: 38, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                            <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf2f7' }}><input type="number" step="1" value={lak.prolazi} onChange={e => setLak({ ...lak, prolazi: parseFloat(e.target.value) || 0 })} placeholder="0" style={{ width: '100%', height: 38, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                            <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf2f7' }}><input type="number" step="0.01" value={lak.cena} onChange={e => setLak({ ...lak, cena: parseFloat(e.target.value) || 0 })} placeholder="7.05" style={{ width: '100%', height: 38, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                            <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf2f7', fontWeight: 900, color: '#059669' }}>{(((lak.utrosak !== '' && lak.utrosak != null) ? (Number(lak.utrosak) || 0) : (((sirina + klapna) / 1000 * (duzina + falta) / 1000 * 1000) * (Number(lak.potrosnja) || 0))) * (Number(lak.prolazi) || 0)).toFixed(3)} kg</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* USLUGE — kaширanje (€/m²) i lakiranje (€/kg), isto kao kod folije. Štampa i transport ostaju u svojim postojećim sekcijama. */}
                        <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                            <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0d9488', marginBottom: 12, textTransform: 'uppercase' }}>⚙️ USLUGE</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                                <div>
                                    <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 3 }}>Kaширanje prolazi <b style={{ background: '#fef3c7', padding: '1px 4px', borderRadius: 3, fontSize: 9, color: '#92400e' }}>AUTO</b></label>
                                    <input type="number" value={rez.kasProlazi || 0} readOnly style={{ width: '100%', padding: '4px 6px', background: '#fef3c7', color: '#92400e', fontWeight: 700, border: '1px solid #fbbf24', borderRadius: 4, fontSize: 11, marginBottom: 6, boxSizing: 'border-box' }} />
                                    <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 3 }}>Cena (€/m²)</label>
                                    <input type="number" step="0.001" value={kasCena} onChange={e => setKasCena(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }} />
                                    <div style={{ fontSize: 10.5, color: '#0d9488', fontWeight: 700, marginTop: 4 }}>= {(rez.kasiranje || 0).toFixed(2)} € / 1000 kom</div>
                                </div>
                                <div>
                                    <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 3 }}>Lakiranje kg <b style={{ background: '#fef3c7', padding: '1px 4px', borderRadius: 3, fontSize: 9, color: '#92400e' }}>AUTO</b></label>
                                    <input type="number" value={(rez.lakiranjeKg || 0).toFixed(3)} readOnly style={{ width: '100%', padding: '4px 6px', background: '#fef3c7', color: '#92400e', fontWeight: 700, border: '1px solid #fbbf24', borderRadius: 4, fontSize: 11, marginBottom: 6, boxSizing: 'border-box' }} />
                                    <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 3 }}>Cena (€/kg)</label>
                                    <input type="number" step="0.01" value={lakiranjeCena} onChange={e => setLakiranjeCena(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }} />
                                    <div style={{ fontSize: 10.5, color: '#0d9488', fontWeight: 700, marginTop: 4 }}>= {(rez.lakiranje || 0).toFixed(2)} € / 1000 kom · lakiranje se uključuje čekiranjem "Lak" na sloju materijala</div>
                                </div>
                            </div>
                        </div>

                        {/* OPCIJE */}
                        <div style={s.sec}>
                            <div style={s.secT}>⚙️ Tehničke opcije kese</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px' }}>
                                <Opt label="Duplofan traka" active={opts.duplofan} onToggle={() => toggle('duplofan')} cena={dupCena} setCena={setDupCena} />
                                <Opt label="Eurozumba" active={opts.eurozumba} onToggle={() => toggle('eurozumba')} cena={ezCena} setCena={setEzCena} />
                                <Opt label="Okrugla zumba" active={opts.okruglaZumba} onToggle={() => toggle('okruglaZumba')} cena={ozCena} setCena={setOzCena} />
                                <Opt label="Ukošena klapna" active={opts.kosaKlapna} onToggle={() => toggle('kosaKlapna')} cena={kkCena} setCena={setKkCena} />
                                <Opt label="Anleger" active={opts.anleger} onToggle={() => toggle('anleger')} cena={anCena} setCena={setAnCena} />
                                <Opt label="Utor" active={opts.utor} onToggle={() => toggle('utor')} cena={utorCena} setCena={setUtorCena} />
                                <Opt label="Štampa" active={opts.stampa} onToggle={() => toggle('stampa')} cena={stCena} setCena={setStCena} />
                                <Opt label="Perf. otkidanje" active={opts.perfOtk} onToggle={() => toggle('perfOtk')} cena={potkCena} setCena={setPotkCena} />
                                <Opt label="Poprečna perf." active={opts.poprecnaPerf} onToggle={() => toggle('poprecnaPerf')} cena={pperfCena} setCena={setPperfCena} />
                                <Opt label="Kontinentalni var" active={opts.kontVar} onToggle={() => toggle('kontVar')} cena={kvCena} setCena={setKvCena} />
                                <Opt label="Poprečni var" active={opts.poprecniVar} onToggle={() => toggle('poprecniVar')} cena={ppvCena} setCena={setPpvCena} />
                                <Opt label="Falta na dnu" active={opts.faltaDno} onToggle={() => toggle('faltaDno')} cena={fdCena} setCena={setFdCena} />
                                <Opt label="Var na dnu" active={opts.varDno} onToggle={() => toggle('varDno')} cena={vdCena} setCena={setVdCena} />
                                <Opt label="Otvor na dnu" active={opts.otvorDno} onToggle={() => toggle('otvorDno')} cena={odCena} setCena={setOdCena} />
                                <Opt label="Pakovanje za hranu" active={opts.pakHrana} onToggle={() => toggle('pakHrana')} cena={phranaCena} setCena={setPhranaCena} />
                                <Opt label="Bušenje rupe" active={opts.busenje} onToggle={() => toggle('busenje')} cena={buCena} setCena={setBuCena} />
                                <Opt label="ADH traka" active={opts.adhTraka} onToggle={() => toggle('adhTraka')} cena={adhCena} setCena={setAdhCena} />
                                <Opt label="Ojačanje" active={opts.ojacanje} onToggle={() => toggle('ojacanje')} cena={ojCena} setCena={setOjCena} />
                                <Opt label="Trošak klišea" active={opts.klise} onToggle={() => toggle('klise')} cena={klCena} setCena={setKlCena} />
                                <Opt label="Perf. vrućim iglama" active={opts.perfVrucim} onToggle={() => toggle('perfVrucim')} cena={pvCena} setCena={setPvCena} />
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

                        {/* MARŽA — zasebna, jasna ćelija (kao kod folije) */}
                        {mod === 'normal' && (
                            <div style={s.sec}>
                                <div style={s.secT}>💰 Marža</div>
                                <div style={{ maxWidth: 220 }}>
                                    <Field label="Marža (%)" value={marza} onChange={setMarza} type="number" />
                                </div>
                            </div>
                        )}

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
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>Kliše (raspoređen)</span>
                                <span style={{ fontSize: '13px', fontWeight: 800 }}>{f2(rez.klise)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>Kaширanje (usluga)</span>
                                <span style={{ fontSize: '13px', fontWeight: 800 }}>{f2(rez.kasiranje)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>Lepak (kg)</span>
                                <span style={{ fontSize: '13px', fontWeight: 800 }}>{f2(rez.lepakTrosak)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>Lakiranje (usluga)</span>
                                <span style={{ fontSize: '13px', fontWeight: 800 }}>{f2(rez.lakiranje)}</span>
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

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, marginBottom: 6 }}>
                            {editId && (
                                <button onClick={() => sacuvajKalkulaciju('update')} style={{ flex: 1, minWidth: 150, padding: '11px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', border: 'none', borderRadius: '9px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)' }}>
                                    💾 Sačuvaj izmene
                                </button>
                            )}
                            <button onClick={() => sacuvajKalkulaciju('new')} style={{ flex: 1, minWidth: 150, padding: '11px', background: editId ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', border: 'none', borderRadius: '9px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)' }}>
                                {editId ? '🆕 Sačuvaj kao NOVU' : '💾 Sačuvaj kalkulaciju'}
                            </button>
                        </div>

                        <button onClick={() => setCurrentTab('nalog')} style={{ width: '100%', padding: '11px', background: '#059669', color: 'white', border: 'none', borderRadius: '9px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', marginTop: '4px' }}>📋 Kreiraj nalog →</button>
                        <button onClick={sacuvajKaoTemplejt} title="Prebaci ove podatke u Templejt (Product Template Engine)" style={{ width: '100%', padding: '11px', background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: 'white', border: 'none', borderRadius: '9px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', marginTop: '6px' }}>📋 Sačuvaj kao templejt</button>
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
