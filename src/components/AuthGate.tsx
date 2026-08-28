import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import {
  hydrateFromCloud,
  pushLocalToCloud,
  startCloudSync,
  installCloudStorage,
  stopCloudSync,
} from "@/lib/cloud-sync";

const TEAL = "#0d7d7d";
const FF = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

type Props = { children: (ctx: { syncKey: number; signOut: () => void; email: string }) => React.ReactNode };

export default function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncKey, setSyncKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    let alive = true;
    (async () => {
      setSyncing(true);
      const uid = session.user.id;
      installCloudStorage(uid);
      // Il cloud ha sempre la precedenza: si inviano solo le chiavi che il
      // cloud non conosce ancora, così un dispositivo non sovrascrive i dati
      // salvati poco prima da un altro.
      const cloudKeys = await hydrateFromCloud(uid);
      await pushLocalToCloud(uid, cloudKeys);
      startCloudSync(uid, () => setSyncKey((k) => k + 1));
      if (!alive) return;
      setSyncing(false);
      setSyncKey((k) => k + 1);
    })();

    return () => {
      alive = false;
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    await stopCloudSync();
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (checking || (session && syncing)) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FF, color: TEAL, fontWeight: 700 }}>
        {syncing ? "Sincronizzazione dati in corso…" : "Caricamento…"}
      </div>
    );
  }

  if (!session) return <AuthForm />;

  return <>{children({ syncKey, signOut, email: session.user.email ?? "" })}</>;
}

function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setMsg("Account creato! Controlla la tua email e conferma l'indirizzo per accedere.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMsg("Ti abbiamo inviato una email per reimpostare la password.");
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "Errore";
      setErr(
        /invalid login/i.test(m)
          ? "Email o password non corretti."
          : /already registered/i.test(m)
            ? "Questa email è già registrata: accedi."
            : m,
      );
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setErr("");
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) setErr("Accesso con Google non riuscito.");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f9f9", fontFamily: FF, padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.12)", padding: 26 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: TEAL, marginBottom: 4 }}>Registro del Docente</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 18 }}>
          {mode === "login" ? "Accedi al tuo account: i dati si sincronizzano su tutti i dispositivi." : mode === "signup" ? "Crea il tuo account con email e password." : "Reimposta la password."}
        </div>

        <label style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          placeholder="nome@scuola.it"
          style={{ width: "100%", boxSizing: "border-box", border: "2px solid #e5e7eb", borderRadius: 8, padding: "11px 12px", fontSize: 16, margin: "6px 0 12px", fontFamily: FF }}
        />

        {mode !== "reset" && (
          <>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••••••"
              style={{ width: "100%", boxSizing: "border-box", border: "2px solid #e5e7eb", borderRadius: 8, padding: "11px 12px", fontSize: 16, margin: "6px 0 12px", fontFamily: FF }}
            />
          </>
        )}

        {err && <div style={{ background: "#fef2f2", border: "2px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{err}</div>}
        {msg && <div style={{ background: "#ecfdf5", border: "2px solid #a7f3d0", color: "#047857", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{msg}</div>}

        <button
          onClick={submit}
          disabled={busy}
          style={{ width: "100%", padding: 13, background: TEAL, color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, fontSize: 16, cursor: "pointer", opacity: busy ? 0.6 : 1, fontFamily: FF }}
        >
          {busy ? "Attendi…" : mode === "login" ? "Accedi" : mode === "signup" ? "Crea account" : "Invia email"}
        </button>

        <button
          onClick={google}
          style={{ width: "100%", padding: 12, marginTop: 10, background: "#fff", color: "#374151", border: "2px solid #e5e7eb", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: FF }}
        >
          Continua con Google
        </button>

        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
          {mode !== "login" && (
            <button onClick={() => { setMode("login"); setErr(""); setMsg(""); }} style={linkStyle}>← Torna all'accesso</button>
          )}
          {mode === "login" && (
            <>
              <button onClick={() => { setMode("signup"); setErr(""); setMsg(""); }} style={linkStyle}>Non hai un account? Registrati</button>
              <button onClick={() => { setMode("reset"); setErr(""); setMsg(""); }} style={linkStyle}>Password dimenticata?</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: TEAL,
  fontWeight: 700,
  cursor: "pointer",
  padding: 0,
  textAlign: "left",
  fontSize: 13,
  fontFamily: FF,
};
