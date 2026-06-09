import React from "react";
import { enrichNalogForPrint, normalizeLayers, safeJson } from "./utils/nalogDataLink";

const QR = (text, size = 84) =>
    "https://api.qrserver.com/v1/create-qr-code/?size=" + size + "x" + size + "&data=" + encodeURIComponent(text || "MAROPACK");

function val(v, fallback = "—") {
    return v === undefined || v === null || v === "" ? fallback : v;
}

function fmt(n, suf = "") {
    const x = Number(n || 0);
    if (!Number.isFinite(x) || x === 0) return val(n, "—");
    return x.toLocaleString("sr-RS", { maximumFractionDigits: 2 }) + suf;
}

function pick(obj, keys, fallback = "") {
    for (const k of keys) {
        if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
    }
    return fallback;
}

function normTip(t) {
    const x = String(t || "folija").toLowerCase();
    if (x.includes("kes")) return "kesa";
    if (x.includes("spul") || x.includes("špul")) return "spulna";
    return "folija";
}

function normNalog(t, naziv, activeTab) {
    const x = String(activeTab || t || naziv || "").toLowerCase();
    if (x.includes("mater")) return "materijal";
    if (x.includes("štamp") || x.includes("stamp")) return "stampa";
    if (x.includes("kaš") || x.includes("kas")) return "kasiranje";
    if (x.includes("rez") || x.includes("perf")) return "perforacija_rezanje";
    if (x.includes("format")) return "formatiranje";
    if (x.includes("kes")) return "kesa";
    if (x.includes("spul") || x.includes("špul")) return "spulna";
    return "materijal";
}

function getData(nalog) {
    const linked = enrichNalogForPrint(nalog || {});
    const od = safeJson(linked.order_data, {}) || {};
    const tpl = safeJson(linked.product_template || linked.template || od.template, {}) || {};
    const templateData = safeJson(linked.templateData || tpl.data || od.templateData, {}) || {};
    const t = templateData && Object.keys(templateData).length ? templateData : tpl;
    const folija = linked.folija || od.folija || t.folija || {};
    const kesa = linked.kesa || od.kesa || t.kesa || {};
    const spulna = linked.spulna || od.spulna || t.spulna || t.spulne || {};
    const tehnicki = linked.tehnicki || od.tehnicki || t.tehnicki || {};
    const pdf = linked.pdf || od.pdf || t.pdf || {};
    const proizvod = od.proizvod || {};
    return { linked, od, t, folija, kesa, spulna, tehnicki, pdf, proizvod };
}

function getMaterijali(nalog) {
    const { od, folija, t } = getData(nalog);
    const normalized = normalizeLayers(nalog, nalog.tip_proizvoda || nalog.tip);
    const arr = (Array.isArray(od.materijali) && od.materijali.length ? od.materijali : normalized) || [];
    const num = (v) => Number(String(v ?? 0).toString().replace(",", ".")) || 0;
    const kolM = num(nalog.metraza || nalog.kol || nalog.kolicina || t.porucenaKolicina || od.kolicina);
    const skart = num(folija.skart ?? nalog.skart ?? t.skart);
    const potrebnaM = kolM ? Math.round(kolM * (1 + (skart || 0) / 100)) : 0;
    if (arr.length) {
        return arr.slice(0, 5).map((m, i) => {
            const sirina = m.sirina || m.sirina_mm || nalog.sirina || nalog.sir;
            const gm2 = num(m.gm2 ?? m.gsm ?? m.tezina);
            const pot = num(m.potrebno || m.metraza || m.m) || potrebnaM;
            const kgCalc = (gm2 && sirina && pot) ? +(((gm2 * (num(sirina) / 1000) * pot) / 1000)).toFixed(1) : 0;
            return {
                sloj: m.sloj || String.fromCharCode(65 + i),
                materijal: m.naziv || m.material || m.materijal || [m.vrsta, m.oznaka || m.oznaka_materijala, m.debljina ? `${m.debljina}µ` : ""].filter(Boolean).join(" ") || "Materijal",
                debljina: m.debljina ?? m.deb,
                gm2,
                sirina,
                potrebno: pot || (nalog.metraza || nalog.kol),
                kg: num(m.kg || m.potrebnoKg || m.tkg_nalog) || kgCalc || nalog.kg,
                stampa: !!(m.stampa || m.stamp || m["Š"]),
                lot: m.lot || m.LOT || "",
                status: m.status || "za rezervaciju",
            };
        });
    }
    return [{
        sloj: "A",
        materijal: nalog.materijal || nalog.sastav || nalog.prod || "Materijal",
        sirina: nalog.sirina || nalog.sir,
        potrebno: potrebnaM || nalog.metraza || nalog.kol,
        kg: nalog.kg,
        lot: nalog.lot,
        status: "za rezervaciju",
    }];
}

