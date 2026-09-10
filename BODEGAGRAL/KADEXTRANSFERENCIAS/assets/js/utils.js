export const $ = id => document.getElementById(id);
export const text = value => String(value ?? '').trim();
export const code = value => text(value).replace(/\s+/g,'');
export const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
export const escapeHtml = value => text(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

export function toDate(value){
  if(!value) return null;
  if(typeof value?.toDate === 'function') return value.toDate();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateMx(value){
  const d = toDate(value);
  return d ? d.toLocaleString('es-MX') : '-';
}

export function startOfDay(value){
  const d = new Date(`${value}T00:00:00`);
  return d;
}

export function endOfDay(value){
  const d = new Date(`${value}T23:59:59.999`);
  return d;
}
