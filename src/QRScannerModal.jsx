import { useEffect, useRef, useState } from "react";

export default function QRScannerModal({ onResult, onClose }) {
  const divRef = useRef(null);
  const scannerRef = useRef(null);
  const [error, setError]   = useState("");
  const [manual, setManual] = useState("");
  const [ready,  setReady]  = useState(false);

  useEffect(() => {
    let scanner;

    async function start() {
      try {
        // Dinamički import — biblioteka se učitava samo kad se koristi
        const { Html5Qrcode } = await import("html5-qrcode");
        scanner = new Html5Qrcode("qr-reader-div");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" }, // zadnja kamera
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            // QR pronađen
            scanner.stop().catch(() => {});
            onResult(decodedText);
          },
          () => {} // ne logiraj svaki frame
        );
        setReady(true);
      } catch (e) {
        setError("Kamera nije dostupna: " + e.message);
      }
    }

    start();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000",
      zIndex: 9999, display: "flex", flexDirection: "column",
      fontFamily: "Inter,system-ui,sans-serif",
    }}>
      {/* Top */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 18px", background:"rgba(0,0,0,.6)" }}>
        <div style={{ color:"#fff", fontWeight:900, fontSize:16 }}>📷 Skeniraj QR</div>
        <button onClick={onClose} style={{ background:"rgba(255,255,255,.15)", border:"none", color:"#fff", borderRadius:8, padding:"7px 14px", fontWeight:800, fontSize:13, cursor:"pointer" }}>
          ✕ Zatvori
        </button>
      </div>

      {/* Kamera */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
        {error ? (
          <div style={{ color:"#ef4444", fontWeight:700, textAlign:"center", padding:24 }}>
            <div style={{ fontSize:36, marginBottom:12 }}>❌</div>
            {error}
          </div>
        ) : (
          <div style={{ position:"relative" }}>
            {/* html5-qrcode renderuje video ovdje */}
            <div id="qr-reader-div" ref={divRef} style={{ width:280, borderRadius:12, overflow:"hidden" }} />
            {!ready && (
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#94a3b8" }}>
                ⏳ Pokrećem kameru...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ručni unos */}
      <div style={{ padding:"16px 18px 36px", background:"rgba(0,0,0,.7)" }}>
        <div style={{ fontSize:11, color:"#64748b", fontWeight:700, textTransform:"uppercase", marginBottom:8 }}>
          Ili unesi ručno
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <input
            value={manual}
            onChange={e => setManual(e.target.value)}
            onKeyDown={e => e.key==="Enter" && manual && onResult(manual)}
            placeholder="br. rolne npr. R-2024-001"
            style={{ flex:1, padding:"12px 14px", background:"rgba(255,255,255,.1)", border:"1px solid rgba(255,255,255,.2)", borderRadius:9, color:"#fff", fontSize:15, fontFamily:"inherit", outline:"none" }}
          />
          <button
            onClick={() => manual && onResult(manual)}
            style={{ background:"#3b82f6", color:"#fff", border:"none", borderRadius:9, padding:"12px 18px", fontWeight:800, fontSize:16, cursor:"pointer" }}>
            ✓
          </button>
        </div>
      </div>
    </div>
  );
}
