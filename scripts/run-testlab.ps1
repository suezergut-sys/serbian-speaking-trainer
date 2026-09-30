param([ValidateSet("web", "android")][string]$Platform = "web")
$ErrorActionPreference = "Stop"
$Repository = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$values = @{}
Get-Content -LiteralPath (Join-Path $Repository ".env.testlab") | ForEach-Object {
    $parts = $_.Split("=", 2)
    if ($parts.Length -eq 2) { $values[$parts[0]] = $parts[1] }
}
$env:TESTLAB_EMAIL = $values["TESTLAB_EMAIL"]
$env:TESTLAB_PASSWORD = $values["TESTLAB_PASSWORD"]
$env:TESTLAB_BASE_URL = "http://127.0.0.1:5178"
Push-Location (Join-Path $Repository "frontend")
try {
    if ($Platform -eq "web") { node node_modules/@playwright/test/cli.js test local.spec.mjs }
    else { node e2e/android-testlab.mjs }
    if ($LASTEXITCODE -ne 0) { throw "$Platform testlab run failed" }
} finally {
    Remove-Item Env:TESTLAB_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:TESTLAB_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:TESTLAB_BASE_URL -ErrorAction SilentlyContinue
    Pop-Location
}
