import {
  db,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  limit,
  serverTimestamp,
  deleteDoc
} from "./config.js";

const BASE_ZAPATA = "almacenes/Almacen_Liquidos";
const BASE_PROVEEDORES_ABARROTES = "almacenes/abarrotespdd";
const RUTA_PRODUCTOS = "productos";

export async function guardarProveedorAutorizado(data) {
  const rfc = data.rfc_emisor.trim().toUpperCase();

  if (!rfc) {
    throw new Error("RFC requerido");
  }

  const ref = doc(
    db,
    BASE_PROVEEDORES_ABARROTES,
    "configuracion",
    "proveedores_autorizados",
    "items",
    rfc
  );

  await setDoc(ref, {
  rfc_emisor: rfc,
  razon_social_emisor: data.razon_social_emisor.trim(),
  alias_pivot: normalizarAliasPivot(
    data.alias_pivot || data.razon_social_emisor
  ),
  activo: true,
  actualizado_en: new Date().toISOString(),
  timestamp: serverTimestamp()
}, { merge: true });
  
}


export async function eliminarProveedorAutorizado(rfcProveedor) {
  const rfc = String(rfcProveedor || "").trim().toUpperCase();
  if (!rfc) throw new Error("RFC requerido");

  const ref = doc(
    db,
    BASE_PROVEEDORES_ABARROTES,
    "configuracion",
    "proveedores_autorizados",
    "items",
    rfc
  );

  await deleteDoc(ref);
}

export async function cargarProveedoresAutorizados() {
  const col = collection(
    db,
    BASE_PROVEEDORES_ABARROTES,
    "configuracion",
    "proveedores_autorizados",
    "items"
  );

  const snap = await getDocs(col);

  return snap.docs.map(d => {
    const x = d.data() || {};
    return {
      id: d.id,
      ...x,
      // Compatibilidad con la lista cargada desde consola: { rfc, nombre, activo }.
      rfc_emisor: String(x.rfc_emisor || x.rfc || d.id || "").trim().toUpperCase(),
      razon_social_emisor: String(x.razon_social_emisor || x.nombre || "").trim(),
      alias_pivot: String(x.alias_pivot || x.razon_social_emisor || x.nombre || "").trim()
    };
  });
}

export async function guardarEquivalencia(data) {
  const id = normalizarId(data.texto_factura);

  if (!id) {
    throw new Error("Texto de factura requerido");
  }

  const ref = doc(
    db,
    BASE_ZAPATA,
    "configuracion",
    "equivalencias_factura",
    "items",
    id
  );

  await setDoc(ref, {
    texto_factura: data.texto_factura.trim(),
    texto_normalizado: normalizarTexto(data.texto_factura),
    codigo_interno: data.codigo_interno.trim(),
    descripcion_interna: data.descripcion_interna.trim(),
    unidad_factura: String(data.unidad_factura || "").trim().toUpperCase(),
    unidad_inventario: String(data.unidad_inventario || "").trim().toUpperCase(),
    factor_conversion: Number(data.factor_conversion || 1),
    operacion_conversion: String(data.operacion_conversion || "DIVIDIR").trim().toUpperCase(),
    activo: true,
    actualizado_en: new Date().toISOString(),
    timestamp: serverTimestamp()
  }, { merge: true });
}

export async function cargarEquivalencias() {
  const col = collection(
    db,
    BASE_ZAPATA,
    "configuracion",
    "equivalencias_factura",
    "items"
  );

  const snap = await getDocs(col);

  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

// Catálogo local: el modal trabaja contra IndexedDB y Firebase solo sincroniza.
const CATALOGO_DB = "provsoft_catalogo_productos";
const CATALOGO_DB_VERSION = 2;
const CATALOGO_STORE = "productos_activos";
const CATALOGO_META_STORE = "metadatos";
const CATALOGO_META_ACTUALIZACION = "ultima_actualizacion_activos";

function abrirCatalogoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CATALOGO_DB, CATALOGO_DB_VERSION);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(CATALOGO_STORE)) {
        idb.createObjectStore(CATALOGO_STORE, { keyPath: "id" });
      }
      if (!idb.objectStoreNames.contains(CATALOGO_META_STORE)) {
        idb.createObjectStore(CATALOGO_META_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cargarProductosActivosLocal() {
  const idb = await abrirCatalogoDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(CATALOGO_STORE, "readonly");
    const req = tx.objectStore(CATALOGO_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => idb.close();
  });
}

async function reemplazarProductosActivosLocal(productos) {
  const idb = await abrirCatalogoDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction([CATALOGO_STORE, CATALOGO_META_STORE], "readwrite");
    const store = tx.objectStore(CATALOGO_STORE);
    // La sincronización es una foto completa SOLO de activos.
    // Así desaparecen localmente los que hayan sido desactivados en Firebase.
    store.clear();
    productos.forEach(p => store.put(p));
    tx.objectStore(CATALOGO_META_STORE).put({
      id: CATALOGO_META_ACTUALIZACION,
      fecha: fechaLocalCatalogo(),
      actualizado_en: new Date().toISOString(),
      total: productos.length
    });
    tx.oncomplete = () => { idb.close(); resolve(); };
    tx.onerror = () => { idb.close(); reject(tx.error); };
    tx.onabort = () => { idb.close(); reject(tx.error); };
  });
}

