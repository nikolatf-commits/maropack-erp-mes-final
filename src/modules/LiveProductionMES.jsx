// [build v51] MAROPACK — Live Production MES kao PREGLED iz baze (jedan izvor istine).
// Mašine, statistike i operacije čita iz db (operativni_nalozi) — isti izvor kao Glavni nalozi.
// Radnik i dalje radi preko QR-a (START/PAUZA/ZAVRŠI na telefonu); ovde je samo živi pregled.
import React, { useMemo, useState } from "react";

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function minutesFrom(iso) {
    if (!iso) return 0;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 0;
    return Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
}
function normStatus(s) {
    const x = String(s || "").toLowerCase();
    if (x.indexOf("zavr") === 0 || x === "zavrseno") return "zavrseno";
    if (x.indexOf("zastoj") === 0 || x.indexOf("pauz") === 0) return "zastoj";
    if (x.indexOf("radi") === 0 || x.indexOf("toku") >= 0 || x.indexOf("proizvodnji") >= 0) return "radi";
    if (x.indexOf("sprem") === 0) return "spremno";
    return "ceka";
}
function statusBoja(s) {
    const n = normStatus(s);
    if (n === "radi") return "#059669";
    if (n === "zastoj") return "#dc2626";
    if (n === "spremno") return "#10b981";
    if (n === "zavrseno") return "#2563eb";
    return "#64748b";
}
function statusTekst(s) {
    const n = normStatus(s);
    return { radi: "U TOKU", zastoj: "ZASTOJ", spremno: "SPREMNO", zavrseno: "ZAVRSENO", ceka: "CEKA" }[n];
}
function masinaZa(op) {
    const raw = String(op.masina || "").toLowerCase();
    const t = String(op.tip_naloga || op.vrsta || op.naziv || "").toLowerCase();
    // Ako operacija ima ime mašine, normalizuj ga na jednu od baznih (Stampa 1/2, itd.)
    if (raw) {
        if (raw.includes("stamp") || raw.includes("\u0161tamp")) return raw.includes("2") ? "Stampa 2" : "Stampa 1";
        if (raw.includes("lak")) return "Lakiranje";
        if (raw.includes("kas") || raw.includes("ka\u0161")) return "Kasiranje";
        if (raw.includes("rez")) return "Rezanje";
        if (raw.includes("format")) return "Formatiranje";
        if (raw.includes("kes")) return "Kese";
        if (raw.includes("spul") || raw.includes("\u0161pul")) return "Spulne";
    }
    if (t.includes("stamp") || t.includes("\u0161tamp")) return "Stampa 1";
    if (t.includes("lak")) return "Lakiranje";
    if (t.includes("kas") || t.includes("ka\u0161")) return "Kasiranje";
    if (t.includes("perf") || t.includes("rez")) return "Rezanje";
    if (t.includes("format")) return "Formatiranje";
    if (t.includes("kes")) return "Kese";
    if (t.includes("spul") || t.includes("\u0161pul")) return "Spulne";
    if (t.includes("mater")) return "Materijal";
    return "Ostalo";
}

