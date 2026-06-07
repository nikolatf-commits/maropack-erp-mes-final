// MAROPACK linked order data helpers
// Cilj: jedan tok podataka Template -> Kalkulacija -> Ponuda -> Master nalog -> Operativni nalozi.

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }


export function makeProductMasterId(source = {}) {
  const s = safeJson(source, {}) || {};
  const raw = first(
    s.product_master_id,
    s.productMasterId,
    s.product_id,
    s.source_product_id,
    s.sifra,
    s.code,
    s.id
  );
  if (raw && String(raw).startsWith('PROD-')) return String(raw);
  if (raw) return 'PROD-' + String(raw).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toUpperCase();
  const seed = [s.kupac, s.klijent, s.naziv, s.proizvod, s.prod, s.tip, s.tip_proizvoda].filter(Boolean).join('-') || String(Date.now());
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return 'PROD-' + Math.abs(h).toString().padStart(6, '0').slice(0, 6);
}

export function extractTemplateVersion(source = {}, template = null) {
  const s = safeJson(source, {}) || {};
  const t = template || extractTemplate(s) || {};
  return first(s.template_version, s.verzija, t.template_version, t.verzija, t.data?.template_version, 'V1');
}

export function inferOperationsFromTemplate(template = {}, tipFallback = 'folija') {
  const { data, active, tip } = activeTemplateData(template, tipFallback);
  if (tip === 'kesa') return ['materijal', 'kasiranje', 'kesa'];
  if (tip === 'spulna') return ['materijal', 'formatiranje', 'spulna'];
  const layers = active?.layers || data?.folija?.layers || [];
  const hasPrint = layers.some(l => !!(l.stampa || l.stamp || l.Š)) || !!active?.stampa?.brojBoja;
  const hasKas = layers.length > 1 || !!active?.kasiranje?.brojKasiranja;
  const ops = ['materijal'];
  if (hasPrint) ops.push('stampa');
  if (hasKas) ops.push('kasiranje');
  ops.push('perforacija_rezanje');
  return ops;
}

export function safeJson(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v;
}

export function first(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
}

export function normalizeTip(tip) {
  const t = String(tip || 'folija').toLowerCase();
  if (t.includes('kes')) return 'kesa';
  if (t.includes('spul') || t.includes('špul')) return 'spulna';
  return 'folija';
}

export function extractTemplate(source = {}) {
  const s = safeJson(source, {}) || {};
  const direct = safeJson(first(
    s.product_template,
    s.template,
    s.templateData,
    s.template_data,
    s.productTemplate,
    s.data?.template,
    s.data?.product_template,
    s.parametri?.template,
    s.master_nalog?.product_template,
    s.master_nalog?.template
  ), null);

  if (direct) {
    if (direct.data) return direct;
    if (direct.type || direct.folija || direct.kesa || direct.spulna) {
      return {
        id: direct.id || source.template_id || source.product_template_id || null,
        naziv: direct.naziv || direct.name || source.naziv || source.prod || '',
        kupac: direct.kupac || source.kupac || '',
        tip: normalizeTip(direct.type || direct.tip || source.tip || source.tip_proizvoda),
        data: direct,
      };
    }
  }

  const data = safeJson(s.data, null);
  if (data && (data.type || data.folija || data.kesa || data.spulna || data.layers)) {
    return {
      id: s.template_id || s.product_template_id || data.id || null,
      naziv: s.naziv || data.naziv || '',
      kupac: s.kupac || data.kupac || '',
      tip: normalizeTip(s.tip || data.type || data.tip),
      data,
    };
  }

  return null;
}

export function extractKalkulacija(source = {}) {
  const s = safeJson(source, {}) || {};
  const k = safeJson(first(
    s.kalkulacija,
    s.kalkulacija_payload,
    s.kalkulacijaData,
    s.kalkulacija_data,
    s.data?.kalkulacija,
    s.master_nalog?.kalkulacija_payload
  ), null);
  if (k) return k;
  if (s.res || s.rezultat || s.osnovna_cena || s.konacna_cena || s.konacnaCena || s.kalkulacija_id) {
    return {
      id: s.kalkulacija_id || s.kalkulacije_id || null,
      tip: normalizeTip(s.tip || s.tip_proizvoda),
      naziv: s.naziv || s.prod || s.proizvod || '',
      klijent: s.klijent || s.kupac || '',
      kolicina: s.kolicina || s.kol || 0,
      res: s.res || s.rezultat || null,
      data: safeJson(s.data, null) || safeJson(s.struktura, null) || null,
      osnovna_cena: s.osnovna_cena || s.osnovnaCena || null,
      konacna_cena: s.konacna_cena || s.konacnaCena || s.c1 || s.uk || null,
    };
  }
  return null;
}

export function extractPonuda(source = {}) {
  const s = safeJson(source, {}) || {};
  const p = safeJson(first(s.ponuda_payload, s.ponuda, s.master_nalog?.ponuda_payload), null);
  if (p) return p;
  if (s.ponuda_id || s.ponId || s.broj || s.ponBr || s.broj_ponude) {
    return {
      id: s.ponuda_id || s.ponId || s.id || null,
      broj: s.broj || s.ponBr || s.broj_ponude || s.broj_naloga || '',
      kupac: s.kupac || s.klijent || '',
      naziv: s.naziv || s.prod || s.proizvod || '',
      tip: normalizeTip(s.tip || s.tip_proizvoda),
      kol: s.kol || s.kolicina || 0,
      c1: s.c1 || null,
      uk: s.uk || null,
      status: s.status || '',
    };
  }
  return null;
}

