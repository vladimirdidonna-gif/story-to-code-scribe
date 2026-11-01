// Sincronizzazione "Docenti collegati": pubblica i dati delle classi con
// collegamento attivo e legge quelli dei colleghi. I VOTI non vengono mai
// inclusi. I dati del collega restano in sola lettura (badge COLLEGA).
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ascoltaCondivisioni, listaCondivisioni, pubblicaDatiClasse, registraRubrica } from "@/lib/condivisione";

/** Costruisce il pacchetto dati di una classe (niente voti). */
export function buildPayloadClasse({ docente, classe, contDB, assenzeDB, classi, scrutiniDB, colloquiDB }) {
  if (!classe) return null;
  const prefix = `${classe}||`;
  const lezioni = [], compiti = [], annotazioni = [], verifiche = [], firme = [];
  Object.entries(contDB || {})
    .filter(([k]) => k.startsWith(prefix) || k === `__class__${classe}`)
    .forEach(([k, v]) => {
      const mat = k.split("||")[1] || "";
      (v.lezioni || []).forEach((i) => lezioni.push({ ...i, mat, inseritoDa: i.inseritoDa || docente }));
      (v.compiti || []).forEach((i) => compiti.push({ ...i, mat, inseritoDa: i.inseritoDa || docente }));
      (v.annotazioni || []).forEach((i) => annotazioni.push({ ...i, inseritoDa: i.inseritoDa || docente }));
      (v.note || []).forEach((i) => annotazioni.push({ ...i, inseritoDa: i.inseritoDa || docente, _isNota: true }));
      (v.verifiche || []).forEach((i) => verifiche.push({ ...i, mat, inseritoDa: i.inseritoDa || docente }));
      (v.firme || []).forEach((i) => firme.push({ ...i, mat, inseritoDa: i.docente || i.inseritoDa || docente }));
    });
  const comunicazioni = (contDB?.["__comunicazioni__"]?.["comunicazioni"] || []).filter(
    (c) => !c.classiCom?.length || c.classiCom.includes(classe),
  );
  return {
    docente,
    classe,
    _ts: Date.now(),
    alunni: (classi[classe] || []).map((a) => ({ id: a.id, nome: a.nome, cognome: a.cognome })),
    lezioni,
    compiti,
    annotazioni,
    verifiche,
    firme,
    assenze: assenzeDB?.[classe] || {},
    comunicazioni,
    scrutini: scrutiniDB?.[classe] || {},
    colloqui: (colloquiDB || []).filter((c) => c.attivo),
  };
}

/**
 * Hook: per ogni classe con sincronizzazione attiva pubblica i propri dati
 * (debounced) e scarica quelli dei colleghi, passandoli a onDati come
 * mappa { ownerId: payload } compatibile con la fusione nel registro.
 */
export function useDocentiCollegati({ docente, email, contDB, assenzeDB, classi, scrutiniDB, colloquiDB, onDati }) {
  const [uid, setUid] = useState(null);
  const [classiAttive, setClassiAttive] = useState([]);
  const timer = useRef(null);
  const lastPub = useRef({});
  const onDatiRef = useRef(onDati);
  onDatiRef.current = onDati;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUid(id);
      if (id && email) void registraRubrica(id, email, docente);
    });
  }, [email, docente]);

  const ricarica = useCallback(async () => {
    if (!uid) return;
    const inviti = await listaCondivisioni();
    const attive = inviti.filter(
      (i) =>
        i.stato === "attiva" &&
        i.sync_attiva &&
        (i.mittente_id === uid || i.destinatario_id === uid),
    );
    const cls = [...new Set(attive.map((i) => i.classe))];
    setClassiAttive(cls);
    if (!cls.length) {
      onDatiRef.current?.({});
      return;
    }
    const { data, error } = await supabase.from("condivisione_dati").select("*").in("classe", cls);
    if (error) return;
    const mappa = {};
    (data || []).forEach((r) => {
      if (r.owner_id === uid) return;
      const p = r.payload || {};
      mappa[r.owner_id] = { ...p, classe: r.classe, docente: p.docente || r.owner_nome || "Collega" };
    });
    onDatiRef.current?.(mappa);
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

  // Pubblicazione dei propri dati (debounce), solo per le classi con sync attiva
  useEffect(() => {
    if (!uid || !classiAttive.length) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      classiAttive.forEach((cl) => {
        const payload = buildPayloadClasse({ docente, classe: cl, contDB, assenzeDB, classi, scrutiniDB, colloquiDB });
        if (!payload) return;
        const s = JSON.stringify(payload);
        if (lastPub.current[cl] === s) return;
        lastPub.current[cl] = s;
        void pubblicaDatiClasse(uid, docente, cl, payload);
      });
    }, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [uid, classiAttive, contDB, assenzeDB, classi, scrutiniDB, colloquiDB, docente]);

  return { classiAttive, ricarica };
}
