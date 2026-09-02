import { iniciarModuloEntradasZapata } from "./entradasModulo.js";
import { sincronizarProductosActivosLocalDiario } from "./configuracion.js";

const ocultarLoader = () => {
  document.getElementById("loader")?.classList.add("oculto");
};

function abrirPendientes() {
  document.querySelectorAll("#panelEntradasZapata .tab").forEach((boton) => {
    boton.classList.toggle("activo", boton.dataset.vista === "facturas");
  });
  document.querySelectorAll("#panelEntradasZapata .vista").forEach((vista) => {
    vista.classList.toggle("activa", vista.id === "vistaFacturas");
  });
  const menu = document.getElementById("menuEntradasApp");
  if (menu) menu.open = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("btnCerrarEntradasZapata")?.addEventListener("click", abrirPendientes);

try {
  await Promise.all([
    iniciarModuloEntradasZapata(),
    sincronizarProductosActivosLocalDiario()
  ]);
} catch (error) {
  console.error(error);
  const lista = document.getElementById("listaFacturas");
  if (lista) {
    const aviso = document.createElement("p");
    aviso.className = "mobile-error";
    aviso.textContent = `No fue posible cargar Entradas. ${String(error?.message || "Revisa la conexión e inténtalo otra vez.")}`;
    lista.replaceChildren(aviso);
  }
} finally {
  ocultarLoader();
}
