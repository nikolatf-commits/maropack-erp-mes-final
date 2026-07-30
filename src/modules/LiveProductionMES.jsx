// [build v54] MAROPACK — Live Production MES kao PREGLED iz baze (jedan izvor istine).
// v52: NE koristi više hardkodovanih 9 generičkih mašina ("Stampa 1", "Rezanje"...).
//      Mašine i raspored čita iz ISTOG izvora kao Plan proizvodnje (MachineSchedulerPRO):
//      loadMachines() + loadProductionPlan() iz erpMesCore — pa kad planer prevuče
//      MP-2026-0001-PERFORACIJA_REZANJE na "Rezač 1", ovde se to ODMAH vidi na Rezaču 1.
// v53: numerisan red po mašini (1., 2., 3...) + procena trajanja = setup + metri/brzina mašine.
// Statusi operacija i dalje dolaze iz db.nalozi (operativni_nalozi) — radnik radi preko
// QR-a (START/PAUZA/ZAVRŠI na telefonu); ovo je samo živi pregled.
import React, { useEffect, useMemo, useState } from "react";
// NAPOMENA: ista putanja kao u MachineSchedulerPRO.jsx. Ako LiveProductionMES stoji u
// drugom folderu, prilagodi na "./services/erpMesCore.js".
import { loadMachines, loadProductionPlan } from "../services/erpMesCore.js";
// v54: zajednička logika naloga — jedan izvor istine (isti kao planer i AI agent)
import { metriMasineNaloga, procenaMinNaMasini, stvarnoMin, mapaOperacija, nadjiBlokadu, opKljuc, OP_LABELE, canonRef } from "../utils/nalogMetrika.js";

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
    if (s === "radi") return "#059669";
    if (s === "zastoj") return "#dc2626";
    if (s === "spremno") return "#10b981";
    if (s === "zavrseno") return "#2563eb";
    if (s === "servis") return "#f59e0b";
    return "#64748b";
}
function statusTekst(s) {
    return { radi: "U TOKU", zastoj: "ZASTOJ", spremno: "SPREMNO", zavrseno: "ZAVRSENO", servis: "SERVIS", ceka: "CEKA" }[s] || "CEKA";
}
// Isti ključ naloga kao u MachineSchedulerPRO (plan čuva ID-jeve u ovom obliku).
function nalogKey(n) { return String(n.broj_naloga || n.broj || n.id || ""); }
// Procena trajanja NA MAŠINI: setup + metri / brzina (m/min). Ručno trajanje_min ima prednost.
function procenaMin(masina, n) {
    if (!n) return 0;
    const rucno = num(n.trajanje_min || n.durationMin);
    if (rucno > 0) return rucno;
    return procenaMinNaMasini(masina, metriMasineNaloga(n));
}
function opLabel(n) {
    const t = String(n.tip_naloga || n.vrsta || n.naziv || "").toLowerCase();
    if (t.includes("\u0161tamp") || t.includes("stamp")) return "\u0160TAMPA";
    if (t.includes("lak")) return "LAKIRANJE";
    if (t.includes("ka\u0161") || t.includes("kas")) return "KA\u0160IRANJE";
    if (t.includes("perf") || t.includes("rez")) return "REZANJE";
    if (t.includes("format")) return "FORMATIRANJE";
    if (t.includes("kes")) return "KESE";
    if (t.includes("\u0161pul") || t.includes("spul")) return "\u0160PULNE";
    if (t.includes("mater")) return "MATERIJAL";
    return "OPERACIJA";
}

