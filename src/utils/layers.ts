import { useEffect, useState } from "react";
import {
  Color,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  RedFormat,
  RGBAFormat,
} from "three";

export type FieldLayerId = "temperature" | "precipitation" | "clouds" | "humidity";
export type FillLayerId = FieldLayerId | "satellite" | "none";

export type LayerSpec = {
  min: number;
  max: number;
  unit: string;
  // linear16: R = yüksek, G = düşük bayt (basınç; 8 bit çizgilerde basamak yapar)
  encoding: "linear" | "sqrt" | "linear16";
};

export type LayersMeta = {
  source: string;
  date: string;
  width: number;
  height: number;
  layers: Record<FieldLayerId | "pressure", LayerSpec>;
};

export type PressureCenter = {
  type: "H" | "L";
  lat: number;
  lon: number;
  value: number;
};

// PNG'deki 0..1 değerini gerçek değere çevirir (scripts/update-weather.mjs'in tersi)
export function decode(spec: LayerSpec, t: number) {
  const k = spec.encoding === "sqrt" ? t * t : t;
  return spec.min + k * (spec.max - spec.min);
}

export function encode(spec: LayerSpec, value: number) {
  const k = Math.min(Math.max((value - spec.min) / (spec.max - spec.min), 0), 1);
  return spec.encoding === "sqrt" ? Math.sqrt(k) : k;
}

type Stop = { value: number; color: string; alpha: number };

type Palette = {
  label: string;
  stops: Stop[];
  ticks: number[]; // lejantta gösterilecek değerler
};

// Sıcaklık: ıraksak (mavi ↔ gri ↔ kırmızı), orta nokta 0 °C.
// Diğerleri tek tonlu sıralı; koyu zeminde büyük değer daha açık ve opak.
export const PALETTES: Record<FieldLayerId, Palette> = {
  temperature: {
    label: "Sıcaklık",
    stops: [
      { value: -40, color: "#1e3a8a", alpha: 0.7 },
      { value: -20, color: "#3b82f6", alpha: 0.65 },
      { value: -5, color: "#93c5fd", alpha: 0.6 },
      { value: 0, color: "#d4d4d4", alpha: 0.55 },
      { value: 10, color: "#fca5a5", alpha: 0.6 },
      { value: 25, color: "#ef4444", alpha: 0.65 },
      { value: 45, color: "#7f1d1d", alpha: 0.75 },
    ],
    ticks: [-40, -20, 0, 20, 45],
  },
  precipitation: {
    label: "Yağış",
    stops: [
      { value: 0, color: "#1d4ed8", alpha: 0 },
      { value: 0.1, color: "#1d4ed8", alpha: 0.3 },
      { value: 1, color: "#3b82f6", alpha: 0.6 },
      { value: 4, color: "#38bdf8", alpha: 0.8 },
      { value: 10, color: "#e0f2fe", alpha: 0.9 },
    ],
    ticks: [0, 0.5, 2, 5, 10],
  },
  clouds: {
    label: "Bulut",
    stops: [
      { value: 0, color: "#ffffff", alpha: 0 },
      { value: 15, color: "#ffffff", alpha: 0 },
      { value: 100, color: "#ffffff", alpha: 0.8 },
    ],
    ticks: [0, 50, 100],
  },
  humidity: {
    label: "Nem",
    stops: [
      { value: 0, color: "#134e4a", alpha: 0.55 },
      { value: 50, color: "#14b8a6", alpha: 0.55 },
      { value: 100, color: "#ccfbf1", alpha: 0.65 },
    ],
    ticks: [0, 25, 50, 75, 100],
  },
};

export function colorAt(stops: Stop[], value: number) {
  const last = stops.length - 1;
  if (value <= stops[0].value) return { color: new Color(stops[0].color), alpha: stops[0].alpha };
  if (value >= stops[last].value) return { color: new Color(stops[last].color), alpha: stops[last].alpha };

  const i = stops.findIndex((s) => s.value > value);
  const a = stops[i - 1];
  const b = stops[i];
  const t = (value - a.value) / (b.value - a.value);
  return {
    color: new Color(a.color).lerp(new Color(b.color), t),
    alpha: a.alpha + (b.alpha - a.alpha) * t,
  };
}

// 256 girdilik renk tablosu: kodlanmış değer -> RGBA (shader tek okumayla renklensin)
export function createLut(id: FieldLayerId, spec: LayerSpec) {
  const size = 256;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const { color, alpha } = colorAt(PALETTES[id].stops, decode(spec, i / (size - 1)));
    data[i * 4] = Math.round(color.r * 255);
    data[i * 4 + 1] = Math.round(color.g * 255);
    data[i * 4 + 2] = Math.round(color.b * 255);
    data[i * 4 + 3] = Math.round(alpha * 255);
  }
  const texture = new DataTexture(data, size, 1, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export function useLayersMeta() {
  const [meta, setMeta] = useState<LayersMeta | null>(null);
  useEffect(() => {
    fetchJson<LayersMeta>("/data/layers/layers.json").then(setMeta).catch(console.error);
  }, []);
  return meta;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Resim yüklenemedi: ${url}`));
    img.src = url;
  });
}

// 16 bitlik katmanı (R/G baytları) 0..1 half-float dokuya çözer.
// Half-float WebGL2'de lineer filtrelenebilir; 1'e yakın adımı ~0,0005.
async function loadLinear16(url: string) {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, img.width, img.height).data;

  // Resim satır 0 = kuzey; TextureLoader'daki gibi v = 1 kuzey olsun diye ters çevir
  const data = new Uint16Array(img.width * img.height);
  for (let y = 0; y < img.height; y++) {
    const row = (img.height - 1 - y) * img.width;
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      data[row + x] = DataUtils.toHalfFloat((pixels[i] * 256 + pixels[i + 1]) / 65535);
    }
  }

  const texture = new DataTexture(data, img.width, img.height, RedFormat, HalfFloatType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function usePressureTexture(enabled: boolean) {
  const [texture, setTexture] = useState<DataTexture | null>(null);
  useEffect(() => {
    if (!enabled || texture) return;
    let cancelled = false;
    loadLinear16("/data/layers/pressure.png")
      .then((t) => (cancelled ? t.dispose() : setTexture(t)))
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [enabled, texture]);
  return texture;
}

export function usePressureCenters(enabled: boolean) {
  const [centers, setCenters] = useState<PressureCenter[] | null>(null);
  useEffect(() => {
    if (!enabled || centers) return;
    fetchJson<PressureCenter[]>("/data/layers/pressure-centers.json")
      .then(setCenters)
      .catch(console.error);
  }, [enabled, centers]);
  return centers;
}

// NASA GIBS'te o günün mozaiği gün boyunca dolar; dün tamamdır
export function satelliteDate() {
  return new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10);
}

export function satelliteUrl(date: string) {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180",
    WIDTH: "4096",
    HEIGHT: "2048",
    FORMAT: "image/jpeg",
    TIME: date,
  });
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params}`;
}
