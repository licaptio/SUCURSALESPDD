const DB_NAME = "PROVSOFT_CACHE_INVENTARIO";
const DB_VERSION = 1;
const STORE_NAME = "semanas";
const TTL_MS = 1000 * 60 * 10; // 10 minutos: temporal, no corte definitivo.

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
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

      const edad = Date.now() - Number(row.guardadoEnMs || 0);
      if (edad > TTL_MS) {
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
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
