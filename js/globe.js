import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

//СЦЕНА
const scene = new THREE.Scene();

//КАМЕРА
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1, 200
);
camera.position.set(4, 0, 0);

//РЕНДЕРЕР
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

//УПРАВЛЕНИЕ КАМЕРОЙ мышкой / трекпадом
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;   //плавное доезжание
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.5;      //медленнее вращение меньше дёргается
controls.zoomSpeed = 0.6;
controls.minDistance = 1.3;      //ближе нельзя
controls.maxDistance = 10;       //дальше нельзя
controls.enablePan = false;      //запрещаем сдвигать центр

//ЛУНА
const texture = new THREE.TextureLoader().load('../textures/moon_4k.jpg');
texture.colorSpace = THREE.SRGBColorSpace;

const geometry = new THREE.SphereGeometry(1, 64, 64);
const material = new THREE.MeshStandardMaterial({ map: texture });
const moon = new THREE.Mesh(geometry, material);
scene.add(moon);

//СВЕТ
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(5, 2, 5);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

//ЗВЁЗДЫ
const starCount = 4000;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const p = new THREE.Vector3()
    .randomDirection()                       // случайное направление
    .multiplyScalar(60 + Math.random() * 30); //расстояние 60..90
  starPositions.set([p.x, p.y, p.z], i * 3);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 1.5,
  sizeAttenuation: false   //размер в пикселях не зависит от расстояния
});
scene.add(new THREE.Points(starGeometry, starMaterial));

//АНИМАЦИИ
function animate() {
  requestAnimationFrame(animate);
  controls.update();   //нужно для плавного доезжания
  renderer.render(scene, camera);
}
animate();

//Подстройка под размер окна
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});