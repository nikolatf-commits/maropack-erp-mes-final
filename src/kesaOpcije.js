// =====================================================================
// kesaOpcije.js — katalog tehničkih opcija kese
// Vrednosti su iz Excel sheeta "Podaci za izbor liste".
// Koriste ga: templejt (ProductTemplateEngineV20), crtež (CrtezKese) i nalog (NalogLayoutPRO).
//
// Polja svake opcije:
//   k      : ključ (čuva se u kesa.options[k] = true/false, a izbor u kesa.optSel[k])
//   l      : labela za prikaz
//   tip    : "lista" (padajuća) | "danet" (samo DA) | "tekst" | "broj"
//   vals   : vrednosti padajuće liste (za tip "lista")
//   pos    : polja pozicije koja se prikazuju (odVrha, odDna, levo, desno, sirina, visina, odstojanje)
//   tekstPolja : dodatna slobodna tekst-polja (npr. štampa: površina/pozicija/motiv)
//   crtez  : ključ opcije u CrtezKese (da utiče na crtež), ako postoji
//   food   : ako true, čekiranje ubacuje propisani tekst za hranu
// =====================================================================

export const FOOD_TEXT =
    "PAKOVANJE ZA HRANU — upotreba rukavica, mrežica za kosu, bez dlaka, mrva, mrlja, prljavštine, prašine, buba, drugih insekata i drugih stranih tela. Kutija mora biti obložena čistom folijom.";

export const KESA_OPCIJE = [
    {
        k: "duplofan", l: "Duplofan traka", tip: "lista",
        vals: ["Obična", "Permanentna", "Permanentna bezbedna za hranu", "Široka"],
        pos: ["odVrha"], crtez: "duplofan"
    },

    {
        k: "ukosena_klapna", l: "Ukošena klapna", tip: "lista",
        vals: ["DA", "DA NA KRAĆOJ STRANI"], crtez: "kosa_klapna"
    },

    {
        k: "perf_otkinuti", l: "Perforirana za otkinuti na rolni", tip: "lista",
        vals: ["Fina perforacija", "Gruba perforacija"], crtez: "abreiss"
    },

    { k: "otvor_dno", l: "Otvor na dnu kese", tip: "danet", crtez: "otvor_dno" },

    { k: "falta_dno", l: "Falta na dnu", tip: "broj", jed: "mm", crtez: "falta_dno" },

    { k: "var_dno", l: "Var na dnu", tip: "danet", crtez: "var_dno" },

    {
        k: "stampa", l: "Štampa", tip: "lista",
        vals: ["Termotransfer", "Štampa vrućim pečatom", "Flexo štampa",
            "Štampa vrućim pečatom crna boja", "Štampa vrućim pečatom zelena boja",
            "Štampa vrućim pečatom zlatna boja", "Štampa vrućim pečatom srebrna boja"],
        pos: ["sirina", "visina", "odVrha", "levo"],
        tekstPolja: [
            { k: "povrsina", l: "Površina štampe" },
            { k: "pozicija", l: "Pozicija štampe" },
            { k: "motiv", l: "Motiv štampe (tekst/logo)" },
        ],
        crtez: "stampa"
    },

    {
        k: "eurozumba", l: "Eurozumba", tip: "lista",
        vals: ["MALA(30x10x5)", "SREDNJA(32x10x5)", "VELIKA(35x12x5)", "SPECIJALNA"],
        pos: ["odstojanje"], crtez: "eurozumba"
    },

    { k: "utor", l: "UTOR", tip: "lista", vals: ["205"], crtez: "utor" },

    { k: "perf_igle", l: "Perforacija vrućim iglama", tip: "danet", crtez: "mikroperforacija" },

    {
        k: "okrugla_zumba", l: "Okrugla zumba", tip: "danet",
        tekstPolja: [{ k: "velicina_pozicija", l: "Veličina i pozicija (npr. dm=6 mm, 67,5 mm od desne…)" }],
        crtez: "okrugla_zumba"
    },

    { k: "poprecna_perf", l: "Poprečna perforacija", tip: "danet", crtez: "poprecna_perf" },

    { k: "poprecni_var", l: "Poprečni var", tip: "lista", vals: ["DA", "3mm"], crtez: "poprecni_var" },

    { k: "hrana", l: "Pakovanje za hranu", tip: "danet", food: true },

    {
        k: "anleger", l: "ANLEGER", tip: "lista",
        vals: [
            "135µm/20mm/BELI", "135µm/25mm/BELI", "135µm/30mm/BELI", "135µm/35mm/BELI", "135µm/40mm/BELI",
            "135µm/20mm/TRANSPARENTNI", "135µm/25mm/TRANSPARENTNI", "135µm/30mm/TRANSPARENTNI", "135µm/35mm/TRANSPARENTNI", "135µm/40mm/TRANSPARENTNI",
            "150µm/20mm/BELI", "150µm/25mm/BELI", "150µm/30mm/BELI", "150µm/35mm/BELI", "150µm/40mm/BELI",
            "150µm/20mm/TRANSPARENTNI", "150µm/25mm/TRANSPARENTNI", "150µm/30mm/TRANSPARENTNI", "150µm/35mm/TRANSPARENTNI", "150µm/40mm/TRANSPARENTNI",
            "140µm/30mm/PLAVI",
        ],
        pos: ["odVrha"], crtez: "anleger"
    },

    {
        k: "pakovati", l: "Pakovati", tip: "lista",
        vals: [
            "U banderolu", "Gore i dole karton sa banderolom", "Gore i dole karton sa gumicom",
            "Pakovati u kesice po 20 kom", "Pakovati u kesice po 25 kom", "Pakovati u kesice po 50 kom",
            "Pakovati u kesice po 75 kom", "Pakovati u kesice po 100 kom",
            "U kutiju ide 100 kom", "U kutiju ide 200 kom", "U kutiju ide 300 kom", "U kutiju ide 400 kom",
            "U kutiju ide 500 kom", "U kutiju ide 1000 kom", "U kutiju ide 5000 kom",
            "U bunt ide 20 kom", "U bunt ide 25 kom", "U bunt ide 50 kom", "U bunt ide 75 kom",
            "U bunt ide 100 kom", "U bunt ide 200 kom", "U bunt ide 250 kom",
        ]
    },

    { k: "poz_duplofan", l: "Pozicija duplofan trake", tip: "lista", vals: ["Na klapni"] },

    {
        k: "tolerancija_kol", l: "Tolerancija količine", tip: "lista",
        vals: ["Mora tačna količina", "Bez + tolerancije", "Bez – tolerancije", "+/- 10%"]
    },
];

