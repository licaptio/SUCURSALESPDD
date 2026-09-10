import { db, collection, getDocs, query, orderBy, limit, startAfter } from './firebase.js';
import { RUTAS_MOVIMIENTOS } from './routes.js';
import { $, text, code, normalize, escapeHtml, toDate, dateMx } from './utils.js';

const PAGE_SIZE = 20;
const READ_CHUNK = 15;
const MAX_DOCUMENTS_PER_PAGE = 1500;

let catalogoCargado = [];
let catalogoPromise = null;
let codigoSeleccionado = '';
let paginas = [];
let paginaActual = -1;
let estadosRuta = new Map();
let movimientosPendientes = [];
let busquedaTerminada = false;
let documentosRevisadosTotal = 0;
let cargando = false;

function setStatus(message, type=''){
  const el = $('estado');
  el.textContent = message;
  el.className = `status ${type}`.trim();
}

function showSelectedProduct(product){
  const box = $('productoSeleccionado');
  if(!product){
    box.hidden = true;
    $('productoCodigo').textContent = '-';
    $('productoDescripcion').textContent = '-';
    return;
  }
  $('productoCodigo').textContent = product.codigo;
  $('productoDescripcion').textContent = product.descripcion;
  box.hidden = false;
}

function productFromDoc(docSnap){
  const data = docSnap.data() || {};
  if(data.activo === false) return null;

  const codigo = code(data.codigoBarra || data.codigo || docSnap.id);
  const descripcion = text(data.concepto || data.nombre || data.descripcion);
  if(!codigo || !descripcion) return null;

  return {
    codigo,
    descripcion,
    marca:text(data.marca),
    departamento:text(data.departamento),
    searchText:normalize(`${codigo} ${descripcion} ${data.marca || ''} ${data.departamento || ''}`)
  };
}

async function ensureProductCatalog(){
  if(catalogoCargado.length) return catalogoCargado;
  if(catalogoPromise) return catalogoPromise;

  catalogoPromise = (async()=>{
    setStatus('Cargando catálogo /productos por primera vez…','loading');
    const snap = await getDocs(collection(db,'productos'));
    catalogoCargado = snap.docs.map(productFromDoc).filter(Boolean)
      .sort((a,b)=>a.descripcion.localeCompare(b.descripcion,'es'));
    setStatus(`Catálogo listo: ${catalogoCargado.length} artículos.`,'ok');
    return catalogoCargado;
  })().catch(error=>{
    catalogoPromise = null;
    console.error(error);
    setStatus('No fue posible leer /productos. Revise config.js, permisos y consola.','error');
    throw error;
  });

  return catalogoPromise;
}

function queryTokens(raw){
  return normalize(raw).split(/\s+/).filter(Boolean);
}

function productMatches(product, raw){
  const tokens = queryTokens(raw);
  return tokens.length > 0 && tokens.every(token=>product.searchText.includes(token));
}

function productScore(product, raw){
  const q = normalize(raw);
  const codigo = normalize(product.codigo);
  const descripcion = normalize(product.descripcion);
  let score = 0;
  if(codigo === q) score += 10000;
  else if(codigo.startsWith(q)) score += 5000;
  else if(codigo.includes(q)) score += 2500;
  if(descripcion === q) score += 4000;
  else if(descripcion.startsWith(q)) score += 2000;
  for(const token of queryTokens(raw)){
    if(descripcion.split(/\s+/).includes(token)) score += 150;
    else if(descripcion.includes(token)) score += 60;
  }
  return score;
}

function findProducts(raw, max=15){
  return catalogoCargado.filter(p=>productMatches(p,raw))
    .sort((a,b)=>productScore(b,raw)-productScore(a,raw) || a.descripcion.localeCompare(b.descripcion,'es'))
    .slice(0,max);
}

