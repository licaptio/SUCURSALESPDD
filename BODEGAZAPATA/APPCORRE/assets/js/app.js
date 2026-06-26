import { $, fechaLocalISO, horaLocal, fmt, escapeHtml, generarIdTemporal, debounce, normalizarCodigo } from "./util.js";
import { cargarCatalogoDesdeMovimientos, buscarCatalogo, calcularTeorico, totalCatalogo } from "./inventarioService.js";
import { grabarMovimiento, listarMovimientos, cargarPartidas, cancelarMovimiento } from "./ajustesService.js";

let vistaActual = "inicio";
let encabezadoActual = null;
let partidas = [];
let productoActual = null;
let modoEdicion = false;
let indiceEdicionPartida = null;

function setLoader(text, pct) {
  $("loaderText").textContent = text;
  $("loaderBar").style.width = `${pct}%`;
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2600);
}

function mostrarVista(vista) {
  vistaActual = vista;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === vista));
  $(`view${vista[0].toUpperCase()}${vista.slice(1)}`).classList.add("active");
  $("tituloVista").textContent = vista === "inicio" ? "Menú inicial" : vista === "nuevo" ? "Nuevo movimiento" : "Movimientos grabados";
  if (vista === "grabados") cargarListaGrabados();
}

function abrirModal(id) { $("modalBackdrop").classList.remove("hidden"); $(id).classList.remove("hidden"); }
function cerrarModal(id) { $(id).classList.add("hidden"); if (!["modalDatos","modalArticulo","modalCarrito","modalConfirm"].some(x => !$(x).classList.contains("hidden"))) $("modalBackdrop").classList.add("hidden"); }
function cerrarTodosModales() { ["modalDatos","modalArticulo","modalCarrito","modalConfirm"].forEach(id => $(id).classList.add("hidden")); $("modalBackdrop").classList.add("hidden"); }

function llenarDatosIniciales() {
  const hoy = fechaLocalISO();
  $("fechaEntrada").value = hoy;
  $("fechaMovimiento").value = hoy;
  $("horaMovimiento").value = horaLocal();
  if (!$("usuarioMovimiento").value) $("usuarioMovimiento").value = "GERARDO RIOS";
  $("motivoMovimiento").value = "CONTEO FÍSICO";
}

function iniciarNuevoMovimiento() {
  if (encabezadoActual && partidas.length) {
    confirmar("Movimiento en captura", "Hay partidas sin grabar. ¿Deseas cancelar y empezar otro movimiento?", () => {
      resetMovimiento();
      llenarDatosIniciales();
      abrirModal("modalDatos");
    });
    return;
  }
  resetMovimiento();
  llenarDatosIniciales();
  abrirModal("modalDatos");
}

function crearDocumentoTemporal() {
  const fechaEntrada = $("fechaEntrada").value;
  const fechaMovimiento = $("fechaMovimiento").value;
  const horaMovimiento = $("horaMovimiento").value;
  const usuario = $("usuarioMovimiento").value.trim();
  const motivo = $("motivoMovimiento").value;

  if (!fechaEntrada || !fechaMovimiento || !horaMovimiento || !usuario || !motivo) {
    toast("Completa fecha, hora, usuario y motivo.");
    return;
  }

  encabezadoActual = {
    folio: generarIdTemporal(),
    fecha_entrada: fechaEntrada,
    fecha_movimiento: fechaMovimiento,
    hora_movimiento: horaMovimiento,
    usuario,
    motivo,
    observaciones: $("observacionesMovimiento").value.trim()
  };

  modoEdicion = false;
  partidas = [];
  cerrarModal("modalDatos");
  mostrarVista("nuevo");
  pintarDocumento();
  abrirModalArticulo();
}

function pintarDocumento() {
  const hayDoc = !!encabezadoActual;
  $("workspaceSinDoc").classList.toggle("hidden", hayDoc);
  $("workspaceDoc").classList.toggle("hidden", !hayDoc);
  $("btnVerCarrito").classList.toggle("hidden", !hayDoc);

  if (!hayDoc) {
    $("docActualMini").textContent = "Sin documento";
    return;
  }

  $("folioTemporal").textContent = encabezadoActual.folio;
  $("metaFechaEntrada").textContent = encabezadoActual.fecha_entrada;
  $("metaFechaMov").textContent = encabezadoActual.fecha_movimiento;
  $("metaHoraMov").textContent = encabezadoActual.hora_movimiento;
  $("metaMotivo").textContent = encabezadoActual.motivo;
  $("sumUsuario").textContent = encabezadoActual.usuario;
  $("docActualMini").textContent = encabezadoActual.folio;
  actualizarResumenCarrito();
}

