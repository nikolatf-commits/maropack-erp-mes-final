import React, { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { napraviPDFPonuda } from "./utils/pdfPonuda.js";
import { sinhronizujLokalnePonude } from "./utils/kalkulacijeHelpers.js";

function fmt(v) {
    return Number(v || 0).toLocaleString("sr-RS", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function readLocalPonude() {
    try { return JSON.parse(localStorage.getItem('maropack_local_ponude') || '[]'); } catch { return []; }
}

export default function PonudePRO({ ponude = [], onPrihvati = () => { }, onOtvoriKalkulaciju = () => { }, kreiraoIme = "" }) {
    const [filter, setFilter] = useState("");
    const [ponudeData, setPonudeData] = useState([]);
    // Po ponudi: jezik PDF-a (sr/en/de) i važenje (1/7/15/30 dana).
    const [pdfOpt, setPdfOpt] = useState({});
    const optOf = (id) => pdfOpt[id] || { lang: "sr", vaziDana: 30 };
    const setOptOf = (id, patch) => setPdfOpt((o) => ({ ...o, [id]: { ...(o[id] || { lang: "sr", vaziDana: 30 }), ...patch } }));
    const [brisanje, setBrisanje] = useState(null);   // ponuda za koju je otvoren dijalog brisanja
    const [poruka, setPoruka] = useState("");
    const [napDraft, setNapDraft] = useState({});      // napomena koja se trenutno kuca, po ponudi

    const istaPonuda = (a, b) => (a.id != null && a.id === b.id) || (a.broj && a.broj === b.broj);
    const danas = () => new Date().toLocaleDateString("sr-RS");
    const flash = (t) => { setPoruka(t); setTimeout(() => setPoruka(""), 2800); };

    // Robustan UPDATE: ako `ponude` nema neku kolonu, PostgREST odbije ceo upis —
    // izbacimo kolonu koju prijavi kao nepoznatu i probamo opet (kao kod upisa ponude).
    async function updatePonudaRobustno(id, patch) {
        let p = { ...patch };
        for (let i = 0; i < 12; i++) {
            const { error } = await supabase.from("ponude").update(p).eq("id", id);
            if (!error) return { ok: true, applied: p };
            const por = [error.message, error.details, error.hint].filter(Boolean).join(" ");
            const m = por.match(/'([^']+)' column|column "([^"]+)"|the '([^']+)' column|find the '([^']+)'/i);
            const kol = m && (m[1] || m[2] || m[3] || m[4]);
            if (kol && Object.prototype.hasOwnProperty.call(p, kol)) { delete p[kol]; continue; }
            return { ok: false, error };
        }
        return { ok: false, error: { message: "update nije uspeo" } };
    }

    // Primeni promenu na bazu (ili lokalni bafer) + u prikaz.
    async function primeniPatch(p, patch) {
        if (p.id != null && !p._lokalno) {
            const r = await updatePonudaRobustno(p.id, patch);
            if (!r.ok) { flash("Greška: " + (r.error?.message || "")); return false; }
        } else {
            try {
                const lok = readLocalPonude().map((x) => istaPonuda(x, p) ? { ...x, ...patch } : x);
                localStorage.setItem("maropack_local_ponude", JSON.stringify(lok));
            } catch (e) { }
        }
        setPonudeData((d) => d.map((x) => istaPonuda(x, p) ? { ...x, ...patch } : x));
        return true;
    }

    // Prihvatanje = SAMO promena statusa (NE pravi radne naloge).
    async function oznaciPrihvacenom(p) {
        if (await primeniPatch(p, { status: "Prihvaćena", prihvatio_ime: kreiraoIme || "", prihvaceno_datum: danas() }))
            flash("Ponuda označena kao prihvaćena.");
    }

    // Poslato kupcu — beleži datum i ko je poslao.
    async function oznaciPoslato(p) {
        if (await primeniPatch(p, { poslato_kupcu: danas(), poslato_ime: kreiraoIme || "" }))
            flash("Zabeleženo: poslato kupcu.");
    }

    // Sačuvaj napomenu/komentar.
    async function sacuvajNapomenu(p) {
        const oid = p.id || p.broj;
        const tekst = (napDraft[oid] !== undefined ? napDraft[oid] : (p.napomena || p.nap || ""));
        if (await primeniPatch(p, { napomena: tekst })) {
            setNapDraft((o) => { const n = { ...o }; delete n[oid]; return n; });
            flash("Napomena sačuvana.");
        }
    }

    // Trajno brisanje ponude (iz baze + lokalnog bafera).
    async function obrisiPonudu(p) {
        try {
            if (p.id != null && !p._lokalno) {
                const { error } = await supabase.from("ponude").delete().eq("id", p.id);
                if (error) throw error;
            }
            try {
                const lok = readLocalPonude().filter((x) => !istaPonuda(x, p));
                localStorage.setItem("maropack_local_ponude", JSON.stringify(lok));
            } catch (e) { }
            setPonudeData((d) => d.filter((x) => !istaPonuda(x, p)));
            setBrisanje(null);
            flash("Ponuda obrisana.");
        } catch (e) {
            flash("Greška pri brisanju: " + (e.message || e));
            setBrisanje(null);
        }
    }

    // Učitaj ponude iz Supabase ako nisu prosleđene
    useEffect(() => {
        if (!ponude || ponude.length === 0) {
            ucitajPonude();
        } else {
            setPonudeData([...(readLocalPonude() || []), ...ponude]);
        }
    }, [ponude]);

    async function ucitajPonude() {
        try {
            // Prvo gurni sve zaostale LOKALNE ponude u zajedničku bazu — da ih vide SVI, ne samo ovaj računar.
            try { await sinhronizujLokalnePonude(); } catch (e) { }
            const { data, error } = await supabase
                .from('ponude')
                .select('*')
                .order('id', { ascending: false });

            if (error) throw error;
            // Iz baze (zajedničko za sve) + eventualni ostatak lokalnih koji još nije mogao da se sinhronizuje.
            setPonudeData([...(readLocalPonude() || []), ...(data || [])]);
        } catch (err) {
            console.error('Greška pri učitavanju ponuda:', err);
            setPonudeData(readLocalPonude() || []);
        }
    }

    const filtrirane = (ponudeData || []).filter((p) => {
        const text = [
            p?.kupac || "",
            p?.proizvod || "",
            p?.naziv || "",
            p?.status || ""
        ].join(" ").toLowerCase();
        return text.includes((filter || "").toLowerCase());
    });

    return (
        <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0 }}>📄 Ponude PRO</h2>
                <div style={{ fontSize: 14, color: '#64748b' }}>
                    Ukupno ponuda: <strong>{ponudeData?.length || 0}</strong>
                </div>
            </div>

            <input
                placeholder="Pretraga kupca / proizvoda..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{
                    marginBottom: 14,
                    padding: 11,
                    borderRadius: 10,
                    border: '2px solid #cbd5e1',
                    width: "100%",
                    maxWidth: 420,
                    fontSize: 14,
                    outline: 'none'
                }}
            />

            {poruka && <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 9, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontWeight: 700, fontSize: 13 }}>{poruka}</div>}

            {brisanje && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setBrisanje(null)}>
                    <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 22, width: "100%", maxWidth: 420, boxShadow: "0 24px 64px rgba(0,0,0,.25)" }}>
                        <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 8 }}>🗑️ Obriši ponudu</div>
                        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>Ponuda <b>{brisanje.broj || "—"}</b> za <b>{brisanje.kupac || "—"}</b> biće <b>trajno obrisana</b>. Ovo ne može da se poništi.</div>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button onClick={() => setBrisanje(null)} style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Otkaži</button>
                            <button onClick={() => obrisiPonudu(brisanje)} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Trajno obriši</button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
                {filtrirane.map((p) => {
                    const kal = Array.isArray(p.kalkulacije) ? p.kalkulacije[0] : (p.kalkulacije || p.kalkulacija || null);
                    const iz = iznosi(p);
                    const acc = statBoja(p?.status);
                    const rok = p?.rok_isporuke || p?.rok || "po dogovoru";
                    const uslovi = p?.uslovi_placanja || p?.uslovi || "avans / po dogovoru";
                    const napomena = p?.napomena || p?.nap || "";

                    return (
                        <div key={p.id || p.broj} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 28px rgba(15,23,42,0.06)" }}>

                            {/* Zaglavlje ponude */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, padding: "14px 16px", borderBottom: "1px solid #eef2f7" }}>
                                <div>
                                    <div style={{ fontSize: 18, fontWeight: 900 }}>{p?.kupac || "Kupac"}</div>
                                    <div style={{ color: "#64748b", marginTop: 2, fontSize: 13 }}>{p?.naziv || p?.proizvod || "Proizvod"}</div>
                                </div>
                                <div style={{ textAlign: "right", fontSize: 12, color: "#64748b" }}>
                                    {p?.broj && <div style={{ fontWeight: 800, color: "#334155" }}>#{p.broj}</div>}
                                    {(p?.datum || p?.created_at) && <div>🗓️ Napravljena: {p.datum || (function () { try { return new Date(p.created_at).toLocaleDateString("sr-RS"); } catch (e) { return p.created_at; } })()}</div>}
                                    {(function () { const ko = p?.kreirao_ime || p?.kreirao || p?.napravio || p?.ko; return ko ? <div>👤 {ko}</div> : null; })()}
                                    {p?.poslato_kupcu && <div style={{ color: "#0369a1", fontWeight: 700 }}>📤 Poslato: {p.poslato_kupcu}{p.poslato_ime ? " · " + p.poslato_ime : ""}</div>}
                                    {(p?.vaz || p?.vazi_do) && <div>Važi do: {p.vaz || p.vazi_do}</div>}
                                    <div style={{ marginTop: 4 }}>Status: <span style={{ background: acc.bg, color: acc.c, padding: "2px 8px", borderRadius: 6, fontWeight: 700, fontSize: 11 }}>{p?.status || "kreirana"}</span></div>
                                </div>
                            </div>

                            {/* Stavke */}
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead><tr style={{ background: "#f8fafc" }}>
                                    <th style={thL}>Proizvod</th><th style={thR}>Količina</th><th style={thR}>Cena / jed.</th><th style={thR}>Ukupno</th>
                                </tr></thead>
                                <tbody><tr>
                                    <td style={tdL}><b>{p?.naziv || p?.proizvod || "—"}</b></td>
                                    <td style={tdR}>{iz.kolTxt}</td>
                                    <td style={tdR}>{fmt(iz.cena)} {iz.jed}</td>
                                    <td style={{ ...tdR, fontWeight: 900, color: "#059669" }}>{fmt(iz.uk)} €</td>
                                </tr></tbody>
                            </table>

                            {/* Uslovi + ukupno */}
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "12px 16px", flexWrap: "wrap" }}>
                                <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.8 }}>
                                    <div><b>Rok isporuke:</b> {rok}</div>
                                    <div><b>Uslovi plaćanja:</b> {uslovi}</div>
                                </div>
                                <div style={{ textAlign: "right", minWidth: 140 }}>
                                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>UKUPNO</div>
                                    <div style={{ fontSize: 24, fontWeight: 950, color: "#059669" }}>{fmt(iz.uk)} €</div>
                                </div>
                            </div>

                            {/* Napomena / komentar — unese se i sačuva uz ponudu */}
                            {(() => {
                                const oid = p.id || p.broj;
                                const trenutna = p.napomena || p.nap || "";
                                const val = napDraft[oid] !== undefined ? napDraft[oid] : trenutna;
                                const izmenjeno = napDraft[oid] !== undefined && napDraft[oid] !== trenutna;
                                return (
                                    <div style={{ padding: "0 16px 10px" }}>
                                        <div style={{ fontSize: 10.5, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>📝 Napomena / komentar</div>
                                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                                            <textarea value={val} onChange={(e) => setNapDraft((o) => ({ ...o, [oid]: e.target.value }))} placeholder="npr. čeka odgovor kupca, pregovaramo cenu, poslato mejlom…" rows={2} style={{ flex: 1, minWidth: 220, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none" }} />
                                            <button onClick={() => sacuvajNapomenu(p)} disabled={!izmenjeno} style={{ ...btn(izmenjeno ? "#0d9488" : "#94a3b8"), cursor: izmenjeno ? "pointer" : "default" }}>💾 Sačuvaj</button>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Dugmad + izbor jezika/važenja PDF-a */}
                            {(() => {
                                const oid = p.id || p.broj;
                                const opt = optOf(oid);
                                return (
                                    <div style={{ display: "flex", gap: 8, padding: "0 16px 14px", flexWrap: "wrap", alignItems: "center" }}>
                                        <select value={opt.lang} onChange={(e) => setOptOf(oid, { lang: e.target.value })} style={sel} title="Jezik PDF-a">
                                            <option value="sr">🇷🇸 SR</option><option value="en">🇬🇧 EN</option><option value="de">🇩🇪 DE</option>
                                        </select>
                                        <select value={opt.vaziDana} onChange={(e) => setOptOf(oid, { vaziDana: Number(e.target.value) })} style={sel} title="Važenje ponude">
                                            <option value={1}>Važi 1 dan</option><option value={7}>Važi 7 dana</option><option value={15}>Važi 15 dana</option><option value={30}>Važi 30 dana</option>
                                        </select>
                                        <button onClick={() => napraviPDFPonuda(p, { lang: opt.lang, vaziDana: opt.vaziDana })} style={btn("#dc2626")}>📄 PDF ponuda</button>
                                        {kal && <button onClick={() => onOtvoriKalkulaciju(kal)} style={btn("#3b82f6")}>📊 Otvori kalkulaciju</button>}
                                        <button onClick={() => oznaciPoslato(p)} style={btn("#0369a1")} title="Zabeleži da je ponuda poslata kupcu">📤 Poslato kupcu</button>
                                        {!["prihvaceno", "Odobrena", "odobrena", "Prihvaćena", "prihvaćena"].includes(p?.status) && <button onClick={() => oznaciPrihvacenom(p)} style={btn("#059669")} title="Samo menja status — NE pravi radne naloge">✅ Označi prihvaćenom</button>}
                                        <button onClick={() => setBrisanje(p)} style={btn("#ef4444")} title="Trajno obriši ponudu">🗑️ Obriši</button>
                                    </div>
                                );
                            })()}
                        </div>
                    );
                })}
            </div>

            {filtrirane.length === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: 60,
                    background: 'white',
                    borderRadius: 12,
                    border: '2px dashed #e2e8f0',
                    marginTop: 20
                }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#64748b' }}>
                        Nema ponuda za prikaz
                    </div>
                </div>
            )}
        </div>
    );
}

