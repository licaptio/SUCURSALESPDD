import { db } from "./config.js";
import { enviarPDFTelegram } from "./telegram.js";
import {
  collection,
  doc as docRef,
  getDocs,
  query,
  where,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const APP_CONFIG = {
  COLECCION_PRODUCTOS: "productos",
  COLECCION_TIENDAS: "TIENDAS",
  SUBCOLECCION_MERMAS: "MERMAS"
};

let catalogo = [];
let carrito = [];
let productoSeleccionado = null;
let pasoActual = 1;
let firmaTieneContenido = false;
let reiniciandoFormulario = false;

const LS_BORRADOR = "provsoft_merma_borrador";
const DB_NAME = "provsoft_catalogo_mermas";
const STORE_PRODUCTOS = "productos";

window.addEventListener("load", iniciarApp);

async function iniciarApp(){
  actualizarConexion();
  window.addEventListener("online", actualizarConexion);
  window.addEventListener("offline", actualizarConexion);

  document.getElementById("folio").value = generarFolio();

  configurarBusqueda();
  configurarFirma();

  await cargarCatalogoLocal();

  if(catalogo.length === 0 && navigator.onLine){
    await descargarCatalogo(false);
  }

  recuperarBorrador();
  setInterval(guardarBorradorSilencioso, 5000);

  document.getElementById("loader").style.display = "none";
}

function actualizarConexion(){
  const el = document.getElementById("estadoConexion");
  if(navigator.onLine){
    el.textContent = "En línea";
    el.style.background = "rgba(0,160,80,.35)";
  }else{
    el.textContent = "Sin internet";
    el.style.background = "rgba(180,35,24,.45)";
  }
}

function generarFolio(){
  const tienda = document.getElementById("tienda")?.value || "TIENDA";
  const limpio = tienda.replace(/\s+/g,"").substring(0,8).toUpperCase();
  const f = new Date();
  const y = f.getFullYear();
  const m = String(f.getMonth()+1).padStart(2,"0");
  const d = String(f.getDate()).padStart(2,"0");
  const h = String(f.getHours()).padStart(2,"0");
  const min = String(f.getMinutes()).padStart(2,"0");
  const rnd = Math.floor(Math.random()*9000+1000);
  return `MER-${limpio}-${y}${m}${d}-${h}${min}-${rnd}`;
}

document.addEventListener("change", e=>{
  if(e.target.id === "tienda"){
    const folioActual = document.getElementById("folio").value;
    if(!folioActual || folioActual.includes("TIENDA")){
      document.getElementById("folio").value = generarFolio();
    }
    guardarBorradorSilencioso();
  }
});

function irPaso(n){
  if(!validarPaso(pasoActual,n)) return;

  pasoActual = n;

  document.querySelectorAll(".paso").forEach(p=>p.classList.remove("activo"));
  document.getElementById(`paso${n}`).classList.add("activo");

  document.querySelectorAll(".step").forEach(s=>s.classList.remove("active"));
  document.querySelector(`.step[data-step="${n}"]`).classList.add("active");

  if(n === 3) pintarRevision();
  if(n === 5) pintarFinal();

  guardarBorradorSilencioso();
}

function validarPaso(actual,siguiente){
  if(siguiente < actual) return true;

  if(actual === 1){
    const encargado = document.getElementById("encargado").value.trim();
    if(!encargado){
      alert("Captura el nombre del encargado.");
      return false;
    }
  }

  if(actual === 2){
    if(carrito.length === 0){
      alert("Agrega al menos un producto a la merma.");
      return false;
    }
  }

  if(actual === 4){
    if(!firmaTieneContenido){
      alert("Falta la firma del encargado.");
      return false;
    }
  }

  return true;
}

function abrirDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME,1);

    req.onupgradeneeded = e=>{
      const dbLocal = e.target.result;
      if(!dbLocal.objectStoreNames.contains(STORE_PRODUCTOS)){
        dbLocal.createObjectStore(STORE_PRODUCTOS,{keyPath:"id"});
      }
    };

    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}

