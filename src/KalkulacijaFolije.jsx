import React, { useState, useEffect } from "react";
import AIPomoc from "./modules/AIPomoc.jsx";
import MaterialSelectorPRO, { MaterialText } from './components/MaterialSelectorPRO.jsx';
import MaterialLayersTablePRO from './components/MaterialLayersTablePRO.jsx';
import { buildMaterijaliStruktura } from './data/materialMaster.js';
import { supabase } from "./supabase.js";
import { useAuth } from "./auth/AuthProvider";

// ============================================================================
// MATERIJALI - BAZA PODATAKA
// ============================================================================
const MAT_DATA = {
    "BOPP": [
        { d: 5, t: 4.55 }, { d: 10, t: 9.1 }, { d: 15, t: 13.65 }, { d: 18, t: 16.38 },
        { d: 20, t: 18.2 }, { d: 25, t: 22.75 }, { d: 28, t: 25.48 }, { d: 30, t: 27.3 },
        { d: 35, t: 31.85 }, { d: 40, t: 36.4 }, { d: 45, t: 40.95 }, { d: 50, t: 45.5 },
        { d: 55, t: 50.05 }, { d: 60, t: 54.6 }, { d: 65, t: 59.15 }, { d: 70, t: 63.7 }
    ],
    "BOPP SEDEF": [
        { d: 5, t: 3.25 }, { d: 10, t: 6.5 }, { d: 15, t: 9.75 }, { d: 20, t: 13 },
        { d: 25, t: 16.25 }, { d: 30, t: 19.5 }, { d: 35, t: 22.75 }, { d: 38, t: 24.7 },
        { d: 40, t: 26 }, { d: 45, t: 29.25 }
    ],
    "BOPP BELI": [
        { d: 5, t: 4.55 }, { d: 10, t: 9.1 }, { d: 15, t: 13.65 }, { d: 20, t: 18.2 },
        { d: 25, t: 22.75 }, { d: 30, t: 27.3 }, { d: 35, t: 31.85 }, { d: 40, t: 36.4 },
        { d: 45, t: 40.95 }, { d: 50, t: 45.5 }
    ],
    "LDPE": [
        { d: 10, t: 9.25 }, { d: 15, t: 13.88 }, { d: 20, t: 18.5 }, { d: 25, t: 23.13 },
        { d: 30, t: 27.75 }, { d: 35, t: 32.38 }, { d: 40, t: 37 }, { d: 45, t: 41.63 },
        { d: 50, t: 46.25 }, { d: 55, t: 50.88 }, { d: 60, t: 55.5 }
    ],
    "CPP": [
        { d: 5, t: 4.55 }, { d: 10, t: 9.1 }, { d: 15, t: 13.65 }, { d: 18, t: 16.38 },
        { d: 20, t: 18.2 }, { d: 25, t: 22.75 }, { d: 28, t: 25.48 }, { d: 30, t: 27.3 },
        { d: 35, t: 31.85 }, { d: 40, t: 36.4 }, { d: 45, t: 40.95 }, { d: 50, t: 45.5 },
        { d: 55, t: 50.05 }, { d: 60, t: 54.6 }
    ],
    "PET": [
        { d: 12, t: 16.8 }, { d: 15, t: 21 }, { d: 19, t: 26.6 }, { d: 20, t: 28 },
        { d: 21, t: 29.4 }, { d: 36, t: 50.4 }, { d: 50, t: 70 }, { d: 150, t: 210 }
    ],
    "OPA": [
        { d: 12, t: 13.2 }, { d: 15, t: 16.5 }, { d: 20, t: 22 }, { d: 25, t: 27.5 },
        { d: 30, t: 33 }, { d: 35, t: 38.5 }, { d: 40, t: 44 }
    ],
    "OPP": [
        { d: 5, t: 4.55 }, { d: 10, t: 9.1 }, { d: 15, t: 13.65 }, { d: 18, t: 16.38 },
        { d: 20, t: 18.2 }, { d: 25, t: 22.75 }, { d: 28, t: 25.48 }, { d: 30, t: 27.3 },
        { d: 35, t: 31.85 }, { d: 40, t: 36.4 }, { d: 45, t: 40.95 }, { d: 50, t: 45.5 }
    ],
    "PLA": [
        { d: 5, t: 6.2 }, { d: 10, t: 12.4 }, { d: 15, t: 18.6 }, { d: 20, t: 24.8 },
        { d: 25, t: 31 }, { d: 30, t: 37.2 }, { d: 35, t: 43.4 }, { d: 40, t: 49.6 },
        { d: 45, t: 55.8 }
    ],
    "HDPE": [
        { d: 5, t: 4.7 }, { d: 8, t: 7.52 }, { d: 12, t: 11.28 }, { d: 15, t: 14.1 },
        { d: 17, t: 15.98 }, { d: 20, t: 18.8 }, { d: 25, t: 23.5 }, { d: 30, t: 28.2 },
        { d: 35, t: 32.9 }, { d: 40, t: 37.6 }, { d: 45, t: 42.3 }, { d: 50, t: 47 }
    ],
    "ALU": [
        { d: 7, t: 18.97 }, { d: 9, t: 24.39 }, { d: 12, t: 32.52 }, { d: 15, t: 40.65 },
        { d: 20, t: 54.2 }, { d: 25, t: 67.75 }, { d: 30, t: 81.3 }, { d: 35, t: 94.85 },
        { d: 40, t: 108.4 }, { d: 45, t: 121.95 }, { d: 50, t: 135.5 }
    ],
    "CELULOZA": [
        { d: 10, t: 14.5 }, { d: 15, t: 21.75 }, { d: 20, t: 29 }, { d: 23, t: 33.35 },
        { d: 28, t: 40.6 }, { d: 30, t: 43.5 }, { d: 35, t: 50.75 }, { d: 40, t: 58 },
        { d: 45, t: 65.25 }, { d: 50, t: 72.5 }
    ],
    "CELOFAN": [
        { d: 10, t: 14.5 }, { d: 15, t: 21.75 }, { d: 20, t: 29 }, { d: 23, t: 33.35 },
        { d: 28, t: 40.6 }, { d: 30, t: 43.5 }, { d: 35, t: 50.75 }, { d: 40, t: 58 },
        { d: 45, t: 65.25 }, { d: 50, t: 72.5 }
    ],
    "PA": [
        { d: 10, t: 11.4 }, { d: 15, t: 17.1 }, { d: 20, t: 22.8 }, { d: 23, t: 26.22 },
        { d: 28, t: 31.92 }, { d: 30, t: 34.2 }, { d: 35, t: 39.9 }, { d: 40, t: 45.6 },
        { d: 45, t: 51.3 }, { d: 50, t: 57 }
    ],
    "PA/PE koestruzija": [
        { d: 10, t: 10 }, { d: 15, t: 15 }, { d: 20, t: 20 }, { d: 23, t: 23 },
        { d: 28, t: 28 }, { d: 30, t: 30 }, { d: 35, t: 35 }, { d: 40, t: 40 },
        { d: 45, t: 45 }, { d: 50, t: 50 }
    ],
    "Papir sigmakraft": [
        { d: 70, t: 70 }, { d: 80, t: 80 }, { d: 90, t: 90 }, { d: 100, t: 100 }
    ]
};

const CENE = {
    "BOPP": 3.1, "BOPP SEDEF": 3.5, "BOPP BELI": 3.2, "LDPE": 1.8, "CPP": 2.2,
    "PET": 3.5, "OPA": 4.0, "OPP": 2.9, "PLA": 3.8, "HDPE": 1.9, "ALU": 7.5,
    "CELULOZA": 3.0, "CELOFAN": 3.0, "PA": 4.2, "PA/PE koestruzija": 1.8,
    "Papir sigmakraft": 3.5
};

