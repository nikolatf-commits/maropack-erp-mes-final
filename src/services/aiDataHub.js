// Centralni AI Data Hub za Maropack
// AI ovde dobija kontekst iz svih ključnih tabela sistema.
// Namerno je tolerantno: ako tabela ne postoji, ne ruši aplikaciju nego vrati prazno.

import { supabase } from '../supabase.js';

const TABLES = [
    // --- Proizvodi / templejti / materijali (AI uči odavde) ---
    { key: 'proizvodi', label: 'Baza proizvoda (templejti)', table: 'proizvodi', limit: 2000, order: 'created_at', fallback: 'product_templates' },
    { key: 'material_master', label: 'Baza materijala', table: 'material_master', limit: 200, order: 'created_at', fallback: 'materijali' },
    { key: 'material_cene', label: 'Cene materijala', table: 'material_cene', limit: 200, order: 'created_at' },
    { key: 'material_vrste', label: 'Vrste materijala', table: 'material_vrste', limit: 100, order: 'created_at' },
    // --- Magacin ---
    { key: 'magacin', label: 'Magacin rolni', table: 'magacin', limit: 20000, order: 'created_at', fallback: 'rolne' },
    { key: 'magacin_gotovi', label: 'Magacin gotovih proizvoda', table: 'magacin_gotovi_proizvodi', limit: 200, order: 'created_at' },
    { key: 'istorija_lokacija', label: 'Istorija lokacija rolni', table: 'istorija_lokacija_rolni', limit: 150, order: 'created_at' },
    { key: 'materijal_stavke', label: 'Knjiga stavki materijala (rezervacije/izdavanja po nalogu)', table: 'materijal_stavke', limit: 400, order: 'created_at' },
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
        // Velike tabele (limit > 1000): učitaj paginacijom, jer Supabase seče na 1000 redova.
        if (def.limit && def.limit > 1000) {
            let sve = [];
            const PAGE = 1000;
            const maxOd = def.limit;
            for (let od = 0; od < maxOd; od += PAGE) {
                let pq = supabase.from(def.table).select('*');
                if (def.order) pq = pq.order(def.order, { ascending: false });
                const { data, error } = await pq.range(od, od + PAGE - 1);
                if (error) {
                    // ako order kolona ne postoji, probaj bez sortiranja
                    if (def.order) {
                        const r2 = await supabase.from(def.table).select('*').range(od, od + PAGE - 1);
                        if (r2.error) { if (def.fallback) return fetchTable({ ...def, table: def.fallback, fallback: null, order: null }); break; }
                        if (!r2.data || !r2.data.length) break;
                        sve = sve.concat(r2.data);
                        if (r2.data.length < PAGE) break;
                        continue;
                    }
                    if (def.fallback) return fetchTable({ ...def, table: def.fallback, fallback: null, order: null });
                    break;
                }
                if (!data || !data.length) break;
                sve = sve.concat(data);
                if (data.length < PAGE) break;
            }
            return { key: def.key, label: def.label, table: def.table, data: safeArray(sve).map(compactRow), error: null };
        }
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

    // Aliasi za staru logiku — BEZ dupliranja (potrošači rade [...rolne, ...magacin] itd.)
    context.rolne = [];                               // magacin je glavni izvor; prazno da se ne broji dvaput
    context.materijali = context.material_master || [];
    context.templatei = [];                           // proizvodi je glavni; prazno da se ne broji dvaput
    context.master_nalozi = context.radni_nalozi || [];
    context.nalozi = safeArray(context.nalozi_stari); // operativni se ne broje kao posebni nalozi
    context.potrosnja_materijala = context.materijal_stavke || []; // summary broji zapise potrošnje odavde

    const summary = buildBusinessSummary(context, tableStatus);
    return { context, tableStatus, summary, generatedAt: new Date().toISOString() };
}

