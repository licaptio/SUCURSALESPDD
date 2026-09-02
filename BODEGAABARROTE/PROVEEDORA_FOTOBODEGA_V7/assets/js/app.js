import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getStorage,
  ref,
  listAll,
  getDownloadURL,
  getMetadata
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

const BASE_FOLDER = "fotobodega/abarrotespdd";
const MIN_DATE = "2026-08-29";
const PAGE_SIZE = 15;
const REFRESH_MS = 120000;

const $ = s => document.querySelector(s);
const gallery = $("#gallery");
const pager = $("#pager");
const total = $("#total");
const range = $("#range");
const state = $("#state");
const errorBox = $("#error");
const viewer = $("#viewer");
const viewerImg = $("#viewerImg");
const viewerText = $("#viewerText");
const datePicker = $("#datePicker");
const prevDay = $("#prevDay");
const nextDay = $("#nextDay");
const todayBtn = $("#todayBtn");
const selectedDayText = $("#selectedDayText");
const storagePath = $("#storagePath");

let files = [];
let page = 1;
let busy = false;
let appFirebase;
let storage;
let selectedDate = "";

// Cache de URL + metadata durante la sesión.
const fileCache = new Map();

function esc(v) {
  return String(v).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[c]);
}

function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clampDate(value) {
  const today = localISODate();
  if (!value || value < MIN_DATE) return MIN_DATE;
  if (value > today) return today;
  return value;
}

function dateParts(value) {
  const [year, month, day] = value.split("-");
  return {
    year,
    month,
    day,
    compact: `${year}${month}${day}`,
    monthFolder: `${BASE_FOLDER}/${year}/${month}`
  };
}

function parseLocalDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function moveDate(value, delta) {
  const d = parseLocalDate(value);
  d.setDate(d.getDate() + delta);
  return clampDate(localISODate(d));
}

function prettySelectedDate(value) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(parseLocalDate(value));
}

function fmt(v) {
  if (!v) return "Sin fecha";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle:"medium",
    timeStyle:"short"
  }).format(d);
}

function updateDateUI() {
  const today = localISODate();
  datePicker.min = MIN_DATE;
  datePicker.max = today;
  datePicker.value = selectedDate;
  prevDay.disabled = selectedDate <= MIN_DATE;
  nextDay.disabled = selectedDate >= today;
  selectedDayText.textContent = prettySelectedDate(selectedDate);

  const { monthFolder } = dateParts(selectedDate);
  storagePath.textContent = `${monthFolder} · filtrando ${selectedDate}`;
}

