import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase.js";
import { predloziFormatiranje } from "./formatiranjeEngine.js";
import { dodeliBrojeveNaloga } from "./dodeliBrojeve.js";

/* =====================================================================
   FORMATIRANJE PO POTREBI — maska "Šta mi treba" (produkcijski ekran)
   • sam učitava magacin iz Supabase
   • lanac lista (vrsta→podvrsta→oznaka→proizvođač→debljina) se puni iz STANJA
   • zove predloziFormatiranje() + dodeliBrojeveNaloga()
   • dugme "Kreiraj naloge" upiše u operativni_nalozi (plan u parametri.formatiranje)

   Ubaci fajl gde ti stoje ostali ekrani. Ako se import putanje razlikuju,
   promeni samo 3 import linije gore. Prima opcioni prop `msg` za poruke
   (isti kao FormatiranjeRolniPRO); radi i bez njega.
   ===================================================================== */

const BLUE = "#2446b8", GREEN = "#059669", ORANGE = "#f59e0b", RED = "#dc2626", INK = "#0f172a", SLATE = "#64748b";
const NN = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const ZAUZETO = /utros|utroš|iskoris|iskorišć|prodat|isporu|otpis|storn|obrisan|arhiv|zavrsen|završen|proizvodnj|u proizv/i;

/* magacin polja → jedinstveni oblik za lanac */
const gVrsta = (r) => r.vrsta ?? r.tip ?? "";
const gPod = (r) => r.pod_vrsta ?? r.podvrsta ?? "";
const gOzn = (r) => r.oznaka_materijala ?? r.oznaka ?? "";
const gPro = (r) => r.dobavljac ?? r.proizvodjac ?? "";
const gDeb = (r) => r.deb ?? r.debljina ?? "";
const slobodno = (r) => Math.max(0, NN(r.metraza_ost ?? r.metraza) - NN(r.rezervisano));

function distinct(list, mapFn, filters = []) {
    const s = new Set();
    for (const r of list) {
        if (!filters.every((f) => f(r))) continue;
        const v = mapFn(r);
        if (v != null && String(v).trim() !== "") s.add(String(v).trim());
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "sr", { numeric: true }));
}

