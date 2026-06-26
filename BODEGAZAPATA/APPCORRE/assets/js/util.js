export const $ = (id) => document.getElementById(id);

export function fechaLocalISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function horaLocal(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function normalizarFecha(valor) {
  if (!valor) return "";
  if (typeof valor === "string") {
    const v = valor.trim();
    const m1 = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
    const m2 = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    return v.substring(0, 10);
  }
  if (valor?.toDate) return fechaLocalISO(valor.toDate());
  if (typeof valor?.seconds === "number") return fechaLocalISO(new Date(valor.seconds * 1000));
  return String(valor).trim().substring(0, 10);
}

export function normalizarCodigo(valor) {
  const s = String(valor ?? "").trim();
  if (!s) return "";
  const solo = s.replace(/\D/g, "");
  if (!solo) return s.toLowerCase();
  return solo.replace(/^0+/, "") || "0";
}

export function fmt(n) {
  return Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generarIdTemporal() {
  const d = new Date();
  return `TEMP-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}${String(d.getSeconds()).padStart(2,"0")}`;
}

export function debounce(fn, ms = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
