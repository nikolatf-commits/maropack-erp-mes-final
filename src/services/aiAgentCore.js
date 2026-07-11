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
    { key: 'napravi_nalog', label: 'Kreiranje naloga', words: ['napravi nalog', 'kreiraj nalog', 'otvori nalog', 'radni nalog', 'nalog za', 'nalog za proizvod', 'napravi radni nalog', 'proizvod i predlozi materijal', 'proizvod i predloži materijal'] },
    { key: 'plan_rezanja', label: 'Plan rezanja', words: ['plan rezanja', 'rezanje', 'iz magacina', 'koju rolnu', 'rolne', 'najbolju rolnu', 'najbolja rolna', 'pronadji rolnu', 'pronađi rolnu', 'iseci', 'krojenje'] },
    { key: 'rezervisi_materijal', label: 'Rezervacija materijala', words: ['rezerviši', 'rezervisi', 'rezervacija', 'materijal za nalog', 'zauzmi materijal'] },
    { key: 'plan_proizvodnje', label: 'Plan proizvodnje', words: ['plan proizvodnje', 'raspored', 'mašina', 'masina', 'masinama', 'mašinama', 'scheduler', 'gantt', 'plan po masinama', 'aktivne naloge'] },
    { key: 'analiza_otpada', label: 'Analiza otpada', words: ['otpad', 'iskorišćenost', 'iskoriscenost', 'iskorišćenje', 'iskoriscenje', 'gubitak', 'idealna širina', 'idealna sirina', 'idealne sirine', 'idealne širine', 'skart', 'škart'] },
    { key: 'nabavka', label: 'Nabavka', words: ['nabavka', 'nabaviti', 'poruči', 'poruci', 'porudžbina', 'porudzbina', 'naruči', 'naruci', 'naručiti', 'naruciti', 'treba naruciti', 'treba naručiti', 'nedostaje', 'minimum', 'zaliha', 'zalihe', 'nisko stanje', 'niska zaliha', 'ponestaje', 'kupiti', 'dobavljac', 'dobavljač'] },
    { key: 'kalkulacija', label: 'Kalkulacija', words: ['kalkulacija', 'cena', 'ponuda', 'marža', 'marza', 'kostanje', 'košta'] },
    { key: 'qc', label: 'Kontrola kvaliteta', words: ['qc', 'kvalitet', 'reklamacija', 'kontrola', 'problem', 'defekt'] }
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
    // metri: "m" ali NE "mm" (negativni lookahead), pa "840 mm" ne ulazi u metražu
    for (const m of q.matchAll(/(\d+(?:[.,]\d+)?)\s*(m(?!m)|metara|metra|met\b)/gi)) meters.push(Number(m[1].replace(',', '.')));
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
    const INACTIVE = ['prodat', 'utros', 'iskoris', 'isporu', 'storn', 'otpis', 'obrisan', 'arhiv'];
    const rolne = [...arr(ctx.rolne), ...arr(ctx.magacin)].filter((r) => { const s = String(r?.status || '').toLowerCase(); return !INACTIVE.some(x => s.includes(x)); });
    const byMat = {};
    for (const r of rolne) {
        const mat = String(pick(r, ['tip', 'materijal', 'vrsta', 'naziv'], 'NEPOZNATO')).toUpperCase();
        const width = n(pick(r, ['sirina', 'width_mm', 'sirina_mm'], 0));
        const key = `${mat} ${width ? width + 'mm' : ''}`.trim();
        byMat[key] = byMat[key] || { materijal: mat, sirina: width, rolni: 0, metara: 0, kg: 0, rows: [] };
        byMat[key].rolni += 1;
        byMat[key].metara += n(pick(r, ['metraza_ost', 'metraza', 'metara', 'duzina', 'ostatak_m', 'ostalo_m'], 0));
        byMat[key].kg += n(pick(r, ['kg_neto', 'kg_bruto', 'kg', 'neto_kg', 'tezina'], 0));
        byMat[key].rows.push(r);
    }
    return Object.values(byMat).sort((a, b) => b.metara - a.metara);
}


