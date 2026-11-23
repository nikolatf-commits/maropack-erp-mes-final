// ─────────────────────────────────────────────────────────────────────────────
//  MAROPACK — nalogMetrika.js  [v1]
//
//  JEDAN izvor istine za čitanje i računanje nad nalozima. Koriste ga:
//   - MachineSchedulerPRO (plan proizvodnje)   → import '../utils/nalogMetrika.js'
//   - LiveProductionMES (praćenje)             → import '../utils/nalogMetrika.js'
//   - agentAlati (AI agent)                    → import '../utils/nalogMetrika.js'
//   - AnalizaMaterijalStavke                   → import './utils/nalogMetrika.js'
//  Ista logika kao štampani nalog (NalogLayoutPRO.buildD). Izmena šeme = izmena OVDE.
//  Modul je čist (bez supabase importa) — može svuda.
// ─────────────────────────────────────────────────────────────────────────────

export function num2(v) { return Number(String(v ?? 0).replace(/\s/g, "").replace(",", ".")) || 0; }
export function safeJson(v, f) { if (v == null) return f; if (typeof v === "object") return v; try { return JSON.parse(v) || f; } catch (e) { return f; } }

// Operativni nalozi nose sufiks operacije; glavni broj je bez njega.
export const OP_SUFIKS = /-(MATERIJAL|STAMPA|LAKIRANJE|KASIRANJE|PERFORACIJA_REZANJE|REZANJE_TABAKA|PRAVLJENJE_CREVA|FORMATIRANJE|KESA|SPULNA)$/i;
export const canonRef = (r) => String(r || "").trim().replace(OP_SUFIKS, "");
export const jeMP = (r) => /^MP-\d{4}-\d+/i.test(canonRef(r));

// Tip operacije: NAJJAČI signal je sufiks u broju naloga (MP-2026-0001-MATERIJAL) —
// mnoge operacije u polju "naziv" nose ime PROIZVODA, a tip žive samo u broju.
// Tek ako sufiksa nema, gleda se slobodan tekst (tip_naloga / vrsta / naziv).
export function opKljuc(n) {
    const broj = String((n && (n.broj_naloga || n.broj)) || "");
    const suf = broj.match(OP_SUFIKS);
    if (suf) return suf[1].toLowerCase(); // materijal | stampa | ... | perforacija_rezanje | kesa | spulna
    const t = String((n && (n.tip_naloga || n.vrsta || n.tipOperacije || n.operacija || n.naziv)) || n || "").toLowerCase();
    if (t.includes("mater")) return "materijal";
    if (t.includes("\u0161tamp") || t.includes("stamp")) return "stampa";
    if (t.includes("lak")) return "lakiranje";
    if (t.includes("ka\u0161") || t.includes("kas")) return "kasiranje";
    if (t.includes("tabak") || t.includes("tabac")) return "rezanje_tabaka";
    if (t.includes("crev") || t.includes("polucrev")) return "pravljenje_creva";
    if (t.includes("perf") || t.includes("rez")) return "perforacija_rezanje";
    if (t.includes("format")) return "formatiranje";
    if (t.includes("kes")) return "kesa";
    if (t.includes("\u0161pul") || t.includes("spul")) return "spulna";
    return "ostalo";
}

