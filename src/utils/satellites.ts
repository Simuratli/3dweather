import { useEffect, useState } from "react";
import { twoline2satrec, type SatRec } from "satellite.js";

export const EARTH_RADIUS_KM = 6371;
const MU = 398600.4418; // Dünya'nın kütleçekim parametresi (km³/s²)

// Saçılım biçiminde her renk çifti yan yana gelir: rehber en fazla 3 renk
// grubuna izin veriyor. İstasyonlar renkle değil, boyut ve etiketle ayrılır.
export const SAT_CATEGORIES = [
  { id: "starlink", label: "Starlink", color: "#3987e5" },
  { id: "leo", label: "Diğer alçak yörünge", color: "#d95926" },
  { id: "high", label: "Orta ve yüksek yörünge", color: "#199e70" },
  { id: "station", label: "Uzay istasyonları", color: "#ffffff" },
] as const;

export type SatCategory = (typeof SAT_CATEGORIES)[number]["id"];

export type Satellite = {
  name: string;
  norad: number;
  category: SatCategory;
  satrec: SatRec;
  label?: string; // ISS gibi her zaman etiketli olanlar
};

// Tek parça izlenen modüller ayrı katalog nesneleri; etiketi ana modüle ver
const LABELS: Record<string, string> = {
  "ISS (ZARYA)": "ISS",
  "CSS (TIANHE)": "Tiangong",
};

// Ortalama hareketten (tur/gün) yaklaşık yükseklik
export function altitudeKm(satrec: SatRec) {
  const n = satrec.no / 60; // rad/dk -> rad/sn
  return Math.cbrt(MU / (n * n)) - EARTH_RADIUS_KM;
}

function classify(name: string, satrec: SatRec): SatCategory {
  if (/^(ISS|CSS) \(/.test(name)) return "station";
  if (name.startsWith("STARLINK")) return "starlink";
  return altitudeKm(satrec) < 2000 ? "leo" : "high";
}

const yieldToBrowser = () => new Promise((r) => setTimeout(r, 0));

async function loadSatellites(): Promise<Satellite[]> {
  const res = await fetch("/data/satellites.tle");
  if (!res.ok) throw new Error(`Uydu verisi yok (${res.status}). npm run update-satellites`);
  const lines = (await res.text()).trim().split(/\r?\n/);

  const satellites: Satellite[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].trim();
    // İstasyon modülleri (Unity, Zvezda, Wentian…) ayrı katalog nesnesi olarak
    // izlenir ama ana modülle aynı noktadadır: sayıyı şişirmesin
    if (/^(ISS|CSS) \(/.test(name) && !LABELS[name]) continue;
    const satrec = twoline2satrec(lines[i + 1], lines[i + 2]);
    if (satrec.error) continue;
    satellites.push({
      name,
      norad: Number(satrec.satnum),
      category: classify(name, satrec),
      satrec,
      label: LABELS[name],
    });
    // 16 bin uyduyu ayrıştırmak ~400 ms; arayüz donmasın diye parça parça
    if (satellites.length % 1500 === 0) await yieldToBrowser();
  }
  return satellites;
}

export function useSatellites(enabled: boolean) {
  const [satellites, setSatellites] = useState<Satellite[] | null>(null);
  useEffect(() => {
    if (!enabled || satellites) return;
    let cancelled = false;
    loadSatellites()
      .then((s) => !cancelled && setSatellites(s))
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [enabled, satellites]);
  return satellites;
}

// ECI (atalet) koordinatı -> sahne koordinatı. Dünya kendi ekseninde döndüğü
// için önce gmst kadar çevrilir (ECI -> ECF), sonra utils/geo eksenlerine:
// sahne = (ecf.x, ecf.z, -ecf.y) / Dünya yarıçapı
export function eciToScene(
  x: number,
  y: number,
  z: number,
  gmst: number,
  out: [number, number, number]
) {
  const c = Math.cos(gmst);
  const s = Math.sin(gmst);
  const ex = x * c + y * s;
  const ey = -x * s + y * c;
  out[0] = ex / EARTH_RADIUS_KM;
  out[1] = z / EARTH_RADIUS_KM;
  out[2] = -ey / EARTH_RADIUS_KM;
  return out;
}
