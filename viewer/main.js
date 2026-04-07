import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

import stlUrl from "../hex_nut.stl?url";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1e);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(40, 35, 40);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(20, 40, 20);
scene.add(key);
const fill = new THREE.DirectionalLight(0xaaccff, 0.35);
fill.position.set(-30, 10, -20);
scene.add(fill);

const grid = new THREE.GridHelper(80, 40, 0x44444a, 0x2a2a30);
scene.add(grid);

const loader = new STLLoader();
loader.load(
  stlUrl,
  (geometry) => {
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0xc9a227,
      metalness: 0.35,
      roughness: 0.45,
    });
    const mesh = new THREE.Mesh(geometry, material);
    geometry.center();
    scene.add(mesh);

    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    camera.position.set(maxDim * 1.2, maxDim, maxDim * 1.2);
    controls.target.copy(box.getCenter(new THREE.Vector3()));
    controls.update();
  },
  undefined,
  (err) => {
    console.error(err);
    document.getElementById("hint").textContent =
      "Could not load hex_nut.stl — run export from hex_nut.py first.";
  },
);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function tick() {
  requestAnimationFrame(tick);
  controls.update();
  renderer.render(scene, camera);
}
tick();
