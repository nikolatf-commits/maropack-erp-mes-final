import React, { useMemo, useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { useAuth } from "./auth/AuthProvider";

const BLUE = "#2563eb";
const GREEN = "#059669";
const ORANGE = "#f59e0b";
const PURPLE = "#7c3aed";
const RED = "#dc2626";

const sampleProducts = [];

// Mogući statusi proizvoda (menja se iz zaglavlja). Vrednost u bazi je mala slova
// (da prođe kroz check-constraint "proizvodi_status_check"); labela je za prikaz.
const STATUS_OPCIJE = [
    { v: "aktivan", l: "Aktivan" },
    { v: "razvoj", l: "Razvoj" },
    { v: "stop", l: "Stop" },
];
function statusKanon(s) { const x = String(s || "").toLowerCase(); return x.includes("raz") ? "razvoj" : x.includes("stop") ? "stop" : "aktivan"; }
function statusBoja(v) { const x = statusKanon(v); return x === "razvoj" ? ORANGE : x === "stop" ? RED : GREEN; }

function normalizeTip(tip) {
    const t = String(tip || "").toLowerCase();
    if (t.includes("kes")) return "kesa";
    if (t.includes("spul") || t.includes("špul")) return "spulna";
    return "folija";
}

function statusColor(status) {
    const s = String(status || "").toLowerCase();
    if (s.includes("akt")) return GREEN;
    if (s.includes("raz")) return ORANGE;
    if (s.includes("stop")) return RED;
    return BLUE;
}

function tipColor(tip) {
    const t = normalizeTip(tip);
    if (t === "kesa") return ORANGE;
    if (t === "spulna") return PURPLE;
    return BLUE;
}

function makeProductMasterId(source = {}) {
    const raw = source.product_master_id || source.productMasterId || source.id || source.sifra || source.naziv;
    if (raw && String(raw).startsWith('PROD-')) return String(raw);
    if (raw && String(raw).startsWith('PRD-')) return 'PROD-' + String(raw).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toUpperCase();
    const seed = [source.kupac, source.naziv, source.sifra, source.tip].filter(Boolean).join('-') || String(Date.now());
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
    return 'PROD-' + Math.abs(h).toString().padStart(6, '0').slice(0, 6);
}

function inferOperations(template = {}, tip = 'folija') {
    if (tip === 'kesa') return ['materijal', 'kasiranje', 'kesa'];
    if (tip === 'spulna') return ['materijal', 'formatiranje', 'spulna'];
    const layers = template.folija?.layers || [];
    const ops = ['materijal'];
    if (layers.some(l => l?.stampa || l?.stamp || l?.Š) || template.folija?.stampa?.brojBoja) ops.push('stampa');
    if (layers.length > 1 || template.folija?.kasiranje?.brojKasiranja) ops.push('kasiranje');
    ops.push('perforacija_rezanje');
    return ops;
}

function normalizeLayer(l = {}, product = {}) {
    const ideal = l.idealna_sirina || l.idealnaSirina || l.sirina || product.sir || product.sirina || product.idealna_sirina || "";
    return {
        vrsta: l.vrsta || l.tip || l.material || l.materijal || "—",
        pod_vrsta: l.pod_vrsta || l.podVrsta || l.podvrsta || l.subtype || "—",
        oznaka: l.oznaka || l.oznaka_materijala || l.sifra || l.material || "—",
        proizvodjac: l.proizvodjac || l.proizvođač || l.dobavljac || "—",
        debljina: l.debljina || l.deb || "—",
        koef: l.koef || l.koeficijent || "—",
        gsm: l.gsm || l.tezina || l.gm2 || "—",
        sirina: ideal || "—",
        cena: l.cena || l.price || "—",
        spoj_materijala: l.spoj_materijala || l.spojMaterijala || l.spoj || "—",
        broj_spojeva: l.broj_spojeva || l.brojSpojeva || l.spojeva || "—",
        stampa: !!(l.stampa || l.stamp || l.Š),
        lak: !!(l.lak || l.L)
    };
}

function productDataForm(p = {}, tip = normalizeTip(p.tip)) {
    const std = p.standardi || {};
    const rec = std.record || {};
    const existing = p.data || p.template || rec.data;
    if (existing && typeof existing === "object") {
        return {
            ...existing,
            type: normalizeTip(existing.type || p.tip || tip),
            naziv: existing.naziv || p.naziv || "",
            kupac: existing.kupac || p.kupac || "",
            sifra: existing.sifra || p.sku || "",
            product_master_id: p.product_master_id || existing.product_master_id || ('PROD-' + p.id),
            template_id: p.template_id || existing.template_id || ('TPL-' + p.id),
            template_version: p.template_version || existing.template_version || "V1",
            db_id: p.id,
            template_locked: true
        };
    }
    const layersRaw = Array.isArray(p.materijali_struktura) ? p.materijali_struktura : (Array.isArray(p.mats) ? p.mats : []);
    const layers = layersRaw.map(l => ({
        ...l,
        vrsta: l.vrsta || l.tip || l.materijal || "",
        pod_vrsta: l.pod_vrsta || l.podVrsta || l.podvrsta || "",
        oznaka: l.oznaka || l.oznaka_materijala || "",
        proizvodjac: l.proizvodjac || l.dobavljac || "",
        debljina: l.debljina || l.deb || "",
        sirina: l.sirina || p.sir || p.sirina || "",
        stampa: !!(l.stampa || l.stamp),
        lak: !!(l.lak || l.L)
    }));
    return {
        type: tip,
        naziv: p.naziv || "",
        kupac: p.kupac || "",
        sifra: p.sku || "",
        product_master_id: p.product_master_id || ('PROD-' + p.id),
        template_id: p.template_id || ('TPL-' + p.id),
        template_version: p.template_version || "V1",
        db_id: p.id,
        template_locked: true,
        idealnaSirinaMaterijala: p.sir || p.sirina || "",
        porucenaKolicina: p.met || "",
        [tip]: {
            naziv: p.naziv || "",
            layers,
            rezanje: { sirinaMaterijala: p.sir || p.sirina || "" },
            kolicina: p.nal || p.kolicina || "",
            sirina: p.kesa_sirina || "",
            duzina: p.kesa_duzina || "",
            klapna: p.kesa_klapna || ""
        }
    };
}

function mapProduct(p, index) {
    const tip = normalizeTip(p.tip || p.tip_proizvoda);
    const data = productDataForm(p, tip);
    const section = data[tip] || {};
    const layersRaw = section.layers || data.folija?.layers || data.kesa?.layers || data.spulna?.layers || p.materijali_struktura || p.mats || [];
    const layers = Array.isArray(layersRaw) ? layersRaw : [];
    return {
        id: p.id || `PRD-${index}`,
        db_id: p.id || null,
        product_master_id: p.product_master_id || data.product_master_id || makeProductMasterId({ ...p, ...data, id: p.id }),
        template_id: p.template_id || data.template_id || (p.id ? 'TPL-' + p.id : null),
        naziv: p.naziv || p.proizvod || section.naziv || data.naziv || "Bez naziva",
        kupac: p.kupac || data.kupac || "Bez kupca",
        tip,
        status: p.status || section.status || "aktivan",
        verzija: p.template_version || data.template_version || p.verzija || "V1",
        sifra: p.sku || p.sifra || data.sifra || "—",
        datum: p.datum || (p.created_at ? new Date(p.created_at).toLocaleDateString("sr-RS") : "—"),
        operacije: Array.isArray(p.operacije) ? p.operacije : inferOperations(data, tip),
        materijali: layers.map((l) => normalizeLayer(l, p)),
        stampa: {
            boje: section.stampa?.brojBoja || section.brojBoja || "—",
            klise: section.stampa?.klise || "info",
            lak: section.stampa?.lak || "—",
            napomena: section.stampa?.napomena || "Kliše je informativan i ne ulazi automatski u cenu."
        },
        perforacija: {
            tip: section.kpdf?.enabled ? section.kpdf?.tip : section.options?.eurozumba ? "Eurozumba" : section.options?.mikroperforacija ? "Mikroperforacija" : "Nema",
            odnos: section.kpdf?.odnos || "—",
            pozicija: section.kpdf?.pozicija || "—"
        },
        finalnaRolna: {
            smer: section.finalRoll?.smerOdmotavanja || section.stampa?.smerOdmotavanja || section.smer || "—",
            hilzna: section.finalRoll?.hilzna || section.stampa?.precnikHilzne || "—",
            precnik: section.finalRoll?.precnik || section.rezanje?.precnikRolne || "—",
            duzina: section.finalRoll?.duzina || section.rezanje?.duzinaRolne || section.maxMetara || "—"
        },
        dokumentacija: {
            kpdf: section.kpdf?.enabled ? "Aktivan" : "Nije dodat",
            tehnickiList: "Priprema",
            slike: "—"
        },
        raw: { ...p, data }
    };
}



function materialRowsToTemplateLayers(rows = []) {
    return (rows || []).map((r) => ({
        material: [r.vrsta, r.oznaka].filter(Boolean).join(" ").trim(),
        materijal: r.vrsta || "",
        tip: r.vrsta || "",
        naziv: [r.vrsta, r.oznaka, r.debljina].filter(Boolean).join(" ").trim(),
        vrsta: r.vrsta || "",
        pod_vrsta: r.pod_vrsta || "",
        oznaka: r.oznaka || "",
        proizvodjac: r.proizvodjac || "",
        debljina: r.debljina || "",
        koef: r.koef || r.koeficijent || "",
        koeficijent: r.koeficijent || r.koef || "",
        gsm: r.gsm || r.gm2 || r.tezina || "",
        gm2: r.gm2 || r.gsm || r.tezina || "",
        tezina: r.gsm || r.gm2 || r.tezina || "",
        sirina: r.sirina || "",
        cena: r.cena || r.cena_kg || "",
        spoj_materijala: r.spoj_materijala || "",
        broj_spojeva: r.broj_spojeva || "",
        stampa: !!r.stampa,
        lak: !!r.lak
    }));
}

function buildTemplateFromProduct(product) {
    const raw = product?.raw || {};
    const existing = raw.data || raw.template || null;
    if (existing && typeof existing === "object") {
        return { ...existing, db_id: product.db_id || raw.id || existing.db_id, product_master_id: product.product_master_id || existing.product_master_id || makeProductMasterId(product), template_id: product.template_id || existing.template_id || (product.id ? 'TPL-' + product.id : null), template_version: product.verzija || existing.template_version || 'V1', template_locked: true, type: normalizeTip(existing.type || raw.tip || product.tip), naziv: existing.naziv || product.naziv, kupac: existing.kupac || product.kupac };
    }

    const tip = normalizeTip(product?.tip);
    const layers = materialRowsToTemplateLayers(product?.materijali || []);
    const base = {
        type: tip,
        naziv: product?.naziv || "",
        kupac: product?.kupac || "",
        sifra: product?.sifra || "",
        product_master_id: product?.product_master_id || makeProductMasterId(product || {}),
        template_version: product?.verzija || "V1",
        template_locked: true,
        napomena: "Kreirano iz Baze proizvoda PRO"
    };

    if (tip === "kesa") {
        return {
            ...base,
            kesa: {
                naziv: product?.naziv || "",
                layers,
                kolicina: "10000",
                skart: "10",
                marza: "30",
                sirina: layers[0]?.sirina || "200",
                duzina: "400",
                klapna: "50",
                falta: "0",
                options: {},
                positions: {},
                pakovanje: ""
            }
        };
    }

    if (tip === "spulna") {
        return {
            ...base,
            spulna: {
                naziv: product?.naziv || "",
                materijal: layers.map(l => l.material).filter(Boolean).join(" / ") || "",
                layers,
                W: layers[0]?.sirina || "25",
                maxMetara: String(product?.finalnaRolna?.duzina || "8000").replace(/[^0-9.,]/g, ""),
                smer: product?.finalnaRolna?.smer || "Gap winding"
            }
        };
    }

    return {
        ...base,
        folija: {
            naziv: product?.naziv || "",
            layers,
            rezanje: {
                sirinaMaterijala: layers[0]?.sirina || "",
                duzinaRolne: String(product?.finalnaRolna?.duzina || "").replace(/[^0-9.,]/g, ""),
                precnikRolne: String(product?.finalnaRolna?.precnik || "").replace(/[^0-9.,]/g, "")
            },
            stampa: {
                brojBoja: product?.stampa?.boje || "",
                klise: product?.stampa?.klise || "",
                smerOdmotavanja: product?.finalnaRolna?.smer || ""
            },
            kpdf: {
                enabled: product?.perforacija?.tip && product.perforacija.tip !== "Nema",
                tip: product?.perforacija?.tip || "KPDF",
                odnos: product?.perforacija?.odnos || "",
                pozicija: product?.perforacija?.pozicija || ""
            },
            finalRoll: {
                smerOdmotavanja: product?.finalnaRolna?.smer || "",
                hilzna: product?.finalnaRolna?.hilzna || "",
                precnik: product?.finalnaRolna?.precnik || "",
                duzina: product?.finalnaRolna?.duzina || ""
            }
        }
    };
}

function makeCalculationRecordFromProduct(product) {
    const template = buildTemplateFromProduct(product);
    const tip = normalizeTip(product?.tip || template.type);
    const section = template[tip] || {};
    let layers = section.layers || template.folija?.layers || template.kesa?.layers || template.spulna?.layers || [];
    // Rezerva: ako templejt nema slojeve u sekciji, uzmi ih iz proizvoda (materijali_struktura)
    if ((!Array.isArray(layers) || !layers.length) && Array.isArray(product?.materijali) && product.materijali.length) {
        layers = product.materijali;
    }
    // Ubaci slojeve u template[tip].layers da ih kalkulacija (koja čita folija.layers) sigurno nađe
    template[tip] = { ...(template[tip] || {}), layers };
    return {
        id: "KAL-PROD-" + Date.now(),
        created_at: new Date().toISOString(),
        datum: new Date().toLocaleDateString("sr-RS"),
        tip,
        naziv: product?.naziv || template.naziv || "Novi proizvod",
        klijent: product?.kupac || template.kupac || "",
        kupac: product?.kupac || template.kupac || "",
        status: "Draft iz Baze proizvoda",
        verzija: 1,
        source_product_id: product?.id || null,
        product_master_id: product?.product_master_id || template.product_master_id || makeProductMasterId(product || template),
        template_id: product?.template_id || template.template_id || (product?.db_id ? 'TPL-' + product.db_id : null),
        product_template_id: product?.db_id || product?.id || null,
        template_version: product?.verzija || template.template_version || "V1",
        template_locked: true,
        operacije: Array.isArray(product?.operacije) && product.operacije.length ? product.operacije : inferOperations(template, tip),
        materijali: layers,
        mats: layers,
        sirina: Number(section.rezanje?.sirinaMaterijala || section.sirina || section.W || layers[0]?.sirina || 0) || null,
        metraza: Number(String(section.rezanje?.duzinaRolne || section.finalRoll?.duzina || section.maxMetara || section.duzina || "").replace(/[^0-9.]/g, "")) || null,
        kolicina: Number(String(section.kolicina || section.rezanje?.duzinaRolne || section.maxMetara || "").replace(/[^0-9.]/g, "")) || null,
        skart: Number(section.skart || 10),
        marza: Number(section.marza || 40),
        osnovna_cena: 0,
        konacna_cena: 0,
        data: template,
        template,
        kalkulator_prefill: template,
        napomena: "Kalkulacija kreirana iz Baze proizvoda PRO"
    };
}

function Card({ children, style }) {
    return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, boxShadow: "0 10px 30px rgba(15,23,42,.06)", ...style }}>{children}</div>;
}

