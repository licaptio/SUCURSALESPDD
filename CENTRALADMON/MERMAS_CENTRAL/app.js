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
  TIENDA_CENTRAL: "CENTRAL",
  DESTINO_OPERATIVO: "MATRIZ",
  SUBCOLECCION_MERMAS: "MERMAS"
};

let catalogo = [];
let carrito = [];
let productoSeleccionado = null;
let indiceEdicion = null;
let pasoActual = 1;
let firmaTieneContenido = false;
let reiniciandoFormulario = false;

const LS_BORRADOR = "provsoft_merma_central_borrador";
const DB_NAME = "provsoft_catalogo_mermas_central";
const STORE_PRODUCTOS = "productos";
const LS_CATALOGO_FECHA = "provsoft_merma_central_catalogo_fecha";
const LS_PENDIENTES = "provsoft_merma_central_pendientes_firebase";
let sincronizandoPendientes = false;
let actualizandoCatalogoFondo = false;

window.addEventListener("load", iniciarApp);

async function iniciarApp(){
  actualizarConexion();
  window.addEventListener("online", async ()=>{
    actualizarConexion();
    await sincronizarAlVolverInternet();
  });
  window.addEventListener("offline", actualizarConexion);

  document.getElementById("tienda").value = APP_CONFIG.TIENDA_CENTRAL;
  document.getElementById("folio").value = generarFolio();

  configurarBusqueda();
  configurarFirma();

  const btnReintentar = document.getElementById("btnReintentarInicio");
  if(btnReintentar) btnReintentar.addEventListener("click", prepararCatalogoInicio);

  await prepararCatalogoInicio();
}

function actualizarLoader(titulo,texto,detalle="",error=false){
  const loader = document.getElementById("loader");
  const tituloEl = document.getElementById("loaderTitulo");
  const textoEl = document.getElementById("loaderTexto");
  const detalleEl = document.getElementById("loaderDetalle");
  const btn = document.getElementById("btnReintentarInicio");

  if(loader){
    loader.style.display = "flex";
    loader.classList.toggle("error",error);
  }
  if(tituloEl) tituloEl.textContent = titulo;
  if(textoEl) textoEl.textContent = texto;
  if(detalleEl) detalleEl.textContent = detalle;
  if(btn) btn.style.display = error ? "block" : "none";
}

async function prepararCatalogoInicio(){
  actualizarLoader(
    "Preparando Mermas CENTRAL",
    "Verificando catálogo local...",
    "La aplicación se abrirá cuando esté completamente lista."
  );

  try{
    await cargarCatalogoLocal();

    const hoy = new Date().toLocaleDateString("en-CA");
    const fechaCatalogo = localStorage.getItem(LS_CATALOGO_FECHA);
    const requiereActualizacion = catalogo.length === 0 || fechaCatalogo !== hoy;

    if(!requiereActualizacion){
      actualizarLoader(
        "Catálogo listo",
        `${catalogo.length.toLocaleString("es-MX")} productos disponibles.`,
        "Catálogo actualizado hoy. Iniciando aplicación..."
      );
      finalizarInicio();
      return;
    }

    if(!navigator.onLine){
      if(catalogo.length > 0){
        actualizarLoader(
          "Modo sin conexión",
          `${catalogo.length.toLocaleString("es-MX")} productos disponibles en el catálogo local.`,
          "Se usará la última copia guardada. La actualización diaria y las mermas pendientes se sincronizarán cuando vuelva internet."
        );
        finalizarInicio();
        return;
      }

      actualizarLoader(
        "Sin catálogo disponible",
        "Este equipo todavía no tiene un catálogo local guardado.",
        "Se necesita internet al menos una vez para descargar el catálogo inicial.",
        true
      );
      return;
    }

    actualizarLoader(
      "Actualizando catálogo diario",
      "Obteniendo productos activos desde Firebase...",
      "PROVSOFT se abrirá automáticamente cuando el catálogo de hoy esté guardado."
    );

    const ok = await descargarCatalogo(false,{mantenerLoader:true,modoInicio:true});

    if(!ok || catalogo.length === 0){
      actualizarLoader(
        "No se pudo preparar la aplicación",
        "La actualización diaria del catálogo no pudo completarse.",
        "Revisa la conexión y pulsa Reintentar.",
        true
      );
      return;
    }

    localStorage.setItem(LS_CATALOGO_FECHA,hoy);
    actualizarLoader(
      "Catálogo actualizado",
      `${catalogo.length.toLocaleString("es-MX")} productos activos guardados.`,
      "Actualización diaria completada. Iniciando aplicación..."
    );
    finalizarInicio();
    return;

  }catch(err){
    console.error("Error preparando catálogo inicial:",err);
    actualizarLoader(
      "Error al preparar PROVSOFT",
      "No fue posible leer o crear el catálogo local.",
      "Pulsa Reintentar. La aplicación seguirá bloqueada para evitar trabajar sin catálogo.",
      true
    );
  }
}

