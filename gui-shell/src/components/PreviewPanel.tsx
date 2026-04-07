import {
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AmbientLight,
  AxesHelper,
  Box3,
  Camera,
  Color,
  DirectionalLight,
  GridHelper,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { convertStepExportToStl, convertStepUploadToStl } from "../api";
import { STORAGE_KEYS } from "../constants";
import { usePersistentState } from "../hooks/usePersistentState";
import type { UiStatus } from "../types";

type Props = {
  stlUrl?: string;
  stepUrl?: string;
  status: UiStatus;
};

const INSPECTOR_MIN_WIDTH = 240;
const INSPECTOR_MAX_WIDTH = 360;
const INSPECTOR_DEFAULT_WIDTH = 288;
const INSPECTOR_RESIZE_STEP = 24;

type ModelFormat = "stl" | "step" | "obj" | "ply";
type ViewerRenderer = {
  domElement: HTMLCanvasElement;
  dispose: () => void;
  render: (scene: Scene, camera: Camera) => void;
  setPixelRatio: (value: number) => void;
  setSize: (width: number, height: number) => void;
};
type ViewerRuntime = {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: ViewerRenderer;
  controls: OrbitControls;
  material: MeshStandardMaterial;
  ambientLight: AmbientLight;
  keyLight: DirectionalLight;
  fillLight: DirectionalLight;
  grid: GridHelper | null;
  axes: AxesHelper | null;
};

function detectFormat(path: string): ModelFormat | null {
  const clean = path.toLowerCase().split("?")[0];
  if (clean.endsWith(".stl")) return "stl";
  if (clean.endsWith(".step") || clean.endsWith(".stp")) return "step";
  if (clean.endsWith(".obj")) return "obj";
  if (clean.endsWith(".ply")) return "ply";
  return null;
}

function disposeObject(object: Object3D | null) {
  if (!object) return;
  object.traverse((child: Object3D) => {
    if ((child as Mesh).isMesh) {
      const mesh = child as Mesh;
      mesh.geometry.dispose();
    }
  });
}

function disposeMaterial(material: Material | Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry: Material) => entry.dispose());
    return;
  }
  material.dispose();
}

function loadStl(url: string, material: MeshStandardMaterial) {
  return import("three/examples/jsm/loaders/STLLoader.js").then(
    ({ STLLoader }) =>
      new Promise<Object3D>((resolve, reject) => {
        new STLLoader().load(
          url,
          (geometry: any) => {
            geometry.computeVertexNormals();
            geometry.center();
            resolve(new Mesh(geometry, material));
          },
          undefined,
          () => reject(new Error("Failed to load STL"))
        );
      })
  );
}

function loadObj(url: string, material: MeshStandardMaterial) {
  return import("three/examples/jsm/loaders/OBJLoader.js").then(
    ({ OBJLoader }) =>
      new Promise<Object3D>((resolve, reject) => {
        new OBJLoader().load(
          url,
          (object: Object3D) => {
            object.traverse((child: Object3D) => {
              if ((child as Mesh).isMesh) {
                (child as Mesh).material = material;
              }
            });
            resolve(object);
          },
          undefined,
          () => reject(new Error("Failed to load OBJ"))
        );
      })
  );
}

function loadPly(url: string, material: MeshStandardMaterial) {
  return import("three/examples/jsm/loaders/PLYLoader.js").then(
    ({ PLYLoader }) =>
      new Promise<Object3D>((resolve, reject) => {
        new PLYLoader().load(
          url,
          (geometry: any) => {
            geometry.computeVertexNormals();
            geometry.center();
            resolve(new Mesh(geometry, material));
          },
          undefined,
          () => reject(new Error("Failed to load PLY"))
        );
      })
  );
}

async function loadModel(
  url: string,
  format: ModelFormat,
  material: MeshStandardMaterial
) {
  if (format === "stl") return loadStl(url, material);
  if (format === "obj") return loadObj(url, material);
  if (format === "ply") return loadPly(url, material);
  throw new Error(
    "STEP preview uses server conversion. Use 'Load STEP' or upload STEP file."
  );
}

