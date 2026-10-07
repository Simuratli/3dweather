import { useEffect, useState } from "react";

type Ring = number[][];
type Polygon = Ring[];

type Geometry =
  | { type: "Polygon"; coordinates: Polygon }
  | { type: "MultiPolygon"; coordinates: Polygon[] };

export type CountryFeature = {
  properties: { NAME: string; NAME_TR: string };
  geometry: Geometry;
};

function pointInRing(lon: number, lat: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon: number, lat: number, polygon: Polygon) {
  if (!pointInRing(lon, lat, polygon[0])) return false;
  for (let k = 1; k < polygon.length; k++) {
    if (pointInRing(lon, lat, polygon[k])) return false;
  }
  return true;
}

export function findCountry(
  countries: CountryFeature[],
  lat: number,
  lon: number
): CountryFeature | null {
  for (const country of countries) {
    for (const polygon of polygonsOf(country.geometry)) {
      if (pointInPolygon(lon, lat, polygon)) return country;
    }
  }
  return null;
}

export function useCountries() {
  const [countries, setCountries] = useState<CountryFeature[] | null>(null);

  useEffect(() => {
    fetch("/data/geo.json")
      .then((r) => r.json())
      .then((data) => setCountries(data.features))
      .catch(console.error);
  }, []);

  return countries;
}


function polygonsOf(geometry: Geometry): Polygon[] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

export function ringsOf(geometry: Geometry): Ring[] {
  return polygonsOf(geometry).flat();
}

export function countryName(country: CountryFeature) {
  return country.properties.NAME_TR || country.properties.NAME;
}