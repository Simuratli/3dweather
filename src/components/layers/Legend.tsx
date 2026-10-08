import {
  PALETTES,
  colorAt,
  decode,
  encode,
  type FillLayerId,
  type LayersMeta,
} from "../../utils/layers";
import {
  QUAKE_CLASSES,
  quakeClass,
  type QuakeFeed,
} from "../../utils/earthquakes";
import { SAT_CATEGORIES, type Satellite } from "../../utils/satellites";

const DATE = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const TIME = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });

type Props = {
  fill: FillLayerId;
  pressure: boolean;
  meta: LayersMeta | null;
  satelliteDate: string;
  quakes: QuakeFeed | null; // null = katman kapalı ya da yükleniyor
  satellites: Satellite[] | null;
};

const Legend = ({ fill, pressure, meta, satelliteDate, quakes, satellites }: Props) => {
  const field = fill !== "none" && fill !== "satellite" ? fill : null;
  if (fill === "none" && !pressure && !quakes && !satellites) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 hidden w-64 space-y-3 rounded-2xl border border-white/10 bg-slate-900/80 p-3 text-white shadow-xl backdrop-blur sm:block">
      {fill === "satellite" && (
        <div>
          <p className="text-sm font-medium">Uydu bulutları</p>
          <p className="mt-1 text-xs text-slate-400">
            NASA GIBS · VIIRS gerçek renk · {satelliteDate}. Kar ve buz da bulut
            gibi görünebilir.
          </p>
        </div>
      )}

      {meta && field && (
        <div>
          <FieldLegend id={field} meta={meta} />
        </div>
      )}

      {meta && pressure && (
        <p className="text-xs text-slate-400">
          <span className="font-medium text-white">Basınç:</span> 4 hPa aralıklı
          eş basınç çizgileri. <span className="font-bold text-sky-300">Y</span>{" "}
          yüksek, <span className="font-bold text-rose-400">A</span> alçak basınç.
        </p>
      )}

      {meta && (field || pressure) && (
        <p className="text-[11px] text-slate-500">
          {meta.source} · {DATE.format(new Date(meta.date))}
        </p>
      )}

      {quakes && <QuakeLegend feed={quakes} />}
      {satellites && <SatelliteLegend satellites={satellites} />}
    </div>
  );
};

const SatelliteLegend = ({ satellites }: { satellites: Satellite[] }) => (
  <div>
    <p className="text-sm font-medium">
      Uydular <span className="text-slate-400">({satellites.length.toLocaleString("tr-TR")} aktif)</span>
    </p>
    <ul className="mt-1.5 space-y-1 text-xs">
      {SAT_CATEGORIES.map((c) => (
        <li key={c.id} className="flex items-center gap-2">
          <span
            className={`rounded-full ${c.id === "station" ? "h-3 w-3" : "h-2 w-2"}`}
            style={{ backgroundColor: c.color }}
            aria-hidden
          />
          <span className="text-slate-300">{c.label}</span>
          <span className="ml-auto text-slate-400 tabular-nums">
            {satellites.filter((s) => s.category === c.id).length.toLocaleString("tr-TR")}
          </span>
        </li>
      ))}
    </ul>
    <p className="mt-1.5 text-[11px] text-slate-500">
      CelesTrak yörünge verisi · konumlar gerçek zamanlı (SGP4) · uzaklaşınca
      yerdurağan halka görünür
    </p>
  </div>
);

const QuakeLegend = ({ feed }: { feed: QuakeFeed }) => (
  <div>
    <p className="text-sm font-medium">
      Depremler <span className="text-slate-400">(son 24 sa, M2.5+)</span>
    </p>
    <ul className="mt-1.5 space-y-1 text-xs">
      {QUAKE_CLASSES.map((c) => (
        <li key={c.label} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
          <span className="text-slate-300">{c.label}</span>
          <span className="ml-auto text-slate-400 tabular-nums">
            {feed.quakes.filter((q) => quakeClass(q.mag) === c).length}
          </span>
        </li>
      ))}
    </ul>
    <p className="mt-1.5 text-[11px] text-slate-500">
      USGS · {TIME.format(feed.updated)} güncellendi · yeniler daha parlak atar
    </p>
  </div>
);

const FieldLegend = ({ id, meta }: { id: Exclude<FillLayerId, "none" | "satellite">; meta: LayersMeta }) => {
  const spec = meta.layers[id];
  const palette = PALETTES[id];

  // Haritayla aynı ölçek: kodlanmış eksende eşit adımlarla örnekle
  const steps = 24;
  const gradient = Array.from({ length: steps + 1 }, (_, k) => {
    const { color, alpha } = colorAt(palette.stops, decode(spec, k / steps));
    const rgb = color.toArray().map((c) => Math.round(c * 255)).join(",");
    return `rgba(${rgb},${alpha}) ${(k / steps) * 100}%`;
  }).join(",");

  return (
    <>
      <p className="text-sm font-medium">
        {palette.label} <span className="text-slate-400">({spec.unit})</span>
      </p>
      <div
        className="mt-2 h-2.5 rounded-full border border-white/10"
        style={{ background: `linear-gradient(to right, ${gradient})` }}
      />
      <div className="relative mt-1 h-4 text-[11px] text-slate-400 tabular-nums">
        {palette.ticks.map((tick, i) => {
          const pos = encode(spec, tick) * 100;
          const align =
            i === 0 ? "translate-x-0" : i === palette.ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2";
          return (
            <span key={tick} className={`absolute ${align}`} style={{ left: `${pos}%` }}>
              {tick}
            </span>
          );
        })}
      </div>
    </>
  );
};

export default Legend;
