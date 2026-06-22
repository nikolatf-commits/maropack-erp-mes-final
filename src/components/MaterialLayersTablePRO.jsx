import React, { useMemo } from "react";
import MaterialSelectorPRO, { buildLayerPayload } from "./MaterialSelectorPRO.jsx";
import { calculateGm2, getKoeficijent } from "../data/materialMaster.js";

const tableWrap = { width: "100%", overflowX: "auto", border: "1px solid #dbe3ef", borderRadius: 14, background: "#fff" };
const table = { width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1250, fontSize: 13 };
const th = { textAlign: "left", padding: "10px 12px", background: "#f8fafc", color: "#64748b", fontSize: 11, fontWeight: 900, textTransform: "uppercase", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" };
const td = { padding: "9px 10px", borderBottom: "1px solid #edf2f7", verticalAlign: "middle" };
const input = { width: "100%", boxSizing: "border-box", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#0f172a", fontWeight: 700 };
const smallBtn = { height: 36, minWidth: 36, borderRadius: 9, border: "1px solid #fecaca", background: "#fff1f2", color: "#dc2626", fontWeight: 900, cursor: "pointer" };
const checkbox = { width: 17, height: 17, cursor: "pointer", accentColor: "#059669" };

function patchLayer(base = {}, patch = {}, index = 0) {
    return buildLayerPayload({ sloj: base.sloj || index + 1, ...base, ...patch });
}

export default function MaterialLayersTablePRO({
    layers = [],
    onChange,
    onAdd,
    onRemove,
    maxLayers,
    title = "Struktura materijala",
    showPrice = true,
    showFlags = true,
    templateMode = false,
}) {
    // Ne „patchuj" (ne normalizuj) na svaki render — to pravi nove objekte i izaziva treperenje inputa.
    // Koristi sirove slojeve; normalizacija ide samo kad se nešto stvarno promeni (updateRow/addRow).
    const rows = layers.length ? layers : [patchLayer({}, {}, 0)];

    const totals = useMemo(() => {
        const totalDeb = rows.reduce((s, x) => s + Number(x.debljina || 0), 0);
        const totalGm2 = rows.reduce((s, x) => s + Number(x.gm2 || x.tezina || calculateGm2(x.vrsta, x.debljina) || 0), 0);
        const totalPrice = rows.reduce((s, x) => s + Number(x.cena || 0), 0);
        const idealWidths = rows.map(x => Number(x.idealna_sirina || 0)).filter(Boolean);
        const recommendedWidth = idealWidths.length ? Math.max(...idealWidths) : 0;
        const suppliers = [...new Set(rows.map(x => x.dobavljac).filter(Boolean))].join(", ") || "—";
        return { totalDeb, totalGm2, totalPrice, recommendedWidth, suppliers };
    }, [rows]);

    const updateRow = (index, patch) => {
        // Patchuj SAMO izmenjeni red; ostale ostavi netaknute (ista referenca) — bez treperenja.
        const next = rows.map((r, i) => i === index ? patchLayer(r, patch, i) : r);
        onChange?.(next);
    };

    const addRow = () => {
        if (maxLayers && rows.length >= maxLayers) return;
        const newRow = patchLayer({ vrsta: "BOPP", pod_vrsta: "Transparent", oznaka_materijala: "FXCB", debljina: 20, idealna_sirina: rows[0]?.idealna_sirina || "", cena: "", stampa: false, lakira: false }, {}, rows.length);
        if (onAdd) onAdd(newRow);
        else onChange?.([...rows, newRow]);
    };

    const removeRow = (index) => {
        if (rows.length <= 1) return;
        if (onRemove) onRemove(index);
        else onChange?.(rows.filter((_, i) => i !== index).map((x, i) => patchLayer(x, { sloj: i + 1 }, i)));
    };

    return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>{title}</h3>
                <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>{templateMode ? "Definiši sve slojeve koji ulaze u proizvod. AI koristi ove podatke za FIFO izbor rolni." : "Svi materijalni slojevi sa idealnom širinom za plan rezanja."}</div>
            </div>
            <button type="button" onClick={addRow} disabled={maxLayers && rows.length >= maxLayers} style={{ padding: "9px 14px", background: "#059669", color: "#fff", border: 0, borderRadius: 10, fontWeight: 900, cursor: "pointer", opacity: maxLayers && rows.length >= maxLayers ? .45 : 1 }}>+ Dodaj sloj</button>
        </div>

        <div style={tableWrap}>
            <table style={table}>
                <thead><tr>
                    <th style={{ ...th, width: 42 }}>Sloj</th>
                    <th style={{ ...th, width: 430 }}>Materijalni identitet</th>
                    <th style={{ ...th, width: 105 }}>Koef.</th>
                    <th style={{ ...th, width: 115 }}>g/m²</th>
                    <th style={{ ...th, width: 125 }}>Cena €/kg</th>
                    <th style={{ ...th, width: 145 }}>Dobavljač</th>
                    <th style={{ ...th, width: 160 }}>Napomena</th>
                    {showFlags && <><th style={th}>Štampa</th><th style={th}>Lak</th></>}
                    <th style={{ ...th, width: 76 }}>Akcije</th>
                </tr></thead>
                <tbody>
                    {rows.map((layer, i) => {
                        const koef = layer.koeficijent || getKoeficijent(layer.vrsta);
                        const gm2 = layer.gm2 || layer.tezina || calculateGm2(layer.vrsta, layer.debljina);
                        return <tr key={i}>
                            <td style={{ ...td, fontWeight: 900 }}>{i + 1}</td>
                            <td style={td}><MaterialSelectorPRO compact value={layer} onChange={(patch) => updateRow(i, patch)} /></td>
                            <td style={td}><input style={{ ...input, background: "#f8fafc" }} value={koef || ""} readOnly /></td>
                            <td style={td}><input style={{ ...input, background: "#fef3c7", color: "#92400e" }} value={gm2 || 0} readOnly /></td>
                            <td style={td}>{showPrice ? <input style={input} type="number" value={layer.cena || ""} onChange={(e) => updateRow(i, { cena: e.target.value })} /> : "—"}</td>
                            <td style={td}><input style={input} value={layer.dobavljac || ""} onChange={(e) => updateRow(i, { dobavljac: e.target.value })} placeholder="npr. Milan Foil" /></td>
                            <td style={td}><input style={input} value={layer.napomena || ""} onChange={(e) => updateRow(i, { napomena: e.target.value })} placeholder="spoljašnji sloj..." /></td>
                            {showFlags && <><td style={td}><input style={checkbox} type="checkbox" checked={!!layer.stampa} onChange={(e) => updateRow(i, { stampa: e.target.checked })} /></td><td style={td}><input style={checkbox} type="checkbox" checked={!!layer.lakira} onChange={(e) => updateRow(i, { lakira: e.target.checked })} /></td></>}
                            <td style={td}><button type="button" onClick={() => removeRow(i)} disabled={rows.length <= 1} style={{ ...smallBtn, opacity: rows.length <= 1 ? .4 : 1 }}>×</button></td>
                        </tr>;
                    })}
                </tbody>
            </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 12 }}>
            <Summary label="Ukupna debljina" value={`${totals.totalDeb.toFixed(0)} µ`} />
            <Summary label="Ukupno g/m²" value={`${totals.totalGm2.toFixed(1)}`} />
            <Summary label="Preporučena širina" value={totals.recommendedWidth ? `${totals.recommendedWidth} mm` : "—"} />
            <Summary label="Dobavljači" value={totals.suppliers} />
            <Summary label="FIFO pravilo" value="Po datumu proizvodnje" />
        </div>
    </div>;
}

function Summary({ label, value }) {
    return <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
        <div style={{ marginTop: 5, fontSize: 16, color: "#0f172a", fontWeight: 900 }}>{value}</div>
    </div>;
}
