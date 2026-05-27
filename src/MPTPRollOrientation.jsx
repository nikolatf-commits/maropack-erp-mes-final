import React, { useMemo, useState } from "react";

const BLUE = "#2446b8";
const GREEN = "#059669";
const ORANGE = "#f59e0b";
const RED = "#dc2626";
const PURPLE = "#7c3aed";
const SLATE = "#334155";

function val(v, fallback = "—") {
  return v === undefined || v === null || v === "" ? fallback : v;
}

function n(v) {
  return Number(String(v ?? "").replace("mm", "").replace("m", "").replace(",", ".").trim()) || 0;
}

function mediaUrl(kpdf = {}) {
  return kpdf.mptpFileUrl || kpdf.mptpImageUrl || kpdf.mptpPdfUrl || kpdf.kpdfPdfUrl || kpdf.pdfUrl || kpdf.pdfPerfUrl || kpdf.previewUrl || "";
}

function mediaName(kpdf = {}) {
  return kpdf.mptpFileName || kpdf.mptpImageName || kpdf.mptpPdfName || kpdf.kpdfPdfName || kpdf.pdfName || kpdf.pdfPerf || kpdf.kpdfDizajn || "MPTP / KPDF prikaz";
}

function mediaType(kpdf = {}) {
  const t = String(kpdf.mptpFileType || kpdf.mptpImageType || kpdf.mptpPdfType || "").toLowerCase();
  const name = mediaName(kpdf).toLowerCase();
  if (t.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(name)) return "image";
  if (t.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  const url = String(mediaUrl(kpdf)).toLowerCase();
  if (url.startsWith("data:image/") || /\.(jpg|jpeg|png|webp|gif|bmp)(\?|$)/i.test(url)) return "image";
  return "pdf";
}

function normalizedRotation(rotation) {
  return ((Number(rotation) % 360) + 360) % 360;
}

function Card({ children, style }) {
  return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 14, ...style }}>{children}</div>;
}

function MiniLabel({ label, value, color = BLUE }) {
  return <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px" }}>
    <div style={{ fontSize: 9, color: "#64748b", fontWeight: 900, textTransform: "uppercase", letterSpacing: .4 }}>{label}</div>
    <div style={{ fontSize: 12, color, fontWeight: 950, marginTop: 2, wordBreak: "break-word" }}>{val(value)}</div>
  </div>;
}

function RotationButtons({ rotation, onChange }) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {[0, 90, 180, 270].map(deg => (
      <button key={deg} type="button" onClick={() => onChange(deg)} style={{
        border: `1px solid ${Number(rotation) === deg ? ORANGE : "#cbd5e1"}`,
        background: Number(rotation) === deg ? "#fff7ed" : "#fff",
        color: Number(rotation) === deg ? "#9a3412" : "#334155",
        borderRadius: 9,
        padding: "7px 11px",
        fontWeight: 950,
        cursor: "pointer"
      }}>{deg === 90 ? "↻ 90°" : deg === 270 ? "↺ 270°" : `${deg}°`}</button>
    ))}
  </div>;
}