const field = { width: "100%", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", fontWeight: 700, fontSize: 12, boxSizing: "border-box", color: INK };
const lbl = { display: "block", fontSize: 9.5, color: "#475569", fontWeight: 800, textTransform: "uppercase", marginBottom: 5, letterSpacing: 0.4 };

function Sel({ label, value, options, onChange, placeholder }) {
    return (
        <div>
            <label style={lbl}>{label}</label>
            <select style={field} value={value} onChange={(e) => onChange(e.target.value)}>
                <option value="">{placeholder || "—"}</option>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
        </div>
    );
}
function Num({ label, value, onChange, suffix }) {
    return (
        <div>
            <label style={lbl}>{label}</label>
            <div style={{ position: "relative" }}>
                <input style={{ ...field, paddingRight: suffix ? 34 : 10 }} type="number" min="0" value={value} onChange={(e) => onChange(e.target.value)} />
                {suffix && <span style={{ position: "absolute", right: 10, top: 11, fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>{suffix}</span>}
            </div>
        </div>
    );
}

let UID = 1, AID = 1;
const noviRed = (p = {}) => ({ _uid: UID++, vrsta: "", pod_vrsta: "", oznaka: "", proizvodjac: "", debljina: "", sirina_mm: "", rolni_kom: "", duzina_m: "", napomena: "", raspodela: [{ _id: AID++, kome: "", kom: "" }], ...p });

function FormatCard({ i, row, magacin, onPatch, onRemove, canRemove }) {
    const vrste = useMemo(() => distinct(magacin, gVrsta), [magacin]);
    const podVrste = useMemo(() => distinct(magacin, gPod, [(r) => !row.vrsta || gVrsta(r) === row.vrsta]), [magacin, row.vrsta]);
    const oznake = useMemo(() => distinct(magacin, gOzn, [(r) => !row.vrsta || gVrsta(r) === row.vrsta, (r) => !row.pod_vrsta || gPod(r) === row.pod_vrsta]), [magacin, row.vrsta, row.pod_vrsta]);
    const proizv = useMemo(() => distinct(magacin, gPro, [(r) => !row.vrsta || gVrsta(r) === row.vrsta, (r) => !row.oznaka || gOzn(r) === row.oznaka]), [magacin, row.vrsta, row.oznaka]);
    const debljine = useMemo(() => distinct(magacin, gDeb, [(r) => !row.vrsta || gVrsta(r) === row.vrsta, (r) => !row.oznaka || gOzn(r) === row.oznaka]), [magacin, row.vrsta, row.oznaka]);
    const jePapir = String(row.vrsta).toUpperCase().includes("PAPIR");
    const ukupno = NN(row.rolni_kom) * NN(row.duzina_m) || 0;

    const alloc = row.raspodela || [];
    const rolni = NN(row.rolni_kom);
    const assigned = alloc.reduce((a, x) => a + NN(x.kom), 0);
    const remainder = rolni - assigned;
    const patchA = (idx, p) => onPatch({ raspodela: alloc.map((x, k) => (k === idx ? { ...x, ...p } : x)) });
    const addA = () => onPatch({ raspodela: [...alloc, { _id: AID++, kome: "", kom: "" }] });
    const rmA = (idx) => onPatch({ raspodela: alloc.filter((_, k) => k !== idx) });

    return (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, boxShadow: "0 1px 2px rgba(15,23,42,.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: BLUE }}>FORMAT {String(i + 1).padStart(2, "0")}</span>
                {canRemove && <button onClick={onRemove} style={{ border: "1px solid #fecaca", background: "#fff5f5", color: RED, borderRadius: 8, width: 28, height: 28, cursor: "pointer", fontWeight: 900 }}>×</button>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 12 }}>
                <Sel label="Vrsta" value={row.vrsta} options={vrste} placeholder="—" onChange={(v) => onPatch({ vrsta: v, pod_vrsta: "", oznaka: "", proizvodjac: "", debljina: "" })} />
                <Sel label="Pod vrsta" value={row.pod_vrsta} options={podVrste} onChange={(v) => onPatch({ pod_vrsta: v })} />
                <Sel label="Oznaka" value={row.oznaka} options={oznake} onChange={(v) => onPatch({ oznaka: v })} />
                <Sel label="Proizvođač" value={row.proizvodjac} options={proizv} onChange={(v) => onPatch({ proizvodjac: v })} />
                <Sel label={jePapir ? "Gramaža (g/m²)" : "Debljina (µ)"} value={row.debljina} options={debljine} onChange={(v) => onPatch({ debljina: v })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                <Num label="Širina" value={row.sirina_mm} suffix="mm" onChange={(v) => onPatch({ sirina_mm: v })} />
                <Num label="Rolni" value={row.rolni_kom} suffix="kom" onChange={(v) => onPatch({ rolni_kom: v })} />
                <Num label="Dužina / rolni" value={row.duzina_m} suffix="m" onChange={(v) => onPatch({ duzina_m: v })} />
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: "6px 12px", minWidth: 96, textAlign: "right" }}>
                    <div style={{ ...lbl, marginBottom: 2 }}>Ukupno</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: INK }}>{ukupno.toLocaleString("sr")} m</div>
                </div>
            </div>
            <div style={{ marginTop: 12 }}>
                <label style={lbl}>Odredište · raspodela {rolni || 0} {rolni === 1 ? "rolne" : "rolni"}</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {alloc.map((x, idx) => (
                        <div key={x._id ?? idx} style={{ display: "grid", gridTemplateColumns: "1fr 92px 32px", gap: 8 }}>
                            <input style={field} value={x.kome} placeholder="Nalog br. (prazno = na stanje)" onChange={(e) => patchA(idx, { kome: e.target.value })} />
                            <input style={field} type="number" min="0" value={x.kom} placeholder="kom" onChange={(e) => patchA(idx, { kom: e.target.value })} />
                            <button onClick={() => rmA(idx)} disabled={alloc.length <= 1} style={{ border: "1px solid #e2e8f0", background: "#fff", color: alloc.length <= 1 ? "#cbd5e1" : SLATE, borderRadius: 8, cursor: alloc.length <= 1 ? "not-allowed" : "pointer", fontWeight: 900 }}>×</button>
                        </div>
                    ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                    <button onClick={addA} style={{ border: "none", background: "none", color: BLUE, fontWeight: 800, fontSize: 12, cursor: "pointer", padding: 0 }}>+ odredište</button>
                    <span style={{ fontSize: 11, fontWeight: 800, color: remainder < 0 ? RED : SLATE }}>raspoređeno {assigned}/{rolni || 0}{remainder > 0 ? ` · ostatak ${remainder} → stanje` : remainder < 0 ? " · previše!" : ""}</span>
                </div>
            </div>
            <div style={{ marginTop: 12 }}>
                <label style={lbl}>Napomena (ide na nalog uz ovaj format)</label>
                <input style={field} value={row.napomena} placeholder="npr. bez nastavaka, corona strana gore…" onChange={(e) => onPatch({ napomena: e.target.value })} />
            </div>
        </div>
    );
}

function odrBoja(o) { return o === "stanje" || !o ? SLATE : (String(o).startsWith("nalog") ? BLUE : GREEN); }
function Traka({ t }) {
    const col = odrBoja(t.odrediste), st = t.odrediste === "stanje" || !t.odrediste;
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${col}33`, background: `${col}0d`, color: col, borderRadius: 8, padding: "4px 9px", fontSize: 11.5, fontWeight: 800 }}>{t.sirina_mm} mm<span style={{ fontWeight: 600, opacity: .8 }}>{st ? "→ stanje" : "→ " + t.odrediste.replace("nalog:", "")}</span></span>;
}

export default function FormatiranjePoPotrebi({ msg }) {
    const say = (t, k) => (msg ? msg(t, k) : (k === "err" ? console.error(t) : console.log(t)));
    const [magacin, setMagacin] = useState([]);
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([noviRed()]);
    const [zaokruzi, setZaokruzi] = useState(false);
    const [bocni, setBocni] = useState(true);
    const [izvorPonbr, setIzvorPonbr] = useState(""); // prazno = preventivno
    const [rezultat, setRezultat] = useState(null);    // { nalozi(sa brojem), na_stanje, fali, zbirno }
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let on = true;
        (async () => {
            if (supabase?.__notConfigured) { say("Supabase nije povezan.", "err"); setLoading(false); return; }
            try {
                const { data, error } = await supabase.from("magacin").select("*").limit(5000);
                if (error) throw error;
                const dostupne = (data || []).filter((r) => !ZAUZETO.test(String(r.status || "")) && slobodno(r) > 0);
                if (on) setMagacin(dostupne);
            } catch (e) { say("Greška pri učitavanju magacina: " + (e?.message || e), "err"); }
            finally { if (on) setLoading(false); }
        })();
        return () => { on = false; };
    }, []);

    const patch = (uid, p) => setRows((rs) => rs.map((r) => (r._uid === uid ? { ...r, ...p } : r)));
    const remove = (uid) => setRows((rs) => rs.filter((r) => r._uid !== uid));
    const add = () => setRows((rs) => [...rs, noviRed()]);

    const validne = rows.filter((r) => r.vrsta && NN(r.sirina_mm) > 0 && NN(r.rolni_kom) > 0 && NN(r.duzina_m) > 0);
    const ukupnoM = rows.reduce((a, r) => a + NN(r.rolni_kom) * NN(r.duzina_m), 0);

    function sklopiPotrebe() {
        const potrebe = [];
        validne.forEach((r, i) => {
            const base = { materijal: { vrsta: r.vrsta, pod_vrsta: r.pod_vrsta, oznaka: r.oznaka, proizvodjac: r.proizvodjac, debljina: r.debljina }, sirina_mm: r.sirina_mm, duzina_m: r.duzina_m, napomena: r.napomena };
            const alloc = (r.raspodela || []).filter((a) => NN(a.kom) > 0);
            const rem = NN(r.rolni_kom) - alloc.reduce((a, x) => a + NN(x.kom), 0);
            let seq = 0;
            alloc.forEach((a) => potrebe.push({ id: `F${i + 1}-${++seq}`, ...base, rolni_kom: NN(a.kom), odrediste: a.kome ? "nalog:" + a.kome : "stanje" }));
            if (rem > 0) potrebe.push({ id: `F${i + 1}-${++seq}`, ...base, rolni_kom: rem, odrediste: "stanje" });
        });
        return potrebe;
    }

    async function predlozi() {
        if (!validne.length) return;
        const potrebe = sklopiPotrebe();
        const rez = predloziFormatiranje(potrebe, magacin, { kerf_mm: 0, zaokruziNavise: zaokruzi, bocniOstatakNaStanje: bocni });

        // brojevi naloga (iz naloga ili preventivno)
        let opcijeBroj = { godina: new Date().getFullYear(), postojeciBrojevi: [] };
        try {
            const god = new Date().getFullYear();
            const { data } = await supabase.from("operativni_nalozi").select("broj_naloga").ilike("broj_naloga", `MP-${god}-%`).limit(1000);
            const brojevi = (data || []).map((r) => String(r.broj_naloga || ""));
            opcijeBroj.postojeciBrojevi = brojevi;
            if (!izvorPonbr) {
                let maxSeq = 0;
                brojevi.forEach((b) => { const m = b.match(new RegExp(`^MP-${god}-(\\d+)`)); if (m) maxSeq = Math.max(maxSeq, +m[1]); });
                opcijeBroj.preventivniRedni = maxSeq + 1;
            }
        } catch (e) { if (!izvorPonbr) opcijeBroj.preventivniRedni = 1; }
        if (izvorPonbr) opcijeBroj.izvor = { ponbr: izvorPonbr.trim() };

        const withNums = dodeliBrojeveNaloga(rez.nalozi, opcijeBroj);
        if (withNums.greske?.length) say("⚠ " + withNums.greske.join(" · "), "err");
        setRezultat({ ...rez, nalozi: withNums.nalozi });
    }

    // mapiraj napomene po potreba_id (za upis u plan)
    function napMapa(potrebe) { const m = {}; potrebe.forEach((p) => { if (p.napomena) m[p.id] = p.napomena; }); return m; }

    async function kreiraj() {
        if (!rezultat?.nalozi?.length) return;
        if (supabase?.__notConfigured) { say("Supabase nije povezan.", "err"); return; }
        setBusy(true);
        try {
            const potrebe = sklopiPotrebe();
            const napM = napMapa(potrebe);

            // ⚠ PRILAGODI kolone ako se operativni_nalozi razlikuje kod tebe -------------
            // JEDAN objedinjeni nalog za sve matične (broj bez -1..-N sufiksa)
            const broj = String((rezultat.nalozi[0] && rezultat.nalozi[0].broj) || "").replace(/-\d+$/, "");
            const matice = rezultat.nalozi.map((n) => {
                const m = magacin.find((x) => x.id === n.maticna_id) || {};
                return {
                    br_rolne: n.br_rolne, sirina_mm: n.sirina_mm, utrosak_m: n.utrosak_m,
                    materijal: [gVrsta(m), gPod(m), gOzn(m), gDeb(m) ? gDeb(m) + "µ" : ""].filter(Boolean).join(" · "),
                    proizvodjac: gPro(m), lot_baza: m.lot || m.br_rolne || "LOT",
                    plan_reza: (n.plan_reza || []).map((s) => ({
                        duzina_m: s.duzina_m, otpad_mm: s.otpad_mm,
                        trake: (s.trake || []).map((t) => ({ sirina_mm: t.sirina_mm, odrediste: t.odrediste, napomena: t.potreba_id ? (napM[t.potreba_id] || "") : "" })),
                    })),
                };
            });
            const prvaM = magacin.find((x) => x.id === (rezultat.nalozi[0] && rezultat.nalozi[0].maticna_id)) || {};
            const red = {
                broj_naloga: broj,
                tip_naloga: "formatiranje",
                tip_proizvoda: gVrsta(prvaM) || null,
                parametri: JSON.stringify({
                    formatiranje: {
                        objedinjeno: true, broj,
                        izvor_ponbr: (rezultat.nalozi[0] && rezultat.nalozi[0].izvor_ponbr) || null,
                        preventivno: !!(rezultat.nalozi[0] && rezultat.nalozi[0].preventivno),
                        matice,
                    }
                }),
                uradjeno: 0, skart: 0,
            };
            // --------------------------------------------------------------------------

            const { error } = await supabase.from("operativni_nalozi").insert([red]);
            if (error) throw error;

            // Rezerviši matične rolne magacioneru (da ih spremi za rez) — kao kod običnih naloga
            try {
                const oznakaRez = broj + " · FORMATIRANJE";
                await Promise.all(rezultat.nalozi.map((n) => {
                    const m = magacin.find((x) => x.id === n.maticna_id);
                    if (!m) return null;
                    const ukupno = Number(m.metraza_ost != null ? m.metraza_ost : m.metraza) || 0;
                    // Rezerviši SAMO metre koje plan reza stvarno troši (kao kod običnih naloga),
                    // da ostatak matične ostane upotrebljiv za druge naloge.
                    const noviRez = Math.min(ukupno, (Number(m.rezervisano) || 0) + (Number(n.utrosak_m) || 0));
                    const punoRez = ukupno > 0 && noviRez >= ukupno - 1;
                    const prethodno = String(m.dodeljeno_nalogu || "").trim();
                    let dod = oznakaRez;
                    if (prethodno && prethodno.indexOf(broj) === -1) dod = prethodno + ", " + oznakaRez;
                    else if (prethodno) dod = prethodno;
                    return supabase.from("magacin")
                        .update({ status: punoRez ? "Rezervisano" : "Na stanju", dodeljeno_nalogu: dod, rezervisano: noviRez || null })
                        .eq("id", n.maticna_id);
                }));
            } catch (eR) { console.warn("Rezervacija matičnih nije uspela:", eR); }

            say(`Kreiran nalog za formatiranje: ${broj} (${matice.length} matičnih) — matične rezervisane magacioneru`);
        } catch (e) {
            say("Upis naloga nije uspeo: " + (e?.message || e) + " — proveri kolone tabele operativni_nalozi u ovom fajlu (blok označen ⚠).", "err");
        } finally { setBusy(false); }
    }

    const Toggle = ({ active, onClick, title, desc }) => (
        <button onClick={onClick} style={{ textAlign: "left", flex: 1, minWidth: 240, border: active ? `2px solid ${BLUE}` : "1px solid #e2e8f0", background: active ? "#eef2ff" : "#fff", borderRadius: 12, padding: "11px 14px", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 3 }}>
                <span style={{ width: 16, height: 16, borderRadius: 5, border: active ? "none" : "1.5px solid #cbd5e1", background: active ? BLUE : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 900 }}>{active ? "✓" : ""}</span>
                <span style={{ fontWeight: 800, fontSize: 12.5, color: active ? BLUE : INK }}>{title}</span>
            </div>
            <div style={{ fontSize: 11, color: SLATE, paddingLeft: 25 }}>{desc}</div>
        </button>
    );

    const z = rezultat?.zbirno;
    return (
        <div style={{ maxWidth: 940, margin: "0 auto", padding: 20, fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: INK }}>
            <div style={{ background: "linear-gradient(90deg,#111827,#7c3aed)", borderRadius: 16, padding: "18px 22px", color: "#fff", marginBottom: 16 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, opacity: .8, fontWeight: 800 }}>FORMATIRANJE PO POTREBI</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>Šta mi treba</div>
                <div style={{ fontSize: 12.5, opacity: .85, marginTop: 4 }}>{loading ? "Učitavam magacin…" : `${magacin.length} dostupnih matičnih na stanju`}</div>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "end" }}>
                <div style={{ flex: "1 1 220px" }}>
                    <label style={lbl}>Iz naloga (opciono · prazno = preventivno)</label>
                    <input style={field} value={izvorPonbr} placeholder="MP-2026-0018" onChange={(e) => setIzvorPonbr(e.target.value)} />
                </div>
                <Toggle active={zaokruzi} onClick={() => setZaokruzi((v) => !v)} title="Zaokruži naviše" desc="Kad ne pokrije tačno — višak na stanje. Isključeno = stani i traži." />
                <Toggle active={bocni} onClick={() => setBocni((v) => !v)} title="Bočni ostatak → stanje" desc="Ostatak ≥ najuže tražene širine postaje nova rola." />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {rows.map((r, i) => <FormatCard key={r._uid} i={i} row={r} magacin={magacin} onPatch={(p) => patch(r._uid, p)} onRemove={() => remove(r._uid)} canRemove={rows.length > 1} />)}
            </div>

            <button onClick={add} style={{ marginTop: 12, width: "100%", border: "1.5px dashed #c7d2fe", background: "#f5f7ff", color: BLUE, borderRadius: 12, padding: 12, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>+ Dodaj format</button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, padding: "14px 16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14 }}>
                <div style={{ fontSize: 12.5, color: "#475569", fontWeight: 700 }}>{validne.length} {validne.length === 1 ? "format" : "formata"} · ukupno <b style={{ color: INK }}>{ukupnoM.toLocaleString("sr")} m</b></div>
                <button onClick={predlozi} disabled={!validne.length || loading} style={{ border: "none", background: validne.length && !loading ? BLUE : "#cbd5e1", color: "#fff", borderRadius: 11, padding: "12px 22px", fontWeight: 900, fontSize: 14, cursor: validne.length && !loading ? "pointer" : "not-allowed" }}>Predloži raspored →</button>
            </div>

            {rezultat && (
                <div style={{ marginTop: 18 }}>
                    <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                        {[["Matičnih (naloga)", z.maticnih, BLUE], ["Pokriveno rolni", z.pokriveno_rolni, GREEN], ["Iskorišćenje", z.iskoriscenje_pct + "%", z.iskoriscenje_pct >= 90 ? GREEN : ORANGE], ["Fali rolni", z.fali_rolni, z.fali_rolni ? RED : "#94a3b8"]].map(([l, v, c]) => (
                            <div key={l} style={{ flex: 1, minWidth: 120, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" }}>
                                <div style={{ ...lbl, marginBottom: 4 }}>{l}</div><div style={{ fontSize: 20, fontWeight: 900, color: c }}>{v}</div>
                            </div>
                        ))}
                    </div>

                    {rezultat.nalozi.map((n) => (
                        <div key={n.maticna_id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, marginBottom: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid #eef2f7", paddingBottom: 10, marginBottom: 12 }}>
                                <div style={{ fontWeight: 900 }}><span style={{ color: BLUE }}>{n.broj}</span><span style={{ color: "#94a3b8", fontWeight: 700, marginLeft: 8, fontSize: 12 }}>matična {n.br_rolne} · {n.sirina_mm} mm</span></div>
                                <div style={{ fontSize: 12, color: "#475569", fontWeight: 800 }}>utrošak {n.utrosak_m.toLocaleString("sr")} m</div>
                            </div>
                            {(n.plan_reza || []).map((s, k) => (
                                <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "7px 0", borderTop: k ? "1px dashed #eef2f7" : "none" }}>
                                    <span style={{ fontSize: 11, fontWeight: 900, color: "#334155", minWidth: 74 }}>segment {s.duzina_m} m</span>
                                    {(s.trake || []).map((t, ti) => <Traka key={ti} t={t} />)}
                                    {s.otpad_mm > 0 && <span style={{ border: "1px dashed #fca5a5", color: RED, borderRadius: 8, padding: "4px 9px", fontSize: 11, fontWeight: 800 }}>otpad {s.otpad_mm} mm</span>}
                                </div>
                            ))}
                        </div>
                    ))}

                    {rezultat.na_stanje.length > 0 && (
                        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                            <div style={{ ...lbl, marginBottom: 8 }}>Nove role na stanje (bočni ostaci)</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{rezultat.na_stanje.map((s, i) => <span key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 800, color: "#475569" }}>{s.sirina_mm} mm × {s.duzina_m} m</span>)}</div>
                        </div>
                    )}

                    {rezultat.fali.length > 0 && (
                        <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                            <div style={{ ...lbl, color: RED, marginBottom: 8 }}>Fali — ručno rešiti (motor ne izmišlja)</div>
                            {rezultat.fali.map((f, i) => <div key={i} style={{ fontSize: 12.5, color: "#991b1b", fontWeight: 700, padding: "3px 0" }}>{f.rolni_kom}× {f.sirina_mm} mm × {f.duzina_m} m — <span style={{ fontWeight: 800 }}>{f.razlog}</span></div>)}
                        </div>
                    )}

                    <button onClick={kreiraj} disabled={busy || !rezultat.nalozi.length} style={{ width: "100%", border: "none", background: !busy && rezultat.nalozi.length ? GREEN : "#cbd5e1", color: "#fff", borderRadius: 12, padding: 14, fontWeight: 900, fontSize: 14, cursor: !busy && rezultat.nalozi.length ? "pointer" : "not-allowed" }}>
                        {busy ? "Kreiram…" : `Kreiraj ${rezultat.nalozi.length} nalog(a) za formatiranje →`}
                    </button>
                </div>
            )}
        </div>
    );
}
