import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { izvrsiFormatiranje } from "./modules/izvrsiFormatiranje.js";

// =====================================================================
// RadnikOperacija — telefonska radnička strana za JEDNU operaciju.
// Otvara se skeniranjem QR-a operacije:  ...?opid=<id operacije>
// Tok: START -> U TOKU (tajmer) -> [PAUZA/ZASTOJ -> razlog] -> ZAVRŠETAK
// Status se čuva u operativni_nalozi (status/start_ts/...), zastoji u nalog_zastoji.
// =====================================================================

// Radnik upisuje SVOJE ime i prezime (nema logina na masini).
// Ime se pamti u telefonu, pa se ne kuca iznova za svaku operaciju.
const LS_RADNIK = "maropack_radnik_ime";
function ucitajRadnika() {
    try { return localStorage.getItem(LS_RADNIK) || ""; } catch { return ""; }
}
function zapamtiRadnika(v) {
    try { localStorage.setItem(LS_RADNIK, String(v || "").trim()); } catch { }
}
const MASINE = ["Štampa 1", "Štampa 2", "Kaširanje", "Rezanje", "Kese", "Špulne", "Formatiranje"];

const RAZLOZI = {
    tehnicki: { naziv: "TEHNIČKI", dot: "#60a5fa", lista: ["Kvar mašine", "Podešavanje", "Održavanje", "Struja/vazduh"] },
    materijal: { naziv: "MATERIJAL", dot: "#f59e0b", lista: ["Nema materijala", "Nema boje", "Zamena rolne", "Loš materijal"] },
    planirani: { naziv: "PLANIRANI", dot: "#34d399", lista: ["Ručak", "Kratka pauza"] },
};

function opMeta(n) {
    const x = String(n?.tip_naloga || n?.vrsta || n?.operacija || n?.naziv || n?.broj_naloga || "").toLowerCase();
    if (x.includes("mater")) return { key: "materijal", label: "MATERIJAL", ik: "📦", masina: "Štampa 1" };
    if (x.includes("štamp") || x.includes("stamp")) return { key: "stampa", label: "ŠTAMPA", ik: "🖨️", masina: "Štampa 1" };
    if (x.includes("kaš") || x.includes("kas")) return { key: "kasiranje", label: "KAŠIRANJE", ik: "🔗", masina: "Kaširanje" };
    if (x.includes("perf") || x.includes("rez")) return { key: "rezanje", label: "PERFORACIJA / REZANJE", ik: "✂️", masina: "Rezanje" };
    if (x.includes("kes")) return { key: "kesa", label: "KESA", ik: "🛍️", masina: "Kese" };
    if (x.includes("format")) return { key: "formatiranje", label: "FORMATIRANJE", ik: "🎞️", masina: "Formatiranje" };
    if (x.includes("špul") || x.includes("spul")) return { key: "spulna", label: "ŠPULNA", ik: "🧵", masina: "Špulne" };
    return { key: "operacija", label: "OPERACIJA", ik: "🛠️", masina: "Štampa 1" };
}

