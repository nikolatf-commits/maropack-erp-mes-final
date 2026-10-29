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
    const [godina, setGodina] = useState("sve");        // "sve" | "2026" | ...
    const [ponudeData, setPonudeData] = useState([]);
    // Po ponudi: jezik PDF-a (sr/en/de) i važenje (1/7/15/30 dana).
    const [pdfOpt, setPdfOpt] = useState({});
    const optOf = (id) => pdfOpt[id] || { lang: "sr", vaziDana: 30, usloviKod: "" };
    const setOptOf = (id, patch) => setPdfOpt((o) => ({ ...o, [id]: { ...(o[id] || { lang: "sr", vaziDana: 30, usloviKod: "" }), ...patch } }));
    const [brisanje, setBrisanje] = useState(null);   // ponuda za koju je otvoren dijalog brisanja
    const [poruka, setPoruka] = useState("");
    const [napDraft, setNapDraft] = useState({});      // napomena koja se trenutno kuca, po ponudi
    const [dodajZa, setDodajZa] = useState(null);      // ponuda za koju biramo proizvod da dodamo
    const [kandidati, setKandidati] = useState([]);    // kalkulacije istog kupca
    const [kandLoading, setKandLoading] = useState(false);

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

    // Poslato kupcu — beleži datum i ko je poslao, i prebacuje u „Čeka odgovor kupca".
    async function oznaciPoslato(p) {
        const accepted = ["prihvaceno", "Odobrena", "odobrena", "Prihvaćena", "prihvaćena"].includes(p?.status);
        const patch = { poslato_kupcu: danas(), poslato_ime: kreiraoIme || "" };
        if (!accepted) patch.status = "Čeka odgovor kupca";
        if (await primeniPatch(p, patch)) flash("Zabeleženo: poslato kupcu — čeka odgovor.");
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

    // ── VIŠE PROIZVODA NA PONUDI ───────────────────────────────────────────────
    const singleAsStavka = (p) => ({ redni: 1, naziv: p.naziv || p.proizvod || "", proizvod: p.naziv || p.proizvod || "", tip: String(p.tip || p.tip_proizvoda || "").toLowerCase(), kolicina: Number(p.kol ?? p.kolicina ?? 0) || 0, kol: Number(p.kol ?? p.kolicina ?? 0) || 0, cena: Number(p.c1 ?? p.cena ?? 0) || 0, c1: Number(p.c1 ?? p.cena ?? 0) || 0, uk: Number(p.uk ?? p.cena_ukupno ?? 0) || 0, kalkulacija_id: p.kalkulacija_id || null });
    const stavkaIz = (kal) => {
        const tip = String(kal.tip || "").toLowerCase();
        const rez = kal.rezultati || kal.rezultat || kal.res || {};
        const kolicina = Number(kal.kolicina ?? kal.kol ?? rez.kolicina ?? kal.nalog ?? 0) || 0;
        const cena = Number(kal.konacna_cena ?? kal.konacnaCena ?? rez.konacnaCena ?? rez.saMarza ?? rez.cena1000 ?? kal.cena_kg ?? 0) || 0;
        const uk = Number(rez.ukupnoNalog ?? kal.ukupno_nalog ?? (cena * kolicina)) || 0;
        return { naziv: kal.naziv || "", proizvod: kal.naziv || "", tip, kolicina, kol: kolicina, cena, c1: cena, uk, kalkulacija_id: kal.id || null };
    };
    const stavkeOf = (p) => (Array.isArray(p.stavke) && p.stavke.length) ? p.stavke : ((Array.isArray(p?.podaci?.stavke) && p.podaci.stavke.length) ? p.podaci.stavke : [singleAsStavka(p)]);
    async function primeniStavke(p, nove) {
        const uk = nove.reduce((s, it) => s + (Number(it.uk) || 0), 0);
        const naziv = nove.length > 1 ? (nove.length + " proizvoda") : (nove[0]?.naziv || p.naziv || "");
        return primeniPatch(p, { stavke: nove, podaci: { ...(p.podaci || {}), stavke: nove, vrednost: uk }, uk, cena_ukupno: uk, naziv, proizvod: naziv });
    }
    async function skiniStavku(p, idx) {
        const cur = stavkeOf(p);
        if (cur.length <= 1) { flash("Ponuda mora imati bar jedan proizvod."); return; }
        const nove = cur.filter((_, i) => i !== idx).map((x, i) => ({ ...x, redni: i + 1 }));
        if (await primeniStavke(p, nove)) flash("Stavka skinuta.");
    }
    async function otvoriDodavanje(p) {
        setDodajZa(p); setKandidati([]); setKandLoading(true);
        const kupac = String(p.kupac || "").trim().toLowerCase();
        try {
            const [f, k, s] = await Promise.all([
                supabase.from("kalkulacije_folije").select("*"),
                supabase.from("kalkulacije_kese").select("*"),
                supabase.from("kalkulacije_spulne").select("*"),
            ]);
            const all = [
                ...((f.data || []).map((x) => ({ ...x, tip: "folija" }))),
                ...((k.data || []).map((x) => ({ ...x, tip: "kesa" }))),
                ...((s.data || []).map((x) => ({ ...x, tip: "spulna" }))),
            ];
            setKandidati(all.filter((x) => String(x.klijent || x.kupac || "").trim().toLowerCase() === kupac));
        } catch (e) { flash("Ne mogu da učitam kalkulacije: " + (e.message || e)); }
        setKandLoading(false);
    }
    async function dodajStavku(p, kal) {
        const cur = stavkeOf(p);
        const nove = [...cur, { redni: cur.length + 1, ...stavkaIz(kal) }];
        if (await primeniStavke(p, nove)) { flash("Proizvod dodat na ponudu."); setDodajZa(null); }
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

    // Godina ponude: iz broja (PON-2026-…) → datum → created_at.
    const godIz = (p) => {
        const mb = String(p?.broj || "").match(/((?:19|20)\d{2})/);
        if (mb) return mb[1];
        const md = String(p?.datum || "").match(/((?:19|20)\d{2})/);
        if (md) return md[1];
        if (p?.created_at) { try { return String(new Date(p.created_at).getFullYear()); } catch (e) { } }
        return "";
    };
    const godine = [...new Set((ponudeData || []).map(godIz).filter(Boolean))].sort((a, b) => Number(b) - Number(a));

    const filtrirane = (ponudeData || []).filter((p) => {
        if (godina !== "sve" && godIz(p) !== godina) return false;
        const text = [
            p?.broj || "",
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
                placeholder="Pretraga po broju, kupcu ili proizvodu..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{
                    marginBottom: 12,
                    padding: 11,
                    borderRadius: 10,
                    border: '2px solid #cbd5e1',
                    width: "100%",
                    maxWidth: 420,
                    fontSize: 14,
                    outline: 'none'
                }}
            />

            {/* Kartice po godinama */}
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
                <button onClick={() => setGodina("sve")} style={yearPill(godina === "sve")}>Sve godine</button>
                {godine.map((g) => (
                    <button key={g} onClick={() => setGodina(g)} style={yearPill(godina === g)}>📅 {g}</button>
                ))}
            </div>

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

            {/* Dodavanje proizvoda iz kalkulacije (isti kupac) */}
            {dodajZa && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setDodajZa(null)}>
                    <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: 520, maxHeight: "80vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,.25)" }}>
                        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>➕ Dodaj proizvod na ponudu</div>
                        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 14 }}>Kalkulacije kupca <b>{dodajZa.kupac || "—"}</b>:</div>
                        {kandLoading ? <div style={{ color: "#94a3b8", padding: 12 }}>⏳ Učitavam…</div> : (
                            kandidati.length === 0
                                ? <div style={{ color: "#94a3b8", padding: 12, fontSize: 13 }}>Nema sačuvanih kalkulacija za ovog kupca.</div>
                                : <div style={{ display: "grid", gap: 8 }}>
                                    {kandidati.map((kal) => {
                                        const si = iznosi(stavkaIz(kal));
                                        return (
                                            <div key={(kal.tip || "x") + "-" + (kal.id ?? kal.naziv)} onClick={() => dodajStavku(dodajZa, kal)} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                                                <div><div style={{ fontWeight: 800, fontSize: 13.5 }}>{kal.naziv || "—"}</div><div style={{ fontSize: 11.5, color: "#94a3b8" }}>{kal.tip} · {si.kolTxt}</div></div>
                                                <div style={{ fontWeight: 900, color: "#059669" }}>{fmt(si.uk)} €</div>
                                            </div>
                                        );
                                    })}
                                </div>
                        )}
                        <div style={{ textAlign: "right", marginTop: 14 }}>
                            <button onClick={() => setDodajZa(null)} style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Zatvori</button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
                {filtrirane.map((p) => {
                    const kal = Array.isArray(p.kalkulacije) ? p.kalkulacije[0] : (p.kalkulacije || p.kalkulacija || null);
                    const iz = iznosi(p);
                    // Više proizvoda na ponudi: stavke iz p.stavke ili p.podaci.stavke (rezerva).
                    const stavke = (Array.isArray(p?.stavke) && p.stavke.length) ? p.stavke
                        : ((Array.isArray(p?.podaci?.stavke) && p.podaci.stavke.length) ? p.podaci.stavke : null);
                    const ukSvih = stavke ? stavke.reduce((s, it) => s + (Number(iznosi(it).uk) || 0), 0) : iz.uk;
                    const acc = statBoja(p?.status);
                    const rok = p?.rok_isporuke || p?.rok || "po dogovoru";
                    const uslovi = p?.uslovi_placanja || p?.uslovi || "avans / po dogovoru";
                    const napomena = p?.napomena || p?.nap || "";
                    const solid = statusSolid(acc);
                    const proizvodLine = (stavke && stavke.length > 1) ? (stavke.length + " proizvoda") : (p?.naziv || p?.proizvod || "Proizvod");
                    const koKreirao = p?.kreirao_ime || p?.kreirao || p?.napravio || p?.ko;
                    const napravljena = p?.datum || (p?.created_at ? (function () { try { return new Date(p.created_at).toLocaleDateString("sr-RS"); } catch (e) { return p.created_at; } })() : "");

                    return (
                        <div key={p.id || p.broj} style={{ background: "#fff", border: "1px solid #e6ebf2", borderRadius: 18, overflow: "hidden", boxShadow: "0 12px 30px rgba(15,23,42,0.08)" }}>

                            {/* traka po statusu */}
                            <div style={{ height: 5, background: solid }} />

                            {/* Zaglavlje ponude */}
                            <div style={{ padding: "16px 16px 4px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: ".5px" }}>Kupac</div>
                                        <div style={{ fontSize: 20, fontWeight: 950, lineHeight: 1.1 }}>{p?.kupac || "Kupac"}</div>
                                        <div style={{ color: "#64748b", marginTop: 3, fontSize: 13, fontWeight: 600 }}>{proizvodLine}</div>
                                    </div>
                                    {p?.broj && <div style={{ fontSize: 12, fontWeight: 900, color: "#1d4ed8", background: "#eff6ff", border: "1px solid #dbeafe", borderRadius: 8, padding: "4px 9px", whiteSpace: "nowrap" }}>#{p.broj}</div>}
                                </div>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "7px 14px", borderRadius: 999, fontWeight: 900, fontSize: 13, color: "#fff", background: solid }}>{acc.ikona} {p?.status || "kreirana"}</span>
                            </div>

                            {/* Info panel */}
                            <div style={{ margin: "14px 16px 2px", background: "#f8fafc", border: "1px solid #eef2f7", borderRadius: 14, padding: "4px 2px" }}>
                                <div style={{ display: "flex", flexWrap: "wrap" }}>
                                    {napravljena ? infoCell("📅", "#eef2ff", "#4338ca", "Napravljena", napravljena) : null}
                                    {koKreirao ? infoCell("👤", "#eef2ff", "#4338ca", "Napravio", koKreirao) : null}
                                    {p?.poslato_kupcu ? infoCell("📤", "#e0f2fe", "#0369a1", "Poslato kupcu", p.poslato_kupcu + (p.poslato_ime ? " · " + p.poslato_ime : "")) : null}
                                    {(p?.vaz || p?.vazi_do) ? infoCell("⏳", "#fef3c7", "#b45309", "Važi do", p.vaz || p.vazi_do) : null}
                                </div>
                            </div>

                            {/* Stavke (jedan ili više proizvoda) */}
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead><tr style={{ background: "#f8fafc" }}>
                                    {stavke && <th style={{ ...thL, width: 28 }}>#</th>}
                                    <th style={thL}>Proizvod</th><th style={thR}>Količina</th><th style={thR}>Cena / jed.</th><th style={thR}>Ukupno</th>
                                    {stavke && <th style={thR}></th>}
                                </tr></thead>
                                <tbody>
                                    {stavke ? stavke.map((it, idx) => {
                                        const si = iznosi(it);
                                        return (
                                            <tr key={idx}>
                                                <td style={{ ...tdL, color: "#94a3b8", fontWeight: 800 }}>{idx + 1}</td>
                                                <td style={tdL}><b>{it?.naziv || it?.proizvod || "—"}</b>{it?.tip ? <div style={{ fontSize: 11, color: "#94a3b8" }}>{it.tip}</div> : null}</td>
                                                <td style={tdR}>{si.kolTxt}</td>
                                                <td style={tdR}>{fmt(si.cena)} {si.jed}</td>
                                                <td style={{ ...tdR, fontWeight: 900 }}>{fmt(si.uk)} €</td>
                                                <td style={{ ...tdR }}><span onClick={() => skiniStavku(p, idx)} title="Skini stavku" style={{ color: "#ef4444", cursor: "pointer", fontWeight: 900 }}>✕</span></td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td style={tdL}><b>{p?.naziv || p?.proizvod || "—"}</b></td>
                                            <td style={tdR}>{iz.kolTxt}</td>
                                            <td style={tdR}>{fmt(iz.cena)} {iz.jed}</td>
                                            <td style={{ ...tdR, fontWeight: 900, color: "#059669" }}>{fmt(iz.uk)} €</td>
                                        </tr>
                                    )}
                                    {stavke && (
                                        <tr style={{ background: "#0f172a" }}>
                                            <td style={{ ...tdL, color: "#fff", fontWeight: 950 }} colSpan={4}>UKUPNO ({stavke.length} proizvoda)</td>
                                            <td style={{ ...tdR, color: "#fff", fontWeight: 950 }}>{fmt(ukSvih)} €</td>
                                            <td></td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            {/* Dodaj proizvod iz kalkulacije (istog kupca) */}
                            <div style={{ padding: "8px 16px 0" }}>
                                <button onClick={() => otvoriDodavanje(p)} style={{ border: "1px dashed #0d9488", background: "#f0fdfa", color: "#0f766e", borderRadius: 9, padding: "8px 12px", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>➕ Dodaj proizvod iz kalkulacije</button>
                            </div>

                            {/* Uslovi + ukupno */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 16px", flexWrap: "wrap" }}>
                                <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.9 }}>
                                    <div><b>Rok isporuke:</b> {rok}</div>
                                    <div><b>Uslovi plaćanja:</b> {uslovi}</div>
                                </div>
                                <div style={{ background: "linear-gradient(135deg,#ecfdf5,#d1fae5)", border: "1px solid #a7f3d0", borderRadius: 12, padding: "10px 16px", textAlign: "right", minWidth: 150 }}>
                                    <div style={{ fontSize: 10, color: "#047857", fontWeight: 900, textTransform: "uppercase" }}>Ukupno (bez PDV-a)</div>
                                    <div style={{ fontSize: 23, fontWeight: 950, color: "#047857" }}>{fmt(ukSvih)} €</div>
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

                            {/* Alatke: jezik / važenje / uslovi plaćanja */}
                            {(() => {
                                const oid = p.id || p.broj;
                                const opt = optOf(oid);
                                const accepted = ["prihvaceno", "Odobrena", "odobrena", "Prihvaćena", "prihvaćena"].includes(p?.status);
                                const cekaOdgovor = !!p?.poslato_kupcu || String(p?.status || "").toLowerCase().includes("odgovor");
                                return (
                                    <>
                                        <div style={{ display: "flex", gap: 8, padding: "0 16px 10px", flexWrap: "wrap" }}>
                                            <select value={opt.lang} onChange={(e) => setOptOf(oid, { lang: e.target.value })} style={{ ...sel, flex: "1 1 100px" }} title="Jezik PDF-a">
                                                <option value="sr">🇷🇸 SR</option><option value="en">🇬🇧 EN</option><option value="de">🇩🇪 DE</option>
                                            </select>
                                            <select value={opt.vaziDana} onChange={(e) => setOptOf(oid, { vaziDana: Number(e.target.value) })} style={{ ...sel, flex: "1 1 120px" }} title="Važenje ponude">
                                                <option value={1}>Važi 1 dan</option><option value={7}>Važi 7 dana</option><option value={15}>Važi 15 dana</option><option value={30}>Važi 30 dana</option>
                                            </select>
                                            <select value={opt.usloviKod || ""} onChange={(e) => setOptOf(oid, { usloviKod: e.target.value })} style={{ ...sel, flexBasis: "100%" }} title="Uslovi plaćanja">
                                                <option value="">Uslovi plaćanja: podrazumevano</option>
                                                <option value="avansno">Avansno (100% unapred)</option>
                                                <option value="d30">Plaćanje 30 dana</option>
                                                <option value="d60">Plaćanje 60 dana</option>
                                                <option value="a50">50% avans, ostatak 30 dana</option>
                                            </select>
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, padding: "2px 16px 18px" }}>
                                            <button onClick={() => napraviPDFPonuda(p, { lang: opt.lang, vaziDana: opt.vaziDana, usloviKod: opt.usloviKod })} style={gbtn("linear-gradient(135deg,#ef4444,#dc2626)")}>📄 PDF ponuda</button>
                                            {kal && <button onClick={() => onOtvoriKalkulaciju(kal)} style={gbtn("linear-gradient(135deg,#3b82f6,#2563eb)")}>📊 Kalkulacija</button>}
                                            {!accepted && (cekaOdgovor
                                                ? <div style={{ ...gbtn("linear-gradient(135deg,#f59e0b,#d97706)"), gridColumn: "span 2", cursor: "default" }} title="Ponuda je poslata — čeka se odgovor kupca">⏳ Čeka odgovor kupca</div>
                                                : <button onClick={() => oznaciPoslato(p)} style={gbtn("linear-gradient(135deg,#0ea5e9,#0369a1)")} title="Zabeleži da je ponuda poslata kupcu">📤 Poslato kupcu</button>)}
                                            {!accepted && <button onClick={() => oznaciPrihvacenom(p)} style={gbtn("linear-gradient(135deg,#22c55e,#16a34a)")} title="Samo menja status — NE pravi radne naloge">✅ Prihvaćeno</button>}
                                            <button onClick={() => setBrisanje(p)} style={gbtn("linear-gradient(135deg,#f87171,#ef4444)")} title="Trajno obriši ponudu">🗑️ Obriši</button>
                                        </div>
                                    </>
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
    const s = String(status || "").toLowerCase();
    if (["prihvaceno", "prihvaćeno", "prihvacena", "prihvaćena", "odobrena"].includes(s)) return { bg: "#d1fae5", c: "#065f46", ikona: "✅" };
    if (s.includes("čeka") || s.includes("ceka") || s.includes("odgovor")) return { bg: "#dbeafe", c: "#1e40af", ikona: "⏳" };
    if (s.includes("poslato")) return { bg: "#dbeafe", c: "#1e40af", ikona: "📤" };
    if (s.includes("odbij")) return { bg: "#fee2e2", c: "#991b1b", ikona: "✕" };
    return { bg: "#fef3c7", c: "#92400e", ikona: "•" };
}
const chip = (bg, c) => ({ background: bg, color: c, padding: "4px 10px", borderRadius: 999, fontWeight: 800, fontSize: 11.5, whiteSpace: "nowrap" });
const yearPill = (active) => ({ border: active ? "1px solid #1d4ed8" : "1px solid #e2e8f0", borderRadius: 999, padding: "6px 15px", fontWeight: 900, fontSize: 13.5, background: active ? "#1d4ed8" : "#fff", color: active ? "#fff" : "#334155", cursor: "pointer" });
const gbtn = (grad) => ({ border: "none", borderRadius: 11, padding: "12px", fontWeight: 900, fontSize: 13, color: "#fff", cursor: "pointer", background: grad, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 4px 12px rgba(0,0,0,.10)" });
function infoCell(ikona, bg, c, lab, val) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", flex: "1 1 46%", minWidth: 150 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flex: "0 0 30px", background: bg, color: c }}>{ikona}</div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: ".3px" }}>{lab}</div>
                <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
            </div>
        </div>
    );
}
// Pun (gradijent) ton statusa — za traku na vrhu i status-pilulu.
function statusSolid(acc) {
    if (acc.c === "#065f46") return "linear-gradient(135deg,#22c55e,#16a34a)";
    if (acc.c === "#1e40af") return "linear-gradient(135deg,#2563eb,#3b82f6)";
    if (acc.c === "#991b1b") return "linear-gradient(135deg,#ef4444,#dc2626)";
    return "linear-gradient(135deg,#f59e0b,#d97706)";
}

const sel = { padding: "9px 10px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", fontWeight: 800, fontSize: 12, cursor: "pointer" };
const thL = { textAlign: "left", padding: "8px 12px", color: "#64748b", fontSize: 11, fontWeight: 900, textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" };
const thR = { ...thL, textAlign: "right" };
const tdL = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #f1f5f9" };
const tdR = { textAlign: "right", padding: "10px 12px", borderBottom: "1px solid #f1f5f9", fontWeight: 700 };