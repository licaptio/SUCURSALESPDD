import {
  guardarProveedorAutorizado,
  cargarProveedoresAutorizados,
  eliminarProveedorAutorizado,
  guardarEquivalencia,
  cargarEquivalencias,
  cargarProductosActivosLocal,
  sincronizarProductosActivosLocalDiario,
  buscarProductoActivoFirebaseYGuardarLocal,
  filtrarProductosCatalogo
} from "./configuracion.js";

import {
  cargarFacturasOrigen,
  filtrarFacturasPendientesParaZapata,
  marcarFacturaNoEntraZapata,
  cargarHistorialZapata
} from "./facturas.js";

import {
  prepararArticulosEntrada,
  generarEntradaZapata,
  cargarEntradasZapata,
  generarAjusteEntradaZapata,
  actualizarEntradaZapata,
  desguardarEntradaZapata
} from "./entradas.js";

let proveedores = [];
let proveedorEditandoId = null;
let equivalencias = [];
let facturasPendientes = [];
let proveedorPendienteSeleccionado = null;
let filtroFacturasPendientes = "";
let entradasCache = [];
let entradasCacheCargado = false;
let historialCache = [];
let historialCacheCargado = false;
let facturaSeleccionada = null;
let articulosPreparados = [];

let productosActivos = [];
let productosActivosCargados = false;
let indiceArticuloEnlace = null;
let productoSeleccionado = null;
let callbackEntradaGenerada = null;
let obtenerCatalogoTabla = null;
let catalogoTabla = [];
let moduloEntradasInicializado = false;

export async function iniciarModuloEntradasZapata(opciones = {}) {
  callbackEntradaGenerada = typeof opciones.onEntradaGenerada === "function" ? opciones.onEntradaGenerada : null;
  obtenerCatalogoTabla = typeof opciones.getCatalogoTabla === "function" ? opciones.getCatalogoTabla : null;

  if (!moduloEntradasInicializado) {
    configurarTabs();
    configurarBotones();
    moduloEntradasInicializado = true;
  }

  await iniciarAplicacion();
}

export async function refrescarModuloEntradasZapata(conModal = false) {
  await cargarConfiguracionesIniciales();
  await cargarFacturasUI(conModal);
}

async function iniciarAplicacion() {
  mostrarCargando("Cargando configuración y facturas pendientes...");

  try {
    await cargarConfiguracionesIniciales();
    await cargarFacturasUI(false);
  } catch (error) {
    notificar(error.message || "Error al cargar la aplicación", "error");
  } finally {
    ocultarCargando();
  }
}

function configurarTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("activo"));
      btn.classList.add("activo");

      const vista = btn.dataset.vista;

      document.querySelectorAll("#panelEntradasZapata .vista").forEach(v => v.classList.remove("activa"));

      document.getElementById(`vista${capitalizar(vista)}`).classList.add("activa");
      const menuApp = document.getElementById("menuEntradasApp");
      if (menuApp) menuApp.open = false;

      if (vista === "historial") {
        await cargarHistorialUI();
      }
    });
  });
}

function configurarBotones() {
  document.getElementById("btnNuevoProveedor")?.addEventListener("click", () => abrirModalProveedor());
  document.getElementById("btnGuardarProveedor")?.addEventListener("click", guardarProveedorUI);
  document.getElementById("btnEliminarProveedor")?.addEventListener("click", eliminarProveedorUI);
  document.getElementById("btnCerrarModalProveedor")?.addEventListener("click", cerrarModalProveedor);
  document.getElementById("btnCancelarProveedor")?.addEventListener("click", cerrarModalProveedor);
  document.getElementById("buscarProveedor")?.addEventListener("input", pintarProveedores);
  document.getElementById("modalProveedor")?.addEventListener("click", (ev) => {
    if (ev.target?.id === "modalProveedor") cerrarModalProveedor();
  });

  document
    .getElementById("btnRefrescarFacturas")
    .addEventListener("click", () => cargarFacturasUI(true));

  document
    .getElementById("btnCargarEntradas")
    .addEventListener("click", cargarEntradasUI);

  document
    .getElementById("btnCargarHistorial")
    .addEventListener("click", cargarHistorialUI);

  document
    .getElementById("btnCerrarModal")
    .addEventListener("click", cerrarModal);

  document
    .getElementById("btnCancelarModal")
    ?.addEventListener("click", cerrarModal);

  document
    .addEventListener("click", (ev) => {
      if (ev.target?.id === "btnCerrarRevisionFactura") cerrarModal();
      if (ev.target?.id === "btnCancelarRevisionFactura") cerrarModal();
    });

  document
    .getElementById("btnGenerarEntrada")
    .addEventListener("click", generarEntradaUI);

  document
    .getElementById("btnFacturaNoEntra")
    .addEventListener("click", marcarNoEntraUI);

  document
    .getElementById("btnCerrarProducto")
    .addEventListener("click", cerrarModalProducto);

  document
    .getElementById("btnCancelarProducto")
    ?.addEventListener("click", cerrarModalProducto);

  // El enlace nunca es obligatorio para cerrar la revisión.
  // Esc cierra primero el buscador de producto; si no está abierto,
  // regresa de la factura a la lista de pendientes.
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;

    const modalProducto = document.getElementById("modalProducto");
    if (modalProducto && !modalProducto.classList.contains("oculto")) {
      ev.preventDefault();
      cerrarModalProducto();
      return;
    }

    const modalFactura = document.getElementById("modalFactura");
    const pantallaRevision = document.getElementById("pantallaRevisionFactura");
    const revisionAbierta =
      (modalFactura && !modalFactura.classList.contains("oculto")) ||
      (pantallaRevision && !pantallaRevision.classList.contains("oculto"));

    if (revisionAbierta) {
      ev.preventDefault();
      cerrarModal();
    }
  });

  // Clic en el fondo oscuro también permite salir del buscador sin enlazar.
  document.getElementById("modalProducto")?.addEventListener("click", (ev) => {
    if (ev.target?.id === "modalProducto") cerrarModalProducto();
  });

  document
    .getElementById("btnBuscarProducto")
    .addEventListener("click", buscarProductoUI);

document
  .getElementById("buscarProductoTexto")
  .addEventListener("input", debounce(buscarProductoUI, 120));
  
  document
    .getElementById("btnMostrarConversion")
    .addEventListener("click", toggleConversion);

  document
    .getElementById("operacionConversionProducto")
    .addEventListener("change", sincronizarCantidadDesdeFactor);

  document
    .getElementById("factorConversionProducto")
    .addEventListener("input", sincronizarCantidadDesdeFactor);

  document
    .getElementById("cantidadEntradaProducto")
    .addEventListener("input", sincronizarFactorDesdeCantidad);

  document
    .getElementById("btnGuardarProductoEnlace")
    .addEventListener("click", guardarEnlaceProductoSeleccionado);
}

async function cargarConfiguracionesIniciales() {
  proveedores = await cargarProveedoresAutorizados();
  equivalencias = await cargarEquivalencias();

  pintarProveedores();
}

async function guardarProveedorUI() {
  const rfcInput = document.getElementById("rfcProveedor");
  const nombreInput = document.getElementById("nombreProveedor");
  const aliasInput = document.getElementById("aliasPivotProveedor");
  const rfc = String(rfcInput?.value || "").trim().toUpperCase();
  const nombre = String(nombreInput?.value || "").trim();
  const aliasPivot = String(aliasInput?.value || "").trim().toUpperCase();
  const eraEdicion = Boolean(proveedorEditandoId);

  if (!rfc && !proveedorEditandoId) { notificar("RFC requerido.", "error"); rfcInput?.focus(); return; }
  if (!nombre) { notificar("Nombre del proveedor requerido.", "error"); nombreInput?.focus(); return; }

  const idProveedor = String(proveedorEditandoId || rfc).toUpperCase();
  const btn = document.getElementById("btnGuardarProveedor");
  try {
    if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }
    await guardarProveedorAutorizado({ rfc_emisor:idProveedor, razon_social_emisor:nombre, alias_pivot:aliasPivot });
    const proveedorLocal = { id:idProveedor, rfc_emisor:idProveedor, razon_social_emisor:nombre, alias_pivot:aliasPivot || nombre, activo:true };
    proveedores = proveedores.filter(p => String(p.id || p.rfc_emisor || "").toUpperCase() !== idProveedor);
    proveedores.unshift(proveedorLocal);
    proveedores.sort((a,b) => String(a.razon_social_emisor || "").localeCompare(String(b.razon_social_emisor || ""), "es"));
    cerrarModalProveedor();
    pintarProveedores();
    notificar(eraEdicion ? "Proveedor actualizado correctamente." : "Proveedor autorizado correctamente.", "ok");
  } catch (error) { notificar(error.message || "No fue posible guardar el proveedor.", "error"); }
  finally { if (btn) { btn.disabled=false; btn.textContent="Guardar proveedor"; } }
}

function abrirModalProveedor(proveedor = null) {
  proveedorEditandoId = proveedor ? String(proveedor.id || proveedor.rfc_emisor || "").toUpperCase() : null;
  const modal=document.getElementById("modalProveedor"), rfc=document.getElementById("rfcProveedor"), nombre=document.getElementById("nombreProveedor"), alias=document.getElementById("aliasPivotProveedor");
  if (rfc) { rfc.value=proveedor?.rfc_emisor || ""; rfc.disabled=Boolean(proveedor); }
  if (nombre) nombre.value=proveedor?.razon_social_emisor || "";
  if (alias) alias.value=proveedor?.alias_pivot || "";
  const titulo=document.getElementById("tituloModalProveedor"), subtitulo=document.getElementById("subtituloModalProveedor"), guardar=document.getElementById("btnGuardarProveedor"), danger=document.getElementById("zonaEliminarProveedor"), ayuda=document.getElementById("ayudaRfcProveedor");
  if (titulo) titulo.textContent=proveedor ? "Editar proveedor autorizado" : "Nuevo proveedor autorizado";
  if (subtitulo) subtitulo.textContent=proveedor ? "Modifica la información del proveedor seleccionado." : "Registra el proveedor que podrá generar entradas.";
  if (guardar) guardar.textContent=proveedor ? "Guardar cambios" : "Guardar proveedor";
  danger?.classList.toggle("oculto", !proveedor);
  if (ayuda) ayuda.textContent=proveedor ? "El RFC está protegido porque identifica el registro." : "Se utilizará como identificador único.";
  modal?.classList.remove("oculto");
  setTimeout(() => (proveedor ? nombre : rfc)?.focus(), 0);
}

