// MAROPACK — Pantone baza (sRGB aproksimacije za prikaz na nalozima).
// NAPOMENA: Pantone tačne vrednosti su zaštićene; ovo su približne sRGB vrednosti
// dovoljne za vizuelni prikaz boje na nalogu (ne za zvaničnu probu boje).
// Baza je proširiva: dodaj svoje boje preko addPantone({...}) ili u PANTONE mapu.

export const PANTONE = {
    // --- Osnovne imenovane boje ---
    "YELLOW C": "#FEDD00", "YELLOW 012 C": "#FFD700", "ORANGE 021 C": "#FE5000",
    "WARM RED C": "#F9423A", "RED 032 C": "#EF3340", "RUBINE RED C": "#CE0058",
    "RHODAMINE RED C": "#E10098", "PURPLE C": "#BB29BB", "VIOLET C": "#440099",
    "BLUE 072 C": "#10069F", "REFLEX BLUE C": "#001489", "PROCESS BLUE C": "#0085CA",
    "GREEN C": "#00AB84", "BLACK C": "#2D2926",
    "PROCESS CYAN C": "#009FDA", "PROCESS MAGENTA C": "#EC008C",
    "PROCESS YELLOW C": "#FFEC00", "PROCESS BLACK C": "#1E1E1E",
    // sive
    "COOL GRAY 1 C": "#D9D9D6", "COOL GRAY 2 C": "#D0D0CE", "COOL GRAY 3 C": "#C8C9C7",
    "COOL GRAY 4 C": "#BBBCBC", "COOL GRAY 5 C": "#B1B3B3", "COOL GRAY 6 C": "#A7A8AA",
    "COOL GRAY 7 C": "#97999B", "COOL GRAY 8 C": "#888B8D", "COOL GRAY 9 C": "#75787B",
    "COOL GRAY 10 C": "#63666A", "COOL GRAY 11 C": "#53565A",
    "WARM GRAY 1 C": "#D7D2CB", "WARM GRAY 5 C": "#ACA39A", "WARM GRAY 11 C": "#6E6259",
    // metalik
    "877 C": "#8A8D8F", "871 C": "#84754E", "872 C": "#85714D", "873 C": "#866D4B",
    "874 C": "#8B6F4E", "875 C": "#80623C", "876 C": "#73593C",
    // --- Žute / narandžaste ---
    "100 C": "#F6EB61", "101 C": "#F7EA48", "102 C": "#FCE300", "103 C": "#C5A900",
    "106 C": "#F9E547", "107 C": "#FBE122", "108 C": "#FEDB00", "109 C": "#FFD100",
    "110 C": "#DAAA00", "116 C": "#FFCD00", "117 C": "#C99700", "123 C": "#FFC72C",
    "124 C": "#EAAA00", "130 C": "#F2A900", "137 C": "#FFA300", "138 C": "#DE7C00",
    "144 C": "#ED8B00", "151 C": "#FF8200", "152 C": "#E57200", "158 C": "#E87722",
    "165 C": "#FF6900", "166 C": "#E35205", "172 C": "#FA4616", "179 C": "#E03C31",
    // --- Crvene / roze / ljubičaste ---
    "185 C": "#E4002B", "186 C": "#C8102E", "187 C": "#A6192E", "199 C": "#D50032",
    "200 C": "#BA0C2F", "201 C": "#9D2235", "202 C": "#862633", "207 C": "#A6093D",
    "208 C": "#7C2855", "213 C": "#E31C79", "219 C": "#DA1884", "226 C": "#D0006F",
    "232 C": "#E93CAC", "234 C": "#A50050", "241 C": "#B6238E", "248 C": "#AC4FC6",
    "254 C": "#9437C6", "265 C": "#7C53C3", "266 C": "#5F259F", "267 C": "#5F259F",
    "2587 C": "#8246AF", "2685 C": "#56008A",
    // --- Plave ---
    "280 C": "#002F6C", "281 C": "#00205B", "286 C": "#0033A0", "287 C": "#003DA5",
    "288 C": "#002D72", "289 C": "#0C2340", "293 C": "#003DA5", "294 C": "#002D72",
    "300 C": "#005EB8", "301 C": "#004B87", "302 C": "#003B49", "306 C": "#00B5E2",
    "307 C": "#0067A0", "312 C": "#00A1DE", "313 C": "#0098DB", "315 C": "#007FA3",
    "541 C": "#003087", "542 C": "#7BAFD4", "2925 C": "#009CDE", "2935 C": "#0057B8",
    "2945 C": "#00558C", "2955 C": "#003865", "Reflex Blue C": "#001489",
    // --- Zelene / tirkizne ---
    "316 C": "#0D5257", "320 C": "#009CA6", "321 C": "#008C95", "326 C": "#00B2A9",
    "327 C": "#008675", "330 C": "#00594F", "334 C": "#009639", "341 C": "#00754A",
    "342 C": "#006847", "348 C": "#00843D", "349 C": "#046A38", "350 C": "#2C5234",
    "354 C": "#00B140", "355 C": "#009639", "356 C": "#007A33", "361 C": "#43B02A",
    "362 C": "#509E2F", "368 C": "#69BE28", "369 C": "#64A70B", "376 C": "#84BD00",
    "382 C": "#C4D600", "383 C": "#BFB400", "384 C": "#A2AD00", "390 C": "#B5BD00", "396 C": "#E1E000",
    // --- Smeđe / bež / tamne ---
    "400 C": "#C4BFB6", "401 C": "#AFA9A0", "402 C": "#A09C94", "404 C": "#776E64",
    "405 C": "#5C544A", "418 C": "#51534A", "419 C": "#25282A", "424 C": "#707372",
    "425 C": "#54585A", "426 C": "#25282A", "430 C": "#7E8083", "431 C": "#5B6770",
    "432 C": "#333F48", "433 C": "#1D252D", "445 C": "#3F4444", "447 C": "#383B26",
    "476 C": "#4B3D2A", "477 C": "#623B2A", "478 C": "#6E3219", "483 C": "#653024",
    "485 C": "#DA291C", "486 C": "#E8927C", "1235 C": "#FFB81C", "1375 C": "#FF9015",
    "1505 C": "#FF6A13", "1525 C": "#9A3B26", "1535 C": "#73381D", "1797 C": "#C8102E",
    "1805 C": "#AF272F", "1815 C": "#7C2529", "Black 6 C": "#101820",
    // Često u ambalaži
    "7406 C": "#F1C400", "7407 C": "#CBA052", "7409 C": "#F0B323", "7427 C": "#9B2242",
    "7461 C": "#007DBA", "7462 C": "#00558C", "7463 C": "#002B49", "7470 C": "#005A6F",
    "7471 C": "#7EDDD3", "7540 C": "#4B4F54", "7547 C": "#131E29", "7548 C": "#FFC600",
    "7621 C": "#9E1B32", "7686 C": "#1B3F8B", "7710 C": "#0093B2", "7728 C": "#00843D",
    "7739 C": "#3E8914", "7740 C": "#3C8A2E", "Trans White": "#FFFFFF"
};