function showError(msg) {
  errorBox.hidden = false;
  errorBox.textContent = msg;
  state.textContent = "Error";
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function render() {
  const n = files.length;
  const pages = Math.max(1, Math.ceil(n / PAGE_SIZE));
  page = Math.min(page, pages);

  const start = (page - 1) * PAGE_SIZE;
  const rows = files.slice(start, start + PAGE_SIZE);

  total.textContent = `${n} foto${n === 1 ? "" : "s"} del ${selectedDate}`;
  range.textContent = n
    ? `Mostrando ${start + 1}–${Math.min(start + PAGE_SIZE, n)} · Página ${page} de ${pages}`
    : "";

  gallery.innerHTML = rows.length
    ? rows.map((f, i) => `
      <article class="card">
        <button class="photo" type="button" data-index="${start + i}" aria-label="Abrir ${esc(f.name)}">
          <img src="${f.url}" alt="${esc(f.name)}" loading="lazy">
        </button>
        <div class="info">
          <div class="name" title="${esc(f.name)}">${esc(f.name)}</div>
          <div class="date">${fmt(f.created)}</div>
          <div class="folder" title="${esc(f.folder)}">${esc(f.folder)}</div>
        </div>
      </article>
    `).join("")
    : `<div class="empty">No hay fotos para el <strong>${esc(selectedDate)}</strong>.</div>`;

  pager.innerHTML = "";
  if (n <= PAGE_SIZE) return;

  const add = (txt, p, disabled = false, active = false) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = txt;
    b.disabled = disabled;
    if (active) b.classList.add("active");
    b.addEventListener("click", () => {
      page = p;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    pager.appendChild(b);
  };

  add("Anterior", Math.max(1, page - 1), page === 1);
  let a = Math.max(1, page - 2);
  let z = Math.min(pages, a + 4);
  a = Math.max(1, z - 4);
  for (let p = a; p <= z; p++) add(String(p), p, false, p === page);
  add("Siguiente", Math.min(pages, page + 1), page === pages);
}

async function listRecursive(folderRef) {
  const foundItems = [];
  const pending = [folderRef];

  while (pending.length) {
    const current = pending.shift();
    const result = await listAll(current);
    foundItems.push(...result.items);
    pending.push(...result.prefixes);
  }
  return foundItems;
}

async function buildFile(item, monthFolder) {
  const cached = fileCache.get(item.fullPath);
  if (cached) return cached;

  const [metadata, url] = await Promise.all([
    getMetadata(item),
    getDownloadURL(item)
  ]);

  const parts = item.fullPath.split("/");
  parts.pop();
  const monthParts = monthFolder.split("/");
  const folder = parts.slice(monthParts.length).join("/") || monthFolder;

  const data = {
    name: item.name,
    fullPath: item.fullPath,
    folder,
    url,
    created: metadata.timeCreated || metadata.updated || ""
  };

  fileCache.set(item.fullPath, data);
  return data;
}

function itemBelongsToDate(item, compactDate) {
  const path = item.fullPath.toUpperCase();
  // Estructura actual: ENT-20260831_104204-JUAN/...
  return path.includes(`ENT-${compactDate}`) ||
         path.includes(`/${compactDate}_`) ||
         path.includes(`/${compactDate}/`);
}

async function findItemsForDate(monthFolder, compactDate) {
  const monthRef = ref(storage, monthFolder);
  const monthListing = await listAll(monthRef);
  const matchingFolders = monthListing.prefixes.filter(prefix =>
    itemBelongsToDate(prefix, compactDate)
  );

  const nestedGroups = await Promise.all(matchingFolders.map(listRecursive));
  const nestedItems = nestedGroups.flat();

  // Por compatibilidad, también contempla archivos sueltos en el mes cuyo nombre
  // contenga la fecha seleccionada.
  const directItems = monthListing.items.filter(item =>
    itemBelongsToDate(item, compactDate)
  );

  return [...directItems, ...nestedItems];
}

async function load() {
  if (busy) return;

  busy = true;
  clearError();
  updateDateUI();
  const requestedDate = selectedDate;
  const { compact, monthFolder } = dateParts(requestedDate);

  state.textContent = `Buscando ${requestedDate}…`;
  gallery.innerHTML = '<div class="empty">Buscando fotos del día seleccionado…</div>';
  pager.innerHTML = "";

  try {
    if (!appFirebase) {
      appFirebase = initializeApp(firebaseConfig);
      storage = getStorage(appFirebase);
    }

    const allItems = await findItemsForDate(monthFolder, compact);

    // Si el usuario cambió de fecha mientras esperaba Firebase, descarta esta carga.
    if (requestedDate !== selectedDate) return;

    state.textContent = `${allItems.length} archivos encontrados · cargando imágenes…`;
    const result = await Promise.all(allItems.map(item => buildFile(item, monthFolder)));

    result.sort((a, b) =>
      (new Date(b.created).getTime() || 0) -
      (new Date(a.created).getTime() || 0)
    );

    files = result;
    page = 1;
    render();

    state.textContent = `Conectado · ${new Date().toLocaleTimeString("es-MX", {
      hour:"2-digit",
      minute:"2-digit"
    })}`;
  } catch (err) {
    console.error(err);
    if (requestedDate !== selectedDate) return;

    const code = err?.code ? `\nCódigo: ${err.code}` : "";
    const msg = err?.message ? `\nDetalle: ${err.message}` : "";

    showError(
      `No se pudo leer Firebase Storage para ${requestedDate}.${code}${msg}\n\n` +
      `Ruta consultada: ${monthFolder}`
    );

    files = [];
    total.textContent = "No se pudo cargar";
    range.textContent = "";
    gallery.innerHTML = '<div class="empty">Revisa el diagnóstico de arriba.</div>';
  } finally {
    busy = false;
  }
}

async function setSelectedDate(value) {
  const normalized = clampDate(value);
  if (normalized === selectedDate && files.length) return;
  selectedDate = normalized;
  updateDateUI();
  await load();
}

datePicker.addEventListener("change", () => setSelectedDate(datePicker.value));
prevDay.addEventListener("click", () => setSelectedDate(moveDate(selectedDate, -1)));
nextDay.addEventListener("click", () => setSelectedDate(moveDate(selectedDate, 1)));
todayBtn.addEventListener("click", () => setSelectedDate(localISODate()));

gallery.addEventListener("click", e => {
  const btn = e.target.closest(".photo");
  if (!btn) return;
  const f = files[Number(btn.dataset.index)];
  if (!f) return;
  window.open(f.url, "_blank", "noopener,noreferrer");
});

$("#closeViewer").addEventListener("click", () => {
  viewer.hidden = true;
  viewerImg.src = "";
});

viewer.addEventListener("click", e => {
  if (e.target === viewer) {
    viewer.hidden = true;
    viewerImg.src = "";
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !viewer.hidden) {
    viewer.hidden = true;
    viewerImg.src = "";
  }
});

selectedDate = clampDate(localISODate());
updateDateUI();
load();
setInterval(load, REFRESH_MS);