function abrirModalArticulo() {
  if (!encabezadoActual) { toast("Primero crea el movimiento."); return; }
  limpiarArticulo();
  abrirModal("modalArticulo");
  setTimeout(() => $("buscarArticulo").focus(), 100);
}

function limpiarArticulo() {
  productoActual = null;
  indiceEdicionPartida = null;
  $("buscarArticulo").value = "";
  $("resultadosArticulo").innerHTML = "";
  $("productoSeleccionado").textContent = "Sin seleccionar";
  $("teoricoArticulo").textContent = "0.00";
  $("fisicoPreview").textContent = "0.00";
  $("diferenciaPreview").textContent = "0.00";
  $("fisicoArticulo").value = "";
  $("fisicoArticulo").disabled = true;
  $("btnPregrabarPartida").disabled = true;
  $("btnPregrabarPartida").textContent = "Pregrabar en carrito";
}

async function seleccionarProducto(p) {
  productoActual = p;
  const teorico = await calcularTeorico(p.codigoKey, encabezadoActual.fecha_movimiento);
  productoActual.teorico = teorico;
  $("productoSeleccionado").textContent = `${p.codigo} · ${p.nombre}`;
  $("teoricoArticulo").textContent = fmt(teorico);
  $("fisicoArticulo").disabled = false;
  $("btnPregrabarPartida").disabled = false;
  $("fisicoArticulo").focus();
  actualizarPreviewDiferencia();
}

function actualizarPreviewDiferencia() {
  const fisico = Number($("fisicoArticulo").value || 0);
  const teorico = Number(productoActual?.teorico || 0);
  $("fisicoPreview").textContent = fmt(fisico);
  $("diferenciaPreview").textContent = fmt(fisico - teorico);
}

function pregrabarPartida() {
  if (!productoActual) { toast("Selecciona un producto."); return; }
  const fisico = Number($("fisicoArticulo").value);
  if (Number.isNaN(fisico)) { toast("Captura existencia física."); return; }
  const teorico = Number(productoActual.teorico || 0);
  const item = {
    codigo: productoActual.codigo,
    codigoKey: normalizarCodigo(productoActual.codigoKey || productoActual.codigo),
    nombre: productoActual.nombre,
    teorico,
    fisico,
    diferencia: fisico - teorico
  };

  if (indiceEdicionPartida !== null) partidas[indiceEdicionPartida] = item;
  else partidas.push(item);

  actualizarResumenCarrito();
  toast("Partida pregrabada en carrito.");
  limpiarArticulo();
  setTimeout(() => $("buscarArticulo").focus(), 50);
}

function actualizarResumenCarrito() {
  const total = partidas.reduce((s, p) => s + Number(p.diferencia || 0), 0);
  const n = partidas.length;
  ["sumPartidas","cartPartidas"].forEach(id => $(id).textContent = n);
  ["sumDiferencia","cartDiferencia"].forEach(id => $(id).textContent = fmt(total));
  $("badgeCarrito").textContent = n;
  $("btnGuardarMovimiento").disabled = n === 0;
  $("btnGuardarDesdeCarrito").disabled = n === 0;
  $("btnGuardarMovimiento").textContent = modoEdicion ? "Guardar cambios" : "Grabar movimiento";
  $("btnGuardarDesdeCarrito").textContent = modoEdicion ? "Guardar cambios" : "Grabar movimiento";
  pintarCarrito();
}