function cerrarModalProveedor() {
  document.getElementById("modalProveedor")?.classList.add("oculto");
  proveedorEditandoId=null;
  const rfc=document.getElementById("rfcProveedor"), nombre=document.getElementById("nombreProveedor"), alias=document.getElementById("aliasPivotProveedor");
  if (rfc) { rfc.disabled=false; rfc.value=""; }
  if (nombre) nombre.value=""; if (alias) alias.value="";
}

async function eliminarProveedorUI() {
  const id=String(proveedorEditandoId || "").trim().toUpperCase(); if (!id) return;
  const proveedor=proveedores.find(p => String(p.id || p.rfc_emisor || "").toUpperCase() === id);
  const nombre=proveedor?.razon_social_emisor || id;
  if (!window.confirm(`¿Eliminar a ${nombre} de proveedores autorizados?\n\nLas entradas históricas no se eliminarán.`)) return;
  const btn=document.getElementById("btnEliminarProveedor");
  try {
    if (btn) { btn.disabled=true; btn.textContent="Eliminando..."; }
    await eliminarProveedorAutorizado(id);
    proveedores=proveedores.filter(p => String(p.id || p.rfc_emisor || "").toUpperCase() !== id);
    cerrarModalProveedor(); pintarProveedores(); notificar("Proveedor eliminado de autorizados.", "ok");
  } catch (error) { notificar(error.message || "No fue posible eliminar el proveedor.", "error"); }
  finally { if (btn) { btn.disabled=false; btn.textContent="Eliminar"; } }
}

async function cargarFacturasUI(conModal = true) {
  const contenedor = document.getElementById("listaFacturas");

  if (conModal) {
    mostrarCargando("Cargando facturas pendientes...");
  }

  contenedor.innerHTML = "<p>Cargando facturas...</p>";

  try {
    if (!proveedores.length || conModal) {
      proveedores = await cargarProveedoresAutorizados();
    }

    if (!equivalencias.length || conModal) {
      equivalencias = await cargarEquivalencias();
    }

    pintarProveedores();

    const facturas = await cargarFacturasOrigen(1000);

    facturasPendientes = await filtrarFacturasPendientesParaZapata(
      facturas,
      proveedores
    );

    pintarFacturas();
    notificar(`Facturas pendientes listas: ${facturasPendientes.length}.`, "info", 2200);
  } catch (error) {
    contenedor.innerHTML = `<p class="alerta">${escapeHtml(error.message)}</p>`;
    notificar(error.message, "error");
  } finally {
    if (conModal) {
      ocultarCargando();
    }
  }
}

async function cargarEntradasUI() {
  const contenedor = document.getElementById("listaEntradas");
  contenedor.innerHTML = "<p>Cargando entradas...</p>";

  try {
    if (!entradasCacheCargado) {
      entradasCache = await cargarEntradasZapata(100);
      entradasCacheCargado = true;
    }

    const entradas = entradasCache;

    contenedor.innerHTML = "";

    if (entradas.length === 0) {
      contenedor.innerHTML = "<p>No hay entradas registradas.</p>";
      return;
    }

    entradas.forEach(e => {
      const div = document.createElement("div");
      div.className = "card";

      div.innerHTML = `
        <h3>${escapeHtml(e.folioEntrada || e.id)}</h3>
        <p><b>Proveedor:</b> ${escapeHtml(e.razon_social_emisor || "")}</p>
        <p><b>RFC:</b> ${escapeHtml(e.rfc_emisor || "")}</p>
        <p><b>Factura:</b> ${escapeHtml(e.serie || "")} ${escapeHtml(e.folio || "")}</p>
        <p><b>Fecha factura:</b> ${escapeHtml(e.fecha_factura || "")}</p>
        <p><b>Total:</b> ${formatoPesos(e.total_factura)}</p>
        <p><b>UUID:</b> ${escapeHtml(e.uuid_cfdi || "")}</p>
        <p><b>Artículos:</b> ${(e.articulos || []).length}</p>
        <p><span class="badge badge-ok">${escapeHtml(e.estado_zapata || e.estado || "")}</span></p>
        <div class="acciones-card">
          <button class="btn-mini btnModificarEntrada" data-id="${escapeHtml(e.id)}">Modificar cantidades</button>
          <button class="btn-mini btnDesguardarEntrada" data-id="${escapeHtml(e.id)}">Desguardar</button>
        </div>
      `;

      contenedor.appendChild(div);
    });

    contenedor.querySelectorAll(".btnModificarEntrada").forEach(btn => {
      btn.addEventListener("click", () => modificarEntradaUI(btn.dataset.id));
    });
    contenedor.querySelectorAll(".btnDesguardarEntrada").forEach(btn => {
      btn.addEventListener("click", () => desguardarEntradaUI(btn.dataset.id));
    });
  } catch (error) {
    contenedor.innerHTML = `<p class="alerta">${escapeHtml(error.message)}</p>`;
    notificar(error.message, "error");
  }
}

function asegurarModalAjusteEntrada() {
  if (document.getElementById("modalAjusteEntrada")) return;
  const modal = document.createElement("div");
  modal.id = "modalAjusteEntrada";
  modal.className = "modal oculto";
  modal.innerHTML = `
    <div class="modal-contenido ajuste-entrada-modal">
      <div class="modal-head-ajuste-entrada">
        <div class="ajuste-entrada-titulo-wrap">
          <div class="ajuste-entrada-icono" aria-hidden="true">↩</div>
          <div>
            <span class="entradas-section-kicker">MOVIMIENTO DE INVENTARIO</span>
            <h2>Ajuste de entrada</h2>
            <p>Registra una devolución o corrección sin modificar la factura original.</p>
          </div>
        </div>
        <button id="btnCerrarAjusteEntrada" type="button" class="ajuste-entrada-cerrar" aria-label="Cerrar">✕</button>
      </div>

      <div class="ajuste-entrada-ref-card">
        <span class="ajuste-entrada-ref-label">ENTRADA ORIGINAL</span>
        <strong id="ajusteEntradaReferencia"></strong>
      </div>

      <div class="ajuste-entrada-datos">
        <label class="campo-ajuste-entrada"><span>Fecha del ajuste</span>
          <input id="fechaAjusteEntrada" type="date" required />
        </label>
        <label class="campo-ajuste-entrada"><span>Hora del ajuste</span>
          <input id="horaAjusteEntrada" type="time" required />
        </label>
        <label class="campo-ajuste-entrada motivo"><span>Motivo del ajuste</span>
          <input id="motivoAjusteEntrada" value="DEVOLUCIÓN A PROVEEDOR" maxlength="120" required />
        </label>
      </div>

      <div class="ajuste-entrada-aviso-modal">
        <span class="ajuste-entrada-aviso-icono" aria-hidden="true">−</span>
        <div><strong>Este movimiento descontará inventario</strong><p>Captura únicamente la cantidad que salió de regreso al proveedor. Se guardará como movimiento negativo y quedará ligado a esta entrada.</p></div>
      </div>

      <div class="ajuste-entrada-tabla-wrap">
        <table class="ajuste-entrada-tabla">
          <thead><tr><th>Código</th><th>Artículo</th><th>Entrada original</th><th>Cantidad a devolver</th></tr></thead>
          <tbody id="partidasAjusteEntrada"></tbody>
        </table>
      </div>

      <div class="ajuste-entrada-footer">
        <div class="ajuste-entrada-footer-info"><strong>AJUSTE ENTRADA</strong><span>Quedará registrado con fecha, hora, motivo y usuario.</span></div>
        <div class="acciones-modal"><button id="btnCancelarAjusteEntrada" type="button" class="ajuste-btn-secundario">Cancelar</button><button id="btnGuardarAjusteEntrada" type="button" class="principal ajuste-btn-guardar">Guardar y descontar</button></div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", ev => { if (ev.target === modal) cerrarAjusteEntradaUI(); });
  modal.querySelector("#btnCerrarAjusteEntrada")?.addEventListener("click", cerrarAjusteEntradaUI);
  modal.querySelector("#btnCancelarAjusteEntrada")?.addEventListener("click", cerrarAjusteEntradaUI);
  modal.querySelector("#btnGuardarAjusteEntrada")?.addEventListener("click", guardarAjusteEntradaUI);
}

let entradaAjusteSeleccionada = null;

function abrirAjusteEntradaUI(id) {
  asegurarModalAjusteEntrada();
  const entrada = entradasCache.find(e => String(e.id) === String(id));
  if (!entrada) return notificar("No se encontró la entrada.", "error");
  entradaAjusteSeleccionada = entrada;
  const ref = document.getElementById("ajusteEntradaReferencia");
  if (ref) ref.textContent = `${entrada.folioEntrada || id} · ${entrada.razon_social_emisor || "Proveedor"} · Factura ${entrada.serie || ""} ${entrada.folio || ""}`;
  const motivo = document.getElementById("motivoAjusteEntrada");
  if (motivo) motivo.value = "DEVOLUCIÓN A PROVEEDOR";
  const ahora = new Date();
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,"0")}-${String(ahora.getDate()).padStart(2,"0")}`;
  const hora = `${String(ahora.getHours()).padStart(2,"0")}:${String(ahora.getMinutes()).padStart(2,"0")}`;
  const fechaInput = document.getElementById("fechaAjusteEntrada");
  if (fechaInput) { fechaInput.value = hoy; fechaInput.min = String(entrada.fecha || entrada.fecha_factura || "").slice(0,10) || "2026-08-17"; }
  const horaInput = document.getElementById("horaAjusteEntrada");
  if (horaInput) horaInput.value = hora;
  const body = document.getElementById("partidasAjusteEntrada");
  body.innerHTML = (entrada.articulos || []).map((a, i) => `
    <tr>
      <td><b>${escapeHtml(a.codigo_interno || a.codigo_factura || "")}</b></td>
      <td>${escapeHtml(a.descripcion_interna || a.descripcion_factura || "")}</td>
      <td class="num">${numeroCorto(Number(a.cantidad_entrada || 0))}</td>
      <td><input class="cantidad-devolucion-entrada" data-index="${i}" type="number" min="0" step="0.0001" value="0" inputmode="decimal"></td>
    </tr>`).join("");
  document.getElementById("modalAjusteEntrada")?.classList.remove("oculto");
}

