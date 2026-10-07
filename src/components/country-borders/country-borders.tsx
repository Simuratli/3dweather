import { useMemo } from "react";
import { Color } from "three";
import { Line } from "@react-three/drei";
import { latLonToVector3 } from "../../utils/geo";
import { ringsOf, type CountryFeature } from "../../utils/countries";

type Point = [number, number, number];

// Renkler 1'in üstüne çıkarılıyor (HDR) ki sadece sınırlar bloom eşiğini geçsin
const NEON_GREEN = "#39ff14";
const NEON_GREEN_LIGHT = "#b6ffa8";
// Çarpınca kırmızı kanal 1'de kesilir, diğerleri büyür: mavi payı sıfıra
// yakın olmalı yoksa kırmızı pembeye kayar
const NEON_RED = "#ff0a10";
const BORDER_COLOR = new Color(NEON_GREEN).multiplyScalar(3);
// Açık yeşil çarpılınca çekirdek beyaza yakın, ışıma yeşil olur
const HOVER_COLOR = new Color(NEON_GREEN_LIGHT).multiplyScalar(3);
// Kırmızı yeşilden çok daha koyu algılanır, ışıması için çarpanı yüksek
const SELECTED_COLOR = new Color(NEON_RED).multiplyScalar(13);

function buildSegments(features: CountryFeature[], radius: number): Point[] {
  const points: Point[] = [];

  for (const feature of features) {
    for (const ring of ringsOf(feature.geometry)) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lonA, latA] = ring[i];
        const [lonB, latB] = ring[i + 1];
        points.push(latLonToVector3(latA, lonA, radius).toArray());
        points.push(latLonToVector3(latB, lonB, radius).toArray());
      }
    }
  }

  return points;
}

type Props = {
  countries: CountryFeature[];
  selected: CountryFeature | null;
  hovered: CountryFeature | null;
};

const CountryBorders = ({ countries, selected, hovered }: Props) => {
  const allBorders = useMemo(
    () => new Float32Array(buildSegments(countries, 1.002).flat()),
    [countries]
  );

  const selectedBorder = useMemo(
    () => (selected ? buildSegments([selected], 1.003) : null),
    [selected]
  );

  // Seçili ülkenin üstüne gelince kırmızı kalsın
  const hoverTarget = hovered === selected ? null : hovered;
  const hoveredBorder = useMemo(
    () => (hoverTarget ? buildSegments([hoverTarget], 1.0025) : null),
    [hoverTarget]
  );

  return (
    <>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[allBorders, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color={BORDER_COLOR}
          transparent
          opacity={0.8}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>

      {hoveredBorder && (
        <Line
          points={hoveredBorder}
          segments
          color={HOVER_COLOR}
          lineWidth={3}
          toneMapped={false}
        />
      )}

      {selectedBorder && (
        <Line
          points={selectedBorder}
          segments
          color={SELECTED_COLOR}
          lineWidth={2.5}
          toneMapped={false}
        />
      )}
    </>
  );
};

export default CountryBorders;