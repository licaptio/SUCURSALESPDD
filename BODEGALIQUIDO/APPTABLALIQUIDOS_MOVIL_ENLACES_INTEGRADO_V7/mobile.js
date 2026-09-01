import { cargarProveedoresAutorizados, cargarEquivalencias, guardarEquivalencia, prepararCatalogoDiario, catalogoRequiereSincronizacionHoy, buscarProductoActivoFirebasePorCodigo, filtrarProductosCatalogo, sugerirProductosPorDescripcion } from './configuracion.js';
import { cargarFacturasOrigen, filtrarFacturasPendientesParaZapata } from './facturas.js';
import { prepararArticulosEntrada, generarEntradaZapata } from './entradas.js';

let proveedores=[]; let equivalencias=[]; let facturas=[]; let factura=null; let articulos=[]; let productos=[]; let productosListos=false; let indiceArticulo=null; let productoElegido=null; let scannerStream=null; let scannerTimer=null; let facingMode='environment'; let modoBusqueda='sugerencia';
const $=id=>document.getElementById(id);

document.addEventListener('DOMContentLoaded',()=>{ configurar(); iniciarAplicacion(); });

function configurar(){
  $('btnRefrescar').onclick=()=>cargarTodo(true);
  $('buscarFactura').oninput=pintarFacturas;
  $('btnVolver').onclick=()=>mostrarVista('vistaFacturas');
  $('btnVolverFactura').onclick=()=>{mostrarVista('vistaFactura'); cerrarScanner(); cerrarEquivalencia();};
  $('btnAutorizarEntrada').onclick=autorizarEntrada;
  $('buscarProducto').oninput=debounce(()=>{ modoBusqueda='manual'; buscarProductoManual(); },100);
  $('btnLimpiarBusqueda').onclick=()=>{ $('buscarProducto').value=''; modoBusqueda='sugerencia'; mostrarSugerenciasDescripcion(); $('buscarProducto').focus(); };
  $('btnCamara').onclick=abrirScanner;
  $('btnCerrarScanner').onclick=cerrarScanner;
  $('btnCambiarCamara').onclick=async()=>{ facingMode=facingMode==='environment'?'user':'environment'; await iniciarCamara(); };
  $('btnReintentarCatalogo').onclick=iniciarAplicacion;
  $('cantidadEntrada').oninput=syncFactor;
  $('factorConversion').oninput=syncCantidad;
  $('btnGuardarEnlace').onclick=guardarEnlace;
  $('btnCerrarEquivalencia').onclick=cerrarEquivalencia;
  $('btnCambiarProductoModal').onclick=()=>{ cerrarEquivalencia(); productoElegido=null; $('productoElegido').classList.add('oculto'); modoBusqueda='manual'; $('buscarProducto').value=''; buscarProductoManual(); $('buscarProducto').focus(); };
}

async function iniciarAplicacion(){
  const requiereSync=catalogoRequiereSincronizacionHoy();
  bloquearPorCatalogo(
    requiereSync?'Actualizando catálogo del día…':'Preparando catálogo local…',
    requiereSync?'Descargando todos los productos activos. Esto se hace automáticamente una sola vez por día.':'Usando el catálogo descargado hoy.'
  );
  try{
    productosListos=false;
    const resultado=await prepararCatalogoDiario();
    productos=resultado.productos;
    productosListos=true;
    $('catalogGateTitle').textContent=resultado.sincronizadoAhora?'Catálogo del día listo':'Catálogo local listo';
    $('catalogGateText').textContent=resultado.sincronizadoAhora?'Productos activos actualizados y guardados en este dispositivo.':'No fue necesario volver a descargar el catálogo completo.';
    $('catalogGateCount').textContent=`${productos.length.toLocaleString('es-MX')} productos activos disponibles`;
    document.querySelector('.catalog-progress-bar').classList.add('done');
    await dormir(resultado.sincronizadoAhora?450:120);
    $('catalogGate').classList.add('oculto');
    await cargarTodo(false);
  }catch(e){
    productosListos=false;
    $('catalogGateTitle').textContent='No se pudo preparar el catálogo';
    $('catalogGateText').textContent=e?.message||'Revisa la conexión a internet e inténtalo nuevamente.';
    $('catalogGateCount').textContent='La aplicación sigue bloqueada porque falta completar la actualización automática del día.';
    $('btnReintentarCatalogo').classList.remove('oculto');
    document.querySelector('.catalog-progress-bar').classList.add('error');
  }
}

