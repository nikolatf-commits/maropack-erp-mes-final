// ─────────────────────────────────────────────────────────────────────────────
//  MAROPACK — ALATI AI AGENTA
//
//  Ovde je spisak konkretnih radnji koje agent sme da pozove.
//  Agent ne "kuca po aplikaciji" — on bira alat, a aplikacija ga izvrši.
//
//  ČITANJE (cita: true)  → izvršava se odmah, ne menja ništa
//  UPIS    (cita: false) → ulazi u PLAN i čeka da korisnik klikne Potvrdi
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "../supabase.js";
import { nadjiSpojRolne } from "../modules/spojRolneMatch.js";
import { predloziFormatiranje } from "../modules/formatiranjeEngine.js";
import { dodeliBrojeveNaloga } from "../modules/dodeliBrojeve.js";
import { kalkulacijaFolije, kalkulacijaKese, kalkulacijaSpulne } from "./kalkulacijeCore.js";

const N = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const T = (v) => String(v ?? "").trim();
const UP = (v) => T(v).toUpperCase();

// Pretraga nezavisna od kvačica i redosleda reči: "maxi spanać" nađe "SPANAC 600 HR MAXI"
const BEZKV = (v) => String(v ?? "").toLowerCase()
    .replace(/š/g, "s").replace(/ć/g, "c").replace(/č/g, "c").replace(/ž/g, "z").replace(/đ/g, "dj")
    .replace(/\s+/g, " ").trim();
function sadrziSveReci(tekst, upit) {
    const t = BEZKV(tekst), reci = BEZKV(upit).split(" ").filter(Boolean);
    if (!reci.length) return true;
    return reci.every((r) => t.includes(r));
}

// Gustine za pretvaranje kg ↔ m (g/cm³)
const GUSTINE = { BOPP: 0.91, PP: 0.91, CPP: 0.90, PET: 1.40, BOPA: 1.15, PA: 1.15, PE: 0.92, LDPE: 0.92, HDPE: 0.95, ALU: 2.70, PAPIR: 1.00 };
function gm2Sloja(sloj) {
    if (N(sloj.gm2)) return N(sloj.gm2);
    const deb = N(sloj.debljina || sloj.deb);
    if (!deb) return 0;
    const g = GUSTINE[UP(sloj.vrsta)] || 0.91;
    return deb * g;              // µ × g/cm³ = g/m²
}

const NEAKTIVNO = /utros|utroš|iskoris|iskorišć|prodat|isporu|otpis|storn|obrisan|arhiv/i;
const naStanju = (r) => !NEAKTIVNO.test(T(r.status)) && N(r.metraza_ost ?? r.metraza) > 0;
const slobodno = (r) => Math.max(0, N(r.metraza_ost ?? r.metraza) - N(r.rezervisano));

// Učitava celu tabelu bez seckanja na 1000 redova.
async function sve(tabela, kolone = "*") {
    const PAGE = 1000;
    let od = 0, out = [];
    for (let i = 0; i < 50; i++) {
        const { data, error } = await supabase.from(tabela).select(kolone).range(od, od + PAGE - 1);
        if (error) throw new Error(tabela + ": " + error.message);
        const deo = data || [];
        out = out.concat(deo);
        if (deo.length < PAGE) break;
        od += PAGE;
    }
    return out;
}

// Nalog prikazuje količinu iz SAMOG TEMPLEJTA (kesaD/spulnaD/folija je tako čitaju).
// Zato u kopiju templejta koja ide u nalog upisujemo traženu količinu — inače bi na
// odštampanom nalogu stajala ona iz sačuvanog templejta.
function templejtSaKolicinom(tpl, tip, kolicina, jedinica) {
    const k = N(kolicina);
    if (!k) return tpl;
    const kopija = JSON.parse(JSON.stringify(tpl || {}));
    if (tip === "kesa") {
        kopija.kesa = { ...(kopija.kesa || {}), kolicina: k };
        kopija.porucenaKolicinaKom = k;
    } else if (tip === "spulna") {
        // Špulna računa po JEDINICI UNOSA (m2 | kom | kg | m) — bez nje broj nema značenje.
        const j = String(jedinica || "").toLowerCase();
        const jed = j === "kom" ? "kom" : j === "kg" ? "kg" : j === "m" ? "m" : (kopija.spulna && kopija.spulna.jedinicaUnosa) || "m2";
        kopija.spulna = { ...(kopija.spulna || {}), kolicina: k, jedinicaUnosa: jed };
        kopija.porucenaKolicinaKom = jed === "kom" ? k : (kopija.spulna.porucenaKolicinaKom || null);
    } else {
        kopija.porucenaKolicina = k;
    }
    return kopija;
}

// Sledeći broj naloga MP-<godina>-<4 cifre> — ista logika kao u Template Engine-u.
async function sledeciBrojNaloga() {
    const god = new Date().getFullYear();
    const pref = "MP-" + god + "-";
    const { data, error } = await supabase.from("radni_nalozi")
        .select("broj_naloga").like("broj_naloga", pref + "%")
        .order("broj_naloga", { ascending: false }).limit(1);
    if (error) throw new Error("Ne mogu da odredim sledeći broj naloga: " + error.message);
    const zadnji = data && data[0] && data[0].broj_naloga;
    const n = zadnji ? (parseInt(String(zadnji).split("-").pop(), 10) || 0) : 0;
    return pref + String(n + 1).padStart(4, "0");
}

// Koje operacije nastaju — preslikano iz programa (operacijeZa).
function operacijeZaTemplejt(tpl, tip) {
    const t = tpl || {};
    const grana = t[tip] || t.folija || {};
    const L = grana.layers || [];
    const st = grana.stampa || {};
    const brojBoja = Number(st.brojBoja) || 0;
    const imaBoje = Array.isArray(st.boje) && st.boje.some((b) => b && b.tip !== "Lak");
    const imaStampu = L.some((l) => l.st || l.stampa || l.stampa_se || l["Š"]) || brojBoja > 0 || imaBoje;
    const imaLak = L.some((l) => l.lak) || (Array.isArray(st.boje) && st.boje.some((b) => b && b.tip === "Lak"));
    const kas = grana.kasiranje || {};
    const imaKasiranje = L.length > 1 || Number(kas.brojKasiranja) > 0;

    if (tip === "spulna") return ["materijal", "spulna"];
    const sredina = [...(imaStampu ? ["stampa"] : []), ...(imaLak ? ["lakiranje"] : []), ...(imaKasiranje ? ["kasiranje"] : [])];
    if (tip === "kesa") return ["materijal", ...sredina, "kesa"];
    return ["materijal", ...sredina, "perforacija_rezanje"];
}

// ── Templejt: izvlači slojeve i idealnu širinu iz zapisa proizvoda ────────────
export function templejtIz(prod) {
    if (!prod) return { naziv: "", tip: "folija", idealna_sirina: 0, slojevi: [], stampa: null, kasiranje: null, sirovo: {} };

    // Template Engine čuva CEO templejt u koloni res.template (tamo su i perforacija,
    // dizajn/izgled na rolni, rezanje, štampa). Ranije se gledalo prod.data — te kolone nema.
    const t =
        (prod.res && (prod.res.template || prod.res.templejt)) ||
        (prod.standardi && prod.standardi.record && prod.standardi.record.data) ||
        (prod.data && (prod.data.template || prod.data)) ||
        prod.template || {};

    const tip = String(prod.tip || t.type || t.tip || "folija").toLowerCase();
    const grana = t[tip] || t.folija || t.kesa || t.spulna || {};

    let layers = grana.layers || t.layers || prod.mats || prod.materijali_struktura || prod.struktura_materijala || [];
    if (!Array.isArray(layers)) layers = [];

    return {
        naziv: prod.naziv || prod.name || t.naziv || t.prod || t.proizvod || "",
        tip,
        kupac: prod.kupac || t.kupac || "",
        idealna_sirina: N(t.idealnaSirinaMaterijala || grana.idealnaSirinaMaterijala || t.idealna_sirina || prod.sir),
        slojevi: layers.map((l) => ({
            vrsta: T(l.vrsta), pod_vrsta: T(l.pod_vrsta),
            oznaka: T(l.oznaka || l.oznaka_materijala || l.komercijalnaOznaka),
            debljina: N(l.debljina || l.deb),
            gm2: N(l.gm2 || l.tezina),
        })).filter((l) => l.vrsta),
        stampa: grana.stampa || t.stampa || null,
        kasiranje: grana.kasiranje || t.kasiranje || null,
        perforacija: t.perforacija || grana.perforacija || null,
        dizajn: t.dizajn || grana.dizajn || null,
        rezanje: t.rezanje || grana.rezanje || null,
        // sirovo = CEO templejt; ovo ide u nalog i nosi izgled na rolni, perforaciju, sve.
        sirovo: t,
    };
}

// Da li rolna odgovara traženom sloju
function rolnaOdgovara(r, sloj) {
    if (UP(r.vrsta) !== UP(sloj.vrsta)) return false;
    if (sloj.pod_vrsta && T(r.pod_vrsta) && UP(r.pod_vrsta) !== UP(sloj.pod_vrsta)) return false;
    if (sloj.oznaka && T(r.oznaka_materijala) && UP(r.oznaka_materijala) !== UP(sloj.oznaka)) return false;
    if (sloj.debljina && N(r.deb ?? r.debljina) && Math.abs(N(r.deb ?? r.debljina) - sloj.debljina) > 1) return false;
    return true;
}

// ═══════════════════════════ ALATI ═══════════════════════════════════════════