// ===================== V26 TEMPLATE PREFILL HELPERS =====================
function parseTemplateMaterialName(raw) {
    const value = String(raw || "").trim();
    const debMatch = value.match(/(\d+(?:[.,]\d+)?)\s*(?:µ|um|mik|mic|micron)?\s*$/i);
    const debljina = debMatch ? Number(String(debMatch[1]).replace(",", ".")) : 0;
    let tip = value.replace(/\s*\d+(?:[.,]\d+)?\s*(?:µ|um|mik|mic|micron)?\s*$/i, "").trim();
    if (!tip && value) tip = value;
    const known = Object.keys(MAT_DATA).find(k => k.toLowerCase() === tip.toLowerCase()) ||
        Object.keys(MAT_DATA).find(k => tip.toLowerCase().includes(k.toLowerCase())) || tip;
    return { tip: known, debljina };
}

// Specifična težina g/m² iz tipa+debljine — radi i kad tip nije čist ključ
// (npr. "OPA STANDARD" -> "OPA") i kad debljina nije u listi (izvede iz faktora t/d).
// Vraća 0 samo ako se tip uopšte ne prepozna.
function specTezina(tip, deb) {
    const d = Number(String(deb).replace(",", ".")) || 0;
    if (!tip || d <= 0) return 0;
    const t = String(tip).toLowerCase();
    const key = Object.keys(MAT_DATA).find(k => k.toLowerCase() === t) ||
        Object.keys(MAT_DATA).find(k => t.includes(k.toLowerCase()));
    if (!key) return 0;
    const arr = MAT_DATA[key];
    const item = arr.find(x => Number(x.d) === d);
    if (item) return item.t;
    return arr.length ? +(d * (arr[0].t / arr[0].d)).toFixed(2) : 0;
}

// Efektivna težina g/m² jednog sloja — prvo uzima vrednost koju je
// MaterialLayersTablePRO već izračunao (gm2/tezinaGm2/gsm/t/gramatura/tezina),
// pa tek onda fallback na specTezina iz tipa+debljine (širi izvori polja).
function efektivnaTezina(mat) {
    const direkt = Number(mat.tezina) || Number(mat.gm2) || Number(mat.tezinaGm2) ||
        Number(mat.gsm) || Number(mat.t) || Number(mat.gramatura);
    if (direkt) return direkt;
    const spec = specTezina(
        mat.tip || mat.vrsta || mat.materijal || mat.naziv,
        mat.debljina || mat.deb || mat.debljina_um || mat.mic
    );
    if (spec) return spec;
    // Poslednja rezerva: debljina × FAKT (faktor gustine sa kartice, npr. 20 × 0.91 = 18.2)
    const d = Number(mat.debljina || mat.deb || mat.debljina_um || mat.mic) || 0;
    const f = Number(mat.faktor || mat.faktorGustine || mat.koeficijent || mat.koef || mat.gustina) || 0;
    return d > 0 && f > 0 ? +(d * f).toFixed(2) : 0;
}
// Efektivna cena €/kg jednog sloja (pod raznim imenima polja)
function efektivnaCena(mat) {
    return Number(mat.cena) || Number(mat.cena_kg) || Number(mat.cenaKg) ||
        CENE[mat.tip || mat.vrsta || mat.materijal] || 0;
}

function mapTemplateLayerToFolijaMaterial(layer, fallbackSirina) {
    const rawName = layer.material || layer.materijal || layer.tip || layer.vrsta || layer.naziv || layer.oznaka || layer.oznaka_materijala || "";
    const parsed = parseTemplateMaterialName(rawName);
    const tip = layer.vrsta || layer.tip || layer.materijal || parsed.tip || "";
    const podVrsta = layer.pod_vrsta || layer.podVrsta || layer.podvrsta || layer.subtype || "";
    const oznaka = layer.oznaka_materijala || layer.oznaka || layer.grade || layer.sifra || "";
    const debljina = Number(layer.debljina || layer.deb || layer.mic || layer.debljina_um || parsed.debljina || 0);
    const arr = MAT_DATA[tip] || MAT_DATA[parsed.tip] || [];
    const found = arr.find(x => Number(x.d) === Number(debljina));
    const tezina = Number(layer.tezina || layer.t || layer.gsm || layer.gm2 || layer.tezinaGm2 || layer.gramatura || (found ? found.t : 0));
    const sirina = Number(layer.idealna_sirina || layer.idealnaSirina || layer.sirina || layer.sirinaMm || fallbackSirina || 0);
    const koef = Number(layer.koeficijent || layer.koef || 0) || undefined;
    return {
        ...layer,
        vrsta: tip,
        tip,
        materijal: tip,
        pod_vrsta: podVrsta,
        podVrsta,
        oznaka_materijala: oznaka,
        oznaka,
        grade: oznaka,
        proizvodjac: layer.proizvodjac || layer.proizvođač || layer.dobavljac || "",
        dobavljac: layer.dobavljac || layer.proizvodjac || layer.proizvođač || "",
        debljina,
        deb: debljina,
        debljina_um: debljina,
        koeficijent: koef || layer.koeficijent || layer.koef || "",
        koef: koef || layer.koef || layer.koeficijent || "",
        tezina,
        gm2: Number(layer.gm2 || layer.tezinaGm2 || tezina || 0),
        tezinaGm2: Number(layer.tezinaGm2 || layer.gm2 || tezina || 0),
        cena: Number(layer.cena || layer.cena_kg || CENE[tip] || CENE[parsed.tip] || 0),
        sirina,
        idealna_sirina: sirina,
        idealnaSirina: sirina,
        sirinaMm: sirina,
        spoj_materijala: layer.spoj_materijala || layer.spojMaterijala || layer.spoj || "",
        broj_spojeva: layer.broj_spojeva || layer.brojSpojeva || layer.spojeva || "",
        stampa: !!(layer.stampa || layer.stamp || layer.Š),
        lakira: !!(layer.lakira || layer.lak || layer.L)
    };
}

function excelDefaultLepakUtrosak(index, potrosnja) {
    // Excel kompatibilnost: u starom Excelu polje "Utrošak lepka" je ručni unos
    // i za standardni lepak 0.002 kg/m² koristi se 0.36 kg/1000m, ne auto 0.84.
    const p = Number(potrosnja) || 0;
    if (index === 0 || index === 1) {
        if (Math.abs(p - 0.002) < 0.000001) return 0.36;
    }
    return 0;
}

function normalizeExcelLepakRow(row, index) {
    const potrosnja = Number(row?.potrosnja) || 0.002;
    let utrosak = Number(row?.utrosak);
    const prolazi = Number(row?.prolazi) || 0;
    const cena = Number(row?.cena) || 6;

    // Migracija za ranije verzije aplikacije: pogrešno je upisivala auto vrednost 0.84
    // za širinu 420mm umesto Excel ručnog unosa 0.36.
    if (!Number.isFinite(utrosak) || utrosak === 0) {
        utrosak = excelDefaultLepakUtrosak(index, potrosnja);
    }
    if (Math.abs(potrosnja - 0.002) < 0.000001 && utrosak > 0.5 && utrosak < 1.5) {
        utrosak = 0.36;
    }

    return { potrosnja, utrosak, prolazi, cena };
}

function readPendingTemplateCalculation(expectedTip) {
    try {
        const raw = localStorage.getItem("maropack_pending_template_calculation");
        if (!raw) return null;
        const kal = JSON.parse(raw);
        if ((kal.tip || kal.template?.type) !== expectedTip) return null;
        // VAŽNO: ne brišemo ovde zbog React StrictMode u dev režimu.
        // StrictMode pokrene useEffect dva puta; ako obrišemo localStorage na prvom mount-u,
        // drugi mount se vrati na default materijale. Brišemo/menjamo samo kada se novi template pošalje.
        return kal.template || kal.data || kal.kalkulator_prefill || null;
    } catch (e) {
        return null;
    }
}