function getSpec(nalog) {
    const { folija, t, od } = getData(nalog);
    const layers = normalizeLayers(nalog, nalog.tip_proizvoda || nalog.tip) || [];
    const num = (v) => Number(String(v ?? 0).toString().replace(",", ".")) || 0;
    const ukDeb = layers.reduce((s, l) => s + num(l.debljina ?? l.deb), 0);
    const ukGm2 = layers.reduce((s, l) => s + num(l.gm2 ?? l.gsm ?? l.tezina), 0);
    const stampaSlojevi = layers.map((l, i) => (l.stampa || l.stamp || l["Š"]) ? (l.oznaka || l.oznaka_materijala || l.vrsta || l.tip || String.fromCharCode(65 + i)) : null).filter(Boolean);
    const sirina = folija.rezanje?.sirinaMaterijala || nalog.sirina || nalog.sir || t.idealnaSirinaMaterijala || t.dimenzijaSirina || layers[0]?.sirina;
    const duzina = t.dimenzijaDuzina || folija.finalRoll?.duzina || nalog.duzina;
    const kolicina = num(nalog.metraza || nalog.kol || nalog.kolicina || t.porucenaKolicina || od.kolicina);
    const skart = num(folija.skart ?? nalog.skart ?? t.skart);
    return { layers, ukDeb, ukGm2, stampaSlojevi, sirina, duzina, kolicina, skart, brSlojeva: layers.length };
}

function SpecSummary({ nalog }) {
    const s = getSpec(nalog);
    const dim = [s.sirina ? fmt(s.sirina) : null, s.duzina ? fmt(s.duzina) : null].filter(Boolean).join(" × ");
    return (
        <div className="a4-meta" style={{ gridTemplateColumns: "repeat(6,1fr)" }}>
            <Field label="Dimenzije (mm)" value={dim || "—"} />
            <Field label="Količina" value={s.kolicina ? fmt(s.kolicina, " m") : "—"} />
            <Field label="Škart" value={s.skart ? `${s.skart} %` : "—"} />
            <Field label="Ukupna debljina" value={s.ukDeb ? `${fmt(s.ukDeb)} µ` : "—"} />
            <Field label="Ukupno g/m²" value={s.ukGm2 ? fmt(s.ukGm2) : "—"} />
            <Field label="Slojeva / štampa" value={`${s.brSlojeva}${s.stampaSlojevi.length ? ` · ${s.stampaSlojevi.join(", ")}` : " · bez štampe"}`} />
        </div>
    );
}

function getRolne(nalog) {
    const arr = nalog.rezervisane_rolne || nalog.rezervisaneRolne || nalog.rolne || nalog.selectedRolls || [];
    return (Array.isArray(arr) ? arr : []).slice(0, 6).map((r) => ({
        qr: r.qr || r.qr_kod || r.id || r.rola || "—",
        lot: r.lot || r.LOT || "—",
        lokacija: r.lokacija || r.location || "—",
        sirina: r.sirina || r.width || "—",
        m: r.duzina || r.metraza || r.m || "—",
        kg: r.kg || "—",
    }));
}

