import React, { useState, useEffect } from "react";
import { supabase } from "../supabase.js";
import NalogLayoutPRO from "../NalogLayoutPRO.jsx";

function num(v) { return Number(String(v ?? 0).toString().replace(/\s/g, "").replace(",", ".")) || 0; }
function vColor(v) { const x = String(v || "").toUpperCase(); if (x.includes("PET")) return "#3b82f6"; if (x.includes("ALU")) return "#9aa3af"; if (x.includes("OPA") || x.includes("CPP")) return "#14b8a6"; if (x.includes("BOPP") || x.includes("PE")) return "#f59e0b"; if (x.includes("PAPIR")) return "#d4a574"; return "#64748b"; }
function normLayer(m, i) { return { vrsta: m.vrsta || m.materijal || ("Sloj " + (i + 1)), pod_vrsta: m.pod_vrsta || m.podVrsta || "", oznaka: m.oznaka_materijala || m.oznaka || "", deb: num(m.debljina ?? m.deb), gm2: num(m.gm2 ?? m.tezina), c: vColor(m.vrsta) }; }
const fmt = (n) => Number(n || 0).toLocaleString("sr-RS");

export default function AINalogPreview({ productId, productName, kupac: kupacIn, kolicina: kolIn, onClose, onDone }) {
  const [loading, setLoading] = useState(true);
  const [prod, setProd] = useState(null);
  const [tpl, setTpl] = useState({});
  const [layers, setLayers] = useState([]);
  const [kolicina, setKolicina] = useState(kolIn || 0);
  const [kupac, setKupac] = useState(kupacIn || "");
  const [options, setOptions] = useState({});
  const [picks, setPicks] = useState({});
  const [tab, setTab] = useState("stampa");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function load() {
    setLoading(true);
    try {
      const { data } = await supabase.from("proizvodi").select("*").eq("id", productId).maybeSingle();
      const p = data || {}; setProd(p);
      const t = p.data || p.template || {}; setTpl(t);
      if (!kupacIn) setKupac(p.kupac || "");
      const folija = t.folija || (t.data && t.data.folija) || {};
      const ls = (folija.layers || []).map(normLayer); setLayers(ls);
      const opt = {}, pk = {};
      for (let i = 0; i < ls.length; i++) {
        const l = ls[i];
        let q = supabase.from("magacin").select("*").eq("status", "Na stanju").limit(20);
        if (l.vrsta) q = q.ilike("vrsta", "%" + l.vrsta + "%");
        const { data: rs } = await q;
        let rows = (rs || []).filter((r) => !r.dodeljeno_nalogu);
        if (l.oznaka) { const ex = rows.filter((r) => String(r.oznaka_materijala || "").toUpperCase().includes(l.oznaka.toUpperCase())); if (ex.length) rows = ex; }
        opt[i] = rows; pk[i] = rows[0] ? rows[0].id : "";
      }
      setOptions(opt); setPicks(pk);
    } catch (e) { } finally { setLoading(false); }
  }

  const folija = tpl.folija || (tpl.data && tpl.data.folija) || {};
  const nalogPreview = { broj_naloga: "PREDLOG", kupac, proizvod: (prod && prod.naziv) || productName, kolicina, parametri: tpl, res: { template: tpl }, product_template: tpl, template: tpl, folija };

  async function potvrdi() {
    setSaving(true);
    try {
      const naziv = (prod && prod.naziv) || productName;
      const tip = (prod && prod.tip) || "folija";
      const layersArr = folija.layers || [];
      // 1) Kalkulacija (zaseban zapis)
      try { await supabase.from("kalkulacije").insert([{ tip, naziv, klijent: kupac || null, data: tpl, materijali_struktura: layersArr, kolicina: Number(kolicina) || null, osnovna_cena: 0, konacna_cena: 0, verzija: 1, status: "ai_predlog", template_id: (prod && prod.id) || null, operacije: [] }]); } catch (e) { }
      // 2) Ponuda
      const { data: pon, error: oe } = await supabase.from("ponude").insert([{ broj: "PON-AI-" + Date.now(), datum: new Date().toLocaleDateString("sr-RS"), kupac: kupac || "AI nalog", naziv, proizvod: naziv, tip, kol: Number(kolicina) || null, kolicina: Number(kolicina) || null, struktura: layersArr, mats: layersArr, status: "prihvaceno", nap: "AI pregled potvrđen", template_id: (prod && prod.id) || null, res: { template: tpl, kupac, kolicina: Number(kolicina) || 0 } }]).select().single();
      if (oe || !pon) throw new Error(oe ? oe.message : "ponuda nije kreirana");
      // 3) Nalozi
      const { error: re } = await supabase.rpc("kreiraj_naloge_iz_ponude", { p_ponuda_id: pon.id });
      if (re) throw new Error("generisanje naloga: " + re.message);
      // 4) Broj + rezervacija izabranih rolni
      let broj = ""; try { const { data: mr } = await supabase.from("radni_nalozi").select("broj_naloga").eq("ponuda_id", pon.id).order("created_at", { ascending: false }).limit(1); if (mr && mr[0]) broj = mr[0].broj_naloga; } catch (e) { }
      const ids = Object.values(picks).filter(Boolean);
      if (broj && ids.length) { try { await supabase.from("magacin").update({ dodeljeno_nalogu: broj, rezervisano: true }).in("id", ids); } catch (e) { } }
      onDone && onDone("✅ Kreirano: kalkulacija + ponuda + nalozi" + (broj ? " · " + broj : "") + (ids.length ? " · " + ids.length + " rolni rezervisano" : "") + ".", false);
    } catch (e) { onDone && onDone("Greška: " + (e.message || e), true); } finally { setSaving(false); }
  }

  /* ---- UI ---- */
  const ov = { position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "flex-start", overflowY: "auto", padding: 18 };
  const box = { width: "min(1000px,100%)", background: "#eef1f5", borderRadius: 18, overflow: "hidden", margin: "auto" };
  const bar = { background: "linear-gradient(135deg,#111827,#0f766e 160%)", color: "#fff", padding: "16px 20px" };
  const panel = { background: "#fff", borderRadius: 14, boxShadow: "0 4px 16px rgba(15,23,42,.08)", margin: "12px 16px" };
  const ph = { padding: "11px 16px", fontWeight: 900, fontSize: 14, borderBottom: "1px solid #eef1f5", display: "flex", alignItems: "center", gap: 8 };
  const cell = { background: "#f8fafc", border: "1px solid #eef1f5", borderRadius: 10, padding: "9px 11px" };
  const k = { fontSize: 10, textTransform: "uppercase", color: "#64748b", fontWeight: 800, letterSpacing: ".4px" };
  const tag = (bg, c) => ({ fontSize: 10, fontWeight: 800, borderRadius: 6, padding: "2px 8px", background: bg, color: c });

  return (
    <div style={ov} onClick={onClose}>
      <div style={box} onClick={(e) => e.stopPropagation()}>
        <div style={bar}>
          <div style={{ fontSize: 19, fontWeight: 900 }}>🧠 AI predlog — pregled pre kreiranja</div>
          <div style={{ opacity: .85, fontSize: 12.5, marginTop: 3 }}>Ništa se ne snima dok ne klikneš „Potvrdi i kreiraj". Svi podaci su iz templejta.</div>
        </div>

        {loading ? <div style={{ padding: 30, textAlign: "center", fontWeight: 700 }}>Učitavam templejt i magacin…</div> : <>
          <div style={panel}>
            <div style={ph}>📦 Podaci o proizvodu <span style={{ ...tag("#dcfce7", "#15803d"), marginLeft: "auto" }}>iz templejta</span></div>
            <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              <div style={cell}><div style={k}>Kupac ✏️</div><input value={kupac} onChange={(e) => setKupac(e.target.value)} style={{ border: "none", background: "transparent", fontWeight: 900, fontSize: 14, width: "100%", outline: "none" }} /></div>
              <div style={cell}><div style={k}>Proizvod</div><div style={{ fontWeight: 900, fontSize: 14, marginTop: 3 }}>{(prod && prod.naziv) || productName}</div></div>
              <div style={cell}><div style={k}>Tip</div><div style={{ fontWeight: 900, fontSize: 14, marginTop: 3 }}>{((prod && prod.tip) || "folija")} · {layers.length} sloja</div></div>
              <div style={{ ...cell, border: "1.5px solid #0f766e", background: "#f0fdfa" }}><div style={k}>Količina ✏️</div><input type="number" value={kolicina} onChange={(e) => setKolicina(e.target.value)} style={{ border: "none", background: "transparent", fontWeight: 900, fontSize: 14, width: "100%", outline: "none", color: "#0f766e" }} /></div>
            </div>
          </div>

          <div style={panel}>
            <div style={ph}>🧱 Struktura materijala (slojevi)</div>
            <div style={{ padding: "6px 16px 14px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead><tr style={{ color: "#475569", textAlign: "left" }}><th style={{ padding: 7 }}>Sloj</th><th>Vrsta</th><th>Pod-vrsta</th><th>Oznaka</th><th>Deb.</th><th>g/m²</th></tr></thead>
                <tbody>{layers.map((l, i) => <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}><td style={{ padding: 7 }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: l.c, marginRight: 6 }} />{i + 1}</td><td>{l.vrsta}</td><td>{l.pod_vrsta || "—"}</td><td>{l.oznaka || "—"}</td><td>{l.deb || "—"} µm</td><td>{l.gm2 || "—"}</td></tr>)}</tbody>
              </table>
            </div>
          </div>

          <div style={panel}>
            <div style={ph}>🖼️ Izgled na rolni i perforacija
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button onClick={() => setTab("stampa")} style={{ ...tag(tab === "stampa" ? "#0f766e" : "#e2e8f0", tab === "stampa" ? "#fff" : "#475569"), cursor: "pointer", border: "none", padding: "5px 12px" }}>Rolna</button>
                <button onClick={() => setTab("perforacija_rezanje")} style={{ ...tag(tab === "perforacija_rezanje" ? "#7c3aed" : "#e2e8f0", tab === "perforacija_rezanje" ? "#fff" : "#475569"), cursor: "pointer", border: "none", padding: "5px 12px" }}>Perforacija / rezanje</button>
              </span>
            </div>
            <div style={{ padding: 8, maxHeight: 560, overflowY: "auto", background: "#94a0b0" }}>
              <NalogLayoutPRO nalog={nalogPreview} activeTab={tab} />
            </div>
          </div>

          <div style={panel}>
            <div style={ph}>📦 Izbor materijala <span style={{ ...tag("#fef3c7", "#a16207"), marginLeft: "auto" }}>predlog — možeš da zameniš</span></div>
            <div style={{ padding: 16 }}>
              {layers.length === 0 && <div style={{ color: "#64748b" }}>Nema slojeva u templejtu.</div>}
              {layers.map((l, i) => {
                const opts = options[i] || [];
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i ? "1px solid #f1f5f9" : "none" }}>
                    <span style={{ width: 11, height: 11, borderRadius: "50%", background: l.c }} />
                    <div style={{ minWidth: 150, fontWeight: 800, fontSize: 13 }}>{(i + 1) + ". " + l.vrsta}{l.oznaka ? " · " + l.oznaka : ""}</div>
                    {opts.length === 0
                      ? <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 700 }}>nema slobodnih rolni u magacinu</span>
                      : <select value={picks[i] || ""} onChange={(e) => setPicks((p) => ({ ...p, [i]: e.target.value }))} style={{ flex: 1, border: "1px solid #cbd5e1", borderRadius: 9, padding: "9px 11px", fontSize: 13, fontWeight: 700, background: "#fff" }}>
                        <option value="">— bez rezervacije —</option>
                        {opts.map((r) => <option key={r.id} value={r.id}>{(r.br_rolne || r.qr_code) + " · " + (r.oznaka_materijala || "") + " · š" + (r.sirina || "—") + " · 📍" + (r.lokacija || "—") + " · " + fmt(r.kg_neto || r.kg) + "kg"}</option>)}
                      </select>}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", padding: "8px 16px 18px" }}>
            <button onClick={onClose} style={{ border: "1.5px solid #cbd5e1", background: "#fff", color: "#334155", borderRadius: 12, padding: "13px 22px", fontWeight: 900, cursor: "pointer" }}>Otkaži</button>
            <button disabled={saving} onClick={potvrdi} style={{ border: "none", background: saving ? "#94a3b8" : "#16a34a", color: "#fff", borderRadius: 12, padding: "13px 22px", fontWeight: 900, cursor: "pointer" }}>{saving ? "Čuvam…" : "✅ Potvrdi i kreiraj (kalkulacija + ponuda + nalozi)"}</button>
          </div>
        </>}
      </div>
    </div>
  );
}
