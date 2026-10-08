import {
  describeAirQuality,
  describeWeather,
  type Weather,
} from "../../utils/weather";
import ForecastChart from "./ForecastChart";

function uvLabel(uv: number) {
  if (uv < 3) return "Düşük";
  if (uv < 6) return "Orta";
  if (uv < 8) return "Yüksek";
  if (uv < 11) return "Çok yüksek";
  return "Aşırı";
}

const Stat = ({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
}) => (
  <div>
    <p className="text-xs text-slate-400">{label}</p>
    <p className="font-semibold tabular-nums">
      {value}
      {unit && <span className="ml-0.5 text-xs font-normal text-slate-400">{unit}</span>}
    </p>
    {note && <p className="text-[11px] text-slate-400">{note}</p>}
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-xs font-medium tracking-wide text-slate-400 uppercase">
    {children}
  </p>
);

type Props = {
  weather: Weather | null;
  loading: boolean;
};

const WeatherDetails = ({ weather, loading }: Props) => {
  if (loading) {
    return (
      <p className="mt-4 animate-pulse text-sm text-slate-400">
        Hava durumu yükleniyor…
      </p>
    );
  }
  if (!weather) {
    return (
      <p className="mt-4 text-sm text-slate-400">Hava durumu alınamadı.</p>
    );
  }

  const { current, daily, air } = weather;
  const condition = describeWeather(current.code, current.isDay);
  const airQuality = air && describeAirQuality(air.aqi);

  return (
    <>
      <div className="mt-4 flex items-center gap-3">
        <span className="text-4xl leading-none" aria-hidden>
          {condition.icon}
        </span>
        <div>
          <p className="text-4xl font-semibold tabular-nums leading-none">
            {Math.round(current.temperature)}°
          </p>
          <p className="mt-1 text-sm text-slate-300">
            {condition.label} · Hissedilen {Math.round(current.feelsLike)}°
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3">
        <Stat label="Nem" value={`${current.humidity}`} unit="%" />
        <Stat label="Yağış" value={current.precipitation.toFixed(1)} unit="mm" />
        <Stat label="Bulut" value={`${current.cloudCover}`} unit="%" />
        <Stat label="Basınç" value={`${Math.round(current.pressure)}`} unit="hPa" />
        <Stat
          label="UV indeksi"
          value={current.uvIndex.toFixed(1)}
          note={uvLabel(current.uvIndex)}
        />
      </div>

      <div className="mt-5">
        <SectionTitle>7 günlük tahmin</SectionTitle>
        <ForecastChart days={daily} current={current.temperature} />
      </div>

      {air && airQuality && (
        <div className="mt-5">
          <SectionTitle>Hava kalitesi</SectionTitle>
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: airQuality.color }}
              aria-hidden
            />
            <span className="font-semibold">{airQuality.label}</span>
            <span className="text-sm text-slate-400 tabular-nums">
              AQI {Math.round(air.aqi)}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="PM2.5" value={air.pm25.toFixed(1)} unit="µg/m³" />
            <Stat label="Ozon" value={`${Math.round(air.ozone)}`} unit="µg/m³" />
            <Stat label="Toz" value={`${Math.round(air.dust)}`} unit="µg/m³" />
          </div>
        </div>
      )}
    </>
  );
};

export default WeatherDetails;
