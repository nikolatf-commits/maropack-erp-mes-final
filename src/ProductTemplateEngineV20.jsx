import React, { useEffect, useMemo, useState } from "react";
import { getVrsteMaterijala, getOznakeZaVrstu, getDebljineZaMaterijal, getKoeficijent, calculateGm2, buildMaterialName, upsertMaterialToDb, masterHasCombo } from "./data/materialMaster.js";
import { RolnaDizajnEditor, PerforacijaEditor } from "./components/RolnaPerfViews.jsx";
import { pantoneHex, pantoneSwatch, PANTONE_KEYS } from "./data/pantone.js";
import { supabase } from "./supabase.js";
import spulnaTechnicalDrawing from "./assets/spulna_technical_drawing.png";
import CrtezKese, { kesaToConfig, TIPOVI } from "./CrtezKese.jsx";
import { KESA_OPCIJE, FOOD_TEXT, POS_LBL, toCrtezKesa, KESA_GRUPE, KESA_TIP_PRESET } from "./kesaOpcije.js";
import { KUTIJE, KUTIJA_LBL, proveriKutiju, predloziKutiju, kutijaPoKljucu, poPaletiZa } from "./kutije.js";
import { useLang } from "./LanguageProvider.jsx";

// =====================================================================
//  Živo učitavanje materijala iz material_master + proizvođača iz magacin
//  Keš na nivou modula: učita se JEDNOM, deli ga svaki MaterialInlineSelector.
//  Ako tabela fali/prazna -> selektor pada nazad na statički materialMaster.js
// =====================================================================
let MM_CACHE = null;          // { materijali: [...], dobavljaci: [...] }
let MM_LOADING = false;
let MM_ERROR = null;
const MM_SUBS = new Set();
function mmNotify() { MM_SUBS.forEach((fn) => fn()); }

// Normalizuje red iz material_master u jedinstven oblik (otporno na imena kolona)
function mmNormalize(r) {
    return {
        vrsta: r.vrsta ?? r.tip ?? "",
        pod_vrsta: r.pod_vrsta ?? r.podvrsta ?? r.pod_vrsta_materijala ?? "",
        oznaka: r.oznaka_materijala ?? r.oznaka ?? r.grade ?? "",
        debljina: r.debljina ?? r.deb ?? r.thickness ?? "",
        gm2: r.gm2 ?? r.gsm ?? r.tezina ?? r.gramaza ?? null,
        koeficijent: r.koeficijent ?? r.koef ?? null,
    };
}

async function mmLoad() {
    if (MM_CACHE || MM_LOADING) return;
    MM_LOADING = true; mmNotify();
    try {
        const { data: mm, error: e1 } = await supabase.from("material_master").select("*");
        if (e1) throw e1;
        let dobavljaci = [];
        try {
            const { data: mag } = await supabase.from("magacin").select("dobavljac");
            dobavljaci = Array.from(new Set((mag || []).map((r) => r.dobavljac).filter(Boolean).map((s) => String(s).trim())))
                .sort((a, b) => a.localeCompare(b, "sr"));
        } catch (_) { /* magacin nije obavezan za izbor materijala */ }
        MM_CACHE = { materijali: (mm || []).filter(r => r.aktivan !== false).map(mmNormalize), dobavljaci };
    } catch (e) {
        MM_ERROR = e?.message || String(e);
        MM_CACHE = { materijali: [], dobavljaci: [] };
        console.warn("material_master/magacin učitavanje:", MM_ERROR);
    } finally {
        MM_LOADING = false; mmNotify();
    }
}

function useMaterialMaster() {
    const [, force] = useState(0);
    useEffect(() => {
        const fn = () => force((x) => x + 1);
        MM_SUBS.add(fn);
        mmLoad();
        return () => { MM_SUBS.delete(fn); };
    }, []);
    return {
        materijali: MM_CACHE?.materijali || [],
        dobavljaci: MM_CACHE?.dobavljaci || [],
        loading: MM_LOADING && !MM_CACHE,
        error: MM_ERROR,
    };
}

// jedinstvene vrednosti po koloni, filtrirane prethodnim izborima (kaskada)
function mmDistinct(lista, kolona, filter = {}) {
    const skup = new Set();
    for (const r of lista) {
        let ok = true;
        for (const k in filter) {
            if (filter[k] && String(r[k] ?? "") !== String(filter[k])) { ok = false; break; }
        }
        if (ok && r[kolona] != null && String(r[kolona]).trim() !== "") skup.add(String(r[kolona]).trim());
    }
    return Array.from(skup).sort((a, b) => a.localeCompare(b, "sr", { numeric: true }));
}

// =====================================================================
//  Predlog rolni iz magacina — zajednička logika (auto-predlog + ručni spisak)
//  Uparuje po: vrsta, pod vrsta, oznaka, debljina (±3). Rangira po FIFO.
// =====================================================================
function txtEq(a, b) { return String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase(); }
function rolnaPodVrsta(r) { return r.pod_vrsta ?? r.podvrsta ?? r.pod_vrsta_materijala ?? ""; }
function rolnaOznaka(r) { return r.oznaka_materijala ?? r.oznaka ?? r.grade ?? ""; }

// Robustan parser datuma — podržava ISO (2026-01-05) i srpski (05.01.2026), uvek sa punom godinom
function parseDatum(d) {
    if (!d) return NaN;
    const s = String(d).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);        // ISO YYYY-MM-DD
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);    // DD.MM.YYYY ili DD/MM/YYYY
    if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
    const t = Date.parse(s);
    return Number.isNaN(t) ? NaN : t;
}

