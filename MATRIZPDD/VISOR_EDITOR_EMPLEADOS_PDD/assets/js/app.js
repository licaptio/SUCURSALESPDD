import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
const firebaseConfig = window.firebaseConfig;
const EMPLOYEES_COLLECTION = window.EMPLOYEES_COLLECTION || "CLIENTES/PDD031204KL5/EMPLEADOS";

const $=s=>document.querySelector(s); const rows=$("#employeeRows"), dialog=$("#editorDialog"), form=$("#editorForm"), grid=$("#fieldGrid");
let db, employees=[], selected=null, snapshotFields=new Set(), editorMode="edit", schemaTemplate={};
const reservedUpdateField="fechaActualizacion";

function toast(message,error=false){const el=$("#toast");el.textContent=message;el.className=`toast show${error?' error':''}`;setTimeout(()=>el.className="toast",3200)}
function setConnection(text,type){const el=$("#connectionBadge");el.textContent=text;el.className=`badge ${type}`}
function formatDate(value){if(!value)return "—";const d=value?.toDate?.()||new Date(value);return isNaN(d)?String(value):new Intl.DateTimeFormat("es-MX",{dateStyle:"medium",timeStyle:"short"}).format(d)}
function searchable(e){return Object.values(e.data).map(v=>v?.toDate?.()?formatDate(v):String(v??"")).join(" ").toLowerCase()+" "+e.id.toLowerCase()}
function render(){const q=$("#searchInput").value.trim().toLowerCase();const list=employees.filter(e=>searchable(e).includes(q));$("#employeeCount").textContent=employees.length;rows.innerHTML=list.length?list.map(e=>{const d=e.data;return `<tr><td><div class="employee-name">${esc(d.nombre||"Sin nombre")}</div><div class="employee-id">${esc(d.empleadoId||e.id)}</div></td><td>${esc(d.sucursal??"—")}</td><td><span class="status ${d.activo?'active':'inactive'}">${d.activo?'Activo':'Inactivo'}</span></td><td>${esc(formatDate(d.fechaActualizacion))}</td><td><button class="edit-button" data-id="${esc(e.id)}">Editar</button></td></tr>`}).join(""):`<tr><td colspan="5" class="empty">No hay empleados que coincidan.</td></tr>`}
function esc(v){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
function typeOf(v){if(v===null)return"null";if(v?.toDate)return"timestamp";if(Array.isArray(v))return"array";return typeof v}
function defaultForType(type,key){if(key===reservedUpdateField)return Timestamp.now();if(type==="boolean")return key==="activo"?true:false;if(type==="number")return 0;if(type==="timestamp")return Timestamp.now();if(type==="array")return[];if(type==="object")return{};if(type==="null")return null;return""}
function buildSchemaTemplate(){
  if(!employees.length){schemaTemplate={empleadoId:"",nombre:"",sucursal:"",activo:true,fechaActualizacion:Timestamp.now()};return}
  const fieldStats=new Map(), order=[];
  for(const e of employees){for(const [k,v] of Object.entries(e.data)){if(!fieldStats.has(k)){fieldStats.set(k,new Map());order.push(k)}const t=typeOf(v),m=fieldStats.get(k);m.set(t,(m.get(t)||0)+1)}}
  const mostComplete=[...employees].sort((a,b)=>Object.keys(b.data).length-Object.keys(a.data).length)[0]?.data||{};
  const keys=[...Object.keys(mostComplete),...order.filter(k=>!(k in mostComplete))];
  schemaTemplate={};
  for(const k of keys){const stats=fieldStats.get(k);const type=[...stats.entries()].sort((a,b)=>b[1]-a[1])[0][0];let example=employees.map(e=>e.data[k]).find(v=>typeOf(v)===type);schemaTemplate[k]=defaultForType(type,k);if(type==="array"&&Array.isArray(example))schemaTemplate[k]=[];if(type==="object"&&example&&typeof example==="object"&&!example?.toDate) schemaTemplate[k]={};}
}
function createField(key,value,mode=editorMode){const type=typeOf(value), wrap=document.createElement("div");wrap.className="field";const label=document.createElement("label");label.textContent=key;wrap.append(label);let input;
  if(type==="boolean"){input=document.createElement("select");input.innerHTML='<option value="true">true · Sí</option><option value="false">false · No</option>';input.value=String(value)}
  else{input=document.createElement("input");if(type==="number"){input.type="number";input.step="any";input.value=mode==="create"&&value===0?"":value}else if(type==="timestamp"){input.type="datetime-local";const d=value?.toDate?.()||new Date();input.value=new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}else if(type==="null"){input.type="text";input.value="";input.placeholder="null · Sin dato"}else if(type==="array"||type==="object"){input.value=JSON.stringify(value);input.readOnly=true}else{input.type="text";input.value=value??""}}
  input.name=key;input.dataset.type=type;if(key===reservedUpdateField){input.readOnly=true;input.title="Se actualiza automáticamente al guardar"}wrap.append(input);const hint=document.createElement("div");hint.className="hint";hint.textContent=key===reservedUpdateField?"Se actualiza automáticamente":`Tipo conservado: ${type}`;wrap.append(hint);return wrap}
async function loadEmployees(){rows.innerHTML='<tr><td colspan="5" class="empty">Cargando empleados…</td></tr>';try{const snap=await getDocs(collection(db,EMPLOYEES_COLLECTION));employees=snap.docs.map(x=>({id:x.id,data:x.data()})).sort((a,b)=>String(a.data.nombre||"").localeCompare(String(b.data.nombre||""),"es"));buildSchemaTemplate();render();setConnection("Conectado","online");$("#alert").classList.add("hidden")}catch(err){console.error(err);setConnection("Sin conexión","error");$("#alert").textContent="No se pudieron leer los empleados. Revisa la configuración y los permisos de Firestore.";$("#alert").classList.remove("hidden");rows.innerHTML='<tr><td colspan="5" class="empty">No fue posible cargar los datos.</td></tr>'}}
async function openEditor(id){editorMode="edit";const ref=doc(db,EMPLOYEES_COLLECTION,id),fresh=await getDoc(ref);if(!fresh.exists())return toast("El empleado ya no existe.",true);selected={id,ref,data:fresh.data()};snapshotFields=new Set(Object.keys(selected.data));$("#editorEyebrow").textContent="EXPEDIENTE";$("#editorTitle").textContent=selected.data.nombre||id;$("#editorPath").textContent=`/${EMPLOYEES_COLLECTION}/${id}`;$("#newDocIdWrap").classList.add("hidden");$("#editorNotice").textContent="Los nombres de los campos están protegidos. Esta pantalla no crea campos nuevos.";$("#saveBtn").textContent="Guardar cambios";grid.innerHTML="";Object.entries(selected.data).forEach(([k,v])=>grid.append(createField(k,v,"edit")));dialog.showModal()}
function openCreator(){
  if(!employees.length)return toast("Primero deben cargarse los empleados para detectar las columnas.",true);
  editorMode="create";selected={id:null,ref:null,data:{...schemaTemplate}};snapshotFields=new Set(Object.keys(schemaTemplate));
  $("#editorEyebrow").textContent="NUEVO EXPEDIENTE";$("#editorTitle").textContent="Agregar empleado";$("#editorPath").textContent=`/${EMPLOYEES_COLLECTION}/{ID_NUEVO}`;$("#newDocIdWrap").classList.remove("hidden");$("#newDocId").value="";
  $("#editorNotice").textContent="El formulario usa únicamente las columnas ya detectadas en los empleados existentes. No se crearán columnas adicionales.";$("#saveBtn").textContent="Crear empleado";
  grid.innerHTML="";Object.entries(schemaTemplate).forEach(([k,v])=>grid.append(createField(k,v,"create")));dialog.showModal();setTimeout(()=>$("#newDocId").focus(),50)
}
function parseInput(input){const t=input.dataset.type;if(t==="boolean")return input.value==="true";if(t==="number")return input.value.trim()===""?0:Number(input.value);if(t==="null")return input.value.trim()===""?null:input.value;if(t==="timestamp")return Timestamp.fromDate(new Date(input.value));if(t==="array"||t==="object")return editorMode==="create"?schemaTemplate[input.name]:selected.data[input.name];return input.value}
form.addEventListener("submit",async e=>{e.preventDefault();if(!selected)return;const btn=$("#saveBtn"),original=btn.textContent;btn.disabled=true;btn.textContent=editorMode==="create"?"Creando…":"Guardando…";try{
  if(editorMode==="create"){
    const newId=$("#newDocId").value.trim();if(!newId)throw new Error("Captura el ID del nuevo empleado.");if(newId.includes("/"))throw new Error("El ID no puede contener diagonales (/).");
    const ref=doc(db,EMPLOYEES_COLLECTION,newId),exists=await getDoc(ref);if(exists.exists())throw new Error("Ya existe un empleado con ese ID.");
    const data={};for(const input of form.querySelectorAll("#fieldGrid [name]")){if(!snapshotFields.has(input.name))throw new Error(`Campo no autorizado: ${input.name}`);data[input.name]=input.name===reservedUpdateField?Timestamp.now():parseInput(input)}
    if("empleadoId" in data && String(data.empleadoId??"").trim()==="")data.empleadoId=newId;
    if("nombre" in data && !String(data.nombre??"").trim())throw new Error("Captura el nombre del empleado.");
    await setDoc(ref,data);dialog.close();toast("Empleado creado correctamente");await loadEmployees();return;
  }
  const latest=await getDoc(selected.ref);if(!latest.exists())throw new Error("El documento ya no existe");const current=latest.data(),allowed=new Set(Object.keys(current)),updates={};for(const input of form.querySelectorAll("#fieldGrid [name]")){if(!snapshotFields.has(input.name)||!allowed.has(input.name))throw new Error(`Campo no autorizado: ${input.name}`);if(input.name!==reservedUpdateField)updates[input.name]=parseInput(input)}if(allowed.has(reservedUpdateField))updates[reservedUpdateField]=Timestamp.now();await updateDoc(selected.ref,updates);dialog.close();toast("Empleado actualizado correctamente");await loadEmployees()
}catch(err){console.error(err);toast(err.message||"No fue posible guardar",true)}finally{btn.disabled=false;btn.textContent=editorMode==="create"?"Crear empleado":"Guardar cambios"}});
rows.addEventListener("click",e=>{const b=e.target.closest("[data-id]");if(b)openEditor(b.dataset.id).catch(()=>toast("No se pudo abrir el empleado",true))});$("#searchInput").addEventListener("input",render);$("#refreshBtn").addEventListener("click",loadEmployees);$("#newEmployeeBtn").addEventListener("click",openCreator);$("#cancelBtn").addEventListener("click",()=>dialog.close());
try{if(!firebaseConfig||firebaseConfig.projectId==="REEMPLAZAR")throw new Error("Falta configurar Firebase");db=getFirestore(initializeApp(firebaseConfig));loadEmployees()}catch(err){setConnection("Configuración pendiente","error");$("#alert").textContent="No se pudo iniciar Firebase. Revisa la configuración y los permisos del proyecto.";$("#alert").classList.remove("hidden");rows.innerHTML='<tr><td colspan="5" class="empty">No fue posible iniciar la aplicación.</td></tr>'}
