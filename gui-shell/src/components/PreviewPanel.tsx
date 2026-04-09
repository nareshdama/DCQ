import {
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
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
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { convertStepExportToStl, convertStepUploadToStl } from "../api";
import { STORAGE_KEYS } from "../constants";
import { usePersistentState } from "../hooks/usePersistentState";

type Props = {
  stlUrl?: string;
  stepUrl?: string;
};

type CameraPreset = "front" | "back" | "top" | "bottom" | "right" | "left" | "iso";

/* ── Scene Metrics ──
   Single source of truth for all model-size-dependent viewport parameters.
   When no model is loaded, we use a sensible default (100-unit workspace).
   Every grid spacing, axis length, camera clip plane, light position, orbit
   sensitivity, and display precision is derived from the bounding box. */

type SceneMetrics = {
  maxDim: number;
  center: Vector3;
  size: Vector3;
  gridSpan: number;
  gridStep: number;
  gridDivisions: number;
  gridLabel: string;
  axesLength: number;
  cameraNear: number;
  cameraFar: number;
  fitDistance: number;
  lightDistance: number;
  orbitMinDistance: number;
  orbitMaxDistance: number;
  orbitPanSpeed: number;
  coordPrecision: number;
};

const DEFAULT_WORKSPACE_SIZE = 100;

function niceGridStep(maxDim: number): number {
  const raw = maxDim / 10;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

function formatGridLabel(step: number): string {
  if (step >= 1000) return `${step / 1000}k`;
  if (step >= 1) return `${step}`;
  if (step >= 0.1) return `${step}`;
  return step.toFixed(3);
}

function coordPrecisionForScale(maxDim: number): number {
  if (maxDim < 1) return 4;
  if (maxDim < 10) return 3;
  if (maxDim < 1000) return 2;
  if (maxDim < 10000) return 1;
  return 0;
}

function computeSceneMetrics(object: Object3D | null): SceneMetrics {
  let center: Vector3;
  let size: Vector3;
  let maxDim: number;

  if (object) {
    const box = new Box3().setFromObject(object);
    center = box.getCenter(new Vector3());
    size = box.getSize(new Vector3());
    maxDim = Math.max(size.x, size.y, size.z, 0.01);
  } else {
    center = new Vector3(0, 0, 0);
    size = new Vector3(DEFAULT_WORKSPACE_SIZE, DEFAULT_WORKSPACE_SIZE, DEFAULT_WORKSPACE_SIZE);
    maxDim = DEFAULT_WORKSPACE_SIZE;
  }

  const gridStep = niceGridStep(maxDim);
  const gridSpan = gridStep * 12;
  const gridDivisions = Math.round(gridSpan / gridStep);

  return {
    maxDim,
    center,
    size,
    gridSpan,
    gridStep,
    gridDivisions,
    gridLabel: formatGridLabel(gridStep),
    axesLength: maxDim * 0.6,
    cameraNear: maxDim / 2000,
    cameraFar: maxDim * 2000,
    fitDistance: maxDim * 2.2,
    lightDistance: maxDim * 2,
    orbitMinDistance: maxDim / 200,
    orbitMaxDistance: maxDim * 50,
    orbitPanSpeed: Math.max(0.3, maxDim / 300),
    coordPrecision: coordPrecisionForScale(maxDim),
  };
}

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

export default function PreviewPanel({ stlUrl, stepUrl }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const localUrlRef = useRef<string | null>(null);
  const runtimeRef = useRef<ViewerRuntime | null>(null);
  const currentObjectRef = useRef<Object3D | null>(null);
  const loadSequenceRef = useRef(0);
  const renderDirtyRef = useRef(true);
  const renderLoopingRef = useRef(false);
  const rafRef = useRef(0);

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
  const [showAxes, setShowAxes] = useState(true);
  const [ambientIntensity, setAmbientIntensity] = useState(0.68);
  const [keyIntensity, setKeyIntensity] = useState(1.0);
  const [fillIntensity, setFillIntensity] = useState(0.32);
  const metricsRef = useRef<SceneMetrics>(computeSceneMetrics(null));
  const [sceneMetrics, setSceneMetrics] = useState<SceneMetrics>(() => computeSceneMetrics(null));
  const [bgColor, setBgColor] = useState("#1A1A1C");
  const [matColor, setMatColor] = useState("#8E8E93");
  const [metalness, setMetalness] = useState(0.12);
  const [roughness, setRoughness] = useState(0.62);
  const [modelUrl, setModelUrl] = useState<string | undefined>(stlUrl);
  const [modelFormat, setModelFormat] = useState<ModelFormat>("stl");
  const [modelSourceLabel, setModelSourceLabel] = useState("CadQuery STL");
  const [modelError, setModelError] = useState("");
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [cursorWorldPos, setCursorWorldPos] = useState<{ x: string; y: string; z: string } | null>(null);

  const dampingFramesRef = useRef(0);
  const DAMPING_TAIL_FRAMES = 30;

  const scheduleFrame = useCallback(() => {
    if (renderLoopingRef.current) return;
    renderLoopingRef.current = true;

    const tick = () => {
      const rt = runtimeRef.current;
      if (!rt) {
        renderLoopingRef.current = false;
        return;
      }

      rt.controls.update();
      rt.renderer.render(rt.scene, rt.camera);

      if (renderDirtyRef.current) {
        renderDirtyRef.current = false;
        dampingFramesRef.current = DAMPING_TAIL_FRAMES;
        rafRef.current = requestAnimationFrame(tick);
      } else if (dampingFramesRef.current > 0) {
        dampingFramesRef.current -= 1;
        rafRef.current = requestAnimationFrame(tick);
      } else {
        renderLoopingRef.current = false;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const requestRender = useCallback(() => {
    renderDirtyRef.current = true;
    scheduleFrame();
  }, [scheduleFrame]);

  function revokeLocalObjectUrl() {
    if (localUrlRef.current) {
      URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = null;
    }
  }

  function applyMetrics(metrics: SceneMetrics) {
    metricsRef.current = metrics;
    setSceneMetrics(metrics);

    const runtime = runtimeRef.current;
    if (!runtime) return;

    const { camera, controls } = runtime;

    camera.near = metrics.cameraNear;
    camera.far = metrics.cameraFar;
    camera.updateProjectionMatrix();

    controls.minDistance = metrics.orbitMinDistance;
    controls.maxDistance = metrics.orbitMaxDistance;
    controls.panSpeed = metrics.orbitPanSpeed;
    controls.zoomSpeed = Math.max(0.5, metrics.maxDim / 200);

    runtime.keyLight.position.set(
      metrics.lightDistance * 0.7,
      metrics.lightDistance * 1.1,
      metrics.lightDistance * 0.6,
    );
    runtime.fillLight.position.set(
      -metrics.lightDistance * 0.7,
      metrics.lightDistance * 0.4,
      -metrics.lightDistance * 0.4,
    );
  }

  function fitCamera(object3d: Object3D) {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const metrics = computeSceneMetrics(object3d);
    applyMetrics(metrics);

    const { camera, controls } = runtime;
    const d = metrics.fitDistance;
    camera.position.set(
      metrics.center.x + d * 0.8,
      metrics.center.y + d * 0.7,
      metrics.center.z + d * 0.8,
    );
    controls.target.copy(metrics.center);
    controls.update();
    requestRender();
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
    } else {
      applyMetrics(computeSceneMetrics(null));
      requestRender();
    }
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
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

    const defaultMetrics = metricsRef.current;
    const material = new MeshStandardMaterial();
    const ambientLight = new AmbientLight(0xffffff, ambientIntensity);
    const keyLight = new DirectionalLight(0xffffff, keyIntensity);
    keyLight.position.set(
      defaultMetrics.lightDistance * 0.7,
      defaultMetrics.lightDistance * 1.1,
      defaultMetrics.lightDistance * 0.6,
    );
    const fillLight = new DirectionalLight(0xcfe0ff, fillIntensity);
    fillLight.position.set(
      -defaultMetrics.lightDistance * 0.7,
      defaultMetrics.lightDistance * 0.4,
      -defaultMetrics.lightDistance * 0.4,
    );
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
      controls.minDistance = defaultMetrics.orbitMinDistance;
      controls.maxDistance = defaultMetrics.orbitMaxDistance;
      controls.panSpeed = defaultMetrics.orbitPanSpeed;
      controls.zoomSpeed = Math.max(0.5, defaultMetrics.maxDim / 200);

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
        requestRender();
      });
      resizeObserver.observe(mount);

      controls.addEventListener("change", requestRender);

      requestRender();
      setViewerReady(true);
    };

    void bootstrap();

    return () => {
      disposed = true;
      loadSequenceRef.current += 1;
      resizeObserver?.disconnect();
      cancelAnimationFrame(rafRef.current);
      renderLoopingRef.current = false;
      replaceCurrentObject(null);

      if (runtimeRef.current) {
        runtimeRef.current.controls.removeEventListener("change", requestRender);
        runtimeRef.current.controls.dispose();
        runtimeRef.current.material.dispose();
        runtimeRef.current.renderer.dispose();
        if (runtimeRef.current.renderer.domElement.parentElement === mount) {
          mount.removeChild(runtimeRef.current.renderer.domElement);
        }
      }

      runtimeRef.current = null;
    };
  }, [requestRender]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!viewerReady || !runtime) return;

    const m = metricsRef.current;

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
        m.gridSpan,
        m.gridDivisions,
        0x3a3a3c,
        0x2c2c2e,
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
      const axes = new AxesHelper(m.axesLength);
      runtime.scene.add(axes);
      runtime.axes = axes;
    }

    requestRender();
  }, [
    ambientIntensity,
    bgColor,
    fillIntensity,
    keyIntensity,
    matColor,
    metalness,
    roughness,
    requestRender,
    showAxes,
    showGrid,
    sceneMetrics,
    viewerReady,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.material.wireframe = wireframe;
    runtime.material.needsUpdate = true;
    requestRender();
  }, [wireframe, requestRender, viewerReady]);

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

  useEffect(() => {
    const mount = mountRef.current;
    const runtime = runtimeRef.current;
    if (!mount || !runtime) return;

    const raycaster = new Raycaster();
    const mouse = new Vector2();

    function onMouseMove(event: MouseEvent) {
      const rt = runtimeRef.current;
      const obj = currentObjectRef.current;
      if (!rt || !obj) {
        setCursorWorldPos(null);
        return;
      }
      const rect = mount!.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, rt.camera);
      const meshes: Mesh[] = [];
      obj.traverse((child: Object3D) => {
        if ((child as Mesh).isMesh) meshes.push(child as Mesh);
      });
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const p = hits[0].point;
        const prec = metricsRef.current.coordPrecision;
        setCursorWorldPos({
          x: p.x.toFixed(prec),
          y: p.y.toFixed(prec),
          z: p.z.toFixed(prec),
        });
      } else {
        setCursorWorldPos(null);
      }
    }

    function onMouseLeave() {
      setCursorWorldPos(null);
    }

    mount.addEventListener("mousemove", onMouseMove);
    mount.addEventListener("mouseleave", onMouseLeave);
    return () => {
      mount.removeEventListener("mousemove", onMouseMove);
      mount.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [viewerReady]);

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

  const modelInfo = useMemo(() => {
    const obj = currentObjectRef.current;
    if (!obj) return null;
    const box = new Box3().setFromObject(obj);
    const size = box.getSize(new Vector3());
    const prec = metricsRef.current.coordPrecision;
    let triangles = 0;
    obj.traverse((child: Object3D) => {
      if ((child as Mesh).isMesh) {
        const geo = (child as Mesh).geometry;
        if (geo.index) {
          triangles += geo.index.count / 3;
        } else {
          triangles += (geo.attributes.position?.count ?? 0) / 3;
        }
      }
    });
    return {
      width: size.x.toFixed(prec),
      height: size.y.toFixed(prec),
      depth: size.z.toFixed(prec),
      triangles: Math.round(triangles),
    };
  }, [modelUrl, isLoadingModel, sceneMetrics]);

  const fitToView = useCallback(() => {
    const obj = currentObjectRef.current;
    if (obj) fitCamera(obj);
  }, []);

  const setCameraPreset = useCallback(
    (preset: CameraPreset) => {
      const runtime = runtimeRef.current;
      if (!runtime) return;

      const m = metricsRef.current;
      const dist = m.fitDistance * 1.15;

      const offsets: Record<string, [number, number, number]> = {
        front: [0, -dist, 0],
        back: [0, dist, 0],
        top: [0, 0, dist],
        bottom: [0, 0, -dist],
        right: [dist, 0, 0],
        left: [-dist, 0, 0],
        iso: [dist * 0.7, -dist * 0.7, dist * 0.7],
      };

      const [ox, oy, oz] = offsets[preset];
      runtime.camera.position.set(m.center.x + ox, m.center.y + oy, m.center.z + oz);
      runtime.controls.target.copy(m.center);
      runtime.controls.update();
      requestRender();
    },
    [requestRender]
  );

  return (
    <section className="panel previewShell paneSection paneSection--preview">
      <div className="panelHeader previewHeader">
        <div className="previewTitleBlock">
          <h3>Preview</h3>
          <div className="previewTitleMeta">
            <span className="rendererBadge">{`Renderer: ${rendererLabel}`}</span>
            {modelSourceLabel && hasViewportContent ? (
              <span className="rendererBadge">{modelSourceLabel}</span>
            ) : null}
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
          <div className="toolbarDivider" />
          <button
            type="button"
            className={`vpToggleBtn ${showGrid ? "vpToggleBtn--active" : ""}`}
            onClick={() => setShowGrid((v) => !v)}
            title={showGrid ? "Hide Grid" : "Show Grid"}
            aria-pressed={showGrid}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 5h12M1 9h12M5 1v12M9 1v12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Grid
          </button>
          <button
            type="button"
            className={`vpToggleBtn ${showAxes ? "vpToggleBtn--active" : ""}`}
            onClick={() => setShowAxes((v) => !v)}
            title={showAxes ? "Hide Axes" : "Show Axes"}
            aria-pressed={showAxes}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 12V2m0 0L4 5m3-3l3 3" stroke="#FF453A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 7h10m0 0L9 4m3 3L9 10" stroke="#32D74B" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Axes
          </button>
          <button
            type="button"
            className={`vpToggleBtn ${wireframe ? "vpToggleBtn--active" : ""}`}
            onClick={() => setWireframe((v) => !v)}
            title={wireframe ? "Solid mode" : "Wireframe mode"}
            aria-pressed={wireframe}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
            </svg>
            Wire
          </button>
        </div>
        <div className="viewportToolbarGroup viewportToolbarGroup--camera">
          <button type="button" title="Front view (Y−)" onClick={() => setCameraPreset("front")}>F</button>
          <button type="button" title="Back view (Y+)" onClick={() => setCameraPreset("back")}>Bk</button>
          <button type="button" title="Top view (Z+)" onClick={() => setCameraPreset("top")}>T</button>
          <button type="button" title="Bottom view (Z−)" onClick={() => setCameraPreset("bottom")}>Bt</button>
          <button type="button" title="Right view (X+)" onClick={() => setCameraPreset("right")}>R</button>
          <button type="button" title="Left view (X−)" onClick={() => setCameraPreset("left")}>L</button>
          <button type="button" title="Isometric view" onClick={() => setCameraPreset("iso")}>Iso</button>
        </div>
        <div className="viewportToolbarGroup">
          <button
            type="button"
            className="vpFitBtn"
            onClick={fitToView}
            title="Fit model in view"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 5V2a1 1 0 011-1h3M9 1h3a1 1 0 011 1v3M13 9v3a1 1 0 01-1 1H9M5 13H2a1 1 0 01-1-1V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            Fit
          </button>
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
            <div className="vpOrientationGizmo" aria-hidden="true">
              <svg width="64" height="64" viewBox="0 0 64 64">
                <line x1="32" y1="32" x2="54" y2="32" stroke="#FF453A" strokeWidth="2" strokeLinecap="round" />
                <text x="57" y="35" fill="#FF453A" fontSize="10" fontWeight="700" fontFamily="var(--font-mono)">X</text>
                <line x1="32" y1="32" x2="32" y2="10" stroke="#32D74B" strokeWidth="2" strokeLinecap="round" />
                <text x="29" y="8" fill="#32D74B" fontSize="10" fontWeight="700" fontFamily="var(--font-mono)">Y</text>
                <line x1="32" y1="32" x2="18" y2="46" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" />
                <text x="10" y="52" fill="#0A84FF" fontSize="10" fontWeight="700" fontFamily="var(--font-mono)">Z</text>
                <circle cx="32" cy="32" r="2.5" fill="var(--text-tertiary)" />
              </svg>
            </div>
          </div>
          {modelError ? <div className="diagnostics">{modelError}</div> : null}
          <div className="vpStatusBar">
            <div className="vpStatusGroup">
              {modelInfo && !isLoadingModel ? (
                <>
                  <span className="vpStatusItem" title="Bounding box dimensions">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1" />
                    </svg>
                    {`${modelInfo.width} × ${modelInfo.height} × ${modelInfo.depth}`}
                  </span>
                  <span className="vpStatusDivider" />
                  <span className="vpStatusItem" title="Triangle count">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M6 2L11 10H1L6 2z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                    </svg>
                    {`${modelInfo.triangles.toLocaleString()} tris`}
                  </span>
                </>
              ) : (
                <span className="vpStatusItem vpStatusItem--muted">No model loaded</span>
              )}
            </div>
            <div className="vpStatusGroup">
              {cursorWorldPos ? (
                <span className="vpStatusItem vpStatusItem--coords" title="Cursor world position">
                  <span className="vpCoordLabel vpCoordLabel--x">X</span>{cursorWorldPos.x}
                  <span className="vpCoordLabel vpCoordLabel--y">Y</span>{cursorWorldPos.y}
                  <span className="vpCoordLabel vpCoordLabel--z">Z</span>{cursorWorldPos.z}
                </span>
              ) : null}
              <span className="vpStatusDivider" />
              <span className="vpStatusItem vpStatusItem--muted">{rendererLabel}</span>
              {showGrid ? (
                <span className="vpStatusItem vpStatusItem--badge" title={`Grid spacing: ${sceneMetrics.gridLabel}`}>Grid {sceneMetrics.gridLabel}</span>
              ) : null}
              {showAxes ? (
                <span className="vpStatusItem vpStatusItem--badge">Axes</span>
              ) : null}
              {wireframe ? (
                <span className="vpStatusItem vpStatusItem--badge">Wire</span>
              ) : null}
            </div>
          </div>
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
              <div className="inspectorTabs" role="tablist" aria-label="Inspector views">
                <button
                  role="tab"
                  id="inspector-tab-properties"
                  aria-controls="inspector-panel-properties"
                  aria-selected={viewTab === "properties"}
                  className={`inspectorTab ${viewTab === "properties" ? "inspectorTab--active" : ""}`}
                  onClick={() => setViewTab("properties")}
                >
                  Properties
                </button>
                <button
                  role="tab"
                  id="inspector-tab-scene"
                  aria-controls="inspector-panel-scene"
                  aria-selected={viewTab === "scene"}
                  className={`inspectorTab ${viewTab === "scene" ? "inspectorTab--active" : ""}`}
                  onClick={() => setViewTab("scene")}
                >
                  Scene
                </button>
                <button
                  role="tab"
                  id="inspector-tab-export"
                  aria-controls="inspector-panel-export"
                  aria-selected={viewTab === "export"}
                  className={`inspectorTab ${viewTab === "export" ? "inspectorTab--active" : ""}`}
                  onClick={() => setViewTab("export")}
                >
                  Export
                </button>
              </div>
              <div className="previewInspectorBody">
                {viewTab === "properties" && (
                  <div
                    id="inspector-panel-properties"
                    role="tabpanel"
                    aria-labelledby="inspector-tab-properties"
                  >
                    <section className="previewInspectorSection">
                      <div className="previewInspectorLabel">Material</div>
                      <label className="previewColorField">
                        <span>Color</span>
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
                  </div>
                )}
                {viewTab === "scene" && (
                  <div
                    id="inspector-panel-scene"
                    role="tabpanel"
                    aria-labelledby="inspector-tab-scene"
                  >
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
                      <div className="previewInspectorLabel">Grid (auto-scaled)</div>
                      <div className="inspectorInfoRow">
                        <span>Spacing</span>
                        <span className="inspectorInfoValue">{sceneMetrics.gridLabel}</span>
                      </div>
                      <div className="inspectorInfoRow">
                        <span>Span</span>
                        <span className="inspectorInfoValue">{sceneMetrics.gridSpan.toFixed(1)}</span>
                      </div>
                      <div className="inspectorInfoRow">
                        <span>Divisions</span>
                        <span className="inspectorInfoValue">{sceneMetrics.gridDivisions}</span>
                      </div>
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
                      <label className="previewRangeField">
                        <span>Fill Light</span>
                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={0.02}
                          value={fillIntensity}
                          onChange={(event) => setFillIntensity(Number(event.target.value))}
                        />
                      </label>
                    </section>
                  </div>
                )}
                {viewTab === "export" && (
                  <div
                    id="inspector-panel-export"
                    role="tabpanel"
                    aria-labelledby="inspector-tab-export"
                  >
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
                  </div>
                )}
              </div>
            </aside>
          </>
        ) : null}
      </div>
    </section>
  );
}

