// NOAA GFS'nin (NOMADS) son tahmininden rüzgar ve renk katmanlarını üretir.
// Çıktılar: public/data/wind.{png,json}, public/data/layers/*.png, layers.json,
// pressure-centers.json
import fs from "node:fs/promises";
import { PNG } from "pngjs";
import { readGrib2 } from "./grib2.mjs";

const OUT_DIR = "public/data";
const LAYER_DIR = `${OUT_DIR}/layers`;
const FORECAST_HOUR = "003"; // f000'da yağış yok, 3 saatlik tahmin en tazesi

// Katman başına sabit aralık: lejant tutarlı kalsın, günden güne kaymasın
const LAYERS = {
  temperature: { min: -40, max: 45, unit: "°C", encoding: "linear" },
  humidity: { min: 0, max: 100, unit: "%", encoding: "linear" },
  clouds: { min: 0, max: 100, unit: "%", encoding: "linear" },
  // Hafif yağışlar da seçilsin diye karekök ölçek
  precipitation: { min: 0, max: 10, unit: "mm/sa", encoding: "sqrt" },
  // Eş basınç çizgileri için 8 bit (0,4 hPa adım) basamak yapar: R = yüksek, G = düşük bayt
  pressure: { min: 950, max: 1050, unit: "hPa", encoding: "linear16" },
};

function cycleCandidates() {
  // GFS koşuları 00/06/12/18 UTC; yayınlanmaları ~4 saat sürer
  const out = [];
  const t = new Date(Date.now() - 4 * 3600_000);
  t.setUTCMinutes(0, 0, 0);
  t.setUTCHours(Math.floor(t.getUTCHours() / 6) * 6);
  for (let i = 0; i < 4; i++) {
    const date = t.toISOString().slice(0, 10).replaceAll("-", "");
    const hour = String(t.getUTCHours()).padStart(2, "0");
    out.push({ date, hour, iso: t.toISOString() });
    t.setUTCHours(t.getUTCHours() - 6);
  }
  return out;
}

function filterUrl({ date, hour }) {
  const params = new URLSearchParams({
    dir: `/gfs.${date}/${hour}/atmos`,
    file: `gfs.t${hour}z.pgrb2.1p00.f${FORECAST_HOUR}`,
  });
  for (const v of ["TMP", "RH", "PRMSL", "TCDC", "PRATE", "UGRD", "VGRD"]) {
    params.set(`var_${v}`, "on");
  }
  for (const l of [
    "2_m_above_ground",
    "10_m_above_ground",
    "mean_sea_level",
    "entire_atmosphere",
    "surface",
  ]) {
    params.set(`lev_${l}`, "on");
  }
  return `https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl?${params}`;
}

async function downloadLatest() {
  for (const cycle of cycleCandidates()) {
    console.log(`Deneniyor: ${cycle.date} ${cycle.hour}Z`);
    const res = await fetch(filterUrl(cycle));
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    // Yayınlanmamış koşu için NOMADS GRIB yerine HTML hata sayfası döner
    if (buf.toString("ascii", 0, 4) === "GRIB") return { cycle, buf };
  }
  throw new Error("Son 24 saatte yayınlanmış GFS koşusu bulunamadı");
}

// Ürün şablonu tercih sırasıyla: 0 = anlık, 8 = zaman ortalaması
function pick(messages, { category, number, surface, value, templates = [0, 8] }) {
  for (const template of templates) {
    const m = messages.find(
      (m) =>
        m.discipline === 0 &&
        m.category === category &&
        m.number === number &&
        m.surface === surface &&
        (value === undefined || m.surfaceValue === value) &&
        m.template === template
    );
    if (m) return m;
  }
  throw new Error(`Alan bulunamadı: ${category}/${number}/${surface}`);
}

// GFS: satır 0 = 90° K, sütun 0 = 0° boylam. Çıktı: sütun 0 = -180°.
function toGrid(msg) {
  const { nx, ny, values, la1, scan } = msg;
  if (nx !== 360 || ny !== 181 || la1 !== 90 || scan !== 0) {
    throw new Error(`Beklenmeyen ızgara: ${nx}x${ny} la1=${la1} scan=${scan}`);
  }
  const out = new Float32Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      out[y * nx + x] = values[y * nx + ((x + 180) % 360)];
    }
  }
  return out;
}

function normalize({ min, max, encoding }, value) {
  const t = Math.min(Math.max((value - min) / (max - min), 0), 1);
  return encoding === "sqrt" ? Math.sqrt(t) : t;
}

async function writeLayer(path, spec, data, width, height) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const t = normalize(spec, data[i]);
    if (spec.encoding === "linear16") {
      const v = Math.round(t * 65535);
      png.data[i * 4] = v >> 8;
      png.data[i * 4 + 1] = v & 255;
      png.data[i * 4 + 2] = 0;
    } else {
      png.data[i * 4] = png.data[i * 4 + 1] = png.data[i * 4 + 2] = Math.round(t * 255);
    }
    png.data[i * 4 + 3] = 255;
  }
  await fs.writeFile(path, PNG.sync.write(png));
}

// Boylamda sarmalı 3x3 kutu bulanıklığı; birkaç geçiş Gauss'a yaklaşır
function smooth(data, width, height, passes) {
  let src = data;
  for (let n = 0; n < passes; n++) {
    const out = new Float32Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            sum += src[yy * width + ((x + dx + width) % width)];
            count++;
          }
        }
        out[y * width + x] = sum / count;
      }
    }
    src = out;
  }
  return src;
}

