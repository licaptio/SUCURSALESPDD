import { moneda, fechaCorta, obtenerCodigo } from "./formatos.js";

const elementos = {
  estado: document.querySelector("#estado"),
  visor: document.querySelector("#visor"),
  grid: document.querySelector("#gridProductos"),
  plantilla: document.querySelector("#plantillaProducto"),
  paginaActual: document.querySelector("#paginaActual"),
  puntosPagina: document.querySelector("#puntosPagina"),
  btnAnterior: document.querySelector("#btnAnterior"),
  btnSiguiente: document.querySelector("#btnSiguiente"),
  modal: document.querySelector("#modalFotos"),
  modalTitulo: document.querySelector("#modalTitulo"),
  modalImagen: document.querySelector("#modalImagen"),
  modalContador: document.querySelector("#modalContador"),
  modalMiniaturas: document.querySelector("#modalMiniaturas"),
  btnCerrarModal: document.querySelector("#btnCerrarModal"),
  btnFotoAnterior: document.querySelector("#btnFotoAnterior"),
  btnFotoSiguiente: document.querySelector("#btnFotoSiguiente")
};

const estadoModal = { fotos: [], indice: 0, titulo: "", elementoOrigen: null };

elementos.btnCerrarModal.addEventListener("click", cerrarModalFotos);
elementos.btnFotoAnterior.addEventListener("click", () => cambiarFoto(-1));
elementos.btnFotoSiguiente.addEventListener("click", () => cambiarFoto(1));
elementos.modal.addEventListener("click", evento => {
  if (evento.target.hasAttribute("data-cerrar-modal")) cerrarModalFotos();
});

document.addEventListener("keydown", evento => {
  if (elementos.modal.classList.contains("oculto")) return;
  if (!["Escape", "ArrowLeft", "ArrowRight"].includes(evento.key)) return;

  evento.preventDefault();
  evento.stopImmediatePropagation();

  if (evento.key === "Escape") cerrarModalFotos();
  if (evento.key === "ArrowLeft") cambiarFoto(-1);
  if (evento.key === "ArrowRight") cambiarFoto(1);
});

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
  for (const producto of productos) elementos.grid.appendChild(crearTarjeta(producto, fotosPorCodigo));

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
  const titulo = producto.concepto || producto.nombre || "Sin concepto";

  fragmento.querySelector(".concepto").textContent = titulo;
  fragmento.querySelector(".codigo").textContent = `Código: ${codigo || "Sin código"}`;
  fragmento.querySelector(".fecha-alta").textContent = fechaCorta(producto.creadoEn);
  fragmento.querySelector(".precio-publico").textContent = moneda(producto.precioPublico);
  fragmento.querySelector(".medio-mayoreo").textContent = moneda(producto.medioMayoreo);
  fragmento.querySelector(".mayoreo").textContent = moneda(producto.mayoreo);

  const fotoWrap = fragmento.querySelector(".foto-wrap");
  const imagen = fragmento.querySelector(".foto-producto");
  const fotos = fotosPorCodigo.get(codigo) || [];

  if (fotos.length) {
    imagen.src = fotos[0];
    imagen.alt = titulo;
    fotoWrap.classList.add("foto-clic");
    fotoWrap.setAttribute("role", "button");
    fotoWrap.setAttribute("tabindex", "0");
    fotoWrap.setAttribute("title", "Ver todas las fotografías");

    imagen.addEventListener("load", () => fotoWrap.classList.add("tiene-foto"));
    imagen.addEventListener("error", () => {
      imagen.removeAttribute("src");
      fotoWrap.classList.remove("tiene-foto", "foto-clic");
      fotoWrap.removeAttribute("role");
      fotoWrap.removeAttribute("tabindex");
    });

    const abrir = () => abrirModalFotos(fotos, titulo, fotoWrap);
    fotoWrap.addEventListener("click", abrir);
    fotoWrap.addEventListener("keydown", evento => {
      if (evento.key === "Enter" || evento.key === " ") {
        evento.preventDefault();
        abrir();
      }
    });

    if (fotos.length > 1) {
      const contador = document.createElement("span");
      contador.className = "cantidad-fotos";
      contador.textContent = `${fotos.length} fotos`;
      fotoWrap.appendChild(contador);
    }
  } else {
    imagen.removeAttribute("src");
  }

  return tarjeta;
}

function abrirModalFotos(fotos, titulo, elementoOrigen) {
  estadoModal.fotos = fotos;
  estadoModal.indice = 0;
  estadoModal.titulo = titulo;
  estadoModal.elementoOrigen = elementoOrigen;
  elementos.modalTitulo.textContent = titulo;
  elementos.modal.classList.remove("oculto");
  elementos.modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-abierto");
  renderizarFotoModal();
  elementos.btnCerrarModal.focus();
}

function cerrarModalFotos() {
  elementos.modal.classList.add("oculto");
  elementos.modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-abierto");
  elementos.modalImagen.removeAttribute("src");
  elementos.modalMiniaturas.innerHTML = "";
  estadoModal.elementoOrigen?.focus();
  estadoModal.fotos = [];
  estadoModal.indice = 0;
  estadoModal.elementoOrigen = null;
}

function cambiarFoto(direccion) {
  const total = estadoModal.fotos.length;
  if (total <= 1) return;
  estadoModal.indice = (estadoModal.indice + direccion + total) % total;
  renderizarFotoModal();
}

function renderizarFotoModal() {
  const total = estadoModal.fotos.length;
  const indice = estadoModal.indice;
  elementos.modalImagen.src = estadoModal.fotos[indice];
  elementos.modalImagen.alt = `${estadoModal.titulo}, fotografía ${indice + 1}`;
  elementos.modalContador.textContent = `Fotografía ${indice + 1} de ${total}`;
  elementos.btnFotoAnterior.disabled = total <= 1;
  elementos.btnFotoSiguiente.disabled = total <= 1;
  elementos.modalMiniaturas.innerHTML = "";

  estadoModal.fotos.forEach((foto, posicion) => {
    const boton = document.createElement("button");
    boton.className = `modal-miniatura${posicion === indice ? " activa" : ""}`;
    boton.type = "button";
    boton.setAttribute("aria-label", `Ver fotografía ${posicion + 1}`);

    const imagen = document.createElement("img");
    imagen.src = foto;
    imagen.alt = "";
    boton.appendChild(imagen);
    boton.addEventListener("click", () => {
      estadoModal.indice = posicion;
      renderizarFotoModal();
    });
    elementos.modalMiniaturas.appendChild(boton);
  });
}

function renderizarPuntos(paginaActiva, totalPaginas) {
  elementos.puntosPagina.innerHTML = "";
  for (let i = 0; i < totalPaginas; i += 1) {
    const punto = document.createElement("span");
    punto.className = `punto${i === paginaActiva ? " activo" : ""}`;
    elementos.puntosPagina.appendChild(punto);
  }
}
