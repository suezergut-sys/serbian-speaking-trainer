$ErrorActionPreference = "Stop"
$Repository = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$variables = @("VITE_API_BASE_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY")
$previous = @{}
foreach ($name in $variables) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }
Push-Location (Join-Path $Repository "frontend")
try {
    $env:VITE_API_BASE_URL = "http://127.0.0.1:8765"
    $env:VITE_SUPABASE_URL = "http://127.0.0.1:8766"
    $env:VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_testlab_local_only"
    node node_modules/vite/bin/vite.js build --mode testlab --outDir dist-testlab-web
    if ($LASTEXITCODE -ne 0) { throw "Testlab web build failed" }
} finally {
    foreach ($name in $variables) { [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process") }
    Pop-Location
}
