import React, { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const LS_ROLNE = "maropack_rolne_magacin";
const LS_HISTORY = "maropack_rolne_istorija";

function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed;
  } catch {
    return fallback;
  }
}
function safeWrite(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function now() { return new Date().toLocaleString("sr-RS"); }
function number(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function round2(v) { return Math.round(number(v) * 100) / 100; }
function fmt(v, dec = 2) { return number(v).toLocaleString("sr-RS", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function metersFromKg({ sirinaMm, kg, gsm }) {
  const sirinaM = number(sirinaMm) / 1000;
  const g = number(gsm);
  if (!sirinaM || !g) return 0;
  return round2((number(kg) * 1000) / (sirinaM * g));
}
function kgFromMeters({ sirinaMm, duzinaM, gsm }) {
  const sirinaM = number(sirinaMm) / 1000;
  return round2((sirinaM * number(duzinaM) * number(gsm)) / 1000);
}
function extractQr(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return parsed.qr || parsed.rola || parsed.roll || parsed.id || raw;
  } catch {
    const match = raw.match(/ROLNA[-_A-Z0-9]+/i);
    return match ? match[0] : raw;
  }
}
function statusColor(s) {
  if (s === "rezervisana") return "#f59e0b";
  if (s === "potrosena") return "#ef4444";
  if (s === "formatirana") return "#2563eb";
  if (s === "blokirana") return "#7c3aed";
  if (s === "popisana") return "#0ea5e9";
  return "#059669";
}

export default function MobileRollScanner({ mode = "popis", msg }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [roll, setRoll] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ duzina: "", kg: "", lokacija: "", status: "dostupna", napomena: "" });

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function loadRoll(qrValue) {
    const qr = extractQr(qrValue);
    const rolls = safeRead(LS_ROLNE, []);
    const found = rolls.find((r) => String(r.qr) === String(qr) || String(r.id) === String(qr));
    if (!found) {
      setRoll(null);
      setError("Rolna nije pronađena: " + qr);
      setSuccess("");
      return;
    }
    setRoll(found);
    setForm({
      duzina: found.duzina || "",
      kg: found.kg || "",
      lokacija: found.lokacija || "",
      status: found.status || "dostupna",
      napomena: "",
    });
    setError("");
    setSuccess("Skenirana rolna: " + found.qr);
    stopCamera();
  }

  async function startCamera() {
    setError("");
    setSuccess("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Kamera nije dostupna u browseru. Koristi Chrome na telefonu ili ručni unos QR koda.");
      return;
    }
    if (!("BarcodeDetector" in window)) {
      setError("Tvoj browser ne podržava direktan QR scan. Možeš ručno uneti/paste QR kod ili otvoriti u Chrome/Android.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const loop = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length > 0) {
            const value = codes[0].rawValue;
            loadRoll(value);
            return;
          }
        } catch {}
        scanLoopRef.current = requestAnimationFrame(loop);
      };
      scanLoopRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setError("Ne mogu da otvorim kameru. Proveri dozvole za kameru: " + (e?.message || e));
    }
  }

  function stopCamera() {
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    scanLoopRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = null;
    setScanning(false);
  }

  function updateForm(next) {
    const merged = { ...form, ...next };
    const gsm = number(roll?.gsm);
    if (next.duzina !== undefined && gsm > 0) {
      merged.kg = kgFromMeters({ sirinaMm: roll?.sirina, duzinaM: merged.duzina, gsm });
    }
    if (next.kg !== undefined && gsm > 0) {
      merged.duzina = metersFromKg({ sirinaMm: roll?.sirina, kg: merged.kg, gsm });
    }
    setForm(merged);
  }

  function saveInventory() {
    if (!roll) return;
    const rolls = safeRead(LS_ROLNE, []);
    const updated = {
      ...roll,
      duzina: round2(form.duzina),
      kg: round2(form.kg),
      lokacija: form.lokacija || roll.lokacija || "Magacin",
      status: form.status || roll.status || "dostupna",
      datum_popisa: new Date().toLocaleDateString("sr-RS"),
      datum_poslednje_promene: now(),
      popisano: true,
      napomena_popisa: form.napomena || "",
    };
    const next = rolls.map((r) => (r.qr === roll.qr ? updated : r));
    const history = safeRead(LS_HISTORY, []);
    const h = [{
      vreme: now(),
      qr: updated.qr,
      event: "QR_POPIS",
      opis: `Popis preko telefona: ${fmt(updated.duzina, 0)} m / ${fmt(updated.kg, 2)} kg, lokacija ${updated.lokacija}`,
      stanje: updated.status,
    }, ...history];
    safeWrite(LS_ROLNE, next);
    safeWrite(LS_HISTORY, h);
    setRoll(updated);
    setSuccess("Popis sačuvan za rolnu " + updated.qr);
    msg?.("Popis sačuvan: " + updated.qr);
  }

  function markForProduction() {
    if (!roll) return;
    const history = safeRead(LS_HISTORY, []);
    safeWrite(LS_HISTORY, [{ vreme: now(), qr: roll.qr, event: "QR_SCAN_PROIZVODNJA", opis: "Rolna skenirana za proizvodnju preko mobilnog skenera", stanje: roll.status }, ...history]);
    setSuccess("Rolna validirana za proizvodnju: " + roll.qr);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "Segoe UI, system-ui, sans-serif", padding: 14, color: "#0f172a" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ background: "linear-gradient(135deg,#0f172a,#1d4ed8)", color: "white", borderRadius: 18, padding: 18, marginBottom: 12, boxShadow: "0 10px 30px rgba(15,23,42,.22)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, opacity: .8, fontWeight: 800, textTransform: "uppercase", letterSpacing: .8 }}>Mobile Operator Mode</div>
              <h1 style={{ margin: "4px 0 0", fontSize: 24 }}>📱 QR skener rolni</h1>
              <div style={{ fontSize: 13, opacity: .85, marginTop: 4 }}>Telefon/tablet skeniranje rolni za popis i proizvodnju</div>
            </div>
            <button onClick={() => window.location.href = "/"} style={{ border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.12)", color: "white", borderRadius: 10, padding: "10px 12px", fontWeight: 800 }}>ERP</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 12 }}>
          <button onClick={startCamera} disabled={scanning} style={btn("#2563eb")}>{scanning ? "📷 Skeniranje..." : "📷 Skeniraj QR"}</button>
          <button onClick={stopCamera} style={btn("#64748b")}>⏹️ Stop kamera</button>
          <button onClick={() => { setRoll(null); setManual(""); setError(""); setSuccess(""); }} style={btn("#0f172a")}>🔄 Novi scan</button>
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: 12, border: "1px solid #e2e8f0", marginBottom: 12 }}>
          <video ref={videoRef} playsInline muted style={{ display: scanning ? "block" : "none", width: "100%", maxHeight: 360, objectFit: "cover", borderRadius: 12, background: "#0f172a" }} />
          {!scanning && <div style={{ padding: 22, textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: 12, border: "1px dashed #cbd5e1" }}>Klikni “Skeniraj QR” ili ručno nalepi QR sadržaj ispod.</div>}
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: 14, border: "1px solid #e2e8f0", marginBottom: 12 }}>
          <label style={label}>Ručni unos / paste QR koda</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="ROLNA-2026-... ili JSON iz QR koda" style={input} />
            <button onClick={() => loadRoll(manual)} style={{ ...btn("#059669"), width: 110 }}>Pronađi</button>
          </div>
        </div>

        {error && <div style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 12, padding: 12, marginBottom: 12, fontWeight: 800 }}>{error}</div>}
        {success && <div style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 12, padding: 12, marginBottom: 12, fontWeight: 800 }}>{success}</div>}

        {roll && (
          <div style={{ background: "white", borderRadius: 18, padding: 16, border: "1px solid #e2e8f0", boxShadow: "0 4px 18px rgba(15,23,42,.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>Pronađena rolna</div>
                <div style={{ fontSize: 22, fontWeight: 900, wordBreak: "break-all" }}>{roll.qr}</div>
                <div style={{ fontSize: 14, color: "#475569" }}>{roll.vrsta} · {roll.komercijalnaOznaka || roll.materijal} · {roll.proizvodjac || "—"}</div>
              </div>
              <div style={{ minWidth: 92, textAlign: "center" }}>
                <QRCodeSVG value={JSON.stringify({ type: "maropack_roll", qr: roll.qr })} size={82} />
                <div style={{ marginTop: 4, color: statusColor(roll.status), fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>{roll.status || "dostupna"}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, marginBottom: 14 }}>
              <Info title="Širina" value={`${roll.sirina} mm`} />
              <Info title="Debljina" value={`${roll.debljina || "—"} µ`} />
              <Info title="Trenutno m" value={fmt(roll.duzina, 0)} />
              <Info title="Trenutno kg" value={fmt(roll.kg, 2)} />
              <Info title="Lot" value={roll.lot || "—"} />
              <Info title="Lokacija" value={roll.lokacija || "—"} />
            </div>

            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>📦 Popis / ažuriranje stanja</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
                <div><label style={label}>Stvarno m</label><input type="number" value={form.duzina} onChange={(e) => updateForm({ duzina: e.target.value })} style={input} /></div>
                <div><label style={label}>Stvarno kg</label><input type="number" value={form.kg} onChange={(e) => updateForm({ kg: e.target.value })} style={input} /></div>
                <div><label style={label}>Lokacija</label><input value={form.lokacija} onChange={(e) => setForm({ ...form, lokacija: e.target.value })} style={input} /></div>
                <div><label style={label}>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={input}><option value="dostupna">Dostupna</option><option value="rezervisana">Rezervisana</option><option value="blokirana">Blokirana</option><option value="potrosena">Potrošena</option></select></div>
                <div style={{ gridColumn: "1 / -1" }}><label style={label}>Napomena</label><input value={form.napomena} onChange={(e) => setForm({ ...form, napomena: e.target.value })} style={input} placeholder="npr. popis 2026, razlika na etiketi..." /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <button onClick={saveInventory} style={btn("#059669")}>✅ Sačuvaj popis</button>
                <button onClick={markForProduction} style={btn("#2563eb")}>🏭 Validiraj za proizvodnju</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ title, value }) {
  return <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 10 }}><div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{title}</div><div style={{ fontSize: 16, fontWeight: 900 }}>{value}</div></div>;
}
const label = { display: "block", fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: .5, marginBottom: 5 };
const input = { width: "100%", padding: "12px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 15, boxSizing: "border-box", outline: "none", background: "#fff" };
function btn(bg) { return { width: "100%", border: "none", borderRadius: 12, padding: "13px 14px", background: bg, color: "white", fontWeight: 900, fontSize: 14, cursor: "pointer" }; }
