import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type BufferGeometry } from "three";
import type { WindField } from "../../utils/wind";

const COUNT = 50000;
const TRAIL = 16;
const SEGMENTS = TRAIL - 1;
const RECORD_EVERY = 0.05;
const SPEED = 0.3;
const RADIUS = 1.005;
const DEG = Math.PI / 180;

function randomLat() {
  return Math.asin(Math.random() * 2 - 1) / DEG;
}

function randomLon() {
  return Math.random() * 360 - 180;
}

function writeXYZ(lat: number, lon: number, out: Float32Array, o: number) {
  const phi = lat * DEG;
  const lambda = lon * DEG;
  out[o] = RADIUS * Math.cos(phi) * Math.cos(lambda);
  out[o + 1] = RADIUS * Math.sin(phi);
  out[o + 2] = -RADIUS * Math.cos(phi) * Math.sin(lambda);
}

function speedColor(speed: number): [number, number, number] {
  const t = Math.min(speed / 20, 1);
  if (t < 0.5) {
    const k = t / 0.5;
    return [0.2 + 0.2 * k, 0.5 + 0.5 * k, 1.0 - 0.2 * k];
  }
  const k = (t - 0.5) / 0.5;
  return [0.4 + 0.6 * k, 1.0 - 0.1 * k, 0.8 - 0.4 * k];
}

type Props = { wind: WindField };

const WindParticles = ({ wind }: Props) => {
  const geometryRef = useRef<BufferGeometry>(null);
  const timer = useRef(0);

  const data = useMemo(() => {
    const lat = new Float32Array(COUNT);
    const lon = new Float32Array(COUNT);
    const age = new Float32Array(COUNT);
    const history = new Float32Array(COUNT * TRAIL * 3);
    const positions = new Float32Array(COUNT * SEGMENTS * 2 * 3);
    const colors = new Float32Array(COUNT * SEGMENTS * 2 * 3);

    for (let i = 0; i < COUNT; i++) {
      lat[i] = randomLat();
      lon[i] = randomLon();
      age[i] = Math.random() * 5;
      for (let k = 0; k < TRAIL; k++) {
        writeXYZ(lat[i], lon[i], history, (i * TRAIL + k) * 3);
      }
    }

    return { lat, lon, age, history, positions, colors };
  }, []);

  useFrame((_, delta) => {
    const { lat, lon, age, history, positions, colors } = data;
    const dt = Math.min(delta, 0.05);

    timer.current += dt;
    const shift = timer.current >= RECORD_EVERY;
    if (shift) timer.current = 0;

    for (let i = 0; i < COUNT; i++) {
      const h = i * TRAIL * 3;

      age[i] -= dt;
      if (age[i] <= 0 || Math.abs(lat[i]) > 85) {
        lat[i] = randomLat();
        lon[i] = randomLon();
        age[i] = 2 + Math.random() * 4;
        for (let k = 0; k < TRAIL; k++) {
          writeXYZ(lat[i], lon[i], history, h + k * 3);
        }
      }

      const { u, v } = wind.getWind(lat[i], lon[i]);
      const cosLat = Math.max(Math.cos(lat[i] * DEG), 0.1);
      lat[i] += v * SPEED * dt;
      lon[i] += (u * SPEED * dt) / cosLat;
      if (lon[i] > 180) lon[i] -= 360;
      if (lon[i] < -180) lon[i] += 360;

      if (shift) history.copyWithin(h + 3, h, h + SEGMENTS * 3);
      writeXYZ(lat[i], lon[i], history, h);

      const [r, g, b] = speedColor(Math.hypot(u, v));

      for (let j = 0; j < SEGMENTS; j++) {
        const out = (i * SEGMENTS + j) * 6;
        const a = h + j * 3;
        const c = h + (j + 1) * 3;

        positions[out] = history[a];
        positions[out + 1] = history[a + 1];
        positions[out + 2] = history[a + 2];
        positions[out + 3] = history[c];
        positions[out + 4] = history[c + 1];
        positions[out + 5] = history[c + 2];

        const fadeA = 1 - j / SEGMENTS;
        const fadeB = 1 - (j + 1) / SEGMENTS;
        colors[out] = r * fadeA;
        colors[out + 1] = g * fadeA;
        colors[out + 2] = b * fadeA;
        colors[out + 3] = r * fadeB;
        colors[out + 4] = g * fadeB;
        colors[out + 5] = b * fadeB;
      }
    }

    const geometry = geometryRef.current;
    if (geometry) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    }
  });

  return (
    <lineSegments frustumCulled={false}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
};

export default WindParticles;