function Badge({ children, color = BLUE }) {
    return <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "5px 10px", background: `${color}12`, color, border: `1px solid ${color}33`, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: .3 }}>{children}</span>;
}

function InfoRow({ label, value }) {
    return <div style={{ display: "grid", gridTemplateColumns: "145px minmax(0,1fr)", gap: 10, padding: "10px 0", borderBottom: "1px solid #eef2f7", fontSize: 13 }}>
        <b style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: .4 }}>{label}</b>
        <span style={{ color: "#0f172a", fontWeight: 800 }}>{value || "—"}</span>
    </div>;
}

function MaterialTable({ rows = [] }) {
    const columns = ["#", "Vrsta", "Oznaka", "Debljina", "Koef", "g/m²", "Širina", "Cena", "Š", "L"];
    return <div style={{ overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 14 }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 930, fontSize: 12 }}>
            <thead>
                <tr>{columns.map((c, i) => <th key={c} style={{ position: "sticky", top: 0, background: "#f8fafc", color: "#334155", textAlign: i >= 8 ? "center" : "left", padding: "12px 10px", borderBottom: "1px solid #e2e8f0", fontSize: 11, textTransform: "uppercase", letterSpacing: .4 }}>{c}</th>)}</tr>
            </thead>
            <tbody>
                {rows.length ? rows.map((r, i) => <tr key={i} style={{ background: i % 2 ? "#fbfdff" : "#fff" }}>
                    <td style={tdStyle(true)}>{i + 1}</td>
                    <td style={tdStyle()}><b>{r.vrsta}</b></td>
                    <td style={tdStyle()}>{r.oznaka}</td>
                    <td style={tdStyle()}>{r.debljina}</td>
                    <td style={tdStyle()}>{r.koef}</td>
                    <td style={tdStyle()}>{r.gsm}</td>
                    <td style={tdStyle()}>{r.sirina}</td>
                    <td style={tdStyle()}>{r.cena}</td>
                    <td style={tdStyle(true)}>{r.stampa ? <Badge color={BLUE}>Š</Badge> : <span style={{ color: "#cbd5e1" }}>—</span>}</td>
                    <td style={tdStyle(true)}>{r.lak ? <Badge color={GREEN}>L</Badge> : <span style={{ color: "#cbd5e1" }}>—</span>}</td>
                </tr>) : <tr><td colSpan="10" style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontWeight: 800 }}>Nema definisanih materijala za ovaj proizvod.</td></tr>}
            </tbody>
        </table>
    </div>;
}

