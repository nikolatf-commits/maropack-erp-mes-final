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

// ── Templejt: izvlači slojeve i idealnu širinu iz zapisa proizvoda ────────────
export function templejtIz(prod) {
    const tpl = prod?.data || prod?.template || prod || {};
    const t = tpl.data || tpl;
    const folija = t.folija || tpl.folija || {};
    const layers = folija.layers || t.layers || prod?.struktura_materijala || [];
    return {
        naziv: prod?.naziv || prod?.name || t.prod || t.proizvod || "",
        tip: prod?.tip || t.type || t.tip || "folija",
        idealna_sirina: N(t.idealnaSirinaMaterijala || folija.idealnaSirinaMaterijala || t.idealna_sirina),
        slojevi: (Array.isArray(layers) ? layers : []).map((l) => ({
            vrsta: T(l.vrsta), pod_vrsta: T(l.pod_vrsta),
            oznaka: T(l.oznaka || l.oznaka_materijala || l.komercijalnaOznaka),
            debljina: N(l.debljina || l.deb),
        })).filter((l) => l.vrsta),
        stampa: t.stampa || folija.stampa || null,
        kasiranje: t.kasiranje || folija.kasiranje || null,
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
            const f = naziv ? p.filter((x) => UP(x.naziv || x.name).includes(UP(naziv))) : p;
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

    // ── UPIS (traži potvrdu) ─────────────────────────────────────────────────
    kreiraj_nalog_iz_templejta: {
        cita: false,
        opis: "Pravi radni nalog za proizvod iz templejta. MENJA BAZU — traži potvrdu korisnika.",
        ulaz: {
            proizvod_id: { type: "string", description: "ID proizvoda" },
            kolicina: { type: "number", description: "Količina" },
            kupac: { type: "string", description: "Naziv kupca" },
        },
        opisPlana: (a, ctx) => `Napravi nalog za „${ctx?.naziv || a.proizvod_id}" — količina ${a.kolicina}${a.kupac ? ", kupac " + a.kupac : ""}`,
        async izvrsi(a) {
            const { data: prod } = await supabase.from("proizvodi").select("*").eq("id", a.proizvod_id).maybeSingle();
            if (!prod) return { ok: false, poruka: "Proizvod nije nađen." };
            const t = templejtIz(prod);
            const payload = {
                broj: "PON-AI-" + Date.now(), datum: new Date().toLocaleDateString("sr-RS"),
                kupac: a.kupac || "AI nalog", naziv: t.naziv, proizvod: t.naziv, tip: t.tip,
                kol: N(a.kolicina) || null, kolicina: N(a.kolicina) || null,
                struktura: t.slojevi, mats: t.slojevi, status: "prihvaceno", nap: "Kreirano preko AI agenta",
                template_id: prod.template_id || prod.id || null,
                res: { template: t.sirovo, operacije: [], kupac: a.kupac || "", kolicina: N(a.kolicina) },
            };
            const { data: pon, error: oe } = await supabase.from("ponude").insert([payload]).select().single();
            if (oe || !pon) return { ok: false, poruka: "Ponuda nije kreirana: " + (oe?.message || "nepoznato") };
            const { error: re } = await supabase.rpc("kreiraj_naloge_iz_ponude", { p_ponuda_id: pon.id });
            if (re) return { ok: false, poruka: "Ponuda napravljena, ali nalozi nisu: " + re.message };
            let broj = "";
            try {
                const { data: mr } = await supabase.from("radni_nalozi").select("broj_naloga").eq("ponuda_id", pon.id).order("created_at", { ascending: false }).limit(1);
                if (mr && mr[0]) broj = mr[0].broj_naloga;
            } catch (e) { }
            return { ok: true, poruka: `Nalog napravljen za „${t.naziv}"${broj ? " · " + broj : ""} (${a.kolicina}).`, broj };
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
            const red = lista.map((r, i) => {
                const p = [];
                if (!T(r.vrsta)) p.push("nema vrstu");
                if (!N(r.sirina)) p.push("nema širinu");
                if (!N(r.metraza) && !N(r.kg)) p.push("nema ni metre ni kg");
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
