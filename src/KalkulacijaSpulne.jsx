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

export default function KalkulacijaSpulne() {
    const [currentTab, setCurrentTab] = useState('kalk');
    const [mode, setMode] = useState('normal'); // normal | reverse
    const [targetCena1000, setTargetCena1000] = useState(95);

    // AUTH
    const { user } = useAuth();

    // Osnovni podaci
    const [naziv, setNaziv] = useState('');
    const [kupac, setKupac] = useState('');
    const [oznakaUpita, setOznakaUpita] = useState(''); // broj/oznaka upita — za pretragu u listi i AI
    const [brPorudzbine, setBrPorudzbine] = useState('');
    const [datumPorudzbine, setDatumPorudzbine] = useState('');
    const [datumIsporuke, setDatumIsporuke] = useState('');
    const [sourceLink, setSourceLink] = useState(null);
    const [editId, setEditId] = useState(null); // id učitane kalkulacije (null = nova)
    // Zastavica: otvorena sačuvana kalkulacija ima prioritet nad template prefill-om.
    const editLoaded = useRef(false);

    // Učitaj postojeću kalkulaciju iz liste (App stavi u localStorage['editKalkulacija'])
    useEffect(() => {
        const raw = localStorage.getItem('editKalkulacija');
        if (!raw) return;
        try {
            const kal = JSON.parse(raw);
            if ((kal.tip || '').toLowerCase() !== 'spulna') return; // samo špulne ovde
            editLoaded.current = true;
            localStorage.removeItem('maropack_pending_template_calculation'); // ne dozvoli hijack
            if (kal.id) setEditId(kal.id);
            if (kal.naziv) setNaziv(kal.naziv);
            if (kal.kupac) setKupac(kal.kupac);
            if (kal.oznaka_upita != null) setOznakaUpita(kal.oznaka_upita);
            if (kal.materijal) setMaterijal(kal.materijal);
            if (kal.tezina_gm2 !== undefined) setTezinaGM2(Number(kal.tezina_gm2) || 0);
            if (kal.cena_kg !== undefined) setCenaM2(Number(kal.cena_kg) || 0);
            if (kal.marza !== undefined) setMarza(Number(kal.marza));
            if (kal.kolicina !== undefined) setKolicina(Number(kal.kolicina) || 0);
            if (kal.sirina !== undefined) setSirina(Number(kal.sirina) || 0);
            if (kal.duzina !== undefined) setDuzina(Number(kal.duzina) || 0);
            if (kal.skart !== undefined) setSkart(Number(kal.skart));
            if (kal.napomena !== undefined) setNapomena(kal.napomena || '');

            // AUTORITATIVNA obnova iz snapshot-a (rezultati._ulaz) — vraća TAČNO ono što je sačuvano,
            // uključujući troškove, kutiju, hilznu, transport, kaширanje i lak koji nemaju svoje kolone.
            const u = kal.rezultati && kal.rezultati._ulaz;
            if (u && typeof u === 'object') {
                if (u.naziv !== undefined) setNaziv(u.naziv || '');
                if (u.kupac !== undefined) setKupac(u.kupac || '');
                if (u.oznakaUpita !== undefined) setOznakaUpita(u.oznakaUpita || '');
                if (u.brPorudzbine !== undefined) setBrPorudzbine(u.brPorudzbine || '');
                if (u.datumIsporuke !== undefined) setDatumIsporuke(u.datumIsporuke || '');
                if (u.materijal !== undefined) setMaterijal(u.materijal || '');
                if (u.tezinaGM2 !== undefined) setTezinaGM2(Number(u.tezinaGM2) || 0);
                if (u.cenaM2 !== undefined) setCenaM2(Number(u.cenaM2) || 0);
                if (u.troskoviM2 !== undefined) setTroskoviM2(Number(u.troskoviM2) || 0);
                if (u.sirina !== undefined) setSirina(Number(u.sirina) || 0);
                if (u.duzina !== undefined) setDuzina(Number(u.duzina) || 0);
                if (u.cenaKutije !== undefined) setCenaKutije(Number(u.cenaKutije) || 0);
                if (u.cenaHilzne !== undefined) setCenaHilzne(Number(u.cenaHilzne) || 0);
                if (u.transport !== undefined) setTransport(Number(u.transport) || 0);
                if (u.skart !== undefined) setSkart(Number(u.skart) || 0);
                if (u.marza !== undefined) setMarza(Number(u.marza) || 0);
                if (u.kolicina !== undefined) setKolicina(Number(u.kolicina) || 0);
                if (u.napomena !== undefined) setNapomena(u.napomena || '');
                if (u.brSlojeva !== undefined) setBrSlojeva(Number(u.brSlojeva) || 1);
                if (u.kasCena !== undefined) setKasCena(Number(u.kasCena) || 0);
                if (u.lakOn !== undefined) setLakOn(!!u.lakOn);
                if (u.lakCena !== undefined) setLakCena(Number(u.lakCena) || 0);
                if (u.lakProlazi !== undefined) setLakProlazi(Number(u.lakProlazi) || 0);
            }

            localStorage.removeItem('editKalkulacija');
        } catch (e) { /* ignore */ }
    }, []);

    // Materijal
    const [materijal, setMaterijal] = useState('');
    const [tezinaGM2, setTezinaGM2] = useState(0);
    const [cenaM2, setCenaM2] = useState(0);
    const [troskoviM2, setTroskoviM2] = useState(0.05);

    // Dimenzije špulne
    const [sirina, setSirina] = useState(0);  // mm
    const [duzina, setDuzina] = useState(0);  // m

    // Troškovi
    const [cenaKutije, setCenaKutije] = useState(2);
    const [cenaHilzne, setCenaHilzne] = useState(1);
    const [transport, setTransport] = useState(2);
    const [skart, setSkart] = useState(2);

    // Kaширanje i lak (duplex / triplex / kvadriplex špulne)
    const [brSlojeva, setBrSlojeva] = useState(1);      // 1=mono, 2=duplex, 3=triplex, 4=kvadriplex
    const [kasCena, setKasCena] = useState(0.02);       // €/m²
    const [lakOn, setLakOn] = useState(false);
    const [lakCena, setLakCena] = useState(0.02);       // €/m²
    const [lakProlazi, setLakProlazi] = useState(1);

    // Finalno
    const [marza, setMarza] = useState(40);
    const [napomena, setNapomena] = useState('');
    const [kolicina, setKolicina] = useState(0);

    // ✅ V26: Template → Kalkulacija realno mapiranje za špulne.
    useEffect(() => {
        if (editLoaded.current) return; // otvorena je sačuvana kalkulacija → ne diraj je template-om
        const tpl = readPendingTemplateCalculation('spulna');
        if (!tpl) return;
        try {
            const rawMeta = JSON.parse(localStorage.getItem('maropack_pending_template_calculation') || '{}');
            setSourceLink({ product_master_id: rawMeta.product_master_id || tpl.product_master_id || null, template_id: rawMeta.template_id || rawMeta.source_template_id || null, product_template_id: rawMeta.product_template_id || rawMeta.source_template_id || null, template_version: rawMeta.template_version || tpl.template_version || 'V25', template_locked: !!rawMeta.template_locked || !!tpl.template_locked, operacije: rawMeta.operacije || [] });
        } catch {}
        const sp = tpl.spulna || {};
        setNaziv(tpl.naziv || sp.naziv || '');
        setKupac(tpl.kupac || '');
        const layers = Array.isArray(sp.layers) ? sp.layers : (Array.isArray(tpl.materijali_struktura) ? tpl.materijali_struktura : (Array.isArray(tpl.mats) ? tpl.mats : []));
        const matLabel = layers.map(l => [l.vrsta || l.tip || l.materijal || l.material, l.oznaka || l.oznaka_materijala, l.debljina || l.deb].filter(Boolean).join(' ')).filter(Boolean).join(' / ');
        setMaterijal(sp.materijal || matLabel || '');
        setSirina(Number(sp.W || sp.sirina || layers[0]?.sirina || layers[0]?.idealna_sirina || 0));
        setDuzina(Number(sp.maxMetara || sp.duzina || 0));
        setKolicina(Number(sp.kolicina || 1));
        setSkart(Number(sp.skart || 2));
    }, []);

    // Rezultati
    const [rez, setRez] = useState({
        povrsina: 0,
        povrsina1000: 0,
        tezina: 0,
        tezina1000: 0,
        cenaMat1000: 0,
        cenaMatSpulna: 0,
        troskoviSpulna: 0,
        osnovna: 0,
        proizvodna: 0,
        saSkartom: 0,
        saMarza: 0,
        cena1000: 0,
        proizvodna1000: 0,
        ukupno: 0,
        reverseMaxOsnovna: 0,
        reverseMaxCenaM2: 0,
        reverseProfitPoSpulni: 0
    });

    // Kalkulacija špulne — Excel 1:1 logika
    useEffect(() => {
        const widthMm = Number(sirina) || 0;
        const lengthM = Number(duzina) || 0;
        const gm2 = Number(tezinaGM2) || 0;
        const cenaPoM2 = Number(cenaM2) || 0;
        const trosakPoM2 = Number(troskoviM2) || 0;
        const kutija = Number(cenaKutije) || 0;
        const hilzna = Number(cenaHilzne) || 0;
        const transportPoSpulni = Number(transport) || 0;
        const skartPct = Number(skart) || 0;
        const marzaPct = Number(marza) || 0;
        const qty = Number(kolicina) || 0;
        const target1000 = Number(targetCena1000) || 0;

        // Excel: površina = dužina × širina(mm) / 1000
        const povrsina = (lengthM * widthMm) / 1000;
        const povrsina1000 = widthMm; // 1000m × širina(mm) / 1000

        // Excel: kg = g/m² × širina(mm) × metraža / 1.000.000
        const tezina = (gm2 * widthMm * lengthM) / 1000000;
        const tezina1000 = (gm2 * widthMm * 1000) / 1000000;

        // Excel: cena potrošnje materijala na 1000m = širina × cena €/m²
        const cenaMat1000 = (widthMm * 1000 * cenaPoM2) / 1000;
        const cenaMatSpulna = (cenaMat1000 * lengthM) / 1000;

        // Excel: iznos troškova = površina po špulni × trošak €/m²
        const troskoviSpulna = povrsina * trosakPoM2;

        // Kaширanje i lak — cene €/m² × površina po špulni
        const kasProlaziN = Math.max(0, (Number(brSlojeva) || 1) - 1);      // broj prolaza kaширanja = slojevi − 1
        const kasCenaN = Number(kasCena) || 0;
        const lakCenaN = Number(lakCena) || 0;
        const lakProlaziN = Number(lakProlazi) || 0;
        const kasTr = kasCenaN * povrsina * kasProlaziN;
        const lakTr = lakOn ? lakCenaN * povrsina * lakProlaziN : 0;
        const kasLakSpulna = kasTr + lakTr;

        // Excel A15: materijal + kutija + hilzna + troškovi + transport + kaширanje + lak po špulni
        const osnovna = cenaMatSpulna + kutija + hilzna + troskoviSpulna + transportPoSpulni + kasLakSpulna;

        // Excel K15/O15: prvo škart, pa marža
        const proizvodna = osnovna * (1 + skartPct / 100);
        const saSkartom = proizvodna;
        const saMarza = proizvodna * (1 + marzaPct / 100);

        // Excel A21/K21/O21: cena na 1000m
        const cena1000 = lengthM ? (osnovna / lengthM) * 1000 : 0;
        const proizvodna1000 = cena1000 * (1 + skartPct / 100);
        const final1000 = proizvodna1000 * (1 + marzaPct / 100);

        const ukupno = saMarza * qty;

        // Obrnuta kalkulacija: iz ciljane finalne cene /1000m vraćamo maksimalnu osnovnu cenu po špulni
        const reverseMaxOsnovna = (target1000 / ((1 + skartPct / 100) * (1 + marzaPct / 100))) * (lengthM / 1000);
        const reverseFixedCosts = kutija + hilzna + troskoviSpulna + transportPoSpulni + kasLakSpulna;
        const reverseMaxCenaM2 = povrsina > 0 ? Math.max(0, (reverseMaxOsnovna - reverseFixedCosts) / povrsina) : 0;
        const reverseProfitPoSpulni = (target1000 * lengthM / 1000) - proizvodna;

        setRez({
            povrsina,
            povrsina1000,
            tezina,
            tezina1000,
            cenaMat1000,
            cenaMatSpulna,
            troskoviSpulna,
            kasTr,
            lakTr,
            kasLakSpulna,
            kasProlazi: kasProlaziN,
            osnovna,
            proizvodna,
            saSkartom,
            saMarza,
            cena1000: final1000,
            proizvodna1000,
            ukupno,
            reverseMaxOsnovna,
            reverseMaxCenaM2,
            reverseProfitPoSpulni
        });
    }, [sirina, duzina, tezinaGM2, cenaM2, troskoviM2, cenaKutije, cenaHilzne, transport, skart, marza, kolicina, targetCena1000, brSlojeva, kasCena, lakOn, lakCena, lakProlazi]);

    const f0 = (v) => (v || 0).toFixed(0);
    const f2 = (v) => (v || 0).toFixed(2);
    const f3 = (v) => (v || 0).toFixed(3);

    // ===================== SAČUVAJ KALKULACIJU =====================
    async function sacuvajKalkulaciju(mode = 'new') {
        try {
            const materijali_struktura = buildMaterijaliStruktura([{ material: materijal, vrsta: materijal, gsm: tezinaGM2, sirina, idealna_sirina: sirina, cena: cenaM2, metara: duzina }], sirina);
            // Snapshot SVIH ulaza — da se pri ponovnom otvaranju ništa ne vrati na default
            const _ulaz = {
                naziv, kupac, oznakaUpita, brPorudzbine, datumIsporuke,
                materijal, tezinaGM2, cenaM2, troskoviM2,
                sirina, duzina,
                cenaKutije, cenaHilzne, transport, skart,
                marza, kolicina, napomena,
                brSlojeva, kasCena, lakOn, lakCena, lakProlazi
            };
            const rezSaUlaz = { ...rez, _ulaz };
            localStorage.setItem('maropack_pending_nalog', JSON.stringify({
                tip: 'spulna',
                type: 'spulna',
                naziv,
                kupac,
                oznaka_upita: oznakaUpita,
                spulna: {
                    naziv,
                    materijal,
                    sirina,
                    duzina,
                    W: sirina,
                    maxMetara: duzina,
                    layers: [{ material: materijal, vrsta: materijal, gsm: tezinaGM2, sirina, cena: cenaM2, metara: duzina }]
                },
                materijali: materijali_struktura,
                materijali_struktura,
                rezultati: rezSaUlaz,
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
                naziv,
                kupac,
                oznaka_upita: oznakaUpita,
                materijal,
                sirina: Number(sirina),
                duzina: Number(duzina),
                debljina: Number(tezinaGM2),
                tezina_gm2: Number(tezinaGM2),
                cena_kg: Number(cenaM2),
                marza: Number(marza),
                kolicina: Number(kolicina),
                rezultati: rezSaUlaz,
                materijali_struktura,
                tip_jezgra: '',
                precnik_jezgra: 0,
                napomena,
                osnovna_cena: rez.osnovna,
                konacna_cena: rez.saMarza,
                created_by: user?.id
            };
            let error, savedId = editId;
            if (mode === 'update' && editId) {
                ({ error } = await supabase.from('kalkulacije_spulne').update(zapis).eq('id', editId));
            } else {
                const r = await supabase.from('kalkulacije_spulne').insert([zapis]).select('id').single();
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

    return (
        <div style={{ padding: '16px', background: '#f1f5f9', minHeight: '100vh' }}>
            <AIPomoc ekran="Kalkulacija špulne" kontekst={() => ({ naziv, kupac, oznaka_upita: oznakaUpita, materijal, tezinaGM2, sirina, duzina, cenaM2, troskoviM2, cenaKutije, cenaHilzne, transport, skart, marza, kolicina, brSlojeva, kasCena, lakOn, lakCena, lakProlazi, rezultat: rez })} />
{/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #dc2626, #991b1b)', padding: '24px', borderRadius: '12px', color: 'white', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: '28px', margin: 0 }}>🎞️ Kalkulacija Špulne</h1>
                    <p style={{ opacity: 0.9, margin: '8px 0 0 0', fontSize: '14px' }}>Excel 1:1 proračun + obrnuta kalkulacija</p>
                </div>
                <div style={{ display: 'flex', gap: 8, background: 'rgba(255,255,255,.16)', padding: 6, borderRadius: 999 }}>
                    <button onClick={() => setMode('normal')} style={{ padding: '10px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 900, background: mode === 'normal' ? 'white' : 'transparent', color: mode === 'normal' ? '#991b1b' : 'white' }}>📊 Normalni</button>
                    <button onClick={() => setMode('reverse')} style={{ padding: '10px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 900, background: mode === 'reverse' ? 'white' : 'transparent', color: mode === 'reverse' ? '#991b1b' : 'white' }}>🔁 Obrnuti</button>
                </div>
            </div>

            {/* KALKULACIJA TAB */}
            {currentTab === 'kalk' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '20px' }}>

                    {/* LEVA STRANA - INPUT */}
                    <div style={{ background: 'white', borderRadius: '12px', padding: '24px' }}>

                        {/* Osnovni podaci */}
                        <Section title="📋 Osnovni podaci">
                            <div style={{ marginBottom: 10 }}>
                                <label style={{ fontSize: 11, fontWeight: 800, color: '#b45309', display: 'block', marginBottom: 4 }}>🔖 Broj / oznaka upita</label>
                                <input type="text" value={oznakaUpita} onChange={e => setOznakaUpita(e.target.value)} placeholder="npr. UP-2026-014" style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #f59e0b', borderRadius: 6, fontSize: 13, fontWeight: 700, background: '#fffbeb' }} />
                            </div>
                            <FormRow>
                                <FormField label="Naziv proizvoda" value={naziv} onChange={setNaziv} />
                                <FormField label="Kupac" value={kupac} onChange={setKupac} />
                            </FormRow>
                            <FormRow>
                                <FormField label="Broj porudžbine" value={brPorudzbine} onChange={setBrPorudzbine} />
                                <FormField label="Datum isporuke" value={datumIsporuke} onChange={setDatumIsporuke} type="date" />
                            </FormRow>
                        </Section>

                        {/* Materijal */}
                        <Section title="🎨 Materijal">
                            <MaterialLayersTablePRO
                                title="Materijal špulne"
                                layers={[{ materijal, gm2: tezinaGM2, tezina: tezinaGM2, vrsta: 'BOPP', oznaka: 'FXCB', debljina: 20 }]}
                                maxLayers={1}
                                showPrice={true}
                                showWidth={true}
                                showFlags={true}
                                onChange={(next) => {
                                    const mm = next[0] || {};
                                    setMaterijal(mm.nazivMaterijala || mm.materijal || materijal);
                                    setTezinaGM2(mm.gm2 || mm.tezina || tezinaGM2);
                                }}
                            />
                            <FormRow>
                                <FormField label="Cena materijala (€/m²)" value={cenaM2} onChange={setCenaM2} type="number" step="0.01" />
                                <FormField label="Troškovi (€/m²)" value={troskoviM2} onChange={setTroskoviM2} type="number" step="0.01" />
                            </FormRow>
                        </Section>

                        {/* Dimenzije */}
                        <Section title="📏 Dimenzije špulne">
                            <FormRow>
                                <FormField label="Širina trake (mm)" value={sirina} onChange={setSirina} type="number" />
                                <FormField label="Dužina (metara)" value={duzina} onChange={setDuzina} type="number" />
                            </FormRow>
                        </Section>

                        {/* Kaширanje i lak */}
                        <Section title="🧪 Kaширanje i lak (duplex / triplex / kvadriplex)">
                            <FormRow>
                                <FormField label="Broj slojeva (1=mono, 2=duplex, 3=triplex)" value={brSlojeva} onChange={setBrSlojeva} type="number" step="1" />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Kaширanje prolaza (AUTO = slojevi − 1)</label>
                                    <input type="number" value={Math.max(0, (Number(brSlojeva) || 1) - 1)} readOnly style={{ padding: 10, border: '2px solid #fbbf24', borderRadius: 8, fontSize: 14, background: '#fef3c7', color: '#92400e', fontWeight: 800 }} />
                                </div>
                            </FormRow>
                            <FormRow>
                                <FormField label="Kaширanje cena (€/m²)" value={kasCena} onChange={setKasCena} type="number" step="0.001" />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Kaширanje / špulni (AUTO)</label>
                                    <input type="number" value={f2(rez.kasTr)} readOnly style={{ padding: 10, border: '2px solid #fbbf24', borderRadius: 8, fontSize: 14, background: '#fef3c7', color: '#92400e', fontWeight: 800 }} />
                                </div>
                            </FormRow>
                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: 12, alignItems: 'end', marginBottom: 12 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: '#047857', paddingBottom: 10, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={lakOn} onChange={e => setLakOn(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#059669' }} /> Lakiranje
                                </label>
                                <FormField label="Lak cena (€/m²)" value={lakCena} onChange={setLakCena} type="number" step="0.001" />
                                <FormField label="Lak prolaza" value={lakProlazi} onChange={setLakProlazi} type="number" step="1" />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Lak / špulni (AUTO)</label>
                                    <input type="number" value={f2(rez.lakTr)} readOnly style={{ padding: 10, border: '2px solid #fbbf24', borderRadius: 8, fontSize: 14, background: '#fef3c7', color: '#92400e', fontWeight: 800 }} />
                                </div>
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                Broj prolaza kaширanja = broj slojeva − 1 (auto). Cene su €/m² i množe se površinom špulne ({f2(rez.povrsina)} m²). Mono špulna (1 sloj) → nema kaширanja.
                            </div>
                        </Section>

                        {/* Troškovi */}
                        <Section title="💰 Dodatni troškovi">
                            <FormRow>
                                <FormField label="Cena kutije (€)" value={cenaKutije} onChange={setCenaKutije} type="number" step="0.1" />
                                <FormField label="Cena hilzne (€)" value={cenaHilzne} onChange={setCenaHilzne} type="number" step="0.1" />
                            </FormRow>
                            <FormRow>
                                <FormField label="Transport po špulni (€)" value={transport} onChange={setTransport} type="number" step="0.1" />
                                <FormField label="Škart (%)" value={skart} onChange={setSkart} type="number" step="0.1" />
                            </FormRow>
                        </Section>

                        {/* Finalno */}
                        <Section title="📊 Finalno">
                            <FormRow>
                                <FormField label="Marža (%)" value={marza} onChange={setMarza} type="number" />
                                <FormField label="Količina (komada)" value={kolicina} onChange={setKolicina} type="number" />
                            </FormRow>
                        </Section>

                        {/* Napomena */}
                        <Section title="📝 Napomena">
                            <textarea value={napomena} onChange={e => setNapomena(e.target.value)} placeholder="Napomena uz kalkulaciju (materijal, rok, posebni zahtevi...)" rows={3} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, resize: "vertical", fontFamily: "inherit" }} />
                        </Section>

                        {mode === 'reverse' && (
                            <Section title="🔁 Obrnuta kalkulacija">
                                <FormRow>
                                    <FormField label="Ciljna cena / 1000 m (€)" value={targetCena1000} onChange={setTargetCena1000} type="number" step="0.01" />
                                    <FormField label="Max cena materijala (€/m²)" value={f3(rez.reverseMaxCenaM2)} onChange={() => {}} type="number" step="0.001" readOnly />
                                </FormRow>
                                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 12, fontSize: 13, color: '#9a3412', fontWeight: 800 }}>
                                    Ciljana cena vraća maksimalnu osnovnu cenu po špulni: {f2(rez.reverseMaxOsnovna)} €. Profit po špulni u odnosu na proizvodnu cenu: {f2(rez.reverseProfitPoSpulni)} €.
                                </div>
                            </Section>
                        )}

                    </div>

                    {/* DESNA STRANA - REZULTATI */}
                    <div>
                        <div style={{ background: 'white', borderRadius: '12px', padding: '24px' }}>

                            <div style={{ background: 'linear-gradient(135deg, #fee2e2, #fecaca)', border: '2px solid #dc2626', borderRadius: '12px', padding: '20px' }}>
                                <div style={{ fontSize: '18px', fontWeight: 800, color: '#7f1d1d', textAlign: 'center', marginBottom: '16px' }}>
                                    💰 REZULTATI KALKULACIJE
                                </div>

                                <ResultItem label="Površina po špulni (m²):" value={f2(rez.povrsina)} />
                                <ResultItem label="Težina materijala (kg):" value={f3(rez.tezina)} />
                                <ResultItem label="Materijal / 1000m:" value={f2(rez.cenaMat1000) + ' €'} />
                                <ResultItem label="Cena materijala / špulni:" value={f2(rez.cenaMatSpulna) + ' €'} />
                                <ResultItem label="Troškovi / špulni:" value={f2(rez.troskoviSpulna) + ' €'} />
                                <ResultItem label="Kutija + hilzna:" value={f2(Number(cenaKutije || 0) + Number(cenaHilzne || 0)) + ' €'} />
                                {(rez.kasLakSpulna > 0) && <ResultItem label="Kaширanje + lak / špulni:" value={f2(rez.kasLakSpulna) + ' €'} />}
                                <ResultItem label="Transport:" value={f2(transport) + ' €'} />
                            </div>

                            <PriceBox label="OSNOVNA CENA / ŠPULNI" value={f2(rez.osnovna) + ' €'} color="#fef3c7" />
                            <PriceBox label={`KONAČNA CENA / ŠPULNI (${marza}%)`} value={f2(rez.saMarza) + ' €'} color="#fef3c7" />
                            <PriceBox label="KONAČNA CENA / 1000 m" value={f2(rez.cena1000) + ' €'} color="#ffedd5" />

                            <div style={{ background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', border: '3px solid #10b981', borderRadius: '12px', padding: '20px', marginTop: '16px', textAlign: 'center' }}>
                                <div style={{ fontSize: '12px', color: '#065f46', fontWeight: 700, marginBottom: '8px' }}>
                                    UKUPNO ZA {kolicina} KOM
                                </div>
                                <div style={{ fontSize: '42px', fontWeight: 900, color: '#065f46' }}>
                                    {f2(rez.ukupno)} €
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                                {editId && (
                                    <button onClick={() => sacuvajKalkulaciju('update')} style={{ flex: 1, minWidth: 160, padding: '14px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)' }}>
                                        💾 Sačuvaj izmene
                                    </button>
                                )}
                                <button onClick={() => sacuvajKalkulaciju('new')} style={{ flex: 1, minWidth: 160, padding: '14px', background: editId ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)' }}>
                                    {editId ? '🆕 Sačuvaj kao NOVU' : '💾 Sačuvaj kalkulaciju'}
                                </button>
                            </div>



                        </div>
                    </div>

                </div>
            )}


        </div>
    );
}

// Helper komponente
function Section({ title, children }) {
    return (
        <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {title}
            </div>
            {children}
        </div>
    );
}

function FormRow({ children }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '12px' }}>
            {children}
        </div>
    );
}

function FormField({ label, value, onChange, type = 'text', step, readOnly = false }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                {label}
            </label>
            <input
                type={type}
                value={value}
                onChange={(e) => !readOnly && onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                step={step}
                readOnly={readOnly}
                style={{
                    padding: '10px',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px'
                }}
            />
        </div>
    );
}

function ResultItem({ label, value }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #fca5a5' }}>
            <span style={{ fontSize: '12px', color: '#991b1b' }}>{label}</span>
            <span style={{ fontWeight: 800, color: '#7f1d1d', fontSize: '16px' }}>{value}</span>
        </div>
    );
}

function PriceBox({ label, value, color }) {
    return (
        <div style={{
            background: `linear-gradient(135deg, ${color}, #fde68a)`,
            border: '3px solid #f59e0b',
            borderRadius: '12px',
            padding: '16px',
            marginTop: '16px',
            textAlign: 'center'
        }}>
            <div style={{ fontSize: '11px', color: '#92400e', fontWeight: 700, marginBottom: '4px' }}>
                {label}
            </div>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#92400e' }}>
                {value}
            </div>
        </div>
    );
}


// V46_MATERIAL_MASTER_EVERYWHERE: ovaj fajl je pripremljen za MaterialSelectorPRO / MaterialText.


// V47_MATERIAL_SELECTOR_REPLACEMENT: stari unos materijala treba fizički zameniti MaterialSelectorPRO / MaterialLayerRowPRO.
