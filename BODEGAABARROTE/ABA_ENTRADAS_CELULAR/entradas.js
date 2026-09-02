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
const RUTA_AJUSTES_ENTRADA_ZAPATA = "almacenes/abarrotespdd/ajustes_entrada";
const FECHA_MINIMA_ENTRADAS = "2026-08-17";

export function prepararArticulosEntrada(factura, equivalencias) {
  const conceptos = Array.isArray(factura.conceptos_detalle)
    ? factura.conceptos_detalle
    : [];

  return conceptos.map(concepto => {
    const eq = buscarEquivalenciaExactaParaConcepto(concepto, equivalencias);

    const cantidadFactura = Number(concepto.cantidad || 0);
    const factor = eq ? Number(eq.factor_conversion || 1) : 1;
    const operacionConversion = String(eq?.operacion_conversion || "DIVIDIR").toUpperCase();
    const cantidadEntrada = factor > 0
      ? (operacionConversion === "MULTIPLICAR" ? cantidadFactura * factor : cantidadFactura / factor)
      : cantidadFactura;

    return {
      codigo_factura: concepto.noIdentificacion || "",
      descripcion_factura: concepto.descripcion || "",
      cantidad_factura: cantidadFactura,
      unidad_factura: eq?.unidad_factura || concepto.unidad || "",
      codigo_interno: eq?.codigo_interno || "",
      descripcion_interna: eq?.descripcion_interna || "",
      unidad_inventario: eq?.unidad_inventario || "",
      factor_conversion: factor,
      operacion_conversion: operacionConversion,
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

export async function generarAjusteEntradaZapata(entrada, partidas, motivo = "DEVOLUCIÓN A PROVEEDOR", usuario = "GERARDO", fechaMovimiento = "", horaMovimiento = "") {
  const entradaId = String(entrada?.id || entrada?.uuid_cfdi || "").trim();
  if (!entradaId) throw new Error("Entrada sin identificador");

  const limpias = (Array.isArray(partidas) ? partidas : [])
    .map(p => ({
      codigo_interno: String(p.codigo_interno || p.codigo || p.codigo_factura || "").trim(),
      codigo_factura: String(p.codigo_factura || "").trim(),
      descripcion_interna: String(p.descripcion_interna || p.descripcion_factura || p.nombre || "").trim(),
      descripcion_factura: String(p.descripcion_factura || "").trim(),
      cantidad_ajuste: Number(p.cantidad_ajuste || 0),
      unidad_inventario: String(p.unidad_inventario || "").trim()
    }))
    .filter(p => p.codigo_interno && Number.isFinite(p.cantidad_ajuste) && p.cantidad_ajuste !== 0);

  if (!limpias.length) throw new Error("Captura al menos una cantidad para ajustar.");

  const ahora = new Date();
  const fechaHoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,"0")}-${String(ahora.getDate()).padStart(2,"0")}`;
  const horaActual = `${String(ahora.getHours()).padStart(2,"0")}:${String(ahora.getMinutes()).padStart(2,"0")}`;
  const fecha = String(fechaMovimiento || fechaHoy).trim();
  const hora = String(horaMovimiento || horaActual).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Captura una fecha válida para el ajuste.");
  if (!/^\d{2}:\d{2}$/.test(hora)) throw new Error("Captura una hora válida para el ajuste.");
  const fechaEntrada = String(entrada.fecha || entrada.fecha_factura || "").slice(0, 10);
  if (fechaEntrada && fecha < fechaEntrada) throw new Error("La fecha del ajuste no puede ser anterior a la entrada original.");
  if (!String(motivo || "").trim()) throw new Error("El motivo del ajuste es obligatorio.");
  const id = `AJENT-${fecha.replaceAll("-", "")}-${hora.replace(":", "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const ajuste = {
    folioAjusteEntrada: id,
    tipo_movimiento: "AJUSTE_ENTRADA",
    entrada_id: entradaId,
    folioEntrada: String(entrada.folioEntrada || "").trim(),
    uuid_cfdi: String(entrada.uuid_cfdi || entradaId).trim(),
    rfc_emisor: String(entrada.rfc_emisor || "").trim(),
    razon_social_emisor: String(entrada.razon_social_emisor || "").trim(),
    serie: String(entrada.serie || "").trim(),
    folio: String(entrada.folio || "").trim(),
    fecha_movimiento: fecha,
    hora_movimiento: hora,
    motivo: String(motivo || "AJUSTE A ENTRADA").trim(),
    articulos: limpias,
    usuario,
    creado_en: ahora.toISOString(),
    timestamp: serverTimestamp()
  };

  await setDoc(doc(db, RUTA_AJUSTES_ENTRADA_ZAPATA, id), ajuste, { merge: false });
  return ajuste;
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
