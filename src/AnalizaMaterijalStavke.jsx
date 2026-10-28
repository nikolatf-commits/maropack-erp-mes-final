import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase.js";
import { calculateGm2 } from "./data/materialMaster.js";

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmt = (v, d = 0) => num(v).toLocaleString("sr-RS", { minimumFractionDigits: d, maximumFractionDigits: d });

// IVIČNI OTPAD (mm) = ostatak širine POSLE sečenja što više CELIH traka idealne širine.
// Npr. rolna 1340 mm, format 335 mm → 4 trake × 335 = 1340 → otpad 0 (a NE 1340−335=1005).
function ivicniOtpadMm(koriscena, idealna) {
    const kor = num(koriscena), ide = num(idealna);
    if (kor <= 0 || ide <= 0) return 0;
    const traka = Math.floor(kor / ide + 1e-6);   // koliko CELIH traka stane u rolnu
    if (traka < 1) return 0;                        // ne staje ni jedna traka → ivični otpad se ne računa
    return Math.max(0, kor - traka * ide);          // leftover posle svih celih traka
}

// ------- helper-i za IDEALNU širinu iz templejta naloga -------
function _parse(v) { if (v == null) return {}; if (typeof v === "object") return v; try { return JSON.parse(v) || {}; } catch (e) { return {}; } }
// Iz jednog reda radni_nalozi/operativni_nalozi izvuci IDEALNU širinu materijala.
// Izvor istine (isti kao nalog/metrika): folija.rezanje.sirinaMaterijala -> t.idealnaSirinaMaterijala.
function idealnaIzNaloga(n) {
    if (!n || typeof n !== "object") return 0;
    const od = _parse(n.order_data);
    const par = _parse(n.parametri);
    const rez = _parse(n.rezultati);
    const res = _parse(n.res);
    const parRes = _parse(par.res);
    const embTpl = rez.template || res.template || parRes.template || par.template || null;
    const tpl = _parse(n.product_template || n.template || od.template || embTpl);
    const tData = _parse(n.templateData || tpl.data || od.templateData);
    const t = (tData && Object.keys(tData).length) ? tData : tpl;
    const folija = n.folija || od.folija || t.folija || (t.data && t.data.folija) || {};
    const rzn = folija.rezanje || {};
    return num(rzn.sirinaMaterijala) || num(t.idealnaSirinaMaterijala) || num(od.idealnaSirinaMaterijala) || num(n.idealna_sirina) || 0;
}
// Ocisti nalog_ref na goli kod (npr. "MP-2026-0002 · Banda bianca 520 mm" -> "MP-2026-0002").
function kodNaloga(ref) {
    const s = String(ref || "").trim();
    if (!s) return "";
    const m = s.match(/^[A-Za-zČĆŽŠĐ]*[-\s]?\d{2,4}[-\s]?\d{2,6}/);
    return (m ? m[0] : s.split(/[·,\/|]/)[0]).trim();
}
// Izvuci naziv proizvoda iz ref-a kad ga nema u nalogu (npr. "MP-2026-0002 · Banda bianca 520 mm" -> "Banda bianca 520 mm").
function nazivIzRef(ref) {
    const s = String(ref || "").trim();
    const parts = s.split(/[·|]/);
    return parts.length > 1 ? parts.slice(1).join(" ").trim() : "";
}

