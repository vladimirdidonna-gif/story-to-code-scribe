// Condivisione di una classe tra due docenti.
// Ogni docente pubblica la propria copia dei dati della classe; il collega
// collegato può soltanto leggerli (mai modificarli).
import { supabase } from "@/integrations/supabase/client";

export type Invito = {
  id: string;
  mittente_id: string;
  mittente_email: string;
  destinatario_email: string;
  destinatario_id: string | null;
  classe: string;
  studenti: string[];
  stato: "in_attesa" | "attiva" | "rifiutata";
  created_at: string;
};

export type DatiCollega = {
  owner_id: string;
  owner_nome: string | null;
  classe: string;
  payload: Record<string, unknown>;
  updated_at: string;
};

export const normNome = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Confronta due elenchi di alunni: devono coincidere esattamente. */
export function stessiStudenti(a: string[], b: string[]) {
  const x = [...new Set(a.map(normNome))].filter(Boolean).sort();
  const y = [...new Set(b.map(normNome))].filter(Boolean).sort();
  return x.length > 0 && x.length === y.length && x.every((v, i) => v === y[i]);
}

export async function registraRubrica(userId: string, email: string, nome?: string) {
  try {
    await supabase
      .from("docenti_rubrica")
      .upsert({ user_id: userId, email: email.toLowerCase(), nome: nome ?? null, updated_at: new Date().toISOString() });
  } catch {
    /* non bloccante */
  }
}

export async function listaCondivisioni(): Promise<Invito[]> {
  const { data, error } = await supabase
    .from("condivisioni")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as Invito[];
}

export async function inviaInvito(opts: {
  mittenteId: string;
  mittenteEmail: string;
  destinatarioEmail: string;
  classe: string;
  studenti: string[];
}) {
  const dest = opts.destinatarioEmail.trim().toLowerCase();
  if (!dest || !/.+@.+\..+/.test(dest)) throw new Error("Inserisci un'email valida.");
  if (dest === opts.mittenteEmail.toLowerCase()) throw new Error("Non puoi invitare te stesso.");
  if (!opts.classe) throw new Error("Scegli la classe da condividere.");
  const { error } = await supabase.from("condivisioni").insert({
    mittente_id: opts.mittenteId,
    mittente_email: opts.mittenteEmail.toLowerCase(),
    destinatario_email: dest,
    classe: opts.classe,
    studenti: opts.studenti,
  });
  if (error) throw new Error(error.message);
}

export async function accettaInvito(inv: Invito, studentiLocali: string[]) {
  if (!stessiStudenti(inv.studenti || [], studentiLocali))
    throw new Error(
      `Gli alunni della classe ${inv.classe} non coincidono con quelli del collega: la condivisione non è possibile.`,
    );
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("condivisioni")
    .update({ stato: "attiva", destinatario_id: u.user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("id", inv.id);
  if (error) throw new Error(error.message);
}

export async function rifiutaInvito(id: string) {
  await supabase.from("condivisioni").update({ stato: "rifiutata", updated_at: new Date().toISOString() }).eq("id", id);
}

export async function eliminaCondivisione(id: string) {
  await supabase.from("condivisioni").delete().eq("id", id);
}

export async function pubblicaDatiClasse(
  ownerId: string,
  ownerNome: string,
  classe: string,
  payload: Record<string, unknown>,
) {
  const { error } = await supabase.from("condivisione_dati").upsert(
    { owner_id: ownerId, owner_nome: ownerNome, classe, payload: payload as never, updated_at: new Date().toISOString() },
    { onConflict: "owner_id,classe" },
  );
  if (error) console.warn("[condivisione] pubblica", error.message);
}

export async function leggiDatiColleghi(classi: string[], ownId: string): Promise<DatiCollega[]> {
  if (!classi.length) return [];
  const { data, error } = await supabase.from("condivisione_dati").select("*").in("classe", classi);
  if (error) return [];
  return ((data ?? []) as unknown as DatiCollega[]).filter((r) => r.owner_id !== ownId);
}

/** Realtime: richiama onChange quando cambiano inviti o dati condivisi. */
export function ascoltaCondivisioni(onChange: () => void) {
  const ch = supabase
    .channel(`condivisione-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "condivisioni" }, () => onChange())
    .on("postgres_changes", { event: "*", schema: "public", table: "condivisione_dati" }, () => onChange())
    .subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}
