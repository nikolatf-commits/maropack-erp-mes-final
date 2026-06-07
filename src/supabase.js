// supabase.js - produkciona Supabase konfiguracija BEZ demo/localStorage fallback režima
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function isValidKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (key.startsWith('eyJ')) return !key.includes(' ') && key.split('.').length === 3;
  if (key.startsWith('sb_publishable_')) return key.length > 20;
  return false;
}

function isValidUrl(url) {
  return typeof url === 'string' && url.startsWith('https://') && url.includes('.supabase.co');
}

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && isValidUrl(supabaseUrl) && isValidKey(supabaseAnonKey)
);

function notConfiguredError() {
  return {
    message: 'Supabase nije podešen. Postavi VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY u .env / Vercel Environment Variables.',
    code: 'SUPABASE_NOT_CONFIGURED'
  };
}

function makeDisabledQuery() {
  const q = {
    select: () => q,
    insert: () => q,
    update: () => q,
    delete: () => q,
    upsert: () => q,
    eq: () => q,
    neq: () => q,
    in: () => q,
    ilike: () => q,
    or: () => q,
    gte: () => q,
    lte: () => q,
    not: () => q,
    range: () => q,
    limit: () => q,
    order: () => q,
    single: () => Promise.resolve({ data: null, error: notConfiguredError() }),
    maybeSingle: () => Promise.resolve({ data: null, error: notConfiguredError() }),
    then: (resolve) => Promise.resolve({ data: null, error: notConfiguredError() }).then(resolve)
  };
  return q;
}

function createDisabledSupabaseClient() {
  console.error('Supabase nije podešen. aplikacija mora koristiti pravu bazu.');
  return {
    __notConfigured: true,
    from() { return makeDisabledQuery(); },
    rpc() { return Promise.resolve({ data: null, error: notConfiguredError() }); },
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
    removeChannel() {},
    storage: { from() { return { upload: () => Promise.resolve({ data: null, error: notConfiguredError() }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }; } },
    auth: {
      async getSession() { return { data: { session: null }, error: notConfiguredError() }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
      async getUser() { return { data: { user: null }, error: notConfiguredError() }; },
      async signInWithPassword() { return { data: null, error: notConfiguredError() }; },
      async signOut() { return { error: null }; }
    }
  };
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createDisabledSupabaseClient();
