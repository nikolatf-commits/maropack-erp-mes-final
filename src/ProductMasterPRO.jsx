import React, { useMemo, useState } from "react";
import { supabase } from "./supabase.js";

const BLUE = "#2563eb";
const GREEN = "#059669";
const ORANGE = "#f59e0b";
const PURPLE = "#7c3aed";
const RED = "#dc2626";

const sampleProducts = [];

function normalizeTip(tip) {
  const t = String(tip || "").toLowerCase();
  if (t.includes("kes")) return "kesa";
  if (t.includes("spul") || t.includes("špul")) return "spulna";
  return "folija";
}

function statusColor(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("akt")) return GREEN;
  if (s.includes("raz")) return ORANGE;
  if (s.includes("stop")) return RED;
  return BLUE;
}

function tipColor(tip) {
  const t = normalizeTip(tip);
  if (t === "kesa") return ORANGE;
  if (t === "spulna") return PURPLE;
  return BLUE;
}

function makeProductMasterId(source = {}) {
  const raw = source.product_master_id || source.productMasterId || source.id || source.sifra || source.naziv;
  if (raw && String(raw).startsWith('PROD-')) return String(raw);
  if (raw && String(raw).startsWith('PRD-')) return 'PROD-' + String(raw).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toUpperCase();
  const seed = [source.kupac, source.naziv, source.sifra, source.tip].filter(Boolean).join('-') || String(Date.now());
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return 'PROD-' + Math.abs(h).toString().padStart(6, '0').slice(0, 6);
}

function inferOperations(template = {}, tip = 'folija') {
  if (tip === 'kesa') return ['materijal', 'kasiranje', 'kesa'];
  if (tip === 'spulna') return ['materijal', 'formatiranje', 'spulna'];
  const layers = template.folija?.layers || [];
  const ops = ['materijal'];
  if (layers.some(l => l?.stampa || l?.stamp || l?.Š) || template.folija?.stampa?.brojBoja) ops.push('stampa');
  if (layers.length > 1 || template.folija?.kasiranje?.brojKasiranja) ops.push('kasiranje');
  ops.push('perforacija_rezanje');
  return ops;
}

function normalizeLayer(l = {}, product = {}) {
  const ideal = l.idealna_sirina || l.idealnaSirina || l.sirina || product.sir || product.sirina || product.idealna_sirina || "";
  return {
    vrsta: l.vrsta || l.tip || l.material || l.materijal || "—",
    pod_vrsta: l.pod_vrsta || l.podVrsta || l.podvrsta || l.subtype || "—",
    oznaka: l.oznaka || l.oznaka_materijala || l.sifra || l.material || "—",
    proizvodjac: l.proizvodjac || l.proizvođač || l.dobavljac || "—",
    debljina: l.debljina || l.deb || "—",
    koef: l.koef || l.koeficijent || "—",
    gsm: l.gsm || l.tezina || l.gm2 || "—",
    sirina: ideal || "—",
    cena: l.cena || l.price || "—",
    spoj_materijala: l.spoj_materijala || l.spojMaterijala || l.spoj || "—",
    broj_spojeva: l.broj_spojeva || l.brojSpojeva || l.spojeva || "—",
    stampa: !!(l.stampa || l.stamp || l.Š),
    lak: !!(l.lak || l.L)
  };
}

