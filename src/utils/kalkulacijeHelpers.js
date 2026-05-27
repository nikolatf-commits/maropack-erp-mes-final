import { supabase } from '../supabase';

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

export async function kreirajPonuduIzKalkulacije(kalkulacija) {
    try {
        console.log('🎯 Kreiram ponudu iz kalkulacije:', kalkulacija);

        const ponuda = {
            broj: 'MP-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000),
            datum: new Date().toLocaleDateString('sr-RS'),
            vaz: new Date(Date.now() + 30 * 24 * 3600000).toLocaleDateString('sr-RS'),
            kupac: kalkulacija.kupac || kalkulacija.klijent,
            naziv: kalkulacija.naziv,
            tip: kalkulacija.tip,
            kol: kalkulacija.kolicina || (kalkulacija.nalog * 1000),
            c1: kalkulacija.konacnaCena || kalkulacija.rezultat?.k1 || kalkulacija.res?.k1,
            uk: (kalkulacija.konacnaCena || kalkulacija.rezultat?.k1 || kalkulacija.res?.k1) * (kalkulacija.kolicina || (kalkulacija.nalog * 1000)) / 1000,
            mats: kalkulacija.materijali || kalkulacija.mats || [],
            kalkulacija_id: null,
            status: 'Aktivna',
            jez: 'sr',
            ko: 'Admin',
            res: kalkulacija.rezultat || kalkulacija.res,
            struktura: kalkulacija.data || kalkulacija.rezultat || kalkulacija.res
        };

        const { data: novaPonuda, error: ponudaError } = await supabase
            .from('ponude')
            .insert([ponuda])
            .select()
            .single();

        if (ponudaError) {
            console.error('❌ Greška pri kreiranju ponude:', ponudaError);
            throw ponudaError;
        }

        console.log('✅ Ponuda kreirana:', novaPonuda);
        return { success: true, data: novaPonuda };

    } catch (err) {
        console.error('💥 Exception:', err);

        // Lokalni fallback za template/dev režim kada Supabase/RLS tabela nije spremna
        const fallbackPonuda = {
            id: 'PON-KAL-' + Date.now(),
            broj: 'MP-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000),
            datum: new Date().toLocaleDateString('sr-RS'),
            kupac: kalkulacija.kupac || kalkulacija.klijent || '',
            naziv: kalkulacija.naziv,
            tip: kalkulacija.tip,
            kol: kalkulacija.kolicina || 0,
            c1: kalkulacija.konacna_cena || kalkulacija.konacnaCena || 0,
            uk: kalkulacija.konacna_cena || kalkulacija.konacnaCena || 0,
            mats: kalkulacija.materijali || kalkulacija.mats || [],
            status: 'Draft iz kalkulacije',
            template: kalkulacija.template || kalkulacija.data || null,
            res: kalkulacija.rezultat || kalkulacija.res || null,
            nap: 'Lokalna ponuda kreirana iz kalkulacije/template-a'
        };
        const existing = JSON.parse(localStorage.getItem('maropack_template_ponude') || '[]');
        localStorage.setItem('maropack_template_ponude', JSON.stringify([fallbackPonuda, ...existing]));
        return { success: true, data: fallbackPonuda, fallback: true };
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