// ── ČITANJE NALOGA ───────────────────────────────────────────────────────────
// Količina/širina/rok žive u JSON poljima: order_data → template(.data) → folija.rezanje.
// Ista prioritetna lista kao na štampanom nalogu.
export function extraktNalog(n) {
    if (!n) return { kolicina: 0, brojTraka: 0, metriMasine: 0, sirina: 0, rok: "", kom: 0, brojBoja: 0, tipProizvoda: "" };
    const od = safeJson(n.order_data, {});
    const res = safeJson(n.res, {});
    const rez = safeJson(n.rezultati, {});
    const par = safeJson(n.parametri, {});
    const parRes = safeJson(par.res, {});
    const embTpl = res.template || rez.template || parRes.template || par.template || null;
    const tpl = safeJson(n.product_template || n.template || od.template || embTpl, {});
    const tData = safeJson(n.templateData || tpl.data || od.templateData, {});
    const t = Object.keys(tData).length ? tData : tpl;
    const folija = n.folija || od.folija || t.folija || (t.data && t.data.folija) || {};
    const kesa = n.kesa || od.kesa || t.kesa || (t.data && t.data.kesa) || {};
    const spulnaC = n.spulna || od.spulna || t.spulna || (t.data && t.data.spulna) || {};
    const rzn = folija.rezanje || {};
    const st = folija.stampa || {};
    const sirina = num2(rzn.sirinaMaterijala) || num2(t.idealnaSirinaMaterijala) || num2(n.sirina) || num2(n.sir) || 0;
    // Broj traka — ISTO kao NalogLayoutPRO (merodavni nalog): niz širina → CSV string "255,255"
    // → trake[].sirina/width → brojTraka(Override) → matična ÷ širina trake.
    // VAŽNO za rezanje: ako broj traka ispadne 0, metraža se NE deli pa je vreme naduvano ×(broj traka).
    const brojTraka = (() => {
        let lanes = (Array.isArray(rzn.sirineTraka) && rzn.sirineTraka.length) ? rzn.sirineTraka.map(num2).filter(Boolean) : [];
        if (!lanes.length && typeof rzn.sirineTraka === "string") lanes = String(rzn.sirineTraka).split(",").map(num2).filter(Boolean);
        if (!lanes.length && Array.isArray(rzn.trake) && rzn.trake.length) lanes = rzn.trake.map((x) => num2(x && (x.sirina || x.width))).filter(Boolean);
        if (lanes.length) return lanes.length;
        if (num2(rzn.brojTraka)) return num2(rzn.brojTraka);
        if (num2(rzn.brojTrakaOverride)) return num2(rzn.brojTrakaOverride);
        if (num2(rzn.sirinaTrake) > 0 && sirina > 0) return Math.max(1, Math.floor(sirina / num2(rzn.sirinaTrake)));
        return 0;
    })();
    const kolicina = num2(n.metraza || n.kol || n.kolicina || t.porucenaKolicina || od.kolicina);
    // 1) NAJTAČNIJE: templejt-engine od v53 upisuje gotove metre matične rolne u parametre
    //    naloga (metraza_maticne) — jedinica unosa (kom/kg/m) tu više ne igra ulogu.
    const direktnaMaticna = num2(par.metraza_maticne || od.metraza_maticne || res.metraza_maticne || rez.metraza_maticne);
    let metriMasine;
    if (direktnaMaticna > 0) {
        metriMasine = Math.round(direktnaMaticna);
    } else {
        // 2) Stariji nalozi (bez metraza_maticne): poštuj JEDINICU UNOSA.
        //    VAŽNO: količina i jedinica često NISU na vrhu templejta nego UNUTAR kontejnera
        //    (folija/kesa/spulna). Zato čitamo i ugnežđeno — inače špulna/kesa vrate 0.
        const tipStr = String(n.tip_proizvoda || n.tip || "").toLowerCase();
        const jeSpulna = /spul|špul/.test(tipStr) || (!folija.layers && !kesa.layers && (num2(spulnaC.W) || (Array.isArray(spulnaC.layers) && spulnaC.layers.length)));
        const jeKesa = !jeSpulna && (/kes/.test(tipStr) || (Array.isArray(kesa.layers) && kesa.layers.length) || num2(kesa.kolicina) > 0);
        const grana = jeSpulna ? spulnaC : jeKesa ? kesa : folija;
        const jed = String(t.jedinicaUnosa || grana.jedinicaUnosa || (jeSpulna ? "m2" : jeKesa ? "kom" : "m")).toLowerCase();
        const trake = Math.max(1, brojTraka);
        // količina: vrh templejta → kontejner → poručena u komadima
        const kol = kolicina || num2(grana.kolicina || t.porucenaKolicinaKom || grana.porucenaKolicinaKom || od.kom || n.kom);

        if (jeSpulna) {
            // ISTA formula kao štampani nalog (NalogLayoutPRO.spulnaD): m² → ukupno m → matična ÷ traka.
            const W = num2(spulnaC.W) || 20;
            const sirMat = num2(spulnaC.sirinaMaterijala) || num2(t.idealnaSirinaMaterijala) || sirina || 480;
            const maxM = num2(spulnaC.maxMetara) || 20000;
            const skartSp = num2(spulnaC.skart) || 0;
            const layersSp = Array.isArray(spulnaC.layers) ? spulnaC.layers : [];
            const gm2Sp = layersSp.reduce((a, l) => a + (num2(l.gm2) || num2(l.debljina) * num2(l.koeficijent)), 0);
            // KRITIČNO: jedinicu i količinu čitaj iz ŠPULNA kontejnera (isto kao spulnaD), NE sa vrha naloga.
            // Top-level kolicina/jedinica za špulnu ume da bude u m²/m/„po špulni" (20.000) → inače matična
            // ispadne ~20× premala pa je vreme na mašini drastično kraće.
            const jedSp = String(spulnaC.jedinicaUnosa || t.jedinicaUnosa || "m2").toLowerCase();
            const kolSp = num2(spulnaC.kolicina) || num2(n.kom) || num2(od.kom) || kolicina || 0;
            let m2;
            if (jedSp === "kom") m2 = kolSp * maxM * (W / 1000);
            else if (jedSp === "kg") m2 = gm2Sp > 0 ? (kolSp * 1000) / gm2Sp : 0;
            else if (jedSp === "m") m2 = kolSp * (W / 1000);
            else m2 = kolSp;                                           // m²
            const m2Rad = m2 * (1 + skartSp / 100);
            const ukupnoM = W > 0 ? m2Rad / (W / 1000) : 0;
            const Nsp = W > 0 ? Math.max(1, Math.floor(sirMat / W)) : 1;
            metriMasine = Math.round(Nsp > 0 ? ukupnoM / Nsp : ukupnoM);
        } else if (jed === "kom" && kol > 0) {
            const korakM = num2(grana.dimenzijaDuzina || t.dimenzijaDuzina) / 1000;   // dužina komada duž trake
            metriMasine = korakM > 0 ? Math.round((kol * korakM) / trake) : 0;
        } else if (jed === "kg" && kol > 0) {
            const slojevi = (Array.isArray(folija.layers) && folija.layers.length ? folija.layers : (grana.layers || []));
            const gm2 = slojevi.reduce((a, l) => a + (num2(l.gm2) || num2(l.debljina) * num2(l.koeficijent)), 0);
            const m2 = gm2 > 0 ? (kol * 1000) / gm2 : 0;
            metriMasine = (m2 > 0 && sirina > 0) ? Math.round(m2 / (sirina / 1000) / trake) : 0;
        } else {
            metriMasine = kol > 0 ? Math.round(kol / trake) : 0;       // "m" — kao i do sada
        }
    }
    return {
        kolicina, brojTraka,
        // Mašina provlači MATIČNU rolnu: rezanje množi trake, ne skraćuje rolnu.
        metriMasine,
        // Broj prolaza kaширanja (troslojna = 2, četvoroslojna = 3). "Auto" = slojevi − 1.
        // Važi i za FOLIJU i za KESE (uzima kaширanje/slojeve iz odgovarajućeg kontejnera).
        brojKasiranja: (function () {
            const kasObj = (folija.kasiranje && (folija.kasiranje.brojKasiranja != null && folija.kasiranje.brojKasiranja !== ""))
                ? folija.kasiranje
                : (kesa.kasiranje || folija.kasiranje || {});
            const lyrs = (Array.isArray(folija.layers) && folija.layers.length) ? folija.layers
                : (Array.isArray(kesa.layers) ? kesa.layers : []);
            return Math.max(1, num2(kasObj.brojKasiranja) || (lyrs.length > 1 ? lyrs.length - 1 : 1));
        })(),
        sirina,
        rok: n.rok || n.rok_isporuke || n.datum_isporuke || od.rok || t.rok || "",
        kom: num2(od.kom || t.porucenaKolicinaKom || n.kom),
        brojBoja: num2(st.brojBoja),
        tipProizvoda: String(n.tip_proizvoda || n.tip || ""),
    };
}
export function metriMasineNaloga(n) { return extraktNalog(n).metriMasine; }

