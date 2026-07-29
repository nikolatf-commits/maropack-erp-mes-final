// [build v51] MachineSchedulerPRO — čita naloge iz db, grupiše po master broju
import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_MACHINES, ORDER_STATUSES, canMachineRun, getTraceLog, loadMachines, loadProductionPlan, saveMachines, saveProductionPlan, statusByKey, logTrace } from '../services/erpMesCore.js';

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
    const opBoja = { stampa: '#2563eb', lakiranje: '#7c3aed', kasiranje: '#0891b2', rezanje: '#dc2626', formatiranje: '#ea580c', kese: '#16a34a', spulne: '#9333ea' }[order.opTip] || '#64748b';
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
            {order.priority !== 'normalno' && <Badge color={order.priority === 'hitno' ? '#dc2626' : '#ea580c'}>{order.priority}</Badge>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10, fontSize: 12 }}>
            <div><b>{order.metri ? order.metri.toLocaleString('sr-RS') + ' m' : '\u2014'}</b><br /><span style={{ color: '#64748b' }}>količina</span></div>
            <div><b>{order.width} mm</b><br /><span style={{ color: '#64748b' }}>širina</span></div>
            <div><b>{order.customer || '\u2014'}</b><br /><span style={{ color: '#64748b' }}>kupac</span></div>
        </div>
    </div>;
}

