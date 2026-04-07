export const STARTER_SCRIPT = `import cadquery as cq

length = 80.0
width = 50.0
height = 20.0
fillet_radius = 3.0
hole_diameter = 6.0

result = (
    cq.Workplane("XY")
    .box(length, width, height)
    .edges("|Z")
    .fillet(fillet_radius)
    .faces(">Z")
    .workplane()
    .hole(hole_diameter)
)
`;

export const SHELL_LAYOUT = {
  minEditorWidth: 360,
  minPreviewWidth: 420,
  maxPreviewWidth: 1100,
  minConsoleHeight: 120,
  maxConsoleHeight: 320,
  defaultPreviewRatio: 0.56,
  resizeStep: 40,
  shellChrome: 26,
} as const;

export const STORAGE_KEYS = {
  rightWidth: "cq-right-width-v2",
  consoleOpen: "cq-console-open-v1",
  consoleHeight: "cq-console-height-v1",
  compactMode: "cq-shell-compact-v1",
  editorHeaderCollapsed: "cq-editor-header-collapsed-v1",
  previewInspectorWidth: "cq-preview-inspector-width-v1",
} as const;
