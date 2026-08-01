const DB_NAME = "PROVSOFT_INVENTARIO_CACHE";
const DB_VERSION = 1;
const CACHE_TTL_MS = 1000 * 60 * 20; // 20 minutos

const STORES = [
  "inventarios",
  "ventas",
  "transferencias",
  "ajustes",
  "devoluciones",
  "intercambios",
  "mermas"
];

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      STORES.forEach(store => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      });
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function crearKey(tienda, store) {
  return `${tienda}_${store}`;
}

export async function guardarCache(tienda, store, payload) {
  const db = await abrirDB();

  const item = {
    id: crearKey(tienda, store),
    tienda,
    store,
    actualizadoEn: Date.now(),
    payload
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(item);

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function leerCache(tienda, store) {
  const db = await abrirDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(crearKey(tienda, store));

    req.onsuccess = () => {
      const item = req.result;

      if (!item) return resolve(null);

      const vencido = Date.now() - Number(item.actualizadoEn || 0) > CACHE_TTL_MS;
      if (vencido) return resolve(null);

      resolve(item.payload || null);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function conCache(tienda, store, loader) {
  const cache = await leerCache(tienda, store);

  if (cache) {
    console.log(`[CACHE] ${tienda} / ${store}`);
    return cache;
  }

  console.log(`[FIREBASE] ${tienda} / ${store}`);

  const data = await loader();
  await guardarCache(tienda, store, data);

  return data;
}

export async function borrarCacheTienda(tienda) {
  const db = await abrirDB();

  await Promise.all(
    STORES.map(store => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(crearKey(tienda, store));

        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    })
  );
}
