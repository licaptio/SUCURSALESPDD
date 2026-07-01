import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
  serverTimestamp
} from "./firebase.js";

import {
  cargarEntradasZapata
} from "./entradas.js";

const RUTA_FACTURAS_ORIGEN = "almacenes/ALMACENCENTRALPDD/entradas";
const RUTA_ENTRADAS_ZAPATA = "almacenes/almacen_cigarro/entradas";
const RUTA_DECISIONES_ZAPATA = "almacenes/almacen_cigarro/decisiones_facturas";

const FECHA_MINIMA_ZAPATA = "2026-06-23";

export async function cargarFacturasOrigen(max = 300) {
  const col = collection(db, RUTA_FACTURAS_ORIGEN);

  const q = query(
    col,
    orderBy("timestamp", "desc"),
    limit(max)
  );

  const snap = await getDocs(q);

  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

export async function filtrarFacturasPendientesParaZapata(
  facturas,
  proveedoresAutorizados
) {
  const rfcsPermitidos = new Set(
    proveedoresAutorizados
      .filter(p => p.activo)
      .map(p => String(p.rfc_emisor || "").toUpperCase())
  );

  const resultado = [];

  for (const factura of facturas) {
    const uuid = obtenerUUIDFactura(factura);
    const rfc = String(factura.rfc_emisor || "").toUpperCase();

    if (!uuid) {
      continue;
    }

    if (!rfcsPermitidos.has(rfc)) {
      continue;
    }

    if (!facturaCumpleFechaMinima(factura)) {
      continue;
    }

    const yaExisteEntrada = await facturaYaEntradaZapata(uuid);

    if (yaExisteEntrada) {
      continue;
    }

    const decision = await cargarDecisionFacturaZapata(uuid);

    if (decision && decision.estado_zapata === "NO_ENTRA_ZAPATA") {
      continue;
    }

    resultado.push(factura);
  }

  return resultado;
}

export async function facturaYaEntradaZapata(uuid) {
  if (!uuid) return false;

  const ref = doc(
    db,
    RUTA_ENTRADAS_ZAPATA,
    String(uuid).toUpperCase()
  );

  const snap = await getDoc(ref);

  return snap.exists();
}

export async function cargarDecisionFacturaZapata(uuid) {
  if (!uuid) return null;

  const ref = doc(
    db,
    RUTA_DECISIONES_ZAPATA,
    String(uuid).toUpperCase()
  );

  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return null;
  }

  return {
    id: snap.id,
    ...snap.data()
  };
}

export async function marcarFacturaNoEntraZapata(
  factura,
  motivo = "",
  usuario = "GERARDO"
) {
  const uuid = obtenerUUIDFactura(factura);

  if (!uuid) {
    throw new Error("Factura sin UUID");
  }

  const ref = doc(
    db,
    RUTA_DECISIONES_ZAPATA,
    uuid
  );

  const decision = {
    uuid_cfdi: uuid,
    estado_zapata: "NO_ENTRA_ZAPATA",
    fecha_decision: new Date().toISOString(),

    motivo: String(motivo || "").trim(),
    usuario,

    rfc_emisor: factura.rfc_emisor || "",
    razon_social_emisor: factura.razon_social_emisor || "",
    serie: factura.serie || "",
    folio: factura.folio || "",
    fecha_factura: obtenerFechaFacturaTexto(factura),
    total_factura: Number(factura.total || 0),

    origen: "FACTURA_ALMACEN_CENTRAL",
    creado_en: new Date().toISOString(),
    timestamp: serverTimestamp()
  };

  await setDoc(ref, decision, { merge: true });

  return decision;
}

export async function cargarHistorialZapata(max = 200) {
  const entradas = await cargarEntradasZapata(max);

  const decisiones = await cargarDecisionesZapata(max);

  const historialEntradas = entradas.map(e => ({
    tipo_historial: "ENTRADA_GENERADA",
    estado_zapata: "ENTRADA_GENERADA",
    uuid_cfdi: e.uuid_cfdi || e.id || "",
    rfc_emisor: e.rfc_emisor || "",
    razon_social_emisor: e.razon_social_emisor || "",
    serie: e.serie || "",
    folio: e.folio || "",
    fecha_factura: e.fecha_factura || "",
    total_factura: Number(e.total_factura || 0),
    fecha_decision: e.creado_en || e.fecha || "",
    usuario: e.usuario || "",
    motivo: "",
    folioEntrada: e.folioEntrada || "",
    articulos: e.articulos || []
  }));

  const historialNoEntra = decisiones.map(d => ({
    tipo_historial: "NO_ENTRA_ZAPATA",
    estado_zapata: "NO_ENTRA_ZAPATA",
    uuid_cfdi: d.uuid_cfdi || d.id || "",
    rfc_emisor: d.rfc_emisor || "",
    razon_social_emisor: d.razon_social_emisor || "",
    serie: d.serie || "",
    folio: d.folio || "",
    fecha_factura: d.fecha_factura || "",
    total_factura: Number(d.total_factura || 0),
    fecha_decision: d.fecha_decision || d.creado_en || "",
    usuario: d.usuario || "",
    motivo: d.motivo || "",
    folioEntrada: "",
    articulos: []
  }));

  return [...historialEntradas, ...historialNoEntra]
    .sort((a, b) => {
      const fa = new Date(a.fecha_decision || 0).getTime();
      const fb = new Date(b.fecha_decision || 0).getTime();

      return fb - fa;
    });
}

async function cargarDecisionesZapata(max = 200) {
  const col = collection(db, RUTA_DECISIONES_ZAPATA);

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

function facturaCumpleFechaMinima(factura) {
  const fecha = obtenerFechaFacturaTexto(factura);

  if (!fecha) {
    return false;
  }

  return fecha.slice(0, 10) >= FECHA_MINIMA_ZAPATA;
}

function obtenerFechaFacturaTexto(factura) {
  const posibleFecha =
    factura.fecha ||
    factura.fecha_factura ||
    factura.fecha_emision ||
    factura.created_at ||
    "";

  if (!posibleFecha) {
    return "";
  }

  if (typeof posibleFecha === "string") {
    return posibleFecha.slice(0, 10);
  }

  if (posibleFecha.toDate && typeof posibleFecha.toDate === "function") {
    return posibleFecha.toDate().toISOString().slice(0, 10);
  }

  if (posibleFecha.seconds) {
    return new Date(posibleFecha.seconds * 1000).toISOString().slice(0, 10);
  }

  return String(posibleFecha).slice(0, 10);
}

function obtenerUUIDFactura(factura) {
  return String(factura.uuid_cfdi || factura.id || "").toUpperCase();
}