// Yerel basınç merkezleri: çevresindeki pencerenin en yükseği/en düşüğü ve
// pencere ortalamasından belirgin farklı (sığ dalgalanmalar merkez sayılmasın)
function findPressureCenters(pressure, width, height) {
  const R = 8; // derece cinsinden pencere yarıçapı
  const MIN_PROMINENCE = 2; // hPa
  const centers = [];
  for (let y = 10; y < height - 10; y++) {
    for (let x = 0; x < width; x++) {
      const v = pressure[y * width + x];
      let isMax = v >= 1015;
      let isMin = v <= 1005;
      let sum = 0;
      let count = 0;
      for (let dy = -R; dy <= R && (isMax || isMin); dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const n = pressure[(y + dy) * width + ((x + dx + width) % width)];
          sum += n;
          count++;
          if (!dx && !dy) continue;
          // Düzlükte tek merkez kalsın diye eşitlikte öndekini seç
          const before = dy < 0 || (dy === 0 && dx < 0);
          if (n > v || (before && n === v)) isMax = false;
          if (n < v || (before && n === v)) isMin = false;
        }
      }
      const mean = sum / count;
      if (isMax && v - mean < MIN_PROMINENCE) isMax = false;
      if (isMin && mean - v < MIN_PROMINENCE) isMin = false;
      if (isMax || isMin) {
        centers.push({
          type: isMax ? "H" : "L",
          lat: 90 - y,
          lon: x - 180,
          value: Math.round(v),
        });
      }
    }
  }
  return centers;
}

console.log("GFS indiriliyor (NOMADS)…");
const { cycle, buf } = await downloadLatest();
const messages = readGrib2(buf);
const validTime = new Date(
  new Date(cycle.iso).getTime() + Number(FORECAST_HOUR) * 3600_000
).toISOString();
console.log(`Koşu: ${cycle.date} ${cycle.hour}Z, geçerli: ${validTime}, ${messages.length} alan`);

const fields = {
  temperature: toGrid(pick(messages, { category: 0, number: 0, surface: 103, value: 2 })).map(
    (k) => k - 273.15
  ),
  humidity: toGrid(pick(messages, { category: 1, number: 1, surface: 103, value: 2 })),
  clouds: toGrid(pick(messages, { category: 6, number: 1, surface: 10 })),
  precipitation: toGrid(
    pick(messages, { category: 1, number: 7, surface: 1, templates: [8, 0] })
  ).map((r) => r * 3600),
  pressure: toGrid(pick(messages, { category: 3, number: 1, surface: 101 })).map(
    (p) => p / 100
  ),
};
const u = toGrid(pick(messages, { category: 2, number: 2, surface: 103, value: 10 }));
const v = toGrid(pick(messages, { category: 2, number: 3, surface: 103, value: 10 }));

const WIDTH = 360;
const HEIGHT = 181;

// Yüksek arazide deniz seviyesi basıncı hesapla uydurulur ve gürültülüdür;
// meteoroloji haritaları gibi yumuşatılmış alandan çiz
fields.pressure = smooth(fields.pressure, WIDTH, HEIGHT, 6);

await fs.mkdir(LAYER_DIR, { recursive: true });

for (const [name, spec] of Object.entries(LAYERS)) {
  const data = fields[name];
  await writeLayer(`${LAYER_DIR}/${name}.png`, spec, data, WIDTH, HEIGHT);
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of data) {
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  console.log(`  ${name}: ${lo.toFixed(1)} … ${hi.toFixed(1)} ${spec.unit}`);
}

await fs.writeFile(
  `${LAYER_DIR}/layers.json`,
  JSON.stringify(
    { source: "NOAA GFS 1° (NOMADS)", date: validTime, width: WIDTH, height: HEIGHT, layers: LAYERS },
    null,
    2
  )
);

const centers = findPressureCenters(fields.pressure, WIDTH, HEIGHT);
await fs.writeFile(`${LAYER_DIR}/pressure-centers.json`, JSON.stringify(centers));
console.log(`  basınç merkezleri: ${centers.length}`);

// Rüzgar: önceki biçim aynen korunur (360x180, R = u, G = v)
const WIND_HEIGHT = 180;
let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
for (let i = 0; i < WIDTH * WIND_HEIGHT; i++) {
  uMin = Math.min(uMin, u[i]);
  uMax = Math.max(uMax, u[i]);
  vMin = Math.min(vMin, v[i]);
  vMax = Math.max(vMax, v[i]);
}
const wind = new PNG({ width: WIDTH, height: WIND_HEIGHT });
for (let i = 0; i < WIDTH * WIND_HEIGHT; i++) {
  wind.data[i * 4] = Math.round((255 * (u[i] - uMin)) / (uMax - uMin));
  wind.data[i * 4 + 1] = Math.round((255 * (v[i] - vMin)) / (vMax - vMin));
  wind.data[i * 4 + 2] = 0;
  wind.data[i * 4 + 3] = 255;
}
await fs.writeFile(`${OUT_DIR}/wind.png`, PNG.sync.write(wind));
await fs.writeFile(
  `${OUT_DIR}/wind.json`,
  JSON.stringify(
    { source: "NOAA GFS 1° (NOMADS)", date: validTime, width: WIDTH, height: WIND_HEIGHT, uMin, uMax, vMin, vMax },
    null,
    2
  )
);

console.log("Bitti!");
