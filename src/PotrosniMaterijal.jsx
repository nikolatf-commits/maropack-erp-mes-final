import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmt = (v, d = 0) => num(v).toLocaleString("sr-RS", { minimumFractionDigits: d, maximumFractionDigits: d });

const KATEGORIJE = ["hilzna", "kutija", "paleta", "etiketa", "traka", "ostalo"];
const JEDINICE = ["kom", "m", "kg", "l"];
const KAT_IKONA = { hilzna: "🧵", kutija: "📦", paleta: "🟫", etiketa: "🏷️", traka: "🎞️", ostalo: "🧰" };

const praznoNovo = { naziv: "", kategorija: "hilzna", jedinica: "kom", stanje: "", min_zaliha: "", cena: "", dobavljac: "", dimenzija: "", precnik: "", debljina: "", duzina: "", napomena: "" };

// --- STILOVI (van komponente — da se inputi NE prekreiraju pri svakom kucanju) ---
const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.05)" };
const inp = { width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 15, fontWeight: 600, height: 46 };
const lab = { fontSize: 11, textTransform: "uppercase", fontWeight: 800, color: "#64748b", margin: "0 0 4px", display: "block" };
const th = { textAlign: "left", padding: "9px 10px", fontSize: 10, textTransform: "uppercase", color: "#475569", fontWeight: 800, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" };
const td = { padding: "9px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 600, fontSize: 13 };
const btn = (bg, c) => ({ border: "none", borderRadius: 8, padding: "7px 11px", fontWeight: 800, cursor: "pointer", fontSize: 12.5, background: bg, color: c || "#fff" });
const jeHilzna = (k) => k === "hilzna";

// Polja koja pratimo u istoriji izmena (staro → novo)
const POLJA_IZMENA = [
    { k: "naziv", l: "Naziv" },
    { k: "kategorija", l: "Kategorija" },
    { k: "jedinica", l: "Jedinica" },
    { k: "stanje", l: "Stanje", n: true },
    { k: "min_zaliha", l: "Min. zaliha", n: true },
    { k: "cena", l: "Cena", n: true, suf: " €", d: 2 },
    { k: "dobavljac", l: "Dobavljač" },
    { k: "dimenzija", l: "Dimenzija" },
    { k: "precnik", l: "Prečnik", n: true, suf: " mm" },
    { k: "debljina", l: "Debljina", n: true, suf: " mm" },
    { k: "duzina", l: "Dužina", n: true, suf: " mm" },
    { k: "napomena", l: "Napomena" },
];
function valTxt(p, v) { if (p.n) { return (p.d ? fmt(num(v), p.d) : fmt(num(v))) + (p.suf || ""); } return String(v == null ? "" : v).trim() || "—"; }
// Vrati čitljiv opis izmena: "Cena: 0,70 → 0,75 € · Stanje: 1.000 → 950"
function razlikeIzmene(staro, novo) {
    const out = [];
    POLJA_IZMENA.forEach((p) => {
        const a = staro ? staro[p.k] : undefined, b = novo ? novo[p.k] : undefined;
        const iste = p.n ? (num(a) === num(b)) : (String(a == null ? "" : a).trim() === String(b == null ? "" : b).trim());
        if (!iste) out.push(p.l + ": " + valTxt(p, a) + " → " + valTxt(p, b));
    });
    return out.join(" · ");
}

// Dodatna polja po kategoriji — definisano VAN glavne komponente (da inputi zadrže fokus).
function PoljaExtra({ obj, set }) {
    if (jeHilzna(obj.kategorija)) {
        return (
            <>
                <div><label style={lab}>Prečnik (mm)</label><input style={inp} type="number" value={obj.precnik} onChange={(e) => set({ ...obj, precnik: e.target.value })} placeholder="76 / 152" /></div>
                <div><label style={lab}>Debljina (mm)</label><input style={inp} type="number" value={obj.debljina} onChange={(e) => set({ ...obj, debljina: e.target.value })} placeholder="npr. 6" /></div>
                <div><label style={lab}>Dužina (mm)</label><input style={inp} type="number" value={obj.duzina} onChange={(e) => set({ ...obj, duzina: e.target.value })} placeholder="npr. 500" /></div>
            </>
        );
    }
    return <div style={{ gridColumn: "span 2" }}><label style={lab}>Dimenzija</label><input style={inp} value={obj.dimenzija} onChange={(e) => set({ ...obj, dimenzija: e.target.value })} placeholder="npr. 400×300×250" /></div>;
}

export default function PotrosniMaterijal({ msg, korisnik }) {
    const ja = String(korisnik || "").trim() || "—";
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");
    const [katFilter, setKatFilter] = useState("sve");
    const [novo, setNovo] = useState(praznoNovo);
    const [edit, setEdit] = useState(null);
    const [busy, setBusy] = useState(false);
    const [istorija, setIstorija] = useState([]);
    const [showIstorija, setShowIstorija] = useState(false);

    const poruka = (t, tip) => { if (msg) msg(t, tip); else if (tip === "err") alert(t); };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    async function load() {
        setLoading(true);
        try {
            const { data, error } = await supabase.from("potrosni_materijal").select("*").neq("status", "obrisano").order("kategorija").order("naziv");
            if (error) throw error;
            setItems(data || []);
        } catch (e) { poruka("Greška pri učitavanju: " + (e.message || e), "err"); setItems([]); }
        finally { setLoading(false); }
    }

    async function loadIstorija() {
        try {
            const { data, error } = await supabase.from("potrosni_stavke").select("*").order("created_at", { ascending: false }).limit(300);
            if (error) throw error;
            setIstorija(data || []);
        } catch (e) { poruka("Istorija nije učitana: " + (e.message || e), "err"); setIstorija([]); }
    }

    // Upis traga u knjigu (ko/šta/kada + detalji izmene). Best-effort — ne blokira glavnu akciju.
    async function trag(it, status, kolicina, detalji) {
        try {
            await supabase.from("potrosni_stavke").insert([{
                nalog_ref: null, artikal_id: it.id || null, naziv: it.naziv, kategorija: it.kategorija,
                kolicina: num(kolicina), jedinica: it.jedinica, cena: num(it.cena), status, korisnik: ja, detalji: detalji || null,
            }]);
        } catch (e) { /* trag je opcioni */ }
        if (showIstorija) loadIstorija();
    }

    async function dodaj() {
        if (!novo.naziv.trim()) { poruka("Unesi naziv artikla.", "err"); return; }
        setBusy(true);
        try {
            const row = {
                naziv: novo.naziv.trim(), kategorija: novo.kategorija, jedinica: novo.jedinica,
                stanje: num(novo.stanje), min_zaliha: num(novo.min_zaliha), cena: num(novo.cena),
                dobavljac: novo.dobavljac || null, dimenzija: novo.dimenzija || null,
                precnik: num(novo.precnik) || null, debljina: num(novo.debljina) || null, duzina: num(novo.duzina) || null, napomena: novo.napomena || null,
            };
            const { data, error } = await supabase.from("potrosni_materijal").insert([row]).select();
            if (error) throw error;
            const nov = (data && data[0]) || { ...row };
            await trag(nov, "kreiran", nov.stanje, "Početno stanje " + fmt(num(nov.stanje)) + " " + nov.jedinica + (num(nov.cena) ? " · cena " + fmt(num(nov.cena), 2) + " €" : ""));
            setNovo(praznoNovo); poruka("Artikal dodat.");
            load();
        } catch (e) { poruka("Čuvanje nije uspelo: " + (e.message || e), "err"); }
        finally { setBusy(false); }
    }

    async function sacuvajEdit() {
        if (!edit) return;
        setBusy(true);
        try {
            const row = {
                naziv: edit.naziv, kategorija: edit.kategorija, jedinica: edit.jedinica,
                stanje: num(edit.stanje), min_zaliha: num(edit.min_zaliha), cena: num(edit.cena),
                dobavljac: edit.dobavljac || null, dimenzija: edit.dimenzija || null,
                precnik: num(edit.precnik) || null, debljina: num(edit.debljina) || null, duzina: num(edit.duzina) || null, napomena: edit.napomena || null,
                updated_at: new Date().toISOString(),
            };
            const staro = items.find((x) => x.id === edit.id) || {};
            const { error } = await supabase.from("potrosni_materijal").update(row).eq("id", edit.id);
            if (error) throw error;
            const opis = razlikeIzmene(staro, row) || "(bez izmena polja)";
            await trag({ ...staro, ...row }, "izmena", row.stanje, opis);
            setEdit(null); poruka("Sačuvano."); load();
        } catch (e) { poruka("Izmena nije uspela: " + (e.message || e), "err"); }
        finally { setBusy(false); }
    }

    async function promeniStanje(it, delta) {
        const q0 = prompt((delta > 0 ? "ULAZ (+) " : "IZLAZ (−) ") + it.naziv + " — koliko " + it.jedinica + "?", "");
        if (q0 == null) return;
        const kol = Math.abs(num(q0)); if (!kol) return;
        const novoStanje = Math.max(0, num(it.stanje) + delta * kol);
        setBusy(true);
        try {
            const { error } = await supabase.from("potrosni_materijal").update({ stanje: novoStanje, updated_at: new Date().toISOString() }).eq("id", it.id);
            if (error) throw error;
            await trag(it, delta > 0 ? "ulaz" : "izlaz", kol, "Stanje: " + fmt(num(it.stanje)) + " → " + fmt(novoStanje) + " " + it.jedinica + " (" + (delta > 0 ? "+" : "−") + fmt(kol) + ")");
            load();
        } catch (e) { poruka("Promena stanja nije uspela: " + (e.message || e), "err"); }
        finally { setBusy(false); }
    }

    async function obrisi(it) {
        if (!window.confirm("Obrisati artikal „" + it.naziv + "\"?")) return;
        setBusy(true);
        try {
            const { error } = await supabase.from("potrosni_materijal").update({ status: "obrisano" }).eq("id", it.id);
            if (error) throw error;
            await trag(it, "brisanje", it.stanje, "Obrisano (stanje bilo " + fmt(num(it.stanje)) + " " + it.jedinica + ")");
            load();
        } catch (e) { poruka("Brisanje nije uspelo: " + (e.message || e), "err"); }
        finally { setBusy(false); }
    }

    function toggleIstorija() {
        const n = !showIstorija; setShowIstorija(n); if (n) loadIstorija();
    }

    const filtrirani = useMemo(() => {
        let a = items;
        if (katFilter !== "sve") a = a.filter((x) => x.kategorija === katFilter);
        if (q.trim()) { const s = q.toLowerCase(); a = a.filter((x) => [x.naziv, x.dobavljac, x.dimenzija, x.napomena].some((k) => String(k || "").toLowerCase().includes(s))); }
        return a;
    }, [items, katFilter, q]);

    const kpi = useMemo(() => {
        const ispod = items.filter((x) => num(x.min_zaliha) > 0 && num(x.stanje) <= num(x.min_zaliha));
        const vrednost = items.reduce((s, x) => s + num(x.stanje) * num(x.cena), 0);
        return { ukupno: items.length, ispod: ispod.length, vrednost, ispodLista: ispod };
    }, [items]);

    const AKCIJA_LBL = { ulaz: "➕ Ulaz", izlaz: "➖ Izlaz", kreiran: "🆕 Kreiran", izmena: "✎ Izmena", brisanje: "🗑 Brisanje", rezervisano: "📌 Rezervisano", izdato: "📦 Izdato", vraceno: "↩️ Vraćeno" };
    const AKCIJA_BOJA = { ulaz: "#166534", izlaz: "#b91c1c", kreiran: "#1d4ed8", izmena: "#7c3aed", brisanje: "#64748b" };
    const vreme = (t) => { try { return new Date(t).toLocaleString("sr-RS"); } catch (e) { return t || ""; } };

    return (
        <div style={{ maxWidth: 1600, margin: "0 auto", padding: "8px 10px 40px" }}>
            <div style={{ fontSize: 22, fontWeight: 950, marginBottom: 4 }}>🧰 Magacin potrošnog materijala</div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 14 }}>Hilzne, kutije, palete, etikete, traka… — stanje, minimalna zaliha i cena (ulazi u kalkulaciju).</div>

            {/* KPI */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 11, marginBottom: 14 }}>
                <div style={{ ...card }}><div style={lab}>Artikala</div><div style={{ fontSize: 24, fontWeight: 950 }}>{kpi.ukupno}</div></div>
                <div style={{ ...card, background: kpi.ispod ? "#fef2f2" : "#f0fdf4" }}><div style={lab}>Ispod minimalne zalihe</div><div style={{ fontSize: 24, fontWeight: 950, color: kpi.ispod ? "#b91c1c" : "#166534" }}>{kpi.ispod}</div></div>
                <div style={{ ...card, background: "#0f172a" }}><div style={{ ...lab, color: "#94a3b8" }}>Vrednost zaliha</div><div style={{ fontSize: 22, fontWeight: 950, color: "#fff" }}>{fmt(kpi.vrednost, 2)} €</div></div>
                <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "center" }}><button onClick={toggleIstorija} style={{ ...btn(showIstorija ? "#0f172a" : "#eef2ff", showIstorija ? "#fff" : "#3730a3"), fontSize: 14, padding: "12px 16px" }}>📜 Istorija promena</button></div>
            </div>

            {/* UPOZORENJE — za naručiti */}
            {kpi.ispod > 0 && (
                <div style={{ ...card, background: "#fff7ed", border: "1px solid #fed7aa", marginBottom: 14 }}>
                    <div style={{ fontWeight: 900, color: "#9a3412", marginBottom: 6 }}>⚠ Za naručiti ({kpi.ispod})</div>
                    <div>{kpi.ispodLista.map((x) => <span key={x.id} style={{ display: "inline-block", background: "#fff", border: "1px solid #fdba74", color: "#9a3412", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 800, margin: "2px 6px 2px 0" }}>{KAT_IKONA[x.kategorija] || ""} {x.naziv}: {fmt(x.stanje)} {x.jedinica} (min {fmt(x.min_zaliha)})</span>)}</div>
                </div>
            )}

            {/* ISTORIJA */}
            {showIstorija && (
                <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 14 }}>
                    <div style={{ padding: "12px 14px", fontWeight: 900, borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10 }}>📜 Istorija promena <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>(poslednjih 300)</span><button onClick={loadIstorija} style={{ ...btn("#f1f5f9", "#334155"), marginLeft: "auto" }}>↻ Osveži</button></div>
                    <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr>{["Vreme", "Ko", "Akcija", "Artikal", "Šta je menjano", "Količina"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                            <tbody>
                                {istorija.length === 0 ? <tr><td style={td} colSpan={6}>Nema zabeleženih promena.</td></tr> :
                                    istorija.map((r) => (
                                        <tr key={r.id}>
                                            <td style={{ ...td, whiteSpace: "nowrap", color: "#64748b" }}>{vreme(r.created_at)}</td>
                                            <td style={{ ...td, fontWeight: 800 }}>{r.korisnik || "—"}</td>
                                            <td style={{ ...td, fontWeight: 900, color: AKCIJA_BOJA[r.status] || "#334155", whiteSpace: "nowrap" }}>{AKCIJA_LBL[r.status] || r.status}</td>
                                            <td style={td}>{KAT_IKONA[r.kategorija] || ""} {r.naziv || "—"}{r.nalog_ref ? <span style={{ color: "#94a3b8" }}> · {r.nalog_ref}</span> : null}</td>
                                            <td style={{ ...td, color: "#334155", minWidth: 280 }}>{r.detalji || "—"}</td>
                                            <td style={td}>{r.kolicina != null ? fmt(r.kolicina) + " " + (r.jedinica || "") : "—"}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* DODAVANJE */}
            <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>➕ Novi artikal</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
                    <div style={{ gridColumn: "span 2" }}><label style={lab}>Naziv</label><input autoFocus style={inp} value={novo.naziv} onChange={(e) => setNovo({ ...novo, naziv: e.target.value })} placeholder="npr. Hilzna 76mm / Kutija 40×30×25" /></div>
                    <div><label style={lab}>Kategorija</label><select style={inp} value={novo.kategorija} onChange={(e) => setNovo({ ...novo, kategorija: e.target.value })}>{KATEGORIJE.map((k) => <option key={k} value={k}>{KAT_IKONA[k]} {k}</option>)}</select></div>
                    <div><label style={lab}>Jedinica</label><select style={inp} value={novo.jedinica} onChange={(e) => setNovo({ ...novo, jedinica: e.target.value })}>{JEDINICE.map((j) => <option key={j} value={j}>{j}</option>)}</select></div>
                    <PoljaExtra obj={novo} set={setNovo} />
                    <div><label style={lab}>Stanje</label><input style={inp} type="number" value={novo.stanje} onChange={(e) => setNovo({ ...novo, stanje: e.target.value })} placeholder="0" /></div>
                    <div><label style={lab}>Min. zaliha</label><input style={inp} type="number" value={novo.min_zaliha} onChange={(e) => setNovo({ ...novo, min_zaliha: e.target.value })} placeholder="0" /></div>
                    <div><label style={lab}>Cena (€ / {novo.jedinica})</label><input style={inp} type="number" value={novo.cena} onChange={(e) => setNovo({ ...novo, cena: e.target.value })} placeholder="0" /></div>
                    <div><label style={lab}>Dobavljač</label><input style={inp} value={novo.dobavljac} onChange={(e) => setNovo({ ...novo, dobavljac: e.target.value })} placeholder="opciono" /></div>
                </div>
                <div style={{ marginTop: 10 }}><button disabled={busy} onClick={dodaj} style={btn("#0f766e")}>➕ Dodaj artikal</button></div>
            </div>

            {/* FILTERI */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                <select value={katFilter} onChange={(e) => setKatFilter(e.target.value)} style={{ ...inp, width: "auto" }}>
                    <option value="sve">Sve kategorije</option>
                    {KATEGORIJE.map((k) => <option key={k} value={k}>{KAT_IKONA[k]} {k}</option>)}
                </select>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 pretraga…" style={{ ...inp, maxWidth: 260 }} />
                <button onClick={load} style={{ ...btn("#f1f5f9", "#334155") }}>↻ Osveži</button>
            </div>

            {/* TABELA */}
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr>{["Artikal", "Kategorija", "Atribut", "Stanje", "Min", "Cena", "Vrednost", "Dobavljač", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                            {loading ? <tr><td style={td} colSpan={9}>Učitavam…</td></tr> :
                                filtrirani.length === 0 ? <tr><td style={td} colSpan={9}>Nema artikala. Dodaj prvi gore.</td></tr> :
                                    filtrirani.map((it) => {
                                        const nizak = num(it.min_zaliha) > 0 && num(it.stanje) <= num(it.min_zaliha);
                                        const atribut = it.kategorija === "hilzna" ? [it.precnik ? "⌀ " + fmt(it.precnik) : "", it.debljina ? "deb " + fmt(it.debljina) : "", it.duzina ? "duž " + fmt(it.duzina) : ""].filter(Boolean).join(" · ") + (it.precnik || it.debljina || it.duzina ? " mm" : "") : (it.dimenzija || "");
                                        return (
                                            <tr key={it.id} style={nizak ? { background: "#fff7ed" } : null}>
                                                <td style={{ ...td, fontWeight: 900 }}>{KAT_IKONA[it.kategorija] || ""} {it.naziv}</td>
                                                <td style={td}>{it.kategorija}</td>
                                                <td style={td}>{atribut || "—"}</td>
                                                <td style={{ ...td, fontWeight: 900, color: nizak ? "#b91c1c" : "#0f172a" }}>{nizak ? "⚠ " : ""}{fmt(it.stanje)} {it.jedinica}</td>
                                                <td style={td}>{it.min_zaliha ? fmt(it.min_zaliha) : "—"}</td>
                                                <td style={td}>{it.cena ? fmt(it.cena, 2) + " €" : "—"}</td>
                                                <td style={td}>{it.cena ? fmt(num(it.stanje) * num(it.cena), 2) + " €" : "—"}</td>
                                                <td style={td}>{it.dobavljac || "—"}</td>
                                                <td style={{ ...td, whiteSpace: "nowrap" }}>
                                                    <button disabled={busy} onClick={() => promeniStanje(it, +1)} style={{ ...btn("#dcfce7", "#166534"), marginRight: 4 }}>+ ulaz</button>
                                                    <button disabled={busy} onClick={() => promeniStanje(it, -1)} style={{ ...btn("#fee2e2", "#b91c1c"), marginRight: 4 }}>− izlaz</button>
                                                    <button disabled={busy} onClick={() => setEdit({ ...it, precnik: it.precnik || "", debljina: it.debljina || "", duzina: it.duzina || "", dimenzija: it.dimenzija || "", dobavljac: it.dobavljac || "", napomena: it.napomena || "" })} style={{ ...btn("#eef2ff", "#3730a3"), marginRight: 4 }}>✎</button>
                                                    <button disabled={busy} onClick={() => obrisi(it)} style={btn("#f1f5f9", "#64748b")}>🗑</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* EDIT MODAL */}
            {edit && (
                <div onClick={() => setEdit(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
                    <div onClick={(e) => e.stopPropagation()} style={{ ...card, maxWidth: 640, width: "100%" }}>
                        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>✎ Izmena: {edit.naziv}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                            <div style={{ gridColumn: "span 2" }}><label style={lab}>Naziv</label><input style={inp} value={edit.naziv} onChange={(e) => setEdit({ ...edit, naziv: e.target.value })} /></div>
                            <div><label style={lab}>Kategorija</label><select style={inp} value={edit.kategorija} onChange={(e) => setEdit({ ...edit, kategorija: e.target.value })}>{KATEGORIJE.map((k) => <option key={k} value={k}>{KAT_IKONA[k]} {k}</option>)}</select></div>
                            <div><label style={lab}>Jedinica</label><select style={inp} value={edit.jedinica} onChange={(e) => setEdit({ ...edit, jedinica: e.target.value })}>{JEDINICE.map((j) => <option key={j} value={j}>{j}</option>)}</select></div>
                            <PoljaExtra obj={edit} set={setEdit} />
                            <div><label style={lab}>Stanje</label><input style={inp} type="number" value={edit.stanje} onChange={(e) => setEdit({ ...edit, stanje: e.target.value })} /></div>
                            <div><label style={lab}>Min. zaliha</label><input style={inp} type="number" value={edit.min_zaliha} onChange={(e) => setEdit({ ...edit, min_zaliha: e.target.value })} /></div>
                            <div><label style={lab}>Cena (€)</label><input style={inp} type="number" value={edit.cena} onChange={(e) => setEdit({ ...edit, cena: e.target.value })} /></div>
                            <div><label style={lab}>Dobavljač</label><input style={inp} value={edit.dobavljac} onChange={(e) => setEdit({ ...edit, dobavljac: e.target.value })} /></div>
                            <div style={{ gridColumn: "span 2" }}><label style={lab}>Napomena</label><input style={inp} value={edit.napomena} onChange={(e) => setEdit({ ...edit, napomena: e.target.value })} /></div>
                        </div>
                        <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button onClick={() => setEdit(null)} style={btn("#f1f5f9", "#334155")}>Otkaži</button>
                            <button disabled={busy} onClick={sacuvajEdit} style={btn("#0f766e")}>💾 Sačuvaj</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
