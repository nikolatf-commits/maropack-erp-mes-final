// [build v53] MachineSchedulerPRO — čita naloge iz db, grupiše po master broju
// v52: + štamparije Milinković i Topolastika (uvek u parku, i posle reseta)
//      + trajanje naloga se računa PO MAŠINI: setup + metri/brzina (promeni brzinu → sve se preračuna)
//      + numerisan red čekanja po mašini (1., 2., 3...) sa ▲▼ za redosled
// v53: zajednički modul utils/nalogMetrika.js + bedževi "⚠️ probija rok" i "⏳ čeka prethodnu operaciju"
import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_MACHINES, ORDER_STATUSES, canMachineRun, getTraceLog, loadMachines, loadProductionPlan, saveMachines, saveProductionPlan, subscribeProductionPlan, statusByKey, logTrace } from '../services/erpMesCore.js';
// v53: zajednička logika naloga (količina/matična rolna/vreme/redosled operacija) — jedan izvor istine
import { extraktNalog, procenaMinNaMasini, mapaOperacija, nadjiBlokadu, OP_LABELE, canonRef } from '../utils/nalogMetrika.js';
// v54: tab "Kalendar" — Gantt po mašinama sa datumima (isti plan, ista drag/drop logika)
import GanttPlanPRO from './GanttPlanPRO.jsx';
// v54.1: živo osvežavanje naloga — kad radnik preko QR-a startuje/završi operaciju
// na SVOM telefonu, planerov ekran to vidi za par sekundi (Supabase realtime).
import { supabase } from '../supabase.js';

// v52: boje operacija na jednom mestu (koristi ih i OrderCard i red čekanja na mašini)
const OP_BOJA = { stampa: '#2563eb', lakiranje: '#7c3aed', kasiranje: '#0891b2', rezanje: '#dc2626', formatiranje: '#ea580c', kese: '#16a34a', spulne: '#9333ea' };

// v52: dve štamparije — dodaju se ako ih nema u sačuvanom parku (i posle "Reset mašina").
// Karakteristike (širina, brzina, setup...) menjaš klikom na karticu → "Uredi".
const STAMPA_MASINE = [
    { id: 'stampa-milinkovic', code: 'ST-01', name: 'Milinković', group: 'Štamparija', type: 'stampa', status: 'aktivna', minWidth: 200, maxWidth: 1300, maxDiameter: 800, core: 76, speed: 150, setupMin: 45, capabilities: ['flekso štampa', 'do 8 boja'], note: '' },
    { id: 'stampa-topolastika', code: 'ST-02', name: 'Topolastika', group: 'Štamparija', type: 'stampa', status: 'aktivna', minWidth: 200, maxWidth: 1300, maxDiameter: 800, core: 76, speed: 120, setupMin: 45, capabilities: ['flekso štampa'], note: '' },
    { id: 'stampa-maropack-karint', code: 'ST-03', name: 'Maropack Karint', group: 'Štamparija', type: 'stampa', status: 'aktivna', minWidth: 200, maxWidth: 1300, maxDiameter: 800, core: 76, speed: 150, setupMin: 45, capabilities: ['flekso štampa', 'do 8 boja'], note: '' },
];
function ensureStampa(list) {
    const arr = Array.isArray(list) ? list : [];
    const fali = STAMPA_MASINE.filter(sm => !arr.some(m => m.id === sm.id || String(m.name || '').trim().toLowerCase() === sm.name.toLowerCase()));
    return fali.length ? [...fali, ...arr] : list;
}

// v54: RADNE SMENE PO MAŠINI.
// Standardno: radnim danom (pon–pet) 2 smene, vikendom 0 (mašina ne radi).
// Izuzetak — KAŠIRKA i štampa „Maropack Karint" rade SAMO vikendom (subota+nedelja) po 2 smene,
//            a radnim danom (pon–pet) ne rade (0 smena).
// Sve se može izmeniti klikom na karticu mašine → „Uredi" (polja Smene radni dan / Smene vikend).
const DEF_SMENE_RADNIM = 2;             // sve mašine rade 2 smene dnevno
const DEF_SMENE_VIKEND = 0;             // vikendom po defaultu ne rade (osim izuzetaka)
// 1 smena = 8h, ali svaka smena ima 1h pauze → efektivan rad 7h = 420 min.
// Dakle dnevni kapacitet = 2 smene × 420 = 840 min (14h).
const SMENA_MIN = 420;
function jeVikendMasina(m) {
    const id = String(m && m.id || '').toLowerCase();
    const naziv = String(m && m.name || '').toLowerCase();
    return (m && m.type === 'kasiranje') || id.includes('maropack') || naziv.includes('maropack');
}
// Popuni podrazumevane smene ako nisu zadate (ne gazi ručno sačuvane vrednosti).
function primeniSmene(list) {
    return (Array.isArray(list) ? list : []).map(m => {
        const o = { ...m };
        const vikendOnly = jeVikendMasina(o);   // Maropack Karint + kaширka: samo vikendom
        if (o.smeneRadnim === undefined || o.smeneRadnim === null || o.smeneRadnim === '') o.smeneRadnim = vikendOnly ? 0 : DEF_SMENE_RADNIM;
        if (o.smeneVikend === undefined || o.smeneVikend === null || o.smeneVikend === '') o.smeneVikend = vikendOnly ? 2 : DEF_SMENE_VIKEND;
        return o;
    });
}
// Broj smena za dati dan: vikend (ned=0, sub=6) → smeneVikend, radni dan → smeneRadnim.
function smeneZaDan(machine, date) {
    const dow = date.getDay();
    const vikend = dow === 0 || dow === 6;
    const r = Number(vikend ? (machine && machine.smeneVikend) : (machine && machine.smeneRadnim));
    if (Number.isFinite(r) && r >= 0) return r;
    return vikend ? DEF_SMENE_VIKEND : DEF_SMENE_RADNIM;
}
// Raspoložive smene na toj mašini od danas do roka (uključivo), po kalendaru (vikend/radni).
function brojSmenaDoRoka(machine, rokDate) {
    if (!rokDate || Number.isNaN(rokDate.getTime())) return null;
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const kraj = new Date(rokDate); kraj.setHours(0, 0, 0, 0);
    if (kraj < d) return 0;
    let smene = 0, guard = 0;
    for (let cur = new Date(d); cur <= kraj && guard < 3660; cur.setDate(cur.getDate() + 1), guard++) smene += smeneZaDan(machine, cur);
    return smene;
}

