import { useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  Color,
  DoubleSide,
  Quaternion,
  Vector3,
  type Mesh,
  type MeshBasicMaterial,
} from "three";
import { latLonToVector3 } from "../../utils/geo";
import { quakeClass, timeAgo, type Quake } from "../../utils/earthquakes";

const RADIUS = 1.003; // ülke sınırlarının (1.002) üstünde, parçacıkların altında
const PULSE_SECONDS = 2;
const Z = new Vector3(0, 0, 1);
const toCamera = new Vector3();

// Büyüklük logaritmik bir ölçek; görsel yarıçap ona doğrusal büyür
function coreRadius(mag: number) {
  return 0.003 + 0.0022 * Math.max(mag - 2.5, 0);
}

function facesCamera(normal: Vector3, point: Vector3, camera: Vector3) {
  return normal.dot(toCamera.copy(camera).sub(point)) > 0;
}

type MarkerProps = {
  quake: Quake;
  now: number; // yaş hesabı için akışın oluşturulma zamanı
  onHover: (quake: Quake | null) => void;
  onPick: (quake: Quake) => void;
};

const QuakeMarker = ({ quake, now, onHover, onPick }: MarkerProps) => {
  const ring = useRef<Mesh>(null);
  const ringMaterial = useRef<MeshBasicMaterial>(null);

  const { position, normal, quaternion, color, r, offset, strength } = useMemo(() => {
    const position = latLonToVector3(quake.lat, quake.lon, RADIUS);
    const normal = position.clone().normalize();
    const ageHours = (now - quake.time) / 3_600_000;
    return {
      position,
      normal,
      quaternion: new Quaternion().setFromUnitVectors(Z, normal),
      color: new Color(quakeClass(quake.mag).color),
      r: coreRadius(quake.mag),
      // Hepsi aynı anda atmasın
      offset: (quake.lat * 7.3 + quake.lon * 3.1) % PULSE_SECONDS,
      // Yeni depremler güçlü, 24 saatlikler sönük atar
      strength: 1 - 0.7 * Math.min(ageHours / 24, 1),
    };
  }, [quake, now]);

  useFrame(({ clock }) => {
    const phase = (((clock.elapsedTime + offset) % PULSE_SECONDS) + PULSE_SECONDS) % PULSE_SECONDS / PULSE_SECONDS;
    ring.current?.scale.setScalar(r * (1 + phase * 4));
    if (ringMaterial.current) ringMaterial.current.opacity = (1 - phase) * 0.9 * strength;
  });

  const isFront = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    facesCamera(normal, position, e.camera.position);

  return (
    <group position={position} quaternion={quaternion}>
      <mesh>
        <circleGeometry args={[r, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.5 + 0.5 * strength} depthWrite={false} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[0.8, 1, 48]} />
        <meshBasicMaterial
          ref={ringMaterial}
          color={color}
          transparent
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      {/* Küçük noktalara denk gelmek zor: görünmez, daha geniş tıklama alanı */}
      <mesh
        onPointerOver={(e) => {
          if (!isFront(e)) return;
          e.stopPropagation();
          document.body.style.cursor = "pointer";
          onHover(quake);
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
          onHover(null);
        }}
        onClick={(e) => {
          if (!isFront(e) || e.delta > 4) return;
          e.stopPropagation();
          onPick(quake);
        }}
      >
        <circleGeometry args={[Math.max(r * 2.5, 0.012), 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
};

type CardProps = {
  quake: Quake;
  pinned: boolean;
  onClose: () => void;
};

// Depremin yanında açılan kart; dünyanın arkasına geçince gizlenir
const QuakeCard = ({ quake, pinned, onClose }: CardProps) => {
  const camera = useThree((s) => s.camera);
  const ref = useRef<HTMLDivElement>(null);
  const position = useMemo(() => latLonToVector3(quake.lat, quake.lon, RADIUS), [quake]);
  const normal = useMemo(() => position.clone().normalize(), [position]);

  useFrame(() => {
    if (!ref.current) return;
    const visible = facesCamera(normal, position, camera.position);
    ref.current.style.visibility = visible ? "visible" : "hidden";
  });

  const cls = quakeClass(quake.mag);
  return (
    <Html position={position} zIndexRange={[20, 10]} style={{ pointerEvents: pinned ? "auto" : "none" }}>
      <div
        ref={ref}
        className="ml-3 -translate-y-1/2 w-60 rounded-xl border border-white/10 bg-slate-900/90 p-3 text-white shadow-xl backdrop-blur"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cls.color }} aria-hidden />
            <span className="text-lg font-semibold tabular-nums">M{quake.mag.toFixed(1)}</span>
            <span className="text-xs text-slate-400">{cls.label.split(" ")[1]}</span>
          </div>
          {pinned && (
            <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Kapat">
              ✕
            </button>
          )}
        </div>
        <p className="mt-1 text-sm">{quake.place}</p>
        <p className="mt-1 text-xs text-slate-400 tabular-nums">
          {timeAgo(quake.time)} · {Math.round(quake.depth)} km derinlik
        </p>
        {quake.tsunami && (
          <p className="mt-1 text-xs font-medium text-amber-300">⚠ Tsunami bildirimi var</p>
        )}
        {pinned ? (
          <a
            href={quake.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs text-sky-300 hover:underline"
          >
            USGS'te ayrıntılar ↗
          </a>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">Sabitlemek için tıkla</p>
        )}
      </div>
    </Html>
  );
};

type Props = { quakes: Quake[]; updated: number };

const Earthquakes = ({ quakes, updated }: Props) => {
  const [hovered, setHovered] = useState<Quake | null>(null);
  const [pinned, setPinned] = useState<Quake | null>(null);
  const card = pinned ?? hovered;

  return (
    <>
      {quakes.map((q) => (
        <QuakeMarker key={q.id} quake={q} now={updated} onHover={setHovered} onPick={setPinned} />
      ))}
      {card && (
        <QuakeCard
          quake={card}
          pinned={card === pinned}
          onClose={() => setPinned(null)}
        />
      )}
    </>
  );
};

export default Earthquakes;
