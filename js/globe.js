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
// Лёгкий рельеф: та же текстура используется как карта высот, чтобы кратеры и борозды чуть «выступали» на свету.
// Если рельеф кажется слишком сильным или слабым, поменяйте MOON_RELIEF (0 = выключить).
const MOON_RELIEF = 0.03;
const material = new THREE.MeshStandardMaterial({
  map: texture,
  bumpMap: MOON_RELIEF > 0 ? texture : null,
  bumpScale: MOON_RELIEF,
  roughness: 1,
  metalness: 0,
});
const moon = new THREE.Mesh(geometry, material);
scene.add(moon);

// 6. СВЕТ
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(5, 2, 5);
scene.add(sun);
const ambient = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambient);

// Свет Земли («пепельный свет»): слабый голубоватый свет со стороны Земли,
// чтобы ночная сторона Луны не была совсем чёрной
const earthshine = new THREE.DirectionalLight(0x9db4ff, 0.35);
earthshine.position.set(5, 0, 0);
scene.add(earthshine);

// 7. СОЛНЦЕ И ЗЕМЛЯ В СЦЕНЕ
// Направление на каждое тело настоящее (из sun_earth.json), а расстояние и размер условные:
// настоящие не поместились бы на экране, поэтому рядом с телом подпись «not to scale».
const SUN_DISTANCE = 7;
const EARTH_DISTANCE = 5;

function labelSprite(lines, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(10, 14, 22, 0.72)';          // тёмная плашка: подпись читается и на тёмном, и на светлом фоне
  g.beginPath();
  if (g.roundRect) g.roundRect(24, 6, 464, 116, 28); else g.rect(24, 6, 464, 116);
  g.fill();
  g.textAlign = 'center';
  g.fillStyle = color;
  g.font = '600 44px system-ui, sans-serif';
  g.fillText(lines[0], 256, 52);
  g.fillStyle = '#c4cfe0';
  g.font = '34px system-ui, sans-serif';
  g.fillText(lines[1], 256, 100);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// Мягкое свечение: круглый спрайт с радиальным градиентом и сложением цветов (additive)
const glows = [];   // свечения: на светлом фоне (при сложении цветов) не видны, их прячем
function glowSprite(stops, size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sprite.scale.set(size, size, 1);
  glows.push(sprite);
  return sprite;
}

// Земля: тёмно-синий океан и мягкие облака (рисуем сами; настоящих материков нет, это только вид в сцене)
function earthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const sea = g.createLinearGradient(0, 0, 0, 256);
  sea.addColorStop(0, '#2a5fbf');
  sea.addColorStop(0.5, '#1d4e9e');
  sea.addColorStop(1, '#2a5fbf');
  g.fillStyle = sea;
  g.fillRect(0, 0, 512, 256);
  let seed = 7;                                   // свои «случайные» числа: каждый раз одна и та же картина
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {                  // облачные полосы
    const x = rand() * 512, y = 20 + rand() * 216, w = 40 + rand() * 90, h = 6 + rand() * 14;
    const cloud = g.createRadialGradient(x, y, 0, x, y, w);
    cloud.addColorStop(0, 'rgba(255,255,255,0.55)');
    cloud.addColorStop(1, 'rgba(255,255,255,0)');
    g.save();
    g.translate(x, y);
    g.scale(1, h / w);
    g.translate(-x, -y);
    g.fillStyle = cloud;
    g.fillRect(x - w, y - w, w * 2, w * 2);
    g.restore();
  }
  g.fillStyle = 'rgba(255,255,255,0.8)';          // полярные шапки
  g.fillRect(0, 0, 512, 10);
  g.fillRect(0, 246, 512, 10);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Солнце: яркое ядро, два слоя свечения и тонкие лучи
const sunMarker = new THREE.Group();
const sunCore = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
sunMarker.add(sunCore);
sunMarker.add(glowSprite([[0, 'rgba(255,236,160,0.95)'], [0.25, 'rgba(255,200,90,0.55)'], [0.6, 'rgba(255,150,40,0.16)'], [1, 'rgba(255,120,20,0)']], 2.4));
sunMarker.add(glowSprite([[0, 'rgba(255,210,120,0.28)'], [0.5, 'rgba(255,170,60,0.08)'], [1, 'rgba(255,140,40,0)']], 5));
const sunLabel = labelSprite(['Sun', 'direction exact, size not to scale'], '#ffd34d');
sunLabel.position.set(0, 1.0, 0);
sunMarker.add(sunLabel);
sunMarker.visible = false;
scene.add(sunMarker);

// Земля: шар с облаками, освещённый тем же Солнцем (видна своя фаза), и голубая дымка атмосферы
const earthMarker = new THREE.Group();
const earthBall = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 48, 48),
  new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.75, metalness: 0 }),
);
earthMarker.add(earthBall);
earthMarker.add(glowSprite([[0, 'rgba(120,180,255,0)'], [0.4, 'rgba(120,180,255,0.0)'], [0.55, 'rgba(110,170,255,0.45)'], [1, 'rgba(90,150,255,0)']], 0.95));
const earthLabel = labelSprite(['Earth', 'direction exact, size not to scale'], '#7db4ff');
earthLabel.position.set(0, 0.55, 0);
earthMarker.add(earthLabel);
earthMarker.visible = false;
scene.add(earthMarker);

