import { db, SUCURSALES } from "./config.js";
import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const state = { productos: [], producto: null, busy: false };
const DB_NAME = "PDD_REPORTE_PRODUCTOS";
const STORE = "catalogo";
const META = "meta";

function setStatus(text, type="") {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (type ? ` ${type}` : "");
}

function money(n){return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",minimumFractionDigits:2}).format(Number(n)||0)}
function num(n){return new Intl.NumberFormat("es-MX",{maximumFractionDigits:3}).format(Number(n)||0)}
function norm(s){return String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}

function openDB(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{
      const dbx=r.result;
      if(!dbx.objectStoreNames.contains(STORE)) dbx.createObjectStore(STORE,{keyPath:"id"});
      if(!dbx.objectStoreNames.contains(META)) dbx.createObjectStore(META,{keyPath:"key"});
    };
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
}
async function idbGetAll(){const d=await openDB();return new Promise((res,rej)=>{const tx=d.transaction(STORE,"readonly"),r=tx.objectStore(STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
async function idbReplace(items){const d=await openDB();return new Promise((res,rej)=>{const tx=d.transaction([STORE,META],"readwrite");const s=tx.objectStore(STORE);s.clear();for(const x of items)s.put(x);tx.objectStore(META).put({key:"updated",value:new Date().toISOString()});tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function idbMeta(){const d=await openDB();return new Promise((res,rej)=>{const r=d.transaction(META,"readonly").objectStore(META).get("updated");r.onsuccess=()=>res(r.result?.value||null);r.onerror=()=>rej(r.error)})}

async function cargarCatalogoLocal(){
  try{
    const local=await idbGetAll();
    if(local.length){state.productos=local;const f=await idbMeta();$("catalogInfo").textContent=`Catálogo local: ${local.length.toLocaleString("es-MX")} productos${f?` · actualizado ${new Date(f).toLocaleString("es-MX")}`:""}`;setStatus("Catálogo local listo. Busca un código o descripción.","ok");return true}
  }catch(e){console.warn(e)}
  return false;
}

async function actualizarCatalogo(){
  if(state.busy)return;state.busy=true;$("btnActualizar").disabled=true;setStatus("Descargando productos activos una sola vez para buscarlos localmente...");
  try{
    const snap=await getDocs(query(collection(db,"productos"),where("activo","==",true)));
    const items=snap.docs.map(d=>{const p=d.data();return {id:d.id,codigoBarra:String(p.codigoBarra??""),concepto:String(p.concepto??""),marca:String(p.marca??""),departamento:String(p.departamento??p.Departamento??"")}});
    await idbReplace(items);state.productos=items;$("catalogInfo").textContent=`Catálogo local: ${items.length.toLocaleString("es-MX")} productos · actualizado ahora`;setStatus("Catálogo actualizado y guardado localmente. Las búsquedas ya no leen Firebase.","ok");
  }catch(e){console.error(e);setStatus("No se pudo actualizar el catálogo: "+e.message,"error")}
  finally{state.busy=false;$("btnActualizar").disabled=false}
}

function buscarProductos(texto){
  const q=norm(texto);if(!q)return[];
  const tokens=q.split(/\s+/).filter(Boolean);
  return state.productos.map(p=>{const code=norm(p.codigoBarra), desc=norm(p.concepto), marca=norm(p.marca), hay=`${code} ${desc} ${marca}`;let score=0;if(code===q)score+=100;if(code.startsWith(q))score+=40;if(desc===q)score+=70;if(desc.startsWith(q))score+=30;if(tokens.every(t=>hay.includes(t)))score+=20;return {p,score}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.p.concepto.localeCompare(b.p.concepto)).slice(0,20).map(x=>x.p);
}

function renderSugerencias(){
  const cont=$("suggestions"), texto=$("buscarProducto").value.trim();
  if(!texto||!state.productos.length){cont.classList.remove("show");cont.innerHTML="";return}
  const arr=buscarProductos(texto);cont.innerHTML=arr.length?arr.map((p,i)=>`<button type="button" class="suggestion" data-i="${i}"><strong>${esc(p.concepto||"Sin descripción")}</strong><span>${esc(p.codigoBarra||"Sin código")}${p.marca?` · ${esc(p.marca)}`:""}</span></button>`).join(""):`<div class="small" style="padding:12px">Sin coincidencias en el catálogo local.</div>`;
  cont.classList.add("show");
  cont.querySelectorAll("button[data-i]").forEach(btn=>btn.addEventListener("click",()=>seleccionar(arr[Number(btn.dataset.i)])));
}
function seleccionar(p){state.producto=p;$("selectedName").textContent=p.concepto||"Sin descripción";$("selectedMeta").textContent=`Código: ${p.codigoBarra||"-"}${p.marca?` · ${p.marca}`:""}`;$("selected").classList.add("show");$("buscarProducto").value=p.codigoBarra||p.concepto||"";$("suggestions").classList.remove("show");limpiarResultados();setStatus("Producto seleccionado. Define el rango y ejecuta el reporte.","ok")}
function quitarSeleccion(){state.producto=null;$("selected").classList.remove("show");$("buscarProducto").value="";limpiarResultados();setStatus("Selecciona un producto.")}

function isoToRpt(iso){const [y,m,d]=iso.split("-");return `${d}/${m}/${y}`}
function fechasEntre(ini,fin){const a=new Date(ini+"T00:00:00Z"),b=new Date(fin+"T00:00:00Z");const out=[];for(let d=new Date(a);d<=b;d.setUTCDate(d.getUTCDate()+1))out.push(`${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${d.getUTCFullYear()}`);return out}
const cacheVentasProducto = new Map();

async function consultarSucursal(sucursal,codigo,fechas){
  // V3: sólo filtra por Codigo en Firestore. No usa agregaciones ni índice compuesto Codigo+Fecha.
  // El rango de fechas se aplica localmente sobre las partidas de ese producto.
  const cacheKey = `${sucursal}::${codigo}`;
  let docsProducto = cacheVentasProducto.get(cacheKey);
  let consultas = 0;

  if (!docsProducto) {
    const ref = collection(db,"TIENDAS",sucursal,"ventas");
    const q = query(ref, where("Codigo","==",String(codigo)));
    const snap = await getDocs(q);
    docsProducto = snap.docs.map(docSnap => docSnap.data());
    cacheVentasProducto.set(cacheKey, docsProducto);
    consultas = 1;
  }

  const fechasSet = new Set(fechas);
  let cantidad=0, venta=0, partidas=0;
  for (const d of docsProducto) {
    if (!fechasSet.has(String(d.Fecha ?? ""))) continue;
    cantidad += Number(d["Cantidad vendida"] || 0);
    venta += Number(d["venta Total"] || 0);
    partidas++;
  }

  return {sucursal,cantidad,venta,partidas,consultas,leidos:docsProducto.length};
}

function limpiarResultados(){$("resultados").hidden=true;$("tbody").innerHTML=""}
function renderResultados(rows,fechas){
  const tc=rows.reduce((a,x)=>a+x.cantidad,0),tv=rows.reduce((a,x)=>a+x.venta,0),tp=rows.reduce((a,x)=>a+x.partidas,0),tq=rows.reduce((a,x)=>a+x.consultas,0),tl=rows.reduce((a,x)=>a+(x.leidos||0),0);
  $("kCodigo").textContent=state.producto.codigoBarra||"-";$("kCantidad").textContent=num(tc);$("kVenta").textContent=money(tv);$("kPartidas").textContent=num(tp);
  $("tbody").innerHTML=rows.map(r=>`<tr><td>${esc(r.sucursal)}</td><td class="${r.cantidad===0?'zero':''}">${num(r.cantidad)}</td><td class="${r.venta===0?'zero':''}">${money(r.venta)}</td><td class="${r.partidas===0?'zero':''}">${num(r.partidas)}</td></tr>`).join("")+`<tr class="total-row"><td>TOTAL GENERAL</td><td>${num(tc)}</td><td>${money(tv)}</td><td>${num(tp)}</td></tr>`;
  $("queryInfo").textContent=`Periodo: ${fechas[0]} al ${fechas[fechas.length-1]} · ${fechas.length} día(s) · ${tq} consulta(s) a Firebase · ${tl.toLocaleString("es-MX")} partida(s) históricas del producto revisadas localmente. No usa agregaciones ni índice compuesto.`;
  $("resultados").hidden=false;
}

async function ejecutarReporte(){
  if(state.busy)return;if(!state.producto){setStatus("Primero selecciona un producto del catálogo.","warn");return}
  const ini=$("fechaIni").value,fin=$("fechaFin").value;if(!ini||!fin){setStatus("Selecciona fecha inicial y final.","warn");return}if(ini>fin){setStatus("La fecha inicial no puede ser posterior a la final.","warn");return}
  const fechas=fechasEntre(ini,fin);if(fechas.length>366){setStatus("Para proteger Firebase, esta versión limita cada reporte a 366 días.","warn");return}
  state.busy=true;$("btnReporte").disabled=true;limpiarResultados();setStatus(`Consultando ${SUCURSALES.length} sucursales sólo por código de producto...`);
  try{
    const codigo=String(state.producto.codigoBarra||"").trim();if(!codigo)throw new Error("El producto seleccionado no tiene codigoBarra.");
    const rows=[];
    for(let i=0;i<SUCURSALES.length;i++){
      setStatus(`Consultando ${SUCURSALES[i]} (${i+1}/${SUCURSALES.length})...`);
      rows.push(await consultarSucursal(SUCURSALES[i],codigo,fechas));
    }
    renderResultados(rows,fechas);setStatus("Reporte terminado.","ok");
  }catch(e){console.error(e);let msg=e.message||String(e);if(msg.toLowerCase().includes("index"))msg="Firestore está solicitando un índice inesperado. Esta versión V3 consulta únicamente por Codigo y no debería requerir índice compuesto.";setStatus("Error: "+msg,"error")}
  finally{state.busy=false;$("btnReporte").disabled=false}
}

function initFechas(){const h=new Date();const iso=h.toISOString().slice(0,10);$("fechaIni").value=iso;$("fechaFin").value=iso}
$("buscarProducto").addEventListener("input",renderSugerencias);$("btnActualizar").addEventListener("click",actualizarCatalogo);$("btnQuitar").addEventListener("click",quitarSeleccion);$("btnReporte").addEventListener("click",ejecutarReporte);
initFechas();
(async()=>{const ok=await cargarCatalogoLocal();if(!ok)await actualizarCatalogo()})();
