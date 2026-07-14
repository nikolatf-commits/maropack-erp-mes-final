import React, { useEffect, useMemo, useState } from "react";
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

// Operativni nalozi imaju broj SA SUFIKSOM operacije ("MP-2026-0016-PERFORACIJA_REZANJE"),
// a glavni nalog u radni_nalozi ima CIST broj ("MP-2026-0016"). Bez skidanja sufiksa
// pretraga glavnog naloga ne nadje nista, lista operacija ostane prazna, tab padne na
// "materijal", a `find()` na osnovniNalog — pa se stampa naslov jedne operacije
// sa brojem i QR-om DRUGE. Radnik bi skenirao "materijal" a startovao rezanje.
const OP_SUFIKS = /-(MATERIJAL|STAMPA|LAKIRANJE|KASIRANJE|PERFORACIJA_REZANJE|FORMATIRANJE|KESA|SPULNA)$/i;
function skiniSufiks(b) { return String(b || "").trim().replace(OP_SUFIKS, ""); }

export default function PregledNalogaPRO({ brojNaloga, kalkulacijaId, nalozi: naloziProp = [], osnovniNalog = {}, onBack, onClose }) {
    const [nalozi, setNalozi] = useState(naloziProp);
    const [loading, setLoading] = useState(false);
    // Pocetni tab = operacija koju je korisnik STVARNO kliknuo (ranije uvek "materijal").
    const [tab, setTab] = useState(() => nalogType(osnovniNalog) || "materijal");
    const [tplRow, setTplRow] = useState(null);
    const [rezRolne, setRezRolne] = useState([]);

    useEffect(() => {
        setNalozi((naloziProp || []).map(enrichNalogForPrint));
    }, [naloziProp]);

    const [refreshTick, setRefreshTick] = useState(0);

    // Nalog napravljen u templejtu se ranije nije video dok se stranica ne osveži.
    //
    // BUG (popravljen): kanal je imao FIKSNO ime i osvežavao se na SVAKU promenu bilo kog
    // naloga u bazi. Ako se komponenta montira više puta, kanali se sudaraju, a refetch
    // okida u rafalu → ekran treperi (belo/crno) i sve je sporo.
    //
    // Sada: jedinstveno ime kanala, filter SAMO na ovaj nalog, i odlaganje (debounce).
    useEffect(() => {
        if (!brojNaloga) return;
        let tajmer = null;
        const osvezi = () => {
            clearTimeout(tajmer);
            tajmer = setTimeout(() => setRefreshTick((t) => t + 1), 400);   // debounce
        };

        // Event iz templejta — osveži samo ako je nastao BAŠ ovaj nalog.
        const naEvent = (e) => {
            const broj = e?.detail?.broj;
            if (!broj || String(broj) === String(brojNaloga)) osvezi();
        };
        if (typeof window !== "undefined") window.addEventListener("maropack:nalozi-changed", naEvent);

        let ch = null;
        try {
            const ime = "nalozi-" + String(brojNaloga).replace(/[^\w-]/g, "") + "-" + Math.random().toString(36).slice(2, 8);
            ch = supabase.channel(ime)
                .on("postgres_changes",
                    { event: "*", schema: "public", table: "radni_nalozi", filter: "broj_naloga=eq." + brojNaloga },
                    osvezi)
                .on("postgres_changes",
                    { event: "*", schema: "public", table: "operativni_nalozi" },
                    (p) => {
                        // operativni nalozi imaju broj MP-2026-0008-MATERIJAL → poredi prefiks
                        const b = String(p?.new?.broj_naloga || p?.old?.broj_naloga || "");
                        if (b.startsWith(String(brojNaloga))) osvezi();
                    })
                .subscribe();
        } catch (e) { }

        return () => {
            clearTimeout(tajmer);
            if (typeof window !== "undefined") window.removeEventListener("maropack:nalozi-changed", naEvent);
            try { if (ch) supabase.removeChannel(ch); } catch (e) { }
        };
    }, [brojNaloga]);

    useEffect(() => {
        async function load() {
            if (!brojNaloga) return;
            setLoading(true);
            try {
                const safeBroj = skiniSufiks(String(brojNaloga).replace(/[,()]/g, "").trim());

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
    }, [brojNaloga, refreshTick]);

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

    // Fallback na osnovniNalog SAMO ako je to bas ta operacija. Ranije se slepo
    // uzimao bilo koji prosledjeni nalog, pa je papir dobijao naslov jedne operacije
    // i broj/QR druge (npr. "NALOG ZA MATERIJAL" sa brojem PERFORACIJA_REZANJE).
    const nadjen = nalozi.find(n => nalogType(n) === tab)
        || (nalogType(osnovniNalog) === tab ? osnovniNalog : null);

    const aktivni = {
        ...enrichNalogForPrint(nadjen || {}),
        ponBr: skiniSufiks(brojNaloga) || osnovniNalog.ponBr,
        tip_proizvoda: tipProizvoda,
        tip_naloga: tab,
        naziv: TABOVI.find(t => t.tip === tab)?.naziv || "Radni nalog",
    };
    // Bez ovoga bi QR na papiru nosio opid pogresne operacije.
    if (!nadjen) { aktivni.id = null; aktivni.broj_naloga = ""; }

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
    const masterIdGuess = (nalozi && nalozi[0] && (nalozi[0].glavni_nalog_id || (nalozi[0].master_nalog && nalozi[0].master_nalog.id))) || osnovniNalog.id || osnovniNalog.master_nalog_id || null;
    const masterBrojOf = (s) => String(s || "").replace(/[,()]/g, "").replace(/\s*[-–]\s*(MATERIJAL|MATERIAL|ŠTAMPA|STAMPA|KAŠIRANJE|KASIRANJE|PERFORACIJA[_ -]?REZANJE|PERFORACIJA|REZANJE|LAMINIRANJE|FORMATIRANJE)\b.*$/i, "").trim();

    async function obrisiNalog() {
        const masterBroj = masterBrojOf(naslovBroj);
        if (!confirm("Obrisati CEO nalog " + masterBroj + " (sve operacije za ovaj proizvod)? Ovo se ne može vratiti.")) return;
        try {
            // 1) Nađi master id (iz učitanih naloga, pa iz baze po broju, pa preko operacije)
            let masterId = masterIdGuess;
            if (!masterId) { try { const { data } = await supabase.from("radni_nalozi").select("id").eq("broj_naloga", masterBroj).maybeSingle(); if (data && data.id) masterId = data.id; } catch (e) { } }
            if (!masterId) { try { const { data } = await supabase.from("operativni_nalozi").select("glavni_nalog_id").ilike("broj_naloga", masterBroj + "-%").limit(1); if (data && data[0]) masterId = data[0].glavni_nalog_id; } catch (e) { } }

            let err = null, deleted = 0;
            const del = async (q) => { const r = await q.select("id"); if (r.error) err = r.error; else deleted += (r.data ? r.data.length : 0); };

            // 2) Obriši sve operacije (po master id, po prefiksu broja, po tačnom broju, po id-jevima)
            const ids = (nalozi || []).map(n => n.id).filter(Boolean);
            if (masterId) await del(supabase.from("operativni_nalozi").delete().eq("glavni_nalog_id", masterId));
            await del(supabase.from("operativni_nalozi").delete().ilike("broj_naloga", masterBroj + "-%"));
            await del(supabase.from("operativni_nalozi").delete().eq("broj_naloga", String(naslovBroj).trim()));
            if (ids.length) await del(supabase.from("operativni_nalozi").delete().in("id", ids));

            // 3) Oslobodi rezervisane rolne tog naloga
            try { await supabase.from("magacin").update({ dodeljeno_nalogu: null, rezervisano: false }).ilike("dodeljeno_nalogu", "%" + masterBroj + "%"); } catch (e) { }

            // 4) Obriši master
            if (masterId) await del(supabase.from("radni_nalozi").delete().eq("id", masterId));
            else await del(supabase.from("radni_nalozi").delete().eq("broj_naloga", masterBroj));

            if (err) { alert("Brisanje nije uspelo: " + (err.message || err)); return; }
            if (deleted === 0) {
                alert("Ništa nije obrisano. Najverovatnije baza ne dozvoljava brisanje (RLS politika). Treba dodati DELETE dozvolu u Supabase za tabele radni_nalozi i operativni_nalozi. Reci mi pa ti dam tačan SQL.");
                return;
            }
            alert("Nalog " + masterBroj + " je obrisan (" + deleted + " stavki).");
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
                    <button onClick={obrisiNalog} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #dc2626", background: "#fff", color: "#dc2626", fontWeight: 900, cursor: "pointer" }}>🗑️ Obriši</button>
                    {closeFn && (
                        <button onClick={closeFn} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #2563eb", background: "#fff", color: "#1d4ed8", fontWeight: 900, cursor: "pointer" }}>← Nazad</button>
                    )}
                </div>
            </div>

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
