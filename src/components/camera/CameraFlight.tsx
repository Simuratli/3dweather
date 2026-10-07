import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";
import { latLonToVector3 } from "../../utils/geo";

const END_DISTANCE = 2.2; // varışta kameranın merkeze uzaklığı
const MAX_LIFT = 1.6; // dünyanın öbür ucuna uçarken yolun ortasında yükseliş
const MIN_DURATION = 1.2;
const MAX_EXTRA_DURATION = 1.8;

export type FlightTarget = { lat: number; lon: number; id: number };

type Flight = {
  fromDir: Vector3;
  rotation: Quaternion;
  startDistance: number;
  lift: number;
  duration: number;
  t: number;
};

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const IDENTITY = new Quaternion();
const step = new Quaternion();
const dir = new Vector3();

type Props = {
  target: FlightTarget | null;
  onDone: () => void;
};

// Kamerayı büyük çember boyunca, ortada yükselen bir yayla hedefe uçurur.
// Uçuş sırasında OrbitControls kapalı olmalı, yoksa kamerayı geri çeker.
const CameraFlight = ({ target, onDone }: Props) => {
  const camera = useThree((s) => s.camera);
  const flight = useRef<Flight | null>(null);

  useEffect(() => {
    if (!target) return;

    const fromDir = camera.position.clone().normalize();
    const toDir = latLonToVector3(target.lat, target.lon).normalize();
    const share = fromDir.angleTo(toDir) / Math.PI; // 0 = aynı yer, 1 = öbür uç

    flight.current = {
      fromDir,
      rotation: new Quaternion().setFromUnitVectors(fromDir, toDir),
      startDistance: camera.position.length(),
      lift: share * MAX_LIFT,
      duration: MIN_DURATION + share * MAX_EXTRA_DURATION,
      t: 0,
    };
  }, [target, camera]);

  useFrame((_, delta) => {
    const current = flight.current;
    if (!current) return;

    current.t = Math.min(current.t + delta / current.duration, 1);
    const e = easeInOutCubic(current.t);

    step.slerpQuaternions(IDENTITY, current.rotation, e);
    dir.copy(current.fromDir).applyQuaternion(step);

    const distance =
      current.startDistance +
      (END_DISTANCE - current.startDistance) * e +
      current.lift * Math.sin(Math.PI * e);

    camera.position.copy(dir).multiplyScalar(distance);
    camera.lookAt(0, 0, 0);

    if (current.t >= 1) {
      flight.current = null;
      onDone();
    }
  });

  return null;
};

export default CameraFlight;
