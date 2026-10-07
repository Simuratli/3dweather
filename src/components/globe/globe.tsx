import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { Vector3, type Group } from "three";
import { getSubsolarPoint, latLonToVector3, vector3ToLatLon } from "../../utils/geo";
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vUv).rgb * 1.5;

    float light = dot(normalize(vNormal), normalize(uSunDir));
    float dayAmount = smoothstep(-0.15, 0.15, light);

    vec3 color = mix(night, day, dayAmount);
    gl_FragColor = vec4(color, 1.0);
  }
`;
type Props = {
  onPick?: (lat: number, lon: number) => void;
};

const Globe = ({ onPick }: Props) => {
  const ref = useRef<Group>(null);

  const [dayMap, nightMap] = useTexture([
    "/textures/earth.jpg",
    "/textures/earth-night.jpg",
  ]);

  const uniforms = useMemo(
    () => ({
      uDay: { value: dayMap },
      uNight: { value: nightMap },
      uSunDir: { value: new Vector3(1, 0.3, 0.5) },
    }),
    [dayMap, nightMap]
  );

  useFrame(() => {
  const sun = getSubsolarPoint(new Date());
  uniforms.uSunDir.value.copy(latLonToVector3(sun.lat, sun.lon));
});

  return (
    <group ref={ref}>
      <mesh onClick={(e) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    const { lat, lon } = vector3ToLatLon(e.point);
    onPick?.(lat, lon);
  }}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
        />
      </mesh>
    </group>
  );
};

export default Globe;