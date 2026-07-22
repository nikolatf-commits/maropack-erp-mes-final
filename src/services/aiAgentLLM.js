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
- Uvek prikaži razrađen račun (polje "koraci") da korisnik vidi kako si došao do cene, pa tek onda konačnu cenu.
- Za foliju su cene na 1000 m, za kesu na 1000 komada, za špulnu po špulni — uvek napiši jedinicu.

OBLICI PAKCING LISTI KOJE MAROPACK DOBIJA (znaj ih napamet):

1) PLASTCHIM-T (Bugarska) — tabela: Roll No | Film Type | Thickness | Width | Diam.Ins | Diam.Outs | Length | Net kg | Gross kg
   - RAZMAK JE HILJADITI SEPARATOR: "1 560" = 1560 mm, "28 400" = 28400 m. Nikad ne čitaj kao dva broja.
   - Debljina je uz tip: "FXC 15" = tip FXC15, debljina 15µ. "FXPU 28" = FXPU28, 28µ.
   - PRESKOČI redove "Pallet: ...", "Net Weight:", "Gross Weight:", "Total ..." — to su zbirovi, ne rolne.
   - U istom PDF-u ima više pakcing listi (po nalogu) i sertifikate sa g/m² (Unit weight). Iskoristi g/m² za proveru:
     kg ≈ širina(m) × dužina(m) × g/m² / 1000. Ako odstupa preko 10%, upozori.
   - Uzimaj NET kg (ne gross). Dobavljač: Plastchim-T.

2) TAGHLEEF (Mađarska, NATIVIA) — tabela: Plt.No | Reel Code | Item | Kg | Length | ID | OD | Joints | Reels
   - DECIMALNI ZAREZ: "904,0" = 904.0 kg.
   - Širina i debljina su u nazivu: "NATIVIA NTSS 30 1650 TO" = debljina 30µ, širina 1650 mm.
   - Broj rolne dobavljača = Reel Code. Dobavljač: Taghleef.

3) SAJ INDUSTRIES / SUMILON (Indija) — tabela: Pallet No | Roll No. | Mic | Core ID | Width | Length | Joint | Total GR weight with Pallet | Tare | Net Wt
   - Tekst u PDF-u je često nečitljiv — čitaj sa SLIKE stranice.
   - Kolona "Mic" je debljina u µ (iako piše mm). Vrsta je u naslovu iznad tabele, npr. "CT PET FILM 50 MIC" = PET 50µ.
   - Zarez je hiljaditi separator: "1,000" = 1000 mm širine, "8,850" = 8850 m.
   - ISPOD SVAKOG PARA ROLNI STOJI ZBIRNI RED PALETE (bez broja rolne) — NE računaj ga kao rolnu.
   - Uzimaj "Net Wt" po rolni, NE "Total GR weight with Pallet" (to je za celu paletu).

4) INTER GRADEX (Čačak) — "LISTA PAKOVANjA": Šifra | Naziv artikla, pa Koleto | Količina Kg | Sertifikat
   - PAŽNJA: OVA LISTA NEMA METRE, samo kg po koletu (rolni).
   - Širina i debljina su u nazivu artikla: "BOPP FILM RBT - 1215X18" = 1215 mm × 18µ;
     "BOPA FILM KUNSHAN 960X15" = 960 mm × 15µ.
   - Metre MORAŠ izračunati: m = kg × 1.000.000 / (širina_mm × g/m²), gde je g/m² = debljina(µ) × gustina.
     Gustine: BOPP/PP 0.91 · PET 1.40 · BOPA/PA 1.15 · LDPE/PE 0.92 · CPP 0.90 · ALU 2.70.
   - OBAVEZNO napiši korisniku da su metri IZRAČUNATI iz kg, a ne pročitani iz dokumenta.
   - Broj koleta = LOT / broj rolne dobavljača. Dobavljač: Inter Gradex.

OPŠTA PRAVILA ZA SVE LISTE:
- Jedan red = jedna rolna. Zbirne redove (palete, ukupno, total) uvek preskoči.
- Broj rolne iz dokumenta ide u LOT; naš ROLNA-... broj dodeljuje sistem.
- Ako je fakura u istom PDF-u, iz nje možeš uzeti CENU €/kg po tipu materijala.
- Na kraju uporedi svoj zbir kg sa "Total Net Weight" iz dokumenta. Ako se ne slaže, javi razliku.

PAKCING LISTE (ulaz rolni u magacin):
- Kad dobiješ pakcing listu / otpremnicu (PDF, slika ili tabela), pročitaj SVAKI red i izvuci:
  vrsta, pod vrsta, oznaka, debljina (µ ili g/m² za papir), širina (mm), metraža (m), kg, LOT, dobavljač.
- Zatim OBAVEZNO pozovi pripremi_rolne_za_unos i pokaži korisniku spisak + upozorenja o nejasnim redovima.
- Tek kad korisnik potvrdi spisak, pozovi ubaci_rolne_na_stanje.
- Ako ti neki podatak nedostaje ili je nečitak, NE izmišljaj — izlistaj te redove i pitaj.
- Brojeve rolni (ROLNA-...) sistem dodeljuje sam — ne izmišljaj ih.

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
export async function pokreniAgenta(pitanje, prethodnePoruke = [], prilozi = []) {
    // Prilozi: PDF i slike idu Claude-u kao dokument/slika, tekst (CSV/TXT) kao tekst.
    let sadrzaj = pitanje;
    if (Array.isArray(prilozi) && prilozi.length) {
        const blokovi = [];
        prilozi.forEach((f) => {
            if (f.kind === "pdf") {
                blokovi.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } });
            } else if (f.kind === "image") {
                blokovi.push({ type: "image", source: { type: "base64", media_type: f.mime || "image/jpeg", data: f.base64 } });
            } else if (f.kind === "text") {
                blokovi.push({ type: "text", text: "Sadržaj fajla „" + (f.naziv || "fajl") + "\":\n" + String(f.tekst || "").slice(0, 60000) });
            }
        });
        blokovi.push({ type: "text", text: pitanje });
        sadrzaj = blokovi;
    }

    const messages = [...prethodnePoruke, { role: "user", content: sadrzaj }];
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