import fs from "node:fs/promises";
import { PNG } from "pngjs";

const WIDTH = 360;
const HEIGHT = 180;
const OUT_DIR = "public/data";

const now = new Date().toISOString().slice(0, 13) + ":00:00Z";
const dims = `[(${now})][(90):2:(-90)][(0):2:(359.5)]`;
const query = `ugrd10m${dims},vgrd10m${dims}`;
const url =
  "https://coastwatch.pfeg.noaa.gov/erddap/griddap/NCEP_Global_Best.json?" +
  encodeURIComponent(query);

console.log("İndiriliyor...");
const res = await fetch(url);
if (!res.ok) {
  throw new Error(`İndirme başarısız (${res.status}): ${await res.text()}`);
}
const json = await res.json();
const rows = json.table.rows;
const date = rows[0][0];
console.log(`Veri zamanı: ${date}, satır sayısı: ${rows.length}`);

const u = new Float32Array(WIDTH * HEIGHT);
const v = new Float32Array(WIDTH * HEIGHT);

for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const srcLon = (x + 180) % 360;
    const row = rows[y * 360 + srcLon];
    u[y * WIDTH + x] = row[3] ?? 0;
    v[y * WIDTH + x] = row[4] ?? 0;
  }
}

const uMin = Math.min(...u);
const uMax = Math.max(...u);
const vMin = Math.min(...v);
const vMax = Math.max(...v);

const png = new PNG({ width: WIDTH, height: HEIGHT });
for (let i = 0; i < WIDTH * HEIGHT; i++) {
  png.data[i * 4] = Math.round((255 * (u[i] - uMin)) / (uMax - uMin));
  png.data[i * 4 + 1] = Math.round((255 * (v[i] - vMin)) / (vMax - vMin));
  png.data[i * 4 + 2] = 0;
  png.data[i * 4 + 3] = 255;
}

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(`${OUT_DIR}/wind.png`, PNG.sync.write(png));
await fs.writeFile(
  `${OUT_DIR}/wind.json`,
  JSON.stringify(
    { source: "NOAA GFS via ERDDAP", date, width: WIDTH, height: HEIGHT, uMin, uMax, vMin, vMax },
    null,
    2
  )
);

console.log(`Bitti! u: ${uMin.toFixed(1)}…${uMax.toFixed(1)}, v: ${vMin.toFixed(1)}…${vMax.toFixed(1)}`);