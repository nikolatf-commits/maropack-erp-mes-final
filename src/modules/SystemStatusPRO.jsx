import React, { useMemo, useState } from "react";
import { supabase } from "../supabase.js";

const box = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, boxShadow: "0 6px 20px rgba(15,23,42,.05)" };
const badge = (ok) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: ok ? "#dcfce7" : "#fee2e2", color: ok ? "#166534" : "#991b1b" });

function detectEnv() {
  const env = import.meta.env || {};
  return {
    mode: env.MODE || "development",
    supabaseUrl: Boolean(env.VITE_SUPABASE_URL),
    supabaseAnon: Boolean(env.VITE_SUPABASE_ANON_KEY),
    gemini: Boolean(env.VITE_GEMINI_API_KEY),
    appName: env.VITE_APP_NAME || "MAROPACK ERP/MES",
  };
}

export default function SystemStatusPRO({ db }) {
  const [check, setCheck] = useState(null);
  const env = useMemo(detectEnv, []);
  const localDb = db || { nalozi: [], ponude: [], proizvodi: [], rolne: [] };

  async function testSupabase() {
    setCheck({ loading: true });
    try {
      const start = performance.now();
      const { error } = await supabase.from("master_nalozi").select("id", { count: "exact", head: true });
      const ms = Math.round(performance.now() - start);
      if (error) throw error;
      setCheck({ ok: true, ms, message: "Supabase veza radi. Tabela master_nalozi je dostupna." });
    } catch (e) {
      setCheck({ ok: false, message: e.message || "Supabase test nije prošao." });
    }
  }

  const cards = [
    ["Okruženje", env.mode, true, "Vite mode"],
    ["Supabase URL", env.supabaseUrl ? "podešen" : "nije podešen", env.supabaseUrl, "VITE_SUPABASE_URL"],
    ["Supabase anon key", env.supabaseAnon ? "podešen" : "nije podešen", env.supabaseAnon, "VITE_SUPABASE_ANON_KEY"],
    ["Gemini/AI key", env.gemini ? "podešen" : "opciono", true, "AI može raditi i lokalni fallback"],
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>🟢 System Status</h2>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Deploy, Supabase, AI i lokalni podaci — brza provera pre realnog rada.</div>
        </div>
        <button onClick={testSupabase} style={{ border: "none", background: "#2563eb", color: "white", borderRadius: 10, padding: "10px 14px", fontWeight: 800, cursor: "pointer" }}>
          Testiraj Supabase
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {cards.map(([title, value, ok, sub]) => (
          <div key={title} style={box}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800, textTransform: "uppercase" }}>{title}</div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900 }}>{value}</div>
            <div style={{ marginTop: 10 }}><span style={badge(ok)}>{ok ? "✓ OK" : "⚠ Proveriti"}</span></div>
            <div style={{ marginTop: 8, fontSize: 11, color: "#94a3b8" }}>{sub}</div>
          </div>
        ))}
      </div>

      {check && (
        <div style={{ ...box, borderColor: check.loading ? "#bfdbfe" : check.ok ? "#86efac" : "#fecaca", background: check.loading ? "#eff6ff" : check.ok ? "#f0fdf4" : "#fef2f2" }}>
          <b>{check.loading ? "Test u toku..." : check.ok ? "Supabase OK" : "Supabase greška"}</b>
          <div style={{ marginTop: 6, color: "#475569", fontSize: 13 }}>{check.message}{check.ms ? ` (${check.ms} ms)` : ""}</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <div style={box}><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Proizvodi</div><div style={{ fontSize: 28, fontWeight: 900 }}>{localDb.proizvodi?.length || 0}</div></div>
        <div style={box}><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Ponude</div><div style={{ fontSize: 28, fontWeight: 900 }}>{localDb.ponude?.length || 0}</div></div>
        <div style={box}><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Nalozi</div><div style={{ fontSize: 28, fontWeight: 900 }}>{localDb.nalozi?.length || 0}</div></div>
        <div style={box}><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Rolne</div><div style={{ fontSize: 28, fontWeight: 900 }}>{localDb.rolne?.length || 0}</div></div>
      </div>

      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Checklist pre produkcije</h3>
        <ol style={{ color: "#475569", lineHeight: 1.8, marginBottom: 0 }}>
          <li>U Supabase SQL editor ubaci migracije iz foldera <b>supabase/migrations</b>.</li>
          <li>U Vercel/Supabase podesi env vrednosti iz <b>.env.example</b>.</li>
          <li>Testiraj jedan ceo tok: kalkulacija → ponuda → master nalog → proizvodnja → QC.</li>
          <li>Uključi dnevni backup baze i export kritičnih tabela.</li>
        </ol>
      </div>
    </div>
  );
}
