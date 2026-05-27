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
                    // Kalkulacija može biti objekat ili niz (ako je relacija 1:m)
                    const kal = Array.isArray(p.kalkulacije) ? p.kalkulacije[0] : (p.kalkulacije || p.kalkulacija || null);
                    const struktura = (p?.struktura || p?.mats || []);
                    const cenaPrikaz = p?.cena ?? p?.uk ?? p?.konacna_cena;

                    return (
                        <div
                            key={p.id || p.broj}
                            style={{
                                background: "#fff",
                                border: "1px solid #e2e8f0",
                                borderRadius: 16,
                                padding: 16,
                                boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 18, fontWeight: 900 }}>{p?.kupac || "Kupac"}</div>
                                    <div style={{ color: "#64748b", marginTop: 4 }}>{p?.proizvod || p?.naziv || "Proizvod"}</div>
                                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                                        Struktura: {Array.isArray(struktura) && struktura.length > 0
                                            ? struktura.map((s) => s?.tip || s?.naziv).filter(Boolean).join(" / ")
                                            : "—"}
                                    </div>

                                    {kal && (
                                        <div style={{
                                            marginTop: 10,
                                            padding: '8px 12px',
                                            background: '#f0f9ff',
                                            border: '1px solid #bfdbfe',
                                            borderRadius: 8,
                                            display: 'inline-block'
                                        }}>
                                            <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700, marginBottom: 2 }}>
                                                📋 Povezana kalkulacija
                                            </div>
                                            <div style={{ fontSize: 12, color: '#1e40af' }}>
                                                {kal?.naziv} {kal?.verzija ? `(v${kal?.verzija})` : ""}
                                            </div>
                                            {kal?.created_at && (
                                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                                    {new Date(kal.created_at).toLocaleDateString('sr-RS')}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 22, fontWeight: 950, color: "#059669" }}>
                                        {fmt(cenaPrikaz)} €
                                    </div>
                                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                                        Status: <span style={{
                                            background: ['prihvaceno','Odobrena','odobrena'].includes(p?.status) ? '#d1fae5' : '#fef3c7',
                                            color: ['prihvaceno','Odobrena','odobrena'].includes(p?.status) ? '#065f46' : '#92400e',
                                            padding: '2px 8px',
                                            borderRadius: 6,
                                            fontWeight: 700,
                                            fontSize: 11
                                        }}>
                                            {p?.status || "kreirana"}
                                        </span>
                                    </div>
                                    {p?.broj && (
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                                            #{p.broj}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                                <button onClick={() => napraviPDFPonuda(p)} style={btn("#dc2626")}>
                                    📄 PDF ponuda
                                </button>

                                {kal && (
                                    <button
                                        onClick={() => onOtvoriKalkulaciju(kal)}
                                        style={btn("#3b82f6")}
                                    >
                                        📊 Otvori Kalkulaciju
                                    </button>
                                )}

                                {!["prihvaceno", "Odobrena", "odobrena"].includes(p?.status) && (
                                    <button
                                        onClick={() => onPrihvati(p)}
                                        style={btn("#059669")}
                                    >
                                        ✅ Prihvati ponudu
                                    </button>
                                )}
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