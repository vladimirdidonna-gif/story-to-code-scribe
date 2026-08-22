import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";

const RegistroApp = lazy(() => import("@/components/RegistroApp.jsx"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Registro del Docente — Classi, voti e assenze" },
      {
        name: "description",
        content:
          "Registro elettronico per docenti: gestione classi, appello, voti, firme, orario e schede alunno, sincronizzato su tutti i dispositivi.",
      },
      { property: "og:title", content: "Registro del Docente" },
      {
        property: "og:description",
        content:
          "Gestisci classi, appello, voti, firme e orario in un unico registro digitale sincronizzato.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const Loader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
    Caricamento registro…
  </div>
);

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Loader />;

  return (
    <AuthGate>
      {({ syncKey, signOut, email }) => (
        <Suspense fallback={<Loader />}>
          <RegistroApp key={syncKey} />
          <button
            onClick={signOut}
            title={email}
            style={{
              position: "fixed",
              right: 10,
              bottom: 10,
              zIndex: 99999,
              background: "#fff",
              border: "2px solid #0d7d7d",
              color: "#0d7d7d",
              borderRadius: 20,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,.15)",
            }}
          >
            Esci
          </button>
        </Suspense>
      )}
    </AuthGate>
  );
}