function renderSuggestions(matches){
  const box = $('sugerencias');
  if(!matches.length){ box.hidden=true; box.innerHTML=''; return; }

  box.innerHTML = matches.map(x=>`
    <div class="suggestion" data-code="${escapeHtml(x.codigo)}">
      <div class="suggestion-code">${escapeHtml(x.codigo)}</div>
      <div class="suggestion-desc">${escapeHtml(x.descripcion)}</div>
      <div class="suggestion-meta">${escapeHtml([x.marca,x.departamento].filter(Boolean).join(' · '))}</div>
    </div>`).join('');

  box.hidden = false;
  box.querySelectorAll('[data-code]').forEach(el=>el.addEventListener('click',()=>{
    const item = catalogoCargado.find(x=>x.codigo===el.dataset.code);
    codigoSeleccionado = el.dataset.code;
    $('busqueda').value = item ? `${item.codigo} - ${item.descripcion}` : el.dataset.code;
    box.hidden = true;
    showSelectedProduct(item || null);
    setStatus('Artículo listo. Presione Buscar historial.','ok');
  }));
}

function selectedCodeFromInput(){
  const raw = text($('busqueda').value);
  const direct = code(raw.split(' - ')[0]);
  if(catalogoCargado.some(x=>x.codigo===direct)) return direct;
  if(codigoSeleccionado && catalogoCargado.some(x=>x.codigo===codigoSeleccionado)) return codigoSeleccionado;
  const matches = findProducts(raw,2);
  return matches.length===1 ? matches[0].codigo : '';
}

function createRouteState(route){
  return {
    route,
    buffer:[],
    position:0,
    cursor:null,
    exhausted:false,
    failed:false,
    reads:0
  };
}

function resetPagination(){
  paginas = [];
  paginaActual = -1;
  estadosRuta = new Map(RUTAS_MOVIMIENTOS.map(route=>[route.id,createRouteState(route)]));
  movimientosPendientes = [];
  busquedaTerminada = false;
  documentosRevisadosTotal = 0;
}

async function fillRoute(state){
  if(state.exhausted || state.failed || state.position < state.buffer.length) return;

  try{
    const ref = collection(db,...state.route.path);
    const parts = [ref, orderBy(state.route.campoFecha,'desc')];
    if(state.cursor) parts.push(startAfter(state.cursor));
    parts.push(limit(READ_CHUNK));

    const snap = await getDocs(query(...parts));
    state.buffer = snap.docs;
    state.position = 0;
    state.reads += snap.size;
    state.cursor = snap.docs.at(-1) || state.cursor;
    if(snap.size < READ_CHUNK) state.exhausted = true;
  }catch(error){
    state.failed = true;
    state.exhausted = true;
    console.error(`Error en ${state.route.clave} (${state.route.tipo})`,error);
  }
}

function documentDate(docSnap, route){
  const data = docSnap.data() || {};
  const raw = data[route.campoFecha]
    || data.fecha_guardado_server
    || data.fecha_surtido_completo
    || data.fecha_guardado
    || data.fecha_server
    || data.fecha;
  const fecha = toDate(raw);
  return fecha ? fecha.getTime() : 0;
}

async function ensureRouteHeads(){
  await Promise.all([...estadosRuta.values()].map(fillRoute));
}

function newestRouteState(){
  let selected = null;
  let newest = -1;
  for(const state of estadosRuta.values()){
    if(state.position >= state.buffer.length) continue;
    const ms = documentDate(state.buffer[state.position],state.route);
    if(ms > newest){ newest = ms; selected = state; }
  }
  return selected;
}

function normalizeMatchingMovements(docSnap, route, selectedCode){
  const data = docSnap.data() || {};
  const fecha = toDate(
    data[route.campoFecha]
    || data.fecha_guardado_server
    || data.fecha_surtido_completo
    || data.fecha_guardado
    || data.fecha_server
    || data.fecha
  );
  if(!fecha) return [];

  const sourceItems = route.tipo==='SALIDA'
    ? (Array.isArray(data.detalle) ? data.detalle : [])
    : (Array.isArray(data.items) ? data.items : []);

  return sourceItems.filter(item=>code(item.codigo || item.codigoBarra)===selectedCode).map(item=>({
    tipo:route.tipo,
    fecha,
    fechaMs:fecha.getTime(),
    codigo:selectedCode,
    descripcion:text(item.nombre || item.concepto || catalogoCargado.find(x=>x.codigo===selectedCode)?.descripcion),
    cantidad:Number(route.tipo==='SALIDA'
      ? (item.cantidad_surtida ?? item.cantidad_solicitada ?? item.cantidad ?? 0)
      : (item.cantidad ?? item.cantidad_entrada ?? 0)),
    origen:text(route.tipo==='SALIDA'
      ? (data.almacen_origen || 'CEDIS MATRIZ')
      : (data.almacen_origen || data.proveedor || data.origen || 'CEDIS MATRIZ')),
    destino:text(route.tipo==='SALIDA'
      ? (data.sucursal_destino || route.clave)
      : (data.rutaId || route.clave)),
    folio:text(route.tipo==='SALIDA'
      ? (data.folio_surtido || data.folio_solicitud || data.folio || docSnap.id)
      : (data.folio || data.folio_entrada || docSnap.id)),
    responsable:text(route.tipo==='SALIDA'
      ? (data.quien_lleva || data.quien_surte || data.quien_captura || data.operador_captura || '')
      : (data.vendedorId || data.quien_captura || data.usuario || '')),
    documento:docSnap.ref.path
  }));
}

