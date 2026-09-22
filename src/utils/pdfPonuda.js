import jsPDF from "jspdf";
import { registerDejaVu } from "./pdfFont.js";

// ── Podaci firme (iz zvaničnog MAROPACK memoranduma) ──────────────────────────
const CO = {
  naziv: "MAROPACK DOO",
  sediste: ["Fruškogorska 6, 21207 Ledinci", "Novosadska 19, 21299 Rakovac, Srbija"],
  tel: "+381 21 29 86 921", mail: "info@maropack.rs", web: "www.maropack.rs",
  banka: "NLB Komercijalna banka AD Beograd", racun: "205-0000000525144-33",
  iban: "RS35205007010058452083", swift: "KOBBRSBG",
  apr: "BD 107 325/2014", mb: "21070025", pib: "108801634",
};
const BLU = [21, 72, 154], GRN = [108, 181, 45], INK = [15, 23, 42], MUT = [100, 116, 139];

// ── Prevodi (SR / EN / DE) ────────────────────────────────────────────────────
const TR = {
  sr: {
    title: "PONUDA", kupac: "KUPAC", broj: "Broj:", datum: "Datum:", vazi: "Važi do:",
    cPoz: "POZ.", cProiz: "PROIZVOD", cKol: "KOLIČINA", cCena: "CENA / JED.", cIznos: "IZNOS (EUR)",
    ukupno: "UKUPNO (bez PDV-a)",
    rok: "Rok isporuke:", rokDef: "po dogovoru",
    uslovi: "Uslovi plaćanja:", usloviDef: "avans / po dogovoru",
    cene: "Cene:", ceneVal: "Sve cene su izražene u EUR, bez PDV-a.",
    vazenje: "Važenje ponude:", vazenjeVal: (n) => n + " dana od datuma izdavanja.",
    hvala: "Hvala na poverenju. Za sva pitanja stojimo na raspolaganju.",
    potpis: "Ovlašćeno lice",
    fSed: "SEDIŠTE / HEAD OFFICE", fBank: "TEKUĆI RAČUN / BANK", fReg: "REGISTRACIONI BROJ",
    jed: { folija: "/ 1000 m", kesa: "/ kom", spulna: "/ špulni", "": "" },
    kom: { folija: (m) => m + " m", kesa: (k) => k + " kom", spulna: (k) => k + " špulni", "": (k) => k },
  },
  en: {
    title: "OFFER", kupac: "CUSTOMER", broj: "No.:", datum: "Date:", vazi: "Valid until:",
    cPoz: "POS.", cProiz: "PRODUCT", cKol: "QUANTITY", cCena: "PRICE / UNIT", cIznos: "AMOUNT (EUR)",
    ukupno: "TOTAL (excl. VAT)",
    rok: "Delivery time:", rokDef: "by agreement",
    uslovi: "Payment terms:", usloviDef: "advance / by agreement",
    cene: "Prices:", ceneVal: "All prices are in EUR, excl. VAT.",
    vazenje: "Offer validity:", vazenjeVal: (n) => n + " days from date of issue.",
    hvala: "Thank you for your trust. We remain at your disposal for any questions.",
    potpis: "Authorized person",
    fSed: "HEAD OFFICE", fBank: "BANK ACCOUNT", fReg: "REGISTRY NUMBER",
    jed: { folija: "/ 1000 m", kesa: "/ pc", spulna: "/ spool", "": "" },
    kom: { folija: (m) => m + " m", kesa: (k) => k + " pcs", spulna: (k) => k + " spools", "": (k) => k },
  },
  de: {
    title: "ANGEBOT", kupac: "KUNDE", broj: "Nr.:", datum: "Datum:", vazi: "Gültig bis:",
    cPoz: "POS.", cProiz: "PRODUKT", cKol: "MENGE", cCena: "PREIS / EINH.", cIznos: "BETRAG (EUR)",
    ukupno: "GESAMT (ohne MwSt.)",
    rok: "Lieferzeit:", rokDef: "nach Vereinbarung",
    uslovi: "Zahlungsbedingungen:", usloviDef: "Vorkasse / nach Vereinbarung",
    cene: "Preise:", ceneVal: "Alle Preise in EUR, ohne MwSt.",
    vazenje: "Gültigkeit:", vazenjeVal: (n) => n + " Tage ab Ausstellungsdatum.",
    hvala: "Vielen Dank für Ihr Vertrauen. Für Fragen stehen wir gerne zur Verfügung.",
    potpis: "Unterschrift",
    fSed: "HAUPTSITZ", fBank: "BANKKONTO", fReg: "REGISTERNUMMER",
    jed: { folija: "/ 1000 m", kesa: "/ Stk", spulna: "/ Spule", "": "" },
    kom: { folija: (m) => m + " m", kesa: (k) => k + " Stk", spulna: (k) => k + " Spulen", "": (k) => k },
  },
};

