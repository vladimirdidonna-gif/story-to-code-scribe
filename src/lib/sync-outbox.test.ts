import { describe, it, expect } from 'vitest';
import { SyncOutbox } from './sync-outbox';
function storage() { const map = new Map<string, string>(); return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } }; }
describe('protezione modifiche offline', () => {
  it('conserva modifiche dopo chiusura o logout senza cancellarle', () => {
    const disk = storage();
    new SyncOutbox(disk, 'account-A').put('compiti', { value: 'esercizio 4', base: null });
    expect(new SyncOutbox(disk, 'account-A').entries.get('compiti')?.value).toBe('esercizio 4');
  });
  it('non elimina una modifica piu recente durante la sincronizzazione', () => {
    const box = new SyncOutbox(storage(), 'account-A');
    box.put('note', { value: 'prima', base: null });
    const sent = box.entries.get('note');
    if (!sent) throw new Error('missing');
    box.put('note', { value: 'seconda', base: null });
    box.acknowledge('note', sent);
    expect(box.entries.get('note')).toEqual({ value: 'seconda', base: 'prima' });
  });
  it('separa le modifiche degli account', () => {
    const disk = storage();
    new SyncOutbox(disk, 'account-A').put('note', { value: 'privata', base: null });
    expect(new SyncOutbox(disk, 'account-B').entries.size).toBe(0);
  });
  it('mantiene eliminazione in attesa fino alla conferma cloud', () => {
    const disk = storage(), box = new SyncOutbox(disk, 'account-A');
    box.put('nota', { value: null, base: 'originale' });
    expect(new SyncOutbox(disk, 'account-A').entries.has('nota')).toBe(true);
  });
});
