import { firebaseConfig } from "./config.js";

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const SUCURSAL = "ALLENDE 1";
const RUTA_TRANSFERENCIAS = "transferencias1";

const DB_NAME = "PROVSOFT_PDD_MOVIL";
const DB_VERSION = 3;
const STORE_PRODUCTOS = "catalogo_productos_completo";
const STORE_META = "metadata";
const STORE_FOTOS_META = "productos_fotos_meta";
const CLAVE_ULTIMA_DESCARGA = "ultima_descarga_catalogo";

let catalogo = [];
let carrito = [];
let productoTemporal = null;
let cantidadTemporal = 1;
/* =========================
LOADING
========================= */

function setLoading(txt,pct){

  document.getElementById("loadingText").innerText = txt;

  document.getElementById("loadingPct").innerText =
    `${pct}%`;

  document.getElementById("loadingBar").style.width =
    `${pct}%`;

}

function ocultarLoading(){

  const el = document.getElementById("loading");

  el.style.opacity = "0";

  setTimeout(()=>{
    el.style.display = "none";
  },350);

}

/* =========================
INDEXEDDB
========================= */

function abrirDB(){

  return new Promise((resolve,reject)=>{

    const req = indexedDB.open(DB_NAME,DB_VERSION);

    req.onupgradeneeded = e=>{

      const dbi = e.target.result;

      if(!dbi.objectStoreNames.contains(STORE_PRODUCTOS)){
        dbi.createObjectStore(STORE_PRODUCTOS,{ keyPath:"id" });
      }

      if(!dbi.objectStoreNames.contains(STORE_META)){
        dbi.createObjectStore(STORE_META,{ keyPath:"key" });
      }
      if(!dbi.objectStoreNames.contains(STORE_FOTOS_META)){
  dbi.createObjectStore(STORE_FOTOS_META,{ keyPath:"codigoBarra" });
}
      

    };

    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);

  });

}

