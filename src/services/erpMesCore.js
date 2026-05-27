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

export const DEMO_ORDERS = [
  { id: 'N-2451', title: 'Medomix Magnezijum 3g', customer: 'Medomix', type: 'rezanje', width: 840, meters: 22000, priority: 'visok', status: 'materijal_rezervisan', durationMin: 150 },
  { id: 'N-2452', title: 'Doypack 140x210', customer: 'Kupac A', type: 'kese', width: 420, meters: 12000, priority: 'normalan', status: 'priprema', durationMin: 210 },
  { id: 'N-2453', title: 'Špulne 20mm / 8000m', customer: 'Kupac B', type: 'spulne', width: 20, meters: 8000, priority: 'normalan', status: 'kreiran', durationMin: 180 },
  { id: 'N-2454', title: 'Triplex BOPP+ALU+CPP', customer: 'Kupac C', type: 'kasiranje', width: 755, meters: 18000, priority: 'hitno', status: 'spreman_stampa', durationMin: 260 },
  { id: 'N-2455', title: 'Rezanje PET 185mm', customer: 'Kupac D', type: 'rezanje', width: 185, meters: 30000, priority: 'normalan', status: 'priprema', durationMin: 120 }
];

const ls = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
};

export function getDefaultSchedule() {
  return {
    'rezac-1': ['N-2451'],
    'rezac-2': ['N-2455'],
    'kesa-1': ['N-2452'],
    'spulna-1': ['N-2453'],
    'kasirka-1': ['N-2454']
  };
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

export async function loadProductionPlan() {
  return ls.get('maropack_production_plan', getDefaultSchedule());
}

export async function saveProductionPlan(plan) {
  ls.set('maropack_production_plan', plan);
  await logTrace('production_plan_changed', { plan });
}

export async function logTrace(event_type, payload = {}) {
  const record = { event_type, payload, created_at: new Date().toISOString() };
  const current = ls.get('maropack_traceability_log', []);
  ls.set('maropack_traceability_log', [record, ...current].slice(0, 500));
  if (isSupabaseConfigured && supabase) {
    try { await supabase.from('traceability_log').insert(record); } catch {}
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
