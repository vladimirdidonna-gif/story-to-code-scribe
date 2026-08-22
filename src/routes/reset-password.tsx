import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reimposta password — Registro del Docente" },
      { name: "description", content: "Imposta una nuova password per il tuo account del registro." },
      { property: "og:title", content: "Reimposta password" },
      { property: "og:description", content: "Imposta una nuova password per il tuo account del registro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPassword,
});

const TEAL = "#0d7d7d";

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr("");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setOk(true);
      setTimeout(() => navigate({ to: "/" }), 1200);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f9f9", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 12, padding: 26, boxShadow: "0 8px 30px rgba(0,0,0,.12)" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: TEAL, marginBottom: 14 }}>Nuova password</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Nuova password"
          style={{ width: "100%", boxSizing: "border-box", border: "2px solid #e5e7eb", borderRadius: 8, padding: "11px 12px", fontSize: 16, marginBottom: 12 }}
        />
        {err && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{err}</div>}
        {ok && <div style={{ color: "#047857", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Password aggiornata!</div>}
        <button
          onClick={save}
          disabled={busy || password.length < 6}
          style={{ width: "100%", padding: 13, background: TEAL, color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, fontSize: 16, cursor: "pointer", opacity: busy || password.length < 6 ? 0.6 : 1 }}
        >
          Salva password
        </button>
      </div>
    </main>
  );
}
