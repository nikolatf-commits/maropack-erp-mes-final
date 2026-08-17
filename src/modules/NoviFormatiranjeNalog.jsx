import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase.js";
import { QRCodeSVG } from "qrcode.react";
import { planReza, parsirajSirine, autoSirine } from "../utils/formatiranjePlan.js";

const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const fmt = (v, d = 0) => (Number(v) || 0).toLocaleString("sr-RS", { minimumFractionDigits: d, maximumFractionDigits: d });

// Prikaz rezanja — isti stil kao nalog za rezanje (plave trake + crveni bočni otpad + kota).
function RezPrikaz({ plan }) {
    if (!plan || !plan.ok) return null;
    const total = plan.sirinaMat || 1;
    const X0 = 50, X1 = 660, h = 56, topY = 46, scale = (X1 - X0) / total;
    const we = plan.bocniOtpad / 2, wePx = we * scale;
    let x = X0 + wePx;
    const rects = [];
    plan.sirineTraka.forEach((lw, i) => {
        const sPx = lw * scale;
        rects.push(<g key={i}>
            <rect x={x} y={topY} width={sPx} height={h} fill="#dbeafe" stroke="#1d4ed8" strokeWidth="1" />
            <text x={x + sPx / 2} y={topY + h / 2 + 4} textAnchor="middle" fontSize="13" fontWeight="900" fill="#1d4ed8">{i + 1}</text>
            <text x={x + sPx / 2} y={topY + h + 13} textAnchor="middle" fontSize="9" fontWeight="800" fill="#334155">{lw}</text>
        </g>);
        x += sPx;
    });
    return (
        <svg viewBox="0 0 710 120" width="100%" style={{ maxWidth: 640, background: "#fff" }}>
            <rect x={X0} y={topY} width={X1 - X0} height={h} fill="#eef4fc" stroke="#1e3a8a" strokeWidth="1.3" />
            <rect x={X0} y={topY} width={wePx} height={h} fill="#fee2e2" />
            {rects}
            <rect x={X1 - wePx} y={topY} width={wePx} height={h} fill="#fee2e2" />
            <line x1={X0} y1={topY - 16} x2={X1} y2={topY - 16} stroke="#1e40af" strokeWidth="1.1" />
            <rect x={(X0 + X1) / 2 - 26} y={topY - 25} width="52" height="15" rx="2" fill="#fff" stroke="#dbeafe" />
            <text x={(X0 + X1) / 2} y={topY - 14} textAnchor="middle" fontSize="11.5" fontWeight="800" fill="#1e40af">{total} mm</text>
        </svg>
    );
}

// QR etiketa 100×140 (isti sadržaj kao FormatiranjeRolniPRO)
function Etiketa({ r }) {
    const tdh = { background: "#f1f5f9", fontWeight: 800, padding: "2px 4px", border: "1px solid #cbd5e1", fontSize: 10 };
    const td = { padding: "2px 4px", border: "1px solid #cbd5e1", fontSize: 10 };
    return (
        <div className="roll-label-print" style={{ width: "100mm", height: "140mm", background: "#fff", border: "1px solid #111827", padding: "5mm", boxSizing: "border-box", fontFamily: "Arial, sans-serif", color: "#111827", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #111827", paddingBottom: 4 }}>
                <div><div style={{ fontSize: 18, fontWeight: 900 }}>MAROPACK</div><div style={{ fontSize: 9, fontWeight: 800 }}>ETIKETA ROLNE — FORMATIRANO</div></div>
                <div style={{ fontSize: 9, fontWeight: 900 }}>100 × 140 mm</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "34mm 1fr", gap: 5, marginTop: 5 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}><QRCodeSVG value={String(r.lot)} size={150} level="M" includeMargin={true} /></div>
                <div style={{ fontSize: 10, lineHeight: 1.35 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, wordBreak: "break-all" }}>{r.lot}</div>
                    <div><b>Vrsta:</b> {r.vrsta || "—"}</div>
                    <div><b>Oznaka:</b> {r.oznaka || "—"}</div>
                    <div><b>Dobavljač:</b> {r.dobavljac || "—"}</div>
                </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 5, fontSize: 10 }}>
                <tbody>
                    <tr><td style={tdh}>DEB.</td><td style={td}>{r.debljina || "—"} µ</td><td style={tdh}>ŠIRINA</td><td style={td}>{r.sirina} mm</td></tr>
                    <tr><td style={tdh}>METRAŽA</td><td style={td}>{fmt(r.duzina)} m</td><td style={tdh}>KG</td><td style={td}>{fmt(r.kg, 2)}</td></tr>
                    <tr><td style={tdh}>LOT</td><td style={td}>{r.lot}</td><td style={tdh}>MATIČNA</td><td style={td}>{r.parent_br || "—"}</td></tr>
                </tbody>
            </table>
        </div>
    );
}

