import React, { useMemo, useState } from "react";
import { supabase } from "../supabase.js";

function normalizeProduct(p = {}) {
  const podaci = p.podaci || {};
  return {
    ...p,
    naziv: p.naziv || podaci.naziv || p.prod || "",
    tip: p.tip || podaci.tip || "folija",
    kupac: p.kupac || podaci.kupac || "",
    dimenzije: p.dimenzije || podaci.dimenzije || {},
    struktura_materijala: p.struktura_materijala || podaci.struktura_materijala || p.mats || [],
    tehnicki_parametri: p.tehnicki_parametri || podaci.tehnicki_parametri || {},
    standardne_operacije: p.standardne_operacije || podaci.standardne_operacije || [],
    cena_parametri: p.cena_parametri || podaci.cena_parametri || {},
    crtez: p.crtez || podaci.crtez || {},
  };
}

function scoreProduct(product, query) {
  const q = String(query || "").toLowerCase();
  const fields = [product.naziv, product.sifra, product.kupac, product.opis].join(" ").toLowerCase();
  if (!q || !fields.trim()) return 0;
  let score = 0;
  const words = q.split(/\s+/).filter((w) => w.length > 2 && !["napravi", "ponudu", "kalkulaciju", "nalog", "za", "kom", "kg", "m"].includes(w));
  words.forEach((w) => { if (fields.includes(w)) score += 10; });
  if (fields.includes(q)) score += 80;
  return score;
}

function parseQuantity(text) {
  const cleaned = String(text || "").replace(/,/g, ".");
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*(kg|kom|m|metara|tona|t)\b/i);
  if (!m) return { kolicina: "", jedinica: "" };
  let value = Number(m[1]);
  let unit = m[2].toLowerCase();
  if (unit === "tona" || unit === "t") { value *= 1000; unit = "kg"; }
  if (unit === "metara") unit = "m";
  return { kolicina: value, jedinica: unit };
}

function estimatePrice(product, quantity) {
  const q = Number(quantity || product.dimenzije?.kolicina_standard || 0);
  const layers = Array.isArray(product.struktura_materijala) ? product.struktura_materijala : [];
  const materialFactor = layers.reduce((sum, l) => sum + (Number(l.debljina || l.debljina_um || 0) * (Number(l.cena_eur_kg) || 2.5)), 0);
  const base = Math.max(1, materialFactor / 100);
  const margin = 1 + (Number(product.cena_parametri?.marza_proc || 30) / 100);
  return Math.round(q * base * margin * 100) / 100;
}

function readLocalOffers() {
  try { return JSON.parse(localStorage.getItem("maropack_local_ponude") || "[]"); } catch { return []; }
}

function writeLocalOffer(offer) {
  const list = readLocalOffers();
  const next = [offer, ...list.filter((x) => String(x.id) !== String(offer.id))].slice(0, 100);
  try { localStorage.setItem("maropack_local_ponude", JSON.stringify(next)); } catch {}
}

