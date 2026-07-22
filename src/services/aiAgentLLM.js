// ─────────────────────────────────────────────────────────────────────────────
//  MAROPACK — AI AGENT (pravi AI, preko Claude-a)
//
//  Kako radi:
//   1) Korisnik napiše šta hoće.
//   2) Agent bira ALATE (agentAlati.js) da sazna stanje — to su ČITANJA i
//      izvršavaju se odmah.
//   3) Kad zatreba nešto da PROMENI (nalog, rezervacija, formatiranje, brisanje),
//      ne radi to odmah — stavi u PLAN i vrati ga korisniku na potvrdu.
//   4) Tek posle "Potvrdi" se upisi izvršavaju.
//
//  API ključ NIJE ovde — poziv ide kroz Supabase Edge Function "ai-agent".
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "../supabase.js";
import { alatiZaClaude, izvrsiAlat, jeUpis, opisPlana } from "./agentAlati.js";

// Ime Supabase Edge Function-a. Mora se poklapati sa imenom u Supabase → Edge Functions.
// (Supabase ume da sam dodeli ime pri kreiranju — ovde upiši tačno to ime.)
const FUNKCIJA = "smart-service";

const MAX_KRUGOVA = 8;

const SISTEM = `Ti si AI agent za MAROPACK — fabriku fleksibilne ambalaže (folije, kese, špulne).
Pričaš srpski, kratko i poslovno, kao kolega koji zna proizvodnju.

KAKO RADIŠ:
- Koristi alate da SAZNAŠ stvarno stanje. Nikad ne izmišljaj brojeve, rolne, naloge ni količine.
- Templejt proizvoda je izvor recepture: slojevi (vrsta, pod vrsta, oznaka, debljina) i idealna širina.
- Pre kreiranja naloga skoro uvek prvo pozovi provera_materijala — da vidiš ima li materijala i šta fali.
- Ako je matična rolna šira od idealne, predloži formatiranje. Ako je razlika mala (do 3 mm), reci da se može skratiti pri rezanju.
- Za višeslojne proizvode proveri i spoj (kaširane) rolne.

KALKULACIJE:
- Umeš da izračunaš kalkulaciju za foliju, kesu i špulnu — po ZVANIČNIM Maropack formulama (alati kalkulacija_*).
- Cene NE izmišljaj: prvo pozovi cene_materijala, a ako cene nema u bazi — pitaj korisnika.
- Ako korisnik ne zada škart i maržu, koristi uobičajeno (škart 10%, marža 27% za foliju) i JASNO napiši da si to pretpostavio.
- Uvek prikaži razrađen račun (polje `koraci`) da korisnik vidi kako si došao do cene, pa tek onda konačnu cenu.
- Za foliju su cene na 1000 m, za kesu na 1000 komada, za špulnu po špulni — uvek napiši jedinicu.

VAŽNO O IZMENAMA:
- Alati koji menjaju bazu (kreiranje naloga, rezervacija, formatiranje, brisanje) se NE izvršavaju odmah.
  Oni idu u plan koji korisnik potvrđuje. Zato ih pozovi tek kad si siguran, i objasni zašto.
- Ako nešto nije jasno (koji proizvod, koja količina), PITAJ umesto da pogađaš.

TI SI I STRUČNJAK, NE SAMO IZVRŠILAC:
- Ti si iskusan tehnolog fleksibilne ambalaže. Kad te pitaju struku (koja struktura za kesu sa kafom,
  zašto var pušta, koliko µ za tu težinu punjenja, PET//PE vs BOPP//BOPP, barijera, klizavost,
  zašto se rolna teleskopira, koji tretman za štampu) — odgovori iz znanja, detaljno i sa razlogom.
  NE MORAŠ da zoveš alate za takva pitanja.
- Objašnjavaj kao kolega tehnolog: šta, zašto, i na šta da pazi u proizvodnji.
- Kad pitanje spaja struku i podatke ("treba mi kesa za 1 kg kafe, imam li materijal"),
  prvo objasni koja struktura je prava, pa onda alatima proveri ima li je na stanju.
- Ako nešto ne znaš pouzdano ili zavisi od opreme, reci to otvoreno umesto da nagađaš.

ODGOVOR:
- Prvo kratak zaključak, pa detalji.
- Brojeve piši sa jedinicom (m, kg, mm, µ, g/m²).
- Ako nešto fali, jasno reci šta i koliko.`;