function cerrarAjusteEntradaUI() {
  document.getElementById("modalAjusteEntrada")?.classList.add("oculto");
  entradaAjusteSeleccionada = null;
}

async function guardarAjusteEntradaUI() {
  const entrada = entradaAjusteSeleccionada;
  if (!entrada) return;
  const inputs = [...document.querySelectorAll("#partidasAjusteEntrada .cantidad-devolucion-entrada")];
  const partidas = [];
  for (const input of inputs) {
    const devuelta = Number(input.value || 0);
    if (!Number.isFinite(devuelta) || devuelta < 0) return notificar("Hay una cantidad de devolución inválida.", "error");
    if (devuelta === 0) continue;
    const original = entrada.articulos?.[Number(input.dataset.index)];
    const cantidadOriginal = Number(original?.cantidad_entrada || 0);
    if (devuelta > cantidadOriginal) return notificar(`La devolución de ${original?.codigo_interno || original?.codigo_factura || "un artículo"} supera la entrada original.`, "error");
    partidas.push({ ...original, cantidad_ajuste: -Math.abs(devuelta) });
  }
  if (!partidas.length) return notificar("Captura al menos una devolución.", "error");
  const fechaMovimiento = String(document.getElementById("fechaAjusteEntrada")?.value || "").trim();
  const horaMovimiento = String(document.getElementById("horaAjusteEntrada")?.value || "").trim();
  const motivoCapturado = String(document.getElementById("motivoAjusteEntrada")?.value || "").trim();
  if (!fechaMovimiento) return notificar("La fecha del ajuste es obligatoria.", "error");
  if (!horaMovimiento) return notificar("La hora del ajuste es obligatoria.", "error");
  if (!motivoCapturado) return notificar("El motivo del ajuste es obligatorio.", "error");
  const fechaEntradaOriginal = String(entrada.fecha || entrada.fecha_factura || "").slice(0,10);
  if (fechaEntradaOriginal && fechaMovimiento < fechaEntradaOriginal) return notificar("La fecha del ajuste no puede ser anterior a la entrada original.", "error");

  const ok = await confirmarProvsoft({
    titulo: "Guardar ajuste a entrada",
    mensaje: `Se registrará una devolución ligada a ${entrada.folioEntrada || entrada.id}. La entrada original no se modificará.`,
    textoAceptar: "Guardar ajuste",
    peligro: false
  });
  if (!ok) return;

  mostrarCargando("Guardando ajuste a entrada...");
  try {
    const ajuste = await generarAjusteEntradaZapata(entrada, partidas, motivoCapturado, "GERARDO", fechaMovimiento, horaMovimiento);
    cerrarAjusteEntradaUI();
    notificar(`Ajuste guardado: ${ajuste.folioAjusteEntrada}`, "ok");
    if (callbackEntradaGenerada) await callbackEntradaGenerada(ajuste);
  } catch (error) {
    notificar(error.message || "No fue posible guardar el ajuste.", "error");
  } finally { ocultarCargando(); }
}

export async function iniciarModuloAjusteEntradaIndependiente(opciones = {}) {
  callbackEntradaGenerada = typeof opciones.onAjusteGenerado === "function" ? opciones.onAjusteGenerado : callbackEntradaGenerada;
  asegurarModalAjusteEntrada();
  const contenedor = document.getElementById("listaAjustesEntradaDisponibles");
  if (!contenedor) return;
  contenedor.innerHTML = '<p class="texto-ayuda">Cargando entradas disponibles...</p>';
  try {
    entradasCache = await cargarEntradasZapata(250);
    entradasCacheCargado = true;
    const filtro = String(document.getElementById("buscarAjusteEntrada")?.value || "").trim().toLowerCase();
    const filas = entradasCache.filter(e => {
      if (!filtro) return true;
      return [e.folioEntrada,e.razon_social_emisor,e.rfc_emisor,e.serie,e.folio,e.uuid_cfdi].join(" ").toLowerCase().includes(filtro);
    });
    contenedor.innerHTML = filas.length ? filas.map(e => `
      <article class="ajuste-entrada-card">
        <div><span class="entradas-section-kicker">ENTRADA ORIGINAL</span><h3>${escapeHtml(e.folioEntrada || e.id)}</h3>
        <p><b>${escapeHtml(e.razon_social_emisor || "Proveedor")}</b> · ${escapeHtml(e.rfc_emisor || "")}</p>
        <p>Factura: <b>${escapeHtml(e.serie || "")} ${escapeHtml(e.folio || "")}</b> · Fecha ${escapeHtml(e.fecha_factura || e.fecha || "")}</p>
        <small>UUID: ${escapeHtml(e.uuid_cfdi || e.id || "")}</small></div>
        <button type="button" class="entradas-btn-primary btnAbrirAjusteIndependiente" data-id="${escapeHtml(e.id)}">Crear ajuste / devolución</button>
      </article>`).join("") : '<p class="texto-ayuda">No se encontraron entradas para ajustar.</p>';
    contenedor.querySelectorAll(".btnAbrirAjusteIndependiente").forEach(btn => btn.addEventListener("click", () => abrirAjusteEntradaUI(btn.dataset.id)));
  } catch (error) {
    contenedor.innerHTML = `<p class="alerta">${escapeHtml(error.message || String(error))}</p>`;
  }
}

async function modificarEntradaUI(id) {
  const entrada = entradasCache.find(e => String(e.id) === String(id));
  if (!entrada) return notificar("No se encontró la entrada.", "error");

  const articulos = (entrada.articulos || []).map(a => ({ ...a }));
  for (let i = 0; i < articulos.length; i++) {
    const a = articulos[i];
    const actual = Number(a.cantidad_entrada || 0);
    const valor = prompt(`Cantidad de entrada\n${a.codigo_interno || a.codigo_factura || ""} - ${a.descripcion_interna || a.descripcion_factura || ""}`, String(actual));
    if (valor === null) return;
    const cantidad = Number(String(valor).replace(",", "."));
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      notificar("Cantidad inválida. No se hicieron cambios.", "error");
      return;
    }
    a.cantidad_entrada = cantidad;
    const operacion = String(a.operacion_conversion || "DIVIDIR").toUpperCase();
    if (Number(a.cantidad_factura || 0) !== 0) {
      a.factor_conversion = operacion === "MULTIPLICAR"
        ? cantidad / Number(a.cantidad_factura)
        : Number(a.cantidad_factura) / cantidad;
    }
  }

  const ok = await confirmarProvsoft({
    titulo: "Modificar entrada",
    mensaje: `¿Guardar las cantidades corregidas de ${entrada.folioEntrada || id}?`,
    textoAceptar: "Guardar cambios",
    peligro: false
  });
  if (!ok) return;

  mostrarCargando("Actualizando entrada...");
  try {
    await actualizarEntradaZapata(id, articulos, "GERARDO");
    entrada.articulos = articulos;
    entrada.modificado_en = new Date().toISOString();
    notificar("Entrada corregida correctamente.", "ok");
    await cargarEntradasUI();
    if (callbackEntradaGenerada) window.location.reload();
  } catch (error) {
    notificar(error.message, "error");
  } finally { ocultarCargando(); }
}

async function desguardarEntradaUI(id) {
  const entrada = entradasCache.find(e => String(e.id) === String(id));
  if (!entrada) return notificar("No se encontró la entrada.", "error");

  const ok = await confirmarProvsoft({
    titulo: "Desguardar entrada",
    mensaje: `¿Desguardar ${entrada.folioEntrada || id}? Se eliminará la entrada y la factura volverá a pendientes para revisarla y guardarla otra vez.`,
    textoAceptar: "Sí, desguardar",
    peligro: true
  });
  if (!ok) return;

  mostrarCargando("Desguardando entrada...");
  try {
    await desguardarEntradaZapata(id);
    entradasCache = entradasCache.filter(e => String(e.id) !== String(id));
    historialCache = historialCache.filter(e => String(e.uuid_cfdi || "").toUpperCase() !== String(id).toUpperCase());
    entradasCacheCargado = true;
    historialCacheCargado = false;
    notificar("Entrada desguardada. La factura volverá a pendientes.", "ok");
    await cargarFacturasUI(false);
    await cargarEntradasUI();
    if (callbackEntradaGenerada) window.location.reload();
  } catch (error) {
    notificar(error.message, "error");
  } finally { ocultarCargando(); }
}

async function cargarHistorialUI() {
  const contenedor = document.getElementById("listaHistorial");
  contenedor.innerHTML = "<p>Cargando historial...</p>";

  try {
    if (!historialCacheCargado) {
      historialCache = await cargarHistorialZapata(200);
      historialCacheCargado = true;
    }

    const historial = historialCache;

    contenedor.innerHTML = "";

    if (historial.length === 0) {
      contenedor.innerHTML = "<p>No hay historial registrado.</p>";
      return;
    }

    historial.forEach(item => {
      const div = document.createElement("div");
      div.className = "card";

      const esEntrada = item.estado_zapata === "ENTRADA_GENERADA";

      div.innerHTML = `
        <h3>${escapeHtml(item.razon_social_emisor || "Proveedor sin nombre")}</h3>
        <p>
          <span class="badge ${esEntrada ? "badge-ok" : "badge-no"}">
            ${esEntrada ? "ENTRÓ A ABARROTES" : "NO ENTRA A ABARROTES"}
          </span>
        </p>
        <p><b>RFC:</b> ${escapeHtml(item.rfc_emisor || "")}</p>
        <p><b>Factura:</b> ${escapeHtml(item.serie || "")} ${escapeHtml(item.folio || "")}</p>
        <p><b>Fecha factura:</b> ${escapeHtml(item.fecha_factura || "")}</p>
        <p><b>Total:</b> ${formatoPesos(item.total_factura)}</p>
        <p><b>UUID:</b> ${escapeHtml(item.uuid_cfdi || "")}</p>
        ${
          esEntrada
            ? `<p><b>Folio entrada:</b> ${escapeHtml(item.folioEntrada || "")}</p>
               <p><b>Artículos:</b> ${(item.articulos || []).length}</p>`
            : `<p><b>Motivo:</b> ${escapeHtml(item.motivo || "Sin motivo capturado")}</p>`
        }
        <p><b>Usuario:</b> ${escapeHtml(item.usuario || "")}</p>
        <p><b>Fecha decisión:</b> ${escapeHtml(formatearFechaHora(item.fecha_decision || ""))}</p>
      `;

      contenedor.appendChild(div);
    });
  } catch (error) {
    contenedor.innerHTML = `<p class="alerta">${escapeHtml(error.message)}</p>`;
    notificar(error.message, "error");
  }
}