function fmt(v, d = 2) { return Number(v || 0).toLocaleString("sr-RS", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function safe(v, fb = "—") { return v === undefined || v === null || v === "" ? fb : String(v); }
function datStr(d) { const x = new Date(d); const p = (n) => String(n).padStart(2, "0"); return p(x.getDate()) + "." + p(x.getMonth() + 1) + "." + x.getFullYear() + "."; }

function iznosi(p, t) {
  const tip = String(p?.tip || "").toLowerCase();
  const key = (tip === "folija" || tip === "kesa") ? tip : ((tip === "spulna" || tip === "špulna") ? "spulna" : "");
  const kol = Number(p?.kol ?? p?.kolicina ?? 0) || 0;
  const cena = Number(p?.c1 ?? p?.cena ?? p?.konacna_cena ?? 0) || 0;
  const uk = Number(p?.uk ?? cena * kol) || 0;
  const komTxt = key === "folija" ? t.kom.folija(fmt(kol * 1000, 0)) : (t.kom[key] || t.kom[""])(fmt(kol, 0));
  return { komTxt, jed: t.jed[key] || "", cena, uk };
}

export async function napraviPDFPonuda(p = {}, opts = {}) {
  const lang = (opts.lang || p.jezik || "sr").toLowerCase();
  const t = TR[lang] || TR.sr;
  const vaziDana = Number(opts.vaziDana || p.vazi_dana || 30) || 30;

  const doc = new jsPDF("p", "mm", "a4");
  registerDejaVu(doc);
  const FONT = "DejaVuSans";
  const L = 12, R = 198;
  const iz = iznosi(p, t);
  const danas = p._danas ? new Date(p._danas) : new Date();
  const vaziDo = new Date(danas.getTime() + vaziDana * 86400000);

  // ── MEMORANDUM ──────────────────────────────────────────────────────────────
  doc.setFont(FONT, "bold"); doc.setFontSize(26); doc.setTextColor(...BLU);
  doc.text("maropack", L, 18);
  doc.setDrawColor(...GRN); doc.setLineWidth(1.6); doc.line(L + 44, 9, L + 56, 13); doc.setLineWidth(0.2);
  doc.setFontSize(6); doc.setTextColor(...MUT); doc.text("F L E X I B L E   P A C K A G I N G", L + 1, 22);
  doc.setFont(FONT, "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text("Tel.: " + CO.tel + "   •   Mail: " + CO.mail, R, 13, { align: "right" });
  doc.setDrawColor(...BLU); doc.setLineWidth(1.1); doc.line(L, 26, R, 26); doc.setLineWidth(0.2);
  doc.setFont(FONT, "bold"); doc.setFontSize(11); doc.setTextColor(...BLU); doc.text(CO.web, R, 31, { align: "right" });

  // ── kupac + meta ────────────────────────────────────────────────────────────
  doc.setTextColor(...MUT); doc.setFont(FONT, "bold"); doc.setFontSize(8); doc.text(t.kupac, L, 42);
  doc.setTextColor(...INK); doc.setFontSize(13); doc.text(safe(p.kupac), L, 49);
  doc.setFont(FONT, "normal"); doc.setFontSize(9); doc.setTextColor(...MUT);
  if (p.adresa) doc.text(safe(p.adresa), L, 55);
  if (p.pib_kupca) doc.text("PIB: " + safe(p.pib_kupca), L, 60);

  doc.setTextColor(...INK); doc.setFontSize(9.5);
  doc.text(t.broj, 150, 42); doc.text(safe(p.broj || p.id), R, 42, { align: "right" });
  doc.text(t.datum, 150, 48); doc.text(datStr(danas), R, 48, { align: "right" });
  doc.text(t.vazi, 150, 54); doc.text(datStr(vaziDo), R, 54, { align: "right" });

  doc.setFont(FONT, "bold"); doc.setFontSize(24); doc.setTextColor(...INK); doc.text(t.title, L, 74);

  // ── STAVKE ──────────────────────────────────────────────────────────────────
  let y = 84;
  doc.setDrawColor(...INK); doc.setLineWidth(0.5); doc.line(L, y, R, y);
  doc.setFont(FONT, "bold"); doc.setFontSize(8.5); doc.setTextColor(...INK);
  doc.text(t.cPoz, L, y + 5);
  doc.text(t.cProiz, L + 10, y + 5);
  doc.text(t.cKol, 110, y + 5, { align: "right" });
  doc.text(t.cCena, 168, y + 5, { align: "right" });
  doc.text(t.cIznos, R, y + 5, { align: "right" });
  y += 8; doc.line(L, y, R, y);

  y += 8;
  doc.setFont(FONT, "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
  doc.text("1", L, y);
  doc.text(safe(p.naziv || p.proizvod), L + 10, y, { maxWidth: 82 });
  doc.setFont(FONT, "normal");
  doc.text(iz.komTxt, 110, y, { align: "right" });
  doc.text(fmt(iz.cena) + " € " + iz.jed, 168, y, { align: "right" }); // cena i jedinica u ISTOM redu
  doc.text(fmt(iz.uk), R, y, { align: "right" });

  // ukupno
  y += 12;
  doc.setDrawColor(...INK); doc.setLineWidth(0.5); doc.line(L, y, R, y);
  y += 7;
  doc.setFont(FONT, "bold"); doc.setFontSize(12); doc.setTextColor(...INK);
  doc.text(t.ukupno, 168, y, { align: "right" });
  doc.text(fmt(iz.uk) + " €", R, y, { align: "right" });

  // ── USLOVI ──────────────────────────────────────────────────────────────────
  y += 16;
  const term = (k, v) => {
    doc.setFont(FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(...INK); doc.text(k, L, y);
    const vx = L + Math.max(44, doc.getTextWidth(k) + 4); // vrednost počinje posle labele (i za duge DE reči)
    doc.setFont(FONT, "normal"); doc.setTextColor(51, 65, 85); doc.text(v, vx, y, { maxWidth: R - vx });
    y += 6.5;
  };
  term(t.rok, safe(p.rok_isporuke || p.rok, t.rokDef));
  term(t.uslovi, safe(p.uslovi_placanja || p.uslovi, t.usloviDef));
  term(t.cene, t.ceneVal);
  term(t.vazenje, t.vazenjeVal(vaziDana));
  if (p.napomena || p.nap) term(lang === "en" ? "Note:" : lang === "de" ? "Anmerkung:" : "Napomena:", safe(p.napomena || p.nap));

  y += 4;
  doc.setFont(FONT, "normal"); doc.setFontSize(10); doc.setTextColor(...INK); doc.text(t.hvala, L, y, { maxWidth: 180 });

  // potpis
  doc.setDrawColor(...INK); doc.line(135, 250, 195, 250);
  doc.setFont(FONT, "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text(t.potpis, 165, 255, { align: "center" });

  // ── FOOTER (3 kolone) ───────────────────────────────────────────────────────
  const fy = 264;
  doc.setDrawColor(...BLU); doc.setLineWidth(0.8); doc.line(L, fy, R, fy);
  const col = (x, w, title, lines) => {
    doc.setFillColor(...BLU); doc.rect(x, fy + 1.5, w, 5, "F");
    doc.setFont(FONT, "bold"); doc.setFontSize(7); doc.setTextColor(255, 255, 255); doc.text(title, x + 2, fy + 5.2);
    doc.setFont(FONT, "normal"); doc.setFontSize(7); doc.setTextColor(...MUT);
    let ly = fy + 11; lines.forEach((ln) => { doc.text(ln, x + 2, ly); ly += 3.6; });
  };
  col(L, 60, t.fSed, [CO.naziv, ...CO.sediste]);
  col(76, 62, t.fBank, [CO.banka, "Din: " + CO.racun, "IBAN: " + CO.iban, "SWIFT: " + CO.swift]);
  col(142, 56, t.fReg, ["APR: " + CO.apr, "MB: " + CO.mb, "PIB: " + CO.pib]);

  doc.save("Ponuda_" + safe(p.broj || p.id || "MAROPACK") + ".pdf");
}