// Sincronizzazione reale multi-dispositivo del registro.
// Tutti i dati che l'app salva in localStorage (e via window.storage)
// vengono replicati nella tabella cloud `registro_dati` dell'account
// e riportati in tempo reale su ogni dispositivo collegato.
import { supabase } from "@/integrations/supabase/client";

const SKIP_PREFIXES = ["sb-", "supabase."];
const shouldSkip = (k: string) => SKIP_PREFIXES.some((p) => k.startsWith(p));

let currentUser: string | null = null;
let applyingRemote = false;
let patched = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const pending = new Map<string, string | null>();
let channel: ReturnType<typeof supabase.channel> | null = null;
let onRemoteChange: (() => void) | null = null;
let lifecycleBound = false;


const rawSet = typeof window !== "undefined" ? localStorage.setItem.bind(localStorage) : null;
const rawRemove =
  typeof window !== "undefined" ? localStorage.removeItem.bind(localStorage) : null;

function queue(k: string, v: string | null) {
  if (!currentUser || applyingRemote || shouldSkip(k)) return;
  pending.set(k, v);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 700);
}

async function flush() {
  flushTimer = null;
  if (!currentUser || pending.size === 0) return;
  const entries = [...pending.entries()];
  pending.clear();

  const rows = entries
    .filter(([, v]) => v !== null)
    .map(([k, v]) => ({ user_id: currentUser!, k, v, updated_at: new Date().toISOString() }));
  const removed = entries.filter(([, v]) => v === null).map(([k]) => k);

  try {
    for (let i = 0; i < rows.length; i += 25) {
      const chunk = rows.slice(i, i + 25);
      const { error } = await supabase.from("registro_dati").upsert(chunk, { onConflict: "user_id,k" });
      if (error) console.warn("[sync] upsert", error.message);
    }
    if (removed.length) {
      await supabase.from("registro_dati").delete().eq("user_id", currentUser).in("k", removed);
    }
  } catch (e) {
    console.warn("[sync] flush", e);
  }
}

/** Scarica tutti i dati dell'account nel dispositivo corrente. */
export async function hydrateFromCloud(userId: string) {
  const { data, error } = await supabase
    .from("registro_dati")
    .select("k,v")
    .eq("user_id", userId);
  if (error) {
    console.warn("[sync] hydrate", error.message);
    return;
  }
  applyingRemote = true;
  try {
    for (const row of data ?? []) {
      if (row.v === null || shouldSkip(row.k)) continue;
      try {
        rawSet?.(row.k, row.v);
      } catch {
        /* quota */
      }
    }
  } finally {
    applyingRemote = false;
  }
}

/** Invia al cloud tutto ciò che è già presente sul dispositivo (primo accesso). */
export async function pushLocalToCloud(userId: string) {
  currentUser = userId;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || shouldSkip(k)) continue;
    pending.set(k, localStorage.getItem(k));
  }
  await flush();
}

/** Attiva la sincronizzazione continua + realtime. */
export function startCloudSync(userId: string, onRemote: () => void) {
  currentUser = userId;
  onRemoteChange = onRemote;

  if (!patched && rawSet && rawRemove) {
    patched = true;
    localStorage.setItem = function (k: string, v: string) {
      rawSet(k, v);
      queue(k, v);
    };
    localStorage.removeItem = function (k: string) {
      rawRemove(k);
      queue(k, null);
    };
  }

  let remoteTimer: ReturnType<typeof setTimeout> | null = null;

  const subscribe = () => {
    if (channel) supabase.removeChannel(channel);
    channel = supabase
      .channel(`registro-sync-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registro_dati", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { k?: string; v?: string | null };
          if (!row?.k || shouldSkip(row.k)) return;
          const incoming = payload.eventType === "DELETE" ? null : (row.v ?? null);
          if (localStorage.getItem(row.k) === incoming) return;
          applyingRemote = true;
          try {
            if (incoming === null) rawRemove?.(row.k);
            else rawSet?.(row.k, incoming);
          } catch {
            /* quota */
          } finally {
            applyingRemote = false;
          }
          if (remoteTimer) clearTimeout(remoteTimer);
          remoteTimer = setTimeout(() => {
            // Aggiornamento "morbido": i componenti rileggono i dati
            // senza rimontare l'app (nessun ritorno alla Home).
            window.dispatchEvent(new CustomEvent("registro-cloud-update"));
            onRemoteChange?.();
          }, 300);
        },
      )
      .subscribe();
  };

  subscribe();

  // Riallinea e riconnette quando il dispositivo torna online o l'app
  // ritorna in primo piano: la sincronizzazione non resta mai bloccata.
  if (!lifecycleBound) {
    lifecycleBound = true;
    const resync = async () => {
      if (!currentUser) return;
      await flush();
      await hydrateFromCloud(currentUser);
      window.dispatchEvent(new CustomEvent("registro-cloud-update"));
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !currentUser) return;
      const state = channel?.state;
      if (state !== "joined") subscribe();
      void resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", () => {
      if (!currentUser) return;
      subscribe();
      void resync();
    });
    window.addEventListener("focus", onVisible);
  }
}


export async function stopCloudSync() {
  await flush();
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
  currentUser = null;
}

/** window.storage backed dal cloud (usato internamente dal registro). */
export function installCloudStorage(userId: string) {
  const w = window as unknown as { storage?: unknown };
  const cache = (k: string, shared?: boolean) => `${shared ? "shared:" : "priv:"}${k}`;

  w.storage = {
    async get(k: string, shared?: boolean) {
      try {
        if (shared) {
          const { data } = await supabase
            .from("registro_condiviso")
            .select("v")
            .eq("k", k)
            .maybeSingle();
          if (data?.v != null) return { value: data.v };
        } else {
          const { data } = await supabase
            .from("registro_dati")
            .select("v")
            .eq("user_id", userId)
            .eq("k", `ws:${k}`)
            .maybeSingle();
          if (data?.v != null) return { value: data.v };
        }
      } catch {
        /* offline */
      }
      try {
        return { value: localStorage.getItem(cache(k, shared)) };
      } catch {
        return { value: null };
      }
    },
    async set(k: string, value: string, shared?: boolean) {
      try {
        rawSet?.(cache(k, shared), value);
      } catch {
        /* quota */
      }
      try {
        if (shared) {
          await supabase
            .from("registro_condiviso")
            .upsert({ k, v: value, updated_at: new Date().toISOString() }, { onConflict: "k" });
        } else {
          await supabase
            .from("registro_dati")
            .upsert(
              { user_id: userId, k: `ws:${k}`, v: value, updated_at: new Date().toISOString() },
              { onConflict: "user_id,k" },
            );
        }
      } catch {
        /* offline */
      }
      return { ok: true };
    },
    async delete(k: string, shared?: boolean) {
      try {
        rawRemove?.(cache(k, shared));
      } catch {
        /* noop */
      }
      try {
        if (shared) await supabase.from("registro_condiviso").delete().eq("k", k);
        else
          await supabase.from("registro_dati").delete().eq("user_id", userId).eq("k", `ws:${k}`);
      } catch {
        /* offline */
      }
      return { ok: true };
    },
  };
}
