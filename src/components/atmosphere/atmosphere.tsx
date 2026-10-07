import { useMemo } from "react";
import { BackSide, AdditiveBlending, Color } from "three";

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = `
  uniform vec3 uColor;
  uniform float uPower;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    float d = -dot(vNormal, vViewDir);
    float glow = pow(clamp(d * 2.0, 0.0, 1.0), uPower);
    gl_FragColor = vec4(uColor, glow);
  }
`;

const Atmosphere = () => {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color("#4da6ff") },
      uPower: { value: 1.5 },
    }),
    []
  );

  return (
    <mesh scale={1.15}>
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={BackSide}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
};

export default Atmosphere;