function MediaPreview({ kpdf = {}, rotation = 0, height = 310, emptyText = "KPDF/MPTP nije dodat", fit = "contain" }) {
  const url = mediaUrl(kpdf);
  const name = mediaName(kpdf);
  const type = mediaType(kpdf);
  const rot = normalizedRotation(rotation);
  if (!url) {
    return <div style={{ height, display: "grid", placeItems: "center", border: "2px dashed #fed7aa", borderRadius: 14, background: "#fff7ed", color: "#9a3412", fontWeight: 900, textAlign: "center", padding: 18 }}>
      <div><div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>{emptyText}<div style={{ fontSize: 11, marginTop: 8, opacity: .8 }}>Podržano: PDF, JPG, JPEG, PNG, WEBP</div></div>
    </div>;
  }

  const rotatedIsSide = rot === 90 || rot === 270;
  const scale = type === "pdf" && rotatedIsSide ? .72 : .94;
  return <div style={{ height, overflow: "hidden", border: "1px solid #e2e8f0", borderRadius: 14, background: "#f8fafc", position: "relative" }}>
    <div style={{ position: "absolute", top: 8, left: 10, zIndex: 3, background: "rgba(255,255,255,.96)", border: "1px solid #e2e8f0", borderRadius: 999, padding: "4px 9px", fontSize: 10, fontWeight: 950, color: "#334155", maxWidth: "75%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box" }}>
      {type === "image" ? (
        <img alt="KPDF/MPTP prikaz" src={url} style={{
          maxWidth: rotatedIsSide ? height - 40 : "100%",
          maxHeight: rotatedIsSide ? "100%" : height - 40,
          width: fit === "cover" ? "100%" : "auto",
          height: fit === "cover" ? "100%" : "auto",
          objectFit: fit,
          borderRadius: 10,
          background: "#fff",
          boxShadow: "0 8px 18px rgba(15,23,42,.10)",
          transform: `rotate(${rot}deg) scale(${scale})`,
          transformOrigin: "center"
        }} />
      ) : (
        <iframe title="MPTP KPDF preview" src={url} style={{
          width: rotatedIsSide ? height - 36 : "100%",
          height: rotatedIsSide ? "100%" : height - 28,
          border: 0,
          background: "#fff",
          borderRadius: 10,
          transform: `rotate(${rot}deg) scale(${scale})`,
          transformOrigin: "center",
          boxShadow: "0 8px 18px rgba(15,23,42,.10)"
        }} />
      )}
    </div>
    <div style={{ position: "absolute", right: 10, bottom: 8, background: "#111827", color: "#fff", borderRadius: 999, padding: "4px 9px", fontSize: 10, fontWeight: 950 }}>{rot}° za rezanje</div>
    <div style={{ position: "absolute", left: 10, bottom: 8, background: type === "image" ? "#ecfdf5" : "#eff6ff", color: type === "image" ? "#047857" : BLUE, border: "1px solid #dbeafe", borderRadius: 999, padding: "4px 9px", fontSize: 10, fontWeight: 950 }}>{type.toUpperCase()}</div>
  </div>;
}

function RollDirectionChooser({ value, onChange }) {
  const options = [
    ["right", "→ Desno"],
    ["left", "← Levo"],
    ["up", "↑ Gore"],
    ["down", "↓ Dole"]
  ];
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
    {options.map(([key, label]) => <button key={key} type="button" onClick={() => onChange(key)} style={{
      border: `1px solid ${value === key ? BLUE : "#cbd5e1"}`,
      background: value === key ? "#eff6ff" : "#fff",
      color: value === key ? BLUE : SLATE,
      borderRadius: 9,
      padding: "7px 6px",
      fontSize: 11,
      fontWeight: 950,
      cursor: "pointer"
    }}>{label}</button>)}
  </div>;
}

function directionArrow(direction) {
  if (direction === "left") return "←";
  if (direction === "up") return "↑";
  if (direction === "down") return "↓";
  return "→";
}

