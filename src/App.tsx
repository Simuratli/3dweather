import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stats } from "@react-three/drei";
import { Globe, Atmosphere, WindParticles, InfoPanel } from "./components";
import { latLonToVector3 } from "./utils/geo";
import { useWind } from "./utils/wind";
import { useCountries, findCountry } from "./utils/countries";

type Selected = { lat: number; lon: number } | null;

function App() {
  
  const wind = useWind();
  const countries = useCountries();

  const [selected, setSelected] = useState<Selected>(null);

  const country =
    selected && countries
      ? findCountry(countries, selected.lat, selected.lon)
      : null;

  return (
    <div className="relative h-full">
      <Canvas
        camera={{ position: latLonToVector3(40.41, 49.87, 3).toArray(), fov: 45 }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 1, 5]} intensity={1.5} />

        <Suspense fallback={null}>
          <Globe onPick={(lat, lon) => setSelected({ lat, lon })} />
        </Suspense>
        <Atmosphere />
        {wind && <WindParticles wind={wind} />}

        {selected && (
          <mesh position={latLonToVector3(selected.lat, selected.lon, 1.01)}>
            <sphereGeometry args={[0.012, 16, 16]} />
            <meshBasicMaterial color="#ff5a5a" />
          </mesh>
        )}

        <OrbitControls enablePan={false} minDistance={1.3} maxDistance={6} />
        <Stats />
      </Canvas>

      {selected && wind && (
        <InfoPanel
          lat={selected.lat}
          lon={selected.lon}
          country={country}
          wind={wind}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default App;