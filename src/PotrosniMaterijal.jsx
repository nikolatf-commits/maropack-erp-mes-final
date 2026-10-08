import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmt = (v, d = 0) => num(v).toLocaleString("sr-RS", { minimumFractionDigits: d, maximumFractionDigits: d });

const KATEGORIJE = ["hilzna", "kutija", "paleta", "etiketa", "traka", "ostalo"];
const JEDINICE = ["kom", "m", "kg", "l"];
const KAT_IKONA = { hilzna: "🧵", kutija: "📦", paleta: "🟫", etiketa: "🏷️", traka: "🎞️", ostalo: "🧰" };

const praznoNovo = { naziv: "", kategorija: "hilzna", jedinica: "kom", stanje: "", min_zaliha: "", cena: "", dobavljac: "", dimenzija: "", precnik: "", debljina: "", duzina: "", napomena: "" };

export default function PotrosniMaterijal({ msg }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");
    const [katFilter, setKatFilter] = useState("sve");
    const [novo, setNovo] = useState(praznoNovo);
    const [edit, setEdit] = useState(null); // {id, ...polja}
    const [busy, setBusy] = useState(false);

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
            const { error } = await supabase.from("potrosni_materijal").insert([row]);
            if (error) throw error;
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
            const { error } = await supabase.from("potrosni_materijal").update(row).eq("id", edit.id);
            if (error) throw error;
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
            // trag u knjizi (ručni ulaz/izlaz, bez naloga)
            try {
                await supabase.from("potrosni_stavke").insert([{
                    nalog_ref: delta > 0 ? "RUČNI ULAZ" : "RUČNI IZLAZ", artikal_id: it.id, naziv: it.naziv, kategorija: it.kategorija,
                    kolicina: kol, jedinica: it.jedinica, cena: num(it.cena), status: delta > 0 ? "ulaz" : "izlaz",
                }]);
            } catch (e) { /* trag je opcioni */ }
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
            load();
        } catch (e) { poruka("Brisanje nije uspelo: " + (e.message || e), "err"); }
        finally { setBusy(false); }
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

    const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.05)" };
    const inp = { width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 15, fontWeight: 600, height: 46 };
    const lab = { fontSize: 11, textTransform: "uppercase", fontWeight: 800, color: "#64748b", margin: "0 0 4px", display: "block" };
    const th = { textAlign: "left", padding: "9px 10px", fontSize: 10, textTransform: "uppercase", color: "#475569", fontWeight: 800, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" };
    const td = { padding: "9px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 600, fontSize: 13 };
    const btn = (bg, c) => ({ border: "none", borderRadius: 8, padding: "7px 11px", fontWeight: 800, cursor: "pointer", fontSize: 12.5, background: bg, color: c || "#fff" });
    const jeHilzna = (k) => k === "hilzna";

    const PoljaExtra = ({ obj, set }) => (
        <>
            {jeHilzna(obj.kategorija) ? (
                <>
                    <div><label style={lab}>Prečnik (mm)</label><input style={inp} type="number" value={obj.precnik} onChange={(e) => set({ ...obj, precnik: e.target.value })} placeholder="76 / 152" /></div>
                    <div><label style={lab}>Debljina (mm)</label><input style={inp} type="number" value={obj.debljina} onChange={(e) => set({ ...obj, debljina: e.target.value })} placeholder="npr. 6" /></div>
                    <div><label style={lab}>Dužina (mm)</label><input style={inp} type="number" value={obj.duzina} onChange={(e) => set({ ...obj, duzina: e.target.value })} placeholder="npr. 500" /></div>
                </>
            ) : (
                <div style={{ gridColumn: "span 2" }}><label style={lab}>Dimenzija</label><input style={inp} value={obj.dimenzija} onChange={(e) => set({ ...obj, dimenzija: e.target.value })} placeholder="npr. 400×300×250" /></div>
            )}
        </>
    );

    return (
        <div style={{ maxWidth: 1600, margin: "0 auto", padding: "8px 10px 40px" }}>
            <div style={{ fontSize: 22, fontWeight: 950, marginBottom: 4 }}>🧰 Magacin potrošnog materijala</div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 14 }}>Hilzne, kutije, palete, etikete, traka… — stanje, minimalna zaliha i cena (ulazi u kalkulaciju).</div>

            {/* KPI */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 11, marginBottom: 14 }}>
                <div style={{ ...card }}><div style={lab}>Artikala</div><div style={{ fontSize: 24, fontWeight: 950 }}>{kpi.ukupno}</div></div>
                <div style={{ ...card, background: kpi.ispod ? "#fef2f2" : "#f0fdf4" }}><div style={lab}>Ispod minimalne zalihe</div><div style={{ fontSize: 24, fontWeight: 950, color: kpi.ispod ? "#b91c1c" : "#166534" }}>{kpi.ispod}</div></div>
                <div style={{ ...card, background: "#0f172a" }}><div style={{ ...lab, color: "#94a3b8" }}>Vrednost zaliha</div><div style={{ fontSize: 22, fontWeight: 950, color: "#fff" }}>{fmt(kpi.vrednost, 2)} €</div></div>
            </div>

            {/* UPOZORENJE — za naručiti */}
            {kpi.ispod > 0 && (
                <div style={{ ...card, background: "#fff7ed", border: "1px solid #fed7aa", marginBottom: 14 }}>
                    <div style={{ fontWeight: 900, color: "#9a3412", marginBottom: 6 }}>⚠ Za naručiti ({kpi.ispod})</div>
                    <div>{kpi.ispodLista.map((x) => <span key={x.id} style={{ display: "inline-block", background: "#fff", border: "1px solid #fdba74", color: "#9a3412", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 800, margin: "2px 6px 2px 0" }}>{KAT_IKONA[x.kategorija] || ""} {x.naziv}: {fmt(x.stanje)} {x.jedinica} (min {fmt(x.min_zaliha)})</span>)}</div>
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
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 pretraga…" style={{ ...inp, maxWidth: 240 }} />
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
                    <div onClick={(e) => e.stopPropagation()} style={{ ...card, maxWidth: 560, width: "100%" }}>
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
