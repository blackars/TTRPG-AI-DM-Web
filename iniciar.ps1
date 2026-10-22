# Arranca TTRPG-Assistant (API 8100 + web 3010) en ventanas separadas.
# Uso:  .\iniciar.ps1
$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$api = Join-Path $raiz "api"
$web = Join-Path $raiz "web"
$python = Join-Path $api ".venv\Scripts\python.exe"

function Puerto-Ocupado([int]$puerto) {
    return [bool](Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue)
}

Write-Host "TTRPG-Assistant · comprobando entorno..." -ForegroundColor Cyan

if (-not (Test-Path $python)) {
    Write-Host "Creando entorno virtual de Python..." -ForegroundColor Yellow
    python -m venv (Join-Path $api ".venv")
    & $python -m pip install --upgrade pip
    & $python -m pip install -r (Join-Path $api "requirements.txt")
}

if (-not (Test-Path (Join-Path $web "node_modules"))) {
    Write-Host "Instalando dependencias de Next.js..." -ForegroundColor Yellow
    npm --prefix $web install
}

if (Puerto-Ocupado 8100) {
    Write-Host "AVISO: el puerto 8100 ya está ocupado. No arranco otra API." -ForegroundColor Yellow
} else {
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoExit", "-Command", "& '$python' -m uvicorn main:app --host 127.0.0.1 --port 8100" `
        -WorkingDirectory $api
    Write-Host "API lanzada en http://127.0.0.1:8100" -ForegroundColor Green
}

if (Puerto-Ocupado 3010) {
    Write-Host "AVISO: el puerto 3010 ya está ocupado. No arranco otra web." -ForegroundColor Yellow
} else {
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoExit", "-Command", "npm run dev" `
        -WorkingDirectory $web
    Write-Host "Web lanzada en http://127.0.0.1:3010" -ForegroundColor Green
}

Start-Sleep -Seconds 4

try {
    $salud = Invoke-RestMethod -Uri "http://127.0.0.1:8100/health" -TimeoutSec 5
    Write-Host "API OK · versión $($salud.version) · DB $($salud.db)" -ForegroundColor Green
} catch {
    Write-Host "La API aún no responde; revisa su ventana." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Mesa:    http://127.0.0.1:3010/pantalla/mesa" -ForegroundColor Cyan
Write-Host "Proyector: http://127.0.0.1:3010/proyector" -ForegroundColor Cyan
Write-Host "Docs API:  http://127.0.0.1:8100/docs" -ForegroundColor Cyan
Write-Host "Para parar: .\detener.ps1" -ForegroundColor DarkGray

Start-Process "http://127.0.0.1:3010/pantalla/mesa"
