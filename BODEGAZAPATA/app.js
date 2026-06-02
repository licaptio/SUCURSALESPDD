import { db } from "./config.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FECHA_INICIO_MINIMA = "2026-05-25";
const FECHA_BASE_INVENTARIO = "2026-05-25";
const CONTEO_ID_INVENTARIO = "ZAPATA010626";

const REF_SALIDAS_ZAPATA = collection(
  db,
  "almacenes",
  "almacen_zapata",
  "salidas1.0"
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

let registrosDetalle = [];
let registrosPivot = [];
let fechasColumnas = [];
let inventarioInicial = {};
let vistaActual = "resumen";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
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

    return v;
  }

  if (valor && typeof valor.toDate === "function") {
    return valor.toDate().toISOString().slice(0, 10);
  }

  if (valor && typeof valor.seconds === "number") {
    return new Date(valor.seconds * 1000).toISOString().slice(0, 10);
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

function obtenerRangoFechas() {
  let inicio = $("fechaInicio")?.value || FECHA_INICIO_MINIMA;
  let fin = $("fechaFin")?.value || hoyISO();

  if (inicio < FECHA_INICIO_MINIMA) inicio = FECHA_INICIO_MINIMA;
  if (fin < inicio) fin = inicio;

  $("fechaInicio").value = inicio;
  $("fechaFin").value = fin;

  return { inicio, fin };
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
          invini: 0,
          fechaBase: FECHA_BASE_INVENTARIO
        };
      }

      inventario[key].invini += cantidad;

      if (!inventario[key].codigo && codigoOriginal) {
        inventario[key].codigo = codigoOriginal;
      }

      if (!inventario[key].nombre && nombre) {
        inventario[key].nombre = nombre;
      }

      partidasLeidas++;
    });
  }

  inventarioInicial = inventario;

  setStatus(
    `Inventario inicial cargado. Usuarios: ${usuariosLeidos}. Partidas: ${partidasLeidas}.`
  );

  return inventario;
}

async function cargarSalidasZapata() {
  try {
    const { inicio, fin } = obtenerRangoFechas();

    await cargarInventarioInicial();

    setStatus(`Consultando salidas Zapata del ${inicio} al ${fin}...`);
    setProgress(25);

    const q = query(
      REF_SALIDAS_ZAPATA,
      where("fecha", ">=", inicio),
      where("fecha", "<=", fin),
      orderBy("fecha", "desc")
    );

    const snap = await getDocs(q);
    setProgress(65);

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
          docId: documento.id,
          partida: idx + 1,
          folio: String(data.folio || documento.id || "").trim(),
          fecha,
          destino: String(data.destino || "").trim(),
          entrega: String(data.entrega || "").trim(),
          recibe: String(data.recibe || "").trim(),
          folioCincho: String(data.folioCincho || "").trim(),
          codigo: codigoOriginal,
          codigoKey,
          nombre,
          cantidad
        });
      });
    });

    registrosDetalle = detalle;
    construirPivot(detalle);

    actualizarResumenSuperior(docsVistos.size);
    pintarTabla();

    setProgress(100);
    setStatus(
      `Consulta lista. Documentos: ${docsVistos.size}. Partidas salidas: ${detalle.length}. Días: ${fechasColumnas.length}. Inventario base: ${FECHA_BASE_INVENTARIO}.`
    );

    ocultarLoader();
  } catch (error) {
    console.error(error);
    setStatus("Error al cargar salidas Zapata: " + error.message);
    ocultarLoader();
  }
}

function construirPivot(detalle) {
  const fechasSet = new Set();
  const mapa = new Map();

  Object.keys(inventarioInicial).forEach((key) => {
    const inv = inventarioInicial[key];

    mapa.set(key, {
      codigo: inv.codigo,
      codigoKey: inv.codigoKey,
      nombre: inv.nombre,
      invini: Number(inv.invini || 0),
      porFecha: {},
      total: 0,
      existencia: Number(inv.invini || 0)
    });
  });

  detalle.forEach((item) => {
    fechasSet.add(item.fecha);

    const key = item.codigoKey || item.nombre.toLowerCase();

    if (!mapa.has(key)) {
      mapa.set(key, {
        codigo: item.codigo,
        codigoKey: item.codigoKey,
        nombre: item.nombre,
        invini: 0,
        porFecha: {},
        total: 0,
        existencia: 0
      });
    }

    const row = mapa.get(key);

    if (!row.codigo && item.codigo) row.codigo = item.codigo;
    if (!row.nombre && item.nombre) row.nombre = item.nombre;

    row.porFecha[item.fecha] =
      Number(row.porFecha[item.fecha] || 0) + Number(item.cantidad || 0);

    row.total += Number(item.cantidad || 0);
    row.existencia = Number(row.invini || 0) - Number(row.total || 0);
  });

  fechasColumnas = Array.from(fechasSet).sort();

  registrosPivot = Array.from(mapa.values())
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
}

function actualizarResumenSuperior(totalDocs) {
  const totalCantidad = registrosDetalle.reduce(
    (sum, x) => sum + Number(x.cantidad || 0),
    0
  );

  if ($("totalDocs")) $("totalDocs").textContent = totalDocs;
  if ($("totalPartidas")) $("totalPartidas").textContent = registrosDetalle.length;
  if ($("totalCantidad")) $("totalCantidad").textContent = fmtNum(totalCantidad);
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
    item.codigo,
    item.nombre,
    item.folio,
    item.destino,
    item.entrega,
    item.recibe
  ].some((v) => String(v || "").toLowerCase().includes(q));
}

