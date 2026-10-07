import { useEffect, useState } from "react";

export type WindMeta = {
  date: string;
  width: number;
  height: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
};

export type WindField = {
  meta: WindMeta;
  getWind: (lat: number, lon: number) => { u: number; v: number };
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Resim yüklenemedi: ${url}`));
    img.src = url;
  });
}

export async function loadWind(): Promise<WindField> {
  const meta: WindMeta = await fetch("/data/wind.json").then((r) => r.json());
  const img = await loadImage("/data/wind.png");

  const canvas = document.createElement("canvas");
  canvas.width = meta.width;
  canvas.height = meta.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, meta.width, meta.height).data;

  function getWind(lat: number, lon: number) {
    const lonNorm = (((lon + 180) % 360) + 360) % 360;
    const x = Math.floor((lonNorm / 360) * meta.width) % meta.width;
    const y = Math.min(
      meta.height - 1,
      Math.max(0, Math.floor(((90 - lat) / 180) * meta.height))
    );

    const i = (y * meta.width + x) * 4;
    const u = meta.uMin + (pixels[i] / 255) * (meta.uMax - meta.uMin);
    const v = meta.vMin + (pixels[i + 1] / 255) * (meta.vMax - meta.vMin);
    return { u, v };
  }

  return { meta, getWind };
}

export function useWind() {
  const [wind, setWind] = useState<WindField | null>(null);

  useEffect(() => {
    loadWind().then(setWind).catch(console.error);
  }, []);

  return wind;
}