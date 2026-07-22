import React, { useEffect, useRef, useState } from "react";
import { pokreniAgenta, potvrdiPlan } from "../services/aiAgentLLM.js";

const INK = "#0f172a", MUT = "#64748b", LINE = "#e2e8f0";
const card = { background: "#fff", border: "1px solid " + LINE, borderRadius: 16, padding: 16, boxShadow: "0 8px 24px rgba(15,23,42,.05)" };
const btn = { border: 0, borderRadius: 11, padding: "10px 15px", fontWeight: 800, cursor: "pointer", fontSize: 13.5 };

const BRZE = [
    "Šta imam na stanju od BOPP-a?",
    "Koji nalozi su aktivni?",
    "Proveri da li imam materijal za SPANAC 600 na 5000 m",
    "Predloži formatiranje: 20 rolni 460 mm × 3000 m BOPP",
    "Koliko sam potrošio materijala poslednjih 30 dana?",
    "Pročitaj priloženu pakcing listu i pripremi rolne za unos",
];

function Poruka({ p }) {
    const ja = p.od === "ja";
    return (
        <div style={{ display: "flex", justifyContent: ja ? "flex-end" : "flex-start", marginBottom: 12 }}>
            <div style={{
                maxWidth: "82%", padding: "11px 14px", borderRadius: 14, fontSize: 14, lineHeight: 1.55,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
                background: ja ? "#1d4ed8" : "#fff", color: ja ? "#fff" : INK,
                border: ja ? "none" : "1px solid " + LINE,
            }}>
                {p.tekst}
                {!!(p.koraci && p.koraci.length) && (
                    <div style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid " + LINE, fontSize: 11, color: MUT }}>
                        Proverio: {p.koraci.map((k) => k.alat).join(" · ")}
                    </div>
                )}
            </div>
        </div>
    );
}

function PlanKartica({ plan, busy, onPotvrdi, onOtkazi }) {
    return (
        <div style={{ ...card, borderColor: "#fbbf24", background: "#fffbeb", marginBottom: 12 }}>
            <div style={{ fontWeight: 900, color: "#92400e", fontSize: 13, marginBottom: 9 }}>
                ČEKA TVOJU POTVRDU — ovo će promeniti podatke
            </div>
            <div style={{ display: "grid", gap: 7, marginBottom: 13 }}>
                {plan.map((s, i) => (
                    <div key={i} style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 10, padding: "9px 12px", fontSize: 13.5, color: INK }}>
                        <b style={{ color: "#b45309", marginRight: 7 }}>{i + 1}.</b>{s.opis}
                    </div>
                ))}
            </div>
            <div style={{ display: "flex", gap: 9 }}>
                <button onClick={onPotvrdi} disabled={busy} style={{ ...btn, background: "#16a34a", color: "#fff", opacity: busy ? .6 : 1 }}>
                    {busy ? "Izvršavam…" : "Potvrdi i izvrši"}
                </button>
                <button onClick={onOtkazi} disabled={busy} style={{ ...btn, background: "#fff", color: "#b91c1c", border: "1px solid #fecaca" }}>
                    Otkaži
                </button>
            </div>
        </div>
    );
}