function bloquearPorCatalogo(titulo,texto){
  $('catalogGate').classList.remove('oculto');
  $('btnReintentarCatalogo').classList.add('oculto');
  $('catalogGateTitle').textContent=titulo;
  $('catalogGateText').textContent=texto;
  $('catalogGateCount').textContent='Catálogo: sólo productos con activo = true';
  const bar=document.querySelector('.catalog-progress-bar');
  bar.classList.remove('done','error');
}

async function cargarTodo(mostrar=true){
  if(!productosListos) return;
  if(mostrar) loading('Actualizando facturas…');
  try{
    proveedores=await cargarProveedoresAutorizados();
    equivalencias=await cargarEquivalencias();
    const rfcs=proveedores.filter(p=>p.activo).map(p=>p.rfc_emisor);
    const origen=await cargarFacturasOrigen(1000,rfcs);
    facturas=await filtrarFacturasPendientesParaZapata(origen,proveedores);
    pintarFacturas();
  }catch(e){ toast(e.message||'No se pudieron cargar las facturas','error'); }
  finally{ if(mostrar) ocultarLoading(); }
}

function pintarFacturas(){
  const q=normalizar($('buscarFactura').value);
  const lista=q?facturas.filter(f=>normalizar(`${f.razon_social_emisor||''} ${f.rfc_emisor||''} ${f.serie||''} ${f.folio||''} ${f.uuid_cfdi||f.id||''}`).includes(q)):facturas;
  $('contadorFacturas').textContent=lista.length; const box=$('listaFacturas');
  if(!lista.length){box.innerHTML='<div class="empty">No hay facturas pendientes con ese filtro.</div>';return;}
  box.innerHTML=lista.map(f=>{const idx=facturas.indexOf(f); const arts=prepararArticulosEntrada(f,equivalencias); const total=arts.length; const enlazados=arts.filter(a=>a.equivalencia_encontrada).length; const pct=total?Math.round(enlazados*100/total):0; const estado=pct===100?'completo':pct>0?'proceso':'sin-iniciar'; const texto=pct===100?'Lista para entrada':pct>0?'En proceso':'Sin iniciar'; return `<article class="invoice-card"><div class="invoice-top"><h3>${esc(f.razon_social_emisor||f.rfc_emisor||'Proveedor')}</h3><span class="percent-badge ${estado}">${pct}%</span></div><div class="meta"><span>Folio ${esc([f.serie,f.folio].filter(Boolean).join('-')||'—')}</span><span>${esc(fecha(f))}</span></div><div class="link-summary"><div><b>${enlazados} de ${total}</b> artículos enlazados</div><span class="status-text ${estado}">${texto}</span></div><div class="progress-track"><div class="progress-fill ${estado}" style="width:${pct}%"></div></div><div class="row"><div><div class="subtle">Total factura</div><div class="money">${moneda(f.total)}</div></div><button class="primary abrir" data-i="${idx}">${pct===100?'Revisar':'Continuar'} →</button></div></article>`}).join('');
  box.querySelectorAll('.abrir').forEach(b=>b.onclick=()=>abrirFactura(Number(b.dataset.i)));
}

function abrirFactura(i){ factura=facturas[i]; articulos=prepararArticulosEntrada(factura,equivalencias); pintarFactura(); mostrarVista('vistaFactura'); window.scrollTo(0,0); }

