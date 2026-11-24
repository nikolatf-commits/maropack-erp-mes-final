// ─────────────────────────────────────────────────────────────────────────────
//  MAROPACK — planIzvestaj.js  [v1]
//  „Izvezi izveštaj (Excel)" iz Plana proizvodnje.
//  Pravi .xlsx (ExcelJS, učitan sa CDN-a — bez menjanja build-a):
//    List 1 Pregled   — KPI + ključni nalazi + 2 grafikona
//    List 2 Analize   — usko grlo (>85%) + nalozi koji probijaju rok
//    List 3 Po kupcima— naloga/sati/metri po kupcu + grafikon
//    List 4 Nalozi    — svaka operacija jedan red (detaljno)
//    List 5 Zauzetost — mašine × dani (%)
//    List 6 Po nedeljama (KW) — sati po tipu operacije
//  Sva analitika se računa iz ISTOG rasporeda kao kalendar (planRaspored.izracunajRaspored).
// ─────────────────────────────────────────────────────────────────────────────
import { radnoSada, izracunajRaspored, kapacitetDanaMasine, DAN_MIN, DAN_OD } from './planRaspored.js';
import { procenaMinNaMasini, OP_LABELE } from './nalogMetrika.js';

const OP_BOJA = { stampa: '2563EB', lakiranje: '7C3AED', kasiranje: '0D9488', rezanje: 'DC2626', rezanje_tabaka: '0D9488', pravljenje_creva: '4338CA', formatiranje: 'EA580C', kese: '16A34A', spulne: 'D97706', ostalo: '64748B' };
const OP_NAZIV = { stampa: 'Štampa', kasiranje: 'Kaширanje', rezanje: 'Rezanje', rezanje_tabaka: 'Rezanje tabaka', pravljenje_creva: 'Pravljenje creva', formatiranje: 'Formatiranje', kese: 'Kese', spulne: 'Špulne', lakiranje: 'Lakiranje', ostalo: 'Operacija' };
const h1 = (m) => Math.round((m / 60) * 10) / 10;                         // minuti → sati (1 dec)
const dKey = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
const fmtDatum = (d) => d ? new Date(d).toLocaleDateString('sr-RS') : '—';
const isoNedelja = (d) => {
    if (!d || Number.isNaN(new Date(d).getTime())) return '';
    const t = new Date(Date.UTC(new Date(d).getFullYear(), new Date(d).getMonth(), new Date(d).getDate()));
    const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3);
    const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    return 'KW ' + (1 + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7));
};

// ── Učitaj ExcelJS sa CDN-a (jednom) ──
function ucitajExcelJS() {
    if (typeof window !== 'undefined' && window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
        s.onload = () => res(window.ExcelJS);
        s.onerror = () => rej(new Error('Ne mogu da učitam ExcelJS (proveri internet).'));
        document.head.appendChild(s);
    });
}

