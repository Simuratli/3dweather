import { useEffect, useState } from "react";

export type City = {
  id: number;
  name: string;
  region: string | null;
  country: string | null;
  lat: number;
  lon: number;
};

type GeocodeResponse = {
  results?: {
    id: number;
    name: string;
    admin1?: string;
    country?: string;
    latitude: number;
    longitude: number;
  }[];
};

const MIN_LENGTH = 2;
const DEBOUNCE_MS = 300;

async function searchCities(query: string, signal: AbortSignal) {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search" +
    `?name=${encodeURIComponent(query)}&count=6&language=tr`;
  const data: GeocodeResponse = await fetch(url, { signal }).then((r) =>
    r.json()
  );

  return (data.results ?? []).map(
    (r): City => ({
      id: r.id,
      name: r.name,
      region: r.admin1 && r.admin1 !== r.name ? r.admin1 : null,
      country: r.country ?? null,
      lat: r.latitude,
      lon: r.longitude,
    })
  );
}

type Result = { query: string; cities: City[] };

export function useCitySearch(input: string) {
  const query = input.trim();
  const active = query.length >= MIN_LENGTH;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!active) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchCities(query, controller.signal)
        .then((cities) => setResult({ query, cities }))
        .catch((err) => {
          if (err.name === "AbortError") return;
          console.error(err);
          setResult({ query, cities: [] });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, active]);

  // Sonuç eski bir sorguya aitse hâlâ aranıyor demektir. Yazarken liste
  // titremesin diye yeni sonuç gelene kadar eskisi gösterilir.
  const done = result !== null && result.query === query;
  return {
    cities: active ? (result?.cities ?? []) : [],
    loading: active && !done,
  };
}