// Efektivni metri KOJE MAŠINA PROVLAČI za datu operaciju. Za kaширanje materijal prolazi
// kroz mašinu VIŠE puta (broj prolaza = slojevi − 1), pa je i vreme srazmerno veće:
//   trajanje = setup + (metri × prolazi) / brzina   (jedan setup, N prolaza)
// Za sve ostale operacije = metriMasine (jedan prolaz).
export function metriZaMasinu(n, opTip) {
    const ex = extraktNalog(n);
    const kljuc = String(opTip || "").toLowerCase();
    const prolazi = (kljuc === "kasiranje") ? Math.max(1, ex.brojKasiranja) : 1;
    return ex.metriMasine * prolazi;
}

// ── VREME ────────────────────────────────────────────────────────────────────
// Procena na mašini: setup (min) + metri ÷ brzina (m/min). 0 = nema podataka.
export function procenaMinNaMasini(masina, metri) {
    const speed = num2(masina && masina.speed), setup = num2(masina && masina.setupMin);
    const m = num2(metri);
    if (m > 0 && speed > 0) return Math.max(10, Math.round(setup + m / speed));
    return 0;
}

// Stvarno trajanje iz vremenskih pečata (radnik START/ZAVRŠI preko QR-a). 0 = nepoznato.
export function stvarnoMin(n) {
    if (!n) return 0;
    const s = n.start_ts || n.pocetak_ts || n.started_at || n.start;
    const e = n.end_ts || n.kraj_ts || n.zavrseno_ts || n.finished_at || n.completed_at || n.end;
    if (!s || !e) return 0;
    const ds = new Date(s), de = new Date(e);
    if (Number.isNaN(ds.getTime()) || Number.isNaN(de.getTime())) return 0;
    const pauza = num2(n.pauza_min || n.zastoj_min);
    return Math.max(0, Math.round((de - ds) / 60000) - pauza);
}