function RollSvg({ folija = {}, kpdf = {}, rezanje = {}, compact = false }) {
  const finalRoll = folija.finalRoll || {};
  const stampa = folija.stampa || {};
  const r = { ...(folija.rezanje || {}), ...rezanje };
  const sirina = n(r.sirinaMaterijala || folija.idealnaSirinaMaterijala || 840);
  const trake = String(r.sirineTraka || "").split(",").map(x => n(x)).filter(Boolean);
  const brojTraka = trake.length || n(r.brojTraka || kpdf.upCount || 2) || 2;
  const repeat = kpdf.repeatLength || kpdf.repeat || kpdf.rapport || stampa.rapport || stampa.rapportCilindar || "repeat";
  const unwind = kpdf.unwindDirection || finalRoll.smerOdmotavanja || stampa.smerOdmotavanja || r.smerGP || "desno";
  const visualDirection = kpdf.visualUnwind || "right";
  const printSide = kpdf.printSide || finalRoll.stampaStrana || stampa.strana || "Spolja";
  const rollDirection = kpdf.rollDirection || kpdf.namotaj || "outside";
  const image = mediaType(kpdf) === "image" ? mediaUrl(kpdf) : "";
  const rot = normalizedRotation(kpdf.mptpRotation ?? kpdf.rotationRezanje ?? 0);

  const w = compact ? 420 : 620;
  const h = compact ? 250 : 360;
  const filmX = compact ? 142 : 190;
  const filmY = compact ? 62 : 82;
  const filmW = compact ? 238 : 374;
  const filmH = compact ? 122 : 184;
  const colW = filmW / Math.max(1, brojTraka);

  const arrow = directionArrow(visualDirection);
  const arrowLine = visualDirection === "left"
    ? { x1: filmX + filmW - 8, y1: filmY - 22, x2: filmX + 8, y2: filmY - 22 }
    : visualDirection === "up"
      ? { x1: filmX + filmW + 22, y1: filmY + filmH - 8, x2: filmX + filmW + 22, y2: filmY + 8 }
      : visualDirection === "down"
        ? { x1: filmX + filmW + 22, y1: filmY + 8, x2: filmX + filmW + 22, y2: filmY + filmH - 8 }
        : { x1: filmX + 8, y1: filmY - 22, x2: filmX + filmW - 8, y2: filmY - 22 };

  return <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", background: "#f8fafc", borderRadius: 14 }}>
    <defs>
      <linearGradient id="mptpRollGrad" x1="0" x2="1"><stop offset="0" stopColor="#e2e8f0"/><stop offset="1" stopColor="#f8fafc"/></linearGradient>
      <marker id="mptpArrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill={BLUE}/></marker>
      <pattern id="mptpHatch" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8 L8 0" stroke="#bfdbfe" strokeWidth="1"/></pattern>
      <clipPath id="mptpFilmClip"><rect x={filmX + 6} y={filmY + 6} width={filmW - 12} height={filmH - 12} rx="8" /></clipPath>
    </defs>

    <text x="14" y="22" fontSize="12" fontWeight="950" fill="#0f172a">REALAN PRIKAZ ODMOTAVANJA ROLNE ZA REZANJE</text>
    <text x="14" y="40" fontSize="10" fontWeight="800" fill="#64748b">JPEG/PNG/PDF motiv se rotira samo za rezanje · nalog za štampu ostaje original</text>

    <g transform={`translate(${compact ? 24 : 34} ${compact ? 68 : 92})`}>
      <ellipse cx="48" cy="68" rx="40" ry="60" fill="url(#mptpRollGrad)" stroke="#94a3b8" strokeWidth="2" />
      <ellipse cx="48" cy="68" rx="18" ry="26" fill="#fff" stroke="#64748b" strokeWidth="2" />
      <ellipse cx="48" cy="68" rx="7" ry="11" fill="#e2e8f0" stroke="#64748b" />
      <path d={rollDirection === "inside" ? "M58 18 Q94 46 70 94" : "M42 18 Q12 46 28 94"} fill="none" stroke={ORANGE} strokeWidth="3" markerEnd="url(#mptpArrow)" />
      <text x="48" y="142" textAnchor="middle" fontSize="10" fontWeight="900" fill="#334155">{rollDirection === "inside" ? "INSIDE" : "OUTSIDE"}</text>
    </g>

    <path d={`M${compact ? 104 : 130} ${filmY + filmH/2} C${filmX - 44} ${filmY + filmH/2} ${filmX - 34} ${filmY} ${filmX} ${filmY}`} fill="none" stroke="#cbd5e1" strokeWidth="10" opacity=".8" />
    <rect x={filmX} y={filmY} width={filmW} height={filmH} rx="12" fill="#fff" stroke={BLUE} strokeWidth="2" />
    <rect x={filmX + 6} y={filmY + 6} width={filmW - 12} height={filmH - 12} rx="8" fill="url(#mptpHatch)" opacity=".50" />

    {image ? (
      <g clipPath="url(#mptpFilmClip)">
        <image href={image} x={filmX + 8} y={filmY + 10} width={filmW - 16} height={filmH - 20} preserveAspectRatio="xMidYMid slice" transform={`rotate(${rot} ${filmX + filmW/2} ${filmY + filmH/2})`} opacity=".88" />
        <rect x={filmX + 6} y={filmY + 6} width={filmW - 12} height={filmH - 12} fill="none" stroke="#0f172a" strokeOpacity=".08" />
      </g>
    ) : null}

    {Array.from({ length: Math.max(1, brojTraka) }).map((_, i) => <g key={i}>
      {i > 0 && <line x1={filmX + i * colW} y1={filmY} x2={filmX + i * colW} y2={filmY + filmH} stroke={RED} strokeWidth="2.2" strokeDasharray="7 5" />}
      {!image && <>
        <rect x={filmX + i * colW + 9} y={filmY + 22} width={Math.max(28, colW - 18)} height={42} rx="7" fill="#dbeafe" stroke="#93c5fd" />
        <rect x={filmX + i * colW + 9} y={filmY + 84} width={Math.max(28, colW - 18)} height={42} rx="7" fill="#ede9fe" stroke="#c4b5fd" />
        <text x={filmX + i * colW + colW/2} y={filmY + 48} textAnchor="middle" fontSize="9" fontWeight="950" fill={BLUE}>MOTIV</text>
        <text x={filmX + i * colW + colW/2} y={filmY + 110} textAnchor="middle" fontSize="9" fontWeight="950" fill={PURPLE}>MOTIV</text>
      </>}
      <text x={filmX + i * colW + colW/2} y={filmY + filmH - 10} textAnchor="middle" fontSize="9" fontWeight="900" fill="#0f172a" paintOrder="stroke" stroke="#fff" strokeWidth="3">TRAKA {i+1}</text>
    </g>)}

    <line {...arrowLine} stroke={BLUE} strokeWidth="2.5" markerEnd="url(#mptpArrow)" />
    <text x={filmX + filmW/2} y={filmY - 31} textAnchor="middle" fontSize="10" fontWeight="950" fill={BLUE}>SMER ODMOTAVANJA {arrow} {unwind}</text>
    <line x1={filmX + filmW + 34} y1={filmY + filmH - 12} x2={filmX + filmW + 34} y2={filmY + 18} stroke={ORANGE} strokeWidth="2.2" markerEnd="url(#mptpArrow)" />
    <text x={filmX + filmW + 50} y={filmY + filmH/2} fontSize="10" fontWeight="950" fill="#9a3412" transform={`rotate(90 ${filmX + filmW + 50} ${filmY + filmH/2})`}>SMER ŠTAMPE</text>

    <g transform={`translate(14 ${h - 62})`}>
      <rect width={w - 28} height="48" rx="12" fill="#fff" stroke="#e2e8f0" />
      <text x="12" y="18" fontSize="9" fontWeight="950" fill="#64748b">Širina: {sirina || "—"} mm</text>
      <text x="12" y="36" fontSize="9" fontWeight="950" fill="#64748b">UP/trake: {brojTraka}</text>
      <text x="132" y="18" fontSize="9" fontWeight="950" fill="#64748b">Repeat: {repeat}</text>
      <text x="132" y="36" fontSize="9" fontWeight="950" fill="#64748b">Strana štampe: {printSide}</text>
      <text x="304" y="18" fontSize="9" fontWeight="950" fill="#64748b">Rotacija: {rot}°</text>
      <text x="304" y="36" fontSize="9" fontWeight="950" fill="#64748b">Fajl: {mediaType(kpdf).toUpperCase()}</text>
    </g>
  </svg>;
}

