import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase.js";
import { predloziFormatiranje } from "./modules/formatiranjeEngine.js";

// ─────────────────────────────────────────────────────────────────────────────
//  OBJEDINJEN NALOG  [v1]
//  Više proizvoda ISTOG kupca sa ISTIM materijalom (vrsta/pod-vrsta/oznaka/
//  debljina/proizvođač), ali RAZLIČITIH dimenzija → jedan zajednički nalog za
//  rezanje (formatiranje). Različite širine se zajedno pakuju na matične rolne
//  (predloziFormatiranje), materijal se rezerviše jednom, otpada manje.
//  Vrednost naloga = Σ (cena × količina) po proizvodu → ide na Dashboard karticu.
// ─────────────────────────────────────────────────────────────────────────────

const N_ = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const UP = (s) => String(s || "").trim().toUpperCase();
const fmtN = (n) => (Math.round(Number(n) || 0)).toLocaleString("sr-RS");

function normalizeTip(tip) {
    const t = String(tip || "").toLowerCase();
    if (t.includes("kes")) return "kesa";
    if (t.includes("spul") || t.includes("špul")) return "spulna";
    return "folija";
}

// Ceo sačuvani templejt (form) proizvoda — baza ga drži u data/template.
function getForm(p) {
    const nested = p?.data || p?.template || (p?.standardi && p.standardi.record && p.standardi.record.data) || null;
    if (nested && typeof nested === "object") return nested;
    // Fallback: minimalna forma iz ravnih polja
    const layers = (Array.isArray(p?.materijali_struktura) && p.materijali_struktura)
        || (Array.isArray(p?.mats) && p.mats) || (Array.isArray(p?.materijali) && p.materijali) || [];
    return {
        type: normalizeTip(p?.tip),
        naziv: p?.naziv || "", kupac: p?.kupac || "",
        idealnaSirinaMaterijala: p?.sir || p?.sirina || "",
        folija: { layers },
    };
}
function tipProizvoda(p) { const f = getForm(p); return normalizeTip(p?.tip || f.type || ""); }
function sifraP(p) { const f = getForm(p); return p?.sku || p?.sifra || f.sifra || ""; }

function layer0(form) {
    const l = ((form.folija && form.folija.layers) || form.layers || [])[0] || {};
    return l;
}
// Materijal matične rolne iz prvog sloja (isti ključevi kao u templejtu).
function matFromForm(form) {
    const l = layer0(form);
    return {
        vrsta: l.material || l.materijal || l.vrsta || l.tip || "",
        pod_vrsta: l.pod_vrsta || l.podvrsta || l.podVrsta || "",
        oznaka: l.oznaka_materijala || l.oznaka || "",
        proizvodjac: l.proizvodjac || l.proizvođač || l.dobavljac || "",
        debljina: l.debljina || l.deb || "",
    };
}
// Ključ materijala za provaru poklapanja (debljina numerički).
function matKljuc(m) {
    return [UP(m.vrsta), UP(m.pod_vrsta), UP(m.oznaka), UP(m.proizvodjac), N_(m.debljina)].join("|");
}
function matLabel(m) {
    return [m.vrsta, m.pod_vrsta, m.oznaka, m.debljina ? m.debljina + "µ" : "", m.proizvodjac].filter(Boolean).join(" · ");
}

function idealnaSirina(p) {
    const f = getForm(p);
    const v = f.idealnaSirinaMaterijala || (f.folija && f.folija.idealnaSirinaMaterijala);
    return N_(v) || N_(p?.sir) || N_(p?.sirina);
}
// Završna (rezana) širina proizvoda = format za rezanje.
function formatSirina(form) {
    const rez = (form.folija && form.folija.rezanje) || {};
    return N_(rez.sirinaTrake) || N_(form.dimenzijaSirina) || N_(form.idealnaSirinaMaterijala);
}
// Dužina rolne (m) — isto što se unosi u templejtu (rezanje.duzinaRolne).
function duzinaRolneForm(form) {
    const rez = (form.folija && form.folija.rezanje) || {};
    return N_(rez.duzinaRolne);
}

// Perforacija proizvoda (iz templejta) → config za nalog + kratak opis.
function perforacijaForm(form, p) {
    const tip = normalizeTip(form.type || (p && p.tip));
    const sek = form[tip] || form.folija || {};
    const k = sek.kpdf || form.kpdf || (p && p.kpdf) || {};
    const opt = sek.options || {};
    const pf = sek.perforacija || (p && p.perforacija) || {};
    if (pf && (pf.nema === true || pf.bez === true)) return { ima: false, cfg: null, opis: "" };
    const pfTip = (pf && pf.tip) || "";
    const ima = !!(k.enabled)
        || (pfTip && pfTip !== "Nema" && pfTip !== "—")
        || !!sek.poprecna_perf || !!sek.mikroperforacija
        || !!opt.poprecna_perf || !!opt.perf_igle || !!opt.perf_otkinuti || !!opt.perf_telo;
    if (!ima) return { ima: false, cfg: null, opis: "" };
    // config koji NalogLayoutPRO zna da nacrta: {tip:'linija'|'rupe', odnos, pozicija}
    const makro = pfTip === "rupe" || !!opt.perf_otkinuti || !!(k.tip && String(k.tip).toLowerCase().includes("rup"));
    const cfg = { tip: makro ? "rupe" : "linija", odnos: (pf.odnos || k.odnos || ""), pozicija: (pf.pozicija || k.pozicija || "") };
    const opisTip = (pfTip && pfTip !== "Nema") ? pfTip : (k.enabled ? (k.tip || "KPDF") : "perforacija");
    const opis = [opisTip, cfg.odnos, cfg.pozicija ? "poz. " + cfg.pozicija : ""].filter(Boolean).join(" · ");
    return { ima: true, cfg, opis };
}

