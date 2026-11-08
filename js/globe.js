import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { latLonToVector3 } from './geo.js';

// Адреса файлов считаем от места, где лежит этот файл (js/), поэтому
// они работают и со страницы demos/..., и с главной страницы index.html
const fileUrl = path => new URL(path, import.meta.url).href;

// 1. СЦЕНА
const scene = new THREE.Scene();

// 2. КАМЕРА (смотрим на ближнюю сторону Луны)
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1, 300
);
camera.position.set(4, 0, 0);

// 3. РЕНДЕРЕР
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// 4. УПРАВЛЕНИЕ КАМЕРОЙ
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.6;
controls.minDistance = 1.3;
controls.maxDistance = 10;
controls.enablePan = false;

// 5. ЛУНА
const texture = new THREE.TextureLoader().load(fileUrl('../textures/moon_4k.jpg'));
texture.colorSpace = THREE.SRGBColorSpace;

const geometry = new THREE.SphereGeometry(1, 64, 64);
const material = new THREE.MeshStandardMaterial({ map: texture });
const moon = new THREE.Mesh(geometry, material);
scene.add(moon);

// 6. СВЕТ
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(5, 2, 5);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

// Свет Земли («пепельный свет»): слабый голубоватый свет со стороны Земли,
// чтобы ночная сторона Луны не была совсем чёрной
const earthshine = new THREE.DirectionalLight(0x9db4ff, 0.35);
earthshine.position.set(5, 0, 0);
scene.add(earthshine);

// Направить Солнце и Землю по реальным данным.
// Принимают направление в осях three.js: (x, y, z) = (X, Z, -Y) из системы Луны (см. geo.js).
export function setSunDirection(x, y, z) {
  sun.position.set(x, y, z).multiplyScalar(5);
}
export function setEarthDirection(x, y, z) {
  earthshine.position.set(x, y, z).multiplyScalar(5);
}

// 8. ЗВЁЗДЫ
const starCount = 4000;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const p = new THREE.Vector3()
    .randomDirection()
    .multiplyScalar(60 + Math.random() * 30);
  starPositions.set([p.x, p.y, p.z], i * 3);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 1.5,
  sizeAttenuation: false
});
scene.add(new THREE.Points(starGeometry, starMaterial));

// 9. ПОЛЁТ КАМЕРЫ К ТОЧКЕ (для карточки места)
let flight = null;

function easeInOutCubic(u) {            // «разгон и торможение»
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

export function flyTo(lat, lon, distance = 2.2, seconds = 1.6) {
  const safeLat = THREE.MathUtils.clamp(lat, -85, 85);   // у самого полюса камера путается
  const targetDir = latLonToVector3(safeLat, lon, 1);
  const startDir = camera.position.clone().normalize();
  flight = {
    startDir,
    rotation: new THREE.Quaternion().setFromUnitVectors(startDir, targetDir),
    startDist: camera.position.length(),
    endDist: THREE.MathUtils.clamp(distance, controls.minDistance, controls.maxDistance),
    start: performance.now(),
    duration: seconds * 1000,
  };
  controls.enabled = false;             // пока летим, мышка не мешает
}

function updateFlight() {
  if (!flight) return;
  const u = Math.min(1, (performance.now() - flight.start) / flight.duration);
  const e = easeInOutCubic(u);
  const q = new THREE.Quaternion().slerp(flight.rotation, e);   // плавный поворот по дуге
  const dist = THREE.MathUtils.lerp(flight.startDist, flight.endDist, e);
  camera.position.copy(flight.startDir.clone().applyQuaternion(q).multiplyScalar(dist));
  if (u >= 1) {
    flight = null;
    controls.enabled = true;
  }
}

// 10. «Крючок» для других модулей: функция, которую вызываем каждый кадр
const frameCallbacks = [];
export function onFrame(fn) {
  frameCallbacks.push(fn);
}

// 11. ЦИКЛ АНИМАЦИИ
function animate() {
  requestAnimationFrame(animate);
  updateFlight();
  controls.update();
  for (const fn of frameCallbacks) fn();
  renderer.render(scene, camera);
}
animate();

// 12. Подстройка под размер окна
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Отдаём наружу то, что нужно другим модулям
export { scene, camera, renderer, controls, moon };