// Redosled faza jednog naloga (štampa → lakiranje → kaширanje → formatiranje → rezanje …).
const REDOSLED_FAZA = { stampa: 1, lakiranje: 2, kasiranje: 3, formatiranje: 4, rezanje: 5, kese: 6, spulne: 7, ostalo: 9 };
// Kad se faza završi: krećući od datuma „od", troši dnevni kapacitet mašine (smene × 420),
// preskačući dane kad mašina ne radi (npr. kaширka radnim danom). Vraća datum završetka ili null.
function zavrsiFazu(machine, minuti, odDatuma) {
    const cur = new Date(odDatuma); cur.setHours(0, 0, 0, 0);
    let preostalo = Math.max(0, Number(minuti) || 0);
    if (preostalo <= 0) return cur;
    let guard = 0;
    while (preostalo > 0 && guard < 4000) {
        const kap = smeneZaDan(machine, cur) * SMENA_MIN;
        if (kap > 0) { preostalo -= kap; if (preostalo <= 0) return new Date(cur); }
        cur.setDate(cur.getDate() + 1); guard++;
    }
    return null;   // mašina nikad ne radi — ne može se završiti
}

// v52: TRAJANJE NALOGA NA KONKRETNOJ MAŠINI.
// Formula: setup mašine (min) + metri / brzina mašine (m/min).
// Ako nalog ima ručno uneto trajanje (trajanje_min u bazi), ono ima prednost.
// Promeniš li brzinu/setup na kartici mašine — sva vremena i zauzeće smene se preračunaju.
function calcDurationMin(machine, order) {
    if (!order) return 0;
    const rucno = Number(order.trajanjeRucno || 0);
    if (rucno > 0) return rucno;                                   // ručno uneto ima prednost
    return procenaMinNaMasini(machine, order.metri) || Number(order.durationMin || 60);
}

const styles = {
    page: { padding: 24, background: '#f1f5f9', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif' },
    hero: { background: 'linear-gradient(135deg,#0f172a,#1e3a8a)', color: 'white', borderRadius: 24, padding: 24, boxShadow: '0 14px 35px rgba(15,23,42,.18)' },
    card: { background: 'white', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 8px 25px rgba(15,23,42,.06)' },
    btn: { border: 0, borderRadius: 12, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' },
    input: { width: '100%', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', fontWeight: 700, color: '#0f172a', background: '#fff' }
};

function KPI({ label, value, sub }) {
    return <div style={{ ...styles.card, padding: 16 }}>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 900, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 950, color: '#0f172a', marginTop: 8 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{sub}</div>
    </div>;
}

function Badge({ children, color = '#0f172a' }) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, background: color + '15', color, fontSize: 11, fontWeight: 900, border: `1px solid ${color}30` }}>{children}</span>;
}

function OrderCard({ order, onDragStart, compact = false }) {
    const s = statusByKey(order.status);
    const opBoja = OP_BOJA[order.opTip] || '#64748b';
    return <div draggable onDragStart={e => onDragStart(e, order.id)} style={{ background: '#fff', border: '1px solid #dbeafe', borderLeft: `5px solid ${opBoja}`, borderRadius: 14, padding: compact ? 10 : 12, marginBottom: 10, cursor: 'grab', boxShadow: '0 6px 14px rgba(15,23,42,.05)' }}>
        {/* Tip operacije — istaknuto, da znaš na koju mašinu ide */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: opBoja, color: '#fff', borderRadius: 999, padding: '4px 11px', fontSize: 12, fontWeight: 950 }}>{order.opIkona} {order.opLabel}</span>
            <Badge color={s.color}>{s.label}</Badge>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
            <div>
                <div style={{ fontWeight: 950, color: '#0f172a', fontSize: 13 }}>{order.id}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#334155', marginTop: 2 }}>{order.title}</div>
            </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10, fontSize: 12 }}>
            <div><b>{order.metri ? order.metri.toLocaleString('sr-RS') + ' m' : '—'}</b><br /><span style={{ color: '#64748b' }}>{order.brojTraka > 1 ? 'matična rolna' : 'količina'}</span></div>
            <div><b>{order.width} mm</b><br /><span style={{ color: '#64748b' }}>širina</span></div>
            <div><b>{order.rok ? new Date(order.rok).toLocaleDateString('sr-RS') : '—'}</b><br /><span style={{ color: '#64748b' }}>rok</span></div>
        </div>
        {/* v52.1: dodatni podaci — da planer vidi sve bitno bez otvaranja naloga */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
            {order.brojTraka > 1 && <Badge color="#dc2626">{order.brojTraka} traka · uk. {Number(order.kolicinaUkupno || 0).toLocaleString('sr-RS')} m</Badge>}
            {order.kom > 0 && <Badge color="#0891b2">{Number(order.kom).toLocaleString('sr-RS')} kom</Badge>}
            {order.brojBoja > 0 && <Badge color="#7c3aed">{order.brojBoja} boja</Badge>}
            {order.tipProizvoda && <Badge color="#334155">{order.tipProizvoda}</Badge>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11.5, color: '#64748b' }}>
            <span>👤 {order.customer || '—'}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 900, color: order.priority === 'hitno' ? '#dc2626' : order.priority === 'visok' ? '#ea580c' : '#16a34a' }}>
                {order.priority === 'hitno' ? '🔴' : order.priority === 'visok' ? '🟠' : '🟢'} {order.priority}
            </span>
        </div>
    </div>;
}

