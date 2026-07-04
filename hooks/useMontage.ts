"use client";

/**
 * useMontage
 * ----------------------------------------------------------------------------
 * Tout l'état + la boucle de rendu de la preview, dans un seul hook. Le moteur
 * (`montage-engine.ts`) reste pur ; ici on branche le DOM : décodage, analyse,
 * lecture audio comme horloge maître, et compositing des clips sur un <canvas>
 * qui « coupe » sur les beats.
 *
 * Lecture par segment (double-buffer, voir `lib/player.ts`) : au plus DEUX
 * <video> actives. Le slot courant joue le clip du segment actif, seeké à son
 * `inPoint` ; l'autre slot précharge + seek le clip du segment suivant pendant
 * ce temps, pour une coupe instantanée. Les vignettes de la ClipTray ne jouent
 * jamais (métadonnées seulement) — compatible mobile.
 *
 * Principe de perf :
 *  - `analyzeEnvelope` (lourd) ne tourne qu'une fois par morceau.
 *  - `pickBeats` (léger) re-tourne à chaque changement de sensibilité.
 *  - La boucle requestAnimationFrame écrit playhead/canvas en DOM direct
 *    (pas de setState à 60 fps).
 * ----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeEnvelope,
  assignClipsToCuts,
  buildDynamicEDL,
  buildEDL,
  computeEnergyCurve,
  decodeAudio,
  energyBetween,
  pickBeats,
  type BeatAnalysis,
  type EnergyCurve,
  type Envelope,
} from "@/lib/montage-engine";
import {
  applyClipOverrides,
  applyInPointOverrides,
  assignTransitions,
  computeInPoints,
  drawCover,
  findSegmentIndex,
  formatTime,
  structureSignature,
  type Clip,
  type Segment,
  type SegmentOverride,
} from "@/lib/preview";
import { VideoSlot } from "@/lib/player";
import { DEFAULT_EFFECTS, effectsForCut } from "@/lib/effects";

export type Status = "idle" | "analyzing" | "ready" | "error";

export interface AudioMeta {
  name: string;
  duration: number;
}

const RENDER_W = 1280;
const RENDER_H = 720;

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function useMontage() {
  /* ----------------------------- état exposé ----------------------------- */
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [audioMeta, setAudioMeta] = useState<AudioMeta | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [clipDurations, setClipDurations] = useState<Map<string, number>>(
    () => new Map()
  );
  const [analysis, setAnalysis] = useState<BeatAnalysis | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  // Retouches par segment (panneau d'inspection), stockées À PART des
  // segments générés. Réappliquées à chaque re-calcul tant que la structure
  // (les temps de coupe) ne change pas.
  const [overrides, setOverrides] = useState<Map<number, SegmentOverride>>(
    () => new Map()
  );
  const [sensitivity, setSensitivity] = useState(1.45);
  const [cutEvery, setCutEvery] = useState(2);
  const [dynamicCut, setDynamicCut] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  /* --------------------------------- refs -------------------------------- */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const envelopeRef = useRef<Envelope | null>(null);
  const curveRef = useRef<EnergyCurve | null>(null);
  const structureSigRef = useRef("");

  // Les deux slots de lecture (voir lib/player.ts). Init paresseuse.
  const slotsRef = useRef<[VideoSlot, VideoSlot] | null>(null);
  if (!slotsRef.current) slotsRef.current = [new VideoSlot(), new VideoSlot()];
  const currentSlotIdxRef = useRef(0);

  // Miroirs des états lus dans la boucle RAF (évite de relancer la boucle).
  const segmentsRef = useRef<Segment[]>([]);
  const clipsRef = useRef<Clip[]>([]);
  const audioUrlRef = useRef<string | null>(null);
  const durationRef = useRef(0);
  const segIndexRef = useRef(-1);
  const flashOpacityRef = useRef(0);
  const punchZoomRef = useRef(0); // punch-in : surplus de zoom, décroît à chaque frame

  // Vocabulaire d'effets (voir lib/effects.ts). Ref pour les futurs packs.
  const effectsRef = useRef(DEFAULT_EFFECTS);
  const zoneFlashRef = useRef(0); // flash blanc d'entrée en zone high (canvas)
  const shakeUntilRef = useRef(0); // fin de la micro-secousse (performance.now)
  const fadeRef = useRef<{
    fromSlot: number;
    toIdx: number;
    start: number;
  } | null>(null); // fondu enchaîné en cours
  const rafRef = useRef(0);
  const playingRef = useRef(false);
  const renderFrameRef = useRef<() => void>(() => {});

  /* ------------------------- refs DOM des slots --------------------------- */
  const slotARef = useCallback((el: HTMLVideoElement | null) => {
    slotsRef.current?.[0].attach(el);
  }, []);
  const slotBRef = useCallback((el: HTMLVideoElement | null) => {
    slotsRef.current?.[1].attach(el);
  }, []);

  /* --------------------------- audio context ----------------------------- */
  const getAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtxRef.current = new Ctor();
    }
    return audioCtxRef.current;
  }, []);

  /* ------------------------------ boucle RAF ------------------------------ */
  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    const tick = () => {
      renderFrameRef.current();
      if (playingRef.current) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopLoop]);

  /* ------------------------------- arrêt ---------------------------------- */
  const stop = useCallback(() => {
    audioRef.current?.pause();
    slotsRef.current?.forEach((s) => s.el?.pause());
    playingRef.current = false;
    stopLoop();
    setIsPlaying(false);
  }, [stopLoop]);

  /* ----------------------------- chargement ------------------------------ */
  const loadAudio = useCallback(
    async (file: File) => {
      stop();
      setError(null);
      setStatus("analyzing");
      segIndexRef.current = -1;
      try {
        const buf = await file.arrayBuffer();
        const audioBuffer = await decodeAudio(buf, getAudioCtx());
        const env = analyzeEnvelope(audioBuffer);
        envelopeRef.current = env;
        curveRef.current = computeEnergyCurve(env);
        durationRef.current = audioBuffer.duration;

        // Premier pick tout de suite (l'effet [sensitivity] gérera la suite).
        const a = pickBeats(env, { sensitivity });
        setAnalysis(a);

        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(file);
        });
        setAudioMeta({ name: file.name, duration: audioBuffer.duration });
        setStatus("ready");
      } catch (e) {
        console.error(e);
        setError(
          "Impossible de décoder ce fichier audio. Essaie un MP3 / WAV / M4A."
        );
        setStatus("error");
      }
    },
    [getAudioCtx, sensitivity, stop]
  );

  /* ------------------------------- clips --------------------------------- */
  const addClips = useCallback((files: FileList | File[]) => {
    // Certains OS mobiles livrent un MIME vide : on se rabat sur l'extension.
    const isVideo = (f: File) =>
      f.type.startsWith("video/") ||
      (f.type === "" && /\.(mp4|mov|webm|m4v)$/i.test(f.name));
    const list = Array.from(files).filter(isVideo);
    if (list.length === 0) return;
    setClips((prev) => [
      ...prev,
      ...list.map((f) => ({
        id: makeId(),
        name: f.name,
        url: URL.createObjectURL(f),
      })),
    ]);
  }, []);

  const removeClip = useCallback((id: string) => {
    // Décharge le clip des slots AVANT de révoquer son URL.
    slotsRef.current?.forEach((s) => s.detachClip(id));
    setClipDurations((prev) => {
      if (!prev.has(id)) return prev;
      const m = new Map(prev);
      m.delete(id);
      return m;
    });
    setClips((prev) => {
      const found = prev.find((c) => c.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  const clearClips = useCallback(() => {
    slotsRef.current?.forEach((s) => s.reset());
    setClipDurations(new Map());
    setClips((prev) => {
      prev.forEach((c) => URL.revokeObjectURL(c.url));
      return [];
    });
  }, []);

  /** Remonté par les vignettes de la ClipTray (loadedmetadata). */
  const onClipMeta = useCallback((id: string, duration: number) => {
    setClipDurations((prev) => {
      if (prev.get(id) === duration) return prev;
      const m = new Map(prev);
      m.set(id, duration);
      return m;
    });
  }, []);

  /* ------------------- préparation / activation des slots ----------------- */
  const prepareNextAfter = useCallback((idx: number) => {
    const segs = segmentsRef.current;
    const nIdx = idx + 1;
    if (nIdx >= segs.length) return;
    const nSeg = segs[nIdx];
    const nClip = clipsRef.current[nSeg.sourceIndex];
    if (!nClip || !slotsRef.current) return;
    void slotsRef.current[1 - currentSlotIdxRef.current].prepare(
      nIdx,
      nSeg,
      nClip,
      0
    );
  }, []);

  /**
   * Fait pointer la lecture sur `segments[idx]`. Chemin chaud (boundary en
   * lecture) : l'autre slot est déjà prêt → échange instantané. Chemin froid
   * (seek, mapping changé, `force`) : re-prépare le slot courant à la bonne
   * position puis relance, et précharge le suivant.
   */
  const activateSegment = useCallback(
    (idx: number, force = false) => {
      const segs = segmentsRef.current;
      const audio = audioRef.current;
      const slots = slotsRef.current;
      if (!audio || !slots || idx < 0 || idx >= segs.length) return;
      const seg = segs[idx];
      const clip = clipsRef.current[seg.sourceIndex];
      if (!clip) return;

      const curIdx = currentSlotIdxRef.current;
      const cur = slots[curIdx];
      const other = slots[1 - curIdx];

      // Seek / mapping changé : un éventuel fondu en cours n'a plus de sens.
      if (force) fadeRef.current = null;

      // Chemin chaud : le suivant est prêt, on échange les rôles.
      if (!force && other.preparedSeg === idx) {
        const wantFade =
          seg.transition === "crossfade" &&
          playingRef.current &&
          !!cur.el &&
          cur.el.readyState >= 2;
        currentSlotIdxRef.current = 1 - curIdx;
        if (playingRef.current) other.el?.play().catch(() => {});
        if (wantFade) {
          // Fondu : l'ancien slot continue de jouer sous le nouveau ; il sera
          // mis en pause et re-préparé à la FIN du fondu (dans renderFrame).
          fadeRef.current = {
            fromSlot: curIdx,
            toIdx: idx,
            start: performance.now(),
          };
        } else {
          cur.el?.pause();
          prepareNextAfter(idx);
        }
        return;
      }

      // Reprise après pause au même segment : rien à re-seeker.
      if (!force && cur.preparedSeg === idx) {
        prepareNextAfter(idx);
        return;
      }

      // Chemin froid : synchronise le slot courant sur le temps audio exact.
      const offset = Math.max(0, audio.currentTime - seg.start);
      void cur.prepare(idx, seg, clip, offset).then((ok) => {
        if (!ok) return;
        if (playingRef.current && segIndexRef.current === idx) {
          cur.el?.play().catch(() => {});
        } else if (!playingRef.current) {
          renderFrameRef.current(); // rafraîchit la frame à l'arrêt
        }
      });
      other.el?.pause();
      prepareNextAfter(idx);
    },
    [prepareNextAfter]
  );

  /* ----------------------------- rendu RAF ------------------------------- */
  const renderFrame = useCallback(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const t = audio.currentTime;
    const dur = durationRef.current || audio.duration || 0;

    // Playhead + label : écriture DOM directe (pas de setState).
    if (playheadRef.current && dur > 0) {
      playheadRef.current.style.left = `${Math.min(100, (t / dur) * 100)}%`;
    }
    if (timeLabelRef.current) {
      timeLabelRef.current.textContent = formatTime(t, 1);
    }

    const cfg = effectsRef.current;
    const segs = segmentsRef.current;
    const idx = findSegmentIndex(segs, t, Math.max(0, segIndexRef.current));
    if (idx !== segIndexRef.current) {
      if (idx >= 0 && segIndexRef.current >= 0) {
        const prevZone = segs[segIndexRef.current]?.zone;
        const seg = segs[idx];
        // Voile de coupe seulement sur les coupes franches (pas sur un fondu).
        if (seg.transition !== "crossfade") {
          flashOpacityRef.current = cfg.cutFlash.opacity;
        }
        const fx = effectsForCut(prevZone, seg.zone, cfg);
        if (fx.punch > 0) punchZoomRef.current = fx.punch;
        if (fx.shakeMs > 0) shakeUntilRef.current = performance.now() + fx.shakeMs;
        if (fx.flash > 0) zoneFlashRef.current = fx.flash;
      }
      segIndexRef.current = idx;
      activateSegment(idx, false);
    }

    if (idx >= 0 && clipsRef.current.length > 0 && slotsRef.current) {
      const slots = slotsRef.current;
      const slot = slots[currentSlotIdxRef.current];
      const v = slot.el;
      const ready = !!v && slot.preparedSeg === idx && v.readyState >= 2;

      const fade = fadeRef.current;
      if (fade && fade.toIdx === idx) {
        const p = (performance.now() - fade.start) / cfg.crossfade.durationMs;
        if (p >= 1) {
          // Fin du fondu : on libère l'ancien slot et on précharge le suivant.
          slots[fade.fromSlot].el?.pause();
          fadeRef.current = null;
          prepareNextAfter(idx);
          if (ready) drawCover(ctx, v!, canvas.width, canvas.height);
        } else {
          // Alpha croisé : l'ancien plein dessous, le nouveau qui monte dessus.
          const from = slots[fade.fromSlot].el;
          let base = false;
          if (from && from.readyState >= 2) {
            base = drawCover(ctx, from, canvas.width, canvas.height);
          }
          if (ready) {
            ctx.globalAlpha = base ? Math.min(1, Math.max(0, p)) : 1;
            drawCover(ctx, v!, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
          }
        }
      } else {
        if (fade) {
          // Fondu orphelin (le playhead a quitté son segment) : clôture.
          if (fade.fromSlot !== currentSlotIdxRef.current) {
            slots[fade.fromSlot].el?.pause();
          }
          fadeRef.current = null;
        }
        if (ready) {
          // Micro-secousse : translation aléatoire décroissante. Couplée au
          // punch-in sur les coupes high, dont la marge couvre les bords.
          let dx = 0;
          let dy = 0;
          const shakeLeft = shakeUntilRef.current - performance.now();
          if (shakeLeft > 0) {
            const k = shakeLeft / cfg.shake.durationMs;
            dx = (Math.random() * 2 - 1) * cfg.shake.amplitudePx * k;
            dy = (Math.random() * 2 - 1) * cfg.shake.amplitudePx * k;
          }
          const zoom = 1 + punchZoomRef.current;
          if (dx !== 0 || dy !== 0) {
            ctx.save();
            ctx.translate(dx, dy);
            drawCover(ctx, v!, canvas.width, canvas.height, zoom);
            ctx.restore();
          } else {
            drawCover(ctx, v!, canvas.width, canvas.height, zoom);
          }
        }
        // Sinon : préparation en cours → on fige la dernière frame dessinée
        // plutôt que de flasher du noir.
      }

      // Flash blanc d'entrée en zone high (1-2 frames), par-dessus la frame.
      if (zoneFlashRef.current > 0.02) {
        ctx.fillStyle = `rgba(255,255,255,${zoneFlashRef.current.toFixed(3)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        zoneFlashRef.current *= cfg.zoneFlash.decay;
      } else {
        zoneFlashRef.current = 0;
      }
    } else {
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Décroissance du punch-in (frame-synced, ~1/3 s).
    punchZoomRef.current *= cfg.punchIn.decay;
    if (punchZoomRef.current < 0.002) punchZoomRef.current = 0;

    // Décroissance du voile de coupe (frame-synced).
    if (flashRef.current) {
      flashOpacityRef.current *= cfg.cutFlash.decay;
      if (flashOpacityRef.current < 0.01) flashOpacityRef.current = 0;
      flashRef.current.style.opacity = String(flashOpacityRef.current);
    }
  }, [activateSegment, prepareNextAfter]);

  useEffect(() => {
    renderFrameRef.current = renderFrame;
  }, [renderFrame]);

  /* ------------------------------ lecture -------------------------------- */
  const play = useCallback(async () => {
    const audio = audioRef.current;
    const slots = slotsRef.current;
    if (!audio || !slots || clipsRef.current.length === 0) return;

    // Fin de morceau : on repart du début.
    const dur = durationRef.current || audio.duration || 0;
    if (audio.ended || (dur > 0 && audio.currentTime >= dur - 0.05)) {
      audio.currentTime = 0;
    }

    const segs = segmentsRef.current;
    let idx = findSegmentIndex(segs, audio.currentTime, Math.max(0, segIndexRef.current));
    if (idx < 0 && segs.length > 0) idx = 0;
    segIndexRef.current = idx;

    // Prépare le slot courant AVANT de lancer l'audio : première frame synchro.
    if (idx >= 0) {
      const seg = segs[idx];
      const clip = clipsRef.current[seg.sourceIndex];
      const cur = slots[currentSlotIdxRef.current];
      if (clip && cur.preparedSeg !== idx) {
        await cur.prepare(idx, seg, clip, Math.max(0, audio.currentTime - seg.start));
      }
    }

    try {
      await audio.play();
    } catch {
      setError("Le navigateur a bloqué la lecture. Reclique sur Lecture.");
      return;
    }
    setError(null);
    playingRef.current = true;
    setIsPlaying(true);

    const cur = slots[currentSlotIdxRef.current];
    if (cur.preparedSeg === segIndexRef.current) {
      cur.el?.play().catch(() => {});
    }
    prepareNextAfter(segIndexRef.current);
    startLoop();
  }, [prepareNextAfter, startLoop]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void play();
    else stop();
  }, [play, stop]);

  const seekToRatio = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const dur = durationRef.current || audio.duration || 0;
      if (dur <= 0) return;
      audio.currentTime = Math.max(0, Math.min(1, ratio)) * dur;
      const idx = findSegmentIndex(segmentsRef.current, audio.currentTime, 0);
      segIndexRef.current = idx;
      if (idx >= 0) activateSegment(idx, true);
      if (!playingRef.current) renderFrame(); // playhead/label tout de suite
    },
    [activateSegment, renderFrame]
  );

  const onEnded = useCallback(() => {
    stop();
    const audio = audioRef.current;
    if (audio) audio.currentTime = 0;
    segIndexRef.current = segmentsRef.current.length > 0 ? 0 : -1;
    if (segIndexRef.current === 0) activateSegment(0, true);
    renderFrame();
  }, [stop, activateSegment, renderFrame]);

  /** Cale la lecture au début d'un segment (tap sur la timeline). */
  const seekToSegment = useCallback(
    (index: number) => {
      const audio = audioRef.current;
      const segs = segmentsRef.current;
      if (!audio || index < 0 || index >= segs.length) return;
      audio.currentTime = Math.min(segs[index].start + 0.001, segs[index].end);
      segIndexRef.current = index;
      activateSegment(index, true);
      renderFrame(); // playhead/label tout de suite (et frame quand prête)
    },
    [activateSegment, renderFrame]
  );

  /* ------------------------ overrides par segment ------------------------- */
  const setSegmentOverride = useCallback(
    (index: number, patch: SegmentOverride) => {
      setOverrides((prev) => {
        const m = new Map(prev);
        m.set(index, { ...prev.get(index), ...patch });
        return m;
      });
    },
    []
  );

  const clearSegmentOverride = useCallback((index: number) => {
    setOverrides((prev) => {
      if (!prev.has(index)) return prev;
      const m = new Map(prev);
      m.delete(index);
      return m;
    });
  }, []);

  /* ------------------------------- effets --------------------------------- */

  // Miroirs (déclarés avant les effets qui les consomment).
  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);
  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  // Re-pick des beats quand la sensibilité bouge (sans re-analyser l'enveloppe).
  useEffect(() => {
    if (!envelopeRef.current) return;
    const a = pickBeats(envelopeRef.current, { sensitivity });
    setAnalysis(a);
  }, [sensitivity]);

  // (Re)calcul des segments : EDL (fixe ou dynamique) → clips → inPoints →
  // annotation énergie/zone (exposée pour la couche apprentissage).
  useEffect(() => {
    if (!analysis) {
      setSegments([]);
      return;
    }
    const curve = curveRef.current;
    const edl =
      dynamicCut && curve
        ? buildDynamicEDL(analysis, curve, cutEvery)
        : buildEDL(analysis, cutEvery);
    const count = Math.max(1, clips.length);
    let segs: Segment[] = assignClipsToCuts(edl, count, analysis.duration);

    // assignClipsToCuts fait coupe i → segment i : on reporte la zone de la
    // coupe, et l'énergie moyenne du morceau sur l'intervalle du segment.
    segs = segs.map((s, i) => ({
      ...s,
      zone: edl.cuts[i]?.zone,
      energy: curve ? energyBetween(curve, s.start, s.end) : edl.cuts[i]?.energy,
    }));

    // Aucun beat : on montre quand même le 1er clip sur tout le morceau.
    if (segs.length === 0 && analysis.duration > 0) {
      segs = [
        {
          start: 0,
          end: analysis.duration,
          sourceIndex: 0,
          energy: curve ? energyBetween(curve, 0, analysis.duration) : undefined,
        },
      ];
    }
    // Couvre l'intro (avant le 1er beat) avec le premier segment.
    if (segs.length > 0 && segs[0].start > 0) {
      segs = [{ ...segs[0], start: 0 }, ...segs.slice(1)];
    }

    // En zone low, une coupe sur N devient un fondu enchaîné (présentation
    // uniquement — l'EDL ne change pas).
    segs = assignTransitions(segs, effectsRef.current.crossfade.everyNth);

    // Overrides par segment : valables tant que la structure (les temps de
    // coupe) est identique. Structure changée → retouches caduques.
    const sig = structureSignature(segs);
    if (sig !== structureSigRef.current) {
      structureSigRef.current = sig;
      if (overrides.size > 0) {
        setOverrides(new Map());
        return; // l'effet re-tourne aussitôt avec la map vide
      }
    }

    // Clip imposé AVANT computeInPoints (le point d'entrée calculé doit
    // correspondre au bon clip), point d'entrée imposé APRÈS.
    segs = applyClipOverrides(segs, overrides, clips.length);
    const durs = clips.map((c) => clipDurations.get(c.id));
    segs = computeInPoints(segs, durs, analysis.duration);
    segs = applyInPointOverrides(segs, overrides);
    setSegments(segs);
  }, [analysis, cutEvery, dynamicCut, clips, clipDurations, overrides]);

  // Nouveau mapping segments/clips : tout ce qui est préparé est caduc.
  // On re-prépare à la position courante (et on redessine si à l'arrêt).
  useEffect(() => {
    segmentsRef.current = segments;
    slotsRef.current?.forEach((s) => s.invalidate());
    const audio = audioRef.current;
    const idx =
      segments.length > 0
        ? findSegmentIndex(segments, audio?.currentTime ?? 0, 0)
        : -1;
    segIndexRef.current = idx;
    if (idx >= 0) activateSegment(idx, true);
    else if (!playingRef.current) renderFrameRef.current();
  }, [segments, activateSegment]);

  /* ----------------------------- nettoyage ------------------------------- */
  useEffect(() => {
    return () => {
      stopLoop();
      slotsRef.current?.forEach((s) => s.reset());
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
      clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url));
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------- dérivés --------------------------------- */
  const bpm = analysis?.bpm ? Math.round(analysis.bpm) : 0;
  const beatCount = analysis?.beats.length ?? 0;
  const cutCount = segments.length;

  return {
    // refs DOM
    audioRef,
    canvasRef,
    playheadRef,
    timeLabelRef,
    flashRef,
    slotARef,
    slotBRef,
    onClipMeta,
    renderSize: { width: RENDER_W, height: RENDER_H },

    // état
    status,
    error,
    audioMeta,
    audioUrl,
    clips,
    clipDurations,
    analysis,
    segments,
    overrides,
    sensitivity,
    cutEvery,
    dynamicCut,
    isPlaying,

    // dérivés
    bpm,
    beatCount,
    cutCount,

    // actions
    loadAudio,
    addClips,
    removeClip,
    clearClips,
    setSensitivity,
    setCutEvery,
    setDynamicCut,
    togglePlay,
    seekToRatio,
    seekToSegment,
    setSegmentOverride,
    clearSegmentOverride,
    onEnded,
  };
}
