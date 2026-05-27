import { supabase } from '../supabase.js';

// ==========================================
// RADNIK FUNKCIJE
// ==========================================

/**
 * Login radnika - po QR kodu ili imenu
 */
export const getRadnikByQR = async (qrCode) => {
    const { data, error } = await supabase
        .from('radnici')
        .select('*')
        .eq('qr_code', qrCode)
        .eq('aktivan', true)
        .single();

    if (error) throw error;
    return data;
};

export const getRadnikByIme = async (ime) => {
    const { data, error } = await supabase
        .from('radnici')
        .select('*')
        .ilike('ime', `%${ime}%`)
        .eq('aktivan', true)
        .limit(10);

    if (error) throw error;
    return data;
};

/**
 * Kreiranje novog radnika (ako ne postoji)
 */
export const createRadnik = async (ime, prezime) => {
    const { data, error } = await supabase
        .from('radnici')
        .insert([{ ime, prezime, aktivan: true }])
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Dobij nalog po QR kodu
 */
export const getNalogByQR = async (qrCode) => {
    const { data, error } = await supabase
        .from('nalozi')
        .select('*')
        .eq('qr_code', qrCode)
        .single();

    if (error) throw error;
    return data;
};

/**
 * Dobij nalog po broju
 */
export const getNalogByBroj = async (brojNaloga) => {
    const { data, error } = await supabase
        .from('nalozi')
        .select('*')
        .eq('broj_naloga', brojNaloga)
        .single();

    if (error) throw error;
    return data;
};

/**
 * Dobij sve faze za nalog
 */
export const getFazeByNalog = async (nalogId) => {
    const { data, error } = await supabase
        .from('faze_proizvodnje')
        .select('*')
        .eq('nalog_id', nalogId)
        .order('redosled', { ascending: true });

    if (error) throw error;
    return data;
};

/**
 * Pokreni fazu
 */
export const pokreniFazu = async (fazaId, radnikId, radnikIme) => {
    const { data, error } = await supabase
        .from('faze_proizvodnje')
        .update({
            status: 'U_TOKU',
            radnik_id: radnikId,
            radnik_ime: radnikIme,
            vreme_pocetka: new Date().toISOString(),
        })
        .eq('id', fazaId)
        .select()
        .single();

    if (error) throw error;

    // Ažuriraj status naloga na U_PROIZVODNJI
    const faza = data;
    await supabase
        .from('nalozi')
        .update({ status: 'U_PROIZVODNJI' })
        .eq('id', faza.nalog_id);

    return data;
};

/**
 * Dodaj zastoj
 */
export const dodajZastoj = async (fazaId, kategorijaRazloga, detaljRazloga, komentar = null) => {
    const { data, error } = await supabase
        .from('zastoji')
        .insert([{
            faza_id: fazaId,
            razlog_kategorija: kategorijaRazloga,
            razlog_detalj: detaljRazloga,
            vreme_pocetka: new Date().toISOString(),
            komentar: komentar
        }])
        .select()
        .single();

    if (error) throw error;

    // Ažuriraj broj zaustavljanja u fazi
    await supabase.rpc('increment_zastoji', { faza_id: fazaId });

    return data;
};

/**
 * Završi zastoj
 */
export const zavrsiZastoj = async (zastojId) => {
    const vremeKraja = new Date().toISOString();

    // Dobij zastoj podatke
    const { data: zastoj } = await supabase
        .from('zastoji')
        .select('*')
        .eq('id', zastojId)
        .single();

    if (!zastoj) throw new Error('Zastoj ne postoji');

    // Izračunaj trajanje
    const pocetakMs = new Date(zastoj.vreme_pocetka).getTime();
    const krajMs = new Date(vremeKraja).getTime();
    const trajanjeMinuta = Math.round((krajMs - pocetakMs) / 60000);

    // Ažuriraj zastoj
    const { data, error } = await supabase
        .from('zastoji')
        .update({
            vreme_kraja: vremeKraja,
            trajanje_minuta: trajanjeMinuta
        })
        .eq('id', zastojId)
        .select()
        .single();

    if (error) throw error;

    // Ažuriraj ukupno zastoja u fazi
    const { data: faza } = await supabase
        .from('faze_proizvodnje')
        .select('ukupno_zaustavljanja_minuta')
        .eq('id', zastoj.faza_id)
        .single();

    const novoUkupno = (faza?.ukupno_zaustavljanja_minuta || 0) + trajanjeMinuta;

    await supabase
        .from('faze_proizvodnje')
        .update({ ukupno_zaustavljanja_minuta: novoUkupno })
        .eq('id', zastoj.faza_id);

    return data;
};

/**
 * Završi fazu
 */
export const zavrsiFazu = async (fazaId, proizvedeno, skart, napomena = null) => {
    const vremeKraja = new Date().toISOString();

    // Dobij fazu
    const { data: faza } = await supabase
        .from('faze_proizvodnje')
        .select('*')
        .eq('id', fazaId)
        .single();

    if (!faza) throw new Error('Faza ne postoji');

    // Izračunaj trajanje
    const pocetakMs = new Date(faza.vreme_pocetka).getTime();
    const krajMs = new Date(vremeKraja).getTime();
    const trajanjeMinuta = Math.round((krajMs - pocetakMs) / 60000);

    // Izračunaj škart procenat
    const skartProcenat = proizvedeno > 0 ? ((skart / proizvedeno) * 100).toFixed(2) : 0;

    // Ažuriraj fazu
    const { data, error } = await supabase
        .from('faze_proizvodnje')
        .update({
            status: 'ZAVRSENO',
            vreme_kraja: vremeKraja,
            trajanje_minuta: trajanjeMinuta,
            proizvedeno_kolicina: proizvedeno,
            skart_kolicina: skart,
            skart_procenat: parseFloat(skartProcenat),
            napomena: napomena
        })
        .eq('id', fazaId)
        .select()
        .single();

    if (error) throw error;

    // Proveri da li je ovo poslednja faza
    const { data: sveFaze } = await supabase
        .from('faze_proizvodnje')
        .select('*')
        .eq('nalog_id', faza.nalog_id)
        .order('redosled', { ascending: true });

    const poslednaFaza = sveFaze[sveFaze.length - 1];
    const sveFazeZavrsene = sveFaze.every(f => f.status === 'ZAVRSENO');

    return {
        faza: data,
        jePosljednjaFaza: poslednaFaza.id === fazaId,
        sveFazeZavrsene: sveFazeZavrsene,
        nalogId: faza.nalog_id
    };
};

/**
 * Pošalji u magacin (nakon poslednje faze)
 */
export const posaljiUMagacin = async (nalogId, kolicina, brojPaleta, brojKutija, radnikId, radnikIme, napomena = null) => {
    // Dobij nalog
    const { data: nalog } = await supabase
        .from('nalozi')
        .select('*')
        .eq('id', nalogId)
        .single();

    if (!nalog) throw new Error('Nalog ne postoji');

    // Kreiraj zapis u magacinu
    const { data, error } = await supabase
        .from('magacin_gotovi_proizvodi')
        .insert([{
            nalog_id: nalogId,
            nalog_broj: nalog.broj_naloga,
            proizvod_naziv: nalog.naziv_proizvoda,
            tip_proizvoda: nalog.tip_proizvoda,
            kolicina: kolicina,
            broj_paleta: brojPaleta,
            broj_kutija: brojKutija,
            status: 'CEKA_PREUZIMANJE',
            datum_proizvodnje: new Date().toISOString(),
            radnik_proizvodnja_id: radnikId,
            radnik_proizvodnja_ime: radnikIme,
            napomena_proizvodnja: napomena
        }])
        .select()
        .single();

    if (error) throw error;

    // Ažuriraj status naloga
    await supabase
        .from('nalozi')
        .update({ status: 'ZAVRSENO_CEKA_MAGACIN' })
        .eq('id', nalogId);

    return data;
};

// ==========================================
// MAGACIN FUNKCIJE
// ==========================================

/**
 * Dobij sve proizvode koji čekaju preuzimanje
 */
export const getMagacinCekaLista = async () => {
    const { data, error } = await supabase
        .from('magacin_gotovi_proizvodi')
        .select('*')
        .eq('status', 'CEKA_PREUZIMANJE')
        .order('datum_proizvodnje', { ascending: true });

    if (error) throw error;
    return data;
};

/**
 * Smesti proizvod u magacin
 */
export const smestiProizvod = async (proizvodId, sektor, red, polica, radnikId, radnikIme, napomena = null) => {
    const lokacija = `${red}-${polica}`; // npr. B2-3
    const datumSmestanja = new Date().toISOString();

    // Dobij proizvod
    const { data: proizvod } = await supabase
        .from('magacin_gotovi_proizvodi')
        .select('*')
        .eq('id', proizvodId)
        .single();

    if (!proizvod) throw new Error('Proizvod ne postoji');

    // Kreiraj istoriju
    const novaIstorija = [
        ...(proizvod.istorija_lokacija || []),
        {
            lokacija: lokacija,
            datum: datumSmestanja,
            radnik: radnikIme,
            razlog: 'Početno smeštanje'
        }
    ];

    // Ažuriraj proizvod
    const { data, error } = await supabase
        .from('magacin_gotovi_proizvodi')
        .update({
            status: 'U_MAGACINU',
            lokacija: lokacija,
            sektor: sektor,
            red: red,
            polica: polica,
            datum_smestanja: datumSmestanja,
            radnik_magacin_id: radnikId,
            radnik_magacin_ime: radnikIme,
            napomena_magacin: napomena,
            istorija_lokacija: novaIstorija
        })
        .eq('id', proizvodId)
        .select()
        .single();

    if (error) throw error;

    // Ažuriraj status naloga
    if (proizvod.nalog_id) {
        await supabase
            .from('nalozi')
            .update({ status: 'U_MAGACINU' })
            .eq('id', proizvod.nalog_id);
    }

    return data;
};

/**
 * Dobij sve proizvode u magacinu
 */
export const getMagacinSviProizvodi = async () => {
    const { data, error } = await supabase
        .from('magacin_gotovi_proizvodi')
        .select('*')
        .eq('status', 'U_MAGACINU')
        .order('datum_smestanja', { ascending: false });

    if (error) throw error;
    return data;
};

/**
 * Promeni lokaciju proizvoda
 */
export const promeniLokaciju = async (proizvodId, noviSektor, noviRed, novaPolica, radnikIme, razlog) => {
    const novaLokacija = `${noviRed}-${novaPolica}`;
    const datum = new Date().toISOString();

    // Dobij proizvod
    const { data: proizvod } = await supabase
        .from('magacin_gotovi_proizvodi')
        .select('*')
        .eq('id', proizvodId)
        .single();

    if (!proizvod) throw new Error('Proizvod ne postoji');

    // Dodaj u istoriju
    const novaIstorija = [
        ...(proizvod.istorija_lokacija || []),
        {
            lokacija: novaLokacija,
            datum: datum,
            radnik: radnikIme,
            razlog: razlog
        }
    ];

    // Ažuriraj proizvod
    const { data, error } = await supabase
        .from('magacin_gotovi_proizvodi')
        .update({
            lokacija: novaLokacija,
            sektor: noviSektor,
            red: noviRed,
            polica: novaPolica,
            razlog_premestanja: razlog,
            istorija_lokacija: novaIstorija
        })
        .eq('id', proizvodId)
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Izdaj sa lagera
 */
export const izdajSaLagera = async (proizvodId, kolicina, radnikIme, napomena = null) => {
    const { data, error } = await supabase
        .from('magacin_gotovi_proizvodi')
        .update({
            status: 'IZDATO',
            datum_izdavanja: new Date().toISOString(),
            kolicina: kolicina, // ažurirana količina
            napomena_magacin: napomena
        })
        .eq('id', proizvodId)
        .select()
        .single();

    if (error) throw error;

    // Ažuriraj status naloga
    const { data: proizvod } = await supabase
        .from('magacin_gotovi_proizvodi')
        .select('nalog_id')
        .eq('id', proizvodId)
        .single();

    if (proizvod?.nalog_id) {
        await supabase
            .from('nalozi')
            .update({ status: 'ISPORUCENO' })
            .eq('id', proizvod.nalog_id);
    }

    return data;
};

/**
 * Real-time subscription za magacin listu
 */
export const subscribeMagacinCeka = (callback) => {
    const subscription = supabase
        .channel('magacin_ceka')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'magacin_gotovi_proizvodi',
                filter: 'status=eq.CEKA_PREUZIMANJE'
            },
            (payload) => {
                callback(payload);
            }
        )
        .subscribe();

    return subscription;
};
