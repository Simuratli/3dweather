import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stats } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { latLonToVector3 } from "./utils/geo";
import { useWind } from "./utils/wind";
import {
  Globe,
  Atmosphere,
  WindParticles,
  InfoPanel,
  CountryBorders,
} from "./components";
import {
  useCountries,
  findCountry,
  countryName,
  type CountryFeature,
} from "./utils/countries";
import { usePlace } from "./utils/place";

type Selected = { lat: number; lon: number } | null;

function App() {
  const wind = useWind();
  const countries = useCountries();

  const [selected, setSelected] = useState<Selected>(null);
  // findCountry aynı ülke için aynı nesneyi döndürür, React gereksiz render yapmaz
  const [hovered, setHovered] = useState<CountryFeature | null>(null);

  const country =
    selected && countries
      ? findCountry(countries, selected.lat, selected.lon)
      : null;

  const { place, loading: placeLoading } = usePlace(
    selected?.lat ?? null,
    selected?.lon ?? null
  );

  return (
    <div className="relative h-full">
      <Canvas
        camera={{
          position: latLonToVector3(40.41, 49.87, 3).toArray(),
          fov: 45,
        }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 1, 5]} intensity={1.5} />

        <Suspense fallback={null}>
          <Globe
            onPick={(lat, lon) => setSelected({ lat, lon })}
            onHover={(lat, lon) =>
              countries && setHovered(findCountry(countries, lat, lon))
            }
            onHoverEnd={() => setHovered(null)}
          />
        </Suspense>
        <Atmosphere />
        {countries && (
          <CountryBorders
            countries={countries}
            selected={country}
            hovered={hovered}
          />
        )}
        {wind && <WindParticles wind={wind} />}

        {selected && (
          <mesh position={latLonToVector3(selected.lat, selected.lon, 1.01)}>
            <sphereGeometry args={[0.012, 16, 16]} />
            <meshBasicMaterial color="#ff5a5a" />
          </mesh>
        )}

        <OrbitControls enablePan={false} minDistance={1.3} maxDistance={6} />
        <Stats />

        <EffectComposer>
          <Bloom
            mipmapBlur
            intensity={0.6}
            luminanceThreshold={1.5}
            luminanceSmoothing={0.2}
          />
        </EffectComposer>
      </Canvas>

      {selected && wind && (
        <InfoPanel
          lat={selected.lat}
          lon={selected.lon}
          country={country ? countryName(country) : null}
          place={place}
          placeLoading={placeLoading}
          wind={wind}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default App;