// ── REDOSLED OPERACIJA ───────────────────────────────────────────────────────
// Jedinstven redosled pokriva sve tipove proizvoda (operacije koje proizvod nema
// jednostavno ne postoje u mapi pa se preskaču):
//   folija:  materijal → (formatiranje) → štampa → lakiranje → kaširanje → perforacija/rezanje
//   kesa:    materijal → (formatiranje) → kaширanje → kesa
//   špulna:  materijal → (formatiranje) → špulna
// FORMATIRANJE ide ODMAH posle materijala (slitovanje matične rolne na trake idealne širine),
// PRE svih mašinskih operacija — tako blokada „čeka prethodnu" pravilno veže: formatiranje čeka
// samo materijal, a štampa/rezanje/kesa/špulna čekaju formatiranje kad ga nalog ima.
export const REDOSLED_OPERACIJA = ["materijal", "formatiranje", "stampa", "lakiranje", "kasiranje", "perforacija_rezanje", "rezanje_tabaka", "pravljenje_creva", "kesa", "spulna"];

// LAKIRANJE SPOJA: kad su u templejtu za lak čekirana 2 ili više materijala, ne lakira se
// pojedinačan materijal nego SPOJ — pa lakiranje ide POSLE kaširanja:
//   materijal → (formatiranje) → štampa → kaširanje → lakiranje → rezanje / kesa
// Jedan čekiran materijal = lakiranje PRE kaširanja (standardni redosled iznad).
export const REDOSLED_LAK_POSLE = ["materijal", "formatiranje", "stampa", "kasiranje", "lakiranje", "perforacija_rezanje", "pravljenje_creva", "kesa", "spulna"];

