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
let equivalencias = [];
let facturasPendientes = [];
let facturaSeleccionada = null;
let articulosPreparados = [];

let productosActivos = [];
let productosActivosCargados = false;
let indiceArticuloEnlace = null;
let productoSeleccionado = null;

document.addEventListener("DOMContentLoaded", async () => {
  configurarTabs();
  configurarBotones();

  await iniciarAplicacion();
});

async function iniciarAplicacion() {
  mostrarCargando("Cargando configuración y facturas pendientes...");

  try {
    await cargarConfiguracionesIniciales();
    await cargarFacturasUI(false);
  } catch (error) {
    alert(error.message || "Error al cargar la aplicación");
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
  const rfc = document.getElementById("rfcProveedor").value;
  const nombre = document.getElementById("nombreProveedor").value;

  try {
    await guardarProveedorAutorizado({
      rfc_emisor: rfc,
      razon_social_emisor: nombre
    });

    document.getElementById("rfcProveedor").value = "";
    document.getElementById("nombreProveedor").value = "";

    proveedores = await cargarProveedoresAutorizados();
    pintarProveedores();

    await cargarFacturasUI(false);

    alert("Proveedor guardado");
  } catch (error) {
    alert(error.message);
  }
}

async function cargarFacturasUI(conModal = true) {
  const contenedor = document.getElementById("listaFacturas");

  if (conModal) {
    mostrarCargando("Cargando facturas pendientes...");
  }

  contenedor.innerHTML = "<p>Cargando facturas...</p>";

  try {
    proveedores = await cargarProveedoresAutorizados();
    equivalencias = await cargarEquivalencias();

    pintarProveedores();

    const facturas = await cargarFacturasOrigen(300);

    facturasPendientes = await filtrarFacturasPendientesParaZapata(
      facturas,
      proveedores
    );

    pintarFacturas();
  } catch (error) {
    contenedor.innerHTML = `<p class="alerta">${escapeHtml(error.message)}</p>`;
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
    const entradas = await cargarEntradasZapata(100);

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
  }
}

async function cargarHistorialUI() {
  const contenedor = document.getElementById("listaHistorial");
  contenedor.innerHTML = "<p>Cargando historial...</p>";

  try {
    const historial = await cargarHistorialZapata(200);

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
      <span class="badge ${p.activo ? "badge-ok" : "badge-no"}">
        ${p.activo ? "ACTIVO" : "INACTIVO"}
      </span>
    `;

    contenedor.appendChild(div);
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
  renderDetalleFactura();
  document.getElementById("modalFactura").classList.remove("oculto");
}

function recalcularArticulosPreparados() {
  articulosPreparados = prepararArticulosEntrada(
    facturaSeleccionada,
    equivalencias
  );
}

function renderDetalleFactura() {
  if (!facturaSeleccionada) return;

  document.getElementById("motivoNoEntra").value = "";

  const detalle = document.getElementById("detalleFactura");

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
    alert("No se encontró el concepto de factura");
    return;
  }

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
    alert("No hay concepto seleccionado");
    return;
  }

  if (!productoSeleccionado) {
    alert("Selecciona un producto del catálogo");
    return;
  }

  const codigoInterno = String(productoSeleccionado.codigoBarra || productoSeleccionado.id || "").trim();
  const descripcionInterna = String(productoSeleccionado.concepto || "").trim();
  const cantidadFactura = Number(articulo.cantidad_factura || 0);
  const cantidadEntrada = Number(document.getElementById("cantidadEntradaProducto").value || 0);

  if (!codigoInterno || !descripcionInterna) {
    alert("El producto seleccionado no tiene código o descripción");
    return;
  }

  if (!cantidadEntrada || cantidadEntrada <= 0) {
    alert("La cantidad de entrada debe ser mayor a cero");
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

    alert("Producto enlazado a la factura");
  } catch (error) {
    alert(error.message || "Error al guardar enlace");
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
  document.getElementById("modalFactura").classList.add("oculto");
}

async function generarEntradaUI() {
  if (!facturaSeleccionada) {
    alert("No hay factura seleccionada");
    return;
  }

  const faltantes = articulosPreparados.filter(a => !a.equivalencia_encontrada);

  if (faltantes.length > 0) {
    alert("Hay conceptos sin enlace. Primero usa Buscar producto dentro de esta factura.");
    return;
  }

  const ok = confirm("¿Generar entrada Zapata con esta factura?");

  if (!ok) return;

  mostrarCargando("Generando entrada Zapata...");

  try {
    const entrada = await generarEntradaZapata(
      facturaSeleccionada,
      articulosPreparados,
      "GERARDO"
    );

    alert(`Entrada generada: ${entrada.folioEntrada}`);

    cerrarModal();

    await cargarFacturasUI(false);
    await cargarEntradasUI();
    await cargarHistorialUI();

  } catch (error) {
    alert(error.message);
  } finally {
    ocultarCargando();
  }
}

async function marcarNoEntraUI() {
  if (!facturaSeleccionada) {
    alert("No hay factura seleccionada");
    return;
  }

  const motivo = document.getElementById("motivoNoEntra").value.trim();

  const ok = confirm(
    "¿Marcar esta factura como NO ENTRA A ZAPATA? Ya no aparecerá en pendientes, pero quedará en historial."
  );

  if (!ok) return;

  mostrarCargando("Marcando factura como no entra a Zapata...");

  try {
    await marcarFacturaNoEntraZapata(
      facturaSeleccionada,
      motivo,
      "GERARDO"
    );

    alert("Factura marcada como no entra a Zapata");

    cerrarModal();

    await cargarFacturasUI(false);
    await cargarHistorialUI();

  } catch (error) {
    alert(error.message);
  } finally {
    ocultarCargando();
  }
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