function fechaLocalCatalogo() {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const dd = String(hoy.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function cargarMetaCatalogo() {
  const idb = await abrirCatalogoDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(CATALOGO_META_STORE, "readonly");
    const req = tx.objectStore(CATALOGO_META_STORE).get(CATALOGO_META_ACTUALIZACION);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => idb.close();
  });
}

async function agregarProductosActivosLocal(productos = []) {
  if (!productos.length) return;
  const idb = await abrirCatalogoDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(CATALOGO_STORE, "readwrite");
    const store = tx.objectStore(CATALOGO_STORE);
    productos.forEach(producto => store.put(producto));
    tx.oncomplete = () => { idb.close(); resolve(); };
    tx.onerror = () => { idb.close(); reject(tx.error); };
    tx.onabort = () => { idb.close(); reject(tx.error); };
  });
}

export async function sincronizarProductosActivosLocal() {
  const col = collection(db, RUTA_PRODUCTOS);
  const q = query(col, where("activo", "==", true));
  const snap = await getDocs(q);
  const productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  await reemplazarProductosActivosLocal(productos);
  return productos;
}

// Descarga la fotografía completa de activos una sola vez por día y dispositivo.
export async function sincronizarProductosActivosLocalDiario() {
  const [locales, meta] = await Promise.all([
    cargarProductosActivosLocal(),
    cargarMetaCatalogo()
  ]);
  if (locales.length && meta?.fecha === fechaLocalCatalogo()) return locales;
  try {
    return await sincronizarProductosActivosLocal();
  } catch (error) {
    if (locales.length) {
      console.warn("No se pudo renovar el catálogo del día; se conserva IndexedDB.", error);
      return locales;
    }
    throw error;
  }
}

// Respaldo para productos agregados después de la descarga diaria: primero se
// buscó IndexedDB; aquí se consulta Firebase por código/ID o concepto exacto y
// todo resultado activo se incorpora a IndexedDB sin reemplazar el catálogo.
export async function buscarProductoActivoFirebaseYGuardarLocal(texto = "") {
  const valor = String(texto || "").trim();
  if (!valor) return [];

  const col = collection(db, RUTA_PRODUCTOS);
  const encontrados = new Map();
  const agregarSnapshot = (snap) => snap.docs.forEach(d => {
    const producto = { id: d.id, ...d.data() };
    if (producto.activo === true) encontrados.set(d.id, producto);
  });

  const directo = await getDoc(doc(db, RUTA_PRODUCTOS, valor));
  if (directo.exists()) agregarSnapshot({ docs: [directo] });

  for (const campo of ["codigoBarra", "concepto"]) {
    const snap = await getDocs(query(col, where(campo, "==", valor), limit(20)));
    agregarSnapshot(snap);
  }

  const productos = Array.from(encontrados.values());
  await agregarProductosActivosLocal(productos);
  return productos;
}

// Compatibilidad con llamadas anteriores: ahora devuelve el catálogo activo completo.
export async function cargarProductosActivos() {
  return sincronizarProductosActivosLocal();
}

export function filtrarProductosCatalogo(productos = [], texto = "") {
  const query = normalizarBusqueda(texto);

  if (!query) {
    return productos.slice(0, 100);
  }

  const tokens = query.split(" ").filter(Boolean);

  return productos
    .map(p => {
      const codigo = normalizarBusqueda(p.codigoBarra || p.id || "");
      const concepto = normalizarBusqueda(p.concepto || "");
      const marca = normalizarBusqueda(p.marca || "");
      const departamento = normalizarBusqueda(p.departamento || "");

      const textoCompleto = `${codigo} ${concepto} ${marca} ${departamento}`;

      let score = 0;

      if (codigo === query) score += 1000;
      if (codigo.includes(query)) score += 700;
      if (concepto.includes(query)) score += 600;
      if (textoCompleto.includes(query)) score += 500;

      for (const token of tokens) {
        if (codigo.includes(token)) score += 300;
        if (concepto.includes(token)) score += 250;
        if (marca.includes(token)) score += 100;
        if (departamento.includes(token)) score += 80;
      }

      const encontrados = tokens.filter(t => textoCompleto.includes(t)).length;

      if (encontrados === tokens.length) {
        score += 500;
      }

      return { producto: p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map(x => x.producto);
}

function normalizarBusqueda(valor) {
  return String(valor || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


export function buscarEquivalenciaParaConcepto(concepto, equivalencias) {
  const texto = normalizarTexto(
    `${concepto.noIdentificacion || ""} ${concepto.descripcion || ""}`
  );

  let mejor = null;
  let mejorScore = 0;

  for (const eq of equivalencias) {
    if (!eq.activo) continue;

    const objetivo = normalizarTexto(eq.texto_factura || "");
    const score = calcularScore(texto, objetivo);

    if (score > mejorScore) {
      mejorScore = score;
      mejor = eq;
    }
  }

  if (mejorScore < 0.65) {
    return null;
  }

  return mejor;
}

function calcularScore(texto, objetivo) {
  if (!texto || !objetivo) return 0;

  const tokens = objetivo.split(" ").filter(Boolean);
  if (tokens.length === 0) return 0;

  let aciertos = 0;

  for (const token of tokens) {
    if (texto.includes(token)) aciertos++;
  }

  return aciertos / tokens.length;
}

export function normalizarTexto(txt) {
  return String(txt || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarId(txt) {
  return normalizarTexto(txt)
    .replace(/\s+/g, "_")
    .slice(0, 120);
}


function normalizarAliasPivot(valor) {
  return String(valor || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}