function Field({ label, value, strong = false }) {
    return (
        <div className="a4-field">
            <div className="a4-label">{label}</div>
            <div className={strong ? "a4-value strong" : "a4-value"}>{val(value)}</div>
        </div>
    );
}

function Section({ title, children, compact = false }) {
    return (
        <section className={compact ? "a4-section compact" : "a4-section"}>
            <div className="a4-section-title">{title}</div>
            <div className="a4-section-body">{children}</div>
        </section>
    );
}

function MiniTable({ columns, rows }) {
    return (
        <table className="a4-table">
            <thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
                {(rows && rows.length ? rows : [columns.map(() => "—")]).map((r, i) => (
                    <tr key={i}>{columns.map((c, j) => <td key={c + j}>{r[j] ?? "—"}</td>)}</tr>
                ))}
            </tbody>
        </table>
    );
}

function Header({ nalog, title, icon }) {
    const { proizvod } = getData(nalog);
    const broj = nalog.ponBr || nalog.broj_naloga || nalog.broj || "MP-2026-XXXX";
    const kupac = nalog.kupac || proizvod.kupac;
    const prod = nalog.prod || nalog.proizvod || proizvod.naziv;
    const qrData = JSON.stringify({ nalog: broj, tip: title, kupac, proizvod: prod });
    return (
        <header className="a4-header">
            <div>
                <div className="a4-company">MAROPACK D.O.O. — RADNI NALOG</div>
                <div className="a4-title">{icon} {title}</div>
                <div className="a4-header-grid">
                    <Field label="Broj naloga" value={broj} strong />
                    <Field label="Kupac" value={kupac} strong />
                    <Field label="Proizvod" value={prod} strong />
                    <Field label="Tip" value={String(nalog.tip_proizvoda || nalog.tip || "").toUpperCase()} />
                </div>
            </div>
            <div className="a4-qr"><img src={QR(qrData)} alt="QR naloga" /><span>QR NALOGA</span></div>
        </header>
    );
}

function ProcessBar({ tip, active }) {
    const items = tip === "kesa"
        ? [["materijal", "Materijal"], ["kasiranje", "Kaširanje"], ["kesa", "Kesa"]]
        : tip === "spulna"
            ? [["materijal", "Materijal"], ["formatiranje", "Formatiranje"], ["spulna", "Špulna"]]
            : [["materijal", "Materijal"], ["stampa", "Štampa"], ["kasiranje", "Kaširanje"], ["perforacija_rezanje", "Perforacija + rezanje"]];
    return <div className="a4-process">{items.map(([k, l]) => <div key={k} className={k === active ? "active" : ""}>{k === active ? "●" : "○"} {l}</div>)}</div>;
}

function SignatureFooter() {
    return (
        <footer className="a4-signatures">
            <div>Operater<br /><b>________________</b></div>
            <div>Mašina<br /><b>________________</b></div>
            <div>Kontrola<br /><b>________________</b></div>
            <div>Potpis<br /><b>________________</b></div>
        </footer>
    );
}