function tdStyle(center = false) {
    return { padding: "11px 10px", borderBottom: "1px solid #eef2f7", color: "#334155", fontWeight: 700, textAlign: center ? "center" : "left", whiteSpace: "nowrap" };
}

// =====================================================================
// DOKUMENTACIJA — upload / otvaranje (A4) / štampa / preuzimanje
// Čuvanje: 1) Supabase Storage (bucket "dokumentacija") + tabela
//          "proizvod_dokumenti";  2) fallback: base64 u localStorage
//          (radi odmah, ali je vidljivo samo na tom računaru/pregledaču).
// =====================================================================
const DOK_BUCKET = "dokumentacija";
const DOK_TIPOVI = [
    { k: "kpdf", l: "KPDF", icon: "📄", accept: "application/pdf,image/*" },
    { k: "tehnicki", l: "Tehnički list", icon: "📋", accept: "application/pdf,image/*" },
    { k: "slike", l: "Slike / crteži", icon: "🖼️", accept: "image/*,application/pdf" },
];
function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}
function localDocsKey(product) { return "maropack_docs_" + (product?.db_id || product?.id || "x"); }
function readLocalDocs(product) {
    try { const raw = localStorage.getItem(localDocsKey(product)); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function writeLocalDocs(product, docs) {
    try { localStorage.setItem(localDocsKey(product), JSON.stringify(docs)); return true; } catch (e) { return false; }
}
function isPdfDoc(d) {
    return String(d?.mime || "").includes("pdf") || /^data:application\/pdf/i.test(String(d?.url || "")) || /\.pdf($|\?|#|;)/i.test(String(d?.url || ""));
}
function downloadDoc(d) {
    try { const a = document.createElement("a"); a.href = d.url; a.download = d.naziv || "dokument"; a.target = "_blank"; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { window.open(d.url, "_blank"); }
}
function printDoc(d) {
    const w = window.open("", "_blank", "width=920,height=1200");
    if (!w) { alert("Dozvoli iskačuće prozore (pop-up) da bi štampa radila."); return; }
    const naslov = String(d.naziv || "Dokument").replace(/[<>]/g, "");
    // data: PDF se u iframe-u često ne učita za štampu — koristi blob: URL
    const printUrl = (isPdfDoc(d) && String(d.url || "").startsWith("data:")) ? dataUrlToBlobUrl(d.url) : d.url;
    if (isPdfDoc(d)) {
        w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + naslov + '</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100vh}</style></head><body><iframe id="f" src="' + printUrl + '"></iframe><script>var f=document.getElementById("f");f.onload=function(){setTimeout(function(){try{f.contentWindow.focus();f.contentWindow.print();}catch(e){try{window.print();}catch(_){}}},500);};<\/script></body></html>');
    } else {
        w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + naslov + '</title><style>@page{size:A4;margin:10mm}html,body{margin:0}img{width:100%;height:auto;display:block}</style></head><body onload="setTimeout(function(){window.print();},350)"><img src="' + printUrl + '"/></body></html>');
    }
    w.document.close();
}

export default function ProductMasterPRO({ db, setDb, setPage, msg }) {
    const auth = (() => { try { return useAuth(); } catch (e) { return {}; } })();
    const trenutniKorisnik = auth?.user?.ime || auth?.userProfile?.ime || auth?.user?.email || "nepoznat";
    const [query, setQuery] = useState("");
    const [tipFilter, setTipFilter] = useState("sve");
    const [statusFilter, setStatusFilter] = useState("sve");
    const [tab, setTab] = useState("osnovno");

    const products = useMemo(() => {
        const fromDb = Array.isArray(db?.proizvodi) ? db.proizvodi : [];
        const mapped = fromDb.map(mapProduct);
        // DEDUP: isti proizvod se NE prikazuje dva puta (uzrok: db.proizvodi nakratko ima
        // isti red i optimistički dodat i ponovo učitan, pre nego što se osveži F5).
        // Ključ: db_id → template_id → product_master_id → šifra+kupac+naziv.
        const kljuc = (p) => (p.db_id != null ? "id:" + p.db_id
            : p.template_id ? "tpl:" + p.template_id
                : p.product_master_id ? "pm:" + p.product_master_id
                    : "k:" + [p.sifra, p.kupac, p.naziv].map(x => String(x || "").toLowerCase().trim()).join("|"));
        const seen = new Map();
        for (const p of mapped) {
            const k = kljuc(p);
            const prev = seen.get(k);
            // zadrži zapis koji ima db_id (pravi red iz baze); inače prvi viđeni
            if (!prev || (p.db_id != null && prev.db_id == null)) seen.set(k, p);
        }
        return Array.from(seen.values());
    }, [db]);

    const filtered = useMemo(() => products.filter((p) => {
        const q = query.trim().toLowerCase();
        const okQ = !q || [p.naziv, p.kupac, p.sifra, p.tip].join(" ").toLowerCase().includes(q);
        const okTip = tipFilter === "sve" || p.tip === tipFilter;
        const okStatus = statusFilter === "sve" || String(p.status).toLowerCase().includes(statusFilter);
        return okQ && okTip && okStatus;
    }), [products, query, tipFilter, statusFilter]);

    const [selectedId, setSelectedId] = useState(null);
    const [istorija, setIstorija] = useState([]);
    const [istorijaLoad, setIstorijaLoad] = useState(false);
    // Dokumentacija (KPDF / Tehnički list / Slike-crteži)
    const [docs, setDocs] = useState([]);
    const [docsLoad, setDocsLoad] = useState(false);
    const [uploadingTip, setUploadingTip] = useState("");
    const [viewDoc, setViewDoc] = useState(null);
    // status (izmenljivo iz zaglavlja)
    const [savingStatus, setSavingStatus] = useState(false);

    // upiši događaj u istoriju (tabela: proizvod_istorija)
    async function zabeleziIstoriju(product, akcija, detalj) {
        if (!product) return;
        try {
            await supabase.from("proizvod_istorija").insert([{
                proizvod_id: product.db_id || null,
                proizvod_naziv: product.naziv || "",
                kupac: product.kupac || "",
                akcija: akcija,
                detalj: detalj || "",
                korisnik: trenutniKorisnik,
                created_at: new Date().toISOString()
            }]);
        } catch (e) { /* tabela možda još ne postoji — tiho */ }
    }

    // učitaj istoriju za izabrani proizvod
    async function ucitajIstoriju(product) {
        if (!product?.db_id) { setIstorija([]); return; }
        setIstorijaLoad(true);
        try {
            const { data, error } = await supabase.from("proizvod_istorija")
                .select("*").eq("proizvod_id", product.db_id).order("created_at", { ascending: false }).limit(100);
            if (error) throw error;
            setIstorija(Array.isArray(data) ? data : []);
        } catch (e) { setIstorija([]); }
        finally { setIstorijaLoad(false); }
    }
    const selected = filtered.find(p => p.id === selectedId) || filtered[0] || products[0];

    // učitaj istoriju kad se otvori tab "istorija" ili promeni proizvod
    useEffect(() => {
        if (tab === "istorija" && selected) ucitajIstoriju(selected);
    }, [tab, selected?.db_id]);

    // učitaj dokumentaciju kad se otvori tab "dok" ili "perforacija" (KPDF fajl) ili promeni proizvod
    useEffect(() => {
        if ((tab === "dok" || tab === "perforacija") && selected) loadDocs(selected);
        // eslint-disable-next-line
    }, [tab, selected?.db_id, selected?.id]);

    // ---- DOKUMENTACIJA: učitavanje / upload / brisanje ----
    async function loadDocs(product) {
        if (!product) { setDocs([]); return; }
        setDocsLoad(true);
        let dbDocs = [];
        try {
            if (product.db_id) {
                const { data, error } = await supabase.from("proizvod_dokumenti")
                    .select("*").eq("proizvod_id", product.db_id).order("created_at", { ascending: false });
                if (error) throw error;
                dbDocs = (data || []).map(r => ({
                    id: r.id, tip: r.tip, naziv: r.naziv, url: r.url, mime: r.mime,
                    created_at: r.created_at, korisnik: r.korisnik, storage_path: r.storage_path, source: "db"
                }));
            }
        } catch (e) { dbDocs = []; }
        const localDocs = readLocalDocs(product).map(d => ({ ...d, source: "local" }));
        setDocs([...dbDocs, ...localDocs]);
        setDocsLoad(false);
    }

    async function handleUpload(tip, file) {
        if (!file || !selected) return;
        // 15 MB granica (base64 u bazi/localStorage ume da pukne na većem)
        if (file.size && file.size > 15 * 1024 * 1024) {
            msg && msg("Fajl je veći od 15 MB — smanji ga ili koristi Supabase Storage.", "err");
            return;
        }
        setUploadingTip(tip);
        const naziv = file.name || (tip + "-dokument");
        const mime = file.type || "";
        try {
            let kakoSacuvano = null;
            // 1) Supabase Storage + tabela proizvod_dokumenti
            try {
                const ext = (naziv.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
                const path = "proizvod_" + (selected.db_id || selected.id) + "/" + tip + "_" + Date.now() + "." + ext;
                const up = await supabase.storage.from(DOK_BUCKET).upload(path, file, { upsert: true, contentType: mime || undefined });
                if (up.error) throw up.error;
                const pub = supabase.storage.from(DOK_BUCKET).getPublicUrl(path);
                const url = pub?.data?.publicUrl;
                if (!url) throw new Error("Nema javnog URL-a (bucket mora biti public).");
                const ins = await supabase.from("proizvod_dokumenti").insert([{
                    proizvod_id: selected.db_id || null,
                    proizvod_naziv: selected.naziv || "",
                    tip, naziv, url, storage_path: path, mime,
                    velicina: file.size || null,
                    korisnik: trenutniKorisnik,
                    created_at: new Date().toISOString()
                }]).select();
                if (ins.error) throw ins.error;
                kakoSacuvano = "db";
            } catch (eStore) {
                // 2) Fallback: base64 u localStorage (radi odmah, lokalno)
                const dataUrl = await fileToDataURL(file);
                const local = readLocalDocs(selected);
                local.unshift({ id: "loc-" + Date.now(), tip, naziv, url: dataUrl, mime, created_at: new Date().toISOString(), korisnik: trenutniKorisnik });
                const ok = writeLocalDocs(selected, local);
                if (!ok) throw new Error("Lokalno čuvanje nije uspelo (fajl prevelik za pregledač).");
                kakoSacuvano = "local";
            }
            await loadDocs(selected);
            zabeleziIstoriju(selected, "Dodat dokument", (DOK_TIPOVI.find(x => x.k === tip)?.l || tip) + ": " + naziv);
            msg && msg(kakoSacuvano === "db" ? "Dokument sačuvan na server." : "Dokument sačuvan lokalno (uključi Supabase Storage za deljenje među korisnicima).", "ok");
        } catch (e) {
            msg && msg("Greška pri čuvanju dokumenta: " + (e?.message || e), "err");
        } finally { setUploadingTip(""); }
    }

    async function handleDeleteDoc(doc) {
        if (!doc || !selected) return;
        if (typeof window !== "undefined" && !window.confirm("Obrisati dokument \"" + (doc.naziv || "") + "\"?")) return;
        try {
            if (doc.source === "db") {
                if (doc.storage_path) { try { await supabase.storage.from(DOK_BUCKET).remove([doc.storage_path]); } catch (e) { } }
                if (doc.id != null) { await supabase.from("proizvod_dokumenti").delete().eq("id", doc.id); }
            } else {
                const local = readLocalDocs(selected).filter(d => d.id !== doc.id);
                writeLocalDocs(selected, local);
            }
            await loadDocs(selected);
            msg && msg("Dokument obrisan.", "ok");
        } catch (e) { msg && msg("Brisanje nije uspelo: " + (e?.message || e), "err"); }
    }

    // ---- STATUS proizvoda (Aktivan / Razvoj / Stop) ----
    async function promeniStatus(noviStatus) {
        if (!selected) return;
        if (!selected.db_id) { msg && msg("Proizvod nema ID u bazi — status se ne može sačuvati.", "err"); return; }
        setSavingStatus(true);
        try {
            const { error } = await supabase.from("proizvodi").update({ status: noviStatus }).eq("id", selected.db_id);
            if (error) throw error;
            if (setDb) setDb(prev => ({ ...prev, proizvodi: (prev?.proizvodi || []).map(p => p.id === selected.db_id ? { ...p, status: noviStatus } : p) }));
            zabeleziIstoriju(selected, "Promenjen status", noviStatus);
            msg && msg("Status promenjen u: " + noviStatus, "ok");
        } catch (e) {
            const m = String(e?.message || e);
            if (/status_check|check constraint/i.test(m)) {
                msg && msg("Baza ne dozvoljava ovaj status. Pokreni SQL: ukloni/proširi constraint „proizvodi_status_check\" (vrednosti: aktivan, razvoj, stop).", "err");
            } else { msg && msg("Status nije promenjen: " + m, "err"); }
        }
        finally { setSavingStatus(false); }
    }

    const stats = {
        total: products.length,
        folija: products.filter(p => p.tip === "folija").length,
        kesa: products.filter(p => p.tip === "kesa").length,
        spulna: products.filter(p => p.tip === "spulna").length
    };

    function openTemplateFromProduct(product = selected) {
        if (!product) return;
        const template = buildTemplateFromProduct(product);
        localStorage.setItem("maropack_pending_template_edit", JSON.stringify({ product_id: product.id, template }));
        msg && msg("Template je pripremljen za otvaranje iz Baze proizvoda");
        zabeleziIstoriju(product, "Otvoren template", product.naziv);
        setPage && setPage("template_engine");
    }

    async function createCalculationFromProduct(product = selected) {
        if (!product) return null;
        const kal = makeCalculationRecordFromProduct(product);
        try {
            const { data, error } = await supabase.from("kalkulacije").insert([{
                tip: kal.tip,
                naziv: kal.naziv,
                klijent: kal.klijent || kal.kupac || null,
                data: kal.data,
                materijali_struktura: kal.materijali || [],
                kolicina: Number(kal.kolicina) || null,
                osnovna_cena: 0,
                konacna_cena: 0,
                verzija: 1,
                status: "draft_product_master",
                product_master_id: kal.product_master_id || null,
                template_id: kal.template_id || null,
                template_version: kal.template_version || null,
                operacije: kal.operacije || []
            }]).select();
            if (error) throw error;
            const dbId = data?.[0]?.id;
            const nextKal = { ...kal, id: dbId || kal.id, kalkulacija_id: dbId || null, db_id: dbId || null };
            localStorage.setItem("maropack_pending_template_calculation", JSON.stringify(nextKal));
            localStorage.setItem("editKalkulacija", JSON.stringify(nextKal));
            if (setDb && data?.[0]) setDb(prev => ({ ...prev, kalkulacije: [data[0], ...(prev?.kalkulacije || [])] }));
            const targetPage = kal.tip === "kesa" ? "kalk_kesa" : kal.tip === "spulna" ? "kalk_spulna" : "kalk_folija";
            msg && msg("Kalkulacija je kreirana iz sačuvanog template-a i sačuvana u bazu");
            zabeleziIstoriju(product, "Kreirana kalkulacija", data && data.id ? ("Kalkulacija #" + data.id) : "");
            setPage && setPage(targetPage);
            return nextKal;
        } catch (e) {
            msg && msg("Kalkulacija nije kreirana: " + (e?.message || e), "err");
            return null;
        }
    }

    async function createOfferFromProduct(product = selected, options = {}) {
        if (!product) return null;
        const template = buildTemplateFromProduct(product);
        const tip = normalizeTip(product.tip || template.type);
        const section = template[tip] || {};
        const layers = section.layers || template.folija?.layers || template.kesa?.layers || template.spulna?.layers || [];
        const broj = "PON-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 9000 + 1000);
        const kol = Number(template.porucenaKolicina || section.kolicina || section.maxMetara || section.rezanje?.duzinaRolne || product.raw?.met || product.raw?.nal || 0) || null;
        try {
            const { data, error } = await supabase.from("ponude").insert([{
                broj,
                datum: new Date().toLocaleDateString("sr-RS"),
                vaz: new Date(Date.now() + 30 * 86400000).toLocaleDateString("sr-RS"),
                kupac: product.kupac || "—",
                naziv: product.naziv || "Proizvod",
                proizvod: product.naziv || "Proizvod",
                tip,
                kol,
                kolicina: kol,
                mats: layers,
                struktura: layers,
                status: options.accepted ? "prihvaceno" : "draft_product_master",
                nap: "Kreirano iz Product Master template-a",
                product_master_id: product.product_master_id || template.product_master_id || null,
                template_id: product.template_id || template.template_id || null,
                template_version: product.verzija || template.template_version || "V1",
                res: { template, operacije: product.operacije || inferOperations(template, tip) }
            }]).select();
            if (error) throw error;
            if (setDb && data?.[0]) setDb(prev => ({ ...prev, ponude: [data[0], ...(prev?.ponude || [])] }));
            msg && msg(options.accepted ? "Ponuda je kreirana i označena kao prihvaćena" : "Ponuda je kreirana iz sačuvanog template-a");
            if (!options.silent) zabeleziIstoriju(product, options.accepted ? "Kreirana ponuda (prihvaćena)" : "Kreirana ponuda", data && data.id ? ("Ponuda #" + data.id) : "");
            if (!options.silent) setPage && setPage("ponude");
            return data?.[0] || null;
        } catch (e) {
            msg && msg("Ponuda nije kreirana: " + (e?.message || e), "err");
            return null;
        }
    }

    async function createOrdersFromProduct(product = selected) {
        if (!product) return;
        const ponuda = await createOfferFromProduct(product, { accepted: true, silent: true });
        if (!ponuda?.id) return;
        try {
            const { error } = await supabase.rpc("kreiraj_naloge_iz_ponude", { p_ponuda_id: ponuda.id });
            if (error) throw error;
            msg && msg("Glavni nalog i A4 operativni nalozi su kreirani iz template-a");
            zabeleziIstoriju(product, "Kreirani nalozi", "Glavni + A4 operativni nalozi");
            setPage && setPage("master_nalozi");
        } catch (e) {
            msg && msg("Nalozi nisu kreirani. Proveri SQL funkciju kreiraj_naloge_iz_ponude: " + (e?.message || e), "err");
        }
    }

    const tabs = [
        ["osnovno", "Osnovno"], ["materijali", "Materijali"], ["stampa", "Štampa"], ["perforacija", "Perforacija"], ["final", "Finalna rolna"], ["dok", "Dokumentacija"], ["istorija", "Istorija"]
    ];

    return <div style={{ padding: 22, background: "linear-gradient(180deg,#f8fafc 0%,#eef6ff 100%)", minHeight: "100vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
            <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}><span style={{ fontSize: 28 }}>📦</span><h1 style={{ margin: 0, fontSize: 26, color: "#0f172a", fontWeight: 950 }}>Baza proizvoda PRO</h1></div>
                <div style={{ color: "#64748b", fontSize: 13, fontWeight: 750 }}>Product Master: template-i, materijali, KPDF, perforacije, finalne rolne i istorija proizvoda.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button onClick={() => setPage && setPage("baza_proizvoda_pro_old")} style={btnStyle("#fff", "#334155", "#cbd5e1")}>Otvori stari pregled</button>
                <button onClick={() => { msg && msg("Novi proizvod se trenutno dodaje kroz Template Engine."); setPage && setPage("template_engine"); }} style={btnStyle(BLUE, "#fff", BLUE)}>+ Novi template</button>
            </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 16 }}>
            <Kpi label="Ukupno proizvoda" value={stats.total} color={BLUE} />
            <Kpi label="Folije" value={stats.folija} color={BLUE} />
            <Kpi label="Kese" value={stats.kesa} color={ORANGE} />
            <Kpi label="Špulne" value={stats.spulna} color={PURPLE} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "390px minmax(0,1fr)", gap: 16, alignItems: "start" }}>
            <Card style={{ overflow: "hidden" }}>
                <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", background: "linear-gradient(135deg,#ffffff,#f8fafc)" }}>
                    <div style={{ fontSize: 15, fontWeight: 950, marginBottom: 10, color: "#0f172a" }}>Lista proizvoda</div>
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Pretraga: kupac, naziv, šifra..." style={inputStyle()} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                        <select value={tipFilter} onChange={e => setTipFilter(e.target.value)} style={inputStyle()}><option value="sve">Svi tipovi</option><option value="folija">Folije</option><option value="kesa">Kese</option><option value="spulna">Špulne</option></select>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={inputStyle()}><option value="sve">Svi statusi</option><option value="aktivan">Aktivan</option><option value="razvoj">Razvoj</option><option value="stop">Stop</option></select>
                    </div>
                </div>
                <div style={{ maxHeight: "calc(100vh - 300px)", overflow: "auto" }}>
                    {filtered.map((p) => <button key={p.id} onClick={() => { setSelectedId(p.id); setTab("osnovno"); }} style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #eef2f7", background: selected?.id === p.id ? "#f7f5ff" : "#fff", padding: 0, cursor: "pointer", display: "flex", gap: 0 }}>
                        <div style={{ width: 4, flexShrink: 0, background: tipColor(p.tip), alignSelf: "stretch" }} />
                        <div style={{ padding: "12px 14px", flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800, display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                                    <span>🏢</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.kupac}</span>
                                </div>
                                <Badge color={tipColor(p.tip)}>{p.tip}</Badge>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 950, color: "#0f172a", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.naziv}</div>
                            <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
                                <span style={{ fontSize: 9, fontWeight: 900, padding: "3px 9px", borderRadius: 6, background: statusColor(p.status) + "1f", color: statusColor(p.status), textTransform: "uppercase" }}>{p.status}</span>
                                <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 6, background: "#f1f5f9", color: "#64748b" }}>{p.verzija}</span>
                                {p.sifra && p.sifra !== "—" && <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 6, background: "#f1f5f9", color: "#64748b" }}>{p.sifra}</span>}
                            </div>
                        </div>
                    </button>)}
                </div>
            </Card>

            <Card style={{ overflow: "hidden" }}>
                {selected ? <>
                    <div style={{ position: "relative", padding: "22px 24px", overflow: "hidden", background: `linear-gradient(120deg, ${tipColor(selected.tip)}, ${tipColor(selected.tip)}cc 60%, #a21caf)`, color: "#fff" }}>
                        <div style={{ position: "absolute", right: -10, top: -30, fontSize: 150, opacity: .10, transform: "rotate(-15deg)", pointerEvents: "none" }}>{selected.tip === "folija" ? "📦" : selected.tip === "kesa" ? "🛍️" : "🎞️"}</div>
                        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 25, fontWeight: 950, letterSpacing: "-.3px", textShadow: "0 2px 8px rgba(0,0,0,.15)" }}>{selected.naziv}</h2>
                                <div style={{ marginTop: 5, opacity: .9, fontWeight: 700, fontSize: 13 }}>🏢 {selected.kupac} · 🏷️ Šifra: {selected.sifra || "—"}</div>
                                <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
                                    {[["🎞️", selected.tip], ["📌", selected.verzija], ["📅", selected.datum]].map(([ik, v], i) => v ? <span key={i} style={{ background: "rgba(255,255,255,.18)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 999, padding: "5px 13px", fontSize: 10.5, fontWeight: 900 }}>{ik} {String(v).toUpperCase()}</span> : null)}
                                    {(() => {
                                        const sv = statusKanon(selected.status);
                                        const col = statusBoja(sv);
                                        return <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#fff", borderRadius: 999, padding: "4px 8px 4px 12px", boxShadow: "0 2px 8px rgba(0,0,0,.18)" }}>
                                            <span style={{ width: 9, height: 9, borderRadius: "50%", background: col }} />
                                            <span style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: .3 }}>Status</span>
                                            <select value={sv} onChange={e => promeniStatus(e.target.value)} disabled={savingStatus}
                                                style={{ border: "none", background: "transparent", color: col, fontSize: 11.5, fontWeight: 900, cursor: savingStatus ? "wait" : "pointer", outline: "none", textTransform: "uppercase" }}>
                                                {STATUS_OPCIJE.map(s => <option key={s.v} value={s.v} style={{ color: "#0f172a" }}>{s.l}</option>)}
                                            </select>
                                        </span>;
                                    })()}
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                <button onClick={() => openTemplateFromProduct(selected)} style={{ border: "none", borderRadius: 11, padding: "10px 15px", fontWeight: 900, fontSize: 12, cursor: "pointer", background: "rgba(255,255,255,.9)", color: "#334155", boxShadow: "0 6px 16px rgba(0,0,0,.18)" }}>Otvori template</button>
                                <button onClick={() => createCalculationFromProduct(selected)} style={{ border: "none", borderRadius: 11, padding: "10px 15px", fontWeight: 900, fontSize: 12, cursor: "pointer", background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", boxShadow: "0 6px 16px rgba(22,163,74,.35)" }}>🧮 Kalkulacija</button>
                                <button onClick={() => createOfferFromProduct(selected)} style={{ border: "none", borderRadius: 11, padding: "10px 15px", fontWeight: 900, fontSize: 12, cursor: "pointer", background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff", boxShadow: "0 6px 16px rgba(37,99,235,.35)" }}>📄 Ponuda</button>
                                <button onClick={() => createOrdersFromProduct(selected)} style={{ border: "none", borderRadius: 11, padding: "10px 15px", fontWeight: 900, fontSize: 12, cursor: "pointer", background: "#fff", color: "#7c3aed", boxShadow: "0 6px 16px rgba(0,0,0,.18)" }}>🏭 Nalog</button>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, padding: "12px 16px", borderBottom: "1px solid #e2e8f0", overflowX: "auto", background: "#fff" }}>
                        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ border: tab === k ? `2px solid ${BLUE}` : "1px solid #e2e8f0", background: tab === k ? "#eff6ff" : "#fff", color: tab === k ? BLUE : "#334155", borderRadius: 999, padding: "9px 13px", fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>)}
                    </div>
                    <div style={{ padding: 18 }}>
                        {tab === "osnovno" && <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 16 }}>
                            <Card style={{ boxShadow: "none", padding: 16 }}><SectionTitle title="Osnovni podaci" /><InfoRow label="Naziv" value={selected.naziv} /><InfoRow label="Kupac" value={selected.kupac} /><InfoRow label="Tip" value={selected.tip} /><InfoRow label="Šifra" value={selected.sifra} /><InfoRow label="Verzija" value={selected.verzija} /><InfoRow label="Datum" value={selected.datum} /></Card>
                            <Card style={{ boxShadow: "none", padding: 16, background: "#f8fafc" }}><SectionTitle title="Brze akcije" /><ActionRow text="Otvori template" onClick={() => openTemplateFromProduct(selected)} /><ActionRow text="Kreiraj kalkulaciju iz proizvoda" onClick={() => createCalculationFromProduct(selected)} /><ActionRow text="Kreiraj ponudu iz proizvoda" onClick={() => createOfferFromProduct(selected)} /><ActionRow text="Kreiraj naloge iz proizvoda" onClick={() => createOrdersFromProduct(selected)} /><ActionRow text="Dodaj KPDF / PDF dokument" onClick={() => setTab("dok")} /><ActionRow text="Pogledaj istoriju izmena" onClick={() => setTab("istorija")} /></Card>
                        </div>}
                        {tab === "materijali" && <><SectionTitle title="Materijali proizvoda" note="Ista Material PRO tabela kao u kalkulacijama i template-ima. Bez Žuta, ostaju samo Š i L." /><MaterialTable rows={selected.materijali} /></>}
                        {tab === "stampa" && <Card style={{ boxShadow: "none", padding: 16 }}><SectionTitle title="Štampa / lak / kliše" /><InfoRow label="Broj boja" value={selected.stampa.boje} /><InfoRow label="Kliše" value={selected.stampa.klise} /><InfoRow label="Lak" value={selected.stampa.lak} /><InfoRow label="Napomena" value={selected.stampa.napomena} /></Card>}
                        {tab === "perforacija" && <Card style={{ boxShadow: "none", padding: 16 }}>
                            <SectionTitle title="KPDF fajl / crtež perforacije" note="Učitaj PDF ili sliku — otvaranje u A4 prikazu, štampa i preuzimanje (isto kao u Dokumentaciji)." />
                            <div style={{ maxWidth: 440 }}>
                                <DocCardPro tip={DOK_TIPOVI[0]} list={(docs || []).filter(d => d.tip === "kpdf")} loading={docsLoad} uploading={uploadingTip === "kpdf"} onUpload={handleUpload} onOpen={setViewDoc} onDelete={handleDeleteDoc} />
                            </div>
                        </Card>}
                        {tab === "final" && <Card style={{ boxShadow: "none", padding: 16 }}><SectionTitle title="Finalna rolna / smer odmotavanja" /><InfoRow label="Smer" value={selected.finalnaRolna.smer} /><InfoRow label="Hilzna" value={selected.finalnaRolna.hilzna} /><InfoRow label="Prečnik" value={selected.finalnaRolna.precnik} /><InfoRow label="Dužina" value={selected.finalnaRolna.duzina} /></Card>}
                        {tab === "dok" && <>
                            <SectionTitle title="Dokumentacija" note="Učitaj KPDF, tehnički list i slike/crteže (PDF ili slika). Otvaranje je u A4 prikazu, sa štampom i preuzimanjem." />
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
                                {DOK_TIPOVI.map(t => (
                                    <DocCardPro key={t.k} tip={t} list={(docs || []).filter(d => d.tip === t.k)} loading={docsLoad} uploading={uploadingTip === t.k} onUpload={handleUpload} onOpen={setViewDoc} onDelete={handleDeleteDoc} />
                                ))}
                            </div>
                        </>}
                        {tab === "istorija" && <Card style={{ boxShadow: "none", padding: 16 }}>
                            <SectionTitle title="Istorija izmena" note="Beleže se kreiranja kalkulacija, ponuda, naloga i otvaranja template-a." />
                            {istorijaLoad ? <div style={{ color: "#94a3b8", fontWeight: 700, padding: "10px 2px" }}>Učitavam istoriju…</div>
                                : istorija.length === 0 ? <div style={{ color: "#94a3b8", fontWeight: 700, padding: "10px 2px" }}>Nema zabeleženih događaja za ovaj proizvod.</div>
                                    : <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                                        {istorija.map((h, i) => {
                                            const ik = /kalkulac/i.test(h.akcija) ? "🧮" : /ponud/i.test(h.akcija) ? "📄" : /nalog/i.test(h.akcija) ? "🏭" : /template/i.test(h.akcija) ? "📐" : "•";
                                            const boja = /kalkulac/i.test(h.akcija) ? "#16a34a" : /ponud/i.test(h.akcija) ? "#2563eb" : /nalog/i.test(h.akcija) ? "#9333ea" : "#64748b";
                                            const kada = h.created_at ? new Date(h.created_at).toLocaleString("sr-RS") : "";
                                            return <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "11px 13px", border: "1px solid #eef2f7", borderRadius: 12, background: "#fff" }}>
                                                <div style={{ width: 34, height: 34, borderRadius: 10, background: boja + "18", color: boja, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{ik}</div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 900, fontSize: 13 }}>{h.akcija}</div>
                                                    {h.detalj && <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginTop: 1 }}>{h.detalj}</div>}
                                                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, marginTop: 4 }}>🕘 {kada}{h.korisnik ? " · " + h.korisnik : ""}</div>
                                                </div>
                                            </div>;
                                        })}
                                    </div>}
                        </Card>}
                    </div>
                </> : <div style={{ padding: 40, color: "#64748b", fontWeight: 800 }}>Nema proizvoda za prikaz.</div>}
            </Card>
        </div>

        {viewDoc && <DokViewerA4 doc={viewDoc} onClose={() => setViewDoc(null)} />}
    </div>;
}

