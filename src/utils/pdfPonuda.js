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

function money(v) {
  return fmt(v, 2) + " EUR";
}

function hLine(doc, y) {
  doc.setDrawColor(226, 232, 240);
  doc.line(12, y, 198, y);
}

export async function napraviPDFPonuda(p = {}) {
  const doc = new jsPDF("p", "mm", "a4");
  const qr = await generateQR("PONUDA:" + safe(p.id || p.broj) + ":" + safe(p.kupac));

  const green = [5, 150, 105];
  const dark = [15, 23, 42];

  // HEADER
  doc.setFillColor(...green);
  doc.rect(0, 0, 210, 36, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("MAROPACK d.o.o.", 12, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Fleksibilna ambalaža · Kalkulacije · Ponude · Proizvodnja", 12, 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("PONUDA", 160, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Broj: " + safe(p.broj || p.id), 160, 22);
  doc.text("Datum: " + safe(p.datum || new Date().toLocaleDateString("sr-RS")), 160, 28);

  if (qr) doc.addImage(qr, "PNG", 170, 42, 28, 28);

  doc.setTextColor(...dark);

  // BASIC INFO BOXES
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Kupac", 12, 48);
  doc.text("Proizvod", 82, 48);
  doc.text("QR provera", 170, 48);

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(12, 52, 62, 25, 2, 2, "FD");
  doc.roundedRect(82, 52, 78, 25, 2, 2, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(safe(p.kupac), 16, 60);
  if (p.adresa) doc.text("Adresa: " + p.adresa, 16, 66);
  if (p.kontakt) doc.text("Kontakt: " + p.kontakt, 16, 72);

  doc.text(safe(p.proizvod || p.naziv), 86, 60);
  doc.text("Tip: " + safe(p.tip || p.tip_proizvoda), 86, 66);
  doc.text("Status: " + safe(p.status || "kreirano"), 86, 72);

  hLine(doc, 86);

  // STRUCTURE TABLE
  let y = 96;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Struktura materijala", 12, y);
  y += 8;

  const struktura = p.struktura || p.mats || p.materijali || [];

  doc.setFillColor(241, 245, 249);
  doc.rect(12, y - 5, 186, 8, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Sloj", 14, y);
  doc.text("Uloga", 28, y);
  doc.text("Materijal", 62, y);
  doc.text("Deb.", 108, y);
  doc.text("GSM", 128, y);
  doc.text("Širina", 146, y);
  doc.text("Kg", 174, y);

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
      doc.text(safe(s.tip || s.naziv), 62, y);
      doc.text(safe(s.debljina, "") + " µ", 108, y);
      doc.text(safe(s.gsm), 128, y);
      doc.text(safe(s.sirina, "") + " mm", 146, y);
      doc.text(fmt(s.kg || 0, 2), 174, y);
      y += 7;
    });
  } else {
    doc.text("Nema unete strukture.", 14, y);
    y += 7;
  }

  y += 6;
  hLine(doc, y);
  y += 12;

  // PRICE TABLE
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Kalkulacija cene", 12, y);
  y += 8;

  const cena = p.cena || p.uk || p.konacna_cena || p.final || 0;
  const kol = p.kol || p.kolicina || p.komada || "";
  const cenaJed = p.c1 || p.cena_jedinicna || cena;

  doc.setFillColor(236, 253, 245);
  doc.roundedRect(12, y - 5, 186, 25, 3, 3, "F");

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Količina", 18, y + 2);
  doc.text("Jedinična cena", 78, y + 2);
  doc.text("Ukupno", 150, y + 2);

  doc.setTextColor(...green);
  doc.setFontSize(15);
  doc.text(safe(kol), 18, y + 13);
  doc.text(money(cenaJed), 78, y + 13);
  doc.text(money(cena), 150, y + 13);

  doc.setTextColor(...dark);
  y += 36;

  // NOTE
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Napomena:", 12, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const note = safe(p.napomena || p.nap || "PDV nije uključen u cenu. Rok isporuke i uslovi plaćanja po dogovoru.");
  doc.text(note, 35, y, { maxWidth: 155 });

  // FOOTER
  doc.setDrawColor(15, 23, 42);
  doc.line(135, 265, 195, 265);
  doc.setFontSize(9);
  doc.text("Ovlašćeno lice", 155, 271);

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text("Maropack d.o.o. · Dokument generisan iz Maropack PRO sistema", 12, 287);

  doc.save("Ponuda_" + safe(p.broj || p.id || "MAROPACK") + ".pdf");
}
