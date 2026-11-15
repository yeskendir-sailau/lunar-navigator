// Вступление на стартовом экране: та же 3D-сцена, но камера далеко, Луна справа внизу,
// вокруг яркие цветные туманности. Камера чуть двигается за курсором (параллакс).
// flyIn() — плавный полёт к Луне (~3 с) в то же положение, что у главного экрана; туманности растворяются.
import * as THREE from 'three';
import { scene, camera, controls, onFrame, setBodiesHidden } from './globe.js';

const START_POS = new THREE.Vector3(4.8, 2.6, 6.5);   // откуда смотрим в начале (~8.5 радиуса Луны)
const PARALLAX = { x: 0.9, y: 0.55 };                  // насколько камера сдвигается за курсором

// Пушистое облако: много мягких кругов на canvas -> текстура для спрайта
function cloudTexture(seed) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * size * 0.28;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r * 0.7;
    const rad = size * (0.08 + rand() * 0.22);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(255,255,255,${0.05 + rand() * 0.07})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const easeInOutCubic = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createIntro() {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const group = new THREE.Group();
  const fading = [];   // [material, базовая прозрачность]

  // 1. Туманности: за Луной, если смотреть со стартовой точки
  const away = START_POS.clone().normalize().negate();
  const side = new THREE.Vector3().crossVectors(away, new THREE.Vector3(0, 1, 0)).normalize();
  const upv = new THREE.Vector3().crossVectors(side, away).normalize();
  const COLORS = ['#7b2ff7', '#2f6bff', '#ff2e97', '#00d4ff', '#b14bff', '#ff6a3d', '#3df5ff', '#ff4fd8'];
  const textures = [1, 2, 3, 4].map(n => cloudTexture(n * 7919));
  const CLOUDS = 14;
  for (let i = 0; i < CLOUDS; i++) {
    const material = new THREE.SpriteMaterial({
      map: textures[i % textures.length], color: COLORS[i % COLORS.length],
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const base = 0.65 + (i % 3) * 0.2;   // яркость облака (облака складываются, поэтому немного)
    fading.push([material, base]);
    const sprite = new THREE.Sprite(material);
    // облака разбросаны по всему небу за Луной, между ними остаётся тёмный космос
    const a = (i / CLOUDS) * Math.PI * 2 + (i % 3) * 0.4;
    const r = 14 + (i % 4) * 9;
    sprite.position.copy(away).multiplyScalar(40 + (i % 5) * 6)
      .addScaledVector(side, Math.cos(a) * r * 1.5)
      .addScaledVector(upv, Math.sin(a) * r * 0.8);
    const s = 20 + (i % 4) * 7;
    sprite.scale.set(s * (1.2 + (i % 3) * 0.35), s * (0.75 + (i % 2) * 0.25), 1);   // вытянутые, как настоящие туманности
    sprite.material.rotation = i * 0.9;
    group.add(sprite);
  }

  // 2. Цветные яркие звёзды (голубые, розовые, золотые)
  const N = 1400;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const palette = ['#ffffff', '#9fd8ff', '#ffb3e6', '#ffe29a', '#b9a3ff', '#7df9ff'].map(h => new THREE.Color(h));
  for (let i = 0; i < N; i++) {
    const p = new THREE.Vector3().randomDirection().multiplyScalar(70 + Math.random() * 40);
    pos.set([p.x, p.y, p.z], i * 3);
    const c = palette[i % palette.length];
    col.set([c.r, c.g, c.b], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const starMat = new THREE.PointsMaterial({
    size: 2.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  fading.push([starMat, 0.95]);
  group.add(new THREE.Points(starGeo, starMat));

  // 3. Сияние вокруг Луны (видно только по краю: середину закрывает сама Луна)
  const haloMat = new THREE.SpriteMaterial({
    map: glowTexture('rgba(140,200,255,0.9)', 'rgba(110,80,255,0.35)'),
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  fading.push([haloMat, 0.85]);
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(3.6);
  group.add(halo);

  scene.add(group);

  // 4. Свет со стороны камеры, чтобы Луна была красиво освещена (потом гаснет)
  const introLight = new THREE.DirectionalLight(0xdfe9ff, 0);
  scene.add(introLight);

  // 5. Камера: Луна справа внизу. Смотрим на точку левее и выше Луны.
  const finalPos = camera.position.clone();
  const finalTarget = controls.target.clone();
  const savedMax = controls.maxDistance;
  controls.enabled = false;
  controls.maxDistance = 100;
  setBodiesHidden(true);

  function lookPoint(pos) {
    // где окажется Луна на экране (доли от центра до края): справа внизу, на телефоне — снизу по центру
    const wide = camera.aspect > 1.1;
    const nx = wide ? 0.42 : 0, ny = wide ? -0.3 : -0.42;
    const d = pos.length();
    const h = d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    const right = new THREE.Vector3().setFromMatrixColumn(m, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(m, 1);
    return new THREE.Vector3().addScaledVector(right, -nx * h * camera.aspect).addScaledVector(up, -ny * h);
  }

  const pointer = { x: 0, y: 0 };
  const smoothP = { x: 0, y: 0 };
  const onMove = e => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onMove);

  let phase = 'idle';   // idle -> flying -> done
  let flight = null;
  const t0 = performance.now();

  function introPosition(t) {
    smoothP.x += (pointer.x - smoothP.x) * 0.05;
    smoothP.y += (pointer.y - smoothP.y) * 0.05;
    const drift = reduced ? 0 : Math.sin(t / 3500) * 0.12;   // лёгкое «дыхание», если мышь не двигается
    const base = START_POS.clone();
    const m = new THREE.Matrix4().lookAt(base, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    const right = new THREE.Vector3().setFromMatrixColumn(m, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(m, 1);
    const k = reduced ? 0 : 1;
    return base.addScaledVector(right, (smoothP.x * PARALLAX.x + drift) * k).addScaledVector(up, -smoothP.y * PARALLAX.y * k);
  }

  function setFade(f) {
    for (const [m, base] of fading) m.opacity = base * f;
    introLight.intensity = 2.4 * f;
  }

  onFrame(() => {
    if (phase === 'done') return;
    const now = performance.now();
    if (phase === 'idle') {
      const pos = introPosition(now);
      const look = lookPoint(START_POS);
      camera.position.copy(pos);
      camera.lookAt(look);
      controls.target.copy(look);
      introLight.position.copy(pos).add(new THREE.Vector3(0, 4, 0));
      setFade(Math.min(1, (now - t0) / 1200));   // мягкое появление
      group.rotation.y += reduced ? 0 : 0.00012;
      return;
    }
    // полёт
    const u = Math.min(1, (now - flight.start) / flight.duration);
    const e = easeInOutCubic(u);
    const dir = flight.fromDir.clone().applyQuaternion(new THREE.Quaternion().slerp(flight.rot, e));
    camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(flight.fromDist, flight.toDist, e)));
    const look = flight.fromLook.clone().lerp(finalTarget, e);
    camera.lookAt(look);
    controls.target.copy(look);
    setFade(1 - smooth(0.1, 0.85, u));
    if (u >= 0.6) document.body.classList.remove('intro');   // панели плавно появляются
    if (u >= 1) finish();
  });

  function finish() {
    phase = 'done';
    camera.position.copy(finalPos);
    controls.target.copy(finalTarget);
    camera.lookAt(finalTarget);
    controls.maxDistance = savedMax;
    controls.enabled = true;
    controls.update();
    setBodiesHidden(false);
    scene.remove(group, introLight);
    window.removeEventListener('pointermove', onMove);
    document.body.classList.remove('intro');
    flight?.resolve();
  }

  document.body.classList.add('intro');

  return {
    // Полёт к Луне. Возвращает Promise, который выполнится, когда камера остановится.
    flyIn(ms = 3000) {
      if (phase !== 'idle') return Promise.resolve();
      const from = camera.position.clone();
      return new Promise(resolve => {
        flight = {
          start: performance.now(),
          duration: reduced ? 600 : ms,
          fromDir: from.clone().normalize(),
          rot: new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), finalPos.clone().normalize()),
          fromDist: from.length(),
          toDist: finalPos.length(),
          fromLook: controls.target.clone(),
          resolve,
        };
        phase = 'flying';
      });
    },
    skip() { if (phase !== 'done') finish(); },
  };
}