// --- Materijal iz TEMPLEJTA (isto pravilo kao Product Template Engine) ---
// kesa: kom × (dužina+klapna+falta) × (1+škart%) ; folija/špulna: poručeno(m) × 1.05
export function materijalIzTemplejta(p = {}) {
    const data = (p.data && typeof p.data === 'object') ? p.data : p;
    const tip = norm(pick(data, ['type', 'tip', 'tip_proizvoda'], ''));
    const ideal = n(pick(data, ['idealnaSirinaMaterijala', 'idealna_sirina', 'idealna_sirina_materijala'], 0));
    if (tip.includes('kesa')) {
        const k = data.kesa || {};
        const kom = n(pick(k, ['kolicina'], 0));
        const duz = n(pick(k, ['duzina'], 0)) + n(pick(k, ['klapna'], 0)) + n(pick(k, ['falta'], 0));
        const skart = n(pick(k, ['skart'], 0));
        const m = kom * (duz / 1000) * (1 + skart / 100);
        return { tip: 'kesa', ideal, kom, duzinaMm: duz, skart, metara: Math.ceil(m) };
    }
    const kol = n(pick(data, ['porucenaKolicina', 'kolicina'], 0));
    return { tip: tip || 'folija', ideal, metara: Math.ceil(kol * 1.05) };
}

