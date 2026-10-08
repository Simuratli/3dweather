import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  ShaderMaterial,
  type Camera,
  type Vector3,
} from "three";
import { gstime, propagate } from "satellite.js";
import {
  EARTH_RADIUS_KM,
  SAT_CATEGORIES,
  eciToScene,
  type Satellite,
} from "../../utils/satellites";

// Kare başına SGP4 bütçesi (ms). 16 bin uydu ~200 ms sürer; her uydu böylece
// ~2-3 saniyede bir tazelenir, arada GPU doğrusal ilerletir (hata < 1 m).
const BUDGET_MS = 2;
// Nokta çapı (CSS piksel); ekran yoğunluğuyla çarpılır
const SIZES = { starlink: 3, leo: 3.5, high: 4.5, station: 9 };

const vertexShader = /* glsl */ `
  attribute vec3 aP0;   // ECI konum (km), aT0 anında
  attribute vec3 aV0;   // ECI hız (km/s)
  attribute float aT0;  // hesaplandığı an (sn, taban zamana göre)
  attribute float aCat; // kategori; < 0 = henüz hesaplanmadı / geçersiz

  uniform float uTime;
  uniform float uGmst;
  uniform float uPixelRatio;
  uniform vec3 uColors[4];
  uniform float uSizes[4];

  varying vec3 vColor;

  void main() {
    if (aCat < 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vec3 p = aP0 + aV0 * (uTime - aT0);
    // ECI -> ECF (Dünya dönüşü) -> sahne eksenleri (utils/geo ile aynı)
    float c = cos(uGmst);
    float s = sin(uGmst);
    vec3 scene = vec3(p.x * c + p.y * s, p.z, p.x * s - p.y * c) / ${EARTH_RADIUS_KM.toFixed(1)};

    int cat = int(aCat + 0.5);
    vColor = uColors[cat];
    gl_PointSize = uSizes[cat] * uPixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(scene, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;

  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.25, r));
  }
`;

const scratch: [number, number, number] = [0, 0, 0];

// Kameradan noktaya giden doğru Dünya'yı (yarıçap 1) kesiyor mu
function occluded(camera: Vector3, x: number, y: number, z: number) {
  const dx = x - camera.x;
  const dy = y - camera.y;
  const dz = z - camera.z;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (camera.x * dx + camera.y * dy + camera.z * dz);
  const c = camera.x * camera.x + camera.y * camera.y + camera.z * camera.z - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t > 0 && t < 1;
}

export type Swarm = ReturnType<typeof createSwarm>;