export default function AIAgentCommandCenter() {
    const [poruke, setPoruke] = useState([
        { od: "ai", tekst: "Zdravo. Reci mi šta treba — mogu da proverim stanje magacina, templejte i naloge, predložim formatiranje, otvorim nalog ili rezervišem rolne.\n\nSve što menja podatke prvo ću ti pokazati na potvrdu." },
    ]);
    const [unos, setUnos] = useState("");
    const [busy, setBusy] = useState(false);
    const [plan, setPlan] = useState([]);
    const [istorija, setIstorija] = useState([]);   // kontekst razgovora za model
    const [greska, setGreska] = useState("");
    const [prilozi, setPrilozi] = useState([]);
    const dno = useRef(null);

    useEffect(() => { dno.current?.scrollIntoView({ behavior: "smooth" }); }, [poruke, plan, busy]);

    function citajFajl(file) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            const ime = file.name || "fajl";
            const mime = file.type || "";
            const jePdf = /pdf$/i.test(mime) || /\.pdf$/i.test(ime);
            const jeSlika = /^image\//.test(mime) || /\.(png|jpe?g|webp|gif)$/i.test(ime);
            r.onerror = () => rej(new Error("Ne mogu da pročitam " + ime));
            if (jePdf || jeSlika) {
                r.onload = () => res({ naziv: ime, kind: jePdf ? "pdf" : "image", mime: jeSlika ? (mime || "image/jpeg") : "application/pdf", base64: String(r.result).split(",")[1] });
                r.readAsDataURL(file);
            } else {
                r.onload = () => res({ naziv: ime, kind: "text", tekst: String(r.result) });
                r.readAsText(file);
            }
        });
    }

    async function dodajFajlove(files) {
        const lista = Array.from(files || []);
        if (!lista.length) return;
        setGreska("");
        try {
            const ucitani = await Promise.all(lista.map(citajFajl));
            setPrilozi((p) => [...p, ...ucitani]);
        } catch (e) { setGreska(e.message || String(e)); }
    }

    async function posalji(tekst) {
        const q = (tekst || unos).trim();
        if (!q || busy) return;
        setUnos(""); setGreska(""); setPlan([]);
        const opisPriloga = prilozi.length ? "\n\n[priloženo: " + prilozi.map((f) => f.naziv).join(", ") + "]" : "";
        setPoruke((p) => [...p, { od: "ja", tekst: q + opisPriloga }]);
        setBusy(true);
        try {
            const r = await pokreniAgenta(q, istorija, prilozi);
            setPrilozi([]);
            setPoruke((p) => [...p, { od: "ai", tekst: r.odgovor, koraci: r.koraci }]);
            setIstorija(r.messages || []);
            if (r.plan?.length) setPlan(r.plan);
        } catch (e) {
            setGreska(e.message || String(e));
        } finally { setBusy(false); }
    }

    async function izvrsi() {
        setBusy(true); setGreska("");
        try {
            const r = await potvrdiPlan(plan, istorija);
            const rez = r.izvrseno.map((x) => (x.ok ? "✓ " : "✗ ") + x.poruka).join("\n");
            setPoruke((p) => [...p, { od: "ai", tekst: rez + (r.zakljucak ? "\n\n" + r.zakljucak : "") }]);
            setPlan([]);
            try { window.dispatchEvent(new CustomEvent("maropack:nalozi-changed")); } catch (e) { }
        } catch (e) {
            setGreska(e.message || String(e));
        } finally { setBusy(false); }
    }

    return (
        <div style={{ padding: 20, background: "#f1f5f9", minHeight: "100vh" }}>
            <div style={{ maxWidth: 1000, margin: "0 auto" }}>

                <div style={{ ...card, background: "linear-gradient(135deg,#020617,#1d4ed8)", color: "#fff", border: 0, marginBottom: 14 }}>
                    <h1 style={{ fontSize: 26, margin: "0 0 5px" }}>AI Agent Command Center</h1>
                    <p style={{ margin: 0, color: "#dbeafe", fontSize: 13.5 }}>
                        Povezan sa templejtima, magacinom, nalozima i analizama. Izmene traže tvoju potvrdu.
                    </p>
                </div>

                <div style={{ ...card, minHeight: 380, maxHeight: "55vh", overflowY: "auto", background: "#f8fafc", marginBottom: 12 }}>
                    {poruke.map((p, i) => <Poruka key={i} p={p} />)}
                    {busy && <div style={{ color: MUT, fontSize: 13, fontStyle: "italic" }}>Agent radi…</div>}
                    <div ref={dno} />
                </div>

                {plan.length > 0 && <PlanKartica plan={plan} busy={busy} onPotvrdi={izvrsi} onOtkazi={() => { setPlan([]); setPoruke((p) => [...p, { od: "ai", tekst: "Otkazano — ništa nije promenjeno." }]); }} />}

                {greska && (
                    <div style={{ ...card, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c", marginBottom: 12, fontSize: 13.5 }}>
                        <b>Greška:</b> {greska}
                        {/PODESI|nije podešen|Failed to send|not found|non-2xx/i.test(greska) && (
                            <div style={{ marginTop: 8, color: "#7f1d1d", fontSize: 12.5 }}>
                                Proveri u Supabase → Edge Functions da funkcija <b>smart-service</b> postoji i da je
                                u <b>Secrets</b> dodat ključ <b>ANTHROPIC_API_KEY</b>.
                                <br />Ako se funkcija zove drugačije, promeni <code>FUNKCIJA</code> na vrhu fajla <code>aiAgentLLM.js</code>.
                            </div>
                        )}
                    </div>
                )}

                <div style={card}>
                    {prilozi.length > 0 && (
                        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
                            {prilozi.map((f, i) => (
                                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 9, padding: "5px 10px", fontSize: 12, fontWeight: 700 }}>
                                    {f.naziv}
                                    <button onClick={() => setPrilozi((p) => p.filter((_, k) => k !== i))}
                                        style={{ border: 0, background: "transparent", color: "#1d4ed8", cursor: "pointer", fontWeight: 900, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                                </span>
                            ))}
                        </div>
                    )}
                    <div style={{ display: "flex", gap: 9 }}>
                        <textarea
                            value={unos} onChange={(e) => setUnos(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); posalji(); } }}
                            rows={2} placeholder="Npr: proveri materijal za SPANAC 600 na 5000 m i otvori nalog za La Linea"
                            style={{ flex: 1, border: "1px solid #cbd5e1", borderRadius: 12, padding: 12, fontSize: 14, resize: "vertical", fontFamily: "inherit" }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                            <button onClick={() => posalji()} disabled={busy || !unos.trim()} style={{ ...btn, background: "#1d4ed8", color: "#fff", minWidth: 110, opacity: busy || !unos.trim() ? .5 : 1 }}>
                                Pošalji
                            </button>
                            <label style={{ ...btn, background: "#f1f5f9", color: "#334155", border: "1px solid " + LINE, textAlign: "center", fontSize: 12, fontWeight: 700, padding: "8px 10px" }}>
                                Dodaj fajl
                                <input type="file" multiple accept=".pdf,.csv,.txt,image/*" style={{ display: "none" }}
                                    onChange={(e) => { dodajFajlove(e.target.files); e.target.value = ""; }} />
                            </label>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 11 }}>
                        {BRZE.map((q, i) => (
                            <button key={i} onClick={() => posalji(q)} disabled={busy}
                                style={{ ...btn, background: "#f1f5f9", color: "#334155", border: "1px solid " + LINE, fontSize: 12, fontWeight: 700, padding: "7px 11px" }}>
                                {q}
                            </button>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}
