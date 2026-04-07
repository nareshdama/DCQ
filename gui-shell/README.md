# DCQ.io

This shell provides a modern, minimal UI for editing CadQuery scripts and
visualizing exports through a local Python bridge.

## Features

- Edit and run CadQuery scripts in a clean layout
- Live mode with debounced auto-run
- Export STL and STEP from the UI
- Keyboard-first controls:
  - `Ctrl/Cmd + R` run
  - `Ctrl/Cmd + E` export STL + STEP
  - `Ctrl/Cmd + K` toggle live mode

## Run

From `d:\CadQuery`:

```powershell
.\start-hybrid-gui.ps1
```

This starts:

- Python bridge at `http://127.0.0.1:8008`
- GUI shell at `http://127.0.0.1:5173`
