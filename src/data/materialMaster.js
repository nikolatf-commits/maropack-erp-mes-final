import { supabase } from '../supabase.js';

export const MATERIAL_MASTER = {
    BOPP: { koeficijent: 0.91, pod_vrste: ['transparent', 'beli', 'sedef', 'mat', 'metalizovani'], oznake: { FXCB: [12, 15, 18, 20, 24, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100], FXC: [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100], FXCM: [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100], FXPF: [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100], FXS: [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100], TRANSPARENT: [5, 10, 12, 15, 18, 20, 25, 28, 30, 35, 40, 45, 48, 50, 60, 65, 70, 80, 90, 100], BELI: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50], SEDEF: [5, 10, 15, 20, 25, 30, 35, 38, 40, 45] } },
    CPP: { koeficijent: 0.91, pod_vrste: ['transparent', 'beli', 'metalizovani'], oznake: { CPPC: [20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100], PLC: [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100], PLCB: [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100], PLCBZ: [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100], PLCDF: [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100], PLCM: [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100], STANDARD: [5, 10, 12, 15, 18, 20, 25, 28, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100] } },
    OPP: { koeficijent: 0.91, pod_vrste: ['transparent', 'beli', 'sedef'], oznake: { STANDARD: [5, 10, 15, 18, 20, 25, 28, 30, 35, 40, 45, 50], BELI: [15, 20, 25, 30, 35, 40, 50], SEDEF: [15, 20, 25, 30, 35, 40] } },
    PET: { koeficijent: 1.40, pod_vrste: ['transparent', 'metalizovani'], oznake: { STANDARD: [12, 15, 19, 20, 21, 36, 50, 150] } },
    OPA: { koeficijent: 1.10, pod_vrste: ['transparent'], oznake: { STANDARD: [12, 15, 20, 25, 30, 35, 40, 52] } },
    PA: { koeficijent: 1.14, pod_vrste: ['transparent'], oznake: { STANDARD: [10, 15, 20, 23, 28, 30, 35, 40, 45, 50] } },
    'PA/PE': { koeficijent: 1.0, pod_vrste: ['koekstruzija'], oznake: { KOEKSTRUZIJA: [10, 15, 20, 23, 28, 30, 35, 40, 45, 50, 60, 80, 100] } },
    LDPE: { koeficijent: 0.925, pod_vrste: ['transparent', 'beli'], oznake: { STANDARD: [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 80] } },
    HDPE: { koeficijent: 0.94, pod_vrste: ['transparent', 'beli'], oznake: { STANDARD: [5, 8, 12, 15, 17, 20, 25, 30, 35, 40, 45, 50, 70] } },
    ALU: { koeficijent: 2.71, pod_vrste: ['aluminijum'], oznake: { STANDARD: [7, 9, 12, 15, 20, 25, 30, 35, 40, 45, 50] } },
    PAPIR: { koeficijent: null, isGramatura: true, pod_vrste: ['sigmakraft', 'white', 'kraft', 'glassine'], oznake: { STANDARD: [40, 45, 50, 55, 60, 70, 80, 90, 100, 120], SIGMAKRAFT: [40, 45, 50, 55, 60, 70, 80, 90, 100, 120] } },
    CELULOZA: { koeficijent: 1.45, pod_vrste: ['transparent'], oznake: { STANDARD: [10, 15, 20, 23, 28, 30, 35, 40, 45, 50, 60] } },
    CELOFAN: { koeficijent: 1.45, pod_vrste: ['transparent'], oznake: { STANDARD: [10, 15, 20, 23, 28, 30, 35, 40, 45, 50] } }
};

