import { Vector3 } from "three";

const DEG = Math.PI / 180;

export function latLonToVector3(lat: number, lon: number, radius = 1): Vector3 {
  const phi = lat * DEG;
  const lambda = lon * DEG;

  return new Vector3(
    radius * Math.cos(phi) * Math.cos(lambda),
    radius * Math.sin(phi),
    -radius * Math.cos(phi) * Math.sin(lambda)
  );
}

export function getSubsolarPoint(date: Date) {
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;

  const lon = (12 - utcHours) * 15;

  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - yearStart) / 86_400_000;
  const lat = 23.44 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));

  return { lat, lon };
}


export function vector3ToLatLon(p: Vector3) {
  const r = p.length();
  const lat = Math.asin(p.y / r) / DEG;
  const lon = Math.atan2(-p.z, p.x) / DEG;
  return { lat, lon };
}