export default function NoviFormatiranjeNalog({ msg }) {
    const say = (t, k) => (msg ? msg(t, k) : console.log(t));
    const [rolne, setRolne] = useState([]);
    const [q, setQ] = useState("");
    const [sel, setSel] = useState(null);
    const [sirine, setSirine] = useState("");
    const [duzKom, setDuzKom] = useState("");
    const [busy, setBusy] = useState(false);
    const [kreiran, setKreiran] = useState(null); // { broj, rolne }

    useEffect(() => {
        (async () => {
            try {
                const { data } = await supabase.from("magacin").select("*").limit(3000);
                const na = (data || []).filter((r) => !/obris|iskoris|potros/i.test(String(r.status)) && num(r.metraza_ost ?? r.metraza) > 0);
                setRolne(na);
            } catch (e) { say("Ne mogu da učitam magacin: " + (e.message || e), "err"); }
        })();
    }, []);

    const filtr = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return rolne.slice(0, 40);
        return rolne.filter((r) => [r.br_rolne, r.vrsta, r.oznaka_materijala, r.oznaka, r.lot, r.sirina].join(" ").toLowerCase().includes(s)).slice(0, 40);
    }, [rolne, q]);

    const matica = sel ? {
        sirina: num(sel.sirina), duzina: num(sel.metraza_ost ?? sel.metraza),
        lot: sel.lot || sel.br_rolne, br_rolne: sel.br_rolne, vrsta: sel.vrsta,
        oznaka: sel.oznaka_materijala || sel.oznaka, debljina: sel.deb || sel.debljina,
        dobavljac: sel.dobavljac, gsm: num(sel.gsm),
    } : null;

    const plan = useMemo(() => matica ? planReza(matica, parsirajSirine(sirine), duzKom) : null, [matica, sirine, duzKom]);

    function izaberi(r) {
        setSel(r);
        // predloži širine automatski iz idealne (matična / neka razumna) — ostavljamo korisniku da unese
        setSirine("");
        setDuzKom("");
        setKreiran(null);
    }

    async function kreirajNalog() {
        if (!plan || !plan.ok) { say(plan?.greska || "Podesi plan reza.", "err"); return; }
        setBusy(true);
        try {
            const broj = "FMT-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.floor(Math.random() * 900 + 100);
            const zaj = { broj_naloga: broj, tip_proizvoda: "formatiranje", kupac: "Interno / preventivno", naziv: `Formatiranje ${matica.br_rolne} → ${plan.sirineTraka.join("+")}mm`, proizvod: `Formatiranje ${matica.oznaka || matica.vrsta}` };
            // glavni nalog
            const { data: master, error: mErr } = await supabase.from("radni_nalozi").insert([{
                ...zaj, status: "ceka",
                parametri: { formatiranje: { matica: sel.br_rolne, matica_id: sel.id, sirina_mat: plan.sirinaMat, sirine: plan.sirineTraka, duzina_komada: num(duzKom) || plan.duzinaMat, plan: plan.rolne }, datum: new Date().toLocaleDateString("sr-RS") },
                rezultati: {},
            }]).select("id").single();
            if (mErr) throw new Error("radni_nalozi: " + mErr.message);
            // operativni nalog (ide u Gant kao rezanje/formatiranje — ti ga rasporediš na rezač)
            const { error: oErr } = await supabase.from("operativni_nalozi").insert([{
                ...zaj, broj_naloga: broj + "-FORMATIRANJE", glavni_nalog_id: master.id,
                tip_naloga: "formatiranje", status: "ceka", redosled: 1,
                parametri: { formatiranje: { matica: sel.br_rolne, sirine: plan.sirineTraka, duzina_komada: num(duzKom) || plan.duzinaMat, plan: plan.rolne }, metraza_maticne: plan.duzinaMat, broj_traka: plan.brojTrakaPoSirini },
            }]);
            if (oErr) throw new Error("operativni_nalozi: " + oErr.message);

            const rolneZaStampu = plan.rolne.map((r) => ({ ...r, parent_br: matica.br_rolne }));
            setKreiran({ broj, rolne: rolneZaStampu });
            say(`Nalog ${broj} kreiran — pojaviće se u Glavnim nalozima / Gantu (rasporedi na rezač).`);
        } catch (e) { say(String(e.message || e), "err"); } finally { setBusy(false); }
    }

    function stampaj() {
        setTimeout(() => {
            const root = document.querySelector(".fmt-labels-root");
            const labels = root ? Array.from(root.querySelectorAll(".roll-label-print")).map((el) => el.outerHTML).join("\n") : "";
            const w = window.open("", "_blank", "width=520,height=720");
            if (!w) { window.print(); return; }
            w.document.open();
            w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR etikete</title>
<style>@page{size:100mm 140mm;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
html,body{margin:0;padding:0;width:100mm;font-family:Arial,sans-serif}
.roll-label-print{width:100mm!important;height:140mm!important;padding:5mm!important;page-break-after:always!important;overflow:hidden}
.roll-label-print:last-child{page-break-after:auto!important}</style></head><body>${labels}</body></html>`);
            w.document.close(); w.focus();
            setTimeout(() => { w.print(); setTimeout(() => w.close(), 400); }, 400);
        }, 60);
    }

    const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, marginBottom: 14 };
    const input = { width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 9, fontSize: 14, boxSizing: "border-box" };
    const lbl = { fontSize: 11, fontWeight: 800, color: "#334155", display: "block", marginBottom: 5 };

    return (
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>✂ Novi nalog za formatiranje (preventivno)</h2>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Iseci širu matičnu rolnu na trake — nalog ide u Glavne naloge i Gant (rasporediš na rezač). Nastale rolne dobijaju QR + LOT/n.</div>
            </div>

            {!sel ? (
                <div style={card}>
                    <label style={lbl}>Izaberi matičnu rolnu iz magacina</label>
                    <input style={input} placeholder="Pretraga: broj, vrsta, oznaka, LOT, širina..." value={q} onChange={(e) => setQ(e.target.value)} />
                    <div style={{ marginTop: 10, display: "grid", gap: 6, maxHeight: 360, overflowY: "auto" }}>
                        {filtr.map((r) => (
                            <button key={r.id} onClick={() => izaberi(r)} style={{ textAlign: "left", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: "9px 11px", cursor: "pointer", fontSize: 12.5 }}>
                                <b>{r.br_rolne}</b> · {r.vrsta} {r.oznaka_materijala || r.oznaka} · {r.deb || r.debljina}µ · <b style={{ color: "#b45309" }}>{r.sirina} mm</b> × {fmt(r.metraza_ost ?? r.metraza)} m · LOT {r.lot || "—"}
                            </button>
                        ))}
                        {filtr.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13, padding: 8 }}>Nema rezultata.</div>}
                    </div>
                </div>
            ) : (
                <>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontWeight: 900 }}>Matična: {sel.br_rolne}</div>
                            <button onClick={() => setSel(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 800, cursor: "pointer" }}>← Promeni</button>
                        </div>
                        <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>{sel.vrsta} {sel.oznaka_materijala || sel.oznaka} · {sel.deb || sel.debljina}µ · <b>{sel.sirina} mm</b> × {fmt(sel.metraza_ost ?? sel.metraza)} m · LOT {sel.lot || "—"}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                            <div>
                                <label style={lbl}>Izlazne širine (mm, zarezom)</label>
                                <input style={input} value={sirine} onChange={(e) => setSirine(e.target.value)} placeholder="npr. 655,655" />
                                <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {[655, 480, 440, 330].map((w) => <button key={w} onClick={() => setSirine(autoSirine(matica.sirina, w).join(","))} style={{ fontSize: 11, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 7, padding: "4px 8px", cursor: "pointer", fontWeight: 800 }}>auto {w}mm ({Math.floor(matica.sirina / w)}×)</button>)}
                                </div>
                            </div>
                            <div>
                                <label style={lbl}>Dužina komada (m) — prazno = cela ({fmt(matica.duzina)} m)</label>
                                <input style={input} type="number" value={duzKom} onChange={(e) => setDuzKom(e.target.value)} placeholder={`${fmt(matica.duzina)}`} />
                            </div>
                        </div>
                    </div>

                    {plan && !plan.ok && plan.greska && <div style={{ ...card, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontWeight: 700 }}>{plan.greska}</div>}

                    {plan && plan.ok && (
                        <>
                            <div style={card}>
                                <div style={{ fontWeight: 900, marginBottom: 8, color: "#0f766e" }}>Prikaz rezanja</div>
                                <div style={{ textAlign: "center" }}><RezPrikaz plan={plan} /></div>
                                <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 6 }}>
                                    {plan.brojTrakaPoSirini} × traka ({plan.sirineTraka.join(" + ")} mm){plan.bocniOtpad ? ` · bočni otpad ${plan.bocniOtpad} mm` : ""} · {plan.komadaPoDuzini} komad(a) po dužini · <b>ukupno {plan.ukupnoRolni} rolni</b>
                                </div>
                            </div>

                            <div style={card}>
                                <div style={{ fontWeight: 900, marginBottom: 8, color: "#0f766e" }}>Nastale rolne (LOT/n)</div>
                                <div style={{ display: "grid", gap: 5 }}>
                                    {plan.rolne.map((r) => (
                                        <div key={r.redni} style={{ display: "flex", justifyContent: "space-between", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, padding: "6px 10px", fontSize: 12.5 }}>
                                            <span><b style={{ color: "#ea580c" }}>{r.lot}</b> · {r.sirina} mm × {fmt(r.duzina)} m</span>
                                            <span style={{ color: "#64748b" }}>{r.kg ? fmt(r.kg, 1) + " kg" : ""}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {!kreiran ? (
                                <button onClick={kreirajNalog} disabled={busy} style={{ width: "100%", background: "linear-gradient(135deg,#059669,#10b981)", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 900, fontSize: 15, cursor: "pointer" }}>
                                    {busy ? "Kreiram..." : "✓ Kreiraj nalog za formatiranje (→ Glavni nalozi / Gant)"}
                                </button>
                            ) : (
                                <div style={{ ...card, background: "#f0fdf4", border: "1px solid #16a34a" }}>
                                    <div style={{ fontWeight: 900, color: "#166534", marginBottom: 6 }}>✓ Nalog {kreiran.broj} kreiran</div>
                                    <div style={{ fontSize: 13, color: "#166534", marginBottom: 10 }}>Pojaviće se u „Glavni nalozi" i na Gantu kao neraspoređen — prevuci ga na rezač. Odštampaj nalepnice da idu uz nalog.</div>
                                    <button onClick={stampaj} style={{ background: "#0f766e", color: "#fff", border: "none", borderRadius: 10, padding: "11px 16px", fontWeight: 900, fontSize: 14, cursor: "pointer" }}>🖨️ Štampaj QR nalepnice ({kreiran.rolne.length})</button>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* skriveno za štampu */}
            <div className="fmt-labels-root" style={{ position: "fixed", left: -99999, top: 0 }}>
                {kreiran && kreiran.rolne.map((r) => <Etiketa key={r.redni} r={r} />)}
            </div>
        </div>
    );
}
