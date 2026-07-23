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

const MAX_KRUGOVA = 12;

// Šta se ispisuje korisniku dok agent radi — da zna zašto čeka.
const OPIS_ALATA = {
    stanje_magacina: "Gledam stanje magacina…",
    nadji_rolne: "Tražim rolne…",
    nadji_spoj_rolne: "Tražim spoj rolne…",
    sifarnik_materijala: "Proveravam nazive materijala…",
    lista_templejta: "Tražim templejt…",
    detalji_templejta: "Čitam templejt…",
    provera_materijala: "Proveravam materijal po slojevima…",
    lista_naloga: "Gledam naloge…",
    detalji_naloga: "Čitam nalog…",
    predlozi_formatiranje: "Računam plan reza…",
    analiza_otpada: "Računam potrošnju i otpad…",
    cene_materijala: "Gledam cene…",
    kalkulacija_folije: "Računam kalkulaciju folije…",
    kalkulacija_kese: "Računam kalkulaciju kese…",
    kalkulacija_spulne: "Računam kalkulaciju špulne…",
    procitaj_kalkulacije: "Čitam sačuvane kalkulacije…",
    procitaj_ponude: "Čitam ponude…",
    pregled_tabele: "Čitam podatke…",
    pretrazi_razgovore: "Tražim po ranijim razgovorima…",
    procitaj_pravila: "Gledam pravila…",
    pripremi_rolne_za_unos: "Sređujem spisak rolni…",
    napravi_dokument: "Pripremam dokument…",
};

