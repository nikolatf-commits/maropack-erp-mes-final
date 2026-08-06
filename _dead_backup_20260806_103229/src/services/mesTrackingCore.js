// MAROPACK MES Tracking Core
// Centralizuje radnike, smene, zastoje, skart, QC i traceability.

export const DEFAULT_WORKERS = [
  { id: 'RAD-001', ime: 'Operater 1', uloga: 'Rezač', qr: 'MARO-RAD-001', aktivan: true },
  { id: 'RAD-002', ime: 'Operater 2', uloga: 'Kese', qr: 'MARO-RAD-002', aktivan: true },
  { id: 'RAD-003', ime: 'Operater 3', uloga: 'Kaširanje', qr: 'MARO-RAD-003', aktivan: true },
  { id: 'RAD-004', ime: 'Operater 4', uloga: 'Špulne', qr: 'MARO-RAD-004', aktivan: true },
  { id: 'RAD-005', ime: 'Kontrola kvaliteta', uloga: 'QC', qr: 'MARO-RAD-005', aktivan: true }
];

export const STOP_REASONS = [
  'Podešavanje mašine',
  'Čekanje materijala',
  'Problem sa štampom',
  'Problem sa kaširanjem',
  'Promena noževa',
  'Čišćenje',
  'Kvar mašine',
  'Pauza',
  'Kontrola kvaliteta',
  'Ostalo'
];

export const QC_CHECKS = [
  { key: 'sirina', label: 'Širina trake', unit: 'mm', tolerance: '±1 mm' },
  { key: 'debljina', label: 'Debljina', unit: 'µ', tolerance: 'po specifikaciji' },
  { key: 'spoj', label: 'Spoj / delaminacija', unit: '', tolerance: 'bez greške' },
  { key: 'boja', label: 'Boja / otisak', unit: '', tolerance: 'odobren uzorak' },
  { key: 'perforacija', label: 'Perforacija', unit: '', tolerance: 'po nalogu' },
  { key: 'namotaj', label: 'Namotaj / smer', unit: '', tolerance: 'po MPTP' }
];

export function createMesEvent({ type, nalogId, machineId, workerId, payload = {} }) {
  return {
    id: `MES-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    nalog_id: nalogId || null,
    machine_id: machineId || null,
    worker_id: workerId || null,
    payload,
    created_at: new Date().toISOString()
  };
}

export function calculateWorkerKpi(events = []) {
  const byWorker = {};
  events.forEach(ev => {
    const id = ev.worker_id || 'NEPOZNATO';
    if (!byWorker[id]) {
      byWorker[id] = { worker_id: id, metara: 0, komada: 0, skart: 0, zastojiMin: 0, naloga: new Set(), dogadjaja: 0 };
    }
    byWorker[id].dogadjaja += 1;
    byWorker[id].metara += Number(ev.payload?.metara || 0);
    byWorker[id].komada += Number(ev.payload?.komada || 0);
    byWorker[id].skart += Number(ev.payload?.skart || 0);
    byWorker[id].zastojiMin += Number(ev.payload?.zastoj_min || 0);
    if (ev.nalog_id) byWorker[id].naloga.add(ev.nalog_id);
  });
  return Object.values(byWorker).map(r => ({ ...r, naloga: r.naloga.size }));
}

export function calculateMachineKpi(events = []) {
  const byMachine = {};
  events.forEach(ev => {
    const id = ev.machine_id || 'NEPOZNATO';
    if (!byMachine[id]) {
      byMachine[id] = { machine_id: id, metara: 0, komada: 0, skart: 0, zastojiMin: 0, qcFail: 0, dogadjaja: 0 };
    }
    byMachine[id].dogadjaja += 1;
    byMachine[id].metara += Number(ev.payload?.metara || 0);
    byMachine[id].komada += Number(ev.payload?.komada || 0);
    byMachine[id].skart += Number(ev.payload?.skart || 0);
    byMachine[id].zastojiMin += Number(ev.payload?.zastoj_min || 0);
    if (ev.type === 'qc_fail') byMachine[id].qcFail += 1;
  });
  return Object.values(byMachine);
}

export function buildTraceability({ nalog, rolls = [], events = [], qc = [] }) {
  return {
    nalog_id: nalog?.id || nalog?.broj || 'N/A',
    kupac: nalog?.kupac || '—',
    proizvod: nalog?.naziv || nalog?.proizvod || '—',
    rolne: rolls,
    dogadjaji: events.filter(e => !nalog?.id || e.nalog_id === nalog.id || e.nalog_id === nalog.broj),
    kontrola_kvaliteta: qc,
    generated_at: new Date().toISOString()
  };
}

export async function saveMesEvent({ supabase, event }) {
  if (!supabase?.from) return { data: event, error: null, local: true };
  const { data, error } = await supabase.from('mes_dogadjaji').insert(event).select().single();
  if (error) return { data: event, error, local: true };
  return { data, error: null, local: false };
}