function finalizarInicio(){
  recuperarBorrador();
  setInterval(guardarBorradorSilencioso, 5000);
  setTimeout(()=>{
    const loader = document.getElementById("loader");
    if(loader) loader.style.display = "none";
  },450);

  if(navigator.onLine){
    setTimeout(()=>sincronizarPendientesFirebase(),700);
  }
}

function obtenerPendientes(){
  try{
    const raw = localStorage.getItem(LS_PENDIENTES);
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista : [];
  }catch(err){
    console.warn("No se pudieron leer pendientes:",err);
    return [];
  }
}

function guardarPendientes(lista){
  localStorage.setItem(LS_PENDIENTES,JSON.stringify(lista));
  actualizarConexion();
}

function actualizarConexion(){
  const el = document.getElementById("estadoConexion");
  if(!el) return;
  const pendientes = obtenerPendientes().length;

  if(navigator.onLine){
    el.textContent = pendientes > 0 ? `En línea · ${pendientes} pendiente${pendientes===1?"":"s"}` : "En línea";
    el.style.background = "rgba(0,160,80,.35)";
  }else{
    el.textContent = pendientes > 0 ? `Sin internet · ${pendientes} pendiente${pendientes===1?"":"s"}` : "Sin internet";
    el.style.background = "rgba(180,35,24,.45)";
  }
}

function documentoLocalSeguro(documento){
  return {
    ...documento,
    creadoEn:null,
    actualizadoEn:null,
    sincronizacion:{
      estado:"PENDIENTE_FIREBASE",
      guardadoLocalEn:new Date().toISOString()
    }
  };
}

function encolarPendienteFirebase(documento){
  const lista = obtenerPendientes();
  const local = documentoLocalSeguro(documento);
  const existente = lista.findIndex(x=>x?.documento?.folio === local.folio);
  const registro = {
    id:local.folio,
    intentos:0,
    ultimoError:null,
    creadoLocalEn:new Date().toISOString(),
    documento:local
  };

  if(existente >= 0) lista[existente] = registro;
  else lista.push(registro);
  guardarPendientes(lista);
}

async function subirDocumentoFirebase(documento){
  const docOnline = {
    ...documento,
    sincronizacion:{
      estado:"SINCRONIZADO",
      guardadoLocalEn:documento.sincronizacion?.guardadoLocalEn || null,
      sincronizadoEnLocal:new Date().toISOString()
    },
    creadoEn:serverTimestamp(),
    actualizadoEn:serverTimestamp()
  };

  await setDoc(
    docRef(db, APP_CONFIG.COLECCION_TIENDAS, APP_CONFIG.TIENDA_CENTRAL, APP_CONFIG.SUBCOLECCION_MERMAS, documento.folio),
    docOnline,
    { merge:true }
  );
}

