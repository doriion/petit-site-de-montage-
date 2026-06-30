"use client";

import { useCallback, type RefObject } from "react";
import type { BeatAnalysis } from "@/lib/montage-engine";
import { formatTime, type Segment } from "@/lib/preview";

interface StageProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  flashRef: RefObject<HTMLDivElement | null>;
  playheadRef: RefObject<HTMLDivElement | null>;
  timeLabelRef: RefObject<HTMLSpanElement | null>;
  renderSize: { width: number; height: number };
  analysis: BeatAnalysis | null;
  segments: Segment[];
  isPlaying: boolean;
  ready: boolean;
  hasClips: boolean;
  onTogglePlay: () => void;
  onSeekRatio: (r: number) => void;
}

export default function Stage({
  canvasRef,
  flashRef,
  playheadRef,
  timeLabelRef,
  renderSize,
  analysis,
  segments,
  isPlaying,
  ready,
  hasClips,
  onTogglePlay,
  onSeekRatio,
}: StageProps) {
  const duration = analysis?.duration ?? 0;

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      onSeekRatio((e.clientX - rect.left) / rect.width);
    },
    [onSeekRatio]
  );

  return (
    <div className="space-y-3">
      {/* Cadre 16:9 */}
      <div className="relative w-full overflow-hidden rounded-2xl border border-ink-600 bg-black shadow-2xl">
        <canvas
          ref={canvasRef}
          width={renderSize.width}
          height={renderSize.height}
          className="block aspect-video w-full"
        />

        {/* Flash de coupe */}
        <div
          ref={flashRef}
          style={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0 bg-white mix-blend-overlay"
        />

        {/* Overlay « prêt à lire » */}
        {!isPlaying && (
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!ready || !hasClips}
            className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/10 disabled:cursor-not-allowed"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-2xl text-ink-900 shadow-lg transition-transform hover:scale-105">
              ▶
            </span>
          </button>
        )}

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
            La preview apparaîtra ici
          </div>
        )}
        {ready && !hasClips && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-zinc-300">
            Ajoute des clips vidéo pour lancer la preview
          </div>
        )}
      </div>

      {/* Transport */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={!ready || !hasClips}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg text-ink-900 transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={isPlaying ? "Pause" : "Lecture"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>

        {/* Timeline */}
        <div
          onClick={ready ? handleSeek : undefined}
          className={`relative h-10 flex-1 overflow-hidden rounded-lg border border-ink-600 bg-ink-800 ${
            ready ? "cursor-pointer" : "opacity-50"
          }`}
        >
          {/* beats */}
          {duration > 0 &&
            analysis?.beats.map((t, i) => (
              <span
                key={`b${i}`}
                className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-zinc-600"
                style={{ left: `${(t / duration) * 100}%` }}
              />
            ))}
          {/* coupes */}
          {duration > 0 &&
            segments.map((s, i) => (
              <span
                key={`c${i}`}
                className="absolute top-0 h-full w-px bg-beat/60"
                style={{ left: `${(s.start / duration) * 100}%` }}
              />
            ))}
          {/* playhead */}
          <div
            ref={playheadRef}
            style={{ left: "0%" }}
            className="absolute top-0 z-10 h-full w-0.5 bg-accent shadow-[0_0_8px] shadow-accent"
          />
        </div>

        <div className="shrink-0 font-mono text-xs text-zinc-400">
          <span ref={timeLabelRef}>0:00.0</span>
          <span className="text-zinc-600"> / {formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
