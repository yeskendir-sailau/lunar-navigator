// apollo-markers.js
// Добавляет на модель Луны кликабельные точки с подписью.
// При клике вылетает ракета и появляется панель с информацией.
//
// Использование:
//   import { initMoonMarkers } from './apollo-markers.js';
//   initMoonMarkers({ THREE, scene, camera, renderer, moon });

export const MISSIONS = [
  {
    id: 'apollo11',
    name: 'Apollo 11',
    lat: 0.67408,   // Море Спокойствия
    lon: 23.47297,
    info: {
      title: 'Apollo 11',
      site: 'Море Спокойствия (Mare Tranquillitatis)',
      launch: '16 июля 1969',
      landing: '20 июля 1969',
      returnDate: '24 июля 1969',
      crew: 'Нил Армстронг, Базз Олдрин, Майкл Коллинз',
      rocket: 'Saturn V',
      text:
        'Первая миссия, в которой люди высадились на Луну. Армстронг и Олдрин ' +
        'провели на поверхности около 2,5 часов и собрали около 21,5 кг образцов. ' +
        'Коллинз всё это время оставался на орбите в командном модуле «Колумбия».',
    },
  },
  // Сюда можно добавлять другие миссии:
  // { id: 'apollo12', name: 'Apollo 12', lat: -3.01239, lon: -23.42157, info: {...} },
];

// ---------- helpers ----------

// lat/lon (градусы) -> позиция на сфере.
// Формула под стандартную UV-развёртку THREE.SphereGeometry
// (equirectangular-текстура). Если точка оказалась не там —
// попробуй поменять знак у lon или прибавить 90/180 градусов.
function latLonToVector3(THREE, lat, lon, radius) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function makeLabelSprite(THREE, text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath();
  ctx.roundRect(0, 8, 256, 48, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.5, 0.125, 1); // подгони под размер своей луны
  return sprite;
}

function makeRocket(THREE) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd62828 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa500 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 16), white);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 16), red);
  nose.position.y = 0.095;
  g.add(body, nose);

  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.04, 0.03), red);
    const a = (i / 3) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.025, -0.06, Math.sin(a) * 0.025);
    fin.rotation.y = -a;
    g.add(fin);
  }

  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.07, 12), flameMat);
  flame.rotation.x = Math.PI;
  flame.position.y = -0.1;
  flame.name = 'flame';
  g.add(flame);

  return g;
}

// ---------- info panel ----------

