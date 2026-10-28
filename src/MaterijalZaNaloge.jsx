import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase.js";
import QRScannerModal from "../QRScannerModal.jsx";

/* Magacioner: vidi naloge koji čekaju materijal i ROLNE KOJE SU VEĆ DODELJENE nalogu.
   NE bira materijal. Čekira svaku rolnu SKENIRANJEM QR koda.
   Vide samo: Đorđe, Boško, Dejan. */

function num(v) { return Number(String(v ?? 0).toString().replace(/\s/g, "").replace(",", ".")) || 0; }
function vrstaColor(v) { const x = String(v || "").toUpperCase(); if (x.includes("PET")) return "#3b82f6"; if (x.includes("ALU")) return "#9aa3af"; if (x.includes("OPA") || x.includes("CPP")) return "#14b8a6"; if (x.includes("BOPP") || x.includes("PE") || x.includes("LDPE")) return "#f59e0b"; if (x.includes("PAPIR")) return "#d4a574"; return "#64748b"; }
function qrCode(raw) { const s = String(raw || "").trim(); if (s.includes("|")) { const p = s.split("|"); return p[p.length - 1].trim(); } return s; }
// Operacija kojoj pripada materijal datog SLOJA: sloj 1 = štampa, sloj 2 = 1. kaширanje, sloj 3 = 2. kaширanje…
function opZaSloj(sloj) { var k = Number(sloj) || 1; if (k <= 1) return "Materijal za štampu"; return "Materijal za " + (k - 1) + ". kaширanje"; }

// Parsiranje QR lokacije (isti format kao u magacinu): direktna "LOK:..." ili delovi MAGACIN/RED/POLICA/POZICIJA
function parseLokacijaQr(orig) {
    const s = String(orig || "").trim(); if (!s) return null;
    const dm = s.match(/^\s*(?:MAROPACK\s*\|\s*)?(?:LOK|LOKACIJA)\s*[:|]\s*(.+)$/i);
    if (dm && dm[1].trim()) return { direct: true, value: dm[1].trim() };
    const raw = s.toUpperCase();
    if (/^WIP\s*[1-5]$/.test(raw.replace(/\s/g, ""))) return { direct: true, wip: true, value: raw.replace(/\s/g, "") };
    const parts = raw.split("|").map((x) => x.trim());
    if (parts[0] === "MAROPACK" && parts.length >= 3) {
        const type = parts[1], val = parts.slice(2).join("|").trim();
        if (type === "MAGACIN" && /^[A-H]$/.test(val)) return { key: "magacin", value: val };
        if (type === "RED" && /^(0[1-5]|[1-5])$/.test(val)) return { key: "red", value: val.padStart(2, "0") };
        if (type === "POLICA" && /^[A-D]$/.test(val)) return { key: "polica", value: val };
        if (type === "POZICIJA" && /^(0[1-4]|[1-4])$/.test(val)) return { key: "pozicija", value: val.padStart(2, "0") };
    }
    if (/^[A-H]$/.test(raw)) return { key: "magacin", value: raw };
    if (/^(0[1-5]|[1-5])$/.test(raw)) return { key: "red", value: raw.padStart(2, "0") };
    const pol = raw.match(/^POLICA[\s:-]*([A-D])$/); if (pol) return { key: "polica", value: pol[1] };
    const poz = raw.match(/^POZICIJA[\s:-]*(0[1-4]|[1-4])$/); if (poz) return { key: "pozicija", value: poz[1].padStart(2, "0") };
    return null;
}
function buildLocCode(p = {}) {
    const m = String(p.magacin || "").toUpperCase().trim(), r = String(p.red || "").trim(), po = String(p.polica || "").toUpperCase().trim(), pz = String(p.pozicija || "").trim();
    if (!m || !r || !po || !pz) return "";
    return `${m}-${r.padStart(2, "0")}-${po}-${pz.padStart(2, "0")}`;
}
function isWipLoc(s) { return /^WIP\s*[1-5]$/i.test(String(s || "").replace(/\s/g, "")); }