function pintarProveedores() {
  const contenedor=document.getElementById("listaProveedores"); if (!contenedor) return;
  const termino=String(document.getElementById("buscarProveedor")?.value || "").trim().toLowerCase();
  const visibles=proveedores.filter(p => !termino || [p.rfc_emisor,p.razon_social_emisor,p.alias_pivot].some(v => String(v || "").toLowerCase().includes(termino)));
  const total=document.getElementById("totalProveedoresAutorizados"); if (total) total.textContent=String(proveedores.filter(p => p.activo !== false).length);
  if (!visibles.length) { contenedor.innerHTML=`<div class="provsoft-empty"><b>${proveedores.length ? "Sin coincidencias" : "No hay proveedores autorizados"}</b><span>${proveedores.length ? "Prueba con otro RFC, nombre o alias." : "Usa + Nuevo proveedor para registrar el primero."}</span></div>`; return; }
  contenedor.innerHTML=visibles.map(p => {
    const id=String(p.id || p.rfc_emisor || ""), nombre=p.razon_social_emisor || "Proveedor sin nombre", alias=p.alias_pivot || "—", activo=p.activo !== false, inicial=String(nombre).trim().charAt(0).toUpperCase() || "P";
    return `<article class="provsoft-provider-row"><div class="provsoft-provider-avatar">${escapeHtml(inicial)}</div><div class="provsoft-provider-main"><div class="provsoft-provider-title"><h3>${escapeHtml(nombre)}</h3><span class="provsoft-status ${activo ? "ok" : "off"}">${activo ? "AUTORIZADO" : "INACTIVO"}</span></div><div class="provsoft-provider-meta"><span><small>RFC</small><b>${escapeHtml(p.rfc_emisor || "—")}</b></span><span><small>ALIAS PIVOT</small><b>${escapeHtml(alias)}</b></span></div></div><button type="button" class="provsoft-edit-provider btnEditarProveedor" data-id="${escapeHtml(id)}">Editar</button></article>`;
  }).join("");
  contenedor.querySelectorAll(".btnEditarProveedor").forEach(btn => btn.addEventListener("click", () => { const id=String(btn.dataset.id || ""); const proveedor=proveedores.find(p => String(p.id || p.rfc_emisor || "") === id); if (proveedor) abrirModalProveedor(proveedor); }));
}

function timestampFactura(f) {
  const valor = String(f?.fecha || f?.fecha_factura || f?.fecha_emision || "").trim();
  if (!valor) return 0;
  const directo = Date.parse(valor);
  if (Number.isFinite(directo)) return directo;
  const m = valor.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0)).getTime();
  return 0;
}

function claveProveedorFactura(f) {
  return String(f?.rfc_emisor || f?.proveedor_rfc || f?.razon_social_emisor || "SIN_PROVEEDOR").trim().toUpperCase();
}

function textoFacturaPendiente(f) {
  return [f?.razon_social_emisor, f?.rfc_emisor, f?.serie, f?.folio, f?.uuid_cfdi, f?.id]
    .map(v => String(v || "").toLowerCase())
    .join(" ");
}

function obtenerGruposProveedoresPendientes() {
  const mapa = new Map();
  for (const f of facturasPendientes) {
    const clave = claveProveedorFactura(f);
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        clave,
        nombre: f.razon_social_emisor || "Proveedor sin nombre",
        rfc: f.rfc_emisor || "",
        facturas: [],
        fechaMasReciente: 0,
        total: 0
      });
    }
    const grupo = mapa.get(clave);
    grupo.facturas.push(f);
    grupo.fechaMasReciente = Math.max(grupo.fechaMasReciente, timestampFactura(f));
    grupo.total += Number(f.total || f.total_factura || 0);
  }
  return [...mapa.values()].sort((a, b) => b.fechaMasReciente - a.fechaMasReciente || a.nombre.localeCompare(b.nombre, "es"));
}

function pintarFacturas() {
  const contenedor = document.getElementById("listaFacturas");
  if (!contenedor) return;
  contenedor.className = "entradas-pendientes-shell";

  if (facturasPendientes.length === 0) {
    proveedorPendienteSeleccionado = null;
    contenedor.innerHTML = `
      <div class="pendientes-empty">
        <b>No hay facturas pendientes para ABARROTES PDD.</b>
        <span>Cuando llegue una factura de un proveedor autorizado, su tarjeta aparecerá automáticamente aquí.</span>
      </div>`;
    return;
  }

  const grupos = obtenerGruposProveedoresPendientes();
  if (proveedorPendienteSeleccionado && !grupos.some(g => g.clave === proveedorPendienteSeleccionado)) {
    proveedorPendienteSeleccionado = null;
  }

  if (!proveedorPendienteSeleccionado) {
    const termino = filtroFacturasPendientes.trim().toLowerCase();
    const visibles = grupos.filter(g => !termino || `${g.nombre} ${g.rfc}`.toLowerCase().includes(termino));
    contenedor.innerHTML = `
      <div class="pendientes-toolbar">
        <div>
          <span class="entradas-section-kicker">PROVEEDORES CON PENDIENTES</span>
          <h3>${grupos.length} proveedor${grupos.length === 1 ? "" : "es"} · ${facturasPendientes.length} factura${facturasPendientes.length === 1 ? "" : "s"}</h3>
        </div>
        <label class="pendientes-search"><span>⌕</span><input id="buscarPendienteProveedor" type="search" placeholder="Buscar proveedor o RFC..." value="${escapeHtml(filtroFacturasPendientes)}"></label>
      </div>
      <div class="pendientes-proveedores-grid">
        ${visibles.map(g => {
          const inicial = String(g.nombre).trim().charAt(0).toUpperCase() || "P";
          const fecha = g.facturas.slice().sort((a,b)=>timestampFactura(b)-timestampFactura(a))[0];
          return `<button type="button" class="pendiente-proveedor-card" data-proveedor="${escapeHtml(g.clave)}">
            <span class="pendiente-proveedor-icon">${escapeHtml(inicial)}</span>
            <span class="pendiente-proveedor-info">
              <b>${escapeHtml(g.nombre)}</b>
              <small>${escapeHtml(g.rfc || "RFC no disponible")}</small>
              <span>Última: ${escapeHtml(fecha?.fecha || fecha?.fecha_factura || fecha?.fecha_emision || "—")}</span>
            </span>
            <span class="pendiente-proveedor-count"><b>${g.facturas.length}</b><small>FACTURA${g.facturas.length === 1 ? "" : "S"}</small></span>
            <span class="pendiente-proveedor-arrow">›</span>
          </button>`;
        }).join("") || `<div class="pendientes-empty"><b>Sin coincidencias</b><span>Prueba con otro nombre o RFC.</span></div>`}
      </div>`;

    document.getElementById("buscarPendienteProveedor")?.addEventListener("input", ev => {
      filtroFacturasPendientes = ev.target.value || "";
      pintarFacturas();
      requestAnimationFrame(() => {
        const input = document.getElementById("buscarPendienteProveedor");
        input?.focus();
        if (input) input.setSelectionRange(input.value.length, input.value.length);
      });
    });
    contenedor.querySelectorAll(".pendiente-proveedor-card").forEach(btn => btn.addEventListener("click", () => {
      proveedorPendienteSeleccionado = btn.dataset.proveedor || null;
      filtroFacturasPendientes = "";
      pintarFacturas();
    }));
    return;
  }

  const grupo = grupos.find(g => g.clave === proveedorPendienteSeleccionado);
  if (!grupo) { proveedorPendienteSeleccionado = null; pintarFacturas(); return; }
  const termino = filtroFacturasPendientes.trim().toLowerCase();
  const facturasOrdenadas = grupo.facturas.slice().sort((a,b) => timestampFactura(b) - timestampFactura(a));
  const visibles = facturasOrdenadas.filter(f => !termino || textoFacturaPendiente(f).includes(termino));

  contenedor.innerHTML = `
    <div class="pendientes-proveedor-head">
      <button type="button" id="btnVolverProveedoresPendientes" class="entradas-btn-secondary">← Proveedores</button>
      <div class="pendientes-proveedor-titulo">
        <span class="entradas-section-kicker">FACTURAS DEL PROVEEDOR</span>
        <h3>${escapeHtml(grupo.nombre)}</h3>
        <p>${escapeHtml(grupo.rfc || "")} · ${grupo.facturas.length} pendiente${grupo.facturas.length === 1 ? "" : "s"}</p>
      </div>
      <label class="pendientes-search pendientes-search-facturas"><span>⌕</span><input id="buscarPendienteFactura" type="search" placeholder="Factura, UUID..." value="${escapeHtml(filtroFacturasPendientes)}"></label>
    </div>
    <div class="entradas-facturas-grid pendientes-facturas-grid"></div>`;

  const grid = contenedor.querySelector(".pendientes-facturas-grid");
  visibles.forEach(f => {
    const indexReal = facturasPendientes.indexOf(f);
    const div = document.createElement("div");
    div.className = "card factura-pendiente-card";
    const preparados = prepararArticulosEntrada(f, equivalencias);
    const totalConceptos = preparados.length || (f.conceptos_detalle || []).length;
    const enlazados = preparados.filter(a => a.equivalencia_encontrada).length;
    const avance = totalConceptos ? Math.round((enlazados / totalConceptos) * 100) : 0;
    const completa = totalConceptos > 0 && enlazados === totalConceptos;
    div.innerHTML = `
      <div class="factura-pendiente-head">
        <div><h3>${escapeHtml(f.serie || "")} ${escapeHtml(f.folio || "Sin folio")}</h3><span class="badge badge-pendiente">PENDIENTE</span></div>
        <div class="factura-avance ${completa ? "completo" : ""}"><small>AVANCE ENLACE</small><b>${avance}%</b><span>${enlazados} de ${totalConceptos}</span></div>
      </div>
      <div class="factura-avance-bar"><span style="width:${avance}%"></span></div>
      <p><b>Fecha:</b> ${escapeHtml(f.fecha || f.fecha_factura || f.fecha_emision || "")}</p>
      <p><b>Total:</b> ${formatoPesos(f.total)}</p>
      <p><b>UUID:</b> ${escapeHtml(f.uuid_cfdi || f.id || "")}</p>
      <p><b>Conceptos:</b> ${totalConceptos}</p>
      <div class="acciones-card"><button data-index="${indexReal}" class="btnAutorizar">${completa ? "Revisar y autorizar" : "Revisar / autorizar"}</button></div>`;
    grid.appendChild(div);
  });
  if (!visibles.length) grid.innerHTML = `<div class="pendientes-empty"><b>Sin facturas coincidentes</b><span>Prueba con otro folio o UUID.</span></div>`;

  document.getElementById("btnVolverProveedoresPendientes")?.addEventListener("click", () => {
    proveedorPendienteSeleccionado = null;
    filtroFacturasPendientes = "";
    pintarFacturas();
  });
  document.getElementById("buscarPendienteFactura")?.addEventListener("input", ev => {
    filtroFacturasPendientes = ev.target.value || "";
    pintarFacturas();
    requestAnimationFrame(() => {
      const input = document.getElementById("buscarPendienteFactura");
      input?.focus();
      if (input) input.setSelectionRange(input.value.length, input.value.length);
    });
  });
  contenedor.querySelectorAll(".btnAutorizar").forEach(btn => btn.addEventListener("click", () => abrirFactura(Number(btn.dataset.index))));
}