export const ALATI = {

    // ── ČITANJE ──────────────────────────────────────────────────────────────
    stanje_magacina: {
        cita: true,
        opis: "Zbirno stanje magacina po materijalu (rolni, metara, kg). Koristi kad korisnik pita šta ima na stanju.",
        ulaz: { vrsta: { type: "string", description: "Opciono: filtriraj po vrsti materijala, npr. BOPP" } },
        async izvrsi({ vrsta }) {
            const rolne = (await sve("magacin")).filter(naStanju);
            const f = vrsta ? rolne.filter((r) => UP(r.vrsta).includes(UP(vrsta))) : rolne;
            const g = {};
            f.forEach((r) => {
                const k = [T(r.vrsta), T(r.pod_vrsta), T(r.oznaka_materijala), N(r.deb) ? N(r.deb) + "µ" : ""].filter(Boolean).join(" · ") || "NEPOZNATO";
                g[k] = g[k] || { materijal: k, rolni: 0, metara: 0, slobodno_m: 0, kg: 0 };
                g[k].rolni++; g[k].metara += N(r.metraza_ost ?? r.metraza);
                g[k].slobodno_m += slobodno(r); g[k].kg += N(r.kg_neto ?? r.kg);
            });
            const lista = Object.values(g).map((x) => ({ ...x, metara: Math.round(x.metara), slobodno_m: Math.round(x.slobodno_m), kg: Math.round(x.kg) }))
                .sort((a, b) => b.metara - a.metara);
            return { ukupno_rolni: f.length, grupa: lista.slice(0, 40) };
        },
    },

    nadji_rolne: {
        cita: true,
        opis: "Traži konkretne rolne na stanju po materijalu i/ili širini. Vraća broj rolne, širinu, slobodne metre.",
        ulaz: {
            vrsta: { type: "string", description: "Vrsta materijala, npr. BOPP" },
            oznaka: { type: "string", description: "Oznaka materijala, npr. FXCWP" },
            debljina: { type: "number", description: "Debljina u µ" },
            min_sirina: { type: "number", description: "Najmanja širina u mm" },
        },
        async izvrsi(a) {
            const rolne = (await sve("magacin")).filter(naStanju).filter((r) => slobodno(r) > 0);
            const f = rolne.filter((r) => {
                if (a.vrsta && !UP(r.vrsta).includes(UP(a.vrsta))) return false;
                if (a.oznaka && !UP(r.oznaka_materijala).includes(UP(a.oznaka))) return false;
                if (a.debljina && Math.abs(N(r.deb ?? r.debljina) - N(a.debljina)) > 1) return false;
                if (a.min_sirina && N(r.sirina) < N(a.min_sirina)) return false;
                return true;
            });
            return {
                nadjeno: f.length,
                rolne: f.slice(0, 30).map((r) => ({
                    br_rolne: r.br_rolne, vrsta: r.vrsta, oznaka: r.oznaka_materijala,
                    debljina: N(r.deb ?? r.debljina), sirina_mm: N(r.sirina),
                    slobodno_m: Math.round(slobodno(r)), status: r.status, lokacija: r.lokacija || "",
                })),
            };
        },
    },

    nadji_spoj_rolne: {
        cita: true,
        opis: "Traži kaširane (spojene) rolne na stanju koje pokrivaju celu kombinaciju slojeva. Koristi za višeslojne proizvode.",
        ulaz: {
            slojevi: {
                type: "array", description: "Slojevi proizvoda",
                items: { type: "object", properties: { vrsta: { type: "string" }, oznaka: { type: "string" }, debljina: { type: "number" } }, required: ["vrsta"] },
            },
            min_sirina: { type: "number", description: "Najmanja širina u mm" },
        },
        async izvrsi({ slojevi, min_sirina }) {
            const magacin = await sve("magacin");
            const nadjene = nadjiSpojRolne(magacin, slojevi || [], { minSirina: N(min_sirina) });
            return {
                nadjeno: nadjene.length,
                rolne: nadjene.slice(0, 15).map((r) => ({
                    br_rolne: r.br_rolne, sastav: r.vrsta, opis: r.oznaka_materijala,
                    sirina_mm: N(r.sirina), slobodno_m: Math.round(r._slobodno),
                })),
            };
        },
    },

    lista_templejta: {
        cita: true,
        opis: "Spisak sačuvanih templejta (proizvoda) iz baze. Koristi da nađeš proizvod po nazivu.",
        ulaz: { naziv: { type: "string", description: "Deo naziva za pretragu, npr. SPANAC" } },
        async izvrsi({ naziv }) {
            const p = await sve("proizvodi");
            const f = naziv ? p.filter((x) => sadrziSveReci((x.naziv || x.name || "") + " " + (x.kupac || ""), naziv)) : p;
            return {
                nadjeno: f.length,
                proizvodi: f.slice(0, 25).map((x) => {
                    const t = templejtIz(x);
                    return { id: x.id, naziv: t.naziv, tip: t.tip, idealna_sirina: t.idealna_sirina, broj_slojeva: t.slojevi.length };
                }),
            };
        },
    },

    detalji_templejta: {
        cita: true,
        opis: "Ceo templejt jednog proizvoda: slojevi (vrsta, pod vrsta, oznaka, debljina), idealna širina, parametri štampe i kaširanja.",
        ulaz: { id: { type: "string", description: "ID proizvoda iz lista_templejta" } },
        async izvrsi({ id }) {
            const { data, error } = await supabase.from("proizvodi").select("*").eq("id", id).maybeSingle();
            if (error) throw new Error(error.message);
            if (!data) return { greska: "Proizvod nije nađen." };
            const t = templejtIz(data);
            return { id: data.id, naziv: t.naziv, tip: t.tip, idealna_sirina: t.idealna_sirina, slojevi: t.slojevi, stampa: t.stampa, kasiranje: t.kasiranje };
        },
    },

    provera_materijala: {
        cita: true,
        opis: "KLJUČNI ALAT: za dati proizvod (templejt) i količinu proverava sloj po sloj ima li materijala na stanju, šta fali i koje rolne su šire od idealne. Koristi pre kreiranja naloga.",
        ulaz: {
            proizvod_id: { type: "string", description: "ID proizvoda" },
            kolicina_m: { type: "number", description: "Potrebna dužina u metrima" },
        },
        async izvrsi({ proizvod_id, kolicina_m }) {
            const { data: prod } = await supabase.from("proizvodi").select("*").eq("id", proizvod_id).maybeSingle();
            if (!prod) return { greska: "Proizvod nije nađen." };
            const t = templejtIz(prod);
            const treba = N(kolicina_m);
            const magacin = (await sve("magacin")).filter(naStanju);

            const po_sloju = t.slojevi.map((sloj) => {
                const kand = magacin.filter((r) => rolnaOdgovara(r, sloj) && slobodno(r) > 0);
                const dovoljno = kand.filter((r) => N(r.sirina) >= t.idealna_sirina);
                const ukupno_m = dovoljno.reduce((a, r) => a + slobodno(r), 0);
                const sire = dovoljno.filter((r) => N(r.sirina) > t.idealna_sirina + 3);
                return {
                    sloj: [sloj.vrsta, sloj.pod_vrsta, sloj.oznaka, sloj.debljina ? sloj.debljina + "µ" : ""].filter(Boolean).join(" · "),
                    rolni_na_stanju: dovoljno.length,
                    slobodno_m: Math.round(ukupno_m),
                    treba_m: treba,
                    pokriveno: ukupno_m >= treba,
                    fali_m: Math.max(0, Math.round(treba - ukupno_m)),
                    rolne_sire_od_idealne: sire.length,
                    primer_rolni: dovoljno.slice(0, 5).map((r) => ({ br_rolne: r.br_rolne, sirina_mm: N(r.sirina), slobodno_m: Math.round(slobodno(r)) })),
                };
            });

            const spoj = t.slojevi.length >= 2 ? nadjiSpojRolne(magacin, t.slojevi, { minSirina: t.idealna_sirina }) : [];
            return {
                proizvod: t.naziv, idealna_sirina: t.idealna_sirina, trazena_kolicina_m: treba,
                sve_pokriveno: po_sloju.every((x) => x.pokriveno),
                po_sloju,
                spoj_rolne_na_stanju: spoj.slice(0, 5).map((r) => ({ br_rolne: r.br_rolne, sastav: r.vrsta, sirina_mm: N(r.sirina), slobodno_m: Math.round(r._slobodno) })),
            };
        },
    },

    lista_naloga: {
        cita: true,
        opis: "Spisak naloga sa statusom. Koristi za pitanja o tome šta je u radu, šta kasni, šta je završeno.",
        ulaz: { status: { type: "string", description: "Opciono: aktivni | zavrseni | svi" } },
        async izvrsi({ status }) {
            const master = await sve("radni_nalozi");
            const ops = await sve("operativni_nalozi");
            const zavrsen = (s) => /zavrs|završ|zatvor/i.test(T(s));
            const lista = master.map((m) => {
                const mine = ops.filter((o) => o.glavni_nalog_id === m.id);
                const gotov = mine.length > 0 && mine.every((o) => zavrsen(o.status));
                return {
                    broj: m.broj_naloga, proizvod: m.proizvod || m.naziv, kupac: m.kupac,
                    status: gotov ? "zavrsen" : (mine.length ? "aktivan" : "bez operacija"),
                    operacija_ukupno: mine.length,
                    operacija_zavrseno: mine.filter((o) => zavrsen(o.status)).length,
                    datum: m.created_at,
                };
            }).filter((x) => x.status !== "bez operacija");
            const f = status === "aktivni" ? lista.filter((x) => x.status === "aktivan")
                : status === "zavrseni" ? lista.filter((x) => x.status === "zavrsen") : lista;
            return { ukupno: f.length, nalozi: f.slice(0, 30) };
        },
    },

    detalji_naloga: {
        cita: true,
        opis: "Pokazuje jedan nalog do detalja: sve operacije, status, i DA LI NOSI TEMPLEJT (slojeve). Koristi posle kreiranja naloga da proveriš da li će se ispravno odštampati.",
        ulaz: { broj_naloga: { type: "string", description: "npr. MP-2026-0021" } },
        async izvrsi({ broj_naloga }) {
            const broj = T(broj_naloga);
            const { data: m } = await supabase.from("radni_nalozi").select("*").eq("broj_naloga", broj).maybeSingle();
            if (!m) return { greska: "Nalog " + broj + " nije nađen u radni_nalozi." };
            const { data: ops } = await supabase.from("operativni_nalozi").select("*").eq("glavni_nalog_id", m.id);
            const operacije = (ops || []).map((o) => {
                let par = o.parametri;
                if (typeof par === "string") { try { par = JSON.parse(par); } catch (e) { par = {}; } }
                par = par || {};
                const tpl = par.template || {};
                const sl = (tpl.folija && tpl.folija.layers) || (tpl.kesa && tpl.kesa.layers) || (tpl.spulna && tpl.spulna.layers) || tpl.layers || [];
                const grana = tpl.folija || tpl.kesa || tpl.spulna || {};
                return {
                    id: o.id, tip_naloga: o.tip_naloga, status: o.status,
                    uradjeno: N(o.uradjeno), skart: N(o.skart),
                    nosi_templejt: sl.length > 0,
                    slojeva: sl.length,
                    ima_stampu: !!(grana.stampa || tpl.stampa),
                    ima_perforaciju: !!(tpl.perforacija || grana.perforacija),
                    ima_izgled_na_rolni: !!(tpl.dizajn || grana.dizajn),
                    ima_rezanje: !!(tpl.rezanje || grana.rezanje),
                    materijal: sl.map((l) => [T(l.vrsta), T(l.oznaka || l.oznaka_materijala), N(l.debljina || l.deb) ? N(l.debljina || l.deb) + "µ" : ""].filter(Boolean).join(" ")).slice(0, 5),
                };
            });
            const bez = operacije.filter((o) => !o.nosi_templejt);
            return {
                broj: m.broj_naloga, proizvod: m.proizvod || m.naziv, kupac: m.kupac,
                status: m.status, datum: m.created_at,
                operacija_ukupno: operacije.length,
                operacije,
                upozorenje: bez.length
                    ? `${bez.length} operacija NE nosi templejt — te strane naloga bi se odštampale prazno („0 slojeva”).`
                    : "Sve operacije nose templejt — nalog će se ispravno odštampati.",
            };
        },
    },

    predlozi_formatiranje: {
        cita: true,
        opis: "Računa plan reza matičnih rolni na tražene širine (koje rolne seći, koliko traka, koliki otpad). Ne menja ništa — samo predlog.",
        ulaz: {
            vrsta: { type: "string", description: "Vrsta materijala" },
            oznaka: { type: "string", description: "Oznaka materijala" },
            debljina: { type: "number", description: "Debljina u µ" },
            sirina_mm: { type: "number", description: "Tražena širina trake u mm" },
            duzina_m: { type: "number", description: "Tražena dužina u metrima" },
            rolni_kom: { type: "number", description: "Koliko rolni treba" },
        },
        async izvrsi(a) {
            const magacin = await sve("magacin");
            const potrebe = [{
                id: "AI-1",
                materijal: { vrsta: a.vrsta, oznaka: a.oznaka, debljina: N(a.debljina) },
                sirina_mm: N(a.sirina_mm), duzina_m: N(a.duzina_m),
                rolni_kom: N(a.rolni_kom) || 1, odrediste: "stanje", napomena: "AI predlog",
            }];
            const r = predloziFormatiranje(potrebe, magacin, { kerf_mm: 0, zaokruziNavise: true, bocniOstatakNaStanje: true });
            return {
                maticnih: r.zbirno.maticnih, pokriveno_rolni: r.zbirno.pokriveno_rolni,
                fali_rolni: r.zbirno.fali_rolni, iskoriscenje_pct: r.zbirno.iskoriscenje_pct,
                plan: r.nalozi.map((n) => ({
                    maticna: n.br_rolne, sirina_mm: n.sirina_mm, utrosak_m: n.utrosak_m,
                    traka_ukupno: (n.plan_reza || []).reduce((s, x) => s + (x.trake || []).length, 0),
                })),
                fali: r.fali,
                _plan_sirovo: r,
            };
        },
    },

    analiza_otpada: {
        cita: true,
        opis: "Analiza potrošnje i otpada iz istorije magacina za zadati period.",
        ulaz: { dana: { type: "number", description: "Koliko dana unazad (podrazumevano 30)" } },
        async izvrsi({ dana }) {
            const d = new Date(); d.setDate(d.getDate() - (N(dana) || 30));
            const { data, error } = await supabase.from("magacin_istorija").select("*").gte("created_at", d.toISOString()).limit(2000);
            if (error) return { greska: "magacin_istorija: " + error.message };
            const redovi = data || [];
            const utroseno = redovi.reduce((a, r) => a + Math.abs(N(r.promena_m)), 0);
            const poNalogu = {};
            redovi.forEach((r) => {
                const k = T(r.nalog_ponbr) || "bez naloga";
                poNalogu[k] = (poNalogu[k] || 0) + Math.abs(N(r.promena_m));
            });
            return {
                period_dana: N(dana) || 30, zapisa: redovi.length, ukupno_utroseno_m: Math.round(utroseno),
                po_nalogu: Object.entries(poNalogu).map(([nalog, m]) => ({ nalog, metara: Math.round(m) })).sort((a, b) => b.metara - a.metara).slice(0, 15),
            };
        },
    },

    pretrazi_razgovore: {
        cita: true,
        opis: "Pretražuje RANIJE razgovore sa korisnikom (AI memorija). Koristi kad se korisnik poziva na nešto od ranije: „ono što smo pričali“, „kao prošli put“, „šta sam ti rekao za X“, ili kad ti treba podatak koji je korisnik već davao (cene, marže, pravila, odluke).",
        ulaz: {
            pojam: { type: "string", description: "Ključna reč ili tema, npr. SPANAC, marža, Plastchim, kesa za kafu" },
            koliko: { type: "number", description: "Koliko rezultata (podrazumevano 10)" },
        },
        async izvrsi({ pojam, koliko }) {
            const n = N(koliko) || 10;
            const q = T(pojam);
            try {
                let redovi = [];
                if (q) {
                    const { data } = await supabase.from("ai_interakcije").select("*")
                        .or(`pitanje.ilike.%${q}%,odgovor.ilike.%${q}%`)
                        .order("created_at", { ascending: false }).limit(n);
                    redovi = data || [];
                }
                if (!redovi.length) {
                    // rezerva: povuci skorije pa filtriraj lokalno (ako baza ne podržava .or)
                    const { data } = await supabase.from("ai_interakcije").select("*")
                        .order("created_at", { ascending: false }).limit(2000);
                    const svi = data || [];
                    redovi = q
                        ? svi.filter((r) => UP(r.pitanje + " " + r.odgovor).includes(UP(q))).slice(0, n)
                        : svi.slice(0, n);
                }
                if (!redovi.length) return { nadjeno: 0, napomena: "Nema ranijih razgovora na tu temu." };
                return {
                    nadjeno: redovi.length,
                    razgovori: redovi.map((r) => ({
                        datum: String(r.created_at || "").slice(0, 16).replace("T", " "),
                        pitanje: String(r.pitanje || "").slice(0, 400),
                        odgovor: String(r.odgovor || "").slice(0, 900),
                    })),
                };
            } catch (e) {
                return { greska: "Memorija nije dostupna: " + (e.message || String(e)) };
            }
        },
    },

    procitaj_ponude: {
        cita: true,
        opis: "Čita sačuvane PONUDE — broj, kupac, proizvod, količina, vrednost, status, i da li su iz njih nastali nalozi.",
        ulaz: {
            kupac: { type: "string", description: "Deo naziva kupca" },
            proizvod: { type: "string", description: "Deo naziva proizvoda" },
            status: { type: "string", description: "npr. Nova | prihvaceno | realizovana" },
            koliko: { type: "number", description: "Koliko najskorijih (podrazumevano 25)" },
        },
        async izvrsi(a) {
            const { data, error } = await supabase.from("ponude").select("*").order("created_at", { ascending: false }).limit(400);
            if (error) return { greska: "ponude: " + error.message };
            let red = data || [];
            if (T(a.kupac)) red = red.filter((r) => sadrziSveReci(r.kupac || "", a.kupac));
            if (T(a.proizvod)) red = red.filter((r) => sadrziSveReci((r.proizvod || r.naziv || ""), a.proizvod));
            if (T(a.status)) red = red.filter((r) => sadrziSveReci(r.status || "", a.status));

            // da li je iz ponude nastao nalog
            let veze = [];
            try {
                const { data: rn } = await supabase.from("radni_nalozi").select("broj_naloga, ponuda_id").limit(2000);
                veze = rn || [];
            } catch (e) { }

            return {
                nadjeno: red.length,
                ponude: red.slice(0, N(a.koliko) || 25).map((r) => {
                    const pod = (typeof r.podaci === "string" ? (() => { try { return JSON.parse(r.podaci); } catch (e) { return {}; } })() : r.podaci) || {};
                    const nal = veze.filter((x) => String(x.ponuda_id) === String(r.id)).map((x) => x.broj_naloga);
                    return {
                        id: r.id, broj: r.broj, datum: r.datum || r.created_at,
                        kupac: r.kupac, proizvod: r.proizvod || r.naziv, tip: r.tip || r.tip_proizvoda,
                        kolicina: N(r.kolicina ?? r.kol) || null,
                        jedinica: pod.jedinica || null,
                        cena_jedinicna: N(pod.cena_jedinicna) || null,
                        vrednost: N(r.cena_ukupno ?? pod.vrednost) || null,
                        status: r.status, napomena: r.nap || null,
                        nalozi_iz_ponude: nal,
                    };
                }),
            };
        },
    },

    procitaj_kalkulacije: {
        cita: true,
        opis: "Čita SAČUVANE kalkulacije (folija, kesa, špulna) — koja je marža i škart korišćen, koja je bila cena, za kog kupca i kada. Koristi kad korisnik pita „koja je bila marža za X” ili „šta smo računali za tog kupca”.",
        ulaz: {
            naziv: { type: "string", description: "Deo naziva proizvoda" },
            kupac: { type: "string", description: "Deo naziva kupca" },
            tip: { type: "string", description: "folija | kesa | spulna — ako se traži samo jedna vrsta" },
            koliko: { type: "number", description: "Koliko najskorijih (podrazumevano 20)" },
        },
        async izvrsi(a) {
            const tabele = [
                { t: "kalkulacije_folije", tip: "folija" },
                { t: "kalkulacije_kese", tip: "kesa" },
                { t: "kalkulacije_spulne", tip: "spulna" },
            ].filter((x) => !T(a.tip) || x.tip === T(a.tip).toLowerCase());

            let sve = [];
            const greske = [];
            for (const { t, tip } of tabele) {
                try {
                    const { data, error } = await supabase.from(t).select("*").order("created_at", { ascending: false }).limit(300);
                    if (error) { greske.push(t + ": " + error.message); continue; }
                    (data || []).forEach((r) => sve.push({ ...r, _tip: tip }));
                } catch (e) { greske.push(t + ": " + (e.message || String(e))); }
            }
            if (!sve.length) return { nadjeno: 0, napomena: greske.length ? "Ne mogu da čitam: " + greske.join("; ") : "Nema sačuvanih kalkulacija." };

            if (T(a.naziv)) sve = sve.filter((r) => sadrziSveReci(r.naziv || "", a.naziv));
            if (T(a.kupac)) sve = sve.filter((r) => sadrziSveReci(r.kupac || "", a.kupac));
            sve.sort((x, y) => String(y.created_at || "").localeCompare(String(x.created_at || "")));

            const lim = N(a.koliko) || 20;
            return {
                nadjeno: sve.length,
                kalkulacije: sve.slice(0, lim).map((r) => {
                    const rez = (typeof r.rezultati === "string" ? (() => { try { return JSON.parse(r.rezultati); } catch (e) { return {}; } })() : r.rezultati) || {};
                    return {
                        id: r.id, tip: r._tip, naziv: r.naziv, kupac: r.kupac,
                        datum: r.created_at,
                        marza_pct: N(r.marza), skart_pct: N(r.skart),
                        sirina: N(r.sirina) || null, duzina: N(r.duzina) || null,
                        metraza: N(r.metraza) || null, kolicina: N(r.kolicina) || null,
                        osnovna_cena: N(rez.osnovna_cena) || N(rez.osnovna) || null,
                        konacna_cena: N(rez.konacna_cena) || N(rez.konacna) || null,
                        jedinica: rez.jedinica || (r._tip === "folija" ? "€ / 1000 m" : r._tip === "kesa" ? "€ / 1000 kom" : "€ po špulni"),
                        cena_po_kg: N(rez.cena_po_kg_sa_marzom) || null,
                        // ulazni podaci — dovoljni da se kalkulacija PONOVI sa drugom maržom
                        ulaz_za_ponavljanje: {
                            sirina: N(r.sirina), metraza: N(r.metraza), nalog: N(r.nalog) || 1,
                            duzina: N(r.duzina), klapna: N(r.klapna), falta: N(r.falta), kolicina: N(r.kolicina),
                            skart: N(r.skart), marza: N(r.marza),
                            materijali: r.materijali || [], lepak: r.lepak || [], lak: r.lak || {},
                            kasiranje: r.kasiranje || {}, stampaCena: N(r.stampa_cena), lakiranjeCena: N(r.lakiranje_cena),
                            transport: N(r.transport), pakovanje: N(r.pakovanje), dorada: N(r.dorada),
                            tezinaGM2: N(r.tezina_gm2), cenaM2: N(r.cena_kg) || N(r.cena_m2),
                        },
                    };
                }),
                napomena: "U polju ulaz_za_ponavljanje su svi ulazi — prosledi ih alatu kalkulacija_* sa novom maržom da uporediš cene.",
            };
        },
    },

    pregled_tabele: {
        cita: true,
        opis: "Čita ostale sačuvane podatke koje nemaju svoj alat: mašine, radnici, zastoji, kontrola kvaliteta, gotovi proizvodi, faze proizvodnje, kalkulacije (opšte), plan proizvodnje. Koristi kad korisnik pita nešto van magacina/naloga/kalkulacija.",
        ulaz: {
            tabela: { type: "string", description: "masine | radnici | zastoji | qc_kontrole | magacin_gotovi_proizvodi | faze_proizvodnje | kalkulacije | plan_proizvodnje | nalog_aktivnosti" },
            trazi: { type: "string", description: "Opciono: reč koja se traži bilo gde u redu" },
            koliko: { type: "number", description: "Koliko redova (podrazumevano 30, najviše 100)" },
        },
        async izvrsi(a) {
            // Bela lista + zamene imena ako se tabela drugačije zove.
            const DOZVOLJENO = {
                masine: ["masine"], radnici: ["radnici"],
                zastoji: ["zastoji", "nalog_zastoji"],
                qc_kontrole: ["qc_kontrole", "qc_zapisnici"],
                magacin_gotovi_proizvodi: ["magacin_gotovi_proizvodi"],
                faze_proizvodnje: ["faze_proizvodnje"],
                kalkulacije: ["kalkulacije"],
                plan_proizvodnje: ["plan_proizvodnje", "plan"],
                nalog_aktivnosti: ["nalog_aktivnosti"],
                mes_sesije: ["mes_sesije"],
                material_master: ["material_master", "materijali"],
            };
            const kljuc = T(a.tabela).toLowerCase();
            const kandidati = DOZVOLJENO[kljuc];
            if (!kandidati) return { greska: "Tabela nije dozvoljena. Moguće: " + Object.keys(DOZVOLJENO).join(", ") };

            let red = [], koriscena = "", greske = [];
            for (const t of kandidati) {
                try {
                    const { data, error } = await supabase.from(t).select("*").limit(500);
                    if (error) { greske.push(t + ": " + error.message); continue; }
                    if (data) { red = data; koriscena = t; break; }
                } catch (e) { greske.push(t + ": " + (e.message || String(e))); }
            }
            if (!koriscena) return { greska: "Ne mogu da čitam: " + greske.join("; ") };

            if (T(a.trazi)) red = red.filter((r) => sadrziSveReci(JSON.stringify(r), a.trazi));
            const lim = Math.min(N(a.koliko) || 30, 100);
            // skrati velika polja da odgovor ne bude ogroman
            const skrati = (r) => {
                const o = {};
                Object.keys(r).forEach((k) => {
                    let v = r[k];
                    if (v && typeof v === "object") v = JSON.stringify(v).slice(0, 300);
                    else if (typeof v === "string" && v.length > 300) v = v.slice(0, 300) + "…";
                    if (v !== null && v !== "" && v !== undefined) o[k] = v;
                });
                return o;
            };
            return { tabela: koriscena, ukupno: red.length, redovi: red.slice(0, lim).map(skrati) };
        },
    },

    cene_materijala: {
        cita: true,
        opis: "Cene materijala iz baze (€/kg). Koristi PRE kalkulacije da uzmeš stvarne cene umesto da pretpostavljaš.",
        ulaz: { vrsta: { type: "string", description: "Opciono: filtriraj po vrsti/oznaci" } },
        async izvrsi({ vrsta }) {
            let redovi = [];
            for (const tab of ["material_cene", "material_master", "materijali"]) {
                try {
                    const { data, error } = await supabase.from(tab).select("*").limit(400);
                    if (!error && data && data.length) { redovi = data.map((r) => ({ ...r, _tabela: tab })); break; }
                } catch (e) { }
            }
            if (!redovi.length) return { napomena: "Nema tabele sa cenama — pitaj korisnika za cenu €/kg." };
            const f = vrsta ? redovi.filter((r) => UP(JSON.stringify(r)).includes(UP(vrsta))) : redovi;
            return {
                izvor: redovi[0]._tabela, nadjeno: f.length,
                cene: f.slice(0, 30).map((r) => ({
                    naziv: r.naziv || r.vrsta || r.materijal || r.oznaka || "",
                    vrsta: r.vrsta || "", oznaka: r.oznaka || r.oznaka_materijala || "",
                    debljina: N(r.deb ?? r.debljina) || null,
                    gm2: N(r.gm2 ?? r.tezina ?? r.gramatura) || null,
                    cena_kg: N(r.cena_kg ?? r.cena ?? r.cenaKg) || null,
                })),
            };
        },
    },

    kalkulacija_folije: {
        cita: true,
        opis: "Računa kalkulaciju FOLIJE po formulama Maropack-a (Excel logika). Vraća i razrađen račun korak po korak. Ako ne znaš cenu materijala, prvo pozovi cene_materijala.",
        ulaz: {
            sirina: { type: "number", description: "Širina u mm" },
            metraza: { type: "number", description: "Metraža za obračun (podrazumevano 1000 m)" },
            materijali: {
                type: "array", description: "Slojevi",
                items: { type: "object", properties: { naziv: { type: "string" }, tezina: { type: "number", description: "g/m²" }, cena: { type: "number", description: "€/kg" }, stampa: { type: "boolean" }, lakira: { type: "boolean" } }, required: ["tezina", "cena"] },
            },
            skart: { type: "number", description: "Škart u %, tipično 10" },
            marza: { type: "number", description: "Marža u %, tipično 27" },
            stampaCena: { type: "number", description: "€/kg štampe" },
            transport: { type: "number", description: "€/kg transporta" },
            lepak: { type: "array", description: "Lepak: [{utrosak, prolazi, cena}]", items: { type: "object" } },
            kasiranje: { type: "object", description: "{ cena } — cena kaširanja" },
            nalog: { type: "number", description: "Koliko puta po toj metraži (za ceo nalog)" },
        },
        async izvrsi(a) { return kalkulacijaFolije(a); },
    },

    kalkulacija_kese: {
        cita: true,
        opis: "Računa kalkulaciju KESE po formulama Maropack-a. Vraća cenu na 1000 komada i po komadu, sa razrađenim računom.",
        ulaz: {
            sirina: { type: "number", description: "Širina kese u mm" },
            duzina: { type: "number", description: "Dužina kese u mm" },
            klapna: { type: "number", description: "Klapna u mm" },
            falta: { type: "number", description: "Falta u mm" },
            kolicina: { type: "number", description: "Broj komada" },
            materijali: { type: "array", description: "Slojevi [{tezina g/m², cena €/kg}]", items: { type: "object" } },
            skart: { type: "number" }, marza: { type: "number" },
            stampa: { type: "boolean" }, stampaCena: { type: "number", description: "€/kg" },
            transportCena: { type: "number", description: "€/kg" },
            ostaleOpcijeEur: { type: "number", description: "Zbir ostalih opcija u € na 1000 kom" },
        },
        async izvrsi(a) { return kalkulacijaKese(a); },
    },

    kalkulacija_spulne: {
        cita: true,
        opis: "Računa kalkulaciju ŠPULNE po formulama Maropack-a. Vraća cenu po špulni i na 1000 m.",
        ulaz: {
            sirina: { type: "number", description: "Širina trake u mm" },
            duzina: { type: "number", description: "Dužina u m" },
            tezinaGM2: { type: "number", description: "Gramaža g/m²" },
            cenaM2: { type: "number", description: "Cena materijala €/m²" },
            troskoviM2: { type: "number", description: "Troškovi obrade €/m²" },
            cenaKutije: { type: "number" }, cenaHilzne: { type: "number" },
            transport: { type: "number", description: "€ po špulni" },
            skart: { type: "number" }, marza: { type: "number" },
            kolicina: { type: "number", description: "Broj špulni" },
        },
        async izvrsi(a) { return kalkulacijaSpulne(a); },
    },

    sifarnik_materijala: {
        cita: true,
        opis: "OBAVEZNO PRE UNOSA ROLNI: pokazuje kako Maropack VEĆ imenuje materijale u magacinu (postojeće kombinacije vrsta / pod vrsta / oznaka / debljina, i koji dobavljač ih šalje). Koristi da nove rolne dobiju ISTO ime kao postojeće, a ne novo.",
        ulaz: {
            vrsta: { type: "string", description: "Opciono: suzi na vrstu, npr. BOPP" },
            oznaka: { type: "string", description: "Opciono: traži po oznaci, npr. FXC" },
        },
        async izvrsi(a) {
            const rolne = await sve("magacin");
            const g = {};
            rolne.forEach((r) => {
                if (UP(r.tip) === "SPOJ") return;                    // spoj rolne nisu ulazni materijal
                const v = T(r.vrsta); if (!v) return;
                const k = [v, T(r.pod_vrsta), T(r.oznaka_materijala), N(r.deb ?? r.debljina)].join("|");
                if (!g[k]) g[k] = {
                    vrsta: v, pod_vrsta: T(r.pod_vrsta), oznaka: T(r.oznaka_materijala),
                    debljina: N(r.deb ?? r.debljina), rolni: 0, sirine: new Set(), dobavljaci: new Set(),
                };
                g[k].rolni++;
                if (N(r.sirina)) g[k].sirine.add(N(r.sirina));
                const d = T(r.dobavljac) || T(r.proizvodjac); if (d) g[k].dobavljaci.add(d);
            });
            let lista = Object.values(g).map((x) => ({
                vrsta: x.vrsta, pod_vrsta: x.pod_vrsta, oznaka: x.oznaka, debljina: x.debljina,
                rolni_na_stanju: x.rolni,
                sirine_mm: Array.from(x.sirine).sort((p, q) => p - q).slice(0, 8),
                dobavljaci: Array.from(x.dobavljaci).slice(0, 4),
            }));
            if (T(a.vrsta)) lista = lista.filter((x) => UP(x.vrsta).includes(UP(a.vrsta)));
            if (T(a.oznaka)) lista = lista.filter((x) => UP(x.oznaka).includes(UP(a.oznaka)));
            lista.sort((p, q) => q.rolni_na_stanju - p.rolni_na_stanju);
            return {
                napomena: "Ovo su imena koja Maropack VEĆ koristi. Nove rolne uklopi u njih — ne izmišljaj nova imena.",
                razlicitih: lista.length,
                materijali: lista.slice(0, 60),
            };
        },
    },

    procitaj_pravila: {
        cita: true,
        opis: "Čita naučena pravila (marže, gustine, konvencije, dogovori sa kupcima). Sistem ih ionako šalje na početku, ali pozovi ako ti treba puna lista ili tražiš po oblasti.",
        ulaz: { oblast: { type: "string", description: "Opciono: kalkulacije | magacin | kupci | proizvodnja" } },
        async izvrsi({ oblast }) {
            try {
                let q = supabase.from("ai_pravila").select("*").eq("aktivno", true).order("oblast");
                const { data, error } = await q;
                if (error) return { napomena: "Tabela ai_pravila ne postoji — pusti ai_pravila.sql." };
                let redovi = data || [];
                if (T(oblast)) redovi = redovi.filter((r) => UP(r.oblast).includes(UP(oblast)));
                return { broj: redovi.length, pravila: redovi.map((r) => ({ id: r.id, oblast: r.oblast, pravilo: r.pravilo })) };
            } catch (e) { return { napomena: "Pravila nisu dostupna." }; }
        },
    },

    napravi_dokument: {
        cita: true,
        opis: "Pravi dokument koji korisnik može da preuzme kao Excel (CSV) ili odštampa u PDF: ponuda, specifikacija, izveštaj, spisak rolni, kalkulacija. Ne menja bazu — samo priprema dokument.",
        ulaz: {
            naslov: { type: "string", description: "Naslov dokumenta, npr. „Ponuda 2026-014 — La Linea”" },
            podnaslov: { type: "string", description: "Kupac, datum, broj naloga…" },
            zaglavlja: { type: "array", items: { type: "string" }, description: "Nazivi kolona" },
            redovi: { type: "array", description: "Redovi tabele — svaki red je niz vrednosti", items: { type: "array", items: { type: "string" } } },
            zakljucak: { type: "string", description: "Tekst ispod tabele: ukupno, uslovi, napomene" },
        },
        async izvrsi(a) {
            const zag = Array.isArray(a.zaglavlja) ? a.zaglavlja.map(T) : [];
            const red = Array.isArray(a.redovi) ? a.redovi.map((r) => (Array.isArray(r) ? r.map(T) : [T(r)])) : [];
            if (!zag.length || !red.length) return { greska: "Dokument mora imati zaglavlja i bar jedan red." };
            return {
                dokument: {
                    naslov: T(a.naslov) || "Dokument",
                    podnaslov: T(a.podnaslov),
                    zaglavlja: zag,
                    redovi: red,
                    zakljucak: T(a.zakljucak),
                    napravljen: new Date().toISOString(),
                },
                napomena: "Dokument je spreman — korisniku su ispod poruke dugmad „Preuzmi Excel” i „Štampaj / PDF”.",
            };
        },
    },

    // ── UPIS (traži potvrdu) ─────────────────────────────────────────────────
    kreiraj_nalog_iz_templejta: {
        cita: false,
        opis: "Pravi radni nalog + operativne naloge iz sačuvanog templejta, isto kao program (brojevi MP-GODINA-XXXX). PODRAZUMEVANO BEZ PONUDE — ponuda se pravi samo ako korisnik izričito traži (sa_ponudom=true). MENJA BAZU — traži potvrdu.",
        ulaz: {
            proizvod_id: { type: "string", description: "ID proizvoda" },
            kolicina: { type: "number", description: "Količina" },
            jedinica: { type: "string", description: "m | kg | kom — u čemu je količina zadata (podrazumevano m)" },
            kupac: { type: "string", description: "Naziv kupca" },
            sa_ponudom: { type: "boolean", description: "PODRAZUMEVANO false — nalozi se prave direktno, BEZ ponude. Postavi true SAMO ako je korisnik izričito tražio i ponudu." },
        },
        opisPlana: (a, ctx) => `Napravi nalog za „${ctx?.naziv || a.proizvod_id}" — ${a.kolicina} ${a.jedinica || "m"}` +
            `${a.kupac ? ", kupac " + a.kupac : ""}${a.sa_ponudom ? " (+ ponuda)" : " (bez ponude)"}`,
        async izvrsi(a) {
            const { data: prod } = await supabase.from("proizvodi").select("*").eq("id", a.proizvod_id).maybeSingle();
            if (!prod) return { ok: false, poruka: "Proizvod nije nađen." };
            const t = templejtIz(prod);

            // Ako je količina data u KILOGRAMIMA, pretvori je u metre (nalozi idu u metrima).
            const jed = (T(a.jedinica) || (t.tip === "folija" ? "m" : t.tip === "spulna" ? "m2" : "kom")).toLowerCase();
            let kolicina = N(a.kolicina), racun = "";
            // Kilograme pretvaramo u metre SAMO za foliju. Špulna ima svoju jedinicu unosa
            // (m² / kom / kg / m) i sama računa, a kesa ide u komadima.
            if (t.tip === "folija" && jed === "kg" && kolicina > 0) {
                const gm2Uk = t.slojevi.reduce((z, l) => z + gm2Sloja(l), 0);
                const sir = N(t.idealna_sirina);
                if (!gm2Uk || !sir) {
                    return { ok: false, poruka: "Ne mogu da pretvorim kg u metre — templejtu fali " + (!sir ? "idealna širina" : "debljina sloja") + ". Zadaj količinu u metrima." };
                }
                const m = (kolicina * 1000000) / (sir * gm2Uk);
                racun = `${N(a.kolicina)} kg → ${Math.round(m).toLocaleString("sr-RS")} m (širina ${sir} mm, ${Math.round(gm2Uk * 10) / 10} g/m²)`;
                kolicina = Math.round(m);
            }

            // ── PUT A: direktno u naloge (podrazumevano — bez ponude) ────────────
            if (!a.sa_ponudom) {
                const broj = await sledeciBrojNaloga();
                const tplZaNalog = templejtSaKolicinom(t.sirovo, t.tip, kolicina, jed);
                const zajednicko = {
                    broj_naloga: broj, tip_proizvoda: t.tip,
                    kupac: T(a.kupac) || "", naziv: t.naziv, proizvod: t.naziv,
                };
                const { data: master, error: mErr } = await supabase.from("radni_nalozi").insert([{
                    ...zajednicko,
                    status: "ceka_magacin",
                    parametri: {
                        sifra: t.sirovo?.sifra || "",
                        template: tplZaNalog,
                        porucena_kolicina: kolicina,
                        kolicina_za_rad: kolicina,
                        idealna_sirina: t.idealna_sirina || "",
                        jedinica_unosa: t.tip === "folija" ? "m" : t.tip === "spulna" ? "m2" : "kom",
                        datum: new Date().toLocaleDateString("sr-RS"),
                        izvor: "AI agent" + (racun ? " · " + racun : ""),
                    },
                    rezultati: {},
                }]).select("id").single();
                if (mErr) return { ok: false, poruka: "radni_nalozi: " + mErr.message };

                const lista = operacijeZaTemplejt(t.sirovo, t.tip);
                const ops = lista.map((op, i) => ({
                    ...zajednicko,
                    broj_naloga: broj + "-" + op.toUpperCase(),
                    glavni_nalog_id: master.id,
                    tip_naloga: op,
                    status: op === "materijal" ? "ceka_magacin" : "ceka",
                    redosled: i + 1,
                    parametri: { sifra: t.sirovo?.sifra || "", template: tplZaNalog },
                }));
                const { error: oErr } = await supabase.from("operativni_nalozi").insert(ops);
                if (oErr) return { ok: false, poruka: "operativni_nalozi: " + oErr.message };

                return {
                    ok: true,
                    poruka: `Nalog ${broj} napravljen za „${t.naziv}" (${racun || kolicina.toLocaleString("sr-RS") + " " + (t.tip === "folija" ? "m" : jed)}) — ` +
                        `${ops.length} operacija: ${lista.join(", ")}. Bez ponude.`,
                    broj, glavni_nalog_id: master.id, operacije: lista,
                };
            }

            // ── PUT B: preko ponude (samo kad korisnik izričito traži) ────────────
            const payload = {
                broj: "PON-AI-" + Date.now(), datum: new Date().toLocaleDateString("sr-RS"),
                kupac: a.kupac || "AI nalog", naziv: t.naziv, proizvod: t.naziv, tip: t.tip,
                kol: kolicina || null, kolicina: kolicina || null,
                struktura: t.slojevi, mats: t.slojevi, status: "prihvaceno",
                nap: "Kreirano preko AI agenta" + (racun ? " · " + racun : ""),
                template_id: prod.template_id || prod.id || null,
                res: { template: templejtSaKolicinom(t.sirovo, t.tip, kolicina, jed), operacije: [], kupac: a.kupac || "", kolicina, zadato: { kolicina: N(a.kolicina), jedinica: jed } },
            };
            const { data: pon, error: oe } = await supabase.from("ponude").insert([payload]).select().single();
            if (oe || !pon) return { ok: false, poruka: "Ponuda nije kreirana: " + (oe?.message || "nepoznato") };
            const { error: re } = await supabase.rpc("kreiraj_naloge_iz_ponude", { p_ponuda_id: pon.id });
            if (re) return { ok: false, poruka: "Ponuda napravljena, ali nalozi nisu: " + re.message };
            // Nađi kreirani glavni nalog
            let broj = "", masterId = null;
            try {
                const { data: mr } = await supabase.from("radni_nalozi").select("id, broj_naloga").eq("ponuda_id", pon.id).order("created_at", { ascending: false }).limit(1);
                if (mr && mr[0]) { broj = mr[0].broj_naloga; masterId = mr[0].id; }
            } catch (e) { }

            // VAŽNO: RPC ne mora da prekopira templejt u same operacije. Bez toga bi
            // odštampan nalog pokazivao "0 slojeva" i prazne parametre. Zato ga upisujemo mi.
            let dopunjeno = 0;
            const upozorenja = [];
            if (masterId) {
                try {
                    const { data: ops } = await supabase.from("operativni_nalozi").select("id, parametri, tip_naloga").eq("glavni_nalog_id", masterId);
                    for (const op of (ops || [])) {
                        let par = op.parametri;
                        if (typeof par === "string") { try { par = JSON.parse(par); } catch (e) { par = {}; } }
                        par = par || {};
                        const imaSlojeve = par?.template?.folija?.layers?.length || par?.template?.[t.tip]?.layers?.length;
                        if (imaSlojeve) continue;
                        const noviPar = {
                            ...par,
                            sifra: t.sirovo?.sifra || null,
                            template: templejtSaKolicinom(t.sirovo, t.tip, kolicina, jed),
                            kupac: a.kupac || "",
                            kolicina: kolicina || null,
                        };
                        const { error: ue } = await supabase.from("operativni_nalozi")
                            .update({ parametri: noviPar, tip_proizvoda: t.tip }).eq("id", op.id);
                        if (ue) upozorenja.push("operacija " + op.id + ": " + ue.message); else dopunjeno++;
                    }
                } catch (e) { upozorenja.push("dopuna templejta: " + (e.message || String(e))); }
            }

            return {
                ok: true,
                poruka: `Nalog napravljen za „${t.naziv}"${broj ? " · " + broj : ""} (${racun || kolicina + " m"})` +
                    (dopunjeno ? `, templejt upisan u ${dopunjeno} operacija.` : ".") +
                    (upozorenja.length ? " Upozorenja: " + upozorenja.join("; ") : ""),
                broj, glavni_nalog_id: masterId, operacija_dopunjeno: dopunjeno,
            };
        },
    },

    rezervisi_rolne: {
        cita: false,
        opis: "Rezerviše rolne za nalog (magacioner ih sprema). MENJA BAZU — traži potvrdu.",
        ulaz: {
            br_rolne: { type: "array", items: { type: "string" }, description: "Brojevi rolni" },
            broj_naloga: { type: "string", description: "Za koji nalog" },
        },
        opisPlana: (a) => `Rezerviši ${(a.br_rolne || []).length} rolni za nalog ${a.broj_naloga}`,
        async izvrsi(a) {
            const brojevi = a.br_rolne || [];
            let ok = 0; const greske = [];
            for (const br of brojevi) {
                const { data: rows } = await supabase.from("magacin").select("*").eq("br_rolne", br).limit(1);
                const r = rows && rows[0];
                if (!r) { greske.push(br + ": nije nađena"); continue; }
                const prethodno = T(r.dodeljeno_nalogu);
                const dod = prethodno && prethodno.indexOf(a.broj_naloga) === -1 ? prethodno + ", " + a.broj_naloga : (prethodno || a.broj_naloga);
                const { error } = await supabase.from("magacin").update({ dodeljeno_nalogu: dod }).eq("id", r.id);
                if (error) greske.push(br + ": " + error.message); else ok++;
            }
            return { ok: greske.length === 0, poruka: `Rezervisano ${ok}/${brojevi.length} rolni.${greske.length ? " Greške: " + greske.join("; ") : ""}` };
        },
    },

    kreiraj_formatiranje: {
        cita: false,
        opis: "Pravi nalog za formatiranje (sečenje matičnih na traženu širinu) na osnovu predloga. MENJA BAZU — traži potvrdu.",
        ulaz: {
            vrsta: { type: "string" }, oznaka: { type: "string" }, debljina: { type: "number" },
            sirina_mm: { type: "number", description: "Širina trake u mm" },
            duzina_m: { type: "number", description: "Dužina u metrima" },
            rolni_kom: { type: "number", description: "Koliko rolni" },
        },
        opisPlana: (a) => `Napravi formatiranje: ${a.rolni_kom} rolni × ${a.sirina_mm} mm × ${a.duzina_m} m (${a.vrsta || ""} ${a.oznaka || ""})`,
        async izvrsi(a) {
            const magacin = await sve("magacin");
            const potrebe = [{
                id: "AI-1", materijal: { vrsta: a.vrsta, oznaka: a.oznaka, debljina: N(a.debljina) },
                sirina_mm: N(a.sirina_mm), duzina_m: N(a.duzina_m), rolni_kom: N(a.rolni_kom) || 1,
                odrediste: "stanje", napomena: "AI agent",
            }];
            const r = predloziFormatiranje(potrebe, magacin, { kerf_mm: 0, zaokruziNavise: true, bocniOstatakNaStanje: true });
            if (!r.nalozi.length) return { ok: false, poruka: "Nema matičnih rolni koje pokrivaju traženo. " + (r.fali || []).map((f) => f.razlog).join("; ") };

            const { data: post } = await supabase.from("operativni_nalozi").select("broj_naloga").ilike("broj_naloga", "%FORMATIRANJE%").limit(500);
            const g = new Date().getFullYear();
            const redni = 1 + (post || []).length;
            const sabroj = dodeliBrojeveNaloga(r.nalozi, { godina: g, postojeciBrojevi: (post || []).map((x) => x.broj_naloga), preventivniRedni: redni });
            const broj = T((sabroj.nalozi[0] || {}).broj).replace(/-\d+$/, "");

            const matice = r.nalozi.map((n) => {
                const m = magacin.find((x) => x.id === n.maticna_id) || {};
                return {
                    br_rolne: n.br_rolne, sirina_mm: n.sirina_mm, utrosak_m: n.utrosak_m,
                    materijal: [m.vrsta, m.pod_vrsta, m.oznaka_materijala].filter(Boolean).join(" · "),
                    proizvodjac: m.proizvodjac || m.dobavljac || "", lot_baza: m.lot || m.br_rolne || "LOT",
                    plan_reza: n.plan_reza,
                };
            });
            const { error } = await supabase.from("operativni_nalozi").insert([{
                broj_naloga: broj, tip_naloga: "formatiranje", tip_proizvoda: matice[0]?.materijal || null,
                parametri: JSON.stringify({ formatiranje: { objedinjeno: true, broj, preventivno: true, matice } }),
                uradjeno: 0, skart: 0,
            }]);
            if (error) return { ok: false, poruka: "Upis nije uspeo: " + error.message };
            return { ok: true, poruka: `Formatiranje ${broj} kreirano (${matice.length} matičnih).`, broj };
        },
    },

    pripremi_rolne_za_unos: {
        cita: true,
        opis: "Iz pročitane pakcing liste pravi pregledan spisak rolni + CSV tekst za proveru PRE upisa. Ne menja bazu. Uvek pozovi ovo pre ubaci_rolne_na_stanje.",
        ulaz: {
            rolne: {
                type: "array", description: "Redovi iz pakcing liste",
                items: {
                    type: "object",
                    properties: {
                        vrsta: { type: "string" }, pod_vrsta: { type: "string" }, oznaka: { type: "string" },
                        debljina: { type: "number", description: "µ ili g/m² za papir" },
                        sirina: { type: "number", description: "mm" },
                        metraza: { type: "number", description: "m" },
                        kg: { type: "number" }, lot: { type: "string" },
                        dobavljac: { type: "string" }, cena_kg: { type: "number" },
                        lokacija: { type: "string" }, napomena: { type: "string" },
                    },
                },
            },
        },
        async izvrsi({ rolne }) {
            const lista = Array.isArray(rolne) ? rolne : [];
            if (!lista.length) return { greska: "Nema redova." };
            const problemi = [];

            // Uporedi sa postojećim imenima u magacinu — da isti materijal ne uđe pod novim imenom.
            let postojeci = [];
            try {
                postojeci = (await sve("magacin")).filter((r) => UP(r.tip) !== "SPOJ" && T(r.vrsta));
            } catch (e) { }
            const poznat = (r) => postojeci.some((m) =>
                UP(m.vrsta) === UP(r.vrsta) &&
                (!T(r.oznaka) || !T(m.oznaka_materijala) || UP(m.oznaka_materijala) === UP(r.oznaka)) &&
                (!N(r.debljina) || !N(m.deb ?? m.debljina) || Math.abs(N(m.deb ?? m.debljina) - N(r.debljina)) <= 1)
            );
            const red = lista.map((r, i) => {
                const p = [];
                if (!T(r.vrsta)) p.push("nema vrstu");
                if (!N(r.sirina)) p.push("nema širinu");
                if (!N(r.metraza) && !N(r.kg)) p.push("nema ni metre ni kg");
                if (T(r.vrsta) && !poznat(r)) p.push(`materijal "${T(r.vrsta)} ${T(r.oznaka)} ${N(r.debljina)}µ" NE postoji u magacinu pod tim imenom — proveri da nije isti kao neki postojeći`);
                if (p.length) problemi.push(`Red ${i + 1}: ${p.join(", ")}`);
                return {
                    r_br: i + 1, vrsta: T(r.vrsta), pod_vrsta: T(r.pod_vrsta), oznaka: T(r.oznaka),
                    debljina: N(r.debljina), sirina_mm: N(r.sirina), metraza_m: N(r.metraza),
                    kg: N(r.kg), lot: T(r.lot), dobavljac: T(r.dobavljac),
                    cena_kg: N(r.cena_kg) || null, lokacija: T(r.lokacija),
                };
            });
            const zagl = "vrsta;pod_vrsta;oznaka;debljina;sirina_mm;metraza_m;kg;lot;dobavljac;cena_kg;lokacija";
            const csv = [zagl].concat(red.map((x) =>
                [x.vrsta, x.pod_vrsta, x.oznaka, x.debljina, x.sirina_mm, x.metraza_m, x.kg, x.lot, x.dobavljac, x.cena_kg ?? "", x.lokacija].join(";")
            )).join("\n");
            return {
                broj_rolni: red.length,
                ukupno_m: Math.round(red.reduce((a, x) => a + x.metraza_m, 0)),
                ukupno_kg: Math.round(red.reduce((a, x) => a + x.kg, 0)),
                problemi: problemi.length ? problemi : ["nema"],
                rolne: red,
                csv,
            };
        },
    },

    ubaci_rolne_na_stanje: {
        cita: false,
        opis: "Upisuje rolne iz pakcing liste u magacin (status Na stanju, sa QR brojem). MENJA BAZU — traži potvrdu.",
        ulaz: {
            rolne: { type: "array", description: "Isti spisak kao u pripremi_rolne_za_unos", items: { type: "object" } },
            dobavljac: { type: "string", description: "Dobavljač za sve rolne (ako nije po redu)" },
            napomena: { type: "string", description: "Zajednička napomena, npr. broj otpremnice" },
        },
        opisPlana: (a) => {
            const n = (a.rolne || []).length;
            const m = (a.rolne || []).reduce((s, r) => s + (Number(r.metraza) || 0), 0);
            return `Ubaci ${n} rolni na stanje${a.dobavljac ? " (dobavljač " + a.dobavljac + ")" : ""} — ukupno ${Math.round(m)} m`;
        },
        async izvrsi(a) {
            const lista = Array.isArray(a.rolne) ? a.rolne : [];
            if (!lista.length) return { ok: false, poruka: "Nema rolni za upis." };
            const god = new Date().getFullYear();
            const danas = new Date().toISOString().slice(0, 10);

            // jedinstven broj rolne — isti format kao u magacinu (ROLNA-GODINA-XXXXXXXXX)
            const { data: post } = await supabase.from("magacin").select("br_rolne").ilike("br_rolne", "ROLNA-" + god + "-%").limit(5000);
            const zauzeti = new Set((post || []).map((x) => T(x.br_rolne)));
            const noviBroj = () => {
                for (let i = 0; i < 20; i++) {
                    const br = "ROLNA-" + god + "-" + String(Math.floor(100000000 + Math.random() * 899999999));
                    if (!zauzeti.has(br)) { zauzeti.add(br); return br; }
                }
                return "ROLNA-" + god + "-" + Date.now();
            };

            const redovi = lista.map((r) => {
                const m = N(r.metraza), kg = N(r.kg), cena = N(r.cena_kg);
                const br = noviBroj();
                return {
                    br_rolne: br, qr_code: br,
                    tip: T(r.vrsta), vrsta: T(r.vrsta), pod_vrsta: T(r.pod_vrsta) || null,
                    oznaka_materijala: T(r.oznaka) || null, deb: N(r.debljina) || null,
                    sirina: N(r.sirina) || null, metraza: m || null, metraza_ost: m || null,
                    kg_bruto: kg || null, kg_neto: kg || null, lot: T(r.lot) || null,
                    dobavljac: T(r.dobavljac) || T(a.dobavljac) || null,
                    cena_kg: cena || null, vrednost: cena && kg ? Math.round(cena * kg * 100) / 100 : null,
                    datum: danas, datum_prijema: danas,
                    status: "Na stanju", lokacija: T(r.lokacija) || null,
                    napomena: [T(r.napomena), T(a.napomena)].filter(Boolean).join(" — ") || null,
                };
            });

            const { data: upisane, error } = await supabase.from("magacin").insert(redovi).select("id, br_rolne, metraza");
            if (error) return { ok: false, poruka: "Upis nije uspeo: " + error.message };

            // trag u istoriji (nije kritično ako padne)
            try {
                await supabase.from("magacin_istorija").insert((upisane || []).map((x) => ({
                    rolna_id: x.id, br_rolne: x.br_rolne, akcija: "ULAZ U MAGACIN",
                    tip_promene: "ulaz", metraza_pre: 0, metraza_posle: N(x.metraza), promena_m: N(x.metraza),
                    napomena: "Uneto preko AI agenta iz pakcing liste" + (a.napomena ? " — " + a.napomena : ""),
                    created_at: new Date().toISOString(),
                })));
            } catch (e) { }

            return {
                ok: true,
                poruka: `Ubačeno ${(upisane || []).length} rolni na stanje.`,
                brojevi: (upisane || []).map((x) => x.br_rolne),
            };
        },
    },

    sacuvaj_kalkulaciju: {
        cita: false,
        opis: "Čuva kalkulaciju u bazu (kalkulacije_folije / kalkulacije_kese / kalkulacije_spulne). MENJA BAZU — traži potvrdu. Prosledi ISTE ulazne podatke koje si koristio za računanje.",
        ulaz: {
            tip: { type: "string", description: "folija | kesa | spulna" },
            naziv: { type: "string", description: "Naziv proizvoda" },
            kupac: { type: "string", description: "Kupac" },
            ulaz: { type: "object", description: "Isti ulazni podaci kao za alat kalkulacija_* (širina, materijali, marža…)" },
        },
        opisPlana: (a) => `Sačuvaj kalkulaciju (${a.tip || "?"}) „${a.naziv || "bez naziva"}"${a.kupac ? " — kupac " + a.kupac : ""}`,
        async izvrsi(a) {
            const tip = T(a.tip).toLowerCase();
            const naziv = T(a.naziv), kupac = T(a.kupac);
            if (!naziv || !kupac) return { ok: false, poruka: "Fale naziv i kupac — bez njih se kalkulacija ne čuva." };
            const u = a.ulaz || {};

            // Preračunaj ovde, da u bazu ide tačan rezultat (ne prepričan).
            let rez, tabela, red;
            if (tip === "kesa") {
                rez = kalkulacijaKese(u); tabela = "kalkulacije_kese";
                red = {
                    naziv, kupac, kolicina: N(u.kolicina) || 1000, skart: N(u.skart), marza: N(u.marza),
                    sirina: N(u.sirina), duzina: N(u.duzina), klapna: N(u.klapna), falta: N(u.falta),
                    materijali: u.materijali || [], rezultati: rez,
                };
            } else if (tip === "spulna" || tip === "špulna") {
                rez = kalkulacijaSpulne(u); tabela = "kalkulacije_spulne";
                red = {
                    naziv, kupac, materijal: T(u.materijal), sirina: N(u.sirina), duzina: N(u.duzina),
                    debljina: N(u.tezinaGM2), tezina_gm2: N(u.tezinaGM2), cena_kg: N(u.cenaM2),
                    marza: N(u.marza), kolicina: N(u.kolicina) || 1, rezultati: rez,
                };
            } else {
                rez = kalkulacijaFolije(u); tabela = "kalkulacije_folije";
                red = {
                    naziv, kupac, sirina: N(u.sirina), metraza: N(u.metraza) || 1000,
                    nalog: N(u.nalog) || 1, skart: N(u.skart), marza: N(u.marza),
                    materijali: u.materijali || [], lepak: u.lepak || [], lak: u.lak || {},
                    kasiranje: u.kasiranje || {}, stampa_cena: N(u.stampaCena), lakiranje_cena: N(u.lakiranjeCena),
                    transport: N(u.transport), pakovanje: N(u.pakovanje), dorada: N(u.dorada),
                    rezultati: rez,
                };
            }

            const { error } = await supabase.from(tabela).insert([red]);
            if (error) return { ok: false, poruka: "Upis u " + tabela + " nije uspeo: " + error.message };
            return {
                ok: true,
                poruka: `Kalkulacija „${naziv}" (${tip}) sačuvana u ${tabela}. Konačna cena: ${rez.konacna_cena} ${rez.jedinica}.`,
                konacna_cena: rez.konacna_cena, jedinica: rez.jedinica,
            };
        },
    },

    zapamti_pravilo: {
        cita: false,
        opis: "Trajno pamti pravilo koje će važiti u SVIM budućim razgovorima (npr. marža za kupca, gustina materijala, konvencija). MENJA BAZU — traži potvrdu. Predloži ovo kad korisnik kaže nešto što očigledno treba da važi ubuduće.",
        ulaz: {
            oblast: { type: "string", description: "kalkulacije | magacin | kupci | proizvodnja | ostalo" },
            pravilo: { type: "string", description: "Jasno i kratko napisano pravilo, tako da se razume i bez konteksta razgovora" },
        },
        opisPlana: (a) => `Zapamti trajno pravilo (${a.oblast || "ostalo"}): „${a.pravilo}"`,
        async izvrsi(a) {
            const pravilo = T(a.pravilo);
            if (!pravilo) return { ok: false, poruka: "Pravilo je prazno." };
            const { error } = await supabase.from("ai_pravila").insert([{
                oblast: T(a.oblast) || "ostalo", pravilo, izvor: "razgovor", aktivno: true,
            }]);
            if (error) return { ok: false, poruka: "Nije zapamćeno: " + error.message };
            return { ok: true, poruka: "Zapamćeno trajno: " + pravilo };
        },
    },

    obrisi_pravilo: {
        cita: false,
        opis: "Gasi (deaktivira) naučeno pravilo koje više ne važi. MENJA BAZU — traži potvrdu.",
        ulaz: { id: { type: "number", description: "ID pravila iz procitaj_pravila" } },
        opisPlana: (a) => `Obriši naučeno pravilo #${a.id}`,
        async izvrsi(a) {
            const { error } = await supabase.from("ai_pravila").update({ aktivno: false, updated_at: new Date().toISOString() }).eq("id", a.id);
            if (error) return { ok: false, poruka: "Nije obrisano: " + error.message };
            return { ok: true, poruka: "Pravilo #" + a.id + " više ne važi." };
        },
    },

    sacuvaj_templejt: {
        cita: false,
        opis: "Čuva nov templejt proizvoda u bazu proizvoda (isto kao dugme „Sačuvaj template” u Template Engine-u). MENJA BAZU — traži potvrdu.",
        ulaz: {
            naziv: { type: "string", description: "Naziv proizvoda" },
            tip: { type: "string", description: "folija | kesa | spulna" },
            kupac: { type: "string" },
            idealna_sirina: { type: "number", description: "Idealna širina materijala u mm" },
            slojevi: {
                type: "array", description: "Slojevi materijala",
                items: { type: "object", properties: { vrsta: { type: "string" }, pod_vrsta: { type: "string" }, oznaka: { type: "string" }, debljina: { type: "number" } }, required: ["vrsta"] },
            },
            napomena: { type: "string" },
        },
        opisPlana: (a) => `Sačuvaj NOV templejt „${a.naziv}" (${a.tip || "folija"}${a.idealna_sirina ? ", " + a.idealna_sirina + " mm" : ""}, ${(a.slojevi || []).length} sloj/a)`,
        async izvrsi(a) {
            const naziv = T(a.naziv);
            if (!naziv) return { ok: false, poruka: "Templejt mora imati naziv." };
            const tip = (T(a.tip) || "folija").toLowerCase();
            const slojevi = (Array.isArray(a.slojevi) ? a.slojevi : []).map((l) => ({
                vrsta: T(l.vrsta), pod_vrsta: T(l.pod_vrsta), oznaka: T(l.oznaka), debljina: N(l.debljina),
            })).filter((l) => l.vrsta);
            if (!slojevi.length) return { ok: false, poruka: "Templejt mora imati bar jedan sloj." };

            const data = {
                sifra: null, idealnaSirinaMaterijala: N(a.idealna_sirina) || null,
                [tip]: { layers: slojevi },
                napomena: T(a.napomena) || "Kreirano preko AI agenta",
            };
            const tplId = "TPL-" + Date.now();
            const { error } = await supabase.from("proizvodi").insert([{
                tip, naziv, kupac: T(a.kupac) || null, status: "Aktivan",
                sir: N(a.idealna_sirina) || null,
                mats: slojevi, materijali_struktura: slojevi,
                res: { template: data, operacije: [] },
                template_id: tplId, template_version: "V1",
                standardi: { tip, kupac: T(a.kupac) || null, template_version: "V1", izvor: "AI agent" },
                datum: new Date().toLocaleDateString("sr-RS"),
            }]);
            if (error) return { ok: false, poruka: "Templejt nije sačuvan: " + error.message };
            return { ok: true, poruka: `Templejt „${naziv}" sačuvan (${slojevi.length} sloj/a).`, template_id: tplId };
        },
    },

    napravi_ponudu: {
        cita: false,
        opis: "Pravi ponudu u bazi (tabela ponude) sa cenom iz kalkulacije. Iz nje se kasnije mogu napraviti nalozi. MENJA BAZU — traži potvrdu.",
        ulaz: {
            kupac: { type: "string" },
            proizvod: { type: "string", description: "Naziv proizvoda" },
            tip: { type: "string", description: "folija | kesa | spulna" },
            kolicina: { type: "number" },
            jedinica: { type: "string", description: "m | kom | kg" },
            cena_jedinicna: { type: "number", description: "Cena po jedinici (npr. €/1000 m ili €/kom)" },
            vrednost_ukupno: { type: "number", description: "Ukupna vrednost ponude u €" },
            napomena: { type: "string", description: "Rok isporuke, uslovi plaćanja…" },
        },
        opisPlana: (a) => `Napravi ponudu za ${a.kupac || "kupca"} — ${a.proizvod || ""}, ${a.kolicina || "?"} ${a.jedinica || ""}${a.vrednost_ukupno ? " · " + a.vrednost_ukupno + " €" : ""}`,
        async izvrsi(a) {
            const kupac = T(a.kupac), proizvod = T(a.proizvod);
            if (!kupac || !proizvod) return { ok: false, poruka: "Ponuda mora imati kupca i proizvod." };
            const god = new Date().getFullYear();
            let redni = 1;
            try {
                const { data } = await supabase.from("ponude").select("broj").ilike("broj", "PON-" + god + "-%").limit(1000);
                redni = 1 + (data || []).length;
            } catch (e) { }
            const broj = "PON-" + god + "-" + String(redni).padStart(4, "0");
            const tip = (T(a.tip) || "folija").toLowerCase();
            const { data: pon, error } = await supabase.from("ponude").insert([{
                broj, datum: new Date().toLocaleDateString("sr-RS"),
                kupac, naziv: proizvod, proizvod, tip, tip_proizvoda: tip,
                kol: N(a.kolicina) || null, kolicina: N(a.kolicina) || null,
                cena_ukorak: null, cena_ukupno: N(a.vrednost_ukupno) || null,
                status: "Nova",
                nap: T(a.napomena) || "Kreirano preko AI agenta",
                podaci: {
                    jedinica: T(a.jedinica) || "m",
                    cena_jedinicna: N(a.cena_jedinicna) || null,
                    vrednost: N(a.vrednost_ukupno) || null,
                    izvor: "AI agent",
                },
            }]).select("id, broj").maybeSingle();
            if (error) return { ok: false, poruka: "Ponuda nije kreirana: " + error.message };
            return { ok: true, poruka: `Ponuda ${(pon && pon.broj) || broj} napravljena za ${kupac} — ${proizvod}.`, broj: (pon && pon.broj) || broj };
        },
    },

    obrisi_nalog: {
        cita: false,
        opis: "Briše nalog i sve njegove operacije. MENJA BAZU — traži potvrdu.",
        ulaz: { broj_naloga: { type: "string", description: "Broj glavnog naloga, npr. MP-2026-0019" } },
        opisPlana: (a) => `OBRIŠI nalog ${a.broj_naloga} (sa svim operacijama)`,
        async izvrsi(a) {
            const broj = T(a.broj_naloga);
            const { data: m } = await supabase.from("radni_nalozi").select("id").eq("broj_naloga", broj).maybeSingle();
            let obrisano = 0;
            if (m?.id) {
                const r1 = await supabase.from("operativni_nalozi").delete().eq("glavni_nalog_id", m.id).select("id");
                obrisano += (r1.data || []).length;
            }
            const r2 = await supabase.from("operativni_nalozi").delete().ilike("broj_naloga", broj + "-%").select("id");
            obrisano += (r2.data || []).length;
            const r3 = await supabase.from("radni_nalozi").delete().eq("broj_naloga", broj).select("id");
            const masterObrisan = (r3.data || []).length;
            if (!masterObrisan) return { ok: false, poruka: `Operacije obrisane (${obrisano}), ali glavni nalog ${broj} je ostao — baza ne dozvoljava brisanje (RLS).` };
            return { ok: true, poruka: `Nalog ${broj} obrisan (${obrisano + masterObrisan} stavki).` };
        },
    },
};

// Pretvara spisak alata u oblik koji Claude razume
export function alatiZaClaude() {
    return Object.entries(ALATI).map(([ime, a]) => ({
        name: ime,
        description: a.opis,
        input_schema: {
            type: "object",
            properties: Object.fromEntries(Object.entries(a.ulaz || {}).map(([k, v]) => [k, v])),
            required: [],
        },
    }));
}

export function jeUpis(ime) {
    return ALATI[ime] ? ALATI[ime].cita === false : false;
}

export async function izvrsiAlat(ime, ulaz) {
    const a = ALATI[ime];
    if (!a) return { greska: "Nepoznat alat: " + ime };
    try {
        return await a.izvrsi(ulaz || {});
    } catch (e) {
        return { greska: (e && e.message) || String(e) };
    }
}

export function opisPlana(ime, ulaz, ctx) {
    const a = ALATI[ime];
    if (a && typeof a.opisPlana === "function") { try { return a.opisPlana(ulaz || {}, ctx); } catch (e) { } }
    return ime + " " + JSON.stringify(ulaz || {});
}