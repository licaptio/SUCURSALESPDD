import {
  db,
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp
} from "./config.js";

const RUTA_ENTRADAS_CIGARRO = "almacenes/almacen_cigarro/entradas";
const FECHA_INVENTARIO_INICIAL_CIGARRO = "2026-06-23";

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

export async function generarEntradaCigarro(factura, articulos, usuario = "GERARDO") {
  const uuid = String(factura.uuid_cfdi || factura.id || "").toUpperCase();

  if (!uuid) {
    throw new Error("Factura sin UUID");
  }

  const fechaFacturaNormalizada = normalizarFechaEntradaCigarro(
    factura.fecha || factura.fecha_factura || factura.fecha_emision || factura.timestamp || ""
  );

  if (!fechaFacturaNormalizada) {
    throw new Error("La factura no tiene fecha válida. No se puede generar entrada.");
  }

  if (fechaFacturaNormalizada < FECHA_INVENTARIO_INICIAL_CIGARRO) {
    throw new Error(
      "Entrada bloqueada: el inventario inicial de Cigarro inicia el 23/06/2026. No se aceptan facturas anteriores."
    );
  }

  const articulosInvalidos = articulos.filter(a => !a.equivalencia_encontrada);

  if (articulosInvalidos.length > 0) {
    throw new Error(
      "Hay conceptos sin equivalencia. Configúralos antes de autorizar."
    );
  }

  const ref = doc(db, RUTA_ENTRADAS_CIGARRO, uuid);

  const entrada = {
    folioEntrada: `ENT-CIG-${fechaFolio()}-${uuid.slice(0, 6)}`,
    fecha: fechaFacturaNormalizada,
    fecha_registro: new Date().toISOString().slice(0, 10),
    origen: "FACTURA_ALMACEN_CENTRAL",
    uuid_cfdi: uuid,

    estado_cigarro: "ENTRADA_GENERADA",
    estado_zapata: "ENTRADA_GENERADA",

    rfc_emisor: factura.rfc_emisor || "",
    razon_social_emisor: factura.razon_social_emisor || "",
    serie: factura.serie || "",
    folio: factura.folio || "",
    fecha_factura: fechaFacturaNormalizada,
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

export async function cargarEntradasCigarro(max = 100) {
  const col = collection(db, RUTA_ENTRADAS_CIGARRO);

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


function normalizarFechaEntradaCigarro(valor) {
  if (!valor) return "";

  if (valor.toDate && typeof valor.toDate === "function") {
    return valor.toDate().toISOString().slice(0, 10);
  }

  if (valor.seconds) {
    return new Date(valor.seconds * 1000).toISOString().slice(0, 10);
  }

  const texto = String(valor).trim();

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const mx = texto.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (mx) {
    const dd = mx[1].padStart(2, "0");
    const mm = mx[2].padStart(2, "0");
    let yyyy = mx[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }

  const d = new Date(texto);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return "";
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
