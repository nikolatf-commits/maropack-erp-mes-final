// MAROPACK FAZA 3 — AI Agent Core
// Centralni AI agent koji koristi AI Data Hub i pravi akcione predloge kroz ERP/MES tok.
// Ne menja bazu samostalno bez potvrde korisnika. Vraća plan akcije koji UI prikazuje i može da potvrdi.

import { fetchAIContext, buildAIPrompt, saveAIInteraction } from './aiDataHub.js';
import { supabase } from '../supabase.js';

const norm = (v) => String(v ?? '').toLowerCase().trim();
const n = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

function arr(v) { return Array.isArray(v) ? v : []; }
function pick(obj, keys, fallback = '') {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return fallback;
}

export const AI_AGENT_INTENTS = [
  { key: 'napravi_nalog', label: 'Kreiranje naloga', words: ['napravi nalog', 'kreiraj nalog', 'otvori nalog', 'radni nalog'] },
  { key: 'plan_rezanja', label: 'Plan rezanja', words: ['plan rezanja', 'rezanje', 'iz magacina', 'koju rolnu', 'rolne'] },
  { key: 'rezervisi_materijal', label: 'Rezervacija materijala', words: ['rezerviši', 'rezervisi', 'rezervacija', 'materijal za nalog'] },
  { key: 'plan_proizvodnje', label: 'Plan proizvodnje', words: ['plan proizvodnje', 'raspored', 'mašina', 'masina', 'scheduler', 'gantt'] },
  { key: 'analiza_otpada', label: 'Analiza otpada', words: ['otpad', 'iskorišćenost', 'iskoriscenost', 'gubitak', 'idealna širina', 'idealna sirina'] },
  { key: 'nabavka', label: 'Nabavka', words: ['nabavka', 'poruči', 'poruci', 'nedostaje', 'minimum', 'zaliha'] },
  { key: 'kalkulacija', label: 'Kalkulacija', words: ['kalkulacija', 'cena', 'ponuda', 'marža', 'marza'] },
  { key: 'qc', label: 'Kontrola kvaliteta', words: ['qc', 'kvalitet', 'reklamacija', 'kontrola', 'problem'] }
];

export function detectIntent(question = '') {
  const q = norm(question);
  const scored = AI_AGENT_INTENTS.map((intent) => ({
    ...intent,
    score: intent.words.reduce((s, w) => s + (q.includes(w) ? 1 : 0), 0)
  })).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0] : { key: 'opsti_upit', label: 'Opšti upit', score: 0 };
}

export function extractNumbers(question = '') {
  const widths = [];
  const meters = [];
  const kg = [];
  const q = String(question || '');
  for (const m of q.matchAll(/(\d+(?:[.,]\d+)?)\s*(mm|milimetara|sirina|širina)/gi)) widths.push(Number(m[1].replace(',', '.')));
  for (const m of q.matchAll(/(\d+(?:[.,]\d+)?)\s*(m|metara)/gi)) meters.push(Number(m[1].replace(',', '.')));
  for (const m of q.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|kilograma)/gi)) kg.push(Number(m[1].replace(',', '.')));
  return { widths, meters, kg };
}

function findMatchingProducts(question, ctx) {
  const q = norm(question);
  return arr(ctx.proizvodi).concat(arr(ctx.templatei)).filter((p) => {
    const hay = norm([p.naziv, p.name, p.sifra, p.kupac, p.tip, p.tip_proizvoda].join(' '));
    return hay && hay.split(/\s+/).some((w) => w.length > 3 && q.includes(w));
  }).slice(0, 8);
}

function summarizeWarehouse(ctx) {
  const rolne = [...arr(ctx.rolne), ...arr(ctx.magacin)];
  const byMat = {};
  for (const r of rolne) {
    const mat = String(pick(r, ['tip', 'materijal', 'vrsta', 'naziv'], 'NEPOZNATO')).toUpperCase();
    const width = n(pick(r, ['sirina', 'width_mm', 'sirina_mm'], 0));
    const key = `${mat} ${width ? width + 'mm' : ''}`.trim();
    byMat[key] = byMat[key] || { materijal: mat, sirina: width, rolni: 0, metara: 0, kg: 0, rows: [] };
    byMat[key].rolni += 1;
    byMat[key].metara += n(pick(r, ['metara', 'duzina', 'ostatak_m', 'ostalo_m'], 0));
    byMat[key].kg += n(pick(r, ['kg', 'neto_kg', 'tezina'], 0));
    byMat[key].rows.push(r);
  }
  return Object.values(byMat).sort((a, b) => b.metara - a.metara);
}