function MaterijalOrder({ nalog }) {
    const materijali = getMaterijali(nalog);
    const rolne = getRolne(nalog);
    const ukKg = materijali.reduce((s, m) => s + (Number(m.kg) || 0), 0);
    const rows = materijali.map(m => [
        m.sloj, m.materijal, m.debljina ? `${m.debljina}` : "—", m.gm2 ? fmt(m.gm2) : "—",
        m.sirina ? `${m.sirina} mm` : "—", m.potrebno ? fmt(m.potrebno, " m") : "—",
        m.kg ? fmt(m.kg, " kg") : "—", m.stampa ? "DA" : "—", val(m.lot),
    ]);
    if (ukKg > 0) rows.push(["", "UKUPNO", "", "", "", "", fmt(ukKg, " kg"), "", ""]);
    return (
        <>
            <Section title="Potreba materijala">
                <MiniTable columns={["Sloj", "Materijal", "µ", "g/m²", "Širina", "Potrebno", "Kg", "Štampa", "LOT"]} rows={rows} />
            </Section>
            <Section title="Rezervisane / predložene role" compact>
                <MiniTable columns={["QR", "LOT", "Lokacija", "Širina", "Metara", "Kg"]} rows={(rolne.length ? rolne : [{ qr: "upis iz magacina", lot: "—", lokacija: "—", sirina: "—", m: "—", kg: "—" }]).map(r => [r.qr, r.lot, r.lokacija, r.sirina ? `${r.sirina} mm` : "—", r.m ? fmt(r.m, " m") : "—", r.kg ? fmt(r.kg, " kg") : "—"])} />
            </Section>
            <Section title="Napomena za magacin" compact>
                <div className="a4-note">Rezervacija, skidanje i istorija rolne ostaju kroz Magacin / QR sistem. Ovaj nalog je štampani prikaz potrebe materijala.</div>
            </Section>
        </>
    );
}

function StampaOrder({ nalog }) {
    const { folija, pdf } = getData(nalog);
    const spec = getSpec(nalog);
    const stampa = folija.stampa || nalog.stampa || {};
    const boje = stampa.boje || nalog.boje || [];
    return (
        <>
            <Section title="Parametri štampe">
                <div className="a4-grid-4">
                    <Field label="Sloj za štampu" value={spec.stampaSlojevi.length ? spec.stampaSlojevi.join(", ") : "—"} strong />
                    <Field label="Mašina" value={stampa.masina || nalog.masina} />
                    <Field label="Strana štampe" value={stampa.strana || nalog.strana_stampe || "unutrašnja / spoljašnja"} />
                    <Field label="PDF / KPDF" value={pdf.naziv || nalog.kpdf || "priložiti"} />
                    <Field label="Smer odmotavanja" value={nalog.smer || stampa.smer} />
                    <Field label="Kliše" value={stampa.klise || nalog.klise} />
                    <Field label="Aniloks" value={stampa.aniloks || nalog.aniloks} />
                    <Field label="Brzina" value={stampa.brzina} />
                </div>
            </Section>
            <Section title="Boje / lak / napomena" compact>
                <MiniTable columns={["R.br", "Boja", "Aniloks", "Kliše", "Napomena"]} rows={(Array.isArray(boje) && boje.length ? boje : [{ boja: "po KPDF", aniloks: "—", klise: "—", napomena: "kontrola prvog otiska" }]).slice(0, 8).map((b, i) => [i + 1, b.boja || b.name || "—", b.aniloks || "—", b.klise || "—", b.napomena || "—"])} />
            </Section>
        </>
    );
}

function KasiranjeOrder({ nalog }) {
    const materijali = getMaterijali(nalog);
    const { folija } = getData(nalog);
    const spec = getSpec(nalog);
    const kas = folija.kasiranje || nalog.kasiranje || {};
    const brKas = Number(kas.brojKasiranja || 0) || Math.max(0, spec.brSlojeva - 1);
    return (
        <>
            <Section title="Slojevi za kaširanje">
                <MiniTable columns={["Sloj", "Materijal", "µ", "Širina", "LOT", "Uloga"]} rows={materijali.map((m, i) => [m.sloj, m.materijal, m.debljina ? `${m.debljina}` : "—", m.sirina ? `${m.sirina} mm` : "—", val(m.lot), i === 0 ? "spoljašnji" : i === materijali.length - 1 ? "unutrašnji" : "srednji"])} />
            </Section>
            <Section title="Parametri kaširanja" compact>
                <div className="a4-grid-4">
                    <Field label="Broj kaširanja" value={brKas || "—"} strong />
                    <Field label="Ukupna debljina" value={spec.ukDeb ? `${fmt(spec.ukDeb)} µ` : "—"} />
                    <Field label="Mašina" value={kas.masina || nalog.masina} />
                    <Field label="Valjak" value={kas.valjak || nalog.valjak || nalog.valjak_kasiranja} />
                    <Field label="Lepak" value={kas.lepak || nalog.lepak} />
                    <Field label="Brzina" value={kas.brzina} />
                    <Field label="Temperatura" value={kas.temperatura} />
                    <Field label="Dozacija" value={kas.dozacija} />
                </div>
            </Section>
        </>
    );
}