// Normalizuj korisnički unos: "pantone 348c", "PMS 348 C", "348" -> "348 C"
export function normalizePantone(input) {
    if (!input) return "";
    let s = String(input).trim().toUpperCase();
    s = s.replace(/PANTONE|PMS|®|\u00AE/g, "").trim();
    s = s.replace(/\s+/g, " ");
    // ako se završava brojem bez sufiksa, podrazumevaj " C"
    if (/^[0-9]{2,4}$/.test(s)) s = s + " C";
    // "348C" -> "348 C"
    s = s.replace(/^([0-9]{2,4})\s*([CU]P?)$/, "$1 $2");
    // imenovane: "REFLEX BLUE" -> "REFLEX BLUE C"
    if (!/\b[CU]P?$/.test(s) && PANTONE[s + " C"]) s = s + " C";
    return s;
}

// Vrati HEX ili null
export function pantoneHex(input, custom) {
    const key = normalizePantone(input);
    if (custom && custom[key]) return custom[key];
    if (PANTONE[key]) return PANTONE[key];
    // probaj i C/U varijantu
    const base = key.replace(/\s*[CU]P?$/, "");
    return PANTONE[base + " C"] || PANTONE[base + " U"] || null;
}

// {code, hex, found} — za prikaz swatch-a u nalogu
export function pantoneSwatch(input, fallbackHex, custom) {
    const code = normalizePantone(input) || String(input || "").trim();
    const hex = pantoneHex(input, custom) || fallbackHex || null;
    return { code, hex: hex, found: !!pantoneHex(input, custom) };
}

// Dodaj/proširi svojim bojama (npr. iz tvoje liste): addPantone({"7708 C":"#0086A8"})
export function addPantone(map) {
    if (!map) return;
    Object.keys(map).forEach((k) => { PANTONE[normalizePantone(k)] = map[k]; });
}

export default PANTONE;