function pintarTabla() {
  if (vistaActual === "detalle") {
    pintarDetalle();
  } else {
    pintarPivotPorDia();
  }
}

function pintarPivotPorDia() {
  const tabla = $("tabla");
  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  const tfoot = tabla.querySelector("tfoot");

  const rows = registrosPivot.filter(pasaFiltroPivot);

  thead.innerHTML = `
    <tr>
      <th class="left">Código</th>
      <th class="left">Nombre</th>
      <th>INVINI<br>${fechaCorta(FECHA_BASE_INVENTARIO)}</th>
      ${fechasColumnas.map(f => `<th>SALIDA<br>${fechaCorta(f)}</th>`).join("")}
      <th>TOTAL<br>SALIDAS</th>
      <th>EXISTENCIA<br>ACTUAL</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td class="left codigo">${escapeHtml(r.codigo)}</td>
      <td class="left">${escapeHtml(r.nombre)}</td>
      <td class="cantidad">${fmtNum(r.invini)}</td>
      ${fechasColumnas.map(f => {
        const val = Number(r.porFecha[f] || 0);
        return `<td class="${val ? "cantidad" : ""}">${fmtCelda(val)}</td>`;
      }).join("")}
      <td class="cantidad">${fmtNum(r.total)}</td>
      <td class="cantidad">${fmtNum(r.existencia)}</td>
    </tr>
  `).join("");

  const totalPorFecha = {};
  fechasColumnas.forEach(f => totalPorFecha[f] = 0);

  rows.forEach(r => {
    fechasColumnas.forEach(f => {
      totalPorFecha[f] += Number(r.porFecha[f] || 0);
    });
  });

  const totalInvini = rows.reduce((sum, r) => sum + Number(r.invini || 0), 0);
  const granTotalSalidas = rows.reduce((sum, r) => sum + Number(r.total || 0), 0);
  const totalExistencia = rows.reduce((sum, r) => sum + Number(r.existencia || 0), 0);

  tfoot.innerHTML = `
    <tr>
      <td class="left" colspan="2">TOTAL</td>
      <td>${fmtNum(totalInvini)}</td>
      ${fechasColumnas.map(f => `<td>${fmtNum(totalPorFecha[f])}</td>`).join("")}
      <td>${fmtNum(granTotalSalidas)}</td>
      <td>${fmtNum(totalExistencia)}</td>
    </tr>
  `;
}

function pintarDetalle() {
  const tabla = $("tabla");
  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  const tfoot = tabla.querySelector("tfoot");

  const rows = registrosDetalle.filter(pasaFiltroDetalle);
  const totalCantidad = rows.reduce((sum, x) => sum + Number(x.cantidad || 0), 0);

  thead.innerHTML = `
    <tr>
      <th>Fecha</th>
      <th class="left">Folio</th>
      <th class="left">Destino</th>
      <th class="left">Entrega</th>
      <th class="left">Recibe</th>
      <th>Partida</th>
      <th class="left">Código</th>
      <th class="left">Nombre</th>
      <th>Cantidad</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
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
      <td class="left" colspan="8">TOTAL</td>
      <td>${fmtNum(totalCantidad)}</td>
    </tr>
  `;
}

function exportarExcel() {
  let rows;

  if (vistaActual === "detalle") {
    rows = registrosDetalle.filter(pasaFiltroDetalle).map((r) => ({
      Fecha: r.fecha,
      Folio: r.folio,
      Destino: r.destino,
      Entrega: r.entrega,
      Recibe: r.recibe,
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
        [`INVINI ${fechaCorta(FECHA_BASE_INVENTARIO)}`]: Number(r.invini || 0)
      };

      fechasColumnas.forEach((f) => {
        obj[`SALIDA ${fechaCorta(f)}`] = Number(r.porFecha[f] || 0);
      });

      obj["TOTAL SALIDAS"] = Number(r.total || 0);
      obj["EXISTENCIA"] = Number(r.existencia || 0);

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
    vistaActual === "detalle" ? "Detalle" : "INVINI menos Salidas"
  );

  const { inicio, fin } = obtenerRangoFechas();
  XLSX.writeFile(wb, `salidas_zapata_${vistaActual}_${inicio}_a_${fin}.xlsx`);
}

function cambiarVista(vista) {
  vistaActual = vista;

  $("tabResumen").classList.toggle("active", vista === "resumen");
  $("tabDetalle").classList.toggle("active", vista === "detalle");

  pintarTabla();
}

function inicializarEventos() {
  $("fechaInicio").min = FECHA_INICIO_MINIMA;
  $("fechaInicio").value = FECHA_INICIO_MINIMA;
  $("fechaFin").value = hoyISO();

  $("btnRecargar").addEventListener("click", cargarSalidasZapata);
  $("btnExportar").addEventListener("click", exportarExcel);
  $("busqueda").addEventListener("input", pintarTabla);

  $("tabResumen").textContent = "INVINI - Salidas";
  $("tabResumen").addEventListener("click", () => cambiarVista("resumen"));
  $("tabDetalle").addEventListener("click", () => cambiarVista("detalle"));

  $("fechaInicio").addEventListener("change", () => {
    if ($("fechaInicio").value < FECHA_INICIO_MINIMA) {
      $("fechaInicio").value = FECHA_INICIO_MINIMA;
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  inicializarEventos();
  await cargarSalidasZapata();
});
