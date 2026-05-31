import React, { useState, useEffect } from 'react';
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

export default function KalkulacijaSpulne() {
    const [currentTab, setCurrentTab] = useState('kalk');
    const [mode, setMode] = useState('normal'); // normal | reverse
    const [targetCena1000, setTargetCena1000] = useState(95);

    // AUTH
    const { user } = useAuth();

    // Osnovni podaci
    const [naziv, setNaziv] = useState('Trake 8 mm - 10000 m');
    const [kupac, setKupac] = useState('Mavotape');
    const [brPorudzbine, setBrPorudzbine] = useState('4664');
    const [datumPorudzbine, setDatumPorudzbine] = useState('2026-04-28');
    const [datumIsporuke, setDatumIsporuke] = useState('2026-05-30');

    // Materijal
    const [materijal, setMaterijal] = useState('PE30 / PET12 / PE 30');
    const [tezinaGM2, setTezinaGM2] = useState(72);
    const [cenaM2, setCenaM2] = useState(1.13);
    const [troskoviM2, setTroskoviM2] = useState(0.05);

    // Dimenzije špulne
    const [sirina, setSirina] = useState(8);  // mm
    const [duzina, setDuzina] = useState(10000);  // m

    // Troškovi
    const [cenaKutije, setCenaKutije] = useState(2);
    const [cenaHilzne, setCenaHilzne] = useState(1);
    const [transport, setTransport] = useState(2);
    const [skart, setSkart] = useState(2);

    // Finalno
    const [marza, setMarza] = useState(40);
    const [kolicina, setKolicina] = useState(189);

    // ✅ V26: Template → Kalkulacija realno mapiranje za špulne.
    useEffect(() => {
        const tpl = readPendingTemplateCalculation('spulna');
        if (!tpl) return;
        const sp = tpl.spulna || {};
        setNaziv(tpl.naziv || sp.naziv || '');
        setKupac(tpl.kupac || '');
        setMaterijal(sp.materijal || '');
        setSirina(Number(sp.W || sp.sirina || 0));
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

        // Excel A15: materijal + kutija + hilzna + troškovi + transport po špulni
        const osnovna = cenaMatSpulna + kutija + hilzna + troskoviSpulna + transportPoSpulni;

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
        const reverseFixedCosts = kutija + hilzna + troskoviSpulna + transportPoSpulni;
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
    }, [sirina, duzina, tezinaGM2, cenaM2, troskoviM2, cenaKutije, cenaHilzne, transport, skart, marza, kolicina, targetCena1000]);

    const f0 = (v) => (v || 0).toFixed(0);
    const f2 = (v) => (v || 0).toFixed(2);
    const f3 = (v) => (v || 0).toFixed(3);

    // ===================== SAČUVAJ KALKULACIJU =====================
    async function sacuvajKalkulaciju() {
        try {
            localStorage.setItem('maropack_pending_nalog', JSON.stringify({
                tip: 'spulna',
                type: 'spulna',
                naziv,
                kupac,
                spulna: {
                    naziv,
                    materijal,
                    sirina,
                    duzina,
                    W: sirina,
                    maxMetara: duzina,
                    layers: [{ material: materijal, vrsta: materijal, gsm: tezinaGM2, sirina, cena: cenaM2, metara: duzina }]
                },
                materijali: [{ material: materijal, vrsta: materijal, gsm: tezinaGM2, sirina, cena: cenaM2, metara: duzina }],
                rezultati: rez,
                created_at: new Date().toISOString()
            }));
            const materijaliStruktura = [{
                sloj: 1,
                vrsta: materijal,
                pod_vrsta: '',
                oznaka_materijala: materijal,
                debljina: Number(tezinaGM2),
                idealna_sirina: Number(sirina),
                sirina: Number(sirina),
                metraza: Number(duzina),
                cena: Number(cenaM2)
            }];

            const { error } = await supabase.from('kalkulacije_spulne').insert([{
                naziv,
                kupac,
                materijal,
                sirina: Number(sirina),
                duzina: Number(duzina),
                debljina: Number(tezinaGM2),
                tezina_gm2: Number(tezinaGM2),
                cena_kg: Number(cenaM2),
                marza: Number(marza),
                kolicina: Number(kolicina),
                rezultati: rez,
                materijali_struktura: materijaliStruktura,
                tip_jezgra: '',
                precnik_jezgra: 0,
                napomena: '',
                osnovna_cena: rez.osnovna,
                konacna_cena: rez.saMarza,
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
        <div style={{ padding: '16px', background: '#f1f5f9', minHeight: '100vh' }}>
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

                            <button
                                onClick={sacuvajKalkulaciju}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontWeight: 800,
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    marginTop: '12px',
                                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)'
                                }}
                            >
                                💾 Sačuvaj kalkulaciju
                            </button>



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