export const normText = (v) => String(v ?? '').trim();
export const cleanOznakaMaterijala = (value, vrsta = '') => {
    let v = normText(value);
    const t = normText(vrsta);
    if (t && v.toLowerCase().startsWith(t.toLowerCase() + ' ')) v = v.slice(t.length).trim();
    return v;
};
// --- Runtime overlay: nove kombinacije (iz baze material_master i iz templejta) se spajaju sa statičnom listom ---
let MASTER_OVERLAY = {};
function _vrstaData(vrsta) {
    const v = normText(vrsta);
    const base = MATERIAL_MASTER[v] || MATERIAL_MASTER[v.toUpperCase()] || {};
    const ov = MASTER_OVERLAY[v] || MASTER_OVERLAY[v.toUpperCase()] || {};
    return {
        koeficijent: (ov.koeficijent ?? base.koeficijent),
        isGramatura: (ov.isGramatura ?? base.isGramatura),
        pod_vrste: Array.from(new Set([...(base.pod_vrste || []), ...(ov.pod_vrste || [])])),
        oznake: { ...(base.oznake || {}), ...(ov.oznake || {}) },
    };
}
function _allVrste() { return Array.from(new Set([...Object.keys(MATERIAL_MASTER), ...Object.keys(MASTER_OVERLAY)])); }

// Dodaj/ažuriraj jednu kombinaciju u runtime listi (ne piše u bazu — to radi pozivalac).
export function upsertMasterOverlay({ vrsta, pod_vrsta, oznaka, debljina, koeficijent, isGramatura } = {}) {
    const v = normText(vrsta); if (!v) return false;
    const o = normText(oznaka) || 'STANDARD';
    const pv = normText(pod_vrsta);
    const cur = MASTER_OVERLAY[v] || { pod_vrste: [], oznake: {}, koeficijent: undefined, isGramatura: undefined };
    if (pv && !cur.pod_vrste.includes(pv)) cur.pod_vrste.push(pv);
    if (!cur.oznake[o]) cur.oznake[o] = [];
    const d = Number(String(debljina ?? '').replace(',', '.'));
    if (d && !cur.oznake[o].includes(d)) cur.oznake[o].push(d);
    if ((cur.koeficijent == null) && koeficijent != null && koeficijent !== '') cur.koeficijent = Number(koeficijent);
    if (isGramatura != null) cur.isGramatura = !!isGramatura;
    else if (v.toUpperCase() === 'PAPIR') cur.isGramatura = true;
    MASTER_OVERLAY[v] = cur;
    return true;
}
// Učitaj redove iz tabele material_master u runtime listu (zvati na startu aplikacije).
export function loadMasterOverlayFromRows(rows = []) {
    (rows || []).forEach((r) => upsertMasterOverlay({
        vrsta: r.vrsta, pod_vrsta: r.pod_vrsta, oznaka: r.oznaka || r.oznaka_materijala,
        debljina: r.debljina, koeficijent: r.koeficijent,
        isGramatura: String(r.vrsta || '').toUpperCase() === 'PAPIR',
    }));
    return Object.keys(MASTER_OVERLAY).length;
}
// Da li kombinacija već postoji (vrsta+oznaka, i opciono debljina) — za "dodaj ako fali".
export function masterHasCombo({ vrsta, oznaka, debljina } = {}) {
    const d = _vrstaData(vrsta);
    const o = normText(oznaka) || 'STANDARD';
    const deb = Number(String(debljina ?? '').replace(',', '.'));
    if (!d.oznake?.[o]) return false;
    if (!deb) return true;
    return d.oznake[o].includes(deb);
}

export const getVrsteMaterijala = () => _allVrste().sort();
export const getPodVrsteZaVrstu = (vrsta) => { const p = _vrstaData(vrsta).pod_vrste; return p.length ? p : ['transparent']; };
export const getOznakeZaVrstu = (vrsta) => Object.keys(_vrstaData(vrsta).oznake).sort();
export const getDebljineZaMaterijal = (vrsta, oznaka) => { const d = _vrstaData(vrsta); return d.oznake?.[normText(oznaka)] || d.oznake?.STANDARD || []; };
export const getKoeficijent = (vrsta) => _vrstaData(vrsta).koeficijent ?? '';
export const calculateGm2 = (vrsta, debljina) => { const m = _vrstaData(vrsta); const d = Number(String(debljina || 0).replace(',', '.')); if (!d) return 0; if (m?.isGramatura) return +d.toFixed(3); return +(d * Number(m?.koeficijent || 0)).toFixed(3); };

// --- Učitavanje žive material_master tabele u runtime listu (jednom, kešovano) ---
let _loadPromise = null;
export function ensureMasterLoaded() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
        try {
            if (!supabase || supabase.__notConfigured) return 0;
            const { data, error } = await supabase
                .from('material_master')
                .select('vrsta,pod_vrsta,oznaka,debljina,koeficijent,gsm,aktivan');
            if (error) throw error;
            return loadMasterOverlayFromRows((data || []).filter((r) => r.aktivan !== false));
        } catch (e) {
            console.warn('material_master nije učitan iz baze:', e?.message || e);
            return 0;
        }
    })();
    return _loadPromise;
}