// Labela pozicionih polja
export const POS_LBL = {
    odVrha: "Od vrha (mm)", odDna: "Od dna (mm)", levo: "Levo (mm)", desno: "Desno (mm)",
    sirina: "Širina (mm)", visina: "Visina (mm)", odstojanje: "Odstojanje (mm/tekst)",
};

// Grupisanje opcija po celinama (za templejt i nalog)
export const KESA_GRUPE = [
    { id: "konstrukcija", l: "Konstrukcija", c: "#b91c1c", keys: ["duplofan", "poz_duplofan", "ukosena_klapna", "perf_otkinuti", "otvor_dno", "falta_dno", "var_dno", "tolerancija_kol"] },
    { id: "stampa", l: "Štampa", c: "#7c3aed", keys: ["stampa"] },
    { id: "zumbe", l: "Zumbe i perforacija", c: "#0ea5e9", keys: ["eurozumba", "utor", "perf_igle", "okrugla_zumba", "poprecna_perf", "poprecni_var"] },
    { id: "pakovanje", l: "Pakovanje", c: "#d97706", keys: ["hrana", "anleger", "pakovati"] },
];

// Prevedi katalog-izbor (kesa.options/optSel/positions/optText) u oblik koji razume CrtezKese/kesaToConfig
export function toCrtezKesa(kesa = {}) {
    const opt = kesa.options || {}, sel = kesa.optSel || {}, pos = kesa.positions || {}, txt = kesa.optText || {};
    const stdOpt = {}, stdPos = {};
    let falta = kesa.falta || "";
    let stampaText = "";
    KESA_OPCIJE.forEach((o) => {
        if (!opt[o.k]) return;
        if (o.crtez) stdOpt[o.crtez] = true;
        if (o.k === "falta_dno") falta = sel[o.k] || falta || 40;
        if (o.k === "eurozumba") {
            const m = String(sel[o.k] || "").match(/\((\d+)/);
            stdPos.eurozumba = { ...(pos[o.k] || {}), sirina: m ? m[1] : (pos[o.k] || {}).sirina || "" };
        }
        if (o.k === "stampa") {
            stdPos.stampa = { ...(pos[o.k] || {}) };
            stampaText = (txt[o.k] || {}).motiv || "";
        }
        if (o.pos && o.crtez && o.k !== "eurozumba" && o.k !== "stampa") {
            stdPos[o.crtez] = { ...(stdPos[o.crtez] || {}), ...(pos[o.k] || {}) };
        }
    });
    return {
        tipKese: kesa.tipKese, sirina: kesa.sirina, duzina: kesa.duzina,
        klapna: kesa.klapna, falta, options: stdOpt, positions: stdPos, stampaText,
    };
}

// Sažmi izbor + poziciju u čitljiv tekst za nalog, npr. "Eurozumba VELIKA(35x12x5) · 9 mm od dna"
export function opcijaNaloga(op, sel, pos) {
    const parts = [];
    if (op.tip === "danet") parts.push(op.l);
    else if (op.tip === "broj") parts.push(op.l + (sel ? " " + sel + (op.jed || "") : ""));
    else parts.push(op.l + (sel ? " " + sel : ""));
    if (pos) {
        if (pos.odstojanje) parts.push(pos.odstojanje);
        if (pos.odVrha) parts.push(pos.odVrha + " mm od vrha");
        if (pos.levo) parts.push(pos.levo + " mm levo");
        if (pos.sirina && pos.visina) parts.push(pos.sirina + "×" + pos.visina + " mm");
    }
    return parts.join(" · ");
}