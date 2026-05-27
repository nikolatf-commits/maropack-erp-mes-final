// Centralni AI Data Hub za Maropack
// AI ovde dobija kontekst iz svih ključnih tabela sistema.
// Namerno je tolerantno: ako tabela ne postoji, ne ruši aplikaciju nego vrati prazno.

import { supabase } from '../supabase.js';

const TABLES = [
  { key: 'proizvodi', label: 'Baza proizvoda', table: 'proizvodi', limit: 80, order: 'created_at' },
  { key: 'templatei', label: 'Template proizvoda', table: 'product_templates', limit: 80, order: 'created_at' },
  { key: 'materijali', label: 'Baza materijala', table: 'materijali', limit: 120, order: 'created_at' },
  { key: 'rolne', label: 'Magacin rolni', table: 'rolne', limit: 150, order: 'created_at', fallback: 'magacin' },
  { key: 'magacin', label: 'Magacin / materijali', table: 'magacin', limit: 150, order: 'created_at' },
  { key: 'ponude', label: 'Ponude', table: 'ponude', limit: 80, order: 'created_at' },
  { key: 'kalkulacije_folije', label: 'Kalkulacije folije', table: 'kalkulacije_folije', limit: 80, order: 'created_at' },
  { key: 'kalkulacije_kese', label: 'Kalkulacije kese', table: 'kalkulacije_kese', limit: 80, order: 'created_at' },
  { key: 'kalkulacije_spulne', label: 'Kalkulacije špulne', table: 'kalkulacije_spulne', limit: 80, order: 'created_at' },
  { key: 'nalozi', label: 'Nalozi', table: 'nalozi', limit: 100, order: 'created_at' },
  { key: 'master_nalozi', label: 'Glavni nalozi', table: 'master_nalozi', limit: 100, order: 'created_at' },
  { key: 'nalozi_materijal', label: 'Nalozi materijal', table: 'nalozi_materijal', limit: 100, order: 'created_at' },
  { key: 'operacije_naloga', label: 'Operacije naloga', table: 'operacije_naloga', limit: 120, order: 'created_at' },
  { key: 'faze_proizvodnje', label: 'Faze proizvodnje', table: 'faze_proizvodnje', limit: 120, order: 'created_at' },
  { key: 'production_sessions', label: 'Radne sesije proizvodnje', table: 'production_sessions', limit: 120, order: 'created_at' },
  { key: 'mobile_production_sessions', label: 'Mobilne proizvodne sesije', table: 'mobile_production_sessions', limit: 120, order: 'created_at' },
  { key: 'planovi_rezanja', label: 'Planovi rezanja', table: 'planovi_rezanja', limit: 100, order: 'created_at' },
  { key: 'planovi_secenja', label: 'Planovi sečenja', table: 'planovi_secenja', limit: 100, order: 'created_at' },
  { key: 'potrosnja_materijala', label: 'Potrošnja materijala', table: 'potrosnja_materijala', limit: 150, order: 'created_at' },
  { key: 'analiza_potrosnje_materijala', label: 'Analiza potrošnje materijala', table: 'analiza_potrosnje_materijala', limit: 100, order: 'created_at' },
  { key: 'masine', label: 'Mašine', table: 'masine', limit: 100, order: 'created_at' },
  { key: 'radnici', label: 'Radnici', table: 'radnici', limit: 100, order: 'created_at' },
  { key: 'kontrola_kvaliteta', label: 'Kontrola kvaliteta', table: 'kontrola_kvaliteta', limit: 100, order: 'created_at' },
  { key: 'ai_akcije', label: 'AI akcije / predlozi', table: 'ai_akcije', limit: 80, order: 'created_at' },
  { key: 'raspored_masina', label: 'Raspored mašina', table: 'raspored_masina', limit: 120, order: 'created_at' },
  { key: 'statusi_naloga', label: 'Statusi naloga', table: 'statusi_naloga', limit: 120, order: 'created_at' },
  { key: 'audit_log', label: 'Audit log', table: 'audit_log', limit: 60, order: 'created_at' }
];

function safeArray(data) {
  return Array.isArray(data) ? data : [];
}

function compactRow(row) {
  if (!row || typeof row !== 'object') return row;
  const clone = { ...row };
  for (const k of Object.keys(clone)) {
    if (clone[k] === null || clone[k] === undefined || clone[k] === '') delete clone[k];
    if (typeof clone[k] === 'string' && clone[k].length > 800) clone[k] = clone[k].slice(0, 800) + '...';
  }
  return clone;
}

async function fetchTable(def) {
  try {
    let q = supabase.from(def.table).select('*');
    if (def.order) q = q.order(def.order, { ascending: false });
    if (def.limit && typeof q.limit === 'function') q = q.limit(def.limit);
    const { data, error } = await q;
    if (error && def.fallback) return fetchTable({ ...def, table: def.fallback, fallback: null });
    if (error) return { key: def.key, label: def.label, table: def.table, data: [], error: error.message || String(error) };
    return { key: def.key, label: def.label, table: def.table, data: safeArray(data).map(compactRow), error: null };
  } catch (err) {
    if (def.fallback) return fetchTable({ ...def, table: def.fallback, fallback: null });
    return { key: def.key, label: def.label, table: def.table, data: [], error: err.message || String(err) };
  }
}

