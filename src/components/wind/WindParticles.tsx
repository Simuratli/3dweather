import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { WindField } from "../../utils/wind";
import { createWindSimulation } from "./wind-simulation";

type Props = { wind: WindField };

const WindParticles = ({ wind }: Props) => {
  const gl = useThree((s) => s.gl);
  const sim = useMemo(() => createWindSimulation(gl, wind), [gl, wind]);

  useEffect(() => {
    console.info(`Rüzgar parçacıkları: ${sim.count} (${sim.mode})`);
    return () => sim.dispose();
  }, [sim]);

  useFrame((_, delta) => sim.update(delta));

  return (
    <lineSegments
      geometry={sim.geometry}
      material={sim.material}
      frustumCulled={false}
    />
  );
};

export default WindParticles;