function MachineEditModal({ machine, onClose, onSave }) {
    const [m, setM] = useState(machine || {});
    React.useEffect(() => { setM(machine || {}); }, [machine]);
    if (!machine) return null;
    const set = (k, v) => setM(prev => ({ ...prev, [k]: v }));
    return <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ ...styles.card, width: 'min(760px, 96vw)', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div><div style={{ fontSize: 12, color: '#64748b', fontWeight: 900 }}>KARTICA MAŠINE</div><h2 style={{ margin: 0, fontSize: 24 }}>{m.name}</h2></div>
                <button style={{ ...styles.btn, background: '#f1f5f9' }} onClick={onClose}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {[['name', 'Naziv'], ['code', 'Šifra'], ['status', 'Status'], ['maxWidth', 'Max širina mm'], ['minWidth', 'Min širina mm'], ['maxDiameter', 'Max Ø mm'], ['core', 'Hilzna'], ['speed', 'Brzina'], ['setupMin', 'Setup min'], ['smeneRadnim', 'Smene radni dan'], ['smeneVikend', 'Smene vikend (sub+ned)']].map(([k, l]) => <label key={k} style={{ fontSize: 12, color: '#64748b', fontWeight: 900 }}>{l}<input style={styles.input} value={m[k] ?? ''} onChange={e => set(k, e.target.value)} /></label>)}
            </div>
            <div style={{ marginTop: 8, fontSize: 11.5, color: '#64748b' }}>Smene po danu: radnim danom „Smene radni dan", subotom i nedeljom „Smene vikend". 1 smena = 8h sa 1h pauze → efektivan rad 7h (420 min). 2 smene = 14h dnevno. Vikend = 0 znači da mašina vikendom ne radi.</div>
            <label style={{ display: 'block', marginTop: 12, fontSize: 12, color: '#64748b', fontWeight: 900 }}>Mogućnosti / karakteristike<textarea style={{ ...styles.input, minHeight: 80 }} value={(m.capabilities || []).join(', ')} onChange={e => set('capabilities', e.target.value.split(',').map(x => x.trim()).filter(Boolean))} /></label>
            <label style={{ display: 'block', marginTop: 12, fontSize: 12, color: '#64748b', fontWeight: 900 }}>Napomena<textarea style={{ ...styles.input, minHeight: 80 }} value={m.note || ''} onChange={e => set('note', e.target.value)} /></label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button style={{ ...styles.btn, background: '#f1f5f9' }} onClick={onClose}>Odustani</button>
                <button style={{ ...styles.btn, background: '#0f172a', color: 'white' }} onClick={() => onSave(m)}>Sačuvaj mašinu</button>
            </div>
        </div>
    </div>;
}

