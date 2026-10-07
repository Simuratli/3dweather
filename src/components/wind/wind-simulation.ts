import {
  AdditiveBlending,
  BufferAttribute,
  DataTexture,
  FloatType,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector4,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";
import type { WindField } from "../../utils/wind";
import {
  particleFragment,
  particleVertex,
  simFragment,
  simVertex,
} from "./wind-shaders";

const SEGMENTS = 12; // iz başına çizgi parçası
const STEP = 0.06; // iz noktaları arası süre (sn)
const SPEED = 0.3; // m/s -> derece/sn
const RADIUS = 1.005;
const OPACITY = 0.5;
const MAX_DT = 0.05;
const DEG = Math.PI / 180;

// GPU: 131.072 parçacık. CPU yedeği her karede JS'te döndüğü için daha az.
const GPU_SIZE = { width: 512, height: 256 };
const CPU_SIZE = { width: 256, height: 128 };

export type WindSimulationMode = "gpu" | "cpu";

// Parçacık durumunu tutan ve her karede ilerleten arka uç
type Backend = {
  width: number;
  height: number;
  readonly texture: Texture;
  step: (dt: number) => void;
  dispose: () => void;
};

export type WindSimulation = {
  mode: WindSimulationMode;
  count: number;
  geometry: InstancedBufferGeometry;
  material: ShaderMaterial;
  update: (delta: number) => void;
  dispose: () => void;
};

function createWindTexture(wind: WindField) {
  const { pixels, meta } = wind;
  const texture = new DataTexture(
    new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
    meta.width,
    meta.height,
    RGBAFormat
  );
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createGpuBackend(
  renderer: WebGLRenderer,
  windTexture: Texture,
  windRange: Vector4
): Backend {
  const { width, height } = GPU_SIZE;
  const targetOptions = {
    type: FloatType,
    format: RGBAFormat,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: false,
  };
  const targets = [
    new WebGLRenderTarget(width, height, targetOptions),
    new WebGLRenderTarget(width, height, targetOptions),
  ];

  const material = new ShaderMaterial({
    vertexShader: simVertex,
    fragmentShader: simFragment,
    uniforms: {
      uWind: { value: windTexture },
      uWindRange: { value: windRange },
      uState: { value: targets[0].texture },
      uDt: { value: 0 },
      uSpeed: { value: SPEED },
      uSeed: { value: 0 },
      uInit: { value: true },
    },
  });
  const scene = new Scene();
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let frame = 0;

  return {
    width,
    height,
    get texture() {
      return targets[frame % 2].texture;
    },
    step(dt) {
      const read = targets[frame % 2];
      const write = targets[(frame + 1) % 2];

      material.uniforms.uState.value = read.texture;
      material.uniforms.uDt.value = dt;
      material.uniforms.uSeed.value = Math.random() * 1000;
      material.uniforms.uInit.value = frame === 0;

      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(write);
      renderer.render(scene, camera);
      renderer.setRenderTarget(previous);

      frame++;
    },
    dispose() {
      targets.forEach((t) => t.dispose());
      material.dispose();
      quad.geometry.dispose();
    },
  };
}

// simFragment ile aynı mantık, JS'te
function createCpuBackend(wind: WindField): Backend {
  const { width, height } = CPU_SIZE;
  const count = width * height;
  const state = new Float32Array(count * 4);

  const texture = new DataTexture(state, width, height, RGBAFormat, FloatType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;

  function spawn(o: number, initial: boolean) {
    const age = initial ? Math.random() * 5 : 2 + Math.random() * 4;
    state[o] = Math.asin(Math.random() * 2 - 1) / DEG;
    state[o + 1] = Math.random() * 360 - 180;
    state[o + 2] = age;
    state[o + 3] = initial ? age + 10 : age;
  }

  for (let i = 0; i < count; i++) spawn(i * 4, true);
  texture.needsUpdate = true;

  return {
    width,
    height,
    texture,
    step(dt) {
      for (let o = 0; o < state.length; o += 4) {
        const lat = state[o];
        if (state[o + 2] <= 0 || Math.abs(lat) > 85) {
          spawn(o, false);
          continue;
        }

        const { u, v } = wind.getWind(lat, state[o + 1]);
        const cosLat = Math.max(Math.cos(lat * DEG), 0.1);
        let lon = state[o + 1] + (u * SPEED * dt) / cosLat;
        if (lon > 180) lon -= 360;
        if (lon < -180) lon += 360;

        state[o] = lat + v * SPEED * dt;
        state[o + 1] = lon;
        state[o + 2] -= dt;
      }
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
    },
  };
}

function createTrailGeometry(count: number) {
  const geometry = new InstancedBufferGeometry();
  const steps = new Float32Array((SEGMENTS + 1) * 3);
  const index: number[] = [];
  for (let j = 0; j <= SEGMENTS; j++) steps[j * 3] = j;
  for (let j = 0; j < SEGMENTS; j++) index.push(j, j + 1);
  geometry.setAttribute("position", new BufferAttribute(steps, 3));
  geometry.setIndex(index);
  geometry.instanceCount = count;
  return geometry;
}

// Float dokuya çizim (EXT_color_buffer_float) yoksa simülasyon CPU'ya düşer
export function createWindSimulation(
  renderer: WebGLRenderer,
  wind: WindField
): WindSimulation {
  const mode: WindSimulationMode = renderer.extensions.has(
    "EXT_color_buffer_float"
  )
    ? "gpu"
    : "cpu";

  const windTexture = createWindTexture(wind);
  const { uMin, uMax, vMin, vMax } = wind.meta;
  const windRange = new Vector4(uMin, uMax, vMin, vMax);

  const backend =
    mode === "gpu"
      ? createGpuBackend(renderer, windTexture, windRange)
      : createCpuBackend(wind);
  const count = backend.width * backend.height;

  const material = new ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    defines: { STATE_W: backend.width, SEGMENTS },
    uniforms: {
      uWind: { value: windTexture },
      uWindRange: { value: windRange },
      uState: { value: backend.texture },
      uSpeed: { value: SPEED },
      uStep: { value: STEP },
      uRadius: { value: RADIUS },
      uOpacity: { value: OPACITY },
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  const geometry = createTrailGeometry(count);

  return {
    mode,
    count,
    geometry,
    material,
    update(delta) {
      backend.step(Math.min(delta, MAX_DT));
      material.uniforms.uState.value = backend.texture;
    },
    dispose() {
      backend.dispose();
      windTexture.dispose();
      material.dispose();
      geometry.dispose();
    },
  };
}
