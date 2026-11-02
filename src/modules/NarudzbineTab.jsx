import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase.js";

// Kartica NARUDŽBINA (poručivanje) u magacinu — unos šta je poručeno,
// nedelja kad stiže, čekiranje „stiglo" (ko/kad) i napomena. Nezavisno od stanja.
// Vrsta / pod-vrsta / oznaka / debljina / proizvođač se biraju iz padajuće liste
// (iz baze materijala — material_master), sa opcijom „ručni unos".
const PRAZNA = { vrsta: "", pod_vrsta: "", oznaka: "", debljina: "", sirina: "", proizvodjac: "", poruceno: "", cena: "", paritet: "", nedelja: "", napomena: "" };
// Paritet isporuke (Incoterms) — predlozi u padajućoj listi, ali može i ručni unos.
const PARITETI = ["EXW", "FCA", "FOB", "CPT", "CIP", "CFR", "CIF", "DAP", "DPU", "DDP"];

// ── Delimične isporuke (prispeća) — sve u KG ──
// Prvi broj iz „Poručeno" je ciljana kg (tačke/razmaci = hiljade, zarez = decimala).
function brojKg(s) {
    const m = String(s || "").match(/[\d.,\s]*\d/);
    if (!m) return 0;
    const t = m[0].replace(/[.\s]/g, "").replace(",", ".");
    const v = Number(t);
    return isNaN(v) ? 0 : v;
}
function listaPrispeca(n) {
    let p = n && n.prispeca;
    if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) { p = null; } }
    return Array.isArray(p) ? p : [];
}
function zbirKg(n) { return listaPrispeca(n).reduce((a, x) => a + (Number(x.kg) || 0), 0); }
function jePuno(n) { const c = brojKg(n && n.poruceno); return !!(n && n.stiglo) || (c > 0 && zbirKg(n) >= c); }
const fmtKg = (v) => Math.round(Number(v) || 0).toLocaleString("sr-RS") + " kg";
const RUCNO = "__RUCNO__";

// textarea koji se sam širi po tekstu
function AutoTextarea({ value, onChange, placeholder, style }) {
    const ref = React.useRef(null);
    const resize = () => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = Math.max(40, el.scrollHeight) + "px"; } };
    React.useEffect(() => { resize(); }, [value]);
    return <textarea ref={ref} value={value} placeholder={placeholder} onInput={resize}
        onChange={(e) => { onChange(e); resize(); }}
        style={{ ...style, overflow: "hidden", resize: "none" }} />;
}

const danasStr = () => new Date().toLocaleDateString("sr-RS");
const fmtTs = (ts) => { try { return ts ? new Date(ts).toLocaleDateString("sr-RS") : ""; } catch (e) { return ts || ""; } };

// jedinstvene vrednosti polja iz liste redova
function uniq(rows, field, filterFn) {
    const set = new Map();
    (Array.isArray(rows) ? rows : []).forEach((r) => {
        if (filterFn && !filterFn(r)) return;
        const v = r && r[field];
        if (v === null || v === undefined) return;
        const s = String(v).trim();
        if (s === "") return;
        if (!set.has(s)) set.set(s, s);
    });
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b, "sr", { numeric: true }));
}

