/**
 * explain.ts
 * ----------------------------------------------------------------------------
 * La couche pédagogique : une phrase courte, en français, qui explique la
 * décision de montage d'un segment à partir de ses données (zone, énergie,
 * cadence appliquée, transition, effets). Pur template — pas d'IA, pas de
 * réseau — donc instantané et testable. La formulation varie selon l'index du
 * segment pour ne pas répéter la même phrase en boucle.
 * ----------------------------------------------------------------------------
 */

import type { Segment } from "./preview";
import { zoneStep, type EnergyZone } from "./montage-engine";

export interface ExplainContext {
  /** Index du segment (sert à varier les formulations, déterministe). */
  index: number;
  /** Cadence de base (le slider). */
  baseCutEvery: number;
  /** Montage dynamique actif ? */
  dynamic: boolean;
  /** Zone du segment précédent (pour repérer les entrées de drop). */
  prevZone?: EnergyZone;
}

const pct = (e?: number) => Math.round((e ?? 0.5) * 100);
const cad = (step: number) =>
  step === 1 ? "à chaque beat" : `tous les ${step} beats`;

export function explainSegment(seg: Segment, ctx: ExplainContext): string {
  const pick = (variants: string[]) => variants[ctx.index % variants.length];
  const base = Math.max(1, Math.floor(ctx.baseCutEvery));

  // Cadence fixe (toggle off) ou pas d'info d'énergie : rien à raconter côté
  // musique, on explique le réglage.
  if (!ctx.dynamic || !seg.zone) {
    return pick([
      `Cadence fixe : une coupe ${cad(base)} — l'énergie du morceau n'influe pas ici.`,
      `Montage métronome — coupe ${cad(base)}, comme réglé à la main.`,
    ]);
  }

  const step = zoneStep(seg.zone, base);
  const e = pct(seg.energy);

  if (seg.transition === "crossfade") {
    return pick([
      `Fondu enchaîné — la musique retombe (énergie ${e} %), on adoucit le passage au lieu de couper sec.`,
      `Moment calme : ici la coupe devient un fondu rapide, pour laisser respirer.`,
      `Transition douce — en zone calme, une coupe sur deux se fond (énergie ${e} %).`,
    ]);
  }

  switch (seg.zone) {
    case "low":
      return pick([
        `Coupe posée — la musique retombe (énergie ${e} %), on laisse le plan respirer : coupe ${cad(step)}.`,
        `Passage calme : cadence ralentie (base ×2), une coupe ${cad(step)}.`,
        `On souffle — énergie ${e} %, les plans durent plus longtemps (${cad(step)}).`,
      ]);
    case "high":
      if (ctx.prevZone === "low" || ctx.prevZone === "mid") {
        return pick([
          `Entrée dans un passage fort : flash + coupe nerveuse (${cad(step)}) pour marquer le drop.`,
          `Le morceau décolle (énergie ${e} %) — flash blanc, punch-in et cadence accélérée.`,
        ]);
      }
      return pick([
        `Ça tape (énergie ${e} %) : coupes rapprochées ${cad(step)}, punch-in et micro-secousse.`,
        `Toujours dans le fort — cadence nerveuse (${cad(step)}), punch-in à chaque coupe.`,
      ]);
    default:
      return pick([
        `Énergie moyenne (${e} %) : cadence de croisière, une coupe ${cad(step)}.`,
        `Le morceau avance sans forcer — coupe standard ${cad(step)}.`,
        `Zone médiane : on garde la cadence de base, ${cad(step)}.`,
      ]);
  }
}