export async function fetchAIContext() {
  const results = await Promise.all(TABLES.map(fetchTable));
  const context = {};
  const tableStatus = [];

  for (const r of results) {
    context[r.key] = r.data;
    tableStatus.push({ key: r.key, label: r.label, table: r.table, count: r.data.length, error: r.error });
  }

  const summary = buildBusinessSummary(context, tableStatus);
  return { context, tableStatus, summary, generatedAt: new Date().toISOString() };
}

export function buildBusinessSummary(ctx, tableStatus = []) {
  const rolne = [...safeArray(ctx.rolne), ...safeArray(ctx.magacin)];
  const nalozi = [...safeArray(ctx.nalozi), ...safeArray(ctx.master_nalozi)];
  const ponude = safeArray(ctx.ponude);
  const proizvodi = safeArray(ctx.proizvodi);
  const potrosnja = [...safeArray(ctx.potrosnja_materijala), ...safeArray(ctx.analiza_potrosnje_materijala)];

  const sum = (arr, keys) => arr.reduce((a, r) => {
    for (const k of keys) {
      const v = Number(r?.[k]);
      if (Number.isFinite(v)) return a + v;
    }
    return a;
  }, 0);

  const byMaterial = {};
  for (const r of rolne) {
    const mat = String(r.tip || r.materijal || r.vrsta || r.naziv || 'NEPOZNATO').toUpperCase();
    byMaterial[mat] = byMaterial[mat] || { rolni: 0, metara: 0, kg: 0 };
    byMaterial[mat].rolni += 1;
    byMaterial[mat].metara += Number(r.metara || r.duzina || r.ostatak_m || r.ostalo_m || 0) || 0;
    byMaterial[mat].kg += Number(r.kg || r.neto_kg || r.tezina || 0) || 0;
  }

  const activeOrders = nalozi.filter(n => !['zavrseno', 'zatvoreno', 'otkazano', 'isporuceno'].includes(String(n.status || '').toLowerCase()));
  const connectedTables = tableStatus.filter(t => !t.error && t.count > 0).length;
  const missingTables = tableStatus.filter(t => t.error).map(t => `${t.table}: ${t.error}`);

  return {
    povezane_tabele_sa_podacima: connectedTables,
    greske_tabela: missingTables,
    broj_proizvoda: proizvodi.length,
    broj_ponuda: ponude.length,
    broj_naloga: nalozi.length,
    aktivni_nalozi: activeOrders.length,
    rolni_u_magacinu: rolne.length,
    ukupno_metara_magacin: Math.round(sum(rolne, ['metara', 'duzina', 'ostatak_m', 'ostalo_m'])),
    ukupno_kg_magacin: Math.round(sum(rolne, ['kg', 'neto_kg', 'tezina'])),
    zapisa_potrosnje: potrosnja.length,
    magacin_po_materijalu: byMaterial
  };
}

export function buildAIPrompt(userQuestion, aiData) {
  const maxRowsPerTable = 35;
  const compactContext = {};
  for (const [key, rows] of Object.entries(aiData.context || {})) {
    if (Array.isArray(rows) && rows.length) compactContext[key] = rows.slice(0, maxRowsPerTable);
  }

  return `Ti si centralni AI asistent za MAROPACK ERP/MES sistem fleksibilne ambalaže.

Odgovaraj na srpskom jeziku, jasno, poslovno i konkretno.
Ne izmišljaj podatke. Ako tabela nema podatke ili je veza nepotpuna, jasno reci šta nedostaje.
Kada daješ predlog za proizvodnju, rezanje ili nabavku, objasni logiku: materijal, širina, metraža, otpad, rizik i sledeći korak.
Ne menjaj bazu samostalno. Za akcije reci šta treba kliknuti ili šta sistem treba da uradi.

PITANJE KORISNIKA:
${userQuestion}

KRATAK BUSINESS SUMMARY:
${JSON.stringify(aiData.summary, null, 2)}

STATUS TABELA:
${JSON.stringify(aiData.tableStatus, null, 2)}

PODACI IZ SISTEMA, skraćeno po tabelama:
${JSON.stringify(compactContext, null, 2)}

ZADATAK:
1. Odgovori direktno na pitanje.
2. Ako možeš, izvuci zaključke iz tabela.
3. Ako vidiš problem u podacima, napiši upozorenje.
4. Ako je pitanje o kalkulaciji/nalogu/rezanju/magacinu, predloži sledeći praktičan korak.`;
}

export async function saveAIInteraction({ question, answer, summary }) {
  try {
    const { error } = await supabase.from('ai_interakcije').insert({
      pitanje: question,
      odgovor: answer,
      summary,
      created_at: new Date().toISOString()
    });
    return { error };
  } catch (err) {
    return { error: err };
  }
}

export const AI_TABLES = TABLES;
