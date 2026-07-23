import { normalizarTexto, obtenerCodigosFoto } from "./formatos.js";

export function crearIndiceFotos(catalogo) {
  const porCodigo = new Map();
  const porConcepto = new Map();
  const porConceptoBase = new Map();

  for (const meta of catalogo) {
    const codigos = [
      meta.id,
      meta.codigoBarra,
      meta.codigo,
      meta.codigo_barra,
      meta.codigoEquivalente,
      meta.codigo_equivalente,
      meta.equivalente
    ]
      .map(valor => String(valor ?? "").trim())
      .filter(Boolean);

    for (const codigo of codigos) {
      agregarSiNoExiste(porCodigo, codigo, meta);
      agregarSiNoExiste(porCodigo, quitarCerosIzquierda(codigo), meta);
    }

    const conceptoOriginal = meta.concepto || meta.nombre || "";
    const concepto = normalizarTexto(conceptoOriginal);
    const conceptoBase = normalizarConceptoBase(conceptoOriginal);

    agregarSiNoExiste(porConcepto, concepto, meta);
    agregarSiNoExiste(porConceptoBase, conceptoBase, meta);
  }

  return { porCodigo, porConcepto, porConceptoBase, catalogo };
}

export function buscarMetaFoto(producto, indice) {
  for (const codigo of obtenerCodigosFoto(producto)) {
    const exacta = indice.porCodigo.get(codigo);
    if (exacta) return crearResultado(exacta, "codigo exacto", 1);

    const sinCeros = indice.porCodigo.get(quitarCerosIzquierda(codigo));
    if (sinCeros) return crearResultado(sinCeros, "codigo sin ceros", 1);
  }

  const conceptoOriginal = producto.concepto || producto.nombre || "";
  const concepto = normalizarTexto(conceptoOriginal);
  const exactaConcepto = indice.porConcepto.get(concepto);
  if (exactaConcepto) return crearResultado(exactaConcepto, "concepto exacto", 1);

  const conceptoBase = normalizarConceptoBase(conceptoOriginal);
  const exactaBase = indice.porConceptoBase.get(conceptoBase);
  if (exactaBase) return crearResultado(exactaBase, "concepto base", 0.99);

  const aproximada = buscarPorSimilitud(conceptoOriginal, indice.catalogo);
  return aproximada;
}

export function extraerPrimeraUrl(meta) {
  if (!meta || typeof meta !== "object") return null;

  if (Array.isArray(meta.urlsFotos)) {
    const url = meta.urlsFotos.find(esUrlHttp);
    if (url) return url.trim();
  }

  return buscarUrlRecursiva(meta);
}

export function extraerTodasLasUrls(meta) {
  if (!meta || typeof meta !== "object") return [];

  const urls = new Set();
  buscarTodasLasUrls(meta, urls, new WeakSet());
  return [...urls];
}

export function normalizarConceptoBase(texto) {
  return normalizarTexto(texto)
    .replace(/\s+\/\s*\d+\s*$/g, "")
    .replace(/\s+C\s*\/\s*\d+\s*$/g, "")
    .replace(/\s+\d+\s*(PZA|PZAS|PIEZA|PIEZAS|PZS)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buscarPorSimilitud(conceptoProducto, catalogo) {
  const baseProducto = normalizarConceptoBase(conceptoProducto);
  if (!baseProducto) return null;

  let mejorMeta = null;
  let mejorPuntaje = 0;

  for (const meta of catalogo) {
    const baseFoto = normalizarConceptoBase(meta.concepto || meta.nombre || "");
    if (!baseFoto) continue;

    const puntaje = calcularSimilitud(baseProducto, baseFoto);
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorMeta = meta;
    }
  }

  // Umbral alto para no asignar fotos de artículos distintos.
  if (!mejorMeta || mejorPuntaje < 0.82) return null;
  return crearResultado(mejorMeta, "concepto aproximado", mejorPuntaje);
}

function calcularSimilitud(textoA, textoB) {
  if (textoA === textoB) return 1;

  const palabrasA = new Set(textoA.split(" ").filter(Boolean));
  const palabrasB = new Set(textoB.split(" ").filter(Boolean));
  if (!palabrasA.size || !palabrasB.size) return 0;

  let interseccion = 0;
  for (const palabra of palabrasA) {
    if (palabrasB.has(palabra)) interseccion += 1;
  }

  const union = new Set([...palabrasA, ...palabrasB]).size;
  const jaccard = union ? interseccion / union : 0;

  const contiene = textoA.includes(textoB) || textoB.includes(textoA);
  return contiene ? Math.max(jaccard, 0.9) : jaccard;
}

function crearResultado(meta, metodo, similitud) {
  return { meta, metodo, similitud };
}

function agregarSiNoExiste(mapa, clave, valor) {
  if (clave && !mapa.has(clave)) mapa.set(clave, valor);
}

function quitarCerosIzquierda(valor) {
  const texto = String(valor ?? "").trim();
  const limpio = texto.replace(/^0+/, "");
  return limpio || "0";
}

function buscarUrlRecursiva(valor, visitados = new WeakSet()) {
  if (esUrlHttp(valor)) return valor.trim();
  if (!valor || typeof valor !== "object") return null;
  if (visitados.has(valor)) return null;
  visitados.add(valor);

  for (const item of Object.values(valor)) {
    const encontrada = buscarUrlRecursiva(item, visitados);
    if (encontrada) return encontrada;
  }
  return null;
}


function buscarTodasLasUrls(valor, urls, visitados) {
  if (esUrlHttp(valor)) {
    urls.add(valor.trim());
    return;
  }

  if (!valor || typeof valor !== "object") return;
  if (visitados.has(valor)) return;
  visitados.add(valor);

  for (const item of Object.values(valor)) {
    buscarTodasLasUrls(item, urls, visitados);
  }
}

function esUrlHttp(valor) {
  return typeof valor === "string" && /^https?:\/\//i.test(valor.trim());
}
