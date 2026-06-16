import React, { useState, useEffect } from "react";
import { supabase } from "../supabase.js";

/* Magacioner: nalozi koji čekaju materijal -> predlog rolni -> rezervacija.
   Ne dira RolneWarehouseEngine. Piše u postojeća polja magacin.dodeljeno_nalogu / rezervisano. */

function sj(v, f) { try { return typeof v === "string" ? JSON.parse(v) : (v || f); } catch { return f; } }
function num(v) { return Number(String(v ?? 0).toString().replace(/\s/g, "").replace(",", ".")) || 0; }
function vrstaColor(v) { const x = String(v || "").toUpperCase(); if (x.includes("PET")) return "#3b82f6"; if (x.includes("ALU")) return "#9aa3af"; if (x.includes("OPA") || x.includes("CPP") || x.includes("NYLON")) return "#14b8a6"; if (x.includes("BOPP") || x.includes("PE") || x.includes("LDPE")) return "#f59e0b"; if (x.includes("PAPIR")) return "#d4a574"; return "#64748b"; }

function extractLayers(master, op) {
  const tries = [];
  const par = sj(master && master.parametri, {}) || {};
  const rez = sj(master && master.rezultati, {}) || {};
  const opar = sj(op && op.parametri, {}) || {};
  const cand = [par.folija, (par.res && par.res.template && par.res.template.folija), (rez.template && rez.template.folija), opar.folija, (master && master.order_data && sj(master.order_data, {}).folija)];
  for (const f of cand) if (f && Array.isArray(f.layers) && f.layers.length) { return f.layers; }
  // materijali niz
  const mats = par.materijali || opar.materijali || (par.res && par.res.materijali);
  if (Array.isArray(mats) && mats.length) return mats;
  return [];
}
function normLayer(m, i) {
  return {
    vrsta: m.vrsta || m.materijal || ("Sloj " + (i + 1)),
    pod_vrsta: m.pod_vrsta || m.podvrsta || m.podVrsta || "",
    oznaka: m.oznaka || m.oznaka_materijala || "",
    deb: num(m.debljina ?? m.deb),
    kg: num(m.kg ?? m.potrebnoKg),
    m: num(m.potrebno ?? m.metraza ?? m.m),
    c: vrstaColor(m.vrsta),
  };
}