export default function AnalizaMaterijalStavke({ msg }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("nalog"); // "nalog" | "materijal" | "sirine"
    // Period: godina ("sve" | "2026" | ...) + raspon unutar godine.
    const [godina, setGodina] = useState(String(new Date().getFullYear()));
    const [raspon, setRaspon] = useState("cela"); // cela | h1 | h2 | q1..q4 | m (pojedinačni mesec)
    const [mesec, setMesec] = useState(new Date().getMonth()); // 0-11, kad raspon === "m"
    const [q, setQ] = useState("");

    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    async function load() {
        setLoading(true);
        try {
            // Da se POKLAPA sa magacinom "Iskorišćeno": čitamo SVE rolne iz tabele `magacin`
            // (Supabase seče na 1000 redova, pa moramo paginacijom), filtriramo iskorišćene
            // i uzimamo NJIHOV PUN kg. Grupisano po nalogu i materijalu.
            const num0 = (v) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : 0);
            // IDENTIČNO kao magacin: status je tačno jedan od ovih (bez šireg "includes")
            const POTROSENA = ["iskorišćeno", "iskorisceno", "potrošena", "potrosena", "potroseno", "potrošeno", "used"];
            const jeIskoriscena = (st) => POTROSENA.includes(String(st || "").trim().toLowerCase());
            // paginacija: učitavaj po 1000 dok ima
            let sve = [];
            const PAGE = 1000;
            for (let od = 0; od < 50000; od += PAGE) {
                const { data, error } = await supabase.from("magacin").select("*").neq("status", "obrisano").range(od, od + PAGE - 1);
                if (error) throw error;
                if (!data || !data.length) break;
                sve = sve.concat(data);
                if (data.length < PAGE) break;
            }

            // ------- IDEALNE širine + NAZIV proizvoda po nalogu (iz templejta) -------
            // Rolna u magacinu NEMA idealnu širinu — ona je u proizvodu/templejtu naloga.
            // Gradimo mapu: kod naloga -> { idealna širina, naziv proizvoda }, pa je spajamo sa rolnama.
            const infoMap = {};
            try {
                let nal = [];
                for (let od = 0; od < 20000; od += PAGE) {
                    const { data } = await supabase.from("radni_nalozi").select("*").range(od, od + PAGE - 1);
                    if (!data || !data.length) break;
                    nal = nal.concat(data);
                    if (data.length < PAGE) break;
                }
                nal.forEach((n) => {
                    const kod = kodNaloga(n.broj_naloga || n.broj || n.master_broj);
                    if (!kod) return;
                    const iw = idealnaIzNaloga(n);
                    const od = _parse(n.order_data), t = _parse(n.templateData || _parse(n.product_template || n.template).data);
                    const naziv = n.naziv_proizvoda || n.proizvod || n.naziv || od.proizvod || od.naziv_proizvoda || t.nazivProizvoda || t.naziv || "";
                    if (!infoMap[kod]) infoMap[kod] = { ideal: iw || 0, naziv: naziv || "" };
                    else { if (!infoMap[kod].ideal && iw) infoMap[kod].ideal = iw; if (!infoMap[kod].naziv && naziv) infoMap[kod].naziv = naziv; }
                });
            } catch (e) { /* ako nema pristupa radni_nalozi, idealna/naziv ostaju prazni */ }

            const transf = sve.filter((r) => jeIskoriscena(r.status)).map(function (r) {
                const deb = num0(r.debljina ?? r.deb);
                const sir = num0(r.sirina);
                const m = num0(r.metraza ?? r.metraza_ost);
                // IDENTIČNO kao magacin: kg_neto → kg_bruto → kg → (m × sir × gsm)/1e6,
                // ali gsm SAMO iz upisanog r.gsm (kao magacin), ne iz koeficijenta —
                // da bi se zbir tačno poklopio sa magacinskim "Iskorišćeno".
                let kg = num0(r.kg_neto);
                if (!kg) kg = num0(r.kg_bruto) || num0(r.kg);
                if (!kg) {
                    const gsm = num0(r.gsm);
                    if (gsm && sir && m) kg = (m * sir * gsm) / 1000000;
                }
                const ref = r.nalog_ponbr || r.dodeljeno_nalogu || r.za_nalog || (r.nalog_id != null ? String(r.nalog_id) : null);
                const kod = kodNaloga(ref);
                const info = infoMap[kod] || {};
                const ideal = info.ideal || 0;                 // PRAVA idealna širina (iz templejta)
                const proizvod = info.naziv || nazivIzRef(ref); // naziv proizvoda (iz naloga, ili iz oznake rolne)
                return {
                    nalog_ref: ref,
                    nalog: kod || (ref ? String(ref) : "—"),
                    proizvod: proizvod || "",
                    vrsta: r.vrsta || null,
                    pod_vrsta: r.pod_vrsta || null,
                    oznaka: r.oznaka_materijala || r.oznaka || null,
                    debljina: deb || null,
                    dobavljac: r.dobavljac || r.proizvodjac || null,
                    koriscena_sirina: sir || null,                 // STVARNA širina rolne
                    idealna_sirina: ideal || null,                 // PRAVA idealna širina (iz naloga)
                    potroseno: m,
                    vraceno: 0,
                    kg: kg,
                    // Datum = kada je rolna prešla u „iskorišćeno" (updated_at), fallback na created_at.
                    datum: r.updated_at || r.datum_iskoriscenja || r.datum || r.created_at || null,
                };
            });
            setRows(transf);
        } catch (e) {
            msg && msg("Greška pri učitavanju analize: " + (e.message || e), "err");
            setRows([]);
        } finally { setLoading(false); }
    }

    // Dostupne godine (iz podataka) za padajući izbor.
    const godine = useMemo(() => {
        const s = new Set();
        rows.forEach((r) => { const d = r.datum ? new Date(r.datum) : null; if (d && !isNaN(d)) s.add(d.getFullYear()); });
        s.add(new Date().getFullYear());
        return Array.from(s).sort((a, b) => b - a);
    }, [rows]);

    function rasponMeseci() {
        switch (raspon) {
            case "h1": return [1, 6];
            case "h2": return [7, 12];
            case "q1": return [1, 3];
            case "q2": return [4, 6];
            case "q3": return [7, 9];
            case "q4": return [10, 12];
            case "m": return [mesec + 1, mesec + 1];
            default: return [1, 12]; // cela godina
        }
    }

    // Redovi filtrirani po godini + rasponu (po datumu prelaska u „iskorišćeno").
    const baza = useMemo(() => {
        if (godina === "sve") return rows;
        const g = Number(godina);
        const [odM, doM] = rasponMeseci();
        return rows.filter((r) => {
            if (!r.datum) return false;
            const d = new Date(r.datum); if (isNaN(d)) return false;
            if (d.getFullYear() !== g) return false;
            const mm = d.getMonth() + 1;
            return mm >= odM && mm <= doM;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, godina, raspon, mesec]);

    const poNalogu = useMemo(() => {
        const m = {};
        baza.forEach((r) => {
            const k = r.nalog_ref || "— bez naloga";
            if (!m[k]) m[k] = { nalog: k, izdato: 0, vraceno: 0, kg: 0, rolni: 0, idealna: r.idealna_sirina || 0, koriscena: r.koriscena_sirina || 0 };
            m[k].izdato += num(r.potroseno);
            m[k].vraceno += num(r.vraceno);
            m[k].kg += num(r.kg);           // pun kg rolne (kao magacin)
            m[k].rolni += 1;
            if (!m[k].idealna && r.idealna_sirina) m[k].idealna = r.idealna_sirina;
            if (r.koriscena_sirina && r.koriscena_sirina > m[k].koriscena) m[k].koriscena = r.koriscena_sirina;
        });
        return Object.values(m).map((x) => ({
            ...x,
            plan: x.izdato,
            utroseno: Math.max(0, x.izdato - x.vraceno),
            otpad: 0,
            iskoriscenje: x.izdato > 0 ? Math.max(0, Math.min(100, ((x.izdato - x.vraceno) / x.izdato) * 100)) : 0,
        })).sort((a, b) => b.utroseno - a.utroseno);
    }, [baza]);

    const poMaterijalu = useMemo(() => {
        const m = {};
        baza.forEach((r) => {
            const sir = r.koriscena_sirina || "";
            const k = [r.vrsta, r.pod_vrsta, r.oznaka, r.debljina, sir, r.dobavljac].map((x) => x || "").join("|");
            if (!m[k]) m[k] = { vrsta: r.vrsta || "—", pod_vrsta: r.pod_vrsta || "", oznaka: r.oznaka || "", debljina: r.debljina || "", sirina: sir, dobavljac: r.dobavljac || "—", potroseno: 0, kg: 0, otpad: 0, rolni: 0 };
            m[k].potroseno += Math.max(0, num(r.potroseno) - num(r.vraceno));
            m[k].kg += num(r.kg);           // pun kg rolne
            m[k].rolni += 1;
        });
        return Object.values(m).filter((x) => x.potroseno > 0 || x.kg > 0).sort((a, b) => b.potroseno - a.potroseno);
    }, [baza]);

    // ------- NOVO: po ŠIRINI / ivičnom otpadu -------
    // Red = NALOG × materijal (vrsta·pod-vrsta·oznaka·deb·proizvođač) × korišćena širina × idealna širina.
    // Otpad mm = korišćena − idealna (po ivici).  Otpad kg = kg × (otpad/korišćena) — kilaža raste sa širinom.
    const poSirini = useMemo(() => {
        const m = {};
        baza.forEach((r) => {
            const kor = num(r.koriscena_sirina);
            const ide = num(r.idealna_sirina);
            const k = [r.nalog, r.vrsta, r.pod_vrsta, r.oznaka, r.debljina, r.dobavljac, kor, ide].map((x) => x || "").join("|");
            if (!m[k]) m[k] = {
                nalog: r.nalog || "—", proizvod: r.proizvod || "",
                vrsta: r.vrsta || "—", pod_vrsta: r.pod_vrsta || "", oznaka: r.oznaka || "", debljina: r.debljina || "",
                dobavljac: r.dobavljac || "—", koriscena: kor, idealna: ide,
                potroseno: 0, kg: 0, otpadKg: 0, rolni: 0,
            };
            const g = m[k];
            const utro = Math.max(0, num(r.potroseno) - num(r.vraceno));
            g.potroseno += utro;
            g.kg += num(r.kg);
            g.rolni += 1;
            if (kor > 0) { const om = ivicniOtpadMm(kor, ide); if (om > 0) g.otpadKg += num(r.kg) * (om / kor); }
        });
        return Object.values(m).map((x) => {
            const otpadMm = ivicniOtpadMm(x.koriscena, x.idealna);
            const otpadPct = (x.koriscena > 0) ? (otpadMm / x.koriscena) * 100 : 0;
            return { ...x, otpadMm, otpadPct };
        }).filter((x) => x.kg > 0 || x.potroseno > 0)
            // prvo materijali sa najvećim otpadom (kg), pa po potrošnji
            .sort((a, b) => (b.otpadKg - a.otpadKg) || (b.potroseno - a.potroseno));
    }, [baza]);

    const kpi = useMemo(() => {
        const izdato = baza.reduce((s, r) => s + num(r.potroseno), 0);
        const vraceno = baza.reduce((s, r) => s + num(r.vraceno), 0);
        const kgUk = baza.reduce((s, r) => s + num(r.kg), 0);
        // ivični otpad: samo rolne gde je korišćena > idealna
        let otpadKg = 0, saOtpadom = 0;
        baza.forEach((r) => {
            const kor = num(r.koriscena_sirina), ide = num(r.idealna_sirina);
            const om = ivicniOtpadMm(kor, ide);
            if (kor > 0 && om > 0) { otpadKg += num(r.kg) * (om / kor); saOtpadom += 1; }
        });
        return {
            plan: izdato,
            izdato: Math.max(0, izdato - vraceno),
            otpad: 0,
            kg: kgUk,                        // ukupno kg = zbir punih kg (kao magacin Iskorišćeno)
            nalozi: new Set(baza.map((r) => r.nalog_ref || "—")).size,
            otpadKg, saOtpadom,
        };
    }, [baza]);

    const filtNalog = useMemo(() => !q.trim() ? poNalogu : poNalogu.filter((x) => String(x.nalog).toLowerCase().includes(q.toLowerCase())), [poNalogu, q]);
    // Pretraga po SVIM parametrima: Vrsta · Pod-vrsta · Oznaka · Deb. · Širina · Dobavljač.
    const filtMat = useMemo(() => !q.trim() ? poMaterijalu : poMaterijalu.filter((x) => [x.vrsta, x.pod_vrsta, x.oznaka, x.debljina, x.sirina, x.dobavljac].some((k) => String(k || "").toLowerCase().includes(q.toLowerCase()))), [poMaterijalu, q]);
    const filtSir = useMemo(() => !q.trim() ? poSirini : poSirini.filter((x) => [x.nalog, x.proizvod, x.vrsta, x.pod_vrsta, x.oznaka, x.debljina, x.koriscena, x.dobavljac].some((k) => String(k || "").toLowerCase().includes(q.toLowerCase()))), [poSirini, q]);

    const maxPlan = Math.max(1, ...poNalogu.map((x) => x.plan));
    const maxMat = Math.max(1, ...poMaterijalu.map((x) => x.potroseno));

    // Izvoz trenutnog taba (CSV, otvara se u Excel-u) za izabrani period.
    function izvezi() {
        let headers = [], rowsOut = [], naziv = "analiza";
        if (tab === "nalog") {
            naziv = "po_nalogu";
            headers = ["Nalog", "Rolni", "Skinuto (m)", "Stvarna potrošnja (m)", "Iskorišćenje (%)", "Kg"];
            rowsOut = filtNalog.map((x) => [x.nalog, x.rolni, Math.round(x.plan), Math.round(x.utroseno), x.izdato > 0 ? x.iskoriscenje.toFixed(1) : "", Math.round(x.kg)]);
        } else if (tab === "materijal") {
            naziv = "po_materijalu";
            headers = ["Vrsta", "Pod-vrsta", "Oznaka", "Debljina", "Širina", "Dobavljač", "Rolni", "Potrošeno (m)", "Kg"];
            rowsOut = filtMat.map((x) => [x.vrsta, x.pod_vrsta, x.oznaka, x.debljina, x.sirina, x.dobavljac, x.rolni, Math.round(x.potroseno), Math.round(x.kg)]);
        } else {
            naziv = "po_sirini";
            headers = ["Nalog", "Proizvod", "Vrsta", "Oznaka", "Debljina", "Dobavljač", "Korišćena (mm)", "Idealna (mm)", "Otpad (mm)", "Otpad (%)", "Rolni", "Potrošeno (m)", "Kg", "Otpad (kg)"];
            rowsOut = filtSir.map((x) => [x.nalog, x.proizvod, x.vrsta, x.oznaka, x.debljina, x.dobavljac, x.koriscena, x.idealna, Math.round(x.otpadMm), (x.otpadPct || 0).toFixed(1), x.rolni, Math.round(x.potroseno), Math.round(x.kg), (x.otpadKg || 0).toFixed(1)]);
        }
        const esc = (v) => { const s = String(v == null ? "" : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        const csv = [headers.join(";")].concat(rowsOut.map((r) => r.map(esc).join(";"))).join("\r\n");
        const periodLbl = godina === "sve" ? "sve" : (godina + "_" + raspon + (raspon === "m" ? "-" + (mesec + 1) : ""));
        try {
            const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "analiza_" + naziv + "_" + periodLbl + ".csv";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            msg && msg("Izvezeno: " + a.download, "ok");
        } catch (e) { msg && msg("Izvoz nije uspeo: " + (e.message || e), "err"); }
    }

    const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.05)" };
    const th = { textAlign: "left", padding: "9px 10px", fontSize: 10, textTransform: "uppercase", color: "#475569", fontWeight: 800, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" };
    const td = { padding: "9px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 600, fontSize: 13 };
    const tabBtn = (k) => ({ border: "none", borderRadius: 10, padding: "9px 15px", fontWeight: 900, cursor: "pointer", fontSize: 13.5, background: tab === k ? "#0f172a" : "#f1f5f9", color: tab === k ? "#fff" : "#334155" });
    const perBtn2 = (active) => ({ border: "1px solid #e2e8f0", borderRadius: 9, padding: "7px 11px", fontWeight: 800, cursor: "pointer", fontSize: 12.5, background: active ? "#0ea5e9" : "#fff", color: active ? "#fff" : "#475569" });
    const selSt = { border: "1px solid #cbd5e1", borderRadius: 9, padding: "7px 10px", fontWeight: 800, fontSize: 12.5, background: "#fff", color: "#334155" };

    return (
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "8px 4px 40px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                <div style={{ fontSize: 22, fontWeight: 950 }}>📊 Analiza potrošnje materijala</div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={godina} onChange={(e) => setGodina(e.target.value)} style={selSt}>
                        <option value="sve">Sve godine</option>
                        {godine.map((g) => <option key={g} value={String(g)}>{g}</option>)}
                    </select>
                    {godina !== "sve" && <>
                        {[["cela", "Cela"], ["h1", "H1"], ["h2", "H2"], ["q1", "Q1"], ["q2", "Q2"], ["q3", "Q3"], ["q4", "Q4"]].map(([k, l]) => (
                            <button key={k} onClick={() => setRaspon(k)} style={perBtn2(raspon === k)}>{l}</button>
                        ))}
                        <select value={raspon === "m" ? String(mesec) : ""} onChange={(e) => { if (e.target.value === "") return; setRaspon("m"); setMesec(Number(e.target.value)); }} style={selSt}>
                            <option value="">Mesec…</option>
                            {["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Avg", "Sep", "Okt", "Nov", "Dec"].map((mn, mi) => <option key={mi} value={mi}>{mn}</option>)}
                        </select>
                    </>}
                    <button onClick={izvezi} style={{ ...perBtn2(false), background: "#16a34a", color: "#fff", border: "1px solid #16a34a" }}>⬇ Izvezi</button>
                    <button onClick={load} title="Osveži" style={{ ...perBtn2(false), background: "#f1f5f9" }}>↻</button>
                </div>
            </div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 14 }}>Izvor: iskorišćene rolne iz magacina · period se računa po datumu kada je rolna prešla u „iskorišćeno". Izvoz (⬇) izvozi trenutni tab za izabrani period.</div>

            {/* KPI */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11, marginBottom: 16 }}>
                <div style={{ ...card, padding: 14 }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#64748b" }}>Naloga</div><div style={{ fontSize: 24, fontWeight: 950 }}>{fmt(kpi.nalozi)}</div></div>
                <div style={{ ...card, padding: 14, background: "#eff6ff" }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#1d4ed8" }}>Skinuto (bruto)</div><div style={{ fontSize: 24, fontWeight: 950, color: "#1d4ed8" }}>{fmt(kpi.plan)} m</div></div>
                <div style={{ ...card, padding: 14, background: "#f0fdf4" }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#15803d" }}>Stvarna potrošnja</div><div style={{ fontSize: 24, fontWeight: 950, color: "#15803d" }}>{fmt(kpi.izdato)} m</div></div>
                <div style={{ ...card, padding: 14, background: "#fffbeb" }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#b45309" }}>Ivični otpad</div><div style={{ fontSize: 24, fontWeight: 950, color: "#b45309" }}>{fmt(kpi.otpadKg, 1)} kg</div></div>
                <div style={{ ...card, padding: 14, background: "#0f172a" }}><div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, color: "#94a3b8" }}>Ukupno kg</div><div style={{ fontSize: 24, fontWeight: 950, color: "#fff" }}>{fmt(kpi.kg, 1)}</div></div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={() => setTab("nalog")} style={tabBtn("nalog")}>📋 Po nalogu</button>
                <button onClick={() => setTab("materijal")} style={tabBtn("materijal")}>🧱 Po materijalu / dobavljaču</button>
                <button onClick={() => setTab("sirine")} style={tabBtn("sirine")}>📐 Širine / ivični otpad</button>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 pretraga..." style={{ marginLeft: "auto", border: "1px solid #cbd5e1", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 600, minWidth: 180 }} />
            </div>

            {loading ? <div style={{ ...card, color: "#64748b", fontWeight: 700 }}>Učitavam…</div> : (
                rows.length === 0 ? (
                    <div style={{ ...card, color: "#475569" }}>
                        <div style={{ fontWeight: 900, marginBottom: 4 }}>Nema podataka u „materijal_stavke".</div>
                        <div style={{ fontSize: 13, color: "#64748b" }}>Stavke se kreiraju pri rezervaciji/izdavanju materijala. Napravi nalog kroz „Generiši nalog materijala", rezerviši ručno, ili izdaj materijal — pa se analiza popuni.</div>
                    </div>
                ) : tab === "nalog" ? (
                    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr>{["Nalog", "Idealna š.", "Skinuto", "Vraćeno", "Potrošeno", "kg", "Iskorišćenje"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {filtNalog.map((x, i) => (
                                        <tr key={i}>
                                            <td style={{ ...td, fontWeight: 900 }}>{x.nalog}<div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 600 }}>{x.rolni} rolni</div></td>
                                            <td style={td}>{x.idealna ? fmt(x.idealna) + " mm" : "—"}</td>
                                            <td style={td}>
                                                <div style={{ fontWeight: 800 }}>{fmt(x.izdato)} m</div>
                                                <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, marginTop: 3, overflow: "hidden" }}><div style={{ height: "100%", width: (x.izdato / maxPlan * 100) + "%", background: "#1d4ed8" }} /></div>
                                            </td>
                                            <td style={{ ...td, color: "#dc2626", fontWeight: 800 }}>{fmt(x.vraceno)} m</td>
                                            <td style={{ ...td, color: "#15803d", fontWeight: 900 }}>{fmt(x.utroseno)} m</td>
                                            <td style={td}>{fmt(x.kg, 1)}</td>
                                            <td style={td}>
                                                <div style={{ fontWeight: 900, color: x.iskoriscenje >= 95 ? "#15803d" : x.iskoriscenje >= 85 ? "#a16207" : "#dc2626" }}>{x.izdato > 0 ? fmt(x.iskoriscenje, 1) + "%" : "—"}</div>
                                                {x.izdato > 0 && <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, marginTop: 3, overflow: "hidden" }}><div style={{ height: "100%", width: x.iskoriscenje + "%", background: x.iskoriscenje >= 95 ? "#16a34a" : x.iskoriscenje >= 85 ? "#f59e0b" : "#dc2626" }} /></div>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : tab === "materijal" ? (
                    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr>{["Vrsta", "Pod-vrsta", "Oznaka", "Deb.", "Širina", "Dobavljač", "Potrošeno", "kg", "Događaja"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {filtMat.map((x, i) => (
                                        <tr key={i}>
                                            <td style={{ ...td, fontWeight: 900 }}>{x.vrsta}</td>
                                            <td style={td}>{x.pod_vrsta || "—"}</td>
                                            <td style={td}>{x.oznaka || "—"}</td>
                                            <td style={td}>{x.debljina ? x.debljina + "µ" : "—"}</td>
                                            <td style={td}>{x.sirina ? fmt(x.sirina, 0) + " mm" : "—"}</td>
                                            <td style={td}>{x.dobavljac || "—"}</td>
                                            <td style={td}>
                                                <div style={{ fontWeight: 800 }}>{fmt(x.potroseno)} m</div>
                                                <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, marginTop: 3, overflow: "hidden" }}><div style={{ height: "100%", width: (x.potroseno / maxMat * 100) + "%", background: "#0d9488" }} /></div>
                                            </td>
                                            <td style={{ ...td, fontWeight: 800 }}>{fmt(x.kg, 1)}</td>
                                            <td style={{ ...td, color: "#94a3b8", fontWeight: 800 }}>{x.rolni}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    // ------- NOVO: ŠIRINE / IVIČNI OTPAD -------
                    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                        <div style={{ padding: "12px 14px", background: "#fffbeb", borderBottom: "1px solid #fde68a", fontSize: 12.5, color: "#92400e", fontWeight: 600 }}>
                            Za svaki materijal: koju si <b>širinu koristio</b> (rolna iz magacina) naspram <b>idealne širine</b> koja ti je trebala (iz templejta proizvoda) — i koliki je <b>ivični otpad</b>. Crveno = širi materijal od potrebnog.
                        </div>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr>{["Nalog", "Proizvod", "Vrsta", "Oznaka", "Pod-vrsta", "Deb.", "Proizvođač", "Korišćena š.", "Idealna š.", "Ivični otpad", "Potrošeno", "Otpad (kg)"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {filtSir.map((x, i) => {
                                        const imaOtpad = x.otpadMm > 0;
                                        const bezIdealne = !x.idealna;
                                        return (
                                            <tr key={i} style={imaOtpad ? { background: "#fff7ed" } : null}>
                                                <td style={{ ...td, fontWeight: 900, whiteSpace: "nowrap" }}>{x.nalog || "—"}</td>
                                                <td style={{ ...td, maxWidth: 180 }}>{x.proizvod || "—"}</td>
                                                <td style={{ ...td, fontWeight: 900 }}>{x.vrsta}</td>
                                                <td style={td}>{x.oznaka || "—"}</td>
                                                <td style={td}>{x.pod_vrsta || "—"}</td>
                                                <td style={td}>{x.debljina ? x.debljina + "µ" : "—"}</td>
                                                <td style={td}>{x.dobavljac || "—"}</td>
                                                <td style={{ ...td, fontWeight: 800, color: imaOtpad ? "#b91c1c" : "#0f172a" }}>{x.koriscena ? fmt(x.koriscena, 0) + " mm" : "—"}</td>
                                                <td style={{ ...td, fontWeight: 800, color: bezIdealne ? "#94a3b8" : "#15803d" }}>{x.idealna ? fmt(x.idealna, 0) + " mm" : "— (nema u templejtu)"}</td>
                                                <td style={td}>
                                                    {bezIdealne ? <span style={{ color: "#94a3b8" }}>—</span>
                                                        : imaOtpad
                                                            ? <span style={{ fontWeight: 900, color: "#b91c1c" }}>+{fmt(x.otpadMm, 0)} mm <span style={{ fontWeight: 700, color: "#ea580c" }}>({fmt(x.otpadPct, 1)}%)</span></span>
                                                            : <span style={{ fontWeight: 900, color: "#15803d" }}>✓ 0</span>}
                                                </td>
                                                <td style={td}>{fmt(x.potroseno)} m<div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 600 }}>{x.rolni} rolni</div></td>
                                                <td style={{ ...td, fontWeight: 900, color: x.otpadKg > 0 ? "#b45309" : "#94a3b8" }}>{x.otpadKg > 0 ? fmt(x.otpadKg, 1) + " kg" : "—"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ padding: "10px 14px", fontSize: 11, color: "#94a3b8", borderTop: "1px solid #f1f5f9" }}>
                            💡 Red sa ivičnim otpadom = sledeći put naruči materijal širine jednake „Idealna š." da nema otpada. „— (nema u templejtu)" = proizvod nema upisanu idealnu širinu materijala.
                        </div>
                    </div>
                )
            )}
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10 }}>Stvarna potrošnja = skinuto sa stanja − vraćeno u magacin (iz istorije rolni). Iskorišćenje = potrošeno / skinuto. Ivični otpad (kg) = kg × (korišćena − idealna) / korišćena.</div>
        </div>
    );
}
