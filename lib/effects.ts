/**
 * effects.ts
 * ----------------------------------------------------------------------------
 * Vocabulaire d'effets de la preview, piloté par l'énergie. Tout est regroupé
 * dans un objet de config (intensités, durées) : les futurs « packs » d'effets
 * ne seront que des variantes de cet objet. La règle : marquer les moments
 * forts, pas saturer.
 *
 * - cutFlash  : le voile discret existant sur chaque coupe franche (DOM).
 * - zoneFlash : flash blanc bref (1-2 frames) UNIQUEMENT quand une coupe fait
 *               entrer en zone high depuis une zone plus basse.
 * - punchIn   : zoom bref sur les coupes en zone high.
 * - shake     : micro-secousse (translation aléatoire décroissante) sur les
 *               coupes en zone high — cumulable avec le punch-in, dont la
 *               marge de zoom couvre les bords déplacés.
 * - crossfade : en zone low, une coupe sur `everyNth` devient un fondu
 *               enchaîné rapide (les deux slots du double-buffer dessinés en
 *               alpha croisé).
 * ----------------------------------------------------------------------------
 */

import type { EnergyZone } from "./montage-engine";

export interface EffectsConfig {
  /** Voile sur chaque coupe franche (overlay DOM, mix-blend). */
  cutFlash: { opacity: number; decay: number };
  /** Flash blanc d'entrée en zone high (canvas). Décroissance très rapide. */
  zoneFlash: { opacity: number; decay: number };
  /** Punch-in sur les coupes high. */
  punchIn: { zoom: number; decay: number };
  /** Micro-secousse sur les coupes high. */
  shake: { amplitudePx: number; durationMs: number };
  /** Fondu enchaîné en zone low, une coupe sur everyNth. */
  crossfade: { durationMs: number; everyNth: number };
}

export const DEFAULT_EFFECTS: EffectsConfig = {
  cutFlash: { opacity: 0.85, decay: 0.82 },
  zoneFlash: { opacity: 0.6, decay: 0.45 },
  punchIn: { zoom: 0.05, decay: 0.88 },
  shake: { amplitudePx: 6, durationMs: 200 },
  crossfade: { durationMs: 250, everyNth: 2 },
};

/** Ce qu'une coupe déclenche, selon la zone quittée et la zone atteinte. */
export interface CutFx {
  /** Surplus de zoom à appliquer (0 = pas de punch-in). */
  punch: number;
  /** Durée de secousse à lancer (0 = pas de secousse). */
  shakeMs: number;
  /** Opacité du flash blanc d'entrée en high (0 = pas de flash). */
  flash: number;
}

/**
 * Décide des effets d'une coupe. Pur : facile à tester et à faire varier par
 * pack. Le flash blanc ne part QUE sur une entrée en high depuis une zone
 * plus basse — pas sur les coupes high→high, ni sans info de zone (mode fixe).
 */
export function effectsForCut(
  prevZone: EnergyZone | undefined,
  zone: EnergyZone | undefined,
  cfg: EffectsConfig
): CutFx {
  const high = zone === "high";
  return {
    punch: high ? cfg.punchIn.zoom : 0,
    shakeMs: high ? cfg.shake.durationMs : 0,
    flash:
      high && (prevZone === "low" || prevZone === "mid")
        ? cfg.zoneFlash.opacity
        : 0,
  };
}