function RezanjeOrder({ nalog }) {
    const { folija } = getData(nalog);
    const rez = folija.rezanje || nalog.rezanje || {};
    const sirina = rez.sirinaMaterijala || nalog.sirina || nalog.sir;
    const trake = rez.trake || nalog.trake || nalog.pozicije || [];
    const rows = Array.isArray(trake) && trake.length
        ? trake.slice(0, 12).map((t, i) => [i + 1, t.sirina || t.width || "—", t.kom || t.kolicina || 1, t.duzina || t.m || nalog.kol || "—", t.napomena || "—"])
        : [[1, nalog.sirina_trake || nalog.finalna_sirina || "po planu", nalog.kom || nalog.kolicina || "—", nalog.kol || nalog.metraza || "—", "perforacija po specifikaciji"]];
    return (
        <>
            <Section title="Plan perforacije i rezanja">
                <div className="a4-grid-4" style={{ marginBottom: 8 }}>
                    <Field label="Ulazna širina" value={sirina ? `${sirina} mm` : "—"} />
                    <Field label="Noževi / pozicije" value={rez.nozevi || nalog.nozevi} />
                    <Field label="Otpad L/D" value={rez.otpad || nalog.otpad || "upisati"} />
                    <Field label="Perforacija" value={rez.perforacija || nalog.perforacija || "po specifikaciji"} />
                </div>
                <MiniTable columns={["R.br", "Širina trake", "Kom", "Metara", "Napomena"]} rows={rows} />
            </Section>
            <Section title="Parent → Child role / novi QR" compact>
                <MiniTable columns={["Parent QR", "Child QR", "Širina", "Metara", "Status"]} rows={[[nalog.parent_qr || "ulazna rolna", "generiše se po završetku", nalog.finalna_sirina || "—", nalog.kol || "—", "za štampu etikete"]]} />
            </Section>
        </>
    );
}

function KesaOrder({ nalog }) {
    const { kesa } = getData(nalog);
    return (
        <>
            <Section title="Parametri kese">
                <div className="a4-grid-4">
                    <Field label="Tip kese" value={kesa.tip || nalog.tip_kese || "ravna / doypack / konusna"} />
                    <Field label="Širina" value={kesa.sirina || nalog.sirina_kese} />
                    <Field label="Dužina" value={kesa.duzina || nalog.duzina_kese} />
                    <Field label="Količina" value={nalog.kom || nalog.kolicina || nalog.kol} />
                    <Field label="Zumba / euro" value={kesa.zumba || nalog.zumba} />
                    <Field label="Var" value={kesa.var || nalog.var} />
                    <Field label="Falta / dno" value={kesa.dno || nalog.dno} />
                    <Field label="Kontrola" value="dimenzija, var, perforacija" />
                </div>
            </Section>
            <Section title="Crtež / dorada" compact>
                <div className="a4-drawing">CRTEŽ KESE / PDF / SKICA — priložiti uz nalog</div>
            </Section>
        </>
    );
}

function FormatiranjeOrder({ nalog }) {
    return (
        <>
            <Section title="Plan formatiranja rolne">
                <div className="a4-grid-4" style={{ marginBottom: 8 }}>
                    <Field label="Parent širina" value={nalog.parent_sirina || nalog.sirina || "—"} />
                    <Field label="Parent metraža" value={nalog.parent_m || nalog.metraza || nalog.kol || "—"} />
                    <Field label="Broj skidanja" value={nalog.broj_skidanja || "—"} />
                    <Field label="Otpad" value={nalog.otpad || "upisati"} />
                </div>
                <MiniTable columns={["R.br", "Nova širina", "Metara", "Child QR", "Napomena"]} rows={[[1, nalog.format_sirina || "po planu", nalog.kol || nalog.metraza || "—", "generiše se", "nova formatna rolna"]]} />
            </Section>
            <Section title="Šema formatiranja" compact><div className="a4-drawing">PARENT ROLNA → FORMATNE ROLE / prikaz širina</div></Section>
        </>
    );
}

