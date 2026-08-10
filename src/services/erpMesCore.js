import { supabase, isSupabaseConfigured } from '../supabase.js';

export const ORDER_STATUSES = [
    { key: 'kreiran', label: 'Kreiran', color: '#64748b' },
    { key: 'priprema', label: 'Priprema', color: '#2563eb' },
    { key: 'materijal_rezervisan', label: 'Materijal rezervisan', color: '#7c3aed' },
    { key: 'spreman_stampa', label: 'Spreman za štampu', color: '#0891b2' },
    { key: 'stampa', label: 'Štampa', color: '#ea580c' },
    { key: 'kasiranje', label: 'Kaširanje', color: '#9333ea' },
    { key: 'rezanje', label: 'Rezanje', color: '#16a34a' },
    { key: 'secenje', label: 'Sečenje', color: '#0f766e' },
    { key: 'kontrola_kvaliteta', label: 'Kontrola kvaliteta', color: '#ca8a04' },
    { key: 'zavrsen', label: 'Završen', color: '#059669' },
    { key: 'isporucen', label: 'Isporučen', color: '#111827' }
];

export const DEFAULT_MACHINES = [
    {
        id: 'stamparija-milinkovic',
        code: 'SM-01',
        name: 'Štamparija Milinković',
        type: 'stampa',
        group: 'Štamparije',
        status: 'aktivna',
        maxWidth: 1200,
        minWidth: 0,
        maxDiameter: 800,
        core: '76 / 152 mm',
        speed: 300,
        setupMin: 40,
        capabilities: ['flekso', 'rotogravura', '8 boja'],
        note: 'Upisati tačne karakteristike štamparije.'
    },
    {
        id: 'stamparija-tipoplastika',
        code: 'ST-01',
        name: 'Štamparija Tipoplastika',
        type: 'stampa',
        group: 'Štamparije',
        status: 'aktivna',
        maxWidth: 1300,
        minWidth: 0,
        maxDiameter: 800,
        core: '76 / 152 mm',
        speed: 350,
        setupMin: 45,
        capabilities: ['flekso', '10 boja', 'lak'],
        note: 'Upisati tačne karakteristike štamparije.'
    },
    ...Array.from({ length: 10 }, (_, i) => ({
        id: `rezac-${i + 1}`,
        code: `R-${String(i + 1).padStart(2, '0')}`,
        name: `Rezač ${i + 1}`,
        type: 'rezanje',
        group: 'Rezači',
        status: i < 8 ? 'aktivna' : 'servis',
        maxWidth: i < 4 ? 1600 : 1300,
        minWidth: 50,
        maxDiameter: 900,
        core: '76 / 152 mm',
        speed: 280 + i * 10,
        setupMin: 25,
        capabilities: ['rezanje', 'premotavanje', 'kontrola metraže'],
        note: 'Upisati tačne karakteristike mašine.'
    })),
    ...Array.from({ length: 15 }, (_, i) => ({
        id: `kesa-${i + 1}`,
        code: `K-${String(i + 1).padStart(2, '0')}`,
        name: `Mašina za kese ${i + 1}`,
        type: 'kese',
        group: 'Mašine za kese',
        status: i < 13 ? 'aktivna' : 'servis',
        maxWidth: i < 5 ? 1200 : 900,
        minWidth: 60,
        maxDiameter: 800,
        core: '76 mm',
        speed: 90 + i * 4,
        setupMin: 35,
        capabilities: ['ravna kesa', 'doypack', 'konusna', i % 3 === 0 ? 'zip' : 'standard'],
        note: 'Upisati tipove kesa, dodatke i ograničenja.'
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
        id: `spulna-${i + 1}`,
        code: `S-${String(i + 1).padStart(2, '0')}`,
        name: `Mašina za špulne ${i + 1}`,
        type: 'spulne',
        group: 'Mašine za špulne',
        status: 'aktivna',
        maxWidth: 250,
        minWidth: 5,
        maxDiameter: 450,
        core: 'prema nalogu',
        speed: 180,
        setupMin: 20,
        capabilities: ['špulne', 'uske trake', 'brojanje komada'],
        note: 'Upisati opseg širina, hilzne i brzine.'
    })),
    {
        id: 'kasirka-1',
        code: 'L-01',
        name: 'Kaširka 1',
        type: 'kasiranje',
        group: 'Kaširanje',
        status: 'aktivna',
        maxWidth: 1300,
        minWidth: 300,
        maxDiameter: 1000,
        core: '76 / 152 mm',
        speed: 220,
        setupMin: 45,
        capabilities: ['duplex', 'triplex', 'solventless', 'kontrola napona'],
        note: 'Upisati realnu širinu, lepak i tehnička ograničenja.'
    }
];

export const INITIAL_ORDERS = [];

const ls = {
    get(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
    }
};

export function getDefaultSchedule() {
    return {};
}

export async function loadMachines() {
    if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('masine').select('*').order('type').order('code');
        if (!error && Array.isArray(data) && data.length) return normalizeMachines(data);
    }
    return ls.get('maropack_machines', DEFAULT_MACHINES);
}

