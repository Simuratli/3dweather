import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import type { Group } from "three";
import { propagate } from "satellite.js";
import {
  EARTH_RADIUS_KM,
  SAT_CATEGORIES,
  type Satellite,
} from "../../utils/satellites";
import { createSwarm, type Swarm } from "./swarm";
import SatelliteModel from "./SatelliteModel";

const PICK_RADIUS_PX = 10;
const PICK_INTERVAL_MS = 50;
const scratch: [number, number, number] = [0, 0, 0];

type Props = { satellites: Satellite[] };

const SatelliteLayer = ({ satellites }: Props) => {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const swarm = useMemo(
    () => createSwarm(satellites, gl.getPixelRatio()),
    [satellites, gl]
  );
  useEffect(() => () => swarm.dispose(), [swarm]);

  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  useFrame(() => swarm.update(Date.now()));

  useEffect(() => {
    const el = gl.domElement;
    let lastPick = 0;
    let trailing: ReturnType<typeof setTimeout> | undefined;
    let current: number | null = null;
    let down = { x: 0, y: 0 };

    const set = (i: number | null) => {
      current = i;
      setHovered(i);
      el.style.cursor = i === null ? "" : "pointer";
    };

    const pickAt = (clientX: number, clientY: number) => {
      lastPick = performance.now();
      const rect = el.getBoundingClientRect();
      set(
        swarm.pick(camera, clientX - rect.left, clientY - rect.top, rect.width, rect.height, PICK_RADIUS_PX)
      );
    };

    // Saniyede en fazla 20 seçim; ama fare durduğunda son konum da mutlaka
    // değerlendirilsin, yoksa aradaki bir konumun seçimi ekranda kalır
    const onMove = (e: PointerEvent) => {
      clearTimeout(trailing);
      if (e.buttons) return; // sürükleyerek döndürüyor
      const wait = PICK_INTERVAL_MS - (performance.now() - lastPick);
      if (wait <= 0) pickAt(e.clientX, e.clientY);
      else trailing = setTimeout(() => pickAt(e.clientX, e.clientY), wait);
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    // R3F'ten önce yakala: uyduya tıklamak dünya noktası seçmesin
    const onClick = (e: MouseEvent) => {
      if (current === null || e.target !== el) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      e.stopPropagation();
      setPinned(current);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPinned(null);
    const onLeave = () => {
      clearTimeout(trailing);
      set(null);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerleave", onLeave);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(trailing);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
      el.style.cursor = "";
    };
  }, [gl, camera, swarm]);

  const card = pinned ?? hovered;
  const labeled = useMemo(
    () => satellites.flatMap((s, i) => (s.label ? [i] : [])),
    [satellites]
  );

  return (
    <>
      <points geometry={swarm.geometry} material={swarm.material} frustumCulled={false} />

      {/* Sabitlenen istasyonun etiketi modelin üstüne binmesin; adı zaten kartta */}
      {labeled
        .filter((i) => i !== pinned)
        .map((i) => (
          <SatelliteLabel key={i} swarm={swarm} index={i} text={satellites[i].label!} />
        ))}

      {pinned !== null && (
        <SatelliteModel
          swarm={swarm}
          index={pinned}
          category={satellites[pinned].category}
        />
      )}

      {card !== null && (
        <>
          <OrbitPath swarm={swarm} satellite={satellites[card]} />
          <SatelliteCard
            swarm={swarm}
            index={card}
            satellite={satellites[card]}
            pinned={card === pinned}
            onClose={() => setPinned(null)}
          />
        </>
      )}
    </>
  );
};

// Uydunun sahnedeki konumunu her karede izleyen grup; arkada kalınca gizler
function useFollow(swarm: Swarm, index: number) {
  const camera = useThree((s) => s.camera);
  const group = useRef<Group>(null);
  const element = useRef<HTMLDivElement>(null);

  useFrame(() => {
    if (!group.current) return;
    group.current.position.set(...swarm.positionOf(index, scratch));
    if (element.current) {
      const visible = swarm.isReady(index) && !swarm.isOccluded(camera, index);
      element.current.style.visibility = visible ? "visible" : "hidden";
    }
  });

  return { group, element };
}

const SatelliteLabel = ({ swarm, index, text }: { swarm: Swarm; index: number; text: string }) => {
  const { group, element } = useFollow(swarm, index);
  return (
    <group ref={group}>
      <Html zIndexRange={[15, 5]} style={{ pointerEvents: "none" }}>
        <div
          ref={element}
          className="ml-2 -translate-y-1/2 rounded bg-slate-900/70 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-white"
        >
          {text}
        </div>
      </Html>
    </group>
  );
};

type CardProps = {
  swarm: Swarm;
  index: number;
  satellite: Satellite;
  pinned: boolean;
  onClose: () => void;
};

const SatelliteCard = ({ swarm, index, satellite, pinned, onClose }: CardProps) => {
  const { group, element } = useFollow(swarm, index);
  const altitude = useRef<HTMLSpanElement>(null);
  const speed = useRef<HTMLSpanElement>(null);

  // Yükseklik ve hız sürekli değişir: React render'ı yerine doğrudan yaz
  useFrame(() => {
    const [x, y, z] = swarm.positionOf(index, scratch);
    if (altitude.current) {
      altitude.current.textContent = Math.round((Math.hypot(x, y, z) - 1) * EARTH_RADIUS_KM).toLocaleString("tr-TR");
    }
    if (speed.current) {
      speed.current.textContent = Math.round(swarm.speedKmh(index)).toLocaleString("tr-TR");
    }
  });

  const category = SAT_CATEGORIES.find((c) => c.id === satellite.category)!;
  const periodMin = (2 * Math.PI) / satellite.satrec.no;

  return (
    <group ref={group}>
      <Html zIndexRange={[20, 10]} style={{ pointerEvents: pinned ? "auto" : "none" }}>
        <div
          ref={element}
          // Sabitliyken yerinde 3B model var: kart onu örtmesin diye sağa kaçar
          className={`${pinned ? (satellite.category === "station" ? "ml-24" : "ml-16") : "ml-3"} w-60 -translate-y-1/2 rounded-xl border border-white/10 bg-slate-900/90 p-3 text-white shadow-xl backdrop-blur select-none`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{satellite.name}</p>
            {pinned && (
              <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Kapat">
                ✕
              </button>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />
            {category.label} · NORAD {satellite.norad}
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-slate-400">Yükseklik</dt>
              <dd className="font-medium tabular-nums">
                <span ref={altitude} /> km
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Hız</dt>
              <dd className="font-medium tabular-nums">
                <span ref={speed} /> km/sa
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Tur</dt>
              <dd className="font-medium tabular-nums">
                {periodMin < 120 ? `${Math.round(periodMin)} dk` : `${(periodMin / 60).toFixed(1)} sa`}
              </dd>
            </div>
          </dl>
          {pinned ? (
            <a
              href={`https://www.n2yo.com/satellite/?s=${satellite.norad}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-sky-300 hover:underline"
            >
              N2YO'da canlı takip ↗
            </a>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">Sabitlemek için tıkla · Esc kapatır</p>
          )}
        </div>
      </Html>
    </group>
  );
};

// Bir tam tur, atalet çerçevesinde (yıldızlara göre sabit halka). Dünya
// döndükçe sahnede ters yönde çevrilir: rotation.y = -gmst
const OrbitPath = ({ swarm, satellite }: { swarm: Swarm; satellite: Satellite }) => {
  const group = useRef<Group>(null);

  const points = useMemo(() => {
    const period = (2 * Math.PI) / satellite.satrec.no; // dakika
    const start = swarm.nowMs();
    const out: [number, number, number][] = [];
    for (let k = 0; k <= 180; k++) {
      const pv = propagate(satellite.satrec, new Date(start + (k / 180) * period * 60_000));
      if (!pv) continue;
      const { x, y, z } = pv.position;
      out.push([x / EARTH_RADIUS_KM, z / EARTH_RADIUS_KM, -y / EARTH_RADIUS_KM]);
    }
    return out;
  }, [satellite, swarm]);

  useFrame(() => {
    if (group.current) group.current.rotation.y = -swarm.gmst();
  });

  const color = SAT_CATEGORIES.find((c) => c.id === satellite.category)!.color;
  if (points.length < 2) return null;
  return (
    <group ref={group}>
      <Line points={points} color={color} lineWidth={1.5} transparent opacity={0.7} />
    </group>
  );
};

export default SatelliteLayer;
