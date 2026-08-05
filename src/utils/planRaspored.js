// ─────────────────────────────────────────────────────────────────────────────
//  MAROPACK — planRaspored.js  [v1]
//  ČIST proračun plana proizvodnje (bez React-a): red čekanja po mašinama → DATUMI.
//  JEDAN izvor istine — koriste ga:
//    - GanttPlanPRO (vizuelni plan)   → import "../utils/planRaspored.js"
//    - agentAlati (AI agent)          → import "../utils/planRaspored.js"
//  Time AI daje ISTE termine kao Gantt (ne čita više praznu tabelu plan_proizvodnje).
//
//  Režim: 2 smene = 960 min/dan (06–22h), pon–pet; subota 1 smena (480), nedelja 0.
//  Zavisnosti: operacija ne kreće pre nego što je prethodna GOTOVA ZA SLEDEĆU
//  (za štampu/eksterno lakiranje = "stiglo iz štamparije"). Datumi se ne čuvaju —
//  računaju se u letu iz plana, pa svaka izmena plana odmah pomera termine.
// ─────────────────────────────────────────────────────────────────────────────
import { procenaMinNaMasini, REDOSLED_OPERACIJA, jeGotov, jeGotovZaSledecu, jeStiglo, jePoslato, canonRef } from "./nalogMetrika.js";

// ── radni kalendar ───────────────────────────────────────────────────────────
export const DAN_OD = 6 * 60;          // radni dan počinje 06:00
export const SMENA = 480;
export const DAN_MIN = 2 * SMENA;      // referentni pun dan (za zauzetost %)
// Kapacitet dana: pon–pet 2 smene (960), subota 1 smena (480), nedelja 0.
export const jeRadni = (d) => { const x = d.getDay(); return x >= 1 && x <= 6; };
export const kapacitetDana = (d) => { const x = d.getDay(); if (x === 0) return 0; if (x === 6) return SMENA; return 2 * SMENA; };

export function pocetakRadnog(d) { const x = new Date(d); x.setHours(6, 0, 0, 0); return x; }
export function sledeciRadni(d) { const x = new Date(d); do { x.setDate(x.getDate() + 1); } while (!jeRadni(x)); return pocetakRadnog(x); }

// "sada" ugurano u radno vreme (pre 06 → 06 danas; posle 22 ili vikend → sledeći radni 06)
export function radnoSada() {
    const n = new Date();
    if (!jeRadni(n)) return sledeciRadni(n);
    const min = n.getHours() * 60 + n.getMinutes();
    if (min < DAN_OD) return pocetakRadnog(n);
    if (min >= DAN_OD + DAN_MIN) return sledeciRadni(n);
    return n;
}

// radni-minuti (wm) od sidra → Date
export function wmToDate(sidro, wm) {
    let d = new Date(sidro);
    let ost = Math.max(0, Math.round(wm));
    for (; ;) {
        if (!jeRadni(d)) { d = sledeciRadni(d); continue; }
        const cap = kapacitetDana(d);
        const min = d.getHours() * 60 + d.getMinutes();
        const doKraja = DAN_OD + cap - min;
        if (ost < doKraja) return new Date(d.getTime() + ost * 60000);
        ost -= doKraja; d = sledeciRadni(d);
    }
}
// Date → radni-minuti od sidra (datum pre sidra → 0)
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

// Da li prethodna EKSTERNA operacija (štampa / eksterno lakiranje) čeka fizički POVRATAK
// iz štamparije? Ako jeste (poslata ili tamo završena, a nije "stiglo") — nizvodna operacija
// se planira sa pretpostavljenim povratkom, ne kao "van plana".
export function cekaPovratakIzStamparije(pKljuc, statusP) {
    const s = String(statusP || "");
    if (jeStiglo(s)) return false;                     // već stiglo → ne čeka
    if (jePoslato(s)) return true;                     // poslato u štampariju
    if (pKljuc === "stampa" && jeGotov(s)) return true; // štampa "završena u štampariji", čeka povratak
    return false;
}

export function minutaOd(iso) { const d = new Date(iso); return Number.isNaN(d.getTime()) ? 0 : Math.max(0, Math.round((Date.now() - d.getTime()) / 60000)); }

