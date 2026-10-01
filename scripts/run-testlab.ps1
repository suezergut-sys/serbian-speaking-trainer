param(
    [ValidateSet("web", "android")][string]$Platform = "web",
    [ValidateSet("practice", "network", "lifecycle", "resilience", "all")][string]$Suite = "practice"
)
$ErrorActionPreference = "Stop"
if ($Platform -eq "android" -and $Suite -notin @("practice", "lifecycle", "resilience")) {
    throw "Android supports practice, lifecycle and resilience suites; network/all suites require the web runner."
}
if ($Platform -eq "web" -and $Suite -eq "lifecycle") {
    throw "Web lifecycle uses the isolated mock runner: from frontend run node node_modules/@playwright/test/cli.js test e2e/lifecycle.spec.mjs."
}
if ($Platform -eq "web" -and $Suite -eq "resilience") { throw "Resilience requires an Android testlab device." }
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
    if ($Platform -eq "web") {
        $specs = switch ($Suite) {
            "network" { @("local-network.spec.mjs") }
            "all" { @("local.spec.mjs", "local-network.spec.mjs") }
            default { @("local.spec.mjs") }
        }
        node node_modules/@playwright/test/cli.js test @specs
    }
    elseif ($Suite -eq "lifecycle") { node e2e/android-lifecycle.mjs }
    elseif ($Suite -eq "resilience") { node e2e/android-resilience.mjs }
    else { node e2e/android-testlab.mjs }
    if ($LASTEXITCODE -ne 0) { throw "$Platform testlab run failed" }
} finally {
    Remove-Item Env:TESTLAB_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:TESTLAB_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:TESTLAB_BASE_URL -ErrorAction SilentlyContinue
    Pop-Location
}
