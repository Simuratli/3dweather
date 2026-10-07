import type { WindField } from "../../utils/wind";
import type { Place } from "../../utils/place";

const DIRECTIONS = [
  "Kuzey", "Kuzeydoğu", "Doğu", "Güneydoğu",
  "Güney", "Güneybatı", "Batı", "Kuzeybatı",
];

type Props = {
  lat: number;
  lon: number;
  country: string | null;
  place: Place | null;
  placeLoading: boolean;
  wind: WindField;
  onClose: () => void;
};


const InfoPanel = ({
  lat,
  lon,
  country,
  place,
  placeLoading,
  wind,
  onClose,
}: Props) => {
  const { u, v } = wind.getWind(lat, lon);
  const speedKmh = Math.hypot(u, v) * 3.6;
  const fromDeg = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
  const direction = DIRECTIONS[Math.round(fromDeg / 45) % 8];

  const latText = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "K" : "G"}`;
  const lonText = `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "D" : "B"}`;

  const title = country ?? place?.water ?? "Açık deniz";
  const cityText = place?.city
    ? [place.city, place.region].filter(Boolean).join(", ")
    : null;

  return (
    <div className="absolute bottom-6 left-1/2 w-72 -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-white shadow-xl backdrop-blur">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-400">Seçilen nokta</p>
          <p className="text-lg font-semibold">{title}</p>
          {placeLoading ? (
            <p className="text-sm text-slate-400 animate-pulse">Konum aranıyor…</p>
          ) : (
            cityText && <p className="text-sm text-slate-300">{cityText}</p>
          )}
          <p className="text-lg font-semibold">
            {latText}, {lonText}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white"
          aria-label="Kapat"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-400">Rüzgar hızı</p>
          <p className="text-2xl font-bold">
            {speedKmh.toFixed(0)} <span className="text-sm font-normal">km/sa</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Nereden</p>
          <p className="text-lg font-semibold">
            {direction}{" "}
            <span
              className="inline-block"
              style={{ transform: `rotate(${fromDeg + 180}deg)` }}
            >
              ↑
            </span>
          </p>
          <p className="text-xs text-slate-400">{Math.round(fromDeg)}°</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">Veri: {wind.meta.date}</p>
    </div>
  );
};

export default InfoPanel;