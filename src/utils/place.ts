import { useEffect, useState } from "react";

export type Place = {
  city: string | null;
  region: string | null;
  water: string | null;
};

type ReverseGeocodeResponse = {
  city: string;
  locality: string;
  principalSubdivision: string;
  countryName: string;
};

async function fetchPlace(
  lat: number,
  lon: number,
  signal: AbortSignal
): Promise<Place> {
  const url =
    "https://api.bigdatacloud.net/data/reverse-geocode-client" +
    `?latitude=${lat}&longitude=${lon}&localityLanguage=tr`;
  const data: ReverseGeocodeResponse = await fetch(url, { signal }).then((r) =>
    r.json()
  );

  // Denizde ülke boş gelir, locality ise denizin adıdır (ör. "Hazar Denizi")
  if (!data.countryName) {
    return { city: null, region: null, water: data.locality || null };
  }

  const city = data.city || data.locality || null;
  const region =
    data.principalSubdivision && data.principalSubdivision !== city
      ? data.principalSubdivision
      : null;
  return { city, region, water: null };
}

type Result = { key: string; place: Place | null };

export function usePlace(lat: number | null, lon: number | null) {
  const key = lat === null || lon === null ? null : `${lat},${lon}`;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (lat === null || lon === null) return;

    const controller = new AbortController();
    const requestKey = `${lat},${lon}`;

    fetchPlace(lat, lon, controller.signal)
      .then((place) => setResult({ key: requestKey, place }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error(err);
        setResult({ key: requestKey, place: null });
      });

    return () => controller.abort();
  }, [lat, lon]);

  // Sonuç başka bir noktaya aitse hâlâ yükleniyor demektir
  const done = result !== null && result.key === key;
  return {
    place: done ? result.place : null,
    loading: key !== null && !done,
  };
}