export async function saveMachines(machines) {
    ls.set('maropack_machines', machines);
    if (isSupabaseConfigured && supabase) {
        const payload = machines.map(m => ({
            id: m.id, code: m.code, name: m.name, type: m.type, group_name: m.group,
            status: m.status, max_width: Number(m.maxWidth) || null, min_width: Number(m.minWidth) || null,
            max_diameter: Number(m.maxDiameter) || null, core: m.core, speed: Number(m.speed) || null,
            setup_min: Number(m.setupMin) || null, capabilities: m.capabilities || [], note: m.note || ''
        }));
        await supabase.from('masine').upsert(payload, { onConflict: 'id' });
    }
}

// Plan proizvodnje se čuva u BAZI (plan_proizvodnje, jedan red id=1) da bi bio isti na
// svim računarima i da ne nestaje na keš/redeploy. localStorage ostaje samo kao rezerva.
let _planVersion = 0;

export async function loadProductionPlan() {
    if (isSupabaseConfigured && supabase) {
        try {
            const { data, error } = await supabase.from('plan_proizvodnje').select('plan, version').eq('id', 1).maybeSingle();
            if (!error && data) {
                _planVersion = Number(data.version) || 0;
                const plan = data.plan || getDefaultSchedule();
                ls.set('maropack_production_plan', plan); // keš
                return plan;
            }
        } catch (e) { /* nema mreže → rezerva ispod */ }
    }
    return ls.get('maropack_production_plan', getDefaultSchedule());
}

export async function saveProductionPlan(plan) {
    ls.set('maropack_production_plan', plan); // uvek keširaj lokalno
    if (isSupabaseConfigured && supabase) {
        try {
            let email = null;
            try { const { data: { user } } = await supabase.auth.getUser(); email = (user && user.email) || null; } catch (e) { }
            // optimistički lock: upiši SAMO ako se verzija nije promenila u međuvremenu (da se ne pregazi tuđa izmena)
            const { data, error } = await supabase
                .from('plan_proizvodnje')
                .update({ plan, version: _planVersion + 1, updated_at: new Date().toISOString(), updated_by: email })
                .eq('id', 1).eq('version', _planVersion)
                .select('version');
            if (error) { await logTrace('production_plan_changed', { plan }); return { ok: true, offline: true }; }
            if (!data || data.length === 0) {
                return { ok: false, conflict: true }; // neko drugi je u međuvremenu izmenio plan
            }
            _planVersion = Number(data[0].version) || (_planVersion + 1);
            await logTrace('production_plan_changed', { plan });
            return { ok: true };
        } catch (e) {
            await logTrace('production_plan_changed', { plan });
            return { ok: true, offline: true };
        }
    }
    await logTrace('production_plan_changed', { plan });
    return { ok: true };
}

// Realtime: pozovi onChange(plan) kad bilo ko izmeni plan (da gledaoci vide odmah).
export function subscribeProductionPlan(onChange) {
    if (!(isSupabaseConfigured && supabase)) return () => { };
    const ch = supabase.channel('plan-proizvodnje-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_proizvodnje' }, (payload) => {
            try {
                const row = payload.new || {};
                _planVersion = Number(row.version) || _planVersion;
                if (row.plan) { ls.set('maropack_production_plan', row.plan); if (onChange) onChange(row.plan); }
            } catch (e) { }
        })
        .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch (e) { } };
}

export async function logTrace(event_type, payload = {}) {
    const record = { event_type, payload, created_at: new Date().toISOString() };
    const current = ls.get('maropack_traceability_log', []);
    ls.set('maropack_traceability_log', [record, ...current].slice(0, 500));
    if (isSupabaseConfigured && supabase) {
        try { await supabase.from('traceability_log').insert(record); } catch { }
    }
}

export function getTraceLog() {
    return ls.get('maropack_traceability_log', []);
}

export function normalizeMachines(data) {
    return data.map(m => ({
        id: m.id, code: m.code, name: m.name, type: m.type,
        group: m.group || m.group_name || machineGroup(m.type), status: m.status || 'aktivna',
        maxWidth: m.maxWidth ?? m.max_width ?? 0, minWidth: m.minWidth ?? m.min_width ?? 0,
        maxDiameter: m.maxDiameter ?? m.max_diameter ?? 0, core: m.core || '',
        speed: m.speed || 0, setupMin: m.setupMin ?? m.setup_min ?? 0,
        capabilities: Array.isArray(m.capabilities) ? m.capabilities : [], note: m.note || ''
    }));
}

export function machineGroup(type) {
    if (type === 'stampa') return 'Štamparije';
    if (type === 'rezanje') return 'Rezači';
    if (type === 'kese') return 'Mašine za kese';
    if (type === 'spulne') return 'Mašine za špulne';
    if (type === 'kasiranje') return 'Kaširanje';
    return 'Ostalo';
}

export function canMachineRun(machine, order) {
    if (!machine || !order) return { ok: false, reason: 'Nedostaje mašina ili nalog' };
    if (machine.status !== 'aktivna') return { ok: false, reason: 'Mašina nije aktivna' };
    if (machine.type !== order.type) return { ok: false, reason: `Nalog je za ${order.type}, mašina je ${machine.type}` };
    if (Number(order.width) > Number(machine.maxWidth || 0)) return { ok: false, reason: 'Širina naloga prelazi max širinu mašine' };
    if (Number(order.width) < Number(machine.minWidth || 0)) return { ok: false, reason: 'Širina naloga je ispod min širine mašine' };
    return { ok: true, reason: 'Kompatibilno' };
}

export function statusByKey(key) {
    return ORDER_STATUSES.find(s => s.key === key) || ORDER_STATUSES[0];
}