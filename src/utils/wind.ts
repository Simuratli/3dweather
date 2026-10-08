import { useEffect, useState } from "react";

export type WindMeta = {
  date: string;
  width: number;
  height: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  // true ise B kanalı veri maskesi: 255 = veri var, 0 = yok (ör. akıntıda kara)
  masked?: boolean;
};

// Rüzgar ve okyanus akıntısı aynı biçimdeki vektör alanlarıdır
export type WindField = {
  meta: WindMeta;
  // RGBA, satır 0 = 90° K; R = u, G = v (uMin..uMax / vMin..vMax aralığına ölçekli)
  pixels: Uint8ClampedArray;
  getWind: (lat: number, lon: number) => { u: number; v: number; valid: boolean };
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Resim yüklenemedi: ${url}`));
    img.src = url;
  });
}

export async function loadWind(name = "wind"): Promise<WindField> {
  const meta: WindMeta = await fetch(`/data/${name}.json`).then((r) => r.json());
  const img = await loadImage(`/data/${name}.png`);

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
    const valid = !meta.masked || pixels[i + 2] >= 128;
    return { u, v, valid };
  }

  return { meta, pixels, getWind };
}

// enabled false iken indirilmez; ilk açılışta bir kez yüklenir
export function useWind(name = "wind", enabled = true) {
  const [field, setField] = useState<WindField | null>(null);

  useEffect(() => {
    if (!enabled || field) return;
    let cancelled = false;
    loadWind(name)
      .then((f) => !cancelled && setField(f))
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [name, enabled, field]);

  return field;
}