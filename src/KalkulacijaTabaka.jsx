import React, { useState, useEffect } from 'react';
import { supabase } from './supabase.js';
import { useAuth } from './auth/AuthProvider';

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

const S = {
    wrap: { maxWidth: 1180, margin: '0 auto', padding: '8px 4px 60px' },
    card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 14 },
    h: { fontSize: 13, fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    label: { fontSize: 10.5, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 3 },
    inp: { width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '8px 10px', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },
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
        <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1.5px solid ' + (active ? '#16a34a' : '#e2e8f0'), background: active ? '#f0fdf4' : '#fff', borderRadius: 10, padding: '9px 11px', cursor: 'pointer' }}>
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
    const [setupMasina, setSetupMasina] = useState(0);   // € ukupno, jednokratno (ne ulazi u maržu)
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
    const addMat = () => setMaterijali((arr) => [...arr, { tip: '', debljina: '', tezina: 0, cena: 0 }]);
    const delMat = (i) => setMaterijali((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr);

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
            if (Array.isArray(k.materijali) && k.materijali.length) setMaterijali(k.materijali);
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
        materijali.forEach((m) => { if (n(m.tezina) > 0) { sumTez += n(m.tezina); sumCena += n(m.cena); br++; } });
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
            const materijali_struktura = (materijali || []).map((m) => ({
                vrsta: m.vrsta || m.tip || '', pod_vrsta: m.pod_vrsta || '', oznaka: m.oznaka || '',
                debljina: n(m.debljina), gm2: n(m.tezina), cena: n(m.cena),
            }));
            const avgTez = materijali.length ? materijali.reduce((a, m) => a + n(m.tezina), 0) / materijali.length : 0;
            const avgCena = materijali.length ? materijali.reduce((a, m) => a + n(m.cena), 0) / materijali.length : 0;

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
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
            <span style={{ color: '#64748b' }}>{k}</span><span style={{ fontWeight: 800, color: c || '#0f172a' }}>{v}</span>
        </div>
    );

    return (
        <div style={S.wrap}>
            <div style={{ fontSize: 20, fontWeight: 950, color: '#0f172a', margin: '4px 4px 14px' }}>📄 Kalkulacija tabaka (ravan list)</div>

            <div style={S.card}>
                <div style={S.h}>Osnovni podaci</div>
                <div style={S.grid(170)}>
                    <F label="Naziv proizvoda" value={naziv} onChange={setNaziv} />
                    <F label="Kupac" value={kupac} onChange={setKupac} />
                    <F label="Oznaka / broj upita" value={oznakaUpita} onChange={setOznakaUpita} />
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
                <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                    Ban (traka po širini): <b>{rez.ban || 1}</b> &nbsp;·&nbsp; Korak na traci: <b>{fmt(rez.korak)}</b> mm
                    {n(rez.otpadMm) > 0 ? <span style={{ color: '#b91c1c' }}> &nbsp;·&nbsp; ivični otpad <b>{fmt(rez.otpadMm)}</b> mm</span> : null}
                </div>
            </div>

            <div style={S.card}>
                <div style={S.h}>Materijal (slojevi)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.9fr 0.9fr 0.9fr 34px', gap: 6, fontSize: 9.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                    <div>Vrsta</div><div>Debljina (µm)</div><div>Težina (g/m²)</div><div>Cena (€/kg)</div><div></div>
                </div>
                {materijali.map((m, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.9fr 0.9fr 0.9fr 34px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                        <input value={m.tip || ''} onChange={(e) => setMat(i, { tip: e.target.value })} style={S.inp} placeholder="npr. CPP" />
                        <input type="number" value={m.debljina} onChange={(e) => setMat(i, { debljina: e.target.value })} style={S.inp} />
                        <input type="number" value={m.tezina} onChange={(e) => setMat(i, { tezina: e.target.value })} style={S.inp} />
                        <input type="number" value={m.cena} onChange={(e) => setMat(i, { cena: e.target.value })} style={S.inp} />
                        <button onClick={() => delMat(i)} style={{ border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', borderRadius: 8, fontWeight: 900, cursor: 'pointer', padding: '7px 0' }}>✕</button>
                    </div>
                ))}
                <button onClick={addMat} style={{ border: '1px dashed #94a3b8', background: '#f8fafc', color: '#475569', borderRadius: 9, padding: '7px 12px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>+ Dodaj sloj</button>
                <div style={{ ...S.grid(150), marginTop: 10 }}>
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
                {opts.pakHrana ? <div style={{ marginTop: 8, fontSize: 11.5, color: '#065f46', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '7px 10px' }}>⚠ Pakovanje za hranu — upotreba rukavica, mrežica za kosu, bez dlaka; čist pogon.</div> : null}
                <div style={{ marginTop: 10 }}>
                    <label style={S.label}>Napomena</label>
                    <input value={napomena} onChange={(e) => setNapomena(e.target.value)} style={S.inp} placeholder="npr. pakovanje, posebni zahtevi…" />
                </div>
            </div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'stretch' }}>
                <div style={{ ...S.card, flex: '1 1 320px', margin: 0 }}>
                    <div style={S.h}>Rezultat</div>
                    <Rb k="Materijal (€/1000)" v={eur(rez.materijal)} />
                    <Rb k="Opcije (€/1000)" v={eur(rez.opcije)} />
                    {n(rez.kasiranje) > 0 ? <Rb k="Kaширanje (€/1000)" v={eur(rez.kasiranje)} /> : null}
                    {n(rez.transport) > 0 ? <Rb k="Transport (€/1000)" v={eur(rez.transport)} /> : null}
                    <Rb k="Osnovna (€/1000)" v={eur(rez.osnovna)} />
                    {n(rez.setup1000) > 0 ? <Rb k="Podešavanje (€/1000)" v={eur(rez.setup1000)} /> : null}
                    <div style={{ borderTop: '1px solid #e2e8f0', margin: '6px 0' }} />
                    <Rb k="KONAČNA (€/1000 kom)" v={eur(rez.konacna)} c="#15803d" />
                    <Rb k="€ / kom" v={eur(rez.perKom)} />
                    <Rb k="€ / kg (sa maржom)" v={eur(rez.cenaPoKgSaMarza)} />
                    <Rb k="Ukupno nalog (€)" v={eur(rez.vrednostKon)} c="#1d4ed8" />
                    <Rb k="Ukupno kg" v={fmt(rez.ukKg)} />
                </div>
                <div style={{ ...S.card, flex: '1 1 260px', margin: 0 }}>
                    <div style={S.h}>Provera cene</div>
                    <F label="Željena cena (€/1000)" value={zeljCena} onChange={setZeljCena} type="number" />
                    <div style={{ marginTop: 8, fontSize: 13, color: '#475569' }}>Izvedena marža: <b style={{ color: n(rez.izrMarza) >= n(marza) ? '#15803d' : '#b45309' }}>{fmt(rez.izrMarza)}%</b></div>
                    <button onClick={sacuvaj} style={{ marginTop: 16, width: '100%', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 11, padding: '12px', fontWeight: 900, fontSize: 15, cursor: 'pointer' }}>💾 {editId ? 'Sačuvaj izmene' : 'Sačuvaj kalkulaciju'}</button>
                    {typeof setPage === 'function' ? <button onClick={() => setPage('kalkulacije_lista')} style={{ marginTop: 8, width: '100%', background: '#fff', color: '#475569', border: '1.5px solid #cbd5e1', borderRadius: 11, padding: '10px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>← Lista kalkulacija</button> : null}
                </div>
            </div>
        </div>
    );
}