// Свои 3D-модели (необязательно). Файл .glb лежит в папке models/; null = рисовать само.
// Если файл не загрузится, остаётся нарисованное тело, сайт работает как раньше.
const SUN_MODEL = null;                      // например 'models/sun.glb'
const EARTH_MODEL = 'models/earth.glb';      // Земля (NASA-стиль, текстуры уменьшены до 2048 px)
const SUN_TEXTURE = 'textures/sun.jpg';      // картинка поверхности Солнца на шаре

// Загружает .glb, подгоняет под нужный диаметр, ставит вместо старого тела (placeholder) в группе group.
// unlit = true: материалы без освещения (Солнце светится само)
async function loadModelInto(group, placeholder, path, diameter, unlit) {
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(fileUrl(`../${path}`));
    const model = gltf.scene;
    if (unlit) {
      model.traverse(o => {
        if (!o.isMesh) return;
        const old = Array.isArray(o.material) ? o.material[0] : o.material;
        o.material = new THREE.MeshBasicMaterial({ map: old.emissiveMap ?? old.map ?? null, color: old.map || old.emissiveMap ? 0xffffff : (old.color ?? 0xffd34d) });
      });
    }
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    model.scale.setScalar(diameter / (Math.max(size.x, size.y, size.z) || 1));
    const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    model.position.sub(center);
    group.remove(placeholder);
    group.add(model);
  } catch (error) {
    console.warn(`Model ${path} not used:`, error.message);
  }
}
if (SUN_MODEL) loadModelInto(sunMarker, sunCore, SUN_MODEL, 0.6, true);
if (EARTH_MODEL) loadModelInto(earthMarker, earthBall, EARTH_MODEL, 0.44, false);

// Поверхность Солнца: картинка на шаре, медленно вращается
if (SUN_TEXTURE && !SUN_MODEL) {
  new THREE.TextureLoader().load(
    fileUrl(`../${SUN_TEXTURE}`),
    tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      sunCore.material.map = tex;
      sunCore.material.color.setHex(0xffffff);
      sunCore.material.needsUpdate = true;
    },
    undefined,
    () => console.warn(`Sun texture ${SUN_TEXTURE} not used`),
  );
}

let earthDir = null;   // последнее направление на Землю (оси three.js), единичный вектор

// Направить Солнце и Землю по реальным данным.
// Принимают направление в осях three.js: (x, y, z) = (X, Z, -Y) из системы Луны (см. geo.js).
export function setSunDirection(x, y, z) {
  sun.position.set(x, y, z).multiplyScalar(5);
  sunMarker.position.set(x, y, z).normalize().multiplyScalar(SUN_DISTANCE);
  sunMarker.visible = true;
}
export function setEarthDirection(x, y, z) {
  earthshine.position.set(x, y, z).multiplyScalar(5);
  earthDir = new THREE.Vector3(x, y, z).normalize();
  earthMarker.position.copy(earthDir).multiplyScalar(EARTH_DISTANCE);
  earthMarker.visible = true;
}

// Режим света: 'real' — только Солнце (видны фазы), 'full' — Луна освещена со всех сторон
export function setLightMode(mode) {
  if (mode === 'full') {
    ambient.intensity = 1.6;
    sun.intensity = 1.0;
    earthshine.intensity = 0;
  } else {
    ambient.intensity = 0.15;
    sun.intensity = 3;
    earthshine.intensity = 0.35;
  }
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
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// Тема: тёмная (космос и звёзды) или светло-серая (однотонный светлый фон)
export function setTheme(theme) {
  scene.background = new THREE.Color(0x05070c);
  stars.visible = true;
  for (const g of glows) g.visible = true;
  renderer.setClearColor(0x05070c, 1);
}

// 9. ПОЛЁТ КАМЕРЫ К ТОЧКЕ (для карточки места)
let flight = null;

function easeInOutCubic(u) {            // «разгон и торможение»
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function flyToDirection(targetDir, distance, seconds) {
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

export function flyTo(lat, lon, distance = 2.2, seconds = 1.6) {
  const safeLat = THREE.MathUtils.clamp(lat, -85, 85);   // у самого полюса камера путается
  flyToDirection(latLonToVector3(safeLat, lon, 1), distance, seconds);
}

// «Вид с Земли»: камера встаёт на линию Луна–Земля, и видна привычная нам фаза.
// Вернёт false, если направление на Землю ещё не известно.
export function viewFromEarth(distance = 3.4, seconds = 1.6) {
  if (!earthDir) return false;
  const dir = earthDir.clone();
  dir.y = THREE.MathUtils.clamp(dir.y, -0.996, 0.996);   // у самого полюса камера путается
  flyToDirection(dir.normalize(), distance, seconds);
  return true;
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
if (SUN_TEXTURE && !SUN_MODEL) onFrame(() => { sunCore.rotation.y += 0.0006; });   // Солнце медленно вращается

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
