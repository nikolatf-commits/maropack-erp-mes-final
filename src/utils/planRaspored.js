// ─────────────────────────────────────────────────────────────────────────────
//  MAROPACK — planRaspored.js  [v2]
//  ČIST proračun plana proizvodnje (bez React-a): red čekanja po mašinama → DATUMI.
//  JEDAN izvor istine — koriste ga GanttPlanPRO i agentAlati.
//
//  v2 — RASPORED SMENA PO MAŠINI (ne globalno):
//    • Svaka mašina ima svoj kalendar: radnim danom `smeneRadnim` (default 2),
//      vikendom `smeneVikend` (default 0). 1 smena = 8h sa 1h pauze = 420 min efektivno.
//    • Mašine koje rade SAMO vikendom (kaширka, štampa „Maropack Karint") dobijaju
//      posao isključivo subotom/nedeljom; ostale pon–pet.
//    • Motor radi u REALNOM VREMENU (Date), svaka mašina napreduje kroz SVOJ kalendar,
//      pa se faze poštuju i kad su na mašinama sa različitim radnim danima.
//  Zavisnosti: operacija ne kreće pre nego što je prethodna GOTOVA ZA SLEDEĆU
//  (za štampu/eksterno lakiranje = „stiglo iz štamparije"; interna štampa = „završeno").
// ─────────────────────────────────────────────────────────────────────────────
import { procenaMinNaMasini, REDOSLED_OPERACIJA, jeGotov, jeGotovZaSledecu, jeStiglo, jePoslato, canonRef } from "./nalogMetrika.js";

// ── radni kalendar (konstante) ───────────────────────────────────────────────
export const DAN_OD = 6 * 60;          // radni dan počinje 06:00
export const SMENA = 420;              // efektivnih min po smeni (8h − 1h pauza)
export const DAN_MIN = 2 * SMENA;      // referentni pun dan (2 smene = 840 min) za zauzetost %
export const DEF_SMENE_RADNIM = 2;
export const DEF_SMENE_VIKEND = 0;

// Da li mašina radi SAMO vikendom (fallback kad polja smena nisu zadata).
export function jeVikendMasina(machine) {
    const id = String(machine && machine.id || "").toLowerCase();
    const naziv = String(machine && machine.name || "").toLowerCase();
    return (machine && machine.type === "kasiranje") || id.includes("maropack") || naziv.includes("maropack");
}
// Broj smena date mašine za dati dan (vikend = ned/sub).
export function smeneMasine(machine, date) {
    const dow = date.getDay();                 // 0=ned … 6=sub
    const vik = dow === 0 || dow === 6;
    const r = Number(vik ? (machine && machine.smeneVikend) : (machine && machine.smeneRadnim));
    if (Number.isFinite(r) && r >= 0) return r;
    // fallback kad mašina nema upisane smene:
    if (jeVikendMasina(machine)) return vik ? 2 : 0;     // kaширka/Maropack: samo vikend
    return vik ? DEF_SMENE_VIKEND : DEF_SMENE_RADNIM;    // ostale: pon–pet 2 smene
}
export function kapacitetDanaMasine(machine, date) { return smeneMasine(machine, date) * SMENA; }
export function radniMasine(machine, date) { return kapacitetDanaMasine(machine, date) > 0; }

// ── GENERIČKI kalendar (default mašina pon–pet) — za „sada" i legacy pozive ───
export const jeRadni = (d) => { const x = d.getDay(); return x >= 1 && x <= 5; };          // pon–pet
export const kapacitetDana = (d) => (jeRadni(d) ? DAN_MIN : 0);                            // 840 / 0

export function pocetakRadnog(d) { const x = new Date(d); x.setHours(6, 0, 0, 0); return x; }

// „sada" — trenutno vreme, samo gurnuto na 06:00 ako je ranije (vikend se NE preskače;
// svaka mašina ima svoj kalendar pa sama odluči kad joj je prvi radni trenutak).
export function radnoSada() {
    const n = new Date();
    const min = n.getHours() * 60 + n.getMinutes();
    if (min < DAN_OD) n.setHours(6, 0, 0, 0);
    return n;
}

