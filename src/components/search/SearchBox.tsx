import { useState } from "react";
import { useCitySearch, type City } from "../../utils/search";

type Props = {
  onSelect: (city: City) => void;
};

const SearchBox = ({ onSelect }: Props) => {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const { cities, loading } = useCitySearch(input);

  const active = Math.min(activeIndex, cities.length - 1);
  const showList = open && input.trim().length >= 2;

  function choose(city: City) {
    setInput(city.name);
    setOpen(false);
    onSelect(city);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, cities.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && cities[active]) {
      choose(cities[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      e.currentTarget.blur();
    }
  }

  return (
    <div className="absolute top-4 left-1/2 w-80 max-w-[calc(100%-2rem)] -translate-x-1/2 text-white">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 shadow-xl backdrop-blur">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="Şehir ara…"
          aria-label="Şehir ara"
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500"
        />
        {loading && (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
        )}
      </div>

      {showList && (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-xl backdrop-blur">
          {cities.length === 0 && !loading && (
            <li className="px-4 py-3 text-sm text-slate-400">Sonuç yok</li>
          )}
          {cities.map((city, i) => (
            <li key={city.id}>
              <button
                // mousedown'da odak inputtan gitmesin, yoksa liste tıklamadan önce kapanır
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(city)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`block w-full px-4 py-2 text-left ${
                  i === active ? "bg-white/10" : ""
                }`}
              >
                <span className="text-sm font-medium">{city.name}</span>
                <span className="block text-xs text-slate-400">
                  {[city.region, city.country].filter(Boolean).join(", ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchBox;
