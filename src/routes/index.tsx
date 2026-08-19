import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { installStorageShim } from "@/lib/storage-shim";

const RegistroApp = lazy(() => import("@/components/RegistroApp.jsx"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Registro del Docente — Classi, voti e assenze" },
      {
        name: "description",
        content:
          "Registro elettronico per docenti: gestione classi, appello, voti, firme, orario e schede alunno.",
      },
      { property: "og:title", content: "Registro del Docente" },
      {
        property: "og:description",
        content:
          "Gestisci classi, appello, voti, firme e orario in un unico registro digitale.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    installStorageShim();
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Caricamento registro…
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
          Caricamento registro…
        </div>
      }
    >
      <RegistroApp />
    </Suspense>
  );
}
