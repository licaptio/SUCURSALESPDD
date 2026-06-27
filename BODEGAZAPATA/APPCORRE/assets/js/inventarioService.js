import { getDocs, query, where, orderBy, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { REF_ENTRADAS, REF_SALIDAS, REF_AJUSTES } from "./firebaseRefs.js";
import { normalizarCodigo, normalizarFecha } from "./util.js";

const FECHA_BASE = "2026-05-25";

let catalogoCache = [];
let movimientosCache = [];

function pushCatalogo(mapa, item) {
  const codigoKey = normalizarCodigo(item.codigo);
  const nombre = String(item.nombre || "").trim();
  if (!codigoKey && !nombre) return;
  const key = codigoKey || nombre.toLowerCase();
  if (!mapa.has(key)) {
    mapa.set(key, { codigo: String(item.codigo || "").trim(), codigoKey, nombre, busqueda: "" });
  }
  const p = mapa.get(key);
  if (!p.codigo && item.codigo) p.codigo = String(item.codigo).trim();
  if (!p.nombre && nombre) p.nombre = nombre;
  p.busqueda = `${p.codigo} ${p.codigoKey} ${p.nombre}`.toLowerCase();
}

export async function cargarCatalogoDesdeMovimientos(onProgress = () => {}) {
  const mapa = new Map();
  const movimientos = [];

  onProgress("Leyendo entradas...", 35);
  const entradasSnap = await getDocs(REF_ENTRADAS);
  entradasSnap.forEach((docu) => {
    const d = docu.data() || {};
    if (d.estado_zapata && d.estado_zapata !== "ENTRADA_GENERADA") return;
    const fecha = normalizarFecha(d.fecha || d.fecha_factura || d.creado_en || d.timestamp || "");
    const articulos = Array.isArray(d.articulos) ? d.articulos : [];
    articulos.forEach((a) => {
      const codigo = String(a.codigo_interno || a.codigo || "").trim();
      const nombre = String(a.descripcion_interna || a.descripcion_factura || a.nombre || "").trim();
      const cantidad = Number(a.cantidad_entrada || a.cantidad || 0);
      pushCatalogo(mapa, { codigo, nombre });
      movimientos.push({ tipo: "ENTRADA", fecha, codigoKey: normalizarCodigo(codigo), codigo, nombre, cantidad });
    });
  });

  onProgress("Leyendo salidas...", 58);
  const salidasSnap = await getDocs(REF_SALIDAS);
  salidasSnap.forEach((docu) => {
    const d = docu.data() || {};
    const fecha = normalizarFecha(d.fecha || d.timestamp || "");
    const articulos = Array.isArray(d.articulos) ? d.articulos : [];
    articulos.forEach((a) => {
      const codigo = String(a.codigo || "").trim();
      const nombre = String(a.nombre || "").trim();
      const cantidad = Number(a.cantidad || 0);
      pushCatalogo(mapa, { codigo, nombre });
      movimientos.push({ tipo: "SALIDA", fecha, codigoKey: normalizarCodigo(codigo), codigo, nombre, cantidad });
    });
  });

  catalogoCache = Array.from(mapa.values()).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  movimientosCache = movimientos.filter(x => x.fecha >= FECHA_BASE);
  onProgress("Catálogo listo", 75);
  return catalogoCache;
}

export function buscarCatalogo(texto, limite = 30) {
  const q = String(texto || "").trim().toLowerCase();
  if (!q) return [];
  const partes = q.split(/\s+/).filter(Boolean);
  return catalogoCache.filter(p => partes.every(t => p.busqueda.includes(t))).slice(0, limite);
}

export async function calcularTeorico(codigoKey, fechaCorte) {
  let teorico = 0;
  const key = normalizarCodigo(codigoKey);

  movimientosCache.forEach((m) => {
    if (m.codigoKey !== key) return;
    if (m.fecha && fechaCorte && m.fecha > fechaCorte) return;
    if (m.tipo === "ENTRADA") teorico += Number(m.cantidad || 0);
    if (m.tipo === "SALIDA") teorico -= Number(m.cantidad || 0);
  });

  // Incluir ajustes ya grabados antes o el mismo día. Se ignoran documentos cancelados.
  try {
    const q = query(REF_AJUSTES, where("fecha_movimiento", "<=", fechaCorte), orderBy("fecha_movimiento", "asc"));
    const snap = await getDocs(q);
    for (const docu of snap.docs) {
      const enc = docu.data() || {};
      if (enc.cancelado === true) continue;
      const partidasRef = collection(REF_AJUSTES, docu.id, "PARTIDAS");
      const ps = await getDocs(partidasRef);
      ps.forEach((pdoc) => {
        const p = pdoc.data() || {};
        if (normalizarCodigo(p.codigoKey || p.codigo) === key) teorico += Number(p.diferencia || 0);
      });
    }
  } catch (e) {
    console.warn("No se pudieron leer ajustes acumulados", e);
  }

  return teorico;
}

export function totalCatalogo() { return catalogoCache.length; }
