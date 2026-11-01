import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  accettaInvito,
  ascoltaCondivisioni,
  attivaSincronizzazione,
  cercaDocente,
  eliminaCondivisione,
  inviaInvito,
  listaCondivisioni,
  registraRubrica,
  rifiutaInvito,
  setSyncAttiva,
  type Invito,
} from "@/lib/condivisione";

const TEAL = "#12406f";
const FF = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

type Props = {
  userId: string;
  email: string;
  docente: string;
  classe: string;
  classiList: string[];
  materieClasse: (cl: string) => string[];
  onClose: () => void;
};

export default function DocentiCollegati({ userId, email, docente, classe, classiList, materieClasse, onClose }: Props) {
  const [inviti, setInviti] = useState<Invito[]>([]);
  const [ vista, setVista] = useState<"lista" | "invita" | "configura" | "conferma" | "gestisci">("lista");
  const [dest, setDest] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [cercando, setCercando] = useState(false);
  const [sel, setSel] = useState<Invito | null>(null);
  const [sceltaClasse, setSceltaClasse] = useState("");
  const [sceltaMateria, setSceltaMateria] = useState("");

  const carica = useCallback(async () => setInviti(await listaCondivisioni()), []);

  useEffect(() => {
    void registraRubrica(userId, email, docente);
    void carica();
    const stop = ascoltaCondivisioni(() => void carica());
    const iv = setInterval(() => void carica(), 15000);
    return () => {
      stop();
      clearInterval(iv);
    };
  }, [carica, userId, email, docente]);

  const mia = email.toLowerCase();
  const sonoMittente = (i: Invito) => i.mittente_id === userId;
  const sonoDestinatario = (i: Invito) =>
    i.destinatario_id === userId || i.destinatario_email.toLowerCase() === mia;

  // Collegamenti che riguardano questa classe
  const diQuestaClasse = inviti.filter(
    (i) => i.classe === classe && (sonoMittente(i) || sonoDestinatario(i)) && i.stato !== "rifiutata",
  );
  const attivi = diQuestaClasse.filter((i) => i.stato === "attiva");
  const daConfigurare = inviti.filter((i) => i.stato === "accettata" && sonoMittente(i));
  const ricevuti = inviti.filter((i) => i.stato === "in_attesa" && sonoDestinatario(i));
  const inviatiInAttesa = diQuestaClasse.filter((i) => i.stato === "in_attesa" && sonoMittente(i));

  const nomeCollega = (i: Invito) => (sonoMittente(i) ? i.destinatario_email : i.mittente_email);

  const invia = async () => {
    setErr("");
    setMsg("");
    const em = dest.trim().toLowerCase();
    if (!/.+@.+\..+/.test(em)) {
      setErr("Inserisci un'email valida.");
      return;
    }
    if (em === mia) {
      setErr("Non puoi collegarti con te stesso.");
      return;
    }
    setCercando(true);
    try {
      const trovato = await cercaDocente(em);
      if (!trovato) {
        setErr("Nessun account trovato con questa email.");
        return;
      }
      await inviaInvito({
        mittenteId: userId,
        mittenteEmail: email,
        destinatarioEmail: em,
        classe,
        studenti: [],
      });
      setDest("");
      setVista("lista");
      setMsg("Richiesta inviata: il docente la vedrà nel suo registro.");
      void carica();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setCercando(false);
    }
  };

  const accetta = async (inv: Invito) => {
    setErr("");
    setMsg("");
    try {
      await accettaInvito(inv);
      setMsg("Richiesta accettata: il collega ora sceglie classe e materia da sincronizzare.");
      void carica();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    }
  };

  const apriConfigura = (inv: Invito) => {
    setSel(inv);
    setSceltaClasse(inv.classe || classe);
    setSceltaMateria("");
    setErr("");
    setVista("configura");
  };

  const materieScelte = useMemo(
    () => (sceltaClasse ? materieClasse(sceltaClasse) : []),
    [sceltaClasse, materieClasse],
  );

  const conferma = async () => {
    if (!sel) return;
    if (!sceltaMateria) {
      setErr("Scegli la materia da sincronizzare.");
      return;
    }
    setErr("");
    try {
      await attivaSincronizzazione(sel.id, sceltaClasse, sceltaMateria);
      setMsg("Sincronizzazione attiva: i dati della classe sono ora condivisi in tempo reale.");
      setVista("lista");
      setSel(null);
      void carica();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 14,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 20,
          width: "100%",
          maxWidth: 540,
          maxHeight: "85vh",
          overflowY: "auto",
          fontFamily: FF,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, color: TEAL, marginBottom: 4 }}>DOCENTI COLLEGATI</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14 }}>
          Classe <b>{classe}</b> — ognuno vede il lavoro dell'altro, ma può modificare solo il proprio. I voti non
          vengono mai sincronizzati.
        </div>

        {err && <Box color="#dc2626" bg="#fef2f2" bd="#fecaca">{err}</Box>}
        {msg && <Box color="#047857" bg="#ecfdf5" bd="#a7f3d0">{msg}</Box>}

        {vista === "lista" && (
          <>
            {attivi.map((i) => (
              <Riga key={i.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontWeight: 800 }}>{nomeCollega(i)}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {i.materia || "Materia da definire"} · {i.classe}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: i.sync_attiva ? "#047857" : "#9ca3af",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ● {i.sync_attiva ? "Sincronizzazione attiva" : "In pausa"}
                  </span>
                  <Btn
                    onClick={() => {
                      setSel(i);
                      setVista("gestisci");
                    }}
                    bg="#fff"
                    fg={TEAL}
                  >
                    GESTISCI
                  </Btn>
                </div>
              </Riga>
            ))}

            {daConfigurare.length > 0 && (
              <Sezione titolo="Da completare: scegli cosa sincronizzare">
                {daConfigurare.map((i) => (
                  <Riga key={i.id}>
                    <div>
                      <b>{i.destinatario_email}</b> ha accettato il collegamento
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Btn onClick={() => apriConfigura(i)} bg={TEAL} fg="#fff">
                        SCEGLI CLASSE E MATERIA
                      </Btn>
                    </div>
                  </Riga>
                ))}
              </Sezione>
            )}

            {ricevuti.length > 0 && (
              <Sezione titolo="🔔 Nuove richieste">
                {ricevuti.map((i) => (
                  <Riga key={i.id}>
                    <div style={{ marginBottom: 6 }}>
                      <b>{i.mittente_email}</b> vuole collegarti alla classe <b>{i.classe}</b>.
                    </div>
                    <div style={{ fontSize: 12, color: "#374151", marginBottom: 8, lineHeight: 1.5 }}>
                      Dati condivisi: ✓ Lezioni ✓ Appello ✓ Presenze ✓ Compiti ✓ Comunicazioni ✓ Quadro
                      riepilogativo
                      <br />
                      <span style={{ color: "#dc2626", fontWeight: 700 }}>✕ Voti NON sincronizzati</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn onClick={() => accetta(i)} bg={TEAL} fg="#fff">
                        ACCETTA
                      </Btn>
                      <Btn onClick={() => rifiutaInvito(i.id).then(carica)} bg="#fff" fg="#374151">
                        RIFIUTA
                      </Btn>
                    </div>
                  </Riga>
                ))}
              </Sezione>
            )}

            {inviatiInAttesa.length > 0 && (
              <Sezione titolo="Richieste inviate (in attesa)">
                {inviatiInAttesa.map((i) => (
                  <Riga key={i.id}>
                    <div>
                      <b>{i.destinatario_email}</b> — classe <b>{i.classe}</b> · in attesa
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Btn onClick={() => eliminaCondivisione(i.id).then(carica)} bg="#fff" fg="#dc2626">
                        Annulla
                      </Btn>
                    </div>
                  </Riga>
                ))}
              </Sezione>
            )}

            <button
              onClick={() => {
                setErr("");
                setMsg("");
                setVista("invita");
              }}
              style={{
                width: "100%",
                marginTop: 14,
                padding: 12,
                background: TEAL,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: FF,
                fontSize: 14,
              }}
            >
              + COLLEGA DOCENTE
            </button>
          </>
        )}

        {vista === "invita" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#374151", marginBottom: 8 }}>Collega un docente</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
              Inserisci l'email del docente (classe <b>{classe}</b>):
            </div>
            <input
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              placeholder="email del docente"
              type="email"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 10,
                borderRadius: 8,
                border: "2px solid #e5e7eb",
                marginBottom: 8,
                fontFamily: FF,
              }}
            />
            <button
              onClick={invia}
              disabled={cercando}
              style={{
                width: "100%",
                padding: 11,
                background: TEAL,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: FF,
              }}
            >
              {cercando ? "Ricerca in corso…" : "INVIA RICHIESTA"}
            </button>
            <Indietro onClick={() => setVista("lista")} />
          </>
        )}

        {vista === "configura" && sel && (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#374151", marginBottom: 8 }}>
              Scegli cosa sincronizzare
            </div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>
              Docente collegato: <b>{sel.destinatario_email}</b>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, margin: "10px 0 4px" }}>Classe:</div>
            {classiList.map((c) => (
              <label key={c} style={{ display: "block", fontSize: 14, padding: "3px 0", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="classe"
                  checked={sceltaClasse === c}
                  onChange={() => {
                    setSceltaClasse(c);
                    setSceltaMateria("");
                  }}
                  style={{ marginRight: 8 }}
                />
                {c}
              </label>
            ))}
            <div style={{ fontSize: 13, fontWeight: 700, margin: "10px 0 4px" }}>Materia:</div>
            {materieScelte.length === 0 && (
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                Nessuna materia associata a questa classe: aggiungila da Gestione Classi.
              </div>
            )}
            {materieScelte.map((m) => (
              <label key={m} style={{ display: "block", fontSize: 14, padding: "3px 0", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="materia"
                  checked={sceltaMateria === m}
                  onChange={() => setSceltaMateria(m)}
                  style={{ marginRight: 8 }}
                />
                {m}
              </label>
            ))}
            <button
              onClick={() => {
                if (!sceltaMateria) {
                  setErr("Scegli la materia da sincronizzare.");
                  return;
                }
                setErr("");
                setVista("conferma");
              }}
              style={{
                width: "100%",
                marginTop: 12,
                padding: 11,
                background: TEAL,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: FF,
              }}
            >
              Continua
            </button>
            <Indietro onClick={() => setVista("lista")} />
          </>
        )}

        {vista === "conferma" && sel && (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#374151", marginBottom: 10 }}>
              Conferma collegamento
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.8 }}>
              Docente: <b>{sel.destinatario_email}</b>
              <br />
              Classe: <b>{sceltaClasse}</b>
              <br />
              Materia: <b>{sceltaMateria}</b>
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", margin: "10px 0" }}>
              Vuoi attivare la sincronizzazione?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setVista("configura")}
                style={{
                  flex: 1,
                  padding: 11,
                  background: "#f3f4f6",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: FF,
                }}
              >
                ANNULLA
              </button>
              <button
                onClick={conferma}
                style={{
                  flex: 2,
                  padding: 11,
                  background: "#047857",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: FF,
                }}
              >
                CONFERMA E SINCRONIZZA
              </button>
            </div>
          </>
        )}

        {vista === "gestisci" && sel && (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#374151", marginBottom: 10 }}>
              Gestisci collegamento
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.8 }}>
              Docente: <b>{nomeCollega(sel)}</b>
              <br />
              Classe: <b>{sel.classe}</b>
              <br />
              Materia: <b>{sel.materia || "—"}</b>
              <br />
              Sincronizzazione:{" "}
              <b style={{ color: sel.sync_attiva ? "#047857" : "#9ca3af" }}>
                ● {sel.sync_attiva ? "Attiva" : "In pausa"}
              </b>
            </div>
            <button
              onClick={() =>
                setSyncAttiva(sel.id, !sel.sync_attiva).then(() => {
                  setVista("lista");
                  setSel(null);
                  void carica();
                })
              }
              style={{
                width: "100%",
                marginTop: 12,
                padding: 11,
                background: sel.sync_attiva ? "#d9534f" : "#047857",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: FF,
              }}
            >
              {sel.sync_attiva ? "DISATTIVA SINCRONIZZAZIONE" : "RIATTIVA SINCRONIZZAZIONE"}
            </button>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              La disattivazione interrompe la sincronizzazione futura senza cancellare i dati già presenti nel
              registro.
            </div>
            <button
              onClick={() =>
                eliminaCondivisione(sel.id).then(() => {
                  setVista("lista");
                  setSel(null);
                  void carica();
                })
              }
              style={{
                width: "100%",
                marginTop: 8,
                padding: 10,
                background: "#fff",
                color: "#dc2626",
                border: "2px solid #fecaca",
                borderRadius: 8,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: FF,
              }}
            >
              Elimina collegamento
            </button>
            <Indietro
              onClick={() => {
                setVista("lista");
                setSel(null);
              }}
            />
          </>
        )}

        <button
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 14,
            padding: 10,
            background: "#f3f4f6",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: FF,
          }}
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}