// ── poziv ka Edge Function ───────────────────────────────────────────────────
async function pozoviClaude(messages, opcije = {}) {
    const { data, error } = await supabase.functions.invoke(FUNKCIJA, {
        body: { system: SISTEM, messages, tools: alatiZaClaude(), ...opcije },
    });
    if (error) {
        let detalj = error.message || String(error);
        try { const c = await error.context?.json?.(); if (c?.error) detalj = c.error; } catch (e) { }
        throw new Error(detalj);
    }
    if (data?.error) throw new Error(data.error);
    return data;
}

function tekstIz(odgovor) {
    return (odgovor?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}
function alatiIz(odgovor) {
    return (odgovor?.content || []).filter((b) => b.type === "tool_use");
}

/**
 * Pokreće agenta. Vraća:
 *   { odgovor, plan, koraci, messages }
 *   - odgovor: tekst za korisnika
 *   - plan: [] ako nema izmena, inače lista radnji koje čekaju POTVRDU
 *   - messages: nastavak razgovora (potreban za potvrdiPlan)
 */
export async function pokreniAgenta(pitanje, prethodnePoruke = []) {
    const messages = [...prethodnePoruke, { role: "user", content: pitanje }];
    const koraci = [];
    let plan = [];

    for (let krug = 0; krug < MAX_KRUGOVA; krug++) {
        const odgovor = await pozoviClaude(messages);
        const pozivi = alatiIz(odgovor);
        const tekst = tekstIz(odgovor);

        if (!pozivi.length) {
            return { odgovor: tekst || "Nemam odgovor.", plan: [], koraci, messages: [...messages, { role: "assistant", content: odgovor.content }] };
        }

        messages.push({ role: "assistant", content: odgovor.content });

        const rezultati = [];
        for (const p of pozivi) {
            if (jeUpis(p.name)) {
                // IZMENA — ne izvršavamo, stavljamo u plan
                plan.push({ id: p.id, alat: p.name, ulaz: p.input, opis: opisPlana(p.name, p.input) });
                rezultati.push({
                    type: "tool_result", tool_use_id: p.id,
                    content: "ČEKA POTVRDU KORISNIKA — nije izvršeno. Objasni korisniku šta će se desiti kad potvrdi.",
                });
            } else {
                koraci.push({ alat: p.name, ulaz: p.input });
                const r = await izvrsiAlat(p.name, p.input);
                const cist = { ...r }; delete cist._plan_sirovo;   // sirov plan ne šaljemo modelu
                rezultati.push({ type: "tool_result", tool_use_id: p.id, content: JSON.stringify(cist).slice(0, 12000) });
            }
        }
        messages.push({ role: "user", content: rezultati });

        if (plan.length) {
            // još jedan krug da model objasni plan korisniku
            const zavrsni = await pozoviClaude(messages);
            return {
                odgovor: tekstIz(zavrsni) || "Pripremio sam plan — potvrdi da izvršim.",
                plan, koraci,
                messages: [...messages, { role: "assistant", content: zavrsni.content }],
            };
        }
    }

    return { odgovor: "Previše koraka — probaj da suziš zadatak.", plan: [], koraci, messages };
}

/**
 * Izvršava potvrđene izmene (posle klika Potvrdi).
 */
export async function potvrdiPlan(plan, messages = []) {
    const izvrseno = [];
    for (const stavka of plan) {
        const r = await izvrsiAlat(stavka.alat, stavka.ulaz);
        izvrseno.push({ opis: stavka.opis, ok: r?.ok !== false && !r?.greska, poruka: r?.poruka || r?.greska || "Urađeno." });
    }

    // upiši u AI memoriju (ako tabela postoji)
    try {
        await supabase.from("ai_akcije").insert(izvrseno.map((x) => ({
            tip: "AI_AGENT", naziv: x.opis, payload: { poruka: x.poruka },
            status: x.ok ? "izvrseno" : "greska", korisnik: "agent", created_at: new Date().toISOString(),
        })));
    } catch (e) { }

    let zakljucak = "";
    if (messages.length) {
        try {
            const nastavak = [...messages, {
                role: "user",
                content: "Korisnik je potvrdio plan. Rezultat izvršenja:\n" +
                    izvrseno.map((x) => (x.ok ? "USPEH" : "GREŠKA") + ": " + x.opis + " — " + x.poruka).join("\n") +
                    "\nNapiši kratak zaključak i sledeći korak.",
            }];
            const odg = await pozoviClaude(nastavak, { tools: [] });
            zakljucak = tekstIz(odg);
        } catch (e) { }
    }

    return { izvrseno, zakljucak };
}
