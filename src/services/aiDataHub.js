// Centralni AI Data Hub za Maropack
// AI ovde dobija kontekst iz svih ključnih tabela sistema.
// Namerno je tolerantno: ako tabela ne postoji, ne ruši aplikaciju nego vrati prazno.

import { supabase } from '../supabase.js';

const TABLES = [
    // --- Proizvodi / templejti / materijali (AI uči odavde) ---
    { key: 'proizvodi', label: 'Baza proizvoda (templejti)', table: 'proizvodi', limit: 120, order: 'created_at', fallback: 'product_templates' },
    { key: 'material_master', label: 'Baza materijala', table: 'material_master', limit: 200, order: 'created_at', fallback: 'materijali' },
    { key: 'material_cene', label: 'Cene materijala', table: 'material_cene', limit: 200, order: 'created_at' },
    { key: 'material_vrste', label: 'Vrste materijala', table: 'material_vrste', limit: 100, order: 'created_at' },
    // --- Magacin ---
    { key: 'magacin', label: 'Magacin rolni', table: 'magacin', limit: 300, order: 'created_at', fallback: 'rolne' },
    { key: 'magacin_gotovi', label: 'Magacin gotovih proizvoda', table: 'magacin_gotovi_proizvodi', limit: 200, order: 'created_at' },
    { key: 'istorija_lokacija', label: 'Istorija lokacija rolni', table: 'istorija_lokacija_rolni', limit: 150, order: 'created_at' },
    // --- Kalkulacije i ponude ---
    { key: 'kalkulacije', label: 'Kalkulacije', table: 'kalkulacije', limit: 120, order: 'created_at' },
    { key: 'kalkulacije_folije', label: 'Kalkulacije folije', table: 'kalkulacije_folije', limit: 80, order: 'created_at' },
    { key: 'kalkulacije_kese', label: 'Kalkulacije kese', table: 'kalkulacije_kese', limit: 80, order: 'created_at' },
    { key: 'kalkulacije_spulne', label: 'Kalkulacije špulne', table: 'kalkulacije_spulne', limit: 80, order: 'created_at' },
    { key: 'ponude', label: 'Ponude', table: 'ponude', limit: 120, order: 'created_at' },
    // --- Nalozi (sadašnja šema) ---
    { key: 'radni_nalozi', label: 'Glavni (radni) nalozi', table: 'radni_nalozi', limit: 150, order: 'created_at', fallback: 'master_nalozi' },
    { key: 'operativni_nalozi', label: 'Operativni nalozi (operacije)', table: 'operativni_nalozi', limit: 250, order: 'created_at', fallback: 'nalozi_materijal' },
    { key: 'nalozi_stari', label: 'Nalozi (stari tok)', table: 'nalozi', limit: 120, order: 'created_at' },
    // --- Proizvodnja / MES ---
    { key: 'faze_proizvodnje', label: 'Faze proizvodnje', table: 'faze_proizvodnje', limit: 200, order: 'created_at' },
    { key: 'zastoji', label: 'Zastoji', table: 'zastoji', limit: 120, order: 'created_at', fallback: 'nalog_zastoji' },
    { key: 'masine', label: 'Mašine', table: 'masine', limit: 100, order: 'created_at' },
    { key: 'radnici', label: 'Radnici', table: 'radnici', limit: 100, order: 'created_at' },
    // --- AI memorija ---
    { key: 'ai_akcije', label: 'AI akcije / predlozi', table: 'ai_akcije', limit: 80, order: 'created_at' },
    { key: 'ai_interakcije', label: 'AI interakcije (učenje)', table: 'ai_interakcije', limit: 120, order: 'created_at' }
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
        if (error) {
            // 1) ako order kolona ne postoji — probaj bez sortiranja
            if (def.order) {
                const retry = await supabase.from(def.table).select('*').limit(def.limit || 100);
                if (!retry.error) return { key: def.key, label: def.label, table: def.table, data: safeArray(retry.data).map(compactRow), error: null };
            }
            // 2) fallback na alternativni naziv tabele
            if (def.fallback) return fetchTable({ ...def, table: def.fallback, fallback: null, order: null });
            return { key: def.key, label: def.label, table: def.table, data: [], error: error.message || String(error) };
        }
        return { key: def.key, label: def.label, table: def.table, data: safeArray(data).map(compactRow), error: null };
    } catch (err) {
        if (def.fallback) return fetchTable({ ...def, table: def.fallback, fallback: null, order: null });
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

    // Aliasi: stara logika čita rolne/nalozi/master_nalozi/materijali/templatei
    context.rolne = context.rolne || context.magacin || [];
    context.materijali = context.material_master || [];
    context.templatei = context.proizvodi || [];
    context.master_nalozi = context.radni_nalozi || [];
    context.nalozi = [...safeArray(context.nalozi_stari), ...safeArray(context.operativni_nalozi)];

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