export default function MaterijalZaNaloge({ operater, onBack, msg }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(null);   // {op, master, layers}
  const [rolls, setRolls] = useState({});    // layerIndex -> [magacin rows]
  const [sel, setSel] = useState({});        // layerIndex -> [magacinId,...]
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function load() {
    setLoading(true);
    try {
      const { data: ops } = await supabase.from("operativni_nalozi").select("*").eq("tip_naloga", "materijal").in("status", ["ceka", "ceka_magacin", "Ceka", "čeka"]).order("redosled", { ascending: true }).limit(60);
      const list = ops || [];
      const masterIds = [...new Set(list.map((o) => o.glavni_nalog_id).filter(Boolean))];
      let masters = [];
      if (masterIds.length) { const { data: ms } = await supabase.from("radni_nalozi").select("*").in("id", masterIds); masters = ms || []; }
      const byId = {}; masters.forEach((m) => { byId[m.id] = m; });
      setItems(list.map((o) => ({ op: o, master: byId[o.glavni_nalog_id] || {} })));
    } catch (e) { msg && msg("Greška pri učitavanju: " + (e.message || e), "err"); }
    finally { setLoading(false); }
  }

  async function openNalog(it) {
    const layersRaw = extractLayers(it.master, it.op);
    const layers = (layersRaw.length ? layersRaw : []).map(normLayer);
    setOpen({ ...it, layers });
    setSel({}); setRolls({});
    // predlog rolni po sloju
    const rmap = {};
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      let q = supabase.from("magacin").select("*").eq("status", "Na stanju").or("dodeljeno_nalogu.is.null,dodeljeno_nalogu.eq.").limit(12);
      if (l.vrsta) q = q.ilike("vrsta", "%" + l.vrsta + "%");
      const { data } = await q;
      let rows = data || [];
      if (l.oznaka) { const ex = rows.filter((r) => String(r.oznaka_materijala || "").toUpperCase().includes(String(l.oznaka).toUpperCase())); if (ex.length) rows = ex; }
      rmap[i] = rows.slice(0, 8);
    }
    setRolls(rmap);
  }

  function toggle(i, id) {
    setSel((prev) => { const a = (prev[i] || []).slice(); const k = a.indexOf(id); if (k >= 0) a.splice(k, 1); else a.push(id); return { ...prev, [i]: a }; });
  }

  async function rezervisi() {
    if (!open) return;
    const masterBroj = open.master.broj_naloga || open.op.broj_naloga || "";
    const ids = Object.values(sel).flat();
    if (!ids.length) { msg && msg("Izaberi bar jednu rolnu.", "err"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("magacin").update({ dodeljeno_nalogu: masterBroj, rezervisano: true, rezervisao: operater?.ime || operater || "magacioner" }).in("id", ids);
      if (error) throw error;
      await supabase.from("operativni_nalozi").update({ status: "spremljeno" }).eq("id", open.op.id);
      msg && msg(ids.length + " rolni rezervisano za " + masterBroj, "ok");
      setOpen(null); setSel({}); setRolls({}); load();
    } catch (e) { msg && msg("Greška: " + (e.message || e), "err"); }
    finally { setSaving(false); }
  }

  /* ---------- UI ---------- */
  const wrap = { minHeight: "100vh", background: "#f1f5f9", padding: 12, color: "#0f172a", fontFamily: "Inter,system-ui,Arial,sans-serif" };
  const card = { background: "#fff", borderRadius: 14, padding: 14, marginBottom: 11, boxShadow: "0 2px 8px rgba(0,0,0,.07)" };
  const btn = { width: "100%", border: "none", borderRadius: 13, padding: 15, fontSize: 16, fontWeight: 900, cursor: "pointer" };
  const pill = (bg, c) => ({ fontSize: 11, fontWeight: 800, borderRadius: 7, padding: "3px 9px", background: bg, color: c });
  const fmt = (n) => Number(n || 0).toLocaleString("sr-RS");

  function Header({ title, sub }) {
    return (
      <div style={{ background: "#0f766e", color: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={open ? () => setOpen(null) : onBack} style={{ background: "rgba(255,255,255,.18)", border: "none", color: "#fff", borderRadius: 9, padding: "6px 10px", fontWeight: 900, cursor: "pointer" }}>‹</button>
          <div><div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div><div style={{ fontSize: 12, opacity: .85 }}>{sub}</div></div>
        </div>
      </div>
    );
  }

  if (open) {
    const totalSel = Object.values(sel).flat().length;
    const allCovered = open.layers.length > 0 && open.layers.every((_, i) => (sel[i] || []).length > 0);
    return (
      <div style={wrap}>
        <Header title={open.master.broj_naloga || open.op.broj_naloga || "Nalog"} sub={(open.master.kupac || "—") + " · " + (open.master.proizvod || open.master.naziv || "")} />
        {open.layers.length === 0 && <div style={card}>Nema podataka o slojevima u templejtu ovog naloga.</div>}
        {open.layers.map((l, i) => {
          const rs = rolls[i] || [];
          const s = sel[i] || [];
          return (
            <div key={i} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 13, height: 13, borderRadius: "50%", background: l.c }} />
                <div><div style={{ fontWeight: 900, fontSize: 14 }}>{(i + 1) + ". " + l.vrsta + (l.oznaka ? " · " + l.oznaka : "")}</div><div style={{ fontSize: 12, color: "#64748b" }}>{(l.pod_vrsta || "—") + (l.deb ? " · " + l.deb + " µm" : "")}</div></div>
                <div style={{ marginLeft: "auto", textAlign: "right", fontWeight: 900, fontSize: 13 }}>{l.kg ? fmt(l.kg) + " kg" : ""}<div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>{l.m ? fmt(l.m) + " m" : ""}</div></div>
              </div>
              {rs.length === 0 && <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 8 }}>Nema slobodnih rolni za ovaj sloj u magacinu.</div>}
              {rs.map((r) => {
                const on = s.includes(r.id);
                return (
                  <div key={r.id} onClick={() => toggle(i, r.id)} style={{ display: "flex", alignItems: "center", gap: 9, border: "1.5px solid " + (on ? "#0f766e" : "#e2e8f0"), background: on ? "#f0fdfa" : "#fff", borderRadius: 10, padding: "9px 11px", marginTop: 8, cursor: "pointer" }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, border: "2px solid " + (on ? "#0f766e" : "#cbd5e1"), background: on ? "#0f766e" : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{on ? "✓" : ""}</div>
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 900, fontSize: 13 }}>{r.br_rolne || r.qr_code}</div><div style={{ fontSize: 11, color: "#64748b" }}>📍 {r.lokacija || "—"} · š {r.sirina || "—"} mm</div></div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#0f766e" }}>{fmt(r.kg_neto || r.kg)} kg</div>
                  </div>
                );
              })}
            </div>
          );
        })}
        <div style={{ position: "sticky", bottom: 0, paddingTop: 8 }}>
          <button disabled={!allCovered || saving} onClick={rezervisi} style={{ ...btn, background: allCovered && !saving ? "#0f766e" : "#cbd5e1", color: "#fff" }}>{saving ? "Čuvam..." : "✅ Rezerviši i spremi (" + totalSel + " rolni)"}</button>
          <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 7 }}>{allCovered ? "Rolne se vežu za nalog (ostaju na stanju, rezervisane)" : "Izaberi bar jednu rolnu za svaki sloj"}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <Header title="📋 Materijal za naloge" sub={"Magacioner: " + (operater?.ime || operater || "—") + " · čeka pripremu"} />
      {loading && <div style={card}>Učitavam…</div>}
      {!loading && items.length === 0 && <div style={card}>Nema naloga koji čekaju materijal. 🎉</div>}
      {!loading && items.map((it, idx) => {
        const m = it.master, layers = extractLayers(it.master, it.op).map(normLayer);
        return (
          <div key={idx} onClick={() => openNalog(it)} style={{ ...card, borderLeft: "5px solid #f59e0b", cursor: "pointer" }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#0f766e" }}>{m.broj_naloga || it.op.broj_naloga || "—"}</div>
            <div style={{ fontSize: 16, fontWeight: 900, marginTop: 2 }}>{m.kupac || "—"}</div>
            <div style={{ fontSize: 13, color: "#475569" }}>{m.proizvod || m.naziv || ""}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
              <span style={pill("#fef3c7", "#a16207")}>⏳ Čeka materijal</span>
              {layers.length ? <span style={pill("#eef2ff", "#4338ca")}>{layers.length} sloja</span> : null}
            </div>
            {layers.length ? <div style={{ display: "flex", gap: 5, marginTop: 9 }}>{layers.map((l, i) => <div key={i} style={{ height: 7, borderRadius: 3, flex: 1, background: l.c }} />)}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
