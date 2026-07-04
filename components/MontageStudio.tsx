"use client";

import { useEffect, useState } from "react";
import { useMontage } from "@/hooks/useMontage";
import Dropzone from "@/components/Dropzone";
import ClipTray from "@/components/ClipTray";
import Controls from "@/components/Controls";
import Stage from "@/components/Stage";
import Timeline from "@/components/Timeline";
import SegmentInspector from "@/components/SegmentInspector";

export default function MontageStudio() {
  const m = useMontage();
  const ready = m.status === "ready" && !!m.audioUrl;

  // Segment inspecté (tap sur la timeline). Fermé si la structure change.
  const [selectedSeg, setSelectedSeg] = useState<number | null>(null);
  useEffect(() => {
    if (selectedSeg !== null && selectedSeg >= m.segments.length) {
      setSelectedSeg(null);
    }
  }, [m.segments.length, selectedSeg]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ----------------------------- Scène ----------------------------- */}
      <section className="order-2 min-w-0 lg:order-1">
        <Stage
          canvasRef={m.canvasRef}
          flashRef={m.flashRef}
          playheadRef={m.playheadRef}
          timeLabelRef={m.timeLabelRef}
          renderSize={m.renderSize}
          analysis={m.analysis}
          segments={m.segments}
          isPlaying={m.isPlaying}
          ready={ready}
          hasClips={m.clips.length > 0}
          onTogglePlay={m.togglePlay}
          onSeekRatio={m.seekToRatio}
        />

        {/* Élément audio = horloge maître (caché, on pilote via le canvas). */}
        {m.audioUrl && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio
            ref={m.audioRef}
            src={m.audioUrl}
            onEnded={m.onEnded}
            className="hidden"
          />
        )}

        {/* Les deux slots de lecture (double-buffer) : sources du canvas.
            Quasi invisibles mais « rendus » (pas display:none, que Safari
            peut refuser de décoder). Jamais plus de 2 vidéos actives. */}
        <video
          ref={m.slotARef}
          muted
          playsInline
          loop
          preload="auto"
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none fixed bottom-0 right-0 h-px w-px opacity-0"
        />
        <video
          ref={m.slotBRef}
          muted
          playsInline
          loop
          preload="auto"
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none fixed bottom-0 right-0 h-px w-px opacity-0"
        />

        {m.audioMeta && (
          <p className="mt-3 truncate text-xs text-zinc-500">
            🎵 {m.audioMeta.name}
          </p>
        )}

        {/* Timeline interactive (blocs par segment) + panneau d'inspection */}
        {ready && m.segments.length > 0 && (
          <div className="mt-4">
            <Timeline
              segments={m.segments}
              selected={selectedSeg}
              overriddenIndices={new Set(m.overrides.keys())}
              audioRef={m.audioRef}
              isPlaying={m.isPlaying}
              onSelect={(i) => {
                m.seekToSegment(i);
                setSelectedSeg(i);
              }}
            />
            {selectedSeg !== null && m.segments[selectedSeg] && (
              <SegmentInspector
                index={selectedSeg}
                segment={m.segments[selectedSeg]}
                prevZone={
                  selectedSeg > 0 ? m.segments[selectedSeg - 1].zone : undefined
                }
                clips={m.clips}
                clipDurations={m.clipDurations}
                baseCutEvery={m.cutEvery}
                dynamic={m.dynamicCut}
                overridden={m.overrides.has(selectedSeg)}
                onChangeClip={(si) =>
                  m.setSegmentOverride(selectedSeg, { sourceIndex: si })
                }
                onChangeInPoint={(v) =>
                  m.setSegmentOverride(selectedSeg, { inPoint: v })
                }
                onResetOverride={() => m.clearSegmentOverride(selectedSeg)}
                onClose={() => setSelectedSeg(null)}
              />
            )}
          </div>
        )}
      </section>

      {/* --------------------------- Panneau ----------------------------- */}
      <aside className="order-1 min-w-0 space-y-6 lg:order-2">
        {/* Audio */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            1 · La musique
          </h2>
          <Dropzone
            accept="audio/*,.mp3,.wav,.m4a,.aac"
            onFiles={(files) => {
              const f = Array.from(files)[0];
              if (f) void m.loadAudio(f);
            }}
            title={m.audioMeta ? "Changer de musique" : "Importer un morceau"}
            hint="MP3, WAV, M4A — glisser-déposer ou cliquer"
            icon="♫"
          />
          {m.status === "analyzing" && (
            <p className="flex items-center gap-2 text-xs text-accent">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              Analyse des beats…
            </p>
          )}
          {m.error && <p className="text-xs text-beat">{m.error}</p>}
        </div>

        {/* Clips */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            2 · Les clips
          </h2>
          <Dropzone
            accept="video/*,.mp4,.mov,.webm"
            multiple
            onFiles={m.addClips}
            title="Ajouter des clips"
            hint="Plusieurs fichiers vidéo — ils défilent en rythme"
            icon="🎞"
          />
          <ClipTray
            clips={m.clips}
            onMeta={m.onClipMeta}
            onRemove={m.removeClip}
            onClear={m.clearClips}
          />
        </div>

        {/* Réglages */}
        {ready && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              3 · Le montage
            </h2>
            <Controls
              sensitivity={m.sensitivity}
              cutEvery={m.cutEvery}
              dynamicCut={m.dynamicCut}
              onSensitivity={m.setSensitivity}
              onCutEvery={m.setCutEvery}
              onDynamicCut={m.setDynamicCut}
              bpm={m.bpm}
              beatCount={m.beatCount}
              cutCount={m.cutCount}
              disabled={!ready}
            />
          </div>
        )}
      </aside>
    </div>
  );
}
