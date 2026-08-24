import {
  db,
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
  deleteDoc
} from "./config.js";

const RUTA_ENTRADAS_ZAPATA = "almacenes/abarrotespdd/entradas";
const FECHA_MINIMA_ENTRADAS = "2026-08-17";

export function prepararArticulosEntrada(factura, equivalencias) {
  const conceptos = Array.isArray(factura.conceptos_detalle)
    ? factura.conceptos_detalle
    : [];

  return conceptos.map(concepto => {
    const eq = buscarEquivalenciaExactaParaConcepto(concepto, equivalencias);

    const cantidadFactura = Number(concepto.cantidad || 0);
    const factor = eq ? Number(eq.factor_conversion || 1) : 1;
    const cantidadEntrada = cantidadFactura * factor;

    return {
      codigo_factura: concepto.noIdentificacion || "",
      descripcion_factura: concepto.descripcion || "",
      cantidad_factura: cantidadFactura,
      unidad_factura: eq?.unidad_factura || concepto.unidad || "",
      codigo_interno: eq?.codigo_interno || "",
      descripcion_interna: eq?.descripcion_interna || "",
      unidad_inventario: eq?.unidad_inventario || "",
      factor_conversion: factor,
      cantidad_entrada: cantidadEntrada,
      equivalencia_encontrada: Boolean(eq)
    };
  });
}
function buscarEquivalenciaExactaParaConcepto(concepto, equivalencias = []) {
  const codigoFactura = normalizarTexto(concepto.noIdentificacion || "");
  const descripcionFactura = normalizarTexto(concepto.descripcion || "");
  const textoFactura = normalizarTexto(
    `${concepto.noIdentificacion || ""} ${concepto.descripcion || ""}`
  );

  if (!codigoFactura && !descripcionFactura) return null;

  const equivalenciasActivas = Array.isArray(equivalencias)
    ? equivalencias
    : [];

  let eq = equivalenciasActivas.find(e => {
    const codigoEq = normalizarTexto(e.codigo_factura || e.noIdentificacion || "");
    return codigoEq && codigoEq === codigoFactura;
  });

  if (eq) return eq;

  eq = equivalenciasActivas.find(e => {
    const textoEq = normalizarTexto(e.texto_factura || "");
    return textoEq && textoEq === textoFactura;
  });

  if (eq) return eq;

  eq = equivalenciasActivas.find(e => {
    const descripcionEq = normalizarTexto(e.descripcion_factura || "");
    return descripcionEq && descripcionEq === descripcionFactura;
  });

  return eq || null;
}

function normalizarTexto(valor) {
  return String(valor || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generarEntradaZapata(factura, articulos, usuario = "GERARDO") {
  const uuid = String(factura.uuid_cfdi || factura.id || "").toUpperCase();

  if (!uuid) {
    throw new Error("Factura sin UUID");
  }

  const fechaEntrada = obtenerFechaFactura(factura);
  if (fechaEntrada < FECHA_MINIMA_ENTRADAS) {
    throw new Error("Solo se permiten entradas con fecha del 17 de agosto de 2026 en adelante.");
  }

  const articulosInvalidos = articulos.filter(a => !a.equivalencia_encontrada);

  if (articulosInvalidos.length > 0) {
    throw new Error(
      "Hay conceptos sin equivalencia. Configúralos antes de autorizar."
    );
  }

  const ref = doc(db, RUTA_ENTRADAS_ZAPATA, uuid);

  const entrada = {
    folioEntrada: `ENT-ZAP-${fechaFolio()}-${uuid.slice(0, 6)}`,
    fecha: fechaEntrada,
    origen: "FACTURA_ALMACEN_CENTRAL",
    uuid_cfdi: uuid,

    estado_zapata: "ENTRADA_GENERADA",

    rfc_emisor: factura.rfc_emisor || "",
    razon_social_emisor: factura.razon_social_emisor || "",
    serie: factura.serie || "",
    folio: factura.folio || "",
    fecha_factura: fechaEntrada,
    total_factura: Number(factura.total || 0),

    estado: "AUTORIZADA",
    articulos,

    usuario,
    creado_en: new Date().toISOString(),
    timestamp: serverTimestamp()
  };

  await setDoc(ref, entrada, { merge: false });

  return entrada;
}

export async function actualizarEntradaZapata(id, articulos, usuario = "GERARDO") {
  const entradaId = String(id || "").trim();
  if (!entradaId) throw new Error("Entrada sin identificador");
  if (!Array.isArray(articulos) || !articulos.length) throw new Error("La entrada no tiene artículos");

  const ref = doc(db, RUTA_ENTRADAS_ZAPATA, entradaId);
  await setDoc(ref, {
    articulos,
    modificado_en: new Date().toISOString(),
    modificado_por: usuario,
    timestamp_modificacion: serverTimestamp()
  }, { merge: true });
}

export async function desguardarEntradaZapata(id) {
  const entradaId = String(id || "").trim();
  if (!entradaId) throw new Error("Entrada sin identificador");
  await deleteDoc(doc(db, RUTA_ENTRADAS_ZAPATA, entradaId));
}

export async function cargarEntradasZapata(max = 100) {
  const col = collection(db, RUTA_ENTRADAS_ZAPATA);

  const q = query(
    col,
    orderBy("creado_en", "desc"),
    limit(max)
  );

  const snap = await getDocs(q);

  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

function obtenerFechaFactura(factura) {
  const raw = factura.fecha_factura || factura.fecha || factura.fecha_emision || factura.fechaEmision || "";
  if (raw?.toDate) return raw.toDate().toISOString().slice(0, 10);
  const txt = String(raw || "").trim();
  const m = txt.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(txt);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  throw new Error("La factura no tiene una fecha válida para la entrada.");
}

function fechaFolio() {
  const d = new Date();

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return `${y}${m}${day}-${h}${min}`;
}
