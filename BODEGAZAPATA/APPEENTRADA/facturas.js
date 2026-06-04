import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit
} from "./firebase.js";

const RUTA_FACTURAS_ORIGEN = "almacenes/ALMACENCENTRALPDD/entradas";
const RUTA_ENTRADAS_ZAPATA = "almacenes/almacen_zapata/entradas";

export async function cargarFacturasOrigen(max = 100) {
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
    const rfc = String(factura.rfc_emisor || "").toUpperCase();

    if (!rfcsPermitidos.has(rfc)) {
      continue;
    }

    const yaExiste = await facturaYaEntradaZapata(factura.uuid_cfdi || factura.id);

    if (!yaExiste) {
      resultado.push(factura);
    }
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