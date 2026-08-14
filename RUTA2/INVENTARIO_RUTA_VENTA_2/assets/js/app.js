import { db, APP_CONFIG } from "./config.js";
import { enviarAjusteTelegram } from "./telegramAjustes.js";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  setDoc,
  deleteDoc,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function refDesdeRuta(segmentos) {
  return collection(db, ...segmentos);
}

const REF_INVENTARIO_RUTA2 = refDesdeRuta(APP_CONFIG.colecciones.inventarios);
const REF_ENTRADAS_RUTA2 = refDesdeRuta(APP_CONFIG.colecciones.entradas);
const REF_VENTAS_RUTAV2 = refDesdeRuta(APP_CONFIG.colecciones.ventas);
const REF_AJUSTES_RUTA2 = refDesdeRuta(APP_CONFIG.colecciones.ajustes);
const REF_CONTEOS_RUTA2 = refDesdeRuta(APP_CONFIG.colecciones.conteos);

let FECHA_BASE_INVENTARIO = APP_CONFIG.fechaBaseInventario;
let FECHA_INICIO_MINIMA = APP_CONFIG.fechaInicioMinima;
let CORTE_INVENTARIO_TXT = APP_CONFIG.corteInventario;
const RUTA_ID_VENTAS = APP_CONFIG.rutaIdVentas;

const $ = (id) => document.getElementById(id);

let registrosDetalleSemana = [];
let registrosDetalleAcumuladoAnterior = [];
let registrosEntradasSemana = [];
let registrosEntradasAcumuladoAnterior = [];
let registrosDetalleMovimientoSemana = [];
let registrosAjustesSemana = [];
let registrosAjustesAcumuladoAnterior = [];
let registrosPivot = [];
let fechasColumnas = [];

let inventarioInicialOriginal = {};
let proveedoresAutorizadosPivot = {};
let vistaActual = "resumen";
let seleccionConteo = new Set();
let listaConteoEditandoId = null;
let listasConteoActuales = [];

let appCargada = false;
let cacheBaseCargado = false;
let cacheInventarioInicial = {};
let cacheVentasTodas = [];
let cacheEntradasTodas = [];
let cacheAjustesTodos = [];
let cacheSemanas = new Map();
let cargaBasePromise = null;

let rangoSemanaActual = {
  inicio: FECHA_BASE_INVENTARIO,
  fin: FECHA_BASE_INVENTARIO,
  acumuladoAnteriorFin: ""
};

