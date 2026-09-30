param([string]$Avd = "SerboTalk_API_36", [ValidateRange(0.25, 1.0)][double]$WindowScale = 0.5, [switch]$Headless)
$ErrorActionPreference = "Stop"
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$emulator = Join-Path $sdk "emulator\emulator.exe"
if (-not (Test-Path -LiteralPath $emulator)) { throw "Android Emulator is not installed in the configured SDK." }
$available = & $emulator -list-avds
if ($available -notcontains $Avd) { throw "Requested AVD is not installed." }
$previousScale = $env:QT_SCALE_FACTOR
try {
    $env:QT_SCALE_FACTOR = $WindowScale.ToString([Globalization.CultureInfo]::InvariantCulture)
    # Visible interactive emulator requested by the owner. Keep Android resolution unchanged.
    $arguments = @("-avd", $Avd, "-no-snapshot", "-gpu", "software", "-feature", "-Vulkan", "-cores", "2", "-memory", "1536")
    if ($Headless) { $arguments += "-no-window" }
    $windowStyle = if ($Headless) { "Hidden" } else { "Normal" }
    Start-Process -FilePath $emulator -ArgumentList $arguments -WindowStyle $windowStyle | Out-Null
} finally { $env:QT_SCALE_FACTOR = $previousScale }
