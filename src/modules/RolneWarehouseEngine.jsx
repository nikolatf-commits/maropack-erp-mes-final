import React, { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../supabase.js";
import MaterijalZaNaloge from "./MaterijalZaNaloge.jsx";
import { logMagacinIstorija, mapIstorijaRow, loadOperateriMap } from "../utils/magacinIstorija.js";
import { useAuth } from "../auth/AuthProvider";
import {
    getVrsteMaterijala,
    getOznakeZaVrstu,
    getDebljineZaMaterijal,
    getKoeficijent as mmKoeficijent,
    calculateGm2 as mmCalculateGm2,
    buildMaterialName as mmBuildMaterialName
} from "../data/materialMaster.js";

const LS_MATERIJALI = "maropack_baza_materijala_v30";
const LS_ROLNE = "maropack_rolne_magacin";
const LS_HISTORY = "maropack_rolne_istorija";
const LS_POVRAT = "maropack_povrat_istorija";
const LS_OPERATER = "maropack_operater";
const HISTORY_SYNC_LIMIT = 2000;
const HISTORY_TABLE = "magacin_istorija";
// Magacioneri sa prijavom (email + šifra). Izmeni mejlove i šifre po potrebi.
const MAGACIONERI = [
    { ime: "Magacioner 1", email: "magacioner1@maropack.rs", sifra: "1111" },
    { ime: "Magacioner 2", email: "magacioner2@maropack.rs", sifra: "2222" },
    { ime: "Magacioner 3", email: "magacioner3@maropack.rs", sifra: "3333" },
];
// Prijava ide preko Supabase Authentication (Users). Ime za istoriju mapiramo iz mejla.
const OPERATER_IMENA = {
    "admin@maropack.rs": "Admin",
    "magacin@maropack.rs": "Đorđe",
    "magacin2@maropack.rs": "Mirza",
    "magacin3@maropack.rs": "Dejan",
};
// Pun pristup (vide sve: Predlog za nalog, Backup, Reset, brisanje). Samo magacin2/magacin3 su ograničeni.
const ADMIN_EMAILS = ["admin@maropack.rs", "magacin@maropack.rs"];
function imeFromEmail(email) {
    const em = String(email || "").trim().toLowerCase();
    return OPERATER_IMENA[em] || em || "—";
}
// Ime trenutno prijavljenog magacionera — da i top-level upisi istorije (ULAZ, UVOZ) hvataju ime.
let _operaterIme = "—";
const LS_PENDING_RESERVATION = "maropack_pending_roll_reservation";
const WAREHOUSE_OPTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const FALLBACK_MATERIAL_DROPDOWNS = {
    vrste: ["BOPP", "PET", "BOPA", "CPP", "PE", "LDPE", "HDPE", "BOPE", "ALU", "PAPIR", "BIOFOLIJA", "ADHESIVE", "LAK", "BOJA", "OSTALO"],
    podVrste: ["Transparent", "Pearl", "White", "Metalized", "Matt", "Gloss", "Coex", "Plain", "AntiFog", "Heat Seal", "Cold Seal", "Release", "Barrier", "Cellulose", "Retort", "Easy Peel", "Kraft", "SigmaKraft", "Glassine", "Pergamin", "Siliconized", "MG"],
    oznake: ["FXC", "FXA", "FXM", "FXPMT", "FXCWP", "FXCW", "FXP", "FXT", "NTSS", "NVS", "NATIVIA", "EXT", "RAYOFACE", "DERPROSA", "RBT", "KUNSHAN", "PET HS", "CPP HS", "CPP RETORT"],
    debljine: [7, 8, 9, 10, 12, 15, 18, 20, 23, 25, 28, 30, 35, 36, 40, 50, 55, 60, 62, 65, 70, 75, 80, 90, 100, 120, 125, 150],
    proizvodjaci: ["Plastchim", "Taghleef", "Rossella", "Inter Gradex", "Jindal", "Cosmo", "Treofan", "Innovia", "Uflex", "Polyplex", "Toray", "Mitsubishi"],
};

function uniqSorted(values, fallback = []) {
    const merged = [...(Array.isArray(values) ? values : []), ...(Array.isArray(fallback) ? fallback : [])]
        .map((v) => typeof v === "number" ? v : String(v ?? "").trim())
        .filter((v) => v !== "" && v !== null && v !== undefined);
    return Array.from(new Set(merged)).sort((a, b) => {
        const na = Number(a); const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return String(a).localeCompare(String(b), "sr");
    });
}


function uniqMaterialValues(rows, field, fallback = []) {
    const vals = (Array.isArray(rows) ? rows : [])
        .map((x) => x?.[field])
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
    return uniqSorted(vals, fallback);
}
function normalizeMasterMaterialRow(row = {}) {
    const debljina = number(row.debljina);
    const koeficijent = number(row.koeficijent);
    const gsm = number(row.gsm) || (debljina && koeficijent ? round2(debljina * koeficijent) : 0);
    return {
        ...row,
        id: row.id || makeId("MAT"),
        vrsta: String(row.vrsta || "").trim(),
        pod_vrsta: String(row.pod_vrsta || "").trim(),
        oznaka: String(row.oznaka || row.oznaka_materijala || "").trim(),
        oznaka_materijala: String(row.oznaka || row.oznaka_materijala || "").trim(),
        komercijalnaOznaka: String(row.oznaka || row.oznaka_materijala || "").trim(),
        proizvodjac: String(row.proizvodjac || "").trim(),
        debljina,
        koeficijent,
        gsm,
        cenaKg: number(row.cena_kg ?? row.cenaKg),
        minimalna_zaliha: number(row.minimalna_zaliha),
        aktivan: row.aktivan !== false,
        jedinica: String(row.vrsta || "").toUpperCase() === "PAPIR" ? "g/m²" : "µ",
    };
}
function materialDisplayName(m = {}) {
    return [m.vrsta, m.pod_vrsta, m.oznaka, m.debljina ? (String(m.vrsta).toUpperCase() === "PAPIR" ? `${m.debljina}g` : `${m.debljina}µ`) : ""]
        .filter(Boolean)
        .join(" · ");
}
function normKey(v) { return String(v ?? "").trim().toUpperCase().replace(/\s+/g, " "); }
function normMaterialCode(v) { return normKey(v).replace(/[^A-Z0-9]+/g, ""); }
function findBestMasterMaterial(row = {}, masterRows = []) {
    if (!Array.isArray(masterRows) || masterRows.length === 0) return null;
    const vrsta = normKey(row.vrsta || row.tip || row.materijal);
    const pod = normKey(row.pod_vrsta || row.podvrsta || row.subtype || "");
    const ozn = normMaterialCode(row.oznaka || row.oznaka_materijala || row.komercijalnaOznaka || row.komercijalna_oznaka);
    const deb = number(row.debljina ?? row.deb ?? row.gsm);

    let candidates = masterRows.filter((m) => {
        if (vrsta && normKey(m.vrsta) !== vrsta) return false;
        if (pod && normKey(m.pod_vrsta) !== pod) return false;
        if (ozn && normMaterialCode(m.oznaka) !== ozn) return false;
        if (deb && Number(m.debljina) !== Number(deb)) return false;
        return true;
    });

    // Parseri često vrate oznaku sa debljinom, npr. FXC15, a master čuva FXC + deb=15.
    if (!candidates.length && ozn) {
        candidates = masterRows.filter((m) => {
            const mo = normMaterialCode(m.oznaka);
            if (vrsta && normKey(m.vrsta) !== vrsta) return false;
            if (deb && Number(m.debljina) !== Number(deb)) return false;
            return ozn === mo || ozn.startsWith(mo) || mo.startsWith(ozn);
        });
    }

    if (!candidates.length && deb && vrsta) {
        candidates = masterRows.filter((m) => normKey(m.vrsta) === vrsta && Number(m.debljina) === Number(deb));
    }

    return candidates[0] || null;
}

function magacinCodeFromLocation(value) {
    const v = String(value || "").trim().toUpperCase();
    if (!v) return "";
    const m = v.match(/^(?:MAGACIN\s*)?([A-H])(?:-|\b)/i);
    return m ? m[1].toUpperCase() : "";
}
function isLocationInMagacin(location, magacinCode) {
    return magacinCodeFromLocation(location) === String(magacinCode || "").trim().toUpperCase();
}
function locationLabel(value) {
    const v = String(value || "").trim();
    return v || "Bez lokacije";
}
function parseLocationQr(value) {
    const orig = String(value || "").trim();
    const raw = orig.toUpperCase();
    if (!raw) return null;
    // Direktna lokacija u jednom skeniranju: "LOK:Magacin A1" ili "MAROPACK|LOK|Magacin A1"
    const dm = orig.match(/^\s*(?:MAROPACK\s*\|\s*)?(?:LOK|LOKACIJA)\s*[:|]\s*(.+)$/i);
    if (dm && dm[1].trim()) return { direct: true, value: dm[1].trim() };
    const parts = raw.split("|").map((x) => x.trim());
    if (parts[0] === "MAROPACK" && parts.length >= 3) {
        const type = parts[1];
        const val = parts.slice(2).join("|").trim();
        if (type === "MAGACIN" && /^[A-H]$/.test(val)) return { key: "magacin", value: val };
        if (type === "RED" && /^(0[1-5]|[1-5])$/.test(val)) return { key: "red", value: val.padStart(2, "0") };
        if (type === "POLICA" && /^[A-D]$/.test(val)) return { key: "polica", value: val };
        if (type === "POZICIJA" && /^(0[1-4]|[1-4])$/.test(val)) return { key: "pozicija", value: val.padStart(2, "0") };
    }
    if (/^[A-H]$/.test(raw)) return { key: "magacin", value: raw };
    if (/^(0[1-5]|[1-5])$/.test(raw)) return { key: "red", value: raw.padStart(2, "0") };
    const polica = raw.match(/^POLICA[\s:-]*([A-D])$/);
    if (polica) return { key: "polica", value: polica[1] };
    const pozicija = raw.match(/^POZICIJA[\s:-]*(0[1-4]|[1-4])$/);
    if (pozicija) return { key: "pozicija", value: pozicija[1].padStart(2, "0") };
    return null;
}
// Pretvara ručno unet datum (DD.MM.GGGG, DD/MM/GGGG, GGGG-MM-DD) u ISO (YYYY-MM-DD); nečitljivo → null (da ne sruši upis).
function toIsoDateOrNull(s) {
    const v = String(s || "").trim();
    if (!v) return null;
    let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
    m = v.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\.?$/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
    return null;
}

function buildLocationCode(parts = {}) {
    const magacin = String(parts.magacin || "").toUpperCase().trim();
    const red = String(parts.red || "").trim();
    const polica = String(parts.polica || "").toUpperCase().trim();
    const pozicija = String(parts.pozicija || "").trim();
    if (!magacin || !red || !polica || !pozicija) return "";
    return `${magacin}-${red.padStart(2, "0")}-${polica}-${pozicija.padStart(2, "0")}`;
}
function locationProgressLabel(parts = {}) {
    return `Magacin ${parts.magacin || "—"} · Red ${parts.red || "—"} · Polica ${parts.polica || "—"} · Pozicija ${parts.pozicija || "—"}`;
}

const DEFAULT_MATERIALS = [
    { id: "MAT-BOPP-20", vrsta: "BOPP", komercijalnaOznaka: "BOPP transparent 20µ", proizvodjac: "Generički", debljina: 20, koeficijent: 0.91, gsm: 18.2, jedinica: "µ", cenaKg: 3.1, napomena: "Standardni BOPP film" },
    { id: "MAT-BOPP-MAT-20", vrsta: "BOPP", komercijalnaOznaka: "BOPP MAT 20µ", proizvodjac: "Generički", debljina: 20, koeficijent: 0.91, gsm: 18.2, jedinica: "µ", cenaKg: 3.25, napomena: "Mat BOPP" },
    { id: "MAT-CPP-35", vrsta: "CPP", komercijalnaOznaka: "CPP transparent 35µ", proizvodjac: "Generički", debljina: 35, koeficijent: 0.91, gsm: 31.85, jedinica: "µ", cenaKg: 2.2, napomena: "CPP za kaširanje" },
    { id: "MAT-PET-12", vrsta: "PET", komercijalnaOznaka: "PET 12µ", proizvodjac: "Generički", debljina: 12, koeficijent: 1.4, gsm: 16.8, jedinica: "µ", cenaKg: 3.5, napomena: "PET film" },
    { id: "MAT-PET-50", vrsta: "PET", komercijalnaOznaka: "PET 50µ (CT / Sumilon)", proizvodjac: "Sumilon", debljina: 50, koeficijent: 1.4, gsm: 70, jedinica: "µ", cenaKg: 3.5, napomena: "CT PET FILM 50 MIC — Sumilon" },
    { id: "MAT-ALU-7", vrsta: "ALU", komercijalnaOznaka: "Aluminijum 7µ", proizvodjac: "Generički", debljina: 7, koeficijent: 2.71, gsm: 18.97, jedinica: "µ", cenaKg: 7.5, napomena: "Alu folija" },
    { id: "MAT-PE-50", vrsta: "LDPE", komercijalnaOznaka: "LDPE 50µ", proizvodjac: "Generički", debljina: 50, koeficijent: 0.925, gsm: 46.25, jedinica: "µ", cenaKg: 1.8, napomena: "PE film" },
    { id: "MAT-PAPIR-60", vrsta: "PAPIR", komercijalnaOznaka: "Papir 60 g/m²", proizvodjac: "Rossella", debljina: 0, koeficijent: 0, gsm: 60, jedinica: "g/m²", cenaKg: 1.4, napomena: "Papir, ručni unos gsm" },
    { id: "MAT-PAPIR-55", vrsta: "PAPIR", komercijalnaOznaka: "Papir 55 g/m²", proizvodjac: "Rossella", debljina: 0, koeficijent: 0, gsm: 55, jedinica: "g/m²", cenaKg: 1.4, napomena: "Papir, ručni unos gsm" },
];

function safeRead(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed;
    } catch {
        return fallback;
    }
}
function safeWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
}
function now() { return new Date().toLocaleString("sr-RS"); }
function makeId(prefix = "ID") { return `${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`; }

function Pager({ page, pages, onGo, info }) {
    if (pages <= 1) return info ? <div style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", padding: "8px 0", fontWeight: 700 }}>{info}</div> : null;
    const win = [];
    for (let p = 1; p <= pages; p++) { if (p === 1 || p === pages || Math.abs(p - page) <= 1) win.push(p); else if (win[win.length - 1] !== "…") win.push("…"); }
    const b = (extra) => ({ minWidth: 34, height: 34, borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", padding: "0 8px", ...extra });
    return (
        <div>
            {info && <div style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", paddingTop: 8, fontWeight: 700 }}>{info}</div>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap", padding: 12 }}>
                <button style={b(page <= 1 ? { opacity: .4, cursor: "default" } : {})} disabled={page <= 1} onClick={() => onGo(page - 1)}>‹</button>
                {win.map((p, i) => p === "…" ? <span key={"e" + i} style={{ padding: "0 4px", color: "#94a3b8" }}>…</span> : <button key={p} style={b(p === page ? { background: "#0f172a", color: "#fff", borderColor: "#0f172a" } : {})} onClick={() => onGo(p)}>{p}</button>)}
                <button style={b(page >= pages ? { opacity: .4, cursor: "default" } : {})} disabled={page >= pages} onClick={() => onGo(page + 1)}>›</button>
            </div>
        </div>
    );
}
function number(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function round2(v) { return Math.round(number(v) * 100) / 100; }
function fmt(v, dec = 2) { return number(v).toLocaleString("sr-RS", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function formatDateLabel(v) { if (!v) return ""; const d = new Date(v); if (Number.isNaN(d.getTime())) return String(v); return d.toLocaleDateString("sr-RS"); }
function calcGsm(m) {
    const gsm = number(m?.gsm);
    if (gsm > 0) return round2(gsm);
    return round2(number(m?.debljina) * number(m?.koeficijent));
}
function kgFromMeters({ sirinaMm, duzinaM, gsm }) {
    const sirinaM = number(sirinaMm) / 1000;
    return round2((sirinaM * number(duzinaM) * number(gsm)) / 1000);
}
function metersFromKg({ sirinaMm, kg, gsm }) {
    const sirinaM = number(sirinaMm) / 1000;
    const g = number(gsm);
    if (!sirinaM || !g) return 0;
    return round2((number(kg) * 1000) / (sirinaM * g));
}
function normalizeStatus(status) {
    const s = String(status || "").trim();
    const lower = s.toLowerCase();
    if (!s) return "dostupna";
    if (["na stanju", "dostupna", "available", "slobodna"].includes(lower)) return "dostupna";
    if (["rezervisano", "rezervisana", "reserved"].includes(lower)) return "rezervisana";
    if (["iskorišćeno", "iskorisceno", "potrošena", "potrosena", "potroseno", "potrošeno", "used"].includes(lower)) return "potrosena";
    if (["u proizvodnji", "u_proizvodnji", "proizvodnja", "wip"].includes(lower)) return "proizvodnja";
    if (["formatirana", "formatirano"].includes(lower)) return "formatirana";
    if (["blokirana", "blokirano"].includes(lower)) return "blokirana";
    return lower;
}
function displayStatus(status) {
    const st = normalizeStatus(status);
    if (st === "dostupna") return "Na stanju";
    if (st === "rezervisana") return "Rezervisano";
    if (st === "potrosena") return "Iskorišćeno";
    if (st === "proizvodnja") return "U proizvodnji";
    if (st === "formatirana") return "Formatirana";
    if (st === "blokirana") return "Blokirana";
    return status || "Na stanju";
}
function toDbStatus(status) {
    const st = normalizeStatus(status);
    if (st === "dostupna") return "Na stanju";
    if (st === "rezervisana") return "Rezervisano";
    if (st === "potrosena") return "Iskorišćeno";
    if (st === "formatirana") return "Formatirana";
    if (st === "blokirana") return "Blokirana";
    return status || "Na stanju";
}
function isRollVisibleOnStock(r) {
    const st = normalizeStatus(r?.status);
    return ["dostupna", "rezervisana", "formatirana"].includes(st) && number(r?.metraza_ost ?? r?.duzina ?? r?.metraza) > 0;
}
function statusColor(s) {
    const st = normalizeStatus(s);
    if (st === "rezervisana") return "#f59e0b";
    if (st === "potrosena") return "#ef4444";
    if (st === "proizvodnja") return "#7c3aed";
    if (st === "formatirana") return "#2563eb";
    if (st === "blokirana") return "#6d28d9";
    return "#059669";
}
function ensureMaterials() {
    const current = safeRead(LS_MATERIJALI, null);
    if (!Array.isArray(current) || current.length === 0) {
        safeWrite(LS_MATERIJALI, DEFAULT_MATERIALS);
        return DEFAULT_MATERIALS;
    }
    return current;
}
function normalizeMaterial(m) {
    const gsm = calcGsm(m);
    return {
        id: m.id || makeId("MAT"),
        vrsta: m.vrsta || "BOPP",
        komercijalnaOznaka: m.komercijalnaOznaka || m.naziv || "Novi materijal",
        proizvodjac: m.proizvodjac || "",
        debljina: number(m.debljina),
        koeficijent: number(m.koeficijent),
        gsm,
        jedinica: m.jedinica || (number(m.gsm) > 0 && !number(m.debljina) ? "g/m²" : "µ"),
        cenaKg: number(m.cenaKg),
        napomena: m.napomena || "",
    };
}
function materialLabel(m) {
    if (!m) return "—";
    const dim = m.jedinica === "g/m²" || !number(m.debljina) ? `${fmt(m.gsm, 1)} g/m²` : `${m.debljina}µ / ${fmt(calcGsm(m), 1)} g/m²`;
    const oznaka = m.oznaka || m.oznaka_materijala || m.komercijalnaOznaka || "—";
    return `${m.vrsta} · ${oznaka} · ${m.proizvodjac || "—"} · ${dim}`;
}
function cleanOznaka(value, vrsta = "") {
    let v = String(value || "").trim();
    const t = String(vrsta || "").trim();
    if (t && v.toLowerCase().startsWith(t.toLowerCase() + " ")) v = v.slice(t.length).trim();
    return v;
}
function rollOznaka(r) {
    return cleanOznaka(r?.oznaka_materijala || r?.oznaka || r?.komercijalnaOznaka || r?.materijal || "", r?.vrsta);
}
function crevoLabel(r) {
    const n = String(r?.napomena || "");
    const tag = n.match(/⟨CREVO×(\d+)⟩/i);
    if (tag) return "CREVO ×" + tag[1];
    if (/crevo/i.test(n)) { const m = n.match(/×\s*(\d+)/); return m ? ("CREVO ×" + m[1]) : "CREVO"; }
    return null;
}
function napomenaText(r) {
    return String(r?.napomena || "").replace(/\s*⟨CREVO×\d+⟩\s*/gi, "").trim();
}
function rolnaUkupnoM(r) { return number(r?.duzina ?? r?.metraza_ost ?? r?.metraza) || 0; }
function rolnaRezM(r) { return number(r?.rezervisano) || 0; }
function rolnaSlobodnoM(r) { return Math.max(0, rolnaUkupnoM(r) - rolnaRezM(r)); }
const CREVO_BADGE = { display: "inline-block", background: "#faf5ff", color: "#6d28d9", border: "1px solid #e9d5ff", borderRadius: 6, padding: "1px 7px", fontSize: 10, fontWeight: 900, marginLeft: 6, verticalAlign: "middle", whiteSpace: "nowrap" };
function mapDbRollToEngine(r = {}) {
    const vrsta = r.vrsta || r.tip || r.materijal || "Nedefinisano";
    const oznaka = cleanOznaka(r.oznaka_materijala || r.oznaka || r.komercijalnaOznaka || "", vrsta);
    return {
        ...r,
        qr: r.qr || r.qr_code || r.br_rolne || r.broj_rolne || String(r.id || ""),
        vrsta,
        pod_vrsta: r.pod_vrsta || r.podvrsta || "",
        oznaka_materijala: oznaka,
        materijal: vrsta,
        komercijalnaOznaka: oznaka,
        proizvodjac: r.proizvodjac || r.dobavljac || "",
        debljina: r.debljina ?? r.deb ?? 0,
        sirina: r.sirina ?? 0,
        duzina: r.metraza_ost ?? r.metraza ?? r.duzina ?? 0,
        kg: r.kg_neto ?? r.kg ?? r.kg_bruto ?? 0,
        datum: r.datum_prijema || r.datum || r.created_at || "",
        datum_ulaza: r.datum_prijema || r.datum || r.created_at || "",
        datum_proizvodnje: r.datum_proizvodnje || "",
        status: r.status || "Na stanju",
        lokacija: r.lokacija || "Magacin",
        cenaKg: number(r.cena_kg),
        cena_kg: number(r.cena_kg),
        vrednost: number(r.vrednost) || (number(r.kg_neto ?? r.kg ?? r.kg_bruto) * number(r.cena_kg)),
    };
}
function rollQrPayload(r) {
    // QR etiketa nosi stabilan MAROPACK format.
    // U QR-u je samo ključ rolne, a podaci se posle skeniranja čitaju iz Supabase magacin tabele.
    const code = String(r?.qr || r?.qr_code || r?.br_rolne || r?.broj_rolne || r?.id || "").trim();
    return code ? `MAROPACK|ROLNA|${code}` : "";
}

function pick(row = {}, keys = []) {
    if (!row || typeof row !== "object") return "";
    const entries = Object.entries(row);
    for (const key of keys) {
        const wanted = String(key || "").trim().toLowerCase();
        const exact = entries.find(([k]) => String(k || "").trim().toLowerCase() === wanted);
        if (exact && exact[1] !== undefined && exact[1] !== null && String(exact[1]).trim() !== "") return exact[1];
    }
    for (const key of keys) {
        const wanted = String(key || "").trim().toLowerCase();
        const partial = entries.find(([k]) => String(k || "").trim().toLowerCase().includes(wanted));
        if (partial && partial[1] !== undefined && partial[1] !== null && String(partial[1]).trim() !== "") return partial[1];
    }
    return "";
}

function normalizePackingRow(row = {}) {
    const br = String(pick(row, ["br_rolne", "broj rolne", "roll no", "roll_no", "reel", "reel code", "qr"])).trim();
    const qr = String(pick(row, ["qr", "br_rolne", "broj rolne", "roll no", "roll_no", "reel code"])).trim();
    return {
        ...row,
        br_rolne: br,
        qr: qr || br,
        vrsta: pick(row, ["vrsta", "type", "material", "materijal"]),
        pod_vrsta: pick(row, ["pod vrsta", "pod_vrsta", "podvrsta", "subtype", "podtip"]),
        oznaka_materijala: pick(row, ["oznaka_materijala", "oznaka materijala", "oznaka", "material code", "code"]),
        komercijalnaOznaka: pick(row, ["komercijalnaOznaka", "oznaka_materijala", "oznaka materijala", "komercijalna oznaka", "oznaka", "commercial name", "naziv", "materijal"]),
        proizvodjac: pick(row, ["proizvodjac", "proizvođač", "manufacturer", "supplier", "dobavljac", "dobavljač"]),
        debljina: number(pick(row, ["debljina", "deb", "thickness", "mic", "µ"])),
        koeficijent: number(pick(row, ["koeficijent", "gustina", "density"])),
        gsm: number(pick(row, ["gsm", "g/m2", "g/m²", "gramatura"])),
        sirina: number(pick(row, ["sirina", "širina", "width", "sirina mm", "width mm"])),
        duzina: number(pick(row, ["duzina", "dužina", "m", "metara", "length", "meter", "meters"])),
        kg: number(pick(row, ["kg", "kilograma", "net weight", "net", "weight", "tezina", "težina"])),
        kg_bruto: number(pick(row, ["kg_bruto", "gross weight", "gross", "bruto"])),
        palet: String(pick(row, ["palet", "pallet", "pallet no", "plt.no"])).trim(),
        lot: String(pick(row, ["lot", "batch", "sarza", "šarža", "serija"])).trim(),
        lokacija: String(pick(row, ["lokacija", "location", "skladiste", "magacin"])).trim(),
        datum: String(pick(row, ["datum", "date", "datum ulaza"])).trim(),
        datum_proizvodnje: String(pick(row, ["datum_proizvodnje", "datum proizvodnje", "production date", "date of production"])).trim(),
        hilzna_mm: number(pick(row, ["hilzna_mm", "id", "diam ins", "diam. ins", "inner", "core"])),
        spoljasnji_precnik_mm: number(pick(row, ["spoljasnji_precnik_mm", "od", "diam outs", "diam. outs", "outer"])),
    };
}

function parsePackingText(text = "") {
    const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(sep).map((h) => h.trim());
    return lines.slice(1).map((line) => {
        const parts = line.split(sep).map((x) => x.trim());
        const obj = {};
        headers.forEach((h, i) => { obj[h] = parts[i] || ""; });
        return normalizePackingRow(obj);
    }).filter((r) => r.vrsta || r.komercijalnaOznaka || r.sirina || r.duzina || r.kg);
}

function parseNumSmart(value) {
    let v = String(value ?? "").trim().replace(/\s+/g, "");
    if (!v) return 0;
    // 1.020 u italijanskim/rossella dokumentima je 1020, dok 904,0 znači 904.0
    if (v.includes(",")) return Number(v.replace(/\./g, "").replace(",", ".")) || 0;
    if (/^\d{1,3}\.\d{3}$/.test(v)) return Number(v.replace(".", "")) || 0;
    return Number(v) || 0;
}
function detectVrstaFromText(text, fallback = "") {
    const t = String(text || fallback || "").toUpperCase();
    if (t.includes("BOPA")) return "BOPA";
    if (t.includes("BOPP")) return "BOPP";
    if (t.includes("PET")) return "PET";
    if (t.includes("CPP")) return "CPP";
    if (t.includes("CLAY COATED") || t.includes("PAPIR") || t.includes("PAPER")) return "PAPIR";
    if (t.includes("LDPE") || t.includes("PE")) return "LDPE";
    return fallback || "Nedefinisano";
}
function coeffByVrsta(vrsta) {
    const v = String(vrsta || "").toUpperCase();
    if (v.includes("BOPA") || v.includes("OPA") || v.includes("PA")) return 1.14;
    if (v.includes("PET")) return 1.4;
    if (v.includes("ALU")) return 2.71;
    if (v.includes("PE") || v.includes("LDPE")) return 0.925;
    return 0.91;
}
function calcMetersFromKgFallback({ kg, sirina, debljina, vrsta, gsm }) {
    const g = number(gsm) || number(debljina) * coeffByVrsta(vrsta);
    return metersFromKg({ sirinaMm: sirina, kg, gsm: g });
}
function parsePlastchimPacking(text = "") {
    const rows = [];
    const t = String(text || "");
    const date = (t.match(/Packing list Date:\s*([0-9.]+)/i) || [])[1] || "";
    const product = (t.match(/PRODUCT:\s*([^\n]+)/i) || [])[1] || "BOPP film";
    const vrsta = detectVrstaFromText(product, "BOPP");

    // pod-vrsta kako je u našoj centralnoj listi (Transparent/Matt/Pearl/White/Metalized)
    const podVrstaFromCode = (v, code) => {
        const c = String(code || "").toUpperCase();
        if (/M$/.test(c) || c.includes("MAT")) return "Matt";
        if (c.includes("PEARL") || c.includes("SEDEF")) return "Pearl";
        if (c.includes("WHITE") || c.includes("BEL")) return "White";
        if (c.includes("MET")) return "Metalized";
        return "Transparent";
    };

    // PDF često lomi red usred kolona — zato spljoštimo CEO tekst i hvatamo
    // rolne globalno, ankerisani na hilznu 152 (brojevi mogu imati razmake "1 260" / "16 757").
    // 7655563 138036.1 FXCAF 25 1 260 152 772 16 757 477.00 506.00
    const flat = t.replace(/\s+/g, " ");
    // mapa: narudžbenica (6 cifara) -> referentni datum iz "Reff.Doc.: 138036 0056/2026-14.04.2026"
    const orderDate = {};
    const od = /(\d{6})\s+\d{2,4}\/\d{4}-(\d{2}\.\d{2}\.\d{4})/g;
    let dm;
    while ((dm = od.exec(flat))) orderDate[dm[1]] = dm[2];

    const re = /(\d{6,8})\s+(\d{3,6}\.\d{1,3})\s+([A-Z]{2,7})\s+(\d{2,3})\s+([\d ]+?)\s+152\s+(\d{3,4})\s+([\d ]+?)\s+(\d+[.,]\d{1,2})\s+(\d+[.,]\d{1,2})/g;
    let m;
    while ((m = re.exec(flat))) {
        const rollNo = m[1];
        const palletTok = m[2];
        const orderNo = palletTok.split(".")[0] || "";
        const oznaka = m[3];
        rows.push({
            br_rolne: rollNo,
            qr: rollNo,
            vrsta,
            pod_vrsta: podVrstaFromCode(vrsta, oznaka),
            oznaka_materijala: oznaka,
            komercijalnaOznaka: oznaka,
            proizvodjac: "Plastchim",
            debljina: parseNumSmart(m[4]),
            sirina: parseNumSmart(m[5]),
            duzina: parseNumSmart(m[7]),
            kg: parseNumSmart(m[8]),
            kg_bruto: parseNumSmart(m[9]),
            lot: rollNo,                         // lot jedinstven po rolni (= broj rolne)
            palet: palletTok,
            hilzna_mm: 152,
            spoljasnji_precnik_mm: parseNumSmart(m[6]),
            datum: date,
            datum_proizvodnje: orderDate[orderNo] || date || "",
            napomena: "",
        });
    }
    return rows;
}

function parseTaghleefPacking(text = "") {
    const rows = [];
    const t = String(text || "");
    const date = (t.match(/Document no:\s*Date:[\s\S]*?\n\s*\d+\s+([0-9.]+)/i) || t.match(/\b(\d{2}\.\d{2}\.\d{4})\b/) || [])[1] || "";
    const flat = t.replace(/\s+/g, " ");

    // Taghleef format iz PDF-a:
    // 110949959 122607302003000 NATIVIA NTSS 30 1650 TO 904,0 14700 152 783 1 13.02.2026
    const re = /(\d{9})\s+(\d{12,})\s+([A-Z0-9\s]+?)\s+(\d+(?:,\d+)?)\s+(\d{4,6})\s+(\d+)\s+(\d+)\s+\d+\s+(\d{2}\.\d{2}\.\d{4})/g;
    let m;
    while ((m = re.exec(flat))) {
        const palletNo = m[1];
        const reelCode = m[2];
        const item = m[3].trim().replace(/\s+/g, " ");
        const kg = parseNumSmart(m[4]);
        const duzina = parseNumSmart(m[5]);
        const inner = parseNumSmart(m[6]);
        const outer = parseNumSmart(m[7]);
        const prodDate = m[8];

        const tokens = item.split(/\s+/).filter(Boolean);
        let debljina = 0;
        let sirina = 0;
        for (let i = tokens.length - 2; i >= 0; i--) {
            if (/^\d{1,3}$/.test(tokens[i]) && /^\d{3,4}$/.test(tokens[i + 1])) {
                debljina = parseNumSmart(tokens[i]);
                sirina = parseNumSmart(tokens[i + 1]);
                break;
            }
        }

        const oznaka = item.replace(/\s+\d{1,3}\s+\d{3,4}\s+TO$/i, "").trim() || item;
        rows.push({
            br_rolne: palletNo,
            qr: palletNo,
            vrsta: detectVrstaFromText(item, "BOPP"),
            pod_vrsta: tokens.slice(0, 2).join(" "),
            oznaka_materijala: oznaka,
            komercijalnaOznaka: oznaka,
            proizvodjac: "Taghleef",
            debljina,
            sirina,
            duzina,
            kg,
            kg_bruto: 0,
            lot: reelCode,
            palet: palletNo,
            hilzna_mm: inner,
            spoljasnji_precnik_mm: outer,
            datum: date,
            datum_proizvodnje: prodDate,
        });
    }
    return rows;
}

function parseInterGradexPacking(text = "") {
    const rows = [];
    const t = String(text || "");
    const date = (t.match(/Datum:\s*([0-9.]+)/i) || [])[1] || "";
    let current = null;

    for (const rawLine of t.split(/\r?\n/)) {
        let line = rawLine.trim().replace(/\s+/g, " ");
        if (!line) continue;
        // Skini vodeće znakove stabla/uvlačenja iz PDF-a (└─, ├─, ⊟, •, itd.) da ^ regex uhvati red
        line = line.replace(/^[^0-9A-Za-zА-Яа-я]+/, "").trim();
        if (!line) continue;

        // Header:
        // 9976 BOPP FILM RBT - 1215X18 7,359.220 Kg
        // 9291 BOPA FILM KUNSHAN 960X15 298.100 Kg
        const header = line.match(/^(\d{3,5})\s+(.+?)\s+([\d.,]+)\s*Kg$/i);
        if (header) {
            const sifra = header[1];
            const desc = header[2].trim();
            const dim = desc.match(/(\d{3,4})\s*[Xx]\s*(\d+(?:[.,]\d+)?)/);
            const vrsta = detectVrstaFromText(desc, "");
            const oznakaRaw = desc.replace(/\s*-\s*/g, " ").replace(/\d{3,4}\s*[Xx]\s*\d+(?:[.,]\d+)?/g, "").replace(/\s+/g, " ").trim();
            current = {
                sifra,
                vrsta,
                oznaka_materijala: cleanOznaka(oznakaRaw, vrsta),
                komercijalnaOznaka: cleanOznaka(oznakaRaw, vrsta),
                sirina: dim ? parseNumSmart(dim[1]) : 0,
                debljina: dim ? parseNumSmart(dim[2]) : 0,
            };
            continue;
        }

        // Roll:
        // 0001382907 425.260 Kg 225249004 RBT
        const r = line.match(/^(0*\d{6,})\s+([\d.,]+)\s*Kg\s+(\S+)\s+(.+)$/i);
        if (r && current) {
            const rollNo = r[1];
            const kg = Number(String(r[2]).replace(/,/g, "")) || 0; // US-format: 298.100 = 298.1 ; 7,359.220 = 7359.22
            const lot = r[3];
            const tech = r[4].trim();
            const duzina = current.sirina && current.debljina
                ? calcMetersFromKgFallback({ kg, sirina: current.sirina, debljina: current.debljina, vrsta: current.vrsta })
                : 0;

            rows.push({
                br_rolne: rollNo,
                qr: rollNo,
                ...current,
                proizvodjac: "Inter Gradex",
                kg,
                kg_bruto: kg,
                duzina,
                lot,
                palet: current.sifra,
                datum: date,
                napomena: tech,
            });
        }
    }
    return rows;
}

function parseRossellaPacking(text = "") {
    const rows = [];
    const t = String(text || "");
    const date = (t.match(/1\/\s*704\s*([0-9/]+)/i) || t.match(/(\d{2}\/\d{2}\/\d{4})/) || [])[1] || "";
    const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let gross = 0, net = 0, pallet = "", sch = "";

    for (const line of lines) {
        const g = line.match(/Gross wt\.?\s*Kg:\s*([\d.]+)\s+Net wt\.?\s*Kg:\s*([\d.]+)/i);
        if (g) { gross = parseNumSmart(g[1]); net = parseNumSmart(g[2]); continue; }

        const p = line.match(/Pallet\s*:\s*(\d+).*?Sch\.?\s*:\s*([^\s]+)/i);
        if (p) { pallet = p[1]; sch = p[2]; continue; }

        if (/CLAY COATED|WHITE|PAPER/i.test(line)) {
            const mm = line.match(/(\d{2,3})\s*g\s*-\s*(\d{3,4})\s*mm/i);
            const len = line.match(/U\d+\/\d+\s+1\s+([\d.]+)/i) || line.match(/\s1\s+([\d.]+)\s+[\d.,]+\s+[\d.,]+\s+[\d.]+$/);
            const gsm = mm ? parseNumSmart(mm[1]) : 0;
            const sirina = mm ? parseNumSmart(mm[2]) : 0;
            const duzina = len ? parseNumSmart(len[1]) : 0;
            if (pallet && sirina && (duzina || net)) {
                rows.push({
                    br_rolne: String(pallet),
                    qr: String(pallet),
                    vrsta: "PAPIR",
                    pod_vrsta: "Clay Coated",
                    oznaka_materijala: `CLAY COATED - WHITE - ${gsm}g`,
                    komercijalnaOznaka: `CLAY COATED - WHITE - ${gsm}g`,
                    proizvodjac: "Rossella",
                    debljina: 0,
                    gsm,
                    sirina,
                    duzina,
                    kg: net,
                    kg_bruto: gross,
                    lot: sch,
                    palet: pallet,
                    datum: date,
                });
            }
        }
    }
    return rows;
}

function parseSumilonPacking(text = "") {
    // SAJ INDUSTRIES / SUMILON — "DETAIL PACKING LIST" (PET film role)
    // Kolone: Pallet No | Roll No. | Mic | Core ID(inch) | Width(mm) | Length(mtr) | Joint | GR weight w/pallet | Tare | Net Wt | Tret
    const rows = [];
    const t = String(text || "");
    const flat = t.replace(/\s+/g, " ");
    const datum = (flat.match(/Dated[:\s]*([0-9.]{6,})/i) || [])[1] || "";
    const delivery = (flat.match(/Delivery No\.?[:\s]*([0-9]+)/i) || [])[1] || "";
    const invoice = (flat.match(/Invoice no[:\s]*([0-9]+)/i) || [])[1] || "";
    const salesOrder = (flat.match(/Sales Order No\.?[:\s]*([0-9]+)/i) || [])[1] || "";
    const product = (flat.match(/((?:CT\s+)?PET\s+FILM[^.]*?MIC)/i) || [])[1] || "PET FILM";
    const vrsta = detectVrstaFromText(product, "PET");
    const n = (s) => Number(String(s || "").replace(/,/g, "")) || 0;

    // 001 B000222287 50.0 6 1,000 8,850  1,308.800 68.000 623.300 S-102
    const re = /\b(\d{1,3})\s+([A-Z]\d{9})\s+(\d{2,3}(?:\.\d+)?)\s+(\d{1,2})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+\.\d{2,3})\s+([\d,]+\.\d{2,3})\s+([\d,]+\.\d{2,3})(?:\s+(S-?\d+))?/g;
    let m;
    while ((m = re.exec(flat))) {
        const rollNo = m[2];
        rows.push({
            br_rolne: rollNo,
            qr: rollNo,
            vrsta,
            oznaka_materijala: "",
            komercijalnaOznaka: product.replace(/\s+/g, " ").trim(),
            proizvodjac: "Sumilon",
            debljina: n(m[3]),
            sirina: n(m[5]),
            duzina: n(m[6]),
            kg: n(m[9]),        // Net Wt. (po rolni)
            kg_bruto: 0,        // GR je po paleti (deljen), ne po rolni
            lot: rollNo,
            palet: m[1],
            hilzna_mm: Math.round(n(m[4]) * 25.4), // 6" -> 152 mm
            datum,
            datum_proizvodnje: datum || "",
            napomena: ["Sumilon PL", delivery && ("Delivery " + delivery), invoice && ("Invoice " + invoice), salesOrder && ("SO " + salesOrder)].filter(Boolean).join(" · "),
        });
    }
    return rows;
}

function parseUniversalPackingText(text = "") {
    const t = String(text || "");
    let rows = [];

    if (/PLASTCHIM|ПЛАСТХИМ|Packing list Date|Film Type Thikness|Film Type Thickness/i.test(t)) {
        rows = parsePlastchimPacking(t);
    } else if (/Taghleef|CSOMAGLISTA|NATIVIA|Reel Code Item Kg Length/i.test(t)) {
        rows = parseTaghleefPacking(t);
    } else if (/Inter Gradex|LISTA PAKOV|L I S T A P A K O V/i.test(t)) {
        rows = parseInterGradexPacking(t);
    } else if (/Rossella|Shipping Packing List|CLAY COATED/i.test(t)) {
        rows = parseRossellaPacking(t);
    } else if (/SAJ INDUSTRIES|SUMILON|DETAIL PACKING LIST/i.test(t)) {
        rows = parseSumilonPacking(t);
    }

    if (!rows.length) {
        rows = [
            ...parsePlastchimPacking(t),
            ...parseTaghleefPacking(t),
            ...parseInterGradexPacking(t),
            ...parseRossellaPacking(t),
            ...parseSumilonPacking(t),
        ];
    }

    if (!rows.length) rows = parsePackingText(t);

    return rows
        .map(normalizePackingRow)
        .filter((r) => r.br_rolne || r.qr)
        .map((r) => ({
            ...r,
            br_rolne: r.br_rolne || r.qr || makeId("ROLNA"),
            qr: r.qr || r.br_rolne || makeId("ROLNA"),
            metraza: r.duzina,
            metraza_ost: r.duzina,
            kg_neto: r.kg,
            kg_bruto: r.kg_bruto || r.kg,
            status: "Na stanju",
        }));
}

function loadPdfJsGlobal() {
    return new Promise((resolve, reject) => {
        if (window.pdfjsLib) return resolve(window.pdfjsLib);
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.onload = () => {
            if (!window.pdfjsLib) return reject(new Error("PDF.js nije učitan"));
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
            resolve(window.pdfjsLib);
        };
        script.onerror = () => reject(new Error("Ne mogu da učitam PDF parser. Proveri internet konekciju."));
        document.head.appendChild(script);
    });
}
async function extractPdfTextFromFile(file) {
    const pdfjsLib = await loadPdfJsGlobal();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        // Grupiši stavke po Y koordinati u redove, pa sortiraj unutar reda po X —
        // da ceo red (rolna) ostane na okupu bez obzira na redosled stavki iz PDF-a.
        const lines = {};
        for (const it of content.items) {
            const tr = it.transform || [1, 0, 0, 1, 0, 0];
            const y = Math.round((tr[5] || 0));
            const x = tr[4] || 0;
            (lines[y] = lines[y] || []).push({ x, s: it.str || "" });
        }
        const ys = Object.keys(lines).map(Number).sort((a, b) => b - a);
        for (const y of ys) {
            text += lines[y].sort((a, b) => a.x - b.x).map((o) => o.s).join(" ") + "\n";
        }
        text += "\n";
    }
    return text;
}
async function loadTesseractGlobal() {
    if (typeof window !== "undefined" && window.Tesseract) return window.Tesseract;
    await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js";
        s.onload = resolve;
        s.onerror = () => reject(new Error("Ne mogu da učitam OCR (Tesseract). Proveri internet konekciju."));
        document.head.appendChild(s);
    });
    return window.Tesseract;
}
// OCR fallback: render stranice u sliku pa pročitaj tekst (za PDF sa oštećenim tekstualnim slojem/skenove)
async function extractPdfTextViaOCR(file, onProgress) {
    const pdfjsLib = await loadPdfJsGlobal();
    const Tesseract = await loadTesseractGlobal();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 2.5 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const res = await Tesseract.recognize(canvas, "eng", {
            logger: (m) => {
                if (m.status === "recognizing text" && typeof onProgress === "function") {
                    onProgress(Math.round(((p - 1 + (m.progress || 0)) / pdf.numPages) * 100));
                }
            },
        });
        text += ((res && res.data && res.data.text) || "") + "\n\n";
    }
    return text;
}
function extractQrFromScan(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    // Novi format: MAROPACK|ROLNA|ROLNA-2026-...
    if (raw.startsWith("MAROPACK|ROLNA|")) {
        return raw.split("|").slice(2).join("|").trim();
    }

    // Podrška za stare QR kodove koji su bili JSON.
    try {
        const parsed = JSON.parse(raw);
        return String(parsed.qr || parsed.qr_code || parsed.br_rolne || parsed.rola || parsed.roll || raw).trim();
    } catch {
        const match = raw.match(/ROLNA[-_A-Z0-9]+|R-[0-9A-Za-z_.;:-]+/i);
        return match ? match[0] : raw;
    }
}