function SpulnaOrder({ nalog }) {
    const { spulna } = getData(nalog);
    return (
        <>
            <Section title="Nalog za špulnu">
                <div className="a4-grid-4">
                    <Field label="Širina trake" value={spulna.sirina || nalog.sirina_trake || nalog.sirina} />
                    <Field label="Dužina špulne" value={spulna.duzina || nalog.duzina_spulne || nalog.metraza} />
                    <Field label="Broj komada" value={spulna.kom || nalog.kom || nalog.kolicina} />
                    <Field label="Hilzna" value={spulna.hilzna || nalog.hilzna} />
                    <Field label="Max OD" value={spulna.max_od || nalog.max_od} />
                    <Field label="Pakovanje" value={spulna.pakovanje || nalog.pakovanje || "24 kom / paleta"} />
                    <Field label="Etiketa" value="QR na paket / špulnu" />
                    <Field label="Kontrola" value="širina, metraža, namotaj" />
                </div>
            </Section>
            <Section title="Plan rezanja traka" compact><MiniTable columns={["Ulaz", "Traka", "Kom", "Otpad", "Napomena"]} rows={[[nalog.ulazna_sirina || "formatna rolna", nalog.sirina_trake || "—", nalog.kom || "—", nalog.otpad || "—", "noževi provereni"]]} /></Section>
        </>
    );
}

function Body({ nalog, vrsta }) {
    if (vrsta === "stampa") return <StampaOrder nalog={nalog} />;
    if (vrsta === "kasiranje") return <KasiranjeOrder nalog={nalog} />;
    if (vrsta === "perforacija_rezanje") return <RezanjeOrder nalog={nalog} />;
    if (vrsta === "kesa") return <KesaOrder nalog={nalog} />;
    if (vrsta === "formatiranje") return <FormatiranjeOrder nalog={nalog} />;
    if (vrsta === "spulna") return <SpulnaOrder nalog={nalog} />;
    return <MaterijalOrder nalog={nalog} />;
}

const TITLES = {
    materijal: ["Potreba materijala", "📦"],
    stampa: ["Nalog za štampu", "🖨️"],
    kasiranje: ["Nalog za kaširanje", "🔗"],
    perforacija_rezanje: ["Nalog za perforaciju i rezanje", "✂️"],
    kesa: ["Nalog za kesu", "🛍️"],
    formatiranje: ["Nalog za formatiranje", "🎞️"],
    spulna: ["Nalog za špulnu", "🧵"],
};

