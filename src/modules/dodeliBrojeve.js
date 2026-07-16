// =====================================================================
//  KORAK 3 — POVEZIVANJE / dodela brojeva nalozima za formatiranje
//  Čista funkcija: bez baze. Sledeći slobodan broj (preventivno) i skup
//  postojećih brojeva injektuju se spolja (iz operativni_nalozi).
//
//  Pravila (spec):
//   • iz naloga:  MP-2026-0018-FORMATIRANJE-1, -2  (nasledi ponbr + redni br. matične)
//   • preventivno: MP-2026-0021-FORMATIRANJE       (svoj broj)
//   • redni sufiks OBAVEZAN kad iz jednog naloga ide VIŠE matičnih (sudar brojeva)
//   • nikad ne izda broj koji već postoji (postojeciBrojevi)
// =====================================================================

function pad(n, sirina = 4) { return String(n).padStart(sirina, "0"); }

/**
 * @param {Array} nalozi   iz motora (predloziFormatiranje) — jedan po matičnoj
 * @param {Object} opcije
 *   izvor            {ponbr} ako formatiranje kreće IZ naloga; null = preventivno
 *   godina           default tekuća
 *   prefiks          default "MP"
 *   oznaka           default "FORMATIRANJE"
 *   preventivniRedni broj (sledeći slobodan) — OBAVEZAN kad je izvor null
 *   postojeciBrojevi [] već zauzeti brojevi (za izbegavanje sudara)
 *   uvekSufiks       true => uvek -N i kad je samo jedna matična
 * @returns {Object} { nalozi:[...+broj], greske:[] }
 */
function dodeliBrojeveNaloga(nalozi = [], opcije = {}) {
    const {
        izvor = null,
        godina = new Date().getFullYear(),
        prefiks = "MP",
        oznaka = "FORMATIRANJE",
        preventivniRedni = null,
        postojeciBrojevi = [],
        uvekSufiks = false,
    } = opcije;

    const greske = [];
    const used = new Set((postojeciBrojevi || []).map((x) => String(x).trim()));

    // --- odredi osnovu (core) bez rednog sufiksa ---
    let core = null;
    if (izvor && String(izvor.ponbr || "").trim()) {
        core = `${String(izvor.ponbr).trim()}-${oznaka}`;
    } else if (izvor) {
        greske.push("Izvor je zadat ali nema ponbr.");
    } else {
        // preventivno — treba sledeći slobodan broj (iz baze)
        const seq = Number(preventivniRedni);
        if (!Number.isFinite(seq) || seq <= 0) {
            greske.push("Preventivno kreiranje zahteva `preventivniRedni` (sledeći slobodan broj iz operativni_nalozi).");
        } else {
            core = `${prefiks}-${godina}-${pad(seq)}-${oznaka}`;
        }
    }

    if (greske.length) return { nalozi: nalozi.map((n) => ({ ...n })), greske };

    const N = nalozi.length;
    const trebaSufiks = N > 1 || uvekSufiks;

    // Pronađi ofset tako da ceo blok -[off+1 .. off+N] bude slobodan (izbegni sudar sa postojećim).
    const blokSlobodan = (off) => nalozi.every((_, i) => !used.has(`${core}-${off + i + 1}`));

    let rezultat;
    if (!trebaSufiks) {
        // jedna matična, sufiks nije obavezan
        if (!used.has(core)) {
            rezultat = [{ nalog: nalozi[0], broj: core, redni: 1 }];
        } else {
            // sudar sa "golim" brojem → prebaci na sufiks, prvi slobodan
            let off = 0;
            while (used.has(`${core}-${off + 1}`)) off++;
            rezultat = [{ nalog: nalozi[0], broj: `${core}-${off + 1}`, redni: off + 1 }];
        }
    } else {
        let off = 0;
        while (!blokSlobodan(off)) off++;
        rezultat = nalozi.map((n, i) => ({ nalog: n, broj: `${core}-${off + i + 1}`, redni: off + i + 1 }));
    }

    // upiši i rezerviši
    const izlaz = rezultat.map(({ nalog, broj, redni }) => {
        used.add(broj);
        return {
            ...nalog,
            broj,
            redni_maticne: redni,
            tip: "formatiranje",
            izvor_ponbr: izvor ? String(izvor.ponbr).trim() : null,
            preventivno: !izvor,
        };
    });

    return { nalozi: izlaz, greske: [] };
}

export { dodeliBrojeveNaloga };
