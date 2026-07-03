"use client";

interface ControlsProps {
  sensitivity: number;
  cutEvery: number;
  dynamicCut: boolean;
  onSensitivity: (v: number) => void;
  onCutEvery: (v: number) => void;
  onDynamicCut: (v: boolean) => void;
  bpm: number;
  beatCount: number;
  cutCount: number;
  disabled: boolean;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-ink-600 bg-ink-800/60 px-3 py-2 text-center">
      <div className="text-lg font-bold tabular-nums text-zinc-100">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
    </div>
  );
}

/** Les réglages qui comptent : sensibilité (combien de beats), cadence de
 *  coupe, et montage dynamique (l'énergie du morceau module la cadence).
 *  Plus les stats live de l'analyse. */
export default function Controls({
  sensitivity,
  cutEvery,
  dynamicCut,
  onSensitivity,
  onCutEvery,
  onDynamicCut,
  bpm,
  beatCount,
  cutCount,
  disabled,
}: ControlsProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="BPM" value={bpm || "—"} />
        <Stat label="Beats" value={beatCount || "—"} />
        <Stat label="Coupes" value={cutCount || "—"} />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="sensitivity" className="text-sm font-medium text-zinc-200">
            Sensibilité
          </label>
          <span className="font-mono text-xs text-accent">
            {sensitivity.toFixed(2)}
          </span>
        </div>
        <input
          id="sensitivity"
          type="range"
          min={0.8}
          max={2.6}
          step={0.05}
          value={sensitivity}
          disabled={disabled}
          onChange={(e) => onSensitivity(parseFloat(e.target.value))}
          className="slider"
        />
        <p className="text-[11px] text-zinc-500">
          Plus bas = plus de beats détectés · plus haut = on garde les plus forts
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="cutEvery" className="text-sm font-medium text-zinc-200">
            {dynamicCut
              ? `Cadence de base : ${cutEvery} beat${cutEvery > 1 ? "s" : ""}`
              : `Couper tous les ${cutEvery} beat${cutEvery > 1 ? "s" : ""}`}
          </label>
          <span className="font-mono text-xs text-accent">{cutEvery}</span>
        </div>
        <input
          id="cutEvery"
          type="range"
          min={1}
          max={8}
          step={1}
          value={cutEvery}
          disabled={disabled}
          onChange={(e) => onCutEvery(parseInt(e.target.value, 10))}
          className="slider"
        />
        <p className="text-[11px] text-zinc-500">
          {dynamicCut
            ? "l'énergie module autour de cette base : ×2 au calme, ÷2 quand ça tape"
            : "1 = nerveux · 4+ = posé"}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <span
            id="dynamicCutLabel"
            className="block text-sm font-medium text-zinc-200"
          >
            Montage dynamique
          </span>
          <p className="text-[11px] text-zinc-500">
            Coupes posées au calme, nerveuses + punch-in quand ça tape
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={dynamicCut}
          aria-labelledby="dynamicCutLabel"
          disabled={disabled}
          onClick={() => onDynamicCut(!dynamicCut)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            dynamicCut ? "bg-accent" : "bg-ink-600"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              dynamicCut ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
