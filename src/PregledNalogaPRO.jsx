import React, { useEffect, useMemo, useState } from "react";
import MaterialSelectorPRO, { MaterialText } from './components/MaterialSelectorPRO.jsx';
import { supabase } from "./supabase";
import NalogLayoutPRO from "./NalogLayoutPRO.jsx";
import { enrichNalogForPrint } from "./utils/nalogDataLink";

const TABOVI = [
  { tip: "materijal", naziv: "Potreba materijala", ik: "📦", boja: "#f59e0b" },
  { tip: "stampa", naziv: "Štampa", ik: "🖨️", boja: "#3b82f6" },
  { tip: "kasiranje", naziv: "Kaširanje", ik: "🔗", boja: "#1d4ed8" },
  { tip: "perforacija_rezanje", naziv: "Perforacija i rezanje", ik: "✂️", boja: "#6366f1" },
  { tip: "kesa", naziv: "Kesa", ik: "🛍️", boja: "#b91c1c" },
  { tip: "formatiranje", naziv: "Formatiranje", ik: "🎞️", boja: "#7c3aed" },
  { tip: "spulna", naziv: "Špulna", ik: "🧵", boja: "#059669" },
];

function nalogType(n) {
  const x = String(n.tip_naloga || n.vrsta || n.tipOperacije || n.operacija || n.naziv || "").toLowerCase();
  if (x.includes("mater")) return "materijal";
  if (x.includes("štamp") || x.includes("stamp")) return "stampa";
  if (x.includes("kaš") || x.includes("kas")) return "kasiranje";
  if (x.includes("rez") || x.includes("perf")) return "perforacija_rezanje";
  if (x.includes("kes")) return "kesa";
  if (x.includes("format")) return "formatiranje";
  if (x.includes("spul") || x.includes("špul")) return "spulna";
  return "materijal";
}

function productTabs(tipProizvoda) {
  const tip = String(tipProizvoda || "folija").toLowerCase();
  if (tip.includes("kes")) return ["materijal", "kasiranje", "kesa"];
  if (tip.includes("spul") || tip.includes("špul")) return ["materijal", "formatiranje", "spulna"];
  return ["materijal", "stampa", "kasiranje", "perforacija_rezanje"];
}

export default function PregledNalogaPRO({ brojNaloga, kalkulacijaId, nalozi: naloziProp = [], osnovniNalog = {}, onBack, onClose }) {
  const [nalozi, setNalozi] = useState(naloziProp);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("materijal");

  useEffect(() => {
    setNalozi((naloziProp || []).map(enrichNalogForPrint));
  }, [naloziProp]);

  useEffect(() => {
    async function load() {
      if (!brojNaloga) return;
      setLoading(true);
      try {
        const safeBroj = String(brojNaloga).replace(/[,()]/g, "");
        const { data, error } = await supabase
          .from("nalozi")
          .select("*")
          .or(`ponBr.eq.${safeBroj},broj_naloga.eq.${safeBroj},broj.eq.${safeBroj}`)
          .order("id", { ascending: true });
        if (error) throw error;
        setNalozi((data || []).map(enrichNalogForPrint));
      } catch (e) {
        console.error("Greška pri učitavanju naloga:", e);
      }
      setLoading(false);
    }
    load();
  }, [brojNaloga]);

  const tipProizvoda = nalozi[0]?.tip_proizvoda || nalozi[0]?.tip || osnovniNalog.tip_proizvoda || osnovniNalog.tip || "folija";

  const dostupni = useMemo(() => {
    const poNalogu = TABOVI.filter(t => nalozi.some(n => nalogType(n) === t.tip));
    if (poNalogu.length) return poNalogu;
    const dozvoljeni = productTabs(tipProizvoda);
    return TABOVI.filter(t => dozvoljeni.includes(t.tip));
  }, [nalozi, tipProizvoda]);

  useEffect(() => {
    if (dostupni.length && !dostupni.some(t => t.tip === tab)) setTab(dostupni[0].tip);
  }, [dostupni, tab]);

  const aktivni = {
    ...enrichNalogForPrint(nalozi.find(n => nalogType(n) === tab) || osnovniNalog),
    ponBr: brojNaloga || osnovniNalog.ponBr,
    tip_proizvoda: tipProizvoda,
    tip_naloga: tab,
    naziv: TABOVI.find(t => t.tip === tab)?.naziv || "Radni nalog",
  };

  const naslovBroj = brojNaloga || aktivni.ponBr || osnovniNalog.ponBr || "—";
  const closeFn = onBack || onClose;

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>📋 Pregled radnih naloga</h2>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            Broj: <b>{naslovBroj}</b> · Tip proizvoda: <b>{String(tipProizvoda).toUpperCase()}</b> · {nalozi.length} naloga
          </div>
        </div>
        {closeFn && (
          <button onClick={closeFn} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #2563eb", background: "#fff", color: "#1d4ed8", fontWeight: 900, cursor: "pointer" }}>
            ← Nazad
          </button>
        )}
      </div>

      {loading && <div style={{ marginBottom: 12, color: "#64748b", fontWeight: 700 }}>Učitavam naloge...</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {dostupni.map(t => (
          <button
            key={t.tip}
            onClick={() => setTab(t.tip)}
            style={{
              padding: "9px 13px",
              borderRadius: 999,
              border: tab === t.tip ? "2px solid " + t.boja : "1px solid #e2e8f0",
              background: tab === t.tip ? t.boja : "#fff",
              color: tab === t.tip ? "#fff" : "#334155",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: tab === t.tip ? "0 8px 18px rgba(15,23,42,0.12)" : "none"
            }}
          >
            {t.ik} {t.naziv}
          </button>
        ))}
      </div>

      <NalogLayoutPRO key={tab + "-" + (aktivni.id || aktivni.tip_naloga || "novi")} nalog={aktivni} activeTab={tab} />
    </div>
  );
}


// V46_MATERIAL_MASTER_EVERYWHERE: ovaj fajl je pripremljen za MaterialSelectorPRO / MaterialText.


// V47_NALOG_FULL_MATERIAL_NAME: nalozi treba da prikazuju pun naziv materijala: VRSTA + OZNAKA + DEBLJINA, npr. BOPP FXCB 20µ.
