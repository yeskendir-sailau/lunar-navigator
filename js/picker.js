// Модуль 3: выбор точки кликом.
// Клик по Луне -> белое кольцо + широта/долгота.
// Клик рядом с меткой места -> то же, плюс камера подлетает и открывается карточка.
import * as THREE from 'three';
import { camera, renderer, moon, onFrame, flyTo } from './globe.js';
import { latLonToVector3, vector3ToLatLon, angularDistanceDeg } from './geo.js';

export function initPicker({ sites, onPoint, onSite, onHover, onHoverEnd }) {
  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();   // невидимый луч из камеры
  const pointer = new THREE.Vector2();

  // --- Белое кольцо с точкой в центре ---
  const selector = new THREE.Group();
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  selector.add(new THREE.Mesh(new THREE.RingGeometry(0.02, 0.026, 48), white));
  selector.add(new THREE.Mesh(new THREE.CircleGeometry(0.005, 24), white));
  selector.visible = false;
  moon.parent.add(selector);

  // --- Цветное кольцо под курсором (предварительная оценка места) ---
  const hoverMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.037, 48), hoverMaterial);
  hoverRing.visible = false;
  moon.parent.add(hoverRing);

  onFrame(() => {   // кольца тоже масштабируем при приближении
    const s = THREE.MathUtils.clamp(camera.position.length() / 4, 0.3, 2.5);
    selector.scale.setScalar(s);
    hoverRing.scale.setScalar(s);
  });

  function hideHover() {
    hoverRing.visible = false;
    onHoverEnd?.();
  }

  function placeSelector(lat, lon) {
    const normal = latLonToVector3(lat, lon, 1);
    selector.position.copy(normal).multiplyScalar(1.006);
    selector.lookAt(normal.clone().multiplyScalar(2));   // кольцо «смотрит» наружу от Луны
    selector.visible = true;
  }

  // --- Куда попал луч? ---
  function hitMoon(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(moon)[0] ?? null;
  }

  // Насколько близко к метке считаем, что «попали» (в градусах по Луне).
  // Далеко от Луны допуск больше, вблизи — меньше.
  function tolerance() {
    return THREE.MathUtils.clamp((camera.position.length() - 1) * 1.2, 0.5, 5);
  }

  function nearestSiteWithin(lat, lon, maxDeg) {
    let best = null;
    for (const site of sites) {
      const d = angularDistanceDeg(lat, lon, site.lat, site.lon);
      if (d <= maxDeg && (best === null || d < best.d)) best = { site, d };
    }
    return best ? best.site : null;
  }

  // Выбор точки: если рядом метка места — открываем её карточку и летим к ней,
  // иначе просто ставим кольцо (а при вводе координат ещё и летим туда).
  function choose(lat, lon, tolDeg, flyAlways) {
    const site = nearestSiteWithin(lat, lon, tolDeg);
    if (site) {
      placeSelector(site.lat, site.lon);
      onPoint?.(site.lat, site.lon);
      onSite?.(site);
      flyTo(site.lat, site.lon);
    } else {
      placeSelector(lat, lon);
      onPoint?.(lat, lon);
      onSite?.(null);
      if (flyAlways) flyTo(lat, lon);
    }
  }

  // --- Клик, а не перетаскивание ---
  let down = null;
  canvas.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY, time: performance.now() };
  });
  canvas.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const held = performance.now() - down.time;
    down = null;
    if (moved > 5 || held > 500) return;   // это вращение мышкой, а не клик

    const hit = hitMoon(e);
    if (!hit) return;                       // клик мимо Луны
    const { lat, lon } = vector3ToLatLon(hit.point);
    choose(lat, lon, tolerance(), false);
  });

  // Курсор-«ладошка», когда мышь над меткой; цветное кольцо — предварительная оценка
  let lastHover = 0;
  canvas.addEventListener('pointermove', e => {
    if (e.buttons) { hideHover(); return; }   // вращаем Луну — подсказку прячем
    const hit = hitMoon(e);
    let over = false;
    if (hit) {
      const { lat, lon } = vector3ToLatLon(hit.point);
      over = nearestSiteWithin(lat, lon, tolerance()) !== null;
      const now = performance.now();
      if (onHover && now - lastHover > 80) {   // не чаще ~12 раз в секунду
        lastHover = now;
        const color = onHover(lat, lon, e.clientX, e.clientY);
        if (color) {
          hoverMaterial.color.set(color);
          const normal = latLonToVector3(lat, lon, 1);
          hoverRing.position.copy(normal).multiplyScalar(1.005);
          hoverRing.lookAt(normal.clone().multiplyScalar(2));
          hoverRing.visible = true;
        } else {
          hideHover();
        }
      }
    } else {
      hideHover();
    }
    canvas.style.cursor = over ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', hideHover);

  // Выбор точки «из кода» (ввод координат или названия): кольцо, карточка и полёт камеры
  return { selectPoint: (lat, lon) => choose(lat, lon, 0.3, true) };
}