export function TemplateMptpPanel({ folija = {}, onPatch }) {
  const kpdf = folija.kpdf || {};
  const rotation = Number(kpdf.mptpRotation ?? kpdf.rotationRezanje ?? 0) || 0;
  const [loading, setLoading] = useState(false);
  const patch = (obj) => onPatch && onPatch(obj);

  function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const isImg = (file.type || "").startsWith("image/");
      patch({
        enabled: true,
        mptpFileUrl: dataUrl,
        mptpFileName: file.name,
        mptpFileType: file.type || (isImg ? "image/jpeg" : "application/pdf"),
        mptpPdfUrl: isImg ? "" : dataUrl,
        mptpPdfName: isImg ? "" : file.name,
        mptpPdfType: isImg ? "" : file.type,
        mptpImageUrl: isImg ? dataUrl : "",
        mptpImageName: isImg ? file.name : "",
        mptpImageType: isImg ? file.type : "",
        mptpUploadedAt: new Date().toISOString()
      });
      setLoading(false);
      e.target.value = "";
    };
    reader.onerror = () => setLoading(false);
    reader.readAsDataURL(file);
  }

  const fileExists = !!mediaUrl(kpdf);
  return <div style={{ marginTop: 14, border: "1px solid #fed7aa", borderRadius: 16, overflow: "hidden", background: "#fff7ed" }}>
    <div style={{ padding: "12px 14px", borderBottom: "1px solid #fed7aa", display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
      <div>
        <div style={{ color: "#9a3412", fontWeight: 950, fontSize: 14 }}>🖼️ KPDF / MPTP — prikaz motiva na rolni za rezanje</div>
        <div style={{ color: "#9a3412", fontWeight: 750, fontSize: 11, marginTop: 2 }}>Učitaj PDF ili JPG/JPEG/PNG. Rotacija važi samo za nalog za rezanje.</div>
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid #fdba74", background: "#fff", color: "#9a3412", borderRadius: 10, padding: "9px 12px", fontWeight: 950, cursor: "pointer" }}>
        {loading ? "Učitavam..." : "📂 Učitaj PDF/JPEG/PNG"}
        <input type="file" accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp" onChange={handleUpload} style={{ display: "none" }} />
      </label>
    </div>

    <div style={{ padding: 14, display: "grid", gridTemplateColumns: "minmax(310px, .95fr) minmax(360px, 1.25fr)", gap: 14 }}>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10, marginBottom: 12 }}>
          <MiniLabel label="Fajl" value={fileExists ? mediaName(kpdf) : "nije dodat"} color={ORANGE} />
          <MiniLabel label="Tip" value={fileExists ? mediaType(kpdf).toUpperCase() : "—"} color={GREEN} />
          <MiniLabel label="Rotacija za rezanje" value={`${rotation}°`} color={ORANGE} />
          <MiniLabel label="Smer" value={`${directionArrow(kpdf.visualUnwind || "right")} ${kpdf.unwindDirection || folija.finalRoll?.smerOdmotavanja || "desno"}`} color={BLUE} />
        </div>

        <label style={{ fontSize: 11, fontWeight: 900, color: "#475569", display: "block", marginBottom: 10 }}>Opis smera odmotavanja
          <input value={kpdf.unwindDirection || folija.finalRoll?.smerOdmotavanja || folija.stampa?.smerOdmotavanja || ""} onChange={e => patch({ unwindDirection: e.target.value })} placeholder="npr. odmotava se ka desno / ka mašini" style={{ width: "100%", marginTop: 5, border: "1px solid #cbd5e1", borderRadius: 9, padding: 8, fontWeight: 800, boxSizing: "border-box" }} />
        </label>

        <div style={{ fontSize: 11, fontWeight: 900, color: "#475569", marginBottom: 10 }}>Vizuelni smer odmotavanja
          <div style={{ marginTop: 5 }}><RollDirectionChooser value={kpdf.visualUnwind || "right"} onChange={(v) => patch({ visualUnwind: v })} /></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10, marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 900, color: "#475569" }}>Repeat / raport
            <input value={kpdf.repeatLength || ""} onChange={e => patch({ repeatLength: e.target.value })} placeholder="npr. 180 mm" style={{ width: "100%", marginTop: 5, border: "1px solid #cbd5e1", borderRadius: 9, padding: 8, fontWeight: 800, boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 900, color: "#475569" }}>UP / broj motiva
            <input value={kpdf.upCount || ""} onChange={e => patch({ upCount: e.target.value })} placeholder="npr. 2" style={{ width: "100%", marginTop: 5, border: "1px solid #cbd5e1", borderRadius: 9, padding: 8, fontWeight: 800, boxSizing: "border-box" }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 900, color: "#475569" }}>Inside / Outside
            <select value={kpdf.rollDirection || "outside"} onChange={e => patch({ rollDirection: e.target.value })} style={{ width: "100%", marginTop: 5, border: "1px solid #cbd5e1", borderRadius: 9, padding: 8, fontWeight: 800, background: "#fff", boxSizing: "border-box" }}>
              <option value="outside">Outside wound</option>
              <option value="inside">Inside wound</option>
            </select>
          </label>
          <label style={{ fontSize: 11, fontWeight: 900, color: "#475569" }}>Strana štampe
            <select value={kpdf.printSide || "Spolja"} onChange={e => patch({ printSide: e.target.value })} style={{ width: "100%", marginTop: 5, border: "1px solid #cbd5e1", borderRadius: 9, padding: 8, fontWeight: 800, background: "#fff", boxSizing: "border-box" }}>
              <option>Spolja</option>
              <option>Unutra</option>
              <option>Reverse print</option>
            </select>
          </label>
        </div>

        <div style={{ marginBottom: 10, fontSize: 11, color: "#9a3412", fontWeight: 950 }}>Rotacija motiva za realan prikaz na rolni:</div>
        <RotationButtons rotation={rotation} onChange={deg => patch({ mptpRotation: deg, rotationRezanje: deg })} />
        {fileExists && <button type="button" onClick={() => patch({ mptpFileUrl: "", mptpFileName: "", mptpFileType: "", mptpPdfUrl: "", mptpPdfName: "", mptpPdfType: "", mptpImageUrl: "", mptpImageName: "", mptpImageType: "" })} style={{ marginTop: 10, border: "1px solid #fecaca", background: "#fff", color: RED, borderRadius: 9, padding: "7px 10px", fontWeight: 900, cursor: "pointer" }}>× Ukloni fajl</button>}
      </Card>
      <Card>
        <RollSvg folija={folija} kpdf={kpdf} compact />
      </Card>
    </div>
    <div style={{ padding: "0 14px 14px" }}>
      <MediaPreview kpdf={kpdf} rotation={rotation} height={360} emptyText="Učitaj PDF ili JPEG/PNG da vidiš rotirani prikaz za nalog za rezanje" />
    </div>
  </div>;
}