function productDataForm(p = {}, tip = normalizeTip(p.tip)) {
  const std = p.standardi || {};
  const rec = std.record || {};
  const existing = p.data || p.template || rec.data;
  if (existing && typeof existing === "object") {
    return {
      ...existing,
      type: normalizeTip(existing.type || p.tip || tip),
      naziv: existing.naziv || p.naziv || "",
      kupac: existing.kupac || p.kupac || "",
      sifra: existing.sifra || p.sku || "",
      product_master_id: p.product_master_id || existing.product_master_id || ('PROD-' + p.id),
      template_id: p.template_id || existing.template_id || ('TPL-' + p.id),
      template_version: p.template_version || existing.template_version || "V1",
      db_id: p.id,
      template_locked: true
    };
  }
  const layersRaw = Array.isArray(p.materijali_struktura) ? p.materijali_struktura : (Array.isArray(p.mats) ? p.mats : []);
  const layers = layersRaw.map(l => ({
    ...l,
    vrsta: l.vrsta || l.tip || l.materijal || "",
    pod_vrsta: l.pod_vrsta || l.podVrsta || l.podvrsta || "",
    oznaka: l.oznaka || l.oznaka_materijala || "",
    proizvodjac: l.proizvodjac || l.dobavljac || "",
    debljina: l.debljina || l.deb || "",
    sirina: l.sirina || p.sir || p.sirina || "",
    stampa: !!(l.stampa || l.stamp),
    lak: !!(l.lak || l.L)
  }));
  return {
    type: tip,
    naziv: p.naziv || "",
    kupac: p.kupac || "",
    sifra: p.sku || "",
    product_master_id: p.product_master_id || ('PROD-' + p.id),
    template_id: p.template_id || ('TPL-' + p.id),
    template_version: p.template_version || "V1",
    db_id: p.id,
    template_locked: true,
    idealnaSirinaMaterijala: p.sir || p.sirina || "",
    porucenaKolicina: p.met || "",
    [tip]: {
      naziv: p.naziv || "",
      layers,
      rezanje: { sirinaMaterijala: p.sir || p.sirina || "" },
      kolicina: p.nal || p.kolicina || "",
      sirina: p.kesa_sirina || "",
      duzina: p.kesa_duzina || "",
      klapna: p.kesa_klapna || ""
    }
  };
}

function mapProduct(p, index) {
  const tip = normalizeTip(p.tip || p.tip_proizvoda);
  const data = productDataForm(p, tip);
  const section = data[tip] || {};
  const layersRaw = section.layers || data.folija?.layers || data.kesa?.layers || data.spulna?.layers || p.materijali_struktura || p.mats || [];
  const layers = Array.isArray(layersRaw) ? layersRaw : [];
  return {
    id: p.id || `PRD-${index}`,
    db_id: p.id || null,
    product_master_id: p.product_master_id || data.product_master_id || makeProductMasterId({ ...p, ...data, id: p.id }),
    template_id: p.template_id || data.template_id || (p.id ? 'TPL-' + p.id : null),
    naziv: p.naziv || p.proizvod || section.naziv || data.naziv || "Bez naziva",
    kupac: p.kupac || data.kupac || "Bez kupca",
    tip,
    status: p.status || section.status || "aktivan",
    verzija: p.template_version || data.template_version || p.verzija || "V1",
    sifra: p.sku || p.sifra || data.sifra || "—",
    datum: p.datum || (p.created_at ? new Date(p.created_at).toLocaleDateString("sr-RS") : "—"),
    operacije: Array.isArray(p.operacije) ? p.operacije : inferOperations(data, tip),
    materijali: layers.map((l) => normalizeLayer(l, p)),
    stampa: {
      boje: section.stampa?.brojBoja || section.brojBoja || "—",
      klise: section.stampa?.klise || "info",
      lak: section.stampa?.lak || "—",
      napomena: section.stampa?.napomena || "Kliše je informativan i ne ulazi automatski u cenu."
    },
    perforacija: {
      tip: section.kpdf?.enabled ? section.kpdf?.tip : section.options?.eurozumba ? "Eurozumba" : section.options?.mikroperforacija ? "Mikroperforacija" : "Nema",
      odnos: section.kpdf?.odnos || "—",
      pozicija: section.kpdf?.pozicija || "—"
    },
    finalnaRolna: {
      smer: section.finalRoll?.smerOdmotavanja || section.stampa?.smerOdmotavanja || section.smer || "—",
      hilzna: section.finalRoll?.hilzna || section.stampa?.precnikHilzne || "—",
      precnik: section.finalRoll?.precnik || section.rezanje?.precnikRolne || "—",
      duzina: section.finalRoll?.duzina || section.rezanje?.duzinaRolne || section.maxMetara || "—"
    },
    dokumentacija: {
      kpdf: section.kpdf?.enabled ? "Aktivan" : "Nije dodat",
      tehnickiList: "Priprema",
      slike: "—"
    },
    raw: { ...p, data }
  };
}