/** Badge con il numero di richieste in attesa per l'utente corrente. */
export function useRichiesteInAttesa(userId: string | null, email: string | null) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!userId || !email) return;
    let alive = true;
    const conta = async () => {
      const inviti = await listaCondivisioni();
      if (!alive) return;
      const mia = email.toLowerCase();
      setN(
        inviti.filter(
          (i) =>
            i.stato === "in_attesa" &&
            (i.destinatario_id === userId || i.destinatario_email.toLowerCase() === mia),
        ).length,
      );
    };
    void conta();
    const stop = ascoltaCondivisioni(() => void conta());
    const iv = setInterval(() => void conta(), 20000);
    return () => {
      alive = false;
      stop();
      clearInterval(iv);
    };
  }, [userId, email]);
  return n;
}

/** Recupera id ed email dell'utente autenticato. */
export function useUtenteAuth() {
  const [u, setU] = useState<{ id: string; email: string } | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setU({ id: data.user.id, email: data.user.email ?? "" });
    });
  }, []);
  return u;
}

const Indietro = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    style={{
      width: "100%",
      marginTop: 8,
      padding: 9,
      background: "#fff",
      color: "#374151",
      border: "2px solid #e5e7eb",
      borderRadius: 8,
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: FF,
    }}
  >
    ← Indietro
  </button>
);