async function guardarCatalogoLocal(productos){
  const dbLocal = await abrirDB();

  return new Promise((resolve,reject)=>{
    const tx = dbLocal.transaction(STORE_PRODUCTOS,"readwrite");
    const store = tx.objectStore(STORE_PRODUCTOS);

    store.clear();
    productos.forEach(p=>store.put(p));

    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}

async function cargarCatalogoLocal(){
  const dbLocal = await abrirDB();

  return new Promise((resolve,reject)=>{
    const tx = dbLocal.transaction(STORE_PRODUCTOS,"readonly");
    const store = tx.objectStore(STORE_PRODUCTOS);
    const req = store.getAll();

    req.onsuccess = ()=>{
      catalogo = req.result || [];
      resolve(catalogo);
    };

    req.onerror = ()=>reject(req.error);
  });
}

async function descargarCatalogo(manual=false){
  if(!navigator.onLine){
    alert("No hay internet para descargar catálogo.");
    return;
  }

  try{
    document.getElementById("loader").style.display = "flex";
    document.getElementById("loaderTexto").textContent = "Descargando catálogo activo...";

    const q = query(
      collection(db, APP_CONFIG.COLECCION_PRODUCTOS),
      where("activo","==",true)
    );

    const snap = await getDocs(q);

    catalogo = snap.docs.map(documento=>{
      const d = documento.data();

      return {
        id: documento.id,
        codigo: String(d.codigoBarra || documento.id),
        descripcion: String(d.concepto || ""),
        unidad: d.unidadMedidaSat || "PZA",
        costo: Number(d.costoSinImpuesto || 0),
        precio: Number(d.precioPublico || 0),
        departamento: String(d.departamento || ""),
        marca: String(d.marca || ""),
        activo: d.activo === true
      };
    });

    await guardarCatalogoLocal(catalogo);

    if(manual) alert(`Catálogo actualizado: ${catalogo.length} productos.`);
  }catch(err){
    console.error(err);
    alert("Error al descargar catálogo. Revisa nombre de colección y campo activo.");
  }finally{
    document.getElementById("loader").style.display = "none";
  }
}

function configurarBusqueda(){
  const input = document.getElementById("buscarProducto");
  input.addEventListener("input",()=>{
    buscarProductos(input.value.trim());
  });
}

function normalizar(txt){
  return String(txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

function buscarProductos(texto){
  const cont = document.getElementById("resultados");
  cont.innerHTML = "";

  if(!texto || texto.length < 2) return;

  const palabras = normalizar(texto).split(" ").filter(Boolean);

  const encontrados = catalogo
    .filter(p=>{
      const base = normalizar(`${p.codigo} ${p.descripcion} ${p.departamento} ${p.marca}`);
      return palabras.every(w=>base.includes(w));
    })
    .slice(0,25);

  if(encontrados.length === 0){
    cont.innerHTML = `<div class="resultado">Sin resultados.</div>`;
    return;
  }

  encontrados.forEach(p=>{
    const div = document.createElement("div");
    div.className = "resultado";
    div.innerHTML = `
      <strong>${p.descripcion}</strong><br>
      <small>Código: ${p.codigo} | Precio público: $${p.precio.toFixed(2)}</small>
    `;
    div.onclick = ()=>abrirModalProducto(p);
    cont.appendChild(div);
  });
}

function abrirModalProducto(producto){
  productoSeleccionado = producto;

  document.getElementById("modalTitulo").textContent = producto.descripcion;
  document.getElementById("modalCodigo").textContent = `Código: ${producto.codigo}`;
  document.getElementById("modalCantidad").value = "";
  document.getElementById("modalMotivo").value = "CADUCIDAD";
  document.getElementById("modalComentario").value = "";

  document.getElementById("modalProducto").classList.remove("oculto");
}

function cerrarModal(){
  productoSeleccionado = null;
  document.getElementById("modalProducto").classList.add("oculto");
}

function agregarProducto(){
  if(!productoSeleccionado) return;

  const cantidad = Number(document.getElementById("modalCantidad").value || 0);
  const motivo = document.getElementById("modalMotivo").value;
  const comentario = document.getElementById("modalComentario").value.trim();

  if(cantidad <= 0){
    alert("Captura una cantidad válida.");
    return;
  }

  const item = {
    itemId: `${productoSeleccionado.id}_${Date.now()}`,
    productoId: productoSeleccionado.id,
    codigo: productoSeleccionado.codigo,
    descripcion: productoSeleccionado.descripcion,
    unidad: productoSeleccionado.unidad,
    cantidad,
    costoUnitario: productoSeleccionado.costo,
    precioVenta: productoSeleccionado.precio,
    valorUnitario: productoSeleccionado.precio,
    subtotalCosto: cantidad * productoSeleccionado.costo,
    subtotalVenta: cantidad * productoSeleccionado.precio,
    subtotalPublico: cantidad * productoSeleccionado.precio,
    motivo,
    comentario
  };

  carrito.push(item);

  pintarCarrito();
  cerrarModal();

  document.getElementById("buscarProducto").value = "";
  document.getElementById("resultados").innerHTML = "";

  guardarBorradorSilencioso();
}

function pintarCarrito(){
  const cont = document.getElementById("carrito");
  cont.innerHTML = "";

  if(carrito.length === 0){
    cont.innerHTML = `<p>No hay productos agregados.</p>`;
    return;
  }

  carrito.forEach((item,index)=>{
    const div = document.createElement("div");
    div.className = "item-carrito";
    div.innerHTML = `
      <h4>${item.descripcion}</h4>
      <small>Código: ${item.codigo}</small>
      <small>Cantidad: ${item.cantidad} ${item.unidad}</small>
      <small>Motivo: ${item.motivo}</small>
      <small>Comentario: ${item.comentario || "Sin comentario"}</small>
      <small>Precio público: $${item.subtotalVenta.toFixed(2)}</small>
      <div class="acciones">
        <button onclick="eliminarItem(${index})">Eliminar</button>
      </div>
    `;
    cont.appendChild(div);
  });
}

function eliminarItem(index){
  if(!confirm("¿Eliminar este producto del carrito?")) return;
  carrito.splice(index,1);
  pintarCarrito();
  guardarBorradorSilencioso();
}

function calcularTotales(){
  return carrito.reduce((acc,item)=>{
    acc.piezas += Number(item.cantidad || 0);
    acc.costo += Number(item.subtotalCosto || 0);
    acc.venta += Number(item.subtotalVenta || 0);
    return acc;
  },{piezas:0,costo:0,venta:0});
}

function tablaProductosHTML(){
  let html = `
    <table class="tabla-resumen">
      <thead>
        <tr>
          <th>Código</th>
          <th>Producto</th>
          <th>Cant.</th>
          <th>Motivo</th>
          <th>Precio público</th>
        </tr>
      </thead>
      <tbody>
  `;

  carrito.forEach(i=>{
    html += `
      <tr>
        <td>${i.codigo}</td>
        <td>${i.descripcion}</td>
        <td>${i.cantidad}</td>
        <td>${i.motivo}</td>
        <td>$${i.subtotalVenta.toFixed(2)}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  return html;
}

function pintarRevision(){
  const t = calcularTotales();
  document.getElementById("resumenRevision").innerHTML = `
    <p><strong>Tienda:</strong> ${document.getElementById("tienda").value}</p>
    <p><strong>Encargado:</strong> ${document.getElementById("encargado").value}</p>
    <p><strong>Folio:</strong> ${document.getElementById("folio").value}</p>
    ${tablaProductosHTML()}
    <p><strong>Total piezas:</strong> ${t.piezas}</p>
    <p><strong>Total precio público:</strong> $${t.venta.toFixed(2)}</p>
  `;
}

function pintarFinal(){
  const t = calcularTotales();
  document.getElementById("resumenFinal").innerHTML = `
    <p><strong>Documento listo para generar.</strong></p>
    <p><strong>Folio:</strong> ${document.getElementById("folio").value}</p>
    <p><strong>Total artículos:</strong> ${carrito.length}</p>
    <p><strong>Total piezas:</strong> ${t.piezas}</p>
    <p><strong>Total precio público:</strong> $${t.venta.toFixed(2)}</p>
  `;
}

function configurarFirma(){
  const canvas = document.getElementById("firmaCanvas");
  const ctx = canvas.getContext("2d");
  let dibujando = false;

  function pos(e){
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x:(touch.clientX - rect.left) * (canvas.width / rect.width),
      y:(touch.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function iniciar(e){
    e.preventDefault();
    dibujando = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x,p.y);
  }

  function mover(e){
    if(!dibujando) return;
    e.preventDefault();

    const p = pos(e);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.lineTo(p.x,p.y);
    ctx.stroke();

    firmaTieneContenido = true;
    guardarBorradorSilencioso();
  }

  function terminar(){
    dibujando = false;
  }

  canvas.addEventListener("mousedown",iniciar);
  canvas.addEventListener("mousemove",mover);
  canvas.addEventListener("mouseup",terminar);
  canvas.addEventListener("mouseleave",terminar);

  canvas.addEventListener("touchstart",iniciar);
  canvas.addEventListener("touchmove",mover);
  canvas.addEventListener("touchend",terminar);
}

function limpiarFirma(){
  const canvas = document.getElementById("firmaCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  firmaTieneContenido = false;
  guardarBorradorSilencioso();
}

function obtenerFirmaBase64(){
  const canvas = document.getElementById("firmaCanvas");
  return firmaTieneContenido ? canvas.toDataURL("image/png") : null;
}

function cargarFirmaBase64(dataUrl){
  if(!dataUrl) return;

  const canvas = document.getElementById("firmaCanvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();

  img.onload = ()=>{
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    firmaTieneContenido = true;
  };

  img.src = dataUrl;
}

function formularioTieneDatos(){
  const encargado = document.getElementById("encargado").value.trim();
  const notas = document.getElementById("notas").value.trim();
  return encargado || notas || carrito.length > 0 || firmaTieneContenido || pasoActual > 1;
}

function obtenerDatosFormulario(){
  return {
    tienda:document.getElementById("tienda").value,
    encargado:document.getElementById("encargado").value.trim(),
    folio:document.getElementById("folio").value,
    notas:document.getElementById("notas").value.trim(),
    carrito,
    firma:obtenerFirmaBase64(),
    pasoActual,
    actualizadoLocal:new Date().toISOString()
  };
}

function guardarBorrador(){
  if(!formularioTieneDatos()){
    alert("No hay información para guardar.");
    return;
  }

  localStorage.setItem(LS_BORRADOR,JSON.stringify(obtenerDatosFormulario()));
  alert("Borrador guardado.");
}

function guardarBorradorSilencioso(){
  if(reiniciandoFormulario) return;

  try{
    if(!formularioTieneDatos()){
      localStorage.removeItem(LS_BORRADOR);
      return;
    }

    localStorage.setItem(LS_BORRADOR,JSON.stringify(obtenerDatosFormulario()));
  }catch(err){
    console.warn("No se pudo autosalvar.",err);
  }
}

function recuperarBorrador(){
  const raw = localStorage.getItem(LS_BORRADOR);

  if(!raw){
    pintarCarrito();
    return;
  }

  let b = null;

  try{
    b = JSON.parse(raw);
  }catch(err){
    localStorage.removeItem(LS_BORRADOR);
    pintarCarrito();
    return;
  }

  const tieneDatos =
    (b.encargado && String(b.encargado).trim()) ||
    (b.notas && String(b.notas).trim()) ||
    (Array.isArray(b.carrito) && b.carrito.length > 0) ||
    b.firma;

  if(!tieneDatos){
    localStorage.removeItem(LS_BORRADOR);
    pintarCarrito();
    return;
  }

  if(!confirm("Se encontró un borrador pendiente. ¿Deseas recuperarlo?")){
    localStorage.removeItem(LS_BORRADOR);
    pintarCarrito();
    return;
  }

  document.getElementById("tienda").value = b.tienda || "ALLENDE 1";
  document.getElementById("encargado").value = b.encargado || "";
  document.getElementById("folio").value = b.folio || generarFolio();
  document.getElementById("notas").value = b.notas || "";

  carrito = Array.isArray(b.carrito) ? b.carrito : [];
  pintarCarrito();

  setTimeout(()=>cargarFirmaBase64(b.firma),300);
}

function reiniciarFormularioDespuesDeGrabar(){
  reiniciandoFormulario = true;

  carrito = [];
  productoSeleccionado = null;
  pasoActual = 1;

  document.getElementById("encargado").value = "";
  document.getElementById("notas").value = "";
  document.getElementById("folio").value = generarFolio();
  document.getElementById("buscarProducto").value = "";
  document.getElementById("resultados").innerHTML = "";
  document.getElementById("resumenRevision").innerHTML = "";
  document.getElementById("resumenFinal").innerHTML = "";

  document.getElementById("modalCantidad").value = "";
  document.getElementById("modalComentario").value = "";
  document.getElementById("modalMotivo").value = "CADUCIDAD";
  document.getElementById("modalProducto").classList.add("oculto");

  const canvas = document.getElementById("firmaCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  firmaTieneContenido = false;

  pintarCarrito();

  document.querySelectorAll(".paso").forEach(p=>p.classList.remove("activo"));
  document.getElementById("paso1").classList.add("activo");

  document.querySelectorAll(".step").forEach(s=>s.classList.remove("active"));
  document.querySelector(`.step[data-step="1"]`).classList.add("active");

  localStorage.removeItem(LS_BORRADOR);

  setTimeout(()=>{
    reiniciandoFormulario = false;
    localStorage.removeItem(LS_BORRADOR);
  },300);
}

function construirDocumentoMerma(){
  const t = calcularTotales();
  const tienda = document.getElementById("tienda").value;
  const encargado = document.getElementById("encargado").value.trim();
  const folio = document.getElementById("folio").value;
  const notas = document.getElementById("notas").value.trim();

  return {
    folio,
    tienda,
    estado:"SOLICITADA",
    etapa:"PENDIENTE_AUDITORIA",

    tipoDocumento:"SOLICITUD_MERMA",
    tipoMovimientoPendiente:"SALIDA_MERMA",
    origen:"APP_MERMAS_TIENDA",

    solicitante:{
      nombre:encargado,
      firmaBase64:obtenerFirmaBase64(),
      fechaFirma:new Date().toISOString()
    },

    auditoria:{
      estado:"PENDIENTE",
      auditorNombre:null,
      firmaAuditorBase64:null,
      fechaAuditoria:null,
      comentarioAuditor:null
    },

    productos:carrito.map(i=>({
      productoId:i.productoId,
      codigo:i.codigo,
      descripcion:i.descripcion,
      unidad:i.unidad,
      cantidad:i.cantidad,
      costoUnitario:i.costoUnitario,
      costoUnitario:i.costoUnitario,
      precioVenta:i.precioVenta,
      valorUnitario:i.precioVenta,
      subtotalCosto:i.subtotalCosto,
      subtotalVenta:i.subtotalVenta,
      subtotalPublico:i.subtotalVenta,
      motivo:i.motivo,
      comentario:i.comentario || ""
    })),

    totales:{
      renglones:carrito.length,
      piezas:t.piezas,
      costoEstimado:t.costo,
      ventaEstimado:t.venta,
      precioPublicoEstimado:t.venta
    },

    notasAdicionales:notas,

    aplicadoInventario:false,
    movimientoInventarioId:null,

    creadoPor:encargado,
    creadoEnLocal:new Date().toISOString(),
    actualizadoEnLocal:new Date().toISOString(),

    creadoEn:serverTimestamp(),
    actualizadoEn:serverTimestamp(),

    historial:[
      {
        evento:"SOLICITUD_GENERADA",
        usuario:encargado,
        fechaLocal:new Date().toISOString(),
        comentario:"Documento creado por encargado de tienda."
      }
    ]
  };
}

async function generarSolicitud(){
  if(!navigator.onLine){
    alert("No hay internet. La solicitud queda guardada como borrador local.");
    guardarBorradorSilencioso();
    return;
  }

  const encargado = document.getElementById("encargado").value.trim();

  if(!encargado){
    alert("Falta nombre del encargado.");
    return;
  }

  if(carrito.length === 0){
    alert("No hay productos en la merma.");
    return;
  }

  if(!firmaTieneContenido){
    alert("Falta la firma del encargado.");
    return;
  }

  const tienda = document.getElementById("tienda").value;
  const folio = document.getElementById("folio").value;
  const documentoMerma = construirDocumentoMerma();

  try{
    document.getElementById("loader").style.display = "flex";
    document.getElementById("loaderTexto").textContent = "Generando solicitud de merma...";

    await setDoc(
      docRef(db, APP_CONFIG.COLECCION_TIENDAS, tienda, APP_CONFIG.SUBCOLECCION_MERMAS, folio),
      documentoMerma,
      { merge:true }
    );

    document.getElementById("loaderTexto").textContent = "Generando PDF...";
    const pdfBlob = generarPDF(documentoMerma);

    let telegramEnviado = false;
    let telegramError = null;

    try{
      document.getElementById("loaderTexto").textContent = "Enviando PDF a Telegram...";
      await enviarPDFTelegram(pdfBlob,{
        folio: documentoMerma.folio,
        tienda: documentoMerma.tienda,
        encargado: documentoMerma.solicitante.nombre,
        totalPiezas: documentoMerma.totales.piezas,
        totalPublico: documentoMerma.totales.precioPublicoEstimado
      });
      telegramEnviado = true;
    }catch(errorTelegram){
      telegramError = errorTelegram;
      console.error("La merma se guardó, pero Telegram falló:",errorTelegram);
    }

    descargarPDF(pdfBlob,`${documentoMerma.folio}.pdf`);
    reiniciarFormularioDespuesDeGrabar();

    if(telegramEnviado){
      alert("Solicitud de merma generada y PDF enviado a Telegram.");
    }else{
      alert(`La solicitud se guardó y el PDF se descargó, pero no pudo enviarse a Telegram.\n\n${telegramError?.message || "Revisa la configuración del servicio."}`);
    }
  }catch(err){
    console.error(err);
    alert("Error al generar la solicitud. El borrador queda guardado localmente.");
    guardarBorradorSilencioso();
  }finally{
    document.getElementById("loader").style.display = "none";
  }
}

function generarPDF(documentoMerma){
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p","mm","letter");

  let y = 15;

  pdf.setFont("helvetica","bold");
  pdf.setFontSize(15);
  pdf.text("COMPROBANTE DE SOLICITUD DE MERMA",105,y,{align:"center"});

  y += 8;
  pdf.setFontSize(10);
  pdf.setFont("helvetica","normal");
  pdf.text("Documento de levantamiento de merma",105,y,{align:"center"});

  y += 12;

  pdf.setFont("helvetica","bold");
  pdf.text("Folio:",15,y);
  pdf.setFont("helvetica","normal");
  pdf.text(documentoMerma.folio,45,y);

  y += 7;
  pdf.setFont("helvetica","bold");
  pdf.text("Tienda:",15,y);
  pdf.setFont("helvetica","normal");
  pdf.text(documentoMerma.tienda,45,y);

  y += 7;
  pdf.setFont("helvetica","bold");
  pdf.text("Solicita:",15,y);
  pdf.setFont("helvetica","normal");
  pdf.text(documentoMerma.solicitante.nombre,45,y);

  y += 7;
  pdf.setFont("helvetica","bold");
  pdf.text("Fecha:",15,y);
  pdf.setFont("helvetica","normal");
  pdf.text(new Date().toLocaleString("es-MX"),45,y);

  y += 10;

  pdf.setFont("helvetica","bold");
  pdf.text("Productos",15,y);
  y += 6;

  pdf.setFontSize(8);
  pdf.text("Código",15,y);
  pdf.text("Descripción",42,y);
  pdf.text("Cant.",130,y);
  pdf.text("Motivo",145,y);
  pdf.text("P. Público",178,y);

  y += 4;
  pdf.line(15,y,200,y);
  y += 5;

  pdf.setFont("helvetica","normal");

  documentoMerma.productos.forEach(p=>{
    if(y > 240){
      pdf.addPage();
      y = 15;
    }

    pdf.text(String(p.codigo).substring(0,16),15,y);
    pdf.text(String(p.descripcion).substring(0,45),42,y);
    pdf.text(String(p.cantidad),130,y);
    pdf.text(String(p.motivo).substring(0,18),145,y);
    pdf.text(`$${Number(p.subtotalVenta || p.subtotalPublico || 0).toFixed(2)}`,178,y);

    y += 6;

    if(p.comentario){
      pdf.setTextColor(90);
      pdf.text(`Comentario: ${String(p.comentario).substring(0,90)}`,42,y);
      pdf.setTextColor(0);
      y += 5;
    }
  });

  y += 6;

  pdf.setFont("helvetica","bold");
  pdf.text(`Total piezas: ${documentoMerma.totales.piezas}`,15,y);

  y += 6;
  pdf.text(`Precio público total: $${Number(documentoMerma.totales.ventaEstimado || documentoMerma.totales.precioPublicoEstimado || 0).toFixed(2)}`,15,y);

  y += 10;

  pdf.setFont("helvetica","bold");
  pdf.text("Notas adicionales:",15,y);
  y += 5;

  pdf.setFont("helvetica","normal");
  const notas = pdf.splitTextToSize(documentoMerma.notasAdicionales || "Sin notas adicionales.",180);
  pdf.text(notas,15,y);

  y += notas.length * 5 + 10;

  if(documentoMerma.solicitante.firmaBase64){
    pdf.setFont("helvetica","bold");
    pdf.text("Firma del solicitante:",15,y);
    y += 5;

    pdf.addImage(documentoMerma.solicitante.firmaBase64,"PNG",15,y,70,28);
    y += 33;

    pdf.line(15,y,85,y);
    y += 5;

    pdf.setFont("helvetica","normal");
    pdf.text(documentoMerma.solicitante.nombre,15,y);
  }

  y += 12;

  pdf.setFontSize(8);
  pdf.setTextColor(90);
  pdf.text("Este comprobante solo representa la solicitud levantada. La autorización final corresponde al auditor.",15,y);

  return pdf.output("blob");
}

function descargarPDF(blob,nombreArchivo){
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

window.irPaso = irPaso;
window.guardarBorrador = guardarBorrador;
window.descargarCatalogo = descargarCatalogo;
window.cerrarModal = cerrarModal;
window.agregarProducto = agregarProducto;
window.eliminarItem = eliminarItem;
window.limpiarFirma = limpiarFirma;
window.generarSolicitud = generarSolicitud;