function materialRowsToTemplateLayers(rows = []) {
  return (rows || []).map((r) => ({
    material: [r.vrsta, r.oznaka].filter(Boolean).join(" ").trim(),
    materijal: r.vrsta || "",
    vrsta: r.vrsta || "",
    pod_vrsta: r.pod_vrsta || "",
    oznaka: r.oznaka || "",
    proizvodjac: r.proizvodjac || "",
    debljina: r.debljina || "",
    koef: r.koef || "",
    gsm: r.gsm || "",
    tezina: r.gsm || "",
    sirina: r.sirina || "",
    cena: r.cena || "",
    spoj_materijala: r.spoj_materijala || "",
    broj_spojeva: r.broj_spojeva || "",
    stampa: !!r.stampa,
    lak: !!r.lak
  }));
}

function buildTemplateFromProduct(product) {
  const raw = product?.raw || {};
  const existing = raw.data || raw.template || null;
  if (existing && typeof existing === "object") {
    return { ...existing, db_id: product.db_id || raw.id || existing.db_id, product_master_id: product.product_master_id || existing.product_master_id || makeProductMasterId(product), template_id: product.template_id || existing.template_id || (product.id ? 'TPL-' + product.id : null), template_version: product.verzija || existing.template_version || 'V1', template_locked: true, type: normalizeTip(existing.type || raw.tip || product.tip), naziv: existing.naziv || product.naziv, kupac: existing.kupac || product.kupac };
  }

  const tip = normalizeTip(product?.tip);
  const layers = materialRowsToTemplateLayers(product?.materijali || []);
  const base = {
    type: tip,
    naziv: product?.naziv || "",
    kupac: product?.kupac || "",
    sifra: product?.sifra || "",
    product_master_id: product?.product_master_id || makeProductMasterId(product || {}),
    template_version: product?.verzija || "V1",
    template_locked: true,
    napomena: "Kreirano iz Baze proizvoda PRO"
  };

  if (tip === "kesa") {
    return {
      ...base,
      kesa: {
        naziv: product?.naziv || "",
        layers,
        kolicina: "10000",
        skart: "10",
        marza: "30",
        sirina: layers[0]?.sirina || "200",
        duzina: "400",
        klapna: "50",
        falta: "0",
        options: {},
        positions: {},
        pakovanje: ""
      }
    };
  }

  if (tip === "spulna") {
    return {
      ...base,
      spulna: {
        naziv: product?.naziv || "",
        materijal: layers.map(l => l.material).filter(Boolean).join(" / ") || "",
        layers,
        W: layers[0]?.sirina || "25",
        maxMetara: String(product?.finalnaRolna?.duzina || "8000").replace(/[^0-9.,]/g, ""),
        smer: product?.finalnaRolna?.smer || "Gap winding"
      }
    };
  }

  return {
    ...base,
    folija: {
      naziv: product?.naziv || "",
      layers,
      rezanje: {
        sirinaMaterijala: layers[0]?.sirina || "",
        duzinaRolne: String(product?.finalnaRolna?.duzina || "").replace(/[^0-9.,]/g, ""),
        precnikRolne: String(product?.finalnaRolna?.precnik || "").replace(/[^0-9.,]/g, "")
      },
      stampa: {
        brojBoja: product?.stampa?.boje || "",
        klise: product?.stampa?.klise || "",
        smerOdmotavanja: product?.finalnaRolna?.smer || ""
      },
      kpdf: {
        enabled: product?.perforacija?.tip && product.perforacija.tip !== "Nema",
        tip: product?.perforacija?.tip || "KPDF",
        odnos: product?.perforacija?.odnos || "",
        pozicija: product?.perforacija?.pozicija || ""
      },
      finalRoll: {
        smerOdmotavanja: product?.finalnaRolna?.smer || "",
        hilzna: product?.finalnaRolna?.hilzna || "",
        precnik: product?.finalnaRolna?.precnik || "",
        duzina: product?.finalnaRolna?.duzina || ""
      }
    }
  };
}

