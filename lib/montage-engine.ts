/**
 * montage-engine.ts
 * ----------------------------------------------------------------------------
 * Cœur du produit : détection des beats (sur la bande du kick) + génération
 * d'une "edit decision list" (où couper). Validé dans le prototype, porté ici
 * en TypeScript propre, sans dépendance, sans framework.
 *
 * Navigateur uniquement (utilise Web Audio API). Tourne aussi bien dans un
 * composant React/Next.js que dans un worker. AUCUN export vidéo ici : ce
 * module ne produit que des *données* (temps de beats, points de coupe).
 * C'est ce qui rend la preview instantanée. L'export viendra en Phase 2.
 * ----------------------------------------------------------------------------
 */

export interface Envelope {
  /** Énergie de la bande basse, une valeur par hop. */
  energy: Float32Array;
  /** Flux positif (montées d'énergie) — sert au pic d'onset. */
  flux: Float32Array;
  /** Taille du hop en échantillons. */
  hop: number;
  sampleRate: number;
  duration: number;
}

export interface BeatAnalysis {
  /** Temps des beats détectés, en secondes. */
  beats: number[];
  /** Tempo estimé (replié dans une plage humaine 70–185). */
  bpm: number;
  duration: number;
  sampleRate: number;
}

export interface Cut {
  /** Temps de la coupe, en secondes. */
  time: number;
  /** Index du beat correspondant. */
  beatIndex: number;
}

export interface EDL {
  cuts: Cut[];
  /** On coupe tous les N beats (1 = nerveux, 4 = posé). */
  cutEvery: number;
}

export interface DetectOptions {
  /** Plus haut = moins de beats. Plage utile ~0.8 → 2.6. Défaut 1.45. */
  sensitivity?: number;
  /** Coupure du passe-bas pour isoler le kick (Hz). Défaut 140. */
  lowpassHz?: number;
  /** Période réfractaire mini entre deux beats (s). Défaut 0.16. */
  minIntervalSec?: number;
  /** Fenêtre du seuil adaptatif (s). Défaut 0.6. */
  adaptiveWindowSec?: number;
}

const DEFAULTS: Required<DetectOptions> = {
  sensitivity: 1.45,
  lowpassHz: 140,
  minIntervalSec: 0.16,
  adaptiveWindowSec: 0.6,
};

/* -------------------------------------------------------------------------- */
/* 1. Décodage                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Décode un fichier audio (ArrayBuffer) en AudioBuffer.
 * Passe ton propre AudioContext si tu en as déjà un (recommandé en React).
 */
export async function decodeAudio(
  data: ArrayBuffer,
  ctx?: AudioContext
): Promise<AudioBuffer> {
  const audioCtx =
    ctx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
  // decodeAudioData consomme le buffer : on en passe une copie par sécurité.
  return audioCtx.decodeAudioData(data.slice(0));
}

/* -------------------------------------------------------------------------- */
/* 2. Mixdown mono                                                             */
/* -------------------------------------------------------------------------- */

function toMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i];
  }
  const inv = 1 / buffer.numberOfChannels;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

/* -------------------------------------------------------------------------- */
/* 3. Analyse de l'enveloppe (coûteux — à faire une seule fois)                */
/* -------------------------------------------------------------------------- */

/**
 * Construit l'enveloppe d'énergie de la bande du kick. Sépare la partie lourde
 * (filtrage + énergie) du choix des beats, pour qu'un slider de sensibilité
 * puisse re-piquer les beats sans tout recalculer.
 */
export function analyzeEnvelope(
  buffer: AudioBuffer,
  opts: DetectOptions = {}
): Envelope {
  const o = { ...DEFAULTS, ...opts };
  const sr = buffer.sampleRate;
  const mono = toMono(buffer);

  const hop = Math.max(1, Math.floor(sr * 0.01)); // 10 ms
  const frames = Math.floor(mono.length / hop);

  // Passe-bas un pôle pour isoler le kick (~lowpassHz).
  const a = 1 - Math.exp((-2 * Math.PI * o.lowpassHz) / sr);
  const lp = new Float32Array(mono.length);
  let y = 0;
  for (let i = 0; i < mono.length; i++) {
    y += a * (mono[i] - y);
    lp[i] = y;
  }

  // Énergie RMS par hop.
  const energy = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    const start = i * hop;
    const end = Math.min(start + hop, lp.length);
    for (let j = start; j < end; j++) s += lp[j] * lp[j];
    energy[i] = Math.sqrt(s / (end - start || 1));
  }

  // Flux : montées d'énergie uniquement.
  const flux = new Float32Array(frames);
  for (let i = 1; i < frames; i++) {
    const d = energy[i] - energy[i - 1];
    flux[i] = d > 0 ? d : 0;
  }

  return { energy, flux, hop, sampleRate: sr, duration: buffer.duration };
}