// ── Analitika iz plana ──
export function izgradiAnalitiku({ machines, plan, orderMap, opStatusi = {} }) {
    const sidro = radnoSada();
    const raspored = izracunajRaspored({ machines, plan, orderMap, opStatusi, sidro }) || [];
    const poId = {}; (machines || []).forEach((m) => { poId[m.id] = m; });
    const segs = raspored.filter((s) => s && !s.eksterno && s.o && s.masinaId && poId[s.masinaId]);

    // obogati svaki segment: minuti rada, sati, nedelja
    segs.forEach((s) => {
        const m = poId[s.masinaId];
        s._min = procenaMinNaMasini(m, s.o.metri) || Math.max(1, Math.round((s.o.metri || 0) / 100));
        s._kw = s.o.nedelja || isoNedelja(s.o.rok);
    });

    // po mašini
    const poMasini = {};
    segs.forEach((s) => { const k = s.masinaId; (poMasini[k] = poMasini[k] || { m: poId[k], min: 0, n: 0 }); poMasini[k].min += s._min; poMasini[k].n++; });

    // zauzetost mašina × dani (isti model kao kalendar)
    const zauz = {}; const daniSet = new Set();
    segs.forEach((s) => {
        const m = poId[s.masinaId]; let d = new Date(s.start); d.setHours(0, 0, 0, 0); let g = 0;
        while (d <= s.end && g++ < 400) {
            const cap = kapacitetDanaMasine(m, d);
            if (cap > 0) {
                const ds = new Date(d); ds.setHours(0, 0, 0, 0); ds.setMinutes(DAN_OD);
                const de = new Date(d); de.setHours(0, 0, 0, 0); de.setMinutes(DAN_OD + cap);
                const ov = Math.max(0, Math.min(s.end.getTime(), de.getTime()) - Math.max(s.start.getTime(), ds.getTime())) / 60000;
                if (ov > 0) { const key = s.masinaId + '|' + dKey(d); zauz[key] = (zauz[key] || 0) + ov; daniSet.add(dKey(d)); }
            }
            d.setDate(d.getDate() + 1);
        }
    });
    const daniSort = [...daniSet].sort((a, b) => a - b);

    // usko grlo: (mašina, dan) sa util > 85%; i najveći util uopšte
    const uskaGrla = []; let topUtil = { pct: 0 };
    Object.keys(poMasini).forEach((mid) => {
        const m = poId[mid];
        daniSort.forEach((dk) => {
            const min = zauz[mid + '|' + dk] || 0; if (min <= 0) return;
            const cap = kapacitetDanaMasine(m, new Date(dk)) || DAN_MIN;
            const pct = Math.round(min / cap * 100);
            if (pct > topUtil.pct) topUtil = { pct, m, dk, min, cap };
            if (pct >= 85) uskaGrla.push({ m, dk, pct, min, cap });
        });
    });
    uskaGrla.sort((a, b) => b.pct - a.pct);

    // rok breaches
    const rokovi = segs.filter((s) => s.probija).map((s) => ({ s, kasni: s.kasniDana || 0 })).sort((a, b) => b.kasni - a.kasni);

    // po kupcu
    const poKupcu = {};
    segs.forEach((s) => { const k = s.o.customer || '—'; (poKupcu[k] = poKupcu[k] || { kupac: k, n: 0, min: 0, metri: 0, probija: 0 }); poKupcu[k].n++; poKupcu[k].min += s._min; poKupcu[k].metri += Number(s.o.metri) || 0; if (s.probija) poKupcu[k].probija++; });
    const kupci = Object.values(poKupcu).sort((a, b) => b.min - a.min);

    // po tipu operacije
    const poTipu = {};
    segs.forEach((s) => { const k = s.o.opTip || 'ostalo'; poTipu[k] = (poTipu[k] || 0) + s._min; });
    const ukMin = Object.values(poTipu).reduce((a, b) => a + b, 0) || 1;
    const tipovi = Object.entries(poTipu).map(([k, min]) => ({ k, min, pct: Math.round(min / ukMin * 100) })).sort((a, b) => b.min - a.min);

    // po nedelji (KW) × tip
    const poKW = {};
    segs.forEach((s) => { const kw = s._kw || '—'; (poKW[kw] = poKW[kw] || { kw, min: 0, n: 0, tip: {} }); poKW[kw].min += s._min; poKW[kw].n++; poKW[kw].tip[s.o.opTip] = (poKW[kw].tip[s.o.opTip] || 0) + s._min; });
    const nedelje = Object.values(poKW).sort((a, b) => String(a.kw).localeCompare(String(b.kw), 'sr', { numeric: true }));

    // KPI
    const planMin = segs.reduce((a, s) => a + s._min, 0);
    const aktivne = (machines || []).filter((m) => m.status === 'aktivna').length;
    const usedMd = Object.keys(zauz).length;
    const capSum = Object.keys(zauz).reduce((a, key) => { const mid = key.split('|')[0]; const dk = +key.split('|')[1]; return a + (kapacitetDanaMasine(poId[mid], new Date(dk)) || DAN_MIN); }, 0);
    const minSum = Object.values(zauz).reduce((a, b) => a + b, 0);
    const prosZauz = capSum > 0 ? Math.round(minSum / capSum * 100) : 0;
    const najKW = nedelje.slice().sort((a, b) => b.min - a.min)[0];

    return {
        datum: new Date(), segs, poId, daniSort, zauz,
        kpi: { naloga: segs.length, sati: h1(planMin), masAktivno: aktivne, masUkupno: (machines || []).length, prosZauz, probija: rokovi.length, najKW: najKW ? najKW.kw : '—' },
        topUtil, uskaGrla, rokovi, kupci, tipovi, nedelje,
        poMasini: Object.values(poMasini).sort((a, b) => b.min - a.min),
    };
}