function pintarCarrito() {
  const tbody = $("tablaCarrito");
  if (!partidas.length) {
    tbody.innerHTML = `<tr><td colspan="7">Sin partidas pregrabadas.</td></tr>`;
    return;
  }
  tbody.innerHTML = partidas.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(p.codigo)}</td>
      <td class="left">${escapeHtml(p.nombre)}</td>
      <td>${fmt(p.teorico)}</td>
      <td>${fmt(p.fisico)}</td>
      <td>${fmt(p.diferencia)}</td>
      <td>
        <button class="secondary" data-edit-partida="${i}">Editar</button>
        <button class="danger" data-del-partida="${i}">Eliminar</button>
      </td>
    </tr>
  `).join("");
}

function editarPartida(i) {
  const p = partidas[i];
  if (!p) return;
  productoActual = { codigo: p.codigo, codigoKey: p.codigoKey, nombre: p.nombre, teorico: p.teorico };
  indiceEdicionPartida = i;
  $("productoSeleccionado").textContent = `${p.codigo} · ${p.nombre}`;
  $("teoricoArticulo").textContent = fmt(p.teorico);
  $("fisicoArticulo").disabled = false;
  $("fisicoArticulo").value = p.fisico;
  $("btnPregrabarPartida").disabled = false;
  $("btnPregrabarPartida").textContent = "Actualizar partida";
  actualizarPreviewDiferencia();
  cerrarModal("modalCarrito");
  abrirModal("modalArticulo");
}

function eliminarPartida(i) {
  confirmar("Eliminar partida", "¿Eliminar esta partida del carrito?", () => {
    partidas.splice(i, 1);
    actualizarResumenCarrito();
  });
}

async function guardarActual() {
  if (!encabezadoActual || !partidas.length) { toast("No hay movimiento para grabar."); return; }
  try {
    const folio = await grabarMovimiento(encabezadoActual, partidas, modoEdicion ? "editar" : "nuevo");
    toast(`Movimiento grabado: ${folio}`);
    resetMovimiento();
    cerrarTodosModales();
    mostrarVista("grabados");
  } catch (e) {
    console.error(e);
    toast("Error al grabar: " + e.message);
  }
}

function resetMovimiento() {
  encabezadoActual = null;
  partidas = [];
  productoActual = null;
  modoEdicion = false;
  indiceEdicionPartida = null;
  pintarDocumento();
  actualizarResumenCarrito();
}

async function cargarListaGrabados() {
  const cont = $("listaGrabados");
  cont.innerHTML = `<div class="mini-card">Cargando movimientos...</div>`;
  try {
    const rows = await listarMovimientos();
    if (!rows.length) {
      cont.innerHTML = `<div class="mini-card">No hay movimientos grabados.</div>`;
      return;
    }
    cont.innerHTML = rows.map(r => `
      <div class="record-item">
        <div>
          <strong>${escapeHtml(r.folio || r.id)}</strong><br>
          <small>${escapeHtml(r.fecha_movimiento || "")} · ${escapeHtml(r.hora_movimiento || "")} · ${escapeHtml(r.motivo || "")} · Partidas: ${Number(r.total_partidas || 0)} · Dif: ${fmt(r.total_diferencia)}</small><br>
          <small>Usuario: ${escapeHtml(r.usuario || "")} · Estado: ${r.cancelado ? "CANCELADO" : escapeHtml(r.estado || "GRABADO")}</small>
        </div>
        <div class="top-actions">
          <button class="secondary" data-open-record="${escapeHtml(r.id)}">Editar</button>
          <button class="danger" data-cancel-record="${escapeHtml(r.id)}">Cancelar</button>
        </div>
      </div>
    `).join("");
  } catch (e) {
    console.error(e);
    cont.innerHTML = `<div class="mini-card">Error al cargar movimientos: ${escapeHtml(e.message)}</div>`;
  }
}

async function abrirMovimientoGrabado(folio) {
  try {
    const rows = await listarMovimientos();
    const enc = rows.find(x => x.id === folio || x.folio === folio);
    if (!enc) throw new Error("No se encontró el movimiento.");
    const ps = await cargarPartidas(folio);
    encabezadoActual = {
      folio: folio,
      fecha_entrada: enc.fecha_entrada,
      fecha_movimiento: enc.fecha_movimiento,
      hora_movimiento: enc.hora_movimiento,
      usuario: enc.usuario,
      motivo: enc.motivo,
      observaciones: enc.observaciones || "",
      creado_en: enc.creado_en || null
    };
    partidas = ps.map(p => ({
      codigo: p.codigo,
      codigoKey: p.codigoKey,
      nombre: p.nombre,
      teorico: Number(p.existencia_teorica || 0),
      fisico: Number(p.existencia_fisica || 0),
      diferencia: Number(p.diferencia || 0)
    }));
    modoEdicion = true;
    mostrarVista("nuevo");
    pintarDocumento();
    abrirModal("modalCarrito");
  } catch (e) {
    console.error(e);
    toast(e.message);
  }
}

function cancelarGrabado(folio) {
  confirmar("Cancelar movimiento", `¿Cancelar el movimiento ${folio}?`, async () => {
    try {
      await cancelarMovimiento(folio, encabezadoActual?.usuario || "USUARIO");
      toast("Movimiento cancelado.");
      cargarListaGrabados();
    } catch (e) { toast("Error al cancelar: " + e.message); }
  });
}

function confirmar(titulo, texto, onSi) {
  $("confirmTitle").textContent = titulo;
  $("confirmText").textContent = texto;
  abrirModal("modalConfirm");
  const si = $("confirmSi");
  const no = $("confirmNo");
  const clean = () => { si.onclick = null; no.onclick = null; cerrarModal("modalConfirm"); };
  si.onclick = () => { clean(); onSi(); };
  no.onclick = clean;
}

const buscarDebounced = debounce(() => {
  const q = $("buscarArticulo").value;
  const rows = buscarCatalogo(q);
  const cont = $("resultadosArticulo");
  if (!q.trim()) { cont.innerHTML = ""; return; }
  if (!rows.length) { cont.innerHTML = `<div class="result-item"><strong>Sin resultados</strong><span>Solo se muestran artículos con entradas o salidas.</span></div>`; return; }
  cont.innerHTML = rows.map((r, i) => `
    <div class="result-item" data-result-index="${i}">
      <strong>${escapeHtml(r.codigo)} · ${escapeHtml(r.nombre)}</strong>
      <span>Código interno: ${escapeHtml(r.codigoKey)}</span>
    </div>
  `).join("");
  cont._rows = rows;
}, 120);

function bindEventos() {
  document.querySelectorAll(".nav-btn").forEach(b => b.addEventListener("click", () => mostrarVista(b.dataset.view)));
  $("btnInicioNuevo").addEventListener("click", iniciarNuevoMovimiento);
  $("btnCrearDesdeWorkspace").addEventListener("click", iniciarNuevoMovimiento);
  $("btnInicioGrabados").addEventListener("click", () => mostrarVista("grabados"));
  $("btnSiguienteDatos").addEventListener("click", crearDocumentoTemporal);
  $("btnAgregarArticulo").addEventListener("click", abrirModalArticulo);
  $("btnVerCarrito").addEventListener("click", () => abrirModal("modalCarrito"));
  $("btnVerCarritoWorkspace").addEventListener("click", () => abrirModal("modalCarrito"));
  $("btnAbrirCarritoDesdeArticulo").addEventListener("click", () => abrirModal("modalCarrito"));
  $("btnAgregarDesdeCarrito").addEventListener("click", () => {
    cerrarModal("modalCarrito");
    abrirModalArticulo();
  });
  $("btnGuardarMovimiento").addEventListener("click", guardarActual);
  $("btnGuardarDesdeCarrito").addEventListener("click", guardarActual);
  $("btnRecargarGrabados").addEventListener("click", cargarListaGrabados);
  $("btnCancelarMovimiento").addEventListener("click", () => confirmar("Cancelar captura", "¿Cancelar el movimiento temporal?", resetMovimiento));

  document.querySelectorAll("[data-close-modal]").forEach(b => b.addEventListener("click", () => cerrarModal("modalDatos")));
  document.querySelectorAll("[data-close-articulo]").forEach(b => b.addEventListener("click", () => cerrarModal("modalArticulo")));
  document.querySelectorAll("[data-close-carrito]").forEach(b => b.addEventListener("click", () => cerrarModal("modalCarrito")));

  $("buscarArticulo").addEventListener("input", buscarDebounced);
  $("resultadosArticulo").addEventListener("click", (ev) => {
    const item = ev.target.closest("[data-result-index]");
    if (!item) return;
    const p = $("resultadosArticulo")._rows[Number(item.dataset.resultIndex)];
    seleccionarProducto(p);
  });
  $("fisicoArticulo").addEventListener("input", actualizarPreviewDiferencia);
  $("fisicoArticulo").addEventListener("keydown", (e) => { if (e.key === "Enter") pregrabarPartida(); });
  $("btnPregrabarPartida").addEventListener("click", pregrabarPartida);

  $("tablaCarrito").addEventListener("click", (ev) => {
    const edit = ev.target.closest("[data-edit-partida]");
    const del = ev.target.closest("[data-del-partida]");
    if (edit) editarPartida(Number(edit.dataset.editPartida));
    if (del) eliminarPartida(Number(del.dataset.delPartida));
  });

  $("listaGrabados").addEventListener("click", (ev) => {
    const open = ev.target.closest("[data-open-record]");
    const cancel = ev.target.closest("[data-cancel-record]");
    if (open) abrirMovimientoGrabado(open.dataset.openRecord);
    if (cancel) cancelarGrabado(cancel.dataset.cancelRecord);
  });
}

async function init() {
  try {
    bindEventos();
    setLoader("Conectando con Firebase...", 20);
    await cargarCatalogoDesdeMovimientos(setLoader);
    $("totalCatalogo").textContent = totalCatalogo();
    $("estadoSistema").textContent = "Listo";
    setLoader("Aplicación lista", 100);
    setTimeout(() => $("loader").classList.add("hide"), 350);
    pintarDocumento();
  } catch (e) {
    console.error(e);
    $("loaderText").textContent = "Error: " + e.message;
    $("estadoSistema").textContent = "Error";
  }
}

init();
