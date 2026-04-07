param(
    [string]$ScriptPath = ".\live_edit_demo.py"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvActivate = Join-Path $projectRoot ".venv\Scripts\Activate.ps1"

if (-not (Test-Path $venvActivate)) {
    Write-Error "Virtual environment not found at .venv. Create it first."
}

Set-Location $projectRoot
. $venvActivate

if (Test-Path $ScriptPath) {
    cq-editor $ScriptPath
} else {
    Write-Host "Script not found: $ScriptPath"
    Write-Host "Launching CQ-Editor without a file..."
    cq-editor
}
