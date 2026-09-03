import {
  guardarProveedorAutorizado,
  cargarProveedoresAutorizados,
  guardarEquivalencia,
  cargarEquivalencias,
  cargarProductosActivos,
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
  cargarEntradasZapata
} from "./entradas.js";

let proveedores = [];
let proveedorEditandoId = null;
let equivalencias = [];
let facturasPendientes = [];
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
let moduloEntradasInicializado = false;

export async function iniciarModuloEntradasZapata(opciones = {}) {
  callbackEntradaGenerada = typeof opciones.onEntradaGenerada === "function" ? opciones.onEntradaGenerada : null;

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

      document.querySelectorAll(".vista").forEach(v => v.classList.remove("activa"));

      document.getElementById(`vista${capitalizar(vista)}`).classList.add("activa");

      if (vista === "historial") {
        await cargarHistorialUI();
      }
    });
  });
}

function configurarBotones() {
  document
    .getElementById("btnGuardarProveedor")
    .addEventListener("click", guardarProveedorUI);

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
    .getElementById("btnBuscarProducto")
    .addEventListener("click", buscarProductoUI);

document
  .getElementById("buscarProductoTexto")
  .addEventListener("input", debounce(buscarProductoUI, 120));
  
  document
    .getElementById("btnMostrarConversion")
    .addEventListener("click", toggleConversion);

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
  const rfc = document.getElementById("rfcProveedor").value.trim().toUpperCase();
  const nombre = document.getElementById("nombreProveedor").value.trim();
  const aliasPivot = document.getElementById("aliasPivotProveedor").value.trim();

  if (!rfc && !proveedorEditandoId) {
    notificar("RFC requerido.", "error");
    return;
  }

  if (!nombre) {
    notificar("Nombre del proveedor requerido.", "error");
    return;
  }

  try {
    await guardarProveedorAutorizado({
      rfc_emisor: proveedorEditandoId || rfc,
      razon_social_emisor: nombre,
      alias_pivot: aliasPivot
    });

    const idProveedor = proveedorEditandoId || rfc;
    const proveedorLocal = {
      id: idProveedor,
      rfc_emisor: idProveedor,
      razon_social_emisor: nombre,
      alias_pivot: aliasPivot || nombre,
      activo: true
    };

    proveedores = proveedores.filter(p => String(p.id || p.rfc_emisor || "").toUpperCase() !== idProveedor);
    proveedores.unshift(proveedorLocal);

    proveedorEditandoId = null;

    document.getElementById("rfcProveedor").disabled = false;
    document.getElementById("rfcProveedor").value = "";
    document.getElementById("nombreProveedor").value = "";
    document.getElementById("aliasPivotProveedor").value = "";
    document.getElementById("btnGuardarProveedor").textContent = "Guardar proveedor";

    pintarProveedores();
    notificar("Proveedor guardado en caché local. Usa Refrescar facturas si quieres traer nuevas facturas de ese proveedor.", "ok");
  } catch (error) {
    notificar(error.message, "error");
  }
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

    const facturas = await cargarFacturasOrigen(3000);

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
      `;

      contenedor.appendChild(div);
    });
  } catch (error) {
    contenedor.innerHTML = `<p class="alerta">${escapeHtml(error.message)}</p>`;
    notificar(error.message, "error");
  }
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
            ${esEntrada ? "ENTRÓ A ZAPATA" : "NO ENTRA A ZAPATA"}
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
  const contenedor = document.getElementById("listaProveedores");
  contenedor.innerHTML = "";

  if (proveedores.length === 0) {
    contenedor.innerHTML = "<p>No hay proveedores autorizados.</p>";
    return;
  }

  proveedores.forEach(p => {
    const div = document.createElement("div");
    div.className = "item-lista";

div.innerHTML = `
  <b>${escapeHtml(p.rfc_emisor || "")}</b><br>
  ${escapeHtml(p.razon_social_emisor || "")}<br>
  <b>Alias pivot:</b> ${escapeHtml(p.alias_pivot || "")}<br>
  <span class="badge ${p.activo ? "badge-ok" : "badge-no"}">
    ${p.activo ? "ACTIVO" : "INACTIVO"}
  </span>
  <br><br>
  <button class="btn-mini btnEditarProveedor" data-id="${escapeHtml(p.id)}">
    Editar
  </button>
`;
  
contenedor.appendChild(div);
});

document.querySelectorAll(".btnEditarProveedor").forEach(btn => {
  btn.addEventListener("click", () => {

    const id = btn.dataset.id;

    const proveedor = proveedores.find(
      p => p.id === id
    );

    if (!proveedor) return;

    proveedorEditandoId = proveedor.id;

    document.getElementById("rfcProveedor").value =
      proveedor.rfc_emisor || "";

    document.getElementById("rfcProveedor").disabled = true;

    document.getElementById("nombreProveedor").value =
      proveedor.razon_social_emisor || "";

    document.getElementById("aliasPivotProveedor").value =
      proveedor.alias_pivot || "";

    document.getElementById("btnGuardarProveedor").textContent =
      "Actualizar proveedor";

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

  });
});

}
function pintarFacturas() {
  const contenedor = document.getElementById("listaFacturas");
  contenedor.innerHTML = "";

  if (facturasPendientes.length === 0) {
    contenedor.innerHTML = `
      <p>
        No hay facturas pendientes para Zapata.
        Revisa proveedores autorizados, fecha mínima 24/05/2026, entradas ya generadas o facturas marcadas como no entra.
      </p>
    `;
    return;
  }

  facturasPendientes.sort((a, b) => {
    const fechaA = new Date(
      a.fecha || a.fecha_factura || a.fecha_emision || 0
    ).getTime();

    const fechaB = new Date(
      b.fecha || b.fecha_factura || b.fecha_emision || 0
    ).getTime();

    return fechaB - fechaA;
  });

  facturasPendientes.forEach((f, index) => {
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <h3>${escapeHtml(f.razon_social_emisor || "Proveedor sin nombre")}</h3>
      <p><span class="badge badge-pendiente">PENDIENTE</span></p>
      <p><b>RFC:</b> ${escapeHtml(f.rfc_emisor || "")}</p>
      <p><b>Factura:</b> ${escapeHtml(f.serie || "")} ${escapeHtml(f.folio || "")}</p>
      <p><b>Fecha:</b> ${escapeHtml(f.fecha || f.fecha_factura || f.fecha_emision || "")}</p>
      <p><b>Total:</b> ${formatoPesos(f.total)}</p>
      <p><b>UUID:</b> ${escapeHtml(f.uuid_cfdi || f.id || "")}</p>
      <p><b>Conceptos:</b> ${(f.conceptos_detalle || []).length}</p>
      <div class="acciones-card">
        <button data-index="${index}" class="btnAutorizar">Revisar / autorizar</button>
      </div>
    `;

    contenedor.appendChild(div);
  });

  document.querySelectorAll(".btnAutorizar").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.index);
      abrirFactura(index);
    });
  });
}

