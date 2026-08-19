// Shim for the artifact-style `window.storage` API used by RegistroApp.
// Backed by localStorage so data persists per browser.
type StorageResult = { value: string | null };

const key = (k: string, shared?: boolean) => `${shared ? "shared:" : "priv:"}${k}`;

export function installStorageShim() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { storage?: unknown };
  if (w.storage) return;

  w.storage = {
    async get(k: string, shared?: boolean): Promise<StorageResult> {
      try {
        return { value: localStorage.getItem(key(k, shared)) };
      } catch {
        return { value: null };
      }
    },
    async set(k: string, value: string, shared?: boolean) {
      try {
        localStorage.setItem(key(k, shared), value);
      } catch {
        /* quota exceeded */
      }
      return { ok: true };
    },
    async delete(k: string, shared?: boolean) {
      try {
        localStorage.removeItem(key(k, shared));
      } catch {
        /* noop */
      }
      return { ok: true };
    },
  };
}
