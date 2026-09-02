param(
  [string]$ConfigFile = ""
)
$ErrorActionPreference='Stop'

$scriptsDir = $PSScriptRoot
$root = Split-Path -Parent $scriptsDir
if ([string]::IsNullOrWhiteSpace($ConfigFile)) {
  $ConfigFile = Join-Path $root 'config\FIREBASE_NUEVO_CONFIG.txt'
}
if (!(Test-Path $ConfigFile)) { throw "No existe el archivo de configuracion: $ConfigFile" }

$values = @{}
Get-Content $ConfigFile | ForEach-Object {
  $line = $_.Trim()
  if (!$line -or $line.StartsWith('#')) { return }
  $parts = $line -split '=',2
  if ($parts.Count -eq 2) {
    $values[$parts[0].Trim().ToUpperInvariant()] = $parts[1].Trim()
  }
}

$required = @('APIKEY','AUTHDOMAIN','PROJECTID','STORAGEBUCKET','MESSAGINGSENDERID','APPID')
$missing = @($required | Where-Object { !$values.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($values[$_]) })
if ($missing.Count -gt 0) {
  throw "Faltan valores en FIREBASE_NUEVO_CONFIG.txt: $($missing -join ', ')"
}

$file = Join-Path $root 'public\assets\firebase-connections.js'
if (!(Test-Path $file)) { throw "No existe $file" }

$backupDir = Join-Path $root 'backups-config'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backup = Join-Path $backupDir ('firebase-connections.'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.js')
Copy-Item $file $backup -Force

function JS([string]$v){ return ($v -replace '\\','\\\\' -replace '"','\\"') }

$old = @{
 apiKey='AIzaSyCK5nb6u2CGRJ8AB1aPlRn54b97bdeAFeM'
 authDomain='inventariopv-643f1.firebaseapp.com'
 projectId='inventariopv-643f1'
 storageBucket='inventariopv-643f1.firebasestorage.app'
 messagingSenderId='96242533231'
 appId='1:96242533231:web:aae75a18fbaf9840529e9a'
}

$content=@"
// PROVSOFT / SALIDA ABARROTES PDD - perfiles Firebase
// Generado automaticamente desde config/FIREBASE_NUEVO_CONFIG.txt.
// No elimina proyectos, colecciones ni datos.

export const FIREBASE_PROFILES = {
  viejo: {
    label: "Firebase anterior",
    enabled: true,
    config: {
      apiKey: "$($old.apiKey)",
      authDomain: "$($old.authDomain)",
      projectId: "$($old.projectId)",
      storageBucket: "$($old.storageBucket)",
      messagingSenderId: "$($old.messagingSenderId)",
      appId: "$($old.appId)"
    }
  },
  nuevo: {
    label: "Firebase nuevo",
    enabled: true,
    config: {
      apiKey: "$(JS $values['APIKEY'])",
      authDomain: "$(JS $values['AUTHDOMAIN'])",
      projectId: "$(JS $values['PROJECTID'])",
      storageBucket: "$(JS $values['STORAGEBUCKET'])",
      messagingSenderId: "$(JS $values['MESSAGINGSENDERID'])",
      appId: "$(JS $values['APPID'])"
    }
  }
};

export const ACTIVE_FIREBASE = "nuevo";

export function getActiveFirebaseConfig(){
  const profile=FIREBASE_PROFILES[ACTIVE_FIREBASE];
  if(!profile?.enabled) throw new Error("El perfil Firebase "+ACTIVE_FIREBASE+" esta deshabilitado.");
  const c=profile.config||{};
  const required=['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
  const missing=required.filter(k=>!String(c[k]||'').trim());
  if(missing.length) throw new Error("Configuracion Firebase incompleta ("+ACTIVE_FIREBASE+"): "+missing.join(", "));
  return c;
}
"@
Set-Content -Path $file -Value $content -Encoding UTF8

$projectId = $values['PROJECTID']
$rc = Join-Path $root '.firebaserc'
$obj = [ordered]@{projects=[ordered]@{default=$projectId; nuevo=$projectId; viejo=$old.projectId}}
$obj | ConvertTo-Json -Depth 8 | Set-Content -Path $rc -Encoding UTF8
Set-Content -Path (Join-Path $root '.firebase_data_project_id.txt') -Value $projectId -Encoding ASCII

Write-Host ""
Write-Host "FIREBASE NUEVO CONFIGURADO" -ForegroundColor Green
Write-Host "Proyecto nuevo: $projectId"
Write-Host "Perfil activo: nuevo"
Write-Host "Respaldo creado: $backup"