export function getWarehouseMaterials() { return ensureMaterials(); }
export function findMatchingRolls(requirement = {}) {
    const rolls = safeRead(LS_ROLNE, []);
    const wantedVrsta = String(requirement.vrsta || requirement.materijal || "").toLowerCase();
    const wantedDeb = number(requirement.debljina);
    const wantedSirina = number(requirement.sirina || requirement.sirinaMm);
    const tolerance = number(requirement.tolerancijaSirine || 2);
    return rolls
        .filter((r) => isRollVisibleOnStock(r))
        .filter((r) => !wantedVrsta || String(r.vrsta || r.materijal || "").toLowerCase().includes(wantedVrsta))
        .filter((r) => !wantedDeb || Math.abs(number(r.debljina) - wantedDeb) < 0.01)
        .filter((r) => !wantedSirina || number(r.sirina) >= wantedSirina - tolerance)
        .sort((a, b) => number(a.sirina) - number(b.sirina));
}
export function addWarehouseRoll(roll, event = "ULAZ") {
    const rolne = safeRead(LS_ROLNE, []);
    const history = safeRead(LS_HISTORY, []);
    const item = {
        id: roll.id || makeId("R"),
        qr: roll.qr || makeId("ROLNA"),
        materijal_id: roll.materijal_id || "",
        vrsta: roll.vrsta || roll.materijal || "Nedefinisano",
        pod_vrsta: roll.pod_vrsta || "",
        oznaka_materijala: cleanOznaka(roll.oznaka_materijala || roll.oznaka || roll.komercijalnaOznaka || "", roll.vrsta || roll.materijal),
        materijal: roll.materijal || roll.vrsta || "Nedefinisano",
        komercijalnaOznaka: cleanOznaka(roll.oznaka_materijala || roll.oznaka || roll.komercijalnaOznaka || roll.materijal || "", roll.vrsta || roll.materijal),
        proizvodjac: roll.proizvodjac || "",
        debljina: number(roll.debljina),
        koeficijent: number(roll.koeficijent),
        gsm: number(roll.gsm),
        sirina: number(roll.sirina),
        duzina: number(roll.duzina),
        kg: number(roll.kg),
        lot: roll.lot || "",
        lokacija: roll.lokacija || "Magacin",
        status: roll.status || "Na stanju",
        master_nalog_id: roll.master_nalog_id || "",
        parent_qr: roll.parent_qr || "",
        datum: roll.datum || new Date().toLocaleDateString("sr-RS"),
        datum_ulaza: roll.datum_ulaza || roll.datum || new Date().toLocaleDateString("sr-RS"),
        datum_proizvodnje: roll.datum_proizvodnje || "",
        datum_poslednje_promene: roll.datum_poslednje_promene || now(),
        datum_popisa: roll.datum_popisa || "",
        popisano: !!roll.popisano,
        napomena: roll.napomena || "",
    };
    const next = [item, ...rolne.filter((r) => r.qr !== item.qr)];
    const opisDesc = [item.vrsta, item.pod_vrsta, item.oznaka_materijala, item.debljina ? `${item.debljina}${String(item.vrsta).toUpperCase() === "PAPIR" ? "g" : "µ"}` : null].filter(Boolean).join(" · ")
        + ` · ${fmt(number(item.duzina), 0)} m / ${fmt(number(item.kg), 2)} kg`
        + (item.lokacija ? ` · lokacija ${item.lokacija}` : "")
        + (roll.napomena ? ` · ${roll.napomena}` : "");
    const hist = [{ vreme: now(), operater: _operaterIme, qr: item.qr, event, opis: opisDesc, stanje: item.status }, ...history];
    safeWrite(LS_ROLNE, next);
    safeWrite(LS_HISTORY, hist);
    // NE upisujemo u magacin_istorija — DB trigger beleži INSERT rolne ('kreirana') sa user_id.
    return item;
}

function RollLabel({ roll, className = "roll-label-print" }) {
    const oznaka = rollOznaka(roll);
    return (
        <div className={className} style={{ width: "100mm", height: "140mm", background: "#fff", border: "1px solid #111827", borderRadius: 0, padding: "5mm", boxSizing: "border-box", fontFamily: "Arial, sans-serif", color: "#111827", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #111827", paddingBottom: 4 }}>
                <div>
                    <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: .4 }}>MAROPACK</div>
                    <div style={{ fontSize: 9, fontWeight: 800 }}>ETIKETA ROLNE / QR TRACEABILITY</div>
                </div>
                <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" }}>100 × 140 mm</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "34mm 1fr", gap: 5, marginTop: 5 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <QRCodeSVG value={rollQrPayload(roll)} size={150} level="M" includeMargin={true} />
                </div>
                <div style={{ fontSize: 10, lineHeight: 1.35 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, wordBreak: "break-all" }}>{roll.qr}</div>
                    <div><b>Vrsta:</b> {roll.vrsta || "—"}</div>
                    <div><b>Pod vrsta:</b> {roll.pod_vrsta || "—"}</div>
                    <div><b>Oznaka:</b> {oznaka || "—"}</div>
                    <div><b>Dobavljač:</b> {roll.proizvodjac || "—"}</div>
                </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 5, fontSize: 10 }}>
                <tbody>
                    <tr><td style={tdh}>DEB.</td><td style={td}>{roll.debljina || "—"} µ</td><td style={tdh}>ŠIRINA</td><td style={td}>{roll.sirina} mm</td></tr>
                    <tr><td style={tdh}>METRAŽA</td><td style={td}>{fmt(roll.duzina, 0)} m</td><td style={tdh}>KG</td><td style={td}>{fmt(roll.kg, 2)}</td></tr>
                    <tr><td style={tdh}>LOT</td><td style={td}>{roll.lot || "—"}</td><td style={tdh}>DAT. PROIZ.</td><td style={td}>{formatDateLabel(roll.datum_proizvodnje) || "—"}</td></tr>
                </tbody>
            </table>
            {roll.parent_qr && <div style={{ marginTop: 4, fontSize: 9 }}><b>Parent rolna:</b> {roll.parent_qr}</div>}
            <div style={{ marginTop: 5, borderTop: "1px solid #111", paddingTop: 4, fontSize: 8 }}>
                Skeniranjem QR koda otvara se istorija i status rolne.
            </div>
            <div style={{ marginTop: 7, borderTop: "2px solid #111", paddingTop: 6, fontSize: 13, fontWeight: 900 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}><span style={boxStyle}></span><span>Prvi ulaz</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={boxStyle}></span><span>Povrat u magacin</span></div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 7 }}>
                    <span style={{ fontSize: 13, fontWeight: 900 }}>PREČNIK:</span>
                    <span style={{ flex: 1, borderBottom: "2px solid #111", height: "8mm" }}></span>
                    <span style={{ fontSize: 8, fontWeight: 700 }}>mm — upisati pri povratu</span>
                </div>
            </div>
        </div>
    );
}
const boxStyle = { display: "inline-block", width: "7mm", height: "7mm", border: "2px solid #111" };
const td = { border: "1px solid #111", padding: 3 };
const tdh = { ...td, fontWeight: 900 };

