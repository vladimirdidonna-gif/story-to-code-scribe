import { useCallback, useEffect, useMemo, useState } from "react";
import {
  accettaInvito,
  ascoltaCondivisioni,
  eliminaCondivisione,
  inviaInvito,
  listaCondivisioni,
  rifiutaInvito,
  stessiStudenti,
  type Invito,
} from "@/lib/condivisione";

const TEAL = "#0d7d7d";
const FF = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

function leggiClassi(): Record<string, Array<{ cognome?: string; nome?: string }>> {
  try {
    const doc = localStorage.getItem("reg:lastDocente") || "";
    return JSON.parse(localStorage.getItem(`reg:${doc}:classi`) || "{}");
  } catch {
    return {};
  }
}

const nomiClasse = (cl: string) =>
  (leggiClassi()[cl] || []).map((a) => `${a.cognome ?? ""} ${a.nome ?? ""}`.trim()).filter(Boolean);

export default function CondivisioneDocenti({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [inviti, setInviti] = useState<Invito[]>([]);
  const [dest, setDest] = useState("");
  const [classe, setClasse] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const classiList = useMemo(() => Object.keys(leggiClassi()).sort(), [open]);

  const carica = useCallback(async () => setInviti(await listaCondivisioni()), []);

  useEffect(() => {
    void carica();
    const stop = ascoltaCondivisioni(() => void carica());
    const iv = setInterval(() => void carica(), 20000);
    return () => {
      stop();
      clearInterval(iv);
    };
  }, [carica]);

  const mia = email.toLowerCase();
  const ricevuti = inviti.filter((i) => i.stato === "in_attesa" && i.destinatario_email.toLowerCase() === mia);
  const inviati = inviti.filter((i) => i.stato === "in_attesa" && i.mittente_id === userId);
  const attive = inviti.filter((i) => i.stato === "attiva");

  const invia = async () => {
    setErr("");
    setMsg("");
    try {
      await inviaInvito({
        mittenteId: userId,
        mittenteEmail: email,
        destinatarioEmail: dest,
        classe,
        studenti: nomiClasse(classe),
      });
      setDest("");
      setMsg("Invito inviato: il collega lo vedrà subito nel suo registro.");
      void carica();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    }
  };

  const accetta = async (inv: Invito) => {
    setErr("");
    setMsg("");
    const locali = nomiClasse(inv.classe);
    if (!locali.length) {
      setErr(`Non hai una classe chiamata ${inv.classe}: creala con gli stessi alunni e riprova.`);
      return;
    }
    if (!stessiStudenti(inv.studenti || [], locali)) {
      setErr(`Gli alunni della classe ${inv.classe} non coincidono con quelli del collega: condivisione impossibile.`);
      return;
    }
    try {
      await accettaInvito(inv, locali);
      setMsg("Collegamento attivo: ora vedete entrambi il registro di quella classe.");
      void carica();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 10,
          bottom: 48,
          zIndex: 99999,
          background: TEAL,
          border: "2px solid " + TEAL,
          color: "#fff",
          borderRadius: 20,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: FF,
          boxShadow: "0 2px 8px rgba(0,0,0,.15)",
        }}
      >
        Connetti con un altro docente
        {ricevuti.length > 0 && (
          <span
            style={{
              marginLeft: 6,
              background: "#dc2626",
              borderRadius: 10,
              padding: "1px 6px",
              fontSize: 11,
            }}
          >
            {ricevuti.length}
          </span>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
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
              maxWidth: 520,
              maxHeight: "85vh",
              overflowY: "auto",
              fontFamily: FF,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: TEAL, marginBottom: 10 }}>
              Connetti con un altro docente
            </div>

            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              Scegli la classe e inserisci l'email del collega. La condivisione è possibile solo se avete gli stessi
              alunni. Ognuno vede il lavoro dell'altro, ma può modificare solo il proprio.
            </div>

            <select
              value={classe}
              onChange={(e) => setClasse(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "2px solid #e5e7eb", marginBottom: 8, fontFamily: FF }}
            >
              <option value="">Scegli la classe…</option>
              {classiList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              placeholder="email del collega"
              type="email"
              style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "2px solid #e5e7eb", marginBottom: 8, fontFamily: FF }}
            />
            <button
              onClick={invia}
              style={{ width: "100%", padding: 11, background: TEAL, color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, cursor: "pointer", fontFamily: FF }}
            >
              Invia invito
            </button>

            {err && <Box color="#dc2626" bg="#fef2f2" bd="#fecaca">{err}</Box>}
            {msg && <Box color="#047857" bg="#ecfdf5" bd="#a7f3d0">{msg}</Box>}

            {ricevuti.length > 0 && (
              <Sezione titolo="Inviti ricevuti">
                {ricevuti.map((i) => (
                  <Riga key={i.id}>
                    <div>
                      <b>{i.mittente_email}</b> vuole condividere la classe <b>{i.classe}</b>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <Btn onClick={() => accetta(i)} bg={TEAL} fg="#fff">
                        Accetta
                      </Btn>
                      <Btn onClick={() => rifiutaInvito(i.id).then(carica)} bg="#fff" fg="#374151">
                        Rifiuta
                      </Btn>
                    </div>
                  </Riga>
                ))}
              </Sezione>
            )}

            {attive.length > 0 && (
              <Sezione titolo="Condivisioni attive">
                {attive.map((i) => (
                  <Riga key={i.id}>
                    <div>
                      Classe <b>{i.classe}</b> con{" "}
                      <b>{i.mittente_id === userId ? i.destinatario_email : i.mittente_email}</b>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Btn onClick={() => eliminaCondivisione(i.id).then(carica)} bg="#fff" fg="#dc2626">
                        Interrompi
                      </Btn>
                    </div>
                  </Riga>
                ))}
              </Sezione>
            )}

            {inviati.length > 0 && (
              <Sezione titolo="Inviti inviati">
                {inviati.map((i) => (
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
              onClick={() => setOpen(false)}
              style={{ width: "100%", marginTop: 14, padding: 10, background: "#f3f4f6", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: FF }}
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const Box = ({ children, color, bg, bd }: { children: React.ReactNode; color: string; bg: string; bd: string }) => (
  <div style={{ background: bg, border: `2px solid ${bd}`, color, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontWeight: 600, marginTop: 10 }}>
    {children}
  </div>
);

const Sezione = ({ titolo, children }: { titolo: string; children: React.ReactNode }) => (
  <div style={{ marginTop: 18 }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: "#374151", marginBottom: 6 }}>{titolo}</div>
    {children}
  </div>
);

const Riga = ({ children }: { children: React.ReactNode }) => (
  <div style={{ border: "2px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 13 }}>{children}</div>
);

const Btn = ({ children, onClick, bg, fg }: { children: React.ReactNode; onClick: () => void; bg: string; fg: string }) => (
  <button
    onClick={onClick}
    style={{ padding: "6px 12px", background: bg, color: fg, border: "2px solid #e5e7eb", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FF }}
  >
    {children}
  </button>
);