function secBetween(a, b) {
    if (!a) return 0;
    const d1 = new Date(a).getTime();
    const d2 = b ? new Date(b).getTime() : Date.now();
    if (Number.isNaN(d1) || Number.isNaN(d2)) return 0;
    return Math.max(0, Math.floor((d2 - d1) / 1000));
}
function fmtHMS(sec) {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
}
function fmtMin(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export default function RadnikOperacija({ opid }) {
    const [op, setOp] = useState(null);
    const [zastoji, setZastoji] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const [tick, setTick] = useState(0); // pokreće re-render svake sekunde

    // start-ekran izbori + završetak
    const [radnik, setRadnik] = useState(() => ucitajRadnika());
    const [masina, setMasina] = useState("");
    const [showRazlog, setShowRazlog] = useState(false);
    const [showFinish, setShowFinish] = useState(false);
    const [fin, setFin] = useState({ uradjeno: "", skart: "", napomena: "" });

    const meta = useMemo(() => opMeta(op), [op]);

    async function reload() {
        if (!opid) { setErr("Nedostaje opid u URL-u (…?opid=…)."); setLoading(false); return; }
        try {
            const { data: row, error } = await supabase
                .from("operativni_nalozi").select("*").eq("id", opid).maybeSingle();
            if (error) throw error;
            if (!row) { setErr("Operacija nije pronađena: " + opid); setOp(null); }
            else { setOp(row); setErr(""); }

            const { data: z } = await supabase
                .from("nalog_zastoji").select("*").eq("opid", opid).order("start_ts", { ascending: true });
            setZastoji(z || []);
        } catch (e) {
            setErr("Greška pri učitavanju: " + (e.message || e));
        }
        setLoading(false);
    }
    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [opid]);

    // sekundni tajmer (radi samo kad nešto teče)
    useEffect(() => {
        const live = op && (op.status === "radi" || op.status === "zastoj");
        if (!live) return;
        const t = setInterval(() => setTick((x) => x + 1), 1000);
        return () => clearInterval(t);
    }, [op?.status]);

    // postavi default mašinu prema tipu operacije
    useEffect(() => { if (op && !masina) setMasina(op.masina || meta.masina); }, [op, meta, masina]);

    const proteklo = op?.start_ts ? secBetween(op.start_ts, op.status === "zavrseno" ? op.stop_ts : null) : 0;
    const aktivanZastoj = useMemo(() => zastoji.find((z) => !z.stop_ts), [zastoji]);
    const zastojiMin = useMemo(() => {
        let s = 0;
        for (const z of zastoji) s += z.stop_ts ? Number(z.trajanje_min || 0) : Math.round(secBetween(z.start_ts, null) / 60);
        return s;
    }, [zastoji, tick]);
    const radMin = Math.max(0, Math.round(proteklo / 60) - zastojiMin);

    // ---- AKCIJE -------------------------------------------------------
    async function pocni() {
        const ime = String(radnik || "").trim().replace(/\s+/g, " ");
        // Trazimo IME I PREZIME — inace bi u evidenciji zavrsavalo "Marko", "M.", ""
        // i ne bi se znalo ko je radio.
        if (ime.split(" ").filter(Boolean).length < 2) { setErr("Upiši ime i prezime."); return; }
        if (!masina) { setErr("Izaberi mašinu."); return; }
        zapamtiRadnika(ime);
        setRadnik(ime);
        setBusy(true); setErr("");
        const { error } = await supabase.from("operativni_nalozi")
            .update({ status: "radi", radnik: ime, masina, start_ts: op.start_ts || new Date().toISOString(), stop_ts: null, pauza_ts: null })
            .eq("id", opid);
        if (error) setErr("Start nije uspeo: " + error.message);
        setBusy(false); reload();
    }

    async function otvoriZastoj(kategorija, razlog) {
        setBusy(true); setShowRazlog(false);
        const ins = await supabase.from("nalog_zastoji").insert({
            opid, glavni_nalog_id: op.glavni_nalog_id || null, broj_naloga: op.broj_naloga || null,
            masina: op.masina || masina, radnik: op.radnik || radnik, kategorija, razlog, start_ts: new Date().toISOString(),
        });
        if (ins.error) { setErr("Zastoj nije upisan: " + ins.error.message); setBusy(false); return; }
        const { error } = await supabase.from("operativni_nalozi")
            .update({ status: "zastoj", pauza_ts: new Date().toISOString() }).eq("id", opid);
        if (error) setErr("Status nije promenjen: " + error.message);
        setBusy(false); reload();
    }

    async function nastavi() {
        setBusy(true);
        if (aktivanZastoj) {
            const min = Math.max(1, Math.round(secBetween(aktivanZastoj.start_ts, null) / 60));
            await supabase.from("nalog_zastoji")
                .update({ stop_ts: new Date().toISOString(), trajanje_min: min }).eq("id", aktivanZastoj.id);
        }
        const { error } = await supabase.from("operativni_nalozi")
            .update({ status: "radi", pauza_ts: null }).eq("id", opid);
        if (error) setErr("Nastavak nije uspeo: " + error.message);
        setBusy(false); reload();
    }

    async function zavrsi() {
        setBusy(true);
        if (aktivanZastoj) {
            const min = Math.max(1, Math.round(secBetween(aktivanZastoj.start_ts, null) / 60));
            await supabase.from("nalog_zastoji")
                .update({ stop_ts: new Date().toISOString(), trajanje_min: min }).eq("id", aktivanZastoj.id);
        }
        const { error } = await supabase.from("operativni_nalozi").update({
            status: "zavrseno", stop_ts: new Date().toISOString(), pauza_ts: null,
            uradjeno: Number(fin.uradjeno || 0), skart: Number(fin.skart || 0), napomena: fin.napomena || "",
        }).eq("id", opid);
        if (error) setErr("Završetak nije uspeo: " + error.message);

        // Formatiranje: stvarni rez kroz bazu na ZAVRŠENO (samo formatiranje-nalog, jednom)
        if (!error) {
            try {
                const plan = op?.parametri?.formatiranje;
                if (plan && plan.br_rolne && !op?.parametri?.formatiranje_izvrseno) {
                    const { data: mrows } = await supabase.from("magacin").select("*").eq("br_rolne", plan.br_rolne).limit(1);
                    const matica = mrows && mrows[0];
                    if (matica) {
                        const rez = await izvrsiFormatiranje(supabase, matica, plan, {
                            nalog: { broj: op.broj_naloga, id: op.id }, user_id: op.radnik || null,
                        });
                        if (rez && rez.ok) {
                            await supabase.from("operativni_nalozi").update({
                                parametri: { ...op.parametri, formatiranje_izvrseno: true, formatiranje_role: (rez.nastale || []).length },
                            }).eq("id", opid);
                        } else if (rez && rez.greske && rez.greske.length) {
                            setErr("Formatiranje: " + rez.greske.join(" · "));
                        }
                    } else {
                        setErr("Formatiranje: matična " + plan.br_rolne + " nije nađena u magacinu.");
                    }
                }
            } catch (eF) { console.warn("Formatiranje na ZAVRŠENO nije izvršeno:", eF); }
        }
        setBusy(false); setShowFinish(false); reload();
    }

    // ---- STILOVI ------------------------------------------------------
    const wrap = { maxWidth: 440, margin: "0 auto", minHeight: "100vh", background: "#0a0d13", color: "#cbd5e1", fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif", padding: 14, boxSizing: "border-box" };
    const head = { background: "linear-gradient(180deg,#2f6bed,#2350cf)", borderRadius: 16, padding: "13px 15px", color: "#fff", marginBottom: 14 };
    const lbl = { display: "block", fontSize: 11, color: "#94a3b8", margin: "12px 2px 6px", fontWeight: 700 };
    const inp = { width: "100%", background: "#0f1622", border: "1px solid #243246", color: "#e2e8f0", borderRadius: 10, padding: "12px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" };
    const btn = (bg, fg = "#fff") => ({ width: "100%", border: "none", borderRadius: 12, color: fg, fontWeight: 800, fontSize: 15, padding: 15, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, marginTop: 12 });

    if (loading) return <div style={wrap}><div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Učitavam operaciju…</div></div>;
    if (err && !op) return <div style={wrap}><div style={{ ...head, background: "#7f1d1d" }}>⚠️ {err}</div></div>;

    const naziv = op?.broj_naloga || "—";
    const proizvod = op?.proizvod || op?.parametri?.proizvod || op?.parametri?.naziv || "";

    return (
        <div style={wrap}>
            <div style={head}>
                <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 700 }}>{naziv} · Mašina</div>
                <div style={{ fontSize: 19, fontWeight: 900, margin: "2px 0" }}>{meta.ik} {meta.label}</div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>{proizvod}{op?.radnik ? ` · Radnik ${op.radnik}` : ""}{op?.masina ? ` · ${op.masina}` : ""}</div>
            </div>

            {err && <div style={{ background: "#7f1d1d22", border: "1px solid #7f1d1d", color: "#fca5a5", borderRadius: 10, padding: 10, fontSize: 12, marginBottom: 12 }}>{err}</div>}

            {/* ---------- EKRAN: RAZLOG ZASTOJA ---------- */}
            {showRazlog && (
                <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 10 }}>⏸ Razlog zastoja</div>
                    {Object.entries(RAZLOZI).map(([k, g]) => (
                        <div key={k}>
                            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 800, letterSpacing: 1, margin: "12px 2px 7px" }}>{g.naziv}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                {g.lista.map((r) => (
                                    <button key={r} disabled={busy} onClick={() => otvoriZastoj(k, r)}
                                        style={{ background: "#0f1622", border: "1px solid #243246", color: "#cbd5e1", borderRadius: 9, padding: "11px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, textAlign: "left" }}>
                                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: g.dot, flex: "0 0 auto" }} />{r}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    <button onClick={() => setShowRazlog(false)} style={{ ...btn("#1e293b"), marginTop: 16 }}>← Otkaži</button>
                </div>
            )}

            {/* ---------- EKRAN: ZAVRŠETAK ---------- */}
            {showFinish && !showRazlog && (
                <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 4 }}>✓ Završetak operacije</div>
                    <label style={lbl}>Urađeno (m)</label>
                    <input style={inp} inputMode="numeric" value={fin.uradjeno} onChange={(e) => setFin((p) => ({ ...p, uradjeno: e.target.value }))} placeholder="npr. 50000" />
                    <label style={lbl}>Škart (m)</label>
                    <input style={inp} inputMode="numeric" value={fin.skart} onChange={(e) => setFin((p) => ({ ...p, skart: e.target.value }))} placeholder="0" />
                    <label style={lbl}>Napomena</label>
                    <input style={inp} value={fin.napomena} onChange={(e) => setFin((p) => ({ ...p, napomena: e.target.value }))} placeholder="opciono" />
                    <div style={{ background: "#1d4ed822", border: "1px solid #1d4ed8", borderRadius: 10, padding: 11, fontSize: 12, color: "#bfdbfe", margin: "14px 0 2px" }}>
                        ⏱ <b style={{ color: "#fff" }}>Rad: {fmtMin(radMin)}</b> · Zastoji: <b style={{ color: "#fff" }}>{fmtMin(zastojiMin)}</b>{zastoji.length ? ` (${zastoji.length} zastoja)` : ""}
                    </div>
                    <button disabled={busy} onClick={zavrsi} style={btn("#1d4ed8")}>✓ POTVRDI ZAVRŠETAK</button>
                    <button onClick={() => setShowFinish(false)} style={btn("#1e293b")}>← Nazad</button>
                </div>
            )}

            {/* ---------- EKRAN: START ---------- */}
            {!showRazlog && !showFinish && (!op || op.status === "ceka" || !op.start_ts) && op?.status !== "zavrseno" && (
                <div>
                    <label style={lbl}>Radnik</label>
                    <input
                        style={inp}
                        value={radnik}
                        onChange={(e) => setRadnik(e.target.value)}
                        onBlur={(e) => zapamtiRadnika(e.target.value)}
                        placeholder="Ime i prezime"
                        autoComplete="name"
                    />
                    <label style={lbl}>Mašina</label>
                    <select style={inp} value={masina} onChange={(e) => setMasina(e.target.value)}>{MASINE.map((m) => <option key={m}>{m}</option>)}</select>
                    <button disabled={busy} onClick={pocni} style={btn("#16a34a")}>▶ POČNI OPERACIJU</button>
                </div>
            )}

            {/* ---------- EKRAN: U TOKU / ZASTOJ ---------- */}
            {!showRazlog && !showFinish && op && (op.status === "radi" || op.status === "zastoj") && op.start_ts && (
                <div>
                    {op.status === "zastoj" ? (
                        <div style={{ background: "rgba(220,38,38,.14)", border: "1px solid rgba(220,38,38,.5)", color: "#f87171", fontWeight: 700, fontSize: 13, borderRadius: 10, padding: 10, textAlign: "center", marginBottom: 14 }}>
                            ⏸ ZASTOJ · {aktivanZastoj?.razlog || "—"}
                        </div>
                    ) : (
                        <div style={{ background: "rgba(34,197,94,.14)", border: "1px solid rgba(34,197,94,.45)", color: "#4ade80", fontWeight: 700, fontSize: 13, borderRadius: 10, padding: 10, textAlign: "center", marginBottom: 14 }}>● U TOKU</div>
                    )}
                    <div style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", letterSpacing: 2, fontWeight: 600 }}>PROTEKLO</div>
                    <div style={{ textAlign: "center", fontSize: 42, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums", margin: "4px 0 6px" }}>{fmtHMS(proteklo)}</div>
                    <div style={{ textAlign: "center", fontSize: 11, color: "#64748b", marginBottom: 18 }}>Rad {fmtMin(radMin)} · Zastoji {fmtMin(zastojiMin)}</div>

                    {op.status === "zastoj" ? (
                        <button disabled={busy} onClick={nastavi} style={btn("#16a34a")}>▶ NASTAVI RAD</button>
                    ) : (
                        <button disabled={busy} onClick={() => setShowRazlog(true)} style={btn("#f59e0b", "#3b2a00")}>⏸ PAUZA / ZASTOJ</button>
                    )}
                    <button disabled={busy} onClick={() => setShowFinish(true)} style={btn("#2563eb")}>✓ ZAVRŠI OPERACIJU</button>
                </div>
            )}

            {/* ---------- EKRAN: ZAVRŠENO ---------- */}
            {!showRazlog && !showFinish && op?.status === "zavrseno" && (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <div style={{ fontSize: 44 }}>✅</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: "8px 0" }}>Operacija završena</div>
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>Urađeno: {Number(op.uradjeno || 0).toLocaleString("sr-RS")} m · Škart: {Number(op.skart || 0)} m</div>
                    <div style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>Rad {fmtMin(radMin)} · Zastoji {fmtMin(zastojiMin)}</div>
                </div>
            )}
        </div>
    );
}