async function abrirFactura(index) {
  facturaSeleccionada = facturasPendientes[index];
  recalcularArticulosPreparados();

  // El factor operativo se toma SIEMPRE de cantidadPorCaja del catálogo.
  // No se modifica /productos: solo se usa para preparar esta entrada.
  await aplicarFactoresCatalogoArticulos();

  asegurarPantallaRevisionFactura();
  renderDetalleFactura();
  mostrarPantallaRevisionFactura();
}

function recalcularArticulosPreparados() {
  articulosPreparados = prepararArticulosEntrada(
    facturaSeleccionada,
    equivalencias
  );
}

async function aplicarFactoresCatalogoArticulos() {
  if (!Array.isArray(articulosPreparados) || !articulosPreparados.length) return;

  try {
    await asegurarProductosActivos();
  } catch (error) {
    console.warn("No se pudo cargar el catálogo para cantidadPorCaja.", error);
    return;
  }

  const porCodigo = new Map();
  for (const p of productosActivos || []) {
    const codigo = String(p.codigoBarra || p.id || "").trim();
    if (codigo) porCodigo.set(codigo, p);
  }

  for (const articulo of articulosPreparados) {
    const codigo = String(articulo.codigo_interno || "").trim();
    if (!codigo) continue;

    const producto = porCodigo.get(codigo);
    if (!producto) continue;

    const cantidadPorCaja = Number(producto.cantidadPorCaja);
    const factorCatalogo = Number.isFinite(cantidadPorCaja) && cantidadPorCaja > 0
      ? cantidadPorCaja
      : 1;

    // Si ya existe un enlace, SU factor y SU operación son la regla maestra.
    // cantidadPorCaja del catálogo solamente sirve como sugerencia al crear/editar el enlace.
    const factorEnlace = Number(articulo.factor_conversion);
    const factor = articulo.equivalencia_encontrada && Number.isFinite(factorEnlace) && factorEnlace > 0
      ? factorEnlace
      : factorCatalogo;
    const operacion = String(articulo.operacion_conversion || "DIVIDIR").toUpperCase();
    articulo.factor_conversion = factor;
    articulo.operacion_conversion = operacion;
    articulo.cantidad_entrada = operacion === "MULTIPLICAR"
      ? Number(articulo.cantidad_factura || 0) * factor
      : Number(articulo.cantidad_factura || 0) / factor;
    articulo.factor_origen = articulo.equivalencia_encontrada
      ? "ENLACE_GUARDADO"
      : "CATALOGO_CANTIDAD_POR_CAJA";
  }
}

function renderDetalleFactura() {
  if (!facturaSeleccionada) return;

  document.getElementById("motivoNoEntra") && (document.getElementById("motivoNoEntra").value = "");
  document.getElementById("motivoNoEntraPantalla") && (document.getElementById("motivoNoEntraPantalla").value = "");

  const detalle = document.getElementById("detalleFacturaPantalla") || document.getElementById("detalleFactura");
  if (!detalle) return;

  const totalPartidas = articulosPreparados.length;
  const enlazadas = articulosPreparados.filter(a => a.equivalencia_encontrada).length;
  const pendientes = Math.max(0, totalPartidas - enlazadas);
  const avance = totalPartidas ? Math.round((enlazadas / totalPartidas) * 100) : 0;
  const totalFactura = Number(facturaSeleccionada.total || 0);

  const tarjetas = articulosPreparados.map((a, index) => {
    const enlazada = Boolean(a.equivalencia_encontrada);
    const factor = Number(a.factor_conversion || 1);
    const operacion = String(a.operacion_conversion || "DIVIDIR").toUpperCase();
    const simboloOperacion = operacion === "MULTIPLICAR" ? "×" : "÷";
    const etiquetaFactor = operacion === "MULTIPLICAR" ? "FACTOR MULTIPLICADOR" : "FACTOR DIVISOR";
    const cantidadFactura = Number(a.cantidad_factura || 0);
    const cantidadEntrada = Number(a.cantidad_entrada || 0);
    return `
      <article class="revision-partida ${enlazada ? "enlazada" : "pendiente"}">
        <div class="revision-partida-top">
          <div class="revision-partida-identidad">
            <span class="revision-partida-num">${String(index + 1).padStart(2, "0")}</span>
            <div>
              <span class="revision-codigo-factura">CÓDIGO FACTURA · ${escapeHtml(a.codigo_factura || "SIN CÓDIGO")}</span>
              <h3>${escapeHtml(a.descripcion_factura || "Concepto sin descripción")}</h3>
            </div>
          </div>
          <div class="revision-cantidad-factura"><small>CANTIDAD FACTURA</small><b>${numeroCorto(cantidadFactura)}</b></div>
        </div>

        <div class="revision-partida-body">
          ${enlazada ? `
            <div class="revision-producto-interno">
              <span class="revision-label">PRODUCTO INTERNO</span>
              <b>${escapeHtml(a.codigo_interno || "")}</b>
              <strong>${escapeHtml(a.descripcion_interna || "")}</strong>
            </div>
            <div class="revision-calculo">
              <div><small>CANTIDAD FACTURA</small><b>${numeroCorto(cantidadFactura)}</b></div>
              <span class="revision-multiplica">${simboloOperacion}</span>
              <div><small>${etiquetaFactor}</small><b>${numeroCorto(factor)}</b></div>
              <span class="revision-igual">=</span>
              <div class="revision-resultado"><small>ENTRADA</small><b>${numeroCorto(cantidadEntrada)}</b><em>unidades inventario</em></div>
            </div>
          ` : `
            <div class="revision-sin-enlace-copy">
              <span class="revision-label">PRODUCTO INTERNO</span>
              <b>Sin enlace de catálogo</b>
              <span>Selecciona el SKU correcto para poder generar la entrada.</span>
            </div>
          `}
        </div>

        <div class="revision-partida-actions">
          <span class="revision-status ${enlazada ? "ok" : "wait"}">${enlazada ? "✓ ENLAZADO" : "PENDIENTE DE ENLACE"}</span>
          <button class="btnBuscarProducto revision-btn-enlace" data-index="${index}" type="button">${enlazada ? "Editar enlace" : "Buscar y enlazar producto"}</button>
        </div>
      </article>`;
  }).join("");

  detalle.innerHTML = `
    <section class="revision-resumen-pro">
      <div class="revision-factura-identidad">
        <span class="entradas-section-kicker">FACTURA EN REVISIÓN</span>
        <h3>${escapeHtml(facturaSeleccionada.razon_social_emisor || "Proveedor sin nombre")}</h3>
        <div class="revision-factura-meta">
          <span><b>Factura</b>${escapeHtml(`${facturaSeleccionada.serie || ""} ${facturaSeleccionada.folio || ""}`.trim() || "—")}</span>
          <span><b>Fecha</b>${escapeHtml(facturaSeleccionada.fecha || facturaSeleccionada.fecha_factura || facturaSeleccionada.fecha_emision || "—")}</span>
          <span class="uuid"><b>UUID</b>${escapeHtml(facturaSeleccionada.uuid_cfdi || facturaSeleccionada.id || "—")}</span>
        </div>
      </div>
      <div class="revision-kpis">
        <div><small>PARTIDAS</small><b>${totalPartidas}</b></div>
        <div class="ok"><small>ENLAZADAS</small><b>${enlazadas}</b></div>
        <div class="warn"><small>PENDIENTES</small><b>${pendientes}</b></div>
        <div><small>TOTAL FACTURA</small><b>${formatoPesos(totalFactura)}</b></div>
      </div>
      <div class="revision-progress"><span style="width:${avance}%"></span></div>
    </section>

    <section class="revision-partidas-grid">${tarjetas}</section>
  `;

  detalle.querySelectorAll(".btnBuscarProducto").forEach(btn => {
    btn.addEventListener("click", async () => {
      const index = Number(btn.dataset.index);
      await abrirModalProducto(index);
    });
  });

  const btnGenerar = document.getElementById("btnGenerarRevision");
  if (btnGenerar) {
    btnGenerar.disabled = pendientes > 0;
    btnGenerar.title = pendientes > 0 ? `Faltan ${pendientes} partida(s) por enlazar` : "Generar entrada";
  }
  const progreso = document.getElementById("revisionFooterProgreso");
  if (progreso) progreso.textContent = `${enlazadas} de ${totalPartidas} partidas enlazadas`;
}