export function createSwarm(satellites: Satellite[], pixelRatio: number) {
  const count = satellites.length;
  const base = Date.now();

  const p0 = new Float32Array(count * 3);
  const v0 = new Float32Array(count * 3);
  const t0 = new Float32Array(count);
  const cat = new Float32Array(count).fill(-1);
  const catIndex = Object.fromEntries(SAT_CATEGORIES.map((c, i) => [c.id, i]));

  const geometry = new BufferGeometry();
  // Çizim sayısı için gerekli; asıl konum shader'da hesaplanır
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  const attrs = {
    aP0: new BufferAttribute(p0, 3),
    aV0: new BufferAttribute(v0, 3),
    aT0: new BufferAttribute(t0, 1),
    aCat: new BufferAttribute(cat, 1),
  };
  for (const [name, attr] of Object.entries(attrs)) {
    attr.setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, attr);
  }

  const colors = SAT_CATEGORIES.map((c) => new Color(c.color));
  // İstasyonlar bloom eşiğini geçsin, hafifçe parlasın
  colors[catIndex.station].multiplyScalar(2.5);

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uGmst: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uColors: { value: colors },
      uSizes: { value: SAT_CATEGORIES.map((c) => SIZES[c.id]) },
    },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });

  let cursor = 0;
  let gmst = 0;
  let seconds = 0;

  function refresh(i: number, date: Date, at: number) {
    const pv = propagate(satellites[i].satrec, date);
    if (!pv) {
      cat[i] = -1; // yörüngesi çökmüş ya da veri bozuk
      return;
    }
    const { position: p, velocity: v } = pv;
    p0.set([p.x, p.y, p.z], i * 3);
    v0.set([v.x, v.y, v.z], i * 3);
    t0[i] = at;
    cat[i] = catIndex[satellites[i].category];
  }

  // Shader ile aynı hesap, CPU'da (etiket, kart ve seçim için)
  function positionOf(i: number, out: [number, number, number]) {
    const dt = seconds - t0[i];
    return eciToScene(
      p0[i * 3] + v0[i * 3] * dt,
      p0[i * 3 + 1] + v0[i * 3 + 1] * dt,
      p0[i * 3 + 2] + v0[i * 3 + 2] * dt,
      gmst,
      out
    );
  }

  function markRange(start: number, end: number) {
    if (end <= start) return;
    attrs.aP0.addUpdateRange(start * 3, (end - start) * 3);
    attrs.aV0.addUpdateRange(start * 3, (end - start) * 3);
    attrs.aT0.addUpdateRange(start, end - start);
    attrs.aCat.addUpdateRange(start, end - start);
  }

  return {
    count,
    geometry,
    material,

    update(nowMs: number) {
      const date = new Date(nowMs);
      seconds = (nowMs - base) / 1000;
      gmst = gstime(date);
      material.uniforms.uTime.value = seconds;
      material.uniforms.uGmst.value = gmst;

      const start = cursor;
      const deadline = performance.now() + BUDGET_MS;
      let n = 0;
      while (n < count && performance.now() < deadline) {
        // Saat okuması pahalı değil ama her uyduda gerekmez
        for (let k = 0; k < 16 && n < count; k++, n++) {
          refresh(cursor, date, seconds);
          cursor = (cursor + 1) % count;
        }
      }

      for (const a of Object.values(attrs)) a.clearUpdateRanges();
      if (start + n <= count) {
        markRange(start, start + n);
      } else {
        markRange(start, count);
        markRange(0, start + n - count);
      }
      for (const a of Object.values(attrs)) a.needsUpdate = true;
    },

    positionOf,

    // Hesaplanmış ve geçerli mi (ilk saniyelerde uydular sırayla belirir)
    isReady: (i: number) => cat[i] >= 0,

    // Hareket yönü sahne eksenlerinde (model yönlendirmesi için; büyüklüğü önemsiz)
    velocityOf(i: number, out: [number, number, number]) {
      return eciToScene(v0[i * 3], v0[i * 3 + 1], v0[i * 3 + 2], gmst, out);
    },

    speedKmh(i: number) {
      return Math.hypot(v0[i * 3], v0[i * 3 + 1], v0[i * 3 + 2]) * 3600;
    },

    gmst: () => gmst,

    // Son update() anı (ms); çizilen konumlarla aynı zaman
    nowMs: () => base + seconds * 1000,

    // Ekranda imlece en yakın, Dünya'nın arkasında kalmayan uydu
    pick(camera: Camera, px: number, py: number, width: number, height: number, radiusPx: number) {
      const m = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).elements;
      let best = -1;
      let bestDist = radiusPx * radiusPx;
      for (let i = 0; i < count; i++) {
        if (cat[i] < 0) continue;
        const [x, y, z] = positionOf(i, scratch);
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        if (w <= 0) continue;
        const sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) * 0.5 * width;
        const sy = (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * 0.5 * height;
        let d = (sx - px) ** 2 + (sy - py) ** 2;
        // İstasyona kenetli araçlar (Crew Dragon, Soyuz…) aynı noktada: istasyon kazansın
        if (cat[i] === catIndex.station) d *= 0.1;
        if (d < bestDist && !occluded(camera.position, x, y, z)) {
          bestDist = d;
          best = i;
        }
      }
      return best < 0 ? null : best;
    },

    isOccluded(camera: Camera, i: number) {
      const [x, y, z] = positionOf(i, scratch);
      return occluded(camera.position, x, y, z);
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