function pintarFactura(){
  const enlazados=articulos.filter(a=>a.equivalencia_encontrada).length; $('progresoFactura').textContent=`${enlazados} / ${articulos.length}`;
  $('cabeceraFactura').innerHTML=`<h2>${esc(factura?.razon_social_emisor||'Factura')}</h2><div class="subtle">${esc(factura?.rfc_emisor||'')} · Folio ${esc([factura?.serie,factura?.folio].filter(Boolean).join('-')||'—')} · ${esc(fecha(factura))}</div>`;
  $('listaArticulos').innerHTML=articulos.map((a,i)=>`<article class="article-card ${a.equivalencia_encontrada?'linked':'pending'}"><div class="article-title">${esc(a.descripcion_factura||'Sin descripción')}</div><div class="article-code">${esc(a.codigo_factura||'SIN CÓDIGO')}</div><div class="article-meta"><span class="chip">Factura: ${num(a.cantidad_factura)} ${esc(a.unidad_factura||'')}</span>${a.equivalencia_encontrada?`<span class="chip ok">✓ Enlazado</span><span class="chip">${esc(a.codigo_interno)} · ${esc(a.descripcion_interna)}</span><span class="chip">Entra: ${num(a.cantidad_entrada)}</span>`:'<span class="chip warn">Pendiente de enlace</span>'}</div><div class="article-action"><button class="${a.equivalencia_encontrada?'secondary':'primary'} enlazar" data-i="${i}">${a.equivalencia_encontrada?'Cambiar enlace':'📦 Buscar en piso y enlazar'}</button></div></article>`).join('');
  $('listaArticulos').querySelectorAll('.enlazar').forEach(b=>b.onclick=()=>abrirEnlace(Number(b.dataset.i)));
  $('btnAutorizarEntrada').disabled=!articulos.length||articulos.some(a=>!a.equivalencia_encontrada);
}

function abrirEnlace(i){
  indiceArticulo=i; productoElegido=null; modoBusqueda='sugerencia';
  const a=articulos[i];
  $('conceptoActual').innerHTML=`<div class="desc">${esc(a.descripcion_factura)}</div><div class="code">Código factura: <b>${esc(a.codigo_factura||'SIN CÓDIGO')}</b></div><div class="article-meta"><span class="chip">Cantidad: ${num(a.cantidad_factura)} ${esc(a.unidad_factura||'')}</span>${a.equivalencia_encontrada?'<span class="chip ok">✓ Equivalencia existente editable</span>':''}</div>`;
  $('productoElegido').classList.add('oculto'); $('buscarProducto').value='';
  mostrarVista('vistaEnlace'); window.scrollTo(0,0);

  if(a.equivalencia_encontrada){
    const codigo=normalizar(a.codigo_interno||'');
    productoElegido=productos.find(p=>normalizar(p.codigoBarra||p.id||'')===codigo) || {
      id:a.codigo_interno,
      codigoBarra:a.codigo_interno,
      concepto:a.descripcion_interna,
      unidadMedidaSat:a.unidad_inventario
    };
    abrirModalEquivalencia(true);
  }else{
    mostrarSugerenciasDescripcion();
  }
}

function mostrarSugerenciasDescripcion(){
  const a=articulos[indiceArticulo]; if(!a)return;
  modoBusqueda='sugerencia'; $('buscarProducto').value='';
  const res=sugerirProductosPorDescripcion(productos,a.descripcion_factura||'');
  pintarProductos(res,true);
}

async function buscarProductoManual(){
  const q=$('buscarProducto').value.trim();
  if(!q){
    mostrarSugerenciasDescripcion();
    return;
  }

  let res=filtrarProductosCatalogo(productos,q);
  const codigoExactoLocal=productos.find(p=>normalizarCodigo(p.codigoBarra||p.id||'')===normalizarCodigo(q));
  const pareceCodigo=/^[A-Z0-9._\-]{5,}$/i.test(q) && !/\s/.test(q);

  // Si parece un código y no existe exactamente en IndexedDB, se consulta Firebase.
  if(pareceCodigo && !codigoExactoLocal){
    $('listaProductos').innerHTML='<div class="manual-hint">Código no encontrado en este dispositivo. Buscando automáticamente en Firebase…</div>';
    try{
      const remoto=await buscarProductoActivoFirebasePorCodigo(q);
      // El usuario pudo haber cambiado el texto mientras terminaba la consulta.
      if($('buscarProducto').value.trim()!==q) return;
      if(remoto){
        const clave=String(remoto.id||remoto.codigoBarra||'');
        const pos=productos.findIndex(p=>String(p.id||p.codigoBarra||'')===clave);
        if(pos>=0) productos[pos]=remoto; else productos.unshift(remoto);
        res=[remoto,...res.filter(p=>String(p.id||p.codigoBarra||'')!==clave)];
        pintarProductos(res,false);
        toast('Producto encontrado en Firebase y agregado al catálogo local','ok');
        return;
      }
    }catch(e){
      console.warn('Búsqueda automática en Firebase:',e);
    }
  }

  pintarProductos(res,false);
}

