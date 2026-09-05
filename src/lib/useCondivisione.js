// Hook: pubblica i dati delle classi condivise e legge quelli dei colleghi.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ascoltaCondivisioni, leggiDatiColleghi, listaCondivisioni, pubblicaDatiClasse } from "@/lib/condivisione";
import { estraiPayloadClasse } from "@/lib/condivisione-merge";

export function useCondivisione({ contDB, assenzeDB, classi, docente }) {
  const [uid, setUid] = useState(null);
  const [classiCondivise, setClassiCondivise] = useState([]);
  const [righe, setRighe] = useState([]);
  const timer = useRef(null);
  const lastPub = useRef({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);

  const ricarica = useCallback(async () => {
    if (!uid) return;
    const inviti = await listaCondivisioni();
    const cls = [...new Set(inviti.filter((i) => i.stato === "attiva").map((i) => i.classe))];
    setClassiCondivise(cls);
    setRighe(await leggiDatiColleghi(cls, uid));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    void ricarica();
    const stop = ascoltaCondivisioni(() => void ricarica());
    const onFocus = () => void ricarica();
    window.addEventListener("focus", onFocus);
    const iv = setInterval(() => void ricarica(), 20000);
    return () => {
      stop();
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
    };
  }, [uid, ricarica]);

  // pubblicazione dei propri dati (debounce)
  useEffect(() => {
    if (!uid || !classiCondivise.length) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      let prog = {};
      try {
        prog = JSON.parse(localStorage.getItem(`prog:${docente}`) || "{}");
      } catch {
        prog = {};
      }
      classiCondivise.forEach((cl) => {
        const payload = estraiPayloadClasse({ classe: cl, contDB, assenzeDB, classi, prog, autore: docente });
        const s = JSON.stringify(payload);
        if (lastPub.current[cl] === s) return;
        lastPub.current[cl] = s;
        void pubblicaDatiClasse(uid, docente, cl, payload);
      });
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [uid, classiCondivise, contDB, assenzeDB, classi, docente]);

  return { righe, classiCondivise, ricarica };
}