export default function MachineSchedulerPRO({ db = {}, msg }) {
    const [machines, setMachines] = useState(DEFAULT_MACHINES);
    // Pravi nalozi iz baze (db.master_nalozi / db.nalozi) → format koji scheduler koristi.
    // ⚠ REDOSLED BITAN: naloziZivi MORA biti deklarisan PRE orders memo-a koji ga čita —
    // obrnuto u produkcijskom (minifikovanom) buildu baca "Cannot access before initialization".
    // v54.1: sveži operativni nalozi nezavisno od parenta — radnikov START/ZAVRŠI sa
    // telefona menja bazu, a ovaj kanal povuče promenu i kalendar se ODMAH preračuna.
    const [naloziZivi, setNaloziZivi] = useState(null);
    useEffect(() => {
        let ziv = true;
        async function sveziNalozi() {
            try {
                const { data } = await supabase.from('operativni_nalozi').select('*').limit(2000);
                if (ziv && Array.isArray(data)) setNaloziZivi(data);
            } catch (e) { /* zadrži poslednje poznato */ }
        }
        const ch = supabase.channel('plan-nalozi-' + Math.random().toString(36).slice(2))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'operativni_nalozi' }, () => sveziNalozi())
            .subscribe();
        const onEvt = () => sveziNalozi();
        window.addEventListener('maropack:nalozi-changed', onEvt);
        // i plan od kolega u drugom tabu/računaru (prevučen nalog) — na 20s
        const t = setInterval(async () => { try { setPlan(await loadProductionPlan()); } catch (e) { } }, 20000);
        return () => { ziv = false; try { supabase.removeChannel(ch); } catch (e) { } window.removeEventListener('maropack:nalozi-changed', onEvt); clearInterval(t); };
    }, []);

    const orders = useMemo(() => {
        // Jedna kartica PO OPERACIJI (štampa, rezanje, kaширanje...) — svaka ide na svoju mašinu.
        // Materijal se preskače (ne raspoređuje se na mašinu za štampu/rez).
        const izvor = (Array.isArray(naloziZivi) && naloziZivi.length) ? naloziZivi : (Array.isArray(db.nalozi) && db.nalozi.length ? db.nalozi : (db.master_nalozi || []));
        const tipOperacije = (n) => {
            const t = String(n.tip_naloga || n.vrsta || n.naziv || "").toLowerCase();
            if (t.includes("štamp") || t.includes("stamp")) return { k: "stampa", l: "ŠTAMPA", ikona: "🖨️" };
            if (t.includes("lak")) return { k: "lakiranje", l: "LAKIRANJE", ikona: "✨" };
            if (t.includes("kaš") || t.includes("kas")) return { k: "kasiranje", l: "KAŠIRANJE", ikona: "📚" };
            if (t.includes("perf") || t.includes("rez")) return { k: "rezanje", l: "REZANJE", ikona: "✂️" };
            if (t.includes("format")) return { k: "formatiranje", l: "FORMATIRANJE", ikona: "📐" };
            if (t.includes("kes")) return { k: "kese", l: "KESE", ikona: "🛍️" };
            if (t.includes("špul") || t.includes("spul")) return { k: "spulne", l: "ŠPULNE", ikona: "🧵" };
            if (t.includes("mater")) return { k: "materijal", l: "MATERIJAL", ikona: "📦" };
            return { k: "ostalo", l: "OPERACIJA", ikona: "⚙️" };
        };
        const out = [];
        (izvor || []).forEach((n) => {
            const op = tipOperacije(n);
            if (op.k === "materijal") return;   // materijal se ne raspoređuje na mašinu
            const st = String(n.status || "ceka").toLowerCase();
            // "stiglo iz štamparije" = štampa je gotova (materijal se vratio) → tretira se kao ZAVRŠENO,
            // pa se štampa ne prikazuje kao "čeka" i ne blokira kaширanje/rezanje.
            // "poslato u štampariju" = radi se eksterno (u toku), ne "čeka".
            const status = (st.indexOf("zavr") === 0 || st.indexOf("stiglo") >= 0) ? "zavrseno"
                : (st.indexOf("radi") === 0 || st.indexOf("toku") >= 0 || st.indexOf("poslato") >= 0) ? "u_radu"
                    : "ceka";
            const ex = extraktNalog(n);
            // direktne kolone (ako ih ima) i dalje imaju prednost, JSON je dopuna.
            // Za KAŠIRANJE materijal prolazi kroz mašinu više puta → množi metre brojem prolaza.
            const prolazi = op.k === "kasiranje" ? Math.max(1, ex.brojKasiranja) : 1;
            const metri = (Number(n.duzina_m || n.metri || 0) || ex.metriMasine || ex.kolicina || 0) * prolazi;
            out.push({
                id: String(n.broj_naloga || n.broj || n.id || ""),
                opTip: op.k, opLabel: op.l, opIkona: op.ikona, type: op.k,
                title: n.proizvod || n.naziv || n.prod || "Nalog",
                customer: n.kupac || "",
                width: Number(n.sir || n.sirina || n.idealnaSirinaMaterijala || 0) || ex.sirina || "—",
                metri,
                kolicinaUkupno: ex.kolicina, brojTraka: ex.brojTraka, kom: ex.kom, brojBoja: ex.brojBoja, tipProizvoda: ex.tipProizvoda,
                rok: n.rok || n.rok_isporuke || n.datum_isporuke || n.deadline || ex.rok || "",
                trajanjeRucno: Number(n.trajanje_min || n.durationMin || 0),   // ručno uneto ima prednost
                durationMin: Math.max(30, Math.round(metri / 100)) || 60,        // fallback kad mašina nema brzinu
                priority: n.prioritet || n.priority || "normalno",
                status,
                statusRaw: st,                                    // sirovi status (poslato_stampariji...)
                start_ts: n.start_ts || n.pocetak_ts || null,     // za preostalo vreme naloga u radu
            });
        });
        return out;
    }, [db.master_nalozi, db.nalozi]);
    // v53: status svake operacije po glavnom nalogu — da red čekanja pokaže
    // "⏳ čeka ŠTAMPU" kad prethodna operacija istog naloga nije završena.
    const opStatusi = useMemo(() => mapaOperacija((Array.isArray(naloziZivi) && naloziZivi.length) ? naloziZivi : (Array.isArray(db.nalozi) && db.nalozi.length ? db.nalozi : (db.master_nalozi || []))), [db.nalozi, db.master_nalozi, naloziZivi]);
    const [plan, setPlan] = useState({});
    const [filter, setFilter] = useState('sve');
    const [prikaz, setPrikaz] = useState('masine'); // 'masine' | 'kalendar'
    const [editing, setEditing] = useState(null);
    const [trace, setTrace] = useState([]);
    const [dragOrder, setDragOrder] = useState(null);

    useEffect(() => {
        (async () => {
            const ucitane = await loadMachines();
            const sve = primeniSmene(ensureStampa(ucitane));
            if (JSON.stringify(sve) !== JSON.stringify(ucitane)) await saveMachines(sve);   // štamparije + smene upisane trajno
            setMachines(sve);
            setPlan(await loadProductionPlan()); setTrace(getTraceLog());
        })();
    }, []);

    const orderMap = useMemo(() => Object.fromEntries(orders.map(o => [o.id, o])), [orders]);
    const plannedIds = useMemo(() => new Set(Object.values(plan).flat()), [plan]);
    // Koja operacija je na kojoj mašini (za računanje vremena po nalogu)
    const orderMachine = useMemo(() => { const m = {}; Object.entries(plan).forEach(([mid, ids]) => (ids || []).forEach(id => { m[id] = mid; })); return m; }, [plan]);
    const machineById = useMemo(() => Object.fromEntries(machines.map(m => [m.id, m])), [machines]);
    // Predstavnik po tipu operacije — za neraspoređenu fazu uzmemo prvu mašinu tog tipa
    // (zbog njenog rasporeda smena: npr. kaширka radi samo vikendom).
    const machineByType = useMemo(() => { const m = {}; machines.forEach(x => { if (!m[x.type]) m[x.type] = x; }); return m; }, [machines]);
    // UKUPNO VREME I PROJEKCIJA ZAVRŠETKA PO NALOGU.
    // Faze idu REDOM (štampa → kaширanje → rezanje), svaka na svojoj mašini sa svojim smenama.
    // Ne sabira se samo zbir minuta: kaширanje može da napreduje tek vikendom, pa „gotov"
    // zavisi od redosleda i kalendara smena svake mašine. Rezultat: ukupno min, broj faza, datum „gotov".
    const nalogUkupno = useMemo(() => {
        const danas = new Date(); danas.setHours(0, 0, 0, 0);
        const grupe = {};
        orders.forEach(o => {
            if (o.status === 'zavrseno') return;                 // završene faze se ne računaju
            const ref = canonRef(o.id);
            (grupe[ref] = grupe[ref] || []).push(o);
        });
        const acc = {};
        Object.entries(grupe).forEach(([ref, ops]) => {
            const sorted = [...ops].sort((a, b) => (REDOSLED_FAZA[a.opTip] || 9) - (REDOSLED_FAZA[b.opTip] || 9));
            let cursor = new Date(danas), min = 0, faza = 0, gotov = new Date(danas), ok = true;
            sorted.forEach(o => {
                const mach = machineById[orderMachine[o.id]] || machineByType[o.opTip] || null;
                const d = calcDurationMin(mach, o);
                min += d; faza += 1;
                if (!ok) return;
                const kraj = zavrsiFazu(mach, d, cursor);        // završetak ove faze (po kalendaru mašine)
                if (!kraj) { ok = false; gotov = null; return; }
                gotov = kraj;
                cursor = new Date(kraj); cursor.setDate(cursor.getDate() + 1);   // sledeća faza kreće sutradan
            });
            acc[ref] = { min, faza, gotovDatum: gotov };
        });
        return acc;
    }, [orders, orderMachine, machineById, machineByType]);
    // FIX: iz "Nalozi za raspored" izbaci i ZAVRŠENE naloge (ne samo one koji su na mašini) —
    // završena operacija se više ne raspoređuje, pa ne treba da visi u bazenu.
    const unplanned = orders.filter(o => !plannedIds.has(o.id) && o.status !== 'zavrseno');
    const shownMachines = machines.filter(m => filter === 'sve' || m.type === filter);
    const totals = useMemo(() => {
        const poId = Object.fromEntries(machines.map(m => [m.id, m]));
        let minutes = 0;
        Object.entries(plan).forEach(([mid, ids]) => (ids || []).forEach(id => { const o = orderMap[id]; if (o && o.status !== 'zavrseno') minutes += calcDurationMin(poId[mid], o); }));
        return { machines: machines.length, active: machines.filter(m => m.status === 'aktivna').length, planned: plannedIds.size, minutes };
    }, [machines, plannedIds, plan, orderMap]);

    // Snimi plan; ako je neko drugi u međuvremenu izmenio, osveži i javi (bez pregaza).
    async function snimiPlan(next) {
        const r = await saveProductionPlan(next);
        if (r && r.conflict) { const svez = await loadProductionPlan(); setPlan(svez); msg?.('⚠️ Plan je neko upravo izmenio — učitao sam najnoviju verziju, probaj ponovo.', 'err'); return false; }
        return true;
    }
    const dragStart = (e, orderId) => { setDragOrder(orderId); e.dataTransfer.setData('text/plain', orderId); };
    const dropToMachine = async (machineId, e) => {
        e.preventDefault();
        const orderId = e.dataTransfer.getData('text/plain') || dragOrder;
        const order = orderMap[orderId];
        const machine = machines.find(m => m.id === machineId);
        const check = canMachineRun(machine, order);
        if (!check.ok) { msg?.(`⚠️ ${check.reason}`, 'err'); return; }
        const next = { ...plan };
        for (const key of Object.keys(next)) next[key] = next[key].filter(id => id !== orderId);
        next[machineId] = [...(next[machineId] || []), orderId];
        setPlan(next);
        await snimiPlan(next);
        await logTrace('order_moved_to_machine', { orderId, machineId, machine: machine.name });
        setTrace(getTraceLog());
        msg?.(`✅ ${orderId} prebačen na ${machine.name}`);
    };
    // v52: pomeri nalog gore/dole u redu čekanja iste mašine
    const moveInQueue = async (machineId, index, dir) => {
        const lista = [...(plan[machineId] || [])];
        const j = index + dir;
        if (j < 0 || j >= lista.length) return;
        [lista[index], lista[j]] = [lista[j], lista[index]];
        const next = { ...plan, [machineId]: lista };
        setPlan(next); await snimiPlan(next);
        await logTrace('queue_reordered', { machineId, orderId: lista[j], from: index + 1, to: j + 1 });
        setTrace(getTraceLog());
    };
    const removeFromMachine = async (orderId) => {
        const next = { ...plan };
        for (const key of Object.keys(next)) next[key] = next[key].filter(id => id !== orderId);
        setPlan(next); await snimiPlan(next); await logTrace('order_removed_from_plan', { orderId }); setTrace(getTraceLog());
    };
    const saveMachine = async (m) => {
        const next = machines.map(x => x.id === m.id ? { ...m, maxWidth: Number(m.maxWidth), minWidth: Number(m.minWidth), maxDiameter: Number(m.maxDiameter), speed: Number(m.speed), setupMin: Number(m.setupMin) } : x);
        setMachines(next); await saveMachines(next); await logTrace('machine_updated', { machineId: m.id, machine: m.name }); setEditing(null); setTrace(getTraceLog()); msg?.('✅ Mašina sačuvana');
    };
    const resetMachines = async () => { const next = primeniSmene(ensureStampa(DEFAULT_MACHINES)); setMachines(next); await saveMachines(next); msg?.('✅ Vraćen standardni park + 3 štamparije + smene'); };

    return <div style={styles.page}>
        <div style={styles.hero}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
                <div><div style={{ opacity: .8, fontWeight: 900, letterSpacing: 1 }}>FAZA 1 · CORE ERP/MES</div><h1 style={{ margin: '6px 0 0', fontSize: 32 }}>Mašine + Plan proizvodnje PRO</h1><p style={{ margin: '8px 0 0', color: '#dbeafe' }}>3 štamparije (Milinković, Topolastika, Maropack Karint) · 10 rezača · 15 mašina za kese · 2 špulne · 1 kaширka · drag/drop plan.</p></div>
                <div style={{ display: 'flex', gap: 10 }}><button style={{ ...styles.btn, background: 'white', color: '#0f172a' }} onClick={resetMachines}>Reset mašina</button><button style={{ ...styles.btn, background: '#2563eb', color: 'white' }} onClick={() => msg?.('Plan je sačuvan')}>Sačuvaj plan</button></div>
            </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginTop: 16 }}>
            <KPI label="Mašina ukupno" value={totals.machines} sub="3 štamparije + 10 rezača + 15 kese + 2 špulne + 1 kaширка" />
            <KPI label="Aktivno" value={totals.active} sub="spremno za planiranje" />
            <KPI label="Planirano naloga" value={totals.planned} sub="drag/drop raspored" />
            <KPI label="Planirano vreme" value={`${Math.round(totals.minutes / 60)} h`} sub={`${totals.minutes} minuta ukupno`} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {[['masine', '🏭 Mašine'], ['kalendar', '📅 Kalendar']].map(([k, l]) =>
                <button key={k} onClick={() => setPrikaz(k)} style={{ ...styles.btn, padding: '10px 18px', background: prikaz === k ? '#0f172a' : '#fff', color: prikaz === k ? '#fff' : '#334155', border: prikaz === k ? 'none' : '1px solid #cbd5e1' }}>{l}</button>)}
        </div>

        {prikaz === 'kalendar' && <div style={{ marginTop: 14 }}>
            <GanttPlanPRO machines={machines} plan={plan} orderMap={orderMap} opStatusi={opStatusi} dragStart={dragStart} dropToMachine={dropToMachine} />
        </div>}

        {prikaz === 'masine' && <>

            <div style={{ display: 'grid', gridTemplateColumns: '330px 1fr', gap: 16, marginTop: 16 }}>
                <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                    <div style={{ ...styles.card, padding: 16 }}>
                        <h3 style={{ margin: 0 }}>Nalozi za raspored</h3>
                        <p style={{ margin: '6px 0 12px', color: '#64748b', fontSize: 13 }}>Prevuci nalog na kompatibilnu mašinu.</p>
                        {unplanned.length === 0 && <div style={{ padding: 14, borderRadius: 12, background: '#ecfdf5', color: '#047857', fontWeight: 900 }}>Svi nalozi su raspoređeni.</div>}
                        {unplanned.map(o => <OrderCard key={o.id} order={o} onDragStart={dragStart} />)}
                    </div>
                    <div style={{ ...styles.card, padding: 16 }}>
                        <h3 style={{ margin: 0 }}>Workflow statusi naloga</h3>
                        <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>{ORDER_STATUSES.map(s => <Badge key={s.key} color={s.color}>{s.label}</Badge>)}</div>
                    </div>
                    <div style={{ ...styles.card, padding: 16 }}>
                        <h3 style={{ margin: 0 }}>Traceability</h3>
                        <div style={{ marginTop: 12, maxHeight: 220, overflow: 'auto' }}>{trace.slice(0, 8).map((t, i) => <div key={i} style={{ borderBottom: '1px solid #e2e8f0', padding: '8px 0', fontSize: 12 }}><b>{t.event_type}</b><br /><span style={{ color: '#64748b' }}>{new Date(t.created_at).toLocaleString('sr-RS')}</span></div>)}</div>
                    </div>
                </div>

                <div>
                    <div style={{ ...styles.card, padding: 12, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{[['sve', 'Sve'], ['stampa', 'Štamparije'], ['rezanje', 'Rezači'], ['kese', 'Kese'], ['spulne', 'Špulne'], ['kasiranje', 'Kaширanje']].map(([k, l]) => <button key={k} onClick={() => setFilter(k)} style={{ ...styles.btn, background: filter === k ? '#0f172a' : '#f1f5f9', color: filter === k ? 'white' : '#334155' }}>{l}</button>)}</div>
                        <div style={{ color: '#64748b', fontWeight: 800, fontSize: 13 }}>Klikni karticu mašine za unos karakteristika.</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 14 }}>
                        {shownMachines.map(machine => {
                            // ZAVRŠENE operacije se SKLANJAJU sa trake mašine (klik „Završeno" ili QR) —
                            // ne prikazuju se i ne ulaze u opterećenje smene.
                            const assigned = (plan[machine.id] || []).map(id => orderMap[id]).filter(o => o && o.status !== 'zavrseno');
                            const load = assigned.reduce((s, o) => s + calcDurationMin(machine, o), 0);
                            // Dnevni kapacitet = smene na RADNOM danu mašine × 420 min.
                            // Za vikend-mašine (rade samo sub+ned) uzima se vikend broj smena.
                            const smeneDan = Math.max(Number(machine.smeneRadnim ?? DEF_SMENE_RADNIM), Number(machine.smeneVikend ?? DEF_SMENE_VIKEND));
                            const kapDan = Math.max(1, smeneDan) * SMENA_MIN;
                            return <div key={machine.id} onDragOver={e => e.preventDefault()} onDrop={e => dropToMachine(machine.id, e)} style={{ ...styles.card, padding: 14, minHeight: 260, borderTop: `5px solid ${machine.status === 'aktivna' ? '#16a34a' : '#f59e0b'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                                    <div onClick={() => setEditing(machine)} style={{ cursor: 'pointer', flex: 1 }}><div style={{ fontSize: 12, color: '#64748b', fontWeight: 950 }}>{machine.code} · {machine.group}</div><h3 style={{ margin: '2px 0 0', color: '#0f172a' }}>{machine.name}</h3></div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <Badge color={machine.status === 'aktivna' ? '#16a34a' : '#f59e0b'}>{machine.status}</Badge>
                                        <button onClick={() => setEditing(machine)} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '5px 9px', fontWeight: 800, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>✏️ Uredi</button>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 12, fontSize: 12 }}>
                                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: 8 }}><b>{machine.minWidth}-{machine.maxWidth}</b><br /><span style={{ color: '#64748b' }}>mm</span></div>
                                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: 8 }}><b>Ø {machine.maxDiameter}</b><br /><span style={{ color: '#64748b' }}>max</span></div>
                                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: 8 }}><b>{machine.speed}</b><br /><span style={{ color: '#64748b' }}>brzina</span></div>
                                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: 8 }}><b>{machine.setupMin}</b><br /><span style={{ color: '#64748b' }}>setup</span></div>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>{(machine.capabilities || []).slice(0, 4).map(c => <Badge key={c} color="#2563eb">{c}</Badge>)}
                                    {(() => { const sr = Number(machine.smeneRadnim ?? DEF_SMENE_RADNIM); const sv = Number(machine.smeneVikend ?? DEF_SMENE_VIKEND); return <span style={{ fontSize: 10.5, fontWeight: 900, borderRadius: 6, padding: '2px 7px', background: sv > 0 ? '#ecfeff' : '#f1f5f9', color: sv > 0 ? '#0e7490' : '#475569', border: '1px solid ' + (sv > 0 ? '#a5f3fc' : '#e2e8f0') }}>🕑 smene (8h/1h pauza): radni {sr > 0 ? sr : '—'} · vikend {sv > 0 ? sv : '—'}</span>; })()}
                                </div>
                                <div style={{ marginTop: 12, padding: 10, borderRadius: 14, background: '#f8fafc', border: '1px dashed #cbd5e1', minHeight: 90 }}>
                                    {assigned.length === 0 && <div style={{ color: '#94a3b8', fontWeight: 900, textAlign: 'center', padding: 22 }}>Prevuci nalog ovde</div>}
                                    {/* v52: numerisan RED ČEKANJA — vidi se ko je 1., 5., 10. na mašini; ▲▼ menja redosled */}
                                    {(() => {
                                        let cum = 0; return assigned.map((o, i) => {
                                            const dur = calcDurationMin(machine, o);
                                            cum += dur;
                                            // v54: rok vs kapacitet — koliko SMENA (po 420 efektivnih min) treba
                                            // za ceo nalog, prema raspoloživim smenama do roka (uz vikend raspored).
                                            const rokD = o.rok ? new Date(o.rok) : null;
                                            // v54: „gotov" za CEO nalog = projekcija kroz sve faze REDOM, svaka na svojoj mašini.
                                            const uk = nalogUkupno[canonRef(o.id)] || { min: dur, faza: 1, gotovDatum: null };
                                            const gotovD = uk.gotovDatum || null;
                                            const fmtD = (dt) => dt ? dt.toLocaleDateString('sr-RS') : '—';
                                            const probijaRok = (() => {
                                                if (!rokD || Number.isNaN(rokD.getTime())) return false;
                                                if (!gotovD) return true;                 // ne može da se završi (mašina ne radi)
                                                const r = new Date(rokD); r.setHours(0, 0, 0, 0);
                                                return gotovD.getTime() > r.getTime();     // projektovan završetak posle roka
                                            })();
                                            // v53: blokada redosleda — prethodna operacija istog naloga nije gotova
                                            const blokada = nadjiBlokadu(canonRef(o.id), o.opTip === 'rezanje' ? 'perforacija_rezanje' : (o.opTip === 'kese' ? 'kesa' : (o.opTip === 'spulne' ? 'spulna' : o.opTip)), opStatusi);
                                            const b = OP_BOJA[o.opTip] || '#64748b';
                                            const qb = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, width: 20, height: 15, fontSize: 9, fontWeight: 900, cursor: 'pointer', lineHeight: '11px', padding: 0, color: '#334155' };
                                            return <div key={o.id} draggable onDragStart={e => dragStart(e, o.id)} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e2e8f0', borderLeft: '4px solid ' + b, borderRadius: 10, padding: '7px 8px', marginBottom: 10, cursor: 'grab' }}>
                                                <span style={{ minWidth: 22, height: 22, borderRadius: 7, background: b, color: '#fff', fontSize: 11, fontWeight: 950, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 950, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.opIkona} {o.opLabel} · {o.id}</div>
                                                    <div style={{ fontSize: 10.5, color: '#7c3aed', fontWeight: 800 }}>ceo nalog ≈ {uk.min.toLocaleString('sr-RS')} min · {uk.faza} faza · gotov ~ {fmtD(gotovD)}</div>
                                                    <div style={{ fontSize: 11.5, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.title}{o.metri ? ' · ' + o.metri.toLocaleString('sr-RS') + ' m' : ''}{o.width && o.width !== '—' ? ' · ' + o.width + ' mm' : ''}{o.customer ? ' · ' + o.customer : ''}{o.rok ? ' · rok ' + new Date(o.rok).toLocaleDateString('sr-RS') : ''}{o.priority === 'hitno' ? ' · 🔴 hitno' : ''}</div>
                                                </div>
                                                <b style={{ fontSize: 11.5, whiteSpace: 'nowrap', color: '#0f172a' }} title={'setup ' + (machine.setupMin || 0) + ' min + ' + (o.metri || 0) + ' m ÷ ' + (machine.speed || '—') + ' m/min'}>≈{dur} min</b>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                    <button onClick={() => moveInQueue(machine.id, i, -1)} disabled={i === 0} style={{ ...qb, opacity: i === 0 ? .35 : 1 }}>▲</button>
                                                    <button onClick={() => moveInQueue(machine.id, i, 1)} disabled={i === assigned.length - 1} style={{ ...qb, opacity: i === assigned.length - 1 ? .35 : 1 }}>▼</button>
                                                </div>
                                                <button onClick={() => removeFromMachine(o.id)} style={{ border: 0, borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontWeight: 900, cursor: 'pointer', padding: '3px 7px' }}>×</button>
                                                {(probijaRok || blokada) && <div style={{ position: 'absolute', right: 8, bottom: -7, display: 'flex', gap: 4 }}>
                                                    {probijaRok && <span style={{ fontSize: 9, fontWeight: 900, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, padding: '1px 6px' }}>⚠️ probija rok (gotov ~ {fmtD(gotovD)} / rok {rokD ? new Date(rokD).toLocaleDateString('sr-RS') : '—'} · ceo nalog)</span>}
                                                    {blokada && <span style={{ fontSize: 9, fontWeight: 900, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 6, padding: '1px 6px' }}>⏳ čeka {OP_LABELE[blokada] || blokada}</span>}
                                                </div>}
                                            </div>;
                                        });
                                    })()}
                                </div>
                                <div style={{ marginTop: 10, height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, load / kapDan * 100)}%`, height: '100%', background: load > kapDan ? '#dc2626' : '#2563eb' }} /></div>
                                <div style={{ marginTop: 5, fontSize: 12, color: '#64748b', fontWeight: 800 }}>{load} min planirano / dan {kapDan} min ({Math.max(1, smeneDan)} smene × 7h{smeneDan && Number(machine.smeneRadnim ?? DEF_SMENE_RADNIM) === 0 ? ' · samo vikend' : ''}) · {machine.speed || '—'} m/min + setup {machine.setupMin || 0} min</div>
                            </div>;
                        })}
                    </div>
                </div>
            </div>
        </>}

        <MachineEditModal machine={editing} onClose={() => setEditing(null)} onSave={saveMachine} />
    </div>;
}
