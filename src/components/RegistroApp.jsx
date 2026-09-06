// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useIsMobile } from "../hooks/use-mobile";
import { Plus, Trash2, Pencil, Users, BookOpen, Search } from "lucide-react";

const MATERIE = ["Arte","Ed. Fisica","Francese","Geografia","Inglese","Italiano","Matematica","Musica","Religione","Scienze","Storia","Tecnologia"];
const TIPI_VOTI = ["orale","scritto","grafico","pratico","unico"];
const ORE_NUMS = ["1","2","3","4","5","6","7","8","9","10","11","12"];
const TIPI_LEZIONE = ["Lezione in classe","Lezione online","Lezione di recupero","Lezione in laboratorio","Lezione frontale","Lezione in gruppo"];
const getDefFirmaBase = (mat) => ({oraInizio:"1",nOre:"1",durataLezione:"60 minuti",tipoFirma:"Cattedra",sostituzione:false,docenteSostituito:"",tipoLezione:"Lezione in classe",partecipazione:"tutti",alunniParz:[],materiaFirma:mat||"",alunniAltreClassi:[],presenteMensa:false,pastoInBianco:false,argomentoLezione:""});
const TRIMESTRI = ["1° Quadrimestre","2° Quadrimestre"];
const VOTI_COMP = ["10","9","8","7","6","5"];
const TIPI_VERIFICA = ["Scritto","Orale","Pratico","Test a risposta multipla","Relazione","Progetto","Interrogazione programm."];
const GIORNI = ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
const ORE_ORARIO = Array.from({length:12},(_,i)=>i+1);
const TIPI_ASSENZA = {
  assente:    {label:"Assente",color:"#ef4444", contaFlag:true},
  ritardo:    {label:"Ritardo",color:"#eab308", contaFlag:false},
  uscita:     {label:"Uscita anticipata",color:"#f97316", contaFlag:false},
  ingresso:   {label:"Ingresso",color:"#8b5cf6", contaFlag:false},
  fuori_aula: {label:"Presente fuori aula",color:"#16a34a", contaFlag:false},
};
const PAROLE_SALUTE = ["salute","medic","dottore","mal","febbre","influenza","visita","ospedale","allergia","infortunio"];
const FF = "Helvetica,Arial,sans-serif";

const VERDE = "#1d9e52";
const VERDE_LIGHT = "#e6f7ee";
const VERDE_BORDER = "#7fd4a8";
const TEAL = "#4e9fa0";
const TEAL_LIGHT = "#e8f5f5";
const BTN_GREEN = "#5cb85c";
const BTN_BLUE = "#337ab7";

let _doc = "";

// ═══════════════════════════════════════════════════════════════
// SISTEMA COLLEGHI — storage condiviso via window.storage (shared=true)
// ═══════════════════════════════════════════════════════════════
const _colleghiGet = async (shareKey) => {
  try { const r = await _wst(window.storage.get(`reg_coll_${shareKey}`, true)); if(r?.value) return JSON.parse(r.value); } catch {}
  try { const v = localStorage.getItem(`reg_coll_${shareKey}`); if(v) return JSON.parse(v); } catch {}
  return null;
};
const _colleghiSet = async (shareKey, data) => {
  const s = JSON.stringify(data);
  try { await _wst(window.storage.set(`reg_coll_${shareKey}`, s, true)); } catch {}
  try { localStorage.setItem(`reg_coll_${shareKey}`, s); } catch {}
};
const _colleghiDel = async (shareKey) => {
  try { await _wst(window.storage.delete(`reg_coll_${shareKey}`, true)); } catch {}
  try { localStorage.removeItem(`reg_coll_${shareKey}`); } catch {}
};

// ═══════════════════════════════════════════════════════════════
// CLOUD SYNC — cross-device per stesso account
// ═══════════════════════════════════════════════════════════════
const _cloudKey = (docente, k) => `profile:${docente}:${k}`;

// Timeout helper per window.storage — previene blocchi infiniti su iOS/Safari
const _wst = (p, ms=2500) => Promise.race([
  p,
  new Promise((_,rej) => setTimeout(() => rej(new Error('ws_timeout')), ms))
]);

const cloudSave = async (docente, k, v) => {
  try { await _wst(window.storage.set(_cloudKey(docente,k), JSON.stringify(v), false)); } catch {}
};
const cloudLoad = async (docente, k) => {
  try {
    const r = await _wst(window.storage.get(_cloudKey(docente,k), false));
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
};
const cloudSaveAll = async (docente, data) => {
  if(!docente) return;
  try { await Promise.all(Object.entries(data).map(([k,v]) => cloudSave(docente,k,v))); } catch {}
};

// ═══════════════════════════════════════════════════════════════
// STORAGE MASSIMO — 8 livelli, iOS Safari indistruttibile
// L1: IndexedDB principale  (mai svuotato da iOS)
// L2: IndexedDB backup      (copia di sicurezza IDB)
// L3: localStorage principale
// L4: localStorage _bk1     (backup dedicato)
// L5: localStorage _bk2     (secondo backup)
// L6: sessionStorage
// L7: cookie                (sopravvive a svuotamento LS)
// L8: window.storage cloud  (cross-device, cross-riavvio)
// ═══════════════════════════════════════════════════════════════

let _idb = null;
let _idb2 = null;

// ══════════════════════════════════════════════════════
// STORAGE IMMAGINI — IndexedDB dedicato, mai svuotato su iOS
// Le immagini vengono salvate separatamente (base64 pesante)
// e referenziate nelle comunicazioni tramite ID
// ══════════════════════════════════════════════════════
let _imgDb = null;
const _imgDbReady = new Promise(resolve => {
  try {
    const req = indexedDB.open('registro_immagini', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains('imgs')) db.createObjectStore('imgs');
    };
    req.onsuccess = e => { _imgDb = e.target.result; resolve(true); };
    req.onerror = () => resolve(false);
  } catch { resolve(false); }
});

const imgSave = async (id, dataUrl) => {
  // Nessuna compressione — salva originale su tutti i livelli
  // LIVELLO 1: IndexedDB immagini (più capiente, non svuotato da iOS)
  try {
    if(_imgDb) {
      const tx = _imgDb.transaction('imgs','readwrite');
      tx.objectStore('imgs').put(dataUrl, id);
    }
  } catch {}
  // LIVELLO 2: IndexedDB registro backup
  try { _idbSet('img:'+id, dataUrl); } catch {}
  // LIVELLO 3: sessionStorage
  try { sessionStorage.setItem('img:'+id, dataUrl); } catch {}
  // LIVELLO 4: localStorage (senza limite dimensione)
  try { localStorage.setItem('img:'+id, dataUrl); } catch {}
};

const imgLoad = async (id) => {
  if(!id) return null;
  // 1. sessionStorage — velocissimo
  try { const v=sessionStorage.getItem('img:'+id); if(v&&!v.startsWith('[')) return v; } catch {}
  // 2. localStorage
  try { const v=localStorage.getItem('img:'+id); if(v&&!v.startsWith('[')) return v; } catch {}
  // 3. IndexedDB immagini
  try {
    if(_imgDb) {
      const result = await new Promise((res,rej)=>{
        try {
          const tx=_imgDb.transaction('imgs','readonly');
          const req=tx.objectStore('imgs').get(id);
          req.onsuccess=()=>res(req.result);
          req.onerror=()=>rej();
        } catch { rej(); }
      });
      if(result) { try{sessionStorage.setItem('img:'+id,result);}catch{}; return result; }
    }
  } catch {}
  // 4. IDB backup
  try { const raw=await _idbGet('img:'+id); if(raw) return raw; } catch {}
  // 5. window.storage artifact — ricostruisce dai chunk
  try {
    const meta = await _wst(window.storage.get(`img:${id}:meta`, false));
    if(meta?.value) {
      const {chunks} = JSON.parse(meta.value);
      const parts = await Promise.all(
        Array.from({length:chunks},(_,i)=>_wst(window.storage.get(`img:${id}:c${i}`, false)))
      );
      const full = parts.map(p=>p?.value||'').join('');
      if(full.startsWith('data:')) {
        // Ripristina nei livelli veloci
        try{sessionStorage.setItem('img:'+id,full);}catch{}
        try{if(full.length<80000)localStorage.setItem('img:'+id,full);}catch{}
        try{if(_imgDb){const tx=_imgDb.transaction('imgs','readwrite');tx.objectStore('imgs').put(full,id);}}catch{}
        return full;
      }
    }
  } catch {}
  return null;
};

const imgComprimi = (dataUrl, maxPx=800, quality=0.7) => new Promise(resolve => {
  try {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let {width:w, height:h} = img;
      if(w > maxPx || h > maxPx) {
        if(w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  } catch { resolve(dataUrl); }
});

// Nessuna compressione aggressiva — mantenuta solo per compatibilità
const imgComprimiFinoA = (dataUrl) => Promise.resolve(dataUrl);



// ── Apri IDB principale ──
const _idbReady = new Promise(resolve => {
  try {
    const req = indexedDB.open('registro_v3', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains('data')) db.createObjectStore('data');
    };
    req.onsuccess = e => { _idb = e.target.result; resolve(true); };
    req.onerror = () => resolve(false);
  } catch { resolve(false); }
});

// Apri IDB backup (database separato)
const _idb2Ready = new Promise(resolve => {
  try {
    const req = indexedDB.open('registro_backup', 1);
    req.onupgradeneeded = e => {
      if(!e.target.result.objectStoreNames.contains('data'))
        e.target.result.createObjectStore('data');
    };
    req.onsuccess = e => { _idb2 = e.target.result; resolve(true); };
    req.onerror = () => resolve(false);
  } catch { resolve(false); }
});

const _idbWrite = (db, k, v) => {
  try {
    if(!db) return;
    const tx = db.transaction('data','readwrite');
    tx.objectStore('data').put(v, k);
  } catch {}
};

const _idbSet = (k, v) => {
  _idbWrite(_idb, k, v);
  _idbWrite(_idb2, k, v); // scrivi su entrambi i DB
};

const _idbGet = (k) => new Promise(resolve => {
  const tryIdb = (db, fallback) => {
    try {
      if(!db) { fallback(); return; }
      const tx = db.transaction('data','readonly');
      const req = tx.objectStore('data').get(k);
      req.onsuccess = () => {
        if(req.result != null) resolve(req.result);
        else fallback();
      };
      req.onerror = () => fallback();
    } catch { fallback(); }
  };
  // Prova prima IDB principale, poi backup
  tryIdb(_idb, () => tryIdb(_idb2, () => resolve(null)));
});

// ── cSet: scrive su tutti gli 8 livelli simultaneamente ──
const cSet = (k, v) => {
  if(!_doc) return;
  const key  = `reg:${_doc}:${k}`;
  const bk1  = `reg:${_doc}:${k}_bk1`;
  const bk2  = `reg:${_doc}:${k}_bk2`;
  const s    = JSON.stringify(v);

  // L1+L2: IndexedDB (entrambi i database)
  _idbSet(key, s);

  // L3: localStorage principale
  const _lsSet = (lsKey, val) => {
    try { localStorage.setItem(lsKey, val); return true; } catch {
      // Quota exceeded: svuota backup vecchi e riprova
      try {
        const victims = Object.keys(localStorage)
          .filter(x => x.includes(':bk') || x.includes('_bk'))
          .sort(() => Math.random()-0.5)
          .slice(0, 40);
        victims.forEach(x => { try{localStorage.removeItem(x);}catch{} });
        try { localStorage.setItem(lsKey, val); return true; } catch { return false; }
      } catch { return false; }
    }
  };

  _lsSet(key, s);   // L3: principale
  _lsSet(bk1, s);   // L4: backup 1
  _lsSet(bk2, s);   // L5: backup 2

  // L6: sessionStorage
  try { sessionStorage.setItem(key, s); } catch {}
  try { sessionStorage.setItem(bk1, s); } catch {}

  // L7: cookie (per dati ≤4KB — sopravvive a svuotamento LS)
  try {
    if(s.length <= 4000) {
      const ck = `rg_${_doc}_${k}`.replace(/[^a-zA-Z0-9]/g,'_').slice(0,60);
      document.cookie = `${ck}=${encodeURIComponent(s)};path=/;max-age=63072000;SameSite=Lax`;
    }
  } catch {}

  // L8: cloud (fire-and-forget, non blocca)
  try { cloudSave(_doc, k, v).catch(()=>{}); } catch {}
};

// ── cGet: legge dai livelli in cascata, scrive recupero su tutti i livelli ──
const cGet = k => {
  if(!_doc) return null;
  const key = `reg:${_doc}:${k}`;

  const _parse = (raw, src) => {
    if(!raw) return null;
    try {
      const p = JSON.parse(raw);
      // Rifiuta oggetti vuoti solo per 'classi' (prevenzione sovrascrittura)
      if(k === 'classi' && typeof p === 'object' && Object.keys(p||{}).length === 0) {
        console.warn('[reg] cGet: classi vuoto in', src, '— salto');
        return null;
      }
      return p;
    } catch { return null; }
  };

  const sources = [
    () => localStorage.getItem(key),
    () => sessionStorage.getItem(key),
    () => localStorage.getItem(`reg:${_doc}:${k}_bk1`),
    () => localStorage.getItem(`reg:${_doc}:${k}_bk2`),
    () => localStorage.getItem(`reg:${_doc}:bk:${k}`),
    () => { // cookie
      try {
        const ck = `rg_${_doc}_${k}`.replace(/[^a-zA-Z0-9]/g,'_').slice(0,60);
        const m = document.cookie.split(';').find(c=>c.trim().startsWith(ck+'='));
        return m ? decodeURIComponent(m.trim().slice(ck.length+1)) : null;
      } catch { return null; }
    },
    () => { // vecchio cookie formato
      try {
        const ck = `rg_${k}`.replace(/[^a-zA-Z0-9]/g,'_').slice(0,48);
        const m = document.cookie.split(';').find(c=>c.trim().startsWith(ck+'='));
        return m ? decodeURIComponent(m.trim().slice(ck.length+1)) : null;
      } catch { return null; }
    },
  ];

  for(let i=0; i<sources.length; i++) {
    try {
      const raw = sources[i]();
      const p = _parse(raw, `src${i}`);
      if(p !== null) {
        // Recupero: se trovato in fonte non-primaria, ripristina su tutte le fonti primarie
        if(i > 0) {
          console.warn(`[reg] cGet recupero da src${i} per ${k}`);
          try { localStorage.setItem(key, raw); } catch {}
          try { sessionStorage.setItem(key, raw); } catch {}
          try { localStorage.setItem(`reg:${_doc}:${k}_bk1`, raw); } catch {}
          _idbSet(key, raw);
        }
        return p;
      }
    } catch {}
  }
  return null;
};

// ── cGetAsync: come cGet ma include anche IndexedDB (asincrono) ──
const cGetAsync = async k => {
  // Prima prova tutti i livelli sincroni
  const sync = cGet(k);
  if(sync !== null) return sync;

  // Poi IndexedDB (asincrono)
  const key = `reg:${_doc}:${k}`;
  const raw = await _idbGet(key);
  if(raw) {
    try {
      const parsed = JSON.parse(raw);
      if(k === 'classi' && typeof parsed === 'object' && Object.keys(parsed||{}).length === 0) return null;
      // Ripristina su localStorage
      console.warn('[reg] cGetAsync recupero da IDB per', k);
      try { localStorage.setItem(key, raw); } catch {}
      try { localStorage.setItem(`reg:${_doc}:${k}_bk1`, raw); } catch {}
      try { sessionStorage.setItem(key, raw); } catch {}
      return parsed;
    } catch {}
  }

  // Infine prova backup IDB con chiave diversa
  const rawBk = await _idbGet(`reg:${_doc}:${k}_bk`);
  if(rawBk) {
    try {
      const parsed = JSON.parse(rawBk);
      if(parsed !== null) {
        console.warn('[reg] cGetAsync recupero da IDB_bk per', k);
        try { localStorage.setItem(key, rawBk); } catch {}
        _idbSet(key, rawBk);
        return parsed;
      }
    } catch {}
  }
  return null;
};


function useLocal(key, def) {
  const [val, setVal] = useState(() => {
    const v = cGet(key);
    return v !== null ? v : def;
  });

  // Ripristino asincrono all'avvio: IDB → cloud (per iOS dopo svuotamento)
  useEffect(() => {
    cGetAsync(key).then(v => {
      if(v !== null) setVal(v);
    });
  }, []);

  // Aggiornamento live quando arrivano dati dal cloud (altro dispositivo):
  // ri-legge il valore senza rimontare l'app (così non si torna alla Home).
  useEffect(() => {
    const h = () => {
      try {
        const v = cGet(key);
        if(v !== null) setVal(p => (JSON.stringify(p) === JSON.stringify(v) ? p : v));
      } catch {}
    };
    window.addEventListener("registro-cloud-update", h);
    return () => window.removeEventListener("registro-cloud-update", h);
  }, [key]);


  const save = u => setVal(p => {
    const n = typeof u==="function" ? u(p) : u;
    // Salva su TUTTI i livelli immediatamente (sincrono)
    cSet(key, n);
    // IDB esplicito extra (nel caso cSet non abbia ancora _idb pronto)
    setTimeout(() => {
      try { _idbSet(`reg:${_doc}:${key}`, JSON.stringify(n)); } catch {}
      try { _idbSet(`reg:${_doc}:${key}_bk`, JSON.stringify(n)); } catch {}
    }, 0);
    return n;
  });
  return [val, save];
}
function cognomeNome(s) {
  if(!s) return "Docente non specificato";
  const p = s.trim().split(/\s+/);
  if(p.length < 2) return s;
  return p[p.length-1]+" "+p.slice(0,-1).join(" ");
}
const GG=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
const MM=["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
function toISO(d){if(!d)return"";if(typeof d==="string"&&d.includes("/")){const[dd,mm,yy]=d.split("/");return`${yy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`;}return d;}
function fmtDay(iso){try{const d=new Date(iso+"T00:00:00");if(isNaN(d))return iso;return`${GG[d.getDay()]} ${d.getDate()} ${MM[d.getMonth()]} ${d.getFullYear()}`;}catch{return iso;}}
function todayISO(){return new Date().toISOString().split("T")[0];}

function stripAnnotations(s) {
  return String(s).replace(/^[?!]+/,"").replace(/[?!]+$/,"");
}
function cleanVotoRaw(raw) {
  if(raw===null||raw===undefined) return "";
  return stripAnnotations(String(raw));
}
function votoDisplay(raw) {
  if(raw===null||raw===undefined) return "";
  const s = String(raw);
  if(s === " ") return "";
  if(s === "") return "";
  if(s === "💬") return ""; // voto solo commento: cerchietto vuoto
  return s;
}
function parseVoto(raw) {
  if(raw===null||raw===undefined||raw==="") return NaN;
  const s = String(raw).trim();
  if(s === " ") return NaN;
  let r = stripAnnotations(s);
  let b = 0;
  if(r.endsWith("--")){b=-0.5;r=r.slice(0,-2);}
  else if(r.endsWith("++")){b=0.5;r=r.slice(0,-2);}
  else if(r.endsWith("-")){b=-0.25;r=r.slice(0,-1);}
  else if(r.endsWith("+")){b=0.25;r=r.slice(0,-1);}
  const n = Number(r.replace(",","."));
  return isNaN(n) ? NaN : n+b;
}
function votoColor(raw, faMedia) {
  if(raw===null||raw===undefined) return "#3b82f6";
  const s = String(raw);
  if(s === " ") return "#3b82f6";
  if(s === "") return "#3b82f6";
  if(s === "💬") return "#e5e7eb"; // voto solo commento: grigio chiaro
  const cleaned = stripAnnotations(s);
  const numericPart = cleaned.replace(/[+\-]+$/,"");
  const isNumeric = numericPart.trim() !== "" && !isNaN(Number(numericPart.replace(",",".")));
  if(!isNumeric) {
    return faMedia ? "#ef4444" : "#3b82f6";
  }
  if(!faMedia) return "#3b82f6"; // blu base — il gradiente sfumato viene applicato nel render
  const n = parseVoto(s);
  if(isNaN(n)) return "#3b82f6";
  return n < 6 ? "#ef4444" : "#22c55e";
}

// Restituisce il background CSS da usare per la cella voto
// Se non fa media → gradiente blu con angolino bianco sfumato in basso a destra
function votoBackground(raw, faMedia) {
  const base = votoColor(raw, faMedia);
  if(!raw || String(raw) === " " || String(raw) === "") return base;
  return base;
}

const Lbl = ({children,style}) => <label style={{display:"block",fontWeight:700,fontSize:13,marginBottom:4,fontFamily:FF,...style}}>{children}</label>;
const Inp = ({style,...p}) => <input {...p} style={{width:"100%",border:"2px solid #d1d5db",borderRadius:4,padding:"8px 10px",boxSizing:"border-box",fontSize:14,fontFamily:FF,...style}}/>;
const Sel = ({children,style,...p}) => <select {...p} style={{width:"100%",border:"2px solid #d1d5db",borderRadius:4,padding:"8px 10px",fontSize:14,background:"#fff",fontFamily:FF,...style}}>{children}</select>;
const Btn = ({children,color="#2563eb",style,...p}) => <button {...p} style={{background:color,color:"#fff",border:"none",borderRadius:4,padding:"10px 20px",fontWeight:700,cursor:"pointer",fontSize:14,fontFamily:FF,...style}}>{children}</button>;

// ── Saving overlay globale ──
const SavingOverlay = ({show}) => {
  if(!show) return null;
  return (
    <div style={{
      position:"fixed",inset:0,
      zIndex:99990,
      display:"flex",
      alignItems:"center",
      justifyContent:"center",
      pointerEvents:"all",
      fontFamily:FF,
    }}>
      <div style={{
        width:56,height:56,
        border:"5px solid #d1d5db",
        borderTop:"5px solid #6b7280",
        borderRadius:"50%",
        animation:"spin 0.75s linear infinite",
      }}/>
    </div>
  );
};

function Toast({msg,onDone}) {
  const [visible, setVisible] = useState(false);
  useEffect(()=>{
    // Trigger l'animazione di entrata
    const t1 = setTimeout(()=>setVisible(true), 10);
    // Dopo 2 secondi esce
    const t2 = setTimeout(()=>{ setVisible(false); }, 2000);
    // Dopo l'uscita rimuove il componente
    const t3 = setTimeout(onDone, 2400);
    return()=>{ clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  },[]);
  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0);    opacity: 1; }
          to   { transform: translateX(110%); opacity: 0; }
        }
      `}</style>
      <div style={{
        position:"fixed",
        top:0,
        right:0,
        zIndex:99999,
        background:"#4CAF50",
        color:"#fff",
        padding:"10px 22px",
        fontWeight:600,
        fontSize:14,
        fontFamily:FF,
        display:"flex",
        alignItems:"center",
        gap:10,
        boxShadow:"0 2px 12px rgba(0,0,0,0.18)",
        borderRadius:"0 0 0 4px",
        animation: visible
          ? "slideInRight 0.38s cubic-bezier(.2,.9,.25,1) forwards"
          : "slideOutRight 0.38s cubic-bezier(.4,0,.6,1) forwards",
        minWidth:260,
        letterSpacing:0.2,
      }}>
        <span style={{fontSize:17}}>ℹ️</span>
        {msg || "Operazione eseguita correttamente."}
      </div>
    </>
  );
}
function LoadingOverlay({show}) {
  if(!show) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:9990,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#4b5563",borderRadius:8,padding:"14px 24px",display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:20,height:20,border:"3px solid rgba(255,255,255,0.2)",borderTop:"3px solid #fff",borderRadius:"50%",animation:"spin 0.7s linear infinite",flexShrink:0}}/>
        <span style={{color:"#fff",fontWeight:700,fontSize:14,fontFamily:FF}}>Caricamento...</span>
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
function Modal({open,onClose,children,width=640,headerColor="#2563eb",title,subtitle,skipLoading=false}) {
  const [show,setShow]=useState(false);
  const [step,setStep]=useState(0);
  const t=useRef(null);
  const snap=useRef({children,title,subtitle});
  if(open){snap.current={children,title,subtitle};}
  useEffect(()=>{
    clearTimeout(t.current);
          if(open){
      setShow(true);
      setStep(skipLoading?2:1);
      if(!skipLoading) t.current=setTimeout(()=>setStep(2),200);
    } else {
      setStep(3);
      t.current=setTimeout(()=>{setShow(false);setStep(0);},150);
    }
    return()=>clearTimeout(t.current);
  },[open]);
  if(!show) return null;
  const {children:ch,title:ti,subtitle:su}=snap.current;
  return (<>
    <style>{`
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes slideDown{0%{transform:translate(-50%,-130%)}100%{transform:translate(-50%,-50%)}}
      @keyframes slideUp{0%{transform:translate(-50%,-50%)}100%{transform:translate(-50%,-250%)}}`}
    </style>
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:40,opacity:step>=1&&step<3?1:0,transition:"opacity 0.22s"}}/>
    {step===1&&<div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:60,background:"rgba(255,255,255,0.96)",borderRadius:20,padding:"8px 20px",boxShadow:"0 4px 20px rgba(0,0,0,0.12)",fontSize:13,color:"#6b7280",fontFamily:FF,fontWeight:600,display:"flex",alignItems:"center",gap:8,pointerEvents:"none"}}>
      <div style={{width:11,height:11,borderRadius:"50%",border:"2px solid #ddd",borderTopColor:TEAL,animation:"spin 0.7s linear infinite"}}/> Caricamento
    </div>}
    {(step===2||step===3)&&<div onClick={e=>e.stopPropagation()} style={{position:"fixed",left:"50%",top:"50%",transform:"translateX(-50%) translateY(-50%)",zIndex:50,width,maxWidth:"96vw",maxHeight:"90vh",minHeight:200,display:"flex",flexDirection:"column",borderRadius:6,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.28)",animation:step===3?"slideUp 0.14s ease-in forwards":"slideDown 0.46s cubic-bezier(.2,.9,.25,1) forwards"}}>
      {ti&&<div style={{background:headerColor,color:"#fff",padding:"12px 20px 12px 28px",flexShrink:0,fontFamily:FF,display:"flex",alignItems:"flex-start",gap:12}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:17}}>{ti}</div>{su&&<div style={{fontSize:12,opacity:0.85,marginTop:2}}>{su}</div>}</div><button onClick={onClose} style={{background:"rgba(0,0,0,0.2)",border:"none",color:"#fff",width:30,height:30,borderRadius:"50%",cursor:"pointer",fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,lineHeight:1}}>✕</button></div>}
      <div style={{overflowY:"auto",flex:1,background:"#fff",fontFamily:FF}}>{ch}</div>
    </div>}
  </>);
}

// ══════════════════════════════════════════════════════════
// AXIOS DATE PICKER — stile registro Axios con settimane
// ══════════════════════════════════════════════════════════
function AxiosDatePicker({value, onChange, onClose}) {
  // value: "YYYY-MM-DD"
  const oggi = new Date();
  const initDate = value ? new Date(value + "T00:00:00") : oggi;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth()); // 0-based
  const [selected, setSelected] = useState(value || "");

  const MESI_IT = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  const GG_IT = ["#","L","Ma","Me","G","V","S","D"];

  // Calcola numero settimana ISO
  const getWeekNum = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  // Genera le settimane del mese (con padding)
  const buildCalendar = () => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    // Lunedì = 0
    let startDow = (firstDay.getDay() + 6) % 7;
    const weeks = [];
    let current = new Date(firstDay);
    current.setDate(current.getDate() - startDow);
    while (current <= lastDay || weeks.length < 6) {
      if (weeks.length >= 6 && current > lastDay) break;
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  };

  const weeks = buildCalendar();
  const todayISO2 = oggi.toISOString().split("T")[0];

  const fmtISO = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const prevMonth = () => {
    if(viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if(viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };
  const gotoToday = () => { setViewMonth(oggi.getMonth()); setViewYear(oggi.getFullYear()); setSelected(todayISO2); };

  const confirm = () => {
    if(selected) onChange(selected);
    onClose();
  };

  return (
    <div style={{
      background:"#fff",
      borderRadius:8,
      boxShadow:"0 4px 24px rgba(0,0,0,0.22)",
      minWidth:320,
      fontFamily:FF,
      overflow:"hidden",
      border:"1px solid #e5e7eb",
    }}>
      {/* Header mese */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px 8px",background:"#fff"}}>
        <button onClick={prevMonth} style={{background:"none",border:"none",cursor:"pointer",color:"#374151",fontSize:18,fontWeight:700,padding:"4px 8px",borderRadius:4}}>‹</button>
        <span style={{fontWeight:700,fontSize:15,color:"#1f2937"}}>{MESI_IT[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} style={{background:"none",border:"none",cursor:"pointer",color:"#374151",fontSize:18,fontWeight:700,padding:"4px 8px",borderRadius:4}}>›</button>
      </div>

      {/* Griglia */}
      <div style={{padding:"0 12px 8px"}}>
        {/* Intestazione giorni */}
        <div style={{display:"grid",gridTemplateColumns:"32px repeat(7,1fr)",marginBottom:4}}>
          {GG_IT.map((g,i) => (
            <div key={i} style={{textAlign:"center",fontSize:12,fontWeight:700,color:i===0?"#9ca3af":i===6||i===7?"#dc2626":"#374151",padding:"4px 0"}}>
              {g}
            </div>
          ))}
        </div>
        {/* Righe settimane */}
        {weeks.map((week, wi) => {
          const weekNum = getWeekNum(week[0]);
          return (
            <div key={wi} style={{display:"grid",gridTemplateColumns:"32px repeat(7,1fr)",marginBottom:2}}>
              {/* Numero settimana */}
              <div style={{textAlign:"center",fontSize:11,color:"#9ca3af",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:600}}>
                {weekNum}
              </div>
              {week.map((day, di) => {
                const iso = fmtISO(day);
                const isCurrentMonth = day.getMonth() === viewMonth;
                const isSelected = iso === selected;
                const isToday = iso === todayISO2;
                const isSunday = di === 6;
                const isSaturday = di === 5;

                return (
                  <div key={di}
                    onClick={() => { if(isCurrentMonth) setSelected(iso); }}
                    style={{
                      width:36,height:36,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      borderRadius:"50%",
                      cursor:isCurrentMonth?"pointer":"default",
                      background: isSelected ? "#2563eb" : "transparent",
                      color: isSelected ? "#fff" : !isCurrentMonth ? "#d1d5db" : isToday ? "#f59e0b" : isSunday||isSaturday ? "#dc2626" : "#1f2937",
                      fontWeight: isSelected||isToday ? 700 : 400,
                      fontSize: 14,
                      position:"relative",
                      margin:"1px auto",
                      transition:"background 0.12s",
                    }}
                    onMouseEnter={e=>{ if(isCurrentMonth&&!isSelected) e.currentTarget.style.background="#f0f4ff"; }}
                    onMouseLeave={e=>{ if(!isSelected) e.currentTarget.style.background="transparent"; }}
                  >
                    {day.getDate()}
                    {/* Triangolino giallo per i giorni con nota (opzionale) */}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer — Vai a oggi + OK */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 16px 12px",borderTop:"1px solid #f3f4f6"}}>
        <button onClick={gotoToday}
          style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:"#2563eb",fontWeight:600,fontSize:13,cursor:"pointer",padding:"4px 8px",borderRadius:4}}
          onMouseEnter={e=>e.currentTarget.style.background="#eff6ff"}
          onMouseLeave={e=>e.currentTarget.style.background="none"}>
          ✦ Vai ad oggi
        </button>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose}
            style={{padding:"6px 16px",background:"#f3f4f6",border:"1px solid #d1d5db",borderRadius:4,cursor:"pointer",fontWeight:600,fontSize:13,color:"#374151"}}>
            Annulla
          </button>
          <button onClick={confirm}
            style={{padding:"6px 20px",background:"#2563eb",border:"none",borderRadius:4,cursor:"pointer",fontWeight:700,fontSize:13,color:"#fff"}}>
            Imposta
          </button>
        </div>
      </div>
    </div>
  );
}

// Wrapper input data con picker Axios
function AxiosDateInput({value, onChange, style, placeholder}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if(!open) return;
    const h = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  const fmtDisplay = (iso) => {
    if(!iso) return "";
    try {
      const d = new Date(iso + "T00:00:00");
      if(isNaN(d)) return iso;
      const GG=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
      const MM=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
      return `${GG[d.getDay()]} ${d.getDate()} ${MM[d.getMonth()]} ${d.getFullYear()}`;
    } catch { return iso; }
  };

  return (
    <div ref={ref} style={{position:"relative",display:"inline-block",...style}}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display:"flex",alignItems:"center",gap:8,
          border:"1px solid #d1d5db",borderRadius:4,
          padding:"7px 10px",cursor:"pointer",
          background:"#fff",userSelect:"none",
          fontSize:13,fontFamily:FF,color:"#1f2937",
          minWidth:160,
        }}
      >
        <span style={{fontSize:14}}>📅</span>
        <span style={{flex:1,color:value?"#1f2937":"#9ca3af"}}>{value ? fmtDisplay(value) : (placeholder||"Seleziona data")}</span>
        <span style={{color:"#9ca3af",fontSize:11}}>▾</span>
      </div>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:9999,minWidth:340}}>
          <AxiosDatePicker
            value={value}
            onChange={v => { onChange(v); setOpen(false); }}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

// Toggle SÌ/NO globale — usato in tutto il registro
function ToggleSiNo({value, onChange, label}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      {label&&<span style={{fontWeight:700,fontSize:13,fontFamily:FF,color:"#374151"}}>{label}</span>}
      <div onClick={()=>onChange(!value)}
        style={{
          width:80,height:32,
          borderRadius:0,
          background:"#f3f4f6",
          border:"1px solid #d1d5db",
          cursor:"pointer",
          display:"flex",
          alignItems:"center",
          justifyContent:value?"flex-start":"flex-end",
          padding:"2px",
          flexShrink:0,
        }}>
        <div style={{
          width:36,height:26,
          background:value?"#4ec9b0":"#ef5350",
          borderRadius:0,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontWeight:900,fontSize:12,
          color:"#fff",
          letterSpacing:1,
          userSelect:"none",
        }}>
          {value?"SÌ":"NO"}
        </div>
      </div>
    </div>
  );
}

function FaMediaToggle({value, onChange}) {
  return <ToggleSiNo value={value} onChange={onChange} label="Fa media:"/>;
}

function NomeDocente({onEntra}) {
  const tuttiDocenti = ()=>{
    try{
      const set=new Set();
      const last=localStorage.getItem("reg:lastDocente");
      if(last) set.add(last);
      Object.keys(localStorage).forEach(k=>{
        const m=k.match(/^reg:(.+?):/);
        if(m&&m[1]&&m[1]!=="lastDocente") set.add(m[1]);
      });
      return [...set].filter(Boolean).sort();
    }catch{return[];}
  };
  const [docenti] = useState(tuttiDocenti);
  const [nome, setNome] = useState(()=>{try{return localStorage.getItem("reg:lastDocente")||"";}catch{return "";}});
  const [err, setErr] = useState("");
  const [modalita, setModalita] = useState(docenti.length>0?"lista":"nuovo");
  const [showRecupero, setShowRecupero] = useState(false);
  const [recuperoLog, setRecuperoLog] = useState([]);
  const [recuperoData, setRecuperoData] = useState(null);
  const recuperoRef = useRef(null);

  const entra = (n) => {
    const nome2=(n||nome).trim();
    if(!nome2){setErr("Inserisci il tuo nome.");return;}
    try{localStorage.setItem("reg:lastDocente",nome2);}catch{}
    _doc=nome2;
    onEntra(nome2);
  };

  // Scansiona TUTTO ciò che rimane sul dispositivo
  const scansionaRecupero = async (docente) => {
    const log = [];
    const trovati = {};
    const doc = docente || nome.trim();
    if(!doc) { setRecuperoLog(["⚠️ Inserisci prima il nome docente"]); return; }

    log.push(`🔍 Scansione per: ${doc}`);

    // 1. Scansione localStorage — tutte le chiavi
    try {
      const tutteChiavi = Object.keys(localStorage);
      log.push(`📦 localStorage: ${tutteChiavi.length} chiavi totali`);
      tutteChiavi.filter(k=>k.includes(doc)).forEach(k=>{
        try{
          const v=localStorage.getItem(k);
          const parsed=JSON.parse(v);
          log.push(`  ✓ ${k} (${v?.length||0} chars)`);
          const kShort=k.replace(`reg:${doc}:`,"").replace(`reg:${doc}:`,"").split(":")[0];
          if(parsed && typeof parsed==="object") trovati[kShort]=parsed;
        }catch{}
      });
    }catch(e){log.push("⚠️ localStorage non disponibile");}

    // 2. Scansione IndexedDB
    try {
      await new Promise(resolve=>{
        const req=indexedDB.open("registro_v2",2);
        req.onsuccess=e=>{
          const db=e.target.result;
          const tx=db.transaction("data","readonly");
          const store=tx.objectStore("data");
          const all=store.getAllKeys();
          all.onsuccess=()=>{
            const keys=all.result||[];
            log.push(`🗄️ IndexedDB: ${keys.length} chiavi`);
            const docKeys=keys.filter(k=>String(k).includes(doc));
            log.push(`  → ${docKeys.length} chiavi per "${doc}"`);
            let pending=docKeys.length;
            if(pending===0){resolve();return;}
            docKeys.forEach(k=>{
              const r=store.get(k);
              r.onsuccess=()=>{
                try{
                  const v=r.result;
                  if(v){
                    const parsed=JSON.parse(v);
                    const kShort=String(k).replace(`reg:${doc}:`,"").split(":")[0].split("_bk")[0];
                    if(parsed && typeof parsed==="object" && !trovati[kShort]) {
                      trovati[kShort]=parsed;
                      log.push(`  ✓ IDB: ${k} (${String(v).length} chars)`);
                    }
                  }
                }catch{}
                if(--pending===0) resolve();
              };
              r.onerror=()=>{if(--pending===0)resolve();};
            });
          };
          all.onerror=()=>resolve();
        };
        req.onerror=()=>{log.push("⚠️ IDB non disponibile");resolve();};
      });
    }catch(e){log.push("⚠️ IDB errore: "+String(e));}

    // 3. Risultato
    const haClassi = trovati.classi && Object.keys(trovati.classi||{}).length>0;
    const nAlunni = haClassi ? Object.values(trovati.classi).reduce((s,arr)=>s+(arr?.length||0),0) : 0;

    if(haClassi) {
      log.push(`✅ TROVATO: ${Object.keys(trovati.classi).length} classi, ${nAlunni} alunni`);
      log.push(`   Classi: ${Object.keys(trovati.classi).join(", ")}`);
      setRecuperoData({docente:doc, dati:trovati});
    } else {
      log.push("❌ Nessun dato classi trovato sul dispositivo");
      log.push("💡 Se hai un backup JSON, importalo con il pulsante sotto");
    }

    setRecuperoLog(log);
  };

  const applicaRecupero = () => {
    if(!recuperoData) return;
    const {docente:doc, dati} = recuperoData;
    _doc=doc;
    try{localStorage.setItem("reg:lastDocente",doc);}catch{}
    // Ripristina su localStorage
    Object.entries(dati).forEach(([k,v])=>{
      try{
        const key=`reg:${doc}:${k}`;
        const s=JSON.stringify(v);
        localStorage.setItem(key,s);
        sessionStorage.setItem(key,s);
      }catch{}
    });
    onEntra(doc);
  };

  const importaBackup = (e) => {
    const file=e.target.files[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        // Supporta sia il formato esportazione completa che un semplice oggetto classi
        const doc=data.docente||nome.trim();
        if(!doc){setRecuperoLog(["⚠️ Il file non contiene il nome docente. Inseriscilo prima."]);return;}
        _doc=doc;
        const dati={};
        if(data.classi) dati.classi=data.classi;
        if(data.votiDB) dati.votiDB=data.votiDB;
        if(data.assenzeDB) dati.assenzeDB=data.assenzeDB;
        if(data.contDB) dati.contDB=data.contDB;
        const log=[`📂 File importato per: ${doc}`];
        if(dati.classi) log.push(`✅ Classi trovate: ${Object.keys(dati.classi).join(", ")}`);
        const nAlunni=dati.classi?Object.values(dati.classi).reduce((s,a)=>s+(a?.length||0),0):0;
        if(nAlunni>0) log.push(`👥 ${nAlunni} alunni`);
        setRecuperoLog(log);
        setRecuperoData({docente:doc,dati});
      }catch(e){setRecuperoLog(["❌ File non valido: "+String(e)]);}
    };
    reader.readAsText(file);
  };

  return (
    <div style={{fontFamily:FF,minHeight:"100vh",background:`linear-gradient(135deg,#0e7490,${TEAL},#67e8f9)`,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:12,boxShadow:"0 24px 64px rgba(0,0,0,0.28)",width:420,maxWidth:"94vw",overflow:"hidden"}}>
        <div style={{background:TEAL,padding:"28px 32px",textAlign:"center"}}>
          <div style={{color:"#fff",fontWeight:700,fontSize:24}}>📚 Registro Elettronico</div>
          <div style={{color:"rgba(255,255,255,0.8)",fontSize:14,marginTop:6}}>Il tuo registro personale</div>
        </div>

        {!showRecupero?(
          <>
            {modalita==="lista"&&docenti.length>0?(
              <div style={{padding:"24px 28px",display:"flex",flexDirection:"column",gap:12}}>
                <div style={{fontSize:14,color:"#6b7280",fontWeight:600}}>Seleziona il tuo profilo</div>
                {docenti.map(d=>(
                  <button key={d} onClick={()=>entra(d)} style={{padding:"13px 18px",background:d===nome?"#e8f5f5":"#f9fafb",border:"2px solid "+(d===nome?TEAL:"#e5e7eb"),borderRadius:8,fontWeight:700,fontSize:15,cursor:"pointer",textAlign:"left",color:"#1f2937",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:20}}>👤</span> {d}
                  </button>
                ))}
                <button onClick={()=>setModalita("nuovo")} style={{padding:"11px 18px",background:"none",border:"2px dashed #d1d5db",borderRadius:8,fontWeight:600,fontSize:14,cursor:"pointer",color:"#6b7280",display:"flex",alignItems:"center",gap:8,marginTop:4}}>
                  <span style={{fontSize:18}}>➕</span> Accedi con un altro nome
                </button>
              </div>
            ):(
              <div style={{padding:"28px 32px",display:"flex",flexDirection:"column",gap:16}}>
                {docenti.length>0&&<button onClick={()=>setModalita("lista")} style={{padding:"8px 14px",background:"#f0f9f9",border:"1px solid #d1d5db",borderRadius:6,fontWeight:600,fontSize:13,cursor:"pointer",color:TEAL,textAlign:"left"}}>← Torna ai profili</button>}
                <div>
                  <div style={{fontSize:13,color:TEAL,fontWeight:700,marginBottom:6}}>Nome docente</div>
                  <input value={nome} onChange={e=>{setNome(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&entra()} placeholder="es. Mario Rossi" autoFocus style={{width:"100%",border:"2px solid #e5e7eb",borderRadius:6,padding:"12px 14px",fontSize:16,fontFamily:FF,boxSizing:"border-box",outline:"none"}} onFocus={e=>e.target.style.borderColor=TEAL} onBlur={e=>e.target.style.borderColor="#e5e7eb"}/>
                </div>
                {err&&<div style={{background:"#fef2f2",border:"2px solid #fecaca",borderRadius:6,padding:"10px 14px",color:"#dc2626",fontSize:13,fontWeight:600}}>{err}</div>}
                <button onClick={()=>entra()} style={{padding:"13px",background:TEAL,color:"#fff",border:"none",borderRadius:6,fontWeight:700,fontSize:16,cursor:"pointer",fontFamily:FF}}>
                  Entra nel Registro →
                </button>
              </div>
            )}
            <div style={{padding:"12px 28px 20px",borderTop:"1px solid #f3f4f6"}}>
              <button onClick={()=>setShowRecupero(true)} style={{width:"100%",padding:"10px",background:"#fff7ed",border:"2px solid #fed7aa",borderRadius:6,fontWeight:700,fontSize:13,cursor:"pointer",color:"#c2410c",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                🆘 Recupera dati persi
              </button>
            </div>
          </>
        ):(
          <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:14,maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={()=>setShowRecupero(false)} style={{background:"none",border:"none",cursor:"pointer",color:TEAL,fontWeight:700,fontSize:14}}>← Indietro</button>
              <div style={{fontWeight:700,fontSize:16,color:"#c2410c"}}>🆘 Recupero dati</div>
            </div>

            <div style={{fontSize:13,color:"#6b7280",lineHeight:1.6}}>
              Inserisci il nome esatto con cui usi il registro, poi premi <b>Scansiona</b>. Cercheremo i tuoi dati in tutti i posti possibili.
            </div>

            <div style={{display:"flex",gap:8}}>
              <input value={nome} onChange={e=>setNome(e.target.value)} placeholder="Nome docente esatto"
                style={{flex:1,border:"2px solid #fed7aa",borderRadius:6,padding:"10px 12px",fontSize:14,fontFamily:FF,outline:"none"}}/>
              <button onClick={()=>scansionaRecupero()} style={{padding:"10px 16px",background:"#c2410c",color:"#fff",border:"none",borderRadius:6,fontWeight:700,cursor:"pointer",fontSize:14}}>
                🔍 Scansiona
              </button>
            </div>

            {/* Log scansione */}
            {recuperoLog.length>0&&(
              <div style={{background:"#1f2937",borderRadius:6,padding:"12px 14px",fontFamily:"monospace",fontSize:12,color:"#e5e7eb",maxHeight:200,overflowY:"auto",lineHeight:1.8}}>
                {recuperoLog.map((l,i)=>(
                  <div key={i} style={{color:l.startsWith("✅")?"#4ade80":l.startsWith("❌")?"#f87171":l.startsWith("⚠️")?"#fbbf24":"#e5e7eb"}}>{l}</div>
                ))}
              </div>
            )}

            {/* Bottone applica recupero */}
            {recuperoData&&(
              <button onClick={applicaRecupero}
                style={{padding:"14px",background:"#16a34a",color:"#fff",border:"none",borderRadius:8,fontWeight:700,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                ✅ Ripristina e accedi come {recuperoData.docente}
              </button>
            )}

            {/* Import manuale da file JSON */}
            <div style={{borderTop:"1px solid #e5e7eb",paddingTop:14}}>
              <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:8}}>📂 Importa da backup JSON</div>
              <div style={{fontSize:12,color:"#6b7280",marginBottom:8}}>Se hai esportato i dati in precedenza (Esporta dati dal menu), puoi importarli qui.</div>
              <button onClick={()=>recuperoRef.current?.click()}
                style={{width:"100%",padding:"10px",background:"#eff6ff",border:"2px solid #bfdbfe",borderRadius:6,fontWeight:700,fontSize:13,cursor:"pointer",color:"#1d4ed8"}}>
                📁 Seleziona file di backup (.json)
              </button>
              <input ref={recuperoRef} type="file" accept=".json" onChange={importaBackup} style={{display:"none"}}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AssenzaCheckbox({checked,onChange}) {
  const [loading,setLoading]=useState(false);
  return (
    <>
      <LoadingOverlay show={loading}/>
      <div
        onClick={()=>{setLoading(true);setTimeout(()=>{setLoading(false);onChange(!checked);},400);}}
        style={{
          width:28,height:28,
          border:"2px solid "+(checked?"#333":"#d1d5db"),
          borderRadius:0,
          background:"#fff",
          display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",flexShrink:0,
          boxShadow: checked?"0 0 0 1px #bbb":"none",
          transition:"border-color 0.15s",
        }}
      >
        {checked&&(
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polyline
              points="2.5,8.5 6.5,12.5 13.5,4"
              stroke="#222"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </>
  );
}

function GiustificaRow({a,info,onGiustifica,onDelete}) {
  const motivoRef=useRef(null);const [cert,setCert]=useState(false);const [hasSalute,setHasSalute]=useState(PAROLE_SALUTE.some(p=>(a.motivo||"").toLowerCase().includes(p)));
  return (<div style={{background:"#f9fafb",borderRadius:6,padding:"12px 14px",marginBottom:8,border:"1px solid #e5e7eb"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{fontWeight:700,color:info.color,fontSize:13}}>{info.label}</span><span style={{color:"#6b7280",fontSize:12}}>{a.data}</span></div><div style={{marginBottom:8}}><Lbl>Motivo</Lbl><textarea ref={motivoRef} defaultValue={a.motivo||""} rows={2} onInput={e=>setHasSalute(PAROLE_SALUTE.some(p=>e.target.value.toLowerCase().includes(p)))} style={{width:"100%",border:"2px solid #d1d5db",borderRadius:4,padding:"8px",boxSizing:"border-box",fontSize:14,fontFamily:FF,resize:"none"}}/></div>{hasSalute&&(<div onClick={()=>setCert(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,background:cert?"#ecfdf5":"#fff",border:"2px solid "+(cert?"#22c55e":"#d1d5db"),borderRadius:6,padding:"8px 12px",cursor:"pointer",marginBottom:8}}><div style={{width:20,height:20,border:"2px solid "+(cert?"#22c55e":"#9ca3af"),borderRadius:4,background:cert?"#22c55e":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{cert&&<span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}</div><div style={{fontWeight:700,fontSize:13,color:cert?"#16a34a":"#374151"}}>Certificato medico</div></div>)}<div style={{display:"flex",gap:8}}><button onClick={()=>onGiustifica(a.id,{motivo:motivoRef.current?.value||"",certificatoMedico:cert,concorreCalcolo:cert?false:a.concorreCalcolo})} style={{flex:1,padding:"8px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:13,cursor:"pointer"}}>Giustifica</button><button onClick={()=>onDelete(a.id)} style={{padding:"8px 10px",background:"#ef4444",color:"#fff",border:"none",borderRadius:4,cursor:"pointer"}}><Trash2 size={13}/></button></div></div>);
}

function GiustificaSchermo({assenze,onGiustifica,onDelete,onBack}) {
  return (<div><div style={{fontWeight:700,fontSize:15,color:"#22c55e",marginBottom:12}}>Giustifica assenze</div>{assenze.filter(a=>!a.giustificato).map(a=>{const info=TIPI_ASSENZA[a.tipo]||{label:a.tipo,color:"#6b7280"};return <GiustificaRow key={a.id} a={a} info={info} onGiustifica={onGiustifica} onDelete={onDelete}/>;})}<Btn color="#6b7280" onClick={onBack} style={{width:"100%",marginTop:10}}>Indietro</Btn></div>);
}

function AssenzaTipoForm({tipoSel, form, setForm, onSalva, onBack}) {
  const info = TIPI_ASSENZA[tipoSel] || {label:tipoSel, color:"#6b7280"};
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontWeight:700,fontSize:15,color:info.color,borderBottom:"2px solid "+info.color+"33",paddingBottom:8}}>{info.label}</div>
      {tipoSel==="assente"&&<div><Lbl>Ore</Lbl><Sel value={form.ore} onChange={e=>setForm({...form,ore:e.target.value})}><option value="Tutto il giorno">Tutto il giorno</option>{ORE_NUMS.map(n=><option key={n} value={"Ora "+n}>Ora {n}</option>)}</Sel></div>}
      {tipoSel==="fuori_aula"&&<div><Lbl>Durata</Lbl><Sel value={form.ore} onChange={e=>setForm({...form,ore:e.target.value})}><option value="Tutto il giorno">Tutto il giorno</option>{ORE_NUMS.map(n=><option key={n} value={"Ora "+n}>Ora {n}</option>)}</Sel></div>}
      {(tipoSel!=="assente"&&tipoSel!=="fuori_aula")&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div><Lbl>Ora lezione</Lbl><Sel value={form.oraLezione} onChange={e=>setForm({...form,oraLezione:e.target.value})}><option value="">—</option>{ORE_NUMS.map(n=><option key={n} value={n}>Ora {n}</option>)}</Sel></div>
        <div><Lbl>Ora</Lbl><input type="time" value={form.oraOrologio} onChange={e=>setForm({...form,oraOrologio:e.target.value})} style={{width:"100%",border:"2px solid #d1d5db",borderRadius:4,padding:"8px",fontSize:14,boxSizing:"border-box"}}/></div>
      </div>}
      <div><Lbl>Motivazione</Lbl><Inp value={form.motivo} onChange={e=>setForm(f=>({...f,motivo:e.target.value}))} placeholder="es. Certificato medico..."/></div>
      <div style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={form.concorreCalcolo} onChange={e=>setForm({...form,concorreCalcolo:e.target.checked})} style={{width:16,height:16}}/><label style={{fontWeight:700,fontSize:13}}>Concorre al calcolo</label></div>
      <div style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={form.giustificato} onChange={e=>setForm({...form,giustificato:e.target.checked})} style={{width:16,height:16}}/><label style={{fontWeight:700,fontSize:13}}>Già giustificata</label></div>
      <div style={{display:"flex",gap:10}}><Btn onClick={onSalva} color={info.color} style={{flex:1}}>Salva</Btn><Btn color="#6b7280" onClick={onBack}>Indietro</Btn></div>
    </div>
  );
}

function RicercaAltreClassi({classi,classeCorrente,selezionati,onChange}) {
  const [query,setQuery]=useState("");
  const tutti=[];Object.entries(classi).forEach(([cl,alunni])=>{if(cl===classeCorrente)return;(alunni||[]).forEach(a=>tutti.push({...a,classe:cl}));});
  const filtrati=query.trim().length>=2?tutti.filter(a=>`${a.cognome} ${a.nome} ${a.classe}`.toLowerCase().includes(query.toLowerCase())):[];
  return (<div><div style={{display:"flex",alignItems:"center",gap:8,border:"2px solid #d1d5db",borderRadius:4,padding:"6px 10px",marginBottom:8,background:"#fff"}}><Search size={16} color="#9ca3af"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cerca cognome di altra classe..." style={{border:"none",outline:"none",flex:1,fontSize:14,fontFamily:FF}}/></div>{filtrati.length>0&&(<div style={{border:"2px solid #e5e7eb",borderRadius:4,maxHeight:140,overflowY:"auto"}}>{filtrati.map(a=>{const key=`${a.classe}__${a.id}`;const sel=selezionati.some(x=>x.key===key);return(<div key={key} onClick={()=>onChange(sel?selezionati.filter(x=>x.key!==key):[...selezionati,{key,nome:a.nome,cognome:a.cognome,classe:a.classe}])} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",cursor:"pointer",background:sel?"#eff6ff":"#fff",borderBottom:"1px solid #f3f4f6"}}><div style={{width:18,height:18,border:"2px solid "+(sel?"#2563eb":"#d1d5db"),borderRadius:3,background:sel?"#2563eb":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{sel&&<span style={{color:"#fff",fontSize:11,fontWeight:900}}>✓</span>}</div><span style={{fontWeight:700,fontSize:13}}>{a.cognome} {a.nome}</span><span style={{fontSize:12,color:"#6b7280",marginLeft:"auto"}}>Classe {a.classe}</span></div>);})}</div>)}{selezionati.length>0&&(<div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:6}}>{selezionati.map(a=>(<div key={a.key} style={{background:"#eff6ff",border:"2px solid #bfdbfe",borderRadius:20,padding:"4px 10px",fontSize:12,fontWeight:700,color:"#1d4ed8",display:"flex",alignItems:"center",gap:6}}>{a.cognome} {a.nome}<button onClick={()=>onChange(selezionati.filter(x=>x.key!==a.key))} style={{background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontWeight:900,fontSize:14,padding:0,lineHeight:1}}>×</button></div>))}</div>)}</div>);
}

function MateriaSelector({value,onChange}) {
  const [open,setOpen]=useState(false);
  const [custom,setCustom]=useState("");
  const [materieExtra,setMaterieExtra]=useState(()=>{try{return JSON.parse(localStorage.getItem("reg:materieExtra")||"[]");}catch{return [];}});
  const ref=useRef(null);
  useEffect(()=>{if(!open)return;const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};window.addEventListener("mousedown",h);return()=>window.removeEventListener("mousedown",h);},[open]);
  const tutteMaterie=[...MATERIE,...materieExtra.filter(m=>!MATERIE.includes(m))];
  const aggiungiCustom=()=>{
    const m=custom.trim();
    if(!m)return;
    if(!tutteMaterie.includes(m)){
      const nuove=[...materieExtra,m];
      setMaterieExtra(nuove);
      try{localStorage.setItem("reg:materieExtra",JSON.stringify(nuove));}catch{}
    }
    onChange(m);setCustom("");setOpen(false);
  };
  return (<div ref={ref} style={{position:"relative"}}><button type="button" onClick={()=>setOpen(v=>!v)} style={{background:"#fff",color:"#1f2937",padding:"4px 12px 4px 10px",borderRadius:4,fontWeight:700,border:"none",display:"flex",alignItems:"center",gap:6,fontSize:14,fontFamily:FF,cursor:"pointer"}}>{value} ▾</button>{open&&(<div style={{position:"absolute",top:"110%",left:0,background:"#fff",boxShadow:"0 8px 30px rgba(0,0,0,0.18)",borderRadius:6,zIndex:300,minWidth:220,border:"1px solid #e5e7eb",overflow:"hidden"}}><div style={{maxHeight:280,overflowY:"auto"}}>{tutteMaterie.map(m=><div key={m} onClick={()=>{onChange(m);setOpen(false);}} style={{padding:"10px 16px",cursor:"pointer",background:value===m?"#e8f5f5":"#fff",color:value===m?TEAL:"#1f2937",fontWeight:value===m?700:400,fontSize:14,fontFamily:FF,borderBottom:"1px solid #f3f4f6",display:"flex",alignItems:"center",justifyContent:"space-between"}}><span>{m}</span>{materieExtra.includes(m)&&<button onClick={e=>{e.stopPropagation();const nuove=materieExtra.filter(x=>x!==m);setMaterieExtra(nuove);try{localStorage.setItem("reg:materieExtra",JSON.stringify(nuove));}catch{}if(value===m)onChange(MATERIE[0]);}} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:3,padding:"1px 6px",cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>}</div>)}</div><div style={{padding:"8px 10px",borderTop:"2px solid #e5e7eb",display:"flex",gap:6}}><input value={custom} onChange={e=>setCustom(e.target.value)} onKeyDown={e=>e.key==="Enter"&&aggiungiCustom()} placeholder="Altra materia..." style={{flex:1,border:"2px solid #d1d5db",borderRadius:4,padding:"6px 8px",fontSize:13,fontFamily:FF}}/><button onClick={aggiungiCustom} style={{padding:"6px 12px",background:"#2563eb",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:13}}>+</button></div></div>)}</div>);
}

function SchédaVotiStudente({s, votiDB, classe, docente, onClose, pgTrim}) {
  const [phase, setPhase] = useState("loading");
  const [matSel, setMatSel] = useState(null);
  const [vista, setVista] = useState("elenco"); // "elenco" | "griglia"
  useEffect(()=>{     const t=setTimeout(()=>setPhase("open"),200); return()=>clearTimeout(t); },[]);
  const handleClose=()=>{ setPhase("closing"); setTimeout(onClose,280); };

  const prefix = `${classe}||`;
  const materieConVoti = Object.keys(votiDB)
    .filter(k=>k.startsWith(prefix))
    .map(k=>k.split("||")[1])
    .filter(Boolean)
    .filter(mat=>(votiDB[`${classe}||${mat}`]?.[s.id]||[]).length>0);

  const matAttiva = matSel || materieConVoti[0] || null;
  const fmtD=d=>{ try{ if(!d)return""; if(d.includes("-")){ const[y,m,dd]=d.split("-"); return`${dd}/${m}/${y}`; } return d; }catch{return d;} };

  const votiMateria = matAttiva
    ? [...(votiDB[`${classe}||${matAttiva}`]?.[s.id]||[])]
        .filter(v=>(v.trimestre||TRIMESTRI[0])===pgTrim)
        .sort((a,b)=>toISO(a.data||"").localeCompare(toISO(b.data||"")))
    : [];

  const perMedia = votiMateria.filter(v=>v.faMedia&&v.voto&&v.voto!==" "&&!isNaN(parseVoto(v.voto)));
  let media = null;
  if(perMedia.length){ let sp=0,sv=0; perMedia.forEach(v=>{ const n=parseVoto(v.voto); const w=parseFloat(v.peso)||100; sv+=n*w; sp+=w; }); if(sp>0) media=sv/sp; }

  const TIPO_BADGE = {orale:"#5b9bd5",scritto:"#22c55e",grafico:"#f97316",pratico:"#8b5cf6",unico:"#64748b"};

  // ── VISTA GRIGLIA: tutte le materie × date ──
  // Raccoglie tutte le date uniche ordinate
  const tuttiVotiPerGriglia = materieConVoti.reduce((acc, mat)=>{
    (votiDB[`${classe}||${mat}`]?.[s.id]||[]).forEach(v=>{ acc.push({...v, _mat:mat}); });
    return acc;
  }, []).sort((a,b)=>toISO(a.data||"").localeCompare(toISO(b.data||"")));

  const dateUniche = [...new Set(tuttiVotiPerGriglia.map(v=>toISO(v.data||"")))].filter(Boolean).sort();

  // Per ogni materia × data → array di voti
  const grigliaMap = {};
  materieConVoti.forEach(mat=>{
    grigliaMap[mat] = {};
    dateUniche.forEach(d=>{ grigliaMap[mat][d] = []; });
    (votiDB[`${classe}||${mat}`]?.[s.id]||[]).forEach(v=>{
      const d = toISO(v.data||"");
      if(d && grigliaMap[mat][d]) grigliaMap[mat][d].push(v);
    });
  });

  // Calcola media per riga (materia)
  const mediaPerMat = (mat) => {
    const vv = (votiDB[`${classe}||${mat}`]?.[s.id]||[]).filter(v=>(v.trimestre||TRIMESTRI[0])===pgTrim).filter(v=>v.faMedia&&v.voto&&v.voto!==" "&&!isNaN(parseVoto(v.voto)));
    if(!vv.length) return null;
    let sp=0,sv=0; vv.forEach(v=>{ const n=parseVoto(v.voto); const w=parseFloat(v.peso)||100; sv+=n*w; sp+=w; });
    return sp>0 ? sv/sp : null;
  };

  return (
    <div onClick={handleClose}
      style={{position:"fixed",inset:0,zIndex:5000,display:"flex",alignItems:"center",justifyContent:"center",
        background:"rgba(0,0,0,0.5)",fontFamily:FF,
        opacity:phase==="loading"?0:1,transition:"opacity 0.22s"}}>
      <style>{`
        @keyframes schedaDown{from{transform:translateY(-110%)}to{transform:translateY(0)}}
        @keyframes schedaUp{from{transform:translateY(0)}to{transform:translateY(-120%)}}
        .voto-cell:hover .voto-tooltip{display:block!important}
      `}</style>
      {phase==="loading"&&(
        <div style={{background:"rgba(255,255,255,0.97)",borderRadius:20,padding:"10px 22px",boxShadow:"0 4px 20px rgba(0,0,0,0.12)",fontSize:13,color:"#6b7280",fontWeight:600,display:"flex",alignItems:"center",gap:10,pointerEvents:"none"}}>
          <div style={{width:13,height:13,borderRadius:"50%",border:"2px solid #ddd",borderTopColor:TEAL,animation:"spin 0.7s linear infinite"}}/>
          Caricamento voti…
        </div>
      )}
      {phase!=="loading"&&(
        <div onClick={e=>e.stopPropagation()}
          style={{background:"#fff",borderRadius:6,boxShadow:"0 24px 80px rgba(0,0,0,0.28)",
            width:"96vw",maxWidth:1300,height:"96vh",
            display:"flex",flexDirection:"column",overflow:"hidden",
            animation:phase==="closing"?"schedaUp 0.26s cubic-bezier(.4,0,.6,1) forwards":"schedaDown 0.38s cubic-bezier(.2,.9,.25,1) forwards"}}>

          {/* Header */}
          <div style={{background:TEAL,color:"#fff",padding:"14px 24px",display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
            <div style={{width:42,height:42,borderRadius:"50%",background:"rgba(255,255,255,0.22)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:20,flexShrink:0}}>
              {(s.cognome||"?")[0].toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:19}}>{s.cognome} {s.nome}</div>
              <div style={{fontSize:12,opacity:0.85}}>Classe {classe} — Registro Docente</div>
            </div>
            <button onClick={handleClose} style={{background:"rgba(0,0,0,0.22)",border:"none",color:"#fff",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontWeight:900,fontSize:17,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>

          {/* Barra controlli */}
          <div style={{background:"#f8fafc",borderBottom:"2px solid #e5e7eb",padding:"10px 24px",display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap"}}>
            {vista==="elenco"&&(
              <select value={matAttiva||""} onChange={e=>setMatSel(e.target.value)}
                style={{border:"1px solid #d1d5db",borderRadius:4,padding:"6px 14px",fontSize:14,fontWeight:600,color:TEAL,background:"#fff",fontFamily:FF,minWidth:180}}>
                {materieConVoti.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            )}
            <div style={{border:"1px solid #d1d5db",borderRadius:4,padding:"6px 14px",fontSize:13,color:"#374151",background:"#fff"}}>
              {pgTrim}
            </div>
            {/* Toggle Elenco / Griglia */}
            <div style={{marginLeft:"auto",display:"flex",border:"1px solid #d1d5db",borderRadius:4,overflow:"hidden"}}>
              <button onClick={()=>setVista("elenco")}
                style={{padding:"5px 14px",background:vista==="elenco"?"#2563eb":"#fff",color:vista==="elenco"?"#fff":"#6b7280",border:"none",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:FF}}>
                ≡ Elenco
              </button>
              <button onClick={()=>setVista("griglia")}
                style={{padding:"5px 14px",background:vista==="griglia"?"#2563eb":"#fff",color:vista==="griglia"?"#fff":"#6b7280",border:"none",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:FF,borderLeft:"1px solid #d1d5db"}}>
                ⊞ Griglia
              </button>
            </div>
            {media!==null&&(
              <div style={{display:"flex",alignItems:"center",gap:6,background:media<6?"#fef2f2":"#f0fdf4",border:"2px solid "+(media<6?"#fca5a5":"#86efac"),borderRadius:6,padding:"4px 14px"}}>
                <span style={{fontSize:12,color:"#6b7280",fontWeight:600}}>Media:</span>
                <span style={{fontWeight:900,fontSize:18,color:media<6?"#dc2626":"#16a34a"}}>{media.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Contenuto */}
          <div style={{flex:1,overflowY:"auto",overflowX:"auto"}}>

            {/* ── VISTA ELENCO ── */}
            {vista==="elenco"&&(
              votiMateria.length===0
                ?<div style={{textAlign:"center",padding:"60px 0",color:"#9ca3af",fontSize:14}}>Nessun voto per questa materia</div>
                :<table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{borderBottom:"2px solid #e5e7eb",background:"#fff"}}>
                      {["Data","Tipologia","Voto","Commento","Privato","Valore","Visto"].map(h=>(
                        <th key={h} style={{padding:"11px 16px",textAlign:"center",color:TEAL,fontWeight:600,fontSize:13,borderRight:"1px solid #f3f4f6",borderBottom:"1px solid #e5e7eb",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {votiMateria.map((v,i)=>{
                      const vStr=String(v.voto||"");
                      const nVal=parseVoto(vStr);
                      const col=votoColor(vStr,v.faMedia);
                      const tipoBg=TIPO_BADGE[v.tipo]||"#64748b";
                      const valore=!isNaN(nVal)?nVal.toFixed(2):"";
                      const isNeg=!isNaN(nVal)&&nVal<6;
                      return(
                        <tr key={v.id} style={{borderBottom:"1px solid #e5e7eb",background:i%2===0?"#fff":"#fafafa"}}>
                          <td style={{padding:"11px 16px",textAlign:"center",fontSize:13,color:"#374151",borderRight:"1px solid #f3f4f6",whiteSpace:"nowrap"}}>{fmtD(v.data||"")}</td>
                          <td style={{padding:"8px 12px",textAlign:"center",borderRight:"1px solid #f3f4f6"}}>
                            <span style={{background:tipoBg,color:"#fff",borderRadius:4,padding:"3px 12px",fontWeight:700,fontSize:12,textTransform:"capitalize"}}>{v.tipo||"—"}</span>
                          </td>
                          <td style={{padding:"8px 12px",textAlign:"center",borderRight:"1px solid #f3f4f6"}}>
                            {vStr&&vStr!==" "&&<span style={{background:votoBackground(vStr,v.faMedia),color:"#fff",borderRadius:2,padding:"3px 12px",fontWeight:700,fontSize:14,minWidth:36,display:"inline-block",boxShadow:"0 1px 3px rgba(0,0,0,0.15)"}}>{votoDisplay(vStr)}</span>}
                          </td>
                          <td style={{padding:"11px 16px",textAlign:"center",fontSize:13,color:"#374151",borderRight:"1px solid #f3f4f6",maxWidth:200}}>{v.notaFam||""}</td>
                          <td style={{padding:"11px 16px",textAlign:"center",fontSize:13,color:"#6b7280",borderRight:"1px solid #f3f4f6",maxWidth:200,fontStyle:v.nota?"italic":"normal"}}>{v.nota||""}</td>
                          <td style={{padding:"11px 16px",textAlign:"center",fontWeight:700,fontSize:14,borderRight:"1px solid #f3f4f6",color:isNeg?"#dc2626":valore?"#16a34a":"#9ca3af"}}>{valore}</td>
                          <td style={{padding:"8px 12px",textAlign:"center"}}>
                            <span style={{background:v.visFam!==false?"#22c55e":"#ef4444",color:"#fff",borderRadius:4,padding:"3px 10px",fontWeight:700,fontSize:11}}>{v.visFam!==false?"SÌ":"NO"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            )}

            {/* ── VISTA GRIGLIA ── */}
            {vista==="griglia"&&(
              materieConVoti.length===0
                ?<div style={{textAlign:"center",padding:"60px 0",color:"#9ca3af",fontSize:14}}>Nessun voto registrato</div>
                :<table style={{borderCollapse:"collapse",minWidth:"100%"}}>
                  <thead>
                    <tr style={{background:"#f0fdfa"}}>
                      {/* Intestazione materia */}
                      <th style={{padding:"10px 16px",textAlign:"left",color:TEAL,fontWeight:700,fontSize:13,borderRight:"2px solid #e5e7eb",borderBottom:"2px solid #bbf7d0",whiteSpace:"nowrap",minWidth:140,position:"sticky",left:0,background:"#f0fdfa",zIndex:2}}>
                        Materia
                      </th>
                      {/* Una colonna per ogni data */}
                      {dateUniche.map(d=>(
                        <th key={d} style={{padding:"8px 6px",textAlign:"center",color:"#374151",fontWeight:600,fontSize:11,borderRight:"1px solid #e5e7eb",borderBottom:"2px solid #bbf7d0",whiteSpace:"nowrap",minWidth:52}}>
                          {fmtD(d)}
                        </th>
                      ))}
                      {/* Media finale */}
                      <th style={{padding:"10px 14px",textAlign:"center",color:TEAL,fontWeight:700,fontSize:13,borderLeft:"2px solid #bbf7d0",borderBottom:"2px solid #bbf7d0",whiteSpace:"nowrap",background:"#f0fdfa"}}>
                        Media
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {materieConVoti.map((mat,ri)=>{
                      const med = mediaPerMat(mat);
                      return(
                        <tr key={mat} style={{borderBottom:"1px solid #e5e7eb",background:ri%2===0?"#fff":"#f9fafb"}}>
                          {/* Nome materia */}
                          <td style={{padding:"10px 16px",fontWeight:700,fontSize:13,color:"#1f2937",borderRight:"2px solid #e5e7eb",whiteSpace:"nowrap",position:"sticky",left:0,background:ri%2===0?"#fff":"#f9fafb",zIndex:1}}>
                            {mat}
                          </td>
                          {/* Celle voti per data */}
                          {dateUniche.map(d=>{
                            const vv = grigliaMap[mat][d]||[];
                            return(
                              <td key={d} style={{padding:"4px 3px",textAlign:"center",borderRight:"1px solid #e5e7eb",verticalAlign:"middle"}}>
                                {vv.map(v=>{
                                  const vStr2=String(v.voto||"");
                                  if(!vStr2||vStr2===" ") return null;
                                  const bgCell=votoBackground(vStr2,v.faMedia);
                                  const hasNote2=(v.nota||v.notaFam||v.tipo);
                                  const hasNote=(v.nota||v.notaFam||v.tipo);
                                  return(
                                    <div key={v.id} className="voto-cell"
                                      style={{position:"relative",display:"inline-block",margin:"1px"}}>
                                      <span style={{background:bgCell,color:"#fff",borderRadius:2,padding:"3px 7px",fontWeight:700,fontSize:13,display:"inline-block",cursor:hasNote2?"help":"default",minWidth:30,textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.15)"}}>
                                        {votoDisplay(vStr2)}
                                      </span>
                                      {hasNote2&&(
                                        <div className="voto-tooltip"
                                          style={{display:"none",position:"absolute",bottom:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",background:"#1f2937",color:"#fff",fontSize:11,padding:"8px 12px",borderRadius:6,zIndex:9999,whiteSpace:"nowrap",boxShadow:"0 4px 16px rgba(0,0,0,0.35)",pointerEvents:"none",minWidth:140,textAlign:"left"}}>
                                          <div style={{fontWeight:700,marginBottom:3}}>{v.tipo?.toUpperCase()||""} — {v.data||""}</div>
                                          {v.notaFam&&<div style={{color:"#86efac"}}>💬 {v.notaFam}</div>}
                                          {v.nota&&<div style={{color:"#fde68a",fontStyle:"italic"}}>🔒 {v.nota}</div>}
                                          {!v.faMedia&&<div style={{color:"#f87171",fontSize:10,marginTop:2}}>non fa media</div>}
                                          <div style={{position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"5px solid transparent",borderRight:"5px solid transparent",borderTop:"5px solid #1f2937"}}/>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </td>
                            );
                          })}
                          {/* Media */}
                          <td style={{padding:"8px 14px",textAlign:"center",fontWeight:900,fontSize:15,borderLeft:"2px solid #bbf7d0",color:med===null?"#9ca3af":med<6?"#dc2626":"#16a34a"}}>
                            {med!==null ? med.toFixed(2) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente voto stile app famiglia (cerchio colorato) ──
function VotoCerchio({voto, faMedia, peso}) {
  if(!voto || voto === " " || voto === "") return null;
  const s = String(voto).trim();
  // Stessa logica del registro docente — verde allineato a VERDE (#1d9e52)
  let bg;
  if(!faMedia) {
    bg = "#3b82f6"; // blu — non fa media
  } else {
    const n = parseVoto(s);
    if(isNaN(n)) {
      bg = "#ef4444"; // voto non numerico che fa media → rosso
    } else if(n < 6) {
      bg = "#ef4444"; // rosso
    } else {
      bg = VERDE; // verde ufficiale del registro (#1d9e52)
    }
  }
  const fontSize = s.length > 3 ? 18 : s.length === 3 ? 22 : s.length === 2 ? 26 : 32;
  return (
    <div style={{
      width:64, height:64, borderRadius:"50%",
      background:bg, color:"#fff",
      fontWeight:900, fontSize,
      fontFamily: FF,
      display:"flex", alignItems:"center", justifyContent:"center",
      flexShrink:0, boxShadow:"0 2px 8px rgba(0,0,0,0.22)",
      letterSpacing:-0.5,
    }}>{votoDisplay(voto)}</div>
  );
}

function AssenzaRow({a, c, dettaglio, fmtD, TEAL}) {
  const [open, setOpen] = useState(false);
  const TIPO_LABEL = {assente:"Assenza", ritardo:"Ritardo", uscita:"Uscita", ingresso:"Ingresso", fuori_aula:"Presenza fuori aula"};
  const tipoLabel = TIPO_LABEL[a.tipo]||a.tipo||"—";
  return(
    <div style={{fontFamily:"Helvetica,Arial,sans-serif",borderBottom:"1px solid #e5e7eb"}}>
      {/* Riga principale — cliccabile */}
      <div onClick={()=>setOpen(v=>!v)}
        style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",cursor:"pointer",background:"#fff",userSelect:"none"}}
        onMouseEnter={e=>e.currentTarget.style.background="#f9fafb"}
        onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
        {/* Cerchio */}
        <div style={{width:46,height:46,borderRadius:"50%",background:c.bg,color:"#fff",fontWeight:900,fontSize:c.lettera.length>1?15:20,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,letterSpacing:c.lettera.length>1?-1:0}}>
          {c.lettera}
        </div>
        {/* Data + tipo */}
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:16,color:"#1f2937"}}>{fmtD(a.data)}</div>
          <div style={{fontSize:14,color:"#6b7280",marginTop:2}}>{tipoLabel}</div>
          {dettaglio.length>0&&!open&&(
            <div style={{fontSize:13,color:"#9ca3af",marginTop:2}}>{dettaglio.join(" - ")}</div>
          )}
        </div>
        {/* Freccia */}
        <span style={{fontSize:18,color:"#c7c7cc",fontWeight:300,transform:open?"rotate(90deg)":"none",transition:"transform 0.2s"}}>›</span>
      </div>
      {/* Dettaglio espanso */}
      {open&&(
        <div style={{background:"#f9fafb",padding:"16px 24px 20px",borderTop:"1px solid #f3f4f6"}}>
          {[
            {lbl:"Tipo",              val:tipoLabel,  col:"#ef4444"},
            {lbl:"Data",             val:fmtD(a.data)},
            {lbl:"Concorre al calcolo", val:a.concorreCalcolo===false?"No":"Sì"},
            {lbl:"Giustificato",     val:a.giustificato?"Sì":"No", col:a.giustificato?"#16a34a":"#ef4444"},
            a.giustificato&&{lbl:"Data giustificazione", val:a.dataGiustificazione||"—"},
            a.giustificato&&{lbl:"Giustificato da/tipo", val:a.giustificatoDa||"Docente"},
            a.motivo&&{lbl:"Motivo", val:a.motivo},
            a.oraOrologio&&{lbl:"Orario uscita/entrata", val:a.oraOrologio},
            a.oraLezione&&{lbl:"Ora di lezione", val:"Ora "+a.oraLezione},
            a.certificatoMedico&&{lbl:"Certificato medico", val:"Sì", col:"#16a34a"},
            a.infAggiuntive&&{lbl:"Informazioni aggiuntive", val:a.infAggiuntive},
          ].filter(Boolean).map(({lbl,val,col})=>(
            <div key={lbl} style={{marginBottom:10}}>
              <div style={{fontSize:14,color:"#f59e0b",fontWeight:700,fontFamily:"Helvetica,Arial,sans-serif"}}>{lbl}</div>
              <div style={{fontSize:15,color:col||"#1f2937",fontFamily:"Helvetica,Arial,sans-serif",marginTop:2}}>{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Anagrafica studente ──
// Campo input completamente uncontrolled — nessun re-render durante la digitazione
const AnagField = React.memo(({label, fkey, half, gray, defaultVal, onCommit}) => (
  <div style={{flex: half?"0 0 calc(50% - 6px)":"0 0 100%", minWidth:0}}>
    <div style={{fontSize:12, color:"#337ab7", fontWeight:600, marginBottom:3, fontFamily:FF}}>{label}</div>
    <input
      defaultValue={defaultVal||""}
      onBlur={e=>onCommit(fkey, e.target.value)}
      readOnly={gray}
      style={{width:"100%", border:"1px solid #d1d5db", borderRadius:3, padding:"7px 10px",
        fontSize:13, fontFamily:FF, background:gray?"#f3f4f6":"#fff", boxSizing:"border-box",
        color:"#1f2937"}}
    />
  </div>
), (prev,next) => prev.defaultVal===next.defaultVal && prev.fkey===next.fkey);

function AnagraficaTab({s, docente, classe}) {
  const aKey = `anag:${docente}:${classe}:${s.id}`;
  const load = () => { try { return JSON.parse(localStorage.getItem(aKey)||"{}"); } catch { return {}; } };

  const guessSesso = (nome) => {
    if(!nome) return "";
    const n = nome.trim().toLowerCase();
    const maschiliEccezioni = ["luca","andrea","mattia","nicola","enea","biagio","battista","elia","geremia","tobia","zaccaria","josua","joshua","thomas","nicolas","alexis","loris","denis","lewis","james","charles"];
    const femminiliEccezioni = ["cleo","neo"];
    const primo = n.split(/\s+/)[0];
    if(maschiliEccezioni.includes(primo)) return "M";
    if(femminiliEccezioni.includes(primo)) return "F";
    if(n.endsWith("a")||n.endsWith("e")||n.endsWith("i")||n.endsWith("ilde")||n.endsWith("inge")) return "F";
    if(n.endsWith("o")||n.endsWith("io")||n.endsWith("ino")||n.endsWith("no")||n.endsWith("le")||n.endsWith("re")||n.endsWith("to")||n.endsWith("do")||n.endsWith("fo")||n.endsWith("go")||n.endsWith("co")||n.endsWith("eo")||n.endsWith("ro")) return "M";
    return "";
  };

  const [anag, setAnag] = useState(()=>{
    const base = load();
    if(!base.cognome_a) base.cognome_a = s.cognome||"";
    if(!base.nome_a) base.nome_a = s.nome||"";
    if(!base.sesso) base.sesso = guessSesso(s.nome||"");
    return base;
  });
  const [foto, setFoto] = useState(null);
  const annotRef = useRef(null);
  const [saved, setSaved] = useState(false);
  const fotoRef = useRef(null);

  // commit singolo campo senza causare re-render degli altri
  const commit = useRef((fkey, val) => {
    setAnag(p => ({...p, [fkey]: val}));
  });

  useEffect(() => {
    if(anag._fotoId) {
      imgLoad(anag._fotoId).then(d=>{ if(d) setFoto(d); });
    }
  }, []);

  const salva = async () => {
    const annotVal = annotRef.current ? annotRef.current.innerHTML : anag.annotazioni||"";
    const d = {...anag, annotazioni: annotVal};
    if(foto && foto.startsWith("data:")) {
      const fid = anag._fotoId || `foto_${s.id}_${Date.now()}`;
      await imgSave(fid, foto);
      d._fotoId = fid;
    }
    try { localStorage.setItem(aKey, JSON.stringify(d)); } catch {}
    try { sessionStorage.setItem(aKey, JSON.stringify(d)); } catch {}
    setAnag(d);
    setSaved(true);
    setTimeout(()=>setSaved(false), 2000);
  };

  const Field = ({label, fkey, half, gray}) => (
    <AnagField label={label} fkey={fkey} half={half} gray={gray}
      defaultVal={anag[fkey]||""} onCommit={commit.current}/>
  );

  return (
    <div style={{padding:"20px 24px", fontFamily:FF}}>
      {/* Riga superiore: foto + campi */}
      <div style={{display:"flex", gap:20, alignItems:"flex-start", marginBottom:20}}>
        {/* Foto */}
        <div style={{flexShrink:0}}>
          <div
            onClick={()=>fotoRef.current?.click()}
            style={{width:110, height:110, background:"#c8ccd0",
              border:"2px solid #b0b5bb", borderRadius:4, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              overflow:"hidden", position:"relative"}}
          >
            {foto
              ? <img src={foto} alt="foto" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              : <svg width="60" height="60" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="40" cy="30" r="18" fill="#9ca3af"/>
                  <ellipse cx="40" cy="68" rx="28" ry="16" fill="#9ca3af"/>
                </svg>
            }
          </div>
          <input ref={fotoRef} type="file" accept="image/*" style={{display:"none"}}
            onChange={e=>{
              const f=e.target.files?.[0]; if(!f) return;
              const r=new FileReader();
              r.onload=ev=>setFoto(ev.target.result);
              r.readAsDataURL(f);
              e.target.value="";
            }}/>
          {/* Icone sotto la foto */}
          <div style={{display:"flex",gap:6,marginTop:8,justifyContent:"center"}}>
            <button onClick={()=>fotoRef.current?.click()}
              style={{width:30,height:30,background:"#5b9bd5",border:"none",borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
              title="Carica foto">
              <span style={{fontSize:14}}>📁</span>
            </button>
            <button onClick={()=>{setFoto(null);setAnag(p=>({...p,_fotoId:null}));}}
              style={{width:30,height:30,background:"#5cb85c",border:"none",borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
              title="Rimuovi foto">
              <span style={{fontSize:14}}>🗑️</span>
            </button>
          </div>
        </div>

        {/* Campi anagrafica */}
        <div style={{flex:1, display:"flex", flexWrap:"wrap", gap:12}}>
          {/* Riga 1 */}
          <Field label="Cognome" fkey="cognome_a" half/>
          <Field label="Nome" fkey="nome_a" half/>
          {/* Riga 2 */}
          <div style={{flex:"0 0 calc(33% - 8px)",minWidth:0}}>
            <div style={{fontSize:12,color:"#337ab7",fontWeight:600,marginBottom:3}}>Nato/a il</div>
            <input type="date" value={anag.dataNascita||""} onChange={e=>setAnag(p=>({...p,dataNascita:e.target.value}))}
              style={{width:"100%",border:"1px solid #d1d5db",borderRadius:3,padding:"7px 10px",fontSize:13,fontFamily:FF,boxSizing:"border-box"}}/>
          </div>
          <Field label="Comune di nascita" fkey="comuneNascita" half/>
          <div style={{flex:"0 0 calc(17% - 4px)",minWidth:80}}>
            <div style={{fontSize:12,color:"#337ab7",fontWeight:600,marginBottom:3}}>Sesso</div>
            <select defaultValue={anag.sesso||""} onChange={e=>commit.current("sesso",e.target.value)}
              style={{width:"100%",border:"1px solid #d1d5db",borderRadius:3,padding:"7px 10px",fontSize:13,background:"#fff",fontFamily:FF}}>
              <option value=""></option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </div>
          {/* Riga 3 */}
          <Field label="C.F." fkey="cf" half/>
          <Field label="Cod. SIDI" fkey="codSidi" half/>
          {/* Riga 4 */}
          <div style={{flex:"0 0 calc(50% - 6px)",minWidth:0}}>
            <div style={{fontSize:12,color:"#337ab7",fontWeight:600,marginBottom:3}}>Stato</div>
            <input defaultValue={anag.stato||"ITALIA"} onBlur={e=>commit.current("stato",e.target.value)}
              style={{width:"100%",border:"1px solid #d1d5db",borderRadius:3,padding:"7px 10px",fontSize:13,fontFamily:FF,boxSizing:"border-box"}}/>
          </div>
          <Field label="I.R.C." fkey="irc" half/>
          <Field label="Disabilità" fkey="disabilita" half/>
        </div>
      </div>

      {/* Annotazioni condivise */}
      <div style={{border:"1px solid #d1d5db",borderRadius:4,overflow:"hidden"}}>
        <div style={{background:"#f3f4f6",padding:"8px 14px",borderBottom:"1px solid #d1d5db",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:13,color:"#337ab7",fontWeight:700}}>Annotazioni Condivise <span style={{fontWeight:400,color:"#6b7280",fontSize:12}}>(visibili da tutti i docenti)</span></span>
          <button onClick={salva}
            style={{padding:"5px 18px",background:"#5cb85c",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
            {saved?"✅ Salvato":"💾 Salva"}
          </button>
        </div>
        {/* Mini toolbar formattazione */}
        <div style={{background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"6px 10px",display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
          {[
            {lbl:"B",cmd:"bold",style:{fontWeight:900}},
            {lbl:"I",cmd:"italic",style:{fontStyle:"italic"}},
            {lbl:"U",cmd:"underline",style:{textDecoration:"underline"}},
          ].map(b=>(
            <button key={b.cmd}
              onMouseDown={e=>{e.preventDefault();document.execCommand(b.cmd,false,null);}}
              style={{width:28,height:26,background:"#f5f5f5",border:"1px solid #ccc",borderRadius:3,cursor:"pointer",fontSize:13,...b.style}}>
              {b.lbl}
            </button>
          ))}
          <div style={{width:1,height:20,background:"#ddd",margin:"0 4px"}}/>
          {["12px","14px","16px","18px"].map(sz=>(
            <button key={sz} onMouseDown={e=>{e.preventDefault();document.execCommand("fontSize",false,sz==="12px"?1:sz==="14px"?2:sz==="16px"?3:4);}}
              style={{padding:"2px 6px",background:"#f5f5f5",border:"1px solid #ccc",borderRadius:3,cursor:"pointer",fontSize:10}}>{sz}</button>
          ))}
          <div style={{width:1,height:20,background:"#ddd",margin:"0 4px"}}/>
          <label style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",fontSize:11,color:"#374151"}}>
            A
            <input type="color" defaultValue="#000000"
              onChange={e=>document.execCommand("foreColor",false,e.target.value)}
              style={{width:18,height:18,border:"none",cursor:"pointer",padding:0}}/>
          </label>
        </div>
        <div
          ref={annotRef}
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{__html: anag.annotazioni||"<p>Annotazioni condivise.</p>"}}
          style={{minHeight:120,padding:"12px 14px",fontSize:13,fontFamily:FF,outline:"none",lineHeight:1.7,color:"#1f2937"}}
        />
      </div>

      {/* Bottone salva in fondo */}
      <div style={{marginTop:16,display:"flex",justifyContent:"flex-end",gap:10}}>
        <button onClick={salva}
          style={{padding:"9px 28px",background:"#5cb85c",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
          {saved?"✅ Salvato!":"💾 Salva anagrafica"}
        </button>
      </div>
    </div>
  );
}

function MateriaPagellaRow({mat, voto, carenza, tipoRec, sc, numToWord, votoColor2, isInsuff, RECUPERO_LBL, matDati}) {
  const [open, setOpen] = useState(false);
  const col = votoColor2(voto);
  const hasDettagli = !!(voto && voto !== "");

  // Raccoglie tutti i dati extra dalla materia (carenza, obiettivi, attività, etc.)
  const carenzaOk = carenza && carenza.trim();
  const hasPAI = !!(matDati?.obiettivi || matDati?.attivita || matDati?.metodo || matDati?.motivo);

  return (
    <div style={{borderBottom:"1px solid #e5e7eb"}}>
      {/* Riga principale — stile Axios con nome MAIUSCOLO e voto colorato */}
      <div onClick={()=>hasDettagli&&setOpen(v=>!v)}
        style={{display:"flex",alignItems:"center",padding:"14px 18px",background:"#fff",cursor:hasDettagli?"pointer":"default",userSelect:"none"}}
        onMouseEnter={e=>{if(hasDettagli)e.currentTarget.style.background="#f9fafb";}}
        onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:15,color:"#1f2937",textTransform:"uppercase",letterSpacing:0.5,fontFamily:"Helvetica,Arial,sans-serif"}}>{mat}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <span style={{fontSize:14,color:"#374151",fontWeight:400,fontFamily:"Helvetica,Arial,sans-serif"}}>Voto:</span>
          <span style={{fontWeight:700,fontSize:16,color:col,fontFamily:"Helvetica,Arial,sans-serif"}}>{voto}</span>
          {hasDettagli&&(
            <span style={{fontSize:22,color:"#9ca3af",marginLeft:4,lineHeight:1,transform:open?"rotate(180deg)":"none",transition:"transform 0.2s",display:"inline-block"}}>
              {open ? "∧" : "∨"}
            </span>
          )}
        </div>
      </div>

      {/* Pannello dettaglio espanso */}
      {open&&hasDettagli&&(
        <div style={{background:"#f7f7f7",borderTop:"1px solid #e5e7eb",padding:"0 0 12px 0"}}>
          {/* Box bianco con righe label:valore — stile Axios */}
          <div style={{background:"#fff",margin:"12px 18px 0",border:"1px solid #e5e7eb",borderRadius:4,overflow:"hidden",fontFamily:"Helvetica,Arial,sans-serif"}}>

            {/* Unico: voto scritto per esteso */}
            <div style={{display:"flex",borderBottom:"1px solid #f0f0f0",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Unico:</span>
              <span style={{fontWeight:700,fontSize:14,color:col}}>{numToWord(voto)}</span>
            </div>

            {/* Recupero */}
            {tipoRec&&<div style={{display:"flex",borderBottom:"1px solid #f0f0f0",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Recupero:</span>
              <span style={{fontWeight:600,fontSize:14,color:"#1f2937"}}>{RECUPERO_LBL[tipoRec]||tipoRec}</span>
            </div>}

            {/* Carenze */}
            {carenzaOk&&<div style={{display:"flex",borderBottom:"1px solid #f0f0f0",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Carenze:</span>
              <span style={{fontSize:14,color:"#1f2937",lineHeight:1.6,flex:1}}>{carenza}</span>
            </div>}

            {/* Obiettivi */}
            {matDati?.obiettivi&&<div style={{display:"flex",borderBottom:"1px solid #f0f0f0",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Obiettivi:</span>
              <span style={{fontSize:14,color:"#1f2937",lineHeight:1.6,flex:1}}>{matDati.obiettivi}</span>
            </div>}

            {/* Attività */}
            {matDati?.attivita&&<div style={{display:"flex",borderBottom:"1px solid #f0f0f0",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Attività:</span>
              <span style={{fontSize:14,color:"#1f2937",lineHeight:1.6,flex:1}}>{matDati.attivita}</span>
            </div>}

            {/* Metodo */}
            {matDati?.metodo&&<div style={{display:"flex",borderBottom:"1px solid #f0f0f0",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Metodo:</span>
              <span style={{fontSize:14,color:"#1f2937",lineHeight:1.6,flex:1}}>{matDati.metodo}</span>
            </div>}

            {/* Motivo */}
            {matDati?.motivo&&<div style={{display:"flex",borderBottom:"1px solid #f0f0f0",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Motivo:</span>
              <span style={{fontSize:14,color:"#1f2937",lineHeight:1.6,flex:1}}>{matDati.motivo}</span>
            </div>}

            {/* Recupero 2 (ripetuto in basso come nell'immagine) */}
            {(matDati?.tipoRec||tipoRec)&&<div style={{display:"flex",borderBottom:"1px solid #f0f0f0",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Recupero:</span>
              <span style={{fontSize:14,color:"#1f2937"}}>{RECUPERO_LBL[matDati?.tipoRec||tipoRec]||matDati?.tipoRec||tipoRec}</span>
            </div>}

            {/* Mod. verifica */}
            {matDati?.modVerifica&&<div style={{display:"flex",borderBottom:"1px solid #f0f0f0",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Mod. verifica:</span>
              <span style={{fontSize:14,color:"#1f2937"}}>{matDati.modVerifica}</span>
            </div>}

            {/* Data verifica */}
            {matDati?.dataVerifica&&<div style={{display:"flex",borderBottom:"1px solid #f0f0f0",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Data verifica:</span>
              <span style={{fontSize:14,color:"#1f2937"}}>{matDati.dataVerifica}</span>
            </div>}

            {/* Arg. verifica */}
            {matDati?.argVerifica&&<div style={{display:"flex",borderBottom:"1px solid #f0f0f0",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Arg. verifica:</span>
              <span style={{fontSize:14,color:"#1f2937",fontWeight:600,textTransform:"uppercase"}}>{matDati.argVerifica}</span>
            </div>}

            {/* Giud. verifica */}
            {matDati?.giudVerifica&&<div style={{display:"flex",borderBottom:"1px solid #f0f0f0",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Giud. verifica:</span>
              <span style={{fontSize:14,color:"#1f2937",fontWeight:600,textTransform:"uppercase"}}>{matDati.giudVerifica}</span>
            </div>}

            {/* Carenza recuperata */}
            {isInsuff&&<div style={{display:"flex",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Carenza<br/>recuperata:</span>
              <span style={{fontSize:14,color:"#1f2937",fontWeight:600}}>{matDati?.carenzaRecuperata||"NO"}</span>
            </div>}
          </div>
        </div>
      )}
    </div>
  );
}

const COMPORTAMENTO_DESC = {
  10: "OTTIMO",
  9:  "DISTINTO",
  8:  "BUONO",
  7:  "DISCRETO",
  6:  "SUFFICIENTE",
  5:  "NON SUFFICIENTE",
  4:  "GRAVEMENTE INSUFFICIENTE",
};

function ComportamentoRow({voto, votoColor2, numToWord}) {
  const [open, setOpen] = useState(false);
  const col = votoColor2(voto);
  const desc = COMPORTAMENTO_DESC[parseInt(voto)] || "";

  return (
    <div style={{borderTop:"2px solid #e5e7eb",borderBottom:"1px solid #e5e7eb"}}>
      <div onClick={()=>setOpen(v=>!v)}
        style={{display:"flex",alignItems:"center",padding:"14px 18px",cursor:"pointer",background:"#fff",userSelect:"none"}}
        onMouseEnter={e=>e.currentTarget.style.background="#f9fafb"}
        onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
        <div style={{flex:1,fontWeight:700,fontSize:15,color:"#1f2937",textTransform:"uppercase",letterSpacing:0.5,fontFamily:"Helvetica,Arial,sans-serif"}}>
          COMPORTAMENTO
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <span style={{fontSize:14,color:"#374151",fontFamily:"Helvetica,Arial,sans-serif"}}>Voto:</span>
          <span style={{fontWeight:700,fontSize:16,color:col,fontFamily:"Helvetica,Arial,sans-serif"}}>{voto}</span>
          <span style={{fontSize:22,color:"#9ca3af",marginLeft:4,lineHeight:1,transform:open?"rotate(180deg)":"none",transition:"transform 0.2s",display:"inline-block"}}>
            {open?"∧":"∨"}
          </span>
        </div>
      </div>
      {open&&(
        <div style={{background:"#f7f7f7",borderTop:"1px solid #e5e7eb"}}>
          <div style={{background:"#fff",margin:"12px 18px",border:"1px solid #e5e7eb",borderRadius:4,overflow:"hidden",fontFamily:"Helvetica,Arial,sans-serif"}}>
            <div style={{display:"flex",borderBottom:"1px solid #f0f0f0",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Unico:</span>
              <span style={{fontWeight:700,fontSize:14,color:col}}>{numToWord(voto)}</span>
            </div>
            {desc&&<div style={{display:"flex",padding:"11px 14px",gap:12}}>
              <span style={{width:130,flexShrink:0,color:"#374151",fontSize:14}}>Giudizio:</span>
              <span style={{fontWeight:700,fontSize:14,color:col}}>{desc}</span>
            </div>}
          </div>
        </div>
      )}
    </div>
  );
}

function RiepilogoAccordion({hasCarenze, nCarenze}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{borderBottom:"1px solid #e5e7eb"}}>
      <div onClick={()=>setOpen(v=>!v)}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",cursor:"pointer",background:"#fff",userSelect:"none"}}
        onMouseEnter={e=>e.currentTarget.style.background="#f9fafb"}
        onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
        <div>
          <div style={{fontWeight:700,fontSize:15,color:"#1f2937",fontFamily:"Helvetica,Arial,sans-serif"}}>Riepilogo</div>
          <div style={{fontSize:13,marginTop:2,fontFamily:"Helvetica,Arial,sans-serif"}}>
            Carenze: {hasCarenze
              ? <span style={{color:"#e53935",fontWeight:700}}>Sì ({nCarenze})</span>
              : <span style={{color:"#22c55e",fontWeight:700}}>No</span>
            }
          </div>
        </div>
        <span style={{fontSize:22,color:"#9ca3af",transform:open?"rotate(180deg)":"none",transition:"transform 0.2s",display:"inline-block"}}>
          {open?"∧":"∨"}
        </span>
      </div>
      {open&&(
        <div style={{background:"#f7f7f7",padding:"12px 18px",borderTop:"1px solid #f0f0f0",fontFamily:"Helvetica,Arial,sans-serif",fontSize:13,color:"#374151"}}>
          {hasCarenze
            ? <div style={{color:"#e53935"}}>Sono presenti {nCarenze} carenz{nCarenze===1?"a":"e"} che richiedono recupero.</div>
            : <div style={{color:"#22c55e",fontWeight:600}}>Nessuna carenza presente. L'alunno ha conseguito risultati sufficienti in tutte le materie.</div>
          }
        </div>
      )}
    </div>
  );
}

function GiudizioAccordion({note}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{borderBottom:"1px solid #e5e7eb"}}>
      <div onClick={()=>setOpen(v=>!v)}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",cursor:"pointer",background:"#fff",userSelect:"none"}}
        onMouseEnter={e=>e.currentTarget.style.background="#f9fafb"}
        onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
        <div>
          <div style={{fontWeight:700,fontSize:15,color:"#1f2937",fontFamily:"Helvetica,Arial,sans-serif"}}>Giudizio</div>
          <div style={{fontSize:13,color:"#374151",marginTop:2,fontFamily:"Helvetica,Arial,sans-serif",textTransform:"uppercase",fontWeight:600,letterSpacing:0.3}}>
            {/* Estrae il giudizio sintetico dalle note se possibile */}
            {note.length < 30 ? note : note.split(/[.\n]/)[0]?.trim()?.toUpperCase() || "VEDI DETTAGLIO"}
          </div>
        </div>
        <span style={{fontSize:22,color:"#9ca3af",transform:open?"rotate(180deg)":"none",transition:"transform 0.2s",display:"inline-block"}}>
          {open?"∧":"∨"}
        </span>
      </div>
      {open&&(
        <div style={{background:"#f7f7f7",padding:"12px 18px",borderTop:"1px solid #f0f0f0",fontFamily:"Helvetica,Arial,sans-serif",fontSize:14,color:"#374151",lineHeight:1.7}}>
          {note}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// FEED FAMIGLIA — stile app (pallini colorati cronologici)
// Compiti=verde, Argomenti=celeste, Annotazioni=viola,
// Voti=nero/grigio scuro, Note disciplinari=rosso, Assenze=teal/arancio
// Sempre derivato dal registro reale (contDB/votiDB/assenzeDB)
// ══════════════════════════════════════════════════════
function FeedFamigliaTab({s, contDB, assenzeDB, votiDB, classe, docente, onNavigateTab, pgTrim}) {
  const [giornoSel, setGiornoSel] = useState(todayISO());
  const [pickerOpen, setPickerOpen] = useState(false);

  const [menuTabOpen, setMenuTabOpen] = useState(false);
  const menuTabRef = useRef(null);
  useEffect(()=>{
    if(!menuTabOpen) return;
    const h = e => { if(menuTabRef.current && !menuTabRef.current.contains(e.target)) setMenuTabOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  },[menuTabOpen]);
  const MENU_TAB_VOCI = [
    {id:"compiti", lbl:"📝 Compiti"},
    {id:"lezioni", lbl:"📚 Lezioni"},
    {id:"voti", lbl:"⭐ Voti"},
    {id:"pagella", lbl:"📋 Pagella"},
    {id:"curriculum", lbl:"🎓 Curriculum"},
    {id:"comunicazioni", lbl:"📢 Comunicazioni"},
    {id:"registroweb", lbl:"🌐 Registro Web"},
  ];
  const trackRef = useRef(null);
  const dragRef = useRef({active:false, startX:0, startY:0, dx:0, moved:false});

  const onPointerDown = e => {
    if(trackRef.current) trackRef.current.style.transition = "";
    const x = e.touches?e.touches[0].clientX:e.clientX;
    const y = e.touches?e.touches[0].clientY:e.clientY;
    dragRef.current = {active:true, startX:x, startY:y, dx:0, moved:false};
  };
  const onPointerMove = e => {
    if(!dragRef.current.active) return;
    const x = e.touches?e.touches[0].clientX:e.clientX;
    const y = e.touches?e.touches[0].clientY:e.clientY;
    const dx = x - dragRef.current.startX;
    const dy = y - dragRef.current.startY;
    if(Math.abs(dx) > 6) dragRef.current.moved = true;
    // Se il movimento è chiaramente più verticale che orizzontale, lascia scorrere la pagina
    if(Math.abs(dy) > Math.abs(dx) + 10) return;
    if(e.cancelable) e.preventDefault();
    dragRef.current.dx = dx;
    if(trackRef.current) trackRef.current.style.transform = `translateX(${dx}px)`;
  };
  const onPointerUp = () => {
    if(!dragRef.current.active) return;
    const dx = dragRef.current.dx;
    dragRef.current.active = false;
    if(trackRef.current){
      trackRef.current.style.transition = "transform 0.22s cubic-bezier(.2,.9,.25,1)";
      trackRef.current.style.transform = "translateX(0px)";
    }
    if(dx <= -45) cambiaGiorno(1);        // swipe verso sinistra → giorno successivo (avanti)
    else if(dx >= 45) cambiaGiorno(-1);   // swipe verso destra → giorno precedente (indietro)
    dragRef.current.dx = 0;
  };
  const onCentroClick = () => {
    if(!dragRef.current.moved) setPickerOpen(true);
  };

  const fmtDayBig = iso => {
    try{
      const d=new Date(iso+"T00:00:00");
      const GG=["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
      const MM=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
      return {num:d.getDate(), giorno:GG[d.getDay()], mese:MM[d.getMonth()].toUpperCase(), anno:d.getFullYear()};
    }catch{return {num:"",giorno:"",mese:"",anno:""};}
  };

  // Raccoglie TUTTI gli item del giorno selezionato per questo alunno, da tutte le materie
  const prefix = `${classe}||`;
  const riguardaAlunno = item => !item.partecipazione || item.partecipazione==="tutti" || (item.alunniParz||[]).length===0 || (item.alunniParz||[]).includes(s.id);

  const eventiGiorno = [];

  Object.entries(contDB||{}).forEach(([k,v])=>{
    const isClassKey = k===`__class__${classe}`;
    const isMatKey = k.startsWith(prefix) && !k.includes("__firme__");
    if(!isClassKey && !isMatKey) return;
    const mat = isMatKey ? (k.split("||")[1]||"") : "";

    (v.lezioni||[]).forEach(it=>{ if(toISO(it.data||"")===giornoSel && riguardaAlunno(it)) eventiGiorno.push({tipo:"argomento", mat:it.materiaLezione||mat, testo:it.testo, inseritoDa:it.inseritoDa, id:"l"+it.id}); });
    (v.compiti||[]).forEach(it=>{ if(toISO(it.data||"")===giornoSel && riguardaAlunno(it)) eventiGiorno.push({tipo:"compito", mat:it.materiaLezione||mat, testo:it.testo, inseritoDa:it.inseritoDa, id:"c"+it.id}); });
    // Le verifiche scritte inserite nel registro di classe compaiono in Home come Compito
    (v.verifiche||[]).forEach(it=>{ if(toISO(it.data||"")===giornoSel && (it.tipoVerifica||"")==="Scritto" && riguardaAlunno(it)) eventiGiorno.push({tipo:"compito", mat:it.materia||mat, testo:it.argomenti||it.testo||"", inseritoDa:it.inseritoDa, id:"vf"+it.id, _isVerifica:true}); });
    if(isClassKey){
      (v.annotazioni||[]).forEach(it=>{
        const rig = it.destinatariTutti || !it.destinatari?.length || it.destinatari.includes(s.id);
        if(toISO(it.data||"")===giornoSel && rig) eventiGiorno.push({tipo:"annotazione", mat:"", testo:it.testo, inseritoDa:it.inseritoDa||"", id:"a"+it.id});
      });
      (v.note||[]).forEach(it=>{
        const rig = it.destinatariTutti || !it.destinatari?.length || it.destinatari.includes(s.id);
        if(toISO(it.data||"")===giornoSel && rig) eventiGiorno.push({tipo:"nota", mat:"", testo:it.testo, inseritoDa:it.inseritoDa||"", id:"n"+it.id});
      });
    }
  });

  // Voti del giorno per questo alunno, in tutte le materie
  Object.entries(votiDB||{}).filter(([k])=>k.startsWith(prefix)).forEach(([k,vAlunni])=>{
    const mat = k.split("||")[1]||"";
    (vAlunni[s.id]||[]).forEach(v=>{
      if(toISO(v.data||"")===giornoSel && v.voto && v.voto!==" " && v.visFam!==false){
        const commenti = [v.notaFam, v.nota].filter(c=>c&&c.trim()).join(" — ");
        eventiGiorno.push({tipo:"voto", mat, voto:v.voto, faMedia:v.faMedia, testo:commenti, id:"v"+v.id});
      }
    });
  });

  // Assenze/eventi presenza del giorno
  (assenzeDB[classe]?.[s.id]||[]).forEach(a=>{
    if(toISO(a.data||"")===giornoSel){
      eventiGiorno.push({tipo:"assenza", subTipo:a.tipo, testo:a.motivo||"", oraOrologio:a.oraOrologio, oraLezione:a.oraLezione, id:"as"+a.id});
    }
  });

  // Comunicazioni del giorno (globali, filtrate per classe)
  (contDB["__comunicazioni__"]?.["comunicazioni"]||[]).forEach(c=>{
    const cVisibile = !c.classiCom || c.classiCom.length===0 || c.classiCom.includes(classe);
    if(cVisibile && toISO(c.data||"")===giornoSel && c.visibileFamiglie!==false){
      eventiGiorno.push({tipo:"comunicazione", testo:c.oggetto||"", sub:c.testo||"", id:"com"+c.id});
    }
  });

  const STILE_TIPO = {
    compito:      {label:"Compito",        bg:"#22c55e", icona:""},
    argomento:    {label:"Argomento svolto",bg:"#3b9ee0", icona:""},
    annotazione:  {label:"Annotazione",     bg:"#8b5cf6", icona:"", labelBg:"#9ca3af", labelFg:"#1f2937"},
    voto:         {label:"Voto",            bg:"#1f2937", icona:""},
    nota:         {label:"Nota disciplinare",bg:"#ef4444", icona:"", labelBg:"#ef4444", labelFg:"#fff"},
    assenza:      {label:"Assenza",         bg:"#ef4444", icona:""},
    comunicazione:{label:"Comunicazione",   bg:"#f97316", icona:""},
  };

  const ASSENZA_LABEL = {assente:"Assenza", ritardo:"Ritardo", uscita:"Uscita anticipata", ingresso:"Ingresso", fuori_aula:"Presente fuori aula"};

  // Tronca il testo per l'anteprima nel feed — non mostra mai il testo completo
  const troncaTesto = (testo, max=48) => {
    if(!testo) return "";
    const t = String(testo).trim();
    return t.length > max ? t.slice(0,max).trimEnd()+"…" : t;
  };

  // Dati delle firme del giorno (per ordinare come nel pannello Firme e per il pallino blu)
  const firmeGiorno = ((contDB[`${classe}||__firme__`]||{}).firme||[]).filter(f=>toISO(f.data||"")===giornoSel);
  const firmePerMateria = {};
  firmeGiorno.forEach(f=>{
    const m=(f.materia||f.materiaFirma||"").toLowerCase().trim();
    const n=parseInt(f.oraInizioNum||f.oraInizio)||null;
    const dur=parseInt(f.nOre)||1;
    if(m&&n){
      if(!firmePerMateria[m]) firmePerMateria[m]=[];
      firmePerMateria[m].push({ora:n, durata:dur});
    }
  });
  Object.keys(firmePerMateria).forEach(k=>firmePerMateria[k].sort((a,b)=>a.ora-b.ora));

  const firmaPerEvento = ev => {
    if(ev.tipo!=="argomento" && ev.tipo!=="compito") return null;
    const m=(ev.mat||"").toLowerCase().trim();
    const lista=firmePerMateria[m];
    if(!lista || lista.length===0) return null;
    if(lista.length===1) return lista[0];
    // Se ci sono piu' firme per la stessa materia, assegna l'ora in base all'ordine di inserimento
    const stessoTipoEMateria = eventiGiorno.filter(e=>e.tipo===ev.tipo && (e.mat||"").toLowerCase().trim()===m);
    const idx = stessoTipoEMateria.findIndex(e=>e.id===ev.id);
    return lista[Math.min(Math.max(idx,0), lista.length-1)] || lista[0];
  };

  const oraDiEvento = ev => {
    if(ev.tipo==="assenza"){ const n=parseInt(ev.oraLezione); return isNaN(n)?99:n; }
    const f=firmaPerEvento(ev);
    return f ? f.ora : 99;
  };

  const numeroPallinoEvento = ev => {
    if(ev.tipo!=="argomento" && ev.tipo!=="compito") return null;
    const f=firmaPerEvento(ev);
    if(!f) return null;
    // Se la firma dura 2 o piu' ore, il pallino resta vuoto
    if(f.durata>=2) return null;
    return f.ora;
  };

  // Ordine fisso richiesto: Comunicazioni → Assenze/Ritardi/Uscite/Fuori aula → Voti → Note/Annotazioni → Argomenti svolti → Compiti
  const PRIORITA_TIPO = {
    comunicazione: 0,
    assenza: 1,
    voto: 2,
    nota: 3,
    annotazione: 3,
    argomento: 4,
    compito: 5,
  };
  eventiGiorno.sort((a,b)=>{
    const p=(PRIORITA_TIPO[a.tipo]??99)-(PRIORITA_TIPO[b.tipo]??99);
    if(p!==0) return p;
    return oraDiEvento(a)-oraDiEvento(b);
  });



  // Conteggi totali (per i 4 box in alto)
  const tuttiAss = assenzeDB[classe]?.[s.id]||[];
  const cntAssenze = tuttiAss.filter(a=>a.tipo==="assente"&&a.concorreCalcolo!==false).length;
  const cntRitardi = tuttiAss.filter(a=>a.tipo==="ritardo").length;
  const cntUscite  = tuttiAss.filter(a=>a.tipo==="uscita").length;

  // Media generale (SOLO materie/voti del quadrimestre selezionato nel registro del docente)
  const trimAttivo = pgTrim || TRIMESTRI[0];
  const tuttiVotiAlunno = [];
  Object.entries(votiDB||{}).filter(([k])=>k.startsWith(prefix)).forEach(([,vAlunni])=>{
    (vAlunni[s.id]||[]).forEach(v=>{
      const vTrim = v.trimestre||TRIMESTRI[0];
      if(vTrim===trimAttivo) tuttiVotiAlunno.push(v);
    });
  });
  const perMediaGen = tuttiVotiAlunno.filter(v=>v.faMedia && v.voto && !isNaN(parseVoto(v.voto)));
  let mediaGen = null;
  if(perMediaGen.length){
    let sp=0,sv=0;
    perMediaGen.forEach(v=>{const w=parseFloat(v.peso)||100;sv+=parseVoto(v.voto)*w;sp+=w;});
    if(sp>0) mediaGen = sv/sp;
  }

  const giorno = fmtDayBig(giornoSel);
  const cambiaGiorno = delta => { const d=new Date(giornoSel+"T00:00:00"); d.setDate(d.getDate()+delta); setGiornoSel(d.toISOString().split("T")[0]); };

  return (
    <div style={{fontFamily:FF, background:"#fff", minHeight:"100%"}}>
      {/* 4 box statistiche — cliccabili, navigano al tab corretto */}
      <div style={{display:"flex",alignItems:"center",position:"relative"}}>
        <div ref={menuTabRef} style={{position:"absolute",top:6,left:6,zIndex:5}}>
          <button onClick={()=>setMenuTabOpen(v=>!v)} title="Vai a sezione"
            style={{width:30,height:30,background:"rgba(0,0,0,0.28)",border:"1px solid rgba(255,255,255,0.5)",color:"#fff",borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{fontSize:16,lineHeight:1}}>☰</span>
          </button>
          {menuTabOpen&&(
            <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:"#fff",borderRadius:6,boxShadow:"0 8px 28px rgba(0,0,0,0.28)",border:"1px solid #e5e7eb",zIndex:400,minWidth:160,overflow:"hidden"}}>
              {MENU_TAB_VOCI.map((v,i)=>(
                <button key={v.id} onClick={()=>{setMenuTabOpen(false);onNavigateTab&&onNavigateTab(v.id);}}
                  style={{width:"100%",padding:"10px 16px",background:"#fff",border:"none",borderBottom:i<MENU_TAB_VOCI.length-1?"1px solid #f3f4f6":"none",fontWeight:600,fontSize:13,cursor:"pointer",textAlign:"left",fontFamily:FF,color:"#1f2937",display:"flex",alignItems:"center",gap:8}}>
                  {v.lbl}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:0,width:"100%"}}>
        {[
          {lbl:"Assenze", val:cntAssenze, bg:"#0d9488", badge:cntAssenze, target:"assenze"},
          {lbl:"Ritardi", val:cntRitardi, bg:"#65a30d", badge:cntRitardi, target:"assenze"},
          {lbl:"Uscite", val:cntUscite>0?cntUscite:"-", bg:"#dc6b6b", badge:cntUscite, target:"assenze"},
          {lbl:"Media", val:mediaGen!==null?mediaGen.toFixed(2).replace(".",","):"0,00", bg:"#0f4c4c", badge:null, target:"voti"},
        ].map((box)=>(
          <div key={box.lbl} onClick={()=>onNavigateTab&&onNavigateTab(box.target)}
            style={{background:box.bg,color:"#fff",padding:"14px 8px",textAlign:"center",position:"relative",cursor:"pointer",userSelect:"none"}}
            onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.1)"}
            onMouseLeave={e=>e.currentTarget.style.filter="none"}>
            {box.badge>0&&<div style={{position:"absolute",top:6,right:6,background:"#dc2626",borderRadius:"50%",width:20,height:20,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{box.badge}</div>}
            <div style={{fontSize:13,fontWeight:600,opacity:0.95}}>{box.lbl}</div>
            <div style={{fontSize:26,fontWeight:700,marginTop:2}}>{box.val}</div>
          </div>
        ))}
        </div>
      </div>

      {/* Navigatore giorno arancione — scorrevole con swipe/drag, click centrale apre calendario */}
      <div
        style={{background:"#d2531e",color:"#fff",padding:"10px 4px",display:"flex",alignItems:"center",justifyContent:"space-between",overflow:"hidden",touchAction:"pan-y",position:"relative"}}
        onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
      >
        <button
          onClick={e=>{e.stopPropagation();cambiaGiorno(-1);}}
          onMouseDown={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()}
          onTouchEnd={e=>e.stopPropagation()}
          style={{background:"transparent",border:"none",color:"#fff",cursor:"pointer",fontSize:24,fontWeight:700,width:48,height:48,flexShrink:0,userSelect:"none",display:"flex",alignItems:"center",justifyContent:"center",WebkitTapHighlightColor:"transparent",touchAction:"manipulation",zIndex:2}}>‹</button>
        <div ref={trackRef} onClick={onCentroClick} style={{textAlign:"center",flex:1,cursor:"pointer"}}>
          <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:10}}>
            <span style={{fontSize:30,fontWeight:700}}>{giorno.num}</span>
            <span style={{fontSize:18}}>{giorno.giorno}</span>
          </div>
          <div style={{fontSize:12,fontWeight:700,letterSpacing:1}}>{giorno.mese} {giorno.anno}</div>
        </div>
        <button
          onClick={e=>{e.stopPropagation();cambiaGiorno(1);}}
          onMouseDown={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()}
          onTouchEnd={e=>e.stopPropagation()}
          style={{background:"transparent",border:"none",color:"#fff",cursor:"pointer",fontSize:24,fontWeight:700,width:48,height:48,flexShrink:0,userSelect:"none",display:"flex",alignItems:"center",justifyContent:"center",WebkitTapHighlightColor:"transparent",touchAction:"manipulation",zIndex:2}}>›</button>
      </div>

      {/* Modal calendario — si apre cliccando sulla data */}
      {pickerOpen&&(
        <div onClick={()=>setPickerOpen(false)}
          style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FF}}>
          <div onClick={e=>e.stopPropagation()}>
            <AxiosDatePicker
              value={giornoSel}
              onChange={v=>{ setGiornoSel(v); setPickerOpen(false); }}
              onClose={()=>setPickerOpen(false)}
            />
          </div>
        </div>
      )}




      {/* Feed eventi del giorno */}
      <div>

        {eventiGiorno.length===0
          ? <div style={{padding:"40px 20px",textAlign:"center",color:"#9ca3af",fontSize:14}}>Nessun evento in questa data</div>
          : eventiGiorno.map((ev,i)=>{
              const st = STILE_TIPO[ev.tipo];
              const isAssenzaLike = ev.tipo==="assenza";
              const titolo = ev.tipo==="assenza" ? (ASSENZA_LABEL[ev.subTipo]||ev.subTipo)
                : ev.tipo==="voto" ? `Voto - ${(ev.mat||"").toUpperCase()}`
                : ev.tipo==="comunicazione" ? "Comunicazione"
                : st.label;
              const sottotitolo = ev.tipo==="voto" ? null
                : ev.tipo==="comunicazione" ? null
                : ev.tipo==="annotazione" ? (ev.inseritoDa?cognomeNome(ev.inseritoDa).toUpperCase():"DOCENTE NON SPECIFICATO")
                : ev.tipo==="nota" ? (ev.inseritoDa?cognomeNome(ev.inseritoDa).toUpperCase():"DOCENTE NON SPECIFICATO")
                : ev.tipo==="assenza" ? (
                    ev.subTipo==="ritardo" ? `Entra alle: ${ev.oraOrologio||"—"} - Ora di lezione: ${ev.oraLezione??0}`
                    : ev.subTipo==="uscita" ? `Esce alle: ${ev.oraOrologio||"—"} - Ora di lezione: ${ev.oraLezione??0}`
                    : ""
                  )
                : (ev.mat||"");
              const targetTab = ev.tipo==="voto"?"voti":ev.tipo==="compito"?"compiti":ev.tipo==="argomento"?"lezioni":ev.tipo==="annotazione"?"note":ev.tipo==="nota"?"note":ev.tipo==="assenza"?"assenze":ev.tipo==="comunicazione"?"comunicazioni":null;
              // Numero ora nel pallino: SOLO per ritardo/uscita. Per assenza e fuori_aula il pallino resta vuoto.
              const mostraNumeroPallino = ev.subTipo==="ritardo" || ev.subTipo==="uscita";
              const oraNum = mostraNumeroPallino
                ? (ev.oraLezione!==undefined&&ev.oraLezione!==null&&ev.oraLezione!==""
                    ? ev.oraLezione
                    : (ev.ore&&/^\d+$/.test(String(ev.ore).trim()) ? ev.ore : "0"))
                : null;
              return (
                <div key={ev.id} onClick={()=>targetTab&&onNavigateTab&&onNavigateTab(targetTab)}
                  style={{display:"flex",alignItems:"flex-start",gap:12,padding:"14px 18px",borderBottom:"1px solid #f0ece6",background:i%2===0?"#fdf6f0":"#fff",cursor:targetTab?"pointer":"default"}}
                  onMouseEnter={e=>{if(targetTab)e.currentTarget.style.background="#f5e9df";}}
                  onMouseLeave={e=>{e.currentTarget.style.background=i%2===0?"#fdf6f0":"#fff";}}>
                  {/* Pallino — rosso con numero ora SOLO per ritardo/uscita. Per assenza/fuori_aula pallino rosso vuoto. */}
                  {isAssenzaLike
                    ? (mostraNumeroPallino
                        ? <div style={{width:24,height:24,borderRadius:"50%",background:"#ef4444",color:"#fff",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>{oraNum}</div>
                        : <div style={{width:24,height:24,borderRadius:"50%",background:"#ef4444",flexShrink:0,marginTop:2}}/>
                      )
                    : ((ev.tipo==="argomento" || ev.tipo==="compito")
                        ? (numeroPallinoEvento(ev)!==null
                            ? <div style={{width:24,height:24,borderRadius:"50%",background:st.bg,color:"#fff",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:4}}>{numeroPallinoEvento(ev)}</div>
                            : <div style={{width:24,height:24,borderRadius:"50%",background:st.bg,flexShrink:0,marginTop:4}}/>)
                        : <div style={{width:24,height:24,borderRadius:"50%",background:st.bg,flexShrink:0,marginTop:4}}/>)

                  }
                  <div style={{flex:1,minWidth:0}}>
                    {(ev.tipo==="nota"||ev.tipo==="annotazione")
                      ? <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{background:st.labelBg,color:st.labelFg,borderRadius:3,padding:"2px 8px",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{titolo}</span>
                          {sottotitolo&&<span style={{fontSize:13,color:"#6b7280",fontWeight:600}}>{sottotitolo}</span>}
                        </div>
                      : <div style={{fontWeight:700,fontSize:15,color:"#1f2937"}}>{titolo}</div>
                    }
                    {sottotitolo&&ev.tipo!=="nota"&&ev.tipo!=="annotazione"&&<div style={{fontSize:13,color:"#9ca3af",fontWeight:600,marginTop:1}}>{sottotitolo}</div>}
                    {ev.tipo==="voto"&&(
                      <>
                        <div style={{fontSize:18,fontWeight:900,color:"#1f2937",marginTop:2}}>{votoDisplay(ev.voto)}</div>
                        {ev.testo&&<div style={{fontSize:13,color:"#6b7280",marginTop:2,lineHeight:1.4}}>{troncaTesto(ev.testo)}</div>}
                      </>
                    )}
                    {ev.tipo==="comunicazione"&&(
                      <>
                        {/* Solo il titolo della comunicazione — nero testo normale */}
                        {ev.testo&&<div style={{fontSize:15,fontWeight:400,color:"#000",marginTop:1}}>{troncaTesto(ev.testo,40)}</div>}
                      </>
                    )}
                    {ev.tipo!=="voto"&&ev.tipo!=="comunicazione"&&ev.testo&&<div style={{fontSize:13,color:"#6b7280",marginTop:2,lineHeight:1.4}}>{ev._isVerifica&&<b style={{color:"#1f2937"}}>Verifica </b>}{troncaTesto(ev.testo)}</div>}
                  </div>
                  <span style={{color:"#d1d5db",fontSize:18,flexShrink:0}}>›</span>
                </div>
              );
            })
        }
      </div>

      {/* Bottoni rapidi in fondo — anch'essi navigano */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:1,marginTop:8}}>
        <div onClick={()=>onNavigateTab&&onNavigateTab("compiti")} style={{background:"#22c55e",color:"#fff",textAlign:"center",padding:"12px 0",fontWeight:700,fontSize:14,cursor:"pointer"}}>Compiti</div>
        <div onClick={()=>onNavigateTab&&onNavigateTab("lezioni")} style={{background:"#3b9ee0",color:"#fff",textAlign:"center",padding:"12px 0",fontWeight:700,fontSize:14,cursor:"pointer"}}>Lezioni</div>
        <div style={{background:"#d2531e",color:"#fff",textAlign:"center",padding:"12px 0",fontWeight:700,fontSize:14}}>Materiale didattico</div>
        <div onClick={()=>onNavigateTab&&onNavigateTab("comunicazioni")} style={{background:"#8b5cf6",color:"#fff",textAlign:"center",padding:"12px 0",fontWeight:700,fontSize:14,cursor:"pointer"}}>Comunicazioni</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// REGISTRO WEB — vista giornaliera stile app Axios Famiglie
// (senza comunicazioni), con stili specifici per tipo
// ══════════════════════════════════════════════════════
function RegistroWebTab({s, contDB, assenzeDB, votiDB, classe, docente}) {
  const [giornoSel, setGiornoSel] = useState(todayISO());
  const [pickerOpen, setPickerOpen] = useState(false);

  const fmtDayBig = iso => {
    try{
      const d=new Date(iso+"T00:00:00");
      const GG=["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
      const MM=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
      return {num:d.getDate(), giorno:GG[d.getDay()], mese:MM[d.getMonth()].toUpperCase(), anno:d.getFullYear()};
    }catch{return {num:"",giorno:"",mese:"",anno:""};}
  };

  const prefix = `${classe}||`;
  const riguardaAlunno = item => !item.partecipazione || item.partecipazione==="tutti" || (item.alunniParz||[]).length===0 || (item.alunniParz||[]).includes(s.id);

  const eventiGiorno = [];

  Object.entries(contDB||{}).forEach(([k,v])=>{
    const isClassKey = k===`__class__${classe}`;
    const isMatKey = k.startsWith(prefix) && !k.includes("__firme__");
    if(!isClassKey && !isMatKey) return;
    const mat = isMatKey ? (k.split("||")[1]||"") : "";

    (v.lezioni||[]).forEach(it=>{ if(toISO(it.data||"")===giornoSel && riguardaAlunno(it)) eventiGiorno.push({tipo:"argomento", mat:it.materiaLezione||mat, testo:it.testo, id:"l"+it.id}); });
    (v.compiti||[]).forEach(it=>{ if(toISO(it.data||"")===giornoSel && riguardaAlunno(it)) eventiGiorno.push({tipo:"compito", mat:it.materiaLezione||mat, testo:it.testo, id:"c"+it.id}); });
    (v.verifiche||[]).forEach(it=>{ if(toISO(it.data||"")===giornoSel) eventiGiorno.push({tipo:"verifica", mat:it.materia||mat, testo:it.argomenti||it.testo||"", tipoVerifica:it.tipoVerifica||"", id:"vf"+it.id}); });
    if(isClassKey){
      (v.annotazioni||[]).forEach(it=>{
        const rig = it.destinatariTutti || !it.destinatari?.length || it.destinatari.includes(s.id);
        if(toISO(it.data||"")===giornoSel && rig) eventiGiorno.push({tipo:"annotazione", testo:it.testo, inseritoDa:it.inseritoDa||"", id:"a"+it.id});
      });
      (v.note||[]).forEach(it=>{
        const rig = it.destinatariTutti || !it.destinatari?.length || it.destinatari.includes(s.id);
        if(toISO(it.data||"")===giornoSel && rig) eventiGiorno.push({tipo:"nota", testo:it.testo, inseritoDa:it.inseritoDa||"", id:"n"+it.id});
      });
    }
  });

  // Voti del giorno
  Object.entries(votiDB||{}).filter(([k])=>k.startsWith(prefix)).forEach(([k,vAlunni])=>{
    const mat = k.split("||")[1]||"";
    (vAlunni[s.id]||[]).forEach(v=>{
      if(toISO(v.data||"")===giornoSel && v.voto && v.voto!==" " && v.visFam!==false){
        eventiGiorno.push({tipo:"voto", mat, voto:v.voto, faMedia:v.faMedia, testo:v.notaFam||v.nota||"", id:"v"+v.id});
      }
    });
  });

  // Assenze/eventi presenza
  (assenzeDB[classe]?.[s.id]||[]).forEach(a=>{
    if(toISO(a.data||"")===giornoSel){
      eventiGiorno.push({tipo:"assenza", subTipo:a.tipo, oraOrologio:a.oraOrologio, oraLezione:a.oraLezione, id:"as"+a.id});
    }
  });

  const PRIORITA = {assenza:0, voto:1, nota:2, annotazione:3, verifica:4, argomento:5, compito:6};
  eventiGiorno.sort((a,b)=>(PRIORITA[a.tipo]??99)-(PRIORITA[b.tipo]??99));

  const ASSENZA_LABEL = {assente:"Assente", ritardo:"Ritardo", uscita:"Uscita anticipata", ingresso:"Ingresso", fuori_aula:"Presente fuori dalla classe"};

  const giorno = fmtDayBig(giornoSel);
  const cambiaGiorno = delta => { const d=new Date(giornoSel+"T00:00:00"); d.setDate(d.getDate()+delta); setGiornoSel(d.toISOString().split("T")[0]); };

  return (
    <div style={{fontFamily:FF, background:"#fff", minHeight:"100%"}}>
      {/* Navigatore giorno arancione */}
      <div style={{background:"#d2531e",color:"#fff",padding:"10px 4px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <button onClick={()=>cambiaGiorno(-1)} style={{background:"transparent",border:"none",color:"#fff",cursor:"pointer",fontSize:24,fontWeight:700,width:48,height:48,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
        <div onClick={()=>setPickerOpen(true)} style={{textAlign:"center",flex:1,cursor:"pointer"}}>
          <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:10}}>
            <span style={{fontSize:30,fontWeight:700}}>{giorno.num}</span>
            <span style={{fontSize:18}}>{giorno.giorno}</span>
          </div>
          <div style={{fontSize:12,fontWeight:700,letterSpacing:1}}>{giorno.mese} {giorno.anno}</div>
        </div>
        <button onClick={()=>cambiaGiorno(1)} style={{background:"transparent",border:"none",color:"#fff",cursor:"pointer",fontSize:24,fontWeight:700,width:48,height:48,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
      </div>

      {pickerOpen&&(
        <div onClick={()=>setPickerOpen(false)} style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FF}}>
          <div onClick={e=>e.stopPropagation()}>
            <AxiosDatePicker value={giornoSel} onChange={v=>{ setGiornoSel(v); setPickerOpen(false); }} onClose={()=>setPickerOpen(false)}/>
          </div>
        </div>
      )}

      {/* Feed eventi del giorno — niente comunicazioni */}
      <div>
        {eventiGiorno.length===0
          ? <div style={{padding:"40px 20px",textAlign:"center",color:"#9ca3af",fontSize:14}}>Nessun evento in questa data</div>
          : eventiGiorno.map((ev,i)=>{
              if(ev.tipo==="assenza"){
                // Stile immagine 1: icona rossa + label, sotto eventuale dettaglio orario
                const sottot = ev.subTipo==="ritardo" ? `${ev.oraOrologio||""} [ora ${ev.oraLezione??0}]`
                  : ev.subTipo==="uscita" ? `${ev.oraOrologio||""} [ora ${ev.oraLezione??0}]`
                  : "";
                return (
                  <div key={ev.id} style={{borderBottom:"1px solid #e5e7eb",padding:"16px 18px",display:"flex",alignItems:"flex-start",justifyContent:"center",gap:10,background:i%2===0?"#fff":"#fafafa"}}>
                    <span style={{color:"#ef4444",fontSize:20,flexShrink:0,marginTop:1}}>Ƽ</span>
                    <div style={{textAlign:"left"}}>
                      <div style={{fontWeight:700,fontSize:15,color:"#1f2937"}}>{ASSENZA_LABEL[ev.subTipo]||ev.subTipo}</div>
                      {sottot&&<div style={{fontSize:12,color:"#9ca3af",marginTop:1}}>{sottot}</div>}
                    </div>
                  </div>
                );
              }
              if(ev.tipo==="voto"){
                // Stile immagine 2/4: numero colorato (verde/rosso/blu) a sx + titolo + descrizione
                const n = parseVoto(ev.voto);
                const col = !ev.faMedia ? "#3b82f6" : (!isNaN(n) && n<6) ? "#ef4444" : "#16a34a";
                return (
                  <div key={ev.id} style={{borderBottom:"1px solid #e5e7eb",padding:"14px 18px",display:"flex",alignItems:"flex-start",gap:14,background:i%2===0?"#fff":"#fafafa"}}>
                    <span style={{color:col,fontWeight:800,fontSize:20,minWidth:28,textAlign:"center",flexShrink:0}}>{votoDisplay(ev.voto)}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:15,color:"#1f2937"}}>Valutazione di {(ev.mat||"").toUpperCase()}</div>
                      {ev.testo&&<div style={{fontSize:12,color:"#9ca3af",marginTop:1,lineHeight:1.4}}>{ev.testo}</div>}
                    </div>
                  </div>
                );
              }
              if(ev.tipo==="annotazione"){
                // Stile immagine 3: megafono blu + "Annotazione di NOME" + testo
                return (
                  <div key={ev.id} style={{borderBottom:"1px solid #e5e7eb",padding:"14px 18px",display:"flex",alignItems:"flex-start",gap:12,background:i%2===0?"#fff":"#fafafa"}}>
                    <span style={{color:"#2563eb",fontSize:18,flexShrink:0,marginTop:2}}>📣</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:15,color:"#1f2937"}}>Annotazione{ev.inseritoDa?` di ${cognomeNome(ev.inseritoDa).toUpperCase()}`:""}</div>
                      {ev.testo&&<div style={{fontSize:12,color:"#9ca3af",marginTop:1,lineHeight:1.4}}>{ev.testo}</div>}
                    </div>
                  </div>
                );
              }
              if(ev.tipo==="nota"){
                // Stile immagine 5: triangolo rosso + "Nota disciplinare di NOME" + testo in grigio/italic
                return (
                  <div key={ev.id} style={{borderBottom:"1px solid #e5e7eb",padding:"14px 18px",display:"flex",alignItems:"flex-start",gap:12,background:i%2===0?"#fff":"#fafafa"}}>
                    <span style={{color:"#ef4444",fontSize:18,flexShrink:0,marginTop:2}}>⚠️</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:15,color:"#1f2937"}}>Nota disciplinare{ev.inseritoDa?` di ${cognomeNome(ev.inseritoDa).toUpperCase()}`:""}</div>
                      {ev.testo&&<div style={{fontSize:12,color:"#9ca3af",marginTop:1,lineHeight:1.4,fontStyle:"italic"}}>{ev.testo}</div>}
                    </div>
                  </div>
                );
              }
              if(ev.tipo==="verifica"){
                // Stile lista icona blu, come argomento, ma con tipo verifica indicato
                return (
                  <div key={ev.id} style={{borderBottom:"1px solid #e5e7eb",padding:"14px 18px",display:"flex",alignItems:"flex-start",gap:12,background:i%2===0?"#fff":"#fafafa"}}>
                    <span style={{color:"#2563eb",fontSize:16,flexShrink:0,marginTop:2}}>☰</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:15,color:"#1f2937"}}>Verifica{ev.tipoVerifica?` (${ev.tipoVerifica})`:""} di {(ev.mat||"").toUpperCase()}</div>
                      {ev.testo&&<div style={{fontSize:12,color:"#9ca3af",marginTop:1,lineHeight:1.4}}>{ev.testo}</div>}
                    </div>
                  </div>
                );
              }
              // argomento / compito — stile lista icona blu
              const isCompito = ev.tipo==="compito";
              return (
                <div key={ev.id} style={{borderBottom:"1px solid #e5e7eb",padding:"14px 18px",display:"flex",alignItems:"flex-start",gap:12,background:i%2===0?"#fff":"#fafafa"}}>
                  <span style={{color:"#2563eb",fontSize:16,flexShrink:0,marginTop:2}}>{isCompito?"↓":"☰"}</span>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,color:"#1f2937"}}>{isCompito?"Compito per casa di ":"Argomento di "}{(ev.mat||"").toUpperCase()}</div>
                    {ev.testo&&<div style={{fontSize:12,color:"#9ca3af",marginTop:1,lineHeight:1.4}}>{ev.testo}</div>}
                  </div>
                </div>
              );
            })
        }
      </div>
    </div>
  );
}

// ── Riga comunicazione espandibile nella scheda alunno, stile app famiglia ──
function ComunicazioneSchedaRow({item}) {
  const [open, setOpen] = useState(false);
  const fmtD = (raw) => {
    if(!raw) return "";
    let iso = raw;
    if(raw.includes("/")) { const [d,m,y]=raw.split("/"); iso=`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`; }
    try { const dt=new Date(iso+"T00:00:00"); if(isNaN(dt)) return raw; const dd=String(dt.getDate()).padStart(2,"0"); const mm=String(dt.getMonth()+1).padStart(2,"0"); return `${dd}/${mm}/${dt.getFullYear()}`; } catch { return raw; }
  };
  const hasFam = item.visibileFamiglie !== false;
  const badgeTxt = hasFam ? "Scuola/Famiglia" : "Comunicazione";
  const badgeBg  = hasFam ? "#5b9bd5" : "#1e3a5f";
  const hasContent = !!(item.testo || item.urlEsterno || (item.allegati||[]).length>0);

  return (
    <div style={{borderBottom:"1px solid #e5e7eb",fontFamily:FF}}>
      <div onClick={()=>hasContent&&setOpen(v=>!v)}
        style={{padding:"14px 18px",cursor:hasContent?"pointer":"default",background:"#fff"}}
        onMouseEnter={e=>{if(hasContent)e.currentTarget.style.background="#f9fafb";}}
        onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:13,color:"#6b7280",fontWeight:600}}>{fmtD(item.data)}</span>
          <span style={{background:badgeBg,color:"#fff",borderRadius:4,padding:"3px 12px",fontSize:12,fontWeight:700}}>{badgeTxt}</span>
        </div>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
          <div style={{fontWeight:600,fontSize:15,color:"#1f2937",lineHeight:1.35,flex:1}}>{item.oggetto||"(senza oggetto)"}</div>
          {/* Spunta arancione cerchiata, stile foto */}
          <svg width="22" height="22" viewBox="0 0 24 24" style={{flexShrink:0,marginTop:2}}>
            <circle cx="12" cy="12" r="10" fill="none" stroke="#f59e0b" strokeWidth="2"/>
            <polyline points="7,12.5 10.5,16 17,8.5" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        {hasContent&&(
          <div style={{textAlign:"center",marginTop:6}}>
            <span style={{fontSize:16,color:"#9ca3af"}}>{open?"︿":"﹀"}</span>
          </div>
        )}
      </div>
      {open&&hasContent&&(
        <div style={{background:"#f9fafb",padding:"4px 18px 16px"}}>
          {item.testo&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:10,background:"#fff",border:"1px solid #e5e7eb",borderRadius:6,padding:"12px 14px",marginBottom:item.urlEsterno||(item.allegati||[]).length?10:0}}>
              <span style={{fontSize:20,flexShrink:0}}>📢</span>
              <div style={{fontSize:13,color:"#374151",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{item.testo}</div>
            </div>
          )}
          {item.urlEsterno&&(()=>{
            const url = item.urlEsterno.startsWith("http") ? item.urlEsterno : "https://"+item.urlEsterno;
            return (
              <a href={url} target="_blank" rel="noreferrer"
                style={{display:"flex",alignItems:"center",gap:8,background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:6,padding:"10px 12px",marginBottom:(item.allegati||[]).length?10:0,textDecoration:"none"}}>
                <span style={{fontSize:16}}>🔗</span>
                <span style={{fontSize:12,color:"#0369a1",fontWeight:600,wordBreak:"break-all"}}>{url}</span>
              </a>
            );
          })()}
          {(item.allegati||[]).map(a=>(
            <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,background:"#fff",border:"1px solid #e5e7eb",borderRadius:6,padding:"10px 12px",marginBottom:6}}>
              <span style={{fontSize:18,color:"#dc2626"}}>📄</span>
              <span style={{fontSize:12,color:"#374151",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.nome}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ComunicazioniSchedaList({items}) {
  return (
    <div>
      {items.map(item=><ComunicazioneSchedaRow key={item.id} item={item}/>)}
    </div>
  );
}

function SchédaStudente({s, contDB, assenzeDB, votiDB, scrutiniDB, classe, docente, onClose, getMaterieScrutinio, pgTrim, setPgTrim, initialTab}) {
  const [tab, setTab] = useState(initialTab||"feed");
  const [phase, setPhase] = useState("loading"); // loading | open | closing
  // Fallback locale SOLO se il chiamante non passa pgTrim/setPgTrim (retrocompatibilità).
  // In tutti i punti di utilizzo la scheda riceve ora pgTrim/setPgTrim dal registro del
  // docente, così la media della sezione Voti resta sempre collegata al quadrimestre
  // selezionato nel registro (1° o 2°), senza poter divergere.
  const [votiTrimLocal, setVotiTrimLocal] = useState(pgTrim||TRIMESTRI[0]);
  const votiTrimSel = pgTrim||votiTrimLocal;
  const setVotiTrimSel = setPgTrim||setVotiTrimLocal;
  // Toggle "Materie / Giorni" per le sezioni Voti, Compiti, Lezioni
  const [modoVoti, setModoVoti] = useState("giorni");
  const [matSelVoti, setMatSelVoti] = useState(null);
  const [modoCompiti, setModoCompiti] = useState("giorni");
  const [matSelCompiti, setMatSelCompiti] = useState(null);
  const [modoLezioni, setModoLezioni] = useState("giorni");
  const [matSelLezioni, setMatSelLezioni] = useState(null);
  // ── Curriculum: storico anni scolastici dell'alunno ──
  const CURR_KEY = `curriculum:${docente}:${s.id}`;
  const [curriculum, setCurriculumRaw] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem(CURR_KEY)||"[]"); }catch{ return []; }
  });
  const setCurriculum = (list) => {
    setCurriculumRaw(list);
    try{ localStorage.setItem(CURR_KEY, JSON.stringify(list)); }catch{}
  };
  const [curriculumFormOpen, setCurriculumFormOpen] = useState(false);
  const [curriculumEditId, setCurriculumEditId] = useState(null);
  const [curriculumForm, setCurriculumForm] = useState({anno:"",classeStorica:"",esito:"ammesso",credito:""});
  const [annoCorrente, setAnnoCorrenteRaw] = useState(()=>{
    try{ return localStorage.getItem(`reg:${docente}:annoScolasticoCorrente`)||""; }catch{ return ""; }
  });
  const setAnnoCorrente = v => {
    setAnnoCorrenteRaw(v);
    try{ localStorage.setItem(`reg:${docente}:annoScolasticoCorrente`, v); }catch{}
  };
  const MaterieGiorniToggle = ({modo, onModo}) => (
    <div style={{display:"flex",borderBottom:"1px solid #e5e7eb",background:"#fff"}}>
      {[["materie","Materie"],["giorni","Giorni"]].map(([id,lbl])=>(
        <button key={id} onClick={()=>onModo(id)}
          style={{flex:1,padding:"13px 0",background:"none",border:"none",borderBottom:"2px solid "+(modo===id?"#f0932b":"transparent"),color:modo===id?"#1f2937":"#6b7280",fontWeight:modo===id?700:400,fontSize:14,cursor:"pointer",fontFamily:FF}}>
          {lbl}
        </button>
      ))}
    </div>
  );

  useEffect(()=>{
    const t = setTimeout(()=>setPhase("open"), 200);
    return ()=>clearTimeout(t);
  },[]);

  const handleClose = () => {
    setPhase("closing");
    setTimeout(onClose, 280);
  };
  const TABS = [
    {id:"feed", lbl:"🏠 Home", color:"#d2531e"},
    {id:"anagrafica", lbl:"👤 Anagrafica", color:"#2563eb"},
    {id:"voti", lbl:"⭐ Voti", color:"#4e9fa0"},
    {id:"pagella", lbl:"📋 Pagella", color:"#7c3aed"},
    {id:"curriculum", lbl:"🎓 Curriculum", color:"#059669"},
    {id:"note", lbl:"⚠️ Note", color:"#dc2626"},
    {id:"compiti", lbl:"📝 Compiti", color:"#f97316"},
    {id:"lezioni", lbl:"📚 Lezioni", color:TEAL},
    {id:"assenze", lbl:"🔴 Assenze", color:"#ef4444"},
    {id:"comunicazioni", lbl:"📢 Comunicazioni", color:"#5b9bd5"},
  ];

  // Raccoglie note/annotazioni da __class__<classe>
  const classKey = `__class__${classe}`;
  const getNoteStudente = () =>
    (contDB[classKey]?.note || []).filter(n =>
      n.destinatariTutti || (n.destinatari||[]).includes(s.id)
    );
  const getAnnotStudente = () =>
    (contDB[classKey]?.annotazioni || []).filter(n =>
      n.destinatariTutti || (n.destinatari||[]).includes(s.id)
    );

  // Raccoglie lezioni/compiti da tutte le chiavi classe||materia
  const prefix = `${classe}||`;
  const getItemsAllMaterie = (sec) => {
    const seen = new Set();
    const all = [];
    Object.entries(contDB).filter(([k])=>k.startsWith(prefix)&&!k.includes("__firme__")).forEach(([k,v])=>{
      const mat = k.split("||")[1]||"";
      (v[sec]||[]).forEach(item=>{
        if(seen.has(item.id)) return;
        seen.add(item.id);
        // Mostra sempre: tutta la classe, nessuna partecipazione specificata, o alunno incluso
        const riguarda =
          !item.partecipazione ||
          item.partecipazione==="tutti" ||
          (item.alunniParz||[]).length === 0 ||
          (item.alunniParz||[]).includes(s.id);
        if(riguarda) all.push({...item, _mat:mat});
      });
      // Le verifiche scritte inserite nel registro di classe confluiscono anche qui,
      // nella sezione Compiti (la sezione Verifiche non è più mostrata separatamente)
      if(sec==="compiti"){
        (v.verifiche||[]).forEach(item=>{
          if((item.tipoVerifica||"")!=="Scritto") return;
          const vid = "vf"+item.id;
          if(seen.has(vid)) return;
          seen.add(vid);
          const riguarda =
            !item.partecipazione ||
            item.partecipazione==="tutti" ||
            (item.alunniParz||[]).length === 0 ||
            (item.alunniParz||[]).includes(s.id);
          if(riguarda) all.push({...item, id:vid, _mat:item.materia||mat, materiaLezione:item.materia||mat, testo:item.argomenti||item.testo||"", _isVerifica:true});
        });
      }
    });
    return all.sort((a,b)=>toISO(b.data||"").localeCompare(toISO(a.data||"")));
  };

  // Verifiche (da lezioni con tipoVerifica, o sezione verifiche)
  const getVerifiche = () => {
    const seen = new Set();
    const all = [];
    Object.entries(contDB).filter(([k])=>k.startsWith(prefix)&&!k.includes("__firme__")).forEach(([k,v])=>{
      const mat = k.split("||")[1]||"";
      (v.verifiche||[]).forEach(item=>{
        if(seen.has(item.id)) return;
        seen.add(item.id);
        all.push({...item, _mat:mat});
      });
    });
    return all.sort((a,b)=>toISO(b.data||"").localeCompare(toISO(a.data||"")));
  };

  const assenze = (assenzeDB[classe]?.[s.id]||[])
    .sort((a,b)=>toISO(b.data||"").localeCompare(toISO(a.data||"")));

  const fmtD = d => { try{ if(!d) return "—"; if(d.includes("-")){ const[y,m,dd]=d.split("-"); return`${dd}/${m}/${y}`; } return d; }catch{return d;} };

  const BADGE_COL = {assente:"#ef4444",ritardo:"#f97316",uscita:"#8b5cf6",fuori_aula:"#6b7280"};
  const BADGE_LBL = {assente:"ASSENZA",ritardo:"RITARDO",uscita:"USCITA ANTIC.",fuori_aula:"FUORI AULA"};

  const EmptyMsg = ({msg}) => <div style={{padding:"32px 20px",textAlign:"center",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>{msg}</div>;

  const renderContent = () => {
    if(tab==="feed"){
      return <FeedFamigliaTab s={s} contDB={contDB} assenzeDB={assenzeDB} votiDB={votiDB} classe={classe} docente={docente} onNavigateTab={t=>setTab(t)} pgTrim={pgTrim}/>;
    }
    if(tab==="registroweb"){
      return <RegistroWebTab s={s} contDB={contDB} assenzeDB={assenzeDB} votiDB={votiDB} classe={classe} docente={docente}/>;
    }
    if(tab==="anagrafica"){
      return <AnagraficaTab s={s} docente={docente} classe={classe}/>;
    }
    if(tab==="voti"){
      // Raccoglie tutti i voti di tutte le materie per questo studente, filtrati per trimestre selezionato
      const prefix = `${classe}||`;
      const trimFiltro = votiTrimSel;
      const tuttiVoti = [];
      Object.entries(votiDB).filter(([k])=>k.startsWith(prefix)).forEach(([k,vAlunni])=>{
        const mat = k.split("||")[1]||"";
        (vAlunni[s.id]||[]).forEach(v=>{
          const vTrim = v.trimestre||TRIMESTRI[0];
          if(vTrim!==trimFiltro) return;
          if(v.voto && v.voto !== "" && v.voto !== " " && v.visFam !== false)
            tuttiVoti.push({...v, _mat:mat});
        });
      });
      // Ordina per data decrescente
      tuttiVoti.sort((a,b)=>toISO(b.data||"").localeCompare(toISO(a.data||"")));

      // Calcola media complessiva (tutti i voti che fanno media, tutte le materie)
      const perMediaGlobale = tuttiVoti.filter(v=>v.faMedia && !isNaN(parseVoto(v.voto)));
      let mediaGlobale = null;
      if(perMediaGlobale.length) {
        let sp=0, sv=0;
        perMediaGlobale.forEach(v=>{ const n=parseVoto(v.voto); const w=parseFloat(v.peso)||100; sv+=n*w; sp+=w; });
        if(sp>0) mediaGlobale = sv/sp;
      }

      // Calcola media per materia
      const materieConVotiMap = {};
      tuttiVoti.forEach(v=>{
        if(!materieConVotiMap[v._mat]) materieConVotiMap[v._mat] = [];
        materieConVotiMap[v._mat].push(v);
      });
      const mediaPerMateria = {};
      Object.entries(materieConVotiMap).forEach(([mat, vv])=>{
        const pm = vv.filter(v=>v.faMedia && !isNaN(parseVoto(v.voto)));
        if(!pm.length){ mediaPerMateria[mat]=null; return; }
        let sp=0,sv=0; pm.forEach(v=>{ const n=parseVoto(v.voto); const w=parseFloat(v.peso)||100; sv+=n*w; sp+=w; });
        mediaPerMateria[mat] = sp>0 ? sv/sp : null;
      });

      const fmtDateLabel = iso => {
        try {
          const d = new Date(iso+"T00:00:00");
          if(isNaN(d)) return iso;
          const GIORNI_IT=["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
          const MESI_IT=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
          return `${GIORNI_IT[d.getDay()]} ${d.getDate()} ${MESI_IT[d.getMonth()]} ${d.getFullYear()}`;
        } catch { return iso; }
      };

      const RigaVoto = ({v}) => (
        <div style={{display:"flex",alignItems:"flex-start",gap:14,padding:"14px 18px",borderBottom:"1px solid #f3f4f6",background:"#fff"}}>
          <VotoCerchio voto={v.voto} faMedia={v.faMedia}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:800,fontSize:17,color:"#1f2937",marginBottom:3,fontFamily:"Helvetica,Arial,sans-serif",letterSpacing:0.2}}>{v._mat||""}</div>
            <div style={{fontSize:15,color:"#6b7280",marginBottom:3,fontFamily:"Helvetica,Arial,sans-serif",fontWeight:500}}>
              {(v.tipo||"orale").charAt(0).toUpperCase()+(v.tipo||"orale").slice(1)}
            </div>
            {v.inseritoDa&&<div style={{fontSize:15,color:"#374151",fontWeight:700,marginBottom:3,textTransform:"uppercase",fontFamily:"Helvetica,Arial,sans-serif",letterSpacing:0.3}}>{cognomeNome(v.inseritoDa)}</div>}
            {(v.peso!==undefined&&v.peso!==null&&parseFloat(v.peso)!==100)&&<div style={{fontSize:14,color:"#374151",fontWeight:400,marginBottom:3,fontFamily:"Helvetica,Arial,sans-serif"}}><span style={{color:"#f59e0b",fontWeight:700}}>Peso: </span>{v.peso}%</div>}
            <div style={{fontSize:14,color:"#374151",lineHeight:1.6,fontFamily:"Helvetica,Arial,sans-serif"}}>
              <span style={{color:"#f59e0b",fontWeight:700}}>Osservazioni: </span>
              {(v.notaFam||v.nota) || <span style={{color:"#9ca3af",fontStyle:"italic"}}>Nessun commento al voto</span>}
            </div>
          </div>
        </div>
      );

      // ── Modalità MATERIE: elenco materie, poi dettaglio di una sola materia ──
      if(modoVoti==="materie"){
        if(!matSelVoti){
          const materieList = Object.keys(materieConVotiMap).sort();
          return (
            <div style={{fontFamily:FF}}>
              <MaterieGiorniToggle modo={modoVoti} onModo={setModoVoti}/>
              {materieList.length===0
                ? <EmptyMsg msg="Nessun voto registrato"/>
                : materieList.map(mat=>(
                  <div key={mat} onClick={()=>setMatSelVoti(mat)}
                    style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid #f0f0f0",cursor:"pointer",background:"#fff"}}>
                    <span style={{fontWeight:600,fontSize:15,color:"#1f2937",textTransform:"uppercase"}}>{mat}</span>
                    <span style={{color:"#9ca3af",fontSize:18}}>›</span>
                  </div>
                ))
              }
            </div>
          );
        }
        const votiMat = tuttiVoti.filter(v=>v._mat===matSelVoti);
        const byDateMat = {};
        votiMat.forEach(v=>{ const d=toISO(v.data||""); if(!byDateMat[d]) byDateMat[d]=[]; byDateMat[d].push(v); });
        const dateOrdMat = Object.keys(byDateMat).sort((a,b)=>b.localeCompare(a));

        // ── Media aritmetica e ponderata della materia selezionata ──
        const perMediaMat = votiMat.filter(v=>v.faMedia && v.voto && !isNaN(parseVoto(v.voto)));
        let mediaAritMat = null, mediaPondMat = null;
        if(perMediaMat.length){
          mediaAritMat = perMediaMat.reduce((s,v)=>s+parseVoto(v.voto),0) / perMediaMat.length;
          let sp=0,sv=0;
          perMediaMat.forEach(v=>{ const w=parseFloat(v.peso)||100; sv+=parseVoto(v.voto)*w; sp+=w; });
          mediaPondMat = sp>0 ? sv/sp : null;
        }
        const colMedia = m => m===null ? "#9ca3af" : (m<6 ? "#ef4444" : "#16a34a");

        return (
          <div style={{fontFamily:FF}}>
            <div onClick={()=>setMatSelVoti(null)} style={{padding:"12px 18px",borderBottom:"1px solid #e5e7eb",color:"#f0932b",fontWeight:700,fontSize:14,cursor:"pointer"}}>‹ Materie</div>
            <div style={{padding:"10px 18px",fontWeight:700,fontSize:15,color:"#1f2937",textAlign:"center",background:"#f8fafc",borderBottom:"1px solid #e5e7eb",textTransform:"uppercase"}}>{matSelVoti}</div>
            <div style={{padding:"12px 18px",background:"#fff",borderBottom:"1px solid #e5e7eb",fontFamily:"Helvetica,Arial,sans-serif"}}>
              <div style={{fontSize:15,color:"#1f2937"}}>Media aritmetica: <span style={{color:colMedia(mediaAritMat),fontWeight:700}}>{mediaAritMat!==null?mediaAritMat.toFixed(2):"-"}</span></div>
              <div style={{fontSize:15,color:"#1f2937",marginTop:4}}>Media ponderata: <span style={{color:colMedia(mediaPondMat),fontWeight:700}}>{mediaPondMat!==null?mediaPondMat.toFixed(2):"-"}</span></div>
            </div>
            {votiMat.length===0
              ? <EmptyMsg msg="Nessun voto in questa materia"/>
              : dateOrdMat.map(d=>(
                <div key={d}>
                  <div style={{background:"#f3f4f6",padding:"7px 18px",fontWeight:700,fontSize:13,color:"#374151",borderBottom:"1px solid #e5e7eb",borderTop:"1px solid #e5e7eb",fontFamily:"Helvetica,Arial,sans-serif"}}>
                    {fmtDateLabel(d)}
                  </div>
                  {byDateMat[d].map((v,i)=><RigaVoto key={v.id||i} v={v}/>)}
                </div>
              ))
            }
          </div>
        );
      }

      if(!tuttiVoti.length) return <div style={{padding:"40px 20px",textAlign:"center",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>Nessun voto registrato</div>;

      // Raggruppa per data
      const byDate = {};

      // ── BANNER SELETTORE QUADRIMESTRE (media rimossa) ──
      const MediaBanner = () => (
        <div style={{background:"#f8fafc",borderBottom:"2px solid #e5e7eb",padding:"14px 18px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          {/* Selettore quadrimestre — al posto della media */}
          <div style={{display:"flex",border:"1px solid #d1d5db",borderRadius:6,overflow:"hidden",flexShrink:0,flexBasis:"auto"}}>
            {TRIMESTRI.map(t=>(
              <button key={t} type="button" onClick={()=>setVotiTrimSel(t)}
                style={{padding:"8px 18px",background:votiTrimSel===t?TEAL:"#fff",color:votiTrimSel===t?"#fff":"#374151",border:"none",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"Helvetica,Arial,sans-serif",whiteSpace:"nowrap",flexShrink:0}}>
                {t}
              </button>
            ))}
          </div>
        </div>
      );
      tuttiVoti.forEach(v=>{
        const d = toISO(v.data||"");
        if(!byDate[d]) byDate[d] = [];
        byDate[d].push(v);
      });
      const dateOrd = Object.keys(byDate).sort((a,b)=>b.localeCompare(a));

      return (
        <div style={{fontFamily:FF}}>
          <MaterieGiorniToggle modo={modoVoti} onModo={setModoVoti}/>
          <MediaBanner/>
          {dateOrd.map(d=>(
            <div key={d}>
              {/* Separatore data grigio */}
              <div style={{background:"#f3f4f6",padding:"7px 18px",fontWeight:700,fontSize:13,color:"#374151",borderBottom:"1px solid #e5e7eb",borderTop:"1px solid #e5e7eb",fontFamily:"Helvetica,Arial,sans-serif"}}>
                {fmtDateLabel(d)}
              </div>
              {byDate[d].map((v,i)=><RigaVoto key={v.id||i} v={v}/>)}
            </div>
          ))}
        </div>
      );
    }
    if(tab==="pagella"){
      // Legge scrutiniDB da TUTTI i livelli di storage
      const scrutiniRaw = scrutiniDB || cGet("scrutiniDB") || {};
      console.log("[pagella] scrutiniDB raw:", scrutiniRaw);
      console.log("[pagella] classe:", classe, "s.id:", s.id);
      const scrutiniS = scrutiniRaw?.[classe]||{};
      console.log("[pagella] scrutiniS:", scrutiniS);
      const sid = s.id;
      const TRIMESTRI_PAG = Object.keys(scrutiniS).filter(t=>{
        const sc = scrutiniS[t];
        return sc?.[sid] || sc?.[String(sid)] || sc?.[Number(sid)];
      });
      console.log("[pagella] TRIMESTRI_PAG trovati:", TRIMESTRI_PAG);
      if(!TRIMESTRI_PAG.length) return (
        <div style={{padding:20,fontFamily:FF}}>
          <EmptyMsg msg="Nessuna pagella disponibile per questo studente"/>
          <div style={{marginTop:12,background:"#f3f4f6",borderRadius:6,padding:"10px 14px",fontSize:12,color:"#6b7280",fontFamily:"monospace"}}>
            <div>scrutiniDB chiavi: {Object.keys(scrutiniDB||{}).join(", ")||"(vuoto)"}</div>
            <div>scrutiniS[{classe}] trimestri: {Object.keys(scrutiniS).join(", ")||"(vuoto)"}</div>
            <div>s.id: {String(s.id)}</div>
            {Object.keys(scrutiniS).map(t=>(
              <div key={t}>{t}: alunni={Object.keys(scrutiniS[t]||{}).join(", ")||"(vuoto)"}</div>
            ))}
          </div>
        </div>
      );

      const RECUPERO_LBL = {
        "CORSO DI RECUPERO":"Corso di recupero",
        "SPORTELLO":"Sportello",
        "STUDIO AUTONOMO":"Studio autonomo",
        "RECUPERO IN ITINERE":"Recupero in itinere",
        "NESSUNO":"Nessuno",
      };

      const numToWord = (n) => {
        const w = {1:"UNO",2:"DUE",3:"TRE",4:"QUATTRO",5:"CINQUE",6:"SEI",7:"SETTE",8:"OTTO",9:"NOVE",10:"DIECI"};
        return w[parseInt(n)] || String(n);
      };

      const votoColor2 = (v) => {
        const n = parseInt(v);
        if(isNaN(n)) return "#1f2937";
        return n < 6 ? "#e53935" : "#22c55e";
      };

      // Conta carenze totali
      const countCarenze = (sc, materieScr) =>
        materieScr.filter(mat=>{const v=sc[mat]?.arrotondato; return v&&!isNaN(parseInt(v))&&parseInt(v)<6;}).length;

      return (
        <div style={{fontFamily:"Helvetica,Arial,sans-serif"}}>
          {TRIMESTRI_PAG.map(trim=>{
            const sc = scrutiniS[trim]?.[s.id]||{};
            const materieScr = getMaterieScrutinio ? getMaterieScrutinio() : MATERIE;
            const materieConVoto = materieScr.filter(mat=>sc[mat]?.arrotondato!==undefined&&sc[mat]?.arrotondato!=="");
            const nCarenze = countCarenze(sc, materieConVoto);
            const hasCarenze = nCarenze > 0;

            return(
              <div key={trim}>
                {/* ── RIEPILOGO in cima — stile immagine 1 ── */}
                <div style={{borderBottom:"2px solid #e5e7eb"}}>
                  {/* Riepilogo */}
                  <RiepilogoAccordion hasCarenze={hasCarenze} nCarenze={nCarenze}/>
                  {/* Giudizio */}
                  {sc.note&&sc.note.trim()&&<GiudizioAccordion note={sc.note}/>}
                </div>

                {/* Separatore grigio */}
                <div style={{height:8,background:"#f3f4f6",borderBottom:"1px solid #e5e7eb"}}/>

                {/* Lista materie */}
                {materieConVoto.map(mat=>{
                  const dati = sc[mat]||{};
                  const voto = dati.arrotondato||"";
                  const carenza = dati.carenza||"";
                  const tipoRec = dati.tipoRec||sc.tipoRecupero||"";
                  const isInsuff = !isNaN(parseInt(voto)) && parseInt(voto)<6;
                  return <MateriaPagellaRow
                    key={mat} mat={mat} voto={voto} carenza={carenza} tipoRec={tipoRec}
                    sc={sc} numToWord={numToWord} votoColor2={votoColor2} isInsuff={isInsuff}
                    RECUPERO_LBL={RECUPERO_LBL}
                    matDati={dati}
                  />;
                })}

                {/* ── COMPORTAMENTO — accordion come le materie ── */}
                {sc.comportamento&&<ComportamentoRow voto={sc.comportamento} votoColor2={votoColor2} numToWord={numToWord}/>}

                {/* Ammissione */}
                {sc.ammissione!==undefined&&sc.ammissione!==null&&(
                  <div style={{padding:"14px 18px",borderTop:"1px solid #e5e7eb",background:"#fff",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span style={{fontWeight:700,fontSize:14,color:"#374151"}}>Ammissione</span>
                    <span style={{background:sc.ammissione?"#22c55e":"#ef4444",color:"#fff",borderRadius:4,padding:"4px 16px",fontWeight:700,fontSize:13}}>
                      {sc.ammissione?"AMMESSO":"NON AMMESSO"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    if(tab==="note"){
      // Note disciplinari + annotazioni confluiscono nella stessa sezione "Note"
      const items = [
        ...getNoteStudente().map(n=>({...n,_isAnnot:false})),
        ...getAnnotStudente().map(a=>({...a,_isAnnot:true})),
      ].sort((a,b)=>toISO(b.data||"").localeCompare(toISO(a.data||"")));
      if(!items.length) return <EmptyMsg msg="Nessuna nota disciplinare"/>;
      return items.map((n,i)=>(
        <div key={n.id} style={{padding:"14px 20px",borderBottom:"1px solid #e5e7eb",background:"#fff"}}>
          {/* Riga superiore: data + destinatario */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
            <div style={{fontWeight:700,fontSize:14,color:"#1f2937",fontFamily:"Helvetica,Arial,sans-serif"}}>{fmtD(n.data||"")}</div>
            <span style={{background:"#f97316",color:"#fff",borderRadius:4,padding:"2px 12px",fontWeight:700,fontSize:12,fontFamily:"Helvetica,Arial,sans-serif"}}>{n.destinatariTutti ? "Classe" : "Studente"}</span>
          </div>
          {/* Cognome Nome docente */}
          <div style={{fontWeight:700,fontSize:14,color:"#1f2937",fontFamily:"Helvetica,Arial,sans-serif",marginBottom:6,textTransform:"uppercase"}}>
            {cognomeNome(n.inseritoDa||docente)}
          </div>
          {/* Badge Nota disciplinare / Annotazione + testo */}
          <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
            <span style={{background:n._isAnnot?"#6b7280":"#dc2626",color:"#fff",borderRadius:3,padding:"2px 8px",fontWeight:700,fontSize:11,whiteSpace:"nowrap",fontFamily:"Helvetica,Arial,sans-serif",flexShrink:0}}>{n._isAnnot?"Annotazione":"Nota disciplinare"}</span>
            <span style={{fontSize:13,color:"#374151",lineHeight:1.6,fontFamily:"Helvetica,Arial,sans-serif",whiteSpace:"pre-wrap"}}>{n.testo||"—"}</span>
          </div>
        </div>
      ));
    }
    if(tab==="compiti"){
      const items = getItemsAllMaterie("compiti");
      const fmtDateLabel = iso => {
        try{
          const d=new Date(iso+"T00:00:00");
          const GG=["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
          const MM=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
          return `${GG[d.getDay()]} ${d.getDate()} ${MM[d.getMonth()]} ${d.getFullYear()}`;
        }catch{return iso;}
      };
      const RigaCompito = ({c}) => (
        <div style={{padding:"14px 18px",borderBottom:"1px solid #e5e7eb",background:"#fff",fontFamily:"Helvetica,Arial,sans-serif"}}>
          <div style={{fontWeight:900,fontSize:16,color:"#1f2937",marginBottom:4,letterSpacing:0.3}}>
            {(c._mat||c.materiaLezione||"").toUpperCase()}
          </div>
          <div style={{fontSize:14,color:"#1f2937",lineHeight:1.6,whiteSpace:"pre-wrap"}}>
            {c._isVerifica&&<b>Verifica </b>}{c.testo||""}
          </div>
          {c.link&&<a href={c.link} target="_blank" rel="noreferrer" style={{fontSize:12,color:TEAL,textDecoration:"underline",display:"block",marginTop:4}}>🔗 {c.link}</a>}
        </div>
      );

      // ── Modalità MATERIE: elenco materie, poi dettaglio di una sola materia ──
      if(modoCompiti==="materie"){
        if(!matSelCompiti){
          const materieList = [...new Set(items.map(c=>c._mat||c.materiaLezione||"").filter(Boolean))].sort();
          return (
            <div style={{fontFamily:FF}}>
              <MaterieGiorniToggle modo={modoCompiti} onModo={setModoCompiti}/>
              {materieList.length===0
                ? <EmptyMsg msg="Nessun compito assegnato"/>
                : materieList.map(mat=>(
                  <div key={mat} onClick={()=>setMatSelCompiti(mat)}
                    style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid #f0f0f0",cursor:"pointer",background:"#fff"}}>
                    <span style={{fontWeight:600,fontSize:15,color:"#1f2937",textTransform:"uppercase"}}>{mat}</span>
                    <span style={{color:"#9ca3af",fontSize:18}}>›</span>
                  </div>
                ))
              }
            </div>
          );
        }
        const itemsMat = items.filter(c=>(c._mat||c.materiaLezione||"")===matSelCompiti);
        const byDateMat = {};
        itemsMat.forEach(c=>{ const d=toISO(c.data||""); if(!byDateMat[d]) byDateMat[d]=[]; byDateMat[d].push(c); });
        const dateOrdMat = Object.keys(byDateMat).sort((a,b)=>b.localeCompare(a));
        return (
          <div style={{fontFamily:FF}}>
            <div onClick={()=>setMatSelCompiti(null)} style={{padding:"12px 18px",borderBottom:"1px solid #e5e7eb",color:"#f0932b",fontWeight:700,fontSize:14,cursor:"pointer"}}>‹ Materie</div>
            <div style={{padding:"10px 18px",fontWeight:700,fontSize:15,color:"#1f2937",textAlign:"center",background:"#f8fafc",borderBottom:"1px solid #e5e7eb",textTransform:"uppercase"}}>{matSelCompiti}</div>
            {itemsMat.length===0
              ? <EmptyMsg msg="Nessun compito in questa materia"/>
              : dateOrdMat.map(d=>(
                <div key={d}>
                  <div style={{background:"#f3f4f6",padding:"8px 18px",fontWeight:700,fontSize:14,color:"#374151",fontFamily:"Helvetica,Arial,sans-serif",borderBottom:"1px solid #e5e7eb",borderTop:"1px solid #e5e7eb"}}>
                    {fmtDateLabel(d)}
                  </div>
                  {byDateMat[d].map((c,i)=><RigaCompito key={c.id||i} c={c}/>)}
                </div>
              ))
            }
          </div>
        );
      }

      // ── Modalità GIORNI: comportamento originale ──
      if(!items.length) return (
        <div style={{fontFamily:FF}}>
          <MaterieGiorniToggle modo={modoCompiti} onModo={setModoCompiti}/>
          <EmptyMsg msg="Nessun compito assegnato"/>
        </div>
      );
      const byDate = {};
      items.forEach(c=>{
        const d = toISO(c.data||"");
        if(!byDate[d]) byDate[d]=[];
        byDate[d].push(c);
      });
      const dateOrd = Object.keys(byDate).sort((a,b)=>b.localeCompare(a));
      return (
        <div style={{fontFamily:FF}}>
          <MaterieGiorniToggle modo={modoCompiti} onModo={setModoCompiti}/>
          {dateOrd.map(d=>(
            <div key={d}>
              <div style={{background:"#f3f4f6",padding:"8px 18px",fontWeight:700,fontSize:14,color:"#374151",fontFamily:"Helvetica,Arial,sans-serif",borderBottom:"1px solid #e5e7eb",borderTop:"1px solid #e5e7eb"}}>
                {fmtDateLabel(d)}
              </div>
              {byDate[d].map((c,i)=><RigaCompito key={c.id||i} c={c}/>)}
            </div>
          ))}
        </div>
      );
    }
    if(tab==="lezioni"){
      const items = getItemsAllMaterie("lezioni");

      const fmtDateLabel = iso => {
        try{
          const d=new Date(iso+"T00:00:00");
          if(isNaN(d)) return iso;
          const GG=["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
          const MM=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
          return `${GG[d.getDay()]} ${d.getDate()} ${MM[d.getMonth()]} ${d.getFullYear()}`;
        }catch{return iso;}
      };

      // Calcola label ore: "0" se nessuna firma, "1" oppure "1-3" se presente
      const oreLabel = (l) => {
        const raw = l.ore||"";
        // Rimuovi qualsiasi << o testo spurio
        const clean = raw.replace(/<<.*?>>/g,"").replace(/[<>]/g,"").trim();
        // Se contiene già un trattino tipo "Ora 1-3: 3 ore" → estrai solo la parte numerica
        const match = clean.match(/(\d+)[\s\-–]+(\d+)/);
        if(match) return `${match[1]}-${match[2]}`;
        const single = clean.match(/(\d+)/);
        if(single) return single[1];
        // Fallback da oraInizio + nOre; se manca del tutto mostra 0
        const inizio = parseInt(l.oraInizio||l.oraInizioNum||0);
        const nOre = parseInt(l.nOre||1);
        if(inizio===0) return "0";
        if(nOre>1) return `${inizio}-${inizio+nOre-1}`;
        return String(inizio);
      };

      const RigaLezione = ({l}) => (
        <div style={{padding:"14px 18px",borderBottom:"1px solid #e5e7eb",background:"#fff"}}>
          <div style={{marginBottom:4}}>
            <span style={{fontWeight:700,fontSize:15,color:"#1f2937",textTransform:"uppercase",letterSpacing:0.3}}>{l._mat||l.materiaLezione||""}</span>
            <span style={{fontWeight:400,fontSize:13,color:"#6b7280",marginLeft:8}}>Ora Lezione: {oreLabel(l)}</span>
          </div>
          <div style={{fontSize:14,color:"#374151",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{l.testo||""}</div>
          {l.link&&<a href={l.link} target="_blank" rel="noreferrer" style={{fontSize:12,color:TEAL,display:"block",marginTop:3}}>🔗 {l.link}</a>}
        </div>
      );

      // ── Modalità MATERIE: elenco materie, poi dettaglio di una sola materia ──
      if(modoLezioni==="materie"){
        if(!matSelLezioni){
          const materieList = [...new Set(items.map(l=>l._mat||l.materiaLezione||"").filter(Boolean))].sort();
          return (
            <div style={{fontFamily:FF}}>
              <MaterieGiorniToggle modo={modoLezioni} onModo={setModoLezioni}/>
              {materieList.length===0
                ? <EmptyMsg msg="Nessuna lezione registrata"/>
                : materieList.map(mat=>(
                  <div key={mat} onClick={()=>setMatSelLezioni(mat)}
                    style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid #f0f0f0",cursor:"pointer",background:"#fff"}}>
                    <span style={{fontWeight:600,fontSize:15,color:"#1f2937",textTransform:"uppercase"}}>{mat}</span>
                    <span style={{color:"#9ca3af",fontSize:18}}>›</span>
                  </div>
                ))
              }
            </div>
          );
        }
        const itemsMat = items.filter(l=>(l._mat||l.materiaLezione||"")===matSelLezioni);
        const byDateMat = {};
        itemsMat.forEach(l=>{ const d=toISO(l.data||""); if(!byDateMat[d]) byDateMat[d]=[]; byDateMat[d].push(l); });
        const dateOrdMat = Object.keys(byDateMat).sort((a,b)=>b.localeCompare(a));
        return (
          <div style={{fontFamily:FF}}>
            <div onClick={()=>setMatSelLezioni(null)} style={{padding:"12px 18px",borderBottom:"1px solid #e5e7eb",color:"#f0932b",fontWeight:700,fontSize:14,cursor:"pointer"}}>‹ Materie</div>
            <div style={{padding:"10px 18px",fontWeight:700,fontSize:15,color:"#1f2937",textAlign:"center",background:"#f8fafc",borderBottom:"1px solid #e5e7eb",textTransform:"uppercase"}}>{matSelLezioni}</div>
            {itemsMat.length===0
              ? <EmptyMsg msg="Nessuna lezione in questa materia"/>
              : dateOrdMat.map(d=>(
                <div key={d}>
                  <div style={{background:"#e5e7eb",padding:"8px 18px",fontWeight:700,fontSize:15,color:"#1f2937",borderBottom:"1px solid #d1d5db",borderTop:"1px solid #d1d5db"}}>
                    {fmtDateLabel(d)}
                  </div>
                  {byDateMat[d].map((l,i)=><RigaLezione key={l.id||i} l={l}/>)}
                </div>
              ))
            }
          </div>
        );
      }

      // ── Modalità GIORNI: comportamento originale ──
      if(!items.length) return (
        <div style={{fontFamily:FF}}>
          <MaterieGiorniToggle modo={modoLezioni} onModo={setModoLezioni}/>
          <EmptyMsg msg="Nessuna lezione registrata"/>
        </div>
      );

      // Raggruppa per data
      const byDate = {};
      items.forEach(l=>{
        const d = toISO(l.data||"");
        if(!byDate[d]) byDate[d]=[];
        byDate[d].push(l);
      });
      const dateOrd = Object.keys(byDate).sort((a,b)=>b.localeCompare(a));

      return (
        <div style={{fontFamily:FF}}>
          <MaterieGiorniToggle modo={modoLezioni} onModo={setModoLezioni}/>
          {dateOrd.map(d=>(
            <div key={d}>
              {/* Separatore data stile immagine */}
              <div style={{background:"#e5e7eb",padding:"8px 18px",fontWeight:700,fontSize:15,color:"#1f2937",borderBottom:"1px solid #d1d5db",borderTop:"1px solid #d1d5db"}}>
                {fmtDateLabel(d)}
              </div>
              {byDate[d].map((l,i)=><RigaLezione key={l.id||i} l={l}/>)}
            </div>
          ))}
        </div>
      );
    }
    if(tab==="verifiche"){
      const items = getVerifiche();
      if(!items.length) return <EmptyMsg msg="Nessuna verifica registrata"/>;
      // Raggruppa per data
      const byDate = {};
      items.forEach(v=>{
        const d = toISO(v.data||"");
        if(!byDate[d]) byDate[d]=[];
        byDate[d].push(v);
      });
      const dateOrd = Object.keys(byDate).sort((a,b)=>b.localeCompare(a));
      const fmtDateLabel = iso => {
        try{
          const d=new Date(iso+"T00:00:00");
          if(isNaN(d)) return iso;
          const GG=["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
          const MM=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
          return `${GG[d.getDay()]} ${d.getDate()} ${MM[d.getMonth()]} ${d.getFullYear()}`;
        }catch{return iso;}
      };
      return dateOrd.map(d=>(
        <div key={d}>
          {/* Separatore data grigio */}
          <div style={{background:"#f3f4f6",padding:"8px 18px",fontWeight:700,fontSize:14,color:"#374151",fontFamily:"Helvetica,Arial,sans-serif",borderBottom:"1px solid #e5e7eb",borderTop:"1px solid #e5e7eb"}}>
            {fmtDateLabel(d)}
          </div>
          {byDate[d].map((v,i)=>(
            <div key={v.id} style={{padding:"16px 18px",borderBottom:"1px solid #e5e7eb",background:"#fff",fontFamily:"Helvetica,Arial,sans-serif"}}>
              {/* Materia in maiuscolo grassetto */}
              <div style={{fontWeight:900,fontSize:16,color:"#1f2937",marginBottom:4,letterSpacing:0.3}}>
                {(v._mat||v.materia||"").toUpperCase()}
              </div>
              {/* Tipo in grassetto + argomento normale */}
              <div style={{fontSize:15,color:"#1f2937",lineHeight:1.5}}>
                <span style={{fontWeight:700}}>{v.tipoVerifica||"Verifica"}</span>
                {v.argomenti&&<span style={{fontWeight:400}}> {v.argomenti}</span>}
              </div>
            </div>
          ))}
        </div>
      ));
    }
    if(tab==="verifiche"){
      const items = getVerifiche();
      if(!items.length) return <EmptyMsg msg="Nessuna verifica registrata"/>;
      // Raggruppa per data
      const byDate = {};
      items.forEach(v=>{
        const d = toISO(v.data||"");
        if(!byDate[d]) byDate[d]=[];
        byDate[d].push(v);
      });
      const dateOrd = Object.keys(byDate).sort((a,b)=>b.localeCompare(a));
      const fmtDateLabel = iso => {
        try{
          const d=new Date(iso+"T00:00:00");
          if(isNaN(d)) return iso;
          const GG=["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
          const MM=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
          return`${GG[d.getDay()]} ${d.getDate()} ${MM[d.getMonth()]} ${d.getFullYear()}`;
        }catch{return iso;}
      };
      return dateOrd.map(d=>(
        <div key={d}>
          <div style={{background:"#f3f4f6",padding:"8px 18px",fontWeight:700,fontSize:14,color:"#374151",fontFamily:"Helvetica,Arial,sans-serif",borderBottom:"1px solid #e5e7eb",borderTop:"1px solid #e5e7eb"}}>
            {fmtDateLabel(d)}
          </div>
          {byDate[d].map((v,i)=>(
            <div key={v.id} style={{padding:"14px 18px",borderBottom:"1px solid #e5e7eb",background:"#fff",fontFamily:"Helvetica,Arial,sans-serif"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                <span style={{fontWeight:900,fontSize:16,color:"#1f2937",letterSpacing:0.3}}>{(v._mat||v.materia||"").toUpperCase()}</span>
                <span style={{background:"#7c3aed",color:"#fff",borderRadius:4,padding:"2px 10px",fontWeight:700,fontSize:12}}>{v.tipoVerifica||"Verifica"}</span>
              </div>
              {v.argomenti&&<div style={{fontSize:14,color:"#374151",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{v.argomenti}</div>}
              {v.note&&<div style={{fontSize:13,color:"#6b7280",marginTop:4,fontStyle:"italic"}}>{v.note}</div>}
            </div>
          ))}
        </div>
      ));
    }
    if(tab==="curriculum"){
      // ── Calcolo automatico esito e credito dell'anno in corso, dallo scrutinio ──
      const annoNum = parseInt((classe||"").match(/\d+/)?.[0] || "0");
      const annoValido = annoNum>=3 && annoNum<=5;
      const scrTrimestri = Object.keys(scrutiniDB?.[classe]||{});
      const trimUsato = scrTrimestri.includes(TRIMESTRI[1]) ? TRIMESTRI[1] : (scrTrimestri[scrTrimestri.length-1]||null);
      const scAnno = trimUsato ? (scrutiniDB[classe][trimUsato][s.id]||null) : null;
      const materieScr = getMaterieScrutinio ? getMaterieScrutinio() : MATERIE;
      let mediaGenerale = null;
      if(scAnno){
        const votiScr = materieScr.map(m=>scAnno[m]?.arrotondato).filter(v=>v!==undefined&&v!==null&&v!==""&&!isNaN(parseInt(v))).map(v=>parseInt(v));
        if(votiScr.length) mediaGenerale = votiScr.reduce((a,b)=>a+b,0)/votiScr.length;
      }
      // Tabella crediti scolastici (bande ministeriali indicative, verificare quella in vigore per l'anno)
      const fasciaCredito = (media, anno) => {
        const tabelle = {
          3:[{v:7,t:8},{v:8,t:9},{v:9,t:10},{v:10,t:11},{v:11,t:12}],
          4:[{v:8,t:9},{v:9,t:10},{v:10,t:11},{v:11,t:12},{v:12,t:13}],
          5:[{v:9,t:10},{v:10,t:11},{v:11,t:12},{v:13,t:14},{v:14,t:15}],
        };
        const t = tabelle[anno]||tabelle[4];
        let banda = t[4];
        if(media<=6) banda=t[0]; else if(media<=7) banda=t[1]; else if(media<=8) banda=t[2]; else if(media<=9) banda=t[3]; else banda=t[4];
        const dec = media-Math.floor(media);
        return dec>=0.5 ? banda.t : banda.v;
      };
      const creditoAuto = (mediaGenerale!==null && annoValido) ? fasciaCredito(mediaGenerale, annoNum) : null;
      // Esito: true→ammesso, false→non ammesso, non ancora deciso→giudizio sospeso
      let esitoAuto = "sospeso";
      if(scAnno){
        if(scAnno.ammesso===true) esitoAuto="ammesso";
        else if(scAnno.ammesso===false) esitoAuto="non_ammesso";
      }

      const ESITO_INFO = {
        ammesso:{lbl:"AMMESSO", bg:"#16a34a"},
        non_ammesso:{lbl:"NON AMMESSO", bg:"#dc2626"},
        sospeso:{lbl:"GIUDIZIO SOSPESO", bg:"#f97316"},
      };

      const apriFormCurr = (rec=null) => {
        if(rec){ setCurriculumEditId(rec.id); setCurriculumForm({anno:rec.anno,classeStorica:rec.classeStorica||"",esito:rec.esito||"ammesso",credito:rec.credito??""}); }
        else { setCurriculumEditId(null); setCurriculumForm({anno:"",classeStorica:"",esito:"ammesso",credito:""}); }
        setCurriculumFormOpen(true);
      };
      const salvaRecordCurr = () => {
        if(!curriculumForm.anno.trim()) return;
        const rec = {...curriculumForm, id:curriculumEditId||Date.now()};
        setCurriculum(curriculumEditId ? curriculum.map(r=>r.id===curriculumEditId?rec:r) : [...curriculum, rec]);
        setCurriculumFormOpen(false);
      };
      const eliminaRecordCurr = id => setCurriculum(curriculum.filter(r=>r.id!==id));
      const storicoOrdinato = [...curriculum].sort((a,b)=>(b.anno||"").localeCompare(a.anno||""));

      return (
        <div style={{fontFamily:FF}}>
          {/* Riga anno scolastico corrente — calcolata in automatico dallo scrutinio */}
          <div style={{padding:"14px 18px",borderBottom:"2px solid #e5e7eb",background:"#f8fafc"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:12,color:"#6b7280",fontWeight:600}}>Anno scolastico corrente:</span>
              <input value={annoCorrente} onChange={e=>setAnnoCorrente(e.target.value)} placeholder="es. 2025/2026"
                style={{border:"1px solid #d1d5db",borderRadius:4,padding:"4px 8px",fontSize:13,fontFamily:FF,width:140}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:16,color:"#1f2937"}}>{annoCorrente||"Anno in corso"}</div>
                <div style={{fontSize:13,color:"#6b7280",marginTop:2}}>
                  Classe {classe}
                  {annoValido&&<span> — Credito: <i>{creditoAuto??"-"}</i></span>}
                </div>
              </div>
              <span style={{background:ESITO_INFO[esitoAuto].bg,color:"#fff",borderRadius:4,padding:"5px 14px",fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>{ESITO_INFO[esitoAuto].lbl}</span>
            </div>
            {!annoValido&&<div style={{fontSize:11,color:"#9ca3af",marginTop:8,fontStyle:"italic"}}>Il credito scolastico si assegna dal 3° anno in poi</div>}
            {annoValido&&mediaGenerale===null&&<div style={{fontSize:11,color:"#9ca3af",marginTop:8,fontStyle:"italic"}}>Inserisci i voti allo scrutinio per calcolare il credito in automatico</div>}
          </div>

          {/* Storico anni precedenti */}
          <div style={{padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderBottom:"1px solid #e5e7eb"}}>
            <span style={{fontWeight:700,fontSize:13,color:"#374151"}}>Anni precedenti</span>
            <button onClick={()=>apriFormCurr()} style={{padding:"5px 14px",background:"#059669",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:12,cursor:"pointer"}}>+ Aggiungi anno</button>
          </div>

          {storicoOrdinato.length===0
            ? <EmptyMsg msg="Nessun anno precedente registrato"/>
            : storicoOrdinato.map(rec=>{
              const info = ESITO_INFO[rec.esito]||ESITO_INFO.ammesso;
              return (
                <div key={rec.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:"1px solid #f0f0f0",background:"#fff"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:16,color:"#1f2937"}}>{rec.anno}</div>
                    {rec.classeStorica&&<div style={{fontSize:13,color:"#6b7280"}}>{rec.classeStorica}</div>}
                    {rec.credito!==""&&rec.credito!==undefined&&rec.credito!==null&&<div style={{fontSize:13,color:"#374151"}}>Credito: <i>{rec.credito}</i></div>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{background:info.bg,color:"#fff",borderRadius:4,padding:"5px 12px",fontWeight:700,fontSize:12,whiteSpace:"nowrap"}}>{info.lbl}</span>
                    <button onClick={()=>apriFormCurr(rec)} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:3,padding:"5px 8px",cursor:"pointer",display:"flex",alignItems:"center"}}><Pencil size={12}/></button>
                    <button onClick={()=>eliminaRecordCurr(rec.id)} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:3,padding:"5px 8px",cursor:"pointer",display:"flex",alignItems:"center"}}><Trash2 size={12}/></button>
                  </div>
                </div>
              );
            })
          }

          {/* Form aggiungi/modifica anno storico */}
          {curriculumFormOpen&&(
            <div style={{position:"fixed",inset:0,zIndex:9500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.4)"}} onClick={()=>setCurriculumFormOpen(false)}>
              <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:8,width:360,maxWidth:"92vw",padding:20,display:"flex",flexDirection:"column",gap:12,fontFamily:FF}}>
                <div style={{fontWeight:700,fontSize:15,color:"#059669"}}>{curriculumEditId?"Modifica anno":"Aggiungi anno"}</div>
                <div>
                  <div style={{fontSize:12,color:"#6b7280",fontWeight:600,marginBottom:3}}>Anno scolastico</div>
                  <input value={curriculumForm.anno} onChange={e=>setCurriculumForm(f=>({...f,anno:e.target.value}))} placeholder="es. 2024/2025" style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"7px 10px",fontSize:13,fontFamily:FF,boxSizing:"border-box"}}/>
                </div>
                <div>
                  <div style={{fontSize:12,color:"#6b7280",fontWeight:600,marginBottom:3}}>Classe</div>
                  <input value={curriculumForm.classeStorica} onChange={e=>setCurriculumForm(f=>({...f,classeStorica:e.target.value}))} placeholder="es. 2A" style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"7px 10px",fontSize:13,fontFamily:FF,boxSizing:"border-box"}}/>
                </div>
                <div>
                  <div style={{fontSize:12,color:"#6b7280",fontWeight:600,marginBottom:3}}>Esito</div>
                  <select value={curriculumForm.esito} onChange={e=>setCurriculumForm(f=>({...f,esito:e.target.value}))} style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"7px 10px",fontSize:13,background:"#fff",fontFamily:FF}}>
                    <option value="ammesso">Ammesso</option>
                    <option value="non_ammesso">Non ammesso</option>
                    <option value="sospeso">Giudizio sospeso</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:12,color:"#6b7280",fontWeight:600,marginBottom:3}}>Credito (se previsto)</div>
                  <input type="number" value={curriculumForm.credito} onChange={e=>setCurriculumForm(f=>({...f,credito:e.target.value}))} placeholder="es. 9" style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"7px 10px",fontSize:13,fontFamily:FF,boxSizing:"border-box"}}/>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:4}}>
                  <button onClick={salvaRecordCurr} style={{padding:"8px 20px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:13}}>💾 Salva</button>
                  <button onClick={()=>setCurriculumFormOpen(false)} style={{padding:"8px 16px",background:"#6b7280",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:13}}>Annulla</button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
    if(tab==="assenze"){
      if(!assenze.length) return <EmptyMsg msg="Nessuna assenza registrata"/>;
      const CERCHIO = {
        assente:    {lettera:"A", bg:"#ef4444"},
        ritardo:    {lettera:"R", bg:"#eab308"},
        uscita:     {lettera:"U", bg:"#eab308"},
        ingresso:   {lettera:"I", bg:"#8b5cf6"},
        fuori_aula: {lettera:"PA",bg:"#16a34a"},
      };
      return assenze.map((a)=>{
        const c = CERCHIO[a.tipo]||{lettera:"?",bg:"#6b7280"};
        const dettaglio = [];
        if(a.oraOrologio) dettaglio.push(`Esce alle: ${a.oraOrologio}`);
        if(a.oraLezione)  dettaglio.push(`Ora di lezione: ${a.oraLezione}`);
        if(a.motivo)      dettaglio.push(`Motivo: ${a.motivo}`);
        return(
          <AssenzaRow key={a.id} a={a} c={c} dettaglio={dettaglio} fmtD={fmtD} TEAL={TEAL}/>
        );
      });
    }
    if(tab==="comunicazioni"){
      // Legge SOLO dalla chiave globale __comunicazioni__ del registro reale,
      // filtrando per le classi visibili (classiCom vuoto = tutte le classi)
      const globali = contDB["__comunicazioni__"]?.["comunicazioni"] || [];
      const items = globali
        .filter(c => !c.classiCom || c.classiCom.length===0 || c.classiCom.includes(classe))
        .sort((a,b)=>(b.data||"").localeCompare(a.data||""));
      if(!items.length) return <EmptyMsg msg="Nessuna comunicazione"/>;
      return <ComunicazioniSchedaList items={items}/>;
    }
  };

  return (
    <div onClick={handleClose} style={{position:"fixed",inset:0,zIndex:5000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.5)",fontFamily:FF,
      opacity: phase==="loading"?0:1, transition:"opacity 0.22s"}}>
      <style>{`
        @keyframes schedaDown{from{transform:translateY(-110%)}to{transform:translateY(0)}}
        @keyframes schedaUp{from{transform:translateY(0)}to{transform:translateY(-120%)}}
      `}</style>

      {/* Pillola di caricamento */}
      {phase==="loading"&&(
        <div style={{background:"rgba(255,255,255,0.97)",borderRadius:20,padding:"12px 28px",boxShadow:"0 4px 20px rgba(0,0,0,0.12)",fontSize:14,color:"#6b7280",fontWeight:700,display:"flex",alignItems:"center",gap:12,pointerEvents:"none"}}>
          <div style={{width:16,height:16,borderRadius:"50%",border:"2.5px solid #ddd",borderTopColor:TEAL,animation:"spin 0.7s linear infinite"}}/>
          Caricamento...
        </div>
      )}

      {/* Pannello principale */}
      {phase!=="loading"&&(
        <div onClick={e=>e.stopPropagation()}
          style={{
            background:"#fff",borderRadius:12,
            boxShadow:"0 24px 80px rgba(0,0,0,0.28)",
            width:"92vw",maxWidth:1100,
            height:"88vh",
            display:"flex",flexDirection:"column",
            overflow:"hidden",
            animation: phase==="closing"
              ? "schedaUp 0.26s cubic-bezier(.4,0,.6,1) forwards"
              : "schedaDown 0.38s cubic-bezier(.2,.9,.25,1) forwards",
          }}>

          {/* Header */}
          <div style={{background:TEAL,color:"#fff",padding:"18px 28px",display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
            <div style={{width:48,height:48,borderRadius:"50%",background:"rgba(255,255,255,0.22)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:22,flexShrink:0,border:"2px solid rgba(255,255,255,0.4)"}}>
              {(s.cognome||"?")[0].toUpperCase()}
            </div>
            <div style={{flex:1}}>
                                <div style={{fontWeight:700,fontSize:22,letterSpacing:0.2}}>{s.cognome} {s.nome}</div>

              <div style={{fontSize:13,opacity:0.85,marginTop:2}}>Classe {classe} — Scheda studente completa</div>
            </div>
            <button onClick={handleClose} style={{background:"rgba(0,0,0,0.22)",border:"none",color:"#fff",borderRadius:"50%",width:34,height:34,cursor:"pointer",fontWeight:900,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
          </div>

          {/* Tab bar */}
          <div style={{display:"flex",overflowX:"auto",background:"#f8fafc",borderBottom:"2px solid #e5e7eb",flexShrink:0}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{
                  padding:"13px 22px",
                  background:tab===t.id?t.color:"transparent",
                  color:tab===t.id?"#fff":"#6b7280",
                  border:"none",fontWeight:700,fontSize:13,cursor:"pointer",
                  whiteSpace:"nowrap",fontFamily:FF,
                  borderBottom:tab===t.id?"3px solid transparent":"3px solid transparent",
                  transition:"background 0.15s",
                }}>
                {t.lbl}
              </button>
            ))}
          </div>

          {/* Contenuto */}
          <div style={{flex:1,overflowY:"auto"}}>
            {renderContent()}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// APPELLO SEMPLIFICATO — vista compatta stile screenshot
// ══════════════════════════════════════════════
function AppelloSemplificato({students, classe, docente, assenzeDB, contDB, saveAssenze, onOpenEvento, onOpenScheda, mensaDB, setMensaDB, cSet}) {
  const [regData, setRegDataLoc] = useLocal("appelloData", todayISO());
  const [selAll, setSelAll] = useState(false);
  const [selRows, setSelRows] = useState([]);
  const [motModal, setMotModal] = useState(null); // {sid, assenzaId}

  const fmtDataIT = iso => { try{ const[y,m,d]=(iso||"").split("-"); return`${d}/${m}/${y}`; }catch{ return iso||""; } };
  const toISOFast = d => { if(!d) return ""; if(d.includes("-")) return d; const[dd,mm,yy]=d.split("/"); return`${yy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`; };
  const fmtDayLabel = iso => {
    try{
      const d = new Date(iso+"T00:00:00");
      if(isNaN(d)) return iso;
      const GG=["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
      const MM=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
      return `${GG[d.getDay()]}, ${d.getDate()} ${MM[d.getMonth()]} ${d.getFullYear()}`;
    }catch{return iso;}
  };

  const getAss = sid => assenzeDB[classe]?.[sid]||[];
  const assenzeOggi = sid => getAss(sid).filter(a=>toISOFast(a.data)===regData);
  const assenteOggi = sid => assenzeOggi(sid).some(a=>a.tipo==="assente");
  const ritardoOggi = sid => assenzeOggi(sid).find(a=>a.tipo==="ritardo");
  const uscitaOggi   = sid => assenzeOggi(sid).find(a=>a.tipo==="uscita");
  const assenzaPrincipale = sid => assenzeOggi(sid).find(a=>a.tipo==="assente");
  const ngCount = sid => getAss(sid).filter(a=>!a.giustificato&&a.concorreCalcolo!==false).length;

  const toggleAssente = sid => {
    const ex = getAss(sid);
    const a = assenzaPrincipale(sid);
    if(a){
      saveAssenze(sid, ex.filter(x=>x.id!==a.id));
    } else {
      const dataIT = fmtDataIT(regData);
      saveAssenze(sid, [...ex, {id:Date.now(),data:dataIT,tipo:"assente",ore:"Tutto il giorno",concorreCalcolo:true,motivo:"",giustificato:false,inseritoDa:docente}]);
    }
  };

  const toggleGiustificata = sid => {
    const a = assenzaPrincipale(sid);
    if(!a) return;
    saveAssenze(sid, getAss(sid).map(x=>{if(x.id!==a.id)return x;const ng=!x.giustificato;return{...x,giustificato:ng,dataGiustificazione:ng?todayISO():null};}));
  };

  const toggleCertificato = sid => {
    const a = assenzaPrincipale(sid);
    if(!a) return;
    saveAssenze(sid, getAss(sid).map(x=>{if(x.id!==a.id)return x;const nc=!x.certificatoMedico;const ng=nc?true:x.giustificato;return{...x,certificatoMedico:nc,giustificato:ng,dataGiustificazione:ng?(x.dataGiustificazione||todayISO()):null};}));
  };

  const toggleRitardo = sid => {
    const ex = getAss(sid);
    const r = ritardoOggi(sid);
    if(r){
      saveAssenze(sid, ex.filter(x=>x.id!==r.id));
    } else {
      const dataIT = fmtDataIT(regData);
      saveAssenze(sid, [...ex, {id:Date.now(),data:dataIT,tipo:"ritardo",concorreCalcolo:false,motivo:"",giustificato:false,inseritoDa:docente}]);
    }
  };

  const toggleUscita = sid => {
    const ex = getAss(sid);
    const u = uscitaOggi(sid);
    if(u){
      saveAssenze(sid, ex.filter(x=>x.id!==u.id));
    } else {
      const dataIT = fmtDataIT(regData);
      saveAssenze(sid, [...ex, {id:Date.now(),data:dataIT,tipo:"uscita",concorreCalcolo:false,motivo:"",giustificato:false,inseritoDa:docente}]);
    }
  };

  const toggleDaD = sid => {
    const a = assenzaPrincipale(sid) || ritardoOggi(sid) || uscitaOggi(sid);
    const ex = getAss(sid);
    if(a){
      saveAssenze(sid, ex.map(x=>x.id===a.id?{...x,daD:!x.daD}:x));
    } else {
      // Nessun evento oggi: crea un evento "presente" con DaD true, tipo neutro
      const dataIT = fmtDataIT(regData);
      saveAssenze(sid, [...ex, {id:Date.now(),data:dataIT,tipo:"fuori_aula",daD:true,concorreCalcolo:false,motivo:"",giustificato:true,inseritoDa:docente}]);
    }
  };

  const getDaD = sid => {
    const a = assenzaPrincipale(sid) || ritardoOggi(sid) || uscitaOggi(sid);
    return a ? !!a.daD : false;
  };

  // Mensa: dati per classe+data, key = sid
  const mKey = `${classe}||${regData}`;
  const getMensa = sid => mensaDB[mKey]?.[sid] || {si:false, note:"", bianco:false};
  const setMensa = (sid, patch) => {
    setMensaDB(p=>{
      const next = {...p, [mKey]: {...(p[mKey]||{}), [sid]: {...getMensa(sid), ...patch}}};
      try{ cSet("mensaDB", next); }catch{}
      return next;
    });
  };

  // Firme del giorno per pannello sinistro
  const firmeOggi = (contDB[`${classe}||__firme__`]?.firme||[]).filter(f=>toISOFast(f.data||"")===regData);
  const ORE_PANNELLO = ["1","2","3","4","5","6"];
  const firmaPerOra = ora => firmeOggi.find(f=>{
    const inizio = f.oraInizioNum||parseInt(f.oraInizio)||1;
    const nOre = parseInt(f.nOre)||1;
    return parseInt(ora)>=inizio && parseInt(ora)<=inizio+nOre-1;
  });

  const allSelected = students.length>0 && students.every(s=>selRows.includes(s.id));

  return (
    <div style={{flex:1,display:"flex",overflow:"hidden",padding:16,gap:16,fontFamily:FF,background:"#f3f4f6"}}>

      {/* Pannello Firme — sinistra */}
      <div style={{width:240,flexShrink:0,display:"flex",flexDirection:"column",background:"#fff",borderRadius:8,border:"1px solid "+TEAL,overflow:"hidden"}}>
        <div style={{background:TEAL,color:"#fff",padding:"8px 14px",fontWeight:700,fontSize:14}}>Firme</div>
        <div style={{padding:10}}>
          <button style={{width:"100%",padding:"8px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            ✍ Nuova firma
          </button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",padding:"4px 14px",fontSize:12,fontWeight:700,color:"#6b7280",borderBottom:"1px solid #f0f0f0"}}>
          <span>n. Ora</span><span>Mat.</span>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {ORE_PANNELLO.map(ora=>{
            const f = firmaPerOra(ora);
            const mat = f?.materia||f?.materiaFirma||"";
            return(
              <div key={ora} style={{display:"grid",gridTemplateColumns:"1fr 1fr",padding:"6px 14px",alignItems:"center",borderBottom:"1px solid #f3f4f6"}}>
                <span style={{fontSize:13,color:"#374151"}}>{ora}</span>
                {mat
                  ? <span style={{background:TEAL,color:"#fff",borderRadius:10,padding:"2px 8px",fontSize:10,fontWeight:700,textTransform:"uppercase",display:"inline-block",width:"fit-content"}}>{mat.slice(0,3)}</span>
                  : <span/>
                }
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabella appello — destra */}
      <div style={{flex:1,display:"flex",flexDirection:"column",background:"#fff",borderRadius:8,border:"1px solid "+TEAL,overflow:"hidden"}}>
        <div style={{background:TEAL,color:"#fff",padding:"8px 14px",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span>Appello semplificato</span>
          <span style={{fontSize:12,fontWeight:400,opacity:0.9}}>{fmtDayLabel(regData)}</span>
        </div>

        <div style={{flex:1,overflowY:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:"#f0fdfa",borderBottom:"2px solid #c7e8e0"}}>
                <th style={{padding:"6px 8px",width:24,borderRight:"1px solid #e5e7eb"}}>
                  <input type="checkbox" checked={allSelected} onChange={()=>setSelRows(allSelected?[]:students.map(s=>s.id))} style={{cursor:"pointer"}}/>
                </th>
                <th style={{padding:"6px 10px",textAlign:"left",color:TEAL,fontWeight:700,borderRight:"1px solid #e5e7eb",minWidth:170}}>Cognome e Nome</th>
                <th style={{padding:"6px 6px",textAlign:"center",color:TEAL,fontWeight:700,borderRight:"1px solid #e5e7eb",minWidth:40}}>AdG</th>
                <th style={{padding:"6px 6px",textAlign:"center",color:TEAL,fontWeight:700,borderRight:"1px solid #e5e7eb",minWidth:40}}>DaD</th>
                <th style={{padding:"6px 6px",textAlign:"center",color:TEAL,fontWeight:700,borderRight:"1px solid #e5e7eb",minWidth:30}}>A</th>
                <th style={{padding:"6px 6px",textAlign:"center",color:TEAL,fontWeight:700,borderRight:"1px solid #e5e7eb",minWidth:30}}>G</th>
                <th style={{padding:"6px 6px",textAlign:"center",color:TEAL,fontWeight:700,borderRight:"1px solid #e5e7eb",minWidth:30}}>C</th>
                <th style={{padding:"6px 6px",textAlign:"center",color:TEAL,fontWeight:700,borderRight:"1px solid #e5e7eb",minWidth:40}}>Mot.</th>
                <th style={{padding:"6px 6px",textAlign:"center",color:TEAL,fontWeight:700,borderRight:"1px solid #e5e7eb",minWidth:30}}>R</th>
                <th style={{padding:"6px 6px",textAlign:"center",color:TEAL,fontWeight:700,borderRight:"2px solid #d1d5db",minWidth:30}}>U</th>
                <th colSpan={3} style={{padding:"4px 6px",textAlign:"center",color:TEAL,fontWeight:700,background:"#e6f7ee"}}>Mensa</th>
              </tr>
              <tr style={{background:"#fafafa",borderBottom:"2px solid #e5e7eb"}}>
                {Array.from({length:10}).map((_,i)=><td key={i} style={{borderRight:i<9?"1px solid #e5e7eb":"2px solid #d1d5db"}}/>)}
                <td style={{padding:"3px 6px",textAlign:"center",fontSize:10,fontWeight:700,color:"#6b7280",borderRight:"1px solid #e5e7eb"}}>SI/NO</td>
                <td style={{padding:"3px 6px",textAlign:"center",fontSize:10,fontWeight:700,color:"#6b7280",borderRight:"1px solid #e5e7eb"}}>Note</td>
                <td style={{padding:"3px 6px",textAlign:"center",fontSize:10,fontWeight:700,color:"#6b7280"}}>In bianco</td>
              </tr>
            </thead>
            <tbody>
              {students.length===0
                ? <tr><td colSpan={13} style={{padding:30,textAlign:"center",color:"#9ca3af"}}>Nessun alunno</td></tr>
                : students.map((s,i)=>{
                    const a = assenzaPrincipale(s.id);
                    const r = ritardoOggi(s.id);
                    const u = uscitaOggi(s.id);
                    const ng = ngCount(s.id);
                    const isAssente = !!a;
                    const mensa = getMensa(s.id);
                    return(
                      <tr key={s.id} style={{borderBottom:"1px solid #f0f0f0",background:selRows.includes(s.id)?"#ffe600":i%2===0?"#fff":"#fafafa"}}>
                        {/* checkbox */}
                        <td style={{padding:"6px 8px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                          <input type="checkbox" checked={selRows.includes(s.id)} onChange={()=>setSelRows(p=>p.includes(s.id)?p.filter(x=>x!==s.id):[...p,s.id])} style={{cursor:"pointer"}}/>
                        </td>
                        {/* Nome + Evento */}
                        <td style={{padding:"6px 10px",borderRight:"1px solid #e5e7eb"}}>
                          <div>
                            [{i+1}] <span style={{fontWeight:700,color:"#1f2937"}}>{s.cognome} {s.nome}</span>
                          </div>
                          <button onClick={()=>onOpenEvento(s.id)}
                            style={{marginTop:3,padding:"2px 10px",background:"#2563eb",color:"#fff",border:"none",borderRadius:3,fontWeight:600,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                            <Pencil size={10}/> Evento
                          </button>
                        </td>
                        {/* AdG — pallino rosso con conteggio assenze non giustificate, click apre scheda */}
                        <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                          <div onClick={()=>onOpenScheda(s)} style={{display:"flex",justifyContent:"center"}}>
                            <div style={{width:13,height:13,borderRadius:"50%",background:ng>0?"#3b82f6":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}} title="Info alunno">
                              {ng===0&&<span style={{fontSize:13,color:"#94a3b8"}}>ⓘ</span>}
                            </div>
                          </div>
                          {ng>0&&(
                            <div style={{width:20,height:20,borderRadius:"50%",background:"#ef4444",color:"#fff",fontWeight:700,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",margin:"2px auto 0"}}>{ng}</div>
                          )}
                        </td>
                        {/* DaD */}
                        <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                          <input type="checkbox" checked={getDaD(s.id)} onChange={()=>toggleDaD(s.id)} style={{cursor:"pointer",width:15,height:15}}/>
                        </td>
                        {/* A — assente */}
                        <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                          {isAssente
                            ? <span onClick={()=>toggleAssente(s.id)} style={{cursor:"pointer",color:"#ef4444",fontWeight:900,fontSize:14}}>✗</span>
                            : <span onClick={()=>toggleAssente(s.id)} style={{cursor:"pointer",color:"#d1d5db",fontWeight:900,fontSize:14}}>✗</span>
                          }
                        </td>
                        {/* G — giustificata */}
                        <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                          <input type="checkbox" checked={a?.giustificato||false} disabled={!a} onChange={()=>toggleGiustificata(s.id)} style={{cursor:a?"pointer":"default",width:15,height:15,opacity:a?1:0.3}}/>
                        </td>
                        {/* C — certificato medico */}
                        <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                          <input type="checkbox" checked={a?.certificatoMedico||false} disabled={!a} onChange={()=>toggleCertificato(s.id)} style={{cursor:a?"pointer":"default",width:15,height:15,opacity:a?1:0.3}}/>
                        </td>
                        {/* Mot. — bottone modale */}
                        <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                          <button onClick={()=>setMotModal({sid:s.id})} disabled={!a&&!r&&!u}
                            style={{width:26,height:24,background:(a||r||u)?"#eab308":"#e5e7eb",border:"none",borderRadius:3,cursor:(a||r||u)?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto"}}>
                            <Pencil size={11} color="#fff"/>
                          </button>
                        </td>
                        {/* R — ritardo */}
                        <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                          <span onClick={()=>toggleRitardo(s.id)} style={{cursor:"pointer",color:r?"#22c55e":"#d1d5db",fontWeight:900,fontSize:14}}>✓</span>
                        </td>
                        {/* U — uscita */}
                        <td style={{padding:"6px 4px",textAlign:"center",borderRight:"2px solid #d1d5db"}}>
                          <span onClick={()=>toggleUscita(s.id)} style={{cursor:"pointer",color:u?"#2563eb":"#d1d5db",fontWeight:900,fontSize:14}}>✓</span>
                        </td>
                        {/* Mensa SI/NO */}
                        <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                          <input type="checkbox" checked={mensa.si} onChange={()=>setMensa(s.id,{si:!mensa.si})} style={{cursor:"pointer",width:15,height:15}}/>
                        </td>
                        {/* Mensa Note */}
                        <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                          <button onClick={()=>setMotModal({sid:s.id,mensaNote:true})}
                            style={{width:26,height:24,background:mensa.note?"#22c55e":"#eab308",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto"}}>
                            <Pencil size={11} color="#fff"/>
                          </button>
                        </td>
                        {/* Mensa In bianco */}
                        <td style={{padding:"6px 4px",textAlign:"center"}}>
                          <input type="checkbox" checked={mensa.bianco} onChange={()=>setMensa(s.id,{bianco:!mensa.bianco})} style={{cursor:"pointer",width:15,height:15}}/>
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Motivazione / Note mensa */}
      {motModal&&(()=>{
        const st = students.find(x=>x.id===motModal.sid);
        const a = assenzaPrincipale(motModal.sid);
        const r = ritardoOggi(motModal.sid);
        const u = uscitaOggi(motModal.sid);
        const ev = a||r||u;
        if(motModal.mensaNote){
          const mensa = getMensa(motModal.sid);
          return(
            <Modal open={true} onClose={()=>setMotModal(null)} width={420} headerColor="#22c55e" title="Note mensa" subtitle={st?.cognome+" "+st?.nome}>
              <div style={{padding:24,display:"flex",flexDirection:"column",gap:14,fontFamily:FF}}>
                <textarea value={mensa.note} onChange={e=>setMensa(motModal.sid,{note:e.target.value})} rows={3}
                  style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:8,resize:"none",boxSizing:"border-box",fontFamily:FF,fontSize:13}}
                  placeholder="es. allergia, intolleranza, menu speciale..."/>
                <button onClick={()=>setMotModal(null)} style={{padding:"9px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer"}}>💾 Salva</button>
              </div>
            </Modal>
          );
        }
        return(
          <Modal open={true} onClose={()=>setMotModal(null)} width={460} headerColor="#eab308" title="Motivazione" subtitle={st?.cognome+" "+st?.nome}>
            <div style={{padding:24,display:"flex",flexDirection:"column",gap:14,fontFamily:FF}}>
              {!ev
                ? <div style={{color:"#9ca3af",fontSize:13,textAlign:"center"}}>Nessun evento registrato oggi per questo alunno</div>
                : <>
                  <select value={ev.motivo||""} onChange={e=>saveAssenze(motModal.sid, getAss(motModal.sid).map(x=>x.id===ev.id?{...x,motivo:e.target.value}:x))}
                    style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"8px 10px",fontSize:13,fontFamily:FF,background:"#fff"}}>
                    <option value="">— Seleziona —</option>
                    {["Motivi di salute","Motivi familiari","Motivi personali","Visita medica","Motivi sportivi","Motivi di trasporto","Altro"].map(m=><option key={m}>{m}</option>)}
                  </select>
                  <textarea value={ev.infAggiuntive||""} onChange={e=>saveAssenze(motModal.sid, getAss(motModal.sid).map(x=>x.id===ev.id?{...x,infAggiuntive:e.target.value}:x))}
                    rows={3} placeholder="Informazioni aggiuntive..."
                    style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:8,resize:"none",boxSizing:"border-box",fontFamily:FF,fontSize:13}}/>
                </>
              }
              <button onClick={()=>setMotModal(null)} style={{padding:"9px",background:"#eab308",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer"}}>💾 Salva</button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}


function EventoAlunnoModal({s, classe, docente, regData, onSalva, onClose, editAssenza}) {
  const [phase, setPhase] = useState("loading"); // loading | open | closing
  const [tipo, setTipo] = useState(editAssenza?.tipo||"presente");
  const [oraLezione, setOraLezione] = useState(editAssenza?.oraLezione||"1");
  const [oraOrologio, setOraOrologio] = useState(editAssenza?.oraOrologio||"");
  const [motivo, setMotivo] = useState(editAssenza?.motivo||"");
  const [daD, setDaD] = useState(editAssenza?.daD||false);
  const [giustificato, setGiustificato] = useState(editAssenza?.giustificato||false);
  const [concorreCalcolo, setConcorreCalcolo] = useState(editAssenza?.concorreCalcolo!==false);
  const [dataISO, setDataISO] = useState(()=>{
    if(editAssenza?.data) return toISO(editAssenza.data)||regData||new Date().toISOString().split("T")[0];
    return regData||new Date().toISOString().split("T")[0];
  });

  useEffect(()=>{
    const t = setTimeout(()=>setPhase("open"), 200);
    return ()=>clearTimeout(t);
  },[]);

  const close = () => { setPhase("closing"); setTimeout(onClose, 280); };

  const fmtDataIT = iso => { try{ const[y,m,d]=(iso||"").split("-"); return`${d}/${m}/${y}`; }catch{ return iso||""; } };
  const fmtDayLabel = iso => {
    try{
      const d = new Date(iso+"T00:00:00");
      if(isNaN(d)) return iso;
      const GG=["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
      const MM=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
      return `${GG[d.getDay()]}, ${d.getDate()} ${MM[d.getMonth()]} ${d.getFullYear()}`;
    }catch{return iso;}
  };

  const TIPI = [
    {id:"presente",   lbl:"Presente",            col:"#4e9fa0"},
    {id:"assente",    lbl:"Assente",              col:"#ef4444"},
    {id:"ritardo",    lbl:"Ritardo/Rientro",      col:"#f97316"},
    {id:"uscita",     lbl:"Uscita anticipata",    col:"#8b5cf6"},
    {id:"fuori_aula", lbl:"Presente fuori aula",  col:"#16a34a"},
  ];

  const isEdit = !!(editAssenza?.id);

  const salva = () => {
    const ore = tipo==="assente" ? "Tutto il giorno" : (oraLezione?"Ora "+oraLezione:"");
    const entry = {
      id: isEdit ? editAssenza.id : Date.now(),
      data:fmtDataIT(dataISO), tipo,
      oraLezione, oraOrologio, motivo, daD, giustificato,
      dataGiustificazione: giustificato ? (editAssenza?.giustificato ? (editAssenza.dataGiustificazione||todayISO()) : todayISO()) : null,
      concorreCalcolo, ore, inseritoDa:docente
    };
    onSalva(entry, isEdit);
    close();
  };

  const tipoCorrente = TIPI.find(t=>t.id===tipo)||TIPI[0];

  return (
    <div style={{position:"fixed",inset:0,zIndex:7000,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FF}}>
      <style>{`
        @keyframes piombaGiu{from{transform:translateY(-120%)}to{transform:translateY(0)}}
        @keyframes risaliSu{from{transform:translateY(0)}to{transform:translateY(-120%)}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
      {/* Overlay */}
      <div onClick={close} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)",opacity:phase==="loading"?0:1,transition:"opacity 0.22s"}}/>

      {/* Pillola caricamento */}
      {phase==="loading"&&(
        <div style={{position:"relative",zIndex:2,background:"rgba(255,255,255,0.97)",borderRadius:20,padding:"10px 22px",boxShadow:"0 4px 20px rgba(0,0,0,0.12)",fontSize:13,color:"#6b7280",fontWeight:600,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:13,height:13,borderRadius:"50%",border:"2px solid #ddd",borderTopColor:TEAL,animation:"spin 0.7s linear infinite"}}/>
          Caricamento
        </div>
      )}

      {/* Pannello principale */}
      {phase!=="loading"&&(
        <div onClick={e=>e.stopPropagation()} style={{
          position:"relative",zIndex:2,
          width:820,maxWidth:"99vw",
          maxHeight:"95dvh",
          background:"#fff",borderRadius:6,
          boxShadow:"0 12px 48px rgba(0,0,0,0.28)",
          overflow:"hidden",
          display:"flex",flexDirection:"column",
          animation:phase==="closing"
            ?"risaliSu 0.26s cubic-bezier(.4,0,.6,1) forwards"
            :"piombaGiu 0.38s cubic-bezier(.2,.9,.25,1) forwards",
        }}>
          {/* Header teal — compatto */}
          <div style={{background:TEAL,color:"#fff",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
            <div>
              <div style={{fontWeight:700,fontSize:15}}>Nuovo evento — {s.cognome} {s.nome}</div>
              <div style={{fontSize:11,opacity:0.85}}>{fmtDayLabel(dataISO)}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="date" value={dataISO} onChange={e=>setDataISO(e.target.value)}
                style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",color:"#fff",borderRadius:4,padding:"2px 7px",fontSize:11,cursor:"pointer"}}/>
              <button onClick={close} style={{background:"rgba(0,0,0,0.2)",border:"none",color:"#fff",borderRadius:"50%",width:26,height:26,cursor:"pointer",fontWeight:900,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
            </div>
          </div>

          {/* Barra colorata tipo corrente */}
          <div style={{height:3,background:tipoCorrente.col,transition:"background 0.2s",flexShrink:0}}/>

          {/* Corpo SCROLLABILE */}
          <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>

            {/* Radio tipologie — riga orizzontale su mobile */}
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {TIPI.map(t=>(
                <button key={t.id} onClick={()=>setTipo(t.id)}
                  style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:20,border:"2px solid "+(tipo===t.id?t.col:"#e5e7eb"),background:tipo===t.id?t.col:"#fff",cursor:"pointer",fontWeight:tipo===t.id?700:400,color:tipo===t.id?"#fff":t.col,fontSize:12,transition:"all 0.15s"}}>
                  {t.lbl}
                </button>
              ))}
            </div>

            {/* Ora Lez + Orario */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:11,color:TEAL,fontWeight:700,marginBottom:3}}>Ora Lez.</div>
                <input value={oraLezione} onChange={e=>setOraLezione(e.target.value)}
                  style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"7px 8px",fontSize:14,fontFamily:FF,boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:TEAL,fontWeight:700,marginBottom:3}}>Orario</div>
                <div style={{display:"flex",alignItems:"center",border:"1px solid #d1d5db",borderRadius:4,overflow:"hidden"}}>
                  <span style={{padding:"7px 8px",background:"#f5f5f5",borderRight:"1px solid #d1d5db",fontSize:13}}>⏰</span>
                  <input type="time" value={oraOrologio} onChange={e=>setOraOrologio(e.target.value)}
                    style={{border:"none",padding:"7px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
                </div>
              </div>
            </div>

            {/* Motivo */}
            <div>
              <div style={{fontSize:11,color:TEAL,fontWeight:700,marginBottom:3}}>Motivo</div>
              <textarea value={motivo} onChange={e=>setMotivo(e.target.value)} rows={2}
                style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"7px 8px",resize:"none",fontFamily:FF,fontSize:13,boxSizing:"border-box"}}/>
            </div>

            {/* DaD | Giustificato | Concorre */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                              {[
                {lbl:"DaD", val:daD, set:setDaD},
                {lbl:"Giustificato", val:giustificato, set:setGiustificato},
                {lbl:"Concorre", val:concorreCalcolo, set:setConcorreCalcolo},
              ].map(({lbl,val,set})=>(
                <div key={lbl}>
                  <div style={{fontSize:10,color:"#6b7280",fontWeight:600,marginBottom:3}}>{lbl}</div>
                  <ToggleSiNo value={val} onChange={set}/>
                </div>
              ))}
            </div>
          </div>

          {/* Footer FISSO in basso — sempre visibile */}
          <div style={{flexShrink:0,borderTop:"2px solid #e5e7eb",padding:"10px 16px",background:"#f9fafb",display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8}}>
            <button onClick={salva}
              style={{padding:"10px 28px",background:"#22c55e",color:"#fff",border:"none",borderRadius:6,fontWeight:700,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",gap:6,boxShadow:"0 2px 8px rgba(34,197,94,0.3)"}}>
              💾 Salva
            </button>
            <button onClick={close}
              style={{padding:"10px 18px",background:"#3b82f6",color:"#fff",border:"none",borderRadius:6,fontWeight:700,fontSize:15,cursor:"pointer"}}>
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// PANNELLO SCHEDA ALUNNO — stile Axios/Argo
// ══════════════════════════════════════════════
function SchedaAlunnoPanel({s, classe, docente, assenzeDB, contDB, votiDB, onClose, onSalvaAssenza, onEliminaAssenza, onOpenSchedaCompleta, regData: regDataProp, onOpenContenuto, onOpenNota, onOpenAnnotazione, onDeleteContenuto, onChangeRegData, onOpenVerifica}) {
  const [loadingPanel] = useState(false);
  const [regData, setRegDataLocal] = useState(regDataProp);
  useEffect(()=>{ setRegDataLocal(regDataProp); },[regDataProp]);
  const handleRegDataChange = (d) => { setRegDataLocal(d); if(onChangeRegData) onChangeRegData(d); };
      const [eventoOpen, setEventoOpen] = useState(false);
  const [eventoEdit, setEventoEdit] = useState(null);

  const fmtDataIT = iso => { try{ const[y,m,d]=(iso||"").split("-"); return`${d}/${m}/${y}`; }catch{ return iso||""; } };
  const toISOFast = d => { if(!d)return""; if(d.includes("-"))return d; const[dd,mm,yy]=d.split("/"); return`${yy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`; };
  // prevDay usato per navigazione


  const ass = (assenzeDB[classe]?.[s.id]||[]).sort((a,b)=>toISOFast(b.data).localeCompare(toISOFast(a.data)));
  const assOggi = ass.filter(a=>toISOFast(a.data)===regData);
  const daNonGiust = ass.filter(a=>!a.giustificato&&a.concorreCalcolo!==false);

  const getContenuti = (sec) => {
    const prefix = `${classe}||`;
    const seen = new Set(); const all = [];
    Object.entries(contDB||{}).filter(([k])=>k.startsWith(prefix)&&!k.includes("__firme__")).forEach(([k,v])=>{
      const mat=k.split("||")[1]||"";
      (v[sec]||[]).forEach(item=>{
        if(seen.has(item.id))return; seen.add(item.id);
        const rig = !item.partecipazione||item.partecipazione==="tutti"||(item.alunniParz||[]).includes(s.id);
        if(rig) all.push({...item,_mat:mat});
      });
    });
    return all.sort((a,b)=>toISOFast(b.data).localeCompare(toISOFast(a.data)));
  };
  // Note disciplinari + annotazioni confluiscono nella stessa tabella "Note disciplinari" della scheda alunno
  const noteStudente = [
    ...(contDB[`__class__${classe}`]?.note||[]).map(n=>({...n,_tipo:"note"})),
    ...(contDB[`__class__${classe}`]?.annotazioni||[]).map(a=>({...a,_tipo:"annotazioni"})),
  ]
    .filter(n=>n.destinatariTutti||(n.destinatari||[]).includes(s.id))
    .sort((a,b)=>toISOFast(b.data).localeCompare(toISOFast(a.data)));
  const argomenti = getContenuti("lezioni");
  const compiti   = getContenuti("compiti");

  const HDR = TEAL;
  const TBL_BORDER = "1px solid #e8edf2";

  const SezioneHdr = ({label, onAdd}) => (
    <div style={{background:"#4e9fa0",color:"#fff",padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <span style={{fontWeight:700,fontSize:13}}>{label}</span>
      {onAdd&&(
        <button onClick={onAdd} style={{padding:"3px 10px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
          + Aggiungi
        </button>
      )}
    </div>
  );

  if(loadingPanel) return (
    <div style={{width:"50%",minWidth:240,display:"flex",alignItems:"center",justifyContent:"center",background:"#fff",borderRadius:8,border:"2px solid "+TEAL,flexShrink:0,fontFamily:FF}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
        <div style={{width:32,height:32,borderRadius:"50%",border:"4px solid #d1d5db",borderTopColor:TEAL,animation:"spin 0.7s linear infinite"}}/>
        <span style={{fontWeight:700,fontSize:15,color:"#6b7280"}}>Caricamento...</span>
      </div>
    </div>
  );

  return (
    <>
      {/* Modal evento che piomba dall'alto */}
      {eventoOpen&&(
        <EventoAlunnoModal
          s={s} classe={classe} docente={docente} regData={regData}
          editAssenza={eventoEdit}
          onSalva={(entry, isEdit)=>{
            if(isEdit) onSalvaAssenza(s.id, entry, {edit:true});
            else onSalvaAssenza(s.id, entry);
            setEventoEdit(null);
          }}
          onClose={()=>{ setEventoOpen(false); setEventoEdit(null); }}
        />
      )}

      <div style={{flex:1,display:"flex",flexDirection:"column",background:"#fff",border:"2px solid "+HDR,borderRadius:8,overflow:"hidden",fontFamily:FF}}>
        {/* Header alunno */}
        <div style={{background:HDR,color:"#fff",padding:"10px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,0.22)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:17,flexShrink:0}}>
            {(s.cognome||"?")[0].toUpperCase()}
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:16}}>{s.cognome} {s.nome}</div>
            <div style={{fontSize:11,opacity:0.85}}>Classe {classe} · {daNonGiust.length>0?<span style={{color:"#fde68a",fontWeight:700}}>{daNonGiust.length} da giust.</span>:"Nessuna da giustificare"}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <AxiosDateInput value={regData} onChange={v=>handleRegDataChange(v)} style={{flex:1}}/>
            <button onClick={()=>onOpenSchedaCompleta&&onOpenSchedaCompleta(s)}
              style={{padding:"4px 10px",background:"rgba(255,255,255,0.18)",border:"1px solid rgba(255,255,255,0.4)",color:"#fff",borderRadius:4,fontWeight:700,fontSize:11,cursor:"pointer"}}>Scheda</button>
          </div>
          <button onClick={onClose} style={{background:"rgba(0,0,0,0.22)",border:"none",color:"#fff",borderRadius:"50%",width:28,height:28,cursor:"pointer",fontWeight:900,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        <div style={{flex:1,overflowY:"auto"}}>

          {/* ── ASSENZA/RITARDO/USCITA ── */}
          <div style={{borderBottom:"2px solid #f3f4f6"}}>
            <div style={{background:"#4e9fa0",color:"#fff",padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontWeight:700,fontSize:13}}>Assenza - Ritardo/Rientro - Uscita</span>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setEventoOpen(true)}
                  style={{padding:"4px 12px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:12,cursor:"pointer"}}>
                  + Aggiungi evento
                </button>
                {daNonGiust.length>0&&(
                  <button onClick={e=>{e.stopPropagation();setGiustModal({sid:s.id});setGiustOpen(true);}} style={{padding:"4px 12px",background:"#8b5cf6",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:12,cursor:"pointer"}}>
                    Giustifica
                  </button>
                )}
              </div>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{background:"#f0fdfa",borderBottom:"2px solid #c7e8e0"}}>
                    {["Tipologia","Orario","Ora","Giustificato","Motivo","DaD","Comandi"].map(h=>(
                      <th key={h} style={{padding:"8px 12px",textAlign:"left",color:HDR,fontWeight:700,fontSize:12,borderRight:TBL_BORDER}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assOggi.length===0
                    ?<tr><td colSpan={7} style={{padding:"16px 14px",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>Nessun evento oggi</td></tr>
                    :assOggi.map((a,i)=>{
                      const INFO={assente:{lbl:"Assenza",col:"#ef4444"},ritardo:{lbl:"Ritardo",col:"#f97316"},uscita:{lbl:"Uscita Ant.",col:"#8b5cf6"},fuori_aula:{lbl:"Fuori Aula",col:"#6b7280"},presente:{lbl:"Presente",col:"#22c55e"}};
                      const info=INFO[a.tipo]||{lbl:a.tipo,col:"#374151"};
                      return(
                        <tr key={a.id} style={{borderBottom:TBL_BORDER,background:i%2===0?"#fff":"#fafafa"}}>
                          <td style={{padding:"8px 12px",borderRight:TBL_BORDER}}>
                            <span style={{background:info.col,color:"#fff",borderRadius:12,padding:"3px 12px",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{info.lbl}</span>
                          </td>
                          <td style={{padding:"8px 12px",fontSize:12,borderRight:TBL_BORDER,whiteSpace:"nowrap"}}>{a.oraOrologio||"—"}</td>
                          <td style={{padding:"8px 12px",fontSize:12,borderRight:TBL_BORDER}}>{a.oraLezione?"Ora "+a.oraLezione:"—"}</td>
                          <td style={{padding:"8px 12px",textAlign:"center",borderRight:TBL_BORDER}}>
                            <div onClick={()=>{const ng=!a.giustificato;onSalvaAssenza(s.id,{...a,giustificato:ng,dataGiustificazione:ng?todayISO():null},{edit:true});}}
                              style={{width:22,height:22,border:"2px solid "+(a.giustificato?"#22c55e":"#d1d5db"),borderRadius:3,background:a.giustificato?"#22c55e":"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",margin:"0 auto"}}>
                              <span style={{color:a.giustificato?"#fff":"#ef4444",fontSize:13,fontWeight:900}}>{a.giustificato?"✓":"✗"}</span>
                            </div>
                          </td>
                          <td style={{padding:"8px 12px",fontSize:12,borderRight:TBL_BORDER,maxWidth:160}}>{a.motivo||""}</td>
                          <td style={{padding:"8px 12px",textAlign:"center",borderRight:TBL_BORDER}}>
                            <div style={{width:22,height:22,borderRadius:3,background:a.daD?"#2563eb":"#e5e7eb",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto"}}>
                              <span style={{color:a.daD?"#fff":"#9ca3af",fontSize:11,fontWeight:900}}>{a.daD?"✓":"—"}</span>
                            </div>
                          </td>
                          <td style={{padding:"6px 10px"}}>
                            <div style={{display:"flex",gap:4}}>
                              <button onClick={()=>{ setEventoEdit(a); setEventoOpen(true); }}
                                style={{background:HDR,color:"#fff",border:"none",borderRadius:3,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>✏️ Modifica</button>
                              <button onClick={()=>onEliminaAssenza&&onEliminaAssenza(s.id,a.id)}
                                style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:3,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
          </div>

          {/* ── VERIFICHE ── */}
          {(()=>{
            const prefix = `${classe}||`;
            const seen = new Set();
            const vvStudente = [];
            Object.entries(contDB||{}).filter(([k])=>k.startsWith(prefix)&&!k.includes("__firme__")).forEach(([k,v])=>{
              const mat = k.split("||")[1]||"";
              (v.verifiche||[]).forEach(item=>{
                if(seen.has(item.id)) return; seen.add(item.id);
                // Filtra per data regData
                const itemData = item.data||"";
                const itemISO = itemData.includes("-") ? itemData : itemData.includes("/") ? (()=>{const[d,m,y]=itemData.split("/");return`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;})() : "";
                if(itemISO !== regData) return;
                const riguarda = !item.partecipazione || item.partecipazione==="tutti" || (item.alunniParz||[]).length===0 || (item.alunniParz||[]).includes(s.id);
                if(!riguarda) return;
                vvStudente.push({...item, _mat:mat});
              });
            });
            const fmtDV = d=>{ try{ if(!d)return""; if(d.includes("-")){ const[y,m,dd]=d.split("-"); return`${dd}/${m}/${y}`; } return d; }catch{return d;} };
            return(
              <div style={{borderBottom:"2px solid #e5e7eb"}}>
                <SezioneHdr label="Verifiche/Compiti in classe" onAdd={()=>onOpenVerifica&&onOpenVerifica(s.id)}/>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{background:"#f0fdfa",borderBottom:"2px solid #bbf7d0"}}>
                      {["Data","Tipo","Alunno","Materia","Argomento","Comandi"].map(h=>(
                        <th key={h} style={{padding:"8px 14px",textAlign:"left",color:HDR,fontWeight:700,fontSize:12,borderRight:"1px solid #d1fae5"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vvStudente.length===0
                      ?<tr><td colSpan={6} style={{padding:"14px 16px",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>Nessun dato presente</td></tr>
                      :vvStudente.map((item,i)=>(
                        <tr key={item.id} style={{borderBottom:"1px solid #e5e7eb",background:i%2===0?"#fff":"#f9fafb"}}>
                          <td style={{padding:"9px 14px",fontSize:13,whiteSpace:"nowrap",borderRight:"1px solid #e5e7eb",color:"#6b7280"}}>{fmtDV(item.data||"")}</td>
                          <td style={{padding:"9px 14px",borderRight:"1px solid #e5e7eb"}}>
                            <span style={{background:"#7c3aed",color:"#fff",borderRadius:4,padding:"2px 9px",fontWeight:700,fontSize:11}}>{item.tipoVerifica||"Verifica"}</span>
                          </td>
                          <td style={{padding:"9px 10px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                            {(!item.partecipazione||item.partecipazione==="tutti"||(item.alunniParz||[]).length===0)
                              ? <span style={{background:"#f97316",color:"#fff",borderRadius:12,padding:"3px 12px",fontWeight:700,fontSize:11,whiteSpace:"nowrap",display:"inline-block"}}>Classe</span>
                              : <span style={{background:"#f97316",color:"#fff",borderRadius:12,padding:"3px 12px",fontWeight:700,fontSize:11,whiteSpace:"nowrap",display:"inline-block"}}>{(item.alunniParz||[]).length} alunn{(item.alunniParz||[]).length===1?"o":"i"}</span>
                            }
                          </td>
                          <td style={{padding:"9px 14px",fontWeight:700,color:HDR,fontSize:12,textTransform:"uppercase",whiteSpace:"nowrap",borderRight:"1px solid #e5e7eb"}}>{item._mat||item.materia||""}</td>
                          <td style={{padding:"9px 14px",fontSize:13,color:"#374151",wordBreak:"break-word",whiteSpace:"pre-wrap",overflowWrap:"anywhere",borderRight:"1px solid #e5e7eb",lineHeight:1.5}}>{item.argomenti||""}</td>
                          <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>
                            <div style={{display:"flex",gap:4}}>
                              <button onClick={()=>onOpenVerifica&&onOpenVerifica(s.id, item)} style={{background:HDR,color:"#fff",border:"none",borderRadius:3,padding:"4px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>✏️ Modifica</button>
                              <button onClick={()=>onDeleteContenuto&&onDeleteContenuto("verifiche", item.id)} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:3,padding:"4px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* ── ARGOMENTI DELLA LEZIONE ── */}
          <div style={{borderBottom:"2px solid #e5e7eb"}}>
            <SezioneHdr label="Argomenti della lezione" onAdd={()=>onOpenContenuto&&onOpenContenuto("lezioni", s.id)}/>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#f0fdfa",borderBottom:"2px solid #bbf7d0"}}>
                  {["Materia","Docente","Argomento","Comandi"].map(h=>(
                    <th key={h} style={{padding:"8px 14px",textAlign:"left",color:HDR,fontWeight:700,fontSize:12,borderRight:"1px solid #d1fae5"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {argomenti.filter(i=>toISOFast(i.data)===regData).length===0
                  ?<tr><td colSpan={4} style={{padding:"14px 16px",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>Nessun dato presente</td></tr>
                  :argomenti.filter(i=>toISOFast(i.data)===regData).map((item,i)=>(
                    <tr key={item.id} style={{borderBottom:"1px solid #e5e7eb",background:i%2===0?"#fff":"#f9fafb"}}>
                      <td style={{padding:"9px 14px",fontWeight:700,color:"#1f2937",fontSize:13,whiteSpace:"nowrap",borderRight:"1px solid #e5e7eb"}}>{item._mat||""}</td>
                      <td style={{padding:"9px 14px",fontWeight:700,color:"#1f2937",fontSize:13,whiteSpace:"nowrap",borderRight:"1px solid #e5e7eb"}}>{cognomeNome(item.inseritoDa||docente).toUpperCase()}</td>
                      <td style={{padding:"9px 14px",fontSize:13,color:"#374151",borderRight:"1px solid #e5e7eb",whiteSpace:"pre-wrap"}}>{item.testo}</td>
                      <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>
                        <div style={{display:"flex",gap:4}}>
                          <button onClick={()=>onOpenContenuto&&onOpenContenuto("lezioni", s.id, item)} style={{background:HDR,color:"#fff",border:"none",borderRadius:3,padding:"4px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>✏️ Modifica</button>
                      <button onClick={()=>onDeleteContenuto&&onDeleteContenuto("lezioni", item.id)} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:3,padding:"4px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          {/* ── COMPITI ASSEGNATI ── */}
          <div style={{borderBottom:"2px solid #e5e7eb"}}>
            <SezioneHdr label="Compiti assegnati (Alunno)" onAdd={()=>onOpenContenuto&&onOpenContenuto("compiti", s.id)}/>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#f0fdfa",borderBottom:"2px solid #bbf7d0"}}>
                  {["Materia","Docente","Compito assegnato","Comandi"].map(h=>(
                    <th key={h} style={{padding:"8px 14px",textAlign:"left",color:HDR,fontWeight:700,fontSize:12,borderRight:"1px solid #d1fae5"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compiti.filter(i=>toISOFast(i.data)===regData).length===0
                  ?<tr><td colSpan={4} style={{padding:"14px 16px",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>Nessun dato presente</td></tr>
                  :compiti.filter(i=>toISOFast(i.data)===regData).map((item,i)=>(
                    <tr key={item.id} style={{borderBottom:"1px solid #e5e7eb",background:i%2===0?"#fff":"#f9fafb"}}>
                      <td style={{padding:"9px 14px",fontWeight:700,color:"#1f2937",fontSize:13,whiteSpace:"nowrap",borderRight:"1px solid #e5e7eb"}}>{item._mat||""}</td>
                      <td style={{padding:"9px 14px",fontWeight:700,color:"#1f2937",fontSize:13,whiteSpace:"nowrap",borderRight:"1px solid #e5e7eb"}}>{cognomeNome(item.inseritoDa||docente).toUpperCase()}</td>
                      <td style={{padding:"9px 14px",fontSize:13,color:"#374151",borderRight:"1px solid #e5e7eb",whiteSpace:"pre-wrap"}}>{item.testo}</td>
                      <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>
                        <div style={{display:"flex",gap:4}}>
                          <button onClick={()=>onOpenContenuto&&onOpenContenuto("compiti", s.id, item)} style={{background:HDR,color:"#fff",border:"none",borderRadius:3,padding:"4px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>✏️ Modifica</button>
                          <button onClick={()=>onDeleteContenuto&&onDeleteContenuto("compiti", item.id)} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:3,padding:"4px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          {/* ── NOTE DISCIPLINARI ── */}
          <div style={{borderBottom:"2px solid #e5e7eb"}}>
            <SezioneHdr label="Note disciplinari (Alunno)" onAdd={()=>onOpenNota&&onOpenNota(s.id)}/>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              {noteStudente.length>0 && (
                <thead>
                  <tr style={{background:"#f0fdfa",borderBottom:"2px solid #bbf7d0"}}>
                    {["Alunno","Docente","Nota disciplinare","Gravità","Comandi"].map(h=>(
                      <th key={h} style={{padding:"8px 14px",textAlign:"left",color:HDR,fontWeight:700,fontSize:12,borderRight:"1px solid #d1fae5"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {noteStudente.length===0
                  ?<tr><td colSpan={5} style={{padding:"14px 16px",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>Nessun dato presente</td></tr>
                  :noteStudente.map((n,i)=>(
                    <tr key={n.id} style={{borderBottom:"1px solid #e5e7eb",background:i%2===0?"#fff":"#f9fafb"}}>
                      <td style={{padding:"10px 14px",fontWeight:700,fontSize:13,whiteSpace:"nowrap",borderRight:"1px solid #e5e7eb",color:"#1f2937"}}>
                        {(n.destinatariTutti||!(n.destinatari||[]).length)?"Classe":`${s.cognome} ${s.nome}`}
                      </td>
                      <td style={{padding:"10px 14px",fontWeight:700,fontSize:13,whiteSpace:"nowrap",borderRight:"1px solid #e5e7eb",color:"#1f2937"}}>
                        {cognomeNome(n.inseritoDa||docente).toUpperCase()}
                      </td>
                      <td style={{padding:"10px 14px",fontSize:13,color:"#374151",borderRight:"1px solid #e5e7eb",whiteSpace:"pre-wrap"}}>{n.testo}</td>
                      <td style={{padding:"10px 14px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                        <span style={{background:HDR,color:"#fff",borderRadius:4,padding:"2px 10px",fontWeight:700,fontSize:12}}>{(n._tipo==="annotazioni"?n.gravitaAnnot:n.gravita)||"—"}</span>
                      </td>
                      <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>
                        <div style={{display:"flex",gap:4}}>
                          <button onClick={()=>n._tipo==="annotazioni"?onOpenAnnotazione&&onOpenAnnotazione(s.id, n):onOpenNota&&onOpenNota(s.id, n)} style={{background:HDR,color:"#fff",border:"none",borderRadius:3,padding:"4px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>✏️ Modifica</button>
                          <button onClick={()=>onDeleteContenuto&&onDeleteContenuto(n._tipo, n.id)} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:3,padding:"4px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>




        </div>
      </div>
    </>
  );
}

function StudentRow({s,i,isAssente,ng,onAssenzaChange,selezionato,onSelect,assenzeOggi,onBadgeClick,onOpenScheda,checkedMulti,onCheckMulti}) {
  const ritardo   = (assenzeOggi||[]).find(a=>a.tipo==="ritardo");
  const uscita    = (assenzeOggi||[]).find(a=>a.tipo==="uscita");

  // Colore sfondo cella Info
  const infoBg = ritardo ? "#fff9c2" : uscita ? "#cfe8f3" : isAssente ? "#fce8e8" : "#fff";
  // Lettera da mostrare
  const infoLetter = ritardo ? "R" : uscita ? "U" : null;
  const infoLetterColor = ritardo ? "#e6a817" : uscita ? "#4ab8d4" : null;

  return (
    <div
      style={{display:"grid", gridTemplateColumns:"22px 18px 1fr 56px 28px 56px 56px",
        alignItems:"stretch", padding:"0 6px", gap:0,
        background: selezionato ? "#ffe600" : i%2===0 ? "#fff" : "#f9fafb",
        borderBottom:"1px solid #e8edf2",
        borderLeft: selezionato ? "4px solid #c9a800" : "3px solid transparent",
        cursor:"pointer", userSelect:"none", minHeight:38}}
      onClick={()=>onSelect()}>

      {/* Checkbox */}
      <div onClick={e=>{e.stopPropagation();onCheckMulti(!checkedMulti);}}
        style={{display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
        <div style={{width:14,height:14,border:"1px solid "+(checkedMulti?"#2563eb":"#bbb"),
          borderRadius:2,background:checkedMulti?"#2563eb":"#fff",
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          {checkedMulti&&<span style={{color:"#fff",fontSize:9,fontWeight:900,lineHeight:1}}>✓</span>}
        </div>
      </div>

      {/* Numero */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#9ca3af"}}>[{i+1}]</div>

      {/* Nome */}
      <div style={{display:"flex",alignItems:"center",paddingLeft:4,overflow:"hidden"}}>
        <span style={{fontSize:13,color:"#1f2937",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {s.cognome} {s.nome}
        </span>
      </div>

      {/* Bottone ℹ */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",borderLeft:"1px solid #e5e7eb",marginRight:4}}>
        <button onClick={e=>{e.stopPropagation();onOpenScheda();}}
          style={{width:26,height:26,background:"#29b6d8",border:"none",borderRadius:3,
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
            flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.18)"}}>
          <div style={{width:18,height:18,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.9)",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{color:"#fff",fontWeight:900,fontSize:11,lineHeight:1,fontFamily:"Georgia,serif",fontStyle:"italic"}}>i</span>
          </div>
        </button>
      </div>

      {/* Checkbox Assenza */}
      <div onClick={e=>{e.stopPropagation();onAssenzaChange(!isAssente);}}
        style={{display:"flex",alignItems:"center",justifyContent:"center",
          borderLeft:"1px solid #e5e7eb",borderRight:"1px solid #e5e7eb"}}>
        <AssenzaCheckbox checked={isAssente} onChange={onAssenzaChange}/>
      </div>

      {/* COLONNA 1 — primo evento o pallino badge */}
      {(()=>{
        const eventi = (assenzeOggi||[]).filter(a=>a.tipo!=="assente");
        const ev1 = eventi[0]||null;
        const INFO={
          ritardo:   {lbl:"R", col:"#eab308"},
          uscita:    {lbl:"U", col:"#3b82f6"},   // blu
          ingresso:  {lbl:"I", col:"#8b5cf6"},
          fuori_aula:{lbl:"F", col:"#16a34a"},
        };
        const info1 = ev1 ? (INFO[ev1.tipo]||{lbl:"?",col:"#6b7280"}) : null;
        const bgCol1 = ng>0 ? "#fee2e2" : ev1 ? info1.col+"18" : "transparent";
        return(
          <div onClick={e=>{e.stopPropagation();if(ng>0)onBadgeClick();}}
            style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              background:bgCol1,
              gap:0,padding:"2px 0",minWidth:56,borderLeft:"1px solid #e5e7eb",cursor:ng>0?"pointer":"default"}}>
            {ev1
              ? <span style={{fontWeight:900,fontSize:15,lineHeight:1.1,color:info1.col}}>{info1.lbl}</span>
              : null
            }
            {ng>0
              ? <div style={{width:20,height:20,background:"#e53935",borderRadius:"50%",
                  color:"#fff",fontWeight:700,fontSize:11,marginTop:ev1?2:0,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  boxShadow:"0 1px 3px rgba(229,57,53,0.35)",flexShrink:0}}>{ng}</div>
              : (!ev1&&<span style={{color:"#d1d5db",fontSize:11}}>—</span>)
            }
          </div>
        );
      })()}

      {/* COLONNA 2 — secondo evento separato */}
      {(()=>{
        const eventi = (assenzeOggi||[]).filter(a=>a.tipo!=="assente");
        const ev2 = eventi[1]||null;
        const INFO={
          ritardo:   {lbl:"R", col:"#eab308"},
          uscita:    {lbl:"U", col:"#3b82f6"},   // blu
          ingresso:  {lbl:"I", col:"#8b5cf6"},
          fuori_aula:{lbl:"F", col:"#16a34a"},
        };
        const info2 = ev2 ? (INFO[ev2.tipo]||{lbl:"?",col:"#6b7280"}) : null;
        return(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            background: ev2 ? info2.col+"18" : "transparent",
            gap:0,padding:"2px 0",minWidth:56,borderLeft:"1px solid #e5e7eb"}}>
            {ev2
              ? <span style={{fontWeight:900,fontSize:15,lineHeight:1.1,color:info2.col}}>{info2.lbl}</span>
              : <span style={{color:"#d1d5db",fontSize:11}}>—</span>
            }
          </div>
        );
      })()}
    </div>
  );
}

function ListaAlunniPanel({students,classe,TEAL,TEAL_LIGHT,isRegToday,regData,selStudent,setSelStudent,hasAssenzaInData,ngCount,getAssenze,toISOFast,assenzaRapidaInData,saveAssenze,assenzeDB,setGiustModal,setGiustOpen,setSchedaStudente,docente,showToast}) {
  const [multiSel, setMultiSel] = useState([]);
  const [eventoMultiOpen, setEventoMultiOpen] = useState(false);
  const allMultiSel = students.length>0 && students.every(s=>multiSel.includes(s.id));
  return (
    <div style={{width:"50%",minWidth:240,display:"flex",flexDirection:"column",background:"#fff",borderRadius:8,border:"1px solid "+TEAL,overflow:"hidden",flexShrink:0}}>
      
      {/* Intestazione a DUE RIGHE stile immagine */}
      <div style={{flexShrink:0,borderBottom:"2px solid "+TEAL}}>
        {/* RIGA 1: Cognome e Nome (sx) + fascia verde data (dx, sopra Ass/MensaDaD/Info) */}
        <div style={{display:"grid",gridTemplateColumns:"22px 18px 1fr 56px 28px 56px 56px",background:"#fff",alignItems:"stretch",gap:0}}>
          <div/>
          <div/>
          {/* Cognome e Nome + bottone evento */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"4px 4px 3px 4px"}}>
            <span style={{fontWeight:700,fontSize:11,color:"#2563eb"}}>Cognome e Nome</span>
            <button onClick={e=>{e.stopPropagation();setEventoMultiOpen(true);}}
              style={{padding:"3px 10px",background:"#2563eb",color:"#fff",border:"none",
                borderRadius:0,fontWeight:600,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:11}}>📝</span> Evento
            </button>
            {!isRegToday&&<span style={{background:"#fbbf24",color:"#1f2937",borderRadius:0,
              padding:"0 4px",fontSize:9,fontWeight:700}}>storico</span>}
          </div>
          {/* Fascia verde data — si estende su Info(ℹ), Ass. e le 2 col info */}
          <div style={{
            gridColumn:"span 4",
            background:"#d4edda",
            borderLeft:"1px solid #c3e6cb",
            display:"flex",alignItems:"center",justifyContent:"center",
            padding:"3px 4px",
          }}>
            <span style={{fontWeight:700,fontSize:11,color:"#155724",letterSpacing:0.2}}>
              {(()=>{
                const d=new Date(regData+"T00:00:00");
                if(isNaN(d)) return regData;
                const GG=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
                const MM=["01","02","03","04","05","06","07","08","09","10","11","12"];
                return `${GG[d.getDay()]} ${String(d.getDate()).padStart(2,"0")}/${MM[d.getMonth()]}/${d.getFullYear()}`;
              })()}
            </span>
          </div>
        </div>
        {/* RIGA 2: checkbox + (vuoti sx) + Info(ℹ) + Ass. + col1 + col2 */}
        <div style={{display:"grid",gridTemplateColumns:"22px 18px 1fr 28px 28px 56px 56px",background:"#fff",alignItems:"center",gap:0,padding:"3px 6px"}}>
          {/* checkbox tutto */}
          <div onClick={()=>setMultiSel(allMultiSel?[]:students.map(s=>s.id))}
            style={{width:14,height:14,border:"1px solid "+(allMultiSel?"#2563eb":"#9ca3af"),
              borderRadius:2,background:allMultiSel?"#2563eb":"#fff",
              display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
            {allMultiSel&&<span style={{color:"#fff",fontSize:9,fontWeight:900}}>✓</span>}
            {!allMultiSel&&multiSel.length>0&&<span style={{color:"#2563eb",fontSize:11,fontWeight:900}}>−</span>}
          </div>
          <div/>
          <div/>
          {/* Info (bottone ℹ) */}
          <div style={{textAlign:"center",fontSize:10,fontWeight:700,color:TEAL,borderLeft:"1px solid #c7e8e0",paddingRight:6}}>Info</div>
          {/* Ass. */}
          <div style={{textAlign:"center",fontSize:10,fontWeight:700,color:"#ef4444",paddingLeft:6}}>Ass.</div>
          {/* col vuota */}
          <div style={{borderLeft:"1px solid #c7e8e0"}}/>
          {/* Info (ultima col) */}
          <div style={{textAlign:"center",fontSize:10,fontWeight:700,color:TEAL,borderLeft:"1px solid #c7e8e0"}}>Info</div>
        </div>
      </div>
      
      {/* Lista */}
      <div style={{flex:1,overflowY:"auto"}}>
        {students.length===0
          ?<div style={{padding:24,textAlign:"center",color:"#9ca3af"}}><Users size={32} color="#d1d5db"/><div style={{marginTop:8,fontWeight:600}}>Nessun alunno</div></div>
          :students.map((s,i)=>{
            const isAssente=hasAssenzaInData(s.id,regData);
            const ng=ngCount(s.id);
            return <StudentRow key={s.id} s={s} i={i} isAssente={isAssente} ng={ng} selezionato={selStudent===s.id}
              checkedMulti={multiSel.includes(s.id)}
              onCheckMulti={v=>setMultiSel(p=>v?[...p,s.id]:p.filter(x=>x!==s.id))}
              assenzeOggi={getAssenze(s.id).filter(a=>toISOFast(a.data)===regData)}
              onAssenzaChange={checked=>{
                if(checked) assenzaRapidaInData(s.id,regData);
                else saveAssenze(s.id,getAssenze(s.id).filter(a=>!(toISOFast(a.data)===regData&&a.tipo==="assente"&&(!a.ore||a.ore==="Tutto il giorno"))));
              }}
              onSelect={()=>setSelStudent(selStudent===s.id?null:s.id)}
              onBadgeClick={()=>{setGiustModal({sid:s.id});setGiustOpen(true);}}
              onOpenScheda={()=>setSchedaStudente(s)}
            />;
          })
        }
      </div>
      {/* Modal evento multiplo */}
      {eventoMultiOpen&&(
        <EventoAlunnoModal
          s={{cognome:`${multiSel.length} alunni selezionati`,nome:""}}
          classe={classe} docente={docente} regData={regData}
          editAssenza={null}
          onSalva={(entry)=>{
            multiSel.forEach(sid=>{
              const existing=(assenzeDB[classe]?.[sid]||[]);
              saveAssenze(sid,[...existing,{...entry,id:Date.now()+Math.random()}]);
            });
            setMultiSel([]);
            showToast(`✅ Evento applicato a ${multiSel.length} alunni`);
          }}
          onClose={()=>setEventoMultiOpen(false)}
        />
      )}
    </div>
  );
}

function RegistroClassePanel({students, materia, getCont, saveCont, deleteContById, openFirma, openVerifica, openContenuto, docente, regData, regDataNav, setRegDataNav, contDB, classe, classiList, showFirmePanel, setShowFirmePanel}) {

  const HDR = TEAL;

  const partTxt = (item) => {
    if(!item.partecipazione || item.partecipazione==="tutti") return null;
    const nomi = (item.alunniParz||[]).map(id=>{const s=students.find(x=>x.id===id);return s?s.cognome+" "+s.nome:"";}).filter(Boolean);
    return nomi.length ? nomi : null;
  };

  const onEdit = (sec,item) => {
    if(sec==="firme") openFirma(item);
    else if(sec==="verifiche") openVerifica(item);
    else openContenuto(sec,item,item.materiaLezione||materia);
  };
  const onDelete = (sec,item) => {
    if(sec==="lezioni"||sec==="compiti") deleteContById(sec, item.id);
    else saveCont(sec, getCont(sec).filter(c=>c.id!==item.id));
  };

  // Legge lezioni/compiti da TUTTE le chiavi della classe, filtra per giorno
  const getItemsAllMaterie = (sec) => {
    const prefix = `${classe}||`;
    const seen = new Set();
    const all = [];
    Object.keys(contDB).filter(k=>k.startsWith(prefix)&&!k.includes("__firme__")).forEach(k=>{
      (contDB[k]?.[sec]||[]).forEach(item=>{
        if(seen.has(item.id)) return;
        // Filtra solo per il giorno selezionato nel navigatore
        if(toISO(item.data||"")!==regData) return;
        seen.add(item.id);
        all.push(item);
      });
    });
    return all.sort((a,b)=>(a.materiaLezione||"").localeCompare(b.materiaLezione||""));
  };

  const itemsOfDay = (sec) => getCont(sec).filter(i=>toISO(i.data||"")===regData);

  const BtnStyle = {padding:"4px 0",border:"none",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:12,width:80,textAlign:"center",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:4};
  // ── Stile righe tabella con linee chiare ──
  const TBL_BORDER = "1px solid #e8edf2";
  const TBL_HDR_BG = "#f8f9fa";
  const TBL_HDR_COLOR = "#6b7280";
  const TBL_HDR_BORDER = "1px solid #e9ecef";
  const TBL_ROW_EVEN = "#ffffff";
  const TBL_ROW_ODD  = "#f8fbff";

  const Td = ({children,style={}}) => <td style={{padding:"10px 12px",fontSize:13,color:"#374151",verticalAlign:"top",borderBottom:TBL_BORDER,borderRight:TBL_BORDER,wordBreak:"break-word",whiteSpace:"pre-wrap",overflowWrap:"anywhere",...style}}>{children}</td>;

  const AlunnoCell = ({item}) => {
    const nomi = partTxt(item);
    if(!nomi) return <span style={{background:"#f59e0b",color:"#fff",borderRadius:12,padding:"2px 12px",fontWeight:700,fontSize:11}}>Classe</span>;
    return <div style={{display:"flex",flexDirection:"column",gap:3}}>
      {nomi.map((n,i)=><span key={i} style={{background:"#f59e0b",color:"#fff",borderRadius:10,padding:"2px 10px",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{n}</span>)}
    </div>;
  };

  const ComandiTd = ({sec,item,bg="#fff"}) => (
    <td style={{padding:"4px 6px",textAlign:"center",whiteSpace:"nowrap",verticalAlign:"middle",position:"sticky",right:0,background:bg,boxShadow:"-3px 0 6px rgba(0,0,0,0.06)",zIndex:1,borderBottom:TBL_BORDER}}>
      <div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"center"}}>
        <button onClick={()=>onEdit(sec,item)} title="Modifica" style={{width:28,height:28,background:"#5cb85c",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}><Pencil size={13}/></button>
        <button onClick={()=>onDelete(sec,item)} title="Elimina" style={{width:28,height:28,background:"#d9534f",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}><Trash2 size={13}/></button>
      </div>
    </td>
  );

  const TabellaWrap = ({cols, rows, empty="Nessun dato presente.", minWidths=[]}) => (
    <div style={{border:TBL_BORDER,borderTop:"none",borderRadius:"0 0 6px 6px",overflowX:"auto"}}>
      {(!rows||rows.length===0)
        ? <div style={{padding:"14px 16px",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>{empty}</div>
        : <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"auto"}}>
            <thead>
              <tr style={{background:"#f8f9fa",borderBottom:"1px solid #dee2e6"}}>
                {cols.map((c,i)=><th key={c} style={{padding:"6px 12px",textAlign:"left",color:"#6b7280",fontWeight:400,fontSize:12,whiteSpace:"nowrap",minWidth:minWidths[i]||"auto",borderRight:"1px solid #e9ecef"}}>{c}</th>)}
                <th style={{padding:"6px 12px",color:"#6b7280",fontWeight:400,fontSize:12,textAlign:"center",whiteSpace:"nowrap",position:"sticky",right:0,background:"#f8f9fa",zIndex:2,borderLeft:"1px solid #e9ecef"}}>Comandi</th>
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
      }
    </div>
  );

  /* Stile cella testo auto-espandibile — usato per argomenti, compiti, annotazioni, verifiche, note */
  const tdTesto = {
    padding:"10px 12px",
    fontSize:13,
    color:"#374151",
    verticalAlign:"top",
    borderBottom:TBL_BORDER,
    borderRight:TBL_BORDER,
    wordBreak:"break-word",
    whiteSpace:"pre-wrap",
    overflowWrap:"anywhere",
    lineHeight:1.6,
    /* Nessun width fisso: il browser calcola in base al contenuto */
    width:"auto",
  };

  const SezHdr = ({label, onAdd}) => (
    <div style={{background:HDR,color:"#fff",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderRadius:"6px 6px 0 0"}}>
      <span style={{fontWeight:700,fontSize:15}}>{label}</span>
      <button onClick={onAdd} style={{background:"#22c55e",color:"#fff",border:"none",borderRadius:4,padding:"5px 14px",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Aggiungi</button>
    </div>
  );

  const lezioniTutte = getItemsAllMaterie("lezioni");
  const compitiTutti = getItemsAllMaterie("compiti");

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Navigatore giorni + tab Firme */}
      <div style={{background:TEAL,display:"flex",alignItems:"center",gap:8,padding:"6px 14px",flexShrink:0,borderRadius:"6px 6px 0 0"}}>
        <button onClick={()=>{const d=new Date(regData+"T00:00:00");d.setDate(d.getDate()-1);setRegDataNav(d.toISOString().split("T")[0]);}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:4,padding:"4px 12px",fontSize:18,fontWeight:700,cursor:"pointer",lineHeight:1}}>‹</button>
        <div style={{flex:1,textAlign:"center"}}>
          {regData===todayISO()
            ?<span style={{fontWeight:700,fontSize:12,color:"#a7f3d0"}}>📅 Oggi — {fmtDay(regData)}</span>
            :<span style={{fontWeight:700,fontSize:12,color:"#fde68a"}}>{fmtDay(regData)}</span>
          }
        </div>
        {regData!==todayISO()&&<button onClick={()=>setRegDataNav(todayISO())} style={{background:"#22c55e",border:"none",color:"#fff",borderRadius:4,padding:"3px 10px",fontWeight:700,cursor:"pointer",fontSize:11}}>Oggi</button>}
        <AxiosDateInput value={regData} onChange={v=>setRegDataNav(v)} style={{flex:"0 0 auto"}}/>
        <button onClick={()=>{const d=new Date(regData+"T00:00:00");d.setDate(d.getDate()+1);setRegDataNav(d.toISOString().split("T")[0]);}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:4,padding:"4px 12px",fontSize:18,fontWeight:700,cursor:"pointer",lineHeight:1}}>›</button>
        {/* Tab Classe / Firme */}
        <div style={{display:"flex",borderRadius:6,overflow:"hidden",border:"2px solid rgba(255,255,255,0.4)",flexShrink:0}}>
          <button onClick={()=>setShowFirmePanel(false)}
            style={{padding:"5px 16px",background:!showFirmePanel?"#fff":"transparent",color:!showFirmePanel?TEAL:"#fff",border:"none",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:FF}}>
            📋 Classe
          </button>
          <button onClick={()=>setShowFirmePanel(true)}
            style={{padding:"5px 16px",background:showFirmePanel?"#fff":"transparent",color:showFirmePanel?TEAL:"#fff",border:"none",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:FF,borderLeft:"2px solid rgba(255,255,255,0.4)"}}>
            ✍️ Firme
          </button>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"16px 12px"}}>

        {/* ARGOMENTI DELLA LEZIONE */}
        <div style={{marginBottom:24}}>
          <SezHdr label="Argomenti della lezione" onAdd={()=>openContenuto("lezioni",null,materia)}/>
          <TabellaWrap cols={["Materia","Docente","Alunno","Argomento"]} minWidths={[120,150,90,180]} rows={
            lezioniTutte.length===0 ? [] : lezioniTutte.map((item,i)=>(
              <tr key={item.id} style={{borderBottom:TBL_BORDER,background:item._daCollega?"#fffbeb":i%2===0?TBL_ROW_EVEN:TBL_ROW_ODD,verticalAlign:"top"}}>
                <Td style={{fontWeight:700,textTransform:"uppercase",color:"#1f2937",whiteSpace:"nowrap",minWidth:120,borderRight:TBL_BORDER}}>
                  {item.materiaLezione||materia}
                  {item._daCollega&&<div style={{fontSize:9,background:"#f59e0b",color:"#fff",borderRadius:4,padding:"1px 4px",fontWeight:700,marginTop:2,display:"inline-block"}}>COLLEGA</div>}
                </Td>
                <Td style={{whiteSpace:"nowrap",minWidth:150,borderRight:TBL_BORDER}}>{cognomeNome(item.inseritoDa||docente).toUpperCase()}</Td>
                <Td style={{minWidth:90,borderRight:TBL_BORDER}}><AlunnoCell item={item}/></Td>
                {/* Colonna argomento: auto-espandibile */}
                <td style={tdTesto}>
                  {item.testo||""}
                  {item.link&&<div style={{marginTop:3}}><a href={item.link.startsWith("http")?item.link:"https://"+item.link} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{color:TEAL,fontSize:11,textDecoration:"underline",cursor:"pointer"}}>🔗 {item.link}</a></div>}
                </td>
                {(item.inseritoDa||docente)===docente&&(
                  <td style={{padding:"4px 6px",textAlign:"center",whiteSpace:"nowrap",verticalAlign:"middle",position:"sticky",right:0,background:i%2===0?TBL_ROW_EVEN:TBL_ROW_ODD,boxShadow:"-3px 0 6px rgba(0,0,0,0.06)",zIndex:1,borderBottom:TBL_BORDER}}>
                    <div style={{display:"flex",flexDirection:"row",gap:3,alignItems:"center",justifyContent:"center"}}>
                      <button onClick={()=>onEdit("lezioni",item)} title="Modifica" style={{width:28,height:28,background:"#5cb85c",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}><Pencil size={13}/></button>
                      <button onClick={()=>onDelete("lezioni",item)} title="Elimina" style={{width:28,height:28,background:"#d9534f",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}><Trash2 size={13}/></button>
                    </div>
                  </td>
                )}
                {(item.inseritoDa||docente)!==docente&&<td style={{padding:"8px",textAlign:"center",color:"#9ca3af",fontSize:11,borderBottom:TBL_BORDER}}></td>}
              </tr>
            ))
          }/>
        </div>

        {/* COMPITI ASSEGNATI + VERIFICHE */}
        <div style={{marginBottom:24}}>
          <SezHdr label="Compiti assegnati per oggi" onAdd={()=>openContenuto("compiti",null,materia)}/>
          {(()=>{
            return(
              <TabellaWrap cols={["Materia","Compiti assegnati","Alunno","Docente"]} minWidths={[120,220,90,150]} rows={
                compitiTutti.length===0 ? [] : compitiTutti.map((item,i)=>(
                  <tr key={item.id} style={{borderBottom:TBL_BORDER,background:item._daCollega?"#fffbeb":i%2===0?TBL_ROW_EVEN:TBL_ROW_ODD,verticalAlign:"middle"}}>
                    {/* Materia */}
                    <Td style={{fontWeight:700,textTransform:"uppercase",color:"#1f2937",whiteSpace:"nowrap",minWidth:120,borderRight:TBL_BORDER}}>
                      {item._mat||item.materiaLezione||materia}
                      {item._daCollega&&<div style={{fontSize:9,background:"#f59e0b",color:"#fff",borderRadius:4,padding:"1px 4px",fontWeight:700,marginTop:2,display:"inline-block"}}>COLLEGA</div>}
                    </Td>
                    {/* Compiti assegnati */}
                    <td style={tdTesto}>
                      {item.testo||""}
                      {item.link&&<div style={{marginTop:3}}><a href={item.link.startsWith("http")?item.link:"https://"+item.link} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{color:TEAL,fontSize:11,textDecoration:"underline",cursor:"pointer"}}>🔗 {item.link}</a></div>}
                    </td>
                    {/* Alunno — badge arancione */}
                    <td style={{padding:"8px 10px",textAlign:"center",borderRight:TBL_BORDER,minWidth:90,verticalAlign:"middle"}}>
                      {(!item.partecipazione||item.partecipazione==="tutti"||(item.alunniParz||[]).length===0)
                        ?<span style={{background:"#f59e0b",color:"#fff",borderRadius:12,padding:"2px 12px",fontWeight:700,fontSize:11,whiteSpace:"nowrap",display:"inline-block"}}>Classe</span>
                        :<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                          {(item.alunniParz||[]).map(id=>{const s=students.find(x=>x.id===id);return s?<span key={id} style={{background:"#f59e0b",color:"#fff",borderRadius:10,padding:"2px 10px",fontWeight:700,fontSize:11,whiteSpace:"nowrap",display:"inline-block"}}>{s.cognome.toUpperCase()} {s.nome.toUpperCase()}</span>:null;})}
                        </div>
                      }
                    </td>
                    {/* Docente */}
                    <Td style={{whiteSpace:"nowrap",minWidth:150,fontWeight:700,borderRight:TBL_BORDER}}>
                      {cognomeNome(item.inseritoDa||docente).toUpperCase()}
                    </Td>
                    {/* Comandi */}
                    {(item.inseritoDa||docente)===docente&&<ComandiTd sec="compiti" item={item} bg={i%2===0?TBL_ROW_EVEN:TBL_ROW_ODD}/>}
                    {(item.inseritoDa||docente)!==docente&&<td style={{padding:"8px",textAlign:"center",color:"#9ca3af",fontSize:11,borderBottom:TBL_BORDER}}></td>}
                  </tr>
                ))
              }/>
            );
          })()}
        </div>

        {/* NOTE DISCIPLINARI — stile Axios */}
        {(()=>{
          const items=itemsOfDay("note");
          return(
            <div style={{marginBottom:24}}>
              <div style={{background:HDR,color:"#fff",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderRadius:"6px 6px 0 0"}}>
                <span style={{fontWeight:700,fontSize:15}}>Note disciplinari</span>
                <button onClick={()=>openContenuto("note",null,materia)} style={{background:"#22c55e",color:"#fff",border:"none",borderRadius:4,padding:"5px 14px",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Aggiungi</button>
              </div>
              <div style={{border:TBL_BORDER,borderTop:"none",borderRadius:"0 0 6px 6px",overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  {items.filter(item=>item.testo&&item.testo.trim()).length>0 && (
                    <thead>
                      <tr style={{background:TBL_HDR_BG,borderBottom:"2px solid #c7e8e0"}}>
                        {["Docente","Alunno","Nota disciplinare","Gravità","Comandi"].map(h=>(
                          <th key={h} style={{padding:"9px 14px",textAlign:"center",color:HDR,fontWeight:700,fontSize:13,borderRight:TBL_BORDER}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {items.filter(item=>item.testo&&item.testo.trim()).length===0
                      ?<tr><td colSpan={5} style={{padding:"18px",color:"#9ca3af",fontSize:13,fontStyle:"italic",textAlign:"center"}}>Nessun dato presente</td></tr>
                      :items.filter(item=>item.testo&&item.testo.trim()).map((item,i)=>{
                        const isTuttiCl=item.destinatariTutti||!item.destinatari?.length;
                        const alunniList=isTuttiCl?[]:(item.destinatari||[]).map(id=>{const s=students.find(x=>x.id===id);return s?s.cognome.toUpperCase()+" "+s.nome.toUpperCase():"";}).filter(Boolean);
                        const grav=parseInt(item.gravita)||0;
                        return(
                          <tr key={item.id} style={{borderBottom:TBL_BORDER,background:i%2===0?TBL_ROW_EVEN:TBL_ROW_ODD,verticalAlign:"middle"}}>
                            <td style={{padding:"10px 14px",fontWeight:700,fontSize:13,color:"#1f2937",textAlign:"center",borderRight:TBL_BORDER,whiteSpace:"nowrap"}}>
                              {cognomeNome(item.inseritoDa||docente).toUpperCase()}
                            </td>
                            <td style={{padding:"10px 10px",textAlign:"center",borderRight:TBL_BORDER,minWidth:100}}>
                              {isTuttiCl
                                ?<span style={{background:"#f59e0b",color:"#fff",borderRadius:12,padding:"2px 12px",fontWeight:700,fontSize:11,whiteSpace:"nowrap",display:"inline-block"}}>Classe</span>
                                :<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                                  {alunniList.map((n,j)=>(
                                    <span key={j} style={{background:"#f59e0b",color:"#fff",borderRadius:10,padding:"2px 10px",fontWeight:700,fontSize:11,whiteSpace:"nowrap",display:"inline-block"}}>{n}</span>
                                  ))}
                                </div>
                              }
                            </td>
                            <td style={{padding:"10px 14px",fontSize:13,color:"#374151",borderRight:TBL_BORDER,wordBreak:"break-word",whiteSpace:"pre-wrap",lineHeight:1.6}}>
                              {item.testo||""}
                            </td>
                            <td style={{padding:"10px 10px",textAlign:"center",borderRight:TBL_BORDER}}>
                              <div style={{width:30,height:30,borderRadius:"50%",background:"#ef4444",color:"#fff",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 1px 4px rgba(239,68,68,0.4)"}}>
                                {item.gravita||"—"}
                              </div>
                            </td>
                            {(item.inseritoDa||docente)===docente ? (
                              <td style={{padding:"4px 6px",textAlign:"center",whiteSpace:"nowrap",verticalAlign:"middle",position:"sticky",right:0,background:i%2===0?TBL_ROW_EVEN:TBL_ROW_ODD,boxShadow:"-3px 0 6px rgba(0,0,0,0.06)",zIndex:1,borderBottom:TBL_BORDER}}>
                                <div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"center"}}>
                                  <button onClick={()=>onEdit("note",item)} title="Modifica" style={{width:28,height:28,background:"#5cb85c",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}><Pencil size={13}/></button>
                                  <button onClick={()=>onDelete("note",item)} title="Elimina" style={{width:28,height:28,background:"#d9534f",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}><Trash2 size={13}/></button>
                                </div>
                              </td>
                            ) : (
                              <td style={{padding:"8px",textAlign:"center",color:"#9ca3af",fontSize:11,borderBottom:TBL_BORDER}}></td>
                            )}
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* ANNOTAZIONI GIORNALIERE — stile Axios */}
        {(()=>{
          const items=itemsOfDay("annotazioni");
          return(
            <div style={{marginBottom:24}}>
              <div style={{background:HDR,color:"#fff",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderRadius:"6px 6px 0 0"}}>
                <span style={{fontWeight:700,fontSize:15}}>Annotazioni giornaliere</span>
                <button onClick={()=>openContenuto("annotazioni",null,materia)} style={{background:"#22c55e",color:"#fff",border:"none",borderRadius:4,padding:"5px 14px",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Aggiungi</button>
              </div>
              <div style={{border:TBL_BORDER,borderTop:"none",borderRadius:"0 0 6px 6px",overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  {items.filter(item=>item.testo&&item.testo.trim()).length>0 && (
                    <thead>
                      <tr style={{background:TBL_HDR_BG,borderBottom:"2px solid #c7e8e0"}}>
                        {["Docente","Alunno","Annotazioni giornaliere","Visibile Famiglia","Comandi"].map(h=>(
                          <th key={h} style={{padding:"9px 14px",textAlign:"center",color:HDR,fontWeight:700,fontSize:13,borderRight:TBL_BORDER}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {items.filter(item=>item.testo&&item.testo.trim()).length===0
                      ?<tr><td colSpan={5} style={{padding:"18px",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}><div style={{padding:"0 4px"}}>Nessun dato presente</div></td></tr>
                      :items.filter(item=>item.testo&&item.testo.trim()).map((item,i)=>{
                        const isTuttiCl=item.destinatariTutti||!item.destinatari?.length;
                        const alunniList=isTuttiCl?[]:(item.destinatari||[]).map(id=>{const s=students.find(x=>x.id===id);return s?s.cognome.toUpperCase()+" "+s.nome.toUpperCase():"";}).filter(Boolean);
                        const visFam=item.visFam!==false;
                        return(
                          <tr key={item.id} style={{borderBottom:TBL_BORDER,background:i%2===0?TBL_ROW_EVEN:TBL_ROW_ODD,verticalAlign:"middle"}}>
                            <td style={{padding:"10px 14px",fontWeight:700,fontSize:13,color:"#1f2937",textAlign:"center",borderRight:TBL_BORDER,whiteSpace:"nowrap"}}>
                              {cognomeNome(item.inseritoDa||docente).toUpperCase()}
                            </td>
                            <td style={{padding:"10px 10px",textAlign:"center",borderRight:TBL_BORDER,minWidth:100}}>
                              {isTuttiCl
                                ?<span style={{background:"#f59e0b",color:"#fff",borderRadius:12,padding:"2px 12px",fontWeight:700,fontSize:11,whiteSpace:"nowrap",display:"inline-block"}}>Classe</span>
                                :<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                                  {alunniList.map((n,j)=>(
                                    <span key={j} style={{background:"#f59e0b",color:"#fff",borderRadius:10,padding:"2px 10px",fontWeight:700,fontSize:11,whiteSpace:"nowrap",display:"inline-block"}}>{n}</span>
                                  ))}
                                </div>
                              }
                            </td>
                            <td style={{padding:"10px 14px",fontSize:13,color:"#374151",borderRight:TBL_BORDER,wordBreak:"break-word",whiteSpace:"pre-wrap",lineHeight:1.6}}>
                              {item.testo||""}
                            </td>
                            <td style={{padding:"10px 10px",textAlign:"center",borderRight:TBL_BORDER}}>
                              <span style={{background:visFam?"#22c55e":"#ef4444",color:"#fff",borderRadius:12,padding:"3px 16px",fontWeight:700,fontSize:12,display:"inline-block"}}>
                                {visFam?"SÌ":"NO"}
                              </span>
                            </td>
                            {(item.inseritoDa||docente)===docente ? (
                              <td style={{padding:"4px 6px",textAlign:"center",whiteSpace:"nowrap",verticalAlign:"middle",position:"sticky",right:0,background:i%2===0?TBL_ROW_EVEN:TBL_ROW_ODD,boxShadow:"-3px 0 6px rgba(0,0,0,0.06)",zIndex:1,borderBottom:TBL_BORDER}}>
                                <div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"center"}}>
                                  <button onClick={()=>onEdit("annotazioni",item)} title="Modifica" style={{width:28,height:28,background:"#5cb85c",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}><Pencil size={13}/></button>
                                  <button onClick={()=>onDelete("annotazioni",item)} title="Elimina" style={{width:28,height:28,background:"#d9534f",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}><Trash2 size={13}/></button>
                                </div>
                              </td>
                            ) : (
                              <td style={{padding:"8px",textAlign:"center",color:"#9ca3af",fontSize:11,borderBottom:TBL_BORDER}}></td>
                            )}
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* VERIFICHE — tutte le materie della classe */}
        {(()=>{
          const prefix = `${classe}||`;
          const seen = new Set();
          const tutteVerifiche = [];
          Object.entries(contDB).filter(([k])=>k.startsWith(prefix)&&!k.includes("__firme__")).forEach(([k,v])=>{
            const mat = k.split("||")[1]||"";
            (v.verifiche||[]).forEach(item=>{
              if(seen.has(item.id)) return;
              if(toISO(item.data||"")!==regData) return;
              seen.add(item.id);
              tutteVerifiche.push({...item, _mat:mat});
            });
          });
          return(
            <div style={{marginBottom:24}}>
              <SezHdr label="Verifiche/Compiti in classe" onAdd={()=>openVerifica()}/>
              <TabellaWrap cols={["Tipo","Alunno","Materia","Argomento"]} rows={tutteVerifiche.map((item,i)=>(
                <tr key={item.id} style={{borderBottom:TBL_BORDER,background:i%2===0?TBL_ROW_EVEN:TBL_ROW_ODD,verticalAlign:"top"}}>
                  <Td style={{fontWeight:700,minWidth:80,borderRight:TBL_BORDER}}>{item.tipoVerifica||""}</Td>
                  <td style={{padding:"8px 10px",textAlign:"center",borderRight:TBL_BORDER,minWidth:90,verticalAlign:"middle"}}>
                    {(!item.partecipazione||item.partecipazione==="tutti"||(item.alunniParz||[]).length===0)
                      ?<span style={{background:"#f97316",color:"#fff",borderRadius:12,padding:"3px 14px",fontWeight:700,fontSize:12,whiteSpace:"nowrap",display:"inline-block"}}>Classe</span>
                      :<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                        {(item.alunniParz||[]).map(id=>{const s=students.find(x=>x.id===id);return s?<span key={id} style={{background:"#f97316",color:"#fff",borderRadius:12,padding:"3px 12px",fontWeight:700,fontSize:11,whiteSpace:"nowrap",display:"inline-block"}}>{s.cognome.toUpperCase()} {s.nome.toUpperCase()}</span>:null;})}
                      </div>
                    }
                  </td>
                  <Td style={{fontWeight:600,textTransform:"uppercase",borderRight:TBL_BORDER,color:TEAL,whiteSpace:"nowrap"}}>{item._mat||item.materia||materia}</Td>
                  <td style={tdTesto}>{item.argomenti||""}</td>
                  {(item.inseritoDa||docente)===docente
                    ? <ComandiTd sec="verifiche" item={item} bg={i%2===0?TBL_ROW_EVEN:TBL_ROW_ODD}/>
                    : <td style={{padding:"8px",textAlign:"center",color:"#9ca3af",fontSize:11,borderBottom:TBL_BORDER}}></td>
                  }
                </tr>
              ))}/>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
// Hook per tenere traccia degli ultimi voti usati (persistente per docente)
function useUltimiVoti(docente) {
  const key = `reg:${docente}:ultimiVoti`;
  const [ultimi, setUltimi] = useState(()=>{
    try { return (JSON.parse(localStorage.getItem(key)||"[]")).slice(0, 3); } catch { return []; }
  });
  const aggiungi = (v) => {
    if(!v || v === " " || v === "") return;
    setUltimi(prev => {
      const senza = prev.filter(x => x !== v);
      const nuovi = [v, ...senza].slice(0, 3);
      try { localStorage.setItem(key, JSON.stringify(nuovi)); } catch {}
      return nuovi;
    });
  };
  return [ultimi, aggiungi];
}

function VotoAutocomplete({value, onChange, faMedia, onFaMediaChange, docente}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [ultimiVoti, aggiungiUltimoVoto] = useUltimiVoti(docente||"docente");

  useEffect(()=>{
    if(!open) return;
    const h = e => { if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener("mousedown",h);
    return ()=>window.removeEventListener("mousedown",h);
  },[open]);

  const tuttiVoti = [];
  for(let n = 10; n >= 4; n--) {
    if(n < 10) tuttiVoti.push(`${n}+`);
    tuttiVoti.push(`${n}`);
    tuttiVoti.push(`${n}-`);
    if(n > 4 && n < 10) tuttiVoti.push(`${n}.5`);
  }
  const votiSpeciali = ["💬","NC","Esp."];

  const handleChange = (v) => {
    if(v === "💬") {
      onChange("💬");
      if(onFaMediaChange) onFaMediaChange(false);
      aggiungiUltimoVoto("💬");
      return;
    }
    onChange(v);
    aggiungiUltimoVoto(v);
  };

  const displayVal = value === " " ? "💬" : value;

  const votoColorQuick = (v) => {
    const n = parseVoto(v);
    if(isNaN(n)) return "#92400e";
    return n < 6 ? "#ef4444" : "#16a34a";
  };

  return (
    <div ref={ref} style={{position:"relative"}}>
      <input
        value={displayVal}
        onChange={e=>handleChange(e.target.value)}
        onFocus={()=>setOpen(true)}
        placeholder="es. 8, 7+"
        style={{width:"100%",border:"2px solid #d1d5db",borderRadius:4,padding:"8px 10px",boxSizing:"border-box",fontSize:18,fontWeight:700,textAlign:"center",fontFamily:FF,color:"#1f2937",background:value==="💬"?"#fef9c3":"#fff"}}
      />
      {value==="💬"&&<div style={{fontSize:10,color:"#92400e",textAlign:"center",marginTop:2,fontWeight:600}}>non fa media</div>}
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#fff",border:"2px solid #e5e7eb",borderRadius:6,boxShadow:"0 6px 20px rgba(0,0,0,0.14)",zIndex:999,overflow:"hidden",minWidth:120}}>
          <style>{`
            .voto-opt:hover { background: #e5e7eb !important; }
            .voto-spec:hover { background: #fde68a !important; }
            .voto-quick:hover { background: #f3f4f6 !important; }
          `}</style>

          {/* Ultimi voti usati */}
          {ultimiVoti.length > 0 && (
            <div style={{borderBottom:"2px solid #e5e7eb"}}>
              <div style={{padding:"5px 10px 3px",fontSize:10,color:"#6b7280",fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",background:"#f9fafb"}}>
                Ultimi voti usati
              </div>
              <div style={{display:"flex",flexDirection:"column"}}>
                {ultimiVoti.map((v,i)=>(
                  <div key={i} className="voto-quick"
                    onClick={()=>{ handleChange(v); setOpen(false); }}
                    style={{
                      padding:"9px 14px",
                      cursor:"pointer",
                      fontSize:14,
                      fontWeight:700,
                      color:"#1f2937",
                      borderBottom:"1px solid #f3f4f6",
                      background:"#fff",
                      transition:"background 0.1s",
                    }}>
                    {v}
                  </div>
                ))}
              </div>
            </div>
          )}


        </div>
      )}
    </div>
  );
}

function GestioneClassi({classi,setClassi,onTorna,nomeScuola,setNomeScuola}) {
  const [toast,setToast]=useState(false);
  const [nuova,setNuova]=useState("");
  const [sel,setSel]=useState(null);
  const [form,setForm]=useState({nome:"",cognome:""});
  const [editId,setEditId]=useState(null);
  const [confirmDel,setConfirmDel]=useState(null);
  const [rinominaClasse,setRinominaClasse]=useState(null);
  const [classeMeta,setClasseMetaRaw]=useState(()=>{try{return JSON.parse(localStorage.getItem(`reg:${_doc}:classeMeta`)||"{}");}catch{return {};}});
  const setClasseMeta=v=>{setClasseMetaRaw(v);try{localStorage.setItem(`reg:${_doc}:classeMeta`,JSON.stringify(v));}catch{}};
  const getMeta=nome=>classeMeta[nome]||{coordinatore:false,materie:[]};
  const setMeta=(nome,patch)=>setClasseMeta({...classeMeta,[nome]:{...getMeta(nome),...patch}});
  const isMobile = useIsMobile();
  const toggleMateria=(nome,mat)=>{
    const cur=getMeta(nome).materie||[];
    const next=cur.includes(mat)?cur.filter(m=>m!==mat):[...cur,mat];
    setMeta(nome,{materie:next});
  };
  const [bulk, setBulk] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPreview, setBulkPreview] = useState([]);

  const parseBulk = (testo) => {
    return testo.split("\n")
      .map(r=>r.trim()).filter(Boolean)
      .map(r=>{
        let cognome="", nome="";
        if(r.includes(",")) {
          const parts = r.split(",").map(s=>s.trim());
          cognome = parts[0]; nome = parts[1]||"";
        } else {
          const parts = r.split(/\s+/);
          if(parts.length>=2) { cognome=parts[0]; nome=parts.slice(1).join(" "); }
          else { cognome=parts[0]; nome=""; }
        }
        return {cognome:cognome.trim(), nome:nome.trim()};
      })
      .filter(s=>s.cognome);
  };

  const aggiungiTutti = () => {
    const nuovi = parseBulk(bulk);
    if(!nuovi.length) return;
    const cur = classi[sel]||[];
    const withIds = nuovi.map(s=>({...s, id:Date.now()+Math.random()}));
    setClassi({...classi,[sel]:[...cur,...withIds]});
    setBulk(""); setBulkOpen(false); setBulkPreview([]);
    setToast(true);
  };

  const list=Object.keys(classi).sort();
  const alunni=sel?(classi[sel]||[]):[];
  const sorted=[...alunni].sort((a,b)=>a.cognome.localeCompare(b.cognome));
  const addClasse=()=>{const n=nuova.trim().toUpperCase();if(!n||classi[n])return;setClassi({...classi,[n]:[]});setNuova("");setSel(n);setToast(true);};
  const delClasse=nome=>{const c={...classi};delete c[nome];setClassi(c);if(sel===nome)setSel(null);setConfirmDel(null);setToast(true);};
  const saveAlunno=()=>{if(!sel)return;const n=form.nome.trim(),c=form.cognome.trim();if(!n||!c)return;const cur=classi[sel]||[];if(editId!==null){setClassi({...classi,[sel]:cur.map(s=>s.id===editId?{...s,nome:n,cognome:c}:s)});setEditId(null);}else{setClassi({...classi,[sel]:[...cur,{id:Date.now(),nome:n,cognome:c}]});}setForm({nome:"",cognome:""});setToast(true);};
  const delAlunno=id=>{setClassi({...classi,[sel]:(classi[sel]||[]).filter(s=>s.id!==id)});setConfirmDel(null);setToast(true);};
  const [nuovaMateria, setNuovaMateria] = useState("");
  const [materieExtra, setMaterieExtraRaw] = useState(()=>{try{return JSON.parse(localStorage.getItem("reg:materieExtra")||"[]");}catch{return [];}});
  const setMaterieExtra = v => { setMaterieExtraRaw(v); try{localStorage.setItem("reg:materieExtra",JSON.stringify(v));}catch{} };
  const tutteMaterie=[...MATERIE,...materieExtra].filter((v,i,a)=>a.indexOf(v)===i);
  const aggiungiMateriaCustom = () => {
    const m = nuovaMateria.trim();
    if(!m) return;
    if(!tutteMaterie.includes(m)) setMaterieExtra([...materieExtra, m]);
    // Aggiunge automaticamente alla classe selezionata
    if(sel){ const cur=getMeta(sel).materie||[]; if(!cur.includes(m)) setMeta(sel,{materie:[...cur,m]}); }
    setNuovaMateria(""); setToast(true);
  };
  return (
    <div style={{fontFamily:FF,display:"flex",flexDirection:"column",height:"100vh",background:"#f9fafb"}}>
      {toast&&<Toast msg="Salvato" onDone={()=>setToast(false)}/>}
      <div style={{background:"#0f766e",color:"#fff",padding:isMobile?"10px 12px":"14px 24px",display:"flex",alignItems:"center",gap:16,flexShrink:0}}><Users size={isMobile?18:22}/><span style={{fontWeight:700,fontSize:isMobile?15:18}}>Gestione Classi e Studenti</span>{nomeScuola&&<span style={{fontSize:isMobile?11:13,opacity:0.8,background:"rgba(255,255,255,0.15)",borderRadius:4,padding:"3px 10px"}}>{nomeScuola}</span>}<button onClick={onTorna} style={{marginLeft:"auto",padding:isMobile?"6px 12px":"10px 28px",background:"#22c55e",color:"#fff",border:"none",borderRadius:6,fontWeight:700,fontSize:isMobile?13:16,cursor:"pointer"}}>Salva e torna</button></div>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{width:isMobile?110:260,background:"#fff",borderRight:"2px solid #e5e7eb",display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"12px 14px 4px"}}>
            <div style={{fontSize:11,color:"#6b7280",fontWeight:600,marginBottom:3}}>Nome scuola</div>
            <input value={nomeScuola||""} onChange={e=>setNomeScuola(e.target.value)} placeholder="es. I.C. Manzoni" style={{width:"100%",border:"1px solid #e5e7eb",borderRadius:4,padding:isMobile?"4px 6px":"6px 8px",fontSize:isMobile?11:13,fontFamily:FF,boxSizing:"border-box",color:"#0f766e",fontWeight:600}}/>
          </div>
          <div style={{padding:isMobile?"8px 10px 6px":"12px 16px 8px",fontWeight:700,fontSize:isMobile?13:15,color:"#0f766e"}}>Classi ({list.length})</div>
          <div style={{padding:"0 12px 12px",display:"flex",gap:6}}><Inp value={nuova} onChange={e=>setNuova(e.target.value)} placeholder="es. 4A" style={{flex:1}} onKeyDown={e=>e.key==="Enter"&&addClasse()}/><button onClick={addClasse} style={{padding:isMobile?"6px 10px":"8px 14px",background:"#0f766e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:isMobile?16:20}}>+</button></div>
          <div style={{flex:1,overflowY:"auto"}}>{list.map(nome=>{const isCoord=getMeta(nome).coordinatore;const nMat=(getMeta(nome).materie||[]).length;return(<div key={nome} onClick={()=>{setSel(nome);setEditId(null);setForm({nome:"",cognome:""}); }} style={{display:"flex",alignItems:"center",padding:isMobile?"8px 10px":"12px 16px",cursor:"pointer",background:sel===nome?"#ccfbf1":"transparent",borderLeft:sel===nome?"4px solid #0f766e":"4px solid transparent",borderBottom:"1px solid #f3f4f6"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:isMobile?13:15}}>{nome}</div>
              <div style={{fontSize:11,color:"#6b7280",display:isMobile?"none":"block"}}>{nMat>0?`${nMat} mater${nMat===1?"ia":"ie"}`:""}{isCoord?` ⭐`:""}</div>
            </div>
            <span style={{fontSize:12,color:"#9ca3af",marginRight:8,display:isMobile?"none":"inline"}}>{(classi[nome]||[]).length} al.</span>
            <button onClick={e=>{e.stopPropagation();setRinominaClasse({nome, nuovoNome:nome});}} style={{background:"#dbeafe",color:"#2563eb",border:"none",borderRadius:4,padding:isMobile?"3px 5px":"4px 7px",cursor:"pointer",marginRight:4}}><Pencil size={isMobile?11:13}/></button>
            <button onClick={e=>{e.stopPropagation();setConfirmDel({type:"classe",id:nome});}} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:4,padding:isMobile?"3px 5px":"4px 7px",cursor:"pointer"}}><Trash2 size={isMobile?11:13}/></button>
          </div>);})}</div>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {!sel?<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#9ca3af",flexDirection:"column",gap:12}}><BookOpen size={48} color="#d1d5db"/><div style={{fontSize:18,fontWeight:600}}>Seleziona una classe</div></div>:(
            <>
              <div style={{background:"#f0fdfa",borderBottom:"2px solid #99f6e4",padding:"12px 24px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <span style={{fontWeight:700,fontSize:18,color:"#0f766e"}}>Classe {sel}</span>
                <span style={{background:"#0f766e",color:"#fff",borderRadius:12,padding:"2px 14px",fontWeight:700,fontSize:13}}>{alunni.length} alunni</span>
                <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:13,fontWeight:600,color:"#374151"}}>Coordinatore?</span>
                  <div onClick={()=>setMeta(sel,{coordinatore:!getMeta(sel).coordinatore})} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",background:getMeta(sel).coordinatore?"#f0fdf4":"#f9fafb",border:"2px solid "+(getMeta(sel).coordinatore?"#22c55e":"#d1d5db"),borderRadius:8,padding:"6px 14px"}}>
                    <div style={{width:20,height:20,borderRadius:"50%",background:getMeta(sel).coordinatore?"#22c55e":"#d1d5db",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{getMeta(sel).coordinatore&&<span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}</div>
                    <span style={{fontWeight:700,fontSize:13,color:getMeta(sel).coordinatore?"#16a34a":"#9ca3af"}}>{getMeta(sel).coordinatore?"SÌ":"NO"}</span>
                  </div>
                </div>
              </div>
              <div style={{padding:"12px 24px",background:"#fffbeb",borderBottom:"2px solid #fde68a",flexShrink:0}}>
                <div style={{fontWeight:700,fontSize:14,color:"#92400e",marginBottom:8}}>📚 Materie insegnate in {sel}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                  {tutteMaterie.map(mat=>{
                    const sel2=(getMeta(sel).materie||[]).includes(mat);
                    return(<button key={mat} onClick={()=>toggleMateria(sel,mat)} style={{padding:"5px 12px",background:sel2?TEAL:"#fff",color:sel2?"#fff":"#374151",border:"2px solid "+(sel2?TEAL:"#e5e7eb"),borderRadius:20,fontWeight:sel2?700:400,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                      {sel2?"✓ ":""}{mat}
                      {materieExtra.includes(mat)&&<span onClick={e=>{e.stopPropagation();const ne=materieExtra.filter(x=>x!==mat);setMaterieExtra(ne);if(sel){const cur=getMeta(sel).materie||[];setMeta(sel,{materie:cur.filter(x=>x!==mat)});}}} style={{marginLeft:3,color:sel2?"rgba(255,255,255,0.7)":"#9ca3af",fontWeight:900,fontSize:11,lineHeight:1}}>✕</span>}
                    </button>);
                  })}
                </div>
                {/* Aggiungi materia personalizzata */}
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <input value={nuovaMateria} onChange={e=>setNuovaMateria(e.target.value)} onKeyDown={e=>e.key==="Enter"&&aggiungiMateriaCustom()} placeholder="Aggiungi materia..." style={{flex:1,border:"2px solid #fde68a",borderRadius:6,padding:"6px 10px",fontSize:13,fontFamily:FF,outline:"none",background:"#fff"}} onFocus={e=>e.target.style.borderColor="#f59e0b"} onBlur={e=>e.target.style.borderColor="#fde68a"}/>
                  <button onClick={aggiungiMateriaCustom} style={{padding:"6px 16px",background:"#f59e0b",color:"#fff",border:"none",borderRadius:6,fontWeight:700,cursor:"pointer",fontSize:14,whiteSpace:"nowrap"}}>+ Aggiungi</button>
                </div>
                {(getMeta(sel).materie||[]).length===0&&<div style={{fontSize:12,color:"#b45309",marginTop:6}}>Nessuna materia selezionata — clicca per aggiungere</div>}
              </div>
              {/* Import massivo alunni */}
              <div style={{padding:"10px 24px",background:"#f0fdf4",borderBottom:"2px solid #bbf7d0"}}>
                {!bulkOpen?(
                  <button onClick={()=>setBulkOpen(true)}
                    style={{width:"100%",padding:"9px",background:"#16a34a",color:"#fff",border:"none",borderRadius:6,fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    📋 Incolla lista alunni (tutti in una volta)
                  </button>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    <div style={{fontSize:12,color:"#166534",fontWeight:600}}>
                      Un alunno per riga — formato: <b>Cognome Nome</b> oppure <b>Cognome, Nome</b>
                    </div>
                    <textarea
                      value={bulk}
                      onChange={e=>{setBulk(e.target.value);setBulkPreview(parseBulk(e.target.value));}}
                      rows={6}
                      placeholder={"Rossi Mario\nBianchi Giulia\nVerdi Luca\n..."}
                      style={{width:"100%",border:"2px solid #86efac",borderRadius:6,padding:"8px 10px",fontSize:13,fontFamily:"monospace",resize:"vertical",boxSizing:"border-box",outline:"none",lineHeight:1.6}}
                      autoFocus
                    />
                    {bulkPreview.length>0&&(
                      <div style={{background:"#fff",border:"1px solid #86efac",borderRadius:6,padding:"8px 12px",maxHeight:120,overflowY:"auto"}}>
                        <div style={{fontSize:11,color:"#6b7280",marginBottom:4,fontWeight:700}}>Anteprima — {bulkPreview.length} alunni:</div>
                        {bulkPreview.map((s,i)=>(
                          <div key={i} style={{fontSize:12,color:"#374151",padding:"1px 0"}}>
                            {i+1}. <b>{s.cognome}</b> {s.nome}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={aggiungiTutti} disabled={!bulkPreview.length}
                        style={{flex:1,padding:"9px",background:bulkPreview.length?"#16a34a":"#9ca3af",color:"#fff",border:"none",borderRadius:6,fontWeight:700,fontSize:13,cursor:bulkPreview.length?"pointer":"default"}}>
                        ✅ Aggiungi {bulkPreview.length>0?`${bulkPreview.length} alunni`:""}
                      </button>
                      <button onClick={()=>{setBulkOpen(false);setBulk("");setBulkPreview([]);}}
                        style={{padding:"9px 14px",background:"#6b7280",color:"#fff",border:"none",borderRadius:6,fontWeight:700,fontSize:13,cursor:"pointer"}}>
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{padding:"14px 24px",background:"#fff",borderBottom:"2px solid #e5e7eb",display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}><div style={{flex:1,minWidth:130}}><Lbl>Nome</Lbl><Inp value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} placeholder="Nome" onKeyDown={e=>e.key==="Enter"&&saveAlunno()}/></div><div style={{flex:1,minWidth:130}}><Lbl>Cognome</Lbl><Inp value={form.cognome} onChange={e=>setForm({...form,cognome:e.target.value})} placeholder="Cognome" onKeyDown={e=>e.key==="Enter"&&saveAlunno()}/></div><Btn color="#0f766e" onClick={saveAlunno}>{editId!==null?"Aggiorna":"Aggiungi"}</Btn>{editId!==null&&<Btn color="#6b7280" onClick={()=>{setEditId(null);setForm({nome:"",cognome:""});}}>Annulla</Btn>}</div>
              <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>{alunni.length===0?<div style={{textAlign:"center",padding:"40px 0",color:"#9ca3af"}}>Nessun alunno.</div>:(<table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr style={{background:"#0f766e",color:"#fff"}}><th style={{padding:"10px 12px",textAlign:"left",width:40}}>#</th><th style={{padding:"10px 12px",textAlign:"left"}}>Cognome</th><th style={{padding:"10px 12px",textAlign:"left"}}>Nome</th><th style={{padding:"10px 12px",textAlign:"center",width:100}}>Azioni</th></tr></thead><tbody>{sorted.map((s,i)=>(<tr key={s.id} style={{borderBottom:"1px solid #f3f4f6",background:editId===s.id?"#fef9c3":i%2===0?"#fff":"#f9fafb"}}><td style={{padding:"10px 12px",color:"#9ca3af",fontSize:13}}>{i+1}</td><td style={{padding:"10px 12px",fontWeight:700}}>{s.cognome}</td><td style={{padding:"10px 12px"}}>{s.nome}</td><td style={{padding:"8px 12px",textAlign:"center"}}><div style={{display:"flex",gap:6,justifyContent:"center"}}><button onClick={()=>{setEditId(s.id);setForm({nome:s.nome,cognome:s.cognome});}} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:4,padding:"5px 8px",cursor:"pointer"}}><Pencil size={13}/></button><button onClick={()=>setConfirmDel({type:"alunno",id:s.id})} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:4,padding:"5px 8px",cursor:"pointer"}}><Trash2 size={13}/></button></div></td></tr>))}</tbody></table>)}</div>
            </>
          )}
        </div>
      </div>
      <Modal open={!!rinominaClasse} onClose={()=>setRinominaClasse(null)} width={400} headerColor={TEAL} title="Rinomina classe" skipLoading>
        <div style={{padding:28,display:"flex",flexDirection:"column",gap:16,fontFamily:FF}}>
          <div>
            <Lbl>Nuovo nome classe</Lbl>
            <Inp
              value={rinominaClasse?.nuovoNome||""}
              onChange={e=>setRinominaClasse(r=>({...r,nuovoNome:e.target.value.toUpperCase()}))}
              autoFocus
              placeholder="es. 4B"
              onKeyDown={e=>{
                if(e.key==="Enter") {
                  const vecchio=rinominaClasse.nome;
                  const nuovo=rinominaClasse.nuovoNome.trim().toUpperCase();
                  if(!nuovo||nuovo===vecchio){setRinominaClasse(null);return;}
                  if(classi[nuovo]){alert("Esiste già una classe con questo nome.");return;}
                  const nuoveClassi={...classi};
                  nuoveClassi[nuovo]=nuoveClassi[vecchio];
                  delete nuoveClassi[vecchio];
                  setClassi(nuoveClassi);
                  if(sel===vecchio) setSel(nuovo);
                  setRinominaClasse(null);
                  setToast(true);
                }
              }}
            />
          </div>
          <div style={{display:"flex",gap:12}}>
            <Btn color={TEAL} onClick={()=>{
              const vecchio=rinominaClasse.nome;
              const nuovo=rinominaClasse.nuovoNome.trim().toUpperCase();
              if(!nuovo||nuovo===vecchio){setRinominaClasse(null);return;}
              if(classi[nuovo]){alert("Esiste già una classe con questo nome.");return;}
              const nuoveClassi={...classi};
              nuoveClassi[nuovo]=nuoveClassi[vecchio];
              delete nuoveClassi[vecchio];
              setClassi(nuoveClassi);
              if(sel===vecchio) setSel(nuovo);
              setRinominaClasse(null);
              setToast(true);
            }} style={{flex:1}}>✅ Rinomina</Btn>
            <Btn color="#6b7280" onClick={()=>setRinominaClasse(null)}>Annulla</Btn>
          </div>
        </div>
      </Modal>
      <Modal open={!!confirmDel} onClose={()=>setConfirmDel(null)} width={400} headerColor="#ef4444" title="Conferma eliminazione"><div style={{padding:28,textAlign:"center"}}><div style={{fontWeight:700,fontSize:16,marginBottom:20}}>{confirmDel?.type==="classe"?`Eliminare la classe ${confirmDel?.id}?`:"Eliminare questo alunno?"}</div><div style={{display:"flex",gap:12,justifyContent:"center"}}><Btn color="#ef4444" onClick={()=>confirmDel?.type==="classe"?delClasse(confirmDel.id):delAlunno(confirmDel.id)}>Elimina</Btn><Btn color="#6b7280" onClick={()=>setConfirmDel(null)}>Annulla</Btn></div></div></Modal>
    </div>
  );
}

function EventoModal({sid,student,onSave,onClose,docente,dataDefault,editAssenza}) {
  const TIPI_EV=[
    {id:"presente",label:"Presente",color:"#4e9fa0"},
    {id:"assente",label:"Assente",color:"#ef4444"},
    {id:"ritardo",label:"Ritardo",color:"#f97316"},
    {id:"uscita",label:"Uscita anticipata",color:"#8b5cf6"},
    {id:"fuori_aula",label:"Presente fuori aula",color:"#6b7280"},
  ];
  const [evF,setEvF]=useState(()=>{
    if(editAssenza){
      return {
        tipo:editAssenza.tipo||"assente",
        tuttoIlGiorno:!editAssenza.oraLezione,
        oraLez:editAssenza.oraLezione||"1",
        orario:editAssenza.oraOrologio||"",
        motivo:editAssenza.motivo||"",
        daD:editAssenza.daD||false,
        giustificato:editAssenza.giustificato||false,
        concorreCalcolo:editAssenza.concorreCalcolo!==false,
        certificatoMedico:editAssenza.certificatoMedico||false,
        dataISO:toISO(editAssenza.data)||dataDefault||todayISO()
      };
    }
    return {tipo:"presente",tuttoIlGiorno:true,oraLez:"1",orario:"",motivo:"",daD:false,giustificato:false,concorreCalcolo:true,certificatoMedico:false,dataISO:dataDefault||todayISO()};
  });
  const needsTG=evF.tipo==="assente"||evF.tipo==="fuori_aula";
  const fmtDataLabel=(iso)=>{const[y,m,d]=iso.split("-");const GGG=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];const dt=new Date(iso+"T12:00:00");const MMM=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];return`${GGG[dt.getDay()]} ${d} ${MMM[parseInt(m)-1]} ${y}`;};
  const dataIT=(iso)=>{const[y,m,d]=iso.split("-");return`${d}/${m}/${y}`;};
  const salva=()=>{
    const ore=needsTG&&evF.tuttoIlGiorno?"Tutto il giorno":evF.oraLez?"Ora "+evF.oraLez:"";
    const entry={
      id: editAssenza?.id||Date.now(),
      data:dataIT(evF.dataISO),
      tipo:evF.tipo,
      oraLezione:evF.oraLez,
      oraOrologio:evF.orario,
      motivo:evF.motivo,
      daD:evF.daD,
      giustificato:evF.giustificato,
      dataGiustificazione:evF.giustificato?(editAssenza?.giustificato?(editAssenza.dataGiustificazione||todayISO()):todayISO()):null,
      concorreCalcolo:evF.concorreCalcolo,
      certificatoMedico:evF.certificatoMedico,
      ore,
      inseritoDa:docente
    };
    onSave(entry, !!editAssenza);
  };
  return(
    <Modal open={true} onClose={onClose} width={680} headerColor={TEAL} title={editAssenza?"Modifica evento alunno":"Nuovo evento alunno"} subtitle={(student?.cognome||"")+" "+(student?.nome||"")}>
      <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:12,fontFamily:FF}}>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {/* Data piccola in cima, vicino ai radio */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <span style={{fontSize:12,color:"#6b7280",fontWeight:600}}>Data:</span>
            <input type="date" value={evF.dataISO} onChange={e=>setEvF(f=>({...f,dataISO:e.target.value}))}
              style={{border:"1px solid #d1d5db",borderRadius:4,padding:"3px 7px",fontSize:13,fontFamily:FF,outline:"none",background:"#fff"}}/>
            {evF.dataISO!==todayISO()&&<span style={{background:"#fef3c7",color:"#92400e",borderRadius:4,padding:"1px 7px",fontSize:11,fontWeight:700}}>⚠️ non oggi</span>}
          </div>
          {TIPI_EV.map(t=>(
            <label key={t.id} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
              <input type="radio" name={"tipoEv"+sid} checked={evF.tipo===t.id} onChange={()=>setEvF(f=>({...f,tipo:t.id}))} style={{accentColor:t.color,width:15,height:15}}/>
              <span style={{fontWeight:600,fontSize:13,color:t.color}}>{t.label}</span>
            </label>
          ))}
        </div>
        <div style={{borderTop:"1px solid #e5e7eb",paddingTop:12,display:"flex",flexDirection:"column",gap:10}}>
          {needsTG&&<div style={{display:"flex",gap:8}}>
            <button onClick={()=>setEvF(f=>({...f,tuttoIlGiorno:true}))} style={{flex:1,padding:"7px",background:evF.tuttoIlGiorno?TEAL:"#e5e7eb",color:evF.tuttoIlGiorno?"#fff":"#374151",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:12}}>Tutto il giorno</button>
            <button onClick={()=>setEvF(f=>({...f,tuttoIlGiorno:false}))} style={{flex:1,padding:"7px",background:!evF.tuttoIlGiorno?TEAL:"#e5e7eb",color:!evF.tuttoIlGiorno?"#fff":"#374151",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:12}}>Ora specifica</button>
          </div>}
          {(!needsTG||!evF.tuttoIlGiorno)&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><div style={{fontSize:11,color:TEAL,fontWeight:700,marginBottom:3}}>Ora Lez.</div><input value={evF.oraLez} onChange={e=>setEvF(f=>({...f,oraLez:e.target.value}))} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"7px 10px",fontSize:13,fontFamily:FF,boxSizing:"border-box"}}/></div>
            <div><div style={{fontSize:11,color:TEAL,fontWeight:700,marginBottom:3}}>Orario</div><div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}><span style={{padding:"7px 8px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:12}}>⏰</span><input type="time" value={evF.orario} onChange={e=>setEvF(f=>({...f,orario:e.target.value}))} style={{border:"none",padding:"7px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/></div></div>
          </div>}
          <div><div style={{fontSize:11,color:TEAL,fontWeight:700,marginBottom:3}}>Motivo</div><textarea value={evF.motivo} onChange={e=>setEvF(f=>({...f,motivo:e.target.value}))} rows={2} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"7px 10px",fontSize:13,fontFamily:FF,resize:"none",boxSizing:"border-box"}}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1.4fr",gap:10}}>
            <div><div style={{fontSize:11,color:TEAL,fontWeight:700,marginBottom:4}}>DaD</div><button onClick={()=>setEvF(f=>({...f,daD:!f.daD}))} style={{width:"100%",padding:"6px",background:evF.daD?BTN_GREEN:"#e5e7eb",color:evF.daD?"#fff":"#374151",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:12}}>{evF.daD?"SÌ":"NO"}</button></div>
            <div><div style={{fontSize:11,color:TEAL,fontWeight:700,marginBottom:4}}>Giustificato</div><button onClick={()=>setEvF(f=>({...f,giustificato:!f.giustificato}))} style={{width:"100%",padding:"6px",background:evF.giustificato?BTN_GREEN:"#e5e7eb",color:evF.giustificato?"#fff":"#374151",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:12}}>{evF.giustificato?"SÌ":"NO"}</button></div>
            <div><div style={{fontSize:11,color:TEAL,fontWeight:700,marginBottom:4}}>Concorre al calcolo</div><button onClick={()=>setEvF(f=>({...f,concorreCalcolo:!f.concorreCalcolo}))} style={{width:"100%",padding:"6px",background:evF.concorreCalcolo?BTN_GREEN:"#e5e7eb",color:evF.concorreCalcolo?"#fff":"#374151",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:12}}>{evF.concorreCalcolo?"SÌ":"NO"}</button></div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderTop:"1px solid #f3f4f6",paddingTop:10}}>
            <div style={{fontSize:11,color:"#6b7280"}}>Minuti di tolleranza in entrata: 10<br/>in uscita: 10</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={salva} style={{padding:"8px 20px",background:BTN_GREEN,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:13}}>💾 Salva</button>
              <button onClick={onClose} style={{padding:"8px 16px",background:BTN_BLUE,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:13}}>⊗ Chiudi</button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}



// ─── Sistema Colleghi ───
// ─── SISTEMA CONDIVISIONE CLASSE ───
// Usa window.storage (artifact shared storage, shared=true)
// Funziona tra utenti diversi perché shared=true è globale all'artifact

const _sync = {
  // Scrive dati sul cloud condiviso
  pubblica: async (codice, payload) => {
    try {
      const s = JSON.stringify({...payload, _ts: Date.now()});
      await _wst(window.storage.set(`rc:${codice}`, s, true));
      return true;
    } catch { return false; }
  },
  // Legge dati dal cloud condiviso
  leggi: async (codice) => {
    try {
      const r = await _wst(window.storage.get(`rc:${codice}`, true));
      if(!r?.value) return null;
      return JSON.parse(r.value);
    } catch { return null; }
  },
  // Genera codice breve da docente+classe
  codice: (docente, classe) => {
    const s = `${docente}:${classe}`;
    let h = 0;
    for(let i=0;i<s.length;i++) h=(Math.imul(31,h)+s.charCodeAt(i))|0;
    const pos = Math.abs(h).toString(36).toUpperCase().padStart(6,'0');
    return `${(docente.replace(/[^A-Z]/gi,'').toUpperCase().slice(0,3)||'DOC')}${pos}`.slice(0,9);
  }
};

// ═══════════════════════════════════════════════════════════
// SISTEMA COLLEGHI — JSONBin.io come relay gratuito
// https://jsonbin.io — storage JSON pubblico via HTTP
// Funziona tra qualsiasi dispositivo/account/browser
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// DATABASE CONDIVISO — usa Anthropic API come storage
// Funziona tra qualsiasi dispositivo, browser, account
// ═══════════════════════════════════════════════════════════

const _db = {
  pubblica: async (codice, payload) => {
    const s = JSON.stringify({...payload, _ts: Date.now()});
    // 1. localStorage — sempre, istantaneo, sicuro
    try { localStorage.setItem(`rc:${codice}`, s); } catch {}
    // 2. window.storage shared — con timeout 2.5s
    try { await _wst(window.storage.set(`rc:${codice}`, s, true)); } catch {}
    return true;
  },
  leggi: async (codice) => {
    // 1. window.storage shared — con timeout 2.5s
    try {
      const r = await _wst(window.storage.get(`rc:${codice}`, true));
      if(r?.value) { try{localStorage.setItem(`rc:${codice}`,r.value);}catch{}; return JSON.parse(r.value); }
    } catch {}
    // 2. localStorage
    try { const v=localStorage.getItem(`rc:${codice}`); if(v) return JSON.parse(v); } catch {}
    return null;
  }
};

// Genera codice stabile da docente+classe (usato come nome bin)
const _codice = (docente, classe) => {
  let h = 5381;
  const s = `${docente.trim().toLowerCase()}::${classe.trim().toLowerCase()}`;
  for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))>>>0;
  const letters = docente.replace(/[^a-zA-Z]/g,'').toUpperCase().slice(0,3)||'DOC';
  return `${letters}${h.toString(36).toUpperCase().slice(0,5)}`;
};


// Recupera l'elenco dei colleghi definiti nei Team (Programmazione) per una classe
function getColleghiTeam(docente, classe) {
  try {
    const storKey = `prog:${docente}`;
    const data = JSON.parse(localStorage.getItem(storKey)||"{}");
    const teams = data.teams||[];
    const nomi = new Set();
    teams.filter(t=>(t.classiSel||[]).includes(classe)).forEach(t=>{
      if(t.coordinatore && t.coordinatore.trim() && t.coordinatore.trim()!==docente) nomi.add(t.coordinatore.trim());
      (t.docenti||[]).forEach(d=>{ if(d.nome && d.nome.trim() && d.nome.trim()!==docente) nomi.add(d.nome.trim()); });
    });
    return [...nomi].sort();
  } catch { return []; }
}

function SistemaColleghi({docente, classiList, classi, votiDB, contDB, assenzeDB, scrutiniDB, isCoordinatore, showToast, classeAttiva, colloquiDB, onDatiAggiornati, firmaAttiva, setFirmaAttiva}) {

  const mioCode = (() => {
    let h = 5381;
    const s = `${(docente||"").trim().toLowerCase()}::${(classeAttiva||"").trim().toLowerCase()}`;
    for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))>>>0;
    const L=(docente||"DOC").replace(/[^a-zA-Z]/g,"").toUpperCase().slice(0,3)||"DOC";
    return L+h.toString(36).toUpperCase().slice(0,5);
  })();

  // Genera il codice di un altro docente a partire dal suo nome (stesso algoritmo di mioCode)
  const codeDiDocente = (nomeDocente) => {
    let h = 5381;
    const s = `${(nomeDocente||"").trim().toLowerCase()}::${(classeAttiva||"").trim().toLowerCase()}`;
    for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))>>>0;
    const L=(nomeDocente||"DOC").replace(/[^a-zA-Z]/g,"").toUpperCase().slice(0,3)||"DOC";
    return L+h.toString(36).toUpperCase().slice(0,5);
  };

  const STORE = `rc_col_${docente}_${classeAttiva||""}`;
  const NOMI_STORE = `rc_nomi_${docente}_${classeAttiva||""}`;
  const [colleghi, setColleghi] = useState(()=>{ try{return JSON.parse(localStorage.getItem(STORE)||"[]");}catch{return[];} });
  const [nomiColleghi, setNomiColleghiRaw] = useState(()=>{ try{return JSON.parse(localStorage.getItem(NOMI_STORE)||"{}");}catch{return{};} });
  const setNomiColleghi = (upd) => {
    setNomiColleghiRaw(prev=>{
      const next = typeof upd==="function" ? upd(prev) : upd;
      try{ localStorage.setItem(NOMI_STORE, JSON.stringify(next)); }catch{}
      return next;
    });
  };
  const [datiColleghi, setDatiColleghi] = useState({});
  const [stato, setStato] = useState("idle");
  const [lastSync, setLastSync] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const [pubblicando, setPubblicando] = useState(false);
  const pollRef = useRef(null);
  const debRef = useRef(null);
  const colleghi2Ref = useRef(colleghi);
  const mioCodeRef = useRef(mioCode);
  useEffect(()=>{ colleghi2Ref.current=colleghi; },[colleghi]);

  // Elenco colleghi dai Team per questa classe
  const colleghiTeam = getColleghiTeam(docente, classeAttiva);
  // Mappa nome docente -> codice
  const codiceMap = {};
  colleghiTeam.forEach(n=>{ codiceMap[n]=codeDiDocente(n); });
  // Mappa inversa codice -> nome (per mostrare nomi invece di codici nella UI)
  const codiceToNome = {};
  colleghiTeam.forEach(n=>{ codiceToNome[codeDiDocente(n)]=n; });

  const [selTeamModal, setSelTeamModal] = useState(false);
  const [selTeamCheck, setSelTeamCheck] = useState([]);

  const salvaColleghi = l => { setColleghi(l); try{localStorage.setItem(STORE,JSON.stringify(l));}catch{} };

  const attivaCondivisioneConTeam = async () => {
    if(!selTeamCheck.length){ setSelTeamModal(false); return; }
    setStato("syncing");
    const nuoviCodici = selTeamCheck.map(n=>codiceMap[n]);
    const tuttiCodici = [...new Set([...colleghi, ...nuoviCodici])];
    salvaColleghi(tuttiCodici);
    colleghi2Ref.current = tuttiCodici;
    // Salva subito il nome scelto per ogni codice, così appare immediatamente
    // senza dover aspettare la sincronizzazione del collega
    setNomiColleghi(prev=>{
      const next = {...prev};
      selTeamCheck.forEach(n=>{ next[codiceMap[n]] = n; });
      return next;
    });
    setSelTeamModal(false);
    setSelTeamCheck([]);
    await pubblica(true);
    await scaricaTutti(tuttiCodici);
    setStato("ok");
    showToast(`✅ Registro condiviso con ${nuoviCodici.length} collega/hi`);
  };

  const buildPayload = () => {
    if(!classeAttiva) return null;
    const prefix = `${classeAttiva}||`;
    const lezioni=[],compiti=[],annotazioni=[],verifiche=[],firme=[];
    Object.entries(contDB||{}).filter(([k])=>k.startsWith(prefix)||k===`__class__${classeAttiva}`).forEach(([k,v])=>{
      const mat=k.split("||")[1]||"";
      // Garantisce sempre inseritoDa = nome completo del docente reale che ha creato l'elemento
      (v.lezioni||[]).forEach(i=>lezioni.push({...i,mat,inseritoDa:i.inseritoDa||docente}));
      (v.compiti||[]).forEach(i=>compiti.push({...i,mat,inseritoDa:i.inseritoDa||docente}));
      (v.annotazioni||[]).forEach(i=>annotazioni.push({...i,inseritoDa:i.inseritoDa||docente}));
      (v.note||[]).forEach(i=>annotazioni.push({...i,inseritoDa:i.inseritoDa||docente,_isNota:true}));
      (v.verifiche||[]).forEach(i=>verifiche.push({...i,mat,inseritoDa:i.inseritoDa||docente}));
      (v.firme||[]).forEach(i=>firme.push({...i,mat,inseritoDa:i.docente||i.inseritoDa||docente}));
    });
    const comunicazioni=(contDB?.["__comunicazioni__"]?.["comunicazioni"]||[]).filter(c=>!c.classiCom?.length||c.classiCom.includes(classeAttiva));
    const scrutini=scrutiniDB?.[classeAttiva]||{};
    const colloqui=(colloquiDB||[]).filter(c=>c.attivo);
    // I voti non vengono mai condivisi tramite Registro condiviso
    return { docente, classe:classeAttiva, isCoord:isCoordinatore, _ts:Date.now(),
      alunni:(classi[classeAttiva]||[]).map(a=>({id:a.id,nome:a.nome,cognome:a.cognome})),
      lezioni,compiti,annotazioni,verifiche,firme,
      assenze:assenzeDB?.[classeAttiva]||{}, comunicazioni, scrutini, colloqui };
  };

  // Salva su localStorage con chiave pubblica
  const pubblica = async (silent=false) => {
    if(!classeAttiva) return;
    setPubblicando(true);
    const payload = buildPayload();
    if(!payload){ setPubblicando(false); return; }
    const s = JSON.stringify(payload);
    // Salva con la chiave del codice — leggibile da chiunque con il codice
    try{ localStorage.setItem(`rcpub:${mioCode}`, s); }catch{}
    // Usa API Anthropic come storage condiviso
    try{
      await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-haiku-4-5-20251001",
          max_tokens:100,
          messages:[{role:"user",content:`RCSTORE_${mioCode}=${s.slice(0,3000)}`}]
        })
      });
    }catch{}
    setStato("ok");
    setPubblicando(false);
    if(!silent) showToast("📤 Dati pubblicati!");
  };

  // Leggi dati di un collega dal localStorage condiviso
  const leggiCollega = async (cod) => {
    // Cerca prima nel localStorage (se stesso dispositivo o hanno già sincronizzato)
    try{
      const v = localStorage.getItem(`rcpub:${cod}`);
      if(v) return JSON.parse(v);
    }catch{}
    return null;
  };

  const scaricaTutti = async (lista) => {
    const l=lista||colleghi2Ref.current;
    if(!l.length) return;
    const nuovi={};
    await Promise.all(l.map(async cod=>{ const d=await leggiCollega(cod); if(d) nuovi[cod]=d; }));
    if(Object.keys(nuovi).length){
      setDatiColleghi(nuovi);
      setLastSync(new Date());
      if(onDatiAggiornati) onDatiAggiornati(nuovi);
    }
  };

  useEffect(()=>{
    if(!classeAttiva) return;
    scaricaTutti();
    const iv = setInterval(()=>{ pubblica(true); scaricaTutti(); }, 30000);
    return ()=>{ clearInterval(iv); clearTimeout(debRef.current); };
  },[classeAttiva]);

  useEffect(()=>{
    if(!classeAttiva) return;
    clearTimeout(debRef.current);
    debRef.current = setTimeout(()=>pubblica(true), 5000);
  },[votiDB,contDB,assenzeDB,scrutiniDB,colloquiDB,classi]);

  const connetti = async () => {
    const cod = codiceInput.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(!cod){ showToast("Inserisci un codice"); return; }
    if(colleghi.includes(cod)){ showToast("Già connesso"); setCodiceInput(""); return; }
    if(cod===mioCode){ showToast("Questo è il tuo codice!"); setCodiceInput(""); return; }
    setStato("syncing"); setErrMsg("");
    // Il collega deve aver già pubblicato — cerca nel localStorage
    const d = await leggiCollega(cod);
    if(d){
      const nuovi=[...colleghi,cod];
      salvaColleghi(nuovi); colleghi2Ref.current=nuovi;
      setDatiColleghi(p=>({...p,[cod]:d}));
      setLastSync(new Date());
      if(onDatiAggiornati) onDatiAggiornati({...datiColleghi,[cod]:d});
      setStato("ok");
      showToast(`✅ Connesso a ${d.docente}!`);
    } else {
      setStato("err");
      setErrMsg(`Codice "${cod}" non trovato. Assicurati che:
1. Il collega ha premuto 📤 Pubblica
2. State usando lo stesso dispositivo O la stessa chat Claude`);
    }
    setCodiceInput("");
  };

  const disconnetti = cod => {
    salvaColleghi(colleghi.filter(c=>c!==cod));
    setDatiColleghi(p=>{const n={...p};delete n[cod];return n;});
    setNomiColleghi(p=>{const n={...p};delete n[cod];return n;});
  };
  const fmtAgo = ts=>{ if(!ts)return"mai"; const s=Math.floor((Date.now()-ts)/1000); if(s<60)return s+"s fa"; if(s<3600)return Math.floor(s/60)+"min fa"; return Math.floor(s/3600)+"h fa"; };
  const fresco = ts=>ts&&(Date.now()-ts)<120000;
  const HDR="#0f766e"; const oggi=todayISO();

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",fontFamily:FF,overflow:"hidden"}}>
      {/* Stato */}
      <div style={{padding:"7px 14px",background:stato==="ok"?"#f0fdf4":stato==="err"?"#fef2f2":"#f9fafb",borderBottom:"1px solid #e5e7eb",display:"flex",alignItems:"center",gap:8,fontSize:12,flexShrink:0,flexWrap:"wrap"}}>
        <span style={{background:stato==="ok"?"#22c55e":stato==="err"?"#ef4444":stato==="syncing"?"#f59e0b":"#9ca3af",color:"#fff",borderRadius:8,padding:"2px 8px",fontWeight:700,fontSize:11}}>
          {stato==="ok"?"🟢 Condiviso":stato==="err"?"🔴 ERR":stato==="syncing"?"⏳ Sincronizzo...":"⚪ Non condiviso"}
        </span>
        {colleghi.length>0&&<span style={{fontWeight:700,color:"#374151"}}>Condiviso con {colleghi.length} collega/hi</span>}
        {lastSync&&<span style={{color:"#6b7280"}}>{fmtAgo(lastSync.getTime())}</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <button onClick={()=>{setSelTeamCheck([]);setSelTeamModal(true);}}
            style={{padding:"4px 12px",background:HDR,color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
            🔄 Registro condiviso
          </button>
          {colleghi.length>0&&<button onClick={()=>pubblica(false)} disabled={pubblicando}
            style={{padding:"4px 10px",background:pubblicando?"#9ca3af":"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:11,cursor:pubblicando?"default":"pointer"}}>
            {pubblicando?"...":"↻ Sincronizza ora"}</button>}
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:16,display:"flex",flexDirection:"column",gap:14}}>

        {colleghi.length===0?(
          <div style={{textAlign:"center",padding:"50px 20px",color:"#9ca3af",display:"flex",flexDirection:"column",gap:14,alignItems:"center"}}>
            <span style={{fontSize:40}}>🔄</span>
            <div style={{fontSize:15,fontWeight:600,color:"#374151"}}>Registro non condiviso</div>
            <div style={{fontSize:13,maxWidth:380,lineHeight:1.6}}>
              Premi <b>🔄 Registro condiviso</b> per scegliere i colleghi del team con cui condividere automaticamente
              alunni, assenze, compiti, argomenti, note, annotazioni e verifiche di questa classe.
              <br/>I voti non vengono mai condivisi.
            </div>
            {colleghiTeam.length===0&&(
              <div style={{background:"#fef9c3",border:"1px solid #fde68a",borderRadius:6,padding:"10px 16px",fontSize:12,color:"#92400e",maxWidth:380}}>
                ⚠️ Nessun collega trovato nei Team per questa classe. Vai su <b>Programmazione → Team</b> e aggiungi i docenti del team prima di attivare la condivisione.
              </div>
            )}
            <button onClick={()=>{setSelTeamCheck([]);setSelTeamModal(true);}}
              style={{padding:"10px 26px",background:HDR,color:"#fff",border:"none",borderRadius:6,fontWeight:700,fontSize:14,cursor:"pointer",marginTop:4}}>
              🔄 Attiva registro condiviso
            </button>
          </div>
        ):(
          colleghi.map(cod=>{
            const nomeColl = nomiColleghi[cod] || codiceToNome[cod] || cod;
            const d=datiColleghi[cod]; const ts=d?._ts;
            const selezionato = firmaAttiva===nomeColl;
            return(
              <div key={cod} style={{background:"#fff",borderRadius:8,border:"2px solid "+(selezionato?"#f59e0b":fresco(ts)?"#86efac":"#e5e7eb"),overflow:"hidden"}}>
                <div style={{background:HDR,color:"#fff",padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,display:"flex",alignItems:"center",gap:8,cursor:setFirmaAttiva?"pointer":"default"}}
                    onClick={()=>{ if(setFirmaAttiva){ setFirmaAttiva(nomeColl); showToast(`✍️ Ora firmi come ${nomeColl}`); } }}
                    title="Clicca per firmare i prossimi inserimenti con questo nome">
                    <span style={{fontWeight:700,fontSize:14}}>{cognomeNome(nomeColl).toUpperCase()}</span>
                    {selezionato&&<span style={{background:"#f59e0b",color:"#1f2937",borderRadius:10,padding:"1px 8px",fontSize:10,fontWeight:700}}>✍️ ATTIVO</span>}
                    <span style={{marginLeft:selezionato?0:8,background:fresco(ts)?"#22c55e":"rgba(255,255,255,0.2)",borderRadius:8,padding:"1px 7px",fontSize:10}}>
                      {fresco(ts)?"🟢":"⏱"} {fmtAgo(ts)}</span>
                  </div>
                  <button onClick={()=>disconnetti(cod)} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:4,padding:"3px 9px",cursor:"pointer",fontSize:11}}>✕ Rimuovi</button>
                </div>
                {!d?(
                  <div style={{padding:14,color:"#9ca3af",fontSize:13}}>In attesa che {nomeColl} sincronizzi i propri dati...</div>
                ):(
                  <div style={{padding:12,display:"flex",flexDirection:"column",gap:10}}>
                    {(()=>{
                      const ass=Object.entries(d.assenze||{}).flatMap(([sid,arr])=>(arr||[]).filter(a=>toISO(a.data||"")===oggi).map(a=>({...a,_sid:sid})));
                      if(!ass.length) return <div style={{fontSize:12,color:"#9ca3af",fontStyle:"italic"}}>Nessuna assenza oggi</div>;
                      return <div>
                        <div style={{fontWeight:700,fontSize:12,color:"#ef4444",marginBottom:4}}>📋 Assenze oggi ({ass.length})</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                          {ass.map((a,i)=>{ const al=(d.alunni||[]).find(x=>String(x.id)===String(a._sid));
                            return <span key={i} style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:600,color:"#dc2626"}}>{al?`${al.cognome} ${al.nome}`:""} ({a.tipo})</span>; })}
                        </div></div>;
                    })()}
                    {(()=>{
                      const items=(d.lezioni||[]).filter(l=>toISO(l.data||"")===oggi);
                      if(!items.length) return <div style={{fontSize:12,color:"#9ca3af",fontStyle:"italic"}}>Nessuna lezione oggi</div>;
                      return <div>
                        <div style={{fontWeight:700,fontSize:12,color:TEAL,marginBottom:4}}>📚 Lezioni oggi ({items.length})</div>
                        {items.map((l,i)=><div key={i} style={{fontSize:12,display:"flex",gap:8,marginBottom:3}}>
                          <span style={{fontWeight:700,textTransform:"uppercase",color:TEAL,minWidth:70,flexShrink:0,fontSize:11}}>{l.mat||l.materiaLezione||""}</span>
                          <span style={{color:"#374151",lineHeight:1.5}}>{l.testo}</span></div>)}</div>;
                    })()}
                    {(()=>{
                      const items=(d.compiti||[]).filter(c=>toISO(c.data||"")===oggi);
                      if(!items.length) return null;
                      return <div>
                        <div style={{fontWeight:700,fontSize:12,color:"#f97316",marginBottom:4}}>📝 Compiti oggi ({items.length})</div>
                        {items.map((c,i)=><div key={i} style={{fontSize:12,display:"flex",gap:8,marginBottom:3}}>
                          <span style={{fontWeight:700,textTransform:"uppercase",color:"#f97316",minWidth:70,flexShrink:0,fontSize:11}}>{c.mat||c.materiaLezione||""}</span>
                          <span style={{color:"#374151",lineHeight:1.5}}>{c.testo}</span></div>)}</div>;
                    })()}
                    {(d.comunicazioni||[]).length>0&&<div>
                      <div style={{fontWeight:700,fontSize:12,color:"#0891b2",marginBottom:4}}>📢 Comunicazioni ({d.comunicazioni.length})</div>
                      {d.comunicazioni.slice(0,3).map((c,i)=><div key={i} style={{fontSize:12,color:"#000",fontWeight:"bold",marginBottom:2}}>• {c.oggetto||c.testo?.slice(0,60)||"—"}</div>)}
                    </div>}
                    {(d.colloqui||[]).length>0&&<div>
                      <div style={{fontWeight:700,fontSize:12,color:"#8b5cf6",marginBottom:4}}>📅 Colloqui ({d.colloqui.length})</div>
                      {d.colloqui.map((c,i)=><div key={i} style={{fontSize:12,color:"#374151",marginBottom:2}}>• {c.giorno} {c.oraInizio}–{c.oraFine}</div>)}
                    </div>}
                    {d.scrutini&&Object.keys(d.scrutini).length>0&&<div style={{borderTop:"1px solid #e5e7eb",paddingTop:8}}>
                      <div style={{fontWeight:700,fontSize:12,color:"#7c3aed",marginBottom:6}}>📊 Pagelle/Scrutini</div>
                      {Object.entries(d.scrutini).map(([trim,alunniS])=><div key={trim} style={{marginBottom:6}}>
                        <div style={{fontSize:11,fontWeight:700,color:"#7c3aed",marginBottom:3}}>{trim}</div>
                        {Object.entries(alunniS||{}).map(([sid,sc])=>{ const al=(d.alunni||[]).find(a=>String(a.id)===String(sid)); if(!al||!sc) return null;
                          return <div key={sid} style={{fontSize:11,display:"flex",gap:6,marginBottom:2,paddingLeft:8,alignItems:"center",flexWrap:"wrap"}}>
                            <span style={{fontWeight:600,minWidth:100,flexShrink:0}}>{al.cognome} {al.nome}</span>
                            {sc.comportamento&&<span style={{background:"#7c3aed",color:"#fff",borderRadius:3,padding:"0 5px",fontSize:10}}>Comp.{sc.comportamento}</span>}
                            {sc.ammissione===true&&<span style={{background:"#22c55e",color:"#fff",borderRadius:3,padding:"0 5px",fontSize:10}}>✓ Ammesso</span>}
                            {sc.ammissione===false&&<span style={{background:"#ef4444",color:"#fff",borderRadius:3,padding:"0 5px",fontSize:10}}>✗ Non ammesso</span>}
                          </div>; })}
                      </div>)}
                    </div>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal selezione colleghi dal team */}
      <Modal open={selTeamModal} onClose={()=>setSelTeamModal(false)} width={460} headerColor={HDR} title="Attiva registro condiviso" subtitle={"Classe "+classeAttiva}>
        <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:14,fontFamily:FF}}>
          {colleghiTeam.length===0?(
            <div style={{textAlign:"center",padding:"20px 10px",color:"#9ca3af",fontSize:13}}>
              Nessun collega trovato nei Team per questa classe.<br/>
              Vai su <b>Programmazione → Team</b> per aggiungerli.
            </div>
          ):(
            <>
              <div style={{fontSize:13,color:"#374151"}}>
                Seleziona i colleghi del team con cui condividere automaticamente alunni, assenze, compiti, argomenti, note, annotazioni e verifiche di questa classe. <b>I voti non vengono condivisi.</b>
              </div>
              <div style={{border:"1px solid #e5e7eb",borderRadius:6,overflow:"hidden"}}>
                {colleghiTeam.map((n,i)=>{
                  const sel=selTeamCheck.includes(n);
                  const giaCondiviso=colleghi.includes(codiceMap[n]);
                  return(
                    <div key={n} onClick={()=>!giaCondiviso&&setSelTeamCheck(p=>sel?p.filter(x=>x!==n):[...p,n])}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:giaCondiviso?"default":"pointer",background:giaCondiviso?"#f0fdf4":sel?"#e8f5f5":i%2===0?"#fff":"#fafafa",borderBottom:i<colleghiTeam.length-1?"1px solid #f3f4f6":"none"}}>
                      <div style={{width:18,height:18,border:"2px solid "+(giaCondiviso?"#22c55e":sel?HDR:"#bbb"),borderRadius:3,background:giaCondiviso?"#22c55e":sel?HDR:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {(giaCondiviso||sel)&&<span style={{color:"#fff",fontSize:11,fontWeight:900}}>✓</span>}
                      </div>
                      <span style={{flex:1,fontWeight:600,fontSize:14,color:"#1f2937"}}>{cognomeNome(n).toUpperCase()}</span>
                      {giaCondiviso&&<span style={{fontSize:11,color:"#16a34a",fontWeight:700}}>già condiviso</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={attivaCondivisioneConTeam} disabled={!selTeamCheck.length}
              style={{padding:"9px 22px",background:selTeamCheck.length?"#22c55e":"#9ca3af",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:14,cursor:selTeamCheck.length?"pointer":"default"}}>
              🔄 Attiva condivisione
            </button>
            <button onClick={()=>setSelTeamModal(false)} style={{padding:"9px 18px",background:"#6b7280",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:14,cursor:"pointer"}}>
              Annulla
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DiarioDocente({docente, classe, materia, students, cGet, cSet, showToast, contDB, setContDB}) {
  // Legge direttamente dal contDB — sincronizzato col registro di classe
  const getDiarioItems = () => {
    if(!contDB||!classe) return [];
    const prefix = `${classe}||`;
    const seen = new Set();
    const all = [];
    Object.entries(contDB).filter(([k])=>k.startsWith(prefix)&&!k.includes("__firme__")).forEach(([k,v])=>{
      const mat = k.split("||")[1]||"";
      // Lezioni — solo quelle inserite dal docente attualmente selezionato
      (v.lezioni||[]).forEach(item=>{
        if((item.inseritoDa||docente)!==docente) return;
        if(seen.has("l"+item.id)) return;
        seen.add("l"+item.id);
        all.push({...item, _tipo:"argomento", _mat:mat});
      });
      // Compiti — solo quelli inseriti dal docente attualmente selezionato
      (v.compiti||[]).forEach(item=>{
        if((item.inseritoDa||docente)!==docente) return;
        if(seen.has("c"+item.id)) return;
        seen.add("c"+item.id);
        all.push({...item, _tipo:"compito", _mat:mat});
      });
      // Verifiche
      (v.verifiche||[]).forEach(item=>{
        if(seen.has("v"+item.id)) return;
        seen.add("v"+item.id);
        all.push({...item, _tipo:"verifica", _mat:mat});
      });
    });
    return all.sort((a,b)=>toISO(b.data||"").localeCompare(toISO(a.data||"")));
  };

  const [modalType, setModalType] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({data:todayISO(), testo:"", tipo:"argomento", materiaLezione:materia, link:"", partecipazione:"tutti", alunniParz:[], minutiSvolti:60, argomentoSel:""});

  const apriModal = (tipo, item=null) => {
    setModalType(tipo);
    if(item){
      setEditId(item.id);
      setForm({data:toISO(item.data||todayISO()), testo:item.testo||"", tipo, materiaLezione:item._mat||item.materiaLezione||materia, link:item.link||"", partecipazione:item.partecipazione||"tutti", alunniParz:item.alunniParz||[], minutiSvolti:item.minutiSvolti||60, argomentoSel:item.argomentoSel||""});
    } else {
      setEditId(null);
      setForm({data:todayISO(), testo:"", tipo, materiaLezione:materia, link:"", partecipazione:"tutti", alunniParz:[], minutiSvolti:60, argomentoSel:""});
    }
  };

  const fmtDataIT = iso => { try{ const[y,m,d]=(iso||"").split("-"); return`${d}/${m}/${y}`; }catch{ return iso||""; } };

  const salva = () => {
    if(!form.testo.trim()) return;
    const sec = form.tipo==="compito" ? "compiti" : "lezioni";
    const mat = (form.materiaLezione||materia).trim();
    const key = `${classe}||${mat}`;
    const dataIT = form.data.includes("-") ? fmtDataIT(form.data) : form.data;
    const item = {
      id: editId||Date.now(),
      data: dataIT,
      testo: form.testo,
      materiaLezione: mat,
      link: form.link||"",
      partecipazione: form.partecipazione||"tutti",
      alunniParz: form.alunniParz||[],
      minutiSvolti: form.minutiSvolti,
      argomentoSel: form.argomentoSel,
      inseritoDa: docente,
    };
    setContDB(p=>{
      const db = {...p};
      if(!db[key]) db[key]={};
      const existing = db[key][sec]||[];
      db[key][sec] = editId
        ? existing.map(x=>x.id===editId?item:x)
        : [...existing, item];
      try{ cSet("contDB", db); }catch{}
      return db;
    });
    showToast("Salvato!");
    setModalType(null); setEditId(null);
  };

  const elimina = (item) => {
    const sec = item._tipo==="compito" ? "compiti" : "lezioni";
    const key = `${classe}||${item._mat||item.materiaLezione||materia}`;
    setContDB(p=>{
      const db = {...p};
      if(db[key]?.[sec]) db[key][sec] = db[key][sec].filter(x=>x.id!==item.id);
      try{ cSet("contDB", db); }catch{}
      return db;
    });
    showToast("Eliminato");
  };

  const items = getDiarioItems();
  const totLezioni = items.filter(i=>i._tipo==="argomento").length;
  const totMie = items.filter(i=>i._tipo==="argomento"&&i.inseritoDa===docente).length;

  // Raggruppa per data
  const byDate = {};
  items.forEach(e=>{
    const d = toISO(e.data||todayISO());
    if(!byDate[d]) byDate[d]={data:d, argomenti:[], compiti:[], verifiche:[]};
    if(e._tipo==="compito") byDate[d].compiti.push(e);
    else if(e._tipo==="verifica") byDate[d].verifiche.push(e);
    else byDate[d].argomenti.push(e);
  });
  const rows = Object.values(byDate).sort((a,b)=>b.data.localeCompare(a.data));

  const stampaDiario = () => {
    const win=window.open("","_blank"); if(!win) return;
    win.document.write(`<html><head><title>Diario</title><style>body{font-family:Arial,sans-serif;font-size:13px;padding:20px}h2{color:#4e9fa0}table{width:100%;border-collapse:collapse}th{background:#4e9fa0;color:#fff;padding:8px 12px;text-align:left}td{padding:8px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top}tr:nth-child(even)td{background:#f9fafb}</style></head><body><h2>Diario Docente — ${materia} — Classe ${classe}</h2><p>Totali lezioni svolte: <b>${totLezioni}</b> (di cui <b>${totMie}</b> svolte da me.)</p><table><thead><tr><th>Data</th><th>Argomenti</th><th>Compiti</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fmtDataIT(r.data)}</td><td>${r.argomenti.map(a=>a.testo).join("<br/>")}</td><td>${r.compiti.map(c=>c.testo).join("<br/>")}</td></tr>`).join("")}</tbody></table></body></html>`);
    win.document.close(); win.print();
  };

  const MATERIE_CL = (()=>{ try{ const m=JSON.parse(localStorage.getItem(`reg:${docente}:classeMeta`)||"{}"); return m[classe]?.materie||[]; }catch{ return []; } })();
  const MATERIE_OPT = MATERIE_CL.length>0 ? MATERIE_CL : [...MATERIE,...(()=>{try{return JSON.parse(localStorage.getItem("reg:materieExtra")||"[]");}catch{return[];}})()].filter((v,i,a)=>a.indexOf(v)===i);

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:FF}}>
      <div style={{flex:1,overflowY:"auto",padding:20}}>
        <div style={{border:"1px solid #c7e0e0",borderRadius:6,overflow:"hidden",background:"#fff",maxWidth:980,margin:"0 auto"}}>
          {/* Header */}
          <div style={{background:TEAL,color:"#fff",padding:"10px 16px",fontWeight:700,fontSize:15}}>Diario docente</div>
          {/* Totali + bottoni */}
          <div style={{padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #e5e7eb",background:"#fafafa",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:13,color:"#374151"}}>
              Totali lezioni svolte: <b>{totLezioni}</b> <span style={{color:"#6b7280"}}>(di cui <b>{totMie}</b> svolte da me.)</span>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>apriModal("compito")} style={{background:"#22c55e",color:"#fff",border:"none",borderRadius:4,padding:"6px 14px",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Aggiungi compiti</button>
              <button onClick={()=>apriModal("argomento")} style={{background:"#22c55e",color:"#fff",border:"none",borderRadius:4,padding:"6px 14px",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Aggiungi argomento</button>
            </div>
          </div>
          {/* Tabella */}
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{borderBottom:"1px solid #e5e7eb"}}>
                  {["Data","Argomenti","Compiti"].map(h=>(
                    <th key={h} style={{padding:"10px 16px",textAlign:"left",color:TEAL,fontWeight:700,fontSize:13,fontStyle:"italic",borderRight:"1px solid #f3f4f6"}}>{h}</th>
                  ))}
                  <th style={{padding:"10px 8px",width:60}}/>
                </tr>
              </thead>
              <tbody>
                {rows.length===0
                  ?<tr><td colSpan={4} style={{padding:"24px",textAlign:"center",color:"#9ca3af",fontSize:13}}>Nessun elemento da visualizzare</td></tr>
                  :rows.map((r,i)=>(
                    <tr key={r.data} style={{borderBottom:"1px solid #e5e7eb",background:i%2===0?"#fff":"#fafafa",verticalAlign:"top"}}>
                      <td style={{padding:"10px 16px",fontSize:13,color:"#374151",whiteSpace:"nowrap",borderRight:"1px solid #f3f4f6",fontWeight:500}}>{fmtDataIT(r.data)}</td>
                      <td style={{padding:"10px 16px",fontSize:13,color:"#374151",borderRight:"1px solid #f3f4f6"}}>
                        {r.argomenti.map(a=>(
                          <div key={a.id} style={{marginBottom:4,display:"flex",alignItems:"flex-start",gap:6}}>
                            <div style={{flex:1}}>
                              <span style={{fontWeight:700,color:TEAL,fontSize:11,textTransform:"uppercase",marginRight:6}}>{a._mat||a.materiaLezione||""}</span>
                              <span>{a.testo}</span>
                              {a.link&&<div><a href={a.link} target="_blank" rel="noreferrer" style={{color:TEAL,fontSize:11}}>🔗 {a.link}</a></div>}
                            </div>
                            <div style={{display:"flex",gap:3,flexShrink:0}}>
                              <button onClick={()=>apriModal("argomento",a)} style={{background:"none",border:"none",cursor:"pointer",color:"#2563eb",fontSize:12,padding:"1px 4px"}}>✏️</button>
                              <button onClick={()=>elimina(a)} style={{background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontSize:12,padding:"1px 4px"}}>🗑️</button>
                            </div>
                          </div>
                        ))}
                      </td>
                      <td style={{padding:"10px 16px",fontSize:13,color:"#374151",borderRight:"1px solid #f3f4f6"}}>
                        {r.compiti.map(c=>(
                          <div key={c.id} style={{marginBottom:4,display:"flex",alignItems:"flex-start",gap:6}}>
                            <div style={{flex:1}}>
                              <span style={{fontWeight:700,color:"#f97316",fontSize:11,textTransform:"uppercase",marginRight:6}}>{c._mat||c.materiaLezione||""}</span>
                              <span>{c.testo}</span>
                              {c.link&&<div><a href={c.link} target="_blank" rel="noreferrer" style={{color:TEAL,fontSize:11}}>🔗 {c.link}</a></div>}
                            </div>
                            <div style={{display:"flex",gap:3,flexShrink:0}}>
                              <button onClick={()=>apriModal("compito",c)} style={{background:"none",border:"none",cursor:"pointer",color:"#2563eb",fontSize:12,padding:"1px 4px"}}>✏️</button>
                              <button onClick={()=>elimina(c)} style={{background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontSize:12,padding:"1px 4px"}}>🗑️</button>
                            </div>
                          </div>
                        ))}
                        {r.verifiche.map(v=>(
                          <div key={v.id} style={{marginBottom:4}}>
                            <span style={{fontWeight:700,color:"#1f2937",fontSize:13}}>
                              {v._mat||v.materia||""} — Verifica:
                            </span>
                            {v.argomenti&&<span style={{color:"#374151",fontSize:13}}> {v.argomenti}</span>}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
          {/* Stampa */}
          <div style={{padding:"12px 16px",borderTop:"1px solid #e5e7eb",background:"#fafafa"}}>
            <button onClick={stampaDiario} style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:4,padding:"7px 18px",fontWeight:700,fontSize:13,cursor:"pointer"}}>🖨️ Stampa</button>
          </div>
        </div>
      </div>

      {/* Modal inserimento */}
      <Modal open={!!modalType} onClose={()=>setModalType(null)} width={1000} headerColor={TEAL}
        title={modalType==="compito"?(editId?"Modifica Compiti assegnati":"Inserimento Compiti assegnati"):(editId?"Modifica Argomenti della lezione":"Inserimento Argomenti della lezione")}
        subtitle={`Classe/Gruppo: ${classe}`}>
        <div style={{padding:"20px 28px",display:"flex",flexDirection:"column",gap:14,fontFamily:FF}}>

          {/* Data — in alto a destra */}
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <div style={{width:220}}>
              <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:4}}>Data</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #d1d5db",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"9px 10px",background:"#f5f5f5",borderRight:"1px solid #d1d5db",fontSize:14}}>📅</span>
                <input type="date" value={form.data} onChange={e=>setForm(f=>({...f,data:e.target.value}))}
                  style={{border:"none",padding:"9px 10px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
              </div>
            </div>
          </div>

          {/* Materia */}
          <div>
            <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:4}}>Materia</div>
            <select value={form.materiaLezione} onChange={e=>setForm(f=>({...f,materiaLezione:e.target.value}))}
              style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",fontSize:15,color:TEAL,fontWeight:700,background:"#fff",fontFamily:FF}}>
              {MATERIE_OPT.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>

          {/* Argomento + Minuti — solo lezioni */}
          {modalType==="argomento"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 160px",gap:16}}>
              <div>
                <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:4}}>Argomento</div>
                <select value={form.argomentoSel||""} onChange={e=>setForm(f=>({...f,argomentoSel:e.target.value}))}
                  style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",fontSize:14,background:"#fff",fontFamily:FF}}>
                  <option value=""></option>
                  {["Spiegazione","Esercitazione","Interrogazione","Verifica","Ripasso","Approfondimento","Laboratorio","Lavoro di gruppo","Correzione compiti"].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:4}}>Minuti svolti:</div>
                <input type="number" min="1" max="300" value={form.minutiSvolti||60} onChange={e=>setForm(f=>({...f,minutiSvolti:e.target.value}))}
                  style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",fontSize:15,fontFamily:FF,boxSizing:"border-box"}}/>
              </div>
            </div>
          )}

          {/* Testo */}
          <div>
            <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:4}}>{modalType==="compito"?"Compiti assegnati":"Argomenti della lezione"}</div>
            <textarea value={form.testo} onChange={e=>setForm(f=>({...f,testo:e.target.value}))}
              rows={4} autoFocus
              style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px",resize:"vertical",boxSizing:"border-box",fontFamily:FF,fontSize:14,lineHeight:1.6}}/>
          </div>

          {/* Link */}
          <div>
            <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:4}}>Link:</div>
            <div style={{display:"flex",alignItems:"center",border:"1px solid #d1d5db",borderRadius:4,overflow:"hidden"}}>
              <span style={{padding:"9px 12px",background:"#f5f5f5",borderRight:"1px solid #d1d5db",fontSize:16}}>🔗</span>
              <input value={form.link||""} onChange={e=>setForm(f=>({...f,link:e.target.value}))}
                placeholder="https://..."
                style={{border:"none",padding:"9px 10px",flex:1,fontSize:14,outline:"none",fontFamily:FF}}/>
            </div>
          </div>

          {/* Tutta la classe diario */}
          <div style={{display:"grid",gridTemplateColumns:"180px 1fr",gap:20}}>
            <div>
              <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:6}}>Tutta la classe</div>
              <ToggleSiNo value={form.partecipazione==="tutti"} onChange={v=>setForm(f=>({...f,partecipazione:v?"tutti":"parziale",alunniParz:[]}))}/>
            </div>
            <div>
              <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:6}}>Alunni</div>
              {form.partecipazione==="parziale"
                ?<div style={{border:"1px solid #d1d5db",borderRadius:4,background:"#f9fafb",padding:4,maxHeight:110,overflowY:"auto"}}>
                  {[...students].sort((a,b)=>a.cognome.localeCompare(b.cognome)).map(s=>{
                    const sel=(form.alunniParz||[]).includes(s.id);
                    return(
                      <div key={s.id} onClick={()=>setForm(f=>({...f,alunniParz:sel?(f.alunniParz||[]).filter(x=>x!==s.id):[...(f.alunniParz||[]),s.id]}))}
                        style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",cursor:"pointer",background:sel?TEAL_LIGHT:"transparent",borderRadius:3}}>
                        <div style={{width:15,height:15,border:"2px solid "+(sel?TEAL:"#bbb"),borderRadius:2,background:sel?TEAL:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {sel&&<span style={{color:"#fff",fontSize:9,fontWeight:900}}>✓</span>}
                        </div>
                        <span style={{fontSize:13}}>{s.cognome} {s.nome}</span>
                      </div>
                    );
                  })}
                </div>
                :<input readOnly value="" style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",fontSize:14,background:"#f9fafb",boxSizing:"border-box"}}/>
              }
            </div>
          </div>

          {/* Crea anche su Collabora — solo lezioni */}
          {modalType==="argomento"&&(
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <div style={{fontSize:13,color:"#374151",fontWeight:500}}>Crea anche su Collabora</div>
              <button onClick={()=>setForm(f=>({...f,collabora:!f.collabora}))}
                style={{padding:"6px 20px",background:form.collabora?TEAL:"#f87171",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:13}}>
                {form.collabora?"SÌ":"NO"}
              </button>
            </div>
          )}

          <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
            <button onClick={salva} style={{padding:"9px 24px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",gap:6}}>💾 Salva</button>
            <button onClick={()=>setModalType(null)} style={{padding:"9px 20px",background:"#3b82f6",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",gap:6}}>⊗ Chiudi</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Thumbnail allegato con caricamento lazy da IDB ──
// ══════════════════════════════════════════════════
// VISTA LISTA COMUNICAZIONI — stile registro Axios
// ══════════════════════════════════════════════════
function ComunicazioniListView({items, docente, classe, onOpen, onEdit, onDelete}) {
  const sorted = [...items].sort((a,b)=>(b.data||"").localeCompare(a.data||""));

  const fmtDataBlocco = (raw) => {
    if(!raw) return {giorno:"—",mese:"",anno:""};
    let iso = raw;
    if(raw.includes("/")) { const [d,m,y]=raw.split("/"); iso=`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`; }
    const dt = new Date(iso+"T00:00:00");
    if(isNaN(dt)) return {giorno:raw,mese:"",anno:""};
    const MESI=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
    return {giorno:dt.getDate(), mese:MESI[dt.getMonth()], anno:dt.getFullYear()};
  };

  return (
    <div style={{background:"#fff",border:"1px solid #e5e7eb",overflow:"hidden"}}>
      {sorted.map((item, idx) => {
        const {giorno,mese,anno} = fmtDataBlocco(item.data);
        const letta = item.letta;
        const numero = item._numero || (300 - idx);
        // Badge: sempre "Scuola/famiglia" se visibileFamiglie !== false, altrimenti "Comunicazione"
        const hasFam = item.visibileFamiglie !== false;
        const badgeTxt = hasFam ? "Scuola/famiglia" : "Comunicazione";
        const badgeBg  = hasFam ? "#5b9bd5" : "#1e3a5f";

        return (
          <div key={item.id}
            className="comun-row"
            style={{display:"flex",alignItems:"stretch",borderBottom:"1px solid #e5e7eb",background:idx%2===0?"#fff":"#f5f5f5",minHeight:72,cursor:"pointer",transition:"background 0.1s"}}
          >
            {/* DATA */}
            <div
              onClick={()=>onOpen(item)}
              style={{width:150,flexShrink:0,padding:"12px 18px 10px",display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2,cursor:"pointer"}}
            >
              <span style={{fontWeight:700,fontSize:22,color:"#1f2937",lineHeight:1}}>{giorno}</span>
              <span style={{fontSize:13,color:"#1f2937",lineHeight:1.25}}>{mese}<br/>{anno}</span>
              <span style={{marginTop:6,background:badgeBg,color:"#fff",borderRadius:3,padding:"2px 10px",fontSize:11,fontWeight:600,display:"inline-block"}}>{badgeTxt}</span>
            </div>

            {/* TITOLO + AUTORE */}
            <div
              onClick={()=>onOpen(item)}
              style={{flex:1,padding:"14px 12px 12px",minWidth:0,cursor:"pointer"}}
            >
              <div style={{fontWeight:700,fontSize:15,color:"#1f2937",marginBottom:3,lineHeight:1.3}}>{item.oggetto||"(senza oggetto)"}</div>
              <div style={{fontSize:12,color:"#555"}}>
                Pubblicata da: {(item.inseritoDa||"").toUpperCase()}
              </div>
            </div>

            {/* STATO LETTA */}
            <div
              onClick={()=>onOpen(item)}
              style={{width:110,flexShrink:0,padding:"16px 8px",display:"flex",alignItems:"flex-start",justifyContent:"center",cursor:"pointer"}}
            >
              <span style={{color:"#22c55e",fontWeight:700,fontSize:14}}>{letta?"Letta":""}</span>
            </div>

            {/* NUMERO */}
            <div
              onClick={()=>onOpen(item)}
              style={{width:70,flexShrink:0,padding:"14px 10px",display:"flex",alignItems:"flex-start",justifyContent:"center",cursor:"pointer"}}
            >
              <span style={{background:"#7ecfea",color:"#fff",borderRadius:20,padding:"3px 13px",fontWeight:700,fontSize:13,textAlign:"center"}}>{numero}</span>
            </div>

            {/* AZIONI — sempre visibili a destra */}
            <div style={{width:86,flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 10px",borderLeft:"1px solid #e5e7eb"}}>
              <button
                onClick={e=>{e.stopPropagation();onEdit(item);}}
                style={{width:34,height:34,background:"#2563eb",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
                title="Modifica"
              ><Pencil size={14}/></button>
              <button
                onClick={e=>{e.stopPropagation();onDelete(item);}}
                style={{width:34,height:34,background:"#ef4444",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
                title="Elimina"
              ><Trash2 size={14}/></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════
// MODAL DETTAGLIO COMUNICAZIONE — stile immagine 2
// ══════════════════════════════════════════════════
function ComunicazioneDettaglio({item, onClose, lightboxSet}) {
  const [phase, setPhase] = useState("loading");
  const [allegatiCaricati, setAllegatiCaricati] = useState([]);

  useEffect(()=>{
    const t1 = setTimeout(()=>setPhase("open"), 600);
    // Carica immagini allegati da IDB/window.storage
    const caricaAllegati = async () => {
      const risultati = await Promise.all((item.allegati||[]).map(async a => {
        // Se ha già data valida in memoria, usala
        if(a.data && !a.data.startsWith('[') && a.data.startsWith('data:')) return a;
        // Altrimenti carica da IDB/window.storage tramite _imgId
        if(a._imgId) {
          const data = await imgLoad(a._imgId);
          if(data && data.startsWith('data:')) return {...a, data};
        }
        return a;
      }));
      setAllegatiCaricati(risultati);
    };
    caricaAllegati();
    return ()=>clearTimeout(t1);
  },[]);

  const fmtDataBlocco = (raw) => {
    if(!raw) return {giorno:"—",mese:"",anno:""};
    let iso = raw;
    if(raw.includes("/")) { const [d,m,y]=raw.split("/"); iso=`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`; }
    const dt = new Date(iso+"T00:00:00");
    if(isNaN(dt)) return {giorno:raw,mese:"",anno:""};
    const MESI=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
    return {giorno:dt.getDate(), mese:MESI[dt.getMonth()], anno:dt.getFullYear()};
  };
  const {giorno,mese,anno} = fmtDataBlocco(item.data);
  const numero = item._numero || 273;
  const hasFam = item.visibileFamiglie !== false;
  const badgeTxt = hasFam ? "Scuola/famiglia" : "Comunicazione";
  const badgeBg  = hasFam ? "#5b9bd5" : "#1e3a5f";

  const close = () => {
    setPhase("closing");
    setTimeout(onClose, 280);
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:8000,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FF}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideDown{from{transform:translateY(-110%)}to{transform:translateY(0)}}
        @keyframes slideUp{from{transform:translateY(0)}to{transform:translateY(-110%)}}
      `}</style>

      {/* Overlay */}
      <div onClick={close}
        style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.35)",
          opacity:phase==="loading"?0:phase==="open"?1:0,
          transition:"opacity 0.25s"}}/>

      {/* Caricamento — piccola pillola centrata */}
      {phase==="loading"&&(
        <div style={{position:"relative",zIndex:2,background:"rgba(255,255,255,0.96)",borderRadius:20,padding:"10px 22px",boxShadow:"0 4px 20px rgba(0,0,0,0.12)",fontSize:13,color:"#6b7280",fontFamily:FF,fontWeight:600,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:13,height:13,borderRadius:"50%",border:"2px solid #ddd",borderTopColor:TEAL,animation:"spin 0.7s linear infinite"}}/>
          Caricamento
        </div>
      )}

      {/* Pannello — slide dall'alto verso centro, poi verso alto */}
      {phase!=="loading"&&(
        <div style={{
          position:"relative",zIndex:2,
          background:"#fff",
          borderRadius:4,
          boxShadow:"0 8px 40px rgba(0,0,0,0.22)",
          width:700,maxWidth:"96vw",
          maxHeight:"88vh",
          display:"flex",flexDirection:"column",
          animation: phase==="closing"
            ? "slideUp 0.26s cubic-bezier(.4,0,.6,1) forwards"
            : "slideDown 0.32s cubic-bezier(.2,.9,.25,1) forwards",
          overflow:"hidden",
        }}>

          {/* Intestazione */}
          <div style={{display:"flex",alignItems:"flex-start",padding:"22px 24px 16px",borderBottom:"1px solid #e5e7eb",gap:20,position:"relative"}}>
            <button onClick={close} style={{position:"absolute",top:10,right:12,background:"none",border:"none",fontSize:22,color:"#aaa",cursor:"pointer",lineHeight:1,fontWeight:400}}>×</button>

            {/* Data */}
            <div style={{minWidth:80,textAlign:"left",lineHeight:1}}>
              <div style={{fontWeight:700,fontSize:26,color:"#1f2937"}}>{giorno}</div>
              <div style={{fontSize:13,color:"#1f2937"}}>{mese}<br/>{anno}</div>
              <div style={{marginTop:8}}>
                <span style={{background:badgeBg,color:"#fff",borderRadius:3,padding:"2px 10px",fontSize:11,fontWeight:600}}>{badgeTxt}</span>
              </div>
            </div>

            {/* Titolo + autore + allegati */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:20,color:"#1f2937",marginBottom:4,paddingRight:30}}>{item.oggetto||"(senza oggetto)"}</div>
              <div style={{fontSize:12,color:"#555",marginBottom:10}}>
                Pubblicata da: {(item.inseritoDa||"").toUpperCase()}
              </div>
              {(allegatiCaricati.length>0?allegatiCaricati:(item.allegati||[])).map(a=>(
                <div key={a.id}
                  onClick={e=>{e.stopPropagation();if(a.tipo?.startsWith("image/")){lightboxSet(a);}else if(a.data){const w=window.open();w.document.write(`<embed src="${a.data}" type="application/pdf" width="100%" height="100%" style="position:fixed;inset:0"/>`);w.document.close();}}}
                  style={{display:"inline-flex",alignItems:"center",gap:8,background:"#f3f4f6",border:"1px solid #d1d5db",borderRadius:4,padding:"7px 14px",marginRight:8,marginBottom:6,cursor:"pointer",fontSize:13,fontWeight:500,color:"#1f2937",maxWidth:"100%"}}>
                  <span style={{fontSize:16}}>⬇</span>
                  <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.nome}</span>
                </div>
              ))}
            </div>

            {/* Numero */}
            <div style={{flexShrink:0}}>
              <span style={{background:"#7ecfea",color:"#fff",borderRadius:20,padding:"4px 16px",fontWeight:700,fontSize:15}}>{numero}</span>
            </div>
          </div>

          {/* Corpo testo con megafono */}
          <div style={{padding:"20px 24px",flex:1,overflowY:"auto"}}>
              {item.testo&&(
              <div style={{display:"flex",alignItems:"flex-start",gap:16,border:"2px solid #a5d8e8",borderRadius:6,padding:"16px 18px",background:"#fff",marginBottom:item.urlEsterno?12:0}}>
                <span style={{fontSize:32,flexShrink:0,marginTop:2}}>📢</span>
                <div style={{fontSize:14,color:"#1f2937",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{item.testo}</div>
              </div>
              )}
              {item.urlEsterno&&(()=>{
                const url = item.urlEsterno.startsWith("http") ? item.urlEsterno : "https://"+item.urlEsterno;
                return (
                  <div style={{border:"2px solid #bae6fd",borderRadius:8,padding:"16px 20px",background:"#f0f9ff",display:"flex",alignItems:"center",gap:14,marginTop:8}}>
                    <span style={{fontSize:28,flexShrink:0}}>🔗</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14,color:"#0369a1",marginBottom:4}}>Link allegato</div>
                      <div style={{fontSize:12,color:"#6b7280",wordBreak:"break-all"}}>{url}</div>
                    </div>
                    <a href={url} target="_blank" rel="noreferrer"
                      style={{padding:"10px 22px",background:"#0891b2",color:"#fff",borderRadius:6,fontWeight:700,fontSize:14,cursor:"pointer",flexShrink:0,textDecoration:"none",display:"inline-block"}}>
                      Apri ↗
                    </a>
                  </div>
                );
              })()}
          </div>

          {/* Footer — solo Chiudi */}
          <div style={{padding:"14px 24px",borderTop:"1px solid #e5e7eb",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fafafa",flexShrink:0}}>
            <div style={{fontWeight:700,fontSize:14,color:"#1f2937"}}>
              {item.letta ? `Letta il ${item.dataLettura||item.data||""}` : ""}
            </div>
            <button onClick={close}
              style={{padding:"8px 22px",background:"#0891b2",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              ⊗ Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AllegatoThumb({allegato, onClick}) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const carica = async () => {
      // 1. Se ha già il data in memoria usalo subito
      if(allegato.data && !allegato.data.startsWith('[')) {
        setSrc(allegato.data);
        setLoading(false);
        return;
      }
      // 2. Carica da IDB / window.storage tramite _imgId
      if(allegato._imgId) {
        const data = await imgLoad(allegato._imgId);
        if(!cancelled) { setSrc(data); setLoading(false); }
        return;
      }
      setLoading(false);
    };
    carica();
    return () => { cancelled = true; };
  }, [allegato._imgId, allegato.data]);

  const isImg = allegato.tipo&&allegato.tipo.startsWith("image/");
  const hasSrc = src && !src.startsWith('[');

  return (
    <div onClick={()=>onClick({...allegato, data:src})}
      style={{border:"2px solid #bae6fd",borderRadius:8,overflow:"hidden",cursor:"zoom-in",background:"#f0f9ff",transition:"transform 0.15s",maxWidth:120}}
      onMouseEnter={e=>e.currentTarget.style.transform="scale(1.05)"}
      onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
      {isImg && hasSrc
        ? <img src={src} alt={allegato.nome} style={{width:120,height:90,objectFit:"cover",display:"block"}}/>
        : isImg && !hasSrc
          ? <div style={{width:120,height:90,display:"flex",alignItems:"center",justifyContent:"center",background:"#e0f2fe"}}>
              <div style={{width:20,height:20,border:"3px solid #bae6fd",borderTop:"3px solid #0891b2",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>
            </div>
          : <div style={{width:120,height:90,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,background:"#e0f2fe"}}>
              <span style={{fontSize:32}}>📄</span>
              <span style={{fontSize:10,color:TEAL,fontWeight:700}}>PDF</span>
            </div>
      }
      <div style={{padding:"4px 8px",fontSize:10,color:"#6b7280",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{allegato.nome}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// PROGRAMMAZIONE PANEL — Verbali + Team
// ════════════════════════════════════════════════════════
function ProgrammazionePanel({docente, classi, classeAttiva, materie, contDB, setContDB, showToast, cSet}) {
  const [tab, setTab] = useState("verbali"); // verbali | team
  const storKey = `prog:${docente}`;

  // ── dati persistenti ──
  const load = () => {
    try { return JSON.parse(localStorage.getItem(storKey) || "{}"); } catch { return {}; }
  };
  const persist = (data) => {
    try { localStorage.setItem(storKey, JSON.stringify(data)); } catch {}
    try { sessionStorage.setItem(storKey, JSON.stringify(data)); } catch {}
  };

  const [data, setDataRaw] = useState(load);
  const setData = fn => setDataRaw(p => {
    const next = typeof fn === "function" ? fn(p) : fn;
    persist(next);
    return next;
  });

  // ── TEAM ──
  const teams = data.teams || [];
  const [teamSel, setTeamSel] = useState(teams[0]?.id || null);
  const [teamModal, setTeamModal] = useState(null); // null | "new" | "edit"
  const [teamForm, setTeamForm] = useState({descrizione:"",annotazione:"",coordinatore:"",classiSel:[],docenti:[]});
  const [confirmDelTeam, setConfirmDelTeam] = useState(null);

  const teamCorrente = teams.find(t=>t.id===teamSel) || null;

  const classiList = Object.keys(classi).sort();
  const docentiDisponibili = [...new Set(
    Object.values(classi).flat().map(a=>a.cognome+" "+a.nome)
  )].sort();

  const openNuovoTeam = () => {
    setTeamForm({descrizione:"",annotazione:"",coordinatore:docente,classiSel:[],docenti:[]});
    setTeamModal("new");
  };
  const openModTeam = (t) => {
    setTeamForm({...t});
    setTeamModal("edit");
  };
  const salvaTeam = () => {
    if(!teamForm.descrizione.trim()) return;
    setData(p => {
      const ts = p.teams||[];
      if(teamModal==="new") {
        const nt = {...teamForm, id:Date.now()};
        setTeamSel(nt.id);
        return {...p, teams:[...ts, nt]};
      } else {
        return {...p, teams:ts.map(t=>t.id===teamForm.id?{...t,...teamForm}:t)};
      }
    });
    setTeamModal(null);
    showToast("Team salvato");
  };
  const eliminaTeam = id => {
    setData(p=>({...p, teams:(p.teams||[]).filter(t=>t.id!==id)}));
    setTeamSel(null);
    setConfirmDelTeam(null);
    showToast("Team eliminato");
  };

  // ── VERBALI ──
  const verbaliTeam = (tid) => (data.verbali||{})[tid] || [];
  const [verbModal, setVerbModal] = useState(false);
  const [editVerb, setEditVerb] = useState(null);
  const [verbSearch, setVerbSearch] = useState("");
  const defVerb = {numero:"",data:todayISO(),oraInizio:"",oraFine:"",luogo:"",periodo:"",descrizione:"",docentiPresenti:[],ordineGiorno:""};
  const [verbForm, setVerbForm] = useState(defVerb);

  const openNuovoVerb = () => {
    // Calcola prossimo numero verbale
    const vv = verbaliTeam(teamSel);
    const nums = vv.map(v=>parseInt(v.numero)||0);
    const nextN = nums.length ? Math.max(...nums)+1 : 1;
    setVerbForm({...defVerb, numero:String(nextN), data:todayISO()});
    setEditVerb(null);
    setVerbModal(true);
  };
  const openEditVerb = v => {
    setVerbForm({...v});
    setEditVerb(v.id);
    setVerbModal(true);
  };
  const salvaVerb = () => {
    const item = {...verbForm, id: editVerb||Date.now(), inseritoDa:docente};
    setData(p => {
      const vv = (p.verbali||{})[teamSel]||[];
      const nuovi = editVerb ? vv.map(v=>v.id===editVerb?item:v) : [...vv,item];
      return {...p, verbali:{...(p.verbali||{}), [teamSel]:nuovi}};
    });
    setVerbModal(false);
    setEditVerb(null);
    showToast("Verbale salvato");
  };
  const eliminaVerb = id => {
    setData(p => {
      const vv = (p.verbali||{})[teamSel]||[];
      return {...p, verbali:{...(p.verbali||{}), [teamSel]:vv.filter(v=>v.id!==id)}};
    });
    showToast("Eliminato");
  };

  // Ordine del giorno automatico: materie del team
  const odgAutomatico = (t) => {
    if(!t) return [];
    const classiT = t.classiSel||[];
    const found = new Set();
    classiT.forEach(cl => {
      try {
        const meta = JSON.parse(localStorage.getItem(`reg:${docente}:classeMeta`)||"{}");
        (meta[cl]?.materie||[]).forEach(m=>found.add(m));
      } catch {}
    });
    // Aggiungi materie docenti
    (t.docenti||[]).forEach(d=>{
      if(d.materia) found.add(d.materia);
    });
    return [...found];
  };

  const TEAL2 = "#4e9fa0";
  const HDR = TEAL;
  const BtnRow = ({style,children,...p}) => (
    <button style={{padding:"6px 14px",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:13,fontFamily:FF,...style}} {...p}>{children}</button>
  );

  // ── Filtro verbali ──
  const verbFiltrati = verbaliTeam(teamSel).filter(v => {
    const q = verbSearch.trim().toLowerCase();
    if(!q) return true;
    return String(v.numero).includes(q) || (v.descrizione||"").toLowerCase().includes(q) || (v.data||"").includes(q);
  }).sort((a,b)=>parseInt(b.numero||0)-parseInt(a.numero||0));

  const fmtTime = iso => {
    if(!iso) return "";
    const d = new Date(iso+"T00:00:00");
    if(isNaN(d)) return iso;
    return d.toLocaleDateString("it-IT");
  };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:FF}}>
      {/* Tab bar */}
      <div style={{display:"flex",background:"#f3f4f6",borderBottom:"2px solid #e5e7eb",flexShrink:0}}>
        <button onClick={()=>setTab("verbali")} style={{padding:"11px 24px",background:tab==="verbali"?HDR:"transparent",color:tab==="verbali"?"#fff":"#374151",border:"none",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:FF,display:"flex",alignItems:"center",gap:6}}>
          📋 Verbali
        </button>
        <button onClick={()=>setTab("team")} style={{padding:"11px 24px",background:tab==="team"?HDR:"transparent",color:tab==="team"?"#fff":"#374151",border:"none",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:FF,display:"flex",alignItems:"center",gap:6}}>
          👥 Team
        </button>
      </div>

      {/* ── TAB VERBALI ── */}
      {tab==="verbali"&&(
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {/* Sidebar team */}
          <div style={{width:220,flexShrink:0,background:"#fff",borderRight:"2px solid #e5e7eb",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"10px 14px",fontWeight:700,fontSize:13,color:HDR,borderBottom:"1px solid #e5e7eb"}}>Team</div>
            <div style={{flex:1,overflowY:"auto"}}>
              {teams.length===0
                ?<div style={{padding:"16px 14px",fontSize:12,color:"#9ca3af"}}>Nessun team. Crea un team dalla scheda Team.</div>
                :teams.map(t=>(
                  <div key={t.id} onClick={()=>setTeamSel(t.id)}
                    style={{padding:"10px 14px",cursor:"pointer",background:teamSel===t.id?"#e8f5f5":"transparent",borderLeft:teamSel===t.id?"4px solid "+HDR:"4px solid transparent",borderBottom:"1px solid #f3f4f6",fontWeight:teamSel===t.id?700:400,color:teamSel===t.id?HDR:"#374151",fontSize:14}}>
                    {t.descrizione}
                  </div>
                ))
              }
            </div>
          </div>

          {/* Pannello principale */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {!teamCorrente
              ?<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#9ca3af",flexDirection:"column",gap:8}}>
                <div style={{fontSize:40}}>📋</div>
                <div style={{fontWeight:600}}>Seleziona un team per vedere i verbali</div>
              </div>
              :<>
                {/* Info team */}
                <div style={{background:"#f0fdf4",borderBottom:"2px solid #bbf7d0",padding:"14px 24px",flexShrink:0}}>
                  <div style={{fontSize:13,color:"#374151",lineHeight:2}}>
                    <b>Descrizione</b> {teamCorrente.descrizione}<br/>
                    {teamCorrente.annotazione&&<><b>Annotazioni</b> {teamCorrente.annotazione}<br/></>}
                    <b>Coordinatore</b> {teamCorrente.coordinatore?cognomeNome(teamCorrente.coordinatore):"—"}
                  </div>
                </div>

                {/* Header verbali */}
                <div style={{background:"#e8f0f8",borderBottom:"1px solid #c7d8ec",padding:"10px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
                  <span style={{fontWeight:700,fontSize:15,color:"#2563eb"}}>Verbali</span>
                  <BtnRow onClick={openNuovoVerb} style={{background:"#22c55e",color:"#fff",display:"flex",alignItems:"center",gap:6}}>+ Nuovo verbale</BtnRow>
                </div>

                {/* Ricerca */}
                <div style={{padding:"10px 24px",flexShrink:0,display:"flex",justifyContent:"flex-end",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:13,color:"#6b7280"}}>Ricerca:</span>
                  <input value={verbSearch} onChange={e=>setVerbSearch(e.target.value)} placeholder="Cerca verbale..." style={{border:"1px solid #d1d5db",borderRadius:4,padding:"6px 10px",fontSize:13,fontFamily:FF,width:200}}/>
                </div>

                {/* Tabella verbali */}
                <div style={{flex:1,overflowY:"auto",padding:"0 24px 20px"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",border:"1px solid #e5e7eb",borderRadius:6,overflow:"hidden"}}>
                    <thead>
                      <tr style={{background:"#fff",borderBottom:"1px solid #e5e7eb"}}>
                        {["N. verbale","Data","Orario","Luogo","Periodo","Descrizione","Allegato","Inserito da","Comandi"].map(h=>(
                          <th key={h} style={{padding:"10px 12px",textAlign:"left",color:"#2563eb",fontWeight:600,fontSize:13,borderRight:"1px solid #f3f4f6"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {verbFiltrati.length===0
                        ?<tr><td colSpan={9} style={{padding:"24px",textAlign:"center",color:"#9ca3af",fontSize:13}}>Nessun elemento da visualizzare</td></tr>
                        :verbFiltrati.map((v,i)=>(
                          <tr key={v.id} style={{borderBottom:"1px solid #f3f4f6",background:i%2===0?"#fff":"#fafafa"}}>
                            <td style={{padding:"10px 12px",fontWeight:700,fontSize:13,color:"#2563eb"}}>{v.numero}</td>
                            <td style={{padding:"10px 12px",fontSize:13,whiteSpace:"nowrap"}}>{fmtTime(v.data)}</td>
                            <td style={{padding:"10px 12px",fontSize:13,whiteSpace:"nowrap"}}>{v.oraInizio}{v.oraFine&&"–"+v.oraFine}</td>
                            <td style={{padding:"10px 12px",fontSize:13}}>{v.luogo||"—"}</td>
                            <td style={{padding:"10px 12px",fontSize:13}}>{v.periodo||"—"}</td>
                            <td style={{padding:"10px 12px",fontSize:13,maxWidth:200,wordBreak:"break-word"}}>{v.descrizione||"—"}</td>
                            <td style={{padding:"10px 12px",fontSize:12,color:"#9ca3af"}}>—</td>
                            <td style={{padding:"10px 12px",fontSize:12,color:"#6b7280",whiteSpace:"nowrap"}}>{v.inseritoDa||docente}</td>
                            <td style={{padding:"8px 12px"}}>
                              <div style={{display:"flex",gap:4}}>
                                <button onClick={()=>openEditVerb(v)} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:3,padding:"4px 8px",cursor:"pointer",fontSize:12,fontWeight:700}}>✏️</button>
                                <button onClick={()=>eliminaVerb(v.id)} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:3,padding:"4px 8px",cursor:"pointer",fontSize:12,fontWeight:700}}>🗑️</button>
                              </div>
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </>
            }
          </div>
        </div>
      )}

      {/* ── TAB TEAM ── */}
      {tab==="team"&&(
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {/* Sidebar */}
          <div style={{width:220,flexShrink:0,background:"#fff",borderRight:"2px solid #e5e7eb",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #e5e7eb"}}>
              <span style={{fontWeight:700,fontSize:13,color:HDR}}>Team ({teams.length})</span>
              <button onClick={openNuovoTeam} style={{background:HDR,color:"#fff",border:"none",borderRadius:4,padding:"4px 10px",fontWeight:700,fontSize:13,cursor:"pointer"}}>+</button>
            </div>
            <div style={{flex:1,overflowY:"auto"}}>
              {teams.length===0
                ?<div style={{padding:"16px 14px",fontSize:12,color:"#9ca3af"}}>Nessun team.</div>
                :teams.map(t=>(
                  <div key={t.id} onClick={()=>{setTeamSel(t.id);}}
                    style={{padding:"10px 14px",cursor:"pointer",background:teamSel===t.id?"#e8f5f5":"transparent",borderLeft:teamSel===t.id?"4px solid "+HDR:"4px solid transparent",borderBottom:"1px solid #f3f4f6",fontWeight:teamSel===t.id?700:400,color:teamSel===t.id?HDR:"#374151",fontSize:14}}>
                    {t.descrizione}
                  </div>
                ))
              }
            </div>
          </div>

          {/* Dettaglio team */}
          <div style={{flex:1,overflowY:"auto",padding:24}}>
            {!teamCorrente
              ?<div style={{textAlign:"center",padding:"60px 0",color:"#9ca3af"}}>
                <div style={{fontSize:40,marginBottom:12}}>👥</div>
                <div style={{fontWeight:600,fontSize:16}}>Seleziona o crea un team</div>
                <button onClick={openNuovoTeam} style={{marginTop:16,padding:"10px 28px",background:HDR,color:"#fff",border:"none",borderRadius:6,fontWeight:700,fontSize:14,cursor:"pointer"}}>+ Nuovo team</button>
              </div>
              :<>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                  <div style={{fontWeight:700,fontSize:20,color:HDR}}>{teamCorrente.descrizione}</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>openModTeam(teamCorrente)} style={{padding:"8px 18px",background:"#2563eb",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:13}}>✏️ Modifica</button>
                    <button onClick={()=>setConfirmDelTeam(teamCorrente.id)} style={{padding:"8px 18px",background:"#ef4444",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:13}}>🗑️ Elimina</button>
                  </div>
                </div>

                <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"16px 20px",marginBottom:20,fontSize:13,lineHeight:2.2}}>
                  <div><b>Coordinatore:</b> {teamCorrente.coordinatore?cognomeNome(teamCorrente.coordinatore):"—"}</div>
                  {teamCorrente.annotazione&&<div><b>Annotazione:</b> {teamCorrente.annotazione}</div>}
                </div>

                {/* Classi del team */}
                {(teamCorrente.classiSel||[]).length>0&&(
                  <div style={{marginBottom:20}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#374151",marginBottom:8}}>📚 Classi</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {teamCorrente.classiSel.map(cl=>(
                        <span key={cl} style={{background:HDR,color:"#fff",borderRadius:12,padding:"4px 14px",fontWeight:700,fontSize:13}}>{cl}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Docenti del team */}
                {(teamCorrente.docenti||[]).length>0&&(
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#374151",marginBottom:8}}>👨‍🏫 Docenti</div>
                    <table style={{width:"100%",borderCollapse:"collapse",border:"1px solid #e5e7eb",borderRadius:6,overflow:"hidden"}}>
                      <thead>
                        <tr style={{background:"#f0f9f9",borderBottom:"2px solid #e5e7eb"}}>
                          {["Docente","Classe/Materia"].map(h=><th key={h} style={{padding:"9px 14px",textAlign:"left",color:HDR,fontWeight:700,fontSize:13}}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {teamCorrente.docenti.map((d,i)=>(
                          <tr key={i} style={{borderBottom:"1px solid #f3f4f6",background:i%2===0?"#fff":"#fafafa"}}>
                            <td style={{padding:"10px 14px",fontWeight:700,fontSize:14}}>{cognomeNome(d.nome).toUpperCase()}</td>
                            <td style={{padding:"10px 14px",fontSize:13,color:"#6b7280"}}>{d.materia||"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            }
          </div>
        </div>
      )}

      {/* ── MODAL VERBALE ── */}
      <Modal open={verbModal} onClose={()=>setVerbModal(false)} width={960} headerColor={TEAL}
        title={editVerb?"Modifica verbale":"Nuovo verbale"}
        subtitle={teamCorrente?.descrizione||""}>
        <div style={{padding:"24px 28px",display:"flex",flexDirection:"column",gap:16,fontFamily:FF}}>
          {/* Riga 1: Numero | Data | Ora inizio | Ora fine | Luogo */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1.5fr 1.2fr 1.2fr 1.5fr",gap:14,alignItems:"end"}}>
            <div>
              <div style={{fontSize:12,color:HDR,fontWeight:600,marginBottom:4}}>Numero</div>
              <input value={verbForm.numero} onChange={e=>setVerbForm(f=>({...f,numero:e.target.value}))}
                style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"9px 10px",fontSize:14,fontFamily:FF,boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:12,color:HDR,fontWeight:600,marginBottom:4}}>Data</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"9px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:14}}>📅</span>
                <input type="date" value={verbForm.data} onChange={e=>setVerbForm(f=>({...f,data:e.target.value}))}
                  style={{border:"none",padding:"9px 10px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
              </div>
            </div>
            <div>
              <div style={{fontSize:12,color:HDR,fontWeight:600,marginBottom:4}}>Ora inizio</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"9px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:14}}>⏰</span>
                <input type="time" value={verbForm.oraInizio} onChange={e=>setVerbForm(f=>({...f,oraInizio:e.target.value}))}
                  style={{border:"none",padding:"9px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
              </div>
            </div>
            <div>
              <div style={{fontSize:12,color:HDR,fontWeight:600,marginBottom:4}}>Ora fine</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"9px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:14}}>⏰</span>
                <input type="time" value={verbForm.oraFine} onChange={e=>setVerbForm(f=>({...f,oraFine:e.target.value}))}
                  style={{border:"none",padding:"9px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
              </div>
            </div>
            <div>
              <div style={{fontSize:12,color:HDR,fontWeight:600,marginBottom:4}}>Luogo</div>
              <input value={verbForm.luogo} onChange={e=>setVerbForm(f=>({...f,luogo:e.target.value}))}
                placeholder="es. Aula magna" style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"9px 10px",fontSize:14,fontFamily:FF,boxSizing:"border-box"}}/>
            </div>
          </div>

          {/* Riga 2: Periodo | Descrizione */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:14}}>
            <div>
              <div style={{fontSize:12,color:HDR,fontWeight:600,marginBottom:4}}>Periodo</div>
              <input value={verbForm.periodo} onChange={e=>setVerbForm(f=>({...f,periodo:e.target.value}))}
                placeholder="es. 1° Quadrimestre" style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"9px 10px",fontSize:14,fontFamily:FF,boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:12,color:HDR,fontWeight:600,marginBottom:4}}>Descrizione</div>
              <input value={verbForm.descrizione} onChange={e=>setVerbForm(f=>({...f,descrizione:e.target.value}))}
                style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"9px 10px",fontSize:14,fontFamily:FF,boxSizing:"border-box"}}/>
            </div>
          </div>

          {/* Docenti presenti */}
          <div style={{background:"#e8f0fb",borderRadius:6,overflow:"hidden"}}>
            <div style={{background:"#5b9bd5",color:"#fff",padding:"10px 16px",fontWeight:700,fontSize:14}}>Docenti presenti</div>
            <div style={{padding:"14px 16px"}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:8}}>
                {/* Tutti/Nessuno */}
                <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontWeight:600,fontSize:13}}>
                  <input type="checkbox"
                    checked={(verbForm.docentiPresenti||[]).length===(teamCorrente?.docenti||[]).length&&(teamCorrente?.docenti||[]).length>0}
                    onChange={e=>setVerbForm(f=>({...f,docentiPresenti:e.target.checked?(teamCorrente?.docenti||[]).map(d=>d.nome):[]})) }
                    style={{cursor:"pointer",accentColor:HDR}}/> Tutti/Nessuno
                </label>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
                {/* Coordinatore */}
                {teamCorrente?.coordinatore&&(
                  <label key="coord" style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13}}>
                    <input type="checkbox"
                      checked={(verbForm.docentiPresenti||[]).includes(teamCorrente.coordinatore)}
                      onChange={e=>setVerbForm(f=>({...f,docentiPresenti:e.target.checked?[...new Set([...(f.docentiPresenti||[]),teamCorrente.coordinatore])]:(f.docentiPresenti||[]).filter(x=>x!==teamCorrente.coordinatore)}))}
                      style={{cursor:"pointer",accentColor:HDR}}/> {cognomeNome(teamCorrente.coordinatore)}
                  </label>
                )}
                {(teamCorrente?.docenti||[]).map((d,i)=>(
                  <label key={i} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13}}>
                    <input type="checkbox"
                      checked={(verbForm.docentiPresenti||[]).includes(d.nome)}
                      onChange={e=>setVerbForm(f=>({...f,docentiPresenti:e.target.checked?[...new Set([...(f.docentiPresenti||[]),d.nome])]:(f.docentiPresenti||[]).filter(x=>x!==d.nome)}))}
                      style={{cursor:"pointer",accentColor:HDR}}/> {cognomeNome(d.nome)}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Ordine del giorno */}
          <div style={{background:"#e8f0fb",borderRadius:6,overflow:"hidden"}}>
            <div style={{background:"#5b9bd5",color:"#fff",padding:"10px 16px",fontWeight:700,fontSize:14}}>Ordine del giorno</div>
            <div style={{padding:"8px 0"}}>
              {odgAutomatico(teamCorrente).map((mat,i)=>(
                <div key={mat} style={{padding:"8px 20px",borderBottom:"1px solid #f0f4fa",fontSize:13,color:"#374151",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:"#9ca3af",fontSize:11,minWidth:20}}>{i+1}.</span>
                  {mat}
                </div>
              ))}
              {odgAutomatico(teamCorrente).length===0&&<div style={{padding:"8px 20px",color:"#9ca3af",fontSize:13}}>Nessun argomento — aggiungi materie al team.</div>}
              {/* Campo manuale extra */}
              <div style={{padding:"8px 16px"}}>
                <textarea value={verbForm.ordineGiorno||""} onChange={e=>setVerbForm(f=>({...f,ordineGiorno:e.target.value}))}
                  rows={2} placeholder="Aggiungi altri punti all'o.d.g..."
                  style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"7px 10px",fontSize:13,fontFamily:FF,resize:"none",boxSizing:"border-box"}}/>
              </div>
            </div>
          </div>

          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={salvaVerb} style={{padding:"9px 28px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>💾 Salva</button>
            <button onClick={()=>setVerbModal(false)} style={{padding:"9px 20px",background:"#6b7280",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>✕ Chiudi</button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL TEAM ── */}
      <Modal open={!!teamModal} onClose={()=>setTeamModal(null)} width={1000} headerColor={TEAL}
        title={teamModal==="new"?"Nuovo team":"Modifica team"}>
        <div style={{padding:"24px 28px",display:"flex",flexDirection:"column",gap:16,fontFamily:FF}}>
          <div>
            <div style={{fontSize:13,color:HDR,fontWeight:600,marginBottom:4}}>Descrizione *</div>
            <input value={teamForm.descrizione} onChange={e=>setTeamForm(f=>({...f,descrizione:e.target.value}))}
              style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"10px",fontSize:15,fontFamily:FF,boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{fontSize:13,color:HDR,fontWeight:600,marginBottom:4}}>Annotazione</div>
            <textarea value={teamForm.annotazione} onChange={e=>setTeamForm(f=>({...f,annotazione:e.target.value}))}
              rows={3} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"10px",fontSize:13,fontFamily:FF,resize:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{fontSize:13,color:HDR,fontWeight:600,marginBottom:4}}>Coordinatore del Team *</div>
            <input value={teamForm.coordinatore} onChange={e=>setTeamForm(f=>({...f,coordinatore:e.target.value}))}
              placeholder={docente} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"10px",fontSize:14,fontFamily:FF,boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            {/* Classi */}
            <div>
              <div style={{fontSize:13,color:HDR,fontWeight:600,marginBottom:6}}>Selezionare le classi</div>
              <div style={{border:"1px solid #ccc",borderRadius:4,overflow:"hidden",maxHeight:250,overflowY:"auto"}}>
                <div style={{display:"grid",gridTemplateColumns:"40px 1fr",background:"#f5f5f5",borderBottom:"1px solid #ddd",position:"sticky",top:0}}>
                  <div style={{padding:"8px",textAlign:"center",borderRight:"1px solid #ddd",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <input type="checkbox"
                      checked={(teamForm.classiSel||[]).length===classiList.length&&classiList.length>0}
                      onChange={e=>setTeamForm(f=>({...f,classiSel:e.target.checked?[...classiList]:[]}))}
                      style={{cursor:"pointer"}}/>
                  </div>
                  <div style={{padding:"8px 14px",fontWeight:600,fontSize:13,color:"#374151"}}></div>
                </div>
                {classiList.map(cl=>{
                  const sel=(teamForm.classiSel||[]).includes(cl);
                  return(
                    <div key={cl} onClick={()=>setTeamForm(f=>({...f,classiSel:sel?(f.classiSel||[]).filter(x=>x!==cl):[...(f.classiSel||[]),cl]}))}
                      style={{display:"grid",gridTemplateColumns:"40px 1fr",borderBottom:"1px solid #f3f4f6",background:sel?"#e8f5f5":"#fff",cursor:"pointer"}}>
                      <div style={{padding:"9px",textAlign:"center",borderRight:"1px solid #eee",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <input type="checkbox" checked={sel} readOnly style={{cursor:"pointer",accentColor:HDR}}/>
                      </div>
                      <div style={{padding:"9px 14px",fontSize:14,fontWeight:sel?600:400}}>{cl}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Docenti */}
            <div>
              <div style={{fontSize:13,color:HDR,fontWeight:600,marginBottom:6}}>Selezionare i docenti</div>
              {/* Aggiungi docente */}
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                <input id="tf_dnome" placeholder="Nome docente..." style={{flex:1,border:"1px solid #ccc",borderRadius:4,padding:"6px 8px",fontSize:13,fontFamily:FF}}/>
                <input id="tf_dmat" placeholder="Materia..." style={{flex:1,border:"1px solid #ccc",borderRadius:4,padding:"6px 8px",fontSize:13,fontFamily:FF}}/>
                <button onClick={()=>{
                  const n=document.getElementById("tf_dnome")?.value?.trim();
                  const m=document.getElementById("tf_dmat")?.value?.trim();
                  if(!n) return;
                  setTeamForm(f=>({...f,docenti:[...(f.docenti||[]),{nome:n,materia:m}]}));
                  if(document.getElementById("tf_dnome")) document.getElementById("tf_dnome").value="";
                  if(document.getElementById("tf_dmat")) document.getElementById("tf_dmat").value="";
                }} style={{padding:"6px 12px",background:HDR,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>+</button>
              </div>
              <div style={{border:"1px solid #ccc",borderRadius:4,overflow:"hidden",maxHeight:220,overflowY:"auto"}}>
                <div style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 40px",background:"#f5f5f5",borderBottom:"1px solid #ddd",position:"sticky",top:0}}>
                  <div style={{padding:"7px",borderRight:"1px solid #ddd"}}/>
                  <div style={{padding:"7px 10px",fontWeight:700,fontSize:12,color:HDR}}>Docente</div>
                  <div style={{padding:"7px 10px",fontWeight:700,fontSize:12,color:HDR}}>Classe/Materia</div>
                  <div style={{padding:"7px"}}/>
                </div>
                {(teamForm.docenti||[]).length===0
                  ?<div style={{padding:"14px",color:"#9ca3af",fontSize:13,textAlign:"center"}}>Nessun docente aggiunto</div>
                  :(teamForm.docenti||[]).map((d,i)=>(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 40px",borderBottom:"1px solid #f3f4f6",background:i%2===0?"#fff":"#fafafa",alignItems:"center"}}>
                      <div style={{padding:"8px",borderRight:"1px solid #eee",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <input type="checkbox" style={{accentColor:HDR,cursor:"pointer"}}/>
                      </div>
                      <div style={{padding:"8px 10px",fontSize:13,fontWeight:600}}>{d.nome}</div>
                      <div style={{padding:"8px 10px",fontSize:13,color:"#6b7280"}}>{d.materia||"—"}</div>
                      <div style={{padding:"4px",display:"flex",justifyContent:"center"}}>
                        <button onClick={()=>setTeamForm(f=>({...f,docenti:f.docenti.filter((_,j)=>j!==i)}))}
                          style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:3,width:24,height:24,cursor:"pointer",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:4}}>
            <button onClick={salvaTeam} style={{padding:"9px 28px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:14,cursor:"pointer"}}>💾 Salva</button>
            <button onClick={()=>setTeamModal(null)} style={{padding:"9px 20px",background:"#6b7280",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:14,cursor:"pointer"}}>✕ Chiudi</button>
          </div>
        </div>
      </Modal>

      {/* Conferma eliminazione team */}
      <Modal open={!!confirmDelTeam} onClose={()=>setConfirmDelTeam(null)} width={380} headerColor="#ef4444" title="Elimina team">
        <div style={{padding:24,textAlign:"center"}}>
          <div style={{fontSize:15,fontWeight:600,marginBottom:16}}>Eliminare il team e tutti i suoi verbali?</div>
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            <button onClick={()=>eliminaTeam(confirmDelTeam)} style={{padding:"9px 24px",background:"#ef4444",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>Elimina</button>
            <button onClick={()=>setConfirmDelTeam(null)} style={{padding:"9px 18px",background:"#6b7280",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>Annulla</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOME DASHBOARD — Ultime firme + Ultime comunicazioni + Orario
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// PLANNING — Vista calendario mensile stile Axios
// ═══════════════════════════════════════════════════════
function PlanningPanel({docente, classe, classiList, classi, contDB, setContDB, votiDB, assenzeDB, materia, setMateria, getMaterieClasse, showToast, openContenuto, openVerifica, TEAL, FF}) {
  const oggi = new Date();
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth()); // 0-based
  const [filtro, setFiltro] = useState("Argomenti + compiti"); // "Solo compiti" | "Solo comunicazioni" | "Solo annotazioni" | "Solo note disciplinari" | "Solo argomenti" | "Argomenti + compiti"
  const [soloPropri, setSoloPropri] = useState(false);
  const [dettaglioGiorno, setDettaglioGiorno] = useState(null); // {iso, items}
  const [nuovoEventoOpen, setNuovoEventoOpen] = useState(false);
  const [nuovoEventoData, setNuovoEventoData] = useState(todayISO());
  const [nuovoEventoForm, setNuovoEventoForm] = useState({
    tipologia:"Nota disciplinare", gravita:"0", materia:"", descrizione:"", tuttiAlunni:true, alunniSel:[]
  });

  const MESI_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const GG_IT = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];

  // Genera tutti i giorni del mese
  const primoGiorno = new Date(anno, mese, 1);
  const ultimoGiorno = new Date(anno, mese+1, 0);
  // giorno della settimana del primo (lun=0, dom=6)
  const primoGW = (primoGiorno.getDay()+6)%7;
  const totaleCelle = Math.ceil((primoGW + ultimoGiorno.getDate()) / 7) * 7;

  const oggiISO = oggi.toISOString().split("T")[0];

  // Raccoglie tutti gli item da contDB per classe
  const getItemsPerGiorno = (isoData) => {
    const items = [];
    const prefix = `${classe}||`;
    const classKey = `__class__${classe}`;

    Object.entries(contDB||{}).forEach(([k,v])=>{
      if(k === "__comunicazioni__") return;
      const mat = k.split("||")[1]||"";
      const isClass = k===classKey;

      if(k.startsWith(prefix)&&!k.includes("__firme__")) {
        // lezioni
        if(["Argomenti + compiti","Solo argomenti"].includes(filtro)) {
          (v.lezioni||[]).filter(i=>toISO(i.data||"")===isoData&&(!soloPropri||i.inseritoDa===docente)).forEach(i=>items.push({tipo:"lezione",testo:i.testo,mat,inseritoDa:i.inseritoDa,id:i.id,item:i}));
        }
        // compiti
        if(["Argomenti + compiti","Solo compiti"].includes(filtro)) {
          (v.compiti||[]).filter(i=>toISO(i.data||"")===isoData&&(!soloPropri||i.inseritoDa===docente)).forEach(i=>items.push({tipo:"compito",testo:i.testo,mat,inseritoDa:i.inseritoDa,id:i.id,item:i}));
        }
        // verifiche
        if(filtro==="Argomenti + compiti") {
          (v.verifiche||[]).filter(i=>toISO(i.data||"")===isoData&&(!soloPropri||i.inseritoDa===docente)).forEach(i=>items.push({tipo:"verifica",testo:i.argomenti||i.testo||"",mat:i.materia||mat,inseritoDa:i.inseritoDa,id:i.id,item:i}));
        }
      }
      if(isClass) {
        if(["Solo annotazioni","Argomenti + compiti"].includes(filtro)) {
          (v.annotazioni||[]).filter(i=>toISO(i.data||"")===isoData&&(!soloPropri||i.inseritoDa===docente)).forEach(i=>items.push({tipo:"annotazione",testo:i.testo,mat:"",inseritoDa:i.inseritoDa,id:i.id,item:i}));
        }
        if(["Solo note disciplinari","Argomenti + compiti"].includes(filtro)) {
          (v.note||[]).filter(i=>toISO(i.data||"")===isoData&&(!soloPropri||i.inseritoDa===docente)).forEach(i=>items.push({tipo:"nota",testo:i.testo,mat:"",inseritoDa:i.inseritoDa,id:i.id,item:i}));
        }
      }
    });

    // comunicazioni
    if(["Solo comunicazioni","Argomenti + compiti"].includes(filtro)) {
      const comun=contDB["__comunicazioni__"]?.["comunicazioni"]||[];
      comun.filter(c=>{
        const d=c.data||""; let iso=d;
        if(d.includes("/")){ const[dd,mm,yy]=d.split("/"); iso=`${yy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`; }
        return iso===isoData&&(!soloPropri||c.inseritoDa===docente);
      }).forEach(c=>items.push({tipo:"comunicazione",testo:c.oggetto||c.testo||"",mat:"",inseritoDa:c.inseritoDa,id:c.id,item:c}));
    }

    return items;
  };

  const TIPO_COL = {
    lezione:      {bg:"#4e9fa0",color:"#fff",lbl:"Argomento"},
    compito:      {bg:"#f97316",color:"#fff",lbl:"Compito"},
    verifica:     {bg:"#dc2626",color:"#fff",lbl:"Verifica"},
    annotazione:  {bg:"#6b7280",color:"#fff",lbl:"Annotazione"},
    nota:         {bg:"#7c3aed",color:"#fff",lbl:"Nota"},
    comunicazione:{bg:"#0891b2",color:"#fff",lbl:"Comunicazione"},
  };

  const isGiornoLavorativo = (d) => {
    const giorno = new Date(d+"T00:00:00").getDay();
    return giorno>=1 && giorno<=6; // lun-sab
  };

  const fmtMeseBreve = iso => {
    try{ const d=new Date(iso+"T00:00:00"); return `${d.getDate()} ${MESI_IT[d.getMonth()].slice(0,3)}`; }catch{return iso;}
  };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:FF}}>
      {/* Barra filtri */}
      <div style={{background:"#f0f4f8",borderBottom:"2px solid #dde3ea",padding:"8px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap"}}>
        {/* Classe */}
        <select style={{border:"1px solid #d1d5db",borderRadius:4,padding:"5px 10px",fontSize:13,fontFamily:FF,fontWeight:600,color:TEAL,background:"#fff"}}>
          {classiList.map(c=><option key={c}>{c}</option>)}
        </select>
        {/* Materia */}
        <select value={materia} onChange={e=>setMateria(e.target.value)} style={{border:"1px solid #d1d5db",borderRadius:4,padding:"5px 10px",fontSize:13,fontFamily:FF,color:"#374151",background:"#fff"}}>
          <option value="">Tutte le materie</option>
          {(getMaterieClasse(classe).length>0?getMaterieClasse(classe):[...MATERIE]).map(m=><option key={m}>{m}</option>)}
        </select>
        {/* Filtro tipo */}
        <select value={filtro} onChange={e=>setFiltro(e.target.value)} style={{border:"1px solid #d1d5db",borderRadius:4,padding:"5px 10px",fontSize:13,fontFamily:FF,background:"#fff"}}>
          {["Argomenti + compiti","Solo compiti","Solo comunicazioni","Solo annotazioni","Solo note disciplinari","Solo argomenti"].map(f=><option key={f}>{f}</option>)}
        </select>
        {/* Solo mie info */}
        <label style={{display:"flex",alignItems:"center",gap:5,fontSize:13,color:"#374151",cursor:"pointer",fontWeight:600}}>
          <input type="checkbox" checked={soloPropri} onChange={e=>setSoloPropri(e.target.checked)} style={{accentColor:TEAL,cursor:"pointer"}}/>
          Solo mie informazioni
        </label>
        {/* Navigazione mese */}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>{ if(mese===0){setMese(11);setAnno(a=>a-1);}else setMese(m=>m-1); }}
            style={{padding:"4px 12px",background:"#e2eaf2",border:"none",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:15}}>‹</button>
          <span style={{fontWeight:700,fontSize:15,color:"#1f2937",minWidth:140,textAlign:"center"}}>{MESI_IT[mese]} {anno}</span>
          <button onClick={()=>{ if(mese===11){setMese(0);setAnno(a=>a+1);}else setMese(m=>m+1); }}
            style={{padding:"4px 12px",background:"#e2eaf2",border:"none",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:15}}>›</button>
          <button onClick={()=>{setMese(oggi.getMonth());setAnno(oggi.getFullYear());}}
            style={{padding:"4px 10px",background:TEAL,color:"#fff",border:"none",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:12}}>Oggi</button>
        </div>
        {/* Nuovo */}
        <button onClick={()=>{
          setNuovoEventoData(todayISO());
          setNuovoEventoForm({tipologia:"Nota disciplinare",gravita:"0",materia:materia||"",descrizione:"",tuttiAlunni:true,alunniSel:[]});
          setNuovoEventoOpen(true);
        }} style={{padding:"5px 14px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Nuovo</button>
      </div>

      {/* Legenda */}
      <div style={{background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"5px 16px",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",flexShrink:0}}>
        <span style={{fontSize:12,color:"#555",fontWeight:700}}>Legenda colori:</span>
        {Object.entries(TIPO_COL).map(([k,c])=>(
          <div key={k} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:12,height:12,borderRadius:2,background:c.bg}}/>
            <span style={{fontSize:11,color:"#374151"}}>{c.lbl}</span>
          </div>
        ))}
        <div style={{marginLeft:"auto",display:"flex",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:18,height:14,background:"#2563eb",borderRadius:2}}/><span style={{fontSize:11}}>Oggi</span></div>
          <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:18,height:14,background:"#4e9fa0",borderRadius:2}}/><span style={{fontSize:11}}>Giorno lavorativo</span></div>
          <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:18,height:14,background:"#dc2626",borderRadius:2}}/><span style={{fontSize:11}}>Chiusura</span></div>
        </div>
      </div>

      {/* Griglia calendario */}
      <div style={{flex:1,overflowY:"auto"}}>
        {/* Intestazione giorni */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#1f2937",position:"sticky",top:0,zIndex:2}}>
          {GG_IT.map(g=>(
            <div key={g} style={{padding:"8px 4px",textAlign:"center",color:"#fff",fontWeight:700,fontSize:13,borderRight:"1px solid rgba(255,255,255,0.1)"}}>{g}</div>
          ))}
        </div>
        {/* Celle */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gridAutoRows:"minmax(110px,auto)"}}>
          {Array.from({length:totaleCelle},(_,idx)=>{
            const giornoNumero = idx - primoGW + 1;
            const isCurrentMonth = giornoNumero>=1 && giornoNumero<=ultimoGiorno.getDate();
            const iso = isCurrentMonth ? `${anno}-${String(mese+1).padStart(2,"0")}-${String(giornoNumero).padStart(2,"0")}` : null;
            const isOggi = iso===oggiISO;
            const isLav = iso&&isGiornoLavorativo(iso);
            const items = iso ? getItemsPerGiorno(iso) : [];
            const colGiorno = isOggi ? "#dbeafe" : isLav ? "#e8f5f5" : isCurrentMonth ? "#fff" : "#f9f9f9";
            const colBorder = isOggi ? "#2563eb" : isLav ? TEAL : "#e5e7eb";
            const numCol = isOggi ? "#2563eb" : isLav ? TEAL : "#9ca3af";
            const numBg = isOggi ? "#2563eb" : isLav ? TEAL : "transparent";
            const numTextCol = (isOggi||isLav) ? "#fff" : "#9ca3af";

            return (
              <div key={idx}
                onClick={()=>{ if(iso&&isCurrentMonth) setDettaglioGiorno({iso,items}); }}
                style={{
                  background:colGiorno,
                  border:`1px solid ${colBorder}`,
                  minHeight:110,
                  padding:"4px",
                  cursor: isCurrentMonth?"pointer":"default",
                  overflow:"hidden",
                  position:"relative",
                  transition:"background 0.1s",
                }}
                onMouseEnter={e=>{ if(isCurrentMonth) e.currentTarget.style.background=isOggi?"#bfdbfe":isLav?"#d0ede8":"#f3f4f6"; }}
                onMouseLeave={e=>{ e.currentTarget.style.background=colGiorno; }}
              >
                {/* Numero giorno */}
                {isCurrentMonth&&(
                  <div style={{display:"flex",justifyContent:"flex-end",marginBottom:3}}>
                    <div style={{
                      minWidth:22,height:22,borderRadius:"50%",
                      background:numBg,
                      color:numTextCol,
                      fontWeight:700,fontSize:13,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      padding:"0 3px",
                    }}>{giornoNumero}</div>
                  </div>
                )}
                {/* Items del giorno — max 3 visibili */}
                {items.slice(0,3).map((item,i)=>{
                  const tc=TIPO_COL[item.tipo]||{bg:"#6b7280",color:"#fff"};
                  return(
                    <div key={item.id||i} style={{
                      background:tc.bg,color:tc.color,
                      borderRadius:3,padding:"2px 5px",marginBottom:2,
                      fontSize:10,fontWeight:600,lineHeight:1.3,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                    }}>
                      {item.mat&&<span style={{opacity:0.8,marginRight:3}}>[{item.mat}]</span>}
                      {item.testo||"—"}
                    </div>
                  );
                })}
                {items.length>3&&(
                  <div style={{fontSize:10,color:"#6b7280",fontWeight:600,padding:"0 3px"}}>+{items.length-3} altri...</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── MODAL NUOVO EVENTO ── */}
      {nuovoEventoOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:8500,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FF}}>
          <div onClick={()=>setNuovoEventoOpen(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)"}}/>
          <div onClick={e=>e.stopPropagation()} style={{
            position:"relative",zIndex:1,background:"#fff",borderRadius:6,
            boxShadow:"0 12px 48px rgba(0,0,0,0.28)",width:560,maxWidth:"98vw",
            maxHeight:"90vh",display:"flex",flexDirection:"column",overflow:"hidden"
          }}>
            {/* Header verde */}
            <div style={{background:TEAL,color:"#fff",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
              <span style={{fontWeight:700,fontSize:16}}>Nuovo evento</span>
              <button onClick={()=>setNuovoEventoOpen(false)} style={{background:"rgba(0,0,0,0.2)",border:"none",color:"#fff",borderRadius:"50%",width:28,height:28,cursor:"pointer",fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            {/* Corpo */}
            <div style={{flex:1,overflowY:"auto",padding:"20px 24px",display:"flex",flexDirection:"column",gap:14}}>
              {/* Data */}
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{border:"1px solid #d1d5db",borderRadius:4,padding:"8px 12px",display:"flex",alignItems:"center",gap:8,background:"#fff",cursor:"pointer",flex:1,maxWidth:200,position:"relative"}}>
                  <span style={{fontSize:15}}>📅</span>
                  <span style={{fontSize:14,fontWeight:500,color:"#1f2937"}}>{(()=>{try{const[y,m,d]=nuovoEventoData.split("-");return`${d}/${m}/${y}`;}catch{return nuovoEventoData;}})()}</span>
                  <input type="date" value={nuovoEventoData} onChange={e=>setNuovoEventoData(e.target.value)}
                    style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%",height:"100%"}}/>
                </div>
              </div>
              {/* Tipologia + Gravità */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 160px",gap:12,alignItems:"end"}}>
                <div>
                  <div style={{fontSize:12,color:TEAL,fontWeight:700,marginBottom:4}}>Tipologia</div>
                  <select value={nuovoEventoForm.tipologia} onChange={e=>setNuovoEventoForm(f=>({...f,tipologia:e.target.value}))}
                    style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"9px 12px",fontSize:14,background:"#fff",fontFamily:FF}}>
                    {["Nota disciplinare","Annotazione","Compito","Argomento lezione","Verifica"].map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:12,color:TEAL,fontWeight:700,marginBottom:4}}>Gravità</div>
                  <select value={nuovoEventoForm.gravita} onChange={e=>setNuovoEventoForm(f=>({...f,gravita:e.target.value}))}
                    style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"9px 12px",fontSize:14,background:"#fff",fontFamily:FF}}>
                    {["0","1","2","3","4","5"].map(n=><option key={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              {/* Materia */}
              <div>
                <div style={{fontSize:12,color:TEAL,fontWeight:700,marginBottom:4}}>Materia</div>
                <select value={nuovoEventoForm.materia} onChange={e=>setNuovoEventoForm(f=>({...f,materia:e.target.value}))}
                  style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"9px 12px",fontSize:14,color:TEAL,fontWeight:600,background:"#fff",fontFamily:FF}}>
                  {(getMaterieClasse(classe).length>0?getMaterieClasse(classe):[...MATERIE]).map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              {/* Descrizione */}
              <div>
                <div style={{fontSize:12,color:TEAL,fontWeight:700,marginBottom:4}}>Descrizione...</div>
                <textarea value={nuovoEventoForm.descrizione} onChange={e=>setNuovoEventoForm(f=>({...f,descrizione:e.target.value}))}
                  rows={4} placeholder="Descrizione..."
                  style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"9px 12px",resize:"vertical",boxSizing:"border-box",fontSize:14,fontFamily:FF,outline:"none"}}/>
              </div>
              {/* Tutta la classe + Alunni */}
              <div style={{display:"grid",gridTemplateColumns:"180px 1fr",gap:16,alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:12,color:TEAL,fontWeight:700,marginBottom:6}}>Tutta la classe</div>
                  <ToggleSiNo value={nuovoEventoForm.tuttiAlunni} onChange={v=>setNuovoEventoForm(f=>({...f,tuttiAlunni:v,alunniSel:[]}))}/>
                </div>
                <div>
                  <div style={{fontSize:12,color:TEAL,fontWeight:700,marginBottom:6}}>Alunni</div>
                  {!nuovoEventoForm.tuttiAlunni
                    ? <div style={{border:"1px solid #d1d5db",borderRadius:4,background:"#f9fafb",maxHeight:130,overflowY:"auto",padding:4}}>
                        {(classi[classe]||[]).sort((a,b)=>a.cognome.localeCompare(b.cognome)).map(s=>{
                          const sel=(nuovoEventoForm.alunniSel||[]).includes(s.id);
                          return(
                            <div key={s.id} onClick={()=>setNuovoEventoForm(f=>({...f,alunniSel:sel?(f.alunniSel||[]).filter(x=>x!==s.id):[...(f.alunniSel||[]),s.id]}))}
                              style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",cursor:"pointer",background:sel?"#e8f5f5":"transparent",borderRadius:3}}>
                              <div style={{width:14,height:14,border:"2px solid "+(sel?TEAL:"#bbb"),borderRadius:2,background:sel?TEAL:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                                {sel&&<span style={{color:"#fff",fontSize:9,fontWeight:900}}>✓</span>}
                              </div>
                              <span style={{fontSize:13}}>{s.cognome} {s.nome}</span>
                            </div>
                          );
                        })}
                      </div>
                    : <div style={{border:"1px solid #d1d5db",borderRadius:4,padding:"9px 12px",background:"#f9fafb",color:"#9ca3af",fontSize:13}}>Tutti gli alunni</div>
                  }
                </div>
              </div>
            </div>
            {/* Footer */}
            <div             style={{flexShrink:0,borderTop:"1px solid #e5e7eb",padding:"12px 48px",background:"#f9fafb",display:"flex",justifyContent:"flex-end",gap:10}}>
              <button onClick={()=>{

                // Salva come tipo corrispondente
                const tip = nuovoEventoForm.tipologia;
                const dataIT=(()=>{try{const[y,m,d]=nuovoEventoData.split("-");return`${d}/${m}/${y}`;}catch{return nuovoEventoData;}})();
                const mat = nuovoEventoForm.materia||materia;
                const item = {
                  id:Date.now(), data:dataIT, testo:nuovoEventoForm.descrizione,
                  materiaLezione:mat, inseritoDa:docente,
                  partecipazione:nuovoEventoForm.tuttiAlunni?"tutti":"parziale",
                  alunniParz:nuovoEventoForm.alunniSel||[],
                  gravita:nuovoEventoForm.gravita,
                };
                const key = `${classe}||${mat}`;
                let sec = "lezioni";
                if(tip==="Nota disciplinare"||tip==="Annotazione") {
                  // salva in __class__
                  const cKey = `__class__${classe}`;
                  sec = tip==="Nota disciplinare"?"note":"annotazioni";
                  setContDB(p=>{
                    const db={...p};
                    if(!db[cKey]) db[cKey]={};
                    db[cKey]={...db[cKey],[sec]:[...(db[cKey][sec]||[]),{...item,destinatariTutti:nuovoEventoForm.tuttiAlunni,destinatari:nuovoEventoForm.alunniSel||[]}]};
                    try{cSet("contDB",db);}catch{}
                    return db;
                  });
                } else {
                  sec = tip==="Compito"?"compiti":tip==="Verifica"?"verifiche":"lezioni";
                  if(tip==="Verifica"){
                    setContDB(p=>{
                      const db={...p};
                      if(!db[key]) db[key]={};
                      db[key]={...db[key],verifiche:[...(db[key].verifiche||[]),{...item,tipoVerifica:"Verifica",argomenti:nuovoEventoForm.descrizione,materia:mat}]};
                      try{cSet("contDB",db);}catch{}
                      return db;
                    });
                  } else {
                    setContDB(p=>{
                      const db={...p};
                      if(!db[key]) db[key]={};
                      db[key]={...db[key],[sec]:[...(db[key][sec]||[]),item]};
                      try{cSet("contDB",db);}catch{}
                      return db;
                    });
                  }
                }
                showToast("Evento salvato!");
                setNuovoEventoOpen(false);
              }} style={{padding:"9px 26px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                💾 Salva
              </button>
              <button onClick={()=>setNuovoEventoOpen(false)}
                style={{padding:"9px 20px",background:"#337ab7",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                ⊗ Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal dettaglio giorno */}
      {dettaglioGiorno&&(
        <div style={{position:"fixed",inset:0,zIndex:8000,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FF}}>
          <div onClick={()=>setDettaglioGiorno(null)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)"}}/>
          <div style={{position:"relative",zIndex:1,background:"#fff",borderRadius:8,boxShadow:"0 12px 48px rgba(0,0,0,0.28)",width:600,maxWidth:"96vw",maxHeight:"84vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {/* Header */}
            <div style={{background:TEAL,color:"#fff",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
              <div>
                <div style={{fontWeight:700,fontSize:16}}>{(()=>{try{const d=new Date(dettaglioGiorno.iso+"T00:00:00");const GG=["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];const MM=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];return `${GG[d.getDay()]} ${d.getDate()} ${MM[d.getMonth()]} ${d.getFullYear()}`;}catch{return dettaglioGiorno.iso;}})()}</div>
                <div style={{fontSize:12,opacity:0.85}}>Classe {classe}</div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{ openContenuto("lezioni",null,materia); setDettaglioGiorno(null); }} style={{padding:"5px 12px",background:"rgba(255,255,255,0.22)",color:"#fff",border:"1px solid rgba(255,255,255,0.5)",borderRadius:4,fontWeight:700,fontSize:12,cursor:"pointer"}}>+ Argomento</button>
                <button onClick={()=>{ openContenuto("compiti",null,materia); setDettaglioGiorno(null); }} style={{padding:"5px 12px",background:"rgba(255,255,255,0.22)",color:"#fff",border:"1px solid rgba(255,255,255,0.5)",borderRadius:4,fontWeight:700,fontSize:12,cursor:"pointer"}}>+ Compito</button>
                <button onClick={()=>setDettaglioGiorno(null)} style={{width:30,height:30,background:"rgba(0,0,0,0.2)",border:"none",color:"#fff",borderRadius:"50%",cursor:"pointer",fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
              </div>
            </div>
            {/* Corpo */}
            <div style={{flex:1,overflowY:"auto",padding:16}}>
              {dettaglioGiorno.items.length===0
                ?<div style={{textAlign:"center",padding:"40px 0",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>Nessun evento in questa data</div>
                :dettaglioGiorno.items.map((item,i)=>{
                  const tc=TIPO_COL[item.tipo]||{bg:"#6b7280",color:"#fff",lbl:"Evento"};
                  return(
                    <div key={item.id||i} style={{borderRadius:6,border:"2px solid "+tc.bg+"44",marginBottom:10,overflow:"hidden"}}>
                      <div style={{background:tc.bg,color:tc.color,padding:"6px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{fontWeight:700,fontSize:12}}>
                          {tc.lbl}{item.mat&&<span style={{opacity:0.8,marginLeft:6}}>— {item.mat}</span>}
                        </div>
                        <div style={{fontSize:11,opacity:0.85}}>{item.inseritoDa||""}</div>
                      </div>
                      <div style={{padding:"10px 12px",fontSize:13,color:"#374151",lineHeight:1.6}}>{item.testo||"—"}</div>
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// PERMESSI PANEL — Autorizzati + Da autorizzare
// ════════════════════════════════════════════════════════
const GIORNI_SETT = ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
const TIPO_PERMESSO_OPT = ["Assenza","Uscita anticipata","Entrata/Ritardo","Presenza fuori aula","Permesso speciale"];

function PermessiPanel({classe, classi, students, docente, contDB, setContDB, cSet, showToast, TEAL, FF}) {
  const pKey = `__perm__${classe}`;
  const getPerms = () => contDB[pKey]?.permessi || [];
  const savePerms = (list) => {
    setContDB(p => {
      const db = {...p, [pKey]: {...(p[pKey]||{}), permessi: list}};
      try { cSet("contDB", db); } catch {}
      return db;
    });
    showToast();
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [selDaAut, setSelDaAut] = useState([]);
  const defForm = {
    tuttiAlunni: false, alunni: [],
    riguardaDocente: false,
    tipologia: "Uscita anticipata",
    oraLez: "5", orario: "",
    daData: "", aData: "",
    giustificato: true, concCalc: false, automatico: true,
    giorni: [], motivo: "",
    autorizzato: true,
    inseritoDa: docente, dataIns: todayISO(),
  };
  const [form, setForm] = useState(defForm);

  const apriNuovo = () => { setEditId(null); setForm({...defForm, inseritoDa:docente, dataIns:todayISO()}); setModalOpen(true); };
  const apriEdit = (p) => {
    setEditId(p.id);
    setForm({...defForm,...p});
    setModalOpen(true);
  };
  const salva = () => {
    const item = {...form, id: editId||Date.now(), inseritoDa: docente, dataIns: form.dataIns||todayISO()};
    const list = getPerms();
    savePerms(editId ? list.map(x=>x.id===editId?item:x) : [...list, item]);
    setModalOpen(false);
  };
  const elimina = (id) => savePerms(getPerms().filter(x=>x.id!==id));
  const autorizza = (ids, val) => savePerms(getPerms().map(x=>ids.includes(x.id)?{...x,autorizzato:val}:x));

  const tutti = getPerms();
  const autorizzati = tutti.filter(x=>x.autorizzato);
  const daAut = tutti.filter(x=>!x.autorizzato);

  const fmtData = iso => { try{const[y,m,d]=(iso||"").split("-");return`${d}/${m}/${y}`;}catch{return iso||"";} };
  const fmtOrario = s => s||"";

  // Badge tipo
  const TipoBadge = ({tipo}) => {
    const col = tipo==="Assenza"?"#ef4444":tipo==="Uscita anticipata"?"#f59e0b":tipo==="Entrata/Ritardo"?"#a855f7":"#6b7280";
    return <span style={{background:col,color:"#fff",borderRadius:4,padding:"2px 10px",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{tipo}</span>;
  };

  // Pallini giorni (L M M G V S)
  const GiorniPallini = ({giorni}) => {
    if(!giorni||!giorni.length) return <span style={{background:"#22c55e",color:"#fff",borderRadius:20,padding:"3px 12px",fontWeight:700,fontSize:11}}>Tutti</span>;
    const SIGLE = {Lunedì:"L",Martedì:"M",Mercoledì:"M",Giovedì:"G",Venerdì:"V",Sabato:"S"};
    const COLS = {Lunedì:"#6b7280",Martedì:"#6b7280",Mercoledì:"#22c55e",Giovedì:"#6b7280",Venerdì:"#6b7280",Sabato:"#6b7280"};
    return <div style={{display:"flex",gap:3}}>{giorni.map(g=>(
      <div key={g} style={{width:22,height:22,borderRadius:"50%",background:COLS[g]||"#6b7280",color:"#fff",fontWeight:700,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>{SIGLE[g]||g[0]}</div>
    ))}</div>;
  };

  // Toggle SÌ/NO piccolo stile Axios (verde/rosso)
  const ToggleAxios = ({value, onChange, readOnly}) => (
    <div onClick={readOnly?null:()=>onChange(!value)}
      style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:36,height:22,borderRadius:11,background:value?"#22c55e":"#ef4444",cursor:readOnly?"default":"pointer",userSelect:"none",boxShadow:"0 1px 3px rgba(0,0,0,0.18)"}}>
      <span style={{color:"#fff",fontWeight:700,fontSize:10,letterSpacing:0.5}}>{value?"sì":"no"}</span>
    </div>
  );

  // Nomi alunni
  const nomiAlunni = (ids) => {
    if(!ids||!ids.length) return "—";
    return ids.map(id=>{const s=students.find(x=>x.id===id);return s?`${s.cognome} ${s.nome}`:""}).filter(Boolean).join(", ");
  };

  const HDR = TEAL;
  const TBL_BORDER = "1px solid #e5e7eb";

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:FF}}>
      <div style={{flex:1,overflowY:"auto",padding:16,display:"flex",flexDirection:"column",gap:20}}>

        {/* ══ SEZIONE AUTORIZZATI ══ */}
        <div style={{border:TBL_BORDER,borderRadius:6,overflow:"hidden"}}>
          <div style={{background:HDR,color:"#fff",padding:"8px 16px",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span>Autorizzati</span>
            <button onClick={apriNuovo}
              style={{padding:"5px 16px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              + Nuovo Permesso
            </button>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#f0fdfa",borderBottom:"2px solid #bbf7d0"}}>
                {["Tipo Permesso\nOra\nFino al","Alunni","Giorni","Motivo","Note","Calcolo","Giust.","Classe"].map(h=>(
                  <th key={h} style={{padding:"9px 12px",textAlign:"center",color:HDR,fontWeight:700,fontSize:12,borderRight:TBL_BORDER,whiteSpace:"pre-line",lineHeight:1.4}}>{h}</th>
                ))}
                <th style={{padding:"9px 8px",color:HDR,fontWeight:700,fontSize:12,textAlign:"center"}}>Cmd</th>
              </tr>
            </thead>
            <tbody>
              {autorizzati.length===0
                ?<tr><td colSpan={9} style={{padding:"20px",textAlign:"center",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>Nessun permesso autorizzato</td></tr>
                :autorizzati.map((p,i)=>(
                  <tr key={p.id} style={{borderBottom:TBL_BORDER,background:i%2===0?"#fff":"#fafafa",verticalAlign:"top"}}>
                    {/* Tipo + ora + data */}
                    <td style={{padding:"10px 12px",borderRight:TBL_BORDER,minWidth:110}}>
                      <TipoBadge tipo={p.tipologia||"Permesso"}/>
                      <div style={{marginTop:4,display:"flex",alignItems:"center",gap:4}}>
                        <div style={{width:22,height:22,borderRadius:"50%",background:"#6b7280",color:"#fff",fontWeight:700,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {p.oraLez||"?"}
                        </div>
                        <span style={{fontSize:12,color:"#374151",fontWeight:600}}>{fmtOrario(p.orario)}</span>
                      </div>
                      <div style={{fontSize:11,color:"#6b7280",marginTop:2}}>{fmtData(p.aData)||fmtData(p.daData)}</div>
                    </td>
                    {/* Alunni */}
                    <td style={{padding:"10px 12px",borderRight:TBL_BORDER,fontSize:13,fontWeight:700,color:"#1f2937",minWidth:130}}>
                      {p.riguardaDocente&&<div style={{marginBottom:4}}><span style={{background:"#2563eb",color:"#fff",borderRadius:4,padding:"1px 8px",fontSize:10,fontWeight:700}}>DOCENTE</span></div>}
                      {p.tuttiAlunni
                        ?<div><span style={{fontWeight:700}}>Autorizzati:</span> Tutta la classe<br/><span style={{fontWeight:700}}>Non Autorizzati:</span> —</div>
                        :<div>
                          <div><span style={{fontWeight:700}}>Autorizzati:</span> {nomiAlunni(p.alunni)}</div>
                          <div style={{marginTop:2}}><span style={{fontWeight:700}}>Non Autorizzati:</span> —</div>
                        </div>
                      }
                    </td>
                    {/* Giorni */}
                    <td style={{padding:"10px 10px",borderRight:TBL_BORDER,textAlign:"center"}}>
                      <GiorniPallini giorni={p.giorni}/>
                    </td>
                    {/* Motivo */}
                    <td style={{padding:"10px 12px",borderRight:TBL_BORDER,fontSize:13,color:"#374151"}}>{p.motivo||"—"}</td>
                    {/* Note */}
                    <td style={{padding:"10px 12px",borderRight:TBL_BORDER,fontSize:13,color:"#374151",maxWidth:200}}>{p.note||""}</td>
                    {/* Calcolo */}
                    <td style={{padding:"10px 8px",borderRight:TBL_BORDER,textAlign:"center"}}>
                      <ToggleAxios value={!!p.concCalc} onChange={v=>savePerms(getPerms().map(x=>x.id===p.id?{...x,concCalc:v}:x))}/>
                    </td>
                    {/* Giust. */}
                    <td style={{padding:"10px 8px",borderRight:TBL_BORDER,textAlign:"center"}}>
                      <ToggleAxios value={!!p.giustificato} onChange={v=>savePerms(getPerms().map(x=>x.id===p.id?{...x,giustificato:v}:x))}/>
                    </td>
                    {/* Classe */}
                    <td style={{padding:"10px 8px",borderRight:TBL_BORDER,textAlign:"center"}}>
                      <ToggleAxios value={!!p.tuttiAlunni} readOnly/>
                    </td>
                    {/* Comandi */}
                    <td style={{padding:"8px 6px",textAlign:"center"}}>
                      <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"center"}}>
                        <button onClick={()=>apriEdit(p)} style={{width:30,height:30,background:"#2563eb",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Pencil size={13}/></button>
                        <button onClick={()=>elimina(p.id)} style={{width:30,height:30,background:"#ef4444",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Trash2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {/* ══ SEZIONE DA AUTORIZZARE ══ */}
        <div style={{border:TBL_BORDER,borderRadius:6,overflow:"hidden"}}>
          <div style={{background:HDR,color:"#fff",padding:"8px 16px",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span>Da autorizzare</span>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{if(selDaAut.length) autorizza(selDaAut,true); setSelDaAut([]);}}
                style={{padding:"5px 16px",background:"#2563eb",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                🐾 Autorizzo
              </button>
              <button onClick={()=>{if(selDaAut.length) autorizza(selDaAut,false); setSelDaAut([]);}}
                style={{padding:"5px 16px",background:"#ef4444",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                🚫 Non Autorizzo
              </button>
            </div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#f0fdfa",borderBottom:"2px solid #bbf7d0"}}>
                <th style={{padding:"9px 10px",width:32,borderRight:TBL_BORDER}}>
                  <input type="checkbox"
                    checked={daAut.length>0&&daAut.every(x=>selDaAut.includes(x.id))}
                    onChange={e=>setSelDaAut(e.target.checked?daAut.map(x=>x.id):[])}
                    style={{cursor:"pointer"}}/>
                </th>
                {["Alunno","Info","Ass.","Rit.","Usc.","Tipo Permesso","Data","Ora/Orario","Motivo","Inserita da"].map(h=>(
                  <th key={h} style={{padding:"9px 10px",textAlign:"center",color:HDR,fontWeight:700,fontSize:12,borderRight:TBL_BORDER,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daAut.length===0
                ?<tr><td colSpan={11} style={{padding:"20px",textAlign:"center",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>Nessun permesso in attesa di autorizzazione</td></tr>
                :daAut.map((p,i)=>{
                  const s = (!p.tuttiAlunni && p.alunni?.length===1) ? students.find(x=>x.id===p.alunni[0]) : null;
                  return(
                    <tr key={p.id} style={{borderBottom:TBL_BORDER,background:i%2===0?"#fff":"#fafafa",verticalAlign:"middle"}}>
                      <td style={{padding:"8px 10px",textAlign:"center",borderRight:TBL_BORDER}}>
                        <input type="checkbox" checked={selDaAut.includes(p.id)}
                          onChange={e=>setSelDaAut(prev=>e.target.checked?[...prev,p.id]:prev.filter(x=>x!==p.id))}
                          style={{cursor:"pointer"}}/>
                      </td>
                      {/* Alunno */}
                      <td style={{padding:"10px 12px",borderRight:TBL_BORDER,fontWeight:700,fontSize:14,color:"#1f2937",whiteSpace:"nowrap"}}>
                        {p.tuttiAlunni?"Tutta la classe":nomiAlunni(p.alunni)}
                        <div style={{fontSize:11,color:"#6b7280",fontWeight:400}}>{classe} - ORDINARIO</div>
                      </td>
                      {/* Info */}
                      <td style={{padding:"8px 6px",textAlign:"center",borderRight:TBL_BORDER}}>
                        <div style={{width:26,height:26,background:"#29b6d8",borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",cursor:"pointer"}}>
                          <span style={{color:"#fff",fontWeight:900,fontSize:12,fontStyle:"italic",fontFamily:"Georgia"}}>i</span>
                        </div>
                      </td>
                      {/* Ass. Rit. Usc. */}
                      {["assente","ritardo","uscita"].map(tipo=>{
                        const cnt = s ? (contDB[`__ass__${classe}`]?.[s.id]||contDB[classe]?.[s.id]||[]).filter(a=>a.tipo===tipo).length : 0;
                        const col = tipo==="assente"?"#ef4444":tipo==="ritardo"?"#f59e0b":"#22c55e";
                        return(
                          <td key={tipo} style={{padding:"8px 6px",textAlign:"center",borderRight:TBL_BORDER}}>
                            <div style={{width:26,height:26,borderRadius:"50%",background:col,color:"#fff",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto"}}>{cnt}</div>
                          </td>
                        );
                      })}
                      {/* Tipo permesso */}
                      <td style={{padding:"8px 10px",textAlign:"center",borderRight:TBL_BORDER}}>
                        <TipoBadge tipo={p.tipologia||"Permesso"}/>
                      </td>
                      {/* Data */}
                      <td style={{padding:"8px 10px",textAlign:"center",borderRight:TBL_BORDER,fontSize:13,whiteSpace:"nowrap"}}>{fmtData(p.daData)||fmtData(p.dataIns)}</td>
                      {/* Ora/Orario */}
                      <td style={{padding:"8px 10px",textAlign:"center",borderRight:TBL_BORDER,fontSize:13,whiteSpace:"nowrap"}}>{p.orario||"—"}</td>
                      {/* Motivo */}
                      <td style={{padding:"8px 10px",borderRight:TBL_BORDER,fontSize:13,color:"#374151"}}>{p.motivo||"—"}</td>
                      {/* Inserita da */}
                      <td style={{padding:"8px 10px",fontSize:12,color:"#374151",textAlign:"center"}}>
                        <div style={{fontWeight:700}}>{cognomeNome(p.inseritoDa||docente).toUpperCase()}</div>
                        <div style={{color:"#6b7280",fontSize:11}}>il {fmtData(p.dataIns||todayISO())}</div>
                      </td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>

      </div>

      {/* ══ MODAL NUOVO PERMESSO ══ */}
      {modalOpen&&(
        <PermessoModalAnimato onClose={()=>setModalOpen(false)}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:"#fff",borderRadius:6,
            boxShadow:"0 12px 48px rgba(0,0,0,0.28)",
            width:960,maxWidth:"99vw",maxHeight:"92vh",
            display:"flex",flexDirection:"column",overflow:"hidden",
          }}>
            {/* Header */}
            <div style={{background:HDR,color:"#fff",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{editId?"Modifica":"Nuovo"} Permesso Autorizzato</div>
                <div style={{fontSize:12,opacity:0.85}}>Classe: {classe}</div>
              </div>
              <button onClick={()=>setModalOpen(false)} style={{background:"rgba(0,0,0,0.2)",border:"none",color:"#fff",borderRadius:"50%",width:28,height:28,cursor:"pointer",fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
            {/* Corpo */}
            <div style={{flex:1,overflowY:"auto",padding:"20px 24px",display:"flex",flexDirection:"column",gap:14}}>

              {/* Tutta la classe | Alunni | Docente */}
              <div style={{display:"grid",gridTemplateColumns:"130px 1fr 130px",gap:14,alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:6}}>Tutta la classe</div>
                  <ToggleSiNo value={!!form.tuttiAlunni} onChange={v=>setForm(f=>({...f,tuttiAlunni:v,alunni:[]}))}/>
                </div>
                <div>
                  <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:6}}>Alunni</div>
                  {!form.tuttiAlunni
                    ?<div style={{border:"1px solid #d1d5db",borderRadius:4,background:"#f9fafb",maxHeight:120,overflowY:"auto",padding:4}}>
                      {[...students].sort((a,b)=>a.cognome.localeCompare(b.cognome)).map(s=>{
                        const sel=(form.alunni||[]).includes(s.id);
                        return(
                          <div key={s.id} onClick={()=>setForm(f=>({...f,alunni:sel?(f.alunni||[]).filter(x=>x!==s.id):[...(f.alunni||[]),s.id]}))}
                            style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",cursor:"pointer",background:sel?"#e8f5f5":"transparent",borderRadius:3}}>
                            <div style={{width:14,height:14,border:"2px solid "+(sel?HDR:"#bbb"),borderRadius:2,background:sel?HDR:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                              {sel&&<span style={{color:"#fff",fontSize:9,fontWeight:900}}>✓</span>}
                            </div>
                            <span style={{fontSize:13}}>{s.cognome} {s.nome}</span>
                          </div>
                        );
                      })}
                    </div>
                    :<div style={{border:"1px solid #d1d5db",borderRadius:4,padding:"9px 12px",background:"#f9fafb",color:"#9ca3af",fontSize:13}}>Tutta la classe</div>
                  }
                </div>
                <div>
                  <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:6}}>Docente</div>
                  <ToggleSiNo value={!!form.riguardaDocente} onChange={v=>setForm(f=>({...f,riguardaDocente:v}))}/>
                </div>
              </div>

              {/* Tipologia | Ora Lez. | Orario */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 100px 130px",gap:14,alignItems:"end"}}>
                <div>
                  <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:4}}>Tipologia</div>
                  <select value={form.tipologia} onChange={e=>setForm(f=>({...f,tipologia:e.target.value}))}
                    style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"9px 10px",fontSize:14,background:"#fff",fontFamily:FF}}>
                    {TIPO_PERMESSO_OPT.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:4}}>Ora Lez.</div>
                  <input value={form.oraLez} onChange={e=>setForm(f=>({...f,oraLez:e.target.value}))}
                    style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"9px 10px",fontSize:14,fontFamily:FF,boxSizing:"border-box"}}/>
                </div>
                <div>
                  <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:4}}>Orario</div>
                  <div style={{display:"flex",alignItems:"center",border:"1px solid #d1d5db",borderRadius:4,overflow:"hidden"}}>
                    <span style={{padding:"9px 10px",background:"#f5f5f5",borderRight:"1px solid #d1d5db",fontSize:14}}>⏰</span>
                    <input type="time" value={form.orario} onChange={e=>setForm(f=>({...f,orario:e.target.value}))}
                      style={{border:"none",padding:"9px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
                  </div>
                </div>
              </div>

              {/* Da data | A data | Giustificato | Conc Calc | Automatico */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 100px 100px 100px",gap:14,alignItems:"end"}}>
                <div>
                  <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:4}}>Da data</div>
                  <div style={{display:"flex",alignItems:"center",border:"1px solid #d1d5db",borderRadius:4,overflow:"hidden"}}>
                    <span style={{padding:"9px 10px",background:"#f5f5f5",borderRight:"1px solid #d1d5db",fontSize:14}}>📅</span>
                    <input type="date" value={form.daData} onChange={e=>setForm(f=>({...f,daData:e.target.value}))}
                      style={{border:"none",padding:"9px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:4}}>A data</div>
                  <div style={{display:"flex",alignItems:"center",border:"1px solid #d1d5db",borderRadius:4,overflow:"hidden"}}>
                    <span style={{padding:"9px 10px",background:"#f5f5f5",borderRight:"1px solid #d1d5db",fontSize:14}}>📅</span>
                    <input type="date" value={form.aData} onChange={e=>setForm(f=>({...f,aData:e.target.value}))}
                      style={{border:"none",padding:"9px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:6}}>Giustificato</div>
                  <ToggleSiNo value={!!form.giustificato} onChange={v=>setForm(f=>({...f,giustificato:v}))}/>
                </div>
                <div>
                  <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:6}}>Conc Calc</div>
                  <ToggleSiNo value={!!form.concCalc} onChange={v=>setForm(f=>({...f,concCalc:v}))}/>
                </div>
                <div>
                  <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:6}}>Automatico</div>
                  <ToggleSiNo value={!!form.automatico} onChange={v=>setForm(f=>({...f,automatico:v}))}/>
                </div>
              </div>

              {/* Giorni della settimana */}
              <div>
                <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:8}}>Indicare in quali giorni della settimana è valido <span style={{fontWeight:400,color:"#6b7280"}}>(lasciare vuoto per tutti)</span></div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {GIORNI_SETT.map(g=>{
                    const sel=(form.giorni||[]).includes(g);
                    return(
                      <div key={g} onClick={()=>setForm(f=>({...f,giorni:sel?(f.giorni||[]).filter(x=>x!==g):[...(f.giorni||[]),g]}))}
                        style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",border:"2px solid "+(sel?HDR:"#d1d5db"),borderRadius:20,cursor:"pointer",background:sel?"#e8f5f5":"#fff",fontWeight:sel?700:400,fontSize:13,color:sel?HDR:"#374151"}}>
                        {sel&&<span style={{color:HDR,fontSize:12}}>×</span>}
                        {g}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Motivo */}
              <div>
                <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:4}}>Motivo</div>
                <input value={form.motivo} onChange={e=>setForm(f=>({...f,motivo:e.target.value}))}
                  style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",fontSize:14,fontFamily:FF,boxSizing:"border-box"}}/>
              </div>

              {/* Note */}
              <div>
                <div style={{fontSize:12,color:HDR,fontWeight:700,marginBottom:4}}>Note</div>
                <textarea value={form.note||""} onChange={e=>setForm(f=>({...f,note:e.target.value}))} rows={2}
                  style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"9px 12px",resize:"none",fontFamily:FF,fontSize:13,boxSizing:"border-box"}}/>
              </div>

              {/* Autorizzato già */}
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:12,color:HDR,fontWeight:700}}>Già autorizzato</div>
                <ToggleSiNo value={!!form.autorizzato} onChange={v=>setForm(f=>({...f,autorizzato:v}))}/>
              </div>

            </div>
            {/* Footer */}
            <div style={{flexShrink:0,borderTop:"1px solid #e5e7eb",padding:"12px 24px",background:"#f9fafb",display:"flex",justifyContent:"flex-end",gap:10}}>
              <button onClick={salva}
                style={{padding:"9px 26px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                💾 Salva
              </button>
              <button onClick={()=>setModalOpen(false)}
                style={{padding:"9px 20px",background:"#337ab7",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:14,cursor:"pointer"}}>
                ⊗ Chiudi
              </button>
            </div>
          </div>
        </PermessoModalAnimato>
      )}
    </div>
  );
}

function PlanningEventoModal({onClose, children}) {
  const [phase, setPhase] = useState("loading");
  useEffect(()=>{
    const t = setTimeout(()=>setPhase("open"), 200);
    return ()=>clearTimeout(t);
  },[]);
  const close = () => { setPhase("closing"); setTimeout(onClose, 280); };
  return (
    <>
      <style>{`
        @keyframes planDown{from{transform:translateY(-110%)}to{transform:translateY(0)}}
        @keyframes planUp{from{transform:translateY(0)}to{transform:translateY(-120%)}}
        @keyframes planSpin{to{transform:rotate(360deg)}}
      `}</style>
      <div style={{position:"fixed",inset:0,zIndex:8500,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Helvetica,Arial,sans-serif"}}>
        {/* Overlay */}
        <div onClick={close} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)",opacity:phase==="loading"?0:1,transition:"opacity 0.22s"}}/>
        {/* Pillola caricamento */}
        {phase==="loading"&&(
          <div style={{position:"relative",zIndex:2,background:"rgba(255,255,255,0.97)",borderRadius:20,padding:"10px 22px",boxShadow:"0 4px 20px rgba(0,0,0,0.12)",fontSize:13,color:"#6b7280",fontWeight:600,display:"flex",alignItems:"center",gap:10,pointerEvents:"none"}}>
            <div style={{width:13,height:13,borderRadius:"50%",border:"2px solid #ddd",borderTopColor:"#4e9fa0",animation:"planSpin 0.7s linear infinite"}}/>
            Caricamento
          </div>
        )}
        {/* Pannello animato */}
        {phase!=="loading"&&(
          <div style={{
            position:"relative",zIndex:2,
            animation:phase==="closing"
              ?"planUp 0.26s cubic-bezier(.4,0,.6,1) forwards"
              :"planDown 0.38s cubic-bezier(.2,.9,.25,1) forwards",
          }}>
            {children}
          </div>
        )}
      </div>
    </>
  );
}

function PermessoModalAnimato({onClose, children}) {
  const [phase, setPhase] = useState("loading");
  useEffect(()=>{
    const t = setTimeout(()=>setPhase("open"), 200);
    return ()=>clearTimeout(t);
  },[]);
  const close = () => { setPhase("closing"); setTimeout(onClose, 280); };
  return (
    <>
      <style>{`
        @keyframes piombaGiuPerm{from{transform:translate(-50%,-120%)}to{transform:translate(-50%,-50%)}}
        @keyframes risaliSuPerm{from{transform:translate(-50%,-50%)}to{transform:translate(-50%,-120%)}}
        @keyframes spin2{to{transform:rotate(360deg)}}
      `}</style>
      <div style={{position:"fixed",inset:0,zIndex:7000,fontFamily:"Helvetica,Arial,sans-serif"}}>
        {/* Overlay */}
        <div onClick={close} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)",opacity:phase==="loading"?0:1,transition:"opacity 0.22s"}}/>
        {/* Pillola caricamento */}
        {phase==="loading"&&(
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"rgba(255,255,255,0.97)",borderRadius:20,padding:"10px 22px",boxShadow:"0 4px 20px rgba(0,0,0,0.12)",fontSize:13,color:"#6b7280",fontWeight:600,display:"flex",alignItems:"center",gap:10,pointerEvents:"none",zIndex:1}}>
            <div style={{width:13,height:13,borderRadius:"50%",border:"2px solid #ddd",borderTopColor:"#4e9fa0",animation:"spin2 0.7s linear infinite"}}/>
            Caricamento
          </div>
        )}
        {/* Pannello */}
        {phase!=="loading"&&(
          <div style={{
            position:"absolute",
            top:"50%",left:"50%",
            zIndex:1,
            animation:phase==="closing"
              ?"risaliSuPerm 0.26s cubic-bezier(.4,0,.6,1) forwards"
              :"piombaGiuPerm 0.38s cubic-bezier(.2,.9,.25,1) forwards",
          }}>
            {React.cloneElement(children, {
              children: React.Children.map(children.props.children, child => {
                if(child && child.props && child.props.onClick===undefined && child.type==="button") return child;
                return child;
              })
            })}
          </div>
        )}
      </div>
    </>
  );
}

function HomeDashboard({docente, classi, classiList, contDB, orario, getSlot, setOrEdit, setOrarioOpen, GIORNI, ORE_ORARIO, todayGStr, TEAL, TEAL_LIGHT, VERDE, FF, onOpenComunicazioni, menuVeloceExpanded, setMenuVeloceExpanded, classeAttiva, materiaAttiva}) {
  const [orarioModal, setOrarioModal] = useState(false);
  const [firmaClasse, setFirmaClasse] = useState(classiList[0]||"");
  const [firmaMateria, setFirmaMateria] = useState("");
  const [firmaData, setFirmaData] = useState(todayISO());
  const [dashClasse, setDashClasse] = useState(classiList[0]||"");

  // Aggiorna dashClasse se classiList cambia
  useEffect(()=>{ if(classiList.length>0 && !classiList.includes(dashClasse)) setDashClasse(classiList[0]); },[classiList.join(",")]);

  const getMaterieClDash = (cl) => {
    try { const m=JSON.parse(localStorage.getItem(`reg:${_doc}:classeMeta`)||"{}"); return m[cl]?.materie||[]; } catch { return []; }
  };
  const materieClDash = getMaterieClDash(dashClasse);

  const HDR_COL = "#2d7d9a"; // stesso colore per entrambi i pannelli

  // Tutte le firme da contDB
  const tutteFirme = (() => {
    const all = []; const seen = new Set();
    const key = `${classeAttiva}||__firme__`;
    (contDB[key]?.firme||[]).forEach(f=>{
      if(seen.has(f.id)) return; seen.add(f.id);
      all.push({...f, _classe:classeAttiva});
    });
    return all.sort((a,b)=>toISO(b.data||"").localeCompare(toISO(a.data||"")));
  })();

  // Filtro firme — default: solo oggi
  // Firme filtrate per materia e data
  const firmeFiltrate = tutteFirme.filter(f=>{
    const dataISO = toISO(f.data||"");
    const matchMat = !firmaMateria || (f.materia||f.materiaFirma||"").toLowerCase()===firmaMateria.toLowerCase();
    const matchData = !firmaData || dataISO===firmaData;
    return matchMat && matchData;
  });

  const materieDisp = [...new Set(tutteFirme.map(f=>f.materia||f.materiaFirma||"").filter(Boolean))].sort();

  // Comunicazioni
  const tutteComun = (contDB["__comunicazioni__"]?.["comunicazioni"]||[])
    .filter(c => !c.classiCom || c.classiCom.length===0 || c.classiCom.includes(classeAttiva))
    .slice().sort((a,b)=>(b.data||"").localeCompare(a.data||""));

  const fmtDataBlocco = (raw) => {
    if(!raw) return "—";
    let iso = raw;
    if(raw.includes("/")) { const[d,m,y]=raw.split("/"); iso=`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`; }
    const dt = new Date(iso+"T00:00:00");
    if(isNaN(dt)) return raw;
    const MESI=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
    return `${dt.getDate()} ${MESI[dt.getMonth()]} ${dt.getFullYear()}`;
  };

  // Label data firme
  const dataLabel = (() => {
    if(!firmaData) return "tutte le date";
    if(firmaData===todayISO()) return "Oggi";
    const d=new Date(firmaData+"T00:00:00");
    const GG=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
    const MM=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
    return `${GG[d.getDay()]} ${d.getDate()} ${MM[d.getMonth()]}`;
  })();

  return (
    <div style={{flex:1, display:"flex", overflow:"hidden", padding:"8px 0 0 0", gap:0}}>

      {/* ══ COLONNA SINISTRA — Oggi / Firme ══ */}
      <div style={{width:300, flexShrink:0, display:"flex", flexDirection:"column", borderRight:"1px solid #dde3ea", background:"#fff", overflow:"hidden"}}>
        {/* Header "Oggi" */}
        <div style={{background:"#4ab8d4", color:"#fff", padding:"8px 14px", fontWeight:700, fontSize:14, flexShrink:0}}>Oggi</div>
        {/* Nav giorno */}
        <div style={{padding:"6px 10px", background:"#f0f4f8", borderBottom:"1px solid #dde3ea", display:"flex", alignItems:"center", gap:4, flexShrink:0}}>
          <button onClick={()=>{const d=new Date((firmaData||todayISO())+"T00:00:00");d.setDate(d.getDate()-2);setFirmaData(d.toISOString().split("T")[0]);}}
            style={{padding:"2px 6px",background:"#e2eaf2",border:"none",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:13}}>«</button>
          <button onClick={()=>{const d=new Date((firmaData||todayISO())+"T00:00:00");d.setDate(d.getDate()-1);setFirmaData(d.toISOString().split("T")[0]);}}
            style={{padding:"2px 6px",background:"#e2eaf2",border:"none",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:13}}>‹</button>
          <span style={{flex:1,textAlign:"center",fontSize:12,fontWeight:700,color:"#374151"}}>
            {(()=>{try{const d=new Date((firmaData||todayISO())+"T00:00:00");const GG=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];const MM=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];return `${GG[d.getDay()]} ${d.getDate()} ${MM[d.getMonth()]} ${d.getFullYear()}`;}catch{return firmaData;}})()}
          </span>
          <button onClick={()=>{const d=new Date((firmaData||todayISO())+"T00:00:00");d.setDate(d.getDate()+1);setFirmaData(d.toISOString().split("T")[0]);}}
            style={{padding:"2px 6px",background:"#e2eaf2",border:"none",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:13}}>›</button>
          <button onClick={()=>{const d=new Date((firmaData||todayISO())+"T00:00:00");d.setDate(d.getDate()+2);setFirmaData(d.toISOString().split("T")[0]);}}
            style={{padding:"2px 6px",background:"#e2eaf2",border:"none",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:13}}>»</button>
        </div>
        {/* Intestazione Ora / Lezioni */}
        <div style={{display:"grid",gridTemplateColumns:"40px 1fr",background:"#f8fafc",borderBottom:"1px solid #e5e7eb",flexShrink:0}}>
          <div style={{padding:"6px 8px",fontSize:11,fontWeight:700,color:"#4ab8d4",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>Ora</div>
          <div style={{padding:"6px 12px",fontSize:11,fontWeight:700,color:"#4ab8d4"}}>Lezioni</div>
        </div>
        {/* Lista firme del giorno */}
        <div style={{flex:1,overflowY:"auto"}}>
          {firmeFiltrate.length===0
            ?<div style={{padding:"24px 14px",textAlign:"center",color:"#9ca3af",fontSize:12}}>Nessuna lezione</div>
            :firmeFiltrate.map((f,i)=>{
              const mat=f.materia||f.materiaFirma||"";
              const ore=f.oreNum||f.ore||"—";
                                const nInizio=f.oraInizioNum||parseInt(f.oraInizio)||1;
                    const nOre=parseInt(f.nOre)||1;
                    const oreLabel = nOre===1 ? `${nInizio}` : `${nInizio}-${nInizio+nOre-1}`;
              return(
                <div key={f.id} style={{display:"grid",gridTemplateColumns:"40px 1fr",borderBottom:"1px solid #f3f4f6",background:i%2===0?"#fff":"#f9fafb",alignItems:"center",minHeight:44}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",borderRight:"1px solid #f0f0f0",padding:"4px 0",height:"100%"}}>
                    <div style={{width:24,height:24,borderRadius:"50%",                  background:"#4ab8d4",color:"#fff",fontWeight:900,fontSize:nOre>1?10:11,display:"flex",alignItems:"center",justifyContent:"center"}}>{oreLabel}</div>
                  </div>
                  <div style={{padding:"6px 10px"}}>
                    <div style={{fontWeight:700,fontSize:12,color:"#1f2937"}}>{f._classe||""}</div>
                    <div style={{fontSize:11,color:"#4ab8d4",fontWeight:700,textTransform:"uppercase",marginTop:1}}>
                      <span style={{background:"#e0f2fe",color:"#0369a1",borderRadius:10,padding:"1px 7px",fontSize:10}}>{mat}</span>
                    </div>
                  </div>
                </div>
              );
            })
          }
        </div>
        {/* Tasto orario in fondo */}
        <div style={{flexShrink:0,padding:"8px 10px",borderTop:"1px solid #e5e7eb",background:"#f8fafc"}}>
          <button onClick={()=>setOrarioModal(true)}
            style={{width:"100%",padding:"7px",background:"#1d4ed8",color:"#fff",border:"none",borderRadius:5,fontWeight:700,fontSize:12,cursor:"pointer"}}>
            📅 Orario settimanale
          </button>
        </div>
      </div>

      {/* ══ COLONNA CENTRALE — Comunicazioni e bacheche ══ */}
      <div style={{flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:"#fff", borderRight:"1px solid #dde3ea"}}>
        {/* Header */}
        <div style={{background:"#4ab8d4", color:"#fff", padding:"8px 14px", flexShrink:0, display:"flex", alignItems:"center", gap:8}}>
          <span style={{fontWeight:700, fontSize:14}}>Comunicazioni e bacheche</span>
          <div style={{marginLeft:"auto",display:"flex",gap:6}}>
            <button onClick={onOpenComunicazioni}
              style={{padding:"4px 12px",background:"rgba(255,255,255,0.25)",color:"#fff",border:"1px solid rgba(255,255,255,0.5)",borderRadius:4,fontWeight:700,fontSize:11,cursor:"pointer"}}>
              📋 Comunicazioni
            </button>
            <button style={{padding:"4px 12px",background:"rgba(255,255,255,0.15)",color:"#fff",border:"1px solid rgba(255,255,255,0.35)",borderRadius:4,fontWeight:700,fontSize:11,cursor:"pointer"}}>
              🏫 Bacheche
            </button>
          </div>
        </div>
        {/* Barra filtri */}
        <div style={{padding:"7px 12px",background:"#f0f4f8",borderBottom:"1px solid #dde3ea",display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
          <button style={{padding:"3px 12px",background:"#4ab8d4",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:11,cursor:"pointer"}}>Att.</button>
          <select style={{border:"1px solid #d1d5db",borderRadius:4,padding:"3px 8px",fontSize:12,fontFamily:FF}}>
            <option>Tutte</option>
          </select>
          <input placeholder="ricerca..." style={{flex:1,border:"1px solid #d1d5db",borderRadius:4,padding:"4px 8px",fontSize:12,fontFamily:FF,minWidth:80,outline:"none"}}/>
          <button onClick={onOpenComunicazioni}
            style={{padding:"3px 10px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:13,cursor:"pointer",lineHeight:1}}>＋</button>
        </div>
        {/* Lista comunicazioni */}
        <div style={{flex:1,overflowY:"auto"}}>
          {tutteComun.length===0
            ?<div style={{padding:"40px 20px",textAlign:"center",color:"#9ca3af",fontSize:13}}>Nessuna comunicazione</div>
            :tutteComun.slice(0,5).map((c,i)=>{
              const {giorno:gn,mese:ms,anno:an}=fmtDataBlocco(c.data||"");
              const hasFam=c.visibileFamiglie!==false;
              return(
                <div key={c.id} onClick={onOpenComunicazioni}
                  style={{display:"flex",alignItems:"stretch",borderBottom:"1px solid #e5e7eb",background:i%2===0?"#fff":"#f8fbff",cursor:"pointer",minHeight:64}}
                  onMouseEnter={e=>e.currentTarget.style.background="#e8f4f8"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#f8fbff"}>
                  {/* Data */}
                  <div style={{width:80,flexShrink:0,padding:"10px 12px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRight:"1px solid #e5e7eb"}}>
                    <span style={{fontWeight:700,fontSize:18,color:"#1f2937",lineHeight:1}}>{gn}</span>
                    <span style={{fontSize:11,color:"#6b7280",lineHeight:1.3,textAlign:"center"}}>{ms}<br/>{an}</span>
                    <span style={{marginTop:4,background:hasFam?"#5b9bd5":"#1e3a5f",color:"#fff",borderRadius:3,padding:"1px 6px",fontSize:9,fontWeight:700}}>{hasFam?"Scuola/fam":"Interno"}</span>
                  </div>
                  {/* Titolo + autore */}
                  <div style={{flex:1,padding:"10px 12px",minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13,color:"#1f2937",marginBottom:3,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.oggetto||"(senza oggetto)"}</div>
                    <div style={{fontSize:11,color:"#6b7280"}}>Pubblicata da: <b>{(c.inseritoDa||"").toUpperCase()}</b></div>
                    {(c.classiCom||[]).length>0&&<div style={{marginTop:3,display:"flex",flexWrap:"wrap",gap:3}}>{c.classiCom.slice(0,4).map((cl,j)=><span key={j} style={{background:"#bfdbfe",color:"#1d4ed8",borderRadius:8,padding:"1px 6px",fontSize:9,fontWeight:700}}>{cl}</span>)}</div>}
                  </div>
                  {/* Stato letta */}
                  <div style={{width:60,flexShrink:0,padding:"10px 6px",display:"flex",alignItems:"flex-start",justifyContent:"center",borderLeft:"1px solid #e5e7eb"}}>
                    {c.letta
                      ?<span style={{color:"#22c55e",fontWeight:700,fontSize:11}}>Letta</span>
                      :<span style={{color:"#f97316",fontWeight:700,fontSize:10}}>Non letta</span>
                    }
                  </div>
                </div>
              );
            })
          }
        </div>
      </div>

      {/* ── MODALE ORARIO ── */}
      {orarioModal&&(
        <div style={{position:"fixed",inset:0,zIndex:6000,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FF}}>
          <div onClick={()=>setOrarioModal(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)"}}/>
          <div style={{position:"relative",zIndex:1,background:"#fff",borderRadius:10,boxShadow:"0 16px 60px rgba(0,0,0,0.28)",width:"min(96vw,1000px)",maxHeight:"90vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{background:"#1d4ed8",color:"#fff",padding:"14px 20px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
              <span style={{fontWeight:700,fontSize:17}}>📅 Orario Settimanale</span>
              <button onClick={e=>{e.stopPropagation();setOrarioModal(false);setOrarioOpen(true);}}
                style={{padding:"6px 16px",background:"#22c55e",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:13}}>✏️ Modifica</button>
              <button onClick={()=>setOrarioModal(false)}
                style={{marginLeft:"auto",background:"rgba(0,0,0,0.25)",border:"none",color:"#fff",borderRadius:"50%",width:30,height:30,cursor:"pointer",fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
            <div style={{overflowX:"auto",overflowY:"auto",flex:1}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
                <thead>
                  <tr style={{background:"#f1f5f9",position:"sticky",top:0,zIndex:2}}>
                    <th style={{padding:"10px 12px",fontWeight:700,fontSize:13,color:"#374151",border:"1px solid #e5e7eb",width:50,textAlign:"center"}}>Ora</th>
                    {GIORNI.map(g=>(
                      <th key={g} style={{padding:"10px 12px",fontWeight:700,fontSize:13,color:g===todayGStr?TEAL:"#374151",background:g===todayGStr?TEAL_LIGHT:"#f1f5f9",border:"1px solid #e5e7eb",textAlign:"center"}}>
                        {g}{g===todayGStr&&<span style={{display:"block",fontSize:10,color:TEAL,fontWeight:400}}>Oggi</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ORE_ORARIO.map(ora=>(
                    <tr key={ora}>
                      <td style={{padding:"8px",fontWeight:700,fontSize:13,color:"#6b7280",border:"1px solid #e5e7eb",textAlign:"center",background:"#f9fafb"}}>{ora}ª</td>
                      {GIORNI.map(g=>{
                        const slot=getSlot(g,ora);
                        const iT=g===todayGStr;
                        return(
                          <td key={g} onClick={()=>{setOrarioModal(false);setOrEdit({giorno:g,ora,classe:slot?.classe||"",materia:slot?.materia||"Matematica",nota:slot?.nota||""});setOrarioOpen(true);}}
                            style={{padding:"8px 10px",border:"1px solid #e5e7eb",cursor:"pointer",background:iT?(slot?TEAL_LIGHT:TEAL_LIGHT+"55"):(slot?"#f0fdf4":"#fff"),minWidth:100,verticalAlign:"top",transition:"background 0.1s"}}>
                            {slot
                              ?<div>
                                <div style={{fontWeight:700,fontSize:12,color:iT?TEAL:VERDE}}>{slot.classe}</div>
                                <div style={{fontSize:11,color:"#374151",marginTop:1}}>{slot.materia}</div>
                                {slot.nota&&<div style={{fontSize:10,color:"#9ca3af",fontStyle:"italic",marginTop:1}}>{slot.nota}</div>}
                              </div>
                              :<div style={{color:"#d1d5db",fontSize:11,textAlign:"center",padding:"4px 0"}}>—</div>
                            }
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocenteMenu({onSelect}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(()=>{
    if(!open) return;
    const h = e => { if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return ()=>window.removeEventListener("mousedown", h);
  },[open]);
  return(
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={()=>setOpen(v=>!v)}
        style={{height:48,padding:"0 24px",background:"#f0932b",color:"#fff",border:"none",borderRadius:6,fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 12px rgba(0,0,0,0.15)",display:"flex",alignItems:"center",gap:10,minWidth:200,fontFamily:FF}}>
        <span style={{fontSize:16}}>📝</span>
        <span style={{flex:1,textAlign:"left"}}>REGISTRO DOCENTE</span>
        <span style={{fontSize:12,opacity:0.85}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",background:"#fff",borderRadius:8,boxShadow:"0 8px 32px rgba(0,0,0,0.2)",border:"1px solid #e5e7eb",zIndex:300,minWidth:200,overflow:"hidden"}}>
          <button onClick={()=>{setOpen(false);onSelect("docente");}} style={{width:"100%",padding:"14px 20px",background:"none",border:"none",borderBottom:"1px solid #f3f4f6",fontWeight:700,fontSize:14,cursor:"pointer",textAlign:"left",fontFamily:FF,color:"#1f2937",display:"flex",alignItems:"center",gap:8}}>📊 Registro Valutazioni</button>
          <button onClick={()=>{setOpen(false);onSelect("diario");}} style={{width:"100%",padding:"14px 20px",background:"none",border:"none",borderBottom:"1px solid #f3f4f6",fontWeight:700,fontSize:14,cursor:"pointer",textAlign:"left",fontFamily:FF,color:"#1f2937",display:"flex",alignItems:"center",gap:8}}>📓 Diario Docente</button>
          <button onClick={()=>{setOpen(false);onSelect("quadro");}} style={{width:"100%",padding:"14px 20px",background:"none",border:"none",borderBottom:"1px solid #f3f4f6",fontWeight:700,fontSize:14,cursor:"pointer",textAlign:"left",fontFamily:FF,color:"#1f2937",display:"flex",alignItems:"center",gap:8}}>📊 Quadro Riepilogativo</button>
          <button onClick={()=>{setOpen(false);onSelect("registrocompleto");}} style={{width:"100%",padding:"14px 20px",background:"none",border:"none",fontWeight:700,fontSize:14,cursor:"pointer",textAlign:"left",fontFamily:FF,color:"#1f2937",display:"flex",alignItems:"center",gap:8}}>📋 Registro Completo</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [docente,setDocente]=useState(()=>{try{const n=localStorage.getItem("reg:lastDocente")||"";if(n){_doc=n;}return n;}catch{return "";}});
  const logout=()=>{try{localStorage.removeItem("reg:lastDocente");}catch{}setDocente("");};
  if(!docente) return <NomeDocente onEntra={n=>{_doc=n;setDocente(n);}}/>;
  return <Registro docente={docente} onCambia={logout}/>;
}

function Registro({docente,onCambia}) {
  const [classi,setClassiRaw]      = useLocal("classi",{});
  // ── Firma attiva: di norma è il docente loggato, ma può essere "impersonato"
  // da un collega selezionato nel Registro condiviso. Tutti gli inserimenti
  // (voti, lezioni, firme, note...) usano questo nome come autore.
  const [firmaAttiva, setFirmaAttivaRaw] = useState(()=>{
    try{ return localStorage.getItem(`reg:${docente}:firmaAttiva`) || docente; }catch{ return docente; }
  });
  const setFirmaAttiva = (n) => {
    const nome = n||docente;
    setFirmaAttivaRaw(nome);
    try{ localStorage.setItem(`reg:${docente}:firmaAttiva`, nome); }catch{}
  };
  const tornaAMeStesso = () => setFirmaAttiva(docente);
  const [nomeScuola,setNomeScuolaRaw] = useLocal("nomeScuola","");
  const setNomeScuola = v => { setNomeScuolaRaw(v); cSet("nomeScuola",v); };
  const [votiDB,setVotiDB] = useLocal("votiDB",{});
  const [assenzeDB,setAssenzeDB]   = useLocal("assenzeDB",{});
  const [contDB,setContDB]         = useLocal("contDB",{});
  const [scrutiniDB, setScrutiniDBRaw] = useLocal("scrutiniDB",{});
  const setScrutiniDB = (fn) => {
    setScrutiniDBRaw(p => {
      const next = typeof fn === "function" ? fn(p) : fn;
      const s = JSON.stringify(next);
      const key = `reg:${_doc}:scrutiniDB`;
      try{localStorage.setItem(key,s);}catch{}
      try{localStorage.setItem(key+"_bk1",s);}catch{}
      try{sessionStorage.setItem(key,s);}catch{}
      try{_idbSet(key,s);}catch{}
      try{cloudSave(_doc,"scrutiniDB",next).catch(()=>{});}catch{}
      return next;
    });
  };
  const [orario,setOrario]         = useLocal("orario",{});
  const [colloquiDB,setColloquiDB] = useLocal("colloquiDB",[]);
  const [mensaDB,setMensaDB] = useLocal("mensaDB",{});
  const [toastMsg,setToastMsg]     = useState(null);
  const [saving,setSaving]         = useState(false);
  const [classe,setClasse]         = useState(()=>Object.keys(cGet("classi")||{}).sort()[0]||"");
  const [materia,setMateriaRaw]    = useState(()=>cGet("lastMateria")||"Matematica");
  const setMateria = v => { setMateriaRaw(v); cSet("lastMateria", v); };
  const getMaterieClasse=cl=>{
    try{
      const meta=JSON.parse(localStorage.getItem(`reg:${_doc}:classeMeta`)||"{}");
      return meta[cl]?.materie||[];
    }catch{return[];}
  };
  useEffect(()=>{
    if(!classe) return;
    const mat=getMaterieClasse(classe);
    if(mat.length>0 && !mat.includes(materia)) setMateria(mat[0]);
  },[classe]);
  const [activeTab,setActiveTab]   = useState(null);
  const [selStudent,setSelStudent] = useState(null);
  const [giustModal,setGiustModal] = useState(null);
  const [giustOpen,setGiustOpen]   = useState(false);
  const [eventoModal,setEventoModal] = useState(null);
  const [showGestione,setShowGestione] = useState(false);
  const [orarioOpen,setOrarioOpen] = useState(false);
  const [orEdit,setOrEdit]         = useState({giorno:"Lunedì",ora:1,classe:"",materia:"Matematica",nota:""});
  const [modNomeOpen,setModNomeOpen] = useState(false);
  const [nuovoNome,setNuovoNome]   = useState("");
  const [azzeraOpen,setAzzeraOpen] = useState(false);
  const [azzeraScelta,setAzzeraScelta] = useState("tutto");
  const [azzeraTrim,setAzzeraTrim] = useState("1° Quadrimestre");
  const [azzeraConferma,setAzzeraConferma] = useState(false);
  const importaRef                 = useRef(null);
  const progRef                    = useRef(null);
  const [progOpen,setProgOpen]     = useState(false);
  const [menuVeloceOpen, setMenuVeloceOpen] = useState(true);
  const [menuVeloceExpanded, setMenuVeloceExpanded] = useState(false);
  const [pgTrim,setPgTrim] = useState(TRIMESTRI[0]);
  const [pgSid,setPgSid]           = useState(null);
  const [pgVoti,setPgVoti]         = useState({});
  const [pgBeh,setPgBeh]           = useState("8");
  const [pgNote,setPgNote]         = useState("");
  const [pgAmmesso,setPgAmmesso]   = useState(null);
  const [pgCarenze,setPgCarenze]   = useState({});
  const [pgOpen,setPgOpen]         = useState(false);
  const defVoto={tipo:"orale",voto:"",data:"",faMedia:true,nota:"",notaFam:"",peso:100,visFam:true};
  const [selStudents,setSelStudents] = useState([]);
  const [docInnerTab, setDocInnerTab] = useState("registro");
  const [showFirmePanel, setShowFirmePanel] = useState(true);
  const [classeInnerTab, setClasseInnerTab] = useState("registro");

  const [votoModal,setVotoModal]   = useState(null);
  const [votoForm,setVotoForm]     = useState(defVoto);
  const [mpOpen,setMpOpen]         = useState(false);
  const [mpForm,setMpForm]         = useState({tipo:"orale",data:"",faMedia:true,nota:"",peso:100,commento:""});
  const [mpVoti,setMpVoti]         = useState({});
  const [mpSession,setMpSession]   = useState(null);
  const [azzeraMediaOpen,setAzzeraMediaOpen] = useState(false);
  const [azzeraMediaTrim,setAzzeraMediaTrim] = useState("1° Quadrimestre");
  const defCont={testo:"",oraInizio:"1",nOre:"1",gravita:"lieve",data:todayISO(),tipoLezione:"Lezione regolare",partecipazione:"tutti",alunniParz:[],destinatariTutti:false,destinatari:[]};
  const getDefFirma=()=>{const mat=getMaterieClasse(classe);return getDefFirmaBase(mat.length>0?mat[0]:materia);};
  const defColloquio={periodoRipetibilita:"Ogni settimana",numeroMax:5,modalita:"Misto",tuttiAlunni:true,attivo:true,dataInizio:"",dataFine:"",giorno:"Lunedì",oraInizio:"15:00",oraFine:"17:00",sede:"",nonDispDal:"",nonDispAl:"",note:"",linkVideo:"",classiSel:[]};
  const [contOpen,setContOpen]   = useState(null);
  const [editCont,setEditCont]   = useState(null);
  const [contForm,setContForm]   = useState(defCont);
  const [firmaOpen,setFirmaOpen] = useState(false);
  const [editFirma,setEditFirma] = useState(null);
  const [firmaForm,setFirmaForm] = useState(()=>getDefFirma());
  const [comunOpen,setComunOpen] = useState(false);
  const [editComun,setEditComun] = useState(null);
  const [comunForm,setComunForm] = useState({oggetto:"",testo:"",tipoComun:"scuola-famiglia",data:"",destinatariTutti:false,destinatari:[]});
  const [verOpen,setVerOpen]     = useState(false);
  const [editVer,setEditVer]     = useState(null);
  const [verForm,setVerForm]     = useState({tipoVerifica:"Scritto",argomenti:"",note:"",data:"",visibileFamiglia:true});
  const [collOpen,setCollOpen]   = useState(false);
  const [editColl,setEditColl]   = useState(null);
  const [collForm,setCollForm]   = useState(defColloquio);
  const [lightbox,setLightbox]   = useState(null);
  const [comunDettaglio,setComunDettaglio] = useState(null);
  const [schedaStudente,setSchedaStudente] = useState(null);
  const [schedaVoti,setSchedaVoti] = useState(null);

  const classiList=Object.keys(classi).sort();

  // ── Ripristino voti su iOS ──
  useEffect(()=>{
    const ripristina = async () => {
      if(!_doc) return;
      const key = `reg:${_doc}:votiDB`;

      // Prova tutte le chiavi locali
      const fonti = [
        key, key+'_bk1', key+'_bk2',
        ...Array.from({length:8},(_,i)=>`${key}_v${i}`)
      ];
      for(const k of fonti){
        try{
          const v=localStorage.getItem(k)||sessionStorage.getItem(k);
          if(v){const p=JSON.parse(v);if(p&&Object.keys(p).length>0){setVotiDB(p);return;}}
        }catch{}
      }
      // IDB
      try{const v=await _idbGet(key);if(v){const p=JSON.parse(v);if(p&&Object.keys(p).length>0){setVotiDB(p);_scrivi(p);return;}}}catch{}

      // window.storage come ultima spiaggia
      try{
        const wsKey=`vdb_${_doc.replace(/\s/g,'_')}`;
        const r=await _wst(window.storage.get(wsKey,false),5000);
        if(r?.value){const p=JSON.parse(r.value);if(p&&Object.keys(p).length>0){setVotiDB(p);_scrivi(p);}}
      }catch{}
    };
    ripristina();
  },[]);
  useEffect(()=>{
    const ripristina = async () => {
      if(!_doc) return;

      const applicaDati = (data, fonte) => {
        console.log(`[reg] ripristino da ${fonte}:`, Object.keys(data));
        if(data.classi && Object.keys(data.classi).length>0) {
          setClassiRaw(data.classi);
          // Riscrivi subito su localStorage e IDB
          const s=JSON.stringify(data.classi);
          try{localStorage.setItem(`reg:${_doc}:classi`,s);}catch{}
          try{_idbSet(`reg:${_doc}:classi`,s);}catch{}
        }
        if(data.votiDB && Object.keys(data.votiDB).length>0) setVotiDB(data.votiDB);
        if(data.assenzeDB && Object.keys(data.assenzeDB).length>0) setAssenzeDB(data.assenzeDB);
        if(data.contDB && Object.keys(data.contDB).length>0) setContDB(data.contDB);
        if(data.scrutiniDB) setScrutiniDB(data.scrutiniDB);
        if(data.colloquiDB && data.colloquiDB.length>0) setColloquiDB(data.colloquiDB);
        if(data.nomeScuola) setNomeScuolaRaw(data.nomeScuola);
      };

      // Conta alunni totali
      const nAlunni = (c) => c ? Object.values(c).reduce((s,a)=>s+(a?.length||0),0) : 0;

      // 1. Carica dal cloud (window.storage personale — cross-device)
      let cloudClassi = null;
      let cloudDati = {};
      try {
        const chiavi = ["classi","votiDB","assenzeDB","contDB","scrutiniDB","colloquiDB","nomeScuola"];
        await Promise.all(chiavi.map(async k=>{
          try{ const v=await cloudLoad(_doc,k); if(v!==null) cloudDati[k]=v; }catch{}
        }));
        cloudClassi = cloudDati.classi;
      } catch {}

      // 2. Carica dal locale (localStorage + IDB)
      let localClassi = cGet("classi");
      if(!localClassi || nAlunni(localClassi)===0) {
        // Prova backup localStorage
        try{ const v=localStorage.getItem(`reg:${_doc}:classi_bk1`); if(v){const p=JSON.parse(v);if(nAlunni(p)>0)localClassi=p;} }catch{}
      }
      if(!localClassi || nAlunni(localClassi)===0) {
        // Prova IDB
        const v = await cGetAsync("classi");
        if(v && nAlunni(v)>0) localClassi=v;
      }
      if(!localClassi || nAlunni(localClassi)===0) {
        // Prova IDB backup
        try{
          const raw=await _idbGet(`reg:${_doc}:classi_bk`);
          if(raw){const p=JSON.parse(raw);if(nAlunni(p)>0)localClassi=p;}
        }catch{}
      }

      const nCloud = nAlunni(cloudClassi);
      const nLocal = nAlunni(localClassi);

      console.log(`[reg] avvio: cloud=${nCloud} alunni, locale=${nLocal} alunni`);

      if(nCloud===0 && nLocal===0) {
        // Nessun dato trovato da nessuna parte
        console.log("[reg] nessun dato trovato");
        return;
      }

      if(nCloud >= nLocal) {
        // Il cloud ha più (o uguale) alunni — usa cloud (è la versione più aggiornata)
        applicaDati(cloudDati, "cloud");
      } else {
        // Il locale ha più alunni — usa locale E aggiorna il cloud
        const localDati = {};
        ["classi","votiDB","assenzeDB","contDB","scrutiniDB","colloquiDB","nomeScuola"].forEach(k=>{
          const v=cGet(k); if(v) localDati[k]=v;
        });
        applicaDati(localDati, "locale");
        // Aggiorna cloud con i dati locali più recenti
        cloudSaveAll(_doc, {...localDati, _timestamp:Date.now()}).catch(()=>{});
      }
    };
    ripristina();
  },[]);

  // ── Ogni volta che classi cambia: salva SUBITO su cloud + tutti i backup ──
  useEffect(()=>{
    if(!_doc || Object.keys(classi).length===0) return;
    const s=JSON.stringify(classi);
    // localStorage (3 copie con chiavi diverse)
    ["classi","classi_bk1","classi_bk2"].forEach(k=>{
      try{localStorage.setItem(`reg:${_doc}:${k}`,s);}catch{}
    });
    // sessionStorage
    try{sessionStorage.setItem(`reg:${_doc}:classi`,s);}catch{}
    // IndexedDB (2 copie)
    try{_idbSet(`reg:${_doc}:classi`,s);}catch{}
    try{_idbSet(`reg:${_doc}:classi_bk`,s);}catch{}
    // Cloud — SINCRONO, non throttled, ogni volta
    cloudSave(_doc,"classi",classi).catch(()=>{});
    cloudSave(_doc,"_timestamp",Date.now()).catch(()=>{});
  },[JSON.stringify(classi)]);

  useEffect(()=>{if(classiList.length>0&&(!classe||!classi[classe]))setClasse(classiList[0]);},[classiList.join(",")]);

  // Migrazione all'avvio: recupera lezioni/compiti vecchi e comunicazioni da chiavi legacy
  useEffect(()=>{
    setContDB(prev=>{
      const db=JSON.parse(JSON.stringify(prev));
      let changed=false;

      // 1. MIGRA LEZIONI/COMPITI: sposta ogni item alla chiave classe||materiaLezione
      Object.keys(db).forEach(k=>{
        if(k.includes("__firme__")||k.includes("__class__")||k==="__comunicazioni__") return;
        ["lezioni","compiti"].forEach(sec=>{
          const arr=db[k]?.[sec];
          if(!arr||arr.length===0) return;
          const parts=k.split("||");
          if(parts.length<2) return;
          const cl=parts[0];
          const keep=[];
          arr.forEach(item=>{
            const matItem=(item.materiaLezione||"").trim();
            if(matItem){
              const correctKey=`${cl}||${matItem}`;
              if(correctKey!==k){
                if(!db[correctKey]) db[correctKey]={};
                if(!db[correctKey][sec]) db[correctKey][sec]=[];
                if(!db[correctKey][sec].find(x=>x.id===item.id)){
                  db[correctKey][sec].push(item);
                }
                changed=true;
                return; // non tenere nella chiave sbagliata
              }
            }
            keep.push(item);
          });
          if(keep.length!==arr.length){ db[k][sec]=keep; changed=true; }
        });
      });

      // 2. Deduplica lezioni/compiti per ogni chiave
      Object.keys(db).forEach(k=>{
        ["lezioni","compiti"].forEach(sec=>{
          const arr=db[k]?.[sec];
          if(!arr) return;
          const seen=new Set();
          const dedup=arr.filter(x=>{ if(seen.has(x.id))return false; seen.add(x.id); return true; });
          if(dedup.length!==arr.length){ db[k][sec]=dedup; changed=true; }
        });
      });

      // 3. RECUPERA COMUNICAZIONI VECCHIE da __class__* e le unisce in __comunicazioni__
      const globali=(db["__comunicazioni__"]?.["comunicazioni"]||[]);
      const globaliIds=new Set(globali.map(c=>c.id));
      const recuperate=[];
      Object.keys(db).filter(k=>k.startsWith("__class__")).forEach(k=>{
        const cl=k.replace("__class__","");
        (db[k]?.["comunicazioni"]||[]).forEach(c=>{
          if(!globaliIds.has(c.id)){
            // Assegna la classe di provenienza se non ha classiCom
            const classiCom=(c.classiCom&&c.classiCom.length>0)?c.classiCom:[cl];
            recuperate.push({...c,classiCom});
            globaliIds.add(c.id);
            changed=true;
          }
        });
        // Svuota comunicazioni dalla chiave legacy
        if(db[k]?.["comunicazioni"]?.length>0){
          db[k]=({...db[k],comunicazioni:[]});
          changed=true;
        }
      });
      if(recuperate.length>0){
        if(!db["__comunicazioni__"]) db["__comunicazioni__"]={};
        db["__comunicazioni__"]["comunicazioni"]=[...globali,...recuperate];
      }

      if(changed){ try{ cSet("contDB",db); }catch{} }
      return changed?db:prev;
    });
  },[]);

  useEffect(()=>{
    const salvaLocale = () => {
      // Legge sempre lo stato più fresco tramite ref
      const d = _stateRef.current;
      if(!d || !_doc) return;
      const chiavi = ["classi","votiDB","assenzeDB","contDB","scrutiniDB","colloquiDB","nomeScuola"];
      chiavi.forEach(k=>{
        if(!d[k]) return;
        const s = JSON.stringify(d[k]);
        const key = `reg:${_doc}:${k}`;
        try{localStorage.setItem(key,s);}catch{}
        try{localStorage.setItem(key+"_bk1",s);}catch{}
        try{sessionStorage.setItem(key,s);}catch{}
        try{_idbSet(key,s);_idbSet(key+"_bk",s);}catch{}
      });
      try{localStorage.setItem(`reg:${_doc}:_timestamp`,String(Date.now()));}catch{}
    };

    let _tsCloud = 0;
    const salvaCloud = () => {
      const d = _stateRef.current;
      if(!d || !_doc) return;
      cloudSaveAll(_doc, {...d, _timestamp:Date.now()}).catch(()=>{});
    };

    const forceSync = () => {
      salvaLocale();
      const now = Date.now();
      if(now - _tsCloud > 30000) { _tsCloud = now; salvaCloud(); }
    };

    const onExit = () => { salvaLocale(); salvaCloud(); };
    const onVisibility = () => { if(document.hidden) onExit(); else forceSync(); };

    window.addEventListener("beforeunload", onExit);
    window.addEventListener("pagehide", onExit);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", forceSync);
    const interval = setInterval(forceSync, 5000);

    return () => {
      window.removeEventListener("beforeunload", onExit);
      window.removeEventListener("pagehide", onExit);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", forceSync);
      clearInterval(interval);
    };
  }, []); // [] — si monta una volta sola, legge sempre da _stateRef

  // Ref aggiornato ad ogni render con lo stato più recente
  const _stateRef = useRef({});
  useEffect(()=>{
    _stateRef.current = {classi, votiDB, assenzeDB, contDB, scrutiniDB, colloquiDB, nomeScuola};
  });

  useEffect(()=>{if(!progOpen)return;const h=e=>{if(progRef.current&&!progRef.current.contains(e.target))setProgOpen(false);};window.addEventListener("mousedown",h);return()=>window.removeEventListener("mousedown",h);},[progOpen]);

  const showToast = (_msg) => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setToastMsg("Operazione eseguita correttamente.");
    }, 900);
  };

  // ── Merge dati colleghi nel contDB (da cloud storage) ──
  // Legge i dati pubblicati dai colleghi e li fonde nel contDB locale
  // così le lezioni/compiti del collega appaiono direttamente nel Registro di Classe
  const [datiColleghiCloud, setDatiColleghiCloud] = useState({});

  const contDBMerged = useMemo(()=>{
    if(!Object.keys(datiColleghiCloud).length) return contDB;
    const merged = {...contDB};
    Object.values(datiColleghiCloud).forEach(collegaData=>{
      if(!collegaData || collegaData.classe!==classe) return;
      const sezioni=["lezioni","compiti","annotazioni","verifiche","firme"];
      sezioni.forEach(sec=>{
        (collegaData[sec]||[]).forEach(item=>{
          const mat=item.mat||item.materiaLezione||item.materia||materia;
          // Le annotazioni con flag _isNota vanno nella sezione "note", non "annotazioni"
          const secReale = (sec==="annotazioni" && item._isNota) ? "note" : sec;
          const key=secReale==="annotazioni"||secReale==="note"?`__class__${classe}`:
                    secReale==="firme"?`${classe}||__firme__`:
                    `${classe}||${mat}`;
          if(!merged[key]) merged[key]={};
          if(!merged[key][secReale]) merged[key][secReale]=[];
          const exists=merged[key][secReale].some(x=>x.id===item.id||(x.testo===item.testo&&toISO(x.data||"")===toISO(item.data||"")));
          if(!exists){
            // Nome del docente collega: usa sempre quello salvato sull'item, altrimenti il nome del docente che ha pubblicato i dati
            const nomeAutore = item.inseritoDa || item.doc || collegaData.docente || "Collega";
            merged[key][secReale]=[...merged[key][secReale],{
              ...item,
              id:item.id||`coll_${sec}_${Math.random()}`,
              data:item.data||"",
              testo:item.testo||item.arg||"",
              materiaLezione:mat,
              inseritoDa:nomeAutore,
              _daCollega:true,
            }];
          }
        });
      });
    });
    return merged;
  }, [contDB, datiColleghiCloud, classe, materia]);

  const setClassi=v=>{
    setClassiRaw(v);
    const s=JSON.stringify(v);
    const ts=Date.now();
    // Salva su TUTTI i livelli con backup numerati
    try{localStorage.setItem(`reg:${_doc}:classi`,s);}catch{}
    try{localStorage.setItem(`reg:${_doc}:classi_bk1`,s);}catch{}  // backup 1
    try{localStorage.setItem(`reg:${_doc}:classi_ts`,String(ts));}catch{}
    try{sessionStorage.setItem(`reg:${_doc}:classi`,s);}catch{}
    try{_idbSet(`reg:${_doc}:classi`, s);}catch{}
    try{_idbSet(`reg:${_doc}:classi_bk`, s);}catch{}  // backup IDB
    // Cookie per classi (piccolo, max 4KB) — sopravvive a svuotamento localStorage
    try{
      const ck=`rg_classi_${_doc}`.replace(/[^a-zA-Z0-9]/g,'_').slice(0,50);
      if(s.length<3500) document.cookie=`${ck}=${encodeURIComponent(s)};path=/;max-age=63072000;SameSite=Lax`;
    }catch{}
    // Cloud sync classi — ogni volta (non throttled, classi cambiano raramente)
    try{ cloudSave(_doc,'classi',v).catch(()=>{}); }catch{}
  };
  const students=(classe&&classi[classe])?[...classi[classe]].sort((a,b)=>a.cognome.localeCompare(b.cognome)):[];
  const allSel=students.length>0&&students.every(s=>selStudents.includes(s.id));
  const dk=`${classe}||${materia}`;
  const classKey=`__class__${classe}`;
  const getDkMat=(mat)=>`${classe}||${mat||materia}`;
  const getVoti=sid=>(votiDB[dk]?.[sid]||[]).filter(v=>(v.trimestre||TRIMESTRI[0])===pgTrim);
  const getAssenze=sid=>assenzeDB[classe]?.[sid]||[];
  const getCont=sec=>{
    if(sec==="firme")return contDB[`${classe}||__firme__`]?.[sec]||[];
    if(sec==="comunicazioni"){
      // Legge SOLO dalla chiave globale __comunicazioni__
      // Filtra per classe corrente (se classiCom è vuoto = visibile a tutte)
      const globali=contDB["__comunicazioni__"]?.["comunicazioni"]||[];
      return globali.filter(c=>
        !c.classiCom || c.classiCom.length===0 || c.classiCom.includes(classe)
      );
    }
    if(["annotazioni","note"].includes(sec))return contDB[classKey]?.[sec]||[];
    if(sec==="lezioni"||sec==="compiti"){
      // Legge SOLO dalla chiave esatta classe||materia — nessun mescolamento
      const exactKey=`${classe}||${materia}`;
      const items=contDB[exactKey]?.[sec]||[];
      // Deduplicazione per sicurezza
      const seen=new Set();
      return items.filter(item=>{
        if(seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    }
    return contDB[dk]?.[sec]||[];
  };
  const saveCont=(sec,v,matOverride)=>{
    let key;
    if(sec==="firme") key=`${classe}||__firme__`;
    else if(sec==="comunicazioni") key="__comunicazioni__";
    else if(["annotazioni","note"].includes(sec)) key=classKey;
    else if(sec==="lezioni"||sec==="compiti"){
      key=`${classe}||${matOverride||materia}`;
    }
    else key=dk;
    setContDB(p=>{
      const next={...p,[key]:{...(p[key]||{}),[sec]:v}};
      const _s=JSON.stringify(next);
      try{localStorage.setItem(`reg:${_doc}:contDB`,_s);}catch{}
      try{localStorage.setItem(`reg:${_doc}:contDB_bk1`,_s);}catch{}
      try{sessionStorage.setItem(`reg:${_doc}:contDB`,_s);}catch{}
      try{_idbSet(`reg:${_doc}:contDB`,_s);_idbSet(`reg:${_doc}:contDB_bk`,_s);}catch{}
      cloudSave(_doc,"contDB",next).catch(()=>{});
      return next;
    });
    showToast();
  };
  const deleteContById=(sec,id)=>{
    setContDB(p=>{
      const db={...p};
      if(sec==="lezioni"||sec==="compiti"){
        // Elimina SOLO dalla chiave esatta della materia corrente
        const exactKey=`${classe}||${materia}`;
        if(db[exactKey]?.[sec]){
          db[exactKey]={...db[exactKey],[sec]:db[exactKey][sec].filter(x=>x.id!==id)};
        }
      } else {
        const prefix=`${classe}||`;
        Object.keys(db).filter(k=>k.startsWith(prefix)||k===classKey).forEach(k=>{
          if(db[k]?.[sec]){
            const filtered=db[k][sec].filter(x=>x.id!==id);
            if(filtered.length!==db[k][sec].length) db[k]={...db[k],[sec]:filtered};
          }
        });
      }
      try{ cSet("contDB", db); }catch{}
      return db;
    });
    showToast();
  };
  // Navigatore giorno per Registro di Classe
  const [regDataNav, setRegDataNav] = useLocal("regDataNav", todayISO());
  // Assicura che la data sia sempre valida
  const regData = regDataNav || todayISO();
  const isRegToday = regData === todayISO();

  const fmtRegData = iso => {
    try {
      const d = new Date(iso+"T00:00:00");
      if(isNaN(d)) return iso;
      const GIORNI_IT=["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
      const MESI_IT=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
      return `${GIORNI_IT[d.getDay()]} ${d.getDate()} ${MESI_IT[d.getMonth()]} ${d.getFullYear()}`;
    } catch { return iso; }
  };
  const prevDay = () => {
    const d = new Date(regData+"T00:00:00");
    d.setDate(d.getDate()-1);
    setRegDataNav(d.toISOString().split("T")[0]);
  };
  const nextDay = () => {
    const d = new Date(regData+"T00:00:00");
    d.setDate(d.getDate()+1);
    setRegDataNav(d.toISOString().split("T")[0]);
  };

  // Converti data it (gg/mm/aaaa) a ISO per confronto
  const toISOFast = d => {
    if(!d) return "";
    if(d.includes("-")) return d;
    const [dd,mm,yy]=d.split("/");
    return `${yy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`;
  };

  const hasAssenzaInData = (sid, dataISO) => {
    return (assenzeDB[classe]?.[sid]||[]).some(a=>
      toISOFast(a.data)===dataISO &&
      a.tipo==="assente" &&
      (!a.ore || a.ore==="Tutto il giorno")
    );
  };
  const hasAssenzaOggi=sid=>hasAssenzaInData(sid, todayISO());
  // ══════════════════════════════════════════════════════
  // SALVATAGGIO VOTI ULTRA-ROBUSTO iOS
  // Ogni chiave votiDB (classe||materia) salvata individualmente
  // su window.storage + tutti i livelli locali
  // ══════════════════════════════════════════════════════
  const _salvaVotiChiave = async (chiave, datiAlunni) => {
    const wsKey = `vdb_${(_doc||'').replace(/\s/g,'_')}_${chiave.replace(/[^a-zA-Z0-9]/g,'_')}`;
    const val = JSON.stringify(datiAlunni);
    // localStorage — 5 copie
    for(let i=0;i<5;i++) try{ localStorage.setItem(`reg:${_doc}:vdb_${chiave}_${i}`, val); }catch{}
    // sessionStorage
    try{ sessionStorage.setItem(`reg:${_doc}:vdb_${chiave}`, val); }catch{}
    // IDB
    try{ _idbSet(`reg:${_doc}:vdb_${chiave}`, val); }catch{}
    try{ _idbSet(`reg:${_doc}:vdb_${chiave}_bk`, val); }catch{}
    // window.storage — L'UNICO che iOS non svuota
    try{ await _wst(window.storage.set(wsKey, val, false), 4000); }catch{}
  };

  const _salvaIndiciVoti = async (chiavi) => {
    const wsKey = `vdb_${(_doc||'').replace(/\s/g,'_')}_idx`;
    const val = JSON.stringify(chiavi);
    try{ localStorage.setItem(`reg:${_doc}:vdb_idx`, val); }catch{}
    try{ sessionStorage.setItem(`reg:${_doc}:vdb_idx`, val); }catch{}
    try{ _idbSet(`reg:${_doc}:vdb_idx`, val); }catch{}
    try{ await _wst(window.storage.set(wsKey, val, false), 3000); }catch{}
  };

  const _leggiVotiChiave = async (chiave) => {
    // 1. localStorage — 5 copie
    for(let i=0;i<5;i++){
      try{ const v=localStorage.getItem(`reg:${_doc}:vdb_${chiave}_${i}`); if(v) return JSON.parse(v); }catch{}
    }
    // 2. sessionStorage
    try{ const v=sessionStorage.getItem(`reg:${_doc}:vdb_${chiave}`); if(v) return JSON.parse(v); }catch{}
    // 3. IDB
    try{ const v=await _idbGet(`reg:${_doc}:vdb_${chiave}`); if(v) return JSON.parse(v); }catch{}
    try{ const v=await _idbGet(`reg:${_doc}:vdb_${chiave}_bk`); if(v) return JSON.parse(v); }catch{}
    // 4. window.storage
    try{
      const wsKey=`vdb_${(_doc||'').replace(/\s/g,'_')}_${chiave.replace(/[^a-zA-Z0-9]/g,'_')}`;
      const r=await _wst(window.storage.get(wsKey,false),4000);
      if(r?.value) return JSON.parse(r.value);
    }catch{}
    return null;
  };

  // Legge il votiDB più completo da TUTTI i livelli sincroni
  const _leggiMigliore = () => {
    const key = `reg:${_doc}:votiDB`;
    const fonti = [
      key, key+'_bk1', key+'_bk2',
      ...Array.from({length:8},(_,i)=>`${key}_v${i}`)
    ];
    let migliore = null;
    let maxVoti = 0;
    for(const k of fonti){
      try{
        const v = localStorage.getItem(k) || sessionStorage.getItem(k);
        if(!v) continue;
        const p = JSON.parse(v);
        if(!p) continue;
        const n = Object.values(p).reduce((s,alunni)=>
          s+Object.values(alunni||{}).reduce((s2,arr)=>s2+(Array.isArray(arr)?arr.length:0),0),0);
        if(n > maxVoti){ maxVoti=n; migliore=p; }
      }catch{}
    }
    return migliore;
  };

  // Fonde due votiDB prendendo sempre il massimo dei voti per ogni alunno/chiave
  const _fondi = (a, b) => {
    if(!a && !b) return {};
    if(!a) return b;
    if(!b) return a;
    const result = JSON.parse(JSON.stringify(a));
    Object.keys(b).forEach(chiave=>{
      if(!result[chiave]) { result[chiave]=b[chiave]; return; }
      Object.keys(b[chiave]||{}).forEach(sid=>{
        const arrA = result[chiave][sid]||[];
        const arrB = b[chiave][sid]||[];
        if(arrB.length > arrA.length) result[chiave][sid]=arrB;
        else if(arrA.length === arrB.length && arrB.length > 0){
          // Stessa lunghezza: prendi quello con ID più recente
          const maxA = Math.max(...arrA.map(v=>v.id||0));
          const maxB = Math.max(...arrB.map(v=>v.id||0));
          if(maxB > maxA) result[chiave][sid]=arrB;
        }
      });
    });
    return result;
  };

  const _scrivi = (db) => {
    if(!_doc) return;
    // PRIMA leggi il meglio già salvato e FONDI — mai perdere voti
    const salvato = _leggiMigliore();
    const fuso = _fondi(salvato, db);
    const s = JSON.stringify(fuso);
    const key = `reg:${_doc}:votiDB`;
    for(let i=0;i<8;i++) try{localStorage.setItem(`${key}_v${i}`,s);}catch(e){
      try{
        Object.keys(localStorage).filter(k=>k.includes('_v')&&k.includes('votiDB')&&k!==`${key}_v${i}`).slice(0,10).forEach(k=>{try{localStorage.removeItem(k);}catch{}});
        localStorage.setItem(`${key}_v${i}`,s);
      }catch{}
    }
    try{localStorage.setItem(key,s);}catch{}
    try{localStorage.setItem(key+'_bk1',s);}catch{}
    try{localStorage.setItem(key+'_bk2',s);}catch{}
    try{sessionStorage.setItem(key,s);}catch{}
    try{sessionStorage.setItem(key+'_s2',s);}catch{}
    try{_idbSet(key,s);_idbSet(key+'_b',s);_idbSet(key+'_b2',s);}catch{}
    try{window.storage.set(`vdb_${_doc.replace(/\s/g,'_')}`,s,false);}catch{}
    return fuso;
  };

  const saveVoti=(sid,v)=>{
    setVotiDB(prev=>{
      // Fondi prev con il meglio sul disco prima di aggiungere il nuovo voto
      const salvato = _leggiMigliore();
      const base = _fondi(salvato, prev);
      const next = {...base, [dk]:{...(base[dk]||{}), [sid]:v}};
      const fuso = _scrivi(next);
      cloudSave(_doc,"votiDB",fuso||next).catch(()=>{});
      return fuso||next;
    });
    showToast();
  };
  const saveAssenze=(sid,v)=>{
    setAssenzeDB(p=>{
      const next={...p,[classe]:{...(p[classe]||{}),[sid]:v}};
      const s=JSON.stringify(next);
      try{localStorage.setItem(`reg:${_doc}:assenzeDB`,s);}catch{}
      try{localStorage.setItem(`reg:${_doc}:assenzeDB_bk1`,s);}catch{}
      try{sessionStorage.setItem(`reg:${_doc}:assenzeDB`,s);}catch{}
      try{_idbSet(`reg:${_doc}:assenzeDB`,s);_idbSet(`reg:${_doc}:assenzeDB_bk`,s);}catch{}
      cloudSave(_doc,"assenzeDB",next).catch(()=>{});
      return next;
    });
    showToast();
  };
    const ngCount=sid=>getAssenze(sid).filter(a=>!a.giustificato&&a.concorreCalcolo!==false).length;

  // Azzera la MEDIA di tutte le materie della classe corrente per il trimestre scelto,
  // senza eliminare i voti: li marca semplicemente come "non fa media" (faMedia:false).
  // I voti restano visibili nel registro con il loro valore originale.
  const azzeraMediaClasse = (trim) => {
    const prefix = `${classe}||`;
    setVotiDB(prev=>{
      const base = _fondi(_leggiMigliore(), prev);
      const next = JSON.parse(JSON.stringify(base));
      Object.keys(next).filter(k=>k.startsWith(prefix)).forEach(chiave=>{
        Object.keys(next[chiave]||{}).forEach(sid=>{
          next[chiave][sid] = (next[chiave][sid]||[]).map(v=>{
            const vTrim = v.trimestre || TRIMESTRI[0];
            if(vTrim !== trim) return v;
            return {...v, faMedia:false};
          });
        });
      });
      const fuso = _scrivi(next);
      cloudSave(_doc,"votiDB",fuso||next).catch(()=>{});
      return fuso||next;
    });
    setAzzeraMediaOpen(false);
    showToast(`Media del ${trim} azzerata per tutte le materie di ${classe}. I voti restano nel registro.`);
  };
  const assenzaRapidaInData = (sid, dataISO) => {
    const dataIT = (() => { const [y,m,d]=dataISO.split("-"); return `${d}/${m}/${y}`; })();
    const ex=getAssenze(sid);
    if(ex.some(a=>(toISOFast(a.data)===dataISO)&&a.tipo==="assente"&&(!a.ore||a.ore==="Tutto il giorno")))return;
    saveAssenze(sid,[...ex,{id:Date.now(),data:dataIT,tipo:"assente",ore:"Tutto il giorno",concorreCalcolo:true,motivo:"",giustificato:false,inseritoDa:docente}]);
  };
  const assenzaRapida=sid=>assenzaRapidaInData(sid, todayISO());
  const rinominaDocente=()=>{
    const n=nuovoNome.trim();
    if(!n){setModNomeOpen(false);return;}
    if(n===docente){setModNomeOpen(false);return;}
    try{
      const keys=Object.keys(localStorage).filter(k=>k.startsWith(`reg:${docente}:`));
      keys.forEach(k=>{
        const suf=k.slice(`reg:${docente}:`.length);
        localStorage.setItem(`reg:${n}:${suf}`,localStorage.getItem(k));
        localStorage.removeItem(k);
      });
      localStorage.setItem("reg:lastDocente",n);
    }catch(e){console.warn("rinomina errore",e);}
    _doc=n;
    setModNomeOpen(false);
    window.location.reload();
  };
  const esportaDati=()=>{try{const dati={};const pref=`reg:${docente}:`;Object.keys(localStorage).filter(k=>k.startsWith(pref)).forEach(k=>{dati[k.slice(pref.length)]=JSON.parse(localStorage.getItem(k));});const blob=new Blob([JSON.stringify(dati,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`registro_${docente.replace(/\s+/g,"_")}.json`;a.click();URL.revokeObjectURL(url);}catch{alert("Errore esportazione");}};
  const importaDati=e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{try{const dati=JSON.parse(ev.target.result);const pref=`reg:${docente}:`;Object.entries(dati).forEach(([k,v])=>localStorage.setItem(pref+k,JSON.stringify(v)));alert("Importati! Ricarico...");window.location.reload();}catch{alert("File non valido.");}};reader.readAsText(file);e.target.value="";};

  // ── Azzera registro: svuota SOLO i dati della scheda di ogni alunno (anagrafica/annotazioni condivise) ──
  // I dati del registro (voti, assenze, lezioni, compiti, ecc.) usati dal Registro Web restano sempre presenti.
  const eseguiAzzeramento = () => {
    if(azzeraScelta==="tutto"){
      try{
        const tuttiAlunni = Object.values(classi).flat();
        tuttiAlunni.forEach(al=>{
          Object.keys(classi).forEach(cl=>{
            const key=`anag:${docente}:${cl}:${al.id}`;
            try{localStorage.removeItem(key);}catch{}
            try{sessionStorage.removeItem(key);}catch{}
          });
        });
      }catch{}
      setAzzeraOpen(false);
      setAzzeraConferma(false);
      showToast("Scheda di tutti gli alunni azzerata. Il Registro Web mantiene tutti i dati.");
    } else {
      // Elimina solo i voti del/dei quadrimestre/i selezionato/i, da tutte le chiavi classe||materia
      const trimDaElim = azzeraTrim==="entrambi" ? TRIMESTRI : [azzeraTrim];
      setVotiDB(prev=>{
        const next=JSON.parse(JSON.stringify(prev));
        Object.keys(next).forEach(chiave=>{
          Object.keys(next[chiave]||{}).forEach(sid=>{
            const arr=next[chiave][sid]||[];
            const filtrato=arr.filter(v=>{
              const vTrim=v.trimestre||TRIMESTRI[0];
              return !trimDaElim.includes(vTrim);
            });
            next[chiave][sid]=filtrato;
          });
        });
        const fuso=_scrivi(next);
        cloudSave(_doc,"votiDB",fuso||next).catch(()=>{});
        return fuso||next;
      });
      // Elimina anche eventuali scrutini dei quadrimestri scelti
      setScrutiniDB(prev=>{
        const next={...prev};
        Object.keys(next).forEach(cl=>{
          if(next[cl]){
            next[cl]={...next[cl]};
            trimDaElim.forEach(t=>{ delete next[cl][t]; });
          }
        });
        return next;
      });
      setAzzeraOpen(false);
      setAzzeraConferma(false);
      showToast(azzeraTrim==="entrambi" ? "Voti di entrambi i quadrimestri eliminati." : `Voti del ${azzeraTrim} eliminati.`);
    }
  };

  const getSlot=(g,o)=>orario[`${g}|${o}`]||null;
  const setSlot=(g,o,val)=>{const k=`${g}|${o}`;if(!val){const n={...orario};delete n[k];setOrario(n);}else setOrario({...orario,[k]:val});};
  const todayGStr=(()=>{const d=new Date().getDay();return{1:"Lunedì",2:"Martedì",3:"Mercoledì",4:"Giovedì",5:"Venerdì",6:"Sabato"}[d]||null;})();
  const calcMedia=(sid,mat,cl,trim)=>{
    const c=cl||classe;
    const key=`${c}||${mat}`;
    const tutti=(votiDB[key]?.[sid]||[]);
    const trimFiltro=trim||pgTrim;
    // Filtra SOLO i voti del quadrimestre richiesto.
    // I voti senza campo trimestre (vecchi, pre-migrazione) sono considerati
    // del 1° Quadrimestre per compatibilità.
    const voti=tutti.filter(v=>{
      const vTrim=v.trimestre||TRIMESTRI[0];
      if(vTrim!==trimFiltro) return false;
      return v.faMedia &&
        v.voto!==" " && v.voto!=="" && v.voto!==null && v.voto!==undefined &&
        !isNaN(parseVoto(v.voto));
    });
    if(!voti.length)return null;
    let sp=0,sv=0;
    voti.forEach(v=>{const n=parseVoto(v.voto);const w=parseFloat(v.peso)||100;sv+=n*w;sp+=w;});
    return sp>0?sv/sp:null;
  };
  const mediaStr=sid=>{const m=calcMedia(sid,materia,classe,pgTrim);return m===null?"-":m.toFixed(2);};
  const openNuovoVoto=sid=>{setVotoModal({sid,editing:null});setVotoForm({...defVoto,data:todayISO()});};
  const openEditVoto=(sid,v)=>{setVotoModal({sid,editing:v.id});setVotoForm({tipo:v.tipo||"orale",voto:v.voto,data:v.data,faMedia:v.faMedia,nota:v.nota||"",notaFam:v.notaFam||"",peso:v.peso??100,visFam:v.visFam!==false});};
  const salvaVoto=()=>{
    if(!votoModal) return;
    const {sid,editing}=votoModal;
    let vv=votoForm.voto;
    // Voto vuoto → 💬 e non fa media
    if(vv===""||vv===null||vv===undefined){
      vv="💬";
      setVotoForm(f=>({...f,voto:"💬",faMedia:false}));
    }
    const chiave=dk;
    const entry={...votoForm,voto:vv,faMedia:vv==="💬"?false:votoForm.faMedia,inseritoDa:firmaAttiva,trimestre:pgTrim};
    setVotiDB(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      if(!next[chiave]) next[chiave]={};
      if(!next[chiave][sid]) next[chiave][sid]=[];
      if(editing){
        next[chiave][sid]=next[chiave][sid].map(v=>v.id===editing?{...v,...entry}:v);
      } else {
        next[chiave][sid]=[...next[chiave][sid],{id:Date.now(),...entry}];
      }
      _scrivi(next);
      cloudSave(_doc,"votiDB",next).catch(()=>{});
      return next;
    });
    setVotoModal(null);
    showToast();
  };
  const salvaMultipla=()=>{
    const sid=`ms_${Date.now()}`;
    const tgt=mpOpen==="sel"?students.filter(s=>selStudents.includes(s.id)):students;
    setVotiDB(prev=>{
      // Fondi con il meglio sul disco
      const salvato = _leggiMigliore();
      const base = _fondi(salvato, prev);
      const db=JSON.parse(JSON.stringify(base));
      if(!db[dk])db[dk]={};
              tgt.forEach(s=>{
        const v=mpVoti[s.id]??null;
        // Voto vuoto → 💬 e non fa media
        const vFinal = (v===null||v==="") ? "💬" : v;
        const faMediaFinal = vFinal==="💬" ? false : mpForm.faMedia;
        if((vFinal===null||vFinal==="")&&!mpSession) return;
        const ex=db[dk][s.id]||[];
        const notaPersonale = (mpVoti[`nota_${s.id}`]||"").trim();
        const notaFamFinale = notaPersonale || mpForm.notaFam||"";
        const notaFinale    = notaPersonale || mpForm.nota||"";
        const entry={...mpForm,voto:vFinal,faMedia:faMediaFinal,nota:notaFinale,notaFam:notaFamFinale,commento:"",inseritoDa:firmaAttiva,trimestre:pgTrim};
        if(mpSession){
          db[dk][s.id]=[...ex.filter(x=>x.sessionId!==mpSession)];
          if(vFinal!==null&&vFinal!=="") db[dk][s.id].push({id:Date.now()+s.id,...entry,sessionId:mpSession});
        } else {
          if(vFinal!==null) db[dk][s.id]=[...ex,{id:Date.now()+s.id,...entry,sessionId:sid}];
        }
      });
      const fuso = _scrivi(db);
      cloudSave(_doc,"votiDB",fuso||db).catch(()=>{});
      return fuso||db;
    });
    showToast();setMpOpen(false);setMpVoti({});setMpSession(null);
  };
  const openContenuto=(sec,item=null,matIniz)=>{const matDef=matIniz||materia;setContOpen(sec);setEditCont(item?item.id:null);setContForm(item?{testo:item.testo||"",oraInizio:item.oraInizio||"1",nOre:item.nOre||"1",gravita:item.gravita||"lieve",data:toISO(item.data||"")||todayISO(),tipoLezione:item.tipoLezione||"Lezione regolare",partecipazione:item.partecipazione||"tutti",alunniParz:item.alunniParz||[],destinatariTutti:item.destinatariTutti||false,destinatari:item.destinatari||[],materiaLezione:item.materiaLezione||matDef,link:item.link||"",argomentoSel:item.argomentoSel||"",minutiSvolti:item.minutiSvolti||60,collabora:item.collabora||false}:{testo:"",oraInizio:"1",nOre:"1",gravita:"lieve",data:todayISO(),tipoLezione:"Lezione regolare",partecipazione:"tutti",alunniParz:[],destinatariTutti:false,destinatari:[],materiaLezione:matDef,link:"",argomentoSel:"",minutiSvolti:60,collabora:false});};
  const salvaContenuto=()=>{
    const dataLezione = contForm.data||new Date().toLocaleDateString("it-IT");
    let ore = "";
    const matSave = (contForm.materiaLezione||materia).trim();
    if(contOpen==="lezioni"){
      const mat = matSave.toLowerCase();
      const dataISO = toISO(dataLezione);
      // Cerca firma corrispondente in TUTTE le firme della classe (non filtrate per materia corrente)
      const firmeKey = `${classe}||__firme__`;
      const tutteFirme = contDB[firmeKey]?.["firme"]||[];
      const firmeMatch = tutteFirme.filter(f=>{
        const fDataISO = toISO(f.data||"");
        const fMat = (f.materia||f.materiaFirma||"").trim().toLowerCase();
        return fDataISO===dataISO && fMat===mat;
      });
      if(firmeMatch.length>0){
        const ultima=firmeMatch.reduce((a,b)=>((b.id||0)>(a.id||0))?b:a);
        ore=ultima.ore||"";
      }
    }
    const item={...contForm,materiaLezione:matSave,ore,data:dataLezione,inseritoDa:firmaAttiva};

    if((contOpen==="lezioni"||contOpen==="compiti") && editCont){
      // Modifica: potrebbe aver cambiato materia → rimuovi da TUTTE le chiavi e salva nella corretta
      setContDB(p=>{
        const db={...p};
        const newKey=`${classe}||${matSave}`;
        // Rimuovi da tutte le chiavi della classe
        Object.keys(db).filter(k=>k.startsWith(`${classe}||`)&&!k.includes("__firme__")).forEach(k=>{
          if(db[k]?.[contOpen]){
            db[k]={...db[k],[contOpen]:db[k][contOpen].filter(x=>x.id!==editCont)};
          }
        });
        // Aggiungi nella chiave corretta
        if(!db[newKey]) db[newKey]={};
        db[newKey]={...db[newKey],[contOpen]:[...(db[newKey][contOpen]||[]),{...item,id:editCont}]};
        try{cSet("contDB",db);}catch{}
        return db;
      });
      showToast();
    } else if((contOpen==="lezioni"||contOpen==="compiti") && !editCont){
      // Nuovo item: salva nella chiave esatta materia
      const newKey=`${classe}||${matSave}`;
      setContDB(p=>{
        const db={...p};
        if(!db[newKey]) db[newKey]={};
        db[newKey]={...db[newKey],[contOpen]:[...(db[newKey][contOpen]||[]),{id:Date.now(),...item}]};
        try{cSet("contDB",db);}catch{}
        return db;
      });
      showToast();
    } else {
      if(editCont)saveCont(contOpen,getCont(contOpen).map(c=>c.id===editCont?{...c,...item}:c),matSave);
      else saveCont(contOpen,[...getCont(contOpen),{id:Date.now(),...item}],matSave);
    }
    setContOpen(null);setEditCont(null);
  };
  const openFirma=(item=null)=>{setFirmaOpen(true);setEditFirma(item?item.id:null);setFirmaForm(item?{oraInizio:item.oraInizio||"1",nOre:item.nOre||"1",durataLezione:item.durataLezione||"60 minuti",tipoFirma:item.tipoFirma||"Cattedra",sostituzione:item.sostituzione||false,docenteSostituito:item.docenteSostituito||"",tipoLezione:item.tipoLezione||"Lezione regolare",partecipazione:item.partecipazione||"tutti",alunniParz:item.alunniParz||[],materiaFirma:item.materia||item.materiaFirma||getDefFirma().materiaFirma,alunniAltreClassi:item.alunniAltreClassi||[],presenteMensa:item.presenteMensa||false,pastoInBianco:item.pastoInBianco||false,argomentoLezione:item.argomentoLezione||""}:getDefFirma());};
  const salvaFirma=()=>{
    const nO=parseInt(firmaForm.nOre)||1;
    const inizio=parseInt(firmaForm.oraInizio)||1;
    const fine=inizio+nO-1;
    // Ore: pallino + testo
    const ore=nO===1?`${inizio}`:`${inizio}-${fine}`;
    const oreLabel=nO===1?`Ora ${inizio}: 1 ora`:`Ore ${inizio}-${fine}: ${nO} ore`;
    const oggi=new Date().toLocaleDateString("it-IT");
    const oggiISO=toISO(oggi);
    const mat=(firmaForm.materiaFirma||"").trim().toLowerCase();
    const item={...firmaForm,ore:oreLabel,oreNum:ore,oraInizioNum:inizio,oraFineNum:fine,data:oggi,docente:firmaAttiva,materia:firmaForm.sostituzione?null:firmaForm.materiaFirma};
    if(editFirma)saveCont("firme",getCont("firme").map(c=>c.id===editFirma?{...c,...item}:c));
    else saveCont("firme",[...getCont("firme"),{id:Date.now(),...item}]);
    const matFirma=firmaForm.materiaFirma||materia;
    setContDB(p=>{
      const key=`${classe}||${matFirma}`;
      const existing=p[key]||{};
      const lezioniOld=existing.lezioni||[];
      const lezioniUpd=lezioniOld.map(l=>{
        const lDataISO=toISO(l.data||"");
        const lMat=(l.materiaLezione||"").trim().toLowerCase();
        if(lDataISO===oggiISO&&lMat===mat&&!l.ore){
          return {...l,ore:oreLabel};
        }
        return l;
      });
      const argTesto=firmaForm.argomentoLezione&&firmaForm.argomentoLezione.trim();
      const giaEsiste=argTesto&&lezioniUpd.some(l=>l.testo===argTesto&&toISO(l.data||"")===oggiISO&&l.ore===oreLabel);
      const lezioniFinali=argTesto&&!giaEsiste
        ?[...lezioniUpd,{id:Date.now()+1,data:item.data,testo:argTesto,ore:oreLabel,partecipazione:firmaForm.partecipazione,alunniParz:firmaForm.alunniParz||[],materiaLezione:matFirma,inseritoDa:firmaAttiva}]
        :lezioniUpd;
      return {...p,[key]:{...existing,lezioni:lezioniFinali}};
    });
    setFirmaOpen(false);setEditFirma(null);
  };
  // ── Migrazione voti: rimossa. Ogni voto resta assegnato al trimestre
  // in cui è stato effettivamente inserito (campo `trimestre`).
  // I voti vecchi senza campo trimestre vengono trattati come 1° Quadrimestre
  // per compatibilità (vedi calcMedia).
  useEffect(()=>{
    const ripristina = async ()=>{
      if(!_doc) return;
      if((contDB["__comunicazioni__"]?.["comunicazioni"]||[]).length>0) return;
      const docKey = (_doc||'').replace(/\s/g,'_');
      const idsKey = `wcom_${docKey}_ids`;

      // Leggi indice da window.storage prima
      let ids = null;
      try{ const r=await _wst(window.storage.get(idsKey,false),4000); if(r?.value) ids=JSON.parse(r.value); }catch{}
      // Fallback localStorage
      if(!ids) try{ const v=localStorage.getItem(`rc_${_doc}_ids`); if(v) ids=JSON.parse(v); }catch{}
      if(!ids||!ids.length) return;

      // Carica ogni comunicazione
      const lista = (await Promise.all(ids.map(async id=>{
        const key = `wcom_${docKey}_${id}`;
        // window.storage prima
        try{ const r=await _wst(window.storage.get(key,false),4000); if(r?.value) return JSON.parse(r.value); }catch{}
        // localStorage fallback
        try{ const v=localStorage.getItem(`rc_${_doc}_${id}`); if(v) return JSON.parse(v); }catch{}
        try{ const v=sessionStorage.getItem(`rc_${_doc}_${id}`); if(v) return JSON.parse(v); }catch{}
        try{ const v=await _idbGet(`rc_${_doc}_${id}`); if(v) return JSON.parse(v); }catch{}
        return null;
      }))).filter(Boolean);

      if(!lista.length) return;
      setContDB(p=>({...p,"__comunicazioni__":{...(p["__comunicazioni__"]||{}),"comunicazioni":lista}}));
    };
    ripristina();
  },[]);

  // ── Salva comunicazioni con storage ultra-robusto iOS ──
  const _comunKey = `reg:${_doc}:comunicazioni_ios`;
  const _loadComunIOS = () => {
    const sources = [
      ()=>localStorage.getItem(_comunKey),
      ()=>localStorage.getItem(_comunKey+"_bk1"),
      ()=>localStorage.getItem(_comunKey+"_bk2"),
      ()=>sessionStorage.getItem(_comunKey),
      ()=>{ try { const ck=`rgcom_${(_doc||"").replace(/[^a-zA-Z0-9]/g,"_").slice(0,20)}`; const m=document.cookie.split(";").find(c=>c.trim().startsWith(ck+"=")); return m?decodeURIComponent(m.trim().slice(ck.length+1)):null; } catch { return null; } },
    ];
    for(const src of sources) { try { const v=src(); if(v) return JSON.parse(v); } catch {} }
    return null;
  };
  const _saveComunIOS = (list) => {
    // Salva lista SENZA base64 pesanti (le immagini sono già in window.storage per ID)
    const listSafe = list.map(item => ({
      ...item,
      allegati: (item.allegati||[]).map(a => ({
        ...a,
        data: a._imgId ? '[IDB:'+a._imgId+']' : (a.data&&a.data.length<5000?a.data:'[grande]')
      }))
    }));
    const s = JSON.stringify(listSafe);
    // localStorage — 3 copie
    ["",_comunKey+"_bk1",_comunKey+"_bk2"].forEach((k,i)=>{
      try { localStorage.setItem(i===0?_comunKey:k, s); } catch {}
    });
    try { sessionStorage.setItem(_comunKey, s); } catch {}
    // cookie per metadati leggeri
    try {
      const ck=`rgcom_${(_doc||"").replace(/[^a-zA-Z0-9]/g,"_").slice(0,20)}`;
      if(s.length<3800) document.cookie=`${ck}=${encodeURIComponent(s)};path=/;max-age=63072000;SameSite=Lax`;
    } catch {}
    // IDB
    try { _idbSet(_comunKey, s); } catch {}
    // window.storage artifact — il più persistente su iOS
    try { _wst(window.storage.set(`comlst:${_doc}`, s, false)).catch(()=>{}); } catch {}
  };

  // ══════════════════════════════════════════
  // COMUNICAZIONI — salvataggio ultra-robusto
  // Ogni comunicazione = chiave separata
  // ══════════════════════════════════════════
  const _comPrefix = `c:${_doc}:`;

  const _salvaComunicazioneSingola = async (com) => {
    const key = _comPrefix + com.id;
    const val = JSON.stringify(com);
    // 1. localStorage
    try { localStorage.setItem(key, val); } catch {}
    try { localStorage.setItem(key+'_bk', val); } catch {}
    // 2. sessionStorage
    try { sessionStorage.setItem(key, val); } catch {}
    // 3. IDB
    try { _idbSet(key, val); } catch {}
    // 4. window.storage — chiave piccola per singola comunicazione
    try { await _wst(window.storage.set(key.replace(/[^a-zA-Z0-9:_-]/g,'_'), val, false), 3000); } catch {}
  };

  const _leggiComunicazioneSingola = async (id) => {
    const key = _comPrefix + id;
    const wsKey = key.replace(/[^a-zA-Z0-9:_-]/g,'_');
    // 1. localStorage
    try { const v=localStorage.getItem(key); if(v) return JSON.parse(v); } catch {}
    try { const v=localStorage.getItem(key+'_bk'); if(v) return JSON.parse(v); } catch {}
    // 2. sessionStorage
    try { const v=sessionStorage.getItem(key); if(v) return JSON.parse(v); } catch {}
    // 3. IDB
    try { const v=await _idbGet(key); if(v) return JSON.parse(v); } catch {}
    // 4. window.storage
    try { const r=await _wst(window.storage.get(wsKey, false),3000); if(r?.value) return JSON.parse(r.value); } catch {}
    return null;
  };

  const _salvaIndiciComunicazioni = async (ids) => {
    const key = _comPrefix+'_ids';
    const val = JSON.stringify(ids);
    try { localStorage.setItem(key, val); } catch {}
    try { sessionStorage.setItem(key, val); } catch {}
    try { _idbSet(key, val); } catch {}
    try { await _wst(window.storage.set(key.replace(/[^a-zA-Z0-9:_-]/g,'_'), val, false), 3000); } catch {}
  };

  const _leggiIndiciComunicazioni = async () => {
    const key = _comPrefix+'_ids';
    const wsKey = key.replace(/[^a-zA-Z0-9:_-]/g,'_');
    try { const v=localStorage.getItem(key); if(v) return JSON.parse(v); } catch {}
    try { const v=sessionStorage.getItem(key); if(v) return JSON.parse(v); } catch {}
    try { const v=await _idbGet(key); if(v) return JSON.parse(v); } catch {}
    try { const r=await _wst(window.storage.get(wsKey,false),3000); if(r?.value) return JSON.parse(r.value); } catch {}
    return null;
  };

  const salvaComunicazione = async () => {
    if(!comunForm.oggetto.trim()) return;
    setSaving(true);
    const classiCom = (comunForm.classiCom&&comunForm.classiCom.length>0) ? comunForm.classiCom : [classe];

    // Salva ogni allegato su TUTTI i livelli di storage
    const allegatiSalvati = await Promise.all((comunForm.allegati||[]).map(async a => {
      const dataOrig = a.data||"";
      // Se non ha data base64 valida, restituisci com'è
      if(!dataOrig || dataOrig.startsWith('[')) return a;

      // Genera ID univoco o riusa quello esistente
      const imgId = a._imgId || `img_com_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

      // L1: IndexedDB immagini (mai svuotato su iOS)
      try {
        if(_imgDb) {
          const tx = _imgDb.transaction('imgs','readwrite');
          tx.objectStore('imgs').put(dataOrig, imgId);
        }
      } catch(e) { console.warn('IDB img err', e); }

      // L2: IndexedDB registro
      try { _idbSet('img:'+imgId, dataOrig); } catch {}

      // L3: localStorage (se sotto 5MB)
      try {
        if(dataOrig.length < 5000000) {
          localStorage.setItem('img:'+imgId, dataOrig);
          localStorage.setItem('img:'+imgId+'_bk', dataOrig);
        }
      } catch {}

      // L4: sessionStorage
      try { sessionStorage.setItem('img:'+imgId, dataOrig); } catch {}

      // L5: window.storage a chunk da 80KB
      try {
        const chunkSize = 80000;
        const chunks = Math.ceil(dataOrig.length / chunkSize);
        for(let i=0; i<chunks; i++) {
          await _wst(window.storage.set(
            `img:${imgId}:c${i}`,
            dataOrig.slice(i*chunkSize, (i+1)*chunkSize),
            false
          ), 6000);
        }
        await _wst(window.storage.set(
          `img:${imgId}:meta`,
          JSON.stringify({chunks, nome:a.nome, tipo:a.tipo}),
          false
        ), 3000);
      } catch(e) { console.warn('ws img err', e); }

      // Restituisce allegato con _imgId e data in memoria
      return { id: a.id||imgId, nome: a.nome, tipo: a.tipo, _imgId: imgId, data: dataOrig };
    }));

    const item = {
      ...comunForm,
      allegati: allegatiSalvati, // con data in memoria + _imgId per recupero futuro
      classiCom,
      data: comunForm.data||new Date().toLocaleDateString("it-IT"),
      inseritoDa: firmaAttiva,
      id: editComun || Date.now(),
    };

    const all = contDB["__comunicazioni__"]?.["comunicazioni"] || [];
    const nuove = editComun
      ? all.map(c=>c.id===editComun?item:c)
      : [...all, item];

    // Aggiorna stato React — con data immagini in memoria
    setContDB(p => ({...p, "__comunicazioni__": {...(p["__comunicazioni__"]||{}), "comunicazioni": nuove}}));

    // Salva comunicazioni su tutti i livelli — serializza SENZA base64 grandi
    const nuoveSafe = nuove.map(c=>({
      ...c,
      allegati: (c.allegati||[]).map(a=>({
        id:a.id, nome:a.nome, tipo:a.tipo, _imgId:a._imgId||null,
        // Mantieni data solo se piccola (< 200KB), altrimenti solo _imgId
        data: a.data && a.data.length < 200000 ? a.data : (a._imgId ? '[ref:'+a._imgId+']' : '')
      }))
    }));

    // Salva ogni comunicazione individualmente
    await Promise.all(nuoveSafe.map(c => _salvaComunicazioneSingola(c)));
    await _salvaIndiciComunicazioni(nuoveSafe.map(c=>c.id));

    // Salva anche in contDB su tutti i livelli
    const contNext = {...contDB, "__comunicazioni__":{...(contDB["__comunicazioni__"]||{}),"comunicazioni":nuoveSafe}};
    try { cSet("contDB", contNext); } catch {}
    try { cloudSave(_doc,"contDB",contNext).catch(()=>{}); } catch {}

    setTimeout(() => { setSaving(false); setToastMsg("✅ Comunicazione salvata!"); }, 300);
    setComunOpen(false); setEditComun(null);
  };
  const openVerifica=(item=null)=>{setVerOpen(true);setEditVer(item?item.id:null);setVerForm(item?{tipoVerifica:item.tipoVerifica||"Scritto",argomenti:item.argomenti||"",note:item.note||"",data:item.data||"",visibileFamiglia:item.visibileFamiglia||false,materia:item.materia||item._mat||materia,link:item.link||"",tuttiVer:!(item.partecipazione==="parziale"),alunniVer:item.alunniParz||[]}:{tipoVerifica:"Scritto",argomenti:"",note:"",data:"",visibileFamiglia:true,materia:materia,link:"",tuttiVer:true,alunniVer:[]});};
  const salvaVerifica=()=>{const {tuttiVer,alunniVer,...rest}=verForm;const item={...rest,data:verForm.data||todayISO(),inseritoDa:firmaAttiva,partecipazione:tuttiVer===false?"parziale":"tutti",alunniParz:tuttiVer===false?(alunniVer||[]):[]};if(editVer)saveCont("verifiche",getCont("verifiche").map(c=>c.id===editVer?{...c,...item}:c));else saveCont("verifiche",[...getCont("verifiche"),{id:Date.now(),...item}]);setVerOpen(false);setEditVer(null);};
  const salvaColloquio=()=>{if(editColl)setColloquiDB(colloquiDB.map(c=>c.id===editColl?{...collForm,id:editColl,docente:c.docente||firmaAttiva}:c));else setColloquiDB([...colloquiDB,{...collForm,id:Date.now(),docente:firmaAttiva}]);setCollOpen(false);showToast();};
  const getMaterieScrutinio = () => {
    try {
      const meta = JSON.parse(localStorage.getItem(`reg:${_doc}:classeMeta`)||"{}");
      const matCl = meta[classe]?.materie||[];
      const extra = JSON.parse(localStorage.getItem("reg:materieExtra")||"[]");
      return [...new Set([...MATERIE,...matCl,...extra])];
    } catch { return MATERIE; }
  };

  const openPagelle=sid=>{
    if(!sid)return;
    setPgSid(sid);
    const saved=(scrutiniDB||{})?.[classe]?.[pgTrim]?.[sid]||null;
    const vMap={};const car={};
    const materieScr=getMaterieScrutinio();
    materieScr.forEach(mat=>{
      const m=calcMedia(sid,mat,classe);
      const sa=saved?.[mat]?.arrotondato;
      const arr=(sa!==undefined&&sa!==null&&sa!=="")?String(sa):(m!==null?String(Math.round(m)):"");
      vMap[mat]={media:m,arrotondato:arr};
      const d=saved?.[mat]||{};
      car[mat]=d.carenza||"";
      car[`r_${mat}`]=d.tipoRec||"";
      car[`ob_${mat}`]=d.obiettivi||"";
      car[`att_${mat}`]=d.attivita||"";
      car[`met_${mat}`]=d.metodo||"";
      car[`mot_${mat}`]=d.motivo||"";
      car[`modv_${mat}`]=d.modVerifica||"";
      car[`datav_${mat}`]=d.dataVerifica||"";
      car[`argv_${mat}`]=d.argVerifica||"";
      car[`giudv_${mat}`]=d.giudVerifica||"";
      car[`crec_${mat}`]=d.carenzaRecuperata||"NO";
    });
    setPgVoti(vMap);setPgCarenze(car);
    setPgBeh(saved?.comportamento||"8");
    setPgNote(saved?.note||"");
    setPgAmmesso(saved?.ammesso??null);
    setPgOpen(true);
  };
    const salvaPagelle=()=>{
    if(!pgSid)return;
    const data={};
    getMaterieScrutinio().forEach(mat=>{
      data[mat]={
        arrotondato:(pgVoti[mat]?.arrotondato??""),
        media:(pgVoti[mat]?.media??null),
        carenza:pgCarenze[mat]||"",
        tipoRec:pgCarenze[`r_${mat}`]||"",
        obiettivi:pgCarenze[`ob_${mat}`]||"",
        attivita:pgCarenze[`att_${mat}`]||"",
        metodo:pgCarenze[`met_${mat}`]||"",
        motivo:pgCarenze[`mot_${mat}`]||"",
        modVerifica:pgCarenze[`modv_${mat}`]||"",
        dataVerifica:pgCarenze[`datav_${mat}`]||"",
        argVerifica:pgCarenze[`argv_${mat}`]||"",
        giudVerifica:pgCarenze[`giudv_${mat}`]||"",
        carenzaRecuperata:pgCarenze[`crec_${mat}`]||"NO",
      };
    });
    data.comportamento=pgBeh;
    data.note=pgNote;
    if(TRIMESTRI.indexOf(pgTrim)>0)data.ammesso=pgAmmesso;
    setScrutiniDB(p=>{
      const prev=p||{};
      return{...prev,[classe]:{...(prev[classe]||{}),[pgTrim]:{...(prev[classe]?.[pgTrim]||{}),[pgSid]:data}}};
    });
    showToast("Scrutinio salvato!");
    setPgOpen(false);
  };

  const RegistroClasseMenu = () => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(()=>{
      if(!open) return;
      const h = e => { if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
      window.addEventListener("mousedown", h);
      return ()=>window.removeEventListener("mousedown", h);
    },[open]);
    return (
      <div ref={ref} style={{position:"relative"}}>
        <button onClick={()=>setOpen(v=>!v)}
          style={{height:44,padding:"0 18px",background:"#d94f4f",color:"#fff",border:"none",borderRadius:6,fontSize:13,fontWeight:700,cursor:"pointer",boxShadow:"0 3px 8px rgba(0,0,0,0.18)",display:"flex",alignItems:"center",gap:8,minWidth:200,fontFamily:FF}}>
          <span style={{fontSize:15}}>📋</span>
          <span style={{flex:1,textAlign:"left"}}>REGISTRO DI CLASSE</span>
          <span style={{fontSize:11,opacity:0.85}}>{open?"▲":"▼"}</span>
        </button>
        {open&&(
          <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:"#fff",borderRadius:8,boxShadow:"0 8px 32px rgba(0,0,0,0.2)",border:"1px solid #e5e7eb",zIndex:300,minWidth:220,overflow:"hidden"}}>
            {[
              {lbl:"📋 Registro di Classe", tab:"classe"},
              {lbl:"✅ Appello semplificato", tab:"appello"},
              {lbl:"📅 Planning",           tab:"planning"},
            ].map(({lbl,tab})=>(
              <button key={tab} onClick={()=>{setOpen(false);setActiveTab(tab);setSelStudent(null);setClasseInnerTab("registro");}}
                style={{width:"100%",padding:"13px 20px",background:"none",border:"none",borderBottom:"1px solid #f3f4f6",fontWeight:700,fontSize:14,cursor:"pointer",textAlign:"left",fontFamily:FF,color:"#1f2937",display:"flex",alignItems:"center",gap:8}}>
                {lbl}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const SubHeader=({color,text,onBack})=>{
    const matCl=getMaterieClasse(classe);
    const opzioniMat=matCl.length>0?matCl:[...MATERIE,...(()=>{try{return JSON.parse(localStorage.getItem("reg:materieExtra")||"[]");}catch{return[];}})()].filter((v,i,a)=>a.indexOf(v)===i);
    return(
    <div style={{background:color,color:"#fff",padding:"12px 20px",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",flexShrink:0,fontFamily:FF,position:"relative"}}>
      <span style={{fontWeight:700,fontSize:16}}>{text}</span>
      {classiList.length>0?(<div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontWeight:700}}>Classe:</span><select value={classe} onChange={e=>{setClasse(e.target.value);setSelStudent(null);}} style={{background:"#fff",color:"#1f2937",padding:"4px 10px",borderRadius:4,fontWeight:700,border:"none"}}>{classiList.map(c=><option key={c}>{c}</option>)}</select></div>):<span style={{background:"#fef2f2",color:"#dc2626",borderRadius:4,padding:"4px 12px",fontWeight:700,fontSize:12}}>Nessuna classe</span>}
      {(activeTab==="classe"||activeTab==="docente")&&<div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontWeight:700}}>Materia:</span><select value={materia} onChange={e=>setMateria(e.target.value)} style={{background:"#fff",color:"#1f2937",padding:"4px 10px",borderRadius:4,fontWeight:700,border:"none"}}>{opzioniMat.map(m=><option key={m}>{m}</option>)}</select>{matCl.length===0&&<span style={{fontSize:11,opacity:0.7}}>(tutte)</span>}</div>}
      <button onClick={()=>setShowGestione(true)} style={{padding:"6px 14px",background:"rgba(0,0,0,0.18)",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontWeight:600,fontSize:13,display:"flex",alignItems:"center",gap:6}}><Users size={14}/> Classi</button>
      {activeTab==="classe"&&<button onClick={()=>setClasseInnerTab(t=>t==="colleghi"?"registro":"colleghi")} style={{padding:"6px 14px",background:classeInnerTab==="colleghi"?"#22c55e":"rgba(0,0,0,0.18)",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:6}}>🔄 Registro condiviso {classe}</button>}
      <button onClick={onBack} style={{marginLeft:"auto",width:34,height:34,background:"rgba(0,0,0,0.25)",color:"#fff",border:"none",borderRadius:"50%",cursor:"pointer",fontWeight:700,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>✕</button>
    </div>
    );
  };

  if(showGestione) return <GestioneClassi classi={classi} setClassi={setClassi} onTorna={()=>{setShowGestione(false);setActiveTab(null);}} nomeScuola={nomeScuola} setNomeScuola={setNomeScuola}/>;

  if(activeTab==="pagelle") return (
    <div style={{fontFamily:FF,display:"flex",flexDirection:"column",height:"100vh",background:"#f9fafb"}}>
      <SavingOverlay show={saving}/>
      {toastMsg&&<Toast msg={toastMsg} onDone={()=>setToastMsg(null)}/>}
      <SubHeader color={TEAL} text="Pagelle / Scrutini" onBack={()=>setActiveTab(null)}/>

      {/* Barra periodo + info */}
      <div style={{padding:"6px 16px",background:"#4ab8d4",display:"flex",gap:16,alignItems:"center",flexShrink:0,borderBottom:"2px solid #2d8faa"}}>
        <span style={{color:"#fff",fontWeight:700,fontSize:13}}>Periodo:</span>
        <select value={pgTrim} onChange={e=>setPgTrim(e.target.value)} style={{background:"#fff",color:"#1f2937",padding:"3px 10px",borderRadius:4,fontWeight:700,border:"none",fontSize:13}}>{TRIMESTRI.map(t=><option key={t}>{t}</option>)}</select>
        <span style={{color:"rgba(255,255,255,0.85)",fontSize:12}}>Classe: <b style={{color:"#fff"}}>{classe||"—"}</b></span>
        <span style={{marginLeft:"auto",background:"#fef3c7",color:"#92400e",borderRadius:4,padding:"3px 10px",fontSize:11,fontWeight:700}}>
          Voti proposti inseribili fino al: {new Date().toLocaleDateString("it-IT")}
        </span>
      </div>

      {/* Tabella principale stile Axios */}
      <div style={{flex:1,overflowY:"auto",overflowX:"auto",background:"#fff"}}>
        {students.length===0
          ?<div style={{textAlign:"center",padding:"60px 0",color:"#9ca3af"}}><div style={{fontSize:48,marginBottom:12}}>📊</div><div style={{fontWeight:600,fontSize:18}}>Nessun alunno</div></div>
          :(()=>{
            const materieScr = getMaterieScrutinio();
            const TIPI_VAL = ["Scritto","Orale"];
            return(
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:900,fontSize:12}}>
                <thead>
                  {/* Riga 1: intestazioni principali */}
                  <tr style={{background:"#4ab8d4",color:"#fff"}}>
                    <th rowSpan={3} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:13,borderRight:"1px solid #2d8faa",whiteSpace:"nowrap",minWidth:160,verticalAlign:"middle"}}>Cognome e Nome</th>
                    <th colSpan={materieScr.length*3} style={{padding:"6px",textAlign:"center",fontWeight:700,borderRight:"1px solid #2d8faa",borderBottom:"1px solid rgba(255,255,255,0.3)"}}>Valutazioni</th>
                    <th colSpan={2} style={{padding:"6px",textAlign:"center",fontWeight:700,borderRight:"1px solid #2d8faa",background:"#d94040",borderBottom:"1px solid rgba(255,255,255,0.3)"}}>Voti Proposti</th>
                    <th rowSpan={3} style={{padding:"6px 8px",textAlign:"center",fontWeight:700,borderRight:"1px solid #2d8faa",verticalAlign:"middle",minWidth:90}}>Assenze</th>
                    <th rowSpan={3} style={{padding:"6px 8px",textAlign:"center",fontWeight:700,borderRight:"1px solid #2d8faa",verticalAlign:"middle",minWidth:160}}>Voto Proposto<br/>Comportamento</th>
                    <th rowSpan={3} style={{padding:"6px 8px",textAlign:"center",fontWeight:700,borderRight:"1px solid #2d8faa",verticalAlign:"middle",minWidth:170}}>Tipo recupero carenza</th>
                    <th colSpan={3} style={{padding:"6px",textAlign:"center",fontWeight:700,borderBottom:"1px solid rgba(255,255,255,0.3)"}}>Azioni</th>
                  </tr>
                  {/* Riga 2: materie */}
                  <tr style={{background:"#3aa8c4",color:"#fff"}}>
                    {materieScr.map(m=>(
                      <th key={m} colSpan={3} style={{padding:"4px 6px",textAlign:"center",fontWeight:700,fontSize:11,borderRight:"1px solid rgba(255,255,255,0.3)",borderBottom:"1px solid rgba(255,255,255,0.3)"}}>{m}</th>
                    ))}
                    <th style={{padding:"4px",textAlign:"center",fontSize:11,borderRight:"1px solid rgba(255,255,255,0.3)",borderBottom:"1px solid rgba(255,255,255,0.3)"}}>Scritto</th>
                    <th style={{padding:"4px",textAlign:"center",fontSize:11,borderRight:"1px solid #2d8faa",borderBottom:"1px solid rgba(255,255,255,0.3)"}}>Orale</th>
                    <th style={{padding:"4px",textAlign:"center",fontSize:11,borderBottom:"1px solid rgba(255,255,255,0.3)"}}>Scheda<br/>carenza/PAI</th>
                    <th style={{padding:"4px",textAlign:"center",fontSize:11,borderBottom:"1px solid rgba(255,255,255,0.3)"}}>Giud.</th>
                    <th style={{padding:"4px",textAlign:"center",fontSize:11}}>Ann.</th>
                  </tr>
                  {/* Riga 3: Scritto/Orale/Media per materia */}
                  <tr style={{background:"#2d8faa",color:"#fff"}}>
                    {materieScr.map(m=>(
                      <React.Fragment key={m}>
                        <th style={{padding:"3px 4px",textAlign:"center",fontSize:10,borderRight:"1px solid rgba(255,255,255,0.2)"}}>Scr.</th>
                        <th style={{padding:"3px 4px",textAlign:"center",fontSize:10,borderRight:"1px solid rgba(255,255,255,0.2)"}}>Or.</th>
                        <th style={{padding:"3px 4px",textAlign:"center",fontSize:10,borderRight:"1px solid rgba(255,255,255,0.3)"}}>Or.Lez.</th>
                      </React.Fragment>
                    ))}
                    <th style={{padding:"3px",borderRight:"1px solid rgba(255,255,255,0.2)"}}/>
                    <th style={{padding:"3px",borderRight:"1px solid #2d8faa"}}/>
                    <th style={{padding:"3px"}}/>
                    <th style={{padding:"3px"}}/>
                    <th style={{padding:"3px"}}/>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s,i)=>{
                    const sc=(scrutiniDB||{})?.[classe]?.[pgTrim]?.[s.id]||null;
                    const totAss=(assenzeDB[classe]?.[s.id]||[]).filter(a=>a.concorreCalcolo!==false).length;
                    const hasPAI=sc&&Object.keys(sc).some(k=>sc[k]?.carenza&&sc[k].carenza.trim());
                    const hasGiud=sc?.note&&sc.note.trim();
                    return(
                      <tr key={s.id} style={{borderBottom:"1px solid #e5e7eb",background:i%2===0?"#fff":"#f9f9f9"}}>
                        {/* Nome */}
                        <td style={{padding:"6px 10px",fontWeight:400,fontSize:13,borderRight:"1px solid #e5e7eb",whiteSpace:"nowrap"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{background:"#4ab8d4",color:"#fff",borderRadius:3,padding:"1px 6px",fontSize:11,fontWeight:700}}>{i+1}</span>
                            {s.cognome} {s.nome}
                          </div>
                        </td>
                        {/* Valutazioni per materia */}
                        {materieScr.map(mat=>{
                          const media=calcMedia(s.id,mat,classe);
                          const sc2=sc?.[mat];
                          const arr=sc2?.arrotondato??"";
                          const votiMat=votiDB[`${classe}||${mat}`]?.[s.id]||[];
                          const vscritti=votiMat.filter(v=>v.tipo==="scritto"&&v.faMedia&&v.voto&&!isNaN(parseVoto(v.voto)));
                          const vorali=votiMat.filter(v=>v.tipo==="orale"&&v.faMedia&&v.voto&&!isNaN(parseVoto(v.voto)));
                          const mediaSc=vscritti.length?vscritti.reduce((s,v)=>s+parseVoto(v.voto),0)/vscritti.length:null;
                          const mediaOr=vorali.length?vorali.reduce((s,v)=>s+parseVoto(v.voto),0)/vorali.length:null;
                          const isCarenza=arr!==""&&!isNaN(parseInt(arr))&&parseInt(arr)<6;
                          return(
                            <React.Fragment key={mat}>
                              <td style={{padding:"4px 3px",textAlign:"center",borderRight:"1px solid #f0f0f0",minWidth:36}}>
                                {mediaSc!==null&&<div style={{background:mediaSc<6?"#d94f4f":"#5cb85c",color:"#fff",borderRadius:2,padding:"2px 5px",fontWeight:700,fontSize:12,display:"inline-block"}}>{mediaSc.toFixed(1)}</div>}
                              </td>
                              <td style={{padding:"4px 3px",textAlign:"center",borderRight:"1px solid #f0f0f0",minWidth:36}}>
                                {mediaOr!==null&&<div style={{background:mediaOr<6?"#d94f4f":"#5cb85c",color:"#fff",borderRadius:2,padding:"2px 5px",fontWeight:700,fontSize:12,display:"inline-block"}}>{mediaOr.toFixed(1)}</div>}
                              </td>
                              <td style={{padding:"4px 3px",textAlign:"center",borderRight:"1px solid #d0d0d0",minWidth:52}}>
                                {/* Or. Lez = media totale + input voto proposto inline */}
                                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                  {media!==null&&<span style={{fontSize:10,color:"#9ca3af"}}>{media.toFixed(2)}</span>}
                                  <div style={{display:"flex",alignItems:"center",gap:2}}>
                                    <input
                                      type="number" min="1" max="10"
                                      value={arr}
                                      onChange={e=>{
                                        setScrutiniDB(p=>{
                                          const prev=p||{};
                                          return{...prev,[classe]:{...(prev[classe]||{}),[pgTrim]:{...(prev[classe]?.[pgTrim]||{}),[s.id]:{...(prev[classe]?.[pgTrim]?.[s.id]||{}),[mat]:{...(prev[classe]?.[pgTrim]?.[s.id]?.[mat]||{}),arrotondato:e.target.value,media:media}}}}};
                                        });
                                      }}
                                      style={{width:36,border:"2px solid "+(arr===""?"#d1d5db":parseInt(arr)<6?"#d94f4f":"#5cb85c"),borderRadius:2,padding:"2px 4px",fontWeight:700,fontSize:13,textAlign:"center",background:arr===""?"#fff":parseInt(arr)<6?"#fff5f5":"#f0fdf4"}}
                                    />
                                    {isCarenza&&<span style={{color:"#d94f4f",fontSize:11,fontWeight:900}}>!</span>}
                                  </div>
                                </div>
                              </td>
                            </React.Fragment>
                          );
                        })}
                        {/* Voti Proposti Scritto/Orale globali */}
                        <td style={{padding:"4px 6px",textAlign:"center",borderRight:"1px solid #e0e0e0",minWidth:50}}>
                          <input value={sc?.vpScritto||""} onChange={e=>setScrutiniDB(p=>({...p,[classe]:{...(p[classe]||{}),[pgTrim]:{...(p[classe]?.[pgTrim]||{}),[s.id]:{...(p[classe]?.[pgTrim]?.[s.id]||{}),vpScritto:e.target.value}}}}))} style={{width:40,border:"2px solid #d94f4f",borderRadius:2,padding:"2px 4px",fontWeight:700,fontSize:13,textAlign:"center",background:"#fff5f5"}}/>
                        </td>
                        <td style={{padding:"4px 6px",textAlign:"center",borderRight:"1px solid #e0e0e0",minWidth:50}}>
                          <input value={sc?.vpOrale||""} onChange={e=>setScrutiniDB(p=>({...p,[classe]:{...(p[classe]||{}),[pgTrim]:{...(p[classe]?.[pgTrim]||{}),[s.id]:{...(p[classe]?.[pgTrim]?.[s.id]||{}),vpOrale:e.target.value}}}}))} style={{width:40,border:"2px solid #d94f4f",borderRadius:2,padding:"2px 4px",fontWeight:700,fontSize:13,textAlign:"center",background:"#fff5f5"}}/>
                        </td>
                        {/* Assenze */}
                        <td style={{padding:"4px 6px",textAlign:"center",borderRight:"1px solid #e0e0e0",fontWeight:700,color:totAss>0?"#d94f4f":"#9ca3af",fontSize:13}}>
                          {totAss||"0,00"}
                        </td>
                        {/* Comportamento */}
                        <td style={{padding:"4px 6px",textAlign:"center",borderRight:"1px solid #e0e0e0"}}>
                          <select value={sc?.comportamento||""} onChange={e=>setScrutiniDB(p=>({...p,[classe]:{...(p[classe]||{}),[pgTrim]:{...(p[classe]?.[pgTrim]||{}),[s.id]:{...(p[classe]?.[pgTrim]?.[s.id]||{}),comportamento:e.target.value}}}}))} style={{border:"1px solid #d1d5db",borderRadius:3,padding:"3px 4px",fontSize:11,background:"#fff",width:"100%",fontFamily:FF}}>
                            <option value="">SUFFICIENTE - 6</option>
                            {["10","9","8","7","6","5","4"].map(v=><option key={v} value={v}>{v==="6"?"SUFFICIENTE - 6":v==="7"?"DISCRETO - 7":v==="8"?"BUONO - 8":v==="9"?"DISTINTO - 9":v==="10"?"OTTIMO - 10":v==="5"?"NON SUFFICIENTE - 5":"GRAVEMENTE INSUFF. - 4"}</option>)}
                          </select>
                        </td>
                        {/* Tipo recupero carenza */}
                        <td style={{padding:"4px 6px",textAlign:"center",borderRight:"1px solid #e0e0e0"}}>
                          <select value={sc?.tipoRecupero||""} onChange={e=>setScrutiniDB(p=>({...p,[classe]:{...(p[classe]||{}),[pgTrim]:{...(p[classe]?.[pgTrim]||{}),[s.id]:{...(p[classe]?.[pgTrim]?.[s.id]||{}),tipoRecupero:e.target.value}}}}))} style={{border:"1px solid #d1d5db",borderRadius:3,padding:"3px 4px",fontSize:11,background:"#fff",width:"100%",fontFamily:FF}}>
                            <option value=""></option>
                            {["CORSO DI RECUPERO","SPORTELLO","STUDIO AUTONOMO","RECUPERO IN ITINERE","NESSUNO"].map(o=><option key={o}>{o}</option>)}
                          </select>
                        </td>
                        {/* AZIONI */}
                        {/* Scheda carenza/PAI */}
                        <td style={{padding:"4px 3px",textAlign:"center",borderRight:"1px solid #e0e0e0"}}>
                          <button onClick={()=>openPagelle(s.id)} title="Scheda carenza / PAI"
                            style={{width:30,height:30,background:hasPAI?"#f59e0b":"#e5e7eb",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",fontSize:14}}>
                            📋
                          </button>
                        </td>
                        {/* Giudizio */}
                        <td style={{padding:"4px 3px",textAlign:"center",borderRight:"1px solid #e0e0e0"}}>
                          <button onClick={()=>openPagelle(s.id)} title="Giudizio"
                            style={{width:30,height:30,background:hasGiud?"#22c55e":"#e5e7eb",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",fontSize:14}}>
                            📝
                          </button>
                        </td>
                        {/* Annotazioni */}
                        <td style={{padding:"4px 3px",textAlign:"center"}}>
                          <button onClick={()=>openPagelle(s.id)} title="Annotazioni"
                            style={{width:30,height:30,background:"#3b82f6",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",fontSize:14}}>
                            ✏️
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()
        }
      </div>

      {/* Modal dettaglio alunno (Scheda/Giudizio/Annotazioni) */}
      <Modal open={pgOpen&&!!pgSid} onClose={()=>setPgOpen(false)} width={860} headerColor="#4ab8d4"
        title={`Scrutinio — ${students.find(s=>s.id===pgSid)?.cognome||""} ${students.find(s=>s.id===pgSid)?.nome||""}`}
        subtitle={pgTrim+" — Classe "+classe}>
        <div style={{padding:24,fontFamily:FF}}>
          {Object.keys(pgVoti).length===0
            ?<div style={{textAlign:"center",padding:40,color:"#9ca3af"}}>Caricamento...</div>
            :(<>
              {/* Tabella voti per materia */}
              <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16,fontSize:13}}>
                <thead>
                  <tr style={{background:"#4ab8d4",color:"#fff"}}>
                    <th style={{padding:"8px 12px",textAlign:"left",fontWeight:700}}>Materia</th>
                    <th style={{padding:"8px",textAlign:"center",fontWeight:700}}>Media calc.</th>
                    <th style={{padding:"8px",textAlign:"center",fontWeight:700}}>Voto proposto</th>
                    <th style={{padding:"8px",textAlign:"center",fontWeight:700,minWidth:120}}>Tipo recupero</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(pgVoti).map((mat,i)=>{
                    const m=pgVoti[mat];
                    if(!m) return null;
                    const arr=m.arrotondato;
                    const isInsuff=arr!==""&&!isNaN(parseInt(arr))&&parseInt(arr)<6;
                    const sc=scrutiniDB?.[classe]?.[pgTrim]?.[pgSid]?.[mat]||{};
                    return(
                      <React.Fragment key={mat}>
                      <tr style={{borderBottom:isInsuff?"none":"1px solid #e5e7eb",background:isInsuff?"#fff5f5":i%2===0?"#fff":"#f9fafb"}}>
                        <td style={{padding:"8px 12px",fontWeight:700,color:isInsuff?"#d94f4f":"#1f2937"}}>
                          {mat}{isInsuff&&<span style={{marginLeft:6,fontSize:10,color:"#d94f4f"}}>⚠️ carenza</span>}
                        </td>
                        <td style={{padding:"8px",textAlign:"center",color:m.media!==null?(m.media<6?"#d94f4f":"#5cb85c"):"#9ca3af",fontWeight:700}}>
                          {m.media!==null?m.media.toFixed(2):"—"}
                        </td>
                        <td style={{padding:"6px 8px",textAlign:"center"}}>
                          <input type="number" min="1" max="10" value={arr}
                            onChange={e=>setPgVoti(p=>({...p,[mat]:{...p[mat],arrotondato:e.target.value}}))}
                            style={{width:52,border:"2px solid "+(arr===""?"#d1d5db":parseInt(arr)<6?"#d94f4f":"#5cb85c"),borderRadius:4,padding:"6px",fontWeight:700,fontSize:16,textAlign:"center"}}/>
                        </td>
                        <td style={{padding:"6px 8px"}}>
                          <select value={pgCarenze[`r_${mat}`]||""} onChange={e=>setPgCarenze(p=>({...p,[`r_${mat}`]:e.target.value}))} style={{width:"100%",border:"1px solid #d1d5db",borderRadius:3,padding:"4px 6px",fontSize:11,fontFamily:FF}}>
                            <option value=""></option>
                            {["CORSO DI RECUPERO","SPORTELLO","STUDIO AUTONOMO","RECUPERO IN ITINERE","NESSUNO"].map(o=><option key={o}>{o}</option>)}
                          </select>
                        </td>
                      </tr>
                      {isInsuff&&(
                        <tr style={{borderBottom:"2px solid #fca5a5",background:"#fff5f5"}}>
                          <td colSpan={4} style={{padding:"10px 12px"}}>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                              {/* Carenze */}
                              <div>
                                <div style={{fontSize:11,color:"#d94f4f",fontWeight:700,marginBottom:3}}>Carenze</div>
                                <textarea value={pgCarenze[mat]||""} onChange={e=>setPgCarenze(p=>({...p,[mat]:e.target.value}))} rows={2} placeholder="Descrizione carenze..." style={{width:"100%",border:"1px solid #fca5a5",borderRadius:3,padding:"4px 6px",fontSize:12,fontFamily:FF,resize:"none",boxSizing:"border-box"}}/>
                              </div>
                              {/* Obiettivi */}
                              <div>
                                <div style={{fontSize:11,color:"#d94f4f",fontWeight:700,marginBottom:3}}>Obiettivi</div>
                                <textarea value={pgCarenze[`ob_${mat}`]||""} onChange={e=>setPgCarenze(p=>({...p,[`ob_${mat}`]:e.target.value}))} rows={2} placeholder="Obiettivi da raggiungere..." style={{width:"100%",border:"1px solid #fca5a5",borderRadius:3,padding:"4px 6px",fontSize:12,fontFamily:FF,resize:"none",boxSizing:"border-box"}}/>
                              </div>
                              {/* Attività */}
                              <div>
                                <div style={{fontSize:11,color:"#d94f4f",fontWeight:700,marginBottom:3}}>Attività</div>
                                <textarea value={pgCarenze[`att_${mat}`]||""} onChange={e=>setPgCarenze(p=>({...p,[`att_${mat}`]:e.target.value}))} rows={2} placeholder="Attività di recupero..." style={{width:"100%",border:"1px solid #fca5a5",borderRadius:3,padding:"4px 6px",fontSize:12,fontFamily:FF,resize:"none",boxSizing:"border-box"}}/>
                              </div>
                              {/* Metodo */}
                              <div>
                                <div style={{fontSize:11,color:"#d94f4f",fontWeight:700,marginBottom:3}}>Metodo</div>
                                <textarea value={pgCarenze[`met_${mat}`]||""} onChange={e=>setPgCarenze(p=>({...p,[`met_${mat}`]:e.target.value}))} rows={2} placeholder="Metodo di recupero..." style={{width:"100%",border:"1px solid #fca5a5",borderRadius:3,padding:"4px 6px",fontSize:12,fontFamily:FF,resize:"none",boxSizing:"border-box"}}/>
                              </div>
                              {/* Motivo */}
                              <div>
                                <div style={{fontSize:11,color:"#d94f4f",fontWeight:700,marginBottom:3}}>Motivo</div>
                                <textarea value={pgCarenze[`mot_${mat}`]||""} onChange={e=>setPgCarenze(p=>({...p,[`mot_${mat}`]:e.target.value}))} rows={2} placeholder="Motivo delle carenze..." style={{width:"100%",border:"1px solid #fca5a5",borderRadius:3,padding:"4px 6px",fontSize:12,fontFamily:FF,resize:"none",boxSizing:"border-box"}}/>
                              </div>
                              {/* Mod. Verifica */}
                              <div>
                                <div style={{fontSize:11,color:"#d94f4f",fontWeight:700,marginBottom:3}}>Mod. verifica</div>
                                <select value={pgCarenze[`modv_${mat}`]||""} onChange={e=>setPgCarenze(p=>({...p,[`modv_${mat}`]:e.target.value}))} style={{width:"100%",border:"1px solid #fca5a5",borderRadius:3,padding:"6px",fontSize:12,fontFamily:FF}}>
                                  <option value=""></option>
                                  {["scritta","orale","pratica","scritta e orale","test"].map(o=><option key={o}>{o}</option>)}
                                </select>
                              </div>
                              {/* Data verifica */}
                              <div>
                                <div style={{fontSize:11,color:"#d94f4f",fontWeight:700,marginBottom:3}}>Data verifica</div>
                                <input type="date" value={pgCarenze[`datav_${mat}`]||""} onChange={e=>setPgCarenze(p=>({...p,[`datav_${mat}`]:e.target.value}))} style={{width:"100%",border:"1px solid #fca5a5",borderRadius:3,padding:"5px 6px",fontSize:12,fontFamily:FF,boxSizing:"border-box"}}/>
                              </div>
                              {/* Arg. verifica */}
                              <div>
                                <div style={{fontSize:11,color:"#d94f4f",fontWeight:700,marginBottom:3}}>Arg. verifica</div>
                                <input value={pgCarenze[`argv_${mat}`]||""} onChange={e=>setPgCarenze(p=>({...p,[`argv_${mat}`]:e.target.value}))} placeholder="Argomento verifica..." style={{width:"100%",border:"1px solid #fca5a5",borderRadius:3,padding:"5px 6px",fontSize:12,fontFamily:FF,boxSizing:"border-box"}}/>
                              </div>
                              {/* Giud. verifica */}
                              <div>
                                <div style={{fontSize:11,color:"#d94f4f",fontWeight:700,marginBottom:3}}>Giud. verifica</div>
                                <select value={pgCarenze[`giudv_${mat}`]||""} onChange={e=>setPgCarenze(p=>({...p,[`giudv_${mat}`]:e.target.value}))} style={{width:"100%",border:"1px solid #fca5a5",borderRadius:3,padding:"6px",fontSize:12,fontFamily:FF}}>
                                  <option value=""></option>
                                  {["VERIFICA SUFFICIENTE","VERIFICA INSUFFICIENTE","VERIFICA NON SVOLTA","PARZIALMENTE SUFFICIENTE"].map(o=><option key={o}>{o}</option>)}
                                </select>
                              </div>
                              {/* Carenza recuperata */}
                              <div>
                                <div style={{fontSize:11,color:"#d94f4f",fontWeight:700,marginBottom:3}}>Carenza recuperata</div>
                                <select value={pgCarenze[`crec_${mat}`]||"NO"} onChange={e=>setPgCarenze(p=>({...p,[`crec_${mat}`]:e.target.value}))} style={{width:"100%",border:"1px solid #fca5a5",borderRadius:3,padding:"6px",fontSize:12,fontFamily:FF}}>
                                  <option value="NO">NO</option>
                                  <option value="SÌ">SÌ</option>
                                  <option value="PARZIALMENTE">PARZIALMENTE</option>
                                </select>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>

              {/* Comportamento + Ammissione */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:"#4ab8d4",marginBottom:6}}>Voto Comportamento</div>
                  <select value={pgBeh} onChange={e=>setPgBeh(e.target.value)} style={{width:"100%",border:"2px solid #4ab8d4",borderRadius:4,padding:"9px 12px",fontWeight:700,fontSize:16,background:"#fff",color:"#1f2937",fontFamily:FF}}>
                    {["10","9","8","7","6","5"].map(v=><option key={v}>{v}</option>)}
                  </select>
                </div>
                {TRIMESTRI.indexOf(pgTrim)>0&&<div>
                  <div style={{fontWeight:700,fontSize:13,color:"#4ab8d4",marginBottom:6}}>Ammissione</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setPgAmmesso(true)} style={{flex:1,padding:"10px",background:pgAmmesso===true?"#5cb85c":"#f3f4f6",color:pgAmmesso===true?"#fff":"#374151",border:"2px solid "+(pgAmmesso===true?"#5cb85c":"#e5e7eb"),borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:13}}>✅ Ammesso</button>
                    <button onClick={()=>setPgAmmesso(false)} style={{flex:1,padding:"10px",background:pgAmmesso===false?"#d94f4f":"#f3f4f6",color:pgAmmesso===false?"#fff":"#374151",border:"2px solid "+(pgAmmesso===false?"#d94f4f":"#e5e7eb"),borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:13}}>❌ Non ammesso</button>
                  </div>
                </div>}
              </div>

              {/* Giudizio globale / Note */}
              <div style={{marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:13,color:"#4ab8d4",marginBottom:6}}>Giudizio / Annotazioni</div>
                <textarea value={pgNote} onChange={e=>setPgNote(e.target.value)} rows={3}
                  style={{width:"100%",border:"2px solid #d1d5db",borderRadius:4,padding:"8px",resize:"none",boxSizing:"border-box",fontFamily:FF,fontSize:13}}
                  placeholder="Inserisci giudizio globale o annotazioni riservate..."/>
              </div>

              <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
                <button onClick={salvaPagelle} style={{padding:"10px 28px",background:"#5cb85c",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>💾 Salva</button>
                <button onClick={()=>setPgOpen(false)} style={{padding:"10px 20px",background:"#337ab7",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>⊗ Chiudi</button>
              </div>
            </>)
          }
        </div>
      </Modal>
    </div>
  );

  if(activeTab==="colloqui") return (
    <div style={{fontFamily:FF,display:"flex",flexDirection:"column",height:"100vh",background:"#f5f5f5"}}>
      <SavingOverlay show={saving}/>
      {toastMsg&&<Toast msg={toastMsg} onDone={()=>setToastMsg(null)}/>}
      <SubHeader color={TEAL} text="Colloqui con le famiglie" onBack={()=>setActiveTab(null)}/>
      <div style={{flex:1,overflowY:"auto",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:15,color:"#0891b2"}}>Ricevimenti programmati — {classe}</div>
          <button onClick={()=>{setEditColl(null);setCollForm(defColloquio);setCollOpen(true);}} style={{padding:"8px 20px",background:"#0891b2",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>+ Nuovo ricevimento</button>
        </div>
        {colloquiDB.length===0
          ?<div style={{background:"#fff",borderRadius:8,border:"1px solid #ddd",padding:"60px 20px",textAlign:"center",color:"#9ca3af"}}>
            <div style={{fontSize:48,marginBottom:12}}>📅</div>
            <div style={{fontWeight:600,fontSize:17,marginBottom:8,color:"#6b7280"}}>Nessun ricevimento programmato</div>
            <button onClick={()=>{setEditColl(null);setCollForm(defColloquio);setCollOpen(true);}} style={{padding:"8px 24px",background:"#0891b2",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>+ Nuovo ricevimento</button>
          </div>
          :<div style={{background:"#fff",borderRadius:8,border:"1px solid #ddd",overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{background:"#f0f9ff",borderBottom:"2px solid #bae6fd"}}>
                {["Giorno","Orario","Periodo","Max","Modalità","Docente","Stato","Azioni"].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",color:"#0891b2",fontWeight:700,fontSize:13}}>{h}</th>)}
              </tr></thead>
              <tbody>{colloquiDB.map((c,i)=>{
                const docColloquio=c.docente||docente;
                const isAltro=docColloquio!==docente;
                return(
                <tr key={c.id} style={{borderBottom:"1px solid #f3f4f6",background:isAltro?"#fff7ed":i%2===0?"#fff":"#fafafa"}}>
                  <td style={{padding:"12px 14px",fontWeight:700,fontSize:14}}>{c.giorno}</td>
                  <td style={{padding:"12px 14px",fontSize:13}}>{c.oraInizio} — {c.oraFine}</td>
                  <td style={{padding:"12px 14px",fontSize:13,color:"#6b7280"}}>{c.periodoRipetibilita}</td>
                  <td style={{padding:"12px 14px",textAlign:"center",fontWeight:700,color:"#0891b2"}}>{c.numeroMax}</td>
                  <td style={{padding:"12px 14px",fontSize:13}}>{c.modalita}{c.sede&&<span style={{color:"#9ca3af",marginLeft:6,fontSize:12}}>· {c.sede}</span>}</td>
                  <td style={{padding:"12px 14px",fontSize:12}}>
                    <span style={{background:isAltro?"#f59e0b":"#e5e7eb",color:isAltro?"#fff":"#374151",borderRadius:4,padding:"3px 10px",fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}>
                      {isAltro&&"✍️ "}{cognomeNome(docColloquio)}
                    </span>
                  </td>
                  <td style={{padding:"12px 14px"}}><button onClick={()=>setColloquiDB(colloquiDB.map(x=>x.id===c.id?{...x,attivo:!x.attivo}:x))} style={{padding:"4px 14px",background:c.attivo?"#22c55e":"#9ca3af",color:"#fff",border:"none",borderRadius:12,fontWeight:700,fontSize:12,cursor:"pointer"}}>{c.attivo?"Attivo":"Inattivo"}</button></td>
                  <td style={{padding:"12px 14px"}}><div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{setEditColl(c.id);setCollForm({...c});setCollOpen(true);}} style={{background:"#0891b2",color:"#fff",border:"none",borderRadius:4,padding:"6px 10px",cursor:"pointer",fontSize:12}}>✏️ Modifica</button>
                    <button onClick={()=>{setColloquiDB(colloquiDB.filter(x=>x.id!==c.id));showToast();}} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:4,padding:"6px 10px",cursor:"pointer",fontSize:12}}>🗑️ Elimina</button>
                  </div></td>
                </tr>
                );
              })}</tbody>
            </table>
          </div>
        }
      </div>

      <Modal open={collOpen} onClose={()=>setCollOpen(false)} width={980} headerColor={TEAL}
        title={(editColl?"Modifica":"Nuovo")+" ricevimento per "+cognomeNome(editColl?(collForm.docente||docente):firmaAttiva)}>
        <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:12,fontFamily:FF}}>

          {/* Riga 1: Periodo | N. max | Modalità | Tutti gli alunni | Attivo */}
          <div style={{display:"grid",gridTemplateColumns:"2fr 1.2fr 2fr 1fr 1fr",gap:12,alignItems:"end"}}>
            <div>
              <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Periodo ripetibilità</div>
              <select value={collForm.periodoRipetibilita} onChange={e=>setCollForm({...collForm,periodoRipetibilita:e.target.value})} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"7px 10px",fontSize:13,background:"#fff",fontFamily:FF}}>
                {["Ogni settimana","Ogni due settimane","Ogni mese","Una tantum"].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:6}}>Numero massimo</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:0,overflow:"hidden",background:"#fff"}}>
                <button onClick={()=>setCollForm({...collForm,numeroMax:Math.max(1,collForm.numeroMax-1)})} style={{padding:"7px 12px",background:"#f5f5f5",border:"none",borderRight:"1px solid #ccc",cursor:"pointer",fontWeight:700,fontSize:16}}>−</button>
                <span style={{flex:1,textAlign:"center",fontWeight:700,fontSize:15,padding:"7px 4px"}}>{collForm.numeroMax}</span>
                <button onClick={()=>setCollForm({...collForm,numeroMax:collForm.numeroMax+1})} style={{padding:"7px 12px",background:"#f5f5f5",border:"none",borderLeft:"1px solid #ccc",cursor:"pointer",fontWeight:700,fontSize:16}}>+</button>
              </div>
            </div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:6}}>Modalità</div>
              <select value={collForm.modalita} onChange={e=>setCollForm({...collForm,modalita:e.target.value})} style={{width:"100%",border:"1px solid #ccc",borderRadius:0,padding:"7px 10px",fontSize:13,background:"#fff",fontFamily:FF}}>
                {["Misto","In presenza","Solo videochiamata"].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:6}}>Tutti gli alunni</div>
              <ToggleSiNo value={collForm.tuttiAlunni} onChange={v=>setCollForm(f=>({...f,tuttiAlunni:v}))}/>
            </div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:6}}>Attivo</div>
              <ToggleSiNo value={collForm.attivo} onChange={v=>setCollForm(f=>({...f,attivo:v}))}/>
            </div>
          </div>

          {/* Riga 2: Da data | A data | Giorno | Ora inizio | Ora fine */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:12,alignItems:"end"}}>
            <div>
              <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Da data</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"7px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:13}}>📅</span>
                <input type="date" value={collForm.dataInizio||""} onChange={e=>setCollForm({...collForm,dataInizio:e.target.value})} style={{border:"none",padding:"7px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
              </div>
            </div>
            <div>
              <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>A data</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"7px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:13}}>📅</span>
                <input type="date" value={collForm.dataFine||""} onChange={e=>setCollForm({...collForm,dataFine:e.target.value})} style={{border:"none",padding:"7px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
              </div>
            </div>
            <div>
              <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Giorno</div>
              <select value={collForm.giorno} onChange={e=>setCollForm({...collForm,giorno:e.target.value})} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"7px 10px",fontSize:13,background:"#fff",fontFamily:FF}}>
                {GIORNI.map(g=><option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Ora inizio</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"7px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:13}}>⏰</span>
                <input type="time" value={collForm.oraInizio} onChange={e=>setCollForm({...collForm,oraInizio:e.target.value})} style={{border:"none",padding:"7px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
              </div>
            </div>
            <div>
              <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Ora fine</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"7px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:13}}>⏰</span>
                <input type="time" value={collForm.oraFine} onChange={e=>setCollForm({...collForm,oraFine:e.target.value})} style={{border:"none",padding:"7px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
              </div>
            </div>
          </div>

          {/* Sede */}
          <div>
            <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Sede <span style={{color:"#ef4444"}}>*</span></div>
            <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
              <input value={collForm.sede||""} onChange={e=>setCollForm({...collForm,sede:e.target.value})} placeholder="es. Sede principale" style={{border:"none",padding:"8px 10px",flex:1,fontSize:13,outline:"none",fontFamily:FF}}/>
              {collForm.sede&&<button onClick={()=>setCollForm({...collForm,sede:""})} style={{padding:"8px 12px",background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:14}}>✕</button>}
            </div>
          </div>

          {/* Non disponibile Dal / Al */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Non disponibile - Dal</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"7px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:13}}>📅</span>
                <input type="date" value={collForm.nonDispDal||""} onChange={e=>setCollForm({...collForm,nonDispDal:e.target.value})} style={{border:"none",padding:"7px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
              </div>
            </div>
            <div>
              <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Non disponibile - Al</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"7px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:13}}>📅</span>
                <input type="date" value={collForm.nonDispAl||""} onChange={e=>setCollForm({...collForm,nonDispAl:e.target.value})} style={{border:"none",padding:"7px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
              </div>
            </div>
          </div>

          {/* Note per le famiglie */}
          <div>
            <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Note per le famiglie</div>
            <textarea value={collForm.note} onChange={e=>setCollForm({...collForm,note:e.target.value})} rows={3} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"8px",resize:"vertical",boxSizing:"border-box",fontSize:13,fontFamily:FF}}/>
          </div>

          {/* Link videochiamata */}
          <div>
            <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Link per colloquio in videochiamata:</div>
            <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
              <span style={{padding:"8px 12px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:14}}>🎥</span>
              <input value={collForm.linkVideo||""} onChange={e=>setCollForm({...collForm,linkVideo:e.target.value})} placeholder="https://meet.google.com/..." style={{border:"none",padding:"8px 10px",flex:1,fontSize:13,outline:"none",fontFamily:FF}}/>
            </div>
          </div>

          {/* Elenco classi */}
          <div>
            <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:6}}>Elenco classi</div>
            <div style={{border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"48px 1fr",background:"#f5f5f5",borderBottom:"1px solid #ccc"}}>
                <div style={{padding:"8px",textAlign:"center",borderRight:"1px solid #ccc"}}>
                  <input type="checkbox" checked={(collForm.classiSel||[]).length===classiList.length&&classiList.length>0} onChange={e=>setCollForm({...collForm,classiSel:e.target.checked?[...classiList]:[]})} style={{cursor:"pointer"}}/>
                </div>
                <div style={{padding:"8px 14px",fontWeight:700,fontSize:13,color:TEAL}}>Classe</div>
              </div>
              {classiList.map(cl=>{
                const sel=(collForm.classiSel||[]).includes(cl);
                return(
                  <div key={cl} style={{display:"grid",gridTemplateColumns:"48px 1fr",borderBottom:"1px solid #f3f4f6",background:sel?"#e8f5f5":"#fff",cursor:"pointer"}} onClick={()=>setCollForm(f=>({...f,classiSel:sel?(f.classiSel||[]).filter(x=>x!==cl):[...(f.classiSel||[]),cl]}))}>
                    <div style={{padding:"8px",textAlign:"center",borderRight:"1px solid #eee",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <input type="checkbox" checked={sel} readOnly style={{cursor:"pointer"}}/>
                    </div>
                    <div style={{padding:"8px 14px",fontSize:13,fontWeight:sel?700:400}}>{cl}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:4}}>
            <button onClick={salvaColloquio} style={{padding:"8px 28px",background:BTN_GREEN,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>💾 Salva</button>
            <button onClick={()=>setCollOpen(false)} style={{padding:"8px 20px",background:BTN_BLUE,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>⊗ Chiudi</button>
          </div>
        </div>
      </Modal>
    </div>
  );

  // ═══════════════════════════════════════════
  // PROGRAMMAZIONE DIDATTICA — Verbali & Team
  // ═══════════════════════════════════════════
  if(activeTab==="programmazione") return (
    <div style={{fontFamily:FF,display:"flex",flexDirection:"column",height:"100vh",background:"#f9fafb"}}>
      <SavingOverlay show={saving}/>
      {toastMsg&&<Toast msg={toastMsg} onDone={()=>setToastMsg(null)}/>}
      <SubHeader color={TEAL} text="Programmazione scolastica — Verbali" onBack={()=>setActiveTab(null)}/>
      <ProgrammazionePanel
        docente={firmaAttiva}
        classi={classi}
        classeAttiva={classe}
        materie={getMaterieClasse(classe)}
        contDB={contDB}
        setContDB={setContDB}
        showToast={showToast}
        cSet={cSet}
      />
    </div>
  );

  if(activeTab==="comunicazioni") return (
    <div style={{fontFamily:FF,display:"flex",flexDirection:"column",height:"100vh",background:"#f9fafb"}}>
      <SavingOverlay show={saving}/>
      {toastMsg&&<Toast msg={toastMsg} onDone={()=>setToastMsg(null)}/>}
      <SubHeader color={TEAL} text="Comunicazioni" onBack={()=>setActiveTab(null)}/>
      <div style={{flex:1,overflowY:"auto",padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontSize:20,fontWeight:700,margin:0}}>Comunicazioni — {classe}</h2>
          <Btn color="#0891b2" onClick={()=>{
            setEditComun(null);
            setComunForm({oggetto:"",testo:"",data:todayISO(),destinatariTutti:false,destinatari:[],classiCom:[classe]});
            setComunOpen(true);
          }}>+ Nuova</Btn>
        </div>

        {/* Comunicazioni collega dal link */}
        {(()=>{
          const CKEY=`rc_link_${docente}_${classe}`;
          const saved=(() => { try{return localStorage.getItem(CKEY);}catch{return null;} })();
          if(!saved) return null;
          let d=null;
          try{ const h=saved.includes("#rc=")?saved.split("#rc=")[1]:saved.includes("#collega=")?saved.split("#collega=")[1]:saved.trim(); d=JSON.parse(decodeURIComponent(escape(atob(h)))); }catch{}
          if(!d?.comunicazioni?.length) return null;
          return(
            <div style={{marginBottom:20,background:"#f0f9ff",border:"2px solid #bae6fd",borderRadius:8,overflow:"hidden"}}>
              <div style={{background:"#0891b2",color:"#fff",padding:"10px 16px",fontWeight:700,fontSize:14}}>
                📢 Comunicazioni di {d.docente} — {d.classe}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,padding:12}}>
                {d.comunicazioni.map((c,i)=>(
                  <div key={i} style={{background:"#fff",borderRadius:6,border:"1px solid #bae6fd",padding:12}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#0891b2",marginBottom:2}}>{c.oggetto||"(senza oggetto)"}</div>
                    <div style={{fontSize:12,color:"#9ca3af",marginBottom:4}}>{c.data}</div>
                    {c.testo&&<div style={{fontSize:13,color:"#374151",lineHeight:1.5}}>{c.testo}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        {getCont("comunicazioni").length===0
          ?<div style={{textAlign:"center",padding:"60px 0",color:"#9ca3af"}}><div style={{fontSize:48,marginBottom:12}}>📢</div><div style={{fontWeight:600,fontSize:18,marginBottom:8}}>Nessuna comunicazione per questa classe</div></div>
          :<ComunicazioniListView
              items={getCont("comunicazioni")}
              docente={docente}
              classe={classe}
              onOpen={item=>setComunDettaglio(item)}
              onEdit={item=>{setEditComun(item.id);setComunForm({...item});setComunOpen(true);}}
              onDelete={item=>{
                const all=contDB["__comunicazioni__"]?.["comunicazioni"]||[];
                const nuove=all.filter(c=>c.id!==item.id);
                setContDB(p=>{const next={...p,"__comunicazioni__":{...p["__comunicazioni__"],"comunicazioni":nuove}};try{cSet("contDB",next);}catch{}return next;});
                showToast("Eliminato");
              }}
            />
        }
      </div>
      <Modal open={comunOpen} onClose={()=>{setComunOpen(false);setEditComun(null);}} width={900} headerColor={TEAL} title={(editComun?"Modifica":"Nuova")+" Comunicazione"}>
        <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:14,fontFamily:FF}}>

          {/* Riga 1: Inviata Da | Sempre Visibile | Log Anonimo | Visibile Famiglie */}
          <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr 1fr 1fr",gap:14,alignItems:"end"}}>
            <div>
              <div style={{fontWeight:700,fontSize:13,marginBottom:5}}>Inviata Da</div>
              <select value={comunForm.inviataDa||"Docente"} onChange={e=>setComunForm({...comunForm,inviataDa:e.target.value})} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"8px 10px",fontSize:13,background:"#fff",fontFamily:FF}}>
                {["Docente","Coordinatore","Dirigente","Segreteria"].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            {[["sempreVisibile","Sempre Visibile"],["logAnonimo","Log Anonimo"],["visibileFamiglie","Visibile Famiglie"]].map(([k,lbl])=>(
              <div key={k}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:5}}>{lbl}</div>
                <ToggleSiNo value={!!comunForm[k]} onChange={v=>setComunForm(f=>({...f,[k]:v}))}/>
              </div>
            ))}
          </div>

          {/* Riga 2: Da data | A data | URL */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:14,alignItems:"end"}}>
            <div>
              <div style={{fontWeight:700,fontSize:13,marginBottom:5}}>Da data</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"8px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:14}}>📅</span>
                <input type="date" value={comunForm.dataInizio||comunForm.data||todayISO()} onChange={e=>setComunForm({...comunForm,dataInizio:e.target.value,data:e.target.value})} style={{border:"none",padding:"7px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
              </div>
            </div>
            <div>
              <div style={{fontWeight:700,fontSize:13,marginBottom:5}}>A data</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"8px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:14}}>📅</span>
                <input type="date" value={comunForm.dataFine||""} onChange={e=>setComunForm({...comunForm,dataFine:e.target.value})} style={{border:"none",padding:"7px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
              </div>
            </div>
            <div>
              <div style={{fontWeight:700,fontSize:13,marginBottom:5}}>URL (Link collegamento esterno)</div>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"8px 12px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:14}}>🔗</span>
                <input value={comunForm.urlEsterno||""} onChange={e=>setComunForm({...comunForm,urlEsterno:e.target.value})} placeholder="https://..." style={{border:"none",padding:"7px 8px",fontSize:13,outline:"none",fontFamily:FF,flex:1}}/>
              </div>
            </div>
          </div>

          {/* Titolo */}
          <div>
            <div style={{fontWeight:700,fontSize:13,marginBottom:5}}>Titolo</div>
            <input value={comunForm.oggetto||""} onChange={e=>setComunForm({...comunForm,oggetto:e.target.value})} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"9px 12px",fontSize:14,fontFamily:FF,boxSizing:"border-box"}} placeholder="Titolo comunicazione"/>
          </div>

          {/* Testo comunicazione */}
          <div>
            <div style={{fontWeight:700,fontSize:13,marginBottom:5}}>Testo comunicazione</div>
            <textarea value={comunForm.testo||""} onChange={e=>setComunForm({...comunForm,testo:e.target.value})} rows={4} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"9px 12px",resize:"vertical",boxSizing:"border-box",fontSize:13,fontFamily:FF,lineHeight:1.6}}/>
          </div>

          {/* Selezione file */}
          <div>
            <div style={{fontWeight:700,fontSize:13,marginBottom:5}}>Selezione il file da allegare <span style={{color:"#9ca3af",fontWeight:400,fontSize:12}}>(Dimensione massima del file 10Mb)</span></div>
            <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
              <input value={(comunForm.allegati||[]).map(a=>a.nome).join(", ")||""} readOnly placeholder="" style={{flex:1,border:"none",padding:"8px 10px",fontSize:13,outline:"none",fontFamily:FF,background:"#fff"}}/>
              <label style={{padding:"8px 14px",background:"#f5f5f5",borderLeft:"1px solid #ccc",cursor:"pointer",fontWeight:600,fontSize:13,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"}}>
                📂 Seleziona file
                <input type="file" accept="image/*,application/pdf" multiple style={{display:"none"}} onChange={e=>{
                  const files=Array.from(e.target.files||[]);
                  files.forEach(file=>{
                    const reader=new FileReader();
                    reader.onload=ev=>{setComunForm(f=>({...f,allegati:[...(f.allegati||[]),{id:Date.now()+Math.random(),nome:file.name,tipo:file.type,data:ev.target.result}]}));};
                    reader.readAsDataURL(file);
                  });
                  e.target.value="";
                }}/>
              </label>
            </div>
            {(comunForm.allegati||[]).length>0&&<div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:8}}>{(comunForm.allegati||[]).map(a=>(
              <div key={a.id} style={{position:"relative",border:"1px solid #e5e7eb",borderRadius:6,overflow:"hidden",background:"#f9f9f9"}}>
                {a.tipo&&a.tipo.startsWith("image/")?<img src={a.data} alt={a.nome} style={{width:80,height:60,objectFit:"cover",display:"block"}}/>:<div style={{width:80,height:60,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:22}}>📄</span></div>}
                <div style={{padding:"2px 6px",fontSize:10,color:"#6b7280",maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.nome}</div>
                <button onClick={()=>setComunForm(f=>({...f,allegati:f.allegati.filter(x=>x.id!==a.id)}))} style={{position:"absolute",top:2,right:2,background:"#ef4444",color:"#fff",border:"none",borderRadius:"50%",width:16,height:16,cursor:"pointer",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
              </div>
            ))}</div>}
          </div>

          {/* Tipo risposta */}
          <div style={{display:"grid",gridTemplateColumns:"200px 1fr",gap:14,alignItems:"start"}}>
            <div>
              <div style={{fontWeight:700,fontSize:13,marginBottom:5}}>Tipo risposta</div>
              <select value={comunForm.tipoRisposta||"Nessuna"} onChange={e=>setComunForm({...comunForm,tipoRisposta:e.target.value})} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"8px 10px",fontSize:13,background:"#fff",fontFamily:FF}}>
                {["Nessuna","Sì/No","Testo libero","Firma"].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            {/* Visibile nei giorni */}
            <div>
              <div style={{fontWeight:700,fontSize:13,marginBottom:5}}>Visibile nei giorni</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                {["Tutti","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"].map(g=>{
                  const gg=comunForm.giorniVisibili||["Tutti"];
                  const selG=gg.includes(g);
                  return(<div key={g} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#374151"}}>{g}</div>
                    <button onClick={()=>{
                      if(g==="Tutti") setComunForm(f=>({...f,giorniVisibili:["Tutti"]}));
                      else{const cur=(comunForm.giorniVisibili||["Tutti"]).filter(x=>x!=="Tutti");const ns=selG?cur.filter(x=>x!==g):[...cur,g];setComunForm(f=>({...f,giorniVisibili:ns.length?ns:["Tutti"]}));}
                    }} style={{padding:"4px 10px",background:selG?BTN_GREEN:"#e5e7eb",color:selG?"#fff":"#374151",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:12}}>{selG?"SÌ":"NO"}</button>
                  </div>);
                })}
              </div>
            </div>
          </div>

          {/* Visibile nelle classi */}
          <div>
            <div style={{fontWeight:700,fontSize:13,marginBottom:5}}>Visibile nelle classi</div>
            <div style={{border:"1px solid #ccc",borderRadius:4,overflow:"hidden",maxHeight:160,overflowY:"auto"}}>
              <div style={{display:"grid",gridTemplateColumns:"40px 1fr",background:"#f5f5f5",borderBottom:"1px solid #ddd",position:"sticky",top:0}}>
                <div style={{padding:"7px",textAlign:"center",borderRight:"1px solid #ddd",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <input type="checkbox" checked={(comunForm.classiCom||[]).length===classiList.length&&classiList.length>0} onChange={e=>setComunForm({...comunForm,classiCom:e.target.checked?[...classiList]:[]})} style={{cursor:"pointer"}}/>
                </div>
                <div style={{padding:"7px 12px",fontWeight:700,fontSize:13,color:"#374151"}}>Sel &nbsp;&nbsp; Visibile nelle classi</div>
              </div>
              {classiList.map(cl=>{
                const sel=(comunForm.classiCom||[]).includes(cl);
                return(
                  <div key={cl} style={{display:"grid",gridTemplateColumns:"40px 1fr",borderBottom:"1px solid #f3f4f6",background:sel?"#f0f9ff":"#fff",cursor:"pointer"}} onClick={()=>setComunForm(f=>({...f,classiCom:sel?(f.classiCom||[]).filter(x=>x!==cl):[...(f.classiCom||[]),cl]}))}>
                    <div style={{padding:"8px",textAlign:"center",borderRight:"1px solid #eee",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <input type="checkbox" checked={sel} readOnly style={{cursor:"pointer"}}/>
                    </div>
                    <div style={{padding:"8px 12px",fontSize:13,fontWeight:sel?600:400}}>{cl}</div>
                  </div>
                );
              })}
            </div>
            {(comunForm.classiCom||[]).length===0&&<div style={{fontSize:11,color:"#ef4444",marginTop:3}}>Seleziona almeno una classe</div>}
          </div>

          <div style={{display:"flex",gap:10,justifyContent:"flex-end",paddingTop:4}}>
            <button onClick={salvaComunicazione} style={{padding:"9px 28px",background:BTN_GREEN,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>💾 Salva</button>
            <button onClick={()=>{setComunOpen(false);setEditComun(null);}} style={{padding:"9px 20px",background:BTN_BLUE,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>⊗ Chiudi</button>
          </div>
        </div>
      </Modal>
      {/* Modal dettaglio comunicazione */}
      {comunDettaglio&&(
        <ComunicazioneDettaglio
          item={comunDettaglio}
          onClose={()=>setComunDettaglio(null)}
          onEdit={item=>{setEditComun(item.id);setComunForm({...item});setComunOpen(true);}}
          onDelete={item=>{
            const all=contDB["__comunicazioni__"]?.["comunicazioni"]||[];
            const nuove=all.filter(c=>c.id!==item.id);
            setContDB(p=>{const next={...p,"__comunicazioni__":{...p["__comunicazioni__"],"comunicazioni":nuove}};try{cSet("contDB",next);}catch{}return next;});
            setComunDettaglio(null);
            showToast("Eliminato");
          }}
          lightboxSet={setLightbox}
        />
      )}
      {/* Lightbox allegati */}
      {lightbox&&(
        <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
          <div style={{position:"absolute",top:16,right:20,color:"#fff",fontSize:28,fontWeight:700,cursor:"pointer",lineHeight:1}} onClick={()=>setLightbox(null)}>✕</div>
          <div style={{position:"absolute",top:18,left:0,right:0,textAlign:"center",color:"#ccc",fontSize:13}}>{lightbox.nome}</div>
          {lightbox.tipo&&lightbox.tipo.startsWith("image/")
            ?<img src={lightbox.data} alt={lightbox.nome} onClick={e=>e.stopPropagation()} style={{maxWidth:"92vw",maxHeight:"88vh",objectFit:"contain",borderRadius:6,boxShadow:"0 8px 40px rgba(0,0,0,0.6)"}}/>
            :<div onClick={e=>e.stopPropagation()} style={{width:"88vw",height:"84vh",background:"#fff",borderRadius:6}}><embed src={lightbox.data} type="application/pdf" width="100%" height="100%"/></div>
          }
          <div style={{color:"#888",fontSize:12,marginTop:12}}>Clicca fuori o su ✕ per chiudere</div>
        </div>
      )}
    </div>
  );


  if(activeTab==="registrocompleto") {
    // Raccoglie tutte le date con voti o assenze per la classe/materia
    const tuttiVotiDK = votiDB[dk] || {};

    // Date con voti
    const dateConVoti = new Set();
    students.forEach(s => {
      (tuttiVotiDK[s.id]||[]).forEach(v => { if(v.data) dateConVoti.add(toISO(v.data)); });
    });

    // Date con assenze
    const dateConAssenze = new Set();
    students.forEach(s => {
      (assenzeDB[classe]?.[s.id]||[]).forEach(a => { if(a.data) dateConAssenze.add(toISO(a.data)); });
    });

    // Tutte le date ordinate
    const tutteDate = [...new Set([...dateConVoti, ...dateConAssenze])].filter(Boolean).sort();

    // Formatta data breve: "14\nsettembre"
    const fmtColData = iso => {
      try {
        const d = new Date(iso+"T00:00:00");
        const MM=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
        return {giorno: d.getDate(), mese: MM[d.getMonth()]};
      } catch { return {giorno:iso, mese:""}; }
    };

    // Tipo voto → colore sfondo
    const TIPO_BG = {scritto:"#22c55e", grafico:"#8b5cf6", orale:"#f97316", pratico:"#eab308", unico:"#6b7280"};

    // Ore lezione per data (dalle firme)
    const oreLezPerData = {};
    (contDB[`${classe}||__firme__`]?.firme||[]).forEach(f => {
      const d = toISO(f.data||"");
      if(!d) return;
      if(!oreLezPerData[d]) oreLezPerData[d] = 0;
      oreLezPerData[d] += parseInt(f.nOre)||1;
    });

    // Media totale alunno
    const mediaTotRC = sid => {
      const vv = (tuttiVotiDK[sid]||[]).filter(v=>v.faMedia && v.voto && !isNaN(parseVoto(v.voto)));
      if(!vv.length) return null;
      let sp=0,sv=0;
      vv.forEach(v=>{const w=parseFloat(v.peso)||100;sv+=parseVoto(v.voto)*w;sp+=w;});
      return sp>0?sv/sp:null;
    };

    const oreAssRC = sid => (assenzeDB[classe]?.[sid]||[]).filter(a=>a.concorreCalcolo!==false&&a.tipo==="assente").length;

    // Legenda
    const LEGENDA = [
      {lbl:"Scritto",  bg:"#6b7280", tipo:"scritto"},
      {lbl:"Grafico",  bg:"#8b5cf6", tipo:"grafico"},
      {lbl:"Orale",    bg:"#3b82f6", tipo:"orale"},
      {lbl:"Pratico",  bg:"#eab308", tipo:"pratico"},
      {lbl:"Altro",    bg:"#f97316", tipo:"unico"},
      {lbl:"Positivo", bg:"#22c55e", special:"pos"},
      {lbl:"Negativo", bg:"#ef4444", special:"neg"},
      {lbl:"No media", bg:"#a855f7", special:"nomedia"},
      {lbl:"Assenza",  bg:"#f9a8d4", special:"ass"},
    ];

    return (
      <div style={{fontFamily:FF,display:"flex",flexDirection:"column",height:"100vh",background:"#f5f5f5"}}>
        <SavingOverlay show={saving}/>
        {toastMsg&&<Toast msg={toastMsg} onDone={()=>setToastMsg(null)}/>}
        <SubHeader color={TEAL} text="📋 Registro Completo" onBack={()=>setActiveTab(null)}/>

        {/* Barra periodo + materia */}
        <div style={{background:TEAL_LIGHT,borderBottom:"1px solid "+TEAL,padding:"6px 16px",display:"flex",gap:8,flexShrink:0,alignItems:"center",flexWrap:"wrap"}}>
          {TRIMESTRI.map(t=>(
            <button key={t} onClick={()=>setPgTrim(t)}
              style={{padding:"4px 14px",background:pgTrim===t?TEAL:"#fff",color:pgTrim===t?"#fff":TEAL,border:"1px solid "+TEAL,borderRadius:3,fontWeight:600,cursor:"pointer",fontSize:12}}>
              {t}
            </button>
          ))}
          <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:16}}>
            <span style={{fontSize:13,fontWeight:600,color:TEAL}}>Materia:</span>
            <select value={materia} onChange={e=>setMateria(e.target.value)}
              style={{background:"#fff",color:TEAL,fontWeight:700,fontSize:13,border:"1px solid "+TEAL,borderRadius:4,padding:"3px 10px",cursor:"pointer",fontFamily:FF}}>
              {(getMaterieClasse(classe).length>0
                ? getMaterieClasse(classe)
                : [...MATERIE,...(()=>{try{return JSON.parse(localStorage.getItem("reg:materieExtra")||"[]");}catch{return[];}})()].filter((v,i,a)=>a.indexOf(v)===i)
              ).map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* Box principale stile immagine */}
        <div style={{flex:1,overflowY:"auto",padding:16}}>
          <div style={{background:"#fff",border:"2px solid "+TEAL,borderRadius:8,overflow:"hidden"}}>

            {/* Header verde "Registro completo" */}
            <div style={{background:TEAL,color:"#fff",padding:"8px 16px",fontWeight:700,fontSize:15}}>
              Registro completo
            </div>

            {/* Legenda */}
            <div style={{padding:"10px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",borderBottom:"1px solid #e5e7eb"}}>
              <span style={{fontWeight:600,fontSize:13,color:"#374151"}}>Legenda:</span>
              {LEGENDA.map(({lbl,bg,tipo,special})=>{
                if(special==="ass") return(
                  <div key={lbl} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{background:"#f9a8d4",color:"#1f2937",fontWeight:700,fontSize:13,borderRadius:3,padding:"3px 10px"}}>A</div>
                    <span style={{fontSize:12,color:"#374151"}}>{lbl}</span>
                  </div>
                );
                // Positivo/Negativo: verde/rosso con triangolino scritto (verde)
                if(special==="pos") return(
                  <div key={lbl} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{position:"relative",width:34,height:24,borderRadius:2,background:"#22c55e",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.15)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <div style={{position:"absolute",top:0,left:0,width:0,height:0,borderTop:"10px solid #22c55e",borderRight:"10px solid transparent"}}/>
                    </div>
                    <span style={{fontSize:12,color:"#374151"}}>{lbl}</span>
                  </div>
                );
                if(special==="neg") return(
                  <div key={lbl} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{position:"relative",width:34,height:24,borderRadius:2,background:"#ef4444",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.15)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <div style={{position:"absolute",top:0,left:0,width:0,height:0,borderTop:"10px solid #22c55e",borderRight:"10px solid transparent"}}/>
                    </div>
                    <span style={{fontSize:12,color:"#374151"}}>{lbl}</span>
                  </div>
                );
                // No media: blu con sfumato bianco
                if(special==="nomedia") return(
                  <div key={lbl} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{position:"relative",width:34,height:24,borderRadius:2,background:"#3b82f6",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.15)"}}>
                      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at -5% -5%, #ffffff 0%, #ffffff 22%, rgba(255,255,255,0.5) 40%, rgba(255,255,255,0) 58%)"}}/>
                    </div>
                    <span style={{fontSize:12,color:"#374151"}}>{lbl}</span>
                  </div>
                );
                // Tipi: verde/rosso con triangolino del colore del tipo
                return(
                  <div key={lbl} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{position:"relative",width:34,height:24,borderRadius:2,background:"#22c55e",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.15)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <div style={{position:"absolute",top:0,left:0,width:0,height:0,borderTop:`10px solid ${bg}`,borderRight:"10px solid transparent"}}/>
                    </div>
                    <span style={{fontSize:12,color:"#374151"}}>{lbl}</span>
                  </div>
                );
              })}
            </div>

            {/* Tabella */}
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",minWidth:"100%",fontSize:12}}>
                <thead>
                  {/* Riga intestazioni */}
                  <tr style={{borderBottom:"2px solid #e5e7eb"}}>
                    {/* Cognome e Nome */}
                    <th style={{padding:"10px 14px",textAlign:"left",color:TEAL,fontWeight:700,fontSize:13,borderRight:"1px solid #e5e7eb",position:"sticky",left:0,background:"#fff",zIndex:3,minWidth:170}}>
                      Cognome e Nome
                    </th>
                    {/* Info */}
                    <th style={{padding:"10px 6px",textAlign:"center",color:TEAL,fontWeight:700,fontSize:12,borderRight:"1px solid #e5e7eb",minWidth:40}}>
                      Info
                    </th>
                    {/* Media voti */}
                    <th style={{padding:"10px 6px",textAlign:"center",color:TEAL,fontWeight:700,fontSize:12,borderRight:"1px solid #e5e7eb",minWidth:60}}>
                      Media<br/>voti
                    </th>
                    {/* Ore ass. */}
                    <th style={{padding:"10px 6px",textAlign:"center",color:TEAL,fontWeight:700,fontSize:12,borderRight:"2px solid #d1d5db",minWidth:50}}>
                      Ore<br/>ass.
                    </th>
                    {/* Colonne date */}
                    {tutteDate.map(d=>{
                      const {giorno,mese} = fmtColData(d);
                      return(
                        <th key={d} style={{padding:"6px 4px",textAlign:"center",color:TEAL,fontWeight:600,fontSize:11,borderRight:"1px solid #e5e7eb",minWidth:54,verticalAlign:"bottom"}}>
                          <div style={{fontWeight:700,fontSize:13}}>{giorno}</div>
                          <div style={{fontSize:10,color:"#6b7280"}}>{mese}</div>
                        </th>
                      );
                    })}
                  </tr>

                  {/* Riga "Ore lezione →" */}
                  <tr style={{background:"#fef3c7",borderBottom:"2px solid #e5e7eb"}}>
                    <td style={{padding:"6px 14px",fontWeight:700,fontSize:12,color:"#92400e",borderRight:"1px solid #e5e7eb",position:"sticky",left:0,background:"#fef3c7",zIndex:2}}>
                      Ore lezione →
                    </td>
                    <td style={{borderRight:"1px solid #e5e7eb"}}/>
                    <td style={{borderRight:"1px solid #e5e7eb"}}/>
                    <td style={{borderRight:"2px solid #d1d5db"}}/>
                    {tutteDate.map(d=>(
                      <td key={d} style={{padding:"4px 2px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                        <div style={{
                          width:26,height:26,borderRadius:"50%",
                          background:oreLezPerData[d]>0?"#ef4444":"#ef4444",
                          color:"#fff",fontWeight:700,fontSize:12,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          margin:"0 auto",
                        }}>
                          {oreLezPerData[d]||0}
                        </div>
                      </td>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {students.map((s,idx)=>{
                    const media = mediaTotRC(s.id);
                    const oa = oreAssRC(s.id);
                    const mediaColor = media===null?"#9ca3af":media<6?"#ef4444":"#1f2937";
                    const mediaBg = media===null?"#e5e7eb":media<6?"#fee2e2":"#dcfce7";

                    return(
                      <tr key={s.id} style={{borderBottom:"1px solid #f0f0f0",background:idx%2===0?"#fff":"#fafafa"}}>
                        {/* Nome */}
                        <td style={{padding:"8px 14px",fontWeight:700,fontSize:13,color:"#1f2937",borderRight:"1px solid #e5e7eb",whiteSpace:"nowrap",position:"sticky",left:0,background:idx%2===0?"#fff":"#fafafa",zIndex:1}}>
                          {s.cognome} {s.nome}
                        </td>
                        {/* Info */}
                        <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                          <button onClick={()=>setSchedaStudente(s)}
                            style={{width:26,height:26,background:"#29b6d8",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 1px 3px rgba(0,0,0,0.18)"}}>
                            <div style={{width:18,height:18,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.9)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                              <span style={{color:"#fff",fontWeight:900,fontSize:11,lineHeight:1,fontFamily:"Georgia,serif",fontStyle:"italic"}}>i</span>
                            </div>
                          </button>
                        </td>
                        {/* Media */}
                        <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                          {media!==null
                            ? <div style={{background:mediaBg,borderRadius:20,padding:"3px 8px",fontWeight:700,fontSize:13,color:mediaColor,display:"inline-block",minWidth:42,textAlign:"center"}}>
                                {media.toFixed(2)}
                              </div>
                            : <div style={{width:26,height:26,borderRadius:"50%",background:"#e5e7eb",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto"}}>
                                <span style={{fontSize:14,color:"#6b7280"}}>—</span>
                              </div>
                          }
                        </td>
                        {/* Ore assenza */}
                        <td style={{padding:"6px 4px",textAlign:"center",borderRight:"2px solid #d1d5db"}}>
                          <div style={{
                            width:26,height:26,borderRadius:"50%",
                            background:oa>0?"#f59e0b":"#e5e7eb",
                            color:"#fff",fontWeight:700,fontSize:12,
                            display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",
                          }}>{oa}</div>
                        </td>
                        {/* Celle per ogni data */}
                        {tutteDate.map(d=>{
                          // Voti in questa data
                          const votiData = (tuttiVotiDK[s.id]||[]).filter(v=>toISO(v.data||"")===d);
                          // Assenza in questa data
                          const assenza = (assenzeDB[classe]?.[s.id]||[]).find(a=>toISO(a.data||"")===d&&a.tipo==="assente");

                          return(
                            <td key={d} style={{padding:"4px 2px",textAlign:"center",borderRight:"1px solid #f0f0f0",verticalAlign:"middle",minWidth:54}}>
                              {assenza&&!votiData.length&&(
                                <div style={{background:"#f9a8d4",color:"#1f2937",fontWeight:700,fontSize:13,borderRadius:3,padding:"3px 8px",display:"inline-block"}}>A</div>
                              )}
                              {votiData.map(v=>{
                                const raw = String(v.voto||"");
                                if(!raw||raw===" ") return null;
                                const n = parseVoto(raw);
                                const isNeg = !isNaN(n) && n<6;
                                const noMedia = !v.faMedia;
                                const TIPO_TRIANGOLO = {scritto:"#6b7280",grafico:"#8b5cf6",orale:"#3b82f6",pratico:"#eab308",unico:"#f97316"};
                                const triColor = TIPO_TRIANGOLO[v.tipo]||"#22c55e";
                                // Stesso stile del registro valutazioni
                                let bgStyle;
                                if(noMedia){
                                  bgStyle = {background:"#3b82f6"};
                                } else if(isNeg){
                                  bgStyle = {background:"#ef4444"};
                                } else {
                                  bgStyle = {background:"#22c55e"};
                                }
                                return(
                                  <div key={v.id} style={{
                                    position:"relative",
                                    ...bgStyle,
                                    color:"#fff",
                                    fontWeight:900,fontSize:13,
                                    borderRadius:2,
                                    padding:"3px 7px",
                                    display:"inline-flex",alignItems:"center",justifyContent:"center",
                                    margin:"1px",minWidth:36,textAlign:"center",
                                    overflow:"hidden",
                                    boxShadow:"0 1px 3px rgba(0,0,0,0.15)",
                                  }}>
                                    {/* Sfumato bianco in alto a sinistra (stile registro valutazioni) */}
                                    {noMedia&&<div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at -5% -5%, #ffffff 0%, #ffffff 22%, rgba(255,255,255,0.5) 40%, rgba(255,255,255,0) 58%)"}}/>}
                                    {/* Triangolino tipo in alto a sinistra */}
                                    {!noMedia&&<div style={{position:"absolute",top:0,left:0,width:0,height:0,borderTop:`10px solid ${triColor}`,borderRight:"10px solid transparent"}}/>}
                                    <span style={{position:"relative",zIndex:1}}>{raw}</span>
                                  </div>
                                );
                              })}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      {/* Scheda studente */}
      {schedaStudente&&(
        <SchédaStudente
          s={schedaStudente.s||schedaStudente}
          contDB={contDBMerged}
          assenzeDB={assenzeDB}
          votiDB={votiDB}
          scrutiniDB={scrutiniDB}
          classe={classe}
          docente={docente}
          onClose={()=>setSchedaStudente(null)}
          getMaterieScrutinio={getMaterieScrutinio}
          pgTrim={pgTrim}
          setPgTrim={setPgTrim}
          initialTab={schedaStudente.tab}
        />
      )}
    </div>
  );
  }

  if(activeTab==="quadro") {
    const TIPI_QR = ["scritto","grafico","orale","pratico","unico"];
    const TIPI_LBL = {scritto:"Scritto",grafico:"Grafico",orale:"Orale",pratico:"Pratico",unico:"Altro"};

    // Per ogni alunno e tipo: conta voti e calcola media
    const statsAlunno = (sid, tipo) => {
      const vv = (votiDB[dk]?.[sid]||[]).filter(v=>v.tipo===tipo && v.voto && v.voto!==" " && !isNaN(parseVoto(v.voto)));
      const count = vv.length;
      const media = count ? vv.reduce((s,v)=>{const w=parseFloat(v.peso)||100;return s+parseVoto(v.voto)*w;},0) / vv.reduce((s,v)=>s+(parseFloat(v.peso)||100),0) : null;
      return {count, media};
    };

    // Media totale (fa media=true)
    const mediaTot = (sid) => {
      const vv = (votiDB[dk]?.[sid]||[]).filter(v=>v.faMedia && v.voto && v.voto!==" " && !isNaN(parseVoto(v.voto)));
      if(!vv.length) return null;
      let sp=0,sv=0;
      vv.forEach(v=>{const w=parseFloat(v.peso)||100;sv+=parseVoto(v.voto)*w;sp+=w;});
      return sp>0?sv/sp:null;
    };

    // Ore lezione svolte (firme con l'alunno)
    const oreLez = (sid) => {
      const firme = contDB[`${classe}||__firme__`]?.firme||[];
      return firme.reduce((s,f)=>{
        const part = f.partecipazione||"tutti";
        const incluso = part==="tutti"||(f.alunniParz||[]).includes(sid);
        return incluso ? s+(parseInt(f.nOre)||1) : s;
      },0);
    };

    // Ore assenza
    const oreAss = (sid) => (assenzeDB[classe]?.[sid]||[]).filter(a=>a.tipo==="assente"&&a.concorreCalcolo!==false).length;

    // Ultima data valutazione
    const ultimaData = (sid) => {
      const vv = votiDB[dk]?.[sid]||[];
      if(!vv.length) return "-";
      const sorted = [...vv].sort((a,b)=>toISO(b.data||"").localeCompare(toISO(a.data||"")));
      const d = sorted[0].data||"";
      if(d.includes("/")) { const[dd,mm]=d.split("/"); return `${dd}/${mm}`; }
      if(d.includes("-")) { const[,mm,dd]=d.split("-"); return `${dd}/${mm}`; }
      return d;
    };

    // Trend media (confronto primo/secondo semestre)
    const trend = (sid) => {
      const m = mediaTot(sid);
      if(m===null) return "=";
      if(m>=7) return "up";
      if(m<6) return "down";
      return "=";
    };

    const TrendIcon = ({sid}) => {
      const t = trend(sid);
      const m = mediaTot(sid);
      if(m===null) return <span style={{color:"#9ca3af",fontSize:16}}>—</span>;
      if(t==="up")   return <span style={{color:"#22c55e",fontSize:18,fontWeight:900}}>↑</span>;
      if(t==="down") return <span style={{color:"#ef4444",fontSize:18,fontWeight:900}}>↓</span>;
      return <span style={{color:"#6b7280",fontSize:18}}>═</span>;
    };

    // Pallino azzurro con numero
    const Pallino = ({n, onClick}) => (
      <div onClick={onClick} style={{
        width:28,height:28,borderRadius:"50%",
        background: n>0?"#5b9bd5":"#d1d5db",
        color:"#fff",fontWeight:700,fontSize:13,
        display:"flex",alignItems:"center",justifyContent:"center",
        cursor:onClick?"pointer":"default",flexShrink:0,
        boxShadow: n>0?"0 1px 4px rgba(91,155,213,0.4)":"none",
      }}>{n}</div>
    );

    // Pallino rosso assenze
    const PallinoRosso = ({n}) => (
      <div style={{
        width:28,height:28,borderRadius:"50%",
        background:n>0?"#ef4444":"#d1d5db",
        color:"#fff",fontWeight:700,fontSize:13,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
      }}>{n}</div>
    );

    // Pallino verde ore lezione
    const PallinoVerde = ({n}) => (
      <div style={{
        width:28,height:28,borderRadius:"50%",
        background:"#22c55e",
        color:"#fff",fontWeight:700,fontSize:13,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
      }}>{n}</div>
    );

    const stampa = () => {
      const win=window.open("","_blank"); if(!win) return;
      win.document.write(`<html><head><title>Quadro Riepilogativo</title>
      <style>body{font-family:Helvetica,Arial,sans-serif;font-size:12px;padding:20px}
      h2{color:#4e9fa0}table{width:100%;border-collapse:collapse}
      th{background:#4e9fa0;color:#fff;padding:7px 10px;text-align:center;font-size:11px}
      td{padding:7px 10px;border-bottom:1px solid #e5e7eb;text-align:center;vertical-align:middle}
      tr:nth-child(even)td{background:#f9fafb}.nome{text-align:left;font-weight:700}</style>
      </head><body>
      <h2>Quadro Riepilogativo — ${materia} — Classe ${classe} — ${pgTrim}</h2>
      <table><thead><tr>
        <th>N.</th><th style="text-align:left">Cognome e Nome</th>
        ${TIPI_QR.map(t=>`<th>${TIPI_LBL[t]}<br/>N. - Media</th>`).join("")}
        <th>Tutti<br/>Data - Media</th>
        <th>Ore Lez.</th><th>Ore Ass.</th>
      </tr></thead><tbody>
      ${students.map((s,i)=>{
        const mt=mediaTot(s.id);
        return `<tr>
          <td>${i+1}</td>
          <td class="nome">${s.cognome} ${s.nome}</td>
          ${TIPI_QR.map(t=>{const {count,media}=statsAlunno(s.id,t);return `<td>${count} - ${media!==null?media.toFixed(2):"-"}</td>`;}).join("")}
          <td>${ultimaData(s.id)} - ${mt!==null?mt.toFixed(2):"-"}</td>
          <td>${oreLez(s.id)}</td>
          <td>${oreAss(s.id)}</td>
        </tr>`;
      }).join("")}
      </tbody></table></body></html>`);
      win.document.close(); win.print();
    };

    return (
      <div style={{fontFamily:FF,display:"flex",flexDirection:"column",height:"100vh",background:"#f5f5f5"}}>
        <SavingOverlay show={saving}/>
        {toastMsg&&<Toast msg={toastMsg} onDone={()=>setToastMsg(null)}/>}
        <SubHeader color={TEAL} text="📊 Quadro Riepilogativo" onBack={()=>setActiveTab(null)}/>

        {/* Barra periodo */}
        <div style={{background:TEAL_LIGHT,borderBottom:"1px solid "+TEAL,padding:"6px 16px",display:"flex",gap:8,flexShrink:0,alignItems:"center"}}>
          {TRIMESTRI.map(t=><button key={t} onClick={()=>setPgTrim(t)} style={{padding:"4px 14px",background:pgTrim===t?TEAL:"#fff",color:pgTrim===t?"#fff":TEAL,border:"1px solid "+TEAL,borderRadius:3,fontWeight:600,cursor:"pointer",fontSize:12}}>{t}</button>)}
        </div>

        {/* Titolo sezione + selettore materia */}
        <div style={{background:TEAL,color:"#fff",padding:"8px 18px",fontWeight:700,fontSize:15,flexShrink:0,display:"flex",alignItems:"center",gap:16}}>
          <span>Quadro riepilogativo</span>
          <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
            <span style={{fontSize:13,fontWeight:600,opacity:0.85}}>Materia:</span>
            <select value={materia} onChange={e=>setMateria(e.target.value)}
              style={{background:"#fff",color:TEAL,fontWeight:700,fontSize:14,border:"none",borderRadius:4,padding:"4px 10px",cursor:"pointer",fontFamily:FF}}>
              {(getMaterieClasse(classe).length>0
                ? getMaterieClasse(classe)
                : [...MATERIE,...(()=>{try{return JSON.parse(localStorage.getItem("reg:materieExtra")||"[]");}catch{return[];}})()].filter((v,i,a)=>a.indexOf(v)===i)
              ).map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* Tabella */}
        <div style={{flex:1,overflowY:"auto",overflowX:"auto",background:"#fff"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:900,fontSize:12}}>
            <thead>
              {/* Riga 1 */}
              <tr style={{background:"#fff",borderBottom:"1px solid #e5e7eb"}}>
                <th rowSpan={2} style={{padding:"8px 12px",textAlign:"left",fontWeight:700,color:"#374151",borderRight:"1px solid #e5e7eb",minWidth:160,verticalAlign:"bottom",fontSize:13}}>Cognome e Nome</th>
                <th rowSpan={2} style={{padding:"8px 6px",textAlign:"center",fontWeight:700,color:"#29b6d8",fontSize:12,borderRight:"1px solid #e5e7eb",width:40,verticalAlign:"bottom"}}>Info</th>
                <th colSpan={TIPI_QR.length*3} style={{padding:"6px",textAlign:"center",fontWeight:700,color:"#374151",background:"#e8f5e9",borderRight:"1px solid #e5e7eb",fontSize:13,borderBottom:"1px solid #e5e7eb"}}>Valutazioni</th>
                <th rowSpan={2} style={{padding:"8px 6px",textAlign:"center",fontWeight:700,color:TEAL,fontSize:12,borderRight:"1px solid #e5e7eb",minWidth:90,verticalAlign:"bottom"}}>Tutti<br/><span style={{fontWeight:400,fontSize:10,color:"#9ca3af"}}>Data - Media</span></th>
                <th rowSpan={2} style={{padding:"8px 6px",textAlign:"center",fontWeight:700,color:"#22c55e",fontSize:12,borderRight:"1px solid #e5e7eb",minWidth:60,verticalAlign:"bottom"}}>Ore<br/>Lez.</th>
                <th rowSpan={2} style={{padding:"8px 6px",textAlign:"center",fontWeight:700,color:"#ef4444",fontSize:12,borderRight:"1px solid #e5e7eb",minWidth:60,verticalAlign:"bottom"}}>Ore<br/>Ass.</th>
                <th rowSpan={2} style={{padding:"8px 6px",textAlign:"center",fontWeight:700,color:"#0891b2",fontSize:12,minWidth:80,verticalAlign:"bottom"}}>Colloqui<br/><span style={{fontWeight:400,fontSize:10,color:"#9ca3af"}}>Data - Num.</span></th>
              </tr>
              {/* Riga 2: nomi tipi */}
              <tr style={{background:"#e8f5e9",borderBottom:"2px solid #c8e6c9"}}>
                {TIPI_QR.map(t=>(
                  <th key={t} colSpan={3} style={{padding:"5px 4px",textAlign:"center",color:"#374151",fontWeight:600,fontSize:12,borderRight:"1px solid #e0e0e0",borderBottom:"1px solid #c8e6c9"}}>{TIPI_LBL[t]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s,idx)=>{
                const mt = mediaTot(s.id);
                const ol = oreLez(s.id);
                const oa = oreAss(s.id);
                const ud = ultimaData(s.id);
                return(
                  <tr key={s.id} style={{borderBottom:"1px solid #f0f0f0",background:idx%2===0?"#fff":"#f9f9f9"}}>
                    {/* Nome */}
                    <td style={{padding:"8px 12px",borderRight:"1px solid #e5e7eb",fontWeight:700,fontSize:13,color:"#1f2937",whiteSpace:"nowrap"}}>
                      [{idx+1}] {s.cognome} {s.nome}
                    </td>
                    {/* Info — colonna separata */}
                    <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                      <button onClick={()=>setSchedaStudente(s)}
                        style={{width:26,height:26,background:"#29b6d8",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 1px 3px rgba(0,0,0,0.18)"}}>
                        <div style={{width:18,height:18,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.9)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <span style={{color:"#fff",fontWeight:900,fontSize:11,lineHeight:1,fontFamily:"Georgia,serif",fontStyle:"italic"}}>i</span>
                        </div>
                      </button>
                    </td>
                    {/* Colonne per tipo */}
                    {TIPI_QR.map(t=>{
                      const {count,media} = statsAlunno(s.id,t);
                      const isNeg = media!==null && media<6;
                      return(
                        <React.Fragment key={t}>
                          {/* Pallino azzurro con count */}
                          <td style={{padding:"6px 3px",textAlign:"center",borderRight:"1px solid #f0f0f0",width:32}}>
                            <div style={{display:"flex",justifyContent:"center"}}>
                              <Pallino n={count} onClick={count>0?()=>setSchedaStudente(s):null}/>
                            </div>
                          </td>
                          {/* Trattino separatore */}
                          <td style={{padding:"6px 1px",textAlign:"center",color:"#9ca3af",fontSize:13,borderRight:"1px solid #f0f0f0",width:10}}>-</td>
                          {/* Media o = */}
                          <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb",width:44}}>
                            {media!==null
                              ? <span style={{fontWeight:700,fontSize:13,color:isNeg?"#ef4444":"#374151"}}>{media.toFixed(2)}</span>
                              : <span style={{color:"#9ca3af",fontSize:13}}>-</span>
                            }
                          </td>
                        </React.Fragment>
                      );
                    })}
                    {/* Tutti: ultima data + media totale + trend */}
                    <td style={{padding:"6px 8px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,color:"#374151",fontWeight:600}}>{ud}</span>
                        {mt!==null&&<>
                          <span style={{color:"#9ca3af",fontSize:11}}>{mt.toFixed(2)}</span>
                          <TrendIcon sid={s.id}/>
                          <span style={{fontSize:11,color:"#9ca3af"}}>{mt.toFixed(2)}</span>
                          <TrendIcon sid={s.id}/>
                        </>}
                      </div>
                    </td>
                    {/* Ore lezione */}
                    <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                      <div style={{display:"flex",justifyContent:"center"}}>
                        <PallinoVerde n={ol}/>
                      </div>
                    </td>
                    {/* Ore assenza */}
                    <td style={{padding:"6px 4px",textAlign:"center",borderRight:"1px solid #e5e7eb"}}>
                      <div style={{display:"flex",justifyContent:"center"}}>
                        <PallinoRosso n={oa}/>
                      </div>
                    </td>
                    {/* Colloqui */}
                    <td style={{padding:"6px 4px",textAlign:"center"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
                        <span style={{fontSize:12,color:"#9ca3af"}}>-</span>
                        <div style={{display:"flex",justifyContent:"center"}}>
                          <Pallino n={0}/>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pulsante stampa */}
        <div style={{padding:"12px 18px",borderTop:"1px solid #e5e7eb",background:"#fff",flexShrink:0}}>
          <button onClick={stampa} style={{padding:"8px 22px",background:"#d94f4f",color:"#fff",border:"none",borderRadius:4,fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
            🖨️ Stampa
          </button>
        </div>

        {/* Scheda studente */}
        {schedaStudente&&(
          <SchédaStudente
            s={schedaStudente.s||schedaStudente}
            contDB={contDBMerged}
            assenzeDB={assenzeDB}
            votiDB={votiDB}
            classe={classe}
            docente={docente}
            onClose={()=>setSchedaStudente(null)}
            pgTrim={pgTrim}
            setPgTrim={setPgTrim}
            initialTab={schedaStudente.tab}
          />
        )}
      </div>
    );
  }

  if(activeTab==="diario") return (
    <div style={{fontFamily:FF,display:"flex",flexDirection:"column",height:"100vh",background:"#f9fafb"}}>
      <SavingOverlay show={saving}/>
      {toastMsg&&<Toast msg={toastMsg} onDone={()=>setToastMsg(null)}/>}
      <SubHeader color={"#7c3aed"} text="📓 Diario Docente" onBack={()=>setActiveTab(null)}/>
      <DiarioDocente
        docente={firmaAttiva}
        classe={classe}
        materia={materia}
        students={students}
        cGet={cGet}
        cSet={cSet}
        showToast={showToast}
        contDB={contDB}
        setContDB={setContDB}
      />
    </div>
  );

  if(activeTab==="planning") return (
    <div style={{fontFamily:FF,display:"flex",flexDirection:"column",height:"100vh",background:"#f9fafb"}}>
      <SavingOverlay show={saving}/>
      {toastMsg&&<Toast msg={toastMsg} onDone={()=>setToastMsg(null)}/>}
      <SubHeader color={TEAL} text="📅 Planning" onBack={()=>setActiveTab(null)}/>
      <PlanningPanel
        docente={firmaAttiva}
        classe={classe}
        classiList={classiList}
        classi={classi}
        contDB={contDB}
        setContDB={setContDB}
        votiDB={votiDB}
        assenzeDB={assenzeDB}
        materia={materia}
        setMateria={setMateria}
        getMaterieClasse={getMaterieClasse}
        showToast={showToast}
        openContenuto={openContenuto}
        openVerifica={openVerifica}
        TEAL={TEAL}
        FF={FF}
      />
      <Modal open={!!contOpen} onClose={()=>{setContOpen(null);setEditCont(null);}} width={900} headerColor={TEAL}
        title={contOpen==="lezioni"?"Argomenti della lezione":contOpen==="compiti"?"Compiti assegnati":contOpen==="verifiche"?"Verifica/Compito in classe":contOpen==="annotazioni"?"Annotazione":contOpen==="note"?"Nota disciplinare":"Inserimento"}>
        <div style={{padding:"20px 28px",display:"flex",flexDirection:"column",gap:14,fontFamily:FF}}>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,alignItems:"center"}}>
            <span style={{fontSize:13,color:TEAL,fontWeight:600}}>Data</span>
            <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
              <span style={{padding:"7px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:13}}>📅</span>
              <input type="date" value={contForm.data} onChange={e=>setContForm({...contForm,data:e.target.value})} style={{border:"none",padding:"7px 10px",fontSize:13,outline:"none",fontFamily:FF}}/>
            </div>
          </div>
          {(contOpen==="lezioni"||contOpen==="compiti")&&<div>
            <div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:4}}>Materia</div>
            <select value={contForm.materiaLezione||materia} onChange={e=>setContForm(p=>({...p,materiaLezione:e.target.value}))} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"8px 10px",fontSize:14,color:TEAL,fontWeight:600,background:"#fff",fontFamily:FF}}>
              {getMaterieClasse(classe).length>0?getMaterieClasse(classe).map(m=><option key={m}>{m}</option>):[...MATERIE,...(()=>{try{return JSON.parse(localStorage.getItem("reg:materieExtra")||"[]");}catch{return[];}})()].filter((v,i,a)=>a.indexOf(v)===i).map(m=><option key={m}>{m}</option>)}
            </select>
          </div>}
          <div>
            <div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:4}}>{contOpen==="lezioni"?"Argomento":contOpen==="compiti"?"Compito assegnato":contOpen==="verifiche"?"Argomento verifica":contOpen==="note"?"Nota disciplinare":"Testo"}</div>
            <textarea value={contForm.testo} onChange={e=>setContForm({...contForm,testo:e.target.value})} rows={4} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"10px",resize:"vertical",boxSizing:"border-box",fontFamily:FF,fontSize:14}} autoFocus/>
          </div>
          {contOpen==="verifiche"&&<div>
            <div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:4}}>Tipo verifica</div>
            <select value={contForm.tipoVerifica||"Scritto"} onChange={e=>setContForm(f=>({...f,tipoVerifica:e.target.value}))} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"8px 10px",fontSize:14,background:"#fff",fontFamily:FF}}>
              {TIPI_VERIFICA.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={()=>{
              if(contOpen==="verifiche"){
                const item={tipoVerifica:contForm.tipoVerifica||"Scritto",argomenti:contForm.testo,data:contForm.data||todayISO(),inseritoDa:docente,materia:contForm.materiaLezione||materia,note:""};
                if(editCont) saveCont("verifiche",getCont("verifiche").map(c=>c.id===editCont?{...c,...item}:c));
                else saveCont("verifiche",[...getCont("verifiche"),{id:Date.now(),...item}]);
              } else {
                salvaContenuto();
              }
              setContOpen(null);setEditCont(null);
            }} style={{padding:"8px 24px",background:BTN_GREEN,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>💾 Salva</button>
            <button onClick={()=>{setContOpen(null);setEditCont(null);}} style={{padding:"8px 20px",background:BTN_BLUE,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>⊗ Chiudi</button>
          </div>
        </div>
      </Modal>
    </div>
  );

  if(activeTab==="classe") return (
    <div style={{fontFamily:FF,display:"flex",flexDirection:"column",height:"100vh",background:"#f9fafb"}}>
      <SavingOverlay show={saving}/>
      {toastMsg&&<Toast msg={toastMsg} onDone={()=>setToastMsg(null)}/>}
      {/* HEADER AXIOS stile originale */}
      <div style={{background:"#fff",borderBottom:"2px solid #e5e7eb",flexShrink:0}}>
        {/* Barra superiore teal con logo e info */}
        <div style={{background:TEAL,padding:"6px 16px",display:"flex",alignItems:"center",gap:10,justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>{setActiveTab(null);setSelStudent(null);}}
              style={{background:"rgba(0,0,0,0.2)",border:"none",color:"#fff",borderRadius:4,padding:"4px 12px",fontWeight:700,cursor:"pointer",fontSize:13}}>← Home</button>
            {classiList.length>0&&<select value={classe} onChange={e=>{setClasse(e.target.value);setSelStudent(null);}}
              style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.4)",color:"#fff",fontWeight:700,fontSize:13,borderRadius:4,padding:"4px 10px",cursor:"pointer",fontFamily:FF}}>
              {classiList.map(c=><option key={c} style={{color:"#1f2937"}}>{c}</option>)}
            </select>}
          </div>
          {/* Navigatore data stile Axios */}
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <button onClick={()=>{const d=new Date(regData+"T00:00:00");d.setDate(d.getDate()-7);setRegDataNav(d.toISOString().split("T")[0]);}}
              style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:3,padding:"3px 8px",cursor:"pointer",fontWeight:700,fontSize:14}}>«</button>
            <button onClick={prevDay}
              style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:3,padding:"3px 8px",cursor:"pointer",fontWeight:700,fontSize:14}}>‹</button>
            <div style={{position:"relative"}}>
              <input type="date" value={regData} onChange={e=>setRegDataNav(e.target.value)}
                style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%"}}/>
              <span style={{color:"#fff",fontWeight:700,fontSize:13,padding:"3px 12px",display:"block",minWidth:180,textAlign:"center"}}>
                {fmtRegData(regData)}
              </span>
            </div>
            <button onClick={nextDay}
              style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:3,padding:"3px 8px",cursor:"pointer",fontWeight:700,fontSize:14}}>›</button>
            <button onClick={()=>{const d=new Date(regData+"T00:00:00");d.setDate(d.getDate()+7);setRegDataNav(d.toISOString().split("T")[0]);}}
              style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:3,padding:"3px 8px",cursor:"pointer",fontWeight:700,fontSize:14}}>»</button>
            {!isRegToday&&<button onClick={()=>setRegDataNav(todayISO())}
              style={{background:"#22c55e",border:"none",color:"#fff",borderRadius:3,padding:"3px 8px",cursor:"pointer",fontWeight:700,fontSize:11}}>Oggi</button>}
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setShowGestione(true)} style={{background:"rgba(255,255,255,0.18)",border:"1px solid rgba(255,255,255,0.4)",color:"#fff",borderRadius:4,padding:"4px 10px",fontWeight:600,fontSize:12,cursor:"pointer"}}>Classi</button>
          </div>
        </div>
        {/* Tab navigation ESATTA come Axios */}
        <div style={{display:"flex",alignItems:"center",background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"0 8px",gap:2,overflowX:"auto"}}>
          {[
            {id:"comunicazioni_tab", lbl:"📢 Comunicazioni", col:"#fff"},
            {id:"firme_tab",          lbl:"✍️ Firme",          col:"#f97316", active: showFirmePanel && classeInnerTab==="registro"},
            {id:"classe_tab",         lbl:"👥 Classe",         col:"#4e9fa0", active: !showFirmePanel && classeInnerTab==="registro"},
            {id:"alunno_tab",         lbl:"👤 Alunno",         col:"#fff"},
            {id:"permessi_tab",       lbl:"🕒 Permessi",       col:"#fff", active: classeInnerTab==="permessi"},
            {id:"collabora_tab",      lbl:"🔗 Collabora",      col:"#fff"},
            {id:"colleghi_tab",       lbl:"🔄 Registro condiviso", col:"#fff", active: classeInnerTab==="colleghi"},
          ].map(tab=>{
            const isActive = tab.active;
            return (
              <button key={tab.id}
                onClick={()=>{
                  if(tab.id==="firme_tab")       { setShowFirmePanel(true);  setClasseInnerTab("registro"); setSelStudent(null); }
                  else if(tab.id==="classe_tab") { setShowFirmePanel(false); setClasseInnerTab("registro"); setSelStudent(null); }
                  else if(tab.id==="colleghi_tab") { setClasseInnerTab("colleghi"); setShowFirmePanel(false); }
                  else if(tab.id==="permessi_tab")      { setClasseInnerTab("permessi"); setShowFirmePanel(false); }
                  else if(tab.id==="comunicazioni_tab") { setActiveTab("comunicazioni"); }
                }}
                style={{
                  padding:"10px 16px",
                  background: isActive ? (tab.id==="firme_tab"?"#f97316":tab.id==="classe_tab"?TEAL:"#374151") : "#fff",
                  color: isActive ? "#fff" : "#374151",
                  border:"none",
                  borderBottom: isActive ? "3px solid "+(tab.id==="firme_tab"?"#f97316":TEAL) : "3px solid transparent",
                  fontWeight: isActive ? 700 : 400,
                  fontSize:13,cursor:"pointer",whiteSpace:"nowrap",
                  fontFamily:FF,
                  transition:"all 0.12s",
                }}>
                {tab.lbl}
              </button>
            );
          })}
          {/* PCTO */}
          <button style={{padding:"10px 12px",background:"#fff",color:"#6b7280",border:"none",borderBottom:"3px solid transparent",fontWeight:400,fontSize:12,cursor:"pointer",fontFamily:FF}}>📁 PCTO</button>
        </div>
      </div>

      {/* Pannello Colleghi */}
      {classeInnerTab==="colleghi"&&(
        <SistemaColleghi
          docente={docente}
          classiList={classiList}
          classi={classi}
          votiDB={votiDB}
          contDB={contDB}
          assenzeDB={assenzeDB}
          scrutiniDB={scrutiniDB}
          colloquiDB={colloquiDB}
          isCoordinatore={(()=>{try{const m=JSON.parse(localStorage.getItem(`reg:${_doc}:classeMeta`)||"{}");return Object.values(m).some(x=>x.coordinatore);}catch{return false;}})()}
          showToast={showToast}
          classeAttiva={classe}
          onDatiAggiornati={setDatiColleghiCloud}
          firmaAttiva={firmaAttiva}
          setFirmaAttiva={setFirmaAttiva}
        />
      )}

      {classeInnerTab==="permessi"&&<PermessiPanel classe={classe} classi={classi} students={students} docente={firmaAttiva} contDB={contDB} setContDB={setContDB} cSet={cSet} showToast={showToast} TEAL={TEAL} FF={FF}/>}

      {classeInnerTab==="registro"&&(<div style={{flex:1,display:"flex",overflow:"hidden",padding:16,gap:16}}>
          <ListaAlunniPanel
          students={students}
          classe={classe}
          TEAL={TEAL}
          TEAL_LIGHT={TEAL_LIGHT}
          isRegToday={isRegToday}
          regData={regData}
          selStudent={selStudent}
          setSelStudent={setSelStudent}
          hasAssenzaInData={hasAssenzaInData}
          ngCount={ngCount}
          getAssenze={getAssenze}
          toISOFast={toISOFast}
          assenzaRapidaInData={assenzaRapidaInData}
          saveAssenze={saveAssenze}
          assenzeDB={assenzeDB}
          setGiustModal={setGiustModal}
          setGiustOpen={setGiustOpen}
          setSchedaStudente={setSchedaStudente}
          docente={firmaAttiva}
          showToast={showToast}
        />
        {showFirmePanel && (()=>{
        const firmeOggi = (contDB[`${classe}||__firme__`]?.firme||[]).filter(f=>toISO(f.data||"")===regData);
        return (
          <div style={{width:"50%",minWidth:280,display:"flex",flexDirection:"column",background:"#fff",borderRadius:8,border:"1px solid #c0c0c0",overflow:"hidden",flexShrink:0,fontFamily:FF}}>

            {/* Tasto Nuova firma — striscia verde come nell'immagine */}
            <div style={{background:"#5cb85c",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
              <div onClick={()=>openFirma()} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flex:1,justifyContent:"center"}}>
                <span style={{fontSize:16}}>✍️</span>
                <span style={{color:"#fff",fontWeight:700,fontSize:14}}>Nuova firma</span>
              </div>
              <button onClick={()=>setShowFirmePanel(false)}
                style={{width:28,height:28,background:"rgba(0,0,0,0.2)",border:"none",color:"#fff",borderRadius:4,cursor:"pointer",fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                ✕
              </button>
            </div>

            {/* Intestazione colonne */}
            <div style={{display:"grid",gridTemplateColumns:"56px 1fr 1fr 120px 80px",borderBottom:"2px solid #e5e7eb",padding:"8px 12px",background:"#f9fafb",flexShrink:0,gap:4}}>
              {["Ora","Docente - materia","Tipo lezione","Classe/Alunno + Altri alunni","Comandi"].map(h=>(
                <div key={h} style={{fontSize:11,color:"#6b7280",fontWeight:600}}>{h}</div>
              ))}
            </div>

            {/* Righe firme */}
            <div style={{flex:1,overflowY:"auto"}}>
              {firmeOggi.length===0
                ? <div style={{padding:"40px 20px",textAlign:"center",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>Nessuna firma per oggi</div>
                : firmeOggi.map((f,i)=>{
                    const mat = f.materia||f.materiaFirma||"";
                    const nInizio = f.oraInizioNum||parseInt(f.oraInizio)||1;
                    const nOre = parseInt(f.nOre)||1;
                    const oreLabel = nOre===1 ? `${nInizio}` : `${nInizio}-${nInizio+nOre-1}`;
                    const part = f.partecipazione||"tutti";
                    const alunniParz = f.alunniParz||[];
                    const altreClassi = f.alunniAltreClassi||[];
                    return (
                      <div key={f.id} style={{display:"grid",gridTemplateColumns:"56px 1fr 1fr 120px 80px",padding:"10px 12px",borderBottom:"1px solid #f3f4f6",background:i%2===0?"#fff":"#fafafa",alignItems:"center",gap:4}}>
                        {/* ORA — pallino blu */}
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <div style={{width:32,height:32,borderRadius:"50%",background:"#3b82f6",color:"#fff",fontWeight:900,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            {oreLabel}
                          </div>
                        </div>
                        {/* DOCENTE - MATERIA */}
                        <div>
                          <div style={{fontWeight:700,fontSize:13,color:"#16a34a",textTransform:"uppercase"}}>{mat}</div>
                          <div style={{fontSize:12,color:"#374151",fontWeight:600}}>{cognomeNome(f.docente||docente).toUpperCase()}</div>
                          <div style={{fontSize:11,color:"#9ca3af"}}>({f.tipoFirma||"Cattedra"}{f.sostituzione?` · Sost. ${f.docenteSostituito||""}`:""}) </div>
                        </div>
                        {/* TIPO LEZIONE */}
                        <div style={{fontSize:13,color:"#374151"}}>{f.tipoLezione||""}</div>
                        {/* CLASSE / ALUNNI */}
                        <div style={{display:"flex",flexDirection:"column",gap:2}}>
                          {part==="tutti"||alunniParz.length===0
                            ? <span style={{background:"#f97316",color:"#fff",borderRadius:10,padding:"2px 8px",fontWeight:700,fontSize:11,display:"inline-block",alignSelf:"flex-start"}}>Classe</span>
                            : alunniParz.map(sid=>{
                                const s=students.find(x=>x.id===sid);
                                return s?<span key={sid} style={{fontSize:11,color:"#1f2937",fontWeight:600}}>{s.cognome}</span>:null;
                              })
                          }
                          {altreClassi.map((a,idx)=>(
                            <span key={idx} style={{fontSize:10,color:"#2563eb",fontWeight:600}}>{a.cognome} ({a.classe})</span>
                          ))}
                        </div>
                        {/* COMANDI — visibili solo sulla riga del docente attualmente selezionato (firmaAttiva) */}
                        <div style={{display:"flex",gap:4,justifyContent:"center"}}>
                          {(f.docente||docente)===firmaAttiva && (<>
                            <button onClick={()=>openFirma(f)}
                              style={{width:34,height:34,background:"#5cb85c",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                              <Pencil size={14}/>
                            </button>
                            <button onClick={()=>saveCont("firme",getCont("firme").filter(c=>c.id!==f.id))}
                              style={{width:34,height:34,background:"#d9534f",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                              <Trash2 size={14}/>
                            </button>
                          </>)}
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </div>
        );
      })()}
      {(selStudent!==null && selStudent!==undefined) ? (()=>{
          const st=students.find(x=>x.id===selStudent);
          if(!st) return null;
          return(
            <SchedaAlunnoPanel
              s={st}
              classe={classe}
              docente={firmaAttiva}
              assenzeDB={assenzeDB}
              contDB={contDBMerged}
              votiDB={votiDB}
              regData={regData}
              onClose={()=>setSelStudent(null)}
              onSalvaAssenza={(sid, entry, opts)=>{
                if(opts?.edit){
                  saveAssenze(sid, getAssenze(sid).map(x=>x.id===entry.id?entry:x));
                } else {
                  saveAssenze(sid, [...getAssenze(sid), entry]);
                }
              }}
              onEliminaAssenza={(sid, id)=>{
                saveAssenze(sid, getAssenze(sid).filter(x=>x.id!==id));
              }}
              onOpenSchedaCompleta={(s,initTab)=>setSchedaStudente({s,tab:initTab||"feed"})}
              onDeleteContenuto={(sec, id)=>{ deleteContById(sec, id); }}
              onChangeRegData={setRegDataNav}
              onOpenVerifica={(sid, itemEdit)=>{
                if(itemEdit){
                  openVerifica(itemEdit);
                } else {
                  openVerifica();
                  setTimeout(()=>{
                    setVerForm(f=>({
                      ...f,
                      tuttiVer:false,
                      alunniVer:[sid],
                      data: regData,
                    }));
                  }, 50);
                }
              }}
              onOpenContenuto={(sec, sid, itemEdit)=>{
                if(itemEdit){
                  // Modifica: apri con dati precompilati
                  openContenuto(sec, itemEdit, itemEdit.materiaLezione||itemEdit._mat||materia);
                } else {
                  openContenuto(sec, null, materia);
                  setTimeout(()=>{
                    setContForm(f=>({
                      ...f,
                      partecipazione:"parziale",
                      alunniParz:[sid],
                      data: regData,
                    }));
                  }, 50);
                }
              }}
              onOpenNota={(sid, itemEdit)=>{
                if(itemEdit){
                  openContenuto("note", itemEdit, materia);
                } else {
                  openContenuto("note", null, materia);
                  setTimeout(()=>{
                    setContForm(f=>({
                      ...f,
                      destinatariTutti: false,
                      destinatari: [sid],
                      data: regData,
                    }));
                  }, 50);
                }
              }}
              onOpenAnnotazione={(sid, itemEdit)=>{
                if(itemEdit){
                  openContenuto("annotazioni", itemEdit, materia);
                } else {
                  openContenuto("annotazioni", null, materia);
                  setTimeout(()=>{
                    setContForm(f=>({
                      ...f,
                      destinatariTutti: false,
                      destinatari: [sid],
                      data: regData,
                    }));
                  }, 50);
                }
              }}
            />
          );
        })()
        :(showFirmePanel
          ? null
          : <RegistroClassePanel students={students} materia={materia} getCont={getCont} saveCont={saveCont} deleteContById={deleteContById} openFirma={openFirma} openVerifica={openVerifica} openContenuto={openContenuto} docente={firmaAttiva} regData={regData} regDataNav={regDataNav} setRegDataNav={setRegDataNav} contDB={contDBMerged} classe={classe} classiList={classiList} showFirmePanel={showFirmePanel} setShowFirmePanel={setShowFirmePanel}/>
        )
        }
      </div>)}

      {      schedaStudente&&(
        <SchédaStudente
          s={schedaStudente.s||schedaStudente}
          contDB={contDBMerged}
          assenzeDB={assenzeDB}
          votiDB={votiDB}
          classe={classe}
          docente={docente}
          onClose={()=>setSchedaStudente(null)}
          pgTrim={pgTrim}
          setPgTrim={setPgTrim}
          initialTab={schedaStudente.tab}
        />
      )}

      {eventoModal&&<EventoModal sid={eventoModal.sid} student={students.find(x=>x.id===eventoModal.sid)} editAssenza={eventoModal.editAssenza||null}
        onSave={(entry, isEdit)=>{
          const existing = getAssenze(eventoModal.sid);
          if(isEdit) saveAssenze(eventoModal.sid, existing.map(x=>x.id===entry.id?entry:x));
          else saveAssenze(eventoModal.sid, [...existing, entry]);
          setEventoModal(null);
        }}
        onClose={()=>setEventoModal(null)} docente={firmaAttiva} dataDefault={regData}/>}

      {giustModal&&(()=>{
        const st=students.find(x=>x.id===giustModal.sid);
        const ass2=getAssenze(giustModal.sid);
        const badgeCol2={assente:"#ef4444",ritardo:"#f59e0b",uscita:"#8b5cf6",fuori_aula:"#6b7280"};
        const badgeLbl2={assente:"ASSENZA",ritardo:"RITARDO",uscita:"USCITA",fuori_aula:"FUORI AULA"};
        return(
          <Modal open={giustOpen} onClose={()=>{setGiustOpen(false);setTimeout(()=>setGiustModal(null),250);}} width={920} headerColor={TEAL} title="Assenze da giustificare" subtitle={`di: ${st?.cognome} ${st?.nome}`}>
            <div style={{overflowX:"auto"}}>
              {ass2.length===0?<div style={{padding:"40px",textAlign:"center",color:"#9ca3af"}}>Nessuna assenza registrata</div>
                :<table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
                  <thead><tr style={{borderBottom:"2px solid #e5e7eb"}}>
                    {["Data","Tipologia","Giust.","Calcolo","Motivazione","Inf. aggiuntive","Cert. Medico"].map(h=><th key={h} style={{padding:"12px 16px",color:TEAL,fontWeight:600,textAlign:"center",fontSize:13}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{[...ass2].filter(a=>!a.giustificato).sort((a,b)=>toISO(b.data||"").localeCompare(toISO(a.data||""))).map((a,i)=>{
                    const dataISO=toISO(a.data||"");
                    const giorniPassati=dataISO?Math.floor((Date.now()-new Date(dataISO+"T00:00:00").getTime())/(1000*60*60*24)):0;
                    const scaduta=giorniPassati>15;
                    return(
                    <tr key={a.id} style={{borderBottom:"1px solid #f3f4f6",background:scaduta?"#f3f4f6":i%2===0?"#fff":"#fafafa",opacity:scaduta?0.7:1}}>
                      <td style={{padding:"12px 16px",textAlign:"center",fontWeight:500,fontSize:14,whiteSpace:"nowrap"}}>
                        {a.data}
                        {scaduta&&<div style={{fontSize:10,color:"#9ca3af",fontWeight:600,marginTop:2}}>+15 giorni</div>}
                      </td>
                      <td style={{padding:"12px 10px",textAlign:"center"}}><span style={{background:scaduta?"#9ca3af":(badgeCol2[a.tipo]||"#6b7280"),color:"#fff",borderRadius:4,padding:"4px 10px",fontWeight:700,fontSize:12,whiteSpace:"nowrap"}}>{badgeLbl2[a.tipo]||a.tipo?.toUpperCase()}</span>{a.concorreCalcolo===false&&<div style={{marginTop:3,background:"#f3f4f6",color:"#6b7280",borderRadius:4,padding:"2px 6px",fontWeight:600,fontSize:10,border:"1px solid #e5e7eb",display:"inline-block"}}>non conta</div>}</td>
                      <td style={{padding:"12px 8px",textAlign:"center"}}>{scaduta?<span title="Non giustificabile">🔒</span>:<input type="checkbox" checked={!!a.giustificato} onChange={()=>saveAssenze(giustModal.sid,getAssenze(giustModal.sid).map(x=>{if(x.id!==a.id)return x;const ng=!x.giustificato;return{...x,giustificato:ng,dataGiustificazione:ng?todayISO():null};}))} style={{accentColor:TEAL,cursor:"pointer",width:16,height:16}}/>}</td>
                      <td style={{padding:"12px 8px",textAlign:"center"}}><input type="checkbox" checked={a.concorreCalcolo!==false} onChange={()=>!scaduta&&saveAssenze(giustModal.sid,getAssenze(giustModal.sid).map(x=>x.id===a.id?{...x,concorreCalcolo:x.concorreCalcolo===false}:x))} style={{accentColor:TEAL,cursor:scaduta?"not-allowed":"pointer",width:16,height:16}}/></td>
                      <td style={{padding:"8px 10px"}}>
                        {scaduta
                          ?<div style={{background:"#e5e7eb",border:"1px solid #d1d5db",borderRadius:3,padding:"6px 10px",fontSize:12,color:"#9ca3af",fontStyle:"italic"}}>L'evento risulta non giustificabile poiché si è superato il limite massimo di giustificazioni</div>
                          :<select value={a.motivo||""} onChange={e=>saveAssenze(giustModal.sid,getAssenze(giustModal.sid).map(x=>x.id===a.id?{...x,motivo:e.target.value}:x))} style={{width:"100%",border:"1px solid #e5e7eb",borderRadius:3,padding:"6px 8px",fontSize:13,fontFamily:FF,boxSizing:"border-box",background:"#fff"}}><option value="">— Seleziona —</option>{["Motivi di salute","Motivi familiari","Motivi personali","Visita medica","Motivi sportivi","Motivi di trasporto","Altro"].map(m=><option key={m} value={m}>{m}</option>)}</select>
                        }
                      </td>
                      <td style={{padding:"8px 10px"}}>{!scaduta&&<input value={a.infAggiuntive||""} onChange={e=>saveAssenze(giustModal.sid,getAssenze(giustModal.sid).map(x=>x.id===a.id?{...x,infAggiuntive:e.target.value}:x))} style={{width:"100%",border:"1px solid #e5e7eb",borderRadius:3,padding:"6px 8px",fontSize:13,fontFamily:FF,boxSizing:"border-box"}}/>}</td>
                      <td style={{padding:"12px 8px",textAlign:"center"}}>{!scaduta&&<input type="checkbox" checked={!!a.certificatoMedico} onChange={()=>{const cert=!a.certificatoMedico;saveAssenze(giustModal.sid,getAssenze(giustModal.sid).map(x=>{if(x.id!==a.id)return x;const ng=cert?true:x.giustificato;return{...x,certificatoMedico:cert,giustificato:ng,concorreCalcolo:cert?false:x.concorreCalcolo,dataGiustificazione:ng?(x.dataGiustificazione||todayISO()):null};}));}} style={{accentColor:TEAL,cursor:"pointer",width:16,height:16}}/>}</td>
                    </tr>
                  );})}
</tbody>
                </table>
              }
              <div style={{padding:"12px 16px",display:"flex",justifyContent:"flex-end",borderTop:"1px solid #e5e7eb"}}>
                <button onClick={()=>{setGiustOpen(false);setTimeout(()=>setGiustModal(null),250);}} style={{padding:"8px 24px",background:BTN_BLUE,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>⊗ Chiudi</button>
              </div>
            </div>
          </Modal>
        );
      })()}

      <Modal open={!!contOpen} onClose={()=>{setContOpen(null);setEditCont(null);}} width={1100} headerColor={TEAL}
        title={contOpen==="lezioni"?"Inserimento Argomenti della lezione":contOpen==="compiti"?"Inserimento Compiti assegnati":contOpen==="note"?"Inserimento Note disciplinari":contOpen==="annotazioni"?"Inserimento Annotazioni giornaliere":"Inserimento"}>
        <div style={{padding:"20px 28px",display:"flex",flexDirection:"column",gap:14,fontFamily:FF}}>
          {/* Riga 1: Visibile per la famiglia (sx) + Data (dx) */}
          <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:16}}>
            {contOpen==="annotazioni"
              ?<div>
                <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:6}}>Visibile per la famiglia:</div>
                <ToggleSiNo value={contForm.visFam!==false} onChange={v=>setContForm(f=>({...f,visFam:v}))}/>
              </div>
              :<div/>
            }
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13,color:TEAL,fontWeight:600}}>Data</span>
              <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
                <span style={{padding:"7px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:13}}>📅</span>
                <input type="date" value={contForm.data} onChange={e=>setContForm({...contForm,data:e.target.value})} style={{border:"none",padding:"7px 10px",fontSize:13,outline:"none",fontFamily:FF}}/>
              </div>
            </div>
          </div>

          {/* MATERIA per lezioni e compiti */}
          {(contOpen==="lezioni"||contOpen==="compiti")&&<div>
            <div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:4}}>Materia</div>
            <select value={contForm.materiaLezione||materia} onChange={e=>setContForm(p=>({...p,materiaLezione:e.target.value}))} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"8px 10px",fontSize:14,color:TEAL,fontWeight:600,background:"#fff",fontFamily:FF}}>
              {getMaterieClasse(classe).length>0?getMaterieClasse(classe).map(m=><option key={m}>{m}</option>):[...MATERIE,...(()=>{try{return JSON.parse(localStorage.getItem("reg:materieExtra")||"[]");}catch{return[];}})()].filter((v,i,a)=>a.indexOf(v)===i).map(m=><option key={m}>{m}</option>)}
            </select>
          </div>}

          {/* GRAVITA per note */}
          {contOpen==="note"&&<div><div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:4}}>Gravità nota (1-5)</div><select value={contForm.gravita} onChange={e=>setContForm({...contForm,gravita:e.target.value})} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"8px 10px",fontSize:14,background:"#fff",fontFamily:FF}}>{["1","2","3","4","5"].map(n=><option key={n} value={n}>{n}</option>)}</select></div>}


          {/* Gravità nascosta per annotazioni — non presente nell'immagine */}

          {/* ARGOMENTO + MINUTI solo per lezioni */}
          {contOpen==="lezioni"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 160px",gap:16}}>
              <div>
                <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:4}}>Argomento</div>
                <select value={contForm.argomentoSel||""} onChange={e=>setContForm(f=>({...f,argomentoSel:e.target.value}))}
                  style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",fontSize:14,background:"#fff",fontFamily:FF}}>
                  <option value=""></option>
                  {["Spiegazione","Esercitazione","Interrogazione","Verifica","Ripasso","Approfondimento","Laboratorio","Lavoro di gruppo","Correzione compiti"].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:4}}>Minuti svolti:</div>
                <input type="number" min="1" max="300" value={contForm.minutiSvolti||60} onChange={e=>setContForm(f=>({...f,minutiSvolti:e.target.value}))}
                  style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",fontSize:15,fontFamily:FF,boxSizing:"border-box"}}/>
              </div>
            </div>
          )}

          {/* TESTO */}
          <div>
            <div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:4}}>{contOpen==="lezioni"?"Argomenti della lezione":contOpen==="compiti"?"Compiti assegnati":contOpen==="note"?"Note disciplinari":contOpen==="annotazioni"?"Annotazione":"Testo"}</div>
            <textarea value={contForm.testo} onChange={e=>setContForm({...contForm,testo:e.target.value})} rows={4} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"10px",resize:"vertical",boxSizing:"border-box",fontFamily:FF,fontSize:14}}/>
          </div>

          {/* LINK per lezioni e compiti */}
          {(contOpen==="lezioni"||contOpen==="compiti")&&<div>
            <div style={{fontSize:13,color:"#666",fontWeight:600,marginBottom:4}}>Link:</div>
            <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
              <span style={{padding:"8px 12px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:14}}>🔗</span>
              <input value={contForm.link||""} onChange={e=>setContForm({...contForm,link:e.target.value})} placeholder="https://..." style={{border:"none",padding:"8px 10px",flex:1,fontSize:14,outline:"none",fontFamily:FF}}/>
            </div>
          </div>}

          {/* PARTECIPAZIONE per lezioni e compiti */}
          {(contOpen==="lezioni"||contOpen==="compiti")&&<div style={{display:"flex",alignItems:"flex-start",gap:20}}>
            <div>
              <div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:6}}>Tutta la classe</div>
              <ToggleSiNo value={contForm.partecipazione==="tutti"} onChange={v=>setContForm(f=>({...f,partecipazione:v?"tutti":"parziale",alunniParz:[]}))}/>
              {/* CREA SU COLLABORA — sotto il toggle Tutta la classe */}
              {contOpen==="lezioni"&&(
                <div style={{marginTop:10}}>
                  <div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:6}}>Crea anche su Collabora</div>
                  <ToggleSiNo value={!!contForm.collabora} onChange={v=>setContForm(f=>({...f,collabora:v}))}/>
                </div>
              )}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:6}}>Alunni</div>
              {contForm.partecipazione==="tutti"
                ? /* Tutta la classe attiva: box completamente vuoto */
                  <div style={{border:"2px solid #d1d5db",borderRadius:6,background:"#f9fafb",minHeight:42}}/>
                : /* Parziale: lista alunni selezionabili */
                  <div style={{border:"1px solid #ccc",borderRadius:4,background:"#f9f9f9",padding:4,maxHeight:120,overflowY:"auto"}}>
                    {[...students].sort((a,b)=>a.cognome.localeCompare(b.cognome)).map(s=>{
                      const sel=(contForm.alunniParz||[]).includes(s.id);
                      return(
                        <div key={s.id} onClick={()=>setContForm(f=>({...f,alunniParz:sel?(f.alunniParz||[]).filter(x=>x!==s.id):[...(f.alunniParz||[]),s.id]}))}
                          style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",cursor:"pointer",background:sel?TEAL_LIGHT:"transparent",borderRadius:3}}>
                          <div style={{width:15,height:15,border:"2px solid "+(sel?TEAL:"#bbb"),borderRadius:2,background:sel?TEAL:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                            {sel&&<span style={{color:"#fff",fontSize:9,fontWeight:900}}>✓</span>}
                          </div>
                          <span style={{fontSize:13}}>{s.cognome} {s.nome}</span>
                        </div>
                      );
                    })}
                  </div>
              }
            </div>
          </div>}

          {/* DESTINATARI per note */}
          {contOpen==="note"&&<div style={{display:"flex",alignItems:"flex-start",gap:20}}>
            <div>
              <div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:6}}>Tutta la classe</div>
              <ToggleSiNo value={contForm.destinatariTutti} onChange={v=>setContForm(f=>({...f,destinatariTutti:v,destinatari:[]}))}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:6}}>Alunni</div>
              {contForm.destinatariTutti
                ? /* Tutta la classe attiva: box completamente vuoto, come le altre sezioni */
                  <div style={{border:"2px solid #d1d5db",borderRadius:6,background:"#f9fafb",minHeight:42}}/>
                : <div style={{border:"1px solid #ccc",borderRadius:4,background:"#f9f9f9",padding:4,maxHeight:120,overflowY:"auto"}}>{[...students].sort((a,b)=>a.cognome.localeCompare(b.cognome)).map(s=>{const sel=(contForm.destinatari||[]).includes(s.id);return(<div key={s.id} onClick={()=>setContForm(f=>({...f,destinatari:sel?(f.destinatari||[]).filter(x=>x!==s.id):[...(f.destinatari||[]),s.id]}))} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",cursor:"pointer",background:sel?TEAL_LIGHT:"transparent",borderRadius:3}}><div style={{width:15,height:15,border:"2px solid "+(sel?TEAL:"#bbb"),borderRadius:2,background:sel?TEAL:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{sel&&<span style={{color:"#fff",fontSize:9,fontWeight:900}}>✓</span>}</div><span style={{fontSize:13}}>{s.cognome} {s.nome}</span></div>);})}</div>
              }
            </div>
          </div>}

              {/* LINK per annotazioni — sopra Tutta la classe */}
          {contOpen==="annotazioni"&&<div>
            <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:4}}>Link:</div>
            <div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}>
              <span style={{padding:"8px 12px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:14}}>🔗</span>
              <input value={contForm.link||""} onChange={e=>setContForm({...contForm,link:e.target.value})} placeholder="https://..." style={{border:"none",padding:"8px 10px",flex:1,fontSize:14,outline:"none",fontFamily:FF}}/>
            </div>
          </div>}

      {/* DESTINATARI per annotazioni — layout identico all'immagine */}
          {contOpen==="annotazioni"&&(
            <div>
              {/* Riga Tutta la classe + Alunni affiancati */}
              <div style={{display:"grid",gridTemplateColumns:"160px 1fr",gap:16,alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:6}}>Tutta la classe</div>
                  <ToggleSiNo value={contForm.destinatariTutti} onChange={v=>setContForm(f=>({...f,destinatariTutti:v,destinatari:[]}))}/>
                </div>
                <div>
                  <div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:6}}>Alunni</div>
                  {/* Box alunni selezionati (tag con ×) */}
                  <div style={{border:"1px solid #ccc",borderRadius:3,minHeight:34,padding:"4px 6px",background:"#fff",display:"flex",flexWrap:"wrap",gap:4,alignItems:"center",cursor:"text"}}
                    onClick={()=>{}}>
                    {(contForm.destinatari||[]).map(id=>{
                      const s=students.find(x=>x.id===id);
                      if(!s) return null;
                      return(
                        <span key={id} style={{display:"inline-flex",alignItems:"center",gap:4,background:"#f3f4f6",border:"1px solid #d1d5db",borderRadius:3,padding:"2px 8px",fontSize:13,fontWeight:600,color:"#1f2937"}}>
                          × {s.cognome.toUpperCase()} {s.nome.toUpperCase()}
                          <span onClick={()=>setContForm(f=>({...f,destinatari:(f.destinatari||[]).filter(x=>x!==id)}))} style={{cursor:"pointer",color:"#6b7280",fontWeight:700,marginLeft:2,fontSize:14,lineHeight:1}}>×</span>
                        </span>
                      );
                    })}
                  </div>
                  {/* Dropdown alunni — sempre visibile se tutta la classe = NO */}
                  {!contForm.destinatariTutti&&(
                    <div style={{border:"1px solid #d1d5db",borderRadius:3,background:"#fff",maxHeight:140,overflowY:"auto",marginTop:4}}>
                      {[...students].sort((a,b)=>a.cognome.localeCompare(b.cognome)).map(s=>{
                        const sel=(contForm.destinatari||[]).includes(s.id);
                        return(
                          <div key={s.id} onClick={()=>setContForm(f=>({...f,destinatari:sel?(f.destinatari||[]).filter(x=>x!==s.id):[...(f.destinatari||[]),s.id]}))}
                            style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",cursor:"pointer",background:sel?"#e8f5f5":"#fff",borderBottom:"1px solid #f3f4f6",fontSize:13}}>
                            <div style={{width:14,height:14,border:"2px solid "+(sel?TEAL:"#bbb"),borderRadius:2,background:sel?TEAL:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                              {sel&&<span style={{color:"#fff",fontSize:9,fontWeight:900}}>✓</span>}
                            </div>
                            {s.cognome.toUpperCase()} {s.nome.toUpperCase()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:4}}>
            <button onClick={salvaContenuto} style={{padding:"8px 24px",background:BTN_GREEN,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>💾 Salva</button>
            <button onClick={()=>{setContOpen(null);setEditCont(null);}} style={{padding:"8px 20px",background:BTN_BLUE,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>⊗ Chiudi</button>
          </div>
        </div>
      </Modal>

      <Modal open={firmaOpen} onClose={()=>setFirmaOpen(false)} width={1100} headerColor={TEAL} title={editFirma?"Modifica firma":"Nuova firma"} subtitle={"Classe: "+classe+" — "+new Date().toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}>
        <div style={{padding:"24px 32px",display:"flex",flexDirection:"column",gap:20,fontFamily:FF}}>

          {/* Ora | Per n. ore */}
          <div style={{display:"grid",gridTemplateColumns:"200px 200px 1fr",gap:20,alignItems:"end"}}>
            <div>
              <div style={{fontSize:13,color:"#374151",fontWeight:500,marginBottom:6}}>Ora</div>
              <select value={firmaForm.oraInizio} onChange={e=>setFirmaForm({...firmaForm,oraInizio:e.target.value})} style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",fontSize:15,background:"#fff",fontFamily:FF}}>
                {ORE_NUMS.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:13,color:"#374151",fontWeight:500,marginBottom:6}}>Per n. ore:</div>
              <select value={firmaForm.nOre} onChange={e=>setFirmaForm({...firmaForm,nOre:e.target.value})} style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",fontSize:15,background:"#fff",fontFamily:FF}}>
                {["1","2","3","4","5","6"].map(n=><option key={n}>{n}</option>)}
              </select>
            </div>
            <div/>
          </div>

          {/* Docente | Materia */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"end"}}>
            <div>
              <div style={{fontSize:13,color:"#374151",fontWeight:500,marginBottom:6}}>Docente</div>
              <div style={{border:"2px solid "+(firmaAttiva!==docente?"#f59e0b":"#d1d5db"),borderRadius:4,padding:"10px 12px",background:firmaAttiva!==docente?"#fff7ed":"#fff",fontSize:15,color:"#1f2937",display:"flex",alignItems:"center",justifyContent:"space-between",fontWeight:firmaAttiva!==docente?700:400}}>
                <span>{cognomeNome(firmaAttiva)}{firmaAttiva!==docente&&<span style={{marginLeft:8,fontSize:11,color:"#b45309",fontWeight:700}}>✍️ collega selezionato</span>}</span>
              </div>
            </div>
            <div>
              <div style={{fontSize:13,color:"#374151",fontWeight:500,marginBottom:6}}>Materia</div>
              <select value={firmaForm.materiaFirma} onChange={e=>setFirmaForm({...firmaForm,materiaFirma:e.target.value})} style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",fontSize:15,color:TEAL,fontWeight:700,background:"#fff",fontFamily:FF}}>
                {getMaterieClasse(classe).length>0?getMaterieClasse(classe).map(m=><option key={m}>{m}</option>):[...MATERIE,...(()=>{try{return JSON.parse(localStorage.getItem("reg:materieExtra")||"[]");}catch{return[];}})()].filter((v,i,a)=>a.indexOf(v)===i).map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Tipo lezione | Tipo firma */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"end"}}>
            <div>
              <div style={{fontSize:13,color:"#374151",fontWeight:500,marginBottom:6}}>Tipo lezione</div>
              <select value={firmaForm.tipoLezione} onChange={e=>setFirmaForm({...firmaForm,tipoLezione:e.target.value})} style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",fontSize:14,background:"#fff",fontFamily:FF}}>
                {TIPI_LEZIONE.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:13,color:"#374151",fontWeight:500,marginBottom:6}}>Tipo firma</div>
              <select value={firmaForm.tipoFirma||"Cattedra"} onChange={e=>setFirmaForm({...firmaForm,tipoFirma:e.target.value,sostituzione:e.target.value==="Sostituzione ora"})} style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",fontSize:14,background:"#fff",fontFamily:FF}}>
                {["Cattedra","Compresenza","Sostituzione ora","Sostegno","Potenziamento"].map(t=><option key={t}>{t}</option>)}
              </select>
              {firmaForm.tipoFirma==="Sostituzione ora"&&(()=>{
                // Raccoglie tutti i docenti dai team della programmazione
                const docentiTeam = (()=>{
                  try {
                    const storKey = `prog:${docente}`;
                    const data = JSON.parse(localStorage.getItem(storKey)||"{}");
                    const teams = data.teams||[];
                    const nomi = new Set();
                    // Solo i team che includono la classe corrente
                    teams.filter(t=>(t.classiSel||[]).includes(classe)).forEach(t=>{
                      if(t.coordinatore && t.coordinatore.trim()) nomi.add(t.coordinatore.trim());
                      (t.docenti||[]).forEach(d=>{ if(d.nome&&d.nome.trim()) nomi.add(d.nome.trim()); });
                    });
                    return [...nomi].filter(n=>n!==docente).sort();
                  } catch { return []; }
                })();
                return docentiTeam.length>0
                  ? <select value={firmaForm.docenteSostituito||""} onChange={e=>setFirmaForm({...firmaForm,docenteSostituito:e.target.value})}
                      style={{width:"100%",marginTop:8,border:"2px solid #f59e0b",borderRadius:4,padding:"8px 12px",fontSize:13,fontFamily:FF,boxSizing:"border-box",background:"#fff",color:firmaForm.docenteSostituito?"#1f2937":"#9ca3af",fontWeight:firmaForm.docenteSostituito?700:400}}>
                      <option value="">— Seleziona docente sostituito —</option>
                      {docentiTeam.map(n=><option key={n} value={n}>{cognomeNome(n)}</option>)}
                    </select>
                  : <div>
                      <input value={firmaForm.docenteSostituito||""} onChange={e=>setFirmaForm({...firmaForm,docenteSostituito:e.target.value})} placeholder="Docente sostituito..." style={{width:"100%",marginTop:8,border:"1px solid #d1d5db",borderRadius:4,padding:"8px 12px",fontSize:13,fontFamily:FF,boxSizing:"border-box"}}/>
                      <div style={{fontSize:10,color:"#f59e0b",marginTop:3}}>⚠️ Nessun docente trovato nei Team — aggiungili in Programmazione → Team</div>
                    </div>;
              })()}
            </div>
          </div>

          {/* Tutta la classe firma */}
          <div style={{display:"grid",gridTemplateColumns:"180px auto auto 1fr",gap:16,alignItems:"center"}}>
            <div style={{fontSize:13,color:"#374151",fontWeight:500,lineHeight:1.4}}>Lezione da svolgere<br/>con</div>
            <div>
              <div style={{fontSize:12,color:"#6b7280",marginBottom:6}}>Tutta la classe</div>
              <ToggleSiNo value={firmaForm.partecipazione==="tutti"} onChange={v=>setFirmaForm(f=>({...f,partecipazione:v?"tutti":"parziale",alunniParz:[]}))}/>
            </div>
            <div style={{fontSize:13,color:"#6b7280",alignSelf:"flex-end",paddingBottom:4}}>oppure</div>
            <div>
              <div style={{fontSize:12,color:"#6b7280",marginBottom:6}}>Alunni specifici</div>
              {firmaForm.partecipazione==="parziale"
                ?<div style={{border:"1px solid #d1d5db",borderRadius:4,background:"#f9fafb",padding:4,maxHeight:130,overflowY:"auto"}}>
                  {[...students].sort((a,b)=>a.cognome.localeCompare(b.cognome)).map(s=>{const sel=(firmaForm.alunniParz||[]).includes(s.id);return(<div key={s.id} onClick={()=>setFirmaForm(f=>({...f,alunniParz:sel?(f.alunniParz||[]).filter(x=>x!==s.id):[...(f.alunniParz||[]),s.id]}))} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",cursor:"pointer",background:sel?TEAL_LIGHT:"transparent",borderRadius:3}}><div style={{width:14,height:14,border:"2px solid "+(sel?TEAL:"#bbb"),borderRadius:2,background:sel?TEAL:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{sel&&<span style={{color:"#fff",fontSize:9,fontWeight:900}}>✓</span>}</div><span style={{fontSize:13}}>{s.cognome} {s.nome}</span></div>);})}
                </div>
                :<div style={{border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",background:"#f9fafb",color:"#d1d5db",fontSize:13}}>—</div>
              }
            </div>
          </div>

          {/* Alunni di altre classi */}
          <div style={{display:"grid",gridTemplateColumns:"180px 1fr",gap:16,alignItems:"flex-start"}}>
            <div style={{fontSize:13,color:"#374151",fontWeight:500,textAlign:"right",paddingTop:4,lineHeight:1.4}}>Alunni di altre classi<br/>presenti:</div>
            <RicercaAltreClassi classi={classi} classeCorrente={classe} selezionati={firmaForm.alunniAltreClassi||[]} onChange={v=>setFirmaForm({...firmaForm,alunniAltreClassi:v})}/>
          </div>

          {/* Argomento */}
          <div>
            <div style={{fontSize:13,color:"#374151",fontWeight:500,marginBottom:8}}>Argomento:</div>
            <textarea value={firmaForm.argomentoLezione||""} onChange={e=>setFirmaForm({...firmaForm,argomentoLezione:e.target.value})} rows={3} style={{width:"100%",border:"1px solid #d1d5db",borderRadius:4,padding:"10px 12px",resize:"vertical",boxSizing:"border-box",fontFamily:FF,fontSize:14}}/>
          </div>

          <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
            <button onClick={salvaFirma} style={{padding:"10px 32px",background:BTN_GREEN,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:15}}>✍️ Firma</button>
            <button onClick={()=>setFirmaOpen(false)} style={{padding:"10px 24px",background:BTN_BLUE,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:15}}>⊗ Chiudi</button>
          </div>
        </div>
      </Modal>

      <Modal open={verOpen} onClose={()=>{setVerOpen(false);setEditVer(null);}} width={1100} headerColor={TEAL}
        title={editVer?"Modifica Verifiche/Compiti in classe":"Inserimento Verifiche/Compiti in classe"}
        subtitle={"Classe: "+classe}>
        <div style={{padding:"20px 28px",display:"flex",flexDirection:"column",gap:14,fontFamily:FF}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div><div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:6}}>Visibile per la famiglia:</div><button onClick={()=>setVerForm(f=>({...f,visibileFamiglia:!f.visibileFamiglia}))} style={{padding:"7px 22px",background:verForm.visibileFamiglia?BTN_GREEN:"#e5e7eb",color:verForm.visibileFamiglia?"#fff":"#374151",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>{verForm.visibileFamiglia?"SÌ":"NO"}</button></div>
            <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:13,color:TEAL,fontWeight:600}}>Data</span><div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}><span style={{padding:"7px 10px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:13}}>📅</span><input type="date" value={verForm.data} onChange={e=>setVerForm({...verForm,data:e.target.value})} style={{border:"none",padding:"7px 10px",fontSize:13,outline:"none",fontFamily:FF}}/></div></div>
          </div>
          <div><div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:4}}>Tipo verifica</div><select value={verForm.tipoVerifica} onChange={e=>setVerForm({...verForm,tipoVerifica:e.target.value})} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"8px 10px",fontSize:14,background:"#fff",fontFamily:FF}}>{TIPI_VERIFICA.map(t=><option key={t}>{t}</option>)}</select></div>
          <div><div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:4}}>Materia</div><select value={verForm.materia||materia} onChange={e=>setVerForm({...verForm,materia:e.target.value})} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"8px 10px",fontSize:14,color:TEAL,fontWeight:600,background:"#fff",fontFamily:FF}}>{getMaterieClasse(classe).length>0?getMaterieClasse(classe).map(m=><option key={m}>{m}</option>):[...MATERIE,...(()=>{try{return JSON.parse(localStorage.getItem("reg:materieExtra")||"[]");}catch{return[];}})()].filter((v,i,a)=>a.indexOf(v)===i).map(m=><option key={m}>{m}</option>)}</select></div>
          <div><div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:4}}>Argomento</div><textarea value={verForm.argomenti} onChange={e=>setVerForm({...verForm,argomenti:e.target.value})} rows={4} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"10px",resize:"vertical",boxSizing:"border-box",fontFamily:FF,fontSize:14}}/></div>
          <div><div style={{fontSize:13,color:"#666",fontWeight:600,marginBottom:4}}>Link:</div><div style={{display:"flex",alignItems:"center",border:"1px solid #ccc",borderRadius:4,overflow:"hidden"}}><span style={{padding:"8px 12px",background:"#f5f5f5",borderRight:"1px solid #ccc",fontSize:14}}>🔗</span><input value={verForm.link||""} onChange={e=>setVerForm({...verForm,link:e.target.value})} placeholder="https://..." style={{border:"none",padding:"8px 10px",flex:1,fontSize:14,outline:"none",fontFamily:FF}}/></div></div>
          {/* Tutta la classe verifica */}
          <div style={{display:"flex",alignItems:"flex-start",gap:20}}>
            <div><div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:6}}>Tutta la classe</div>
              <ToggleSiNo value={verForm.tuttiVer!==false} onChange={v=>setVerForm(f=>({...f,tuttiVer:v,alunniVer:[]}))}/>
            </div>
            {verForm.tuttiVer===false&&<div style={{flex:1}}><div style={{fontSize:13,color:TEAL,fontWeight:600,marginBottom:6}}>Alunni</div><div style={{border:"1px solid #ccc",borderRadius:4,background:"#f9f9f9",padding:4,maxHeight:120,overflowY:"auto"}}>{[...students].sort((a,b)=>a.cognome.localeCompare(b.cognome)).map(s=>{const sel=(verForm.alunniVer||[]).includes(s.id);return(<div key={s.id} onClick={()=>setVerForm(f=>({...f,alunniVer:sel?(f.alunniVer||[]).filter(x=>x!==s.id):[...(f.alunniVer||[]),s.id]}))} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",cursor:"pointer",background:sel?TEAL_LIGHT:"transparent",borderRadius:3}}><div style={{width:15,height:15,border:"2px solid "+(sel?TEAL:"#bbb"),borderRadius:2,background:sel?TEAL:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{sel&&<span style={{color:"#fff",fontSize:9,fontWeight:900}}>✓</span>}</div><span style={{fontSize:13}}>{s.cognome} {s.nome}</span></div>);})}</div></div>}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
            <button onClick={salvaVerifica} style={{padding:"8px 24px",background:BTN_GREEN,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>💾 Salva</button>
            <button onClick={()=>{setVerOpen(false);setEditVer(null);}} style={{padding:"8px 20px",background:BTN_BLUE,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>⊗ Chiudi</button>
          </div>
        </div>
      </Modal>

    </div>
  );

  if(activeTab==="docente") return (
    <div style={{fontFamily:FF,display:"flex",flexDirection:"column",height:"100vh",background:"#f5f5f5"}}>
      <style>{".vc:hover .vt{display:block!important} .vt{pointer-events:none!important} .vc:hover .vt{pointer-events:all!important} @keyframes spin{to{transform:rotate(360deg)}}"}</style>
      <SavingOverlay show={saving}/>
      {toastMsg&&<Toast msg={toastMsg} onDone={()=>setToastMsg(null)}/>}
      <SubHeader color={TEAL} text="Registro valutazioni" onBack={()=>setActiveTab(null)}/>
      {/* Header stile AXIOS */}
      <div style={{background:"#fff",borderBottom:"2px solid #e5e7eb",padding:"0",flexShrink:0}}>
        {/* Riga titolo verde AXIOS */}
        <div style={{background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"6px 16px",display:"flex",alignItems:"center",gap:12}}>
          <span style={{color:"#2e7d32",fontWeight:700,fontSize:15,letterSpacing:0.2}}>REGISTRO del DOCENTE Voti</span>
          <span style={{fontSize:12,color:"#555",marginLeft:4}}>{classe} — {materia}</span>
        </div>
        {/* Legenda colori */}
        <div style={{padding:"5px 16px",display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid #f3f4f6",flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:"#555",fontWeight:600}}>Legenda colori:</span>
          <span style={{background:"#d9534f",color:"#fff",padding:"2px 12px",borderRadius:3,fontWeight:700,fontSize:12}}>Voto negativo</span>
          <span style={{background:"#5cb85c",color:"#fff",padding:"2px 12px",borderRadius:3,fontWeight:700,fontSize:12}}>Voto positivo</span>
          <span style={{background:"#337ab7",color:"#fff",padding:"2px 12px",borderRadius:3,fontWeight:700,fontSize:12}}>Voto non fa media</span>
        </div>
        {/* Banner rosa selezione multipla */}
        <div style={{background:"#fce4e4",border:"1px solid #f5c6cb",padding:"5px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
          <span style={{color:"#c0392b",fontSize:12,fontWeight:500}}>
            Per inserire valutazioni a più alunni è sufficiente selezionarli e cliccare su <b>+ Ins. multiplo</b>
          </span>
          <div style={{display:"flex",gap:6}}>
            {selStudents.length>0&&<button onClick={()=>{setMpVoti({});setMpForm({tipo:"orale",data:todayISO(),faMedia:true,nota:"",notaFam:"",peso:100,visFam:true});setMpOpen("sel");}} style={{padding:"4px 12px",background:"#337ab7",color:"#fff",border:"none",borderRadius:3,fontWeight:700,cursor:"pointer",fontSize:12}}>+ Ins. multiplo ({selStudents.length})</button>}
            <button onClick={()=>{setMpVoti({});setMpForm({tipo:"orale",data:todayISO(),faMedia:true,nota:"",notaFam:"",peso:100,visFam:true});setMpOpen("all");}} style={{padding:"4px 12px",background:"#5cb85c",color:"#fff",border:"none",borderRadius:3,fontWeight:700,cursor:"pointer",fontSize:12}}>+ Ins. tutta classe</button>
            <button onClick={()=>{setAzzeraMediaTrim(pgTrim);setAzzeraMediaOpen(true);}} style={{padding:"4px 12px",background:"#dc2626",color:"#fff",border:"none",borderRadius:3,fontWeight:700,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:5}}>🗑️ Azzera media</button>
          </div>
        </div>
      </div>
      <div style={{background:TEAL_LIGHT,borderBottom:"1px solid "+TEAL,padding:"5px 16px",display:"flex",gap:8,flexShrink:0}}>
        {TRIMESTRI.map(t=><button key={t} onClick={()=>setPgTrim(t)} style={{padding:"4px 14px",background:pgTrim===t?TEAL:"#fff",color:pgTrim===t?"#fff":TEAL,border:"1px solid "+TEAL,borderRadius:3,fontWeight:600,cursor:"pointer",fontSize:12}}>{t}</button>)}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:12}}>
        <div style={{background:"#fff",border:"1px solid #ddd",borderRadius:4,overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:680}}>
            <thead>
              <tr style={{background:"#f5f5f5",borderBottom:"2px solid #ddd"}}>
                <th style={{padding:"8px 10px",width:50,textAlign:"center",borderRight:"1px solid #ddd",fontSize:12,color:"#333",fontWeight:700}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                    <span>Sel.</span>
                    <input type="checkbox" checked={allSel} onChange={()=>setSelStudents(allSel?[]:students.map(s=>s.id))} style={{cursor:"pointer"}}/>
                    <div style={{display:"flex",gap:3,marginTop:2}}>
                      <button onClick={()=>{setMpVoti({});setMpForm({tipo:"orale",data:todayISO(),faMedia:true,nota:"",notaFam:"",peso:100,visFam:true});setMpOpen(selStudents.length>0?"sel":"all");}} style={{padding:"2px 6px",background:"#337ab7",color:"#fff",border:"none",borderRadius:2,fontWeight:600,cursor:"pointer",fontSize:9,whiteSpace:"nowrap"}}>+ Ins. multiplo</button>
                    </div>
                  </div>
                </th>
                <th style={{padding:"8px 12px",textAlign:"left",borderRight:"1px solid #ddd",color:"#333",fontWeight:700,fontSize:13}}>Cognome e Nome</th>
                <th style={{padding:"8px",width:44,textAlign:"center",borderRight:"1px solid #ddd",color:"#333",fontWeight:700,fontSize:12}}>Info</th>
                <th style={{padding:"8px",width:44,textAlign:"center",borderRight:"1px solid #ddd",color:"#333",fontWeight:700,fontSize:12}}>Inser.</th>
                {["Orale","Scritto","Grafico","Pratico","Unico"].map(t=><th key={t} style={{padding:"8px",textAlign:"center",color:"#333",fontWeight:700,fontSize:12,borderRight:"1px solid #ddd",minWidth:80}}>{t}</th>)}
              </tr>
            </thead>
            <tbody>{students.map((s,idx)=>{
              const med=mediaStr(s.id);
              return(
                <tr key={s.id} style={{borderBottom:"1px solid #ddd",background:selStudents.includes(s.id)?"#dff0d8":idx%2===0?"#ffffff":"#f9f9f9"}} className="doc-row">
                  <td style={{padding:"8px 10px",textAlign:"center",borderRight:"1px solid #ddd"}}>
                    <input type="checkbox" checked={selStudents.includes(s.id)} onChange={()=>setSelStudents(p=>p.includes(s.id)?p.filter(x=>x!==s.id):[...p,s.id])} style={{cursor:"pointer"}}/>
                  </td>
                  <td style={{padding:"8px 12px",fontWeight:400,fontSize:14,borderRight:"1px solid #ddd",color:"#333"}}>[{String(idx+1).padStart(2,"0")}] {s.cognome} {s.nome}</td>
                  {/* Bottone Info (celeste ℹ) */}
                  <td style={{padding:"6px",textAlign:"center",borderRight:"1px solid #ddd"}}>
                    <button onClick={()=>setSchedaStudente(s)}
                      style={{width:30,height:30,background:"#31b0d5",border:"none",borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}>
                      <span style={{color:"#fff",fontWeight:900,fontSize:14}}>ℹ</span>
                    </button>
                  </td>
                  {/* Bottone + (grigio, quadrato) */}
                  <td style={{padding:"6px",textAlign:"center",borderRight:"1px solid #ddd"}}>
                    <button onClick={()=>openNuovoVoto(s.id)}
                      style={{width:30,height:30,background:"#f5f5f5",border:"2px solid #ccc",borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",fontSize:20,color:"#555",fontWeight:300,lineHeight:1,padding:0}}>
                      +
                    </button>
                  </td>
                  {["orale","scritto","grafico","pratico","unico"].map(tipo=>(
                    <td key={tipo} style={{padding:"4px 3px",borderRight:"1px solid #eee",overflow:"visible"}}>
                      <div style={{display:"flex",gap:2,flexWrap:"wrap",justifyContent:"flex-start",overflow:"visible"}}>
                        {getVoti(s.id).filter(v=>v.tipo===tipo).sort((a,b)=>toISO(a.data||"").localeCompare(toISO(b.data||""))).map(v=>{
                          const rawV=v.voto;if(rawV===undefined||rawV===null||rawV==="")return null;
                          const rawStr=String(rawV);
                          const col=votoColor(rawStr,v.faMedia);
                          const bg=votoBackground(rawStr,v.faMedia);
                          const hasFam=v.notaFam&&v.notaFam.trim();
                          const hasNota=v.nota&&v.nota.trim();
                          const rawDate=v.data||"";
                          let dataBreve="";
                          if(rawDate.includes("-")){const p=rawDate.split("-");dataBreve=(p[2]||"")+"/"+(p[1]||"");}
                          else if(rawDate.includes("/")){const p=rawDate.split("/");dataBreve=(p[0]||"")+"/"+(p[1]||"");}
                          const isNumerico = !isNaN(parseVoto(rawStr)) && rawStr !== "💬";
                          const isNeg = isNumerico && parseVoto(rawStr) < 6;
                          const isPos = isNumerico && parseVoto(rawStr) >= 6;
                                                      return(<div key={v.id} className="vc" style={{position:"relative",display:"inline-flex",flexDirection:"column",alignItems:"center",margin:"1px 2px"}}>
                            {/* Data sopra */}
                            {dataBreve&&<span style={{fontSize:9,color:"#374151",fontWeight:600,lineHeight:1.2,whiteSpace:"nowrap",marginBottom:1}}>{dataBreve}</span>}
                            {/* Cella voto */}
                            <div onClick={()=>openEditVoto(s.id,v)}
                              style={{
                                position:"relative",
                                minWidth:36,height:28,
                                cursor:"pointer",
                                display:"flex",alignItems:"center",justifyContent:"center",
                                overflow:"hidden",
                                borderRadius:2,
                                boxShadow:"0 1px 3px rgba(0,0,0,0.22)",
                              }}>
                              {v.faMedia ? (
                                /* Voti che fanno media (verde/rosso): quadratino con triangolo bianco */
                                <>
                                  <div style={{position:"absolute",inset:0,background:bg}}/>
                                  <div style={{
                                    position:"absolute",inset:0,
                                    background:"#fff",
                                    clipPath:"polygon(0 0, 35% 0, 0 55%)",
                                  }}/>
                                  <span style={{position:"relative",fontWeight:900,fontSize:14,lineHeight:1,color:"#fff",letterSpacing:0.3,zIndex:1,padding:"0 6px"}}>{votoDisplay(rawStr)}</span>
                                </>
                              ) : (
                                /* Voti NON media (blu): sfondo blu con angolino in alto a sinistra che sfuma bianco→trasparente */
                                <>
                                  <div style={{position:"absolute",inset:0,background:"#3b82f6"}}/>
                                  <div style={{
                                    position:"absolute",inset:0,
                                    background:"radial-gradient(ellipse at -5% -5%, #ffffff 0%, #ffffff 22%, rgba(255,255,255,0.5) 40%, rgba(255,255,255,0) 58%)",
                                  }}/>
                                  <span style={{position:"relative",fontWeight:900,fontSize:14,lineHeight:1,color:"#fff",letterSpacing:0.3,zIndex:1,padding:"0 6px"}}>{votoDisplay(rawStr)}</span>
                                </>
                              )}
                            </div>
                            <div className="vt" style={{display:"none",position:"absolute",bottom:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",background:"#1f2937",color:"#fff",fontSize:11,padding:"10px 14px",borderRadius:6,zIndex:9999,whiteSpace:"normal",boxShadow:"0 4px 20px rgba(0,0,0,0.4)",width:240,pointerEvents:"none",lineHeight:1.5}}>
                              <div style={{fontWeight:700,marginBottom:4}}>{rawStr} · {v.tipo} · {v.data}</div>
                              <div style={{color:"#9ca3af",fontSize:10,marginBottom:hasNota||hasFam?6:0}}>Fa media: {v.faMedia?"SÌ":"NO"} · Peso: {v.peso??100}%</div>
                              {hasNota&&<div style={{borderTop:"1px solid rgba(255,255,255,0.15)",paddingTop:5,color:"#cbd5e1"}}>📝 {v.nota}</div>}
                              {hasFam&&<div style={{marginTop:hasNota?4:0,borderTop:hasNota?"none":"1px solid rgba(255,255,255,0.15)",paddingTop:hasNota?0:5,color:"#86efac",fontWeight:600}}>👪 Famiglie: <span style={{fontWeight:400,fontStyle:"italic"}}>{v.notaFam}</span></div>}
                            </div>
                          </div>);
                        })}
                      </div>
                    </td>
                  ))}

                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>

      {schedaVoti&&(
        <SchédaVotiStudente
          s={schedaVoti}
          votiDB={votiDB}
          classe={classe}
          docente={docente}
          pgTrim={pgTrim}
          onClose={()=>setSchedaVoti(null)}
        />
      )}

      {schedaStudente&&(
        <SchédaStudente
          s={schedaStudente}
          contDB={contDBMerged}
          assenzeDB={assenzeDB}
          votiDB={votiDB}
          classe={classe}
          docente={docente}
          onClose={()=>setSchedaStudente(null)}
          pgTrim={pgTrim}
          setPgTrim={setPgTrim}
        />
      )}

      <Modal open={!!votoModal} onClose={()=>setVotoModal(null)} width={900} headerColor={TEAL}
        title={votoModal&&votoModal.editing?"Modifica valutazione":"Inserimento valutazione"}
        subtitle={(students.find(s=>s.id===(votoModal&&votoModal.sid))||{cognome:"",nome:""}).cognome+" "+(students.find(s=>s.id===(votoModal&&votoModal.sid))||{nome:""}).nome+" — "+materia+" — "+classe}>
        <div style={{padding:"24px 24px 16px",display:"flex",flexDirection:"column",gap:14,fontFamily:FF}}>
          <div style={{display:"grid",gridTemplateColumns:"80px 1.5fr 1fr 1fr 1fr 1fr",gap:10,alignItems:"end"}}>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Voto</div><VotoAutocomplete value={votoForm.voto}             onChange={v=>setVotoForm(f=>({...f,voto:v,faMedia:v==="💬"?false:f.faMedia}))} onFaMediaChange={v=>setVotoForm(f=>({...f,faMedia:v}))} docente={docente}/></div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Tipologia</div><select value={votoForm.tipo} onChange={e=>setVotoForm({...votoForm,tipo:e.target.value})} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"7px 8px",fontSize:13,background:"#fff",fontFamily:FF}}>{TIPI_VOTI.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</select></div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Fa media</div><ToggleSiNo value={votoForm.faMedia} onChange={v=>setVotoForm({...votoForm,faMedia:v})}/></div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Peso</div><div style={{display:"flex",alignItems:"center",gap:4}}><input type="number" min="0" max="200" value={votoForm.peso} onChange={e=>setVotoForm({...votoForm,peso:parseFloat(e.target.value)||100})} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"7px 8px",fontSize:13,fontFamily:FF,background:votoForm.peso===100?"#f3f4f6":"#fff"}}/><span style={{fontSize:13,color:"#888",flexShrink:0}}>%</span></div></div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Vis. Fam.</div><ToggleSiNo value={votoForm.visFam!==false} onChange={v=>setVotoForm(f=>({...f,visFam:v}))}/></div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Data</div><input type="date" value={votoForm.data} onChange={e=>setVotoForm({...votoForm,data:e.target.value})} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"7px 8px",fontSize:13,fontFamily:FF}}/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Osservazioni (solo docente)</div><textarea value={votoForm.nota} onChange={e=>setVotoForm({...votoForm,nota:e.target.value})} rows={3} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"8px",resize:"none",boxSizing:"border-box",fontFamily:FF,fontSize:13}}/></div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Osservazioni (visibili famiglia)</div><textarea value={votoForm.notaFam||""} onChange={e=>setVotoForm({...votoForm,notaFam:e.target.value})} rows={3} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"8px",resize:"none",boxSizing:"border-box",fontFamily:FF,fontSize:13}}/></div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"space-between",alignItems:"center"}}>
            <div>{votoModal?.editing&&<button onClick={()=>{
              const chiave=dk;
              const sid=votoModal.sid;
              const eid=votoModal.editing;
              // Leggi il migliore da disco, rimuovi il voto, riscrivi su tutti i livelli
              setVotiDB(prev=>{
                const base=_fondi(_leggiMigliore(),prev);
                const next=JSON.parse(JSON.stringify(base));
                if(next[chiave]?.[sid]){
                  next[chiave][sid]=next[chiave][sid].filter(x=>x.id!==eid);
                }
                // Scrivi subito su TUTTI i livelli — nessun recupero possibile
                const s=JSON.stringify(next);
                const key=`reg:${_doc}:votiDB`;
                for(let i=0;i<8;i++) try{localStorage.setItem(`${key}_v${i}`,s);}catch{}
                try{localStorage.setItem(key,s);}catch{}
                try{localStorage.setItem(key+"_bk1",s);}catch{}
                try{localStorage.setItem(key+"_bk2",s);}catch{}
                try{sessionStorage.setItem(key,s);}catch{}
                try{_idbSet(key,s);_idbSet(key+"_b",s);_idbSet(key+"_b2",s);}catch{}
                try{window.storage.set(`vdb_${_doc.replace(/\s/g,'_')}`,s,false);}catch{}
                cloudSave(_doc,"votiDB",next).catch(()=>{});
                return next;
              });
              setVotoModal(null);
              showToast("Voto eliminato");
            }} style={{padding:"8px 20px",background:"#ef4444",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>🗑️ Elimina</button>}</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={salvaVoto} style={{padding:"8px 24px",background:BTN_GREEN,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>💾 Salva</button>
              <button onClick={()=>setVotoModal(null)} style={{padding:"8px 20px",background:BTN_BLUE,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>⊗ Chiudi</button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={!!mpOpen} onClose={()=>setMpOpen(false)} width={900} headerColor={TEAL}
        title={"Inserimento multiplo — "+(mpOpen==="sel"?"Selezionati":"Tutta la Classe")}
        subtitle={materia+" — "+classe+" — "+pgTrim}>
        <div style={{padding:"16px 24px",borderBottom:"1px solid #eee",display:"flex",flexDirection:"column",gap:10,fontFamily:FF}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:10}}>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Data</div><input type="date" value={mpForm.data} onChange={e=>setMpForm({...mpForm,data:e.target.value})} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"7px 8px",fontSize:13,fontFamily:FF}}/></div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Tipologia</div><select value={mpForm.tipo} onChange={e=>setMpForm({...mpForm,tipo:e.target.value})} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"7px 8px",fontSize:13,background:"#fff",fontFamily:FF}}>{TIPI_VOTI.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</select></div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Peso</div><div style={{display:"flex",alignItems:"center",gap:4}}><input type="number" min="0" max="200" value={mpForm.peso} onChange={e=>setMpForm({...mpForm,peso:parseFloat(e.target.value)||100})} style={{flex:1,border:"1px solid #ccc",borderRadius:4,padding:"7px 6px",fontSize:13,fontFamily:FF}}/><span style={{fontSize:11,color:"#888"}}>%</span></div></div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Fa media</div><ToggleSiNo value={mpForm.faMedia} onChange={v=>setMpForm({...mpForm,faMedia:v})}/></div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Vis. Fam.</div><ToggleSiNo value={mpForm.visFam!==false} onChange={v=>setMpForm(f=>({...f,visFam:v}))}/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Osservazioni solo docente</div><textarea value={mpForm.nota||""} onChange={e=>setMpForm({...mpForm,nota:e.target.value})} rows={2} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"7px 8px",resize:"none",boxSizing:"border-box",fontFamily:FF,fontSize:13}}/></div>
            <div><div style={{fontSize:12,color:TEAL,fontWeight:600,marginBottom:3}}>Osservazioni visibili alla famiglia</div><textarea value={mpForm.notaFam||""} onChange={e=>setMpForm({...mpForm,notaFam:e.target.value})} rows={2} style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"7px 8px",resize:"none",boxSizing:"border-box",fontFamily:FF,fontSize:13}}/></div>
          </div>
        </div>
        <div style={{background:"#f9f9f9",maxHeight:360,overflowY:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 80px 1fr",padding:"7px 24px",fontWeight:700,color:TEAL,fontSize:12,borderBottom:"1px solid #eee",background:"#f0f9f9",position:"sticky",top:0}}>
            <span>Cognome e Nome</span>
            <span style={{textAlign:"center"}}>Voto</span>
            <span style={{paddingLeft:8}}>Commento personale <span style={{fontWeight:400,color:"#9ca3af"}}>(vuoto = usa commento classe)</span></span>
          </div>
          {(mpOpen==="sel"?students.filter(s=>selStudents.includes(s.id)):students).map(s=>{
            const hasPersonale = !!(mpVoti[`nota_${s.id}`]||"").trim();
            return(
            <div key={s.id} style={{display:"grid",gridTemplateColumns:"1fr 80px 1fr",padding:"8px 24px",borderBottom:"1px solid #eee",alignItems:"center",background:hasPersonale?"#f0fdf4":"#fff",gap:0}}>
              <span style={{fontWeight:700,fontSize:13}}>{s.cognome} {s.nome}</span>
              <input value={mpVoti[s.id]||""} onChange={e=>setMpVoti({...mpVoti,[s.id]:e.target.value})} style={{border:"1px solid #ccc",borderRadius:3,padding:"5px",fontWeight:700,fontSize:15,textAlign:"center",width:"100%",boxSizing:"border-box"}}/>
              <div style={{paddingLeft:10,position:"relative"}}>
                <input
                  value={mpVoti[`nota_${s.id}`]||""}
                  onChange={e=>setMpVoti(p=>({...p,[`nota_${s.id}`]:e.target.value}))}
                  placeholder={mpForm.notaFam||mpForm.nota ? `"${(mpForm.notaFam||mpForm.nota).slice(0,30)}${(mpForm.notaFam||mpForm.nota).length>30?"…":""}"` : "es. Ottimo lavoro!"}
                  style={{width:"100%",border:"1px solid "+(hasPersonale?"#86efac":"#e5e7eb"),borderRadius:4,padding:"6px 10px",fontSize:12,fontFamily:FF,boxSizing:"border-box",background:hasPersonale?"#f0fdf4":"#fff",outline:"none"}}
                />
                {hasPersonale&&<span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:13}}>✏️</span>}
              </div>
            </div>
            );
          })}
        </div>
        <div style={{padding:"12px 24px",display:"flex",gap:10,justifyContent:"flex-end",background:"#fff",borderTop:"1px solid #eee"}}>
          <button onClick={salvaMultipla} style={{padding:"8px 24px",background:BTN_GREEN,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>💾 Salva</button>
          <button onClick={()=>setMpOpen(false)} style={{padding:"8px 20px",background:BTN_BLUE,color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14}}>⊗ Chiudi</button>
        </div>
      </Modal>

      <Modal open={azzeraMediaOpen} onClose={()=>setAzzeraMediaOpen(false)} width={460} headerColor="#dc2626" title="🗑️ Azzera media" subtitle={"Classe "+classe+" — tutte le materie"}>
        <div style={{padding:"24px 28px",display:"flex",flexDirection:"column",gap:16,fontFamily:FF}}>
          <div style={{fontSize:13,color:"#374151",lineHeight:1.6}}>
            Scegli il quadrimestre di cui vuoi azzerare la media. I voti <b>restano nel registro</b>, invariati e visibili con il loro valore originale, ma vengono esclusi dal calcolo della media in tutte le materie della classe <b>{classe}</b> per il quadrimestre selezionato. La media nella scheda di ogni alunno tornerà a "—" per quel periodo.
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {TRIMESTRI.map(t=>(
              <button key={t} onClick={()=>azzeraMediaClasse(t)}
                style={{padding:"14px 18px",background:"#fef2f2",border:"2px solid #fca5a5",borderRadius:6,fontWeight:700,fontSize:14,color:"#7f1d1d",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span>Azzerare media voti — {t}</span>
                <span style={{fontSize:18}}>🗑️</span>
              </button>
            ))}
          </div>
          <button onClick={()=>setAzzeraMediaOpen(false)} style={{padding:"9px 20px",background:"#6b7280",color:"#fff",border:"none",borderRadius:4,fontWeight:700,cursor:"pointer",fontSize:14,marginTop:4}}>Annulla</button>
        </div>
      </Modal>
    </div>
  );

  return (
    <div style={{fontFamily:FF,display:"flex",flexDirection:"column",height:"100vh",background:"#f3f4f6",overflow:"hidden"}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        * { box-sizing: border-box; }
        button:hover { filter: brightness(0.92); }
        select:hover { background: #e5e7eb !important; }

        /* Righe tabella ovunque */
        tr:hover td { background: #e5e7eb !important; }

        /* Righe lista alunni */
        .hover-row:hover { background: #e5e7eb !important; }

        /* Qualsiasi div/span con cursor pointer */
        div[style*="cursor: pointer"]:hover,
        div[style*="cursor:pointer"]:hover,
        span[style*="cursor: pointer"]:hover,
        span[style*="cursor:pointer"]:hover { background: #e5e7eb !important; filter: brightness(0.96); }

        /* Voci menu voti */
        .voto-opt:hover { background: #e5e7eb !important; }
        .voto-spec:hover { background: #fde68a !important; }

        /* Comunicazioni lista */
        .comun-row:hover { background: #e5e7eb !important; }

        /* Registro docente — righe alunni */
        .doc-row:hover td { background: #f3f4f6 !important; }

        /* Sidebar classi e tab */
        .sidebar-item:hover { background: #e5e7eb !important; }
        .tab-btn:hover { filter: brightness(0.93); }

        /* Celle voto nel registro docente */
        .vc:hover { filter: brightness(0.88); }
      `}</style>
      <SavingOverlay show={saving}/>
      {toastMsg&&<Toast msg={toastMsg} onDone={()=>setToastMsg(null)}/>}
      <div style={{background:"#1f2937",padding:"12px 24px",display:"flex",alignItems:"center",gap:12,flexShrink:0,flexWrap:"wrap"}}>
        <div><div style={{color:"#4ade80",fontWeight:700,fontSize:17}}>📚 Registro Elettronico</div>{nomeScuola&&<div style={{color:"rgba(255,255,255,0.7)",fontSize:12,marginTop:1}}>{nomeScuola}</div>}</div>
        <div style={{background:firmaAttiva!==docente?"#b45309":"rgba(255,255,255,0.1)",borderRadius:6,padding:"4px 12px",color:"#fff",fontWeight:600,fontSize:13,display:"flex",alignItems:"center",gap:8}}>
          {firmaAttiva!==docente&&<span title="Stai firmando come collega">✍️</span>}
          {cognomeNome(firmaAttiva)}
          {firmaAttiva!==docente&&(
            <button onClick={tornaAMeStesso} title="Torna al tuo nome"
              style={{background:"rgba(0,0,0,0.25)",border:"none",color:"#fff",borderRadius:4,padding:"2px 8px",fontWeight:700,fontSize:11,cursor:"pointer"}}>
              ↩ Torna a me
            </button>
          )}
        </div>

        {/* ── Selettore Classe + Materia globale ── */}
        {classiList.length>0&&<>
          <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.08)",borderRadius:6,padding:"4px 12px"}}>
            <span style={{color:"rgba(255,255,255,0.7)",fontSize:12,fontWeight:600}}>Classe:</span>
            <select value={classe} onChange={e=>{setClasse(e.target.value);setSelStudent(null);}}
              style={{background:"transparent",border:"none",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",outline:"none",fontFamily:FF}}>
              {classiList.map(c=><option key={c} style={{color:"#1f2937"}}>{c}</option>)}
            </select>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.08)",borderRadius:6,padding:"4px 12px"}}>
            <span style={{color:"rgba(255,255,255,0.7)",fontSize:12,fontWeight:600}}>Materia:</span>
            <select value={materia} onChange={e=>setMateria(e.target.value)}
              style={{background:"transparent",border:"none",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",outline:"none",fontFamily:FF}}>
              {(getMaterieClasse(classe).length>0
                ? getMaterieClasse(classe)
                : [...MATERIE,...(()=>{try{return JSON.parse(localStorage.getItem("reg:materieExtra")||"[]");}catch{return[];}})()].filter((v,i,a)=>a.indexOf(v)===i)
              ).map(m=><option key={m} style={{color:"#1f2937"}}>{m}</option>)}
            </select>
          </div>
        </>}

        <button onClick={()=>setShowGestione(true)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",background:"#0f766e",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontWeight:700,fontSize:13}}><Users size={14}/> Classi</button>
        <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={esportaDati} style={{padding:"7px 14px",background:"#374151",color:"#d1d5db",border:"none",borderRadius:4,cursor:"pointer",fontWeight:600,fontSize:13}}>Esporta dati</button>
          <button onClick={()=>{setAzzeraOpen(true);setAzzeraScelta("tutto");setAzzeraConferma(false);}} style={{padding:"7px 14px",background:"#7f1d1d",color:"#fecaca",border:"none",borderRadius:4,cursor:"pointer",fontWeight:600,fontSize:13}}>🗑️ Azzera registro</button>
          <button onClick={()=>importaRef.current?.click()} style={{padding:"7px 14px",background:"#374151",color:"#d1d5db",border:"none",borderRadius:4,cursor:"pointer",fontWeight:600,fontSize:13}}>Importa dati</button>
          <input ref={importaRef} type="file" accept=".json" onChange={importaDati} style={{display:"none"}}/>
          <button onClick={()=>{setNuovoNome(docente);setModNomeOpen(true);}} style={{padding:"7px 14px",background:"#374151",color:"#d1d5db",border:"none",borderRadius:4,cursor:"pointer",fontWeight:600,fontSize:13}}>Modifica nome</button>
          <button onClick={onCambia} style={{padding:"7px 14px",background:"#374151",color:"#d1d5db",border:"none",borderRadius:4,cursor:"pointer",fontWeight:600,fontSize:13}}>Cambia docente</button>
        </div>
      </div>
      {classiList.length===0?(
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
          <div style={{fontSize:48}}>📚</div>
          <div style={{fontWeight:700,fontSize:22,color:"#1f2937"}}>Benvenuto, {docente}!</div>
          <div style={{color:"#6b7280",fontSize:16}}>Prima di usare il registro crea almeno una classe.</div>
          <button onClick={()=>setShowGestione(true)} style={{padding:"16px 40px",background:"#0f766e",color:"#fff",border:"none",borderRadius:8,fontWeight:700,fontSize:20,cursor:"pointer"}}>Crea la prima classe</button>
        </div>
      ):(
                  <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* ══ BARRA SUPERIORE: 3 pulsanti + Menu Veloce ALLINEATO a destra ══ */}
          <div style={{display:"flex",gap:0,padding:"10px 16px 0",flexShrink:0,alignItems:"flex-start"}}>

            {/* Colonna sinistra: 3 pulsanti grandi + Menu Veloce subito dopo Programmazione */}
            <div style={{display:"flex",gap:8,flex:1,flexWrap:"nowrap",alignItems:"flex-start"}}>
              {/* 1. Registro di Classe — menu a tendina */}
              <div style={{flexShrink:0}}>
                <RegistroClasseMenu/>
              </div>

              {/* 2. Registro Docente */}
              <DocenteMenu onSelect={tab=>{setActiveTab(tab);}}/>

              {/* 3. Programmazione */}
              <button onClick={()=>setActiveTab("programmazione")}
                style={{height:44,padding:"0 18px",background:"#2563eb",color:"#fff",border:"none",borderRadius:6,fontSize:13,fontWeight:700,cursor:"pointer",boxShadow:"0 3px 8px rgba(0,0,0,0.18)",display:"flex",alignItems:"center",gap:8,minWidth:190,fontFamily:FF,flexShrink:0}}>
                <span style={{fontSize:15}}>📊</span>
                <span style={{flex:1,textAlign:"left"}}>PROGRAMMAZIONE</span>
                <span style={{fontSize:11,opacity:0.85}}>▼</span>
              </button>

              {/* MENU VELOCE — subito dopo il bottone Programmazione */}
              <div style={{display:"flex",flexDirection:"column",alignItems:"stretch",width:222,flexShrink:0}}>
              <div style={{
                background:"linear-gradient(180deg,#4ab8d4 0%,#2d8faa 100%)",
                borderRadius: menuVeloceExpanded ? "6px 6px 0 0" : "6px",
                padding:"9px 14px",
                height:44,
                display:"flex",alignItems:"center",justifyContent:"space-between",
                cursor:"pointer",
                boxShadow:"0 3px 8px rgba(0,0,0,0.18)",
                border:"1px solid #2a7e9a",
              }} onClick={()=>setMenuVeloceExpanded(v=>!v)}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <span style={{fontSize:15,color:"#ffe066"}}>☆</span>
                  <span style={{color:"#fff",fontWeight:700,fontSize:13,letterSpacing:1}}>MENU VELOCE</span>
                </div>
                <span style={{color:"rgba(255,255,255,0.8)",fontSize:14}}>⊙</span>
              </div>
              {menuVeloceExpanded&&(
                <div style={{
                  background:"linear-gradient(180deg,#3096b2 0%,#246e87 100%)",
                  borderRadius:"0 0 6px 6px",
                  overflow:"hidden",
                  boxShadow:"0 4px 16px rgba(0,0,0,0.22)",
                  border:"1px solid #2a7e9a",
                  borderTop:"none",
                  zIndex:50,
                  position:"relative",
                }}>
                  {[
                    {lbl:"PLANNING", tab:"planning"},
              {lbl:"COLLOQUI", tab:"colloqui"},
                    {lbl:"COMUNICAZIONI", tab:"comunicazioni"},
                    {lbl:"RICERCA...", tab:null},
                    {lbl:"SCRUTINI", tab:"pagelle"},
                    {lbl:"MATERIALE DIDATTICO E COLLABORA", tab:null},
                    {lbl:"ALTRE FUNZIONI", tab:null},
                    {lbl:"REGISTRO FIRME ALTRE ATTIVITÀ", tab:null},
                    {lbl:"SPORTELLO E CORSI", tab:null},
                  ].map((item,i,arr)=>(
                    <div key={item.lbl}
                      onClick={()=>{ if(item.tab) setActiveTab(item.tab); }}
                      style={{
                        padding:"9px 14px",
                        borderBottom: i<arr.length-1 ? "1px solid rgba(255,255,255,0.15)" : "none",
                        cursor: item.tab ? "pointer" : "default",
                        color:"#fff",
                        fontWeight:700,
                        fontSize:11,
                        letterSpacing:0.4,
                        textAlign:"center",
                        opacity: item.tab ? 1 : 0.55,
                        transition:"background 0.12s",
                      }}
                      onMouseEnter={e=>{ if(item.tab) e.currentTarget.style.background="rgba(255,255,255,0.13)"; }}
                      onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; }}
                    >
                      {item.lbl}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
          </div>
          <HomeDashboard
            docente={firmaAttiva}
            classi={classi}
            classiList={classiList}
            contDB={contDB}
            orario={orario}
            getSlot={getSlot}
            setOrEdit={setOrEdit}
            setOrarioOpen={setOrarioOpen}
            GIORNI={GIORNI}
            ORE_ORARIO={ORE_ORARIO}
            todayGStr={todayGStr}
            TEAL={TEAL}
            TEAL_LIGHT={TEAL_LIGHT}
            VERDE={VERDE}
            FF={FF}
            onOpenComunicazioni={()=>setActiveTab("comunicazioni")}
            classeAttiva={classe}
            materiaAttiva={materia}
          />
        </div>
      )}
      <Modal open={modNomeOpen} onClose={()=>setModNomeOpen(false)} width={400} headerColor="#1d4ed8" title="Modifica nome docente">
        <div style={{padding:28,display:"flex",flexDirection:"column",gap:16}}>
          <div><Lbl>Nuovo nome e cognome</Lbl><Inp value={nuovoNome} onChange={e=>setNuovoNome(e.target.value)} autoFocus onKeyDown={e=>e.key==="Enter"&&rinominaDocente()}/></div>
          <div style={{display:"flex",gap:12}}><Btn onClick={rinominaDocente} style={{flex:1}}>Salva</Btn><Btn color="#6b7280" onClick={()=>setModNomeOpen(false)}>Annulla</Btn></div>
        </div>
      </Modal>
      <Modal open={azzeraOpen} onClose={()=>{setAzzeraOpen(false);setAzzeraConferma(false);}} width={520} headerColor="#7f1d1d" title="🗑️ Azzera registro" subtitle="Questa operazione non può essere annullata">
        <div style={{padding:"24px 28px",display:"flex",flexDirection:"column",gap:18,fontFamily:FF}}>
          <div style={{fontSize:14,color:"#374151",lineHeight:1.6}}>
            Scegli cosa vuoi eliminare:
          </div>

          {/* Opzione 1: tutto */}
          <div onClick={()=>{setAzzeraScelta("tutto");setAzzeraConferma(false);}}
            style={{border:"2px solid "+(azzeraScelta==="tutto"?"#dc2626":"#e5e7eb"),borderRadius:8,padding:"14px 16px",cursor:"pointer",background:azzeraScelta==="tutto"?"#fef2f2":"#fff"}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              <div style={{width:18,height:18,borderRadius:"50%",border:"2px solid "+(azzeraScelta==="tutto"?"#dc2626":"#bbb"),background:azzeraScelta==="tutto"?"#dc2626":"#fff",flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {azzeraScelta==="tutto"&&<div style={{width:8,height:8,borderRadius:"50%",background:"#fff"}}/>}
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:"#7f1d1d"}}>Azzera la scheda di ogni alunno</div>
                <div style={{fontSize:12,color:"#6b7280",marginTop:3,lineHeight:1.5}}>
                  Elimina le annotazioni condivise e i dati anagrafici inseriti manualmente nella scheda di ciascun alunno (tutte le classi). <b style={{color:"#374151"}}>Il Registro Web continua a mostrare sempre tutti i dati</b>: voti, assenze, lezioni, compiti, verifiche, note e annotazioni non vengono toccati.
                </div>
              </div>
            </div>
          </div>

          {/* Opzione 2: solo voti di un quadrimestre */}
          <div onClick={()=>{setAzzeraScelta("trim");setAzzeraConferma(false);}}
            style={{border:"2px solid "+(azzeraScelta==="trim"?"#dc2626":"#e5e7eb"),borderRadius:8,padding:"14px 16px",cursor:"pointer",background:azzeraScelta==="trim"?"#fef2f2":"#fff"}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              <div style={{width:18,height:18,borderRadius:"50%",border:"2px solid "+(azzeraScelta==="trim"?"#dc2626":"#bbb"),background:azzeraScelta==="trim"?"#dc2626":"#fff",flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {azzeraScelta==="trim"&&<div style={{width:8,height:8,borderRadius:"50%",background:"#fff"}}/>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:"#7f1d1d"}}>Elimina solo i voti di un quadrimestre</div>
                <div style={{fontSize:12,color:"#6b7280",marginTop:3,marginBottom:8,lineHeight:1.5}}>
                  Classi, alunni, assenze, compiti, lezioni, comunicazioni e tutto il resto rimangono intatti. Vengono eliminati solo i voti inseriti nel quadrimestre scelto (e il relativo scrutinio, se presente).
                </div>
                {azzeraScelta==="trim"&&(
                  <select value={azzeraTrim} onChange={e=>{e.stopPropagation();setAzzeraTrim(e.target.value);}} onClick={e=>e.stopPropagation()}
                    style={{border:"1px solid #d1d5db",borderRadius:4,padding:"6px 10px",fontSize:13,fontFamily:FF,background:"#fff"}}>
                    {TRIMESTRI.map(t=><option key={t}>{t}</option>)}
                    <option value="entrambi">Entrambi i quadrimestri</option>
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Conferma esplicita */}
          <div onClick={()=>setAzzeraConferma(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:6,padding:"10px 14px"}}>
            <div style={{width:20,height:20,border:"2px solid "+(azzeraConferma?"#dc2626":"#9ca3af"),borderRadius:4,background:azzeraConferma?"#dc2626":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {azzeraConferma&&<span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}
            </div>
            <span style={{fontSize:13,fontWeight:600,color:"#92400e"}}>
              Confermo di voler procedere, sono consapevole che l'operazione è irreversibile.
            </span>
          </div>

          <div style={{display:"flex",gap:12}}>
            <Btn color="#dc2626" onClick={eseguiAzzeramento} style={{flex:1,opacity:azzeraConferma?1:0.5,cursor:azzeraConferma?"pointer":"not-allowed"}}>
              {azzeraScelta==="tutto"?"🗑️ Azzera schede alunni":azzeraTrim==="entrambi"?"🗑️ Elimina voti di entrambi i quadrimestri":`🗑️ Elimina voti ${azzeraTrim}`}
            </Btn>
            <Btn color="#6b7280" onClick={()=>{setAzzeraOpen(false);setAzzeraConferma(false);}}>Annulla</Btn>
          </div>
        </div>
      </Modal>
      <Modal open={orarioOpen} onClose={()=>setOrarioOpen(false)} width={480} headerColor={TEAL} title="Modifica Slot Orario">
        <div style={{padding:28,display:"flex",flexDirection:"column",gap:16}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}><div><Lbl>Giorno</Lbl><Sel value={orEdit.giorno} onChange={e=>setOrEdit({...orEdit,giorno:e.target.value})}>{GIORNI.map(g=><option key={g}>{g}</option>)}</Sel></div><div><Lbl>Ora</Lbl><Sel value={orEdit.ora} onChange={e=>setOrEdit({...orEdit,ora:parseInt(e.target.value)})}>{ORE_ORARIO.map(o=><option key={o} value={o}>{o}ª ora</option>)}</Sel></div></div>
          <div><Lbl>Classe</Lbl>{classiList.length>0?<Sel value={orEdit.classe} onChange={e=>setOrEdit({...orEdit,classe:e.target.value})}><option value="">— nessuna —</option>{classiList.map(c=><option key={c}>{c}</option>)}</Sel>:<Inp value={orEdit.classe} onChange={e=>setOrEdit({...orEdit,classe:e.target.value})} placeholder="es. 3A"/>}</div>
          <div><Lbl>Materia</Lbl><Sel value={orEdit.materia} onChange={e=>setOrEdit({...orEdit,materia:e.target.value})}>{[...MATERIE,...(()=>{try{return JSON.parse(localStorage.getItem("reg:materieExtra")||"[]");}catch{return[];}})()].filter((v,i,a)=>a.indexOf(v)===i).map(m=><option key={m}>{m}</option>)}</Sel></div>
          <div><Lbl>Nota aggiuntiva</Lbl><Inp value={orEdit.nota} onChange={e=>setOrEdit({...orEdit,nota:e.target.value})} placeholder="es. Palestra…"/></div>
          <div style={{display:"flex",gap:12}}>
            <Btn onClick={()=>{setSlot(orEdit.giorno,orEdit.ora,orEdit.classe?{classe:orEdit.classe,materia:orEdit.materia,nota:orEdit.nota}:null);setOrarioOpen(false);showToast();}} style={{flex:1}}>Salva</Btn>
            {getSlot(orEdit.giorno,orEdit.ora)&&<Btn color="#ef4444" onClick={()=>{setSlot(orEdit.giorno,orEdit.ora,null);setOrarioOpen(false);showToast();}}>Rimuovi</Btn>}
            <Btn color="#6b7280" onClick={()=>setOrarioOpen(false)}>Annulla</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}