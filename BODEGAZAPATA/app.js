import { db } from "./config.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FECHA_BASE_INVENTARIO = "2026-05-25";
const FECHA_INICIO_MINIMA = "2026-05-25";
const CONTEO_ID_INVENTARIO = "ZAPATA010626";

const REF_SALIDAS_ZAPATA = collection(
  db,
  "almacenes",
  "almacen_zapata",
  "salidas1.0"
);

const REF_ENTRADAS_ZAPATA = collection(
  db,
  "almacenes",
  "almacen_zapata",
  "entradas"
);

const REF_PROVEEDORES_AUTORIZADOS_ZAPATA = collection(
  db,
  "almacenes",
  "almacen_zapata",
  "configuracion",
  "proveedores_autorizados",
  "items"
);

const REF_USUARIOS_INVENTARIO = collection(
  db,
  "almacenes",
  "almacen_zapata",
  "Inventarios",
  CONTEO_ID_INVENTARIO,
  "USUARIOS"
);

const $ = (id) => document.getElementById(id);

let registrosDetalleSemana = [];
let registrosDetalleAcumuladoAnterior = [];
let registrosEntradasSemana = [];
let registrosEntradasAcumuladoAnterior = [];
let registrosDetalleMovimientoSemana = [];
let registrosPivot = [];
let fechasColumnas = [];

let inventarioInicialOriginal = {};
let proveedoresAutorizadosPivot = {};
let vistaActual = "resumen";

let rangoSemanaActual = {
  inicio: FECHA_BASE_INVENTARIO,
  fin: FECHA_BASE_INVENTARIO,
  acumuladoAnteriorFin: ""
};

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

async function cargarProveedoresAutorizadosPivot() {
  proveedoresAutorizadosPivot = {};

  const snap = await getDocs(REF_PROVEEDORES_AUTORIZADOS_ZAPATA);

  snap.forEach((docu) => {
    const p = docu.data() || {};
    const rfc = String(p.rfc_emisor || docu.id || "").trim().toUpperCase();

    if (!rfc) return;
    if (p.activo === false) return;

    proveedoresAutorizadosPivot[rfc] = {
      rfc,
      razon_social_emisor: String(p.razon_social_emisor || "").trim(),
      alias_pivot: String(p.alias_pivot || p.razon_social_emisor || rfc).trim()
    };
  });
}

function obtenerAliasProveedorPivot(rfc, razonSocial) {
  const key = String(rfc || "").trim().toUpperCase();

  if (key && proveedoresAutorizadosPivot[key]) {
    return proveedoresAutorizadosPivot[key].alias_pivot;
  }

  return String(razonSocial || key || "PROVEEDOR").trim();
}

function obtenerProveedoresEntradaPorFecha(fecha) {
  const proveedores = registrosEntradasSemana
    .filter(x => x.fecha === fecha)
    .map(x => String(x.alias_pivot || x.proveedor || x.entrega || "").trim())
    .filter(Boolean);

  return [...new Set(proveedores)].join(" / ");
}

async function cargarInventarioInicial() {
  const inventario = {};

  setStatus(`Cargando inventario inicial ${CONTEO_ID_INVENTARIO}...`);
  setProgress(8);

  const usuariosSnap = await getDocs(REF_USUARIOS_INVENTARIO);

  let usuariosLeidos = 0;
  let partidasLeidas = 0;

  for (const usuarioDoc of usuariosSnap.docs) {
    usuariosLeidos++;

    const refPartidas = collection(
      db,
      "almacenes",
      "almacen_zapata",
      "Inventarios",
      CONTEO_ID_INVENTARIO,
      "USUARIOS",
      usuarioDoc.id,
      "PARTIDAS"
    );

    const partidasSnap = await getDocs(refPartidas);

    partidasSnap.forEach((docu) => {
      const p = docu.data() || {};

      if (p.eliminado === true) return;

      const codigoOriginal = String(p.codigo || p.productoId || p.codigoOriginal || "").trim();
      const codigoKey = normalizarCodigo(codigoOriginal);
      const nombre = String(p.descripcion || p.nombre || "").trim();
      const cantidad = Number(p.cantidad || 0);

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

      if (!inventario[key].codigo && codigoOriginal) {
        inventario[key].codigo = codigoOriginal;
      }

      if (!inventario[key].nombre && nombre) {
        inventario[key].nombre = nombre;
      }

      partidasLeidas++;
    });
  }

  inventarioInicialOriginal = inventario;

  setStatus(
    `Inventario inicial cargado. Usuarios: ${usuariosLeidos}. Partidas: ${partidasLeidas}.`
  );

  return inventario;
}