function createPanel() {
  const style = document.createElement('style');
  style.textContent = `
    .moon-info {
      position: fixed; top: 50%; right: 24px; transform: translate(120%, -50%);
      width: 320px; max-width: calc(100vw - 48px);
      background: rgba(15,15,25,0.92); color: #fff; font-family: sans-serif;
      padding: 20px; border-radius: 14px; box-shadow: 0 10px 40px rgba(0,0,0,.5);
      transition: transform .4s ease; z-index: 10;
    }
    .moon-info.open { transform: translate(0, -50%); }
    .moon-info h2 { margin: 0 0 10px; font-size: 22px; }
    .moon-info p { margin: 6px 0; font-size: 14px; line-height: 1.45; }
    .moon-info b { color: #ffb703; }
    .moon-info .close {
      position: absolute; top: 8px; right: 12px; background: none; border: 0;
      color: #fff; font-size: 24px; cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'moon-info';
  document.body.appendChild(el);

  const api = {
    show(m) {
      const i = m.info;
      el.innerHTML = `
        <button class="close" aria-label="Закрыть">&times;</button>
        <h2>🚀 ${i.title}</h2>
        <p><b>Место посадки:</b> ${i.site}</p>
        <p><b>Старт:</b> ${i.launch}</p>
        <p><b>Посадка:</b> ${i.landing}</p>
        <p><b>Возвращение:</b> ${i.returnDate}</p>
        <p><b>Экипаж:</b> ${i.crew}</p>
        <p><b>Ракета:</b> ${i.rocket}</p>
        <p>${i.text}</p>
      `;
      el.querySelector('.close').onclick = api.hide;
      requestAnimationFrame(() => el.classList.add('open'));
    },
    hide() {
      el.classList.remove('open');
    },
  };
  return api;
}

// ---------- main ----------

export function initMoonMarkers({
  THREE,
  scene,
  camera,
  renderer,
  moon,
  moonRadius, // необязательно, считается из модели
  missions = MISSIONS,
}) {
  // радиус луны (по bounding sphere модели)
  const box = new THREE.Box3().setFromObject(moon);
  const size = box.getSize(new THREE.Vector3());
  const radius = moonRadius ?? Math.max(size.x, size.y, size.z) / 2;

  // Маркеры — дочерние объекты луны, чтобы вращались вместе с ней.
  // Если у moon есть scale != 1, позиции считаем в локальных координатах.
  const localRadius = radius / moon.scale.x;

  const clickable = [];
  const panel = createPanel();

  missions.forEach((m) => {
    const pos = latLonToVector3(THREE, m.lat, m.lon, localRadius * 1.005);

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(localRadius * 0.015, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff3b30 })
    );
    dot.position.copy(pos);
    dot.userData.mission = m;

    // кольцо-пульсация вокруг точки
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(localRadius * 0.02, localRadius * 0.026, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff3b30, side: THREE.DoubleSide, transparent: true, opacity: 0.8,
      })
    );
    ring.position.copy(pos);
    ring.lookAt(pos.clone().multiplyScalar(2));
    dot.userData.ring = ring;

    const label = makeLabelSprite(THREE, m.name);
    label.position.copy(pos.clone().multiplyScalar(1.12));
    label.userData.mission = m;

    moon.add(dot, ring, label);
    clickable.push(dot, label);
  });

  // пульсация колец
  let t = 0;
  (function pulse() {
    t += 0.03;
    clickable.forEach((o) => {
      const r = o.userData.ring;
      if (!r) return;
      const s = 1 + (Math.sin(t) * 0.5 + 0.5) * 0.8;
      r.scale.set(s, s, s);
      r.material.opacity = 1 - (s - 1) / 0.8 * 0.7;
    });
    requestAnimationFrame(pulse);
  })();

  // ---- ракета ----
  let rocket = null;

  function launchRocket(dot) {
    if (rocket) {
      scene.remove(rocket);
      rocket = null;
    }
    rocket = makeRocket(THREE);
    rocket.scale.setScalar(radius * 0.6);

    const start = dot.getWorldPosition(new THREE.Vector3());
    const normal = start.clone().sub(moon.getWorldPosition(new THREE.Vector3())).normalize();
    const end = start.clone().add(normal.clone().multiplyScalar(radius * 0.8));

    // ориентируем ракету «носом» от поверхности
    rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    rocket.position.copy(start);
    scene.add(rocket);

    const duration = 2200;
    const t0 = performance.now();

    function step(now) {
      if (!rocket) return;
      const k = Math.min((now - t0) / duration, 1);
      const eased = k * k; // разгон
      rocket.position.lerpVectors(start, end, eased);

      const flame = rocket.getObjectByName('flame');
      if (flame) flame.scale.y = 0.7 + Math.random() * 0.6;

      if (k < 1) {
        requestAnimationFrame(step);
      } else {
        // зависает на орбите и слегка покачивается
        const hoverStart = performance.now();
        (function hover(n) {
          if (!rocket) return;
          rocket.position.copy(end).addScaledVector(normal, Math.sin((n - hoverStart) / 400) * radius * 0.02);
          requestAnimationFrame(hover);
        })(performance.now());
      }
    }
    requestAnimationFrame(step);
  }

  // ---- клики ----
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  renderer.domElement.addEventListener('click', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    // сначала проверяем вместе с луной, чтобы точки на обратной стороне не кликались
    const hits = raycaster.intersectObjects([moon, ...clickable], true);
    const hit = hits.find((h) => h.object.userData.mission);
    if (!hit) {
      panel.hide();
      return;
    }
    // если луна ближе точки — значит точка за горизонтом
    const moonHit = hits.find((h) => !h.object.userData.mission);
    if (moonHit && moonHit.distance < hit.distance - radius * 0.05) return;

    const dot = hit.object.userData.mission
      ? clickable.find((o) => o.userData.mission === hit.object.userData.mission && o.isMesh)
      : hit.object;

    launchRocket(dot);
    panel.show(hit.object.userData.mission);
  });

  // курсор-рука при наведении
  renderer.domElement.addEventListener('pointermove', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const over = raycaster.intersectObjects(clickable, false).length > 0;
    renderer.domElement.style.cursor = over ? 'pointer' : '';
  });
}
