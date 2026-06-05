import {
  db,
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  limit,
  serverTimestamp
} from "./firebase.js";

const BASE_ZAPATA = "almacenes/almacen_zapata";
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

  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
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

export async function cargarProductosActivos(max = 1200) {
  const col = collection(db, RUTA_PRODUCTOS);

  const q = query(
    col,
    where("activo", "==", true),
    limit(max)
  );

  const snap = await getDocs(q);

  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

export function filtrarProductosCatalogo(productos, textoBusqueda) {
  const texto = normalizarTexto(textoBusqueda);

  if (!texto) {
    return productos.slice(0, 50);
  }

  const tokens = texto.split(" ").filter(Boolean);

  return productos
    .map(p => {
      const codigosEquivalentes = Array.isArray(p.codigosEquivalentes)
        ? p.codigosEquivalentes.join(" ")
        : "";

      const base = normalizarTexto(`
        ${p.codigoBarra || ""}
        ${p.concepto || ""}
        ${p.marca || ""}
        ${p.departamento || ""}
        ${codigosEquivalentes}
      `);

      let score = 0;

      for (const token of tokens) {
        if (base.includes(token)) score++;
      }

      if (String(p.codigoBarra || "").toUpperCase() === texto) {
        score += 10;
      }

      return {
        producto: p,
        score
      };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 80)
    .map(x => x.producto);
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