// Koliko slojeva templejta ima čekiran „lak". -1 = nepoznato (red ne nosi templejt).
export function brojLakSlojeva(tpl) {
    const t0 = safeJson(tpl, null);
    if (!t0 || typeof t0 !== "object") return -1;
    const t = (t0.data && typeof t0.data === "object" && (t0.data.folija || t0.data.kesa || t0.data.spulna)) ? t0.data : t0;
    const tip = t.type || t.tip;
    const grana = (tip && t[tip]) || t.folija || t.kesa || t.spulna || null;
    const L = (grana && Array.isArray(grana.layers)) ? grana.layers : (Array.isArray(t.layers) ? t.layers : null);
    if (!L) return -1;
    return L.filter((l) => l && (l.lak || l.lakiranje)).length;
}

// Templejt ugrađen u red naloga (operativni ili glavni), ili null.
function templejtReda(n) {
    if (!n) return null;
    const par = safeJson(n.parametri, {});
    const parRes = safeJson(par.res, {});
    const res = safeJson(n.res, {});
    const rez = safeJson(n.rezultati, {});
    const od = safeJson(n.order_data, {});
    return par.template || parRes.template || res.template || rez.template || n.product_template || n.template || od.template || null;
}

// Redosled operacija za JEDAN nalog (ops = stavka iz mapaOperacija).
export function redosledOperacija(ops) {
    return (ops && ops.__lakPosle) ? REDOSLED_LAK_POSLE : REDOSLED_OPERACIJA;
}
export const jeGotov = (status) => /^zavr/i.test(String(status || ""));

// Operacije koje ODLAZE u štampariju i moraju da se VRATE ("stiglo iz štamparije").
// - ŠTAMPA je UVEK eksterna.
// - LAKIRANJE je eksterno SAMO kad je tako čekirano u templejtu (in-house ili eksterno).
//   Pošto in-house lakiranje nikad ne dobija status "poslato/stiglo" (ta dugmad se ne
//   prikazuju), sam status enkodira o čemu se radi — pa nam ne treba dodatno polje ovde.
export const EKSTERNE_OP = new Set(["stampa", "lakiranje"]);

// "Stiglo iz štamparije" — potvrda fizičkog povratka materijala u pogon.
export const jeStiglo = (status) => /stiglo/i.test(String(status || ""));
export const jePoslato = (status) => /^poslato/i.test(String(status || ""));

// Da li je operacija GOTOVA ZA SLEDEĆU (otključava nizvodnu operaciju)?
//  - štampa (uvek eksterna): tek kad je "stiglo iz štamparije"
//  - lakiranje: ako je poslato u štampariju → čeka "stiglo"; ako je stiglo → gotovo;
//               in-house lakiranje (nikad poslato) → dovoljno "završeno"
//  - interne operacije (materijal, kaширanje, rezanje, kese, špulne): "završeno"
export function jeGotovZaSledecu(status, opKljucStr) {
    const s = String(status || "");
    if (opKljucStr === "stampa") {
        if (jeStiglo(s)) return true;      // eksterna štampa se vratila iz štamparije
        if (jePoslato(s)) return false;    // poslato u štampariju — još nije stiglo
        return jeGotov(s);                 // IN-HOUSE štampa: „završeno" je dovoljno da sledeća krene
    }
    if (opKljucStr === "lakiranje") {
        if (jeStiglo(s)) return true;      // eksterno lakiranje se vratilo
        if (jePoslato(s)) return false;    // poslato u štampariju, još nije stiglo
        return jeGotov(s);                 // in-house lakiranje: dovoljno "završeno"
    }
    return jeGotov(s);
}