// ── Crtanje grafikona na canvas → dataURL (PNG) ──
function noviCanvas(w, h) { const c = document.createElement('canvas'); const r = 2; c.width = w * r; c.height = h * r; const x = c.getContext('2d'); x.scale(r, r); x.textBaseline = 'middle'; x.font = '12px Inter, Arial'; return { c, x, w, h }; }
function hex(c) { return '#' + c; }
// horizontalni barovi: [{label, val, color}]
function crtajHBar(data, naslov, jed) {
    const w = 360, rowH = 26, top = 30, h = top + data.length * rowH + 16;
    const { c, x } = noviCanvas(w, h);
    x.fillStyle = '#0f172a'; x.font = 'bold 13px Inter, Arial'; x.fillText(naslov, 8, 14);
    const maxV = Math.max(1, ...data.map((d) => d.val));
    const x0 = 120, x1 = w - 46, scale = (x1 - x0) / maxV;
    x.strokeStyle = '#e2e8f0'; x.lineWidth = 1;
    data.forEach((d, i) => {
        const y = top + i * rowH + rowH / 2;
        x.fillStyle = '#475569'; x.font = '11px Inter, Arial'; x.textAlign = 'right'; x.fillText(d.label, x0 - 6, y);
        const bw = Math.max(2, d.val * scale);
        x.fillStyle = hex(d.color || '2F6DF0');
        const bh = 15; const by = y - bh / 2; const rr = 4;
        x.beginPath(); x.moveTo(x0, by); x.lineTo(x0 + bw - rr, by); x.quadraticCurveTo(x0 + bw, by, x0 + bw, by + rr); x.lineTo(x0 + bw, by + bh - rr); x.quadraticCurveTo(x0 + bw, by + bh, x0 + bw - rr, by + bh); x.lineTo(x0, by + bh); x.closePath(); x.fill();
        x.fillStyle = '#475569'; x.font = 'bold 11px Inter, Arial'; x.textAlign = 'left'; x.fillText(d.val.toLocaleString('sr-RS') + (jed || ''), x0 + bw + 5, y);
    });
    return c.toDataURL('image/png');
}
// 100% složeni horizontalni bar: [{label, pct, color}]
function crtaj100(data, naslov) {
    const w = 360, h = 70; const { c, x } = noviCanvas(w, h);
    x.fillStyle = '#0f172a'; x.font = 'bold 13px Inter, Arial'; x.fillText(naslov, 8, 14);
    const x0 = 8, x1 = w - 8, y = 30, bh = 26; let cx = x0; const tot = data.reduce((a, d) => a + d.pct, 0) || 100;
    data.forEach((d) => { const bw = (d.pct / tot) * (x1 - x0); x.fillStyle = hex(d.color); x.fillRect(cx, y, Math.max(0, bw - 2), bh); if (bw > 26) { x.fillStyle = '#fff'; x.font = 'bold 11px Inter, Arial'; x.textAlign = 'center'; x.fillText(d.pct + '%', cx + bw / 2, y + bh / 2); } cx += bw; });
    // legenda
    x.textAlign = 'left'; let lx = 8; const ly = 64;
    data.forEach((d) => { x.fillStyle = hex(d.color); x.fillRect(lx, ly - 8, 10, 10); x.fillStyle = '#475569'; x.font = '11px Inter, Arial'; x.fillText(d.label, lx + 14, ly - 3); lx += 14 + x.measureText(d.label).width + 16; });
    return c.toDataURL('image/png');
}

