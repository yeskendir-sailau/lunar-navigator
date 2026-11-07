// Мини-модуль «география»: переводит широту/долготу в точку на шаре и обратно.
// Договорённость: долгота 0° смотрит в сторону +x, восток — в сторону -z, север — вверх (+y).
// Так лежит наша текстура Луны на шаре three.js.
import * as THREE from 'three';

// широта, долгота (градусы) -> точка (x, y, z) на шаре радиуса radius
export function latLonToVector3(lat, lon, radius = 1) {
  const la = THREE.MathUtils.degToRad(lat);
  const lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    radius * Math.cos(la) * Math.cos(lo),
    radius * Math.sin(la),
    -radius * Math.cos(la) * Math.sin(lo)
  );
}

// точка (x, y, z) -> { lat, lon } в градусах (долгота от -180 до 180, восток плюс)
export function vector3ToLatLon(v) {
  const r = v.length();
  return {
    lat: THREE.MathUtils.radToDeg(Math.asin(v.y / r)),
    lon: THREE.MathUtils.radToDeg(Math.atan2(-v.z, v.x)),
  };
}

// угол между двумя точками на шаре, в градусах
export function angularDistanceDeg(lat1, lon1, lat2, lon2) {
  const a = latLonToVector3(lat1, lon1, 1);
  const b = latLonToVector3(lat2, lon2, 1);
  return THREE.MathUtils.radToDeg(a.angleTo(b));
}
