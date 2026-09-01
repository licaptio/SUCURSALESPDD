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
const RUTA_PRODUCTOS = "productos";

export async function guardarProveedorAutorizado(data) {
  const rfc = data.rfc_emisor.trim().toUpperCase();

  if (!rfc) {
    throw new Error("RFC requerido");
  }

  const ref = doc(
    db,
    BASE_ZAPATA,
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

export async function cargarProveedoresAutorizados() {
  const col = collection(
    db,
    BASE_ZAPATA,
    "configuracion",
    "proveedores_autorizados",
    "items"
  );

  const snap = await getDocs(col);

  // Los proveedores autorizados pueden existir únicamente con RFC + activo.
  // Si no tienen nombre guardado, lo construimos automáticamente buscando
  // una factura de ese RFC en ALMACENCENTRALPDD/entradas.
  const proveedores = await Promise.all(snap.docs.map(async d => {
    const x = d.data() || {};
    const rfc = String(x.rfc_emisor || x.rfc || d.id || "").trim().toUpperCase();
    let nombre = String(x.razon_social_emisor || x.nombre || "").trim();

    if (rfc && !nombre) {
      try {
        const facturasCol = collection(db, "almacenes/ALMACENCENTRALPDD/entradas");
        const facturaSnap = await getDocs(query(
          facturasCol,
          where("rfc_emisor", "==", rfc),
          limit(10)
        ));

        const facturaConNombre = facturaSnap.docs
          .map(f => f.data() || {})
          .find(f => String(f.razon_social_emisor || "").trim());

        nombre = String(facturaConNombre?.razon_social_emisor || "").trim();
      } catch (error) {
        console.warn(`No se pudo resolver nombre para RFC ${rfc}:`, error);
      }
    }

    return {
      id: d.id,
      ...x,
      rfc_emisor: rfc,
      razon_social_emisor: nombre,
      // Si no existe alias manual, usamos el nombre encontrado; y como
      // último recurso el RFC para que nunca quede vacío en pantalla.
      alias_pivot: String(x.alias_pivot || nombre || rfc).trim()
    };
  }));

  return proveedores;
}

export async function guardarEquivalencia(data) {
  const textoFactura = String(data.texto_factura || data.descripcion_factura || "").trim();
  const id = normalizarId(textoFactura);

  if (!id) throw new Error("Texto de factura requerido");
  if (!String(data.codigo_interno || "").trim()) throw new Error("Producto interno requerido");

  const ref = doc(db, BASE_ZAPATA, "configuracion", "equivalencias_factura", "items", id);

  await setDoc(ref, {
    texto_factura: textoFactura,
    texto_normalizado: normalizarTexto(textoFactura),
    codigo_factura: String(data.codigo_factura || "").trim(),
    descripcion_factura: String(data.descripcion_factura || textoFactura).trim(),
    descripcion_normalizada: normalizarTexto(data.descripcion_factura || textoFactura),
    codigo_interno: String(data.codigo_interno || "").trim(),
    descripcion_interna: String(data.descripcion_interna || "").trim(),
    unidad_factura: String(data.unidad_factura || "").trim().toUpperCase(),
    unidad_inventario: String(data.unidad_inventario || "").trim().toUpperCase(),
    factor_conversion: Number(data.factor_conversion || 1),
    activo: true,
    actualizado_en: new Date().toISOString(),
    timestamp: serverTimestamp()
  }, { merge: true });

  // Si se editó una equivalencia antigua cuya llave era distinta, eliminamos
  // el documento anterior para evitar dos enlaces activos para el mismo concepto.
  const idAnterior = String(data.id_anterior || "").trim();
  if (idAnterior && idAnterior !== id) {
    try {
      await deleteDoc(doc(db, BASE_ZAPATA, "configuracion", "equivalencias_factura", "items", idAnterior));
    } catch (error) {
      console.warn("No se pudo retirar equivalencia anterior:", error);
    }
  }

  return id;
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
const CATALOGO_DB = "PROVSOFT_APPTABLALIQUIDOS_CATALOGO_V1";
const CATALOGO_DB_VERSION = 1;
const CATALOGO_STORE = "productos_activos";
const CATALOGO_ULTIMA_SYNC_KEY = "PROVSOFT_APPTABLALIQUIDOS_CATALOGO_ULTIMA_SYNC";

function fechaLocalHoy() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

export function catalogoRequiereSincronizacionHoy() {
  return localStorage.getItem(CATALOGO_ULTIMA_SYNC_KEY) !== fechaLocalHoy();
}

function abrirCatalogoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CATALOGO_DB, CATALOGO_DB_VERSION);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(CATALOGO_STORE)) {
        idb.createObjectStore(CATALOGO_STORE, { keyPath: "id" });
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

export async function guardarProductoActivoLocal(producto) {
  if (!producto || !producto.id) return;
  const idb = await abrirCatalogoDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(CATALOGO_STORE, "readwrite");
    tx.objectStore(CATALOGO_STORE).put(producto);
    tx.oncomplete = () => { idb.close(); resolve(producto); };
    tx.onerror = () => { idb.close(); reject(tx.error); };
    tx.onabort = () => { idb.close(); reject(tx.error); };
  });
}