export default function NarudzbineTab({ operater, msg, materialMaster = [] }) {
    // Kad se otvori kao zasebna stranica (bez prosleđenog materialMaster),
    // sam učita bazu materijala da bi padajuće liste radile.
    const [selfMaster, setSelfMaster] = useState([]);
    const mm = (materialMaster && materialMaster.length) ? materialMaster : selfMaster;
    useEffect(() => {
        if (materialMaster && materialMaster.length) return;
        (async () => {
            try {
                const { data, error } = await supabase.from("material_master").select("*").order("vrsta", { ascending: true });
                if (!error && data) setSelfMaster(data.filter((x) => x.aktivan !== false));
            } catch (e) { }
        })();
        // eslint-disable-next-line
    }, []);
    const [lista, setLista] = useState([]);
    const [form, setForm] = useState(PRAZNA);
    const [rucno, setRucno] = useState({});        // koja su polja u režimu ručnog unosa
    const [filter, setFilter] = useState("sve");   // sve | ceka | stiglo
    const [q, setQ] = useState("");
    const [napDraft, setNapDraft] = useState({});
    const [nedDraft, setNedDraft] = useState({});
    const [prispDraft, setPrispDraft] = useState({});   // {id: {kg, datum, napomena}}
    const [loading, setLoading] = useState(true);
    const [cuva, setCuva] = useState(false);
    const warnedRef = React.useRef(false);

    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    // ── kaskadne opcije iz baze materijala (prop ili samostalno učitano) ──
    const optVrste = useMemo(() => uniq(mm, "vrsta"), [mm]);
    const optPodVrste = useMemo(() => uniq(mm, "pod_vrsta", (r) => !form.vrsta || String(r.vrsta || "").trim() === form.vrsta), [mm, form.vrsta]);
    const optOznake = useMemo(() => uniq(mm, "oznaka", (r) => (!form.vrsta || String(r.vrsta || "").trim() === form.vrsta) && (!form.pod_vrsta || String(r.pod_vrsta || "").trim() === form.pod_vrsta)), [mm, form.vrsta, form.pod_vrsta]);
    const optDebljine = useMemo(() => uniq(mm, "debljina", (r) => (!form.vrsta || String(r.vrsta || "").trim() === form.vrsta) && (!form.pod_vrsta || String(r.pod_vrsta || "").trim() === form.pod_vrsta) && (!form.oznaka || String(r.oznaka || "").trim() === form.oznaka)), [mm, form.vrsta, form.pod_vrsta, form.oznaka]);
    const optProizvodjaci = useMemo(() => uniq(mm, "proizvodjac"), [mm]);
    const imaBazu = (mm || []).length > 0;

    function tabelaFali(error) {
        return error && (error.code === "42P01" || /does not exist|relation|schema cache/i.test(error.message || ""));
    }
    function javiFali() {
        if (!warnedRef.current) { warnedRef.current = true; msg && msg("Tabela „narudzbine“ ne postoji — pusti SQL „narudzbine_setup.sql“ u Supabase SQL Editor.", "err"); }
    }

    async function load() {
        setLoading(true);
        try {
            const { data, error } = await supabase.from("narudzbine").select("*").order("id", { ascending: false });
            if (error) { if (tabelaFali(error)) javiFali(); setLista([]); setLoading(false); return; }
            setLista(data || []);
        } catch (e) { setLista([]); }
        setLoading(false);
    }

    // kad se promeni select — postavi vrednost, ili uđi u ručni režim, i očisti „decu"
    function biraj(key, val) {
        if (val === RUCNO) { setRucno((o) => ({ ...o, [key]: true })); setForm((f) => ({ ...f, [key]: "" })); return; }
        setRucno((o) => ({ ...o, [key]: false }));
        setForm((f) => {
            const n = { ...f, [key]: val };
            if (key === "vrsta") { n.pod_vrsta = ""; n.oznaka = ""; n.debljina = ""; }
            if (key === "pod_vrsta") { n.oznaka = ""; n.debljina = ""; }
            if (key === "oznaka") { n.debljina = ""; }
            return n;
        });
    }
    function vratiListu(key) { setRucno((o) => ({ ...o, [key]: false })); setForm((f) => ({ ...f, [key]: "" })); }

    async function dodaj() {
        if (!form.vrsta.trim() && !form.oznaka.trim()) { msg && msg("Izaberi (ili upiši) bar vrstu ili oznaku materijala.", "err"); return; }
        setCuva(true);
        const red = {
            vrsta: form.vrsta.trim(), pod_vrsta: form.pod_vrsta.trim(), oznaka: form.oznaka.trim(),
            debljina: String(form.debljina).trim(), sirina: form.sirina.trim(), proizvodjac: form.proizvodjac.trim(),
            poruceno: form.poruceno.trim(), cena: form.cena.trim(), paritet: form.paritet.trim(),
            nedelja: form.nedelja.trim(), napomena: form.napomena.trim(),
            stiglo: false, kreirao: operater || "", created_at: new Date().toISOString(),
        };
        try {
            const { data, error } = await supabase.from("narudzbine").insert([red]).select().single();
            if (error) { if (tabelaFali(error)) javiFali(); else msg && msg("Nije sačuvano: " + (error.message || error), "err"); setCuva(false); return; }
            setLista((l) => [data, ...l]);
            setForm(PRAZNA); setRucno({});
            msg && msg("Narudžbina dodata.", "ok");
        } catch (e) { msg && msg("Greška: " + (e.message || e), "err"); }
        setCuva(false);
    }

    async function toggleStiglo(n) {
        const sada = !n.stiglo;
        const patch = sada
            ? { stiglo: true, ko_stiglo: operater || "", stiglo_ts: new Date().toISOString() }
            : { stiglo: false, ko_stiglo: null, stiglo_ts: null };
        setLista((l) => l.map((x) => x.id === n.id ? { ...x, ...patch } : x));   // optimistično
        try {
            const { error } = await supabase.from("narudzbine").update(patch).eq("id", n.id);
            if (error) { msg && msg("Nije sačuvano: " + (error.message || error), "err"); load(); }
        } catch (e) { load(); }
    }

    // Dodaj jedno prispeće (delimičnu isporuku) — sve u kg. Kad zbir dostigne poručeno,
    // automatski označi „Stiglo u celosti" (upiše ko/kada).
    async function dodajPrispece(n) {
        const d = prispDraft[n.id] || {};
        const kg = Number(String(d.kg ?? "").replace(",", ".")) || 0;
        if (kg <= 0) { msg && msg("Unesi količinu prispeća (kg).", "err"); return; }
        const red = { kg, datum: (d.datum || "").trim() || danasStr(), ko: operater || "", napomena: (d.napomena || "").trim(), ts: new Date().toISOString() };
        const nova = [...listaPrispeca(n), red];
        const cilj = brojKg(n.poruceno);
        const zbir = nova.reduce((a, x) => a + (Number(x.kg) || 0), 0);
        const patch = { prispeca: nova };
        if (cilj > 0 && zbir >= cilj && !n.stiglo) { patch.stiglo = true; patch.ko_stiglo = operater || ""; patch.stiglo_ts = new Date().toISOString(); }
        setLista((l) => l.map((x) => x.id === n.id ? { ...x, ...patch } : x));   // optimistično
        setPrispDraft((o) => { const c = { ...o }; delete c[n.id]; return c; });
        try {
            const { error } = await supabase.from("narudzbine").update(patch).eq("id", n.id);
            if (error) { msg && msg("Nije sačuvano: " + (error.message || error), "err"); load(); }
            else msg && msg(patch.stiglo ? "Prispeće dodato — narudžbina je kompletna." : "Prispeće dodato.", "ok");
        } catch (e) { load(); }
    }
    async function obrisiPrispece(n, idx) {
        const nova = listaPrispeca(n).filter((_, i) => i !== idx);
        setLista((l) => l.map((x) => x.id === n.id ? { ...x, prispeca: nova } : x));
        try {
            const { error } = await supabase.from("narudzbine").update({ prispeca: nova }).eq("id", n.id);
            if (error) { msg && msg("Nije sačuvano: " + (error.message || error), "err"); load(); }
        } catch (e) { load(); }
    }

    async function sacuvajNap(n) {
        const tekst = napDraft[n.id] !== undefined ? napDraft[n.id] : (n.napomena || "");
        setLista((l) => l.map((x) => x.id === n.id ? { ...x, napomena: tekst } : x));
        setNapDraft((o) => { const c = { ...o }; delete c[n.id]; return c; });
        try {
            const { error } = await supabase.from("narudzbine").update({ napomena: tekst }).eq("id", n.id);
            if (error) msg && msg("Napomena nije sačuvana: " + (error.message || error), "err");
            else msg && msg("Napomena sačuvana.", "ok");
        } catch (e) { }
    }

    async function sacuvajNedelju(n) {
        const tekst = nedDraft[n.id] !== undefined ? nedDraft[n.id] : (n.nedelja || "");
        setLista((l) => l.map((x) => x.id === n.id ? { ...x, nedelja: tekst } : x));
        setNedDraft((o) => { const c = { ...o }; delete c[n.id]; return c; });
        try {
            const { error } = await supabase.from("narudzbine").update({ nedelja: tekst }).eq("id", n.id);
            if (error) msg && msg("Nedelja nije sačuvana: " + (error.message || error), "err");
            else msg && msg("Nedelja (KW) sačuvana.", "ok");
        } catch (e) { }
    }

    async function obrisi(n) {
        if (!window.confirm("Obrisati narudžbinu?")) return;
        setLista((l) => l.filter((x) => x.id !== n.id));
        try { await supabase.from("narudzbine").delete().eq("id", n.id); } catch (e) { }
    }

    const vidljive = lista.filter((n) => {
        if (filter === "ceka" && jePuno(n)) return false;
        if (filter === "stiglo" && !jePuno(n)) return false;
        if (q.trim()) {
            const t = [n.vrsta, n.pod_vrsta, n.oznaka, n.debljina, n.sirina, n.proizvodjac, n.poruceno, n.cena, n.paritet, n.nedelja].map((x) => x || "").join(" ").toLowerCase();
            if (!t.includes(q.toLowerCase())) return false;
        }
        return true;
    });
    const brojCeka = lista.filter((n) => !jePuno(n)).length;

    // ── stilovi ──
    const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, boxShadow: "0 6px 16px rgba(15,23,42,.05)", overflow: "hidden" };
    const lab = { display: "block", fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 3 };
    const inp = { width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };
    const sel = { ...inp, background: "#fff", appearance: "auto", cursor: "pointer" };
    const fbtn = (on) => ({ border: on ? "1px solid #1d4ed8" : "1px solid #e2e8f0", borderRadius: 999, padding: "6px 14px", fontWeight: 800, fontSize: 12.5, background: on ? "#1d4ed8" : "#fff", color: on ? "#fff" : "#334155", cursor: "pointer" });
    const chip = (bg, c) => ({ background: bg, color: c, padding: "4px 10px", borderRadius: 999, fontWeight: 800, fontSize: 11.5, whiteSpace: "nowrap", display: "inline-block" });

    // tekstualno polje
    const F = (key, label, ph) => (
        <div>
            <label style={lab}>{label}</label>
            <input style={inp} value={form[key]} placeholder={ph} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
        </div>
    );

    // padajuća lista (sa „ručni unos") — options su string[]
    const S = (key, label, options, ph) => {
        const uRucno = !!rucno[key];
        const vrednostNijeUListi = form[key] && !options.includes(form[key]);
        if (uRucno || (vrednostNijeUListi && !imaBazu)) {
            return (
                <div>
                    <label style={lab}>{label}</label>
                    <div style={{ display: "flex", gap: 6 }}>
                        <input style={inp} value={form[key]} placeholder={ph} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
                        {imaBazu && <button type="button" onClick={() => vratiListu(key)} title="Nazad na listu" style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#f8fafc", color: "#334155", fontWeight: 900, padding: "0 10px", cursor: "pointer" }}>≡</button>}
                    </div>
                </div>
            );
        }
        return (
            <div>
                <label style={lab}>{label}</label>
                <select style={sel} value={form[key]} onChange={(e) => biraj(key, e.target.value)}>
                    <option value="">{imaBazu ? "— izaberi —" : "— nema baze —"}</option>
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                    {vrednostNijeUListi && <option value={form[key]}>{form[key]}</option>}
                    <option value={RUCNO}>✏️ ručni unos…</option>
                </select>
            </div>
        );
    };

    return (
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 950 }}>📦 Narudžbine (poručivanje)</h2>
                {brojCeka > 0 && <span style={chip("#fef3c7", "#854d0e")}>⏳ {brojCeka} čeka</span>}
            </div>
            <div style={{ fontSize: 12.5, color: "#64748b", fontWeight: 700, marginBottom: 14 }}>Unesi šta je poručeno, kada stiže (nedelja) i čekiraj kad stigne. Nezavisno od stanja u magacinu.</div>

            {/* NOVA NARUDŽBINA */}
            <div style={{ ...card, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#0f766e", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 10 }}>➕ Nova narudžbina</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                    {S("vrsta", "Vrsta", optVrste, "upiši vrstu")}
                    {S("pod_vrsta", "Pod-vrsta", optPodVrste, "upiši pod-vrstu")}
                    {S("oznaka", "Oznaka", optOznake, "upiši oznaku")}
                    {S("debljina", "Debljina (µm)", optDebljine, "npr. 20")}
                    {F("sirina", "Širina (mm)", "npr. 680")}
                    {S("proizvodjac", "Proizvođač", optProizvodjaci, "upiši proizvođača")}
                    {F("poruceno", "Poručeno (kg)", "npr. 5000 (kg)")}
                    {F("cena", "Cena", "npr. 2,40 €/kg")}
                    <div>
                        <label style={lab}>Paritet</label>
                        <input style={inp} list="nar-pariteti" value={form.paritet} placeholder="npr. FCA / DAP" onChange={(e) => setForm((f) => ({ ...f, paritet: e.target.value }))} />
                        <datalist id="nar-pariteti">{PARITETI.map((p) => <option key={p} value={p} />)}</datalist>
                    </div>
                    {F("nedelja", "Stiže (nedelja)", "npr. KW 48 / 48. nedelja")}
                    {F("napomena", "Napomena", "npr. avansno plaćeno")}
                </div>
                {!imaBazu && <div style={{ fontSize: 11.5, color: "#b45309", marginTop: 8, fontWeight: 700 }}>ℹ️ Baza materijala (material_master) je prazna — polja se upisuju ručno.</div>}
                <button onClick={dodaj} disabled={cuva} style={{ marginTop: 12, background: cuva ? "#94a3b8" : "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff", border: "none", borderRadius: 10, padding: "11px 18px", fontWeight: 900, fontSize: 13, cursor: cuva ? "default" : "pointer" }}>💾 Sačuvaj narudžbinu</button>
            </div>

            {/* FILTERI + PRETRAGA */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                <button onClick={() => setFilter("sve")} style={fbtn(filter === "sve")}>Sve ({lista.length})</button>
                <button onClick={() => setFilter("ceka")} style={fbtn(filter === "ceka")}>⏳ Čeka se ({brojCeka})</button>
                <button onClick={() => setFilter("stiglo")} style={fbtn(filter === "stiglo")}>✅ Stiglo ({lista.length - brojCeka})</button>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pretraga..." style={{ ...inp, maxWidth: 220, marginLeft: "auto" }} />
            </div>

            {loading ? <div style={{ color: "#94a3b8", padding: 20 }}>⏳ Učitavam…</div> : (
                vidljive.length === 0
                    ? <div style={{ ...card, padding: 24, textAlign: "center", color: "#94a3b8", fontWeight: 700 }}>Nema narudžbina.</div>
                    : <div style={{ display: "grid", gap: 12 }}>
                        {vidljive.map((n) => {
                            const matLinija = [n.vrsta, n.oznaka, n.debljina ? n.debljina + "µ" : "", n.sirina ? n.sirina + " mm" : ""].filter(Boolean).join(" · ");
                            const sub = [n.pod_vrsta, n.proizvodjac].filter(Boolean).join(" · ");
                            const draftVal = napDraft[n.id] !== undefined ? napDraft[n.id] : (n.napomena || "");
                            const napIzmenjen = napDraft[n.id] !== undefined && napDraft[n.id] !== (n.napomena || "");
                            const nedVal = nedDraft[n.id] !== undefined ? nedDraft[n.id] : (n.nedelja || "");
                            const nedIzmenjen = nedDraft[n.id] !== undefined && nedDraft[n.id] !== (n.nedelja || "");
                            const prispeca = listaPrispeca(n);
                            const stigloKg = zbirKg(n);
                            const ciljKg = brojKg(n.poruceno);
                            const puno = jePuno(n);
                            const pct = ciljKg > 0 ? Math.min(100, Math.round(stigloKg / ciljKg * 100)) : null;
                            const preostalo = ciljKg > 0 ? Math.max(0, ciljKg - stigloKg) : 0;
                            const pd = prispDraft[n.id] || {};
                            const accent = puno ? "linear-gradient(90deg,#22c55e,#16a34a)" : (stigloKg > 0 ? "linear-gradient(90deg,#3b82f6,#2563eb)" : "linear-gradient(90deg,#f59e0b,#d97706)");
                            const inpP = { padding: "7px 9px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 12.5, boxSizing: "border-box" };
                            return (
                                <div key={n.id} style={card}>
                                    <div style={{ height: 5, background: accent }} />
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "12px 14px", flexWrap: "wrap" }}>
                                        <div style={{ flex: 1, minWidth: 200 }}>
                                            <div style={{ fontSize: 15, fontWeight: 900 }}>{matLinija || "—"}</div>
                                            {sub && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{sub}</div>}
                                            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
                                                {n.poruceno && <span style={chip("#eff6ff", "#1d4ed8")}>📦 Poručeno: {n.poruceno}</span>}
                                                {n.cena && <span style={chip("#ecfdf5", "#047857")}>💶 {n.cena}</span>}
                                                {n.paritet && <span style={chip("#f5f3ff", "#6d28d9")}>🚚 {n.paritet}</span>}
                                                {!puno && n.nedelja && <span style={chip("#fef3c7", "#854d0e")}>🗓️ Stiže: {n.nedelja}</span>}
                                                {puno && <span style={chip("#dcfce7", "#166534")}>✅ Stiglo{n.stiglo_ts ? ": " + fmtTs(n.stiglo_ts) : ""}{n.ko_stiglo ? " · " + n.ko_stiglo : ""}</span>}
                                                {!puno && stigloKg > 0 && <span style={chip("#eff6ff", "#1d4ed8")}>📦 Delimično: {fmtKg(stigloKg)}{ciljKg > 0 ? " / " + fmtKg(ciljKg) : ""}</span>}
                                                {(n.kreirao || n.created_at) && <span style={chip("#f1f5f9", "#334155")}>👤 {n.kreirao || "—"}{n.created_at ? " · " + fmtTs(n.created_at) : ""}</span>}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                                            <span style={{ padding: "5px 12px", borderRadius: 999, fontWeight: 900, fontSize: 12, color: "#fff", background: puno ? "linear-gradient(135deg,#22c55e,#16a34a)" : (stigloKg > 0 ? "linear-gradient(135deg,#3b82f6,#2563eb)" : "linear-gradient(135deg,#f59e0b,#d97706)"), whiteSpace: "nowrap" }}>{puno ? "✅ Stiglo" : (stigloKg > 0 ? ("📦 Delimično" + (pct != null ? " · " + pct + "%" : "")) : "⏳ Čeka se")}</span>
                                            <span onClick={() => obrisi(n)} style={{ color: "#ef4444", fontWeight: 900, cursor: "pointer", fontSize: 13 }}>🗑️ Obriši</span>
                                        </div>
                                    </div>

                                    {/* DELIMIČNE ISPORUKE (prispeća) — sve u kg */}
                                    <div style={{ padding: "12px 14px", borderTop: "1px solid #f1f5f9", background: "#fafcff" }}>
                                        {ciljKg > 0 ? (
                                            <>
                                                <div style={{ height: 10, background: "#eef2f6", borderRadius: 999, overflow: "hidden" }}>
                                                    <div style={{ height: "100%", width: pct + "%", background: puno ? "linear-gradient(90deg,#22c55e,#16a34a)" : "linear-gradient(90deg,#3b82f6,#2563eb)", borderRadius: 999 }} />
                                                </div>
                                                <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", margin: "6px 0 10px" }}>{fmtKg(stigloKg)} / {fmtKg(ciljKg)} · {pct}%{preostalo > 0 ? " · preostalo " : ""}{preostalo > 0 ? <b style={{ color: "#b45309" }}>{fmtKg(preostalo)}</b> : null}</div>
                                            </>
                                        ) : (stigloKg > 0 ? <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 10 }}>Stiglo do sada: {fmtKg(stigloKg)}</div> : null)}

                                        {prispeca.length > 0 && (
                                            <div style={{ marginBottom: 8 }}>
                                                <div style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 2 }}>Prispeća ({prispeca.length})</div>
                                                {prispeca.map((p, i) => (
                                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: i ? "1px dashed #e2e8f0" : "none", fontSize: 13 }}>
                                                        <span style={{ fontWeight: 900 }}>{fmtKg(p.kg)}</span>
                                                        <span style={{ color: "#64748b", fontSize: 11.5, marginLeft: "auto", textAlign: "right" }}>{[p.datum, p.ko, p.napomena].filter(Boolean).join(" · ")}</span>
                                                        <span onClick={() => obrisiPrispece(n, i)} style={{ color: "#ef4444", fontWeight: 900, cursor: "pointer", fontSize: 12 }}>🗑️</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {!puno && (
                                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                                <input type="number" value={pd.kg ?? ""} placeholder="količina (kg)" onChange={(e) => setPrispDraft((o) => ({ ...o, [n.id]: { ...(o[n.id] || {}), kg: e.target.value } }))} style={{ ...inpP, width: 130 }} />
                                                <input value={pd.datum ?? ""} placeholder={danasStr()} onChange={(e) => setPrispDraft((o) => ({ ...o, [n.id]: { ...(o[n.id] || {}), datum: e.target.value } }))} style={{ ...inpP, width: 130 }} />
                                                <input value={pd.napomena ?? ""} placeholder="napomena (opc.)" onChange={(e) => setPrispDraft((o) => ({ ...o, [n.id]: { ...(o[n.id] || {}), napomena: e.target.value } }))} style={{ ...inpP, flex: 1, minWidth: 120 }} />
                                                <button onClick={() => dodajPrispece(n)} style={{ border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 900, fontSize: 12.5, color: "#fff", background: "linear-gradient(135deg,#16a34a,#15803d)", cursor: "pointer", whiteSpace: "nowrap" }}>＋ Dodaj prispeće</button>
                                            </div>
                                        )}

                                        <div onClick={() => toggleStiglo(n)} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, cursor: "pointer" }}>
                                            <div style={{ width: 22, height: 22, borderRadius: 6, border: n.stiglo ? "2px solid #16a34a" : "2px solid #cbd5e1", background: n.stiglo ? "#16a34a" : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14 }}>{n.stiglo ? "✓" : ""}</div>
                                            <div style={{ fontWeight: 800, fontSize: 12.5, color: n.stiglo ? "#166534" : "#334155" }}>{n.stiglo ? ("Stiglo u celosti" + (n.stiglo_ts ? " · " + fmtTs(n.stiglo_ts) : "") + (n.ko_stiglo ? " · " + n.ko_stiglo : "")) : "Označi „Stiglo u celosti“"}</div>
                                        </div>
                                    </div>
                                    <div style={{ padding: "10px 14px 2px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                        <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>🗓️ Stiže (nedelja / KW)</span>
                                        <input value={nedVal} placeholder="npr. KW 48 / 48. nedelja" onChange={(e) => setNedDraft((o) => ({ ...o, [n.id]: e.target.value }))} style={{ flex: 1, minWidth: 140, padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", background: "#fffdf5" }} />
                                        <button onClick={() => sacuvajNedelju(n)} disabled={!nedIzmenjen} style={{ border: "none", borderRadius: 8, padding: "8px 12px", fontWeight: 800, fontSize: 12, color: "#fff", background: nedIzmenjen ? "#d97706" : "#cbd5e1", cursor: nedIzmenjen ? "pointer" : "default", whiteSpace: "nowrap" }}>💾 KW</button>
                                    </div>
                                    <div style={{ padding: "8px 14px 12px" }}>
                                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                            <AutoTextarea value={draftVal} onChange={(e) => setNapDraft((o) => ({ ...o, [n.id]: e.target.value }))} placeholder="Napomena / komentar…" style={{ flex: 1, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", background: "#fbfdff", minHeight: 40 }} />
                                            <button onClick={() => sacuvajNap(n)} disabled={!napIzmenjen} style={{ border: "none", borderRadius: 8, padding: "9px 12px", fontWeight: 800, fontSize: 12, color: "#fff", background: napIzmenjen ? "#0d9488" : "#94a3b8", cursor: napIzmenjen ? "pointer" : "default", whiteSpace: "nowrap" }}>💾</button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
            )}
        </div>
    );
}