// ── per-mašina kretanje kroz realno vreme ────────────────────────────────────
export function sledeciRadniMasine(machine, d) {
    const x = new Date(d); let g = 0;
    do { x.setDate(x.getDate() + 1); g++; } while (!radniMasine(machine, x) && g < 800);
    return pocetakRadnog(x);
}
// Gurni datum u radni prozor baš te mašine (preskoči njene neradne dane / van-smenske sate).
export function radnoSadaMasine(machine, from) {
    let n = new Date(from); let g = 0;
    while (g++ < 800) {
        if (!radniMasine(machine, n)) { n = sledeciRadniMasine(machine, n); continue; }
        const cap = kapacitetDanaMasine(machine, n);
        const min = n.getHours() * 60 + n.getMinutes();
        if (min < DAN_OD) { n = pocetakRadnog(n); break; }
        if (min >= DAN_OD + cap) { n = sledeciRadniMasine(machine, n); continue; }
        break;
    }
    return n;
}
// Dodaj `minutes` efektivnih radnih minuta na `start`, kroz kalendar mašine → Date kraja.
export function dodajMinuteMasine(machine, start, minutes) {
    let d = radnoSadaMasine(machine, start);
    let ost = Math.max(0, Math.round(Number(minutes) || 0));
    let g = 0;
    while (g++ < 4000) {
        const cap = kapacitetDanaMasine(machine, d);
        const min = d.getHours() * 60 + d.getMinutes();
        const doKraja = DAN_OD + cap - min;
        if (ost <= doKraja) return new Date(d.getTime() + ost * 60000);
        ost -= doKraja; d = sledeciRadniMasine(machine, d);
    }
    return d;
}

// ── legacy wm (radni-minuti) helperi — zadržani zbog starih poziva ───────────
export function sledeciRadni(d) { const x = new Date(d); do { x.setDate(x.getDate() + 1); } while (!jeRadni(x)); return pocetakRadnog(x); }
export function wmToDate(sidro, wm) {
    let d = new Date(sidro); let ost = Math.max(0, Math.round(wm));
    for (; ;) {
        if (!jeRadni(d)) { d = sledeciRadni(d); continue; }
        const cap = kapacitetDana(d);
        const min = d.getHours() * 60 + d.getMinutes();
        const doKraja = DAN_OD + cap - min;
        if (ost < doKraja) return new Date(d.getTime() + ost * 60000);
        ost -= doKraja; d = sledeciRadni(d);
    }
}
export function dateToWm(sidro, dat) {
    if (!(dat instanceof Date) || Number.isNaN(dat.getTime()) || dat <= sidro) return 0;
    let d = new Date(sidro), wm = 0;
    for (let i = 0; i < 400; i++) {
        if (!jeRadni(d)) { d = sledeciRadni(d); continue; }
        const cap = kapacitetDana(d);
        const kraj = new Date(d); kraj.setHours(0, 0, 0, 0); kraj.setMinutes(DAN_OD + cap);
        if (dat <= kraj) { return wm + Math.max(0, (dat - d) / 60000); }
        wm += (kraj - d) / 60000; d = sledeciRadni(d);
    }
    return wm;
}

export const OP2KEY = { rezanje: "perforacija_rezanje", kese: "kesa", spulne: "spulna" };
export const KEY2SUF = { materijal: "MATERIJAL", stampa: "STAMPA", lakiranje: "LAKIRANJE", kasiranje: "KASIRANJE", perforacija_rezanje: "PERFORACIJA_REZANJE", formatiranje: "FORMATIRANJE", kesa: "KESA", spulna: "SPULNA" };
export const POVRATAK_IZ_STAMPARIJE_DANA = 2; // pretpostavka kad nema ručnog datuma

// Da li prethodna EKSTERNA štampa / eksterno lakiranje čeka fizički POVRATAK iz štamparije?
// Interna štampa („završeno") NE čeka povratak — odmah pušta sledeću operaciju.
export function cekaPovratakIzStamparije(pKljuc, statusP) {
    const s = String(statusP || "");
    if (jeStiglo(s)) return false;     // već se vratilo
    if (jePoslato(s)) return true;     // poslato u štampariju, čeka povratak
    return false;                      // interno završeno → ne čeka
}

export function minutaOd(iso) { const d = new Date(iso); return Number.isNaN(d.getTime()) ? 0 : Math.max(0, Math.round((Date.now() - d.getTime()) / 60000)); }

