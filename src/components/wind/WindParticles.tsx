import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { WindField } from "../../utils/wind";
import {
  createWindSimulation,
  WIND_STYLE,
  type FlowStyle,
} from "./wind-simulation";

type Props = {
  wind: WindField;
  style?: FlowStyle;
};

// Rüzgar ya da okyanus akıntısı gibi herhangi bir vektör alanını akıtır
const WindParticles = ({ wind, style = WIND_STYLE }: Props) => {
  const gl = useThree((s) => s.gl);
  const sim = useMemo(
    () => createWindSimulation(gl, wind, style),
    [gl, wind, style]
  );

  useEffect(() => {
    console.info(`Parçacıklar: ${sim.count} (${sim.mode})`);
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
