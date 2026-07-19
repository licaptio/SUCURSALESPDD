const DB_NOMBRE = "provsoft_articulos_nuevos";
const DB_VERSION = 2;
const STORE_META = "catalogo_fotos";
const STORE_IMAGENES = "imagenes";
const STORE_CONFIG = "config";

let promesaDb = null;

function abrirDb() {
  if (promesaDb) return promesaDb;

  promesaDb = new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(DB_NOMBRE, DB_VERSION);

    solicitud.onupgradeneeded = () => {
      const db = solicitud.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_IMAGENES)) {
        db.createObjectStore(STORE_IMAGENES, { keyPath: "url" });
      }
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG, { keyPath: "clave" });
      }
    };

    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });

  return promesaDb;
}

function esperarTransaccion(transaccion) {
  return new Promise((resolve, reject) => {
    transaccion.oncomplete = () => resolve();
    transaccion.onerror = () => reject(transaccion.error);
    transaccion.onabort = () => reject(transaccion.error || new Error("Transacción cancelada"));
  });
}

export async function guardarCatalogoFotos(documentos) {
  const db = await abrirDb();
  const tx = db.transaction([STORE_META, STORE_CONFIG], "readwrite");
  const store = tx.objectStore(STORE_META);
  store.clear();

  for (const documento of documentos) {
    store.put(documento);
  }

  tx.objectStore(STORE_CONFIG).put({
    clave: "ultimaSincronizacionFotos",
    valor: new Date().toISOString(),
    total: documentos.length
  });

  await esperarTransaccion(tx);
}

export async function leerCatalogoFotos() {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const solicitud = tx.objectStore(STORE_META).getAll();
    solicitud.onsuccess = () => resolve(solicitud.result || []);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

export async function guardarImagenCache(url, blob) {
  const db = await abrirDb();
  const tx = db.transaction(STORE_IMAGENES, "readwrite");
  tx.objectStore(STORE_IMAGENES).put({
    url,
    blob,
    guardadoEn: Date.now()
  });
  await esperarTransaccion(tx);
}

export async function obtenerImagenCache(url) {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGENES, "readonly");
    const solicitud = tx.objectStore(STORE_IMAGENES).get(url);
    solicitud.onsuccess = () => resolve(solicitud.result?.blob || null);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

export async function contarImagenesCache() {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGENES, "readonly");
    const solicitud = tx.objectStore(STORE_IMAGENES).count();
    solicitud.onsuccess = () => resolve(solicitud.result || 0);
    solicitud.onerror = () => reject(solicitud.error);
  });
}
