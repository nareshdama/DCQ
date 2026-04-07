# DCQ.io Frontend and UX Roadmap

## Objective
Build a code-first CAD workspace that feels like a modern IDE, with Apple-inspired visual discipline and strong professional workflows for modeling, previewing, debugging, and exporting.

Related architecture plan
- See `web-app-plan.md` for the deployment and remote-execution roadmap required to turn the current local tool into a true browser-hosted web app.

## Product Position
- Primary user: engineers, makers, and technical designers writing CadQuery scripts.
- Primary job: write code, run it quickly, inspect the result, fix issues, and export production-ready geometry.
- UX target: calm, premium, fast, keyboard-friendly, and visually restrained.

## Current State
- The shell is functional but not yet IDE-grade.
- The top bar carries too many responsibilities.
- The code editor is still a textarea.
- The preview panel rebuilds too much state when viewer controls change.
- API configuration is hardcoded to localhost.
- The frontend bundle is already large enough to justify code-splitting.

## Design Principles
- Content first: code and model preview are the primary surfaces.
- Quiet chrome: fewer visible controls, stronger defaults.
- Apple-inspired, not imitative: refined spacing, typography, motion, and materials without sacrificing density.
- Keyboard-first workflows: command palette, shortcuts, pane focus, and editor control must feel native.
- State clarity: every run state, error state, and export state must be obvious.

## Target Information Architecture
- Left rail: Examples, Files, History, Exports.
- Center workspace: code editor as the main canvas.
- Right inspector: Preview, Scene, Diagnostics, Export.
- Top titlebar: project context, run actions, environment state.
- Contextual surfaces: command palette, inline errors, lightweight notifications.

## Roadmap

### Phase 1: Product Shell and Layout
Goal: move from a demo-style split pane to an IDE shell.

Scope
- Rework the layout in `gui-shell/src/App.tsx`.
- Replace the crowded top bar with a titlebar + focused action group.
- Move examples out of the top bar into a left navigation rail.
- Turn the right pane into a tabbed inspector instead of a single panel.
- Make pane resizing more robust and keyboard accessible.

Deliverables
- Three-region shell: navigation, editor, inspector.
- Persistent layout preferences.
- Cleaner action model for `Run`, `Export`, `Live`, and `Command`.

Acceptance criteria
- The top-level UI hierarchy is understandable in under 5 seconds.
- Example browsing does not compete with run/export controls.
- The shell works cleanly on laptop and desktop widths.

### Phase 2: Real Editor Experience
Goal: replace the current textarea with an actual coding surface.

Scope
- Replace `gui-shell/src/components/CodeEditor.tsx` with Monaco or CodeMirror.
- Add line numbers, active line, bracket matching, code folding, and syntax coloring.
- Support inline diagnostics, gutter markers, and click-to-line navigation.
- Prepare extension points for autocomplete and snippet insertion.

Deliverables
- Production editor component.
- Diagnostics model shared between bridge responses and editor display.
- Strong keyboard support and editor focus behavior.

Acceptance criteria
- Editing feels materially better than a plain textarea.
- Diagnostics can be understood and navigated without scanning raw text blocks.
- Keyboard shortcuts do not conflict with browser defaults unnecessarily.

### Phase 3: Preview Engine Refactor
Goal: make the viewer feel stable, fast, and professional.

Scope
- Refactor `gui-shell/src/components/PreviewPanel.tsx`.
- Separate renderer lifecycle from model lifecycle.
- Stop rebuilding the whole scene for grid, lighting, and material changes.
- Preserve camera and controls when appearance settings change.
- Add clearer loading, empty, success, and error states.

Deliverables
- Persistent scene controller.
- Incremental viewer updates for appearance controls.
- Better model source labels and scene status feedback.

Acceptance criteria
- Toggling grid, axes, and lighting does not feel like a rerender reset.
- Preview controls are responsive and predictable.
- Model loading errors are isolated and easy to understand.

### Phase 4: Design System and Apple-Style Polish
Goal: build a coherent visual language instead of isolated styling choices.

Scope
- Expand `gui-shell/src/styles/tokens.css` into semantic design tokens.
- Rework `gui-shell/src/styles/app.css` around reusable shell, panel, toolbar, and control patterns.
- Introduce typography scale, status colors, focus rings, elevation rules, and motion timing.
- Use translucency selectively at shell level rather than uniformly.

Deliverables
- Tokenized color, spacing, radius, and motion system.
- Shared control styles for buttons, segmented controls, pills, panels, and overlays.
- Documented UI rules for future additions.

Acceptance criteria
- The product looks consistent at every layer.
- Primary, secondary, neutral, and destructive controls are visually distinct.
- Focus and hover states feel intentional, not incidental.

### Phase 5: Command Model and Workflow UX
Goal: make the app feel like a serious tool, not a page with controls.

Scope
- Replace the current button list palette with a searchable command palette.
- Add command grouping, keyboard hints, and action ranking.
- Introduce clearer state labels for run/export progress.
- Add lightweight notifications for background actions.

Deliverables
- Searchable command palette.
- Consistent action naming and shortcut display.
- Better handling for `Idle`, `Running`, `Succeeded`, `Failed`, and `Exporting`.

Acceptance criteria
- Frequent actions can be triggered without reaching for the mouse.
- Status changes are visible without becoming noisy.
- Commands are discoverable and scalable as features grow.

### Phase 6: Performance and Delivery
Goal: keep the app fast as the UI becomes more capable.

Scope
- Move API configuration out of hardcoded values in `gui-shell/src/api.ts`.
- Code-split heavy viewer dependencies and model loaders.
- Lazy-load preview tooling where possible.
- Reduce unnecessary rerenders in `App.tsx` and inspector controls.
- Address the current large Vite output with chunking strategy.

Deliverables
- Environment-based API base URL.
- Smaller initial bundle.
- Better component boundaries and state ownership.

Acceptance criteria
- The initial frontend load is materially smaller.
- Editor-first workflows remain responsive before preview modules finish loading.
- Local development and production deployment use the same config pattern.

### Phase 7: Accessibility and Quality Bar
Goal: raise the product to platform quality.

Scope
- Add stronger focus management, keyboard navigation, and semantic labels.
- Improve contrast and state communication.
- Add frontend tests for shell behavior and critical workflows.
- Validate responsive layout and pane behavior.

Deliverables
- Accessibility pass across shell, editor container, inspector, and palette.
- Regression coverage for core workflow surfaces.
- Cleaner empty, loading, and error states.

Acceptance criteria
- Keyboard users can operate the main workflow end to end.
- Focus is always visible and predictable.
- Layout does not degrade into stacked clutter on narrower screens.

## Immediate Wins
- Replace hardcoded API origin in `gui-shell/src/api.ts`.
- Convert top bar actions into grouped primary and secondary actions.
- Add a dedicated examples sidebar instead of the current select control.
- Refactor preview state so visual controls do not recreate the scene.
- Replace textarea editing before adding more tooling on top of it.

## Suggested Implementation Order
1. Phase 1: shell and layout
2. Phase 2: editor replacement
3. Phase 3: preview refactor
4. Phase 4: design system pass
5. Phase 5: command model
6. Phase 6: performance
7. Phase 7: accessibility and QA

## Success Metrics
- Faster time from opening the app to first successful model preview.
- Lower friction when switching examples, editing code, and rerunning.
- Fewer user-visible layout interruptions during preview updates.
- Smaller initial JS payload and better perceived responsiveness.
- A UI that feels intentionally designed rather than incrementally assembled.