function pintarProductos(res,esSugerencia){
  const box=$('listaProductos');
  if(!res.length){ box.innerHTML=`<div class="empty">${esSugerencia?'No encontré una sugerencia clara por descripción. Usa la búsqueda manual o la cámara.':'Sin coincidencias. Cambia el texto o usa la cámara para leer el código.'}</div>`; return; }
  box.innerHTML=`${esSugerencia?'<div class="suggestion-label">Mejores coincidencias por descripción de factura</div>':''}${res.slice(0,40).map((p,i)=>`<div class="product ${esSugerencia&&i===0?'best-match':''}"><div><div class="product-title">${esc(p.concepto||'Sin descripción')}</div><b>${esc(p.codigoBarra||p.id||'')}</b><small>${esc([p.marca,p.departamento].filter(Boolean).join(' · '))}</small>${esSugerencia&&i===0?'<em>Primera sugerencia</em>':''}</div><button data-i="${i}">Elegir</button></div>`).join('')}`;
  box.querySelectorAll('button').forEach(b=>b.onclick=()=>elegirProducto(res[Number(b.dataset.i)]));
}

function elegirProducto(p){
  productoElegido=p;
  abrirModalEquivalencia(false);
}

function abrirModalEquivalencia(esEdicion=false){
  const a=articulos[indiceArticulo];
  if(!a||!productoElegido)return;
  $('equivProductoActual').innerHTML=`<div class="selected-label">PRODUCTO INTERNO ${esEdicion?'ACTUAL':'SELECCIONADO'}</div><h3>${esc(productoElegido.concepto||a.descripcion_interna||'Producto')}</h3><div class="article-code">${esc(productoElegido.codigoBarra||productoElegido.id||a.codigo_interno||'')}</div><div class="edit-note">Puedes cambiar el producto interno o ajustar la conversión.</div>`;
  $('cantidadFactura').value=numInput(a.cantidad_factura);
  $('factorConversion').value=numInput(Number(a.factor_conversion||1));
  $('cantidadEntrada').value=numInput(Number(a.cantidad_factura||0)*Number(a.factor_conversion||1));
  $('equivalenceModal').classList.remove('oculto');
}

function cerrarEquivalencia(){ $('equivalenceModal').classList.add('oculto'); }
function syncFactor(){const cf=Number($('cantidadFactura').value||0), ce=Number($('cantidadEntrada').value||0); if(cf>0)$('factorConversion').value=numInput(ce/cf);}
function syncCantidad(){const cf=Number($('cantidadFactura').value||0), factor=Number($('factorConversion').value||1); $('cantidadEntrada').value=numInput(cf*factor);}

async function guardarEnlace(){
  const a=articulos[indiceArticulo];
  if(!a||!productoElegido)return toast('Selecciona un producto','error');
  const texto=String(a.descripcion_factura||'').trim();
  if(!texto)return toast('La descripción/llave de factura es obligatoria','error');
  const ce=Number($('cantidadEntrada').value||0);
  const factor=Number($('factorConversion').value||0);
  if(!(ce>0)||!(factor>0))return toast('Factor y cantidad de entrada deben ser mayores a cero','error');

  loading(a.equivalencia_encontrada?'Actualizando equivalencia…':'Guardando equivalencia…');
  try{
    await guardarEquivalencia({
      id_anterior:a.equivalencia_id||'',
      texto_factura:texto,
      codigo_factura:$('codigoFacturaEnlace').value.trim(),
      descripcion_factura:texto,
      codigo_interno:String(productoElegido.codigoBarra||productoElegido.id||''),
      descripcion_interna:String(productoElegido.concepto||a.descripcion_interna||''),
      unidad_factura:$('unidadFactura').value.trim(),
      unidad_inventario:$('unidadInventario').value.trim(),
      factor_conversion:factor
    });
    equivalencias=await cargarEquivalencias();
    articulos=prepararArticulosEntrada(factura,equivalencias);
    cerrarEquivalencia();
    pintarFactura();
    mostrarVista('vistaFactura');
    toast(a.equivalencia_encontrada?'Equivalencia actualizada':'Equivalencia guardada','ok');
    const siguiente=articulos.findIndex((x,idx)=>idx>indiceArticulo&&!x.equivalencia_encontrada);
    if(siguiente>=0)setTimeout(()=>abrirEnlace(siguiente),350);
  }catch(e){toast(e.message||'No se pudo guardar','error');}
  finally{ocultarLoading();}
}

