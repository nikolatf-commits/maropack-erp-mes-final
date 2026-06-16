rimport React, { useEffect, useMemo, useState } from "react";
import MaterialSelectorPRO, { MaterialText } from './components/MaterialSelectorPRO.jsx';
import { supabase } from "./supabase";
import NalogLayoutPRO from "./NalogLayoutPRO.jsx";
import { QRCodeSVG } from "qrcode.react";
import { enrichNalogForPrint } from "./utils/nalogDataLink";

const TABOVI = [
    { tip: "materijal", naziv: "Potreba materijala", ik: "📦", boja: "#f59e0b" },
    { tip: "stampa", naziv: "Štampa", ik: "🖨️", boja: "#3b82f6" },
    { tip: "kasiranje", naziv: "Kaširanje", ik: "🔗", boja: "#1d4ed8" },
    { tip: "perforacija_rezanje", naziv: "Perforacija i rezanje", ik: "✂️", boja: "#6366f1" },
    { tip: "kesa", naziv: "Kesa", ik: "🛍️", boja: "#b91c1c" },
    { tip: "formatiranje", naziv: "Formatiranje", ik: "🎞️", boja: "#7c3aed" },
    { tip: "spulna", naziv: "Špulna", ik: "🧵", boja: "#059669" },
];

function nalogType(n) {
    const x = String(n.tip_naloga || n.vrsta || n.tipOperacije || n.operacija || n.naziv || "").toLowerCase();
    if (x.includes("mater")) return "materijal";
    if (x.includes("štamp") || x.includes("stamp")) return "stampa";
    if (x.includes("kaš") || x.includes("kas")) return "kasiranje";
    if (x.includes("rez") || x.includes("perf")) return "perforacija_rezanje";
    if (x.includes("kes")) return "kesa";
    if (x.includes("format")) return "formatiranje";
    if (x.includes("spul") || x.includes("špul")) return "spulna";
    return "materijal";
}

function productTabs(tipProizvoda) {
    const tip = String(tipProizvoda || "folija").toLowerCase();
    if (tip.includes("kes")) return ["materijal", "kasiranje", "kesa"];
    if (tip.includes("spul") || tip.includes("špul")) return ["materijal", "formatiranje", "spulna"];
    return ["materijal", "stampa", "kasiranje", "perforacija_rezanje"];
}

