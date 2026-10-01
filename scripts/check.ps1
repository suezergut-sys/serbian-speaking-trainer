param([string]$PythonExecutable)
$ErrorActionPreference = "Stop"

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$VenvPython = Join-Path $RepositoryRoot ".venv\Scripts\python.exe"
$Python = if ($PythonExecutable) { $PythonExecutable } elseif (Test-Path $VenvPython) { $VenvPython } else { "python" }

Push-Location (Join-Path $RepositoryRoot "backend")
try {
    # Import app from this checkout even when reusing a virtualenv from another worktree.
    & $Python -m pytest tests (Join-Path $RepositoryRoot "scripts\testing")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }

node --test (Join-Path $RepositoryRoot "scripts\testing\android_resilience_guards.test.mjs")
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