export function RezanjeMptpPanel({ folija = {}, nalog = {}, editable = false, onRotationChange }) {
  const kpdf = folija.kpdf || nalog?.kpdf || {};
  const initial = Number(kpdf.mptpRotation ?? kpdf.rotationRezanje ?? 0) || 0;
  const [localRotation, setLocalRotation] = useState(initial);
  const rotation = editable ? localRotation : initial;
  const mergedKpdf = { ...kpdf, mptpRotation: rotation, rotationRezanje: rotation };
  const r = folija.rezanje || nalog?.rezanje || {};

  return <div style={{ border: "1px solid #fed7aa", borderRadius: 14, overflow: "hidden", background: "#fff7ed" }}>
    <div style={{ padding: "11px 14px", borderBottom: "1px solid #fed7aa", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 13, color: "#9a3412", fontWeight: 950 }}>🎞️ MPTP / JPEG — odmotavanje i realan položaj motiva na rolni</div>
        <div style={{ fontSize: 10.5, color: "#9a3412", fontWeight: 750 }}>Za operatera na rezanju: smer odmotavanja, inside/outside, rezne linije, UP i rotirani motiv.</div>
      </div>
      {editable && <RotationButtons rotation={rotation} onChange={deg => { setLocalRotation(deg); onRotationChange && onRotationChange(deg); }} />}
    </div>

    <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 12 }}>
      <Card>
        <RollSvg folija={folija} kpdf={mergedKpdf} rezanje={r} />
      </Card>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8, marginBottom: 10 }}>
          <MiniLabel label="Rotacija" value={`${rotation}°`} color={ORANGE} />
          <MiniLabel label="Fajl" value={mediaUrl(kpdf) ? mediaName(kpdf) : "nije dodat"} color={ORANGE} />
          <MiniLabel label="Tip fajla" value={mediaUrl(kpdf) ? mediaType(kpdf).toUpperCase() : "—"} color={GREEN} />
          <MiniLabel label="Smer" value={`${directionArrow(kpdf.visualUnwind || "right")} ${kpdf.unwindDirection || folija.finalRoll?.smerOdmotavanja || folija.stampa?.smerOdmotavanja || "desno"}`} color={BLUE} />
          <MiniLabel label="Inside/Outside" value={kpdf.rollDirection || "outside"} color={GREEN} />
          <MiniLabel label="Strana štampe" value={kpdf.printSide || folija.finalRoll?.stampaStrana || "Spolja"} color={PURPLE} />
        </div>
        <MediaPreview kpdf={kpdf} rotation={rotation} height={360} emptyText="Nema dodatog KPDF/JPEG/PNG prikaza u template-u" />
      </Card>
    </div>

    <div style={{ margin: "0 12px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "9px 12px", color: "#92400e", fontWeight: 950, fontSize: 11 }}>
      ⚠ PROVERITI ORIJENTACIJU MOTIVA PRE REZANJA — za štampu ostaje original, ovde se vidi realan položaj motiva na rolni.
    </div>
  </div>;
}

export function StampaKpdfPreview({ folija = {} }) {
  const kpdf = folija.kpdf || {};
  const original = useMemo(() => ({ ...kpdf, mptpRotation: 0, rotationRezanje: 0 }), [kpdf]);
  return <div style={{ marginTop: 10 }}>
    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 900, marginBottom: 8 }}>Originalni KPDF/MPTP za štampu — bez rotacije</div>
    <MediaPreview kpdf={original} rotation={0} height={260} emptyText="KPDF/MPTP/JPEG nije dodat u template" />
  </div>;
}
