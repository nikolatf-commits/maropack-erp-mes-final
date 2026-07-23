import React, { useEffect, useRef, useState } from "react";
import { pokreniAgenta, potvrdiPlan, ucitajMemoriju } from "../services/aiAgentLLM.js";

const INK = "#0f172a", MUT = "#64748b", LINE = "#e2e8f0", PLAVA = "#1d4ed8";
const card = { background: "#fff", border: "1px solid " + LINE, borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,.05)" };
const btn = { border: 0, borderRadius: 11, padding: "11px 16px", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "inherit" };

const BRZE = [
    { t: "Stanje magacina", q: "Šta imam na stanju? Grupiši po materijalu." },
    { t: "Aktivni nalozi", q: "Koji nalozi su aktivni i šta kasni?" },
    { t: "Provera materijala", q: "Proveri da li imam materijal za SPANAC 600 na 5000 m" },
    { t: "Formatiranje", q: "Predloži formatiranje: 20 rolni 460 mm × 3000 m BOPP" },
    { t: "Kalkulacija", q: "Napravi kalkulaciju za BOPP 460 mm, 100µ, 10000 m, sa štampom" },
    { t: "Pakcing lista", q: "Pročitaj priloženu pakcing listu i pripremi rolne za unos" },
    { t: "Potrošnja", q: "Koliko sam potrošio materijala poslednjih 30 dana?" },
    { t: "Šta smo pričali ranije?", q: "Pretraži naše ranije razgovore i podseti me na najvažnije odluke i dogovore" },
];

