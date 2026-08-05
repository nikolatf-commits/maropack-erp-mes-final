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
export const OP_SUFIKS = /-(MATERIJAL|STAMPA|LAKIRANJE|KASIRANJE|PERFORACIJA_REZANJE|FORMATIRANJE|KESA|SPULNA)$/i;
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
    const rzn = folija.rezanje || {};
    const st = folija.stampa || {};
    const sirina = num2(rzn.sirinaMaterijala) || num2(t.idealnaSirinaMaterijala) || num2(n.sirina) || num2(n.sir) || 0;
    // Broj traka: lista širina → override iz templejta → izračun iz širine trake i matične
    const brojTraka = (Array.isArray(rzn.sirineTraka) && rzn.sirineTraka.length) ? rzn.sirineTraka.length
        : (num2(rzn.brojTraka) || num2(rzn.brojTrakaOverride)
            || (num2(rzn.sirinaTrake) > 0 && sirina > 0 ? Math.max(1, Math.floor(sirina / num2(rzn.sirinaTrake))) : 0));
    const kolicina = num2(n.metraza || n.kol || n.kolicina || t.porucenaKolicina || od.kolicina);
    // 1) NAJTAČNIJE: templejt-engine od v53 upisuje gotove metre matične rolne u parametre
    //    naloga (metraza_maticne) — jedinica unosa (kom/kg/m) tu više ne igra ulogu.
    const direktnaMaticna = num2(par.metraza_maticne || od.metraza_maticne || res.metraza_maticne || rez.metraza_maticne);
    let metriMasine;
    if (direktnaMaticna > 0) {
        metriMasine = Math.round(direktnaMaticna);
    } else {
        // 2) Stariji nalozi: poštuj JEDINICU UNOSA — porucenaKolicina u KOM nisu metri!
        const jed = String(t.jedinicaUnosa || "m").toLowerCase();
        const trake = Math.max(1, brojTraka);
        if (jed === "kom" && kolicina > 0) {
            const korakM = num2(t.dimenzijaDuzina) / 1000;               // dužina komada duž trake
            metriMasine = korakM > 0 ? Math.round((kolicina * korakM) / trake) : 0;
        } else if (jed === "kg" && kolicina > 0) {
            const slojevi = (folija.layers || []);
            const gm2 = slojevi.reduce((a, l) => a + (num2(l.gm2) || num2(l.debljina) * num2(l.koeficijent)), 0);
            const m2 = gm2 > 0 ? (kolicina * 1000) / gm2 : 0;
            metriMasine = (m2 > 0 && sirina > 0) ? Math.round(m2 / (sirina / 1000) / trake) : 0;
        } else {
            metriMasine = kolicina > 0 ? Math.round(kolicina / trake) : 0; // "m" — kao i do sada
        }
    }
    return {
        kolicina, brojTraka,
        // Mašina provlači MATIČNU rolnu: rezanje množi trake, ne skraćuje rolnu.
        metriMasine,
        sirina,
        rok: n.rok || n.rok_isporuke || n.datum_isporuke || od.rok || t.rok || "",
        kom: num2(od.kom || t.porucenaKolicinaKom || n.kom),
        brojBoja: num2(st.brojBoja),
        tipProizvoda: String(n.tip_proizvoda || n.tip || ""),
    };
}
export function metriMasineNaloga(n) { return extraktNalog(n).metriMasine; }

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
//   folija:  materijal → štampa → lakiranje → kaširanje → perforacija/rezanje
//   kesa:    materijal → kaширanje → kesa
//   špulna:  materijal → formatiranje → špulna
export const REDOSLED_OPERACIJA = ["materijal", "stampa", "lakiranje", "kasiranje", "perforacija_rezanje", "formatiranje", "kesa", "spulna"];
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
    if (opKljucStr === "stampa") return jeStiglo(s);
    if (opKljucStr === "lakiranje") {
        if (jeStiglo(s)) return true;      // eksterno lakiranje se vratilo
        if (jePoslato(s)) return false;    // poslato u štampariju, još nije stiglo
        return jeGotov(s);                 // in-house lakiranje: dovoljno "završeno"
    }
    return jeGotov(s);
}

// Mapa statusa po glavnom nalogu: { "MP-2026-0001": { materijal:"...", stampa:"..." } }
export function mapaOperacija(sviNalozi) {
    const m = {};
    (Array.isArray(sviNalozi) ? sviNalozi : []).forEach((n) => {
        const broj = String(n.broj_naloga || n.broj || "").trim();
        if (!broj) return;
        const master = canonRef(broj);
        const k = opKljuc(n);
        if (k === "ostalo") return;
        (m[master] = m[master] || {})[k] = String(n.status || "ceka");
    });
    return m;
}

// Vraća ključ NAJBLIŽE prethodne operacije istog naloga koja NIJE gotova ZA SLEDEĆU, ili null.
// Za eksterne operacije (štampa/lakiranje) "gotovo" znači "stiglo iz štamparije", ne samo
// "završeno" — pa kaширanje ostaje blokirano dok se materijal fizički ne vrati.
export function nadjiBlokadu(masterBroj, mojKljuc, mapa) {
    const i = REDOSLED_OPERACIJA.indexOf(mojKljuc);
    if (i <= 0) return null;
    const ops = (mapa && mapa[canonRef(masterBroj)]) || {};
    for (let j = i - 1; j >= 0; j--) {
        const k = REDOSLED_OPERACIJA[j];
        if (ops[k] !== undefined && !jeGotovZaSledecu(ops[k], k)) return k;
    }
    return null;
}

export const OP_LABELE = {
    materijal: "MATERIJAL", stampa: "\u0160TAMPA", lakiranje: "LAKIRANJE", kasiranje: "KA\u0160IRANJE",
    perforacija_rezanje: "REZANJE", formatiranje: "FORMATIRANJE", kesa: "KESA", spulna: "\u0160PULNA",
};