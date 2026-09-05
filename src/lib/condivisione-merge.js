// Estrazione e fusione dei dati di classe condivisi tra due docenti.
// I dati del collega vengono marcati con `_ext` così restano in sola lettura
// e non vengono mai salvati nel registro personale.



const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const nomeAlunno = (a) => `${a?.cognome ?? ""} ${a?.nome ?? ""}`.trim();

/** Chiavi di contDB che appartengono a una classe. */
const chiaviClasse = (contDB, classe) =>
  Object.keys(contDB || {}).filter(
    (k) =>
      k === `__class__${classe}` ||
      k === `__ass__${classe}` ||
      k === `__perm__${classe}` ||
      k === classe ||
      k.startsWith(`${classe}||`),
  );

/** Costruisce il pacchetto dati da pubblicare per una classe. */
export function estraiPayloadClasse(opts) {
  const { classe, contDB = {}, assenzeDB = {}, classi = {}, prog = {}, autore } = opts;
  const cont = {};
  chiaviClasse(contDB, classe).forEach((k) => {
    cont[k] = contDB[k];
  });
  const comunicazioni = (contDB["__comunicazioni__"]?.comunicazioni || []).filter(
    (c) => !c?.classiCom?.length || c.classiCom.includes(classe),
  );
  const roster = (classi[classe] || []).map((a) => ({ id: a.id, nome: nomeAlunno(a) }));
  const teams = (prog?.teams || []).filter((t) => !t?.classiSel?.length || t.classiSel.includes(classe));
  const verbali = (prog?.verbali || []).filter((v) => !v?.classiSel?.length || v?.classe === classe || !v?.classe);
  return {
    autore,
    roster,
    cont,
    comunicazioni,
    assenze: assenzeDB[classe] || {},
    prog: { teams, verbali },
  };
}

/** Sostituisce gli id alunno del collega con gli id locali (stessi nomi). */
function remap(value, idMap) {
  if (Array.isArray(value)) return value.map((v) => remap(v, idMap));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const nk = idMap.has(String(k)) ? String(idMap.get(String(k))) : k;
      out[nk] = remap(v, idMap);
    }
    return out;
  }
  if ((typeof value === "string" || typeof value === "number") && idMap.has(String(value)))
    return idMap.get(String(value));
  return value;
}

const marca = (item, autore, tag) =>
  item && typeof item === "object"
    ? { ...item, id: `ext${tag}_${item.id ?? Math.random().toString(36).slice(2)}`, _ext: true, _autore: autore }
    : item;

/**
 * Fonde i dati dei colleghi nelle strutture locali (solo per la lettura).
 * `righe` = elenco di { owner_id, owner_nome, classe, payload }.
 */
export function fondiEsterni(opts) {
  const { righe } = opts;
  if (!righe?.length) return { contDB: opts.contDB, assenzeDB: opts.assenzeDB, prog: opts.prog || {} };

  const contDB = { ...(opts.contDB || {}) };
  const assenzeDB = { ...(opts.assenzeDB || {}) };
  const prog = { ...(opts.prog || {}) };

  righe.forEach((r) => {
    const classe = r.classe;
    const p = r.payload || {};
    const autore = p.autore || r.owner_nome || "Collega";
    const tag = String(r.owner_id || "x").slice(0, 6);

    // mappa nome → id locale
    const idMap = new Map();
    const locali = (opts.classi?.[classe] || []);
    const perNome = new Map(locali.map((a) => [norm(nomeAlunno(a)), a.id]));
    (p.roster || []).forEach((a) => {
      const own = perNome.get(norm(a.nome));
      if (own !== undefined && String(own) !== String(a.id)) idMap.set(String(a.id), own);
    });

    const cont = remap(p.cont || {}, idMap);
    Object.entries(cont).forEach(([k, sezioni]) => {
      const base = { ...(contDB[k] || {}) };
      Object.entries((sezioni) || {}).forEach(([sez, arr]) => {
        if (!Array.isArray(arr)) return;
        base[sez] = [...(Array.isArray(base[sez]) ? base[sez] : []), ...arr.map((it) => marca(it, autore, tag))];
      });
      contDB[k] = base;
    });

    const comun = remap(p.comunicazioni || [], idMap);
    if (comun.length) {
      const cur = contDB["__comunicazioni__"]?.comunicazioni || [];
      contDB["__comunicazioni__"] = {
        ...(contDB["__comunicazioni__"] || {}),
        comunicazioni: [...cur, ...comun.map((c) => marca(c, autore, tag))],
      };
    }

    const ass = remap(p.assenze || {}, idMap);
    if (Object.keys(ass).length) {
      const cur = { ...(assenzeDB[classe] || {}) };
      Object.entries(ass).forEach(([sid, arr]) => {
        if (!Array.isArray(arr)) return;
        cur[sid] = [...(Array.isArray(cur[sid]) ? cur[sid] : []), ...arr.map((a) => marca(a, autore, tag))];
      });
      assenzeDB[classe] = cur;
    }

    const pt = p.prog || {};
    if (pt.teams?.length) prog.teams = [...(prog.teams || []), ...pt.teams.map((t) => marca(t, autore, tag))];
    if (pt.verbali?.length)
      prog.verbali = [...(prog.verbali || []), ...pt.verbali.map((v) => marca(v, autore, tag))];
  });

  return { contDB, assenzeDB, prog };
}

/** Rimuove ricorsivamente gli elementi del collega prima di salvare. */
export function togliEsterni(value) {
  if (Array.isArray(value)) return value.filter((v) => !(v && typeof v === "object" && v._ext)).map(togliEsterni);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = togliEsterni(v);
    return out;
  }
  return value;
}
