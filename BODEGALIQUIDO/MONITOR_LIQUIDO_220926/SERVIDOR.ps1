$ErrorActionPreference = "Stop"
$port = 8001
$root = Join-Path $PSScriptRoot "assets"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()
Write-Host "PROVSOFT - MONITOR LIQUIDO / INVENTARIO 22-09-2026"
Write-Host "Servidor: http://127.0.0.1:$port/index.html"
Start-Process "http://127.0.0.1:$port/index.html"
$mime = @{'.html'='text/html; charset=utf-8';'.js'='application/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json; charset=utf-8';'.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.svg'='image/svg+xml';'.ico'='image/x-icon'}
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $file = Join-Path $root $rel
    $full = [IO.Path]::GetFullPath($file)
    $rootFull = [IO.Path]::GetFullPath($root)
    if (-not $full.StartsWith($rootFull) -or -not (Test-Path $full -PathType Leaf)) {
      $ctx.Response.StatusCode = 404; $ctx.Response.Close(); continue
    }
    $bytes = [IO.File]::ReadAllBytes($full)
    $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
    if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
    $ctx.Response.OutputStream.Close()
  }
} finally { $listener.Stop(); $listener.Close() }
