const DB_NAME = "PROVSOFT_CIGARROS_V4";
const DB_VERSION = 1;
const STORE_NAME = "semanas";
const STORE_CALCULOS = "calculos";
const STORE_META = "sync_meta";
// V15: base local independiente y persistente. Sin caducidad de 24 h; sincronización incremental por colección.

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(STORE_CALCULOS)) {
        db.createObjectStore(STORE_CALCULOS, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function crearKeySemana({ almacen, inicio, fin, base }) {
  return `${almacen}|${base}|${inicio}|${fin}`;
}

export async function leerCacheSemana(key) {
  const db = await abrirDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);

    req.onsuccess = () => {
      const row = req.result;
      if (!row) {
        resolve(null);
        return;
      }

      resolve(row.payload || null);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function guardarCacheSemana(key, payload) {
  const db = await abrirDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.put({
      key,
      payload,
      guardadoEn: new Date().toISOString(),
      guardadoEnMs: Date.now()
    });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function limpiarCacheInventario() {
  const db = await abrirDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, STORE_CALCULOS], "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.objectStore(STORE_CALCULOS).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}


export async function guardarCalculoInventario(key, payload) {
  const db = await abrirDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CALCULOS, "readwrite");
    const store = tx.objectStore(STORE_CALCULOS);

    store.put({
      key,
      payload,
      guardadoEn: new Date().toISOString(),
      guardadoEnMs: Date.now()
    });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function leerCalculoInventario(key) {
  const db = await abrirDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CALCULOS, "readonly");
    const store = tx.objectStore(STORE_CALCULOS);
    const req = store.get(key);

    req.onsuccess = () => {
      const row = req.result;
      if (!row) {
        resolve(null);
        return;
      }

      resolve(row.payload || null);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function invalidarCacheDesdeMovimiento(fechaISO) {
  const db = await abrirDB();
  const fecha = String(fechaISO || "").substring(0, 10);
  if (!fecha) return 0;

  let eliminados = 0;

  for (const storeName of [STORE_NAME, STORE_CALCULOS]) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.openCursor();

      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;

        const key = String(cursor.key || "");
        const partes = key.split("|");
        const finSemana = partes.length >= 2 ? partes[partes.length - 1] : "";

        // Cualquier semana cuyo cierre sea igual o posterior al movimiento
        // puede depender de ese dato histórico y debe recalcularse al abrirse.
        if (finSemana && finSemana >= fecha) {
          cursor.delete();
          eliminados++;
        }
        cursor.continue();
      };

      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  return eliminados;
}


export async function leerMetaSync(key) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function guardarMetaSync(key, valor) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put({
      key,
      valor,
      actualizadoEn: new Date().toISOString()
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