export default function PregledNalogaPRO({ brojNaloga, kalkulacijaId, nalozi: naloziProp = [], osnovniNalog = {}, onBack, onClose }) {
    const [nalozi, setNalozi] = useState(naloziProp);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState("materijal");
    const [tplRow, setTplRow] = useState(null);
    const [rezRolne, setRezRolne] = useState([]);

    useEffect(() => {
        setNalozi((naloziProp || []).map(enrichNalogForPrint));
    }, [naloziProp]);

    useEffect(() => {
        async function load() {
            if (!brojNaloga) return;
            setLoading(true);
            try {
                const safeBroj = String(brojNaloga).replace(/[,()]/g, "").trim();

                // Novi izvor istine: radni_nalozi + operativni_nalozi.
                // 1) Prvo tražimo glavni nalog po broju.
                const masterResp = await supabase
                    .from("radni_nalozi")
                    .select("*")
                    .eq("broj_naloga", safeBroj)
                    .maybeSingle();

                if (masterResp.error && masterResp.error.code !== "PGRST116") throw masterResp.error;

                let ops = [];
                if (masterResp.data?.id) {
                    const { data, error } = await supabase
                        .from("operativni_nalozi")
                        .select("*")
                        .eq("glavni_nalog_id", masterResp.data.id)
                        .order("redosled", { ascending: true });
                    if (error) throw error;
                    ops = data || [];
                }

                // 2) Ako je otvoren direktno operativni broj, npr. 0000001/2026-MATERIJAL.
                if (!ops.length) {
                    const { data, error } = await supabase
                        .from("operativni_nalozi")
                        .select("*")
                        .eq("broj_naloga", safeBroj)
                        .order("redosled", { ascending: true });
                    if (error) throw error;
                    ops = data || [];
                }

                // 3) Ako je prosleđen samo osnovni broj, učitaj sve podnaloge sa tim prefiksom.
                if (!ops.length) {
                    const { data, error } = await supabase
                        .from("operativni_nalozi")
                        .select("*")
                        .ilike("broj_naloga", `${safeBroj}-%`)
                        .order("redosled", { ascending: true });
                    if (error) throw error;
                    ops = data || [];
                }

                const mapped = (ops || []).map(n => enrichNalogForPrint({
                    ...n,
                    ...(n.parametri || {}),
                    ...(n.parametri_operacije || {}),
                    master_nalog: masterResp.data || null,
                    ponBr: masterResp.data?.broj_naloga || String(n.broj_naloga || "").split("-")[0],
                    prod: n.proizvod || n.parametri?.proizvod || n.parametri?.naziv,
                    mats: n.parametri?.mats || n.parametri?.struktura || [],
                    res: n.parametri?.res || null,
                }));
                setNalozi(mapped);
            } catch (e) {
                console.error("Greška pri učitavanju naloga:", e);
            }
            setLoading(false);
        }
        load();
    }, [brojNaloga]);

    // Povuci originalni template iz `proizvodi` (dizajn na rolni, perforacija, broj traka…)
    const tplKey = useMemo(() => {
        const src = [...(nalozi || []), osnovniNalog || {}];
        for (const n of src) {
            const tid = n?.template_id || n?.product_template_id || n?.template?.template_id || n?.parametri?.template?.template_id;
            if (tid) return { by: "template_id", val: String(tid) };
        }
        for (const n of src) {
            const pid = n?.product_master_id || n?.template?.product_master_id || n?.parametri?.template?.product_master_id;
            if (pid) return { by: "product_master_id", val: String(pid) };
        }
        return null;
    }, [nalozi, osnovniNalog]);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!tplKey) { setTplRow(null); return; }
            try {
                const { data } = await supabase.from("proizvodi").select("*").eq(tplKey.by, tplKey.val).limit(1).maybeSingle();
                if (alive) setTplRow(data || null);
            } catch (e) { if (alive) setTplRow(null); }
        })();
        return () => { alive = false; };
    }, [tplKey?.by, tplKey?.val]);

    // Rezervisane rolne za ovaj nalog (magacin.dodeljeno_nalogu ~ broj glavnog naloga)
    const masterBroj = useMemo(() => {
        const raw = String(brojNaloga || (osnovniNalog && (osnovniNalog.master_broj || osnovniNalog.broj_naloga)) || "");
        return raw.replace(/-(MATERIJAL|STAMPA|KASIRANJE|PERFORACIJA_REZANJE|FORMATIRANJE|SPULNA|KESA)$/i, "").trim();
    }, [brojNaloga, osnovniNalog]);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!masterBroj) { setRezRolne([]); return; }
            try {
                const { data } = await supabase.from("magacin").select("*").ilike("dodeljeno_nalogu", "%" + masterBroj + "%").limit(60);
                if (!alive) return;
                setRezRolne((data || []).map((r) => ({
                    qr: r.br_rolne || r.qr_code || r.id,
                    lot: r.lot, lokacija: r.lokacija, sirina: r.sirina,
                    duzina: r.metraza_ost || r.metraza, kg: r.kg_neto,
                    napomena: r.napomena, rezervisao: r.rezervisao,
                })));
            } catch (e) { if (alive) setRezRolne([]); }
        })();
        return () => { alive = false; };
    }, [masterBroj]);

    const tipProizvoda = nalozi[0]?.tip_proizvoda || nalozi[0]?.tip || osnovniNalog.tip_proizvoda || osnovniNalog.tip || "folija";

    const dostupni = useMemo(() => {
        const poNalogu = TABOVI.filter(t => nalozi.some(n => nalogType(n) === t.tip));
        if (poNalogu.length) return poNalogu;
        const dozvoljeni = productTabs(tipProizvoda);
        return TABOVI.filter(t => dozvoljeni.includes(t.tip));
    }, [nalozi, tipProizvoda]);

    useEffect(() => {
        if (dostupni.length && !dostupni.some(t => t.tip === tab)) setTab(dostupni[0].tip);
    }, [dostupni, tab]);

    const aktivni = {
        ...enrichNalogForPrint(nalozi.find(n => nalogType(n) === tab) || osnovniNalog),
        ponBr: brojNaloga || osnovniNalog.ponBr,
        tip_proizvoda: tipProizvoda,
        tip_naloga: tab,
        naziv: TABOVI.find(t => t.tip === tab)?.naziv || "Radni nalog",
    };

    // Dopuni nalog podacima iz originalnog template-a (dizajn na rolni, perforacija, broj traka),
    // ali vrednosti samog naloga imaju prednost.
    if (rezRolne && rezRolne.length && !(aktivni.rezervisane_rolne && aktivni.rezervisane_rolne.length)) {
        aktivni.rezervisane_rolne = rezRolne;
    }
    if (tplRow) {
        const tdata = tplRow.data || tplRow;
        const tf = (tdata && tdata.folija) || tplRow.folija || null;
        if (!aktivni.product_template && !aktivni.template) {
            aktivni.product_template = { ...tplRow, data: tdata };
        }
        if (tf) {
            const nf = aktivni.folija || {};
            aktivni.folija = {
                ...tf,
                ...nf,
                stampa: { ...(tf.stampa || {}), ...(nf.stampa || {}), dizajn: (nf.stampa && nf.stampa.dizajn) || tf.stampa?.dizajn || null },
                perforacija: (nf.perforacija && Object.keys(nf.perforacija).length) ? nf.perforacija : (tf.perforacija || null),
                rezanje: { ...(tf.rezanje || {}), ...(nf.rezanje || {}) },
                kpdf: { ...(tf.kpdf || {}), ...(nf.kpdf || {}) },
            };
        }
    }

    const naslovBroj = brojNaloga || aktivni.ponBr || osnovniNalog.ponBr || "—";
    const closeFn = onBack || onClose;
    const [showQr, setShowQr] = useState(false);
    const masterId = osnovniNalog.id || osnovniNalog.master_nalog_id || aktivni.glavni_nalog_id || aktivni.master_nalog_id || aktivni.id;
    const qrUrl = (typeof window !== "undefined" ? window.location.origin : "") + "/?nalog=" + encodeURIComponent(naslovBroj);

    async function obrisiNalog() {
        if (!confirm("Obrisati ceo nalog " + naslovBroj + " sa svim operacijama? Ovo se ne može vratiti.")) return;
        try {
            const ids = (nalozi || []).map(n => n.id).filter(Boolean);
            if (masterId) {
                await supabase.from("operativni_nalozi").delete().eq("glavni_nalog_id", masterId);
                await supabase.from("radni_nalozi").delete().eq("id", masterId);
            }
            if (ids.length) { try { await supabase.from("operativni_nalozi").delete().in("id", ids); } catch (e) { } }
            alert("Nalog " + naslovBroj + " je obrisan.");
            if (closeFn) closeFn();
        } catch (e) { alert("Greška pri brisanju: " + (e.message || e)); }
    }
    function stampaj() { if (typeof window !== "undefined") window.print(); }

    return (
        <div style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>📋 Pregled radnih naloga</h2>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                        Broj: <b>{naslovBroj}</b> · Tip proizvoda: <b>{String(tipProizvoda).toUpperCase()}</b> · {nalozi.length} naloga
                    </div>
                </div>
                <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={stampaj} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #0f766e", background: "#0f766e", color: "#fff", fontWeight: 900, cursor: "pointer" }}>🖨️ Štampaj</button>
                    <button onClick={() => setShowQr(true)} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #334155", background: "#fff", color: "#334155", fontWeight: 900, cursor: "pointer" }}>🔳 QR</button>
                    <button onClick={obrisiNalog} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #dc2626", background: "#fff", color: "#dc2626", fontWeight: 900, cursor: "pointer" }}>🗑️ Obriši</button>
                    {closeFn && (
                        <button onClick={closeFn} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #2563eb", background: "#fff", color: "#1d4ed8", fontWeight: 900, cursor: "pointer" }}>← Nazad</button>
                    )}
                </div>
            </div>

            {showQr && (
                <div className="no-print" onClick={() => setShowQr(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 24, textAlign: "center", maxWidth: 320 }}>
                        <div style={{ fontSize: 16, fontWeight: 950, marginBottom: 4 }}>QR naloga</div>
                        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>{naslovBroj}</div>
                        <div style={{ padding: 12, border: "1px solid #e2e8f0", borderRadius: 12, display: "inline-block" }}>
                            <QRCodeSVG value={qrUrl} size={200} level="M" includeMargin={true} />
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, wordBreak: "break-all" }}>{qrUrl}</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>Skeniraj telefonom da otvoriš nalog.</div>
                        <button onClick={() => setShowQr(false)} style={{ width: "100%", marginTop: 16, padding: "11px", borderRadius: 10, border: "none", background: "#0f766e", color: "#fff", fontWeight: 900, cursor: "pointer" }}>Zatvori</button>
                    </div>
                </div>
            )}

            {loading && <div style={{ marginBottom: 12, color: "#64748b", fontWeight: 700 }}>Učitavam naloge...</div>}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {dostupni.map(t => (
                    <button
                        key={t.tip}
                        onClick={() => setTab(t.tip)}
                        style={{
                            padding: "9px 13px",
                            borderRadius: 999,
                            border: tab === t.tip ? "2px solid " + t.boja : "1px solid #e2e8f0",
                            background: tab === t.tip ? t.boja : "#fff",
                            color: tab === t.tip ? "#fff" : "#334155",
                            fontWeight: 900,
                            cursor: "pointer",
                            boxShadow: tab === t.tip ? "0 8px 18px rgba(15,23,42,0.12)" : "none"
                        }}
                    >
                        {t.ik} {t.naziv}
                    </button>
                ))}
            </div>

            <NalogLayoutPRO key={tab + "-" + (aktivni.id || aktivni.tip_naloga || "novi")} nalog={aktivni} activeTab={tab} />
        </div>
    );
}


// V46_MATERIAL_MASTER_EVERYWHERE: ovaj fajl je pripremljen za MaterialSelectorPRO / MaterialText.


// V47_NALOG_FULL_MATERIAL_NAME: nalozi treba da prikazuju pun naziv materijala: VRSTA + OZNAKA + DEBLJINA, npr. BOPP FXCB 20µ.