// ── ENGINE: plan → raspored sa datumima (realno vreme, kalendar po mašini) ────
export function izracunajRaspored({ machines, plan, orderMap, opStatusi, sidro }) {
    const sidroD = (sidro instanceof Date) ? sidro : radnoSada();
    const trajanje = (m, o) => {
        if (!o) return 0;
        const rucno = Number(o.trajanjeRucno || 0);
        if (rucno > 0) return rucno;
        return procenaMinNaMasini(m, o.metri) || Number(o.durationMin || 60);
    };
    // ključ prethodne NEZAVRŠENE operacije (kroz REDOSLED), ili null
    const prethodna = (o) => {
        const moj = OP2KEY[o.opTip] || o.opTip;
        const i = REDOSLED_OPERACIJA.indexOf(moj);
        if (i <= 0) return null;
        const mape = opStatusi[canonRef(o.id)] || {};
        for (let j = i - 1; j >= 0; j--) {
            const k = REDOSLED_OPERACIJA[j];
            if (mape[k] !== undefined && !jeGotovZaSledecu(mape[k], k)) return k;
        }
        return null;
    };
    const POVRATAK_MS = POVRATAK_IZ_STAMPARIJE_DANA * 24 * 3600000;

    let kraj = {};                       // orderId → END Date (ms)
    let rezultat = [];
    for (let prolaz = 0; prolaz < 12; prolaz++) {
        const noviKraj = {}; rezultat = [];
        machines.forEach((m) => {
            const red = ((plan[m.id] || []).map((id) => orderMap[id]).filter((o) => o && o.status !== "zavrseno"));
            let tDate = radnoSadaMasine(m, sidroD);   // mašina slobodna od (u svom kalendaru)
            const ostalo = red.slice();
            while (ostalo.length) {
                const info = ostalo.map((o) => {
                    let readyDate = sidroD, ceka = null, vanPlana = false, pretpostavka = false;
                    const p = prethodna(o);
                    if (p) {
                        ceka = p;
                        const predId = canonRef(o.id) + "-" + KEY2SUF[p];
                        const statusP = String((opStatusi[canonRef(o.id)] || {})[p] || "");
                        if (cekaPovratakIzStamparije(p, statusP)) {
                            const baza = kraj[predId] ? kraj[predId].getTime() : sidroD.getTime();
                            readyDate = new Date(baza + POVRATAK_MS); pretpostavka = true;
                        } else if (kraj[predId]) {
                            readyDate = kraj[predId];
                        } else {
                            vanPlana = true; // prethodna postoji, nije gotova, a nije u planu
                        }
                    }
                    if (String(o.statusRaw || "").indexOf("poslato") === 0) {
                        // sama operacija je u eksternoj štampariji
                        return { o, readyDate: sidroD, dur: 0, ceka: null, vanPlana: false, pretpostavka: true, eksterno: true };
                    }
                    let dur = trajanje(m, o);
                    if (o.status === "u_radu" && o.start_ts) dur = Math.max(10, dur - minutaOd(o.start_ts));
                    return { o, readyDate, dur, ceka, vanPlana, pretpostavka, eksterno: false };
                });
                // uskoči u rupu: prvi po redu koji je SPREMAN (readyDate ≤ tDate); inače najraniji spreman
                let idx = info.findIndex((x) => x.readyDate <= tDate);
                let usko = false;
                if (idx === -1) idx = info.reduce((best, x, i) => (x.readyDate < info[best].readyDate ? i : best), 0);
                else if (idx > 0) usko = true;
                if (idx === -1) idx = 0;
                const izabran = info[idx];
                if (idx > 0 && info[0].readyDate > tDate) usko = true;

                const startRaw = (izabran.readyDate > tDate) ? izabran.readyDate : tDate;
                const startDate = izabran.eksterno ? new Date(startRaw) : radnoSadaMasine(m, startRaw);
                const cekaOd = (izabran.readyDate > tDate) ? new Date(tDate) : null;   // mašina slobodna dok čeka
                const endDate = izabran.eksterno
                    ? new Date(startDate.getTime() + POVRATAK_MS)
                    : dodajMinuteMasine(m, startDate, izabran.dur);

                rezultat.push({
                    masinaId: m.id, o: izabran.o,
                    startDate, endDate, cekaOd, ceka: izabran.ceka,
                    vanPlana: izabran.vanPlana, pretpostavka: izabran.pretpostavka,
                    eksterno: izabran.eksterno, uskok: usko && !izabran.ceka,
                });
                noviKraj[izabran.o.id] = endDate;
                tDate = endDate;
                ostalo.splice(ostalo.indexOf(izabran.o), 1);
            }
        });
        const kljuceviIsti = Object.keys(noviKraj).length === Object.keys(kraj).length
            && Object.keys(noviKraj).every((k) => kraj[k] && noviKraj[k] && kraj[k].getTime() === noviKraj[k].getTime());
        kraj = noviKraj;
        if (kljuceviIsti) break;
    }
    // finalni oblik + rok (realni datumi)
    return rezultat.map((s) => {
        const start = s.startDate, end = s.endDate;
        let rokD = null, probija = false, kasniDana = 0;
        if (s.o.rok) {
            const r = new Date(s.o.rok);
            if (!Number.isNaN(r.getTime())) {
                r.setHours(22, 0, 0, 0); rokD = r; probija = end > r;
                if (probija) kasniDana = Math.max(1, Math.ceil((end.getTime() - r.getTime()) / (24 * 3600000)));
            }
        }
        return { ...s, start, end, rokD, probija, kasniDana };
    });
}