// ── ENGINE: čista funkcija plan → raspored sa datumima ───────────────────────
export function izracunajRaspored({ machines, plan, orderMap, opStatusi, sidro }) {
    const poId = {}; machines.forEach((m) => { poId[m.id] = m; });
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

    let kraj = {};                       // orderId → wm kraja (procena iz prošlog prolaza)
    let rezultat = [];
    for (let prolaz = 0; prolaz < 12; prolaz++) {
        const noviKraj = {}; rezultat = [];
        machines.forEach((m) => {
            const red = ((plan[m.id] || []).map((id) => orderMap[id]).filter((o) => o && o.status !== "zavrseno"));
            let t = 0;                   // wm slobodna mašina
            const ostalo = red.slice();
            while (ostalo.length) {
                // spremnost svakog kandidata (zavisnost od prethodne operacije)
                const info = ostalo.map((o) => {
                    let ready = 0, ceka = null, vanPlana = false, pretpostavka = false;
                    const p = prethodna(o);
                    if (p) {
                        ceka = p;
                        const predId = canonRef(o.id) + "-" + KEY2SUF[p];
                        const statusP = String((opStatusi[canonRef(o.id)] || {})[p] || "");
                        if (cekaPovratakIzStamparije(p, statusP)) {
                            // eksterna operacija još NIJE stigla iz štamparije → pretpostavi povratak
                            const baza = (kraj[predId] !== undefined) ? kraj[predId] : 0;
                            ready = baza + POVRATAK_IZ_STAMPARIJE_DANA * DAN_MIN; pretpostavka = true;
                        } else if (kraj[predId] !== undefined) {
                            ready = kraj[predId];
                        } else {
                            vanPlana = true; // prethodna postoji, nije gotova, a nije u planu
                        }
                    }
                    if (String(o.statusRaw || "").indexOf("poslato") === 0) {
                        // sama operacija je u eksternoj štampariji
                        return { o, ready: 0, dur: POVRATAK_IZ_STAMPARIJE_DANA * DAN_MIN, ceka: null, vanPlana: false, pretpostavka: true, eksterno: true };
                    }
                    let dur = trajanje(m, o);
                    if (o.status === "u_radu" && o.start_ts) dur = Math.max(10, dur - minutaOd(o.start_ts));
                    return { o, ready, dur, ceka, vanPlana, pretpostavka, eksterno: false };
                });
                // uskoči u rupu: prvi po redu koji je SPREMAN; ako niko nije — najraniji spreman
                let idx = info.findIndex((x) => x.ready <= t);
                let usko = false;
                if (idx === -1) idx = info.reduce((best, x, i) => (x.ready < info[best].ready ? i : best), 0);
                else if (idx > 0) usko = true;
                if (idx === -1) idx = 0;
                const izabran = info[idx];
                if (idx > 0 && info[0].ready > t) usko = true;
                const start = Math.max(t, izabran.ready);
                const cekaOd = izabran.ready > t ? t : null;
                const end = start + izabran.dur;
                rezultat.push({
                    masinaId: m.id, o: izabran.o,
                    startWm: start, endWm: end,
                    cekaOdWm: cekaOd, ceka: izabran.ceka,
                    vanPlana: izabran.vanPlana, pretpostavka: izabran.pretpostavka,
                    eksterno: izabran.eksterno, uskok: usko && !izabran.ceka,
                });
                noviKraj[izabran.o.id] = end;
                t = end;
                ostalo.splice(ostalo.indexOf(izabran.o), 1);
            }
        });
        const isto = Object.keys(noviKraj).length === Object.keys(kraj).length
            && Object.keys(noviKraj).every((k) => kraj[k] === noviKraj[k]);
        kraj = noviKraj;
        if (isto) break;
    }
    // wm → datumi + rok
    return rezultat.map((s) => {
        const start = wmToDate(sidro, s.startWm), end = wmToDate(sidro, s.endWm);
        let rokD = null, probija = false, kasniDana = 0;
        if (s.o.rok) {
            const r = new Date(s.o.rok);
            if (!Number.isNaN(r.getTime())) { r.setHours(22, 0, 0, 0); rokD = r; probija = end > r; if (probija) kasniDana = Math.max(1, Math.ceil((dateToWm(sidro, end) - dateToWm(sidro, r)) / DAN_MIN)); }
        }
        return { ...s, start, end, rokD, probija, kasniDana };
    });
}