// Datum za FIFO (najstarije prvo). Prvo GODINA PROIZVODNJE (isti datum koji se prikazuje na listi),
// pa prijem/ulaz kao fallback; ako datuma nema, LOT/br_rolne.
function rolnaDatum(r) {
    const d = r.datum_proizvodnje ?? r.datum_prijema ?? r.datum_ulaza ?? r.datum_ulaza_rolne ?? r.created_at ?? r.datum ?? null;
    const t = parseDatum(d);
    if (!Number.isNaN(t)) return t;
    const n = parseInt(String(r.lot ?? r.br_rolne ?? "").replace(/\D/g, ""), 10);
    return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

function rolnaMetraza(r) { return Number(r.metraza_ost ?? r.metraza ?? 0) || 0; }
// Slobodni metri = ukupno na rolni − već rezervisano (za delimičnu rezervaciju).
function slobodnoM(r) { return Math.max(0, rolnaMetraza(r) - (Number(r.rezervisano) || 0)); }

function rangirajRolne(rolne, layer, opts = {}) {
    const { ideal = 0, samoDostupne = false, potrebnoM = 0, sirinaTolerancija = 1, ignoreWidth = false } = opts;
    // Rolna je „dostupna" ako status NIJE tvrdo zauzet (utrošena/prodata/otpisana…) I ima slobodnih metara.
    // „Rezervisano"/„Delimično rezervisano" NISU tvrdo zauzeti — dok ima slobodnih m, rolna se nudi.
    const ZAUZETO = /utros|utroš|iskoris|iskorišć|prodat|isporu|otpis|storn|obrisan|arhiv|zavrsen|završen|proizvodnj|u proizv/i;
    const base = String(layer.vrsta || layer.material || layer.materijal || layer.tip || "").split(" ")[0].toUpperCase();
    const deb = Number(String(layer.debljina || layer.deb || "").replace(",", ".")) || 0;
    const podv = String(layer.pod_vrsta || "").trim();
    const ozn = String(layer.oznaka_materijala || layer.oznaka || "").trim();
    const proizv = String(layer.proizvodjac || "").trim();

    return (rolne || [])
        .filter(r => {
            const okT = String(r.vrsta || r.tip || "").toUpperCase().startsWith(base);
            const okD = !deb || !r.deb || Math.abs(Number(r.deb) - deb) <= 3;
            const okS = !samoDostupne || !ZAUZETO.test(String(r.status || ""));
            // Mora imati slobodnih metara (metraza_ost − rezervisano).
            const okRez = !samoDostupne || slobodnoM(r) > 0;
            // Pod vrsta i oznaka: uparuj kad rolna ima tu vrednost; ako je nema, ne odbacuj.
            const rp = rolnaPodVrsta(r), ro = rolnaOznaka(r);
            const okPV = !podv || !String(rp).trim() || txtEq(rp, podv);
            const okOZ = !ozn || !String(ro).trim() || txtEq(ro, ozn);
            // Širina: rolna ne sme biti uža od idealne (osim kad ignoreWidth — tada se uže prikazuju, ali rangirane niže).
            const okSir = ignoreWidth || !ideal || (Number(r.sirina) || 0) >= (ideal - sirinaTolerancija);
            // Proizvođač: ako je unet u sloju → SAMO taj proizvođač; ako nije unet → svi.
            const okProiz = !proizv || txtEq(r.dobavljac, proizv);
            return okT && okD && okS && okRez && okPV && okOZ && okSir && okProiz;
        })
        .sort((a, b) => {
            // 0) kad prikazujemo i uže: dovoljno široke (>= idealne) idu prve
            if (ignoreWidth && ideal) {
                const wa = (Number(a.sirina) || 0) >= (ideal - sirinaTolerancija) ? 0 : 1;
                const wb = (Number(b.sirina) || 0) >= (ideal - sirinaTolerancija) ? 0 : 1;
                if (wa !== wb) return wa - wb;
            }
            // 1) ŠIRINA prvo: rolne iste/najbliže idealnoj (i tik iznad) → pa progresivno šire.
            //    Grupišemo u trake od 25 mm da FIFO odlučuje UNUTAR iste širine.
            if (ideal) {
                const BAND = 25;
                const ba = Math.floor(Math.max(0, (Number(a.sirina) || 0) - ideal) / BAND);
                const bb = Math.floor(Math.max(0, (Number(b.sirina) || 0) - ideal) / BAND);
                if (ba !== bb) return ba - bb;   // uža/bliža idealnoj traka prva, šire kasnije
            }
            // 2) FIFO — najstarija rolna prva (unutar iste širinske trake)
            const da = rolnaDatum(a), db = rolnaDatum(b);
            if (da !== db) return da - db;
            // 3) najmanje otpada — najbliža (ali ne uža) idealnoj širini
            if (ideal) {
                const sa = Math.abs(Number(a.sirina) - ideal), sb = Math.abs(Number(b.sirina) - ideal);
                if (sa !== sb) return sa - sb;
            }
            // 3) rolne koje same pokrivaju porudžbinu malo napred (po slobodnim metrima)
            if (potrebnoM) {
                const ea = slobodnoM(a) >= potrebnoM ? 0 : 1;
                const eb = slobodnoM(b) >= potrebnoM ? 0 : 1;
                if (ea !== eb) return ea - eb;
            }
            // 4) prednost istom proizvođaču
            if (proizv) {
                const ma = txtEq(a.dobavljac, proizv) ? 0 : 1, mb = txtEq(b.dobavljac, proizv) ? 0 : 1;
                if (ma !== mb) return ma - mb;
            }
            return 0;
        });
}

// Skupi KOMBINACIJU rolni čiji zbir metraže pokriva potrebu.
// Redosled trošenja: najmanja metraža prvo (reslovi), pa FIFO, pa najbliža širina.
function alocirajRolne(rolne, layer, opts = {}) {
    const { ideal = 0, potrebnoM = 0 } = opts;
    // Isti skup kao padajuća lista (samoDostupne: false) — da Auto kombinuje sve što vidiš u listi.
    const matched = rangirajRolne(rolne, layer, { ideal, samoDostupne: false, potrebnoM });
    const redosled = [...matched].sort((a, b) => {
        if (ideal) {                                   // 0) ŠIRINA prva — bliža idealnoj (traka 25mm) pre širih
            const BAND = 25;
            const ba = Math.floor(Math.max(0, (Number(a.sirina) || 0) - ideal) / BAND);
            const bb = Math.floor(Math.max(0, (Number(b.sirina) || 0) - ideal) / BAND);
            if (ba !== bb) return ba - bb;
        }
        const ma = rolnaMetraza(a), mb = rolnaMetraza(b);
        const da = rolnaDatum(a), db = rolnaDatum(b);
        if (da !== db) return da - db;                 // 1) FIFO — najstarija prva (unutar iste širine)
        if (ma !== mb) return ma - mb;                 // 2) pa reslovi (manja metraža) — kad je isti datum
        if (ideal) {                                   // 3) najbliža (ne uža) širina
            const sa = Math.abs(Number(a.sirina) - ideal), sb = Math.abs(Number(b.sirina) - ideal);
            if (sa !== sb) return sa - sb;
        }
        return 0;
    });
    const izabrane = [];
    let zbir = 0;
    for (const r of redosled) {
        izabrane.push(r);
        zbir += rolnaMetraza(r);
        if (!potrebnoM) break;          // bez poznate potrebe — samo predloži prvu
        if (zbir >= potrebnoM) break;   // pokrivena potreba
    }
    return izabrane;
}

const BLUE = "#2446b8";
const GREEN = "#059669";
const ORANGE = "#f59e0b";
const RED = "#dc2626";
const SMART_ENGINE_MASTER_BLOCK = true;
const SMART_ENGINE_AUTO_REZANJE = true;



const KASIRANJE_VALJCI_MM = [490, 610, 640, 670, 740, 860, 890, 980, 1190, 1285, 1570];

function nnum(v) {
    return Number(String(v ?? "").replace("mm", "").replace("µ", "").replace(",", ".").trim()) || 0;
}

function predloziValjakKasiranja(idealnaSirina) {
    const ideal = nnum(idealnaSirina);
    if (!ideal) return null;
    const kandidati = KASIRANJE_VALJCI_MM.filter(v => v <= ideal).sort((a, b) => b - a);
    return kandidati[0] || null;
}

function izracunajRezanjeTemplate(rezanje = {}, idealnaSirinaMaterijala = "") {
    const stvarnaSirina = nnum(rezanje.sirinaMaterijala) || nnum(idealnaSirinaMaterijala);
    const sirinaTrake = nnum(rezanje.sirinaTrake);
    const brojTraka = Math.max(0, Math.floor(nnum(rezanje.brojTraka)));
    const rucneTrake = String(rezanje.sirineTraka || "")
        .split(",")
        .map(x => nnum(x))
        .filter(Boolean);
    const trake = rucneTrake.length ? rucneTrake : Array.from({ length: brojTraka }, () => sirinaTrake).filter(Boolean);
    const ukupnoTrake = trake.reduce((a, b) => a + b, 0);
    const ukupniOtpad = Math.max(0, stvarnaSirina - ukupnoTrake);
    const otpadLevo = ukupniOtpad / 2;
    const otpadDesno = ukupniOtpad / 2;
    const prekoSirine = ukupnoTrake > stvarnaSirina;
    const iskoriscenje = stvarnaSirina ? Math.min(100, (ukupnoTrake / stvarnaSirina) * 100) : 0;
    const predlogValjka = predloziValjakKasiranja(nnum(idealnaSirinaMaterijala) || stvarnaSirina);
    return { stvarnaSirina, sirinaTrake, brojTraka, trake, ukupnoTrake, ukupniOtpad, otpadLevo, otpadDesno, prekoSirine, iskoriscenje, predlogValjka };
}

const emptyLayer = { vrsta: "", pod_vrsta: "", oznaka_materijala: "", proizvodjac: "", material: "", debljina: "", koeficijent: "", gm2: "", sirina: "", kg: "", metara: "", cena: "" };

const kesaOptions = [
    { key: "duplofan", label: "Duplofan traka", price: "0.5€" },
    { key: "eurozumba", label: "Eurozumba", price: "1.5€" },
    { key: "okrugla_zumba", label: "Okrugla zumba", price: "0.8€" },
    { key: "kosa_klapna", label: "Kosa klapna", price: "0.5€" },
    { key: "anleger", label: "Anleger", price: "2€" },
    { key: "utor", label: "Utor", price: "" },
    { key: "stampa", label: "Štampa", price: "1.2€" },
    { key: "poprecna_perf", label: "Poprečna perf.", price: "" },
    { key: "bocni_var", label: "Bočni var", price: "1€" },
    { key: "kontinualni_var", label: "Kontinualni var", price: "1€" },
    { key: "poprecni_var", label: "Poprečni var", price: "1€" },
    { key: "falta_dno", label: "Falta na dnu", price: "1.5€" },
    { key: "var_dno", label: "Var na dnu", price: "1€" },
    { key: "otvor_dno", label: "Otvor na dnu", price: "2€" },
    { key: "pakovanje_trn", label: "Pakovanje na trnu", price: "" },
    { key: "busene_rupe", label: "Bušene rupe", price: "5€" },
    { key: "adh_traka", label: "ADH traka", price: "1€" },
    { key: "ojacanje", label: "Ojačanje", price: "" },
    { key: "toplotni_var", label: "Termo/toplotni var", price: "" },
    { key: "mikroperforacija", label: "Mikroperforacija", price: "" }
];

const defaultForm = {
    type: "folija",
    naziv: "",
    kupac: "",
    sifra: "",
    napomena: "",
    porucenaKolicina: "",
    jedinicaUnosa: "m",          // "m" = metri gotove trake | "kom" | "kg"
    dimenzijaSirina: "",
    dimenzijaDuzina: "",
    idealnaSirinaMaterijala: "",
    folija: {
        datumProizvodnje: "",
        rokIsporuke: "",
        status: "u_pripremi",
        dimenzija: "",
        layers: [
            { material: "", debljina: "", sirina: "", kg: "", metara: "" },
            { material: "", debljina: "", sirina: "", kg: "", metara: "" },
            { material: "", debljina: "", sirina: "", kg: "", metara: "" }
        ],
        stampa: {
            masina: "",
            strana: "",
            obimValjka: "",
            brojBoja: "",
            klise: "",
            precnikHilzne: "",
            smerOdmotavanja: "",
            stamparija: "",
            boje: []
        },
        kasiranje: {
            tipLepka: "",
            odnosLepka: "",
            nanosLepka: "",
            brojKasiranja: "",
            materijalABC: "",
            napomena: ""
        },
        rezanje: {
            sirinaMaterijala: "",
            sirinaTrake: "",
            brojTraka: "",
            precnikRolne: "",
            duzinaRolne: "",
            dorada: "",
            smerGP: "",
            sirineTraka: ""
        },
        kpdf: {
            enabled: false,
            tip: "KPDF",
            odnos: "30/60",
            razmak: "",
            sirina: "",
            pozicija: "",
            smer: "poprečno",
            napomena: ""
        },
        finalRoll: {
            enabled: true,
            prikaz: "finalna_rolna",
            smerOdmotavanja: "Na glavu",
            stampaStrana: "Spolja",
            hilzna: "",
            precnik: "",
            duzina: "",
            oznaka: ""
        }
    },
    kesa: {
        naziv: "",
        kolicina: "10000",
        skart: "10",
        datum: "",
        marza: "30",
        sirina: "200",
        duzina: "400",
        klapna: "50",
        falta: "50",
        takt: "50",
        ban: "1",
        tolerancija: "±10%",
        grafika: "Novi posao",
        layers: [{ material: "OPP", debljina: "15", tezina: "27.3", cena: "2.9" }],
        tipKese: "flach",
        viewMode: "front",
        zoomLevel: "100",
        options: {},
        positions: {},
        transportKg: "0.35",
        pakovanje: "U bunt ide 200 kom"
    },
    spulna: {
        naziv: "",
        materijal: "Papir silikonizirani 60gr",
        layers: [{ vrsta: "PAPIR", oznaka: "SILIKON", debljina: "60", koeficijent: "1.00", gm2: "60", sirina: "360", cena: "" }],
        // narudžbina
        kolicina: "",
        jedinicaUnosa: "m2",        // m2 | kom (špulni) | kg | m (trake)
        skart: "0",
        // materijal / strane
        sideA: "Silikon",
        sideB: "Papir",
        // dimenzije
        W: "25",
        Da: "158",
        Di: "152",
        C: "0",
        G: "0",
        T: "180",
        D: "380",
        sirinaMaterijala: "360",
        maxMetara: "8000",
        sirinaHilzne: "300",
        smer: "Gap winding",
        // pakovanje
        kutija: "",
        rolniPoPaleti: "18",
        napomena: ""
    }
};

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

// ─────────────────────────────────────────────────────────────────────────────
// ŠPULNA — obračun. Isti lanac kao u nalogu (NalogLayoutPRO.spulnaD),
// proveren protiv Excel naloga 0150/2026 (Lil Packaging, trake 20 mm):
//   156 špulni × 20.000 m = 3.120.000 m  →  × 0,020 m (W) = 62.400 m²
//   62.400 m² × 60 g/m² = 3.744 kg   ·   480 ÷ 20 = 24 trake  →  matična 130.000 m
// ─────────────────────────────────────────────────────────────────────────────
function spulnaObracun(form) {
    const N_ = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
    const p = form.spulna || {};
    const W = N_(p.W);
    const sirMat = N_(p.sirinaMaterijala) || N_(form.idealnaSirinaMaterijala);
    const maxM = N_(p.maxMetara);
    const gm2 = (p.layers || []).reduce((a, l) => a + (N_(l.gm2) || N_(l.debljina) * N_(l.koeficijent)), 0);
    const skart = N_(p.skart);
    const jed = p.jedinicaUnosa || "m2";
    const v = N_(p.kolicina);
    const greske = [];

    let m2 = 0;
    if (jed === "kom") m2 = v * maxM * (W / 1000);
    else if (jed === "kg") m2 = gm2 > 0 ? (v * 1000) / gm2 : 0;
    else if (jed === "m") m2 = v * (W / 1000);
    else m2 = v;

    const m2Rad = m2 * (1 + skart / 100);
    const ukupnoM = W > 0 ? m2Rad / (W / 1000) : 0;
    const spulni = maxM > 0 ? Math.ceil(ukupnoM / maxM) : 0;
    const N = W > 0 ? Math.max(1, Math.floor(sirMat / W)) : 1;
    const metriMat = N > 0 ? ukupnoM / N : ukupnoM;
    const kg = m2Rad * gm2 / 1000;
    const poPaleti = N_(p.rolniPoPaleti) || 18;

    if (!W) greske.push("Nema širine trake (W).");
    if (!maxM) greske.push("Nema max metara na špulni.");
    if (!gm2) greske.push("Slojevi nemaju g/m².");
    if (!sirMat) greske.push("Nema širine materijala.");
    if (W && sirMat && N * W > sirMat) greske.push(N + " × " + W + " mm ne staje u " + sirMat + " mm.");

    return {
        W, sirMat, maxM, gm2, skart, jed,
        m2: Math.round(m2), m2Rad: Math.round(m2Rad),
        ukupnoM: Math.round(ukupnoM),
        spulni, hilzne: spulni, kutije: spulni,
        palete: poPaleti > 0 ? spulni / poPaleti : 0,
        N, otpad: Math.max(0, sirMat - N * W),
        metriMat: Math.round(metriMat),
        kg: +kg.toFixed(1),
        slojevi: (p.layers || []).map((l, i) => {
            const g = N_(l.gm2) || N_(l.debljina) * N_(l.koeficijent);
            return {
                naziv: l.oznaka || l.vrsta || ("Sloj " + (i + 1)),
                gm2: g,
                kg: +(m2Rad * g / 1000).toFixed(1),
                metara: Math.ceil(metriMat),
            };
        }),
        greske,
    };
}
// Metraža materijala za nalog: kesa = kom × (dužina+klapna+falta) × (1+škart%); folija/špulna = poručena (m) × 1.05
function orderMetraze(f) {
    const n = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
    if (f.type === "kesa") {
        const k = f.kesa || {};
        const duzM = (n(k.duzina) + n(k.klapna) + n(k.falta)) / 1000;   // korak, m
        const kom = n(k.kolicina), skart = n(k.skart);
        // BAN = broj traka po sirini. Rezanje NE skracuje duzinu - multiplicira je po traci,
        // pa je maticna rolna BAN puta KRACA. Ranije se nije delilo -> trazilo se BAN x vise materijala.
        const ban = Math.max(1, n(k.ban) || 1);
        const mTrake = kom * duzM;            // metri gotove trake
        const mMat = mTrake / ban;            // metri maticne rolne  <-- ispravka
        return {
            kol: Math.round(mMat),
            kolPlus: Math.ceil(mMat * (1 + skart / 100)),
            kom, duzM, ban,
            mTrake: Math.round(mTrake),
        };
    }
    if (f.type === "folija") {
        // Ne cita vise sirovu porucenaKolicina kao metre! Ide kroz folijaObracun,
        // koji postuje jedinicu unosa (kom/kg/m) i BROJ TRAKA.
        // kol / kolPlus su METRI MATICNE ROLNE - to je ono sto se skida iz magacina.
        const ob = folijaObracun(f);
        return {
            kol: ob.metriMat, kolPlus: ob.metriMatPlus,
            kom: ob.kom, duzM: ob.korakM,
            ban: ob.N, mTrake: ob.metriTrake,
            slojevi: ob.slojevi, kgUkupno: ob.kgUkupno,
        };
    }
    if (f.type === "spulna") {
        const ob = spulnaObracun(f);
        // kol / kolPlus = METRI MATIČNE ROLNE — to se skida iz magacina.
        return {
            kol: ob.metriMat, kolPlus: ob.metriMat,
            kom: ob.spulni, duzM: 0,
            ban: ob.N, mTrake: ob.ukupnoM,
            slojevi: ob.slojevi, kgUkupno: ob.kg,
        };
    }
    const kol = n(f.porucenaKolicina);
    return { kol, kolPlus: Math.ceil(kol * 1.05), kom: 0, duzM: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// FOLIJA — jedan izvor istine. Unos može biti KOM, KG ili M (metri gotove trake).
// Ključno pravilo: rezanje NE skraćuje dužinu — MULTIPLICIRA je po traci.
//   metri trake         = kom × korak
//   metri MATIČNE rolne = metri trake / N        ← ovo je ranije nedostajalo
//   m²                  = metri matične × ulazna širina
//   kg                  = m² × g/m²
// ─────────────────────────────────────────────────────────────────────────────
function folijaObracun(form, skartPct = 5) {
    const N_ = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
    const layers = (form.folija?.layers || []).filter(l => N_(l.gm2 ?? l.tezina ?? l.tezinaGm2) > 0 || (N_(l.debljina) && N_(l.koeficijent)));
    const rez = form.folija?.rezanje || {};

    const sirMatMm = N_(rez.sirinaMaterijala) || N_(form.idealnaSirinaMaterijala);
    const trakaMm = N_(rez.sirinaTrake) || N_(form.dimenzijaSirina);
    const korakM = N_(form.dimenzijaDuzina) / 1000;                 // dužina jednog komada duž trake
    const sirMatM = sirMatMm / 1000;

    // Broj traka: ručni override ima prednost, inače auto po širini
    const rucno = Math.floor(N_(rez.brojTrakaOverride));
    const N = rucno > 0 ? rucno
        : (sirMatMm && trakaMm ? Math.max(1, Math.floor(sirMatMm / trakaMm)) : 1);

    const totalGm2 = layers.reduce((a, l) => {
        const g = N_(l.gm2 ?? l.tezina ?? l.tezinaGm2);
        return a + (g || N_(l.debljina) * N_(l.koeficijent));
    }, 0);

    const jed = form.jedinicaUnosa || "m";
    const v = N_(form.porucenaKolicina);
    const greske = [];

    let kom = 0, metriTrake = 0, metriMat = 0;

    if (jed === "kom") {
        kom = v;
        metriTrake = kom * korakM;
        metriMat = N ? metriTrake / N : 0;
        if (!korakM) greske.push("Za unos u KOM treba dimenzija — dužina (mm).");
    } else if (jed === "kg") {
        const m2 = totalGm2 > 0 ? (v * 1000) / totalGm2 : 0;
        metriMat = sirMatM > 0 ? m2 / sirMatM : 0;
        metriTrake = metriMat * N;
        kom = korakM > 0 ? metriTrake / korakM : 0;
        if (!totalGm2) greske.push("Za unos u KG slojevi moraju imati g/m².");
        if (!sirMatM) greske.push("Za unos u KG treba idealna širina materijala.");
    } else { // "m" — metri GOTOVE TRAKE (ono što kupac poručuje)
        metriTrake = v;
        metriMat = N ? metriTrake / N : 0;
        kom = korakM > 0 ? metriTrake / korakM : 0;
    }

    const f = 1 + (skartPct / 100);
    const metriMatPlus = metriMat * f;                              // ← ovo se skida iz magacina
    const m2Plus = metriMatPlus * sirMatM;

    if (trakaMm && sirMatMm && N * trakaMm > sirMatMm) {
        greske.push(`${N} × ${trakaMm} mm = ${N * trakaMm} mm ne staje u ${sirMatMm} mm.`);
    }

    const slojevi = layers.map((l, i) => {
        const g = N_(l.gm2 ?? l.tezina ?? l.tezinaGm2) || (N_(l.debljina) * N_(l.koeficijent));
        return {
            naziv: l.oznaka || l.komercijalnaOznaka || l.material || l.oznaka_materijala || l.vrsta || `Sloj ${i + 1}`,
            gm2: g,
            metara: Math.ceil(metriMatPlus),
            kg: +(g * sirMatM * metriMatPlus / 1000).toFixed(1),
        };
    });

    return {
        N, korakM, sirMatMm, trakaMm, totalGm2, skartPct,
        otpadMm: Math.max(0, sirMatMm - N * trakaMm),
        kom: Math.round(kom),
        komPoTraci: N ? Math.round(kom / N) : 0,
        metriTrake: Math.ceil(metriTrake),
        metriMat: Math.ceil(metriMat),
        metriMatPlus: Math.ceil(metriMatPlus),
        m2: +m2Plus.toFixed(1),
        slojevi,
        kgUkupno: +slojevi.reduce((a, s) => a + s.kg, 0).toFixed(1),
        greske,
    };
}
function fieldStyle() { return { width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, background: "#fff" }; }
function labelStyle() { return { display: "block", fontSize: 10, color: "#475569", fontWeight: 800, textTransform: "uppercase", marginBottom: 5, letterSpacing: 0.4 }; }
function cardStyle() { return { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(15,23,42,.04)" }; }

function Section({ title, children, color = BLUE }) {
    return <div style={{ ...cardStyle(), marginBottom: 14 }}>
        <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 8, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, color, fontSize: 15, fontWeight: 900 }}>{title}</h3>
        </div>
        {children}
    </div>;
}

function Select({ label, value, onChange, options }) {
    return <div><label style={labelStyle()}>{label}</label><select value={value || ""} onChange={(e) => onChange(e.target.value)} style={fieldStyle()}>{options.map(o => { const val = (o && typeof o === "object") ? o.value : o; const lab = (o && typeof o === "object") ? o.label : o; return <option key={val} value={val}>{lab}</option>; })}</select></div>;
}

function ToggleButton({ active, children, onClick }) {
    return <button onClick={onClick} style={{ border: active ? `2px solid ${BLUE}` : "1px solid #e2e8f0", background: active ? "#eef2ff" : "#fff", color: active ? BLUE : "#334155", borderRadius: 10, padding: "10px 14px", fontWeight: 800, cursor: "pointer" }}>{children}</button>;
}


function MaterialInlineSelector({ layer, onPatch }) {
    const { t } = useLang();
    const { materijali, dobavljaci, loading } = useMaterialMaster();
    const useLive = materijali.length > 0;
    const [rucniProizvodjac, setRucniProizvodjac] = useState(false);

    // --- VRSTA ---
    const vrste = useMemo(
        () => (useLive ? mmDistinct(materijali, "vrsta") : getVrsteMaterijala()),
        [useLive, materijali]
    );
    const vrsta = layer?.vrsta || layer?.tip || "";

    // --- POD VRSTA (samo iz žive baze; statički je nema) ---
    const podVrste = useMemo(
        () => (useLive ? mmDistinct(materijali, "pod_vrsta", { vrsta }) : []),
        [useLive, materijali, vrsta]
    );
    const pod_vrsta = layer?.pod_vrsta || "";

    // --- OZNAKA ---
    const oznake = useMemo(
        () => (useLive ? mmDistinct(materijali, "oznaka", { vrsta, pod_vrsta }) : getOznakeZaVrstu(vrsta)),
        [useLive, materijali, vrsta, pod_vrsta]
    );
    const oznaka = layer?.oznaka_materijala || layer?.oznaka || layer?.grade || "";

    // --- PROIZVOĐAČ (iz dobavljača u magacinu, uz ručni unos) ---
    const proizvodjac = layer?.proizvodjac || "";

    // --- DEBLJINA ---
    const debljine = useMemo(
        () => (useLive ? mmDistinct(materijali, "debljina", { vrsta, pod_vrsta, oznaka }) : getDebljineZaMaterijal(vrsta, oznaka)),
        [useLive, materijali, vrsta, pod_vrsta, oznaka]
    );
    const rawDeb = layer?.debljina ?? layer?.deb ?? layer?.thickness ?? "";
    const debljina = (rawDeb === "" || rawDeb == null) ? "" : (Number(String(rawDeb).replace("µ", "")) || "");

    // --- Izvedeno: koeficijent / gm2 iz tačnog reda žive baze, inače statički ---
    const matchRow = useLive
        ? materijali.find(r =>
            String(r.vrsta ?? "") === String(vrsta) &&
            String(r.pod_vrsta ?? "") === String(pod_vrsta) &&
            String(r.oznaka ?? "") === String(oznaka) &&
            String(r.debljina ?? "") === String(debljina))
        : null;
    const koeficijent = (matchRow?.koeficijent ?? getKoeficijent(vrsta)) || layer?.koeficijent || "1.00";
    const gm2 = matchRow?.gm2 ?? calculateGm2(vrsta, debljina);
    const nazivMaterijala = buildMaterialName(vrsta, oznaka, debljina);

    useEffect(() => {
        const patch = {
            vrsta,
            pod_vrsta,
            oznaka_materijala: oznaka,
            oznaka, // legacy: deo ekrana još čita l.oznaka
            proizvodjac,
            debljina,
            koeficijent,
            gm2,
            material: nazivMaterijala, // jedini izvor istine za naziv materijala
        };
        // Upiši samo ako se nešto stvarno promenilo (bez nepotrebnih re-rendera)
        const promenjeno = Object.keys(patch).some(k => String(layer?.[k] ?? "") !== String(patch[k] ?? ""));
        if (promenjeno) onPatch(patch);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vrsta, pod_vrsta, oznaka, debljina, proizvodjac]);

    const input = { width: "100%", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", fontWeight: 850, fontSize: 12, boxSizing: "border-box" };
    const uid = "mls-" + (layer?._uid || (layer && (layer._uid = Math.random().toString(36).slice(2, 7))) || "x");
    return <>
        {/* Vrsta — lista + slobodan unos */}
        <input style={input} list={uid + "-v"} value={vrsta} placeholder={t("ph.vrsta")}
            onChange={e => onPatch({ vrsta: e.target.value, pod_vrsta: "", oznaka_materijala: "", oznaka: "", debljina: "" })} />
        <datalist id={uid + "-v"}>{vrste.map(v => <option key={v} value={v} />)}</datalist>
        {/* Pod vrsta — lista + slobodan unos */}
        <input style={input} list={uid + "-pv"} value={pod_vrsta} placeholder={t("ph.pod_vrsta")}
            onChange={e => onPatch({ pod_vrsta: e.target.value, oznaka_materijala: "", oznaka: "", debljina: "" })} />
        <datalist id={uid + "-pv"}>{podVrste.map(p => <option key={p} value={p} />)}</datalist>
        {/* Oznaka — lista + slobodan unos */}
        <input style={input} list={uid + "-oz"} value={oznaka} placeholder={t("ph.oznaka")}
            onChange={e => onPatch({ oznaka_materijala: e.target.value, oznaka: e.target.value, debljina: "" })} />
        <datalist id={uid + "-oz"}>{oznake.map(o => <option key={o} value={o} />)}</datalist>
        {/* Proizvođač — lista + slobodan unos */}
        <input style={input} list={uid + "-pr"} value={proizvodjac} placeholder={t("ph.proizvodjac")}
            onChange={e => onPatch({ proizvodjac: e.target.value })} />
        <datalist id={uid + "-pr"}>{dobavljaci.map(d => <option key={d} value={d} />)}</datalist>
        {/* Debljina — lista + slobodan unos */}
        <input style={input} type="number" step="0.01" list={uid + "-deb"} value={debljina}
            placeholder={vrsta === "PAPIR" ? "g/m²" : "µ"}
            onChange={e => onPatch({ debljina: e.target.value === "" ? "" : Number(e.target.value) })} />
        <datalist id={uid + "-deb"}>{debljine.map(d => <option key={d} value={d} />)}</datalist>
    </>;
}

function MaterialLayersOneRowTable({ title = "MATERIJALI", layers = [], onAdd, onRemove, onPatch, showKg = false, showMetara = false, showCena = true, idealnaSirina = "", porucenaKolicina = "" }) {
    const { t } = useLang();
    const safeLayers = layers.length ? layers : [clone(emptyLayer)];
    const tableWrap = { border: "1px solid #dbe3ef", borderRadius: 14, overflow: "hidden", background: "#fff" };
    const th = { background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#334155", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: .25, padding: "10px 8px", textAlign: "left", whiteSpace: "nowrap" };
    const td = { borderBottom: "1px solid #eef2f7", padding: "8px", verticalAlign: "middle" };
    const input = { width: "100%", height: 38, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", fontWeight: 850, fontSize: 12, boxSizing: "border-box" };
    const check = { width: 18, height: 18, accentColor: GREEN };

    const num = (v) => Number(String(v || "").replace("µ", "").replace("mm", "").replace(",", ".")) || 0;
    const totalDeb = safeLayers.reduce((a, l) => a + num(l.debljina), 0);
    const totalGm2 = safeLayers.reduce((a, l) => a + num(l.gm2 || l.tezina || l.tezinaGm2), 0);
    const avgKoef = safeLayers.length ? safeLayers.reduce((a, l) => a + num(l.koeficijent), 0) / safeLayers.length : 0;
    const totalCena = safeLayers.reduce((a, l) => a + num(l.cena), 0);

    return <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div>
                <h3 style={{ margin: 0, color: "#0f172a", fontSize: 18, fontWeight: 950 }}>{title}</h3>
                <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>{t("tmpl.materijali_opis")}</div>
            </div>
            <button onClick={onAdd} style={{ background: GREEN, color: "#fff", border: "none", borderRadius: 999, padding: "9px 14px", fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" }}>+ {t("tmpl.dodaj_sloj")}</button>
        </div>
        <div style={tableWrap}>
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: showKg || showMetara ? 1450 : 1290, borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <thead>
                        <tr>
                            <th style={{ ...th, width: 38 }}>#</th>
                            <th style={{ ...th, width: 120 }}>{t("tmpl.vrsta")}</th>
                            <th style={{ ...th, width: 120 }}>{t("tmpl.pod_vrsta")}</th>
                            <th style={{ ...th, width: 140 }}>{t("tmpl.oznaka")}</th>
                            <th style={{ ...th, width: 140 }}>{t("tmpl.proizvodjac")}</th>
                            <th style={{ ...th, width: 95 }}>{t("tmpl.debljina")}</th>
                            <th style={{ ...th, width: 95 }}>{t("tmpl.koeficijent")}</th>
                            <th style={{ ...th, width: 105 }}>{t("tmpl.tezina_gm2")}</th>
                            <th style={{ ...th, width: 100 }}>{t("tmpl.sirina_mm")}</th>
                            {showKg && <th style={{ ...th, width: 90 }}>{t("tmpl.kg")}</th>}
                            {showMetara && <th style={{ ...th, width: 110 }}>{t("tmpl.potrebno_m")}</th>}
                            {showCena && <th style={{ ...th, width: 100 }}>{t("tmpl.cena")} €/kg</th>}
                            <th style={{ ...th, width: 55, textAlign: "center" }}>Š</th>
                            <th style={{ ...th, width: 55, textAlign: "center" }}>L</th>
                            <th style={{ ...th, width: 70, textAlign: "center" }}>{t("tmpl.akcije")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {safeLayers.map((l, i) => (
                            <tr key={i}>
                                <td style={{ ...td, fontWeight: 950 }}>{i + 1}</td>
                                <td style={td} colSpan={5}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr .7fr", gap: 8 }}>
                                        <MaterialInlineSelector layer={l} onPatch={(patch) => onPatch(i, patch)} />
                                    </div>
                                </td>
                                <td style={td}><input style={input} value={l.koeficijent || ""} onChange={e => onPatch(i, { koeficijent: e.target.value })} /></td>
                                <td style={td}><input style={input} value={l.gm2 || l.tezina || ""} onChange={e => onPatch(i, { gm2: e.target.value, tezina: e.target.value })} /></td>
                                <td style={td}>{(() => {
                                    const hasMat = !!(l.vrsta || l.oznaka || l.debljina || l.material);
                                    const showIdeal = !l.sirina && idealnaSirina && hasMat;
                                    return <input style={{ ...input, background: showIdeal ? "#eff6ff" : "#fff", color: showIdeal ? "#2446b8" : "#0f172a" }} value={l.sirina || (hasMat ? (idealnaSirina || "") : "")} onChange={e => onPatch(i, { sirina: e.target.value })} />;
                                })()}</td>
                                {showKg && (() => {
                                    const gm2 = Number(l.gm2 || l.tezina || l.tezinaGm2 || 0);
                                    const sir = Number(l.sirina || idealnaSirina || 0) / 1000;
                                    const kol = Math.ceil(Number(porucenaKolicina || 0) * 1.05);
                                    const autoKg = (gm2 && sir && kol) ? (gm2 * sir * kol / 1000).toFixed(1) : "";
                                    return <td style={td}><input readOnly={!!autoKg} style={{ ...input, background: autoKg ? "#f0fdf4" : "#fff", color: autoKg ? "#059669" : "#0f172a", fontWeight: autoKg ? 900 : 700 }} value={autoKg || l.kg || ""} onChange={e => !autoKg && onPatch(i, { kg: e.target.value })} /></td>;
                                })()}
                                {showMetara && (() => {
                                    const kol = Math.ceil(Number(porucenaKolicina || 0) * 1.05);
                                    const autoM = kol ? String(kol) : "";
                                    return <td style={td}><input readOnly={!!autoM} style={{ ...input, background: autoM ? "#f0fdf4" : "#fff", color: autoM ? "#059669" : "#0f172a", fontWeight: autoM ? 900 : 700 }} value={autoM || l.metara || ""} onChange={e => !autoM && onPatch(i, { metara: e.target.value })} /></td>;
                                })()}
                                {showCena && <td style={td}><input style={input} value={l.cena || ""} onChange={e => onPatch(i, { cena: e.target.value })} /></td>}
                                <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={!!l.stampa} onChange={e => onPatch(i, { stampa: e.target.checked })} style={check} /></td>
                                <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={!!l.lak} onChange={e => onPatch(i, { lak: e.target.checked })} style={check} /></td>
                                <td style={{ ...td, textAlign: "center" }}><button onClick={() => onRemove(i)} disabled={safeLayers.length <= 1} style={{ width: 36, height: 36, border: "1px solid #fecaca", color: RED, background: safeLayers.length <= 1 ? "#f1f5f9" : "#fff", borderRadius: 10, fontWeight: 950, cursor: safeLayers.length <= 1 ? "not-allowed" : "pointer", opacity: safeLayers.length <= 1 ? .45 : 1 }}>×</button></td>
                            </tr>
                        ))}

                    </tbody>
                </table>
            </div>
            <div style={{ padding: "14px 16px", background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 10 }}>
                    <div style={{ background: "#fff", border: "1px solid #dbeafe", borderLeft: "4px solid #2446b8", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{t("tmpl.ukupna_debljina")}</div>
                        <div style={{ fontSize: 17, fontWeight: 950, color: "#2446b8" }}>{totalDeb ? `${totalDeb} µ` : "—"}</div>
                    </div>
                    <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderLeft: "4px solid #059669", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{t("tmpl.ukupno_gm2")}</div>
                        <div style={{ fontSize: 17, fontWeight: 950, color: "#059669" }}>{totalGm2.toFixed(1)} g/m²</div>
                    </div>
                    <div style={{ background: "#fff", border: "1px solid #dbeafe", borderLeft: "4px solid #2446b8", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{t("tmpl.prosecan_koef")}</div>
                        <div style={{ fontSize: 17, fontWeight: 950, color: "#2446b8" }}>{avgKoef.toFixed(2)}</div>
                    </div>
                    {showCena && totalCena > 0 && <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderLeft: "4px solid #059669", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{t("tmpl.ukupna_cena")}</div>
                        <div style={{ fontSize: 17, fontWeight: 950, color: "#059669" }}>{totalCena.toFixed(2)} €/kg</div>
                    </div>}
                    {showKg && porucenaKolicina && (() => {
                        const sir = Number(idealnaSirina || 0) / 1000;
                        const kol = Math.ceil(Number(porucenaKolicina) * 1.05);
                        const kgUk = (sir && kol) ? (totalGm2 * sir * kol / 1000).toFixed(1) : null;
                        return kgUk ? <div style={{ background: "#fff", border: "1px solid #86efac", borderLeft: "5px solid #059669", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ fontSize: 10, color: "#064e3b", fontWeight: 900, textTransform: "uppercase" }}>Ukupno kg (+5%)</div>
                            <div style={{ fontSize: 17, fontWeight: 950, color: "#059669" }}>{kgUk} kg</div>
                        </div> : null;
                    })()}
                </div>
                <div style={{ fontSize: 12, color: "#475569", fontWeight: 800 }}>✅ {t("tmpl.legenda_stampa")} &nbsp;|&nbsp; ☑ {t("tmpl.legenda_lak")}</div>
            </div>
        </div>
    </div>;
}

function RollPreview({ folija, idealna = "" }) {
    const { t } = useLang();
    const rez = folija.rezanje || {};
    const nn = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
    const sirM = nn(rez.sirinaMaterijala) || nn(idealna);
    const trake = (rez.sirineTraka || "").split(",").map(x => Number(String(x).replace(",", ".").trim())).filter(n => n > 0);
    const lista = trake.length ? trake : (Number(rez.sirinaTrake) ? [Number(rez.sirinaTrake)] : []);
    const suma = lista.reduce((a, b) => a + b, 0);
    const otpad = Math.max(0, sirM - suma);
    const ol = otpad / 2, od = otpad / 2;
    const isk = sirM ? Math.min(100, (suma / sirM) * 100) : 0;
    const segs = [];
    if (ol > 0) segs.push({ w: ol, waste: true, label: "OTPAD " + ol.toFixed(0) });
    lista.forEach(t => segs.push({ w: t, waste: false, label: t + " mm" }));
    if (od > 0) segs.push({ w: od, waste: true, label: "OTPAD " + od.toFixed(0) });
    return <div style={{ border: `2px solid ${BLUE}`, borderRadius: 10, overflow: "hidden", background: "#eef4ff" }}>
        <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6, fontSize: 11, fontWeight: 900, color: BLUE }}>
            <span>{t("tmpl.prikaz_rolne")}</span>
            <span>Materijal: {sirM || "—"} mm · iskorišćenje {isk.toFixed(1)}%{otpad ? " · otpad " + otpad.toFixed(0) + " mm (po " + ol.toFixed(0) + " levo/desno)" : ""}</span>
        </div>
        <div style={{ display: "flex", minHeight: 72, borderTop: `1px solid ${BLUE}` }}>
            {segs.length ? segs.map((s, i) => <div key={i} style={{ flex: `${Math.max(s.w, 6)} 1 0`, minWidth: s.w < 18 ? 42 : 50, borderRight: i === segs.length - 1 ? "none" : `1px solid ${s.waste ? RED : BLUE}`, display: "flex", alignItems: "center", justifyContent: "center", color: s.waste ? RED : BLUE, background: s.waste ? "#fee2e2" : "transparent", fontSize: 11, fontWeight: 900, textAlign: "center", padding: 3 }}>{s.label}</div>) : <div style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>{t("ph.unesi_sirine")}</div>}
        </div>
        {folija.kpdf.enabled && <div style={{ padding: "8px 12px", background: "#fff7ed", color: "#9a3412", fontWeight: 800, fontSize: 12 }}>KPDF / perforacija: {folija.kpdf.tip} · {folija.kpdf.odnos} · {folija.kpdf.smer} · pozicija {folija.kpdf.pozicija || "—"}</div>}
    </div>;
}


function FolijaCadEngine({ folija }) {
    const rez = folija.rezanje || {};
    const kpdf = folija.kpdf || {};
    const finalRoll = folija.finalRoll || {};
    const layers = folija.layers || [];
    const sirinaMaterijala = Number(String(rez.sirinaMaterijala || "840").replace(",", ".")) || 840;
    const sirineTraka = (rez.sirineTraka || "")
        .split(",")
        .map(x => Number(String(x).trim().replace(",", ".")))
        .filter(Boolean);
    const brojTraka = Number(rez.brojTraka) || sirineTraka.length || 1;
    const trake = sirineTraka.length ? sirineTraka : Array.from({ length: brojTraka }, () => Number(rez.sirinaTrake) || Math.round(sirinaMaterijala / brojTraka));
    const sumaTraka = trake.reduce((a, b) => a + b, 0);
    const otpad = Math.max(0, sirinaMaterijala - sumaTraka);
    const isOver = sumaTraka > sirinaMaterijala;
    const rollW = 680;
    const rollX = 50;
    const rollY = 165;
    const rollH = 126;
    const scale = rollW / Math.max(sirinaMaterijala, sumaTraka, 1);
    const coreX = 570;
    const coreY = 378;
    const warnings = [];
    if (isOver) warnings.push(`Širine traka prelaze matičnu rolnu za ${(sumaTraka - sirinaMaterijala).toFixed(1)} mm.`);
    if (otpad > 0) warnings.push(`Ostaje otpad ${otpad.toFixed(1)} mm — proveriti optimizaciju.`);
    if (kpdf.enabled && !kpdf.odnos) warnings.push("KPDF/perforacija je uključena, ali odnos nije definisan.");
    if (!rez.sirineTraka) warnings.push("Unesi sirineTraka kao npr. 85,85,85 da CAD prikaz bude potpuno tačan.");

    let cursor = rollX;
    const colors = ["#dbeafe", "#dcfce7", "#fef3c7", "#ede9fe", "#fee2e2", "#cffafe"];

    function DimLine({ x1, y1, x2, y2, text, tx, ty }) {
        return <>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#475569" strokeWidth="1.4" markerStart="url(#folijaArrow)" markerEnd="url(#folijaArrow)" />
            <text x={tx} y={ty} fontSize="11" fontWeight="950" fill="#334155" textAnchor="middle">{text}</text>
        </>;
    }

    function Callout({ x1, y1, x2, y2, text, color = BLUE }) {
        return <>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.5" strokeDasharray="6 5" />
            <circle cx={x1} cy={y1} r="4" fill={color} />
            <text x={x2 + 8} y={y2 + 4} fontSize="11" fontWeight="950" fill={color}>{text}</text>
        </>;
    }

    return <div style={{ ...cardStyle(), background: "#f8fafc", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12 }}>
            <div>
                <div style={{ fontWeight: 950, color: BLUE, fontSize: 16 }}>Folija CAD / Slitting & Roll Engine PRO</div>
                <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>Live prikaz matične rolne, slitovanja, finalnih rolni, KPDF/perforacije, odmotavanja i otpada.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 999, padding: "7px 11px", fontWeight: 900, color: "#334155" }}>Matična: {sirinaMaterijala} mm</span>
                <span style={{ border: `1px solid ${isOver ? RED : GREEN}`, background: isOver ? "#fef2f2" : "#ecfdf5", borderRadius: 999, padding: "7px 11px", fontWeight: 900, color: isOver ? RED : GREEN }}>Iskorišćenje: {Math.min(100, (sumaTraka / Math.max(sirinaMaterijala, 1)) * 100).toFixed(1)}%</span>
            </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) 330px", gap: 14, alignItems: "start" }}>
            <svg viewBox="0 0 820 610" width="100%" height="560" style={{ background: "white", border: "1px solid #dbe3ef", borderRadius: 14, boxShadow: "0 1px 3px rgba(15,23,42,.06)" }}>
                <defs>
                    <marker id="folijaArrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8 z" fill="#475569" /></marker>
                    <pattern id="folijaGrid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M18 0H0V18" fill="none" stroke="#eef2f7" strokeWidth="1" /></pattern>
                    <linearGradient id="filmGloss" x1="0" x2="1"><stop offset="0" stopColor="#f8fafc" /><stop offset=".5" stopColor="#ffffff" /><stop offset="1" stopColor="#e0ecff" /></linearGradient>
                    <filter id="rollShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.14" /></filter>
                </defs>
                <rect x="18" y="18" width="784" height="574" rx="16" fill="#fbfdff" stroke="#e2e8f0" />
                <rect x="34" y="88" width="742" height="438" rx="14" fill="url(#folijaGrid)" stroke="#e2e8f0" />
                <text x="410" y="54" textAnchor="middle" fontSize="18" fontWeight="950" fill="#0f172a">TEHNIČKI PRIKAZ FOLIJE — SLITTING / FINAL ROLL</text>
                <text x="410" y="76" textAnchor="middle" fontSize="12" fill="#64748b">Slojevi: {layers.map(l => l.material).filter(Boolean).join(" / ") || "—"}</text>

                <g filter="url(#rollShadow)">
                    <rect x={rollX} y={rollY} width={rollW} height={rollH} rx="18" fill="url(#filmGloss)" stroke="#0f172a" strokeWidth="2.4" />
                    <ellipse cx={rollX + 18} cy={rollY + rollH / 2} rx="18" ry={rollH / 2} fill="#e2e8f0" stroke="#0f172a" strokeWidth="2" />
                    <ellipse cx={rollX + rollW - 4} cy={rollY + rollH / 2} rx="20" ry={rollH / 2} fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
                </g>

                {trake.map((t, i) => {
                    const w = Math.max(18, t * scale);
                    const x = cursor;
                    cursor += w;
                    return <g key={i}>
                        <rect x={x} y={rollY} width={w} height={rollH} fill={colors[i % colors.length]} stroke="#1e3a8a" strokeWidth="1.2" opacity=".92" />
                        <line x1={x} y1={rollY} x2={x} y2={rollY + rollH} stroke="#1d4ed8" strokeWidth="2" />
                        <text x={x + w / 2} y={rollY + 58} textAnchor="middle" fontSize="12" fontWeight="950" fill="#1e3a8a">{t}</text>
                        <text x={x + w / 2} y={rollY + 76} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1e3a8a">mm</text>
                        <DimLine x1={x + 4} y1={rollY - 18 - (i % 2) * 16} x2={x + w - 4} y2={rollY - 18 - (i % 2) * 16} text={`${t} mm`} tx={x + w / 2} ty={rollY - 25 - (i % 2) * 16} />
                    </g>;
                })}

                {otpad > 0 && !isOver && <g>
                    <rect x={rollX + sumaTraka * scale} y={rollY} width={Math.max(16, otpad * scale)} height={rollH} fill="#fee2e2" stroke="#dc2626" strokeWidth="1.7" />
                    <text x={rollX + sumaTraka * scale + Math.max(16, otpad * scale) / 2} y={rollY + 66} textAnchor="middle" fontSize="11" fontWeight="950" fill="#dc2626">OTPAD</text>
                    <text x={rollX + sumaTraka * scale + Math.max(16, otpad * scale) / 2} y={rollY + 84} textAnchor="middle" fontSize="10" fontWeight="850" fill="#dc2626">{otpad.toFixed(1)} mm</text>
                </g>}

                {kpdf.enabled && <g>
                    <line x1={rollX - 12} y1={rollY + rollH * .58} x2={rollX + rollW + 18} y2={rollY + rollH * .58} stroke="#f97316" strokeWidth="4" strokeDasharray="8 8" />
                    <Callout x1={rollX + rollW * .62} y1={rollY + rollH * .58} x2="610" y2="132" text={`KPDF ${kpdf.odnos || ""} · ${kpdf.smer || ""}`} color="#ea580c" />
                </g>}

                <DimLine x1={rollX} y1={rollY + rollH + 34} x2={rollX + rollW} y2={rollY + rollH + 34} text={`Matična širina ${sirinaMaterijala} mm`} tx={rollX + rollW / 2} ty={rollY + rollH + 58} />
                <Callout x1={rollX + 60} y1={rollY + 24} x2="92" y2="118" text={`Štampa: ${folija.stampa?.strana || "—"}`} color="#2563eb" />
                <Callout x1={rollX + rollW - 45} y1={rollY + rollH - 22} x2="620" y2="338" text={`Odmotavanje: ${finalRoll.smerOdmotavanja || folija.stampa?.smerOdmotavanja || "—"}`} color="#7c3aed" />

                <g transform="translate(92 392)">
                    <text x="0" y="0" fontSize="13" fontWeight="950" fill="#0f172a">Slojevi / struktura</text>
                    {layers.slice(0, 5).map((l, i) => <g key={i} transform={`translate(0 ${22 + i * 22})`}>
                        <rect x="0" y="-12" width="190" height="16" rx="4" fill={colors[i % colors.length]} stroke="#cbd5e1" />
                        <text x="205" y="1" fontSize="11" fontWeight="850" fill="#334155">{l.material || `Sloj ${i + 1}`} · {l.debljina || "—"}µ · {l.sirina || "—"}mm</text>
                    </g>)}
                </g>

                <g transform={`translate(${coreX} ${coreY})`}>
                    <text x="0" y="-22" fontSize="13" fontWeight="950" fill="#0f172a">Finalna rolna</text>
                    <ellipse cx="58" cy="54" rx="58" ry="52" fill="#dbeafe" stroke="#0f172a" strokeWidth="2" />
                    <ellipse cx="58" cy="54" rx="24" ry="22" fill="#fff" stroke="#64748b" strokeWidth="2" />
                    <path d="M58 2 C88 10 116 28 116 54 C116 80 88 99 58 106" fill="none" stroke="#1d4ed8" strokeWidth="6" opacity=".75" />
                    <text x="58" y="132" textAnchor="middle" fontSize="11" fontWeight="950" fill="#1d4ed8">Ø {rez.precnikRolne || finalRoll.precnik || "—"}</text>
                    <text x="58" y="150" textAnchor="middle" fontSize="10" fontWeight="850" fill="#475569">Hilzna {finalRoll.hilzna || folija.stampa?.precnikHilzne || "—"}</text>
                </g>
            </svg>

            <div style={{ display: "grid", gap: 10 }}>
                <div style={{ ...cardStyle(), borderLeft: `5px solid ${BLUE}` }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: BLUE, marginBottom: 8 }}>Parametri rezanja</div>
                    <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.8 }}>
                        <b>Matična rola:</b> {sirinaMaterijala} mm<br />
                        <b>Broj traka:</b> {trake.length}<br />
                        <b>Ukupno trake:</b> {sumaTraka.toFixed(1)} mm<br />
                        <b>Otpad:</b> {isOver ? "PREKO ŠIRINE" : `${otpad.toFixed(1)} mm`}<br />
                        <b>Dužina rolne:</b> {rez.duzinaRolne || "—"} m<br />
                        <b>Prečnik:</b> {rez.precnikRolne || "—"} mm
                    </div>
                </div>
                <div style={{ ...cardStyle(), borderLeft: `5px solid ${ORANGE}` }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: ORANGE, marginBottom: 8 }}>KPDF / perforacija</div>
                    <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.8 }}>
                        <b>Status:</b> {kpdf.enabled ? "Uključeno" : "Nema"}<br />
                        <b>Tip:</b> {kpdf.tip || "—"}<br />
                        <b>Odnos:</b> {kpdf.odnos || "—"}<br />
                        <b>Smer:</b> {kpdf.smer || "—"}<br />
                        <b>Pozicija:</b> {kpdf.pozicija || "—"}
                    </div>
                </div>
                <div style={{ ...cardStyle(), borderLeft: `5px solid ${warnings.length ? RED : GREEN}` }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: warnings.length ? RED : GREEN, marginBottom: 8 }}>AI validacija širina</div>
                    {warnings.length ? <ul style={{ margin: 0, paddingLeft: 18, color: RED, fontSize: 12, lineHeight: 1.7 }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : <div style={{ color: GREEN, fontSize: 12, fontWeight: 850 }}>Plan širina je logičan i spreman za tehnički list.</div>}
                </div>
                <div style={{ ...cardStyle(), background: "#f8fafc" }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: "#0f172a", marginBottom: 8 }}>Legenda</div>
                    {["Trake = finalne širine", "Crveno = otpad", "Narandžasto = KPDF/perforacija", "Plavo = smer/štampa/finalna rolna"].map((x, i) => <div key={i} style={{ fontSize: 11, color: "#475569", marginBottom: 5 }}>• {x}</div>)}
                </div>
            </div>
        </div>
    </div>;
}

function BagDrawing({ kesa }) {
    const [side, setSide] = useState("front");
    const o = kesa.options || {};
    const mm = (v, fallback) => Number(String(v ?? "").replace(",", ".")) || fallback;
    const W_mm = mm(kesa.sirina, 200);
    const H_mm = mm(kesa.duzina, 300);
    const flap_mm = mm(kesa.klapna, 20);
    const gus_mm = mm(kesa.falta, 50);
    const tipKese = kesa.tipKese || "doypack";

    const DBLU = "#1a56db";
    const DBLK = "#0f172a";
    const DGRAY = "#94a3b8";
    const DLGRAY = "#e2e8f0";
    const DDASH = "9 6";
    const DDOT = "4 7";
    const DPERF = "3 6";
    const AR = "url(#bagAr)";

    const VBW = 870, VBH = 620;
    const BX = 215, BY = 52;
    const BW = 248, BH = 375;
    const BCX = BX + BW / 2;
    const BBOT = BY + BH;
    const flapPx = Math.max(18, Math.min(60, (flap_mm / H_mm) * BH));
    const gussetPx = Math.max(26, Math.min(80, (gus_mm / H_mm) * BH));
    const perfY = BY + flapPx + 30;
    const anleY = BBOT - gussetPx - 14;
    const SX = 700, SY = 95, SW = 52, SH = BH * 0.84;

    function DimH({ x1, x2, y, label, above = true }) {
        const mid = (x1 + x2) / 2;
        const ty = above ? y - 9 : y + 16;
        return <g>
            <line x1={x1} y1={y - 5} x2={x1} y2={y + 5} stroke={DBLU} strokeWidth="1.1" />
            <line x1={x2} y1={y - 5} x2={x2} y2={y + 5} stroke={DBLU} strokeWidth="1.1" />
            <line x1={x1} y1={y} x2={x2} y2={y} stroke={DBLU} strokeWidth="1.1" markerStart={AR} markerEnd={AR} />
            <text x={mid} y={ty} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={DBLU}>{label}</text>
        </g>;
    }

    function DimV({ x, y1, y2, label, right = false }) {
        const mid = (y1 + y2) / 2;
        const tx = right ? x + 10 : x - 9;
        const anchor = right ? "start" : "end";
        return <g>
            <line x1={x - 5} y1={y1} x2={x + 5} y2={y1} stroke={DBLU} strokeWidth="1.1" />
            <line x1={x - 5} y1={y2} x2={x + 5} y2={y2} stroke={DBLU} strokeWidth="1.1" />
            <line x1={x} y1={y1} x2={x} y2={y2} stroke={DBLU} strokeWidth="1.1" markerStart={AR} markerEnd={AR} />
            <text x={tx} y={mid + 4} textAnchor={anchor} fontSize="10.5" fontWeight="700" fill={DBLU}>{label}</text>
        </g>;
    }

    function Note({ bx, by, ex, ey, lines: noteLines }) {
        return <g>
            <circle cx={bx} cy={by} r="2.8" fill={DBLU} />
            <line x1={bx} y1={by} x2={ex} y2={ey} stroke={DBLU} strokeWidth="0.9" strokeDasharray="5 3" />
            {noteLines.map((t, i) => <text key={i} x={ex + (ex < bx ? -5 : 5)} y={ey + i * 13 - (noteLines.length - 1) * 6}
                textAnchor={ex < bx ? "end" : "start"} fontSize="10" fontWeight={i === 0 ? "700" : "500"}
                fill={i === 0 ? DBLU : "#475569"}>{t}</text>)}
        </g>;
    }

    function OutlineRavna() {
        return <g>
            <rect x={BX} y={BY} width={BW} height={BH} rx="3" fill="white" stroke={DBLK} strokeWidth="2.2" />
            <line x1={BX} y1={BY + flapPx} x2={BX + BW} y2={BY + flapPx} stroke={DBLK} strokeWidth="1.6" />
            {gussetPx > 0 && <line x1={BX} y1={BBOT - gussetPx} x2={BX + BW} y2={BBOT - gussetPx} stroke={DBLK} strokeWidth="1.4" strokeDasharray={DDASH} />}
        </g>;
    }

    function OutlineDoypack() {
        const gp = gussetPx || 50;
        return <g>
            <path d={`M${BX + 7} ${BY} H${BX + BW - 7} Q${BX + BW} ${BY} ${BX + BW} ${BY + 10} V${BBOT - gp - 22} Q${BX + BW} ${BBOT - gp + 6} ${BX + BW * 0.85} ${BBOT - gp + 18} Q${BCX + BW * 0.2} ${BBOT + 10} ${BCX} ${BBOT + 10} Q${BCX - BW * 0.2} ${BBOT + 10} ${BX + BW * 0.15} ${BBOT - gp + 18} Q${BX} ${BBOT - gp + 6} ${BX} ${BBOT - gp - 22} V${BY + 10} Q${BX} ${BY} ${BX + 7} ${BY} Z`}
                fill="white" stroke={DBLK} strokeWidth="2.2" />
            <line x1={BX} y1={BY + flapPx} x2={BX + BW} y2={BY + flapPx} stroke={DBLK} strokeWidth="1.6" />
            <line x1={BX + BW * 0.16} y1={BBOT - gp + 18} x2={BX + BW * 0.84} y2={BBOT - gp + 18} stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
            <line x1={BX + 20} y1={BBOT - gp + 7} x2={BX + BW - 20} y2={BBOT - gp + 7} stroke={DGRAY} strokeWidth="0.9" strokeDasharray={DDOT} />
        </g>;
    }

    function OutlineSideGusset() {
        const gp = gussetPx || 40;
        return <g>
            <rect x={BX} y={BY} width={BW} height={BH} rx="3" fill="white" stroke={DBLK} strokeWidth="2.2" />
            <line x1={BX} y1={BY + flapPx} x2={BX + BW} y2={BY + flapPx} stroke={DBLK} strokeWidth="1.6" />
            <line x1={BX + gp} y1={BY + flapPx + 4} x2={BX + gp} y2={BY + BH - 4} stroke={DBLK} strokeWidth="1.4" strokeDasharray={DDASH} />
            <line x1={BX + BW - gp} y1={BY + flapPx + 4} x2={BX + BW - gp} y2={BY + BH - 4} stroke={DBLK} strokeWidth="1.4" strokeDasharray={DDASH} />
            <line x1={BX} y1={BBOT - 10} x2={BX + BW} y2={BBOT - 10} stroke={DBLK} strokeWidth="2" />
        </g>;
    }

    function OutlineStabilo() {
        const gp = gussetPx || 45;
        return <g>
            <path d={`M${BX + 7} ${BY} H${BX + BW - 7} Q${BX + BW} ${BY} ${BX + BW} ${BY + 10} V${BBOT - gp} L${BX + BW * 0.88} ${BBOT} H${BX + BW * 0.12} L${BX} ${BBOT - gp} V${BY + 10} Q${BX} ${BY} ${BX + 7} ${BY} Z`}
                fill="white" stroke={DBLK} strokeWidth="2.2" />
            <line x1={BX} y1={BY + flapPx} x2={BX + BW} y2={BY + flapPx} stroke={DBLK} strokeWidth="1.6" />
            <line x1={BX} y1={BBOT - gp} x2={BX + BW * 0.12} y2={BBOT} stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
            <line x1={BX + BW} y1={BBOT - gp} x2={BX + BW * 0.88} y2={BBOT} stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
            <line x1={BX + BW * 0.12} y1={BBOT} x2={BX + BW * 0.88} y2={BBOT} stroke={DBLK} strokeWidth="2" />
        </g>;
    }

    function OutlineCourier() {
        return <g>
            <rect x={BX} y={BY} width={BW} height={BH} rx="3" fill="white" stroke={DBLK} strokeWidth="2.2" />
            <path d={`M${BX} ${BY + flapPx} H${BX + BW * 0.3} Q${BX + BW * 0.5} ${BY + flapPx + 24} ${BX + BW * 0.7} ${BY + flapPx} H${BX + BW}`}
                fill="#f0fdf4" stroke={DBLK} strokeWidth="1.8" />
            <rect x={BX + BW * 0.1} y={BY + flapPx + 26} width={BW * 0.8} height={10} fill="#fef3c7" stroke="#d97706" strokeWidth="1.2" />
            <text x={BCX} y={BY + flapPx + 34} textAnchor="middle" fontSize="8" fill="#92400e" fontWeight="700">ADH TRAKA</text>
            <line x1={BX} y1={BBOT - 8} x2={BX + BW} y2={BBOT - 8} stroke={DBLK} strokeWidth="2" />
        </g>;
    }

    function OutlineVakuum() {
        return <g>
            <rect x={BX} y={BY} width={BW} height={BH} rx="6" fill="white" stroke={DBLK} strokeWidth="2.2" />
            <ellipse cx={BCX} cy={BY + flapPx / 2} rx={14} ry={9} fill="white" stroke={DBLK} strokeWidth="1.8" />
            <ellipse cx={BCX} cy={BY + flapPx / 2} rx={6} ry={4} fill={DLGRAY} stroke={DBLK} strokeWidth="1.2" />
            <line x1={BX} y1={BY + flapPx} x2={BX + BW} y2={BY + flapPx} stroke={DBLK} strokeWidth="1.6" />
            <path d={`M${BX} ${BY + BH * 0.4} Q${BX - 10} ${BY + BH * 0.6} ${BX} ${BY + BH * 0.8}`} fill="none" stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
            <path d={`M${BX + BW} ${BY + BH * 0.4} Q${BX + BW + 10} ${BY + BH * 0.6} ${BX + BW} ${BY + BH * 0.8}`} fill="none" stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
            <line x1={BX} y1={BBOT - 8} x2={BX + BW} y2={BBOT - 8} stroke={DBLK} strokeWidth="2" />
        </g>;
    }

    const OutlineMap = { ravna: OutlineRavna, doypack: OutlineDoypack, side_gusset: OutlineSideGusset, stabilo: OutlineStabilo, courier: OutlineCourier, vakuum: OutlineVakuum };
    const Outline = OutlineMap[tipKese] || OutlineRavna;

    const bagTypeLabels = { ravna: "Ravna", doypack: "Doypack", side_gusset: "Side Gusset", stabilo: "Stabilo", courier: "Courier", vakuum: "Vakuum" };

    const validation = [];
    if (o.eurozumba && flap_mm < 15) validation.push("Eurozumba zahteva klapnu ≥ 15 mm.");
    if (o.anleger && W_mm < 80) validation.push("Anleger rizičan na kesi < 80 mm.");
    if (o.falta_dno && gus_mm <= 0) validation.push("Falta čekirana ali dubina nije uneta.");

    return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 18px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <div style={{ fontWeight: 900, fontSize: 12, color: DBLK, letterSpacing: 1.5, textTransform: "uppercase" }}>
                Tehnički crtež — {bagTypeLabels[tipKese] || tipKese}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: DGRAY, fontWeight: 700 }}>{W_mm} × {H_mm} mm</span>
                {[["front", "Prednja"], ["back", "Zadnja"]].map(([v, l]) =>
                    <button key={v} onClick={() => setSide(v)} style={{ border: side === v ? `2px solid ${DBLU}` : "1px solid #cbd5e1", background: side === v ? "#eff6ff" : "#fff", color: side === v ? DBLU : "#64748b", borderRadius: 8, padding: "5px 13px", fontWeight: 800, fontSize: 11, cursor: "pointer" }}>{l}</button>
                )}
            </div>
        </div>

        <svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" style={{ display: "block", background: "white" }}>
            <defs>
                <marker id="bagAr" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                    <path d="M0,0 L7,3.5 L0,7 Z" fill={DBLU} />
                </marker>
                <pattern id="bagHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#bfdbfe" strokeWidth="2" />
                </pattern>
            </defs>
            <rect width={VBW} height={VBH} fill="white" />

            <Outline />

            {/* Osa simetrije */}
            <line x1={BCX} y1={BY + flapPx + 5} x2={BCX} y2={BBOT - gussetPx - 8} stroke={DGRAY} strokeWidth="0.9" strokeDasharray={DDOT} />
            <text x={BCX + 5} y={BY + flapPx + 19} fontSize="9" fill={DGRAY}>sredina</text>

            {/* Eurozumba */}
            {o.eurozumba && side === "front" && <g>
                <path d={`M${BCX - 38} ${BY + flapPx / 2 - 12} h76 q14 0 14 13 q0 13 -14 13 h-76 q-14 0 -14 -13 q0 -13 14 -13`} fill="white" stroke={DBLK} strokeWidth="1.7" />
                <circle cx={BCX} cy={BY + flapPx / 2 + 1} r={8} fill="white" stroke={DBLK} strokeWidth="1.7" />
            </g>}

            {/* Okrugla zumba */}
            {o.okrugla_zumba && !o.eurozumba && side === "front" &&
                <circle cx={BCX} cy={BY + flapPx / 2 + 1} r={16} fill="white" stroke={DBLK} strokeWidth="1.7" />}

            {/* Perforacija */}
            {(o.poprecna_perf || o.mikroperforacija) &&
                <line x1={BX - 10} y1={perfY} x2={BX + BW + 10} y2={perfY} stroke={DBLK} strokeWidth="1.4" strokeDasharray={DPERF} />}

            {/* Anleger */}
            {o.anleger && side === "front" && <g>
                <path d={`M${BCX - 48} ${anleY + 16} Q${BCX - 28} ${anleY - 2} ${BCX - 12} ${anleY + 10} Q${BCX} ${anleY - 6} ${BCX + 12} ${anleY + 10} Q${BCX + 28} ${anleY - 2} ${BCX + 48} ${anleY + 16}`}
                    fill="none" stroke={DBLK} strokeWidth="1.7" strokeDasharray={DDASH} />
                <line x1={BX} y1={anleY + 16} x2={BX + BW} y2={anleY + 16} stroke={DGRAY} strokeWidth="0.9" strokeDasharray={DDOT} />
            </g>}

            {/* Bočni var */}
            {o.bocni_var && <g>
                <rect x={BX} y={BY + flapPx} width={8} height={BH - flapPx - gussetPx} fill="#bfdbfe" stroke={DBLU} strokeWidth="1" opacity="0.9" />
                <rect x={BX + BW - 8} y={BY + flapPx} width={8} height={BH - flapPx - gussetPx} fill="#bfdbfe" stroke={DBLU} strokeWidth="1" opacity="0.9" />
            </g>}

            {/* Štampa */}
            {o.stampa && <g>
                <rect x={BX + 16} y={BY + flapPx + 16} width={BW - 32} height={BH - flapPx - gussetPx - 32} fill="url(#bagHatch)" stroke="#93c5fd" strokeWidth="1.4" strokeDasharray="9 4" rx="4" />
                <text x={BCX} y={BY + flapPx + (BH - flapPx - gussetPx) * 0.45} textAnchor="middle" fontSize="10" fill="#1d4ed8" fontWeight="800">PRINT ZONA</text>
            </g>}

            {/* ADH traka */}
            {o.adh_traka && <rect x={BX + BW - 11} y={BY + flapPx + 16} width={11} height={BH - flapPx - gussetPx - 28} fill="#fca5a5" stroke="#b91c1c" strokeWidth="1.3" />}

            {/* ── KOTE LEVO ── */}
            <DimV x={BX - 54} y1={BY} y2={BBOT} label={`${H_mm} mm`} />
            {flapPx > 0 && <DimV x={BX - 27} y1={BY} y2={BY + flapPx} label={`${flap_mm} mm`} />}
            {gussetPx > 0 && tipKese !== "side_gusset" && <DimV x={BX - 27} y1={BBOT - gussetPx} y2={BBOT} label={`${gus_mm} mm`} />}

            {(o.poprecna_perf || o.mikroperforacija) && <g>
                <line x1={BX - 13} y1={BY + flapPx} x2={BX - 13} y2={perfY} stroke={DBLU} strokeWidth="1" markerStart={AR} markerEnd={AR} />
                <line x1={BX - 18} y1={BY + flapPx} x2={BX - 8} y2={BY + flapPx} stroke={DBLU} strokeWidth="1" />
                <line x1={BX - 18} y1={perfY} x2={BX - 8} y2={perfY} stroke={DBLU} strokeWidth="1" />
                <text x={BX - 15} y={(BY + flapPx + perfY) / 2 + 4} textAnchor="end" fontSize="9.5" fill={DBLU}>30 mm</text>
            </g>}

            {o.anleger && <g>
                <line x1={BX - 13} y1={anleY + 16} x2={BX - 13} y2={BBOT} stroke={DBLU} strokeWidth="1" markerStart={AR} markerEnd={AR} />
                <line x1={BX - 18} y1={anleY + 16} x2={BX - 8} y2={anleY + 16} stroke={DBLU} strokeWidth="1" />
                <line x1={BX - 18} y1={BBOT} x2={BX - 8} y2={BBOT} stroke={DBLU} strokeWidth="1" />
                <text x={BX - 15} y={(anleY + 16 + BBOT) / 2 + 4} textAnchor="end" fontSize="9.5" fill={DBLU}>15 mm</text>
            </g>}

            {/* ── CALLOUT OZNAKE LEVO ── */}
            {o.eurozumba && side === "front" && <Note bx={BCX} by={BY + flapPx / 2 + 1} ex={BX - 145} ey={BY + 16} lines={["Eurozumba", "na sredini"]} />}
            {o.okrugla_zumba && !o.eurozumba && side === "front" && <Note bx={BCX} by={BY + flapPx / 2 + 1} ex={BX - 145} ey={BY + 16} lines={["Okrugla zumba", "Ø 28 mm"]} />}
            {(o.poprecna_perf || o.mikroperforacija) && <Note bx={BX + 55} by={perfY} ex={BX - 145} ey={perfY - 4} lines={["Perforacija", "30 mm od vrha"]} />}
            {o.anleger && side === "front" && <Note bx={BCX - 28} by={anleY + 8} ex={BX - 145} ey={anleY + 4} lines={["Anleger (jezičak)", "15 mm od dna"]} />}
            {o.adh_traka && <Note bx={BX + BW - 5} by={BY + flapPx + (BH - flapPx - gussetPx) * 0.5} ex={BX + BW + 60} ey={BY + flapPx + (BH - flapPx - gussetPx) * 0.38} lines={["ADH traka"]} />}
            {tipKese === "side_gusset" && <Note bx={BX + gussetPx} by={BY + flapPx + BH * 0.3} ex={BX - 145} ey={BY + flapPx + BH * 0.28} lines={["Bočna falta", `${gus_mm} mm`]} />}

            {/* ── KOTE DESNO ── */}
            <DimV x={BX + BW + 48} y1={BY} y2={BBOT} label={`${H_mm} mm`} right />
            <DimH x1={BX} x2={BX + BW} y={BBOT + 40} label={`${W_mm} mm`} above={false} />
            {gussetPx > 0 && tipKese !== "side_gusset" &&
                <DimH x1={BCX - BW * 0.28} x2={BCX + BW * 0.28} y={BBOT + 18} label={`${gus_mm} mm`} />}

            {/* ── BOČNI PRIKAZ ── */}
            <text x={SX + SW / 2} y={SY - 18} textAnchor="middle" fontSize="9.5" fontWeight="900" fill={DBLK} letterSpacing="0.8">BOČNI PRIKAZ</text>
            {(tipKese === "doypack" || tipKese === "stabilo") && <>
                <path d={`M${SX + SW / 2} ${SY} L${SX + SW} ${SY + SH * 0.72} L${SX + SW / 2} ${SY + SH} L${SX} ${SY + SH * 0.72} Z`} fill="white" stroke={DBLK} strokeWidth="1.8" />
                <line x1={SX + SW / 2} y1={SY} x2={SX + SW / 2} y2={SY + SH} stroke={DGRAY} strokeWidth="0.9" strokeDasharray={DDOT} />
                <line x1={SX} y1={SY + SH} x2={SX + SW} y2={SY + SH} stroke={DBLK} strokeWidth="2" />
            </>}
            {tipKese === "side_gusset" && <>
                <rect x={SX} y={SY} width={SW} height={SH} fill="white" stroke={DBLK} strokeWidth="1.8" />
                <line x1={SX + SW * 0.3} y1={SY} x2={SX + SW * 0.3} y2={SY + SH} stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
                <line x1={SX + SW * 0.7} y1={SY} x2={SX + SW * 0.7} y2={SY + SH} stroke={DBLK} strokeWidth="1.3" strokeDasharray={DDASH} />
            </>}
            {(tipKese === "ravna" || tipKese === "courier" || tipKese === "vakuum") &&
                <rect x={SX + SW * 0.2} y={SY} width={SW * 0.6} height={SH} fill="white" stroke={DBLK} strokeWidth="1.8" />}
            <DimH x1={SX} x2={SX + SW} y={SY + SH + 26} label={`${gus_mm} mm`} above={false} />

            {/* ── LEGENDA ── */}
            <g transform={`translate(16 ${VBH - 56})`}>
                <rect width={VBW - 32} height={46} rx="5" fill="#f8fafc" stroke={DLGRAY} />
                <text x="11" y="16" fontSize="8.5" fontWeight="900" fill={DBLK} letterSpacing="1">LEGENDA</text>
                <line x1="11" y1="32" x2="48" y2="32" stroke={DBLK} strokeWidth="2" />
                <text x="54" y="36" fontSize="9" fill="#334155">Linija reza</text>
                <line x1="138" y1="32" x2="175" y2="32" stroke={DBLK} strokeWidth="1.4" strokeDasharray={DDASH} />
                <text x="181" y="36" fontSize="9" fill="#334155">Linija savijanja</text>
                <line x1="305" y1="32" x2="342" y2="32" stroke={DBLK} strokeWidth="1.4" strokeDasharray={DPERF} />
                <text x="348" y="36" fontSize="9" fill="#334155">Perforacija</text>
                <rect x="452" y="24" width="30" height="14" fill="#bfdbfe" stroke={DBLU} strokeWidth="1" rx="2" />
                <text x="488" y="36" fontSize="9" fill="#334155">Zavar / var</text>
                <rect x="568" y="24" width="30" height="14" fill="url(#bagHatch)" stroke="#93c5fd" strokeWidth="1" rx="2" />
                <text x="604" y="36" fontSize="9" fill="#334155">Print zona</text>
                <rect x="686" y="24" width="14" height="14" fill="#fca5a5" stroke="#b91c1c" strokeWidth="1" rx="2" />
                <text x="706" y="36" fontSize="9" fill="#334155">ADH traka</text>
            </g>

            {/* Validacija */}
            {validation.length > 0 && <text x="700" y={VBH - 62} fontSize="9" fill="#dc2626" fontWeight="800">⚠ {validation[0]}</text>}
        </svg>

        <div style={{ padding: "11px 18px", borderTop: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 8, background: "#f8fafc" }}>
            {[["Tip", bagTypeLabels[tipKese] || tipKese], ["Širina", `${W_mm} mm`], ["Visina", `${H_mm} mm`], ["Klapna", `${flap_mm} mm`], ["Falta", `${gus_mm} mm`], ["Tolerancija", kesa.tolerancija || "±5%"]].map(([l, v], i) =>
                <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 9px" }}>
                    <div style={{ fontSize: 8.5, color: "#94a3b8", fontWeight: 800, textTransform: "uppercase", marginBottom: 2 }}>{l}</div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>{v}</div>
                </div>
            )}
        </div>
    </div>;
}