async function abrirModalProducto(index) {
  indiceArticuloEnlace = index;
  productoSeleccionado = null;

  const articulo = articulosPreparados[index];

  if (!articulo) {
    notificar("No se encontró el concepto de factura", "error");
    return;
  }

  document.getElementById("listaProductos").classList.remove("oculto");
  document.getElementById("productoSeleccionadoBox").classList.add("oculto");
  const btnGuardarEnlace = document.getElementById("btnGuardarProductoEnlace");
  if (btnGuardarEnlace) btnGuardarEnlace.disabled = true;
  document.getElementById("conversionBox").classList.add("oculto");
  document.getElementById("buscarProductoTexto").value = "";

  document.getElementById("productoConceptoActual").innerHTML = `
    <div class="producto-concepto-titulo">Concepto de la factura</div>
    <div class="producto-concepto-nombre">${escapeHtml(articulo.descripcion_factura)}</div>
    <div class="producto-concepto-meta">
      <span><b>Código:</b> ${escapeHtml(articulo.codigo_factura || "Sin código")}</span>
      <span><b>Cantidad factura:</b> ${numeroCorto(articulo.cantidad_factura)}</span>
    </div>
  `;

  document.getElementById("listaProductos").innerHTML = "<p>Cargando catálogo de la tabla...</p>";
  document.getElementById("modalProducto").classList.remove("oculto");

  try {
    catalogoTabla = obtenerCatalogoTabla ? (obtenerCatalogoTabla() || []) : [];

    // Cargamos el catálogo general desde IndexedDB (Firebase sólo se sincroniza
    // una vez en segundo plano por sesión) y mezclamos AMBAS fuentes antes de ordenar.
    await asegurarProductosActivos();

    // Al abrir el modal usamos automáticamente el concepto de la factura como búsqueda
    // inicial. Así las mejores coincidencias aparecen arriba sin obligar a bajar hasta
    // el bloque del catálogo general.
    const textoInicial = String(articulo.descripcion_factura || articulo.codigo_factura || "").trim();
    const mejores = obtenerMejoresCoincidenciasCombinadas(textoInicial);
    pintarProductosUnificados(mejores, textoInicial);

    setTimeout(() => {
      document.getElementById("buscarProductoTexto").focus();
    }, 100);
  } catch (error) {
    document.getElementById("listaProductos").innerHTML = `<p class="alerta">${escapeHtml(error.message)}</p>`;
  }
}

async function asegurarProductosActivos() {
  if (productosActivosCargados) return;

  // Una fotografía completa de activo == true por día y dispositivo.
  productosActivos = await sincronizarProductosActivosLocalDiario();
  productosActivosCargados = true;
}

async function buscarProductoUI() {
  const texto = document.getElementById("buscarProductoTexto").value;
  const contenedor = document.getElementById("listaProductos");
  contenedor.innerHTML = "<p>Buscando mejores coincidencias...</p>";

  try {
    await asegurarProductosActivos();
    let mejores = obtenerMejoresCoincidenciasCombinadas(texto);
    if (!mejores.length && String(texto || "").trim()) {
      const nuevos = await buscarProductoActivoFirebaseYGuardarLocal(texto);
      if (nuevos.length) {
        const mapa = new Map((productosActivos || []).map(p => [claveProductoEnlace(p), p]));
        nuevos.forEach(p => mapa.set(claveProductoEnlace(p), p));
        productosActivos = Array.from(mapa.values());
        mejores = obtenerMejoresCoincidenciasCombinadas(texto);
      }
    }
    pintarProductosUnificados(mejores, texto);
  } catch (error) {
    // Si por alguna razón falla el catálogo general, seguimos permitiendo trabajar
    // con el catálogo construido por la tabla.
    const propios = filtrarProductosCatalogo(catalogoTabla, texto)
      .map(p => ({ ...p, __origenEnlace: "tabla" }));
    if (propios.length) {
      pintarProductosUnificados(propios, texto);
      const alerta = document.createElement("p");
      alerta.className = "alerta";
      alerta.textContent = error.message || "No se pudo consultar el catálogo general";
      contenedor.appendChild(alerta);
    } else {
      contenedor.innerHTML = `<p class="alerta">${escapeHtml(error.message || "No se pudo consultar el catálogo general")}</p>`;
    }
  }
}

function claveProductoEnlace(p) {
  return String(p?.codigoBarra || p?.id || "").trim().toUpperCase();
}

function obtenerMejoresCoincidenciasCombinadas(texto = "") {
  const mapa = new Map();

  // Primero agregamos el catálogo general completo. No hay lectura a Firebase aquí:
  // productosActivos ya está en memoria/IndexedDB gracias a asegurarProductosActivos().
  (productosActivos || []).forEach(p => {
    const clave = claveProductoEnlace(p);
    if (!clave) return;
    mapa.set(clave, { ...p, __origenEnlace: "general" });
  });

  // Después fusionamos lo ya visto en la tabla. Si el SKU existe en ambas fuentes,
  // conservamos los datos más completos del general y lo marcamos como "ambos".
  (catalogoTabla || []).forEach(p => {
    const clave = claveProductoEnlace(p);
    if (!clave) return;
    const existente = mapa.get(clave);
    if (existente) {
      mapa.set(clave, { ...p, ...existente, __origenEnlace: "ambos" });
    } else {
      mapa.set(clave, { ...p, __origenEnlace: "tabla" });
    }
  });

  // El mismo algoritmo de relevancia se ejecuta UNA sola vez sobre el catálogo
  // unificado. Por eso un resultado del catálogo general puede quedar primero si
  // coincide mejor que los productos ya presentes en la tabla.
  return filtrarProductosCatalogo(Array.from(mapa.values()), texto);
}

function pintarProductosUnificados(productos = [], texto = "") {
  const contenedor = document.getElementById("listaProductos");
  contenedor.innerHTML = "";

  if (!productos.length) {
    contenedor.innerHTML = "<p>No se encontraron productos activos.</p>";
    return;
  }

  const aviso = document.createElement("div");
  aviso.className = "origen-catalogo-enlace origen-catalogo-unificado";
  aviso.innerHTML = `<b>Mejores coincidencias</b> · Tabla + catálogo general${texto ? ` · ${productos.length} resultado(s)` : ""}`;
  contenedor.appendChild(aviso);

  productos.forEach((p, indice) => {
    const div = document.createElement("div");
    div.className = "producto-item producto-item-unificado";

    const origen = p.__origenEnlace === "ambos"
      ? "Tabla + general"
      : p.__origenEnlace === "tabla"
        ? "Tabla"
        : "Catálogo general";

    div.innerHTML = `
      <div class="producto-item-info">
        <div class="producto-rank-linea">
          <span class="producto-rank">#${indice + 1}</span>
          <span class="producto-origen-badge">${escapeHtml(origen)}</span>
        </div>
        <b>${escapeHtml(p.codigoBarra || p.id || "")}</b><br>
        <span>${escapeHtml(p.concepto || "")}</span><br>
        <small>
          ${escapeHtml(p.marca || "")}
          ${p.departamento ? " · " + escapeHtml(p.departamento) : ""}
        </small>
      </div>
      <button class="btn-mini btnSeleccionarProducto">
        Seleccionar
      </button>
    `;

    div.querySelector(".btnSeleccionarProducto")
      .addEventListener("click", () => seleccionarProducto(p));
    contenedor.appendChild(div);
  });
}

function pintarProductos(productos, origen = "general") {
  const contenedor = document.getElementById("listaProductos");
  contenedor.innerHTML = "";

  if (productos.length === 0) {
    contenedor.innerHTML = "<p>No se encontraron productos activos.</p>";
    return;
  }

  pintarGrupoProductos(contenedor, productos, origen);
}

function pintarGrupoProductos(contenedor, productos, origen = "general") {
  if (!productos.length) return;

  const aviso = document.createElement("div");
  aviso.className = "origen-catalogo-enlace";
  aviso.textContent = origen === "tabla"
    ? "Primera opción · Catálogo construido por la tabla"
    : "Segunda opción · Catálogo general";
  contenedor.appendChild(aviso);

  productos.forEach((p) => {
    const div = document.createElement("div");
    div.className = "producto-item";

    div.innerHTML = `
      <div>
        <b>${escapeHtml(p.codigoBarra || p.id || "")}</b><br>
        <span>${escapeHtml(p.concepto || "")}</span><br>
        <small>
          ${escapeHtml(p.marca || "")}
          ${p.departamento ? " · " + escapeHtml(p.departamento) : ""}
        </small>
      </div>
      <button class="btn-mini btnSeleccionarProducto">
        Seleccionar
      </button>
    `;

    const btn = div.querySelector(".btnSeleccionarProducto");
    btn.addEventListener("click", () => seleccionarProducto(p));
    contenedor.appendChild(div);
  });
}

