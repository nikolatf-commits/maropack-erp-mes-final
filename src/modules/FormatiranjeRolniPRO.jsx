import React, { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../supabase.js";

// ── helpers ────────────────────────────────────────────────────────────────
function number(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function round2(v) { return Math.round(number(v) * 100) / 100; }
function fmt(v, dec = 2) { return number(v).toLocaleString("sr-RS", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function now() { return new Date().toLocaleString("sr-RS"); }

function extractQrFromScan(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.startsWith("MAROPACK|ROLNA|")) return raw.split("|").slice(2).join("|").trim();
    try { const p = JSON.parse(raw); return String(p.qr || p.qr_code || p.br_rolne || raw).trim(); }
    catch { const m = raw.match(/ROLNA[-_A-Z0-9]+/i); return m ? m[0] : raw; }
}
function rollQrPayload(code) {
    const c = String(code || "").trim();
    return c ? `MAROPACK|ROLNA|${c}` : "";
}
function makeBrRolne() {
    return `ROLNA-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`;
}
function cleanOznaka(value, vrsta = "") {
    let v = String(value || "").trim();
    const t = String(vrsta || "").trim();
    if (t && v.toLowerCase().startsWith(t.toLowerCase() + " ")) v = v.slice(t.length).trim();
    return v;
}

// ── QR nalepnica 100×140 mm (isti format kao RolneWarehouseEngine) ──────────
const td = { border: "1px solid #111", padding: 3 };
const tdh = { ...td, fontWeight: 900 };
function RollLabel({ roll }) {
    const oznaka = cleanOznaka(roll.oznaka_materijala || roll.oznaka || "", roll.vrsta);
    return (
        <div className="roll-label-print" style={{ width: "100mm", height: "140mm", background: "#fff", border: "1px solid #111827", padding: "5mm", boxSizing: "border-box", fontFamily: "Arial, sans-serif", color: "#111827", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #111827", paddingBottom: 4 }}>
                <div>
                    <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: .4 }}>MAROPACK</div>
                    <div style={{ fontSize: 9, fontWeight: 800 }}>ETIKETA ROLNE — FORMATIRANO</div>
                </div>
                <div style={{ fontSize: 9, fontWeight: 900 }}>100 × 140 mm</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "34mm 1fr", gap: 5, marginTop: 5 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <QRCodeSVG value={rollQrPayload(roll.qr)} size={150} level="M" includeMargin={true} />
                </div>
                <div style={{ fontSize: 10, lineHeight: 1.35 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, wordBreak: "break-all" }}>{roll.qr}</div>
                    <div><b>Vrsta:</b> {roll.vrsta || "—"}</div>
                    <div><b>Oznaka:</b> {oznaka || "—"}</div>
                    <div><b>Dobavljač:</b> {roll.dobavljac || "—"}</div>
                </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 5, fontSize: 10 }}>
                <tbody>
                    <tr><td style={tdh}>DEB.</td><td style={td}>{roll.deb || "—"} µ</td><td style={tdh}>ŠIRINA</td><td style={td}>{roll.sirina} mm</td></tr>
                    <tr><td style={tdh}>METRAŽA</td><td style={td}>{fmt(roll.metraza, 0)} m</td><td style={tdh}>KG</td><td style={td}>{fmt(roll.kg_neto, 2)}</td></tr>
                    <tr><td style={tdh}>LOT</td><td style={td}>{roll.lot || "—"}</td><td style={tdh}>LOKACIJA</td><td style={td}>{roll.lokacija || "—"}</td></tr>
                </tbody>
            </table>
            <div style={{ marginTop: 5, borderTop: "1px solid #111", paddingTop: 4, fontSize: 9 }}>
                <b>Matična rolna:</b> {roll.parent_br || "—"}
            </div>
            <div style={{ marginTop: 7, borderTop: "2px solid #111", paddingTop: 6, fontSize: 8 }}>
                Skeniranjem QR koda otvara se istorija i status rolne.
            </div>
        </div>
    );
}

const PrintCSS = () => (
    <style>{`
    @media print {
      @page { size: 100mm 140mm; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; width: 100mm !important; background: #fff !important; }
      body * { visibility: hidden !important; }
      .roll-label-print-root, .roll-label-print-root * { visibility: visible !important; }
      .roll-label-print-root { position: absolute !important; left: 0 !important; top: 0 !important; }
      .roll-label-print { width: 100mm !important; height: 140mm !important; margin: 0 !important; padding: 5mm !important; border: none !important; page-break-after: always !important; break-after: page !important; box-sizing: border-box !important; }
      .roll-label-print:last-child { page-break-after: auto !important; break-after: auto !important; }
      .no-print { display: none !important; }
    }
  `}</style>
);

// ── glavna komponenta ───────────────────────────────────────────────────────
export default function FormatiranjeRolniPRO({ msg }) {
    const [parentQr, setParentQr] = useState("");
    const [matica, setMatica] = useState(null);          // učitana matična rolna iz baze
    const [trake, setTrake] = useState("480,480,480");
    const [duzinaReza, setDuzinaReza] = useState("");     // koliko metara režemo (prazno = cela)
    const [busy, setBusy] = useState(false);
    const [nastale, setNastale] = useState([]);           // role za štampu posle reza
    const [bulk, setBulk] = useState(false);

    const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.05)" };
    const input = { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #cbd5e1", boxSizing: "border-box" };
    const btn = { border: "none", borderRadius: 12, padding: "12px 16px", fontWeight: 900, cursor: "pointer" };
    const lbl = { display: "block", fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 5 };

    async function nadjiMaticu() {
        const qr = extractQrFromScan(parentQr);
        if (!qr) { msg?.("Skeniraj ili unesi QR matične rolne.", "err"); return; }
        if (supabase?.__notConfigured) { msg?.("Supabase nije povezan.", "err"); return; }
        setBusy(true);
        try {
            let { data, error } = await supabase.from("magacin").select("*").eq("br_rolne", qr).limit(1);
            if (error) throw error;
            if (!data?.[0]) {
                const res = await supabase.from("magacin").select("*").eq("qr_code", qr).limit(1);
                if (res.error) throw res.error;
                data = res.data;
            }
            if (!data?.[0]) { msg?.(`Rolna nije pronađena: ${qr}`, "err"); setMatica(null); return; }
            setMatica(data[0]);
            setNastale([]);
            msg?.(`Matična učitana: ${data[0].br_rolne} · ${data[0].sirina} mm × ${fmt(data[0].metraza_ost ?? data[0].metraza, 0)} m`);
        } catch (e) {
            msg?.("Greška pri traženju matične: " + (e?.message || e), "err");
        } finally {
            setBusy(false);
        }
    }

    // plan reza — sve se računa PRE upisa
    const plan = useMemo(() => {
        const sirinaMat = number(matica?.sirina);
        const duzinaDost = number(matica?.metraza_ost ?? matica?.metraza);
        const widths = trake.split(/[,;\s]+/).map((x) => number(x)).filter((x) => x > 0);
        const used = widths.reduce((a, b) => a + b, 0);
        const rez = duzinaReza === "" ? duzinaDost : Math.min(number(duzinaReza), duzinaDost);
        const ostatakDuzine = Math.max(0, round2(duzinaDost - rez));
        const bocniOtpad = Math.max(0, round2(sirinaMat - used));
        const okSirina = sirinaMat > 0 && used <= sirinaMat && widths.length > 0;
        const okDuzina = rez > 0;
        // koliko nalepnica: po jedna za svaku novu traku + (1 za ostatak matične ako ostaje)
        const brNalepnica = widths.length + (ostatakDuzine > 0 ? 1 : 0);
        return { widths, used, rez, ostatakDuzine, bocniOtpad, okSirina, okDuzina, sirinaMat, duzinaDost, brNalepnica };
    }, [matica, trake, duzinaReza]);

    // kg nove role = kg matične × (nova širina/šir. matične) × (rez dužine/dost. dužine)
    function kgZaTraku(w) {
        const kgMat = number(matica?.kg_neto ?? matica?.kg_bruto);
        const sMat = number(matica?.sirina);
        const dDost = number(matica?.metraza_ost ?? matica?.metraza);
        if (!kgMat || !sMat || !dDost) return 0;
        return round2(kgMat * (number(w) / sMat) * (plan.rez / dDost));
    }

    // sledeći slobodan LOT sufiks: L-847 -> L-847-1, -2... (brojač NE kreće od nule)
    async function sledeciLotBaza(lotBaza) {
        let start = 0;
        try {
            const { data } = await supabase.from("magacin").select("lot").ilike("lot", lotBaza + "-%").limit(500);
            (data || []).forEach((r) => {
                const m = String(r.lot || "").match(new RegExp("^" + lotBaza.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-(\\d+)$"));
                if (m) start = Math.max(start, Number(m[1]));
            });
        } catch (e) { /* ako ne uspe, kreni od 0 */ }
        return start;
    }

    async function formatiraj() {
        if (!matica) { msg?.("Prvo pronađi matičnu rolnu.", "err"); return; }
        if (!plan.okSirina) { msg?.("Zbir širina prelazi matičnu rolnu ili nije unet.", "err"); return; }
        if (!plan.okDuzina) { msg?.("Dužina reza mora biti veća od 0.", "err"); return; }
        if (supabase?.__notConfigured) { msg?.("Supabase nije povezan.", "err"); return; }
        setBusy(true);
        try {
            const lotBaza = String(matica.lot || matica.br_rolne || "LOT").trim();
            const vecPostoji = await sledeciLotBaza(lotBaza);
            const nowIso = new Date().toISOString();
            const danas = nowIso.slice(0, 10);

            // 1) napravi redove za nove role
            const noveRole = plan.widths.map((w, i) => {
                const br = makeBrRolne();
                return {
                    br_rolne: br,
                    qr_code: br,
                    tip: matica.tip || null,
                    vrsta: matica.vrsta || null,
                    pod_vrsta: matica.pod_vrsta || null,
                    oznaka_materijala: matica.oznaka_materijala || null,
                    deb: number(matica.deb) || null,
                    sirina: number(w),
                    metraza: plan.rez,
                    metraza_ost: plan.rez,
                    kg_neto: kgZaTraku(w),
                    kg_bruto: kgZaTraku(w),
                    lot: `${lotBaza}-${vecPostoji + i + 1}`,
                    dobavljac: matica.dobavljac || null,
                    cena_kg: number(matica.cena_kg) || null,
                    vrednost: number(matica.cena_kg) ? round2(kgZaTraku(w) * number(matica.cena_kg)) : null,
                    datum: danas,
                    datum_prijema: matica.datum_prijema || danas,
                    datum_proizvodnje: matica.datum_proizvodnje || null,
                    status: "Na stanju",
                    lokacija: matica.lokacija || "Magacin / formatirano",
                    napomena: `Formatirano iz ${matica.br_rolne} (${matica.sirina}mm) · ${plan.widths.length}× rez`,
                };
            });

            const { data: inserted, error: insErr } = await supabase.from("magacin").insert(noveRole).select("*");
            if (insErr) throw new Error("Upis novih rolni nije uspeo: " + insErr.message);

            // 2) skini matičnu za odrezanu dužinu (ostatak ostaje na stanju; ako je 0 → iskorišćeno)
            const novoOstatak = plan.ostatakDuzine;
            const maticaUpdate = {
                metraza_ost: novoOstatak,
                status: novoOstatak > 0 ? (matica.status || "Na stanju") : "Iskorišćeno",
                updated_at: nowIso,
                napomena: [matica.napomena, `Formatirano ${now()}: -${fmt(plan.rez, 0)} m u ${plan.widths.length} traka`].filter(Boolean).join(" · "),
            };
            // kg matične proporcionalno umanji
            const kgMat = number(matica.kg_neto ?? matica.kg_bruto);
            const dDost = number(matica.metraza_ost ?? matica.metraza);
            if (kgMat && dDost) maticaUpdate.kg_neto = round2(kgMat * (novoOstatak / dDost));

            const { error: updErr } = await supabase.from("magacin").update(maticaUpdate).eq("id", matica.id);
            if (updErr) throw new Error("Ažuriranje matične nije uspelo: " + updErr.message);

            // 3) trag u istoriju (ne blokira ako padne)
            try {
                await supabase.from("magacin_istorija").insert({
                    br_rolne: matica.br_rolne,
                    tip_promene: "FORMATIRANJE",
                    opis: `${matica.sirina}mm → ${plan.widths.join("+")}mm × ${fmt(plan.rez, 0)}m · ${noveRole.length} nove role · ostatak ${fmt(novoOstatak, 0)}m`,
                });
            } catch (e) { /* istorija nije kritična */ }

            const roleZaStampu = (inserted || noveRole).map((r) => ({ ...r, parent_br: matica.br_rolne }));
            setNastale(roleZaStampu);
            msg?.(`Formatirano: ${noveRole.length} novih rolni upisano u magacin. Matična: ${novoOstatak > 0 ? "ostaje " + fmt(novoOstatak, 0) + " m" : "iskorišćena"}.`);
        } catch (e) {
            msg?.(String(e?.message || e), "err");
        } finally {
            setBusy(false);
        }
    }

    function stampaj() {
        if (!nastale.length) return;
        setBulk(true);
        setTimeout(() => {
            const root = document.querySelector(".roll-label-print-root");
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
        }, 50);
    }

    const dostM = number(matica?.metraza_ost ?? matica?.metraza);

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <PrintCSS />
            <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>🎞️ Formatiranje rolni PRO</h2>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Skeniraj matičnu rolnu, unesi plan reza — nove role idu u magacin sa svojim QR-om i nasleđenim LOT-om.</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>
                {/* ULAZ */}
                <div style={card}>
                    <div style={{ fontWeight: 900, marginBottom: 12 }}>1 · Matična rolna</div>
                    <label style={{ display: "block", marginBottom: 10 }}><span style={lbl}>QR / broj matične rolne</span>
                        <input style={input} value={parentQr} onChange={(e) => setParentQr(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") nadjiMaticu(); }} placeholder="Skeniraj ROLNA-..." /></label>
                    <button onClick={nadjiMaticu} disabled={busy} style={{ ...btn, background: "#0f172a", color: "#fff", width: "100%" }}>Pronađi matičnu</button>

                    {matica && (
                        <div style={{ marginTop: 12, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: 12, fontSize: 13 }}>
                            <div style={{ fontWeight: 900 }}>{matica.br_rolne}</div>
                            <div>{matica.vrsta || "—"} · {cleanOznaka(matica.oznaka_materijala, matica.vrsta) || "—"} · {matica.deb || "—"} µ</div>
                            <div><b>{matica.sirina} mm × {fmt(dostM, 0)} m</b> · {fmt(matica.kg_neto ?? matica.kg_bruto, 2)} kg</div>
                            <div style={{ color: "#64748b" }}>LOT {matica.lot || "—"} · {matica.lokacija || "—"}</div>
                        </div>
                    )}

                    {matica && (
                        <>
                            <div style={{ fontWeight: 900, margin: "16px 0 12px" }}>2 · Plan reza</div>
                            <label style={{ display: "block", marginBottom: 10 }}><span style={lbl}>Izlazne širine mm (zarezom)</span>
                                <input style={input} value={trake} onChange={(e) => setTrake(e.target.value)} placeholder="480,480,480" /></label>
                            <label style={{ display: "block", marginBottom: 10 }}><span style={lbl}>Dužina reza m (prazno = cela: {fmt(dostM, 0)} m)</span>
                                <input style={input} type="number" value={duzinaReza} onChange={(e) => setDuzinaReza(e.target.value)} placeholder={`${fmt(dostM, 0)}`} /></label>
                            <button onClick={formatiraj} disabled={busy || !plan.okSirina || !plan.okDuzina} style={{ ...btn, background: (plan.okSirina && plan.okDuzina && !busy) ? "#059669" : "#cbd5e1", color: "#fff", width: "100%" }}>
                                {busy ? "Obrađujem…" : "✂️ Formatiraj i upiši u magacin"}
                            </button>
                        </>
                    )}
                </div>

                {/* PLAN / REZULTAT */}
                <div style={card}>
                    {!matica ? (
                        <div style={{ color: "#64748b", padding: 30, textAlign: "center" }}>Skeniraj matičnu rolnu da vidiš plan reza.</div>
                    ) : (
                        <>
                            <div style={{ fontWeight: 900, marginBottom: 12 }}>Grafički plan reza</div>
                            <div style={{ display: "flex", height: 80, border: "1px solid #cbd5e1", borderRadius: 12, overflow: "hidden", background: "#f8fafc" }}>
                                {plan.widths.map((w, i) => <div key={i} style={{ width: `${(w / plan.sirinaMat) * 100}%`, background: i % 2 ? "#dbeafe" : "#bfdbfe", borderRight: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#1e3a8a", fontSize: 13 }}>{w}</div>)}
                                {plan.bocniOtpad > 0 && <div style={{ width: `${(plan.bocniOtpad / plan.sirinaMat) * 100}%`, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#b91c1c", fontSize: 12 }}>otpad {plan.bocniOtpad}</div>}
                            </div>

                            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                                {[
                                    ["Nastaje novih rolni", `${plan.widths.length} × ${fmt(plan.rez, 0)} m`],
                                    ["Bočni otpad", `${plan.bocniOtpad} mm`],
                                    ["Ostatak matične", plan.ostatakDuzine > 0 ? `${fmt(plan.ostatakDuzine, 0)} m ostaje na stanju` : "0 — matična iskorišćena"],
                                    ["Nalepnica za štampu", `${plan.brNalepnica}`],
                                ].map(([a, b]) => <div key={a} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
                                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>{a}</div>
                                    <div style={{ fontWeight: 900, marginTop: 3 }}>{b}</div>
                                </div>)}
                            </div>

                            {!plan.okSirina && <div style={{ marginTop: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 10, color: "#b91c1c", fontWeight: 700, fontSize: 13 }}>⚠ Zbir širina ({plan.used} mm) prelazi matičnu rolnu ({plan.sirinaMat} mm) ili nije unet.</div>}

                            {nastale.length > 0 && (
                                <div style={{ marginTop: 16, background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 12, padding: 14 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
                                        <div style={{ fontWeight: 900, color: "#065f46" }}>✅ Formatirano — {nastale.length} novih rolni u magacinu</div>
                                        <button onClick={stampaj} style={{ ...btn, background: "#059669", color: "#fff" }}>🖨️ Štampaj {nastale.length} nalepnica</button>
                                    </div>
                                    <div style={{ display: "grid", gap: 6 }}>
                                        {nastale.map((r) => <div key={r.br_rolne} style={{ display: "flex", justifyContent: "space-between", gap: 10, background: "#fff", border: "1px solid #d1fae5", borderRadius: 8, padding: "7px 11px", fontSize: 13 }}>
                                            <span style={{ fontWeight: 800 }}>{r.br_rolne}</span>
                                            <span>{r.sirina} mm × {fmt(r.metraza, 0)} m · LOT {r.lot}</span>
                                        </div>)}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* skriveni root za štampu */}
            {bulk && nastale.length > 0 && (
                <div className="roll-label-print-root" style={{ position: "fixed", left: -99999, top: 0 }}>
                    {nastale.map((r) => <RollLabel key={r.br_rolne} roll={r} />)}
                </div>
            )}
        </div>
    );
}
