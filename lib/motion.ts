/**
 * motion.ts
 * ----------------------------------------------------------------------------
 * Analyse de mouvement des clips (Milestone 5) : ~24 échantillons uniformes
 * du clip, dessinés en 64×36, différence absolue moyenne entre échantillons
 * consécutifs → courbe de mouvement 0-1 (même normalisation percentile que
 * l'énergie audio). Le choix des points d'entrée s'en sert : zone high →
 * fenêtre qui bouge, zone low → fenêtre calme, mid → indifférent
 * (proportionnel conservé). Fallback proportionnel tant que l'analyse n'est
 * pas finie ou si elle échoue.
 *
 * L'analyse tourne sur UN SEUL <video> de travail, séquentiellement (jamais
 * deux clips en parallèle — limite mobile), et de façon asynchrone : la
 * preview reste utilisable pendant ce temps.
 * ----------------------------------------------------------------------------
 */

import type { Segment } from "./preview";
import type { EnergyZone } from "./montage-engine";

const SAMPLE_COUNT = 24;
const SAMPLE_W = 64;
const SAMPLE_H = 36;
const STEP_TIMEOUT_MS = 6000;
/** Tolérance : une fenêtre qui démarre à peine trop tard reste éligible. */
const WINDOW_LATE_TOLERANCE_S = 0.25;

export interface ClipMotion {
  /** Mouvement normalisé 0-1 par fenêtre (N-1 valeurs pour N échantillons). */
  level: Float32Array;
  /** Début de chaque fenêtre dans le clip (s). */
  windowStart: Float32Array;
  duration: number;
}

/* -------------------------------------------------------------------------- */
/* Parties pures (testables sans DOM)                                          */
/* -------------------------------------------------------------------------- */

/** Différence absolue moyenne entre deux frames RGBA (canaux RGB). */
export function meanAbsDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i += 4) {
    sum +=
      Math.abs(a[i] - b[i]) +
      Math.abs(a[i + 1] - b[i + 1]) +
      Math.abs(a[i + 2] - b[i + 2]);
    count += 3;
  }
  return count ? sum / count : 0;
}

/**
 * Normalise les différences en 0-1 par percentiles p10/p90 (même logique que
 * l'énergie audio). Un clip quasi statique renvoie 0.5 partout plutôt que
 * d'amplifier son bruit en fausses variations.
 */
export function normalizeMotion(diffs: number[]): Float32Array {
  const n = diffs.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  const sorted = [...diffs].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(0.1 * (n - 1))];
  const p50 = sorted[Math.floor(0.5 * (n - 1))];
  const p90 = sorted[Math.floor(0.9 * (n - 1))];
  const range = p90 - p10;
  if (range <= 0.1 * p50 + 1e-9) {
    out.fill(0.5);
    return out;
  }
  for (let i = 0; i < n; i++) {
    const v = (diffs[i] - p10) / range;
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return out;
}

/** Mouvement (0-1) autour de l'instant `t` du clip. */
export function motionAtTime(motion: ClipMotion, t: number): number {
  const n = motion.level.length;
  if (n === 0) return 0.5;
  let i = 0;
  while (i < n - 1 && motion.windowStart[i + 1] <= t) i++;
  return motion.level[i];
}

/**
 * Choisit la fenêtre du clip pour un segment : high → mouvement maximal,
 * low → minimal, mid/inconnu → null (le proportionnel reste). `lastWindow`
 * (dernière fenêtre servie pour CE clip) est écartée si un autre choix
 * existe — variété. Les fenêtres trop tardives pour contenir le segment sont
 * exclues, et l'inPoint est clampé pour que le segment tienne dans le clip.
 */
export function pickMotionInPoint(
  motion: ClipMotion,
  zone: EnergyZone | undefined,
  segLen: number,
  lastWindow?: number
): { inPoint: number; windowIndex: number; motionScore: number } | null {
  if (zone !== "high" && zone !== "low") return null;
  const n = motion.level.length;
  if (n === 0) return null;
  const maxIn = Math.max(0, motion.duration - segLen);

  const pick = (excludeLast: boolean): number => {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < n; i++) {
      if (excludeLast && i === lastWindow) continue;
      if (motion.windowStart[i] > maxIn + WINDOW_LATE_TOLERANCE_S) continue;
      const score = zone === "high" ? motion.level[i] : 1 - motion.level[i];
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  };

  let best = pick(true);
  if (best === -1) best = pick(false); // seule la dernière fenêtre est éligible
  if (best === -1) return null;
  return {
    inPoint: Math.min(motion.windowStart[best], maxIn),
    windowIndex: best,
    motionScore: motion.level[best],
  };
}

