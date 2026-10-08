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
  SearchBox,
  CameraFlight,
  type FlightTarget,
  FieldLayer,
  SatelliteClouds,
  Isobars,
  LayerControl,
  Legend,
  type LayerState,
  Earthquakes,
  SatelliteLayer,
} from "./components";
import { useEarthquakes } from "./utils/earthquakes";
import { useSatellites } from "./utils/satellites";
import { CURRENT_STYLE } from "./components/wind/wind-simulation";
import {
  satelliteDate,
  useLayersMeta,
  usePressureCenters,
  usePressureTexture,
} from "./utils/layers";
import {
  useCountries,
  findCountry,
  countryName,
  type CountryFeature,
} from "./utils/countries";
import { usePlace } from "./utils/place";
import { useWeather } from "./utils/weather";

type Selected = { lat: number; lon: number } | null;

function App() {
  const [layers, setLayers] = useState<LayerState>({
    fill: "none",
    wind: true,
    currents: false,
    pressure: false,
    earthquakes: false,
    satellites: false,
  });
  const [satDate] = useState(satelliteDate);

  // Rüzgar bilgi panelinde de kullanıldığı için her zaman yüklenir
  const wind = useWind();
  const currents = useWind("currents", layers.currents);
  const layersMeta = useLayersMeta();
  const pressureCenters = usePressureCenters(layers.pressure);
  const pressureTexture = usePressureTexture(layers.pressure);
  const quakeFeed = useEarthquakes(layers.earthquakes);
  const satellites = useSatellites(layers.satellites);
  const countries = useCountries();

  const [selected, setSelected] = useState<Selected>(null);
  // findCountry aynı ülke için aynı nesneyi döndürür, React gereksiz render yapmaz
  const [hovered, setHovered] = useState<CountryFeature | null>(null);
  // Uçuş sürerken dolu; aynı şehri tekrar seçince de uçsun diye id taşır
  const [flight, setFlight] = useState<FlightTarget | null>(null);

  const country =
    selected && countries
      ? findCountry(countries, selected.lat, selected.lon)
      : null;

  const { place, loading: placeLoading } = usePlace(
    selected?.lat ?? null,
    selected?.lon ?? null
  );
  const { weather, loading: weatherLoading } = useWeather(
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

        {/* Katman verisi gelene kadar diğer sahne beklemesin */}
        <Suspense fallback={null}>
          {layersMeta &&
            layers.fill !== "none" &&
            layers.fill !== "satellite" && (
              <FieldLayer id={layers.fill} meta={layersMeta} />
            )}
          {layers.fill === "satellite" && <SatelliteClouds date={satDate} />}
          {layersMeta && pressureTexture && layers.pressure && (
            <Isobars
              meta={layersMeta}
              data={pressureTexture}
              centers={pressureCenters}
            />
          )}
        </Suspense>

        {countries && (
          <CountryBorders
            countries={countries}
            selected={country}
            hovered={hovered}
          />
        )}
        {wind && layers.wind && <WindParticles wind={wind} />}
        {currents && layers.currents && (
          <WindParticles wind={currents} style={CURRENT_STYLE} />
        )}
        {quakeFeed && layers.earthquakes && (
          <Earthquakes quakes={quakeFeed.quakes} updated={quakeFeed.updated} />
        )}
        {satellites && layers.satellites && (
          <SatelliteLayer satellites={satellites} />
        )}

        {selected && (
          <mesh position={latLonToVector3(selected.lat, selected.lon, 1.01)}>
            <sphereGeometry args={[0.012, 16, 16]} />
            <meshBasicMaterial color="#ff5a5a" />
          </mesh>
        )}

        <OrbitControls
          enabled={!flight}
          enablePan={false}
          minDistance={1.3}
          // Yerdurağan uydular 6,6 Dünya yarıçapında: halkayı görmek için uzaklaşabilsin
          maxDistance={layers.satellites ? 16 : 6}
        />
        <CameraFlight target={flight} onDone={() => setFlight(null)} />
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

      <LayerControl value={layers} onChange={setLayers} />
      <Legend
        fill={layers.fill}
        pressure={layers.pressure}
        meta={layersMeta}
        satelliteDate={satDate}
        quakes={layers.earthquakes ? quakeFeed : null}
        satellites={layers.satellites ? satellites : null}
      />

      <SearchBox
        onSelect={({ lat, lon }) => {
          setSelected({ lat, lon });
          setFlight({ lat, lon, id: Date.now() });
        }}
      />

      {selected && wind && (
        <InfoPanel
          lat={selected.lat}
          lon={selected.lon}
          country={country ? countryName(country) : null}
          place={place}
          placeLoading={placeLoading}
          weather={weather}
          weatherLoading={weatherLoading}
          wind={wind}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default App;