async function seleccionarProducto(producto) {
  productoSeleccionado = producto;

  document.getElementById("listaProductos").innerHTML = "";
  document.getElementById("listaProductos").classList.add("oculto");
  document.getElementById("buscarProductoTexto").value = "";

  const articulo = articulosPreparados[indiceArticuloEnlace];
  const cantidadFactura = Number(articulo?.cantidad_factura || 0);

  // Aunque el producto venga primero del catálogo construido por la tabla,
  // buscamos su registro en el catálogo general para tomar cantidadPorCaja.
  let productoCatalogo = producto;
  const codigoSeleccionado = String(producto.codigoBarra || producto.id || "").trim();

  try {
    await asegurarProductosActivos();
    const encontrado = (productosActivos || []).find(p =>
      String(p.codigoBarra || p.id || "").trim() === codigoSeleccionado
    );
    if (encontrado) productoCatalogo = encontrado;
  } catch (error) {
    console.warn("No se pudo consultar cantidadPorCaja; se usará 1.", error);
  }

  const cantidadPorCaja = Number(productoCatalogo?.cantidadPorCaja);
  const factor = Number.isFinite(cantidadPorCaja) && cantidadPorCaja > 0
    ? cantidadPorCaja
    : 1;

  // Si es un enlace ya existente respetamos su operación; para un enlace nuevo
  // se obliga al usuario a elegir DIVIDIR o MULTIPLICAR.
  const operacionExistente = articulo?.equivalencia_encontrada
    ? String(articulo.operacion_conversion || "DIVIDIR").toUpperCase()
    : "";
  const cantidadEntrada = operacionExistente === "MULTIPLICAR"
    ? cantidadFactura * factor
    : operacionExistente === "DIVIDIR"
      ? cantidadFactura / factor
      : cantidadFactura;

  // Solo memoria de esta revisión. No se escribe al catálogo.
  if (articulo) {
    articulo.factor_conversion = factor;
    articulo.operacion_conversion = operacionExistente;
    articulo.cantidad_entrada = cantidadEntrada;
    articulo.factor_origen = "CATALOGO_CANTIDAD_POR_CAJA";
  }

  document.getElementById("selCodigoProducto").textContent =
    producto.codigoBarra || producto.id || "";

  document.getElementById("selDescripcionProducto").textContent =
    producto.concepto || "";

  document.getElementById("cantidadEntradaProducto").value =
    numeroInput(cantidadEntrada || cantidadFactura || 0);

  document.getElementById("factorConversionProducto").value =
    numeroInput(factor || 1);

  const selectorOperacion = document.getElementById("operacionConversionProducto");
  selectorOperacion.value = operacionExistente;
  document.getElementById("conversionBox").classList.remove("oculto");
  actualizarAyudaConversion();

  document.getElementById("productoSeleccionadoBox").classList.remove("oculto");
  const btnGuardarEnlace = document.getElementById("btnGuardarProductoEnlace");
  if (btnGuardarEnlace) btnGuardarEnlace.disabled = !operacionExistente;

  setTimeout(() => {
    document.getElementById("btnGuardarProductoEnlace").focus();
  }, 50);
}

function toggleConversion() {
  document.getElementById("conversionBox").classList.toggle("oculto");
}

function obtenerOperacionConversionUI() {
  return String(document.getElementById("operacionConversionProducto")?.value || "").toUpperCase();
}

function calcularCantidadEntrada(cantidadFactura, factor, operacion) {
  if (!(factor > 0)) return 0;
  if (operacion === "MULTIPLICAR") return cantidadFactura * factor;
  if (operacion === "DIVIDIR") return cantidadFactura / factor;
  return cantidadFactura;
}

function actualizarAyudaConversion() {
  const operacion = obtenerOperacionConversionUI();
  const ayuda = document.getElementById("ayudaConversionProducto");
  const btnGuardar = document.getElementById("btnGuardarProductoEnlace");
  if (ayuda) {
    ayuda.textContent = operacion === "MULTIPLICAR"
      ? "Cantidad entrada = cantidad facturada × factor."
      : operacion === "DIVIDIR"
        ? "Cantidad entrada = cantidad facturada ÷ factor."
        : "Selecciona si la cantidad facturada se divide o se multiplica por el factor.";
  }
  if (btnGuardar && productoSeleccionado) btnGuardar.disabled = !operacion;
}

function sincronizarCantidadDesdeFactor() {
  const articulo = articulosPreparados[indiceArticuloEnlace];
  if (!articulo) return;

  const cantidadFactura = Number(articulo.cantidad_factura || 0);
  const factor = Number(document.getElementById("factorConversionProducto").value || 1);
  const operacion = obtenerOperacionConversionUI();

  document.getElementById("cantidadEntradaProducto").value =
    numeroInput(calcularCantidadEntrada(cantidadFactura, factor, operacion));
  actualizarAyudaConversion();
}

function sincronizarFactorDesdeCantidad() {
  const articulo = articulosPreparados[indiceArticuloEnlace];
  if (!articulo) return;

  const cantidadFactura = Number(articulo.cantidad_factura || 0);
  const cantidadEntrada = Number(document.getElementById("cantidadEntradaProducto").value || 0);
  const operacion = obtenerOperacionConversionUI();

  if (cantidadFactura > 0 && cantidadEntrada > 0 && operacion) {
    document.getElementById("factorConversionProducto").value = numeroInput(
      operacion === "MULTIPLICAR"
        ? cantidadEntrada / cantidadFactura
        : cantidadFactura / cantidadEntrada
    );
  }
  actualizarAyudaConversion();
}

async function guardarEnlaceProductoSeleccionado() {
  const articulo = articulosPreparados[indiceArticuloEnlace];

  if (!articulo) {
    notificar("No hay concepto seleccionado", "error");
    return;
  }

  if (!productoSeleccionado) {
    notificar("Selecciona un producto del catálogo", "error");
    return;
  }

  const codigoInterno = String(productoSeleccionado.codigoBarra || productoSeleccionado.id || "").trim();
  const descripcionInterna = String(productoSeleccionado.concepto || "").trim();
  const cantidadFactura = Number(articulo.cantidad_factura || 0);
  const cantidadEntrada = Number(document.getElementById("cantidadEntradaProducto").value || 0);
  const operacionConversion = obtenerOperacionConversionUI();
  const factorConversion = Number(document.getElementById("factorConversionProducto").value || 1);

  if (!codigoInterno || !descripcionInterna) {
    notificar("El producto seleccionado no tiene código o descripción", "error");
    return;
  }

  if (!operacionConversion) {
    notificar("Selecciona si la conversión DIVIDE o MULTIPLICA", "error");
    document.getElementById("operacionConversionProducto")?.focus();
    return;
  }

  if (!Number.isFinite(factorConversion) || factorConversion <= 0) {
    notificar("El factor de conversión debe ser mayor a cero", "error");
    return;
  }

  if (!cantidadEntrada || cantidadEntrada <= 0) {
    notificar("La cantidad de entrada debe ser mayor a cero", "error");
    return;
  }

  mostrarCargando("Guardando enlace del producto...");

  try {
    await guardarEquivalencia({
      texto_factura: `${articulo.codigo_factura || ""} ${articulo.descripcion_factura || ""}`.trim(),
      codigo_interno: codigoInterno,
      descripcion_interna: descripcionInterna,
      unidad_factura: articulo.unidad_factura || "",
      unidad_inventario: productoSeleccionado.unidadMedidaSat || "",
      factor_conversion: factorConversion,
      operacion_conversion: operacionConversion
    });

    equivalencias = await cargarEquivalencias();

    // Reconstruimos enlaces y precargamos cantidadPorCaja desde catálogo.
    recalcularArticulosPreparados();
    await aplicarFactoresCatalogoArticulos();

    // Si el usuario cambió el factor/cantidad en este modal, ese valor es
    // temporal y pertenece únicamente a ESTA entrada. No modifica /productos
    // ni cantidadPorCaja del catálogo.
    const articuloTemporal = articulosPreparados[indiceArticuloEnlace];
    if (articuloTemporal) {
      articuloTemporal.factor_conversion = factorConversion;
      articuloTemporal.operacion_conversion = operacionConversion;
      articuloTemporal.cantidad_entrada = cantidadEntrada;
      articuloTemporal.factor_origen = "TEMPORAL_ENTRADA";
    }

    renderDetalleFactura();
    cerrarModalProducto();

    notificar("Producto enlazado a la factura", "ok");
  } catch (error) {
    notificar(error.message || "Error al guardar enlace", "error");
  } finally {
    ocultarCargando();
  }
}

function cerrarModalProducto() {
  document.getElementById("modalProducto")?.classList.add("oculto");
  productoSeleccionado = null;
  indiceArticuloEnlace = null;

  const btnGuardarEnlace = document.getElementById("btnGuardarProductoEnlace");
  if (btnGuardarEnlace) btnGuardarEnlace.disabled = true;

  const productoBox = document.getElementById("productoSeleccionadoBox");
  productoBox?.classList.add("oculto");

  const lista = document.getElementById("listaProductos");
  lista?.classList.remove("oculto");
}

function cerrarModal() {
  document.getElementById("modalFactura")?.classList.add("oculto");
  document.getElementById("pantallaRevisionFactura")?.classList.add("oculto");
  document.getElementById("vistaFacturas")?.classList.add("activa");
}

async function generarEntradaUI() {
  if (!facturaSeleccionada) {
    notificar("No hay factura seleccionada", "error");
    return;
  }

  const faltantes = articulosPreparados.filter(a => !a.equivalencia_encontrada);

  if (faltantes.length > 0) {
    notificar("Hay conceptos sin enlace. Primero usa Buscar producto dentro de esta factura.", "error");
    return;
  }

  const ok = await confirmarProvsoft({
    titulo: "Generar entrada de Abarrotes",
    mensaje: "¿Generar esta entrada de Abarrotes con la factura seleccionada? La factura saldrá de pendientes y la tabla se actualizará.",
    textoAceptar: "Generar entrada",
    peligro: false
  });

  if (!ok) return;

  mostrarCargando("Generando entrada de Abarrotes...");

  try {
    const entrada = await generarEntradaZapata(
      facturaSeleccionada,
      articulosPreparados,
      "GERARDO"
    );

    const facturaBase = facturaSeleccionada;
    quitarFacturaPendienteLocal(facturaBase);

    entradasCache.unshift({
      id: entrada.uuid_cfdi || entrada.folioEntrada,
      ...entrada
    });
    entradasCacheCargado = true;

    historialCache.unshift({
      tipo_historial: "ENTRADA_GENERADA",
      estado_zapata: "ENTRADA_GENERADA",
      uuid_cfdi: entrada.uuid_cfdi || "",
      rfc_emisor: entrada.rfc_emisor || "",
      razon_social_emisor: entrada.razon_social_emisor || "",
      serie: entrada.serie || "",
      folio: entrada.folio || "",
      fecha_factura: entrada.fecha_factura || "",
      total_factura: Number(entrada.total_factura || 0),
      fecha_decision: entrada.creado_en || entrada.fecha || "",
      usuario: entrada.usuario || "",
      motivo: "",
      folioEntrada: entrada.folioEntrada || "",
      articulos: entrada.articulos || []
    });
    historialCacheCargado = true;

    cerrarModal();
    pintarFacturas();
    pintarEntradasDesdeCacheSiVisible();
    pintarHistorialDesdeCacheSiVisible();

    notificar(`Entrada generada: ${entrada.folioEntrada}`, "ok");

    if (callbackEntradaGenerada) {
      await callbackEntradaGenerada(entrada);
    }

  } catch (error) {
    notificar(error.message, "error");
  } finally {
    ocultarCargando();
  }
}