/* -------------------------------------------------------------------------- */
/* 4. Sélection des beats (léger — rappeler à chaque changement de sensibilité)*/
/* -------------------------------------------------------------------------- */

export function pickBeats(env: Envelope, opts: DetectOptions = {}): BeatAnalysis {
  const o = { ...DEFAULTS, ...opts };
  const { energy, flux, hop, sampleRate: sr, duration } = env;
  const frames = energy.length;

  const win = Math.round(o.adaptiveWindowSec / (hop / sr));
  const minGap = Math.round(o.minIntervalSec / (hop / sr));
  const beats: number[] = [];
  let last = -Infinity;

  for (let i = 1; i < frames - 1; i++) {
    const lo = Math.max(0, i - win);
    const hi = Math.min(frames, i + win);
    let mean = 0;
    for (let j = lo; j < hi; j++) mean += energy[j];
    mean /= hi - lo;

    const threshold = mean * o.sensitivity;
    const isLocalMax = energy[i] >= energy[i - 1] && energy[i] > energy[i + 1];

    if (energy[i] > threshold && isLocalMax && flux[i] > 0 && i - last >= minGap) {
      beats.push((i * hop) / sr);
      last = i;
    }
  }

  return { beats, bpm: estimateBPM(beats), duration, sampleRate: sr };
}

/* -------------------------------------------------------------------------- */
/* 5. Convenience : analyse complète en un appel                               */
/* -------------------------------------------------------------------------- */

export function detectBeats(
  buffer: AudioBuffer,
  opts: DetectOptions = {}
): BeatAnalysis {
  return pickBeats(analyzeEnvelope(buffer, opts), opts);
}

/* -------------------------------------------------------------------------- */
/* 6. Tempo                                                                    */
/* -------------------------------------------------------------------------- */

/** Médiane des intervalles inter-beats, repliée dans une plage humaine. */
export function estimateBPM(beats: number[]): number {
  if (beats.length < 4) return 0;
  const ibi: number[] = [];
  for (let i = 1; i < beats.length; i++) ibi.push(beats[i] - beats[i - 1]);
  ibi.sort((a, b) => a - b);
  const median = ibi[Math.floor(ibi.length / 2)];
  let bpm = 60 / median;
  while (bpm < 70) bpm *= 2;
  while (bpm > 185) bpm /= 2;
  return bpm;
}

/* -------------------------------------------------------------------------- */
/* 7. Edit Decision List : où couper                                           */
/* -------------------------------------------------------------------------- */

/**
 * Transforme l'analyse en points de coupe. C'est l'objet que le moteur de
 * preview ET (plus tard) le moteur d'export consomment. Garde-le pur :
 * des données, pas de pixels.
 */
export function buildEDL(analysis: BeatAnalysis, cutEvery = 2): EDL {
  const step = Math.max(1, Math.floor(cutEvery));
  const cuts: Cut[] = [];
  analysis.beats.forEach((time, beatIndex) => {
    if (beatIndex % step === 0) cuts.push({ time, beatIndex });
  });
  return { cuts, cutEvery: step };
}

/**
 * Assigne une source (clip) à chaque segment entre deux coupes.
 * Renvoie des segments [start, end, sourceIndex] prêts à driver la preview.
 */
export function assignClipsToCuts(
  edl: EDL,
  sourceCount: number,
  duration: number
): { start: number; end: number; sourceIndex: number }[] {
  if (sourceCount <= 0) sourceCount = 1;
  const times = edl.cuts.map((c) => c.time);
  const segments: { start: number; end: number; sourceIndex: number }[] = [];
  for (let i = 0; i < times.length; i++) {
    const start = times[i];
    const end = i + 1 < times.length ? times[i + 1] : duration;
    segments.push({ start, end, sourceIndex: i % sourceCount });
  }
  return segments;
}
