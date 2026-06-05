import { db } from "./firebase-config.js";

import {
  collection,
  query,
  where,
getDocs,
getDoc,
doc,
runTransaction,
  setDoc,
  serverTimestamp
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =====================================================
   ESTADO GLOBAL
===================================================== */

const estado = {

  catalogo: [],
  catalogoPorCodigo: new Map(),
  catalogoPorEquivalente: new Map(),

  entrega: "",
  recibe: "",
  destino: "",

  carrito: [],

  productoActual: null,

  firmaRecibe: "",
  firmaEntrega: "",

  firmaPaso: "recibe",

  scannerCamara: null,
  camaraActiva: false,

  firmaDibujando: false,
  firmaTieneTrazos: false

};

/* =====================================================
   HELPERS
===================================================== */

const $ = id => document.getElementById(id);

const el = {

  pantallaCarga: $("pantallaCarga"),
  textoCarga: $("textoCarga"),

  app: $("app"),

  modalPaso1: $("modalPaso1"),
  btnContinuarPaso1: $("btnContinuarPaso1"),
  zonaCaptura: $("zonaCaptura"),
  carritoBox: $("carritoBox"),
  btnToggleDatos: $("btnToggleDatos"),
panelInfo: $("panelInfo"),

  selectEntrega: $("selectEntrega"),
  selectRecibe: $("selectRecibe"),
  selectDestino: $("selectDestino"),

  txtEntrega: $("txtEntrega"),
  txtRecibe: $("txtRecibe"),
  txtDestino: $("txtDestino"),

  inputScanner: $("inputScanner"),

  btnBuscarProducto: $("btnBuscarProducto"),

  listaCarrito: $("listaCarrito"),
  contadorCarrito: $("contadorCarrito"),

  btnCerrarSalida: $("btnCerrarSalida"),

  modalDatos: $("modalDatos"),
  tituloModalDatos: $("tituloModalDatos"),
  inputModalDatos: $("inputModalDatos"),
  btnGuardarModalDatos: $("btnGuardarModalDatos"),

  modalBusqueda: $("modalBusqueda"),
  inputBusqueda: $("inputBusqueda"),
  resultadosBusqueda: $("resultadosBusqueda"),
  btnCerrarBusqueda: $("btnCerrarBusqueda"),

  modalCantidad: $("modalCantidad"),
  cantidadCodigo: $("cantidadCodigo"),
  cantidadConcepto: $("cantidadConcepto"),
  inputCantidad: $("inputCantidad"),
  btnAgregarCarrito: $("btnAgregarCarrito"),
  btnCancelarCantidad: $("btnCancelarCantidad"),

  modalFirma: $("modalFirma"),
  tituloFirma: $("tituloFirma"),
  canvasFirma: $("canvasFirma"),
  btnLimpiarFirma: $("btnLimpiarFirma"),
  btnGuardarFirma: $("btnGuardarFirma"),

  comprobante: $("comprobante"),

  compFolio: $("compFolio"),
  compFecha: $("compFecha"),
  compEntrega: $("compEntrega"),
  compRecibe: $("compRecibe"),
  compDestino: $("compDestino"),

  compProductos: $("compProductos"),

  compFirmaRecibe: $("compFirmaRecibe"),
  compFirmaEntrega: $("compFirmaEntrega")

};


/* =====================================================
   INICIO
===================================================== */

document.addEventListener(
  "DOMContentLoaded",
  iniciarApp
);

async function iniciarApp(){

  try{

    mostrarCarga(
      "Cargando catálogo..."
    );

    await cargarCatalogoActivo();

    mostrarCarga(
      `${estado.catalogo.length} artículos cargados`
    );

    configurarEventos();

    renderCarrito();

    setTimeout(()=>{

      el.pantallaCarga.classList.add(
        "oculto"
      );

      el.app.classList.remove(
        "oculto"
      );

      iniciarFlujoDatos();

    },700);

  }catch(error){

    console.error(error);

    alert(
      "Error cargando catálogo"
    );

  }

}

/* =====================================================
   CATALOGO
===================================================== */

async function cargarCatalogoActivo(){

  estado.catalogo = [];
  estado.catalogoPorCodigo.clear();
  estado.catalogoPorEquivalente.clear();

  const meta = await leerMetadata(
    "ultima_descarga_catalogo"
  );

  const catalogoLocal = await leerCatalogoLocal();

if(
  meta &&
  diasTranscurridos(meta.fecha) < 3 &&
  catalogoLocal.length > 0
){

    catalogoLocal.forEach(producto=>{
      agregarProductoMemoria(producto);
    });

    mostrarCarga(
      `${estado.catalogo.length} artículos cargados desde local`
    );

    return;

  }

  const q = query(
    collection(db,"productos"),
    where("activo","==",true)
  );

  const snap = await getDocs(q);

  const productos = [];

  snap.forEach(docSnap=>{

    const producto = productoDesdeDoc(docSnap);

    productos.push(producto);

    agregarProductoMemoria(producto);

  });

  await guardarCatalogoLocal(productos);

  await guardarMetadata(
    "ultima_descarga_catalogo",
    {
      fecha: hoyISO(),
      total: productos.length,
      actualizadoEn: new Date().toISOString()
    }
  );

}
/* =====================================================
   INDEXEDDB CATALOGO LOCAL
===================================================== */

const DB_NOMBRE = "PROVSOFT_ALMACEN_DULCES";
const DB_VERSION = 1;
const STORE_CATALOGO = "catalogo_productos";
const STORE_METADATA = "metadata";

function abrirDB(){

  return new Promise((resolve,reject)=>{

    const req = indexedDB.open(
      DB_NOMBRE,
      DB_VERSION
    );

    req.onupgradeneeded = e=>{

      const dbLocal = e.target.result;

      if(!dbLocal.objectStoreNames.contains(STORE_CATALOGO)){

        dbLocal.createObjectStore(
          STORE_CATALOGO,
          {
            keyPath:"codigoBarra"
          }
        );

      }

      if(!dbLocal.objectStoreNames.contains(STORE_METADATA)){

        dbLocal.createObjectStore(
          STORE_METADATA,
          {
            keyPath:"clave"
          }
        );

      }

    };

    req.onsuccess = ()=>resolve(req.result);

    req.onerror = ()=>reject(req.error);

  });

}

async function leerCatalogoLocal(){

  const dbLocal = await abrirDB();

  return new Promise((resolve,reject)=>{

    const tx = dbLocal.transaction(
      STORE_CATALOGO,
      "readonly"
    );

    const store = tx.objectStore(
      STORE_CATALOGO
    );

    const req = store.getAll();

    req.onsuccess = ()=>resolve(req.result || []);

    req.onerror = ()=>reject(req.error);

  });

}

async function guardarCatalogoLocal(productos){

  const dbLocal = await abrirDB();

  return new Promise((resolve,reject)=>{

    const tx = dbLocal.transaction(
      STORE_CATALOGO,
      "readwrite"
    );

    const store = tx.objectStore(
      STORE_CATALOGO
    );

    store.clear();

    productos.forEach(producto=>{

      store.put(producto);

    });

    tx.oncomplete = ()=>resolve(true);

    tx.onerror = ()=>reject(tx.error);

  });

}

async function leerMetadata(clave){

  const dbLocal = await abrirDB();

  return new Promise((resolve,reject)=>{

    const tx = dbLocal.transaction(
      STORE_METADATA,
      "readonly"
    );

    const store = tx.objectStore(
      STORE_METADATA
    );

    const req = store.get(clave);

    req.onsuccess = ()=>resolve(req.result || null);

    req.onerror = ()=>reject(req.error);

  });

}

async function guardarMetadata(clave,data){

  const dbLocal = await abrirDB();

  return new Promise((resolve,reject)=>{

    const tx = dbLocal.transaction(
      STORE_METADATA,
      "readwrite"
    );

    const store = tx.objectStore(
      STORE_METADATA
    );

    store.put({
      clave,
      ...data
    });

    tx.oncomplete = ()=>resolve(true);

    tx.onerror = ()=>reject(tx.error);

  });

}

function hoyISO(){

  return new Date()
    .toISOString()
    .slice(0,10);

}

function productoDesdeDoc(docSnap){

  const d = docSnap.data();

  return {

    id: docSnap.id,

    codigoBarra:
      limpiarCodigo(
        d.codigoBarra || docSnap.id
      ),

    concepto:
      String(
        d.concepto || ""
      ).trim(),

    codigosEquivalentes:
      Array.isArray(
        d.codigosEquivalentes
      )
      ? d.codigosEquivalentes.map(
          x => limpiarCodigo(x)
        )
      : []

  };

}

function agregarProductoMemoria(producto){

  if(
    !producto ||
    !producto.codigoBarra
  ){
    return;
  }

  estado.catalogo.push(
    producto
  );

  estado.catalogoPorCodigo.set(
    producto.codigoBarra,
    producto
  );

  producto.codigosEquivalentes.forEach(eq=>{

    estado.catalogoPorEquivalente.set(
      eq,
      producto
    );

  });

}
async function guardarProductoLocal(producto){

  const dbLocal = await abrirDB();

  return new Promise((resolve,reject)=>{

    const tx = dbLocal.transaction(
      STORE_CATALOGO,
      "readwrite"
    );

    const store = tx.objectStore(
      STORE_CATALOGO
    );

    store.put(producto);

    tx.oncomplete = ()=>resolve(true);

    tx.onerror = ()=>reject(tx.error);

  });

}

async function buscarProductoFirebasePorCodigo(codigo){

  const codigoLimpio =
    limpiarCodigo(codigo);

  let q = query(
    collection(db,"productos"),
    where("activo","==",true),
    where("codigoBarra","==",codigoLimpio)
  );

  let snap = await getDocs(q);

  if(!snap.empty){

    return productoDesdeDoc(
      snap.docs[0]
    );

  }

  q = query(
    collection(db,"productos"),
    where("activo","==",true),
    where("codigosEquivalentes","array-contains",codigoLimpio)
  );

  snap = await getDocs(q);

  if(!snap.empty){

    return productoDesdeDoc(
      snap.docs[0]
    );

  }

  return null;

}

/* =====================================================
   UTILIDADES
===================================================== */

function limpiarCodigo(codigo){

  return String(codigo || "")
    .trim()
    .replace(/\s+/g,"");

}

function mostrarCarga(texto){

  el.textoCarga.textContent =
    texto;

}

function escapeHtml(texto){

  return String(texto ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

}

/* =====================================================
   FLUJO ENTREGA / RECIBE / DESTINO
===================================================== */

let pasoDatos = "entrega";

function iniciarFlujoDatos(){

  el.modalPaso1.classList.remove(
    "oculto"
  );

}



function abrirModalDatos(
  titulo,
  placeholder
){

  el.tituloModalDatos.textContent =
    titulo;

  el.inputModalDatos.value = "";

  el.inputModalDatos.placeholder =
    placeholder;

  el.modalDatos.classList.remove(
    "oculto"
  );

  setTimeout(()=>{

    el.inputModalDatos.focus();

  },200);

}

function guardarDatoModal(){

  const valor =
    el.inputModalDatos.value.trim();

  if(!valor){

    alert(
      "Captura el dato"
    );

    return;

  }


  estado.destino = valor;

  el.txtDestino.textContent =
    valor;

  el.modalDatos.classList.add(
    "oculto"
  );

  enfocarScanner();

}

/* =====================================================
   EVENTOS
===================================================== */

function configurarEventos(){

  el.btnGuardarModalDatos
    .addEventListener(
      "click",
      guardarDatoModal
    );

  el.inputModalDatos
    .addEventListener(
      "keydown",
      e=>{

        if(e.key==="Enter"){

          guardarDatoModal();

        }

      }
    );

  el.inputScanner
    .addEventListener(
      "keydown",
      e=>{

        if(e.key==="Enter"){

          const codigo =
            limpiarCodigo(
              el.inputScanner.value
            );

          el.inputScanner.value = "";

          if(codigo){

            procesarCodigoEscaneado(
              codigo
            );

          }

        }

      }
    );

  el.btnBuscarProducto
    .addEventListener(
      "click",
      abrirBusqueda
    );

  el.btnCerrarBusqueda
    .addEventListener(
      "click",
      cerrarBusqueda
    );

  el.inputBusqueda
    .addEventListener(
      "input",
      ()=>{

        buscarPorConceptoFlexible(
          el.inputBusqueda.value
        );

      }
    );


  /* ===== PARTE 3 YA PREPARADA ===== */

  el.btnAgregarCarrito
    .addEventListener(
      "click",
      agregarProductoActual
    );

  el.btnCancelarCantidad
    .addEventListener(
      "click",
      cerrarCantidad
    );

  el.inputCantidad
    .addEventListener(
      "keydown",
      e=>{

        if(e.key==="Enter"){

          agregarProductoActual();

        }

      }
    );

  el.btnContinuarPaso1.addEventListener("click", continuarPaso1);

    el.btnCerrarSalida
    .addEventListener(
      "click",
      iniciarProcesoFirmas
    );
el.btnToggleDatos
  .addEventListener(
    "click",
    ()=>{

      el.panelInfo.classList.toggle(
        "oculto"
      );

    }
  );
    
}
function continuarPaso1(){

  estado.entrega = el.selectEntrega.value;
  estado.recibe = el.selectRecibe.value;
  estado.destino = el.selectDestino.value;

  if(!estado.entrega || !estado.recibe || !estado.destino){
    alert("Selecciona entrega, recibe y destino.");
    return;
  }

  el.txtEntrega.textContent = estado.entrega;
  el.txtRecibe.textContent = estado.recibe;
  el.txtDestino.textContent = estado.destino;

  el.modalPaso1.classList.add("oculto");
  el.zonaCaptura.classList.remove("oculto");
  el.carritoBox.classList.remove("oculto");

  enfocarScanner();

}

/* =====================================================
   SCANNER
===================================================== */

function enfocarScanner(){

  setTimeout(()=>{

    el.inputScanner.focus();

  },200);

}

async function procesarCodigoEscaneado(
  codigo
){

  let producto =

    estado.catalogoPorCodigo.get(
      codigo
    )

    ||

    estado.catalogoPorEquivalente.get(
      codigo
    );

  if(producto){

    abrirCantidad(
      producto
    );

    return;

  }

  mostrarCarga(
    "Buscando producto en Firebase..."
  );

  producto =
    await buscarProductoFirebasePorCodigo(
      codigo
    );

  if(!producto){

    alert(
      "Producto no encontrado"
    );

    enfocarScanner();

    return;

  }

  await guardarProductoLocal(
    producto
  );

  agregarProductoMemoria(
    producto
  );

  mostrarToast(
    "Producto actualizado en catálogo local"
  );

  abrirCantidad(
    producto
  );

}



/* =====================================================
   BUSQUEDA FLEXIBLE
===================================================== */

function abrirBusqueda(){

  el.modalBusqueda.classList.remove(
    "oculto"
  );

  el.inputBusqueda.value = "";

  el.resultadosBusqueda.innerHTML = "";

  setTimeout(()=>{

    el.inputBusqueda.focus();

  },200);

}

function cerrarBusqueda(){

  el.modalBusqueda.classList.add(
    "oculto"
  );

  enfocarScanner();

}

function normalizarTexto(txt){

  return String(txt || "")

    .toUpperCase()

    .normalize("NFD")

    .replace(
      /[\u0300-\u036f]/g,
      ""
    )

    .replace(
      /[^A-Z0-9. ]/g,
      " "
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();

}

function buscarPorConceptoFlexible(
  texto
){

  const limpio =
    normalizarTexto(texto);

  if(
    limpio.length < 2
  ){

    el.resultadosBusqueda.innerHTML =
      "";

    return;

  }

  const tokens =
    limpio.split(" ")
      .filter(Boolean);

  const resultados =

    estado.catalogo

      .filter(p=>{

        const concepto =
          normalizarTexto(
            p.concepto
          );

        return tokens.every(
          token =>
            concepto.includes(token)
        );

      })

      .slice(0,40);

  pintarResultadosBusqueda(
    resultados
  );

}

function pintarResultadosBusqueda(
  resultados
){

  el.resultadosBusqueda.innerHTML =
    "";

  resultados.forEach(p=>{

    const div =
      document.createElement(
        "div"
      );

    div.className =
      "resultado-item";

    div.innerHTML = `

      <strong>
        ${escapeHtml(
          p.concepto
        )}
      </strong>

      <small>
        ${escapeHtml(
          p.codigoBarra
        )}
      </small>

    `;

    div.onclick = ()=>{

      cerrarBusqueda();

      abrirCantidad(
        p
      );

    };

    el.resultadosBusqueda
      .appendChild(div);

  });

}

/* =====================================================
   MODAL CANTIDAD
===================================================== */

function abrirCantidad(producto){

  estado.productoActual =
    producto;

  el.cantidadCodigo.textContent =
    producto.codigoBarra;

  el.cantidadConcepto.textContent =
    producto.concepto;

  el.inputCantidad.value = "";

  el.modalCantidad.classList.remove(
    "oculto"
  );

  setTimeout(()=>{

    el.inputCantidad.focus();

  },200);

}

function cerrarCantidad(){

  estado.productoActual = null;

  el.modalCantidad.classList.add(
    "oculto"
  );

  enfocarScanner();

}

/* =====================================================
   CARRITO
===================================================== */

function agregarProductoActual(){

  if(
    !estado.productoActual
  ){

    return;

  }

  const cantidad =
    parseFloat(
      el.inputCantidad.value
    );

  if(
    !cantidad ||
    cantidad <= 0
  ){

    alert(
      "Cantidad inválida"
    );

    return;

  }

  const existente =

    estado.carrito.find(
      item =>
        item.codigoBarra ===
        estado.productoActual.codigoBarra
    );

  if(existente){

    existente.cantidad += cantidad;

    mostrarToast(
      `Cantidad actualizada: ${existente.cantidad}`
    );

  }else{

    estado.carrito.push({

      codigoBarra:
        estado.productoActual.codigoBarra,

      concepto:
        estado.productoActual.concepto,

      cantidad

    });

  }

  renderCarrito();

  cerrarCantidad();

}

/* =====================================================
   RENDER CARRITO
===================================================== */

function renderCarrito(){

  el.listaCarrito.innerHTML =
    "";

  el.contadorCarrito.textContent =

    estado.carrito.length === 1

      ? "1 artículo"

      : `${estado.carrito.length} artículos`;

  if(
    estado.carrito.length === 0
  ){

    el.listaCarrito.innerHTML =

      `
      <div class="texto-ayuda">
        No hay artículos capturados
      </div>
      `;

    return;

  }

  estado.carrito.forEach(
    (item,index)=>{

      const div =
        document.createElement(
          "div"
        );

      div.className =
        "item-carrito";

      div.innerHTML = `

        <small>
          ${escapeHtml(
            item.codigoBarra
          )}
        </small>

        <strong>
          ${escapeHtml(
            item.concepto
          )}
        </strong>

        <div class="fila">

          <span>
            Cantidad:
            <b>
              ${item.cantidad}
            </b>
          </span>

          <button
            onclick="eliminarItem(${index})"
          >
            Eliminar
          </button>

        </div>

      `;

      el.listaCarrito
        .appendChild(div);

    }
  );

}

/* =====================================================
   ELIMINAR PARTIDA
===================================================== */

window.eliminarItem = function(index){

  if(
    !confirm(
      "¿Eliminar artículo?"
    )
  ){

    return;

  }

  estado.carrito.splice(
    index,
    1
  );

  renderCarrito();

};

/* =====================================================
   TOAST
===================================================== */

function mostrarToast(texto){

  let toast =
    document.getElementById(
      "toastProv"
    );

  if(!toast){

    toast =
      document.createElement(
        "div"
      );

    toast.id =
      "toastProv";

    toast.style.position =
      "fixed";

    toast.style.bottom =
      "20px";

    toast.style.left =
      "50%";

    toast.style.transform =
      "translateX(-50%)";

    toast.style.background =
      "#f97316";

    toast.style.color =
      "#fff";

    toast.style.padding =
      "12px 18px";

    toast.style.borderRadius =
      "12px";

    toast.style.fontWeight =
      "bold";

    toast.style.zIndex =
      "9999";

    document.body.appendChild(
      toast
    );

  }

  toast.textContent =
    texto;

  toast.style.display =
    "block";

  clearTimeout(
    toast._timer
  );

  toast._timer =
    setTimeout(()=>{

      toast.style.display =
        "none";

    },2000);

}

/* =====================================================
   CERRAR SALIDA
===================================================== */

function iniciarProcesoFirmas(){

  if(
    estado.carrito.length === 0
  ){

    alert(
      "No hay artículos capturados"
    );

    return;

  }

  estado.firmaPaso =
    "recibe";

  abrirModalFirma(
    "Firma de quien recibe"
  );

}

/* =====================================================
   FIRMAS
===================================================== */

function abrirModalFirma(titulo){

  el.tituloFirma.textContent =
    titulo;

  el.modalFirma.classList.remove(
    "oculto"
  );

  prepararCanvasFirma();

}

function prepararCanvasFirma(){

  const canvas =
    el.canvasFirma;

  const rect =
    canvas.getBoundingClientRect();

  canvas.width =
    rect.width;

  canvas.height =
    rect.height;

  const ctx =
    canvas.getContext("2d");

  ctx.fillStyle =
    "#FFFFFF";

  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  estado.firmaTieneTrazos =
    false;

}

/* =====================================================
   CANVAS FIRMA
===================================================== */

const canvasFirma =
  el.canvasFirma;

const ctxFirma =
  canvasFirma.getContext(
    "2d"
  );

function obtenerPosicion(e){

  const rect =
    canvasFirma.getBoundingClientRect();

  if(e.touches){

    return {

      x:
        e.touches[0].clientX
        - rect.left,

      y:
        e.touches[0].clientY
        - rect.top

    };

  }

  return {

    x:
      e.clientX
      - rect.left,

    y:
      e.clientY
      - rect.top

  };

}

function iniciarDibujo(e){

  estado.firmaDibujando =
    true;

  estado.firmaTieneTrazos =
    true;

  const pos =
    obtenerPosicion(e);

  ctxFirma.beginPath();

  ctxFirma.moveTo(
    pos.x,
    pos.y
  );

}

function dibujarFirma(e){

  if(
    !estado.firmaDibujando
  ) return;

  e.preventDefault();

  const pos =
    obtenerPosicion(e);

  ctxFirma.lineWidth = 2;

  ctxFirma.lineCap =
    "round";

  ctxFirma.strokeStyle =
    "#000";

  ctxFirma.lineTo(
    pos.x,
    pos.y
  );

  ctxFirma.stroke();

}

function terminarDibujo(){

  estado.firmaDibujando =
    false;

}

canvasFirma.addEventListener(
  "mousedown",
  iniciarDibujo
);

canvasFirma.addEventListener(
  "mousemove",
  dibujarFirma
);

canvasFirma.addEventListener(
  "mouseup",
  terminarDibujo
);

canvasFirma.addEventListener(
  "mouseleave",
  terminarDibujo
);

canvasFirma.addEventListener(
  "touchstart",
  iniciarDibujo,
  { passive:false }
);

canvasFirma.addEventListener(
  "touchmove",
  dibujarFirma,
  { passive:false }
);

canvasFirma.addEventListener(
  "touchend",
  terminarDibujo
);

el.btnLimpiarFirma
  .addEventListener(
    "click",
    prepararCanvasFirma
  );

el.btnGuardarFirma
  .addEventListener(
    "click",
    guardarFirma
  );

/* =====================================================
   GUARDAR FIRMA
===================================================== */

function guardarFirma(){

  if(
    !estado.firmaTieneTrazos
  ){

    alert(
      "Capture una firma"
    );

    return;

  }

  const firma =
    canvasFirma.toDataURL(
      "image/png"
    );

  if(
    estado.firmaPaso ===
    "recibe"
  ){

    estado.firmaRecibe =
      firma;

    estado.firmaPaso =
      "entrega";

    abrirModalFirma(
      "Firma de quien entrega"
    );

    return;

  }

  estado.firmaEntrega =
    firma;

  el.modalFirma.classList.add(
    "oculto"
  );

  guardarSalida();

}

/* =====================================================
   FOLIO
===================================================== */

async function generarFolio(){

  const ref = doc(
    db,
    "consecutivos",
    "salidas_almacen_dulces"
  );

  return await runTransaction(
    db,
    async(transaction)=>{

      const snap =
        await transaction.get(
          ref
        );

      let ultimo = 0;

      if(
        snap.exists()
      ){

        ultimo =
          Number(
            snap.data().ultimo || 0
          );

      }

      ultimo++;

      transaction.set(
        ref,
        {
          ultimo,
          actualizado:
            serverTimestamp()
        },
        {
          merge:true
        }
      );

      return `SAL-DUL-${String(
        ultimo
      ).padStart(6,"0")}`;

    }
  );

}

/* =====================================================
   GUARDAR FIREBASE
===================================================== */

async function guardarSalida(){

  try{

    mostrarCarga(
      "Guardando salida..."
    );

    el.pantallaCarga.classList.remove(
      "oculto"
    );

    const folio =
      await generarFolio();

estado.entrega = el.selectEntrega.value;
estado.recibe = el.selectRecibe.value;
estado.destino = el.selectDestino.value;

if(!estado.entrega || !estado.recibe || !estado.destino){
  alert("Selecciona entrega, recibe y destino.");
  el.pantallaCarga.classList.add("oculto");
  return;
}

el.txtEntrega.textContent = estado.entrega;
el.txtRecibe.textContent = estado.recibe;
el.txtDestino.textContent = estado.destino;
        
  const salida = {

      folio,

      fecha:
        new Date()
          .toISOString(),

      entrega:
        estado.entrega,

      recibe:
        estado.recibe,

      destino:
        estado.destino,

      productos:
        estado.carrito,

      firmaRecibe:
        estado.firmaRecibe,

      firmaEntrega:
        estado.firmaEntrega,

      creadoEn:
        serverTimestamp()

    };

    await setDoc(

      doc(
        db,
        "almacenes",
        "Almacen_Dulces",
        "salidas",
        folio
      ),

      salida

    );

    await generarPDF(
      salida
    );

    alert(
      `Salida ${folio} guardada`
    );

    location.reload();

  }catch(error){

    console.error(error);

    alert(
      "Error guardando salida"
    );

  }

}

/* =====================================================
   PDF
===================================================== */

async function generarPDF(salida){

  el.compFolio.textContent =
    salida.folio;

  el.compFecha.textContent =
    salida.fecha;

  el.compEntrega.textContent =
    salida.entrega;

  el.compRecibe.textContent =
    salida.recibe;

  el.compDestino.textContent =
    salida.destino;

  el.compFirmaRecibe.src =
    salida.firmaRecibe;

  el.compFirmaEntrega.src =
    salida.firmaEntrega;

  el.compProductos.innerHTML =
    "";

  salida.productos.forEach(
    item=>{

      const tr =
        document.createElement(
          "tr"
        );

      tr.innerHTML = `
        <td>${escapeHtml(item.codigoBarra)}</td>
        <td>${escapeHtml(item.concepto)}</td>
        <td>${item.cantidad}</td>
      `;

      el.compProductos
        .appendChild(tr);

    }
  );

  el.comprobante.classList.remove(
    "oculto"
  );

  const canvas =
    await html2canvas(
      el.comprobante,
      {
        scale:2
      }
    );

  const imagen =
    canvas.toDataURL(
      "image/png"
    );

  const { jsPDF } =
    window.jspdf;

const anchoTicket = 58;

const altoTicket =
  (canvas.height * anchoTicket / canvas.width) + 10;

const pdf =
  new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [altoTicket, anchoTicket]
  });
  

const margen = 2;

const ancho = 54;

const alto =
  canvas.height *
  ancho /
  canvas.width;

pdf.addImage(
  imagen,
  "PNG",
  margen,
  margen,
  ancho,
  alto
);
  

  pdf.save(
    `${salida.folio}.pdf`
  );

  el.comprobante.classList.add(
    "oculto"
  );

}
function diasTranscurridos(fechaISO){

  const inicio = new Date(fechaISO);
  const hoy = new Date();

  inicio.setHours(0,0,0,0);
  hoy.setHours(0,0,0,0);

  const diferencia =
    hoy.getTime() - inicio.getTime();

  return Math.floor(
    diferencia / 86400000
  );

}

