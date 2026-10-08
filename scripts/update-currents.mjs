// Okyanus yüzey akıntıları: Open-Meteo Marine'dan kaba bir ızgarada örneklenir.
// Çıktı rüzgarla aynı biçimde: public/data/currents.{png,json}
// R = u, G = v, B = 255 deniz / 0 kara (veri yok)
//
// Ücretsiz kota günde 10.000, dakikada 600 nokta; 4° ızgara ~3.600 nokta
// tutar ve istekler bir dakika arayla gönderilir (~7 dakika).
import fs from "node:fs/promises";
import { PNG } from "pngjs";

const OUT_DIR = "public/data";
const STEP = 4; // derece
const MAX_LAT = 78; // daha kuzey/güney neredeyse tamamen buz ve kara
const BATCH = 500; // URL uzunluğu sınırı
const WAIT_MS = 61_000;

const WIDTH = 360 / STEP;
const HEIGHT = 180 / STEP;

// Örnekler piksel merkezlerinde, böylece GPU'daki lineer örneklemeyle hizalı
const points = [];
for (let y = 0; y < HEIGHT; y++) {
  const lat = 90 - STEP * y - STEP / 2;
  if (Math.abs(lat) > MAX_LAT) continue;
  for (let x = 0; x < WIDTH; x++) {
    points.push({ x, y, lat, lon: -180 + STEP * x + STEP / 2 });
  }
}

const u = new Float32Array(WIDTH * HEIGHT);
const v = new Float32Array(WIDTH * HEIGHT);
const ocean = new Uint8Array(WIDTH * HEIGHT);

const batches = Math.ceil(points.length / BATCH);
console.log(`${points.length} nokta, ${batches} istek (~${batches} dakika)`);

let date = null;
for (let b = 0; b < batches; b++) {
  if (b > 0) await new Promise((r) => setTimeout(r, WAIT_MS));

  const batch = points.slice(b * BATCH, (b + 1) * BATCH);
  const url =
    "https://marine-api.open-meteo.com/v1/marine" +
    `?latitude=${batch.map((p) => p.lat).join(",")}` +
    `&longitude=${batch.map((p) => p.lon).join(",")}` +
    "&current=ocean_current_velocity,ocean_current_direction";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`İstek başarısız (${res.status}): ${await res.text()}`);
  const results = await res.json();

  results.forEach((r, i) => {
    const { x, y } = batch[i];
    const speed = r.current.ocean_current_velocity;
    const dir = r.current.ocean_current_direction;
    date ??= r.current.time;
    if (speed == null || dir == null) return;
    // Akıntı yönü akışın gittiği yöndür (rüzgarın tersine)
    const ms = speed / 3.6;
    const rad = (dir * Math.PI) / 180;
    u[y * WIDTH + x] = ms * Math.sin(rad);
    v[y * WIDTH + x] = ms * Math.cos(rad);
    ocean[y * WIDTH + x] = 255;
  });
  console.log(`  ${b + 1}/${batches} tamam`);
}

let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
for (let i = 0; i < u.length; i++) {
  if (!ocean[i]) continue;
  uMin = Math.min(uMin, u[i]);
  uMax = Math.max(uMax, u[i]);
  vMin = Math.min(vMin, v[i]);
  vMax = Math.max(vMax, v[i]);
}

const png = new PNG({ width: WIDTH, height: HEIGHT });
for (let i = 0; i < u.length; i++) {
  png.data[i * 4] = Math.round((255 * (u[i] - uMin)) / (uMax - uMin));
  png.data[i * 4 + 1] = Math.round((255 * (v[i] - vMin)) / (vMax - vMin));
  png.data[i * 4 + 2] = ocean[i];
  png.data[i * 4 + 3] = 255;
}

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(`${OUT_DIR}/currents.png`, PNG.sync.write(png));
await fs.writeFile(
  `${OUT_DIR}/currents.json`,
  JSON.stringify(
    { source: "Open-Meteo Marine", date, width: WIDTH, height: HEIGHT, uMin, uMax, vMin, vMax, masked: true },
    null,
    2
  )
);

console.log(`Bitti! u: ${uMin.toFixed(2)}…${uMax.toFixed(2)}, v: ${vMin.toFixed(2)}…${vMax.toFixed(2)} m/s`);