function Kpi({ label, value, color }) {
    return <Card style={{ padding: 16, borderLeft: `5px solid ${color}` }}><div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", fontWeight: 900 }}>{label}</div><div style={{ color, fontSize: 28, fontWeight: 950, marginTop: 4 }}>{value}</div></Card>;
}
function SectionTitle({ title, note }) { return <div style={{ marginBottom: 12 }}><div style={{ fontSize: 15, fontWeight: 950, color: "#0f172a" }}>{title}</div>{note && <div style={{ fontSize: 12, color: "#64748b", fontWeight: 750, marginTop: 3 }}>{note}</div>}</div>; }
function ActionRow({ text, onClick }) { return <div onClick={onClick} style={{ padding: "10px 0", borderBottom: "1px solid #e2e8f0", color: "#334155", fontWeight: 850, fontSize: 13, cursor: onClick ? "pointer" : "default" }}>→ {text}</div>; }

// --- Dokumentacija: kartica po tipu (KPDF / Tehnički list / Slike-crteži) ---
function DocCardPro({ tip, list, loading, uploading, onUpload, onOpen, onDelete }) {
    const inputRef = React.useRef(null);
    return <Card style={{ boxShadow: "none", padding: 16, background: "#f8fafc", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>{tip.icon}</span>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{tip.l}</div>
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 900, color: (list || []).length ? GREEN : "#94a3b8" }}>{(list || []).length ? (list.length + " fajl" + (list.length > 1 ? "a" : "")) : "—"}</span>
        </div>
        <input ref={inputRef} type="file" accept={tip.accept} style={{ display: "none" }} onChange={e => { const f = e.target.files && e.target.files[0]; if (f) onUpload(tip.k, f); e.target.value = ""; }} />
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7, minHeight: 44 }}>
            {loading ? <div style={{ color: "#94a3b8", fontWeight: 700, fontSize: 12 }}>Učitavam…</div>
                : (list || []).length === 0 ? <div style={{ color: "#94a3b8", fontWeight: 700, fontSize: 12 }}>Nije dodat.</div>
                    : list.map(d => <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px" }}>
                        <span style={{ fontSize: 15 }}>{isPdfDoc(d) ? "📕" : "🖼️"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.naziv}</div>
                            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>{d.source === "local" ? "lokalno" : "server"}{d.created_at ? " · " + new Date(d.created_at).toLocaleDateString("sr-RS") : ""}</div>
                        </div>
                        <button title="Otvori u A4 prikazu" onClick={() => onOpen(d)} style={miniBtn(BLUE)}>Otvori</button>
                        <button title="Obriši dokument" onClick={() => onDelete(d)} style={miniBtn(RED)}>✕</button>
                    </div>)}
        </div>
        <button disabled={uploading} onClick={() => inputRef.current && inputRef.current.click()} style={{ ...btnStyle(uploading ? "#eef2f7" : "#fff", uploading ? "#94a3b8" : "#334155", "#cbd5e1"), marginTop: 14 }}>{uploading ? "Učitavam…" : "➕ Dodaj (PDF / slika)"}</button>
    </Card>;
}
function miniBtn(color) { return { border: "1px solid " + color + "55", background: color + "12", color, borderRadius: 8, padding: "6px 9px", fontWeight: 900, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }; }

