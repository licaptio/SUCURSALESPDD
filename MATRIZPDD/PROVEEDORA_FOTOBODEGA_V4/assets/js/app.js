import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getStorage,
  ref,
  listAll,
  getDownloadURL,
  getMetadata
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

const ROOT_FOLDER = "fotobodega/abarrotespdd/2026/08";
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

let files = [];
let page = 1;
let busy = false;
let appFirebase;
let storage;

// Cache durante la sesión para no volver a pedir metadata y URL
// de archivos que ya se cargaron antes.
const fileCache = new Map();

function esc(v) {
  return String(v).replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  })[c]);
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

  total.textContent = `${n} archivo${n === 1 ? "" : "s"}`;
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
    : `<div class="empty">No hay archivos dentro de esta carpeta ni de sus subcarpetas.</div>`;

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

  for (let p = a; p <= z; p++) {
    add(String(p), p, false, p === page);
  }

  add("Siguiente", Math.min(pages, page + 1), page === pages);
}

// Recorre todas las subcarpetas de forma recursiva.
// Ejemplo:
// /08/ENT-20260830_120410-JUAN/foto_01.jpg
// /08/ENT-20260830_120410-JUAN/foto_02.jpg
// /08/OTRA-CARPETA/foto_01.jpg
async function listRecursive(folderRef) {
  const foundItems = [];
  const pending = [folderRef];

  while (pending.length) {
    const current = pending.shift();
    const result = await listAll(current);

    foundItems.push(...result.items);

    for (const prefix of result.prefixes) {
      pending.push(prefix);
    }
  }

  return foundItems;
}

async function buildFile(item) {
  const cached = fileCache.get(item.fullPath);
  if (cached) return cached;

  const [metadata, url] = await Promise.all([
    getMetadata(item),
    getDownloadURL(item)
  ]);

  const parts = item.fullPath.split("/");
  parts.pop();

  const data = {
    name: item.name,
    fullPath: item.fullPath,
    folder: parts.slice(5).join("/") || ROOT_FOLDER,
    url,
    created: metadata.timeCreated || metadata.updated || ""
  };

  fileCache.set(item.fullPath, data);
  return data;
}

async function load() {
  if (busy) return;

  busy = true;
  clearError();
  state.textContent = "Buscando en todas las carpetas…";

  try {
    if (!appFirebase) {
      appFirebase = initializeApp(firebaseConfig);
      storage = getStorage(appFirebase);
    }

    const rootRef = ref(storage, ROOT_FOLDER);
    const allItems = await listRecursive(rootRef);

    state.textContent = `${allItems.length} archivos encontrados · cargando datos…`;

    const result = await Promise.all(allItems.map(buildFile));

    result.sort((a, b) =>
      (new Date(b.created).getTime() || 0) -
      (new Date(a.created).getTime() || 0)
    );

    files = result;
    render();

    state.textContent =
      `Conectado · ${new Date().toLocaleTimeString("es-MX", {
        hour:"2-digit",
        minute:"2-digit"
      })}`;
  } catch (err) {
    console.error(err);

    const code = err?.code ? `\nCódigo: ${err.code}` : "";
    const msg = err?.message ? `\nDetalle: ${err.message}` : "";

    showError(
      `No se pudo leer Firebase Storage.${code}${msg}\n\n` +
      `La V4 busca también dentro de TODAS las subcarpetas de ${ROOT_FOLDER}.`
    );

    if (!files.length) {
      total.textContent = "No se pudo cargar";
      range.textContent = "";
      gallery.innerHTML =
        '<div class="empty">Revisa el diagnóstico de arriba.</div>';
    }
  } finally {
    busy = false;
  }
}

gallery.addEventListener("click", e => {
  const btn = e.target.closest(".photo");
  if (!btn) return;

  const f = files[Number(btn.dataset.index)];
  if (!f) return;

  viewerImg.src = f.url;
  viewerText.textContent = `${f.name} · ${fmt(f.created)} · ${f.folder}`;
  viewer.hidden = false;
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

load();
setInterval(load, REFRESH_MS);
