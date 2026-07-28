// [build v51] MAROPACK — Uvoz špulni iz Excela (PROIZVODI sheet) u bazu proizvoda.
// Čita .xlsx/.xlsm, mapira kolone na špulna templejt, pravi po jedan templejt za svaki red.
import React, { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase.js";

// ── Mapiranje: naziv Excel kolone (iz reda-zaglavlja) → funkcija koja vadi vrednost ──
// Tolerantno na razmake/velika-mala slova; traži po delu naziva.
const nadjiKol = (headeri, delovi) => {
    const low = headeri.map(h => String(h || "").toLowerCase().replace(/\s+/g, " ").trim());
    for (const d of delovi) {
        const i = low.findIndex(h => h.includes(d.toLowerCase()));
        if (i >= 0) return i;
    }
    return -1;
};

const brojIz = (v) => {
    if (v == null) return "";
    const m = String(v).replace(",", ".").match(/-?\d+(\.\d+)?/);
    return m ? m[0] : "";
};

function makeProductMasterId(naziv) {
    const seed = "spulna-" + String(naziv || "");
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
    return "PROD-" + Math.abs(h).toString().padStart(6, "0").slice(0, 6);
}

export default function UvozSpulnaExcel({ onGotovo }) {
    const [redovi, setRedovi] = useState([]);      // parsirani špulna objekti (pregled)
    const [greske, setGreske] = useState([]);
    const [busy, setBusy] = useState(false);
    const [rezultat, setRezultat] = useState(null); // {upisano, preskoceno}
    const [fajlIme, setFajlIme] = useState("");

    function ucitajFajl(e) {
        const f = e.target.files?.[0];
        if (!f) return;
        setFajlIme(f.name);
        setRezultat(null); setGreske([]);
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const wb = XLSX.read(ev.target.result, { type: "array" });
                // uzmi PROIZVODI sheet, ili prvi ako ga nema
                const wsName = wb.SheetNames.find(n => n.toLowerCase().includes("proizvod")) || wb.SheetNames[0];
                const ws = wb.Sheets[wsName];
                const matrica = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
                if (!matrica.length) { setGreske(["Prazan sheet."]); return; }

                const H = matrica[0];  // red-zaglavlje
                // indeksi kolona
                const iNaziv = nadjiKol(H, ["proizvodi", "naziv"]);
                const iMaterijal = nadjiKol(H, ["materijal proizvoda", "materijal "]);
                const iW = nadjiKol(H, ["širina trake", "sirina trake", "- w"]);
                const iT = nadjiKol(H, ["t-širina", "t-sirina", "širina namotavanja"]);
                const iD = nadjiKol(H, ["max pre. špulne", "max pre. spulne", "špulne u mm d", "pre. špulne"]);
                const iDa = nadjiKol(H, ["spoljašnji prečnik hilne", "spoljasnji precnik", "hilne da", "da"]);
                const iDi = nadjiKol(H, ["unutrašnji prečnik hilne", "unutrasnji precnik", "hilne di"]);
                const iG = nadjiKol(H, ["širina hilzne", "sirina hilzne"]);
                const iC = nadjiKol(H, ["c"]);   // kolona "C"
                const iMax = nadjiKol(H, ["max. metara", "metara na špulni", "metara na spulni"]);
                const iSmerNam = nadjiKol(H, ["smer namotavanja"]);
                const iMotanje = nadjiKol(H, ["način motanja", "nacin motanja"]);
                const iSideA = nadjiKol(H, ["spoljna strana", "side a"]);
                const iSideB = nadjiKol(H, ["unutrašnja strana", "unutrasnja strana", "side b"]);
                const iKutije = nadjiKol(H, ["kutije za pakovanje"]);
                const iSirMat = nadjiKol(H, ["širina materijala", "sirina materijala"]);
                const iNap = nadjiKol(H, ["napomena"]);
                const iDim = nadjiKol(H, ["dim. proizvoda", "dim proizvoda"]);

                const val = (row, idx) => (idx >= 0 ? row[idx] : "");
                const out = [];
                const errs = [];
                for (let r = 1; r < matrica.length; r++) {
                    const row = matrica[r];
                    const naziv = String(val(row, iNaziv) || "").trim();
                    if (!naziv) continue;   // preskoči prazne redove
                    // Samo špulne: način motanja sadrži "špuln" ILI ima max metara/prečnik špulne
                    const motanje = String(val(row, iMotanje) || "").toLowerCase();
                    const jeSpulna = motanje.includes("špuln") || motanje.includes("spuln") || val(row, iMax) || val(row, iD);
                    if (!jeSpulna) continue;

                    out.push({
                        naziv,
                        materijal: String(val(row, iMaterijal) || "").trim(),
                        dim: String(val(row, iDim) || "").trim(),
                        W: brojIz(val(row, iW)),
                        T: brojIz(val(row, iT)),
                        D: brojIz(val(row, iD)),
                        Da: brojIz(val(row, iDa)),
                        Di: brojIz(val(row, iDi)),
                        G: brojIz(val(row, iG)),
                        C: brojIz(val(row, iC)),
                        maxMetara: brojIz(val(row, iMax)),
                        smerNamotavanja: String(val(row, iSmerNam) || "").trim(),
                        smer: String(val(row, iMotanje) || "").trim(),
                        sideA: String(val(row, iSideA) || "").trim(),
                        sideB: String(val(row, iSideB) || "").trim(),
                        kutija: String(val(row, iKutije) || "").trim(),
                        sirinaMaterijala: brojIz(val(row, iSirMat)),
                        napomena: String(val(row, iNap) || "").trim(),
                    });
                }
                setRedovi(out);
                setGreske(errs);
            } catch (err) {
                setGreske(["Greška pri čitanju: " + (err.message || err)]);
            }
        };
        reader.readAsArrayBuffer(f);
    }

    async function uvezi() {
        if (!redovi.length) return;
        setBusy(true);
        let upisano = 0, preskoceno = 0;
        const problemi = [];
        for (const s of redovi) {
            try {
                const spulnaData = {
                    naziv: s.naziv, materijal: s.materijal,
                    W: s.W, T: s.T, D: s.D, Da: s.Da, Di: s.Di, G: s.G, C: s.C,
                    maxMetara: s.maxMetara, smer: s.smer, smerNamotavanja: s.smerNamotavanja,
                    sideA: s.sideA, sideB: s.sideB, kutija: s.kutija, napomena: s.napomena,
                    jedinicaUnosa: "m", layers: [],
                };
                const templateData = {
                    type: "spulna", naziv: s.naziv, kupac: null,
                    sifra: null, idealnaSirinaMaterijala: s.sirinaMaterijala || null,
                    spulna: spulnaData,
                };
                const pmid = makeProductMasterId(s.naziv);
                const payload = {
                    tip: "spulna", naziv: s.naziv, kupac: null, sku: null, status: "Aktivan",
                    sir: Number(s.sirinaMaterijala) || null, met: Number(s.maxMetara) || null,
                    mats: [],
                    res: { template: templateData, operacije: ["materijal", "formatiranje", "spulna"] },
                    product_master_id: pmid,
                    template_id: "TPL-" + pmid + "-" + Date.now().toString().slice(-5),
                    template_version: "V1",
                    operacije: ["materijal", "formatiranje", "spulna"],
                    materijali_struktura: [],
                    standardi: {
                        tip: "spulna", kupac: null, template_version: "V1",
                        record: { tip: "spulna", naziv: s.naziv, data: templateData, product_master_id: pmid },
                    },
                    datum: new Date().toLocaleDateString("sr-RS"),
                };
                // provera duplikata po nazivu
                const { data: post } = await supabase.from("proizvodi").select("id").eq("naziv", s.naziv).eq("tip", "spulna").limit(1);
                if (post && post.length) { preskoceno++; continue; }
                const { error } = await supabase.from("proizvodi").insert([payload]);
                if (error) { problemi.push(s.naziv + ": " + error.message); }
                else upisano++;
            } catch (e) {
                problemi.push(s.naziv + ": " + (e.message || e));
            }
        }
        setBusy(false);
        setRezultat({ upisano, preskoceno, problemi });
        if (onGotovo) onGotovo();
    }

    const box = { maxWidth: 900, margin: "0 auto", padding: 20 };
    const btn = (bg) => ({ background: bg, color: "#fff", border: "none", borderRadius: 10, padding: "11px 18px", fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 });

    return (
        <div style={box}>
            <h2 style={{ fontWeight: 900, fontSize: 20, marginBottom: 4 }}>📥 Uvoz špulni iz Excela</h2>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>
                Učitaj Excel (sheet „PROIZVODI"). Aplikacija prepozna špulne i napravi po jedan templejt za svaku, u bazu proizvoda.
            </p>

            <input type="file" accept=".xlsx,.xlsm,.xls" onChange={ucitajFajl}
                style={{ marginBottom: 14, fontSize: 13 }} />
            {fajlIme && <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>Fajl: <b>{fajlIme}</b></div>}

            {greske.length > 0 && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 8, padding: 10, fontSize: 12.5, marginBottom: 12 }}>
                    {greske.map((g, i) => <div key={i}>{g}</div>)}
                </div>
            )}

            {redovi.length > 0 && (
                <>
                    <div style={{ fontWeight: 800, fontSize: 14, margin: "6px 0 8px" }}>Pronađeno špulni: {redovi.length}</div>
                    <div style={{ maxHeight: 340, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                            <thead>
                                <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                                    {["Naziv", "Materijal", "W", "T", "D", "Da", "Di", "Hilzna(G)", "C", "Max m", "Kutije"].map(h =>
                                        <th key={h} style={{ textAlign: "left", padding: "7px 8px", fontWeight: 800, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {redovi.map((s, i) => (
                                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>{s.naziv}</td>
                                        <td style={{ padding: "6px 8px" }}>{s.materijal}</td>
                                        <td style={{ padding: "6px 8px" }}>{s.W}</td>
                                        <td style={{ padding: "6px 8px" }}>{s.T}</td>
                                        <td style={{ padding: "6px 8px" }}>{s.D}</td>
                                        <td style={{ padding: "6px 8px" }}>{s.Da}</td>
                                        <td style={{ padding: "6px 8px" }}>{s.Di}</td>
                                        <td style={{ padding: "6px 8px" }}>{s.G}</td>
                                        <td style={{ padding: "6px 8px" }}>{s.C}</td>
                                        <td style={{ padding: "6px 8px" }}>{s.maxMetara}</td>
                                        <td style={{ padding: "6px 8px" }}>{s.kutija}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
                        <button disabled={busy} onClick={uvezi} style={btn("#16a34a")}>
                            {busy ? "Uvozim…" : "✓ Uvezi " + redovi.length + " špulni u bazu"}
                        </button>
                        <span style={{ fontSize: 12, color: "#64748b" }}>Duplikati (isti naziv) se preskaču.</span>
                    </div>
                </>
            )}

            {rezultat && (
                <div style={{ marginTop: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 14 }}>
                    <div style={{ fontWeight: 900, color: "#166534", marginBottom: 6 }}>Gotovo ✓</div>
                    <div style={{ fontSize: 13 }}>Upisano novih: <b>{rezultat.upisano}</b> · Preskočeno (duplikat): <b>{rezultat.preskoceno}</b></div>
                    {rezultat.problemi.length > 0 && (
                        <div style={{ marginTop: 8, fontSize: 12, color: "#991b1b" }}>
                            <div style={{ fontWeight: 800 }}>Problemi ({rezultat.problemi.length}):</div>
                            {rezultat.problemi.slice(0, 10).map((p, i) => <div key={i}>· {p}</div>)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
