import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BackSide,
  Color,
  FrontSide,
  Vector3,
} from "three";
import { getSubsolarPoint, latLonToVector3 } from "../../utils/geo";

const HALO_SCALE = 1.06;

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// Güneşe göre aydınlanma ve gün batımı tonu, iki katmanda ortak
const lightingGlsl = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uDayColor;
  uniform vec3 uTwilightColor;

  // rgb = renk, a = aydınlanma (gece tarafı tamamen kaybolmasın diye tabanlı)
  vec4 atmosphereLight(vec3 n) {
    float sun = dot(n, normalize(uSunDir));
    float light = smoothstep(-0.25, 0.45, sun);
    float twilight = smoothstep(-0.3, 0.0, sun) * (1.0 - smoothstep(0.0, 0.35, sun));
    vec3 color = mix(uDayColor, uTwilightColor, twilight * 0.7);
    return vec4(color, 0.06 + 0.94 * light);
  }
`;

// Dış halo: gezegenin kenarında en yoğun, uzaya doğru hızla söner
const haloFragment = /* glsl */ `
  ${lightingGlsl}
  uniform float uLimb; // gezegen kenarındaki -dot(n, v) değeri
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(cameraPosition - vWorldPos);
    float t = clamp(-dot(n, v) / uLimb, 0.0, 1.0);
    float density = pow(t, 3.0);

    vec4 l = atmosphereLight(n);
    gl_FragColor = vec4(l.rgb, density * l.a * uIntensity);
  }
`;

// İç pus: aydınlık kenarda karaları hafifçe örten ince katman
const hazeFragment = /* glsl */ `
  ${lightingGlsl}
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);

    vec4 l = atmosphereLight(n);
    gl_FragColor = vec4(l.rgb, fresnel * l.a * uIntensity);
  }
`;

const Atmosphere = () => {
  const { halo, haze } = useMemo(() => {
    const shared = {
      uSunDir: { value: new Vector3(1, 0, 0) },
      uDayColor: { value: new Color("#5cb4ff") },
      uTwilightColor: { value: new Color("#ff8a4c") },
    };
    return {
      halo: {
        ...shared,
        // Uzaktan bakışta gezegen kenarı, kabuğun bu açısına denk gelir
        uLimb: { value: Math.sqrt(1 - 1 / (HALO_SCALE * HALO_SCALE)) },
        uIntensity: { value: 1.1 },
      },
      haze: {
        ...shared,
        uIntensity: { value: 0.45 },
      },
    };
  }, []);

  useFrame(() => {
    const sun = getSubsolarPoint(new Date());
    halo.uSunDir.value.copy(latLonToVector3(sun.lat, sun.lon));
  });

  return (
    <>
      <mesh scale={HALO_SCALE}>
        <sphereGeometry args={[1, 96, 96]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={haloFragment}
          uniforms={halo}
          transparent
          side={BackSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh scale={1.001}>
        <sphereGeometry args={[1, 96, 96]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={hazeFragment}
          uniforms={haze}
          transparent
          side={FrontSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  );
};

export default Atmosphere;
