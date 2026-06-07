import React from "react";
import MaterialSelectorPRO, { MaterialText } from './components/MaterialSelectorPRO.jsx';
import NalogMaterijal_Folija from "./NalogMaterijal_Folija.jsx";
import NalogStampa_Folija from "./NalogStampa_Folija.jsx";
import NalogKasiranje_Folija from "./NalogKasiranje_Folija.jsx";
import NalogPerforacijaRezanje_Folija from "./NalogPerforacijaRezanje_Folija.jsx";
import NalogPotrebaMaterijala_Kesa from "./NalogPotrebaMaterijala_Kesa.jsx";
import NalogKesa_Kesa from "./NalogKesa_Kesa.jsx";
import NalogPotrebaMaterijala_Spulna from "./NalogPotrebaMaterijala_Spulna.jsx";
import NalogFormatiranje_Spulna from "./NalogFormatiranje_Spulna.jsx";
import NalogSpulne_Spulna from "./NalogSpulne_Spulna.jsx";

const QR = (text, size = 94) =>
  "https://api.qrserver.com/v1/create-qr-code/?size=" + size + "x" + size + "&data=" + encodeURIComponent(text || "MAROPACK");

function val(v, fallback = "—") {
  return v === undefined || v === null || v === "" ? fallback : v;
}

function fmt(n, suf = "") {
  const x = Number(n || 0);
  if (!Number.isFinite(x) || x === 0) return val(n, "—");
  return x.toLocaleString("sr-RS", { maximumFractionDigits: 2 }) + suf;
}

function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return fallback;
}

function getData(nalog) {
  const t = nalog.template || nalog.product_template || nalog.templateData || {};
  const folija = nalog.folija || t.folija || {};
  const kesa = nalog.kesa || t.kesa || {};
  const spulna = nalog.spulna || t.spulna || t.spulne || {};
  const tehnicki = nalog.tehnicki || t.tehnicki || {};
  const pdf = nalog.pdf || t.pdf || {};
  return { t, folija, kesa, spulna, tehnicki, pdf };
}

function Field({ label, value, strong }) {
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 11px" }}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: strong ? 15 : 13, color: "#0f172a", fontWeight: strong ? 900 : 700, marginTop: 3 }}>{val(value)}</div>
    </div>
  );
}

function Badge({ children, color = "#1d4ed8" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: color + "15", color, border: "1px solid " + color + "35", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 900 }}>
      {children}
    </span>
  );
}