async function consultarSalidas(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0 };

  const q = query(
    REF_SALIDAS_ZAPATA,
    where("fecha", ">=", inicio),
    where("fecha", "<=", fin),
    orderBy("fecha", "desc")
  );

  const snap = await getDocs(q);
  const detalle = [];
  const docsVistos = new Set();

  snap.forEach((documento) => {
    const data = documento.data() || {};
    docsVistos.add(documento.id);

    const fecha = normalizarFecha(data.fecha || data.timestamp || "");
    if (!fecha || fecha < FECHA_INICIO_MINIMA) return;

    const articulos = Array.isArray(data.articulos) ? data.articulos : [];

    articulos.forEach((art, idx) => {
      const codigoOriginal = String(art.codigo ?? "").trim();
      const codigoKey = normalizarCodigo(codigoOriginal);
      const nombre = String(art.nombre ?? "").trim();
      const cantidad = Number(art.cantidad || 0);

      if (!codigoKey && !nombre && !cantidad) return;

      detalle.push({
        tipo: "SALIDA",
        docId: documento.id,
        partida: idx + 1,
        folio: String(data.folio || documento.id || "").trim(),
        fecha,
        destino: String(data.destino || "").trim(),
        entrega: String(data.entrega || "").trim(),
        recibe: String(data.recibe || "").trim(),
        folioCincho: String(data.folioCincho || "").trim(),
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

  return {
    detalle,
    totalDocs: docsVistos.size
  };
}

async function consultarEntradas(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0 };

  const q = query(
    REF_ENTRADAS_ZAPATA,
    where("fecha", ">=", inicio),
    where("fecha", "<=", fin),
    orderBy("fecha", "desc")
  );

  const snap = await getDocs(q);
  const detalle = [];
  const docsVistos = new Set();

  snap.forEach((documento) => {
    const data = documento.data() || {};
    docsVistos.add(documento.id);

    if (data.estado_zapata && data.estado_zapata !== "ENTRADA_GENERADA") return;

    const fecha = normalizarFecha(
      data.fecha ||
      data.fecha_factura ||
      data.creado_en ||
      data.timestamp ||
      ""
    );

    if (!fecha || fecha < FECHA_INICIO_MINIMA) return;

    const rfcEmisor = String(data.rfc_emisor || "").trim().toUpperCase();
    const razonSocialEmisor = String(data.razon_social_emisor || "").trim();
    const aliasPivot = obtenerAliasProveedorPivot(rfcEmisor, razonSocialEmisor);

    const articulos = Array.isArray(data.articulos) ? data.articulos : [];

    articulos.forEach((art, idx) => {
      const codigoOriginal = String(art.codigo_interno || "").trim();
      const codigoKey = normalizarCodigo(codigoOriginal);
      const nombre = String(art.descripcion_interna || art.descripcion_factura || "").trim();
      const cantidad = Number(art.cantidad_entrada || 0);

      if (!codigoKey && !nombre && !cantidad) return;

      detalle.push({
        tipo: "ENTRADA",
        docId: documento.id,
        partida: idx + 1,
        folio: String(data.folioEntrada || data.folio || documento.id || "").trim(),
        fecha,
        destino: "ALMACÉN ZAPATA",
        entrega: aliasPivot,
        recibe: String(data.usuario || "").trim(),
        folioCincho: "",
        proveedor: aliasPivot,
        rfc_emisor: rfcEmisor,
        razon_social_emisor: razonSocialEmisor,
        alias_pivot: aliasPivot,
        codigo: codigoOriginal,
        codigoKey,
        nombre,
        cantidad
      });
    });
  });

  return {
    detalle,
    totalDocs: docsVistos.size
  };
}

async function cargarSalidasZapata() {
  try {
    const rango = obtenerRangoSemana();

    await cargarInventarioInicial();
    await cargarProveedoresAutorizadosPivot();

    setStatus(
      `Consultando semana ${rango.inicio} a ${rango.fin}. Acumulado anterior hasta ${rango.acumuladoAnteriorFin}...`
    );
    setProgress(25);

    const consultaSemana = await consultarSalidas(rango.inicio, rango.fin);
    const consultaEntradasSemana = await consultarEntradas(rango.inicio, rango.fin);

    setProgress(55);

    let consultaAcumuladoAnterior = {
      detalle: [],
      totalDocs: 0
    };

    let consultaEntradasAcumuladoAnterior = {
      detalle: [],
      totalDocs: 0
    };

    if (rango.acumuladoAnteriorFin >= FECHA_BASE_INVENTARIO) {
      consultaAcumuladoAnterior = await consultarSalidas(
        FECHA_BASE_INVENTARIO,
        rango.acumuladoAnteriorFin
      );

      consultaEntradasAcumuladoAnterior = await consultarEntradas(
        FECHA_BASE_INVENTARIO,
        rango.acumuladoAnteriorFin
      );
    }

    setProgress(75);

    registrosDetalleSemana = consultaSemana.detalle;
    registrosDetalleAcumuladoAnterior = consultaAcumuladoAnterior.detalle;

    registrosEntradasSemana = consultaEntradasSemana.detalle;
    registrosEntradasAcumuladoAnterior = consultaEntradasAcumuladoAnterior.detalle;

    registrosDetalleMovimientoSemana = [
      ...registrosEntradasSemana,
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
      rango.inicio,
      rango.fin
    );

    actualizarResumenSuperior(
      consultaSemana.totalDocs,
      consultaEntradasSemana.totalDocs
    );

    pintarTabla();

    setProgress(100);
    setStatus(
      `Consulta lista. Semana: ${fechaCorta(rango.inicio)} a ${fechaCorta(rango.fin)}. Entradas semana: ${registrosEntradasSemana.length}. Salidas semana: ${registrosDetalleSemana.length}.`
    );

    ocultarLoader();
  } catch (error) {
    console.error(error);
    setStatus("Error al cargar movimientos Zapata: " + error.message);
    ocultarLoader();
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
      inviniSemana: 0,
      entradasPorFecha: {},
      salidasPorFecha: {},
      totalEntradasSemana: 0,
      totalSalidasSemana: 0,
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
      inviniSemana: Number(inv.inviniOriginal || 0),
      entradasPorFecha: {},
      salidasPorFecha: {},
      totalEntradasSemana: 0,
      totalSalidasSemana: 0,
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

  mapa.forEach((row) => {
    row.inviniSemana =
      Number(row.inviniOriginal || 0) +
      Number(row.entradasAcumuladasAnteriores || 0) -
      Number(row.salidasAcumuladasAnteriores || 0);

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
      Number(row.totalSalidasSemana || 0);
  });

  detalleSemana.forEach((item) => {
    const row = asegurarRow(mapa, item);

    row.salidasPorFecha[item.fecha] =
      Number(row.salidasPorFecha[item.fecha] || 0) + Number(item.cantidad || 0);

    row.totalSalidasSemana += Number(item.cantidad || 0);

    row.existenciaFinalSemana =
      Number(row.inviniSemana || 0) +
      Number(row.totalEntradasSemana || 0) -
      Number(row.totalSalidasSemana || 0);
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

  thead.innerHTML = `
    <tr>
      <th class="left">Código</th>
      <th class="left">Nombre</th>
      <th>INVINI<br>SEMANA</th>

      ${fechasColumnas.map(f => {
        const proveedor = obtenerProveedoresEntradaPorFecha(f);

        return `
          <th class="entrada-head">
            ${fechaCorta(f)}<br>
            ENTRADA
            ${proveedor ? `<small>${escapeHtml(proveedor)}</small>` : ""}
          </th>
          <th class="salida-head">
            ${fechaCorta(f)}<br>
            SALIDA
          </th>
        `;
      }).join("")}

      <th>TOTAL<br>ENTRADAS</th>
      <th>TOTAL<br>SALIDAS</th>
      <th>EXISTENCIA<br>FINAL</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td class="left codigo">${escapeHtml(r.codigo)}</td>
      <td class="left">${escapeHtml(r.nombre)}</td>
      <td class="cantidad">${fmtNum(r.inviniSemana)}</td>

      ${fechasColumnas.map(f => {
        const entrada = Number(r.entradasPorFecha[f] || 0);
        const salida = Number(r.salidasPorFecha[f] || 0);

        return `
          <td class="entrada-col ${entrada ? "cantidad" : ""}">
            ${fmtCelda(entrada)}
          </td>
          <td class="salida-col ${salida ? "cantidad" : ""}">
            ${fmtCelda(salida)}
          </td>
        `;
      }).join("")}

      <td class="cantidad entrada-total">${fmtNum(r.totalEntradasSemana)}</td>
      <td class="cantidad">${fmtNum(r.totalSalidasSemana)}</td>
      <td class="cantidad">${fmtNum(r.existenciaFinalSemana)}</td>
    </tr>
  `).join("");

  const totalEntradasPorFecha = {};
  const totalSalidasPorFecha = {};

  fechasColumnas.forEach(f => {
    totalEntradasPorFecha[f] = 0;
    totalSalidasPorFecha[f] = 0;
  });

  rows.forEach(r => {
    fechasColumnas.forEach(f => {
      totalEntradasPorFecha[f] += Number(r.entradasPorFecha[f] || 0);
      totalSalidasPorFecha[f] += Number(r.salidasPorFecha[f] || 0);
    });
  });

  const totalInviniSemana = rows.reduce((sum, r) => sum + Number(r.inviniSemana || 0), 0);
  const totalEntradasSemana = rows.reduce((sum, r) => sum + Number(r.totalEntradasSemana || 0), 0);
  const totalSalidasSemana = rows.reduce((sum, r) => sum + Number(r.totalSalidasSemana || 0), 0);
  const totalExistenciaFinal = rows.reduce((sum, r) => sum + Number(r.existenciaFinalSemana || 0), 0);

  tfoot.innerHTML = `
    <tr>
      <td class="left" colspan="2">TOTAL</td>
      <td>${fmtNum(totalInviniSemana)}</td>

      ${fechasColumnas.map(f => `
        <td class="entrada-col">${fmtNum(totalEntradasPorFecha[f])}</td>
        <td class="salida-col">${fmtNum(totalSalidasPorFecha[f])}</td>
      `).join("")}

      <td>${fmtNum(totalEntradasSemana)}</td>
      <td>${fmtNum(totalSalidasSemana)}</td>
      <td>${fmtNum(totalExistenciaFinal)}</td>
    </tr>
  `;
}

function pintarDetalle() {
  const tabla = $("tabla");
  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  const tfoot = tabla.querySelector("tfoot");

  const rows = registrosDetalleMovimientoSemana.filter(pasaFiltroDetalle);

  const totalEntradas = rows
    .filter(x => x.tipo === "ENTRADA")
    .reduce((sum, x) => sum + Number(x.cantidad || 0), 0);

  const totalSalidas = rows
    .filter(x => x.tipo === "SALIDA")
    .reduce((sum, x) => sum + Number(x.cantidad || 0), 0);

  thead.innerHTML = `
    <tr>
      <th>Tipo</th>
      <th>Fecha</th>
      <th class="left">Folio</th>
      <th class="left">Destino / Proveedor</th>
      <th class="left">Entrega / Emisor</th>
      <th class="left">Recibe / Usuario</th>
      <th>Partida</th>
      <th class="left">Código</th>
      <th class="left">Nombre</th>
      <th>Cantidad</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.tipo)}</td>
      <td>${escapeHtml(r.fecha)}</td>
      <td class="left">${escapeHtml(r.folio)}</td>
      <td class="left">${escapeHtml(r.destino)}</td>
      <td class="left">${escapeHtml(r.entrega)}</td>
      <td class="left">${escapeHtml(r.recibe)}</td>
      <td>${r.partida}</td>
      <td class="left codigo">${escapeHtml(r.codigo)}</td>
      <td class="left">${escapeHtml(r.nombre)}</td>
      <td class="cantidad">${fmtNum(r.cantidad)}</td>
    </tr>
  `).join("");

  tfoot.innerHTML = `
    <tr>
      <td class="left" colspan="9">TOTAL ENTRADAS SEMANA</td>
      <td>${fmtNum(totalEntradas)}</td>
    </tr>
    <tr>
      <td class="left" colspan="9">TOTAL SALIDAS SEMANA</td>
      <td>${fmtNum(totalSalidas)}</td>
    </tr>
  `;
}

function exportarExcel() {
  let rows;

  if (vistaActual === "detalle") {
    rows = registrosDetalleMovimientoSemana.filter(pasaFiltroDetalle).map((r) => ({
      Tipo: r.tipo,
      Fecha: r.fecha,
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
      Cantidad: r.cantidad
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
        obj[`SALIDA ${fechaCorta(f)}`] = Number(r.salidasPorFecha[f] || 0);
      });

      obj["TOTAL ENTRADAS"] = Number(r.totalEntradasSemana || 0);
      obj["TOTAL SALIDAS"] = Number(r.totalSalidasSemana || 0);
      obj["EXISTENCIA FINAL"] = Number(r.existenciaFinalSemana || 0);

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
    `movimientos_zapata_${vistaActual}_${rangoSemanaActual.inicio}_a_${rangoSemanaActual.fin}.xlsx`
  );
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
    $("selectorSemana").addEventListener("change", cargarSalidasZapata);
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

  $("btnRecargar").addEventListener("click", cargarSalidasZapata);
  $("btnExportar").addEventListener("click", exportarExcel);
  $("busqueda").addEventListener("input", pintarTabla);

  $("tabResumen").textContent = "Pivot semanal";
  $("tabResumen").addEventListener("click", () => cambiarVista("resumen"));

  $("tabDetalle").textContent = "Detalle semana";
  $("tabDetalle").addEventListener("click", () => cambiarVista("detalle"));
}

document.addEventListener("DOMContentLoaded", async () => {
  inicializarEventos();
  await cargarSalidasZapata();
});
