# DCQ - Code-First CAD Workspace

DCQ is a modern, code-first CAD workspace designed for engineers, makers, and technical designers. It provides a premium, IDE-grade experience for writing [CadQuery](https://github.com/CadQuery/cadquery) scripts, with real-time visual feedback and professional export workflows.

Inspired by Apple-style visual discipline, DCQ aims to be a calm, fast, and keyboard-friendly environment for parametric 3D modeling.

## 🚀 Current Status

- **Builds & Types:** All TypeScript errors resolved; production builds for `gui-shell` and `viewer` are stable.
- **Security:** Hardened `gui-bridge` with restricted CORS and validated path handling.
- **Testing:** Core functionality verified with `pytest` in the Python virtual environment.
- **Assets:** Included standard assets (like `hex_nut.stl`) and generation scripts for a complete out-of-the-box experience.

## ✨ Core Features

- **Real-time Preview:** High-performance 3D rendering with WebGL/WebGPU support.
- **IDE Experience:** Integrated code editor (migrating to CodeMirror/Monaco) with syntax highlighting.
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
3. Start the server: `python server.py`. (Defaults to `http://localhost:8008`).

### Frontend Setup (`gui-shell`)
1. Navigate to `gui-shell/`.
2. Install dependencies: `npm install`.
3. Start development server: `npm run dev`.
4. Open your browser to the local Vite URL (typically `http://localhost:5173`).

## 🗺️ Roadmap

We are currently in **Phase 1** of our development roadmap, focusing on the product shell and layout refinement.

**Upcoming Milestones:**
1. **Phase 2:** Transition to a full Monaco/CodeMirror editor experience.
2. **Phase 3:** Refactor the preview engine for better stability and performance.
3. **Phase 4:** Deep visual polish and design system implementation.
4. **Phase 5:** Introduction of a searchable command palette and improved workflow UX.

For a detailed breakdown, see [ROADMAP.md](./ROADMAP.md).

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](./LICENSE) file for details.

---
Built by [Naresh Dama](https://github.com/nareshdama)
