import jsPDF from "jspdf";
import { generateQR } from "./qr.js";

function fmt(v, d = 2) {
  return Number(v || 0).toLocaleString("sr-RS", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function safe(v, fallback = "—") {
  return v === undefined || v === null || v === "" ? fallback : String(v);
}

function titleFor(n) {
  const t = String(n.tip_naloga || n.tip || "").toLowerCase();
  if (t.includes("mater")) return ["NALOG ZA POTREBU MATERIJALA", [245, 158, 11]];
  if (t.includes("stamp") || t.includes("štamp")) return ["NALOG ZA ŠTAMPU", [59, 130, 246]];
  if (t.includes("kas")) return ["NALOG ZA KAŠIRANJE", [29, 78, 216]];
  if (t.includes("rez")) return ["NALOG ZA REZANJE", [99, 102, 241]];
  if (t.includes("perf")) return ["NALOG ZA PERFORACIJU", [139, 92, 246]];
  if (t.includes("roln")) return ["IZGLED NA ROLNI", [14, 165, 233]];
  if (t.includes("kesa")) return ["NALOG ZA KESU", [185, 28, 28]];
  if (t.includes("spul")) return ["NALOG ZA ŠPULNE", [5, 150, 105]];
  return ["RADNI NALOG", [15, 23, 42]];
}

function header(doc, n, title, color) {
  doc.setFillColor(...color);
  doc.rect(0, 0, 210, 36, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("MAROPACK d.o.o.", 12, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("PROIZVODNI RADNI NALOG", 12, 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, 105, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Broj: " + safe(n.ponBr || n.broj_naloga || n.id), 105, 22);
  doc.text("Datum: " + safe(n.datum || new Date().toLocaleDateString("sr-RS")), 105, 28);
}

export async function napraviPDFNalog(n = {}) {
  const doc = new jsPDF("p", "mm", "a4");
  const [title, color] = titleFor(n);
  const qr = await generateQR("NALOG:" + safe(n.ponBr || n.id));

  header(doc, n, title, color);
  if (qr) doc.addImage(qr, "PNG", 170, 42, 28, 28);

  doc.setTextColor(15, 23, 42);

  // BASIC
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Osnovni podaci", 12, 48);

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(12, 52, 145, 24, 2, 2, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Kupac: " + safe(n.kupac), 16, 60);
  doc.text("Proizvod: " + safe(n.prod || n.proizvod || n.naziv), 16, 67);
  doc.text("Status: " + safe(n.status || "Čeka"), 92, 60);
  doc.text("Tip: " + safe(n.tip_proizvoda || n.tip).toUpperCase(), 92, 67);

  // MATERIAL STRUCTURE
  let y = 88;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Struktura / materijali", 12, y);
  y += 8;

  const struktura = n.struktura || n.mats || n.materijali || [];

  doc.setFillColor(241, 245, 249);
  doc.rect(12, y - 5, 186, 8, "F");
  doc.setFontSize(8);
  doc.text("Sloj", 14, y);
  doc.text("Uloga", 28, y);
  doc.text("Materijal", 68, y);
  doc.text("Deb.", 116, y);
  doc.text("GSM", 136, y);
  doc.text("Širina", 154, y);
  doc.text("Kg", 180, y);

  y += 7;
  doc.setFont("helvetica", "normal");

  if (struktura.length) {
    struktura.slice(0, 8).forEach((s, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(252, 253, 255);
        doc.rect(12, y - 5, 186, 7, "F");
      }
      doc.text(String(s.sloj || i + 1), 14, y);
      doc.text(safe(s.uloga || ""), 28, y);
      doc.text(safe(s.tip || s.naziv), 68, y);
      doc.text(safe(s.debljina, "") + " µ", 116, y);
      doc.text(safe(s.gsm), 136, y);
      doc.text(safe(s.sirina, "") + " mm", 154, y);
      doc.text(fmt(s.kg || 0, 2), 180, y);
      y += 7;
    });
  } else {
    doc.text("Nema unete strukture/materijala.", 14, y);
    y += 7;
  }

  // TECHNOLOGY
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Tehnološki podaci", 12, y);
  y += 8;

  const tech = [
    ["Širina", safe(n.sirina) + " mm"],
    ["Metraža", safe(n.metraza) + " m"],
    ["Količina", safe(n.kol || n.komada || n.kolicina)],
    ["Ukupno kg", fmt(n.ukupnoKg || 0) + " kg"],
    ["Broj boja", safe(n.broj_boja || n.boje)],
    ["Kaširanje", safe(n.kasiranje || n.brojKasiranja)],
    ["Hilzna", safe(n.hilzna)],
    ["Pakovanje", safe(n.pakovanje)],
  ];

  doc.setFontSize(9);
  tech.forEach(([a, b], i) => {
    const x = i % 2 === 0 ? 12 : 105;
    const yy = y + Math.floor(i / 2) * 8;
    doc.setFont("helvetica", "bold");
    doc.text(a + ":", x, yy);
    doc.setFont("helvetica", "normal");
    doc.text(b, x + 30, yy);
  });

  // CONTROL
  y += 44;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Kontrola proizvodnje", 12, y);
  y += 8;

  const checks = ["Dimenzija", "Količina", "Izgled", "Laminacija", "Rezanje", "QR/etiketa"];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  checks.forEach((c, i) => {
    const x = i % 2 === 0 ? 12 : 105;
    const yy = y + Math.floor(i / 2) * 10;
    doc.rect(x, yy - 4, 4, 4);
    doc.text(c, x + 7, yy);
  });

  doc.setDrawColor(15, 23, 42);
  doc.line(12, 260, 65, 260);
  doc.line(82, 260, 135, 260);
  doc.line(145, 260, 198, 260);

  doc.setFontSize(8);
  doc.text("Radnik", 28, 266);
  doc.text("Kontrola", 99, 266);
  doc.text("Datum / potpis", 160, 266);

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text("Maropack d.o.o. · Dokument generisan iz Maropack PRO sistema", 12, 287);

  doc.save("Nalog_" + safe(n.tip_naloga || n.tip || "MAROPACK") + "_" + safe(n.ponBr || n.id || "") + ".pdf");
}