function Section({ title, color = "#1d4ed8", children, subtitle }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", background: "#fff", marginBottom: 14, boxShadow: "0 8px 24px rgba(15,23,42,.04)" }}>
      <div style={{ background: `linear-gradient(135deg, ${color}, #0f172a)`, color: "#fff", padding: "10px 14px", fontWeight: 950, fontSize: 13, letterSpacing: 0.3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{title}</span>
        {subtitle ? <span style={{ fontSize: 10, opacity: .85, fontWeight: 800 }}>{subtitle}</span> : null}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function MiniTable({ columns, rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>{columns.map(c => <th key={c} style={{ textAlign: "left", padding: 8, background: "#f1f5f9", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {(rows || []).map((r, i) => (
          <tr key={i}>{columns.map((c, j) => <td key={j} style={{ padding: 8, borderBottom: "1px solid #f1f5f9", color: "#0f172a", fontWeight: j === 0 ? 800 : 600 }}>{r[j] ?? "—"}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function normTip(t) {
  const x = String(t || "folija").toLowerCase();
  if (x.includes("kes")) return "kesa";
  if (x.includes("spul") || x.includes("špul")) return "spulna";
  return "folija";
}

function normNalog(t, naziv) {
  const x = String(t || naziv || "").toLowerCase();
  if (x.includes("mater")) return "materijal";
  if (x.includes("štamp") || x.includes("stamp")) return "stampa";
  if (x.includes("kaš") || x.includes("kas")) return "kasiranje";
  if (x.includes("rez") || x.includes("perf")) return "perforacija_rezanje";
  if (x.includes("format")) return "formatiranje";
  if (x.includes("kes")) return "kesa";
  if (x.includes("spul") || x.includes("špul")) return "spulna";
  if (x.includes("qc") || x.includes("kontrol")) return "qc";
  return "opsti";
}

function getStruktura(nalog) {
  const { t, folija } = getData(nalog);
  const direct = Array.isArray(nalog.struktura) ? nalog.struktura : [];
  if (direct.length) return direct;
  const mats =
    Array.isArray(nalog.mats) ? nalog.mats :
    Array.isArray(nalog.materijali) ? nalog.materijali :
    Array.isArray(folija.layers) ? folija.layers :
    Array.isArray(t.layers) ? t.layers :
    [];
  return mats.map((m, i) => ({
    sloj: i + 1,
    naziv: m.naziv || m.tip || m.vrsta || m.materijal,
    tip: m.tip || m.vrsta || m.materijal,
    debljina: m.debljina || m.deb || m.mikron,
    gsm: m.gsm || m.gm2,
    sirina: m.sirina || m.sirina_mm || nalog.sirina,
    metraza: m.metraza || m.m || nalog.metraza,
    kg: m.kg,
    uloga: m.uloga || (i === 0 ? "Spolja / štampa" : i === mats.length - 1 ? "Unutrašnji sloj / var" : "Srednji / barijerni sloj")
  }));
}

function materijaliRows(nalog) {
  const struktura = getStruktura(nalog);
  if (struktura.length) return struktura.map((m, i) => [
    i + 1,
    val(m.naziv || m.tip),
    val(m.debljina ? m.debljina + " µ" : ""),
    val(m.gsm ? m.gsm + " g/m²" : ""),
    val(m.sirina ? m.sirina + " mm" : ""),
    val(m.metraza ? fmt(m.metraza, " m") : ""),
    val(m.kg ? fmt(m.kg, " kg") : ""),
    val(m.uloga || "")
  ]);
  return [[1, val(nalog.materijal || nalog.sastav || nalog.prod), val(nalog.debljina), "", val(nalog.sirina), val(nalog.kol), val(nalog.kg), ""]];
}

function Header({ nalog }) {
  const broj = nalog.ponBr || nalog.broj_naloga || nalog.broj || "MP-2026-0001";
  const tip = normTip(nalog.tip || nalog.tip_proizvoda);
  const qrText = window.location.origin + "?nalog=" + encodeURIComponent(broj);
  const qrSrc = nalog.qr_kod || QR(qrText, 95);
  return (
    <div style={{ background: "linear-gradient(135deg,#0f172a,#1e40af)", color: "#fff", borderRadius: 16, padding: 18, display: "grid", gridTemplateColumns: "1fr 115px", gap: 16, marginBottom: 16 }}>
      <div>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "#bfdbfe", fontWeight: 900 }}>MAROPACK d.o.o. — PROFESIONALNI PROIZVODNI RADNI NALOG</div>
        <div style={{ fontSize: 25, fontWeight: 950, marginTop: 4 }}>{val(nalog.naziv, "Radni nalog")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 8, marginTop: 14 }}>
          <Field label="Broj naloga" value={broj} strong />
          <Field label="Kupac" value={nalog.kupac} strong />
          <Field label="Proizvod" value={nalog.prod || nalog.proizvod || nalog.naziv_proizvoda} strong />
          <Field label="Tip" value={tip.toUpperCase()} strong />
        </div>
      </div>
      <div style={{ background: "#fff", borderRadius: 14, padding: 8, textAlign: "center", alignSelf: "start" }}>
        <img src={qrSrc} alt="QR" style={{ width: 95, height: 95, display: "block", margin: "0 auto" }} />
        <div style={{ color: "#334155", fontSize: 9, fontWeight: 900, marginTop: 4 }}>QR NALOGA</div>
      </div>
    </div>
  );
}

function StrukturaFolije({ nalog, color = "#f59e0b" }) {
  const struktura = getStruktura(nalog);
  if (!struktura.length) return null;
  const ukupnaDebljina = struktura.reduce((s, x) => s + Number(x.debljina || 0), 0);

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 14, background: "#fffdf5", marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 950, color, textTransform: "uppercase", marginBottom: 12 }}>
        📐 Struktura iz template-a / kalkulacije
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {struktura.map((s, i) => (
          <React.Fragment key={i}>
            <div style={{ minWidth: 155, border: "1.5px solid " + color, borderRadius: 12, background: "#fff7ed", padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Sloj {s.sloj}</div>
              <div style={{ fontSize: 15, color: "#0f172a", fontWeight: 950, marginTop: 4 }}>{val(s.naziv || s.tip)}</div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800, marginTop: 4 }}>
                {val(s.debljina ? s.debljina + " µ" : "")} {s.kg ? " · " + fmt(s.kg, " kg") : ""}
              </div>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 5 }}>{val(s.uloga)}</div>
            </div>
            {i < struktura.length - 1 && (
              <div style={{ textAlign: "center", color, fontWeight: 950 }}>
                →<div style={{ fontSize: 9, textTransform: "uppercase" }}>lepak</div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginTop: 12, textAlign: "center", background: "#fff", borderRadius: 10, padding: 8, fontSize: 12, fontWeight: 900, color: "#0f172a" }}>
        Sastav: {nalog.sastav || struktura.map(s => `${s.tip || s.naziv} ${s.debljina ? s.debljina + "µ" : ""}`.trim()).join(" / ")}
        {ukupnaDebljina ? ` · ukupna debljina: ${ukupnaDebljina} µ` : ""}
      </div>
    </div>
  );
}

function MaterialSection({ nalog }) {
  return (
    <Section title="📦 NALOG ZA POTREBU MATERIJALA" color="#f59e0b" subtitle="magacin / rezervacija rolni">
      <StrukturaFolije nalog={nalog} color="#f59e0b" />
      <MiniTable columns={["RB", "Materijal", "Debljina", "g/m²", "Širina", "Metraža", "Kg", "Uloga"]} rows={materijaliRows(nalog)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 12 }}>
        <Field label="Ukupno kg" value={nalog.ukupnoKg || nalog.kg || "po kalkulaciji"} />
        <Field label="Ukupno m²" value={nalog.m2 || "po kalkulaciji"} />
        <Field label="Predlog rolni" value="iz magacina po materijalu/širini" />
        <Field label="Napomena magacinu" value={nalog.nap || nalog.napomena || "Rezervisati materijal pre proizvodnje"} />
      </div>
    </Section>
  );
}

function KPDFSection({ nalog }) {
  const { folija, pdf, t } = getData(nalog);
  const kpdf = pick(nalog, ["kpdf", "kpdf_dizajn", "dizajn_pdf"], pick(folija, ["kpdf", "dizajn_pdf"], pick(pdf, ["kpdf", "dizajn"])));
  const perfPdf = pick(nalog, ["pdf_perforacije", "perforacija_pdf"], pick(folija, ["pdf_perforacije", "perforacija_pdf"], pick(pdf, ["perforacija"])));
  const verzija = pick(nalog, ["verzija_dizajna"], pick(folija, ["verzija_dizajna"], pick(t, ["verzija"], "—")));
  return (
    <Section title="📄 KPDF / DIZAJN I PDF PERFORACIJE" color="#0ea5e9" subtitle="priprema / štampa / perforacija">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <Field label="KPDF dizajn" value={kpdf || "nije dodat / dodati u template"} />
        <Field label="Verzija dizajna" value={verzija} />
        <Field label="PDF perforacije" value={perfPdf || "nije dodat / po specifikaciji"} />
        <Field label="Odobrenje" value={pick(nalog, ["odobrenje_dizajna"], pick(folija, ["odobrenje"], "pre proizvodnje"))} />
      </div>
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ border: "1px dashed #38bdf8", borderRadius: 12, padding: 14, background: "#f0f9ff" }}>
          <div style={{ fontWeight: 950, color: "#0369a1" }}>Preview dizajna / KPDF</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>U realnom radu ovde se prikazuje link/thumbnail PDF dizajna koji je ubačen u template proizvoda.</div>
        </div>
        <div style={{ border: "1px dashed #a78bfa", borderRadius: 12, padding: 14, background: "#f5f3ff" }}>
          <div style={{ fontWeight: 950, color: "#6d28d9" }}>Preview PDF perforacije</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>Perforacija se prikazuje u nalogu za perforaciju i u finalnom prikazu rolne.</div>
        </div>
      </div>
    </Section>
  );
}

function StampaSection({ nalog }) {
  const struktura = getStruktura(nalog);
  return (
    <Section title="🖨️ NALOG ZA ŠTAMPU" color="#3b82f6" subtitle="flexo / kontrola grafike">
      {struktura.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 12 }}>
          <Field label="Materijal za štampu" value={nalog.sloj_stampa || struktura[0]?.naziv || struktura[0]?.tip} />
          <Field label="Sloj" value="Sloj 1 / spoljašnji" />
          <Field label="Širina" value={struktura[0]?.sirina ? struktura[0].sirina + " mm" : nalog.sirina} />
          <Field label="Metraža" value={struktura[0]?.metraza ? fmt(struktura[0].metraza, " m") : nalog.metraza} />
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <Field label="Mašina" value={nalog.masina_stampe || "UTECO / po izboru"} />
        <Field label="Broj boja" value={nalog.broj_boja || nalog.boje || "—"} />
        <Field label="Strana štampe" value={nalog.strana_stampe || "Spoljna/Unutrašnja"} />
        <Field label="Raport / cilindar" value={nalog.raport || nalog.obim || "—"} />
        <Field label="Smer odmotavanja" value={nalog.smer || "po specifikaciji"} />
        <Field label="Kontrola" value="nijansa, registar, prianjanje" />
        <Field label="KPDF" value={pick(nalog, ["kpdf", "kpdf_dizajn"], pick(getData(nalog).folija, ["kpdf"], "po template-u"))} />
        <Field label="Napomena" value={nalog.napomena_stampe || nalog.nap || "—"} />
      </div>
    </Section>
  );
}

function KasiranjeSection({ nalog }) {
  return (
    <Section title="🔗 NALOG ZA KAŠIRANJE" color="#1d4ed8" subtitle="redosled slojeva / lepak">
      <StrukturaFolije nalog={nalog} color="#1d4ed8" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <Field label="Kaširanje" value={nalog.kasiranje || "prema strukturi folije"} />
        <Field label="Lepak" value={nalog.lepak || "SF724A / 324CA"} />
        <Field label="Nanos" value={nalog.nanos_lepka || "1.8 g/m²"} />
        <Field label="Zrenje" value={nalog.zrenje || "48h"} />
        <Field label="Temperatura" value={nalog.temperatura || "po tehnologiji"} />
        <Field label="Pritisak" value={nalog.pritisak || "po tehnologiji"} />
        <Field label="Brzina" value={nalog.brzina || "po mašini"} />
        <Field label="Kontrola" value="delaminacija, mehurići, prijanjanje" />
      </div>
    </Section>
  );
}

function SlittingVisual({ nalog }) {
  const { folija } = getData(nalog);
  const widths = nalog.sirine_traka || nalog.formati || folija.sirine_traka || folija.formati || [];
  const arr = Array.isArray(widths) && widths.length ? widths.map((w) => typeof w === "object" ? Number(w.sirina || w.width || 0) : Number(w || 0)).filter(Boolean) : [Number(nalog.sirina_trake || nalog.format || 0)].filter(Boolean);
  const total = Number(nalog.sirina_ulaz || folija.sirina_maticne || nalog.sirina || arr.reduce((s, x) => s + x, 0) || 1000);
  const sum = arr.reduce((s, x) => s + x, 0);
  const waste = Math.max(0, total - sum);
  const segments = arr.concat(waste ? [waste] : []);
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 14, background: "#f8fafc", marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontWeight: 950, color: "#334155" }}>
        <span>Grafički prikaz rezanja na matičnoj roli</span>
        <span>{total} mm</span>
      </div>
      <div style={{ display: "flex", height: 72, border: "2px solid #0f172a", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        {segments.map((w, i) => {
          const pct = Math.max(4, (w / total) * 100);
          const isWaste = waste && i === segments.length - 1;
          return (
            <div key={i} style={{ width: pct + "%", borderRight: i < segments.length - 1 ? "1px solid #0f172a" : "none", display: "flex", alignItems: "center", justifyContent: "center", background: isWaste ? "#fee2e2" : i % 2 ? "#dbeafe" : "#bfdbfe", color: isWaste ? "#991b1b" : "#1e3a8a", fontWeight: 950, fontSize: 12, textAlign: "center" }}>
              {isWaste ? "OTPAD " : "TRAKA "}{w}mm
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <Badge color="#1d4ed8">Iskorišćeno: {sum} mm</Badge>
        <Badge color={waste ? "#dc2626" : "#059669"}>Otpad: {waste} mm</Badge>
        <Badge color="#6366f1">Broj traka: {arr.length}</Badge>
      </div>
    </div>
  );
}

function RezanjeSection({ nalog }) {
  const formati = nalog.formati || [];
  return (
    <Section title="✂️ NALOG ZA REZANJE / SLITTING" color="#6366f1" subtitle="plan rezanja / finalne rolne">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 12 }}>
        <Field label="Ulazna širina" value={nalog.sirina_ulaz || nalog.sirina || "—"} />
        <Field label="Format / širina trake" value={nalog.format || nalog.sirina_trake || "—"} />
        <Field label="Broj traka" value={nalog.broj_traka || "—"} />
        <Field label="Metraža po roli" value={nalog.metraza_po_rolni || "—"} />
      </div>
      {formati.length ? <MiniTable columns={["Format", "Širina", "Metraža", "Br. rolni", "Izlaz"]} rows={formati.map((f, i) => [i + 1, f.sirina, f.metraza, f.brRolni, f.izlaz || "Magacin"])} /> : null}
      <SlittingVisual nalog={nalog} />
    </Section>
  );
}

function PerforacijaSection({ nalog }) {
  const { folija } = getData(nalog);
  return (
    <Section title="🔵 NALOG ZA PERFORACIJU" color="#8b5cf6" subtitle="KPDF / mikro / makro perforacija">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <Field label="Tip perforacije" value={nalog.tip_perforacije || folija.tip_perforacije || nalog.perforacija || "po specifikaciji"} />
        <Field label="Odnos / šema" value={nalog.odnos_perforacije || folija.odnos_perforacije || "30/60 ili po PDF-u"} />
        <Field label="Pozicija" value={nalog.pozicija_perforacije || folija.pozicija_perforacije || "po skici"} />
        <Field label="Razmak" value={nalog.razmak_perforacije || folija.razmak_perforacije || "—"} />
        <Field label="PDF perforacije" value={nalog.pdf_perforacije || folija.pdf_perforacije || "dodati u template"} />
        <Field label="Smer" value={nalog.smer_perforacije || folija.smer_perforacije || "po smeru odmotavanja"} />
        <Field label="Kontrola" value="pozicija, prohodnost, kontinuitet" />
        <Field label="Napomena" value={nalog.napomena_perforacije || "kontrola pre serije"} />
      </div>
      <div style={{ marginTop: 12, border: "1px dashed #8b5cf6", borderRadius: 12, padding: 14, background: "#f5f3ff" }}>
        <div style={{ fontWeight: 950, color: "#6d28d9" }}>Prikaz perforacije na roli</div>
        <svg viewBox="0 0 640 90" style={{ width: "100%", height: 90, marginTop: 8 }}>
          <rect x="20" y="20" width="600" height="45" rx="10" fill="#ffffff" stroke="#7c3aed" strokeWidth="2" />
          <line x1="35" y1="42" x2="605" y2="42" stroke="#7c3aed" strokeWidth="3" strokeDasharray="12 8" />
          <text x="320" y="82" textAnchor="middle" fontSize="13" fontWeight="800" fill="#4c1d95">perforacija — pozicija prema PDF/KPDF specifikaciji</text>
        </svg>
      </div>
    </Section>
  );
}

function IzgledRolneSection({ nalog }) {
  const { folija } = getData(nalog);
  return (
    <Section title="🎞️ IZGLED FINALNE ROLNE" color="#0ea5e9" subtitle="smer / namotavanje / etiketa">
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 14 }}>
        <div style={{ border: "1px solid #bae6fd", borderRadius: 14, padding: 16, minHeight: 160, background: "#f0f9ff" }}>
          <div style={{ fontWeight: 950, color: "#0369a1", marginBottom: 8 }}>Live tehnički prikaz finalne rolne</div>
          <svg viewBox="0 0 640 190" style={{ width: "100%", height: 190 }}>
            <defs>
              <linearGradient id="rollG" x1="0" x2="1"><stop offset="0%" stopColor="#bae6fd"/><stop offset="100%" stopColor="#0ea5e9"/></linearGradient>
            </defs>
            <ellipse cx="180" cy="95" rx="105" ry="60" fill="url(#rollG)" stroke="#075985" strokeWidth="3"/>
            <ellipse cx="180" cy="95" rx="42" ry="24" fill="#fff" stroke="#075985" strokeWidth="3"/>
            <rect x="180" y="35" width="280" height="120" fill="#e0f2fe" stroke="#075985" strokeWidth="3"/>
            <ellipse cx="460" cy="95" rx="105" ry="60" fill="#e0f2fe" stroke="#075985" strokeWidth="3"/>
            <ellipse cx="460" cy="95" rx="42" ry="24" fill="#fff" stroke="#075985" strokeWidth="3"/>
            <path d="M70 168 C140 142, 215 142, 290 168" fill="none" stroke="#0369a1" strokeWidth="4" markerEnd="url(#arrow)" />
            <text x="320" y="25" textAnchor="middle" fontSize="14" fontWeight="900" fill="#075985">FINALNA ROLNA — smer odmotavanja: {val(nalog.smer || folija.smer_odmotavanja, "po template-u")}</text>
            <line x1="220" y1="48" x2="420" y2="48" stroke="#7c3aed" strokeWidth="3" strokeDasharray="10 7"/>
            <text x="320" y="175" textAnchor="middle" fontSize="13" fontWeight="800" fill="#0f172a">štampa {val(nalog.stampa_unutra || folija.stampa_strana, "unutra/spolja")} • hilzna {val(nalog.hilzna || folija.hilzna, "76/152")}</text>
          </svg>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
          <Field label="Hilzna" value={nalog.hilzna || folija.hilzna || "fi 76 / 152"} />
          <Field label="Prečnik rolne" value={nalog.precnik_rolne || folija.precnik_rolne || "—"} />
          <Field label="Štampa" value={nalog.stampa_unutra || folija.stampa_strana || "unutra/spolja"} />
          <Field label="Etiketa" value="QR + broj rolne" />
          <Field label="Dužina rolne" value={nalog.duzina_rolne || folija.duzina_rolne || "—"} />
          <Field label="Smer" value={nalog.smer || folija.smer_odmotavanja || "—"} />
          <Field label="Pozicija perforacije" value={nalog.pozicija_perforacije || folija.pozicija_perforacije || "—"} />
          <Field label="QC" value="ivice, prečnik, namotavanje" />
        </div>
      </div>
    </Section>
  );
}

function KesaSection({ nalog }) {
  const { kesa } = getData(nalog);
  const opcije = [
    ["Eurozumba", nalog.eurozumba || kesa.eurozumba],
    ["Anleger", nalog.anleger || kesa.anleger],
    ["Duplofan", nalog.duplofan || kesa.duplofan],
    ["ADH traka", nalog.adh || kesa.adh_traka],
    ["Kosa klapna", nalog.kosa_klapna || kesa.kosa_klapna],
    ["Perforacija", nalog.perforacija || kesa.perforacija],
    ["Bočni var", nalog.bocni_var || kesa.bocni_var],
    ["Donji var", nalog.donji_var || kesa.donji_var]
  ];
  return (
    <Section title="🛍️ NALOG ZA KESU PRO" color="#b91c1c" subtitle="CAD crtež / operacije / pakovanje">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <Field label="Tip kese" value={nalog.tip_kese || kesa.tip || "ravna / po template-u"} />
        <Field label="Dimenzija" value={nalog.dimenzija || `${val(nalog.sirina || kesa.sirina)} × ${val(nalog.visina || nalog.duzina || kesa.duzina)}`} />
        <Field label="Klapna" value={nalog.klapna || kesa.klapna || "—"} />
        <Field label="Falta" value={nalog.falta || kesa.falta || "—"} />
        <Field label="Količina" value={nalog.komada || nalog.kol || nalog.kolicina} />
        <Field label="Pakovanje" value={nalog.pakovanje || kesa.pakovanje || "po nalogu"} />
        <Field label="Mašina" value={nalog.masina_kese || kesa.masina || "po planu"} />
        <Field label="Tolerancija" value={nalog.tolerancija || "+/- 10%"} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {opcije.map(([label, on]) => <Badge key={label} color={on ? "#b91c1c" : "#64748b"}>{on ? "✓" : "—"} {label}</Badge>)}
      </div>
      <div style={{ marginTop: 12 }}>
        <PrikazKesePRO nalog={{ ...nalog, ...kesa }} />
      </div>
    </Section>
  );
}

function FormatiranjeSection({ nalog }) {
  return (
    <Section title="🎞️ NALOG ZA FORMATIRANJE ROLNI" color="#7c3aed" subtitle="parent → child rolne / QR">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 12 }}>
        <Field label="Ulazna rola" value={nalog.ulazna_rola || nalog.br_rolne || "QR rola iz magacina"} />
        <Field label="Ulazna širina" value={nalog.sirina_ulaz || nalog.sirina || "—"} />
        <Field label="Plan formatiranja" value={nalog.plan_formatiranja || nalog.format || "prema planu rezanja"} />
        <Field label="Nove rolne" value="generisati QR etikete" />
        <Field label="Stvarna metraža" value="upis posle završetka" />
        <Field label="Otpad" value="evidencija otpada" />
        <Field label="Kontrola" value="širina, metraža, ivice" />
        <Field label="Napomena" value={nalog.nap || nalog.napomena || "—"} />
      </div>
      <SlittingVisual nalog={nalog} />
    </Section>
  );
}

function SpulnaDrawing({ nalog }) {
  const { spulna } = getData(nalog);
  const W = pick(nalog, ["W", "sirina_trake", "sirina"], pick(spulna, ["W", "sirina", "sirina_trake"], "W"));
  const D = pick(nalog, ["D", "precnik"], pick(spulna, ["D", "precnik"], "D"));
  const Di = pick(nalog, ["DI", "di", "unutrasnji_precnik", "hilzna"], pick(spulna, ["DI", "di", "hilzna"], "Di"));
  const Da = pick(nalog, ["DA", "da", "spoljasnji_precnik"], pick(spulna, ["DA", "da"], "Da"));
  const gap = pick(nalog, ["gap"], pick(spulna, ["gap"], "G"));
  return (
    <div style={{ border: "1px solid #bbf7d0", borderRadius: 14, background: "#f0fdf4", padding: 14, marginTop: 12 }}>
      <div style={{ fontWeight: 950, color: "#047857", marginBottom: 8 }}>Tehnički crtež špulne iz template-a</div>
      <svg viewBox="0 0 680 240" style={{ width: "100%", height: 240 }}>
        <defs>
          <linearGradient id="spoolG" x1="0" x2="1"><stop offset="0%" stopColor="#d1fae5"/><stop offset="100%" stopColor="#10b981"/></linearGradient>
        </defs>
        <rect x="160" y="70" width="360" height="100" rx="18" fill="url(#spoolG)" stroke="#065f46" strokeWidth="3"/>
        <ellipse cx="160" cy="120" rx="72" ry="86" fill="#ecfdf5" stroke="#065f46" strokeWidth="4"/>
        <ellipse cx="520" cy="120" rx="72" ry="86" fill="#ecfdf5" stroke="#065f46" strokeWidth="4"/>
        <ellipse cx="160" cy="120" rx="30" ry="38" fill="#fff" stroke="#065f46" strokeWidth="3"/>
        <ellipse cx="520" cy="120" rx="30" ry="38" fill="#fff" stroke="#065f46" strokeWidth="3"/>
        <line x1="160" y1="28" x2="520" y2="28" stroke="#0f172a" strokeWidth="2"/>
        <text x="340" y="22" textAnchor="middle" fontSize="13" fontWeight="900" fill="#0f172a">W = {W}</text>
        <line x1="585" y1="35" x2="585" y2="205" stroke="#0f172a" strokeWidth="2"/>
        <text x="610" y="123" fontSize="13" fontWeight="900" fill="#0f172a">D = {D}</text>
        <text x="160" y="218" textAnchor="middle" fontSize="12" fontWeight="900" fill="#065f46">Di = {Di}</text>
        <text x="520" y="218" textAnchor="middle" fontSize="12" fontWeight="900" fill="#065f46">Da = {Da}</text>
        <text x="340" y="190" textAnchor="middle" fontSize="12" fontWeight="900" fill="#065f46">Gap / overlap = {gap}</text>
      </svg>
    </div>
  );
}

function SpulnaSection({ nalog }) {
  const { spulna } = getData(nalog);
  return (
    <Section title="🧵 NALOG ZA ŠPULNE PRO" color="#059669" subtitle="tehnički crtež / namotavanje / pakovanje">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <Field label="Širina trake" value={nalog.sirina_trake || spulna.sirina_trake || nalog.sirina} />
        <Field label="Metraža po špulni" value={nalog.metraza_spulne || spulna.metraza_spulne || nalog.metraza_po_spulni || "—"} />
        <Field label="Broj špulni" value={nalog.broj_spulni || spulna.broj_spulni || nalog.komada || nalog.kolicina} />
        <Field label="Hilzna / Di" value={nalog.hilzna || spulna.hilzna || spulna.DI || "po nalogu"} />
        <Field label="Smer namotavanja" value={nalog.smer || spulna.smer || "po specifikaciji"} />
        <Field label="Gap / overlap" value={nalog.gap || spulna.gap || "—"} />
        <Field label="Pakovanje" value={nalog.pakovanje || spulna.pakovanje || "kutija / streč"} />
        <Field label="QR etiketa" value="svaka špulna / paket" />
      </div>
      <SpulnaDrawing nalog={nalog} />
    </Section>
  );
}

function QCSection({ nalog }) {
  return (
    <Section title="✅ QC / KONTROLA I ZAVRŠETAK" color="#0f172a" subtitle="operator / QC / potpis">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <Field label="Start" value="QR skeniranje naloga" />
        <Field label="Ulazni materijal" value="QR rolne / magacin" />
        <Field label="Kontrola" value="dimenzija, štampa, var, perforacija" />
        <Field label="Kraj" value="stvarna količina + otpad" />
      </div>
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, fontSize: 12, color: "#334155", fontWeight: 800 }}>
        <div>Operator: ____________________</div>
        <div>Mašina: ____________________</div>
        <div>QC: ____________________</div>
        <div>Potpis: ____________________</div>
      </div>
    </Section>
  );
}

