import { useEffect, useRef, useState } from "react";

/**
 * QRScannerModal
 *
 * BUG koji je pravio BELI EKRAN:
 *   scanner.stop() se pozivao DVA puta — jednom kad se QR pročita, pa opet u cleanup-u
 *   pri unmount-u. Drugi poziv baca grešku SINHRONO (html5-qrcode: "scanner is not running"),
 *   pa je `.catch()` ne hvata → greška probije kroz React → ceo prikaz nestane.
 *   Isto se dešavalo i kad kamera ne krene (odbijena dozvola): cleanup je zvao stop()
 *   na skeneru koji nikad nije startovao.
 *
 * Rešenje: jedan `stopSafe()` koji pamti stanje, hvata i sinhrone i async greške,
 * i može da se pozove više puta bez posledica.
 */
export default function QRScannerModal({ onResult, onClose }) {
    const divRef = useRef(null);
    const scannerRef = useRef(null);
    const runningRef = useRef(false);   // da li kamera stvarno radi
    const doneRef = useRef(false);      // da li smo već vratili rezultat
    const [error, setError] = useState("");
    const [manual, setManual] = useState("");
    const [ready, setReady] = useState(false);

    // Zaustavljanje koje NE MOŽE da pukne — ni sinhrono, ni asinhrono, ni ako se zove dvaput.
    async function stopSafe() {
        const sc = scannerRef.current;
        if (!sc || !runningRef.current) return;
        runningRef.current = false;
        try {
            await sc.stop();          // sinhroni throw pada u catch ispod
        } catch (e) { /* skener već stao — nije greška */ }
        try {
            sc.clear();
        } catch (e) { /* ignoriši */ }
        scannerRef.current = null;
    }

    // Rezultat se vraća SAMO JEDNOM (inače dupli stop / dupli tryCheck).
    function vrati(text) {
        if (doneRef.current) return;
        doneRef.current = true;
        stopSafe().finally(() => {
            if (typeof onResult === "function") onResult(String(text || "").trim());
        });
    }

    useEffect(() => {
        let ziv = true;

        async function start() {
            try {
                if (!divRef.current) return;                    // DOM još nije spreman
                const { Html5Qrcode } = await import("html5-qrcode");
                if (!ziv || !divRef.current) return;            // modal zatvoren u međuvremenu

                const sc = new Html5Qrcode("qr-reader-div");
                scannerRef.current = sc;

                await sc.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 220, height: 220 } },
                    (decodedText) => vrati(decodedText),
                    () => { }                                    // ne logiraj svaki frejm
                );

                if (!ziv) { runningRef.current = true; await stopSafe(); return; }
                runningRef.current = true;
                setReady(true);
            } catch (e) {
                if (!ziv) return;
                const m = String(e?.message || e || "");
                setError(
                    /permission|denied|notallowed/i.test(m)
                        ? "Kamera je odbijena. Dozvoli pristup kameri u podešavanjima browsera — ili unesi broj rolne ručno ispod."
                        : /secure|https/i.test(m)
                            ? "Kamera radi samo preko HTTPS veze."
                            : "Kamera nije dostupna: " + m
                );
            }
        }

        start();

        return () => {
            ziv = false;
            stopSafe();     // ne baca ni ako skener nikad nije startovao
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function zatvori() {
        stopSafe().finally(() => { if (typeof onClose === "function") onClose(); });
    }

    return (
        <div style={{
            position: "fixed", inset: 0, background: "#000",
            zIndex: 9999, display: "flex", flexDirection: "column",
            fontFamily: "Inter,system-ui,sans-serif",
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", background: "rgba(0,0,0,.6)" }}>
                <div style={{ color: "#fff", fontWeight: 900, fontSize: 16 }}>📷 Skeniraj QR</div>
                <button onClick={zatvori} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 8, padding: "7px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                    ✕ Zatvori
                </button>
            </div>

            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
                {/* Div za kameru MORA da postoji i kad ima greške — inače se skener
                    ne može ni pokrenuti pri ponovnom pokušaju. Samo ga sakrijemo. */}
                <div style={{ position: "relative", display: error ? "none" : "block" }}>
                    <div id="qr-reader-div" ref={divRef} style={{ width: 280, borderRadius: 12, overflow: "hidden" }} />
                    {!ready && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontWeight: 700 }}>
                            ⏳ Pokrećem kameru...
                        </div>
                    )}
                </div>

                {error && (
                    <div style={{ color: "#fca5a5", fontWeight: 700, textAlign: "center", padding: 24, maxWidth: 320, lineHeight: 1.5 }}>
                        <div style={{ fontSize: 36, marginBottom: 12 }}>📷</div>
                        {error}
                    </div>
                )}
            </div>

            <div style={{ padding: "16px 18px 36px", background: "rgba(0,0,0,.7)" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>
                    Ili unesi ručno
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <input
                        value={manual}
                        onChange={(e) => setManual(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) vrati(manual); }}
                        placeholder="br. rolne npr. ROLNA-2026-738034271"
                        style={{ flex: 1, padding: "12px 14px", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 9, color: "#fff", fontSize: 15, fontFamily: "inherit", outline: "none" }}
                    />
                    <button
                        onClick={() => { if (manual.trim()) vrati(manual); }}
                        style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 9, padding: "12px 18px", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
                        ✓
                    </button>
                </div>
            </div>
        </div>
    );
}
