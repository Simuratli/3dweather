import { describeWeather, type DailyForecast } from "../../utils/weather";

const WEEKDAY = new Intl.DateTimeFormat("tr-TR", { weekday: "short" });

function dayLabel(date: string, index: number) {
  if (index === 0) return "Bugün";
  // Saat dilimi kaymasın diye öğlen olarak yorumla
  return WEEKDAY.format(new Date(`${date}T12:00:00`));
}

type Props = {
  days: DailyForecast[];
  current: number; // bugünün çubuğunda nokta olarak gösterilir
};

// Her gün için min–maks aralık çubuğu; tüm hafta tek ortak ölçekte
const ForecastChart = ({ days, current }: Props) => {
  const weekMin = Math.min(...days.map((d) => d.min));
  const weekMax = Math.max(...days.map((d) => d.max));
  const span = Math.max(weekMax - weekMin, 1);
  const pos = (t: number) => ((t - weekMin) / span) * 100;

  return (
    <ul className="space-y-1">
      {days.map((day, i) => {
        const { label, icon } = describeWeather(day.code);
        const name = dayLabel(day.date, i);
        const left = pos(day.min);
        const width = Math.max(pos(day.max) - left, 2);

        return (
          <li
            key={day.date}
            title={
              `${name}: ${label}, ${Math.round(day.min)}° – ${Math.round(day.max)}°, ` +
              `yağış ${day.precipitation.toFixed(1)} mm (%${day.precipitationChance})`
            }
            className="grid grid-cols-[2.5rem_1.75rem_1.75rem_1fr_1.75rem] items-center gap-2 rounded-lg px-1 py-0.5 text-sm hover:bg-white/5"
          >
            <span className="text-slate-300">{name}</span>
            <span className="flex flex-col items-center leading-none">
              <span aria-label={label}>{icon}</span>
              {day.precipitationChance >= 30 && (
                <span className="mt-0.5 text-[10px] text-slate-400">
                  %{day.precipitationChance}
                </span>
              )}
            </span>
            <span className="text-right text-slate-400 tabular-nums">
              {Math.round(day.min)}°
            </span>
            <span className="relative h-1.5 rounded-full bg-white/10">
              <span
                className="absolute inset-y-0 rounded-full bg-sky-300"
                style={{ left: `${left}%`, width: `${width}%` }}
              />
              {i === 0 && (
                <span
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-900 bg-white"
                  style={{ left: `${pos(current)}%` }}
                  aria-label={`Şu an ${Math.round(current)}°`}
                />
              )}
            </span>
            <span className="text-right font-medium tabular-nums">
              {Math.round(day.max)}°
            </span>
          </li>
        );
      })}
    </ul>
  );
};

export default ForecastChart;