// ── Pomoćne za ExcelJS stil ──
function naslovRed(ws, tekst, span) {
    const r = ws.addRow([tekst]); r.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } }; r.height = 22;
    if (span) ws.mergeCells(r.number, 1, r.number, span); return r;
}
function zaglavlje(ws, kolone) {
    const r = ws.addRow(kolone); r.eachCell((c) => { c.font = { bold: true, color: { argb: 'FF15803D' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F3EC' } }; c.border = { bottom: { style: 'thin', color: { argb: 'FFBBD6C4' } } }; }); return r;
}

// ── Glavna: izvoz ──
export async function izveziPlanExcel(ctx) {
    const ExcelJS = await ucitajExcelJS();
    const A = izgradiAnalitiku(ctx);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MAROPACK'; wb.created = A.datum;
    const danStr = A.datum.toLocaleDateString('sr-RS');

    // slike grafikona (ako canvas padne, nastavi bez slike)
    const slike = {};
    try {
        const topMas = A.poMasini.slice(0, 6).map((p) => ({ label: (p.m.code || p.m.name || '').slice(0, 14), val: h1(p.min), color: OP_BOJA[p.m.type] || '2F6DF0' }));
        slike.masine = crtajHBar(topMas, 'Vreme po mašini (h)', 'h');
        slike.udeo = crtaj100(A.tipovi.map((t) => ({ label: OP_NAZIV[t.k] || t.k, pct: t.pct, color: OP_BOJA[t.k] || '64748B' })), 'Udeo po tipu operacije');
        slike.kupci = crtajHBar(A.kupci.slice(0, 6).map((k) => ({ label: String(k.kupac).slice(0, 16), val: h1(k.min), color: '7C3AED' })), 'Sati po kupcu', 'h');
    } catch (e) { /* bez grafikona */ }
    const dodajSliku = (ws, dataUrl, col, row, w, h) => { if (!dataUrl) return; try { const id = wb.addImage({ base64: dataUrl, extension: 'png' }); ws.addImage(id, { tl: { col, row }, ext: { width: w, height: h } }); } catch (e) { } };

    // ═══ LIST 1 — PREGLED ═══
    const p = wb.addWorksheet('Pregled', { properties: { tabColor: { argb: 'FF217346' } } });
    p.columns = [{ width: 22 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 10 }];
    naslovRed(p, 'MAROPACK — Izveštaj plana proizvodnje', 7);
    const sub = p.addRow(['Datum izveštaja: ' + danStr]); sub.font = { color: { argb: 'FF64748B' } };
    p.addRow([]);
    // KPI
    const kpis = [['Naloga u planu', A.kpi.naloga], ['Planirani rad (h)', A.kpi.sati], ['Mašina aktivno', A.kpi.masAktivno + '/' + A.kpi.masUkupno], ['Pros. zauzetost', A.kpi.prosZauz + '%'], ['Probija rok', A.kpi.probija], ['Najveća gužva', A.kpi.najKW]];
    const kv = p.addRow(kpis.map((k) => k[1]));
    kv.eachCell((c, col) => { if (col > kpis.length) return; c.font = { bold: true, size: 18, color: { argb: col === 5 && A.kpi.probija > 0 ? 'FFDC2626' : 'FF0F172A' } }; c.alignment = { horizontal: 'left' }; });
    const kl = p.addRow(kpis.map((k) => k[0]));
    kl.eachCell((c, col) => { if (col > kpis.length) return; c.font = { bold: true, size: 9, color: { argb: 'FF94A3B8' } }; });
    p.addRow([]);
    // Ključni nalazi
    naslovRed(p, '🔎 Ključni nalazi', 7).font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };
    const nalazi = [];
    if (A.topUtil.pct) nalazi.push('• Usko grlo: ' + (A.topUtil.m.code || A.topUtil.m.name) + ' — ' + A.topUtil.pct + '% dnevnog kapaciteta (' + fmtDatum(A.topUtil.dk) + ').');
    if (A.rokovi.length) nalazi.push('• ' + A.rokovi.length + ' naloga probija rok (najviše: ' + A.rokovi.slice(0, 3).map((r) => (r.s.o.id || '') + ' +' + r.kasni + 'd').join(', ') + ').');
    if (A.kpi.najKW !== '—') nalazi.push('• Najveće opterećenje u ' + A.kpi.najKW + '.');
    if (A.tipovi.length) nalazi.push('• Udeo po operaciji: ' + A.tipovi.slice(0, 4).map((t) => (OP_NAZIV[t.k] || t.k) + ' ' + t.pct + '%').join(', ') + '.');
    nalazi.forEach((t) => { const r = p.addRow([t]); p.mergeCells(r.number, 1, r.number, 7); r.getCell(1).alignment = { wrapText: true }; r.getCell(1).font = { color: { argb: 'FF334155' } }; });
    p.addRow([]);
    const grR = p.addRow([]).number;
    dodajSliku(p, slike.udeo, 0, grR, 360, 70);
    dodajSliku(p, slike.masine, 4, grR, 360, 210);

    // ═══ LIST 2 — ANALIZE ═══
    const an = wb.addWorksheet('Analize');
    an.columns = [{ width: 22 }, { width: 16 }, { width: 12 }, { width: 18 }, { width: 30 }];
    naslovRed(an, 'Usko grlo (zauzetost > 85%)', 5);
    zaglavlje(an, ['Mašina', 'Dan', 'Zauzetost', 'Minuta/kapacitet', 'Predlog']);
    if (!A.uskaGrla.length) an.addRow(['Nema uskih grla iznad 85%.']);
    A.uskaGrla.slice(0, 20).forEach((u) => {
        const r = an.addRow([(u.m.code || '') + ' ' + u.m.name, fmtDatum(u.dk), u.pct + '%', Math.round(u.min) + ' / ' + u.cap, u.pct >= 90 ? 'Preraspodeliti deo na slobodniju mašinu' : 'Pratiti']);
        r.getCell(3).font = { bold: true, color: { argb: u.pct >= 90 ? 'FFDC2626' : 'FFB45309' } };
    });
    an.addRow([]); an.addRow([]);
    naslovRed(an, 'Nalozi koji probijaju rok', 5);
    zaglavlje(an, ['Nalog', 'Kupac', 'Operacija', 'Rok', 'Kašnjenje']);
    if (!A.rokovi.length) an.addRow(['Nema naloga koji probijaju rok. 👍']);
    A.rokovi.slice(0, 40).forEach((r) => {
        const s = r.s; const row = an.addRow([s.o.id, s.o.customer || '—', OP_NAZIV[s.o.opTip] || s.o.opTip, (s._kw ? s._kw + ' · ' : '') + fmtDatum(s.o.rok), '+' + r.kasni + ' dana']);
        row.getCell(5).font = { bold: true, color: { argb: 'FFDC2626' } };
    });

    // ═══ LIST 3 — PO KUPCIMA ═══
    const pk = wb.addWorksheet('Po kupcima');
    pk.columns = [{ width: 28 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 12 }];
    naslovRed(pk, 'Opterećenje po kupcu', 5);
    zaglavlje(pk, ['Kupac', 'Naloga', 'Sati', 'Metri', 'Probija rok']);
    A.kupci.forEach((k) => { const r = pk.addRow([k.kupac, k.n, h1(k.min), Math.round(k.metri), k.probija]); if (k.probija > 0) r.getCell(5).font = { color: { argb: 'FFDC2626' }, bold: true }; });
    pk.addRow([]); const pkR = pk.addRow([]).number;
    dodajSliku(pk, slike.kupci, 0, pkR, 360, 210);

    // ═══ LIST 4 — NALOZI PO MAŠINAMA ═══
    const nl = wb.addWorksheet('Nalozi');
    nl.columns = [{ width: 22 }, { width: 18 }, { width: 22 }, { width: 16 }, { width: 12 }, { width: 11 }, { width: 16 }, { width: 10 }, { width: 10 }];
    naslovRed(nl, 'Radni nalozi po mašinama', 9);
    zaglavlje(nl, ['Mašina', 'Nalog', 'Kupac', 'Operacija', 'Metri', 'Vreme (min)', 'Gotov', 'Rok (KW)', 'Perf.']);
    A.segs.slice().sort((a, b) => a.start - b.start).forEach((s) => {
        nl.addRow([(s.m ? '' : '') + (A.poId[s.masinaId].code || '') + ' ' + A.poId[s.masinaId].name, s.o.id, s.o.customer || '—', OP_NAZIV[s.o.opTip] || s.o.opTip, Math.round(s.o.metri) || '', Math.round(s._min), s.end ? new Date(s.end).toLocaleString('sr-RS') : '', s._kw || '', s.o.perforacija ? 'DA' : '']);
    });

    // ═══ LIST 5 — ZAUZETOST (mašine × dani) ═══
    const zz = wb.addWorksheet('Zauzetost');
    const daniKol = A.daniSort.slice(0, 21);
    zz.columns = [{ width: 24 }, ...daniKol.map(() => ({ width: 9 }))];
    naslovRed(zz, 'Zauzetost mašina po danu (%)', 1 + daniKol.length);
    zaglavlje(zz, ['Mašina', ...daniKol.map((dk) => new Date(dk).toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit' }))]);
    A.poMasini.forEach((pm) => {
        const row = [ (pm.m.code || '') + ' ' + pm.m.name ];
        daniKol.forEach((dk) => { const min = A.zauz[pm.m.id + '|' + dk] || 0; const cap = kapacitetDanaMasine(pm.m, new Date(dk)) || DAN_MIN; row.push(min > 0 ? Math.round(min / cap * 100) : null); });
        const r = zz.addRow(row);
        r.eachCell((c, col) => { if (col === 1 || c.value == null) return; const v = Number(c.value); c.value = v + '%'; c.alignment = { horizontal: 'right' }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: v > 90 ? 'FFFEE2E2' : v > 60 ? 'FFFEF3C7' : 'FFF0FDF4' } }; c.font = { color: { argb: v > 90 ? 'FFDC2626' : v > 60 ? 'FFB45309' : 'FF15803D' }, bold: true }; });
    });

    // ═══ LIST 6 — PO NEDELJAMA (KW) ═══
    const nw = wb.addWorksheet('Po nedeljama');
    nw.columns = [{ width: 12 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 10 }];
    naslovRed(nw, 'Opterećenje po nedelji isporuke (KW), sati po tipu', 7);
    zaglavlje(nw, ['Nedelja', 'Štampa', 'Kaширanje', 'Rezanje', 'Špulne', 'Ukupno (h)', 'Naloga']);
    A.nedelje.forEach((w) => { nw.addRow([w.kw, h1(w.tip.stampa || 0), h1(w.tip.kasiranje || 0), h1((w.tip.rezanje || 0) + (w.tip.rezanje_tabaka || 0)), h1(w.tip.spulne || 0), h1(w.min), w.n]).getCell(6).font = { bold: true }; });

    // ── Snimanje / download ──
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Izvestaj_plana_' + A.datum.toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, naloga: A.kpi.naloga };
}
