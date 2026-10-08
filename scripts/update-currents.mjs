// Okyanus yüzey akıntıları: Open-Meteo Marine'dan kaba bir ızgarada örneklenir.
// Çıktı rüzgarla aynı biçimde: public/data/currents.{png,json}
// R = u, G = v, B = 255 deniz / 0 kara (veri yok)
//
// Ücretsiz kota: dakikada 600, saatte 5.000, günde 10.000 nokta. Kara noktaları
// atlanınca 4° ızgara ~2.400 nokta tutar; istekler bir dakika arayla gider (~4 dk).
// Akıntılar yavaş değiştiği için veri 12 saatten yeniyse indirme atlanır (--force ile zorla).
import fs from "node:fs/promises";
import { PNG } from "pngjs";

const OUT_DIR = "public/data";
const STEP = 4; // derece
const MAX_LAT = 78; // daha kuzey/güney neredeyse tamamen buz ve kara
const BATCH = 500; // URL uzunluğu sınırı
const WAIT_MS = 61_000;
const MAX_AGE_HOURS = 12;

const WIDTH = 360 / STEP;
const HEIGHT = 180 / STEP;

const force = process.argv.includes("--force");
if (!force) {
  try {
    const previous = JSON.parse(await fs.readFile(`${OUT_DIR}/currents.json`, "utf8"));
    const ageHours = (Date.now() - new Date(`${previous.date}Z`).getTime()) / 3600_000;
    if (ageHours < MAX_AGE_HOURS) {
      console.log(
        `Akıntı verisi ${ageHours.toFixed(1)} saatlik (${previous.date} UTC), güncel sayılır. ` +
          "Yine de indirmek için: npm run update-currents -- --force"
      );
      process.exit(0);
    }
  } catch {
    // Önceki veri yok ya da okunamadı: indir
  }
}

// Kara noktaları için istek harcama: ülke sınırlarının içindeki noktaları atla
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const geo = JSON.parse(await fs.readFile(`${OUT_DIR}/geo.json`, "utf8"));
const polygons = geo.features.flatMap((f) =>
  f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates
);
const isLand = (lat, lon) =>
  polygons.some(
    (p) => inRing(lon, lat, p[0]) && !p.slice(1).some((hole) => inRing(lon, lat, hole))
  );

// Örnekler piksel merkezlerinde, böylece GPU'daki lineer örneklemeyle hizalı
const points = [];
for (let y = 0; y < HEIGHT; y++) {
  const lat = 90 - STEP * y - STEP / 2;
  if (Math.abs(lat) > MAX_LAT) continue;
  for (let x = 0; x < WIDTH; x++) {
    const lon = -180 + STEP * x + STEP / 2;
    if (!isLand(lat, lon)) points.push({ x, y, lat, lon });
  }
}

// Kota dolunca yığın izi değil, sade bir mesaj gösterilsin diye ayrı tür
class QuotaError extends Error {}

async function fetchBatch(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();

    const body = await res.text();
    // Dakika sınırı birkaç saniyede açılır; saat/gün sınırını beklemek anlamsız
    if (res.status === 429 && /minutely/i.test(body) && attempt < 3) {
      console.log("  Dakika sınırı, 60 sn bekleniyor…");
      await new Promise((r) => setTimeout(r, WAIT_MS));
      continue;
    }
    if (res.status === 429) {
      const period = /daily/i.test(body) ? "günlük" : "saatlik";
      throw new QuotaError(
        `Open-Meteo ${period} kotası doldu. Mevcut akıntı verisi korunuyor; ` +
          `${period === "günlük" ? "yarın" : "bir saat sonra"} tekrar deneyin.`
      );
    }
    throw new Error(`İstek başarısız (${res.status}): ${body}`);
  }
}

const u = new Float32Array(WIDTH * HEIGHT);
const v = new Float32Array(WIDTH * HEIGHT);
const ocean = new Uint8Array(WIDTH * HEIGHT);

const batches = Math.ceil(points.length / BATCH);
console.log(`${points.length} deniz noktası, ${batches} istek (~${batches} dakika)`);

let date = null;
for (let b = 0; b < batches; b++) {
  if (b > 0) await new Promise((r) => setTimeout(r, WAIT_MS));

  const batch = points.slice(b * BATCH, (b + 1) * BATCH);
  const url =
    "https://marine-api.open-meteo.com/v1/marine" +
    `?latitude=${batch.map((p) => p.lat).join(",")}` +
    `&longitude=${batch.map((p) => p.lon).join(",")}` +
    "&current=ocean_current_velocity,ocean_current_direction";
  let results;
  try {
    results = await fetchBatch(url);
  } catch (err) {
    if (!(err instanceof QuotaError)) throw err;
    console.error(err.message);
    process.exit(1);
  }

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