function proposeCuttingPlan(question, ctx) {
  const { widths, meters } = extractNumbers(question);
  const targetWidth = widths[0] || 0;
  const targetMeters = meters[0] || 0;
  const rolls = [...arr(ctx.rolne), ...arr(ctx.magacin)]
    .map((r) => ({
      raw: r,
      id: pick(r, ['id', 'br_rolne', 'broj_rolne', 'oznaka'], 'ROLNA'),
      materijal: pick(r, ['tip', 'materijal', 'vrsta', 'naziv'], 'Materijal'),
      sirina: n(pick(r, ['sirina', 'width_mm', 'sirina_mm'], 0)),
      metara: n(pick(r, ['metara', 'duzina', 'ostatak_m', 'ostalo_m'], 0)),
      kg: n(pick(r, ['kg', 'neto_kg', 'tezina'], 0)),
      status: pick(r, ['status'], 'na stanju')
    }))
    .filter((r) => !targetWidth || r.sirina >= targetWidth)
    .sort((a, b) => (a.sirina - b.sirina) || (b.metara - a.metara));

  const selected = [];
  let remaining = targetMeters;
  for (const r of rolls) {
    if (targetMeters && remaining <= 0) break;
    const useM = targetMeters ? Math.min(r.metara, remaining) : r.metara;
    selected.push({
      roll: r,
      koristi_m: useM,
      otpad_mm: targetWidth ? Math.max(0, r.sirina - targetWidth) : 0,
      ostatak_m: Math.max(0, r.metara - useM),
      nova_rolna_ostatak: Math.max(0, r.metara - useM) > 0
    });
    remaining -= useM;
  }

  const totalM = selected.reduce((s, x) => s + x.koristi_m, 0);
  const avgWaste = selected.length ? selected.reduce((s, x) => s + x.otpad_mm, 0) / selected.length : 0;
  return { targetWidth, targetMeters, selected, totalM, remaining: Math.max(0, remaining), avgWaste };
}

function proposeMachineSchedule(question, ctx) {
  const machines = arr(ctx.masine);
  const orders = [...arr(ctx.nalozi), ...arr(ctx.master_nalozi)].filter((o) => !['zavrsen', 'zavrseno', 'isporucen', 'isporuceno'].includes(norm(o.status)));
  const groups = machines.reduce((acc, m) => {
    const type = pick(m, ['tip', 'type', 'kategorija'], 'ostalo');
    acc[type] = acc[type] || [];
    acc[type].push(m);
    return acc;
  }, {});
  const plan = orders.slice(0, 12).map((o, idx) => {
    const tip = norm(pick(o, ['tip_proizvoda', 'tip', 'vrsta'], ''));
    const prefer = tip.includes('kesa') ? 'kese' : tip.includes('spul') ? 'spulne' : tip.includes('kas') ? 'kasiranje' : tip.includes('rez') ? 'rezanje' : 'rezanje';
    const machine = (groups[prefer] || groups[Object.keys(groups)[0]] || [])[idx % ((groups[prefer] || groups[Object.keys(groups)[0]] || []).length || 1)] || null;
    return { order: o, machine, procenjeno_h: 2 + (idx % 4), status: machine ? 'predlog' : 'nema_masine' };
  });
  return { machines, orders, plan };
}