export default function NalogLayoutPRO({ nalog = {}, showAll = false }) {
  const tip = normTip(nalog.tip || nalog.tip_proizvoda);
  const vrstaNaloga = normNalog(nalog.vrsta || nalog.tip_naloga || nalog.tipOperacije || nalog.tip, nalog.naziv);

  function shouldShow(name) {
    if (showAll) return true;
    if (vrstaNaloga === "opsti") return true;
    return vrstaNaloga === name || (name === "materijal" && vrstaNaloga === "materijal");
  }

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", fontFamily: "Inter, Arial, sans-serif" }}>
      <style>{`@media print { body * { visibility: hidden; } .nalog-pro-print, .nalog-pro-print * { visibility: visible; } .nalog-pro-print { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; } @page { size: A4; margin: 10mm; } }`}</style>
      <div className="nalog-pro-print">
        <Header nalog={nalog} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 14 }}>
          <Field label="Datum" value={nalog.datum || new Date().toLocaleDateString("sr-RS")} />
          <Field label="Rok isporuke" value={nalog.rok || nalog.datumIsp || nalog.datum_isporuke} />
          <Field label="Status" value={nalog.status || "Čeka"} />
          <Field label="Izvor" value={nalog.izvor || "template / kalkulacija / ponuda"} />
          <Field label="Radnik" value={nalog.radnik || "—"} />
        </div>

        {shouldShow("materijal") && (
          tip === "folija"
            ? <NalogMaterijal_Folija nalog={nalog} />
            : tip === "kesa"
              ? <NalogPotrebaMaterijala_Kesa nalog={nalog} />
              : <NalogPotrebaMaterijala_Spulna nalog={nalog} />
        )}

        {tip === "folija" && (
          <>
            {shouldShow("stampa") && <NalogStampa_Folija nalog={nalog} />}
            {shouldShow("kasiranje") && <NalogKasiranje_Folija nalog={nalog} />}
            {shouldShow("perforacija_rezanje") && <NalogPerforacijaRezanje_Folija nalog={nalog} />}
            {showAll && <>
              <NalogStampa_Folija nalog={nalog} />
              <NalogKasiranje_Folija nalog={nalog} />
              <NalogPerforacijaRezanje_Folija nalog={nalog} />
            </>}
          </>
        )}

        {tip === "kesa" && (
          <>
            {shouldShow("kasiranje") && <KasiranjeSection nalog={nalog} />}
            {shouldShow("kesa") && <NalogKesa_Kesa nalog={nalog} />}
          </>
        )}

        {tip === "spulna" && (
          <>
            {shouldShow("formatiranje") && <NalogFormatiranje_Spulna nalog={nalog} />}
            {shouldShow("spulna") && <NalogSpulne_Spulna nalog={nalog} />}
          </>
        )}

        <QCSection nalog={nalog} />
      </div>
    </div>
  );
}


// V46_MATERIAL_MASTER_EVERYWHERE: ovaj fajl je pripremljen za MaterialSelectorPRO / MaterialText.


// V47_NALOG_FULL_MATERIAL_NAME: nalozi treba da prikazuju pun naziv materijala: VRSTA + OZNAKA + DEBLJINA, npr. BOPP FXCB 20µ.