// data: URL -> blob: URL. PDF u iframe-u kao data: URL mnogi pregledači prikažu kao
// sićušnu stranu u tamnom okviru (ili ga uopšte ne otvore). blob: URL se prikaže
// normalno i poštuje #view/#zoom parametre.
function dataUrlToBlobUrl(dataUrl) {
    try {
        const parts = String(dataUrl).split(",");
        const head = parts[0] || "";
        const b64 = parts[1] || "";
        const mime = (head.match(/data:([^;]+)/) || [, "application/pdf"])[1];
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return URL.createObjectURL(new Blob([arr], { type: mime }));
    } catch (e) { return dataUrl; }
}

// --- A4 prikaz dokumenta (modal) sa štampom i preuzimanjem ---
function DokViewerA4({ doc, onClose }) {
    const pdf = isPdfDoc(doc);
    // PDF: data: -> blob: (da se otvori normalno, ne sićušno u tamnom okviru)
    const src = useMemo(() => {
        if (!doc || !doc.url) return "";
        if (pdf && String(doc.url).startsWith("data:")) return dataUrlToBlobUrl(doc.url);
        return doc.url;
    }, [doc, pdf]);
    useEffect(() => () => { if (src && String(src).startsWith("blob:")) { try { URL.revokeObjectURL(src); } catch (e) { } } }, [src]);
    // #view=FitH + zoom=page-width => PDF se uklopi po ŠIRINI papira (ne sitna strana)
    const pdfSrc = pdf && src ? (src + "#toolbar=1&navpanes=0&statusbar=0&view=FitH&zoom=page-width") : src;
    return <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.82)", zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", padding: 14, overflow: "auto" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 960, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ color: "#fff", fontWeight: 900, fontSize: 15, flex: 1, minWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.naziv}</div>
                <button onClick={() => window.open(src, "_blank")} style={viewerBtn("rgba(255,255,255,.2)", "#fff")}>↗️ Novi tab</button>
                <button onClick={() => printDoc(doc)} style={viewerBtn("#fff", "#0f172a")}>🖨️ Štampaj</button>
                <button onClick={() => downloadDoc(doc)} style={viewerBtn("#2563eb", "#fff")}>⬇️ Preuzmi</button>
                <button onClick={onClose} style={viewerBtn("rgba(255,255,255,.2)", "#fff")}>✕ Zatvori</button>
            </div>
            <div style={{ width: "100%", background: "#fff", borderRadius: 6, boxShadow: "0 20px 60px rgba(0,0,0,.4)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", aspectRatio: pdf ? undefined : "210 / 297" }}>
                {pdf
                    ? <iframe title={doc.naziv} src={pdfSrc} style={{ border: 0, width: "100%", height: "90vh", display: "block", background: "#525659" }} />
                    : <img src={src} alt={doc.naziv} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#fff" }} />}
            </div>
            <div style={{ color: "rgba(255,255,255,.7)", fontSize: 11, marginTop: 10, fontWeight: 700 }}>A4 prikaz · ako je prazno/sitno, otvori „↗️ Novi tab" · klikni van papira za zatvaranje</div>
        </div>
    </div>;
}
function viewerBtn(bg, color) { return { border: "none", borderRadius: 10, padding: "9px 13px", fontWeight: 900, fontSize: 12, cursor: "pointer", background: bg, color }; }

function DocCard({ title, value }) { return <Card style={{ boxShadow: "none", padding: 18, background: "#f8fafc" }}><div style={{ fontSize: 12, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{title}</div><div style={{ marginTop: 8, fontSize: 18, color: "#0f172a", fontWeight: 950 }}>{value}</div><button style={{ ...btnStyle("#fff", "#334155", "#cbd5e1"), marginTop: 14 }}>Dodaj / otvori</button></Card>; }
function inputStyle() { return { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 12, padding: "10px 12px", fontSize: 13, fontWeight: 750, background: "#fff", color: "#0f172a" }; }
function btnStyle(bg, color, border) { return { border: `1px solid ${border}`, background: bg, color, borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer", boxShadow: bg === "#fff" ? "none" : "0 10px 20px rgba(37,99,235,.18)" }; }
