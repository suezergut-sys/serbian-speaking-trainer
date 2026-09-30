param([string]$Python = "python")
$ErrorActionPreference = "Stop"
$Repository = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Artifacts = Join-Path $Repository "artifacts\testlab"
New-Item -ItemType Directory -Path $Artifacts -Force | Out-Null
& $Python (Join-Path $PSScriptRoot "testing\setup_testlab.py")
if ($LASTEXITCODE -ne 0) { throw "Credential setup failed" }

foreach ($mode in @("auth", "api")) {
    $port = if ($mode -eq "auth") { 8766 } else { 8765 }
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        throw "Port $port is already occupied; no existing process will be replaced."
    }
}
$started = @()
try {
    foreach ($mode in @("auth", "api")) {
        $arguments = '"' + (Join-Path $PSScriptRoot "testing\testlab.py") + '" ' + $mode
        $process = Start-Process -FilePath $Python -ArgumentList $arguments -WorkingDirectory $Repository -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Artifacts "$mode.stdout.log") -RedirectStandardError (Join-Path $Artifacts "$mode.stderr.log")
        $started += $process.Id
    }
    $started | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Artifacts "processes.json")
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        try {
            Invoke-WebRequest -Uri "http://127.0.0.1:8765/api/health" -TimeoutSec 2 -UseBasicParsing | Out-Null
            Write-Output "Testlab backend ready on 127.0.0.1:8765; auth on 127.0.0.1:8766."
            exit 0
        } catch { Start-Sleep -Milliseconds 300 }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Testlab did not become ready. See artifacts/testlab/*.stderr.log."
} catch {
    foreach ($processId in $started) { Stop-Process -Id $processId -ErrorAction SilentlyContinue }
    throw
}
