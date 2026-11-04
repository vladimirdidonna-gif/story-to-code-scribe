export type Change = { value: string | null; base: string | null; shared?: boolean };
export class SyncOutbox {
  readonly entries = new Map<string, Change>();
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>, readonly key: string) {
    const saved = storage.getItem(key);
    if (saved) for (const [k, change] of JSON.parse(saved) as [string, Change][]) this.entries.set(k, change);
  }
  put(key: string, change: Change) {
    const previous = this.entries.get(key);
    this.entries.set(key, { ...change, base: previous ? previous.base : change.base });
    this.persist();
  }
  acknowledge(key: string, change: Change) {
    const latest = this.entries.get(key);
    if (latest === change) this.entries.delete(key);
    else if (latest) this.entries.set(key, { ...latest, base: change.value });
    this.persist();
  }
  private persist() { this.storage.setItem(this.key, JSON.stringify([...this.entries])); }
}
