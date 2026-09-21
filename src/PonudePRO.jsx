import React, { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { napraviPDFPonuda } from "./utils/pdfPonuda.js";

function fmt(v) {
    return Number(v || 0).toLocaleString("sr-RS", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function readLocalPonude() {
    try { return JSON.parse(localStorage.getItem('maropack_local_ponude') || '[]'); } catch { return []; }
}

export default function PonudePRO({ ponude = [], onPrihvati = () => { }, onOtvoriKalkulaciju = () => { } }) {
    const [filter, setFilter] = useState("");
    const [ponudeData, setPonudeData] = useState([]);

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
            const { data, error } = await supabase
                .from('ponude')
                .select('*')
                .order('id', { ascending: false });

            if (error) throw error;
            setPonudeData([...(readLocalPonude() || []), ...(data || [])]);
        } catch (err) {
            console.error('Greška pri učitavanju ponuda:', err);
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
                                    {p?.datum && <div>Datum: {p.datum}</div>}
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
                                    {napomena && <div><b>Napomena:</b> {napomena}</div>}
                                </div>
                                <div style={{ textAlign: "right", minWidth: 140 }}>
                                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>UKUPNO</div>
                                    <div style={{ fontSize: 24, fontWeight: 950, color: "#059669" }}>{fmt(iz.uk)} €</div>
                                </div>
                            </div>

                            {/* Dugmad */}
                            <div style={{ display: "flex", gap: 8, padding: "0 16px 14px", flexWrap: "wrap" }}>
                                <button onClick={() => napraviPDFPonuda(p)} style={btn("#dc2626")}>📄 PDF ponuda</button>
                                {kal && <button onClick={() => onOtvoriKalkulaciju(kal)} style={btn("#3b82f6")}>📊 Otvori kalkulaciju</button>}
                                {!["prihvaceno", "Odobrena", "odobrena"].includes(p?.status) && <button onClick={() => onPrihvati(p)} style={btn("#059669")}>✅ Prihvati ponudu</button>}
                            </div>
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
    const tip = String(p?.tip || "").toLowerCase();
    const kol = Number(p?.kol ?? p?.kolicina ?? 0) || 0;
    const cena = Number(p?.c1 ?? p?.cena ?? p?.konacna_cena ?? 0) || 0;
    const uk = Number(p?.uk ?? (cena * kol)) || 0;
    if (tip === "folija") return { kolTxt: (kol * 1000).toLocaleString("sr-RS") + " m", jed: "€ / 1000m", cena, uk };
    if (tip === "kesa") return { kolTxt: kol.toLocaleString("sr-RS") + " kom", jed: "€ / kom", cena, uk };
    if (tip === "spulna" || tip === "špulna") return { kolTxt: kol.toLocaleString("sr-RS") + " špulni", jed: "€ / špulni", cena, uk };
    return { kolTxt: kol.toLocaleString("sr-RS"), jed: "€", cena, uk };
}

function statBoja(status) {
    const ok = ["prihvaceno", "Odobrena", "odobrena"].includes(status);
    return ok ? { bg: "#d1fae5", c: "#065f46" } : { bg: "#fef3c7", c: "#92400e" };
}

const thL = { textAlign: "left", padding: "8px 12px", color: "#64748b", fontSize: 11, fontWeight: 900, textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" };
const thR = { ...thL, textAlign: "right" };
const tdL = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #f1f5f9" };
const tdR = { textAlign: "right", padding: "10px 12px", borderBottom: "1px solid #f1f5f9", fontWeight: 700 };