$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $root ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    throw "Missing Python venv at .venv"
}

Set-Location $root

Write-Host "Installing bridge dependencies..."
& $venvPython -m pip install -r ".\gui-bridge\requirements.txt"

Write-Host "Installing shell dependencies..."
npm --prefix ".\gui-shell" install

Write-Host "Starting Python bridge..."
Start-Process -WindowStyle Minimized -FilePath $venvPython -ArgumentList "-m uvicorn server:app --host 127.0.0.1 --port 8008 --reload" -WorkingDirectory (Join-Path $root "gui-bridge")

Write-Host "Starting GUI shell..."
npm --prefix ".\gui-shell" run dev