function buildRuleBasedAnswer(question, aiData) {
  const ctx = aiData.context || {};
  const intent = detectIntent(question);
  const products = findMatchingProducts(question, ctx);
  const warehouse = summarizeWarehouse(ctx);
  const cutting = proposeCuttingPlan(question, ctx);
  const schedule = proposeMachineSchedule(question, ctx);

  const actions = [];
  const warnings = [];
  const insights = [];

  if (products.length) insights.push(`Našao sam ${products.length} mogućih proizvoda/template-a koji odgovaraju upitu.`);
  if (warehouse.length) insights.push(`Magacin ima ${warehouse.length} grupa materijala/širina sa ukupnim stanjem.`);
  if (aiData.summary?.greske_tabela?.length) warnings.push('Neke tabele nisu dostupne ili još nisu kreirane u Supabase-u. Sistem radi fallback, ali za 100% rad treba pokrenuti SQL dopune.');

  if (intent.key === 'plan_rezanja' || intent.key === 'rezervisi_materijal' || intent.key === 'napravi_nalog') {
    if (cutting.selected.length) {
      actions.push({
        type: 'PLAN_REZANJA',
        title: 'Predlog plana rezanja iz magacina',
        payload: cutting,
        next: ['Proveri izabrane rolne', 'Klikni Prihvati plan', 'Sistem skida metražu i pravi QR za ostatak']
      });
    } else {
      warnings.push('Nisam našao odgovarajuće rolne za automatski plan rezanja. Proveri širinu, metražu i magacin.');
    }
  }

  if (intent.key === 'plan_proizvodnje' || intent.key === 'napravi_nalog') {
    actions.push({
      type: 'PLAN_PROIZVODNJE',
      title: 'Predlog rasporeda po mašinama',
      payload: schedule.plan,
      next: ['Proveri kompatibilnost mašina', 'Prevuci naloge u scheduler-u', 'Zaključaj plan proizvodnje']
    });
  }

  if (intent.key === 'nabavka') {
    const low = warehouse.filter((g) => g.metara < 10000 || g.kg < 200).slice(0, 10);
    actions.push({ type: 'NABAVKA', title: 'Materijali za proveru/nabavku', payload: low, next: ['Proveri minimalne zalihe', 'Napravi predlog porudžbine'] });
  }

  if (intent.key === 'analiza_otpada') {
    const waste = arr(ctx.analiza_potrosnje_materijala).concat(arr(ctx.potrosnja_materijala)).slice(0, 30);
    actions.push({ type: 'ANALIZA_OTPADA', title: 'Analiza otpada iz istorije', payload: waste, next: ['Sortiraj po najvećem otpadu', 'Predloži idealne širine', 'Poveži sa nabavkom'] });
  }

  const answerLines = [];
  answerLines.push(`Prepoznao sam zahtev kao: ${intent.label}.`);
  if (products.length) answerLines.push(`Najbliži proizvodi/template-i: ${products.map((p) => pick(p, ['naziv', 'name', 'sifra'], 'Proizvod')).join(', ')}.`);
  if (cutting.selected.length && (intent.key === 'plan_rezanja' || intent.key === 'rezervisi_materijal' || intent.key === 'napravi_nalog')) {
    answerLines.push(`Za rezanje predlažem ${cutting.selected.length} rolnu/rolni, ukupno ${Math.round(cutting.totalM).toLocaleString('sr-RS')} m, prosečan otpad širine ${cutting.avgWaste.toFixed(1)} mm.`);
    if (cutting.remaining > 0) answerLines.push(`Nedostaje još ${Math.round(cutting.remaining).toLocaleString('sr-RS')} m za pun zahtev.`);
  }
  if (schedule.plan.length && (intent.key === 'plan_proizvodnje' || intent.key === 'napravi_nalog')) {
    answerLines.push(`Za proizvodnju imam ${schedule.plan.length} predloga rasporeda po mašinama.`);
  }
  if (!actions.length) answerLines.push('Mogu da dam analizu iz povezanih tabela, ali za izvršnu akciju treba precizirati: proizvod/kupac, količinu, širinu, metražu i tip operacije.');

  return { intent, answer: answerLines.join('\n'), insights, warnings, actions, products, warehouse: warehouse.slice(0, 15) };
}

export async function runAIAgent(question, options = {}) {
  const aiData = await fetchAIContext();
  const rule = buildRuleBasedAnswer(question, aiData);
  const prompt = buildAIPrompt(question, aiData);
  const result = {
    question,
    generatedAt: new Date().toISOString(),
    prompt,
    ...rule,
    tableStatus: aiData.tableStatus,
    summary: aiData.summary
  };
  if (options.save !== false) {
    await saveAIInteraction({ question, answer: rule.answer, summary: { intent: rule.intent, actions: rule.actions?.map((a) => a.type), summary: aiData.summary } });
  }
  return result;
}

export async function executeAIAgentAction(action, user = 'system') {
  if (!action?.type) return { ok: false, message: 'Nema akcije za izvršenje.' };
  const now = new Date().toISOString();
  try {
    const row = {
      tip: action.type,
      naziv: action.title || action.type,
      payload: action.payload || {},
      status: 'predlog_ai',
      korisnik: user,
      created_at: now
    };
    const { error } = await supabase.from('ai_akcije').insert(row);
    if (error) return { ok: false, message: error.message || String(error) };
    return { ok: true, message: 'AI akcija je sačuvana kao predlog za potvrdu.' };
  } catch (err) {
    return { ok: false, message: err.message || String(err) };
  }
}