export default function MaterijalZaNaloge({ operater, onBack, msg }) {
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState([]);
    const [open, setOpen] = useState(null);     // {op, master}
    const [rolls, setRolls] = useState([]);       // dodeljene rolne
    const [refsInfo, setRefsInfo] = useState("");  // pod kojim referencama su tražene
    const [scanned, setScanned] = useState({});   // rollId -> true
    const [scanOpen, setScanOpen] = useState(false);
    const [manual, setManual] = useState("");
    const [saving, setSaving] = useState(false);
    const [alocMap, setAlocMap] = useState({});   // rollId -> alocirano_m (iz ledgera)
    const [stavkaMap, setStavkaMap] = useState({}); // rollId -> stavka (ledger red)
    const [izdato, setIzdato] = useState({});     // rollId -> izdato_m (uneto)
    const [mode, setMode] = useState("spremi");   // "spremi" | "izdaj"
    const [lokacija, setLokacija] = useState("");          // lokacija spremanja rolni
    const [locParts, setLocParts] = useState({ magacin: "", red: "", polica: "", pozicija: "" });
    const [scanLocOpen, setScanLocOpen] = useState(false);
    const [nedodeljeni, setNedodeljeni] = useState([]);    // slojevi koji još nemaju materijal (čeka administraciju)
    const [vecIzdato, setVecIzdato] = useState({});        // rollId -> true (rolna već izdata ranije, npr. pre dopune)

    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    // ŽIVO OSVEŽAVANJE — kad administracija dopuni materijal (ili se stanje promeni),
    // lista i otvoreni nalog se sami ažuriraju, bez ručnog osvežavanja.
    const openRef = useRef(null);
    useEffect(() => { openRef.current = open; }, [open]);
    useEffect(() => {
        let gasi = false;
        // DEBOUNCE: magacin/stavke/nalozi se menjaju u rafalu (skeniranje rolni po celoj
        // fabrici). Bez ovoga svaka promena pokreće pun reload → na telefonu se nagomila
        // i zakuca. Zato rafal promena sažimamo u JEDNO osvežavanje ~0.9s posle poslednje.
        let deb = null;
        const osvezi = () => {
            if (gasi) return;
            if (deb) clearTimeout(deb);
            deb = setTimeout(() => {
                if (gasi) return;
                load();                               // lista naloga
                const o = openRef.current;
                if (o) ucitajDetalje(o, true);        // otvoreni nalog (čuva skenirano)
            }, 900);
        };
        let ch = null;
        try {
            ch = supabase.channel("mat-za-naloge-" + Math.random().toString(36).slice(2))
                .on("postgres_changes", { event: "*", schema: "public", table: "operativni_nalozi" }, osvezi)
                .on("postgres_changes", { event: "*", schema: "public", table: "materijal_stavke" }, osvezi)
                .on("postgres_changes", { event: "*", schema: "public", table: "magacin" }, osvezi)
                .subscribe();
        } catch (e) { /* realtime možda nije uključen — ostaje fallback interval */ }
        const onEvt = () => osvezi();
        if (typeof window !== "undefined") window.addEventListener("maropack:nalozi-changed", onEvt);
        const t = setInterval(osvezi, 15000);         // fallback: svakih 15s
        return () => {
            gasi = true;
            try { supabase.removeChannel(ch); } catch (e) { }
            if (typeof window !== "undefined") window.removeEventListener("maropack:nalozi-changed", onEvt);
            clearInterval(t);
        };
        /* eslint-disable-next-line */
    }, []);

    async function load() {
        setLoading(true);
        try {
            // NE vuci parametri/rezultati (jsonb sa CELIM templejtom, desetine KB po nalogu).
            // Ovaj ekran koristi samo broj, kupca i naziv — sve ostalo je bio mrtav teret
            // koji je na telefonu pravio sekunde cekanja.
            //
            // VAZNO (status "radi"): kada radnik u RadnikOperaciji klikne "Zapocni
            // operaciju", status materijal-operacije predje u "radi". Ranije "radi"
            // nije bio u listi, pa je nalog (i njegove rolne) NESTAJAO iz magacina cim
            // operacija krene. Magacin mora da zadrzi nalog i dok je operacija u toku,
            // sve dok magacioner stvarno ne izda materijal (status -> "izdato") ili ga
            // ne obelezi "spremljeno" ("potvrdi"). Zato "radi"/"Radi" sada ostaju u listi.
            const { data: ops, error: oErr } = await supabase.from("operativni_nalozi")
                .select("id, broj_naloga, glavni_nalog_id, tip_naloga, status, redosled")
                .eq("tip_naloga", "materijal")
                .in("status", ["ceka", "ceka_magacin", "Ceka", "čeka", "spremanje", "radi", "Radi", "u_toku"])
                .order("redosled", { ascending: true }).limit(60);
            if (oErr) throw oErr;
            const list = ops || [];
            const masterIds = [...new Set(list.map((o) => o.glavni_nalog_id).filter(Boolean))];
            let masters = [];
            if (masterIds.length) {
                const { data: ms, error: mErr } = await supabase.from("radni_nalozi")
                    .select("id, broj_naloga, kupac, naziv, proizvod, tip_proizvoda, status")
                    .in("id", masterIds);
                if (mErr) throw mErr;
                masters = ms || [];
            }
            const byId = {}; masters.forEach((m) => { byId[m.id] = m; });
            setItems(list.map((o) => ({ op: o, master: byId[o.glavni_nalog_id] || {} })));
        } catch (e) { msg && msg("Greška pri učitavanju: " + (e.message || e), "err"); }
        finally { setLoading(false); }
    }

    async function openNalog(it) {
        setOpen(it); setScanned({}); setRolls([]); setManual(""); setAlocMap({}); setStavkaMap({}); setIzdato({}); setMode("spremi");
        setLokacija(""); setLocParts({ magacin: "", red: "", polica: "", pozicija: "" }); setNedodeljeni([]); setVecIzdato({});
        await ucitajDetalje(it, false);
    }
    // Učitaj rolne + nedodeljene slojeve naloga. merge=true → NE briše skenirano/uneto
    // (koristi se za ŽIVO osvežavanje kad administracija dopuni materijal, da magacioner
    //  ne izgubi već skenirane rolne, a nove (dopunjene) se same pojave).
    async function ucitajDetalje(it, merge) {
        // Delimičan nalog: koji slojevi još nemaju materijal (administracija ih dodeljuje kad stigne).
        try {
            if (it.master?.id) {
                const { data: rn } = await supabase.from("radni_nalozi").select("parametri").eq("id", it.master.id).single();
                const p = rn && rn.parametri;
                const nd = (p && (p.nedodeljeni_slojevi || [])) || [];
                if (Array.isArray(nd) && nd.length) setNedodeljeni(nd);
            }
        } catch (e) { }
        // VAZNO: operativni nalog ima broj SA SUFIKSOM operacije:
        //     op.broj_naloga      = "MP-2026-0015-MATERIJAL"
        // ali rolne i ledger nose CIST broj naloga:
        //     magacin.dodeljeno_nalogu    = "MP-2026-0015 · SPANAC 600 HR MAXI"
        //     materijal_stavke.nalog_ref  = "MP-2026-0015"
        // Ranije se koristio op.broj_naloga (sa sufiksom), pa oba upita nisu nalazila
        // nista i magacioner je dobijao "Ovom nalogu nisu dodeljene rolne".
        const SUFIKS = /-(MATERIJAL|STAMPA|LAKIRANJE|KASIRANJE|PERFORACIJA_REZANJE|FORMATIRANJE|KESA|SPULNA)$/i;
        const brojMaster = String(it.master?.broj_naloga || "").trim();
        const brojOp = String(it.op?.broj_naloga || "").trim().replace(SUFIKS, "");
        const broj = brojMaster || brojOp;

        // ── DOZVOLJENE ROLNE = TAČNO one koje je administracija izabrala na nalogu.
        // Izvor: materijali_nalozi.parametri.izabrane_rolne — ISTI izvor koji se štampa
        // na nalogu (NalogLayoutPRO). Magacin (dodeljeno_nalogu) i ledger (materijal_stavke)
        // mogu da nose ZAOSTALE rezervacije rolni koje su kasnije uklonjene iz izbora
        // (npr. preračun pre konačnog izbora). Takve rolne NE smeju da se prikažu
        // magacioneru — zato ovde uzimamo konačan izbor i filtriramo po njemu.
        let dozvId = null, dozvBr = null, izabraneArr = [];
        try {
            if (broj) {
                let izabrane = null;
                const { data: mn } = await supabase.from("materijali_nalozi")
                    .select("parametri").filter("parametri->>broj_naloga", "eq", broj).limit(1);
                if (mn && mn[0] && mn[0].parametri) izabrane = mn[0].parametri.izabrane_rolne || mn[0].parametri.rezervisane_rolne;
                if (!izabrane && it.master?.id != null) {
                    const { data: mn2 } = await supabase.from("materijali_nalozi")
                        .select("parametri").filter("parametri->>glavni_nalog_id", "eq", String(it.master.id)).limit(1);
                    if (mn2 && mn2[0] && mn2[0].parametri) izabrane = mn2[0].parametri.izabrane_rolne || mn2[0].parametri.rezervisane_rolne;
                }
                if (Array.isArray(izabrane) && izabrane.length) {
                    izabraneArr = izabrane;
                    dozvId = new Set(); dozvBr = new Set();
                    izabrane.forEach((x) => {
                        if (!x) return;
                        if (x.rolna_id != null) dozvId.add(String(x.rolna_id));
                        const b = x.br_rolne || x.qr || x.qr_code || x.qr_kod;
                        if (b) dozvBr.add(String(b).toUpperCase().trim());
                    });
                }
            }
        } catch (e) { /* bez filtera ako izbor nije dostupan (stariji nalozi) */ }
        const normB = (x) => String(x || "").toUpperCase().trim();
        const naIzboru = (r) => {
            if (!dozvId || (!dozvId.size && !(dozvBr && dozvBr.size))) return true; // nema izbora → ne filtriraj
            if (dozvId.has(String(r.id))) return true;
            // poklapanje po SVIM mogućim identifikatorima rolne (broj/QR/id), normalizovano
            const kand = [r.br_rolne, r.qr_code, r.qr, r.id].map(normB).filter(Boolean);
            return !!(dozvBr && kand.some((k) => dozvBr.has(k)));
        };

        // Rolne su vezane za BROJ NALOGA:  magacin.dodeljeno_nalogu = "MP-2026-0008 · PROIZVOD"
        // (ranije je bilo vezano za šifru proizvoda, pa su dva naloga sa istim
        //  proizvodom delila iste rolne — magacioner je istu rolnu mogao izdati dvaput)
        let rows = [];
        try {
            const mapa = {};
            if (broj) {
                const { data, error } = await supabase.from("magacin").select("*")
                    .ilike("dodeljeno_nalogu", "%" + broj + "%").limit(60);
                if (error) throw error;
                // VAŽNO: ilike "%broj%" može uhvatiti rolnu po DELU teksta ili deljenu rolnu
                // (ovaj nalog je samo jedan od više). Zadržavamo SAMO rolne kojima dodeljeno_nalogu
                // sadrži TAČAN broj ovog naloga (token pre „ · proizvod", delovi razdvojeni zarezom).
                // Rolna deljena na više naloga: dodeljeno_nalogu = "MP-A · prodA, MP-B · prodB".
                // Zadrži rolnu ako BILO KOJI deo (razdvojen zarezom) nosi TAČNO ovaj broj naloga.
                // Robusno na separator (· • ili razmak) da deljena rolna ne otpadne.
                const tacanBroj = (dodeljeno) => String(dodeljeno || "").split(",").some((part) => {
                    const p = part.trim();
                    const tok = p.split(/[·•]/)[0].trim();
                    return tok === broj || p === broj || p.startsWith(broj + " ") || p.startsWith(broj + "·");
                });
                (data || []).filter((r) => tacanBroj(r.dodeljeno_nalogu)).forEach((r) => { mapa[r.id] = r; });

                // dopuna iz ledgera (materijal_stavke.nalog_ref = broj naloga)
                const { data: st0, error: sErr } = await supabase.from("materijal_stavke")
                    .select("rolna_id").eq("nalog_ref", broj)
                    .in("status", ["rezervisano", "izdato"]).limit(200);
                if (sErr) throw sErr;
                const ids = [...new Set((st0 || []).map((x) => x.rolna_id).filter(Boolean))]
                    .filter((id) => !mapa[id]);
                if (ids.length) {
                    const { data: mr, error: mErr } = await supabase.from("magacin").select("*").in("id", ids).limit(60);
                    if (mErr) throw mErr;
                    (mr || []).forEach((r) => { mapa[r.id] = r; });
                }
            }
            // Zadrži SAMO rolne koje su na konačnom izboru naloga (ako izbor postoji).
            // Ovo izbacuje zaostale rezervacije (rolne koje se ne nalaze na štampanom nalogu).
            const sve = Object.values(mapa);
            const filtrirane = sve.filter(naIzboru);
            // SIGURNOSNA MREŽA: ako bi filter po izboru sakrio SVE rolne a rezervacije postoje,
            // znači da izbor NIJE sinhronizovan sa rezervacijama (ili je u drugom formatu) —
            // tada NE sakrivamo ništa, nego prikažemo rezervisane rolne. Magacioner nikad
            // ne sme da ostane bez prikaza kad nalog stvarno ima rezervisane rolne.
            rows = (filtrirane.length === 0 && sve.length > 0) ? sve : filtrirane;

            // ── RUČNE ROLNE (ručni unos u kancelariji) ──────────────────────────
            // Sloj unet preko „Ručni unos" se NE rezerviše iz magacina (nema ga u
            // magacin/ledger), pa nalog izgleda „bez materijala". Ali po dogovoru:
            // magacioner takvu rolnu PRONALAZI SAM PO BROJU. Zato je dodajemo iz
            // izbora naloga kao karticu „ručno — pronađi po broju", da nalog bude
            // upotrebljiv a ne prazan. (Ove rolne ne diraju bazu pri spremanju/izdavanju.)
            try {
                if (Array.isArray(izabraneArr) && izabraneArr.length) {
                    const imaId = new Set(rows.map((r) => String(r.id)));
                    const imaBr = new Set(rows.map((r) => normB(r.br_rolne)).filter(Boolean));
                    izabraneArr.forEach((x, idx) => {
                        if (!x) return;
                        const br = x.br_rolne || x.qr || x.qr_code || x.qr_kod;
                        const st = String(x.status || "").toLowerCase();
                        const jeRucna = x.rucni === true || st.includes("ruč") || st.includes("ruc");
                        if (!jeRucna) return;                                   // prikazuj SAMO ručne ovde
                        if (!br) return;
                        if (x.rolna_id != null && imaId.has(String(x.rolna_id))) return; // već prikazana
                        if (imaBr.has(normB(br))) return;                        // već prikazana po broju
                        rows.push({
                            id: "rucni-" + (x.rolna_id != null ? x.rolna_id : (normB(br) + "-" + idx)),
                            br_rolne: br, qr_code: br, rucni: true,
                            vrsta: x.snap_vrsta || x.vrsta || "", oznaka_materijala: x.snap_oznaka || x.oznaka || "",
                            deb: x.snap_debljina || x.debljina || "", sirina: x.sirina || x.snap_sirina || "",
                            sloj: Number(x.sloj) || 1, lokacija: "", metraza_ost: 0,
                            _alok: Number(x.alocirano_m) || 0,
                        });
                    });
                }
            } catch (e) { /* ručne rolne su samo informativne */ }

            // ── DOPUNA: rolne SA NALOGA (izbor) koje nisu nađene preko magacin/ledger ──
            // Štampani nalog uvek prikazuje `izabrane_rolne`; magacioner mora da spremi
            // SVE te rolne. Ako neka rezervacija nije (kompletno) zabeležena u magacinu
            // ili ledgeru — npr. posle dopune/izmene izbora — ta rolna bi nestala sa
            // ekrana magacionera iako je na nalogu. Ovde je VRAĆAMO: žive podatke
            // (metraža/lokacija/status) vučemo iz magacina po id-u, a planirano iz izbora.
            try {
                if (Array.isArray(izabraneArr) && izabraneArr.length) {
                    const imaId = new Set(rows.map((r) => String(r.id)));
                    const imaBr = new Set(rows.map((r) => normB(r.br_rolne)).filter(Boolean));
                    const nedostaju = izabraneArr.filter((x) => {
                        if (!x) return false;
                        const st = String(x.status || "").toLowerCase();
                        const jeRucna = x.rucni === true || st.includes("ruč") || st.includes("ruc");
                        if (jeRucna) return false;                      // ručne su dodate gore
                        // NAPOMENA: NE filtriramo po "planirano > 0". Svaka rolna koju je
                        // administracija izabrala na nalogu mora da stigne magacioneru —
                        // i ona kojoj je alokacija 0 m (npr. prethodna rolna je pokrila
                        // celu potrebu). Jedini uslov je da rolna ima stvarni identitet.
                        const br = x.br_rolne || x.qr || x.qr_code || x.qr_kod;
                        if (x.rolna_id != null && imaId.has(String(x.rolna_id))) return false;
                        if (br && imaBr.has(normB(br))) return false;
                        return x.rolna_id != null || !!br;
                    });
                    if (nedostaju.length) {
                        const mids = nedostaju.map((x) => x.rolna_id).filter((id) => id != null);
                        const magById = {};
                        if (mids.length) {
                            try {
                                const { data: mr2 } = await supabase.from("magacin").select("*").in("id", mids).limit(60);
                                (mr2 || []).forEach((r) => { magById[r.id] = r; });
                            } catch (e) { /* bez živih podataka → iz snapshota */ }
                        }
                        nedostaju.forEach((x) => {
                            const br = x.br_rolne || x.qr || x.qr_code || x.qr_kod;
                            const m = (x.rolna_id != null && magById[x.rolna_id]) ? magById[x.rolna_id] : null;
                            if (m) {
                                // prava magacin rolna — planirano iz izbora (ledger ga kasnije precizira)
                                rows.push({ ...m, _alok: Number(x.alocirano_m) || 0 });
                            } else {
                                // nema je u magacinu — prikaži iz snapshota (magacioner je nalazi po broju)
                                rows.push({
                                    id: x.rolna_id != null ? x.rolna_id : ("izbor-" + normB(br)),
                                    br_rolne: br, qr_code: br,
                                    vrsta: x.snap_vrsta || x.vrsta || "", oznaka_materijala: x.snap_oznaka || x.oznaka || "",
                                    deb: x.snap_debljina || x.debljina || "", sirina: x.sirina || x.snap_sirina || "",
                                    sloj: Number(x.sloj) || 1, lokacija: x.lokacija || "", metraza_ost: Number(x.metraza) || 0,
                                    _alok: Number(x.alocirano_m) || 0,
                                });
                            }
                        });
                    }
                }
            } catch (e) { /* dopuna sa naloga je best-effort */ }
        } catch (e) {
            // Ranije: catch (e) {} — greska je nestajala, a ekran je izgledao
            // isto kao da nalog stvarno nema rolne. Sada se vidi.
            msg && msg("Ne mogu da učitam rolne naloga: " + (e?.message || e), "err");
        }
        setRefsInfo(broj);
        setRolls(rows);
        // Alokacija po rolni iz ledgera (materijal_stavke) — koliko ovaj nalog drži na svakoj rolni
        try {
            // Ručne rolne (synthetic id "rucni-…") NISU u ledgeru — izostavi ih iz upita,
            // a njihovo „planirano" uzmi direktno iz izbora naloga.
            const ids = rows.map((r) => r.id).filter((x) => x != null && !String(x).startsWith("rucni-") && !String(x).startsWith("izbor-"));
            const aMap = {}, sMap = {}, iMap = {}, scInit = {}, vecInit = {};
            // Planirano iz izbora (ručne + rolne vraćene sa naloga) — ledger ispod ga precizira ako postoji stavka.
            rows.forEach((r) => { if (r._alok != null) { aMap[r.id] = num(r._alok); iMap[r.id] = String(Math.round(num(r._alok))); } });
            if (ids.length) {
                const { data: st } = await supabase.from("materijal_stavke").select("*").in("rolna_id", ids).in("status", ["rezervisano", "izdato"]).order("created_at", { ascending: true });
                (st || []).forEach((s) => {
                    // Alokaciju (planirano) uzimamo SAMO iz stavke OVOG naloga (nalog_ref === broj).
                    // Ranije je fallback (aMap == null) hvatao stavku DRUGOG naloga, pa je rolna
                    // koja ne pripada nalogu dobijala tuđe „planirano".
                    const pripada = !broj || String(s.nalog_ref || "") === broj;
                    if (pripada) {
                        aMap[s.rolna_id] = num(s.alocirano_m);
                        sMap[s.rolna_id] = s;
                        const preostalo = Math.round(Math.max(0, num(s.alocirano_m) - num(s.izdato_m)));
                        iMap[s.rolna_id] = String(preostalo);
                        // Rolna već izdata ranije (npr. štampa pre dopune) — pred-čekiraj je da magacioner
                        // skenira SAMO nove rolne, i ne izdaje je ponovo (preostalo = 0).
                        if (String(s.status || "") === "izdato" && preostalo <= 0) { scInit[s.rolna_id] = true; vecInit[s.rolna_id] = true; }
                    }
                });
            }
            // Primeni mape i kad nalog ima SAMO ručne rolne (ids prazno) — da se vidi „planirano".
            setAlocMap(aMap); setStavkaMap(sMap);
            if (merge) {
                // sačuvaj ono što je magacioner već skenirao/uneo; dodaj samo nove rolne
                setIzdato((prev) => ({ ...iMap, ...prev }));
                setScanned((prev) => ({ ...scInit, ...prev }));
                setVecIzdato((prev) => ({ ...prev, ...vecInit }));
            } else {
                setIzdato(iMap);
                if (Object.keys(scInit).length) setScanned(scInit);
                setVecIzdato(vecInit);
            }
        } catch (e) { }
    }

    function alocRolne(r) {
        if (alocMap[r.id] != null) return alocMap[r.id];
        if (num(r.rezervisano) > 0) return num(r.rezervisano);
        return num(r.metraza_ost ?? r.metraza);
    }

    function tryCheck(text) {
        const code = qrCode(text).toUpperCase();
        const r = rolls.find((x) => String(x.qr_code || "").toUpperCase() === code || String(x.br_rolne || "").toUpperCase() === code);
        if (!r) { msg && msg("Rolna nije na listi ovog naloga (" + qrCode(text) + ")", "err"); return false; }
        if (scanned[r.id]) { msg && msg("Rolna je već čekirana.", "err"); return true; }
        setScanned((p) => ({ ...p, [r.id]: true }));
        msg && msg("✓ " + (r.br_rolne || r.qr_code) + " spremljeno", "ok");
        return true;
    }

    function onLocScan(text) {
        const loc = parseLokacijaQr(text);
        if (!loc) { msg && msg("Ovo nije QR lokacije.", "err"); return; }
        if (loc.direct) {
            setLokacija(loc.value);
            setLocParts({ magacin: "", red: "", polica: "", pozicija: "" });
            msg && msg("📍 Lokacija: " + loc.value, "ok");
            return;
        }
        const next = { ...locParts, [loc.key]: loc.value };
        setLocParts(next);
        const code = buildLocCode(next);
        if (code) { setLokacija(code); msg && msg("📍 Lokacija: " + code, "ok"); }
        else msg && msg("📍 " + (loc.key === "magacin" ? "Magacin" : loc.key === "red" ? "Red" : loc.key === "polica" ? "Polica" : "Pozicija") + " " + loc.value + " — skeniraj još", "ok");
    }

    async function potvrdi() {
        if (!open) return;
        setSaving(true);
        try {
            await supabase.from("operativni_nalozi").update({ status: "spremljeno" }).eq("id", open.op.id);
            // Ručne rolne (synthetic id) se NE upisuju u magacin — magacioner ih nalazi po broju.
            const ids = rolls.filter((r) => scanned[r.id] && !r.rucni).map((r) => r.id);
            if (ids.length) { try { await supabase.from("magacin").update({ pripremljeno: true, ...(lokacija ? { lokacija } : {}) }).in("id", ids); } catch (e) { } }
            msg && msg("Nalog spremljen.", "ok");
            setOpen(null); load();
        } catch (e) { msg && msg("Greška: " + (e.message || e), "err"); }
        finally { setSaving(false); }
    }

    async function izdaj() {
        if (!open) return;
        setSaving(true);
        let izdatoUkupno = 0, brojRolni = 0;
        try {
            for (const r of rolls) {
                if (!scanned[r.id]) continue;
                if (r.rucni) continue;   // ručna rolna — van sistema, ne skida se iz magacina
                const izdM = Math.round(Math.max(0, num(izdato[r.id] ?? alocRolne(r))));
                if (izdM <= 0) continue;
                const ukupno = num(r.metraza_ost ?? r.metraza);
                const noviOst = Math.max(0, ukupno - izdM);
                const noviRez = Math.max(0, num(r.rezervisano) - izdM);
                const wip = isWipLoc(lokacija);
                const status = wip ? "U proizvodnji" : (noviOst <= 0 ? "Iskorišćeno" : (noviRez > 0 ? "Delimično rezervisano" : "Na stanju"));
                // 1) magacin: skini metre, oslobodi rezervaciju za izdati deo
                await supabase.from("magacin").update({
                    metraza_ost: noviOst,
                    rezervisano: noviRez || null,
                    status,
                    pripremljeno: true,
                    ...(lokacija ? { lokacija } : {}),
                }).eq("id", r.id);
                // 2) ledger: upiši izdato_m u stavku ovog naloga
                const st = stavkaMap[r.id];
                if (st && st.id) {
                    const novoIzdato = num(st.izdato_m) + izdM;
                    await supabase.from("materijal_stavke").update({
                        izdato_m: novoIzdato,
                        status: "izdato",
                    }).eq("id", st.id);
                }
                izdatoUkupno += izdM; brojRolni += 1;
            }
            await supabase.from("operativni_nalozi").update({ status: "izdato" }).eq("id", open.op.id);
            msg && msg(`Izdato ${fmt(izdatoUkupno)} m sa ${brojRolni} rolni${isWipLoc(lokacija) ? " → " + lokacija + " (u proizvodnji)" : " — skinuto sa stanja"}.`, "ok");
            setOpen(null); load();
        } catch (e) { msg && msg("Greška pri izdavanju: " + (e.message || e), "err"); }
        finally { setSaving(false); }
    }

    const wrap = { minHeight: "100vh", background: "#f1f5f9", padding: 12, color: "#0f172a", fontFamily: "Inter,system-ui,Arial,sans-serif" };
    const card = { background: "#fff", borderRadius: 14, padding: 14, marginBottom: 11, boxShadow: "0 2px 8px rgba(0,0,0,.07)" };
    const btn = { width: "100%", border: "none", borderRadius: 13, padding: 15, fontSize: 16, fontWeight: 900, cursor: "pointer" };
    const pill = (bg, c) => ({ fontSize: 11, fontWeight: 800, borderRadius: 7, padding: "3px 9px", background: bg, color: c });
    const fmt = (n) => Number(n || 0).toLocaleString("sr-RS");

    function Header({ title, sub }) {
        return (
            <div style={{ background: "#0f766e", color: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={open ? () => setOpen(null) : onBack} style={{ background: "rgba(255,255,255,.18)", border: "none", color: "#fff", borderRadius: 9, padding: "6px 10px", fontWeight: 900, cursor: "pointer" }}>‹</button>
                    <div><div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div><div style={{ fontSize: 12, opacity: .85 }}>{sub}</div></div>
                </div>
            </div>
        );
    }

    if (open) {
        const total = rolls.length;
        const done = rolls.filter((r) => scanned[r.id]).length;
        const allDone = total > 0 && done === total;
        // Status operacije (radi li je radnik vec zapoceo) — samo info traka za magacionera.
        const opStatus = String(open.op?.status || "").toLowerCase();
        const uToku = opStatus === "radi" || opStatus === "u_toku";
        return (
            <div style={wrap}>
                {scanOpen && <QRScannerModal onResult={(t) => { setScanOpen(false); tryCheck(t); }} onClose={() => setScanOpen(false)} />}
                {scanLocOpen && <QRScannerModal onResult={(t) => { onLocScan(t); }} onClose={() => setScanLocOpen(false)} />}
                <Header title={open.master.broj_naloga || open.op.broj_naloga || "Nalog"} sub={(open.master.kupac || "—") + " · " + (open.master.proizvod || open.master.naziv || "")} />

                {uToku && (
                    <div style={{ ...card, marginBottom: 9, borderLeft: "5px solid #7c3aed", background: "#faf5ff" }}>
                        <div style={{ fontWeight: 900, fontSize: 13.5, color: "#6d28d9" }}>▶ Radnik je započeo operaciju</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Rolne i dalje čekaju da ih spremiš/izdaš — nalog ostaje ovde dok ne izdaš materijal.</div>
                    </div>
                )}

                <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 28 }}>📦</div>
                    <div><div style={{ fontWeight: 900, fontSize: 15 }}>Spremi rolne za ovaj nalog</div><div style={{ fontSize: 12, color: "#64748b" }}>Skeniraj QR svake rolne da je čekiraš.</div></div>
                    <div style={{ marginLeft: "auto", fontWeight: 950, fontSize: 18, color: allDone ? "#16a34a" : "#0f766e" }}>{done}/{total}</div>
                </div>

                {total > 0 && (
                    <div style={{ ...card, marginBottom: 9, borderLeft: "5px solid " + (lokacija ? (isWipLoc(lokacija) ? "#7c3aed" : "#16a34a") : "#0ea5e9") }}>
                        <div style={{ fontWeight: 900, fontSize: 13.5, marginBottom: 7 }}>📍 Lokacija spremanja {lokacija ? <span style={{ color: isWipLoc(lokacija) ? "#7c3aed" : "#16a34a" }}>· {lokacija}{isWipLoc(lokacija) ? " (→ u proizvodnju)" : ""}</span> : <span style={{ color: "#94a3b8", fontWeight: 600 }}>(skeniraj ili unesi · npr. WIP1)</span>}</div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <input value={lokacija} onChange={(e) => setLokacija(e.target.value)} placeholder="npr. A-01-B-02 ili Magacin A1" style={{ flex: 1, border: "1px solid #cbd5e1", borderRadius: 11, padding: 12, fontSize: 14, fontWeight: 700 }} />
                            <button onClick={() => { setLocParts({ magacin: "", red: "", polica: "", pozicija: "" }); setScanLocOpen(true); }} style={{ ...btn, width: "auto", padding: "12px 14px", background: "#0ea5e9", color: "#fff", whiteSpace: "nowrap" }}>📷 Skeniraj</button>
                        </div>
                        {(locParts.magacin || locParts.red || locParts.polica || locParts.pozicija) && !lokacija && (
                            <div style={{ fontSize: 11, color: "#0ea5e9", marginTop: 6, fontWeight: 700 }}>Magacin {locParts.magacin || "—"} · Red {locParts.red || "—"} · Polica {locParts.polica || "—"} · Pozicija {locParts.pozicija || "—"} — skeniraj preostale</div>
                        )}
                    </div>
                )}

                {total === 0 && <div style={{ ...card, borderLeft: "5px solid #f59e0b" }}>
                    <div style={{ fontWeight: 900, marginBottom: 5 }}>Ovom nalogu nisu dodeljene rolne.</div>
                    <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                        Kancelarija ih dodeljuje u templejtu, dugmetom <b>„Generiši nalog materijala"</b> → izbor rolni → <b>„Potvrdi i pošalji magacioneru"</b>.
                        <div style={{ marginTop: 6, color: "#94a3b8" }}>Nalog: {refsInfo || "—"}</div>
                    </div>
                </div>}

                {(() => {
                    // Rolne razdvojene PO OPERACIJI (sloju): materijal za štampu, za 1. kaширanje, 2. kaширanje…
                    const groups = {}, order = [];
                    rolls.forEach((rr) => { const sl = Number((stavkaMap[rr.id] || {}).sloj) || Number(rr.sloj) || 1; if (!groups[sl]) { groups[sl] = []; order.push(sl); } groups[sl].push(rr); });
                    order.sort((a, b) => a - b);
                    const viseOp = order.length > 1;
                    return order.map((sl) => {
                        const lista = groups[sl];
                        const doneG = lista.filter((x) => scanned[x.id]).length;
                        return (
                            <React.Fragment key={"grp" + sl}>
                                {viseOp && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 2px 7px", padding: "8px 12px", background: "#eef4ff", border: "1px solid #c7d7f5", borderRadius: 12, fontWeight: 900, fontSize: 13.5, color: "#1e3a8a" }}><span>📦 {opZaSloj(sl)}</span><span style={{ fontSize: 12.5, color: doneG === lista.length ? "#15803d" : "#1e3a8a" }}>{doneG}/{lista.length}</span></div>}
                                {lista.map((r) => {
                    const on = !!scanned[r.id];
                    const aloc = alocRolne(r);
                    const ostatak = num(r.metraza_ost ?? r.metraza);
                    return (
                        <div key={r.id} style={{ ...card, marginBottom: 9, borderLeft: "5px solid " + (on ? "#16a34a" : "#f59e0b") }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ width: 13, height: 13, borderRadius: "50%", background: vrstaColor(r.vrsta) }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 900, fontSize: 14 }}>{r.br_rolne || r.qr_code}{r.rucni && <span style={{ ...pill("#fef3c7", "#92400e"), marginLeft: 7, verticalAlign: "middle" }}>✍ RUČNO</span>}</div>
                                    <div style={{ fontSize: 12, color: "#64748b" }}>{(r.vrsta || "") + (r.oznaka_materijala ? " · " + r.oznaka_materijala : "") + (r.deb ? " · " + r.deb + "µ" : "")}</div>
                                    {r.rucni
                                        ? <div style={{ fontSize: 11, color: "#b45309", marginTop: 2, fontWeight: 700 }}>✍ Ručni unos — pronađi rolnu po broju (nije rezervisana iz magacina) · š {r.sirina || "—"} mm · <b style={{ color: "#0f766e" }}>planirano {fmt(aloc)} m</b></div>
                                        : <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>📍 {r.lokacija || "—"} · š {r.sirina || "—"} mm · na rolni {fmt(ostatak)} m · <b style={{ color: "#0f766e" }}>planirano {fmt(aloc)} m</b></div>}
                                </div>
                                <span style={pill(on ? "#dcfce7" : "#fef3c7", on ? "#15803d" : "#a16207")}>{vecIzdato[r.id] ? "✓ izdato ranije" : (on ? "✓ skenirano" : "⏳ skeniraj")}</span>
                            </div>
                            {on && !vecIzdato[r.id] && !r.rucni && (
                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, paddingTop: 10, borderTop: "1px dashed #e2e8f0" }}>
                                    <span style={{ fontSize: 12.5, fontWeight: 800, color: "#475569" }}>📤 Izdaj (m):</span>
                                    <input type="number" value={izdato[r.id] ?? String(Math.round(aloc))} onChange={(e) => setIzdato((p) => ({ ...p, [r.id]: e.target.value }))}
                                        style={{ width: 120, border: "1.5px solid #0f766e", background: "#f0fdfa", borderRadius: 10, padding: "9px 11px", fontSize: 15, fontWeight: 900, color: "#0f766e", textAlign: "right" }} />
                                    <span style={{ fontSize: 11, color: "#94a3b8" }}>od {fmt(ostatak)} m</span>
                                    {num(izdato[r.id] ?? aloc) > ostatak && <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 800 }}>⚠ više nego na rolni</span>}
                                </div>
                            )}
                        </div>
                    );
                                })}
                            </React.Fragment>
                        );
                    });
                })()}

                {nedodeljeni.length > 0 && nedodeljeni.map((s, i) => (
                    <div key={"ned" + i} style={{ ...card, marginBottom: 9, borderLeft: "5px dashed #f59e0b", background: "#fffbeb" }}>
                        <div style={{ fontWeight: 900, fontSize: 13.5, color: "#a16207" }}>⏳ Sloj {s.sloj} · {[s.materijal, s.oznaka, s.debljina ? s.debljina + "µ" : ""].filter(Boolean).join(" ")} — nije dodeljeno</div>
                        <div style={{ fontSize: 12, color: "#92400e", marginTop: 3 }}>Nema rolni za ovaj sloj. Čeka da administracija izabere materijal (tek kad stigne na stanje).</div>
                    </div>
                ))}

                {total > 0 && (
                    <div style={{ position: "sticky", bottom: 0, paddingTop: 8 }}>
                        <button onClick={() => setScanOpen(true)} style={{ ...btn, background: "#0f172a", color: "#fff", marginBottom: 9 }}>📷 Skeniraj QR rolne</button>
                        <div style={{ display: "flex", gap: 8, marginBottom: 9 }}>
                            <input value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) { tryCheck(manual.trim()); setManual(""); } }} placeholder="ili unesi QR / broj rolne" style={{ flex: 1, border: "1px solid #cbd5e1", borderRadius: 11, padding: 13, fontSize: 14, fontWeight: 700 }} />
                            <button onClick={() => { if (manual.trim()) { tryCheck(manual.trim()); setManual(""); } }} style={{ ...btn, width: "auto", padding: "13px 16px", background: "#e2e8f0", color: "#334155" }}>OK</button>
                        </div>
                        <button disabled={!allDone || saving} onClick={izdaj} style={{ ...btn, background: allDone && !saving ? "#16a34a" : "#cbd5e1", color: "#fff", marginBottom: 8 }}>{saving ? "Izdajem..." : (allDone ? "📤 Izdaj i skini sa stanja" : "Skeniraj sve rolne (" + done + "/" + total + ")")}</button>
                        <button disabled={saving} onClick={potvrdi} style={{ ...btn, background: "#fff", color: "#475569", border: "1.5px solid #cbd5e1", fontSize: 13, padding: 11 }}>Samo spremljeno (bez skidanja metara)</button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={wrap}>
            <Header title="📋 Materijal za naloge" sub={"Magacioner: " + (operater?.ime || operater || "—")} />
            {loading && <div style={card}>Učitavam…</div>}
            {!loading && items.length === 0 && <div style={card}>Nema naloga koji čekaju materijal. 🎉</div>}
            {!loading && items.map((it, idx) => {
                const m = it.master;
                const opStatus = String(it.op?.status || "").toLowerCase();
                const uToku = opStatus === "radi" || opStatus === "u_toku";
                return (
                    <div key={idx} onClick={() => openNalog(it)} style={{ ...card, borderLeft: "5px solid " + (uToku ? "#7c3aed" : "#f59e0b"), cursor: "pointer" }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "#0f766e" }}>{m.broj_naloga || it.op.broj_naloga || "—"}</div>
                        <div style={{ fontSize: 16, fontWeight: 900, marginTop: 2 }}>{m.kupac || "—"}</div>
                        <div style={{ fontSize: 13, color: "#475569" }}>{m.proizvod || m.naziv || ""}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                            {uToku
                                ? <span style={pill("#f3e8ff", "#6d28d9")}>▶ Radnik radi · spremi/izdaj materijal ›</span>
                                : <span style={pill("#fef3c7", "#a16207")}>⏳ Spremi materijal ›</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
