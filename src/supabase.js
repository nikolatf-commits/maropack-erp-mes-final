// supabase.js - Supabase konfiguracija sa lokalnim fallback režimom
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

function ok(data = []) { return Promise.resolve({ data, error: null }); }
function makeQuery(data = []) {
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
    range: () => q,
    limit: () => q,
    order: () => q,
    single: () => Promise.resolve({ data: data[0] || null, error: data[0] ? null : { code: 'PGRST116', message: 'Local demo: no row' } }),
    then: (resolve) => ok(data).then(resolve)
  };
  return q;
}

function createLocalSupabaseMock() {
  console.warn('⚠️ Supabase nije podešen. Aplikacija radi u lokalnom demo režimu preko localStorage-a.');
  return {
    __localDemo: true,
    from(table) {
      let rows = [];
      try {
        const db = JSON.parse(window.localStorage.getItem('maropack_db') || '{}');
        rows = Array.isArray(db[table]) ? db[table] : [];
      } catch (_) {}
      return makeQuery(rows);
    },
    rpc() { return Promise.resolve({ data: null, error: { message: 'RPC nije dostupan u lokalnom demo režimu.' } }); },
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
    removeChannel() {},
    storage: { from() { return { upload: () => Promise.resolve({ error: null }), getPublicUrl: (path) => ({ data: { publicUrl: path } }) }; } },
    auth: {
      async getSession() { return { data: { session: { user: { id: 'local-admin', email: 'admin@local.demo' } } }, error: null }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
      async getUser() { return { data: { user: { id: 'local-admin', email: 'admin@local.demo' } }, error: null }; },
      async signInWithPassword({ email }) { return { data: { user: { id: 'local-admin', email: email || 'admin@local.demo' } }, error: null }; },
      async signOut() { return { error: null }; }
    }
  };
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && isValidUrl(supabaseUrl) && isValidKey(supabaseAnonKey));
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : createLocalSupabaseMock();