export default function LiveProductionMES({ db = {}, msg }) {
    const [tab, setTab] = useState("dashboard");
    const nalozi = Array.isArray(db.nalozi) ? db.nalozi : [];

    const stats = useMemo(() => {
        let aktivne = 0, zavrsene = 0, kolicina = 0, skart = 0, zastoj = 0;
        nalozi.forEach((n) => {
            const s = normStatus(n.status);
            if (s === "radi") aktivne++;
            if (s === "zavrseno") { zavrsene++; kolicina += num(n.kolicina || n.kol); }
            if (s === "zastoj") zastoj++;
            skart += num(n.skart || n.otpad_m);
        });
        return { aktivne, zavrsene, kolicina, skart, zastoj };
    }, [nalozi]);

    const masine = useMemo(() => {
        const base = ["Materijal", "Stampa 1", "Stampa 2", "Lakiranje", "Kasiranje", "Rezanje", "Kese", "Spulne", "Formatiranje"];
        const map = {};
        base.forEach((m) => { map[m] = { masina: m, op: null, status: "ceka" }; });
        nalozi.forEach((n) => {
            const s = normStatus(n.status);
            if (s === "ceka" || s === "zavrseno") return;
            const m = masinaZa(n);
            const rang = { radi: 3, zastoj: 2, spremno: 1 };
            if (!map[m] || !map[m].op || (rang[s] || 0) > (rang[normStatus(map[m].op.status)] || 0)) {
                map[m] = { masina: m, op: n, status: s };
            }
        });
        return Object.values(map);
    }, [nalozi]);

    const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, boxShadow: "0 10px 30px rgba(15,23,42,0.06)" };
    const tabs = [["dashboard", "Live dashboard"], ["operacije", "Sve operacije"], ["zavrsene", "Zavrsene"]];

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950, color: "#0f172a" }}>&#128308; Live Production MES</h2>
                    <div style={{ color: "#64748b", fontSize: 13 }}>Zivi pregled proizvodnje iz naloga. Radnik startuje operacije skeniranjem QR-a.</div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
                {[
                    ["Aktivne", stats.aktivne, "#059669"], ["Zavrsene", stats.zavrsene, "#2563eb"], ["Kolicina", stats.kolicina, "#7c3aed"], ["Skart", stats.skart, "#dc2626"], ["Zastoj", stats.zastoj, "#f59e0b"]
                ].map(([l, v, c]) => <div key={l} style={card}><div style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>{l}</div><div style={{ fontSize: 26, fontWeight: 950, color: c }}>{v}</div></div>)}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ border: tab === k ? "none" : "1px solid #cbd5e1", background: tab === k ? "#1d4ed8" : "#fff", color: tab === k ? "#fff" : "#334155", borderRadius: 999, padding: "9px 14px", fontWeight: 900, cursor: "pointer" }}>{l}</button>)}
            </div>

            {tab === "dashboard" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12 }}>
                    {masine.map((m) => (
                        <div key={m.masina} style={{ ...card, borderTop: "5px solid " + statusBoja(m.status) }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <b style={{ fontSize: 15 }}>{m.masina}</b>
                                <span style={{ color: statusBoja(m.status), fontWeight: 950, fontSize: 12 }}>{statusTekst(m.status)}</span>
                            </div>
                            {m.op ? (
                                <div style={{ marginTop: 10, color: "#475569", fontSize: 13 }}>
                                    <div>Nalog: <b>{m.op.broj_naloga || m.op.broj || "\u2014"}</b></div>
                                    <div>{m.op.proizvod || m.op.naziv || ""}</div>
                                    {m.op.radnik && <div>&#128100; {m.op.radnik}</div>}
                                    {m.op.start_ts && <div style={{ marginTop: 4, fontWeight: 800 }}>{minutesFrom(m.op.start_ts)} min</div>}
                                </div>
                            ) : <div style={{ marginTop: 10, color: "#94a3b8" }}>Ceka nalog</div>}
                        </div>
                    ))}
                </div>
            )}

            {tab === "operacije" && (
                <div style={{ display: "grid", gap: 10 }}>
                    {nalozi.filter((n) => normStatus(n.status) !== "zavrseno").length === 0 && (
                        <div style={{ ...card, color: "#94a3b8", textAlign: "center" }}>Nema aktivnih operacija.</div>
                    )}
                    {nalozi.filter((n) => normStatus(n.status) !== "zavrseno").map((n, i) => (
                        <div key={n.id || i} style={{ ...card, borderLeft: "5px solid " + statusBoja(n.status), padding: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                                <div>
                                    <b>{n.tip_naloga || n.naziv}</b> &middot; {n.proizvod || ""}
                                    <div style={{ color: "#64748b", fontSize: 13 }}>{n.broj_naloga || n.broj} &middot; {n.kupac || ""} {n.radnik ? "\u00b7 \uD83D\uDC64 " + n.radnik : ""}</div>
                                </div>
                                <span style={{ color: statusBoja(n.status), fontWeight: 950, fontSize: 12 }}>{statusTekst(n.status)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {tab === "zavrsene" && (
                <div style={{ display: "grid", gap: 10 }}>
                    {nalozi.filter((n) => normStatus(n.status) === "zavrseno").length === 0 && (
                        <div style={{ ...card, color: "#94a3b8", textAlign: "center" }}>Jos nema zavrsenih operacija.</div>
                    )}
                    {nalozi.filter((n) => normStatus(n.status) === "zavrseno").map((n, i) => (
                        <div key={n.id || i} style={{ ...card, borderLeft: "5px solid #2563eb", padding: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                                <div>
                                    <b>{n.tip_naloga || n.naziv}</b> &middot; {n.proizvod || ""}
                                    <div style={{ color: "#64748b", fontSize: 13 }}>{n.broj_naloga || n.broj} {n.radnik ? "\u00b7 \uD83D\uDC64 " + n.radnik : ""} {n.kolicina ? "\u00b7 " + n.kolicina : ""}</div>
                                </div>
                                <span style={{ color: "#2563eb", fontWeight: 950, fontSize: 12 }}>ZAVRSENO</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