// Upis nove kombinacije u bazu material_master + odmah u runtime listu. Vraća true ako je dodato.
export async function upsertMaterialToDb({ vrsta, pod_vrsta, oznaka, debljina, koeficijent, gsm, proizvodjac } = {}) {
    const v = normText(vrsta);
    if (!v) return false;
    upsertMasterOverlay({ vrsta: v, pod_vrsta, oznaka, debljina, koeficijent, isGramatura: v.toUpperCase() === 'PAPIR' });
    try {
        if (!supabase || supabase.__notConfigured) return true;
        const row = {
            vrsta: v,
            pod_vrsta: normText(pod_vrsta) || null,
            oznaka: normText(oznaka) || null,
            debljina: debljina != null && debljina !== '' ? Number(String(debljina).replace(',', '.')) : null,
            koeficijent: koeficijent != null && koeficijent !== '' ? Number(koeficijent) : null,
            gsm: gsm != null && gsm !== '' ? Number(gsm) : null,
            proizvodjac: normText(proizvodjac) || null,
            aktivan: true,
        };
        const { data: post } = await supabase.from('material_master')
            .select('id').eq('vrsta', row.vrsta).eq('oznaka', row.oznaka).eq('debljina', row.debljina).limit(1);
        if (post && post.length) return false;
        const { error } = await supabase.from('material_master').insert(row);
        if (error) throw error;
        return true;
    } catch (e) {
        console.warn('material_master upis nije uspeo:', e?.message || e);
        return false;
    }
}

// Auto-učitaj listu iz baze čim se modul prvi put koristi.
ensureMasterLoaded();
export const buildMaterialName = (vrsta, pod_vrsta, oznaka_materijala, debljina) => {
    const v = normText(vrsta); const p = normText(pod_vrsta); const o = cleanOznakaMaterijala(oznaka_materijala, v); const d = normText(debljina);
    return [v, p && p !== '-' ? p : '', o && o !== 'STANDARD' && o !== 'TRANSPARENT' ? o : '', d ? `${d}${v === 'PAPIR' ? ' g/m²' : 'µ'}` : ''].filter(Boolean).join(' ');
};
export const kgFromMeters = ({ sirinaMm, metara, gm2 }) => { const s = Number(sirinaMm || 0) / 1000, m = Number(String(metara || 0).replace(',', '.')), g = Number(String(gm2 || 0).replace(',', '.')); return s && m && g ? +((s * m * g) / 1000).toFixed(3) : 0; };
export const metersFromKg = ({ sirinaMm, kg, gm2 }) => { const s = Number(sirinaMm || 0) / 1000, k = Number(String(kg || 0).replace(',', '.')), g = Number(String(gm2 || 0).replace(',', '.')); return s && k && g ? +((k * 1000) / (s * g)).toFixed(2) : 0; };

