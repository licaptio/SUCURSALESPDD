import { APP_CONFIG } from "./config.js";

const formateadorMoneda = new Intl.NumberFormat(APP_CONFIG.locale, {
  style: "currency",
  currency: APP_CONFIG.moneda,
  minimumFractionDigits: 2
});

export function moneda(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? formateadorMoneda.format(numero) : "$0.00";
}

export function fechaCorta(valor) {
  if (!valor) return "";

  let fecha;
  if (typeof valor?.toDate === "function") fecha = valor.toDate();
  else fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) return "";

  return new Intl.DateTimeFormat(APP_CONFIG.locale, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(fecha);
}

/**
 * Código principal para mostrar.
 * Se prioriza codigoBarra porque las fotos normalmente están ligadas al código de barras.
 */
export function obtenerCodigo(producto) {
  return String(
    producto.codigoBarra ??
    producto.codigo ??
    producto.codigo_barra ??
    producto.id ??
    ""
  ).trim();
}

/**
 * Devuelve todos los identificadores posibles para localizar la foto.
 */
export function obtenerCodigosFoto(producto) {
  return [...new Set([
    producto.codigoBarra,
    producto.codigo,
    producto.codigo_barra,
    producto.codigoEquivalente,
    producto.codigo_equivalente,
    producto.equivalente,
    producto.codigosEquivalentes,
    producto.codigos_equivalentes,
    producto.id
  ]
    .flatMap(valor => Array.isArray(valor) ? valor : [valor])
    .map(valor => String(valor ?? "").trim())
    .filter(Boolean)
  )];
}

export function normalizarEscalas(preciosPorCantidad) {
  if (!Array.isArray(preciosPorCantidad)) return [];

  return preciosPorCantidad
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const cantidad = item.cantidad ?? item.desde ?? item.minimo ?? item.piezas ?? item.qty;
      const precio = item.precio ?? item.valor ?? item.precioUnitario ?? item.price;

      if (cantidad == null || precio == null) return null;
      return { cantidad, precio };
    })
    .filter(Boolean);
}

export function normalizarTexto(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
