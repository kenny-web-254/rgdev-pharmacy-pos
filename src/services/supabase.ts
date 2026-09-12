import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variable extraction supporting Vite client and runtime injection
const envUrl = (import.meta.env.VITE_SUPABASE_URL ||
  (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : '') ||
  '') as string;

const envAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ||
  (typeof process !== 'undefined' ? process.env?.SUPABASE_ANON_KEY : '') ||
  '') as string;

let supabaseInstance: SupabaseClient | null = null;

export const supabaseConfig = {
  getUrl(): string {
    return envUrl || localStorage.getItem('pharmapos_supabase_url') || '';
  },
  getAnonKey(): string {
    return envAnonKey || localStorage.getItem('pharmapos_supabase_anon_key') || '';
  },
  isConfigured(): boolean {
    const url = this.getUrl();
    const key = this.getAnonKey();
    return Boolean(url && key && url.startsWith('https://'));
  },
  setCredentials(url: string, anonKey: string) {
    if (url) localStorage.setItem('pharmapos_supabase_url', url.trim());
    if (anonKey) localStorage.setItem('pharmapos_supabase_anon_key', anonKey.trim());
    supabaseInstance = null; // reset client to re-instantiate
  },
  clearCredentials() {
    localStorage.removeItem('pharmapos_supabase_url');
    localStorage.removeItem('pharmapos_supabase_anon_key');
    supabaseInstance = null;
  },
};

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfig.isConfigured()) {
    return null;
  }
  if (!supabaseInstance) {
    const url = supabaseConfig.getUrl();
    const anonKey = supabaseConfig.getAnonKey();
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return supabaseInstance;
}

export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  const client = getSupabase();
  if (!client) {
    return {
      ok: false,
      message: 'Supabase credentials are not configured yet. Please provide SUPABASE_URL and SUPABASE_ANON_KEY.',
    };
  }

  try {
    const { error } = await client.from('medications').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') {
        return {
          ok: false,
          message: 'Connected to Supabase, but the tables have not been created yet. Please execute supabase/schema.sql in the SQL Editor.',
        };
      }
      return {
        ok: false,
        message: `Supabase query error: ${error.message} (${error.code || 'UNKNOWN'})`,
      };
    }
    return {
      ok: true,
      message: 'Successfully connected to Supabase database!',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Connection failed: ${message}`,
    };
  }
}

// ------------------------------------------------------------------
// Realtime sync
// ------------------------------------------------------------------
// Tables that other clients (admin/clinician/cashier on other devices)
// can change and that should trigger a live refresh in this session.
export type RealtimeTable = 'medications' | 'prescriptions' | 'tests' | 'sale_transactions';

let activeChannel: ReturnType<SupabaseClient['channel']> | null = null;

/**
 * Subscribes to Postgres change events (INSERT/UPDATE/DELETE) on the given
 * tables via a single Supabase Realtime channel, invoking `onChange` with
 * the affected table name whenever a change arrives. Returns an unsubscribe
 * function. Safe to call even when Supabase isn't configured (no-ops).
 */
export function subscribeToRealtimeChanges(
  tables: RealtimeTable[],
  onChange: (table: RealtimeTable) => void
): () => void {
  const client = getSupabase();
  if (!client) {
    return () => {};
  }

  // Tear down any previous channel before creating a new one
  if (activeChannel) {
    client.removeChannel(activeChannel);
    activeChannel = null;
  }

  let channel = client.channel('pharmapos-realtime-sync');
  for (const table of tables) {
    channel = channel.on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table },
      () => onChange(table)
    );
  }
  channel.subscribe();
  activeChannel = channel;

  return () => {
    if (activeChannel) {
      client.removeChannel(activeChannel);
      activeChannel = null;
    }
  };
}
