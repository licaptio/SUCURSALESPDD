$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$configFile=Join-Path $root 'FIREBASE_NUEVO_CONFIG.txt'
if (!(Test-Path $configFile)) { throw "No existe FIREBASE_NUEVO_CONFIG.txt" }

$v=@{}
Get-Content $configFile | ForEach-Object {
  $line=$_.Trim()
  if(!$line -or $line.StartsWith('#')) { return }
  $p=$line -split '=',2
  if($p.Count -eq 2){ $v[$p[0].Trim().ToUpperInvariant()]=$p[1].Trim() }
}
$required=@('APIKEY','AUTHDOMAIN','PROJECTID','STORAGEBUCKET','MESSAGINGSENDERID','APPID')
$missing=@($required | Where-Object { !$v[$_] })
if($missing.Count){ throw "Faltan datos: $($missing -join ', ')" }

$fb = [ordered]@{
  projects=[ordered]@{
    default=$v['PROJECTID']
    nuevo=$v['PROJECTID']
    viejo='inventariopv-643f1'
  }
}
$fb | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $root '.firebaserc') -Encoding UTF8

$conn=Join-Path $root 'public\assets\firebase-connections.js'
if(!(Test-Path $conn)){ throw "No existe public\assets\firebase-connections.js" }
function JS([string]$s){ return ($s -replace '\\','\\\\' -replace '"','\\"') }

$content=@"
// PROVSOFT - conexiones Firebase
export const FIREBASE_PROFILES = {
  viejo: {
    label: "Firebase anterior",
    enabled: true,
    config: {
      apiKey: "AIzaSyCK5nb6u2CGRJ8AB1aPlRn54b97bdeAFeM",
      authDomain: "inventariopv-643f1.firebaseapp.com",
      projectId: "inventariopv-643f1",
      storageBucket: "inventariopv-643f1.firebasestorage.app",
      messagingSenderId: "96242533231",
      appId: "1:96242533231:web:aae75a18fbaf9840529e9a"
    }
  },
  nuevo: {
    label: "Firebase nuevo",
    enabled: true,
    config: {
      apiKey: "$(JS $v['APIKEY'])",
      authDomain: "$(JS $v['AUTHDOMAIN'])",
      projectId: "$(JS $v['PROJECTID'])",
      storageBucket: "$(JS $v['STORAGEBUCKET'])",
      messagingSenderId: "$(JS $v['MESSAGINGSENDERID'])",
      appId: "$(JS $v['APPID'])"
    }
  }
};
export const ACTIVE_FIREBASE = "nuevo";
export function getActiveFirebaseConfig(){
  const p=FIREBASE_PROFILES[ACTIVE_FIREBASE];
  if(!p?.enabled) throw new Error("Perfil Firebase deshabilitado");
  return p.config;
}
"@
Set-Content $conn $content -Encoding UTF8
Set-Content (Join-Path $root '.firebase_data_project_id.txt') $v['PROJECTID'] -Encoding ASCII
Write-Host "Configurado para proyecto $($v['PROJECTID'])" -ForegroundColor Green
