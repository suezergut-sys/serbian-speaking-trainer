$ErrorActionPreference = "Stop"
$Repository = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Frontend = Join-Path $Repository "frontend"
$variables = @("VITE_API_BASE_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY")
$previous = @{}
foreach ($name in $variables) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }
Push-Location $Frontend
try {
    $env:VITE_API_BASE_URL = "http://10.0.2.2:8765"
    $env:VITE_SUPABASE_URL = "http://10.0.2.2:8766"
    $env:VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_testlab_local_only"
    node node_modules/vite/bin/vite.js build --mode testlab --outDir dist-testlab-android
    if ($LASTEXITCODE -ne 0) { throw "Testlab web build failed" }
    $labAssets = [IO.Path]::GetFullPath((Join-Path $Frontend "android\app\src\lab\assets"))
    $allowedLabRoot = [IO.Path]::GetFullPath((Join-Path $Frontend "android\app\src\lab")) + [IO.Path]::DirectorySeparatorChar
    if (-not $labAssets.StartsWith($allowedLabRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Invalid lab assets path" }
    if (Test-Path -LiteralPath $labAssets) { Remove-Item -LiteralPath $labAssets -Recurse -Force }
    New-Item -ItemType Directory -Path $labAssets -Force | Out-Null
    foreach ($configFile in @("capacitor.config.json", "capacitor.plugins.json")) {
        Copy-Item -LiteralPath (Join-Path $Frontend "android\app\src\main\assets\$configFile") -Destination $labAssets
    }
    $labConfigPath = Join-Path $labAssets "capacitor.config.json"
    $labConfig = Get-Content -LiteralPath $labConfigPath -Raw | ConvertFrom-Json
    $labConfig | Add-Member -NotePropertyName android -NotePropertyValue @{ allowMixedContent = $true; webContentsDebuggingEnabled = $true; loggingBehavior = "none" } -Force
    $labConfig | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $labConfigPath
    Copy-Item -LiteralPath (Join-Path $Frontend "dist-testlab-android") -Destination (Join-Path $labAssets "public") -Recurse
    Push-Location android
    try {
        .\gradlew.bat assembleLabDebug
        if ($LASTEXITCODE -ne 0) { throw "Testlab Android build failed" }
    } finally { Pop-Location }
    $destination = Join-Path $Repository "artifacts\testlab"
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Copy-Item -LiteralPath "android\app\build\outputs\apk\lab\debug\SerboTalk-andorid16-1.15.apk" -Destination $destination
} finally {
    foreach ($name in $variables) { [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process") }
    Pop-Location
}