// ── FOLIJA obračun (verbatim iz templejta — da metraža/vrednost budu identične) ──
function folijaObracun(form, skartPct) {
    if (skartPct === undefined || skartPct === null) skartPct = N_(form && form.folijaSkart) || 5;
    const layers = (form.folija?.layers || []).filter(l => N_(l.gm2 ?? l.tezina ?? l.tezinaGm2) > 0 || (N_(l.debljina) && N_(l.koeficijent)));
    const rez = form.folija?.rezanje || {};
    const sirMatMm = N_(rez.sirinaMaterijala) || N_(form.idealnaSirinaMaterijala);
    const trakaMm = N_(rez.sirinaTrake) || N_(form.dimenzijaSirina);
    const korakM = N_(form.dimenzijaDuzina) / 1000;
    const sirMatM = sirMatMm / 1000;
    const rucno = Math.floor(N_(rez.brojTrakaOverride));
    const N = rucno > 0 ? rucno : (sirMatMm && trakaMm ? Math.max(1, Math.floor(sirMatMm / trakaMm)) : 1);
    const totalGm2 = layers.reduce((a, l) => { const g = N_(l.gm2 ?? l.tezina ?? l.tezinaGm2); return a + (g || N_(l.debljina) * N_(l.koeficijent)); }, 0);
    const jed = form.jedinicaUnosa || "m";
    const v = N_(form.porucenaKolicina);
    let kom = 0, metriTrake = 0, metriMat = 0;
    if (jed === "kom") {
        kom = v; metriTrake = kom * korakM; metriMat = N ? metriTrake / N : 0;
    } else if (jed === "kg") {
        const m2 = totalGm2 > 0 ? (v * 1000) / totalGm2 : 0;
        metriMat = sirMatM > 0 ? m2 / sirMatM : 0; metriTrake = metriMat * N; kom = korakM > 0 ? metriTrake / korakM : 0;
    } else { metriTrake = v; metriMat = N ? metriTrake / N : 0; kom = korakM > 0 ? metriTrake / korakM : 0; }
    const f = 1 + (skartPct / 100);
    const metriMatPlus = metriMat * f;
    const slojevi = layers.map((l) => { const g = N_(l.gm2 ?? l.tezina ?? l.tezinaGm2) || (N_(l.debljina) * N_(l.koeficijent)); return { gm2: g, kg: +(g * sirMatM * metriMatPlus / 1000).toFixed(1) }; });
    return {
        N, metriTrake: Math.ceil(metriTrake), metriMat: Math.ceil(metriMat), metriMatPlus: Math.ceil(metriMatPlus),
        kgUkupno: +slojevi.reduce((a, s) => a + s.kg, 0).toFixed(1),
    };
}
function prodajnaJedinicaZaTip(tip) { return tip === "kesa" ? "1000kom" : tip === "spulna" ? "m2" : "m"; }

// Vrednost (folija) — cena × prodata količina u jedinici cene (BEZ škarta).
// cenaOverride / jedOverride omogućavaju izmenu cene na ekranu.
function vrednostFolija(form, cenaOverride, jedOverride) {
    const cena = cenaOverride != null && cenaOverride !== "" ? N_(cenaOverride) : N_(form.prodajnaCena);
    const jed = jedOverride || form.prodajnaJedinica || prodajnaJedinicaZaTip("folija");
    if (!(cena > 0)) return { vrednost: 0, cena: 0, jedinica: jed, kolicina: 0 };
    const unos = form.jedinicaUnosa || "m";
    const Q = N_(form.porucenaKolicina);
    let qty = 0;
    try {
        if (jed === unos) qty = Q;
        else if (jed === "1000m" && unos === "m") qty = Q / 1000;
        else { const ob = folijaObracun(form, 0); qty = jed === "kg" ? ob.kgUkupno : (jed === "1000m" ? ob.metriTrake / 1000 : ob.metriTrake); }
    } catch (e) { qty = 0; }
    return { vrednost: +(cena * (qty || 0)).toFixed(2), cena, jedinica: jed, kolicina: +((qty || 0)).toFixed(2) };
}

// Predlog broja rolni iz količine: ukupni metri trake / dužina rolne.
function predlogRolni(form, duzina) {
    const ob = folijaObracun(form);
    const L = N_(duzina);
    if (!(L > 0)) return 1;
    return Math.max(1, Math.round((ob.metriTrake || 0) / L));
}

const CENA_JED = ["m", "kg", "1000m"];

// ─────────────────────────────────────────────────────────────────────────────