const Box = ({ children, color, bg, bd }: { children: React.ReactNode; color: string; bg: string; bd: string }) => (
  <div
    style={{
      background: bg,
      border: `2px solid ${bd}`,
      color,
      borderRadius: 8,
      padding: "9px 12px",
      fontSize: 13,
      fontWeight: 600,
      marginTop: 10,
    }}
  >
    {children}
  </div>
);

const Sezione = ({ titolo, children }: { titolo: string; children: React.ReactNode }) => (
  <div style={{ marginTop: 16 }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: "#374151", marginBottom: 6 }}>{titolo}</div>
    {children}
  </div>
);

const Riga = ({ children }: { children: React.ReactNode }) => (
  <div style={{ border: "2px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 13 }}>
    {children}
  </div>
);

const Btn = ({
  children,
  onClick,
  bg,
  fg,
}: {
  children: React.ReactNode;
  onClick: () => void;
  bg: string;
  fg: string;
}) => (
  <button
    onClick={onClick}
    style={{
      padding: "6px 12px",
      background: bg,
      color: fg,
      border: "2px solid #e5e7eb",
      borderRadius: 8,
      fontWeight: 700,
      fontSize: 12,
      cursor: "pointer",
      fontFamily: FF,
    }}
  >
    {children}
  </button>
);