function makeCalculationRecordFromProduct(product) {
  const template = buildTemplateFromProduct(product);
  const tip = normalizeTip(product?.tip || template.type);
  const section = template[tip] || {};
  const layers = section.layers || template.folija?.layers || template.kesa?.layers || template.spulna?.layers || [];
  return {
    id: "KAL-PROD-" + Date.now(),
    created_at: new Date().toISOString(),
    datum: new Date().toLocaleDateString("sr-RS"),
    tip,
    naziv: product?.naziv || template.naziv || "Novi proizvod",
    klijent: product?.kupac || template.kupac || "",
    kupac: product?.kupac || template.kupac || "",
    status: "Draft iz Baze proizvoda",
    verzija: 1,
    source_product_id: product?.id || null,
    product_master_id: product?.product_master_id || template.product_master_id || makeProductMasterId(product || template),
    template_id: product?.id || null,
    product_template_id: product?.id || null,
    template_version: product?.verzija || template.template_version || "V1",
    template_locked: true,
    operacije: inferOperations(template, tip),
    materijali: layers,
    mats: layers,
    osnovna_cena: 0,
    konacna_cena: 0,
    data: template,
    template,
    kalkulator_prefill: template,
    napomena: "Kalkulacija kreirana iz Baze proizvoda PRO"
  };
}

function Card({ children, style }) {
  return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, boxShadow: "0 10px 30px rgba(15,23,42,.06)", ...style }}>{children}</div>;
}

function Badge({ children, color = BLUE }) {
  return <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "5px 10px", background: `${color}12`, color, border: `1px solid ${color}33`, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: .3 }}>{children}</span>;
}

function InfoRow({ label, value }) {
  return <div style={{ display: "grid", gridTemplateColumns: "145px minmax(0,1fr)", gap: 10, padding: "10px 0", borderBottom: "1px solid #eef2f7", fontSize: 13 }}>
    <b style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: .4 }}>{label}</b>
    <span style={{ color: "#0f172a", fontWeight: 800 }}>{value || "—"}</span>
  </div>;
}

function MaterialTable({ rows = [] }) {
  const columns = ["#", "Vrsta", "Oznaka", "Debljina", "Koef", "g/m²", "Širina", "Cena", "Š", "L"];
  return <div style={{ overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 14 }}>
    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 930, fontSize: 12 }}>
      <thead>
        <tr>{columns.map((c, i) => <th key={c} style={{ position: "sticky", top: 0, background: "#f8fafc", color: "#334155", textAlign: i >= 8 ? "center" : "left", padding: "12px 10px", borderBottom: "1px solid #e2e8f0", fontSize: 11, textTransform: "uppercase", letterSpacing: .4 }}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length ? rows.map((r, i) => <tr key={i} style={{ background: i % 2 ? "#fbfdff" : "#fff" }}>
          <td style={tdStyle(true)}>{i + 1}</td>
          <td style={tdStyle()}><b>{r.vrsta}</b></td>
          <td style={tdStyle()}>{r.oznaka}</td>
          <td style={tdStyle()}>{r.debljina}</td>
          <td style={tdStyle()}>{r.koef}</td>
          <td style={tdStyle()}>{r.gsm}</td>
          <td style={tdStyle()}>{r.sirina}</td>
          <td style={tdStyle()}>{r.cena}</td>
          <td style={tdStyle(true)}>{r.stampa ? <Badge color={BLUE}>Š</Badge> : <span style={{ color: "#cbd5e1" }}>—</span>}</td>
          <td style={tdStyle(true)}>{r.lak ? <Badge color={GREEN}>L</Badge> : <span style={{ color: "#cbd5e1" }}>—</span>}</td>
        </tr>) : <tr><td colSpan="10" style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontWeight: 800 }}>Nema definisanih materijala za ovaj proizvod.</td></tr>}
      </tbody>
    </table>
  </div>;
}

function tdStyle(center = false) {
  return { padding: "11px 10px", borderBottom: "1px solid #eef2f7", color: "#334155", fontWeight: 700, textAlign: center ? "center" : "left", whiteSpace: "nowrap" };
}

