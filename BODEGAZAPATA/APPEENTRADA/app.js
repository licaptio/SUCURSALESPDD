import {
  guardarProveedorAutorizado,
  cargarProveedoresAutorizados,
  guardarEquivalencia,
  cargarEquivalencias
} from "./configuracion.js";

import {
  cargarFacturasOrigen,
  filtrarFacturasPendientesParaZapata
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

document.addEventListener("DOMContentLoaded", async () => {
  configurarTabs();
  configurarBotones();

  await cargarConfiguracionesIniciales();
});

function configurarTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("activo"));
      btn.classList.add("activo");

      const vista = btn.dataset.vista;

      document.querySelectorAll(".vista").forEach(v => v.classList.remove("activa"));

      document.getElementById(`vista${capitalizar(vista)}`).classList.add("activa");
    });
  });
}

function configurarBotones() {
  document
    .getElementById("btnGuardarProveedor")
    .addEventListener("click", guardarProveedorUI);

  document
    .getElementById("btnGuardarEquivalencia")
    .addEventListener("click", guardarEquivalenciaUI);

  document
    .getElementById("btnCargarFacturas")
    .addEventListener("click", cargarFacturasUI);

  document
    .getElementById("btnCargarEntradas")
    .addEventListener("click", cargarEntradasUI);

  document
    .getElementById("btnCerrarModal")
    .addEventListener("click", cerrarModal);

  document
    .getElementById("btnGenerarEntrada")
    .addEventListener("click", generarEntradaUI);
}

async function cargarConfiguracionesIniciales() {
  proveedores = await cargarProveedoresAutorizados();
  equivalencias = await cargarEquivalencias();

  pintarProveedores();
  pintarEquivalencias();
}

async function guardarProveedorUI() {
  const rfc = document.getElementById("rfcProveedor").value;
  const nombre = document.getElementById("nombreProveedor").value;

  await guardarProveedorAutorizado({
    rfc_emisor: rfc,
    razon_social_emisor: nombre
  });

  document.getElementById("rfcProveedor").value = "";
  document.getElementById("nombreProveedor").value = "";

  proveedores = await cargarProveedoresAutorizados();
  pintarProveedores();

  alert("Proveedor guardado");
}

async function guardarEquivalenciaUI() {
  const data = {
    texto_factura: document.getElementById("textoFactura").value,
    codigo_interno: document.getElementById("codigoInterno").value,
    descripcion_interna: document.getElementById("descripcionInterna").value,
    unidad_factura: document.getElementById("unidadFactura").value,
    unidad_inventario: document.getElementById("unidadInventario").value,
    factor_conversion: document.getElementById("factorConversion").value
  };

  await guardarEquivalencia(data);

  document.getElementById("textoFactura").value = "";
  document.getElementById("codigoInterno").value = "";
  document.getElementById("descripcionInterna").value = "";
  document.getElementById("unidadFactura").value = "";
  document.getElementById("unidadInventario").value = "";
  document.getElementById("factorConversion").value = "";

  equivalencias = await cargarEquivalencias();
  pintarEquivalencias();

  alert("Equivalencia guardada");
}

async function cargarFacturasUI() {
  const contenedor = document.getElementById("listaFacturas");
  contenedor.innerHTML = "<p>Cargando facturas...</p>";

  proveedores = await cargarProveedoresAutorizados();
  equivalencias = await cargarEquivalencias();

  const facturas = await cargarFacturasOrigen(200);

  facturasPendientes = await filtrarFacturasPendientesParaZapata(
    facturas,
    proveedores
  );

  pintarFacturas();
}

async function cargarEntradasUI() {
  const contenedor = document.getElementById("listaEntradas");
  contenedor.innerHTML = "<p>Cargando entradas...</p>";

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
      <p><b>UUID:</b> ${escapeHtml(e.uuid_cfdi || "")}</p>
      <p><b>Artículos:</b> ${(e.articulos || []).length}</p>
      <p><span class="badge">${escapeHtml(e.estado || "")}</span></p>
    `;

    contenedor.appendChild(div);
  });
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
      <span class="badge">${p.activo ? "ACTIVO" : "INACTIVO"}</span>
    `;

    contenedor.appendChild(div);
  });
}

