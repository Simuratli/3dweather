import {
  PALETTES,
  colorAt,
  decode,
  encode,
  type FillLayerId,
  type LayersMeta,
} from "../../utils/layers";

const DATE = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

type Props = {
  fill: FillLayerId;
  pressure: boolean;
  meta: LayersMeta | null;
  satelliteDate: string;
};

const Legend = ({ fill, pressure, meta, satelliteDate }: Props) => {
  if (fill === "none" && !pressure) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 hidden w-64 rounded-2xl border border-white/10 bg-slate-900/80 p-3 text-white shadow-xl backdrop-blur sm:block">
      {fill === "satellite" && (
        <>
          <p className="text-sm font-medium">Uydu bulutları</p>
          <p className="mt-1 text-xs text-slate-400">
            NASA GIBS · VIIRS gerçek renk · {satelliteDate}. Kar ve buz da bulut
            gibi görünebilir.
          </p>
        </>
      )}

      {meta && fill !== "none" && fill !== "satellite" && (
        <FieldLegend id={fill} meta={meta} />
      )}

      {meta && pressure && (
        <p className={`text-xs text-slate-400 ${fill !== "none" ? "mt-3" : ""}`}>
          <span className="font-medium text-white">Basınç:</span> 4 hPa aralıklı
          eş basınç çizgileri. <span className="font-bold text-sky-300">Y</span>{" "}
          yüksek, <span className="font-bold text-rose-400">A</span> alçak basınç.
        </p>
      )}

      {meta && (fill !== "none" && fill !== "satellite" || pressure) && (
        <p className="mt-2 text-[11px] text-slate-500">
          {meta.source} · {DATE.format(new Date(meta.date))}
        </p>
      )}
    </div>
  );
};

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
