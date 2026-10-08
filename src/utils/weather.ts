import { useEffect, useState } from "react";

export type CurrentWeather = {
  temperature: number;
  feelsLike: number;
  humidity: number;
  precipitation: number;
  cloudCover: number;
  pressure: number;
  uvIndex: number;
  code: number;
  isDay: boolean;
};

export type DailyForecast = {
  date: string; // YYYY-MM-DD, noktanın yerel saatine göre
  code: number;
  min: number;
  max: number;
  precipitation: number;
  precipitationChance: number;
};

export type AirQuality = {
  aqi: number; // Avrupa hava kalitesi indeksi
  pm25: number;
  ozone: number;
  dust: number;
};

export type Weather = {
  current: CurrentWeather;
  daily: DailyForecast[];
  air: AirQuality | null;
};

type ForecastResponse = {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    cloud_cover: number;
    pressure_msl: number;
    uv_index: number;
    weather_code: number;
    is_day: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: (number | null)[];
  };
};

type AirResponse = {
  current: {
    european_aqi: number;
    pm2_5: number;
    ozone: number;
    dust: number;
  };
};

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function fetchForecast(lat: number, lon: number, signal: AbortSignal) {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m," +
    "precipitation,cloud_cover,pressure_msl,uv_index,weather_code,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min," +
    "precipitation_sum,precipitation_probability_max" +
    "&timezone=auto&forecast_days=7";
  const { current: c, daily: d } = await fetchJson<ForecastResponse>(
    url,
    signal
  );

  return {
    current: {
      temperature: c.temperature_2m,
      feelsLike: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      precipitation: c.precipitation,
      cloudCover: c.cloud_cover,
      pressure: c.pressure_msl,
      uvIndex: c.uv_index,
      code: c.weather_code,
      isDay: c.is_day === 1,
    },
    daily: d.time.map((date, i) => ({
      date,
      code: d.weather_code[i],
      min: d.temperature_2m_min[i],
      max: d.temperature_2m_max[i],
      precipitation: d.precipitation_sum[i],
      precipitationChance: d.precipitation_probability_max[i] ?? 0,
    })),
  };
}

async function fetchAir(lat: number, lon: number, signal: AbortSignal) {
  const url =
    "https://air-quality-api.open-meteo.com/v1/air-quality" +
    `?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5,ozone,dust`;
  const { current: c } = await fetchJson<AirResponse>(url, signal);
  return { aqi: c.european_aqi, pm25: c.pm2_5, ozone: c.ozone, dust: c.dust };
}

async function fetchWeather(
  lat: number,
  lon: number,
  signal: AbortSignal
): Promise<Weather> {
  // Hava kalitesi yan bilgi: o servis düşerse tahmin yine gösterilsin
  const [forecast, air] = await Promise.all([
    fetchForecast(lat, lon, signal),
    fetchAir(lat, lon, signal).catch((err) => {
      if (err.name === "AbortError") throw err;
      console.error(err);
      return null;
    }),
  ]);
  return { ...forecast, air };
}

type Result = { key: string; weather: Weather | null };

export function useWeather(lat: number | null, lon: number | null) {
  const key = lat === null || lon === null ? null : `${lat},${lon}`;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (lat === null || lon === null) return;

    const controller = new AbortController();
    const requestKey = `${lat},${lon}`;

    fetchWeather(lat, lon, controller.signal)
      .then((weather) => setResult({ key: requestKey, weather }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error(err);
        setResult({ key: requestKey, weather: null });
      });

    return () => controller.abort();
  }, [lat, lon]);

  // Sonuç başka bir noktaya aitse hâlâ yükleniyor demektir
  const done = result !== null && result.key === key;
  return {
    weather: done ? result.weather : null,
    loading: key !== null && !done,
  };
}

// WMO hava durumu kodları
export function describeWeather(code: number, isDay = true) {
  if (code === 0) return { label: "Açık", icon: isDay ? "☀️" : "🌙" };
  if (code === 1) return { label: "Az bulutlu", icon: isDay ? "🌤️" : "🌙" };
  if (code === 2) return { label: "Parçalı bulutlu", icon: "⛅" };
  if (code === 3) return { label: "Kapalı", icon: "☁️" };
  if (code === 45 || code === 48) return { label: "Sis", icon: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "Çisenti", icon: "🌦️" };
  if (code >= 61 && code <= 67) return { label: "Yağmur", icon: "🌧️" };
  if (code >= 71 && code <= 77) return { label: "Kar", icon: "❄️" };
  if (code >= 80 && code <= 82) return { label: "Sağanak", icon: "🌦️" };
  if (code === 85 || code === 86) return { label: "Kar sağanağı", icon: "🌨️" };
  if (code >= 95) return { label: "Gök gürültülü fırtına", icon: "⛈️" };
  return { label: "Bilinmiyor", icon: "🌡️" };
}

// Avrupa AQI bantları, rehberdeki sabit durum renkleriyle
export function describeAirQuality(aqi: number) {
  if (aqi <= 20) return { label: "İyi", color: "#0ca30c" };
  if (aqi <= 40) return { label: "Makul", color: "#0ca30c" };
  if (aqi <= 60) return { label: "Orta", color: "#fab219" };
  if (aqi <= 80) return { label: "Kötü", color: "#ec835a" };
  if (aqi <= 100) return { label: "Çok kötü", color: "#d03b3b" };
  return { label: "Aşırı kötü", color: "#d03b3b" };
}