export default function ProductAIWorkflow({ db = {}, setDb, msg, setPage }) {
  const products = useMemo(() => (db.proizvodi || []).map(normalizeProduct), [db.proizvodi]);
  const [command, setCommand] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [customer, setCustomer] = useState("");
  const parsed = parseQuantity(command);

  const ranked = useMemo(() => {
    return products
      .map((p) => ({ ...p, _score: scoreProduct(p, command) }))
      .sort((a, b) => b._score - a._score);
  }, [products, command]);

  const selected = normalizeProduct(products.find((p) => String(p.id) === String(selectedId)) || ranked[0] || {});
  const quantity = parsed.kolicina || selected.dimenzije?.kolicina_standard || "";
  const unit = parsed.jedinica || selected.dimenzije?.jedinica || (selected.tip === "folija" ? "m" : "kom");

  function buildCalcDraft(product = selected) {
    return {
      id: "ai-calc-" + Date.now(),
      proizvod_id: product.id,
      naziv: product.naziv,
      tip: product.tip,
      kupac: customer || product.kupac || "",
      kolicina: quantity,
      jedinica: unit,
      ulazni_parametri: {
        dimenzije: product.dimenzije,
        struktura_materijala: product.struktura_materijala,
        tehnicki_parametri: product.tehnicki_parametri,
        cena_parametri: product.cena_parametri,
        standardne_operacije: product.standardne_operacije,
        crtez: product.crtez,
        ai_command: command,
      },
      rezultat: {
        procena_cene: estimatePrice(product, quantity),
      },
      status: "draft",
      created_at: new Date().toISOString(),
    };
  }

  function openCalc() {
    if (!selected?.naziv) return msg?.("Nije pronađen proizvod u bazi.", "err");
    const draft = buildCalcDraft(selected);
    try { localStorage.setItem("maropack_product_calc_draft", JSON.stringify(draft)); } catch {}
    msg?.("AI je pripremio kalkulaciju iz proizvoda.");
    if (selected.tip === "kesa") setPage?.("kalk_kesa");
    else if (selected.tip === "spulna") setPage?.("kalk_spulna");
    else setPage?.("kalk_folija");
  }

  async function createOffer() {
    if (!selected?.naziv) return msg?.("Nije pronađen proizvod u bazi.", "err");
    const calc = buildCalcDraft(selected);
    const offer = {
      id: "local-offer-" + Date.now(),
      broj: "AI-PON-" + new Date().getFullYear() + "-" + String(Math.floor(Math.random() * 9000) + 1000),
      datum: new Date().toLocaleDateString("sr-RS"),
      kupac: customer || selected.kupac || "Kupac",
      naziv: selected.naziv,
      proizvod: selected.naziv,
      tip: selected.tip,
      tip_proizvoda: selected.tip,
      kol: Number(quantity || 0),
      kolicina: Number(quantity || 0),
      jedinica: unit,
      cena: estimatePrice(selected, quantity),
      uk: estimatePrice(selected, quantity),
      status: "kreirana",
      struktura: selected.struktura_materijala || [],
      mats: selected.struktura_materijala || [],
      proizvod_id: selected.id,
      kalkulacija: calc,
      podaci: {
        ai_command: command,
        dimenzije: selected.dimenzije,
        tehnicki_parametri: selected.tehnicki_parametri,
        standardne_operacije: selected.standardne_operacije,
        crtez: selected.crtez,
      },
      created_at: new Date().toISOString(),
    };

    try {
      const payload = { ...offer };
      delete payload.id;
      const { data, error } = await supabase.from("ponude").insert([payload]).select().single();
      if (error) throw error;
      msg?.("AI je kreirao ponudu iz baze proizvoda.");
      setPage?.("ponude");
      return data;
    } catch (e) {
      writeLocalOffer(offer);
      setDb?.((prev) => ({ ...prev, ponude: [offer, ...(prev.ponude || [])] }));
      msg?.("Ponuda je kreirana lokalno. Supabase nije prihvatio upis: " + (e.message || e), "err");
      setPage?.("ponude");
      return offer;
    }
  }

  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, boxShadow: "0 10px 30px rgba(15,23,42,0.06)" };
  const input = { width: "100%", padding: "12px 14px", border: "1px solid #cbd5e1", borderRadius: 12, fontSize: 14, boxSizing: "border-box" };
  const btn = (bg) => ({ padding: "11px 14px", border: "none", borderRadius: 12, background: bg, color: "#fff", fontWeight: 900, cursor: "pointer" });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 950 }}>🤖 AI Workflow iz Baze Proizvoda</h2>
        <div style={{ color: "#64748b", marginTop: 4 }}>Komanda → pronalazak proizvoda → kalkulacija → ponuda → master nalog.</div>
      </div>

      <div style={card}>
        <label style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>AI komanda</label>
        <textarea value={command} onChange={(e) => setCommand(e.target.value)} style={{ ...input, minHeight: 90, marginTop: 8 }} />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginTop: 12 }}>
          <div><label style={{ fontSize: 11, fontWeight: 900, color: "#64748b" }}>Ručno izaberi proizvod</label><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={input}><option value="">AI izbor</option>{products.map((p) => <option key={p.id || p.naziv} value={p.id}>{p.naziv} — {p.tip}</option>)}</select></div>
          <div><label style={{ fontSize: 11, fontWeight: 900, color: "#64748b" }}>Kupac</label><input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder={selected.kupac || "Kupac"} style={input} /></div>
          <div><label style={{ fontSize: 11, fontWeight: 900, color: "#64748b" }}>Količina</label><input readOnly value={quantity ? `${quantity} ${unit}` : "nije prepoznato"} style={{ ...input, background: "#f8fafc" }} /></div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Pronađen proizvod</h3>
          {selected?.naziv ? <>
            <div style={{ fontSize: 22, fontWeight: 950 }}>{selected.naziv}</div>
            <div style={{ color: "#64748b", marginTop: 4 }}>{selected.tip} · {selected.kupac || "bez kupca"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 14 }}>
              <Mini title="Širina" value={(selected.dimenzije?.sirina_mm || "—") + " mm"} />
              <Mini title="Slojeva" value={(selected.struktura_materijala || []).length} />
              <Mini title="Procena" value={estimatePrice(selected, quantity).toLocaleString("sr-RS") + " €"} />
            </div>
            <div style={{ marginTop: 14, background: "#f8fafc", borderRadius: 12, padding: 12 }}>
              <b>Operacije:</b> {(selected.standardne_operacije || []).join(", ") || "nisu definisane"}
            </div>
          </> : <div style={{ color: "#64748b" }}>Nema proizvoda u bazi. Prvo dodaj proizvod u Baza Proizvoda PRO.</div>}
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Predlog AI toka</h3>
          <ol style={{ margin: 0, paddingLeft: 20, color: "#334155", lineHeight: 1.9 }}>
            <li>Učitaj proizvod iz baze kao template.</li>
            <li>Popuni kalkulaciju materijalima, dimenzijama i škartom.</li>
            <li>Kreiraj ponudu za prepoznatu količinu.</li>
            <li>Prihvatanjem ponude kreira se master nalog i operativni nalozi.</li>
          </ol>
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <button onClick={openCalc} style={btn("#1d4ed8")}>🧮 Otvori kalkulaciju</button>
            <button onClick={createOffer} style={btn("#059669")}>📄 Kreiraj ponudu</button>
            <button onClick={() => setPage?.("baza_proizvoda_pro")} style={btn("#111827")}>📦 Baza proizvoda</button>
          </div>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Najbolji pogodci</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {ranked.slice(0, 5).map((p) => <button key={p.id || p.naziv} onClick={() => setSelectedId(p.id)} style={{ textAlign: "left", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, background: String(selected.id) === String(p.id) ? "#eff6ff" : "#fff", cursor: "pointer" }}><b>{p.naziv}</b><span style={{ marginLeft: 8, color: "#64748b" }}>{p.tip}</span><span style={{ float: "right", color: "#1d4ed8", fontWeight: 900 }}>score {p._score}</span></button>)}
        </div>
      </div>
    </div>
  );
}

function Mini({ title, value }) {
  return <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 10 }}><div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{title}</div><div style={{ fontSize: 16, fontWeight: 950, marginTop: 4 }}>{value}</div></div>;
}