export default function ProductMasterPRO({ db, setDb, setPage, msg }) {
  const [query, setQuery] = useState("");
  const [tipFilter, setTipFilter] = useState("sve");
  const [statusFilter, setStatusFilter] = useState("sve");
  const [tab, setTab] = useState("osnovno");

  const products = useMemo(() => {
    const fromDb = Array.isArray(db?.proizvodi) ? db.proizvodi : [];
    return fromDb.map(mapProduct);
  }, [db]);

  const filtered = useMemo(() => products.filter((p) => {
    const q = query.trim().toLowerCase();
    const okQ = !q || [p.naziv, p.kupac, p.sifra, p.tip].join(" ").toLowerCase().includes(q);
    const okTip = tipFilter === "sve" || p.tip === tipFilter;
    const okStatus = statusFilter === "sve" || String(p.status).toLowerCase().includes(statusFilter);
    return okQ && okTip && okStatus;
  }), [products, query, tipFilter, statusFilter]);

  const [selectedId, setSelectedId] = useState(null);
  const selected = filtered.find(p => p.id === selectedId) || filtered[0] || products[0];
  const stats = {
    total: products.length,
    folija: products.filter(p => p.tip === "folija").length,
    kesa: products.filter(p => p.tip === "kesa").length,
    spulna: products.filter(p => p.tip === "spulna").length
  };

  function openTemplateFromProduct(product = selected) {
    if (!product) return;
    const template = buildTemplateFromProduct(product);
    localStorage.setItem("maropack_pending_template_edit", JSON.stringify({ product_id: product.id, template }));
    msg && msg("Template je pripremljen za otvaranje iz Baze proizvoda");
    setPage && setPage("template_engine");
  }

  async function createCalculationFromProduct(product = selected) {
    if (!product) return null;
    const kal = makeCalculationRecordFromProduct(product);
    try {
      const { data, error } = await supabase.from("kalkulacije").insert([{
        tip: kal.tip,
        naziv: kal.naziv,
        klijent: kal.klijent || kal.kupac || null,
        data: kal.data,
        materijali_struktura: kal.materijali || [],
        kolicina: Number(kal.kolicina) || null,
        osnovna_cena: 0,
        konacna_cena: 0,
        verzija: 1,
        status: "draft_product_master",
        product_master_id: kal.product_master_id || null,
        template_id: kal.template_id || null,
        template_version: kal.template_version || null,
        operacije: kal.operacije || []
      }]).select();
      if (error) throw error;
      const dbId = data?.[0]?.id;
      const nextKal = { ...kal, id: dbId || kal.id, kalkulacija_id: dbId || null, db_id: dbId || null };
      localStorage.setItem("maropack_pending_template_calculation", JSON.stringify(nextKal));
      localStorage.setItem("editKalkulacija", JSON.stringify(nextKal));
      if (setDb && data?.[0]) setDb(prev => ({ ...prev, kalkulacije: [data[0], ...(prev?.kalkulacije || [])] }));
      const targetPage = kal.tip === "kesa" ? "kalk_kesa" : kal.tip === "spulna" ? "kalk_spulna" : "kalk_folija";
      msg && msg("Kalkulacija je kreirana iz sačuvanog template-a i sačuvana u bazu");
      setPage && setPage(targetPage);
      return nextKal;
    } catch (e) {
      msg && msg("Kalkulacija nije kreirana: " + (e?.message || e), "err");
      return null;
    }
  }

  async function createOfferFromProduct(product = selected, options = {}) {
    if (!product) return null;
    const template = buildTemplateFromProduct(product);
    const tip = normalizeTip(product.tip || template.type);
    const section = template[tip] || {};
    const layers = section.layers || template.folija?.layers || template.kesa?.layers || template.spulna?.layers || [];
    const broj = "PON-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 9000 + 1000);
    const kol = Number(template.porucenaKolicina || section.kolicina || section.maxMetara || section.rezanje?.duzinaRolne || product.raw?.met || product.raw?.nal || 0) || null;
    try {
      const { data, error } = await supabase.from("ponude").insert([{
        broj,
        datum: new Date().toLocaleDateString("sr-RS"),
        vaz: new Date(Date.now() + 30 * 86400000).toLocaleDateString("sr-RS"),
        kupac: product.kupac || "—",
        naziv: product.naziv || "Proizvod",
        proizvod: product.naziv || "Proizvod",
        tip,
        kol,
        kolicina: kol,
        mats: layers,
        struktura: layers,
        status: options.accepted ? "prihvaceno" : "draft_product_master",
        nap: "Kreirano iz Product Master template-a",
        product_master_id: product.product_master_id || template.product_master_id || null,
        template_id: product.template_id || template.template_id || null,
        template_version: product.verzija || template.template_version || "V1",
        res: { template, operacije: product.operacije || inferOperations(template, tip) }
      }]).select();
      if (error) throw error;
      if (setDb && data?.[0]) setDb(prev => ({ ...prev, ponude: [data[0], ...(prev?.ponude || [])] }));
      msg && msg(options.accepted ? "Ponuda je kreirana i označena kao prihvaćena" : "Ponuda je kreirana iz sačuvanog template-a");
      if (!options.silent) setPage && setPage("ponude");
      return data?.[0] || null;
    } catch (e) {
      msg && msg("Ponuda nije kreirana: " + (e?.message || e), "err");
      return null;
    }
  }

  async function createOrdersFromProduct(product = selected) {
    if (!product) return;
    const ponuda = await createOfferFromProduct(product, { accepted: true, silent: true });
    if (!ponuda?.id) return;
    try {
      const { error } = await supabase.rpc("kreiraj_naloge_iz_ponude", { p_ponuda_id: ponuda.id });
      if (error) throw error;
      msg && msg("Glavni nalog i A4 operativni nalozi su kreirani iz template-a");
      setPage && setPage("master_nalozi");
    } catch (e) {
      msg && msg("Nalozi nisu kreirani. Proveri SQL funkciju kreiraj_naloge_iz_ponude: " + (e?.message || e), "err");
    }
  }

  const tabs = [
    ["osnovno", "Osnovno"], ["materijali", "Materijali"], ["stampa", "Štampa"], ["perforacija", "Perforacija"], ["final", "Finalna rolna"], ["dok", "Dokumentacija"], ["istorija", "Istorija"]
  ];

  return <div style={{ padding: 22, background: "linear-gradient(180deg,#f8fafc 0%,#eef6ff 100%)", minHeight: "100vh" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
      <div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}><span style={{ fontSize: 28 }}>📦</span><h1 style={{ margin: 0, fontSize: 26, color: "#0f172a", fontWeight: 950 }}>Baza proizvoda PRO</h1></div>
        <div style={{ color: "#64748b", fontSize: 13, fontWeight: 750 }}>Product Master: template-i, materijali, KPDF, perforacije, finalne rolne i istorija proizvoda.</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button onClick={() => setPage && setPage("baza_proizvoda_pro_old")} style={btnStyle("#fff", "#334155", "#cbd5e1")}>Otvori stari pregled</button>
        <button onClick={() => { msg && msg("Novi proizvod se trenutno dodaje kroz Template Engine."); setPage && setPage("template_engine"); }} style={btnStyle(BLUE, "#fff", BLUE)}>+ Novi template</button>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 16 }}>
      <Kpi label="Ukupno proizvoda" value={stats.total} color={BLUE} />
      <Kpi label="Folije" value={stats.folija} color={BLUE} />
      <Kpi label="Kese" value={stats.kesa} color={ORANGE} />
      <Kpi label="Špulne" value={stats.spulna} color={PURPLE} />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "390px minmax(0,1fr)", gap: 16, alignItems: "start" }}>
      <Card style={{ overflow: "hidden" }}>
        <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", background: "linear-gradient(135deg,#ffffff,#f8fafc)" }}>
          <div style={{ fontSize: 15, fontWeight: 950, marginBottom: 10, color: "#0f172a" }}>Lista proizvoda</div>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Pretraga: kupac, naziv, šifra..." style={inputStyle()} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <select value={tipFilter} onChange={e => setTipFilter(e.target.value)} style={inputStyle()}><option value="sve">Svi tipovi</option><option value="folija">Folije</option><option value="kesa">Kese</option><option value="spulna">Špulne</option></select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={inputStyle()}><option value="sve">Svi statusi</option><option value="aktivan">Aktivan</option><option value="razvoj">Razvoj</option><option value="stop">Stop</option></select>
          </div>
        </div>
        <div style={{ maxHeight: "calc(100vh - 300px)", overflow: "auto" }}>
          {filtered.map((p) => <button key={p.id} onClick={() => { setSelectedId(p.id); setTab("osnovno"); }} style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #eef2f7", background: selected?.id === p.id ? "#eff6ff" : "#fff", padding: 14, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 950, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.naziv}</div>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 750, marginTop: 3 }}>{p.kupac}</div>
              </div>
              <Badge color={tipColor(p.tip)}>{p.tip}</Badge>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}><Badge color={statusColor(p.status)}>{p.status}</Badge><Badge color="#64748b">{p.verzija}</Badge><Badge color="#64748b">{p.sifra}</Badge></div>
          </button>)}
        </div>
      </Card>

      <Card style={{ overflow: "hidden" }}>
        {selected ? <>
          <div style={{ padding: 18, borderBottom: "1px solid #e2e8f0", background: `linear-gradient(135deg,${tipColor(selected.tip)}14,#ffffff 55%)` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 7 }}><Badge color={tipColor(selected.tip)}>{selected.tip}</Badge><Badge color={statusColor(selected.status)}>{selected.status}</Badge><Badge color="#64748b">{selected.verzija}</Badge></div>
                <h2 style={{ margin: 0, fontSize: 22, color: "#0f172a", fontWeight: 950 }}>{selected.naziv}</h2>
                <div style={{ marginTop: 5, color: "#64748b", fontWeight: 750 }}>Kupac: {selected.kupac} · Šifra: {selected.sifra}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button onClick={() => openTemplateFromProduct(selected)} style={btnStyle("#fff", "#334155", "#cbd5e1")}>Otvori template</button>
                <button onClick={() => createCalculationFromProduct(selected)} style={btnStyle(GREEN, "#fff", GREEN)}>Kreiraj kalkulaciju</button>
                <button onClick={() => createOfferFromProduct(selected)} style={btnStyle(BLUE, "#fff", BLUE)}>Kreiraj ponudu</button>
                <button onClick={() => createOrdersFromProduct(selected)} style={btnStyle(PURPLE, "#fff", PURPLE)}>Kreiraj naloge</button>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "12px 16px", borderBottom: "1px solid #e2e8f0", overflowX: "auto", background: "#fff" }}>
            {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ border: tab === k ? `2px solid ${BLUE}` : "1px solid #e2e8f0", background: tab === k ? "#eff6ff" : "#fff", color: tab === k ? BLUE : "#334155", borderRadius: 999, padding: "9px 13px", fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>)}
          </div>
          <div style={{ padding: 18 }}>
            {tab === "osnovno" && <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 16 }}>
              <Card style={{ boxShadow: "none", padding: 16 }}><SectionTitle title="Osnovni podaci" /><InfoRow label="Naziv" value={selected.naziv} /><InfoRow label="Kupac" value={selected.kupac} /><InfoRow label="Tip" value={selected.tip} /><InfoRow label="Šifra" value={selected.sifra} /><InfoRow label="Verzija" value={selected.verzija} /><InfoRow label="Datum" value={selected.datum} /></Card>
              <Card style={{ boxShadow: "none", padding: 16, background: "#f8fafc" }}><SectionTitle title="Brze akcije" /><ActionRow text="Otvori template" onClick={() => openTemplateFromProduct(selected)} /><ActionRow text="Kreiraj kalkulaciju iz proizvoda" onClick={() => createCalculationFromProduct(selected)} /><ActionRow text="Kreiraj ponudu iz proizvoda" onClick={() => createOfferFromProduct(selected)} /><ActionRow text="Kreiraj naloge iz proizvoda" onClick={() => createOrdersFromProduct(selected)} /><ActionRow text="Dodaj KPDF / PDF dokument" /><ActionRow text="Pogledaj istoriju izmena" /></Card>
            </div>}
            {tab === "materijali" && <><SectionTitle title="Materijali proizvoda" note="Ista Material PRO tabela kao u kalkulacijama i template-ima. Bez Žuta, ostaju samo Š i L." /><MaterialTable rows={selected.materijali} /></>}
            {tab === "stampa" && <Card style={{ boxShadow: "none", padding: 16 }}><SectionTitle title="Štampa / lak / kliše" /><InfoRow label="Broj boja" value={selected.stampa.boje} /><InfoRow label="Kliše" value={selected.stampa.klise} /><InfoRow label="Lak" value={selected.stampa.lak} /><InfoRow label="Napomena" value={selected.stampa.napomena} /></Card>}
            {tab === "perforacija" && <Card style={{ boxShadow: "none", padding: 16 }}><SectionTitle title="Perforacija / KPDF" /><InfoRow label="Tip" value={selected.perforacija.tip} /><InfoRow label="Odnos" value={selected.perforacija.odnos} /><InfoRow label="Pozicija" value={selected.perforacija.pozicija} /></Card>}
            {tab === "final" && <Card style={{ boxShadow: "none", padding: 16 }}><SectionTitle title="Finalna rolna / smer odmotavanja" /><InfoRow label="Smer" value={selected.finalnaRolna.smer} /><InfoRow label="Hilzna" value={selected.finalnaRolna.hilzna} /><InfoRow label="Prečnik" value={selected.finalnaRolna.precnik} /><InfoRow label="Dužina" value={selected.finalnaRolna.duzina} /></Card>}
            {tab === "dok" && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}><DocCard title="KPDF" value={selected.dokumentacija.kpdf} /><DocCard title="Tehnički list" value={selected.dokumentacija.tehnickiList} /><DocCard title="Slike / crteži" value={selected.dokumentacija.slike} /></div>}
            {tab === "istorija" && <Card style={{ boxShadow: "none", padding: 16 }}><SectionTitle title="Istorija" note="Priprema za povezivanje sa kalkulacijama, nalozima, izmenama i korisnicima." /><ActionRow text="Nema upisane istorije za ovaj proizvod." /></Card>}
          </div>
        </> : <div style={{ padding: 40, color: "#64748b", fontWeight: 800 }}>Nema proizvoda za prikaz.</div>}
      </Card>
    </div>
  </div>;
}

