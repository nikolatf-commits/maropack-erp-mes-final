// ─────────────────────────────────────────────────────────────────────────────
//  MAROPACK — planIzvestaj.js  [v2]
//  „Izvezi izveštaj (Excel)" iz Plana proizvodnje — sada sa NATIVE Excel grafikonima
//  (pravi kolonski/pita/bar grafikoni koji se mogu uređivati, a ne slike).
//  .xlsx se pravi ExcelJS-om (CDN), a grafikoni se ubacuju kao OOXML delovi preko JSZip-a (CDN).
//    List 1 Pregled    — KPI + ključni nalazi + 2 NATIVE grafikona (mašine, udeo)
//    List 2 Analize    — usko grlo (>85%) + nalozi koji probijaju rok
//    List 3 Po kupcima — naloga/sati/metri po kupcu + NATIVE bar grafikon
//    List 4 Nalozi     — svaka operacija jedan red (detaljno, auto-filter)
//    List 5 Zauzetost  — mašine × dani (%) sa toplотном skalom
//    List 6 Po nedeljama (KW) — sati po tipu + NATIVE kolonski grafikon
//  Sva analitika se računa iz ISTOG rasporeda kao kalendar (planRaspored.izracunajRaspored).
// ─────────────────────────────────────────────────────────────────────────────
import { radnoSada, izracunajRaspored, kapacitetDanaMasine, DAN_MIN, DAN_OD } from './planRaspored.js';
import { procenaMinNaMasini, OP_LABELE } from './nalogMetrika.js';

const OP_BOJA = { stampa: '2563EB', lakiranje: '7C3AED', kasiranje: '0D9488', rezanje: 'DC2626', rezanje_tabaka: '0D9488', pravljenje_creva: '4338CA', formatiranje: 'EA580C', kese: '16A34A', spulne: 'D97706', ostalo: '64748B' };
const OP_NAZIV = { stampa: 'Štampa', kasiranje: 'Kaширanje', rezanje: 'Rezanje', rezanje_tabaka: 'Rezanje tabaka', pravljenje_creva: 'Pravljenje creva', formatiranje: 'Formatiranje', kese: 'Kese', spulne: 'Špulne', lakiranje: 'Lakiranje', ostalo: 'Operacija' };
const KUPAC_BOJA = '7C3AED';
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

// ── Učitaj biblioteke sa CDN-a (jednom) ──
function ucitajSkriptu(src, globalno) {
    if (typeof window !== 'undefined' && window[globalno]) return Promise.resolve(window[globalno]);
    return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.onload = () => res(window[globalno]);
        s.onerror = () => rej(new Error('Ne mogu da učitam ' + globalno + ' (proveri internet).'));
        document.head.appendChild(s);
    });
}
const ucitajExcelJS = () => ucitajSkriptu('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js', 'ExcelJS');
const ucitajJSZip = () => ucitajSkriptu('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');

