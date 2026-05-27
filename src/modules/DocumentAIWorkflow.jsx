import React, { useMemo, useState } from "react";

const BOX = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, boxShadow: "0 8px 30px rgba(15,23,42,0.04)" };
const INP = { width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 13, boxSizing: "border-box", background: "#fff" };
const LBL = { display: "block", fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: .4, marginBottom: 5 };

function pick(patterns, text, fallback = "") {
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) return String(m[1]).trim().replace(/\s+/g, " ");
  }
  return fallback;
}

function extractMaterials(text) {
  const lines = text.split(/\n|\r/).map(x => x.trim()).filter(Boolean);
  const known = ["BOPP", "PET", "ALU", "CPP", "LDPE", "HDPE", "PE", "PA", "OPA", "PAPIR", "PAPER", "CELOFAN", "CELULOZA"];
  const result = [];
  for (const line of lines) {
    const up = line.toUpperCase();
    const found = known.find(k => up.includes(k));
    const deb = pick([/(\d+(?:[,.]\d+)?)\s*(?:µ|UM|MIC|MIKR|MICRON)/i, /(?:DEBLJINA|THICKNESS)\D{0,20}(\d+(?:[,.]\d+)?)/i], line, "");
    if (found && result.length < 6) {
      result.push({ materijal: found, debljina: deb, opis: line });
    }
  }
  return result;
}

function analyzeText(text) {
  const clean = text || "";
  const upper = clean.toUpperCase();
  const tip = upper.includes("ŠPUL") || upper.includes("SPUL") ? "spulna" : upper.includes("KESA") || upper.includes("BAG") || upper.includes("DOYPACK") ? "kesa" : "folija";
  const kupac = pick([/(?:KUPAC|CUSTOMER|CLIENT|KLIJENT)\s*[:\-]?\s*([^\n\r]+)/i, /(?:ZA KUPCA)\s*[:\-]?\s*([^\n\r]+)/i], clean);
  const proizvod = pick([/(?:PROIZVOD|NAZIV PROIZVODA|PRODUCT|ARTIKAL)\s*[:\-]?\s*([^\n\r]+)/i, /(?:NAZIV)\s*[:\-]?\s*([^\n\r]+)/i], clean);
  const dimenzije = pick([/(?:DIMENZIJE|DIMENSION|FORMAT)\s*[:\-]?\s*([^\n\r]+)/i, /(\d+\s*[xX×]\s*\d+(?:\s*[xX×]\s*\d+)?\s*mm)/i], clean);
  const sirina = pick([/(?:ŠIRINA|SIRINA|WIDTH)\D{0,20}(\d+(?:[,.]\d+)?)/i], clean);
  const duzina = pick([/(?:DUŽINA|DUZINA|LENGTH)\D{0,20}(\d+(?:[,.]\d+)?)/i], clean);
  const kolicina = pick([/(?:KOLIČINA|KOLICINA|QUANTITY|QTY)\D{0,20}(\d+(?:[,.]\d+)?)\s*(kg|kom|m|tona|t)?/i], clean);
  const stampa = /STAMPA|PRINT|FLEXO|BOJA|COLOR/i.test(clean);
  const kasiranje = /KAŠIR|KASIR|LAMINAT|LAMINATION|LEPAK|ADH/i.test(clean);
  const perforacija = /PERFOR|EUROZUMB|ZUMBA|ANLEGER|TAPE/i.test(clean);
  const materijali = extractMaterials(clean);
  const confidence = Math.min(95, 35 + (kupac ? 10 : 0) + (proizvod ? 15 : 0) + (dimenzije || sirina ? 10 : 0) + (kolicina ? 10 : 0) + Math.min(15, materijali.length * 5));
  return { tip, kupac, proizvod, dimenzije, sirina, duzina, kolicina, stampa, kasiranje, perforacija, materijali, confidence };
}

