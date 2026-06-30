"use client";

interface ControlsProps {
  sensitivity: number;
  cutEvery: number;
  onSensitivity: (v: number) => void;
  onCutEvery: (v: number) => void;
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

/** Les deux réglages qui comptent : sensibilité (combien de beats) et nervosité
 *  du montage (couper tous les N beats). Plus les stats live de l'analyse. */
export default function Controls({
  sensitivity,
  cutEvery,
  onSensitivity,
  onCutEvery,
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
            Couper tous les {cutEvery} beat{cutEvery > 1 ? "s" : ""}
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
          1 = nerveux · 4+ = posé
        </p>
      </div>
    </div>
  );
}