function MachineEditModal({ machine, onClose, onSave }) {
    const [m, setM] = useState(machine);
    if (!machine) return null;
    const set = (k, v) => setM(prev => ({ ...prev, [k]: v }));
    return <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ ...styles.card, width: 'min(760px, 96vw)', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div><div style={{ fontSize: 12, color: '#64748b', fontWeight: 900 }}>KARTICA MAŠINE</div><h2 style={{ margin: 0, fontSize: 24 }}>{m.name}</h2></div>
                <button style={{ ...styles.btn, background: '#f1f5f9' }} onClick={onClose}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {[['name', 'Naziv'], ['code', 'Šifra'], ['status', 'Status'], ['maxWidth', 'Max širina mm'], ['minWidth', 'Min širina mm'], ['maxDiameter', 'Max Ø mm'], ['core', 'Hilzna'], ['speed', 'Brzina'], ['setupMin', 'Setup min']].map(([k, l]) => <label key={k} style={{ fontSize: 12, color: '#64748b', fontWeight: 900 }}>{l}<input style={styles.input} value={m[k] ?? ''} onChange={e => set(k, e.target.value)} /></label>)}
            </div>
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
    const orders = useMemo(() => {
        // Jedna kartica PO OPERACIJI (štampa, rezanje, kaширanje...) — svaka ide na svoju mašinu.
        // Materijal se preskače (ne raspoređuje se na mašinu za štampu/rez).
        const izvor = (Array.isArray(db.nalozi) && db.nalozi.length ? db.nalozi : (db.master_nalozi || []));
        const tipOperacije = (n) => {
            const t = String(n.tip_naloga || n.vrsta || n.naziv || "").toLowerCase();
            if (t.includes("\u0161tamp") || t.includes("stamp")) return { k: "stampa", l: "\u0160TAMPA", ikona: "\uD83D\uDDA8\uFE0F" };
            if (t.includes("lak")) return { k: "lakiranje", l: "LAKIRANJE", ikona: "\u2728" };
            if (t.includes("ka\u0161") || t.includes("kas")) return { k: "kasiranje", l: "KA\u0160IRANJE", ikona: "\uD83D\uDCDA" };
            if (t.includes("perf") || t.includes("rez")) return { k: "rezanje", l: "REZANJE", ikona: "\u2702\uFE0F" };
            if (t.includes("format")) return { k: "formatiranje", l: "FORMATIRANJE", ikona: "\uD83D\uDCD0" };
            if (t.includes("kes")) return { k: "kese", l: "KESE", ikona: "\uD83D\uDECD\uFE0F" };
            if (t.includes("\u0161pul") || t.includes("spul")) return { k: "spulne", l: "\u0160PULNE", ikona: "\uD83E\uDDF5" };
            if (t.includes("mater")) return { k: "materijal", l: "MATERIJAL", ikona: "\uD83D\uDCE6" };
            return { k: "ostalo", l: "OPERACIJA", ikona: "\u2699\uFE0F" };
        };
        const out = [];
        (izvor || []).forEach((n) => {
            const op = tipOperacije(n);
            if (op.k === "materijal") return;   // materijal se ne raspoređuje na mašinu
            const st = String(n.status || "ceka").toLowerCase();
            const status = st.indexOf("zavr") === 0 ? "zavrseno" : (st.indexOf("radi") === 0 || st.indexOf("toku") >= 0 ? "u_radu" : "ceka");
            const metri = Number(n.kolicina || n.kol || n.duzina_m || n.metri || 0) || 0;
            out.push({
                id: String(n.broj_naloga || n.broj || n.id || ""),
                opTip: op.k, opLabel: op.l, opIkona: op.ikona, type: op.k,
                title: n.proizvod || n.naziv || n.prod || "Nalog",
                customer: n.kupac || "",
                width: Number(n.sir || n.sirina || n.idealnaSirinaMaterijala || 0) || "\u2014",
                metri,
                durationMin: Number(n.trajanje_min || n.durationMin || Math.max(30, Math.round(metri / 100)) || 60),
                priority: n.prioritet || n.priority || "normalno",
                status,
            });
        });
        return out;
    }, [db.master_nalozi, db.nalozi]);
    const [plan, setPlan] = useState({});
    const [filter, setFilter] = useState('sve');
    const [editing, setEditing] = useState(null);
    const [trace, setTrace] = useState([]);
    const [dragOrder, setDragOrder] = useState(null);

    useEffect(() => {
        (async () => {
            setMachines(await loadMachines());
            setPlan(await loadProductionPlan()); setTrace(getTraceLog());
        })();
    }, []);

    const orderMap = useMemo(() => Object.fromEntries(orders.map(o => [o.id, o])), [orders]);
    const plannedIds = useMemo(() => new Set(Object.values(plan).flat()), [plan]);
    const unplanned = orders.filter(o => !plannedIds.has(o.id));
    const shownMachines = machines.filter(m => filter === 'sve' || m.type === filter);
    const totals = useMemo(() => ({ machines: machines.length, active: machines.filter(m => m.status === 'aktivna').length, planned: plannedIds.size, minutes: Object.values(plan).flat().reduce((s, id) => s + (orderMap[id]?.durationMin || 0), 0) }), [machines, plannedIds, plan, orderMap]);

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
        await saveProductionPlan(next);
        await logTrace('order_moved_to_machine', { orderId, machineId, machine: machine.name });
        setTrace(getTraceLog());
        msg?.(`✅ ${orderId} prebačen na ${machine.name}`);
    };
    const removeFromMachine = async (orderId) => {
        const next = { ...plan };
        for (const key of Object.keys(next)) next[key] = next[key].filter(id => id !== orderId);
        setPlan(next); await saveProductionPlan(next); await logTrace('order_removed_from_plan', { orderId }); setTrace(getTraceLog());
    };
    const saveMachine = async (m) => {
        const next = machines.map(x => x.id === m.id ? { ...m, maxWidth: Number(m.maxWidth), minWidth: Number(m.minWidth), maxDiameter: Number(m.maxDiameter), speed: Number(m.speed), setupMin: Number(m.setupMin) } : x);
        setMachines(next); await saveMachines(next); await logTrace('machine_updated', { machineId: m.id, machine: m.name }); setEditing(null); setTrace(getTraceLog()); msg?.('✅ Mašina sačuvana');
    };
    const resetMachines = async () => { setMachines(DEFAULT_MACHINES); await saveMachines(DEFAULT_MACHINES); msg?.('✅ Vraćeno 30 standardnih mašina'); };

    return <div style={styles.page}>
        <div style={styles.hero}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
                <div><div style={{ opacity: .8, fontWeight: 900, letterSpacing: 1 }}>FAZA 1 · CORE ERP/MES</div><h1 style={{ margin: '6px 0 0', fontSize: 32 }}>Mašine + Plan proizvodnje PRO</h1><p style={{ margin: '8px 0 0', color: '#dbeafe' }}>10 rezača · 15 mašina za kese · 2 špulne · 1 kaširka · kartice mašina · drag/drop plan.</p></div>
                <div style={{ display: 'flex', gap: 10 }}><button style={{ ...styles.btn, background: 'white', color: '#0f172a' }} onClick={resetMachines}>Reset 28 mašina</button><button style={{ ...styles.btn, background: '#2563eb', color: 'white' }} onClick={() => msg?.('Plan je sačuvan')}>Sačuvaj plan</button></div>
            </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginTop: 16 }}>
            <KPI label="Mašina ukupno" value={totals.machines} sub="10 rezača + 15 kese + 2 špulne + 1 kaširka" />
            <KPI label="Aktivno" value={totals.active} sub="spremno za planiranje" />
            <KPI label="Planirano naloga" value={totals.planned} sub="drag/drop raspored" />
            <KPI label="Planirano vreme" value={`${Math.round(totals.minutes / 60)} h`} sub={`${totals.minutes} minuta ukupno`} />
        </div>

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
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{[['sve', 'Sve'], ['stampa', 'Štamparije'], ['rezanje', 'Rezači'], ['kese', 'Kese'], ['spulne', 'Špulne'], ['kasiranje', 'Kaširanje']].map(([k, l]) => <button key={k} onClick={() => setFilter(k)} style={{ ...styles.btn, background: filter === k ? '#0f172a' : '#f1f5f9', color: filter === k ? 'white' : '#334155' }}>{l}</button>)}</div>
                    <div style={{ color: '#64748b', fontWeight: 800, fontSize: 13 }}>Klikni karticu mašine za unos karakteristika.</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 14 }}>
                    {shownMachines.map(machine => {
                        const assigned = (plan[machine.id] || []).map(id => orderMap[id]).filter(Boolean);
                        const load = assigned.reduce((s, o) => s + (o.durationMin || 0), 0);
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
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>{(machine.capabilities || []).slice(0, 4).map(c => <Badge key={c} color="#2563eb">{c}</Badge>)}</div>
                            <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: '#f8fafc', border: '1px dashed #cbd5e1', minHeight: 90 }}>
                                {assigned.length === 0 && <div style={{ color: '#94a3b8', fontWeight: 900, textAlign: 'center', padding: 22 }}>Prevuci nalog ovde</div>}
                                {assigned.map(o => <div key={o.id} style={{ position: 'relative' }}><OrderCard order={o} onDragStart={dragStart} compact /><button onClick={() => removeFromMachine(o.id)} style={{ position: 'absolute', right: 6, top: 6, border: 0, borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontWeight: 900, cursor: 'pointer' }}>×</button></div>)}
                            </div>
                            <div style={{ marginTop: 10, height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, load / 480 * 100)}%`, height: '100%', background: load > 420 ? '#dc2626' : '#2563eb' }} /></div>
                            <div style={{ marginTop: 5, fontSize: 12, color: '#64748b', fontWeight: 800 }}>{load} min planirano / smena 480 min</div>
                        </div>;
                    })}
                </div>
            </div>
        </div>

        <MachineEditModal machine={editing} onClose={() => setEditing(null)} onSave={saveMachine} />
    </div>;
}
