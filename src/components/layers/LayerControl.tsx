import { useState } from "react";
import type { FillLayerId } from "../../utils/layers";

export type LayerState = {
  fill: FillLayerId;
  wind: boolean;
  currents: boolean;
  pressure: boolean;
};

const FILLS: { id: FillLayerId; label: string }[] = [
  { id: "none", label: "Yok" },
  { id: "temperature", label: "Sıcaklık" },
  { id: "precipitation", label: "Yağış" },
  { id: "clouds", label: "Bulut (model)" },
  { id: "humidity", label: "Nem" },
  { id: "satellite", label: "Uydu bulutları" },
];

const OVERLAYS: { key: "wind" | "currents" | "pressure"; label: string }[] = [
  { key: "wind", label: "Rüzgar akışı" },
  { key: "currents", label: "Okyanus akıntıları" },
  { key: "pressure", label: "Basınç çizgileri" },
];

type Props = {
  value: LayerState;
  onChange: (value: LayerState) => void;
};

const LayerControl = ({ value, onChange }: Props) => {
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute top-16 left-4 w-48 rounded-2xl border border-white/10 bg-slate-900/80 text-sm text-white shadow-xl backdrop-blur">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 font-medium"
      >
        Katmanlar
        <span className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3">
          <fieldset>
            <legend className="mb-1 text-xs text-slate-400">Renk katmanı</legend>
            {FILLS.map(({ id, label }) => (
              <label key={id} className="flex cursor-pointer items-center gap-2 py-0.5">
                <input
                  type="radio"
                  name="fill"
                  checked={value.fill === id}
                  onChange={() => onChange({ ...value, fill: id })}
                  className="accent-sky-400"
                />
                {label}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-xs text-slate-400">Üst katmanlar</legend>
            {OVERLAYS.map(({ key, label }) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  checked={value[key]}
                  onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
                  className="accent-sky-400"
                />
                {label}
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </div>
  );
};

export default LayerControl;