async function marcarNoEntraUI() {
  if (!facturaSeleccionada) {
    notificar("No hay factura seleccionada", "error");
    return;
  }

  const motivo = (document.getElementById("motivoNoEntraPantalla")?.value || document.getElementById("motivoNoEntra")?.value || "").trim();

  const ok = await confirmarProvsoft({
    titulo: "Factura no entra a Abarrotes",
    mensaje: "¿Marcar esta factura como NO ENTRA A ABARROTES? Ya no aparecerá en pendientes, pero quedará en historial.",
    textoAceptar: "Marcar no entra",
    peligro: true
  });

  if (!ok) return;

  mostrarCargando("Marcando factura como no entra a Abarrotes...");

  try {
    const decision = await marcarFacturaNoEntraZapata(
      facturaSeleccionada,
      motivo,
      "GERARDO"
    );

    quitarFacturaPendienteLocal(facturaSeleccionada);

    historialCache.unshift({
      tipo_historial: "NO_ENTRA_ZAPATA",
      estado_zapata: "NO_ENTRA_ZAPATA",
      uuid_cfdi: decision.uuid_cfdi || decision.id || "",
      rfc_emisor: decision.rfc_emisor || "",
      razon_social_emisor: decision.razon_social_emisor || "",
      serie: decision.serie || "",
      folio: decision.folio || "",
      fecha_factura: decision.fecha_factura || "",
      total_factura: Number(decision.total_factura || 0),
      fecha_decision: decision.fecha_decision || decision.creado_en || "",
      usuario: decision.usuario || "",
      motivo: decision.motivo || "",
      folioEntrada: "",
      articulos: []
    });
    historialCacheCargado = true;

    cerrarModal();
    pintarFacturas();
    pintarHistorialDesdeCacheSiVisible();

    notificar("Factura marcada como no entra a Abarrotes", "ok");

  } catch (error) {
    notificar(error.message, "error");
  } finally {
    ocultarCargando();
  }
}



function asegurarPantallaRevisionFactura() {
  if (document.getElementById("pantallaRevisionFactura")) return;

  const vistaFacturas = document.getElementById("vistaFacturas");
  if (!vistaFacturas?.parentElement) return;

  const pantalla = document.createElement("div");
  pantalla.id = "pantallaRevisionFactura";
  pantalla.className = "vista pantalla-revision-factura oculto";
  pantalla.innerHTML = `
    <div class="revision-head">
      <div>
        <span class="revision-head-kicker">PROVSOFT 2026 · REVISIÓN DE ENTRADA</span>
        <h2 id="tituloRevisionFactura">Revisar y autorizar entrada</h2>
        <p class="texto-ayuda">Enlaza cada partida y valida su conversión antes de generar el movimiento.</p>
      </div>
      <div class="revision-head-actions">
        <button id="btnCerrarRevisionFactura" type="button">← Pendientes</button>
      </div>
    </div>

    <div id="detalleFacturaPantalla" class="revision-body"></div>

    <div class="revision-footer">
      <div class="revision-footer-status">
        <span class="revision-footer-dot"></span>
        <div><b id="revisionFooterProgreso">0 de 0 partidas enlazadas</b><small>La entrada se habilita cuando todas las partidas estén relacionadas.</small></div>
      </div>
      <div class="revision-actions">
        <button id="btnNoEntraRevision" class="peligro-soft" type="button">Esta factura no entra</button>
        <button id="btnGenerarRevision" class="principal" type="button">Generar entrada →</button>
      </div>
    </div>
  `;

  vistaFacturas.parentElement.appendChild(pantalla);

  pantalla.querySelector("#btnNoEntraRevision").addEventListener("click", abrirModalNoEntra);
  pantalla.querySelector("#btnGenerarRevision").addEventListener("click", generarEntradaUI);
}

function asegurarModalNoEntra() {
  let modal = document.getElementById("modalNoEntraAbarrotes");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "modalNoEntraAbarrotes";
  modal.className = "modal oculto modal-secundario";
  modal.innerHTML = `
    <div class="noentra-card" role="dialog" aria-modal="true" aria-labelledby="noEntraTitulo">
      <div class="noentra-head">
        <div><span class="entradas-section-kicker">DECISIÓN DE FACTURA</span><h2 id="noEntraTitulo">Marcar como no entra</h2><p>La factura saldrá de pendientes y quedará registrada en historial.</p></div>
        <button id="btnCerrarNoEntra" type="button" aria-label="Cerrar">×</button>
      </div>
      <div class="noentra-body">
        <label for="motivoNoEntraPantalla">Motivo / observación</label>
        <textarea id="motivoNoEntraPantalla" placeholder="Ej. mercancía para otra ubicación, factura no corresponde a Abarrotes..."></textarea>
      </div>
      <div class="noentra-footer">
        <button id="btnCancelarNoEntra" type="button">Cancelar</button>
        <button id="btnConfirmarNoEntra" class="peligro" type="button">Confirmar que no entra</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const cerrar = () => modal.classList.add("oculto");
  modal.querySelector("#btnCerrarNoEntra").addEventListener("click", cerrar);
  modal.querySelector("#btnCancelarNoEntra").addEventListener("click", cerrar);
  modal.addEventListener("click", ev => { if (ev.target === modal) cerrar(); });
  modal.querySelector("#btnConfirmarNoEntra").addEventListener("click", async () => {
    modal.classList.add("oculto");
    await marcarNoEntraUI();
  });
  return modal;
}

function abrirModalNoEntra() {
  const modal = asegurarModalNoEntra();
  const textarea = modal.querySelector("#motivoNoEntraPantalla");
  if (textarea) textarea.value = "";
  modal.classList.remove("oculto");
  setTimeout(() => textarea?.focus(), 60);
}

function mostrarPantallaRevisionFactura() {
  asegurarPantallaRevisionFactura();

  document.querySelectorAll(".entradas-layout .vista").forEach(v => v.classList.remove("activa"));
  const pantalla = document.getElementById("pantallaRevisionFactura");
  pantalla?.classList.remove("oculto");
  pantalla?.classList.add("activa");

  const titulo = document.getElementById("tituloRevisionFactura");
  if (titulo && facturaSeleccionada) {
    titulo.textContent = `Revisar factura ${facturaSeleccionada.serie || ""} ${facturaSeleccionada.folio || ""}`.trim();
  }

  // En móvil la revisión funciona como una pantalla independiente.
  // Subimos al inicio para que el usuario siempre vea el encabezado y el progreso.
  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (_) {
    window.scrollTo(0, 0);
  }
}

function pintarEntradasDesdeCacheSiVisible() {
  const vista = document.getElementById("vistaEntradas");
  if (vista?.classList.contains("activa")) {
    cargarEntradasUI();
  }
}

function pintarHistorialDesdeCacheSiVisible() {
  const vista = document.getElementById("vistaHistorial");
  if (vista?.classList.contains("activa")) {
    cargarHistorialUI();
  }
}

function notificar(mensaje, tipo = "info", duracion = 3600) {
  let host = document.getElementById("provsoftToastHost");

  if (!host) {
    host = document.createElement("div");
    host.id = "provsoftToastHost";
    host.className = "toast-host";
    document.body.appendChild(host);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  toast.textContent = mensaje;
  host.appendChild(toast);

  setTimeout(() => toast.classList.add("visible"), 20);
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 250);
  }, duracion);
}

function confirmarProvsoft({ titulo = "Confirmar", mensaje = "¿Continuar?", textoAceptar = "Aceptar", textoCancelar = "Cancelar", peligro = false } = {}) {
  return new Promise((resolve) => {
    let modal = document.getElementById("modalConfirmProvsoft");

    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modalConfirmProvsoft";
      modal.className = "modal oculto modal-confirmacion-provsoft";
      modal.innerHTML = `
        <div class="confirm-card">
          <h2 id="confirmTitulo"></h2>
          <p id="confirmMensaje"></p>
          <div class="confirm-actions">
            <button id="confirmCancelar" type="button"></button>
            <button id="confirmAceptar" type="button"></button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    modal.querySelector("#confirmTitulo").textContent = titulo;
    modal.querySelector("#confirmMensaje").textContent = mensaje;

    const btnCancelar = modal.querySelector("#confirmCancelar");
    const btnAceptar = modal.querySelector("#confirmAceptar");

    btnCancelar.textContent = textoCancelar;
    btnAceptar.textContent = textoAceptar;
    btnAceptar.className = peligro ? "peligro" : "principal";

    const cerrar = (valor) => {
      modal.classList.add("oculto");
      btnCancelar.onclick = null;
      btnAceptar.onclick = null;
      resolve(valor);
    };

    btnCancelar.onclick = () => cerrar(false);
    btnAceptar.onclick = () => cerrar(true);

    modal.classList.remove("oculto");
    btnCancelar.focus();
  });
}

function obtenerUuidFacturaLocal(factura) {
  return String(factura?.uuid_cfdi || factura?.uuid || factura?.id || "").toUpperCase().trim();
}

function quitarFacturaPendienteLocal(factura) {
  const uuid = obtenerUuidFacturaLocal(factura);

  if (!uuid) {
    return;
  }

  facturasPendientes = facturasPendientes.filter(f =>
    obtenerUuidFacturaLocal(f) !== uuid
  );

  facturaSeleccionada = null;
  articulosPreparados = [];
}

function mostrarCargando(texto = "Cargando información...") {
  document.getElementById("textoCargando").textContent = texto;
  document.getElementById("modalCargando").classList.remove("oculto");
}

function ocultarCargando() {
  document.getElementById("modalCargando").classList.add("oculto");
}

function capitalizar(txt) {
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function formatearFechaHora(value) {
  if (!value) return "";

  const fecha = new Date(value);

  if (Number.isNaN(fecha.getTime())) {
    return value;
  }

  return fecha.toLocaleString("es-MX");
}

function formatoPesos(valor) {
  return Number(valor || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function numeroCorto(valor) {
  const n = Number(valor || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function numeroInput(valor) {
  const n = Number(valor || 0);
  return Number.isFinite(n) ? String(Number(n.toFixed(6))) : "0";
}

function debounce(fn, delay = 250) {
  let timer = null;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