/**
 * Remplace les points d'entrée proportionnels par des choix guidés par le
 * mouvement, quand la courbe du clip est disponible. À appeler APRÈS
 * computeInPoints (le proportionnel sert de repli par segment) et AVANT les
 * overrides manuels (qui gardent la priorité).
 */
export function applyMotionInPoints(
  segments: Segment[],
  motions: Array<ClipMotion | null | undefined>
): Segment[] {
  const lastWindow = new Map<number, number>();
  return segments.map((s) => {
    const motion = motions[s.sourceIndex];
    if (!motion) return s; // analyse en cours ou échouée → proportionnel
    const segLen = Math.max(0, s.end - s.start);
    const picked = pickMotionInPoint(
      motion,
      s.zone,
      segLen,
      lastWindow.get(s.sourceIndex)
    );
    if (!picked) {
      // mid / pas de zone : proportionnel conservé, mouvement local exposé.
      return {
        ...s,
        motion: motionAtTime(motion, s.inPoint ?? 0),
        inPointPick: "proportional" as const,
      };
    }
    lastWindow.set(s.sourceIndex, picked.windowIndex);
    return {
      ...s,
      inPoint: picked.inPoint,
      motion: picked.motionScore,
      inPointPick: "motion" as const,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Analyseur (DOM — client uniquement)                                         */
/* -------------------------------------------------------------------------- */

function waitEvent(
  el: HTMLMediaElement,
  event: string,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const onEvent = () => finish(true);
    const onError = () => finish(false);
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    function finish(ok: boolean) {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      el.removeEventListener(event, onEvent);
      el.removeEventListener("error", onError);
      resolve(ok);
    }
    el.addEventListener(event, onEvent, { once: true });
    el.addEventListener("error", onError, { once: true });
  });
}

/**
 * Un seul <video> de travail + un canvas 64×36, et une file : les analyses
 * s'enchaînent, jamais en parallèle. `analyze` résout null si le clip est
 * illisible / sans durée / trop court — l'appelant garde alors le repli
 * proportionnel.
 */
export class MotionAnalyzer {
  private video: HTMLVideoElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  analyze(url: string, samples = SAMPLE_COUNT): Promise<ClipMotion | null> {
    const job = this.queue.then(() => this.run(url, samples));
    this.queue = job.catch(() => null);
    return job;
  }

  private ensure(): { v: HTMLVideoElement; ctx: CanvasRenderingContext2D } | null {
    if (!this.video) {
      const v = document.createElement("video");
      v.muted = true;
      v.setAttribute("playsinline", "");
      v.preload = "auto";
      this.video = v;
      const canvas = document.createElement("canvas");
      canvas.width = SAMPLE_W;
      canvas.height = SAMPLE_H;
      this.ctx = canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!this.video || !this.ctx) return null;
    return { v: this.video, ctx: this.ctx };
  }

  private async run(url: string, samples: number): Promise<ClipMotion | null> {
    const env = this.ensure();
    if (!env) return null;
    const { v, ctx } = env;
    try {
      v.src = url;
      if (!(await waitEvent(v, "loadedmetadata", STEP_TIMEOUT_MS))) return null;
      const dur = v.duration;
      if (!Number.isFinite(dur) || dur < 0.4) return null;

      const diffs: number[] = [];
      const starts: number[] = [];
      let prev: Uint8ClampedArray | null = null;
      let prevT = 0;
      for (let i = 0; i < samples; i++) {
        const t = Math.min(dur - 0.05, (dur * (i + 0.5)) / samples);
        v.currentTime = t;
        if (!(await waitEvent(v, "seeked", STEP_TIMEOUT_MS))) return null;
        ctx.drawImage(v, 0, 0, SAMPLE_W, SAMPLE_H);
        const data = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
        if (prev) {
          diffs.push(meanAbsDiff(prev, data));
          starts.push(prevT);
        }
        prev = data;
        prevT = t;
      }
      return {
        level: normalizeMotion(diffs),
        windowStart: Float32Array.from(starts),
        duration: dur,
      };
    } catch (e) {
      console.error("Analyse de mouvement échouée :", e);
      return null;
    } finally {
      // Libère le décodeur entre deux clips (mobile).
      v.removeAttribute("src");
      v.load();
    }
  }
}