function pintarEquivalencias() {
  const contenedor = document.getElementById("listaEquivalencias");
  contenedor.innerHTML = "";

  if (equivalencias.length === 0) {
    contenedor.innerHTML = "<p>No hay equivalencias configuradas.</p>";
    return;
  }

  equivalencias.forEach(eq => {
    const div = document.createElement("div");
    div.className = "item-lista";

    div.innerHTML = `
      <b>Factura:</b> ${escapeHtml(eq.texto_factura || "")}<br>
      <b>Código interno:</b> ${escapeHtml(eq.codigo_interno || "")}<br>
      <b>Descripción:</b> ${escapeHtml(eq.descripcion_interna || "")}<br>
      <b>Conversión:</b> 
      ${escapeHtml(eq.unidad_factura || "")}
      → 
      ${escapeHtml(eq.unidad_inventario || "")}
      × ${Number(eq.factor_conversion || 1)}
    `;

    contenedor.appendChild(div);
  });
}

function pintarFacturas() {
  const contenedor = document.getElementById("listaFacturas");
  contenedor.innerHTML = "";

  if (facturasPendientes.length === 0) {
    contenedor.innerHTML = "<p>No hay facturas pendientes para proveedores autorizados.</p>";
    return;
  }

  facturasPendientes.forEach((f, index) => {
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <h3>${escapeHtml(f.razon_social_emisor || "Proveedor sin nombre")}</h3>
      <p><b>RFC:</b> ${escapeHtml(f.rfc_emisor || "")}</p>
      <p><b>Factura:</b> ${escapeHtml(f.serie || "")} ${escapeHtml(f.folio || "")}</p>
      <p><b>Fecha:</b> ${escapeHtml(f.fecha || "")}</p>
      <p><b>Total:</b> $${Number(f.total || 0).toFixed(2)}</p>
      <p><b>UUID:</b> ${escapeHtml(f.uuid_cfdi || f.id || "")}</p>
      <p><b>Conceptos:</b> ${(f.conceptos_detalle || []).length}</p>
      <button data-index="${index}" class="btnAutorizar">Revisar / autorizar</button>
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

  articulosPreparados = prepararArticulosEntrada(
    facturaSeleccionada,
    equivalencias
  );

  const detalle = document.getElementById("detalleFactura");

  const filas = articulosPreparados.map(a => `
    <tr>
      <td>${escapeHtml(a.codigo_factura)}</td>
      <td>${escapeHtml(a.descripcion_factura)}</td>
      <td>${Number(a.cantidad_factura || 0)}</td>
      <td>${escapeHtml(a.codigo_interno)}</td>
      <td>${escapeHtml(a.descripcion_interna)}</td>
      <td>${Number(a.factor_conversion || 1)}</td>
      <td>${Number(a.cantidad_entrada || 0)}</td>
      <td>
        ${
          a.equivalencia_encontrada
          ? "<span class='ok'>OK</span>"
          : "<span class='alerta'>SIN EQUIVALENCIA</span>"
        }
      </td>
    </tr>
  `).join("");

  detalle.innerHTML = `
    <p><b>Proveedor:</b> ${escapeHtml(facturaSeleccionada.razon_social_emisor || "")}</p>
    <p><b>RFC:</b> ${escapeHtml(facturaSeleccionada.rfc_emisor || "")}</p>
    <p><b>UUID:</b> ${escapeHtml(facturaSeleccionada.uuid_cfdi || facturaSeleccionada.id || "")}</p>

    <table class="tabla">
      <thead>
        <tr>
          <th>Código factura</th>
          <th>Concepto factura</th>
          <th>Cantidad factura</th>
          <th>Código interno</th>
          <th>Descripción interna</th>
          <th>Factor</th>
          <th>Cantidad entrada</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${filas}
      </tbody>
    </table>
  `;

  document.getElementById("modalFactura").classList.remove("oculto");
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
    alert("Hay conceptos sin equivalencia. Primero configura esos productos.");
    return;
  }

  const ok = confirm("¿Generar entrada Zapata con esta factura?");

  if (!ok) return;

  try {
    const entrada = await generarEntradaZapata(
      facturaSeleccionada,
      articulosPreparados,
      "GERARDO"
    );

    alert(`Entrada generada: ${entrada.folioEntrada}`);

    cerrarModal();
    await cargarFacturasUI();

  } catch (error) {
    alert(error.message);
  }
}

function capitalizar(txt) {
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}