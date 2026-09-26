import { supabase } from '../supabase';
import { buildOrderSourcePack, extractTemplate, normalizeTip } from './nalogDataLink';

/**
 * Čuva novu kalkulaciju u bazu
 * @param {Object} params - Parametri kalkulacije
 * @returns {Object} - Sačuvana kalkulacija
 */
export async function sacuvajKalkulaciju({
    tip, // 'folija', 'kesa', 'spulna'
    naziv,
    klijent,
    data, // ceo objekat sa svim podacima
    osnovnaCena,
    konacnaCena,
    kolicina
}) {
    try {
        const { data: result, error } = await supabase
            .from('kalkulacije')
            .insert([{
                tip,
                naziv,
                klijent,
                data,
                osnovna_cena: osnovnaCena,
                konacna_cena: konacnaCena,
                kolicina,
                status: 'draft',
                verzija: 1
            }])
            .select()
            .single();
        if (error) throw error;
        return { success: true, data: result };
    } catch (err) {
        console.error('Greška pri čuvanju kalkulacije:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Ažurira postojeću kalkulaciju - kreira NOVU VERZIJU
 * @param {Number} parentId - ID originalne kalkulacije
 * @param {Object} params - Novi podaci
 * @returns {Object} - Nova verzija kalkulacije
 */
export async function izmeniKalkulaciju(parentId, {
    naziv,
    klijent,
    data,
    osnovnaCena,
    konacnaCena,
    kolicina
}) {
    try {
        // 1. Učitaj parent kalkulaciju da dobiješ tip i verziju
        const { data: parent, error: parentError } = await supabase
            .from('kalkulacije')
            .select('*')
            .eq('id', parentId)
            .single();
        if (parentError) throw parentError;
        // 2. Kreiraj novu verziju
        const { data: result, error } = await supabase
            .from('kalkulacije')
            .insert([{
                tip: parent.tip,
                naziv,
                klijent,
                data,
                osnovna_cena: osnovnaCena,
                konacna_cena: konacnaCena,
                kolicina,
                status: 'draft',
                verzija: parent.verzija + 1,
                parent_id: parentId
            }])
            .select()
            .single();
        if (error) throw error;
        return { success: true, data: result };
    } catch (err) {
        console.error('Greška pri izmeni kalkulacije:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Učitava sve verzije jedne kalkulacije
 * @param {Number} kalkulacijaId - ID bilo koje verzije
 * @returns {Array} - Sve verzije sortirane po verziji
 */
export async function ucitajVerzije(kalkulacijaId) {
    try {
        // Prvo nađi root (originalnu) kalkulaciju
        const { data: trenutna } = await supabase
            .from('kalkulacije')
            .select('*')
            .eq('id', kalkulacijaId)
            .single();
        if (!trenutna) return { success: false, error: 'Kalkulacija ne postoji' };
        // Nađi root ID (ili je trenutna root, ili ima parent_id koji vodi do root-a)
        let rootId = trenutna.parent_id || trenutna.id;
        // Učitaj sve verzije
        const { data: verzije, error } = await supabase
            .from('kalkulacije')
            .select('*')
            .or(`id.eq.${rootId},parent_id.eq.${rootId}`)
            .order('verzija', { ascending: true });
        if (error) throw error;
        return { success: true, data: verzije };
    } catch (err) {
        console.error('Greška pri učitavanju verzija:', err);
        return { success: false, error: err.message };
    }
}

// Upis u `ponude` otporan na nepostojeće kolone: PostgREST u grešci navede ime kolone koje nema
// ("Could not find the 'X' column of 'ponude'..." ili 'column "X" ... does not exist') → izbacimo je i probamo opet.
async function insertPonudaRobustno(red) {
    const payload = { ...red };
    for (let i = 0; i < 25; i++) {
        const { data, error } = await supabase.from('ponude').insert([payload]).select().single();
        if (!error) return { data };
        const poruka = [error.message, error.details, error.hint].filter(Boolean).join(' ');
        const m = poruka.match(/'([^']+)' column|column "([^"]+)"|the '([^']+)' column|find the '([^']+)'/i);
        const kol = m && (m[1] || m[2] || m[3] || m[4]);
        if (kol && Object.prototype.hasOwnProperty.call(payload, kol)) { delete payload[kol]; continue; }
        return { error }; // greška nije zbog kolone → prosledi dalje
    }
    return { error: { message: 'Upis ponude nije uspeo ni posle izbacivanja nepoznatih kolona.' } };
}

// Gurne sve ponude koje su (zbog nedostupne baze) ostale samo lokalno u ZAJEDNIČKU bazu,
// da ih vide SVI korisnici. Uspešno prebačene briše iz lokalnog bafera. Pozива se pri otvaranju liste.
export async function sinhronizujLokalnePonude() {
    let lok;
    try { lok = JSON.parse(localStorage.getItem('maropack_local_ponude') || '[]'); } catch { lok = []; }
    if (!Array.isArray(lok) || !lok.length) return { synced: 0, ostalo: 0 };
    const preostale = [];
    let synced = 0;
    for (const p of lok) {
        const { id, _lokalno, _needsSync, ...red } = p || {};   // lokalni id/oznake ne idu u bazu
        try {
            const { error } = await insertPonudaRobustno(red);
            if (error) preostale.push(p); else synced++;
        } catch (e) { preostale.push(p); }
    }
    try { localStorage.setItem('maropack_local_ponude', JSON.stringify(preostale)); } catch (e) { }
    return { synced, ostalo: preostale.length };
}

export async function kreirajPonuduIzKalkulacije(kalkulacija) {
    try {
        console.log('🎯 Kreiram ponudu iz kalkulacije:', kalkulacija);

        const template = extractTemplate(kalkulacija);
        const tip = normalizeTip(kalkulacija.tip || template?.tip);
        // VAŽNO: sačuvano polje je "rezultati" (množina). Ranije se čitalo "rezultat"/"res" → cena je bila 0.
        const rez = kalkulacija.rezultati || kalkulacija.rezultat || kalkulacija.res || {};
        // Količina: folija = broj (×1000m), kesa = komada, špulna = špulni.
        const kolicina = Number(kalkulacija.kolicina ?? kalkulacija.kol ?? rez.kolicina ?? kalkulacija.nalog ?? template?.data?.porucenaKolicina ?? 0) || 0;
        // Cena po JEDINICI (folija: /1000m, kesa: /kom, špulna: /špulni).
        const cena = Number(
            kalkulacija.konacna_cena ?? kalkulacija.konacnaCena ??
            rez.konacnaCena ?? rez.saMarza ?? rez.saMarzom ?? rez.cena1000 ?? rez.cenaSaMarzom ??
            kalkulacija.cena_kg ?? 0
        ) || 0;
        // Ukupno = sačuvani total ako postoji, inače cena × količina (BEZ /1000 — to je bila greška za kese/špulne).
        const ukupno = Number(rez.ukupnoNalog ?? kalkulacija.ukupno_nalog ?? (cena * kolicina)) || 0;

        const ponuda = {
            broj: 'MP-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000),
            datum: new Date().toLocaleDateString('sr-RS'),
            vaz: new Date(Date.now() + 30 * 24 * 3600000).toLocaleDateString('sr-RS'),
            kupac: kalkulacija.kupac || kalkulacija.klijent || template?.kupac,
            naziv: kalkulacija.naziv || template?.naziv,
            proizvod: kalkulacija.naziv || template?.naziv,
            tip,
            tip_proizvoda: tip,
            kol: kolicina,
            kolicina: kolicina,
            c1: cena,
            cena: cena,
            konacna_cena: cena,
            cena_ukorak: cena,
            uk: ukupno,
            cena_ukupno: ukupno,
            mats: kalkulacija.materijali || kalkulacija.mats || template?.data?.[tip]?.layers || template?.data?.layers || [],
            kalkulacija_id: kalkulacija.id || kalkulacija.kalkulacija_id || null,
            template_id: template?.id || kalkulacija.template_id || kalkulacija.product_template_id || null,
            product_template_id: template?.id || kalkulacija.product_template_id || kalkulacija.template_id || null,
            template,
            product_template: template,
            kalkulacija_payload: kalkulacija,
            // Rezerva: sve bitno i u jsonb 'podaci' (koji tabela skoro sigurno ima) — ako pojedine
            // kolone gore ne postoje pa ih robustni upis izbaci, podaci ostaju sačuvani.
            podaci: {
                kalkulacija_id: kalkulacija.id || null,
                template_id: template?.id || kalkulacija.template_id || null,
                kolicina, cena_jedinicna: cena, vrednost: ukupno,
                materijali: kalkulacija.materijali || kalkulacija.mats || [],
                rezultati: rez, izvor: 'kalkulacija',
            },
            status: 'Aktivna',
            jez: 'sr',
            ko: 'Admin',
            res: kalkulacija.rezultat || kalkulacija.res,
            struktura: kalkulacija.data || kalkulacija.rezultat || kalkulacija.res
        };
        Object.assign(ponuda, buildOrderSourcePack({ ponuda, tipOperacije: 'ponuda', tipProizvoda: tip }));

        // ROBUSTAN UPIS: ako tabela `ponude` nema neku kolonu (npr. template, kalkulacija_payload,
        // struktura, res, vaz, mats…), PostgREST odbije CEO upis i ponuda se ne sačuva → „nigde se ne vidi".
        // Zato: izbacimo kolonu koju baza prijavi kao nepoznatu i pokušamo ponovo, dok upis ne prođe.
        const { data: novaPonuda, error: ponudaError } = await insertPonudaRobustno(ponuda);

        if (ponudaError) {
            console.error('❌ Greška pri kreiranju ponude:', ponudaError);
            throw ponudaError;
        }

        console.log('✅ Ponuda kreirana:', novaPonuda);
        return { success: true, data: novaPonuda };

    } catch (err) {
        console.error('💥 Exception:', err);

        // Lokalni fallback za template/dev režim kada Supabase/RLS tabela nije spremna
        const fallbackTemplate = extractTemplate(kalkulacija);
        const fallbackTip = normalizeTip(kalkulacija.tip || fallbackTemplate?.tip);
        const rezF = kalkulacija.rezultati || kalkulacija.rezultat || kalkulacija.res || {};
        const kolF = Number(kalkulacija.kolicina ?? kalkulacija.kol ?? rezF.kolicina ?? kalkulacija.nalog ?? fallbackTemplate?.data?.porucenaKolicina ?? 0) || 0;
        const cenaF = Number(kalkulacija.konacna_cena ?? kalkulacija.konacnaCena ?? rezF.konacnaCena ?? rezF.saMarza ?? rezF.cena1000 ?? kalkulacija.cena_kg ?? 0) || 0;
        const ukF = Number(rezF.ukupnoNalog ?? kalkulacija.ukupno_nalog ?? (cenaF * kolF)) || 0;
        const fallbackPonuda = {
            id: 'PON-KAL-' + Date.now(),
            broj: 'MP-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000),
            datum: new Date().toLocaleDateString('sr-RS'),
            kupac: kalkulacija.kupac || kalkulacija.klijent || fallbackTemplate?.kupac || '',
            naziv: kalkulacija.naziv || fallbackTemplate?.naziv,
            tip: fallbackTip,
            kol: kolF,
            c1: cenaF,
            uk: ukF,
            mats: kalkulacija.materijali || kalkulacija.mats || fallbackTemplate?.data?.[fallbackTip]?.layers || [],
            kalkulacija_id: kalkulacija.id || null,
            template_id: fallbackTemplate?.id || kalkulacija.template_id || null,
            product_template_id: fallbackTemplate?.id || kalkulacija.product_template_id || null,
            template: fallbackTemplate,
            product_template: fallbackTemplate,
            kalkulacija_payload: kalkulacija,
            status: 'Draft iz kalkulacije',
            res: kalkulacija.rezultat || kalkulacija.res || null,
            nap: 'Lokalna ponuda kreirana iz kalkulacije/template-a'
        };
        Object.assign(fallbackPonuda, buildOrderSourcePack({ ponuda: fallbackPonuda, tipOperacije: 'ponuda', tipProizvoda: fallbackTip }));
        // VAŽNO: PonudePRO čita 'maropack_local_ponude' (readLocalPonude). Ranije se pisalo u
        // 'maropack_template_ponude' → lokalna ponuda se nije nigde videla. Sad pišemo u ISPRAVAN ključ.
        fallbackPonuda._lokalno = true;
        fallbackPonuda._needsSync = true;
        const existing = JSON.parse(localStorage.getItem('maropack_local_ponude') || '[]');
        localStorage.setItem('maropack_local_ponude', JSON.stringify([fallbackPonuda, ...existing]));
        return {
            success: true, data: fallbackPonuda, fallback: true,
            poruka: 'Baza trenutno nije dostupna — ponuda je sačuvana lokalno i biće automatski poslata svima čim se veza vrati (pri sledećem otvaranju liste ponuda).',
        };
    }
}

/**
 * Preuzima kalkulaciju po ID-u
 * @param {Number} id - ID kalkulacije
 * @returns {Object} - Kalkulacija
 */
export async function ucitajKalkulaciju(id) {
    try {
        const { data, error } = await supabase
            .from('kalkulacije')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error('Greška pri učitavanju:', err);
        return { success: false, error: err.message };
    }
}