import React, { useMemo, useState } from "react";

const COLORS = {
  folija: "#1d4ed8",
  kesa: "#059669",
  spulna: "#7c3aed",
  dark: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  bg: "#f8fafc",
};

const TYPE_META = {
  folija: { label: "Folija", icon: "🎞️", desc: "štampa / kaširanje / rezanje / finalna rolna" },
  kesa: { label: "Kesa", icon: "🛍️", desc: "dimenzije / procesi / pakovanje / crtež" },
  spulna: { label: "Špulna", icon: "🧵", desc: "trake / hilzne / namotavanje / formatiranje" },
};

const demoByType = {
  folija: {
    broj: "RN-FOL-2026-001",
    tip: "folija",
    kupac: "Primer kupac",
    proizvod: "Duplex PET12 / PE50 420 mm",
    kolicina: "72.000 m",
    rok: "po dogovoru",
    status: "Kreiran",
    materijali: [
      { rb: 1, vrsta: "PET", oznaka: "transparent", debljina: "12µ", koef: "1.40", gsm: "16.8", sirina: "420 mm", cena: "3.50", stampa: true, lak: false, potrebnoKg: "508.03", potrebnoM: "72000", qr: "ROL-PET-001", lot: "LOT-001", lokacija: "A-01" },
      { rb: 2, vrsta: "PE", oznaka: "white", debljina: "50µ", koef: "0.925", gsm: "46.25", sirina: "420 mm", cena: "2.80", stampa: false, lak: false, potrebnoKg: "1398.60", potrebnoM: "72000", qr: "ROL-PE-001", lot: "LOT-002", lokacija: "A-02" },
    ],
    stampa: { masina: "UTECO", boje: "4+0", strana: "unutrašnja", klise: "info", smer: "na glavu" },
    kasiranje: { tip: "Duplex", lepak: "0.36 kg/1000m", prolazi: "1", odnos: "po recepturi" },
    rezanje: { sirinaMaterijala: "840 mm", trake: "2 × 420 mm", precnik: "400 mm", hilzna: "152 mm" },
    finalnaRolna: { smer: "na glavu", kpdf: "po template-u", pozicija: "po PDF-u" },
  },
  kesa: {
    broj: "RN-KES-2026-001",
    tip: "kesa",
    kupac: "Primer kupac",
    proizvod: "Kesa ravna 200 × 400 + klapna",
    kolicina: "10.000 kom",
    rok: "po dogovoru",
    status: "Kreiran",
    materijali: [
      { rb: 1, vrsta: "OPP", oznaka: "transparent", debljina: "15µ", koef: "1.82", gsm: "27.3", sirina: "450 mm", cena: "3.00", stampa: true, lak: false, potrebnoKg: "5.71", potrebnoM: "—", qr: "ROL-OPP-001", lot: "LOT-K01", lokacija: "B-01" },
    ],
    konstrukcija: { sirina: "200 mm", duzina: "400 mm", klapna: "50 mm", falta: "50 mm", tipKese: "ravna" },
    procesi: ["Štampa", "Kontinualni var", "ADH traka", "Pakovanje"],
    pakovanje: { uBunt: "200 kom", kutija: "po specifikaciji", transport: "po Excel logici" },
  },
  spulna: {
    broj: "RN-SPU-2026-001",
    tip: "spulna",
    kupac: "Mavotape",
    proizvod: "Špulna 8 mm × 10.000 m",
    kolicina: "1 kom / serija",
    rok: "po dogovoru",
    status: "Kreiran",
    materijali: [
      { rb: 1, vrsta: "PE/PET/PE", oznaka: "laminat", debljina: "—", koef: "—", gsm: "72", sirina: "8 mm", cena: "3.10", stampa: false, lak: false, potrebnoKg: "5.76", potrebnoM: "10000", qr: "ROL-SPU-001", lot: "LOT-S01", lokacija: "C-01" },
    ],
    trake: { sirina: "8 mm", duzina: "10.000 m", broj: "po nalogu", maxMetara: "10.000 m" },
    hilzna: { da: "158", di: "152", t: "180", d: "380", namotavanje: "Gap winding" },
    pakovanje: { kutija: "2 €", transport: "po kalkulaciji", smer: "levo/desno" },
  },
};