const SISTEM = `Ti si AI agent za MAROPACK — fabriku fleksibilne ambalaže (folije, kese, špulne).
Pričaš srpski, kratko i poslovno, kao kolega koji zna proizvodnju.

KAKO RADIŠ:
- Koristi alate da SAZNAŠ stvarno stanje. Nikad ne izmišljaj brojeve, rolne, naloge ni količine.
- Templejt proizvoda je izvor recepture: slojevi (vrsta, pod vrsta, oznaka, debljina) i idealna širina.
- Pre kreiranja naloga skoro uvek prvo pozovi provera_materijala — da vidiš ima li materijala i šta fali.
- Ako je matična rolna šira od idealne, predloži formatiranje. Ako je razlika mala (do 3 mm), reci da se može skratiti pri rezanju.
- Za višeslojne proizvode proveri i spoj (kaširane) rolne.

AI MEMORIJA:
- Svi raniji razgovori se pamte. Ako se korisnik poziva na nešto od ranije ("ono što smo pričali",
  "kao prošli put", "šta sam ti rekao za tog kupca"), pozovi alat pretrazi_razgovore.
- Ne izmišljaj šta je ranije rečeno — proveri u memoriji ili priznaj da ne nalaziš.

PAMĆENJE (važno):
- Svi razgovori se pamte. Kad se korisnik pozove na ranije („ono što smo pričali“, „kao prošli put“,
  „šta sam ti rekao za maržu“, „koju smo strukturu dogovorili za X“) — pozovi alat pretrazi_razgovore.
- Isto uradi kad ti treba podatak koji je korisnik već davao (cene, marže, njegova pravila, ranije odluke),
  umesto da ga ponovo pitaš isto.
- Ako u memoriji nema ništa o toj temi, reci to otvoreno i pitaj.

PRAVLJENJE NALOGA:
- Korisnik proizvod zove slobodno („maxi spanać", „spanac 600"). Pozovi lista_templejta —
  pretraga ne mari za kvačice ni redosled reči. Ako se poklopi VIŠE templejta, pitaj koji,
  ne biraj sam. Ako se ne poklopi nijedan, reci to i ponudi da napraviš nov templejt.
- KOLIČINA: nalozi idu u METRIMA. Ako korisnik kaže kg (npr. „500 kg"), prosledi
  kolicina=500 i jedinica="kg" — alat sam pretvori u metre po širini i gramaži iz templejta,
  i u odgovoru OBAVEZNO pokaži taj račun (npr. „500 kg → 11.945 m pri 460 mm i 91 g/m²").
- Ako templejtu fali idealna širina ili debljina, pretvaranje ne može — traži metre od korisnika.
- JEDINICE po vrsti proizvoda:
  • FOLIJA — metri. Ako korisnik da kg, prosledi jedinica="kg" (alat pretvori i pokaže račun).
  • KESA — komadi. Prosledi jedinica="kom".
  • ŠPULNA — ima svoju jedinicu unosa: m2 (podrazumevano), kom, kg ili m. Prosledi tačno ono
    što je korisnik rekao; NE pretvaraj sam — špulna nalog to sam preračuna u m², špulne i palete.
    Ako korisnik kaže samo broj bez jedinice za špulnu, pitaj da li misli na špulne (kom) ili m².
- PONUDA SE NE PRAVI SAMA. Nalozi idu direktno u radni_nalozi + operativni_nalozi,
  isto kao dugme „Kreiraj naloge" u Template Engine-u (brojevi MP-GODINA-XXXX, operacije
  materijal → štampa → lakiranje → kaширanje → rezanje, prema samom templejtu).
- Ponudu pravi SAMO ako korisnik to izričito traži („napravi i ponudu", „treba mi ponuda za kupca").
  Tada prosledi sa_ponudom=true, ili koristi zaseban alat napravi_ponudu.
- Alat sam upisuje templejt u operacije. Ako to ne uspe, odštampan nalog bi bio prazan („0 slojeva").
- POSLE kreiranja pozovi detalji_naloga i korisniku javi: broj naloga, koje su operacije nastale
  i da li sve nose templejt. Ako neka ne nosi, jasno upozori.
- Kreiranje naloga NE rezerviše rolne samo od sebe. Ako materijal treba da se spremi,
  posle naloga predloži rezervisi_rolne (opet uz potvrdu).

DOKUMENTI (ponuda, specifikacija, izveštaj):
- Kad korisnik traži ponudu, specifikaciju, spisak ili izveštaj „u Excelu / PDF-u / da odštampam",
  pozovi napravi_dokument sa zaglavljima i redovima. Korisnik onda dobija dugmad „Preuzmi Excel" i „Štampaj / PDF".
- Dokument NE upisuje ništa u bazu. Ako ponuda treba i da POSTOJI u sistemu (da se iz nje prave nalozi),
  to je napravi_ponudu — poseban alat koji traži potvrdu. Predloži oba kad ima smisla.
- U ponudu uvek stavi: proizvod, količinu, jedinicu, jediničnu cenu, ukupnu vrednost, i rok/uslove ako ih znaš.

UČENJE (naučena pravila):
- Na početku razgovora dobijaš NAUČENA PRAVILA — to su trajni dogovori sa korisnikom. Poštuj ih bez pitanja.
- Kad korisnik kaže nešto što očigledno treba da važi UBUDUĆE (marža za kupca, gustina materijala,
  koji dobavljač za koji materijal, pravilo proizvodnje, konvencija imenovanja) — predloži da to zapamtiš
  alatom zapamti_pravilo. Kratko i jasno formuliši pravilo, tako da se razume i bez konteksta.
- Ne pamti jednokratne stvari (jedna količina, jedan nalog) — samo ono što se ponavlja.
- Ako pravilo više ne važi, ponudi obrisi_pravilo.

ŠTA SVE VIDIŠ (sve sačuvano u sistemu):
- Magacin i rolne, spoj rolne, šifarnik materijala, istorija potrošnje/otpada
- Templejti proizvoda (lista_templejta, detalji_templejta)
- Nalozi — glavni i operacije, do detalja (lista_naloga, detalji_naloga)
- Sačuvane kalkulacije sa maržama (procitaj_kalkulacije)
- Ponude i da li su iz njih nastali nalozi (procitaj_ponude)
- Ostalo: mašine, radnici, zastoji, kontrola kvaliteta, gotovi proizvodi, faze proizvodnje,
  plan proizvodnje, aktivnosti — preko pregled_tabele
- Cene materijala, naučena pravila, raniji razgovori
Ako te pitaju za nešto što ne možeš da pročitaš nijednim alatom, reci to otvoreno — NE nagađaj.

KALKULACIJE:
- Umeš da izračunaš kalkulaciju za foliju, kesu i špulnu — po ZVANIČNIM Maropack formulama (alati kalkulacija_*).
- Cene NE izmišljaj: prvo pozovi cene_materijala, a ako cene nema u bazi — pitaj korisnika.
- Ako korisnik ne zada škart i maržu, koristi uobičajeno (škart 10%, marža 27% za foliju) i JASNO napiši da si to pretpostavio.
- Uvek prikaži razrađen račun (polje "koraci") da korisnik vidi kako si došao do cene, pa tek onda konačnu cenu.
- Za foliju su cene na 1000 m, za kesu na 1000 komada, za špulnu po špulni — uvek napiši jedinicu.
- Kad korisnik pita ŠTA JE BILO ranije („koja je bila marža za X", „šta smo računali za tog kupca"),
  pozovi procitaj_kalkulacije. Tamo je i polje ulaz_za_ponavljanje — prosledi ga alatu kalkulacija_*
  sa novom maržom da PONOVIŠ istu kalkulaciju i uporediš cene. Uvek pokaži staru i novu jedno pored drugog
  i razliku u €.
- UZ SVAKU KALKULACIJU prikaži i POTREBAN MATERIJAL za ceo nalog (polje "potrebno_materijala"):
  po sloju — širina, dužina u metrima i kg, i to i SA ŠKARTOM (to je ono što se stvarno troši i poručuje).
  Bez toga korisnik ne zna koliko da naruči ni koliko da rezerviše.
- Ako korisnik pita "imam li to na stanju", odmah posle kalkulacije pozovi provera_materijala ili nadji_rolne
  i uporedi potrebne metre sa slobodnim na stanju.

RAZVRSTAVANJE MATERIJALA (vrsta / pod vrsta / oznaka / debljina) — NAJVAŽNIJE KOD UNOSA:
- Magacin traži ČETIRI odvojena podatka, a dobavljač šalje jedan kod. Ti ih moraš razdvojiti.
- PRE nego pripremiš rolne za unos, OBAVEZNO pozovi sifarnik_materijala i vidi kako Maropack
  VEĆ imenuje taj materijal. Nove rolne moraju dobiti ISTO ime kao postojeće na stanju.
  Ako isti materijal uđe pod novim imenom, templejti ga više neće prepoznati — to je ozbiljna greška.
- Kako se čita kod dobavljača:
  • Plastchim "FXC 15"  → vrsta BOPP · oznaka FXC15 · debljina 15µ
    (slovo iza FX kaže tip: C=coex/transparent, A=acryl, PU, CB, PF, CM, CLS, CAF — oznaku
     upiši celu, npr. FXPU28, a pod vrstu uzmi onako kako već stoji u magacinu)
  • Taghleef "NATIVIA NTSS 30 1650 TO" → vrsta BOPP (NATIVIA je PLA-bazna, proveri u šifarniku!) ·
    oznaka NTSS · debljina 30µ · širina 1650 mm
  • SAJ/Sumilon "CT PET FILM 50 MIC" → vrsta PET · oznaka CT · debljina 50µ
  • Inter Gradex "BOPP FILM RBT - 1215X18" → vrsta BOPP · oznaka RBT · debljina 18µ · širina 1215 mm
    "BOPA FILM KUNSHAN 960X15" → vrsta BOPA · oznaka KUNSHAN · debljina 15µ · širina 960 mm
- POD VRSTA se retko vidi na listi (npr. Transparent, Metalizovan, Beli). Ako je ne vidiš:
  uzmi je iz šifarnika ako postoji ista vrsta+oznaka; ako ne postoji — OSTAVI PRAZNO i pitaj korisnika.
  NIKAD je ne izmišljaj.
- Ako materijal iz liste ne postoji u šifarniku ni pod jednim imenom, jasno reci korisniku:
  "ovo je nov materijal, kako da ga nazovem?" — i ponudi da to zapamtiš kao pravilo (zapamti_pravilo),
  da sledeći put znaš.

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
- Zatim pozovi sifarnik_materijala i uklopi imena u postojeća.
- Zatim OBAVEZNO pozovi pripremi_rolne_za_unos i pokaži korisniku spisak + upozorenja o nejasnim redovima.
- Tek kad korisnik potvrdi spisak, pozovi ubaci_rolne_na_stanje.
- Ako ti neki podatak nedostaje ili je nečitak, NE izmišljaj — izlistaj te redove i pitaj.
- Brojeve rolni (ROLNA-...) sistem dodeljuje sam — ne izmišljaj ih.

VAŽNO O IZMENAMA:
- NE PITAJ U TEKSTU „da li da upišem?" — sam poziv alata JESTE pitanje: korisniku se pojavi
  žuta kartica sa dugmadima „Potvrdi i izvrši" / „Otkaži". Ako si siguran šta treba, POZOVI ALAT.
  Ako pitaš u tekstu, korisnik mora da kuca „da" pa da čeka još jedan krug — to je izgubljeno vreme.
- Pitaj u tekstu SAMO kad ti stvarno fali podatak (koji kupac, koja količina, koji od dva templejta).
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

// ── AI memorija: svaki razgovor se pamti u tabeli ai_interakcije ─────────────
export async function zapamti(pitanje, odgovor, dodatno = {}) {
    try {
        await supabase.from("ai_interakcije").insert({
            pitanje: String(pitanje || "").slice(0, 12000),
            odgovor: String(odgovor || "").slice(0, 24000),
            summary: dodatno,
            created_at: new Date().toISOString(),
        });
    } catch (e) { /* memorija nije kriticna */ }
}

export async function ucitajMemoriju(koliko = 8) {
    try {
        const { data, error } = await supabase.from("ai_interakcije")
            .select("pitanje, odgovor, created_at").order("created_at", { ascending: false }).limit(koliko);
        if (error) return [];
        return (data || []).reverse();
    } catch (e) { return []; }
}

// ── Naučena pravila: šalju se na POČETKU svakog razgovora ────────────────────
async function ucitajPravila() {
    try {
        const { data, error } = await supabase.from("ai_pravila")
            .select("oblast, pravilo").eq("aktivno", true).order("oblast").limit(1000);
        if (error || !data || !data.length) return "";
        const po = {};
        data.forEach((r) => {
            const k = r.oblast || "ostalo";
            (po[k] = po[k] || []).push(r.pravilo);
        });
        return "\n\nNAUČENA PRAVILA MAROPACK-a (uvek ih poštuj, ne pitaj ponovo za ovo):\n" +
            Object.entries(po).map(([k, v]) => "[" + k.toUpperCase() + "]\n" + v.map((x) => "- " + x).join("\n")).join("\n");
    } catch (e) { return ""; }
}

// ── poziv ka Edge Function ───────────────────────────────────────────────────
async function pozoviClaude(messages, opcije = {}, pravila = "") {
    const { data, error } = await supabase.functions.invoke(FUNKCIJA, {
        body: { system: SISTEM + (pravila || ""), messages, tools: alatiZaClaude(), ...opcije },
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
export async function pokreniAgenta(pitanje, prethodnePoruke = [], prilozi = [], naKorak = null) {
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
    const javi = (t) => { try { if (naKorak) naKorak(t); } catch (e) { } };
    javi("Razmišljam…");
    const pravila = await ucitajPravila();
    const koraci = [];
    let plan = [];
    let dokument = null;

    for (let krug = 0; krug < MAX_KRUGOVA; krug++) {
        const odgovor = await pozoviClaude(messages, {}, pravila);
        const pozivi = alatiIz(odgovor);
        const tekst = tekstIz(odgovor);

        if (!pozivi.length) {
            const konacan = tekst || "Nemam odgovor.";
            zapamti(pitanje, konacan, { alati: koraci.map((k) => k.alat) });
            return { odgovor: konacan, plan: [], koraci, dokument, messages: [...messages, { role: "assistant", content: odgovor.content }] };
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
                javi(OPIS_ALATA[p.name] || ("Radim: " + p.name));
                const r = await izvrsiAlat(p.name, p.input);
                if (r && r.dokument) dokument = r.dokument;   // ide u ekran (dugmad Excel / PDF)
                const cist = { ...r }; delete cist._plan_sirovo;   // sirov plan ne šaljemo modelu
                rezultati.push({ type: "tool_result", tool_use_id: p.id, content: JSON.stringify(cist).slice(0, 30000) });
            }
        }
        messages.push({ role: "user", content: rezultati });
        javi("Sastavljam odgovor…");

        if (plan.length) {
            // još jedan krug da model objasni plan korisniku
            const zavrsni = await pozoviClaude(messages, {}, pravila);
            const tekstPlana = tekstIz(zavrsni) || "Pripremio sam plan — potvrdi da izvršim.";
            zapamti(pitanje, tekstPlana, { plan: plan.map((x) => x.opis) });
            return {
                odgovor: tekstPlana,
                plan, koraci, dokument,
                messages: [...messages, { role: "assistant", content: zavrsni.content }],
            };
        }
    }

    return { odgovor: "Previše koraka — probaj da suziš zadatak.", plan: [], koraci, dokument, messages };
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
            const odg = await pozoviClaude(nastavak, { tools: [] }, await ucitajPravila());
            zakljucak = tekstIz(odg);
        } catch (e) { }
    }

    zapamti("[POTVRĐEN PLAN]", izvrseno.map((x) => (x.ok ? "USPEH: " : "GREŠKA: ") + x.opis + " — " + x.poruka).join("\n") + (zakljucak ? "\n\n" + zakljucak : ""), { izvrsenje: true });

    return { izvrseno, zakljucak };
}