export function buildBusinessSummary(ctx, tableStatus = []) {
    const INACTIVE = ['prodat', 'utros', 'iskoris', 'isporu', 'storn', 'otpis', 'obrisan', 'arhiv'];
    const isActive = (r) => { const s = String(r?.status || '').toLowerCase(); return !INACTIVE.some(x => s.includes(x)); };
    const rolne = [...safeArray(ctx.rolne), ...safeArray(ctx.magacin)].filter(isActive);
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
        byMaterial[mat].metara += Number(r.metraza_ost || r.metraza || r.metara || r.duzina || r.ostatak_m || r.ostalo_m || 0) || 0;
        byMaterial[mat].kg += Number(r.kg_neto || r.kg_bruto || r.kg || r.neto_kg || r.tezina || 0) || 0;
    }

    // POTROŠNJA po materijalu: iskorišćene rolne (kao ekran "Analiza materijala").
    // Grupisano detaljno (vrsta·oznaka·debljina·širina) + ukupno, metri i kg.
    const POTROSENE_ST = ['iskorišćeno', 'iskorisceno', 'potrošena', 'potrosena', 'potroseno', 'potrošeno', 'used'];
    const svePotrosene = [...safeArray(ctx.rolne), ...safeArray(ctx.magacin)].filter(r => POTROSENE_ST.includes(String(r?.status || '').trim().toLowerCase()));
    const potrosnjaPoMat = {};
    let potrUkM = 0, potrUkKg = 0;
    // pomoć za period: koliko je potrošeno u zadnjih 30 / 90 dana (po datumu promene statusa)
    const now = Date.now();
    const per = { d30: { m: 0, kg: 0 }, d90: { m: 0, kg: 0 }, ukupno: { m: 0, kg: 0 } };
    for (const r of svePotrosene) {
        const vrsta = String(r.vrsta || r.tip || 'NEPOZNATO').toUpperCase();
        const podVrsta = r.pod_vrsta || r.podvrsta || '';
        const oznaka = r.oznaka_materijala || r.oznaka || '';
        const deb = Number(r.debljina || r.deb || 0);
        const sir = Number(r.sirina || 0);
        const proizvodjac = r.dobavljac || r.proizvodjac || r.proizvođač || '';
        const kljuc = [vrsta, podVrsta, oznaka, deb ? deb + 'µ' : '', sir ? sir + 'mm' : '', proizvodjac].filter(Boolean).join(' · ');
        const m = Number(r.metraza || r.metraza_ost || 0) || 0;
        const kg = Number(r.kg_neto || r.kg_bruto || r.kg || 0) || 0;
        potrosnjaPoMat[kljuc] = potrosnjaPoMat[kljuc] || { vrsta, pod_vrsta: podVrsta, oznaka, debljina: deb, sirina: sir, proizvodjac, rolni: 0, metara: 0, kg: 0 };
        potrosnjaPoMat[kljuc].rolni += 1;
        potrosnjaPoMat[kljuc].metara += m;
        potrosnjaPoMat[kljuc].kg += kg;
        potrUkM += m; potrUkKg += kg;
        // period
        const ts = new Date(r.updated_at || r.datum_promene || r.datum || r.created_at || 0).getTime();
        per.ukupno.m += m; per.ukupno.kg += kg;
        if (ts) {
            const dana = (now - ts) / 86400000;
            if (dana <= 30) { per.d30.m += m; per.d30.kg += kg; }
            if (dana <= 90) { per.d90.m += m; per.d90.kg += kg; }
        }
    }
    // zaokruži
    Object.values(potrosnjaPoMat).forEach(x => { x.metara = Math.round(x.metara); x.kg = Math.round(x.kg * 10) / 10; });
    ['d30', 'd90', 'ukupno'].forEach(k => { per[k].m = Math.round(per[k].m); per[k].kg = Math.round(per[k].kg * 10) / 10; });

    const activeOrders = nalozi.filter(n => !['zavrseno', 'zatvoreno', 'otkazano', 'isporuceno'].includes(String(n.status || '').toLowerCase()));

    // PROIZVODI PO SVRSI: za AI upite "treba mi folija/materijal za X" (posuda PE, duplex za sir...).
    // Izvlači svrhu iz templejta + sastav slojeva (duplex/triplex po broju slojeva).
    const proizvodiSvrha = [];
    for (const p of proizvodi) {
        const t = p.res?.template || p.data || p.template || p || {};
        const svrha = t.svrha || p.svrha || '';
        const tip = p.tip || t.type || '';
        // slojevi (za sastav i duplex/triplex/kvadriplex)
        const sek = t[tip] || t.folija || t.kesa || t.spulna || {};
        const layers = sek.layers || t.layers || [];
        const brSlojeva = Array.isArray(layers) ? layers.length : 0;
        const laminat = brSlojeva >= 4 ? 'kvadriplex' : brSlojeva === 3 ? 'triplex' : brSlojeva === 2 ? 'duplex' : brSlojeva === 1 ? 'monofilm' : '';
        const sastav = (Array.isArray(layers) ? layers : []).map(l => {
            const v = l.vrsta || l.material || '';
            const o = l.oznaka_materijala || l.oznaka || '';
            const d = l.debljina || l.deb || '';
            return [v, o, d ? d + 'µ' : ''].filter(Boolean).join(' ');
        }).filter(Boolean);
        if (svrha || sastav.length) {
            proizvodiSvrha.push({
                naziv: p.naziv || t.naziv || '',
                kupac: p.kupac || '',
                tip,
                svrha,
                laminat,             // duplex/triplex/kvadriplex/monofilm
                broj_slojeva: brSlojeva,
                sastav,              // niz slojeva ["BOPP FXC 20µ", "PET 12µ"...]
                idealna_sirina: p.sir || t.idealnaSirinaMaterijala || null,
            });
        }
    }

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
        ukupno_metara_magacin: Math.round(sum(rolne, ['metraza_ost', 'metraza', 'metara', 'duzina', 'ostatak_m', 'ostalo_m'])),
        ukupno_kg_magacin: Math.round(sum(rolne, ['kg_neto', 'kg_bruto', 'kg', 'neto_kg', 'tezina'])),
        zapisa_potrosnje: potrosnja.length,
        magacin_po_materijalu: byMaterial,
        // POTROŠNJA (iskorišćene rolne) — AI koristi za "koliko je potrošeno"
        potrosnja_po_materijalu: potrosnjaPoMat,
        potrosnja_ukupno: { metara: Math.round(potrUkM), kg: Math.round(potrUkKg * 10) / 10, rolni: svePotrosene.length },
        potrosnja_period: per,   // {d30:{m,kg}, d90:{m,kg}, ukupno:{m,kg}}
        // PROIZVODI PO SVRSI — AI koristi za "treba mi materijal/folija za X"
        proizvodi_po_svrsi: proizvodiSvrha
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
Vreme naloga na mašini = setup + metri ÷ brzina mašine; mašina provlači matičnu rolnu (metri ÷ broj traka).
U materijal_stavke isti nalog ume da postoji pod MP brojem i pod nazivom kupca — računaj jednom (prednost MP broju).
POTROŠNJA MATERIJALA: u summary imaš "potrosnja_po_materijalu" (iskorišćene rolne grupisane po vrsti · pod-vrsti · oznaci · debljini · širini · proizvođaču, sa metrima i kg), "potrosnja_ukupno" (ukupno metara/kg/rolni) i "potrosnja_period" (d30 = zadnjih 30 dana, d90 = 90 dana, ukupno). Kad te pitaju koliko je nekog materijala potrošeno — ukupno ili za period — odgovori iz ovih polja, i u metrima i u kg. Materijal filtriraj po bilo kom atributu (vrsta, pod-vrsta, oznaka, debljina, širina, proizvođač) prema pitanju.
PROIZVOD ZA ODREĐENU SVRHU: u summary imaš "proizvodi_po_svrsi" (svaki proizvod sa poljem "svrha" = za šta se koristi, "laminat" = duplex/triplex/kvadriplex/monofilm po broju slojeva, "sastav" = niz slojeva sa materijalima, "idealna_sirina"). Kad te pitaju "koji materijal/folija za X" (npr. "folija za posudu PE", "materijal za kafu", "duplex za sir") — pretraži "svrha" i "sastav" po ključnim rečima iz pitanja i vrati odgovarajući proizvod: njegov sastav (koji materijali, koliko slojeva, duplex/triplex), svrhu i širinu. Ako više proizvoda odgovara, nabroji ih.

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