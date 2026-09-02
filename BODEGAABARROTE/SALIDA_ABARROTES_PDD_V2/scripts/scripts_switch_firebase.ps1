param([Parameter(Mandatory=$true)][ValidateSet('viejo','nuevo')][string]$Active)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if (Test-Path (Join-Path $PSScriptRoot 'public')) { $root=Split-Path -Parent $PSScriptRoot }
$file=Join-Path $root 'public\assets\firebase-connections.js'
$content=Get-Content $file -Raw
if($Active -eq 'nuevo' -and $content -match 'nuevo:\s*\{[\s\S]*?enabled:\s*false'){ throw 'El perfil nuevo aun no esta configurado. Ejecuta 00_CONFIGURAR_FIREBASE_NUEVO.bat.' }
$content=[regex]::Replace($content,'export const ACTIVE_FIREBASE\s*=\s*"(?:viejo|nuevo)";','export const ACTIVE_FIREBASE = "'+$Active+'";')
Set-Content $file $content -Encoding UTF8
Write-Host "Perfil Firebase activo: $Active" -ForegroundColor Green
