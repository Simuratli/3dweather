import type { WindField } from "../../utils/wind";
import type { Place } from "../../utils/place";
import type { Weather } from "../../utils/weather";
import WeatherDetails from "./WeatherDetails";

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
  weather: Weather | null;
  weatherLoading: boolean;
  wind: WindField;
  onClose: () => void;
};


const InfoPanel = ({
  lat,
  lon,
  country,
  place,
  placeLoading,
  weather,
  weatherLoading,
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
    // Mobilde altta, geniş ekranda sağ kenarda; uzun içerik kaydırılır
    <div className="absolute right-4 bottom-4 left-4 max-h-[60%] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-white shadow-xl backdrop-blur sm:top-4 sm:bottom-auto sm:left-auto sm:max-h-[calc(100%-2rem)] sm:w-80">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-400">Seçilen nokta</p>
          <p className="text-lg font-semibold">{title}</p>
          {placeLoading ? (
            <p className="text-sm text-slate-400 animate-pulse">Konum aranıyor…</p>
          ) : (
            cityText && <p className="text-sm text-slate-300">{cityText}</p>
          )}
          <p className="text-xs text-slate-400 tabular-nums">
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

      <WeatherDetails weather={weather} loading={weatherLoading} />

      <p className="mt-5 mb-2 text-xs font-medium tracking-wide text-slate-400 uppercase">
        Rüzgar akışı (harita)
      </p>
      <div className="grid grid-cols-2 gap-3">
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

      <p className="mt-3 text-xs text-slate-500">
        Rüzgar verisi: {wind.meta.date} · Hava durumu: Open-Meteo
      </p>
    </div>
  );
};

export default InfoPanel;