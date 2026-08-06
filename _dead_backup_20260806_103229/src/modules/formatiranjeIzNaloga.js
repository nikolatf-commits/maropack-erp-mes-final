import { dodeliBrojeveNaloga } from "./dodeliBrojeve.js";

/* =====================================================================
   FORMATIRANJE IZ NALOGA — automatski, kad je izabrana matična ŠIRA od idealne.
   Poziva se na kraju potvrdiNalogMaterijal() (ProductTemplateEngineV20).
   Za svaku takvu rolnu pravi VEZANI formatiranje-nalog: broj-FORMATIRANJE-1/-2,
   seče na idealnu širinu, ostatak na stanje, rezerviše za taj nalog.

   Ništa ne ruši nalog za materijal — zove se u try/catch (vidi poziv).
   ===================================================================== */

const NN = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const TOL_MM = 3;          // ispod ove razlike se ne formatira (praktično ista širina)
const MIN_OSTATAK = 50;    // bočni ostatak ispod ovoga = otpad, iznad = nova rola na stanje

export async function kreirajFormatiranjeIzNaloga(supabase, ctx = {}) {
    const { broj, glavni_nalog_id = null, idealnaSir, izborData = [], proizvod = "", kupac = "", tip_proizvoda = "" } = ctx;
    const ideal = NN(idealnaSir);
    if (!ideal || !broj || !supabase || supabase.__notConfigured) return { brojevi: [], nalozi: [] };

    // matične šire od idealne (koje treba iseći na idealnu za ovaj nalog)
    const kandidati = izborData.filter((it) =>
        it && it.rolna_id && !it.rucni && NN(it.alocirano_m) > 0 && NN(it.sirina) > ideal + TOL_MM
    );
    if (!kandidati.length) return { brojevi: [], nalozi: [] };

    // oblik koji dodeliBrojeveNaloga očekuje (jedan po matičnoj)
    const baseNalozi = kandidati.map((it) => ({ maticna_id: it.rolna_id, br_rolne: it.br_rolne, sirina_mm: NN(it.sirina) }));

    // anti-sudar: postojeći formatiranje-brojevi za ovaj nalog
    let postojeci = [];
    try {
        const { data } = await supabase.from("operativni_nalozi").select("broj_naloga").ilike("broj_naloga", broj + "-FORMATIRANJE%").limit(200);
        postojeci = (data || []).map((r) => String(r.broj_naloga || ""));
    } catch (e) { /* nije kritično */ }

    const withNums = dodeliBrojeveNaloga(baseNalozi, {
        izvor: { ponbr: broj }, godina: new Date().getFullYear(), postojeciBrojevi: postojeci,
    });
    if (withNums.greske?.length) return { brojevi: [], nalozi: [], greske: withNums.greske };

    const redovi = withNums.nalozi.map((n, idx) => {
        const it = kandidati[idx];
        const sir = NN(it.sirina);
        const duz = NN(it.alocirano_m);
        const residual = Math.max(0, sir - ideal);
        const trake = [{ sirina_mm: ideal, odrediste: "nalog:" + broj, napomena: proizvod || "" }];
        if (residual > MIN_OSTATAK) trake.push({ sirina_mm: residual, odrediste: "stanje", napomena: "" });

        const plan = {
            br_rolne: it.br_rolne,
            sirina_mm: sir,
            utrosak_m: duz,
            materijal: [it.snap_vrsta, it.snap_pod_vrsta, it.snap_oznaka, (it.snap_debljina ? it.snap_debljina + "µ" : "")].filter(Boolean).join(" · "),
            proizvodjac: it.snap_dobavljac || "",
            izvor_ponbr: broj,
            preventivno: false,
            lot_baza: it.lot || it.br_rolne || "LOT",
            plan_reza: [{ duzina_m: duz, otpad_mm: residual > MIN_OSTATAK ? 0 : residual, trake }],
        };

        return {
            broj_naloga: n.broj,
            glavni_nalog_id,
            tip_naloga: "formatiranje",
            tip_proizvoda: tip_proizvoda || null,
            kupac: kupac || null,
            naziv: proizvod || null,
            proizvod: proizvod || null,
            status: "ceka",
            parametri: { formatiranje: plan, glavni_nalog_id },
        };
    });

    const { error } = await supabase.from("operativni_nalozi").insert(redovi);
    if (error) throw new Error("operativni_nalozi (formatiranje): " + error.message);
    return { brojevi: withNums.nalozi.map((n) => n.broj), nalozi: redovi };
}