// Mapa statusa po glavnom nalogu: { "MP-2026-0001": { materijal:"...", stampa:"..." } }
// Uz statuse, svaki nalog nosi i SKRIVENU oznaku __lakPosle (ne ulazi u Object.keys):
// true = lakira se spoj (2+ materijala čekirano za lak) → lakiranje ide POSLE kaširanja.
// Izvor: broj lak-slojeva u templejtu naloga; ako red ne nosi templejt, gleda se kolona
// „redosled" (lakiranje upisano posle kaširanja).
export function mapaOperacija(sviNalozi) {
    const m = {};
    const meta = {};
    (Array.isArray(sviNalozi) ? sviNalozi : []).forEach((n) => {
        const broj = String(n.broj_naloga || n.broj || "").trim();
        if (!broj) return;
        const master = canonRef(broj);
        const k = opKljuc(n);
        if (k === "ostalo") return;
        (m[master] = m[master] || {})[k] = String(n.status || "ceka");
        const mm = (meta[master] = meta[master] || { lak: -1, rl: 0, rk: 0 });
        if (mm.lak < 0) mm.lak = brojLakSlojeva(templejtReda(n));
        if (k === "lakiranje") mm.rl = Number(n.redosled) || 0;
        if (k === "kasiranje") mm.rk = Number(n.redosled) || 0;
    });
    Object.keys(m).forEach((master) => {
        const ops = m[master], mm = meta[master];
        if (!mm || ops.lakiranje === undefined || ops.kasiranje === undefined) return;
        const posle = mm.lak >= 0 ? mm.lak >= 2 : (mm.rl > 0 && mm.rk > 0 && mm.rl > mm.rk);
        if (posle) Object.defineProperty(ops, "__lakPosle", { value: true, enumerable: false });
    });
    return m;
}

// Vraća ključ NAJBLIŽE prethodne operacije istog naloga koja NIJE gotova ZA SLEDEĆU, ili null.
// Za eksterne operacije (štampa/lakiranje) "gotovo" znači "stiglo iz štamparije", ne samo
// "završeno" — pa kaширanje ostaje blokirano dok se materijal fizički ne vrati.
export function nadjiBlokadu(masterBroj, mojKljuc, mapa) {
    const ops = (mapa && mapa[canonRef(masterBroj)]) || {};
    const R = redosledOperacija(ops);   // lakiranje spoja ide POSLE kaširanja
    const i = R.indexOf(mojKljuc);
    if (i <= 0) return null;
    for (let j = i - 1; j >= 0; j--) {
        const k = R[j];
        if (ops[k] !== undefined && !jeGotovZaSledecu(ops[k], k)) return k;
    }
    return null;
}

export const OP_LABELE = {
    materijal: "MATERIJAL", stampa: "\u0160TAMPA", lakiranje: "LAKIRANJE", kasiranje: "KA\u0160IRANJE",
    perforacija_rezanje: "REZANJE", formatiranje: "FORMATIRANJE", kesa: "KESA", spulna: "\u0160PULNA",
    rezanje_tabaka: "REZANJE TABAKA", pravljenje_creva: "PRAVLJENJE CREVA",
};

// \u2500\u2500 AUTO-RASPORED (AI PLAN) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// v55: klju\u010d operacije (opKljuc) \u2192 TIP MA\u0160INE. Red \u010dekanja na ma\u0161ini vezuje se za tip:
//   perforacija_rezanje \u2192 rezanje,  kesa \u2192 kese,  spulna \u2192 spulne. Ostali su isti.
export const OPKLJUC_U_TIPMASINE = { perforacija_rezanje: "rezanje", kesa: "kese", spulna: "spulne" };
// Tip ma\u0161ine za dati nalog (koristi opKljuc, pa mapira na tip ma\u0161ine).
export function tipMasineZaNalog(n) {
    const k = opKljuc(n);
    return OPKLJUC_U_TIPMASINE[k] || k;
}