function SpoolDrawing({ spulna, update }) {
    const legendRows = [
        ["W", "Širina trake (mm)"],
        ["T", "Širina hilzne / jezgra (mm)"],
        ["D", "Maksimalni prečnik špulne (mm)"],
        ["Da", "Spoljašnji prečnik hilzne (mm)"],
        ["Di", "Unutrašnji prečnik hilzne (mm)"],
        ["G", "Gap - razmak između kraja namotaja i ivice špulne (mm)"],
        ["C", "Zazor - bočni zazor između materijala i ivice (mm)"],
        ["Gap winding", "Namotavanje sa razmakom (gap)"],
        ["Overlapped winding", "Namotavanje sa preklapanjem"]
    ];
    const paramRows = [
        ["W", `${spulna.W || "—"} mm`],
        ["T", `${spulna.T || "—"} mm`],
        ["D", `${spulna.D || "—"} mm`],
        ["Da", `${spulna.Da || "—"} mm`],
        ["Di", `${spulna.Di || "—"} mm`],
        ["G", `${spulna.G || "—"} mm`],
        ["C", `${spulna.C || "—"} mm`],
        ["Max metara", `${spulna.maxMetara || "—"} m`],
        ["Tip", spulna.smer || "—"]
    ];

    return <>
        <Section title="Dimenzije špulne - tehnički prikaz" color="#7c3aed">
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.3fr) minmax(320px, .9fr)", gap: 18, alignItems: "center" }}>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, minHeight: 330, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, overflow: "hidden" }}>
                    <img
                        src={spulnaTechnicalDrawing}
                        alt="Tehnički crtež špulne - gap / overlapped winding"
                        style={{ width: "100%", maxWidth: 980, height: "auto", objectFit: "contain", display: "block" }}
                    />
                </div>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: "#334155", marginBottom: 10 }}>LEGENDA</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <tbody>
                            {legendRows.map((r, i) => <tr key={i}>
                                <td style={{ width: 72, padding: "7px 6px", borderBottom: "1px solid #eef2f7", fontWeight: 950, color: "#0f172a" }}>{r[0]}</td>
                                <td style={{ padding: "7px 6px", borderBottom: "1px solid #eef2f7", color: "#475569", fontWeight: 700 }}>{r[1]}</td>
                            </tr>)}
                        </tbody>
                    </table>
                </div>
            </div>
        </Section>
        <Section title="Dimenzije špulne" color="#7c3aed">
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.2fr) minmax(340px, .8fr)", gap: 16, alignItems: "start" }}>
                <Grid cols={4}>{Object.keys(spulna).filter(k => !["naziv", "materijal"].includes(k)).map(k => <Input key={k} label={k} value={spulna[k]} onChange={v => update(`spulna.${k}`, v)} />)}</Grid>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: "#334155", marginBottom: 10 }}>PREGLED PARAMETARA</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                        {paramRows.map((r, i) => <React.Fragment key={i}>
                            <div style={{ padding: "8px 10px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 11, fontWeight: 950, color: "#334155" }}>{r[0]}</div>
                            <div style={{ gridColumn: "span 2", padding: "8px 10px", borderBottom: "1px solid #e2e8f0", fontSize: 11, fontWeight: 800, color: "#0f172a" }}>{r[1]}</div>
                        </React.Fragment>)}
                    </div>
                </div>
            </div>
        </Section>
        <Section title="Dodatne informacije" color={GREEN}>
            <Grid cols={4}>
                <Select label="Tip namotavanja" value={spulna.smer || "Gap winding"} onChange={v => update("spulna.smer", v)} options={["Gap winding", "Overlapped winding"]} />
                <Select label="Smer namotavanja" value={spulna.smerNamotavanja || "Levo"} onChange={v => update("spulna.smerNamotavanja", v)} options={["Levo", "Desno"]} />
                <Input label="Težina bruto (kg)" value={spulna.tezinaBruto || "25.50"} onChange={v => update("spulna.tezinaBruto", v)} />
                <Input label="Napomena" value={spulna.napomena || "Standardna špulna za OPP foliju."} onChange={v => update("spulna.napomena", v)} />
            </Grid>
        </Section>
    </>;
}


function SmartFolijaTemplateEngine({ form, update }) {
    const rez = form.folija?.rezanje || {};
    const ideal = form.idealnaSirinaMaterijala || rez.sirinaMaterijala || "";
    const smart = izracunajRezanjeTemplate(rez, ideal);
    const valjak = smart.predlogValjka;
    const valjakDiff = valjak ? nnum(ideal) - valjak : 0;
    const chip = (label, value, color = BLUE) => <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderLeft: `5px solid ${color}`, borderRadius: 12, padding: "10px 12px" }}>
        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 950, textTransform: "uppercase", letterSpacing: .35 }}>{label}</div>
        <div style={{ fontSize: 17, color, fontWeight: 950, marginTop: 3 }}>{value}</div>
    </div>;
    const segs = [];
    if (smart.ukupniOtpad > 0 && !smart.prekoSirine) segs.push({ label: `OTPAD ${smart.otpadLevo.toFixed(1)}`, w: smart.otpadLevo, waste: true });
    smart.trake.forEach((t, i) => segs.push({ label: `${t} mm`, w: t, idx: i }));
    if (smart.ukupniOtpad > 0 && !smart.prekoSirine) segs.push({ label: `OTPAD ${smart.otpadDesno.toFixed(1)}`, w: smart.otpadDesno, waste: true });
    const total = Math.max(smart.stvarnaSirina, smart.ukupnoTrake, 1);
    return <Section title="SMART TEMPLATE ENGINE — auto rezanje / valjak / analiza" color={GREEN}>
        <div style={{ display: "grid", gridTemplateColumns: "1.25fr .75fr", gap: 14, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
                    <div>
                        <label style={labelStyle()}>Idealna širina mat. (mm)</label>
                        <input readOnly style={{ ...fieldStyle(), background: "#eff6ff", color: "#2446b8", fontWeight: 900 }}
                            value={form.idealnaSirinaMaterijala || ideal || ""} placeholder="unesi gore ↑" />
                    </div>
                    <div>
                        <label style={labelStyle()}>Širina materijala / rola</label>
                        <input style={{ ...fieldStyle(), background: "#eff6ff", color: "#2446b8" }}
                            value={rez.sirinaMaterijala || form.idealnaSirinaMaterijala || ""}
                            onChange={e => update("folija.rezanje.sirinaMaterijala", e.target.value)} />
                    </div>
                    <div>
                        <label style={labelStyle()}>Širina trake</label>
                        <input style={{ ...fieldStyle(), background: (rez.sirinaTrake || form.dimenzijaSirina) ? "#eff6ff" : "#fff", color: "#2446b8" }}
                            value={rez.sirinaTrake || form.dimenzijaSirina || ""}
                            onChange={e => update("folija.rezanje.sirinaTrake", e.target.value)} />
                    </div>
                    <div>
                        <label style={labelStyle()}>Broj traka</label>
                        <input style={fieldStyle()} value={rez.brojTraka || ""}
                            onChange={e => update("folija.rezanje.brojTraka", e.target.value)} placeholder="npr. 4" />
                    </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
                    {chip("Ukupno trake", `${smart.ukupnoTrake.toFixed(1)} mm`, BLUE)}
                    {chip("Otpad ukupno", smart.prekoSirine ? `PREKO ${(smart.ukupnoTrake - smart.stvarnaSirina).toFixed(1)} mm` : `${smart.ukupniOtpad.toFixed(1)} mm`, smart.prekoSirine ? RED : ORANGE)}
                    {chip("Iskorišćenje", `${smart.iskoriscenje.toFixed(1)}%`, smart.prekoSirine ? RED : GREEN)}
                    {chip("Predlog valjka", valjak ? `${valjak} mm` : "nema", valjak ? GREEN : RED)}
                </div>
                <div style={{ border: "1px solid #dbe3ef", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
                    <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontWeight: 950, color: "#334155", fontSize: 12 }}>
                        <span>Auto grafički prikaz rezanja</span>
                        <span>Materijal {smart.stvarnaSirina || "—"} mm</span>
                    </div>
                    <div style={{ display: "flex", minHeight: 76, alignItems: "stretch" }}>
                        {segs.length ? segs.map((seg, i) => <div key={i} style={{ flex: `${Math.max(seg.w, 8)} 1 0`, minWidth: seg.w < 18 ? 34 : 54, display: "flex", alignItems: "center", justifyContent: "center", borderRight: i === segs.length - 1 ? "none" : "1px solid #cbd5e1", background: seg.waste ? "#fee2e2" : "#dbeafe", color: seg.waste ? RED : BLUE, fontSize: 11, fontWeight: 950, textAlign: "center", padding: 4 }}>{seg.label}</div>) : <div style={{ padding: 18, color: "#64748b", fontWeight: 800 }}>Unesi širinu materijala, širinu trake i broj traka.</div>}
                    </div>
                    <div style={{ padding: "8px 12px", background: smart.prekoSirine ? "#fef2f2" : "#f8fafc", color: smart.prekoSirine ? RED : "#475569", fontSize: 12, fontWeight: 850 }}>
                        {smart.prekoSirine ? "UPOZORENJE: ukupna širina traka je veća od širine materijala." : `Otpad levo ${smart.otpadLevo.toFixed(1)} mm + trake ${smart.ukupnoTrake.toFixed(1)} mm + otpad desno ${smart.otpadDesno.toFixed(1)} mm`}
                    </div>
                </div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
                <div style={{ ...cardStyle(), borderLeft: `5px solid ${GREEN}` }}>
                    <div style={{ fontWeight: 950, color: GREEN, marginBottom: 8 }}>Predlog valjka za kaširanje</div>
                    <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.8 }}>
                        <b>Pravilo:</b> najveći valjak ≤ idealnoj širini<br />
                        <b>Dostupni valjci:</b> {KASIRANJE_VALJCI_MM.join(", ")} mm<br />
                        <b>Idealna širina:</b> {ideal || "—"} mm<br />
                        <b>Predlog:</b> {valjak ? `${valjak} mm` : "nema odgovarajućeg"}<br />
                        <b>Razlika:</b> {valjak ? `${valjakDiff.toFixed(1)} mm` : "—"}
                    </div>
                </div>
                <div style={{ ...cardStyle(), borderLeft: `5px solid ${BLUE}` }}>
                    <div style={{ fontWeight: 950, color: BLUE, marginBottom: 8 }}>Auto popunjavanje</div>
                    <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.8 }}>
                        • Idealna širina se prenosi u nalog i potrebu materijala.<br />
                        • Broj traka × širina trake popunjava rezanje.<br />
                        • Otpad i iskorišćenje se računaju odmah.<br />
                        • Ovi podaci ulaze u analizu idealnih širina za nabavku.
                    </div>
                </div>
            </div>
        </div>
    </Section>;
}

