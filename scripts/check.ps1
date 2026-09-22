$ErrorActionPreference = "Stop"

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$VenvPython = Join-Path $RepositoryRoot ".venv\Scripts\python.exe"
$Python = if (Test-Path $VenvPython) { $VenvPython } else { "python" }

& $Python -m pytest (Join-Path $RepositoryRoot "backend\tests")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location (Join-Path $RepositoryRoot "frontend")
try {
    pnpm test --run
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    pnpm lint
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    pnpm build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}
