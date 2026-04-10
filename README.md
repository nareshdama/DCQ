# DCQ - Code-First CAD Workspace

DCQ is a modern, code-first CAD workspace designed for engineers, makers, and technical designers. It provides a premium, IDE-grade experience for writing [CadQuery](https://github.com/CadQuery/cadquery) scripts, with real-time visual feedback and professional export workflows.

Inspired by Apple-style visual discipline, DCQ aims to be a calm, fast, and keyboard-friendly environment for parametric 3D modeling.

## 🚀 Current Status

- **Builds & Types:** All TypeScript errors resolved; production builds for `gui-shell` and `viewer` are stable.
- **Security:** Hardened `gui-bridge` with restricted CORS and validated path handling.
- **Testing:** Core functionality verified with `pytest` in the Python virtual environment.
- **Editor Intelligence:** Phase 3 is complete with CadQuery autocomplete, inline parameter sliders, and editor squiggles for syntax/runtime diagnostics.
- **Assets:** Included standard assets (like `hex_nut.stl`) and generation scripts for a complete out-of-the-box experience.

## ✨ Core Features

- **Real-time Preview:** High-performance 3D rendering with WebGL/WebGPU support.
- **IDE Experience:** Integrated CodeMirror editor with CadQuery-aware autocomplete, inline parameter controls, and lint-style diagnostics.
- **CadQuery Integration:** Direct execution of Python-based CAD scripts.
- **Multi-format Exports:** Seamlessly export models to STL and STEP formats.
- **Example Library:** Built-in library of CadQuery documentation examples for quick learning.

## 🛠️ Project Structure

- `gui-shell/`: The main React + Vite frontend application.
- `gui-bridge/`: FastAPI-based Python server that executes CadQuery code.
- `viewer/`: A standalone lightweight 3D viewer for exported assets.
- `example-library/`: Curated CadQuery scripts and documentation.
- `tests/`: Automated test suite for the bridge and library.

## 🏁 Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- [CadQuery](https://cadquery.readthedocs.io/en/latest/installation.html) installed in your environment.

### Backend Setup (`gui-bridge`)
1. Navigate to `gui-bridge/`.
2. Install dependencies: `pip install -r requirements.txt`.
3. Start the server from `gui-bridge/`: `python server.py` or `python -m uvicorn server:app --host 127.0.0.1 --port 8008` (or use `start-hybrid-gui.ps1` from the repo root). Defaults to `http://127.0.0.1:8008`.

### Frontend Setup (`gui-shell`)
1. Navigate to `gui-shell/`.
2. Install dependencies: `npm install`.
3. Start development server: `npm run dev`.
4. Open your browser to the local Vite URL (typically `http://localhost:5173`). With the bridge running on port 8008, API calls are proxied in dev (no extra CORS setup). Override with `VITE_API_BASE_URL` if needed.

## 🗺️ Roadmap

Phases 1-3 are complete. The next major focus area is **Phase 4**, the state management refactor.

**Phases:**
1. **Phase 1:** Execution Robustness — complete.
2. **Phase 2:** Multi-Object Scene Graph — complete.
3. **Phase 3:** Editor Intelligence — complete.
4. **Phase 4:** State Management Refactor — Zustand store extraction from App.tsx.
5. **Phase 5:** AI-Powered CAD Intelligence — contextual prompts, parametric exploration.
6. **Phase 6:** Testing Infrastructure — Python, frontend, and E2E test suites.
7. **Phase 7:** Professional CAD Features — measurement, sections, advanced exports, BOM.
8. **Phase 8:** Deployment & Distribution — Docker, desktop app, cloud deployment.

For implementation details, acceptance criteria, and QA methods, see [ROADMAP.md](./ROADMAP.md).

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](./LICENSE) file for details.

---
Built by [Naresh Dama](https://github.com/nareshdama)
