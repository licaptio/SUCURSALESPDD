import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db } from './config.js';
import { enviarSolicitudIntercambioTelegram, enviarAutorizacionIntercambioTelegram } from './telegram.js';

let catalogo = [];
let carrito = [];
let productoActual = null;
let firmaBase64 = '';

const buscarInput = document.getElementById('buscar');
const sugerencias = document.getElementById('sugerencias');
const tbodyCarrito = document.getElementById('tbodyCarrito');

const DB_NAME = 'PROVSOFT_INTERCAMBIOS_ALLENDE2';
const DB_VERSION = 1;
const STORE_PRODUCTOS = 'catalogo_allende1';
const LS_BORRADOR = 'borrador_intercambio_a1';
const LS_AUTORIZACIONES_NOTIFICADAS = 'intercambios2_autorizados_notificados_a2';

function estado(txt){
  document.getElementById('estadoCarga').textContent = txt;
}

function barra(v){
  document.getElementById('barra').style.width = v + '%';
}

function normalizar(txt=''){
  return String(txt || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Z0-9 ]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function abrirDB(){

  return new Promise((resolve,reject)=>{

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e=>{

      const dbi = e.target.result;

      if(!dbi.objectStoreNames.contains(STORE_PRODUCTOS)){
        dbi.createObjectStore(
          STORE_PRODUCTOS,
          { keyPath:'id' }
        );
      }

    };

    req.onsuccess = ()=>resolve(req.result);

    req.onerror = ()=>reject(req.error);

  });

}

async function guardarCatalogoIndexedDB(data){

  const dbi = await abrirDB();

  return new Promise((resolve,reject)=>{

    const tx = dbi.transaction(
      STORE_PRODUCTOS,
      'readwrite'
    );

    const store = tx.objectStore(STORE_PRODUCTOS);

    store.clear();

    data.forEach(p=>{
      store.put(p);
    });

    tx.oncomplete = ()=>{
      dbi.close();
      resolve();
    };

    tx.onerror = ()=>{
      dbi.close();
      reject(tx.error);
    };

  });

}

async function cargarCatalogoIndexedDB(){

  const dbi = await abrirDB();

  return new Promise((resolve,reject)=>{

    const tx = dbi.transaction(
      STORE_PRODUCTOS,
      'readonly'
    );

    const store = tx.objectStore(STORE_PRODUCTOS);

    const req = store.getAll();

    req.onsuccess = ()=>{
      dbi.close();
      resolve(req.result || []);
    };

    req.onerror = ()=>{
      dbi.close();
      reject(req.error);
    };

  });

}

function textoProducto(p){

  return normalizar([
    p.codigoBarra,
    p.concepto,
    p.marca,
    p.departamento,
    ...(Array.isArray(p.codigosEquivalentes) ? p.codigosEquivalentes : [])
  ].join(' '));

}

async function cargarCatalogoFirebase(){

  estado('Descargando catálogo...');
  barra(35);

  const snap = await getDocs(
    collection(db,'productos')
  );

  const nuevoCatalogo = [];

  snap.forEach(docu=>{

    const d = docu.data();

    if(d.activo === true){

      nuevoCatalogo.push({
        id:docu.id,
        ...d
      });

    }

  });

  catalogo = nuevoCatalogo;

  estado('Guardando catálogo en IndexedDB...');
  barra(65);

  await guardarCatalogoIndexedDB(catalogo);

  barra(80);

}

function buscarProductos(){

  const q = normalizar(buscarInput.value);

  sugerencias.innerHTML = '';

  if(!q){
    sugerencias.style.display='none';
    return;
  }

  const tokens = q.split(' ').filter(Boolean);

  const resultados = catalogo
    .map(p=>{

      const texto = textoProducto(p);

      let score = 0;

      if(texto.includes(q)){
        score += 100;
      }

      tokens.forEach(t=>{
        if(texto.includes(t)){
          score += 30;
        }
      });

      return {
        ...p,
        score
      };

    })
    .filter(x=>x.score > 0)
    .sort((a,b)=>b.score - a.score)
    .slice(0,25);

  if(!resultados.length){

    sugerencias.innerHTML = `
      <div class="item">
        No se encontraron productos
      </div>
    `;

    sugerencias.style.display='block';
    return;
  }

  resultados.forEach(p=>{

    const div = document.createElement('div');

    div.className='item';

    div.innerHTML = `
      <b>${p.codigoBarra || ''}</b>
      <div>${p.concepto || ''}</div>
      <small>${p.marca || ''}</small>
    `;

    div.onclick = ()=>abrirProducto(p);

    sugerencias.appendChild(div);

  });

  sugerencias.style.display='block';

}

function abrirProducto(p){

  productoActual = p;

  document.getElementById('tituloProducto').textContent =
    p.concepto || 'Producto';

  document.getElementById('cantidad').value = 1;

  document.getElementById('modal').style.display='flex';

}

window.cerrarModal = function(){

  productoActual = null;

  document.getElementById('modal').style.display='none';

}

window.agregarProducto = function(){

  if(!productoActual){
    alert('Selecciona un producto');
    return;
  }

  const cantidad = Number(
    document.getElementById('cantidad').value
  );

  if(!cantidad || cantidad <= 0){
    alert('Cantidad inválida');
    return;
  }

  carrito.push({
    codigo: productoActual.codigoBarra || '',
    descripcion: productoActual.concepto || '',
    marca: productoActual.marca || '',
    cantidad_solicitada: cantidad,
    estado_item:'PENDIENTE'
  });

  renderCarrito();
  guardarTemporal(false);

  document.getElementById('modal').style.display='none';

  buscarInput.value='';
  sugerencias.innerHTML = '';
  sugerencias.style.display='none';
  productoActual = null;

}

function renderCarrito(){

  tbodyCarrito.innerHTML='';

  if(!carrito.length){

    tbodyCarrito.innerHTML = `
      <tr>
        <td colspan="4">
          Sin productos agregados
        </td>
      </tr>
    `;

    return;
  }

  carrito.forEach((x,i)=>{

    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${x.codigo}</td>
      <td>${x.descripcion}</td>
      <td>${x.cantidad_solicitada}</td>
      <td>
        <button onclick="eliminarItem(${i})">
          X
        </button>
      </td>
    `;

    tbodyCarrito.appendChild(tr);

  });

}

window.eliminarItem = function(i){

  carrito.splice(i,1);

  renderCarrito();

  guardarTemporal(false);

}

function formularioTieneDatos(){

  const solicitadoPor = document.getElementById('solicitadoPor').value.trim();

  return carrito.length > 0 || solicitadoPor || firmaBase64;

}

window.guardarTemporal = function(mostrarAlerta = true){

  if(!formularioTieneDatos()){

    localStorage.removeItem(LS_BORRADOR);

    if(mostrarAlerta){
      alert('No hay información para guardar');
    }

    return;

  }

  const data = {
    carrito,
    solicitadoPor:document.getElementById('solicitadoPor').value,
    firma:firmaBase64,
    guardado_en:new Date().toISOString()
  };

  localStorage.setItem(
    LS_BORRADOR,
    JSON.stringify(data)
  );

  if(mostrarAlerta){
    alert('Borrador guardado');
  }

}

function recuperarTemporal(){

  const local = localStorage.getItem(
    LS_BORRADOR
  );

  if(!local){
    renderCarrito();
    return;
  }

  try{

    const data = JSON.parse(local);

    const tieneDatos =
      (Array.isArray(data.carrito) && data.carrito.length > 0) ||
      (data.solicitadoPor && String(data.solicitadoPor).trim()) ||
      data.firma;

    if(!tieneDatos){
      localStorage.removeItem(LS_BORRADOR);
      renderCarrito();
      return;
    }

    if(!confirm('Se encontró un borrador pendiente. ¿Deseas recuperarlo?')){
      localStorage.removeItem(LS_BORRADOR);
      renderCarrito();
      return;
    }

    carrito = Array.isArray(data.carrito) ? data.carrito : [];

    document.getElementById('solicitadoPor').value =
      data.solicitadoPor || '';

    firmaBase64 = data.firma || '';

    renderCarrito();

    if(firmaBase64){
      setTimeout(()=>{
        cargarFirmaEnCanvas(firmaBase64);
      },300);
    }

  }catch(e){

    console.warn('Borrador dañado', e);
    localStorage.removeItem(LS_BORRADOR);
    renderCarrito();

  }

}

function folio(){
  return 'INT-A1-' + Date.now();
}

function limpiarFormularioDespuesDeGrabar(){

  localStorage.removeItem(LS_BORRADOR);

  carrito = [];
  productoActual = null;
  firmaBase64 = '';

  document.getElementById('solicitadoPor').value = '';
  document.getElementById('buscar').value = '';
  document.getElementById('cantidad').value = 1;
  document.getElementById('tituloProducto').textContent = '';

  sugerencias.innerHTML = '';
  sugerencias.style.display = 'none';

  document.getElementById('modal').style.display = 'none';

  const canvas = document.getElementById('firma');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);

  renderCarrito();

}

window.generarSolicitud = async function(){

  if(!carrito.length){
    alert('Agrega productos');
    return;
  }

  const solicitadoPor = document.getElementById(
    'solicitadoPor'
  ).value.trim();

  if(!solicitadoPor){
    alert('Captura quien solicita');
    return;
  }

  const f = folio();

  const documento = {
    folio:f,
    tienda_solicita:'ALLENDE 2',
    tienda_contesta:'ALLENDE 1',
    estado:'PENDIENTE_AUTORIZAR',
    solicitado_por:solicitadoPor,
    firma_solicitud:firmaBase64,
    fecha_solicitud:serverTimestamp(),
    inventario_aplicado:false,
    items:carrito
  };

  try{

    const referenciaIntercambio = doc(db,'TIENDAS','ALLENDE 2','intercambios2',f);
    await setDoc(referenciaIntercambio,documento);
    const documentoImpresion={...documento,fecha_impresion:new Date().toLocaleString('es-MX')};
    const pdfBlob=generarPDFIntercambio(documentoImpresion,'SOLICITUD');
    descargarBlob(pdfBlob,`${f}.pdf`);
    let telegramSolicitudEnviado=false; let errorTelegram=null;
    try{await enviarSolicitudIntercambioTelegram(pdfBlob,documentoImpresion);telegramSolicitudEnviado=true;try{await updateDoc(referenciaIntercambio,{telegram_solicitud_enviada:true,telegram_solicitud_enviada_local:new Date().toISOString()})}catch(e){console.warn(e)}}catch(e){console.error(e);errorTelegram=e}
    vigilarAutorizacionIntercambio(referenciaIntercambio,f);
    imprimir(documentoImpresion);
    limpiarFormularioDespuesDeGrabar();
    alert(telegramSolicitudEnviado?'Solicitud generada. El PDF fue enviado a Telegram.':'La solicitud se guardó y el PDF se descargó, pero no pudo enviarse a Telegram.\n\n'+(errorTelegram?.message||'Revisa la configuración de Telegram.'));

  }catch(err){

    console.error(err);
    alert('Error al generar la solicitud. Se conserva el borrador local.');
    guardarTemporal(false);

  }

}


function generarPDFIntercambio(docu,tipo='SOLICITUD'){
 const {jsPDF}=window.jspdf; const pdf=new jsPDF('p','mm','letter'); let y=15; const autorizado=tipo==='AUTORIZACION';
 pdf.setFont('helvetica','bold'); pdf.setFontSize(16); pdf.text(autorizado?'AUTORIZACIÓN DE INTERCAMBIO':'SOLICITUD DE INTERCAMBIO',105,y,{align:'center'}); y+=9;
 pdf.setFontSize(10); pdf.setFont('helvetica','normal'); pdf.text(`${docu.tienda_solicita||'ALLENDE 2'} → ${docu.tienda_contesta||'ALLENDE 1'}`,105,y,{align:'center'}); y+=12;
 const campos=[['Folio:',docu.folio||''],['Solicita:',docu.tienda_solicita||'ALLENDE 2'],['Contesta:',docu.tienda_contesta||'ALLENDE 1'],['Estado:',docu.estado||''],['Solicitado por:',docu.solicitado_por||''],['Autorizado por:',docu.autorizado_por||docu.contestado_por||''],['Fecha:',new Date().toLocaleString('es-MX')]];
 campos.forEach(([e,v])=>{if(!v)return; pdf.setFont('helvetica','bold'); pdf.text(e,15,y); pdf.setFont('helvetica','normal'); pdf.text(String(v).substring(0,90),50,y); y+=7;}); y+=4;
 pdf.setFont('helvetica','bold'); pdf.setFontSize(9); pdf.text('Código',15,y); pdf.text('Producto',48,y); pdf.text('Solicitada',150,y); pdf.text('Autorizada',175,y); y+=4; pdf.line(15,y,200,y); y+=6; pdf.setFont('helvetica','normal'); pdf.setFontSize(8);
 const items=Array.isArray(docu.items)?docu.items:[]; items.forEach(it=>{if(y>245){pdf.addPage();y=15;} pdf.text(String(it.codigo||'').substring(0,18),15,y); pdf.text(String(it.descripcion||'').substring(0,52),48,y); pdf.text(String(it.cantidad_solicitada??''),150,y); pdf.text(String(it.cantidad_autorizada??it.cantidad_aprobada??''),175,y); y+=6;});
 y+=8; pdf.setFont('helvetica','bold'); pdf.text(`Total productos: ${items.length}`,15,y); y+=7; pdf.text(`Total piezas solicitadas: ${items.reduce((t,i)=>t+Number(i.cantidad_solicitada||0),0)}`,15,y);
 if(autorizado){y+=7; pdf.text(`Total piezas autorizadas: ${items.reduce((t,i)=>t+Number(i.cantidad_autorizada??i.cantidad_aprobada??0),0)}`,15,y);}
 const firma=autorizado?(docu.firma_autorizacion||docu.firma_respuesta||''):(docu.firma_solicitud||''); y+=12; if(firma){try{pdf.text(autorizado?'Firma de autorización:':'Firma de solicitud:',15,y); y+=5; pdf.addImage(firma,'PNG',15,y,70,28);}catch(e){console.warn(e);}}
 return pdf.output('blob');
}
function descargarBlob(blob,nombre){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=nombre;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function autorizacionYaNotificada(folio){try{return JSON.parse(localStorage.getItem(LS_AUTORIZACIONES_NOTIFICADAS)||'[]').includes(folio)}catch{return false}}
function marcarAutorizacionNotificada(folio){try{const a=JSON.parse(localStorage.getItem(LS_AUTORIZACIONES_NOTIFICADAS)||'[]');if(!a.includes(folio))a.push(folio);localStorage.setItem(LS_AUTORIZACIONES_NOTIFICADAS,JSON.stringify(a.slice(-200)));}catch(e){console.warn(e)}}
function vigilarAutorizacionIntercambio(ref,folio){return onSnapshot(ref,async s=>{if(!s.exists())return;const d=s.data();const e=String(d.estado||'').toUpperCase();if(!['AUTORIZADO','APROBADO','INTERCAMBIO_AUTORIZADO'].includes(e)||autorizacionYaNotificada(folio))return;try{const docu={...d,folio:d.folio||folio};const blob=generarPDFIntercambio(docu,'AUTORIZACION');await enviarAutorizacionIntercambioTelegram(blob,docu);marcarAutorizacionNotificada(folio);try{await updateDoc(ref,{telegram_autorizacion_enviada:true,telegram_autorizacion_enviada_local:new Date().toISOString()})}catch(err){console.warn(err)}}catch(err){console.error(err)}},err=>console.warn(err));}

function imprimir(docu){

  const win = window.open('');

  win.document.write(`

    <html>
    <head>
      <title>${docu.folio}</title>

      <style>
        body{
          font-family:Arial;
          padding:20px;
        }

        h2{
          margin-bottom:5px;
        }

        table{
          width:100%;
          border-collapse:collapse;
          margin-top:20px;
        }

        td,th{
          border:1px solid #ccc;
          padding:8px;
          font-size:13px;
        }

        th{
          background:#f1f1f1;
        }
      </style>
    </head>

    <body>

      <img
        src="logo.png"
        style="width:220px"
        onerror="this.style.display='none'"
      >

      <h2>Solicitud de Intercambio</h2>

      <b>Folio:</b> ${docu.folio}<br>
      <b>Solicita:</b> ALLENDE 2<br>
      <b>Contesta:</b> ALLENDE 1<br>
      <b>Estado:</b> ${docu.estado}<br>
      <b>Fecha:</b> ${docu.fecha_impresion || ''}<br><br>

      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Producto</th>
            <th>Cantidad</th>
          </tr>
        </thead>

        <tbody>
          ${docu.items.map(x=>`
            <tr>
              <td>${x.codigo}</td>
              <td>${x.descripcion}</td>
              <td>${x.cantidad_solicitada}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <br><br>

      <b>Solicita:</b>
      ${docu.solicitado_por}

      <br><br>

      ${
        docu.firma_solicitud
        ? `<img src="${docu.firma_solicitud}" style="width:220px">`
        : `<div style="height:80px;border-bottom:1px solid #000;width:220px"></div>`
      }

      <script>
        window.print()
      <\/script>

    </body>
    </html>

  `);

}

function cargarFirmaEnCanvas(dataUrl){

  if(!dataUrl) return;

  const canvas = document.getElementById('firma');
  const ctx = canvas.getContext('2d');
  const img = new Image();

  img.onload = ()=>{
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
  };

  img.src = dataUrl;

}

function iniciarFirma(){

  const canvas = document.getElementById('firma');
  const ctx = canvas.getContext('2d');

  let dibujando = false;

  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  function pos(e){

    const r = canvas.getBoundingClientRect();

    return {
      x:(e.touches ? e.touches[0].clientX : e.clientX) - r.left,
      y:(e.touches ? e.touches[0].clientY : e.clientY) - r.top
    };

  }

  function start(e){

    e.preventDefault();

    dibujando = true;

    const p = pos(e);

    ctx.beginPath();
    ctx.moveTo(p.x,p.y);

  }

  function move(e){

    if(!dibujando) return;

    e.preventDefault();

    const p = pos(e);

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';

    ctx.lineTo(p.x,p.y);
    ctx.stroke();

    firmaBase64 = canvas.toDataURL();

  }

  function end(){

    if(!dibujando) return;

    dibujando = false;

    firmaBase64 = canvas.toDataURL();

    guardarTemporal(false);

  }

  canvas.addEventListener('mousedown',start);
  canvas.addEventListener('mousemove',move);
  canvas.addEventListener('mouseup',end);
  canvas.addEventListener('mouseleave',end);

  canvas.addEventListener('touchstart',start,{passive:false});
  canvas.addEventListener('touchmove',move,{passive:false});
  canvas.addEventListener('touchend',end);

}

async function init(){

  try{

    estado('Cargando catálogo local...');
    barra(10);

    const local = await cargarCatalogoIndexedDB();

    if(local.length){

      catalogo = local;

      estado(`Catálogo local cargado: ${local.length} productos`);
      barra(25);

    }else{

      estado('Sin catálogo local');

    }

    if(!local.length){

      try{

        await cargarCatalogoFirebase();

      }catch(errFirebase){

        console.warn('No se pudo descargar el catálogo desde Firebase', errFirebase);
        throw errFirebase;

      }

    }else{

      estado(`Usando catálogo local: ${local.length} productos`);
      barra(80);

    }

    estado('Preparando firma...');
    barra(85);

    iniciarFirma();

    estado('Recuperando borrador...');
    barra(90);

    recuperarTemporal();

    estado('Aplicación lista');
    barra(100);

    setTimeout(()=>{

      document.getElementById('loading').style.opacity='0';

      setTimeout(()=>{

        document.getElementById('loading').style.display='none';

      },400);

    },500);

  }catch(err){

    console.error(err);

    estado('Error cargando aplicación');

    alert(
      'Error cargando aplicación. Revisa consola.'
    );

  }

}

buscarInput.addEventListener(
  'input',
  buscarProductos
);

window.onload = init;
