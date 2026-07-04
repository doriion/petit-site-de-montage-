"use client";

/**
 * useDemo — mode démo instantané.
 * Disponibilité vérifiée en silence au chargement (manifeste + fichier audio
 * réellement présent, sinon le bouton n'apparaît jamais). Au clic : fetch des
 * fichiers, injection dans le pipeline d'upload STANDARD (addClips/loadAudio,
 * aucune branche spéciale), puis lecture automatique dès que l'analyse est
 * prête. Tout reste remplaçable ensuite comme un import utilisateur normal.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAsFile, parseDemoManifest, type DemoManifest } from "@/lib/demo";

interface MontageForDemo {
  status: string;
  audioUrl: string | null;
  isPlaying: boolean;
  clipsCount: number;
  addClips: (files: File[]) => void;
  loadAudio: (file: File) => Promise<void>;
  togglePlay: () => void;
}

export function useDemo(m: MontageForDemo) {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pendingPlay, setPendingPlay] = useState(false);
  const manifestRef = useRef<DemoManifest | null>(null);

  // Fichiers de démo présents ? (404 → on ne montre rien, silencieusement.)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/demo/demo.json");
        if (!res.ok) return;
        const manifest = parseDemoManifest(await res.json());
        if (!manifest) return;
        const head = await fetch(manifest.audio, { method: "HEAD" });
        if (!head.ok) return;
        if (alive) {
          manifestRef.current = manifest;
          setAvailable(true);
        }
      } catch {
        /* pas de démo : bouton caché */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const startDemo = useCallback(async () => {
    const manifest = manifestRef.current;
    if (!manifest || loading) return;
    setLoading(true);
    try {
      const [audioFile, ...clipFiles] = await Promise.all([
        fetchAsFile(manifest.audio),
        ...manifest.clips.map((c) => fetchAsFile(c)),
      ]);
      // Pipeline standard, exactement comme un upload utilisateur.
      m.addClips(clipFiles);
      setPendingPlay(true);
      await m.loadAudio(audioFile);
      setLoaded(true);
    } catch {
      // Fichier manquant/corrompu : on disparaît sans bruit.
      setAvailable(false);
      setPendingPlay(false);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, m.addClips, m.loadAudio]);

  // Lecture automatique dès que l'analyse est prête (l'élément audio est
  // monté après le commit → on passe par un effet, pas par le handler).
  useEffect(() => {
    if (!pendingPlay) return;
    if (m.status === "ready" && m.audioUrl && m.clipsCount > 0 && !m.isPlaying) {
      setPendingPlay(false);
      m.togglePlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlay, m.status, m.audioUrl, m.clipsCount, m.isPlaying, m.togglePlay]);

  return { demoAvailable: available, demoLoading: loading, demoLoaded: loaded, startDemo };
}