function abrirFactura(index) {
  facturaSeleccionada = facturasPendientes[index];
  recalcularArticulosPreparados();
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

function renderDetalleFactura() {
  if (!facturaSeleccionada) return;

  document.getElementById("motivoNoEntra") && (document.getElementById("motivoNoEntra").value = "");
  document.getElementById("motivoNoEntraPantalla") && (document.getElementById("motivoNoEntraPantalla").value = "");

  const detalle = document.getElementById("detalleFacturaPantalla") || document.getElementById("detalleFactura");

  const filas = articulosPreparados.map((a, index) => `
    <tr>
      <td>${escapeHtml(a.codigo_factura)}</td>
      <td class="celda-descripcion">${escapeHtml(a.descripcion_factura)}</td>
      <td>${numeroCorto(a.cantidad_factura)}</td>
      <td>${a.equivalencia_encontrada ? escapeHtml(a.codigo_interno) : "<span class='muted'>---</span>"}</td>
      <td>${a.equivalencia_encontrada ? escapeHtml(a.descripcion_interna) : "<span class='muted'>Sin producto interno</span>"}</td>
      <td>${numeroCorto(a.cantidad_entrada)}</td>
      <td>
        ${
          a.equivalencia_encontrada
            ? `<span class='estado-enlazado'>OK</span><br><button class="btn-mini btnBuscarProducto" data-index="${index}">Cambiar</button>`
            : `<span class='estado-sin-enlace'>SIN ENLACE</span><br><button class="btn-mini btnBuscarProducto" data-index="${index}">Buscar producto</button>`
        }
      </td>
    </tr>
  `).join("");

  detalle.innerHTML = `

<div class="resumen-factura resumen-factura-compacto">
  <span><b>Proveedor:</b> ${escapeHtml(facturaSeleccionada.razon_social_emisor || "")}</span>
  <span><b>Fecha:</b> ${escapeHtml(facturaSeleccionada.fecha || facturaSeleccionada.fecha_factura || facturaSeleccionada.fecha_emision || "")}</span>
  <span><b>UUID:</b> ${escapeHtml(facturaSeleccionada.uuid_cfdi || facturaSeleccionada.id || "")}</span>
</div>

    <table class="tabla tabla-revision">
      <thead>
        <tr>
          <th>Código factura</th>
          <th>Concepto factura</th>
          <th>Cantidad factura</th>
          <th>Código interno</th>
          <th>Descripción interna</th>
          <th>Cantidad entrada</th>
          <th>Estado / acción</th>
        </tr>
      </thead>
      <tbody>
        ${filas}
      </tbody>
    </table>
  `;

  document.querySelectorAll(".btnBuscarProducto").forEach(btn => {
    btn.addEventListener("click", async () => {
      const index = Number(btn.dataset.index);
      await abrirModalProducto(index);
    });
  });
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
  document.getElementById("conversionBox").classList.add("oculto");
  document.getElementById("buscarProductoTexto").value = "";

  document.getElementById("productoConceptoActual").innerHTML = `
    <p><b>Concepto factura:</b> ${escapeHtml(articulo.descripcion_factura)}</p>
    <p><b>Código factura:</b> ${escapeHtml(articulo.codigo_factura)}</p>
    <p><b>Cantidad factura:</b> ${numeroCorto(articulo.cantidad_factura)}</p>
  `;

  document.getElementById("listaProductos").innerHTML = "<p>Cargando productos activos...</p>";
  document.getElementById("modalProducto").classList.remove("oculto");

  try {
    await asegurarProductosActivos();
    pintarProductos(filtrarProductosCatalogo(productosActivos, ""));
    setTimeout(() => {
      document.getElementById("buscarProductoTexto").focus();
    }, 100);
  } catch (error) {
    document.getElementById("listaProductos").innerHTML = `<p class="alerta">${escapeHtml(error.message)}</p>`;
  }
}

async function asegurarProductosActivos() {
  if (productosActivosCargados) return;

  productosActivos = await cargarProductosActivos(10000);
  productosActivosCargados = true;
}

function buscarProductoUI() {
  const texto = document.getElementById("buscarProductoTexto").value;
  const filtrados = filtrarProductosCatalogo(productosActivos, texto);

  pintarProductos(filtrados);
}

function pintarProductos(productos) {
  const contenedor = document.getElementById("listaProductos");
  contenedor.innerHTML = "";

  if (productos.length === 0) {
    contenedor.innerHTML = "<p>No se encontraron productos activos.</p>";
    return;
  }

  productos.forEach((p, index) => {
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
      <button class="btn-mini btnSeleccionarProducto" data-index="${index}">
        Seleccionar
      </button>
    `;

    contenedor.appendChild(div);
  });

  document.querySelectorAll(".btnSeleccionarProducto").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.index);
      seleccionarProducto(productos[index]);
    });
  });
}

function seleccionarProducto(producto) {
  productoSeleccionado = producto;

  document.getElementById("listaProductos").innerHTML = "";
  document.getElementById("listaProductos").classList.add("oculto");
  document.getElementById("buscarProductoTexto").value = "";

  const articulo = articulosPreparados[indiceArticuloEnlace];
  const cantidadFactura = Number(articulo?.cantidad_factura || 0);
  const factor = Number(articulo?.factor_conversion || 1);
  const cantidadEntrada = cantidadFactura * factor;

  document.getElementById("selCodigoProducto").textContent =
    producto.codigoBarra || producto.id || "";

  document.getElementById("selDescripcionProducto").textContent =
    producto.concepto || "";

  document.getElementById("cantidadEntradaProducto").value =
    numeroInput(cantidadEntrada || cantidadFactura || 0);

  document.getElementById("factorConversionProducto").value =
    numeroInput(factor || 1);

  document.getElementById("productoSeleccionadoBox").classList.remove("oculto");

  setTimeout(() => {
    document.getElementById("btnGuardarProductoEnlace").focus();
  }, 50);
}

function toggleConversion() {
  document.getElementById("conversionBox").classList.toggle("oculto");
}

function sincronizarCantidadDesdeFactor() {
  const articulo = articulosPreparados[indiceArticuloEnlace];
  if (!articulo) return;

  const cantidadFactura = Number(articulo.cantidad_factura || 0);
  const factor = Number(document.getElementById("factorConversionProducto").value || 1);

  document.getElementById("cantidadEntradaProducto").value =
    numeroInput(cantidadFactura * factor);
}

function sincronizarFactorDesdeCantidad() {
  const articulo = articulosPreparados[indiceArticuloEnlace];
  if (!articulo) return;

  const cantidadFactura = Number(articulo.cantidad_factura || 0);
  const cantidadEntrada = Number(document.getElementById("cantidadEntradaProducto").value || 0);

  if (cantidadFactura > 0) {
    document.getElementById("factorConversionProducto").value =
      numeroInput(cantidadEntrada / cantidadFactura);
  }
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

  if (!codigoInterno || !descripcionInterna) {
    notificar("El producto seleccionado no tiene código o descripción", "error");
    return;
  }

  if (!cantidadEntrada || cantidadEntrada <= 0) {
    notificar("La cantidad de entrada debe ser mayor a cero", "error");
    return;
  }

  const factorConversion = cantidadFactura > 0
    ? cantidadEntrada / cantidadFactura
    : Number(document.getElementById("factorConversionProducto").value || 1);

  mostrarCargando("Guardando enlace del producto...");

  try {
    await guardarEquivalencia({
      texto_factura: `${articulo.codigo_factura || ""} ${articulo.descripcion_factura || ""}`.trim(),
      codigo_interno: codigoInterno,
      descripcion_interna: descripcionInterna,
      unidad_factura: articulo.unidad_factura || "",
      unidad_inventario: productoSeleccionado.unidadMedidaSat || "",
      factor_conversion: factorConversion
    });

    equivalencias = await cargarEquivalencias();

    recalcularArticulosPreparados();
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
  document.getElementById("modalProducto").classList.add("oculto");
  productoSeleccionado = null;
  indiceArticuloEnlace = null;
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
    titulo: "Generar entrada Zapata",
    mensaje: "¿Generar entrada Zapata con esta factura? La factura saldrá de pendientes y la tabla se actualizará en memoria local.",
    textoAceptar: "Generar entrada",
    peligro: false
  });

  if (!ok) return;

  mostrarCargando("Generando entrada Zapata...");

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
    titulo: "Factura no entra a Zapata",
    mensaje: "¿Marcar esta factura como NO ENTRA A ZAPATA? Ya no aparecerá en pendientes, pero quedará en historial.",
    textoAceptar: "Marcar no entra",
    peligro: true
  });

  if (!ok) return;

  mostrarCargando("Marcando factura como no entra a Zapata...");

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

    notificar("Factura marcada como no entra a Zapata", "ok");

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
        <h2 id="tituloRevisionFactura">Revisar y autorizar entrada</h2>
        <p class="texto-ayuda">Pantalla completa de revisión. Los cambios se actualizan en memoria local sin recargar toda la app.</p>
      </div>
      <div class="revision-head-actions">
        <button id="btnCerrarRevisionFactura" type="button">Regresar</button>
      </div>
    </div>

    <div id="detalleFacturaPantalla" class="revision-body"></div>

    <div class="revision-footer">
      <div class="bloque-decision revision-motivo">
        <label for="motivoNoEntra">Motivo si esta factura no entra a Zapata</label>
        <textarea id="motivoNoEntraPantalla" placeholder="Ejemplo: factura no corresponde a mercancía de Zapata, mercancía para otra ubicación, etc."></textarea>
      </div>
      <div class="revision-actions">
        <button id="btnCancelarRevisionFactura" type="button">Cancelar</button>
        <button id="btnNoEntraRevision" class="peligro" type="button">Marcar como no entra</button>
        <button id="btnGenerarRevision" class="principal" type="button">Generar entrada Zapata</button>
      </div>
    </div>
  `;

  vistaFacturas.parentElement.appendChild(pantalla);

  pantalla.querySelector("#btnNoEntraRevision").addEventListener("click", () => {
    const motivoPantalla = document.getElementById("motivoNoEntraPantalla")?.value || "";
    const motivoModal = document.getElementById("motivoNoEntra");
    if (motivoModal) motivoModal.value = motivoPantalla;
    marcarNoEntraUI();
  });

  pantalla.querySelector("#btnGenerarRevision").addEventListener("click", generarEntradaUI);
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
