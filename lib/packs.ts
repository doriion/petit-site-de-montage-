/**
 * packs.ts
 * ----------------------------------------------------------------------------
 * Packs de styles : un nom, une description d'une ligne, une config d'effets
 * complète, une cadence de base suggérée et des options visuelles de pack
 * (pour l'instant : letterbox). Choisir un pack applique tout ça d'un coup —
 * c'est un point de départ, pas un verrou : les réglages fins restent
 * modifiables par-dessus. Tous gratuits pour l'instant.
 * ----------------------------------------------------------------------------
 */

import { DEFAULT_EFFECTS, type EffectsConfig } from "./effects";

export interface StylePack {
  id: string;
  name: string;
  /** Une ligne, affichée sous le nom dans la carte du sélecteur. */
  description: string;
  effects: EffectsConfig;
  /** Cadence de base appliquée au choix du pack (modifiable ensuite). */
  baseCutEvery: number;
  /** Deux bandes noires (~12 % de la hauteur chacune) sur le canvas,
   *  preview ET export. */
  letterbox: boolean;
}

export const STYLE_PACKS: StylePack[] = [
  {
    id: "classique",
    name: "Classique",
    description: "L'équilibre par défaut : punch et flash sur les moments forts.",
    effects: DEFAULT_EFFECTS,
    baseCutEvery: 2,
    letterbox: false,
  },
  {
    id: "nerveux",
    name: "Nerveux",
    description: "Coupes sèches à chaque beat, secousses appuyées — pour les drops.",
    effects: {
      ...DEFAULT_EFFECTS,
      zoneFlash: { opacity: 0.75, decay: DEFAULT_EFFECTS.zoneFlash.decay },
      punchIn: { zoom: 0.08, decay: DEFAULT_EFFECTS.punchIn.decay },
      shake: { amplitudePx: 10, durationMs: 250 },
      // everyNth ≤ 0 = jamais de fondu, même en zone calme.
      crossfade: { ...DEFAULT_EFFECTS.crossfade, everyNth: 0 },
    },
    baseCutEvery: 1,
    letterbox: false,
  },
  {
    id: "chill",
    name: "Chill",
    description: "Tout en douceur : fondus longs, aucun effet brusque.",
    effects: {
      ...DEFAULT_EFFECTS,
      zoneFlash: { opacity: 0, decay: DEFAULT_EFFECTS.zoneFlash.decay },
      punchIn: { zoom: 0, decay: DEFAULT_EFFECTS.punchIn.decay },
      shake: { amplitudePx: 0, durationMs: 0 },
      // Toutes les coupes calmes deviennent des fondus, plus amples.
      crossfade: { durationMs: 400, everyNth: 1 },
    },
    baseCutEvery: 4,
    letterbox: false,
  },
  {
    id: "cinema",
    name: "Cinéma",
    description: "Letterbox, fondus amples, effets discrets — ambiance bande-annonce.",
    effects: {
      ...DEFAULT_EFFECTS,
      zoneFlash: { opacity: 0.3, decay: DEFAULT_EFFECTS.zoneFlash.decay },
      punchIn: { zoom: 0.03, decay: DEFAULT_EFFECTS.punchIn.decay },
      shake: { amplitudePx: 0, durationMs: 0 },
      crossfade: { durationMs: 500, everyNth: 2 },
    },
    baseCutEvery: 2,
    letterbox: true,
  },
];

export const DEFAULT_PACK_ID = "classique";

export function getPack(id: string): StylePack {
  return STYLE_PACKS.find((p) => p.id === id) ?? STYLE_PACKS[0];
}

/** Hauteur de CHAQUE bande noire, en ratio de la hauteur du canvas. */
export const LETTERBOX_RATIO = 0.12;

/**
 * Deux bandes noires opaques, haut et bas. À dessiner APRÈS la frame vidéo
 * (et après le flash, pour que les bandes restent d'un noir franc) ; le
 * filigrane d'export se dessine par-dessus, donc reste lisible sur la bande.
 */
export function drawLetterbox(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  ratio = LETTERBOX_RATIO
): void {
  const bar = Math.round(height * ratio);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, bar);
  ctx.fillRect(0, height - bar, width, bar);
}
