import React from "react";

function getPodaci(nalog = {}) {
  const p = nalog.podaci || nalog.parametri || nalog;
  return {
    tipKese: p.tip_kese || p.tipKese || p.vrsta_kese || "Ravna kesa",
    A: Number(p.visina || p.duzina || p.A || 300),
    B: Number(p.sirina || p.B || 200),
    C: Number(p.klapna || p.C || 40),
    D: Number(p.dno || p.D || 35),
    eurozumba: truthy(p.eurozumba),
    duplofan: truthy(p.duplofan),
    anleger: truthy(p.anleger),
    perforacija: truthy(p.perforacija || p.perfOtkinuti || p.poprecnaPerf),
    kosaKlapna: truthy(p.ukosenaKlapna || p.kosa_klapna),
    pakovanje: p.pakovanje || p.pakovati || "po nalogu",
    napomena: p.napomena || p.nap || "—"
  };
}

function truthy(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = String(v).toLowerCase();
  return s.includes("da") || s.includes("ima") || (!s.includes("ne") && !s.includes("nema") && s !== "");
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #e5e7eb", padding: "10px 0", fontSize: 13 }}>
      <b style={{ color: "#334155" }}>{label}</b>
      <span style={{ color: "#0f172a", fontWeight: 800, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default function PrikazKesePRO({ nalog = {} }) {
  const d = getPodaci(nalog);
  const naziv = nalog.prod || nalog.proizvod || nalog.naziv || "Kesa";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(520px, 1.4fr) minmax(300px, 0.75fr)", gap: 18, alignItems: "start" }}>
      <div style={{ background: "#fff", border: "1px solid #dbe3ef", borderRadius: 18, padding: 18, boxShadow: "0 10px 26px rgba(15,23,42,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 950, color: "#0f172a" }}>📐 PRO tehnički prikaz kese</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{naziv} · {d.tipKese}</div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#7c2d12", background: "#ffedd5", border: "1px solid #fed7aa", borderRadius: 999, padding: "6px 10px" }}>
            TEHNIČKI CRTEŽ
          </div>
        </div>

        <svg viewBox="0 0 780 640" style={{ width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16 }}>
          <defs>
            <marker id="arrowBag" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
              <path d="M0,0 L10,5 L0,10 Z" fill="#0f172a" />
            </marker>
            <pattern id="diag" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="8" stroke="#cbd5e1" strokeWidth="2" />
            </pattern>
          </defs>

          <text x="28" y="36" fontSize="18" fontWeight="900" fill="#0f172a">MAROPACK d.o.o. — tehnički crtež kese</text>
          <text x="28" y="58" fontSize="12" fontWeight="700" fill="#64748b">Proizvod: {naziv}</text>

          {/* glavna kesa */}
          <rect x="230" y="140" width="300" height="340" rx="8" fill="#ffffff" stroke="#0f172a" strokeWidth="3" />
          <rect x="230" y="140" width="300" height="340" rx="8" fill="url(#diag)" opacity="0.18" />

          {/* klapna */}
          {d.kosaKlapna ? (
            <path d="M230 95 L530 118 L530 140 L230 140 Z" fill="#e0f2fe" stroke="#0f172a" strokeWidth="2" />
          ) : (
            <rect x="230" y="95" width="300" height="45" rx="3" fill="#e0f2fe" stroke="#0f172a" strokeWidth="2" />
          )}
          <text x="380" y="123" textAnchor="middle" fontSize="14" fontWeight="900" fill="#075985">KLAPNA C = {d.C} mm</text>

          {/* dno */}
          <path d="M230 480 L530 480 L492 545 L268 545 Z" fill="#fef3c7" stroke="#0f172a" strokeWidth="2" />
          <line x1="268" y1="545" x2="492" y2="545" stroke="#0f172a" strokeWidth="2" />
          <text x="380" y="520" textAnchor="middle" fontSize="14" fontWeight="900" fill="#92400e">DNO D = {d.D} mm</text>

          {/* opcije */}
          {d.eurozumba && (
            <>
              <ellipse cx="380" cy="116" rx="42" ry="13" fill="none" stroke="#dc2626" strokeWidth="3" />
              <text x="380" y="82" textAnchor="middle" fontSize="13" fill="#dc2626" fontWeight="950">EUROZUMBA</text>
            </>
          )}

          {d.duplofan && (
            <>
              <rect x="258" y="160" width="244" height="13" rx="3" fill="#22c55e" opacity="0.8" />
              <text x="380" y="190" textAnchor="middle" fontSize="13" fill="#166534" fontWeight="950">DUPLOFAN</text>
            </>
          )}

          {d.anleger && (
            <>
              <rect x="205" y="215" width="24" height="170" rx="4" fill="#6366f1" opacity="0.9" />
              <text x="190" y="310" fontSize="13" fill="#3730a3" fontWeight="950" transform="rotate(-90 190,310)">ANLEGER</text>
            </>
          )}

          {d.perforacija && (
            <>
              <line x1="230" y1="430" x2="530" y2="430" stroke="#ef4444" strokeWidth="2.5" strokeDasharray="12 9" />
              <text x="380" y="420" textAnchor="middle" fontSize="13" fill="#ef4444" fontWeight="950">PERFORACIJA</text>
            </>
          )}

          {/* dimenzije A */}
          <line x1="585" y1="140" x2="585" y2="480" stroke="#0f172a" strokeWidth="2" markerStart="url(#arrowBag)" markerEnd="url(#arrowBag)" />
          <line x1="542" y1="140" x2="610" y2="140" stroke="#94a3b8" strokeWidth="1.5" />
          <line x1="542" y1="480" x2="610" y2="480" stroke="#94a3b8" strokeWidth="1.5" />
          <text x="610" y="315" fontSize="18" fontWeight="950" fill="#0f172a">A = {d.A} mm</text>

          {/* dimenzije B */}
          <line x1="230" y1="590" x2="530" y2="590" stroke="#0f172a" strokeWidth="2" markerStart="url(#arrowBag)" markerEnd="url(#arrowBag)" />
          <line x1="230" y1="555" x2="230" y2="606" stroke="#94a3b8" strokeWidth="1.5" />
          <line x1="530" y1="555" x2="530" y2="606" stroke="#94a3b8" strokeWidth="1.5" />
          <text x="380" y="620" textAnchor="middle" fontSize="18" fontWeight="950" fill="#0f172a">B = {d.B} mm</text>
        </svg>
      </div>

      <div style={{ background: "#fff", border: "1px solid #dbe3ef", borderRadius: 18, padding: 18, boxShadow: "0 10px 26px rgba(15,23,42,0.06)" }}>
        <div style={{ fontSize: 18, fontWeight: 950, marginBottom: 12, color: "#0f172a" }}>📋 Dimenzije i opcije</div>
        <Row label="Tip kese" value={d.tipKese} />
        <Row label="A — visina" value={`${d.A} mm`} />
        <Row label="B — širina" value={`${d.B} mm`} />
        <Row label="C — klapna" value={`${d.C} mm`} />
        <Row label="D — dno" value={`${d.D} mm`} />
        <Row label="Eurozumba" value={d.eurozumba ? "DA" : "NE"} />
        <Row label="Duplofan" value={d.duplofan ? "DA" : "NE"} />
        <Row label="Anleger" value={d.anleger ? "DA" : "NE"} />
        <Row label="Perforacija" value={d.perforacija ? "DA" : "NE"} />
        <Row label="Pakovanje" value={d.pakovanje} />
        <Row label="Napomena" value={d.napomena} />
        <button onClick={() => window.print()} style={{ marginTop: 16, width: "100%", border: "none", borderRadius: 12, padding: "12px 14px", background: "#1d4ed8", color: "#fff", fontWeight: 900, cursor: "pointer" }}>
          🖨️ Štampaj / PDF prikaz
        </button>
      </div>
    </div>
  );
}