function makeProductMasterIdFromTemplate(source = {}) {
    const seed = [source.kupac, source.naziv, source.sifra, source.type].filter(Boolean).join('-') || String(Date.now());
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
    return 'PROD-' + Math.abs(h).toString().padStart(6, '0').slice(0, 6);
}

function inferTemplateOperations(tpl = {}) {
    const tip = tpl.type || 'folija';
    if (tip === 'kesa') return ['materijal', 'kasiranje', 'kesa'];
    if (tip === 'spulna') return ['materijal', 'formatiranje', 'spulna'];
    const layers = tpl.folija?.layers || [];
    const ops = ['materijal'];
    if (layers.some(l => l?.stampa || l?.stamp || l?.Š) || tpl.folija?.stampa?.brojBoja) ops.push('stampa');
    if (layers.length > 1 || tpl.folija?.kasiranje?.brojKasiranja) ops.push('kasiranje');
    ops.push('perforacija_rezanje');
    return ops;
}

function ProductTemplateEngineV20({ db, setDb, msg, setPage }) {
    const { t } = useLang();
    const [form, setForm] = useState(() => clone(defaultForm));
    const [activeTab, setActiveTab] = useState("folija");
    const [nalogModal, setNalogModal] = useState(false);
    const [nalogRolne, setNalogRolne] = useState([]);
    const [nalogIzbor, setNalogIzbor] = useState({});
    const [nalogLoading, setNalogLoading] = useState(false);
    const [nalogSaving, setNalogSaving] = useState(false);
    const [nalogSaved, setNalogSaved] = useState(false);
    const [rucniUnos, setRucniUnos] = useState({});
    const [saved, setSaved] = useState([]);

    function update(path, value) {
        setForm(prev => {
            const next = clone(prev);
            const parts = path.split(".");
            let ref = next;
            for (let i = 0; i < parts.length - 1; i++) ref = ref[parts[i]];
            ref[parts[parts.length - 1]] = value;
            return next;
        });
    }

    function setType(t) {
        // Zajednička gornja polja se čuvaju ODVOJENO po tipu (folija/kesa/spulna),
        // pa se ne prelivaju iz jednog templejta u drugi.
        const SHARED = ["sifra", "kupac", "naziv", "idealnaSirinaMaterijala", "porucenaKolicina", "dimenzijaSirina", "dimenzijaDuzina", "napomena"];
        setForm(prev => {
            if (t === prev.type) return prev;
            const next = clone(prev);
            next._stash = next._stash || {};
            const cur = {}; SHARED.forEach(k => { cur[k] = next[k] ?? ""; });
            next._stash[prev.type] = cur;                       // sačuvaj polja starog tipa
            const saved = next._stash[t] || {};
            SHARED.forEach(k => { next[k] = saved[k] !== undefined ? saved[k] : ""; }); // učitaj (ili prazna) za novi tip
            next.type = t;
            return next;
        });
        setActiveTab(t);
    }

    function addLayer(section) {
        setForm(prev => {
            const next = clone(prev);
            next[section].layers = [...(next[section].layers || []), clone(emptyLayer)];
            return next;
        });
    }
    function updateLayer(section, index, key, value) {
        setForm(prev => {
            const next = clone(prev);
            next[section].layers[index][key] = value;
            return next;
        });
    }
    function removeLayer(section, index) {
        setForm(prev => {
            const next = clone(prev);
            next[section].layers = next[section].layers.filter((_, i) => i !== index);
            return next;
        });
    }

    function toggleKesaOption(key) {
        setForm(prev => {
            const next = clone(prev);
            next.kesa.options[key] = !next.kesa.options[key];
            if (!next.kesa.positions[key]) next.kesa.positions[key] = { odVrha: "", odDna: "", levo: "", desno: "", sirina: "", visina: "", napomena: "" };
            return next;
        });
    }

    const activeData = useMemo(() => form[form.type] || {}, [form]);


    useEffect(() => {
        if (form.type !== "folija") return;
        const ideal = form.idealnaSirinaMaterijala;
        const dimSirina = form.dimenzijaSirina;
        const poruceno = form.porucenaKolicina;
        if (!ideal && !dimSirina && !poruceno) return;
        setForm(prev => {
            const next = clone(prev);
            const r = next.folija.rezanje;
            // NE upisujemo idealnu/dimenziju/poručenu u polja rezanja — prikaz i obračun ih uzimaju
            // kao fallback (uživo), pa se sve menja ODMAH kad promeniš idealnu, bez zaglavljene "1".
            // Slojevi: širina se NE upisuje; prikaz pokazuje idealnu samo za redove sa materijalom (uživo).
            // auto broj traka = efektivna širina materijala / širina trake
            const sirMat = nnum(r.sirinaMaterijala) || nnum(ideal);
            const trakaW = nnum(r.sirinaTrake) || nnum(dimSirina);
            if (sirMat && trakaW) {
                const autoBroj = Math.max(1, Math.floor(sirMat / trakaW));
                if (String(r.brojTraka || "") !== String(autoBroj)) r.brojTraka = String(autoBroj);
            }
            // auto sirineTraka lista
            const broj = Math.max(0, Math.floor(nnum(r.brojTraka)));
            const traka = trakaW;
            if (broj && traka && (!r.sirineTraka || String(r.sirineTraka).split(",").filter(Boolean).length !== broj)) {
                r.sirineTraka = Array.from({ length: broj }, () => String(traka)).join(",");
            }
            // predlog valjka
            const valjak = predloziValjakKasiranja(ideal);
            if (valjak) r.predlogValjkaKasiranja = String(valjak);
            return next;
        });
    }, [form.type, form.idealnaSirinaMaterijala, form.dimenzijaSirina, form.porucenaKolicina, form.folija?.rezanje?.sirinaMaterijala, form.folija?.rezanje?.brojTraka, form.folija?.rezanje?.sirinaTrake]);

    // Auto: broj boja (iz liste boja), broj kaširanja (slojevi-1), finalRoll iz rezanja/štampe
    useEffect(() => {
        if (form.type !== "folija") return;
        setForm(prev => {
            const next = clone(prev);
            const f = next.folija; if (!f) return prev;
            let changed = false;
            // broj kaširanja = broj slojeva - 1
            const nL = (f.layers || []).length;
            const bk = nL > 1 ? String(nL - 1) : "";
            if (f.kasiranje && f.kasiranje.brojKasiranja !== bk) { f.kasiranje.brojKasiranja = bk; changed = true; }
            // broj boja iz liste boja
            const boje = (f.stampa && f.stampa.boje) || [];
            if (boje.length) {
                const print = boje.filter(b => b.tip !== "Lak").length;
                const hasLak = boje.some(b => b.tip === "Lak");
                const bb = hasLak ? (print + "+lak") : String(print);
                if (f.stampa.brojBoja !== bb) { f.stampa.brojBoja = bb; changed = true; }
            }
            // finalRoll default iz rezanja / štampe
            if (!f.finalRoll) { f.finalRoll = {}; }
            const fr = f.finalRoll, r = f.rezanje || {}, st = f.stampa || {};
            if (!fr.hilzna && st.precnikHilzne) { fr.hilzna = st.precnikHilzne; changed = true; }
            if (!fr.precnik && r.precnikRolne) { fr.precnik = r.precnikRolne; changed = true; }
            if (!fr.duzina && r.duzinaRolne) { fr.duzina = r.duzinaRolne; changed = true; }
            if (!fr.smerOdmotavanja && st.smerOdmotavanja) { fr.smerOdmotavanja = st.smerOdmotavanja; changed = true; }
            return changed ? next : prev;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.type, form.folija?.layers?.length, form.folija?.stampa?.boje, form.folija?.stampa?.precnikHilzne, form.folija?.stampa?.smerOdmotavanja, form.folija?.rezanje?.precnikRolne, form.folija?.rezanje?.duzinaRolne]);

    function makeTemplateRecord(sourceForm = form) {
        const sourceActiveData = sourceForm[sourceForm.type] || {};
        const naziv = sourceForm.naziv || sourceActiveData.naziv;
        const templateId = "TPL-" + Date.now();
        const productMasterId = sourceForm.product_master_id || makeProductMasterIdFromTemplate({ ...sourceForm, naziv });
        const version = sourceForm.template_version || "V25";
        const data = { ...clone(sourceForm), product_master_id: productMasterId, template_id: sourceForm.template_id || templateId, db_id: sourceForm.db_id || null, template_version: version, template_locked: true };
        return {
            id: sourceForm.db_id || templateId,
            db_id: sourceForm.db_id || null,
            template_id: sourceForm.template_id || templateId,
            product_master_id: productMasterId,
            naziv,
            kupac: sourceForm.kupac,
            tip: sourceForm.type,
            template_version: version,
            template_locked: true,
            operacije: inferTemplateOperations(data),
            data,
            created_at: new Date().toISOString()
        };
    }

    // ─── GENERIŠI NALOG ZA MATERIJAL ────────────────────────────
    async function generisiNalogeMaterijal() {
        const layers = (form.type === "folija" ? form.folija?.layers : form.type === "kesa" ? form.kesa?.layers : form.spulna?.layers) || [];
        if (!layers.length) { msg && msg("Unesi bar jedan sloj materijala!", "err"); return; }
        if (!form.idealnaSirinaMaterijala) { msg && msg("Unesi idealnu širinu materijala!", "err"); return; }
        if (form.type === "kesa") {
            if (!(orderMetraze(form).kolPlus > 0)) { msg && msg("Unesi poručenu količinu (kom) i dimenzije kese!", "err"); return; }
        } else if (form.type === "folija") {
            const ob = folijaObracun(form);
            if (!(ob.metriMatPlus > 0)) { msg && msg(`Unesi poručenu količinu (${form.jedinicaUnosa || "m"}) i dimenzije!`, "err"); return; }
            if (ob.greske.length) { msg && msg(ob.greske[0], "err"); return; }
        } else if (!(Number(form.porucenaKolicina) > 0)) { msg && msg("Unesi poručenu količinu (m)!", "err"); return; }
        // Svaki sloj mora imati vrstu, oznaku i debljinu
        const nepotpun = layers.findIndex(l =>
            !(l.vrsta || l.material || l.tip) ||
            !(l.oznaka_materijala || l.oznaka) ||
            !(l.debljina || l.deb)
        );
        if (nepotpun !== -1) { msg && msg(`Sloj ${nepotpun + 1}: izaberi vrstu, oznaku i debljinu materijala!`, "err"); return; }

        setNalogLoading(true);
        setNalogModal(true);
        setNalogSaved(false);
        setNalogIzbor({});
        setRucniUnos({});

        try {
            // Učitaj sve dostupne rolne iz magacina
            const { data: rolne } = await supabase.from("magacin")
                .select("*")
                .not("status", "in", '("Iskorišćeno","iskoriscena","potrosena")')
                .order("sirina");

            setNalogRolne(rolne || []);

            // Auto-predloži rolnu za svaki sloj
            const autoIzbor = {};
            const ideal = Number(form.idealnaSirinaMaterijala) || 0;
            const potrebnoM = orderMetraze(form).kolPlus;
            layers.forEach((layer, i) => {
                autoIzbor[i] = alocirajRolne(rolne, layer, { ideal, potrebnoM });
            });
            setNalogIzbor(autoIzbor);
        } catch (e) {
            msg && msg("Greška pri učitavanju magacina: " + e.message, "err");
        }
        setNalogLoading(false);
    }

    async function potvrdiNalogMaterijal() {
        const layers = (form.type === "folija" ? form.folija?.layers : form.type === "kesa" ? form.kesa?.layers : form.spulna?.layers) || [];
        const { kol, kolPlus } = orderMetraze(form);
        const nepokriveni = [];
        layers.forEach((_, i) => {
            if (rucniUnos[i]) return;
            const izabrane = Array.isArray(nalogIzbor[i]) ? nalogIzbor[i] : (nalogIzbor[i] ? [nalogIzbor[i]] : []);
            const zbir = izabrane.reduce((s, r) => s + slobodnoM(r), 0);
            if (zbir < kolPlus) nepokriveni.push(i + 1);
        });
        if (nepokriveni.length) {
            const ok = typeof window !== "undefined" && window.confirm
                ? window.confirm(`Slojevi ${nepokriveni.join(", ")} nisu pokriveni (kombinacija rolni je manja od potrebne metraže). Svejedno poslati nalog magacioneru?`)
                : true;
            if (!ok) return;
        }

        setNalogSaving(true);

        try {
            // Kreiraj izbor data — više rolni po sloju (kombinacija), sa alociranom metražom
            const izborData = [];
            layers.forEach((l, i) => {
                const izabrane = Array.isArray(nalogIzbor[i]) ? nalogIzbor[i] : (nalogIzbor[i] ? [nalogIzbor[i]] : []);
                const baza = {
                    sloj: i + 1,
                    materijal: l.material || l.materijal || l.tip || "",
                    oznaka: l.oznaka_materijala || l.oznaka || l.komercijalnaOznaka || "",
                    proizvodjac: l.proizvodjac || "",
                    debljina: l.debljina || l.deb || "",
                    rucni: rucniUnos[i] || false,
                };
                if (!izabrane.length) { izborData.push({ ...baza, br_rolne: null, rolna_id: null }); return; }
                let zbir = 0;
                izabrane.forEach((r, k) => {
                    const ukupno = Number(r.metraza_ost ?? r.metraza) || 0;
                    const rezPre = Number(r.rezervisano) || 0;
                    const slob = Math.max(0, ukupno - rezPre);           // slobodni metri rolne
                    const alocirano = kolPlus ? Math.round(Math.min(slob, Math.max(0, kolPlus - zbir))) : slob;
                    zbir += slob;
                    const kgPoM = ukupno > 0 ? (Number(r.kg_neto || r.kg) || 0) / ukupno : 0;
                    izborData.push({
                        ...baza,
                        redni_rolne: k + 1,
                        br_rolne: r.br_rolne || null,
                        rolna_id: r.id || null,
                        sirina: r.sirina || null,
                        metraza: ukupno,
                        slobodno_m: slob,
                        rez_pre: rezPre,
                        alocirano_m: alocirano,
                        lokacija: r.palet || r.lokacija || null,
                        lot: r.lot || null,
                        // snapshot materijala (za ledger / analize)
                        snap_vrsta: r.vrsta || r.tip || baza.materijal || "",
                        snap_pod_vrsta: rolnaPodVrsta(r) || "",
                        snap_oznaka: rolnaOznaka(r) || baza.oznaka || "",
                        snap_debljina: Number(r.deb) || Number(baza.debljina) || null,
                        snap_dobavljac: r.dobavljac || "",
                        kg_po_m: kgPoM,
                    });
                });
            });

            // Delimična rezervacija: rezerviši SAMO alocirane metre, ostatak rolne ostaje slobodan.
            const ref = form.sifra || form.naziv || "";
            const rezervisani = new Set();
            for (const item of izborData) {
                if (item.rolna_id && !item.rucni && !rezervisani.has(item.rolna_id) && Number(item.alocirano_m) > 0) {
                    rezervisani.add(item.rolna_id);
                    const noviRez = Math.round((Number(item.rez_pre) || 0) + (Number(item.alocirano_m) || 0));
                    const ukupno = Number(item.metraza) || 0;
                    const punoRez = ukupno > 0 && noviRez >= ukupno - 1;
                    // dodeljeno_nalogu: dodaj ref (ako više naloga deli rolnu) bez dupliranja
                    let dod = ref;
                    const { data: cur } = await supabase.from("magacin").select("dodeljeno_nalogu").eq("id", item.rolna_id).single();
                    const prethodno = String(cur?.dodeljeno_nalogu || "").trim();
                    if (prethodno && !prethodno.split(",").map(s => s.trim()).includes(ref)) dod = prethodno + ", " + ref;
                    else if (prethodno) dod = prethodno;
                    await supabase.from("magacin")
                        .update({ status: punoRez ? "Rezervisano" : "Delimično rezervisano", dodeljeno_nalogu: dod, rezervisano: noviRez || null })
                        .eq("id", item.rolna_id);
                    // Istoriju beleži DB trigger (promena rezervisano/dodeljeno_nalogu).
                }
            }

            // Sačuvaj nalog za materijal — stvarna šema: status + parametri (jsonb)
            const nalogData = {
                status: "ceka_magacin",
                parametri: {
                    tip_naloga: "materijal",
                    tip_proizvoda: form.type,
                    naziv: form.naziv || "",
                    kupac: form.kupac || "",
                    sifra: form.sifra || "",
                    porucena_kolicina: kol,
                    kolicina_za_rad: kolPlus,
                    idealna_sirina: form.idealnaSirinaMaterijala || "",
                    izabrane_rolne: izborData,
                    template: form,
                    datum: new Date().toLocaleDateString("sr-RS"),
                },
            };

            const { data: nalogIns } = await supabase.from("materijali_nalozi").insert([nalogData]).select("id").single();
            const nalogId = nalogIns?.id || null;

            // Ledger: jedan red po (nalog × rolna × sloj) — izvor istine za analize.
            const idealnaSir = Number(form.idealnaSirinaMaterijala) || null;
            const stavke = izborData
                .filter(it => it.rolna_id && Number(it.alocirano_m) > 0 && !it.rucni)
                .map(it => ({
                    nalog_ref: ref,
                    materijali_nalog_id: nalogId,
                    rolna_id: it.rolna_id,
                    br_rolne: it.br_rolne,
                    sloj: it.sloj,
                    vrsta: it.snap_vrsta || null,
                    pod_vrsta: it.snap_pod_vrsta || null,
                    oznaka: it.snap_oznaka || null,
                    debljina: it.snap_debljina,
                    dobavljac: it.snap_dobavljac || null,
                    sirina: Number(it.sirina) || null,
                    idealna_sirina: idealnaSir,
                    alocirano_m: Number(it.alocirano_m) || 0,
                    kg_po_m: Number(it.kg_po_m) || 0,
                    kg_alocirano: Math.round(((Number(it.kg_po_m) || 0) * (Number(it.alocirano_m) || 0)) * 100) / 100,
                    status: "rezervisano",
                }));
            if (stavke.length) {
                const { error: stErr } = await supabase.from("materijal_stavke").insert(stavke);
                if (stErr) console.warn("materijal_stavke insert:", stErr.message);
            }
            setNalogSaved(true);
            msg && msg("✅ Nalog za materijal kreiran i poslat magacioneru!");
        } catch (e) {
            msg && msg("Greška: " + e.message, "err");
        }
        setNalogSaving(false);
    }
    // ────────────────────────────────────────────────────────

    async function loadTemplates() {
        try {
            // Product Master je tabela proizvodi. Ne koristimo vise proizvodi_template.
            const { data, error } = await supabase.from("proizvodi")
                .select("*").order("created_at", { ascending: false });
            if (error) throw error;
            const mapped = (Array.isArray(data) ? data : []).map(r => {
                const std = r.standardi || {};
                const rec = std.record || {};
                const tip = r.tip || std.tip || rec.tip || rec.data?.type || "folija";
                const layers = r.materijali_struktura || r.mats || rec.data?.[tip]?.layers || [];
                const dataForm = rec.data || {
                    type: tip,
                    naziv: r.naziv || "",
                    kupac: r.kupac || "",
                    sifra: r.sku || "",
                    product_master_id: r.product_master_id || ('PROD-' + r.id),
                    template_id: r.template_id || ('TPL-' + r.id),
                    template_version: r.template_version || 'V1',
                    idealnaSirinaMaterijala: r.sir || r.sirina || "",
                    [tip]: { layers }
                };
                return {
                    id: r.id,
                    db_id: r.id,
                    product_master_id: r.product_master_id || ('PROD-' + r.id),
                    template_id: r.template_id || ('TPL-' + r.id),
                    naziv: r.naziv || rec.naziv || "",
                    tip,
                    kupac: r.kupac || std.kupac || rec.kupac || "",
                    sku: r.sku || "",
                    template_version: r.template_version || std.template_version || rec.template_version || "V1",
                    operacije: r.operacije || rec.operacije || inferTemplateOperations(dataForm),
                    created_at: r.created_at || rec.created_at,
                    data: dataForm,
                };
            });
            setSaved(mapped);
        } catch (e) {
            setSaved([]);
            msg && msg("Product Master baza nije dostupna: " + (e?.message || e), "err");
        }
    }

    useEffect(() => { loadTemplates(); /* eslint-disable-next-line */ }, []);

    useEffect(() => {
        try {
            const raw = localStorage.getItem("maropack_pending_template_edit");
            if (!raw) return;
            const payload = JSON.parse(raw);
            const tpl = payload?.template;
            if (!tpl || typeof tpl !== "object") return;
            const next = { ...clone(tpl), db_id: payload.product_id || tpl.db_id || null, template_locked: true };
            setForm(next);
            setActiveTab(next.type || "folija");
            localStorage.removeItem("maropack_pending_template_edit");
            msg && msg("Template učitan iz Product Master baze");
        } catch (e) {
            msg && msg("Template nije učitan: " + (e?.message || e), "err");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function saveTemplate() {
        const record = makeTemplateRecord();
        if (!record.naziv) { msg && msg("Unesi naziv proizvoda", "err"); return; }
        try {
            const aktivni = record.data?.[record.tip] || {};
            const layers = aktivni.layers || [];
            const productMasterId = record.product_master_id || makeProductMasterIdFromTemplate(record.data);
            const templateId = record.template_id || record.id || ('TPL-' + Date.now());
            const payload = {
                tip: record.tip,
                naziv: record.naziv,
                kupac: record.kupac || null,
                sku: record.data?.sifra || null,
                status: "Aktivan",
                sir: Number(record.data?.idealnaSirinaMaterijala || record.data?.dimenzijaSirina) || null,
                met: Number(record.data?.porucenaKolicina) || null,
                mats: layers,
                res: { template: record.data, operacije: record.operacije || [] },
                product_master_id: productMasterId,
                template_id: templateId,
                template_version: record.template_version || "V1",
                operacije: record.operacije || inferTemplateOperations(record.data),
                materijali_struktura: layers,
                standardi: {
                    tip: record.tip,
                    kupac: record.kupac || null,
                    template_version: record.template_version || "V1",
                    record: { ...record, product_master_id: productMasterId, template_id: templateId },
                },
                datum: new Date().toLocaleDateString("sr-RS"),
            };

            const existingDbId = record.db_id || (typeof record.id === 'number' ? record.id : null);
            const query = existingDbId
                ? supabase.from("proizvodi").update(payload).eq("id", existingDbId).select()
                : supabase.from("proizvodi").insert([payload]).select();
            const { data, error } = await query;
            if (error) throw error;
            await loadTemplates();
            // Nove kombinacije materijala iz templejta -> trajno u material_master (deljeno)
            try {
                let dodato = 0;
                for (const l of layers) {
                    const vrsta = l?.vrsta || l?.tip;
                    if (!vrsta) continue;
                    const oznaka = l.oznaka_materijala || l.oznaka;
                    const debljina = l.debljina ?? l.deb;
                    if (masterHasCombo({ vrsta, oznaka, debljina })) continue;
                    const ok = await upsertMaterialToDb({
                        vrsta,
                        pod_vrsta: l.pod_vrsta,
                        oznaka,
                        debljina,
                        koeficijent: l.koeficijent ?? l.koef,
                        gsm: l.gm2 ?? l.gsm ?? l.tezina,
                        proizvodjac: l.proizvodjac || l.dobavljac,
                    });
                    if (ok) dodato++;
                }
                if (dodato) msg && msg(`Dodato u listu materijala: ${dodato} nov(ih)`, "ok");
            } catch (e) { /* nije kritično za čuvanje templejta */ }
            if (setDb) setDb(prev => ({ ...prev, proizvodi: data?.[0] ? [data[0], ...(prev?.proizvodi || [])] : (prev?.proizvodi || []) }));
            msg && msg("Template sačuvan u Product Master bazu (proizvodi)");
        } catch (e) {
            msg && msg("Template nije sačuvan u Product Master bazu: " + (e?.message || e), "err");
        }
    }

    function templateToCalculation(record) {
        const tpl = record?.data || form;
        const tip = record?.tip || tpl.type;
        const section = tpl[tip] || {};
        const naziv = record?.naziv || tpl.naziv || section.naziv || "Novi proizvod";
        const layers = section.layers || tpl.folija?.layers || [];
        const kolicina = tip === "kesa" ? Number(section.kolicina || 0) : tip === "spulna" ? Number(section.maxMetara || 0) : Number(section?.rezanje?.duzinaRolne || 0);
        return {
            id: "KAL-TPL-" + Date.now(),
            created_at: new Date().toISOString(),
            datum: new Date().toLocaleDateString("sr-RS"),
            tip,
            naziv,
            klijent: tpl.kupac || record?.kupac || "",
            kupac: tpl.kupac || record?.kupac || "",
            kolicina,
            status: "Draft iz template-a",
            verzija: 1,
            source_template_id: record?.template_id || record?.id || null,
            template_id: record?.template_id || record?.id || null,
            product_template_id: record?.template_id || record?.id || null,
            product_master_id: record?.product_master_id || tpl.product_master_id || makeProductMasterIdFromTemplate({ ...tpl, naziv }),
            template_version: record?.template_version || tpl.template_version || "V25",
            template_locked: true,
            operacije: record?.operacije || inferTemplateOperations(tpl),
            materijali: layers,
            mats: layers,
            osnovna_cena: 0,
            konacna_cena: 0,
            data: clone(tpl),
            template: clone(tpl),
            // ✅ V26: podaci za direktno punjenje pravog kalkulatora
            kalkulator_prefill: clone(tpl),
            napomena: "Kalkulacija kreirana iz Product Template Engine V26 — materijali i dimenzije se direktno mapiraju u kalkulator"
        };
    }

    async function createCalculationFromTemplate(record = null) {
        const sourceRecord = record || makeTemplateRecord();
        if (!sourceRecord.naziv) { msg && msg("Unesi naziv proizvoda pre kalkulacije", "err"); return; }
        const kal = templateToCalculation(sourceRecord);
        // localStorage hand-off za kalkulator + setDb (kao i pre)
        const existing = JSON.parse(localStorage.getItem("maropack_template_kalkulacije") || "[]");
        localStorage.setItem("maropack_template_kalkulacije", JSON.stringify([kal, ...existing]));
        localStorage.setItem("maropack_pending_template_calculation", JSON.stringify(kal));
        if (setDb) setDb(prev => ({ ...prev, kalkulacije: [kal, ...(prev?.kalkulacije || [])] }));
        // u bazu: tabela kalkulacije (slojevi iz templejta -> materijali_struktura, ceo form -> data)
        try {
            const { data, error } = await supabase.from("kalkulacije").insert([{
                tip: kal.tip,
                naziv: kal.naziv,
                klijent: kal.klijent || null,
                data: kal.data,
                materijali_struktura: kal.materijali || [],
                kolicina: Number(kal.kolicina) || null,
                osnovna_cena: 0,
                konacna_cena: 0,
                verzija: 1,
                status: "draft_template",
                product_master_id: kal.product_master_id || null,
                template_id: kal.template_id || null,
                template_version: kal.template_version || null,
                operacije: kal.operacije || [],
            }]).select();
            if (error) throw error;
            const novId = data && data[0] && data[0].id;
            if (novId) localStorage.setItem("maropack_pending_template_calculation", JSON.stringify({ ...kal, kalkulacija_id: novId, db_id: novId }));
            msg && msg("Kalkulacija sačuvana u bazu i otvorena u kalkulatoru");
        } catch (e) {
            msg && msg("Kalkulacija nije sačuvana u bazu: " + (e?.message || e), "err");
        }
        const targetPage = kal.tip === "folija" ? "kalk_folija" : kal.tip === "kesa" ? "kalk_kesa" : "kalk_spulna";
        setPage && setPage(targetPage);
    }

    async function createOfferDraft(record = null) {
        const sourceForm = record?.data || form;
        const sourceActiveData = sourceForm[sourceForm.type] || {};
        const naziv = record?.naziv || sourceForm.naziv || sourceActiveData.naziv || "Novi proizvod";
        const broj = "PON-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 9000 + 1000);
        const kol = sourceForm.type === "kesa" ? sourceForm.kesa?.kolicina : sourceForm.type === "spulna" ? sourceForm.spulna?.maxMetara : sourceForm.folija?.rezanje?.duzinaRolne;
        const layers = sourceActiveData.layers || [];
        const ponuda = {
            id: "PON-TPL-" + Date.now(), broj,
            datum: new Date().toLocaleDateString("sr-RS"), kupac: sourceForm.kupac || record?.kupac || "", naziv, tip: sourceForm.type, status: "Draft iz template-a", product_master_id: record?.product_master_id || sourceForm.product_master_id || makeProductMasterIdFromTemplate(sourceForm), template_id: record?.template_id || record?.id || null, product_template_id: record?.template_id || record?.id || null, template_version: record?.template_version || sourceForm.template_version || "V25", template_locked: true, operacije: inferTemplateOperations(sourceForm), template: clone(sourceForm),
            kol, nap: "Kreirano iz Product Template Engine"
        };
        const existing = JSON.parse(localStorage.getItem("maropack_template_ponude") || "[]");
        localStorage.setItem("maropack_template_ponude", JSON.stringify([ponuda, ...existing]));
        // u bazu: tabela ponude (struktura/mats = slojevi)
        try {
            const { error } = await supabase.from("ponude").insert([{
                broj,
                datum: ponuda.datum,
                kupac: ponuda.kupac || "—",
                naziv,
                proizvod: naziv,
                tip: sourceForm.type,
                kol: Number(kol) || null,
                kolicina: Number(kol) || null,
                struktura: layers,
                mats: layers,
                status: "draft_template",
                nap: ponuda.nap,
                product_master_id: ponuda.product_master_id || null,
                template_id: ponuda.template_id || null,
                template_version: ponuda.template_version || null,
                res: { template: clone(sourceForm), operacije: ponuda.operacije || [] },
            }]);
            if (error) throw error;
            msg && msg("Draft ponuda sačuvana u bazu");
        } catch (e) {
            msg && msg("Draft ponuda nije sačuvana u bazu: " + (e?.message || e), "err");
        }
        setPage && setPage("ponude");
    }

    function aiPrompt() {
        const naziv = form.naziv || activeData.naziv || "proizvod";
        const prompt = `Napravi kalkulaciju, ponudu i master nalog za ${naziv}. Tip: ${form.type}. Kupac: ${form.kupac || "nije definisan"}. Koristi V21 product template: materijali, KPDF/perforacija, finalna rolna/crtež kese/špulna dimenzije.`;
        localStorage.setItem("maropack_ai_prefill_prompt", prompt);
        msg && msg("AI prompt pripremljen");
        setPage && setPage("ai_workflow");
    }

    return <div style={{ padding: 18, background: "#f1f5f9", minHeight: "100vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
                <h2 style={{ margin: 0, fontSize: 24, color: "#0f172a", fontWeight: 950 }}>📦 {t("tmpl.engine_naslov")}</h2>
                <div style={{ color: "#64748b", fontSize: 13 }}>Centralna baza proizvoda za folije, kese i špulne — V26 Real Template Mapping → Kalkulacija → Ponuda → Master nalog — kalkulacija, ponuda, nalozi, QC i AI koriste isti template.</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={generisiNalogeMaterijal} style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 900, cursor: "pointer" }}>⚡ {t("tmpl.generisi_nalog")}</button>
                <button onClick={saveTemplate} style={{ background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 900, cursor: "pointer" }}>💾 {t("tmpl.sacuvaj_template")}</button>
                <button onClick={createOfferDraft} style={{ background: BLUE, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 900, cursor: "pointer" }}>📄 {t("tmpl.ponuda_iz_template")}</button>
                <button onClick={aiPrompt} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 900, cursor: "pointer" }}>🤖 {t("tmpl.ai_workflow")}</button>
            </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <ToggleButton active={form.type === "folija"} onClick={() => setType("folija")}>🎞️ {t("tmpl.folija")}</ToggleButton>
            <ToggleButton active={form.type === "kesa"} onClick={() => setType("kesa")}>🛍️ {t("tmpl.kesa")}</ToggleButton>
            <ToggleButton active={form.type === "spulna"} onClick={() => setType("spulna")}>🧵 {t("tmpl.spulna")}</ToggleButton>
        </div>

        <Section title={t("tmpl.osnovni")} color={GREEN}>
            {/* Red 1 — Identifikacija */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
                <Input label={t("tmpl.sifra")} value={form.sifra} onChange={v => update("sifra", v)} placeholder="interni kod" />
                <Input label={t("tmpl.kupac")} value={form.kupac} onChange={v => update("kupac", v)} placeholder="npr. Medomix" />
                <Input label={t("tmpl.naziv")} value={form.naziv} onChange={v => update("naziv", v)} placeholder="npr. MPML Crux Magnezijum 3g" />
                <Select label={t("tmpl.tip_proizvoda")} value={form.type} onChange={setType} options={["folija", "kesa", "spulna"]} />
            </div>
            {/* Red 2 — Količina + dimenzije (sakriveno za kesu — kesa ima svoju Količinu/Širinu/Dužinu dole) */}
            {form.type !== "kesa" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
                    <div>
                        <label style={labelStyle()}>{t("tmpl.porucena_kolicina")}</label>
                        <div style={{ display: "flex", gap: 6 }}>
                            <input type="number" value={form.porucenaKolicina || ""} placeholder="npr. 50000"
                                onChange={e => update("porucenaKolicina", e.target.value)} style={{ ...fieldStyle(), flex: 1 }} />
                            <select value={form.jedinicaUnosa || "m"} onChange={e => update("jedinicaUnosa", e.target.value)}
                                style={{ ...fieldStyle(), width: 82, fontWeight: 900, color: BLUE, background: "#eff6ff", cursor: "pointer" }}>
                                <option value="m">m</option>
                                <option value="kom">kom</option>
                                <option value="kg">kg</option>
                            </select>
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, fontWeight: 700 }}>
                            {form.jedinicaUnosa === "kom" ? "broj komada (etiketa/kesica)"
                                : form.jedinicaUnosa === "kg" ? "ukupna kilaža svih slojeva"
                                    : "metri GOTOVE trake"}
                        </div>
                    </div>
                    {(() => {
                        const ob = folijaObracun(form);
                        return <div>
                            <label style={labelStyle()}>Matična rolna +5% (auto)</label>
                            <input readOnly value={ob.metriMatPlus ? `${ob.metriMatPlus.toLocaleString("sr-RS")} m` : "—"}
                                style={{ ...fieldStyle(), background: "#f0fdf4", color: "#059669", fontWeight: 900, cursor: "default" }} />
                            <div style={{ fontSize: 10, color: "#059669", marginTop: 4, fontWeight: 800 }}>
                                {ob.N > 1 ? `${ob.N} traka → matična je ${ob.N}× kraća` : "1 traka"}
                            </div>
                        </div>;
                    })()}
                    <div>
                        <label style={labelStyle()}>Dimenzija — širina (mm)</label>
                        <input type="number" value={form.dimenzijaSirina || ""} placeholder="npr. 85"
                            onChange={e => update("dimenzijaSirina", e.target.value)} style={fieldStyle()} />
                    </div>
                    <div>
                        <label style={labelStyle()}>Dimenzija — dužina (mm)</label>
                        <input type="number" value={form.dimenzijaDuzina || ""} placeholder="npr. 110"
                            onChange={e => update("dimenzijaDuzina", e.target.value)} style={fieldStyle()} />
                    </div>
                </div>
            )}
            {/* Red 3 — Materijal + napomena */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12, marginBottom: 12 }}>
                <Input label={t("tmpl.idealna_sirina")} value={form.idealnaSirinaMaterijala}
                    onChange={v => update("idealnaSirinaMaterijala", v)} placeholder="npr. 750" />
                <Input label="Napomena" value={form.napomena || ""} onChange={v => update("napomena", v)} placeholder="interna napomena..." />
            </div>
            {/* AUTO KALKULACIJA — FOLIJA (poštuje broj traka, radi za kom/kg/m) */}
            {form.type === "folija" && (() => {
                const ob = folijaObracun(form);
                if (!ob.slojevi.length || (!ob.kom && !ob.metriMat)) return null;
                const Box = ({ l, v, hi, sub }) => (
                    <div style={{ background: "#fff", border: `1px solid ${hi ? "#86efac" : "#bbf7d0"}`, borderLeft: hi ? "5px solid #059669" : undefined, borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{l}</div>
                        <div style={{ fontSize: hi ? 20 : 16, fontWeight: 950, color: hi ? "#059669" : "#2446b8" }}>{v}</div>
                        {sub && <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>{sub}</div>}
                    </div>
                );
                const fmt = (x) => Number(x || 0).toLocaleString("sr-RS");
                return (
                    <div style={{ background: "#f0fdf4", border: "1px solid #059669", borderRadius: 12, padding: "14px 16px", marginTop: 4 }}>
                        <div style={{ fontWeight: 950, color: "#059669", fontSize: 13, marginBottom: 10 }}>
                            📊 Auto kalkulacija — unos u <span style={{ textTransform: "uppercase" }}>{form.jedinicaUnosa || "m"}</span>
                        </div>
                        {ob.greske.length > 0 && (
                            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 10px", marginBottom: 10, color: RED, fontSize: 12, fontWeight: 800 }}>
                                {ob.greske.map((g, i) => <div key={i}>⚠ {g}</div>)}
                            </div>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10, marginBottom: 10 }}>
                            <Box l="Komada" v={fmt(ob.kom)} sub={ob.N > 1 ? `${fmt(ob.komPoTraci)} po traci × ${ob.N}` : null} />
                            <Box l="Metri trake" v={`${fmt(ob.metriTrake)} m`} sub={`korak ${(ob.korakM * 1000).toFixed(0)} mm`} />
                            <Box l="Broj traka" v={ob.N} sub={ob.trakaMm ? `${ob.trakaMm} mm · otpad ${ob.otpadMm.toFixed(0)} mm` : null} />
                            <Box l="Ukupno g/m²" v={ob.totalGm2.toFixed(1)} sub={`${ob.sirMatMm} mm širina`} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginBottom: 10 }}>
                            <Box l="Matična rolna (neto)" v={`${fmt(ob.metriMat)} m`} />
                            <Box l={`Matična rolna +${ob.skartPct}%`} v={`${fmt(ob.metriMatPlus)} m`} hi sub="← ovo se skida iz magacina" />
                            <Box l="UKUPNO KG" v={`${fmt(ob.kgUkupno)} kg`} hi sub={`${fmt(ob.m2)} m²`} />
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {ob.slojevi.map((s, i) => (
                                <div key={i} style={{ background: "#fff", border: "1px solid #d1fae5", borderRadius: 8, padding: "7px 12px", fontSize: 12 }}>
                                    <span style={{ fontWeight: 950 }}>{s.naziv}</span>
                                    <span style={{ color: "#64748b", marginLeft: 8 }}>{s.gm2} g/m²</span>
                                    <span style={{ color: "#059669", fontWeight: 900, marginLeft: 8 }}>→ {fmt(s.kg)} kg</span>
                                    <span style={{ color: "#2446b8", fontWeight: 900, marginLeft: 8 }}>/ {fmt(s.metara)} m</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* AUTO KALKULACIJA — kesa / špulna (stara logika, nedirnuta) */}
            {form.type !== "folija" && (() => {
                const kol = Math.ceil(Number(form.porucenaKolicina || 0) * 1.05);
                const layers = form.type === "kesa" ? (form.kesa?.layers || []) : (form.spulna?.layers || []);
                const validLayers = layers.filter(l => Number(l.gm2 || l.tezina || l.tezinaGm2 || 0) > 0);
                if (!kol || !validLayers.length) return null;
                const totalGm2 = validLayers.reduce((a, l) => a + Number(l.gm2 || l.tezina || l.tezinaGm2 || 0), 0);
                const sirinaM = Number(form.dimenzijaSirina || form.idealnaSirinaMaterijala || form.folija?.rezanje?.sirinaMaterijala || 0) / 1000;
                const kgUkupno = sirinaM > 0 ? (totalGm2 * sirinaM * kol / 1000).toFixed(1) : null;
                return (
                    <div style={{ background: "#f0fdf4", border: "1px solid #059669", borderRadius: 12, padding: "14px 16px", marginTop: 4 }}>
                        <div style={{ fontWeight: 950, color: "#059669", fontSize: 13, marginBottom: 10 }}>📊 Auto kalkulacija — materijal potreban za narudžbu</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 10, marginBottom: validLayers.length > 0 ? 10 : 0 }}>
                            <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Poručeno</div>
                                <div style={{ fontSize: 16, fontWeight: 950, color: "#2446b8" }}>{Number(form.porucenaKolicina || 0).toLocaleString("sr-RS")} m</div>
                            </div>
                            <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>+5% za rad</div>
                                <div style={{ fontSize: 16, fontWeight: 950, color: "#059669" }}>{kol.toLocaleString("sr-RS")} m</div>
                            </div>
                            <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{t("tmpl.ukupno_gm2")}</div>
                                <div style={{ fontSize: 16, fontWeight: 950, color: "#2446b8" }}>{totalGm2.toFixed(1)} g/m²</div>
                            </div>
                            {sirinaM > 0 && <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Širina mat.</div>
                                <div style={{ fontSize: 16, fontWeight: 950, color: "#2446b8" }}>{(sirinaM * 1000).toFixed(0)} mm</div>
                            </div>}
                            {kgUkupno && <div style={{ background: "#fff", border: "1px solid #86efac", borderLeft: "5px solid #059669", borderRadius: 10, padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, color: "#064e3b", fontWeight: 900, textTransform: "uppercase" }}>UKUPNO KG</div>
                                <div style={{ fontSize: 20, fontWeight: 950, color: "#059669" }}>{Number(kgUkupno).toLocaleString("sr-RS")} kg</div>
                            </div>}
                        </div>
                        {validLayers.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {validLayers.map((l, i) => {
                                const gm2 = Number(l.gm2 || l.tezina || l.tezinaGm2 || 0);
                                const kgSloj = sirinaM > 0 ? (gm2 * sirinaM * kol / 1000).toFixed(1) : null;
                                return <div key={i} style={{ background: "#fff", border: "1px solid #d1fae5", borderRadius: 8, padding: "7px 12px", fontSize: 12 }}>
                                    <span style={{ fontWeight: 950 }}>{l.material || l.materijal || l.nazivMaterijala || `Sloj ${i + 1}`}</span>
                                    <span style={{ color: "#64748b", marginLeft: 8 }}>{gm2} g/m²</span>
                                    {kgSloj && <span style={{ color: "#059669", fontWeight: 900, marginLeft: 8 }}>→ {kgSloj} kg</span>}
                                    <span style={{ color: "#2446b8", fontWeight: 900, marginLeft: 8 }}>/ {kol.toLocaleString("sr-RS")} m</span>
                                </div>;
                            })}
                        </div>}
                    </div>
                );
            })()}
        </Section>

        {form.type === "folija" && (
            <>
                <Section title={t("tmpl.materijali")} color={BLUE}>
                    <MaterialLayersOneRowTable
                        title={t("tmpl.materijali_folije")}
                        layers={form.folija.layers || []}
                        showKg
                        showMetara
                        showCena
                        idealnaSirina={form.idealnaSirinaMaterijala || form.folija?.rezanje?.sirinaMaterijala || ""}
                        porucenaKolicina={folijaObracun(form).metriMat || ""}
                        onAdd={() => addLayer("folija")}
                        onRemove={(i) => removeLayer("folija", i)}
                        onPatch={(i, patch) => {
                            Object.entries(patch).forEach(([key, value]) => updateLayer("folija", i, key, value));
                        }}
                    />
                </Section>

                <Section title={t("tmpl.stampa_param")} color={BLUE}>
                    <Grid cols={4}>
                        {Object.keys(form.folija.stampa).filter(k => k !== "dizajn" && k !== "boje").map(k => (
                            <Input key={k} label={k} value={form.folija.stampa[k]} onChange={v => update(`folija.stampa.${k}`, v)} />
                        ))}
                    </Grid>
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #e2e8f0" }}>
                        <BojeStampeEditor value={form.folija.stampa.boje} onChange={v => update("folija.stampa.boje", v)} />
                    </div>
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #e2e8f0" }}>
                        <div style={{ fontWeight: 900, color: "#1d4ed8", marginBottom: 8 }}>Dizajn na finalnoj rolni (JPEG / PNG / PDF)</div>
                        <RolnaDizajnEditor value={form.folija.stampa.dizajn} onChange={v => update("folija.stampa.dizajn", v)} />
                    </div>
                </Section>

                <Section title={t("tmpl.kasiranje")} color={BLUE}>
                    <Grid cols={3}>
                        <div>
                            <label style={labelStyle()}>Broj kaširanja (auto)</label>
                            <input readOnly style={{ ...fieldStyle(), background: "#f0fdf4", color: "#059669", fontWeight: 900 }}
                                value={form.folija.kasiranje.brojKasiranja || "—"} title="Auto = broj slojeva − 1" />
                        </div>
                        <div style={{ gridColumn: "span 2" }}>
                            <label style={labelStyle()}>Spoj materijala (auto · vrsta + oznaka + debljina)</label>
                            <input readOnly style={{ ...fieldStyle(), background: "#f0fdf4", color: "#059669", fontWeight: 900 }}
                                value={(form.folija.layers || []).map(l => [l.vrsta, (l.oznaka_materijala || l.oznaka), ((l.debljina ?? l.deb) ? (l.debljina ?? l.deb) + (String(l.vrsta).toUpperCase() === "PAPIR" ? " g/m²" : " µm") : "")].filter(Boolean).join(" ")).filter(Boolean).join("  +  ") || "—"} />
                        </div>
                        {Object.keys(form.folija.kasiranje).filter(k => k !== "brojKasiranja" && k !== "materijali").map(k => (
                            <Input key={k} label={k} value={form.folija.kasiranje[k]} onChange={v => update(`folija.kasiranje.${k}`, v)} />
                        ))}
                        <Input label="Predlog valjka za kaširanje" value={form.folija.rezanje.predlogValjkaKasiranja || predloziValjakKasiranja(form.idealnaSirinaMaterijala) || ""} onChange={v => update("folija.rezanje.predlogValjkaKasiranja", v)} />
                    </Grid>
                </Section>

                <Section title={t("tmpl.rezanje")} color={BLUE}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 14 }}>
                        <div>
                            <label style={labelStyle()}>{t("tmpl.sirina_materijala")}</label>
                            <input style={{ ...fieldStyle(), background: "#eff6ff", color: "#2446b8", fontWeight: 900 }}
                                value={form.folija.rezanje.sirinaMaterijala || form.idealnaSirinaMaterijala || ""}
                                onChange={e => update("folija.rezanje.sirinaMaterijala", e.target.value)} placeholder={t("ph.auto_idealna")} />
                        </div>
                        <div>
                            <label style={labelStyle()}>{t("tmpl.sirina_trake")}</label>
                            <input style={{ ...fieldStyle(), background: form.folija.rezanje.sirinaTrake ? "#fff" : "#eff6ff", color: "#2446b8" }}
                                value={form.folija.rezanje.sirinaTrake || form.dimenzijaSirina || ""}
                                onChange={e => update("folija.rezanje.sirinaTrake", e.target.value)} placeholder={t("ph.auto_dim")} />
                        </div>
                        <div>
                            <label style={labelStyle()}>{t("tmpl.broj_traka")}</label>
                            <input readOnly style={{ ...fieldStyle(), background: "#f0fdf4", color: "#059669", fontWeight: 900 }}
                                value={form.folija.rezanje.brojTraka || "—"} title="Računa se: širina materijala ÷ širina trake" />
                        </div>
                        <div>
                            <label style={labelStyle()}>{t("tmpl.duzina_rolne")}</label>
                            <input style={{ ...fieldStyle(), background: form.folija.rezanje.duzinaRolne ? "#fff" : "#eff6ff", color: "#2446b8" }}
                                value={form.folija.rezanje.duzinaRolne || form.porucenaKolicina || ""}
                                onChange={e => update("folija.rezanje.duzinaRolne", e.target.value)} placeholder={t("ph.auto_porucena")} />
                        </div>
                        <div>
                            <label style={labelStyle()}>{t("tmpl.precnik_rolne")}</label>
                            <input style={fieldStyle()} value={form.folija.rezanje.precnikRolne || ""}
                                onChange={e => update("folija.rezanje.precnikRolne", e.target.value)} placeholder="npr. 400" />
                        </div>
                        <div>
                            <label style={labelStyle()}>{t("tmpl.dorada")}</label>
                            <input style={fieldStyle()} value={form.folija.rezanje.dorada || ""}
                                onChange={e => update("folija.rezanje.dorada", e.target.value)} />
                        </div>
                        <div>
                            <label style={labelStyle()}>{t("tmpl.smer_gp")}</label>
                            <input style={fieldStyle()} value={form.folija.rezanje.smerGP || ""}
                                onChange={e => update("folija.rezanje.smerGP", e.target.value)} />
                        </div>
                        <div>
                            <label style={labelStyle()}>{t("tmpl.sirine_traka")}</label>
                            <input style={fieldStyle()} value={form.folija.rezanje.sirineTraka || ""}
                                onChange={e => update("folija.rezanje.sirineTraka", e.target.value)} placeholder="npr. 85,85,85,85" />
                        </div>
                        <div>
                            <label style={labelStyle()}>Predlog valjka kaširanja</label>
                            <input readOnly style={{ ...fieldStyle(), background: "#f0fdf4", color: "#059669", fontWeight: 900 }}
                                value={form.folija.rezanje.predlogValjkaKasiranja || predloziValjakKasiranja(form.idealnaSirinaMaterijala) || "auto"} />
                        </div>
                    </div>
                    <div style={{ marginTop: 4 }}>
                        <RollPreview folija={form.folija} idealna={form.idealnaSirinaMaterijala} />
                    </div>
                </Section>

                <Section title={t("tmpl.kpdf")} color={ORANGE}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 900, marginBottom: 12 }}>
                        <input
                            type="checkbox"
                            checked={!!form.folija.kpdf.enabled}
                            onChange={() => update("folija.kpdf.enabled", !form.folija.kpdf.enabled)}
                        />
                        Ima KPDF / perforaciju
                    </label>
                    <Grid cols={4}>
                        {Object.keys(form.folija.kpdf).filter(k => k !== "enabled").map(k => (
                            <Input key={k} label={k} value={form.folija.kpdf[k]} onChange={v => update(`folija.kpdf.${k}`, v)} />
                        ))}
                    </Grid>
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #fed7aa" }}>
                        <div style={{ fontWeight: 900, color: "#9a3412", marginBottom: 8 }}>Crtež perforacije (kotirano)</div>
                        <PerforacijaEditor value={form.folija.perforacija} dizajn={form.folija.stampa.dizajn} onChange={v => update("folija.perforacija", v)} />
                    </div>
                </Section>
            </>
        )}

        {form.type === "kesa" && (
            <>
                <Section title={t("tmpl.kesa_osnovni")} color={GREEN}>
                    <Grid cols={4}>
                        {[["kolicina", t("tmpl.kesa_kolicina")], ["skart", t("tmpl.skart")], ["datum", t("common.datum")]].map(([k, l]) => (
                            <Input key={k} label={l} value={form.kesa[k]} onChange={v => update(`kesa.${k}`, v)} />
                        ))}
                        <div>
                            <label style={labelStyle()}>{t("tmpl.potrebno_materijala")}</label>
                            <input readOnly value={(() => { const m = orderMetraze(form).kolPlus; return m ? m.toLocaleString("sr-RS") + " m" : "—"; })()}
                                style={{ ...fieldStyle(), background: "#f0fdf4", color: "#059669", fontWeight: 900, cursor: "default" }}
                                title="kom × (dužina+klapna+falta) ÷ ban × (1+škart%)" />
                        </div>
                    </Grid>
                    {(() => {
                        const m = orderMetraze(form);
                        if (!m.kom) return null;
                        return <div style={{ marginTop: 10, fontSize: 12, color: "#475569", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 8, padding: "8px 10px" }}>
                            📐 <b>{m.kom.toLocaleString("sr-RS")} kom</b> × <b>{(m.duzM * 1000).toFixed(0)} mm</b> (dužina+klapna+falta) = <b>{m.mTrake.toLocaleString("sr-RS")} m</b> trake
                            &nbsp;÷&nbsp; <b style={{ color: m.ban > 1 ? "#b91c1c" : "#475569" }}>{m.ban} ban</b>
                            &nbsp;×&nbsp; <b>(1 + {Number(form.kesa.skart) || 0}%)</b> škart
                            &nbsp;=&nbsp; <b style={{ color: "#059669" }}>{m.kolPlus.toLocaleString("sr-RS")} m</b> matične rolne
                            {m.ban > 1 && <div style={{ marginTop: 4, color: "#b91c1c", fontWeight: 700 }}>
                                Ban {m.ban} → matična rolna je {m.ban}× kraća nego ukupna dužina traka.
                            </div>}
                        </div>;
                    })()}
                </Section>

                <Section title={t("tmpl.dimenzije_kese")} color={BLUE}>
                    <Grid cols={4}>
                        <Select label={t("tmpl.tip_kese")} value={form.kesa.tipKese || "flach"} onChange={v => setForm(prev => {
                            const n = clone(prev);
                            n.kesa.tipKese = v;
                            n.kesa.options = { ...(n.kesa.options || {}) };
                            (KESA_TIP_PRESET[v] || []).forEach(k => { n.kesa.options[k] = true; });
                            return n;
                        })} options={Object.entries(TIPOVI).map(([k, v]) => ({ value: k, label: v.n }))} />
                        {["sirina", "duzina", "klapna", "falta", "takt", "ban", "tolerancija", "grafika"].map(k => (
                            <Input key={k} label={k} value={form.kesa[k]} onChange={v => update(`kesa.${k}`, v)} />
                        ))}
                    </Grid>
                </Section>

                <Section title={t("tmpl.materijali")} color={GREEN}>
                    <MaterialLayersOneRowTable
                        title={t("tmpl.materijali_kese")}
                        layers={form.kesa.layers || []}
                        showCena
                        idealnaSirina={form.idealnaSirinaMaterijala}
                        porucenaKolicina={form.kesa.kolicina}
                        onAdd={() => addLayer("kesa")}
                        onRemove={(i) => removeLayer("kesa", i)}
                        onPatch={(i, patch) => {
                            Object.entries(patch).forEach(([key, value]) => updateLayer("kesa", i, key, value));
                        }}
                    />
                </Section>

                <Section title={t("tmpl.opcije")} color={ORANGE}>
                    {KESA_GRUPE.map(grupa => (
                        <div key={grupa.id} style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 6px" }}>
                                <span style={{ width: 8, height: 8, borderRadius: 2, background: grupa.c }} />
                                <span style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: 800, color: "#334155" }}>{t("grupa." + grupa.id, grupa.l)}</span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                                {KESA_OPCIJE.filter(op => grupa.keys.includes(op.k)).map(op => {
                                    const on = !!(form.kesa.options || {})[op.k];
                                    const sel = (form.kesa.optSel || {})[op.k] || "";
                                    const pos = (form.kesa.positions || {})[op.k] || {};
                                    const txt = (form.kesa.optText || {})[op.k] || {};
                                    const setOpt = (patch) => setForm(prev => {
                                        const n = clone(prev);
                                        n.kesa.options = n.kesa.options || {};
                                        n.kesa.optSel = n.kesa.optSel || {};
                                        n.kesa.positions = n.kesa.positions || {};
                                        n.kesa.optText = n.kesa.optText || {};
                                        if (patch.on !== undefined) n.kesa.options[op.k] = patch.on;
                                        if (patch.sel !== undefined) n.kesa.optSel[op.k] = patch.sel;
                                        if (patch.pos) n.kesa.positions[op.k] = { ...(n.kesa.positions[op.k] || {}), ...patch.pos };
                                        if (patch.txt) n.kesa.optText[op.k] = { ...(n.kesa.optText[op.k] || {}), ...patch.txt };
                                        return n;
                                    });
                                    return (
                                        <div key={op.k} style={{ border: "1px solid #dbe3ef", borderRadius: 8, padding: "8px 10px", background: on ? "#ecfdf5" : "#fff" }}>
                                            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, color: "#334155", cursor: "pointer", fontSize: 13 }}>
                                                <input type="checkbox" checked={on} onChange={e => setOpt({ on: e.target.checked, sel: (op.tip === "danet" && e.target.checked) ? "DA" : sel })} /> {t("opt." + op.k, op.l)}
                                            </label>
                                            {on && (
                                                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                                                    {op.tip === "lista" && (
                                                        <select value={sel} onChange={e => setOpt({ sel: e.target.value })} style={fieldStyle()}>
                                                            <option value="">{t("ph.izaberi")}</option>
                                                            {op.vals.map(v => <option key={v} value={v}>{v}</option>)}
                                                        </select>
                                                    )}
                                                    {op.tip === "broj" && (
                                                        <input type="number" placeholder={op.l + " (" + (op.jed || "") + ")"} value={sel} onChange={e => setOpt({ sel: e.target.value })} style={fieldStyle()} />
                                                    )}
                                                    {(op.pos || []).length > 0 && (
                                                        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(op.pos.length, 4)}, 1fr)`, gap: 6 }}>
                                                            {op.pos.map(pf => (
                                                                <div key={pf}>
                                                                    <label style={{ fontSize: 9.5, color: "#64748b", fontWeight: 700, display: "block" }}>{t("pos." + pf, POS_LBL[pf])}</label>
                                                                    <input value={pos[pf] || ""} onChange={e => setOpt({ pos: { [pf]: e.target.value } })} style={fieldStyle()} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {(op.tekstPolja || []).map(tp => (
                                                        <div key={tp.k}>
                                                            <label style={{ fontSize: 9.5, color: "#64748b", fontWeight: 700, display: "block" }}>{tp.l}</label>
                                                            <input value={txt[tp.k] || ""} onChange={e => setOpt({ txt: { [tp.k]: e.target.value } })} style={fieldStyle()} />
                                                        </div>
                                                    ))}
                                                    {op.food && (
                                                        <div style={{ fontSize: 11, color: "#065f46", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, padding: "6px 8px", lineHeight: 1.4 }}>{FOOD_TEXT}</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </Section>

                <Section title={t("tmpl.crtez")} color={BLUE}>
                    <CrtezKese config={kesaToConfig(toCrtezKesa(form.kesa))} width="100%" />
                </Section>

                <Section title={t("tmpl.transport")} color={GREEN}>
                    <Grid cols={3}>
                        <Input label="Cena transporta €/kg" value={form.kesa.transportKg} onChange={v => update("kesa.transportKg", v)} />
                        <Input label="Pakovanje" value={form.kesa.pakovanje} onChange={v => update("kesa.pakovanje", v)} />
                        <Input label="Napomena" value={form.napomena} onChange={v => update("napomena", v)} />
                    </Grid>
                </Section>
            </>
        )}

        {form.type === "spulna" && <>
            <Section title="Špulna — osnovni podaci" color="#7c3aed">
                <Grid cols={4}>
                    <Input label="Naziv" value={form.spulna.naziv} onChange={v => update("spulna.naziv", v)} placeholder="npr. Trake 20mm - 20 000m" />
                    <Input label="Materijal / opis" value={form.spulna.materijal} onChange={v => update("spulna.materijal", v)} placeholder="npr. Papir silikonizirani 60 gr" />
                    <Input label="Side A" value={form.spulna.sideA} onChange={v => update("spulna.sideA", v)} placeholder="Silikon" />
                    <Input label="Side B" value={form.spulna.sideB} onChange={v => update("spulna.sideB", v)} placeholder="Papir" />
                </Grid>
                <Grid cols={4}>
                    <div>
                        <label style={labelStyle()}>Poručena količina</label>
                        <div style={{ display: "flex", gap: 6 }}>
                            <input type="number" value={form.spulna.kolicina || ""} placeholder="npr. 62400"
                                onChange={e => update("spulna.kolicina", e.target.value)} style={{ ...fieldStyle(), flex: 1 }} />
                            <select value={form.spulna.jedinicaUnosa || "m2"} onChange={e => update("spulna.jedinicaUnosa", e.target.value)}
                                style={{ ...fieldStyle(), width: 88, fontWeight: 900, color: "#7c3aed", background: "#f5f3ff", cursor: "pointer" }}>
                                <option value="m2">m²</option>
                                <option value="kom">špulni</option>
                                <option value="kg">kg</option>
                                <option value="m">m trake</option>
                            </select>
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, fontWeight: 700 }}>
                            {form.spulna.jedinicaUnosa === "kom" ? "broj špulni"
                                : form.spulna.jedinicaUnosa === "kg" ? "ukupna kilaža materijala"
                                    : form.spulna.jedinicaUnosa === "m" ? "ukupni metri trake"
                                        : "poručeno m² (kao u Excel nalogu)"}
                        </div>
                    </div>
                    <Input label="Škart (%)" value={form.spulna.skart} onChange={v => update("spulna.skart", v)} placeholder="0" />
                    {(() => {
                        const izabrana = kutijaPoKljucu(form.spulna.kutija);
                        const gr = izabrana ? proveriKutiju(izabrana, form.spulna) : [];
                        const predlog = predloziKutiju(form.spulna);
                        return <div>
                            <label style={labelStyle()}>Pakovanje u kutije</label>
                            <select value={form.spulna.kutija || ""} onChange={e => {
                                const b = kutijaPoKljucu(e.target.value);
                                setForm(prev => {
                                    const n = clone(prev);
                                    n.spulna.kutija = e.target.value;
                                    // predlog po dubini kutije — operater ga može ručno promeniti
                                    if (b) n.spulna.rolniPoPaleti = String(poPaletiZa(b));
                                    return n;
                                });
                            }} style={{ ...fieldStyle(), fontWeight: 800, cursor: "pointer", borderColor: gr.length ? RED : undefined }}>
                                <option value="">— izaberi kutiju —</option>
                                {KUTIJE.map(b => <option key={b.k} value={b.k}>{KUTIJA_LBL(b)}</option>)}
                            </select>
                            {gr.length > 0 && <div style={{ fontSize: 10, color: RED, marginTop: 4, fontWeight: 800 }}>
                                {gr.map((g, i) => <div key={i}>⚠ {g}</div>)}
                                {predlog && <div style={{ color: "#059669" }}>→ Predlog: {KUTIJA_LBL(predlog)}</div>}
                            </div>}
                            {!form.spulna.kutija && predlog && <div style={{ fontSize: 10, color: "#059669", marginTop: 4, fontWeight: 800 }}>
                                → Odgovara: {KUTIJA_LBL(predlog)}
                            </div>}
                            {izabrana && !gr.length && <div style={{ fontSize: 10, color: "#059669", marginTop: 4, fontWeight: 800 }}>
                                ✓ Ø{form.spulna.D || "—"} i T={form.spulna.T || "—"} staju · hilzna Ø{izabrana.hilzna}
                            </div>}
                        </div>;
                    })()}
                    {(() => {
                        const b = kutijaPoKljucu(form.spulna.kutija);
                        const pred = b ? poPaletiZa(b) : 0;
                        const rucno = pred && Number(form.spulna.rolniPoPaleti) !== pred;
                        return <div>
                            <Input label="Rolni po paleti" value={form.spulna.rolniPoPaleti} onChange={v => update("spulna.rolniPoPaleti", v)} placeholder="18" />
                            {b && <div style={{ fontSize: 10, marginTop: 4, fontWeight: 800, color: rucno ? "#d97706" : "#64748b" }}>
                                {rucno
                                    ? <>✎ ručno izmenjeno (predlog za dubinu {b.d} mm je {pred})</>
                                    : <>predlog: kutija dubine {b.d} mm → {pred} po paleti · može se menjati</>}
                            </div>}
                        </div>;
                    })()}
                </Grid>
                <Grid cols={1}>
                    <Input label="Napomena (ide crveno na nalog)" value={form.spulna.napomena} onChange={v => update("spulna.napomena", v)} placeholder="npr. Silikon spolja, papir unutra" />
                </Grid>

                {/* AUTO KALKULACIJA — ŠPULNA */}
                {(() => {
                    const ob = spulnaObracun(form);
                    if (!ob.m2Rad && !ob.spulni) return null;
                    const fmt = (x) => Number(x || 0).toLocaleString("sr-RS");
                    const Box = ({ l, v, hi, sub }) => (
                        <div style={{ background: "#fff", border: `1px solid ${hi ? "#c4b5fd" : "#ddd6fe"}`, borderLeft: hi ? "5px solid #7c3aed" : undefined, borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>{l}</div>
                            <div style={{ fontSize: hi ? 20 : 16, fontWeight: 950, color: hi ? "#7c3aed" : "#4c1d95" }}>{v}</div>
                            {sub && <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>{sub}</div>}
                        </div>
                    );
                    return (
                        <div style={{ background: "#faf5ff", border: "1px solid #7c3aed", borderRadius: 12, padding: "14px 16px", marginTop: 12 }}>
                            <div style={{ fontWeight: 950, color: "#7c3aed", fontSize: 13, marginBottom: 10 }}>
                                🧵 Auto kalkulacija — unos u <span style={{ textTransform: "uppercase" }}>{ob.jed === "m2" ? "m²" : ob.jed}</span>
                            </div>
                            {ob.greske.length > 0 && (
                                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 10px", marginBottom: 10, color: RED, fontSize: 12, fontWeight: 800 }}>
                                    {ob.greske.map((g, i) => <div key={i}>⚠ {g}</div>)}
                                </div>
                            )}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10, marginBottom: 10 }}>
                                <Box l="Za rad m²" v={fmt(ob.m2Rad) + " m²"} sub={ob.skart ? `+${ob.skart}% škart` : null} />
                                <Box l="Metara trake" v={fmt(ob.ukupnoM) + " m"} sub={`W = ${ob.W} mm`} />
                                <Box l="Špulni" v={fmt(ob.spulni)} sub={`max ${fmt(ob.maxM)} m / špulni`} />
                                <Box l="Broj traka" v={ob.N} sub={`${ob.sirMat} mm · otpad ${ob.otpad} mm`} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10, marginBottom: 10 }}>
                                <Box l="Hilzni" v={fmt(ob.hilzne) + " kom"} />
                                <Box l="Kutija" v={fmt(ob.kutije) + " kom"} sub={`${ob.palete.toFixed(1)} paleta`} />
                                <Box l="Matična rolna" v={fmt(ob.metriMat) + " m"} hi sub="← skida se iz magacina" />
                                <Box l="Potrebno KG" v={fmt(ob.kg) + " kg"} hi sub={`${fmt(ob.gm2)} g/m²`} />
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {ob.slojevi.map((l, i) => (
                                    <div key={i} style={{ background: "#fff", border: "1px solid #ede9fe", borderRadius: 8, padding: "7px 12px", fontSize: 12 }}>
                                        <span style={{ fontWeight: 950 }}>{l.naziv}</span>
                                        <span style={{ color: "#64748b", marginLeft: 8 }}>{l.gm2} g/m²</span>
                                        <span style={{ color: "#7c3aed", fontWeight: 900, marginLeft: 8 }}>→ {fmt(l.kg)} kg</span>
                                        <span style={{ color: "#4c1d95", fontWeight: 900, marginLeft: 8 }}>/ {fmt(l.metara)} m</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}
            </Section>
            <Section title="Materijali špulne" color="#7c3aed">
                <MaterialLayersOneRowTable
                    title={t("tmpl.materijali_spulne")}
                    layers={form.spulna.layers || []}
                    showCena
                    onAdd={() => addLayer("spulna")}
                    onRemove={(i) => removeLayer("spulna", i)}
                    onPatch={(i, patch) => {
                        Object.entries(patch).forEach(([key, value]) => updateLayer("spulna", i, key, value));
                    }}
                />
            </Section>
            <SpoolDrawing spulna={form.spulna} update={update} />
        </>}

        <Section title={"📚 " + t("tmpl.biblioteka")} color="#0f172a">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
                <div style={{ ...cardStyle(), padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>Ukupno</div><div style={{ fontSize: 24, fontWeight: 950 }}>{saved.length}</div></div>
                <div style={{ ...cardStyle(), padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>Folije</div><div style={{ fontSize: 24, fontWeight: 950, color: BLUE }}>{saved.filter(t => t.tip === "folija").length}</div></div>
                <div style={{ ...cardStyle(), padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>Kese</div><div style={{ fontSize: 24, fontWeight: 950, color: ORANGE }}>{saved.filter(t => t.tip === "kesa").length}</div></div>
                <div style={{ ...cardStyle(), padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>Špulne</div><div style={{ fontSize: 24, fontWeight: 950, color: "#7c3aed" }}>{saved.filter(t => t.tip === "spulna").length}</div></div>
            </div>
            {saved.length === 0 ? <div style={{ color: "#64748b" }}>Još nema sačuvanih template-a u Product Master bazi. Popuni foliju/kesu/špulnu i klikni „Sačuvaj template”.</div> : <div style={{ display: "grid", gap: 10 }}>
                {saved.map(t => <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "#fff" }}>
                    <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <b style={{ fontSize: 15 }}>{t.naziv}</b>
                            <span style={{ borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 900, background: t.tip === "folija" ? "#eef2ff" : t.tip === "kesa" ? "#fff7ed" : "#f5f3ff", color: t.tip === "folija" ? BLUE : t.tip === "kesa" ? "#c2410c" : "#7c3aed" }}>{t.tip}</span>
                            <span style={{ color: "#64748b", fontSize: 12 }}>{t.kupac || "bez kupca"}</span>
                        </div>
                        <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>ID: {t.product_master_id || t.id} · verzija: {t.template_version || "V26"} · sačuvano: {t.created_at ? new Date(t.created_at).toLocaleDateString("sr-RS") : "—"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button onClick={() => { setForm(clone(t.data)); setActiveTab(t.tip); msg && msg("Template učitan"); }} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 800, cursor: "pointer" }}>📝 Otvori</button>
                        <button onClick={() => createCalculationFromTemplate(t)} style={{ border: "none", background: GREEN, color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 900, cursor: "pointer" }}>🧮 Kreiraj kalkulaciju</button>
                        <button onClick={() => createOfferDraft(t)} style={{ border: "none", background: BLUE, color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 900, cursor: "pointer" }}>📄 Kreiraj ponudu</button>
                        <button onClick={async () => { const next = saved.filter(x => x.id !== t.id); setSaved(next); try { await supabase.from("proizvodi").delete().eq("id", t.id); } catch (e) { msg && msg("Brisanje u bazi nije uspelo: " + (e?.message || e), "err"); } msg && msg("Template obrisan"); }} style={{ border: "none", background: RED, color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 900, cursor: "pointer" }}>🗑️</button>
                    </div>
                </div>)}
            </div>}
        </Section>

        {/* ════ MODAL ZA NALOG MATERIJALA ════ */}
        {nalogModal && (() => {
            const layers = (form.type === "folija" ? form.folija?.layers : form.type === "kesa" ? form.kesa?.layers : form.spulna?.layers) || [];
            const { kol, kolPlus } = orderMetraze(form);
            const sir = Number(form.idealnaSirinaMaterijala) || 0;
            const sirinaM = sir / 1000;
            const COLORS_M = ["#2446b8", "#059669", "#d97706", "#7c3aed", "#dc2626"];
            const ROLES_M = ["Spoljašnji / štampa", "Srednji sloj", "Unutrašnji / var", "Sloj 4", "Sloj 5"];

            function num(v) { return Number(String(v || "").replace(",", ".")) || 0; }
            function fmt(n) { return n ? Number(n).toLocaleString("sr-RS") : "—"; }
            function val(v) { return (v === undefined || v === null || v === "") ? "—" : v; }

            function kandidatiZaSloj(layer) {
                const base = { ideal: Number(form.idealnaSirinaMaterijala) || 0, samoDostupne: true, potrebnoM: kolPlus };
                const strogo = rangirajRolne(nalogRolne, layer, base);
                if (strogo.length || !base.ideal) return strogo;
                // Nema rolne tačne debljine u idealnoj širini → prikaži rolne bliske po debljini (±3µ),
                // ali NIKAD uže od idealne — samo širina ≥ idealna. Poređano: manja debljina → FIFO → šira.
                const siri = rangirajRolne(nalogRolne, layer, { ...base, ignoreWidth: true })
                    .filter(r => (Number(r.sirina) || 0) >= (base.ideal - (base.sirinaTolerancija || 1)));
                return siri.slice().sort((a, b) => {
                    const dba = Number(a.deb) || 0, dbb = Number(b.deb) || 0;
                    if (dba !== dbb) return dba - dbb;                         // manja debljina prvo
                    const da = rolnaDatum(a), db = rolnaDatum(b);
                    if (da !== db) return da - db;                             // FIFO
                    return (Number(a.sirina) || 0) - (Number(b.sirina) || 0);  // bliža idealnoj (uža od širih) prvo
                });
            }

            // --- rad sa kombinacijom rolni po sloju ---
            function izabraneZa(i) {
                return Array.isArray(nalogIzbor[i]) ? nalogIzbor[i] : (nalogIzbor[i] ? [nalogIzbor[i]] : []);
            }
            function skupljenoZa(i) {
                return izabraneZa(i).reduce((s, r) => s + slobodnoM(r), 0);
            }
            function dodajRolnu(i, r) {
                setNalogIzbor(p => {
                    const cur = Array.isArray(p[i]) ? p[i] : (p[i] ? [p[i]] : []);
                    if (cur.some(x => String(x.id || x.br_rolne) === String(r.id || r.br_rolne))) return p;
                    return { ...p, [i]: [...cur, r] };
                });
            }
            function ukloniRolnu(i, r) {
                setNalogIzbor(p => {
                    const cur = Array.isArray(p[i]) ? p[i] : (p[i] ? [p[i]] : []);
                    return { ...p, [i]: cur.filter(x => String(x.id || x.br_rolne) !== String(r.id || r.br_rolne)) };
                });
            }
            function autoPopuni(i) {
                // Cilj: prvo NAJBLIŽA idealnoj širina, unutar nje potroši male reslove, pa tek onda šire trake.
                const cur = izabraneZa(i);
                const chosen = new Set(cur.map(r => String(r.id || r.br_rolne)));
                const mOf = (r) => slobodnoM(r);
                const bandOf = (r) => Math.floor(Math.max(0, (Number(r.sirina) || 0) - sir) / 25);
                // pool sortiran: širinska traka → FIFO (najstarija) → metraža (reslovi kad je isti datum)
                let pool = kandidatiZaSloj(layers[i]).filter(r => !chosen.has(String(r.id || r.br_rolne)))
                    .slice().sort((a, b) => (bandOf(a) - bandOf(b)) || (rolnaDatum(a) - rolnaDatum(b)) || (mOf(a) - mOf(b)));
                const izabrane = [...cur];
                let zbir = izabrane.reduce((s, r) => s + mOf(r), 0);
                if (!kolPlus) { if (!izabrane.length && pool.length) izabrane.push(pool[0]); setNalogIzbor(p => ({ ...p, [i]: izabrane })); return; }
                while (zbir < kolPlus && pool.length) {
                    // radi u NAJUŽOJ (najbližoj idealnoj) traci; unutar nje uzmi NAJSTARIJU (FIFO)
                    const firstBand = bandOf(pool[0]);
                    const inBand = pool.filter(r => bandOf(r) === firstBand);
                    const pick = inBand[0];   // pool je već FIFO poređan → najstarija u traci
                    izabrane.push(pick);
                    zbir += mOf(pick);
                    pool = pool.filter(r => String(r.id || r.br_rolne) !== String(pick.id || pick.br_rolne));
                }
                setNalogIzbor(p => ({ ...p, [i]: izabrane }));
            }

            const sviIzabrani = layers.every((_, i) => rucniUnos[i] || izabraneZa(i).length > 0);

            return (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                    <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 1120, maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,.25)" }}>

                        {/* Modal header */}
                        <div style={{ background: "linear-gradient(135deg,#0f172a,#1e3a8a)", padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                            <div>
                                <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Nalog za materijal — izbor rolni</div>
                                <div style={{ color: "#fff", fontSize: 20, fontWeight: 950 }}>⚡ {form.naziv || "Proizvod"}</div>
                                <div style={{ color: "#64748b", fontSize: 11, marginTop: 3 }}>
                                    {form.kupac}
                                    &nbsp;·&nbsp; Poručeno: <b style={{ color: "#4ade80" }}>
                                        {form.type === "folija"
                                            ? fmt(Number(form.porucenaKolicina) || 0) + " " + (form.jedinicaUnosa || "m")
                                            : fmt(Number(form.kesa?.kolicina) || 0) + " kom"}
                                    </b>
                                    {(() => {
                                        const om = orderMetraze(form); return om.ban > 1
                                            ? <> &nbsp;·&nbsp; <b style={{ color: "#fbbf24" }}>{om.ban} {form.type === "kesa" ? "bana" : "trake"}</b></> : null;
                                    })()}
                                    &nbsp;·&nbsp; Matična rolna (+škart): <b style={{ color: "#4ade80" }}>{fmt(kolPlus)} m</b>
                                    &nbsp;·&nbsp; Idealna širina: <b style={{ color: "#60a5fa" }}>{val(sir)} mm</b>
                                    <div style={{ fontSize: 10, opacity: .75, marginTop: 3 }}>Iz magacina se skida <b>{fmt(kolPlus)} m</b> matične rolne po sloju — ne dužina gotove trake.</div>
                                </div>
                            </div>
                            <button onClick={() => setNalogModal(false)} style={{ background: "rgba(255,255,255,.1)", border: "none", color: "#fff", borderRadius: 8, width: 36, height: 36, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                        </div>

                        {/* Scrollable body */}
                        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
                            {nalogLoading ? (
                                <div style={{ textAlign: "center", padding: 40 }}>
                                    <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                                    <div style={{ fontWeight: 800, color: "#64748b" }}>Učitavam stanje magacina...</div>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    {!kolPlus && (
                                        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, fontWeight: 700, color: "#92400e" }}>
                                            ⚠️ Poručena količina (m) nije uneta — ne mogu tačno da izračunam potrebu ni da kombinujem rolne. Zatvori, unesi „Poručena količina (m)" u osnovnim podacima, pa ponovo generiši.
                                        </div>
                                    )}
                                    {layers.map((l, i) => {
                                        const izabrane = izabraneZa(i);
                                        const idChosen = new Set(izabrane.map(r => String(r.id || r.br_rolne)));
                                        const dostupne = kandidatiZaSloj(l).filter(r => !idChosen.has(String(r.id || r.br_rolne)));
                                        const g = num(l.gm2 || l.tezina || l.tezinaGm2);
                                        const kgTreb = sirinaM > 0 ? (g * sirinaM * kolPlus / 1000).toFixed(1) : "—";
                                        const skupljeno = skupljenoZa(i);
                                        const pokriveno = rucniUnos[i] || (kolPlus ? skupljeno >= kolPlus : izabrane.length > 0);
                                        const isRucni = rucniUnos[i];
                                        const color = COLORS_M[i] || "#64748b";

                                        return (
                                            <div key={i} style={{ border: `1.5px solid ${isRucni ? "#f59e0b" : izabrane.length ? (pokriveno ? "#059669" : "#f59e0b") : "#dc2626"}`, borderLeft: `4px solid ${color}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>

                                                {/* Sloj header */}
                                                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: color + "08" }}>
                                                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 950, fontSize: 13, flexShrink: 0 }}>{i + 1}</div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 900, fontSize: 13 }}>{val(l.material || l.materijal || l.tip)} {val(l.oznaka || l.komercijalnaOznaka, "")} {val(l.debljina || l.deb)}µ</div>
                                                        <div style={{ fontSize: 11, color: "#64748b" }}>{ROLES_M[i]} &nbsp;·&nbsp; Potrebno: <b style={{ color: "#dc2626" }}>{kgTreb} kg</b> &nbsp;·&nbsp; {fmt(kolPlus)} m &nbsp;·&nbsp; ~{val(sir)} mm</div>
                                                    </div>
                                                    {/* Toggle ručni unos */}
                                                    <button onClick={() => setRucniUnos(p => ({ ...p, [i]: !p[i] }))}
                                                        style={{ border: `1px solid ${isRucni ? "#f59e0b" : "#e2e8f0"}`, background: isRucni ? "#fffbeb" : "#fff", color: isRucni ? "#d97706" : "#64748b", borderRadius: 7, padding: "5px 12px", fontWeight: 800, fontSize: 11, cursor: "pointer" }}>
                                                        {isRucni ? "📝 Ručni unos" : "📝 Ručni unos"}
                                                    </button>
                                                </div>

                                                <div style={{ padding: "12px 14px" }}>
                                                    {isRucni ? (
                                                        <div>
                                                            <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Ručni unos br. rolne</div>
                                                            <input
                                                                placeholder="Unesi br. rolne ili LOT..."
                                                                defaultValue={izabrane[0]?.br_rolne || ""}
                                                                onChange={e => {
                                                                    const vi = e.target.value;
                                                                    const found = nalogRolne.find(r => String(r.br_rolne || "").toLowerCase() === vi.toLowerCase());
                                                                    setNalogIzbor(p => ({ ...p, [i]: found ? [found] : [{ br_rolne: vi, sirina: "?", metraza_ost: 0, status: "ručno" }] }));
                                                                }}
                                                                style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #f59e0b", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }}
                                                            />
                                                            <div style={{ fontSize: 10, color: "#92400e", marginTop: 5, fontWeight: 700 }}>⚠️ Ručni unos — magacioner će sam pronaći rolnu po broju</div>
                                                            <button onClick={() => setRucniUnos(p => ({ ...p, [i]: false }))} style={{ marginTop: 8, background: "none", border: "none", color: "#2446b8", fontWeight: 800, fontSize: 11, cursor: "pointer", padding: 0 }}>← Ipak izaberi iz magacina</button>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            {/* Lista izabranih rolni (kombinacija) */}
                                                            {izabrane.length > 0 ? (() => {
                                                                let run = 0;
                                                                return <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                                                                    {izabrane.map((r, k) => {
                                                                        const m = slobodnoM(r);
                                                                        const aloc = kolPlus ? Math.min(m, Math.max(0, kolPlus - run)) : m;
                                                                        run += m;
                                                                        return (
                                                                            <div key={r.id || r.br_rolne || k} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px" }}>
                                                                                <div style={{ flex: 1, fontSize: 12, fontWeight: 800, color: "#0f172a", minWidth: 0 }}>
                                                                                    {r.br_rolne} <span style={{ color: "#64748b", fontWeight: 600 }}>· {[r.vrsta, rolnaPodVrsta(r), rolnaOznaka(r)].filter(Boolean).join(" ")} · {(r.deb || r.debljina) ? (r.deb || r.debljina) + "µ · " : ""}{r.sirina}mm · {(r.datum_proizvodnje || r.datum) ? "📅" + (r.datum_proizvodnje || r.datum) + " · " : ""}{r.dobavljac || "—"} · LOT:{r.lot || "—"} · lok:{val(r.palet || r.lokacija)}</span>
                                                                                </div>
                                                                                <div style={{ fontSize: 12, fontWeight: 900, color: "#2446b8", whiteSpace: "nowrap" }}>{fmt(Math.round(aloc))} / {fmt(m)} m</div>
                                                                                <button onClick={() => ukloniRolnu(i, r)} style={{ width: 28, height: 28, border: "1px solid #fecaca", color: "#dc2626", background: "#fff", borderRadius: 7, fontWeight: 900, cursor: "pointer", flexShrink: 0 }}>×</button>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>;
                                                            })() : null}

                                                            {/* Zbir: skupljeno / potrebno + progres */}
                                                            <div style={{ background: pokriveno ? "#f0fdf4" : "#fef2f2", border: `1px solid ${pokriveno ? "#bbf7d0" : "#fecaca"}`, borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                                                    <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b" }}>Potrebno: <b style={{ color: "#dc2626" }}>{kgTreb} kg</b> · {fmt(kolPlus)} m</div>
                                                                    <div style={{ fontSize: 12, fontWeight: 950, color: pokriveno ? "#059669" : "#dc2626", whiteSpace: "nowrap" }}>
                                                                        Skupljeno {fmt(Math.round(skupljeno))} m {pokriveno ? "✓" : (kolPlus ? `· nedostaje ${fmt(Math.max(0, kolPlus - skupljeno))} m` : "")}
                                                                    </div>
                                                                </div>
                                                                {kolPlus > 0 && (
                                                                    <div style={{ height: 7, background: "#e2e8f0", borderRadius: 4, marginTop: 7, overflow: "hidden" }}>
                                                                        <div style={{ height: "100%", width: Math.min(100, (skupljeno / kolPlus) * 100) + "%", background: pokriveno ? "#16a34a" : "#f59e0b", transition: "width .2s" }} />
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Dodaj rolnu / auto-popuni */}
                                                            {dostupne.length > 0 ? (
                                                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                                    <select value="" onChange={e => { const r = nalogRolne.find(x => String(x.id || x.br_rolne) === e.target.value); if (r) dodajRolnu(i, r); }}
                                                                        style={{ flex: 1, padding: "9px 10px", border: "1.5px solid #cbd5e1", borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: "#fff", outline: "none" }}>
                                                                        <option value="">+ Dodaj rolnu iz magacina ({dostupne.length}) — poređano po FIFO…</option>
                                                                        {dostupne.map(r => {
                                                                            const slob = slobodnoM(r);
                                                                            const ukupno = num(r.metraza_ost || r.metraza);
                                                                            const delim = (Number(r.rezervisano) || 0) > 0 && slob > 0;
                                                                            const ostatak = slob > 0 && slob < 1000; // mali reslo
                                                                            const pv = rolnaPodVrsta(r), oz = rolnaOznaka(r);
                                                                            const dp = r.datum_proizvodnje || r.datum || "";
                                                                            const mtekst = delim ? (slob.toLocaleString("sr-RS") + "m slob. od " + ukupno.toLocaleString("sr-RS")) : (slob.toLocaleString("sr-RS") + "m");
                                                                            const opis = [r.br_rolne, [r.vrsta, pv, oz].filter(Boolean).join(" "), (r.deb || r.debljina) ? (r.deb || r.debljina) + "µ" : "", r.sirina + "mm", mtekst, num(r.kg_neto || r.kg).toFixed(0) + "kg", dp ? ("📅" + dp) : "", r.dobavljac || "—", "LOT:" + (r.lot || "—")].filter(Boolean).join(" · ");
                                                                            return <option key={r.id || r.br_rolne} value={String(r.id || r.br_rolne)}>{opis}{delim ? "  · delimično rez." : (ostatak ? "  · reslo" : "")}</option>;
                                                                        })}
                                                                    </select>
                                                                    <button onClick={() => autoPopuni(i)} title="Auto-popuni kombinaciju" style={{ border: "1px solid #cbd5e1", background: "#fff", color: "#2446b8", borderRadius: 8, padding: "9px 12px", fontWeight: 800, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>↺ Auto</button>
                                                                </div>
                                                            ) : izabrane.length === 0 ? (
                                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                                    <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 800 }}>❌ Nema odgovarajućih rolni u magacinu</span>
                                                                    <button onClick={() => setRucniUnos(p => ({ ...p, [i]: true }))} style={{ background: "none", border: "none", color: "#d97706", fontWeight: 800, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>Ručni unos →</button>
                                                                </div>
                                                            ) : (
                                                                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Sve odgovarajuće rolne su dodate.</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{ borderTop: "1px solid #e2e8f0", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", flexShrink: 0 }}>
                            {nalogSaved ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                                    <div style={{ fontSize: 22 }}>✅</div>
                                    <div>
                                        <div style={{ fontWeight: 900, fontSize: 13, color: "#059669" }}>Nalog kreiran i poslat magacioneru!</div>
                                        <div style={{ fontSize: 11, color: "#64748b" }}>Rolne su rezervisane u magacinu. Magacioner vidi nalog sa lokacijama i QR kodovima.</div>
                                    </div>
                                    <button onClick={() => setNalogModal(false)} style={{ marginLeft: "auto", background: "#059669", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Zatvori</button>
                                </div>
                            ) : (
                                <>
                                    <div style={{ fontSize: 12, color: "#64748b" }}>
                                        {sviIzabrani
                                            ? <span style={{ color: "#059669", fontWeight: 800 }}>✓ Svi slojevi pokriveni</span>
                                            : <span style={{ color: "#dc2626", fontWeight: 800 }}>Izaberi rolne za sve slojeve</span>}
                                        &nbsp;·&nbsp; {layers.filter((_, i) => izabraneZa(i).length > 0 || rucniUnos[i]).length} / {layers.length} slojeva
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button onClick={() => setNalogModal(false)} style={{ border: "1px solid #e2e8f0", background: "#fff", borderRadius: 8, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Otkaži</button>
                                        <button onClick={potvrdiNalogMaterijal} disabled={nalogSaving || !sviIzabrani}
                                            style={{ background: sviIzabrani ? "#059669" : "#94a3b8", color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", fontWeight: 900, fontSize: 13, cursor: sviIzabrani ? "pointer" : "default", opacity: nalogSaving ? 0.7 : 1 }}>
                                            {nalogSaving ? "Kreiram nalog..." : "✓ Potvrdi i pošalji magacioneru"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            );
        })()}

    </div>;
}

function Grid({ children, cols = 3 }) {
    return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}>{children}</div>;
}

function Input({ label, value, onChange, type = "text", placeholder = "" }) {
    return <div><label style={labelStyle()}>{label}</label><input type={type} value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={fieldStyle()} /></div>;
}

function BojeStampeEditor({ value, onChange }) {
    const boje = Array.isArray(value) ? value : [];
    const TIPOVI = ["Spot (Pantone)", "Proces (CMYK)", "Bela", "Lak", "Metalik"];
    function setRow(i, patch) {
        const next = boje.map((b, idx) => (idx === i ? Object.assign({}, b, patch) : b));
        onChange(next);
    }
    function add() {
        onChange(boje.concat([{ oznaka: "", tip: "Spot (Pantone)", aniloks: "", klise: "", hex: "" }]));
    }
    function del(i) { onChange(boje.filter((_, idx) => idx !== i)); }
    function swatchOf(b) {
        if (b.tip === "Bela") return "#ffffff";
        if (b.tip === "Lak") return "#f5f3e6";
        const baza = pantoneHex(b.oznaka);
        return baza || b.hex || "#e2e8f0";
    }
    function pickerVal(b) {
        const baza = pantoneHex(b.oznaka);
        const v = b.hex || baza || "#cccccc";
        return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#cccccc";
    }
    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 900, color: "#1d4ed8" }}>Boje po stanici (redosled štampe)</div>
                <button onClick={add} style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 800, cursor: "pointer", fontSize: 12 }}>+ Dodaj boju</button>
            </div>
            {boje.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8", padding: "6px 0" }}>Nema unetih boja. Klikni „+ Dodaj boju".</div>}
            {boje.map((b, i) => {
                const sw = swatchOf(b);
                const uBazi = b.tip === "Spot (Pantone)" && !!pantoneHex(b.oznaka);
                const auto = b.tip === "Bela" || b.tip === "Lak";
                return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "30px 1.4fr 1fr 0.8fr 0.8fr 120px 28px", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <div title={uBazi ? "iz Pantone baze" : (b.hex ? "izabrana boja" : "izaberi boju desno")} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(0,0,0,.18)", background: sw, boxShadow: "inset 0 -5px 8px rgba(0,0,0,.12)" }} />
                        <input value={b.oznaka || ""} list="pantone-datalist" placeholder="ukucaj npr. 38 → izbor" onChange={(e) => setRow(i, { oznaka: e.target.value })} style={fieldStyle()} />
                        <select value={b.tip || "Spot (Pantone)"} onChange={(e) => setRow(i, { tip: e.target.value })} style={fieldStyle()}>
                            {TIPOVI.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input value={b.aniloks || ""} placeholder="aniloks" onChange={(e) => setRow(i, { aniloks: e.target.value })} style={fieldStyle()} />
                        <input value={b.klise || ""} placeholder="kliše" onChange={(e) => setRow(i, { klise: e.target.value })} style={fieldStyle()} />
                        {auto
                            ? <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 800 }}>automatski</span>
                            : uBazi
                                ? <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 800 }}>✓ u bazi</span>
                                : <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <input type="color" value={pickerVal(b)} onChange={(e) => setRow(i, { hex: e.target.value })} title="Izaberi boju" style={{ width: 34, height: 30, border: "1px solid #cbd5e1", borderRadius: 6, padding: 0, cursor: "pointer", background: "#fff" }} />
                                    <input value={b.hex || ""} placeholder="#HEX" onChange={(e) => setRow(i, { hex: e.target.value })} style={Object.assign({}, fieldStyle(), { width: 74, padding: "8px 8px" })} />
                                </div>}
                        <button onClick={() => del(i)} style={{ background: "#fee2e2", color: "#b91c1c", border: "none", borderRadius: 6, height: 28, cursor: "pointer", fontWeight: 800 }}>×</button>
                    </div>
                );
            })}
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>Stanica = redni broj u listi. Spot boja u bazi se oboji sama; ako nije, klikni kvadratić boje i izaberi je (ili nalepi #HEX). Bela/Lak se oboje automatski.</div>
            <datalist id="pantone-datalist">{PANTONE_KEYS.map((k) => <option key={k} value={k} />)}</datalist>
        </div>
    );
}

export default ProductTemplateEngineV20;