export default function DocumentAIWorkflow({ db, setDb, msg, setPage }) {
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [note, setNote] = useState("");

  const proizvodi = db?.proizvodi || [];
  const similar = useMemo(() => {
    if (!analysis?.proizvod) return [];
    const q = analysis.proizvod.toLowerCase();
    return proizvodi.filter(p => String(p.naziv || p.prod || "").toLowerCase().includes(q.slice(0, 8))).slice(0, 5);
  }, [analysis, proizvodi]);

  async function readFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const ext = file.name.split('.').pop().toLowerCase();
    if (["txt", "csv", "json", "md"].includes(ext)) {
      const txt = await file.text();
      setRawText(txt);
      setNote("Tekst je direktno pročitan iz fajla.");
      return;
    }
    setNote("Za PDF/Word/skenirane naloge u ovoj lokalnoj verziji nalepi tekst iz dokumenta u polje ispod. Kasnije se ovo povezuje sa OCR/AI serverom.");
  }

  function runAnalyze() {
    if (!rawText.trim()) { msg?.("Nalepi tekst naloga ili učitaj tekstualni fajl.", "err"); return; }
    const res = analyzeText(rawText);
    setAnalysis(res);
    msg?.("AI analiza dokumenta završena.");
  }

  function createProductDraft() {
    if (!analysis) return;
    const draft = {
      id: "DOC-" + Date.now(),
      naziv: analysis.proizvod || "Novi proizvod iz dokumenta",
      tip: analysis.tip,
      kupac: analysis.kupac || "",
      dimenzije: analysis.dimenzije || "",
      sirina: analysis.sirina || "",
      duzina: analysis.duzina || "",
      materijali: analysis.materijali,
      operacije: {
        stampa: analysis.stampa,
        kasiranje: analysis.kasiranje,
        perforacija: analysis.perforacija
      },
      izvor: "AI dokument workflow",
      datum: new Date().toLocaleDateString("sr-RS")
    };
    const next = { ...(db || {}), proizvodi: [draft, ...((db && db.proizvodi) || [])] };
    setDb?.(next);
    localStorage.setItem("maropack_product_draft_from_document", JSON.stringify(draft));
    msg?.("Kreiran draft proizvoda iz dokumenta.");
  }

  function createOfferDraft() {
    if (!analysis) return;
    const ponuda = {
      id: "PON-DOC-" + Date.now(),
      broj: "AI-DOC-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 9000 + 1000),
      kupac: analysis.kupac || "",
      naziv: analysis.proizvod || "Ponuda iz dokumenta",
      tip: analysis.tip,
      kol: analysis.kolicina || "",
      status: "Draft iz dokumenta",
      datum: new Date().toLocaleDateString("sr-RS"),
      mats: analysis.materijali,
      nap: "Kreirano iz AI dokument workflow-a. Potrebna ručna potvrda parametara."
    };
    const next = { ...(db || {}), ponude: [ponuda, ...((db && db.ponude) || [])] };
    setDb?.(next);
    localStorage.setItem("maropack_offer_draft_from_document", JSON.stringify(ponuda));
    msg?.("Kreiran draft ponude iz dokumenta.");
    setPage?.("ponude");
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>📄 AI Dokument Workflow</h2>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Čitanje starih naloga, PDF/Word sadržaja i priprema proizvoda, kalkulacije ili ponude.</div>
        </div>
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 999, padding: "7px 12px", fontWeight: 800, fontSize: 12 }}>V17 OCR/AI CORE</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1fr)", gap: 16 }}>
        <div style={BOX}>
          <h3 style={{ marginTop: 0 }}>1) Upload ili tekst dokumenta</h3>
          <label style={LBL}>Fajl</label>
          <input type="file" accept=".txt,.csv,.json,.md,.pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={readFile} style={INP} />
          {fileName && <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>Učitan fajl: <b>{fileName}</b></div>}
          {note && <div style={{ marginTop: 10, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: 10, padding: 10, fontSize: 12 }}>{note}</div>}
          <label style={{ ...LBL, marginTop: 14 }}>Tekst naloga / sadržaj dokumenta</label>
          <textarea value={rawText} onChange={e => setRawText(e.target.value)} placeholder="Nalepi tekst starog naloga: kupac, proizvod, materijal, dimenzije, količina, operacije..." style={{ ...INP, minHeight: 240, fontFamily: "Consolas, monospace" }} />
          <button onClick={runAnalyze} style={{ marginTop: 12, width: "100%", border: "none", borderRadius: 10, padding: "12px 14px", background: "#1d4ed8", color: "#fff", fontWeight: 900, cursor: "pointer" }}>🤖 Analiziraj dokument</button>
        </div>

        <div style={BOX}>
          <h3 style={{ marginTop: 0 }}>2) AI rezultat</h3>
          {!analysis ? (
            <div style={{ color: "#94a3b8", textAlign: "center", padding: 50 }}>Još nema analize. Učitaj/nalepi dokument i klikni “Analiziraj”.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderRadius: 10, padding: 12 }}>
                <b>Pouzdanost analize</b><span style={{ color: analysis.confidence > 70 ? "#16a34a" : "#f59e0b", fontWeight: 900 }}>{analysis.confidence}%</span>
              </div>
              {[
                ["Tip", analysis.tip], ["Kupac", analysis.kupac], ["Proizvod", analysis.proizvod], ["Dimenzije", analysis.dimenzije], ["Širina", analysis.sirina], ["Dužina", analysis.duzina], ["Količina", analysis.kolicina]
              ].map(([a,b]) => <div key={a} style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8, fontSize: 13 }}><span style={{ color: "#64748b", fontWeight: 800 }}>{a}</span><span>{b || "—"}</span></div>)}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                {analysis.stampa && <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 800 }}>Štampa</span>}
                {analysis.kasiranje && <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 800 }}>Kaširanje</span>}
                {analysis.perforacija && <span style={{ background: "#fef3c7", color: "#b45309", borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 800 }}>Perforacija / dodaci</span>}
              </div>

              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
                <b>Materijali</b>
                {analysis.materijali.length === 0 ? <div style={{ color: "#94a3b8", marginTop: 6 }}>Nisu prepoznati materijali.</div> : analysis.materijali.map((m, i) => (
                  <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, marginTop: 8, fontSize: 12 }}>
                    <b>{m.materijal}</b> {m.debljina ? `${m.debljina}µ` : ""}<div style={{ color: "#64748b", marginTop: 3 }}>{m.opis}</div>
                  </div>
                ))}
              </div>

              {similar.length > 0 && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 10, fontSize: 12 }}><b>Mogući postojeći proizvodi:</b> {similar.map(p => p.naziv || p.prod).join(", ")}</div>}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
                <button onClick={createProductDraft} style={{ border: "none", borderRadius: 10, padding: "11px 12px", background: "#0f172a", color: "#fff", fontWeight: 900, cursor: "pointer" }}>📦 Draft proizvod</button>
                <button onClick={createOfferDraft} style={{ border: "none", borderRadius: 10, padding: "11px 12px", background: "#16a34a", color: "#fff", fontWeight: 900, cursor: "pointer" }}>📄 Draft ponuda</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ ...BOX, background: "#f8fafc" }}>
        <b>Napomena za sledeću fazu:</b> ovaj V17 modul ima lokalni parser i workflow. Za pravo OCR čitanje skeniranih PDF/slika povezuje se serverless API koji radi OCR + AI ekstrakciju, pa vraća strukturisane podatke u iste forme.
      </div>
    </div>
  );
}
