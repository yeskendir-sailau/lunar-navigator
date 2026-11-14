// Модуль 3: выбор точки кликом.
// Клик по Луне -> белое кольцо + широта/долгота.
// Клик рядом с меткой места -> то же, плюс камера подлетает и открывается карточка.
import * as THREE from 'three';
import { camera, renderer, moon, onFrame, flyTo } from './globe.js';
import { latLonToVector3, vector3ToLatLon, angularDistanceDeg } from './geo.js';
import { SLOT_COLORS } from './slot-colors.js';

// getPreview(lat, lon) -> { hex, icon, word } | null: быстрый расчёт для кольца при наведении (необязательно)
// onPoint(lat, lon) может вернуть цвет (число) для кольца выбранной точки
export function initPicker({ sites, onPoint, onSite, getPreview }) {
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

  // --- Кольцо-подсказка под курсором: цвет предварительной оценки ---
  const previewMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const preview = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.04, 48), previewMat);
  preview.visible = false;
  moon.parent.add(preview);

  const tip = document.createElement('div');   // подпись у курсора: значок и слово (цвет не единственный сигнал)
  tip.className = 'hover-tip';
  tip.style.cssText = 'position:fixed;z-index:30;pointer-events:none;display:none;padding:3px 8px;border-radius:8px;' +
    'background:rgba(10,14,22,.92);color:#e8edf5;border:1px solid rgba(255,255,255,.2);font:12px system-ui,sans-serif;';
  document.body.appendChild(tip);

  // --- Метки мест A / B / C для сравнения: цветное кольцо с буквой, остаются на Луне, пока место выбрано ---
  const slotMarkers = {};

  function letterTexture(letter, css) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 44px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(letter, 32, 34);
    g.fillStyle = css;
    g.fillText(letter, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeSlotMarker(slot) {
    const { hex, css } = SLOT_COLORS[slot];
    const group = new THREE.Group();
    // A, B, C — кольца разного размера и буквы в разных местах: если это одно место (сравнение дат), видно все три
    const k = { A: 0, B: 1, C: 2 }[slot] ?? 0;
    const r0 = 0.038 + k * 0.014;
    const dark = new THREE.Mesh(new THREE.RingGeometry(r0 - 0.004, r0 + 0.012, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 0.008, 48),
      new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide }));
    ring.position.z = 0.0008;   // чуть выше тёмной подложки
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTexture(slot, css), transparent: true, depthWrite: false }));
    label.center.set([0.5, 1.6, -0.6][k], -0.5 - (r0 + 0.022) / 0.11);   // буква над кольцом: A по центру, B левее, C правее
    label.scale.setScalar(0.11);
    label.position.z = 0.0016;
    group.add(dark, ring, label);
    group.visible = false;
    moon.parent.add(group);
    return group;
  }

  function setSlotMarker(slot, lat, lon) {
    if (!SLOT_COLORS[slot]) return;
    const marker = (slotMarkers[slot] ??= makeSlotMarker(slot));
    const normal = latLonToVector3(lat, lon, 1);
    marker.position.copy(normal).multiplyScalar(1.006);
    marker.lookAt(normal.clone().multiplyScalar(2));
    marker.visible = true;
  }

  function clearSlotMarker(slot) {
    if (slotMarkers[slot]) slotMarkers[slot].visible = false;
  }

  onFrame(() => {   // кольца тоже масштабируем при приближении
    const k = THREE.MathUtils.clamp(camera.position.length() / 4, 0.3, 2.5);
    selector.scale.setScalar(k);
    preview.scale.setScalar(k);
    for (const marker of Object.values(slotMarkers)) marker.scale.setScalar(k);
  });

  function setSelectorColor(hex) {
    white.color.setHex(hex ?? 0xffffff);
  }

  function hidePreview() {
    preview.visible = false;
    tip.style.display = 'none';
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
      setSelectorColor(onPoint?.(site.lat, site.lon));
      onSite?.(site);
      flyTo(site.lat, site.lon);
    } else {
      placeSelector(lat, lon);
      setSelectorColor(onPoint?.(lat, lon));
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

  // Курсор-«ладошка» над меткой и кольцо-подсказка с предварительным цветом (считаем не чаще ~10 раз в секунду)
  let lastPreview = 0;
  canvas.addEventListener('pointermove', e => {
    if (e.buttons) { hidePreview(); return; }
    const hit = hitMoon(e);
    if (!hit) { canvas.style.cursor = ''; hidePreview(); return; }
    const { lat, lon } = vector3ToLatLon(hit.point);
    canvas.style.cursor = nearestSiteWithin(lat, lon, tolerance()) !== null ? 'pointer' : '';
    if (!getPreview) return;

    const nowMs = performance.now();
    if (nowMs - lastPreview < 100) {
      tip.style.left = `${e.clientX + 14}px`;
      tip.style.top = `${e.clientY + 14}px`;
      return;
    }
    lastPreview = nowMs;
    const p = getPreview(lat, lon);
    if (!p) { hidePreview(); return; }
    const normal = latLonToVector3(lat, lon, 1);
    preview.position.copy(normal).multiplyScalar(1.006);
    preview.lookAt(normal.clone().multiplyScalar(2));
    previewMat.color.setHex(p.hex);
    preview.visible = true;
    tip.textContent = `${p.icon} ${p.word}`;
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY + 14}px`;
    tip.style.display = 'block';
  });
  canvas.addEventListener('pointerleave', hidePreview);

  // Выбор точки «из кода» (ввод координат или названия): кольцо, карточка и полёт камеры
  return { selectPoint: (lat, lon) => choose(lat, lon, 0.3, true), setSelectorColor, setSlotMarker, clearSlotMarker };
}