function btn(color) {
    return {
        padding: "10px 14px",
        borderRadius: 10,
        border: "none",
        background: color,
        color: "#fff",
        fontWeight: 900,
        cursor: "pointer",
        fontSize: 13,
        transition: 'all 0.2s'
    };
}

// Iznosi po jedinici — folija: €/1000m, kesa: €/kom, špulna: €/špulni.
function iznosi(p) {
    const tip = String(p?.tip || p?.tip_proizvoda || "").toLowerCase();
    const kol = Number(p?.kol ?? p?.kolicina ?? p?.podaci?.kolicina ?? 0) || 0;
    const cena = Number(p?.c1 ?? p?.cena ?? p?.konacna_cena ?? p?.cena_ukorak ?? p?.cena_jedinicna ?? p?.podaci?.cena_jedinicna ?? 0) || 0;
    const uk = Number(p?.uk ?? p?.cena_ukupno ?? p?.vrednost ?? p?.podaci?.vrednost ?? (cena * kol)) || 0;
    if (tip === "folija") return { kolTxt: (kol * 1000).toLocaleString("sr-RS") + " m", jed: "€ / 1000m", cena, uk };
    if (tip === "kesa") return { kolTxt: kol.toLocaleString("sr-RS") + " kom", jed: "€ / kom", cena, uk };
    if (tip === "spulna" || tip === "špulna") return { kolTxt: kol.toLocaleString("sr-RS") + " špulni", jed: "€ / špulni", cena, uk };
    return { kolTxt: kol.toLocaleString("sr-RS"), jed: "€", cena, uk };
}

function statBoja(status) {
    const ok = ["prihvaceno", "Odobrena", "odobrena"].includes(status);
    return ok ? { bg: "#d1fae5", c: "#065f46" } : { bg: "#fef3c7", c: "#92400e" };
}

const sel = { padding: "9px 10px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", fontWeight: 800, fontSize: 12, cursor: "pointer" };
const thL = { textAlign: "left", padding: "8px 12px", color: "#64748b", fontSize: 11, fontWeight: 900, textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" };
const thR = { ...thL, textAlign: "right" };
const tdL = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #f1f5f9" };
const tdR = { textAlign: "right", padding: "10px 12px", borderBottom: "1px solid #f1f5f9", fontWeight: 700 };