function preuzmiExcel(d) {
    const red = (niz) => niz.map((c) => {
        const v = String(c ?? "");
        return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(";");
    const linije = [];
    if (d.naslov) linije.push(red([d.naslov]));
    if (d.podnaslov) linije.push(red([d.podnaslov]));
    if (d.naslov || d.podnaslov) linije.push("");
    linije.push(red(d.zaglavlja));
    d.redovi.forEach((r) => linije.push(red(r)));
    if (d.zakljucak) { linije.push(""); linije.push(red([d.zakljucak])); }
    // BOM da Excel ispravno prikaže naša slova
    const blob = new Blob(["\uFEFF" + linije.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (d.naslov || "dokument").replace(/[^\w\u00C0-\u024F -]/g, "").trim().slice(0, 60) + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function stampajPdf(d) {
    const esc = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const html = '<!DOCTYPE html><html lang="sr"><head><meta charset="utf-8"><title>' + esc(d.naslov) + '</title><style>' +
        'body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;padding:32px;max-width:900px;margin:0 auto}' +
        'h1{font-size:22px;margin:0 0 4px}.pod{color:#64748b;font-size:13px;margin-bottom:18px}' +
        'table{border-collapse:collapse;width:100%;font-size:12.5px}' +
        'th{text-align:left;background:#f1f5f9;padding:8px;border-bottom:2px solid #cbd5e1;font-weight:700}' +
        'td{padding:7px 8px;border-bottom:1px solid #e2e8f0}' +
        '.zak{margin-top:18px;padding-top:12px;border-top:2px solid #cbd5e1;font-size:13px;white-space:pre-wrap}' +
        '.fus{margin-top:28px;color:#94a3b8;font-size:11px}' +
        '@media print{body{padding:0}}</style></head><body>' +
        '<h1>' + esc(d.naslov) + '</h1>' +
        (d.podnaslov ? '<div class="pod">' + esc(d.podnaslov) + '</div>' : '') +
        '<table><thead><tr>' + d.zaglavlja.map((h) => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
        d.redovi.map((r) => '<tr>' + r.map((c) => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') +
        '</tbody></table>' +
        (d.zakljucak ? '<div class="zak">' + esc(d.zakljucak) + '</div>' : '') +
        '<div class="fus">MAROPACK d.o.o. · ' + new Date().toLocaleDateString("sr-RS") + '</div>' +
        '<script>window.onload=function(){window.print()}<\/script></body></html>';
    const w = window.open("", "_blank");
    if (!w) { alert("Pregledač je blokirao novi prozor — dozvoli iskačuće prozore pa probaj opet."); return; }
    w.document.write(html); w.document.close();
}

function Dokument({ d }) {
    return (
        <div style={{ marginTop: 11, padding: "11px 13px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 11 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#15803d", marginBottom: 3 }}>{d.naslov}</div>
            {d.podnaslov && <div style={{ fontSize: 11.5, color: "#4d7c5f", marginBottom: 8 }}>{d.podnaslov}</div>}
            <div style={{ fontSize: 11.5, color: MUT, marginBottom: 9 }}>{d.redovi.length} redova · {d.zaglavlja.length} kolona</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => preuzmiExcel(d)} style={{ ...btn, background: "#15803d", color: "#fff", fontSize: 12.5, padding: "8px 13px" }}>Preuzmi Excel</button>
                <button onClick={() => stampajPdf(d)} style={{ ...btn, background: "#fff", color: "#15803d", border: "1px solid #bbf7d0", fontSize: 12.5, padding: "8px 13px" }}>Štampaj / PDF</button>
            </div>
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

function Poruka({ p }) {
    const ja = p.od === "ja";
    return (
        <div style={{ display: "flex", justifyContent: ja ? "flex-end" : "flex-start", marginBottom: 14 }}>
            <div style={{
                maxWidth: ja ? "72%" : "88%",
                padding: "13px 16px", borderRadius: 14,
                fontSize: 14.5, lineHeight: 1.62, whiteSpace: ja ? "pre-wrap" : "normal", wordBreak: "break-word",
                background: ja ? PLAVA : "#fff", color: ja ? "#fff" : INK,
                border: ja ? "none" : "1px solid " + LINE,
                boxShadow: ja ? "none" : "0 1px 3px rgba(15,23,42,.04)",
            }}>
                {p.staro && <div style={{ fontSize: 10.5, fontWeight: 800, color: MUT, marginBottom: 6, letterSpacing: .4 }}>RANIJI RAZGOVOR</div>}
                {ja ? p.tekst : <Formatirano tekst={p.tekst} />}
                {p.dokument && <Dokument d={p.dokument} />}
                {!!(p.koraci && p.koraci.length) && (
                    <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid " + LINE, fontSize: 11.5, color: MUT }}>
                        Proverio: {p.koraci.map((k) => k.alat).join(" · ")}
                    </div>
                )}
            </div>
        </div>
    );
}

function PlanKartica({ plan, busy, onPotvrdi, onOtkazi }) {
    return (
        <div style={{ ...card, borderColor: "#fbbf24", background: "#fffbeb", marginBottom: 14 }}>
            <div style={{ fontWeight: 900, color: "#92400e", fontSize: 13, marginBottom: 11, letterSpacing: .3 }}>
                ČEKA TVOJU POTVRDU — ovo menja podatke
            </div>
            <div style={{ display: "grid", gap: 8, marginBottom: 15 }}>
                {plan.map((s, i) => (
                    <div key={i} style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 10, padding: "11px 14px", fontSize: 14, color: INK, lineHeight: 1.5 }}>
                        <b style={{ color: "#b45309", marginRight: 8 }}>{i + 1}.</b>{s.opis}
                            <DetaljiPlana stavka={s} />
                    </div>
                ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
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
    const POZDRAV = {
        od: "ai",
        tekst: "Zdravo. Reci mi šta treba.\n\nMogu da proverim magacin i templejte, izračunam kalkulaciju, predložim formatiranje, pročitam pakcing listu i unesem rolne, otvorim nalog ili rezervišem materijal. Pitaj me i struku — strukture, debljine, varenje, barijere.\n\nSve što menja podatke prvo ti pokažem na potvrdu.",
    };
    const [poruke, setPoruke] = useState([POZDRAV]);
    const [unos, setUnos] = useState("");
    const [busy, setBusy] = useState(false);
    const [korak, setKorak] = useState("");
    const [plan, setPlan] = useState([]);
    const [istorija, setIstorija] = useState([]);
    const [greska, setGreska] = useState("");
    const [prilozi, setPrilozi] = useState([]);
    const [memorija, setMemorija] = useState(0);
    const dno = useRef(null);

    useEffect(() => { dno.current?.scrollIntoView({ behavior: "smooth" }); }, [poruke, plan, busy]);

    // Učitaj poslednje razgovore (AI memorija) pri otvaranju
    useEffect(() => {
        let zivo = true;
        ucitajMemoriju(6).then((redovi) => {
            if (!zivo || !redovi.length) return;
            setMemorija(redovi.length);
            const stare = [];
            redovi.forEach((r) => {
                if (r.pitanje) stare.push({ od: "ja", tekst: r.pitanje, staro: true });
                if (r.odgovor) stare.push({ od: "ai", tekst: r.odgovor, staro: true });
            });
            setPoruke([...stare, POZDRAV]);
        });
        return () => { zivo = false; };
        // eslint-disable-next-line
    }, []);

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
            const r = await pokreniAgenta(q, istorija, prilozi, setKorak);
            setPrilozi([]);
            setPoruke((p) => [...p, { od: "ai", tekst: r.odgovor, koraci: r.koraci, dokument: r.dokument }]);
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
            const rez = r.izvrseno.map((x) => (x.ok ? "✓ " : "✗ ") + x.poruka).join("\n");
            setPoruke((p) => [...p, { od: "ai", tekst: rez + (r.zakljucak ? "\n\n" + r.zakljucak : "") }]);
            setPlan([]);
            try { window.dispatchEvent(new CustomEvent("maropack:nalozi-changed")); } catch (e) { }
        } catch (e) {
            setGreska(e.message || String(e));
        } finally { setBusy(false); setKorak(""); }
    }

    return (
        <div style={{ padding: "18px 16px 26px", background: "#f1f5f9", minHeight: "100vh" }}>
            <div style={{ maxWidth: 1460, margin: "0 auto" }}>

                <div style={{ background: "linear-gradient(135deg,#0f172a,#1d4ed8)", borderRadius: 16, padding: "22px 26px", marginBottom: 16, boxShadow: "0 8px 24px rgba(15,23,42,.12)" }}>
                    <h1 style={{ fontSize: 25, margin: "0 0 6px", color: "#ffffff", fontWeight: 800, letterSpacing: -.2 }}>
                        AI Agent Command Center
                    </h1>
                    <p style={{ margin: 0, color: "#c7d7fb", fontSize: 14, lineHeight: 1.5 }}>
                        Povezan sa templejtima, magacinom, nalozima, kalkulacijama i analizama. Izmene traže tvoju potvrdu.
                        {memorija > 0 && <span style={{ marginLeft: 8, color: "#93c5fd" }}>· pamti ranije razgovore</span>}
                    </p>
                </div>

                <div style={{ ...card, minHeight: 520, maxHeight: "66vh", overflowY: "auto", background: "#f8fafc", marginBottom: 14, padding: 20 }}>
                    {poruke.map((p, i) => <Poruka key={i} p={p} />)}
                    {busy && (
                        <div style={{ display: "flex", alignItems: "center", gap: 9, color: MUT, fontSize: 13.5, fontStyle: "italic", padding: "6px 2px" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: PLAVA, display: "inline-block" }} />
                            {korak || "Agent radi…"}
                        </div>
                    )}
                    <div ref={dno} />
                </div>

                {plan.length > 0 && <PlanKartica plan={plan} busy={busy} onPotvrdi={izvrsi} onOtkazi={() => { setPlan([]); setPoruke((p) => [...p, { od: "ai", tekst: "Otkazano — ništa nije promenjeno." }]); }} />}

                {greska && (
                    <div style={{ ...card, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c", marginBottom: 14, fontSize: 14, lineHeight: 1.55 }}>
                        <b>Greška:</b> {greska}
                        {/nije podešen|Failed to send|not found|non-2xx|Edge Function/i.test(greska) && (
                            <div style={{ marginTop: 9, color: "#7f1d1d", fontSize: 13 }}>
                                Proveri u Supabase → Edge Functions da funkcija <b>smart-service</b> postoji i da je u <b>Secrets</b> dodat ključ <b>ANTHROPIC_API_KEY</b>.
                                <br />Ako se funkcija zove drugačije, promeni <code>FUNKCIJA</code> na vrhu fajla <code>aiAgentLLM.js</code>.
                            </div>
                        )}
                    </div>
                )}

                <div style={card}>
                    {prilozi.length > 0 && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                            {prilozi.map((f, i) => (
                                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#eff6ff", border: "1px solid #bfdbfe", color: PLAVA, borderRadius: 10, padding: "7px 12px", fontSize: 12.5, fontWeight: 700 }}>
                                    {f.naziv}
                                    <button onClick={() => setPrilozi((p) => p.filter((_, k) => k !== i))}
                                        style={{ border: 0, background: "transparent", color: PLAVA, cursor: "pointer", fontWeight: 900, fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
                                </span>
                            ))}
                        </div>
                    )}

                    <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                        <textarea
                            value={unos} onChange={(e) => setUnos(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); posalji(); } }}
                            rows={3}
                            placeholder="Npr: proveri materijal za SPANAC 600 na 5000 m i otvori nalog za La Linea…"
                            style={{
                                flex: 1, border: "1px solid #cbd5e1", borderRadius: 12, padding: "13px 15px",
                                fontSize: 14.5, lineHeight: 1.5, resize: "vertical", fontFamily: "inherit", color: INK, minHeight: 76,
                            }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 132 }}>
                            <button onClick={() => posalji()} disabled={busy || !unos.trim()}
                                style={{ ...btn, background: PLAVA, color: "#fff", flex: 1, opacity: busy || !unos.trim() ? .45 : 1 }}>
                                Pošalji
                            </button>
                            <label style={{ ...btn, background: "#f1f5f9", color: "#334155", border: "1px solid " + LINE, textAlign: "center", fontSize: 13, padding: "10px 12px" }}>
                                Dodaj fajl
                                <input type="file" multiple accept=".pdf,.csv,.txt,image/*" style={{ display: "none" }}
                                    onChange={(e) => { dodajFajlove(e.target.files); e.target.value = ""; }} />
                            </label>
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                        {BRZE.map((b, i) => (
                            <button key={i} onClick={() => posalji(b.q)} disabled={busy} title={b.q}
                                style={{ ...btn, background: "#f8fafc", color: "#475569", border: "1px solid " + LINE, fontSize: 12.5, fontWeight: 600, padding: "8px 13px" }}>
                                {b.t}
                            </button>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}
