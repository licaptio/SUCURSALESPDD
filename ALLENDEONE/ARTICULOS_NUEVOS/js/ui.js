import { moneda, fechaCorta, obtenerCodigo, normalizarEscalas } from "./formatos.js";

const elementos = {
  estado: document.querySelector("#estado"),
  visor: document.querySelector("#visor"),
  grid: document.querySelector("#gridProductos"),
  plantilla: document.querySelector("#plantillaProducto"),
  paginaActual: document.querySelector("#paginaActual"),
  puntosPagina: document.querySelector("#puntosPagina"),
  btnAnterior: document.querySelector("#btnAnterior"),
  btnSiguiente: document.querySelector("#btnSiguiente")
};

export function mostrarCargando() {
  elementos.estado.textContent = "Cargando artículos nuevos...";
  elementos.estado.className = "estado";
  elementos.estado.classList.remove("oculto");
  elementos.visor.classList.add("oculto");
}

export function mostrarError(mensaje) {
  elementos.estado.textContent = mensaje;
  elementos.estado.className = "estado error";
  elementos.estado.classList.remove("oculto");
  elementos.visor.classList.add("oculto");
}

export function renderizarPagina({ productos, pagina, totalPaginas, fotosPorCodigo }) {
  elementos.grid.innerHTML = "";

  for (const producto of productos) {
    elementos.grid.appendChild(crearTarjeta(producto, fotosPorCodigo));
  }

  elementos.estado.classList.add("oculto");
  elementos.visor.classList.remove("oculto");
  elementos.paginaActual.textContent = `Página ${pagina + 1} de ${Math.max(totalPaginas, 1)}`;
  elementos.btnAnterior.disabled = pagina <= 0;
  elementos.btnSiguiente.disabled = pagina >= totalPaginas - 1;
  renderizarPuntos(pagina, totalPaginas);
}

function crearTarjeta(producto, fotosPorCodigo) {
  const fragmento = elementos.plantilla.content.cloneNode(true);
  const tarjeta = fragmento.querySelector(".tarjeta-producto");
  const codigo = obtenerCodigo(producto);

  fragmento.querySelector(".concepto").textContent = producto.concepto || producto.nombre || "Sin concepto";
  fragmento.querySelector(".codigo").textContent = `Código: ${codigo || "Sin código"}`;
  fragmento.querySelector(".fecha-alta").textContent = fechaCorta(producto.creadoEn);
  fragmento.querySelector(".precio-publico").textContent = moneda(producto.precioPublico);
  fragmento.querySelector(".medio-mayoreo").textContent = moneda(producto.medioMayoreo);
  fragmento.querySelector(".mayoreo").textContent = moneda(producto.mayoreo);

  const fotoWrap = fragmento.querySelector(".foto-wrap");
  const imagen = fragmento.querySelector(".foto-producto");
  const urlFoto = fotosPorCodigo.get(codigo);

  if (urlFoto) {
    imagen.src = urlFoto;
    imagen.alt = producto.concepto || producto.nombre || `Producto ${codigo}`;
    imagen.addEventListener("load", () => fotoWrap.classList.add("tiene-foto"));
    imagen.addEventListener("error", () => {
      imagen.removeAttribute("src");
      fotoWrap.classList.remove("tiene-foto");
    });
  } else {
    imagen.removeAttribute("src");
  }

  const listaEscalas = fragmento.querySelector(".lista-escalas");
  const escalas = normalizarEscalas(producto.preciosPorCantidad);

  if (escalas.length === 0) {
    const vacio = document.createElement("span");
    vacio.className = "sin-escalas";
    vacio.textContent = "Sin precios por cantidad";
    listaEscalas.appendChild(vacio);
  } else {
    for (const escala of escalas) {
      const etiqueta = document.createElement("span");
      etiqueta.className = "escala";
      etiqueta.innerHTML = `<strong>${escala.cantidad} pzas.</strong> ${moneda(escala.precio)}`;
      listaEscalas.appendChild(etiqueta);
    }
  }

  return tarjeta;
}

function renderizarPuntos(paginaActiva, totalPaginas) {
  elementos.puntosPagina.innerHTML = "";
  for (let i = 0; i < totalPaginas; i += 1) {
    const punto = document.createElement("span");
    punto.className = `punto${i === paginaActiva ? " activo" : ""}`;
    elementos.puntosPagina.appendChild(punto);
  }
}