export default function NalogLayoutPRO({ nalog = {}, activeTab }) {
    const tip = normTip(nalog.tip_proizvoda || nalog.tip);
    const vrsta = normNalog(nalog.vrsta || nalog.tip_naloga || nalog.tipOperacije || nalog.tip, nalog.naziv, activeTab);
    const [title, icon] = TITLES[vrsta] || TITLES.materijal;

    return (
        <div className="a4-screen">
            <style>{`
        .a4-screen{font-family:Inter,Arial,sans-serif;color:#0f172a;}
        .a4-page{width:210mm;min-height:297mm;max-height:297mm;overflow:hidden;background:#fff;margin:0 auto 18px auto;padding:10mm;box-sizing:border-box;border:1px solid #e5e7eb;box-shadow:0 16px 40px rgba(15,23,42,.10);position:relative;}
        .a4-header{display:grid;grid-template-columns:1fr 92px;gap:12px;align-items:start;background:linear-gradient(135deg,#0f172a,#1e3a8a);border-radius:12px;padding:12px;color:#fff;margin-bottom:7px;}
        .a4-company{font-size:8px;font-weight:900;letter-spacing:.9px;opacity:.8;text-transform:uppercase;margin-bottom:4px;}
        .a4-title{font-size:20px;font-weight:950;letter-spacing:-.2px;margin-bottom:8px;}
        .a4-header-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
        .a4-header .a4-field{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.2);padding:6px 8px;}
        .a4-header .a4-label{color:#cbd5e1;}.a4-header .a4-value{color:#fff;}
        .a4-qr{background:#fff;border-radius:8px;text-align:center;padding:6px;color:#0f172a;font-size:8px;font-weight:900;}
        .a4-qr img{width:72px;height:72px;display:block;margin:0 auto 3px;}
        .a4-meta{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:7px;}
        .a4-process{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:7px;}
        .a4-process div{border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:6px 7px;text-align:center;font-size:10px;font-weight:900;color:#64748b;}
        .a4-process div.active{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8;}
        .a4-field{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:7px 8px;min-width:0;}
        .a4-label{font-size:8px;color:#64748b;font-weight:900;text-transform:uppercase;letter-spacing:.45px;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .a4-value{font-size:11px;font-weight:800;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.a4-value.strong{font-size:12px;font-weight:950;}
        .a4-section{border:1px solid #dbeafe;border-left:4px solid #2563eb;border-radius:10px;overflow:hidden;margin-bottom:7px;}.a4-section.compact{margin-bottom:6px;}
        .a4-section-title{background:#eff6ff;color:#1d4ed8;padding:6px 9px;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #dbeafe;}
        .a4-section-body{padding:8px;}
        .a4-table{width:100%;border-collapse:collapse;font-size:9.5px;}.a4-table th{text-align:left;background:#f1f5f9;color:#334155;font-size:8.5px;text-transform:uppercase;letter-spacing:.3px;padding:5px;border-bottom:1px solid #e2e8f0;}.a4-table td{padding:5px;border-bottom:1px solid #f1f5f9;font-weight:700;color:#0f172a;}.a4-table tr:last-child td{border-bottom:0;}
        .a4-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
        .a4-note{font-size:10px;font-weight:800;color:#475569;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px;}
        .a4-drawing{height:70mm;border:1px dashed #94a3b8;background:#f8fafc;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:12px;font-weight:900;text-align:center;}
        .a4-signatures{position:absolute;left:10mm;right:10mm;bottom:8mm;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;border-top:2px solid #e2e8f0;padding-top:8px;font-size:9px;color:#334155;font-weight:800;}
        @media print{body *{visibility:hidden!important}.a4-page,.a4-page *{visibility:visible!important}.a4-page{position:absolute;left:0;top:0;margin:0!important;border:0!important;box-shadow:none!important;width:210mm!important;height:297mm!important;max-height:297mm!important;page-break-after:always}.a4-screen{margin:0!important}@page{size:A4 portrait;margin:0}}
      `}</style>
            <div className="a4-page">
                <Header nalog={{ ...nalog, tip_proizvoda: tip }} title={title} icon={icon} />
                <div className="a4-meta">
                    <Field label="Datum" value={nalog.datum || new Date().toLocaleDateString("sr-RS")} />
                    <Field label="Rok isporuke" value={nalog.rok || nalog.datumIsp || nalog.datum_isporuke} />
                    <Field label="Status" value={nalog.status || "Čeka"} />
                    <Field label="Izvor" value={nalog.source_chain || nalog.izvor || "template → kalkulacija → ponuda"} />
                    <Field label="Radnik" value={nalog.radnik || nalog.ko || "—"} />
                </div>
                <ProcessBar tip={tip} active={vrsta} />
                <SpecSummary nalog={{ ...nalog, tip_proizvoda: tip }} />
                <Body nalog={nalog} vrsta={vrsta} />
                <SignatureFooter />
            </div>
        </div>
    );
}
