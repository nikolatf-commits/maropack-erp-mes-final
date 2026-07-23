import React, { useEffect, useRef, useState } from "react";
import { pokreniAgenta, potvrdiPlan } from "../services/aiAgentLLM.js";

// ─────────────────────────────────────────────────────────────────────────────
//  AI POMOĆ — mali plutajući panel koji se ubacuje u bilo koji ekran.
//
//  Upotreba (jedna linija u ekranu):
//     <AIPomoc ekran="Kalkulacija folije" kontekst={() => ({ sirina, marza, ... })} />
//
//  `kontekst` je funkcija — poziva se TEK kad korisnik otvori panel, pa uvek
//  šalje trenutno stanje ekrana, a ne ono od pre.
//  Sve što menja bazu i ovde traži potvrdu, isto kao u Command Center-u.
// ─────────────────────────────────────────────────────────────────────────────

const INK = "#0f172a", MUT = "#64748b", LINE = "#e2e8f0", PLAVA = "#1d4ed8";
const btn = { border: 0, borderRadius: 10, padding: "9px 13px", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit" };

function opisKonteksta(ekran, k) {
    if (!k) return "Korisnik je na ekranu: " + ekran + ".";
    let telo;
    try { telo = typeof k === "string" ? k : JSON.stringify(k, null, 1); } catch (e) { telo = String(k); }
    if (telo.length > 6000) telo = telo.slice(0, 6000) + "…";
    return "Korisnik je na ekranu „" + ekran + "”. Trenutno stanje tog ekrana:\n" + telo +
        "\n\nOdgovaraj u vezi sa ovim što je pred njim. Ako nešto nije popunjeno, reci šta fali.";
}

// ── Lagano formatiranje odgovora: podebljano, naslovi, liste, tabele ─────────
function Formatirano({ tekst }) {
    const linije = String(tekst || "").split("\n");
    const delovi = [];
    let i = 0;
    const jak = (t, kljuc) => {
        const komadi = String(t).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
        return komadi.map((c, k) => {
            if (c.startsWith("**") && c.endsWith("**")) return <b key={k}>{c.slice(2, -2)}</b>;
            if (c.startsWith("`") && c.endsWith("`")) return <code key={k} style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4, fontSize: "0.92em" }}>{c.slice(1, -1)}</code>;
            return <span key={k}>{c}</span>;
        });
    };
    while (i < linije.length) {
        const l = linije[i];
        // tabela
        if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < linije.length && /^\s*\|[\s:|-]+\|\s*$/.test(linije[i + 1])) {
            const zag = l.split("|").slice(1, -1).map((x) => x.trim());
            i += 2;
            const redovi = [];
            while (i < linije.length && /^\s*\|.*\|\s*$/.test(linije[i])) {
                redovi.push(linije[i].split("|").slice(1, -1).map((x) => x.trim()));
                i++;
            }
            delovi.push(
                <div key={delovi.length} style={{ overflowX: "auto", margin: "8px 0" }}>
                    <table style={{ borderCollapse: "collapse", fontSize: "0.92em", width: "100%" }}>
                        <thead><tr>{zag.map((h, k) => <th key={k} style={{ textAlign: "left", padding: "6px 9px", borderBottom: "2px solid #cbd5e1", color: "#475569", whiteSpace: "nowrap" }}>{jak(h)}</th>)}</tr></thead>
                        <tbody>{redovi.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} style={{ padding: "5px 9px", borderBottom: "1px solid #e2e8f0" }}>{jak(c)}</td>)}</tr>)}</tbody>
                    </table>
                </div>
            );
            continue;
        }
        // naslov
        const n = l.match(/^(#{1,4})\s+(.*)$/);
        if (n) { delovi.push(<div key={delovi.length} style={{ fontWeight: 800, fontSize: "1.05em", margin: "10px 0 4px" }}>{jak(n[2])}</div>); i++; continue; }
        // crta
        if (/^\s*---+\s*$/.test(l)) { delovi.push(<hr key={delovi.length} style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "10px 0" }} />); i++; continue; }
        // lista
        if (/^\s*[-•]\s+/.test(l)) {
            const st = [];
            while (i < linije.length && /^\s*[-•]\s+/.test(linije[i])) { st.push(linije[i].replace(/^\s*[-•]\s+/, "")); i++; }
            delovi.push(<ul key={delovi.length} style={{ margin: "5px 0", paddingLeft: 20 }}>{st.map((x, k) => <li key={k} style={{ marginBottom: 2 }}>{jak(x)}</li>)}</ul>);
            continue;
        }
        // običan red
        delovi.push(<div key={delovi.length} style={{ minHeight: l.trim() ? undefined : "0.6em" }}>{jak(l)}</div>);
        i++;
    }
    return <div>{delovi}</div>;
}

