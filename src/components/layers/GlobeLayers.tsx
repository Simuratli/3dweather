import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { TextureLoader, Vector3, type Texture } from "three";
import { latLonToVector3 } from "../../utils/geo";
import {
  createLut,
  satelliteUrl,
  type FieldLayerId,
  type LayersMeta,
  type PressureCenter,
} from "../../utils/layers";
import {
  fieldFragment,
  isobarFragment,
  satelliteFragment,
  sphereVertex,
} from "./layer-shaders";

// Küre ile ülke sınırları (1.002) arasında
const FILL_RADIUS = 1.0012;
const ISOBAR_RADIUS = 1.0016;

type ShellProps = {
  radius: number;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
};

const Shell = ({ radius, fragmentShader, uniforms }: ShellProps) => (
  <mesh scale={radius}>
    <sphereGeometry args={[1, 128, 64]} />
    <shaderMaterial
      vertexShader={sphereVertex}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
      transparent
      depthWrite={false}
    />
  </mesh>
);

export const FieldLayer = ({ id, meta }: { id: FieldLayerId; meta: LayersMeta }) => {
  const data = useLoader(TextureLoader, `/data/layers/${id}.png`);
  const lut = useMemo(() => createLut(id, meta.layers[id]), [id, meta]);
  useEffect(() => () => lut.dispose(), [lut]);

  const uniforms = useMemo(() => ({ uData: { value: data }, uLut: { value: lut } }), [data, lut]);
  return <Shell radius={FILL_RADIUS} fragmentShader={fieldFragment} uniforms={uniforms} />;
};

export const SatelliteClouds = ({ date }: { date: string }) => {
  const image: Texture = useLoader(TextureLoader, satelliteUrl(date));
  const uniforms = useMemo(() => ({ uImage: { value: image } }), [image]);
  return <Shell radius={FILL_RADIUS} fragmentShader={satelliteFragment} uniforms={uniforms} />;
};

type IsobarProps = {
  meta: LayersMeta;
  data: Texture;
  centers: PressureCenter[] | null;
};

export const Isobars = ({ meta, data, centers }: IsobarProps) => {
  const { min, max } = meta.layers.pressure;
  const uniforms = useMemo(
    () => ({
      uData: { value: data },
      uRange: { value: [min, max] },
      uInterval: { value: 4 },
    }),
    [data, min, max]
  );

  return (
    <>
      <Shell radius={ISOBAR_RADIUS} fragmentShader={isobarFragment} uniforms={uniforms} />
      {centers?.map((c) => (
        <PressureLabel key={`${c.lat},${c.lon}`} center={c} />
      ))}
    </>
  );
};

const toCamera = new Vector3();

// Y = yüksek, A = alçak basınç; dünyanın arkasında kalınca gizlenir
const PressureLabel = ({ center }: { center: PressureCenter }) => {
  const camera = useThree((s) => s.camera);
  const ref = useRef<HTMLDivElement>(null);
  const position = useMemo(
    () => latLonToVector3(center.lat, center.lon, 1.01),
    [center.lat, center.lon]
  );
  const normal = useMemo(() => position.clone().normalize(), [position]);

  useFrame(() => {
    if (!ref.current) return;
    toCamera.copy(camera.position).sub(position).normalize();
    const facing = normal.dot(toCamera);
    ref.current.style.opacity = String(Math.min(Math.max((facing - 0.1) * 4, 0), 1));
  });

  const high = center.type === "H";
  return (
    <Html position={position} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div ref={ref} className="flex flex-col items-center leading-none select-none">
        <span
          className={`text-lg font-bold drop-shadow ${high ? "text-sky-300" : "text-rose-400"}`}
        >
          {high ? "Y" : "A"}
        </span>
        <span className="text-[10px] text-white/80 drop-shadow tabular-nums">{center.value}</span>
      </div>
    </Html>
  );
};