export function activeTemplateData(template, tipFallback = 'folija') {
  const tpl = template || {};
  const data = safeJson(tpl.data, tpl) || {};
  const tip = normalizeTip(data.type || data.tip || tpl.tip || tipFallback);
  return {
    template: tpl,
    data,
    tip,
    active: data[tip] || data.folija || data.kesa || data.spulna || data,
  };
}

export function normalizeLayers(source = {}, tipFallback = 'folija') {
  const template = extractTemplate(source);
  const { data, active } = activeTemplateData(template, tipFallback);
  const s = safeJson(source, {}) || {};
  const candidates = [
    s.materijali,
    s.mats,
    s.struktura,
    s.specifikacija,
    active?.layers,
    active?.materijali,
    data?.layers,
    safeJson(s.kalkulacija_payload, {})?.materijali,
    safeJson(s.ponuda_payload, {})?.mats,
  ];
  const arr = candidates.find(Array.isArray) || [];
  return arr.map((m, i) => ({
    ...m,
    sloj: m.sloj || m.layer || String.fromCharCode(65 + i),
    materijal: first(m.naziv, m.materijal, m.material, [m.vrsta, m.oznaka || m.oznaka_materijala, m.debljina ? `${m.debljina}µ` : ''].filter(Boolean).join(' ')),
    sirina: first(m.sirina, m.sirina_mm, m.width),
    potrebno: first(m.potrebno, m.metraza, m.m, m.duzina),
    kg: first(m.kg, m.potrebnoKg, m.tkg_nalog, m.tkg),
    lot: first(m.lot, m.LOT),
  }));
}

export function buildOrderSourcePack({ ponuda = {}, tipOperacije = 'materijal', tipProizvoda } = {}) {
  const pon = safeJson(ponuda, {}) || {};
  const tip = normalizeTip(tipProizvoda || pon.tip_proizvoda || pon.tip || pon.vrsta);
  const template = extractTemplate(pon);
  const kalkulacija = extractKalkulacija(pon);
  const ponudaPayload = extractPonuda(pon) || {
    id: pon.id || pon.ponuda_id || null,
    broj: pon.broj || pon.ponBr || pon.broj_ponude || '',
    kupac: pon.kupac || pon.klijent || '',
    naziv: pon.naziv || pon.prod || pon.proizvod || '',
    tip,
    kol: pon.kol || pon.kolicina || 0,
    c1: pon.c1 || null,
    uk: pon.uk || null,
    status: pon.status || '',
  };
  const { data, active } = activeTemplateData(template, tip);
  const materijali = normalizeLayers(pon, tip);
  const productMasterId = makeProductMasterId({ ...pon, ...(template || {}), ...(template?.data || {}) });
  const templateVersion = extractTemplateVersion(pon, template);
  const operacije = inferOperationsFromTemplate(template || { data }, tip);
  return {
    source_chain: 'template → kalkulacija → ponuda → nalog',
    product_master_id: productMasterId,
    template_version: templateVersion,
    template_locked: !!template,
    operacije_iz_template: operacije,
    source_status: {
      template: !!template,
      kalkulacija: !!kalkulacija,
      ponuda: !!ponudaPayload,
    },
    template_id: template?.id || pon.template_id || pon.product_template_id || null,
    source_product_id: pon.source_product_id || pon.product_id || null,
    product_template_id: template?.id || pon.product_template_id || pon.template_id || null,
    product_template: template,
    templateData: data,
    kalkulacija_id: pon.kalkulacija_id || pon.kalkulacije_id || kalkulacija?.id || null,
    kalkulacija_payload: kalkulacija,
    ponuda_id: pon.id || pon.ponuda_id || pon.ponId || null,
    ponuda_payload: ponudaPayload,
    order_data: {
      tip_proizvoda: tip,
      tip_operacije: tipOperacije,
      template,
      templateData: data,
      kalkulacija,
      ponuda: ponudaPayload,
      proizvod: {
        product_master_id: productMasterId,
        template_version: templateVersion,
        template_locked: !!template,
        kupac: first(pon.kupac, template?.kupac, ponudaPayload?.kupac),
        naziv: first(pon.prod, pon.proizvod, pon.naziv, template?.naziv, ponudaPayload?.naziv),
        sifra: first(active?.sifra, data?.sifra, pon.sifra),
        idealna_sirina: first(data?.idealnaSirinaMaterijala, active?.idealnaSirinaMaterijala, pon.idealna_sirina),
        porucena_kolicina: first(data?.porucenaKolicina, active?.porucenaKolicina, pon.kol, pon.kolicina),
      },
      materijali,
      operacije,
      folija: data?.folija || (tip === 'folija' ? active : {}),
      kesa: data?.kesa || (tip === 'kesa' ? active : {}),
      spulna: data?.spulna || data?.spulne || (tip === 'spulna' ? active : {}),
      tehnicki: data?.tehnicki || active?.tehnicki || {},
      pdf: data?.pdf || active?.pdf || {},
      kalkulacija_rezultat: pon.res || pon.rezultat || kalkulacija?.res || kalkulacija?.rezultat || null,
    },
  };
}

export function enrichNalogForPrint(nalog = {}) {
  const n = safeJson(nalog, {}) || {};
  const pack = buildOrderSourcePack({ ponuda: n, tipOperacije: n.tip_naloga || n.vrsta, tipProizvoda: n.tip_proizvoda || n.tip });
  return { ...n, ...pack, order_data: { ...(pack.order_data || {}), ...(safeJson(n.order_data, {}) || {}) } };
}
