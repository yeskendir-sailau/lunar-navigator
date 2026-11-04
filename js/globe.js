import * as THREE from 'three';

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  40,                                      // угол обзора
  window.innerWidth / window.innerHeight,  // пропорции окна
  0.1, 100                                 // что ближе 0.1 и дальше 100 не рисуем
);
camera.position.z = 4;                     // отодвигаем камеру назад

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const geometry = new THREE.SphereGeometry(1, 64, 64);
const material = new THREE.MeshStandardMaterial({ color: 0x00FF00 });
const moon = new THREE.Mesh(geometry, material);
scene.add(moon);

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(5, 2, 5);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

function animate() {
  requestAnimationFrame(animate);
  moon.rotation.y += 0.003;
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});