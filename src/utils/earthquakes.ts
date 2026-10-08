import { useEffect, useState } from "react";

export type Quake = {
  id: string;
  mag: number;
  place: string;
  time: number; // ms
  depth: number; // km
  lat: number;
  lon: number;
  url: string;
  tsunami: boolean;
};

type Feed = {
  metadata: { generated: number };
  features: {
    id: string;
    properties: {
      mag: number | null;
      place: string | null;
      time: number;
      url: string;
      tsunami: number;
    };
    geometry: { coordinates: [number, number, number] };
  }[];
};

// M2.5+ dünya genelinde tutarlı; daha küçükler sadece yoğun sensörlü
// bölgelerde (Kaliforniya, Alaska) ölçülür ve haritayı yanıltıcı kalabalıklaştırır
const FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";
const REFRESH_MS = 5 * 60_000;

async function fetchQuakes() {
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`USGS ${res.status}`);
  const feed: Feed = await res.json();

  const quakes = feed.features
    .filter((f) => f.properties.mag !== null)
    .map(
      (f): Quake => ({
        id: f.id,
        mag: f.properties.mag!,
        place: f.properties.place ?? "Bilinmeyen konum",
        time: f.properties.time,
        depth: f.geometry.coordinates[2],
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        url: f.properties.url,
        tsunami: f.properties.tsunami === 1,
      })
    )
    // Büyükler en son çizilsin, küçüklerin üstünde kalsın
    .sort((a, b) => a.mag - b.mag);

  return { quakes, updated: feed.metadata.generated };
}

export type QuakeFeed = Awaited<ReturnType<typeof fetchQuakes>>;

// Açıkken 5 dakikada bir yenilenir (USGS akışı dakikada bir güncellenir)
export function useEarthquakes(enabled: boolean) {
  const [feed, setFeed] = useState<QuakeFeed | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () =>
      fetchQuakes()
        .then((f) => !cancelled && setFeed(f))
        .catch(console.error);

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  return feed;
}

// Rehberdeki sabit durum renkleri; anlam hep etiketle birlikte verilir
export const QUAKE_CLASSES = [
  { min: 6, label: "M6+ güçlü", color: "#d03b3b" },
  { min: 4, label: "M4–6 orta", color: "#ec835a" },
  { min: 0, label: "M2.5–4 hafif", color: "#fab219" },
] as const;

export function quakeClass(mag: number) {
  return QUAKE_CLASSES.find((c) => mag >= c.min)!;
}

const RELATIVE = new Intl.RelativeTimeFormat("tr", { numeric: "auto" });

export function timeAgo(time: number, now = Date.now()) {
  const minutes = Math.round((time - now) / 60_000);
  if (minutes > -60) return RELATIVE.format(minutes, "minute");
  return RELATIVE.format(Math.round(minutes / 60), "hour");
}
