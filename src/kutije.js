// =====================================================================
// kutije.js — katalog kutija za špulne.
// Format naziva: ŠIRINA x DUBINA x VISINA / PREČNIK HILZNE
//   npr. 410x410x305 / 152  →  lice 410×410 mm, dubina 305 mm, hilzna Ø152
//
//   lice   (w × h)  mora primiti prečnik špulne  → D  ≤ min(w, h)
//   dubina (d)      mora primiti širinu namotaja → T  ≤ d
//   hilzna (Di)     mora se poklopiti            → Di = hilzna
//
// Koriste ga: templejt (ProductTemplateEngineV20) i nalog (NalogLayoutPRO).
// =====================================================================

export const KUTIJE = [
    { k: "280x280x190/76", w: 280, h: 280, d: 190, hilzna: 76, poPaleti: 36 },
    { k: "398x398x183/76", w: 398, h: 398, d: 183, hilzna: 76, poPaleti: 36 },
    { k: "398x398x183/152", w: 398, h: 398, d: 183, hilzna: 152, poPaleti: 36 },
    { k: "410x410x305/76", w: 410, h: 410, d: 305, hilzna: 76, poPaleti: 18 },
    { k: "410x410x305/152", w: 410, h: 410, d: 305, hilzna: 152, poPaleti: 18 },
];

// Rolni (kutija) po paleti — predlog po dubini kutije. 1 špulna = 1 kutija.
//   duboke  (305 mm) → 18 po paleti
//   plitke  (183/190 mm) → 36 po paleti
// Predlog se upisuje pri izboru kutije, ali se u templejtu MOŽE RUČNO PROMENITI.
export function poPaletiZa(kutija) {
    if (!kutija) return 0;
    if (kutija.poPaleti) return kutija.poPaleti;
    return kutija.d >= 250 ? 18 : 36;
}
// Rolni po paleti se unosi ručno u templejtu (1 špulna = 1 kutija).

export const KUTIJA_LBL = (b) => b.w + "×" + b.h + "×" + b.d + " / " + b.hilzna;

/** Da li kutija odgovara špulni? Vraća listu razloga zašto NE. */
export function proveriKutiju(kutija, spulna) {
    const n = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
    if (!kutija) return ["Kutija nije izabrana."];
    const D = n(spulna.D), T = n(spulna.T), Di = n(spulna.Di);
    const gr = [];
    if (Di && kutija.hilzna && Di !== kutija.hilzna)
        gr.push("Hilzna špulne je Ø" + Di + " mm, a kutija je za Ø" + kutija.hilzna + " mm.");
    if (D && D > Math.min(kutija.w, kutija.h))
        gr.push("Prečnik špulne " + D + " mm ne staje u lice kutije " + kutija.w + "×" + kutija.h + " mm.");
    if (T && T > kutija.d)
        gr.push("Širina namotaja T=" + T + " mm ne staje u dubinu kutije " + kutija.d + " mm.");
    return gr;
}

/** Predloži najmanju kutiju koja odgovara špulni (ili null). */
export function predloziKutiju(spulna) {
    const kandidati = KUTIJE
        .filter((b) => proveriKutiju(b, spulna).length === 0)
        .sort((a, b) => (a.w * a.h * a.d) - (b.w * b.h * b.d));
    return kandidati[0] || null;
}

export function kutijaPoKljucu(k) {
    return KUTIJE.find((b) => b.k === k) || null;
}
