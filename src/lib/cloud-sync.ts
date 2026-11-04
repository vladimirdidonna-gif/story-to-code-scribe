import { supabase } from '@/integrations/supabase/client';
import { SyncOutbox, type Change } from './sync-outbox';

const shouldSkip = (k: string) => ['sb-', 'supabase.', '__registro_sync:', '__registro_history:'].some(p => k.startsWith(p));
const rawSet = typeof window !== 'undefined' ? Storage.prototype.setItem : null;
const rawRemove = typeof window !== 'undefined' ? Storage.prototype.removeItem : null;
const write = (k: string, v: string) => rawSet?.call(localStorage, k, v);
let journalReady: Promise<void> = Promise.resolve();
let journalWrite: Promise<void> = Promise.resolve();
const journalDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('registro-sync-outbox', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('pending');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const persistJournal = (key: string, value: string) => {
  journalWrite = journalWrite.catch(() => {}).then(async () => {
    const db = await journalDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pending', 'readwrite');
      tx.objectStore('pending').put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  });
};
let currentUser: string | null = null;
let outbox: SyncOutbox | null = null;
let flushing: Promise<boolean> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let patched = false;
let cleanup: (() => void) | null = null;
const known = new Map<string, string | null>();

function activate(userId: string) {
  if (currentUser === userId && outbox) return;
  currentUser = userId;
  known.clear();
  const key = `__registro_sync:${userId}`;
  const box = new SyncOutbox({ getItem: k => localStorage.getItem(k), setItem: persistJournal }, key);
  outbox = box;
  journalReady = (async () => {
    const db = await journalDb();
    const saved = await new Promise<string | undefined>((resolve, reject) => {
      const request = db.transaction('pending', 'readonly').objectStore('pending').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (saved) for (const [k, change] of JSON.parse(saved) as [string, Change][]) if (!box.entries.has(k)) box.entries.set(k, change);
  })();
}
function queue(k: string, value: string | null, shared = false) {
  if (!outbox || shouldSkip(k)) return;
  outbox.put(k, { value, base: known.get(k) ?? null, shared });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushNow(), 300);
}
function archive(k: string) {
  // A revision is a separate row, never an overwrite of the previous copy.
  return `__registro_history:${currentUser}:${crypto.randomUUID()}:${k}`;
}
async function send(k: string, change: Change, userId: string) {
  const read = change.shared ? supabase.from('registro_condiviso').select('v,updated_at').eq('k', k) : supabase.from('registro_dati').select('v,updated_at').eq('k', k).eq('user_id', userId);
  const { data, error } = await read.maybeSingle();
  if (error) throw error;
  const remote = data?.v ?? null;
  if (remote !== change.value && remote !== change.base) throw new Error('Conflitto: la copia salvata su un altro dispositivo è stata conservata.');
  if (remote !== change.value) {
    if (remote !== null) {
      const { error: historyError } = await supabase.from('registro_dati').insert({ user_id: userId, k: archive(k), v: remote });
      if (historyError) throw historyError;
    }
    if (data) {
      const result = change.shared
        ? change.value === null
          ? await supabase.from('registro_condiviso').delete().eq('k', k).eq('updated_at', data.updated_at).select('k')
          : await supabase.from('registro_condiviso').update({ v: change.value, updated_at: new Date().toISOString() }).eq('k', k).eq('updated_at', data.updated_at).select('k')
        : change.value === null
          ? await supabase.from('registro_dati').delete().eq('user_id', userId).eq('k', k).eq('updated_at', data.updated_at).select('k')
          : await supabase.from('registro_dati').update({ v: change.value, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('k', k).eq('updated_at', data.updated_at).select('k');
      const { data: changed, error: mutationError } = result;
      if (mutationError) throw mutationError;
      if (!changed?.length) throw new Error('Dati modificati da un altro dispositivo: modifica conservata in attesa.');
    } else if (change.value !== null) {
      const { error: insertError } = change.shared ? await supabase.from('registro_condiviso').insert({ k, v: change.value }) : await supabase.from('registro_dati').insert({ user_id: userId, k, v: change.value });
      if (insertError) throw insertError;
    }
  }
  const verify = change.shared ? supabase.from('registro_condiviso').select('v').eq('k', k) : supabase.from('registro_dati').select('v').eq('k', k).eq('user_id', userId);
  const { data: verified, error: verifyError } = await verify.maybeSingle();
  if (verifyError || (verified?.v ?? null) !== change.value) throw new Error('Salvataggio non verificato.');
  known.set(k, change.value);
}
export async function flushNow(): Promise<boolean> {
  if (timer) { clearTimeout(timer); timer = null; }
  if (flushing) { const ok = await flushing; return ok && outbox?.entries.size === 0; }
  try { await journalReady; await journalWrite; } catch { return false; }
  const box = outbox, userId = currentUser;
  if (!box || !userId) return false;
  flushing = (async () => {
    let ok = true;
    const entries = [...box.entries];
    for (let i = 0; i < entries.length; i += 10) {
      await Promise.all(entries.slice(i, i + 10).map(async ([k, change]) => {
        try { await send(k, change, userId); box.acknowledge(k, change); }
        catch { ok = false; }
      }));
    }
    try { await journalWrite; } catch { return false; }
    return ok && box.entries.size === 0;
  })();
  try { return await flushing; } finally { flushing = null; }
}
export async function hydrateFromCloud(userId: string): Promise<Set<string>> {
  activate(userId);
  await journalReady;
  const { data, error } = await supabase.from('registro_dati').select('k,v').eq('user_id', userId);
  if (error) throw new Error('Connessione non disponibile: i dati locali non sono stati sovrascritti.');
  const keys = new Set<string>();
  for (const row of data ?? []) {
    keys.add(row.k);
    if (shouldSkip(row.k)) continue;
    known.set(row.k, row.v);
    if (outbox?.entries.has(row.k) || row.v === null) continue;
    const previous = localStorage.getItem(row.k);
    if (previous !== null && previous !== row.v) write(`__registro_history:${userId}:${crypto.randomUUID()}:${row.k}`, previous);
    write(row.k, row.v);
    if (row.k.startsWith('ws:')) write(`priv:${row.k.slice(3)}`, row.v);
  }
  return keys;
}
export async function pushLocalToCloud(userId: string, cloudKeys?: Set<string>) {
  activate(userId);
  const owner = localStorage.getItem('__registro_sync:owner');
  // Never import a previous account's browser cache into a different account.
  if (!owner || owner === userId) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || shouldSkip(k) || cloudKeys?.has(k) || outbox?.entries.has(k)) continue;
      queue(k, localStorage.getItem(k));
    }
  }
  try { write('__registro_sync:owner', userId); } catch { /* never remove data for space */ }
  void flushNow();
  return true;
}
export function startCloudSync(userId: string, onRemote: () => void) {
  activate(userId);
  cleanup?.();
  if (!patched && rawSet && rawRemove) {
    patched = true;
    Storage.prototype.setItem = function(k, v) {
      if (this === localStorage && currentUser && !shouldSkip(String(k))) queue(String(k), String(v));
      try { rawSet.call(this, k, v); } catch (error) {
        if (this !== localStorage || !currentUser || shouldSkip(String(k))) throw error;
        // The durable journal preserves this write; do not evict another value.
      }
    };
    Storage.prototype.removeItem = function(k) {
      if (this === localStorage && currentUser && !shouldSkip(String(k))) {
        if (!window.confirm('Confermi l’eliminazione di questo dato?')) return;
        queue(String(k), null);
      }
      rawRemove.call(this, k);
    };
    Storage.prototype.clear = function() {
      if (this === localStorage) throw new Error('Eliminazione automatica dei dati non consentita.');
      for (const k of Object.keys(this)) rawRemove.call(this, k);
    };
  }
  const resync = async () => {
    await flushNow();
    try { await hydrateFromCloud(userId); window.dispatchEvent(new CustomEvent('registro-cloud-update')); onRemote(); } catch { /* keep local */ }
  };
  const channel = supabase.channel(`registro-sync-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'registro_dati', filter: `user_id=eq.${userId}` }, () => void resync()).subscribe();
  const onVisible = () => { if (document.visibilityState === 'visible') void resync(); else void flushNow(); };
  const online = () => void resync();
  const interval = setInterval(online, 20000);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', online);
  window.addEventListener('pagehide', onVisible);
  cleanup = () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', online); window.removeEventListener('pagehide', onVisible); void supabase.removeChannel(channel); };
}
export async function stopCloudSync() {
  const ok = await flushNow();
  cleanup?.(); cleanup = null;
  currentUser = null; outbox = null;
  return ok;
}
export function installCloudStorage(userId: string) {
  activate(userId);
  const w = window as unknown as { storage?: unknown };
  w.storage = {
    async get(k: string, shared = false) {
      const cloudKey = shared ? k : `ws:${k}`;
      const pending = outbox?.entries.get(cloudKey);
      if (pending) return { value: pending.value };
      const query = shared ? supabase.from('registro_condiviso').select('v').eq('k', cloudKey) : supabase.from('registro_dati').select('v').eq('k', cloudKey).eq('user_id', userId);
      const { data, error } = await query.maybeSingle();
      if (!error) { known.set(cloudKey, data?.v ?? null); if (data?.v != null) return { value: data.v }; }
      return { value: localStorage.getItem(`${shared ? 'shared:' : 'priv:'}${k}`) };
    },
    async set(k: string, value: string, shared = false) {
      queue(shared ? k : `ws:${k}`, value, shared);
      try { write(`${shared ? 'shared:' : 'priv:'}${k}`, value); } catch { /* journal retains the write */ }
      return { ok: await flushNow() };
    },
    async delete(k: string, shared = false) {
      if (!window.confirm('Confermi l’eliminazione di questo dato?')) return { ok: false };
      queue(shared ? k : `ws:${k}`, null, shared);
      const ok = await flushNow();
      if (ok) rawRemove?.call(localStorage, `${shared ? 'shared:' : 'priv:'}${k}`);
      return { ok };
    },
  };
}