async function autorizarEntrada(){if(!factura||articulos.some(a=>!a.equivalencia_encontrada))return; if(!confirm('¿Autorizar la entrada de esta factura?'))return; loading('Generando entrada…'); try{await generarEntradaZapata(factura,articulos,'MOVIL_PISO'); toast('Entrada autorizada y guardada','ok'); await cargarTodo(false); mostrarVista('vistaFacturas');}catch(e){toast(e.message||'No se pudo generar la entrada','error');}finally{ocultarLoading();}}

async function abrirScanner(){if(!('mediaDevices'in navigator))return toast('Este navegador no permite cámara','error'); $('scannerModal').classList.remove('oculto'); await iniciarCamara();}
async function iniciarCamara(){cerrarStream(); $('scannerStatus').textContent='Iniciando cámara…'; try{scannerStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facingMode},width:{ideal:1280},height:{ideal:720}},audio:false}); $('scannerVideo').srcObject=scannerStream; await $('scannerVideo').play(); $('scannerStatus').textContent='Apunta al código de barras.'; iniciarDeteccion();}catch(e){$('scannerStatus').textContent='No se pudo abrir la cámara. Revisa el permiso.'; toast('Permiso de cámara no disponible','error');}}
function iniciarDeteccion(){clearInterval(scannerTimer); if(!('BarcodeDetector'in window)){ $('scannerStatus').textContent='Tu navegador no trae lector automático. Usa la búsqueda manual.'; return;} let detector; try{detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf']});}catch{detector=new BarcodeDetector();} scannerTimer=setInterval(async()=>{try{if($('scannerVideo').readyState<2)return; const codes=await detector.detect($('scannerVideo')); if(codes?.length){const code=codes[0].rawValue||''; if(code){$('buscarProducto').value=code; modoBusqueda='manual'; cerrarScanner(); buscarProductoManual(); toast(`Código leído: ${code}`);}}}catch{}},450);}
function cerrarScanner(){$('scannerModal').classList.add('oculto'); cerrarStream();}
function cerrarStream(){clearInterval(scannerTimer); scannerTimer=null; if(scannerStream){scannerStream.getTracks().forEach(t=>t.stop());scannerStream=null;} $('scannerVideo').srcObject=null;}
function mostrarVista(id){document.querySelectorAll('.vista').forEach(v=>v.classList.remove('activa'));$(id).classList.add('activa');}
function loading(t){$('loadingText').textContent=t||'Cargando…';$('loading').classList.remove('oculto');}
function ocultarLoading(){$('loading').classList.add('oculto');}
let toastTimer; function toast(t,tipo=''){clearTimeout(toastTimer);$('toast').textContent=t;$('toast').className=`toast ${tipo}`;toastTimer=setTimeout(()=>$('toast').classList.add('oculto'),2400);}
function dormir(ms){return new Promise(r=>setTimeout(r,ms));}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function normalizar(s){return String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,' ').trim();}
function normalizarCodigo(s){return String(s||'').trim().toUpperCase();}
function fecha(f){const x=f?.fecha_factura||f?.fecha||f?.fecha_emision||''; return String(x).slice(0,10)||'—';}
function moneda(n){return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n||0));}
function num(n){return new Intl.NumberFormat('es-MX',{maximumFractionDigits:4}).format(Number(n||0));}
function numInput(n){const x=Number(n||0);return Number.isFinite(x)?String(Math.round(x*1000000)/1000000):'0';}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