function Kpi({ label, value, color }) {
  return <Card style={{ padding: 16, borderLeft: `5px solid ${color}` }}><div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", fontWeight: 900 }}>{label}</div><div style={{ color, fontSize: 28, fontWeight: 950, marginTop: 4 }}>{value}</div></Card>;
}
function SectionTitle({ title, note }) { return <div style={{ marginBottom: 12 }}><div style={{ fontSize: 15, fontWeight: 950, color: "#0f172a" }}>{title}</div>{note && <div style={{ fontSize: 12, color: "#64748b", fontWeight: 750, marginTop: 3 }}>{note}</div>}</div>; }
function ActionRow({ text, onClick }) { return <div onClick={onClick} style={{ padding: "10px 0", borderBottom: "1px solid #e2e8f0", color: "#334155", fontWeight: 850, fontSize: 13, cursor: onClick ? "pointer" : "default" }}>→ {text}</div>; }
function DocCard({ title, value }) { return <Card style={{ boxShadow: "none", padding: 18, background: "#f8fafc" }}><div style={{ fontSize: 12, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{title}</div><div style={{ marginTop: 8, fontSize: 18, color: "#0f172a", fontWeight: 950 }}>{value}</div><button style={{ ...btnStyle("#fff", "#334155", "#cbd5e1"), marginTop: 14 }}>Dodaj / otvori</button></Card>; }
function inputStyle() { return { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 12, padding: "10px 12px", fontSize: 13, fontWeight: 750, background: "#fff", color: "#0f172a" }; }
function btnStyle(bg, color, border) { return { border: `1px solid ${border}`, background: bg, color, borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer", boxShadow: bg === "#fff" ? "none" : "0 10px 20px rgba(37,99,235,.18)" }; }