export default function RolneWarehouseEngine({ db = {}, msg, forceMobile = false }) {
    const [activeTab, setActiveTab] = useState("rolne");
    const [inputMode, setInputMode] = useState("rucno");
    const [materijali, setMaterijali] = useState([]);
    const [rolne, setRolne] = useState([]);
    const [history, setHistory] = useState([]);
    const [povratLog, setPovratLog] = useState(() => safeRead(LS_POVRAT, []));
    const [povratiDb, setPovratiDb] = useState([]);
    async function loadPovrati() {
        try {
            if (!supabase || supabase.__notConfigured) return;
            const { data } = await supabase.from("povrati_magacin").select("*").order("created_at", { ascending: false }).limit(1000);
            setPovratiDb((data || []).map((r) => ({
                vreme: r.created_at ? new Date(r.created_at).toLocaleString("sr-RS") : "",
                operater: r.operater || "—",
                qr: r.br_rolne || r.qr || "—",
                event: "POVRAT U MAGACIN",
                opis: r.opis || `${fmt(number(r.metri), 0)} m · ${fmt(number(r.kg), 2)} kg · ${r.lokacija || "—"}`,
                metri: number(r.metri), kg: number(r.kg), lokacija: r.lokacija,
                _id: r.id,
            })));
        } catch (e) { console.warn("loadPovrati:", e?.message); }
    }
    useEffect(() => { loadPovrati(); /* eslint-disable-next-line */ }, []);
    const [operater, setOperater] = useState(() => safeRead(LS_OPERATER, null));
    const [loginForm, setLoginForm] = useState({ email: "", sifra: "" });
    const isAdmin = ADMIN_EMAILS.includes(String(operater?.email || "").trim().toLowerCase());
    const { userProfile, userRole } = useAuth();
    const canReserve = true; // svi prijavljeni korisnici mogu da rezervišu
    const reserverName = userProfile?.ime || operater?.ime || userProfile?.email || operater?.email || "";
    useEffect(() => { if (operater && !isAdmin && ["predlog"].includes(activeTab)) setActiveTab("rolne"); }, [operater, isAdmin, activeTab]);
    const [filter, setFilter] = useState("");
    const [columnFilters, setColumnFilters] = useState({ datum: "", datum_proizvodnje: "", vrsta: "", pod_vrsta: "", oznaka: "", proizvodjac: "", debljina: "", sirina: "", duzina: "", kg: "", lot: "", lokacija: "", status: "" });
    const [matFilter, setMatFilter] = useState("");
    const [selectedMatId, setSelectedMatId] = useState("");
    const [calcMode, setCalcMode] = useState("m_to_kg");
    const [precnikForm, setPrecnikForm] = useState({ spoljniPrecnik: "", hilzna: "FI76" });
    const [crevoForm, setCrevoForm] = useState({ vrsta: "", pod_vrsta: "", oznaka: "", debljina: "", sirina: "", precnik: "", hilzna: "FI76", oblik: "crevo", kCustom: "2", dobavljac: "", cenaKg: "", lot: "", lokacija: "Magacin", datum_proizvodnje: "", napomena: "" });
    const [rezPopup, setRezPopup] = useState(null);
    const [rezForm, setRezForm] = useState(null);
    const [oslForm, setOslForm] = useState(null);
    const [adminMode, setAdminMode] = useState(false);
    const [form, setForm] = useState({ sirina: 840, duzina: 10000, kg: "", lot: "", lokacija: "A-01-A-01", pod_vrsta: "", datum_proizvodnje: "", napomena: "" });
    const [matForm, setMatForm] = useState({ vrsta: "BOPP", komercijalnaOznaka: "BOPP transparent 20µ", proizvodjac: "", debljina: 20, koeficijent: 0.91, gsm: 18.2, jedinica: "µ", cenaKg: 3.1, napomena: "" });
    // V45: Jedini aktivni unos materijala ide preko Material Master logike.
    // Nema duplog ručnog kucanja: VRSTA -> OZNAKA -> DEBLJINA -> auto koef/gm2/naziv.
    const [materialPick, setMaterialPick] = useState({ vrsta: "BOPP", pod_vrsta: "Transparent", oznaka: "FXC", debljina: 20, proizvodjac: "", cenaKg: "", koeficijent: "", napomena: "" });
    // Kaširana (spojena) rolna — 2-4 sloja, svaki iz iste Material master baze.
    const [layers, setLayers] = useState([
        { vrsta: "BOPP", pod_vrsta: "Transparent", oznaka: "FXC", debljina: 20 },
        { vrsta: "PE", pod_vrsta: "", oznaka: "", debljina: 50 },
        { vrsta: "ALU", pod_vrsta: "", oznaka: "", debljina: 7 },
        { vrsta: "PET", pod_vrsta: "", oznaka: "PET HS", debljina: 12 },
    ]);
    const [layerCount, setLayerCount] = useState(2);
    const [lepakGsm, setLepakGsm] = useState(2.5);
    const [compositeCenaKg, setCompositeCenaKg] = useState("");
    const [materialDropdowns, setMaterialDropdowns] = useState(FALLBACK_MATERIAL_DROPDOWNS);
    const [materialMaster, setMaterialMaster] = useState([]);
    const [materialPrices, setMaterialPrices] = useState({});
    const crevoCalc = useMemo(() => {
        const k = crevoForm.oblik === "ravna" ? 1 : (crevoForm.oblik === "custom" ? (number(crevoForm.kCustom) || 1) : 2);
        const vU = String(crevoForm.vrsta || "").toUpperCase();
        const deb = number(crevoForm.debljina);
        // 1) tačno poklapanje vrsta+oznaka+debljina
        const m = materialMaster.find((x) => String(x.vrsta || "").toUpperCase() === vU
            && (!crevoForm.oznaka || String(x.oznaka || "").toUpperCase() === String(crevoForm.oznaka || "").toUpperCase())
            && Number(x.debljina) === deb);
        // 2) gustine (g/cm³) za izračun g/m² = debljina(µm) × gustina
        const GUSTINA = { PET: 1.40, BOPP: 0.91, OPP: 0.91, CPP: 0.905, PE: 0.923, LDPE: 0.923, HDPE: 0.95, PEHD: 0.95, PA: 1.14, OPA: 1.14, NYLON: 1.14, ALU: 2.71, PVC: 1.30, EVOH: 1.17, PLA: 1.25, BIOFOLIJA: 1.25 };
        let gsm = m ? (number(m.gsm) || round2(number(m.debljina) * number(m.koeficijent))) : 0;
        if (!gsm) {
            if (vU === "PAPIR") { gsm = deb; } // za papir je „debljina" zapravo g/m²
            else {
                const vMatch = materialMaster.find((x) => String(x.vrsta || "").toUpperCase() === vU && number(x.koeficijent));
                const koef = vMatch ? number(vMatch.koeficijent) : (GUSTINA[vU] || 0);
                if (deb && koef) gsm = round2(deb * koef);
            }
        }
        const baznaCena = m ? number(m.cenaKg ?? m.cena_kg) : (() => { const v = materialMaster.find((x) => String(x.vrsta || "").toUpperCase() === vU && number(x.cenaKg ?? x.cena_kg)); return v ? number(v.cenaKg ?? v.cena_kg) : 0; })();
        const meters = estimateMetersFromDiameter({ debljina: deb * k }, crevoForm.precnik, crevoForm.hilzna);
        const razvijena = round2(number(crevoForm.sirina) * k);
        const kg = kgFromMeters({ sirinaMm: razvijena, duzinaM: meters, gsm });
        const cenaKg = number(crevoForm.cenaKg) || baznaCena;
        const vrednost = round2(kg * cenaKg);
        return { k, gsm, meters, razvijena, kg, cenaKg, baznaCena, vrednost };
    }, [crevoForm, materialMaster]);
    const [req, setReq] = useState({ vrsta: "BOPP", debljina: 20, sirina: 840, potrebniM: 5000 });
    const [labelRoll, setLabelRoll] = useState(null);
    const [bulkLabels, setBulkLabels] = useState([]);
    const [selectedRolls, setSelectedRolls] = useState([]);
    const [packingText, setPackingText] = useState("Vrsta;Oznaka;Proizvođač;Debljina;Širina;m;kg;Lot;Lokacija;Datum\nBOPP;BOPP transparent 20µ;Dobavljač;20;840;10000;;LOT-1;A-01;");
    const [packingRows, setPackingRows] = useState([]);
    const [popisQr, setPopisQr] = useState("");
    const [popisRoll, setPopisRoll] = useState(null);
    const [popisForm, setPopisForm] = useState({ duzina: "", kg: "", lokacija: "" });
    const [popisMagacin, setPopisMagacin] = useState("A");
    const [popisSessionId, setPopisSessionId] = useState(() => `POPIS-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-6)}`);
    const [popisScanned, setPopisScanned] = useState({});
    const [povratQr, setPovratQr] = useState("");
    const [povratRoll, setPovratRoll] = useState(null);
    const [povratForm, setPovratForm] = useState({ hilzna: "FI76", spoljasnjiPrecnik: "", lokacija: "Magacin", napomena: "Povrat u magacin" });
    const [scannerMode, setScannerMode] = useState(null); // "popis" | "povrat" | "lokacija"
    const [locationTarget, setLocationTarget] = useState("popis");
    const [locationParts, setLocationParts] = useState({ magacin: "", red: "", polica: "", pozicija: "" });

    async function loadMaterialDropdowns() {
        if (supabase?.__notConfigured) {
            setMaterialDropdowns(FALLBACK_MATERIAL_DROPDOWNS);
            return;
        }
        try {
            const [vrsteRes, podVrsteRes, oznakeRes, debljineRes, proizvodjaciRes] = await Promise.all([
                supabase.from("material_vrste").select("naziv, sort_order, aktivan").eq("aktivan", true).order("sort_order", { ascending: true, nullsFirst: false }).order("naziv", { ascending: true }),
                supabase.from("material_pod_vrste").select("naziv, sort_order, aktivan").eq("aktivan", true).order("sort_order", { ascending: true, nullsFirst: false }).order("naziv", { ascending: true }),
                supabase.from("material_oznake").select("naziv, sort_order, aktivan").eq("aktivan", true).order("sort_order", { ascending: true, nullsFirst: false }).order("naziv", { ascending: true }),
                supabase.from("material_debljine").select("vrednost, sort_order, aktivan").eq("aktivan", true).order("sort_order", { ascending: true, nullsFirst: false }).order("vrednost", { ascending: true }),
                supabase.from("material_proizvodjaci").select("naziv, sort_order, aktivan").eq("aktivan", true).order("sort_order", { ascending: true, nullsFirst: false }).order("naziv", { ascending: true }),
            ]);

            const anyError = [vrsteRes, podVrsteRes, oznakeRes, debljineRes, proizvodjaciRes].find((r) => r.error);
            if (anyError?.error) throw anyError.error;

            setMaterialDropdowns({
                vrste: uniqSorted((vrsteRes.data || []).map((x) => x.naziv), FALLBACK_MATERIAL_DROPDOWNS.vrste),
                podVrste: uniqSorted((podVrsteRes.data || []).map((x) => x.naziv), FALLBACK_MATERIAL_DROPDOWNS.podVrste),
                oznake: uniqSorted((oznakeRes.data || []).map((x) => x.naziv), FALLBACK_MATERIAL_DROPDOWNS.oznake),
                debljine: uniqSorted((debljineRes.data || []).map((x) => Number(x.vrednost)), FALLBACK_MATERIAL_DROPDOWNS.debljine),
                proizvodjaci: uniqSorted((proizvodjaciRes.data || []).map((x) => x.naziv), FALLBACK_MATERIAL_DROPDOWNS.proizvodjaci),
            });
        } catch (e) {
            console.warn("Material dropdown liste nisu učitane iz Supabase, koristim fallback liste:", e);
            setMaterialDropdowns(FALLBACK_MATERIAL_DROPDOWNS);
        }
    }

    async function loadMaterialMaster() {
        if (supabase?.__notConfigured) {
            setMaterialMaster([]);
            setMaterialPrices({});
            return;
        }
        try {
            const { data, error } = await supabase
                .from("material_master")
                .select("*")
                .order("vrsta", { ascending: true })
                .order("pod_vrsta", { ascending: true })
                .order("oznaka", { ascending: true })
                .order("debljina", { ascending: true });
            if (error) throw error;
            const rows = (data || []).map(normalizeMasterMaterialRow).filter((x) => x.aktivan !== false);
            setMaterialMaster(rows);

            try {
                const { data: prices, error: priceError } = await supabase
                    .from("material_cene")
                    .select("material_master_id,cena_kg,valuta,datum_od,aktivna,created_at")
                    .eq("aktivna", true)
                    .order("datum_od", { ascending: false });
                if (priceError) throw priceError;
                const priceMap = {};
                (prices || []).forEach((pr) => {
                    if (!priceMap[pr.material_master_id]) priceMap[pr.material_master_id] = pr;
                });
                setMaterialPrices(priceMap);
            } catch (priceErr) {
                console.warn("Cene materijala nisu učitane:", priceErr);
                setMaterialPrices({});
            }
        } catch (e) {
            console.warn("Material master nije učitan iz Supabase:", e);
            setMaterialMaster([]);
            setMaterialPrices({});
            msg?.("Ne mogu da učitam material_master: " + (e?.message || e), "err");
        }
    }

    async function reload() {
        const mats = ensureMaterials().map(normalizeMaterial);
        safeWrite(LS_MATERIJALI, mats);
        setMaterijali(mats);

        let sourceRolls = [];
        let loadedFromSupabase = false;
        try {
            if (!supabase?.__notConfigured) {
                const { data, error } = await supabase
                    .from("magacin")
                    .select("*")
                    .order("created_at", { ascending: false });

                if (error) throw error;
                sourceRolls = (data || []).map(mapDbRollToEngine);
                loadedFromSupabase = true;
            }
        } catch (e) {
            console.error("Učitavanje rolni iz Supabase magacin nije uspelo:", e);
            msg?.("Ne mogu da učitam stanje rolni iz Supabase: " + (e?.message || e), "err");
        }

        // VAŽNO: kada Supabase radi, desktop i telefon moraju da pokazuju isto stanje.
        // Ne mešamo više stare localStorage rolne sa public.magacin, jer to pravi razliku 29 vs 18 rolni.
        if (!loadedFromSupabase) {
            const localRolls = safeRead(LS_ROLNE, []).map(mapDbRollToEngine);
            const dbRolls = Array.isArray(db?.rolne) ? db.rolne.map(mapDbRollToEngine) : [];
            sourceRolls = [...dbRolls, ...localRolls]
                .filter((x, i, arr) => x && i === arr.findIndex(y => String(y.qr || y.id) === String(x.qr || x.id)));
        }

        setRolne(sourceRolls.filter((r) => normalizeStatus(r.status) !== "obrisano"));
        if (!loadedFromSupabase) safeWrite(LS_ROLNE, sourceRolls);
        try {
            if (!supabase?.__notConfigured) {
                const { data: hist, error: hErr } = await supabase.from(HISTORY_TABLE).select("*").order("created_at", { ascending: false }).limit(HISTORY_SYNC_LIMIT);
                if (hErr) throw hErr;
                const imeMap = await loadOperateriMap();
                setHistory((Array.isArray(hist) ? hist : []).map((h) => mapIstorijaRow(h, imeMap)));
            } else {
                setHistory(safeRead(LS_HISTORY, []));
            }
        } catch (e) {
            setHistory(safeRead(LS_HISTORY, []));
        }
        if (!selectedMatId && mats[0]) setSelectedMatId(mats[0].id);
    }
    useEffect(() => { reload(); loadMaterialDropdowns(); loadMaterialMaster(); }, []);
    useEffect(() => { reload(); }, [db?.rolne?.length]);

    // Uvek najsveziji reload, da realtime/focus callback-ovi ne koriste stari React closure.
    const reloadRef = React.useRef(reload);
    useEffect(() => { reloadRef.current = reload; });

    // REALTIME SYNC + OTPORNOST: telefon i desktop gledaju istu public.magacin tabelu.
    // 1) realtime kanal gura promene na sve uredjaje,
    // 2) na povratak taba/aplikacije u fokus radi reload (hvata promene propustene dok je veza spavala),
    // 3) ako kanal padne (CHANNEL_ERROR / TIMED_OUT / CLOSED) automatski se ponovo povezuje,
    // 4) sigurnosni interval povlaci stanje i kada realtime zakaze.
    useEffect(() => {
        if (supabase?.__notConfigured) return;

        let channel = null;
        let retryTimer = null;
        let cancelled = false;
        const safeReload = () => { try { reloadRef.current?.(); } catch (e) { /* noop */ } };

        const subscribe = () => {
            if (cancelled) return;
            try { if (channel) supabase.removeChannel(channel); } catch (e) { /* noop */ }
            channel = supabase
                .channel("magacin_rolne_sync")
                .on("postgres_changes", { event: "*", schema: "public", table: "magacin" }, safeReload)
                .on("postgres_changes", { event: "*", schema: "public", table: HISTORY_TABLE }, safeReload)
                .subscribe((status) => {
                    if (status === "SUBSCRIBED") {
                        safeReload(); // posle (ponovnog) povezivanja uvek povuci sveze stanje
                    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                        if (!cancelled && !retryTimer) {
                            retryTimer = setTimeout(() => { retryTimer = null; subscribe(); }, 3000);
                        }
                    }
                });
        };

        const onVisible = () => { if (document.visibilityState === "visible") safeReload(); };
        const onOnline = () => { safeReload(); subscribe(); };

        subscribe();
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", safeReload);
        window.addEventListener("online", onOnline);
        const pollTimer = setInterval(safeReload, 60000);

        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
            clearInterval(pollTimer);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", safeReload);
            window.removeEventListener("online", onOnline);
            try { if (channel) supabase.removeChannel(channel); } catch (e) { /* noop */ }
        };
    }, []);
    useEffect(() => {
        setPopisForm((f) => ({ ...f, lokacija: f.lokacija || "" }));
    }, [popisMagacin]);

    function findRollLocalByQr(qrValue) {
        const qr = extractQrFromScan(qrValue);
        return rolne.find((r) => {
            const keys = [r.qr, r.qr_code, r.br_rolne, r.broj_rolne, rollQrPayload(r)];
            return keys.some((k) => String(extractQrFromScan(k) || "").trim() === String(qr || "").trim());
        }) || null;
    }

    async function fetchRollFromSupabaseByQr(qrValue) {
        const qr = extractQrFromScan(qrValue);
        if (!qr || supabase?.__notConfigured) return null;
        try {
            let { data, error } = await supabase
                .from("magacin")
                .select("*")
                .eq("br_rolne", qr)
                .limit(1);
            if (error) throw error;
            if (!data?.[0]) {
                const res = await supabase
                    .from("magacin")
                    .select("*")
                    .eq("qr_code", qr)
                    .limit(1);
                if (res.error) throw res.error;
                data = res.data;
            }
            return data?.[0] ? mapDbRollToEngine(data[0]) : null;
        } catch (e) {
            console.error("QR lookup iz Supabase magacin nije uspeo:", e);
            msg?.("Ne mogu da proverim QR u Supabase: " + (e?.message || e), "err");
            return null;
        }
    }

    async function resolveRollByQr(qrValue) {
        // Jedan izvor istine: kada Supabase radi, uvek čitamo svežu rolnu iz public.magacin.
        // Ovo sprečava razliku desktop ↔ telefon posle skidanja metraže, povrata ili promene lokacije.
        const fresh = await fetchRollFromSupabaseByQr(qrValue);
        if (fresh) {
            setRolne((prev) => {
                const next = [fresh, ...prev.filter((r) => String(r.qr) !== String(fresh.qr) && String(r.id) !== String(fresh.id))];
                return next;
            });
            return fresh;
        }
        return findRollLocalByQr(qrValue);
    }


    async function persistRollState(roll, updates = {}, options = {}) {
        if (!roll?.id) throw new Error("Nedostaje ID rolne za upis u magacin.");

        const payload = { updated_at: new Date().toISOString() };
        if (Object.prototype.hasOwnProperty.call(updates, "meters")) {
            const m = number(updates.meters);
            payload.metraza_ost = m;
            // U ovom sistemu metraza i metraza_ost moraju ostati iste kao trenutno stanje.
            payload.metraza = m;
        }
        if (Object.prototype.hasOwnProperty.call(updates, "kg")) {
            payload.kg_neto = round2(updates.kg);
        }
        if (Object.prototype.hasOwnProperty.call(updates, "location")) {
            payload.lokacija = String(updates.location || "").trim() || null;
        }
        if (Object.prototype.hasOwnProperty.call(updates, "status")) {
            payload.status = toDbStatus(updates.status || "Na stanju");
        }
        if (Object.prototype.hasOwnProperty.call(updates, "napomena")) {
            payload.napomena = updates.napomena || null;
        }
        if (updates.popis) {
            payload.datum_poslednjeg_popisa = new Date().toISOString();
        }

        if (!supabase?.__notConfigured) {
            const { data, error } = await supabase
                .from("magacin")
                .update(payload)
                .eq("id", roll.id)
                .select("*")
                .single();
            if (error) throw error;
            if (!data) throw new Error("Supabase nije vratio ažuriranu rolnu.");
            const fresh = mapDbRollToEngine(data);
            setRolne((prev) => prev.map((r) => String(r.id) === String(fresh.id) || String(r.qr) === String(fresh.qr) ? fresh : r));
            if (povratRoll?.id && String(povratRoll.id) === String(fresh.id)) setPovratRoll(fresh);
            if (popisRoll?.id && String(popisRoll.id) === String(fresh.id)) setPopisRoll(fresh);
            if (options.reload !== false) await reload();
            return fresh;
        }

        const local = mapDbRollToEngine({ ...roll, ...payload, id: roll.id });
        setRolne((prev) => prev.map((r) => String(r.id) === String(local.id) || String(r.qr) === String(local.qr) ? local : r));
        return local;
    }

    const masterVrste = useMemo(() => {
        const vals = uniqMaterialValues(materialMaster, "vrsta", []);
        return vals.length ? vals : (materialDropdowns.vrste || FALLBACK_MATERIAL_DROPDOWNS.vrste);
    }, [materialMaster, materialDropdowns]);

    const masterPodVrste = useMemo(() => {
        if (!materialPick.vrsta) return [];
        const rows = materialMaster.filter((x) => x.vrsta === materialPick.vrsta);
        const vals = uniqMaterialValues(rows, "pod_vrsta", []);
        return materialMaster.length ? vals : (materialDropdowns.podVrste || FALLBACK_MATERIAL_DROPDOWNS.podVrste);
    }, [materialMaster, materialDropdowns, materialPick.vrsta]);

    const masterOznake = useMemo(() => {
        if (!materialPick.vrsta || !materialPick.pod_vrsta) return [];
        const rows = materialMaster.filter((x) => x.vrsta === materialPick.vrsta && x.pod_vrsta === materialPick.pod_vrsta);
        const vals = uniqMaterialValues(rows, "oznaka", []);
        return materialMaster.length ? vals : (materialDropdowns.oznake || FALLBACK_MATERIAL_DROPDOWNS.oznake);
    }, [materialMaster, materialDropdowns, materialPick.vrsta, materialPick.pod_vrsta]);

    const masterDebljine = useMemo(() => {
        if (!materialPick.vrsta || !materialPick.pod_vrsta || !materialPick.oznaka) return [];
        const rows = materialMaster.filter((x) => x.vrsta === materialPick.vrsta && x.pod_vrsta === materialPick.pod_vrsta && x.oznaka === materialPick.oznaka);
        const vals = uniqSorted(rows.map((x) => Number(x.debljina)).filter((x) => Number.isFinite(x)), []);
        return materialMaster.length ? vals : (materialDropdowns.debljine || FALLBACK_MATERIAL_DROPDOWNS.debljine);
    }, [materialMaster, materialDropdowns, materialPick.vrsta, materialPick.pod_vrsta, materialPick.oznaka]);

    const masterProizvodjaci = useMemo(() => {
        // Proizvođači baš za ovaj materijal (najrelevantniji) — prikaži prve
        const zaMaterijal = uniqMaterialValues(
            materialMaster.filter((x) => x.vrsta === materialPick.vrsta && x.pod_vrsta === materialPick.pod_vrsta && x.oznaka === materialPick.oznaka && Number(x.debljina) === Number(materialPick.debljina)),
            "proizvodjac", []
        );
        // ...pa SVI ostali proizvođači (iz cele baze materijala + liste proizvođača + sa rolni),
        // jer isti materijal može doći od različitih dobavljača — ne ograničavati izbor.
        const sviMaster = uniqMaterialValues(materialMaster, "proizvodjac", []);
        const izListe = materialDropdowns.proizvodjaci || FALLBACK_MATERIAL_DROPDOWNS.proizvodjaci || [];
        const izRolni = [...new Set((rolne || []).map((x) => x.dobavljac).filter(Boolean))];
        return [...new Set([...zaMaterijal, ...sviMaster, ...izListe, ...izRolni])].filter(Boolean);
    }, [materialMaster, materialDropdowns, rolne, materialPick.vrsta, materialPick.pod_vrsta, materialPick.oznaka, materialPick.debljina]);

    // V46: dozvoljen unos NOVE kombinacije u rucnom unosu.
    // Polja se NE popunjavaju automatski — magacioner slobodno briše i kuca (ili bira iz liste).

    useEffect(() => {
        setForm((f) => ({ ...f, pod_vrsta: materialPick.pod_vrsta || "" }));
    }, [materialPick.pod_vrsta]);

    const selectedMasterMaterial = useMemo(() => {
        return materialMaster.find((x) => x.vrsta === materialPick.vrsta && x.pod_vrsta === materialPick.pod_vrsta && x.oznaka === materialPick.oznaka && Number(x.debljina) === Number(materialPick.debljina)) || null;
    }, [materialMaster, materialPick]);

    const selectedMat = useMemo(() => {
        const master = selectedMasterMaterial;
        const koef = number(master?.koeficijent) || number(materialPick.koeficijent) || mmKoeficijent(materialPick.vrsta) || 0;
        const gsm = number(master?.gsm) || (Number(materialPick.debljina) && koef ? round2(Number(materialPick.debljina) * koef) : mmCalculateGm2(materialPick.vrsta, materialPick.debljina));
        const cenaIzCenovnika = master?.id && materialPrices[master.id]?.cena_kg ? number(materialPrices[master.id].cena_kg) : 0;
        const cenaKg = number(materialPick.cenaKg) || cenaIzCenovnika || number(master?.cena_kg);
        const naziv = materialDisplayName({ vrsta: materialPick.vrsta, pod_vrsta: materialPick.pod_vrsta, oznaka: materialPick.oznaka, debljina: materialPick.debljina });
        return normalizeMaterial({
            id: master?.id || `MAT-${materialPick.vrsta}-${materialPick.pod_vrsta}-${materialPick.oznaka}-${materialPick.debljina}`.replace(/[^A-Za-z0-9_-]/g, "_"),
            vrsta: materialPick.vrsta,
            pod_vrsta: materialPick.pod_vrsta,
            oznaka: materialPick.oznaka,
            komercijalnaOznaka: naziv,
            proizvodjac: materialPick.proizvodjac || master?.proizvodjac || "",
            debljina: materialPick.debljina,
            koeficijent: koef,
            gsm,
            jedinica: materialPick.vrsta === "PAPIR" ? "g/m²" : "µ",
            cenaKg,
            napomena: materialPick.napomena || ""
        });
    }, [materialPick, selectedMasterMaterial, materialPrices]);

    const liveGsm = selectedMat ? calcGsm(selectedMat) : 0;
    const calculatedKg = useMemo(() => kgFromMeters({ sirinaMm: form.sirina, duzinaM: form.duzina, gsm: liveGsm }), [form.sirina, form.duzina, liveGsm]);
    const calculatedM = useMemo(() => metersFromKg({ sirinaMm: form.sirina, kg: form.kg, gsm: liveGsm }), [form.sirina, form.kg, liveGsm]);

    function syncFormByMode(next) {
        const merged = { ...form, ...next };
        if (calcMode === "m_to_kg") merged.kg = kgFromMeters({ sirinaMm: merged.sirina, duzinaM: merged.duzina, gsm: liveGsm });
        else if (calcMode === "kg_to_m") merged.duzina = metersFromKg({ sirinaMm: merged.sirina, kg: merged.kg, gsm: liveGsm });
        else if (calcMode === "precnik") {
            merged.duzina = estimateMetersFromDiameter({ debljina: number(materialPick.debljina) }, precnikForm.spoljniPrecnik, precnikForm.hilzna);
            merged.kg = kgFromMeters({ sirinaMm: merged.sirina, duzinaM: merged.duzina, gsm: liveGsm });
        }
        setForm(merged);
    }
    function syncByDiameter(next) {
        const pf = { ...precnikForm, ...next };
        setPrecnikForm(pf);
        const m = estimateMetersFromDiameter({ debljina: number(materialPick.debljina) }, pf.spoljniPrecnik, pf.hilzna);
        const kg = kgFromMeters({ sirinaMm: form.sirina, duzinaM: m, gsm: liveGsm });
        setForm((f) => ({ ...f, duzina: m, kg }));
    }

    const filteredMaterials = useMemo(() => {
        const q = matFilter.toLowerCase().trim();
        if (!q) return materijali;
        return materijali.filter((m) => [m.vrsta, m.komercijalnaOznaka, m.proizvodjac, m.debljina, m.gsm, m.napomena].join(" ").toLowerCase().includes(q));
    }, [materijali, matFilter]);

    const filteredRolls = useMemo(() => {
        const q = filter.toLowerCase().trim();
        const matchesText = (val, needle) => String(val ?? "").toLowerCase().includes(String(needle ?? "").toLowerCase().trim());
        return rolne.filter((r) => {
            if (!isRollVisibleOnStock(r)) return false;
            if (q && ![r.qr, r.datum_ulaza, r.datum, r.datum_proizvodnje, r.datum_popisa, r.vrsta, r.pod_vrsta, r.oznaka_materijala, r.materijal, r.komercijalnaOznaka, r.proizvodjac, r.debljina, r.sirina, r.duzina, r.kg, r.lot, r.lokacija, r.status, r.master_nalog_id].join(" ").toLowerCase().includes(q)) return false;
            if (columnFilters.datum && !matchesText(r.datum_ulaza || r.datum, columnFilters.datum)) return false;
            if (columnFilters.vrsta && !matchesText(r.vrsta, columnFilters.vrsta)) return false;
            if (columnFilters.pod_vrsta && !matchesText(r.pod_vrsta, columnFilters.pod_vrsta)) return false;
            if (columnFilters.datum_proizvodnje && !matchesText(r.datum_proizvodnje, columnFilters.datum_proizvodnje)) return false;
            if (columnFilters.oznaka && !matchesText(rollOznaka(r), columnFilters.oznaka)) return false;
            if (columnFilters.proizvodjac && !matchesText(r.proizvodjac, columnFilters.proizvodjac)) return false;
            if (columnFilters.debljina && !matchesText(r.debljina, columnFilters.debljina)) return false;
            if (columnFilters.sirina && !matchesText(r.sirina, columnFilters.sirina)) return false;
            if (columnFilters.duzina && !matchesText(r.duzina, columnFilters.duzina)) return false;
            if (columnFilters.kg && !matchesText(r.kg, columnFilters.kg)) return false;
            if (columnFilters.lot && !matchesText(r.lot, columnFilters.lot)) return false;
            if (columnFilters.lokacija && !matchesText(r.lokacija, columnFilters.lokacija)) return false;
            if (columnFilters.status && normalizeStatus(r.status) !== normalizeStatus(columnFilters.status)) return false;
            return true;
        });
    }, [rolne, filter, columnFilters]);

    // --- Paginacija (50 po strani; pretraga radi na celoj listi) ---
    const PER_PAGE = 50;
    const [rollPage, setRollPage] = useState(1);
    const [histPage, setHistPage] = useState(1);
    useEffect(() => { setRollPage(1); }, [filter, columnFilters]);
    const rollPages = Math.max(1, Math.ceil(filteredRolls.length / PER_PAGE));
    const rollPageC = Math.min(rollPage, rollPages);
    const pagedRolls = useMemo(() => filteredRolls.slice((rollPageC - 1) * PER_PAGE, rollPageC * PER_PAGE), [filteredRolls, rollPageC]);
    const histPages = Math.max(1, Math.ceil((history ? history.length : 0) / PER_PAGE));
    const histPageC = Math.min(histPage, histPages);
    const pagedHistory = useMemo(() => (history || []).slice((histPageC - 1) * PER_PAGE, histPageC * PER_PAGE), [history, histPageC]);

    // Istorija POVRATA (rolne vraćene kroz „Povrat u magacin") + filter po broju rolne
    const [povratSearch, setPovratSearch] = useState("");
    const [povratPage, setPovratPage] = useState(1);
    useEffect(() => { setPovratPage(1); }, [povratSearch]);
    const povratHistory = useMemo(() => {
        const q = String(povratSearch || "").trim().toLowerCase();
        // Primarno: BAZA (deljeno svima); dopuna: lokalni log + „povrat" iz istorije — bez duplikata
        const izBaze = Array.isArray(povratiDb) ? povratiDb : [];
        const izLoga = Array.isArray(povratLog) ? povratLog : [];
        const izIstorije = (history || []).filter((h) => /povrat/i.test(String(h.event || "")));
        const kljuc = (h) => (String(h.qr || "")) + "|" + Math.round(number(h.metri));
        const seen = new Set(izBaze.map(kljuc));
        const spojeno = [
            ...izBaze,
            ...izLoga.filter((h) => !seen.has(kljuc(h))),
            ...izIstorije.filter((h) => !seen.has(kljuc(h)) && !izLoga.some((l) => (l.vreme === h.vreme && l.qr === h.qr))),
        ];
        return spojeno.filter((h) => !q || String(h.qr || "").toLowerCase().includes(q));
    }, [povratiDb, povratLog, history, povratSearch]);
    const povratPages = Math.max(1, Math.ceil(povratHistory.length / PER_PAGE));
    const povratPageC = Math.min(povratPage, povratPages);
    const pagedPovrat = useMemo(() => povratHistory.slice((povratPageC - 1) * PER_PAGE, povratPageC * PER_PAGE), [povratHistory, povratPageC]);

    const stats = useMemo(() => {
        // Statistika magacina gleda SAMO rolne koje su stvarno na stanju (iskorišćene/skinute se ne računaju).
        const naStanjuRolne = rolne.filter(isRollVisibleOnStock);
        const totalM = naStanjuRolne.reduce((s, r) => s + number(r.metraza_ost ?? r.duzina ?? r.metraza), 0);
        const totalKg = naStanjuRolne.reduce((s, r) => s + number(r.kg_neto ?? r.kg), 0);
        const totalValue = naStanjuRolne.reduce((s, r) => s + (number(r.vrednost) || (number(r.kg_neto ?? r.kg) * number(r.cena_kg ?? r.cenaKg))), 0);
        const byStatus = naStanjuRolne.reduce((a, r) => {
            const st = normalizeStatus(r.status);
            a[st] = (a[st] || 0) + 1;
            return a;
        }, {});

        // ZA PORUCIVANJE: koliko materijala (sa definisanom minimalnom zalihom) ima kg na stanju ispod minimuma.
        const keyOf = (vrsta, oznaka, deb) => `${normKey(vrsta)}|${normMaterialCode(oznaka)}|${Number(deb) || 0}`;
        const kgByKey = {};
        rolne.filter((r) => normalizeStatus(r.status) === "dostupna").forEach((r) => {
            const k = keyOf(r.vrsta, r.oznaka_materijala ?? r.oznaka ?? r.komercijalnaOznaka, r.debljina);
            kgByKey[k] = (kgByKey[k] || 0) + number(r.kg_neto ?? r.kg);
        });
        const ispodMinimuma = (materialMaster || [])
            .map((m) => {
                const minimum = number(m.minimalna_zaliha);
                const naStanju = kgByKey[keyOf(m.vrsta, m.oznaka, m.debljina)] || 0;
                return { ...m, minimum, naStanju, manjak: round2(Math.max(0, minimum - naStanju)) };
            })
            .filter((m) => m.minimum > 0 && m.naStanju < m.minimum)
            .sort((a, b) => b.manjak - a.manjak);
        const zaPorucivanje = ispodMinimuma.length;

        return { total: naStanjuRolne.length, totalM, totalKg, totalValue, dostupna: byStatus.dostupna || 0, rezervisana: byStatus.rezervisana || 0, formatirana: byStatus.formatirana || 0, potrosena: byStatus.potrosena || 0, zaPorucivanje, ispodMinimuma };
    }, [rolne, materialMaster]);

    const popisExpectedRolls = useMemo(() => {
        return rolne.filter((r) => isRollVisibleOnStock(r) && isLocationInMagacin(r.lokacija, popisMagacin));
    }, [rolne, popisMagacin]);

    const popisCountedRows = useMemo(() => {
        return Object.values(popisScanned || {}).filter(Boolean);
    }, [popisScanned]);

    const popisMissingRolls = useMemo(() => {
        const counted = new Set(popisCountedRows.map((x) => String(x.qr || "")));
        return popisExpectedRolls.filter((r) => !counted.has(String(r.qr || "")));
    }, [popisExpectedRolls, popisCountedRows]);

    const popisExtraRows = useMemo(() => {
        return popisCountedRows.filter((x) => !isLocationInMagacin(x.ocekivana_lokacija || x.popisana_lokacija, popisMagacin));
    }, [popisCountedRows, popisMagacin]);

    const suggestedRolls = useMemo(() => {
        const matches = findMatchingRolls(req);
        const needM = number(req.potrebniM);
        return matches.map((r) => ({ ...r, pokriva: needM ? number(r.duzina) >= needM : true, ostatak: needM ? number(r.duzina) - needM : 0 }));
    }, [req, rolne]);

    function saveMaterial() {
        const material = normalizeMaterial(matForm);
        const next = [material, ...materijali.filter((m) => m.id !== material.id)];
        safeWrite(LS_MATERIJALI, next);
        setMaterijali(next);
        setSelectedMatId(material.id);
        msg?.(`Materijal dodat: ${material.komercijalnaOznaka}`);
    }
    function editMaterial(m) { setMatForm({ ...m }); setActiveTab("materijali"); }
    function deleteMaterial(m) {
        if (!confirm(`Obrisati materijal ${m.komercijalnaOznaka}?`)) return;
        const next = materijali.filter((x) => x.id !== m.id);
        safeWrite(LS_MATERIJALI, next);
        setMaterijali(next);
        if (selectedMatId === m.id) setSelectedMatId(next[0]?.id || "");
    }
    function resetDefaultMaterials() {
        if (!confirm("Vratiti početnu bazu materijala? Postojeći materijali ostaju, duplikati se neće dodati.")) return;
        const merged = [...materijali];
        DEFAULT_MATERIALS.map(normalizeMaterial).forEach((m) => {
            if (!merged.some((x) => x.id === m.id || (x.vrsta === m.vrsta && x.komercijalnaOznaka === m.komercijalnaOznaka))) merged.push(m);
        });
        safeWrite(LS_MATERIJALI, merged); setMaterijali(merged);
    }
    async function saveMaterialMaster(material) {
        const payload = {
            vrsta: String(material.vrsta || "").trim(),
            pod_vrsta: String(material.pod_vrsta || "").trim(),
            oznaka: String(material.oznaka || "").trim(),
            proizvodjac: String(material.proizvodjac || "").trim() || null,
            debljina: number(material.debljina),
            koeficijent: number(material.koeficijent),
            gsm: number(material.gsm),
            minimalna_zaliha: number(material.minimalna_zaliha || 0),
            aktivan: true,
        };
        if (!payload.vrsta || !payload.pod_vrsta || !payload.oznaka || !payload.debljina) {
            msg?.("Popuni vrstu, pod vrstu, oznaku i debljinu/gramaturu.", "err");
            return;
        }
        try {
            if (supabase?.__notConfigured) throw new Error("Supabase nije dostupan");
            const { data, error } = await supabase
                .from("material_master")
                .upsert(payload, { onConflict: "vrsta,pod_vrsta,oznaka,debljina" })
                .select("*")
                .limit(1);
            if (error) throw error;
            const saved = data?.[0];
            const cena = number(material.cenaKg || material.cena_kg);
            if (saved?.id && cena > 0) {
                await supabase.from("material_cene").update({ aktivna: false }).eq("material_master_id", saved.id).eq("aktivna", true);
                const { error: priceError } = await supabase.from("material_cene").insert({
                    material_master_id: saved.id,
                    dobavljac: payload.proizvodjac,
                    cena_kg: cena,
                    valuta: "EUR",
                    datum_od: new Date().toISOString().slice(0, 10),
                    aktivna: true,
                });
                if (priceError) console.warn("Cena nije upisana:", priceError);
            }
            await loadMaterialMaster();
            await loadMaterialDropdowns();
            msg?.("Materijal je sačuvan u material_master bazi.");
        } catch (e) {
            console.error(e);
            msg?.("Materijal nije upisan u Supabase: " + (e?.message || e), "err");
        }
    }

    async function deleteMaterialMaster(m) {
        if (!m?.id) return;
        if (!confirm(`Deaktivirati materijal ${materialDisplayName(m)}?`)) return;
        try {
            const { error } = await supabase.from("material_master").update({ aktivan: false }).eq("id", m.id);
            if (error) throw error;
            await loadMaterialMaster();
            msg?.("Materijal je deaktiviran.");
        } catch (e) {
            console.error(e);
            msg?.("Deaktivacija nije uspela: " + (e?.message || e), "err");
        }
    }

    // ===== KAŠIRANO (spoj 2–4 sloja) — koristi iste Material master liste kao ručni unos =====
    const [kasiranoLayers, setKasiranoLayers] = useState([
        { vrsta: "BOPP", pod_vrsta: "Transparent", oznaka: "FXC", debljina: 20 },
        { vrsta: "PE", pod_vrsta: "", oznaka: "", debljina: 50 },
    ]);
    const [kasiranoLepak, setKasiranoLepak] = useState(2.5);

    function kasPodVrste(vrsta) {
        const rows = materialMaster.filter((x) => x.vrsta === vrsta);
        const vals = uniqMaterialValues(rows, "pod_vrsta", []);
        return vals.length ? vals : (materialDropdowns.podVrste || FALLBACK_MATERIAL_DROPDOWNS.podVrste);
    }
    function kasOznake(vrsta, pod) {
        const rows = materialMaster.filter((x) => x.vrsta === vrsta && (!pod || x.pod_vrsta === pod));
        const vals = uniqMaterialValues(rows, "oznaka", []);
        return vals.length ? vals : (materialDropdowns.oznake || FALLBACK_MATERIAL_DROPDOWNS.oznake);
    }
    function kasDebljine(vrsta, pod, oznaka) {
        const rows = materialMaster.filter((x) => x.vrsta === vrsta && (!pod || x.pod_vrsta === pod) && (!oznaka || x.oznaka === oznaka));
        const vals = uniqSorted(rows.map((x) => Number(x.debljina)).filter((x) => Number.isFinite(x)), []);
        return vals.length ? vals : (materialDropdowns.debljine || FALLBACK_MATERIAL_DROPDOWNS.debljine);
    }
    function kasLayerMaster(l) {
        return materialMaster.find((x) => x.vrsta === l.vrsta && x.pod_vrsta === l.pod_vrsta && x.oznaka === l.oznaka && Number(x.debljina) === Number(l.debljina)) || null;
    }
    function kasLayerGsm(l) {
        const m = kasLayerMaster(l);
        const koef = number(m?.koeficijent) || mmKoeficijent(l.vrsta) || 0;
        if (String(l.vrsta).toUpperCase() === "PAPIR") return number(l.debljina);
        return number(m?.gsm) || round2(number(l.debljina) * koef);
    }
    function setKasLayer(i, patch) { setKasiranoLayers((prev) => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l)); }
    function addKasLayer() { setKasiranoLayers((prev) => prev.length >= 4 ? prev : [...prev, { vrsta: masterVrste[0] || "PE", pod_vrsta: "", oznaka: "", debljina: "" }]); }
    function removeKasLayer(i) { setKasiranoLayers((prev) => prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)); }

    const compositeGsm = useMemo(() => {
        const layerSum = kasiranoLayers.reduce((s, l) => s + kasLayerGsm(l), 0);
        const bonds = Math.max(0, kasiranoLayers.length - 1);
        return round2(layerSum + number(kasiranoLepak) * bonds);
    }, [kasiranoLayers, kasiranoLepak, materialMaster]);
    const compositeDebljina = useMemo(() => round2(kasiranoLayers.reduce((s, l) => s + number(l.debljina), 0)), [kasiranoLayers]);
    const compositeName = useMemo(() => kasiranoLayers.map((l) => [l.vrsta, l.oznaka, l.debljina ? (String(l.vrsta).toUpperCase() === "PAPIR" ? `${l.debljina}g` : `${l.debljina}µ`) : ""].filter(Boolean).join(" ")).join(" // "), [kasiranoLayers]);
    const compositeVrste = useMemo(() => kasiranoLayers.map((l) => l.vrsta).filter(Boolean).join(" // "), [kasiranoLayers]);
    const kasiranoKg = useMemo(() => kgFromMeters({ sirinaMm: form.sirina, duzinaM: form.duzina, gsm: compositeGsm }), [form.sirina, form.duzina, compositeGsm]);
    const kasiranoM = useMemo(() => metersFromKg({ sirinaMm: form.sirina, kg: form.kg, gsm: compositeGsm }), [form.sirina, form.kg, compositeGsm]);
    function syncKasirano(next) {
        const merged = { ...form, ...next };
        if (calcMode === "m_to_kg") merged.kg = kgFromMeters({ sirinaMm: merged.sirina, duzinaM: merged.duzina, gsm: compositeGsm });
        else merged.duzina = metersFromKg({ sirinaMm: merged.sirina, kg: merged.kg, gsm: compositeGsm });
        setForm(merged);
    }

    async function lotVecPostoji(lot) {
        const L = String(lot || "").trim();
        if (!L) return false;
        if (rolne.some((r) => isRollVisibleOnStock(r) && String(r.lot || "").trim().toLowerCase() === L.toLowerCase())) return true;
        try {
            if (!supabase?.__notConfigured) {
                const { data } = await supabase.from("magacin").select("id,lot,status").ilike("lot", L).neq("status", "obrisano").limit(1);
                if (data && data.length) return true;
            }
        } catch (e) { /* oslanjamo se na lokalnu proveru */ }
        return false;
    }

    async function brRolneVecPostoji(br) {
        const B = String(br || "").trim();
        if (!B) return false;
        if (rolne.some((r) => String(r.br_rolne || r.qr || "").trim().toLowerCase() === B.toLowerCase())) return true;
        try {
            if (!supabase?.__notConfigured) {
                const { data } = await supabase.from("magacin").select("id").or(`br_rolne.eq.${B},qr_code.eq.${B}`).limit(1);
                if (data && data.length) return true;
            }
        } catch (e) { /* oslanjamo se na lokalnu proveru */ }
        return false;
    }
    async function uniqueBrRolne() {
        let br = makeId("ROLNA");
        for (let i = 0; i < 6 && (await brRolneVecPostoji(br)); i++) br = makeId("ROLNA");
        return br;
    }

    async function addCompositeRoll() {
        if (kasiranoLayers.length < 2) { msg?.("Kaširana rolna mora imati bar 2 sloja", "err"); return; }
        if (kasiranoLayers.some((l) => !String(l.vrsta || "").trim() || !number(l.debljina))) { msg?.("Svaki sloj mora imati vrstu i debljinu/gramaturu", "err"); return; }
        if (!number(form.sirina)) { msg?.("Unesi širinu rolne", "err"); return; }
        const finalKg = calcMode === "m_to_kg" ? kasiranoKg : number(form.kg);
        const finalM = calcMode === "kg_to_m" ? kasiranoM : number(form.duzina);
        if (!finalKg || !finalM) { msg?.("Unesi metre ili kg da sistem izračuna drugo polje", "err"); return; }
        if (await lotVecPostoji(form.lot)) { msg?.(`LOT „${form.lot}" već postoji u magacinu — LOT ne može da se duplira.`, "err"); return; }
        const lokK = String(form.lokacija || "").trim();
        if (lokK && rolne.some((r) => isRollVisibleOnStock(r) && String(r.lokacija || "").trim().toUpperCase() === lokK.toUpperCase())) {
            if (!confirm(`Lokacija ${lokK} je već zauzeta drugom rolnom. Potvrdi da na istu lokaciju ide više rolni?`)) return;
        }
        const brRolne = await uniqueBrRolne();
        const slojeviTxt = kasiranoLayers.map((l, i) => `${i + 1}) Vrsta: ${l.vrsta} | Pod vrsta: ${l.pod_vrsta || "—"} | Oznaka: ${l.oznaka || "—"} | ${l.debljina}${String(l.vrsta).toUpperCase() === "PAPIR" ? "g" : "µ"} = ${fmt(kasLayerGsm(l), 2)} g/m²`).join("  ;  ");
        const napomenaFull = [form.napomena, `SPOJ ${kasiranoLayers.length} sloja — ${slojeviTxt}  ;  lepak ${kasiranoLepak} g/m² × ${kasiranoLayers.length - 1}  ;  UKUPNO ${fmt(compositeGsm, 2)} g/m², ${fmt(compositeDebljina, 2)} µ`].filter(Boolean).join(" — ");
        let item = null;
        try {
            if (!supabase.__notConfigured) {
                const { data, error } = await supabase.from("magacin").insert({
                    br_rolne: brRolne, tip: "SPOJ", vrsta: compositeVrste, pod_vrsta: null,
                    oznaka_materijala: compositeName, deb: compositeDebljina,
                    sirina: number(form.sirina), metraza: finalM, metraza_ost: finalM,
                    kg_bruto: finalKg, kg_neto: finalKg, cena_kg: null, vrednost: null,
                    lot: form.lot || null, dobavljac: null,
                    datum: new Date().toISOString().slice(0, 10), datum_prijema: new Date().toISOString().slice(0, 10),
                    datum_proizvodnje: toIsoDateOrNull(form.datum_proizvodnje), status: "Na stanju",
                    qr_code: brRolne, lokacija: form.lokacija || null, napomena: napomenaFull,
                }).select("*").single();
                if (error) throw error;
                item = mapDbRollToEngine(data);
                await logHistory({ qr: item.qr, event: "ULAZ U MAGACIN (SPOJ)", opis: `${compositeName} · ${fmt(finalM, 0)} m / ${fmt(finalKg, 2)} kg · lokacija ${form.lokacija || "—"}`, stanje: "Na stanju" });
            }
        } catch (e) {
            msg?.("Upis kaširane rolne nije uspeo: " + e.message + " — rolna NIJE sačuvana.", "err");
            return;
        }
        if (!item && supabase.__notConfigured) {
            item = addWarehouseRoll({
                qr: brRolne, vrsta: compositeVrste, oznaka_materijala: compositeName, materijal: compositeVrste,
                komercijalnaOznaka: compositeName, debljina: compositeDebljina, gsm: compositeGsm,
                sirina: form.sirina, duzina: finalM, kg: finalKg,
                lot: form.lot, lokacija: form.lokacija, datum_proizvodnje: form.datum_proizvodnje, napomena: napomenaFull, status: "Na stanju",
            }, "ULAZ U MAGACIN (KAŠIRANO)");
        }
        if (!item) { msg?.("Kaširana rolna nije sačuvana.", "err"); return; }
        if (item) setRolne((prev) => [item, ...prev.filter((r) => r.qr !== item.qr && String(r.id) !== String(item.id))]);
        reload(); setLabelRoll(item); msg?.(`Kaširana rolna ${item.qr} dodata · ${fmt(finalM, 0)} m · ${fmt(finalKg, 2)} kg`);
        setForm((f) => ({ ...f, napomena: "" }));
    }

    async function addRoll() {
        if (!selectedMat) { msg?.("Prvo izaberi materijal preko Material Master-a", "err"); return; }
        if (materialMaster.length > 0 && !selectedMasterMaterial) { msg?.("Izabrana kombinacija nije u bazi materijala. Sačuvaj je prvo dugmetom „Sačuvaj novu kombinaciju u Material master\" iznad (ili u tabu Baza materijala).", "err"); return; }
        if (!number(form.sirina)) { msg?.("Unesi širinu rolne", "err"); return; }
        const existsMat = materijali.some((m) => m.id === selectedMat.id || (m.vrsta === selectedMat.vrsta && m.komercijalnaOznaka === selectedMat.komercijalnaOznaka && Number(m.debljina) === Number(selectedMat.debljina)));
        if (!existsMat) {
            safeWrite(LS_MATERIJALI, [selectedMat, ...materijali]);
            setMaterijali([selectedMat, ...materijali]);
        }
        const finalKg = calcMode === "m_to_kg" ? calculatedKg : number(form.kg);
        const finalM = calcMode === "kg_to_m" ? calculatedM : number(form.duzina);
        if (!finalKg || !finalM) { msg?.("Unesi metre ili kg da sistem izračuna drugo polje", "err"); return; }
        if (await lotVecPostoji(form.lot)) { msg?.(`LOT „${form.lot}" već postoji u magacinu — LOT ne može da se duplira.`, "err"); return; }
        const lok = String(form.lokacija || "").trim();
        if (lok && rolne.some((r) => isRollVisibleOnStock(r) && String(r.lokacija || "").trim().toUpperCase() === lok.toUpperCase())) {
            if (!confirm(`Lokacija ${lok} je već zauzeta drugom rolnom. Potvrdi da na istu lokaciju ide više rolni?`)) return;
        }
        const brRolne = await uniqueBrRolne();
        const cleanCode = cleanOznaka(selectedMat.oznaka || materialPick.oznaka || selectedMat.komercijalnaOznaka, selectedMat.vrsta);
        let item = null;
        try {
            if (!supabase.__notConfigured) {
                const { data, error } = await supabase.from("magacin").insert({
                    br_rolne: brRolne,
                    tip: selectedMat.vrsta,
                    vrsta: selectedMat.vrsta,
                    pod_vrsta: selectedMat.pod_vrsta || materialPick.pod_vrsta || null,
                    oznaka_materijala: cleanCode,
                    deb: selectedMat.debljina,
                    sirina: number(form.sirina),
                    metraza: finalM,
                    metraza_ost: finalM,
                    kg_bruto: finalKg,
                    kg_neto: finalKg,
                    cena_kg: number(selectedMat.cenaKg) || null,
                    vrednost: number(selectedMat.cenaKg) ? round2(finalKg * number(selectedMat.cenaKg)) : null,
                    lot: form.lot || null,
                    dobavljac: materialPick.proizvodjac || selectedMat.proizvodjac || null,
                    datum: new Date().toISOString().slice(0, 10),
                    datum_prijema: new Date().toISOString().slice(0, 10),
                    datum_proizvodnje: toIsoDateOrNull(form.datum_proizvodnje),
                    status: "Na stanju",
                    qr_code: brRolne,
                    lokacija: form.lokacija || null,
                    napomena: form.napomena || null,
                }).select("*").single();
                if (error) throw error;
                item = mapDbRollToEngine(data);
                await logHistory({ qr: item.qr, event: "ULAZ U MAGACIN", opis: `${materialDisplayName({ vrsta: selectedMat.vrsta, pod_vrsta: selectedMat.pod_vrsta || materialPick.pod_vrsta, oznaka: cleanCode, debljina: selectedMat.debljina })} · ${fmt(finalM, 0)} m / ${fmt(finalKg, 2)} kg · lokacija ${form.lokacija || "—"}`, stanje: "Na stanju" });
            }
        } catch (e) {
            msg?.("Upis rolne nije uspeo: " + e.message + " — rolna NIJE sačuvana.", "err");
            return;
        }
        if (!item && supabase.__notConfigured) {
            item = addWarehouseRoll({
                qr: brRolne, materijal_id: selectedMat.id, vrsta: selectedMat.vrsta, pod_vrsta: selectedMat.pod_vrsta || materialPick.pod_vrsta,
                oznaka_materijala: cleanCode, materijal: selectedMat.vrsta,
                komercijalnaOznaka: cleanCode, proizvodjac: selectedMat.proizvodjac, debljina: selectedMat.debljina,
                koeficijent: selectedMat.koeficijent, gsm: calcGsm(selectedMat), cenaKg: selectedMat.cenaKg, vrednost: number(selectedMat.cenaKg) ? round2(finalKg * number(selectedMat.cenaKg)) : 0, sirina: form.sirina, duzina: finalM, kg: finalKg,
                lot: form.lot, lokacija: form.lokacija, datum_proizvodnje: form.datum_proizvodnje, napomena: form.napomena, status: "Na stanju",
            }, "ULAZ U MAGACIN");
        }
        if (!item) { msg?.("Rolna nije sačuvana.", "err"); return; }
        if (item) setRolne((prev) => [item, ...prev.filter((r) => r.qr !== item.qr && String(r.id) !== String(item.id))]);
        reload(); setLabelRoll(item); msg?.(`Rolna ${item.qr} dodata · ${fmt(finalM, 0)} m · ${fmt(finalKg, 2)} kg`);
        setForm((f) => ({ ...f, napomena: "" }));
    }

    async function dodajCrevo() {
        const { k, meters, razvijena, kg, cenaKg, vrednost } = crevoCalc;
        if (!crevoForm.vrsta) { msg?.("Izaberi vrstu materijala", "err"); return; }
        if (!number(crevoForm.sirina)) { msg?.("Unesi spljoštenu širinu", "err"); return; }
        if (!meters || meters <= 0) { msg?.("Unesi ispravan spoljni prečnik (veći od hilzne) i debljinu", "err"); return; }
        const oblikLabel = crevoForm.oblik === "ravna" ? "Ravna folija" : (crevoForm.oblik === "custom" ? `Custom ×${k}` : "Polu-crevo / crevo");
        // napomena = ISKLJUČIVO korisnikov tekst; crevo se beleži skrivenim markerom (badge ga čita, prikaz ga skida)
        const marker = crevoForm.oblik === "ravna" ? "" : `⟨CREVO×${k}⟩`;
        const napomena = [(crevoForm.napomena || "").trim(), marker].filter(Boolean).join(" ") || null;
        const brRolne = await uniqueBrRolne();
        const cleanCode = cleanOznaka(crevoForm.oznaka, crevoForm.vrsta);
        let item = null;
        try {
            if (!supabase.__notConfigured) {
                const { data, error } = await supabase.from("magacin").insert({
                    br_rolne: brRolne, tip: crevoForm.vrsta, vrsta: crevoForm.vrsta,
                    oznaka_materijala: cleanCode, pod_vrsta: crevoForm.pod_vrsta || null, deb: number(crevoForm.debljina),
                    sirina: number(crevoForm.sirina), metraza: meters, metraza_ost: meters,
                    kg_bruto: kg, kg_neto: kg, lot: crevoForm.lot || null,
                    dobavljac: crevoForm.dobavljac || null, cena_kg: cenaKg || null, vrednost: vrednost || null,
                    datum: new Date().toISOString().slice(0, 10), datum_prijema: new Date().toISOString().slice(0, 10),
                    datum_proizvodnje: toIsoDateOrNull(crevoForm.datum_proizvodnje),
                    status: "Na stanju", qr_code: brRolne, lokacija: crevoForm.lokacija || null, napomena,
                }).select("*").single();
                if (error) throw error;
                item = mapDbRollToEngine(data);
                await logHistory({ qr: item.qr, event: "ULAZ U MAGACIN (CREVO/PREČNIK)", opis: `${crevoForm.vrsta} ${cleanCode} ${number(crevoForm.debljina)}µ · ${oblikLabel} ×${k} · ${fmt(meters, 0)} m / ${fmt(kg, 2)} kg · prečnik ${number(crevoForm.precnik)} mm${cenaKg ? " · " + fmt(cenaKg, 2) + " €/kg = " + fmt(vrednost, 2) + " €" : ""} · ${crevoForm.dobavljac || "—"} · lokacija ${crevoForm.lokacija || "—"}`, stanje: "Na stanju" });
            }
        } catch (e) { msg?.("Upis nije uspeo: " + e.message, "err"); return; }
        if (!item) { msg?.("Rolna nije sačuvana.", "err"); return; }
        setRolne((prev) => [item, ...prev.filter((r) => r.qr !== item.qr && String(r.id) !== String(item.id))]);
        reload(); setLabelRoll(item); msg?.(`Polu-rolna/crevo ${item.qr} dodata · ${fmt(meters, 0)} m · ${fmt(kg, 2)} kg`);
        setCrevoForm((f) => ({ ...f, precnik: "", lot: "", napomena: "" }));
    }
    async function changeStatus(r, status) {
        const normalizedStatus = toDbStatus(status);
        const updated = { ...r, status: normalizedStatus, datum_poslednje_promene: now() };
        try {
            if (!supabase?.__notConfigured && r.id) {
                const { error } = await supabase.from("magacin").update({ status: normalizedStatus, updated_at: new Date().toISOString() }).eq("id", r.id);
                if (error) throw error;
            }
        } catch (e) {
            console.error(e);
            msg?.("Promena statusa nije upisana u Supabase: " + (e?.message || e), "err");
        }
        setRolne((prev) => prev.map((x) => String(x.id) === String(r.id) || x.qr === r.qr ? updated : x));
        await logHistory({ qr: r.qr, event: "PROMENA STATUSA", opis: `${r.status} → ${normalizedStatus}`, stanje: normalizedStatus });
        msg?.(`Status rolne ${r.qr}: ${normalizedStatus}`);
        await reload();
    }
    async function reserveForMaster(r) {
        if (!canReserve) { msg?.("Nemate dozvolu za rezervaciju rolni (mogu admin, menadžer ili magacioner).", "err"); return; }
        const free = rolnaSlobodnoM(r);
        setRezForm({ roll: r, ref: r.dodeljeno_nalogu || "", metri: String(Math.round(free || rolnaUkupnoM(r))), napomena: napomenaText(r) || "" });
    }

    async function potvrdiRucnuRez() {
        const f = rezForm; if (!f || !f.roll) return;
        const r = f.roll;
        const total = rolnaUkupnoM(r);
        const free = rolnaSlobodnoM(r);
        const m = Math.round(Math.max(0, number(f.metri)));
        if (m <= 0) { msg?.("Unesi metre za rezervaciju", "err"); return; }
        if (m > free) { msg?.(`Slobodno je samo ${fmt(free, 0)} m na ovoj rolni.`, "err"); return; }
        const ref = String(f.ref || "").trim();
        const rezPre = rolnaRezM(r);
        const noviRez = Math.round(rezPre + m);
        const punoRez = total > 0 && noviRez >= total - 1;
        // dodeljeno_nalogu: dodaj ref bez dupliranja
        let dod = ref;
        const prethodno = String(r.dodeljeno_nalogu || "").trim();
        if (prethodno && ref && !prethodno.split(",").map(s => s.trim()).includes(ref)) dod = prethodno + ", " + ref;
        else if (prethodno && !ref) dod = prethodno;
        try {
            if (!supabase?.__notConfigured && r.id) {
                const { error } = await supabase.from("magacin").update({
                    status: punoRez ? "Rezervisano" : "Delimično rezervisano",
                    dodeljeno_nalogu: dod || null,
                    rezervisano: noviRez || null,
                    napomena: f.napomena || r.napomena || null,
                    rezervisao: reserverName || null,
                    updated_at: new Date().toISOString(),
                }).eq("id", r.id);
                if (error) throw error;
                // ledger stavka (analize)
                const kgPoM = total > 0 ? (number(r.kg_neto || r.kg) || 0) / total : 0;
                try {
                    await supabase.from("materijal_stavke").insert({
                        nalog_ref: ref || "RUČNO", rolna_id: r.id, br_rolne: r.br_rolne || r.qr,
                        vrsta: r.vrsta || null, pod_vrsta: r.pod_vrsta || null, oznaka: rollOznaka(r) || null,
                        debljina: number(r.deb) || null, dobavljac: r.dobavljac || null, sirina: number(r.sirina) || null,
                        alocirano_m: m, kg_po_m: kgPoM, kg_alocirano: Math.round(kgPoM * m * 100) / 100, status: "rezervisano",
                    });
                } catch (e) { console.warn("stavka:", e.message); }
                await logHistory({ qr: r.qr, event: "RUČNA REZERVACIJA", opis: `Rezervisano ${fmt(m, 0)} m za ${ref || "—"} · ukupno rez. ${fmt(noviRez, 0)} / ${fmt(total, 0)}`, stanje: punoRez ? "Rezervisano" : "Delimično rezervisano" });
            }
        } catch (e) { msg?.("Rezervacija nije upisana: " + (e?.message || e), "err"); return; }
        setRezForm(null);
        msg?.(`Rezervisano ${fmt(m, 0)} m${ref ? " za " + ref : ""} (rolna ${r.qr}).`);
        await reload();
    }

    function oslobodiRez(r) {
        if (!canReserve) { msg?.("Nemate dozvolu.", "err"); return; }
        const total = rolnaUkupnoM(r);
        let rez = rolnaRezM(r);
        if (rez === 0 && normalizeStatus(r.status) === "rezervisana") rez = total;
        if (rez <= 0) { msg?.("Rolna nema rezervaciju.", "err"); return; }
        setOslForm({ roll: r, metri: String(Math.round(rez)), rezSada: rez });
    }

    async function potvrdiOslobodi() {
        const f = oslForm; if (!f || !f.roll) return;
        const r = f.roll;
        const total = rolnaUkupnoM(r);
        const rezSada = f.rezSada;
        const m = Math.round(Math.max(0, number(f.metri)));
        if (m <= 0) { msg?.("Unesi metre za oslobađanje", "err"); return; }
        const osl = Math.min(m, rezSada);
        const noviRez = Math.max(0, Math.round(rezSada - osl));
        const punoSlobodno = noviRez <= 0;
        try {
            if (!supabase?.__notConfigured && r.id) {
                const { error } = await supabase.from("magacin").update({
                    status: punoSlobodno ? "Na stanju" : "Delimično rezervisano",
                    rezervisano: noviRez || null,
                    dodeljeno_nalogu: punoSlobodno ? null : (r.dodeljeno_nalogu || null),
                    updated_at: new Date().toISOString(),
                }).eq("id", r.id);
                if (error) throw error;
                // ledger: smanji/otkaži otvorene stavke za ovu rolnu (najstarije prvo)
                try {
                    const { data: st } = await supabase.from("materijal_stavke").select("*").eq("rolna_id", r.id).eq("status", "rezervisano").order("created_at", { ascending: true });
                    let preostaje = osl;
                    for (const s of (st || [])) {
                        if (preostaje <= 0) break;
                        const a = number(s.alocirano_m);
                        const skini = Math.min(a, preostaje);
                        const noviA = Math.max(0, a - skini);
                        await supabase.from("materijal_stavke").update({ alocirano_m: noviA, status: noviA <= 0 ? "otkazano" : "rezervisano" }).eq("id", s.id);
                        preostaje -= skini;
                    }
                } catch (e) { console.warn("oslobodi stavke:", e.message); }
                await logHistory({ qr: r.qr, event: "OSLOBOĐENA REZERVACIJA", opis: `Oslobođeno ${fmt(osl, 0)} m · preostalo rez. ${fmt(noviRez, 0)} / ${fmt(total, 0)}`, stanje: punoSlobodno ? "Na stanju" : "Delimično rezervisano" });
            }
        } catch (e) { msg?.("Oslobađanje nije upisano: " + (e?.message || e), "err"); return; }
        setOslForm(null);
        msg?.(`Oslobođeno ${fmt(osl, 0)} m (rolna ${r.qr}).`);
        await reload();
    }

    function povratRolne(r) {
        // Otvori postojeći „Povrat u magacin" tok sa učitanom rolnom (Faza 3 je već u confirmReturnToWarehouse).
        setPovratRoll(r);
        setPovratQr(r.qr || r.br_rolne || r.qr_code || "");
        setPovratForm((f) => ({ ...f, spoljasnjiPrecnik: "", hilzna: r.hilzna || "FI76", lokacija: r.lokacija || "Magacin", napomena: "Povrat u magacin" }));
        setActiveTab("povrat");
    }

    async function consumeRoll(r) {
        const currentM = number(r.metraza_ost ?? r.duzina ?? r.metraza ?? 0);
        const used = prompt("Koliko metara se troši? Prazno = cela rolna", String(currentM || ""));
        if (used === null) return;
        const usedM = used === "" ? currentM : number(used);
        if (usedM <= 0) { msg?.("Unesi ispravnu metražu za skidanje", "err"); return; }

        try {
            if (!supabase?.__notConfigured && r.id) {
                const { error } = await supabase.rpc("skini_metre_rolne", {
                    p_rolna_id: Number(r.id),
                    p_skinuto: usedM,
                });
                if (error) throw error;

                const fresh = await fetchRollFromSupabaseByQr(r.qr || r.br_rolne || r.qr_code);
                if (fresh) {
                    setRolne((prev) => prev.map((x) => String(x.id) === String(fresh.id) || x.qr === fresh.qr ? fresh : x));
                    await logHistory({ qr: fresh.qr, event: "POTROŠNJA", opis: `Skinuto ${fmt(usedM, 0)} m, ostalo ${fmt(fresh.duzina, 0)} m`, stanje: fresh.status });
                    msg?.(`Skinuto ${fmt(usedM, 0)} m. Novo stanje: ${fmt(fresh.duzina, 0)} m.`);
                } else {
                    msg?.(`Skinuto ${fmt(usedM, 0)} m. Osvežavam stanje iz baze.`);
                }
                await reload();
                return;
            }
        } catch (e) {
            console.error(e);
            msg?.("Skidanje metraže nije upisano u Supabase: " + (e?.message || e), "err");
        }

        // Lokalni fallback samo ako Supabase nije dostupan.
        const remainM = Math.max(0, currentM - usedM);
        const remainKg = kgFromMeters({ sirinaMm: r.sirina, duzinaM: remainM, gsm: r.gsm });
        const status = remainM > 0 ? toDbStatus(r.status) : "Iskorišćeno";
        const updated = { ...r, duzina: remainM, metraza: remainM, metraza_ost: remainM, kg: remainKg, kg_neto: remainKg, status, datum_poslednje_promene: now() };
        setRolne((prev) => prev.map((x) => String(x.id) === String(r.id) || x.qr === r.qr ? updated : x));
        await logHistory({ qr: r.qr, event: "POTROŠNJA", opis: `Skinuto ${fmt(usedM, 0)} m, ostalo ${fmt(remainM, 0)} m`, stanje: status });
        msg?.(`Skinuto ${fmt(usedM, 0)} m. Novo stanje: ${fmt(remainM, 0)} m.`);
    }
    function createReservationRequest() { safeWrite(LS_PENDING_RESERVATION, req); msg?.("Zahtev za izbor rolni je sačuvan. Kasnije ga povezujemo direktno sa master nalogom."); }

    function coreEffectiveDiameter(hilzna) {
        return hilzna === "FI152" ? 180 : 100;
    }

    function estimateMetersFromDiameter(roll, outerDiameterMm, hilzna) {
        const D = number(outerDiameterMm);
        const d = coreEffectiveDiameter(hilzna);
        const thicknessMm = Math.max(number(roll?.debljina || roll?.deb || 0) / 1000, 0.001);
        if (!D || D <= d) return 0;
        return Math.max(0, Math.round((Math.PI * (D * D - d * d)) / (4 * thicknessMm) / 1000));
    }

    function estimateKgForMeters(roll, meters) {
        const sirina = number(roll?.sirina || 0);
        const gsm = number(roll?.gsm || (number(roll?.debljina || roll?.deb || 0) * 0.91));
        if (!sirina || !meters || !gsm) return number(roll?.kg || roll?.kg_neto || 0);
        return Math.round((sirina * meters * gsm / 1000000) * 100) / 100;
    }

    async function findPovratRoll() {
        const q = String(povratQr || "").trim();
        if (!q) { msg?.("Skeniraj ili unesi QR broj rolne", "err"); return; }
        const found = await resolveRollByQr(q);
        if (!found) { msg?.("Rolna nije pronađena u magacinu", "err"); return; }
        setPovratRoll(found);
        setPovratForm((f) => ({ ...f, lokacija: found.lokacija || "Magacin" }));
        await logHistory({ qr: found.qr || q, event: "QR SKEN / POVRAT", opis: `Pronađena rolna za povrat · lokacija ${found.lokacija || "—"} · stanje ${displayStatus(found.status)}`, stanje: found.status });
    }

    async function confirmReturnToWarehouse(formOverride = null) {
        const effectiveForm = formOverride || povratForm;
        if (!povratRoll) { msg?.("Prvo pronađi rolnu", "err"); return; }
        const meters = estimateMetersFromDiameter(povratRoll, effectiveForm.spoljasnjiPrecnik, effectiveForm.hilzna);
        if (!meters || meters <= 0) { msg?.("Unesi ispravan spoljašnji prečnik veći od hilzne", "err"); return; }
        const kg = estimateKgForMeters(povratRoll, meters);
        const novaLokacija = String(effectiveForm?.lokacija || povratForm?.lokacija || povratRoll.lokacija || "Magacin").trim();
        const napomena = effectiveForm.napomena || povratForm.napomena || "Povrat u magacin";

        try {
            const updated = await persistRollState(povratRoll, {
                meters,
                kg,
                location: novaLokacija,
                status: "Na stanju",
                napomena,
            });

            await logHistory({
                qr: updated.qr,
                event: "POVRAT U MAGACIN",
                opis: `Hilzna ${effectiveForm.hilzna} (${coreEffectiveDiameter(effectiveForm.hilzna)} mm), spoljašnji prečnik ${effectiveForm.spoljasnjiPrecnik} mm, obračunato ${fmt(meters, 0)} m / ${fmt(kg, 2)} kg, lokacija ${novaLokacija}`,
                stanje: "Na stanju"
            });
            // Trajan log povrata (ne briše ga reload iz baze) — za karticu „Istorija povrata"
            try {
                const povRec = {
                    vreme: now(),
                    operater: operater?.ime || _operaterIme || "—",
                    qr: updated.qr,
                    event: "POVRAT U MAGACIN",
                    opis: `Ø ${effectiveForm.spoljasnjiPrecnik} mm / ${effectiveForm.hilzna} → ${fmt(meters, 0)} m · ${fmt(kg, 2)} kg · ${novaLokacija}`,
                    metri: Math.round(meters),
                    kg: Math.round(kg * 100) / 100,
                    lokacija: novaLokacija,
                };
                setPovratLog((prev) => {
                    const arr = [povRec, ...(Array.isArray(prev) ? prev : [])].slice(0, 1000);
                    safeWrite(LS_POVRAT, arr);
                    return arr;
                });
            } catch (e) { console.warn("povratLog:", e?.message); }
            // Upis u BAZU — deljeno na svim uređajima + ko je uradio
            try {
                if (supabase && !supabase.__notConfigured) {
                    await supabase.from("povrati_magacin").insert({
                        rolna_id: povratRoll?.id || null,
                        br_rolne: updated.qr || updated.br_rolne || null,
                        qr: updated.qr || null,
                        metri: Math.round(meters),
                        kg: Math.round(kg * 100) / 100,
                        precnik: number(effectiveForm.spoljasnjiPrecnik) || null,
                        hilzna: effectiveForm.hilzna || null,
                        lokacija: novaLokacija || null,
                        nalog_ref: povratRoll?.dodeljeno_nalogu || null,
                        operater: reserverName || operater?.ime || _operaterIme || "—",
                        operater_id: userProfile?.id || null,
                        opis: `Ø ${effectiveForm.spoljasnjiPrecnik} mm / ${effectiveForm.hilzna} → ${fmt(meters, 0)} m · ${fmt(kg, 2)} kg · ${novaLokacija}`,
                    });
                    await loadPovrati();
                }
            } catch (e) { console.warn("povrati_magacin insert:", e?.message); }
            setPovratRoll(updated);
            setPovratForm((f) => ({ ...f, lokacija: novaLokacija }));
            setLabelRoll(updated);
            // FAZA 3: poveži povrat sa nalogom — upiši vraceno_m i izračunaj otpad u ledgeru
            try {
                if (povratRoll.id && supabase && !supabase.__notConfigured) {
                    const { data: st } = await supabase.from("materijal_stavke").select("*").eq("rolna_id", povratRoll.id).eq("status", "izdato").order("created_at", { ascending: false }).limit(1);
                    const s = (st || [])[0];
                    if (s) {
                        const izdato = number(s.izdato_m), aloc = number(s.alocirano_m);
                        const utroseno = Math.max(0, izdato - meters);   // stvarni utrošak = izdato − vraćeno
                        const otpad = Math.round(aloc - utroseno);        // plan − utrošak
                        await supabase.from("materijal_stavke").update({ vraceno_m: Math.round(meters), otpad_m: otpad, status: "zatvoreno" }).eq("id", s.id);
                    }
                }
            } catch (e) { console.warn("povrat→stavka:", e.message); }
            msg?.(`Povrat evidentiran: ${updated.qr} · ${fmt(updated.duzina, 0)} m · ${fmt(updated.kg, 2)} kg · ${updated.lokacija || novaLokacija}`);
        } catch (e) {
            console.error(e);
            msg?.("Povrat nije upisan u Supabase: " + (e?.message || e), "err");
        }
    }

    function triggerDownload(filename, content, mime) {
        try {
            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            return true;
        } catch (e) {
            msg?.("Preuzimanje nije uspelo: " + e.message, "err");
            return false;
        }
    }

    function downloadBackup() {
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        const payload = {
            app: "Magacin Materijala i Rolni PRO",
            version: 1,
            savedAt: new Date().toISOString(),
            counts: { rolne: rolne.length, materijali: materialMaster.length, istorija: (history || []).length },
            rolne,
            materialMaster,
            materialPrices,
            history: (history || []).slice(0, 2000),
        };
        if (triggerDownload(`magacin-backup-${stamp}.json`, JSON.stringify(payload, null, 2), "application/json")) {
            msg?.(`Backup napravljen: ${rolne.length} rolni, ${materialMaster.length} materijala (preuzeto kao JSON)`);
        }
    }

    function exportStockCsv() {
        const stamp = new Date().toISOString().slice(0, 10);
        const headers = ["QR", "Tip", "Vrsta", "Pod vrsta", "Oznaka", "Proizvodjac", "Debljina", "Sirina_mm", "Metara", "Kg", "Lot", "Lokacija", "Status", "Datum proizvodnje", "Napomena"];
        const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = [headers.join(";")];
        rolne.forEach((r) => {
            lines.push([r.qr, r.tip || "", r.vrsta, r.pod_vrsta || "", r.komercijalnaOznaka || r.oznaka_materijala || rollOznaka(r), r.proizvodjac || "", r.debljina || r.deb || "", r.sirina || "", r.duzina || "", r.kg || "", r.lot || "", r.lokacija || "", r.status || "", r.datum_proizvodnje || "", (r.napomena || "").replace(/\r?\n/g, " ")].map(esc).join(";"));
        });
        const csv = "\uFEFF" + lines.join("\r\n"); // BOM za Excel ćirilicu/latinicu
        if (triggerDownload(`stanje-rolni-${stamp}.csv`, csv, "text/csv;charset=utf-8")) {
            msg?.(`CSV stanja napravljen: ${rolne.length} rolni`);
        }
    }

    // ADMIN: brisanje rolni — dozvoljeno samo za rolne SA STANJA ("Na stanju").
    async function deleteRoll(r) {
        if (!adminMode) { msg?.("Brisanje je dostupno samo u admin režimu.", "err"); return; }
        if (normalizeStatus(r.status) !== "dostupna") { msg?.("Brisati se mogu samo rolne sa stanja (Na stanju).", "err"); return; }
        if (!confirm(`Obrisati rolnu ${r.qr} sa stanja? Rolna se uklanja iz magacina (zadržava se trag zbog MES/popisa).`)) return;
        try {
            if (!supabase.__notConfigured && r.id != null) {
                const { error } = await supabase.from("magacin").update({ status: "obrisano", updated_at: new Date().toISOString() }).eq("id", r.id);
                if (error) throw error;
            }
        } catch (e) { msg?.("Brisanje u Supabase nije uspelo: " + e.message, "err"); return; }
        setRolne((prev) => prev.filter((x) => !(String(x.id) === String(r.id) || x.qr === r.qr)));
        setSelectedRolls((prev) => prev.filter((q) => q !== r.qr));
        await logHistory({ qr: r.qr, event: "BRISANJE ROLNE", opis: `Uklonjena sa stanja: ${r.vrsta || ""} ${r.oznaka_materijala || r.oznaka || ""} · ${fmt(number(r.metraza_ost ?? r.duzina), 0)} m / ${fmt(number(r.kg_neto ?? r.kg), 2)} kg · lokacija ${r.lokacija || "—"}`, stanje: "obrisano" });
        msg?.(`Rolna ${r.qr} obrisana sa stanja.`);
        if (!supabase.__notConfigured) reload();
    }

    async function deleteAllStockRolls() {
        if (!adminMode) { msg?.("Brisanje je dostupno samo u admin režimu.", "err"); return; }
        const onStock = rolne.filter((r) => normalizeStatus(r.status) === "dostupna");
        if (!onStock.length) { msg?.("Nema rolni sa stanja za brisanje.", "err"); return; }
        if (!confirm(`Obrisati SVE rolne sa stanja (${onStock.length})? Rezervisane i iskorišćene se NE diraju.`)) return;
        if (!confirm(`Poslednja potvrda: uklanjanje ${onStock.length} rolni sa stanja. Sigurno?`)) return;
        let okCount = onStock.length;
        try {
            if (!supabase.__notConfigured) {
                const ids = onStock.map((r) => r.id).filter((x) => x != null);
                if (ids.length) {
                    const { error } = await supabase.from("magacin").update({ status: "obrisano", updated_at: new Date().toISOString() }).in("id", ids);
                    if (error) throw error;
                }
                okCount = ids.length;
            }
        } catch (e) { msg?.("Grupno brisanje nije uspelo: " + e.message, "err"); return; }
        const qrs = new Set(onStock.map((r) => r.qr));
        for (const r of onStock) { await logHistory({ qr: r.qr, event: "BRISANJE ROLNE", opis: `Grupno uklanjanje sa stanja: ${r.vrsta || ""} ${r.oznaka_materijala || r.oznaka || ""} · ${fmt(number(r.kg_neto ?? r.kg), 2)} kg`, stanje: "obrisano" }); }
        setRolne((prev) => prev.filter((r) => !qrs.has(r.qr)));
        setSelectedRolls((prev) => prev.filter((q) => !qrs.has(q)));
        msg?.(`Obrisano ${okCount} rolni sa stanja.`);
        if (!supabase.__notConfigured) reload();
    }

    async function loginOperater(email, sifra) {
        const em = String(email).trim().toLowerCase();
        if (supabase?.__notConfigured) { msg?.("Supabase nije povezan.", "err"); return false; }
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email: em, password: String(sifra) });
            if (error || !data?.user) { msg?.("Pogrešan email ili šifra.", "err"); return false; }
            const op = { ime: imeFromEmail(em), email: em };
            setOperater(op); safeWrite(LS_OPERATER, op); setLoginForm({ email: "", sifra: "" });
            msg?.(`Prijavljen: ${op.ime}`);
            return true;
        } catch (e) {
            msg?.("Prijava nije uspela: " + (e?.message || e), "err");
            return false;
        }
    }
    async function logoutOperater() {
        try { if (!supabase?.__notConfigured) await supabase.auth.signOut(); } catch (e) { /* noop */ }
        setOperater(null); safeWrite(LS_OPERATER, null);
    }
    useEffect(() => { _operaterIme = operater?.ime || "—"; }, [operater]);
    // Obnova sesije pri otvaranju: ako je magacioner već ulogovan u Supabase Auth, ostaje prijavljen.
    useEffect(() => {
        if (supabase?.__notConfigured) return;
        let active = true;
        (async () => {
            try {
                const { data } = await supabase.auth.getSession();
                if (!active) return;
                const email = data?.session?.user?.email;
                if (email) { const op = { ime: imeFromEmail(email), email: String(email).toLowerCase() }; setOperater(op); safeWrite(LS_OPERATER, op); }
                else { setOperater(null); safeWrite(LS_OPERATER, null); }
            } catch (e) { /* noop */ }
        })();
        return () => { active = false; };
    }, []);

    // Centralni upis istorije: jedan ulaz za SVE akcije (desktop + telefon).
    // Upis je optimistički u UI, zatim obavezno pokušava Supabase i osvežava istoriju.
    // Na telefonu se ne oslanjamo samo na realtime, jer browser često uspava tab/kameru.
    async function logHistory({ qr, event, opis, stanje, meta = {} }) {
        const cleanQr = String(qr || "").trim();
        const entry = {
            vreme: now(),
            operater: operater?.ime || _operaterIme || "—",
            qr: cleanQr,
            event: event || "AKCIJA",
            opis: opis || "",
            stanje: stanje || "",
            meta,
        };
        setHistory((prev) => {
            const h = [entry, ...(Array.isArray(prev) ? prev : [])].slice(0, HISTORY_SYNC_LIMIT);
            safeWrite(LS_HISTORY, h);
            return h;
        });

        try {
            // NE upisujemo u magacin_istorija iz aplikacije — DB trigger (log_magacin_promene)
            // već beleži svaku promenu rolne (sa user_id, br_rolne, materijalom). App-upis bi pravio duplikate.
            // Zadržavamo samo osvežavanje iz baze da se trigger-ov zapis odmah prikaže (bitno za telefon).
            if (!supabase?.__notConfigured) {
                await reloadRef.current?.();
            }
        } catch (e) {
            console.warn("Osvežavanje istorije nije uspelo:", e?.message || e);
        }
    }

    async function resetWarehouseTestData() {
        const first = confirm("RESET MAGACINA briše test rolne i zavisne zapise iz magacina. Pre brisanja pravi backup snapshot. Nastaviti?");
        if (!first) return;
        const second = confirm("Potvrdi još jednom: obrisati test podatke iz magacina?");
        if (!second) return;
        try {
            const tableNames = ["magacin", "formatirane_role", "rezervacije_rolni", "magacin_istorija", "istorija_lokacija_rolni", "plan_rezanja_stavke"];
            const backup = {};
            for (const table of tableNames) {
                try {
                    const { data, error } = await supabase.from(table).select("*");
                    if (!error) backup[table] = data || [];
                } catch { }
            }
            try {
                await supabase.from("magacin_backup_snapshots").insert({
                    snapshot_type: "manual_pre_reset_magacin",
                    data: backup,
                    created_by: "admin",
                });
            } catch (backupErr) {
                console.warn("Backup snapshot nije upisan:", backupErr);
            }
            const deleteOrder = ["istorija_lokacija_rolni", "formatirane_role", "rezervacije_rolni", "rolne_rezervacije", "plan_rezanja_stavke", "magacin_istorija", "istorija_rolne", "magacin_promene", "magacin"];
            for (const table of deleteOrder) {
                try {
                    const { error } = await supabase.from(table).delete().not("id", "is", null);
                    if (error && !String(error.message || "").includes("does not exist")) throw error;
                } catch (e) {
                    console.warn(`Brisanje tabele ${table} nije uspelo ili tabela ne postoji:`, e);
                    if (table === "magacin") throw e;
                }
            }
            safeWrite(LS_ROLNE, []);
            setRolne([]);
            setHistory([]);
            setSelectedRolls([]);
            msg?.("Reset test podataka magacina je završen. Backup snapshot je napravljen ako tabela postoji.");
            await reload();
        } catch (e) {
            console.error(e);
            msg?.("Reset magacina nije uspeo: " + (e?.message || e), "err");
        }
    }

    function toggleSelected(qr) { setSelectedRolls((prev) => prev.includes(qr) ? prev.filter((x) => x !== qr) : [...prev, qr]); }
    function selectAllFiltered() { setSelectedRolls((prev) => Array.from(new Set([...prev, ...filteredRolls.map((r) => r.qr)]))); }
    function clearSelection() { setSelectedRolls([]); }
    function openBulkLabels() {
        const selected = rolne.filter((r) => selectedRolls.includes(r.qr));
        if (selected.length === 0) { msg?.("Izaberi bar jednu rolnu za štampu etiketa", "err"); return; }
        setBulkLabels(selected);
    }
    function printLabels() {
        const root = document.querySelector(".roll-label-print-root");
        const labels = root ? Array.from(root.querySelectorAll(".roll-label-print")).map((el) => el.outerHTML).join("\n") : "";
        if (!labels) { window.print(); return; }
        const printWindow = window.open("", "_blank", "width=520,height=720");
        if (!printWindow) { window.print(); return; }
        printWindow.document.open();
        printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>QR etikete rolni</title>
  <style>
    @page { size: 100mm 140mm; margin: 0; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100mm !important;
      background: #fff !important;
      font-family: Arial, sans-serif;
    }
    * { box-sizing: border-box !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .roll-label-print {
      width: 100mm !important;
      height: 140mm !important;
      margin: 0 !important;
      padding: 5mm !important;
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      overflow: hidden !important;
      page-break-after: always !important;
      break-after: page !important;
      background: #fff !important;
    }
    .roll-label-print:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    @media screen {
      body { padding: 10px !important; background: #e5e7eb !important; }
      .roll-label-print { outline: 1px solid #111827; margin-bottom: 12px !important; }
    }
  </style>
</head>
<body>${labels}</body>
</html>`);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            setTimeout(() => printWindow.close(), 400);
        }, 400);
    }
    function setColFilter(key, value) { setColumnFilters((p) => ({ ...p, [key]: value })); }


    async function handlePackingFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const name = file.name.toLowerCase();
        try {
            if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
                const XLSX = await import("xlsx");
                const buf = await file.arrayBuffer();
                const wb = XLSX.read(buf, { type: "array" });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
                const rows = json.map(normalizePackingRow).filter((r) => r.vrsta || r.komercijalnaOznaka || r.sirina || r.duzina || r.kg);
                setPackingRows(rows);
                msg?.(`Učitano ${rows.length} redova iz Excel packing liste.`);
            } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
                const text = await file.text();
                setPackingText(text);
                const rows = parseUniversalPackingText(text);
                setPackingRows(rows);
                msg?.(`Učitano ${rows.length} redova iz tekstualne packing liste.`);
            } else if (name.endsWith(".pdf")) {
                let text = await extractPdfTextFromFile(file);
                let rows = parseUniversalPackingText(text);
                // Ako PDF nema čitljiv tekstualni sloj (kockice) ili ništa nije prepoznato -> automatski OCR
                const citljivih = (String(text).match(/[A-Za-z0-9]/g) || []).length;
                if (rows.length === 0 || citljivih < 30) {
                    msg?.("PDF nema čitljiv tekst — pokrećem OCR (čitanje sa slike)…");
                    const ocrText = await extractPdfTextViaOCR(file, (p) => msg?.(`OCR u toku: ${p}%`));
                    const ocrRows = parseUniversalPackingText(ocrText);
                    if (ocrRows.length) { text = ocrText; rows = ocrRows; }
                    else { text = ocrText || text; } // bar prikaži OCR tekst za ručnu ispravku/lepljenje
                }
                setPackingText(text);
                setPackingRows(rows);
                if (rows.length) {
                    msg?.(`PDF pročitan: ${rows.length} rolni prepoznato.`);
                } else {
                    msg?.("PDF pročitan, ali nijedna rolna nije prepoznata. Proveri/ispravi tekst ispod pa klikni „Prepoznaj iz teksta\".", "err");
                }
            } else {
                msg?.("Podržano: Excel .xlsx/.xls, CSV/TXT. Za PDF nalepi tekst ili koristi OCR workflow.", "err");
            }
        } catch (err) {
            msg?.(`Greška kod uvoza packing liste: ${err.message}`, "err");
        }
        e.target.value = "";
    }
    function parseTextPackingList() {
        const rows = parseUniversalPackingText(packingText);
        setPackingRows(rows);
        msg?.(`Prepoznato ${rows.length} redova iz teksta.`);
    }
    async function importPackingRows() {
        if (!packingRows.length) { msg?.("Nema redova za uvoz", "err"); return; }
        let mats = [...materijali];
        let count = 0;
        const importedLocal = [];

        for (const rawRow of packingRows) {
            const matchedMaster = findBestMasterMaterial(rawRow, materialMaster);
            const row = matchedMaster ? {
                ...rawRow,
                vrsta: matchedMaster.vrsta,
                pod_vrsta: matchedMaster.pod_vrsta,
                oznaka_materijala: matchedMaster.oznaka,
                komercijalnaOznaka: matchedMaster.oznaka,
                proizvodjac: matchedMaster.proizvodjac,
                debljina: matchedMaster.debljina,
                koeficijent: matchedMaster.koeficijent,
                gsm: matchedMaster.gsm,
            } : rawRow;

            const activePrice = matchedMaster?.id ? materialPrices[matchedMaster.id]?.cena_kg : null;
            const cenaKg = number(row.cena_kg ?? row.cenaKg ?? activePrice ?? matchedMaster?.cena_kg ?? 0);
            const baseGsm = row.gsm || (row.debljina && row.koeficijent ? row.debljina * row.koeficijent : 0);

            let mat = matchedMaster ? normalizeMaterial({
                id: matchedMaster.id,
                vrsta: matchedMaster.vrsta,
                pod_vrsta: matchedMaster.pod_vrsta,
                oznaka: matchedMaster.oznaka,
                komercijalnaOznaka: materialDisplayName(matchedMaster),
                proizvodjac: matchedMaster.proizvodjac,
                debljina: matchedMaster.debljina,
                koeficijent: matchedMaster.koeficijent,
                gsm: matchedMaster.gsm,
                cenaKg,
                jedinica: matchedMaster.vrsta === "PAPIR" ? "g/m²" : "µ",
            }) : mats.find((m) =>
                String(m.vrsta).toLowerCase() === String(row.vrsta).toLowerCase()
                && String(m.komercijalnaOznaka || m.oznaka || m.oznaka_materijala).toLowerCase() === String(row.komercijalnaOznaka || row.oznaka_materijala).toLowerCase()
                && (!row.debljina || number(m.debljina) === number(row.debljina))
            );

            if (!mat) {
                mat = normalizeMaterial({
                    vrsta: row.vrsta || "Nedefinisano",
                    pod_vrsta: row.pod_vrsta || "",
                    oznaka: cleanOznaka(row.oznaka_materijala || row.komercijalnaOznaka || row.vrsta || "", row.vrsta),
                    oznaka_materijala: cleanOznaka(row.oznaka_materijala || row.komercijalnaOznaka || row.vrsta || "", row.vrsta),
                    komercijalnaOznaka: cleanOznaka(row.oznaka_materijala || row.komercijalnaOznaka || row.vrsta || "Materijal iz packing liste", row.vrsta),
                    proizvodjac: row.proizvodjac || "",
                    debljina: row.debljina,
                    koeficijent: row.koeficijent || coeffByVrsta(row.vrsta),
                    gsm: baseGsm,
                    cenaKg,
                    jedinica: row.vrsta === "PAPIR" ? "g/m²" : "µ",
                });
                mats = [mat, ...mats];
            }

            const gsm = calcGsm(mat) || row.gsm || baseGsm;
            const duzina = row.duzina || (row.kg && row.sirina && gsm ? metersFromKg({ sirinaMm: row.sirina, kg: row.kg, gsm }) : 0);
            const kg = row.kg || (row.duzina && row.sirina && gsm ? kgFromMeters({ sirinaMm: row.sirina, duzinaM: row.duzina, gsm }) : 0);
            const vrednost = round2(kg * cenaKg);
            if (!row.sirina || (!duzina && !kg)) continue;

            const brRolne = await uniqueBrRolne();
            const cleanCode = cleanOznaka(row.oznaka_materijala || mat.oznaka || mat.komercijalnaOznaka, mat.vrsta);
            let item = null;
            try {
                if (!supabase?.__notConfigured) {
                    const { data, error } = await supabase.from("magacin").insert({
                        br_rolne: brRolne,
                        tip: mat.vrsta,
                        vrsta: mat.vrsta,
                        pod_vrsta: row.pod_vrsta || mat.pod_vrsta || null,
                        oznaka_materijala: cleanCode,
                        deb: mat.debljina || row.debljina || 0,
                        sirina: number(row.sirina),
                        metraza: duzina,
                        metraza_ost: duzina,
                        kg_bruto: row.kg_bruto || kg,
                        kg_neto: kg,
                        cena_kg: cenaKg || null,
                        vrednost: vrednost || null,
                        lot: row.lot || null,
                        dobavljac: mat.proizvodjac || row.proizvodjac || null,
                        datum: new Date().toISOString().slice(0, 10),
                        datum_prijema: new Date().toISOString().slice(0, 10),
                        datum_proizvodnje: toIsoDateOrNull(row.datum_proizvodnje),
                        status: "Na stanju",
                        qr_code: brRolne,
                        lokacija: row.lokacija || "Magacin",
                        palet: row.palet || null,
                        napomena: row.napomena || null,
                    }).select("*").single();
                    if (error) throw error;
                    item = mapDbRollToEngine(data);
                    await logHistory({ qr: item.qr, event: "UVOZ PACKING LISTE", opis: `${item.vrsta || ""} ${item.oznaka_materijala || ""} · ${fmt(number(item.duzina), 0)} m / ${fmt(number(item.kg), 2)} kg · lokacija ${item.lokacija || "—"}`, stanje: "Na stanju" });
                }
            } catch (e) {
                console.error(e);
                msg?.(`Supabase uvoz rolne ${brRolne} nije uspeo: ${e?.message || e}`, "err");
            }
            if (!item) {
                item = addWarehouseRoll({
                    qr: brRolne, materijal_id: mat.id, vrsta: mat.vrsta, pod_vrsta: row.pod_vrsta || mat.pod_vrsta || "",
                    oznaka_materijala: cleanCode,
                    materijal: mat.vrsta, komercijalnaOznaka: cleanCode,
                    proizvodjac: mat.proizvodjac || row.proizvodjac,
                    debljina: mat.debljina || row.debljina,
                    koeficijent: mat.koeficijent || row.koeficijent,
                    gsm, sirina: row.sirina, duzina, kg, cenaKg, vrednost, lot: row.lot, lokacija: row.lokacija || "Magacin", datum: row.datum || new Date().toLocaleDateString("sr-RS"), datum_proizvodnje: row.datum_proizvodnje || "", status: "Na stanju",
                    napomena: row.napomena || ""
                }, "UVOZ PACKING LISTE");
            }
            importedLocal.push(item);
            count += 1;
        }

        // Packing lista unosi samo rolne u magacin. Ne puni bazu materijala automatski.
        await reload();
        msg?.(`Uvezeno ${count} rolni iz packing liste.`);
    }
    async function applyDirectLocation(targetMode, location) {
        const loc = String(location || "").trim();
        if (!loc) return;
        const targetRoll = targetMode === "povrat" ? povratRoll : popisRoll;
        if (!targetRoll?.id) {
            msg?.("Prvo skeniraj/pronađi rolnu, pa zatim skeniraj QR lokacije.", "err");
            return;
        }
        const oldLocation = targetRoll.lokacija || "";
        try {
            await persistRollState(targetRoll, { location: loc }, { reload: false });
            try {
                if (!supabase?.__notConfigured) {
                    await supabase.from("istorija_lokacija_rolni").insert({
                        rolna_id: targetRoll.id,
                        br_rolne: targetRoll.br_rolne || targetRoll.qr,
                        stara_lokacija: oldLocation,
                        nova_lokacija: loc,
                        korisnik: reserverName || operater?.ime || "magacioner",
                        napomena: `Promena lokacije QR skeniranjem: ${oldLocation || "—"} → ${loc}`,
                    });
                }
            } catch (histErr) { /* istorija lokacija nije kritična */ }
            setRolne((prev) => prev.map((x) => String(x.id) === String(targetRoll.id) ? { ...x, lokacija: loc } : x));
            if (targetMode === "povrat") { setPovratRoll((r) => r ? { ...r, lokacija: loc } : r); setPovratForm((f) => ({ ...f, lokacija: loc })); }
            else { setPopisRoll((r) => r ? { ...r, lokacija: loc } : r); setPopisForm((f) => ({ ...f, lokacija: loc })); }
            msg?.(`Lokacija postavljena: ${loc}`);
            await reload();
        } catch (e) {
            msg?.("Upis lokacije nije uspeo: " + (e?.message || e), "err");
        }
    }

    async function updateRollLocationByScan(targetMode, parts) {
        const location = buildLocationCode(parts);
        if (!location) return;
        const targetRoll = targetMode === "povrat" ? povratRoll : popisRoll;
        if (!targetRoll?.id) {
            msg?.("Prvo skeniraj/pronađi rolnu, pa zatim skeniraj lokaciju.", "err");
            return;
        }
        const oldLocation = targetRoll.lokacija || "";
        try {
            const finalRoll = await persistRollState(targetRoll, { location }, { reload: false });
            try {
                if (!supabase?.__notConfigured) {
                    await supabase.from("istorija_lokacija_rolni").insert({
                        rolna_id: targetRoll.id,
                        br_rolne: targetRoll.br_rolne || targetRoll.qr,
                        stara_lokacija: oldLocation,
                        nova_lokacija: location,
                        korisnik: operater?.ime || "magacioner",
                        napomena: `Promena lokacije QR skeniranjem: ${oldLocation || "—"} → ${location}`,
                    });
                }
            } catch (histErr) {
                console.warn("Istorija lokacije nije upisana:", histErr);
            }

            await logHistory({
                qr: finalRoll.qr || targetRoll.qr || targetRoll.br_rolne,
                event: "PROMENA LOKACIJE QR",
                opis: `Lokacija promenjena QR skeniranjem: ${oldLocation || "—"} → ${location}`,
                stanje: finalRoll.status || targetRoll.status,
            });

            if (targetMode === "povrat") {
                setPovratRoll(finalRoll);
                setPovratForm((f) => ({ ...f, lokacija: location }));
            } else {
                setPopisRoll(finalRoll);
                setPopisForm((f) => ({ ...f, lokacija: location }));
            }
            msg?.(`Lokacija rolne ${targetRoll.qr || targetRoll.br_rolne} promenjena na ${location}`);
            await reload();
        } catch (e) {
            console.error(e);
            msg?.("Promena lokacije nije uspela: " + (e?.message || e), "err");
        }
    }

    async function handleMobileScan(decodedText) {
        try {
            if (scannerMode === "lokacija") {
                const loc = parseLocationQr(decodedText);
                if (!loc) {
                    msg?.("Ovo nije QR lokacije. Skeniraj MAGACIN / RED / POLICA / POZICIJA QR.", "err");
                    setScannerMode(null);
                    return;
                }
                if (loc.direct) {
                    await applyDirectLocation(locationTarget, loc.value);
                    setLocationParts({ magacin: "", red: "", polica: "", pozicija: "" });
                    setScannerMode(null);
                    return;
                }
                const nextParts = { ...locationParts, [loc.key]: loc.value };
                setLocationParts(nextParts);
                const fullLocation = buildLocationCode(nextParts);
                if (fullLocation) {
                    await updateRollLocationByScan(locationTarget, nextParts);
                    setLocationParts({ magacin: "", red: "", polica: "", pozicija: "" });
                } else {
                    msg?.(`Očitano: ${loc.key} ${loc.value}. Nastavi skeniranje lokacije. ${locationProgressLabel(nextParts)}`);
                }
                setScannerMode(null);
                return;
            }

            const qr = extractQrFromScan(decodedText);
            if (!qr) {
                msg?.("QR kod nije prepoznat", "err");
                setScannerMode(null);
                return;
            }

            const found = await resolveRollByQr(qr);

            if (scannerMode === "povrat") {
                setActiveTab("povrat");
                setPovratQr(qr);
                if (found) {
                    setPovratRoll(found);
                    setPovratForm((f) => ({ ...f, lokacija: found.lokacija || "Magacin" }));
                    await logHistory({ qr: found.qr || qr, event: "QR SKEN TELEFON / POVRAT", opis: `Telefon sken za povrat · lokacija ${found.lokacija || "—"} · stanje ${displayStatus(found.status)}`, stanje: found.status });
                    msg?.(`Skenirana rolna za povrat: ${qr}`);
                } else {
                    msg?.(`Rolna nije pronađena u magacinu: ${qr}`, "err");
                }
            } else {
                setActiveTab("popis");
                setPopisQr(qr);
                if (found) {
                    setPopisRoll(found);
                    setPopisForm({ duzina: found.duzina, kg: found.kg, lokacija: found.lokacija || "" });
                    await logHistory({ qr: found.qr || qr, event: "QR SKEN TELEFON / POPIS", opis: `Telefon sken za popis · lokacija ${found.lokacija || "—"} · stanje ${displayStatus(found.status)}`, stanje: found.status });
                    msg?.(`Skenirana rolna za popis: ${qr}`);
                } else {
                    msg?.(`Rolna nije pronađena u magacinu: ${qr}`, "err");
                }
            }
            setScannerMode(null);
        } catch (e) {
            console.error("Obrada QR skeniranja nije uspela:", e);
            msg?.("Obrada QR skeniranja nije uspela: " + (e?.message || e), "err");
            setScannerMode(null);
        }
    }

    function openMobileScanner(mode) {
        setScannerMode(mode);
        if (mode === "povrat") setActiveTab("povrat");
        else if (mode === "popis") setActiveTab("popis");
    }

    function openLocationScanner(targetMode) {
        setLocationTarget(targetMode || activeTab || "popis");
        setScannerMode("lokacija");
    }

    async function findPopisRoll() {
        const qr = extractQrFromScan(popisQr);
        const found = await resolveRollByQr(qr);
        if (!found) { setPopisRoll(null); msg?.(`Rolna nije pronađena u magacinu: ${qr}`, "err"); return; }
        setPopisRoll(found);
        setPopisForm({ duzina: found.duzina, kg: found.kg, lokacija: found.lokacija || "" });
        await logHistory({ qr: found.qr || qr, event: "QR SKEN / POPIS", opis: `Pronađena rolna za popis · lokacija ${found.lokacija || "—"} · stanje ${displayStatus(found.status)}`, stanje: found.status });
    }
    async function confirmInventoryCount() {
        if (!popisRoll) { msg?.("Prvo skeniraj/pronađi rolnu", "err"); return; }
        const m = number(popisForm.duzina);
        if (!m || m <= 0) { msg?.("Unesi ispravnu stvarnu metražu", "err"); return; }
        const kg = number(popisForm.kg) || estimateKgForMeters(popisRoll, m);
        const updatedLokacija = String(popisForm.lokacija || popisRoll.lokacija || "").trim();
        const qr = String(popisRoll.qr || "");

        try {
            const updated = await persistRollState(popisRoll, {
                meters: m,
                kg,
                location: updatedLokacija,
                status: popisRoll.status || "Na stanju",
                napomena: `Popis ${popisSessionId} · ${popisMagacin}`,
                popis: true,
            });

            const countedRow = {
                qr,
                br_rolne: updated.br_rolne || qr,
                vrsta: updated.vrsta,
                oznaka_materijala: rollOznaka(updated),
                sirina: updated.sirina,
                duzina: number(updated.duzina),
                kg: number(updated.kg),
                popisana_lokacija: updated.lokacija || updatedLokacija,
                ocekivana_lokacija: popisRoll.lokacija || "",
                vreme: now(),
                session_id: popisSessionId,
            };

            await logHistory({
                qr: updated.qr,
                event: "POPIS QR",
                opis: `Popis ${popisMagacin}: ${fmt(updated.duzina, 0)} m / ${fmt(updated.kg, 2)} kg · lokacija ${updated.lokacija || updatedLokacija}`,
                stanje: updated.status
            });
            setPopisScanned((prev) => ({ ...prev, [qr]: countedRow }));
            setPopisQr("");
            setPopisRoll(null);
            setPopisForm({ duzina: "", kg: "", lokacija: "" });
            msg?.("Popis rolne potvrđen i stanje ažurirano u Supabase.");
        } catch (e) {
            console.error(e);
            msg?.("Popis nije upisan u Supabase: " + (e?.message || e), "err");
        }
    }

    function resetPopisSession() {
        if (!confirm("Započeti novi popis? Trenutna lista skeniranih rolni za ovu sesiju će se obrisati.")) return;
        setPopisSessionId(`POPIS-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-6)}`);
        setPopisScanned({});
        setPopisQr("");
        setPopisRoll(null);
        setPopisForm({ duzina: "", kg: "", lokacija: "" });
    }


    const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.05)" };
    const input = { width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: 13 };
    const smallInput = { ...input, padding: "7px 8px", borderRadius: 8, fontSize: 12 };
    const btn = { border: "none", borderRadius: 10, padding: "9px 12px", fontWeight: 900, cursor: "pointer" };
    const lbl = { display: "block", fontSize: 11, fontWeight: 900, color: "#475569", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3 };

    const crevoGT = { fontSize: 11, fontWeight: 900, color: "#7c3aed", textTransform: "uppercase", letterSpacing: .5, marginBottom: 9, display: "flex", alignItems: "center", gap: 7 };
    const crevoDot = { width: 6, height: 6, borderRadius: "50%", background: "#7c3aed", display: "inline-block" };
    const crevoGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11 };
    const crevoView = (
        <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: "#faf5ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🧵</div>
                <div><div style={{ fontWeight: 950, fontSize: 17 }}>Polu-rolne / creva — unos merenjem prečnika</div><div style={{ fontSize: 12, color: "#64748b" }}>Uneseš materijal i izmeren prečnik → metraža, kg i razvijena širina se računaju same.</div></div>
                <div style={{ marginLeft: "auto", fontSize: 11, fontWeight: 900, background: "#dcfce7", color: "#15803d", borderRadius: 8, padding: "5px 11px" }}>na stanje</div>
            </div>

            <div style={{ marginBottom: 16 }}>
                <div style={crevoGT}><span style={crevoDot} />1 · Materijal</div>
                <div style={crevoGrid}>
                    <label><span style={lbl}>Vrsta</span><input style={input} list="crevo-vrste" value={crevoForm.vrsta} onChange={(e) => setCrevoForm((f) => ({ ...f, vrsta: e.target.value }))} placeholder="npr. PE" /><datalist id="crevo-vrste">{[...new Set(materialMaster.map((x) => x.vrsta).filter(Boolean))].map((v) => <option key={v} value={v} />)}</datalist></label>
                    <label><span style={lbl}>Pod-vrsta</span><input style={input} list="crevo-podvrste" value={crevoForm.pod_vrsta} onChange={(e) => setCrevoForm((f) => ({ ...f, pod_vrsta: e.target.value }))} placeholder="npr. Transparent" /><datalist id="crevo-podvrste">{[...new Set(materialMaster.filter((x) => !crevoForm.vrsta || String(x.vrsta).toUpperCase() === crevoForm.vrsta.toUpperCase()).map((x) => x.pod_vrsta).filter(Boolean))].map((v) => <option key={v} value={v} />)}</datalist></label>
                    <label><span style={lbl}>Oznaka</span><input style={input} list="crevo-oznake" value={crevoForm.oznaka} onChange={(e) => setCrevoForm((f) => ({ ...f, oznaka: e.target.value }))} placeholder="oznaka" /><datalist id="crevo-oznake">{[...new Set(materialMaster.filter((x) => !crevoForm.vrsta || String(x.vrsta).toUpperCase() === crevoForm.vrsta.toUpperCase()).map((x) => x.oznaka).filter(Boolean))].map((v) => <option key={v} value={v} />)}</datalist></label>
                    <label><span style={lbl}>Debljina (µm)</span><input style={input} type="number" value={crevoForm.debljina} onChange={(e) => setCrevoForm((f) => ({ ...f, debljina: e.target.value }))} placeholder="npr. 35" /></label>
                    <label><span style={lbl}>Dobavljač</span><input style={input} list="crevo-dob" value={crevoForm.dobavljac} onChange={(e) => setCrevoForm((f) => ({ ...f, dobavljac: e.target.value }))} placeholder="npr. Plastchim" /><datalist id="crevo-dob">{[...new Set(rolne.map((x) => x.dobavljac).filter(Boolean))].map((v) => <option key={v} value={v} />)}</datalist></label>
                    <label><span style={lbl}>Cena (€/kg){crevoCalc.baznaCena && !number(crevoForm.cenaKg) ? " · baza " + fmt(crevoCalc.baznaCena, 2) : ""}</span><input style={input} type="number" step="0.01" value={crevoForm.cenaKg} onChange={(e) => setCrevoForm((f) => ({ ...f, cenaKg: e.target.value }))} placeholder={crevoCalc.baznaCena ? String(crevoCalc.baznaCena) : "€/kg"} /></label>
                </div>
            </div>

            <div style={{ marginBottom: 16 }}>
                <div style={crevoGT}><span style={crevoDot} />2 · Merenje rolne / creva</div>
                <div style={crevoGrid}>
                    <label><span style={lbl}>Spljoštena širina (mm)</span><input style={input} type="number" value={crevoForm.sirina} onChange={(e) => setCrevoForm((f) => ({ ...f, sirina: e.target.value }))} placeholder="npr. 840" /></label>
                    <label><span style={lbl}>Spoljni prečnik (mm) — mereno</span><input style={{ ...input, borderColor: "#0f766e", background: "#f0fdfa", fontWeight: 800 }} type="number" value={crevoForm.precnik} onChange={(e) => setCrevoForm((f) => ({ ...f, precnik: e.target.value }))} placeholder="npr. 320" /></label>
                    <label><span style={lbl}>Hilzna</span><select style={input} value={crevoForm.hilzna} onChange={(e) => setCrevoForm((f) => ({ ...f, hilzna: e.target.value }))}><option value="FI76">FI 76</option><option value="FI152">FI 152</option></select></label>
                    <label><span style={lbl}>⭐ Oblik namotaja</span><select style={{ ...input, borderColor: "#7c3aed", color: "#6d28d9", fontWeight: 900 }} value={crevoForm.oblik} onChange={(e) => setCrevoForm((f) => ({ ...f, oblik: e.target.value }))}><option value="ravna">Ravna folija (×1)</option><option value="crevo">Polu-crevo / crevo (×2)</option><option value="custom">Custom faktor…</option></select></label>
                    {crevoForm.oblik === "custom" && <label><span style={lbl}>Custom faktor</span><input style={input} type="number" value={crevoForm.kCustom} onChange={(e) => setCrevoForm((f) => ({ ...f, kCustom: e.target.value }))} /></label>}
                </div>
                <span style={{ fontSize: 11.5, color: "#7c3aed", background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "5px 10px", marginTop: 7, display: "inline-block", fontWeight: 700 }}>Crevo = savijeno → ×2 (razvijena širina i debljina dupli)</span>
            </div>

            <div style={{ marginBottom: 6 }}>
                <div style={crevoGT}><span style={crevoDot} />3 · Skladište</div>
                <div style={crevoGrid}>
                    <label><span style={lbl}>LOT</span><input style={input} value={crevoForm.lot} onChange={(e) => setCrevoForm((f) => ({ ...f, lot: e.target.value }))} placeholder="opciono" /></label>
                    <label><span style={lbl}>Datum proizvodnje</span><input style={input} type="date" value={crevoForm.datum_proizvodnje} onChange={(e) => setCrevoForm((f) => ({ ...f, datum_proizvodnje: e.target.value }))} /></label>
                    <label><span style={lbl}>Lokacija</span><input style={input} value={crevoForm.lokacija} onChange={(e) => setCrevoForm((f) => ({ ...f, lokacija: e.target.value }))} /></label>
                    <label><span style={lbl}>Napomena</span><input style={input} value={crevoForm.napomena} onChange={(e) => setCrevoForm((f) => ({ ...f, napomena: e.target.value }))} placeholder="opciono" /></label>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, background: "#0f172a", borderRadius: 14, padding: 14, marginTop: 14 }}>
                <div style={{ background: "#15803d", color: "#fff", borderRadius: 11, padding: "12px 14px" }}><div style={{ fontSize: 10, opacity: .85, fontWeight: 800, textTransform: "uppercase" }}>Metraža</div><div style={{ fontSize: 23, fontWeight: 950 }}>≈ {fmt(crevoCalc.meters, 0)} m</div></div>
                <div style={{ background: "#1d4ed8", color: "#fff", borderRadius: 11, padding: "12px 14px" }}><div style={{ fontSize: 10, opacity: .85, fontWeight: 800, textTransform: "uppercase" }}>kg (neto){crevoCalc.gsm ? " · " + fmt(crevoCalc.gsm, 1) + " g/m²" : ""}</div><div style={{ fontSize: 23, fontWeight: 950 }}>≈ {fmt(crevoCalc.kg, 1)} kg</div></div>
                <div style={{ background: "#7c3aed", color: "#fff", borderRadius: 11, padding: "12px 14px" }}><div style={{ fontSize: 10, opacity: .85, fontWeight: 800, textTransform: "uppercase" }}>Razvijena širina (×{crevoCalc.k})</div><div style={{ fontSize: 23, fontWeight: 950 }}>{fmt(crevoCalc.razvijena, 0)} mm</div></div>
                <div style={{ background: "#0e7490", color: "#fff", borderRadius: 11, padding: "12px 14px" }}><div style={{ fontSize: 10, opacity: .85, fontWeight: 800, textTransform: "uppercase" }}>Vrednost{crevoCalc.cenaKg ? " · " + fmt(crevoCalc.cenaKg, 2) + " €/kg" : ""}</div><div style={{ fontSize: 23, fontWeight: 950 }}>≈ {fmt(crevoCalc.vrednost, 2)} €</div></div>
            </div>
            {!crevoCalc.gsm && crevoForm.vrsta && <div style={{ marginTop: 10, fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", fontWeight: 700 }}>⚠️ Nema gramaže u bazi materijala za ovu kombinaciju — kg može biti 0. Dodaj materijal u „Baza materijala" za tačan kg.</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
                <button onClick={() => setCrevoForm((f) => ({ ...f, precnik: "", lot: "", napomena: "" }))} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Očisti</button>
                <button onClick={dodajCrevo} style={{ ...btn, background: "#16a34a", color: "#fff" }}>✅ Dodaj na stanje</button>
            </div>
        </div>
    );
    const tabBtn = (key) => ({ ...btn, background: activeTab === key ? "#0f172a" : "#f8fafc", color: activeTab === key ? "#fff" : "#334155", border: "1px solid #e2e8f0" });

    async function openRezPopup(r) {
        setRezPopup({ qr: r.qr, id: r.id, total: rolnaUkupnoM(r), rez: rolnaRezM(r), rows: null, loading: true, dod: r.dodeljeno_nalogu || "" });
        try {
            let rows = [];
            if (r.id && supabase && !supabase.__notConfigured) {
                const { data } = await supabase.from("materijal_stavke").select("nalog_ref, alocirano_m, izdato_m, sloj").eq("rolna_id", r.id).order("created_at", { ascending: true });
                rows = data || [];
            }
            setRezPopup({ qr: r.qr, id: r.id, total: rolnaUkupnoM(r), rez: rolnaRezM(r), rows, loading: false, dod: r.dodeljeno_nalogu || "" });
        } catch (e) {
            setRezPopup({ qr: r.qr, id: r.id, total: rolnaUkupnoM(r), rez: rolnaRezM(r), rows: [], loading: false, dod: r.dodeljeno_nalogu || "" });
        }
    }

    function rezBarCell(r) {
        const total = rolnaUkupnoM(r);
        if (normalizeStatus(r.status) === "proizvodnja") {
            return (
                <div style={{ minWidth: 150 }}>
                    <span style={{ background: "#faf5ff", color: "#7c3aed", border: "1px solid #e9d5ff", borderRadius: 999, padding: "3px 9px", fontWeight: 900, fontSize: 11, whiteSpace: "nowrap" }}>⚙️ U proizvodnji</span>
                    <div style={{ fontSize: 10.5, color: "#7c3aed", marginTop: 3, fontWeight: 700 }}>{r.lokacija || "WIP"} · {fmt(total, 0)} m</div>
                </div>
            );
        }
        let rez = Math.min(total, rolnaRezM(r));
        if (rez === 0 && normalizeStatus(r.status) === "rezervisana") rez = total; // starija puna rezervacija bez upisanih metara
        const slob = Math.max(0, total - rez);
        const pct = total > 0 ? (rez / total) * 100 : 0;
        const delim = rez > 0 && slob > 0;
        const punoRez = total > 0 && rez >= total - 1;
        const klik = rez > 0;
        const badgeText = delim ? "Delimično" : displayStatus(r.status);
        const badgeColor = delim ? "#a16207" : statusColor(r.status);
        const badgeBg = delim ? "#fef3c7" : statusColor(r.status) + "18";
        return (
            <div style={{ minWidth: 150 }}>
                <span onClick={klik ? () => openRezPopup(r) : undefined} title={klik ? "Klikni za naloge" : undefined}
                    style={{ background: badgeBg, color: badgeColor, borderRadius: 999, padding: "3px 9px", fontWeight: 900, fontSize: 11, cursor: klik ? "pointer" : "default", whiteSpace: "nowrap" }}>{badgeText}{klik ? " ▾" : ""}</span>
                {total > 0 && (
                    <>
                        <div style={{ height: 8, background: "#16a34a", borderRadius: 5, overflow: "hidden", marginTop: 5, display: "flex" }}>
                            <div style={{ height: "100%", width: pct + "%", background: "#f59e0b" }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {delim ? <><b style={{ color: "#15803d" }}>{fmt(slob, 0)} slob.</b> · {fmt(rez, 0)} rez.</> : (punoRez ? <>{fmt(rez, 0)} m rezervisano</> : <b style={{ color: "#15803d" }}>{fmt(slob, 0)} m slobodno</b>)}
                        </div>
                    </>
                )}
            </div>
        );
    }



    const mobileActionBtn = (key, icon, title, subtitle) => ({
        key,
        icon,
        title,
        subtitle,
        active: activeTab === key,
    });

    const MobileShell = () => {
        const magNorm = String(operater?.ime || "").trim().toLowerCase()
            .replace(/đ/g, "dj").replace(/č|ć/g, "c").replace(/š/g, "s").replace(/ž/g, "z")
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const magAllowed = ["djordje", "dorde", "bosko", "dejan"].some((n) => magNorm.includes(n));
        if (activeTab === "materijal_naloge") {
            if (!magAllowed) { setActiveTab("rolne"); return null; }
            return <MaterijalZaNaloge operater={operater} msg={msg} onBack={() => setActiveTab("rolne")} />;
        }
        const mobileActions = [
            mobileActionBtn("popis", "📷", "Skeniraj / popiši", "QR popis rolne"),
            mobileActionBtn("povrat", "↩️", "Povrat u magacin", "Prečnik + hilzna"),
            mobileActionBtn("unos", "➕", "Unos rolne", "Ručni unos"),
            mobileActionBtn("creva", "🧵", "Polu-rolne / creva", "Merenje prečnika"),
            mobileActionBtn("rolne", "🎞️", "Stanje", "Lista rolni"),
            mobileActionBtn("istorija", "🕘", "Istorija", "Ko je šta radio"),
            mobileActionBtn("istorija_povrata", "↩️", "Istorija povrata", "Vraćene rolne"),
        ];

        return (
            <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: 12, color: "#0f172a" }}>
                {LabelModal}{BulkModal}{RezModal}{RezManualModal}{OslobodiModal}
                {scannerMode && <MobileCameraScanner mode={scannerMode} onClose={() => setScannerMode(null)} onScan={handleMobileScan} />}
                <div style={{ ...card, padding: 14, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div>
                            <div style={{ fontSize: 22, fontWeight: 950 }}>🏪 Magacin</div>
                            <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>👷 {operater?.ime || "—"}</div>
                        </div>
                        <button onClick={logoutOperater} style={{ ...btn, background: "#fee2e2", color: "#991b1b", fontWeight: 900 }}>Odjava</button>
                    </div>
                    <button onClick={reload} style={{ ...btn, background: "#0f172a", color: "#fff", marginTop: 12, width: "100%" }}>Osveži stanje</button>
                </div>

                {magAllowed && (
                    <button onClick={() => setActiveTab("materijal_naloge")} style={{ width: "100%", textAlign: "left", border: "none", borderRadius: 16, padding: 16, marginBottom: 12, color: "#fff", background: "linear-gradient(135deg,#0f766e,#0d9488)", boxShadow: "0 8px 22px rgba(13,148,136,.3)", cursor: "pointer" }}>
                        <div style={{ fontSize: 28 }}>📋</div>
                        <div style={{ fontSize: 20, fontWeight: 950, marginTop: 6 }}>Materijal za naloge</div>
                        <div style={{ fontSize: 13, opacity: .9, marginTop: 2 }}>Skeniraj rolne koje treba spremiti ›</div>
                    </button>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                    {mobileActions.map((a) => (
                        <button key={a.key} onClick={() => { if (a.key === "popis" || a.key === "povrat") openMobileScanner(a.key); else { setActiveTab(a.key); if (a.key === "unos") setInputMode("rucno"); } }} style={{
                            border: a.active ? "2px solid #0f172a" : "1px solid #e2e8f0",
                            background: a.active ? "#0f172a" : "#fff",
                            color: a.active ? "#fff" : "#0f172a",
                            borderRadius: 16,
                            padding: 14,
                            textAlign: "left",
                            minHeight: 92,
                            boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
                        }}>
                            <div style={{ fontSize: 26 }}>{a.icon}</div>
                            <div style={{ fontWeight: 950, marginTop: 5 }}>{a.title}</div>
                            <div style={{ fontSize: 12, opacity: 0.78, marginTop: 3 }}>{a.subtitle}</div>
                        </button>
                    ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                    <div style={{ ...card, padding: 12 }}><div style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>Rolni</div><div style={{ fontSize: 22, fontWeight: 950 }}>{stats.total}</div></div>
                    <div style={{ ...card, padding: 12 }}><div style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>Na stanju</div><div style={{ fontSize: 22, fontWeight: 950 }}>{stats.dostupna}</div></div>
                </div>

                {activeTab === "popis" && <PopisTab {...{ card, input, btn, lbl, popisQr, setPopisQr, findPopisRoll, popisRoll, popisForm, setPopisForm, confirmInventoryCount, estimateKgForMeters, onOpenScanner: () => openMobileScanner("popis"), onOpenLocationScanner: () => openLocationScanner("popis"), locationParts, popisMagacin, setPopisMagacin, popisSessionId, resetPopisSession, popisExpectedRolls, popisCountedRows, popisMissingRolls, popisExtraRows }} />}
                {activeTab === "povrat" && <PovratTab {...{ card, input, btn, lbl, povratQr, setPovratQr, findPovratRoll, povratRoll, povratForm, setPovratForm, estimateMetersFromDiameter, estimateKgForMeters, confirmReturnToWarehouse, onOpenScanner: () => openMobileScanner("povrat"), onOpenLocationScanner: () => openLocationScanner("povrat"), locationParts }} />}
                {activeTab === "unos" && (
                    <div style={card}>
                        <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 10 }}>➕ Ručni unos rolne</div>
                        <div style={{ display: "grid", gap: 10 }}>
                            <datalist id="m-vrste">{masterVrste.map((v) => <option key={v} value={v} />)}</datalist>
                            <datalist id="m-podvrste">{masterPodVrste.map((v) => <option key={v} value={v} />)}</datalist>
                            <datalist id="m-oznake">{masterOznake.map((o) => <option key={o} value={o} />)}</datalist>
                            <datalist id="m-debljine">{masterDebljine.map((d) => <option key={d} value={d} />)}</datalist>
                            <datalist id="m-proizvodjaci">{masterProizvodjaci.map((p) => <option key={p} value={p} />)}</datalist>
                            <label><span style={lbl}>Vrsta {selectedMasterMaterial ? "✅ u bazi" : "🆕 nova kombinacija"}</span><input style={input} list="m-vrste" value={materialPick.vrsta} onChange={(e) => setMaterialPick((p) => ({ ...p, vrsta: e.target.value.toUpperCase(), pod_vrsta: "", oznaka: "" }))} placeholder="npr. BOPP" /></label>
                            <label><span style={lbl}>Pod vrsta</span><input style={input} list="m-podvrste" value={materialPick.pod_vrsta || ""} onChange={(e) => setMaterialPick((p) => ({ ...p, pod_vrsta: e.target.value, oznaka: "" }))} placeholder="npr. Transparent" /></label>
                            <label><span style={lbl}>Oznaka</span><input style={input} list="m-oznake" value={materialPick.oznaka || ""} onChange={(e) => setMaterialPick((p) => ({ ...p, oznaka: e.target.value }))} placeholder="npr. FXC" /></label>
                            <label><span style={lbl}>{materialPick.vrsta === "PAPIR" ? "Gramatura" : "Debljina µ"}</span><input style={input} type="number" step="0.01" list="m-debljine" value={materialPick.debljina || ""} onChange={(e) => setMaterialPick((p) => ({ ...p, debljina: Number(e.target.value) }))} /></label>
                            <label><span style={lbl}>Proizvođač</span><input style={input} list="m-proizvodjaci" value={materialPick.proizvodjac || ""} onChange={(e) => setMaterialPick((p) => ({ ...p, proizvodjac: e.target.value }))} placeholder="npr. Plastchim" /></label>
                            {!selectedMasterMaterial && (
                                <div style={{ padding: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12 }}>
                                    <div style={{ fontWeight: 900, color: "#92400e", marginBottom: 6, fontSize: 13 }}>Nova kombinacija — nije u bazi. Sačuvaj je da bi mogla na stanje.</div>
                                    <label style={{ display: "block", marginBottom: 8 }}><span style={lbl}>Koeficijent</span><input style={input} type="number" step="0.001" value={materialPick.koeficijent} onChange={(e) => setMaterialPick({ ...materialPick, koeficijent: e.target.value })} placeholder={String(mmKoeficijent(materialPick.vrsta) || "npr. 0.91")} /></label>
                                    <button onClick={() => saveMaterialMaster({ vrsta: materialPick.vrsta, pod_vrsta: materialPick.pod_vrsta, oznaka: materialPick.oznaka, proizvodjac: materialPick.proizvodjac, debljina: materialPick.debljina, koeficijent: number(materialPick.koeficijent) || selectedMat.koeficijent, gsm: liveGsm, cenaKg: materialPick.cenaKg })} disabled={!materialPick.vrsta || !materialPick.pod_vrsta || !materialPick.oznaka || !Number(materialPick.debljina)} style={{ ...btn, background: (materialPick.vrsta && materialPick.pod_vrsta && materialPick.oznaka && Number(materialPick.debljina)) ? "#059669" : "#cbd5e1", color: "#fff", width: "100%" }}>💾 Sačuvaj u bazu</button>
                                </div>
                            )}
                            <label><span style={lbl}>Širina mm</span><input style={input} type="number" value={form.sirina} onChange={(e) => syncFormByMode({ sirina: e.target.value })} /></label>
                            <label><span style={lbl}>Obračun</span><select style={input} value={calcMode} onChange={(e) => setCalcMode(e.target.value)}><option value="m_to_kg">Unos m → kg</option><option value="kg_to_m">Unos kg → m</option><option value="precnik">📐 Po prečniku (nemam m/kg)</option></select></label>
                            {calcMode === "precnik" && (<>
                                <label><span style={lbl}>Spoljni prečnik mm</span><input style={input} type="number" value={precnikForm.spoljniPrecnik} onChange={(e) => syncByDiameter({ spoljniPrecnik: e.target.value })} placeholder="npr. 320" /></label>
                                <label><span style={lbl}>Hilzna (tulac)</span><select style={input} value={precnikForm.hilzna} onChange={(e) => syncByDiameter({ hilzna: e.target.value })}><option value="FI76">FI 76</option><option value="FI152">FI 152</option></select></label>
                            </>)}
                            <label><span style={lbl}>Metara</span><input style={input} type="number" value={form.duzina} readOnly={calcMode === "precnik"} onChange={(e) => syncFormByMode({ duzina: e.target.value })} /></label>
                            <label><span style={lbl}>Kilograma</span><input style={input} type="number" value={form.kg} readOnly={calcMode === "precnik"} onChange={(e) => syncFormByMode({ kg: e.target.value })} /></label>
                            <label><span style={lbl}>LOT</span><input style={input} value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} /></label>
                            <label><span style={lbl}>Lokacija</span><input style={input} value={form.lokacija} onChange={(e) => setForm({ ...form, lokacija: e.target.value })} placeholder="A-01-A-01" /></label>
                            <label><span style={lbl}>Datum proizvodnje</span><input style={input} type="text" inputMode="numeric" placeholder="DD.MM.GGGG ili GGGG-MM-DD" value={form.datum_proizvodnje} onChange={(e) => setForm({ ...form, datum_proizvodnje: e.target.value })} /></label>
                            <label><span style={lbl}>Napomena</span><input style={input} value={form.napomena} onChange={(e) => setForm({ ...form, napomena: e.target.value })} placeholder="npr. dobavljač, nalog, paleta…" /></label>
                            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
                                <b>Live obračun:</b> {fmt(calcMode === "m_to_kg" ? calculatedKg : number(form.kg), 2)} kg · {fmt(calcMode === "kg_to_m" ? calculatedM : number(form.duzina), 0)} m
                            </div>
                            <button onClick={addRoll} style={{ ...btn, background: "#059669", color: "#fff", padding: 14, fontSize: 15 }}>Dodaj rolnu i QR</button>
                        </div>
                    </div>
                )}
                {activeTab === "rolne" && (
                    <div style={card}>
                        <div style={{ fontWeight: 950, marginBottom: 10 }}>🎞️ Stanje rolni</div>
                        <input style={{ ...input, marginBottom: 10, fontSize: 16 }} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Pretraga: broj rolne, oznaka, širina, lokacija..." />
                        <div style={{ display: "grid", gap: 8 }}>
                            {pagedRolls.map((r) => (
                                <div key={r.qr || r.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}>
                                    <div style={{ fontWeight: 950 }}>{r.qr}{crevoLabel(r) && <span style={CREVO_BADGE}>{crevoLabel(r)}</span>}</div>
                                    <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{r.vrsta} · {rollOznaka(r) || "—"} · {r.sirina} mm{r.debljina ? ` · ${r.debljina}${String(r.vrsta).toUpperCase() === "PAPIR" ? "g" : "µ"}` : ""}</div>
                                    <div style={{ fontSize: 13, marginTop: 7 }}><b>Lokacija:</b> {locationLabel(r.lokacija)}</div>
                                    <div style={{ fontSize: 12.5, color: "#0369a1", fontWeight: 800, marginTop: 4 }}>📅 Proizvedeno: {formatDateLabel(r.datum_proizvodnje) || "—"}</div>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13 }}><span>{fmt(r.duzina, 0)} m</span><span>{fmt(r.kg, 2)} kg</span></div>
                                    <div style={{ marginTop: 8 }}>{rezBarCell(r)}</div>
                                    {String(r.status || "").toLowerCase().includes("rez") ? (
                                        <div style={{ fontSize: 12, color: "#92400e", marginTop: 6, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "7px 9px" }}>
                                            <div><b>Rezervisano za:</b> {r.dodeljeno_nalogu || r.master_nalog_id || "—"}</div>
                                            {napomenaText(r) && <div style={{ marginTop: 2 }}>📝 {napomenaText(r)}</div>}
                                            {r.rezervisao && <div style={{ marginTop: 2 }}>👤 Rezervisao: {r.rezervisao}</div>}
                                        </div>
                                    ) : (napomenaText(r) && <div style={{ fontSize: 12, color: "#475569", marginTop: 6, background: "#f8fafc", borderRadius: 8, padding: "6px 8px" }}>📝 {napomenaText(r)}</div>)}
                                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                        <button onClick={() => setLabelRoll(r)} style={{ ...btn, background: "#dbeafe", color: "#1d4ed8", flex: 1 }}>QR / Etiketa</button>
                                        <button onClick={() => reserveForMaster(r)} style={{ ...btn, background: "#fef3c7", color: "#92400e", flex: 1 }}>🔒 Rezerviši</button>
                                        {rolnaRezM(r) > 0 && <button onClick={() => oslobodiRez(r)} style={{ ...btn, background: "#dcfce7", color: "#15803d", flex: 1 }}>🔓 Oslobodi</button>}
                                    </div>
                                </div>
                            ))}
                            {filteredRolls.length === 0 && <div style={{ color: "#64748b", padding: 20, textAlign: "center" }}>Nema rolni za prikaz.</div>}
                        </div>
                        <Pager page={rollPageC} pages={rollPages} onGo={setRollPage} info={filteredRolls.length + " rolni" + (filter ? " (filtrirano)" : "") + " · prikaz " + (filteredRolls.length ? (rollPageC - 1) * PER_PAGE + 1 : 0) + "–" + Math.min(rollPageC * PER_PAGE, filteredRolls.length)} />
                    </div>
                )}

                {activeTab === "creva" && crevoView}

                {activeTab === "istorija" && (
                    <div style={card}>
                        <div style={{ fontWeight: 950, marginBottom: 10 }}>🕘 Istorija rolni</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><b>Istorija rolni</b><button onClick={reload} style={{ ...btn, background: "#e0f2fe", color: "#0369a1" }}>Osveži</button></div>
                        {history.length === 0 ? <div style={{ color: "#64748b", padding: 16, textAlign: "center" }}>Još nema istorije.</div> :
                            pagedHistory.map((h, i) => (
                                <div key={i} style={{ borderTop: "1px solid #e2e8f0", padding: "10px 0", fontSize: 13 }}>
                                    <div style={{ color: "#64748b" }}>{h.vreme} · <span style={{ color: "#0369a1", fontWeight: 900 }}>👷 {h.operater || "—"}</span></div>
                                    <div style={{ marginTop: 2 }}><b>{h.qr}</b> · {h.event}</div>
                                    <div style={{ color: "#475569" }}>{h.opis}</div>
                                </div>
                            ))}
                        <Pager page={histPageC} pages={histPages} onGo={setHistPage} info={(history ? history.length : 0) + " zapisa · prikaz " + (history && history.length ? (histPageC - 1) * PER_PAGE + 1 : 0) + "–" + Math.min(histPageC * PER_PAGE, history ? history.length : 0)} />
                    </div>
                )}

                {activeTab === "istorija_povrata" && (
                    <div style={card}>
                        <div style={{ fontWeight: 950, marginBottom: 10 }}>↩️ Istorija povrata</div>
                        <input value={povratSearch} onChange={(e) => setPovratSearch(e.target.value)} placeholder="Filter po broju rolne (ROLNA-2026…)" style={{ ...input, marginBottom: 10 }} />
                        {povratHistory.length === 0 ? <div style={{ color: "#64748b", padding: 16, textAlign: "center" }}>Nema povrata{povratSearch ? " za tu pretragu" : ""}.</div> :
                            pagedPovrat.map((h, i) => (
                                <div key={i} style={{ borderTop: "1px solid #e2e8f0", padding: "10px 0", fontSize: 13 }}>
                                    <div style={{ color: "#64748b" }}>{h.vreme} · <span style={{ color: "#0369a1", fontWeight: 900 }}>👷 {h.operater || "—"}</span></div>
                                    <div style={{ marginTop: 2 }}><b>{h.qr}</b> · {h.event}</div>
                                    <div style={{ color: "#475569" }}>{h.opis}</div>
                                </div>
                            ))}
                        <Pager page={povratPageC} pages={povratPages} onGo={setPovratPage} info={povratHistory.length + " povrata"} />
                    </div>
                )}
            </div>
        );
    };

    const PrintCSS = () => (
        <style>{`
      @media print {
        @page { size: 100mm 140mm; margin: 0; }
        html, body { width: 100mm !important; min-width: 100mm !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: #fff !important; }
        body * { visibility: hidden !important; }
        .roll-label-print-root, .roll-label-print-root * { visibility: visible !important; }
        .roll-label-print-root { position: absolute !important; left: 0 !important; top: 0 !important; width: 100mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; display: block !important; }
        .roll-label-print { width: 100mm !important; height: 140mm !important; margin: 0 !important; padding: 5mm !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; overflow: hidden !important; page-break-after: always !important; break-after: page !important; box-sizing: border-box !important; }
        .roll-label-print:last-child { page-break-after: auto !important; break-after: auto !important; }
        .no-print { display: none !important; }
      }
    `}</style>
    );

    const LabelModal = labelRoll ? (
        <div className="no-print" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,23,42,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <PrintCSS />
            <div style={{ background: "#fff", borderRadius: 18, padding: 18, width: "min(860px,96vw)", boxShadow: "0 20px 80px rgba(0,0,0,.35)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div><div style={{ fontSize: 18, fontWeight: 900 }}>QR etiketa rolne · 100×140 mm</div><div style={{ fontSize: 12, color: "#64748b" }}>Optimizovano za Rongta RP400H thermal label printer.</div></div>
                    <div style={{ display: "flex", gap: 8 }}><button onClick={printLabels} style={{ ...btn, background: "#059669", color: "#fff" }}>🖨️ Štampaj etiketu</button><button onClick={() => setLabelRoll(null)} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Zatvori</button></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "110mm 1fr", gap: 18, alignItems: "start" }}>
                    <div className="roll-label-print-root"><RollLabel roll={labelRoll} /></div>
                    <div style={{ display: "grid", gap: 10 }}>
                        <div style={{ fontWeight: 900 }}>Preview podaci za proveru pre štampe</div>
                        {[`QR: ${labelRoll.qr}`, `Materijal: ${labelRoll.vrsta} · ${labelRoll.komercijalnaOznaka || labelRoll.materijal}`, `Dimenzije: ${labelRoll.sirina} mm · ${fmt(labelRoll.duzina, 0)} m · ${fmt(labelRoll.kg, 2)} kg`, `LOT: ${labelRoll.lot || "—"}`].map((x) => <div key={x} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>{x}</div>)}
                    </div>
                </div>
            </div>
        </div>
    ) : null;

    const RezModal = rezPopup ? (() => {
        const total = rezPopup.total || 0, rez = Math.min(total, rezPopup.rez || 0), slob = Math.max(0, total - rez);
        const rows = rezPopup.rows || [];
        return (
            <div onClick={() => setRezPopup(null)} style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
                <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 18, width: "min(440px,96vw)", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <div style={{ fontWeight: 950, fontSize: 16 }}>Rolna {rezPopup.qr} · ko drži metre</div>
                        <button onClick={() => setRezPopup(null)} style={{ ...btn, background: "#f1f5f9", color: "#334155", padding: "6px 12px" }}>Zatvori</button>
                    </div>
                    <div style={{ height: 12, background: "#16a34a", borderRadius: 6, overflow: "hidden", display: "flex", marginBottom: 6 }}>
                        <div style={{ height: "100%", width: (total > 0 ? (rez / total) * 100 : 0) + "%", background: "#f59e0b" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, marginBottom: 12 }}>
                        <span style={{ color: "#15803d" }}>{fmt(slob, 0)} m slobodno</span><span style={{ color: "#a16207" }}>{fmt(rez, 0)} rez. od {fmt(total, 0)}</span>
                    </div>
                    {rezPopup.loading ? <div style={{ color: "#64748b", fontSize: 13, padding: "8px 0" }}>Učitavam…</div> : (
                        rows.length ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                                {rows.map((s, i) => (
                                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: "8px 11px", fontSize: 13 }}>
                                        <span style={{ fontWeight: 800, color: "#0f172a", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.nalog_ref || "—"}{s.sloj ? <span style={{ color: "#64748b", fontWeight: 600 }}> · sloj {s.sloj}</span> : null}</span>
                                        <span style={{ fontWeight: 900, color: "#2446b8", whiteSpace: "nowrap" }}>{fmt(number(s.alocirano_m), 0)} m{number(s.izdato_m) ? ` · izdato ${fmt(number(s.izdato_m), 0)}` : ""}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ fontSize: 13, color: "#475569", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 9, padding: "9px 11px" }}>
                                Nema stavki u „materijal_stavke" za ovu rolnu{rezPopup.dod ? <> — dodeljeno nalogu: <b>{rezPopup.dod}</b></> : "."}<br /><span style={{ color: "#64748b", fontSize: 11.5 }}>(starije rezervacije ili rezervacija van templejta.)</span>
                            </div>
                        )
                    )}
                </div>
            </div>
        );
    })() : null;

    const RezManualModal = rezForm ? (() => {
        const r = rezForm.roll;
        const total = rolnaUkupnoM(r);
        const free = rolnaSlobodnoM(r);
        const m = Math.max(0, number(rezForm.metri));
        const previse = m > free;
        return (
            <div onClick={() => setRezForm(null)} style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
                <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 18, width: "min(440px,96vw)", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
                    <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 2 }}>Ručna rezervacija · {r.qr}</div>
                    <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 12 }}>{r.vrsta} · {rollOznaka(r) || "—"} · {r.sirina} mm{r.debljina ? ` · ${r.debljina}${String(r.vrsta).toUpperCase() === "PAPIR" ? "g" : "µ"}` : ""} · na rolni {fmt(total, 0)} m · <b style={{ color: "#15803d" }}>slobodno {fmt(free, 0)} m</b></div>
                    <label style={{ display: "block", marginBottom: 10 }}><span style={lbl}>Za koji nalog / proizvod</span><input style={input} value={rezForm.ref} onChange={(e) => setRezForm((p) => ({ ...p, ref: e.target.value }))} placeholder="broj naloga ili naziv" /></label>
                    <label style={{ display: "block", marginBottom: 10 }}><span style={lbl}>Metri za rezervaciju</span><input style={{ ...input, borderColor: previse ? "#dc2626" : "#0f766e", background: previse ? "#fef2f2" : "#f0fdfa", fontWeight: 900 }} type="number" value={rezForm.metri} onChange={(e) => setRezForm((p) => ({ ...p, metri: e.target.value }))} /></label>
                    <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
                        <button onClick={() => setRezForm((p) => ({ ...p, metri: String(Math.round(free)) }))} style={{ ...btn, background: "#f1f5f9", color: "#334155", fontSize: 12, padding: "7px 10px" }}>Sve slobodno ({fmt(free, 0)} m)</button>
                    </div>
                    {previse && <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 800, marginBottom: 10 }}>⚠ Slobodno je samo {fmt(free, 0)} m.</div>}
                    <label style={{ display: "block", marginBottom: 14 }}><span style={lbl}>Komentar (opciono)</span><input style={input} value={rezForm.napomena} onChange={(e) => setRezForm((p) => ({ ...p, napomena: e.target.value }))} /></label>
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                        <button onClick={() => setRezForm(null)} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Otkaži</button>
                        <button onClick={potvrdiRucnuRez} disabled={previse || m <= 0} style={{ ...btn, background: previse || m <= 0 ? "#cbd5e1" : "#f59e0b", color: "#fff" }}>🔒 Rezerviši {fmt(m, 0)} m</button>
                    </div>
                </div>
            </div>
        );
    })() : null;

    const OslobodiModal = oslForm ? (() => {
        const r = oslForm.roll;
        const total = rolnaUkupnoM(r);
        const rezSada = oslForm.rezSada;
        const m = Math.max(0, number(oslForm.metri));
        const previse = m > rezSada;
        return (
            <div onClick={() => setOslForm(null)} style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
                <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 18, width: "min(420px,96vw)", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
                    <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 2 }}>Oslobodi rezervaciju · {r.qr}</div>
                    <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 12 }}>Rezervisano sada: <b style={{ color: "#a16207" }}>{fmt(rezSada, 0)} m</b> od {fmt(total, 0)} m{r.dodeljeno_nalogu ? <> · nalog: <b>{r.dodeljeno_nalogu}</b></> : ""}</div>
                    <label style={{ display: "block", marginBottom: 10 }}><span style={lbl}>Metri za oslobađanje</span><input style={{ ...input, borderColor: previse ? "#dc2626" : "#16a34a", background: previse ? "#fef2f2" : "#f0fdf4", fontWeight: 900 }} type="number" value={oslForm.metri} onChange={(e) => setOslForm((p) => ({ ...p, metri: e.target.value }))} /></label>
                    <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
                        <button onClick={() => setOslForm((p) => ({ ...p, metri: String(Math.round(rezSada)) }))} style={{ ...btn, background: "#f1f5f9", color: "#334155", fontSize: 12, padding: "7px 10px" }}>Sve ({fmt(rezSada, 0)} m)</button>
                    </div>
                    {previse && <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 800, marginBottom: 10 }}>⚠ Rezervisano je samo {fmt(rezSada, 0)} m.</div>}
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                        <button onClick={() => setOslForm(null)} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Otkaži</button>
                        <button onClick={potvrdiOslobodi} disabled={m <= 0} style={{ ...btn, background: m <= 0 ? "#cbd5e1" : "#16a34a", color: "#fff" }}>🔓 Oslobodi {fmt(Math.min(m, rezSada), 0)} m</button>
                    </div>
                </div>
            </div>
        );
    })() : null;

    const BulkModal = bulkLabels.length ? (
        <div className="no-print" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,23,42,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <PrintCSS />
            <div style={{ background: "#fff", borderRadius: 18, padding: 18, width: "min(980px,96vw)", maxHeight: "92vh", overflow: "auto", boxShadow: "0 20px 80px rgba(0,0,0,.35)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div><div style={{ fontSize: 18, fontWeight: 900 }}>Bulk QR etikete · {bulkLabels.length} rolni</div><div style={{ fontSize: 12, color: "#64748b" }}>Svaka rolna ide na posebnu etiketu 100×140 mm.</div></div>
                    <div style={{ display: "flex", gap: 8 }}><button onClick={printLabels} style={{ ...btn, background: "#059669", color: "#fff" }}>🖨️ Štampaj sve etikete</button><button onClick={() => setBulkLabels([])} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Zatvori</button></div>
                </div>
                <div className="roll-label-print-root" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100mm, 1fr))", gap: 12 }}>
                    {bulkLabels.map((r) => <RollLabel key={r.qr} roll={r} />)}
                </div>
            </div>
        </div>
    ) : null;

    if (!operater) {
        return (
            <div style={{ minHeight: "100vh", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, color: "#0f172a" }}>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 22, width: "100%", maxWidth: 360 }}>
                    <div style={{ fontWeight: 950, fontSize: 20, marginBottom: 4 }}>🏭 Prijava magacionera</div>
                    <div style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>Uloguj se da bi se u istoriji videlo ko šta radi u magacinu.</div>
                    <label style={{ display: "block", marginBottom: 10 }}><span style={lbl}>Email</span><input style={input} type="email" autoComplete="username" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} /></label>
                    <label style={{ display: "block", marginBottom: 16 }}><span style={lbl}>Šifra</span><input style={input} type="password" autoComplete="current-password" value={loginForm.sifra} onChange={(e) => setLoginForm({ ...loginForm, sifra: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") loginOperater(loginForm.email, loginForm.sifra); }} /></label>
                    <button onClick={() => loginOperater(loginForm.email, loginForm.sifra)} style={{ ...btn, background: "#0f172a", color: "#fff", width: "100%", padding: 12 }}>Prijava</button>
                </div>
            </div>
        );
    }

    if (forceMobile) return MobileShell();

    return (
        <div style={{ padding: 22, background: "#f1f5f9", minHeight: "100vh", color: "#0f172a" }}>
            {LabelModal}{BulkModal}{RezModal}{RezManualModal}{OslobodiModal}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                <div><h1 style={{ margin: 0, fontSize: 28, fontWeight: 950 }}>🏭 Magacin Materijala i Rolni PRO</h1><div style={{ color: "#64748b", marginTop: 4 }}>Baza materijala + unos rolni + automatski obračun kg ⇄ m + predlog rolni za nalog + QR etikete 100×140 mm.</div></div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: "#0369a1", background: "#e0f2fe", borderRadius: 999, padding: "6px 12px" }}>👷 {operater?.ime || "—"}</span>
                    <button onClick={logoutOperater} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Odjava</button>
                    <button onClick={reload} style={{ ...btn, background: "#0f172a", color: "#fff" }}>Osveži</button>
                    {isAdmin && <button onClick={downloadBackup} style={{ ...btn, background: "#dcfce7", color: "#065f46" }}>⬇️ Backup (JSON)</button>}
                    {isAdmin && <button onClick={exportStockCsv} style={{ ...btn, background: "#e0f2fe", color: "#0369a1" }}>⬇️ CSV stanja</button>}
                    {isAdmin && <button onClick={() => { if (adminMode) { setAdminMode(false); } else if (confirm("Uključiti admin režim? Omogućava trajno brisanje rolni sa stanja.")) setAdminMode(true); }} style={{ ...btn, background: adminMode ? "#fde68a" : "#f1f5f9", color: adminMode ? "#92400e" : "#334155" }}>{adminMode ? "🔓 Admin: uključen" : "🔒 Admin"}</button>}
                    {isAdmin && <button onClick={resetWarehouseTestData} style={{ ...btn, background: "#fee2e2", color: "#991b1b" }}>Reset test podataka</button>}
                </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                <button onClick={() => setActiveTab("rolne")} style={tabBtn("rolne")}>🎞️ Stanje rolni</button>
                <button onClick={() => setActiveTab("unos")} style={tabBtn("unos")}>➕ Unos rolni</button>
                <button onClick={() => setActiveTab("creva")} style={tabBtn("creva")}>🧵 Polu-rolne / creva</button>
                <button onClick={() => setActiveTab("materijali")} style={tabBtn("materijali")}>🧱 Baza materijala</button>
                {isAdmin && <button onClick={() => setActiveTab("predlog")} style={tabBtn("predlog")}>🎯 Predlog rolni za nalog</button>}
                <button onClick={() => setActiveTab("istorija")} style={tabBtn("istorija")}>🕘 Istorija</button>
                <button onClick={() => setActiveTab("istorija_povrata")} style={tabBtn("istorija_povrata")}>↩️ Istorija povrata</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
                {[["📦 Materijala", materialMaster.length || materijali.length], ["🎞️ Ukupno rolni", stats.total], ["📏 Ukupno m", fmt(stats.totalM, 0)], ["⚖️ Ukupno kg", fmt(stats.totalKg, 2)], ["🟢 Na stanju", stats.dostupna], ["🟡 Rezervisano", stats.rezervisana], ["💰 Vrednost magacina", `€ ${fmt(stats.totalValue, 2)}`], ["⚠️ Za poručivanje", stats.zaPorucivanje]].map(([a, b]) => {
                    const warn = String(a).includes("Za poručivanje") && Number(b) > 0;
                    return <div key={a} style={{ ...card, ...(warn ? { background: "#fffbeb", border: "1px solid #fcd34d" } : {}) }}><div style={{ color: warn ? "#92400e" : "#64748b", fontSize: 12, fontWeight: 900 }}>{a}</div><div style={{ fontSize: 24, fontWeight: 950, marginTop: 4, ...(warn ? { color: "#b45309" } : {}) }}>{b}</div></div>;
                })}
            </div>

            {stats.zaPorucivanje > 0 && (
                <div style={{ ...card, border: "1px solid #fcd34d", background: "#fffbeb", marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 950, color: "#92400e" }}>⚠️ Za poručivanje ({stats.zaPorucivanje})</div>
                        <div style={{ fontSize: 12, color: "#92400e" }}>Materijali sa stanjem ispod minimalne zalihe (računa se samo roba „Na stanju")</div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead><tr style={{ background: "#fef3c7" }}>{["Materijal", "Proizvođač", "Na stanju kg", "Minimum kg", "Manjak kg"].map((h) => <th key={h} style={{ padding: 9, textAlign: "left", borderBottom: "1px solid #fcd34d", color: "#92400e" }}>{h}</th>)}</tr></thead>
                            <tbody>{stats.ispodMinimuma.map((m) => <tr key={m.id} style={{ borderBottom: "1px solid #fde68a" }}>
                                <td style={{ padding: 9 }}><b>{materialDisplayName(m)}</b></td>
                                <td style={{ padding: 9 }}>{m.proizvodjac || "—"}</td>
                                <td style={{ padding: 9 }}>{fmt(m.naStanju, 2)}</td>
                                <td style={{ padding: 9 }}>{fmt(m.minimum, 0)}</td>
                                <td style={{ padding: 9, color: "#b45309", fontWeight: 900 }}>{fmt(m.manjak, 2)}</td>
                            </tr>)}</tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === "materijali" && <MaterialsTab {...{ card, input, btn, lbl, matFilter, setMatFilter, materialMaster, materialPrices, saveMaterialMaster, deleteMaterialMaster, loadMaterialMaster, materialDropdowns }} />}

            {activeTab === "unos" && (
                <div style={{ display: "grid", gap: 14 }}>
                    <div style={{ ...card, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                        <div>
                            <div style={{ fontWeight: 950, fontSize: 18 }}>Unos rolni</div>
                            <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>Jedna kartica za ručni unos, packing listu PDF i packing listu Excel.</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button onClick={() => setInputMode("rucno")} style={{ ...btn, background: inputMode === "rucno" ? "#0f172a" : "#f8fafc", color: inputMode === "rucno" ? "#fff" : "#334155" }}>Ručni unos</button>
                            <button onClick={() => setInputMode("pdf")} style={{ ...btn, background: inputMode === "pdf" ? "#0f172a" : "#f8fafc", color: inputMode === "pdf" ? "#fff" : "#334155" }}>Packing lista PDF</button>
                            <button onClick={() => setInputMode("excel")} style={{ ...btn, background: inputMode === "excel" ? "#0f172a" : "#f8fafc", color: inputMode === "excel" ? "#fff" : "#334155" }}>Packing lista Excel</button>
                            <button onClick={() => setInputMode("kasirano")} style={{ ...btn, background: inputMode === "kasirano" ? "#0f172a" : "#f8fafc", color: inputMode === "kasirano" ? "#fff" : "#334155" }}>🧩 Kaširana (spoj)</button>
                        </div>
                    </div>
                    {inputMode === "rucno" ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
                            <div style={card}>
                                <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 6 }}>Ručni unos rolne</div><div style={{ color: "#64748b", fontSize: 12, marginBottom: 12 }}>Unos je poređan logikom: vrsta → pod vrsta → oznaka → debljina → dimenzije → m/kg obračun.</div>
                                <div style={{ display: "grid", gap: 10 }}>
                                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: 12 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
                                            <div style={{ fontWeight: 950 }}>🧠 Material Master izbor</div>
                                            {selectedMasterMaterial
                                                ? <span style={{ fontSize: 11, fontWeight: 900, color: "#065f46", background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: 999, padding: "3px 10px" }}>✅ Postoji u bazi</span>
                                                : <span style={{ fontSize: 11, fontWeight: 900, color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 999, padding: "3px 10px" }}>🆕 Nova kombinacija</span>}
                                        </div>
                                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>Biraj iz liste ili otkucaj novu vrednost. Ako kombinacija ne postoji, unesi koeficijent i sačuvaj je u Material master.</div>
                                        <datalist id="dl-vrste">{masterVrste.map((v) => <option key={v} value={v} />)}</datalist>
                                        <datalist id="dl-podvrste">{masterPodVrste.map((v) => <option key={v} value={v} />)}</datalist>
                                        <datalist id="dl-oznake">{masterOznake.map((o) => <option key={o} value={o} />)}</datalist>
                                        <datalist id="dl-debljine">{masterDebljine.map((d) => <option key={d} value={d} />)}</datalist>
                                        <datalist id="dl-proizvodjaci">{masterProizvodjaci.map((p) => <option key={p} value={p} />)}</datalist>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 10 }}>
                                            <label><span style={lbl}>Vrsta</span><input style={input} list="dl-vrste" value={materialPick.vrsta} onChange={(e) => setMaterialPick((p) => ({ ...p, vrsta: e.target.value.toUpperCase(), pod_vrsta: "", oznaka: "" }))} placeholder="npr. BOPP" /></label>
                                            <label><span style={lbl}>Pod vrsta</span><input style={input} list="dl-podvrste" value={materialPick.pod_vrsta || ""} onChange={(e) => setMaterialPick((p) => ({ ...p, pod_vrsta: e.target.value, oznaka: "" }))} placeholder="npr. Transparent" /></label>
                                            <label><span style={lbl}>Oznaka</span><input style={input} list="dl-oznake" value={materialPick.oznaka || ""} onChange={(e) => setMaterialPick((p) => ({ ...p, oznaka: e.target.value }))} placeholder="npr. FXC" /></label>
                                            <label><span style={lbl}>{materialPick.vrsta === "PAPIR" ? "Gramatura" : "Debljina"}</span><input style={input} type="number" step="0.01" list="dl-debljine" value={materialPick.debljina || ""} onChange={(e) => setMaterialPick((p) => ({ ...p, debljina: Number(e.target.value) }))} placeholder={materialPick.vrsta === "PAPIR" ? "g/m²" : "µ"} /></label>
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 10, marginTop: 10 }}>
                                            <label><span style={lbl}>Proizvođač</span><input style={input} list="dl-proizvodjaci" value={materialPick.proizvodjac || ""} onChange={(e) => setMaterialPick({ ...materialPick, proizvodjac: e.target.value })} placeholder="Izaberi ili upiši" /></label>
                                            <label><span style={lbl}>Koeficijent</span><input style={input} type="number" step="0.001" value={materialPick.koeficijent} onChange={(e) => setMaterialPick({ ...materialPick, koeficijent: e.target.value })} placeholder={String(mmKoeficijent(materialPick.vrsta) || "npr. 0.91")} /></label>
                                            <label><span style={lbl}>Cena €/kg</span><input style={input} type="number" value={materialPick.cenaKg} onChange={(e) => setMaterialPick({ ...materialPick, cenaKg: e.target.value })} /></label>
                                        </div>
                                        {!selectedMasterMaterial && (
                                            <div style={{ marginTop: 10, padding: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12 }}>
                                                <div style={{ fontWeight: 900, color: "#92400e", marginBottom: 6 }}>Ova kombinacija još nije u Material master bazi</div>
                                                <div style={{ fontSize: 12, color: "#92400e", marginBottom: 10 }}>{materialPick.vrsta || "?"} · {materialPick.pod_vrsta || "?"} · {materialPick.oznaka || "?"} · {materialPick.debljina || "?"}{materialPick.vrsta === "PAPIR" ? " g/m²" : "µ"} — koeficijent <b>{selectedMat.koeficijent || "—"}</b></div>
                                                <button
                                                    onClick={() => saveMaterialMaster({ vrsta: materialPick.vrsta, pod_vrsta: materialPick.pod_vrsta, oznaka: materialPick.oznaka, proizvodjac: materialPick.proizvodjac, debljina: materialPick.debljina, koeficijent: number(materialPick.koeficijent) || selectedMat.koeficijent, gsm: liveGsm, cenaKg: materialPick.cenaKg })}
                                                    disabled={!materialPick.vrsta || !materialPick.pod_vrsta || !materialPick.oznaka || !Number(materialPick.debljina)}
                                                    style={{ ...btn, background: (materialPick.vrsta && materialPick.pod_vrsta && materialPick.oznaka && Number(materialPick.debljina)) ? "#059669" : "#cbd5e1", color: "#fff", width: "100%", padding: 11 }}>
                                                    💾 Sačuvaj novu kombinaciju u Material master
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ background: "#ecfeff", border: "1px solid #67e8f9", borderRadius: 12, padding: 12, fontSize: 13 }}>
                                        <b>{selectedMat.komercijalnaOznaka}</b><br />
                                        Vrsta: {selectedMat.vrsta} · Pod vrsta: {selectedMat.pod_vrsta || "—"} · Oznaka: {materialPick.oznaka} · Proizvođač: {selectedMat.proizvodjac || "—"} · Koef: {selectedMat.koeficijent || "—"} · g/m²: {fmt(liveGsm, 2)} · Cena: {selectedMat.cenaKg ? `€ ${fmt(selectedMat.cenaKg, 2)}/kg` : "—"}
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 10 }}>
                                        <label><span style={lbl}>Širina rolne mm</span><input style={input} type="number" value={form.sirina} onChange={(e) => syncFormByMode({ sirina: e.target.value })} /></label>
                                        <label><span style={lbl}>Smer obračuna</span><select style={input} value={calcMode} onChange={(e) => setCalcMode(e.target.value)}><option value="m_to_kg">Unos m → računaj kg</option><option value="kg_to_m">Unos kg → računaj m</option><option value="precnik">📐 Po prečniku (nemam m/kg)</option></select></label>
                                        <label><span style={lbl}>Metara</span><input style={input} type="number" value={form.duzina} readOnly={calcMode === "precnik"} onChange={(e) => syncFormByMode({ duzina: e.target.value })} /></label>
                                        <label><span style={lbl}>Kilograma</span><input style={input} type="number" value={form.kg} readOnly={calcMode === "precnik"} onChange={(e) => syncFormByMode({ kg: e.target.value })} /></label>
                                        {calcMode === "precnik" && (<>
                                            <label><span style={lbl}>Spoljni prečnik mm</span><input style={input} type="number" value={precnikForm.spoljniPrecnik} onChange={(e) => syncByDiameter({ spoljniPrecnik: e.target.value })} placeholder="npr. 320" /></label>
                                            <label><span style={lbl}>Hilzna (tulac)</span><select style={input} value={precnikForm.hilzna} onChange={(e) => syncByDiameter({ hilzna: e.target.value })}><option value="FI76">FI 76</option><option value="FI152">FI 152</option></select></label>
                                        </>)}
                                        <label><span style={lbl}>Lot / šarža</span><input style={input} value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} /></label>
                                        <label><span style={lbl}>Lokacija</span><input style={input} value={form.lokacija} onChange={(e) => setForm({ ...form, lokacija: e.target.value })} /></label>
                                        <label><span style={lbl}>Datum proizvodnje rolne</span><input style={input} type="text" inputMode="numeric" placeholder="DD.MM.GGGG ili GGGG-MM-DD" value={form.datum_proizvodnje} onChange={(e) => setForm({ ...form, datum_proizvodnje: e.target.value })} /></label>
                                        <label style={{ gridColumn: "1 / -1" }}><span style={lbl}>Napomena</span><input style={input} value={form.napomena} onChange={(e) => setForm({ ...form, napomena: e.target.value })} /></label>
                                    </div>
                                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ fontWeight: 900 }}>Live obračun</div><div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>kg = širina(m) × dužina(m) × g/m² / 1000</div><div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><div><b>{fmt(calcMode === "m_to_kg" ? calculatedKg : number(form.kg), 2)} kg</b></div><div><b>{fmt(calcMode === "kg_to_m" ? calculatedM : number(form.duzina), 0)} m</b></div></div></div>
                                    <button onClick={addRoll} style={{ ...btn, background: "#059669", color: "#fff", padding: "13px" }}>+ Dodaj rolnu i generiši QR</button>
                                </div>
                            </div>
                            <div style={card}><div style={{ fontWeight: 900, marginBottom: 12 }}>Šta se upisuje na rolnu</div><div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(140px, 1fr))", gap: 10 }}>{[["Vrsta", selectedMat?.vrsta], ["Oznaka materijala", cleanOznaka(selectedMat?.oznaka || materialPick.oznaka || selectedMat?.komercijalnaOznaka, selectedMat?.vrsta)], ["Pod vrsta", form.pod_vrsta || "—"], ["Proizvođač", selectedMat?.proizvodjac || "—"], ["Debljina", selectedMat?.debljina ? `${selectedMat.debljina} µ` : "—"], ["Širina", `${form.sirina || 0} mm`], ["g/m²", fmt(liveGsm, 2)], ["Metara", fmt(calcMode === "kg_to_m" ? calculatedM : form.duzina, 0)], ["Kilograma", fmt(calcMode === "m_to_kg" ? calculatedKg : form.kg, 2)], ["Datum proizvodnje", form.datum_proizvodnje || "—"]].map(([a, b]) => <div key={a} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>{a}</div><div style={{ fontWeight: 900, marginTop: 3 }}>{b}</div></div>)}</div></div>
                        </div>

                    ) : inputMode === "kasirano" ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
                            <div style={card}>
                                <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 6 }}>🧩 Kaširana (spojena) rolna</div>
                                <div style={{ color: "#64748b", fontSize: 12, marginBottom: 12 }}>Spoj 2–4 sloja iz Material master baze. Sastav i ukupni g/m² se računaju automatski; kg ide po zbiru slojeva + lepak.</div>
                                <datalist id="kas-vrste">{masterVrste.map((v) => <option key={v} value={v} />)}</datalist>
                                <div style={{ display: "grid", gap: 10 }}>
                                    {kasiranoLayers.map((l, i) => {
                                        const podOpts = kasPodVrste(l.vrsta);
                                        const oznOpts = kasOznake(l.vrsta, l.pod_vrsta);
                                        const debOpts = kasDebljine(l.vrsta, l.pod_vrsta, l.oznaka);
                                        return <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                                                <div style={{ fontWeight: 900 }}>Sloj {i + 1}</div>
                                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                    <span style={{ fontSize: 12, color: "#0e7490", background: "#ecfeff", border: "1px solid #67e8f9", borderRadius: 8, padding: "3px 8px" }}>{fmt(kasLayerGsm(l), 2)} g/m²</span>
                                                    {kasiranoLayers.length > 2 && <button onClick={() => removeKasLayer(i)} style={{ ...btn, background: "#fee2e2", color: "#991b1b", padding: "4px 10px" }}>Ukloni</button>}
                                                </div>
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(130px, 1fr))", gap: 8 }}>
                                                <label><span style={lbl}>Vrsta</span><input style={input} list="kas-vrste" value={l.vrsta} onChange={(e) => setKasLayer(i, { vrsta: e.target.value.toUpperCase(), pod_vrsta: "", oznaka: "" })} /></label>
                                                <label><span style={lbl}>Pod vrsta</span><input style={input} list={`kas-pod-${i}`} value={l.pod_vrsta || ""} onChange={(e) => setKasLayer(i, { pod_vrsta: e.target.value, oznaka: "" })} /><datalist id={`kas-pod-${i}`}>{podOpts.map((v) => <option key={v} value={v} />)}</datalist></label>
                                                <label><span style={lbl}>Oznaka</span><input style={input} list={`kas-ozn-${i}`} value={l.oznaka || ""} onChange={(e) => setKasLayer(i, { oznaka: e.target.value })} /><datalist id={`kas-ozn-${i}`}>{oznOpts.map((v) => <option key={v} value={v} />)}</datalist></label>
                                                <label><span style={lbl}>{String(l.vrsta).toUpperCase() === "PAPIR" ? "Gramatura" : "Debljina µ"}</span><input style={input} type="number" step="0.01" list={`kas-deb-${i}`} value={l.debljina || ""} onChange={(e) => setKasLayer(i, { debljina: Number(e.target.value) })} /><datalist id={`kas-deb-${i}`}>{debOpts.map((d) => <option key={d} value={d} />)}</datalist></label>
                                            </div>
                                        </div>;
                                    })}
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                                        {kasiranoLayers.length < 4 && <button onClick={addKasLayer} style={{ ...btn, background: "#dbeafe", color: "#1d4ed8" }}>+ Dodaj sloj</button>}
                                        <label style={{ flex: "0 0 220px" }}><span style={lbl}>Lepak g/m² po spoju</span><input style={input} type="number" step="0.1" value={kasiranoLepak} onChange={(e) => setKasiranoLepak(e.target.value)} /></label>
                                    </div>
                                    <div style={{ background: "#ecfeff", border: "1px solid #67e8f9", borderRadius: 12, padding: 12, fontSize: 13 }}>
                                        <b>{compositeName || "—"}</b><br />
                                        Slojeva: {kasiranoLayers.length} ({Math.max(0, kasiranoLayers.length - 1)} spoja) · Ukupna debljina: {fmt(compositeDebljina, 2)} µ · Ukupni g/m²: <b>{fmt(compositeGsm, 2)}</b>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: 10 }}>
                                        <label><span style={lbl}>Širina rolne mm</span><input style={input} type="number" value={form.sirina} onChange={(e) => syncKasirano({ sirina: e.target.value })} /></label>
                                        <label><span style={lbl}>Smer obračuna</span><select style={input} value={calcMode} onChange={(e) => setCalcMode(e.target.value)}><option value="m_to_kg">Unos m → računaj kg</option><option value="kg_to_m">Unos kg → računaj m</option></select></label>
                                        <label><span style={lbl}>Metara</span><input style={input} type="number" value={form.duzina} onChange={(e) => syncKasirano({ duzina: e.target.value })} /></label>
                                        <label><span style={lbl}>Kilograma</span><input style={input} type="number" value={form.kg} onChange={(e) => syncKasirano({ kg: e.target.value })} /></label>
                                        <label><span style={lbl}>Lot / šarža</span><input style={input} value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} /></label>
                                        <label><span style={lbl}>Lokacija</span><input style={input} value={form.lokacija} onChange={(e) => setForm({ ...form, lokacija: e.target.value })} /></label>
                                        <label><span style={lbl}>Datum proizvodnje</span><input style={input} type="text" inputMode="numeric" placeholder="DD.MM.GGGG ili GGGG-MM-DD" value={form.datum_proizvodnje} onChange={(e) => setForm({ ...form, datum_proizvodnje: e.target.value })} /></label>
                                        <label style={{ gridColumn: "1 / -1" }}><span style={lbl}>Napomena</span><input style={input} value={form.napomena} onChange={(e) => setForm({ ...form, napomena: e.target.value })} /></label>
                                    </div>
                                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ fontWeight: 900 }}>Live obračun (spoj)</div><div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>kg = širina(m) × dužina(m) × (Σ g/m² slojeva + lepak) / 1000</div><div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><div><b>{fmt(calcMode === "m_to_kg" ? kasiranoKg : number(form.kg), 2)} kg</b></div><div><b>{fmt(calcMode === "kg_to_m" ? kasiranoM : number(form.duzina), 0)} m</b></div></div></div>
                                    <button onClick={addCompositeRoll} style={{ ...btn, background: "#059669", color: "#fff", padding: "13px" }}>+ Dodaj kaširanu rolnu i generiši QR</button>
                                </div>
                            </div>
                            <div style={card}><div style={{ fontWeight: 900, marginBottom: 12 }}>Šta se upisuje na rolnu</div><div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: 10 }}>{[["Vrsta", compositeVrste || "—"], ["Sastav", compositeName || "—"], ["Slojeva", `${kasiranoLayers.length}`], ["Ukupna debljina", `${fmt(compositeDebljina, 2)} µ`], ["Ukupni g/m²", fmt(compositeGsm, 2)], ["Širina", `${form.sirina || 0} mm`], ["Metara", fmt(calcMode === "kg_to_m" ? kasiranoM : form.duzina, 0)], ["Kilograma", fmt(calcMode === "m_to_kg" ? kasiranoKg : form.kg, 2)]].map(([a, b]) => <div key={a} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>{a}</div><div style={{ fontWeight: 900, marginTop: 3 }}>{b}</div></div>)}</div></div>
                        </div>
                    ) : (
                        <ImportPackingTab {...{ card, input, btn, lbl, packingText, setPackingText, packingRows, setPackingRows, handlePackingFile, parseTextPackingList, importPackingRows, inputMode, materialDropdowns, materialMaster }} />
                    )}
                </div>
            )}

            {activeTab === "rolne" && (
                <div style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                        <div><div style={{ fontWeight: 900 }}>Stanje rolni</div><div style={{ fontSize: 12, color: "#64748b" }}>Izabrano: <b>{selectedRolls.length}</b> rolni</div></div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <button onClick={selectAllFiltered} style={{ ...btn, background: "#e0f2fe", color: "#0369a1" }}>Izaberi filtrirane</button>
                            <button onClick={clearSelection} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Poništi izbor</button>
                            <button onClick={openBulkLabels} style={{ ...btn, background: "#059669", color: "#fff" }}>🖨️ Štampaj izabrane QR etikete</button>
                            {adminMode && <button onClick={deleteAllStockRolls} style={{ ...btn, background: "#991b1b", color: "#fff" }}>🗑️ Obriši sve sa stanja</button>}
                            <input style={{ ...input, maxWidth: 390 }} placeholder="Globalna pretraga..." value={filter} onChange={(e) => setFilter(e.target.value)} />
                        </div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: "#f8fafc" }}>{["", "QR", "Datum ulaza", "Datum proiz.", "Vrsta", "Pod vrsta", "Oznaka", "Proizvođač", "Deb.", "Širina", "m", "kg", "Lot", "Lokacija", "Status", "Napomena", "Akcije"].map(h => <th key={h} style={{ padding: 9, textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr>
                                <tr style={{ background: "#fff" }}>
                                    <th style={filterTh}></th><th style={filterTh}></th>
                                    <th style={filterTh}><input style={smallInput} value={columnFilters.datum} onChange={(e) => setColFilter("datum", e.target.value)} placeholder="Datum" /></th>
                                    <th style={filterTh}><input style={smallInput} value={columnFilters.datum_proizvodnje} onChange={(e) => setColFilter("datum_proizvodnje", e.target.value)} placeholder="Dat. proiz." /></th>
                                    <th style={filterTh}><input style={smallInput} value={columnFilters.vrsta} onChange={(e) => setColFilter("vrsta", e.target.value)} placeholder="Vrsta" /></th>
                                    <th style={filterTh}><input style={smallInput} value={columnFilters.pod_vrsta} onChange={(e) => setColFilter("pod_vrsta", e.target.value)} placeholder="Pod vrsta" /></th>
                                    <th style={filterTh}><input style={smallInput} value={columnFilters.oznaka} onChange={(e) => setColFilter("oznaka", e.target.value)} placeholder="Oznaka" /></th>
                                    <th style={filterTh}><input style={smallInput} value={columnFilters.proizvodjac} onChange={(e) => setColFilter("proizvodjac", e.target.value)} placeholder="Proizvođač" /></th>
                                    <th style={filterTh}><input style={smallInput} value={columnFilters.debljina} onChange={(e) => setColFilter("debljina", e.target.value)} placeholder="Deb." /></th>
                                    <th style={filterTh}><input style={smallInput} value={columnFilters.sirina} onChange={(e) => setColFilter("sirina", e.target.value)} placeholder="Širina" /></th>
                                    <th style={filterTh}><input style={smallInput} value={columnFilters.duzina} onChange={(e) => setColFilter("duzina", e.target.value)} placeholder="m" /></th>
                                    <th style={filterTh}><input style={smallInput} value={columnFilters.kg} onChange={(e) => setColFilter("kg", e.target.value)} placeholder="kg" /></th>
                                    <th style={filterTh}><input style={smallInput} value={columnFilters.lot} onChange={(e) => setColFilter("lot", e.target.value)} placeholder="Lot" /></th>
                                    <th style={filterTh}><input style={smallInput} value={columnFilters.lokacija} onChange={(e) => setColFilter("lokacija", e.target.value)} placeholder="Lokacija" /></th>
                                    <th style={filterTh}><select style={smallInput} value={columnFilters.status} onChange={(e) => setColFilter("status", e.target.value)}><option value="">Svi</option><option value="Na stanju">Na stanju</option><option value="Rezervisano">Rezervisano</option><option value="Iskorišćeno">Iskorišćeno</option><option value="formatirana">formatirana</option><option value="blokirana">blokirana</option></select></th>
                                    <th style={filterTh}></th>
                                    <th style={filterTh}><button onClick={() => { setFilter(""); setColumnFilters({ datum: "", datum_proizvodnje: "", vrsta: "", pod_vrsta: "", oznaka: "", proizvodjac: "", debljina: "", sirina: "", duzina: "", kg: "", lot: "", lokacija: "", status: "" }); }} style={{ ...btn, padding: "7px 9px", background: "#f1f5f9" }}>Reset</button></th>
                                </tr>
                            </thead>
                            <tbody>{pagedRolls.map((r) => <tr key={r.qr}>
                                <td style={cell}><input type="checkbox" checked={selectedRolls.includes(r.qr)} onChange={() => toggleSelected(r.qr)} /></td>
                                <td style={{ ...cell, fontWeight: 900 }}>{r.qr}{crevoLabel(r) && <span style={CREVO_BADGE}>{crevoLabel(r)}</span>}</td><td style={cell}>{r.datum_ulaza || r.datum || "—"}</td><td style={cell}>{formatDateLabel(r.datum_proizvodnje) || "—"}</td><td style={cell}>{r.vrsta}</td><td style={cell}>{r.pod_vrsta || "—"}</td><td style={cell}>{rollOznaka(r) || "—"}</td><td style={cell}>{r.proizvodjac || "—"}</td><td style={cell}>{r.debljina || "—"}</td><td style={cell}>{r.sirina} mm</td><td style={cell}>{fmt(r.duzina, 0)}</td><td style={cell}>{fmt(r.kg, 2)}</td><td style={cell}>{r.lot || "—"}</td><td style={cell}>{r.lokacija}</td><td style={cell}>{rezBarCell(r)}</td>
                                <td style={{ ...cell, maxWidth: 220, whiteSpace: "normal", color: "#475569" }}>{r.napomena || "—"}</td>
                                <td style={cell}><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button onClick={() => setLabelRoll(r)} style={{ ...btn, background: "#dbeafe", color: "#1d4ed8" }}>QR / Etiketa</button><button onClick={() => reserveForMaster(r)} style={{ ...btn, background: "#fef3c7", color: "#92400e" }}>Rezerviši</button>{rolnaRezM(r) > 0 && <button onClick={() => oslobodiRez(r)} style={{ ...btn, background: "#dcfce7", color: "#15803d" }}>Oslobodi</button>}<button onClick={() => consumeRoll(r)} style={{ ...btn, background: "#fee2e2", color: "#991b1b" }}>Skini m</button><button onClick={() => povratRolne(r)} style={{ ...btn, background: "#e0f2fe", color: "#075985" }}>↩️ Povrat</button><button onClick={() => changeStatus(r, "Na stanju")} style={{ ...btn, background: "#dcfce7", color: "#166534" }}>Na stanju</button>{adminMode && normalizeStatus(r.status) === "dostupna" && <button onClick={() => deleteRoll(r)} style={{ ...btn, background: "#991b1b", color: "#fff" }}>🗑️ Obriši</button>}</div></td>
                            </tr>)}</tbody>
                        </table>
                        {filteredRolls.length === 0 && <div style={{ textAlign: "center", padding: 24, color: "#64748b" }}>Nema rolni za prikaz.</div>}
                        <Pager page={rollPageC} pages={rollPages} onGo={setRollPage} info={filteredRolls.length + " rolni" + (filter ? " (filtrirano)" : "") + " · prikaz " + (filteredRolls.length ? (rollPageC - 1) * PER_PAGE + 1 : 0) + "–" + Math.min(rollPageC * PER_PAGE, filteredRolls.length)} />
                    </div>
                </div>
            )}


            {activeTab === "predlog" && <PredlogTab {...{ card, input, btn, lbl, req, setReq, createReservationRequest, suggestedRolls, reserveForMaster }} />}
            {activeTab === "creva" && crevoView}

            {activeTab === "istorija" && <div style={card}><div style={{ fontWeight: 900, marginBottom: 10 }}>Istorija rolni</div>{history.length === 0 ? <div style={{ color: "#64748b" }}>Još nema istorije.</div> : <>{pagedHistory.map((h, i) => <div key={i} style={{ borderTop: "1px solid #e2e8f0", padding: "9px 0", fontSize: 13 }}><b>{h.vreme}</b> · <span style={{ color: "#0369a1", fontWeight: 900 }}>👷 {h.operater || "—"}</span> · <b>{h.qr}</b> · {h.event} · {h.opis}</div>)}<Pager page={histPageC} pages={histPages} onGo={setHistPage} info={(history ? history.length : 0) + " zapisa · prikaz " + (history && history.length ? (histPageC - 1) * PER_PAGE + 1 : 0) + "–" + Math.min(histPageC * PER_PAGE, history ? history.length : 0)} /></>}</div>}

            {activeTab === "istorija_povrata" && <div style={card}><div style={{ fontWeight: 900, marginBottom: 10 }}>↩️ Istorija povrata u magacin</div><input value={povratSearch} onChange={(e) => setPovratSearch(e.target.value)} placeholder="Filter po broju rolne (ROLNA-2026…)" style={{ ...input, maxWidth: 360, marginBottom: 12 }} />{povratHistory.length === 0 ? <div style={{ color: "#64748b" }}>Nema povrata{povratSearch ? " za tu pretragu" : ""}.</div> : <>{pagedPovrat.map((h, i) => <div key={i} style={{ borderTop: "1px solid #e2e8f0", padding: "9px 0", fontSize: 13 }}><b>{h.vreme}</b> · <span style={{ color: "#0369a1", fontWeight: 900 }}>👷 {h.operater || "—"}</span> · <b>{h.qr}</b> · {h.event} · {h.opis}</div>)}<Pager page={povratPageC} pages={povratPages} onGo={setPovratPage} info={povratHistory.length + " povrata · prikaz " + (povratHistory.length ? (povratPageC - 1) * PER_PAGE + 1 : 0) + "–" + Math.min(povratPageC * PER_PAGE, povratHistory.length)} /></>}</div>}
        </div>
    );
}
const cell = { padding: 9, borderBottom: "1px solid #f1f5f9" };
const filterTh = { padding: 6, borderBottom: "1px solid #e2e8f0" };


function ImportPackingTab({ card, input, btn, lbl, packingText, setPackingText, packingRows, setPackingRows, handlePackingFile, parseTextPackingList, importPackingRows, inputMode, materialDropdowns = FALLBACK_MATERIAL_DROPDOWNS, materialMaster = [] }) {
    const dropdowns = {
        vrste: materialMaster.length ? uniqMaterialValues(materialMaster, "vrsta", []) : (materialDropdowns.vrste || FALLBACK_MATERIAL_DROPDOWNS.vrste),
        podVrste: materialDropdowns.podVrste || FALLBACK_MATERIAL_DROPDOWNS.podVrste,
        oznake: materialDropdowns.oznake || FALLBACK_MATERIAL_DROPDOWNS.oznake,
        debljine: materialDropdowns.debljine || FALLBACK_MATERIAL_DROPDOWNS.debljine,
        proizvodjaci: materialDropdowns.proizvodjaci || FALLBACK_MATERIAL_DROPDOWNS.proizvodjaci,
    };
    const getRowOptions = (row = {}) => {
        if (!materialMaster.length) return dropdowns;
        const vrsta = row.vrsta || "";
        const pod = row.pod_vrsta || "";
        const ozn = row.oznaka_materijala || row.komercijalnaOznaka || "";
        const rowsByVrsta = materialMaster.filter((x) => !vrsta || x.vrsta === vrsta);
        const rowsByPod = rowsByVrsta.filter((x) => !pod || x.pod_vrsta === pod);
        const rowsByOzn = rowsByPod.filter((x) => !ozn || x.oznaka === ozn);
        return {
            vrste: uniqMaterialValues(materialMaster, "vrsta", []),
            podVrste: uniqMaterialValues(rowsByVrsta, "pod_vrsta", []),
            oznake: uniqMaterialValues(rowsByPod, "oznaka", []),
            debljine: uniqSorted(rowsByOzn.map((x) => Number(x.debljina)).filter((x) => Number.isFinite(x)), []),
            proizvodjaci: uniqMaterialValues(rowsByOzn, "proizvodjac", dropdowns.proizvodjaci),
        };
    };
    const applyMasterToRow = (row = {}) => {
        const found = findBestMasterMaterial(row, materialMaster);
        if (!found) return row;
        return {
            ...row,
            vrsta: found.vrsta,
            pod_vrsta: found.pod_vrsta,
            oznaka_materijala: found.oznaka,
            komercijalnaOznaka: found.oznaka,
            proizvodjac: row.proizvodjac || found.proizvodjac,
            debljina: found.debljina,
            koeficijent: found.koeficijent,
            gsm: found.gsm,
        };
    };
    const updateRow = (index, patch) => {
        setPackingRows((prev) => prev.map((row, i) => {
            if (i !== index) return row;
            let next = { ...row, ...patch };
            if (Object.prototype.hasOwnProperty.call(patch, "vrsta")) next = { ...next, pod_vrsta: "", oznaka_materijala: "", komercijalnaOznaka: "", debljina: "" };
            if (Object.prototype.hasOwnProperty.call(patch, "pod_vrsta")) next = { ...next, oznaka_materijala: "", komercijalnaOznaka: "", debljina: "" };
            if (Object.prototype.hasOwnProperty.call(patch, "oznaka_materijala") || Object.prototype.hasOwnProperty.call(patch, "komercijalnaOznaka")) next = { ...next, debljina: "" };
            return applyMasterToRow(next);
        }));
    };
    const compactInput = { ...input, minWidth: 92, padding: "7px 8px", fontSize: 12 };
    return <div style={{ display: "grid", gridTemplateColumns: "430px 1fr", gap: 16 }}>
        <div style={card}>
            <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 6 }}>📥 {inputMode === "pdf" ? "Packing lista PDF" : "Packing lista Excel"}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>{inputMode === "pdf" ? "PDF se čita automatski za Plastchim, Taghleef, Inter Gradex, Rossella i Sumilon formate (uz automatski OCR za skenirane/oštećene PDF-ove). Ako format nije prepoznat, nalepi tekst ispod." : "Podržano: Excel .xlsx/.xls, CSV i TXT packing liste."}</div>
            <label><span style={lbl}>{inputMode === "pdf" ? "PDF fajl / tekst packing liste" : "Excel / CSV / TXT fajl"}</span><input style={input} type="file" accept=".xlsx,.xls,.csv,.txt,.pdf" onChange={handlePackingFile} /></label>
            <div style={{ marginTop: 12 }}><span style={lbl}>Tekst iz PDF/packing liste</span><textarea style={{ ...input, minHeight: 190, fontFamily: "monospace" }} value={packingText} onChange={(e) => setPackingText(e.target.value)} /></div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={parseTextPackingList} style={{ ...btn, background: "#dbeafe", color: "#1d4ed8" }}>Prepoznaj redove</button>
                <button onClick={importPackingRows} style={{ ...btn, background: "#059669", color: "#fff" }}>Ubaci pronađene rolne u magacin</button>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>Pre unosa možeš ručno korigovati Vrstu, Pod vrstu, Oznaku, Proizvođača i Debljinu iz centralnih SQL dropdown lista.</div>
        </div>
        <div style={card}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Prepoznati redovi · {packingRows.length}</div>
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: "#f8fafc" }}>{["Vrsta", "Pod vrsta", "Oznaka", "Proizvođač", "Deb.", "Širina", "m", "kg", "Lot", "Lokacija", "Datum proiz.", "Napomena"].map(h => <th key={h} style={{ padding: 9, textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
                <tbody>{packingRows.map((r, i) => {
                    const opts = getRowOptions(r);
                    const withVal = (arr, val) => { const a = Array.isArray(arr) ? arr : []; return (val !== "" && val != null && !a.map(String).includes(String(val))) ? [val, ...a] : a; };
                    return <tr key={i}>
                        <td style={cell}><select style={compactInput} value={r.vrsta || ""} onChange={(e) => updateRow(i, { vrsta: e.target.value })}><option value="">—</option>{withVal(opts.vrste, r.vrsta).map((v) => <option key={v} value={v}>{v}</option>)}</select></td>
                        <td style={cell}><select style={compactInput} value={r.pod_vrsta || ""} onChange={(e) => updateRow(i, { pod_vrsta: e.target.value })}><option value="">—</option>{withVal(opts.podVrste, r.pod_vrsta).map((v) => <option key={v} value={v}>{v}</option>)}</select></td>
                        <td style={cell}><select style={compactInput} value={r.oznaka_materijala || r.komercijalnaOznaka || ""} onChange={(e) => updateRow(i, { oznaka_materijala: e.target.value, komercijalnaOznaka: e.target.value })}><option value="">—</option>{withVal(opts.oznake, r.oznaka_materijala || r.komercijalnaOznaka).map((v) => <option key={v} value={v}>{v}</option>)}</select></td>
                        <td style={cell}><input style={{ ...compactInput, minWidth: 130 }} list="row-proizvodjaci" value={r.proizvodjac || ""} onChange={(e) => updateRow(i, { proizvodjac: e.target.value })} placeholder="Lista ili novi" /><datalist id="row-proizvodjaci">{[...new Set([...((materialMaster || []).map((m) => m.proizvodjac)), ...((materialDropdowns && materialDropdowns.proizvodjaci) || []), ...(opts.proizvodjaci || [])])].filter(Boolean).map((v) => <option key={v} value={v} />)}</datalist></td>
                        <td style={cell}><select style={compactInput} value={String(r.debljina || "")} onChange={(e) => updateRow(i, { debljina: Number(e.target.value) })}><option value="">—</option>{withVal(opts.debljine, r.debljina).map((v) => <option key={v} value={v}>{v}</option>)}</select></td>
                        <td style={cell}><input style={compactInput} type="number" value={r.sirina || ""} onChange={(e) => updateRow(i, { sirina: e.target.value })} /></td>
                        <td style={cell}><input style={compactInput} type="number" value={r.duzina || ""} onChange={(e) => updateRow(i, { duzina: e.target.value })} /></td>
                        <td style={cell}><input style={compactInput} type="number" value={r.kg || ""} onChange={(e) => updateRow(i, { kg: e.target.value })} /></td>
                        <td style={cell}><input style={{ ...compactInput, minWidth: 120 }} value={r.lot || ""} onChange={(e) => updateRow(i, { lot: e.target.value })} /></td>
                        <td style={cell}><input style={{ ...compactInput, minWidth: 120 }} value={r.lokacija || ""} onChange={(e) => updateRow(i, { lokacija: e.target.value })} placeholder="A-01-A-01" /></td>
                        <td style={cell}><input style={{ ...compactInput, minWidth: 120 }} value={r.datum_proizvodnje || ""} onChange={(e) => updateRow(i, { datum_proizvodnje: e.target.value })} /></td>
                        <td style={cell}><input style={{ ...compactInput, minWidth: 160 }} value={r.napomena || ""} onChange={(e) => updateRow(i, { napomena: e.target.value })} placeholder="napomena (opciono)" /></td>
                    </tr>;
                })}</tbody>
            </table></div>
            {packingRows.length === 0 && <div style={{ padding: 20, color: "#64748b", textAlign: "center" }}>Učitaj Excel/CSV ili nalepi tekst packing liste.</div>}
        </div>
    </div>;
}

function MobileCameraScanner({ mode, onClose, onScan }) {
    const scannerId = React.useMemo(() => `maropack-mobile-qr-scanner-${Math.random().toString(36).slice(2)}`, []);
    const [error, setError] = React.useState("");
    const [started, setStarted] = React.useState(false);
    const [manualQr, setManualQr] = React.useState("");
    const onScanRef = React.useRef(onScan);

    React.useEffect(() => { onScanRef.current = onScan; }, [onScan]);

    React.useEffect(() => {
        let scanner = null;
        let closed = false;

        async function shutdown() {
            if (scanner) {
                try { await scanner.stop(); } catch { }
                try { scanner.clear(); } catch { }
                scanner = null;
            }
        }

        async function startScanner() {
            try {
                const mod = await import("html5-qrcode");
                const Html5Qrcode = mod.Html5Qrcode || mod.default?.Html5Qrcode || mod.default;
                const Html5QrcodeScanType = mod.Html5QrcodeScanType || mod.default?.Html5QrcodeScanType;
                if (!Html5Qrcode) throw new Error("html5-qrcode nije pravilno učitan");
                const el = document.getElementById(scannerId);
                if (el) el.innerHTML = "";
                scanner = new Html5Qrcode(scannerId, false);
                const config = { fps: 8, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0, rememberLastUsedCamera: true, supportedScanTypes: Html5QrcodeScanType ? [Html5QrcodeScanType.SCAN_TYPE_CAMERA] : undefined };
                await scanner.start(
                    { facingMode: "environment" },
                    config,
                    async (decodedText) => {
                        if (closed) return;
                        closed = true;
                        const value = String(decodedText || "").trim();
                        await shutdown();
                        try { await Promise.resolve(onScanRef.current(value)); } catch (err) { console.error("QR obrada nije uspela", err); }
                    },
                    () => { }
                );
                if (!closed) setStarted(true);
            } catch (e) {
                console.error("QR scanner greška", e);
                setError("Kamera nije dostupna. Proveri dozvolu za kameru ili unesi QR ručno ispod.");
            }
        }

        startScanner();
        return () => { closed = true; shutdown(); };
    }, [scannerId]);

    const title = mode === "povrat" ? "↩️ Skeniraj QR rolne za povrat" : mode === "lokacija" ? "📍 Skeniraj QR lokacije" : "📷 Skeniraj QR rolne za popis";
    const subtitle = mode === "lokacija" ? "Skeniraj redom: MAGACIN, RED, POLICA, POZICIJA." : "Usmeri kameru ka QR kodu na etiketi rolne.";

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 2147483647, background: "#0f172a", color: "#fff", padding: 14, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                    <div style={{ fontSize: 20, fontWeight: 950 }}>{title}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{subtitle}</div>
                </div>
                <button onClick={onClose} style={{ border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.12)", color: "#fff", borderRadius: 12, padding: "10px 12px", fontWeight: 900 }}>Zatvori</button>
            </div>
            <div style={{ background: "#020617", border: "1px solid rgba(255,255,255,.18)", borderRadius: 18, padding: 10, minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div id={scannerId} style={{ width: "100%", maxWidth: 420, minHeight: 280, overflow: "hidden", borderRadius: 14, background: "#000" }} />
            </div>
            {!started && !error && <div style={{ marginTop: 12, textAlign: "center", opacity: 0.8 }}>Pokrećem kameru...</div>}
            {error && <div style={{ marginTop: 12, background: "#7f1d1d", border: "1px solid #fecaca", borderRadius: 12, padding: 12, fontWeight: 800 }}>{error}</div>}
            <div style={{ marginTop: 12, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Rezervni ručni unos QR-a</div>
                <div style={{ display: "flex", gap: 8 }}>
                    <input value={manualQr} onChange={(e) => setManualQr(e.target.value)} placeholder={mode === "lokacija" ? "MAROPACK|MAGACIN|A" : "ROLNA-2026-..."} style={{ flex: 1, border: "1px solid rgba(255,255,255,.25)", background: "#fff", color: "#0f172a", borderRadius: 10, padding: 10, fontWeight: 800 }} />
                    <button onClick={() => manualQr.trim() && onScanRef.current(manualQr.trim())} style={{ border: 0, background: "#22c55e", color: "#fff", borderRadius: 10, padding: "10px 12px", fontWeight: 900 }}>OK</button>
                </div>
            </div>
        </div>
    );
}


function PopisTab({ card, input, btn, lbl, popisQr, setPopisQr, findPopisRoll, popisRoll, popisForm, setPopisForm, confirmInventoryCount, estimateKgForMeters, onOpenScanner, onOpenLocationScanner, locationParts, popisMagacin, setPopisMagacin, popisSessionId, resetPopisSession, popisExpectedRolls = [], popisCountedRows = [], popisMissingRolls = [], popisExtraRows = [] }) {
    return <div style={{ display: "grid", gap: 14 }}>
        <div style={card}>
            <div style={{ fontWeight: 950, fontSize: 20, marginBottom: 6 }}>📲 QR popis rolni</div>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 14 }}>Izaberi koji magacin popisuješ, zatim skeniraj QR kodove. Na kraju vidiš šta nedostaje i šta je višak/na pogrešnoj lokaciji.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <label><span style={lbl}>Magacin koji se popisuje</span><select style={input} value={popisMagacin} onChange={(e) => { setPopisMagacin(e.target.value); setPopisForm((f) => ({ ...f, lokacija: "" })); }}>
                    {WAREHOUSE_OPTIONS.map((w) => <option key={w} value={w}>Magacin {w}</option>)}
                </select></label>
                <label><span style={lbl}>Popis sesija</span><input style={input} value={popisSessionId} readOnly /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
                {[["Očekivano", popisExpectedRolls.length], ["Skenirano", popisCountedRows.length], ["Nedostaje", popisMissingRolls.length], ["Razlika/višak", popisExtraRows.length]].map(([a, b]) => <div key={a} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>{a}</div><div style={{ fontSize: 22, fontWeight: 950 }}>{b}</div></div>)}
            </div>
            {onOpenScanner && <button onClick={onOpenScanner} style={{ ...btn, background: "#0f172a", color: "#fff", width: "100%", marginBottom: 10, padding: 14, fontSize: 15 }}>📷 Otvori kameru i skeniraj QR</button>}
            <label><span style={lbl}>QR / Broj rolne</span><input style={{ ...input, fontSize: 16, fontWeight: 800 }} value={popisQr} onChange={(e) => setPopisQr(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") findPopisRoll(); }} placeholder="Skeniraj ROLNA-..." /></label>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={findPopisRoll} style={{ ...btn, background: "#2563eb", color: "#fff" }}>Pronađi rolnu</button>
                <button onClick={resetPopisSession} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Novi popis</button>
            </div>
        </div>

        <div style={card}>
            {!popisRoll ? <div style={{ color: "#64748b" }}>Nema izabrane rolne za popis.</div> : <>
                <div style={{ fontWeight: 950, marginBottom: 10 }}>{popisRoll.qr}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>{[["Materijal", `${popisRoll.vrsta} · ${popisRoll.komercijalnaOznaka || rollOznaka(popisRoll)}`], ["Širina", `${popisRoll.sirina} mm`], ["Knjig. m", fmt(popisRoll.duzina, 0)], ["Knjig. kg", fmt(popisRoll.kg, 2)]].map(([a, b]) => <div key={a} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 900 }}>{a}</div><div style={{ fontWeight: 950 }}>{b}</div></div>)}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <label><span style={lbl}>Stvarno metara</span><input style={input} type="number" value={popisForm.duzina} onChange={(e) => { const m = e.target.value; setPopisForm({ ...popisForm, duzina: m, kg: Number(m) > 0 ? estimateKgForMeters(popisRoll, Number(m)) : "" }); }} /></label>
                    <label><span style={lbl}>Stvarno kg</span><input style={input} type="number" value={popisForm.kg} onChange={(e) => setPopisForm({ ...popisForm, kg: e.target.value })} /></label>
                    <label><span style={lbl}>Aktuelna lokacija rolne</span><input style={input} value={popisForm.lokacija || ""} onChange={(e) => setPopisForm({ ...popisForm, lokacija: e.target.value })} placeholder="npr. B-01-C-04" /></label>
                </div>
                {onOpenLocationScanner && <div style={{ marginTop: 10, padding: 10, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12 }}><div style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 900, marginBottom: 6 }}>QR lokacija: {locationProgressLabel(locationParts)}</div><button onClick={onOpenLocationScanner} style={{ ...btn, background: "#2563eb", color: "#fff", width: "100%" }}>📍 Skeniraj lokaciju rolne</button></div>}
                <button onClick={confirmInventoryCount} style={{ ...btn, background: "#059669", color: "#fff", marginTop: 12 }}>Potvrdi popis i ažuriraj stanje</button>
            </>}
        </div>

        <div style={card}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Razlike u popisu za {popisMagacin}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                    <div style={{ fontWeight: 900, color: "#991b1b", marginBottom: 8 }}>Nedostaje u popisu</div>
                    {popisMissingRolls.length === 0 ? <div style={{ color: "#64748b" }}>Nema nedostajućih rolni.</div> : popisMissingRolls.slice(0, 30).map((r) => <div key={r.qr} style={{ borderTop: "1px solid #fee2e2", padding: "7px 0", fontSize: 13 }}><b>{r.qr}</b> · {r.vrsta} · {r.sirina} mm · {fmt(r.duzina, 0)} m</div>)}
                </div>
                <div>
                    <div style={{ fontWeight: 900, color: "#92400e", marginBottom: 8 }}>Višak / pogrešan magacin</div>
                    {popisExtraRows.length === 0 ? <div style={{ color: "#64748b" }}>Nema viška ni pogrešnih lokacija.</div> : popisExtraRows.slice(0, 30).map((r) => <div key={r.qr} style={{ borderTop: "1px solid #fef3c7", padding: "7px 0", fontSize: 13 }}><b>{r.qr}</b> · očekivano: {r.ocekivana_lokacija || "—"} · popisano: {r.popisana_lokacija}</div>)}
                </div>
            </div>
        </div>
    </div>;
}


function MaterialsTab({ card, input, btn, lbl, matFilter, setMatFilter, materialMaster = [], materialPrices = {}, saveMaterialMaster, deleteMaterialMaster, loadMaterialMaster, materialDropdowns = FALLBACK_MATERIAL_DROPDOWNS }) {
    const [p, setP] = React.useState({ vrsta: "BOPP", pod_vrsta: "Transparent", oznaka: "FXC", debljina: 20, proizvodjac: "", koeficijent: 0.91, gsm: 18.2, cenaKg: "", minimalna_zaliha: "" });
    const vrste = uniqMaterialValues(materialMaster, "vrsta", materialDropdowns.vrste || FALLBACK_MATERIAL_DROPDOWNS.vrste);
    const podVrste = uniqMaterialValues(materialMaster.filter((x) => x.vrsta === p.vrsta), "pod_vrsta", []);
    const oznake = uniqMaterialValues(materialMaster.filter((x) => x.vrsta === p.vrsta && (!p.pod_vrsta || x.pod_vrsta === p.pod_vrsta)), "oznaka", []);
    const debljine = uniqSorted(materialMaster.filter((x) => x.vrsta === p.vrsta && (!p.pod_vrsta || x.pod_vrsta === p.pod_vrsta) && (!p.oznaka || x.oznaka === p.oznaka)).map((x) => Number(x.debljina)).filter((x) => Number.isFinite(x)), []);
    const proizvodjaci = uniqMaterialValues(materialMaster.filter((x) => x.vrsta === p.vrsta && (!p.oznaka || x.oznaka === p.oznaka)), "proizvodjac", materialDropdowns.proizvodjaci || FALLBACK_MATERIAL_DROPDOWNS.proizvodjaci);
    const selected = materialMaster.find((x) => x.vrsta === p.vrsta && x.pod_vrsta === p.pod_vrsta && x.oznaka === p.oznaka && Number(x.debljina) === Number(p.debljina));
    const koef = number(p.koeficijent) || number(selected?.koeficijent) || coeffByVrsta(p.vrsta);
    const gsm = number(p.gsm) || number(selected?.gsm) || round2(number(p.debljina) * koef);
    const naziv = materialDisplayName({ ...p, koeficijent: koef, gsm });

    React.useEffect(() => {
        if (selected) {
            const activePrice = materialPrices[selected.id]?.cena_kg;
            setP((x) => ({ ...x, proizvodjac: selected.proizvodjac || x.proizvodjac, koeficijent: selected.koeficijent || x.koeficijent, gsm: selected.gsm || x.gsm, cenaKg: x.cenaKg || activePrice || "", minimalna_zaliha: selected.minimalna_zaliha || x.minimalna_zaliha || "" }));
        }
    }, [selected?.id]);

    function editRow(m) {
        setP({ vrsta: m.vrsta || "BOPP", pod_vrsta: m.pod_vrsta || "", oznaka: m.oznaka || "", debljina: number(m.debljina), proizvodjac: m.proizvodjac || "", koeficijent: number(m.koeficijent), gsm: number(m.gsm), cenaKg: number(materialPrices[m.id]?.cena_kg || m.cenaKg || 0) || "", minimalna_zaliha: number(m.minimalna_zaliha) || "" });
    }
    const q = String(matFilter || "").toLowerCase().trim();
    const rows = (materialMaster || []).map((m) => ({ ...m, cenaKg: number(materialPrices[m.id]?.cena_kg) })).filter((m) => !q || [m.vrsta, m.pod_vrsta, m.oznaka, m.proizvodjac, m.debljina, m.gsm].join(" ").toLowerCase().includes(q));

    return <div style={{ display: "grid", gridTemplateColumns: "480px 1fr", gap: 16 }}>
        <div style={card}>
            <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 4 }}>🧠 Baza materijala / Material Master</div>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>Ovde dodaješ nove validne kombinacije. Ručni unos i PDF parser koriste samo ovu bazu.</div>
            <div style={{ display: "grid", gap: 10 }}>
                <label><span style={lbl}>Vrsta</span><input list="mm-vrste" style={input} value={p.vrsta} onChange={(e) => setP({ ...p, vrsta: e.target.value, pod_vrsta: "", oznaka: "" })} /><datalist id="mm-vrste">{vrste.map((v) => <option key={v} value={v} />)}</datalist></label>
                <label><span style={lbl}>Pod vrsta</span><input list="mm-pod-vrste" style={input} value={p.pod_vrsta || ""} onChange={(e) => setP({ ...p, pod_vrsta: e.target.value, oznaka: "" })} /><datalist id="mm-pod-vrste">{uniqSorted(podVrste, materialDropdowns.podVrste || FALLBACK_MATERIAL_DROPDOWNS.podVrste).map((v) => <option key={v} value={v} />)}</datalist></label>
                <label><span style={lbl}>Oznaka</span><input list="mm-oznake" style={input} value={p.oznaka || ""} onChange={(e) => setP({ ...p, oznaka: e.target.value })} /><datalist id="mm-oznake">{uniqSorted(oznake, materialDropdowns.oznake || FALLBACK_MATERIAL_DROPDOWNS.oznake).map((o) => <option key={o} value={o} />)}</datalist></label>
                <label><span style={lbl}>{p.vrsta === "PAPIR" ? "Gramatura" : "Debljina"}</span><input list="mm-debljine" style={input} type="number" value={p.debljina} onChange={(e) => setP({ ...p, debljina: Number(e.target.value) })} /><datalist id="mm-debljine">{uniqSorted(debljine, materialDropdowns.debljine || FALLBACK_MATERIAL_DROPDOWNS.debljine).map((d) => <option key={d} value={d} />)}</datalist></label>
                <label><span style={lbl}>Proizvođač</span><input list="mm-proizvodjaci" style={input} value={p.proizvodjac || ""} onChange={(e) => setP({ ...p, proizvodjac: e.target.value })} /><datalist id="mm-proizvodjaci">{proizvodjaci.map((v) => <option key={v} value={v} />)}</datalist></label>
                <label><span style={lbl}>Koeficijent</span><input style={input} type="number" step="0.001" value={p.koeficijent} onChange={(e) => setP({ ...p, koeficijent: e.target.value, gsm: round2(number(e.target.value) * number(p.debljina)) })} /></label>
                <label><span style={lbl}>GSM / g/m²</span><input style={input} type="number" step="0.01" value={p.gsm || gsm} onChange={(e) => setP({ ...p, gsm: e.target.value })} /></label>
                <label><span style={lbl}>Cena €/kg</span><input style={input} type="number" step="0.01" value={p.cenaKg} onChange={(e) => setP({ ...p, cenaKg: e.target.value })} /></label>
                <label><span style={lbl}>Minimalna zaliha kg</span><input style={input} type="number" value={p.minimalna_zaliha} onChange={(e) => setP({ ...p, minimalna_zaliha: e.target.value })} /></label>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: 12 }}>
                    <div style={{ fontWeight: 950 }}>{naziv}</div><div style={{ color: "#64748b", fontSize: 13 }}>Koeficijent: <b>{koef || "—"}</b> · g/m²: <b>{fmt(gsm, 2)}</b></div>
                </div>
                <button onClick={() => saveMaterialMaster({ ...p, koeficijent: koef, gsm })} style={{ ...btn, background: "#059669", color: "#fff", padding: "13px" }}>Sačuvaj u material_master</button>
                <button onClick={loadMaterialMaster} style={{ ...btn, background: "#e0f2fe", color: "#0369a1" }}>Osveži bazu</button>
            </div>
        </div>
        <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 10, alignItems: "center" }}><div><div style={{ fontWeight: 950 }}>Material master</div><div style={{ color: "#64748b", fontSize: 12 }}>Lista svih validnih kombinacija iz Supabase.</div></div><input style={{ ...input, maxWidth: 300 }} placeholder="Pretraga materijala" value={matFilter} onChange={(e) => setMatFilter(e.target.value)} /></div>
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr style={{ background: "#f8fafc" }}>{["Vrsta", "Pod vrsta", "Oznaka", "Proizvođač", "Deb.", "Koef.", "g/m²", "€/kg", "Min kg", "Akcije"].map(h => <th key={h} style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead><tbody>{rows.length === 0 && <tr><td colSpan={10} style={{ padding: 18, color: "#64748b", fontWeight: 800 }}>Nema materijala za prikaz. Klikni „Osveži bazu“ ili dodaj prvi materijal levo.</td></tr>}{rows.map((m) => <tr key={m.id} style={{ borderBottom: "1px solid #f1f5f9" }}><td style={cell}><b>{m.vrsta}</b></td><td style={cell}>{m.pod_vrsta || "—"}</td><td style={cell}>{m.oznaka || "—"}</td><td style={cell}>{m.proizvodjac || "—"}</td><td style={cell}>{m.debljina || "—"}</td><td style={cell}>{m.koeficijent || "—"}</td><td style={cell}><b>{fmt(m.gsm, 2)}</b></td><td style={cell}>{m.cenaKg ? fmt(m.cenaKg, 2) : "—"}</td><td style={cell}>{m.minimalna_zaliha ? fmt(m.minimalna_zaliha, 0) : "—"}</td><td style={cell}><button onClick={() => editRow(m)} style={{ ...btn, background: "#dbeafe", color: "#1d4ed8" }}>Izmeni</button> <button onClick={() => deleteMaterialMaster(m)} style={{ ...btn, background: "#fee2e2", color: "#991b1b" }}>Deaktiviraj</button></td></tr>)}</tbody></table></div>
        </div>
    </div>;
}


function PovratTab({ card, input, btn, lbl, povratQr, setPovratQr, findPovratRoll, povratRoll, povratForm, setPovratForm, estimateMetersFromDiameter, estimateKgForMeters, confirmReturnToWarehouse, onOpenScanner, onOpenLocationScanner, locationParts }) {
    const [localForm, setLocalForm] = React.useState(povratForm || { hilzna: "FI76", spoljasnjiPrecnik: "", lokacija: "Magacin", napomena: "Povrat u magacin" });

    React.useEffect(() => {
        setLocalForm(povratForm || { hilzna: "FI76", spoljasnjiPrecnik: "", lokacija: "Magacin", napomena: "Povrat u magacin" });
    }, [povratRoll?.id]);

    // Kada se lokacija očita QR-om u parent komponenti, promeni samo lokaciju u lokalnoj formi.
    // Ne diramo spoljašnji prečnik da ne izbaci korisnika iz input polja.
    React.useEffect(() => {
        if (!povratForm?.lokacija) return;
        setLocalForm((prev) => ({ ...prev, lokacija: povratForm.lokacija }));
    }, [povratForm?.lokacija]);

    function updateLocal(patch) { setLocalForm((prev) => ({ ...prev, ...patch })); }
    function syncLocal() { setPovratForm(localForm); }

    const meters = povratRoll ? estimateMetersFromDiameter(povratRoll, localForm.spoljasnjiPrecnik, localForm.hilzna) : 0;
    const kg = povratRoll ? estimateKgForMeters(povratRoll, meters) : 0;
    return (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 430px) 1fr", gap: 16 }}>
            <div style={card}>
                <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 6 }}>↩️ Povrat u magacin</div>
                <div style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>Na telefonu prvo skeniraj QR kamerom, zatim izaberi hilznu i unesi spoljašnji prečnik.</div>
                <div style={{ display: "grid", gap: 10 }}>
                    {onOpenScanner && <button onClick={onOpenScanner} style={{ ...btn, background: "#0f172a", color: "#fff", padding: 14, fontSize: 15 }}>📷 Otvori kameru i skeniraj QR</button>}
                    <label><span style={lbl}>QR / broj rolne</span><input style={input} value={povratQr} onChange={(e) => setPovratQr(e.target.value)} placeholder="Skeniraj QR ili unesi broj rolne" /></label>
                    <button onClick={findPovratRoll} style={{ ...btn, background: "#0f172a", color: "#fff" }}>Pronađi rolnu</button>
                    <label><span style={lbl}>Hilzna</span><select style={input} value={localForm.hilzna} onChange={(e) => updateLocal({ hilzna: e.target.value })} onBlur={syncLocal}><option value="FI76">FI 76 — računa se 100 mm</option><option value="FI152">FI 152 — računa se 180 mm</option></select></label>
                    <label><span style={lbl}>Spoljašnji prečnik rolne mm</span><input style={input} inputMode="decimal" value={localForm.spoljasnjiPrecnik} onChange={(e) => updateLocal({ spoljasnjiPrecnik: e.target.value })} onBlur={syncLocal} placeholder="npr. 420" /></label>
                    <label><span style={lbl}>Lokacija povrata</span><input style={input} value={localForm.lokacija} onChange={(e) => updateLocal({ lokacija: e.target.value })} onBlur={syncLocal} placeholder="npr. B-01-C-04" /></label>
                    {onOpenLocationScanner && <div style={{ padding: 10, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12 }}><div style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 900, marginBottom: 6 }}>QR lokacija: {locationProgressLabel(locationParts)}</div><button onClick={() => { syncLocal(); onOpenLocationScanner(); }} style={{ ...btn, background: "#2563eb", color: "#fff", width: "100%" }}>📍 Skeniraj lokaciju povrata</button></div>}
                    <label><span style={lbl}>Napomena</span><input style={input} value={localForm.napomena} onChange={(e) => updateLocal({ napomena: e.target.value })} onBlur={syncLocal} /></label>
                    <button onClick={() => confirmReturnToWarehouse(localForm)} disabled={!povratRoll} style={{ ...btn, background: povratRoll ? "#059669" : "#cbd5e1", color: "#fff", padding: 12 }}>Potvrdi povrat i štampaj novu etiketu</button>
                </div>
            </div>
            <div style={card}>
                <div style={{ fontWeight: 950, marginBottom: 12 }}>Obračun povrata</div>
                {!povratRoll ? <div style={{ color: "#64748b" }}>Nema izabrane rolne.</div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(150px,1fr))", gap: 10 }}>
                    {[["Rolna", povratRoll.qr], ["Materijal", `${povratRoll.vrsta || "—"} · ${povratRoll.komercijalnaOznaka || ""}`], ["Debljina", `${povratRoll.debljina || "—"} µ`], ["Širina", `${povratRoll.sirina || "—"} mm`], ["Lokacija", locationLabel(localForm.lokacija || povratRoll.lokacija)], ["Izračunato m", `${fmt(meters, 0)} m`], ["Izračunato kg", `${fmt(kg, 2)} kg`]].map(([a, b]) => <div key={a} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 900 }}>{a}</div><div style={{ fontWeight: 950, marginTop: 4 }}>{b}</div></div>)}
                </div>}
                <div style={{ marginTop: 14, padding: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, color: "#92400e", fontSize: 13 }}>
                    Formula koristi spoljašnji prečnik, efektivni prečnik hilzne i debljinu materijala. FI 76 se računa kao 100 mm, FI 152 kao 180 mm.
                </div>
            </div>
        </div>
    );
}


function PredlogTab({ card, input, btn, lbl, req, setReq, createReservationRequest, suggestedRolls, reserveForMaster }) {
    return <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}><div style={card}><div style={{ fontWeight: 900, marginBottom: 12 }}>Zahtev materijala za nalog</div><div style={{ display: "grid", gap: 10 }}><label><span style={lbl}>Vrsta materijala</span><input style={input} value={req.vrsta} onChange={(e) => setReq({ ...req, vrsta: e.target.value })} /></label><label><span style={lbl}>Debljina µ</span><input style={input} type="number" value={req.debljina} onChange={(e) => setReq({ ...req, debljina: e.target.value })} /></label><label><span style={lbl}>Potrebna širina mm</span><input style={input} type="number" value={req.sirina} onChange={(e) => setReq({ ...req, sirina: e.target.value })} /></label><label><span style={lbl}>Potrebno metara</span><input style={input} type="number" value={req.potrebniM} onChange={(e) => setReq({ ...req, potrebniM: e.target.value })} /></label><button onClick={createReservationRequest} style={{ ...btn, background: "#2563eb", color: "#fff" }}>Sačuvaj zahtev za nalog</button></div></div><div style={card}><div style={{ fontWeight: 900, marginBottom: 12 }}>Predložene rolne iz magacina</div><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr style={{ background: "#f8fafc" }}>{["QR", "Materijal", "Širina", "m", "kg", "Lokacija", "Ocena", "Akcija"].map(h => <th key={h} style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead><tbody>{suggestedRolls.map((r) => <tr key={r.qr}><td style={cell}><b>{r.qr}</b></td><td style={cell}>{r.vrsta} · {r.komercijalnaOznaka}</td><td style={cell}>{r.sirina} mm</td><td style={cell}>{fmt(r.duzina, 0)}</td><td style={cell}>{fmt(r.kg, 2)}</td><td style={cell}>{r.lokacija}</td><td style={cell}>{r.pokriva ? "✅ Pokriva" : `⚠️ Fali ${fmt(Math.abs(r.ostatak), 0)} m`}</td><td style={cell}><button onClick={() => reserveForMaster(r)} style={{ ...btn, background: "#fef3c7", color: "#92400e" }}>Rezerviši</button></td></tr>)}</tbody></table>{suggestedRolls.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Nema dostupnih rolni koje odgovaraju zahtevu. Dodaj rolnu ili promeni kriterijum.</div>}</div></div></div>;
}