// ═══════════════════════════════════════════════════════════════════════════
//  ANALITIKA iz plana (nepromenjena logika — isti izvor kao kalendar)
// ═══════════════════════════════════════════════════════════════════════════
export function izgradiAnalitiku({ machines, plan, orderMap, opStatusi = {} }) {
    const sidro = radnoSada();
    const raspored = izracunajRaspored({ machines, plan, orderMap, opStatusi, sidro }) || [];
    const poId = {}; (machines || []).forEach((m) => { poId[m.id] = m; });
    const segs = raspored.filter((s) => s && !s.eksterno && s.o && s.masinaId && poId[s.masinaId]);
    segs.forEach((s) => {
        const m = poId[s.masinaId];
        s._min = procenaMinNaMasini(m, s.o.metri) || Math.max(1, Math.round((s.o.metri || 0) / 100));
        s._kw = s.o.nedelja || isoNedelja(s.o.rok);
    });
    const poMasini = {};
    segs.forEach((s) => { const k = s.masinaId; (poMasini[k] = poMasini[k] || { m: poId[k], min: 0, n: 0 }); poMasini[k].min += s._min; poMasini[k].n++; });
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
    const rokovi = segs.filter((s) => s.probija).map((s) => ({ s, kasni: s.kasniDana || 0 })).sort((a, b) => b.kasni - a.kasni);
    const poKupcu = {};
    segs.forEach((s) => { const k = s.o.customer || '—'; (poKupcu[k] = poKupcu[k] || { kupac: k, n: 0, min: 0, metri: 0, probija: 0 }); poKupcu[k].n++; poKupcu[k].min += s._min; poKupcu[k].metri += Number(s.o.metri) || 0; if (s.probija) poKupcu[k].probija++; });
    const kupci = Object.values(poKupcu).sort((a, b) => b.min - a.min);
    const poTipu = {};
    segs.forEach((s) => { const k = s.o.opTip || 'ostalo'; poTipu[k] = (poTipu[k] || 0) + s._min; });
    const ukMin = Object.values(poTipu).reduce((a, b) => a + b, 0) || 1;
    const tipovi = Object.entries(poTipu).map(([k, min]) => ({ k, min, pct: Math.round(min / ukMin * 100) })).sort((a, b) => b.min - a.min);
    const poKW = {};
    segs.forEach((s) => { const kw = s._kw || '—'; (poKW[kw] = poKW[kw] || { kw, min: 0, n: 0, tip: {} }); poKW[kw].min += s._min; poKW[kw].n++; poKW[kw].tip[s.o.opTip] = (poKW[kw].tip[s.o.opTip] || 0) + s._min; });
    const nedelje = Object.values(poKW).sort((a, b) => String(a.kw).localeCompare(String(b.kw), 'sr', { numeric: true }));
    const planMin = segs.reduce((a, s) => a + s._min, 0);
    const aktivne = (machines || []).filter((m) => m.status === 'aktivna').length;
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

// ═══════════════════════════════════════════════════════════════════════════
//  NATIVE EXCEL GRAFIKONI — OOXML delovi ubačeni posle ExcelJS (preko JSZip)
// ═══════════════════════════════════════════════════════════════════════════
const NSc = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NSa = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NSr = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NSxdr = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const NSrel = 'http://schemas.openxmlformats.org/package/2006/relationships';
const gEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function gStrRef(f, cache) {
    const pts = cache.map((v, i) => `<c:pt idx="${i}"><c:v>${gEsc(v)}</c:v></c:pt>`).join('');
    return `<c:strRef><c:f>${gEsc(f)}</c:f><c:strCache><c:ptCount val="${cache.length}"/>${pts}</c:strCache></c:strRef>`;
}
function gNumRef(f, cache, fmt) {
    const pts = cache.map((v, i) => `<c:pt idx="${i}"><c:v>${Number(v) || 0}</c:v></c:pt>`).join('');
    return `<c:numRef><c:f>${gEsc(f)}</c:f><c:numCache><c:formatCode>${fmt || 'General'}</c:formatCode><c:ptCount val="${cache.length}"/>${pts}</c:numCache></c:numRef>`;
}
function gDPts(colors) {
    return (colors || []).map((col, i) => `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${col}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('');
}
function gTitle(t) {
    return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="sr-RS" sz="1200" b="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>${gEsc(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
}
function gChartXml(spec) {
    const cat = `<c:cat>${gStrRef(spec.catRef, spec.cats)}</c:cat>`;
    const val = `<c:val>${gNumRef(spec.valRef, spec.vals, spec.numFmt)}</c:val>`;
    const tx = `<c:tx>${gStrRef(spec.valRef, [spec.serName || 'Serija'])}</c:tx>`;
    if (spec.type === 'pie') {
        const plot = `<c:pieChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${tx}${gDPts(spec.colors)}<c:dLbls><c:numFmt formatCode="0%" sourceLinked="0"/><c:spPr><a:noFill/></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="sr-RS"/></a:p></c:txPr><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/></c:dLbls>${cat}${val}</c:ser><c:firstSliceAng val="0"/></c:pieChart>`;
        return gWrap(spec, plot);
    }
    const barDir = spec.type === 'bar' ? 'bar' : 'col';
    const catPos = spec.type === 'bar' ? 'l' : 'b';
    const valPos = spec.type === 'bar' ? 'b' : 'l';
    const catOri = spec.type === 'bar' ? 'maxMin' : 'minMax';
    const plot = `<c:barChart><c:barDir val="${barDir}"/><c:grouping val="clustered"/><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${tx}${gDPts(spec.colors)}<c:dLbls><c:numFmt formatCode="${gEsc(spec.numFmt || 'General')}" sourceLinked="0"/><c:spPr><a:noFill/></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1"><a:solidFill><a:srgbClr val="334155"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="sr-RS"/></a:p></c:txPr><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>${cat}${val}</c:ser><c:gapWidth val="55"/><c:axId val="111111111"/><c:axId val="222222222"/></c:barChart>` +
        `<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="${catOri}"/></c:scaling><c:delete val="0"/><c:axPos val="${catPos}"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="475569"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="sr-RS"/></a:p></c:txPr><c:crossAx val="222222222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
        `<c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${valPos}"/><c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="EEF2F6"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="General" sourceLinked="1"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="94A3B8"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="sr-RS"/></a:p></c:txPr><c:crossAx val="111111111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
    return gWrap(spec, plot);
}
function gWrap(spec, plotInner) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<c:chartSpace xmlns:c="${NSc}" xmlns:a="${NSa}" xmlns:r="${NSr}"><c:roundedCorners val="0"/>` +
        `<c:chart>${gTitle(spec.title)}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plotInner}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>` +
        (spec.type === 'pie' ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="950"/></a:pPr><a:endParaRPr lang="sr-RS"/></a:p></c:txPr></c:legend>` : '') +
        `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
        `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:chartSpace>`;
}
function gDrawingXml(frames) {
    const body = frames.map((fr, i) =>
        `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${fr.a.fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fr.a.fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
        `<xdr:to><xdr:col>${fr.a.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fr.a.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Grafikon ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
        `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
        `<a:graphic><a:graphicData uri="${NSc}"><c:chart xmlns:c="${NSc}" xmlns:r="${NSr}" r:id="${fr.rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
    ).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="${NSxdr}" xmlns:a="${NSa}">${body}</xdr:wsDr>`;
}
async function ubaciGrafikone(buffer, specs, JSZipCtor) {
    const zip = await JSZipCtor.loadAsync(buffer);
    const wbXml = await zip.file('xl/workbook.xml').async('string');
    const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const relMap = {};
    relsXml.replace(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g, (m, id, tgt) => { relMap[id] = tgt; return m; });
    const sheetFile = {};
    wbXml.replace(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g, (m, name, rid) => {
        let t = (relMap[rid] || '').replace(/^\/?/, ''); if (t && !t.startsWith('xl/')) t = 'xl/' + t;
        sheetFile[name] = t; return m;
    });
    const bySheet = {};
    specs.forEach((s) => { (bySheet[s.sheetName] = bySheet[s.sheetName] || []).push(s); });
    let chartN = 0, drawingN = 0; const ctAdds = [];
    for (const sheetName of Object.keys(bySheet)) {
        const wsPath = sheetFile[sheetName];
        if (!wsPath || !zip.file(wsPath)) continue;
        const sheetNum = (wsPath.match(/sheet(\d+)\.xml$/) || [])[1];
        drawingN++;
        const drawingPath = `xl/drawings/drawing${drawingN}.xml`;
        const frames = []; const drawRels = [];
        for (const spec of bySheet[sheetName]) {
            chartN++;
            zip.file(`xl/charts/chart${chartN}.xml`, gChartXml(spec));
            ctAdds.push(`<Override PartName="/xl/charts/chart${chartN}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
            const rid = 'rId' + (drawRels.length + 1);
            drawRels.push(`<Relationship Id="${rid}" Type="${NSr}/chart" Target="../charts/chart${chartN}.xml"/>`);
            frames.push({ a: spec.anchor, rid });
        }
        zip.file(drawingPath, gDrawingXml(frames));
        zip.file(`xl/drawings/_rels/drawing${drawingN}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NSrel}">${drawRels.join('')}</Relationships>`);
        ctAdds.push(`<Override PartName="/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
        const wsRelsPath = `xl/worksheets/_rels/sheet${sheetNum}.xml.rels`;
        let wsRels = zip.file(wsRelsPath) ? await zip.file(wsRelsPath).async('string') : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NSrel}"></Relationships>`;
        const existing = (wsRels.match(/Id="rId(\d+)"/g) || []).map((x) => +x.replace(/\D/g, ''));
        const drId = 'rId' + ((existing.length ? Math.max(...existing) : 0) + 1);
        wsRels = wsRels.replace('</Relationships>', `<Relationship Id="${drId}" Type="${NSr}/drawing" Target="../drawings/drawing${drawingN}.xml"/></Relationships>`);
        zip.file(wsRelsPath, wsRels);
        let ws = await zip.file(wsPath).async('string');
        if (!/<drawing\b/.test(ws)) ws = ws.replace('</worksheet>', `<drawing r:id="${drId}"/></worksheet>`);
        zip.file(wsPath, ws);
    }
    let ct = await zip.file('[Content_Types].xml').async('string');
    ct = ct.replace('</Types>', ctAdds.join('') + '</Types>');
    zip.file('[Content_Types].xml', ct);
    return zip.generateAsync({ type: typeof window === 'undefined' ? 'nodebuffer' : 'blob', compression: 'DEFLATE' });
}

// ── Pomoćne za ExcelJS stil ──
function naslovRed(ws, tekst, span, vel) {
    const r = ws.addRow([tekst]); r.font = { bold: true, size: vel || 14, color: { argb: 'FF0F172A' } }; r.height = (vel || 14) + 8;
    if (span) ws.mergeCells(r.number, 1, r.number, span); return r;
}
function zaglavlje(ws, kolone) {
    const r = ws.addRow(kolone); r.height = 18;
    r.eachCell((c) => { c.font = { bold: true, color: { argb: 'FF15803D' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F3EC' } }; c.border = { bottom: { style: 'thin', color: { argb: 'FFBBD6C4' } } }; c.alignment = { vertical: 'middle' }; }); return r;
}

// ═══════════════════════════════════════════════════════════════════════════
//  GLAVNA: izvoz
// ═══════════════════════════════════════════════════════════════════════════
export async function izveziPlanExcel(ctx) {
    const [ExcelJS, JSZip] = await Promise.all([ucitajExcelJS(), ucitajJSZip()]);
    const A = izgradiAnalitiku(ctx);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MAROPACK'; wb.created = A.datum;
    const danStr = A.datum.toLocaleDateString('sr-RS');
    const specs = [];  // native grafikoni (ubacuju se na kraju)

    // ═══ LIST 1 — PREGLED ═══
    const p = wb.addWorksheet('Pregled', { properties: { tabColor: { argb: 'FF217346' } } });
    p.columns = [{ width: 24 }, { width: 13 }, { width: 3 }, { width: 24 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }];
    naslovRed(p, 'MAROPACK — Izveštaj plana proizvodnje', 8, 15);
    const sub = p.addRow(['Datum izveštaja: ' + danStr]); sub.font = { color: { argb: 'FF64748B' } };
    p.addRow([]);
    // KPI
    const kpis = [['Naloga u planu', A.kpi.naloga], ['Planirani rad (h)', A.kpi.sati], ['Mašina aktivno', A.kpi.masAktivno + '/' + A.kpi.masUkupno], ['Pros. zauzetost', A.kpi.prosZauz + '%'], ['Probija rok', A.kpi.probija], ['Najveća gužva', A.kpi.najKW]];
    const kv = p.addRow(kpis.map((k) => k[1])); kv.height = 28;
    kv.eachCell((c, col) => { if (col > kpis.length) return; const crven = col === 5 && A.kpi.probija > 0; c.font = { bold: true, size: 18, color: { argb: crven ? 'FFDC2626' : 'FF0F172A' } }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: crven ? 'FFFEF2F2' : 'FFF1F5F9' } }; c.border = { top: { style: 'medium', color: { argb: crven ? 'FFDC2626' : 'FF217346' } } }; });
    const kl = p.addRow(kpis.map((k) => k[0])); kl.height = 15;
    kl.eachCell((c, col) => { if (col > kpis.length) return; c.font = { bold: true, size: 9, color: { argb: 'FF64748B' } }; c.alignment = { horizontal: 'center' }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col === 5 && A.kpi.probija > 0 ? 'FFFEF2F2' : 'FFF1F5F9' } }; c.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } }; });
    p.addRow([]);
    // Ključni nalazi
    naslovRed(p, '🔎 Ključni nalazi', 8, 12);
    const nalazi = [];
    if (A.topUtil.pct) nalazi.push('• Usko grlo: ' + (A.topUtil.m.code || A.topUtil.m.name) + ' — ' + A.topUtil.pct + '% dnevnog kapaciteta (' + fmtDatum(A.topUtil.dk) + ').');
    if (A.rokovi.length) nalazi.push('• ' + A.rokovi.length + ' naloga probija rok (najviše: ' + A.rokovi.slice(0, 3).map((r) => (r.s.o.id || '') + ' +' + r.kasni + 'd').join(', ') + ').');
    if (A.kpi.najKW !== '—') nalazi.push('• Najveće opterećenje u ' + A.kpi.najKW + '.');
    if (A.tipovi.length) nalazi.push('• Udeo po operaciji: ' + A.tipovi.slice(0, 4).map((t) => (OP_NAZIV[t.k] || t.k) + ' ' + t.pct + '%').join(', ') + '.');
    if (!nalazi.length) nalazi.push('• Nema naloga u planu — rasporedi naloge pa izvezi.');
    nalazi.forEach((t) => { const r = p.addRow([t]); p.mergeCells(r.number, 1, r.number, 8); r.getCell(1).alignment = { wrapText: true }; r.getCell(1).font = { color: { argb: 'FF334155' } }; });
    p.addRow([]);
    // Izvorne mini-tabele (za grafikone) — Mašine (A:B) i Tipovi (D:E)
    const topMas = A.poMasini.slice(0, 8);
    const hr = p.addRow(['Mašina', 'Sati (h)', '', 'Operacija', 'Udeo %']);
    hr.eachCell((c) => { if (!c.value) return; c.font = { bold: true, color: { argb: 'FF15803D' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F3EC' } }; c.border = { bottom: { style: 'thin', color: { argb: 'FFBBD6C4' } } }; });
    const dStart = hr.number + 1;
    const nRows = Math.max(topMas.length, A.tipovi.length);
    for (let i = 0; i < nRows; i++) {
        const m = topMas[i]; const t = A.tipovi[i];
        const r = p.addRow([ m ? (m.m.code || m.m.name || '') : null, m ? h1(m.min) : null, '', t ? (OP_NAZIV[t.k] || t.k) : null, t ? t.pct / 100 : null ]);
        r.getCell(2).numFmt = '#,##0.0';
        if (t) r.getCell(5).numFmt = '0%';
    }
    const mEnd = dStart + topMas.length - 1;
    const tEnd = dStart + A.tipovi.length - 1;
    // native grafikoni — stacked vertikalno, pune širine (A..H)
    const grTop = p.lastRow.number + 1;   // prvi slobodan red ispod tabela
    if (topMas.length) specs.push({ sheetName: 'Pregled', type: 'col', title: 'Vreme po mašini (h)', serName: 'Sati',
        cats: topMas.map((m) => m.m.code || m.m.name || ''), vals: topMas.map((m) => h1(m.min)), colors: topMas.map((m) => OP_BOJA[m.m.type] || '2563EB'), numFmt: '0.0',
        catRef: `Pregled!$A$${dStart}:$A$${mEnd}`, valRef: `Pregled!$B$${dStart}:$B$${mEnd}`,
        anchor: { fromCol: 0, fromRow: grTop, toCol: 8, toRow: grTop + 16 } });
    if (A.tipovi.length) specs.push({ sheetName: 'Pregled', type: 'pie', title: 'Udeo po tipu operacije',
        cats: A.tipovi.map((t) => OP_NAZIV[t.k] || t.k), vals: A.tipovi.map((t) => t.pct / 100), colors: A.tipovi.map((t) => OP_BOJA[t.k] || '64748B'), numFmt: '0%',
        catRef: `Pregled!$D$${dStart}:$D$${tEnd}`, valRef: `Pregled!$E$${dStart}:$E$${tEnd}`,
        anchor: { fromCol: 0, fromRow: grTop + 17, toCol: 8, toRow: grTop + 35 } });
    p.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: 'portrait', margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    p.pageSetup.printArea = `A1:H${grTop + 36}`;

    // ═══ LIST 2 — ANALIZE ═══
    const an = wb.addWorksheet('Analize');
    an.columns = [{ width: 24 }, { width: 14 }, { width: 11 }, { width: 18 }, { width: 34 }];
    naslovRed(an, 'Usko grlo (zauzetost > 85%)', 5);
    zaglavlje(an, ['Mašina', 'Dan', 'Zauzetost', 'Minuta / kapacitet', 'Predlog']);
    if (!A.uskaGrla.length) an.addRow(['Nema uskih grla iznad 85%.']);
    A.uskaGrla.slice(0, 20).forEach((u) => {
        const r = an.addRow([(u.m.code || '') + ' ' + u.m.name, fmtDatum(u.dk), u.pct / 100, Math.round(u.min) + ' / ' + u.cap, u.pct >= 90 ? 'Preraspodeliti deo na slobodniju mašinu' : 'Pratiti']);
        r.getCell(3).numFmt = '0%'; r.getCell(3).font = { bold: true, color: { argb: u.pct >= 90 ? 'FFDC2626' : 'FFB45309' } };
    });
    an.addRow([]); an.addRow([]);
    naslovRed(an, 'Nalozi koji probijaju rok', 5);
    zaglavlje(an, ['Nalog', 'Kupac', 'Operacija', 'Rok', 'Kašnjenje']);
    if (!A.rokovi.length) an.addRow(['Nema naloga koji probijaju rok. 👍']);
    A.rokovi.slice(0, 40).forEach((r) => {
        const s = r.s; const row = an.addRow([s.o.id, s.o.customer || '—', OP_NAZIV[s.o.opTip] || s.o.opTip, (s._kw ? s._kw + ' · ' : '') + fmtDatum(s.o.rok), '+' + r.kasni + ' dana']);
        row.getCell(5).font = { bold: true, color: { argb: 'FFDC2626' } };
    });
    an.views = [{ state: 'frozen', ySplit: 2 }];
    an.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };

    // ═══ LIST 3 — PO KUPCIMA ═══
    const pk = wb.addWorksheet('Po kupcima');
    pk.columns = [{ width: 30 }, { width: 11 }, { width: 11 }, { width: 14 }, { width: 13 }];
    naslovRed(pk, 'Opterećenje po kupcu', 5);
    const pkH = zaglavlje(pk, ['Kupac', 'Naloga', 'Sati', 'Metri', 'Probija rok']);
    const pkStart = pkH.number + 1;
    A.kupci.forEach((k) => { const r = pk.addRow([k.kupac, k.n, h1(k.min), Math.round(k.metri), k.probija]); r.getCell(3).numFmt = '#,##0.0'; r.getCell(4).numFmt = '#,##0'; if (k.probija > 0) r.getCell(5).font = { color: { argb: 'FFDC2626' }, bold: true }; });
    const topK = A.kupci.slice(0, 10);
    const pkEnd = pkStart + topK.length - 1;
    const grK = pk.lastRow.number + 2;
    if (topK.length) specs.push({ sheetName: 'Po kupcima', type: 'bar', title: 'Sati po kupcu (top ' + topK.length + ')', serName: 'Sati',
        cats: topK.map((k) => String(k.kupac)), vals: topK.map((k) => h1(k.min)), colors: topK.map(() => KUPAC_BOJA), numFmt: '0.0',
        catRef: `'Po kupcima'!$A$${pkStart}:$A$${pkEnd}`, valRef: `'Po kupcima'!$C$${pkStart}:$C$${pkEnd}`,
        anchor: { fromCol: 0, fromRow: grK, toCol: 5, toRow: grK + 18 } });
    pk.views = [{ state: 'frozen', ySplit: 2 }];
    pk.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    pk.pageSetup.printArea = `A1:E${grK + 19}`;

    // ═══ LIST 4 — NALOZI PO MAŠINAMA ═══
    const nl = wb.addWorksheet('Nalozi');
    nl.columns = [{ width: 22 }, { width: 18 }, { width: 22 }, { width: 16 }, { width: 11 }, { width: 12 }, { width: 18 }, { width: 10 }, { width: 8 }];
    naslovRed(nl, 'Radni nalozi po mašinama', 9);
    zaglavlje(nl, ['Mašina', 'Nalog', 'Kupac', 'Operacija', 'Metri', 'Vreme (min)', 'Gotov', 'Rok (KW)', 'Perf.']);
    nl.views = [{ state: 'frozen', ySplit: 2 }];
    nl.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 9 } };
    A.segs.slice().sort((a, b) => a.start - b.start).forEach((s, i) => {
        const r = nl.addRow([(A.poId[s.masinaId].code || '') + ' ' + A.poId[s.masinaId].name, s.o.id, s.o.customer || '—', OP_NAZIV[s.o.opTip] || s.o.opTip, Math.round(s.o.metri) || null, Math.round(s._min), s.end ? new Date(s.end).toLocaleString('sr-RS') : '', s._kw || '', s.o.perforacija ? 'DA' : '']);
        if (i % 2) r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
        r.getCell(5).numFmt = '#,##0'; r.getCell(6).numFmt = '#,##0';
        if (s.o.perforacija) r.getCell(9).font = { bold: true, color: { argb: 'FFDC2626' } };
    });
    nl.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: 'landscape', margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };

    // ═══ LIST 5 — ZAUZETOST (mašine × dani) ═══
    const zz = wb.addWorksheet('Zauzetost');
    const daniKol = A.daniSort.slice(0, 21);
    zz.columns = [{ width: 24 }, ...daniKol.map(() => ({ width: 8 }))];
    naslovRed(zz, 'Zauzetost mašina po danu (%)', 1 + daniKol.length);
    zaglavlje(zz, ['Mašina', ...daniKol.map((dk) => new Date(dk).toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit' }))]);
    A.poMasini.forEach((pm) => {
        const row = [(pm.m.code || '') + ' ' + pm.m.name];
        daniKol.forEach((dk) => { const min = A.zauz[pm.m.id + '|' + dk] || 0; const cap = kapacitetDanaMasine(pm.m, new Date(dk)) || DAN_MIN; row.push(min > 0 ? Math.round(min / cap * 100) / 100 : null); });
        const r = zz.addRow(row);
        r.eachCell((c, col) => { if (col === 1 || c.value == null) return; const v = Math.round(Number(c.value) * 100); c.numFmt = '0%'; c.alignment = { horizontal: 'center' }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: v > 90 ? 'FFFEE2E2' : v > 60 ? 'FFFEF3C7' : 'FFF0FDF4' } }; c.font = { color: { argb: v > 90 ? 'FFDC2626' : v > 60 ? 'FFB45309' : 'FF15803D' }, bold: true }; });
    });
    zz.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];
    zz.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: 'landscape', margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };

    // ═══ LIST 6 — PO NEDELJAMA (KW) ═══
    const nw = wb.addWorksheet('Po nedeljama');
    nw.columns = [{ width: 12 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 10 }];
    naslovRed(nw, 'Opterećenje po nedelji isporuke (KW)', 7);
    const nwH = zaglavlje(nw, ['Nedelja', 'Štampa', 'Kaширanje', 'Rezanje', 'Špulne', 'Ukupno (h)', 'Naloga']);
    const nwStart = nwH.number + 1;
    A.nedelje.forEach((w) => { const r = nw.addRow([w.kw, h1(w.tip.stampa || 0), h1(w.tip.kasiranje || 0), h1((w.tip.rezanje || 0) + (w.tip.rezanje_tabaka || 0)), h1(w.tip.spulne || 0), h1(w.min), w.n]); [2, 3, 4, 5, 6].forEach((c) => r.getCell(c).numFmt = '#,##0.0'); r.getCell(6).font = { bold: true }; });
    const nwEnd = nwStart + A.nedelje.length - 1;
    const grW = nw.lastRow.number + 2;
    if (A.nedelje.length) specs.push({ sheetName: 'Po nedeljama', type: 'col', title: 'Ukupno sati po nedelji (KW)', serName: 'Sati',
        cats: A.nedelje.map((w) => String(w.kw)), vals: A.nedelje.map((w) => h1(w.min)), colors: A.nedelje.map(() => '217346'), numFmt: '0.0',
        catRef: `'Po nedeljama'!$A$${nwStart}:$A$${nwEnd}`, valRef: `'Po nedeljama'!$F$${nwStart}:$F$${nwEnd}`,
        anchor: { fromCol: 0, fromRow: grW, toCol: 7, toRow: grW + 17 } });
    nw.views = [{ state: 'frozen', ySplit: 2 }];
    nw.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    nw.pageSetup.printArea = `A1:G${grW + 18}`;

    // ── Snimanje: ExcelJS bafer → ubaci native grafikone → download ──
    let out;
    const buf = await wb.xlsx.writeBuffer();
    try { out = await ubaciGrafikone(buf, specs, JSZip); }
    catch (e) { out = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); }  // fallback: bez grafikona, ali ispravan .xlsx
    const blob = (typeof Blob !== 'undefined' && out instanceof Blob) ? out : new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Izvestaj_plana_' + A.datum.toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, naloga: A.kpi.naloga };
}