function cardStyle(extra = {}) {
  return { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, boxShadow: "0 14px 34px rgba(15,23,42,.06)", ...extra };
}

function button(color, extra = {}) {
  return { border: "none", background: color, color: "#fff", borderRadius: 12, padding: "10px 13px", fontWeight: 950, cursor: "pointer", boxShadow: "0 8px 18px rgba(15,23,42,.12)", ...extra };
}

function badge(color, bg) {
  return { display: "inline-flex", alignItems: "center", border: `1px solid ${color}35`, background: bg || `${color}12`, color, padding: "7px 10px", borderRadius: 999, fontSize: 12, fontWeight: 900 };
}

function Field({ label, value }) {
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: COLORS.muted, textTransform: "uppercase", letterSpacing: .4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 900, color: COLORS.dark, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>{value || "—"}</div>
    </div>
  );
}

function Section({ title, children, color = "#1d4ed8", right }) {
  return (
    <div style={cardStyle({ overflow: "hidden", marginBottom: 14 })}>
      <div style={{ padding: "11px 14px", background: `linear-gradient(135deg, ${color}, #0f172a)`, color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 950, fontSize: 13 }}>{title}</div>
        {right && <div style={{ fontSize: 11, fontWeight: 850, opacity: .9 }}>{right}</div>}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function td(strong = false) {
  return { padding: "10px 9px", borderBottom: "1px solid #f1f5f9", color: COLORS.dark, fontWeight: strong ? 950 : 750, whiteSpace: "nowrap" };
}

function MaterialTable({ rows = [], showWarehouse = false }) {
  const columns = showWarehouse
    ? ["#", "Vrsta", "Oznaka", "Debljina", "Koef", "g/m²", "Širina", "Cena", "Š", "L", "Potrebno kg", "QR", "LOT", "Lokacija"]
    : ["#", "Vrsta", "Oznaka", "Debljina", "Koef", "g/m²", "Širina", "Cena", "Š", "L"];
  return (
    <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 14 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: showWarehouse ? 1220 : 960, fontSize: 12 }}>
        <thead>
          <tr>{columns.map(c => <th key={c} style={{ background: "#f1f5f9", color: "#334155", textAlign: "left", padding: "10px 9px", borderBottom: "1px solid #e2e8f0", fontWeight: 950 }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? "#fff" : "#fbfdff" }}>
              <td style={td()}>{r.rb || i + 1}</td>
              <td style={td(true)}>{r.vrsta || "—"}</td>
              <td style={td()}>{r.oznaka || "—"}</td>
              <td style={td()}>{r.debljina || "—"}</td>
              <td style={td()}>{r.koef || "—"}</td>
              <td style={td()}>{r.gsm || "—"}</td>
              <td style={td()}>{r.sirina || "—"}</td>
              <td style={td()}>{r.cena || "—"}</td>
              <td style={td()}>{r.stampa ? "✓" : ""}</td>
              <td style={td()}>{r.lak ? "✓" : ""}</td>
              {showWarehouse && <>
                <td style={td(true)}>{r.potrebnoKg || "—"}</td>
                <td style={td()}>{r.qr || "za izbor"}</td>
                <td style={td()}>{r.lot || "iz magacina"}</td>
                <td style={td()}>{r.lokacija || "—"}</td>
              </>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QRBox({ nalog }) {
  const txt = encodeURIComponent(nalog.broj || "MAROPACK");
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${txt}`;
  return (
    <div style={{ textAlign: "center", background: "#fff", borderRadius: 14, padding: 10 }}>
      <img src={src} alt="QR naloga" style={{ width: 120, height: 120 }} />
      <div style={{ color: "#334155", fontWeight: 950, fontSize: 10, marginTop: 4 }}>QR NALOGA</div>
    </div>
  );
}

function parseNum(v) {
  const n = Number(String(v ?? "").replace(/[^0-9,.-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function calcMaterialNeedFromLayer(m, section, tip) {
  const gsm = parseNum(m.gsm || m.tezina || m.gm2 || m.tezina_gm2);
  const sirina = parseNum(m.sirina || section?.sirina || section?.rezanje?.sirinaMaterijala || section?.W);
  const metara = parseNum(m.metara || section?.rezanje?.duzinaRolne || section?.maxMetara || section?.duzina || 0);
  const kg = gsm && sirina && metara ? (gsm * sirina * metara / 1000000) : parseNum(m.kg || m.potrebnoKg);
  if (tip === "kesa" && parseNum(section?.kolicina) && parseNum(section?.sirina) && parseNum(section?.duzina) && gsm) {
    const areaM2 = (parseNum(section.sirina) * parseNum(section.duzina) * parseNum(section.kolicina)) / 1000000;
    return (areaM2 * gsm / 1000).toFixed(3);
  }
  return kg ? kg.toFixed(3) : "—";
}

function normalizeLayer(m, i, section, tip) {
  return {
    rb: i + 1,
    vrsta: m.vrsta || m.tip || m.material || m.materijal || m.naziv || "—",
    oznaka: m.oznaka || m.naziv || m.opis || "—",
    debljina: m.debljina ? `${m.debljina}µ` : (m.deb ? `${m.deb}µ` : (m.debljina_um ? `${m.debljina_um}µ` : "—")),
    koef: m.koef || m.koeficijent || "—",
    gsm: m.gsm || m.tezina || m.gm2 || m.tezina_gm2 || "—",
    sirina: m.sirina ? `${m.sirina} mm` : (section?.rezanje?.sirinaMaterijala ? `${section.rezanje.sirinaMaterijala} mm` : "—"),
    cena: m.cena || m.cena_kg || "—",
    stampa: !!(m.stampa || m.stamp || m.print || m.S),
    lak: !!(m.lak || m.lacquer || m.L),
    potrebnoKg: calcMaterialNeedFromLayer(m, section, tip),
    potrebnoM: m.metara || section?.rezanje?.duzinaRolne || section?.maxMetara || "—",
    qr: m.qr || "za izbor",
    lot: m.lot || m.sarza || "iz magacina",
    lokacija: m.lokacija || "—",
  };
}

function normalizePendingToOrder(raw, typeFallback = "folija") {
  const data = raw?.template || raw?.data || raw?.kalkulator_prefill || raw || {};
  const rawTip = String(raw?.tip || data?.type || typeFallback || "folija").toLowerCase();
  const tip = rawTip.includes("kes") ? "kesa" : rawTip.includes("spul") || rawTip.includes("špul") ? "spulna" : "folija";
  const section = data[tip] || raw?.[tip] || data || {};
  const demo = demoByType[tip];
  const layers = Array.isArray(section.layers) ? section.layers : Array.isArray(raw?.materijali) ? raw.materijali : Array.isArray(data?.materijali) ? data.materijali : [];
  const broj = raw?.broj_naloga || raw?.broj || "RN-" + tip.toUpperCase().slice(0, 3) + "-" + Date.now().toString().slice(-6);
  const proizvod = data.naziv || section.naziv || raw?.naziv || raw?.proizvod || demo.proizvod;
  const kolicina = section.kolicina ? `${section.kolicina} kom` : section.rezanje?.duzinaRolne ? `${section.rezanje.duzinaRolne} m` : section.maxMetara ? `${section.maxMetara} m` : raw?.kolicina || demo.kolicina;
  const base = {
    ...demo,
    broj,
    tip,
    kupac: data.kupac || raw?.kupac || raw?.klijent || demo.kupac,
    proizvod,
    kolicina,
    rok: section.rokIsporuke || raw?.rok || demo.rok,
    status: "Kreiran",
    materijali: layers.length ? layers.map((m, i) => normalizeLayer(m, i, section, tip)) : demo.materijali,
    source: raw,
  };
  if (tip === "folija") {
    return {
      ...base,
      stampa: section.stampa || demo.stampa,
      kasiranje: section.kasiranje || demo.kasiranje,
      rezanje: section.rezanje || demo.rezanje,
      finalnaRolna: section.finalRoll || section.finalnaRolna || demo.finalnaRolna,
    };
  }
  if (tip === "kesa") {
    return {
      ...base,
      konstrukcija: {
        sirina: section.sirina ? `${section.sirina} mm` : demo.konstrukcija.sirina,
        duzina: section.duzina ? `${section.duzina} mm` : demo.konstrukcija.duzina,
        klapna: section.klapna ? `${section.klapna} mm` : demo.konstrukcija.klapna,
        falta: section.falta ? `${section.falta} mm` : demo.konstrukcija.falta,
        tipKese: section.tipKese || demo.konstrukcija.tipKese,
      },
      procesi: section.options ? Object.keys(section.options).filter(k => section.options[k]).map(k => k.replaceAll("_", " ")) : demo.procesi,
      pakovanje: { ...demo.pakovanje, uBunt: section.pakovanje || demo.pakovanje.uBunt },
    };
  }
  return {
    ...base,
    trake: {
      sirina: section.W ? `${section.W} mm` : section.sirina ? `${section.sirina} mm` : demo.trake.sirina,
      duzina: section.maxMetara ? `${section.maxMetara} m` : section.duzina ? `${section.duzina} m` : demo.trake.duzina,
      broj: section.broj || demo.trake.broj,
      maxMetara: section.maxMetara ? `${section.maxMetara} m` : demo.trake.maxMetara,
    },
    hilzna: {
      da: section.Da || demo.hilzna.da,
      di: section.Di || demo.hilzna.di,
      t: section.T || demo.hilzna.t,
      d: section.D || demo.hilzna.d,
      namotavanje: section.smer || demo.hilzna.namotavanje,
    },
    pakovanje: demo.pakovanje,
  };
}

function TypeSpecificSections({ nalog }) {
  const color = COLORS[nalog.tip] || COLORS.folija;
  if (nalog.tip === "kesa") {
    return (
      <>
        <Section title="🛍️ Konstrukcija kese" color={color}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 10 }}>
            <Field label="Tip kese" value={nalog.konstrukcija?.tipKese} />
            <Field label="Širina" value={nalog.konstrukcija?.sirina} />
            <Field label="Dužina" value={nalog.konstrukcija?.duzina} />
            <Field label="Klapna" value={nalog.konstrukcija?.klapna} />
            <Field label="Falta" value={nalog.konstrukcija?.falta} />
          </div>
        </Section>
        <Section title="⚙️ Tehnološki procesi" color="#0f766e">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{(nalog.procesi || []).map(p => <span key={p} style={badge("#059669")}>✓ {p}</span>)}</div>
        </Section>
        <Section title="📦 Pakovanje i transport" color="#64748b">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 10 }}>
            <Field label="U bunt" value={nalog.pakovanje?.uBunt} />
            <Field label="Kutija" value={nalog.pakovanje?.kutija} />
            <Field label="Transport" value={nalog.pakovanje?.transport} />
          </div>
        </Section>
      </>
    );
  }
  if (nalog.tip === "spulna") {
    return (
      <>
        <Section title="🧵 Trake i metraža" color={color}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 10 }}>
            <Field label="Širina trake" value={nalog.trake?.sirina} />
            <Field label="Dužina" value={nalog.trake?.duzina} />
            <Field label="Broj" value={nalog.trake?.broj} />
            <Field label="Max metara" value={nalog.trake?.maxMetara} />
          </div>
        </Section>
        <Section title="⭕ Hilzna i namotavanje" color="#7c3aed">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(100px, 1fr))", gap: 10 }}>
            <Field label="Da" value={nalog.hilzna?.da} />
            <Field label="Di" value={nalog.hilzna?.di} />
            <Field label="T" value={nalog.hilzna?.t} />
            <Field label="D" value={nalog.hilzna?.d} />
            <Field label="Tip" value={nalog.hilzna?.namotavanje} />
          </div>
        </Section>
        <Section title="📦 Pakovanje" color="#64748b">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 10 }}>
            <Field label="Kutija" value={nalog.pakovanje?.kutija} />
            <Field label="Transport" value={nalog.pakovanje?.transport} />
            <Field label="Smer" value={nalog.pakovanje?.smer} />
          </div>
        </Section>
      </>
    );
  }
  return (
    <>
      <Section title="🖨️ Štampa" color="#2563eb">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 10 }}>
          <Field label="Mašina" value={nalog.stampa?.masina} />
          <Field label="Boje" value={nalog.stampa?.brojBoja || nalog.stampa?.boje} />
          <Field label="Strana" value={nalog.stampa?.strana} />
          <Field label="Kliše" value={nalog.stampa?.klise} />
          <Field label="Smer" value={nalog.stampa?.smerOdmotavanja || nalog.stampa?.smer} />
        </div>
      </Section>
      <Section title="🔗 Kaširanje / lepak" color="#1d4ed8">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 10 }}>
          <Field label="Tip" value={nalog.kasiranje?.tip || nalog.kasiranje?.materijalABC} />
          <Field label="Lepak" value={nalog.kasiranje?.nanosLepka || nalog.kasiranje?.lepak} />
          <Field label="Prolazi" value={nalog.kasiranje?.brojKasiranja || nalog.kasiranje?.prolazi} />
          <Field label="Odnos" value={nalog.kasiranje?.odnosLepka || nalog.kasiranje?.odnos} />
        </div>
      </Section>
      <Section title="✂️ Rezanje i finalna rolna" color="#4338ca">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 10 }}>
          <Field label="Matična širina" value={nalog.rezanje?.sirinaMaterijala} />
          <Field label="Trake" value={nalog.rezanje?.sirineTraka || nalog.rezanje?.trake} />
          <Field label="Prečnik" value={nalog.rezanje?.precnikRolne || nalog.rezanje?.precnik} />
          <Field label="Hilzna" value={nalog.finalnaRolna?.hilzna || nalog.rezanje?.hilzna} />
        </div>
      </Section>
      <Section title="📄 KPDF / perforacija / izgled finalne rolne" color="#0ea5e9">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 10 }}>
          <Field label="Smer odmotavanja" value={nalog.finalnaRolna?.smerOdmotavanja || nalog.finalnaRolna?.smer} />
          <Field label="KPDF" value={nalog.finalnaRolna?.kpdf || "po template-u"} />
          <Field label="Pozicija" value={nalog.finalnaRolna?.pozicija || "po PDF-u"} />
        </div>
      </Section>
    </>
  );
}

function saveOrderToLocal(nalog) {
  const list = JSON.parse(localStorage.getItem("maropack_nalozi_pro_drafts") || "[]");
  const next = [{ ...nalog, saved_at: new Date().toISOString() }, ...list.filter(x => x.broj !== nalog.broj)];
  localStorage.setItem("maropack_nalozi_pro_drafts", JSON.stringify(next));
  return next;
}

export default function NaloziProMES({ db, setPage, msg }) {
  const [tip, setTip] = useState("folija");
  const [nalog, setNalog] = useState(demoByType.folija);
  const [orders, setOrders] = useState(() => {
    try { return JSON.parse(localStorage.getItem("maropack_nalozi_pro_drafts") || "[]"); } catch { return []; }
  });
  const [view, setView] = useState("nalog");
  const color = COLORS[nalog.tip] || COLORS.folija;

  const statusi = useMemo(() => ["Kreiran", "Potreba materijala", "Rezervisano", "U proizvodnji", "Kontrola", "Završeno"], []);
  const materialSummary = useMemo(() => {
    const kg = (nalog.materijali || []).reduce((s, m) => s + parseNum(m.potrebnoKg), 0);
    return { layers: (nalog.materijali || []).length, kg: kg ? kg.toFixed(2) : "—" };
  }, [nalog]);

  function selectType(t) {
    setTip(t);
    setNalog(demoByType[t]);
    setView("nalog");
  }

  function loadPending() {
    try {
      const raw = JSON.parse(localStorage.getItem("maropack_pending_nalog") || localStorage.getItem("maropack_pending_template_calculation") || "null");
      if (!raw) {
        msg && msg("Nema poslednje kalkulacije/template-a za nalog", "err");
        return;
      }
      const n = normalizePendingToOrder(raw, tip);
      setTip(n.tip);
      setNalog(n);
      setView("nalog");
      msg && msg("Nalog pripremljen iz poslednje kalkulacije/template-a");
    } catch (e) {
      msg && msg("Ne mogu da pročitam poslednju kalkulaciju", "err");
    }
  }

  function saveDraft() {
    setOrders(saveOrderToLocal(nalog));
    msg && msg("Nalog sačuvan kao draft lokalno");
  }

  function updateStatus(status) {
    const updated = { ...nalog, status };
    setNalog(updated);
    setOrders(saveOrderToLocal(updated));
    msg && msg("Status naloga ažuriran: " + status);
  }

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 16 }}>
      <div style={{ ...cardStyle({ padding: 18, background: "linear-gradient(135deg,#f8fafc,#ffffff)" }) }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", fontWeight: 950, letterSpacing: .8 }}>MES Workflow — Phase 2</div>
            <h1 style={{ margin: "3px 0 0", fontSize: 24, fontWeight: 950, color: COLORS.dark }}>Nalozi PRO — folije / kese / špulne</h1>
            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>Kalkulacija → nalog → potreba materijala → magacin QR → proizvodnja.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={loadPending} style={button("#0f766e")}>⚡ Iz poslednje kalkulacije</button>
            <button onClick={saveDraft} style={button("#1d4ed8")}>💾 Sačuvaj nalog</button>
            <button onClick={() => window.print()} style={button("#475569")}>🖨️ Print A4</button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "270px minmax(0, 1fr) 320px", gap: 16, alignItems: "start" }}>
        <aside style={cardStyle({ padding: 14, position: "sticky", top: 12 })}>
          <div style={{ fontSize: 12, fontWeight: 950, color: COLORS.dark, marginBottom: 10 }}>Tip naloga</div>
          {Object.keys(TYPE_META).map(t => (
            <button key={t} onClick={() => selectType(t)} style={{ width: "100%", textAlign: "left", marginBottom: 8, border: tip === t ? `2px solid ${COLORS[t]}` : "1px solid #e2e8f0", background: tip === t ? `${COLORS[t]}10` : "#fff", color: tip === t ? COLORS[t] : COLORS.dark, borderRadius: 12, padding: "12px 13px", fontWeight: 950, cursor: "pointer" }}>
              {TYPE_META[t].icon} Nalog za {TYPE_META[t].label.toLowerCase()}
              <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 3 }}>{TYPE_META[t].desc}</div>
            </button>
          ))}

          <div style={{ marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 950, color: COLORS.dark, marginBottom: 8 }}>Brzi workflow</div>
            {["Kalkulacija", "Nalog", "Potreba materijala", "QR proizvodnja"].map((x, i) => <div key={x} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, color: COLORS.muted, fontSize: 12, fontWeight: 800 }}><span style={{ width: 22, height: 22, borderRadius: 999, background: i <= 2 ? color : "#f1f5f9", color: i <= 2 ? "#fff" : COLORS.muted, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{i + 1}</span>{x}</div>)}
          </div>

          <div style={{ marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 950, color: COLORS.dark }}>Draft nalozi</div>
              <span style={badge("#64748b", "#f8fafc")}>{orders.length}</span>
            </div>
            <div style={{ display: "grid", gap: 7, maxHeight: 250, overflow: "auto" }}>
              {orders.length === 0 && <div style={{ fontSize: 12, color: COLORS.muted, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 10, padding: 10 }}>Još nema sačuvanih draft naloga.</div>}
              {orders.slice(0, 8).map(o => <button key={o.broj + o.saved_at} onClick={() => { setNalog(o); setTip(o.tip); }} style={{ textAlign: "left", border: "1px solid #e2e8f0", background: nalog.broj === o.broj ? `${COLORS[o.tip]}10` : "#fff", borderRadius: 10, padding: 9, cursor: "pointer" }}>
                <div style={{ fontSize: 11, fontWeight: 950, color: COLORS[o.tip] || COLORS.dark }}>{o.broj}</div>
                <div style={{ fontSize: 11, color: COLORS.dark, fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.proizvod}</div>
              </button>)}
            </div>
          </div>
        </aside>

        <main style={cardStyle({ padding: 18 })}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {["nalog", "materijal", "print"].map(v => <button key={v} onClick={() => setView(v)} style={{ border: view === v ? `2px solid ${color}` : "1px solid #e2e8f0", background: view === v ? `${color}10` : "#fff", color: view === v ? color : COLORS.dark, borderRadius: 999, padding: "9px 13px", fontWeight: 950, cursor: "pointer" }}>{v === "nalog" ? "Radni nalog" : v === "materijal" ? "Potreba materijala" : "A4 print"}</button>)}
          </div>

          <div style={{ background: `linear-gradient(135deg, ${color}, #0f172a)`, color: "#fff", borderRadius: 18, padding: 18, display: "grid", gridTemplateColumns: "1fr 145px", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: "#dbeafe", textTransform: "uppercase", fontWeight: 950, letterSpacing: 1 }}>MAROPACK DOO — PROIZVODNI RADNI NALOG</div>
              <div style={{ fontSize: 25, fontWeight: 950, marginTop: 5 }}>{nalog.proizvod}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 8, marginTop: 14 }}>
                <Field label="Broj" value={nalog.broj} />
                <Field label="Kupac" value={nalog.kupac} />
                <Field label="Količina" value={nalog.kolicina} />
                <Field label="Rok" value={nalog.rok} />
              </div>
            </div>
            <QRBox nalog={nalog} />
          </div>

          {view === "nalog" && <>
            <Section title="📦 Potreba materijala" color="#f59e0b" right="magacin / QR / LOT / lokacija">
              <MaterialTable rows={nalog.materijali} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 10, marginTop: 12 }}>
                <Field label="Rezervacija" value="po FIFO / ručno" />
                <Field label="QR role" value="obavezno skeniranje" />
                <Field label="LOT / šarža" value="iz magacina" />
                <Field label="Lokacija" value="iz magacina" />
              </div>
            </Section>
            <TypeSpecificSections nalog={nalog} />
          </>}

          {view === "materijal" && <>
            <Section title="🏪 Potreba materijala — rezervacija iz magacina" color="#f59e0b" right="Phase 2 priprema">
              <MaterialTable rows={nalog.materijali} showWarehouse />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 10, marginTop: 12 }}>
                <Field label="Slojeva" value={materialSummary.layers} />
                <Field label="Potrebno kg" value={materialSummary.kg} />
                <Field label="Predlog rolni" value="FIFO / širina / LOT" />
                <Field label="Rezervacija" value="spremno za Magacin PRO" />
              </div>
            </Section>
            <Section title="🔳 QR workflow" color="#0f766e">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(160px, 1fr))", gap: 10 }}>
                <Field label="1. Sken naloga" value={nalog.broj} />
                <Field label="2. Sken rolne" value="QR role iz magacina" />
                <Field label="3. Rezervacija" value="veza nalog ↔ rola" />
              </div>
            </Section>
          </>}

          {view === "print" && <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 950, color: COLORS.dark, marginBottom: 12 }}>A4 print preview — {TYPE_META[nalog.tip]?.label}</div>
            <div style={{ border: "1px solid #cbd5e1", borderRadius: 14, padding: 18, background: "#fbfdff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0f172a", paddingBottom: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 950, fontSize: 20 }}>MAROPACK DOO</div>
                  <div style={{ color: COLORS.muted, fontWeight: 800 }}>Proizvodni radni nalog — {TYPE_META[nalog.tip]?.label}</div>
                </div>
                <QRBox nalog={nalog} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                <Field label="Broj" value={nalog.broj} />
                <Field label="Kupac" value={nalog.kupac} />
                <Field label="Proizvod" value={nalog.proizvod} />
                <Field label="Količina" value={nalog.kolicina} />
              </div>
              <MaterialTable rows={nalog.materijali} showWarehouse />
            </div>
          </div>}
        </main>

        <aside style={cardStyle({ padding: 14, position: "sticky", top: 12 })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 950, color: COLORS.dark }}>Live status</div>
              <div style={{ fontSize: 11, color: COLORS.muted }}>MES kontrola naloga</div>
            </div>
            <span style={badge(color)}>{nalog.status}</span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {statusi.map((s, i) => <button key={s} onClick={() => updateStatus(s)} style={{ display: "flex", gap: 9, alignItems: "center", padding: "9px 10px", borderRadius: 12, background: nalog.status === s || i < 2 ? `${color}10` : "#f8fafc", border: nalog.status === s ? `2px solid ${color}` : "1px solid #e2e8f0", cursor: "pointer", textAlign: "left" }}><span style={{ width: 24, height: 24, borderRadius: 999, background: nalog.status === s || i < 2 ? color : "#e2e8f0", color: nalog.status === s || i < 2 ? "#fff" : COLORS.muted, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 950, fontSize: 11 }}>{i + 1}</span><span style={{ fontWeight: 850, color: nalog.status === s || i < 2 ? COLORS.dark : COLORS.muted, fontSize: 12 }}>{s}</span></button>)}
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 12, fontWeight: 950, color: COLORS.dark, marginBottom: 8 }}>Phase 2 dodato</div>
            <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.7 }}>
              • učitavanje iz poslednje kalkulacije<br />
              • draft lista naloga<br />
              • potreba materijala sa QR/LOT/lokacijom<br />
              • status workflow<br />
              • A4 print preview
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