async function abrirCachePersistente() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(APP_CONFIG.cache.dbName, APP_CONFIG.cache.version);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(APP_CONFIG.cache.store)) {
        idb.createObjectStore(APP_CONFIG.cache.store, { keyPath: "clave" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function guardarCachePersistente(clave, valor) {
  try {
    const idb = await abrirCachePersistente();
    await new Promise((resolve, reject) => {
      const tx = idb.transaction(APP_CONFIG.cache.store, "readwrite");
      tx.objectStore(APP_CONFIG.cache.store).put({ clave, valor, guardadoEn: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    idb.close();
  } catch (error) {
    console.warn("No se pudo guardar caché persistente:", error);
  }
}

async function leerCachePersistente(clave) {
  try {
    const idb = await abrirCachePersistente();
    const registro = await new Promise((resolve, reject) => {
      const tx = idb.transaction(APP_CONFIG.cache.store, "readonly");
      const req = tx.objectStore(APP_CONFIG.cache.store).get(clave);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    idb.close();
    if (!registro) return null;
    const ttl = APP_CONFIG.cache.ttlHoras * 60 * 60 * 1000;
    return Date.now() - registro.guardadoEn <= ttl ? registro.valor : null;
  } catch (error) {
    console.warn("No se pudo leer caché persistente:", error);
    return null;
  }
}

function hoyISO() {
  return fechaISOLocal(new Date());
}

function fechaISOLocal(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function crearFechaLocal(fechaISO) {
  const [yyyy, mm, dd] = String(fechaISO).split("-").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function sumarDias(fechaISO, dias) {
  const d = crearFechaLocal(fechaISO);
  d.setDate(d.getDate() + dias);
  return fechaISOLocal(d);
}

function normalizarFecha(valor) {
  if (!valor) return "";

  if (typeof valor === "string") {
    const v = valor.trim();

    const m1 = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m1) {
      const [, dd, mm, yyyy] = m1;
      return `${yyyy}-${mm}-${dd}`;
    }

    const m2 = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m2) {
      return `${m2[1]}-${m2[2]}-${m2[3]}`;
    }

    return v.substring(0, 10);
  }

  if (valor && typeof valor.toDate === "function") {
    return fechaISOLocal(valor.toDate());
  }

  if (valor && typeof valor.seconds === "number") {
    return fechaISOLocal(new Date(valor.seconds * 1000));
  }

  return String(valor).trim();
}


function parseFechaCompleta(...vals) {
  for (const val of vals) {
    if (val === null || val === undefined || val === "") continue;

    if (typeof val?.toDate === "function") return val.toDate();

    if (typeof val === "number") {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) return d;
    }

    if (typeof val === "string") {
      let s = val.trim();

      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
        s = s.replace(" ", "T") + "-06:00";
      }

      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  return null;
}

function fechaCorta(fechaISO) {
  if (!fechaISO || !fechaISO.includes("-")) return fechaISO || "";
  const [yyyy, mm, dd] = fechaISO.split("-");
  return `${dd}/${mm}/${String(yyyy).slice(-2)}`;
}

function normalizarCodigo(valor) {
  const s = String(valor ?? "").trim();
  if (!s) return "";

  const soloDigitos = s.replace(/\D/g, "");
  if (!soloDigitos) return s.toLowerCase();

  return soloDigitos.replace(/^0+/, "") || "0";
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtCelda(n) {
  const num = Number(n || 0);
  if (!num) return "";
  return num.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function setStatus(msg) {
  const status = $("status");
  if (status) status.textContent = msg;

  const loaderMsg = $("loaderMsg");
  if (loaderMsg) loaderMsg.textContent = msg;
}

function setProgress(porcentaje) {
  const bar = $("loaderBar");
  if (bar) bar.style.width = Math.max(0, Math.min(100, porcentaje)) + "%";
}

function ocultarLoader() {
  const loader = $("loader");
  if (loader) loader.classList.add("hide");
}

function mostrarLoaderEntrada(msg = "Entrando a la aplicación...") {
  const loader = $("loader");
  if (!loader) return;
  loader.classList.remove("hide");
  loader.classList.remove("transition");
  setStatus(msg);
  setProgress(5);
}

function mostrarTransicionSemana(msg = "Calculando semana...") {
  const loader = $("loader");
  if (!loader) return;
  loader.classList.remove("hide");
  loader.classList.add("transition");
  setStatus(msg);
  setProgress(35);
}

function ocultarTransiciones() {
  const loader = $("loader");
  if (!loader) return;
  loader.classList.add("hide");
  loader.classList.remove("transition");
}

function obtenerSemanaActualInput() {
  const hoy = new Date();
  const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const dia = fecha.getDay();
  const jueves = new Date(fecha);
  jueves.setDate(fecha.getDate() + (4 - (dia || 7)));

  const inicioAnio = new Date(jueves.getFullYear(), 0, 1);
  const semana = Math.ceil((((jueves - inicioAnio) / 86400000) + 1) / 7);

  return `${jueves.getFullYear()}-W${String(semana).padStart(2, "0")}`;
}

function obtenerWeekDesdeFecha(fechaISO) {
  const fecha = crearFechaLocal(fechaISO);
  const dia = fecha.getDay() || 7;
  const jueves = new Date(fecha);
  jueves.setDate(fecha.getDate() + (4 - dia));

  const inicioAnio = new Date(jueves.getFullYear(), 0, 1);
  const semana = Math.ceil((((jueves - inicioAnio) / 86400000) + 1) / 7);

  return `${jueves.getFullYear()}-W${String(semana).padStart(2, "0")}`;
}

function aplicarLimiteSelectorSemana() {
  const selector = $("selectorSemana");
  if (!selector || !FECHA_INICIO_MINIMA) return;

  const semanaMinima = obtenerWeekDesdeFecha(FECHA_INICIO_MINIMA);
  selector.min = semanaMinima;

  if (!selector.value || selector.value < semanaMinima) {
    selector.value = semanaMinima;
  }

  const fechaInicio = $("fechaInicio");
  if (fechaInicio) {
    fechaInicio.min = FECHA_INICIO_MINIMA;
    fechaInicio.value = FECHA_INICIO_MINIMA;
  }

  const textoBase = $("textoFechaBase");
  if (textoBase) textoBase.textContent = fechaCorta(FECHA_BASE_INVENTARIO);
}

function obtenerRangoDomingoSabadoDesdeWeek(valorWeek) {
  if (!valorWeek) {
    return {
      inicio: FECHA_BASE_INVENTARIO,
      fin: sumarDias(FECHA_BASE_INVENTARIO, 6)
    };
  }

  const [anioTexto, semanaTexto] = valorWeek.split("-W");
  const anio = Number(anioTexto);
  const semana = Number(semanaTexto);

  const enero4 = new Date(anio, 0, 4);
  const diaSemana = enero4.getDay() || 7;

  const lunesSemana1 = new Date(enero4);
  lunesSemana1.setDate(enero4.getDate() - diaSemana + 1);

  const lunes = new Date(lunesSemana1);
  lunes.setDate(lunesSemana1.getDate() + (semana - 1) * 7);

  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() - 1);

  const sabado = new Date(domingo);
  sabado.setDate(domingo.getDate() + 6);

  let inicio = fechaISOLocal(domingo);
  let fin = fechaISOLocal(sabado);

  if (inicio < FECHA_INICIO_MINIMA) inicio = FECHA_INICIO_MINIMA;
  if (fin < inicio) fin = inicio;

  return { inicio, fin };
}

function obtenerRangoSemana() {
  const selectorSemana = $("selectorSemana");
  const valorWeek = selectorSemana?.value || obtenerSemanaActualInput();

  if (selectorSemana && !selectorSemana.value) {
    selectorSemana.value = valorWeek;
  }

  const rango = obtenerRangoDomingoSabadoDesdeWeek(valorWeek);
  const acumuladoAnteriorFin = sumarDias(rango.inicio, -1);

  rangoSemanaActual = {
    inicio: rango.inicio,
    fin: rango.fin,
    acumuladoAnteriorFin
  };

  if ($("fechaInicio")) $("fechaInicio").value = rango.inicio;
  if ($("fechaFin")) $("fechaFin").value = rango.fin;

  return rangoSemanaActual;
}

function crearFechasSemana(inicio, fin) {
  const fechas = [];
  let actual = inicio;

  while (actual <= fin) {
    fechas.push(actual);
    actual = sumarDias(actual, 1);
  }

  return fechas;
}

function obtenerAliasProveedorPivot(rfc, razonSocial) {
  return String(razonSocial || rfc || "ENTRADA").trim();
}

function obtenerProveedoresEntradaPorFecha(fecha) {
  const proveedores = registrosEntradasSemana
    .filter(x => x.fecha === fecha)
    .map(x => String(x.alias_pivot || x.proveedor || x.entrega || "").trim())
    .filter(Boolean);

  return [...new Set(proveedores)].join(" / ");
}

async function cargarInventarioInicial() {
  if (cacheBaseCargado && cacheInventarioInicial) {
    inventarioInicialOriginal = cacheInventarioInicial;
    aplicarLimiteSelectorSemana();
    return cacheInventarioInicial;
  }

  const inventario = {};
  const registrosInventario = [];

  setStatus("Detectando fecha del inventario inicial en Firebase...");
  setProgress(12);

  const snap = await getDocs(REF_INVENTARIO_RUTA2);

  snap.forEach((docu) => {
    const p = docu.data() || {};
    if (p.eliminado === true) return;

    const fechaRegistroCompleta = parseFechaCompleta(
      p.fecha,
      p.fechaHora,
      p.createdAt,
      p.epochMs,
      docu.id
    );

    registrosInventario.push({
      docu,
      p,
      fechaRegistroCompleta,
      fechaISO: fechaRegistroCompleta ? fechaISOLocal(fechaRegistroCompleta) : ""
    });
  });

  const fechasValidas = registrosInventario
    .map(x => x.fechaISO)
    .filter(Boolean)
    .sort();

  if (fechasValidas.length) {
    FECHA_BASE_INVENTARIO = fechasValidas[0];
    FECHA_INICIO_MINIMA = FECHA_BASE_INVENTARIO;
    CORTE_INVENTARIO_TXT = `${FECHA_BASE_INVENTARIO} 23:59:59`;
  }

  aplicarLimiteSelectorSemana();
  setStatus(`Cargando inventario inicial Ruta 2 del ${fechaCorta(FECHA_BASE_INVENTARIO)}...`);

  let partidasLeidas = 0;

  registrosInventario.forEach(({ docu, p, fechaISO }) => {
    // La fecha más antigua encontrada es el inventario inicial.
    // Todo lo anterior queda fuera y no se considera en ningún cálculo.
    if (fechaISO && fechaISO !== FECHA_BASE_INVENTARIO) return;
    if (!fechaISO && fechasValidas.length) return;

    const codigoOriginal = String(p.codigo || p.productoId || p.codigoOriginal || docu.id || "").trim();
    const codigoKey = normalizarCodigo(codigoOriginal);
    const nombre = String(p.descripcion || p.nombre || p.concepto || "").trim();
    const cantidad = Number(p.cantidad ?? p.existencia ?? 0);

    if (!codigoKey && !nombre && !cantidad) return;

    const key = codigoKey || nombre.toLowerCase();

    if (!inventario[key]) {
      inventario[key] = {
        codigo: codigoOriginal,
        codigoKey,
        nombre,
        inviniOriginal: 0,
        fechaBase: FECHA_BASE_INVENTARIO
      };
    }

    inventario[key].inviniOriginal += cantidad;

    if (!inventario[key].codigo && codigoOriginal) inventario[key].codigo = codigoOriginal;
    if (!inventario[key].nombre && nombre) inventario[key].nombre = nombre;

    partidasLeidas++;
  });

  inventarioInicialOriginal = inventario;
  cacheInventarioInicial = inventario;

  setStatus(
    `Inventario inicial detectado: ${fechaCorta(FECHA_BASE_INVENTARIO)}. Partidas: ${partidasLeidas}.`
  );

  return inventario;
}


async function cargarVentasRuta2UnaVez() {
  if (cacheBaseCargado && cacheVentasTodas.length) return cacheVentasTodas;

  setStatus("Cargando ventas Ruta 2...");
  setProgress(45);

  const q = query(
    REF_VENTAS_RUTAV2,
    where("rutaId", "==", RUTA_ID_VENTAS)
  );

  const snap = await getDocs(q);
  const ventas = [];

  snap.forEach((documento) => {
    const data = documento.data() || {};
    if (data.cancelada === true || data.estatus === "cancelada") return;
    if (data.rutaId !== RUTA_ID_VENTAS) return;

    const fecha = normalizarFecha(data.fecha || data.facturada_at || data.fecha_txt || data.createdAt || "");
    if (!fecha || fecha < FECHA_INICIO_MINIMA) return;

    const articulos = Array.isArray(data.detalle) ? data.detalle : [];

    articulos.forEach((art, idx) => {
      const codigoOriginal = String(art.codigo ?? art.id ?? art.codigoBarra ?? "").trim();
      const codigoKey = normalizarCodigo(codigoOriginal);
      const nombre = String(art.nombre ?? art.descripcion ?? art.concepto ?? "").trim();
      const cantidad = Number(art.cantidad || 0);

      if (!codigoKey && !nombre && !cantidad) return;

      ventas.push({
        tipo: "SALIDA",
        docId: documento.id,
        partida: idx + 1,
        folio: String(data.folio || data.folio_fiscal || data.factura || documento.id || "").trim(),
        fecha,
        destino: String(data.cliente || "VENTA RUTA 2").trim(),
        entrega: String(data.usuarioNombre || data.usuario || "").trim(),
        recibe: String(data.cliente || "").trim(),
        folioCincho: "",
        proveedor: "",
        alias_pivot: "",
        rfc_emisor: "",
        razon_social_emisor: "",
        codigo: codigoOriginal,
        codigoKey,
        nombre,
        cantidad
      });
    });
  });

  cacheVentasTodas = ventas;
  return ventas;
}

async function consultarSalidas(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0 };

  const ventas = await cargarVentasRuta2UnaVez();
  const detalle = ventas.filter(x => x.fecha >= inicio && x.fecha <= fin);
  const docsVistos = new Set(detalle.map(x => x.docId));

  return {
    detalle,
    totalDocs: docsVistos.size
  };
}


function obtenerArticulosEntradaRuta2(data) {
  if (Array.isArray(data.articulos)) return data.articulos;
  if (Array.isArray(data.detalle)) return data.detalle;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.productos)) return data.productos;

  if (
    data.codigo ||
    data.codigoBarra ||
    data.id ||
    data.productoId ||
    data.codigo_interno
  ) {
    return [data];
  }

  return [];
}

async function cargarEntradasRuta2UnaVez() {
  if (cacheBaseCargado && cacheEntradasTodas.length) return cacheEntradasTodas;

  setStatus("Cargando entradas Ruta 2...");
  setProgress(65);

  const snap = await getDocs(REF_ENTRADAS_RUTA2);
  const entradas = [];

  snap.forEach((documento) => {
    const data = documento.data() || {};

    const fecha = normalizarFecha(
      data.fecha ||
      data.fecha_factura ||
      data.creado_en ||
      data.createdAt ||
      data.fechaRegistro ||
      data.timestamp ||
      ""
    );

    if (!fecha || fecha < FECHA_INICIO_MINIMA) return;

    const proveedor = String(
      data.proveedor ||
      data.proveedorNombre ||
      data.razon_social_emisor ||
      data.usuario ||
      "ENTRADA RUTA 2"
    ).trim();

    const articulos = obtenerArticulosEntradaRuta2(data);

    articulos.forEach((art, idx) => {
      const codigoOriginal = String(
        art.codigo_interno ||
        art.codigo ||
        art.codigoBarra ||
        art.id ||
        art.productoId ||
        ""
      ).trim();

      const codigoKey = normalizarCodigo(codigoOriginal);

      const nombre = String(
        art.descripcion_interna ||
        art.descripcion_factura ||
        art.descripcion ||
        art.concepto ||
        art.nombre ||
        ""
      ).trim();

      const cantidad = Number(
        art.cantidad_entrada ||
        art.cantidadEntrada ||
        art.cantidad ||
        art.piezas ||
        art.unidades ||
        0
      );

      if (!codigoKey && !nombre && !cantidad) return;

      entradas.push({
        tipo: "ENTRADA",
        docId: documento.id,
        partida: idx + 1,
        folio: String(data.folioEntrada || data.folio || data.folioRegistro || documento.id || "").trim(),
        fecha,
        destino: "ALMACÉN RUTA 2",
        entrega: proveedor,
        recibe: String(data.usuario || data.usuarioNombre || "").trim(),
        folioCincho: "",
        proveedor,
        rfc_emisor: String(data.rfc_emisor || "").trim().toUpperCase(),
        razon_social_emisor: String(data.razon_social_emisor || proveedor || "").trim(),
        alias_pivot: proveedor,
        codigo: codigoOriginal,
        codigoKey,
        nombre,
        cantidad
      });
    });
  });

  cacheEntradasTodas = entradas;
  return entradas;
}

async function consultarEntradas(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0 };

  const entradas = await cargarEntradasRuta2UnaVez();
  const detalle = entradas.filter(x => x.fecha >= inicio && x.fecha <= fin);
  const docsVistos = new Set(detalle.map(x => x.docId));

  return {
    detalle,
    totalDocs: docsVistos.size
  };
}




function fechaHoraAjusteComparable(fecha, hora = "00:00") {
  return `${normalizarFecha(fecha)}T${String(hora || "00:00").slice(0, 5)}`;
}

async function cargarAjustesRuta2UnaVez() {
  if (cacheBaseCargado && cacheAjustesTodos.length) return cacheAjustesTodos;

  setStatus("Cargando ajustes Ruta 2...");
  setProgress(72);

  const snap = await getDocs(REF_AJUSTES_RUTA2);
  const ajustes = [];

  snap.forEach((documento) => {
    const data = documento.data() || {};
    if (data.eliminado === true) return;

    const fecha = normalizarFecha(data.fecha || data.fechaRegistro || data.createdAt || "");
    if (!fecha || fecha < FECHA_INICIO_MINIMA) return;

    const hora = String(data.hora || "00:00").slice(0, 5);
    const codigoOriginal = String(data.codigo || data.productoId || data.codigoOriginal || "").trim();
    const codigoKey = normalizarCodigo(data.codigoKey || codigoOriginal);
    const nombre = String(data.nombre || data.descripcion || data.concepto || "").trim();
    const diferencia = Number(data.diferencia ?? data.ajuste ?? data.cantidad ?? 0);

    if (!codigoKey && !nombre) return;

    ajustes.push({
      tipo: "AJUSTE",
      docId: documento.id,
      partida: 1,
      folio: String(data.folio || `AJ-${documento.id.slice(0, 8)}`).trim(),
      fecha,
      hora,
      fechaHoraOrden: fechaHoraAjusteComparable(fecha, hora),
      destino: diferencia >= 0 ? "AJUSTE POSITIVO" : "AJUSTE NEGATIVO",
      entrega: String(data.usuario || data.usuarioNombre || "SISTEMA").trim(),
      recibe: `FÍSICO ${Number(data.fisico ?? 0)}`,
      proveedor: "",
      alias_pivot: "AJUSTE",
      rfc_emisor: "",
      razon_social_emisor: "",
      codigo: codigoOriginal,
      codigoKey,
      nombre,
      cantidad: diferencia,
      teorico: Number(data.teorico ?? 0),
      fisico: Number(data.fisico ?? 0),
      diferencia
    });
  });

  cacheAjustesTodos = ajustes.sort((a, b) => a.fechaHoraOrden.localeCompare(b.fechaHoraOrden));
  return cacheAjustesTodos;
}

function obtenerProductoPorCodigo(codigo) {
  const key = normalizarCodigo(codigo);
  if (!key) return null;

  return Object.values(inventarioInicialOriginal).find(x => x.codigoKey === key) ||
    [...cacheEntradasTodas, ...cacheVentasTodas, ...cacheAjustesTodos].find(x => x.codigoKey === key) || null;
}

function calcularExistenciaTeoricaHasta(codigoKey, fecha, hora) {
  const producto = Object.values(inventarioInicialOriginal).find(x => x.codigoKey === codigoKey);
  let existencia = Number(producto?.inviniOriginal || 0);

  cacheEntradasTodas.forEach(x => {
    if (x.codigoKey === codigoKey && x.fecha <= fecha) existencia += Number(x.cantidad || 0);
  });

  cacheVentasTodas.forEach(x => {
    if (x.codigoKey === codigoKey && x.fecha <= fecha) existencia -= Number(x.cantidad || 0);
  });

  const limite = fechaHoraAjusteComparable(fecha, hora);
  cacheAjustesTodos.forEach(x => {
    if (x.codigoKey === codigoKey && x.fechaHoraOrden < limite) existencia += Number(x.diferencia || 0);
  });

  return existencia;
}

function establecerFechaHoraActualAjuste() {
  const ahora = new Date();
  const fechaActual = hoyISO() < FECHA_INICIO_MINIMA ? FECHA_INICIO_MINIMA : hoyISO();
  const horaActual = ahora.toTimeString().slice(0, 5);
  if ($("ajusteFecha")) $("ajusteFecha").value = fechaActual;
  if ($("ajusteHora")) $("ajusteHora").value = horaActual;
}

function actualizarPreviewAjuste() {
  const codigo = $("ajusteCodigo")?.value || "";
  const producto = obtenerProductoPorCodigo(codigo);
  $("ajusteNombre").value = producto?.nombre || "";
}

async function guardarAjuste() {
  establecerFechaHoraActualAjuste();
  const codigo = String($("ajusteCodigo")?.value || "").trim();
  const fecha = $("ajusteFecha")?.value || "";
  const hora = $("ajusteHora")?.value || "";
  const fisicoTexto = $("ajusteFisico")?.value;
  const producto = obtenerProductoPorCodigo(codigo);

  if (!producto) return alert("El código no existe en el inventario o movimientos de Ruta 2.");
  if (!fecha || fecha < FECHA_INICIO_MINIMA) return alert(`La fecha debe ser igual o posterior a ${fechaCorta(FECHA_INICIO_MINIMA)}.`);
  if (!hora) return alert("Captura la hora del ajuste.");
  if (fisicoTexto === "" || Number.isNaN(Number(fisicoTexto))) return alert("Captura la existencia física.");

  const teorico = calcularExistenciaTeoricaHasta(producto.codigoKey, fecha, hora);
  const fisico = Number(fisicoTexto);
  const diferencia = fisico - teorico;

  if (diferencia === 0 && !confirm("El físico ya coincide con el teórico. ¿Registrar ajuste en cero?")) return;

  const mensaje = `Código: ${producto.codigo}\n${producto.nombre}\nTeórico: ${fmtNum(teorico)}\nFísico: ${fmtNum(fisico)}\nDiferencia: ${fmtNum(diferencia)}\n\n¿Guardar el ajuste?`;
  if (!confirm(mensaje)) return;

  const btn = $("btnGuardarAjuste");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const folioAjuste = `AJU-RUTA2-${fecha.replaceAll("-", "")}-${hora.replace(":", "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    await addDoc(REF_AJUSTES_RUTA2, {
      fecha,
      hora,
      fechaHora: `${fecha} ${hora}:00`,
      codigo: producto.codigo || codigo,
      codigoKey: producto.codigoKey,
      nombre: producto.nombre || "",
      teorico,
      fisico,
      diferencia,
      ajuste: diferencia,
      tipo: diferencia >= 0 ? "ENTRADA_AJUSTE" : "SALIDA_AJUSTE",
      rutaId: "RUTA2",
      lote_folio: folioAjuste,
      creadoEn: serverTimestamp()
    });

    try {
      await enviarAjusteTelegram({
        folio: folioAjuste, fecha, hora,
        codigo: producto.codigo || codigo,
        nombre: producto.nombre || "",
        teorico, fisico, diferencia
      });
    } catch (telegramError) {
      console.error("Ajuste guardado, pero falló Telegram:", telegramError);
      alert("El ajuste se guardó correctamente, pero no se pudo enviar la notificación a Telegram: " + telegramError.message);
    }

    cacheBaseCargado = false;
    cacheAjustesTodos = [];
    cacheSemanas.clear();
    cargaBasePromise = null;
    limpiarFormularioAjuste();
    await cargarMovimientosRuta2();
    mostrarVistaAjustes();
    pintarHistorialAjustes();
  } catch (error) {
    console.error(error);
    alert("No se pudo guardar el ajuste: " + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Registrar ajuste";
  }
}

function mostrarVistaAjustes() {
  $("vistaInventario").classList.add("hide");
  $("vistaAjustes").classList.remove("hide");
  prepararModuloAjustes();
  pintarHistorialAjustes();
}

function mostrarVistaInventario() {
  $("vistaAjustes").classList.add("hide");
  $("vistaConteo").classList.add("hide");
  $("vistaInventario").classList.remove("hide");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function prepararModuloAjustes() {
  const lista = $("listaCodigosAjuste");
  if (lista && !lista.dataset.cargada) {
    const productos = new Map();
    Object.values(inventarioInicialOriginal).forEach(p => productos.set(p.codigoKey, p));
    [...cacheEntradasTodas, ...cacheVentasTodas, ...cacheAjustesTodos].forEach(p => {
      if (p.codigoKey && !productos.has(p.codigoKey)) productos.set(p.codigoKey, p);
    });
    lista.innerHTML = [...productos.values()]
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"))
      .map(p => `<option value="${escapeHtml(p.codigo)}">${escapeHtml(p.nombre)}</option>`)
      .join("");
    lista.dataset.cargada = "1";
  }

  establecerFechaHoraActualAjuste();
  $("ajusteCodigo").focus();
  actualizarPreviewAjuste();
}

function limpiarFormularioAjuste() {
  $("formAjuste").reset();
  $("ajusteNombre").value = "";
  establecerFechaHoraActualAjuste();
  $("ajusteCodigo").focus();
}

function pintarHistorialAjustes() {
  const tbody = $("tablaHistorialAjustes")?.querySelector("tbody");
  if (!tbody) return;
  const datos = [...cacheAjustesTodos].sort((a, b) => b.fechaHoraOrden.localeCompare(a.fechaHoraOrden));
  tbody.innerHTML = datos.length ? datos.slice(0, 200).map(x => `
    <tr>
      <td>${escapeHtml(x.fecha || "")}</td>
      <td>${escapeHtml(x.hora || "")}</td>
      <td>${escapeHtml(x.codigo || "")}</td>
      <td>${escapeHtml(x.nombre || "")}</td>
      <td class="cantidad">${fmtNum(x.teorico)}</td>
      <td class="cantidad">${fmtNum(x.fisico)}</td>
      <td class="cantidad ${Number(x.diferencia) > 0 ? "positivo" : Number(x.diferencia) < 0 ? "negativo" : ""}">${fmtNum(x.diferencia)}</td>
    </tr>`).join("") : '<tr><td colspan="7" class="sin-datos">No hay ajustes registrados.</td></tr>';
  $("estadoHistorialAjustes").textContent = `${datos.length} ajuste(s) cargado(s).`;
}

async function asegurarDatosBaseCargados() {
  if (cacheBaseCargado) return;

  if (cargaBasePromise) {
    await cargaBasePromise;
    return;
  }

  cargaBasePromise = (async () => {
    await cargarInventarioInicial();
    await cargarVentasRuta2UnaVez();
    await cargarEntradasRuta2UnaVez();
    await cargarAjustesRuta2UnaVez();
    cacheBaseCargado = true;
  })();

  await cargaBasePromise;
  cargaBasePromise = null;
}

function claveSemana(rango) {
  return `${rango.inicio}_${rango.fin}`;
}

function guardarSemanaEnCache(clave) {
  cacheSemanas.set(clave, {
    registrosDetalleSemana: [...registrosDetalleSemana],
    registrosDetalleAcumuladoAnterior: [...registrosDetalleAcumuladoAnterior],
    registrosEntradasSemana: [...registrosEntradasSemana],
    registrosEntradasAcumuladoAnterior: [...registrosEntradasAcumuladoAnterior],
    registrosAjustesSemana: [...registrosAjustesSemana],
    registrosAjustesAcumuladoAnterior: [...registrosAjustesAcumuladoAnterior],
    registrosDetalleMovimientoSemana: [...registrosDetalleMovimientoSemana],
    registrosPivot: registrosPivot.map(r => ({
      ...r,
      entradasPorFecha: { ...r.entradasPorFecha },
      salidasPorFecha: { ...r.salidasPorFecha },
      ajustesPorFecha: { ...r.ajustesPorFecha }
    })),
    fechasColumnas: [...fechasColumnas],
    rangoSemanaActual: { ...rangoSemanaActual }
  });
  guardarCachePersistente(`semana:${clave}`, cacheSemanas.get(clave));
}

function cargarSemanaDesdeCache(clave) {
  const cache = cacheSemanas.get(clave);
  if (!cache) return false;

  registrosDetalleSemana = [...cache.registrosDetalleSemana];
  registrosDetalleAcumuladoAnterior = [...cache.registrosDetalleAcumuladoAnterior];
  registrosEntradasSemana = [...cache.registrosEntradasSemana];
  registrosEntradasAcumuladoAnterior = [...cache.registrosEntradasAcumuladoAnterior];
  registrosAjustesSemana = [...cache.registrosAjustesSemana];
  registrosAjustesAcumuladoAnterior = [...cache.registrosAjustesAcumuladoAnterior];
  registrosDetalleMovimientoSemana = [...cache.registrosDetalleMovimientoSemana];
  registrosPivot = cache.registrosPivot.map(r => ({
    ...r,
    entradasPorFecha: { ...r.entradasPorFecha },
    salidasPorFecha: { ...r.salidasPorFecha },
    ajustesPorFecha: { ...r.ajustesPorFecha }
  }));
  fechasColumnas = [...cache.fechasColumnas];
  rangoSemanaActual = { ...cache.rangoSemanaActual };

  return true;
}

function pintarSemanaCacheada() {
  actualizarResumenSuperior(
    new Set(registrosDetalleSemana.map(x => x.docId)).size,
    new Set(registrosEntradasSemana.map(x => x.docId)).size
  );
  pintarTabla();
}

async function cargarMovimientosRuta2() {
  try {
    if (!appCargada) {
      mostrarLoaderEntrada("Entrando a Inventario Ruta 2...");
    } else {
      mostrarTransicionSemana("Calculando semana...");
    }

    await new Promise(resolve => setTimeout(resolve, 60));
    await asegurarDatosBaseCargados();

    // El rango se calcula después de leer Firebase para respetar
    // la fecha real del inventario inicial y bloquear semanas anteriores.
    const rango = obtenerRangoSemana();
    const clave = claveSemana(rango);
    const textoSemana = `${fechaCorta(rango.inicio)} a ${fechaCorta(rango.fin)}`;

    if (cacheSemanas.has(clave)) {
      setProgress(80);
      setStatus(`Recuperando semana ${textoSemana} desde memoria...`);
      cargarSemanaDesdeCache(clave);
      pintarSemanaCacheada();

      setProgress(100);
      setStatus(
        `Consulta lista. Semana: ${textoSemana}. Entradas: ${registrosEntradasSemana.length}. Ajustes: ${registrosAjustesSemana.length}. Salidas: ${registrosDetalleSemana.length}.`
      );

      appCargada = true;
      setTimeout(ocultarTransiciones, 180);
      return;
    }

    setStatus(`Calculando semana ${textoSemana}. Acumulado anterior hasta ${rango.acumuladoAnteriorFin}...`);
    setProgress(appCargada ? 55 : 78);

    const ventasTodas = cacheVentasTodas;
    const entradasTodas = cacheEntradasTodas;
    const ajustesTodos = cacheAjustesTodos;

    const detalleSemana = ventasTodas.filter(x => x.fecha >= rango.inicio && x.fecha <= rango.fin);
    const entradasSemana = entradasTodas.filter(x => x.fecha >= rango.inicio && x.fecha <= rango.fin);
    const ajustesSemana = ajustesTodos.filter(x => x.fecha >= rango.inicio && x.fecha <= rango.fin);

    let detalleAcumuladoAnterior = [];
    let entradasAcumuladoAnterior = [];
    let ajustesAcumuladoAnterior = [];

    if (rango.acumuladoAnteriorFin >= FECHA_BASE_INVENTARIO) {
      detalleAcumuladoAnterior = ventasTodas.filter(
        x => x.fecha >= FECHA_BASE_INVENTARIO && x.fecha <= rango.acumuladoAnteriorFin
      );

      entradasAcumuladoAnterior = entradasTodas.filter(
        x => x.fecha >= FECHA_BASE_INVENTARIO && x.fecha <= rango.acumuladoAnteriorFin
      );

      ajustesAcumuladoAnterior = ajustesTodos.filter(
        x => x.fecha >= FECHA_BASE_INVENTARIO && x.fecha <= rango.acumuladoAnteriorFin
      );
    }

    registrosDetalleSemana = detalleSemana;
    registrosDetalleAcumuladoAnterior = detalleAcumuladoAnterior;
    registrosEntradasSemana = entradasSemana;
    registrosEntradasAcumuladoAnterior = entradasAcumuladoAnterior;
    registrosAjustesSemana = ajustesSemana;
    registrosAjustesAcumuladoAnterior = ajustesAcumuladoAnterior;

    registrosDetalleMovimientoSemana = [
      ...registrosEntradasSemana,
      ...registrosAjustesSemana,
      ...registrosDetalleSemana
    ].sort((a, b) => {
      if (a.fecha !== b.fecha) return String(b.fecha).localeCompare(String(a.fecha));
      return String(a.tipo).localeCompare(String(b.tipo));
    });

    construirPivot(
      registrosDetalleSemana,
      registrosDetalleAcumuladoAnterior,
      registrosEntradasSemana,
      registrosEntradasAcumuladoAnterior,
      registrosAjustesSemana,
      registrosAjustesAcumuladoAnterior,
      rango.inicio,
      rango.fin
    );

    actualizarResumenSuperior(
      new Set(registrosDetalleSemana.map(x => x.docId)).size,
      new Set(registrosEntradasSemana.map(x => x.docId)).size
    );

    setProgress(92);
    pintarTabla();
    guardarSemanaEnCache(clave);

    setProgress(100);
    setStatus(
      `Consulta lista. Semana: ${textoSemana}. Entradas: ${registrosEntradasSemana.length}. Ajustes: ${registrosAjustesSemana.length}. Salidas: ${registrosDetalleSemana.length}.`
    );

    appCargada = true;
    setTimeout(ocultarTransiciones, 180);
  } catch (error) {
    console.error(error);
    setStatus("Error al cargar movimientos Ruta 2: " + error.message);
    ocultarTransiciones();
  }
}

function asegurarRow(mapa, item) {
  const key = item.codigoKey || String(item.nombre || "").toLowerCase();

  if (!mapa.has(key)) {
    mapa.set(key, {
      codigo: item.codigo,
      codigoKey: item.codigoKey,
      nombre: item.nombre,
      inviniOriginal: 0,
      entradasAcumuladasAnteriores: 0,
      salidasAcumuladasAnteriores: 0,
      ajustesAcumuladosAnteriores: 0,
      inviniSemana: 0,
      entradasPorFecha: {},
      salidasPorFecha: {},
      ajustesPorFecha: {},
      totalEntradasSemana: 0,
      totalSalidasSemana: 0,
      totalAjustesSemana: 0,
      existenciaFinalSemana: 0
    });
  }

  const row = mapa.get(key);

  if (!row.codigo && item.codigo) row.codigo = item.codigo;
  if (!row.nombre && item.nombre) row.nombre = item.nombre;

  return row;
}

function construirPivot(
  detalleSemana,
  detalleAcumuladoAnterior,
  entradasSemana,
  entradasAcumuladoAnterior,
  ajustesSemana,
  ajustesAcumuladoAnterior,
  inicioSemana,
  finSemana
) {
  const mapa = new Map();

  fechasColumnas = crearFechasSemana(inicioSemana, finSemana);

  Object.keys(inventarioInicialOriginal).forEach((key) => {
    const inv = inventarioInicialOriginal[key];

    mapa.set(key, {
      codigo: inv.codigo,
      codigoKey: inv.codigoKey,
      nombre: inv.nombre,
      inviniOriginal: Number(inv.inviniOriginal || 0),
      entradasAcumuladasAnteriores: 0,
      salidasAcumuladasAnteriores: 0,
      ajustesAcumuladosAnteriores: 0,
      inviniSemana: Number(inv.inviniOriginal || 0),
      entradasPorFecha: {},
      salidasPorFecha: {},
      ajustesPorFecha: {},
      totalEntradasSemana: 0,
      totalSalidasSemana: 0,
      totalAjustesSemana: 0,
      existenciaFinalSemana: Number(inv.inviniOriginal || 0)
    });
  });

  entradasAcumuladoAnterior.forEach((item) => {
    const row = asegurarRow(mapa, item);
    row.entradasAcumuladasAnteriores += Number(item.cantidad || 0);
  });

  detalleAcumuladoAnterior.forEach((item) => {
    const row = asegurarRow(mapa, item);
    row.salidasAcumuladasAnteriores += Number(item.cantidad || 0);
  });

  ajustesAcumuladoAnterior.forEach((item) => {
    const row = asegurarRow(mapa, item);
    row.ajustesAcumuladosAnteriores += Number(item.diferencia || item.cantidad || 0);
  });

  mapa.forEach((row) => {
    row.inviniSemana =
      Number(row.inviniOriginal || 0) +
      Number(row.entradasAcumuladasAnteriores || 0) -
      Number(row.salidasAcumuladasAnteriores || 0) +
      Number(row.ajustesAcumuladosAnteriores || 0);

    row.existenciaFinalSemana = row.inviniSemana;
  });

  entradasSemana.forEach((item) => {
    const row = asegurarRow(mapa, item);

    row.entradasPorFecha[item.fecha] =
      Number(row.entradasPorFecha[item.fecha] || 0) + Number(item.cantidad || 0);

    row.totalEntradasSemana += Number(item.cantidad || 0);

    row.existenciaFinalSemana =
      Number(row.inviniSemana || 0) +
      Number(row.totalEntradasSemana || 0) -
      Number(row.totalSalidasSemana || 0) +
      Number(row.totalAjustesSemana || 0);
  });

  ajustesSemana.forEach((item) => {
    const row = asegurarRow(mapa, item);
    const diferencia = Number(item.diferencia || item.cantidad || 0);

    row.ajustesPorFecha[item.fecha] =
      Number(row.ajustesPorFecha[item.fecha] || 0) + diferencia;

    row.totalAjustesSemana += diferencia;
    row.existenciaFinalSemana =
      Number(row.inviniSemana || 0) +
      Number(row.totalEntradasSemana || 0) -
      Number(row.totalSalidasSemana || 0) +
      Number(row.totalAjustesSemana || 0);
  });

  detalleSemana.forEach((item) => {
    const row = asegurarRow(mapa, item);

    row.salidasPorFecha[item.fecha] =
      Number(row.salidasPorFecha[item.fecha] || 0) + Number(item.cantidad || 0);

    row.totalSalidasSemana += Number(item.cantidad || 0);

    row.existenciaFinalSemana =
      Number(row.inviniSemana || 0) +
      Number(row.totalEntradasSemana || 0) -
      Number(row.totalSalidasSemana || 0) +
      Number(row.totalAjustesSemana || 0);
  });

  registrosPivot = Array.from(mapa.values())
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
}

function actualizarResumenSuperior(totalDocsSemana, totalDocsEntradasSemana) {
  const totalCantidadSalidasSemana = registrosDetalleSemana.reduce(
    (sum, x) => sum + Number(x.cantidad || 0),
    0
  );

  const totalCantidadEntradasSemana = registrosEntradasSemana.reduce(
    (sum, x) => sum + Number(x.cantidad || 0),
    0
  );

  if ($("totalDocs")) {
    $("totalDocs").textContent =
      Number(totalDocsSemana || 0) + Number(totalDocsEntradasSemana || 0);
  }

  if ($("totalPartidas")) {
    $("totalPartidas").textContent = registrosDetalleMovimientoSemana.length;
  }

  if ($("totalCantidad")) {
    $("totalCantidad").textContent =
      `E ${fmtNum(totalCantidadEntradasSemana)} / S ${fmtNum(totalCantidadSalidasSemana)}`;
  }

  if ($("totalCodigos")) $("totalCodigos").textContent = registrosPivot.length;
}

function getFiltroBusqueda() {
  return String($("busqueda")?.value || "").trim().toLowerCase();
}

function pasaFiltroPivot(item) {
  const q = getFiltroBusqueda();
  if (!q) return true;

  return [
    item.codigo,
    item.nombre
  ].some((v) => String(v || "").toLowerCase().includes(q));
}

function pasaFiltroDetalle(item) {
  const q = getFiltroBusqueda();
  if (!q) return true;

  return [
    item.tipo,
    item.codigo,
    item.nombre,
    item.folio,
    item.destino,
    item.entrega,
    item.recibe,
    item.proveedor,
    item.alias_pivot,
    item.rfc_emisor,
    item.razon_social_emisor
  ].some((v) => String(v || "").toLowerCase().includes(q));
}

function pintarTabla() {
  if (vistaActual === "detalle") {
    pintarDetalle();
  } else {
    pintarPivotPorSemana();
  }
}

function pintarPivotPorSemana() {
  const tabla = $("tabla");
  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  const tfoot = tabla.querySelector("tfoot");

  const rows = registrosPivot.filter(pasaFiltroPivot);

  const fechasConEntrada = fechasColumnas.filter(f =>
    registrosEntradasSemana.some(x => x.fecha === f)
  );
  const fechasConAjuste = fechasColumnas.filter(f =>
    registrosAjustesSemana.some(x => x.fecha === f)
  );

  thead.innerHTML = `
    <tr>
      <th class="left sticky-codigo">Código</th>
      <th class="left sticky-nombre">Nombre</th>
      <th>INVINI<br>SEMANA</th>

      ${fechasColumnas.map(f => {
        const proveedor = obtenerProveedoresEntradaPorFecha(f);
        const tieneEntrada = fechasConEntrada.includes(f);

        return `
          ${
            tieneEntrada
              ? `<th class="entrada-head">
                  ${fechaCorta(f)}<br>
                  ENTRADA<br>
                  <small>${escapeHtml(proveedor)}</small>
                </th>`
              : ""
          }
          ${fechasConAjuste.includes(f) ? `<th class="ajuste-head">${fechaCorta(f)}<br>AJUSTE</th>` : ""}
          <th class="salida-head">
            ${fechaCorta(f)}<br>
            SALIDA
          </th>
        `;
      }).join("")}

      <th>EXISTENCIA TEÓRICA<br>FINAL</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td class="left codigo sticky-codigo">${escapeHtml(r.codigo)}</td>
      <td class="left sticky-nombre">${escapeHtml(r.nombre)}</td>
      <td class="cantidad">${fmtNum(r.inviniSemana)}</td>

      ${fechasColumnas.map(f => {
        const entrada = Number(r.entradasPorFecha[f] || 0);
        const ajuste = Number(r.ajustesPorFecha[f] || 0);
        const salida = Number(r.salidasPorFecha[f] || 0);
        const tieneEntrada = fechasConEntrada.includes(f);
        const tieneAjuste = fechasConAjuste.includes(f);

        return `
          ${
            tieneEntrada
              ? `<td class="entrada-col ${entrada ? "cantidad" : ""}">
                  ${fmtCelda(entrada)}
                </td>`
              : ""
          }
          ${tieneAjuste ? `<td class="ajuste-col ${ajuste > 0 ? "positivo" : ajuste < 0 ? "negativo" : ""}">${fmtCelda(ajuste)}</td>` : ""}
          <td class="salida-col ${salida ? "cantidad" : ""}">
            ${fmtCelda(salida)}
          </td>
        `;
      }).join("")}

      <td class="${
  Number(r.existenciaFinalSemana) < 0
    ? 'cantidad negativo-parpadeo'
    : 'cantidad'
}">
  ${fmtNum(r.existenciaFinalSemana)}
</td>
    </tr>
  `).join("");

  tfoot.innerHTML = "";

}

function pintarDetalle() {
  const tabla = $("tabla");
  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  const tfoot = tabla.querySelector("tfoot");

  const rows = registrosDetalleMovimientoSemana.filter(pasaFiltroDetalle);

  thead.innerHTML = `
    <tr>
      <th>Tipo</th>
      <th>Fecha</th>
      <th>Hora</th>
      <th class="left">Folio</th>
      <th class="left">Destino / Proveedor</th>
      <th class="left">Entrega / Emisor</th>
      <th class="left">Recibe / Usuario</th>
      <th>Partida</th>
      <th class="left">Código</th>
      <th class="left">Nombre</th>
      <th>Teórico</th>
      <th>Físico</th>
      <th>Cantidad / Diferencia</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.tipo)}</td>
      <td>${escapeHtml(r.fecha)}</td>
      <td>${escapeHtml(r.hora || "")}</td>
      <td class="left">${escapeHtml(r.folio)}</td>
      <td class="left">${escapeHtml(r.destino)}</td>
      <td class="left">${escapeHtml(r.entrega)}</td>
      <td class="left">${escapeHtml(r.recibe)}</td>
      <td>${r.partida}</td>
      <td class="left codigo">${escapeHtml(r.codigo)}</td>
      <td class="left">${escapeHtml(r.nombre)}</td>
      <td>${r.tipo === "AJUSTE" ? fmtNum(r.teorico) : ""}</td>
      <td>${r.tipo === "AJUSTE" ? fmtNum(r.fisico) : ""}</td>
      <td class="cantidad ${r.tipo === "AJUSTE" && Number(r.cantidad) < 0 ? "negativo" : ""}">${fmtNum(r.cantidad)}</td>
    </tr>
  `).join("");

  tfoot.innerHTML = "";
}

function exportarExcel() {
  let rows;

  if (vistaActual === "detalle") {
    rows = registrosDetalleMovimientoSemana.filter(pasaFiltroDetalle).map((r) => ({
      Tipo: r.tipo,
      Fecha: r.fecha,
      Hora: r.hora || "",
      Folio: r.folio,
      Destino_Proveedor: r.destino,
      Entrega_Emisor: r.entrega,
      Recibe_Usuario: r.recibe,
      RFC_Emisor: r.rfc_emisor,
      Razon_Social_Emisor: r.razon_social_emisor,
      Alias_Pivot: r.alias_pivot,
      Partida: r.partida,
      Codigo: r.codigo,
      Nombre: r.nombre,
      Teorico: r.teorico ?? "",
      Fisico: r.fisico ?? "",
      Cantidad_Diferencia: r.cantidad
    }));
  } else {
    rows = registrosPivot.filter(pasaFiltroPivot).map((r) => {
      const obj = {
        Codigo: r.codigo,
        Nombre: r.nombre,
        "INVINI SEMANA": Number(r.inviniSemana || 0)
      };

      fechasColumnas.forEach((f) => {
        obj[`ENTRADA ${fechaCorta(f)}`] = Number(r.entradasPorFecha[f] || 0);
        obj[`AJUSTE ${fechaCorta(f)}`] = Number(r.ajustesPorFecha[f] || 0);
        obj[`SALIDA ${fechaCorta(f)}`] = Number(r.salidasPorFecha[f] || 0);
      });

      obj["EXISTENCIA TEORICA FINAL"] = Number(r.existenciaFinalSemana || 0);

      return obj;
    });
  }

  if (!rows.length) {
    alert("No hay datos para exportar.");
    return;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  XLSX.utils.book_append_sheet(
    wb,
    ws,
    vistaActual === "detalle" ? "Detalle semana" : "Pivot semana"
  );

  XLSX.writeFile(
    wb,
    `inventario_ruta2_${vistaActual}_${rangoSemanaActual.inicio}_a_${rangoSemanaActual.fin}.xlsx`
  );
}

function imprimirReportePDF() {
  document.body.classList.add("modo-impresion");
  window.print();
  setTimeout(() => document.body.classList.remove("modo-impresion"), 500);
}

function articulosConteoDisponibles() {
  const mapa = new Map();
  for (const item of registrosPivot) {
    const codigo = String(item.codigo || item.codigoKey || "").trim();
    if (!codigo) continue;
    mapa.set(codigo, {
      codigo,
      descripcion: String(item.descripcion || item.nombre || "").trim(),
      existencia: Number(item.inventarioFinal ?? item.existenciaFinal ?? item.totalFinal ?? 0)
    });
  }
  return [...mapa.values()].sort((a,b) => a.descripcion.localeCompare(b.descripcion, "es"));
}

function setStatusConteo(mensaje, tipo = "") {
  const el = $("estadoConteo");
  if (!el) return;
  el.textContent = mensaje;
  el.className = `status ${tipo}`.trim();
}

function articulosConteoFiltrados() {
  const texto = String($("filtroConteo")?.value || "").trim().toLowerCase();
  const filtro = $("filtroSeleccionConteo")?.value || "todos";
  return articulosConteoDisponibles().filter(a => {
    const coincide = !texto || `${a.codigo} ${a.descripcion}`.toLowerCase().includes(texto);
    const seleccionado = seleccionConteo.has(a.codigo);
    const pasaEstado = filtro === "todos" || (filtro === "seleccionados" ? seleccionado : !seleccionado);
    return coincide && pasaEstado;
  });
}

function pintarArticulosConteo() {
  const body = $("tbodyConteoArticulos");
  if (!body) return;
  const filas = articulosConteoFiltrados();
  body.innerHTML = filas.map(a => `
    <tr>
      <td><input type="checkbox" class="check-articulo-conteo" data-codigo="${escapeHtml(a.codigo)}" ${seleccionConteo.has(a.codigo) ? "checked" : ""}></td>
      <td class="left">${escapeHtml(a.codigo)}</td>
      <td class="left">${escapeHtml(a.descripcion)}</td>
      <td>${fmtNum(a.existencia)}</td>
    </tr>`).join("");
  body.querySelectorAll(".check-articulo-conteo").forEach(chk => {
    chk.addEventListener("change", () => {
      if (chk.checked) seleccionConteo.add(chk.dataset.codigo);
      else seleccionConteo.delete(chk.dataset.codigo);
      actualizarResumenSeleccionConteo();
      if ($("filtroSeleccionConteo").value !== "todos") pintarArticulosConteo();
    });
  });
  actualizarResumenSeleccionConteo();
}

function actualizarResumenSeleccionConteo() {
  $("resumenSeleccionConteo").textContent = `${seleccionConteo.size} artículos seleccionados`;
}

function limpiarFormularioListaConteo() {
  listaConteoEditandoId = null;
  seleccionConteo = new Set();
  $("nombreListaConteo").value = "";
  $("descripcionListaConteo").value = "";
  pintarArticulosConteo();
  setStatusConteo("Formulario listo para una nueva lista.", "ok");
}

async function cargarListasConteo() {
  const snap = await getDocs(query(REF_CONTEOS_RUTA2, orderBy("nombre", "asc")));
  listasConteoActuales = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  pintarListasConteoGuardadas();
}

function pintarListasConteoGuardadas() {
  const box = $("listasConteoGuardadas");
  if (!listasConteoActuales.length) {
    box.innerHTML = '<div class="empty-listas">No hay listas configuradas.</div>';
    return;
  }
  box.innerHTML = listasConteoActuales.map(lista => `
    <div class="lista-card">
      <h3>${escapeHtml(lista.nombre || "SIN NOMBRE")}</h3>
      <div class="lista-meta">${(lista.articulos || []).length} artículos${lista.descripcion ? " · " + escapeHtml(lista.descripcion) : ""}</div>
      <div class="lista-actions">
        <button class="btn-lista-editar" data-id="${lista.id}">Editar</button>
        <button class="btn-lista-pdf" data-id="${lista.id}">Generar PDF</button>
        <button class="btn-lista-eliminar" data-id="${lista.id}">Eliminar</button>
      </div>
    </div>`).join("");
  box.querySelectorAll(".btn-lista-editar").forEach(b => b.addEventListener("click", () => editarListaConteo(b.dataset.id)));
  box.querySelectorAll(".btn-lista-pdf").forEach(b => b.addEventListener("click", () => generarPdfListaConteo(b.dataset.id)));
  box.querySelectorAll(".btn-lista-eliminar").forEach(b => b.addEventListener("click", () => eliminarListaConteo(b.dataset.id)));
}

function editarListaConteo(id) {
  const lista = listasConteoActuales.find(x => x.id === id);
  if (!lista) return;
  listaConteoEditandoId = id;
  $("nombreListaConteo").value = lista.nombre || "";
  $("descripcionListaConteo").value = lista.descripcion || "";
  seleccionConteo = new Set((lista.articulos || []).map(a => String(a.codigo || "")));
  pintarArticulosConteo();
  setStatusConteo(`Editando ${lista.nombre || "lista"}.`, "ok");
}

async function guardarListaConteo() {
  const nombre = String($("nombreListaConteo").value || "").trim();
  const descripcion = String($("descripcionListaConteo").value || "").trim();
  if (!nombre) { alert("Captura el nombre de la lista."); return; }
  if (!seleccionConteo.size) { alert("Selecciona al menos un artículo."); return; }
  const mapa = new Map(articulosConteoDisponibles().map(a => [a.codigo, a]));
  const articulos = Array.from(seleccionConteo).map(codigo => {
    const a = mapa.get(codigo) || { codigo, descripcion:"" };
    return { codigo:a.codigo, descripcion:a.descripcion };
  });
  const data = {
    nombre, descripcion, activa:true, articulos,
    ruta: APP_CONFIG.nombre,
    rutaId: APP_CONFIG.rutaIdVentas,
    fecha_actualizacion: serverTimestamp()
  };
  const btn = $("btnGuardarListaConteo");
  btn.disabled = true;
  try {
    if (listaConteoEditandoId) await setDoc(doc(REF_CONTEOS_RUTA2, listaConteoEditandoId), data, { merge:true });
    else {
      data.fecha_creacion = serverTimestamp();
      await addDoc(REF_CONTEOS_RUTA2, data);
    }
    await cargarListasConteo();
    limpiarFormularioListaConteo();
    setStatusConteo(`Lista ${nombre} guardada correctamente.`, "ok");
  } catch (error) {
    console.error(error);
    alert("No se pudo guardar la lista: " + error.message);
  } finally { btn.disabled = false; }
}

async function eliminarListaConteo(id) {
  const lista = listasConteoActuales.find(x => x.id === id);
  if (!lista || !confirm(`¿Eliminar la lista ${lista.nombre}?`)) return;
  try {
    await deleteDoc(doc(REF_CONTEOS_RUTA2, id));
    if (listaConteoEditandoId === id) limpiarFormularioListaConteo();
    await cargarListasConteo();
    setStatusConteo("Lista eliminada.", "ok");
  } catch (error) {
    console.error(error);
    alert("No se pudo eliminar la lista: " + error.message);
  }
}

function generarPdfListaConteo(id) {
  const lista = listasConteoActuales.find(x => x.id === id);
  if (!lista) return;
  if (!window.jspdf?.jsPDF) { alert("No se cargó el generador de PDF."); return; }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit:"mm", format:"letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15);
  pdf.text("RUTA VENTA 2", pageW/2, 16, { align:"center" });
  pdf.setFontSize(13); pdf.text("LISTA DE CONTEO DIARIO", pageW/2, 23, { align:"center" });
  pdf.setFontSize(10); pdf.setFont("helvetica", "normal");
  pdf.text(`Lista: ${lista.nombre || ""}`, 14, 34);
  pdf.text("Fecha de conteo: ____ / ____ / ______", 14, 42);
  pdf.text("Hora de inicio: __________", 14, 49);
  pdf.text("Hora de término: __________", 108, 49);
  pdf.text("Responsable: ______________________________________", 14, 56);
  const body = (lista.articulos || []).map(a => [a.codigo || "", a.descripcion || "", ""]);
  pdf.autoTable({
    startY:63, head:[["Código", "Descripción", "Conteo"]], body, theme:"grid",
    styles:{ fontSize:9, cellPadding:2.2, valign:"middle" },
    headStyles:{ fillColor:[0,65,106], textColor:255, halign:"center" },
    columnStyles:{ 0:{cellWidth:38}, 1:{cellWidth:120}, 2:{cellWidth:35, minCellHeight:9} },
    margin:{ left:14, right:14, bottom:42 }
  });
  let y = pdf.lastAutoTable.finalY + 10;
  if (y > 220) { pdf.addPage(); y = 20; }
  pdf.setFont("helvetica", "bold"); pdf.text("OBSERVACIONES GENERALES", 14, y);
  pdf.setFont("helvetica", "normal");
  for (let i=1;i<=3;i++) pdf.line(14, y + i*9, pageW-14, y + i*9);
  y += 42;
  pdf.text("Nombre y firma del responsable:", 14, y);
  pdf.line(14, y+14, 105, y+14);
  pdf.save(`${String(lista.nombre || "conteo_ruta2").replace(/[^a-z0-9_-]+/gi,"_")}.pdf`);
}

async function mostrarVistaConteo() {
  $("vistaInventario").classList.add("hide");
  $("vistaAjustes").classList.add("hide");
  $("vistaConteo").classList.remove("hide");
  pintarArticulosConteo();
  try {
    await cargarListasConteo();
    setStatusConteo("Módulo listo.", "ok");
  } catch (error) {
    console.error(error);
    setStatusConteo("Error cargando listas: " + error.message, "error");
  }
}

function cambiarVista(vista) {
  vistaActual = vista;

  $("tabResumen").classList.toggle("active", vista === "resumen");
  $("tabDetalle").classList.toggle("active", vista === "detalle");

  pintarTabla();
}

function crearSelectorSemanaSiNoExiste() {
  if ($("selectorSemana")) return;

  const actions = document.querySelector(".actions");
  if (!actions) return;

  const label = document.createElement("label");
  label.innerHTML = `
    Semana
    <input id="selectorSemana" type="week" />
  `;

  actions.insertBefore(label, actions.firstChild);
}

function inicializarEventos() {
  crearSelectorSemanaSiNoExiste();

  if ($("selectorSemana")) {
    $("selectorSemana").value = obtenerSemanaActualInput();
    $("selectorSemana").addEventListener("change", () => {
      const semanaMinima = obtenerWeekDesdeFecha(FECHA_INICIO_MINIMA);
      if ($("selectorSemana").value < semanaMinima) {
        $("selectorSemana").value = semanaMinima;
      }
      mostrarTransicionSemana("Calculando semana...");
      setTimeout(cargarMovimientosRuta2, 40);
    });
  }

  if ($("fechaInicio")) {
    $("fechaInicio").min = FECHA_INICIO_MINIMA;
    $("fechaInicio").value = FECHA_INICIO_MINIMA;
    $("fechaInicio").readOnly = true;
  }

  if ($("fechaFin")) {
    $("fechaFin").value = hoyISO();
    $("fechaFin").readOnly = true;
  }

  const btnMenuAcciones = $("btnMenuAcciones");
  const menuAcciones = $("menuAcciones");
  const cerrarMenuAcciones = () => {
    menuAcciones?.classList.add("hide");
    btnMenuAcciones?.setAttribute("aria-expanded", "false");
  };

  btnMenuAcciones?.addEventListener("click", (event) => {
    event.stopPropagation();
    const seAbrira = menuAcciones?.classList.contains("hide");
    menuAcciones?.classList.toggle("hide");
    btnMenuAcciones.setAttribute("aria-expanded", String(Boolean(seAbrira)));
  });

  menuAcciones?.addEventListener("click", (event) => {
    if (event.target.closest("button")) cerrarMenuAcciones();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".menu-acciones")) cerrarMenuAcciones();
  });

  $("btnRecargar").addEventListener("click", async () => {
    cacheBaseCargado = false;
    cacheInventarioInicial = {};
    cacheVentasTodas = [];
    cacheEntradasTodas = [];
    cacheAjustesTodos = [];
    cacheSemanas.clear();
    cargaBasePromise = null;
    mostrarLoaderEntrada("Recargando datos desde Firebase...");
    await cargarMovimientosRuta2();
  });
  $("btnExportar").addEventListener("click", exportarExcel);
  $("btnPDF").addEventListener("click", imprimirReportePDF);
  $("btnConteo").addEventListener("click", mostrarVistaConteo);
  $("btnRegresarDesdeConteo").addEventListener("click", mostrarVistaInventario);
  $("filtroConteo").addEventListener("input", pintarArticulosConteo);
  $("filtroSeleccionConteo").addEventListener("change", pintarArticulosConteo);
  $("btnSeleccionarVisibles").addEventListener("click", () => { articulosConteoFiltrados().forEach(a => seleccionConteo.add(a.codigo)); pintarArticulosConteo(); });
  $("btnLimpiarSeleccionConteo").addEventListener("click", () => { seleccionConteo.clear(); pintarArticulosConteo(); });
  $("btnNuevaListaConteo").addEventListener("click", limpiarFormularioListaConteo);
  $("btnGuardarListaConteo").addEventListener("click", guardarListaConteo);
  $("btnAjuste").addEventListener("click", mostrarVistaAjustes);
  $("btnRegresarInventario").addEventListener("click", mostrarVistaInventario);
  $("btnLimpiarAjuste").addEventListener("click", limpiarFormularioAjuste);
  $("btnRecargarHistorial").addEventListener("click", async () => {
    cacheBaseCargado = false;
    cacheAjustesTodos = [];
    cargaBasePromise = null;
    await asegurarDatosBaseCargados();
    pintarHistorialAjustes();
  });
  $("formAjuste").addEventListener("submit", async (e) => { e.preventDefault(); await guardarAjuste(); });
  ["ajusteCodigo"].forEach(id => $(id).addEventListener("input", actualizarPreviewAjuste));
  $("busqueda").addEventListener("input", pintarTabla);

  $("tabResumen").textContent = "Pivot semanal";
  $("tabResumen").addEventListener("click", () => cambiarVista("resumen"));

  $("tabDetalle").textContent = "Detalle semana";
  $("tabDetalle").addEventListener("click", () => cambiarVista("detalle"));
}

document.addEventListener("DOMContentLoaded", async () => {
  inicializarEventos();
  await cargarMovimientosRuta2();
});