export default function ObjedinjenNalog({ msg, operater }) {
    const [proizvodi, setProizvodi] = useState(null);
    const [greska, setGreska] = useState("");
    const [kupac, setKupac] = useState("");
    const [stavke, setStavke] = useState({});        // id → {sel, sirina, duzina, rolni, cena, jed}
    const [rolne, setRolne] = useState([]);           // magacin rolne
    const [rolneLoad, setRolneLoad] = useState(false);
    const [izbor, setIzbor] = useState([]);           // br_rolne[] izabrane
    const [plan, setPlan] = useState(null);
    const [saving, setSaving] = useState(false);
    const [broj, setBroj] = useState("");

    const say = (t, k) => { if (typeof msg === "function") msg(t, k); };

    useEffect(() => {
        let ziv = true;
        (async () => {
            try {
                const { data, error } = await supabase.from("proizvodi").select("*").order("id", { ascending: false });
                if (error) throw error;
                if (ziv) setProizvodi(Array.isArray(data) ? data : []);
            } catch (e) { if (ziv) { setGreska(e.message || "Greška pri učitavanju"); setProizvodi([]); } }
        })();
        return () => { ziv = false; };
    }, []);

    // Samo folija proizvodi (uklj. formati režim) — rezanje iz matične rolne.
    const folijaProizvodi = useMemo(() => (proizvodi || []).filter(p => tipProizvoda(p) === "folija"), [proizvodi]);

    const kupci = useMemo(() => {
        const s = new Set(); folijaProizvodi.forEach(p => { const k = String(p.kupac || "").trim(); if (k) s.add(k); });
        return Array.from(s).sort((a, b) => a.localeCompare(b, "sr"));
    }, [folijaProizvodi]);

    const proizvodiKupca = useMemo(() => {
        if (!kupac) return [];
        const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
        return folijaProizvodi.filter(p => norm(p.kupac) === norm(kupac));
    }, [folijaProizvodi, kupac]);

    // Init/prefill editable vrednosti za proizvode kupca
    useEffect(() => {
        const next = {};
        proizvodiKupca.forEach(p => {
            const id = String(p.id);
            const f = getForm(p);
            const sir = formatSirina(f);
            const duz = duzinaRolneForm(f);
            next[id] = (stavke[id] && stavke[id]._kupac === kupac) ? stavke[id] : {
                _kupac: kupac, sel: false,
                sirina: sir || "", duzina: duz || "",
                rolni: (duz ? predlogRolni(f, duz) : ""),
                cena: f.prodajnaCena || "", jed: f.prodajnaJedinica || prodajnaJedinicaZaTip("folija"),
            };
        });
        setStavke(next);
        setIzbor([]); setPlan(null); setBroj("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kupac, proizvodiKupca.length]);

    const izabraniIds = useMemo(() => proizvodiKupca.map(p => String(p.id)).filter(id => stavke[id] && stavke[id].sel), [proizvodiKupca, stavke]);
    const izabraniProizvodi = useMemo(() => proizvodiKupca.filter(p => izabraniIds.includes(String(p.id))), [proizvodiKupca, izabraniIds]);

    // Provera poklapanja materijala
    const matCheck = useMemo(() => {
        if (izabraniProizvodi.length < 1) return { ok: false, prazno: true, mat: null, razlika: "" };
        const mats = izabraniProizvodi.map(p => matFromForm(getForm(p)));
        const kljucevi = mats.map(matKljuc);
        const sviIsti = kljucevi.every(k => k === kljucevi[0]);
        if (sviIsti) return { ok: izabraniProizvodi.length >= 2, prazno: false, mat: mats[0], malo: izabraniProizvodi.length < 2 };
        // nađi koji parametar se razlikuje
        const polja = ["vrsta", "pod_vrsta", "oznaka", "debljina", "proizvodjac"];
        const razlike = polja.filter(pol => new Set(mats.map(m => UP(m[pol]) || (pol === "debljina" ? String(N_(m[pol])) : ""))).size > 1);
        return { ok: false, prazno: false, mat: mats[0], razlika: razlike.join(", ") };
    }, [izabraniProizvodi]);

    function setStavka(id, patch) { setStavke(s => ({ ...s, [id]: { ...s[id], ...patch } })); setPlan(null); setBroj(""); }
    function toggleSel(id) { setStavka(id, { sel: !(stavke[id] && stavke[id].sel) }); }

    // Potrebe za predloziFormatiranje iz izabranih stavki
    function sklopiPotrebe() {
        const mat = matCheck.mat || {};
        return izabraniProizvodi.map((p, i) => {
            const id = String(p.id); const st = stavke[id] || {}; const f = getForm(p);
            const perf = perforacijaForm(f, p);
            return {
                id: "P" + (i + 1) + "_" + id,
                materijal: mat,
                sirina_mm: N_(st.sirina),
                duzina_m: N_(st.duzina),
                rolni_kom: Math.max(1, Math.round(N_(st.rolni))),
                napomena: p.naziv || sifraP(p) || ("Proizvod " + (i + 1)),
                perforacija: perf.ima ? perf.cfg : null,
                palete: "", kolNaPaleti: "",
                odrediste: "nalog",
                _proizvod_id: p.id, _sifra: sifraP(p),
            };
        }).filter(x => x.sirina_mm > 0 && x.duzina_m > 0 && x.rolni_kom > 0);
    }
    function perfByIdOd(potrebe) {
        const o = {}; (potrebe || []).forEach(pp => { o[pp.id] = { perforacija: pp.perforacija, napomena: pp.napomena, sirina_mm: pp.sirina_mm, palete: pp.palete || "", kolNaPaleti: pp.kolNaPaleti || "" }; }); return o;
    }

    async function ucitajMagacinRolne() {
        const MAG = ["id", "br_rolne", "qr_code", "vrsta", "pod_vrsta", "oznaka_materijala", "dobavljac", "deb", "sirina", "metraza", "metraza_ost", "rezervisano", "kg_neto", "lot", "palet", "lokacija", "status", "dodeljeno_nalogu", "datum_proizvodnje", "datum_prijema", "datum", "created_at"].join(", ");
        const PAGE = 1000; let out = [];
        for (let od = 0; ; od += PAGE) {
            const { data, error } = await supabase.from("magacin").select(MAG)
                .in("status", ["Na stanju", "Rezervisano", "Delimično rezervisano", "Formatirana"])
                .order("sirina").range(od, od + PAGE - 1);
            if (error) throw error;
            if (!data || !data.length) break;
            out.push(...data); if (data.length < PAGE) break; if (od > 100000) break;
        }
        return out;
    }

    // Glavni preračun: učita rolne (ako treba), pozove engine, postavi plan + početni izbor.
    async function preracunaj() {
        const potrebe = sklopiPotrebe();
        if (!matCheck.ok) { say(matCheck.prazno ? "Označi bar 2 proizvoda." : (matCheck.malo ? "Označi bar 2 proizvoda za objedinjavanje." : "Materijal se ne poklapa (razlika: " + matCheck.razlika + ")."), "err"); return; }
        if (!potrebe.length) { say("Unesi širinu, dužinu rolne i broj rolni za označene proizvode.", "err"); return; }
        setRolneLoad(true);
        try {
            let mag = rolne;
            if (!mag.length) { mag = await ucitajMagacinRolne(); setRolne(mag); }
            const rez = predloziFormatiranje(potrebe, mag, { kerf_mm: 0, bocniOstatakNaStanje: true });
            const perfById = perfByIdOd(potrebe);
            setPlan({ ...rez, perfById, potrebe });
            setIzbor(Array.from(new Set((rez.nalozi || []).map(n => String(n.br_rolne || n.maticna_id)).filter(Boolean))));
        } catch (e) { say("Preračun nije uspeo: " + (e?.message || e), "err"); }
        setRolneLoad(false);
    }

    function preracunajIzbor(noviIzbor) {
        try {
            const potrebe = (plan && plan.potrebe) || sklopiPotrebe();
            const set = new Set((noviIzbor || []).map(String));
            const izabrane = (rolne || []).filter(r => set.has(String(r.br_rolne)));
            const rez = predloziFormatiranje(potrebe, izabrane, { kerf_mm: 0, bocniOstatakNaStanje: true });
            setPlan({ ...rez, perfById: perfByIdOd(potrebe), potrebe });
        } catch (e) { say("Preračun nije uspeo: " + (e?.message || e), "err"); }
    }
    function dodajRolnu(br) { if (!br) return; const n = Array.from(new Set([...izbor, String(br)])); setIzbor(n); preracunajIzbor(n); }
    function izbaciRolnu(br) { const n = izbor.filter(x => x !== String(br)); setIzbor(n); preracunajIzbor(n); }
    function autoRolne() {
        try {
            const potrebe = (plan && plan.potrebe) || sklopiPotrebe();
            const rez = predloziFormatiranje(potrebe, rolne, { kerf_mm: 0, bocniOstatakNaStanje: true });
            setIzbor(Array.from(new Set((rez.nalozi || []).map(n => String(n.br_rolne || n.maticna_id)).filter(Boolean))));
            setPlan({ ...rez, perfById: perfByIdOd(potrebe), potrebe });
        } catch (e) { say("Auto izbor nije uspeo: " + (e?.message || e), "err"); }
    }

    // Kandidati za „+ Dodaj rolnu" — materijal se poklapa, slobodne, poređane FIFO.
    const kandidatiRolne = useMemo(() => {
        const mat = matCheck.mat || {};
        const base = UP(mat.vrsta).split(" ")[0], deb = N_(mat.debljina), ozn = UP(mat.oznaka);
        const minFmt = Math.min(...izabraniProizvodi.map(p => N_((stavke[String(p.id)] || {}).sirina)).filter(x => x > 0), 1e9);
        const slob = (r) => N_(r.metraza_ost ?? r.metraza) - N_(r.rezervisano);
        return (rolne || []).filter(r => {
            if (base && !(UP(r.vrsta).startsWith(base) || UP(r.vrsta).includes(base))) return false;
            if (deb && N_(r.deb) && Math.abs(N_(r.deb) - deb) > 3) return false;
            if (ozn && UP(r.oznaka_materijala) && !UP(r.oznaka_materijala).includes(ozn)) return false;
            if (slob(r) <= 0) return false;
            if (minFmt < 1e9 && N_(r.sirina) < minFmt) return false;
            if (izbor.includes(String(r.br_rolne))) return false;
            return true;
        }).sort((a, b) => new Date(a.datum_prijema || a.datum || a.created_at || 0) - new Date(b.datum_prijema || b.datum || b.created_at || 0));
    }, [rolne, matCheck, izabraniProizvodi, stavke, izbor]);

    // Ukupna vrednost naloga (Σ po proizvodu) + spisak bez cene
    const vrednost = useMemo(() => {
        let uk = 0; const bezCene = [];
        izabraniProizvodi.forEach(p => {
            const st = stavke[String(p.id)] || {}; const f = getForm(p);
            const r = vrednostFolija(f, st.cena, st.jed);
            if (r.vrednost > 0) uk += r.vrednost; else bezCene.push(p.naziv || sifraP(p) || "proizvod");
        });
        return { uk: +uk.toFixed(2), bezCene };
    }, [izabraniProizvodi, stavke]);

    async function sledeciBroj() {
        const god = new Date().getFullYear(); const pref = "MP-" + god + "-";
        const { data, error } = await supabase.from("radni_nalozi").select("broj_naloga").like("broj_naloga", pref + "%").order("broj_naloga", { ascending: false }).limit(1);
        if (error) throw new Error("Ne mogu da odredim sledeći broj naloga: " + error.message);
        const z = data && data[0] && data[0].broj_naloga;
        const n = z ? (parseInt(String(z).split("-").pop(), 10) || 0) : 0;
        return pref + String(n + 1).padStart(4, "0");
    }

    async function rezervisiMaticne(nalozi, brj, naziv) {
        const oznaka = brj + (naziv ? " · " + naziv : "");
        await Promise.all((nalozi || []).map(async (n) => {
            try {
                const { data: cur } = await supabase.from("magacin").select("metraza, metraza_ost, rezervisano, dodeljeno_nalogu").eq("id", n.maticna_id).single();
                const ukupno = Number((cur && (cur.metraza_ost != null ? cur.metraza_ost : cur.metraza)) || 0);
                const noviRez = Math.min(ukupno, (Number(cur && cur.rezervisano) || 0) + (Number(n.utrosak_m) || 0));
                const punoRez = ukupno > 0 && noviRez >= ukupno - 1;
                const preth = String((cur && cur.dodeljeno_nalogu) || "").trim();
                let dod = oznaka; if (preth && preth.indexOf(brj) === -1) dod = preth + ", " + oznaka; else if (preth) dod = preth;
                await supabase.from("magacin").update({ status: punoRez ? "Rezervisano" : "Na stanju", dodeljeno_nalogu: dod, rezervisano: noviRez || null }).eq("id", n.maticna_id);
            } catch (e) { }
        }));
        try {
            const st = (nalozi || []).map(n => ({ nalog_ref: brj, materijali_nalog_id: null, rolna_id: n.maticna_id, br_rolne: n.br_rolne, sloj: 1, sirina: Number(n.sirina_mm) || null, alocirano_m: Number(n.utrosak_m) || 0, status: "rezervisano" }));
            if (st.length) await supabase.from("materijal_stavke").insert(st);
        } catch (e) { }
    }

    async function kreiraj() {
        if (!matCheck.ok) { say("Materijal se ne poklapa — ne mogu da objedinim.", "err"); return; }
        if (!plan || !plan.nalozi || !plan.nalozi.length) { say("Prvo preračunaj i izaberi matične rolne.", "err"); return; }
        if (plan.fali && plan.fali.length) { say("Pokriće nije potpuno — fali rolni. Dodaj još matičnih rolni pre kreiranja.", "err"); return; }
        setSaving(true);
        try {
            const brj = await sledeciBroj();
            const potrebe = plan.potrebe || sklopiPotrebe();
            const mat = matCheck.mat || {};
            const naziv = "Objedinjen · " + izabraniProizvodi.length + " proizvoda · " + (mat.vrsta || "");
            const proizvodNaziv = izabraniProizvodi.map(p => p.naziv || sifraP(p)).filter(Boolean).join(" + ").slice(0, 160);

            // Obogati matične rolne detaljima iz magacina (za lepo napisan nalog:
            // vrsta/pod-vrsta/oznaka/debljina/dobavljač/LOT/lokacija + ukupno metara).
            const rollBy = {}; (rolne || []).forEach(r => { rollBy["id:" + r.id] = r; rollBy["br:" + String(r.br_rolne)] = r; });
            const nadjiR = (n) => rollBy["id:" + n.maticna_id] || rollBy["br:" + String(n.br_rolne)] || {};
            const maticeRich = (plan.nalozi || []).map(n => {
                const r = nadjiR(n);
                const metUk = N_(r.metraza_ost ?? r.metraza);
                const kgpm = (() => { const kg = N_(r.kg_neto); const m = N_(r.metraza_ost ?? r.metraza); return m > 0 ? +(kg / m).toFixed(4) : 0; })();
                return {
                    ...n,
                    _vrsta: r.vrsta || mat.vrsta || "", _pod_vrsta: r.pod_vrsta || mat.pod_vrsta || "",
                    _oznaka: r.oznaka_materijala || mat.oznaka || "", _deb: r.deb || mat.debljina || "",
                    _dobavljac: r.dobavljac || mat.proizvodjac || "", _lot: r.lot || "", _lok: r.lokacija || r.palet || "",
                    _datum: r.datum_prijema || r.datum || "", _metraza_uk: metUk, _kg_po_m: kgpm,
                };
            });
            const planF = {
                matice: maticeRich, perfById: plan.perfById, formati: potrebe,
                na_stanje: plan.na_stanje, fali: plan.fali, zbirno: plan.zbirno,
            };
            // Rezervisane rolne (bogat snapshot) — da ih materijal nalog prikaže i da stignu magacioneru.
            const izabraneRolne = maticeRich.map(n => ({
                br_rolne: n.br_rolne, rolna_id: n.maticna_id,
                snap_vrsta: n._vrsta, snap_pod_vrsta: n._pod_vrsta, snap_oznaka: n._oznaka,
                snap_dobavljac: n._dobavljac, snap_debljina: n._deb, snap_sirina: n.sirina_mm,
                lot: n._lot || "—", lokacija: n._lok || "—",
                metraza_ost: n._metraza_uk, alocirano_m: N_(n.utrosak_m), kg_po_m: n._kg_po_m, sloj: 1,
            }));
            // Zbirni brojevi (za folija-stil materijal nalog): ukupna matična + kg + g/m².
            const totalUtrosak = maticeRich.reduce((a, n) => a + N_(n.utrosak_m), 0);
            const totalKg = maticeRich.reduce((a, n) => a + N_(n._kg_po_m) * N_(n.utrosak_m), 0);
            const maticaSir = (maticeRich[0] && maticeRich[0].sirina_mm) || "";
            const gm2 = (totalKg > 0 && maticaSir > 0 && totalUtrosak > 0) ? +(totalKg * 1000 / ((maticaSir / 1000) * totalUtrosak)).toFixed(1) : "";
            // Sintetički templejt (jedan sloj = materijal) — struktura materijala + rezervisane role + zbir.
            const template = {
                type: "folija", naziv: proizvodNaziv || naziv, kupac: kupac || "", sifra: "",
                idealnaSirinaMaterijala: maticaSir,
                jedinicaUnosa: "m", porucenaKolicina: totalUtrosak ? String(Math.round(totalUtrosak)) : "",
                folijaSkart: "0",
                dimenzijaSirina: maticaSir,
                folija: {
                    formatiRezim: true,
                    formati: potrebe.map(pp => ({ sirina: pp.sirina_mm, duzina: pp.duzina_m, rolni: pp.rolni_kom, napomena: pp.napomena, perforacija: pp.perforacija })),
                    layers: [{ material: mat.vrsta, vrsta: mat.vrsta, pod_vrsta: mat.pod_vrsta, oznaka_materijala: mat.oznaka, oznaka: mat.oznaka, proizvodjac: mat.proizvodjac, debljina: mat.debljina, deb: mat.debljina, gm2: gm2 || "" }],
                    rezanje: { sirinaMaterijala: maticaSir, sirinaTrake: maticaSir, brojTrakaOverride: "1", duzinaRolne: "" },
                },
            };
            const stavkeMeta = izabraniProizvodi.map((p, i) => {
                const st = stavke[String(p.id)] || {}; const f = getForm(p); const r = vrednostFolija(f, st.cena, st.jed);
                return { proizvod_id: p.id, naziv: p.naziv || "", sifra: sifraP(p), sirina_mm: N_(st.sirina), duzina_m: N_(st.duzina), rolni_kom: Math.max(1, Math.round(N_(st.rolni))), cena: N_(st.cena), jedinica: st.jed, vrednost: r.vrednost };
            });
            const zajednicko = { broj_naloga: brj, tip_proizvoda: "folija", kupac: kupac || "", naziv: proizvodNaziv || naziv, proizvod: proizvodNaziv || naziv };
            const zajedParam = {
                formati_rezim: true, objedinjen: true, template,
                plan_formatiranja: planF, izabrane_rolne: izabraneRolne,
                formati_potrebe: potrebe, materijal: mat,
            };

            const { data: master, error: mErr } = await supabase.from("radni_nalozi").insert([{
                ...zajednicko,
                status: "ceka_magacin",
                parametri: {
                    ...zajedParam,
                    datum_isporuke: "", nedelja_isporuke: "",
                    objedinjen_stavke: stavkeMeta,
                    kreirao_ime: operater || "", datum: new Date().toLocaleDateString("sr-RS"),
                    formati_ceka_materijal: false, delimican_materijal: false, nedodeljeni_slojevi: [],
                    vrednost_naloga: vrednost.uk, vrednost_jedinica: "€",
                },
                rezultati: { zbirno: plan.zbirno || null, vrednost_naloga: vrednost.uk },
            }]).select("id").single();
            if (mErr) throw new Error("radni_nalozi: " + mErr.message);
            const mId = master.id;

            const ops = [
                { ...zajednicko, broj_naloga: brj + "-MATERIJAL", glavni_nalog_id: mId, tip_naloga: "materijal", status: "ceka_magacin", redosled: 1, parametri: { ...zajedParam } },
                { ...zajednicko, broj_naloga: brj + "-PERFORACIJA_REZANJE", glavni_nalog_id: mId, tip_naloga: "perforacija_rezanje", status: "ceka", redosled: 2, parametri: { ...zajedParam } },
            ];
            const { error: oErr } = await supabase.from("operativni_nalozi").insert(ops);
            if (oErr) throw new Error("operativni_nalozi: " + oErr.message);

            await rezervisiMaticne(plan.nalozi, brj, naziv);
            setBroj(brj);
            if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("maropack:nalozi-changed", { detail: { broj: brj, masterId: mId } }));
            say("✅ " + brj + " — objedinjen nalog za rezanje kreiran. Vrednost " + fmtN(vrednost.uk) + " €. Matične rolne rezervisane magacioneru.");
        } catch (e) { say("Greška: " + (e?.message || e), "err"); }
        setSaving(false);
    }

    // ── UI ──────────────────────────────────────────────────────────────────
    const wrap = { maxWidth: 1100, margin: "0 auto" };
    const card = { background: "#fff", border: "1px solid #e6ebf2", borderRadius: 14, boxShadow: "0 8px 22px rgba(15,23,42,.05)" };
    const inp = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 9px", fontSize: 13, fontWeight: 700, width: "100%", boxSizing: "border-box" };
    const qin = { ...inp, textAlign: "right", background: "#fffef5", width: 90 };

    if (proizvodi === null) return <div style={{ padding: 40, textAlign: "center", color: "#64748b", fontWeight: 700 }}>Učitavam proizvode…</div>;

    const z = (plan && plan.zbirno) || {};

    return (
        <div style={wrap}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase" }}>Baza / Proizvodnja</div>
            <div style={{ fontSize: 24, fontWeight: 950, margin: "2px 0 4px" }}>🧩 Objedinjen nalog</div>
            <div style={{ color: "#64748b", fontSize: 12.5, marginBottom: 14 }}>Više proizvoda istog kupca sa istim materijalom (različite dimenzije) → jedan nalog za rezanje. Širine se zajedno pakuju na matične rolne, materijal se rezerviše jednom.</div>

            {greska && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontWeight: 700 }}>⚠ {greska}</div>}

            {/* 1 · Kupac */}
            <div style={{ ...card, padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#0f766e", textTransform: "uppercase", letterSpacing: .5, marginBottom: 10 }}>1 · Kupac</div>
                <select value={kupac} onChange={e => setKupac(e.target.value)} style={{ ...inp, maxWidth: 420, cursor: "pointer" }}>
                    <option value="">— izaberi kupca —</option>
                    {kupci.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                {kupac && <span style={{ marginLeft: 10, fontSize: 12.5, color: "#64748b", fontWeight: 700 }}>{proizvodiKupca.length} folija proizvoda</span>}
            </div>

            {/* 2 · Proizvodi */}
            {kupac && (
                <div style={{ ...card, padding: 16, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#0f766e", textTransform: "uppercase", letterSpacing: .5, marginBottom: 10 }}>2 · Proizvodi (označi 2+ sa istim materijalom)</div>
                    {!proizvodiKupca.length && <div style={{ color: "#94a3b8", fontWeight: 700, padding: 10 }}>Ovaj kupac nema folija proizvoda u bazi.</div>}
                    {!!proizvodiKupca.length && (
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 820 }}>
                                <thead><tr style={{ background: "#f0f6f5" }}>
                                    {["", "Proizvod", "Materijal", "Širina (mm)", "Dužina rolne (m)", "Broj rolni", "Cena", "Vrednost"].map((h, i) =>
                                        <th key={i} style={{ textAlign: i >= 3 ? "right" : "left", padding: "8px 10px", color: "#0f766e", fontWeight: 800, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>)}
                                </tr></thead>
                                <tbody>
                                    {proizvodiKupca.map(p => {
                                        const id = String(p.id); const st = stavke[id] || {}; const f = getForm(p); const m = matFromForm(f);
                                        const r = vrednostFolija(f, st.cena, st.jed);
                                        const sel = !!st.sel;
                                        return (
                                            <tr key={id} style={{ borderTop: "1px solid #eef2f7", background: sel ? "#f6fbfa" : "#fff" }}>
                                                <td style={{ padding: "7px 10px" }}><input type="checkbox" checked={sel} onChange={() => toggleSel(id)} style={{ width: 17, height: 17, cursor: "pointer" }} /></td>
                                                <td style={{ padding: "7px 10px", fontWeight: 800 }}>{p.naziv || "—"}<div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 700 }}>Šifra: {sifraP(p) || "—"}</div></td>
                                                <td style={{ padding: "7px 10px", fontSize: 11, color: "#475569", fontWeight: 700 }}>{matLabel(m) || "—"}</td>
                                                <td style={{ padding: "7px 10px", textAlign: "right" }}><input value={st.sirina ?? ""} onChange={e => setStavka(id, { sirina: e.target.value })} disabled={!sel} style={{ ...qin, width: 78, opacity: sel ? 1 : .5 }} /></td>
                                                <td style={{ padding: "7px 10px", textAlign: "right" }}><input value={st.duzina ?? ""} onChange={e => setStavka(id, { duzina: e.target.value, rolni: predlogRolni(f, e.target.value) })} disabled={!sel} style={{ ...qin, width: 84, opacity: sel ? 1 : .5 }} /></td>
                                                <td style={{ padding: "7px 10px", textAlign: "right" }}><input value={st.rolni ?? ""} onChange={e => setStavka(id, { rolni: e.target.value })} disabled={!sel} style={{ ...qin, width: 70, opacity: sel ? 1 : .5 }} /></td>
                                                <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                                                    <input value={st.cena ?? ""} placeholder="€" onChange={e => setStavka(id, { cena: e.target.value })} disabled={!sel} style={{ ...qin, width: 64, background: (sel && !(N_(st.cena) > 0)) ? "#fff7f7" : "#fffef5", borderColor: (sel && !(N_(st.cena) > 0)) ? "#fecaca" : "#cbd5e1", opacity: sel ? 1 : .5 }} />
                                                    <select value={st.jed || "m"} onChange={e => setStavka(id, { jed: e.target.value })} disabled={!sel} style={{ ...inp, width: 72, marginLeft: 4, padding: "6px 4px", opacity: sel ? 1 : .5 }}>{CENA_JED.map(j => <option key={j} value={j}>€/{j}</option>)}</select>
                                                </td>
                                                <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 900, color: r.vrednost > 0 ? "#0f172a" : "#cbd5e1" }}>{r.vrednost > 0 ? fmtN(r.vrednost) + " €" : "—"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* status materijala */}
                    {izabraniIds.length > 0 && (
                        matCheck.ok ? (
                            <div style={{ marginTop: 12, background: "#ecfdf5", border: "1px solid #bbf7d0", color: "#166534", borderRadius: 10, padding: "9px 13px", fontSize: 12.5, fontWeight: 800, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                                <span>✓ Materijal se poklapa kod {izabraniProizvodi.length} označenih — {matLabel(matCheck.mat)}</span>
                                <span>Vrednost naloga: <b style={{ fontSize: 15 }}>{fmtN(vrednost.uk)} €</b>{vrednost.bezCene.length ? <span style={{ fontWeight: 700 }}> ({vrednost.bezCene.length} bez cene)</span> : null}</span>
                            </div>
                        ) : matCheck.malo ? (
                            <div style={{ marginTop: 12, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: 10, padding: "9px 13px", fontSize: 12.5, fontWeight: 800 }}>Označi bar 2 proizvoda za objedinjavanje.</div>
                        ) : (
                            <div style={{ marginTop: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 10, padding: "9px 13px", fontSize: 12.5, fontWeight: 800 }}>⛔ Materijal se ne poklapa (razlika: {matCheck.razlika}). Objedinjavanje je blokirano — svi proizvodi moraju imati istu vrstu, pod-vrstu, oznaku, debljinu i proizvođača.</div>
                        )
                    )}

                    <div style={{ marginTop: 12 }}>
                        <button onClick={preracunaj} disabled={!matCheck.ok || rolneLoad} style={{ background: matCheck.ok ? "linear-gradient(135deg,#0d9488,#0f766e)" : "#cbd5e1", color: "#fff", border: "none", borderRadius: 10, padding: "11px 20px", fontWeight: 900, fontSize: 13, cursor: matCheck.ok ? "pointer" : "not-allowed" }}>{rolneLoad ? "Računam…" : "↻ Preračunaj plan rezanja"}</button>
                    </div>
                </div>
            )}

            {/* 3 · Plan rezanja + izbor rolni */}
            {plan && (
                <div style={{ ...card, padding: 16, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#0f766e", textTransform: "uppercase", letterSpacing: .5, marginBottom: 10 }}>3 · Zajednički plan rezanja (FIFO)</div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 12 }}>
                        {[["Matičnih rolni", z.maticnih ?? 0, "#2446b8"], ["Iskorišćenje", (z.iskoriscenje_pct ?? "—") + "%", "#059669"], ["Nastalih rolni", z.pokriveno_rolni ?? 0, "#059669"], ["Fali rolni", z.fali_rolni ?? 0, (z.fali_rolni ? "#dc2626" : "#94a3b8")]].map(([l, v, c]) =>
                            <div key={l} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>{l}</div>
                                <div style={{ fontSize: 22, fontWeight: 950, marginTop: 2, color: c }}>{v}</div>
                            </div>)}
                    </div>

                    {/* izabrane rolne */}
                    <div style={{ fontSize: 11.5, fontWeight: 900, color: "#334155", margin: "4px 0 8px" }}>Izabrane matične rolne ({izbor.length}) <button onClick={autoRolne} style={{ marginLeft: 8, border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, padding: "5px 11px", fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}>↺ Auto (FIFO)</button></div>
                    {(plan.nalozi || []).map(n => (
                        <div key={n.maticna_id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 11px", marginBottom: 6 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 900, fontSize: 12.5 }}>{n.br_rolne || n.maticna_id} · {n.sirina_mm} mm</div>
                                <div style={{ fontSize: 11, color: "#475569" }}>utrošak {fmtN(n.utrosak_m)} m · {(n.plan_reza || []).length} segmenata</div>
                            </div>
                            <div onClick={() => izbaciRolnu(n.br_rolne || n.maticna_id)} style={{ width: 24, height: 24, border: "1px solid #fecaca", color: "#ef4444", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, cursor: "pointer" }}>×</div>
                        </div>
                    ))}

                    {/* dodaj rolnu */}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <select value="" onChange={e => { dodajRolnu(e.target.value); e.target.value = ""; }} style={{ ...inp, flex: 1, cursor: "pointer" }}>
                            <option value="">+ Dodaj rolnu iz magacina ({kandidatiRolne.length}) — FIFO…</option>
                            {kandidatiRolne.map(r => <option key={r.id} value={r.br_rolne}>{r.br_rolne} · {r.vrsta} {r.oznaka_materijala || ""} · {r.deb || "?"}µ · {r.sirina} mm · {fmtN(N_(r.metraza_ost ?? r.metraza) - N_(r.rezervisano))} m · {r.datum_prijema || r.datum || ""}</option>)}
                        </select>
                        <button onClick={autoRolne} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}>↺ Auto</button>
                    </div>

                    {plan.fali && plan.fali.length > 0 && (
                        <div style={{ marginTop: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 10, padding: "9px 13px", fontSize: 12, fontWeight: 700 }}>
                            ⚠ Fali: {plan.fali.map((f, i) => <span key={i}>{f.rolni_kom}× {f.sirina_mm} mm × {fmtN(f.duzina_m)} m — {f.razlog}{i < plan.fali.length - 1 ? "; " : ""}</span>)}
                        </div>
                    )}

                    {/* footer kreiranje */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 12, borderTop: "1px solid #eef2f7", flexWrap: "wrap" }}>
                        <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 700 }}>Jedan nalog · {izabraniProizvodi.length} proizvoda · vrednost {fmtN(vrednost.uk)} € → kartica „Vrednost naloga"</div>
                        <button onClick={kreiraj} disabled={saving || !!broj || (plan.fali && plan.fali.length)} style={{ background: (saving || !!broj || (plan.fali && plan.fali.length)) ? "#cbd5e1" : "linear-gradient(135deg,#0d9488,#0f766e)", color: "#fff", border: "none", borderRadius: 10, padding: "11px 22px", fontWeight: 900, fontSize: 13, cursor: (saving || !!broj) ? "default" : "pointer" }}>{broj ? "✓ " + broj + " kreiran" : saving ? "Kreiram…" : "✓ Kreiraj objedinjen nalog"}</button>
                    </div>
                    {broj && <div style={{ marginTop: 10, background: "#ecfdf5", border: "1px solid #bbf7d0", color: "#166534", borderRadius: 10, padding: "9px 13px", fontSize: 12.5, fontWeight: 800 }}>✅ {broj} kreiran — nalog za rezanje + perforacija. Matične rolne rezervisane magacioneru, vrednost {fmtN(vrednost.uk)} € je na Dashboard kartici.</div>}
                </div>
            )}
        </div>
    );
}