async function sincronizarPendientesFirebase(){
  if(!navigator.onLine || sincronizandoPendientes) return;
  let lista = obtenerPendientes();
  if(lista.length === 0){
    actualizarConexion();
    return;
  }

  sincronizandoPendientes = true;
  actualizarConexion();

  try{
    for(const registro of [...lista]){
      if(!navigator.onLine) break;
      try{
        await subirDocumentoFirebase(registro.documento);

        try{
          const pdfBlob = generarPDF(registro.documento);
          await enviarPDFTelegram(pdfBlob,{
            folio: registro.documento.folio,
            tienda: registro.documento.tienda,
            encargado: registro.documento.solicitante?.nombre || "",
            totalPiezas: registro.documento.totales?.piezas || 0,
            totalPublico: registro.documento.totales?.precioPublicoEstimado || 0
          });
        }catch(errTelegram){
          console.warn("Firebase sincronizó; Telegram quedó sin enviar:",errTelegram);
        }

        lista = obtenerPendientes().filter(x=>x.id !== registro.id);
        guardarPendientes(lista);
      }catch(err){
        console.error(`No se pudo sincronizar ${registro.id}:`,err);
        lista = obtenerPendientes().map(x=>
          x.id === registro.id
            ? {...x,intentos:Number(x.intentos||0)+1,ultimoError:String(err?.message||err),ultimoIntentoEn:new Date().toISOString()}
            : x
        );
        guardarPendientes(lista);
      }
    }
  }finally{
    sincronizandoPendientes = false;
    actualizarConexion();
  }
}

async function actualizarCatalogoPendienteEnFondo(){
  if(!navigator.onLine || actualizandoCatalogoFondo) return;
  const hoy = new Date().toLocaleDateString("en-CA");
  if(localStorage.getItem(LS_CATALOGO_FECHA) === hoy) return;

  actualizandoCatalogoFondo = true;
  try{
    await descargarCatalogo(false,{mantenerLoader:false,modoInicio:false,silencioso:true});
  }finally{
    actualizandoCatalogoFondo = false;
  }
}

async function sincronizarAlVolverInternet(){
  await actualizarCatalogoPendienteEnFondo();
  await sincronizarPendientesFirebase();
}


function generarFolio(){
  const limpio = APP_CONFIG.TIENDA_CENTRAL;
  const f = new Date();
  const y = f.getFullYear();
  const m = String(f.getMonth()+1).padStart(2,"0");
  const d = String(f.getDate()).padStart(2,"0");
  const h = String(f.getHours()).padStart(2,"0");
  const min = String(f.getMinutes()).padStart(2,"0");
  const rnd = Math.floor(Math.random()*9000+1000);
  return `MER-${limpio}-${y}${m}${d}-${h}${min}-${rnd}`;
}

function irPaso(n){
  if(!validarPaso(pasoActual,n)) return;

  pasoActual = n;

  document.querySelectorAll(".paso").forEach(p=>p.classList.remove("activo"));
  const destino = document.getElementById(`paso${n}`);
  if(destino) destino.classList.add("activo");

  document.querySelectorAll(".step").forEach(s=>s.classList.remove("active"));
  const step = document.querySelector(`.step[data-step="${n}"]`);
  if(step) step.classList.add("active");

  if(n === 2){
    pintarCarrito();
    setTimeout(()=>document.getElementById("buscarProducto")?.focus(),80);
  }
  if(n === 3) pintarFinal();

  window.scrollTo({top:0,behavior:"smooth"});
  guardarBorradorSilencioso();
}

