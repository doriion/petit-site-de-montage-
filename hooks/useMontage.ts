"use client";

/**
 * useMontage
 * ----------------------------------------------------------------------------
 * Tout l'état + la boucle de rendu de la preview, dans un seul hook. Le moteur
 * (`montage-engine.ts`) reste pur ; ici on branche le DOM : décodage, analyse,
 * lecture audio comme horloge maître, et compositing des clips sur un <canvas>
 * qui « coupe » sur les beats.
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
  buildEDL,
  decodeAudio,
  pickBeats,
  type BeatAnalysis,
  type Envelope,
} from "@/lib/montage-engine";
import {
  drawCover,
  findSegmentIndex,
  formatTime,
  type Clip,
  type Segment,
} from "@/lib/preview";

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
  const [analysis, setAnalysis] = useState<BeatAnalysis | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [sensitivity, setSensitivity] = useState(1.45);
  const [cutEvery, setCutEvery] = useState(2);
  const [isPlaying, setIsPlaying] = useState(false);

  /* --------------------------------- refs -------------------------------- */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const envelopeRef = useRef<Envelope | null>(null);
  const videoMap = useRef<Map<string, HTMLVideoElement>>(new Map());

  // Miroirs des états lus dans la boucle RAF (évite de relancer la boucle).
  const segmentsRef = useRef<Segment[]>([]);
  const clipsRef = useRef<Clip[]>([]);
  const durationRef = useRef(0);
  const segIndexRef = useRef(-1);
  const flashOpacityRef = useRef(0);
  const rafRef = useRef(0);
  const playingRef = useRef(false);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);
  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

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

  /* ----------------------------- chargement ------------------------------ */
  const loadAudio = useCallback(
    async (file: File) => {
      setError(null);
      setStatus("analyzing");
      setIsPlaying(false);
      playingRef.current = false;
      try {
        const buf = await file.arrayBuffer();
        const audioBuffer = await decodeAudio(buf, getAudioCtx());
        const env = analyzeEnvelope(audioBuffer);
        envelopeRef.current = env;
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
    [getAudioCtx, sensitivity]
  );

  // Re-pick des beats quand la sensibilité bouge (sans re-analyser l'enveloppe).
  useEffect(() => {
    if (!envelopeRef.current) return;
    const a = pickBeats(envelopeRef.current, { sensitivity });
    setAnalysis(a);
  }, [sensitivity]);

  /* ------------------------------- clips --------------------------------- */
  const addClips = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("video/"));
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
    setClips((prev) => {
      const found = prev.find((c) => c.id === id);
      if (found) URL.revokeObjectURL(found.url);
      videoMap.current.delete(id);
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  const clearClips = useCallback(() => {
    setClips((prev) => {
      prev.forEach((c) => URL.revokeObjectURL(c.url));
      return [];
    });
    videoMap.current.clear();
  }, []);

  const registerVideo = useCallback(
    (id: string, el: HTMLVideoElement | null) => {
      if (el) videoMap.current.set(id, el);
      else videoMap.current.delete(id);
    },
    []
  );

  /* ----------------------- (re)calcul des segments ----------------------- */
  useEffect(() => {
    if (!analysis) {
      setSegments([]);
      return;
    }
    const edl = buildEDL(analysis, cutEvery);
    const count = Math.max(1, clips.length);
    let segs = assignClipsToCuts(edl, count, analysis.duration);

    // Aucun beat : on montre quand même le 1er clip sur tout le morceau.
    if (segs.length === 0 && analysis.duration > 0) {
      segs = [{ start: 0, end: analysis.duration, sourceIndex: 0 }];
    }
    // Couvre l'intro (avant le 1er beat) avec le premier segment.
    if (segs.length > 0 && segs[0].start > 0) {
      segs = [{ ...segs[0], start: 0 }, ...segs.slice(1)];
    }
    setSegments(segs);
  }, [analysis, cutEvery, clips.length]);

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

    const segs = segmentsRef.current;
    const idx = findSegmentIndex(segs, t, segIndexRef.current);
    if (idx !== segIndexRef.current && idx >= 0) {
      flashOpacityRef.current = 0.85; // coupe → flash
    }
    segIndexRef.current = idx;

    let drew = false;
    if (idx >= 0) {
      const clip = clipsRef.current[segs[idx].sourceIndex];
      const v = clip ? videoMap.current.get(clip.id) : undefined;
      if (v && v.readyState >= 2) {
        drew = drawCover(ctx, v, canvas.width, canvas.height);
      }
    }
    if (!drew) {
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Décroissance du flash (frame-synced).
    if (flashRef.current) {
      flashOpacityRef.current *= 0.82;
      if (flashOpacityRef.current < 0.01) flashOpacityRef.current = 0;
      flashRef.current.style.opacity = String(flashOpacityRef.current);
    }
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    const tick = () => {
      renderFrame();
      if (playingRef.current) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [renderFrame, stopLoop]);

  /* ------------------------------ lecture -------------------------------- */
  const pauseVideos = useCallback(() => {
    clipsRef.current.forEach((c) => {
      const v = videoMap.current.get(c.id);
      if (v) v.pause();
    });
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.pause();
    pauseVideos();
    playingRef.current = false;
    stopLoop();
    setIsPlaying(false);
  }, [pauseVideos, stopLoop]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    // Lance toutes les vidéos en muet pour qu'elles défilent → coupe instantanée.
    clipsRef.current.forEach((c) => {
      const v = videoMap.current.get(c.id);
      if (v) {
        v.muted = true;
        v.play().catch(() => {});
      }
    });
    try {
      await audio.play();
    } catch {
      setError("Le navigateur a bloqué la lecture. Reclique sur Lecture.");
      return;
    }
    playingRef.current = true;
    setIsPlaying(true);
    startLoop();
  }, [startLoop]);

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
      segIndexRef.current = findSegmentIndex(segmentsRef.current, audio.currentTime, 0);
      if (!playingRef.current) renderFrame(); // refresh à l'arrêt
    },
    [renderFrame]
  );

  const onEnded = useCallback(() => {
    stop();
  }, [stop]);

  // Rafraîchit une frame à l'arrêt quand le montage change (slider, clips…).
  useEffect(() => {
    if (!playingRef.current) renderFrame();
  }, [segments, clips, renderFrame]);

  /* ----------------------------- nettoyage ------------------------------- */
  useEffect(() => {
    return () => {
      stopLoop();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Révoque les object URLs des clips encore présents au démontage.
  useEffect(() => {
    return () => {
      clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url));
    };
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
    registerVideo,
    renderSize: { width: RENDER_W, height: RENDER_H },

    // état
    status,
    error,
    audioMeta,
    audioUrl,
    clips,
    analysis,
    segments,
    sensitivity,
    cutEvery,
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
    togglePlay,
    seekToRatio,
    onEnded,
  };
}