export default function LiveProductionMES({ db = {}, msg }) {
    const [tab, setTab] = useState("dashboard");
    const [filter, setFilter] = useState("sve");
    const [machines, setMachines] = useState([]);
    const [plan, setPlan] = useState({});
    const [, setTick] = useState(0); // osvežava "X min" brojače
    const nalozi = Array.isArray(db.nalozi) ? db.nalozi : [];

    // Mašine + plan iz istog izvora kao Plan proizvodnje. Osvežavanje:
    // - na mount
    // - na "maropack:nalozi-changed" (radnik startovao/završio preko QR-a)
    // - lagani interval od 20s (planer u drugom tabu prevuče nalog → ovde se pojavi)
    useEffect(() => {
        let ziv = true;
        async function ucitaj() {
            try {
                const [m, p] = await Promise.all([loadMachines(), loadProductionPlan()]);
                if (!ziv) return;
                setMachines(Array.isArray(m) ? m : []);
                setPlan(p && typeof p === "object" ? p : {});
            } catch (e) { /* bez rušenja live pregleda */ }
        }
        ucitaj();
        const onChange = () => ucitaj();
        window.addEventListener("maropack:nalozi-changed", onChange);
        const t = setInterval(() => { ucitaj(); setTick(x => x + 1); }, 20000);
        return () => { ziv = false; window.removeEventListener("maropack:nalozi-changed", onChange); clearInterval(t); };
    }, []);

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

    // v54: statusi svih operacija po glavnom nalogu — da kartica pokaže "⏳ čeka ŠTAMPU"
    const opStatusi = useMemo(() => mapaOperacija(nalozi), [nalozi]);

    const nalogMap = useMemo(() => {
        const m = {};
        nalozi.forEach((n) => { const k = nalogKey(n); if (k) m[k] = n; });
        return m;
    }, [nalozi]);

    // Kartica po PRAVOJ mašini (Rezač 1..10, Mašina za kese 1..15, Špulna 1-2, Kaširka 1):
    // operacije sa te mašine = plan[machine.id], status mašine = najjači status njenih operacija.
    const kartice = useMemo(() => {
        const rang = { radi: 5, zastoj: 4, spremno: 3, ceka: 2 };
        return machines.map((m) => {
            const ops = (plan[m.id] || [])
                .map((id) => nalogMap[id])
                .filter((n) => n && normStatus(n.status) !== "zavrseno");
            let st = m.status === "aktivna" ? "ceka" : "servis";
            if (m.status === "aktivna") {
                ops.forEach((n) => {
                    let s = normStatus(n.status);
                    if (s === "ceka") s = "spremno"; // dodeljen mašini, čeka start = SPREMNO
                    if ((rang[s] || 0) > (rang[st] || 0)) st = s;
                });
            }
            return { m, ops, st };
        });
    }, [machines, plan, nalogMap]);

    // Aktivne operacije koje NISU ni na jednoj mašini u planu — da ništa ne bude nevidljivo.
    const vanPlana = useMemo(() => {
        const uPlanu = new Set(Object.values(plan).flat());
        return nalozi.filter((n) => {
            const s = normStatus(n.status);
            return (s === "radi" || s === "zastoj") && !uPlanu.has(nalogKey(n));
        });
    }, [nalozi, plan]);

    const shown = kartice.filter((k) => filter === "sve" || k.m.type === filter);
    const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, boxShadow: "0 10px 30px rgba(15,23,42,0.06)" };
    const tabs = [["dashboard", "Live dashboard"], ["operacije", "Sve operacije"], ["zavrsene", "Zavrsene"]];
    const filteri = [["sve", "Sve"], ["rezanje", "Reza\u010di"], ["kese", "Kese"], ["spulne", "\u0160pulne"], ["kasiranje", "Ka\u0161iranje"], ["stampa", "\u0160tamparije"]];
    const radiUkupno = kartice.filter((k) => k.st === "radi").length;

    function OpRed({ n, poz, masina }) {
        const s0 = normStatus(n.status);
        const s = s0 === "ceka" ? "spremno" : s0;
        const est = procenaMin(masina, n);
        // redosled: rezanje ne kreće pre štampe istog naloga itd.
        const blokada = (s === "spremno") ? nadjiBlokadu(canonRef(nalogKey(n)), opKljuc(n), opStatusi) : null;
        return (
            <div style={{ marginTop: 8, padding: "7px 9px", borderRadius: 10, background: "#f8fafc", borderLeft: "4px solid " + statusBoja(s), display: "flex", gap: 8, alignItems: "flex-start" }}>
                {poz > 0 && <span style={{ minWidth: 21, height: 21, borderRadius: 7, background: statusBoja(s), color: "#fff", fontSize: 11, fontWeight: 950, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{poz}</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <b style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{opLabel(n)} &middot; {nalogKey(n)}</b>
                        <span style={{ color: statusBoja(s), fontWeight: 950, fontSize: 11, whiteSpace: "nowrap" }}>{statusTekst(s)}</span>
                    </div>
                    <div style={{ color: "#64748b", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.proizvod || n.naziv || ""}{n.kupac ? " \u00b7 " + n.kupac : ""}</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 12, color: "#475569", flexWrap: "wrap" }}>
                        {n.radnik && <span>&#128100; {n.radnik}</span>}
                        {s === "radi" && n.start_ts && <span style={{ fontWeight: 800, color: "#059669" }}>&#9201;&#65039; {minutesFrom(n.start_ts)} min radi</span>}
                        {est > 0 && <span style={{ fontWeight: 800 }} title={"setup + metri \u00f7 brzina ma\u0161ine"}>{metriMasineNaloga(n).toLocaleString("sr-RS")} m &middot; &#8776;{est} min</span>}
                    </div>
                    {blokada && <div style={{ marginTop: 4 }}><span style={{ fontSize: 10, fontWeight: 900, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", borderRadius: 6, padding: "1px 7px" }}>&#9203; čeka {OP_LABELE[blokada] || blokada} — ne startovati pre nje</span></div>}
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950, color: "#0f172a" }}>&#128308; Live Production MES</h2>
                    <div style={{ color: "#64748b", fontSize: 13 }}>
                        Zivi pregled proizvodnje: {machines.length} masina iz plana proizvodnje &middot; {radiUkupno} radi. Radnik startuje operacije skeniranjem QR-a.
                    </div>
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
                <>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {filteri.map(([k, l]) => <button key={k} onClick={() => setFilter(k)} style={{ border: "1px solid #cbd5e1", background: filter === k ? "#0f172a" : "#fff", color: filter === k ? "#fff" : "#334155", borderRadius: 10, padding: "7px 12px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{l}</button>)}
                    </div>

                    {vanPlana.length > 0 && (
                        <div style={{ ...card, borderLeft: "5px solid #f59e0b", padding: 14 }}>
                            <b style={{ fontSize: 13 }}>&#9888;&#65039; Aktivne operacije van plana masina ({vanPlana.length})</b>
                            <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>Rade, a nisu prevucene ni na jednu masinu u Planu proizvodnje.</div>
                            {vanPlana.map((n, i) => <OpRed key={nalogKey(n) || i} n={n} poz={0} masina={null} />)}
                        </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12 }}>
                        {shown.length === 0 && (
                            <div style={{ ...card, color: "#94a3b8", textAlign: "center", gridColumn: "1/-1" }}>
                                {machines.length === 0 ? "Masine se ucitavaju iz plana proizvodnje..." : "Nema masina za izabrani filter."}
                            </div>
                        )}
                        {shown.map(({ m, ops, st }) => (
                            <div key={m.id} style={{ ...card, borderTop: "5px solid " + statusBoja(st), padding: 14 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                    <div>
                                        <div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 900 }}>{m.code}{m.group ? " \u00b7 " + m.group : ""}</div>
                                        <b style={{ fontSize: 15 }}>{m.name}</b>
                                    </div>
                                    <span style={{ color: statusBoja(st), fontWeight: 950, fontSize: 12, whiteSpace: "nowrap" }}>{statusTekst(st)}</span>
                                </div>
                                {ops.length === 0
                                    ? <div style={{ marginTop: 10, color: "#94a3b8" }}>{st === "servis" ? "Na servisu" : "Ceka nalog"}</div>
                                    : <>
                                        {ops.map((n, i) => <OpRed key={nalogKey(n) || i} n={n} poz={i + 1} masina={m} />)}
                                        {ops.length > 1 && <div style={{ marginTop: 8, fontSize: 11.5, color: "#64748b", fontWeight: 800, textAlign: "right" }}>{ops.length} naloga u redu &middot; &#8776;{ops.reduce((sum, n) => sum + procenaMin(m, n), 0)} min ukupno</div>}
                                    </>}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {tab === "operacije" && (
                <div style={{ display: "grid", gap: 10 }}>
                    {nalozi.filter((n) => normStatus(n.status) !== "zavrseno").length === 0 && (
                        <div style={{ ...card, color: "#94a3b8", textAlign: "center" }}>Nema aktivnih operacija.</div>
                    )}
                    {nalozi.filter((n) => normStatus(n.status) !== "zavrseno").map((n, i) => (
                        <div key={n.id || i} style={{ ...card, borderLeft: "5px solid " + statusBoja(normStatus(n.status)), padding: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                                <div>
                                    <b>{n.tip_naloga || n.naziv}</b> &middot; {n.proizvod || ""}
                                    <div style={{ color: "#64748b", fontSize: 13 }}>{n.broj_naloga || n.broj} &middot; {n.kupac || ""} {n.radnik ? "\u00b7 \uD83D\uDC64 " + n.radnik : ""}</div>
                                </div>
                                <span style={{ color: statusBoja(normStatus(n.status)), fontWeight: 950, fontSize: 12 }}>{statusTekst(normStatus(n.status))}</span>
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
                                    <div style={{ color: "#64748b", fontSize: 13 }}>{n.broj_naloga || n.broj} {n.radnik ? "\u00b7 \uD83D\uDC64 " + n.radnik : ""} {n.kolicina ? "\u00b7 " + n.kolicina : ""}{stvarnoMin(n) > 0 ? " \u00b7 \u23F1\uFE0F " + stvarnoMin(n) + " min stvarno" : ""}</div>
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
