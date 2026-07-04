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
import { DEFAULT_EFFECTS, type EffectsConfig } from "./effects";

export interface ExplainContext {
  /** Index du segment (sert à varier les formulations, déterministe). */
  index: number;
  /** Cadence de base (le slider). */
  baseCutEvery: number;
  /** Montage dynamique actif ? */
  dynamic: boolean;
  /** Zone du segment précédent (pour repérer les entrées de drop). */
  prevZone?: EnergyZone;
  /** Config d'effets active — on ne revendique que ce qui se voit vraiment. */
  effects?: EffectsConfig;
  /** Nom du pack actif, mentionné quand il change le comportement. */
  packName?: string;
}

const pct = (e?: number) => Math.round((e ?? 0.5) * 100);
const cad = (step: number) =>
  step === 1 ? "à chaque beat" : `tous les ${step} beats`;

export function explainSegment(seg: Segment, ctx: ExplainContext): string {
  return baseExplanation(seg, ctx) + motionMention(seg, ctx.index);
}

/**
 * Mention ajoutée quand le point d'entrée dans le clip a été choisi par
 * l'analyse de mouvement (et pas par le repli proportionnel ni à la main).
 */
function motionMention(seg: Segment, index: number): string {
  if (seg.inPointPick !== "motion") return "";
  const pick = (variants: string[]) => variants[index % variants.length];
  if (seg.zone === "high") {
    return (
      " " +
      pick([
        "Passage choisi parce qu'il bouge — on le cale sur le moment fort.",
        "Le plan démarre sur un moment du clip qui bouge.",
      ])
    );
  }
  return (
    " " +
    pick([
      "Un passage calme du clip a été choisi pour coller à l'accalmie.",
      "Le plan démarre sur un moment posé du clip.",
    ])
  );
}

function baseExplanation(seg: Segment, ctx: ExplainContext): string {
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

  // Le pack peut désactiver des effets : on ne décrit que ce qui se voit.
  const cfg = ctx.effects ?? DEFAULT_EFFECTS;
  const packName = ctx.packName ?? "Classique";
  const punchOn = cfg.punchIn.zoom > 0;
  const flashOn = cfg.zoneFlash.opacity > 0;
  const shakeOn = cfg.shake.amplitudePx > 0 && cfg.shake.durationMs > 0;

  if (seg.transition === "crossfade") {
    return pick([
      `Fondu enchaîné — la musique retombe (énergie ${e} %), on adoucit le passage au lieu de couper sec.`,
      `Moment calme : ici la coupe devient un fondu, pour laisser respirer.`,
      `Transition douce — en zone calme, la coupe se fond (énergie ${e} %).`,
    ]);
  }

  switch (seg.zone) {
    case "low": {
      const text = pick([
        `Coupe posée — la musique retombe (énergie ${e} %), on laisse le plan respirer : coupe ${cad(step)}.`,
        `Passage calme : cadence ralentie (base ×2), une coupe ${cad(step)}.`,
        `On souffle — énergie ${e} %, les plans durent plus longtemps (${cad(step)}).`,
      ]);
      // Fondus désactivés par le style : la coupe reste sèche même au calme.
      if (cfg.crossfade.everyNth <= 0) {
        return `${text} Coupe sèche même au calme — signature du style ${packName}.`;
      }
      return text;
    }
    case "high": {
      const entering = ctx.prevZone === "low" || ctx.prevZone === "mid";
      const fxNames = [
        entering && flashOn ? "flash" : null,
        punchOn ? "punch-in" : null,
        shakeOn ? "micro-secousse" : null,
      ].filter((x): x is string => x !== null);

      if (fxNames.length === 0) {
        // Le style a tout adouci : on le dit, plutôt que de mentir.
        return pick([
          `Passage fort (énergie ${e} %) : cadence rapide (${cad(step)}), mais pas de flash ici — le style ${packName} adoucit tout.`,
          `Ça monte (énergie ${e} %) — coupes ${cad(step)}, sans effet appuyé : le style ${packName} reste doux.`,
        ]);
      }
      const fx = fxNames.join(" + ");
      if (entering) {
        return pick([
          `Entrée dans un passage fort : ${fx} et coupe nerveuse (${cad(step)}) pour marquer le drop.`,
          `Le morceau décolle (énergie ${e} %) — ${fx}, cadence accélérée.`,
        ]);
      }
      return pick([
        `Ça tape (énergie ${e} %) : coupes rapprochées ${cad(step)}, ${fx}.`,
        `Toujours dans le fort — cadence nerveuse (${cad(step)}), ${fx} à chaque coupe.`,
      ]);
    }
    default:
      return pick([
        `Énergie moyenne (${e} %) : cadence de croisière, une coupe ${cad(step)}.`,
        `Le morceau avance sans forcer — coupe standard ${cad(step)}.`,
        `Zone médiane : on garde la cadence de base, ${cad(step)}.`,
      ]);
  }
}
