import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';

const AuthContext = createContext({});

// Razmaci (ms) za ponovne pokušaje početne provere sesije kada padne zbog MREŽE
// (Supabase spor / privremeno nedostupan) — da NE izbacimo korisnika na Login
// zbog prolaznog problema. Tek posle svih pokušaja puštamo UI.
const SESSION_RETRY = [600, 1500, 3000];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const mounted = useRef(true);
  const currentUserId = useRef(null);   // da profil NE učitavamo na svaki refresh tokena
  const profileLoading = useRef(false);

  useEffect(() => {
    mounted.current = true;

    // ── 1) POČETNA PROVERA SESIJE (sa ponovnim pokušajima) ──────────────────
    // Ranije: supabase.auth.getSession().then(...) BEZ .catch — ako getSession
    // padne (mreža/Supabase spor), nije bilo oporavka, a UI bi ostao da visi ili
    // pao na Login iako sesija postoji u storage-u. Sada: pokušaj ponovo, pa tek
    // onda pusti UI (onAuthStateChange će ispraviti kad mreža dođe).
    (async function initSession(attempt = 0) {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted.current) return;
        if (error) throw error;
        applySession(data && data.session ? data.session : null);
      } catch (err) {
        if (attempt < SESSION_RETRY.length) {
          setTimeout(() => { if (mounted.current) initSession(attempt + 1); }, SESSION_RETRY[attempt]);
        } else {
          console.error('getSession nije uspeo posle više pokušaja:', (err && err.message) || err);
          if (mounted.current) setLoading(false);
        }
      }
    })();

    // ── 2) PROMENE AUTH STANJA ──────────────────────────────────────────────
    // VAŽNO (Supabase pravilo): u OVOM callback-u se NE SME pozivati nijedna
    // supabase.auth.* metoda (getSession/refreshSession/signOut/getUser…), jer
    // koristi isti auth-lock → deadlock. Posledica ranije greške: „Odjava" (koja
    // zove supabase.auth.signOut()) nikad ne bi završila. Zato je callback SINHRON:
    // samo ažurira state; sve DB/auth pozive odlažemo sa setTimeout(0) (van lock-a).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted.current) return;
      const u = (session && session.user) ? session.user : null;
      // SIGNED_OUT / nema sesije → očisti. (SIGNED_OUT stiže samo na pravu odjavu ili
      // kad token zaista više ne može da se obnovi — u oba slučaja treba izaći.)
      if (!u) { hardClear(); return; }
      setUser(u);
      if (currentUserId.current === u.id) { setLoading(false); return; } // isti korisnik, samo osvežen token
      currentUserId.current = u.id;
      setTimeout(() => { if (mounted.current) loadUserProfile(u.id); }, 0);
    });

    // ── 3) PROAKTIVNO OSVEŽAVANJE PRI POVRATKU U APP ────────────────────────
    // Glavna zaštita od „mirovao sam pa me izbacilo": kad se tab ponovo vidi,
    // kad se vrati fokus ili mreža — obnovi token ODMAH, umesto da se istekli
    // token tretira kao odjava.
    function osveziSesiju() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      supabase.auth.getSession()
        .then(({ data }) => { if (mounted.current && data && data.session) applySession(data.session); })
        .catch(() => {});
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', osveziSesiju);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', osveziSesiju);
      window.addEventListener('focus', osveziSesiju);
    }

    return () => {
      mounted.current = false;
      if (subscription && subscription.unsubscribe) subscription.unsubscribe();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', osveziSesiju);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', osveziSesiju);
        window.removeEventListener('focus', osveziSesiju);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Primeni sesiju na state. Profil učitavamo SAMO kad se korisnik STVARNO promeni,
  // a NE na svaki TOKEN_REFRESHED (koji stiže ~na sat vremena i na fokus) — tako
  // nema nepotrebnog treperenja ni DB upita, i sesija ostaje mirna.
  function applySession(session) {
    const u = (session && session.user) ? session.user : null;
    setUser(u);
    if (!u) { hardClear(); return; }
    if (currentUserId.current === u.id) { setLoading(false); return; } // isti korisnik, samo osvežen token
    currentUserId.current = u.id;
    loadUserProfile(u.id);
  }

  function hardClear() {
    currentUserId.current = null;
    if (mounted.current) { setUser(null); setUserProfile(null); setLoading(false); }
  }

  async function loadUserProfile(userId) {
    if (profileLoading.current) return;
    profileLoading.current = true;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Profil ne postoji — napravi ga.
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: newProfile, error: insertError } = await supabase
            .from('users')
            .insert([{
              id: user.id,
              email: user.email,
              ime: user.email.split('@')[0],
              uloga: 'radnik',
              aktivan: true
            }])
            .select()
            .single();

          if (!insertError && mounted.current) {
            setUserProfile(newProfile);
          }
        }
      } else if (!error && mounted.current) {
        setUserProfile(data);
      } else if (error) {
        // DB upit pao (npr. Supabase preopterećen). NE diramo sesiju/korisnika —
        // zadržavamo trenutni profil i ostajemo ulogovani; profil se osveži sledeći put.
        console.error('Profil nije učitan (zadržavam sesiju):', (error && error.message) || error);
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    } finally {
      profileLoading.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    // Lokalno očisti stanje ODMAH (ne čekamo mrežu) — da se odjava uvek desi,
    // a supabase.auth.signOut() nek završi svoj posao u pozadini.
    hardClear();
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // i ako mrežni poziv padne, stanje je već očišćeno
    }
  }

  const userRole = userProfile?.uloga || null;
  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager' || isAdmin;
  const isMagacioner = userRole === 'magacioner';

  function canEdit(resource) {
    if (isAdmin || isManager) return true;
    return false;
  }

  const value = {
    user,
    userProfile,
    loading,
    signIn,
    signOut,
    isAdmin,
    isManager,
    isMagacioner,
    userRole,
    canEdit,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
