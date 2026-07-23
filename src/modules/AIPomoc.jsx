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

// ── Dugme za kopiranje odgovora ─────────────────────────────────────────────
function Kopiraj({ tekst }) {
    const [ok, setOk] = React.useState(false);
    return (
        <button
            onClick={() => {
                try {
                    navigator.clipboard.writeText(String(tekst || ""));
                    setOk(true); setTimeout(() => setOk(false), 1600);
                } catch (e) { }
            }}
            title="Kopiraj odgovor"
            style={{ border: "1px solid #e2e8f0", background: ok ? "#dcfce7" : "#fff", color: ok ? "#15803d" : "#64748b", borderRadius: 7, padding: "3px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {ok ? "Kopirano" : "Kopiraj"}
        </button>
    );
}

// ── Dug odgovor se sažima, da tabela od 36 redova ne pojede ceo ekran ───────
function MozdaSazeto({ tekst, granica = 1400 }) {
    const dug = String(tekst || "").length > granica || String(tekst || "").split("\n").length > 22;
    const [ceo, setCeo] = React.useState(false);
    if (!dug || ceo) {
        return (
            <div>
                <Formatirano tekst={tekst} />
                {dug && (
                    <button onClick={() => setCeo(false)}
                        style={{ border: 0, background: "transparent", color: "#1d4ed8", fontWeight: 700, fontSize: 11.5, cursor: "pointer", padding: "6px 0 0", fontFamily: "inherit" }}>
                        Sažmi
                    </button>
                )}
            </div>
        );
    }
    const kratko = String(tekst).split("\n").slice(0, 12).join("\n");
    return (
        <div>
            <div style={{ position: "relative", maxHeight: 300, overflow: "hidden" }}>
                <Formatirano tekst={kratko} />
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 60, background: "linear-gradient(transparent,#fff)" }} />
            </div>
            <button onClick={() => setCeo(true)}
                style={{ border: "1px solid #e2e8f0", background: "#f8fafc", color: "#1d4ed8", fontWeight: 700, fontSize: 11.5, cursor: "pointer", padding: "5px 11px", borderRadius: 8, marginTop: 6, fontFamily: "inherit" }}>
                Prikaži ceo odgovor
            </button>
        </div>
    );
}