// --- FIFO helperi (isti kao u templejtu: puna godina, ISO i DD.MM.YYYY) ---
function parseDatumAI(d) {
    if (!d) return NaN;
    const s = String(d).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
    if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
    const t = Date.parse(s);
    return Number.isNaN(t) ? NaN : t;
}
function rolnaDatumAI(r) {
    const d = pick(r, ['datum_proizvodnje', 'datum_prijema', 'datum_ulaza', 'created_at', 'datum'], null);
    const t = parseDatumAI(d);
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

// Izbor rolni po ISTIM pravilima kao Template Engine:
// širina >= ciljna (nikad uža) -> bliža ciljnoj (traka 25mm) -> FIFO (najstarija) -> reslovi -> debljina ±3µ -> proizvođač
function proposeCuttingPlan(question, ctx, opts = {}) {
    const { widths, meters } = extractNumbers(question);
    const targetWidth = n(opts.sirina) || widths[0] || 0;
    const targetMeters = n(opts.metara) || meters[0] || 0;
    const targetDeb = n(opts.debljina) || 0;
    const targetProizv = norm(opts.proizvodjac || '');
    const INACTIVE = ['prodat', 'utros', 'iskoris', 'isporu', 'storn', 'otpis', 'obrisan', 'arhiv', 'rezerv'];

    const rolls = [...arr(ctx.rolne), ...arr(ctx.magacin)]
        .map((r) => ({
            raw: r,
            id: pick(r, ['br_rolne', 'broj_rolne', 'qr_code', 'oznaka', 'id'], 'ROLNA'),
            materijal: pick(r, ['vrsta', 'tip', 'materijal', 'oznaka_materijala', 'naziv'], 'Materijal'),
            sirina: n(pick(r, ['sirina', 'width_mm', 'sirina_mm'], 0)),
            deb: n(pick(r, ['deb', 'debljina', 'debljina_um', 'mikroni'], 0)),
            proizvodjac: pick(r, ['dobavljac', 'proizvodjac'], ''),
            datum: rolnaDatumAI(r),
            metara: n(pick(r, ['metraza_ost', 'metraza', 'metara', 'duzina', 'ostatak_m', 'ostalo_m'], 0)),
            kg: n(pick(r, ['kg_neto', 'kg_bruto', 'kg', 'neto_kg', 'tezina'], 0)),
            status: pick(r, ['status'], 'na stanju')
        }))
        .filter((r) => {
            const st = norm(r.status);
            if (INACTIVE.some((x) => st.includes(x))) return false;   // samo na stanju
            if (r.metara <= 0) return false;
            if (targetWidth && r.sirina < targetWidth) return false;   // NIKAD uža od ciljne
            if (targetDeb && r.deb && Math.abs(r.deb - targetDeb) > 3) return false; // debljina ±3µ
            if (targetProizv && norm(r.proizvodjac) !== targetProizv) return false;  // proizvođač ako je zadat
            return true;
        })
        .sort((a, b) => {
            if (targetWidth) {                       // 1) širina: bliža ciljnoj prvo (traka 25mm), pa šire
                const ba = Math.floor(Math.max(0, a.sirina - targetWidth) / 25);
                const bb = Math.floor(Math.max(0, b.sirina - targetWidth) / 25);
                if (ba !== bb) return ba - bb;
            }
            if (a.datum !== b.datum) return a.datum - b.datum;   // 2) FIFO — najstarija prva
            if (a.metara !== b.metara) return a.metara - b.metara; // 3) reslovi (manja metraža) kad je isti datum
            return a.sirina - b.sirina;
        });

    // === ISTI MATERIJAL ZA CEO POSAO ===
    // Ne mešamo CPP + BOPP + PET. Grupišemo po (vrsta+oznaka+debljina) i biramo NAJBOLJU grupu:
    // 1) grupa koja može da pokrije celu potrebu, 2) sa najmanjim otpadom širine, 3) pa FIFO.
    const matKey = (r) => [norm(r.materijal), n(r.deb)].join('|');
    const grupe = {};
    for (const r of rolls) {
        const k = matKey(r);
        grupe[k] = grupe[k] || { key: k, materijal: r.materijal, deb: r.deb, rolls: [], ukupnoM: 0, minOtpad: Infinity, najstarija: Number.MAX_SAFE_INTEGER };
        grupe[k].rolls.push(r);
        grupe[k].ukupnoM += r.metara;
        grupe[k].minOtpad = Math.min(grupe[k].minOtpad, targetWidth ? Math.max(0, r.sirina - targetWidth) : 0);
        grupe[k].najstarija = Math.min(grupe[k].najstarija, r.datum);
    }
    const kandidati = Object.values(grupe).sort((a, b) => {
        const pa = (targetMeters && a.ukupnoM >= targetMeters) ? 0 : 1;   // 1) pokriva celu potrebu
        const pb = (targetMeters && b.ukupnoM >= targetMeters) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        if (a.minOtpad !== b.minOtpad) return a.minOtpad - b.minOtpad;    // 2) najmanji otpad širine
        if (a.najstarija !== b.najstarija) return a.najstarija - b.najstarija; // 3) FIFO
        return b.ukupnoM - a.ukupnoM;
    });
    const grupa = kandidati[0];
    const izabraneRolne = grupa ? grupa.rolls : [];
    const alternative = kandidati.slice(1, 4).map((g) => ({
        materijal: g.materijal, debljina: g.deb, rolni: g.rolls.length,
        ukupnoM: Math.round(g.ukupnoM), minOtpad: g.minOtpad === Infinity ? 0 : g.minOtpad
    }));

    const selected = [];
    let remaining = targetMeters;
    for (const r of izabraneRolne) {
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
        if (!targetMeters) break;
    }

    const totalM = selected.reduce((s, x) => s + x.koristi_m, 0);
    const avgWaste = selected.length ? selected.reduce((s, x) => s + x.otpad_mm, 0) / selected.length : 0;
    const iskoriscenje = targetWidth && selected.length
        ? (targetWidth / (selected.reduce((s, x) => s + x.roll.sirina, 0) / selected.length)) * 100 : 0;
    return {
        targetWidth, targetMeters, targetDeb, targetProizv, selected, totalM, remaining: Math.max(0, remaining), avgWaste, iskoriscenje,
        materijal: grupa ? grupa.materijal : '', debljina: grupa ? grupa.deb : 0, alternative
    };
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
    // Ako je prepoznat proizvod/templejt — povuci njegovu idealnu širinu i potrebnu metražu (isto pravilo kao Template Engine)
    const tpl = products.length ? materijalIzTemplejta(products[0]) : null;
    const cutting = proposeCuttingPlan(question, ctx, tpl ? { sirina: tpl.ideal, metara: tpl.metara } : {});
    const schedule = proposeMachineSchedule(question, ctx);

    const actions = [];
    const warnings = [];
    const insights = [];
    const nabavkaLines = [];

    if (products.length) insights.push(`Našao sam ${products.length} mogućih proizvoda/template-a koji odgovaraju upitu.`);
    if (tpl && tpl.metara) insights.push(tpl.tip === 'kesa'
        ? `Templejt (kesa): ${tpl.kom.toLocaleString('sr-RS')} kom × ${tpl.duzinaMm} mm × (1+${tpl.skart}% škart) = ${tpl.metara.toLocaleString('sr-RS')} m materijala, idealna širina ${tpl.ideal || '—'} mm.`
        : `Templejt (${tpl.tip}): potrebno ${tpl.metara.toLocaleString('sr-RS')} m (+5%), idealna širina ${tpl.ideal || '—'} mm.`);
    if (warehouse.length) insights.push(`Magacin ima ${warehouse.length} grupa materijala/širina sa ukupnim stanjem.`);
    if (aiData.summary?.greske_tabela?.length) warnings.push('Neke tabele nisu dostupne ili još nisu kreirane u Supabase-u. Sistem radi fallback, ali za 100% rad treba pokrenuti SQL dopune.');

    // IZVRŠNA akcija: napravi naloge od postojećeg proizvoda iz baze
    if ((intent.key === 'napravi_nalog' || intent.key === 'kalkulacija') && products.length) {
        const p = products[0];
        const naNum = (s) => Number(String(s ?? '').replace(/[.\s]/g, '').replace(',', '.')) || 0;
        const nums = extractNumbers(question);
        const komM = (String(question).match(/(\d[\d.\s]*)\s*(kom|komada|kos)/i) || [])[1];
        const kolicina = naNum(komM) || nums.meters[0] || naNum(p.kolicina) || naNum(p.kol) || 0;
        const naziv = pick(p, ['naziv', 'name', 'sifra'], 'Proizvod');
        actions.push({
            type: 'KREIRAJ_NALOG_OD_PROIZVODA',
            title: 'Napravi naloge za: ' + naziv,
            payload: { productId: p.id, productName: naziv, kupac: pick(p, ['kupac'], ''), kolicina, tip: pick(p, ['tip', 'tip_proizvoda'], 'folija') },
            next: ['Proveri proizvod i količinu', 'Klikni Izvrši — pravi ponudu i naloge', 'Magacioner skenira rolne']
        });
    }

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
        // Čita MINIMUME koje si ti postavio u Material master (kolona: minimalna_zaliha = Minimum kg).
        const master = arr(ctx.material_master).concat(arr(ctx.materijali));
        const INACTIVE = ['prodat', 'utros', 'iskoris', 'isporu', 'storn', 'otpis', 'obrisan', 'arhiv'];
        const rolne = [...arr(ctx.rolne), ...arr(ctx.magacin)].filter((r) => {
            const st = norm(pick(r, ['status'], ''));
            return !INACTIVE.some((x) => st.includes(x));
        });
        const kljuc = (v, pv, oz, deb) => [norm(v), norm(pv), norm(oz), n(deb)].join('|');

        // stanje (kg i m) po kombinaciji materijala iz mastera
        const stanje = {};
        for (const r of rolne) {
            const k = kljuc(pick(r, ['vrsta', 'tip', 'materijal'], ''), pick(r, ['pod_vrsta', 'podvrsta'], ''), pick(r, ['oznaka', 'oznaka_materijala'], ''), pick(r, ['debljina', 'deb'], 0));
            stanje[k] = stanje[k] || { kg: 0, m: 0, rolni: 0 };
            stanje[k].kg += n(pick(r, ['kg_neto', 'kg', 'neto_kg', 'kg_bruto', 'tezina'], 0));
            stanje[k].m += n(pick(r, ['metraza_ost', 'metraza', 'metara', 'duzina', 'ostatak_m'], 0));
            stanje[k].rolni += 1;
        }

        const low = master
            .map((m) => {
                const minKg = n(pick(m, ['minimalna_zaliha', 'min_kg', 'minimum_kg', 'min_zaliha'], 0));
                if (minKg <= 0) return null;                       // samo materijali kojima si POSTAVIO minimum
                const k = kljuc(pick(m, ['vrsta'], ''), pick(m, ['pod_vrsta', 'podvrsta'], ''), pick(m, ['oznaka'], ''), pick(m, ['debljina'], 0));
                const st = stanje[k] || { kg: 0, m: 0, rolni: 0 };
                const manjak = Math.max(0, minKg - st.kg);
                if (manjak <= 0) return null;                      // iznad minimuma — ne treba nabavka
                return {
                    materijal: [pick(m, ['vrsta'], ''), pick(m, ['oznaka'], ''), pick(m, ['debljina'], '') ? pick(m, ['debljina'], '') + 'µ' : ''].filter(Boolean).join(' '),
                    proizvodjac: pick(m, ['proizvodjac', 'dobavljac'], '—'),
                    sirina: 0,
                    rolni: st.rolni,
                    kg: st.kg, metara: st.m,
                    min_kg: minKg,
                    nedostaje_kg: Math.round(manjak),
                    predlog_kg: Math.ceil(manjak / 50) * 50,          // zaokruži na 50 kg
                    kritican: st.kg < minKg * 0.35
                };
            })
            .filter(Boolean)
            .sort((a, b) => (b.kritican - a.kritican) || (b.nedostaje_kg - a.nedostaje_kg))
            .slice(0, 20);

        const saMinimumom = master.filter((m) => n(pick(m, ['minimalna_zaliha', 'min_kg'], 0)) > 0).length;
        if (!saMinimumom) {
            nabavkaLines.push('Nabavka: ni za jedan materijal nije postavljena minimalna zaliha (Minimum kg) u Material master bazi. Postavi minimume pa mogu da javim šta treba naručiti.');
            warnings.push('Nema definisanih minimuma (minimalna_zaliha) u Material master — nabavka se ne može proceniti.');
        } else if (low.length) {
            const kriticni = low.filter((g) => g.kritican).length;
            insights.push(`Nabavka: ${low.length} materijala ispod TVOG minimuma (od ${saMinimumom} sa definisanim minimumom)${kriticni ? `, ${kriticni} kritično` : ''}.`);
            nabavkaLines.push(`Treba naručiti: ${low.slice(0, 5).map((g) => `${g.materijal} (ima ${Math.round(g.kg)} kg, min ${g.min_kg} kg → fali ${g.nedostaje_kg} kg)`).join('; ')}${low.length > 5 ? ` i još ${low.length - 5}` : ''}.`);
            actions.push({ type: 'NABAVKA', title: `Materijali ispod minimuma (${low.length})`, payload: low, next: ['Proveri minimalne zalihe', 'Napravi predlog porudžbine'] });
        } else {
            nabavkaLines.push(`Nabavka: svih ${saMinimumom} materijala sa definisanim minimumom je iznad minimalne zalihe. Nema potrebe za nabavkom.`);
            insights.push('Sve zalihe su iznad tvojih minimuma — nema hitne nabavke.');
        }
    }

    if (intent.key === 'analiza_otpada') {
        const waste = arr(ctx.analiza_potrosnje_materijala).concat(arr(ctx.potrosnja_materijala)).slice(0, 30);
        actions.push({ type: 'ANALIZA_OTPADA', title: 'Analiza otpada iz istorije', payload: waste, next: ['Sortiraj po najvećem otpadu', 'Predloži idealne širine', 'Poveži sa nabavkom'] });
    }

    const answerLines = [];
    answerLines.push(`Prepoznao sam zahtev kao: ${intent.label}.`);
    nabavkaLines.forEach((l) => answerLines.push(l));
    if (products.length) answerLines.push(`Najbliži proizvodi/template-i: ${products.map((p) => pick(p, ['naziv', 'name', 'sifra'], 'Proizvod')).join(', ')}.`);
    if (cutting.selected.length && (intent.key === 'plan_rezanja' || intent.key === 'rezervisi_materijal' || intent.key === 'napravi_nalog')) {
        answerLines.push(`Materijal: ${cutting.materijal || '—'}${cutting.debljina ? ' ' + cutting.debljina + 'µ' : ''} — ceo posao ide iz JEDNOG materijala (ne mešam vrste).`);
        answerLines.push(`Za rezanje predlažem ${cutting.selected.length} rolnu/rolni, ukupno ${Math.round(cutting.totalM).toLocaleString('sr-RS')} m, prosečan otpad širine ${cutting.avgWaste.toFixed(1)} mm.`);
        if (cutting.alternative?.length) answerLines.push(`Alternative: ${cutting.alternative.map((a) => `${a.materijal}${a.debljina ? ' ' + a.debljina + 'µ' : ''} (${a.rolni} rolni, ${a.ukupnoM.toLocaleString('sr-RS')} m, otpad ${a.minOtpad} mm)`).join('; ')}.`);
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

async function kreirajNalogeOdProizvoda(p = {}, user = 'system') {
    try {
        if (!p.productId) return { ok: false, message: 'Nije prepoznat proizvod iz baze.' };
        // 1) Učitaj proizvod (templejt)
        const { data: prod, error: pe } = await supabase.from('proizvodi').select('*').eq('id', p.productId).maybeSingle();
        if (pe || !prod) return { ok: false, message: 'Proizvod nije nađen u bazi (' + (pe?.message || 'nema reda') + ').' };
        const tpl = prod.data || prod.template || prod;
        const folija = (tpl && (tpl.folija || (tpl.data && tpl.data.folija))) || {};
        const kolicina = Number(p.kolicina || 0) || 0;
        const naziv = prod.naziv || prod.name || p.productName || 'Proizvod';
        // 2) Napravi ponudu sa res.template (kolone usklađene sa šemom tabele ponude)
        const layers = (folija.layers || prod.struktura_materijala || []);
        const payload = {
            broj: 'PON-AI-' + Date.now(),
            datum: new Date().toLocaleDateString('sr-RS'),
            kupac: p.kupac || prod.kupac || 'AI nalog',
            naziv, proizvod: naziv,
            tip: prod.tip || p.tip || 'folija',
            kol: kolicina || null, kolicina: kolicina || null,
            struktura: layers, mats: layers,
            status: 'prihvaceno',
            nap: 'Kreirano iz AI agenta',
            template_id: prod.template_id || prod.id || null,
            res: { template: tpl, operacije: [], kupac: p.kupac || prod.kupac || '', kolicina }
        };
        const { data: pon, error: oe } = await supabase.from('ponude').insert([payload]).select().single();
        if (oe || !pon) return { ok: false, message: 'Ponuda nije kreirana: ' + (oe?.message || 'nepoznato') };
        // 3) Generiši naloge (master + operativni) iz ponude
        const { error: re } = await supabase.rpc('kreiraj_naloge_iz_ponude', { p_ponuda_id: pon.id });
        if (re) return { ok: false, message: 'Ponuda napravljena (id ' + pon.id + '), ali generisanje naloga nije uspelo: ' + re.message };
        // 4) Nađi broj master naloga
        let broj = '';
        try { const { data: mr } = await supabase.from('radni_nalozi').select('broj_naloga').eq('ponuda_id', pon.id).order('created_at', { ascending: false }).limit(1); if (mr && mr[0]) broj = mr[0].broj_naloga; } catch (e) { }
        // 5) Zabeleži u ai_akcije (memorija)
        try { await supabase.from('ai_akcije').insert({ tip: 'KREIRAJ_NALOG_OD_PROIZVODA', naziv: 'Naloge za ' + naziv, payload: { proizvod_id: prod.id, kolicina, broj, ponuda_id: pon.id }, status: 'izvrseno', korisnik: user, created_at: new Date().toISOString() }); } catch (e) { }
        return { ok: true, message: 'Napravljeni nalozi za „' + naziv + '"' + (broj ? ' · ' + broj : '') + ' (količina ' + kolicina + '). Rolne dodeljuje magacioner skeniranjem. Otvori Glavni nalozi.', broj };
    } catch (e) { return { ok: false, message: 'Greška pri kreiranju naloga: ' + (e.message || e) }; }
}

export async function executeAIAgentAction(action, user = 'system') {
    if (!action?.type) return { ok: false, message: 'Nema akcije za izvršenje.' };
    // IZVRŠNE akcije (menjaju bazu)
    if (action.type === 'KREIRAJ_NALOG_OD_PROIZVODA') return await kreirajNalogeOdProizvoda(action.payload || {}, user);
    // Ostale akcije se čuvaju kao predlog
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