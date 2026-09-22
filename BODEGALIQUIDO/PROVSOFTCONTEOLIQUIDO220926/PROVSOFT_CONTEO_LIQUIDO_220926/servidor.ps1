$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot 'assets'
$port = 8000
while ($port -lt 8020) {
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    $listener.Start(); break
  } catch { $port++ }
}
if ($port -ge 8020) { Write-Host 'No se encontro puerto disponible 8000-8019'; Read-Host; exit 1 }
$url = "http://127.0.0.1:$port/"
Write-Host "PROVSOFT LIQUIDO 220926"
Write-Host "Servidor activo: $url"
Start-Process $url
$mime = @{'.html'='text/html; charset=utf-8';'.js'='application/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json; charset=utf-8';'.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.jfif'='image/jpeg';'.svg'='image/svg+xml';'.ico'='image/x-icon'}
try {
while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream(); $reader = New-Object System.IO.StreamReader($stream,[Text.Encoding]::ASCII,$false,1024,$true)
    $line = $reader.ReadLine(); if (-not $line) { $client.Close(); continue }
    $parts = $line.Split(' '); $req = if($parts.Count -gt 1){$parts[1]}else{'/'}
    while (($h=$reader.ReadLine()) -ne '') { if ($null -eq $h) { break } }
    $req = [Uri]::UnescapeDataString(($req.Split('?')[0])).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($req)) { $req='index.html' }
    $candidate = [IO.Path]::GetFullPath((Join-Path $root $req.Replace('/',[IO.Path]::DirectorySeparatorChar)))
    $rootFull = [IO.Path]::GetFullPath($root)
    if (-not $candidate.StartsWith($rootFull,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $candidate -PathType Leaf)) {
      $body=[Text.Encoding]::UTF8.GetBytes('404'); $head="HTTP/1.1 404 Not Found`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
    } else {
      $body=[IO.File]::ReadAllBytes($candidate); $ext=[IO.Path]::GetExtension($candidate).ToLower(); $ct=if($mime.ContainsKey($ext)){$mime[$ext]}else{'application/octet-stream'}
      $head="HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
    }
    $hb=[Text.Encoding]::ASCII.GetBytes($head); $stream.Write($hb,0,$hb.Length); $stream.Write($body,0,$body.Length); $stream.Flush()
  } catch {} finally { $client.Close() }
}
} finally { $listener.Stop() }