// ── Razrađen prikaz onoga što će se upisati (u žutoj kartici) ───────────────
function DetaljiPlana({ stavka }) {
    const [otvoren, setOtvoren] = React.useState(false);
    const u = stavka.ulaz || {};

    // nađi najveći niz u ulazu — to je ono što se masovno upisuje (rolne, matice…)
    let niz = null, imeNiza = "";
    Object.keys(u).forEach((k) => {
        if (Array.isArray(u[k]) && u[k].length && (!niz || u[k].length > niz.length)) { niz = u[k]; imeNiza = k; }
    });

    if (!niz) {
        const parovi = Object.keys(u).filter((k) => u[k] !== null && u[k] !== undefined && u[k] !== "" && typeof u[k] !== "object");
        if (!parovi.length) return null;
        return (
            <div style={{ marginTop: 7 }}>
                <button onClick={() => setOtvoren(!otvoren)} style={{ border: 0, background: "transparent", color: "#b45309", fontWeight: 700, fontSize: 11.5, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                    {otvoren ? "Sakrij detalje" : "Prikaži detalje"}
                </button>
                {otvoren && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#475569", display: "grid", gap: 3 }}>
                        {parovi.map((k) => <div key={k}><b>{k}:</b> {String(u[k])}</div>)}
                    </div>
                )}
            </div>
        );
    }

    const objekti = typeof niz[0] === "object" && niz[0] !== null;
    const kolone = objekti ? Array.from(new Set(niz.flatMap((r) => Object.keys(r)))).filter((k) => niz.some((r) => r[k] !== null && r[k] !== undefined && r[k] !== "")).slice(0, 10) : [];

    return (
        <div style={{ marginTop: 8 }}>
            <button onClick={() => setOtvoren(!otvoren)}
                style={{ border: "1px solid #fbbf24", background: "#fff", color: "#b45309", fontWeight: 800, fontSize: 11.5, cursor: "pointer", padding: "5px 10px", borderRadius: 8, fontFamily: "inherit" }}>
                {otvoren ? "Sakrij spisak" : "Prikaži svih " + niz.length + " (" + imeNiza + ")"}
            </button>
            {otvoren && (
                <div style={{ marginTop: 8, maxHeight: 300, overflow: "auto", border: "1px solid #fde68a", borderRadius: 8, background: "#fff" }}>
                    {objekti ? (
                        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11.5 }}>
                            <thead><tr style={{ position: "sticky", top: 0, background: "#fffbeb" }}>
                                <th style={{ padding: "6px 8px", textAlign: "left", color: "#92400e", borderBottom: "1px solid #fde68a" }}>#</th>
                                {kolone.map((k) => <th key={k} style={{ padding: "6px 8px", textAlign: "left", color: "#92400e", borderBottom: "1px solid #fde68a", whiteSpace: "nowrap" }}>{k}</th>)}
                            </tr></thead>
                            <tbody>
                                {niz.map((r, i) => (
                                    <tr key={i}>
                                        <td style={{ padding: "4px 8px", borderBottom: "1px solid #f8fafc", color: "#94a3b8" }}>{i + 1}</td>
                                        {kolone.map((k) => <td key={k} style={{ padding: "4px 8px", borderBottom: "1px solid #f8fafc", whiteSpace: "nowrap" }}>{r[k] === null || r[k] === undefined ? "" : String(typeof r[k] === "object" ? JSON.stringify(r[k]).slice(0, 40) : r[k])}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ padding: 9, fontSize: 12, display: "grid", gap: 3 }}>
                            {niz.map((x, i) => <div key={i}>{i + 1}. {String(x)}</div>)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
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
    const [siri, setSiri] = useState(false);
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
        try {
            const ucitani = await Promise.all(lista.map(citajFajl));
            setPrilozi((p) => [...p, ...ucitani]);
        } catch (e) { setGreska(e.message || String(e)); }
    }

    // Kratak opis onoga što je pokupljeno sa ekrana — da korisnik zna da agent stvarno vidi.
    function sazetakKonteksta() {
        try {
            const k = typeof kontekst === "function" ? kontekst() : kontekst;
            if (!k || typeof k !== "object") return "";
            const delovi = [];
            if (k.naziv) delovi.push(String(k.naziv));
            if (k.kupac) delovi.push(String(k.kupac));
            if (Array.isArray(k.materijali) && k.materijali.length) delovi.push(k.materijali.length + " sloj/a");
            if (Array.isArray(k.slojevi) && k.slojevi.length) delovi.push(k.slojevi.length + " sloj/a");
            if (k.sirina) delovi.push(k.sirina + " mm");
            if (k.marza) delovi.push("marža " + k.marza + "%");
            return delovi.slice(0, 4).join(" · ");
        } catch (e) { return ""; }
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
                    border: 0, borderRadius: 999, padding: "10px 16px", fontWeight: 800, fontSize: 13,
                    cursor: "pointer", boxShadow: "0 10px 28px rgba(29,78,216,.35)", fontFamily: "inherit",
                }}>
                {naslov}
            </button>
        );
    }

    return (
        <div style={{
            position: "fixed", right: 0, top: 0, bottom: 0, width: siri ? "min(820px, 100vw)" : "min(460px, 100vw)", zIndex: 9999,
            background: "#fff", borderLeft: "1px solid " + LINE, boxShadow: "-12px 0 32px rgba(15,23,42,.12)",
            display: "flex", flexDirection: "column", fontFamily: "inherit",
        }}>
            <div style={{ background: "linear-gradient(135deg,#020617,#1d4ed8)", color: "#fff", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>AI pomoć</div>
                    <div style={{ fontSize: 11.5, color: "#dbeafe" }}>{ekran}{sazetakKonteksta() ? " · vidim: " + sazetakKonteksta() : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                    <button onClick={() => setSiri(!siri)} title={siri ? "Suzi" : "Proširi"}
                        style={{ ...btn, background: "rgba(255,255,255,.15)", color: "#fff", padding: "7px 11px" }}>{siri ? "‹ ›" : "› ‹"}</button>
                    <button onClick={() => setOtvoren(false)} style={{ ...btn, background: "rgba(255,255,255,.15)", color: "#fff", padding: "7px 12px" }}>Zatvori</button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 14, background: "#f8fafc" }}>
                {!poruke.length && (
                    <div>
                        <div style={{ color: MUT, fontSize: 12.5, lineHeight: 1.6, marginBottom: 12 }}>
                            Pitaj u vezi sa ovim ekranom. Sve što menja podatke prvo ti pokažem na potvrdu.
                        </div>
                        <div style={{ display: "grid", gap: 7 }}>
                            {(ekran.indexOf("Kalkulacija") === 0
                                ? ["Je li ova marža realna za ovog kupca?", "Koliko materijala mi treba za ovu količinu?", "Imam li taj materijal na stanju?", "Sačuvaj ovu kalkulaciju"]
                                : ekran.indexOf("Magacin") === 0
                                    ? ["Šta mi je najstarije na stanju?", "Priložiću pakcing listu — pripremi rolne za unos", "Predloži formatiranje za 460 mm", "Ima li spoj rolna za PET//LDPE?"]
                                    : ["Da li mi ova struktura odgovara za masnu hranu?", "Koliko materijala treba za 20.000 m?", "Imam li sve slojeve na stanju?", "Sačuvaj ovaj templejt"]
                            ).map((x) => (
                                <button key={x} onClick={() => posalji(x)} disabled={busy}
                                    style={{ textAlign: "left", background: "#fff", border: "1px solid " + LINE, borderRadius: 9, padding: "9px 11px", fontSize: 12.5, color: "#334155", cursor: "pointer", fontFamily: "inherit" }}>
                                    {x}
                                </button>
                            ))}
                        </div>
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
                            {p.od === "ja" ? p.tekst : <MozdaSazeto tekst={p.tekst} />}
                            {p.od !== "ja" && (
                                <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}><Kopiraj tekst={p.tekst} /></div>
                            )}
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
                            <DetaljiPlana stavka={s} />
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