function validarPaso(actual,siguiente){
  if(siguiente < actual) return true;

  if(actual === 1){
    const encargado = document.getElementById("encargado").value.trim();
    if(!encargado){
      alert("Captura el nombre del encargado.");
      document.getElementById("encargado").focus();
      return false;
    }
  }

  if(actual === 2 && carrito.length === 0){
    alert("Agrega al menos un producto a la merma.");
    return false;
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

async function descargarCatalogo(manual=false,opciones={}){
  const { mantenerLoader=false, modoInicio=false, silencioso=false } = opciones;

  if(!navigator.onLine){
    if(manual) alert("No hay internet para descargar catálogo.");
    return false;
  }

  try{
    if(!silencioso){
      document.getElementById("loader").style.display = "flex";
      document.getElementById("loaderTexto").textContent = "Descargando catálogo activo...";
    }

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
    localStorage.setItem(LS_CATALOGO_FECHA,new Date().toLocaleDateString("en-CA"));

    if(catalogo.length === 0){
      throw new Error("Firebase devolvió un catálogo vacío.");
    }

    if(manual) alert(`Catálogo actualizado: ${catalogo.length} productos.`);
    return true;
  }catch(err){
    console.error(err);
    if(manual) alert("Error al descargar catálogo. Revisa conexión, colección y campo activo.");
    return false;
  }finally{
    if(!silencioso && !mantenerLoader && !modoInicio){
      document.getElementById("loader").style.display = "none";
    }
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
  indiceEdicion = null;

  document.getElementById("modalModo").textContent = "Agregar partida";
  document.getElementById("modalTitulo").textContent = producto.descripcion;
  document.getElementById("modalCodigo").textContent = `Código: ${producto.codigo}`;
  document.getElementById("modalCantidad").value = "";
  document.getElementById("modalMotivo").value = "CADUCIDAD";
  document.getElementById("modalComentario").value = "";
  document.getElementById("btnGuardarProducto").textContent = "Agregar a merma";

  document.getElementById("modalProducto").classList.remove("oculto");
  setTimeout(()=>document.getElementById("modalCantidad")?.focus(),80);
}

function editarItem(index){
  const item = carrito[index];
  if(!item) return;

  indiceEdicion = index;
  productoSeleccionado = {
    id:item.productoId,
    codigo:item.codigo,
    descripcion:item.descripcion,
    unidad:item.unidad,
    costo:Number(item.costoUnitario || 0),
    precio:Number(item.precioVenta || item.valorUnitario || 0)
  };

  document.getElementById("modalModo").textContent = "Modificar partida";
  document.getElementById("modalTitulo").textContent = item.descripcion;
  document.getElementById("modalCodigo").textContent = `Código: ${item.codigo}`;
  document.getElementById("modalCantidad").value = item.cantidad;
  document.getElementById("modalMotivo").value = item.motivo || "CADUCIDAD";
  document.getElementById("modalComentario").value = item.comentario || "";
  document.getElementById("btnGuardarProducto").textContent = "Guardar cambios";

  document.getElementById("modalProducto").classList.remove("oculto");
  setTimeout(()=>document.getElementById("modalCantidad")?.focus(),80);
}

function cerrarModal(){
  productoSeleccionado = null;
  indiceEdicion = null;
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
    itemId: indiceEdicion !== null ? carrito[indiceEdicion].itemId : `${productoSeleccionado.id}_${Date.now()}`,
    productoId: productoSeleccionado.id,
    codigo: productoSeleccionado.codigo,
    descripcion: productoSeleccionado.descripcion,
    unidad: productoSeleccionado.unidad,
    cantidad,
    costoUnitario: Number(productoSeleccionado.costo || 0),
    precioVenta: Number(productoSeleccionado.precio || 0),
    valorUnitario: Number(productoSeleccionado.precio || 0),
    subtotalCosto: cantidad * Number(productoSeleccionado.costo || 0),
    subtotalVenta: cantidad * Number(productoSeleccionado.precio || 0),
    subtotalPublico: cantidad * Number(productoSeleccionado.precio || 0),
    motivo,
    comentario
  };

  if(indiceEdicion !== null){
    carrito[indiceEdicion] = item;
  }else{
    carrito.push(item);
  }

  pintarCarrito();
  cerrarModal();

  document.getElementById("buscarProducto").value = "";
  document.getElementById("resultados").innerHTML = "";
  document.getElementById("buscarProducto")?.focus();
  guardarBorradorSilencioso();
}

function pintarCarrito(){
  const cont = document.getElementById("carrito");
  if(!cont) return;
  cont.innerHTML = "";

  const t = calcularTotales();
  const conteo = document.getElementById("carritoConteo");
  if(conteo) conteo.textContent = `${carrito.length} ${carrito.length === 1 ? "partida" : "partidas"}`;
  const totales = document.getElementById("posTotales");
  if(totales) totales.innerHTML = `Piezas: ${t.piezas}<br>Precio público: $${t.venta.toFixed(2)}`;

  if(carrito.length === 0){
    cont.innerHTML = `<div class="carrito-vacio"><strong>Carrito vacío</strong><br><small>Busca un producto arriba para comenzar.</small></div>`;
    return;
  }

  carrito.forEach((item,index)=>{
    const div = document.createElement("div");
    div.className = "item-carrito";
    div.innerHTML = `
      <div class="item-main">
        <h4>${item.descripcion}</h4>
        <small>Código: ${item.codigo}</small>
      </div>
      <div class="item-dato"><strong>Cantidad</strong>${item.cantidad} ${item.unidad}</div>
      <div class="item-dato"><strong>Motivo</strong>${item.motivo}</div>
      <div class="item-dato item-comentario"><strong>Comentario</strong>${item.comentario || "Sin comentario"}</div>
      <div class="item-dato item-precio"><strong>P. público</strong>$${Number(item.subtotalVenta || 0).toFixed(2)}</div>
      <div class="item-acciones">
        <button class="btn-mini btn-editar" onclick="editarItem(${index})">Modificar</button>
        <button class="btn-mini btn-eliminar" onclick="eliminarItem(${index})">Eliminar</button>
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
  pintarFinal();
}

function pintarFinal(){
  const t = calcularTotales();
  const cont = document.getElementById("resumenFinal");
  if(!cont) return;

  cont.innerHTML = `
    <div class="resumen-cabecera">
      <div class="resumen-kpi"><small>Folio</small><strong>${document.getElementById("folio").value}</strong></div>
      <div class="resumen-kpi"><small>Encargado</small><strong>${document.getElementById("encargado").value}</strong></div>
      <div class="resumen-kpi"><small>Partidas / piezas</small><strong>${carrito.length} / ${t.piezas}</strong></div>
      <div class="resumen-kpi"><small>Precio público</small><strong>$${t.venta.toFixed(2)}</strong></div>
    </div>
    <div class="tabla-wrap">${tablaProductosHTML()}</div>
  `;
}

function abrirFirmaFinal(){
  const encargado = document.getElementById("encargado").value.trim();
  if(!encargado){
    alert("Falta nombre del encargado.");
    irPaso(1);
    return;
  }
  if(carrito.length === 0){
    alert("No hay productos en la merma.");
    irPaso(2);
    return;
  }

  const t = calcularTotales();
  const datos = document.getElementById("firmaDatos");
  if(datos){
    datos.innerHTML = `<strong>${encargado}</strong><br>Folio: ${document.getElementById("folio").value} · ${carrito.length} partidas · ${t.piezas} piezas · $${t.venta.toFixed(2)}`;
  }
  document.getElementById("modalFirma").classList.remove("oculto");
}

function cerrarFirmaFinal(){
  document.getElementById("modalFirma").classList.add("oculto");
}

async function confirmarFirmaYGuardar(){
  if(!firmaTieneContenido){
    alert("Firma antes de guardar la solicitud.");
    return;
  }
  cerrarFirmaFinal();
  await generarSolicitud();
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

  document.getElementById("tienda").value = APP_CONFIG.TIENDA_CENTRAL;
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
  const resumenFinal = document.getElementById("resumenFinal");
  if(resumenFinal) resumenFinal.innerHTML = "";

  document.getElementById("modalCantidad").value = "";
  document.getElementById("modalComentario").value = "";
  document.getElementById("modalMotivo").value = "CADUCIDAD";
  document.getElementById("modalProducto").classList.add("oculto");
  document.getElementById("modalFirma")?.classList.add("oculto");

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
  const tienda = APP_CONFIG.TIENDA_CENTRAL;
  const encargado = document.getElementById("encargado").value.trim();
  const folio = document.getElementById("folio").value;
  const notas = document.getElementById("notas").value.trim();

  return {
    folio,
    tienda,
    tiendaReporta:tienda,
    centralColeccion:APP_CONFIG.TIENDA_CENTRAL,
    destinoOperativo:APP_CONFIG.DESTINO_OPERATIVO,
    estado:"SOLICITADA",
    etapa:"PENDIENTE_AUDITORIA",

    tipoDocumento:"SOLICITUD_MERMA",
    tipoMovimientoPendiente:"SALIDA_MERMA",
    origen:"APP_MERMAS_CENTRAL",
    destino:APP_CONFIG.DESTINO_OPERATIVO,

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

  const documentoMerma = construirDocumentoMerma();
  const pdfBlob = generarPDF(documentoMerma);

  if(!navigator.onLine){
    try{
      encolarPendienteFirebase(documentoMerma);
      descargarPDF(pdfBlob,`${documentoMerma.folio}.pdf`);
      reiniciarFormularioDespuesDeGrabar();
      alert(`Solicitud ${documentoMerma.folio} guardada en este equipo.\n\nQueda PENDIENTE de subir a Firebase y se sincronizará automáticamente cuando vuelva internet.`);
    }catch(err){
      console.error("No se pudo guardar la merma pendiente:",err);
      alert("No fue posible guardar la solicitud pendiente. El formulario se conservará para no perder la información.");
      guardarBorradorSilencioso();
    }
    return;
  }

  try{
    document.getElementById("loader").style.display = "flex";
    document.getElementById("loaderTexto").textContent = "Generando solicitud de merma...";

    await subirDocumentoFirebase(documentoLocalSeguro(documentoMerma));

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
      alert("Solicitud de merma CENTRAL generada y PDF enviado a Telegram.");
    }else{
      alert(`La solicitud se guardó en Firebase y el PDF se descargó, pero no pudo enviarse a Telegram.\n\n${telegramError?.message || "Revisa la configuración del servicio."}`);
    }
  }catch(err){
    console.error(err);

    try{
      encolarPendienteFirebase(documentoMerma);
      descargarPDF(pdfBlob,`${documentoMerma.folio}.pdf`);
      reiniciarFormularioDespuesDeGrabar();
      alert(`Firebase no respondió. La solicitud ${documentoMerma.folio} quedó guardada localmente como PENDIENTE y se reintentará automáticamente.`);
    }catch(errorLocal){
      console.error("También falló el guardado local:",errorLocal);
      alert("No se pudo subir a Firebase ni guardar como pendiente. El formulario se conservará.");
      guardarBorradorSilencioso();
    }
  }finally{
    document.getElementById("loader").style.display = "none";
    actualizarConexion();
  }
}

function generarPDF(documentoMerma){
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p","mm","letter");

  let y = 15;

  pdf.setFont("helvetica","bold");
  pdf.setFontSize(15);
  pdf.text("COMPROBANTE DE SOLICITUD DE MERMA CENTRAL",105,y,{align:"center"});

  y += 8;
  pdf.setFontSize(10);
  pdf.setFont("helvetica","normal");
  pdf.text("Documento de levantamiento de merma CENTRAL - destino MATRIZ",105,y,{align:"center"});

  y += 12;

  pdf.setFont("helvetica","bold");
  pdf.text("Folio:",15,y);
  pdf.setFont("helvetica","normal");
  pdf.text(documentoMerma.folio,45,y);

  y += 7;
  pdf.setFont("helvetica","bold");
  pdf.text("Tienda reporta:",15,y);
  pdf.setFont("helvetica","normal");
  pdf.text(documentoMerma.tienda,45,y);

  y += 7;
  pdf.setFont("helvetica","bold");
  pdf.text("Destino:",15,y);
  pdf.setFont("helvetica","normal");
  pdf.text(APP_CONFIG.DESTINO_OPERATIVO,45,y);

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
window.editarItem = editarItem;
window.limpiarFirma = limpiarFirma;
window.generarSolicitud = generarSolicitud;
window.abrirFirmaFinal = abrirFirmaFinal;
window.cerrarFirmaFinal = cerrarFirmaFinal;
window.confirmarFirmaYGuardar = confirmarFirmaYGuardar;
