# Detiene los procesos que escuchan en los puertos de TTRPG-Assistant.
# Uso:  .\detener.ps1
$puertos = @(8100, 3010)
foreach ($puerto in $puertos) {
    $procesos = Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    if (-not $procesos) {
        Write-Host "Puerto $puerto libre." -ForegroundColor DarkGray
        continue
    }
    foreach ($pidProceso in $procesos) {
        try {
            $nombre = (Get-Process -Id $pidProceso -ErrorAction Stop).ProcessName
            Stop-Process -Id $pidProceso -Force
            Write-Host "Detenido $nombre (PID $pidProceso) en puerto $puerto." -ForegroundColor Green
        } catch {
            Write-Host "No pude detener el PID $pidProceso del puerto $puerto." -ForegroundColor Yellow
        }
    }
}