function clampInspectorWidth(next: number) {
  const safeNext = Number.isFinite(next) ? next : INSPECTOR_DEFAULT_WIDTH;
  return Math.max(
    INSPECTOR_MIN_WIDTH,
    Math.min(INSPECTOR_MAX_WIDTH, safeNext)
  );
}

export default function PreviewPanel({ stlUrl, stepUrl, status }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const localUrlRef = useRef<string | null>(null);
  const runtimeRef = useRef<ViewerRuntime | null>(null);
  const currentObjectRef = useRef<Object3D | null>(null);
  const loadSequenceRef = useRef(0);

  const [viewerReady, setViewerReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspectorWidth, setInspectorWidth] = usePersistentState<number>(
    STORAGE_KEYS.previewInspectorWidth,
    INSPECTOR_DEFAULT_WIDTH,
    {
      deserialize: (value) => clampInspectorWidth(Number(value)),
      serialize: (value) => String(value),
    }
  );
  const [rendererLabel, setRendererLabel] = useState("WebGL");
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize, setGridSize] = useState(120);
  const [gridDivisions, setGridDivisions] = useState(40);
  const [showAxes, setShowAxes] = useState(true);
  const [ambientIntensity, setAmbientIntensity] = useState(0.68);
  const [keyIntensity, setKeyIntensity] = useState(1.0);
  const [fillIntensity, setFillIntensity] = useState(0.32);
  const [bgColor, setBgColor] = useState("#f8f8fa");
  const [matColor, setMatColor] = useState("#9ca3af");
  const [metalness, setMetalness] = useState(0.12);
  const [roughness, setRoughness] = useState(0.62);
  const [modelUrl, setModelUrl] = useState<string | undefined>(stlUrl);
  const [modelFormat, setModelFormat] = useState<ModelFormat>("stl");
  const [modelSourceLabel, setModelSourceLabel] = useState("CadQuery STL");
  const [modelError, setModelError] = useState("");
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  function revokeLocalObjectUrl() {
    if (localUrlRef.current) {
      URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = null;
    }
  }

  function fitCamera(object3d: Object3D) {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const { camera, controls } = runtime;
    const box = new Box3().setFromObject(object3d);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);

    camera.near = maxDim / 1000;
    camera.far = maxDim * 1000;
    camera.updateProjectionMatrix();

    const distance = maxDim * 2.2;
    camera.position.set(
      center.x + distance * 0.8,
      center.y + distance * 0.7,
      center.z + distance * 0.8
    );

    controls.target.copy(center);
    controls.update();
  }

  function replaceCurrentObject(nextObject: Object3D | null) {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    if (currentObjectRef.current) {
      runtime.scene.remove(currentObjectRef.current);
      disposeObject(currentObjectRef.current);
      currentObjectRef.current = null;
    }

    if (nextObject) {
      runtime.scene.add(nextObject);
      currentObjectRef.current = nextObject;
      fitCamera(nextObject);
    }
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let raf = 0;
    let resizeObserver: ResizeObserver | null = null;

    const scene = new Scene();
    const camera = new PerspectiveCamera(
      35,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.01,
      2000
    );
    camera.up.set(0, 0, 1);
    camera.position.set(80, 60, 80);

    const material = new MeshStandardMaterial();
    const ambientLight = new AmbientLight(0xffffff, ambientIntensity);
    const keyLight = new DirectionalLight(0xffffff, keyIntensity);
    keyLight.position.set(25, 40, 20);
    const fillLight = new DirectionalLight(0xcfe0ff, fillIntensity);
    fillLight.position.set(-25, 15, -15);
    scene.add(ambientLight, keyLight, fillLight);

    const bootstrap = async () => {
      let renderer: ViewerRenderer;

      try {
        if ("gpu" in navigator) {
          const { WebGPURenderer } = (await import("three/webgpu")) as any;
          const gpuRenderer = new WebGPURenderer({ antialias: true });
          await gpuRenderer.init();
          renderer = gpuRenderer;
          setRendererLabel("WebGPU");
        } else {
          renderer = new WebGLRenderer({ antialias: true });
          setRendererLabel("WebGL");
        }
      } catch {
        renderer = new WebGLRenderer({ antialias: true });
        setRendererLabel("WebGL (fallback)");
      }

      if (disposed) {
        renderer.dispose();
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      mount.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.screenSpacePanning = false;
      controls.minDistance = 0.1;
      controls.maxDistance = 4000;

      runtimeRef.current = {
        scene,
        camera,
        renderer,
        controls,
        material,
        ambientLight,
        keyLight,
        fillLight,
        grid: null,
        axes: null,
      };

      resizeObserver = new ResizeObserver(() => {
        const runtime = runtimeRef.current;
        if (!runtime) return;

        const width = mount.clientWidth;
        const height = Math.max(mount.clientHeight, 1);
        runtime.camera.aspect = width / height;
        runtime.camera.updateProjectionMatrix();
        runtime.renderer.setSize(width, height);
      });
      resizeObserver.observe(mount);

      const tick = () => {
        raf = window.requestAnimationFrame(tick);
        runtimeRef.current?.controls.update();
        if (runtimeRef.current) {
          runtimeRef.current.renderer.render(
            runtimeRef.current.scene,
            runtimeRef.current.camera
          );
        }
      };

      tick();
      setViewerReady(true);
    };

    void bootstrap();

    return () => {
      disposed = true;
      loadSequenceRef.current += 1;
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(raf);
      replaceCurrentObject(null);

      if (runtimeRef.current) {
        runtimeRef.current.controls.dispose();
        runtimeRef.current.material.dispose();
        runtimeRef.current.renderer.dispose();
        if (runtimeRef.current.renderer.domElement.parentElement === mount) {
          mount.removeChild(runtimeRef.current.renderer.domElement);
        }
      }

      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!viewerReady || !runtime) return;

    runtime.scene.background = new Color(bgColor);
    runtime.material.color.set(matColor);
    runtime.material.metalness = metalness;
    runtime.material.roughness = roughness;
    runtime.material.needsUpdate = true;

    runtime.ambientLight.intensity = ambientIntensity;
    runtime.keyLight.intensity = keyIntensity;
    runtime.fillLight.intensity = fillIntensity;

    if (runtime.grid) {
      runtime.scene.remove(runtime.grid);
      runtime.grid.geometry.dispose();
      disposeMaterial(runtime.grid.material);
      runtime.grid = null;
    }

    if (showGrid) {
      const grid = new GridHelper(
        Math.max(10, gridSize),
        Math.max(4, gridDivisions),
        0xd5d5db,
        0xebebef
      );
      grid.rotateX(Math.PI / 2);
      runtime.scene.add(grid);
      runtime.grid = grid;
    }

    if (runtime.axes) {
      runtime.scene.remove(runtime.axes);
      runtime.axes.geometry.dispose();
      disposeMaterial(runtime.axes.material);
      runtime.axes = null;
    }

    if (showAxes) {
      const axes = new AxesHelper(Math.max(20, gridSize / 4));
      runtime.scene.add(axes);
      runtime.axes = axes;
    }
  }, [
    ambientIntensity,
    bgColor,
    fillIntensity,
    gridDivisions,
    gridSize,
    keyIntensity,
    matColor,
    metalness,
    roughness,
    showAxes,
    showGrid,
    viewerReady,
  ]);

  useEffect(() => {
    if (!stlUrl) return;

    revokeLocalObjectUrl();
    setModelError("");
    setModelUrl(stlUrl);
    setModelFormat("stl");
    setModelSourceLabel("CadQuery STL");
  }, [stlUrl]);

  useEffect(() => {
    if (!viewerReady || !runtimeRef.current) return;

    const runId = loadSequenceRef.current + 1;
    loadSequenceRef.current = runId;

    if (!modelUrl) {
      replaceCurrentObject(null);
      setIsLoadingModel(false);
      return;
    }

    setIsLoadingModel(true);
    setModelError("");

    void loadModel(modelUrl, modelFormat, runtimeRef.current.material)
      .then((nextObject) => {
        if (loadSequenceRef.current !== runId) {
          disposeObject(nextObject);
          return;
        }

        replaceCurrentObject(nextObject);
        setIsLoadingModel(false);
      })
      .catch((error: Error) => {
        if (loadSequenceRef.current !== runId) return;

        replaceCurrentObject(null);
        setIsLoadingModel(false);
        setModelError(error.message);
      });
  }, [modelFormat, modelUrl, viewerReady]);

  useEffect(
    () => () => {
      revokeLocalObjectUrl();
    },
    []
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const format = detectFormat(file.name);
    if (!format) {
      setModelError("Unsupported file format");
      return;
    }

    revokeLocalObjectUrl();

    if (format === "step") {
      try {
        setIsLoadingModel(true);
        const stlConvertedUrl = await convertStepUploadToStl(file);
        setModelUrl(stlConvertedUrl);
        setModelFormat("stl");
        setModelSourceLabel("Local STEP (converted)");
      } catch (error) {
        setIsLoadingModel(false);
        setModelError((error as Error).message);
      }
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    localUrlRef.current = objectUrl;
    setModelUrl(objectUrl);
    setModelFormat(format);
    setModelSourceLabel(`Local ${format.toUpperCase()}`);
  }

  const hasViewportContent = Boolean(modelUrl);

  function beginInspectorResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inspectorWidth;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      setInspectorWidth(clampInspectorWidth(startWidth + delta));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function handleInspectorSplitterKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>
  ) {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        setInspectorWidth((current) =>
          clampInspectorWidth(current + INSPECTOR_RESIZE_STEP)
        );
        break;
      case "ArrowRight":
        event.preventDefault();
        setInspectorWidth((current) =>
          clampInspectorWidth(current - INSPECTOR_RESIZE_STEP)
        );
        break;
      case "Home":
        event.preventDefault();
        setInspectorWidth(INSPECTOR_MIN_WIDTH);
        break;
      case "End":
        event.preventDefault();
        setInspectorWidth(INSPECTOR_MAX_WIDTH);
        break;
      default:
        break;
    }
  }

  const [viewTab, setViewTab] = useState("properties");

  return (
    <section className="panel previewShell paneSection paneSection--preview">
      <div className="panelHeader previewHeader">
        <div className="previewTitleBlock">
          <h3>Preview</h3>
          <div className="previewTitleMeta">
            <span className="rendererBadge">{`Renderer: ${rendererLabel}`}</span>
          </div>
        </div>
        <div className="previewHeaderMeta">
          <button
            type="button"
            onClick={() => setSettingsOpen((value) => !value)}
            aria-expanded={settingsOpen}
            aria-controls="preview-settings"
          >
            {settingsOpen ? "Hide Inspector" : "Show Inspector"}
          </button>
        </div>
      </div>
      <div className="viewportToolbar">
        <div className="viewportToolbarGroup">
          <label className="filePicker">
            Load File
            <input
              type="file"
              accept=".stl,.step,.stp,.obj,.ply"
              onChange={handleFileChange}
            />
          </label>
          {stepUrl ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  setIsLoadingModel(true);
                  const stlConvertedUrl = await convertStepExportToStl(stepUrl);
                  setModelUrl(stlConvertedUrl);
                  setModelFormat("stl");
                  setModelSourceLabel("CadQuery STEP (converted)");
                } catch (error) {
                  setIsLoadingModel(false);
                  setModelError((error as Error).message);
                }
              }}
            >
              Load STEP
            </button>
          ) : null}
        </div>
        <div className="viewportToolbarGroup">
          <span className="rendererBadge">{showGrid ? "Grid On" : "Grid Off"}</span>
        </div>
      </div>
      <div
        className={`previewWorkspace ${
          settingsOpen ? "previewWorkspace--inspector" : ""
        }`}
        style={
          settingsOpen
            ? ({
                "--preview-inspector": `${inspectorWidth}px`,
              } as CSSProperties)
            : undefined
        }
      >
        <div className="previewStage">
          <div className="previewBody">
            <div ref={mountRef} className="threeViewport" />
            {!hasViewportContent ? (
              <div className="previewOverlay emptyState">
                <p>Run script to generate preview</p>
              </div>
            ) : null}
            {hasViewportContent && isLoadingModel ? (
              <div className="previewOverlay">
                <p>Loading preview...</p>
              </div>
            ) : null}
          </div>
          {modelError ? <div className="diagnostics">{modelError}</div> : null}
        </div>
        {settingsOpen ? (
          <>
            <div
              className="previewInspectorSplitter"
              role="separator"
              aria-label="Resize preview inspector"
              aria-orientation="vertical"
              aria-valuemin={INSPECTOR_MIN_WIDTH}
              aria-valuemax={INSPECTOR_MAX_WIDTH}
              aria-valuenow={inspectorWidth}
              tabIndex={0}
              onPointerDown={beginInspectorResize}
              onKeyDown={handleInspectorSplitterKeyDown}
            />
            <aside className="previewInspector" id="preview-settings">
              <div className="inspectorTabs">
                <button
                  className={`inspectorTab ${viewTab === "properties" ? "inspectorTab--active" : ""}`}
                  onClick={() => setViewTab("properties")}
                >
                  Properties
                </button>
                <button
                  className={`inspectorTab ${viewTab === "scene" ? "inspectorTab--active" : ""}`}
                  onClick={() => setViewTab("scene")}
                >
                  Scene
                </button>
                <button
                  className={`inspectorTab ${viewTab === "export" ? "inspectorTab--active" : ""}`}
                  onClick={() => setViewTab("export")}
                >
                  Export
                </button>
              </div>
              <div className="previewInspectorBody">
                {viewTab === "properties" && (
                  <section className="previewInspectorSection">
                    <div className="previewInspectorLabel">Material</div>
                    <label className="previewColorField">
                      <span>Material</span>
                      <input
                        type="color"
                        value={matColor}
                        onChange={(event) => setMatColor(event.target.value)}
                      />
                    </label>
                    <label className="previewRangeField">
                      <span>Metalness</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={metalness}
                        onChange={(event) => setMetalness(Number(event.target.value))}
                      />
                    </label>
                    <label className="previewRangeField">
                      <span>Roughness</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={roughness}
                        onChange={(event) => setRoughness(Number(event.target.value))}
                      />
                    </label>
                  </section>
                )}
                {viewTab === "scene" && (
                  <>
                    <section className="previewInspectorSection">
                      <div className="previewInspectorLabel">Environment</div>
                      <label className="previewToggle">
                        <input
                          type="checkbox"
                          checked={showGrid}
                          onChange={(event) => setShowGrid(event.target.checked)}
                        />
                        <span>Show Grid</span>
                      </label>
                      <label className="previewToggle">
                        <input
                          type="checkbox"
                          checked={showAxes}
                          onChange={(event) => setShowAxes(event.target.checked)}
                        />
                        <span>Show Axes</span>
                      </label>
                      <label className="previewColorField">
                        <span>Background</span>
                        <input
                          type="color"
                          value={bgColor}
                          onChange={(event) => setBgColor(event.target.value)}
                        />
                      </label>
                    </section>
                    <section className="previewInspectorSection">
                      <div className="previewInspectorLabel">Grid</div>
                      <label className="previewRangeField">
                        <span>Grid Size</span>
                        <input
                          type="range"
                          min={40}
                          max={400}
                          step={10}
                          value={gridSize}
                          onChange={(event) => setGridSize(Number(event.target.value))}
                        />
                      </label>
                    </section>
                    <section className="previewInspectorSection">
                      <div className="previewInspectorLabel">Lighting</div>
                      <label className="previewRangeField">
                        <span>Ambient</span>
                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={0.02}
                          value={ambientIntensity}
                          onChange={(event) => setAmbientIntensity(Number(event.target.value))}
                        />
                      </label>
                      <label className="previewRangeField">
                        <span>Key Light</span>
                        <input
                          type="range"
                          min={0}
                          max={3}
                          step={0.02}
                          value={keyIntensity}
                          onChange={(event) => setKeyIntensity(Number(event.target.value))}
                        />
                      </label>
                    </section>
                  </>
                )}
                {viewTab === "export" && (
                  <section className="previewInspectorSection">
                    <div className="previewInspectorLabel">Downloads</div>
                    <div className="exportTabLinks">
                      {stlUrl ? (
                        <a href={stlUrl} download className="exportActionLink">
                          Download STL
                        </a>
                      ) : (
                        <p className="muted">No STL available</p>
                      )}
                      {stepUrl ? (
                        <a href={stepUrl} download className="exportActionLink">
                          Download STEP
                        </a>
                      ) : (
                        <p className="muted">No STEP available</p>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </aside>
          </>
        ) : null}
      </div>
    </section>
  );
}

