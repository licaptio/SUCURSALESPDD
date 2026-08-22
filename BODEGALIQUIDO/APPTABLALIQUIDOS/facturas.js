import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from "./config.js";

import {
  cargarEntradasZapata
} from "./entradas.js";

const RUTA_FACTURAS_ORIGEN = "almacenes/ALMACENCENTRALPDD/entradas";
const RUTA_ENTRADAS_ZAPATA = "almacenes/Almacen_Liquidos/entradas";
const RUTA_DECISIONES_ZAPATA = "almacenes/Almacen_Liquidos/decisiones_facturas";

const FECHA_PUNTO_CERO_LIQUIDOS = "2026-08-01";
const MAX_RFC_POR_CONSULTA = 30;

export async function cargarFacturasOrigen(max = 1000, rfcsAutorizados = []) {
  const col = collection(db, RUTA_FACTURAS_ORIGEN);
  const rfcs = [...new Set(
    (rfcsAutorizados || [])
      .map(r => String(r || "").trim().toUpperCase())
      .filter(Boolean)
  )];

  // OPTIMIZACIÓN PRINCIPAL:
  // 1) Punto cero: Firebase no recorre facturas anteriores al 01/08/2026.
  // 2) RFC: cuando Firestore lo permite, tampoco descarga proveedores no autorizados.
  // Los RFC se parten en bloques de 30 por el límite del operador "in".
  if (rfcs.length) {
    try {
      const bloques = [];
      for (let i = 0; i < rfcs.length; i += MAX_RFC_POR_CONSULTA) {
        bloques.push(rfcs.slice(i, i + MAX_RFC_POR_CONSULTA));
      }

      const snaps = await Promise.all(
        bloques.map(bloque => getDocs(query(
          col,
          where("rfc_emisor", "in", bloque),
          where("fecha", ">=", `${FECHA_PUNTO_CERO_LIQUIDOS}T00:00:00`),
          orderBy("fecha", "desc"),
          limit(max)
        )))
      );

      const mapa = new Map();
      snaps.forEach(snap => snap.docs.forEach(d => {
        mapa.set(d.id, { id: d.id, ...d.data() });
      }));

      return [...mapa.values()]
        .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
        .slice(0, max);
    } catch (error) {
      // Si falta un índice compuesto en Firestore, no detenemos la operación.
      // Se conserva el punto cero en servidor y el RFC se filtra localmente.
      console.warn("Filtro RFC en servidor no disponible; usando filtro local seguro:", error);
    }
  }

  const q = query(
    col,
    where("fecha", ">=", `${FECHA_PUNTO_CERO_LIQUIDOS}T00:00:00`),
    orderBy("fecha", "desc"),
    limit(max)
  );

  const snap = await getDocs(q);
  const permitidos = new Set(rfcs);

  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(f => !permitidos.size || permitidos.has(String(f.rfc_emisor || "").trim().toUpperCase()));
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

  // Primero reducimos localmente. Así no consultamos Firebase por facturas
  // que ni siquiera pertenecen a proveedores autorizados.
  const candidatas = facturas.filter(factura => {
    const uuid = obtenerUUIDFactura(factura);
    const rfc = String(factura.rfc_emisor || "").toUpperCase();
    return Boolean(uuid) && rfcsPermitidos.has(rfc) && facturaCumpleFechaMinima(factura);
  });

  if (!candidatas.length) return [];

  // Antes se hacían hasta DOS getDoc por cada factura (patrón N+1).
  // Ahora entradas y decisiones se descargan una sola vez y se comparan
  // en memoria, reduciendo drásticamente viajes de red.
  const [entradasSnap, decisionesSnap] = await Promise.all([
    getDocs(collection(db, RUTA_ENTRADAS_ZAPATA)),
    getDocs(collection(db, RUTA_DECISIONES_ZAPATA))
  ]);

  const uuidsConEntrada = new Set();
  entradasSnap.docs.forEach(d => {
    const data = d.data() || {};
    uuidsConEntrada.add(String(d.id || "").toUpperCase());
    if (data.uuid_cfdi) uuidsConEntrada.add(String(data.uuid_cfdi).toUpperCase());
  });

  const uuidsNoEntran = new Set();
  decisionesSnap.docs.forEach(d => {
    const data = d.data() || {};
    if (data.estado_zapata !== "NO_ENTRA_ZAPATA") return;
    uuidsNoEntran.add(String(d.id || "").toUpperCase());
    if (data.uuid_cfdi) uuidsNoEntran.add(String(data.uuid_cfdi).toUpperCase());
  });

  return candidatas.filter(factura => {
    const uuid = String(obtenerUUIDFactura(factura) || "").toUpperCase();
    return !uuidsConEntrada.has(uuid) && !uuidsNoEntran.has(uuid);
  });
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

  return fecha.slice(0, 10) >= FECHA_PUNTO_CERO_LIQUIDOS;
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