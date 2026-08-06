import { pripremiIzvrsenje } from "./formatiranjeExec.js";

/* =====================================================================
   IZVRŠENJE FORMATIRANJA — samostalna funkcija (rez kroz bazu).
   Ne dira FormatiranjeRolniPRO — pozoveš je kad je operacija ZAVRŠENA.

   Poziv (npr. iz RadnikOperacija na ZAVRŠENO, ili gde god potvrđuješ rez):

     import { izvrsiFormatiranje } from "./izvrsiFormatiranje.js";
     import { supabase } from "../supabase.js";

     const plan = JSON.parse(nalog.parametri).formatiranje;     // upisano iz maske
     // matična se učita po plan.br_rolne (ili je već skenirana):
     const { data } = await supabase.from("magacin").select("*").eq("br_rolne", plan.br_rolne).limit(1);
     const rez = await izvrsiFormatiranje(supabase, data[0], plan, {
       nalog: { broj: nalog.broj_naloga, id: nalog.id },
       user_id: radnik?.id || null,
     });
     if (rez.ok) { ...koristi rez.nastale (role za štampu nalepnica)... }
     else { ...rez.greske... }

   Podrazumevano NE piše vezne kolone (rezervisano_za_nalog / formatiranje_nalog /
   operativni_nalog_id) da bi radilo bez izmene šeme — sve info je u `napomena`,
   a `rezervisano` se svejedno postavlja. Ako te kolone POSTOJE i hoćeš ih
   strukturirano, prosledi ctx.veze = true.
   ===================================================================== */

function makeBrRolne() {
    return "ROLNA-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// sledeći slobodan LOT sufiks (brojač se NASTAVLJA, ne kreće od nule)
async function sledeciLotBaza(supabase, lotBaza) {
    let start = 0;
    try {
        const { data } = await supabase.from("magacin").select("lot").ilike("lot", lotBaza + "-%").limit(500);
        (data || []).forEach((r) => {
            const m = String(r.lot || "").match(new RegExp("^" + lotBaza.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-(\\d+)$"));
            if (m) start = Math.max(start, Number(m[1]));
        });
    } catch (e) { /* ako ne uspe, kreni od 0 */ }
    return start;
}

export async function izvrsiFormatiranje(supabase, matica, plan, ctx = {}) {
    if (!matica) return { ok: false, greske: ["Nema matične rolne."] };
    if (!plan?.plan_reza?.length) return { ok: false, greske: ["Nema plana reza."] };
    if (supabase?.__notConfigured) return { ok: false, greske: ["Supabase nije povezan."] };

    const lotBaza = String(matica.lot || matica.br_rolne || "LOT").trim();
    const lotStart = await sledeciLotBaza(supabase, lotBaza);
    const nowIso = new Date().toISOString();

    const built = pripremiIzvrsenje(matica, plan, {
        lotStart, nowIso, danas: nowIso.slice(0, 10),
        makeBrRolne, nalog: ctx.nalog || null, user_id: ctx.user_id || null,
    });
    if (built.greske.length) return { ok: false, greske: built.greske };

    // interna polja + (podrazumevano) vezne kolone koje možda ne postoje u šemi
    const drop = ctx.veze ? [] : ["rezervisano_za_nalog", "formatiranje_nalog", "operativni_nalog_id"];
    const noveRole = built.noveRole.map(({ _naNalog, _destPon, ...r }) => {
        const o = { ...r };
        drop.forEach((k) => delete o[k]);
        return o;
    });

    // 1) upiši nove role
    const { data: inserted, error: insErr } = await supabase.from("magacin").insert(noveRole).select("*");
    if (insErr) throw new Error("Upis novih rolni nije uspeo: " + insErr.message);

    // 2) skini matičnu (metraza_ost, status, kg)
    const { error: updErr } = await supabase.from("magacin").update(built.maticaUpdate).eq("id", matica.id);
    if (updErr) throw new Error("Ažuriranje matične nije uspelo: " + updErr.message);

    // 3) trag u istoriju (matična + po red za svaku novu rolu) — ne blokira
    try {
        await supabase.from("magacin_istorija").insert([built.istorijaMatice, ...built.istorijaZaNoveRole(inserted || [])]);
    } catch (e) { /* istorija nije kritična */ }

    const nastale = (inserted || noveRole).map((r) => ({ ...r, parent_br: matica.br_rolne }));
    return { ok: true, nastale, novoOstatak: built.novoOstatak };
}