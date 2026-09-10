export function crearLoading() {
  if (document.getElementById("loadingOverlay")) return;

  const div = document.createElement("div");
  div.id = "loadingOverlay";
  div.className = "loading-overlay oculto";

  div.innerHTML = `
    <div class="loading-box">
      <div class="spinner"></div>
      <div id="loadingTexto">Cargando datos...</div>
      <div id="loadingSubtexto">Procesando información...</div>
    </div>
  `;

  document.body.appendChild(div);
}

export function mostrarLoading(texto = "Cargando datos...", subtexto = "Procesando información...") {
  crearLoading();

  document.getElementById("loadingTexto").textContent = texto;
  document.getElementById("loadingSubtexto").textContent = subtexto;
  document.getElementById("loadingOverlay").classList.remove("oculto");
}

export function cambiarLoading(texto, subtexto = "") {
  const textoEl = document.getElementById("loadingTexto");
  const subtextoEl = document.getElementById("loadingSubtexto");

  if (textoEl) textoEl.textContent = texto;
  if (subtextoEl) subtextoEl.textContent = subtexto;
}

export function ocultarLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.classList.add("oculto");
}