export function normalizeMaterial(mat = {}) {
    const vrsta = mat.vrsta || mat.tip || mat.type || '';
    const pod_vrsta = mat.pod_vrsta || mat.podvrsta || mat.subtype || 'transparent';
    const oznaka_materijala = cleanOznakaMaterijala(mat.oznaka_materijala || mat.oznaka || mat.grade || mat.komercijalnaOznaka || 'STANDARD', vrsta);
    const debljina = mat.debljina || mat.debljina_um || mat.deb || mat.thickness || '';
    const idealna_sirina = mat.idealna_sirina || mat.idealnaSirina || mat.sirina || mat.sirinaMm || mat.sirina_mm || '';
    const gm2 = mat.gm2 || mat.tezina || mat.tezinaGm2 || calculateGm2(vrsta, debljina);
    const nazivMaterijala = mat.nazivMaterijala || buildMaterialName(vrsta, pod_vrsta, oznaka_materijala, debljina);
    return {
        ...mat,
        vrsta, tip: vrsta,
        pod_vrsta,
        oznaka_materijala,
        oznaka: oznaka_materijala,
        grade: oznaka_materijala,
        debljina, debljina_um: debljina,
        idealna_sirina,
        sirina: mat.sirina ?? idealna_sirina,
        sirinaMm: mat.sirinaMm ?? idealna_sirina,
        sirina_mm: mat.sirina_mm ?? idealna_sirina,
        gm2, tezina: gm2, tezinaGm2: gm2,
        koeficijent: mat.koeficijent || getKoeficijent(vrsta),
        nazivMaterijala,
        materijal: nazivMaterijala,
        tipMaterijala: nazivMaterijala,
    };
}
export function normalizeMaterialLayer(layer = {}, index = 0, fallbackWidth = '') {
    const n = normalizeMaterial(layer);
    const idealna_sirina = n.idealna_sirina || n.sirina || n.sirinaMm || fallbackWidth || '';
    return { ...n, sloj: Number(layer.sloj || index + 1), idealna_sirina, sirina: n.sirina || idealna_sirina, sirinaMm: n.sirinaMm || idealna_sirina, sirina_mm: n.sirina_mm || idealna_sirina };
}
export function normalizeMaterialLayers(layers = [], fallbackWidth = '') {
    const arr = Array.isArray(layers) ? layers : [];
    return arr.filter(Boolean).map((l, i) => normalizeMaterialLayer(l, i, fallbackWidth));
}
export function buildMaterijaliStruktura(layers = [], fallbackWidth = '') {
    return normalizeMaterialLayers(layers, fallbackWidth).map((l, i) => ({
        sloj: l.sloj || i + 1,
        vrsta: l.vrsta || '',
        pod_vrsta: l.pod_vrsta || '',
        oznaka_materijala: cleanOznakaMaterijala(l.oznaka_materijala || l.oznaka || '', l.vrsta),
        debljina: Number(l.debljina || 0),
        idealna_sirina: Number(l.idealna_sirina || l.sirina || l.sirinaMm || fallbackWidth || 0),
        gm2: Number(l.gm2 || l.tezina || 0),
        cena: Number(l.cena || l.cenaKg || 0),
        stampa: !!l.stampa,
        lakira: !!l.lakira,
    }));
}
export function fifoAgeDays(dateValue) { if (!dateValue) return null; const d = new Date(dateValue); if (Number.isNaN(d.getTime())) return null; return Math.floor((Date.now() - d.getTime()) / 86400000); }
export function fifoPriority(dateValue) { const days = fifoAgeDays(dateValue); if (days == null) return 'NEPOZNATO'; if (days > 180) return 'HITNO'; if (days > 90) return 'SREDNJE'; return 'NORMALNO'; }
export function findMatchingRolls(rolls = [], req = {}) {
    const r = normalizeMaterial(req); const reqWidth = Number(req.idealna_sirina || req.sirina || req.sirinaMm || 0); const reqMeters = Number(req.metraza || req.potrebnoM || req.potrebniM || 0);
    return rolls.filter(x => { const roll = normalizeMaterial(x); const width = Number(x.sirina || x.sirinaMm || 0); const free = Number(x.slobodno_m || x.metraza_ost || x.duzina || x.metara || 0) - Number(x.rezervisano || 0); const status = String(x.status || 'Na stanju').toLowerCase(); return !status.includes('potros') && !status.includes('blok') && (!r.vrsta || String(roll.vrsta).toLowerCase() === String(r.vrsta).toLowerCase()) && (!r.pod_vrsta || String(roll.pod_vrsta || '').toLowerCase() === String(r.pod_vrsta || '').toLowerCase()) && (!r.oznaka_materijala || String(roll.oznaka_materijala || '').toLowerCase() === String(r.oznaka_materijala || '').toLowerCase()) && (!r.debljina || Number(roll.debljina) === Number(r.debljina)) && (!reqWidth || width >= reqWidth) && (!reqMeters || free >= reqMeters); }).sort((a, b) => { const da = new Date(a.datum_proizvodnje || a.datum || a.created_at || '2999-01-01').getTime(); const db = new Date(b.datum_proizvodnje || b.datum || b.created_at || '2999-01-01').getTime(); if (da !== db) return da - db; return (Number(a.sirina || 0) - reqWidth) - (Number(b.sirina || 0) - reqWidth); });
}
