/**
 * preview.ts
 * ----------------------------------------------------------------------------
 * Petites fonctions pures qui font le pont entre l'EDL (données) et la preview
 * (pixels). On garde le moteur (`montage-engine.ts`) sans dépendance au DOM ;
 * tout ce qui touche au <canvas> / aux temps d'affichage vit ici.
 * ----------------------------------------------------------------------------
 */

import type { EnergyZone } from "./montage-engine";

/** Un segment de montage = un morceau de timeline montrant un clip donné. */
export interface Segment {
  start: number;
  end: number;
  sourceIndex: number;
  /**
   * Point d'entrée dans le clip source (s) : où seek la vidéo au début du
   * segment. Absent/0 tant que la durée du clip n'est pas connue.
   */
  inPoint?: number;
  /** Énergie moyenne normalisée (0-1) du morceau sur ce segment. */
  energy?: number;
  /** Zone d'énergie de la coupe qui ouvre ce segment (montage dynamique). */
  zone?: EnergyZone;
  /** Comment on ENTRE dans ce segment. Absent = coupe franche. */
  transition?: "cut" | "crossfade";
}

/** Un clip vidéo importé par l'utilisateur. */
export interface Clip {
  id: string;
  name: string;
  url: string;
}

/**
 * Calcule le point d'entrée de chaque segment dans son clip source.
 * Politique actuelle : proportionnel — la position du segment dans le montage
 * est reportée dans la durée du clip (un segment à 50 % du morceau démarre à
 * 50 % du clip). Clampé pour que le segment tienne avant la fin du clip quand
 * c'est possible ; sinon 0 (le slot vidéo boucle si le clip est trop court).
 * Durée de clip inconnue (métadonnées pas chargées, WebM sans durée) → 0.
 */
export function computeInPoints(
  segments: Segment[],
  clipDurations: Array<number | undefined>,
  montageDuration: number
): Segment[] {
  return segments.map((s) => {
    const dur = clipDurations[s.sourceIndex];
    if (
      !dur ||
      !Number.isFinite(dur) ||
      dur <= 0 ||
      !Number.isFinite(montageDuration) ||
      montageDuration <= 0
    ) {
      return { ...s, inPoint: 0 };
    }
    const segLen = Math.max(0, s.end - s.start);
    const raw = (s.start / montageDuration) * dur;
    const maxIn = Math.max(0, dur - segLen);
    return { ...s, inPoint: Math.min(raw, maxIn) };
  });
}

/**
 * En zone low uniquement, remplace une coupe sur `everyNth` par un fondu
 * enchaîné : le 2e, 4e… segment low (dans l'ordre de la timeline) est marqué
 * `transition: "crossfade"`. Annotation de présentation — l'EDL ne change pas.
 * Le tout premier segment low garde une coupe franche (rien à fondre avant).
 */
export function assignTransitions(
  segments: Segment[],
  everyNth = 2
): Segment[] {
  const n = Math.max(1, Math.floor(everyNth));
  let lowSeen = 0;
  return segments.map((s) => {
    if (s.zone !== "low") return s;
    lowSeen++;
    return lowSeen % n === 0 ? { ...s, transition: "crossfade" as const } : s;
  });
}

/**
 * Index du segment actif pour le temps `t`. Optimisé pour la lecture : on part
 * d'un indice « indice » (le dernier connu) et on avance/recule de proche en
 * proche, ce qui rend le cas « frame suivante » en O(1). Retombe sur une
 * recherche linéaire bornée si l'indice de départ est loin (ex. après un seek).
 *
 * Renvoie -1 si `segments` est vide ou si `t` précède le premier segment.
 */
export function findSegmentIndex(
  segments: Segment[],
  t: number,
  hint = 0
): number {
  const n = segments.length;
  if (n === 0) return -1;

  let i = hint;
  if (i < 0) i = 0;
  if (i > n - 1) i = n - 1;

  // Avance tant que t dépasse la fin du segment courant.
  while (i < n - 1 && t >= segments[i].end) i++;
  // Recule tant que t précède le début du segment courant (cas seek arrière).
  while (i > 0 && t < segments[i].start) i--;

  // Avant le tout premier segment : rien à montrer.
  if (t < segments[0].start) return -1;
  return i;
}

/**
 * Dessine une frame vidéo sur le canvas en mode « cover » (remplit tout le
 * cadre, recadre au centre, garde le ratio). `zoom` > 1 agrandit autour du
 * centre (punch-in). Ne fait rien si la vidéo n'a pas encore de dimensions
 * (métadonnées non chargées).
 */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  cw: number,
  ch: number,
  zoom = 1
): boolean {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return false;

  const scale = Math.max(cw / vw, ch / vh) * zoom;
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  ctx.drawImage(video, dx, dy, dw, dh);
  return true;
}

/** Formate un nombre de secondes en `m:ss` (ou `m:ss.d` avec décimales). */
export function formatTime(sec: number, decimals = 0): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  if (decimals > 0) {
    const ss = s.toFixed(decimals).padStart(3 + decimals, "0");
    return `${m}:${ss}`;
  }
  return `${m}:${Math.floor(s).toString().padStart(2, "0")}`;
}