async function reemplazarProductosActivosLocal(productos) {
  const idb = await abrirCatalogoDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(CATALOGO_STORE, "readwrite");
    const store = tx.objectStore(CATALOGO_STORE);
    // La sincronización es una foto completa SOLO de activos.
    // Así desaparecen localmente los que hayan sido desactivados en Firebase.
    store.clear();
    productos.forEach(p => store.put(p));
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
  localStorage.setItem(CATALOGO_ULTIMA_SYNC_KEY, fechaLocalHoy());
  return productos;
}

// Al abrir la app: descarga completa sólo una vez por día.
// Las siguientes aperturas del mismo día arrancan directamente desde IndexedDB.
export async function prepararCatalogoDiario() {
  const local = await cargarProductosActivosLocal();
  if (!catalogoRequiereSincronizacionHoy() && local.length) {
    return { productos: local, sincronizadoAhora: false };
  }
  const productos = await sincronizarProductosActivosLocal();
  return { productos, sincronizadoAhora: true };
}

// Si un código no existe en IndexedDB, se consulta Firebase y, si está activo,
// se integra inmediatamente al catálogo local sin esperar a la sincronización del día siguiente.
export async function buscarProductoActivoFirebasePorCodigo(codigo) {
  const valor = String(codigo || "").trim();
  if (!valor) return null;

  let producto = null;

  // 1) Muchos catálogos usan el código de barras como ID del documento.
  try {
    const ref = doc(db, RUTA_PRODUCTOS, valor);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() || {};
      if (data.activo === true) producto = { id: snap.id, ...data };
    }
  } catch (error) {
    console.warn("No se pudo consultar producto por ID:", error);
  }

  // 2) Si el ID es distinto, buscamos por campo codigoBarra.
  if (!producto) {
    try {
      const col = collection(db, RUTA_PRODUCTOS);
      const snap = await getDocs(query(col, where("codigoBarra", "==", valor), limit(5)));
      const encontrado = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .find(p => p.activo === true);
      if (encontrado) producto = encontrado;
    } catch (error) {
      console.warn("No se pudo consultar producto por codigoBarra:", error);
    }
  }

  if (producto) await guardarProductoActivoLocal(producto);
  return producto;
}

// Compatibilidad con llamadas anteriores.
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

export function sugerirProductosPorDescripcion(productos = [], descripcion = "") {
  const query = normalizarBusqueda(descripcion);
  if (!query) return [];

  const tokens = query.split(" ").filter(t => t.length >= 2);
  if (!tokens.length) return [];

  return productos
    .map(p => {
      const concepto = normalizarBusqueda(p.concepto || "");
      const marca = normalizarBusqueda(p.marca || "");
      const departamento = normalizarBusqueda(p.departamento || "");
      const texto = `${concepto} ${marca} ${departamento}`.trim();
      let score = 0;

      if (concepto === query) score += 3000;
      if (concepto.includes(query)) score += 1800;
      if (query.includes(concepto) && concepto.length >= 5) score += 900;

      let encontrados = 0;
      for (const token of tokens) {
        if (concepto.includes(token)) { score += 240; encontrados++; }
        else if (marca.includes(token)) { score += 70; encontrados++; }
        else if (departamento.includes(token)) { score += 35; encontrados++; }
      }

      score += encontrados * encontrados * 90;
      const cobertura = encontrados / tokens.length;
      if (cobertura === 1) score += 1200;
      else if (cobertura >= .75) score += 550;
      else if (cobertura >= .5) score += 180;

      return { producto: p, score, cobertura };
    })
    .filter(x => x.score > 0 && x.cobertura >= .25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
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