export default function AIPomoc({ ekran = "Aplikacija", kontekst = null, naslov = "Pitaj AI" }) {
    const [otvoren, setOtvoren] = useState(false);
    const [poruke, setPoruke] = useState([]);
    const [unos, setUnos] = useState("");
    const [busy, setBusy] = useState(false);
    const [korak, setKorak] = useState("");
    const [prilozi, setPrilozi] = useState([]);
    const [plan, setPlan] = useState([]);
    const [istorija, setIstorija] = useState([]);
    const [greska, setGreska] = useState("");
    const dno = useRef(null);

    useEffect(() => { if (otvoren) dno.current?.scrollIntoView({ behavior: "smooth" }); }, [poruke, plan, busy, otvoren]);

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
        try { setPrilozi((p) => [...p, ...(await Promise.all(lista.map(citajFajl)))]); }
        catch (e) { setGreska(e.message || String(e)); }
    }

    function uzmiKontekst() {
        try { return typeof kontekst === "function" ? kontekst() : kontekst; }
        catch (e) { return null; }
    }

    async function posalji(tekst) {
        const q = (tekst || unos).trim();
        if (!q || busy) return;
        setUnos(""); setGreska(""); setPlan([]);
        const opisP = prilozi.length ? "\n\n[priloženo: " + prilozi.map((f) => f.naziv).join(", ") + "]" : "";
        setPoruke((p) => [...p, { od: "ja", tekst: q + opisP }]);
        setBusy(true);
        try {
            // Kontekst ekrana ide samo uz PRVO pitanje — dalje ga model već zna iz razgovora.
            const pitanje = istorija.length ? q : opisKonteksta(ekran, uzmiKontekst()) + "\n\nPITANJE: " + q;
            const r = await pokreniAgenta(pitanje, istorija, prilozi, setKorak);
            setPrilozi([]);
            setPoruke((p) => [...p, { od: "ai", tekst: r.odgovor, koraci: r.koraci }]);
            setIstorija(r.messages || []);
            if (r.plan?.length) setPlan(r.plan);
        } catch (e) {
            setGreska(e.message || String(e));
        } finally { setBusy(false); setKorak(""); }
    }

    async function izvrsi() {
        setBusy(true); setGreska("");
        try {
            const r = await potvrdiPlan(plan, istorija);
            setPoruke((p) => [...p, { od: "ai", tekst: r.izvrseno.map((x) => (x.ok ? "✓ " : "✗ ") + x.poruka).join("\n") + (r.zakljucak ? "\n\n" + r.zakljucak : "") }]);
            setPlan([]);
            try { window.dispatchEvent(new CustomEvent("maropack:nalozi-changed")); } catch (e) { }
        } catch (e) { setGreska(e.message || String(e)); }
        finally { setBusy(false); }
    }

    if (!otvoren) {
        return (
            <button onClick={() => setOtvoren(true)} title={naslov}
                style={{
                    position: "fixed", right: 22, bottom: 22, zIndex: 9998,
                    background: "linear-gradient(135deg,#020617,#1d4ed8)", color: "#fff",
                    border: 0, borderRadius: 999, padding: "13px 20px", fontWeight: 800, fontSize: 14,
                    cursor: "pointer", boxShadow: "0 10px 28px rgba(29,78,216,.35)", fontFamily: "inherit",
                }}>
                {naslov}
            </button>
        );
    }

    return (
        <div style={{
            position: "fixed", right: 0, top: 0, bottom: 0, width: "min(460px, 100vw)", zIndex: 9999,
            background: "#fff", borderLeft: "1px solid " + LINE, boxShadow: "-12px 0 32px rgba(15,23,42,.12)",
            display: "flex", flexDirection: "column", fontFamily: "inherit",
        }}>
            <div style={{ background: "linear-gradient(135deg,#020617,#1d4ed8)", color: "#fff", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>AI pomoć</div>
                    <div style={{ fontSize: 11.5, color: "#dbeafe" }}>{ekran} · vidi šta je na ekranu</div>
                </div>
                <button onClick={() => setOtvoren(false)} style={{ ...btn, background: "rgba(255,255,255,.15)", color: "#fff", padding: "7px 12px" }}>Zatvori</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 14, background: "#f8fafc" }}>
                {!poruke.length && (
                    <div style={{ color: MUT, fontSize: 13, lineHeight: 1.6 }}>
                        Pitaj bilo šta u vezi sa ovim ekranom. Vidim šta je trenutno popunjeno.
                        <br /><br />Sve što menja podatke prvo ću ti pokazati na potvrdu.
                    </div>
                )}
                {poruke.map((p, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: p.od === "ja" ? "flex-end" : "flex-start", marginBottom: 11 }}>
                        <div style={{
                            maxWidth: p.od === "ja" ? "85%" : "95%", padding: "10px 13px", borderRadius: 12,
                            fontSize: 13.5, lineHeight: 1.6, whiteSpace: p.od === "ja" ? "pre-wrap" : "normal", wordBreak: "break-word",
                            background: p.od === "ja" ? PLAVA : "#fff", color: p.od === "ja" ? "#fff" : INK,
                            border: p.od === "ja" ? "none" : "1px solid " + LINE,
                        }}>
                            {p.od === "ja" ? p.tekst : <Formatirano tekst={p.tekst} />}
                            {!!(p.koraci && p.koraci.length) && (
                                <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid " + LINE, fontSize: 10.5, color: MUT }}>
                                    Proverio: {p.koraci.map((k) => k.alat).join(" · ")}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {busy && <div style={{ color: MUT, fontSize: 12.5, fontStyle: "italic" }}>{korak || "Agent radi…"}</div>}
                <div ref={dno} />
            </div>

            {plan.length > 0 && (
                <div style={{ background: "#fffbeb", borderTop: "1px solid #fbbf24", padding: 14 }}>
                    <div style={{ fontWeight: 900, color: "#92400e", fontSize: 12, marginBottom: 8 }}>ČEKA POTVRDU — menja podatke</div>
                    {plan.map((s, i) => (
                        <div key={i} style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 9, padding: "9px 11px", fontSize: 13, marginBottom: 6 }}>
                            <b style={{ color: "#b45309", marginRight: 6 }}>{i + 1}.</b>{s.opis}
                        </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                        <button onClick={izvrsi} disabled={busy} style={{ ...btn, background: "#16a34a", color: "#fff", opacity: busy ? .6 : 1 }}>
                            {busy ? "Izvršavam…" : "Potvrdi i izvrši"}
                        </button>
                        <button onClick={() => { setPlan([]); setPoruke((p) => [...p, { od: "ai", tekst: "Otkazano — ništa nije promenjeno." }]); }}
                            disabled={busy} style={{ ...btn, background: "#fff", color: "#b91c1c", border: "1px solid #fecaca" }}>Otkaži</button>
                    </div>
                </div>
            )}

            {greska && <div style={{ background: "#fef2f2", borderTop: "1px solid #fecaca", color: "#b91c1c", padding: "10px 14px", fontSize: 12.5 }}>{greska}</div>}

            <div style={{ borderTop: "1px solid " + LINE, padding: 12, background: "#fff" }}>
                {prilozi.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
                        {prilozi.map((f, i) => (
                            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#eff6ff", border: "1px solid #bfdbfe", color: PLAVA, borderRadius: 8, padding: "4px 9px", fontSize: 11.5, fontWeight: 700 }}>
                                {f.naziv}
                                <button onClick={() => setPrilozi((p) => p.filter((_, k) => k !== i))}
                                    style={{ border: 0, background: "transparent", color: PLAVA, cursor: "pointer", fontWeight: 900, fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                            </span>
                        ))}
                    </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                    <textarea value={unos} onChange={(e) => setUnos(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); posalji(); } }}
                        rows={2} placeholder="Pitaj u vezi sa ovim ekranom…"
                        style={{ flex: 1, border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, fontSize: 13.5, resize: "vertical", fontFamily: "inherit" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button onClick={() => posalji()} disabled={busy || !unos.trim()}
                            style={{ ...btn, background: PLAVA, color: "#fff", opacity: busy || !unos.trim() ? .5 : 1 }}>Pošalji</button>
                        <label style={{ ...btn, background: "#f1f5f9", color: "#334155", border: "1px solid " + LINE, textAlign: "center", fontSize: 11.5, padding: "7px 9px" }}>
                            Dodaj PDF
                            <input type="file" multiple accept=".pdf,.csv,.txt,image/*" style={{ display: "none" }}
                                onChange={(e) => { dodajFajlove(e.target.files); e.target.value = ""; }} />
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
