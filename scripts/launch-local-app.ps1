$ErrorActionPreference = "Stop"

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BackendDirectory = Join-Path $RepositoryRoot "backend"
$FrontendDirectory = Join-Path $RepositoryRoot "frontend"
$Python = Join-Path $RepositoryRoot ".venv\Scripts\python.exe"
$Vite = Join-Path $FrontendDirectory "node_modules\.bin\vite.cmd"
$Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$BackendHealthUrl = "http://127.0.0.1:8000/api/health"
$FrontendUrl = "http://127.0.0.1:5173"

function Get-ListenerProcessId {
    param(
        [Parameter(Mandatory)]
        [int]$Port
    )

    return Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty OwningProcess
}

function Test-ProjectProcess {
    param(
        [Parameter(Mandatory)]
        [int]$ProcessId
    )

    $allProcesses = Get-CimInstance Win32_Process
    $currentId = $ProcessId
    for ($depth = 0; $depth -lt 8 -and $currentId; $depth++) {
        $process = $allProcesses | Where-Object ProcessId -eq $currentId | Select-Object -First 1
        if (-not $process) { break }
        if (
            ($process.ExecutablePath -and $process.ExecutablePath.StartsWith($RepositoryRoot, [StringComparison]::OrdinalIgnoreCase)) -or
            ($process.CommandLine -and $process.CommandLine.IndexOf($RepositoryRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0)
        ) {
            return $true
        }
        $currentId = $process.ParentProcessId
    }
    return $false
}

function Stop-ProjectListener {
    param(
        [Parameter(Mandatory)]
        [int]$Port,

        [Parameter(Mandatory)]
        [string]$ServiceName
    )

    $listenerId = Get-ListenerProcessId -Port $Port
    if (-not $listenerId) { return }
    if (-not (Test-ProjectProcess -ProcessId $listenerId)) {
        throw "$ServiceName port $Port is occupied by a process outside this project."
    }
    Stop-Process -Id $listenerId -Force
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while ((Get-ListenerProcessId -Port $Port) -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 200
    }
    if (Get-ListenerProcessId -Port $Port) {
        throw "$ServiceName did not release port $Port."
    }
}

function Test-BackendCodeIsNewer {
    $listenerId = Get-ListenerProcessId -Port 8000
    if (-not $listenerId) { return $false }
    $listener = Get-Process -Id $listenerId -ErrorAction SilentlyContinue
    if (-not $listener) { return $false }
    $latestSource = Get-ChildItem -Path $BackendDirectory -Recurse -File -Filter *.py |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    return $latestSource -and $latestSource.LastWriteTime -gt $listener.StartTime
}

function Test-HttpEndpoint {
    param(
        [Parameter(Mandatory)]
        [string]$Url
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 2 -UseBasicParsing
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    }
    catch {
        return $false
    }
}

function Wait-ForEndpoint {
    param(
        [Parameter(Mandatory)]
        [string]$Url,

        [Parameter(Mandatory)]
        [string]$ServiceName,

        [int]$TimeoutSeconds = 30
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-HttpEndpoint -Url $Url) {
            return
        }
        Start-Sleep -Milliseconds 400
    }

    throw "$ServiceName did not become available at $Url within $TimeoutSeconds seconds."
}

function Show-LaunchError {
    param(
        [Parameter(Mandatory)]
        [string]$Message
    )

    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        "Serbian Speaking Trainer",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
}

try {
    if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
        throw "Python virtual environment was not found: $Python"
    }
    if (-not (Test-Path -LiteralPath $Vite -PathType Leaf)) {
        throw "Frontend dependencies were not found. Run 'pnpm install' in $FrontendDirectory."
    }
    if (-not (Test-Path -LiteralPath $Chrome -PathType Leaf)) {
        throw "Google Chrome was not found: $Chrome"
    }

    Push-Location $RepositoryRoot
    try {
        & $Python -m app.db.cli seed
        if ($LASTEXITCODE -ne 0) {
            throw "Database migration and seed failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    if ((Test-HttpEndpoint -Url $BackendHealthUrl) -and (Test-BackendCodeIsNewer)) {
        Stop-ProjectListener -Port 8000 -ServiceName "Backend"
    }

    if (-not (Test-HttpEndpoint -Url $BackendHealthUrl)) {
        Start-Process `
            -FilePath $Python `
            -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
            -WorkingDirectory $BackendDirectory `
            -WindowStyle Hidden
        Wait-ForEndpoint -Url $BackendHealthUrl -ServiceName "Backend"
    }

    if (-not (Test-HttpEndpoint -Url $FrontendUrl)) {
        Start-Process `
            -FilePath $Vite `
            -ArgumentList @("--host", "127.0.0.1", "--port", "5173") `
            -WorkingDirectory $FrontendDirectory `
            -WindowStyle Hidden
        Wait-ForEndpoint -Url $FrontendUrl -ServiceName "Frontend"
    }

    Start-Process -FilePath $Chrome -ArgumentList @($FrontendUrl)
}
catch {
    Show-LaunchError -Message $_.Exception.Message
    exit 1
}