function allRoutesFinished(){
  return [...estadosRuta.values()].every(state=>
    state.failed || (state.exhausted && state.position>=state.buffer.length)
  );
}

async function calculateNextPage(){
  const page = [];
  let reviewedThisPage = 0;

  while(page.length < PAGE_SIZE && movimientosPendientes.length){
    page.push(movimientosPendientes.shift());
  }

  while(page.length < PAGE_SIZE && !busquedaTerminada && reviewedThisPage < MAX_DOCUMENTS_PER_PAGE){
    await ensureRouteHeads();
    const state = newestRouteState();

    if(!state){
      busquedaTerminada = true;
      break;
    }

    const docSnap = state.buffer[state.position++];
    reviewedThisPage++;
    documentosRevisadosTotal++;

    const matches = normalizeMatchingMovements(docSnap,state.route,codigoSeleccionado);
    for(const movement of matches){
      if(page.length < PAGE_SIZE) page.push(movement);
      else movimientosPendientes.push(movement);
    }

    if(allRoutesFinished() && !movimientosPendientes.length){
      busquedaTerminada = true;
    }
  }

  page.sort((a,b)=>b.fechaMs-a.fechaMs);
  return { movements:page, reviewed:reviewedThisPage };
}

async function startSearch(){
  if(cargando) return;
  const raw = text($('busqueda').value);
  if(!raw){ setStatus('Capture un SKU, código o descripción.','error'); return; }

  cargando = true;
  disableNavigation(true);
  try{
    await ensureProductCatalog();
    const selected = selectedCodeFromInput();
    if(!selected){
      const matches = findProducts(raw,15);
      renderSuggestions(matches);
      setStatus(matches.length ? 'Seleccione el artículo correcto de las sugerencias.' : 'No se encontró el artículo en /productos.','error');
      return;
    }

    codigoSeleccionado = selected;
    const product = catalogoCargado.find(x=>x.codigo===selected);
    $('busqueda').value = `${selected} - ${product?.descripcion || ''}`;
    $('sugerencias').hidden = true;
    showSelectedProduct(product || {codigo:selected, descripcion:''});
    resetPagination();
    clearTable();

    setStatus(`Calculando los 20 movimientos más recientes de ${selected}…`,'loading');
    const calculated = await calculateNextPage();
    paginas.push(calculated);
    paginaActual = 0;
    renderCurrentPage();
  }finally{
    cargando = false;
    disableNavigation(false);
  }
}

async function nextPage(){
  if(cargando) return;
  if(paginaActual + 1 < paginas.length){ paginaActual++; renderCurrentPage(); return; }
  if(busquedaTerminada) return;

  cargando = true;
  disableNavigation(true);
  try{
    setStatus(`Calculando página ${paginas.length+1}…`,'loading');
    const calculated = await calculateNextPage();
    if(calculated.movements.length){
      paginas.push(calculated);
      paginaActual = paginas.length-1;
    }else{
      busquedaTerminada = true;
    }
    renderCurrentPage();
  }finally{
    cargando = false;
    disableNavigation(false);
  }
}

function previousPage(){
  if(paginaActual>0){ paginaActual--; renderCurrentPage(); }
}