// \u010cIST RASPORE\u0110IVA\u010c \u2014 deli ga Plan ekran (dugme \u201eAI plan") i AI agent (alat \u201enapravi_plan_proizvodnje").
// Jedan izvor istine da se logika ne razilazi.
//   machines       \u2014 ma\u0161inski park [{id,type,status,minWidth,maxWidth,speed,setupMin,...}]
//   orders         \u2014 SAMO neraspore\u0111eni nalozi koje treba staviti [{id,opTip,priority,rok,metri,width,status}]
//   orderMap       \u2014 SVI nalozi po id (da pro\u010ditamo rok onih \u0161to su ve\u0107 u redu)
//   planPostojeci   \u2014 {machineId:[id,...]} (postoje\u0107i plan, ne dira se)
//   kompatibilna(m,o)->{ok}   \u2014 provera (tip + \u0161irina + status)
//   trajanje(m,o)->min        \u2014 procena minuta (setup + metri \u00f7 brzina)
// Logika: hitno \u2192 raniji rok \u2192 ve\u0107i metri; svaki na kompatibilnu AKTIVNU ma\u0161inu sa
//   NAJMANJE planiranih minuta; u red ma\u0161ine uba\u010den sortirano po roku (ranije gotov \u2192 prvo).
// Vra\u0107a { plan, postavljeno, preskoceni:[id,...] }.
export function autoRasporedPlan({ machines, orders, orderMap, planPostojeci, kompatibilna, trajanje }) {
    const next = { ...(planPostojeci || {}) };
    const om = orderMap || {};
    const optMin = {};
    (machines || []).forEach((m) => {
        const lst = ((next[m.id] || []).map((id) => om[id]).filter((o) => o && o.status !== "zavrseno"));
        optMin[m.id] = lst.reduce((s, o) => s + (Number(trajanje(m, o)) || 0), 0);
    });
    const rang = (p) => p === "hitno" ? 0 : p === "visok" ? 1 : 2;
    const rokMs = (o) => (o && o.rok) ? new Date(o.rok).getTime() : Infinity;
    const red = [...(orders || [])].sort((a, b) =>
        (rang(a.priority) - rang(b.priority)) || (rokMs(a) - rokMs(b)) || ((b.metri || 0) - (a.metri || 0)));
    let postavljeno = 0; const preskoceni = [];
    for (const o of red) {
        const kand = (machines || []).filter((m) => m.status === "aktivna" && kompatibilna(m, o).ok);
        if (!kand.length) {
            // objasni ZAŠTO nije stao (nema mašine tog tipa / nijedna aktivna / širina van opsega)
            const istiTip = (machines || []).filter((m) => m.type === o.opTip);
            let razlog;
            if (!istiTip.length) razlog = "nema mašine za tu operaciju";
            else {
                const aktivne = istiTip.filter((m) => m.status === "aktivna");
                if (!aktivne.length) razlog = "nijedna mašina te operacije nije aktivna";
                else { const r = kompatibilna(aktivne[0], o) || {}; razlog = r.reason || "širina naloga je van opsega mašina"; }
            }
            preskoceni.push({ id: o.id, razlog });
            continue;
        }
        let best = null, bl = Infinity;
        for (const m of kand) {
            const l = optMin[m.id] || 0;
            if (l < bl || (l === bl && (Number(m.setupMin) || 0) < (best ? (Number(best.setupMin) || 0) : 1e9))) { bl = l; best = m; }
        }
        const dur = Number(trajanje(best, o)) || 0;
        const q = [...(next[best.id] || [])];
        const orok = rokMs(o);
        let idx = q.length;
        for (let i = 0; i < q.length; i++) { const eo = om[q[i]]; const er = eo ? rokMs(eo) : Infinity; if (er > orok) { idx = i; break; } }
        q.splice(idx, 0, o.id);
        next[best.id] = q;
        optMin[best.id] = (optMin[best.id] || 0) + dur;
        postavljeno++;
    }
    // preskoceni = [{id,razlog}]; preskoceniId = samo šifre (za stare pozive)
    return { plan: next, postavljeno, preskoceni, preskoceniId: preskoceni.map((p) => p.id) };
}