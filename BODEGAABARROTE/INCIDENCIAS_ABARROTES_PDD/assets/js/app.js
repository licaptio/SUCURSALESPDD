import { guardarIncidencia } from "./firebase.js";
import { iniciarDictado } from "./voz.js";
import { enviarTelegram } from "./telegram.js";

const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];

const homeView = $("#homeView");
const captureView = $("#captureView");
const statusView = $("#statusView");

const btnNueva = $("#btnNueva");
const btnAtras = $("#btnAtras");
const btnSiguiente = $("#btnSiguiente");
const btnOtra = $("#btnOtra");
const btnFoto = $("#btnFoto");
const btnRepetirFoto = $("#btnRepetirFoto");

const proveedor = $("#proveedor");
const comentario = $("#comentario");
const fotoInput = $("#fotoInput");
const fotoPreview = $("#fotoPreview");
const previewWrap = $("#previewWrap");
const revProveedor = $("#revProveedor");
const revComentario = $("#revComentario");
const revFoto = $("#revFoto");

const stepLabel = $("#stepLabel");
const stepTitle = $("#stepTitle");
const progressFill = $("#progressFill");
const toast = $("#toast");

const spinner = $("#spinner");
const statusIcon = $("#statusIcon");
const statusTitle = $("#statusTitle");
const statusText = $("#statusText");

let step = 1;
let fotoFile = null;
let fotoObjectUrl = null;
let saving = false;

const titles = {
  1: "Proveedor",
  2: "Fotografía",
  3: "Comentario",
  4: "Revisión"
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 3200);
}

function setView(view) {
  homeView.classList.toggle("hidden", view !== "home");
  captureView.classList.toggle("hidden", view !== "capture");
  statusView.classList.toggle("hidden", view !== "status");
}

function renderStep() {
  $$(".step-panel").forEach((panel) => {
    panel.classList.toggle("hidden", Number(panel.dataset.step) !== step);
  });

  stepLabel.textContent = `PASO ${step} DE 4`;
  stepTitle.textContent = titles[step];
  progressFill.style.width = `${step * 25}%`;
  btnSiguiente.textContent = step === 4 ? "GUARDAR INCIDENCIA" : "CONTINUAR";
  btnAtras.textContent = step === 1 ? "CANCELAR" : "REGRESAR";

  if (step === 4) {
    revProveedor.textContent = proveedor.value.trim() || "—";
    revComentario.textContent = comentario.value.trim() || "Sin comentario";
    if (fotoObjectUrl) revFoto.src = fotoObjectUrl;
  }
}

function resetForm() {
  step = 1;
  proveedor.value = "";
  comentario.value = "";
  fotoInput.value = "";
  fotoFile = null;

  if (fotoObjectUrl) URL.revokeObjectURL(fotoObjectUrl);
  fotoObjectUrl = null;

  fotoPreview.removeAttribute("src");
  revFoto.removeAttribute("src");
  previewWrap.classList.add("hidden");
  renderStep();
}

function openCamera() {
  fotoInput.click();
}

function validarPaso() {
  if (step === 1 && !proveedor.value.trim()) {
    showToast("Escribe o dicta el nombre del proveedor.");
    proveedor.focus();
    return false;
  }

  if (step === 2 && !fotoFile) {
    showToast("Debes tomar una fotografía de la incidencia.");
    return false;
  }

  return true;
}

function crearFolio() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `INC-ABPDD-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function fechaHoraLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return {
    fechaLocal: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
    horaLocal: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  };
}

async function guardar() {
  if (saving) return;
  saving = true;

  setView("status");
  spinner.classList.remove("hidden");
  statusIcon.classList.add("hidden");
  btnOtra.classList.add("hidden");
  statusTitle.textContent = "Guardando incidencia…";
  statusText.textContent = "Subiendo fotografía y registrando datos en Firebase. No cierres esta pantalla.";

  const incidenciaId = crearFolio();
  const { fechaLocal, horaLocal } = fechaHoraLocal();

  try {
    const incidencia = await guardarIncidencia({
      incidenciaId,
      proveedor: proveedor.value,
      comentario: comentario.value,
      fotoBlob: fotoFile,
      fechaLocal,
      horaLocal
    });

    let telegramOk = true;
    try {
      await enviarTelegram(incidencia);
    } catch (tgError) {
      telegramOk = false;
      console.error("Telegram:", tgError);
    }

    spinner.classList.add("hidden");
    statusIcon.classList.remove("hidden");
    statusIcon.textContent = "✓";
    statusTitle.textContent = "Incidencia registrada";
    statusText.textContent = telegramOk
      ? `${incidenciaId} quedó guardada correctamente.`
      : `${incidenciaId} quedó guardada en Firebase. Telegram no pudo enviarse.`;
    btnOtra.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    spinner.classList.add("hidden");
    statusIcon.classList.remove("hidden");
    statusIcon.textContent = "!";
    statusTitle.textContent = "No se pudo guardar";
    statusText.textContent = error?.message || "Ocurrió un error al registrar la incidencia.";
    btnOtra.classList.remove("hidden");
    btnOtra.textContent = "REGRESAR A LA CAPTURA";
  } finally {
    saving = false;
  }
}

btnNueva.addEventListener("click", () => {
  resetForm();
  setView("capture");
});

btnAtras.addEventListener("click", () => {
  if (step === 1) {
    resetForm();
    setView("home");
    return;
  }
  step -= 1;
  renderStep();
});

btnSiguiente.addEventListener("click", async () => {
  if (!validarPaso()) return;

  if (step < 4) {
    step += 1;
    renderStep();
    return;
  }

  await guardar();
});

fotoInput.addEventListener("change", () => {
  const file = fotoInput.files?.[0];
  if (!file) return;

  fotoFile = file;
  if (fotoObjectUrl) URL.revokeObjectURL(fotoObjectUrl);
  fotoObjectUrl = URL.createObjectURL(file);

  fotoPreview.src = fotoObjectUrl;
  previewWrap.classList.remove("hidden");
});

btnFoto.addEventListener("click", openCamera);
btnRepetirFoto.addEventListener("click", openCamera);

$$(".mic-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.target);
    try {
      iniciarDictado(target, (active) => {
        button.classList.toggle("listening", active);
        button.textContent = active ? "🔴" : "🎤";
      });
    } catch (error) {
      showToast(error.message);
    }
  });
});

btnOtra.addEventListener("click", () => {
  if (statusTitle.textContent === "No se pudo guardar") {
    btnOtra.textContent = "LEVANTAR OTRA INCIDENCIA";
    setView("capture");
    return;
  }
  resetForm();
  setView("capture");
});

renderStep();
