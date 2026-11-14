// Модуль 2: читает data/sites.json и ставит на Луну цветные метки.
import * as THREE from 'three';
import { scene, camera, onFrame } from './globe.js';
import { latLonToVector3 } from './geo.js';

// Цвета меток по типу места. Красный/жёлтый/зелёный не берём:
// они зарезервированы за итоговой оценкой безопасности. Белое — за выбранной точкой.
export const TYPE_COLORS = {
  heritage: 0x4cc9f0,   // историческое место посадки — голубой
  landed:   0xb388ff,   // недавняя посадка — фиолетовый
  impact:   0xff79c6,   // место падения — розовый
  planned:  0x9fb0c8,   // будущая цель — серо-голубой
};
const DEFAULT_COLOR = 0xcccccc;

// Загружает список мест; записи без названия или координат пропускает
export async function loadSites(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${url}: ${response.status}`);
  const all = await response.json();
  const good = [];
  for (const site of all) {
    if (site.name && Number.isFinite(site.lat) && Number.isFinite(site.lon)) {
      good.push(site);
    } else if (site.type !== 'planned') {   // у будущих целей координаты могут быть ещё не заполнены
      console.warn('Skipped bad record in sites.json:', site);
    }
  }
  return good;
}

// Ставит по одной метке на каждое место
export function addMarkers(sites) {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(0.012, 16, 16);

  for (const site of sites) {
    const color = TYPE_COLORS[site.type] ?? DEFAULT_COLOR;
    const marker = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
    marker.position.copy(latLonToVector3(site.lat, site.lon, 1.012));  // чуть над поверхностью
    marker.userData.site = site;
    group.add(marker);
  }
  scene.add(group);

  // При приближении метки уменьшаются, при отдалении растут: на экране размер почти не меняется
  onFrame(() => {
    const s = THREE.MathUtils.clamp(camera.position.length() / 4, 0.3, 2.5);
    for (const marker of group.children) marker.scale.setScalar(s);
  });
  return group;
}
