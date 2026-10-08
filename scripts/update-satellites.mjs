// Aktif uyduların yörünge verisi (TLE) CelesTrak'ten: public/data/satellites.tle
// Konumlar uygulamada bu veriden gerçek zamanlı hesaplanır (SGP4); TLE birkaç gün
// boyunca yeterince doğrudur. CelesTrak aynı veriyi 2 saatten sık indiren IP'leri
// engellediği için veri 12 saatten yeniyse indirme atlanır (--force ile zorla).
import fs from "node:fs/promises";

const OUT = "public/data/satellites.tle";
const URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
const MAX_AGE_HOURS = 12;

if (!process.argv.includes("--force")) {
  try {
    const { mtimeMs } = await fs.stat(OUT);
    const ageHours = (Date.now() - mtimeMs) / 3600_000;
    if (ageHours < MAX_AGE_HOURS) {
      console.log(
        `Uydu verisi ${ageHours.toFixed(1)} saatlik, güncel sayılır. ` +
          "Yine de indirmek için: npm run update-satellites -- --force"
      );
      process.exit(0);
    }
  } catch {
    // Dosya yok: indir
  }
}

console.log("CelesTrak'ten aktif uydular indiriliyor…");
const res = await fetch(URL);
const text = await res.text();
if (!res.ok) {
  console.error(`İndirme başarısız (${res.status}): ${text.slice(0, 200)}`);
  process.exit(1);
}

const lines = text.trim().split(/\r?\n/);
// Kota aşımında CelesTrak TLE yerine düz metin hata mesajı döner
if (lines.length < 3 || !lines[1].startsWith("1 ") || !lines[2].startsWith("2 ")) {
  console.error(`Beklenmeyen yanıt: ${text.slice(0, 200)}`);
  process.exit(1);
}

await fs.writeFile(OUT, lines.join("\n") + "\n");
console.log(`Bitti! ${lines.length / 3} uydu → ${OUT}`);