function renderCurrentPage(){
  const pageData = paginas[paginaActual];
  const list = pageData?.movements || [];
  const product = catalogoCargado.find(x=>x.codigo===codigoSeleccionado);

  $('tituloResultado').textContent = `Historial SKU ${codigoSeleccionado}`;
  $('subtituloResultado').textContent = `${product?.descripcion || 'Sin descripción'} · página ${paginaActual+1}`;

  if(!list.length){
    $('tbodyResultados').innerHTML='<tr><td colspan="9" class="empty">No se encontraron movimientos.</td></tr>';
  }else{
    $('tbodyResultados').innerHTML = list.map(m=>{
      const entry=m.tipo==='ENTRADA';
      return `<tr>
        <td>${escapeHtml(dateMx(m.fecha))}</td>
        <td class="${entry?'type-entry':'type-exit'}">${m.tipo}</td>
        <td>${escapeHtml(m.codigo)}</td>
        <td>${escapeHtml(m.descripcion)}</td>
        <td class="${entry?'qty-entry':'qty-exit'}">${entry?'+':'-'}${Number(m.cantidad||0)}</td>
        <td>${escapeHtml(m.origen)}</td>
        <td>${escapeHtml(m.destino)}</td>
        <td>${escapeHtml(m.folio)}</td>
        <td>${escapeHtml(m.responsable || '-')}</td>
      </tr>`;
    }).join('');
  }

  $('paginaTexto').textContent = `Página ${paginaActual+1}`;
  $('btnImprimir').disabled = !list.length;

  const failed=[...estadosRuta.values()].filter(x=>x.failed).length;
  if(!list.length && busquedaTerminada){
    setStatus('No existen más movimientos para este artículo.','ok');
  }else if(busquedaTerminada){
    setStatus(`Página ${paginaActual+1}. Fin del historial${failed ? `; ${failed} rutas presentaron error` : ''}.` , failed?'error':'ok');
  }else{
    setStatus(`Página ${paginaActual+1}: ${list.length} movimientos. Siguiente calculará el siguiente bloque.`,'ok');
  }
  updateButtons();
}

function updateButtons(){
  $('btnAnterior').disabled = cargando || paginaActual<=0;
  $('btnSiguiente').disabled = cargando || paginaActual<0 || (busquedaTerminada && paginaActual===paginas.length-1);
  $('btnBuscar').disabled = cargando;
}

function disableNavigation(value){
  $('btnBuscar').disabled=value;
  $('btnAnterior').disabled=value || paginaActual<=0;
  $('btnSiguiente').disabled=value || paginaActual<0;
}

function clearTable(){
  $('tbodyResultados').innerHTML='<tr><td colspan="9" class="empty">Calculando movimientos…</td></tr>';
  $('tituloResultado').textContent='Historial de movimientos';
  $('subtituloResultado').textContent='Procesando consulta.';
  $('paginaTexto').textContent='Página 0';
  $('btnImprimir').disabled=true;
}

function newSearch(){
  codigoSeleccionado='';
  $('busqueda').value='';
  $('sugerencias').hidden=true;
  showSelectedProduct(null);
  resetPagination();
  clearTable();
  $('tbodyResultados').innerHTML='<tr><td colspan="9" class="empty">No hay resultados.</td></tr>';
  $('subtituloResultado').textContent='Sin consulta.';
  setStatus('Capture un código o descripción y seleccione el artículo.');
  updateButtons();
  $('busqueda').focus();
}

let suggestionTimer=null;
function updateSuggestions(){
  codigoSeleccionado='';
  showSelectedProduct(null);
  clearTimeout(suggestionTimer);
  const raw=text($('busqueda').value);
  if(!raw){ $('sugerencias').hidden=true; return; }
  suggestionTimer=setTimeout(async()=>{
    try{ await ensureProductCatalog(); renderSuggestions(findProducts(raw,15)); }catch{}
  },180);
}

$('btnBuscar').addEventListener('click',startSearch);
$('btnLimpiar').addEventListener('click',newSearch);
$('btnAnterior').addEventListener('click',previousPage);
$('btnSiguiente').addEventListener('click',nextPage);
$('btnImprimir').addEventListener('click',()=>window.print());
$('busqueda').addEventListener('focus',()=>ensureProductCatalog().catch(()=>{}));
$('busqueda').addEventListener('input',updateSuggestions);
$('busqueda').addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();startSearch();} });
document.addEventListener('click',e=>{if(!e.target.closest('.search-field')) $('sugerencias').hidden=true;});

resetPagination();
updateButtons();