async function guardarCatalogo(data){

  const dbi = await abrirDB();

  return new Promise((resolve,reject)=>{

    const tx = dbi.transaction(STORE_PRODUCTOS,"readwrite");
    const store = tx.objectStore(STORE_PRODUCTOS);

    store.clear();

    data.forEach(p=>store.put(p));

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

async function leerCatalogo(){

  const dbi = await abrirDB();

  return new Promise((resolve,reject)=>{

    const tx = dbi.transaction(STORE_PRODUCTOS,"readonly");
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

async function guardarMeta(key,value){

  const dbi = await abrirDB();

  return new Promise((resolve,reject)=>{

    const tx = dbi.transaction(STORE_META,"readwrite");

    tx.objectStore(STORE_META).put({
      key,
      value
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

async function leerMeta(key){

  const dbi = await abrirDB();

  return new Promise((resolve,reject)=>{

    const tx = dbi.transaction(STORE_META,"readonly");

    const req = tx.objectStore(STORE_META).get(key);

    req.onsuccess = ()=>{
      dbi.close();
      resolve(req.result?.value || null);
    };

    req.onerror = ()=>{
      dbi.close();
      reject(req.error);
    };

  });

}

/* =========================
UTILS
========================= */

function normalizar(str){

  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9 ]/g," ")
    .replace(/\s+/g," ")
    .trim();

}

function escapeHtml(str){

  return String(str || "").replace(/[&<>"']/g,m=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#039;"
  })[m]);

}

function nuevoFolio(){

  const ahora = new Date();

  // ALLENDE 1 -> ALLE
  const prefijo = "ALLE";

  const pad2 = n => String(n).padStart(2,"0");
  const pad3 = n => String(n).padStart(3,"0");

  const serial =
    ahora.getFullYear() +
    pad2(ahora.getMonth()+1) +
    pad2(ahora.getDate()) + "-" +
    pad2(ahora.getHours()) +
    pad2(ahora.getMinutes()) +
    pad2(ahora.getSeconds()) +
    pad3(ahora.getMilliseconds());

  const nuevo = `${prefijo}-${serial}`;

  const el =
    document.getElementById("folioText") ||
    document.getElementById("folio");

  if(el){
    el.textContent = nuevo;
  }

  return nuevo;

}

function abrirModal(id){
  document.getElementById(id).style.display = "flex";
}

window.cerrarModal = function(id){
  document.getElementById(id).style.display = "none";
  if(id !== "modalCantidad" && id !== "modalComentario") enfocarCapturaPOS();
}

/* =========================
CATALOGO
========================= */

async function cargarCatalogo(){

  try{

    setLoading("Leyendo catálogo local...",20);

    const local = await leerCatalogo();

    if(local.length){

      catalogo = local;

      setLoading(`Catálogo local: ${catalogo.length}`,50);

    }

    const ultima = await leerMeta(CLAVE_ULTIMA_DESCARGA);

    let actualizar = true;

    if(ultima){

      const horas =
        (Date.now() - new Date(ultima).getTime())
        /1000/60/60;

      actualizar = horas >= 48;

    }

    if(!actualizar && catalogo.length){

      setLoading("Usando catálogo local.",100);

      return;

    }

    setLoading("Descargando catálogo...",70);

    const snap = await getDocs(
      collection(db,"productos")
    );

    catalogo = snap.docs.map(d=>{

      const data = d.data();

      const texto = [
        data.codigoBarra || "",
        data.concepto || "",
        data.marca || "",
        data.departamento || ""
      ].join(" ");

      return {
        id:d.id,
        ...data,
        _search:normalizar(texto)
      };

    });

    await guardarCatalogo(catalogo);

    await guardarMeta(
      CLAVE_ULTIMA_DESCARGA,
      new Date().toISOString()
    );

    setLoading(`Catálogo actualizado: ${catalogo.length}`,100);

  }catch(e){

    console.error(e);

    alert("Error cargando catálogo.");

  }

}

/* =========================
BUSQUEDAS
========================= */

window.abrirCodigo = function(){

  cerrarModal("modalMenu");
  abrirModal("modalCodigo");

  setTimeout(()=>{
    document.getElementById("inpCodigo").focus();
  },150);

}

window.abrirNombre = function(){

  cerrarModal("modalMenu");
  abrirModal("modalNombre");

  setTimeout(()=>{
    document.getElementById("inpNombre").focus();
  },150);

}

window.buscarCodigo = function(){

  const txt = normalizar(
    document.getElementById("inpCodigo").value
  );

  const div = document.getElementById("resCodigo");

  if(txt.length < 1){
    div.innerHTML = "";
    return;
  }

  const encontrados = catalogo.filter(p=>{

    const codigo =
      normalizar(p.codigoBarra);

    return codigo.includes(txt);

  }).slice(0,20);

  pintarResultados(div,encontrados);

}

document.getElementById("inpNombre")
.addEventListener("input",e=>{

  const txt = normalizar(e.target.value);

  const div = document.getElementById("resNombre");

  if(txt.length < 2){
    div.innerHTML = "";
    return;
  }

  const palabras = txt.split(/\s+/);

  const encontrados = catalogo
  .map(p=>{

    let score = 0;

    if(p._search.includes(txt)) score += 100;

    palabras.forEach(w=>{
      if(p._search.includes(w)) score += 25;
    });

    return {
      ...p,
      score
    };

  })
  .filter(x=>x.score > 0)
  .sort((a,b)=>b.score - a.score)
  .slice(0,20);

  pintarResultados(div,encontrados);

});


function pintarResultados(div,data){

  if(!data.length){

    div.innerHTML = `
      <div style="padding:20px; text-align:center;">
        Sin resultados
      </div>
    `;

    return;

  }

  div.innerHTML = data.map(p=>`

    <div
      class="resultado-item"
      onclick="seleccionarProducto('${escapeHtml(p.id)}')"
    >

      <b>${escapeHtml(p.codigoBarra || "")}</b>

      <br>

      ${escapeHtml(p.concepto || "")}

      <br>

      <small>
        ${escapeHtml(p.marca || "")}

        ${
          p.activo
          ? '<span class="badge-activo">ACTIVO</span>'
          : '<span class="badge-inactivo">INACTIVO</span>'
        }
      </small>

    </div>

  `).join("");

}

window.seleccionarProducto = function(id){

  productoTemporal =
    catalogo.find(x=>String(x.id) === String(id));

  if(!productoTemporal) return;

  cerrarModal("modalCodigo");
  cerrarModal("modalNombre");

  document.getElementById("prodCantidadNombre").innerHTML = `

    <div style="font-weight:900; margin-bottom:10px;">
      ${escapeHtml(productoTemporal.concepto)}
    </div>

    <div style="font-size:12px; color:#64748b;">
      ${escapeHtml(productoTemporal.codigoBarra)}
    </div>

  `;

  document.getElementById("prodComentarioNombre").innerHTML = `

    <div style="font-weight:900;">
      ${escapeHtml(productoTemporal.concepto)}
    </div>

    <div style="font-size:12px; color:#64748b;">
      ${escapeHtml(productoTemporal.codigoBarra)}
    </div>

  `;

  const inpCantidad = document.getElementById("inpCantidad");
  inpCantidad.value = 1;

  abrirModal("modalCantidad");

  
  // Focus POS inmediato: al seleccionar artículo, la cantidad queda
  // completamente seleccionada para escribir 1, 20, etc. sin mouse.
  const aplicarFocusCantidadPOS = ()=>{
    const campo = document.getElementById("inpCantidad");
    if(!campo) return;
    campo.focus({ preventScroll:true });
    try{ campo.select(); }catch(_){}

    requestAnimationFrame(()=>{
      campo.focus({ preventScroll:true });
      try{ campo.select(); }catch(_){}
    });
  };

  requestAnimationFrame(aplicarFocusCantidadPOS);
  setTimeout(aplicarFocusCantidadPOS, 60);

// Focus POS real: al abrir Cantidad el valor queda seleccionado
  // para reemplazarlo directamente desde teclado sin usar mouse.
  const activarFocusCantidad = ()=>{
    inpCantidad.focus({preventScroll:true});
    inpCantidad.select();
    if(typeof inpCantidad.setSelectionRange === "function"){
      try{
        inpCantidad.setSelectionRange(0, String(inpCantidad.value).length);
      }catch(_){}
    }
  };

  requestAnimationFrame(()=>{
    activarFocusCantidad();
    setTimeout(activarFocusCantidad, 40);
  });

}

/* =========================
CARRITO
========================= */

// Cantidad funciona totalmente por teclado:
// escribir cantidad + Enter => avanza a comentario.
const inpCantidadPOS = document.getElementById("inpCantidad");
if(inpCantidadPOS){
  inpCantidadPOS.addEventListener("keydown",e=>{
    if(e.key === "Enter"){
      e.preventDefault();
      e.stopPropagation();
      confirmarCantidad();
      return;
    }

    // Evita que flechas/rueda rompan el flujo si el usuario sólo está capturando.
    if(e.key === "Escape"){
      e.preventDefault();
      e.stopPropagation();
      cerrarModal("modalCantidad");
      productoTemporal = null;
      cantidadTemporal = 1;
      enfocarCapturaPOS();
    }
  });

  inpCantidadPOS.addEventListener("focus",()=>{
    // Cuando llega el focus desde teclado también selecciona el valor actual.
    requestAnimationFrame(()=>inpCantidadPOS.select());
  });

  inpCantidadPOS.addEventListener("wheel",e=>{
    if(document.activeElement === inpCantidadPOS){
      e.preventDefault();
    }
  },{passive:false});
}


// Focus/captura POS de cantidad: escribir y Enter para continuar.
const campoCantidadPOSFinal = document.getElementById("inpCantidad");
if(campoCantidadPOSFinal && !campoCantidadPOSFinal.dataset.focusPosCantidad){
  campoCantidadPOSFinal.dataset.focusPosCantidad = "1";

  campoCantidadPOSFinal.addEventListener("keydown", e=>{
    if(e.key === "Enter"){
      e.preventDefault();
      e.stopPropagation();
      confirmarCantidad();
    }
  });

  campoCantidadPOSFinal.addEventListener("focus", ()=>{
    requestAnimationFrame(()=>{
      try{ campoCantidadPOSFinal.select(); }catch(_){}
    });
  });
}

window.confirmarCantidad = function(){

  if(!productoTemporal) return;

  let cant = parseFloat(
    document.getElementById("inpCantidad").value
  );

  if(!Number.isFinite(cant) || cant <= 0){
    cant = 1;
  }

  cantidadTemporal = cant;

  cerrarModal("modalCantidad");

  const inpComentario =
    document.getElementById("inpComentario");

  inpComentario.value = "";

  abrirModal("modalComentario");

  setTimeout(()=>{
    inpComentario.focus();
  },120);

}

window.confirmarComentario = async function(){

  if(!productoTemporal) return;

  const comentario =
    document.getElementById("inpComentario")
    .value
    .trim();

  const fotosMeta = await leerFotosMeta(productoTemporal.codigoBarra);

const urlsFotos =
  fotosMeta && Array.isArray(fotosMeta.urlsFotos)
  ? fotosMeta.urlsFotos
  : [];

if(urlsFotos.length){
  mostrarFotosProducto(urlsFotos);
}else{
  mostrarFotosProducto([]);
}  
  const existente =
    carrito.find(x=>x.id === productoTemporal.id);

  if(existente){

    existente.cantidad += cantidadTemporal;

    if(comentario){

      existente.comentario =
        existente.comentario
        ? `${existente.comentario} | ${comentario}`
        : comentario;

    }

  }else{

    carrito.unshift({

      id:productoTemporal.id,
      codigo:productoTemporal.codigoBarra || "",
      nombre:productoTemporal.concepto || "",
      cantidad:cantidadTemporal,
      precio:Number(productoTemporal.precioPublico || 0),
      activo:productoTemporal.activo === true,
      comentario:comentario,

    });

  }

  if(navigator.vibrate){
    navigator.vibrate(50);
  }

  actualizarUI();

  cerrarModal("modalComentario");

  productoTemporal = null;
  cantidadTemporal = 1;
  enfocarCapturaPOS(true);

}

document.getElementById("inpComentario")
.addEventListener("keydown",e=>{

  if(e.key === "Enter"){

    e.preventDefault();

    confirmarComentario();

  }

});

function actualizarUI(){

  const lista =
    document.getElementById("listaItems");

  let total = 0;
  let piezas = 0;

  if(!carrito.length){

    lista.innerHTML = `
      <div style="padding:40px; text-align:center; color:#94a3b8;">
        🛒 Sin artículos
      </div>
    `;

  }else{

    lista.innerHTML = carrito.map((item,idx)=>{

      const subtotal =
        Number(item.cantidad)
        * Number(item.precio);

      total += subtotal;
      piezas += Number(item.cantidad);

      return `

        <div class="item-row">

          <div>

            <b>${escapeHtml(item.nombre)}</b>

            <br>

<small>

  ${escapeHtml(item.codigo)}

  ${
    item.activo
    ? '<span class="badge-activo">ACTIVO</span>'
    : '<span class="badge-inactivo">INACTIVO</span>'
  }

</small>

</div>

<div class="item-comment ${item.comentario ? '' : 'empty'}">
  ${item.comentario ? escapeHtml(item.comentario) : 'Sin comentarios'}
</div>

<div style="text-align:center; font-weight:900;">
  ${item.cantidad}
</div>


          <div style="text-align:right; font-weight:700;">
            $${subtotal.toFixed(2)}
          </div>

          <button
            class="btn-quitar"
            onclick="eliminar(${idx})"
          >
            ✕
          </button>

        </div>

      `;

    }).join("");

  }

  document.getElementById("countPartidas").innerText =
    carrito.length;

  document.getElementById("countPiezas").innerText =
    piezas;

  document.getElementById("totalEfectivo").innerText =
  `$${total.toFixed(2)}`;
  
}  
  window.eliminar = function(idx){

  carrito.splice(idx,1);

  actualizarUI();

}

window.abrirFoto = function(url){

  if(!url) return;

  window.open(url,"_blank");

}
let fotosProductoActual = [];
let indiceFotoActual = 0;
let ultimaFotoUrl = "";
let timerCarruselFotos = null;

const INTERVALO_CARRUSEL_FOTOS = 3000;

function detenerCarruselFotos(){
  if(timerCarruselFotos){
    clearInterval(timerCarruselFotos);
    timerCarruselFotos = null;
  }
}

function iniciarCarruselFotos(){
  detenerCarruselFotos();

  if(fotosProductoActual.length <= 1) return;

  timerCarruselFotos = setInterval(()=>{
    indiceFotoActual++;

    if(indiceFotoActual >= fotosProductoActual.length){
      indiceFotoActual = 0;
    }

    pintarFotoActual();
  }, INTERVALO_CARRUSEL_FOTOS);
}

function mostrarFotosProducto(urls){

  fotosProductoActual =
    Array.isArray(urls)
    ? urls.filter(x=>String(x || "").trim())
    : [];

  indiceFotoActual = 0;

  if(!fotosProductoActual.length){

    detenerCarruselFotos();
    ultimaFotoUrl = "";

    const box =
      document.getElementById("ultimaFotoBox");

    if(box){
      box.className = "foto-vacia";
      box.innerHTML = "Sin foto";
    }

    return;

  }

  pintarFotoActual();
  iniciarCarruselFotos();

}

function pintarFotoActual(){

  const box =
    document.getElementById("ultimaFotoBox");

  if(!box) return;

  ultimaFotoUrl =
    fotosProductoActual[indiceFotoActual];

  box.className = "";

  box.innerHTML = `
    <img
      id="ultimaFotoImg"
      src="${ultimaFotoUrl}"
      alt="Foto producto"
    >

    <div class="foto-contador">
      ${indiceFotoActual + 1} / ${fotosProductoActual.length}
    </div>

    <div class="foto-ayuda">
      Clic abre
    </div>
  `;

}

window.siguienteFoto = function(){

  if(!fotosProductoActual.length) return;

  indiceFotoActual++;

  if(indiceFotoActual >= fotosProductoActual.length){
    indiceFotoActual = 0;
  }

  pintarFotoActual();

  // Al cambiar manualmente, reinicia el conteo del carrusel.
  iniciarCarruselFotos();

}

window.abrirUltimaFoto = function(){

  if(!ultimaFotoUrl) return;

  window.open(ultimaFotoUrl,"_blank");

}
  
/* =========================
FINALIZAR
========================= */

document.getElementById("btnFinalizar")
.onclick = async ()=>{
  
  if(!carrito.length){
    alert("No hay artículos.");
    return;
  }

  if(!confirm("¿Finalizar solicitud?")){
    return;
  }

  try{

    const fol =
      document.getElementById("folioText").innerText;

    const total = carrito.reduce((a,b)=>{
      return a + (
        Number(b.cantidad)
        * Number(b.precio)
      );
    },0);

    await setDoc(

      doc(
        db,
        "TIENDAS",
        SUCURSAL,
        RUTA_TRANSFERENCIAS,
        fol
      ),

      {
        folio:fol,
        items:carrito,
        total,
        origen:SUCURSAL,
        fecha:new Date().toISOString()
      }

    );

    generarPDF(fol);

    carrito = [];

    actualizarUI();

    nuevoFolio();

    alert("Solicitud enviada.");

  }catch(e){

    console.error(e);

    alert("Error guardando.");

  }

}

/* =========================
PDF
========================= */

function generarPDF(folio){

  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF();

  pdf.text("PROVSOFT - SOLICITUD",14,15);

  pdf.autoTable({

    startY:25,

    head:[[
      "Código",
      "Descripción",
      "Cant",
      "Precio",
      "Subtotal",
      "Comentario"
    ]],

    body:carrito.map(i=>[
      i.codigo,
      i.nombre,
      i.cantidad,
      `$${Number(i.precio).toFixed(2)}`,
      `$${(
        Number(i.precio)
        * Number(i.cantidad)
      ).toFixed(2)}`,
      i.comentario || ""
    ])

  });

  pdf.save(`${folio}.pdf`);

}

/* =========================
INICIO
========================= */
const FRASES_CARGA = [
  "La limpieza es nuestra carta de presentación; el buen trato, nuestra garantía.",
  "Una buena comunicación es el puente entre la confusión y la claridad.",
  "La calidad se recuerda mucho después de que el precio se olvida.",
  "El servicio al cliente no es un departamento; es toda la empresa.",
  "De todos los motivo el número uno de porque los CLIENTES se VAN es el MAL TRATO.",
  "Saluda a los CLIENTES y sonrie ES GRATIS.",
  "Cada detalle cuenta cuando se busca la excelencia."

];
async function iniciar(){

  const inicioCarga = Date.now();

  const frase =
    FRASES_CARGA[
      Math.floor(Math.random() * FRASES_CARGA.length)
    ];

  document.getElementById("loadingFrase").innerHTML = frase;

  setLoading("Generando folio...",5);

  nuevoFolio();

  await cargarCatalogo();

  setLoading("Cargando fotos de productos...",90);

  await descargarFotosMetaSegundoPlano();

  actualizarUI();

  setLoading("Aplicación lista.",100);

  const tiempoMinimo = 5000;

  const transcurrido =
    Date.now() - inicioCarga;

  const restante =
    Math.max(0, tiempoMinimo - transcurrido);

  setTimeout(()=>{

    ocultarLoading();

    // Fotos ya cargadas al iniciar.

  }, restante);

}
  

document.getElementById("btnAbrirAgregar")
.onclick = ()=>{

  abrirModal("modalMenu");

};
async function guardarFotosMeta(data){

  const dbi = await abrirDB();

  return new Promise((resolve,reject)=>{

    const tx = dbi.transaction(STORE_FOTOS_META,"readwrite");
    const store = tx.objectStore(STORE_FOTOS_META);

    store.clear();

    data.forEach(f=>store.put(f));

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

async function leerFotosMeta(codigoBarra){

  const dbi = await abrirDB();

  return new Promise((resolve,reject)=>{

    const tx = dbi.transaction(STORE_FOTOS_META,"readonly");
    const req = tx.objectStore(STORE_FOTOS_META).get(String(codigoBarra || ""));

    req.onsuccess = ()=>{
      dbi.close();
      resolve(req.result || null);
    };

    req.onerror = ()=>{
      dbi.close();
      reject(req.error);
    };

  });

}

async function descargarFotosMetaSegundoPlano(){

  try{

    const snap = await getDocs(
      collection(db,"productos_fotos_meta")
    );

    const data = snap.docs.map(d=>({
      codigoBarra:String(d.id),
      ...d.data()
    }));

    await guardarFotosMeta(data);

    console.log("Fotos meta actualizadas:",data.length);

  }catch(e){

    console.warn("No se pudo actualizar fotos meta:",e);

  }

}

/* =========================
FLUJO POS / SCANNER
========================= */
function enfocarCapturaPOS(limpiar=false){
  const el=document.getElementById("scanInput");
  if(!el) return;
  if(limpiar) el.value="";
  setTimeout(()=>{ el.focus(); try{el.select();}catch(_){ } },80);
}

function buscarExactoPOS(valor){
  const raw=String(valor||"").trim();
  if(!raw) return null;
  return catalogo.find(p=>String(p.codigoBarra||"").trim()===raw) || null;
}

function esProbableCodigo(valor){
  const raw=String(valor||"").trim();
  return /^\d+$/.test(raw);
}

function sincronizarSugerenciasDesdeCaptura({forzar=false}={}){
  const scan=document.getElementById("scanInput");
  const raw=scan?.value?.trim()||"";
  if(!raw || (!forzar && (esProbableCodigo(raw) || raw.length<2))) return;

  abrirModal("modalNombre");
  const inp=document.getElementById("inpNombre");
  if(inp){
    inp.value=raw;
    inp.dispatchEvent(new Event("input",{bubbles:true}));
    setTimeout(()=>{
      inp.focus();
      inp.setSelectionRange(inp.value.length,inp.value.length);
    },30);
  }
}

const scanInput=document.getElementById("scanInput");
if(scanInput){
  scanInput.addEventListener("input",()=>{
    // Los códigos numéricos permanecen en captura. Texto/concepto abre multicoincidencias.
    sincronizarSugerenciasDesdeCaptura();
  });

  scanInput.addEventListener("keydown",e=>{
    if(e.key!=="Enter") return;
    e.preventDefault();
    const txt=scanInput.value.trim();
    if(!txt) return;
    const exacto=buscarExactoPOS(txt);
    if(exacto){
      seleccionarProducto(exacto.id);
      return;
    }
    // Si no existe como código exacto, tratarlo como concepto y mostrar sugerencias.
    sincronizarSugerenciasDesdeCaptura({forzar:true});
  });
}

// Escape cierra el modal visible y devuelve captura.
document.addEventListener("keydown",e=>{
  if(e.key!=="Escape") return;
  const abierto=[...document.querySelectorAll('.modal-backdrop')].reverse().find(x=>getComputedStyle(x).display!=="none");
  if(abierto){abierto.style.display="none";enfocarCapturaPOS();}
});

await iniciar();
enfocarCapturaPOS();


document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    detenerCarruselFotos();
  }else{
    iniciarCarruselFotos();
  }
});
