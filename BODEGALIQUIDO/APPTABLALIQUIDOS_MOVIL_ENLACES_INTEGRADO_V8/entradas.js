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

const RUTA_ENTRADAS_ZAPATA = "almacenes/Almacen_Liquidos/entradas";

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
      equivalencia_id: eq?.id || "",
      texto_equivalencia: eq?.texto_factura || concepto.descripcion || "",
      equivalencia_encontrada: Boolean(eq)
    };
  });
}
function buscarEquivalenciaExactaParaConcepto(concepto, equivalencias = []) {
  const codigoFactura = normalizarTexto(concepto.noIdentificacion || "");
  const descripcionFactura = normalizarTexto(concepto.descripcion || "");
  const textoCompleto = normalizarTexto(`${concepto.noIdentificacion || ""} ${concepto.descripcion || ""}`);
  if (!codigoFactura && !descripcionFactura) return null;

  const activas = (Array.isArray(equivalencias) ? equivalencias : []).filter(e => e?.activo !== false);

  // 1) La descripción exacta es la llave principal del flujo móvil.
  let eq = activas.find(e => {
    const d = normalizarTexto(e.descripcion_normalizada || e.descripcion_factura || e.texto_normalizado || e.texto_factura || "");
    return descripcionFactura && d === descripcionFactura;
  });
  if (eq) return eq;

  // 2) Código exacto cuando una equivalencia moderna lo tiene guardado.
  eq = activas.find(e => {
    const c = normalizarTexto(e.codigo_factura || e.noIdentificacion || "");
    return codigoFactura && c === codigoFactura;
  });
  if (eq) return eq;

  // 3) Compatibilidad con equivalencias antiguas guardadas como código + descripción.
  eq = activas.find(e => normalizarTexto(e.texto_factura || "") === textoCompleto);
  if (eq) return eq;

  // 4) Compatibilidad con V3, donde texto_factura era sólo la descripción.
  return activas.find(e => normalizarTexto(e.texto_factura || "") === descripcionFactura) || null;
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

  const articulosInvalidos = articulos.filter(a => !a.equivalencia_encontrada);

  if (articulosInvalidos.length > 0) {
    throw new Error(
      "Hay conceptos sin equivalencia. Configúralos antes de autorizar."
    );
  }

  const ref = doc(db, RUTA_ENTRADAS_ZAPATA, uuid);

  const entrada = {
    folioEntrada: `ENT-ZAP-${fechaFolio()}-${uuid.slice(0, 6)}`,
    fecha: obtenerFechaFactura(factura),
    origen: "FACTURA_ALMACEN_CENTRAL",
    uuid_cfdi: uuid,

    estado_zapata: "ENTRADA_GENERADA",

    rfc_emisor: factura.rfc_emisor || "",
    razon_social_emisor: factura.razon_social_emisor || "",
    serie: factura.serie || "",
    folio: factura.folio || "",
    fecha_factura: obtenerFechaFactura(factura),
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