// ============================================================================
// KOMPONENTA
// ============================================================================
export default function KalkulacijaFolijeSmart() {
    const { user } = useAuth();

    // MOD
    const [mod, setMod] = useState("normal");

    // OSNOVNI PODACI
    const [naziv, setNaziv] = useState("");
    const [kupac, setKupac] = useState("");
    const [sirina, setSirina] = useState(0);
    const [metraza, setMetraza] = useState(1000); // BAZA = 1000 m (fiksno). NE sme biti 0 — množi se sa kg materijala.
    const [nalog, setNalog] = useState(0);
    const [skart, setSkart] = useState(10);
    const [marza, setMarza] = useState(40);
    const [zeljenaCena, setZeljenaCena] = useState(86.37);
    const [zeljenaCenaKg, setZeljenaCenaKg] = useState(0);
    const [reverseBaza, setReverseBaza] = useState("1000m"); // "1000m" | "kg"
    const [sourceLink, setSourceLink] = useState(null);

    // MATERIJALI (4)
    const [materijali, setMaterijali] = useState([
        { tip: "", debljina: 0, tezina: 0, cena: 0, sirina: 0, stampa: false, lakira: false }
    ]);

    // LEPAK (3)
    const [lepak, setLepak] = useState([
        // Excel logika: potrošnja kg/m² + ručno/auto polje "utrošak kg/1000m" + broj prolaza + cena €/kg
        { potrosnja: 0.002, utrosak: 0.36, prolazi: 1, cena: 6 },
        { potrosnja: 0.002, utrosak: 0.36, prolazi: 0, cena: 6 },
        { potrosnja: 0.002, utrosak: 0, prolazi: 0, cena: 6 }
    ]);

    // LAK - Excel kompatibilno: potrošnja 0.0035, utrošak 1.47, prolazi 0, cena 7.05
    const [lak, setLak] = useState({ potrosnja: 0.0035, utrosak: 1.47, prolazi: 0, cena: 7.05 });

    // KAŠIRANJE
    const [kasiranje, setKasiranje] = useState({ cena: 0.02 });

    // ŠTAMPA & LAKIRANJE (auto iz materijala)
    const [stampaCena, setStampaCena] = useState(0.85);
    const [lakiranjeCena, setLakiranjeCena] = useState(1.1);

    // DODATNI TROŠKOVI
    const [transport, setTransport] = useState(0);
    const [pakovanje, setPakovanje] = useState(0);
    const [dorada, setDorada] = useState(0);

    // REZULTATI
    const [rezultati, setRezultati] = useState(null);

    // ========================================================================
    // V28: UČITAJ KALKULACIJU DIREKTNO IZ PRODUCT TEMPLATE ENGINE-A
    // ========================================================================
    useEffect(() => {
        const tpl = readPendingTemplateCalculation("folija");
        if (!tpl) return;
        try {
            const rawMeta = JSON.parse(localStorage.getItem("maropack_pending_template_calculation") || "{}");
            setSourceLink({
                product_master_id: rawMeta.product_master_id || tpl.product_master_id || null,
                template_id: rawMeta.template_id || rawMeta.source_template_id || null,
                product_template_id: rawMeta.product_template_id || rawMeta.source_template_id || null,
                template_version: rawMeta.template_version || tpl.template_version || "V25",
                template_locked: !!rawMeta.template_locked || !!tpl.template_locked,
                operacije: rawMeta.operacije || []
            });
        } catch { }

        try {
            console.log("✅ V28 template prefill za foliju:", tpl);
            const folija = tpl.folija || tpl.data?.folija || tpl;
            const layers = (Array.isArray(folija.layers) && folija.layers.length) ? folija.layers
                : (Array.isArray(tpl.materijali_struktura) && tpl.materijali_struktura.length) ? tpl.materijali_struktura
                    : (Array.isArray(tpl.mats) && tpl.mats.length) ? tpl.mats
                        : (Array.isArray(tpl.materijali) && tpl.materijali.length) ? tpl.materijali
                            : [];
            const fallbackSirina = Number(
                folija.rezanje?.sirinaMaterijala ||
                folija.rezanje?.sirinaTrake ||
                folija.sirina ||
                tpl.sirina ||
                layers[0]?.sirina ||
                layers[0]?.idealna_sirina ||
                0
            );
            const fallbackMetraza = Number(String(
                folija.rezanje?.duzinaRolne ||
                folija.finalRoll?.duzina ||
                folija.maxMetara ||
                tpl.metraza ||
                tpl.duzina ||
                ""
            ).replace(/[^0-9.]/g, ""));

            setNaziv(tpl.naziv || folija.naziv || "");
            setKupac(tpl.kupac || "");

            if (folija.rezanje?.sirinaTrake) setSirina(Number(folija.rezanje.sirinaTrake) || fallbackSirina || 0);
            else if (fallbackSirina) setSirina(fallbackSirina);

            // metraza je BAZA = 1000 m i ne menja se iz templejta (pun nalog ide u „Nalog (x1000m)“)

            if (layers.length > 0) {
                const mapped = layers
                    .filter(l => l && (l.material || l.tip || l.naziv || l.debljina || l.deb))
                    .map(l => mapTemplateLayerToFolijaMaterial(l, fallbackSirina))
                    .filter(m => m.tip);

                if (mapped.length > 0) {
                    // bitno: NE dodajemo default Papir/ALU/PA-PE slojeve
                    setMaterijali(mapped);
                }
            }

            const brKasiranja = Math.max(Number(folija.kasiranje?.brojKasiranja || 0), Math.max(0, layers.length - 1));
            if (brKasiranja > 0) {
                setLepak([
                    { potrosnja: 0.002, utrosak: 0.36, prolazi: brKasiranja, cena: 6 },
                    { potrosnja: 0.002, utrosak: 0.36, prolazi: 0, cena: 6 },
                    { potrosnja: 0.002, utrosak: 0, prolazi: 0, cena: 6 }
                ]);
            }

            setRezultati(null);
            // Sveži templejt-prefill je merodavan: ukloni eventualni stari editKalkulacija
            // (iz prethodne kalkulacije) da ne pregazi tek napunjene slojeve/koef/širinu.
            localStorage.removeItem("editKalkulacija");
        } catch (err) {
            console.error("❌ Greška V28 template prefill:", err);
        }
    }, []);

    // ========================================================================
    // UČITAJ KALKULACIJU IZ LISTE (EDIT MODE)
    // ========================================================================
    useEffect(() => {
        const editData = localStorage.getItem('editKalkulacija');
        if (editData) {
            try {
                const kal = JSON.parse(editData);
                console.log('📝 Učitavam kalkulaciju za izmenu:', kal);

                // Popuni sve podatke - KONVERTUJ U BROJEVE!
                if (kal.naziv) setNaziv(kal.naziv);
                if (kal.kupac) setKupac(kal.kupac);
                if (kal.sirina) setSirina(Number(kal.sirina));
                // metraza ostaje 1000 (baza) — ne učitava se iz sačuvane kalkulacije
                if (kal.nalog) setNalog(Number(kal.nalog));
                if (kal.skart !== undefined) setSkart(Number(kal.skart));
                if (kal.marza !== undefined) setMarza(Number(kal.marza));

                // Materijali - KONVERTUJ BROJEVE!
                if (kal.materijali && Array.isArray(kal.materijali)) {
                    console.log('📦 RAW Materijali:', kal.materijali);

                    // Konvertuj sve brojeve u materijalima + uskladi nazive polja (koef/koeficijent, gm2/gsm/tezina, vrsta/tip)
                    const materijaliFix = kal.materijali.map(m => {
                        const koef = m.koef ?? m.koeficijent ?? "";
                        const gm2 = m.gm2 ?? m.gsm ?? m.tezina ?? "";
                        const vrsta = m.vrsta || m.tip || m.materijal || "";
                        return {
                            ...m,
                            vrsta,
                            tip: vrsta,
                            oznaka: m.oznaka || m.oznaka_materijala || "",
                            oznaka_materijala: m.oznaka_materijala || m.oznaka || "",
                            debljina: Number(m.debljina) || 0,
                            koef: (Number(koef) || koef || ""),
                            koeficijent: (Number(koef) || koef || ""),
                            tezina: Number(gm2) || 0,
                            gm2: Number(gm2) || 0,
                            gsm: Number(gm2) || 0,
                            cena: Number(m.cena) || 0,
                            sirina: Number(m.sirina) || 0,
                            stampa: !!(m.stampa || m.stamp || m.Š),
                            lakira: !!(m.lakira || m.lak || m.L)
                        };
                    });

                    console.log('✅ FIXED Materijali:', materijaliFix);
                    setMaterijali(materijaliFix);
                }

                // Lepak - proveri da li je array ili objekat
                if (kal.lepak) {
                    if (Array.isArray(kal.lepak)) {
                        // Konvertuj brojeve
                        const lepakFix = kal.lepak.map((l, idx) => normalizeExcelLepakRow(l, idx));
                        setLepak(lepakFix);
                    } else {
                        // Ako je objekat, napravi array sa konvertovanim brojevima
                        setLepak([
                            {
                                potrosnja: Number(kal.lepak.potrosnja) || 0.002,
                                utrosak: Number(kal.lepak.utrosak) || 0.36,
                                prolazi: Number(kal.lepak.prolazi) || 1,
                                cena: Number(kal.lepak.cena) || 6
                            },
                            { potrosnja: 0.002, utrosak: 0.36, prolazi: 0, cena: 6 },
                            { potrosnja: 0.002, utrosak: 0, prolazi: 0, cena: 6 }
                        ]);
                    }
                }

                // Lak - proveri tip i konvertuj brojeve
                if (kal.lak) {
                    if (typeof kal.lak === 'object' && !Array.isArray(kal.lak)) {
                        setLak({
                            potrosnja: Number(kal.lak.potrosnja) || 0,
                            utrosak: Number(kal.lak.utrosak) || 0,
                            prolazi: Number(kal.lak.prolazi) || 0,
                            cena: Number(kal.lak.cena) || 0
                        });
                    }
                }

                // Kaširanje - proveri tip i konvertuj brojeve
                if (kal.kasiranje) {
                    if (typeof kal.kasiranje === 'object' && !Array.isArray(kal.kasiranje)) {
                        setKasiranje({
                            cena: Number(kal.kasiranje.cena) || 0
                        });
                    }
                }

                // Cene - KONVERTUJ U BROJEVE!
                if (kal.stampa_cena !== undefined) setStampaCena(Number(kal.stampa_cena));
                if (kal.lakiranje_cena !== undefined) setLakiranjeCena(Number(kal.lakiranje_cena));
                if (kal.transport !== undefined) setTransport(Number(kal.transport));
                if (kal.pakovanje !== undefined) setPakovanje(Number(kal.pakovanje));
                if (kal.dorada !== undefined) setDorada(Number(kal.dorada));

                // Rezultati
                if (kal.rezultati) {
                    setRezultati(kal.rezultati);
                }

                // Obriši iz localStorage
                localStorage.removeItem('editKalkulacija');

                console.log('✅ Kalkulacija učitana!');
            } catch (err) {
                console.error('❌ Greška pri učitavanju kalkulacije:', err);
            }
        }
    }, []);

    // ========================================================================
    // UPDATE MATERIJAL TIP
    // ========================================================================
    const handleMaterijalTipChange = (index, noviTip) => {
        const novi = [...materijali];
        novi[index].tip = noviTip;

        if (noviTip && MAT_DATA[noviTip] && MAT_DATA[noviTip].length > 0) {
            const first = MAT_DATA[noviTip][0];
            novi[index].debljina = first.d;
            novi[index].tezina = first.t;
            novi[index].cena = CENE[noviTip] || 0;
        } else {
            novi[index].debljina = 0;
            novi[index].tezina = 0;
            novi[index].cena = 0;
        }

        setMaterijali(novi);
    };

    // ========================================================================
    // UPDATE MATERIJAL DEBLJINA
    // ========================================================================
    const handleMaterijalDebljinaChange = (index, novaDebljina) => {
        const novi = [...materijali];
        const tip = novi[index].tip;
        const deb = parseFloat(String(novaDebljina).replace(",", ".")) || 0;

        // Uvek upiši unetu debljinu (i kad nije u tabeli)
        novi[index].debljina = deb;

        const arr = (tip && MAT_DATA[tip]) ? MAT_DATA[tip] : null;
        if (arr && deb > 0) {
            const item = arr.find(x => x.d === deb);
            if (item) {
                novi[index].tezina = item.t;
            } else if (arr.length) {
                // Debljina nije u listi (npr. OPA 18) → izvedi gustinu iz tabele (t/d) i izračunaj
                const faktor = arr[0].t / arr[0].d;        // npr. OPA: 16.5/15 = 1.1
                novi[index].tezina = +(deb * faktor).toFixed(2);
            }
        } else if (deb <= 0) {
            novi[index].tezina = 0;
        }

        setMaterijali(novi);
    };

    // ========================================================================
    // KALKULACIJA
    // ========================================================================
    const izracunaj = () => {
        // DIJAGNOSTIKA: ako neki materijal nema težinu, ispiši njegova polja u konzolu
        try {
            const _dbg = materijali.map(m => ({
                tip: m.tip, vrsta: m.vrsta, materijal: m.materijal, deb: m.debljina ?? m.deb,
                gm2: m.gm2, tezina: m.tezina, faktor: m.faktor ?? m.koeficijent ?? m.koef,
                cena: m.cena, ef: efektivnaTezina(m)
            }));
            if (_dbg.some(x => !x.ef)) console.warn("⚠️ KALK: materijal bez težine →", _dbg);
        } catch (e) { }

        // Kg materijala
        let ukupnoKg = 0;
        let ukupnoMatTrosak = 0;
        let skartNestandardnih = 0;

        const materijalKg = materijali.map(mat => {
            const tez = efektivnaTezina(mat);
            if (!tez) return 0;
            const kg = (sirina * metraza * tez) / 1000000;
            ukupnoKg += kg;
            ukupnoMatTrosak += kg * efektivnaCena(mat);

            // Škart nestandardnih = RUČNO uneta razlika u širini po traci (mm). Default 0 → škart 0.
            const skartW = Number(mat.skartSirina || mat.skart_sirina || 0);
            if (skartW > 0) {
                skartNestandardnih += (skartW * metraza * tez * efektivnaCena(mat)) / 1000000;
            }

            return kg;
        });

        // Kg štampe (iz checkboxova)
        const stampaKg = materijali.reduce((sum, mat, idx) => {
            return sum + (mat.stampa ? materijalKg[idx] : 0);
        }, 0);

        // Kg lakiranja (iz checkboxova)
        const lakiranjeKg = materijali.reduce((sum, mat, idx) => {
            return sum + (mat.lakira ? materijalKg[idx] : 0);
        }, 0);

        // Lepak
        let ukupnoLepakTrosak = 0;
        let ukupnoLepakKg = 0;
        lepak.forEach((lep, idx) => {
            // Excel 1:1: trošak lepka = ručni "Utrošak lepka" × broj prolaza × cena €/kg
            // Primer iz Excel fajla: 0.36 × 1 × 6 = 2.16 €/1000m.
            const fixed = normalizeExcelLepakRow(lep, idx);
            const utrosak = fixed.utrosak;
            const prolazi = fixed.prolazi;
            const cena = fixed.cena;
            ukupnoLepakKg += utrosak * prolazi;
            ukupnoLepakTrosak += cena * utrosak * prolazi;
        });

        // Lak - ista Excel logika kao za lepak
        const lakAutoUtrosak = (sirina * metraza * (Number(lak.potrosnja) || 0)) / 1000;
        const lakUtrosak = Number(lak.utrosak) || lakAutoUtrosak;
        const lakProlazi = Number(lak.prolazi) || 0;
        const lakKg = lakUtrosak * lakProlazi;
        ukupnoLepakKg += lakKg;
        ukupnoLepakTrosak += (Number(lak.cena) || 0) * lakUtrosak * lakProlazi;

        // Kaširanje (auto broj prolaza = broj materijala - 1)
        const aktivniMaterijali = materijali.filter(m => efektivnaTezina(m) > 0).length;
        const kasiranjeProlazi = Math.max(0, aktivniMaterijali - 1);
        const kasiranjeTrosak = (kasiranje.cena * sirina * metraza * kasiranjeProlazi) / 1000;

        // Štampa
        const stampaTrosak = stampaKg * stampaCena;

        // Lakiranje
        const lakiranjeTrosak = lakiranjeKg * lakiranjeCena;

        // Transport, pakovanje, dorada
        const transportTrosak = transport * ukupnoKg;
        const pakovanjeTrosak = pakovanje;
        const doradaTrosak = dorada * ukupnoKg;

        // OSNOVNA CENA — EXCEL-STIL: transport, pakovanje i dorada ULAZE u osnovu,
        // pa dobijaju škart (×1.10) i maržu (×1.27) — kao u Excel fajlu (W9, T11, V13 unutar H14).
        const osnovnaCena = ukupnoMatTrosak + ukupnoLepakTrosak + kasiranjeTrosak +
            stampaTrosak + lakiranjeTrosak + transportTrosak + pakovanjeTrosak + doradaTrosak;

        // SA ŠKARTOM
        const cenaSaSkartom = osnovnaCena * (1 + skart / 100);

        // SA DODATKOM (škart nestandardnih)
        const cenaSaDodatkom = cenaSaSkartom + skartNestandardnih;

        // Transport/pakovanje/dorada su sada u osnovi → nema posebnog pass-through dodatka.
        const passThrough = 0;

        // KONAČNA CENA
        let konacnaCena, izracunataMarza;

        if (mod === "normal") {
            konacnaCena = cenaSaDodatkom * (1 + marza / 100) + passThrough;
            izracunataMarza = marza;
        } else {
            // Obrnuti mod — target je konačna cena (uključuje transport)
            const target = reverseBaza === "kg" ? (zeljenaCenaKg * ukupnoKg) : zeljenaCena; // €/1000m
            konacnaCena = target;
            const proizvodniCilj = target - passThrough; // skini transport pre obračuna marže
            izracunataMarza = cenaSaDodatkom > 0 ? ((proizvodniCilj - cenaSaDodatkom) / cenaSaDodatkom) * 100 : 0;
        }

        // DODATNI OBRAČUNI
        const osnovnaNalog = osnovnaCena * nalog;
        const skartNalog = cenaSaSkartom * nalog;
        const cenaSaDodatkomNalog = cenaSaDodatkom * nalog;
        const konacnaNalog = konacnaCena * nalog;
        const cenaPoKg = ukupnoKg > 0 ? cenaSaDodatkom / ukupnoKg : 0;
        const cenaPoKgSaMarza = ukupnoKg > 0 ? konacnaCena / ukupnoKg : 0;
        const ukupnoKgNalog = ukupnoKg * nalog;

        setRezultati({
            osnovnaCena,
            osnovnaNalog,
            cenaSaSkartom,
            skartNalog,
            skartNestandardnih,
            cenaSaDodatkom,
            cenaSaDodatkomNalog,
            konacnaCena,
            konacnaNalog,
            cenaPoKg,
            cenaPoKgSaMarza,
            ukupnoKg,
            ukupnoKgNalog,
            izracunataMarza,
            materijalKg,
            stampaKg,
            lakiranjeKg,
            ukupnoLepakKg,
            lakKg,
            kasiranjeProlazi,
            skartNestandardnihDetaljno: materijali.map((mat, idx) => {
                const skartW = Number(mat.skartSirina || mat.skart_sirina || 0);
                if (!skartW || !efektivnaTezina(mat)) return 0;
                return (skartW * metraza * mat.tezina * mat.cena) / 1000000;
            }),
            skartNestandardnihNalog: skartNestandardnih * nalog
        });
    };

    // LIVE UPDATE
    useEffect(() => {
        const t = setTimeout(() => izracunaj(), 180);
        return () => clearTimeout(t);
    }, [mod, naziv, kupac, sirina, metraza, nalog, skart, marza, zeljenaCena, zeljenaCenaKg, reverseBaza,
        materijali, lepak, lak, kasiranje, stampaCena, lakiranjeCena, transport, pakovanje, dorada]);

    // ========================================================================
    // SAVE
    // ========================================================================
    const sacuvaj = async () => {
        if (!naziv || !kupac) {
            alert("Unesi naziv i kupca!");
            return;
        }

        try {
            const materijali_struktura = buildMaterijaliStruktura(materijali, sirina);
            localStorage.setItem("maropack_pending_nalog", JSON.stringify({
                tip: "folija",
                type: "folija",
                naziv,
                kupac,
                folija: {
                    layers: materijali,
                    rezanje: { sirinaMaterijala: sirina, duzinaRolne: metraza, sirineTraka: String(sirina || "") },
                    stampa: { brojBoja: "", strana: "", smerOdmotavanja: "" },
                    kasiranje: { nanosLepka: lepak?.potrosnja || "", brojKasiranja: kasiranje || "", odnosLepka: "" },
                    finalRoll: { smerOdmotavanja: "", hilzna: "", precnik: "", duzina: metraza }
                },
                materijali,
                materijali_struktura,
                rezultati,
                source_chain: 'template → kalkulacija → ponuda → nalog',
                product_master_id: sourceLink?.product_master_id || null,
                template_id: sourceLink?.template_id || null,
                product_template_id: sourceLink?.product_template_id || null,
                template_version: sourceLink?.template_version || null,
                template_locked: !!sourceLink?.template_locked,
                operacije: sourceLink?.operacije || [],
                created_at: new Date().toISOString()
            }));
            const { error } = await supabase.from('kalkulacije_folije').insert([{
                naziv, kupac, sirina, metraza, nalog, skart,
                marza: rezultati?.izracunataMarza,
                materijali,
                materijali_struktura,
                lepak, lak, kasiranje,
                stampa_cena: stampaCena,
                lakiranje_cena: lakiranjeCena,
                transport, pakovanje, dorada,
                rezultati,
                kreirao_user_id: user?.id
            }]);

            if (error) throw error;
            alert("✅ Kalkulacija sačuvana!");
        } catch (e) {
            alert("❌ Greška: " + e.message);
        }
    };

    // ========================================================================
    // RENDER
    // ========================================================================
    return (
        <div style={{ background: "#f1f5f9", minHeight: "100vh", padding: 20 }}>
            <AIPomoc ekran="Kalkulacija folije" kontekst={() => ({ naziv, kupac, sirina, metraza, nalog, skart, marza, materijali, lepak, lak, kasiranje, stampaCena, lakiranjeCena, transport, pakovanje, dorada, rezultati })} />
            {/* HEADER */}
            <div style={{ background: "linear-gradient(135deg, #0d9488 0%, #115e59 100%)", padding: 40, borderRadius: 16, color: "white", marginBottom: 20, position: "relative" }}>
                <div style={{ position: "absolute", top: 40, right: 40, display: "flex", gap: 8, background: "rgba(255,255,255,0.2)", padding: 6, borderRadius: 50 }}>
                    <button onClick={() => setMod("normal")} style={{ background: mod === "normal" ? "white" : "transparent", color: mod === "normal" ? "#0d9488" : "white", border: "none", padding: "12px 24px", borderRadius: 50, fontWeight: 700, cursor: "pointer" }}>
                        📊 Normalni
                    </button>
                    <button onClick={() => setMod("reverse")} style={{ background: mod === "reverse" ? "white" : "transparent", color: mod === "reverse" ? "#0d9488" : "white", border: "none", padding: "12px 24px", borderRadius: 50, fontWeight: 700, cursor: "pointer" }}>
                        🔄 Obrnuti
                    </button>
                </div>
                <h1 style={{ fontSize: 28, fontWeight: 800 }}>💎 Kalkulacija - Laminacija Folija</h1>
                <p>Smart Auto Kalkulacija • Live Rezultati</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 20, maxWidth: 2000, margin: "0 auto" }}>
                {/* LEVI PANEL - INPUTI */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* ===== OSNOVNI PODACI ===== */}
                    <div style={{ background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                        <h3 style={{ fontSize: 12, fontWeight: 800, color: "#0d9488", marginBottom: 12, textTransform: "uppercase" }}>📋 OSNOVNI PODACI</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Naziv</label>
                                <input type="text" value={naziv} onChange={e => setNaziv(e.target.value)} style={{ width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Kupac</label>
                                <input type="text" value={kupac} onChange={e => setKupac(e.target.value)} style={{ width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Širina (mm)</label>
                                <input type="number" value={sirina} onChange={e => setSirina(parseFloat(e.target.value) || 0)} style={{ width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Metraža (m) <span style={{ background: "#e2e8f0", color: "#475569", padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 800 }}>BAZA · FIKSNO</span></label>
                                <input type="number" value={1000} readOnly disabled title="Proračun je uvek na 1000 m. Pun nalog se unosi u „Nalog (x1000m)“." style={{ width: "100%", padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 12, background: "#f1f5f9", color: "#64748b", fontWeight: 700, cursor: "not-allowed" }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Nalog (x1000m)</label>
                                <input type="number" value={nalog} onChange={e => setNalog(parseFloat(e.target.value) || 0)} style={{ width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Škart (%)</label>
                                <input type="number" value={skart} onChange={e => setSkart(parseFloat(e.target.value) || 0)} style={{ width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 }} />
                            </div>
                        </div>
                    </div>

                    {/* ===== MATERIJALI ===== */}
                    <MaterialLayersTablePRO
                        title="Materijali"
                        layers={materijali}
                        maxLayers={4}
                        showPrice={true}
                        showWidth={true}
                        showFlags={true}
                        onChange={(next) => setMaterijali(next)}
                        onAdd={(row) => setMaterijali([...materijali, { ...row, sirina: sirina || row.sirina || 0 }])}
                        onRemove={(idx) => setMaterijali(materijali.filter((_, i) => i !== idx))}
                    />

                    {/* ===== LEPAK & LAK ===== */}
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 14 }}>
                        <h3 style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", margin: 0, marginBottom: 4, textTransform: "uppercase" }}>🧪 LEPAK I LAK</h3>
                        <div style={{ color: "#64748b", fontSize: 12, marginBottom: 12 }}>Unos potrošnje, broja prolaza i cene bez velikih ovalnih okvira.</div>
                        <div style={{ overflowX: "auto", border: "1px solid #dbe3ef", borderRadius: 14 }}>
                            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 900, fontSize: 13 }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: "left", padding: "10px 12px", background: "#f8fafc", color: "#64748b", fontSize: 11, fontWeight: 900, textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>Tip</th>
                                        <th style={{ textAlign: "left", padding: "10px 12px", background: "#f8fafc", color: "#64748b", fontSize: 11, fontWeight: 900, textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>Potrošnja kg/m²</th>
                                        <th style={{ textAlign: "left", padding: "10px 12px", background: "#f8fafc", color: "#64748b", fontSize: 11, fontWeight: 900, textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>Utrošak kg/1000m</th>
                                        <th style={{ textAlign: "left", padding: "10px 12px", background: "#f8fafc", color: "#64748b", fontSize: 11, fontWeight: 900, textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>Prolazi</th>
                                        <th style={{ textAlign: "left", padding: "10px 12px", background: "#f8fafc", color: "#64748b", fontSize: 11, fontWeight: 900, textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>Cena €/kg</th>
                                        <th style={{ textAlign: "left", padding: "10px 12px", background: "#f8fafc", color: "#64748b", fontSize: 11, fontWeight: 900, textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>Ukupno kg / 1000m</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lepak.map((lep, idx) => {
                                        const autoKg1000 = (sirina * metraza * (Number(lep.potrosnja) || 0) / 1000);
                                        const kg1000 = (Number(lep.utrosak) || autoKg1000) * (Number(lep.prolazi) || 0);
                                        return <tr key={idx}>
                                            <td style={{ padding: "9px 10px", borderBottom: "1px solid #edf2f7", fontWeight: 900, color: "#1e40af" }}>LEPAK {idx + 1}</td>
                                            <td style={{ padding: "9px 10px", borderBottom: "1px solid #edf2f7" }}><input type="number" step="0.0001" value={lep.potrosnja} onChange={e => { const n = [...lepak]; n[idx].potrosnja = parseFloat(e.target.value) || 0; setLepak(n); }} placeholder="0.002" style={{ width: "100%", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                            <td style={{ padding: "9px 10px", borderBottom: "1px solid #edf2f7" }}><input type="number" step="0.01" value={lep.utrosak ?? ""} onChange={e => { const n = [...lepak]; n[idx].utrosak = parseFloat(e.target.value) || 0; setLepak(n); }} placeholder={autoKg1000.toFixed(2)} style={{ width: "100%", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                            <td style={{ padding: "9px 10px", borderBottom: "1px solid #edf2f7" }}><input type="number" step="0.01" value={lep.prolazi} onChange={e => { const n = [...lepak]; n[idx].prolazi = parseFloat(e.target.value) || 0; setLepak(n); }} placeholder="1" style={{ width: "100%", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                            <td style={{ padding: "9px 10px", borderBottom: "1px solid #edf2f7" }}><input type="number" step="0.01" value={lep.cena} onChange={e => { const n = [...lepak]; n[idx].cena = parseFloat(e.target.value) || 0; setLepak(n); }} placeholder="6" style={{ width: "100%", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                            <td style={{ padding: "9px 10px", borderBottom: "1px solid #edf2f7", fontWeight: 900, color: "#059669" }}>{kg1000.toFixed(2)} kg</td>
                                        </tr>;
                                    })}
                                    <tr>
                                        <td style={{ padding: "9px 10px", borderBottom: "1px solid #edf2f7", fontWeight: 900, color: "#047857" }}>LAK</td>
                                        <td style={{ padding: "9px 10px", borderBottom: "1px solid #edf2f7" }}><input type="number" step="0.0001" value={lak.potrosnja} onChange={e => setLak({ ...lak, potrosnja: parseFloat(e.target.value) || 0 })} placeholder="0.0012" style={{ width: "100%", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                        <td style={{ padding: "9px 10px", borderBottom: "1px solid #edf2f7" }}><input type="number" step="0.01" value={lak.utrosak ?? ""} onChange={e => setLak({ ...lak, utrosak: parseFloat(e.target.value) || 0 })} placeholder={((sirina * metraza * (Number(lak.potrosnja) || 0)) / 1000).toFixed(2)} style={{ width: "100%", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                        <td style={{ padding: "9px 10px", borderBottom: "1px solid #edf2f7" }}><input type="number" step="0.01" value={lak.prolazi} onChange={e => setLak({ ...lak, prolazi: parseFloat(e.target.value) || 0 })} placeholder="0" style={{ width: "100%", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                        <td style={{ padding: "9px 10px", borderBottom: "1px solid #edf2f7" }}><input type="number" step="0.01" value={lak.cena} onChange={e => setLak({ ...lak, cena: parseFloat(e.target.value) || 0 })} placeholder="6" style={{ width: "100%", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontWeight: 700 }} /></td>
                                        <td style={{ padding: "9px 10px", borderBottom: "1px solid #edf2f7", fontWeight: 900, color: "#059669" }}>{((Number(lak.utrosak) || ((sirina * metraza * (Number(lak.potrosnja) || 0)) / 1000)) * (Number(lak.prolazi) || 0)).toFixed(2)} kg</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ===== USLUGE ===== */}
                    <div style={{ background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                        <h3 style={{ fontSize: 12, fontWeight: 800, color: "#0d9488", marginBottom: 12, textTransform: "uppercase" }}>⚙️ USLUGE</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                            <div>
                                <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Kaširanje prolazi <span style={{ background: "#fef3c7", padding: "1px 4px", borderRadius: 3, fontSize: 9 }}>AUTO</span></label>
                                <input type="number" value={rezultati?.kasiranjeProlazi || 0} readOnly style={{ width: "100%", padding: "4px 6px", background: "#fef3c7", color: "#92400e", fontWeight: 700, border: "1px solid #fbbf24", borderRadius: 4, fontSize: 11, marginBottom: 3 }} />
                                <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Cena (€/m²)</label>
                                <input type="number" step="0.01" value={kasiranje.cena} onChange={e => setKasiranje({ cena: parseFloat(e.target.value) || 0 })} style={{ width: "100%", padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 11 }} />
                            </div>

                            <div>
                                <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Štampa kg <span style={{ background: "#fef3c7", padding: "1px 4px", borderRadius: 3, fontSize: 9 }}>AUTO</span></label>
                                <input type="number" value={rezultati?.stampaKg.toFixed(2) || 0} readOnly style={{ width: "100%", padding: "4px 6px", background: "#fef3c7", color: "#92400e", fontWeight: 700, border: "1px solid #fbbf24", borderRadius: 4, fontSize: 11, marginBottom: 3 }} />
                                <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Cena (€/kg)</label>
                                <input type="number" step="0.01" value={stampaCena} onChange={e => setStampaCena(parseFloat(e.target.value) || 0)} style={{ width: "100%", padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 11 }} />
                            </div>

                            <div>
                                <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Lakiranje kg <span style={{ background: "#fef3c7", padding: "1px 4px", borderRadius: 3, fontSize: 9 }}>AUTO</span></label>
                                <input type="number" value={rezultati?.lakiranjeKg.toFixed(2) || 0} readOnly style={{ width: "100%", padding: "4px 6px", background: "#fef3c7", color: "#92400e", fontWeight: 700, border: "1px solid #fbbf24", borderRadius: 4, fontSize: 11, marginBottom: 3 }} />
                                <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Cena (€/kg)</label>
                                <input type="number" step="0.01" value={lakiranjeCena} onChange={e => setLakiranjeCena(parseFloat(e.target.value) || 0)} style={{ width: "100%", padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 11 }} />
                            </div>

                            <div>
                                <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Transport (€/kg)</label>
                                <input type="number" step="0.01" value={transport} onChange={e => setTransport(parseFloat(e.target.value) || 0)} style={{ width: "100%", padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 11, marginBottom: 3 }} />
                                <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Pakovanje (€)</label>
                                <input type="number" step="0.01" value={pakovanje} onChange={e => setPakovanje(parseFloat(e.target.value) || 0)} style={{ width: "100%", padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 11 }} />
                            </div>
                        </div>
                    </div>

                    {/* ===== MARŽA ===== */}
                    {mod === "normal" ? (
                        <div style={{ background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                            <h3 style={{ fontSize: 12, fontWeight: 800, color: "#0d9488", marginBottom: 12, textTransform: "uppercase" }}>💰 MARŽA</h3>
                            <div style={{ maxWidth: 200 }}>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Marža (%)</label>
                                <input type="number" value={marza} onChange={e => setMarza(parseFloat(e.target.value) || 0)} style={{ width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 }} />
                            </div>
                        </div>
                    ) : (
                        <div style={{ background: "#dbeafe", border: "2px solid #3b82f6", borderRadius: 8, padding: 16 }}>
                            <h3 style={{ fontSize: 12, fontWeight: 800, color: "#1e40af", marginBottom: 12, textTransform: "uppercase" }}>🎯 ŽELJENA CENA (OBRNUTO)</h3>
                            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                                <button onClick={() => setReverseBaza("1000m")} style={{ flex: 1, padding: "8px 10px", borderRadius: 7, border: "1px solid #93c5fd", fontWeight: 800, fontSize: 12, cursor: "pointer", background: reverseBaza === "1000m" ? "#3b82f6" : "#fff", color: reverseBaza === "1000m" ? "#fff" : "#1e40af" }}>po 1000 m</button>
                                <button onClick={() => setReverseBaza("kg")} style={{ flex: 1, padding: "8px 10px", borderRadius: 7, border: "1px solid #93c5fd", fontWeight: 800, fontSize: 12, cursor: "pointer", background: reverseBaza === "kg" ? "#3b82f6" : "#fff", color: reverseBaza === "kg" ? "#fff" : "#1e40af" }}>po kg</button>
                            </div>
                            {reverseBaza === "kg" ? (
                                <div style={{ maxWidth: 220, marginBottom: 12 }}>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", display: "block", marginBottom: 4 }}>Željena cena (€/kg)</label>
                                    <input type="number" step="0.01" value={zeljenaCenaKg} onChange={e => setZeljenaCenaKg(parseFloat(e.target.value) || 0)} style={{ width: "100%", padding: "6px 8px", border: "2px solid #3b82f6", borderRadius: 4, fontSize: 12, fontWeight: 700 }} />
                                    <div style={{ fontSize: 10.5, color: "#1e40af", marginTop: 4 }}>= {((zeljenaCenaKg || 0) * (rezultati?.ukupnoKg || 0)).toFixed(2)} €/1000m · {((zeljenaCenaKg || 0) * (rezultati?.ukupnoKgNalog || 0)).toLocaleString('sr-RS', { minimumFractionDigits: 2 })} € / nalog</div>
                                </div>
                            ) : (
                                <div style={{ maxWidth: 220, marginBottom: 12 }}>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", display: "block", marginBottom: 4 }}>Željena cena (€/1000m)</label>
                                    <input type="number" value={zeljenaCena} onChange={e => setZeljenaCena(parseFloat(e.target.value) || 0)} style={{ width: "100%", padding: "6px 8px", border: "2px solid #3b82f6", borderRadius: 4, fontSize: 12, fontWeight: 700 }} />
                                    <div style={{ fontSize: 10.5, color: "#1e40af", marginTop: 4 }}>= {(rezultati?.cenaPoKgSaMarza || 0).toFixed(2)} €/kg</div>
                                </div>
                            )}
                            <div style={{ maxWidth: 220 }}>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Izračunata marža (%)</label>
                                <input type="number" value={rezultati?.izracunataMarza.toFixed(2) || 0} readOnly style={{ width: "100%", padding: "6px 8px", background: "#fef3c7", border: "2px solid #fbbf24", borderRadius: 4, fontSize: 12, fontWeight: 700, color: "#92400e" }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* DESNI PANEL - REZULTATI (iz dizajna) */}
                {rezultati && (
                    <div style={{ position: "sticky", top: 20, height: "fit-content" }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#047857", marginBottom: 12 }}>💰 Rezultati</div>

                        {/* GRUPA 1 */}
                        <div style={{ background: "white", padding: 16, borderRadius: 10, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Osnovna cena</div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{rezultati.osnovnaCena.toFixed(2)} €</div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
                                <div style={{ fontSize: 10, color: "#94a3b8" }}>Iznos naloga ({nalog})</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#475569" }}>{rezultati.osnovnaNalog.toLocaleString('sr-RS', { minimumFractionDigits: 2 })} €</div>
                            </div>
                        </div>

                        {/* GRUPA 2 */}
                        <div style={{ background: "white", padding: 16, borderRadius: 10, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Sa škartom ({skart}%)</div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{rezultati.cenaSaSkartom.toFixed(2)} €</div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
                                <div style={{ fontSize: 10, color: "#94a3b8" }}>Iznos naloga ({nalog})</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#475569" }}>{rezultati.skartNalog.toLocaleString('sr-RS', { minimumFractionDigits: 2 })} €</div>
                            </div>
                        </div>

                        {/* GRUPA 3 */}
                        <div style={{ background: "linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)", padding: 16, borderRadius: 10, marginBottom: 12, boxShadow: "0 2px 8px rgba(249,115,22,0.3)", border: "2px solid #f97316" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#9a3412" }}>+ Škart nestandardnih</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: "#9a3412" }}>{rezultati.skartNestandardnih.toFixed(2)} €</div>
                            </div>
                        </div>

                        {/* GRUPA 4 */}
                        <div style={{ background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)", padding: 20, borderRadius: 12, marginBottom: 12, boxShadow: "0 4px 12px rgba(16,185,129,0.3)", border: "3px solid #10b981" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#065f46" }}>Cena na 1000m</div>
                                <div style={{ fontSize: 28, fontWeight: 800, color: "#065f46" }}>{rezultati.cenaSaDodatkom.toFixed(2)} €</div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, paddingTop: 12, borderTop: "2px solid rgba(255,255,255,0.5)" }}>
                                <div>
                                    <div style={{ fontSize: 9, color: "#065f46", marginBottom: 2 }}>€/kg</div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: "#047857" }}>{rezultati.cenaPoKg.toFixed(2)}</div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 9, color: "#065f46", marginBottom: 2 }}>Iznos ({nalog})</div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: "#047857" }}>{rezultati.cenaSaDodatkomNalog.toLocaleString('sr-RS', { minimumFractionDigits: 2 })} €</div>
                                </div>
                            </div>
                        </div>

                        {/* GRUPA 5 - KONAČNA */}
                        <div style={{ background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", padding: 24, borderRadius: 12, marginBottom: 12, boxShadow: "0 6px 16px rgba(251,191,36,0.4)", border: "3px solid #fbbf24" }}>
                            <div style={{ textAlign: "center", marginBottom: 16 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>KONAČNA CENA</div>
                                <div style={{ fontSize: 42, fontWeight: 800, color: "#92400e", lineHeight: 1 }}>{rezultati.konacnaCena.toFixed(2)}</div>
                                <div style={{ fontSize: 14, color: "#92400e", marginTop: 4 }}>€ / 1000m</div>
                            </div>

                            <div style={{ background: "rgba(255,255,255,0.5)", padding: 10, borderRadius: 8, marginBottom: 12 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ fontSize: 11, color: "#92400e" }}>Mat. trošak po kg</div>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: "#92400e" }}>{rezultati.cenaPoKgSaMarza.toFixed(2)} €/kg</div>
                                </div>
                            </div>

                            <div style={{ background: "rgba(255,255,255,0.6)", padding: 12, borderRadius: 8, textAlign: "center" }}>
                                <div style={{ fontSize: 10, color: "#92400e", marginBottom: 4 }}>UKUPAN NALOG</div>
                                <div style={{ fontSize: 32, fontWeight: 800, color: "#92400e" }}>{rezultati.konacnaNalog.toLocaleString('sr-RS', { minimumFractionDigits: 2 })} €</div>
                                <div style={{ fontSize: 9, color: "#92400e", marginTop: 2 }}>{nalog} x 1000m</div>
                            </div>
                        </div>

                        {/* GRUPA 6 - MATERIJALI */}
                        <div style={{ background: "white", padding: 16, borderRadius: 10, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#0d9488", marginBottom: 12, textTransform: "uppercase" }}>📦 Materijali (kg)</div>

                            {materijali.map((mat, idx) => (
                                <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9", opacity: efektivnaTezina(mat) > 0 ? 1 : 0.5 }}>
                                    <span style={{ fontSize: 11, color: "#64748b" }}>Materijal {String.fromCharCode(65 + idx)}</span>
                                    <strong style={{ fontSize: 12, color: "#0f172a" }}>{rezultati.materijalKg[idx] > 0 ? (rezultati.materijalKg[idx] * nalog).toFixed(2) : "#N/A"}</strong>
                                </div>
                            ))}

                            <div style={{ background: "#f0f9ff", padding: 8, borderRadius: 6, marginTop: 8 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                                    <span style={{ fontSize: 10, color: "#1e40af" }}>Utrošak lepak</span>
                                    <strong style={{ fontSize: 11, color: "#1e40af" }}>{(rezultati.ukupnoLepakKg * nalog).toFixed(2)} kg</strong>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                                    <span style={{ fontSize: 10, color: "#1e40af" }}>Utrošak laka</span>
                                    <strong style={{ fontSize: 11, color: "#1e40af" }}>{(rezultati.lakKg * nalog).toFixed(2)} kg</strong>
                                </div>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 0 0", marginTop: 8, borderTop: "2px solid #14b8a6" }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#0d9488" }}>UKUPNO kg mat</span>
                                <strong style={{ fontSize: 14, fontWeight: 800, color: "#0d9488" }}>{rezultati.ukupnoKgNalog.toLocaleString('sr-RS', { minimumFractionDigits: 2 })}</strong>
                            </div>

                            <div style={{ background: "#dbeafe", padding: 10, borderRadius: 6, marginTop: 12 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div>
                                        <div style={{ fontSize: 9, color: "#1e40af", textTransform: "uppercase" }}>Usluga dorade</div>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: "#1e40af", marginTop: 2 }}>€/kg - 1000m</div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontSize: 9, color: "#1e40af" }}>Ukupno</div>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: "#1e40af" }}>{(dorada * rezultati.ukupnoKg).toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* GRUPA 7 - ŠKART DETALJ */}
                        <div style={{ background: "#fff7ed", padding: 14, borderRadius: 10, border: "2px solid #fb923c" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#9a3412", marginBottom: 10, textTransform: "uppercase" }}>🔶 Škart nestandardnih (detalj)</div>

                            {materijali.map((mat, idx) => {
                                const skart = rezultati.skartNestandardnihDetaljno[idx];
                                if (!skart) return null;
                                return (
                                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 10 }}>
                                        <span style={{ color: "#9a3412" }}>Mat. {String.fromCharCode(65 + idx)} ({mat.sirina}mm)</span>
                                        <strong style={{ color: "#9a3412" }}>{skart.toFixed(3)} €</strong>
                                    </div>
                                );
                            })}

                            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, marginTop: 6, borderTop: "1px solid #fed7aa", fontSize: 11, fontWeight: 700 }}>
                                <span style={{ color: "#9a3412" }}>Ukupno/1000m</span>
                                <strong style={{ color: "#9a3412" }}>{rezultati.skartNestandardnih.toFixed(3)} €</strong>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4, fontSize: 9 }}>
                                <span style={{ color: "#9a3412" }}>Na nalog ({nalog})</span>
                                <strong style={{ color: "#9a3412" }}>{rezultati.skartNestandardnihNalog.toFixed(2)} €</strong>
                            </div>
                        </div>

                        {/* POTREBNO ZA NALOG (kg + metri, tačno) */}
                        <div style={{ background: "#ecfeff", padding: 14, borderRadius: 10, border: "2px solid #06b6d4", marginTop: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "#155e75", marginBottom: 10, textTransform: "uppercase" }}>🛒 Potrebno za nalog ({nalog} × 1000m)</div>

                            {materijali.map((mat, idx) => {
                                const kg = (rezultati.materijalKg[idx] || 0) * nalog;
                                if (!kg) return null;
                                const naziv = (mat.tip || mat.vrsta || mat.materijal || "Materijal") + (mat.debljina ? ` ${mat.debljina}µ` : "");
                                return (
                                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #cffafe" }}>
                                        <span style={{ fontSize: 12, color: "#0e7490", fontWeight: 600 }}>{naziv}</span>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: "#155e75" }}>{kg.toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
                                    </div>
                                );
                            })}

                            {(() => {
                                const lakKgN = (rezultati.lakKg || 0) * nalog;
                                const lepakKgN = Math.max(0, (rezultati.ukupnoLepakKg || 0) - (rezultati.lakKg || 0)) * nalog;
                                return (
                                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #cffafe" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
                                            <span style={{ color: "#0e7490" }}>Lepak</span>
                                            <strong style={{ color: "#155e75" }}>{lepakKgN.toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</strong>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
                                            <span style={{ color: "#0e7490" }}>Lak</span>
                                            <strong style={{ color: "#155e75" }}>{lakKgN.toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</strong>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* BUTTON */}
                        <div style={{ marginTop: 20 }}>
                            <button onClick={sacuvaj} style={{ width: "100%", padding: "14px 20px", background: "#0d9488", color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                                💾 Sačuvaj kalkulaciju
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}


// V46_MATERIAL_MASTER_EVERYWHERE: ovaj fajl je pripremljen za MaterialSelectorPRO / MaterialText.


// V47_MATERIAL_SELECTOR_REPLACEMENT: stari unos materijala treba fizički zameniti MaterialSelectorPRO / MaterialLayerRowPRO.
