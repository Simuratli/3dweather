import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { DoubleSide, Matrix4, Vector3, type Group } from "three";
import type { SatCategory } from "../../utils/satellites";
import type { Swarm } from "./swarm";

// Gerçek boyutta görünmez olurdu: kameraya uzaklıkla ölçekle, ekranda sabit kalsın
const SCREEN_SIZE = 0.06;

// Modellerde eksenler: +Z hareket yönü, +Y Dünya'dan dışarı, +X panel açıklığı
const position: [number, number, number] = [0, 0, 0];
const velocity: [number, number, number] = [0, 0, 0];
const up = new Vector3();
const forward = new Vector3();
const right = new Vector3();
const basis = new Matrix4();

// Hafif öz ışık: Dünya'nın gece tarafında da koyu zeminde kaybolmasın
const FOIL = { color: "#d4a017", metalness: 0.8, roughness: 0.35, emissive: "#4a3505" };
const PANEL = { color: "#2a4290", metalness: 0.5, roughness: 0.3, emissive: "#14224a" };
const WHITE = { color: "#e8e8e8", metalness: 0.3, roughness: 0.5, emissive: "#3a3a3a" };
const DARK = { color: "#5a5a5a", metalness: 0.6, roughness: 0.4, emissive: "#1a1a1a" };

// Güneş paneli: ince çerçeve + hücre görünümü için koyu yüzey
const SolarPanel = ({ size, position }: { size: [number, number]; position: [number, number, number] }) => (
  <group position={position}>
    <mesh>
      <boxGeometry args={[size[0], 0.01, size[1]]} />
      <meshStandardMaterial {...PANEL} />
    </mesh>
    <mesh position={[0, 0.006, 0]}>
      <boxGeometry args={[size[0] * 1.02, 0.002, size[1] * 1.04]} />
      <meshStandardMaterial {...DARK} transparent opacity={0.4} />
    </mesh>
  </group>
);

// Klasik uydu: folyo kaplı gövde, iki kanat, Dünya'ya bakan çanak anten
const GenericModel = () => (
  <group>
    <mesh>
      <boxGeometry args={[0.28, 0.28, 0.32]} />
      <meshStandardMaterial {...FOIL} />
    </mesh>
    {/* Kanat kolları */}
    <mesh rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.012, 0.012, 0.5, 8]} />
      <meshStandardMaterial {...DARK} />
    </mesh>
    <SolarPanel size={[0.42, 0.22]} position={[0.42, 0, 0]} />
    <SolarPanel size={[0.42, 0.22]} position={[-0.42, 0, 0]} />
    {/* Çanak anten Dünya'ya (-Y) bakar */}
    <mesh position={[0, -0.2, 0.04]} rotation={[Math.PI, 0, 0]}>
      <cylinderGeometry args={[0.11, 0.02, 0.06, 20, 1, true]} />
      <meshStandardMaterial {...WHITE} side={DoubleSide} />
    </mesh>
    <mesh position={[0, -0.25, 0.04]}>
      <cylinderGeometry args={[0.006, 0.006, 0.08, 6]} />
      <meshStandardMaterial {...DARK} />
    </mesh>
  </group>
);

// Starlink: yassı gövde ve tek uzun panel
const StarlinkModel = () => (
  <group>
    <mesh>
      <boxGeometry args={[0.36, 0.05, 0.22]} />
      <meshStandardMaterial {...WHITE} color="#c9ccd1" />
    </mesh>
    {/* Dünya'ya bakan anten yüzeyleri */}
    <mesh position={[0, -0.03, 0]}>
      <boxGeometry args={[0.32, 0.01, 0.18]} />
      <meshStandardMaterial {...DARK} />
    </mesh>
    <mesh position={[0.2, 0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.008, 0.008, 0.12, 6]} />
      <meshStandardMaterial {...DARK} />
    </mesh>
    <SolarPanel size={[0.9, 0.2]} position={[0.7, 0.12, 0]} />
  </group>
);

// İstasyon: uzun kafes, ortada modüller, iki yanda dörder panel
const StationModel = () => (
  <group>
    {/* Ana kafes (truss) */}
    <mesh>
      <boxGeometry args={[1.6, 0.05, 0.05]} />
      <meshStandardMaterial {...DARK} color="#8a8a8a" />
    </mesh>
    {/* Basınçlı modüller hareket yönünde dizili */}
    {[-0.24, 0, 0.24].map((z) => (
      <mesh key={z} position={[0, -0.06, z]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.22, 16]} />
        <meshStandardMaterial {...WHITE} />
      </mesh>
    ))}
    {[-1, 1].flatMap((side) =>
      [0.55, 0.75].flatMap((x) =>
        [-1, 1].map((dir) => (
          <SolarPanel
            key={`${side}-${x}-${dir}`}
            size={[0.16, 0.42]}
            position={[side * x, 0, dir * 0.24]}
          />
        ))
      )
    )}
    {/* Radyatörler */}
    {[-0.3, 0.3].map((x) => (
      <mesh key={x} position={[x, 0, -0.16]}>
        <boxGeometry args={[0.1, 0.005, 0.22]} />
        <meshStandardMaterial {...WHITE} />
      </mesh>
    ))}
  </group>
);

type Props = {
  swarm: Swarm;
  index: number;
  category: SatCategory;
};

// Seçili uydunun yerinde, gerçek uydular gibi yönlenmiş 3B model:
// altı Dünya'ya, önü hareket yönüne bakar
const SatelliteModel = ({ swarm, index, category }: Props) => {
  const camera = useThree((s) => s.camera);
  const group = useRef<Group>(null);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    swarm.positionOf(index, position);
    swarm.velocityOf(index, velocity);

    g.position.set(...position);
    up.set(...position).normalize();
    // Hız vektörünün radyal bileşenini at: yörüngeye teğet ileri yön
    forward.set(...velocity).addScaledVector(up, -up.dot(forward.set(...velocity))).normalize();
    right.crossVectors(up, forward).normalize();
    basis.makeBasis(right, up, forward);
    g.quaternion.setFromRotationMatrix(basis);

    const size = g.position.distanceTo(camera.position) * SCREEN_SIZE;
    g.scale.setScalar(category === "station" ? size * 1.3 : size);
  });

  return (
    <group ref={group}>
      {category === "station" ? (
        <StationModel />
      ) : category === "starlink" ? (
        <StarlinkModel />
      ) : (
        <GenericModel />
      )}
    </group>
  );
};

export default SatelliteModel;
